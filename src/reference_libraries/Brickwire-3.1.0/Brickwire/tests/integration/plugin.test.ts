import { test } from "node:test";
import assert from "node:assert/strict";
import { withBridge } from "./helpers.js";

test("studio plugin: request → extension poll → events → plugin feed (no Origin like Studio HttpService)", async () => {
  await withBridge({}, {}, async ({ api }) => {
    const sent = await api("/api/plugin/request", { body: { text: "build a tower", images: [{ name: "ref.png", data: "iVBORw0KGgo=" }], selection: ["Workspace.Base (Part)"], place: "Place2" } });
    assert.equal(sent.ok, true);
    assert.equal(sent.status.browser, false);
    const feed0 = await api("/api/plugin/feed?since=0&wait=0");
    assert.equal(feed0.events[0].type, "user");
    const poll = await api("/api/plugin/next", { body: { tab: "t1", provider: "chatgpt", providerName: "ChatGPT", active: true, stage: "ANALYZE" } });
    assert.ok(poll.request.text.startsWith("build a tower")); assert.match(poll.request.text, /ref\.png \(image, 1 KB\) → fileId f_[a-f0-9]{12}/); // 3.0.1: attachments are stored for the file tools
    assert.equal(poll.request.images[0].name, "ref.png");
    assert.equal((await api(`/api/plugin/request/${poll.request.id}/result`, { body: { ok: true } })).ok, true);
    const waiting = api(`/api/plugin/feed?since=${feed0.last}&wait=3000`);
    await api("/api/plugin/event", { body: { events: [{ type: "reply", key: "3", partial: false, text: "Building it" }, { type: "done", summary: "tower built" }] } });
    const f = await waiting;
    assert.ok(f.events.some((e: any) => e.type === "request" && e.state === "taken"));
    const all = await api("/api/plugin/feed?since=0&wait=0");
    assert.ok(all.events.some((e: any) => e.type === "done" && e.summary === "tower built"));
    assert.equal(all.status.session.provider, "ChatGPT");
    assert.equal((await api("/api/plugin/control", { body: { action: "explode" } }))._status, 400);
    assert.equal((await api("/api/plugin/control", { body: { action: "pause" } })).ok, true);
    const p2 = await api("/api/plugin/next", { body: { tab: "t1", provider: "chatgpt", active: true } });
    assert.deepEqual(p2.controls, ["pause"]);
  });
});
