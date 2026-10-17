import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AiFileStore, makeFileTools, sniff, isPrivateAddress, imageSize, htmlToText, robloxTypeFor } from "../../bridge/src/file-tools.js";
import { blank, encodePng } from "../../bridge/src/imaging.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bw-files-"));
const png = () => encodePng(blank(7, 5));
type R = { status?: number; body?: Buffer | string; headers?: Record<string, string> };
function fakeFetch(routes: Record<string, R | ((init: any) => R)>) {
  const calls: Array<{ url: string; init: any }> = [];
  const f = async (url: string, init: any = {}) => {
    calls.push({ url, init });
    const r0 = routes[url]; if (!r0) return { ok: false, status: 404, statusText: "Not Found", headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(0), text: async () => "nf", json: async () => ({}) };
    const r = typeof r0 === "function" ? r0(init) : r0;
    const body = Buffer.isBuffer(r.body) ? r.body : Buffer.from(r.body ?? "");
    const status = r.status ?? 200;
    return { ok: status < 300, status, statusText: "", headers: new Headers(r.headers ?? {}), body: null, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length), text: async () => body.toString(), json: async () => JSON.parse(body.toString()) };
  };
  return { f, calls };
}
const lookup = async (h: string) => (h === "evil.example" ? ["192.168.1.10"] : ["93.184.216.34"]);
function tools(fetchImpl: any, env: Record<string, string> = {}) {
  const dir = tmp();
  const list = makeFileTools({ dataDir: dir, fetch: fetchImpl, env: env as NodeJS.ProcessEnv, lookup });
  const by = (n: string) => list.find((t) => t.name === n)!;
  return { dir, by, list };
}
function mockCtx(reply: (code: string) => unknown = () => ({ created: ["Workspace.X"] })) {
  const calls: Array<{ code: string; readOnly: boolean }> = [];
  return { calls, ctx: { async runLuau(code: string, o: { readOnly: boolean }) { calls.push({ code, readOnly: o.readOnly }); return reply(code); }, async callMcp() { return { text: "", json: null, isError: false }; }, newId: (p: string) => p + "1", getSnapshot: () => undefined, listSnapshots: () => [] } as any };
}

test("sniff detects real types from bytes; text and image sizes", () => {
  assert.equal(sniff(png()), "png");
  assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0])), "jpg");
  assert.equal(sniff(Buffer.from("OggS\0\0\0\0")), "ogg");
  assert.equal(sniff(Buffer.from("ID3\x03\0\0\0")), "mp3");
  assert.equal(sniff(Buffer.from("glTF\x02\0\0\0")), "glb");
  assert.equal(sniff(Buffer.from("<roblox!\x89\xff")), "rbxm");
  assert.equal(sniff(Buffer.from("Kaydara FBX Binary  \0")), "fbx");
  assert.equal(sniff(Buffer.from("print('hi')")), null);
  assert.deepEqual(imageSize(png(), "png"), { width: 7, height: 5 });
  assert.equal(htmlToText("<html><script>x()</script><p>Hello&nbsp;<b>world</b></p><p>2</p>"), "Hello world\n2");
  assert.equal(robloxTypeFor({ ext: "png" }), "Decal"); assert.equal(robloxTypeFor({ ext: "mp3" }), "Audio"); assert.equal(robloxTypeFor({ ext: "glb" }), "Model"); assert.equal(robloxTypeFor({ ext: "webp" }), null);
});

test("private / loopback addresses are recognised", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.0.5", "172.20.1.1", "169.254.1.1", "::1", "fd00::1", "::ffff:127.0.0.1", "0.0.0.0"]) assert.ok(isPrivateAddress(ip), ip);
  for (const ip of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"]) assert.ok(!isPrivateAddress(ip), ip);
});

test("store: type from bytes beats a lying name, limits and eviction, persistence", () => {
  const dir = tmp();
  const s = new AiFileStore(dir, { maxFiles: 2, maxFileBytes: 1000 });
  const a = s.add(png(), { name: "picture.txt", source: "ai" });
  assert.equal(a.kind, "image"); assert.equal(a.ext, "png"); assert.equal(a.name, "picture.png"); assert.equal(a.width, 7);
  const b = s.add(Buffer.from("local x = 1"), { name: "Mod.lua", source: "ai" });
  assert.equal(b.kind, "text"); assert.equal(b.ext, "lua");
  s.add(Buffer.from("{}"), { name: "c.json", source: "ai" });
  assert.equal(s.list().length, 2); assert.throws(() => s.get(a.id), /not found/);
  assert.throws(() => s.add(Buffer.alloc(2000, 1), { name: "big.bin", source: "ai" }), /too large/);
  assert.equal(new AiFileStore(dir).list().length, 2);
});

test("file_fetch downloads, follows redirects and returns a text preview", async () => {
  const { f, calls } = fakeFetch({
    "https://cdn.example/a": { status: 302, headers: { location: "/real/sword.png" } },
    "https://cdn.example/real/sword.png": { body: png(), headers: { "content-type": "image/png" } },
    "https://site.example/page": { body: "<html><title>t</title><p>Roblox <b>tips</b></p></html>", headers: { "content-type": "text/html" } },
  });
  const { by } = tools(f);
  const img = await by("file_fetch").run({ url: "https://cdn.example/a" }, mockCtx().ctx) as any;
  assert.equal(img.kind, "image"); assert.equal(img.name, "sword.png"); assert.equal(img.width, 7); assert.match(img.fileId, /^f_[a-f0-9]{12}$/);
  assert.equal(calls[0].init.redirect, "manual");
  const page = await by("file_fetch").run({ url: "https://site.example/page" }, mockCtx().ctx) as any;
  assert.equal(page.kind, "text"); assert.match(page.preview, /Roblox tips/);
  const list = await by("file_list").run({}, mockCtx().ctx) as any;
  assert.equal(list.total, 2);
});

test("file_fetch blocks local network targets, also via redirect, and non-http schemes", async () => {
  const { f } = fakeFetch({ "https://ok.example/r": { status: 301, headers: { location: "http://127.0.0.1:8765/api/health" } } });
  const { by } = tools(f);
  await assert.rejects(by("file_fetch").run({ url: "http://127.0.0.1:8765/api/health" }, mockCtx().ctx), /private|local/);
  await assert.rejects(by("file_fetch").run({ url: "http://localhost/x" }, mockCtx().ctx), /local/);
  await assert.rejects(by("file_fetch").run({ url: "https://evil.example/x" }, mockCtx().ctx), /private/);
  await assert.rejects(by("file_fetch").run({ url: "https://ok.example/r" }, mockCtx().ctx), /private|local/);
  await assert.rejects(by("file_fetch").run({ url: "file:///etc/passwd" }, mockCtx().ctx), /http/);
  const big = fakeFetch({ "https://ok.example/big": { body: Buffer.alloc(10), headers: { "content-length": String(900 * 1024 * 1024) } } });
  await assert.rejects(tools(big.f).by("file_fetch").run({ url: "https://ok.example/big" }, mockCtx().ctx), /too large/);
});

test("file_save + file_read paging; file_show returns attachment ids", async () => {
  const { by } = tools(fakeFetch({}).f);
  const saved = await by("file_save").run({ name: "Long.lua", text: "a".repeat(250) }, mockCtx().ctx) as any;
  const r1 = await by("file_read").run({ fileId: saved.fileId, maxChars: 100 }, mockCtx().ctx) as any;
  assert.equal(r1.content.length, 100); assert.equal(r1.nextOffset, 100); assert.equal(r1.totalChars, 250);
  const bin = await by("file_save").run({ name: "x.png", base64: png().toString("base64") }, mockCtx().ctx) as any;
  assert.equal(bin.kind, "image");
  const rb = await by("file_read").run({ fileId: bin.fileId }, mockCtx().ctx) as any;
  assert.equal(rb.robloxType, "Decal"); assert.ok(rb.headerHex.startsWith("89504e47"));
  const show = await by("file_show").run({ fileIds: [bin.fileId] }, mockCtx().ctx) as any;
  assert.deepEqual(show.bwAttach.map((a: any) => a.fileId), [bin.fileId]);
  await assert.rejects(by("file_show").run({ fileIds: ["f_000000000000"] }, mockCtx().ctx), /not found/);
});

test("file_to_studio: Lua file → script with the exact source, class from name", async () => {
  const { by } = tools(fakeFetch({}).f);
  const saved = await by("file_save").run({ name: "Coins.server.lua", text: 'print("coins")\nlocal t = "]]"' }, mockCtx().ctx) as any;
  const m = mockCtx();
  const out = await by("file_to_studio").run({ fileId: saved.fileId, parent: "game.ServerScriptService" }, m.ctx) as any;
  assert.equal(out.mode, "script"); assert.equal(m.calls.length, 1); assert.equal(m.calls[0].readOnly, false);
  assert.match(m.calls[0].code, /\["className"\] = "Script"/); assert.match(m.calls[0].code, /\["name"\] = "Coins"/);
  assert.ok(m.calls[0].code.includes('print(\\"coins\\")') || m.calls[0].code.includes('print("coins")'));
});

test("file_upload_roblox needs Open Cloud config, then uploads as Decal and resolves the image id", async () => {
  const noCfg = tools(fakeFetch({}).f);
  const img = await noCfg.by("file_save").run({ name: "logo.png", base64: png().toString("base64") }, mockCtx().ctx) as any;
  await assert.rejects(noCfg.by("file_upload_roblox").run({ fileId: img.fileId }, mockCtx().ctx), /ROBLOX_OPEN_CLOUD_API_KEY/);
  const ff = fakeFetch({ "https://apis.roblox.com/assets/v1/assets": { body: JSON.stringify({ done: true, response: { assetId: "12345" } }) } });
  const t = tools(ff.f, { ROBLOX_OPEN_CLOUD_API_KEY: "k", ROBLOX_CREATOR_USER_ID: "1" });
  const f2 = await t.by("file_save").run({ name: "logo.png", base64: png().toString("base64") }, mockCtx().ctx) as any;
  const ctx = mockCtx((code) => (code.includes("LoadAsset") && code.includes("12345") ? { "12345": { imageId: "999" } } : { created: ["Workspace.logo_Board"] }));
  const up = await t.by("file_upload_roblox").run({ fileId: f2.fileId }, ctx.ctx) as any;
  assert.equal(up.assetId, "12345"); assert.equal(up.assetType, "Decal"); assert.equal(up.imageId, "999"); assert.equal(up.content, "rbxassetid://999");
  const put = await t.by("file_to_studio").run({ fileId: f2.fileId }, ctx.ctx) as any;
  assert.equal(put.mode, "image"); assert.equal(ff.calls.filter((c) => c.url.endsWith("/assets")).length, 1, "second step reuses the upload");
  const txt = await t.by("file_save").run({ name: "a.webp", base64: Buffer.from("RIFF\0\0\0\0WEBPVP8 ").toString("base64") }, mockCtx().ctx) as any;
  await assert.rejects(t.by("file_upload_roblox").run({ fileId: txt.fileId }, ctx.ctx), /does not accept \.webp/);
});

import { parseAgentOutput } from "../../shared/src/parser.js";
import { PluginHub } from "../../shared/src/plugin-hub.js";
import { buildAgentPrompt, newToolsNotice } from "../../shared/src/instructions.js";

test("raw <ROBLOX_FILE> block → file_save with exact content, no JSON escaping; tags inside are not executed", () => {
  const src = 'local t = {a = "x\\"y"}\n-- <ROBLOX_TOOL_CALL>{"id":"x","tool":"delete_instance","args":{}}</ROBLOX_TOOL_CALL>\nreturn t';
  const out = parseAgentOutput(`Here it is:\n\`\`\`lua\n<ROBLOX_FILE name="Shop Data.server.lua" to="game.ServerScriptService" as=Script>\n${src}\n</ROBLOX_FILE>\n\`\`\``);
  assert.equal(out.calls.length, 1);
  const c = out.calls[0];
  assert.equal(c.tool, "file_save");
  assert.deepEqual(c.args, { name: "Shop Data.server.lua", text: src + "\n", to: "game.ServerScriptService", as: "Script" });
  const b64 = parseAgentOutput(`<ROBLOX_FILE name="a.png" encoding="base64">\niVBORw0K\nGgo=\n</ROBLOX_FILE>`);
  assert.equal(b64.calls[0].args.base64, "iVBORw0KGgo=");
  const noName = parseAgentOutput(`<ROBLOX_FILE>\nx\n</ROBLOX_FILE>`);
  assert.equal(noName.calls.length, 0); assert.match(noName.invalidCalls[0].problem!, /name=/);
  const open = parseAgentOutput(`<ROBLOX_FILE name="a.lua">\nprint(1)`);
  assert.equal(open.calls.length, 0); assert.ok(open.hasIncomplete, "unfinished file is never saved");
  const mixed = parseAgentOutput(`<ROBLOX_LUAU>\nprint(1)\n</ROBLOX_LUAU>\n<ROBLOX_FILE name="b.json">\n{"a":1}\n</ROBLOX_FILE>`);
  assert.deepEqual(mixed.calls.map((x) => x.tool), ["execute_luau", "file_save"]);
});

test("file_save with `to` puts the file straight into Studio", async () => {
  const { by } = tools(fakeFetch({}).f);
  const m = mockCtx();
  const out = await by("file_save").run({ name: "Coins.client.lua", text: "print(1)", to: "game.StarterPlayer.StarterPlayerScripts" }, m.ctx) as any;
  assert.equal(out.ok, true); assert.equal(out.studio.mode, "script");
  assert.match(m.calls[0].code, /\["className"\] = "LocalScript"/); assert.match(m.calls[0].code, /\["name"\] = "Coins"/);
  const fail = await by("file_save").run({ name: "x.lua", text: "1", to: "game.Workspace" }, mockCtx(() => { throw new Error("Studio offline"); }).ctx) as any;
  assert.equal(fail.ok, false); assert.match(fail.studioError, /Studio offline/); assert.match(fail.fileId, /^f_/);
});

test("plugin hub: attached files are stored for the AI and listed with fileIds; feed shows the user's own text", () => {
  const hub = new PluginHub();
  const store = new AiFileStore(tmp());
  hub.attachmentSink = (items) => items.map((it) => { const f = store.add(Buffer.from(it.data, "base64"), { name: it.name, mime: it.mime, source: "user" }); return `${f.name} → fileId ${f.id}`; });
  const r = hub.addRequest({ text: "put this sound in", files: [{ name: "boom.mp3", data: Buffer.from("ID3\x03\0\0\0\0\0\0").toString("base64") }] });
  const f = store.list()[0];
  assert.equal(f.kind, "audio");
  assert.ok(r.text.includes(`boom.mp3 → fileId ${f.id}`)); assert.ok(r.text.startsWith("put this sound in"));
  assert.equal((hub.eventsSince(0).find((e: any) => e.type === "user") as any).text, "put this sound in");
});

test("instructions mention file tools and the raw file block; late tools are announced", () => {
  const t = (name: string) => ({ name, description: name + " tool", inputSchema: { type: "object" }, source: "composite", risk: "write", available: true }) as any;
  const p = buildAgentPrompt({ providerName: "ChatGPT", tools: [t("execute_luau"), t("file_fetch"), t("file_save")], memorySummary: null, task: null, sessionId: "s", category: "general" } as any);
  assert.match(p, /file_fetch \{url\}/); assert.match(p, /<ROBLOX_FILE name=/);
  const n = newToolsNotice([t("file_fetch"), { ...t("x"), available: false }]);
  assert.match(n, /New tools are available/); assert.match(n, /- file_fetch/); assert.doesNotMatch(n, /- x\(/);
  assert.equal(newToolsNotice([]), "");
});
