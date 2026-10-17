/**
 * E2E (no browser): Blender and Figma connections through the real bridge.
 *  - the real Brickwire Connector add-on runs in Python against a stub `bpy` and long-polls the bridge;
 *  - AI tools blender_scene / blender_python / blender_export / blender_import go through /api/calls;
 *  - the add-on pushes the selection; Figma plugin pushes a frame (Origin: null) and figma_to_studio builds it
 *    in the mock Studio; all results land in the app chat (messages with artifacts / images / actions).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startBridge, studioState, findChild } from "./harness.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
async function waitFor<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms; let v = await fn();
  while (!pred(v)) { if (Date.now() > end) throw new Error(`timeout waiting for ${what}; last=${JSON.stringify(v).slice(0, 800)}`); await new Promise((r) => setTimeout(r, 200)); v = await fn(); }
  return v;
}

test("E2E Blender + Figma: add-on ↔ bridge, AI tools, results in the app chat, Figma frame → ScreenGui", { timeout: 180000 }, async () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), "bw-blender-cfg-"));
  fs.mkdirSync(path.join(cfg, "4.2"), { recursive: true });
  const bridge = await startBridge({ BRICKWIRE_BLENDER_CONFIG_DIR: cfg });
  const base = `http://127.0.0.1:${bridge.port}`;
  const j = async (p: string, body?: unknown, headers: Record<string, string> = {}) => { const r = await fetch(base + p, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, body: (await r.json()) as any }; };
  const tok = await fetch(base + "/api/app-mcp/access", { headers: { referer: `${base}/app`, "sec-fetch-site": "same-origin" } }).then((r) => r.json() as Promise<any>);
  assert.ok(tok.token, "app token");
  const app = (p: string, body?: unknown) => j(p, body, { "X-Brickwire-App": tok.token });
  let blender: ReturnType<typeof spawn> | null = null, bout = "";
  try {
    // one-click install into the (temporary) Blender config dir with the bridge port filled in
    const inst = await app("/api/bw3/connect/blender/install", {});
    assert.equal(inst.status, 200, JSON.stringify(inst.body));
    const addonFile = path.join(cfg, "4.2", "scripts", "startup", "brickwire_blender.py");
    assert.match(fs.readFileSync(addonFile, "utf8"), new RegExp(`^DEFAULT_PORT = ${bridge.port}\\b`, "m"));
    const conv = (await app("/api/bw3/chats", { title: "Blender test" })).body.conversation;
    await app("/api/bw3/focus", { conversationId: conv.id });
    const head = (await app("/api/bw3/results?after=-1")).body.head;

    blender = spawn("python3", [path.join(ROOT, "tests", "mocks", "fake_blender.py"), addonFile], { env: { ...process.env, BRICKWIRE_URL: base, FAKE_PUSH: "1", FAKE_SECONDS: "120" }, stdio: ["ignore", "pipe", "pipe"] });
    blender.stdout!.on("data", (d) => (bout += d)); blender.stderr!.on("data", (d) => (bout += d));
    const st = await waitFor(() => j("/api/blender/status").then((r) => r.body), (s) => s.connected, 20000, "blender connected");
    assert.equal(st.clients[0].blender, "4.2.0 (fake)"); assert.equal(st.clients[0].outdated, false);

    // the add-on pushes the selection by itself: results long-poll wakes up, chat gets the model + picture
    const res = await app(`/api/bw3/results?after=${head}&wait=20000`);
    assert.ok(res.body.items.length >= 1, "result announced");
    assert.equal(res.body.items[0].conversationId, conv.id, "result goes to the chat open in the app");
    let c = (await app(`/api/bw3/chats/${conv.id}`)).body;
    const pushMsg = c.conversation.messages.find((m: any) => m.source === "blender");
    assert.ok(pushMsg, "blender message in chat");
    assert.match(pushMsg.text, /Cube\.glb/); assert.match(pushMsg.text, /fileId f_[a-f0-9]{12}/);
    assert.equal(pushMsg.artifacts.length, 1, "OBJ became a 3D artifact");
    assert.equal(pushMsg.attachments[0].kind, "image", "viewport picture attached");
    const art = c.artifacts.find((a: any) => a.id === pushMsg.artifacts[0]);
    assert.equal(art.source, "blender"); assert.equal(art.stats.triangles, 12); assert.equal(art.stats.vertices, 8);
    assert.ok(pushMsg.actions.some((a: any) => a.tool === "artifact_studio_import"));
    const thumb = await fetch(`${base}/api/bw3/artifacts/${art.id}/file/thumb.png`, { headers: { "X-Brickwire-App": tok.token } });
    assert.equal(thumb.status, 200); assert.ok((await thumb.arrayBuffer()).byteLength > 1000);

    // AI tools through the normal call path
    const sess = (await j("/api/sessions/start", { provider: "test", task: "blender" })).body.session;
    const call = async (tool: string, args: Record<string, unknown>) => {
      let env = (await j("/api/calls", { sessionId: sess.id, call: { id: "c_" + Math.random().toString(16).slice(2, 14).padEnd(12, "0"), tool, args }, waitMs: 20000 })).body;
      for (let i = 0; i < 60 && env.state !== "done"; i++) {
        if (env.state === "pending_approval") await j("/api/approvals/" + env.approvalId, { approve: true });
        env = (await j(`/api/calls/${env.callId}?wait=3000`)).body;
      }
      return env.result;
    };
    const scene = await call("blender_scene", {});
    assert.equal(scene.status, "success", JSON.stringify(scene));
    assert.deepEqual(scene.result.selected, ["Cube"]); assert.equal(scene.result.file, "castle.blend");
    const py = await call("blender_python", { code: "print('hi from', bpy.app.version_string)\nresult = len(bpy.data.objects)" });
    assert.equal(py.status, "success", JSON.stringify(py));
    assert.match(py.result.stdout, /hi from 4\.2\.0/); assert.equal(py.result.result, 2);
    const ex = await call("blender_export", { formats: ["fbx", "obj"] });
    assert.equal(ex.status, "success", JSON.stringify(ex));
    assert.deepEqual(ex.result.files.map((f: any) => f.name).sort(), ["Cube.fbx", "Cube.mtl", "Cube.obj"]);
    assert.ok(ex.result.artifactId && ex.result.imageFileId, "artifact + picture");
    assert.equal(ex.result.bwAttach[0].fileId, ex.result.imageFileId, "picture attached for the AI");
    const im = await call("blender_import", { artifact_id: ex.result.artifactId, name: "FromBrickwire" });
    assert.equal(im.status, "success", JSON.stringify(im));
    assert.equal(im.result.imported, 1); assert.deepEqual(im.result.objects, ["FromBrickwire"]);
    const bad = await call("blender_python", { code: "raise ValueError('boom')" });
    assert.notEqual(bad.status, "success"); assert.match(JSON.stringify(bad), /boom/);
    c = (await app(`/api/bw3/chats/${conv.id}`)).body;
    assert.ok(c.conversation.messages.filter((m: any) => m.source === "blender").length >= 2, "export result also posted to chat");
    assert.match(bout, /PUSH: Sent \d file/);

    // Figma plugin push (sandboxed iframe → Origin: null)
    const frame = {
      id: "1:1", name: "Main Menu", type: "FRAME", absoluteBoundingBox: { x: 0, y: 0, width: 400, height: 300 }, fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.15, a: 1 } }], cornerRadius: 12,
      children: [
        { id: "1:2", name: "Title", type: "TEXT", absoluteBoundingBox: { x: 20, y: 20, width: 360, height: 40 }, characters: "Play now", style: { fontFamily: "Inter", fontWeight: 700, fontSize: 28, textAlignHorizontal: "CENTER", textAlignVertical: "CENTER" }, fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 } }] },
        { id: "1:3", name: "Play Button", type: "FRAME", absoluteBoundingBox: { x: 100, y: 200, width: 200, height: 60 }, fills: [{ type: "SOLID", color: { r: 0.2, g: 0.5, b: 1, a: 1 } }], cornerRadius: 8, children: [{ id: "1:4", name: "Label", type: "TEXT", absoluteBoundingBox: { x: 100, y: 210, width: 200, height: 40 }, characters: "PLAY", style: { fontSize: 20 }, fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }] }] },
        { id: "1:5", name: "Logo", type: "VECTOR", absoluteBoundingBox: { x: 10, y: 10, width: 32, height: 32 } },
      ],
    };
    const pre = await fetch(base + "/api/figma/push", { method: "OPTIONS", headers: { Origin: "null", "Access-Control-Request-Method": "POST" } });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get("access-control-allow-origin"), "null");
    const evil = await j("/api/bw3/connect", undefined, { Origin: "null" });
    assert.equal(evil.status, 403, "null origin cannot reach other routes");
    const fp = await j("/api/figma/push", { root: frame, png: PNG.toString("base64"), images: { "1:5": PNG.toString("base64") }, fileName: "Game UI" }, { Origin: "null" });
    assert.equal(fp.status, 200, JSON.stringify(fp.body)); assert.match(fp.body.pushId, /^fp_[a-f0-9]{10}$/); assert.equal(fp.body.nodes, 5);
    c = (await app(`/api/bw3/chats/${conv.id}`)).body;
    const fm = c.conversation.messages.find((m: any) => m.source === "figma");
    assert.ok(fm, "figma message in chat"); assert.equal(fm.attachments[0].kind, "image"); assert.equal(fm.actions[0].tool, "figma_to_studio");
    // the chat button (message action) builds the ScreenGui in Studio
    const env = (await app(`/api/bw3/chats/${conv.id}/action`, { messageId: fm.id, index: 0 })).body;
    let r = env;
    for (let i = 0; i < 60 && r.state !== "done"; i++) { if (r.state === "pending_approval") await app("/api/bw3/approve", { approvalId: r.approvalId, approve: true }); r = (await app(`/api/bw3/calls/${r.callId}?wait=3000`)).body; }
    assert.equal(r.result.status, "success", JSON.stringify(r.result));
    const gui = findChild(studioState(bridge.stateFile), "StarterGui", "Main_Menu");
    assert.ok(gui, "ScreenGui created");
    const frameNode = gui.children.find((x: any) => x.name === "Main Menu");
    assert.ok(frameNode, "root frame"); assert.ok(frameNode.children.some((x: any) => x.className === "TextLabel"), "title text");
    assert.ok(frameNode.children.some((x: any) => x.className === "TextButton"), "button heuristic");
    assert.ok(frameNode.children.some((x: any) => x.className === "ImageLabel"), "vector → image");
  } finally {
    blender?.kill();
    await bridge.stop();
    if (process.env.DEBUG_E2E) console.log(bridge.out().slice(-3000), bout);
  }
});
