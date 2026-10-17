import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { blank, encodePng, decodePng, fit, makeSeamless, derivePbr, writeGlb, writeObj, isPng } from "../../bridge/src/imaging.js";
import { generateImage, uploadAsset, imageProviderStatus } from "../../bridge/src/imagegen.js";
import { buildThumbnailPrompt, learnFromFeedback, emptyStyleMemory, pickStyle } from "../../shared/src/studio2/thumbnail.js";
import { generateMesh, meshStats, vertexNormals, MESH_TYPES } from "../../shared/src/studio2/meshgen.js";
import { makeStudio2ToolsC, PLAYTEST_RUNNER } from "../../bridge/src/studio2-tools-c.js";

function gradient(w: number, h: number) { const img = blank(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; img.data[i] = x * 255 / w; img.data[i + 1] = y * 255 / h; img.data[i + 2] = (x ^ y) & 255; img.data[i + 3] = 255; } return img; }
const res = (o: { json?: unknown; buf?: Buffer; ok?: boolean; status?: number }) => ({ ok: o.ok ?? true, status: o.status ?? 200, json: async () => o.json, text: async () => JSON.stringify(o.json ?? ""), arrayBuffer: async () => { const b = o.buf ?? Buffer.alloc(0); return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer; } });
function mockCtx(reply: (code: string) => unknown = () => ({ ok: true })) {
  const calls: Array<{ code: string; readOnly: boolean }> = [];
  return { calls, ctx: { async runLuau(code: string, o: { readOnly: boolean }) { calls.push({ code, readOnly: o.readOnly }); return reply(code); }, async callMcp() { return { text: "", json: null, isError: false }; }, newId: (p: string) => p + "1", getSnapshot: () => undefined, listSnapshots: () => [] } };
}

test("PNG encode/decode round-trip is lossless", () => {
  const img = gradient(37, 21);
  const png = encodePng(img);
  assert.ok(isPng(png));
  const back = decodePng(png);
  assert.equal(back.width, 37); assert.equal(back.height, 21);
  assert.deepEqual(Buffer.from(back.data), Buffer.from(img.data));
});

test("fit crops to aspect and resizes to exact size", () => {
  const t = fit(gradient(300, 200), 192, 108); assert.equal(t.width, 192); assert.equal(t.height, 108);
  const i = fit(gradient(300, 200), 64, 64); assert.equal(i.width, 64); assert.equal(i.height, 64);
});

test("makeSeamless: opposite edges match closely; PBR normals are unit-ish and +Z up", () => {
  const s = makeSeamless(gradient(64, 64));
  let diff = 0; for (let y = 0; y < 64; y++) { const a = (y * 64) * 4, b = (y * 64 + 63) * 4; diff += Math.abs(s.data[a] - s.data[b]); }
  assert.ok(diff / 64 < 40, `edge diff ${diff / 64}`);
  const m = derivePbr(s, { normalStrength: 2 });
  for (const k of ["color", "normal", "roughness", "metalness", "height"] as const) { assert.equal(m[k].width, 64); }
  for (let i = 0; i < 64 * 64; i += 97) { const nx = m.normal.data[i * 4] / 127.5 - 1, ny = m.normal.data[i * 4 + 1] / 127.5 - 1, nz = m.normal.data[i * 4 + 2] / 127.5 - 1; const l = Math.hypot(nx, ny, nz); assert.ok(l > 0.9 && l < 1.1); assert.ok(nz > 0); }
});

test("GLB header/length valid and OBJ contains faces", () => {
  const m = generateMesh("rock", { seed: 3, detail: 2 });
  const glb = writeGlb(m.name, m.positions, m.triangles, vertexNormals(m), m.uvs);
  assert.equal(glb.toString("ascii", 0, 4), "glTF"); assert.equal(glb.readUInt32LE(4), 2); assert.equal(glb.readUInt32LE(8), glb.length);
  const jsonLen = glb.readUInt32LE(12); const j = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
  assert.equal(j.accessors[0].count, m.positions.length);
  assert.match(writeObj(m.name, m.positions, m.triangles, m.uvs), /\nf \d+/);
});

test("meshgen: every type produces valid indexed geometry", () => {
  for (const t of MESH_TYPES) { const m = generateMesh(t, { seed: 7 }); const s = meshStats(m); assert.equal(s.invalidTriangles, 0, t); assert.ok(s.vertices > 3 && s.triangles > 1, t); assert.equal(m.uvs.length, m.positions.length, t); }
  assert.throws(() => generateMesh("donut" as never));
});

test("imagegen: not configured -> clear error; OpenAI b64 path; Open Cloud upload polls operation", async () => {
  await assert.rejects(generateImage({ prompt: "x" }, async () => res({}) as never, {}), /not configured/);
  const png = encodePng(gradient(8, 8));
  let sent: any;
  const r = await generateImage({ prompt: "castle", negative: "text", size: "1536x1024" }, async (url, init) => { sent = { url, body: JSON.parse(String(init!.body)) }; return res({ json: { data: [{ b64_json: png.toString("base64") }] } }) as never; }, { BRICKWIRE_IMAGE_API_KEY: "k" });
  assert.equal(sent.url, "https://api.openai.com/v1/images/generations"); assert.equal(sent.body.size, "1536x1024"); assert.match(sent.body.prompt, /Avoid: text/);
  assert.ok(isPng(r.png));
  const urls: string[] = [];
  const up = await uploadAsset(png, "png", "Decal", "thumb", "d", async (url) => { urls.push(url); return res({ json: urls.length === 1 ? { path: "operations/abc", done: false } : { done: true, response: { assetId: "123" } } }) as never; }, { ROBLOX_OPEN_CLOUD_API_KEY: "k", ROBLOX_CREATOR_USER_ID: "1" }, 1, 3);
  assert.equal(up.assetId, "123"); assert.equal(urls.length, 2); assert.match(urls[1], /operations\/abc$/);
  assert.equal(imageProviderStatus({}).imageProvider, null);
});

test("thumbnail art director: grounded prompt, no-text rule, learning loop changes prompt", () => {
  const p = buildThumbnailPrompt({ gameName: "Lava Run", genre: "obby", keyObjects: ["LavaTower"], palette: ["#ff5500"] }, "thumbnail");
  assert.equal(p.size, "1536x1024"); assert.deepEqual(p.target, { w: 1920, h: 1080 });
  assert.match(p.prompt, /Lava Run/); assert.match(p.prompt, /LavaTower/); assert.match(p.prompt, /mid-jump/); assert.match(p.negative, /text/);
  let mem = learnFromFeedback(emptyStyleMemory(), { id: "a", style: "cartoon", format: "thumbnail", rating: 5, notes: "bigger character, more contrast", prompt: p.prompt });
  mem = learnFromFeedback(mem, { id: "b", style: "cartoon", format: "thumbnail", rating: 2, notes: "too dark", prompt: p.prompt });
  mem = learnFromFeedback(mem, { id: "c", style: "cartoon", format: "thumbnail", rating: 5, prompt: p.prompt });
  assert.ok(mem.liked.includes("bigger character")); assert.ok(mem.disliked.includes("too dark"));
  const p2 = buildThumbnailPrompt({ genre: "obby" }, "icon", mem);
  assert.match(p2.prompt, /bigger character/); assert.match(p2.negative, /too dark/); assert.equal(p2.size, "1024x1024");
  assert.equal(pickStyle(mem), "cartoon");
});

test("tools C: thumbnail promptOnly works without keys, feedback persists, generate saves fitted PNG", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-"));
  const png = encodePng(gradient(150, 100));
  const tools = makeStudio2ToolsC({ dataDir: dir, env: { BRICKWIRE_IMAGE_API_KEY: "k" }, fetch: async () => res({ json: { data: [{ b64_json: png.toString("base64") }] } }) as never });
  const T = (n: string) => tools.find((t) => t.name === n)!;
  const { ctx, calls } = mockCtx(() => ({ gameName: "Tycoon X", genre: "tycoon", keyObjects: ["Dropper"], palette: ["#22aa44"] }));
  const po: any = await T("thumbnail_generate").run({ promptOnly: true }, ctx as never);
  assert.match(po.prompt, /Tycoon X/); assert.ok(calls[0].readOnly);
  const g: any = await T("thumbnail_generate").run({ format: "icon", variants: 2 }, ctx as never);
  assert.equal(g.results.length, 2); const d = decodePng(fs.readFileSync(g.results[0].file)); assert.equal(d.width, 512); assert.equal(d.height, 512);
  const fb: any = await T("thumbnail_feedback").run({ id: g.results[0].id, rating: 5, notes: "shiny coins" }, ctx as never);
  assert.ok(fb.learned.liked.includes("shiny coins"));
  const po2: any = await T("thumbnail_generate").run({ promptOnly: true }, ctx as never);
  assert.match(po2.prompt, /shiny coins/);
  const pbr: any = await T("pbr_generate").run({ name: "Moss", prompt: "mossy stone", resolution: 256, upload: false }, ctx as never);
  assert.equal(decodePng(fs.readFileSync(pbr.files.normal)).width, 256);
  const mesh: any = await T("mesh_generate").run({ type: "crystal", seed: 2 }, mockCtx(() => ({ path: "Workspace.Crystal_2" })).ctx as never);
  assert.ok(fs.existsSync(mesh.files.glb)); assert.ok(mesh.warning);
});

test("tools C Luau: EditableMesh, MaterialVariant-free paths, playtest runner uses StudioTestService and cleans up", async () => {
  const tools = makeStudio2ToolsC({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "bw-")), env: {} });
  const { ctx, calls } = mockCtx(() => ({ passed: 1 }));
  await tools.find((t) => t.name === "mesh_generate")!.run({ type: "gem" }, ctx as never);
  assert.match(calls[0].code, /CreateEditableMesh/); assert.match(calls[0].code, /CreateMeshPartAsync\(Content\.fromObject/);
  await tools.find((t) => t.name === "playtest_run")!.run({ mode: "play", seconds: 5 }, ctx as never);
  assert.match(calls[1].code, /ExecutePlayModeAsync/); assert.match(calls[1].code, /r:Destroy\(\)/);
  assert.match(PLAYTEST_RUNNER, /EndTest/); assert.match(PLAYTEST_RUNNER, /IsRunning/);
  await assert.rejects(tools.find((t) => t.name === "image_generate")!.run({ prompt: "x" }, ctx as never), /not configured/);
});
