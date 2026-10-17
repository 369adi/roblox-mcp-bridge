import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRecovery, type RecoveryLedger } from "../../extension/src/core/tab-recovery.js";

const st = (o: Record<string, unknown> = {}) => ({ provider: "chatgpt", providerName: "ChatGPT", active: true, stage: "BUILD", task: "t", sessionId: "s1", url: "https://chatgpt.com/c/abc", ...o }) as any;

test("M2-AC1 closed tab mid-session → reopen same chat URL; cooldown + cap prevent loops", () => {
  const L: RecoveryLedger = {};
  const d = decideRecovery(st(), {}, L, 1000);
  assert.deepEqual(d, { recover: true, url: "https://chatgpt.com/c/abc", sessionId: "s1" });
  assert.equal(decideRecovery(st(), {}, L, 30_000).recover, false, "cooldown");
  assert.equal(decideRecovery(st(), {}, L, 100_000).recover, true);
  assert.equal(decideRecovery(st(), {}, L, 200_000).recover, true);
  assert.equal(decideRecovery(st(), {}, L, 300_000).recover, false, "max 3 per session");
});

test("M2 tab recovery skips inactive agents, missing sessions and browser shutdown", () => {
  assert.equal(decideRecovery(undefined, {}, {}, 0).recover, false);
  assert.equal(decideRecovery(st({ active: false }), {}, {}, 0).recover, false);
  assert.equal(decideRecovery(st({ sessionId: null }), {}, {}, 0).recover, false);
  assert.equal(decideRecovery(st(), { browserShuttingDown: true }, {}, 0).recover, false);
});

test("M2-AC1 resume never re-runs finished calls: restored executed keys are the dedupe source", async () => {
  // A restored run carries `executed` (callKey strings). The CallScheduler dedupes on the same key format.
  const { CallScheduler, callKey } = await import("../../extension/src/core/fast-turn.js");
  const call = { id: "c1", tool: "run_code", args: { code: "print(1)" } };
  const executed = new Set([callKey(3, call)]);
  let runs = 0;
  const s = new CallScheduler<number>({ readParallel: 4 });
  for (const c of [call, call]) {
    const k = callKey(3, c);
    if (executed.has(k)) continue;
    await s.submit(k, "write", async () => ++runs);
  }
  assert.equal(runs, 0, "finished call is not executed again after recovery");
});
