"""Visible Windows MCP server with persistent Tailscale Funnel connectivity."""
from __future__ import annotations

import ctypes
import hmac
import http.client
import json
import os
import queue
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tkinter import Tk, StringVar, Text, ttk, filedialog
from urllib.parse import urlsplit, quote

from pc_mcp_bridge import HANDLERS, TOOLS, result_text
from rea_gateway import REAGateway, REA_TOOLS
from bridge_oauth import OAuthProvider
from roblox_gateway import RobloxGateway, ROBLOX_TOOLS
from workspace_tools import WorkspaceTools, WORKSPACE_TOOLS
from library_tools import LibraryTools, LIBRARY_TOOLS
from brickwire_tools import BrickwireTools, BRICKWIRE_TOOLS
from screen_tools import capture_schema, SCREEN_TOOLS
from secure_state import SecureState
from design_tools import DesignTools, DESIGN_TOOLS
from brickwire_runtime import BrickwireRuntime, RUNTIME_TOOLS
from auto_update import AutoUpdater
from ultracode_tools import UltraCodeTools, ULTRACODE_TOOLS
from roblox_rules import SERVER_INSTRUCTIONS, RobloxContext
from builder_tools import BuilderTools, BUILDER_TOOLS, CONTEXT_TOOL
import tailscale_gateway

VERSION = "5.6.0"
PROTOCOLS = ("2025-03-26", "2025-06-18", "2025-11-25")
BRIDGE_TOOLS = [tool if tool["name"] != "screen_capture" else capture_schema() for tool in TOOLS] + REA_TOOLS + WORKSPACE_TOOLS + ROBLOX_TOOLS + SCREEN_TOOLS + LIBRARY_TOOLS + BRICKWIRE_TOOLS + DESIGN_TOOLS + RUNTIME_TOOLS + BUILDER_TOOLS + [CONTEXT_TOOL] + ULTRACODE_TOOLS


class Bridge:
    def __init__(self, data_dir=None, persistent=None, listen_port=None):
        self.workspace = WorkspaceTools(data_dir)
        self.persistent = data_dir is None if persistent is None else persistent
        self.listen_port = listen_port
        self.store = SecureState(self.workspace.data_dir) if self.persistent else None
        self.token = self.store.get('token') if self.store else None
        if not self.token:
            self.token = secrets.token_urlsafe(32)
            if self.store:
                self.store.set('token', self.token)
        self.events = queue.Queue()
        self.stopped = threading.Event()
        self.server = None
        self.process = None
        self.public_url = ""
        self.local_url = ""
        self.lifecycle = threading.Lock()
        self.slots = threading.BoundedSemaphore(8)
        self.worker = None
        self.rea = REAGateway(self.emit)
        self.ready = threading.Event()
        self.oauth = OAuthProvider(self)
        self.libraries = LibraryTools(self.workspace)
        self.brickwire = BrickwireTools(self.libraries)
        self.roblox = RobloxGateway(self.emit)
        self.design = DesignTools(self.workspace)
        self.runtime = BrickwireRuntime(self.libraries, self.roblox)
        self.builders = BuilderTools(self.roblox)
        self.context = RobloxContext(self.workspace, self.libraries, self.design)
        self.ultracode = UltraCodeTools(self.libraries)
        self.roblox.capture_dir = self.workspace.data_dir / "captures"

    def emit(self, kind, text):
        self.events.put((kind, text))

    def dispatch(self, req):
        if not isinstance(req, dict) or req.get("jsonrpc") != "2.0":
            return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid Request"}}
        if "id" not in req:
            return None
        ident, method = req["id"], req.get("method")
        params = req.get("params", {})
        if not isinstance(params, dict):
            return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32602, "message": "Invalid params"}}
        if method == "initialize":
            version = params.get("protocolVersion")
            value = {"protocolVersion": version if version in PROTOCOLS else PROTOCOLS[-1],
                     "capabilities": {"tools": {"listChanged": False}},
                     "serverInfo": {"name": "PC MCP Bridge", "version": VERSION},
                     "instructions": SERVER_INSTRUCTIONS}
        elif method == "ping":
            value = {}
        elif method == "tools/list":
            value = {"tools": BRIDGE_TOOLS}
        elif method == "tools/call":
            name = params.get("name")
            args = params.get("arguments", {})
            handlers = {**HANDLERS, **self.workspace.handlers(), **self.libraries.handlers(), **self.brickwire.handlers(), **self.design.handlers(), **self.runtime.handlers(), **self.builders.handlers(), **self.ultracode.handlers(), "roblox_context": self.context.get, "capture_get": self.roblox.capture_get, "screen_capture": self.roblox.capture, "screen_windows": self.roblox.studios,
                        "rea_status": self.rea.status, "rea_list_tools": self.rea.list_tools, "rea_call_tool": self.rea.call,
                        "roblox_status": self.roblox.status, "roblox_studios": self.roblox.studios, "roblox_state": self.roblox.state,
                        "roblox_list_tools": self.roblox.list_tools, "roblox_call_tool": self.roblox.call}
            if not isinstance(name, str) or name not in handlers or not isinstance(args, dict):
                return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32602, "message": "Unknown tool or invalid arguments"}}
            self.emit("log", f"Tool requested: {name}")
            if self.stopped.is_set():
                value = result_text("Bridge has stopped.", is_error=True)
            else:
                try:
                    output = handlers[name](args)
                    if name in {"rea_call_tool", "roblox_call_tool", "roblox_studios", "roblox_state", "library_read", "brickwire_execute", "screen_capture", "capture_get", "screen_windows", "run_builder", "model_summary", "model_check"}:
                        value = output
                    else:
                        value = result_text(output)
                    self.emit("log", f"Tool completed: {name}")
                except Exception as exc:
                    value = result_text(str(exc), is_error=True)
                    self.emit("log", f"Tool failed: {name}: {type(exc).__name__}")
        else:
            return {"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": "Method not found"}}
        return {"jsonrpc": "2.0", "id": ident, "result": value}

    def start_local(self):
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "PC-MCP-Bridge/3"

            def parse_request(self):
                if not super().parse_request():
                    return False
                if self.path.startswith(tailscale_gateway.PREFIX + '/'):
                    self.path = self.path[len(tailscale_gateway.PREFIX):]
                return True

            def setup(self):
                super().setup()
                self.connection.settimeout(15)

            def log_message(self, *_):
                pass  # Never log authentication headers or request bodies.

            def respond(self, status, body=None, **headers):
                raw = b"" if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "no-store")
                for key, value in headers.items():
                    self.send_header(key.replace("_", "-"), value)
                self.end_headers()
                if raw:
                    self.wfile.write(raw)

            def authorized(self):
                if bridge.stopped.is_set():
                    self.respond(503, {"error": "Bridge stopped"})
                    return False
                if self.path.rstrip("/") != "/mcp":
                    self.respond(404, {"error": "Use /mcp"})
                    return False
                auth = self.headers.get("Authorization", "")
                token = auth[7:] if auth.lower().startswith("bearer ") else ""
                if not token or not (hmac.compare_digest(token.encode(), bridge.token.encode()) or bridge.oauth.valid_token(token)):
                    metadata_url = bridge.oauth.issuer + "/.well-known/oauth-protected-resource/mcp"
                    self.respond(401, {"error": "Bearer token required"}, WWW_Authenticate=f'Bearer resource_metadata="{metadata_url}", scope="pc:full"')
                    return False
                origin = self.headers.get("Origin")
                allowed = {urlsplit(url).scheme + '://' + urlsplit(url).netloc for url in (bridge.local_url, bridge.public_url) if url}
                if origin and origin not in allowed:
                    self.respond(403, {"error": "Origin not allowed"})
                    return False
                version = self.headers.get("MCP-Protocol-Version")
                if version and version not in PROTOCOLS:
                    self.respond(400, {"error": "Unsupported MCP protocol version"})
                    return False
                return True

            def do_POST(self):
                if bridge.oauth.route(self):
                    return
                if not self.authorized():
                    return
                if self.headers.get_content_type() != "application/json":
                    self.respond(415, {"error": "Use application/json"})
                    return
                if not bridge.slots.acquire(blocking=False):
                    self.respond(429, {"error": "Too many requests"})
                    return
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if length <= 0 or length > 8 * 1024 * 1024:
                        self.respond(413, {"error": "Invalid request size"})
                        return
                    try:
                        request = json.loads(self.rfile.read(length))
                    except (ValueError, UnicodeError):
                        self.respond(400, {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
                        return
                    response = bridge.dispatch(request)
                    self.respond(202 if response is None else 200, response)
                except (ValueError, TimeoutError):
                    self.respond(400, {"error": "Invalid request"})
                finally:
                    bridge.slots.release()

            def do_GET(self):
                if bridge.oauth.route(self):
                    return
                if self.authorized():
                    self.respond(405, {"error": "Use HTTP POST for MCP requests"}, Allow="POST")

            def do_DELETE(self):
                if self.authorized():
                    self.respond(405, {"error": "This server is stateless"}, Allow="POST")

            def send_html(self, page, callback=None):
                raw = page.encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Frame-Options", "DENY")
                self.send_header("Referrer-Policy", "same-origin")
                form_targets = "'self'"
                if callback:
                    parsed = urlsplit(callback)
                    # Only the exact registered OAuth callback origin may follow the POST redirect.
                    form_targets += " " + quote(f"{parsed.scheme}://{parsed.netloc}", safe=":/[]-.")
                self.send_header("Content-Security-Policy", f"default-src 'none'; style-src 'unsafe-inline'; form-action {form_targets}; frame-ancestors 'none'; base-uri 'none'")
                self.end_headers()
                self.wfile.write(raw)

            def do_OPTIONS(self):
                self.respond(204, None, Access_Control_Allow_Origin="*", Access_Control_Allow_Methods="GET, POST, OPTIONS",
                             Access_Control_Allow_Headers="Content-Type, Authorization, MCP-Protocol-Version, Accept")

        with self.lifecycle:
            if self.stopped.is_set():
                return
            port = self.listen_port if self.listen_port is not None else (tailscale_gateway.LOCAL_PORT if self.persistent else 0)
            self.server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
            self.server.daemon_threads = True
            self.local_url = f"http://127.0.0.1:{self.server.server_port}/mcp"
            threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.emit("local", self.local_url)
        self.emit("log", "Local MCP server started. OAuth with PKCE and manual Bearer authentication are available.")

    @staticmethod
    def tunnel_binary():
        return tailscale_gateway.binary()

    def start(self):
        self.worker = threading.Thread(target=self._run, name="bridge-start", daemon=True)
        self.worker.start()

    def _run(self):
        try:
            self.emit("status", "Starting local server...")
            self.start_local()
            if self.stopped.is_set():
                return
            last_error = None
            while not self.stopped.is_set():
                try:
                    public = tailscale_gateway.ensure(self.local_url.removesuffix('/mcp'))
                    if self.stopped.is_set():
                        return
                    self.public_url = public
                    self.ready.set()
                    self.emit('url', public)
                    self.emit('status', 'Online via Tailscale - full PC access enabled')
                    last_error = None
                    if self.stopped.wait(30):
                        return
                except (OSError, ValueError, RuntimeError, subprocess.TimeoutExpired) as exc:
                    self.ready.clear()
                    self.emit('status', 'Waiting for Tailscale / network...')
                    if str(exc) != last_error:
                        self.emit('log', str(exc))
                        last_error = str(exc)
                    if self.stopped.wait(10):
                        return
        except Exception as exc:
            self.emit("log", str(exc))
            self.emit("error", str(exc))
            self.stop()

    def stop(self):
        self.stopped.set()  # Reject new calls immediately, including on existing connections.
        if not self.persistent:
            self.oauth.revoke_all()
        with self.lifecycle:
            proc, server = self.process, self.server
            self.server = None
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        if server:
            server.shutdown()
            server.server_close()
        self.rea.stop()
        self.roblox.stop()


class App:
    def __init__(self, auto_start=True):
        self.root = Tk()
        self.root.title(f"PC MCP Bridge {VERSION} - Roblox")
        self.root.geometry("900x660")
        self.root.minsize(800, 580)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.bridge = None
        self.updater = None
        self.url = StringVar(value="Starting...")
        self.token = StringVar()
        self.status = StringVar(value="Stopped")
        self.local = StringVar(value="")
        frame = ttk.Frame(self.root, padding=20)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text="PC MCP Bridge", font=("Segoe UI", 20, "bold")).pack(anchor="w")
        ttk.Label(frame, text="Roblox Studio | Persistent project memory | Codebase search | Screenshots | REA", wraplength=840).pack(anchor="w", pady=(4, 18))
        form = ttk.Frame(frame)
        form.pack(fill="x")
        form.columnconfigure(0, weight=1)
        ttk.Label(form, text="Public MCP URL").grid(row=0, column=0, sticky="w")
        ttk.Entry(form, textvariable=self.url, state="readonly").grid(row=1, column=0, sticky="ew", pady=(5, 14))
        ttk.Button(form, text="Copy URL", command=lambda: self.copy(self.bridge.public_url if self.bridge else "")).grid(row=1, column=1, padx=(10, 0), pady=(5, 14))
        ttk.Label(form, text="Connection key / manual Bearer token").grid(row=2, column=0, sticky="w")
        self.token_entry = ttk.Entry(form, textvariable=self.token, state="readonly", show="\u2022")
        self.token_entry.grid(row=3, column=0, sticky="ew", pady=(5, 8))
        ttk.Button(form, text="Copy key", command=lambda: self.copy(self.token.get())).grid(row=3, column=1, padx=(10, 0), pady=(5, 8))
        ttk.Button(form, text="Show / hide key", command=self.toggle_token).grid(row=4, column=0, sticky="w")
        ttk.Button(form, text="Copy Codex config", command=self.copy_codex_config).grid(row=4, column=1, padx=(10, 0))
        ttk.Label(frame, text="ChatGPT: choose OAuth, then paste this key on the bridge approval page.", wraplength=750).pack(anchor="w", pady=(14, 6))
        ttk.Label(frame, text="Anyone with both values can control this PC with your Windows account's permissions.", foreground="#9b2c2c", wraplength=730).pack(anchor="w", pady=(0, 14))
        controls = ttk.Frame(frame)
        controls.pack(fill="x")
        self.start_button = ttk.Button(controls, text="Start", command=self.start)
        self.start_button.pack(side="left")
        self.stop_button = ttk.Button(controls, text="Stop", command=self.stop, state="disabled")
        self.stop_button.pack(side="left", padx=8)
        ttk.Button(controls, text="Revoke OAuth access", command=self.revoke_oauth).pack(side="left", padx=4)
        ttk.Button(controls, text="Add library folder", command=self.add_library).pack(side="left", padx=4)
        ttk.Button(controls, text="Rotate key", command=self.rotate_key).pack(side="left", padx=4)
        ttk.Label(controls, textvariable=self.status, font=("Segoe UI", 9, "bold")).pack(side="left", padx=8)
        ttk.Label(frame, textvariable=self.local, foreground="#555555").pack(anchor="w", pady=(10, 4))
        ttk.Label(frame, text="Memory: " + str(WorkspaceTools().db_path), foreground="#555555", wraplength=840).pack(anchor="w", pady=(0, 5))
        self.log = Text(frame, height=12, state="disabled", font=("Consolas", 9), wrap="word")
        self.log.pack(fill="both", expand=True)
        ttk.Label(frame, text="Stop/close disconnects. Tailscale URL and encrypted key survive restarts; Rotate key revokes access.").pack(anchor="w", pady=(10, 0))
        self.root.after(100, self.poll)
        if auto_start:
            self.root.after(250, self.start)

    def copy(self, value):
        if value:
            self.root.clipboard_clear()
            self.root.clipboard_append(value)

    def add_library(self):
        folder = filedialog.askdirectory(parent=self.root, title="Select Roblox reference or skill library")
        if folder:
            registry = self.bridge.libraries if self.bridge else LibraryTools(WorkspaceTools())
            try:
                entry = registry.add({"path": folder})
                self.add_log("Reference library registered: " + entry["name"] + ". Use library_list / skills_list. Brickwire is already bundled.")
            except Exception as exc:
                self.add_log("Library could not be added: " + str(exc))

    def toggle_token(self):
        self.token_entry.configure(show="" if self.token_entry.cget("show") else "\u2022")

    def copy_codex_config(self):
        if not self.bridge or not self.bridge.public_url:
            self.add_log("Wait until the public URL has been created before copying the configuration.")
            return
        config = '[mcp_servers.mcp_bridge]\nenabled = true\nurl = ' + json.dumps(self.bridge.public_url)
        config += '\nhttp_headers = { Authorization = ' + json.dumps("Bearer " + self.bridge.token) + ' }\n'
        config += 'startup_timeout_sec = 30\ntool_timeout_sec = 180\n'
        self.copy(config)
        self.add_log("Codex configuration copied. Replace the existing mcp_bridge entry; do not paste the key into an environment-variable-name field.")

    def revoke_oauth(self):
        if self.bridge:
            self.bridge.oauth.revoke_all()
            self.add_log("All OAuth tokens and pending authorizations revoked. Reconnect from ChatGPT to authorize again.")

    def rotate_key(self):
        if self.bridge:
            value = secrets.token_urlsafe(32)
            if self.bridge.store:
                self.bridge.store.set('token', value)
            self.bridge.token = value
            self.bridge.oauth.revoke_all()
            self.token.set(value)
            self.add_log('Key rotated and OAuth grants revoked. Update/reconnect your MCP clients.')

    def add_log(self, text):
        self.log.configure(state="normal")
        self.log.insert("end", f"[{datetime.now():%H:%M:%S}] {text}\n")
        if int(self.log.index("end-1c").split(".")[0]) > 1000:
            self.log.delete("1.0", "101.0")
        self.log.see("end")
        self.log.configure(state="disabled")

    def start(self):
        if self.bridge is not None:
            return
        self.bridge = Bridge()
        if self.updater is None:
            self.updater = AutoUpdater(VERSION, self.bridge.workspace.data_dir, self.bridge.emit)
            self.updater.background()
        self.token.set(self.bridge.token)
        self.url.set("Connecting Tailscale Funnel...")
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.bridge.start()

    def stop(self):
        if self.bridge is None:
            return
        self.status.set("Stopping...")
        self.stop_button.configure(state="disabled")
        bridge = self.bridge

        def finish():
            bridge.stop()
            bridge.emit("stopped", "Stopped")
        threading.Thread(target=finish, daemon=True).start()

    def poll(self):
        if self.bridge:
            try:
                while True:
                    kind, value = self.bridge.events.get_nowait()
                    if kind == "log":
                        self.add_log(value)
                    elif kind == "url":
                        self.url.set(value)
                    elif kind == "local":
                        self.local.set("Local endpoint: " + value)
                    elif kind == "status":
                        self.status.set(value)
                    elif kind in {"error", "stopped"}:
                        self.status.set("Error - select Start to retry" if kind == "error" else "Stopped")
                        self.url.set("Disconnected")
                        self.token.set("")
                        self.local.set("")
                        self.start_button.configure(state="normal")
                        self.stop_button.configure(state="disabled")
                        if kind == "error":
                            self.add_log(value)
                        self.bridge = None
                        break
            except queue.Empty:
                pass
        self.root.after(100, self.poll)

    def close(self):
        self.root.withdraw()
        if self.bridge:
            self.bridge.stop()
        if self.updater:
            try:
                self.updater.apply_on_exit()
            except Exception:
                pass  # Keep the installed version when staging/helper startup fails.
        self.root.destroy()


def self_test(report_path=None, tunnel=False):
    import urllib.request
    import urllib.error
    passed = []
    test_data = tempfile.TemporaryDirectory(prefix="bridge-self-test-")
    bridge = Bridge(data_dir=test_data.name)

    def request(url, payload, token=None, origin=None):
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if token:
            headers["Authorization"] = "Bearer " + token
        if origin:
            headers["Origin"] = origin
        req = urllib.request.Request(url, json.dumps(payload).encode(), headers)
        try:
            with urllib.request.urlopen(req, timeout=20) as response:
                raw = response.read()
                return response.status, json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            return exc.code, None

    try:
        bridge.start_local()
        ping = {"jsonrpc": "2.0", "id": 0, "method": "ping"}
        assert request(bridge.local_url, ping)[0] == 401
        assert request(bridge.local_url, ping, "wrong")[0] == 401
        assert request(bridge.local_url, ping, bridge.token, "https://untrusted.invalid")[0] == 403
        passed.append("missing/wrong bearer token and foreign Origin rejected")
        status, body = request(bridge.local_url, ping, bridge.token)
        assert status == 200 and body["id"] == 0 and body["result"] == {}
        passed.append("authenticated HTTP MCP ping, including request id 0")
        from oauth_checks import run_oauth_checks
        passed.extend(run_oauth_checks(bridge))
        init = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}}
        assert request(bridge.local_url, init, bridge.token)[1]["result"]["protocolVersion"] == "2025-06-18"
        assert request(bridge.local_url, {"jsonrpc": "2.0", "method": "notifications/initialized"}, bridge.token)[0] == 202
        listed = request(bridge.local_url, {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}, bridge.token)[1]
        assert len(listed["result"]["tools"]) == len(BRIDGE_TOOLS)
        passed.append(f"MCP initialization, notifications and {len(BRIDGE_TOOLS)} tools")
        from workspace_checks import run_workspace_checks
        passed.extend(run_workspace_checks(bridge, request))
        from library_checks import run_library_checks
        passed.extend(run_library_checks(bridge, request))
        from persistence_checks import run_persistence_checks
        passed.extend(run_persistence_checks(Bridge))
        from update_checks import run_update_checks
        passed.extend(run_update_checks())
        from fast_checks import run_fast_checks
        passed.extend(run_fast_checks(bridge, request))
        from quality_checks import run_quality_checks
        passed.extend(run_quality_checks(bridge))
        from creative_checks import run_creative_checks
        passed.extend(run_creative_checks(bridge, request))
        if "--test-roblox" in sys.argv:
            passed.extend(test_roblox_gateway(bridge, request))
        info = request(bridge.local_url, {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "system_info"}}, bridge.token)[1]
        assert "hostname" in json.loads(info["result"]["content"][0]["text"])
        passed.append("system_info tool called over HTTP")
        status_result = bridge.rea.status({})
        assert status_result["running"] and status_result["tool_count"] > 0
        catalog = bridge.rea.list_tools({"limit": 5})
        assert catalog["tools"]
        schema = bridge.rea.list_tools({"name": catalog["tools"][0]["name"]})
        assert "inputSchema" in schema
        passed.append(f"bundled REA initializes, exposes {status_result['tool_count']} tools, returns catalog and schemas")
        import zipfile
        with tempfile.TemporaryDirectory(prefix="bridge-rea-test-") as fixture_dir:
            fixture = Path(fixture_dir) / "BridgeIntegrationTest.zip"
            with zipfile.ZipFile(fixture, "w") as archive:
                archive.writestr("BridgeIntegrationTest.txt", "REA bridge test fixture")
            opened = request(bridge.local_url, {"jsonrpc": "2.0", "id": 40, "method": "tools/call", "params": {
                "name": "rea_call_tool", "arguments": {"name": "open_binary", "arguments": {"path": str(fixture)}}}}, bridge.token)[1]
            assert not opened["result"].get("isError"), opened
            call = {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {
                "name": "rea_call_tool", "arguments": {"name": "inspect_artifact", "arguments": {"detail": "summary"}}}}
            response = request(bridge.local_url, call, bridge.token)[1]
            assert not response["result"].get("isError"), response
            assert "BridgeIntegrationTest" in json.dumps(response)
        passed.append("actual REA open_binary and inspect_artifact run successfully through authenticated HTTP gateway")
        version = subprocess.run([Bridge.tunnel_binary(), "version"], capture_output=True, timeout=15, creationflags=subprocess.CREATE_NO_WINDOW)
        assert version.returncode == 0 and version.stdout
        passed.append("installed Tailscale CLI executes; Cloudflare is not used")
        app = App(auto_start=False)
        app.root.update()
        app.token.set("test-token")
        app.toggle_token()
        assert app.token_entry.cget("show") == ""
        app.root.destroy()
        passed.append("GUI builds and token display toggles")
        if tunnel:
            bridge.stop()
            bridge = Bridge(data_dir=test_data.name, listen_port=tailscale_gateway.LOCAL_PORT)
            bridge.start()
            deadline = time.monotonic() + 80
            while time.monotonic() < deadline:
                if bridge.stopped.is_set():
                    raise RuntimeError("Tunnel startup failed")
                if bridge.public_url:
                    try:
                        status, body = request(bridge.public_url, ping, bridge.token)
                        if status == 200 and body["result"] == {}:
                            assert request(bridge.public_url, ping)[0] == 401
                            passed.extend(run_oauth_checks(bridge))
                            parsed = urlsplit(bridge.public_url)
                            origin = parsed.scheme + '://' + parsed.netloc
                            for route, field in [('/.well-known/oauth-authorization-server' + tailscale_gateway.PREFIX, 'issuer'),
                                                 ('/.well-known/oauth-protected-resource' + tailscale_gateway.PREFIX + '/mcp', 'resource')]:
                                with urllib.request.urlopen(origin + route, timeout=20) as discovered:
                                    assert field in json.load(discovered)
                            passed.append('canonical path-aware OAuth metadata discovery works through Tailscale')
                            passed.append("public Tailscale Funnel: authenticated ping succeeds, anonymous request rejected")
                            break
                    except (OSError, ValueError):
                        pass
                time.sleep(1)
            else:
                raise TimeoutError("Public Tailscale tunnel test timed out")
    finally:
        bridge.stop()
        test_data.cleanup()
        if report_path:
            Path(report_path).write_text(json.dumps({"version": VERSION, "passed": passed}, indent=2), encoding="utf-8")
    return 0


def test_roblox_gateway(bridge, request):
    status = bridge.roblox.status({})
    assert status["running"] and status["tool_count"] > 0
    studios = request(bridge.local_url, {"jsonrpc": "2.0", "id": 90, "method": "tools/call", "params": {"name": "roblox_studios", "arguments": {}}}, bridge.token)[1]
    assert not studios["result"].get("isError"), studios
    listing = json.loads(studios["result"]["content"][0]["text"])
    assert "studios" in listing
    passed = [f"official Roblox Studio MCP connects: {status['tool_count']} tools; live Studio list forwarded over authenticated HTTP"]
    if listing["studios"]:
        ident = listing["studios"][0]["id"]
        state = request(bridge.local_url, {"jsonrpc": "2.0", "id": 91, "method": "tools/call", "params": {"name": "roblox_state", "arguments": {"studio_id": ident}}}, bridge.token)[1]
        assert not state["result"].get("isError"), state
        passed.append("live Roblox Studio state read through the bridge; no game modifications")
    return passed


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        report = sys.argv[sys.argv.index("--report") + 1] if "--report" in sys.argv else None
        try:
            raise SystemExit(self_test(report, tunnel="--test-tunnel" in sys.argv))
        except Exception:
            if report:
                Path(report).write_text(traceback.format_exc(), encoding="utf-8")
            raise
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(1)
    except Exception:
        pass
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.CreateMutexW.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_wchar_p]
    kernel.CreateMutexW.restype = ctypes.c_void_p
    instance_mutex = kernel.CreateMutexW(None, False, 'Local\\PC-MCP-Bridge-Tailscale')
    if not instance_mutex:
        raise ctypes.WinError(ctypes.get_last_error())
    if ctypes.get_last_error() == 183:
        raise SystemExit(0)  # Existing visible bridge owns this Windows session.
    App().root.mainloop()
