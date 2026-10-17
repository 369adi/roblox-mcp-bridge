import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { Logger } from "./logger.js";
import type { JsonSchema, McpHealth } from "../../shared/src/protocol.js";

/**
 * Minimal, dependency-free MCP client over stdio (newline-delimited JSON-RPC 2.0),
 * per the MCP spec: initialize → notifications/initialized → tools/list → tools/call.
 * Handles server pings, tools/list_changed, timeouts (with notifications/cancelled),
 * process exit and reconnect with backoff.
 */

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
  annotations?: Record<string, unknown>;
}

export interface McpCallResult {
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string; [k: string]: unknown }>;
  structuredContent?: unknown;
  isError?: boolean;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
  method: string;
}

export interface McpClientOptions {
  command: string | null;
  args: string[];
  cwd?: string;
  logger: Logger;
  initTimeoutMs?: number;
  autoReconnect?: boolean;
  clientVersion: string;
  /** Managed app servers receive only the explicitly selected environment. */
  env?: NodeJS.ProcessEnv;
  initialToolAttempts?: number;
  maxMessageChars?: number;
}

export class McpError extends Error {
  code: "timeout" | "disconnected" | "rpc" | "not_ready";
  rpcCode?: number;
  constructor(message: string, code: "timeout" | "disconnected" | "rpc" | "not_ready", rpcCode?: number) {
    super(message);
    this.code = code;
    this.rpcCode = rpcCode;
  }
}

/** Roblox Studio updated, the running StudioMCP.exe (proxy) is from an older build. */
export function isStaleProxyError(text: string): boolean {
  return /proxy is out of date|restart to update|proxy.{0,20}outdated/i.test(text);
}

export const STALE_PROXY_HINT =
  "Roblox Studio was updated and the Studio MCP proxy (StudioMCP.exe) is from an older version. Brickwire restarted it with the newest StudioMCP.exe, but Studio still rejects it: close ALL Roblox Studio windows, open Studio again (this finishes the update) and open your place — the bridge reconnects by itself. If it persists, update Studio, or set BRICKWIRE_STUDIO_MCP_PATH in .env to StudioMCP.exe of the newest folder in %LOCALAPPDATA%\\Roblox\\Versions.";

/** The version Roblox StudioMCP is known to accept; servers answer with their own version. */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

export class McpStdioClient extends EventEmitter {
  state: McpHealth["state"] = "stopped";
  tools: McpTool[] = [];
  serverInfo: { name?: string; version?: string } = {};
  serverProtocol?: string;
  capabilities: Record<string, unknown> = {};
  lastError: string | null = null;
  /** Set while Studio rejects the proxy as out of date (cleared by the next successful call). */
  staleProxy = false;
  /** Re-detects and restarts the proxy when Studio says it is out of date (installed by Bridge). */
  healer: (() => Promise<void>) | null = null;
  private healing: Promise<void> | null = null;
  private healedAt = 0;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private backoffMs = 1000;
  private stopping = false;
  private startedOnce = false;

  private opts: McpClientOptions;
  constructor(opts: McpClientOptions) {
    super();
    this.opts = opts;
    if (!opts.command) this.state = "disabled";
  }

  get commandLine(): string | null {
    return this.opts.command ? [this.opts.command, ...this.opts.args].join(" ") : null;
  }

  async start(): Promise<void> {
    if (!this.opts.command) {
      this.state = "disabled";
      return;
    }
    if (this.proc) return;
    this.stopping = false;
    this.startedOnce = true;
    this.setState("connecting");
    const log = this.opts.logger;
    log.info("mcp.spawn", this.commandLine ?? "");
    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(this.opts.command, this.opts.args, {
        cwd: this.opts.cwd,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        env: this.opts.env ?? process.env,
      });
    } catch (e) {
      this.fail(`spawn failed: ${(e as Error).message}`);
      return;
    }
    this.proc = proc;
    proc.on("error", (e) => this.fail(`MCP process error: ${e.message}`));
    proc.on("exit", (code, signal) => {
      const was = this.proc === proc;
      if (!was) return;
      this.proc = null;
      this.rejectAll(new McpError(`MCP process exited (code ${code ?? "?"}${signal ? ", " + signal : ""})`, "disconnected"));
      this.tools = [];
      if (this.stopping) {
        this.setState("stopped");
        return;
      }
      this.lastError = `MCP process exited (code ${code ?? "?"})`;
      log.warn("mcp.exit", this.lastError);
      this.setState("error");
      this.scheduleReconnect();
    });
    proc.stdin.on("error", () => undefined);
    createInterface({ input: proc.stdout }).on("line", (line) => this.onLine(line));
    createInterface({ input: proc.stderr }).on("line", (line) => {
      if (line.trim()) log.debug("mcp.stderr", line.slice(0, 500));
    });
    try {
      const init = (await this.request(
        "initialize",
        {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "brickwire-bridge", version: this.opts.clientVersion },
        },
        this.opts.initTimeoutMs ?? 20000,
      )) as { protocolVersion?: string; serverInfo?: { name?: string; version?: string }; capabilities?: Record<string, unknown> };
      this.serverProtocol = init.protocolVersion;
      this.capabilities = init.capabilities ?? {};
      this.serverInfo = init.serverInfo ?? {};
      this.notify("notifications/initialized", {});
      // StudioMCP advertises ZERO tools until a Studio instance attaches to it (and it does not always send
      // tools/list_changed). Retry for a while here; afterwards Bridge keeps polling via ensureTools().
      for (let i = 0; i < (this.opts.initialToolAttempts ?? 12); i++) {
        if (this.opts.initialToolAttempts !== undefined && !("tools" in this.capabilities)) break;
        await this.refreshTools(5000).catch((e) => log.debug("mcp.tools_list_failed", String(e)));
        if (this.tools.length || !this.proc) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      this.backoffMs = 1000;
      this.lastError = null;
      this.setState("ready");
      log.info("mcp.ready", `${this.serverInfo.name ?? "server"} ${this.serverInfo.version ?? ""} — ${this.tools.length} tools (protocol ${this.serverProtocol})`);
    } catch (e) {
      this.fail(`MCP initialize failed: ${(e as Error).message}`);
      this.killProc();
    }
  }

  private listing: Promise<McpTool[]> | null = null;

  async refreshTools(timeoutMs = 20000): Promise<McpTool[]> {
    if (this.listing) return this.listing;
    this.listing = (async () => {
      const all: McpTool[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 20; page++) {
        const r = (await this.request("tools/list", cursor ? { cursor } : {}, timeoutMs)) as { tools?: McpTool[]; nextCursor?: string };
        all.push(...(r.tools ?? []));
        if (!r.nextCursor) break;
        cursor = r.nextCursor;
      }
      const changed = JSON.stringify(all.map((t) => t.name)) !== JSON.stringify(this.tools.map((t) => t.name));
      this.tools = all;
      if (changed) {
        this.opts.logger.info("mcp.tools", `${all.length} tools: ${all.map((t) => t.name).join(", ").slice(0, 600)}`);
        this.emit("tools", all);
      }
      return all;
    })().finally(() => (this.listing = null));
    return this.listing;
  }

  /** App-only generic MCP discovery. Does not execute a tool or a prompt. */
  async discover(kind: "resources" | "prompts"): Promise<unknown[]> {
    if (this.state !== "ready") throw new McpError("MCP not connected", "not_ready");
    if (!(kind in this.capabilities)) return [];
    const rows: unknown[] = []; let cursor: string | undefined;
    for (let page = 0; page < 20; page++) {
      const r = await this.request(`${kind}/list`, cursor ? { cursor } : {}, 10000) as Record<string, unknown>;
      if (!Array.isArray(r[kind])) throw new McpError(`Malformed ${kind} list`, "rpc");
      rows.push(...r[kind] as unknown[]);
      if (rows.length > 2000) throw new McpError("Discovery limit exceeded", "rpc");
      if (!r.nextCursor) return rows;
      if (typeof r.nextCursor !== "string" || r.nextCursor === cursor) throw new McpError("Invalid discovery cursor", "rpc");
      cursor = r.nextCursor;
    }
    throw new McpError("Discovery pagination limit exceeded", "rpc");
  }
  async readResource(uri: string): Promise<unknown> {
    if (this.state !== "ready") throw new McpError("MCP not connected", "not_ready");
    return this.request("resources/read", { uri }, 15000);
  }
  async getPrompt(name: string, args: Record<string, string>): Promise<unknown> {
    if (this.state !== "ready") throw new McpError("MCP not connected", "not_ready");
    return this.request("prompts/get", { name, arguments: args }, 15000);
  }

  /** Called periodically: while the server is up but advertises no tools (Studio not attached yet), re-list. */
  async ensureTools(): Promise<void> {
    if (this.state !== "ready" || this.tools.length) return;
    await this.refreshTools(4000).catch(() => undefined);
  }

  async callTool(name: string, args: Record<string, unknown>, timeoutMs: number, retried = false): Promise<McpCallResult> {
    if (this.healing) await this.healing.catch(() => undefined);
    if (this.state !== "ready") throw new McpError(`MCP not ready (${this.state})`, "not_ready");
    let stale: string | null = null;
    try {
      const r = (await this.request("tools/call", { name, arguments: args }, timeoutMs)) as McpCallResult;
      const txt = r?.isError ? (r.content ?? []).map((c) => c.text ?? "").join(" ") : "";
      if (!txt || !isStaleProxyError(txt)) {
        this.staleProxy = false;
        return r;
      }
      stale = txt;
    } catch (e) {
      if (e instanceof McpError && e.code === "rpc" && /unknown tool|not found/i.test(e.message)) void this.refreshTools(5000).catch(() => undefined);
      if (!(e instanceof McpError && isStaleProxyError(e.message))) throw e;
      stale = e.message;
    }
    // "Client proxy is out of date, restart to update": Studio updated under a running StudioMCP.exe
    // → re-detect the newest proxy, restart it once, retry the call.
    if (!retried && this.healer) {
      if (!this.healing && Date.now() - this.healedAt > 45000) {
        this.healedAt = Date.now();
        this.opts.logger.warn("mcp.stale_proxy", `${stale} → restarting the Studio MCP proxy`);
        this.healing = (async () => {
          try {
            await this.healer!();
            for (let i = 0; i < 100 && !(this.state === "ready" && this.tools.length); i++) await new Promise((r) => setTimeout(r, 200));
          } finally {
            this.healing = null;
          }
        })();
      }
      if (this.healing) {
        await this.healing.catch(() => undefined);
        return this.callTool(name, args, timeoutMs, true);
      }
    }
    this.staleProxy = true;
    this.lastError = STALE_PROXY_HINT;
    throw new McpError(`${STALE_PROXY_HINT} (Studio said: ${stale})`, "rpc", -32603);
  }

  /** After a (re)start: wait for tools, then check Studio accepts this proxy (no "out of date"). */
  async probeAccepted(timeoutMs = 20000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until && !(this.state === "ready" && this.tools.length)) await new Promise((r) => setTimeout(r, 200));
    if (this.state !== "ready") return false;
    if (!this.tools.some((t) => t.name === "get_studio_state")) return true;
    try {
      const r = (await this.request("tools/call", { name: "get_studio_state", arguments: {} }, 8000)) as McpCallResult;
      const txt = r?.isError ? (r.content ?? []).map((c) => c.text ?? "").join(" ") : "";
      return !isStaleProxyError(txt);
    } catch (e) {
      return !isStaleProxyError((e as Error).message);
    }
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.killProc();
    this.setState(this.opts.command ? "stopped" : "disabled");
  }

  /** Switch to another launcher (re-detected StudioMCP path) and restart. */
  async setCommand(command: string, args: string[]): Promise<void> {
    await this.stop();
    this.opts.command = command;
    this.opts.args = args;
    this.backoffMs = 1000;
    await this.start();
  }

  async restart(): Promise<void> {
    await this.stop();
    await new Promise((r) => setTimeout(r, 300));
    await this.start();
  }

  // ---------------------------------------------------------------- internals
  private setState(s: McpHealth["state"]) {
    if (this.state !== s) {
      this.state = s;
      this.emit("state", s);
    }
  }

  private fail(msg: string) {
    this.lastError = msg;
    this.opts.logger.error("mcp.error", msg);
    this.setState("error");
    if (!this.proc) this.scheduleReconnect();
  }

  private scheduleReconnect() {
    if (this.stopping || this.opts.autoReconnect === false || this.reconnectTimer || !this.startedOnce) return;
    const wait = this.backoffMs;
    this.backoffMs = Math.min(30000, this.backoffMs * 2);
    this.opts.logger.info("mcp.reconnect", `retrying in ${wait}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.start();
    }, wait);
  }

  private killProc() {
    const p = this.proc;
    if (!p) return;
    this.proc = null;
    this.rejectAll(new McpError("MCP connection closed", "disconnected"));
    try {
      if (process.platform === "win32" && p.pid) execFile("taskkill", ["/pid", String(p.pid), "/T", "/F"], () => undefined);
      else p.kill();
    } catch {
      /* already gone */
    }
  }

  private rejectAll(err: Error) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private write(msg: unknown) {
    if (!this.proc) throw new McpError("MCP process not running", "disconnected");
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  private notify(method: string, params: unknown) {
    try {
      this.write({ jsonrpc: "2.0", method, params });
    } catch {
      /* ignore */
    }
  }

  private request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.notify("notifications/cancelled", { requestId: id, reason: "timeout" });
        reject(new McpError(`${method} timed out after ${timeoutMs}ms`, "timeout"));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.write({ jsonrpc: "2.0", id, method, params });
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  private onLine(line: string) {
    const t = line.trim();
    if (this.opts.maxMessageChars && t.length > this.opts.maxMessageChars) { this.fail("MCP response exceeded size limit"); this.killProc(); return; }
    if (!t) return;
    let msg: { id?: number | string; method?: string; result?: unknown; error?: { code: number; message: string }; params?: unknown };
    try {
      msg = JSON.parse(t);
    } catch {
      this.opts.logger.debug("mcp.noise", t.slice(0, 300)); // e.g. echo from a .bat launcher
      return;
    }
    if (msg.method && msg.id !== undefined) {
      // server → client request
      if (msg.method === "ping") this.safeWrite({ jsonrpc: "2.0", id: msg.id, result: {} });
      else if (msg.method === "roots/list") this.safeWrite({ jsonrpc: "2.0", id: msg.id, result: { roots: [] } });
      else this.safeWrite({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: `client does not support ${msg.method}` } });
      return;
    }
    if (msg.method) {
      if (msg.method === "notifications/tools/list_changed") {
        this.opts.logger.info("mcp.tools_changed");
        void this.refreshTools().catch((e) => this.opts.logger.warn("mcp.tools_refresh_failed", String(e)));
      } else if (msg.method === "notifications/message") {
        this.opts.logger.debug("mcp.server_log", JSON.stringify(msg.params).slice(0, 500));
      }
      return;
    }
    if (typeof msg.id === "number" && this.pending.has(msg.id)) {
      const p = this.pending.get(msg.id)!;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new McpError(`${p.method}: ${msg.error.message} (${msg.error.code})`, "rpc", msg.error.code));
      else p.resolve(msg.result);
    }
  }

  private safeWrite(m: unknown) {
    try {
      this.write(m);
    } catch {
      /* ignore */
    }
  }
}

/** Normalize an MCP tools/call result into text + parsed JSON (images summarized, not inlined). */
export function normalizeMcpResult(r: McpCallResult): { text: string; json: unknown; isError: boolean; images: number } {
  const texts: string[] = [];
  let images = 0;
  for (const c of r.content ?? []) {
    if (c.type === "text" && typeof c.text === "string") texts.push(c.text);
    else if (c.type === "image") {
      images++;
      texts.push(`[image ${c.mimeType ?? ""} ${c.data ? Math.round((c.data.length * 3) / 4 / 1024) + "KB" : ""} — viewable in Studio/dashboard only]`);
    } else if (c.type === "resource") texts.push(JSON.stringify(c.resource ?? c).slice(0, 4000));
    else texts.push(JSON.stringify(c).slice(0, 2000));
  }
  const text = texts.join("\n");
  let json: unknown = r.structuredContent ?? null;
  if (json === null && texts.length === 1) {
    try {
      json = JSON.parse(texts[0]);
    } catch {
      json = null;
    }
  }
  return { text, json, isError: !!r.isError || bodyLooksFailed(text), images };
}

/**
 * Studio MCP tools often report failure as a NORMAL result (isError=false), e.g. execute_luau →
 * "Error executing code: …". Treat a result whose first line opens with an error lead-in as failed,
 * so the agent never sees a fake success. Phrase-based, so "Errors: 0" is not a failure.
 */
const BODY_ERR_RE = /^\s*(error executing|error:|exception|traceback|communication error|failed to|could ?not|cannot |unable to|fatal|unknown tool)\b/i;
export function bodyLooksFailed(text: string): boolean {
  const first = text.replace(/^Output of '[^']*':\n?/, "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return BODY_ERR_RE.test(first);
}

/** "No Studio attached right now" answers — transient during Studio restarts / place switches. */
export function looksLikeStudioDrop(text: string): boolean {
  if (text.length > 500) return false; // real tool output (e.g. a script containing these words), not a status line
  return /(no active studio|unable to find an active studio|has disconnected|no roblox studio instance|doesn't have a place|no place opened)/i.test(text);
}
