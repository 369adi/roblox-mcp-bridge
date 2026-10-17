/**
 * 2.2 completion: chat outbox (M5 attach / M6 AI), 3-way UI merge (M6 sync), AI enhance (M8), instruction re-send (M1).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const g = globalThis as any;
g.document ??= { hidden: false, body: {}, evaluate() { throw new Error("no xpath"); } };
g.XPathResult ??= { ORDERED_NODE_SNAPSHOT_TYPE: 7 };
g.location ??= { pathname: "/c/fake", hostname: "fake.test" };
g.HTMLTextAreaElement ??= class {};
g.HTMLInputElement ??= class {};

const { ChatOutbox } = await import("../../shared/src/chat-outbox.js");
const { uiMergeFactory } = await import("../../shared/src/studio2/ui-merge.js");
const { enhanceImage } = await import("../../bridge/src/imagegen.js");
const { AgentCore } = await import("../../extension/src/core/agent-core.js");

const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

test("outbox: queue -> take -> report image / fallback / failure", () => {
  let t = 1000;
  const ob = new ChatOutbox(() => t);
  const a = ob.add({ kind: "image", text: "hi", png: "data:image/png;base64," + PNG1, source: "paint" });
  assert.equal(a.png, PNG1, "data: prefix stripped");
  const taken = ob.next()!;
  assert.equal(taken.id, a.id);
  assert.equal(ob.next(), null, "not handed out twice");
  ob.report(a.id, { mode: "image", provider: "chatgpt" });
  assert.equal(ob.get(a.id)!.state, "done");
  const b = ob.add({ kind: "text", text: "x" });
  ob.next();
  ob.report(b.id, { mode: "none", error: "no composer" });
  assert.equal(ob.get(b.id)!.state, "failed");
  assert.equal(ob.view(ob.get(a.id)!).hasImage, true);
  assert.equal((ob.view(ob.get(a.id)!) as any).png, undefined);
});

test("outbox: stale take is re-queued; invalid input rejected", () => {
  let t = 0;
  const ob = new ChatOutbox(() => t);
  const a = ob.add({ text: "x" });
  ob.next();
  t += 91_000;
  assert.equal(ob.next()!.id, a.id);
  assert.throws(() => ob.add({ text: "", png: null }));
  assert.throws(() => ob.add({ png: "@@not base64@@" }));
});

const M = uiMergeFactory();
const baseDoc = { name: "Menu", children: [{ type: "Frame", name: "Panel", bg: "#111", children: [{ type: "Button", name: "Play", text: "Play" }, { type: "Text", name: "Title", text: "Game" }] }] };
const clone = (x: unknown) => JSON.parse(JSON.stringify(x));

test("ui-merge: non-overlapping edits merge, names + hierarchy kept", () => {
  const local = clone(baseDoc); local.children[0].children[0].text = "Start";
  const remote = clone(baseDoc); remote.children[0].bg = "#222"; remote.children[0].children.push({ type: "Button", name: "Shop", text: "Shop" });
  const m = M.merge3(baseDoc, local, remote);
  assert.equal(m.conflicts.length, 0);
  const p = m.doc.children[0] as any;
  assert.equal(p.name, "Panel");
  assert.equal(p.bg, "#222");
  assert.deepEqual(p.children.map((c: any) => c.name).sort(), ["Play", "Shop", "Title"]);
  assert.equal(p.children.find((c: any) => c.name === "Play").text, "Start");
});

test("ui-merge: same key edited on both sides -> conflict, prefer resolves", () => {
  const local = clone(baseDoc); local.children[0].children[1].text = "Local";
  const remote = clone(baseDoc); remote.children[0].children[1].text = "Remote";
  const m = M.merge3(baseDoc, local, remote);
  assert.equal(m.conflicts.length, 1);
  const c = m.conflicts[0];
  assert.equal(c.key, "text");
  const r = M.merge3(baseDoc, local, remote, { [`${c.path}|text`]: "remote" });
  assert.equal((r.doc.children[0] as any).children.find((x: any) => x.name === "Title").text, "Remote");
  const l = M.merge3(baseDoc, local, remote);
  assert.equal((l.doc.children[0] as any).children.find((x: any) => x.name === "Title").text, "Local", "default = local");
});

test("ui-merge: round-trip with no changes is identity", () => {
  const m = M.merge3(baseDoc, clone(baseDoc), clone(baseDoc));
  assert.equal(m.conflicts.length, 0);
  assert.deepEqual(M.flatten(m.doc), M.flatten(baseDoc));
});

test("enhance: no key -> clear error; openai -> /images/edits multipart; stability -> sd3 image-to-image", async () => {
  await assert.rejects(() => enhanceImage(Buffer.from(PNG1, "base64"), {}, (async () => { throw new Error("should not fetch"); }) as any, {} as any), /not configured/);
  const seen: string[] = [];
  const fake = (async (url: string, init: any) => {
    seen.push(url);
    assert.ok(init.body instanceof FormData);
    if (url.endsWith("/images/edits")) return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: PNG1 }] }), text: async () => "", arrayBuffer: async () => new ArrayBuffer(0) };
    return { ok: true, status: 200, json: async () => ({}), text: async () => "", arrayBuffer: async () => Buffer.from(PNG1, "base64").buffer.slice(0) };
  }) as any;
  const r1 = await enhanceImage(Buffer.from(PNG1, "base64"), {}, fake, { BRICKWIRE_IMAGE_API_KEY: "k" } as any);
  assert.equal(r1.provider, "openai");
  assert.equal(r1.png.toString("base64"), PNG1);
  const r2 = await enhanceImage(Buffer.from(PNG1, "base64"), {}, fake, { BRICKWIRE_IMAGE_API_KEY: "k", BRICKWIRE_IMAGE_PROVIDER: "stability" } as any);
  assert.equal(r2.provider, "stability");
  assert.match(seen[0], /\/images\/edits$/);
  assert.match(seen[1], /stable-image\/generate\/sd3$/);
  const bad = (async () => ({ ok: false, status: 401, text: async () => "bad key", json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) })) as any;
  await assert.rejects(() => enhanceImage(Buffer.from(PNG1, "base64"), {}, bad, { BRICKWIRE_IMAGE_API_KEY: "k" } as any), /401/);
});

test("M1: re-send command detection", () => {
  for (const s of ["/bw rules", "  /brickwire instructions", "/bw правила", "/BW Prompt please"]) assert.equal(AgentCore.isResendCommand(s), true, s);
  for (const s of ["bw rules", "/bwrules", "make rules for /bw", ""]) assert.equal(AgentCore.isResendCommand(s), false, s);
});
