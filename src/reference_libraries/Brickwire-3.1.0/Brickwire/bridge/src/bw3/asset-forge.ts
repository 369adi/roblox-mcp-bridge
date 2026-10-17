/**
 * Brickwire 3.0 Asset Forge — request interpretation and procedural recipes that build real
 * multi-part geometry. Unsupported requests are reported as unsupported (no placeholder cube).
 */
import crypto from "node:crypto";
import { generateMesh } from "../../../shared/src/studio2/meshgen.js";
import { sweep, ellipsoid, box, cylinder, cone, extrude, mirrorX, transformPart, rotY, rotZ, rotX, rng, groundAndCenter, vec, type Model, type Part, type Material, type V3 } from "./mesh-kit.js";

export const RECIPES = ["dragon", "sword", "house", "castle_tower", "car", "tree", "rock", "crystal", "chest", "barrel"] as const;
export type Recipe = (typeof RECIPES)[number];
export interface ForgeSpec { recipe: Recipe; variant: string; detail: 1 | 2 | 3; seed: number; size: number; colors: Record<string, string>; name: string; style: "lowpoly" | "standard" | "detailed" }
const RECIPE_WORDS: Array<[Recipe, RegExp, string?]> = [
  ["dragon", /(дракон|dragon|змей|wyrm|serpent|wyvern|виверн)/, ""],
  ["sword", /(меч|клинок|катан|sword|blade|katana|sabre|сабл|шпаг)/],
  ["castle_tower", /(башн|tower|замок|castle|крепост|fortress)/],
  ["house", /(дом|house|хижин|hut|cabin|коттедж|cottage|здани|building|магазин здан)/],
  ["car", /(машин|автомоб|car\b|vehicle|авто\b|truck|грузов|гонк|racing car)/],
  ["tree", /(дерев|\btree|сосн|\bpine|(?:^|[^а-я])[её]лк|(?:^|[^а-я])ель|(?:^|[^а-я])дуб|\boak)/],
  ["chest", /(сундук|chest|ящик|crate|сокровищ|treasure)/],
  ["barrel", /(бочк|barrel|бочон|keg)/],
  ["crystal", /(кристал|crystal|гем|gem|самоцвет)/],
  ["rock", /(камен|камн|скал|валун|rock|stone|boulder|cliff)/],
];
const COLORS: Array<[RegExp, string]> = [
  [/(красн|алый|red|crimson|scarlet)/, "#B3262E"], [/(зелён|зелен|green|emerald|изумруд)/, "#2E8B57"], [/(син|blue|azure|лазур)/, "#2F5FB3"],
  [/(золот|gold)/, "#D4A637"], [/(чёрн|черн|black|obsidian)/, "#1E1E24"], [/(бел|white|ivory)/, "#E8E4DA"], [/(фиолет|пурпур|purple|violet)/, "#6B3FA0"],
  [/(оранж|orange)/, "#D9772B"], [/(серебр|silver|steel|сталь)/, "#B8BEC6"], [/(жёлт|желт|yellow)/, "#E3C23A"], [/(коричн|brown|дерев)/, "#7A5230"],
];
export interface Interpretation { ok: boolean; spec?: ForgeSpec; reason?: string; matched: string[]; assumptions: string[] }
export function interpret(text: string, override: Partial<ForgeSpec> = {}): Interpretation {
  const t = text.toLowerCase().replace(/ё/g, "е");
  const assumptions: string[] = [], matched: string[] = [];
  let recipe = override.recipe as Recipe | undefined;
  if (!recipe) for (const [r, re] of RECIPE_WORDS) { const m = t.match(re); if (m) { recipe = r; matched.push(m[0]); break; } }
  if (!recipe || !RECIPES.includes(recipe)) return { ok: false, matched, assumptions, reason: `No procedural recipe matches this request. Supported object families: ${RECIPES.join(", ")}. For other objects use Blender MCP (if connected and authorized) or describe one of the supported families.` };
  const detail = (override.detail ?? (/(детал|detail|high.?poly|подробн|качествен)/.test(t) ? 3 : /(low.?poly|лоуполи|низкополи|простой|simple)/.test(t) ? 1 : 2)) as 1 | 2 | 3;
  const style = detail === 3 ? "detailed" : detail === 1 ? "lowpoly" : "standard";
  let variant = override.variant ?? "";
  if (!variant) {
    if (recipe === "dragon") variant = /(западн|western|крыл|wing|виверн|wyvern)/.test(t) ? "western" : "eastern";
    else if (recipe === "sword") variant = /(катан|katana|япон|japan)/.test(t) ? "katana" : "longsword";
    else if (recipe === "tree") variant = /(сосн|pine|ель|елк|ёлк|хвойн)/.test(t) ? "pine" : "broadleaf";
    else if (recipe === "chest") variant = /(ящик|crate)/.test(t) ? "crate" : "treasure";
    else if (recipe === "car") variant = /(грузов|truck)/.test(t) ? "truck" : "sedan";
    else variant = "default";
    if (recipe === "dragon" && variant === "eastern" && !/(япон|japan|китай|chin|восточ|eastern|lung|long)/.test(t)) assumptions.push("Dragon style not specified: generated an eastern (serpentine) dragon. Say 'western/with wings' for the other variant.");
  }
  const sizeM = t.match(/(\d+(?:[.,]\d+)?)\s*(stud|студ|м\b|метр|m\b|meter)/);
  let size = override.size ?? 0;
  if (!size && sizeM) { const v = Number(sizeM[1].replace(",", ".")); size = /stud|студ/.test(sizeM[2]) ? v : v / 0.28; matched.push(sizeM[0]); }
  const defaults: Record<Recipe, number> = { dragon: 40, sword: 5, house: 24, castle_tower: 30, car: 14, tree: 22, rock: 8, crystal: 6, chest: 4, barrel: 4 };
  if (!size) { size = defaults[recipe]; assumptions.push(`No size given: target ${defaults[recipe]} studs on the longest axis (≈${Math.round(defaults[recipe] * 0.28 * 10) / 10} m at 1 stud ≈ 0.28 m).`); }
  if (size < 0.5 || size > 1000) return { ok: false, matched, assumptions, reason: "Requested size must be between 0.5 and 1000 studs" };
  const colors: Record<string, string> = { ...(override.colors ?? {}) };
  for (const [re, hex] of COLORS) if (re.test(t)) { colors.primary ??= hex; }
  const seed = override.seed ?? parseInt(crypto.createHash("sha256").update(t).digest("hex").slice(0, 8), 16);
  const name = override.name ?? `${recipe[0].toUpperCase()}${recipe.slice(1)}_${variant}`.replace(/[^A-Za-z0-9_]/g, "");
  return { ok: true, matched, assumptions, spec: { recipe, variant, detail, seed, size, colors, name, style } };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function catmull(points: V3[], samples: number): V3[] {
  const out: V3[] = [];
  for (let i = 0; i < samples; i++) {
    const u = (i / (samples - 1)) * (points.length - 1), k = Math.min(points.length - 2, Math.floor(u)), t = u - k;
    const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1], p3 = points[Math.min(points.length - 1, k + 2)];
    out.push([0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t * t * t)) as V3);
  }
  return out;
}
const mat = (name: string, color: string, roughness = 0.6, roblox = "SmoothPlastic", metalness = 0): Material => ({ name, color, roughness, roblox, metalness });

function dragon(s: ForgeSpec): Model {
  const R = rng(s.seed), d = s.detail, seg = [8, 12, 16][d - 1], samples = [36, 64, 96][d - 1];
  const body = s.colors.primary ?? (s.variant === "western" ? "#8C2A1E" : "#2E8B57");
  const materials = [mat("DragonScales", body, 0.55, "SmoothPlastic"), mat("DragonBelly", "#D9B26A", 0.7), mat("DragonHorn", "#E8E1CC", 0.4, "Marble"), mat("DragonEye", "#F2C230", 0.2, "Neon"), mat("DragonClaw", "#2A2622", 0.35), mat("DragonMane", "#C23B22", 0.8, "Fabric")];
  const parts: Part[] = [];
  const L = 40; // design length, scaled at the end
  // spine curve: serpentine S-curve (eastern) or compact arched body (western)
  const ctrl: V3[] = s.variant === "western"
    ? [[0, 7, 9], [0, 8, 5], [0, 7.5, 0], [0, 6.5, -5], [0, 5, -10], [1.5, 3, -15], [4, 2.2, -19]]
    : Array.from({ length: 9 }, (_, i) => [Math.sin(i * 1.15 + R() * 0.3) * (i === 0 ? 1 : 3.2), 6 + Math.sin(i * 0.9) * 2.2 - i * 0.25, 18 - i * 4.6] as V3);
  const spine = catmull(ctrl, samples);
  const radius = (t: number) => { const r = s.variant === "western" ? (t < 0.15 ? lerp(1.1, 2.4, t / 0.15) : lerp(2.4, 0.18, Math.pow((t - 0.15) / 0.85, 0.9))) : lerp(1.45, 0.16, Math.pow(t, 1.25)) * (1 + 0.08 * Math.sin(t * 40)); return [r, r * 0.88] as [number, number]; };
  parts.push(sweep("Body", "DragonScales", spine, radius, { seg }));
  // belly plates (thin strip beneath the spine)
  const belly = spine.slice(2, Math.floor(samples * 0.85)).map((p, i, a) => { const t = (i + 2) / samples; const r = radius(t)[1]; return [p[0], p[1] - r * 0.78, p[2]] as V3; });
  parts.push(sweep("Belly", "DragonBelly", belly, (t) => [radius(t * 0.83 + 0.02)[0] * 0.55, 0.22], { seg: Math.max(6, seg - 4) }));
  // head
  const h = spine[0], dir = vec.norm(vec.sub(spine[0], spine[3]));
  const at = (k: number, up = 0, side = 0): V3 => [h[0] + dir[0] * k + side, h[1] + dir[1] * k + up, h[2] + dir[2] * k];
  parts.push(ellipsoid("Skull", "DragonScales", at(0.8, 0.4), [1.9, 1.5, 2.2], { seg, rings: Math.max(6, seg - 4) }));
  parts.push(sweep("Snout", "DragonScales", [at(1.6, 0.2), at(3.4, -0.05), at(4.9, -0.25)], (t) => [lerp(1.25, 0.75, t), lerp(0.85, 0.5, t)], { seg }));
  parts.push(sweep("Jaw", "DragonBelly", [at(1.4, -0.75), at(3.1, -1.05), at(4.4, -1.1)], (t) => [lerp(1.0, 0.55, t), lerp(0.45, 0.25, t)], { seg }));
  for (const side of [-1, 1]) {
    parts.push(ellipsoid(side < 0 ? "Eye_L" : "Eye_R", "DragonEye", at(1.9, 0.95, side * 1.05), [0.32, 0.26, 0.42], { seg: 10, rings: 6 }));
    parts.push(sweep(side < 0 ? "Horn_L" : "Horn_R", "DragonHorn", catmull([at(0.2, 1.1, side * 0.8), at(-1.2, 2.4, side * 1.4), at(-3.0, 3.1, side * 1.7), at(-4.6, 3.0, side * 1.5)], 10), (t) => lerp(0.42, 0.04, t), { seg: 8 }));
    if (s.variant === "eastern") parts.push(sweep(side < 0 ? "Whisker_L" : "Whisker_R", "DragonHorn", catmull([at(4.2, -0.2, side * 0.7), at(4.6, -0.6, side * 2.4), at(3.6, -1.6, side * 4.0), at(2.0, -2.8, side * 4.6)], 12), (t) => lerp(0.12, 0.03, t), { seg: 6 }));
    for (let k = 0; k < (d >= 2 ? 3 : 2); k++) parts.push(cone(`Tooth_${side < 0 ? "L" : "R"}${k}`, "DragonHorn", at(3.0 + k * 0.6, -0.6, side * (0.75 - k * 0.12)), at(3.0 + k * 0.6, -1.2, side * (0.72 - k * 0.12)), 0.12, 6));
  }
  // spines / mane along the back
  const spikes = [8, 14, 22][d - 1];
  for (let i = 0; i < spikes; i++) {
    const t = 0.06 + (i / spikes) * 0.85, k = Math.floor(t * (samples - 1)), p = spine[k], r = radius(t)[1];
    const tan = vec.norm(vec.sub(spine[Math.min(samples - 1, k + 1)], spine[Math.max(0, k - 1)]));
    const base: V3 = [p[0], p[1] + r * 0.82, p[2]], tip: V3 = vec.add(base, vec.add([0, r * 1.2 + 0.4, 0], vec.mul(tan, r * 0.6)));
    parts.push(cone(`Spine_${i}`, s.variant === "eastern" ? "DragonMane" : "DragonHorn", base, tip, Math.max(0.12, r * 0.38), 6));
  }
  // legs: hip → knee → foot with claws, at 22% and 55% of the body
  for (const [ti, name] of [[0.2, "Front"], [0.52, "Hind"]] as Array<[number, string]>) for (const side of [-1, 1]) {
    const k = Math.floor(ti * (samples - 1)), p = spine[k], r = radius(ti)[0];
    const hip: V3 = [p[0] + side * r * 0.8, p[1] - r * 0.2, p[2]], knee: V3 = [hip[0] + side * 1.8, hip[1] - 2.0, hip[2] + 0.9], foot: V3 = [knee[0] + side * 0.4, Math.max(0.35, knee[1] - 2.6), knee[2] - 0.6];
    parts.push(sweep(`${name}Leg_${side < 0 ? "L" : "R"}`, "DragonScales", catmull([hip, knee, foot], 8), (t) => lerp(r * 0.42, 0.3, t), { seg: Math.max(6, seg - 4) }));
    for (let c = -1; c <= 1; c++) parts.push(cone(`${name}Claw_${side < 0 ? "L" : "R"}${c + 1}`, "DragonClaw", [foot[0] + c * 0.25, foot[1], foot[2] + 0.1], [foot[0] + c * 0.38, foot[1] - 0.35, foot[2] + 0.75], 0.11, 6));
  }
  if (s.variant === "western") for (const side of [-1, 1]) {
    const root = spine[Math.floor(samples * 0.18)];
    const outline: [number, number][] = [[0, 0], [3, 3.5], [7, 6], [11, 5.2], [10, 3], [12.5, 1.5], [8.5, 0.4], [9.5, -1.6], [5.5, -0.8], [3.5, -2.4]];
    const wing = extrude("Wing", "DragonBelly", outline, 0.18, (v) => { let q: V3 = [v[0], v[1] * 0.85, v[2]]; q = rotZ(0.35)(q); q = rotX(-0.25)(q); return [root[0] + side * (q[0] + 1.6), root[1] + 1.2 + q[1], root[2] - 2 + q[2] - v[0] * 0.15]; });
    parts.push(side < 0 ? { ...wing, name: "Wing_L" } : { ...wing, name: "Wing_R" });
  }
  // tail fin
  const tail = spine[samples - 1];
  parts.push(extrude("TailFin", s.variant === "eastern" ? "DragonMane" : "DragonScales", [[0, 0], [1.6, 1.5], [3.4, 0], [1.6, -1.5]], 0.15, (v) => [tail[0] + v[2], tail[1] + v[1], tail[2] - v[0]]));
  return scaleTo({ name: s.name, parts, materials }, s.size, L);
}
function sword(s: ForgeSpec): Model {
  const d = s.detail, kat = s.variant === "katana";
  const metal = s.colors.primary && !kat ? s.colors.primary : "#C9CED6";
  const materials = [mat("Blade", metal, 0.22, "Metal", 0.9), mat("Guard", s.colors.primary ?? (kat ? "#2A2A2A" : "#B8902F"), 0.35, "Metal", 0.8), mat("Grip", kat ? "#1D2A55" : "#5A3420", 0.85, "Fabric"), mat("Pommel", kat ? "#2A2A2A" : "#B8902F", 0.35, "Metal", 0.8)];
  const parts: Part[] = [];
  const bladeLen = kat ? 7.2 : 6.5, steps = [6, 12, 20][d - 1];
  const bladePath: V3[] = Array.from({ length: steps + 1 }, (_, i) => { const t = i / steps; return [0, 1.9 + t * bladeLen, kat ? -Math.pow(t, 2) * 0.55 : 0] as V3; });
  const width = (t: number) => (kat ? lerp(0.34, 0.26, t) : lerp(0.42, 0.34, Math.min(1, t * 1.1))) * (t > 0.86 ? Math.max(0.04, (1 - t) / 0.14) : 1);
  const diamond = (a: number): [number, number] => { const k = Math.round((a / (Math.PI * 2)) * 4) % 4; return [[1, 0], [0, 1], [-1, 0], [0, -1]][k] as [number, number]; };
  parts.push(sweep("Blade", "Blade", bladePath, (t) => [0.075, width(t)], { seg: 4, shape: diamond, capEnd: true }));
  if (kat) parts.push(cylinder("Tsuba", "Guard", [0, 1.78, 0], [0, 1.92, 0], 0.62, 0.62, [8, 14, 20][d - 1]));
  else parts.push(box("Crossguard", "Guard", [0, 1.85, 0], [2.4, 0.22, 0.38]), cone("GuardTip_L", "Guard", [-1.2, 1.85, 0], [-1.55, 1.95, 0], 0.12, 8), cone("GuardTip_R", "Guard", [1.2, 1.85, 0], [1.55, 1.95, 0], 0.12, 8));
  parts.push(cylinder("Grip", "Grip", [0, 0.35, 0], [0, 1.75, 0], kat ? 0.17 : 0.15, kat ? 0.17 : 0.16, [8, 12, 16][d - 1]));
  for (let i = 0; i < [2, 4, 6][d - 1]; i++) { const y = 0.5 + i * (1.1 / Math.max(1, [2, 4, 6][d - 1] - 1)); parts.push(cylinder(`Wrap_${i}`, "Grip", [0, y - 0.04, 0], [0, y + 0.04, 0], kat ? 0.19 : 0.17, kat ? 0.19 : 0.17, 10)); }
  parts.push(kat ? cylinder("Kashira", "Pommel", [0, 0.2, 0], [0, 0.36, 0], 0.19, 0.18, 12) : ellipsoid("Pommel", "Pommel", [0, 0.2, 0], [0.26, 0.24, 0.26], { seg: 12, rings: 8 }));
  return scaleTo({ name: s.name, parts, materials }, s.size, kat ? 9.2 : 8.5);
}
function house(s: ForgeSpec): Model {
  const materials = [mat("Walls", s.colors.primary ?? "#D8CBB0", 0.85, "Brick"), mat("Roof", "#8E3B2E", 0.7, "Slate"), mat("Wood", "#6B4527", 0.8, "Wood"), mat("Glass", "#9FC7E0", 0.1, "Glass"), mat("Stone", "#7D7A75", 0.9, "Cobblestone")];
  const parts: Part[] = [], W = 12, D = 10, H = 6;
  parts.push(box("Foundation", "Stone", [0, 0.4, 0], [W + 0.8, 0.8, D + 0.8]), box("Walls", "Walls", [0, 0.8 + H / 2, 0], [W, H, D]));
  parts.push(extrude("Roof", "Roof", [[-W / 2 - 0.8, 0], [W / 2 + 0.8, 0], [0, 4.2]], D + 1.2, ([x, y, z]) => [x, 0.8 + H + y, z]));
  parts.push(box("Chimney", "Stone", [W * 0.25, 0.8 + H + 3.2, -D * 0.15], [1.1, 3.4, 1.1]));
  parts.push(box("Door", "Wood", [0, 0.8 + 1.6, D / 2 + 0.06], [1.8, 3.2, 0.14]));
  const win = s.detail >= 2 ? [[-3.6, 3.5], [3.6, 3.5]] : [[-3.6, 3.5]];
  for (const [x, y] of win) { parts.push(box(`WindowFrame_${x}`, "Wood", [x, y, D / 2 + 0.05], [2.0, 1.8, 0.12]), box(`Window_${x}`, "Glass", [x, y, D / 2 + 0.12], [1.6, 1.4, 0.06])); }
  if (s.detail >= 2) for (const z of [-2.5, 2.5]) { parts.push(box(`SideWindowFrame_${z}`, "Wood", [W / 2 + 0.05, 3.5, z], [0.12, 1.8, 2.0]), box(`SideWindow_${z}`, "Glass", [W / 2 + 0.12, 3.5, z], [0.06, 1.4, 1.6])); }
  if (s.detail >= 3) { parts.push(box("PorchRoof", "Wood", [0, 4.6, D / 2 + 1.2], [4.2, 0.2, 2.4]), cylinder("PorchPost_L", "Wood", [-1.9, 0.8, D / 2 + 2.2], [-1.9, 4.5, D / 2 + 2.2], 0.14), cylinder("PorchPost_R", "Wood", [1.9, 0.8, D / 2 + 2.2], [1.9, 4.5, D / 2 + 2.2], 0.14)); }
  return scaleTo({ name: s.name, parts, materials }, s.size, W + 1.6);
}
function tower(s: ForgeSpec): Model {
  const materials = [mat("Stone", s.colors.primary ?? "#8D8A84", 0.9, "Cobblestone"), mat("Roof", "#3E4C7A", 0.6, "Slate"), mat("Wood", "#5C3B22", 0.8, "Wood")];
  const seg = [10, 16, 24][s.detail - 1], parts: Part[] = [];
  parts.push(cylinder("Base", "Stone", [0, 0, 0], [0, 1.2, 0], 5.4, 5.2, seg), cylinder("Shaft", "Stone", [0, 1.2, 0], [0, 17, 0], 4.6, 4.2, seg), cylinder("Parapet", "Stone", [0, 17, 0], [0, 18.2, 0], 5.0, 5.0, seg));
  const merlons = s.detail >= 2 ? 12 : 8;
  for (let i = 0; i < merlons; i++) { const a = (i / merlons) * Math.PI * 2; parts.push(box(`Merlon_${i}`, "Stone", [Math.cos(a) * 4.6, 18.8, Math.sin(a) * 4.6], [1.2, 1.2, 0.9], -a + Math.PI / 2)); }
  parts.push(cone("Spire", "Roof", [0, 18.2, 0], [0, 26, 0], 3.9, seg));
  parts.push(box("Door", "Wood", [0, 2.6, 4.45], [2, 3.6, 0.4]));
  for (let i = 0; i < 3; i++) parts.push(box(`Slit_${i}`, "Wood", [0, 6 + i * 3.6, 4.25], [0.5, 1.6, 0.3]));
  return scaleTo({ name: s.name, parts, materials }, s.size, 26);
}
function car(s: ForgeSpec): Model {
  const truck = s.variant === "truck", seg = [10, 16, 24][s.detail - 1];
  const materials = [mat("Paint", s.colors.primary ?? (truck ? "#2F5FB3" : "#B3262E"), 0.3, "SmoothPlastic", 0.4), mat("Glass", "#1E2A33", 0.05, "Glass"), mat("Tire", "#151515", 0.95, "Rubber"), mat("Rim", "#B8BEC6", 0.25, "Metal", 0.9), mat("Light", "#FFF2C4", 0.1, "Neon"), mat("Trim", "#202024", 0.6)];
  const parts: Part[] = [], L = truck ? 13 : 11, Wd = 5;
  parts.push(box("Chassis", "Trim", [0, 1.2, 0], [Wd - 0.4, 0.6, L - 0.6]), box("Body", "Paint", [0, 2.1, 0], [Wd, 1.4, L]));
  const cab: [number, number][] = truck ? [[-1.6, 0], [3.4, 0], [3.4, 2.2], [-1.0, 2.2]] : [[-3.4, 0], [2.4, 0], [1.4, 1.7], [-2.6, 1.7]];
  parts.push(extrude("Cabin", "Glass", cab, Wd - 0.5, ([x, y, z]) => [z, 2.8 + y, x + (truck ? 2.4 : 0)]));
  if (truck) parts.push(box("CargoBed", "Paint", [0, 3.4, -2.6], [Wd, 1.2, 6.6]));
  for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const cx = x * (Wd / 2 - 0.1), cz = z * (L / 2 - 2.0);
    parts.push(cylinder(`Tire_${x}${z}`, "Tire", [cx - 0.45 * x, 1.1, cz], [cx + 0.45 * x, 1.1, cz], 1.1, 1.1, seg));
    parts.push(cylinder(`Rim_${x}${z}`, "Rim", [cx + 0.45 * x, 1.1, cz], [cx + 0.55 * x, 1.1, cz], 0.6, 0.6, seg));
  }
  for (const x of [-1.6, 1.6]) { parts.push(box(`Headlight_${x}`, "Light", [x, 2.3, L / 2 + 0.03], [0.9, 0.4, 0.1]), box(`Taillight_${x}`, "Light", [x, 2.3, -L / 2 - 0.03], [0.8, 0.3, 0.1])); }
  return scaleTo({ name: s.name, parts, materials }, s.size, L);
}
function tree(s: ForgeSpec): Model {
  const R = rng(s.seed), pine = s.variant === "pine", seg = [6, 10, 14][s.detail - 1];
  const materials = [mat("Bark", "#5B3A22", 0.95, "Wood"), mat("Leaves", s.colors.primary ?? (pine ? "#1F5E3A" : "#3F8F3A"), 0.9, "Grass")];
  const parts: Part[] = [];
  const trunk = catmull([[0, 0, 0], [R() - 0.5, 4, R() - 0.5], [(R() - 0.5) * 1.5, 9, (R() - 0.5) * 1.5], [(R() - 0.5), pine ? 16 : 12, (R() - 0.5)]], 12);
  parts.push(sweep("Trunk", "Bark", trunk, (t) => lerp(1.1, 0.35, t), { seg }));
  if (pine) for (let i = 0; i < 4 + s.detail; i++) { const y = 4.5 + i * 2.6, r = lerp(5.2, 1.6, i / (3 + s.detail)); parts.push(cone(`Tier_${i}`, "Leaves", [0, y, 0], [0, y + 4.2, 0], r, seg + 2)); }
  else {
    const top = trunk[trunk.length - 1];
    for (let i = 0; i < 3 + s.detail * 2; i++) {
      const c: V3 = [top[0] + (R() - 0.5) * 6, top[1] + (R() - 0.3) * 3.5, top[2] + (R() - 0.5) * 6], r = 2.6 + R() * 1.6;
      parts.push(ellipsoid(`Canopy_${i}`, "Leaves", c, [r, r * 0.85, r], { seg, rings: Math.max(5, seg - 3), noise: (d) => Math.sin(d[0] * 5 + s.seed) * Math.cos(d[2] * 4) * 0.12 }));
    }
    for (let b = 0; b < 2 + s.detail; b++) { const a = R() * Math.PI * 2, y = 6 + R() * 4; parts.push(sweep(`Branch_${b}`, "Bark", catmull([[0, y, 0], [Math.cos(a) * 2, y + 1.6, Math.sin(a) * 2], [Math.cos(a) * 3.8, y + 2.6, Math.sin(a) * 3.8]], 6), (t) => lerp(0.4, 0.12, t), { seg: 6 })); }
  }
  return scaleTo({ name: s.name, parts, materials }, s.size, pine ? 20 : 18);
}
function fromMeshgen(s: ForgeSpec, type: "rock" | "crystal", material: Material): Model {
  const m = generateMesh(type, { seed: s.seed % 100000, detail: s.detail + (type === "rock" ? 1 : 0), size: [4, 4, 4], count: 3 + s.detail * 2 } as never);
  const part: Part = { name: type === "rock" ? "Rock" : "Crystals", material: material.name, positions: m.positions.map((p) => [p[0], p[1], p[2]] as V3), uvs: m.uvs.map((u) => [u[0], u[1]] as [number, number]), tris: m.triangles.map((t) => [t[0], t[1], t[2]] as [number, number, number]) };
  return scaleTo({ name: s.name, parts: [part], materials: [material] }, s.size, 0);
}
function chest(s: ForgeSpec): Model {
  const crate = s.variant === "crate";
  const materials = [mat("Wood", s.colors.primary ?? "#7A5230", 0.85, "Wood"), mat("Metal", "#B8902F", 0.35, "Metal", 0.8)];
  const parts: Part[] = [box("Base", "Wood", [0, 1.1, 0], [4, 2.2, 2.6])];
  if (crate) { for (const y of [0.2, 2.0]) for (const z of [-1.32, 1.32]) parts.push(box(`Plank_${y}_${z}`, "Wood", [0, y, z], [4.1, 0.3, 0.12])); }
  else {
    parts.push(sweep("Lid", "Wood", [[-2, 2.2, 0], [2, 2.2, 0]], () => [1.3, 0.9], { seg: [8, 12, 16][s.detail - 1], shape: (a) => [Math.cos(a), Math.max(0, Math.sin(a))] }));
    for (const x of [-1.4, 1.4]) parts.push(box(`Band_${x}`, "Metal", [x, 1.1, 0], [0.3, 2.3, 2.7]));
    parts.push(box("Lock", "Metal", [0, 1.9, 1.38], [0.6, 0.7, 0.16]));
  }
  return scaleTo({ name: s.name, parts, materials }, s.size, 4);
}
function barrel(s: ForgeSpec): Model {
  const seg = [10, 16, 24][s.detail - 1], materials = [mat("Wood", s.colors.primary ?? "#7A5230", 0.85, "Wood"), mat("Metal", "#55585E", 0.45, "Metal", 0.8)];
  const path: V3[] = Array.from({ length: 9 }, (_, i) => [0, i * 0.5, 0] as V3);
  const parts: Part[] = [sweep("Staves", "Wood", path, (t) => 1.25 + Math.sin(t * Math.PI) * 0.3, { seg })];
  for (const t of [0.12, 0.88]) parts.push(cylinder(`Hoop_${t}`, "Metal", [0, t * 4 - 0.12, 0], [0, t * 4 + 0.12, 0], 1.25 + Math.sin(t * Math.PI) * 0.3 + 0.05, undefined, seg));
  return scaleTo({ name: s.name, parts, materials }, s.size, 4);
}
function scaleTo(m: Model, target: number, design: number): Model {
  groundAndCenter(m);
  const all = m.parts.flatMap((p) => p.positions);
  const ext = Math.max(...[0, 1, 2].map((k) => Math.max(...all.map((v) => v[k])) - Math.min(...all.map((v) => v[k]))));
  const k = target / (ext || design || 1);
  for (const p of m.parts) p.positions = p.positions.map((v) => vec.mul(v, k));
  return m;
}
export function buildModel(spec: ForgeSpec): Model {
  switch (spec.recipe) {
    case "dragon": return dragon(spec);
    case "sword": return sword(spec);
    case "house": return house(spec);
    case "castle_tower": return tower(spec);
    case "car": return car(spec);
    case "tree": return tree(spec);
    case "rock": return fromMeshgen(spec, "rock", mat("Rock", spec.colors.primary ?? "#7D7A75", 0.95, "Rock"));
    case "crystal": return fromMeshgen(spec, "crystal", mat("Crystal", spec.colors.primary ?? "#6B3FA0", 0.15, "Glass"));
    case "chest": return chest(spec);
    case "barrel": return barrel(spec);
  }
}
export { mirrorX, transformPart, rotY };
