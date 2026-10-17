/** Brickwire 3.0 HTTP API (/api/bw3/*). Authorized by the per-process application token (X-Brickwire-App). */
import crypto from "node:crypto";
import path from "node:path";
import type http from "node:http";
import type { Bridge } from "./bridge.js";
import { conversationTree, runNode, countNodes } from "./bw3/devtree.js";
import { chatGraph } from "./bw3/chat-graph.js";
import { blenderPreset, blenderStatus, blenderImport, BLENDER_GUIDE } from "./bw3/blender.js";
import { listModels, llmConfig } from "./bw3/llm.js";
import { TERMINAL } from "./bw3/run-store.js";
import { installInfo, installAddon, uninstallAddon, launchBlender } from "./connect/blender-link.js";
import { preparePlugin } from "./connect/plugin-files.js";

/** Tools the app may start directly (buttons in the Blender & Figma panel and in chat results). Approvals still apply. */
const APP_ACTION_TOOLS = new Set(["artifact_studio_import", "file_to_studio", "file_upload_roblox", "figma_inspect", "figma_export", "figma_to_studio", "blender_export", "blender_render", "blender_scene", "blender_import", "blender_status"]);

export async function handleBw3(ctx: { bridge: Bridge; req: http.IncomingMessage; res: http.ServerResponse; pathname: string; url: URL; body: any; token: string; send: (s: number, b: unknown, h?: Record<string, string>) => unknown }) {
  const { bridge: b, req, res, pathname: p, url, body, token, send } = ctx;
  const o = b.bw3;
  const supplied = req.headers["x-brickwire-app"];
  if (typeof supplied !== "string" || supplied.length !== token.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token)))
    return send(403, { error: "Application authorization required (reload the Brickwire app window)" });
  const GET = req.method === "GET", POST = req.method === "POST";
  const m = (re: RegExp) => p.match(re);
  const compactRun = (r: any) => ({ id: r.id, state: r.state, stage: r.stage, path: r.path, intent: r.intent, goal: r.goal, settings: r.settings, plan: r.plan, artifacts: r.artifacts, verification: r.verification, iterations: r.iterations, model: r.model, error: r.error, taskId: r.taskId, sessionId: r.sessionId, createdAt: r.createdAt, endedAt: r.endedAt, seq: r.seq, skills: r.skills ? { selected: r.skills.selected, rejected: (r.skills.rejected ?? []).slice(0, 12), warnings: r.skills.warnings, loaded: r.skills.loaded, intent: r.skills.intent, chars: r.skills.chars } : null, messageId: r.messageId, conversationId: r.conversationId, retryOf: r.retryOf });
  try {
    // ---------------- state & settings
    if (GET && p === "/api/bw3/state") {
      const tools = b.listTools();
      return send(200, { browser: { live: o.browserLive(), tabs: (o as any).hub?.status().tabs ?? [] }, llm: o.llmStatus(), studio: { ready: b.studioReady(), binding: b.currentBinding(), studios: b.studios.length }, defaults: o.defaults, conversations: o.chats.list(), active: o.runs.active().map(compactRun), skills: { total: b.skills3.all().length, auto: b.skills3.settings().autoSelect, errors: b.skills3.settings().packErrors.length }, artifacts: o.artifacts.list().length, tools: tools.filter((t) => t.available).length, toolNames: tools.map((t) => t.name), platform: process.platform });
    }
    if (GET && p === "/api/bw3/models") {
      const c = llmConfig(process.env, url.searchParams.get("model") ?? undefined);
      if (!c.ok) return send(200, { configured: false, error: c.error, models: [] });
      try { return send(200, { configured: true, current: c.config.model, models: await listModels(c.config) }); }
      catch (e) { return send(200, { configured: true, current: c.config.model, models: [], error: (e as Error).message }); }
    }
    if (POST && p === "/api/bw3/settings") return send(200, { defaults: o.saveDefaults(body.settings ?? body) });

    // Authenticated local attachments: safe download, never inline executable content.
    if (POST && p === "/api/bw3/attachments") return send(201, { attachment: o.attachments.put(body) });
    const attachmentMatch = m(/^\/api\/bw3\/attachments\/(att_[a-f0-9]{24})(?:\/(delete))?$/);
    if (attachmentMatch) {
      const id = attachmentMatch[1], a = o.attachments.get(id);
      if (GET && !attachmentMatch[2]) {
        res.writeHead(200, { "Content-Type": a.kind === "image" ? a.mime : "application/octet-stream", "Content-Length": String(a.bytes), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(a.name)}` });
        res.end(o.attachments.data(id)); return;
      }
      if (POST && attachmentMatch[2]) {
        if (o.chats.list().some(c => o.chats.get(c.id).messages.some(msg => msg.attachments?.some(x => x.id === id)))) throw Object.assign(new Error("Attachment is referenced by a chat"), { status:409 });
        o.attachments.remove(id); return send(200, {ok:true});
      }
    }
    if (POST && p === "/api/bw3/browser-send") {
      const files = o.attachments.select(body.attachments);
      const text = String(body.text || "").trim();
      if (text.length > 12000 || (!text && !files.length)) throw Error("Message required, up to 12000 characters");
      const request = (o as any).hub.addRequest({ text: [text, o.attachments.context(files.map(a=>a.id))].filter(Boolean).join("\n\n"), images:o.attachments.images(files.map(a=>a.id)), files:o.attachments.files(files.map(a=>a.id)) });
      return send(202,{request:{id:request.id},browser:o.browserLive()});
    }
    // ---------------- chats
    if (GET && p === "/api/bw3/chats") return send(200, { conversations: o.chats.list() });
    if (POST && p === "/api/bw3/chats") return send(201, { conversation: o.chats.create(body.title) });
    let x = m(/^\/api\/bw3\/chats\/(conv_[a-f0-9]{12})$/);
    if (GET && x) { const c = o.chats.get(x[1]); return send(200, { conversation: c, runs: o.runs.list({ conversationId: c.id }).map(compactRun), artifacts: o.artifacts.list({ conversationId: c.id }) }); }
    x = m(/^\/api\/bw3\/chats\/(conv_[a-f0-9]{12})\/(send|rename|delete)$/);
    if (POST && x) {
      if (x[2] === "send") return send(202, (({ conversation, run, userMessage, assistantMessage }) => ({ conversation, run: compactRun(run), userMessage, assistantMessage }))(o.send(x[1], body.text, body.settings ?? {}, { attachments: body.attachments, ...(typeof body.fromRun === "string" && /^run_[a-f0-9]{16}$/.test(body.fromRun) ? { fromRun: body.fromRun } : {}) })));
      if (x[2] === "rename") return send(200, { conversation: o.chats.rename(x[1], body.title) });
      if (o.runs.active().some((r) => r.conversationId === x![1])) throw Object.assign(new Error("Cancel the active run before deleting"), { status: 409 });
      const ids = o.chats.get(x[1]).messages.flatMap(msg => (msg.attachments || []).map(a => a.id));
      o.chats.remove(x[1]);
      for (const id of new Set(ids)) if (!o.chats.list().some(c => o.chats.get(c.id).messages.some(msg => msg.attachments?.some(a => a.id === id)))) { try { o.attachments.remove(id); } catch {} }
      return send(200, { ok: true });
    }
    // ---------------- runs & events
    x = m(/^\/api\/bw3\/runs\/(run_[a-f0-9]{16})$/);
    if (GET && x) return send(200, { run: o.runs.get(x[1]) });
    x = m(/^\/api\/bw3\/runs\/(run_[a-f0-9]{16})\/(cancel|retry)$/);
    if (POST && x) return x[2] === "cancel" ? send(200, { run: compactRun(o.cancel(x[1])) }) : send(202, { run: compactRun(o.retry(x[1]).run) });
    x = m(/^\/api\/bw3\/runs\/(run_[a-f0-9]{16})\/events$/);
    if (GET && x) {
      const id = x[1], after = Number(url.searchParams.get("after") ?? 0) || 0, wait = Math.min(25000, Math.max(0, Number(url.searchParams.get("wait") ?? 0) || 0));
      let evs = o.runs.since(id, after);
      if (!evs.length && wait && !TERMINAL.includes(o.runs.get(id).state)) {
        await new Promise<void>((resolve) => { const t = setTimeout(done, wait); function done() { clearTimeout(t); o.runs.off("event", on); resolve(); } const on = (rid: string) => { if (rid === id) done(); }; o.runs.on("event", on); });
        evs = o.runs.since(id, after);
      }
      const r = o.runs.get(id);
      return send(200, { events: evs, run: compactRun(r), reply: r.reply ?? null, draft: o.runs.draft(id) || null });
    }
    if (GET && p === "/api/bw3/stream") {
      const id = String(url.searchParams.get("run") ?? ""); const r = o.runs.get(id);
      let after = Number(url.searchParams.get("after") ?? 0) || 0;
      res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" });
      const write = (ev: string, data: unknown) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
      const flushEvents = () => { const evs = o.runs.since(id, after); if (evs.length) { after = evs.at(-1)!.seq; write("events", { events: evs }); } };
      flushEvents(); write("run", compactRun(r));
      { const draft = o.runs.draft(id); if (draft) write("partial", { text: draft }); }
      const onEvent = (rid: string) => { if (rid !== id) return; flushEvents(); const cur = o.runs.get(id); write("run", compactRun(cur)); if (TERMINAL.includes(cur.state)) { write("end", { state: cur.state, reply: cur.reply ?? null }); cleanup(); res.end(); } };
      const onDelta = (rid: string, d: string | null) => { if (rid === id) write("delta", { text: d }); };
      const onReplace = (rid: string, d: string) => { if (rid === id) write("partial", { text: d }); };
      const ping = setInterval(() => res.write(": ping\n\n"), 15000);
      const cleanup = () => { clearInterval(ping); o.runs.off("event", onEvent); o.runs.off("delta", onDelta); o.runs.off("delta-replace", onReplace); };
      o.runs.on("event", onEvent); o.runs.on("delta", onDelta); o.runs.on("delta-replace", onReplace);
      req.on("close", cleanup);
      if (TERMINAL.includes(r.state)) { write("end", { state: r.state, reply: r.reply ?? null }); cleanup(); res.end(); }
      return;
    }
    if (POST && p === "/api/bw3/approve") {
      if (typeof body.approve !== "boolean") throw Error("approve must be boolean");
      const a = b.approvals.list().find((a) => a.id === body.approvalId);
      if (!a) throw Object.assign(new Error("Approval expired or already resolved"), { status: 404 });
      if (body.runId) { const r = o.runs.get(String(body.runId)); if (a.sessionId !== r.sessionId) throw Error("Approval does not belong to this run"); }
      else if (!o.manualCalls.has(a.callId)) throw Error("Approval does not belong to a Brickwire 3.0 action");
      return send(200, { resolved: b.approvals.decide(a.id, body.approve) });
    }
    x = m(/^\/api\/bw3\/calls\/(c_[a-f0-9]{12})$/);
    if (GET && x) { const env = await b.getCall(x[1], Math.min(20000, Number(url.searchParams.get("wait") ?? 0) || 0)); if (!env) throw Object.assign(new Error("Call not found"), { status: 404 }); return send(200, b.appMcp.sanitize(env)); }

    // ---------------- development tree
    x = m(/^\/api\/bw3\/chats\/(conv_[a-f0-9]{12})\/graph$/);
    if (GET && x) { const c = o.chats.get(x[1]); return send(200, chatGraph(c, o.runs.list({ conversationId: c.id }), o.artifacts.list())); }
    if (GET && p === "/api/bw3/devtree") {
      const ops = b.operations.list();
      const taskOf = (id?: string) => { if (!id) return null; try { return b.tasks.get(id); } catch { return null; } };
      const conv = url.searchParams.get("conversation"), run = url.searchParams.get("run"), task = url.searchParams.get("task");
      let tree;
      if (conv) { const c = o.chats.get(conv); tree = conversationTree(c, o.runs.list({ conversationId: c.id }), o.artifacts.list(), ops, taskOf); }
      else if (run) { const r = o.runs.get(run); tree = runNode(r, o.artifacts.list(), ops, taskOf(r.taskId)); }
      else if (task) { const t = b.tasks.tree(task, ops); tree = { id: `task:${t.id}`, type: "task", title: t.goal, status: t.state.toLowerCase(), children: [...t.plan.map((s) => ({ id: `tplan:${t.id}:${s.id}`, type: "step", title: s.title, status: s.state, children: [] })), ...t.criteria.map((c: any) => ({ id: `crit:${t.id}:${c.id}`, type: "criterion", title: c.label, status: c.evidence?.status ?? "planned", children: [] })), ...t.operations.map((op) => ({ id: `op:${op.id}`, type: "operation", title: `${op.tool} · ${op.status ?? op.state}`, status: op.status === "success" ? "done" : op.state === "running" ? "running" : "failed", ref: { operationId: op.id, taskId: t.id }, children: [] }))] }; }
      else { const cs = o.chats.list().slice(0, 30); tree = { id: "root", type: "root", title: "Workspace", status: "info", children: cs.map((c) => conversationTree(o.chats.get(c.id), o.runs.list({ conversationId: c.id }), o.artifacts.list(), ops, taskOf)) }; }
      return send(200, { tree, nodes: countNodes(tree as any), generatedAt: new Date().toISOString() });
    }
    // ---------------- artifacts
    if (GET && p === "/api/bw3/artifacts") return send(200, { artifacts: o.artifacts.list({ library: url.searchParams.get("library") === "1" ? true : undefined }), loadErrors: o.artifacts.loadErrors });
    x = m(/^\/api\/bw3\/artifacts\/(art_[a-f0-9]{16})$/);
    if (GET && x) return send(200, { artifact: o.artifacts.get(x[1]), path: path.join(o.artifacts.dir, x[1]) });
    x = m(/^\/api\/bw3\/artifacts\/(art_[a-f0-9]{16})\/file\/(model\.obj|model\.mtl|thumb\.png)$/);
    if (GET && x) {
      const f = o.artifacts.file(x[1], x[2]);
      const dl = url.searchParams.get("download") === "1";
      res.writeHead(200, { "Content-Type": f.mime, "Cache-Control": "no-store", "Content-Length": String(f.data.length), ...(dl ? { "Content-Disposition": `attachment; filename="${o.artifacts.get(x[1]).name.replace(/[^\w-]+/g, "_")}_${f.name}"` } : {}) });
      return res.end(f.data);
    }
    x = m(/^\/api\/bw3\/artifacts\/(art_[a-f0-9]{16})\/(update|regenerate|studio|blender)$/);
    if (POST && x) {
      const id = x[1];
      if (x[2] === "update") return send(200, { artifact: o.artifacts.update(id, body) });
      if (x[2] === "regenerate") { const r = o.regenerate(id, body.variant === true, body.settings ?? {}); return send(202, { conversationId: r.conversation.id, run: compactRun(r.run) }); }
      if (x[2] === "blender") return send(200, await blenderImport(b.appMcp, String(body.serverId ?? ""), path.join(o.artifacts.dir, o.artifacts.get(id).id, "model.obj"), body.confirm === true));
      // studio
      if (body.confirm !== true) throw Object.assign(new Error("Confirm the Studio import explicitly"), { status: 403 });
      const desc = b.listTools().find((t) => t.name === "artifact_studio_import");
      if (!desc?.available) throw Object.assign(new Error(desc?.unavailableReason ?? (b.studioReady() ? "Studio import tool unavailable" : "Roblox Studio is not connected (start Studio with the MCP plugin and select the place)")), { status: 409 });
      let sid = b.sessions.current?.active ? b.sessions.current.id : undefined;
      if (!sid) sid = (await b.startSession("app-bw3", "Import generated 3D asset")).session.id;
      const env = await b.submitCall({ id: "bw3_" + crypto.randomBytes(10).toString("hex"), tool: "artifact_studio_import", args: { artifact_id: id, ...(body.parent ? { parent: String(body.parent) } : {}), ...(Array.isArray(body.position) ? { position: body.position } : {}) } }, { sessionId: sid, provider: "app-bw3" }, 200);
      o.manualCalls.add(env.callId);
      return send(202, b.appMcp.sanitize(env));
    }
    // ---------------- skills
    if (GET && p === "/api/bw3/skills") return send(200, { skills: b.skills3.list(b.listTools()), settings: b.skills3.settings(), legacy: b.skills.list(b.listTools()).map((s: any) => ({ id: s.id, name: s.name, enabled: s.enabled, compatibility: s.compatibility })) });
    if (POST && p === "/api/bw3/skills/route") { const sel = b.skills3.route(String(body.text ?? "").slice(0, 4000), { tools: b.listTools(), superMode: body.superMode === true, manual: Array.isArray(body.manual) ? body.manual : [], auto: body.auto !== false }); const comp = b.skills3.compose(sel, body.superMode ? 42000 : 30000); return send(200, { selection: sel, loaded: comp.loaded, chars: comp.chars }); }
    if (POST && p === "/api/bw3/skills/auto") { b.skills3.setAuto(body.value); return send(200, { settings: b.skills3.settings() }); }
    x = m(/^\/api\/bw3\/skills\/((?:bw50|pack)\.[\w.-]{1,120})$/);
    if (GET && x) { const s = b.skills3.get(x[1]); const st = b.skills3.list(b.listTools()).find((y: any) => y.id === s.id); return send(200, { skill: { ...s, ...st }, history: b.skills3.history(s.id) }); }
    x = m(/^\/api\/bw3\/skills\/((?:bw50|pack)\.[\w.-]{1,120})\/(enable|pin|accept)$/);
    if (POST && x) {
      if (x[2] === "enable") b.skills3.setEnabled(x[1], body.enabled === true);
      else if (x[2] === "pin") b.skills3.setPinned(x[1], body.pinned === true);
      else b.skills3.accept(x[1]);
      return send(200, { skill: b.skills3.list(b.listTools()).find((y: any) => y.id === x![1]) });
    }
    if (GET && p === "/api/bw3/skills-history") return send(200, { history: b.skills3.history() });
    // ---------------- Blender
    if (GET && p === "/api/bw3/blender") return send(200, { guide: BLENDER_GUIDE, preset: blenderPreset(process.platform), servers: blenderStatus(b.appMcp) });
    if (POST && p === "/api/bw3/blender/preset") {
      const preset = blenderPreset(process.platform, { uvxPath: body.uvxPath, safeMode: body.safeMode === true, port: body.port === undefined || body.port === "" ? undefined : Number(body.port) });
      return send(201, { id: b.appMcp.add({ ...preset, authorize: body.authorize === true }), preset });
    }
    if (POST && p === "/api/bw3/blender/test") {
      const st = blenderStatus(b.appMcp).find((s) => s.id === body.serverId);
      if (!st) throw Object.assign(new Error("Blender server not configured"), { status: 404 });
      if (st.status !== "ready") throw Object.assign(new Error(`Server is ${st.status}`), { status: 409 });
      if (!st.sceneTool) return send(200, { ok: true, tools: st.tools.map((t) => t.name), note: "Server connected; it does not report a scene-info tool." });
      if (!st.sceneTool.mode || st.sceneTool.mode === "off") throw Object.assign(new Error(`Allow ${st.sceneTool.name} (read or confirm) in MCP permissions to test`), { status: 403 });
      const r = await b.appMcp.invoke(st.sceneTool.registryName, {}, false);
      return send(200, { ok: true, tool: st.sceneTool.name, output: String(r.text ?? "").slice(0, 4000) });
    }
    // ---------------- Blender & Figma connections (3.1)
    const submitTool = async (tool: string, args: Record<string, unknown>) => {
      if (!APP_ACTION_TOOLS.has(tool)) throw Object.assign(new Error(`Tool ${tool} cannot be started from the app`), { status: 403 });
      const desc = b.listTools().find((t) => t.name === tool);
      if (!desc) throw Object.assign(new Error(`Tool ${tool} is not registered`), { status: 404 });
      if (!desc.available) throw Object.assign(new Error(desc.unavailableReason ?? (b.studioReady() ? `${tool} is unavailable` : "Roblox Studio is not connected (start Studio with the MCP plugin and select the place)")), { status: 409 });
      let sid = b.sessions.current?.active ? b.sessions.current.id : undefined;
      if (!sid) sid = (await b.startSession("app-bw3", "Blender / Figma action")).session.id;
      const env = await b.submitCall({ id: "bw3_" + crypto.randomBytes(10).toString("hex"), tool, args }, { sessionId: sid, provider: "app-bw3" }, 200);
      o.manualCalls.add(env.callId);
      return b.appMcp.sanitize(env);
    };
    if (GET && p === "/api/bw3/connect") {
      const port = b.config.port;
      return send(200, { port, blender: { ...b.blender.status(), install: installInfo() }, figma: { token: b.figma.settings.public(), pushes: b.figma.pushes.list().slice(0, 12), pluginDir: preparePlugin(b.config.dataDir, port).dir } });
    }
    if (POST && p === "/api/bw3/connect/blender/install") return send(200, installAddon(b.config.port));
    if (POST && p === "/api/bw3/connect/blender/uninstall") return send(200, uninstallAddon());
    if (POST && p === "/api/bw3/connect/blender/launch") return send(200, launchBlender(b.config.port));
    if (POST && p === "/api/bw3/connect/blender/import") {
      // user-initiated import of a Brickwire 3D artifact / stored file into the connected Blender (fixed operation, no Python)
      const tool = b.listTools().find((t) => t.name === "blender_import");
      if (!tool) throw Object.assign(new Error("blender_import is not registered"), { status: 404 });
      return send(202, await submitTool("blender_import", { ...(body.artifactId ? { artifact_id: String(body.artifactId) } : {}), ...(body.fileId ? { fileId: String(body.fileId) } : {}) }));
    }
    if (POST && p === "/api/bw3/connect/figma/token") return send(200, { token: b.figma.settings.setToken(String(body.token ?? "")) });
    if (POST && p === "/api/bw3/connect/tool") return send(202, await submitTool(String(body.tool ?? ""), body.args && typeof body.args === "object" ? body.args : {}));
    x = m(/^\/api\/bw3\/chats\/(conv_[a-f0-9]{12})\/action$/);
    if (POST && x) {
      const msg = o.chats.get(x[1]).messages.find((mm) => mm.id === String(body.messageId ?? ""));
      const act = msg?.actions?.[Number(body.index)];
      if (!act) throw Object.assign(new Error("Action not found"), { status: 404 });
      return send(202, await submitTool(act.tool, act.args));
    }
    if (POST && p === "/api/bw3/focus") return send(200, { focus: o.focus(body.conversationId) });
    if (GET && p === "/api/bw3/results") {
      const after = Number(url.searchParams.get("after") ?? -1), wait = Math.min(25000, Math.max(0, Number(url.searchParams.get("wait") ?? 0) || 0));
      if (after < 0) return send(200, { head: o.resultsHead, items: [] });
      let items = o.resultsSince(after);
      if (!items.length && wait) {
        await new Promise<void>((resolve) => { const t = setTimeout(done, wait); function done() { clearTimeout(t); o.results.off("result", done); req.off("close", done); resolve(); } o.results.on("result", done); req.on("close", done); });
        items = o.resultsSince(after);
      }
      return send(200, { head: o.resultsHead, items });
    }
    if (GET && p === "/api/bw3/diagnostics") return send(200, { diagnostics: o.diagnostics });
    return send(404, { error: "Brickwire 3.0 route not found" });
  } catch (e) {
    const st = (e as { status?: number }).status ?? 409;
    if (res.headersSent) { try { res.end(); } catch { /* closed */ } return; }
    return send(st, { error: b.appMcp.sanitize((e as Error).message) });
  }
}
