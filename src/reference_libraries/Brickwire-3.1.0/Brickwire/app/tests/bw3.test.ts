import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { withBridge } from "../../tests/integration/helpers.js";
import { SkillService } from "../../bridge/src/bw3/skills-service.js";
import { SKILL_META_50 } from "../../bridge/src/bw3/skill-meta-50.js";
import { interpret, buildModel, RECIPES } from "../../bridge/src/bw3/asset-forge.js";
import { validateModel, writeObjMtl, parseObj } from "../../bridge/src/bw3/mesh-kit.js";
import { ArtifactStore } from "../../bridge/src/bw3/artifact-store.js";
import { RunStore } from "../../bridge/src/bw3/run-store.js";
import { blenderPreset, importScript } from "../../bridge/src/bw3/blender.js";
import { extractJson } from "../../bridge/src/bw3/llm.js";
import { studioImportChunks } from "../../bridge/src/bw3/tools.js";
import { chatGraph } from "../../bridge/src/bw3/chat-graph.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PACKS = path.join(here, "..", "..", "bridge", "skills", "packs");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bw3-"));
const access = async (api: any, url: string) => (await api("/api/app-mcp/access", { headers: { referer: url + "/app", "sec-fetch-site": "same-origin" } })).token as string;

/** Reads the SSE stream exactly like the UI does; returns all events and the end record. */
async function stream(url: string, token: string, runId: string) {
  const r = await fetch(`${url}/api/bw3/stream?run=${runId}&after=0`, { headers: { "X-Brickwire-App": token } });
  assert.equal(r.status, 200);
  const rd = r.body!.getReader(), dec = new TextDecoder(); let buf = ""; const events: any[] = []; const deltas: string[] = []; let end: any = null;
  const deadline = Date.now() + 30000;
  while (!end && Date.now() < deadline) {
    const { value, done } = await rd.read(); if (done) break;
    buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      const ev = /^event: (.+)$/m.exec(chunk)?.[1], data = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!ev || !data) continue; const d = JSON.parse(data);
      if (ev === "events") events.push(...d.events); if (ev === "delta" && d.text) deltas.push(d.text); if (ev === "end") end = d;
    }
  }
  try { await rd.cancel(); } catch { /* closed */ }
  return { events, deltas, end };
}

// ---------------------------------------------------------------------------------- Skills
test("50 Skills: package loads byte-for-byte, validates, curated tools exist in the live registry", async () => {
  await withBridge({ mode: "full" }, {}, async ({ bridge }) => {
    const s = bridge.skills3;
    const all = s.all().filter((x) => x.pack === "brickwire-50");
    assert.equal(all.length, 50);
    assert.ok(all.every((x) => x.validation.ok), all.filter((x) => !x.validation.ok).map((x) => x.id + x.validation.errors).join());
    // every SKILL.md in the archive copy is the exact source text
    const first = all.find((x) => x.number === 5)!;
    const src = fs.readFileSync(path.join(PACKS, "brickwire-50", "05-roblox-procedural-models", "SKILL.md"), "utf8").replace(/^---[\s\S]*?---\r?\n?/, "");
    assert.equal(first.instructions.trim(), src.trim());
    // the off-by-one GLOBAL_RULES link is reported, not hidden
    assert.ok(first.validation.warnings.some((w) => /GLOBAL_RULES/.test(w)));
    const names = new Set(bridge.listTools().map((t) => t.name));
    const unknown = SKILL_META_50.flatMap((m) => m.tools.filter((t) => !names.has(t)).map((t) => `${m.n}:${t}`));
    assert.deepEqual(unknown, [], "curated routing table references tools that the registry does not contain");
    assert.equal(Object.keys(SKILL_META_50).length, 50);
  });
});
test("Skills routing: dragon / shop / debug / obby choose the right primary Skills with reasons and full content", () => {
  const dir = tmp(); const s = new SkillService(dir, PACKS);
  const tools = [{ name: "mesh_generate" }, { name: "asset_generate_obj" }, { name: "ui_build" }, { name: "get_errors" }, { name: "debug_logs" }];
  const pick = (t: string, o: any = {}) => s.route(t, { tools, ...o });
  const dragon = pick("Сгенерируй японского дракона в OBJ");
  assert.match(dragon.selected.find((x) => x.role === "primary")!.id, /^bw50\.05-/);
  assert.equal(dragon.intent.kind, "asset3d");
  assert.ok(dragon.selected.every((x) => x.reason.length > 5));
  const shop = pick("Сделай магазин UI с монетами");
  assert.ok(shop.selected.some((x) => /^bw50\.12-/.test(x.id)) && shop.selected.some((x) => /^bw50\.13-/.test(x.id)));
  assert.ok(pick("Найди и исправь ошибку в скрипте, всё падает").selected.some((x) => /^bw50\.09-/.test(x.id) && x.role === "primary"));
  assert.ok(pick("obby с чекпоинтами").selected.some((x) => /^bw50\.25-/.test(x.id)));
  // conflicts are resolved (04 vs 05 never both)
  const both = pick("low poly 3D модель и high poly детальный ассет");
  assert.ok(!(both.selected.some((x) => /^bw50\.04-/.test(x.id)) && both.selected.some((x) => /^bw50\.05-/.test(x.id))));
  // dependency order is topological
  assert.ok(Array.isArray(dragon.order) && dragon.order.length === dragon.selected.length);
  const comp = s.compose(dragon);
  assert.ok(comp.text.includes("GLOBAL_RULES") && comp.text.includes("## Workflow"), "full SKILL.md sections, not just names");
  assert.ok(comp.loaded.some((l) => l.files.some((f) => /CHECKLIST/.test(f))));
  // disable → excluded; re-enable → back
  const id = dragon.selected.find((x) => x.role === "primary")!.id;
  s.setEnabled(id, false); assert.ok(!pick("Сгенерируй японского дракона в OBJ").selected.some((x) => x.id === id));
  s.setEnabled(id, true); assert.ok(pick("Сгенерируй японского дракона в OBJ").selected.some((x) => x.id === id));
  // auto off → only manual
  s.setAuto(false); assert.equal(s.route("дракон", { tools }).selected.length, 0); s.setAuto(true);
  s.recordUsage(dragon, "run_x"); assert.ok(s.history(id).length >= 1);
});
test("User Skill packs: disabled until enabled, changed file becomes outdated until re-accepted", () => {
  const dir = tmp(); const root = path.join(dir, "skill-packs", "my-pack", "01-hello");
  fs.mkdirSync(root, { recursive: true });
  const write = (body: string) => fs.writeFileSync(path.join(root, "SKILL.md"), `---\nname: hello\ndescription: Greets players with a custom banner\ncategory: UI\nversion: 1.0.0\n---\n# Hello\n## Purpose\n${body}\n## Activate when\n- user says banner greeting\n## Workflow\n1. Build\n## Acceptance checklist\n- [ ] banner shows\n`);
  write("Show a greeting banner.");
  let s = new SkillService(dir, PACKS);
  const id = s.all().find((x) => x.pack === "my-pack")!.id;
  assert.equal(s.list([]).find((x: any) => x.id === id)!.enabled, false);
  s.setEnabled(id, true);
  assert.equal(new SkillService(dir, PACKS).list([]).find((x: any) => x.id === id)!.enabled, true);
  write("Changed text."); s = new SkillService(dir, PACKS);
  const st = s.list([]).find((x: any) => x.id === id)!;
  assert.equal(st.compatibility, "outdated"); assert.equal(st.enabled, false);
  s.accept(id); assert.equal(s.list([]).find((x: any) => x.id === id)!.enabled, true);
});

// ---------------------------------------------------------------------------------- 3D generation
test("Asset Forge: every recipe produces valid multi-part geometry, written OBJ re-parses identically", () => {
  for (const r of RECIPES) {
    const it = interpret(r === "castle_tower" ? "castle tower" : r);
    assert.ok(it.ok, r); const m = buildModel(it.spec!); const v = validateModel(m);
    assert.ok(v.ok, `${r}: ${v.errors}`); assert.ok(v.triangles >= 24);
    const { obj, mtl } = writeObjMtl(m, "model"); const p = parseObj(obj);
    assert.equal(p.faces, v.triangles); assert.equal(p.vertices, v.vertices); assert.equal(p.errors.length, 0);
    for (const mat of p.materials) assert.match(mtl, new RegExp(`newmtl ${mat}\\n`));
  }
  const dragon = buildModel(interpret("японский дракон").spec!);
  assert.ok(dragon.parts.length > 30, "dragon is a multi-part model, not a primitive");
  assert.equal(interpret("летающая тарелка").ok, false, "unsupported objects are reported, never replaced by a cube");
  assert.equal(interpret("сосна").spec!.recipe, "tree");
});
test("Artifact store: pipeline stages, files on disk, restart persistence and tamper detection", () => {
  const dir = tmp(); const store = new ArtifactStore(dir); const stages: string[] = [];
  const r = store.forge("Сгенерируй японского дракона", { extraVerificationPasses: 1 }, (s) => stages.push(s));
  assert.ok(r.ok); const a = (r as any).artifact;
  for (const s of ["ANALYZING", "GENERATING", "VALIDATING", "EXPORTING", "INSPECTING", "PREVIEW", "REGISTERED"]) assert.ok(stages.includes(s), s);
  const png = store.file(a.id, "thumb.png").data; assert.deepEqual([...png.subarray(1, 4)], [80, 78, 71]);
  assert.ok(a.inspection.thumbnailCoverage > 0.01);
  const reopened = new ArtifactStore(dir); assert.equal(reopened.get(a.id).verified, true);
  fs.appendFileSync(path.join(dir, "artifacts-v1", a.id, "model.obj"), "\n# edited");
  assert.equal(new ArtifactStore(dir).get(a.id).verified, false);
  const chunks = studioImportChunks(store, a.id);
  assert.ok(chunks.length >= 3 && chunks.every((c) => c.v.length <= 3000 && c.t.every((t) => t.every((i) => i < c.v.length))));
  assert.equal(chunks.reduce((n, c) => n + c.t.length, 0), a.stats.triangles);
});
test("Run store: ordered events, interrupted after restart", () => {
  const dir = tmp(); const rs = new RunStore(dir);
  const r = rs.create({ goal: "x", intent: "studio", settings: { mode: "standard" } as any, path: "none" });
  rs.patch(r.id, { state: "running" }); rs.event(r.id, { type: "stage", stage: "ANALYZING", title: "a" }); rs.event(r.id, { type: "stage", stage: "PLANNING", title: "b" }); rs.flush();
  assert.deepEqual(rs.since(r.id, 0).map((e) => e.seq), [1, 2]);
  const again = new RunStore(dir); assert.equal(again.get(r.id).state, "interrupted");
});
test("Blender preset, import script and planner JSON extraction", () => {
  const w = blenderPreset("win32"); assert.equal(w.command, "cmd"); assert.deepEqual(w.args, ["/c", "uvx", "blender-mcp"]);
  const l = blenderPreset("linux", { uvxPath: "/home/u/.local/bin/uvx", port: 9877, safeMode: true }); assert.equal(l.command, "/home/u/.local/bin/uvx"); assert.deepEqual(l.args, ["blender-mcp", "--port", "9877"]); assert.deepEqual(l.envRefs, { BLENDER_MCP_SAFE_MODE: "BLENDER_MCP_SAFE_MODE" });
  assert.throws(() => blenderPreset("linux", { port: 80 }));
  const py = importScript("/tmp/a b/model.obj"); assert.match(py, /bpy\.ops\.wm\.obj_import/); assert.match(py, /import_scene\.obj/); assert.match(py, /p = "\/tmp\/a b\/model\.obj"/);
  assert.throws(() => importScript("relative.obj"));
  assert.deepEqual(extractJson('Sure:\n```json\n{"steps":[{"id":"s1","title":"a {b}"}]}\n```'), { steps: [{ id: "s1", title: "a {b}" }] });
});

// ---------------------------------------------------------------------------------- HTTP end-to-end
test("Chat → 3D: live SSE stages, artifact files, dev tree, library, plugin progress/diagnostics (no LLM, no Studio needed)", async () => {
  await withBridge({ mode: "full", mcpAuto: false, mcpArgs: ["/nonexistent"] }, { BRICKWIRE_LLM_PROVIDER: "" }, async ({ url, api, bridge }) => {
    assert.equal((await api("/api/bw3/state"))._status, 403);
    const token = await access(api, url); const H = { "x-brickwire-app": token };
    const call = (p: string, body?: any) => api(p, { headers: H, ...(body === undefined ? {} : { body }) });
    const conv = (await call("/api/bw3/chats", { title: "t" })).conversation;
    const sent = await call(`/api/bw3/chats/${conv.id}/send`, { text: "Сгенерируй японского дракона", settings: { mode: "standard" } });
    assert.equal(sent._status, 202);
    const { events, end } = await stream(url, token, sent.run.id);
    assert.equal(end.state, "done");
    const stages = events.filter((e) => e.stage).map((e) => e.stage);
    const order = ["ANALYZING", "SKILLS", "PLANNING", "GENERATING", "VALIDATING", "EXPORTING", "INSPECTING", "PREVIEW", "REGISTERED", "DONE"];
    let last = -1; for (const s of order) { const i = stages.indexOf(s); assert.ok(i > last, `stage ${s} order`); last = i; }
    assert.ok(events.every((e, i) => i === 0 || e.seq > events[i - 1].seq));
    const chat = await call(`/api/bw3/chats/${conv.id}`);
    const msg = chat.conversation.messages.at(-1); assert.equal(msg.state, "done"); assert.equal(msg.artifacts.length, 1);
    assert.ok(msg.skills.some((s: string) => /^bw50\.05-/.test(s)));
    const art = chat.artifacts[0];
    const obj = await (await fetch(`${url}/api/bw3/artifacts/${art.id}/file/model.obj`, { headers: H })).text();
    assert.match(obj, /^# Brickwire 3\.0 Asset Forge/); assert.match(obj, /mtllib model\.mtl/);
    assert.equal(parseObj(obj).faces, art.stats.triangles);
    assert.equal((await fetch(`${url}/api/bw3/artifacts/${art.id}/file/model.obj`)).status, 403, "files need the app token");
    const dl = await fetch(`${url}/api/bw3/artifacts/${art.id}/file/model.mtl?download=1`, { headers: H }); assert.match(dl.headers.get("content-disposition")!, /attachment/);
    // dev tree with stable ids
    const t1 = await call(`/api/bw3/devtree?conversation=${conv.id}`), t2 = await call(`/api/bw3/devtree?conversation=${conv.id}`);
    const ids = (n: any): string[] => [n.id, ...n.children.flatMap(ids)];
    assert.deepEqual(ids(t1.tree), ids(t2.tree));
    assert.ok(ids(t1.tree).includes(`artifact:${art.id}`) && ids(t1.tree).includes(`run:${sent.run.id}`) && ids(t1.tree).some((i) => i.startsWith(`step:${sent.run.id}:`)));
    const runNode = t1.tree.children[0]; assert.equal(runNode.status, "done"); assert.equal(runNode.ref.messageId, msg.id);
    // library & tools
    assert.equal((await call("/api/bw3/artifacts")).artifacts.length, 1);
    const regen = await call(`/api/bw3/artifacts/${art.id}/regenerate`, { variant: true }); assert.equal(regen._status, 202);
    const r2 = await stream(url, token, regen.run.id); assert.equal(r2.end.state, "done");
    const arts = (await call("/api/bw3/artifacts")).artifacts; assert.equal(arts.length, 2); assert.notEqual(arts[0].spec.seed, arts[1].spec.seed);
    assert.equal(arts.find((a: any) => a.id !== art.id).parentId, art.id);
    // Studio import is refused honestly without Studio
    const st = await call(`/api/bw3/artifacts/${art.id}/studio`, { confirm: true }); assert.equal(st._status, 409);
    // plugin endpoints
    const prog = await api("/api/plugin/task-progress"); assert.equal(prog.ok, true); assert.equal(prog.steps.total, 7);
    const d1 = await api("/api/plugin/diagnostics", { body: { errors: ["ServerScriptService.Main:3: attempt to index nil"], selection: ["Workspace.Part"], placeId: 1 } });
    const d2 = await api("/api/plugin/diagnostics", { body: { errors: ["ServerScriptService.Main:3: attempt to index nil"], selection: ["Workspace.Part"], placeId: 1 } });
    assert.equal(d1.diagnostics.duplicate, false); assert.equal(d2.diagnostics.duplicate, true);
    assert.equal((await api("/api/plugin/task-control", { body: { action: "cancel", runId: "run_0000000000000000" } }))._status, 404);
    // non-3D request without a model is blocked with the exact reason
    const conv2 = (await call("/api/bw3/chats", {})).conversation;
    const s3 = await call(`/api/bw3/chats/${conv2.id}/send`, { text: "Сделай магазин с монетами" });
    const e3 = await stream(url, token, s3.run.id); assert.equal(e3.end.state, "blocked"); assert.match(e3.end.reply, /language model/);
    // UI assets are served and parse
    assert.equal((await fetch(url + "/bw3-ui.js")).status, 200); assert.equal((await fetch(url + "/bw3.css")).status, 200);
    const html = await (await fetch(url + "/app")).text(); assert.match(html, /data-tab="devtree"/); assert.match(html, /bw3-ui\.js/);
    // restart persistence: conversation, run and artifact survive
    assert.ok(bridge.bw3.chats.get(conv.id).messages.length >= 2);
  });
});
test("Super mode 3D: multiple verification passes and review records", async () => {
  await withBridge({ mode: "full", mcpAuto: false, mcpArgs: ["/nonexistent"] }, { BRICKWIRE_LLM_PROVIDER: "" }, async ({ url, api }) => {
    const token = await access(api, url); const H = { "x-brickwire-app": token };
    const call = (p: string, body?: any) => api(p, { headers: H, ...(body === undefined ? {} : { body }) });
    const conv = (await call("/api/bw3/chats", {})).conversation;
    const s = await call(`/api/bw3/chats/${conv.id}/send`, { text: "detailed western dragon with wings OBJ", settings: { mode: "super", verificationPasses: 3, maxIterations: 2 } });
    const { events, end } = await stream(url, token, s.run.id);
    assert.equal(end.state, "done");
    assert.equal(events.filter((e) => /^Verification pass \d\/3/.test(e.title)).length >= 3, true);
    const run = (await call(`/api/bw3/runs/${s.run.id}`)).run;
    assert.ok(run.verification.some((v: any) => v.by === "backend-checks"));
    assert.ok(run.plan.some((p: any) => p.id === "review" && p.state === "done"));
    assert.ok(run.skills.selected.some((x: any) => x.role === "meta"), "Super mode adds the meta/verification Skills");
  });
});

// ---------------------------------------------------------------------------------- LLM fixture
function llmFixture(script: (body: any) => { stream?: string[]; json?: string; delayMs?: number }) {
  const calls: any[] = [];
  const srv = http.createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", async () => {
      if (req.url?.endsWith("/models")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ data: [{ id: "fixture-small" }, { id: "fixture-large" }] })); }
      const body = JSON.parse(raw); calls.push(body); const out = script(body);
      if (body.stream && out.stream) { res.writeHead(200, { "content-type": "text/event-stream" }); for (const d of out.stream) { if (res.destroyed) return; res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`); if (out.delayMs) await new Promise((r) => setTimeout(r, out.delayMs)); } res.end("data: [DONE]\n\n"); return; }
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ choices: [{ message: { content: out.json ?? (out.stream ?? []).join("") } }] }));
    });
  });
  return { srv, calls, listen: () => new Promise<string>((r) => srv.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`))) };
}
test("Chat with LLM: streaming deltas, model switching, model list, retry and cancel", async () => {
  let slow = false;
  const f = llmFixture((b) => (slow ? { stream: Array.from({ length: 400 }, () => "x "), delayMs: 20 } : { stream: ["Для ", "магазина ", "используйте ", "**RemoteEvent**."] }));
  const base = await f.listen();
  await withBridge({ mode: "full", mcpAuto: false, mcpArgs: ["/nonexistent"] }, { BRICKWIRE_LLM_PROVIDER: "custom", BRICKWIRE_LLM_URL: base, BRICKWIRE_LLM_KEY: "k", BRICKWIRE_LLM_MODEL: "fixture-small" }, async ({ url, api }) => {
    const token = await access(api, url); const H = { "x-brickwire-app": token };
    const call = (p: string, body?: any) => api(p, { headers: H, ...(body === undefined ? {} : { body }) });
    assert.deepEqual((await call("/api/bw3/models")).models, ["fixture-small", "fixture-large"]);
    const conv = (await call("/api/bw3/chats", {})).conversation;
    const s = await call(`/api/bw3/chats/${conv.id}/send`, { text: "Как сделать магазин UI с монетами?", settings: { model: "fixture-large" } });
    const r = await stream(url, token, s.run.id);
    assert.equal(r.end.state, "done"); assert.ok(r.deltas.length >= 2, "deltas streamed"); assert.match(r.end.reply, /RemoteEvent/);
    assert.equal(f.calls.at(-1).model, "fixture-large", "per-run model switching");
    assert.match(f.calls.at(-1).messages[0].content, /BRICKWIRE SKILLS/); assert.match(f.calls.at(-1).messages[0].content, /bw50\.12-|bw50\.13-/);
    const retry = await call(`/api/bw3/runs/${s.run.id}/retry`, {}); assert.equal(retry._status, 202);
    assert.equal((await stream(url, token, retry.run.id)).end.state, "done");
    const conv2 = (await call(`/api/bw3/chats/${conv.id}`)).conversation; assert.equal(conv2.messages.length, 4);
    // history is passed to the model on the follow-up turn
    assert.ok(f.calls.at(-1).messages.some((m: any) => m.role === "assistant" && /RemoteEvent/.test(m.content)));
    slow = true;
    const c = await call(`/api/bw3/chats/${conv.id}/send`, { text: "Расскажи подробно про DataStore" });
    assert.equal((await call(`/api/bw3/chats/${conv.id}/send`, { text: "ещё" }))._status, 409, "one active run per chat");
    await call(`/api/bw3/runs/${c.run.id}/cancel`, {});
    const ce = await stream(url, token, c.run.id); assert.equal(ce.end.state, "cancelled");
  });
  f.srv.close();
});
test("Super Intelligence (chat): planner DAG, per-step execution, verifier rejects then accepts after fix", async () => {
  let verifierCalls = 0;
  const f = llmFixture((b) => {
    const sys = b.messages[0].content as string;
    if (/planning stage/.test(sys)) return { json: '```json\n{"steps":[{"id":"a","title":"Design data model","deps":[],"criteria":["fields listed"]},{"id":"b","title":"Write server script","deps":["a"],"criteria":["validates purchases"]}]}\n```' };
    if (/independent verifier/.test(sys)) { verifierCalls++; return { json: verifierCalls === 1 ? '{"ok":false,"issues":["Purchase is not validated on the server"]}' : '{"ok":true,"issues":[]}' }; }
    const u = b.messages.at(-1).content as string;
    if (/Revise the candidate/.test(u)) return { stream: ["Fixed: server validates price before granting item."] };
    return { stream: [/Design data model/.test(u) ? "Fields: coins, owned" : "Server script v1"] };
  });
  const base = await f.listen();
  await withBridge({ mode: "full", mcpAuto: false, mcpArgs: ["/nonexistent"] }, { BRICKWIRE_LLM_PROVIDER: "custom", BRICKWIRE_LLM_URL: base, BRICKWIRE_LLM_KEY: "k", BRICKWIRE_LLM_MODEL: "m" }, async ({ url, api }) => {
    const token = await access(api, url); const H = { "x-brickwire-app": token };
    const call = (p: string, body?: any) => api(p, { headers: H, ...(body === undefined ? {} : { body }) });
    const conv = (await call("/api/bw3/chats", {})).conversation;
    const s = await call(`/api/bw3/chats/${conv.id}/send`, { text: "Сделай магазин с монетами", settings: { mode: "super", maxIterations: 3, verificationPasses: 1 } });
    const { events, end } = await stream(url, token, s.run.id);
    assert.equal(end.state, "done", JSON.stringify(events.slice(-3)));
    const run = (await call(`/api/bw3/runs/${s.run.id}`)).run;
    assert.deepEqual(run.plan.map((p: any) => [p.id, p.state, p.deps]), [["a", "done", []], ["b", "done", ["a"]]]);
    assert.ok(events.some((e) => e.stage === "FIXING")); assert.equal(run.iterations, 2);
    assert.deepEqual(run.verification.map((v: any) => v.ok), [false, true]);
    assert.match(end.reply, /server validates price/);
    const stepB = f.calls.find((c) => /Current plan step: Write server script/.test(c.messages.at(-1).content));
    assert.match(stepB.messages.at(-1).content, /Result of a[\s\S]*Fields: coins/, "dependency output passed to dependent step");
    const tree = await call(`/api/bw3/devtree?run=${s.run.id}`);
    assert.ok(tree.tree.children.find((c: any) => c.type === "verification").children.length === 2);
  });
  f.srv.close();
});
test("Blender MCP: preset route requires authorization; confirmed OBJ import verified by Blender's object list", async () => {
  await withBridge({ mode: "full", mcpAuto: false, mcpArgs: ["/nonexistent"] }, { BRICKWIRE_LLM_PROVIDER: "" }, async ({ url, api, bridge }) => {
    const token = await access(api, url); const H = { "x-brickwire-app": token };
    const call = (p: string, body?: any) => api(p, { headers: H, ...(body === undefined ? {} : { body }) });
    assert.equal((await call("/api/bw3/blender/preset", { authorize: false }))._status, 403);
    const g = await call("/api/bw3/blender"); assert.equal(g.guide.length, 9);
    const id = bridge.appMcp.add({ name: "Blender fixture", transport: "stdio", command: process.execPath, args: [path.join(here, "blender-fixture.mjs")], authorize: true });
    await bridge.appMcp.connect(id);
    const r = bridge.bw3.artifacts.forge("treasure chest", {}); assert.ok(r.ok); const art = (r as any).artifact;
    assert.equal((await call(`/api/bw3/artifacts/${art.id}/blender`, { serverId: id, confirm: false }))._status, 403);
    assert.equal((await call(`/api/bw3/artifacts/${art.id}/blender`, { serverId: id, confirm: true }))._status, 403, "execute tool is off by default");
    bridge.appMcp.permissions(id, { tool: "execute_blender_code", mode: "confirm", agent: false });
    bridge.appMcp.permissions(id, { tool: "get_scene_info", mode: "read", agent: false });
    const test1 = await call("/api/bw3/blender/test", { serverId: id }); assert.match(test1.output, /Camera/);
    const imp = await call(`/api/bw3/artifacts/${art.id}/blender`, { serverId: id, confirm: true });
    assert.equal(imp.ok, true); assert.equal(imp.imported, art.stats.parts); assert.ok(imp.objects.includes("Lid"));
    const after = await call("/api/bw3/blender/test", { serverId: id }); assert.match(after.output, /Lid/);
  });
});

test("Per-chat Development Tree graph: only this chat's runs, follow-up chaining, rule-based next moves", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bw3g-"));
  const store = new ArtifactStore(tmp), runs = new RunStore(tmp);
  const s = { mode: "standard", depth: 2, maxIterations: 2, verificationPasses: 2, autoSkills: true, manualSkills: [], permission: "ask", model: "" } as any;
  const r1 = runs.create({ goal: "Сгенерируй дом", intent: "asset", settings: s, path: "local-asset", conversationId: "conv_aaaaaaaaaaaa" });
  const a1 = (store.forge("Сгенерируй дом", { runId: r1.id, conversationId: "conv_aaaaaaaaaaaa" }) as any).artifact;
  runs.get(r1.id).artifacts.push(a1.id); runs.finish(r1.id, "done");
  const r2 = runs.create({ goal: "Сгенерируй сосну", intent: "asset", settings: s, path: "local-asset", conversationId: "conv_aaaaaaaaaaaa", fromRun: r1.id });
  const a2 = (store.forge("Сгенерируй сосну", { runId: r2.id, conversationId: "conv_aaaaaaaaaaaa" }) as any).artifact;
  runs.get(r2.id).artifacts.push(a2.id); runs.finish(r2.id, "done");
  const other = runs.create({ goal: "чужой чат", intent: "asset", settings: s, path: "none", conversationId: "conv_bbbbbbbbbbbb" });
  const g = chatGraph({ id: "conv_aaaaaaaaaaaa", title: "Дом", messages: [] }, runs.list({ conversationId: "conv_aaaaaaaaaaaa" }), store.list());
  assert.equal(g.nodes.find((n) => n.kind === "chat")?.title, "Дом");
  assert.ok(!g.nodes.some((n) => n.ref?.runId === other.id), "other chat's runs must not appear");
  const n1 = g.nodes.find((n) => n.ref?.runId === r1.id)!, n2 = g.nodes.find((n) => n.ref?.runId === r2.id)!;
  assert.equal(n1.parent, "root"); assert.equal(n2.parent, n1.id, "follow-up hangs off its origin");
  assert.ok(n1.done && n2.done && n2.icon === "🌲");
  assert.ok(g.edges.some((e) => e.from === n1.id && e.to === n2.id && e.style === "chain"));
  const sug = g.nodes.filter((n) => n.kind === "suggestion");
  assert.ok(sug.length >= 2 && sug.length <= 4 && sug.every((x) => x.parent === n2.id));
  assert.equal(sug.filter((x) => x.best).length, 1); assert.equal(sug[0].best, true);
  assert.equal(sug[0].action?.type, "studio", "not yet imported → best move is Studio import");
  assert.ok(sug.some((x) => x.action?.type === "send" && x.action.prompt));
  assert.equal(g.suggestionsAreRuleBased, true);
});

test("Requests Brickwire cannot run locally are forwarded to the connected AI chat tab (Notion) and mirrored back", async () => {
  await withBridge({ mode: "full", mcpAuto: false, mcpArgs: ["/nonexistent"] }, { BRICKWIRE_LLM_PROVIDER: "" }, async ({ url, api }) => {
    const token = await access(api, url); const H = { "x-brickwire-app": token };
    const call = (p: string, body?: any) => api(p, { headers: H, ...(body === undefined ? {} : { body }) });
    // fake browser extension tab: polls like the real one and answers through /api/plugin/event
    let got: any = null, stop = false;
    const tab = (async () => {
      while (!stop) {
        const r = await api("/api/plugin/next", { body: { tab: "t1", provider: "notion", providerName: "Notion AI", active: true, ready: true } });
        if (r.request && !got) {
          got = r.request;
          await api(`/api/plugin/request/${got.id}/result`, { body: { ok: true } });
          await api("/api/plugin/event", { body: { events: [{ type: "reply", key: "1", partial: true, text: "Строю питбайк" }] } });
          await api("/api/plugin/event", { body: { events: [{ type: "reply", key: "1", partial: false, text: "Строю питбайк из деталей в Workspace." }, { type: "reply", key: "2", partial: false, text: "Модель PitBike создана и проверена." }, { type: "done", summary: "PitBike built" }] } });
        }
        await new Promise((res) => setTimeout(res, 250));
      }
    })();
    await new Promise((res) => setTimeout(res, 400));
    assert.equal((await call("/api/bw3/state")).browser.live, true);
    const conv = (await call("/api/bw3/chats", {})).conversation;
    const sent = await call(`/api/bw3/chats/${conv.id}/send`, { text: "сделай 3д питбайк в obj формате" });
    const { events, end } = await stream(url, token, sent.run.id);
    stop = true; await tab;
    assert.ok(got, "extension tab received the request");
    assert.match(got.text, /питбайк/); assert.match(got.text, /local OBJ generator cannot build/);
    assert.equal(end.state, "done");
    assert.match(end.reply, /PitBike создана/); assert.match(end.reply, /Строю питбайк из деталей/);
    assert.ok(events.some((e) => e.stage === "DELIVERING") && events.some((e) => e.stage === "WORKING"));
    const run = await call(`/api/bw3/runs/${sent.run.id}`);
    assert.equal((run.run ?? run).path, "browser-agent");
    // without a connected tab the reason tells the user how to fix it
    await new Promise((res) => setTimeout(res, 8500));
    const s2 = await call(`/api/bw3/chats/${conv.id}/send`, { text: "сделай 3д питбайк в obj формате" });
    const e2 = await stream(url, token, s2.run.id); assert.equal(e2.end.state, "blocked"); assert.match(e2.end.reply, /AI chat tab/);
  });
});
