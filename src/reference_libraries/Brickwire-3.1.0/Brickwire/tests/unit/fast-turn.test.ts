import { test } from "node:test";
import assert from "node:assert/strict";
import { CallScheduler, InstructionPlan, ReplyEndDetector, StepTimer, callKey } from "../../extension/src/core/fast-turn.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("M1-AC1 end detector: Stop disappears -> done after 250 ms quiet (well under 500 ms)", () => {
  const d = new ReplyEndDetector({ fastEndMs: 250, settleMs: 1500 });
  d.reset(0);
  d.sample(100, true, true);
  d.sample(2000, true, true);
  assert.equal(d.done(2000), null, "still generating");
  d.sample(2100, false, false); // Stop button gone
  assert.equal(d.done(2300), null, "confirm window not over");
  assert.equal(d.done(2350), "stop");
  // a late DOM change re-arms the short confirm only
  d.sample(2360, false, true);
  assert.equal(d.done(2500), null);
  assert.equal(d.done(2610), "stop");
});

test("M1-AC6 end detector: provider without Stop selector falls back to settleMs", () => {
  const d = new ReplyEndDetector({ fastEndMs: 250, settleMs: 1500 });
  d.reset(0);
  d.sample(100, null, true);
  d.sample(900, null, true);
  assert.equal(d.fastPath, false);
  assert.equal(d.done(1500), null);
  assert.equal(d.done(2400), "settle");
});

test("M1-AC3 scheduler: 3 reads run in parallel, 2 writes strictly in order", async () => {
  const s = new CallScheduler<string>({ readParallel: 4 });
  const log: string[] = [];
  let live = 0;
  let maxLive = 0;
  const job = (name: string, ms: number) => async () => {
    live++;
    maxLive = Math.max(maxLive, live);
    log.push("start:" + name);
    await sleep(ms);
    log.push("end:" + name);
    live--;
    return name;
  };
  const t0 = Date.now();
  const reads = ["r1", "r2", "r3"].map((n) => s.submit(n, "read", job(n, 60)));
  await Promise.all(reads);
  const readsMs = Date.now() - t0;
  assert.equal(maxLive, 3, "all three reads overlapped");
  assert.ok(readsMs < 150, `reads took ${readsMs} ms (parallel)`);
  maxLive = 0;
  const w = [s.submit("w1", "write", job("w1", 30)), s.submit("w2", "write", job("w2", 10))];
  assert.deepEqual(await Promise.all(w), ["w1", "w2"]);
  assert.equal(maxLive, 1, "writes never overlap");
  assert.ok(log.indexOf("end:w1") < log.indexOf("start:w2"));
});

test("M1 scheduler: read limit honoured and a read after a write waits for it", async () => {
  const s = new CallScheduler<number>({ readParallel: 2 });
  let live = 0;
  let maxLive = 0;
  const order: string[] = [];
  const job = (n: string) => async () => {
    live++;
    maxLive = Math.max(maxLive, live);
    order.push(n);
    await sleep(20);
    live--;
    return 1;
  };
  s.submit("w", "write", job("w"));
  for (const n of ["a", "b", "c", "d"]) s.submit(n, "read", job(n));
  await s.drain();
  assert.equal(order[0], "w", "reads waited for the earlier write");
  assert.ok(maxLive <= 2);
});

test("M1-AC4 scheduler: duplicate key never executes twice", async () => {
  const s = new CallScheduler<number>({ readParallel: 4 });
  let runs = 0;
  const call = { id: "c1", tool: "read_instance", args: { path: "Workspace", depth: 1 } };
  const same = { id: "c1", tool: "read_instance", args: { depth: 1, path: "Workspace" } }; // key order differs
  const p1 = s.submit(callKey(3, call), "read", async () => ++runs);
  const p2 = s.submit(callKey(3, same), "read", async () => ++runs);
  assert.equal(p1, p2);
  await s.drain();
  assert.equal(runs, 1);
  assert.notEqual(callKey(3, call), callKey(4, call), "same id in a later reply is a new call");
});

test("M1-AC5 instruction plan: full text once per session, again only on new chat / request", () => {
  const p = new InstructionPlan();
  assert.equal(p.needsFull("s1", "/c/1"), "session_start");
  p.markSent("s1", "/c/1");
  assert.equal(p.needsFull("s1", "/c/1"), null);
  assert.equal(p.needsFull("s1", "/c/2"), "new_chat");
  p.force("user_request");
  assert.equal(p.needsFull("s1", "/c/1"), "user_request");
  p.markSent("s1", "/c/1");
  assert.equal(p.needsFull("s1", "/c/1"), null);
});

test("M1-AC7 step timer: summary lists every step", async () => {
  let t = 0;
  const st = new StepTimer(() => t);
  st.add("model", 4200);
  await st.time("parse", () => {
    t += 3;
  });
  st.add("read_instance", 320);
  st.add("send", 410);
  assert.equal(st.summary(), "model 4.2 s · parse 3 ms · read_instance 320 ms · send 410 ms");
});
