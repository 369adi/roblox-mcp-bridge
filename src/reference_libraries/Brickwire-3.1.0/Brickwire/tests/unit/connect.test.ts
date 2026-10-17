import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseFigmaUrl, figmaToUIDoc, robloxFont, FigmaApi, FigmaSettings, FigmaPushStore, makeFigmaTools, rasterIds, outline, type FigNode } from "../../bridge/src/connect/figma.js";
import { BlenderLink, installAddon, uninstallAddon, installInfo, addonSource, ingestModel } from "../../bridge/src/connect/blender-link.js";
import { compileUIDoc } from "../../shared/src/studio2/uidoc.js";
import { ArtifactStore } from "../../bridge/src/bw3/artifact-store.js";
import { AiFileStore } from "../../bridge/src/file-tools.js";
import { parseObj } from "../../bridge/src/bw3/mesh-kit.js";
import type { FeedPost } from "../../bridge/src/connect/feed.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bw-connect-"));
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const CUBE = "mtllib x.mtl\no Cube\nv -1 -1 -1\nv 1 -1 -1\nv 1 1 -1\nv -1 1 -1\nv -1 -1 1\nv 1 -1 1\nv 1 1 1\nv -1 1 1\nusemtl Red\nf 1 2 3 4\nf 5 8 7 6\nf 1 5 6 2\nf 2 6 7 3\nf 3 7 8 4\nf -4 -8 -5 -1\n";

test("parseFigmaUrl: design/file/proto links, node-id, branches, raw keys, rejects other hosts", () => {
  assert.deepEqual(parseFigmaUrl("https://www.figma.com/design/AbCdEfGhIj1234567890/Game-UI?node-id=12-34&t=x"), { fileKey: "AbCdEfGhIj1234567890", nodeId: "12:34" });
  assert.deepEqual(parseFigmaUrl("https://figma.com/file/AbCdEfGhIj1234567890/x"), { fileKey: "AbCdEfGhIj1234567890" });
  assert.equal(parseFigmaUrl("https://www.figma.com/design/AbCdEfGhIj1234567890/branch/ZyXwVuTsRq0987654321/x").fileKey, "ZyXwVuTsRq0987654321");
  assert.equal(parseFigmaUrl("https://www.figma.com/proto/AbCdEfGhIj1234567890/x?node-id=1%3A2").nodeId, "1:2");
  assert.deepEqual(parseFigmaUrl("AbCdEfGhIj1234567890"), { fileKey: "AbCdEfGhIj1234567890" });
  assert.throws(() => parseFigmaUrl("https://evil.example/design/AbCdEfGhIj1234567890/x"), /figma\.com/);
  assert.throws(() => parseFigmaUrl("hello"), /figma\.com link/);
});

const FRAME: FigNode = {
  id: "1:1", name: "Shop (main)", type: "FRAME", absoluteBoundingBox: { x: 100, y: 50, width: 400, height: 200 }, cornerRadius: 16, clipsContent: true,
  fills: [{ type: "GRADIENT_LINEAR", gradientStops: [{ position: 0, color: { r: 1, g: 0, b: 0, a: 1 } }, { position: 1, color: { r: 0, g: 0, b: 1, a: 0.5 } }], gradientHandlePositions: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] }],
  strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }], strokeWeight: 2,
  children: [
    { id: "1:2", name: "Title", type: "TEXT", absoluteBoundingBox: { x: 120, y: 60, width: 200, height: 40 }, characters: "Shop", style: { fontFamily: "Inter", fontWeight: 800, fontSize: 24, textAlignHorizontal: "CENTER", textAlignVertical: "CENTER" }, fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1, a: 1 }, opacity: 0.5 }] },
    { id: "1:3", name: "Dot", type: "ELLIPSE", absoluteBoundingBox: { x: 300, y: 150, width: 20, height: 20 }, fills: [{ type: "SOLID", color: { r: 0, g: 1, b: 0 } }] },
    { id: "1:4", name: "Icon", type: "VECTOR", absoluteBoundingBox: { x: 110, y: 200, width: 40, height: 40 } },
    { id: "1:5", name: "Photo", type: "RECTANGLE", absoluteBoundingBox: { x: 400, y: 60, width: 80, height: 80 }, fills: [{ type: "IMAGE", imageRef: "abc" }] },
    { id: "1:6", name: "Hidden", type: "RECTANGLE", visible: false, absoluteBoundingBox: { x: 0, y: 0, width: 1, height: 1 } },
    { id: "1:7", name: "Buy Button", type: "FRAME", absoluteBoundingBox: { x: 300, y: 200, width: 180, height: 40 }, fills: [{ type: "SOLID", color: { r: 0.2, g: 0.6, b: 0.2 } }], children: [{ id: "1:8", name: "t", type: "TEXT", absoluteBoundingBox: { x: 300, y: 205, width: 180, height: 30 }, characters: "BUY", style: { fontFamily: "Fredoka One", fontSize: 18 } }] },
  ],
};

test("figmaToUIDoc: frame → valid UI document (scale layout, text, gradient, stroke, ellipse, images, button)", () => {
  const r = figmaToUIDoc(FRAME, { images: { "1:4": "rbxassetid://99" } });
  assert.equal(r.doc.name, "Shop__main_");
  const root = r.doc.children[0];
  assert.deepEqual(root.size, [0, 400, 0, 200], "small design keeps pixel size (fixed)");
  assert.deepEqual(root.anchor, [0.5, 0.5]);
  assert.equal(root.corner, 16); assert.equal(root.clip, true);
  assert.equal(root.stroke?.thickness, 2);
  assert.deepEqual(root.gradient?.colors, [[0, "#ff0000"], [1, "#0000ff"]]);
  assert.deepEqual(root.gradient?.transparency, [[0, 0], [1, 0.5]]);
  const kids = root.children!;
  assert.equal(kids.length, 5, "hidden layer skipped");
  const title = kids.find((k) => k.name === "Title")!;
  assert.equal(title.type, "Text"); assert.equal(title.textSize, 24); assert.equal(title.font, "GothamBold"); assert.equal(title.textXAlign, "Center");
  assert.deepEqual(title.position, [0.05, 0, 0.05, 0]); assert.deepEqual(title.size, [0.5, 0, 0.2, 0]);
  assert.equal((title.props as any).TextTransparency, 0.5);
  assert.deepEqual(kids.find((k) => k.name === "Dot")!.corner, [0.5, 0]);
  const icon = kids.find((k) => k.name === "Icon")!; assert.equal(icon.type, "Image"); assert.equal(icon.image, "rbxassetid://99");
  const photo = kids.find((k) => k.name === "Photo")!; assert.equal(photo.type, "Image"); assert.equal(photo.attributes?.FigmaNode, "1:5");
  assert.deepEqual(r.missingImages, ["1:5"]); assert.deepEqual(r.rasterized.sort(), ["1:4", "1:5"]);
  const btn = kids.find((k) => k.name === "Buy Button")!; assert.equal(btn.type, "Button"); assert.equal(btn.children![0].font, "FredokaOne");
  const c = compileUIDoc(r.doc);
  assert.equal(c.tree.className, "ScreenGui");
  assert.ok(c.stats.instances >= 10);
  assert.deepEqual(rasterIds(FRAME).sort(), ["1:4", "1:5"]);
  assert.match(outline(FRAME).join("\n"), /TEXT "Title" 200×40 — "Shop"/);
});

test("figmaToUIDoc: big designs scale to screen (fit), text scales; fill mode", () => {
  const big: FigNode = { id: "2:1", name: "HUD", type: "FRAME", absoluteBoundingBox: { x: 0, y: 0, width: 1920, height: 1080 }, children: [{ id: "2:2", name: "Coins", type: "TEXT", characters: "100", absoluteBoundingBox: { x: 1700, y: 20, width: 200, height: 60 }, style: { fontSize: 40 } }] };
  const fit = figmaToUIDoc(big);
  assert.deepEqual(fit.doc.children[0].size, [1, 0, 1, 0]); assert.equal(fit.doc.children[0].aspect, 1.7778); assert.equal(fit.doc.ignoreGuiInset, true);
  assert.equal(fit.doc.children[0].children![0].textScaled, true); assert.equal(fit.doc.children[0].children![0].maxTextSize, 64);
  const fill = figmaToUIDoc(big, { root: "fill" }); assert.equal(fill.doc.children[0].aspect, undefined);
  assert.throws(() => figmaToUIDoc({ id: "x", name: "n", type: "FRAME" }), /no size/);
});

test("robloxFont maps families and weights to Roblox fonts", () => {
  assert.equal(robloxFont({ fontFamily: "Inter", fontWeight: 400 }), "Gotham");
  assert.equal(robloxFont({ fontFamily: "Inter", fontWeight: 600 }), "GothamMedium");
  assert.equal(robloxFont({ fontFamily: "Source Sans Pro", fontWeight: 700 }), "SourceSansBold");
  assert.equal(robloxFont({ fontFamily: "Arial", fontWeight: 700 }), "ArialBold");
  assert.equal(robloxFont({ fontFamily: "Press Start 2P" }), "Arcade");
  assert.equal(robloxFont({ fontFamily: "Whatever", fontPostScriptName: "Bold" }), "GothamBold");
});

function fakeFigma(log: string[]) {
  return async (url: string, init: any = {}) => {
    log.push(url + " " + (init.headers?.["X-Figma-Token"] ?? ""));
    const json = (status: number, b: unknown) => ({ ok: status < 300, status, headers: { get: () => "application/json" }, json: async () => b, text: async () => JSON.stringify(b), arrayBuffer: async () => new ArrayBuffer(0) });
    if (url.includes("/v1/files/BADKEYBADKEY")) return json(403, { err: "forbidden" });
    if (url.includes("/nodes?ids=")) return json(200, { nodes: { "1:1": { document: FRAME } } });
    if (url.includes("/v1/images/")) return json(200, { images: Object.fromEntries(decodeURIComponent(url.split("ids=")[1].split("&")[0]).split(",").map((id) => [id, "https://cdn.test/" + id.replace(":", "_") + ".png"])) });
    if (url.startsWith("https://cdn.test/")) return { ok: true, status: 200, headers: { get: () => "image/png" }, json: async () => ({}), text: async () => "", arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) };
    if (url.includes("/v1/files/")) return json(200, { name: "Game", document: { children: [{ name: "Page 1", type: "CANVAS", children: [{ id: "1:1", name: "Shop", type: "FRAME" }] }] } });
    return json(404, {});
  };
}

test("Figma REST tools: token required, inspect posts preview to chat, export stores files, helpful errors", async () => {
  const dir = tmp(); const log: string[] = []; const posts: FeedPost[] = [];
  const store = new AiFileStore(dir); const settings = new FigmaSettings(dir, {}); const pushes = new FigmaPushStore(dir);
  const feed = { post: (p: FeedPost) => { posts.push(p); return { conversationId: "conv_000000000000", messageId: "msg_1" }; }, importModel: () => { throw new Error("n/a"); } };
  const tools = Object.fromEntries(makeFigmaTools({ store: () => store, feed: () => feed, settings: () => settings, pushes: () => pushes, fetch: fakeFigma(log) as any }).map((t) => [t.name, t]));
  const ctx = {} as any;
  await assert.rejects(tools.figma_inspect.run({ url: "https://www.figma.com/design/AbCdEfGhIj1234567890/x?node-id=1-1" }, ctx), /Figma token is not set/);
  assert.throws(() => settings.setToken("bad token!"), /personal access token/);
  settings.setToken("figd_abcdefghijklmnopqrstuvwxyz0123");
  assert.equal(settings.public().configured, true); assert.match(settings.public().hint, /^figd_…/);
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(dir, "figma-settings.json")).mode & 0o777, 0o600);
  const ins = await tools.figma_inspect.run({ url: "https://www.figma.com/design/AbCdEfGhIj1234567890/x?node-id=1-1" }, ctx) as any;
  assert.equal(ins.layers, 8); assert.equal(ins.imageLayers, 2); assert.ok(ins.previewFileId); assert.equal(ins.bwAttach[0].fileId, ins.previewFileId);
  assert.ok(log.some((l) => l.includes("figd_abcdefghijklmnopqrstuvwxyz0123")), "token sent as X-Figma-Token");
  assert.equal(posts.at(-1)!.source, "figma"); assert.equal(posts.at(-1)!.images!.length, 1); assert.equal(posts.at(-1)!.actions![0].tool, "figma_to_studio");
  const exp = await tools.figma_export.run({ url: "https://www.figma.com/design/AbCdEfGhIj1234567890/x", nodeIds: ["1:1", "1-4"] }, ctx) as any;
  assert.equal(exp.files.length, 2); assert.match(exp.files[0].name, /\.png$/);
  await assert.rejects(tools.figma_inspect.run({ url: "https://www.figma.com/design/AbCdEfGhIj1234567890/x" }, ctx), /no node-id[\s\S]*Page 1 \/ Shop → nodeId 1:1/);
  await assert.rejects(new FigmaApi("t", fakeFigma(log) as any).file("BADKEYBADKEY"), /403/);
  // validateOnly: full conversion without Studio
  const v = await tools.figma_to_studio.run({ url: "https://www.figma.com/design/AbCdEfGhIj1234567890/x?node-id=1-1", validateOnly: true }, ctx) as any;
  assert.equal(v.valid, true); assert.ok(v.instances > 5);
});

test("BlenderLink: offline error, job round trip through poll/result, failures and timeouts", async () => {
  const link = new BlenderLink();
  await assert.rejects(link.call("scene"), /Blender is not connected/);
  const polled = link.poll({ id: "b1", blender: "4.2", file: "a.blend", addon: "1.0.0" }, 2000);
  assert.equal(link.status().connected, true);
  const pending = link.call("scene", { limit: 5 }, 5000);
  const job = await polled; assert.equal(job!.op, "scene"); assert.deepEqual(job!.args, { limit: 5 });
  assert.equal(link.result("b1", job!.id, true, { objects: [] }), true);
  assert.deepEqual(await pending, { objects: [] });
  const p2 = link.call("python", { code: "x" }, 5000); const j2 = await link.poll({ id: "b1" }, 100);
  link.result("b1", j2!.id, false, null, "NameError: x");
  await assert.rejects(p2, /Blender: NameError: x/);
  await assert.rejects(link.call("render", {}, 50), /did not answer "render"/);
  assert.equal(link.status().queued, 0, "timed-out job removed from queue");
  assert.equal(await link.poll({ id: "b1" }, 30), null, "empty poll returns null");
});

test("Blender add-on install: writes into scripts/startup of every Blender version with the port; uninstall; not found", () => {
  const cfg = tmp(); fs.mkdirSync(path.join(cfg, "4.2")); fs.mkdirSync(path.join(cfg, "3.6")); fs.mkdirSync(path.join(cfg, "2.79"));
  const env = { BRICKWIRE_BLENDER_CONFIG_DIR: cfg, PATH: "" };
  const r = installAddon(51234, env, "linux");
  assert.equal(r.written.length, 2, "only 2.93+ versions");
  const src = fs.readFileSync(path.join(cfg, "4.2", "scripts", "startup", "brickwire_blender.py"), "utf8");
  assert.match(src, /^DEFAULT_PORT = 51234\b/m); assert.match(src, /def register\(\)/);
  const info = installInfo(env, "linux"); assert.deepEqual(info.versions.map((v) => [v.version, v.installed, v.current]), [["4.2", true, true], ["3.6", true, true]]);
  assert.equal(uninstallAddon(env, "linux").removed.length, 2);
  assert.throws(() => installAddon(1, { BRICKWIRE_BLENDER_CONFIG_DIR: tmp(), PATH: "" }, "linux"), /Blender was not found/);
  assert.match(addonSource(47821), /ADDON_VERSION = "1\.0\.0"/);
});

test("ArtifactStore.importModel + ingestModel: Blender OBJ (quads, negative indices) → artifact with thumbnail, chat post with actions", () => {
  const dir = tmp(); const arts = new ArtifactStore(dir); const store = new AiFileStore(dir);
  assert.equal(parseObj(CUBE).faces, 12, "quads triangulated, negative indices resolved");
  const posts: FeedPost[] = [];
  const feed = { post: (p: FeedPost) => { posts.push(p); return { conversationId: "conv_000000000000", messageId: "msg_1" }; }, importModel: (m: any) => arts.importModel(m) };
  const r = ingestModel({ link: new BlenderLink(), store: () => store, feed: () => feed }, { name: "Cube", objects: ["Cube"], triangles: 12, files: [{ name: "Cube.obj", data: Buffer.from(CUBE).toString("base64") }, { name: "Cube.glb", data: Buffer.from("glTF\x02\x00\x00\x00").toString("base64") }], render: { data: PNG.toString("base64") } });
  assert.equal(r.files.length, 2); assert.ok(r.artifactId); assert.ok(r.imageFileId);
  const a = arts.get(r.artifactId!);
  assert.equal(a.source, "blender"); assert.equal(a.stats.triangles, 12); assert.deepEqual(a.stats.size, [2, 2, 2]);
  assert.match(fs.readFileSync(path.join(arts.dir, a.id, "model.obj"), "utf8"), /^mtllib model\.mtl$/m);
  assert.match(fs.readFileSync(path.join(arts.dir, a.id, "model.mtl"), "utf8"), /newmtl Red/, "missing material gets a default colour");
  assert.ok(arts.file(a.id, "thumb.png").data.length > 1000);
  assert.equal(arts.importPayload(a.id)[0].t.length, 12, "Studio import payload works for external models");
  const p = posts[0]; assert.equal(p.source, "blender"); assert.deepEqual(p.artifacts, [a.id]); assert.equal(p.images!.length, 1);
  assert.deepEqual(p.actions!.map((x) => x.tool), ["artifact_studio_import", "file_to_studio"]);
  assert.match(p.text, /Cube\.glb .* fileId f_[a-f0-9]{12}/);
  assert.throws(() => arts.importModel({ name: "x", obj: "v 0 0 0\n", source: "blender", request: "" }), /no faces/);
});
