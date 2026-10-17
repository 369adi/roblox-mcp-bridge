/**
 * M1 AC1/AC2/AC6 — AgentCore with a fake DOM/provider: no browser, real agent-core logic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const g = globalThis as any;
g.document ??= { hidden: false, body: {}, evaluate() { throw new Error("no xpath in fake DOM"); } };
g.XPathResult ??= { ORDERED_NODE_SNAPSHOT_TYPE: 7 };
g.location ??= { pathname: "/c/fake", hostname: "fake.test" };
g.HTMLTextAreaElement ??= class {};
g.HTMLInputElement ??= class {};

const { AgentCore } = await import("../../extension/src/core/agent-core.js");
const { DEFAULT_SETTINGS } = await import("../../extension/src/core/settings.js");

type Call = { id: string; tool: string; args: Record<string, unknown> };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness(opts: { hasStop: boolean }) {
  const page = { count: 1, text: "", stop: false, calls: [] as Call[] };
  const sent: Array<{ at: number; text: string }> = [];
  const started: Array<{ at: number; id: string }> = [];
  const activity: string[] = [];
  const adapter: any = {
    info: { id: "fake", name: "Fake", hosts: ["fake.test"], maxMessageChars: 20000 },
    getComposer: () => null,
    readAssistantResponse: () => ({ count: page.count, text: page.text }),
    isGenerating: () => page.stop,
    extractToolCalls: () => ({ calls: page.calls.slice(), invalidCalls: [], statuses: [], errors: [], done: null, forgedResults: 0, hasIncomplete: false, blocks: [] }),
    sendMessage: async (text: string) => {
      sent.push({ at: Date.now(), text });
      return true;
    },
  };
  if (opts.hasStop) adapter.stopSignal = () => page.stop;
  const bridge: any = {
    callTool: async (call: Call) => {
      started.push({ at: Date.now(), id: call.id });
      await sleep(20);
      return { id: call.id, status: "success", result: { ok: true } };
    },
    updateSession: async () => ({}),
  };
  const ui: any = new Proxy({}, { get: (_t, k) => (k === "activity" ? (_k: string, text: string) => activity.push(text) : () => undefined) });
  const core: any = new AgentCore(adapter, bridge, ui, { ...DEFAULT_SETTINGS }, () => undefined);
  core.active = true;
  core.sessionId = "s-test";
  core.tools = new Map();
  core.prefs = { category: "general", mode: "auto" };
  core.lastHandledCount = 0;
  core.sentAt = Date.now(); // as if our previous message was just sent
  core.endDet.reset(core.sentAt);
  let stopped = false;
  const loop = (async () => {
    while (!stopped) {
      await core.tickLoop();
      await sleep(25);
    }
  })();
  return { page, sent, started, activity, core, stop: async () => { stopped = true; core.active = false; await loop; } };
}

const block = (id: string) => `<ROBLOX_TOOL_CALL>{"id":"${id}","tool":"read_instance","args":{"path":"Workspace"}}</ROBLOX_TOOL_CALL>`;

test("M1-AC1+AC2 fake DOM: closed block runs while streaming; results sent < 500 ms after Stop disappears; no duplicate", async () => {
  const h = harness({ hasStop: true });
  try {
    h.page.stop = true;
    h.page.text = "Let me look.\n" + block("c1");
    h.page.calls = [{ id: "c1", tool: "read_instance", args: { path: "Workspace" } }];
    await sleep(200);
    assert.equal(h.started.length, 1, "closed block executed before the reply ended (AC2)");
    assert.equal(h.sent.length, 0, "results wait for the end of the reply");
    h.page.text += "\nStill writing…";
    await sleep(150);
    const stopGone = Date.now();
    h.page.stop = false; // Stop button disappears
    for (let i = 0; i < 40 && !h.sent.length; i++) await sleep(20);
    assert.equal(h.sent.length, 1, "results sent");
    const dt = h.sent[0]!.at - stopGone;
    assert.ok(dt < 500, `results sent ${dt} ms after Stop disappeared (AC1 < 500 ms)`);
    assert.match(h.sent[0]!.text, /ROBLOX_TOOL_RESULT/);
    await sleep(300);
    assert.equal(h.started.length, 1, "never executed twice (AC4)");
    assert.ok(h.activity.some((a) => a.startsWith("⏱ ") && a.includes("wait for model") && a.includes("send results")), "timing row in the panel (AC7)");
  } finally {
    await h.stop();
  }
});

test("M1-AC6 fake DOM: provider without Stop selector still finishes via settleMs fallback", async () => {
  const h = harness({ hasStop: false });
  try {
    h.page.text = block("c1");
    h.page.calls = [{ id: "c1", tool: "read_instance", args: { path: "Workspace" } }];
    await sleep(600);
    assert.equal(h.sent.length, 0, "not before the settle window");
    for (let i = 0; i < 100 && !h.sent.length; i++) await sleep(25);
    assert.equal(h.sent.length, 1, "fallback delivered results");
    assert.equal(h.started.length, 1);
  } finally {
    await h.stop();
  }
});
