import { KIT_BY_ID, KIND_LABELS } from "./catalog.js";
import { ICONS } from "./icons.js";

export type ResourceMode = "exact" | "similar" | "screenshot" | "restyle";

/** Task text the panel sends for a Library resource (exact copy / own variation / like the user's screenshot). */
export function resourceTask(id: string, mode: ResourceMode, notes = ""): string {
  const extra = notes.trim() ? `\nMy notes: ${notes.trim()}` : "";
  if (ICONS[id]) {
    const t = `Use the library icon "${id}" in my UI: BW.icon(parent, "${id}", {Size={0,48,0,48}, Position=…}) where it fits (buttons, counters, cards). Then run BW.uiCheck on the ScreenGui.`;
    return t + extra;
  }
  const k = KIT_BY_ID[id];
  if (!k) return `Build the library resource "${id}".${extra}`;
  const what = `the library resource "${k.name}" (${KIND_LABELS[k.kind].en}: ${k.desc})`;
  const opts = k.opts ? ` Options you may set: ${k.opts}.` : "";
  if (mode === "restyle" || (k.kind === "style" && mode === "similar")) {
    const st = k.id.replace(/^style_/, "");
    return `Restyle my game's UI in the "${st}" style (${k.desc}). Inspect the existing ScreenGuis first (BW.uiCheck / search_game_tree). Keep every name, script reference and layout logic; change only the look: re-create buttons/panels/bars with BW.uiButton / BW.uiPanel / BW.uiWindow / BW.uiBar / BW.uiPill {style="${st}"} or restyle them with the BW.style("${st}") palette, fonts and strokes, add BW.uiJuice(gui). If I have no UI yet, build BW.kit("style_${st}") as a showcase. Then run BW.uiCheck on every changed ScreenGui and list what changed.${extra}`;
  }
  if (mode === "exact") {
    return `Build ${what} exactly as in the library: ONE execute_luau with BW.kit("${k.id}", {At={x,y,z} — a free spot near the origin/selection, Facing=0}).${opts} Then verify it (BW.inspect for 3D, BW.uiCheck for UI, BW.lint for scripts) and tell me what was created and where.${extra}`;
  }
  if (mode === "similar") {
    return `Make something LIKE ${what} — same purpose and style, but your own design, not a copy. Start from BW.kit("${k.id}", {...}) only if it helps, then change it clearly (layout, proportions, colours/palette, extra details) or build your own version with the BW helpers. Plan in numbers first, then build, then verify (BW.inspect / BW.uiCheck / BW.lint) and show me what is different from the library version.${extra}`;
  }
  return `I attached a screenshot/image to this message. Recreate what it shows in Studio as closely as you can (shapes, proportions, colours, layout). The library resource "${k.name}" (BW.kit("${k.id}")) is a close starting point — use it and adapt it if that is faster. First describe what you see in numbers (sizes in studs or pixels, colours as hex), then build and verify.${extra}`;
}

/** 1.8 asset packs (compact index shipped with the extension: extension/public/library/packs.json). */
export interface PackItemLite { id: string; n: string; c: string; k: string; s: number[]; t: number }
export interface PackLite { id: string; title: string; description: string; sprite: string | null; tile: number; cols: number; categories: Record<string, number>; items: PackItemLite[] }

export type PackMode = "place" | "use";
/** Task text for a pack item: place it as-is, or build something with it. Ids are exact (never invented). */
export function packTask(it: PackItemLite, mode: PackMode, notes = ""): string {
  const extra = notes.trim() ? `\nMy notes: ${notes.trim()}` : "";
  const size = it.s?.length === 3 ? ` (${it.s.join("×")} studs)` : "";
  const apply = it.k === "texture" || it.k === "decal";
  if (mode === "place") {
    if (apply)
      return `Apply the asset pack item "${it.id}" — ${it.n}, ${it.k} from ${it.c} — to the parts I mean (selection / what I describe; if unclear, ask me which part): BW.asset("${it.id}", {ApplyTo = part}). Then confirm which parts got it.${extra}`;
    return `Place the asset pack item "${it.id}" — ${it.n}, ${it.k} from ${it.c}${size}: ONE execute_luau with BW.asset("${it.id}", {At = {x, y, z} — a free spot near the origin or where I say, Facing = 0}). Then verify it exists (BW.report on the returned instance) and tell me where it is.${extra}`;
  }
  return `Use the asset pack item "${it.id}" (${it.n}, ${it.k}) as part of something bigger that fits my game — e.g. several copies arranged with intent, combined with BW parts, lights or effects. Plan in numbers first, use BW.asset("${it.id}", {...}) (and brickwire_assets to find matching items), then build and verify (BW.inspect / BW.fxCheck).${extra}`;
}
