import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readCompletionStream } from "../../bridge/src/stream-reader.js";
import { HeadlessRunner } from "../../bridge/src/headless.js";
import {
  animationDraft,
  validateAnimation,
  ANIMATION_WORKSPACE_TOOLS,
} from "../../bridge/src/animation-workspace.js";
import { WorkspaceStore } from "../../bridge/src/workspace-store.js";
import { TaskRuntime } from "../../bridge/src/task-runtime.js";
import { withBridge } from "../../tests/integration/helpers.js";
const event = (text: string) =>
  "data: " + JSON.stringify({ choices: [{ delta: { content: text } }] }) + "\r\n\r\n";
function bytes(s: string, step = 1) {
  const a = new TextEncoder().encode(s);
  return new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < a.length; i += step) c.enqueue(a.slice(i, i + step));
      c.close();
    },
  });
}
test("SSE: byte-split UTF-8/CRLF/comments and DONE preserve genuine deltas", async () => {
  const got: string[] = [];
  const text = await readCompletionStream(
    bytes(": comment\n\n" + event("Привет ") + event("3D") + "data: [DONE]\n\n"),
    (s) => got.push(s),
  );
  assert.equal(text, "Привет 3D");
  assert.deepEqual(got, ["Привет ", "3D"]);
});
test("SSE: interrupted output cannot become executable complete answer", async () => {
  await assert.rejects(
    readCompletionStream(bytes(event('<ROBLOX_TOOL_CALL>{"id":"x"}')), () => {}),
    /interrupted/,
  );
});
test("SSE: malformed events and provider errors fail closed", async () => {
  await assert.rejects(
    readCompletionStream(bytes("data: broken\n\n"), () => {}),
    /Malformed/,
  );
  await assert.rejects(
    readCompletionStream(bytes('data: {"error":{"message":"bad"}}\n\n'), () => {}),
    /failed/,
  );
});
test("SSE: bounded event/answer and abort stop reads", async () => {
  await assert.rejects(
    readCompletionStream(bytes("data: " + "x".repeat(262145), 270000), () => {}),
    /limit/,
  );
  await assert.rejects(
    readCompletionStream(bytes(event("x".repeat(200001)) + "data: [DONE]\n\n", 220000), () => {}),
    /200 KB/,
  );
  const a = new AbortController();
  a.abort();
  await assert.rejects(
    readCompletionStream(bytes(""), () => {}, a.signal),
    /aborted/,
  );
});
test("Headless: real SSE updates partial status, then executes only completed call, no fake acceptance", async () => {
  let requests = 0,
    calls = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      assert.equal(JSON.parse(body).stream, true);
      requests++;
      res.writeHead(200, { "content-type": "text/event-stream" });
      const reply =
        requests === 1
          ? '<ROBLOX_TOOL_CALL>{"id":"read","tool":"get_studio_state","args":{}}</ROBLOX_TOOL_CALL>'
          : '<ROBLOX_AGENT_DONE>{"summary":"reported only"}</ROBLOX_AGENT_DONE>';
      res.write(event(reply.slice(0, 35)));
      setTimeout(() => {
        res.end(event(reply.slice(35)) + "data: [DONE]\n\n");
      }, 150);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  try {
    const runner = new HeadlessRunner({
      bridge: {
        listTools: () => [
          { name: "get_studio_state", risk: "read", description: "read", inputSchema: {} } as any,
        ],
        execute: async (call: any) => {
          calls++;
          return { id: call.id, status: "success", result: {}, error: null };
        },
        reportClaim: () => ({ state: "PARTIAL", reason: "No independent criteria" }),
      },
    });
    const promise = runner.run("inspect", {
      BRICKWIRE_LLM_PROVIDER: "ollama",
      BRICKWIRE_LLM_URL: "http://127.0.0.1:" + (server.address() as any).port + "/v1",
      BRICKWIRE_LLM_MODEL: "fixture",
    });
    await new Promise((r) => setTimeout(r, 85));
    assert.equal(runner.status().streaming, true);
    assert.ok(runner.status().partialReply);
    assert.equal(calls, 0);
    const out = await promise;
    assert.equal(calls, 1);
    assert.equal(out.state, "partial");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
test("Headless: a broken stream is not retried and no partial tool executes", async () => {
  let calls = 0,
    requests = 0;
  const r = new HeadlessRunner({
    bridge: {
      listTools: () => [],
      execute: async () => {
        calls++;
        throw Error("must not run");
      },
    },
    fetch: async () => {
      requests++;
      return {
        ok: true,
        status: 200,
        headers: { get: () => "text/event-stream" },
        body: bytes(
          event('<ROBLOX_TOOL_CALL>{"id":"w","tool":"create_part","args":{}}</ROBLOX_TOOL_CALL>'),
        ),
        text: async () => "",
      };
    },
  });
  const out = await r.run("x", {
    BRICKWIRE_LLM_PROVIDER: "ollama",
    BRICKWIRE_LLM_MODEL: "fixture",
  });
  assert.equal(out.state, "error");
  assert.equal(calls, 0);
  assert.equal(requests, 1);
});
test("Animation draft reuses original generator and preserves temporal motion", () => {
  const a = animationDraft({ preset: "walk", rig: "R15", name: "WalkStudy" });
  assert.ok(a.ir.keyframes.length > 2);
  assert.ok(new Set(a.ir.keyframes.map((k) => JSON.stringify(k.rot))).size > 1);
  assert.equal(a.studioVerified, false);
  assert.ok(a.joints.includes("armR"));
});
test("Animation validation rejects duplicate/out-of-bounds frame timing, vectors, names and unknown joints", () => {
  const a = animationDraft({}).ir;
  for (const patch of [
    { name: "../bad" },
    { length: 121 },
    {
      keyframes: [
        { t: 0, rot: {} },
        { t: 0, rot: {} },
      ],
    },
    { keyframes: [{ t: 1e9, rot: {} }] },
    { keyframes: [{ t: 0, rot: { armR: [Infinity, 0, 0] } }] },
    { keyframes: [{ t: 0, rot: { invented: [0, 0, 0] } }] },
  ])
    assert.throws(() => validateAnimation({ ...a, ...patch }));
});
test("Animation validation canonicalizes order/markers without silent permission grant", () => {
  const a = animationDraft({}).ir;
  const out = validateAnimation({
    ...a,
    loop: true,
    keyframes: [
      { t: 1, rot: { armR: [30, 0, 0] } },
      { t: 0, rot: { armR: [-30, 0, 0] } },
    ],
    length: 2,
    events: [{ t: 0.5, name: "Hit", value: "v" }],
  });
  assert.equal(out.keyframes[0].t, 0);
  assert.equal(out.events[0].name, "Hit");
  assert.equal(out.loop, true);
  assert.throws(() => validateAnimation({ ...out, events: [{ t: 3, name: "late" }] }));
});
test("Animation owned builder guards collisions, markers and backups, never auto-play or publish", async () => {
  const tool = ANIMATION_WORKSPACE_TOOLS.find((t) => t.name === "animation_timeline_build")!;
  assert.equal(tool.risk, "write");
  let code = "";
  const out = await tool.run({ ir: animationDraft({}).ir, replace: false }, {
    runLuau: async (c: string) => {
      code = c;
      return { fixture: true };
    },
  } as any);
  assert.deepEqual(out, { fixture: true });
  for (const text of [
    "Foreign animation folder collision",
    "Sequence collision",
    "old:Clone()",
    "BrickwireTimelineOwner",
    "KeyframeMarker",
    "visualVerified=false",
    "published=false",
  ])
    assert.ok(code.includes(text), text);
  assert.equal(code.includes("track:Play()"), false);
});
test("Animation workspace persists edited IR and blocks stale revisions", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-depth-"));
  try {
    const store = new WorkspaceStore(dir),
      saved = store.save(
        { kind: "animation", name: "Motion", data: { ir: animationDraft({}).ir } },
        null,
      );
    const next = store.save(
      { ...saved, data: { ir: animationDraft({ preset: "walk" }).ir } },
      null,
    );
    assert.equal(next.revision, 2);
    assert.throws(() => store.save(saved, null), /revision/i);
    assert.equal(new WorkspaceStore(dir).get(saved.id).kind, "animation");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("Live watch is a fresh real graph read with stable record, rejects changed binding and unauthorized calls", async () => {
  await withBridge(
    { mcpArgs: [path.resolve("app/tests/workspace-studio-fixture.mjs")] },
    {},
    async ({ bridge: b, url: base, api }) => {
      const { token } = await api("/api/app-mcp/access", {
        headers: { referer: base + "/app", "sec-fetch-site": "same-origin" },
      });
      await b.pollStudios();
      const binding = b.currentBinding();
      const post = (body: any, auth = true) =>
        fetch(base + "/api/workspace/graph/refresh", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(auth ? { "X-Brickwire-App": token } : {}),
          },
          body: JSON.stringify(body),
        });
      assert.equal((await post({ confirm: true, binding }, false)).status, 403);
      assert.equal((await post({ confirm: false, binding })).status, 409);
      assert.equal(
        (await post({ confirm: true, binding: { ...binding, name: "Wrong" } })).status,
        409,
      );
      const a = await post({ confirm: true, binding, root: "game" });
      assert.equal(a.status, 200, await a.clone().text());
      const graphs = b.workspace.list("graph");
      assert.equal(graphs.length, 1);
      const c = await post({ confirm: true, binding, root: "game" });
      assert.equal(c.status, 200);
      assert.equal(b.workspace.list("graph").length, 1);
      assert.equal(b.workspace.list("graph")[0].revision, graphs[0].revision + 1);
      assert.equal(b.workspace.list("graph")[0].data.continuous, false);
    },
  );
});
test("Actual sequence read is bounded, read-only, validated and not a playback claim", async () => {
  const tool = ANIMATION_WORKSPACE_TOOLS.find((t) => t.name === "animation_timeline_read")!;
  assert.equal(tool.risk, "read");
  let readonly = false;
  const out: any = await tool.run({ path: "game.ServerStorage.Anim" }, {
    runLuau: async (_c: string, opts: any) => {
      readonly = opts.readOnly;
      assert.match(_c, /Sequence too large/);
      return {
        ir: JSON.stringify(animationDraft({ preset: "walk" }).ir),
        path: "game.ServerStorage.Anim",
      };
    },
  } as any);
  assert.equal(readonly, true);
  assert.equal(out.path, "game.ServerStorage.Anim");
  assert.equal(out.studioVerified, false);
});

test("an unverified PARTIAL task does not lock the Studio session; RUNNING and PAUSED still do", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-session-lock-"));
  try {
    const binding: any = { studioId: "studio-1", name: "Lock", placeId: null, projectKey: "Lock" };
    const r = new TaskRuntime(dir);
    const first = r.create({ goal: "First", mode: "supervised", criteria: [] }, binding);
    r.control(first.id, "start", "s1");
    const second = r.create({ goal: "Second", mode: "supervised", criteria: [] }, binding);
    assert.throws(() => r.control(second.id, "start", "s1"), /занята/);
    r.control(first.id, "pause", "s1");
    assert.throws(() => r.control(second.id, "start", "s1"), /занята/);
    r.control(first.id, "resume", "s1");
    assert.equal(r.claim(first.id, "model says done").state, "PARTIAL");
    assert.equal(r.control(second.id, "start", "s1").state, "RUNNING");
    assert.equal(r.get(first.id).state, "PARTIAL");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("English localization covers every Russian UI literal in app-owned sources and keeps RU switchable", () => {
  const src = path.join(import.meta.dirname, "..", "..", "bridge", "src");
  const i18n = fs.readFileSync(path.join(src, "i18n.js"), "utf8");
  const start = i18n.indexOf("const DICT = ") + "const DICT = ".length;
  const dict: Record<string, string> = JSON.parse(i18n.slice(start, i18n.indexOf(";\n  const CYR", start)));
  const missing: string[] = [];
  for (const file of fs.readdirSync(src).filter((f) => /\.(js|html|ts)$/.test(f) && f !== "i18n.js")) {
    const text = fs.readFileSync(path.join(src, file), "utf8");
    for (const seg of text.split(/[<>"`{}\n$]|\\n|(?<![А-Яа-яЁё])'|'(?![А-Яа-яЁё])/)) {
      const t = seg.trim();
      if (!/[А-Яа-яЁё]/.test(t) || t.startsWith(".split(")) continue;
      if (!(t in dict) && !(t.replace(/\\\\/g, "\\") in dict)) missing.push(file + ": " + t);
    }
  }
  assert.deepEqual(missing, []);
  for (const [ru, en] of Object.entries(dict)) assert.ok(!/[А-Яа-яЁё]/.test(en), "untranslated value for " + ru);
  assert.match(i18n, /localStorage\.setItem\(KEY, next\)/);
  for (const page of ["app.html", "paint.html", "ui-builder.html", "dashboard.html", "mcp.html"])
    assert.ok(fs.readFileSync(path.join(src, page), "utf8").includes('<script src="/i18n.js"></script>'), page);
});
