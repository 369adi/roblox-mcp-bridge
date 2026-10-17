import { test } from "node:test";
import assert from "node:assert/strict";
import { withBridge } from "./helpers.js";

const call = (sessionId: string, tool: string, args: Record<string, unknown> = {}, id = Math.random().toString(36).slice(2)) => ({ body: { sessionId, provider: "test", call: { id, tool, args } } });

test("health states: ready / studio not found / MCP disabled", async () => {
  await withBridge({}, {}, async ({ api }) => {
    const h = await api("/api/health");
    assert.equal(h.state, "MCP_READY");
    assert.equal(h.studio.selected.id, "studio-1");
  });
  await withBridge({}, { MOCK_NO_STUDIO: "1" }, async ({ api }) => {
    const h = await api("/api/health");
    assert.equal(h.state, "STUDIO_NOT_FOUND");
    assert.match(h.reason, /Studio unavailable/);
    const s = await api("/api/sessions/start", { body: { provider: "x" } });
    assert.equal(s._status, 409);
  });
  await withBridge({ mcpCommand: null, mcpReason: "Studio MCP launcher not found" }, {}, async ({ api }) => {
    const h = await api("/api/health");
    assert.equal(h.state, "BRIDGE_READY");
    assert.match(h.reason, /MCP unavailable/);
  });
});

test("security: foreign origins and DNS-rebinding hosts are rejected; extension origin allowed", async () => {
  await withBridge({}, {}, async ({ url, api }) => {
    assert.equal((await api("/api/health", { headers: { Origin: "https://evil.example" } }))._status, 403);
    assert.equal((await api("/api/health", { headers: { Origin: "chrome-extension://abcdefghijklmnop" } }))._status, 200);
    const http = await import("node:http");
    const status = await new Promise<number>((res) => {
      const u = new URL(url);
      http.get({ host: u.hostname, port: u.port, path: "/api/health", headers: { Host: "evil.example" } }, (r) => res(r.statusCode ?? 0));
    });
    assert.equal(status, 403, "DNS-rebinding Host rejected");
  });
});

test("tool registry: dynamic MCP tools + composites; composites vanish without execute_luau; blocked tools", async () => {
  await withBridge({ blockedTools: ["script_grep"] }, {}, async ({ api }) => {
    const { tools } = await api("/api/tools");
    const by = Object.fromEntries(tools.map((t: any) => [t.name, t]));
    assert.equal(by.search_game_tree.source, "mcp");
    assert.equal(by.create_part.source, "composite");
    assert.equal(by.create_part.available, true);
    assert.equal(by.memory_note.source, "bridge");
    assert.equal(by.script_grep.available, false);
    assert.equal(by.start_stop_play.risk, "write");
  });
  await withBridge({}, { MOCK_HIDE_TOOLS: "execute_luau" }, async ({ api }) => {
    const { tools } = await api("/api/tools");
    const cp = tools.find((t: any) => t.name === "create_part");
    assert.equal(cp.available, false);
    assert.match(cp.unavailableReason, /execute_luau/);
    assert.ok(!tools.some((t: any) => t.name === "execute_luau"), "no fake execute_luau");
  });
});

test("session + full call flow: memory scan, validation, unknown tool, approval, snapshot & rollback", async () => {
  await withBridge({}, {}, async ({ api }) => {
    const st = await api("/api/sessions/start", { body: { provider: "test", task: "build" } });
    const sid = st.session.id;
    assert.match(st.memorySummary, /MenuCasov/);
    assert.equal((await api("/api/health")).state, "SESSION_ACTIVE");

    const unknown = await api("/api/calls", call(sid, "get_gametree"));
    assert.equal(unknown.result.status, "error");
    assert.match(unknown.result.error, /Did you mean: get_game_tree/);

    const bad = await api("/api/calls", call(sid, "create_part", { size: [1, 2, 3] }));
    assert.match(bad.result.error, /args.name: required/);

    const dup = await api("/api/calls", call(sid, "create_ui", { tree: { className: "ScreenGui", name: "MenuCasov" } }));
    assert.match(dup.result.error, /already exists/, "duplicates refused");

    const created = await api("/api/calls", call(sid, "create_part", { name: "P1", size: [2, 2, 2] }));
    assert.equal(created.result.status, "success");
    assert.ok(created.result.meta.snapshotId, "auto snapshot before create");

    // destructive → pending approval → approve
    const del = await api("/api/calls", { body: { ...call(sid, "delete_instance", { path: "game.Workspace.P1" }).body, waitMs: 5000 } });
    assert.equal(del.state, "pending_approval");
    assert.equal((await api("/api/approvals")).approvals.length, 1);
    await api(`/api/approvals/${del.approvalId}`, { body: { approve: true } });
    const done = await api(`/api/calls/${del.callId}?wait=5000&since=pending_approval`);
    assert.equal(done.result.status, "success");
    const snapId = done.result.meta.snapshotId;
    assert.ok(snapId);

    const gone = await api("/api/calls", call(sid, "search_game_tree", { path: "game.Workspace", keywords: "P1" }));
    assert.deepEqual(gone.result.result, []);

    // rollback the delete (restore requires approval too)
    const rs = await api("/api/calls", { body: { ...call(sid, "restore_snapshot", { snapshotId: snapId }).body, waitMs: 3000 } });
    await api(`/api/approvals/${rs.approvalId}`, { body: { approve: true } });
    const rsd = await api(`/api/calls/${rs.callId}?wait=5000&since=pending_approval`);
    assert.deepEqual(rsd.result.result.restored, ["game.Workspace.P1"]);
    const back = await api("/api/calls", call(sid, "search_game_tree", { path: "game.Workspace", keywords: "P1" }));
    assert.equal(back.result.result.length, 1, "restored");

    // dashboard rollback route (same executor + approval rules): restore the create snapshot → P1 removed
    const dr = await api(`/api/snapshots/${created.result.meta.snapshotId}/restore`, { body: { waitMs: 3000 } });
    assert.equal(dr.state, "pending_approval");
    await api(`/api/approvals/${dr.approvalId}`, { body: { approve: true } });
    const drd = await api(`/api/calls/${dr.callId}?wait=5000&since=pending_approval`);
    assert.deepEqual(drd.result.result.removed, ["game.Workspace.P1"]);
    await api("/api/calls", call(sid, "create_part", { name: "P1", size: [2, 2, 2] }));

    // rejection
    const del2 = await api("/api/calls", { body: { ...call(sid, "delete_instance", { path: "game.Workspace.P1" }).body, waitMs: 3000 } });
    await api(`/api/approvals/${del2.approvalId}`, { body: { approve: false } });
    const rej = await api(`/api/calls/${del2.callId}?wait=5000&since=pending_approval`);
    assert.equal(rej.result.status, "rejected");

    // memory recorded changes, notes and snapshots
    const proj = await api(`/api/projects/${st.session.projectKey}`);
    assert.ok(proj.project.changes.some((c: any) => c.tool === "create_part"));
    assert.ok(proj.project.snapshots.length >= 2);
    await api("/api/calls", call(sid, "memory_note", { category: "system", text: "Case system lives in ServerScriptService.Cases", path: "game.ServerScriptService.Cases" }));
    assert.match((await api(`/api/projects/${st.session.projectKey}`)).summary, /Case system lives/);

    // script round trip through native MCP tools
    const cs = await api("/api/calls", call(sid, "create_script", { parent: "game.ServerScriptService", name: "Cases", source: 'print("cases")\n' }));
    assert.equal(cs.result.status, "success");
    const rd = await api("/api/calls", call(sid, "script_read", { path: "game.ServerScriptService.Cases" }));
    assert.equal(rd.result.result, 'print("cases")\n');

    // playtest + output
    const pl = await api("/api/calls", call(sid, "start_stop_play", { action: "start" }));
    assert.equal(pl.result.status, "success");
    const out = await api("/api/calls", call(sid, "get_console_output"));
    assert.match(out.result.result, /cases/);

    // stop session; calls for inactive session refused
    await api("/api/sessions/stop", { body: { sessionId: sid } });
    assert.equal((await api("/api/calls", call(sid, "get_game_tree")))._status, 409);
  });
});

test("safety modes: safe denies writes, approval confirms writes", async () => {
  await withBridge({ mode: "safe" }, {}, async ({ api }) => {
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    const r = await api("/api/calls", call(sid, "create_part", { name: "X" }));
    assert.equal(r.result.status, "denied");
    const ok = await api("/api/calls", call(sid, "get_game_tree", { path: "game.Workspace", depth: 0 }));
    assert.equal(ok.result.status, "success");
    const luauRead = await api("/api/calls", call(sid, "execute_luau", { code: "return 1" }));
    assert.equal(luauRead.result.status, "success", "read-only Luau allowed in safe mode");
  });
  await withBridge({ mode: "approval" }, {}, async ({ api }) => {
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    const r = await api("/api/calls", { body: { ...call(sid, "create_part", { name: "X" }).body, waitMs: 2000 } });
    assert.equal(r.state, "pending_approval");
  });
});

test("timeouts: reads retried once then reported; never fake success", async () => {
  await withBridge({}, { MOCK_SLOW: "get_console_output:2500" }, async ({ api, bridge }) => {
    bridge.saveSettings({ toolTimeoutMs: 5000 });
    (bridge.settings as any).toolTimeoutMs = 400; // below the clamp, for test speed
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    const r = await api("/api/calls", call(sid, "get_console_output"));
    assert.equal(r.result.status, "timeout");
    assert.equal(r.result.meta.retries, 1);
  });
});

test("execute_luau print-only Studio builds: results recovered from console output", async () => {
  await withBridge({ luauPrintResults: true }, { MOCK_PRINT_ONLY: "1" }, async ({ api }) => {
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    const r = await api("/api/calls", call(sid, "get_game_tree", { path: "game.Workspace", depth: 1 }));
    assert.equal(r.result.status, "success");
    assert.equal(r.result.result.tree.name, "Workspace");
  });
});

test("open-source Studio MCP (run_code {command}): exposed as execute_luau, composites + raw run_code calls work", async () => {
  await withBridge({}, { MOCK_RUN_CODE: "1" }, async ({ api }) => {
    const tools = (await api("/api/tools")).tools as Array<{ name: string; available: boolean }>;
    assert.ok(tools.find((t) => t.name === "execute_luau")?.available, "alias registered");
    assert.ok(tools.find((t) => t.name === "get_game_tree")?.available, "composites see execute_luau");
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    const r = await api("/api/calls", call(sid, "get_game_tree", { path: "game.Workspace", depth: 1 }));
    assert.equal(r.result.status, "success", JSON.stringify(r.result));
    assert.equal(r.result.result.tree.name, "Workspace");
    for (const t of ["execute_luau", "run_code"]) {
      const x = await api("/api/calls", call(sid, t, { code: "print('hi')" }));
      assert.equal(x.result.status, "success", JSON.stringify(x.result));
      assert.match(String(x.result.result), /arbitrary Luau/);
    }
  });
});

test("MCP disconnect mid-session: bridge reports MCP unavailable, then recovers", async () => {
  await withBridge({}, {}, async ({ api, bridge }) => {
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    (bridge.mcp as any).proc.kill(); // simulate Studio MCP process dying
    for (let i = 0; i < 40 && bridge.mcp.state === "ready"; i++) await new Promise((r) => setTimeout(r, 25));
    const r = await api("/api/calls", call(sid, "inspect_instance", { path: "game.Workspace" }));
    assert.notEqual(r.result.status, "success", "no fake success while disconnected");
    assert.ok(r.result.error, "error reported: " + JSON.stringify(r.result));
    for (let i = 0; i < 200 && bridge.mcp.state !== "ready"; i++) await new Promise((r) => setTimeout(r, 50));
    assert.equal(bridge.mcp.state, "ready", "reconnected");
    await bridge.pollStudios();
    const ok = await api("/api/calls", call(sid, "inspect_instance", { path: "game.Workspace" }));
    assert.equal(ok.result.status, "success");
  });
});

test("per-session approval mode from the panel: full = no prompts; trustAll skips confirmations", async () => {
  await withBridge({ mode: "approval" }, {}, async ({ api }) => {
    // session started with mode "full" (panel → Approvals: Full auto) overrides the bridge default
    const s1 = (await api("/api/sessions/start", { body: { provider: "t", mode: "full", category: "build" } })).session;
    assert.equal(s1.mode, "full");
    assert.equal(s1.category, "build");
    const r1 = await api("/api/calls", { body: { ...call(s1.id, "delete_instance", { path: "game.Workspace.Baseplate" }).body, waitMs: 3000 } });
    assert.notEqual(r1.state, "pending_approval", "full auto never asks");
    // switch to "auto" mid-session → destructive asks again
    await api("/api/sessions/update", { body: { sessionId: s1.id, mode: "auto" } });
    const r2 = await api("/api/calls", { body: { ...call(s1.id, "delete_instance", { path: "game.Workspace.SpawnLocation" }).body, waitMs: 1500 } });
    assert.equal(r2.state, "pending_approval");
    await api(`/api/approvals/${r2.approvalId}`, { body: { approve: false } });
    // "Approve all (session)" → no more prompts
    await api("/api/sessions/update", { body: { sessionId: s1.id, trustAll: true } });
    const r3 = await api("/api/calls", { body: { ...call(s1.id, "create_part", { name: "Y" }).body, waitMs: 3000 } });
    assert.notEqual(r3.state, "pending_approval");
    // safe (read-only) still denies even with trustAll
    await api("/api/sessions/update", { body: { sessionId: s1.id, mode: "safe" } });
    const r4 = await api("/api/calls", { body: { ...call(s1.id, "create_part", { name: "Z" }).body, waitMs: 3000 } });
    assert.equal(r4.result.status, "denied");
  });
});

test("'Client proxy is out of date' (Studio updated): bridge restarts the MCP proxy and the call succeeds", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const flag = join(mkdtempSync(join(tmpdir(), "bw-stale-")), "stale");
  writeFileSync(flag, "1");
  await withBridge({}, { MOCK_STALE_FILE: flag }, async ({ api, bridge }) => {
    const sid = (await api("/api/sessions/start", { body: { provider: "t" } })).session.id;
    const r = await api("/api/calls", call(sid, "get_studio_state", {}));
    assert.equal(r.result.status, "success", JSON.stringify(r.result));
    assert.equal(bridge.mcp.staleProxy, false);
  });
});

test("proxy stays out of date after restart: clear instructions instead of a cryptic error", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const flag = join(mkdtempSync(join(tmpdir(), "bw-stale-")), "stale");
  writeFileSync(flag, "1");
  await withBridge({}, { MOCK_STALE_FILE: flag, MOCK_STALE_FOREVER: "1" }, async ({ api, bridge }) => {
    assert.equal(bridge.mcp.staleProxy, true, "detected by the Studio poll");
    const r = await api("/api/sessions/start", { body: { provider: "t" } });
    assert.equal(r._status, 409);
    assert.match(r.error, /close ALL Roblox Studio windows/);
    assert.equal(bridge.computeState().state, "ERROR");
  });
});
