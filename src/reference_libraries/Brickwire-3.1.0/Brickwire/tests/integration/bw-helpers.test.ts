import { minifyLuau } from "../../shared/src/library/pack.js";
/**
 * The BW helper library is real Luau: run it in the Luau VM against the Roblox stub with one scenario
 * per agent category (build, scripting, ui, vfx, gameplay, debug). Skipped if the luau CLI is missing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BW_HELPERS_LUAU } from "../../shared/src/bw-helpers.generated.js";
import { BW_PRELUDE_LINES, remapLuauLines, usesHelpers, withHelpers } from "../../shared/src/bw-luau.js";

const here = dirname(fileURLToPath(import.meta.url));
const LUAU = process.env.LUAU_BIN ?? "/data/tools/luau/luau";
const skip = !existsSync(LUAU) ? `luau binary not found at ${LUAU}` : false;
const STUB = readFileSync(join(here, "../luau/roblox-stub.luau"), "utf8") + "\n" + readFileSync(join(here, "../luau/runtime-stub.luau"), "utf8");
// after each scenario: execute once every script the helpers generated (BW_*) to catch runtime mistakes
const RUN_GENERATED = readFileSync(join(here, "../luau/run-generated.luau"), "utf8");
const dir = mkdtempSync(join(tmpdir(), "bw-helpers-"));

function run(code: string): { ok: boolean; out: string } {
  const file = join(dir, `s${Math.random().toString(36).slice(2)}.luau`);
  writeFileSync(file, STUB + "\n" + withHelpers(code + "\n" + RUN_GENERATED));
  try {
    return { ok: true, out: execFileSync(LUAU, [file], { stdio: "pipe" }).toString() };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("generated TS copy of the helper library is in sync with bw-helpers.luau", () => {
  assert.equal(BW_HELPERS_LUAU.trim(), minifyLuau(readFileSync(join(here, "../../shared/src/bw-helpers.luau"), "utf8").replace(/\r/g, "")).trim());
});

for (const cat of ["build", "build2", "build3", "library", "scripting", "ui", "vfx", "animation", "gameplay", "debug", "cutscene"]) {
  test(`BW helpers: ${cat} scenario runs clean in the Luau VM`, { skip }, () => {
    const r = run(readFileSync(join(here, "../luau/scenarios", cat + ".luau"), "utf8"));
    assert.ok(r.ok, r.out);
    assert.doesNotMatch(r.out, /BW_CHECK FAIL|check failed/i, r.out);
  });
}

test("animation helpers: every generated script (motion, door, NPC, patrol, player anims, tool) runs", { skip }, () => {
  const r = run(readFileSync(join(here, "../luau/scenarios/animation.luau"), "utf8"));
  assert.ok(r.ok, r.out);
  const ran = r.out.split("\n").filter((l) => l.startsWith("BW_RUN OK"));
  assert.equal(ran.length, 12, r.out);
  for (const n of ["BW_Anim_spin", "BW_Door", "BW_PlayAnim", "BW_Patrol", "BW_PlayerAnimations", "BW_ToolAnim"]) assert.ok(ran.some((l) => l.endsWith(n)), n);
  // keyframe animation previewed via KeyframeSequenceProvider; R6 NPC gets R6 walk/idle ids
  assert.match(r.out, /BW_PLAYED .*rbxassetid:\/\/9990001/);
  assert.match(r.out, /rbxassetid:\/\/180426354/);
});

test("BW helper errors are readable and point at the AI's own line", { skip }, () => {
  const r = run('print("a")\nBW.get("Workspace.DoesNotExist")');
  assert.equal(r.ok, false);
  assert.match(r.out, /BW: /);
  assert.match(r.out, /DoesNotExist/);
});

test("helper detection + line remapping", () => {
  assert.ok(usesHelpers("BW.part{Name='x'}"));
  assert.ok(usesHelpers("local m = BW.model('x')"));
  assert.ok(!usesHelpers("local BWx = 1 print(ABW)"));
  const n = BW_PRELUDE_LINES;
  assert.equal(remapLuauLines(`[string "x"]:${n + 3}: boom`), `[string "x"]:3: boom`);
  assert.equal(remapLuauLines(`Workspace.Script:12: hi`, 0), `Workspace.Script:12: hi`);
});
