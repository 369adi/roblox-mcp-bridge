/**
 * M8: post-processing for GFX/thumbnails, pure TypeScript (no native deps, works without any API key).
 * exact crop (1920x1080 / 512x512), sharpen (unsharp 3x3), saturation, vignette, outlined bitmap text.
 */
import { type RGBA, fit, blank } from "./imaging.js";

export const GFX_SIZES = { thumbnail: [1920, 1080], icon: [512, 512] } as const;
export type GfxSize = keyof typeof GFX_SIZES;

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export function exactSize(img: RGBA, size: GfxSize): RGBA {
  const [w, h] = GFX_SIZES[size];
  return fit(img, w, h);
}

/** amount 0..2 ; 3x3 unsharp mask. */
export function sharpen(img: RGBA, amount = 0.6): RGBA {
  if (amount <= 0) return img;
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(data);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) {
      const blur = (data[i - 4 + c] + data[i + 4 + c] + data[i - w * 4 + c] + data[i + w * 4 + c]) / 4;
      out[i + c] = clamp(data[i + c] + amount * (data[i + c] - blur));
    }
  }
  return { width: w, height: h, data: out };
}

/** factor 1 = unchanged, >1 more saturated, 0 = grayscale. */
export function saturation(img: RGBA, factor = 1.2): RGBA {
  const out = new Uint8Array(img.data);
  for (let i = 0; i < out.length; i += 4) {
    const l = 0.299 * out[i] + 0.587 * out[i + 1] + 0.114 * out[i + 2];
    for (let c = 0; c < 3; c++) out[i + c] = clamp(l + (out[i + c] - l) * factor);
  }
  return { width: img.width, height: img.height, data: out };
}

/** strength 0..1 darkening at the corners. */
export function vignette(img: RGBA, strength = 0.35): RGBA {
  const { width: w, height: h } = img;
  const out = new Uint8Array(img.data);
  const cx = w / 2, cy = h / 2, maxD = Math.hypot(cx, cy);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot(x - cx, y - cy) / maxD;
    const k = 1 - strength * Math.pow(Math.max(0, (d - 0.45) / 0.55), 1.6);
    const i = (y * w + x) * 4;
    out[i] = clamp(out[i] * k); out[i + 1] = clamp(out[i + 1] * k); out[i + 2] = clamp(out[i + 2] * k);
  }
  return { width: w, height: h, data: out };
}

// 5x7 bitmap font (uppercase, digits, a few symbols). Each glyph = 7 rows of 5 bits.
const F: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14], "1": [4, 12, 4, 4, 4, 4, 14], "2": [14, 17, 1, 2, 4, 8, 31], "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2], "5": [31, 16, 30, 1, 1, 17, 14], "6": [6, 8, 16, 30, 17, 17, 14], "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14], "9": [14, 17, 17, 15, 1, 2, 12],
  "+": [0, 4, 4, 31, 4, 4, 0], "-": [0, 0, 0, 31, 0, 0, 0], "!": [4, 4, 4, 4, 4, 0, 4], "?": [14, 17, 1, 2, 4, 0, 4],
  ".": [0, 0, 0, 0, 0, 0, 4], ",": [0, 0, 0, 0, 4, 4, 8], ":": [0, 4, 0, 0, 0, 4, 0], "'": [4, 4, 8, 0, 0, 0, 0],
  "$": [4, 15, 20, 14, 5, 30, 4], "%": [24, 25, 2, 4, 8, 19, 3], "&": [12, 18, 20, 8, 21, 18, 13], " ": [0, 0, 0, 0, 0, 0, 0],
};
export const FONT_CHARS = Object.keys(F).join("");

export interface TextOpts { x: number; y: number; scale: number; color?: [number, number, number]; outline?: [number, number, number]; outlinePx?: number; align?: "left" | "center" }

export function measureText(text: string, scale: number): { width: number; height: number } {
  const lines = text.toUpperCase().split("\n");
  const longest = Math.max(...lines.map((l) => l.length));
  return { width: Math.max(0, longest * 6 - 1) * scale, height: (lines.length * 9 - 2) * scale };
}

/** Draws text with an outline (glyph cells dilated by outlinePx). Unknown chars render as '?'. Returns a new image. */
export function drawText(img: RGBA, text: string, o: TextOpts): RGBA {
  const out: RGBA = { width: img.width, height: img.height, data: new Uint8Array(img.data) };
  const color = o.color ?? [255, 255, 255], outline = o.outline ?? [0, 0, 0];
  const ol = Math.max(0, Math.round(o.outlinePx ?? Math.max(2, o.scale * 0.6)));
  const lines = text.toUpperCase().split("\n");
  const fill = (x0: number, y0: number, w: number, h: number, c: readonly number[]) => {
    for (let y = Math.max(0, y0); y < Math.min(out.height, y0 + h); y++) for (let x = Math.max(0, x0); x < Math.min(out.width, x0 + w); x++) {
      const i = (y * out.width + x) * 4; out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
    }
  };
  for (const pass of [0, 1]) {
    lines.forEach((line, li) => {
      const lw = Math.max(0, line.length * 6 - 1) * o.scale;
      const lx = o.align === "center" ? Math.round(o.x - lw / 2) : o.x;
      const ly = o.y + li * 9 * o.scale;
      [...line].forEach((ch, ci) => {
        const g = F[ch] ?? F["?"];
        for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) if (g[r] & (16 >> c)) {
          const px = lx + (ci * 6 + c) * o.scale, py = ly + r * o.scale;
          if (pass === 0) fill(px - ol, py - ol, o.scale + ol * 2, o.scale + ol * 2, outline);
          else fill(px, py, o.scale, o.scale, color);
        }
      });
    });
  }
  return out;
}

export interface PostOptions { size?: GfxSize; sharpen?: number; saturation?: number; vignette?: number; text?: Omit<TextOpts, "x" | "y" | "scale"> & { value: string; position?: "top" | "left" | "bottom"; scale?: number } }

/** Full pipeline: exact size → saturation → sharpen → vignette → text. Text auto-scales to stay ≥ 18 px tall at 480x270. */
export function postProcess(src: RGBA, o: PostOptions = {}): { image: RGBA; textPxAt480: number | null } {
  let img = exactSize(src, o.size ?? "thumbnail");
  if (o.saturation !== undefined && o.saturation !== 1) img = saturation(img, o.saturation);
  if (o.sharpen) img = sharpen(img, o.sharpen);
  if (o.vignette) img = vignette(img, o.vignette);
  let textPxAt480: number | null = null;
  if (o.text?.value) {
    const minScale = Math.ceil((18 / 7) * (img.width / 480)); // glyph cap height 7 cells
    let scale = Math.max(minScale, o.text.scale ?? Math.round(img.width / 110));
    let m = measureText(o.text.value, scale);
    while (m.width > img.width * 0.92 && scale > minScale) { scale--; m = measureText(o.text.value, scale); }
    const pos = o.text.position ?? "top";
    const x = pos === "left" ? Math.round(img.width * 0.05) : Math.round(img.width / 2);
    const y = pos === "bottom" ? img.height - m.height - Math.round(img.height * 0.06) : pos === "left" ? Math.round((img.height - m.height) / 2) : Math.round(img.height * 0.06);
    img = drawText(img, o.text.value, { ...o.text, x, y, scale, align: pos === "left" ? "left" : "center" });
    textPxAt480 = (7 * scale * 480) / img.width;
  }
  return { image: img, textPxAt480 };
}

export { blank };
