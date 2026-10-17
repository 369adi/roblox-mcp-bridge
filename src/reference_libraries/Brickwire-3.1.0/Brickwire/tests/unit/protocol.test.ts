import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAgentPrompt, formatToolResults, toolCatalog } from "../../shared/src/instructions.js";
import { parseAgentOutput } from "../../shared/src/parser.js";
import { validateArgs, closestNames } from "../../shared/src/validation.js";
import { providerForHost, PROVIDERS } from "../../shared/src/providers.js";
import type { ToolDescriptor } from "../../shared/src/protocol.js";

const tools: ToolDescriptor[] = [
  { name: "search_game_tree", description: "Explore", inputSchema: { type: "object", required: ["studio_id"], properties: { studio_id: { type: "string" }, path: { type: "string" } } }, source: "mcp", risk: "read", available: true },
  { name: "delete_instance", description: "Delete", inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } }, source: "composite", risk: "destructive", available: true },
  { name: "hidden", description: "x", inputSchema: {}, source: "mcp", risk: "read", available: false },
];

test("prompt lists only available tools, hides studio_id, includes task + memory", () => {
  const p = buildAgentPrompt({ providerName: "X", tools, memorySummary: "MenuCasov exists", task: "Make cases", sessionId: "s1" });
  assert.match(p, /search_game_tree\(path\?:string\)/);
  assert.match(p, /delete_instance\(path:string\) \[destructive\]/);
  assert.doesNotMatch(p, /hidden\(/);
  assert.doesNotMatch(toolCatalog(tools), /studio_id/);
  assert.match(p, /User task:\nMake cases/);
  assert.match(p, /MenuCasov exists/);
  // the example in the prompt itself is a valid call (the AI copies its shape)
  assert.equal(parseAgentOutput(p).calls.length, 1);
});

test("results message: strict format, truncation within budget", () => {
  const big = "x".repeat(50000);
  const msg = formatToolResults([{ id: "c1", status: "success", result: big, error: null }, { id: "c2", status: "error", result: null, error: "boom" }], 8000);
  assert.ok(msg.length < 8000, `len ${msg.length}`);
  assert.match(msg, /<ROBLOX_TOOL_RESULT>\n\{"id":"c1","status":"success"/);
  assert.match(msg, /truncated/);
  assert.match(msg, /Some calls failed/);
  // results never parse as calls
  assert.equal(parseAgentOutput(msg).calls.length, 0);
  assert.equal(parseAgentOutput(msg).forgedResults, 2);
});

test("argument validation", () => {
  const s = { type: "object", required: ["path"], properties: { path: { type: "string" }, depth: { type: "integer" }, mode: { type: "string", enum: ["a", "b"] } } };
  assert.deepEqual(validateArgs(s, { path: "game" }), []);
  assert.equal(validateArgs(s, {}).length, 1);
  assert.match(validateArgs(s, { path: 1 })[0], /expected string/);
  assert.match(validateArgs(s, { path: "x", depth: 1.5 })[0], /integer/);
  assert.match(validateArgs(s, { path: "x", mode: "c" })[0], /one of/);
  assert.deepEqual(closestNames("get_gametree", ["get_game_tree", "script_read", "inspect_instance"])[0], "get_game_tree");
});

test("provider registry: hosts resolve, Notion first-class (beta, on by default), new AIs registered", () => {
  assert.equal(providerForHost("chatgpt.com")?.id, "chatgpt");
  assert.equal(providerForHost("www.kimi.ai")?.id, "kimi");
  assert.equal(providerForHost("example.com"), undefined);
  const n = PROVIDERS.find((p) => p.id === "notion")!;
  assert.equal(n.status, "beta");
  assert.equal(n.enabledByDefault, true);
  assert.equal(providerForHost("www.notion.so")?.id, "notion");
  for (const id of ["grok", "mistral", "perplexity", "copilot", "poe"]) assert.ok(PROVIDERS.some((p) => p.id === id), id);
  assert.equal(providerForHost("grok.com")?.id, "grok");
  assert.equal(PROVIDERS.length, 14);
});

test("prompt: Notion mode only for Notion AI, dev log toggle, category-scoped BW API", () => {
  const base = { providerName: "Notion AI", tools, memorySummary: "", task: "Build a house", sessionId: "s9" };
  const n = buildAgentPrompt({ ...base, providerId: "notion", notionLog: true, category: "build" });
  assert.match(n, /NOTION MODE/);
  assert.match(n, /DEV LOG is ON/);
  assert.match(n, /BW\.room/);
  const off = buildAgentPrompt({ ...base, providerId: "notion", notionLog: false });
  assert.match(off, /DEV LOG is OFF/);
  const ds = buildAgentPrompt({ ...base, providerName: "DeepSeek", providerId: "deepseek", category: "build" });
  assert.doesNotMatch(ds, /NOTION MODE/);
});
