import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { withBridge } from "./helpers.js";

const LIC = "/tmp/lic.txt";

test("pro: history records tool calls + plugin requests, free limits, license, library, app page", async () => {
  await withBridge({}, {}, async ({ api, url, bridge }) => {
    const s = await api("/api/sessions/start", { body: { provider: "test" } });
    await api("/api/calls", { body: { sessionId: s.session.id, provider: "test", call: { id: "c1", tool: "search_game_tree", args: { path: "game.Workspace" } } } });
    await api("/api/plugin/request", { body: { text: "make a shop" } });
    const h = await api("/api/pro/history?limit=50");
    assert.equal(h.limitedToDays, 7);
    assert.ok(h.rows.some((r: any) => r.kind === "tool" && r.tool === "search_game_tree"));
    assert.ok(h.rows.some((r: any) => r.kind === "request" && r.text === "make a shop"));
    assert.equal((await fetch(url + "/api/pro/history/export?session=" + s.session.id)).status, 402);
    // free library limit
    for (let i = 0; i < 5; i++) assert.ok((await api("/api/pro/library", { body: { name: "p" + i, kind: "prompt", text: "build " + i } })).item);
    assert.equal((await api("/api/pro/library", { body: { name: "p6", kind: "prompt", text: "x" } }))._status, 402);
    // license
    assert.equal((await api("/api/pro/license", { body: { key: "garbage.key" } }))._status, 400);
    if (fs.existsSync(LIC)) {
      const ok = await api("/api/pro/license", { body: { key: fs.readFileSync(LIC, "utf8") } });
      assert.equal(ok.license.pro, true);
      assert.ok((await api("/api/pro/library", { body: { name: "p6", kind: "prompt", text: "x" } })).item);
      const ex = await fetch(url + "/api/pro/history/export?session=" + s.session.id);
      assert.equal(ex.status, 200);
      assert.match(await ex.text(), /Brickwire replay/);
    }
    const items = (await api("/api/pro/library")).items;
    const sent = await api(`/api/pro/library/${items[0].id}/send`, { body: {} });
    assert.equal(sent.ok, true);
    assert.ok((await api("/api/pro/stats")).actions >= 1);
    const page = await fetch(url + "/app");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Brickwire Pro/);
    void bridge;
  });
});
