/**
 * Resource library: every catalog kit exists in Luau (and vice versa), builds in the Luau VM stub, every script it
 * generates compiles, the bundled previews cover every kit, prompts and panel tasks reference it correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KITS, KIT_BY_ID, kitInfoToLuau } from "../../shared/src/library/catalog.js";
import { ICON_IDS, ICONS, iconSvg, iconsToLuau } from "../../shared/src/library/icons.js";
import { BW_LIBRARY_LUAU } from "../../shared/src/library/bw-library.generated.js";
import { packLibrary, minifyLuau } from "../../shared/src/library/pack.js";
import { resourceTask } from "../../shared/src/library/tasks.js";
import { prepareLuau, remapLuauLines, usesLibrary, BW_PRELUDE_LINES } from "../../shared/src/bw-luau.js";
import { buildAgentPrompt } from "../../shared/src/instructions.js";
import { assessCall } from "../../shared/src/safety.js";
import { AGENT_CATEGORIES } from "../../shared/src/protocol.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const LUAU = process.env.LUAU_BIN ?? "/data/tools/luau/luau";
const COMPILE = join(dirname(LUAU), "luau-compile");
const skip = !existsSync(LUAU) ? `luau binary not found at ${LUAU}` : false;
const libSrc = readFileSync(join(root, "shared/src/library/bw-library.luau"), "utf8");

test("generated library module is in sync with bw-library.luau + icons + catalog", () => {
  assert.equal(BW_LIBRARY_LUAU, packLibrary(libSrc));
  assert.ok(BW_LIBRARY_LUAU.startsWith(iconsToLuau() + "\n" + kitInfoToLuau()));
});

test("catalog ids match the Luau kits one-to-one; no backticks or ${ in Luau", () => {
  const luauIds = [...libSrc.matchAll(/^\tK\("([a-z_0-9]+)"/gm)].map((m) => m[1]).sort();
  assert.deepEqual(luauIds, KITS.map((k) => k.id).sort());
  assert.equal(new Set(luauIds).size, luauIds.length, "duplicate kit id");
  assert.ok(!/`|\$\{/.test(libSrc));
  assert.ok(KITS.length >= 60, "library size");
  assert.ok(ICON_IDS.length >= 30, "icon count");
  for (const k of KITS) assert.ok(k.name && k.nameRu && k.desc, k.id);
});

test("minifier keeps embedded script sources verbatim", () => {
  const src = "\tlocal X = 1 -- c\n\t-- comment\n\tlocal S = [==[\n\t-- keep me\n  indented\n]==]\n\tprint(S)";
  const out = minifyLuau(src);
  assert.ok(out.includes("\t-- keep me\n  indented\n]==]"));
  assert.ok(!out.includes("-- comment"));
});

test("library injection only when used; line numbers map back", () => {
  assert.ok(usesLibrary('BW.kit("cottage")'));
  assert.ok(usesLibrary("BW.icon(f, 'coin')"));
  assert.ok(usesLibrary("BW.kits()") && usesLibrary("BW.furnish(r, 'bedroom')"));
  assert.ok(!usesLibrary("BW.part{} BW.kitchen = 1".replace("BW.kitchen = 1", "")));
  const plain = prepareLuau("BW.part{}");
  assert.equal(plain.preludeLines, BW_PRELUDE_LINES);
  assert.ok(!plain.code.includes("_kitInfo"));
  const lib = prepareLuau('print(1)\nBW.kit("well")');
  assert.ok(lib.code.includes("BW._kitInfo") && lib.preludeLines > BW_PRELUDE_LINES);
  assert.equal(lib.code.split("\n").length, lib.preludeLines + 2);
  assert.equal(remapLuauLines(`[string "x"]:${lib.preludeLines + 2}: boom`, lib.preludeLines), `[string "x"]:2: boom`);
});

const LUAU_TOOL = { name: "execute_luau", description: "", available: true, risk: "write", inputSchema: {} } as never;
test("safety: library calls are writes", () => {
  for (const code of ['BW.kit("cottage", {At={0,0,0}})', 'BW.furnish("Workspace.Room", "bedroom")', 'BW.floorplan({"###"}, {})', "BW.building{Size={20,20}}", 'BW.icon(f, "coin", {})']) {
    assert.notEqual(assessCall(LUAU_TOOL, { code }).risk, "read", code);
  }
  assert.equal(assessCall(LUAU_TOOL, { code: "BW.kits()\nBW.uiCheck('StarterGui.HUD')\nBW.lint()" }).risk, "read");
});

test("every kit builds in the Luau VM; all generated scripts compile", { skip }, () => {
  const rd = (p: string) => readFileSync(join(root, p), "utf8");
  const src = [rd("tests/luau/roblox-stub.luau"), rd("tests/luau/runtime-stub.luau"), rd("shared/src/bw-helpers.luau"), packLibrary(libSrc), rd("scripts/library/dump.luau")].join("\n");
  const dir = mkdtempSync(join(tmpdir(), "bw-lib-"));
  writeFileSync(join(dir, "dump.luau"), src);
  const out = execFileSync(LUAU, [join(dir, "dump.luau")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const dumps = out.split("\n").filter((l) => l.startsWith("BWDUMP ")).map((l) => JSON.parse(l.slice(7)));
  assert.equal(dumps.length, KITS.length);
  let scripts = 0;
  const seen = new Set<string>();
  for (const d of dumps) {
    assert.ok(!d.error, `${d.id}: ${d.error}`);
    assert.equal(d.root.a.BW_Kit, d.id);
    for (const s of d.scripts) {
      if (seen.has(s.source)) continue;
      seen.add(s.source);
      assert.ok(!/\{\{[A-Z]+\}\}/.test(s.source), `${d.id} ${s.path}: unreplaced placeholder`);
      const f = join(dir, `s${scripts++}.luau`);
      writeFileSync(f, s.source);
      if (existsSync(COMPILE)) {
        try {
          execFileSync(COMPILE, ["--null", f], { stdio: "pipe" });
        } catch (e) {
          assert.fail(`${d.id} ${s.path} does not compile: ${(e as { stderr?: Buffer }).stderr}`);
        }
      }
    }
  }
  assert.ok(scripts >= 30, `scripts compiled: ${scripts}`);
});

test("runtime modules: every VFX preset plays, cinema math/checks/playback work (Luau VM stub)", { skip }, () => {
  const rd = (p: string) => readFileSync(join(root, p), "utf8");
  const src = [rd("tests/luau/roblox-stub.luau"), rd("tests/luau/runtime-stub.luau"), rd("tests/luau/vfx-stub.luau"), rd("shared/src/bw-helpers.luau"), packLibrary(libSrc), rd("tests/luau/fx-cinema-run.luau"), rd("tests/luau/cutscene-run.luau")].join("\n");
  const dir = mkdtempSync(join(tmpdir(), "bw-fx-"));
  writeFileSync(join(dir, "run.luau"), src);
  const out = execFileSync(LUAU, [join(dir, "run.luau")], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const fails = out.split("\n").filter((l) => l.startsWith("RUN FAIL") || /BrickwireVFX layer/.test(l));
  assert.deepEqual(fails, []);
  const oks = out.split("\n").filter((l) => l.startsWith("RUN OK")).length;
  assert.ok(oks >= 50, `runtime checks passed: ${oks}`);
  assert.ok(Number(/RUN EMITTED (\d+)/.exec(out)?.[1] ?? 0) > 500, "particles emitted");
  assert.ok(Number(/RUN SOUNDS (\d+)/.exec(out)?.[1] ?? 0) > 100, "cutscene sounds played");
  for (const f of ["BrickwireVFX", "BrickwireCinema", "BrickwireCutscene"]) {
    const re = { BrickwireVFX: /local VFX_SRC = \[==\[([\s\S]*?)\]==\]/, BrickwireCinema: /local CINEMA_SRC = \[==\[([\s\S]*?)\]==\]/, BrickwireCutscene: /local CUTSCENE_SRC = \[==\[([\s\S]*?)\]==\]/ }[f]!;
    const s = re.exec(libSrc)![1];
    const fp = join(dir, f + ".luau");
    writeFileSync(fp, s);
    if (existsSync(COMPILE)) execFileSync(COMPILE, ["--null", fp], { stdio: "pipe" });
  }
});

test("bundled previews cover every kit", () => {
  const previews = JSON.parse(readFileSync(join(root, "extension/public/library/previews.json"), "utf8")) as Record<string, string>;
  for (const k of KITS) assert.match(previews[k.id] ?? "", /^<svg /, k.id);
  for (const id of ICON_IDS) assert.match(iconSvg(id), /^<svg /);
  assert.ok(ICONS.coin && ICONS.heart);
});

test("prompt: RESOURCE LIBRARY per category, compact mode fits small-limit AIs", () => {
  const tools = [{ name: "execute_luau", description: "Run Luau code in Studio", available: true, inputSchema: {} }, { name: "search_game_tree", description: "Search the instance tree", available: true, inputSchema: {} }];
  const p = (category: (typeof AGENT_CATEGORIES)[number], maxChars?: number) => buildAgentPrompt({ providerName: "X", tools: tools as never, memorySummary: "", sessionId: "s", category, maxChars });
  assert.match(p("build"), /RESOURCE LIBRARY[\s\S]*cottage[\s\S]*modern_house/);
  assert.match(p("build"), /BW\.floorplan[\s\S]*BW\.building[\s\S]*BW\.scatter/);
  assert.match(p("ui"), /hud[\s\S]*shop[\s\S]*Icons \(BW\.icon\): coin/);
  assert.match(p("ui"), /BW\.uiCheck/);
  assert.match(p("vfx"), /BW\.fxCheck/);
  assert.match(p("scripting"), /BW\.lint/);
  assert.match(p("gameplay"), /BW\.gameCheck/);
  for (const c of AGENT_CATEGORIES) {
    assert.match(p(c), /VERIFY/i, c);
    assert.ok(p(c, 10000).length <= 9600, `${c} compact prompt too long: ${p(c, 10000).length}`);
  }
});

test("panel tasks: exact / similar / screenshot", () => {
  const exact = resourceTask("cottage", "exact", "make it blue");
  assert.match(exact, /BW\.kit\("cottage"/);
  assert.match(exact, /make it blue/);
  assert.match(resourceTask("cottage", "similar"), /LIKE[\s\S]*not a copy/);
  assert.match(resourceTask("shop", "screenshot"), /screenshot/);
  assert.match(resourceTask("coin", "exact"), /BW\.icon\(parent, "coin"/);
  assert.ok(KIT_BY_ID.obby);
});

test("1.7 community resources: bundled catalogue, compaction, tasks never invent asset ids", async () => {
  const { compactCommunity, communityTask, CURATED } = await import("../../shared/src/library/community.js");
  const data = JSON.parse(readFileSync(join(root, "extension/public/library/community.json"), "utf8"));
  assert.ok(data.items.length >= 1000, `community size ${data.items.length}`);
  const cats = new Set(data.items.map((i: { c: string }) => i.c));
  for (const c of ["Effects", "Backgrounds", "Textures", "Icons", "References"]) assert.ok(cats.has(c), c);
  for (const it of data.items) {
    assert.ok(it.i || it.w, it.id);
    for (const u of [it.i, it.dl, it.w]) if (u) assert.match(u, /^https:\/\//);
  }
  const raw = { resources: [{ id: 7, title: " Glow ", description: "By someone", category: "Effects", tags: ["Glow", "Undefined"], image: "https://uiassets.commissiontoolz.xyz/a.png", download_url: "javascript:alert(1)" }, { id: 8, title: "x", image: "http://insecure/x.png" }] };
  const c = compactCommunity(raw);
  assert.equal(c.length, 1);
  assert.deepEqual([c[0].t, c[0].a, c[0].g, c[0].dl], ["Glow", "someone", "Glow", ""]);
  const noId = communityTask(c[0], "use");
  assert.match(noId, /do NOT invent an id/);
  assert.match(communityTask(c[0], "use", "rbxassetid://123456789"), /rbxassetid:\/\/123456789/);
  assert.match(communityTask(c[0], "inspired"), /VISUAL REFERENCE/);
  assert.match(communityTask(CURATED[0], "use"), /reference/);
  assert.match(resourceTask("style_neon", "restyle"), /Restyle[\s\S]*style="neon"/);
});

test("1.7 prompts: UI styles, VFX library and cinematics are taught", () => {
  const tools = [{ name: "execute_luau", description: "Run Luau code in Studio", available: true, inputSchema: {} }];
  const p = (category: (typeof AGENT_CATEGORIES)[number], maxChars?: number) => buildAgentPrompt({ providerName: "X", tools: tools as never, memorySummary: "", sessionId: "s", category, maxChars });
  for (const m of [undefined, 10000]) {
    assert.match(p("ui", m), /BW\.uiWindow[\s\S]*BW\.uiJuice/);
    assert.match(p("ui", m), /60-30-10/);
    assert.match(p("vfx", m), /ANTICIPATION[\s\S]*IMPACT[\s\S]*DISSIPATION/);
    assert.match(p("vfx", m), /VFX\.play/);
    assert.match(p("animation", m), /BW\.camCheck/);
    assert.match(p("animation", m), /cinematic_intro/);
  }
});

test("1.7 detection + safety for style/VFX/cinema helpers", () => {
  for (const c of ['BW.uiButton(f, "Play", {})', 'BW.vfx("explosion", {0,0,0})', "BW.cinematic{target=workspace.Castle}", "BW.camCheck(s)", 'BW.shots("Workspace.X", "epic")', 'BW.style("neon")']) assert.ok(usesLibrary(c), c);
  for (const code of ['BW.uiWindow(g, {title="Shop"})', 'BW.vfx("heal", {0,0,0})', "BW.cinematic{shots=s}", 'BW.vfxPreview("slash")']) assert.notEqual(assessCall(LUAU_TOOL, { code }).risk, "read", code);
  assert.equal(assessCall(LUAU_TOOL, { code: 'local s = BW.shots("Workspace.Castle", "intro")\nBW.camCheck(s)\nprint(BW.style("neon").accent)' }).risk, "read");
});
