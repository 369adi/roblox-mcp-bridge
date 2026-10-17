from __future__ import annotations

import base64
import ctypes
import json
import os
import platform
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from tkinter import BooleanVar, StringVar, Tk, messagebox, ttk
from typing import Any
from urllib.parse import urlparse, urlunparse

import websocket
from PIL import ImageGrab


APP_NAME = "PC MCP Bridge"
APP_VERSION = "1.0.0"
MCP_VERSION = "2025-06-18"
MAX_TEXT_BYTES = 4 * 1024 * 1024


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def websocket_url(value: str) -> str:
    value = value.strip()
    parsed = urlparse(value)
    scheme = {"http": "ws", "https": "wss"}.get(parsed.scheme.lower(), parsed.scheme.lower())
    if scheme not in {"ws", "wss"} or not parsed.netloc:
        raise ValueError("Enter a valid ws://, wss://, http://, or https:// URL.")
    return urlunparse(parsed._replace(scheme=scheme))


def safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def result_text(value: Any, *, is_error: bool = False) -> dict[str, Any]:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, indent=2)
    out: dict[str, Any] = {"content": [{"type": "text", "text": text}]}
    if is_error:
        out["isError"] = True
    return out


def trim_output(data: str, limit: int = MAX_TEXT_BYTES) -> tuple[str, bool]:
    raw = data.encode("utf-8", errors="replace")
    if len(raw) <= limit:
        return data, False
    return raw[:limit].decode("utf-8", errors="replace"), True


def run_shell(args: dict[str, Any]) -> dict[str, Any]:
    command = str(args.get("command", ""))
    if not command:
        raise ValueError("command is required")
    shell = str(args.get("shell", "powershell")).lower()
    timeout = max(1, min(int(args.get("timeout_seconds", 120)), 3600))
    cwd = args.get("cwd") or None
    if cwd:
        cwd = str(Path(cwd).expanduser().resolve())
    if shell == "powershell":
        argv = ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]
    elif shell == "cmd":
        argv = ["cmd.exe", "/d", "/s", "/c", command]
    else:
        raise ValueError("shell must be 'powershell' or 'cmd'")
    started = time.monotonic()
    try:
        proc = subprocess.run(
            argv,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        stdout, stdout_cut = trim_output(proc.stdout)
        stderr, stderr_cut = trim_output(proc.stderr)
        return {
            "exit_code": proc.returncode,
            "stdout": stdout,
            "stderr": stderr,
            "truncated": stdout_cut or stderr_cut,
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "timed_out": True,
            "stdout": (exc.stdout or "") if isinstance(exc.stdout, str) else "",
            "stderr": (exc.stderr or "") if isinstance(exc.stderr, str) else "",
            "duration_ms": round((time.monotonic() - started) * 1000),
        }


def fs_list(args: dict[str, Any]) -> dict[str, Any]:
    target = Path(args.get("path") or ".").expanduser().resolve()
    if not target.exists():
        raise FileNotFoundError(str(target))
    if target.is_file():
        stat = target.stat()
        return {"path": str(target), "type": "file", "size": stat.st_size, "modified": stat.st_mtime}
    entries = []
    for item in target.iterdir():
        try:
            stat = item.stat()
            entries.append({
                "name": item.name,
                "path": str(item),
                "type": "directory" if item.is_dir() else "file",
                "size": stat.st_size,
                "modified": stat.st_mtime,
            })
        except OSError as exc:
            entries.append({"name": item.name, "path": str(item), "error": str(exc)})
    entries.sort(key=lambda x: (x.get("type") != "directory", x["name"].lower()))
    return {"path": str(target), "entries": entries}


def fs_read(args: dict[str, Any]) -> dict[str, Any]:
    target = Path(str(args.get("path", ""))).expanduser().resolve()
    if not target.is_file():
        raise FileNotFoundError(str(target))
    limit = max(1, min(int(args.get("max_bytes", MAX_TEXT_BYTES)), 64 * 1024 * 1024))
    raw = target.read_bytes()
    cut = len(raw) > limit
    raw = raw[:limit]
    encoding = str(args.get("encoding", "utf-8")).lower()
    if encoding == "base64":
        content = base64.b64encode(raw).decode("ascii")
    else:
        content = raw.decode(encoding, errors="replace")
    return {"path": str(target), "encoding": encoding, "content": content, "truncated": cut, "size": target.stat().st_size}


def fs_write(args: dict[str, Any]) -> dict[str, Any]:
    target = Path(str(args.get("path", ""))).expanduser().resolve()
    content = args.get("content", "")
    encoding = str(args.get("encoding", "utf-8")).lower()
    append = bool(args.get("append", False))
    target.parent.mkdir(parents=True, exist_ok=True)
    raw = base64.b64decode(content) if encoding == "base64" else str(content).encode(encoding)
    with target.open("ab" if append else "wb") as handle:
        handle.write(raw)
    return {"path": str(target), "bytes_written": len(raw), "append": append}


def fs_manage(args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("action", ""))
    source = Path(str(args.get("path", ""))).expanduser().resolve()
    if action == "mkdir":
        source.mkdir(parents=True, exist_ok=True)
        return {"created": str(source)}
    if action == "delete":
        if source.is_dir():
            if not bool(args.get("recursive", False)):
                source.rmdir()
            else:
                shutil.rmtree(source)
        else:
            source.unlink()
        return {"deleted": str(source)}
    if action in {"copy", "move"}:
        destination = Path(str(args.get("destination", ""))).expanduser().resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        if action == "move":
            final = shutil.move(str(source), str(destination))
        elif source.is_dir():
            final = shutil.copytree(source, destination, dirs_exist_ok=bool(args.get("overwrite", False)))
        else:
            final = shutil.copy2(source, destination)
        return {"action": action, "source": str(source), "destination": str(final)}
    raise ValueError("action must be mkdir, copy, move, or delete")


def process_list(_: dict[str, Any]) -> dict[str, Any]:
    proc = subprocess.run(
        ["tasklist.exe", "/fo", "csv", "/nh"], capture_output=True, text=True,
        encoding="utf-8", errors="replace", creationflags=subprocess.CREATE_NO_WINDOW
    )
    return {"exit_code": proc.returncode, "csv": proc.stdout, "stderr": proc.stderr}


def process_start(args: dict[str, Any]) -> dict[str, Any]:
    executable = str(args.get("executable", ""))
    if not executable:
        raise ValueError("executable is required")
    arguments = args.get("arguments", [])
    if not isinstance(arguments, list):
        raise ValueError("arguments must be an array")
    cwd = args.get("cwd") or None
    proc = subprocess.Popen([executable, *map(str, arguments)], cwd=cwd)
    return {"pid": proc.pid}


def process_kill(args: dict[str, Any]) -> dict[str, Any]:
    pid = int(args.get("pid", 0))
    if pid <= 0:
        raise ValueError("pid must be positive")
    proc = subprocess.run(
        ["taskkill.exe", "/PID", str(pid), "/T", "/F"], capture_output=True,
        text=True, encoding="utf-8", errors="replace", creationflags=subprocess.CREATE_NO_WINDOW
    )
    return {"exit_code": proc.returncode, "stdout": proc.stdout, "stderr": proc.stderr}


def take_screenshot(args: dict[str, Any]) -> dict[str, Any]:
    image = ImageGrab.grab(all_screens=True)
    max_width = int(args.get("max_width", 0) or 0)
    if max_width and image.width > max_width:
        height = max(1, round(image.height * max_width / image.width))
        image = image.resize((max_width, height))
    import io
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return {
        "mime_type": "image/png",
        "width": image.width,
        "height": image.height,
        "data_base64": base64.b64encode(buffer.getvalue()).decode("ascii"),
    }


def mouse_action(args: dict[str, Any]) -> dict[str, Any]:
    user32 = ctypes.windll.user32
    x = int(args.get("x", 0))
    y = int(args.get("y", 0))
    action = str(args.get("action", "move"))
    user32.SetCursorPos(x, y)
    flags = {
        "left_click": (0x0002, 0x0004),
        "right_click": (0x0008, 0x0010),
        "middle_click": (0x0020, 0x0040),
    }
    if action in flags:
        down, up = flags[action]
        user32.mouse_event(down, 0, 0, 0, 0)
        user32.mouse_event(up, 0, 0, 0, 0)
    elif action != "move":
        raise ValueError("action must be move, left_click, right_click, or middle_click")
    return {"action": action, "x": x, "y": y}


def keyboard_type(args: dict[str, Any]) -> dict[str, Any]:
    text = str(args.get("text", ""))
    user32 = ctypes.windll.user32

    class KEYBDINPUT(ctypes.Structure):
        _fields_ = [("wVk", ctypes.c_ushort), ("wScan", ctypes.c_ushort),
                    ("dwFlags", ctypes.c_ulong), ("time", ctypes.c_ulong),
                    ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong))]

    class INPUT_UNION(ctypes.Union):
        _fields_ = [("ki", KEYBDINPUT), ("padding", ctypes.c_byte * (32 if ctypes.sizeof(ctypes.c_void_p) == 8 else 24))]

    class INPUT(ctypes.Structure):
        _anonymous_ = ("u",)
        _fields_ = [("type", ctypes.c_ulong), ("u", INPUT_UNION)]

    units = text.encode("utf-16-le")
    for index in range(0, len(units), 2):
        code = int.from_bytes(units[index:index + 2], "little")
        down = INPUT(type=1, ki=KEYBDINPUT(0, code, 0x0004, 0, None))
        up = INPUT(type=1, ki=KEYBDINPUT(0, code, 0x0004 | 0x0002, 0, None))
        if user32.SendInput(1, ctypes.byref(down), ctypes.sizeof(INPUT)) != 1:
            raise OSError("SendInput failed")
        user32.SendInput(1, ctypes.byref(up), ctypes.sizeof(INPUT))
    return {"characters_typed": len(text)}


VK = {"ctrl": 0x11, "control": 0x11, "shift": 0x10, "alt": 0x12, "win": 0x5B,
      "enter": 0x0D, "tab": 0x09, "escape": 0x1B, "esc": 0x1B, "space": 0x20,
      "backspace": 0x08, "delete": 0x2E, "up": 0x26, "down": 0x28, "left": 0x25, "right": 0x27,
      **{chr(i): i for i in range(ord("A"), ord("Z") + 1)}, **{str(i): 0x30 + i for i in range(10)}}


def keyboard_hotkey(args: dict[str, Any]) -> dict[str, Any]:
    keys = args.get("keys", [])
    if not isinstance(keys, list) or not keys:
        raise ValueError("keys must be a non-empty array")
    codes = []
    for key in keys:
        normalized = str(key).lower()
        code = VK.get(normalized) or VK.get(normalized.upper())
        if code is None and normalized.startswith("f") and normalized[1:].isdigit():
            number = int(normalized[1:])
            if 1 <= number <= 24:
                code = 0x6F + number
        if code is None:
            raise ValueError(f"Unsupported key: {key}")
        codes.append(code)
    user32 = ctypes.windll.user32
    for code in codes:
        user32.keybd_event(code, 0, 0, 0)
    for code in reversed(codes):
        user32.keybd_event(code, 0, 0x0002, 0)
    return {"keys": keys}


def system_info(_: dict[str, Any]) -> dict[str, Any]:
    drives = []
    for letter in "ABCDEFGHIJKLMNOPQRSTUVWXYZ":
        root = f"{letter}:\\"
        if os.path.exists(root):
            try:
                usage = shutil.disk_usage(root)
                drives.append({"root": root, "total": usage.total, "free": usage.free})
            except OSError:
                pass
    return {
        "hostname": socket.gethostname(),
        "user": os.environ.get("USERNAME", ""),
        "platform": platform.platform(),
        "python": platform.python_version(),
        "cwd": os.getcwd(),
        "drives": drives,
        "time_utc": utc_now(),
    }


TOOLS: list[dict[str, Any]] = [
    {"name": "system_info", "description": "Get Windows host, user, drives, and runtime information.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "shell_execute", "description": "Execute an unrestricted PowerShell or cmd command on this PC.", "inputSchema": {"type": "object", "properties": {"command": {"type": "string"}, "shell": {"type": "string", "enum": ["powershell", "cmd"]}, "cwd": {"type": "string"}, "timeout_seconds": {"type": "integer"}}, "required": ["command"]}},
    {"name": "filesystem_list", "description": "List a directory or inspect a file.", "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}}}},
    {"name": "filesystem_read", "description": "Read a text or binary file.", "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "encoding": {"type": "string", "description": "Text encoding or base64"}, "max_bytes": {"type": "integer"}}, "required": ["path"]}},
    {"name": "filesystem_write", "description": "Write or append text/base64 data to a file.", "inputSchema": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}, "encoding": {"type": "string"}, "append": {"type": "boolean"}}, "required": ["path", "content"]}},
    {"name": "filesystem_manage", "description": "Create, copy, move, or permanently delete files and directories.", "inputSchema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["mkdir", "copy", "move", "delete"]}, "path": {"type": "string"}, "destination": {"type": "string"}, "recursive": {"type": "boolean"}, "overwrite": {"type": "boolean"}}, "required": ["action", "path"]}},
    {"name": "process_list", "description": "List running Windows processes as CSV.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "process_start", "description": "Start a program with arguments.", "inputSchema": {"type": "object", "properties": {"executable": {"type": "string"}, "arguments": {"type": "array", "items": {"type": "string"}}, "cwd": {"type": "string"}}, "required": ["executable"]}},
    {"name": "process_kill", "description": "Force-terminate a process tree.", "inputSchema": {"type": "object", "properties": {"pid": {"type": "integer"}}, "required": ["pid"]}},
    {"name": "screen_capture", "description": "Capture all displays and return a PNG as base64.", "inputSchema": {"type": "object", "properties": {"max_width": {"type": "integer"}}}},
    {"name": "mouse_action", "description": "Move the pointer or click at screen coordinates.", "inputSchema": {"type": "object", "properties": {"action": {"type": "string", "enum": ["move", "left_click", "right_click", "middle_click"]}, "x": {"type": "integer"}, "y": {"type": "integer"}}, "required": ["action", "x", "y"]}},
    {"name": "keyboard_type", "description": "Type Unicode text into the focused application.", "inputSchema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
    {"name": "keyboard_hotkey", "description": "Press a key combination such as ctrl+c or alt+tab.", "inputSchema": {"type": "object", "properties": {"keys": {"type": "array", "items": {"type": "string"}}}, "required": ["keys"]}},
]


HANDLERS = {
    "system_info": system_info,
    "shell_execute": run_shell,
    "filesystem_list": fs_list,
    "filesystem_read": fs_read,
    "filesystem_write": fs_write,
    "filesystem_manage": fs_manage,
    "process_list": process_list,
    "process_start": process_start,
    "process_kill": process_kill,
    "screen_capture": take_screenshot,
    "mouse_action": mouse_action,
    "keyboard_type": keyboard_type,
    "keyboard_hotkey": keyboard_hotkey,
}


class MCPBridge:
    def __init__(self, url: str, token: str, event_queue: queue.Queue):
        self.url = websocket_url(url)
        self.token = token.strip()
        self.events = event_queue
        self.stop_event = threading.Event()
        self.ws: websocket.WebSocket | None = None
        self.thread: threading.Thread | None = None
        self.client_id = str(uuid.uuid4())

    def emit(self, kind: str, value: Any) -> None:
        self.events.put((kind, value))

    def start(self) -> None:
        self.thread = threading.Thread(target=self._run, name="mcp-bridge", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.ws:
            try:
                self.ws.close()
            except Exception:
                pass

    def send(self, payload: dict[str, Any]) -> None:
        if self.ws:
            self.ws.send(safe_json(payload))

    def _run(self) -> None:
        delay = 1
        while not self.stop_event.is_set():
            try:
                headers = [f"Authorization: Bearer {self.token}"] if self.token else []
                self.emit("status", "Connecting")
                self.ws = websocket.create_connection(self.url, header=headers, timeout=20, enable_multithread=True)
                self.ws.settimeout(30)
                delay = 1
                self.emit("status", "Connected")
                self.emit("log", f"Connected to {self.url}")
                self.send({
                    "type": "bridge.hello",
                    "protocol": "mcp-bridge/1",
                    "client_id": self.client_id,
                    "name": socket.gethostname(),
                    "version": APP_VERSION,
                    "capabilities": {"mcp": MCP_VERSION, "transport": "jsonrpc-websocket", "full_pc_access": True},
                })
                while not self.stop_event.is_set():
                    try:
                        raw = self.ws.recv()
                    except websocket.WebSocketTimeoutException:
                        self.ws.ping()
                        continue
                    if not raw:
                        raise ConnectionError("Remote endpoint closed the connection")
                    threading.Thread(target=self._handle_raw, args=(raw,), daemon=True).start()
            except Exception as exc:
                if self.stop_event.is_set():
                    break
                self.emit("status", "Reconnecting")
                self.emit("log", f"Connection error: {exc}. Retry in {delay}s.")
                self.stop_event.wait(delay)
                delay = min(delay * 2, 30)
            finally:
                if self.ws:
                    try:
                        self.ws.close()
                    except Exception:
                        pass
                    self.ws = None
        self.emit("status", "Stopped")
        self.emit("log", "Bridge stopped.")

    def _handle_raw(self, raw: str | bytes) -> None:
        envelope = False
        try:
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            message = json.loads(raw)
            if isinstance(message, dict) and message.get("type") == "mcp" and isinstance(message.get("payload"), dict):
                envelope = True
                request = message["payload"]
            else:
                request = message
            response = self.handle_request(request)
            if response is not None:
                self.send({"type": "mcp", "payload": response} if envelope else response)
        except Exception as exc:
            self.emit("log", f"Invalid request: {exc}")

    def handle_request(self, request: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
            raise ValueError("Expected a JSON-RPC 2.0 object")
        method = request.get("method")
        request_id = request.get("id")
        if request_id is None:
            return None
        try:
            if method == "initialize":
                result = {"protocolVersion": MCP_VERSION, "capabilities": {"tools": {"listChanged": False}}, "serverInfo": {"name": APP_NAME, "version": APP_VERSION}}
            elif method == "ping":
                result = {}
            elif method == "tools/list":
                result = {"tools": TOOLS}
            elif method == "tools/call":
                params = request.get("params") or {}
                name = params.get("name")
                arguments = params.get("arguments") or {}
                if name not in HANDLERS:
                    raise ValueError(f"Unknown tool: {name}")
                self.emit("log", f"Tool call: {name}")
                started = time.monotonic()
                try:
                    value = HANDLERS[name](arguments)
                    result = result_text(value)
                    self.emit("log", f"Tool completed: {name} ({round((time.monotonic() - started) * 1000)} ms)")
                except Exception as exc:
                    result = result_text({"error": str(exc), "tool": name}, is_error=True)
                    self.emit("log", f"Tool failed: {name}: {exc}")
            else:
                return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32601, "message": f"Method not found: {method}"}}
            return {"jsonrpc": "2.0", "id": request_id, "result": result}
        except Exception as exc:
            return {"jsonrpc": "2.0", "id": request_id, "error": {"code": -32603, "message": str(exc)}}


class BridgeApp:
    def __init__(self) -> None:
        self.root = Tk()
        self.root.title(f"{APP_NAME} {APP_VERSION}")
        self.root.geometry("760x570")
        self.root.minsize(680, 500)
        self.root.protocol("WM_DELETE_WINDOW", self.close)
        self.url = StringVar()
        self.token = StringVar()
        self.enabled = BooleanVar(value=False)
        self.status = StringVar(value="Stopped")
        self.events: queue.Queue = queue.Queue()
        self.bridge: MCPBridge | None = None
        self._build()
        self.root.after(100, self._poll)

    def _build(self) -> None:
        outer = ttk.Frame(self.root, padding=18)
        outer.pack(fill="both", expand=True)
        ttk.Label(outer, text=APP_NAME, font=("Segoe UI", 18, "bold")).pack(anchor="w")
        ttk.Label(outer, text="Connect this Windows PC to a trusted remote MCP relay.").pack(anchor="w", pady=(2, 16))

        form = ttk.Frame(outer)
        form.pack(fill="x")
        ttk.Label(form, text="Cloudflare / WebSocket URL").grid(row=0, column=0, sticky="w")
        ttk.Entry(form, textvariable=self.url).grid(row=1, column=0, sticky="ew", pady=(3, 10))
        ttk.Label(form, text="Bearer token").grid(row=2, column=0, sticky="w")
        ttk.Entry(form, textvariable=self.token, show="•").grid(row=3, column=0, sticky="ew", pady=(3, 10))
        form.columnconfigure(0, weight=1)

        warning = ttk.LabelFrame(outer, text="Security confirmation", padding=10)
        warning.pack(fill="x", pady=(2, 12))
        ttk.Label(
            warning,
            text="While connected, the remote endpoint can read, change, or delete files; run commands;\n"
                 "start or stop programs; capture the screen; and control the mouse and keyboard.",
            foreground="#9b2c2c",
        ).pack(anchor="w")
        ttk.Checkbutton(warning, text="I trust this endpoint and enable unrestricted PC access", variable=self.enabled).pack(anchor="w", pady=(8, 0))

        controls = ttk.Frame(outer)
        controls.pack(fill="x")
        self.start_button = ttk.Button(controls, text="Start bridge", command=self.start)
        self.start_button.pack(side="left")
        self.stop_button = ttk.Button(controls, text="Stop", command=self.stop, state="disabled")
        self.stop_button.pack(side="left", padx=(8, 0))
        ttk.Label(controls, text="Status:").pack(side="left", padx=(22, 5))
        ttk.Label(controls, textvariable=self.status, font=("Segoe UI", 9, "bold")).pack(side="left")

        ttk.Label(outer, text="Activity log").pack(anchor="w", pady=(16, 4))
        self.log = __import__("tkinter").Text(outer, height=15, wrap="word", state="disabled", font=("Consolas", 9))
        self.log.pack(fill="both", expand=True)
        ttk.Label(outer, text="The token is kept in memory only and is never written to disk.", foreground="#555555").pack(anchor="w", pady=(8, 0))

    def add_log(self, message: str) -> None:
        self.log.configure(state="normal")
        self.log.insert("end", f"[{datetime.now().strftime('%H:%M:%S')}] {message}\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def start(self) -> None:
        if self.bridge:
            return
        if not self.enabled.get():
            messagebox.showwarning(APP_NAME, "Confirm unrestricted PC access before starting.")
            return
        try:
            url = websocket_url(self.url.get())
        except ValueError as exc:
            messagebox.showerror(APP_NAME, str(exc))
            return
        if not self.token.get().strip():
            if not messagebox.askyesno(APP_NAME, "No bearer token was provided. Connect without authentication?"):
                return
        self.bridge = MCPBridge(url, self.token.get(), self.events)
        self.bridge.start()
        self.start_button.configure(state="disabled")
        self.stop_button.configure(state="normal")
        self.add_log("Bridge started. Waiting for a secure connection.")

    def stop(self) -> None:
        if self.bridge:
            self.bridge.stop()
            self.bridge = None
        self.start_button.configure(state="normal")
        self.stop_button.configure(state="disabled")
        self.status.set("Stopped")

    def _poll(self) -> None:
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == "status":
                    self.status.set(str(value))
                elif kind == "log":
                    self.add_log(str(value))
        except queue.Empty:
            pass
        self.root.after(100, self._poll)

    def close(self) -> None:
        if self.bridge:
            self.bridge.stop()
        self.root.destroy()

    def run(self) -> None:
        self.root.mainloop()


def self_test() -> int:
    assert websocket_url("https://example.com/mcp") == "wss://example.com/mcp"
    assert websocket_url("ws://localhost:8080") == "ws://localhost:8080"
    event_queue: queue.Queue = queue.Queue()
    bridge = MCPBridge("ws://localhost:1", "test", event_queue)
    init = bridge.handle_request({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
    assert init and init["result"]["serverInfo"]["name"] == APP_NAME
    listed = bridge.handle_request({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
    assert listed and len(listed["result"]["tools"]) == len(HANDLERS)
    info = bridge.handle_request({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "system_info", "arguments": {}}})
    assert info and "hostname" in info["result"]["content"][0]["text"]
    return 0


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(self_test())
    try:
        BridgeApp().run()
    except Exception:
        Path(os.environ.get("TEMP", "."), "pc-mcp-bridge-crash.log").write_text(traceback.format_exc(), encoding="utf-8")
        raise
