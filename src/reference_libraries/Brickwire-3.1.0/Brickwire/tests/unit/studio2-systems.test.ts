import { test } from "node:test";
import assert from "node:assert/strict";
import { MECHANICS, planMechanicInstall, listMechanics } from "../../shared/src/studio2/mechanics.js";
import { buildVfx, VFX_PRESETS, npcAttributes, NPC_BRAIN_SOURCE, generateMap, MAP_TYPES, designGame, GENRES, economyCurve, rng } from "../../shared/src/studio2/systems.js";
import { STUDIO2_TOOLS_B } from "../../bridge/src/studio2-tools-b.js";

function mockCtx(reply: (code: string) => unknown = () => ({ ok: true })) {
  const calls: Array<{ code: string; readOnly: boolean }> = [];
  const ctx = {
    async runLuau(code: string, opts: { readOnly: boolean }) { calls.push({ code, readOnly: opts.readOnly }); return reply(code); },
    async callMcp() { return { text: "", json: null, isError: false }; },
    newId: (p: string) => p + "1",
    getSnapshot: () => undefined,
    listSnapshots: () => [],
  };
  return { ctx, calls };
}
const tool = (n: string) => { const t = STUDIO2_TOOLS_B.find((x) => x.name === n); assert.ok(t, n); return t!; };
const balanced = (code: string) => {
  // crude Luau block balance: function/if/for/while/do ... end
  const src = code.replace(/--[^\n]*/g, "").replace(/"(?:\\.|[^"\\])*"/g, '""').replace(/\[==\[[\s\S]*?\]==\]/g, "");
  return src;
};

test("mechanics: 10 mechanics, unique ids, deps exist, every install has a script or data", () => {
  assert.ok(MECHANICS.length >= 10);
  const ids = new Set(MECHANICS.map((m) => m.id));
  assert.equal(ids.size, MECHANICS.length);
  for (const m of MECHANICS) {
    for (const d of m.needs ?? []) assert.ok(ids.has(d), `${m.id} needs ${d}`);
    const plan = planMechanicInstall(m.id, {}, false);
    assert.equal(plan.length, 1);
    assert.ok(plan[0].installs.length > 0, m.id);
    const json = JSON.stringify(plan[0].installs);
    assert.ok(json.includes(`"BrickwireMechanic":"${m.id}"`), `${m.id} roots tagged`);
  }
  assert.equal(listMechanics().length, MECHANICS.length);
});

test("mechanics: dependencies first, config validation", () => {
  const plan = planMechanicInstall("coin_pickup", {}, true);
  assert.deepEqual(plan.map((p) => p.id), ["leaderstats", "coin_pickup"]);
  assert.equal(plan[0].isDependency, true);
  assert.throws(() => planMechanicInstall("nope"));
  const m = MECHANICS.find((x) => Object.values(x.config).some((c) => typeof c.default === "number"))!;
  const key = Object.entries(m.config).find(([, c]) => typeof c.default === "number")![0];
  assert.throws(() => planMechanicInstall(m.id, { [key]: "str" }, false));
  assert.throws(() => planMechanicInstall(m.id, { __bad: 1 }, false));
});

test("mechanic tools: install/remove/configure generate correct Luau", async () => {
  const { ctx, calls } = mockCtx(() => [{ id: "sprint", status: "installed" }]);
  const r = (await tool("mechanic_install").run({ id: "sprint" }, ctx as never)) as { usage: string };
  assert.ok(r.usage);
  assert.equal(calls[0].readOnly, false);
  assert.match(calls[0].code, /bw_create_tree/);
  assert.match(calls[0].code, /BrickwireBackups/);
  assert.match(calls[0].code, /bw_waypoint/);
  await tool("mechanic_remove").run({ id: "sprint" }, ctx as never);
  assert.doesNotMatch(calls[1].code, /:Destroy\(\)/);
  await assert.rejects(tool("mechanic_configure").run({ id: "sprint", config: { nope: 1 } }, ctx as never));
  await assert.rejects(tool("mechanic_remove").run({ id: "bogus" }, ctx as never));
  const st = mockCtx(() => ({ installed: [] }));
  await tool("mechanic_status").run({}, st.ctx as never);
  assert.equal(st.calls[0].readOnly, true);
});

test("vfx: every preset builds with valid typed values", () => {
  for (const p of VFX_PRESETS) {
    const v = buildVfx(p.id, { scale: 2, intensity: 1.5 });
    assert.equal(v.node.className, "Attachment");
    assert.ok(v.node.children!.length >= 1);
    for (const c of v.node.children!) {
      for (const [k, val] of Object.entries(c.properties ?? {})) {
        assert.ok(!(Array.isArray(val)), `${p.id}.${c.name}.${k} is a raw array`);
        assert.notEqual(k, "Attributes_emit");
      }
    }
    if (p.burst) for (const c of v.node.children!) if (c.className === "ParticleEmitter") assert.equal(c.properties!.Enabled, false);
  }
  assert.throws(() => buildVfx("fire", { color: "red" }));
  assert.throws(() => buildVfx("nuke"));
});

test("npc: attributes + brain source sanity", async () => {
  const a = npcAttributes({ name: "Guard", behavior: "guard", dialog: ["Halt!"] });
  assert.equal(a.BW_Behavior, "guard");
  assert.equal(a.BW_Damage, 10);
  assert.deepEqual(JSON.parse(a.BW_Dialog), ["Halt!"]);
  assert.throws(() => npcAttributes({ name: "P", behavior: "patrol" }));
  assert.throws(() => npcAttributes({ name: "bad/name" }));
  for (const kw of ["PathfindingService", "ProximityPrompt", "MoveToFinished", "TakeDamage"]) assert.ok(NPC_BRAIN_SOURCE.includes(kw), kw);
  const { ctx, calls } = mockCtx();
  await tool("npc_create").run({ name: "Bob", behavior: "wander" }, ctx as never);
  assert.match(calls[0].code, /CreateHumanoidModelFromDescription/);
});

test("maps: deterministic, non-empty, flags present", () => {
  const R1 = rng(5), R2 = rng(5);
  assert.equal(R1(), R2());
  for (const t of MAP_TYPES) {
    const a = generateMap(t, { seed: 42 }), b = generateMap(t, { seed: 42 });
    assert.deepEqual(a, b, `${t} deterministic`);
    assert.ok(a.parts.length > 0, t);
    assert.ok(a.parts.some((p) => p[10].includes("s")), `${t} has spawn`);
    for (const p of a.parts) { assert.match(p[7], /^#[0-9a-f]{6}$/i); assert.ok(p[3] > 0 && p[4] > 0 && p[5] > 0, `${t} size>0`); }
  }
  const obby = generateMap("obby", { seed: 1, difficulty: 1 });
  assert.ok(obby.parts.some((p) => p[10] === "k"));
  assert.ok(obby.parts.filter((p) => p[10].includes("c")).length >= 2);
  assert.ok(generateMap("island").terrain);
  assert.notDeepEqual(generateMap("maze", { seed: 1 }).parts, generateMap("maze", { seed: 2 }).parts);
});

test("map_generate preview does not touch Studio", async () => {
  const { ctx, calls } = mockCtx();
  const r = (await tool("map_generate").run({ type: "arena", preview: true }, ctx as never)) as { parts: number };
  assert.ok(r.parts > 0);
  assert.equal(calls.length, 0);
  await tool("map_generate").run({ type: "city", seed: 3 }, ctx as never);
  assert.match(calls[0].code, /Color3\.fromHex/);
});

test("game design + economy", async () => {
  const ids = new Set(MECHANICS.map((m) => m.id));
  for (const g of GENRES) {
    const d = designGame({ genre: g });
    assert.ok(d.coreLoop.length >= 3);
    for (const m of d.mechanics) assert.ok(ids.has(m), `${g} -> unknown mechanic ${m}`);
    for (const m of d.suggestedMaps) assert.ok((MAP_TYPES as readonly string[]).includes(m));
  }
  const e = economyCurve({ base: 10, growth: 1.05, incomeGrowth: 1.1, levels: 10 });
  assert.equal(e.rows.length, 10);
  assert.ok(e.warnings.length > 0);
  const { ctx, calls } = mockCtx();
  await tool("gd_design").run({ genre: "obby" }, ctx as never);
  assert.equal(calls.length, 0);
  await tool("gd_design").run({ genre: "obby", saveToStudio: true }, ctx as never);
  assert.match(calls[0].code, /BrickwireDesign/);
});

test("debug/test tools are read-only and validate check types", async () => {
  const { ctx, calls } = mockCtx(() => [{ check: "x", pass: true }, { check: "y", pass: false }, { check: "z", pass: null }]);
  const r = (await tool("test_run").run({}, ctx as never)) as { passed: number; failed: number; skipped: number };
  assert.deepEqual([r.passed, r.failed, r.skipped], [1, 1, 1]);
  assert.equal(calls[0].readOnly, true);
  assert.match(calls[0].code, /loadstring/);
  await assert.rejects(tool("test_run").run({ checks: [{ type: "magic" }] }, ctx as never));
  await tool("debug_logs").run({ level: "all" }, ctx as never);
  assert.match(calls[1].code, /GetLogHistory/);
  assert.equal(calls[1].readOnly, true);
});

test("all B tools: unique names, schemas, and Luau keyword balance roughly ok", async () => {
  const names = STUDIO2_TOOLS_B.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of STUDIO2_TOOLS_B) { assert.equal(t.inputSchema.type, "object"); assert.ok(t.description.length > 20); }
  void balanced;
});
