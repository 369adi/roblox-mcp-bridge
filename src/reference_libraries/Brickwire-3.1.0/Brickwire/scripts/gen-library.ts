// DEV: regenerates extension/public/library/previews.json — runs every kit in the Luau stub and renders SVG previews.
// Usage: node --import tsx scripts/gen-library.ts   (needs the luau CLI: LUAU=/path/to/luau or /data/tools/luau/luau)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { BW_HELPERS_LUAU } from "../shared/src/bw-helpers.generated.ts";
import { packLibrary } from "../shared/src/library/pack.ts";
import { KITS, KIT_BY_ID } from "../shared/src/library/catalog.ts";
import { render3d, renderGui, renderCard, type KitDump } from "./library/render.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LUAU = process.env.LUAU || "/data/tools/luau/luau";

export function dumpKits(): KitDump[] {
  const rd = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
  const lib = packLibrary(rd("shared/src/library/bw-library.luau"));
  const src = [rd("tests/luau/roblox-stub.luau"), rd("tests/luau/runtime-stub.luau"), rd("shared/src/bw-helpers.luau"), lib, rd("scripts/library/dump.luau")].join("\n");
  const tmp = path.join(fs.mkdtempSync(path.join((process.env.TMPDIR || "/tmp"), "bwlib-")), "dump.luau");
  fs.writeFileSync(tmp, src);
  const out = execFileSync(LUAU, [tmp], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out.split("\n").filter((l) => l.startsWith("BWDUMP ")).map((l) => JSON.parse(l.slice(7)));
}

const CARD_ICON: Record<string, string> = { day_night: "clock", saved_stats: "lock", player_aura: "star", rain: "info", snow: "info" };

export function renderPreview(d: KitDump): string {
  const info = KIT_BY_ID[d.id];
  if (d.error || !d.root) return renderCard(info?.name ?? d.id, ["error: " + (d.error ?? "no result")], "warning");
  if (d.root.c === "ScreenGui") { const g = renderGui(d.root); if (g) return g; }
  const s = d.root.c === "ScreenGui" ? null : render3d(d.root);
  if (s) return s;
  const lines = (d.scripts ?? []).map((x) => `${x.path.replace(/^StarterPlayer\./, "")} (${x.class})`);
  return renderCard(info?.name ?? d.id, lines.length ? lines : [info?.desc ?? ""], CARD_ICON[d.id] ?? "gear");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dumps = dumpKits();
  const previews: Record<string, string> = {};
  for (const d of dumps) previews[d.id] = renderPreview(d);
  const missing = KITS.filter((k) => !previews[k.id]).map((k) => k.id);
  if (missing.length) throw new Error("no preview for: " + missing.join(", "));
  const dir = path.join(root, "extension", "public", "library");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "previews.json"), JSON.stringify(previews));
  const bytes = Object.values(previews).reduce((s, v) => s + v.length, 0);
  console.log(`previews: ${Object.keys(previews).length} kits, ${(bytes / 1024).toFixed(0)} KB`);
  if (process.env.BW_PREVIEW_DIR) {
    fs.mkdirSync(process.env.BW_PREVIEW_DIR, { recursive: true });
    for (const [id, svg] of Object.entries(previews)) fs.writeFileSync(path.join(process.env.BW_PREVIEW_DIR, id + ".svg"), svg);
  }
}
