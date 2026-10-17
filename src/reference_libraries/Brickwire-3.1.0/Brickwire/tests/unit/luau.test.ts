import { test } from "node:test";
import assert from "node:assert/strict";
import { toLuau, luauString, pathSegments, joinPath, wrapLuau, extractLuauPayload } from "../../bridge/src/luau.js";
import { COMPOSITE_TOOLS } from "../../bridge/src/composites.js";

test("Luau literals escape everything (no code injection)", () => {
  assert.equal(luauString('a"b\\c\n]]--'), '"a\\"b\\\\c\\n]]--"');
  assert.equal(luauString("\u0001"), '"\\001"');
  assert.equal(toLuau({ a: [1, true, null], "x y": "z" }), '{["a"] = {1, true, nil}, ["x y"] = "z"}');
  assert.throws(() => toLuau(NaN));
});

test("path parsing", () => {
  assert.deepEqual(pathSegments("game.Workspace.Model.Part"), ["game", "Workspace", "Model", "Part"]);
  assert.deepEqual(pathSegments("Workspace.Part"), ["game", "Workspace", "Part"]);
  assert.deepEqual(pathSegments('game.Workspace["My.Part"]'), ["game", "Workspace", "My.Part"]);
  assert.deepEqual(pathSegments('game:GetService("ReplicatedStorage").Remotes'), ["game", "ReplicatedStorage", "Remotes"]);
  assert.equal(joinPath(["game", "Workspace", "My Part"]), 'game.Workspace["My Part"]');
  assert.throws(() => pathSegments(""));
});

test("payload extraction (plain and double-encoded)", () => {
  assert.deepEqual(extractLuauPayload('noise BWJSON<<{"ok":true,"result":{"a":1}}>>BWJSON'), { found: true, ok: true, result: { a: 1 }, error: undefined });
  const dbl = JSON.stringify('BWJSON<<{"ok":false,"error":"x"}>>BWJSON');
  assert.equal(extractLuauPayload(dbl).error, "x");
  assert.equal(extractLuauPayload("nil").found, false);
});

test("generated Luau embeds args only as a literal", () => {
  const code = wrapLuau({ name: 'evil"); game:Destroy() --' }, "\treturn ARGS.name");
  assert.ok(code.includes('local ARGS = {["name"] = "evil\\"); game:Destroy() --"}'));
});

test("composite registry is complete and each declares requirements", () => {
  const names = COMPOSITE_TOOLS.map((t) => t.name);
  for (const n of ["get_game_tree", "get_project_info", "create_instance", "create_part", "create_ui", "create_vfx", "create_model", "modify_instance", "delete_instance", "clone_instance", "create_script", "set_script_source", "delete_script", "take_snapshot", "restore_snapshot", "get_errors"])
    assert.ok(names.includes(n), n);
  for (const t of COMPOSITE_TOOLS) assert.ok(t.requires.length > 0, t.name);
  assert.equal(COMPOSITE_TOOLS.find((t) => t.name === "delete_instance")!.risk, "destructive");
});
