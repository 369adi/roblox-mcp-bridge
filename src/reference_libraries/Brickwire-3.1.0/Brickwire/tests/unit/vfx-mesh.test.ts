import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { MESH_VFX_PRESETS, meshVfxIds, vfxInstallLuau, VFX_RUNTIME_MODULE, VFX_BUDGET } from "../../shared/src/studio2/vfx-mesh.js";

const pack = JSON.parse(fs.readFileSync(new URL("../../packs/built/vfx.json", import.meta.url), "utf8"));
const items = new Map<string, { kind: string; meshes: number }>(pack.index.items.map((i: { id: string; kind: string; meshes: number }) => [i.id, i]));

test("M7: real pack mesh count (186 items, 176 mesh items)", () => {
  assert.equal(pack.index.items.length, 186);
  assert.equal(pack.index.items.filter((i: { kind: string }) => i.kind === "mesh").length, 176);
});

test("M7-AC2: 12 layered presets use only mesh ids from the vfx pack", () => {
  assert.equal(MESH_VFX_PRESETS.length, 12);
  for (const id of meshVfxIds()) {
    const it = items.get(id);
    assert.ok(it, `${id} missing from vfx pack`);
    assert.equal(it!.kind, "mesh", `${id} is not a mesh item`);
  }
  for (const p of MESH_VFX_PRESETS) {
    assert.ok(p.layers.length >= 2 && p.layers.length <= VFX_BUDGET.maxLayers, p.id);
    const life = Math.max(...p.layers.map((l) => (l.delay ?? 0) + l.t));
    assert.ok(life <= VFX_BUDGET.maxLifetime, `${p.id} lifetime ${life}`);
  }
});

test("M7: install Luau writes ids literally (bridge injection), runtime has play + marker binding", () => {
  const code = vfxInstallLuau(MESH_VFX_PRESETS.map((p) => p.id), { preset: "explosion", at: [0, 10, 0] });
  for (const id of meshVfxIds()) assert.ok(code.includes(`"${id}"`), id);
  assert.doesNotMatch(code, /rbxassetid/);
  assert.match(code, /BW_VfxPreview/);
  assert.match(code, /fxCheck/);
  assert.match(VFX_RUNTIME_MODULE, /function VFX\.play/);
  assert.match(VFX_RUNTIME_MODULE, /GetMarkerReachedSignal\("vfx"\)/);
  assert.match(VFX_RUNTIME_MODULE, /maxLive/);
});
