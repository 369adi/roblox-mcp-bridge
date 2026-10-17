import crypto from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WorkspaceStore, graphImpact } from "../../bridge/src/workspace-store.js";
import { WORKSPACE_TOOLS, validateVfx } from "../../bridge/src/workspace-tools.js";
import { StudioCaptures } from "../../bridge/src/studio-captures.js";
import { registryRisk } from "../../bridge/src/execution-policy.js";
import { withBridge } from "../../tests/integration/helpers.js";
const fixture = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "workspace-studio-fixture.mjs",
);
const binding = {
  studioId: "studio-1",
  name: "TestPlace",
  placeId: null,
  projectKey: "local-TestPlace",
};
const spec = {
  name: "Impact",
  layers: [{ name: "Ring", type: "ring", size: [8, 0.2, 8], duration: 1, color: "#e3bd73" }],
};
const temporary = async (fn: any) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-workspace-"));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { force: true, recursive: true });
  }
};
test("workspace persists drafts, rejects stale revisions and wrong project, no executable state", () =>
  temporary(async (dir: string) => {
    const s = new WorkspaceStore(dir);
    const r = s.save({ kind: "design", name: "Core loop", data: { goal: "Feature" } }, binding);
    assert.equal(r.revision, 1);
    const s2 = new WorkspaceStore(dir);
    assert.equal(s2.get(r.id).name, "Core loop");
    const next = s2.save({ ...r, data: { goal: "Edited" } }, binding);
    assert.equal(next.revision, 2);
    assert.throws(() => s2.save(r, binding), /conflict/);
    assert.throws(() => s2.save(next, { ...binding, studioId: "other" }), /conflict/);
    assert.throws(() => s2.remove(r.id, 1), /conflict/);
    s2.remove(r.id, 2);
    assert.equal(s2.list().length, 0);
  }));
test("corrupt workspace preserved and writes blocked", () =>
  temporary(async (dir: string) => {
    fs.writeFileSync(path.join(dir, "workspace-v1.json"), "invalid");
    const s = new WorkspaceStore(dir);
    assert.ok(s.errors.length);
    assert.throws(() => s.save({ kind: "note", name: "n", data: {} }, null), /preserved/);
    assert.equal(fs.readFileSync(path.join(dir, "workspace-v1.json"), "utf8"), "invalid");
  }));
test("favorite asset records deduplicate on server while keeping projects separate", () =>
  temporary(async (dir: string) => {
    const s = new WorkspaceStore(dir),
      input = { kind: "asset", name: "Rock", data: { assetId: "pack/rock" } };
    assert.equal(s.save(input, binding).id, s.save(input, binding).id);
    s.save(input, { ...binding, studioId: "other" });
    assert.equal(s.list().length, 2);
  }));
test("impact never floods whole project through containment parents", () => {
  const g = {
    nodes: [{ path: "game" }, { path: "A" }, { path: "B" }, { path: "C" }],
    edges: [
      { from: "game", to: "A", kind: "contains" },
      { from: "game", to: "C", kind: "contains" },
      { from: "B", to: "A", kind: "static-reference" },
    ],
  };
  const i = graphImpact(g, "A");
  assert.deepEqual(
    i.nodes.map((n: any) => n.path),
    ["A", "B"],
  );
  assert.match(i.note, /dynamic/);
});
test("VFX validates supported layers, dimensions, timing and injection-prone names", () => {
  const s = validateVfx(spec);
  assert.equal(s.duration, 1);
  assert.equal(s.layers[0].type, "ring");
  for (const bad of [
    { ...spec, name: "../hack" },
    { ...spec, layers: [] },
    { ...spec, layers: [{ type: "mesh" }] },
    { ...spec, layers: [{ type: "sphere", duration: 0 }] },
    { ...spec, layers: [{ type: "sphere", size: [0, 1, 1] }] },
    { ...spec, layers: [{ type: "sphere", color: "red" }] },
    { ...spec, layers: [{ type: "sphere", start: Infinity }] },
  ])
    assert.throws(() => validateVfx(bad));
});
test("generated Luau embeds quoted source as data and contains CAS, identity/ownership guards", async () => {
  let code = "";
  const ctx: any = {
    runLuau: async (c: string) => {
      code = c;
      return {};
    },
  };
  await WORKSPACE_TOOLS.find((t) => t.name === "source_patch_guarded")!.run(
    {
      path: "game.ServerScriptService.Main",
      expected: "x",
      source: '\"; workspace:ClearAllChildren() --',
    },
    ctx,
  );
  assert.match(code, /UpdateSourceAsync/);
  assert.match(code, /current==ARGS.expected/);
  assert.match(code, /Checkpoint folder collision/);
  assert.match(code, /\\"; workspace/);
  await WORKSPACE_TOOLS.find((t) => t.name === "source_restore_guarded")!.run(
    { checkpoint: "cp_" + "a".repeat(24) },
    ctx,
  );
  assert.match(code, /Original script missing; no replacement by path/);
  assert.match(code, /current==cp.After.Value/);
  await WORKSPACE_TOOLS.find((t) => t.name === "vfx_timeline_build")!.run({ spec }, ctx);
  assert.match(code, /ModuleScript/);
  assert.match(code, /visualVerified=false/);
  assert.match(code, /Existing effect: explicit replace required/);
});
test("reviewed inspection is read-only, creation/preview/restore never classified read", () => {
  for (const name of [
    "workspace_graph",
    "source_read_guarded",
    "source_checkpoints",
    "rig_inspect",
  ])
    assert.equal(registryRisk({ name, source: "composite", risk: "read" } as any), "read");
  for (const name of [
    "vfx_timeline_build",
    "vfx_timeline_preview",
    "source_patch_guarded",
    "animation_preview_actual",
  ])
    assert.equal(registryRisk({ name, source: "composite", risk: "read" } as any), "write");
});
test("capture cache only accepts bounded raster images, excludes arbitrary paths/SVG", () => {
  const c = new StudioCaptures();
  assert.equal(
    c.save({ content: [{ type: "image", mimeType: "image/svg+xml", data: "AAAA" }] }),
    null,
  );
  const r = c.save({ content: [{ type: "image", mimeType: "image/png", data: "AAAA" }] })!;
  assert.equal(c.get(r.captureId).images[0].data, "AAAA");
  assert.equal(r.visualAccepted, false);
  assert.throws(() => c.get("missing"), /expired/);
});
async function approved(bridge: any, tool: string, args: any) {
  let approval: string | undefined;
  const p = bridge.execute(
    { id: crypto.randomUUID(), tool, args },
    { provider: "app-workspace", trusted: true },
    (a: any) => (approval = a.id),
  );
  for (let i = 0; i < 200 && !approval; i++) await new Promise((r) => setTimeout(r, 10));
  if (approval) bridge.approvals.decide(approval, true);
  return p;
}
test("JS contract fixture: full/trusted still asks approval for source CAS; stale edits refuse; source-only restore", async () => {
  await withBridge({ mcpArgs: [fixture], mode: "full" }, {}, async ({ bridge }) => {
    const before = await bridge.execute(
      {
        id: "source-r",
        tool: "source_read_guarded",
        args: { path: "game.ServerScriptService.Main" },
      },
      {},
    );
    assert.equal(before.status, "success");
    const old = (before.result as any).source;
    let asked = false;
    const p = bridge.execute(
      {
        id: "apply",
        tool: "source_patch_guarded",
        args: { path: "game.ServerScriptService.Main", expected: old, source: 'print("changed")' },
      },
      { trusted: true },
      (a) => {
        asked = true;
        bridge.approvals.decide(a.id, true);
      },
    );
    const patch: any = await p;
    assert.equal(asked, true);
    assert.equal(patch.status, "success");
    assert.equal(patch.result.runtimeTested, false);
    const bad = await approved(bridge, "source_patch_guarded", {
      path: "game.ServerScriptService.Main",
      expected: old,
      source: "stale",
    });
    assert.equal(bad.status, "error");
    assert.match(bad.error, /Conflict/);
    const restore: any = await approved(bridge, "source_restore_guarded", {
      checkpoint: patch.result.checkpoint,
    });
    assert.equal(restore.status, "success");
    const read: any = await bridge.execute(
      { id: "r2", tool: "source_read_guarded", args: { path: "game.ServerScriptService.Main" } },
      {},
    );
    assert.equal(read.result.source, old);
  });
});
test("safe forbids source/VFX writes but fresh graph reads save actual tool observations", async () => {
  await withBridge({ mcpArgs: [fixture], mode: "safe" }, {}, async ({ bridge }) => {
    const deny = await bridge.execute(
      {
        id: "safe-w",
        tool: "source_patch_guarded",
        args: { path: "game.ServerScriptService.Main", expected: "x", source: "y" },
      },
      {},
    );
    assert.equal(deny.status, "denied");
    const graph = await bridge.execute(
      { id: "graph", tool: "workspace_graph", args: { root: "game", maxNodes: 100 } },
      {},
    );
    assert.equal(graph.status, "success");
    const r = bridge.workspace.list("graph")[0];
    assert.ok(r.data.observedAt);
    assert.match(String(r.data.verification), /actual Studio MCP observation/);
    assert.ok((r.data.nodes as any[]).length > 5);
  });
});
test("fixture recovery refuses newer source, VFX requires owned replacement and playback errors remain errors", async () => {
  await withBridge({ mcpArgs: [fixture], mode: "full" }, {}, async ({ bridge }) => {
    const old = 'print("server up")\n';
    const first: any = await approved(bridge, "source_patch_guarded", {
      path: "game.ServerScriptService.Main",
      expected: old,
      source: "first",
    });
    await approved(bridge, "source_patch_guarded", {
      path: "game.ServerScriptService.Main",
      expected: "first",
      source: "newer",
    });
    const refused = await approved(bridge, "source_restore_guarded", {
      checkpoint: first.result.checkpoint,
    });
    assert.equal(refused.status, "error");
    assert.match(refused.error, /newer/);
    const vfx: any = await approved(bridge, "vfx_timeline_build", { spec });
    assert.equal(vfx.status, "success");
    assert.equal(vfx.result.visualVerified, false);
    assert.equal((await approved(bridge, "vfx_timeline_build", { spec })).status, "error");
    assert.equal(
      (
        await approved(bridge, "animation_preview_actual", {
          rig: "game.Workspace.Rig",
          sequence: "game.ServerStorage.Anim",
          action: "play",
        })
      ).status,
      "error",
    );
  });
});
test("workspace HTTP auth, local mesh generation, revision checks and no-execution design-task link", async () => {
  await withBridge({ mcpArgs: [fixture] }, {}, async ({ bridge, url, api }) => {
    assert.equal((await api("/api/workspace/state"))._status, 403);
    const { token } = await api("/api/app-mcp/access", {
      headers: { referer: url + "/app", "sec-fetch-site": "same-origin" },
    });
    const call = (p: string, body?: any) =>
      api("/api/workspace/" + p, {
        headers: { "x-brickwire-app": token },
        ...(body ? { body } : {}),
      });
    const state = await call("state");
    assert.equal(state._status, 200);
    assert.ok(state.tools.some((t: any) => t.name === "source_patch_guarded"));
    const mesh = await call("mesh-preview", { type: "gem", seed: 5 });
    assert.equal(mesh.studioVerified, false);
    assert.ok(mesh.mesh.positions.length);
    const d = await call("save", {
      kind: "design",
      name: "Fixture design",
      data: {
        goal: "Inspect",
        plan: ["Analyze"],
        criteria: [{ kind: "exists", path: "game.Workspace" }],
      },
    });
    const n = bridge.operations.list().length;
    const link = await call("design-task", { id: d.record.id, revision: d.record.revision });
    assert.equal(link.task.state, "PLANNED");
    assert.equal(bridge.operations.list().length, n);
    assert.equal((await call("save", { ...d.record, data: {} }))._status, 409);
    assert.equal((await call("optional-tools", { enabled: false }))._status, 409);
    assert.equal((await fetch(url + "/workspace-ui.js")).status, 200);
    assert.equal((await fetch(url + "/workspace.css")).status, 200);
    const cap = await bridge.execute({ id: "cap", tool: "screen_capture", args: {} }, {});
    assert.equal(cap.status, "success");
    const c = await call("capture", { id: (cap.result as any).captureId });
    assert.equal(c.images[0].mimeType, "image/png");
  });
});
test("API conversation uses existing provider against local HTTP fixture, persists history and independently verifies task", async () => {
  const http = await import("node:http");
  let turns = 0,
    context = "";
  const model = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      turns++;
      const messages = JSON.parse(raw).messages;
      context = messages.map((m: any) => m.content).join("\n");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  turns === 1
                    ? '<ROBLOX_TOOL_CALL>{"id":"read-context","tool":"workspace_context","args":{}}</ROBLOX_TOOL_CALL>'
                    : '<ROBLOX_AGENT_DONE>{"summary":"Inspected registered context; structural check remains backend-owned"}</ROBLOX_AGENT_DONE>',
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  try {
    await withBridge(
      { mcpArgs: [fixture] },
      {
        BRICKWIRE_LLM_PROVIDER: "custom",
        BRICKWIRE_LLM_URL: `http://127.0.0.1:${(model.address() as any).port}/v1`,
        BRICKWIRE_LLM_MODEL: "fixture",
        BRICKWIRE_LLM_KEY: "fixture-secret-never-return",
      },
      async ({ bridge, url, api }) => {
        const { token } = await api("/api/app-mcp/access", {
          headers: { referer: url + "/app", "sec-fetch-site": "same-origin" },
        });
        const call = (p: string, body?: any) =>
          api("/api/workspace/" + p, {
            headers: { "x-brickwire-app": token },
            ...(body ? { body } : {}),
          });
        const state = await call("state");
        assert.ok(!JSON.stringify(state).includes("fixture-secret-never-return"));
        const rec = (await call("conversation/create", { name: "Fixture conversation" })).record;
        const run = await call("conversation/run", {
          id: rec.id,
          revision: rec.revision,
          text: "Inspect Workspace",
          mode: "plan",
          criteria: [{ kind: "exists", path: "game.Workspace" }],
        });
        assert.equal(run._status, 202);
        for (let i = 0; i < 200 && bridge.workspace.get(rec.id).data.lastState === undefined; i++)
          await new Promise((r) => setTimeout(r, 10));
        const saved = bridge.workspace.get(rec.id);
        assert.equal(saved.data.lastState, "DONE");
        assert.equal((saved.data.messages as any[]).length, 2);
        assert.match(context, /User message: Inspect Workspace/);
        assert.equal(bridge.tasks.get(run.task.id).evidence[0].status, "passed");
        assert.ok(bridge.operations.list(run.task.id).some((o) => o.tool === "workspace_context"));
        const second = await call("conversation/run", {
          id: rec.id,
          revision: saved.revision,
          text: "Discuss next steps only",
          mode: "plan",
          criteria: [],
        });
        assert.equal(second._status, 202);
        for (
          let i = 0;
          i < 200 && bridge.workspace.get(rec.id).revision === second.record.revision;
          i++
        )
          await new Promise((r) => setTimeout(r, 10));
        assert.equal(bridge.workspace.get(rec.id).data.lastState, "PARTIAL");
        assert.match(context, /Conversation history/);
        assert.equal((bridge.workspace.get(rec.id).data.messages as any[]).length, 4);
      },
    );
  } finally {
    await new Promise<void>((r) => model.close(() => r()));
  }
});
test("API-agent modifying calls surface scoped approvals; confirmation is explicit and final claim is not fabricated", async () => {
  const http = await import("node:http");
  let turns = 0;
  const model = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      turns++;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  turns === 1
                    ? '<ROBLOX_TOOL_CALL>{"id":"cas-agent","tool":"source_patch_guarded","args":{"path":"game.ServerScriptService.Main","expected":"print(\\\"server up\\\")\\n","source":"print(\\\"agent changed\\\")"}}</ROBLOX_TOOL_CALL>'
                    : '<ROBLOX_AGENT_DONE>{"summary":"Source changed, runtime not tested"}</ROBLOX_AGENT_DONE>',
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  try {
    await withBridge(
      { mcpArgs: [fixture] },
      {
        BRICKWIRE_LLM_PROVIDER: "custom",
        BRICKWIRE_LLM_URL: `http://127.0.0.1:${(model.address() as any).port}/v1`,
        BRICKWIRE_LLM_MODEL: "fixture",
        BRICKWIRE_LLM_KEY: "fixture-key",
      },
      async ({ bridge, url, api }) => {
        const { token } = await api("/api/app-mcp/access", {
          headers: { referer: url + "/app", "sec-fetch-site": "same-origin" },
        });
        const call = (p: string, body?: any) =>
          api("/api/workspace/" + p, {
            headers: { "x-brickwire-app": token },
            ...(body ? { body } : {}),
          });
        const rec = (await call("conversation/create", { name: "Approval fixture" })).record;
        const run = await call("conversation/run", {
          id: rec.id,
          revision: rec.revision,
          text: "Change source only after approval",
          mode: "supervised",
          criteria: [],
        });
        for (let i = 0; i < 200 && !bridge.approvals.list().length; i++)
          await new Promise((r) => setTimeout(r, 10));
        const state = await call("state");
        assert.equal(state.agent.approvals.length, 1);
        const ap = state.agent.approvals[0];
        assert.equal(ap.tool, "source_patch_guarded");
        assert.equal((await call("approve", { id: ap.id, approve: true }))._status, 409);
        const approved = await call("approve", { id: ap.id, approve: false, acknowledge: true });
        assert.equal(approved.resolved, true);
        for (let i = 0; i < 200 && bridge.workspace.get(rec.id).data.lastState === undefined; i++)
          await new Promise((r) => setTimeout(r, 10));
        assert.notEqual(bridge.workspace.get(rec.id).data.lastState, "DONE");
        assert.equal(
          (await call("approve", { id: ap.id, approve: true, acknowledge: true }))._status,
          409,
        );
      },
    );
  } finally {
    await new Promise<void>((r) => model.close(() => r()));
  }
});
