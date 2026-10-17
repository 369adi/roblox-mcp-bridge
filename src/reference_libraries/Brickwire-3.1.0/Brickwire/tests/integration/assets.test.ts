/**
 * Asset packs: the bundled packs load, search finds things, injection produces valid Luau, and EVERY item of every
 * pack rebuilds with BW.asset in the Luau VM stub (meshes via CreateMeshPartAsync, unions via GeometryService).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AssetLibrary, lstr } from "../../bridge/src/assets.js";
import { prepareLuau, usesAssets } from "../../shared/src/bw-luau.js";
import { BW_ASSETS_LUAU } from "../../shared/src/library/bw-assets.generated.js";
import { minifyLuau } from "../../shared/src/library/pack.js";
import { guideFor, GUIDE_TOPICS } from "../../shared/src/guides.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const LUAU = process.env.LUAU_BIN ?? "/data/tools/luau/luau";
const skip = !existsSync(LUAU) ? `luau binary not found at ${LUAU}` : false;
const STUB = ["roblox-stub", "runtime-stub", "assets-stub"].map((f) => readFileSync(join(here, `../luau/${f}.luau`), "utf8")).join("\n");
const dir = mkdtempSync(join(tmpdir(), "bw-assets-"));
const lib = new AssetLibrary({ bundled: [join(root, "packs", "built")], user: [] }).load(true);

function run(code: string): { ok: boolean; out: string } {
  const file = join(dir, `a${Math.random().toString(36).slice(2)}.luau`);
  const inj = lib.injectionFor(code);
  writeFileSync(file, STUB + "\n" + prepareLuau(code, inj?.luau).code);
  try {
    return { ok: true, out: execFileSync(LUAU, [file], { stdio: "pipe", maxBuffer: 64 * 1024 * 1024 }).toString() };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return { ok: false, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("generated asset runtime is in sync with bw-assets.luau", () => {
  assert.equal(BW_ASSETS_LUAU, minifyLuau(readFileSync(join(root, "shared/src/library/bw-assets.luau"), "utf8")));
  assert.ok(usesAssets('BW.asset("vfx/x")') && usesAssets("BW.assetInfo(id)") && !usesAssets("BW.assets = 1".replace("assets", "asse")));
});

test("bundled packs: 5 packs, ~2300 named items, unique ids, no default names left", () => {
  const ids = [...lib.packs.keys()].sort();
  assert.deepEqual(ids, ["ndc", "retro", "textures", "ultimate", "vfx"]);
  let n = 0;
  for (const p of lib.packs.values()) {
    const seen = new Set<string>();
    for (const it of p.index.items) {
      n++;
      assert.match(it.id, /^[a-z0-9_]+\/[a-z0-9_]+$/, it.id);
      assert.ok(!seen.has(it.id), "duplicate " + it.id);
      seen.add(it.id);
      assert.ok(p.data[it.id], "data for " + it.id);
      assert.ok(!/^(Part|MeshPart|Model|Union|Texture|Decal|Mesh)$/i.test(it.name), `unnamed item ${it.id}: ${it.name}`);
    }
  }
  assert.ok(n > 2200, `items: ${n}`);
});

test("search: relevant results, filters, did-you-mean, overview", () => {
  const sky = lib.search({ query: "sky", kind: "sky" });
  assert.ok(sky.total >= 20 && sky.items.every((i) => i.kind === "sky"));
  const wave = lib.search({ query: "shockwave", pack: "vfx" });
  assert.ok(wave.items.length && wave.items[0]!.id.startsWith("vfx/"));
  assert.ok(lib.search({ query: "brick" }).total > 0);
  assert.ok(lib.suggest("vfx/shockwav").length > 0);
  assert.equal(lib.overview().length, 5);
  const first = lib.packs.get("ndc")!.index.items[0]!;
  assert.equal(lib.get(first.id.toUpperCase())?.item.id, first.id, "case-insensitive ids");
});

test("injection: only literal pack ids, one line, unknown ids get suggestions, size cap", () => {
  const id = lib.packs.get("vfx")!.index.items[0]!.id;
  const inj = lib.injectionFor(`local a = BW.asset("${id}", {At = {0, 0, 0}})\nBW.asset("vfx/definitely_not_here")\nprint("Workspace/Part")`)!;
  assert.deepEqual(inj.ids, [id]);
  assert.deepEqual(inj.missing, ["vfx/definitely_not_here"]);
  assert.ok(!inj.luau.includes("\n"), "single line keeps error line mapping simple");
  assert.equal(lib.injectionFor("BW.part{}"), null);
  const p = prepareLuau(`BW.asset("${id}")`, inj.luau);
  assert.equal(p.code.split("\n").length, p.preludeLines + 1);
  assert.equal(lstr('a"b\\c\n'), '"a\\"b\\\\c\\n"');
});

test("Luau: every item of every pack rebuilds with BW.asset (stub)", { skip }, () => {
  for (const p of lib.packs.values()) {
    const ids = p.index.items.map((i) => i.id);
    for (let k = 0; k < ids.length; k += 400) {
      const chunk = ids.slice(k, k + 400);
      const code = `local bad, n = {}, 0
local ids = {${chunk.map((i) => JSON.stringify(i)).join(",")}}
local holder = Instance.new("Folder") holder.Parent = workspace
for i, id in ipairs(ids) do
	local ok, err = pcall(function()
		local inst = BW.asset(id, (i % 2 == 0) and {At = {i * 10, 0, 0}, Parent = holder} or {At = {i * 10, 0, 0}, Facing = 90, Scale = 1.5})
		assert(inst and inst.Parent ~= nil, "not parented")
		local info = BW.assetInfo(id)
		assert(info and info.kind, "no info")
	end)
	if ok then n += 1 else table.insert(bad, id .. ": " .. tostring(err)) end
end
print("OK " .. n .. " / " .. #ids .. " meshes=" .. __MESHES .. " unions=" .. __UNIONS)
for i = 1, math.min(#bad, 8) do print("BAD " .. bad[i]) end`;
      const r = run(code);
      assert.ok(r.ok, r.out.slice(-3000));
      assert.match(r.out, new RegExp(`OK ${chunk.length} / ${chunk.length}`), `${p.index.id}: ${r.out.split("\n").filter((l) => /^(OK|BAD)/.test(l)).join("\n")}`);
    }
  }
});

test("Luau: ApplyTo copies textures onto parts; skies go to Lighting; unknown id error suggests", { skip }, () => {
  const tex = lib.search({ pack: "textures", limit: 1 }).items[0]!.id;
  const sky = lib.search({ kind: "sky", limit: 1 }).items[0]!.id;
  const r = run(`local p = BW.part{Name = "Floor", Size = {20, 1, 20}, Position = {0, 0.5, 0}}
BW.asset("${tex}", {ApplyTo = p})
local n = 0 for _, c in ipairs(p:GetChildren()) do if c.ClassName == "Texture" or c.ClassName == "Decal" or c.ClassName == "SurfaceAppearance" then n += 1 end end
print("TEX " .. n)
local s = BW.asset("${sky}")
print("SKY " .. s.Parent.Name)
local ok, err = pcall(function() BW.asset("vfx/shockwav") end)
print("ERR " .. tostring(err))`);
  assert.ok(r.ok, r.out.slice(-2000));
  assert.match(r.out, /TEX [1-9]/);
  assert.match(r.out, /SKY Lighting/);
  assert.match(r.out, /ERR .*unknown asset 'vfx\/shockwav'.*did you mean: vfx\//);
});

test("user packs: a .rbxm dropped into data/packs is parsed, named and searchable", () => {
  const d = mkdtempSync(join(tmpdir(), "bw-userpack-"));
  mkdirSync(join(d, "packs"), { recursive: true });
  copyFileSync(join(root, "packs", "src", "textures.rbxm"), join(d, "packs", "My Cool Pack.rbxm"));
  const u = new AssetLibrary({ bundled: [], user: [join(d, "packs")] }).load(true);
  const p = u.packs.get("my_cool_pack");
  assert.ok(p && p.source === "user" && p.index.items.length > 50, "user pack loaded");
  assert.ok(u.injectionFor(`BW.asset("${p.index.items[0]!.id}")`)?.ids.length === 1);
});

test("guides: every topic has real content; aliases work", () => {
  for (const t of GUIDE_TOPICS) assert.ok((guideFor(t) ?? "").length > 600, t);
  assert.equal(guideFor("cinematic"), guideFor("camera"));
  assert.equal(guideFor("gacha"), guideFor("cutscene"));
  assert.ok(/Skip/.test(guideFor("cutscene")!) && /SERVER/.test(guideFor("cutscene")!) && /animedice/.test(guideFor("cutscene")!));
  assert.equal(guideFor("nope"), null);
  for (const t of GUIDE_TOPICS) assert.ok(guideFor(t)!.length < 5600, `${t} fits one tool result`);
});
