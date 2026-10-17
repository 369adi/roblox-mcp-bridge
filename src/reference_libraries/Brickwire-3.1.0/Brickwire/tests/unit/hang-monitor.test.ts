import { test } from "node:test";
import assert from "node:assert/strict";
import { HangMonitor, wrongModeTarget, looksLikeQuestion } from "../../shared/src/hang-monitor.js";

test("M3-1 model never finishes → press Stop + continue, once per reply", () => {
  const m = new HangMonitor({ stuckGenerationMs: 1000 });
  assert.equal(m.generation({ now: 900, stopVisible: true, lastGrowthAt: 0, replyIndex: 1 }), null);
  const ev = m.generation({ now: 1500, stopVisible: true, lastGrowthAt: 0, replyIndex: 1 });
  assert.equal(ev?.recovery.kind, "press_stop_and_continue");
  assert.equal(m.generation({ now: 5000, stopVisible: true, lastGrowthAt: 0, replyIndex: 1 }), null, "no repeat");
  assert.ok(m.log.length === 1);
});

test("M3-2 reply ended mid-block → ask to resend only that block", () => {
  const m = new HangMonitor();
  const ev = m.replyEnded({ replyIndex: 4, hasIncomplete: true, incompleteTag: "ROBLOX_LUAU" });
  assert.equal(ev?.recovery.kind, "ask_resend_block");
  assert.match((ev!.recovery as { message: string }).message, /ONLY that block/);
  assert.equal(m.replyEnded({ replyIndex: 5, hasIncomplete: false }), null);
});

test("M3-3 message not delivered → retry, refocus, then notify", () => {
  const m = new HangMonitor({ deliveryMs: 100, maxSendRetries: 2 });
  assert.equal(m.delivery({ now: 50, sentAt: 0, delivered: false, composerHoldsText: true }), null);
  const r1 = m.delivery({ now: 200, sentAt: 0, delivered: false, composerHoldsText: true });
  assert.deepEqual(r1?.recovery, { kind: "retry_send", attempt: 1, refocus: true });
  const r2 = m.delivery({ now: 400, sentAt: 0, delivered: false, composerHoldsText: false });
  assert.equal(r2?.recovery.kind, "retry_send");
  const r3 = m.delivery({ now: 600, sentAt: 0, delivered: false, composerHoldsText: false });
  assert.equal(r3?.recovery.kind, "notify_user");
});

test("M3-4 Studio not responding → ping, fail call, tell model", () => {
  const m = new HangMonitor({ callTimeoutMs: 1000 });
  assert.equal(m.callPending({ now: 500, callId: "x", tool: "run_code", startedAt: 0 }), null);
  const ev = m.callPending({ now: 1200, callId: "x", tool: "run_code", startedAt: 0 });
  assert.equal(ev?.recovery.kind, "fail_call");
  assert.equal((ev!.recovery as { pingStudio: boolean }).pingStudio, true);
});

test("M3-5 Studio in wrong mode → read state, retry with the right datamodel", () => {
  const m = new HangMonitor();
  assert.equal(wrongModeTarget("Edit datamodel is not available in Play mode"), "server");
  const ev = m.callError({ callId: "c", tool: "run_code", error: "Edit datamodel is not available in Play mode" });
  assert.deepEqual(ev?.recovery, { kind: "read_state_and_retry", callId: "c", datamodel: "server" });
  assert.equal(m.callError({ callId: "c", tool: "run_code", error: "Edit datamodel is not available in Play mode", retried: true }), null, "only one retry");
  assert.equal(m.callError({ callId: "d", tool: "run_code", error: "attempt to index nil" }), null);
});

test("M3-6 bridge offline → reconnect with exponential backoff + banner", () => {
  const m = new HangMonitor({ backoffBaseMs: 1000, backoffMaxMs: 5000 });
  const delays = [1, 2, 3, 4].map(() => (m.bridgeHealth(false)!.recovery as { delayMs: number }).delayMs);
  assert.deepEqual(delays, [1000, 2000, 4000, 5000]);
  assert.equal(m.bridgeHealth(true), null);
  assert.equal((m.bridgeHealth(false)!.recovery as { delayMs: number }).delayMs, 1000, "backoff resets");
});

test("M3-7 same call hash 3× → stop loop", () => {
  const m = new HangMonitor();
  assert.equal(m.callIssued("h", "read_instance"), null);
  assert.equal(m.callIssued("h", "read_instance"), null);
  assert.equal(m.callIssued("h", "read_instance")?.recovery.kind, "stop_loop");
  assert.equal(m.callIssued("g", "read_instance"), null);
});

test("M3-8 model waits for user → notify, no auto-continue", () => {
  const m = new HangMonitor();
  assert.equal(m.waitingForUser({ replyIndex: 2, ask: true, question: false, hasCalls: false })?.recovery.kind, "notify_user");
  assert.equal(m.waitingForUser({ replyIndex: 3, ask: false, question: true, hasCalls: true }), null);
  assert.ok(looksLikeQuestion("Which colour do you want for the walls?"));
  assert.ok(!looksLikeQuestion("Done."));
});
