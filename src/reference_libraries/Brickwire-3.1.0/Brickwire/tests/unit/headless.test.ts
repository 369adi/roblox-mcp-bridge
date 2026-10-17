import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { HeadlessRunner, headlessConfigFromEnv, completionsUrl } from "../../bridge/src/headless.js";

function mockOpenAI(replies: string[]) {
  const requests: Array<{ auth?: string; body: any }> = [];
  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      requests.push({ auth: req.headers.authorization, body: JSON.parse(data) });
      if (req.url !== "/v1/chat/completions") {
        res.writeHead(404).end("no");
        return;
      }
      const content = replies[Math.min(requests.length - 1, replies.length - 1)];
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }));
    });
  });
  return new Promise<{ url: string; requests: typeof requests; close: () => void }>((r) =>
    server.listen(0, "127.0.0.1", () => r({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, requests, close: () => server.close() })),
  );
}

const fakeBridge = (log: string[]) => ({
  listTools: () => [{ name: "get_studio_state", description: "Studio state", inputSchema: { type: "object" }, risk: "read" } as any],
  execute: async (call: any) => {
    log.push(call.tool);
    return { id: call.id, status: "success" as const, result: { mode: "Edit", place: "Baseplate" }, error: null };
  },
});

test("M2-AC2 headless completes a scripted task against a mock OpenAI-compatible server", async () => {
  const srv = await mockOpenAI([
    'Checking Studio.\n<ROBLOX_TOOL_CALL>{"id":"c1","tool":"get_studio_state","args":{}}</ROBLOX_TOOL_CALL>',
    '<ROBLOX_AGENT_DONE>{"summary":"Studio is in Edit mode"}</ROBLOX_AGENT_DONE>',
  ]);
  try {
    const ran: string[] = [];
    const r = new HeadlessRunner({ bridge: fakeBridge(ran) });
    const st = await r.run("Tell me the Studio mode", { BRICKWIRE_LLM_PROVIDER: "custom", BRICKWIRE_LLM_URL: srv.url, BRICKWIRE_LLM_KEY: "sk-test", BRICKWIRE_LLM_MODEL: "m" });
    assert.equal(st.state, "done", JSON.stringify(st));
    assert.equal(st.summary, "Studio is in Edit mode");
    assert.deepEqual(ran, ["get_studio_state"], "tool ran exactly once");
    assert.equal(srv.requests.length, 2);
    assert.equal(srv.requests[0]!.auth, "Bearer sk-test");
    const turn2 = srv.requests[1]!.body.messages;
    assert.match(turn2[turn2.length - 1].content, /ROBLOX_TOOL_RESULT/);
    assert.equal(turn2.filter((m: any) => m.role === "system").length, 1, "instructions sent once (system message)");
  } finally {
    srv.close();
  }
});

test("M2-AC3 missing key → clear error, no crash", async () => {
  const r = new HeadlessRunner({ bridge: fakeBridge([]) });
  const st = await r.run("x", { BRICKWIRE_LLM_PROVIDER: "openai", BRICKWIRE_LLM_MODEL: "gpt-4o-mini" });
  assert.equal(st.state, "error");
  assert.match(st.error!, /BRICKWIRE_LLM_KEY is missing/);
  assert.equal(headlessConfigFromEnv({ BRICKWIRE_LLM_PROVIDER: "ollama", BRICKWIRE_LLM_MODEL: "llama3.1" }).ok, true, "Ollama needs no key");
  assert.equal(headlessConfigFromEnv({}).ok, false);
  assert.equal(completionsUrl("https://api.deepseek.com/v1/"), "https://api.deepseek.com/v1/chat/completions");
});

test("M2 headless: unreachable server and rejected key end in a clear error", async () => {
  const r = new HeadlessRunner({ bridge: fakeBridge([]), fetch: async () => ({ ok: false, status: 401, text: async () => "bad key" }) });
  const st = await r.run("x", { BRICKWIRE_LLM_PROVIDER: "openai", BRICKWIRE_LLM_KEY: "k", BRICKWIRE_LLM_MODEL: "m" });
  assert.equal(st.state, "error");
  assert.match(st.error!, /rejected the key/);
});

test("M2 headless: ROBLOX_AGENT_ASK stops and waits for the user", async () => {
  const srv = await mockOpenAI(["Which theme do you want?\n<ROBLOX_AGENT_ASK>"]);
  try {
    const r = new HeadlessRunner({ bridge: fakeBridge([]) });
    const st = await r.run("build a lobby", { BRICKWIRE_LLM_PROVIDER: "custom", BRICKWIRE_LLM_URL: srv.url, BRICKWIRE_LLM_KEY: "k", BRICKWIRE_LLM_MODEL: "m" });
    assert.equal(st.state, "waiting_user");
    assert.equal(srv.requests.length, 1);
  } finally {
    srv.close();
  }
});
