/**
 * Brickwire icon set — vector icons built only from GUI primitives (Frames + UICorner + UIStroke + TextLabel),
 * so they work in Roblox without uploading images. Single source of truth: the Luau renderer (BW.icon) and the
 * panel's SVG previews are both generated from this data.
 *
 * Coordinates are on a 100×100 grid. Shapes:
 *   ["c", cx, cy, r, color]                      circle
 *   ["r", cx, cy, w, h, color, rot?, radius?]     rectangle centred at (cx,cy), rotated clockwise by rot°
 *   ["o", cx, cy, r, thickness, color]            ring (outline circle)
 *   ["t", cx, cy, w, h, color, text]              bold text glyph
 * Color "a" = the icon's main colour (overridable with {Color=}), "w" = white, otherwise hex.
 */
export type IconShape =
  | ["c", number, number, number, string]
  | ["r", number, number, number, number, string, number?, number?]
  | ["o", number, number, number, number, string]
  | ["t", number, number, number, number, string, string];

export interface IconDef { color: string; shapes: IconShape[]; tags: string }

const W = "#FFFFFF";
const D = "#263238";

export const ICONS: Record<string, IconDef> = {
  coin: { color: "#F9A825", tags: "money currency gold cash", shapes: [["c", 50, 50, 46, "a"], ["c", 50, 50, 37, "#FFD54F"], ["t", 50, 52, 50, 60, "#F57F17", "$"]] },
  gem: { color: "#26C6DA", tags: "diamond crystal premium robux", shapes: [["r", 50, 50, 56, 56, "a", 45, 6], ["r", 40, 40, 20, 20, "#B2EBF2", 45, 3]] },
  heart: { color: "#E53935", tags: "health life love hp", shapes: [["c", 34, 40, 20, "a"], ["c", 66, 40, 20, "a"], ["r", 50, 56, 42, 42, "a", 45, 4], ["c", 30, 36, 6, "#FFCDD2"]] },
  star: { color: "#FFC107", tags: "favorite rating xp level", shapes: [["t", 50, 52, 100, 100, "a", "★"]] },
  bolt: { color: "#FFB300", tags: "energy power speed lightning", shapes: [["r", 58, 30, 16, 46, "a", 25, 2], ["r", 42, 70, 16, 46, "a", 25, 2], ["r", 50, 50, 44, 13, "a", -20, 2]] },
  shield: { color: "#1E88E5", tags: "defense armor protection", shapes: [["r", 50, 38, 60, 44, "a", 0, 8], ["r", 50, 60, 42, 42, "a", 45, 5], ["r", 50, 50, 10, 56, "#90CAF9", 0, 3]] },
  sword: { color: "#B0BEC5", tags: "weapon attack combat damage", shapes: [["r", 50, 38, 11, 58, "a", 0, 4], ["r", 50, 70, 38, 8, "#8D6E63", 0, 3], ["r", 50, 82, 8, 16, "#5D4037", 0, 2], ["c", 50, 93, 6, "#FFC107"]] },
  trophy: { color: "#FFC107", tags: "win award leaderboard first", shapes: [["o", 25, 34, 11, 6, "a"], ["o", 75, 34, 11, 6, "a"], ["r", 50, 34, 44, 40, "a", 0, 14], ["r", 50, 62, 10, 18, "a"], ["r", 50, 82, 40, 10, "#8D6E63", 0, 3]] },
  crown: { color: "#FFC107", tags: "vip king premium rank", shapes: [["r", 22, 52, 20, 20, "a", 45, 2], ["r", 50, 44, 22, 22, "a", 45, 2], ["r", 78, 52, 20, 20, "a", 45, 2], ["r", 50, 68, 66, 22, "a", 0, 3], ["c", 50, 68, 5, "#E53935"], ["c", 30, 68, 4, "#1E88E5"], ["c", 70, 68, 4, "#1E88E5"]] },
  gear: { color: "#78909C", tags: "settings options config", shapes: [["r", 50, 50, 16, 86, "a", 0, 3], ["r", 50, 50, 16, 86, "a", 45, 3], ["r", 50, 50, 16, 86, "a", 90, 3], ["r", 50, 50, 16, 86, "a", 135, 3], ["c", 50, 50, 30, "a"], ["c", 50, 50, 12, W]] },
  cart: { color: "#43A047", tags: "shop store buy purchase", shapes: [["r", 18, 26, 22, 7, "a", 20, 3], ["r", 54, 46, 56, 30, "a", 0, 5], ["r", 54, 66, 50, 6, "a", 0, 3], ["c", 36, 80, 8, D], ["c", 70, 80, 8, D]] },
  bag: { color: "#8D6E63", tags: "inventory backpack items", shapes: [["o", 50, 30, 16, 6, "a"], ["r", 50, 62, 64, 52, "a", 0, 12], ["r", 50, 54, 64, 6, "#6D4C41"]] },
  lock: { color: "#FFA000", tags: "locked secure closed", shapes: [["o", 50, 38, 18, 7, "#90A4AE"], ["r", 50, 64, 58, 42, "a", 0, 7], ["c", 50, 60, 6, D], ["r", 50, 70, 4, 12, D]] },
  check: { color: "#43A047", tags: "ok done yes confirm", shapes: [["r", 35, 62, 13, 32, "a", -45, 4], ["r", 61, 50, 13, 60, "a", 45, 4]] },
  close: { color: "#E53935", tags: "x cancel no exit", shapes: [["r", 50, 50, 13, 76, "a", 45, 4], ["r", 50, 50, 13, 76, "a", -45, 4]] },
  plus: { color: "#43A047", tags: "add more increase", shapes: [["r", 50, 50, 15, 70, "a", 0, 4], ["r", 50, 50, 70, 15, "a", 0, 4]] },
  minus: { color: "#E53935", tags: "remove less decrease", shapes: [["r", 50, 50, 70, 15, "a", 0, 4]] },
  play: { color: "#43A047", tags: "start go resume", shapes: [["c", 50, 50, 46, "a"], ["t", 54, 50, 60, 60, W, "▶"]] },
  pause: { color: "#546E7A", tags: "stop wait", shapes: [["r", 36, 50, 15, 60, "a", 0, 4], ["r", 64, 50, 15, 60, "a", 0, 4]] },
  home: { color: "#5C6BC0", tags: "house lobby menu", shapes: [["r", 50, 42, 48, 48, "a", 45, 4], ["r", 50, 66, 54, 36, "a", 0, 4], ["r", 50, 74, 14, 20, W, 0, 3]] },
  user: { color: "#5C6BC0", tags: "player profile account avatar", shapes: [["c", 50, 32, 17, "a"], ["r", 50, 76, 60, 38, "a", 0, 18]] },
  info: { color: "#1E88E5", tags: "help about information", shapes: [["c", 50, 50, 46, "a"], ["t", 50, 52, 50, 70, W, "i"]] },
  warning: { color: "#FFB300", tags: "alert caution danger", shapes: [["r", 50, 52, 62, 62, "a", 45, 9], ["t", 50, 52, 40, 60, D, "!"]] },
  music: { color: "#AB47BC", tags: "sound audio song", shapes: [["r", 42, 44, 6, 60, "a"], ["r", 78, 38, 6, 60, "a"], ["r", 60, 15, 42, 10, "a", -10, 2], ["c", 33, 74, 12, "a"], ["c", 69, 68, 12, "a"]] },
  map: { color: "#66BB6A", tags: "world location quest travel", shapes: [["r", 50, 50, 78, 64, "#C8E6C9", 0, 5], ["r", 36, 56, 40, 7, "#8D6E63", 25, 3], ["r", 62, 46, 30, 7, "#8D6E63", -20, 3], ["c", 70, 36, 11, "#E53935"], ["c", 70, 36, 4, W]] },
  clock: { color: "#5C6BC0", tags: "time timer countdown", shapes: [["c", 50, 50, 46, "a"], ["c", 50, 50, 38, W], ["r", 50, 38, 6, 26, D, 0, 3], ["r", 60, 50, 22, 6, D, 0, 3], ["c", 50, 50, 5, D]] },
  gift: { color: "#E53935", tags: "reward daily present bonus", shapes: [["c", 39, 22, 10, "#FFC107"], ["c", 61, 22, 10, "#FFC107"], ["r", 50, 62, 64, 44, "a", 0, 4], ["r", 50, 36, 74, 14, "a", 0, 3], ["r", 50, 57, 11, 56, "#FFC107"]] },
  key: { color: "#FFC107", tags: "unlock door access", shapes: [["o", 28, 50, 16, 8, "a"], ["r", 62, 50, 46, 10, "a", 0, 2], ["r", 76, 61, 7, 14, "a"], ["r", 87, 61, 7, 14, "a"]] },
  potion: { color: "#8E24AA", tags: "magic boost buff drink", shapes: [["r", 50, 14, 22, 9, "#8D6E63", 0, 2], ["r", 50, 30, 16, 26, "#B39DDB", 0, 3], ["c", 50, 64, 29, "a"], ["c", 41, 57, 7, "#E1BEE7"]] },
  flame: { color: "#FF7043", tags: "fire hot streak burn", shapes: [["r", 50, 44, 38, 38, "a", 45, 8], ["c", 50, 64, 27, "a"], ["c", 50, 70, 14, "#FFCA28"]] },
  trash: { color: "#78909C", tags: "delete remove bin", shapes: [["r", 50, 22, 62, 9, "a", 0, 3], ["r", 50, 15, 20, 8, "a", 0, 2], ["r", 50, 60, 50, 56, "a", 0, 5], ["r", 38, 60, 5, 40, W], ["r", 62, 60, 5, 40, W]] },
  rocket: { color: "#ECEFF1", tags: "launch boost upgrade speed", shapes: [["r", 32, 66, 18, 18, "#E53935", 45, 3], ["r", 68, 66, 18, 18, "#E53935", 45, 3], ["r", 50, 48, 26, 56, "a", 0, 13], ["c", 50, 40, 7, "#29B6F6"], ["r", 50, 84, 12, 12, "#FF9800", 45, 3]] },
};

export const ICON_IDS = Object.keys(ICONS);

/** Luau table literal for BW._iconData (generated into the library prelude). */
export function iconsToLuau(): string {
  const q = (s: string) => JSON.stringify(s);
  const rows = ICON_IDS.map((id) => {
    const d = ICONS[id];
    const shapes = d.shapes.map((s) => "{" + s.map((v) => (typeof v === "string" ? q(v) : String(v))).join(",") + "}").join(",");
    return `${id}={color=${q(d.color)},shapes={${shapes}}}`;
  });
  return "BW._iconData = {" + rows.join(",") + "}";
}

/** SVG markup for an icon (panel previews). */
export function iconSvg(id: string, size = 48, color?: string): string {
  const d = ICONS[id];
  if (!d) return "";
  const col = (c: string) => (c === "a" ? color ?? d.color : c === "w" ? W : c);
  const parts = d.shapes.map((s) => {
    if (s[0] === "c") return `<circle cx="${s[1]}" cy="${s[2]}" r="${s[3]}" fill="${col(s[4])}"/>`;
    if (s[0] === "o") return `<circle cx="${s[1]}" cy="${s[2]}" r="${s[3] - s[4] / 2}" fill="none" stroke="${col(s[5])}" stroke-width="${s[4]}"/>`;
    if (s[0] === "r") {
      const [, cx, cy, w, h, c, rot = 0, rad = 0] = s;
      return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${rad}" fill="${col(c)}" transform="rotate(${rot} ${cx} ${cy})"/>`;
    }
    const [, cx, cy, , h, c, text] = s;
    return `<text x="${cx}" y="${cy}" font-size="${h * 0.8}" font-weight="700" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="central" fill="${col(c)}">${text}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${parts.join("")}</svg>`;
}
