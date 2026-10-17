import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { OperationStore } from "../../bridge/src/operation-store.js";
import { TaskRuntime } from "../../bridge/src/task-runtime.js";
import { localLiteral, executionRisk } from "../../bridge/src/execution-policy.js";
import { withBridge } from "../../tests/integration/helpers.js";
const binding = { studioId: "studio-1", name: "TestPlace", placeId: null, projectKey: "TestPlace" };
async function temporary(fn: (dir: string) => Promise<void>) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-runtime-"));
  try {
    await fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
test("strict policy denies bracket assignment, PivotTo, Terrain, require and disguised raw source", () => {
  const t: any = { name: "execute_luau", source: "mcp", risk: "read" };
  for (const code of [
    "return workspace.Name",
    'workspace.Baseplate["Transparency"] = 1',
    'workspace.Baseplate["Parent"] = nil',
    "workspace.Baseplate:PivotTo(CFrame.new())",
    "workspace.Terrain:FillBlock(CFrame.new(),Vector3.new(1,1,1),Enum.Material.Rock)",
    "return require(1)",
    "return 1; workspace:ClearAllChildren()",
    "return (function() return 1 end)()",
  ])
    assert.notEqual(executionRisk(t, "read", code), "read", code);
  for (const code of ["return 1", "return true", "return nil", 'return "hello"'])
    assert.ok(localLiteral(code));
  assert.equal(localLiteral("return {1,2}"), null);
  assert.equal(executionRisk({ name: "unreviewed", source: "mcp", risk: "read" } as any, "read"), "write");
});
test("durable ledger deduplicates simultaneous/restarted mutations but performs fresh reads", () =>
  temporary(async (dir) => {
    const store = new OperationStore(dir);
    let writes = 0;
    const call = { id: "stable-action", tool: "modify_instance", args: { path: "game.Workspace" } };
    const ctx = { binding, risk: "write", args: call.args, sessionId: "s1" };
    const run = async () => {
      writes++;
      await new Promise((r) => setTimeout(r, 20));
      return { id: call.id, status: "success" as const, result: { ok: true }, error: null };
    };
    const [a, b] = await Promise.all([store.execute(call, ctx, run), store.execute(call, ctx, run)]);
    assert.equal(writes, 1);
    assert.equal(a.meta.operationId, b.meta.operationId);
    const resumed = new OperationStore(dir);
    assert.equal((await resumed.execute(call, ctx, run)).meta.deduplicated, true);
    assert.equal(writes, 1);
    await resumed.execute(call, { ...ctx, risk: "read" }, run);
    await resumed.execute(call, { ...ctx, risk: "read" }, run);
    assert.equal(writes, 3);
  }));
test("uncertain outcomes and interrupted durable PREPARE never replay writes", () =>
  temporary(async (dir) => {
    const store = new OperationStore(dir);
    const call = { id: "uncertain", tool: "modify_instance", args: {} };
    const ctx = { binding, risk: "write", args: {} };
    let runs = 0;
    const first = await store.execute(call, ctx, async () => {
      runs++;
      throw Error("disconnected after sending");
    });
    assert.equal(first.status, "error");
    assert.equal(first.meta.mayHaveChanged, true);
    assert.equal(
      (
        await new OperationStore(dir).execute(call, ctx, async () => {
          runs++;
          throw Error("replayed");
        })
      ).status,
      "denied",
    );
    assert.equal(runs, 1);
    const file = path.join(dir, "operations-v1", store.list()[0].id + ".json");
    const row = JSON.parse(fs.readFileSync(file, "utf8"));
    row.state = "running";
    delete row.result;
    fs.writeFileSync(file, JSON.stringify(row));
    assert.equal(new OperationStore(dir).list()[0].state, "uncertain");
  }));
test("per-Studio write queue serializes modifying operations", () =>
  temporary(async (dir) => {
    const s = new OperationStore(dir);
    const events: string[] = [];
    await Promise.all([
      s.serialize("one", async () => {
        events.push("a-start");
        await new Promise((r) => setTimeout(r, 20));
        events.push("a-end");
      }),
      s.serialize("one", async () => {
        events.push("b");
      }),
    ]);
    assert.deepEqual(events, ["a-start", "a-end", "b"]);
  }));
test("task acceptance requires current evidence; in-flight writes, revisions and restart invalidate completion", () =>
  temporary(async (dir) => {
    const r = new TaskRuntime(dir),
      t = r.create(
        {
          goal: "Check Workspace",
          mode: "supervised",
          criteria: [{ kind: "exists", path: "game.Workspace" }],
        },
        binding,
      );
    r.control(t.id, "start", "session");
    r.beginWrite(t);
    assert.throws(() => r.claim(t.id, "claimed"), /in flight/);
    r.endWrite(t);
    r.addEvidence(t, {
      criterionId: "c1",
      status: "passed",
      observed: "Workspace",
      at: new Date().toISOString(),
      revision: t.revision,
      binding,
    });
    r.invalidate(t);
    assert.equal(r.claim(t.id, "not done").state, "PARTIAL");
    r.control(t.id, "resume", "session");
    r.addEvidence(t, {
      criterionId: "c1",
      status: "passed",
      observed: "Workspace",
      at: new Date().toISOString(),
      revision: t.revision,
      binding,
    });
    assert.equal(r.claim(t.id, "checked").state, "DONE");
    const other = r.create({ goal: "Another", mode: "plan", criteria: [], maxCalls: 1 }, binding);
    r.control(other.id, "start", "s2");
    assert.match(r.check(other, true)!, /forbids/);
    r.consume(other, false);
    assert.match(r.check(other, false)!, /budget/);
    assert.equal(new TaskRuntime(dir).get(other.id).state, "PAUSED");
  }));
test("safe Bridge blocks raw mutations and evaluates only scalar literals locally; typed reads remain enabled by default", async () => {
  await withBridge({ mode: "safe", composites: false }, {}, async ({ bridge }) => {
    const sid = (await bridge.startSession("app-test")).session.id;
    for (const code of [
      'workspace.Baseplate["Transparency"] = 1',
      "workspace.Baseplate:PivotTo(CFrame.new())",
      "workspace.Terrain:FillBlock(CFrame.new(),Vector3.new(1,1,1),Enum.Material.Rock)",
      "return workspace.Name",
    ])
      assert.equal(
        (
          await bridge.execute(
            { id: "deny-" + code, tool: "execute_luau", args: { code } },
            { sessionId: sid },
          )
        ).status,
        "denied",
      );
    const literal = await bridge.execute(
      { id: "literal", tool: "execute_luau", args: { code: "return 1" } },
      { sessionId: sid },
    );
    assert.equal(literal.status, "success");
    assert.equal((literal.result as any).studioExecuted, false);
    const read = await bridge.execute(
      { id: "read", tool: "read_instance", args: { path: "game.Workspace", properties: ["ClassName"] } },
      { sessionId: sid },
    );
    assert.equal(read.status, "success");
  });
});
test("explicit missing Studio is never replaced; session target mismatch and place change block operations", async () => {
  await withBridge({ mode: "full" }, {}, async ({ bridge }) => {
    const sid = (await bridge.startSession("app-test")).session.id;
    assert.equal(
      (
        await bridge.execute(
          {
            id: "wrongtarget",
            tool: "execute_luau",
            args: { code: 'workspace.Name="x"', studio_id: "other" },
          },
          { sessionId: sid },
        )
      ).status,
      "denied",
    );
    bridge.settings.selectedStudioId = "gone";
    await bridge.pollStudios();
    assert.equal(bridge.selectedStudio(), null);
    assert.equal(bridge.settings.selectedStudioId, "gone");
    assert.equal(
      (
        await bridge.execute(
          {
            id: "lost",
            tool: "modify_instance",
            args: { path: "game.Workspace", properties: { Name: "x" } },
          },
          { sessionId: sid },
        )
      ).status,
      "denied",
    );
    bridge.settings.selectedStudioId = null;
    const b = bridge.currentBinding(sid)!;
    b.name = "changed";
    assert.equal(
      (
        await bridge.execute(
          { id: "changed", tool: "read_instance", args: { path: "game.Workspace" } },
          { sessionId: sid },
        )
      ).status,
      "denied",
    );
  });
});
test("app task routes auth, create/start/verify/claim, task tree and cancel gate use actual mock Studio reads", async () => {
  await withBridge({ mode: "auto" }, {}, async ({ bridge, url, api }) => {
    assert.equal((await api("/api/app-runtime/state"))._status, 403);
    const { token } = await api("/api/app-mcp/access", {
      headers: { referer: url + "/app", "sec-fetch-site": "same-origin" },
    });
    const call = (p: string, body?: any) =>
      api("/api/app-runtime/" + p, {
        headers: { "x-brickwire-app": token },
        ...(body === undefined ? {} : { body }),
      });
    const created = await call("tasks", {
      goal: "Verify Workspace",
      mode: "supervised",
      criteria: [{ kind: "exists", path: "game.Workspace" }],
    });
    assert.equal(created._status, 201);
    const id = created.task.id;
    await call(`tasks/${id}/start`, {});
    const verified = await call(`tasks/${id}/verify`, {});
    assert.equal(verified.task.evidence[0].status, "passed");
    assert.equal((await call(`tasks/${id}/claim`, { summary: "Inspected" })).task.state, "DONE");
    assert.equal((await call(`tasks/${id}/tree`)).operations.length, 1);
    const c = (await call("tasks", { goal: "Cancel me", mode: "plan", criteria: [] })).task;
    const started = await call(`tasks/${c.id}/start`, {});
    await call(`tasks/${c.id}/cancel`, {});
    const blocked = await bridge.execute(
      { id: "after-cancel", tool: "read_instance", args: { path: "game.Workspace" } },
      { sessionId: started.task.sessionId },
    );
    assert.equal(blocked.status, "denied");
  });
});
test("supervised task requires approval even in full/trustAll; pause before approval prevents write", async () => {
  await withBridge({ mode: "full" }, {}, async ({ bridge }) => {
    const sid = (await bridge.startSession("app-test")).session.id;
    bridge.updateSession(sid, { trustAll: true });
    const t = bridge.tasks.create(
      { goal: "Controlled change", mode: "supervised", criteria: [] },
      bridge.currentBinding(sid)!,
    );
    bridge.tasks.control(t.id, "start", sid);
    let approval = "";
    const promise = bridge.execute(
      { id: "gated", tool: "modify_instance", args: { path: "game.Workspace", properties: { Name: "x" } } },
      { sessionId: sid },
      (a) => {
        approval = a.id;
      },
    );
    for (let i = 0; i < 100 && !approval; i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(approval);
    bridge.tasks.control(t.id, "pause");
    bridge.approvals.decide(approval, true);
    const result = await promise;
    assert.equal(result.status, "denied");
    assert.match(result.error!, /paused/);
  });
});
test("backend agent DONE report cannot complete a task without acceptance evidence", async () => {
  await withBridge({}, {}, async ({ bridge, api }) => {
    const sid = (await bridge.startSession("app-test")).session.id;
    assert.equal(bridge.reportClaim(sid, "AI says done").state, "PARTIAL");
    assert.equal(bridge.updateSession(sid, { stage: "DONE" })?.stage, "TEST");
    assert.equal(
      (await api("/api/plugin/event", { body: { type: "done", summary: "Generated code" } }))._status,
      200,
    );
    assert.ok(!bridge.history.query({ limit: 10 }).some((h) => h.kind === "done"));
  });
});

test("API-agent task executes registered tool then independently verifies approved criteria using real HTTP fixture", async () => {
  const http = await import("node:http");
  let turns = 0;
  const model = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      turns++;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  turns === 1
                    ? '<ROBLOX_TOOL_CALL>{"id":"observe","tool":"get_studio_state","args":{}}</ROBLOX_TOOL_CALL>'
                    : '<ROBLOX_AGENT_DONE>{"summary":"Observed Workspace"}</ROBLOX_AGENT_DONE>',
              },
            },
          ],
        }),
      );
    });
  });
  await new Promise<void>((r) => model.listen(0, "127.0.0.1", r));
  try {
    const addr = model.address() as any;
    await withBridge(
      {},
      {
        BRICKWIRE_LLM_PROVIDER: "custom",
        BRICKWIRE_LLM_URL: `http://127.0.0.1:${addr.port}/v1`,
        BRICKWIRE_LLM_KEY: "fixture-test-only",
        BRICKWIRE_LLM_MODEL: "fixture",
      },
      async ({ bridge, url, api }) => {
        const { token } = await api("/api/app-mcp/access", {
          headers: { referer: url + "/app", "sec-fetch-site": "same-origin" },
        });
        const call = (p: string, body: any) =>
          api("/api/app-runtime/" + p, { body, headers: { "x-brickwire-app": token } });
        const t = (
          await call("tasks", {
            goal: "Inspect Workspace",
            mode: "plan",
            criteria: [{ kind: "exists", path: "game.Workspace" }],
          })
        ).task;
        await call(`tasks/${t.id}/start`, {});
        assert.equal((await call(`tasks/${t.id}/agent`, {}))._status, 202);
        for (let i = 0; i < 100 && bridge.tasks.get(t.id).state === "RUNNING"; i++)
          await new Promise((r) => setTimeout(r, 20));
        const done = bridge.tasks.get(t.id);
        assert.equal(done.state, "DONE");
        assert.equal(done.evidence[0].status, "passed");
        assert.equal(turns, 2);
        assert.ok(bridge.operations.list(t.id).some((o) => o.tool === "read_instance"));
      },
    );
  } finally {
    await new Promise<void>((r) => model.close(() => r()));
  }
});

test("completion with no criteria stays PARTIAL, and changed action payload cannot reuse an existing ID", () =>
  temporary(async (dir) => {
    const tasks = new TaskRuntime(dir);
    const t = tasks.create({ goal: "No invented acceptance", mode: "plan", criteria: [] }, binding);
    tasks.control(t.id, "start", "s1");
    assert.equal(tasks.claim(t.id, "DONE").state, "PARTIAL");
    const store = new OperationStore(dir);
    const ctx = { binding, risk: "write", args: {} };
    await store.execute({ id: "one", tool: "modify", args: { x: 1 } }, ctx, async () => ({
      id: "one",
      status: "success",
      result: true,
      error: null,
    }));
    const changed = await store.execute({ id: "one", tool: "modify", args: { x: 2 } }, ctx, async () => {
      throw Error("must never run");
    });
    assert.equal(changed.status, "denied");
    assert.match(changed.error!, /reused/);
  }));
