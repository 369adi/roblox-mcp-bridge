import { test } from "node:test";
import assert from "node:assert/strict";
import { compileUIDoc, rgb, UI_STATES_SCRIPT, UI_IMPORT_LUAU } from "../../shared/src/studio2/uidoc.js";
import { STUDIO2_TOOLS } from "../../bridge/src/studio2-tools.js";
import { PROJECT_ANALYZE_LUAU, PROJECT_OPTIMIZE_LUAU } from "../../shared/src/studio2/analyzer.js";

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
const tool = (n: string) => { const t = STUDIO2_TOOLS.find((x) => x.name === n); assert.ok(t, n); return t!; };

test("uidoc: colors and basic compile", () => {
  assert.deepEqual(rgb("#fff"), [255, 255, 255]);
  assert.deepEqual(rgb("#3b82f6"), [59, 130, 246]);
  assert.throws(() => rgb("blue"));
  const r = compileUIDoc({ name: "Menu", children: [{ type: "Frame", name: "Bg", size: [1, 0, 1, 0], bg: "#111111", corner: 8, padding: 4, list: { padding: 6 },
    children: [{ type: "Text", text: "Hi", font: "GothamBold", textXAlign: "Left" }] }] });
  assert.equal(r.tree.className, "ScreenGui");
  const bg = r.tree.children![0];
  assert.equal(bg.className, "Frame");
  assert.deepEqual(bg.properties!.Size, { $type: "UDim2", value: [1, 0, 1, 0] });
  const mods = bg.children!.map((c) => c.className);
  assert.ok(mods.includes("UICorner") && mods.includes("UIPadding") && mods.includes("UIListLayout") && mods.includes("TextLabel"));
  assert.ok(!r.tree.children!.some((c) => c.className === "LocalScript"), "no runtime script when nothing interactive");
});

test("uidoc: components, variants, states → runtime script", () => {
  const r = compileUIDoc({ name: "Shop", children: [{ component: "Button", variant: "danger", name: "Buy", text: "Buy" }, { component: "Modal" }] });
  const buy = r.tree.children!.find((c) => c.name === "Buy")!;
  assert.equal(buy.className, "TextButton");
  assert.deepEqual(buy.properties!.BackgroundColor3, { $type: "Color3", value: rgb("#ef4444") });
  assert.equal(buy.properties!.AutoButtonColor, false);
  const st = JSON.parse(String(buy.attributes!.BW_States));
  assert.deepEqual(st.hover.BackgroundColor3, { c: rgb("#f87171") });
  assert.ok(st.pressed.Size.u);
  const script = r.tree.children!.find((c) => c.className === "LocalScript")!;
  assert.equal(script.source, UI_STATES_SCRIPT);
  assert.ok(r.stats.components.includes("Modal") && r.stats.components.includes("Title"));
});

test("uidoc: validation errors", () => {
  assert.throws(() => compileUIDoc({ name: "", children: [] }), /name/);
  assert.throws(() => compileUIDoc({ name: "X", children: [{ type: "Blob" }] }), /unsupported element type/);
  assert.throws(() => compileUIDoc({ name: "X", children: [{ component: "Nope" }] }), /unknown component/);
  assert.throws(() => compileUIDoc({ name: "X", children: [{ component: "Button", variant: "pink" }] }), /no variant/);
  assert.throws(() => compileUIDoc({ name: "X", children: [{ size: [1, 0] as never }] }), /UDim2/);
  assert.throws(() => compileUIDoc({ name: "X", children: [{ states: { hover: { glow: 1 } as never } }] }), /unsupported state/);
  const w = compileUIDoc({ name: "X", children: [{ type: "Frame", foo: 1 } as never, { type: "Frame", text: "a" }] });
  assert.ok(w.warnings.some((x) => x.includes("foo")) && w.warnings.some((x) => x.includes("text ignored")));
});

test("ui_build: validateOnly does not touch Studio; build sends tree to bw_create_tree", async () => {
  const { ctx, calls } = mockCtx(() => ({ path: "StarterGui.Hud", instances: 5, propertyErrors: [] }));
  const doc = { name: "Hud", children: [{ component: "HealthBar" }] };
  const v = (await tool("ui_build").run({ doc, validateOnly: true }, ctx)) as Record<string, unknown>;
  assert.equal(v.valid, true);
  assert.equal(calls.length, 0);
  await tool("ui_build").run({ doc }, ctx);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].readOnly, false);
  assert.match(calls[0].code, /bw_create_tree\(ARGS\.tree/);
  assert.match(calls[0].code, /BrickwireUIBackups/);
  assert.match(calls[0].code, /BWJSON/);
});

test("ui_import / project tools generate read-only Luau", async () => {
  const { ctx, calls } = mockCtx();
  await tool("ui_import").run({ path: "game.StarterGui.Hud" }, ctx);
  await tool("project_analyze").run({}, ctx);
  await tool("project_optimize").run({ fixes: ["tiny_part_shadows"] }, ctx);
  assert.ok(calls.every((c) => c.readOnly), "dry-run optimize is read-only");
  assert.ok(calls[0].code.includes(UI_IMPORT_LUAU.slice(0, 40)));
  await assert.rejects(tool("project_optimize").run({ fixes: ["delete_everything"] }, ctx), /unknown fixes/);
  await tool("project_optimize").run({ fixes: ["mesh_fidelity_auto"], dryRun: false }, ctx);
  assert.equal(calls.at(-1)!.readOnly, false);
  for (const src of [PROJECT_ANALYZE_LUAU, PROJECT_OPTIMIZE_LUAU, UI_IMPORT_LUAU]) {
    assert.match(src, /return \{/);
    assert.doesNotMatch(src, /:Destroy\(\)/, "analyzer/optimizer/import never delete");
  }
});

test("animation_generate: build=false returns IR without Studio; build emits real KeyframeSequence API", async () => {
  const { ctx, calls } = mockCtx(() => ({ path: "ServerStorage.BrickwireAnimations.Slash", previewId: "rbxassetid://temp" }));
  const dry = (await tool("animation_generate").run({ prompt: "быстрый удар мечом справа налево", build: false }, ctx)) as Record<string, any>;
  assert.equal(calls.length, 0);
  assert.equal(dry.animation.preset, "sword_attack");
  assert.ok(dry.ir.keyframes.length >= 3);
  assert.match(dry.publish, /Publish to Roblox/);
  const res = (await tool("animation_generate").run({ preset: "walk", rig: "R6", name: "Slash", createRig: true }, ctx)) as Record<string, any>;
  assert.equal(calls.length, 1);
  const code = calls[0].code;
  for (const api of ["Instance.new(\"KeyframeSequence\")", "Instance.new(\"Keyframe\")", "Instance.new(\"Pose\")", "Enum.PoseEasingStyle", "KeyframeMarker", ":AddMarker(", "RegisterKeyframeSequence", "AnimSaves", "CreateHumanoidModelFromDescription", "_history"]) {
    assert.ok(code.includes(api), api);
  }
  assert.equal(res.studio.previewId, "rbxassetid://temp");
  assert.ok(!JSON.stringify(res).match(/AnimationId":\s*"rbxassetid:\/\/\d+/), "never fakes a published AnimationId");
});

test("animation_edit: reads stored IR, applies ops, rebuilds", async () => {
  const { ctx: c0 } = mockCtx();
  const gen = (await tool("animation_generate").run({ preset: "wave", build: false }, c0)) as Record<string, any>;
  let n = 0;
  const { ctx, calls } = mockCtx(() => (n++ === 0 ? { ir: JSON.stringify(gen.ir), path: "ServerStorage.BrickwireAnimations.WaveAnim" } : { path: "ok" }));
  const r = (await tool("animation_edit").run({ name: "WaveAnim", ops: [{ op: "speed", factor: 2 }, { op: "mirror" }], newName: "WaveFast" }, ctx)) as Record<string, any>;
  assert.equal(calls.length, 2);
  assert.equal(calls[0].readOnly, true);
  assert.equal(r.animation.name, "WaveFast");
  assert.ok(Math.abs(r.animation.length - gen.animation.length / 2) < 0.02);
  assert.equal(r.source, "brickwire-ir");
});

test("all studio2 tools have schemas and correct risk", () => {
  const names = STUDIO2_TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const t of STUDIO2_TOOLS) {
    assert.equal((t.inputSchema as { type: string }).type, "object");
    assert.ok(["read", "write"].includes(t.risk), t.name);
  }
});
