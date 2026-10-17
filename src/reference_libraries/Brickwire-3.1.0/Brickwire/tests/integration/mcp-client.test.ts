import { test } from "node:test";
import assert from "node:assert/strict";
import { McpStdioClient, normalizeMcpResult } from "../../bridge/src/mcp-client.js";
import { Logger } from "../../bridge/src/logger.js";
import { parseStudioList } from "../../bridge/src/studio-detect.js";
import { MOCK } from "./helpers.js";

const mk = (env: Record<string, string> = {}, autoReconnect = false) => {
  Object.assign(process.env, env);
  return new McpStdioClient({ command: process.execPath, args: [MOCK], logger: new Logger(null, "error", true), clientVersion: "test", autoReconnect });
};
const until = async (f: () => boolean, ms = 5000) => {
  for (let t = 0; t < ms && !f(); t += 25) await new Promise((r) => setTimeout(r, 25));
};

test("MCP stdio: initialize, tools/list, tools/call, survives non-JSON noise and server ping", async () => {
  const c = mk();
  await c.start();
  assert.equal(c.state, "ready");
  assert.equal(c.serverInfo.name, "MockStudioMCP");
  assert.ok(c.tools.some((t) => t.name === "execute_luau"));
  const r = normalizeMcpResult(await c.callTool("list_roblox_studios", {}, 5000));
  assert.deepEqual(parseStudioList(r.text, r.json), [{ id: "studio-1", name: "TestPlace", placeId: null }]);
  await c.stop();
  assert.equal(c.state, "stopped");
});

test("MCP stdio: timeout rejects with code=timeout", async () => {
  const c = mk({ MOCK_SLOW: "get_console_output:1500" });
  await c.start();
  await assert.rejects(c.callTool("get_console_output", { studio_id: "studio-1" }, 300), (e: any) => e.code === "timeout");
  await c.stop();
  delete process.env.MOCK_SLOW;
});

test("MCP stdio: disconnect is detected and the client reconnects", async () => {
  const c = mk({ MOCK_EXIT_AFTER: "1" }, true);
  await c.start();
  await assert.rejects(c.callTool("list_roblox_studios", {}, 3000), (e: any) => e.code === "disconnected");
  delete process.env.MOCK_EXIT_AFTER;
  await until(() => c.state === "ready", 6000);
  assert.equal(c.state, "ready", "reconnected");
  await c.stop();
});

test("MCP: missing command → disabled; bad command → error", async () => {
  const d = new McpStdioClient({ command: null, args: [], logger: new Logger(null, "error", true), clientVersion: "t" });
  await d.start();
  assert.equal(d.state, "disabled");
  const b = new McpStdioClient({ command: "/nonexistent/StudioMCP", args: [], logger: new Logger(null, "error", true), clientVersion: "t", autoReconnect: false });
  await b.start();
  await until(() => b.state === "error", 3000);
  assert.equal(b.state, "error");
  assert.ok(b.lastError);
  await b.stop();
});

test("studio list parser tolerates several shapes", () => {
  assert.equal(parseStudioList("", { studios: [{ studioId: "x", placeName: "A", placeId: 5 }] })[0].id, "x");
  assert.equal(parseStudioList("name: Foo, studio_id: abc-1, place_id: 77", null)[0].placeId, "77");
});
