import test from "node:test";
import assert from "node:assert/strict";
import { THUMB_SCENE_LUAU, THUMB_SCENE_VERIFY_LUAU, THUMB_TEMPLATES, THUMB_POSES, normalizeSceneArgs, lintReadonlyCFrameWrites } from "../../shared/src/studio2/thumbnail-scene.js";
import { wrapLuau } from "../../bridge/src/luau.js";

test("M4: generated scene Luau never writes CFrame components (C0 fix)", () => {
  assert.deepEqual(lintReadonlyCFrameWrites(THUMB_SCENE_LUAU), []);
  assert.deepEqual(lintReadonlyCFrameWrites(THUMB_SCENE_VERIFY_LUAU), []);
  assert.match(THUMB_SCENE_LUAU, /j\.C0 = c0 j\.C1 = c1/);
});

test("M4: lint catches read-only CFrame component writes, ignores comments and comparisons", () => {
  assert.equal(lintReadonlyCFrameWrites("motor.C0.Position = Vector3.new(1,0,0)").length, 1);
  assert.equal(lintReadonlyCFrameWrites("j.C1.X = 3\npart.CFrame.Position = v").length, 2);
  assert.equal(lintReadonlyCFrameWrites("-- motor.C0.Position = x\nif m.C0.X == 1 then end\nm.C0 = CFrame.new(1,0,0)").length, 0);
});

test("M4: all templates, poses, ChangeHistory, owned-only replace, no asset ids", () => {
  for (const t of THUMB_TEMPLATES) assert.ok(THUMB_SCENE_LUAU.includes(`"${t}"`) || t === "item_showcase", t);
  for (const p of THUMB_POSES) assert.match(THUMB_SCENE_LUAU, new RegExp(`\\b${p} = \\{`), p);
  assert.match(THUMB_SCENE_LUAU, /SetWaypoint/);
  assert.match(THUMB_SCENE_LUAU, /was not made by Brickwire/);
  assert.match(THUMB_SCENE_LUAU, /FredokaOne/);
  assert.match(THUMB_SCENE_LUAU, /LuckiestGuy/);
  assert.match(THUMB_SCENE_LUAU, /UIStroke/);
  assert.doesNotMatch(THUMB_SCENE_LUAU, /rbxassetid|rbxasset:\/\/|\d{8,}/);
});

test("M4: args normalisation + wrapLuau output", () => {
  const a = normalizeSceneArgs({});
  assert.equal(a.template, "poor_vs_rich");
  assert.deepEqual(a.at, [0, 500, 0]);
  assert.deepEqual(a.labels, ["+1", "+999999"]);
  assert.throws(() => normalizeSceneArgs({ template: "nope" }), /unknown template/);
  const code = wrapLuau(normalizeSceneArgs({ template: "hero_peek", side: "right" }), THUMB_SCENE_LUAU);
  assert.match(code, /hero_peek/);
  assert.match(code, /local ARGS/);
});
