"""Local stdio MCP client for the bundled, pinned REA distribution."""
import json
import os
import queue
import shutil
import subprocess
import sys
import threading
from pathlib import Path


REA_TOOLS = [
    {"name": "rea_status", "description": "Start/check the bundled REA 6.5.0 reverse-engineering MCP server and count its available tools.", "inputSchema": {"type": "object", "properties": {}}},
    {"name": "rea_list_tools", "description": "Search REA's reverse-engineering tool catalog. Use query to find tools for binaries, JavaScript, Electron, .NET, Android, browser inspection, etc. Set name to get a tool's full input schema before calling rea_call_tool.", "inputSchema": {"type": "object", "properties": {"query": {"type": "string"}, "name": {"type": "string"}, "offset": {"type": "integer", "minimum": 0}, "limit": {"type": "integer", "minimum": 1, "maximum": 100}}}},
    {"name": "rea_call_tool", "description": "Call an actual bundled REA MCP tool. Discover tool names and input schemas using rea_list_tools first. REA runs locally on this Windows PC; provider-specific tools need the corresponding local provider.", "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}, "arguments": {"type": "object", "additionalProperties": True}}, "required": ["name"]}},
]


class REAGateway:
    def __init__(self, emit, label="REA"):
        self.emit = emit
        self.label = label
        self.process = None
        self.lock = threading.RLock()
        self.write_lock = threading.Lock()
        self.waiters = {}
        self.counter = 0
        self.tools = []
        self.closed = threading.Event()

    def start(self):
        with self.lock:
            if self.closed.is_set():
                raise RuntimeError("REA has stopped")
            if self.process and self.process.poll() is None and self.tools:
                return
            root = Path(getattr(sys, "_MEIPASS", Path(__file__).parent))
            node = root / "node.exe"
            runtime = root / "rea-runtime" / "node_modules" / "rea-agents" / "scripts" / "rea.mjs"
            executable = str(node) if node.is_file() else shutil.which("node")
            if not executable or not runtime.is_file():
                raise FileNotFoundError("Bundled REA runtime is missing")
            env = dict(os.environ)
            env["PATH"] = str(Path(executable).parent) + os.pathsep + env.get("PATH", "")
            env["REA_MCP_INPUT_SCHEMA_PROFILE"] = "compact"
            env["REA_MCP_OUTPUT_SCHEMA_PROFILE"] = "off"
            self._start_process([executable, str(runtime), "mcp"], env)

    def _start_process(self, command, env=None):
        with self.lock:
            if self.closed.is_set():
                raise RuntimeError(f"{self.label} has stopped")
            if self.process and self.process.poll() is None and self.tools:
                return
            self.emit("log", f"Starting {self.label} MCP server...")
            self.process = subprocess.Popen(command, stdin=subprocess.PIPE,
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8",
                                            text=True, errors="replace", bufsize=1, env=env,
                                            creationflags=subprocess.CREATE_NO_WINDOW)
            threading.Thread(target=self._read, args=(self.process,), daemon=True).start()
            threading.Thread(target=self._stderr, args=(self.process,), daemon=True).start()
            try:
                self.request("initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                           "clientInfo": {"name": "PC MCP Bridge", "version": "4.0.0"}}, timeout=60)
                self._write({"jsonrpc": "2.0", "method": "notifications/initialized"})
                cursor = None
                tools = []
                while True:
                    result = self.request("tools/list", {"cursor": cursor} if cursor else {}, timeout=60)
                    tools.extend(result["tools"])
                    cursor = result.get("nextCursor")
                    if not cursor:
                        break
                self.tools = tools
                self.emit("log", f"{self.label} ready: {len(tools)} tools available.")
            except Exception:
                self._kill()
                raise

    def _write(self, message):
        with self.write_lock:
            if self.closed.is_set() or not self.process or self.process.poll() is not None:
                raise RuntimeError(f"{self.label} process is not running")
            self.process.stdin.write(json.dumps(message, ensure_ascii=False) + "\n")
            self.process.stdin.flush()

    def request(self, method, params, timeout=300):
        with self.write_lock:
            self.counter += 1
            ident = self.counter
            mailbox = queue.Queue(maxsize=1)
            self.waiters[ident] = mailbox
        try:
            self._write({"jsonrpc": "2.0", "id": ident, "method": method, "params": params})
            try:
                response = mailbox.get(timeout=timeout)
            except queue.Empty:
                raise TimeoutError(f"{self.label} {method} timed out after {timeout}s") from None
            if "error" in response:
                raise RuntimeError(str(response["error"].get("message", "REA error")))
            return response["result"]
        finally:
            with self.write_lock:
                self.waiters.pop(ident, None)

    def _read(self, proc):
        try:
            for line in proc.stdout:
                try:
                    message = json.loads(line)
                    ident = message.get("id")
                    if "method" in message and ident is not None:
                        self._write({"jsonrpc": "2.0", "id": ident, "error": {"code": -32601, "message": "Client requests not supported"}})
                        continue
                    with self.write_lock:
                        waiter = self.waiters.get(ident)
                        if waiter and not waiter.full():
                            waiter.put_nowait(message)
                except (ValueError, TypeError):
                    continue
        finally:
            with self.write_lock:
                for waiter in self.waiters.values():
                    if not waiter.full():
                        waiter.put_nowait({"error": {"message": f"{self.label} process disconnected"}})

    def _stderr(self, proc):
        for line in proc.stderr:
            if line.strip():
                self.emit("log", self.label + ": " + line.strip()[:400])

    def status(self, _):
        self.start()
        return {"version": "6.5.0", "running": self.process.poll() is None, "tool_count": len(self.tools),
                "source": "https://github.com/morluto/rea", "gateway": ["rea_list_tools", "rea_call_tool"]}

    def list_tools(self, args):
        self.start()
        name = args.get("name")
        if name:
            found = next((tool for tool in self.tools if tool["name"] == name), None)
            if found is None:
                raise ValueError(f"Unknown {self.label} tool")
            return found
        query = str(args.get("query", "")).lower()
        tools = [tool for tool in self.tools if query in (tool["name"] + " " + tool.get("description", "")).lower()]
        offset = max(0, int(args.get("offset", 0)))
        limit = max(1, min(100, int(args.get("limit", 20))))
        return {"total": len(tools), "offset": offset, "tools": [
            {"name": tool["name"], "description": tool.get("description", "")[:450]}
            for tool in tools[offset:offset + limit]], "next_offset": offset + limit if offset + limit < len(tools) else None}

    def call(self, args):
        self.start()
        name = args.get("name")
        if not any(tool["name"] == name for tool in self.tools):
            raise ValueError(f"Unknown {self.label} tool")
        self.emit("log", f"{self.label} tool requested: {name}")
        return self.request("tools/call", {"name": name, "arguments": args.get("arguments", {})})

    def _kill(self):
        if self.process and self.process.poll() is None:
            # REA may own provider/worker children. Only stop this managed process tree.
            subprocess.run(["taskkill.exe", "/PID", str(self.process.pid), "/T", "/F"],
                           capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)

    def stop(self):
        self.closed.set()
        self._kill()
