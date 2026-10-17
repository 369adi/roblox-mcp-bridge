import { test } from "node:test";
import assert from "node:assert/strict";
import { PluginHub, PLUGIN_ACTIVE_PREFERENCE_MS } from "../../shared/src/plugin-hub.js";

const tab = (id: string, active: boolean, provider = "chatgpt") => ({ tab: id, provider, providerName: provider, active });

test("plugin hub: request goes to the session tab first, idle tab only after the preference window", () => {
  let now = 1000;
  const hub = new PluginHub(() => now);
  hub.poll(tab("idle", false));
  hub.poll(tab("live", true));
  const r = hub.addRequest({ text: "build a tower", images: [{ name: "a.png", data: "iVBORw0KGgo=" }], selection: ["game.Workspace.Base"] });
  assert.equal(hub.poll(tab("idle", false)).request, null);
  const got = hub.poll(tab("live", true)).request;
  assert.equal(got?.id, r.id);
  assert.equal(got?.images.length, 1);
  hub.addRequest({ text: "second" });
  now += PLUGIN_ACTIVE_PREFERENCE_MS + 1;
  assert.equal(hub.poll(tab("idle", false)).request, null, "a session tab owns requests");
  assert.equal(hub.poll({ ...tab("live", true), ready: false }).request, null, "agent mid-turn → stays queued");
  assert.ok(hub.eventsSince(0).some((e) => e.type === "request" && e.state === "waiting"));
  assert.equal(hub.poll({ ...tab("live", true), ready: true }).request?.text, "second");
});

test("plugin hub: validation, report, controls and long-poll feed", async () => {
  const hub = new PluginHub();
  assert.throws(() => hub.addRequest({ text: "  " }));
  assert.throws(() => hub.addRequest({ text: "x", images: [{ name: "a.png", data: "not base64!!" }] }));
  const r = hub.addRequest({ text: "hello" });
  hub.poll(tab("t", true));
  hub.report(r.id, true);
  assert.equal(hub.getRequest(r.id)?.state, "delivered");
  hub.control("pause");
  assert.deepEqual(hub.poll(tab("t", true)).controls, ["pause"]);
  const last = (await hub.feed(0, 0)).last;
  const p = hub.feed(last, 2000);
  hub.pushFromExtension([{ type: "reply", key: "r1", partial: true, text: "Hel" }, { type: "bogus" }]);
  const f = await p;
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].text, "Hel");
  hub.pushFromExtension([{ type: "reply", key: "r1", partial: true, text: "Hello" }]);
  assert.equal(hub.eventsSince(0).filter((e) => e.type === "reply").length, 1, "partial snapshots replace each other");
});
