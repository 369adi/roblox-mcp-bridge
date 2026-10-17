// DEV: rebuilds the bundled asset packs from packs/src/*.rbxm.
//   packs/built/<id>.json                 → bridge (BW.asset data + search index)
//   extension/public/library/packs.json   → panel Library → Packs (compact index)
//   extension/public/library/packs/<id>.webp  thumbnail sprite (48 px tiles; needs THUMBS=dir of <assetId>.png)
//   docs/PACKS.md                         → human catalogue
// Usage: node --import tsx scripts/gen-packs.ts   [THUMBS=/data/bw/thumbs]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import os from "node:os";
import { buildPack, type BuiltPack, type PackConfig } from "../shared/src/rbxm/pack.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (f: string) => JSON.parse(fs.readFileSync(path.join(root, f), "utf8"));
const TILE = 48;
const COLS = 32;

// thumbnails sprite via ImageMagick (DEV only): magick montage @list -tile 32x -geometry 48x48+0+0
function haveMagick(): boolean {
  try {
    execFileSync("magick", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const cfgs = rd("scripts/packs/packs.json") as PackConfig[] & Array<{ file: string }>;
  const names = rd("scripts/packs/asset-names.json");
  const vis = rd("scripts/packs/visual-names.json") as Record<string, string>;
  const thumbs = process.env.THUMBS || "/data/bw/thumbs";
  const haveThumbs = fs.existsSync(thumbs) && haveMagick();
  const builtDir = path.join(root, "packs", "built");
  const extDir = path.join(root, "extension", "public", "library");
  fs.mkdirSync(builtDir, { recursive: true });
  fs.mkdirSync(path.join(extDir, "packs"), { recursive: true });
  const extIndex: unknown[] = [];
  const md: string[] = ["# Brickwire asset packs", "", "Bundled packs the AI can place with `BW.asset(\"pack/item\", {At = …})` and search with the `brickwire_assets` tool. Every unnamed instance got a descriptive name (asset-name lookup + vision naming + shape/colour/material). Ids are stable within a release.", ""];
  for (const c of cfgs) {
    const cfg = { ...c, names: Object.fromEntries(Object.entries(vis).filter(([k]) => k.startsWith(c.id + ":")).map(([k, v]) => [k.slice(c.id.length + 1), v])) };
    const b: BuiltPack = buildPack(new Uint8Array(fs.readFileSync(path.join(root, "packs", "src", (c as { file: string }).file))), cfg, names);
    fs.writeFileSync(path.join(builtDir, `${c.id}.json`), JSON.stringify(b));
    // sprite
    const withThumb = b.index.items.filter((i) => i.thumbAsset);
    const tileOf = new Map<string, number>();
    const sprite = path.join(extDir, "packs", `${c.id}.webp`);
    if (haveThumbs) {
      const assets = [...new Set(withThumb.map((i) => i.thumbAsset!))].filter((a) => fs.existsSync(path.join(thumbs, a + ".png")));
      assets.forEach((a, k) => tileOf.set(a, k));
      const list = path.join(os.tmpdir(), `bw-sprite-${c.id}.txt`);
      fs.writeFileSync(list, assets.map((a) => path.join(thumbs, a + ".png")).join("\n"));
      execFileSync("magick", ["montage", "-quiet", "@" + list, "-background", "none", "-tile", `${COLS}x`, "-geometry", `${TILE}x${TILE}+0+0`, "-quality", "70", sprite], { stdio: "ignore" });
      fs.writeFileSync(path.join(builtDir, `${c.id}.tiles.json`), JSON.stringify(Object.fromEntries(tileOf)));
    } else if (fs.existsSync(path.join(builtDir, `${c.id}.tiles.json`))) {
      for (const [a, k] of Object.entries(rd(`packs/built/${c.id}.tiles.json`) as Record<string, number>)) tileOf.set(a, k);
    }
    extIndex.push({
      id: c.id,
      title: b.index.title,
      description: b.index.description,
      sprite: fs.existsSync(sprite) ? `library/packs/${c.id}.webp` : null,
      tile: TILE,
      cols: COLS,
      categories: b.index.categories,
      items: b.index.items.map((i) => ({ id: i.id, n: i.name, c: i.category, k: i.kind, s: i.size.map((x) => Math.round(x * 10) / 10), t: i.thumbAsset && tileOf.has(i.thumbAsset) ? tileOf.get(i.thumbAsset) : -1 })),
    });
    md.push(`## \`${c.id}\` — ${b.index.title} (${b.index.items.length} items)`, "", b.index.description, "");
    const byCat = new Map<string, string[]>();
    for (const i of b.index.items) byCat.set(i.category, [...(byCat.get(i.category) ?? []), i.id.slice(c.id.length + 1)]);
    for (const [cat, ids] of [...byCat].sort()) md.push(`- **${cat}** (${ids.length}): ${ids.map((x) => "`" + x + "`").join(", ")}`);
    md.push("");
    console.log(`${c.id}: ${b.index.items.length} items, ${(fs.statSync(path.join(builtDir, `${c.id}.json`)).size / 1024).toFixed(0)} KB, ${tileOf.size} thumbs`);
  }
  fs.writeFileSync(path.join(extDir, "packs.json"), JSON.stringify(extIndex));
  fs.writeFileSync(path.join(root, "docs", "PACKS.md"), md.join("\n") + "\n");
  console.log(`extension packs.json ${(fs.statSync(path.join(extDir, "packs.json")).size / 1024).toFixed(0)} KB`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
