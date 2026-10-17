import {handleWorkspace} from "./workspace-routes.js";
import {handleAppSkills} from "./app-skills-routes.js";
import {handleAppRuntime} from "./app-runtime-routes.js";
import { handleBw3 } from "./bw3-routes.js";
import { handleConnect } from "./connect/routes.js";
import { handleAppMcp, appMcpAsset } from "./app-mcp-routes.js";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROVIDERS } from "../../shared/src/providers.js";
import type { Bridge } from "./bridge.js";
import { MEMORY_CATEGORIES, type MemoryCategory } from "./memory.js";
import type { LogEntry, ToolCall } from "../../shared/src/protocol.js";
import { HeadlessRunner, headlessConfigFromEnv } from "./headless.js";
import { ChatOutbox } from "../../shared/src/chat-outbox.js";
import { PluginHub, type PluginControl } from "../../shared/src/plugin-hub.js";
import { handlePro } from "./pro-routes.js";
import { uiMergeFactory } from "../../shared/src/studio2/ui-merge.js";
import { BUILTIN_COMPONENTS } from "../../shared/src/studio2/uidoc.js";

/**
 * Local HTTP API (127.0.0.1 only).
 * Security: rejects foreign web origins (only chrome-extension:// / the dashboard itself / no-origin local tools),
 * validates Host header against DNS rebinding, and caps body size.
 */

const MAX_BODY = 40 * 1024 * 1024; // M5: Paint PNGs (1920x1080) go through /api/outbox

function findDashboard(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const p of [path.join(here, "dashboard.html"), path.join(here, "..", "src", "dashboard.html"), path.join(here, "..", "dist", "dashboard.html")]) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function originAllowed(origin: string | undefined, port: number): boolean {
  if (!origin) return true; // local CLI tools (curl, scripts) — they already have local access
  if (/^(chrome|moz)-extension:\/\/[a-z0-9-]+$/i.test(origin)) return true;
  if (origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`) return true;
  return false;
}

export function hostAllowed(host: string | undefined, port: number): boolean {
  if (!host) return false;
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`;
}

export function createServer(bridge: Bridge, opts: { onShutdown?: () => void } = {}) {
  const port = bridge.config.port;
  const appMcpToken = crypto.randomBytes(32).toString("hex");
  const dashFile = findDashboard();
  const sseClients = new Set<http.ServerResponse>();
  const outbox = new ChatOutbox();
  const pluginHub = new PluginHub();
  pluginHub.attachmentSink = (items) => items.map((it) => { const f = bridge.aiFiles.add(Buffer.from(it.data, "base64"), { name: it.name, mime: it.mime, source: "user" }); return `${f.name} (${f.kind}, ${Math.max(1, Math.round(f.bytes / 1024))} KB) → fileId ${f.id}`; });
  bridge.bw3.attachPluginHub(pluginHub);
  // M2-B headless mode: same tools / approvals / memory through Bridge.execute
  const headless = new HeadlessRunner({
    bridge: {
      listTools: () => bridge.listTools(),
      execute: (call, ctx) => bridge.execute(call, ctx),
      startSession: (provider, task) => bridge.startSession(provider, task),
      skillContext:()=>bridge.skills.agentContext(bridge.listTools()),
      runGuard: taskId=>{const task=bridge.tasks.get(taskId);const problem=bridge.tasks.check(task,false);if(problem&&/budget/.test(problem))bridge.tasks.block(taskId,problem);return problem;},
      reportClaim: async(sessionId,summary)=>{const task=bridge.tasks.forSession(sessionId);if(task?.state==="RUNNING")await bridge.verifyTask(task.id);return bridge.reportClaim(sessionId,summary);},
    },
  });

  const broadcast = (event: string, data: unknown) => {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of sseClients) c.write(payload);
  };
  let pendingHealth: NodeJS.Timeout | null = null;
  bridge.on("changed", () => {
    if (pendingHealth) return;
    pendingHealth = setTimeout(() => {
      pendingHealth = null;
      broadcast("health", bridge.health());
    }, 150);
  });
  bridge.logger.on("log", (e: LogEntry) => {
    if (e.level !== "debug") broadcast("log", e);
  });

  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    const send = (status: number, body: unknown, headers: Record<string, string> = {}) => {
      const h: Record<string, string> = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers };
      if (origin && originAllowed(origin, port)) {
        h["Access-Control-Allow-Origin"] = origin;
        h["Vary"] = "Origin";
      }
      res.writeHead(status, h);
      res.end(typeof body === "string" && h["Content-Type"].startsWith("text/") ? body : JSON.stringify(body));
    };
    try {
      if (!hostAllowed(req.headers.host, port)) return send(403, { ok: false, error: "forbidden host" });
      // The Figma plugin UI runs in a sandboxed iframe (Origin: null); it may only reach /api/figma/*.
      const figmaPath = (req.url ?? "").startsWith("/api/figma/");
      const figmaOrigin = figmaPath && (origin === "null" || origin === "https://www.figma.com");
      if (figmaOrigin) { res.setHeader("Access-Control-Allow-Origin", origin!); res.setHeader("Vary", "Origin"); }
      if (!figmaOrigin && !originAllowed(origin, port)) {
        bridge.logger.warn("http.forbidden_origin", String(origin));
        return send(403, { ok: false, error: "forbidden origin" });
      }
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": origin ?? "*",
          "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Private-Network": "true",
          "Access-Control-Max-Age": "600",
        });
        return res.end();
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
      const p = url.pathname;
      const body = req.method === "POST" || req.method === "PUT" ? await readJson(req) : {};

      if (req.method === "GET" && p === "/fonts/Oswald.ttf" && dashFile) {
        const f = fs.readFileSync(path.join(path.dirname(dashFile),"fonts","Oswald.ttf"));
        res.writeHead(200,{"Content-Type":"font/ttf","Content-Length":String(f.length),"Cache-Control":"public, max-age=86400"});res.end(f);return;
      }
      if (p.startsWith("/api/blender/") || p.startsWith("/api/figma/")) return await handleConnect({ bridge, req, res, pathname: p, url, body, send });
      if(p.startsWith("/api/bw3/"))return await handleBw3({bridge,req,res,pathname:p,url,body,token:appMcpToken,send});
      if(req.method==="GET"&&dashFile&&["/bw3-ui.js","/bw3.css","/attachments-ui.js","/motion-ui.js","/motion.css"].includes(p))return send(200,fs.readFileSync(path.join(path.dirname(dashFile),p.slice(1)),"utf8"),{"Content-Type":p.endsWith(".css")?"text/css; charset=utf-8":"text/javascript; charset=utf-8"});
      if(p.startsWith("/api/workspace"))return await handleWorkspace({bridge,req,pathname:p,body,token:appMcpToken,send,agentRunning:headless.running,headless});
      if(req.method==="GET"&&dashFile&&["/i18n.js","/workspace-ui.js","/workspace.css","/app-depth.css","/app-depth.js","/scene3d.js","/animation-editor.js"].includes(p))return send(200,fs.readFileSync(path.join(path.dirname(dashFile),p.slice(1)),"utf8"),{"Content-Type":p.endsWith(".css")?"text/css; charset=utf-8":"text/javascript; charset=utf-8"});
      if(p.startsWith("/api/app-skills"))return await handleAppSkills({bridge,req,pathname:p,body,token:appMcpToken,send});
      if(p.startsWith("/api/app-runtime"))return await handleAppRuntime({bridge,req,pathname:p,body,token:appMcpToken,send,headless});
      if (p.startsWith("/api/app-mcp")) {
        return await handleAppMcp({ bridge, req, res, pathname: p, body, token: appMcpToken, send });
      }
      if(req.method==="GET"&&p==="/app-runtime.js"&&dashFile)return send(200,fs.readFileSync(path.join(path.dirname(dashFile),"app-runtime-ui.js"),"utf8"),{"Content-Type":"text/javascript; charset=utf-8"});
      if(req.method==="GET"&&dashFile&&["/app-skills.js","/app-skills.css"].includes(p))return send(200,fs.readFileSync(path.join(path.dirname(dashFile),p.endsWith(".css")?"app-skills.css":"app-skills-ui.js"),"utf8"),{"Content-Type":p.endsWith(".css")?"text/css; charset=utf-8":"text/javascript; charset=utf-8"});
      const mcpAsset = appMcpAsset(p, dashFile);
      if (req.method === "GET" && mcpAsset) return send(200, fs.readFileSync(mcpAsset.file, "utf8"), { "Content-Type": mcpAsset.type });
      if (req.method === "GET" && (p === "/paint" || p === "/paint/")) {
        const pf = dashFile ? path.join(path.dirname(dashFile), "paint.html") : null;
        if (!pf || !fs.existsSync(pf)) return send(500, "paint.html missing", { "Content-Type": "text/plain" });
        return send(200, fs.readFileSync(pf, "utf8"), { "Content-Type": "text/html; charset=utf-8" });
      }
      if (req.method === "GET" && p === "/ui-builder/components.json") {
        return send(200, BUILTIN_COMPONENTS);
      }
      // M6: asset library search for the UI Builder (real bundled/user packs, no invented ids)
      if (req.method === "GET" && p === "/api/assets") {
        const lib = bridge.assets.load();
        const r = lib.search({ query: url.searchParams.get("q") ?? "", pack: url.searchParams.get("pack") || undefined, kind: url.searchParams.get("kind") || undefined, limit: Math.min(100, Number(url.searchParams.get("limit") ?? 40)) });
        return send(200, { ...r, packs: lib.overview() });
      }
      if (req.method === "GET" && p === "/ui-builder/ui-merge.js") {
        return send(200, `window.UIMerge=(${uiMergeFactory.toString()})();`, { "Content-Type": "text/javascript; charset=utf-8" });
      }
      // M5/M6 chat outbox: Paint / UI Builder → extension → AI chat (image attach, text fallback)
      if (req.method === "POST" && (p === "/api/outbox" || p === "/api/paint/send")) {
        const b = body as { png?: string | null; text?: string; note?: string; name?: string; source?: string; width?: number; height?: number; layers?: string[] };
        let text = b.text ?? "";
        if (p === "/api/paint/send") text = text || `[Brickwire Paint] ${b.width}x${b.height}, layers: ${(b.layers ?? []).join(", ")}${b.note ? ` — ${b.note}` : ""}`;
        try {
          const it = outbox.add({ png: b.png, text, name: b.name ?? (b.png ? `brickwire-${Date.now()}.png` : undefined), source: b.source ?? (p === "/api/paint/send" ? "paint" : "tool") });
          if (it.png) {
            const dir = path.join(process.cwd(), "generated", "paint");
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, it.name ?? `${it.id}.png`), Buffer.from(it.png, "base64"));
          }
          broadcast("outbox", outbox.view(it));
          return send(200, { ok: true, item: outbox.view(it) });
        } catch (e) {
          return send(400, { ok: false, error: (e as Error).message });
        }
      }
      if (req.method === "GET" && p === "/api/outbox/next") {
        const it = outbox.next();
        return send(200, { item: it });
      }
      if (req.method === "POST" && p.startsWith("/api/outbox/") && p.endsWith("/result")) {
        const id = decodeURIComponent(p.slice("/api/outbox/".length, -"/result".length));
        const r = body as { mode?: "image" | "text" | "none"; provider?: string; error?: string };
        const it = outbox.report(id, { mode: r.mode ?? "none", provider: r.provider, error: r.error });
        if (!it) return send(404, { error: "unknown outbox item" });
        broadcast("outbox", outbox.view(it));
        return send(200, { item: outbox.view(it) });
      }
      if (req.method === "GET" && p.startsWith("/api/outbox/")) {
        const it = outbox.get(decodeURIComponent(p.slice("/api/outbox/".length)));
        return it ? send(200, { item: outbox.view(it) }) : send(404, { error: "unknown outbox item" });
      }
      if (req.method === "GET" && (p === "/ui-builder" || p === "/ui-builder/")) {
        const ub = dashFile ? path.join(path.dirname(dashFile), "ui-builder.html") : null;
        if (!ub || !fs.existsSync(ub)) return send(500, "ui-builder.html missing", { "Content-Type": "text/plain" });
        return send(200, fs.readFileSync(ub, "utf8"), { "Content-Type": "text/html; charset=utf-8" });
      }
      if (req.method === "GET" && (p === "/" || p === "/dashboard" || p.startsWith("/dashboard/"))) {
        if (!dashFile) return send(500, "dashboard.html missing", { "Content-Type": "text/plain" });
        return send(200, fs.readFileSync(dashFile, "utf8"), { "Content-Type": "text/html; charset=utf-8" });
      }
      // Studio plugin ⇄ extension (see shared/src/plugin-hub.ts)
      if (req.method === "GET" && p.startsWith("/api/files")) {
        // AI file store (file_* tools): metadata list and base64 content so the extension can attach files to the AI chat.
        if (p === "/api/files") return send(200, { ok: true, files: bridge.aiFiles.list().slice(0, 200) });
        const fm = /^\/api\/files\/(f_[a-f0-9]{12})\/base64$/.exec(p);
        if (fm) { const f = bridge.aiFiles.get(fm[1]); if (f.bytes > 8 * 1024 * 1024) return send(413, { ok: false, error: "file larger than 8 MB" }); return send(200, { ok: true, name: f.name, mime: f.mime, bytes: f.bytes, data: bridge.aiFiles.read(f.id).toString("base64") }); }
        return send(404, { ok: false, error: "not found" });
      }
      if (p.startsWith("/api/plugin/")) {
        if (req.method === "POST" && p === "/api/plugin/request") {
          try {
            const r = pluginHub.addRequest(body);
            bridge.history.record({ kind: "request", provider: "studio-plugin", text: r.text + (r.images.length ? ` [+${r.images.length} image(s)]` : "") });
            bridge.logger.info("plugin.request", `${r.text.slice(0, 80)}${r.images.length ? ` +${r.images.length} image(s)` : ""}`);
            return send(200, { ok: true, id: r.id, status: pluginHub.status() });
          } catch (e) {
            return send(400, { ok: false, error: (e as Error).message });
          }
        }
        if (req.method === "GET" && p === "/api/plugin/feed") {
          const since = Number(url.searchParams.get("since") ?? 0) || 0;
          const wait = Math.min(20000, Math.max(0, Number(url.searchParams.get("wait") ?? 0) || 0));
          const f = await pluginHub.feed(since, wait);
          return send(200, { ok: true, ...f, bridge: { state: bridge.health().state } });
        }
        if (req.method === "GET" && p === "/api/plugin/status") return send(200, { ok: true, status: pluginHub.status(), bridge: bridge.health() });
        if (req.method === "POST" && p === "/api/plugin/control") {
          const action = String(body.action ?? "") as PluginControl;
          if (!["stop", "pause", "resume"].includes(action)) return send(400, { ok: false, error: "action must be stop | pause | resume" });
          pluginHub.control(action);
          return send(200, { ok: true });
        }
        if (req.method === "POST" && p === "/api/plugin/next") {
          const r = pluginHub.poll({
            tab: String(body.tab ?? "tab"),
            provider: String(body.provider ?? "unknown"),
            providerName: body.providerName ? String(body.providerName) : undefined,
            active: body.active === true,
            ready: body.ready !== false,
            paused: body.paused === true,
            stage: body.stage ? String(body.stage) : undefined,
            task: body.task ? String(body.task) : null,
            url: body.url ? String(body.url) : undefined,
          });
          return send(200, { ok: true, ...r });
        }
        const resMatch = p.match(/^\/api\/plugin\/request\/([A-Za-z0-9_]+)\/result$/);
        if (req.method === "POST" && resMatch) {
          const r = pluginHub.report(resMatch[1], body.ok === true, body.error ? String(body.error) : undefined);
          return send(r ? 200 : 404, { ok: !!r });
        }
        if (req.method === "POST" && p === "/api/plugin/event") {
          const evs = Array.isArray(body.events) ? body.events : [body];
          for(const e of evs)if(e?.type==="done"){const claim=bridge.reportClaim(bridge.sessions.current?.id,String(e.summary??"AI report"));e.verificationState=claim.state;bridge.history.record({kind:"note",provider:String(e.provider??""),text:`[AI report / ${claim.state}] ${String(e.summary??"AI report")}`});}
          pluginHub.pushFromExtension(evs);
          return send(200, { ok: true });
        }
        // Brickwire 3.0: live task progress, diagnostics and cancel for the Studio plugin
        if (req.method === "GET" && p === "/api/plugin/task-progress") return send(200, { ok: true, ...bridge.bw3.progressSummary() });
        if (req.method === "POST" && p === "/api/plugin/diagnostics") {
          try { return send(200, { ok: true, diagnostics: bridge.bw3.addDiagnostics(body) }); } catch (e) { return send(400, { ok: false, error: (e as Error).message }); }
        }
        if (req.method === "POST" && p === "/api/plugin/task-control") {
          if (body.action !== "cancel") return send(400, { ok: false, error: "action must be cancel" });
          const active = bridge.bw3.runs.active().find((r) => r.id === String(body.runId ?? ""));
          if (!active) return send(404, { ok: false, error: "No active run with this id" });
          return send(200, { ok: true, state: bridge.bw3.cancel(active.id).state });
        }
        return send(404, { ok: false, error: `no route ${req.method} ${p}` });
      }
      if (p.startsWith("/api/pro/") || p === "/app" || p === "/app/") {
        const handled = await handlePro(req.method ?? "GET", p, url, body, { bridge, pluginHub, dashFile, send });
        if (handled !== false) return;
      }
      if (req.method === "GET" && p === "/api/health") return send(200, bridge.health());
      if (req.method === "GET" && p === "/api/headless") {
        const cfg = headlessConfigFromEnv(process.env);
        const browser = bridge.sessions.list().filter((s) => (s as { provider?: string }).provider !== "headless" && (s as { active?: boolean }).active !== false).length;
        return send(200, { status: headless.status(), configured: cfg.ok, configError: cfg.ok ? null : cfg.error, provider: cfg.ok ? cfg.config.provider : null, model: cfg.ok ? cfg.config.model : null, activeMode: headless.running ? "headless" : browser ? "browser" : "idle" });
      }
      if (req.method === "POST" && p === "/api/headless/start") {
        const task = String((body as { task?: unknown }).task ?? "").trim();
        if (!task) return send(400, { error: "task is required" });
        if (headless.running) return send(409, { error: "headless run already active", status: headless.status() });
        const cfg = headlessConfigFromEnv(process.env);
        if (!cfg.ok) return send(400, { error: cfg.error });
        void headless.run(task).then(() => broadcast("headless", headless.status()));
        return send(202, { status: headless.status() });
      }
      if (req.method === "POST" && p === "/api/headless/stop") {
        headless.stop();
        return send(200, { status: headless.status() });
      }
      if (req.method === "GET" && p === "/api/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
          ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
        });
        res.write(`event: health\ndata: ${JSON.stringify(bridge.health())}\n\n`);
        sseClients.add(res);
        const ka = setInterval(() => res.write(": ka\n\n"), 15000);
        req.on("close", () => {
          clearInterval(ka);
          sseClients.delete(res);
        });
        return;
      }
      if (req.method === "GET" && p === "/api/tools") return send(200, { tools: bridge.listTools() });
      if (req.method === "POST" && p === "/api/tools/refresh") {
        if (bridge.mcp.state === "ready") await bridge.mcp.refreshTools();
        return send(200, { tools: bridge.listTools() });
      }
      if (req.method === "POST" && p === "/api/mcp/restart") {
        void bridge.mcp.restart();
        return send(200, { ok: true });
      }
      if (req.method === "GET" && p === "/api/providers") return send(200, { providers: PROVIDERS });

      if (req.method === "POST" && p === "/api/sessions/start") {
        try {
          return send(200, await bridge.startSession(String(body.provider ?? "unknown"), body.task ? String(body.task) : null, { mode: body.mode, category: body.category }));
        } catch (e) {
          const err = e as Error & { status?: number };
          return send(err.status ?? 500, { ok: false, error: err.message });
        }
      }
      if (req.method === "POST" && p === "/api/sessions/stop") {
        const s = bridge.endSession(String(body.sessionId ?? bridge.sessions.current?.id ?? ""));
        bridge.approvals.rejectAll();
        return send(s ? 200 : 404, s ? { session: s } : { ok: false, error: "no such session" });
      }
      if (req.method === "POST" && p === "/api/sessions/update") {
        const s = bridge.updateSession(String(body.sessionId), { stage: body.stage, task: body.task, mode: body.mode, category: body.category, trustAll: body.trustAll });
        return send(s ? 200 : 404, s ? { session: s } : { ok: false, error: "no such session" });
      }
      if (req.method === "GET" && p === "/api/sessions") return send(200, { sessions: bridge.sessions.list() });

      if (req.method === "POST" && p === "/api/calls") {
        const sessionId = body.sessionId ? String(body.sessionId) : undefined;
        if (sessionId && !bridge.sessions.get(sessionId)?.active) return send(409, { ok: false, error: "session is not active" });
        const env = await bridge.submitCall(body.call as ToolCall, { sessionId, provider: body.provider ? String(body.provider) : undefined }, clampWait(body.waitMs));
        return send(200, env);
      }
      const callMatch = p.match(/^\/api\/calls\/([A-Za-z0-9_]+)$/);
      if (req.method === "GET" && callMatch) {
        const env = await bridge.getCall(callMatch[1], clampWait(url.searchParams.get("wait")), url.searchParams.get("since") ?? undefined);
        return send(env ? 200 : 404, env ?? { ok: false, error: "unknown call" });
      }

      if (req.method === "GET" && p === "/api/approvals") return send(200, { approvals: bridge.approvals.list() });
      const apMatch = p.match(/^\/api\/approvals\/([A-Za-z0-9_]+)$/);
      if (req.method === "POST" && apMatch) {
        const ok = bridge.approvals.decide(apMatch[1], body.approve === true);
        return send(ok ? 200 : 404, { ok });
      }

      if (req.method === "GET" && p === "/api/projects") return send(200, { projects: bridge.memory.list() });
      const prMatch = p.match(/^\/api\/projects\/([A-Za-z0-9_-]+)(\/notes)?$/);
      if (prMatch && req.method === "GET" && !prMatch[2]) {
        const m = bridge.memory.get(prMatch[1]);
        return send(m ? 200 : 404, m ? { project: m, summary: bridge.memory.summary(m) } : { ok: false });
      }
      if (prMatch && prMatch[2] && req.method === "POST") {
        const m = bridge.memory.get(prMatch[1]);
        if (!m) return send(404, { ok: false });
        const cat = String(body.category) as MemoryCategory;
        if (!MEMORY_CATEGORIES.includes(cat)) return send(400, { ok: false, error: "bad category" });
        if (typeof body.remove === "number") bridge.memory.removeItem(m, cat, body.remove);
        else bridge.memory.addItem(m, cat, String(body.text ?? ""), body.path ? String(body.path) : undefined);
        return send(200, { project: m });
      }

      if (req.method === "GET" && p === "/api/logs") {
        const limit = Math.min(2000, Number(url.searchParams.get("limit") ?? 300));
        const tool = url.searchParams.get("tool");
        const level = url.searchParams.get("level");
        return send(200, {
          logs: bridge.logger.recent(limit, (e) => (!tool || e.tool === tool) && (!level || e.level === level) && (url.searchParams.get("calls") ? e.event === "tool.call" : true)),
        });
      }
      if (req.method === "GET" && p === "/api/settings") return send(200, { settings: bridge.settings });
      if ((req.method === "PUT" || req.method === "POST") && p === "/api/settings") return send(200, { settings: bridge.saveSettings(body) });
      const snapMatch = p.match(/^\/api\/snapshots\/([A-Za-z0-9_]+)\/restore$/);
      if (req.method === "POST" && snapMatch) {
        // Dashboard-initiated rollback. Goes through the normal executor (approval rules still apply).
        const env = await bridge.submitCall(
          { id: "dash_restore_" + Date.now().toString(36), tool: "restore_snapshot", args: { snapshotId: snapMatch[1] } },
          { provider: "dashboard" },
          clampWait(body.waitMs ?? 2000),
        );
        return send(200, env);
      }
      if (req.method === "POST" && p === "/api/studio/select") {
        if(body.studioId&&!bridge.studios.some(s=>s.id===String(body.studioId)))return send(409,{error:"Studio target not found"});
        return send(200, { settings: bridge.saveSettings({ selectedStudioId: body.studioId ? String(body.studioId) : null }) });
      }
      if (req.method === "POST" && p === "/api/shutdown") {
        send(200, { ok: true });
        setTimeout(() => opts.onShutdown?.(), 100);
        return;
      }
      return send(404, { ok: false, error: `no route ${req.method} ${p}` });
    } catch (e) {
      bridge.logger.error("http.error", (e as Error).message);
      return send((e as { status?: number }).status ?? 500, { ok: false, error: (e as Error).message });
    }
  });
  server.on("close", () => {
    for (const c of sseClients) c.end();
  });
  return server;
}

function clampWait(v: unknown): number {
  const n = Number(v ?? 20000);
  return Number.isFinite(n) ? Math.min(25000, Math.max(0, n)) : 20000;
}

function readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("body too large"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(v && typeof v === "object" ? v : {});
      } catch {
        reject(Object.assign(new Error("invalid JSON body"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}
