import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceArgs, resolveToolName, validateArgs } from "../../shared/src/validation.js";

const TOOLS = ["execute_luau", "search_game_tree", "inspect_instance", "screen_capture", "get_studio_state"];
test("tool names: exact, namespaced, case, synonyms; unknown stays null", () => {
  assert.equal(resolveToolName("execute_luau", TOOLS), "execute_luau");
  assert.equal(resolveToolName("functions.execute_luau", TOOLS), "execute_luau");
  assert.equal(resolveToolName("mcp__roblox__execute_luau", TOOLS), "execute_luau");
  assert.equal(resolveToolName("Execute-Luau", TOOLS), "execute_luau");
  assert.equal(resolveToolName("run_code", TOOLS), "execute_luau");
  assert.equal(resolveToolName("get_game_tree", TOOLS), "search_game_tree");
  assert.equal(resolveToolName("screenshot", TOOLS), "screen_capture");
  assert.equal(resolveToolName("get_console_output", TOOLS), null);
  assert.equal(resolveToolName("delete_everything", TOOLS), null);
});

test("args: synonyms, enum case, scalar coercion, JSON strings", () => {
  const schema = {
    type: "object",
    properties: {
      code: { type: "string" },
      datamodel_type: { type: "string", enum: ["Edit", "Server", "Client"] },
      depth: { type: "integer" },
      recursive: { type: "boolean" },
      paths: { type: "array", items: { type: "string" } },
      opts: { type: "object" },
    },
    required: ["code"],
    additionalProperties: false,
  } as never;
  const a: Record<string, unknown> = { script: "print(1)", mode: "server", depth: "3", recursive: "TRUE", paths: "game.Workspace", opts: '{"a":1}' };
  coerceArgs(schema, a);
  assert.deepEqual(a, { code: "print(1)", datamodel_type: "Server", depth: 3, recursive: true, paths: ["game.Workspace"], opts: { a: 1 } });
  assert.deepEqual(validateArgs(schema, a), []);
  const b: Record<string, unknown> = { code: "x", datamodel_type: "Play" };
  coerceArgs(schema, b);
  assert.equal(validateArgs(schema, b).length, 1, "unknown enum value still rejected");
});
