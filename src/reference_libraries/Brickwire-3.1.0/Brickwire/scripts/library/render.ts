/**
 * DEV ONLY — renders kit dumps (instance trees from the Luau stub) into small SVG previews for the panel's Library.
 * 3D kits → isometric view (painter's order via AABB separation + topological sort); UI kits → 1366×768 screen mock;
 * script-only systems → info card. Output is approximate by design (it's a preview, not Studio).
 */
import { iconSvg } from "../../shared/src/library/icons.ts";

export interface DumpNode { c: string; n: string; p: Record<string, any>; a: Record<string, any>; k: DumpNode[] }
export interface KitDump { id: string; root?: DumpNode; scripts?: { path: string; class: string; source: string }[]; error?: string }

type V3 = [number, number, number];
type M3 = number[]; // row-major 3x3

const PART_CLASSES = new Set(["Part", "SpawnLocation", "Seat", "VehicleSeat", "WedgePart", "CornerWedgePart", "TrussPart", "MeshPart", "UnionOperation"]);
const GUI_CLASSES = new Set(["Frame", "TextLabel", "TextButton", "TextBox", "ImageLabel", "ImageButton", "ScrollingFrame", "CanvasGroup", "ViewportFrame"]);

const r1 = (n: number) => Math.round(n * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function hexToRgb(h: string): V3 {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
  if (!m) return [163, 162, 165];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: V3): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([r * k, g * k, b * k]);
}
function mix(hex: string, to: string, t: number): string {
  const a = hexToRgb(hex), b = hexToRgb(to);
  return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
}

// ------------------------------------------------------------------ rotation math (Roblox conventions)
const mul = (a: M3, b: M3): M3 => {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
};
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const rx = (a: number): M3 => [1, 0, 0, 0, Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a)];
const ry = (a: number): M3 => [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)];
const rz = (a: number): M3 => [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1];
const apply = (m: M3, v: V3): V3 => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
const D = Math.PI / 180;

// ------------------------------------------------------------------ 3D
interface Solid { faces: { pts: V3[]; n: V3 }[]; color: string; opacity: number; neon: boolean; lo: V3; hi: V3; ball?: { c: V3; r: number } }
interface Glow { at: V3; color: string; r: number }
interface Dot { at: V3; color: string; r: number }

const VIEW: V3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
const LIGHT: V3 = (() => { const l: V3 = [0.3, 1, 0.6]; const n = Math.hypot(...l); return [l[0] / n, l[1] / n, l[2] / n]; })();
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const proj = (p: V3): [number, number] => [(p[0] - p[2]) * 0.7071, (p[0] - 2 * p[1] + p[2]) * 0.4082];

function partTransform(p: Record<string, any>): { pos: V3; rot: M3 } {
  let pos: V3 = p.Position ?? [0, 0, 0];
  let rot = I3;
  if (p.Orientation) {
    const [ox, oy, oz] = p.Orientation as V3;
    rot = mul(mul(ry(oy * D), rx(ox * D)), rz(oz * D));
  } else if (p.CFrame && (p.CFrame.r?.length || !p.Position)) {
    pos = p.CFrame.p;
    for (const r of p.CFrame.r ?? []) rot = mul(rot, mul(mul(rx(r[0]), ry(r[1])), rz(r[2])));
  }
  return { pos, rot };
}

function localShape(cls: string, shape: string, s: V3): { verts: V3[]; faces: number[][] } | "ball" {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  if (shape === "Ball") return "ball";
  if (cls === "WedgePart" || cls === "CornerWedgePart") {
    const verts: V3[] = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz]];
    return { verts, faces: [[0, 1, 2, 3], [3, 2, 5, 4], [0, 3, 4], [1, 5, 2], [0, 4, 5, 1]] };
  }
  if (shape === "Cylinder") {
    const r = Math.min(s[1], s[2]) / 2, n = 16, verts: V3[] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; verts.push([-hx, Math.cos(a) * r, Math.sin(a) * r]); }
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; verts.push([hx, Math.cos(a) * r, Math.sin(a) * r]); }
    const faces: number[][] = [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i)];
    for (let i = 0; i < n; i++) faces.push([i, (i + 1) % n, n + ((i + 1) % n), n + i]);
    return { verts, faces };
  }
  const verts: V3[] = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
  return { verts, faces: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [3, 7, 6, 2], [0, 1, 5, 4]] };
}

function faceNormal(pts: V3[], center: V3): V3 {
  const [a, b, c] = pts;
  const u: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n: V3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const l = Math.hypot(...n) || 1;
  n = [n[0] / l, n[1] / l, n[2] / l];
  const fc = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length] as V3, [0, 0, 0] as V3);
  if (dot(n, [fc[0] - center[0], fc[1] - center[1], fc[2] - center[2]]) < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}

function collect3d(root: DumpNode) {
  const solids: Solid[] = [], glows: Glow[] = [], dots: Dot[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const addBox = (lo: V3, hi: V3, color: string) => {
    const c: V3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    addSolid("Part", "Block", [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], c, I3, color, 1, false);
  };
  const addSolid = (cls: string, shape: string, size: V3, pos: V3, rot: M3, color: string, opacity: number, neon: boolean) => {
    const ls = localShape(cls, shape, size);
    if (ls === "ball") {
      const r = Math.min(...size) / 2;
      solids.push({ faces: [], color, opacity, neon, lo: [pos[0] - r, pos[1] - r, pos[2] - r], hi: [pos[0] + r, pos[1] + r, pos[2] + r], ball: { c: pos, r } });
      return;
    }
    const wv = ls.verts.map((v) => { const w = apply(rot, v); return [w[0] + pos[0], w[1] + pos[1], w[2] + pos[2]] as V3; });
    const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const v of wv) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], v[i]); hi[i] = Math.max(hi[i], v[i]); }
    const faces = ls.faces.map((f) => { const pts = f.map((i) => wv[i]); return { pts, n: faceNormal(pts, pos) }; });
    solids.push({ faces, color, opacity, neon, lo, hi });
  };
  const posOf = (n: DumpNode): V3 | null => (n.p.Position ?? n.p.CFrame?.p ?? null);
  const walk = (n: DumpNode, parentPart: DumpNode | null) => {
    if (n.c === "Model" && n.k.some((k) => k.c === "Humanoid")) {
      const piv: V3 = n.p.__pivot?.p ?? posOf(n.k.find((k) => k.n === "HumanoidRootPart")!) ?? [0, 3, 0];
      const [x, y0, z] = [piv[0], piv[1] - 3, piv[2]];
      addBox([x - 1, y0, z - 0.5], [x - 0.05, y0 + 2, z + 0.5], "#37474F");
      addBox([x + 0.05, y0, z - 0.5], [x + 1, y0 + 2, z + 0.5], "#37474F");
      addBox([x - 1, y0 + 2, z - 0.5], [x + 1, y0 + 4, z + 0.5], "#3F51B5");
      addBox([x - 2, y0 + 2, z - 0.5], [x - 1.05, y0 + 4, z + 0.5], "#F2C9A0");
      addBox([x + 1.05, y0 + 2, z - 0.5], [x + 2, y0 + 4, z + 0.5], "#F2C9A0");
      addBox([x - 0.6, y0 + 4, z - 0.6], [x + 0.6, y0 + 5.2, z + 0.6], "#F2C9A0");
      for (const k of n.k) if (k.c !== "Humanoid" && !PART_CLASSES.has(k.c)) walk(k, null);
      return;
    }
    if (PART_CLASSES.has(n.c)) {
      const t = Number(n.p.Transparency ?? 0);
      const size: V3 = n.p.Size ?? [4, 1, 2];
      if (t < 0.97 && n.n !== "HumanoidRootPart") {
        const { pos, rot } = partTransform(n.p);
        const mat = String(n.p.Material ?? "Plastic");
        let color = n.p.Color ?? "#A3A2A5";
        let op = 1 - t;
        if (mat === "Glass" && t === 0) op = 0.55;
        if (mat === "Neon") color = mix(color, "#FFFFFF", 0.15);
        if (n.c === "TrussPart") op = Math.min(op, 0.6);
        addSolid(n.c, String(n.p.Shape ?? "Block"), size, pos, rot, color, op, mat === "Neon");
      }
      parentPart = n;
      // VFX demo pad: draw a stylised burst of the preset's colours above it
      if (typeof n.a?.BW_FxColors === "string") {
        const cols = String(n.a.BW_FxColors).split(",");
        const at = posOf(n) ?? [0, 0, 0];
        const c: V3 = [at[0], at[1] + 6, at[2]];
        glows.push({ at: c, color: cols[0], r: 9 });
        if (cols[1]) glows.push({ at: c, color: cols[1], r: 5 });
        for (let i = 0; i < 46; i++) {
          const a1 = rnd() * Math.PI * 2, a2 = (rnd() - 0.35) * Math.PI;
          const d = 1.5 + rnd() * 4.5;
          const p: V3 = [c[0] + Math.cos(a1) * Math.cos(a2) * d, c[1] + Math.sin(a2) * d, c[2] + Math.sin(a1) * Math.cos(a2) * d];
          dots.push({ at: p, color: cols[i % cols.length], r: 0.25 + rnd() * 0.5 });
        }
        for (let i = 0; i < 18; i++) {
          const a1 = (i / 18) * Math.PI * 2;
          dots.push({ at: [c[0] + Math.cos(a1) * 6.5, at[1] + 1.4, c[2] + Math.sin(a1) * 6.5], color: cols[cols.length > 1 ? 1 : 0], r: 0.35 });
        }
      }
    }
    const host = parentPart;
    if (host && /Light$/.test(n.c) && n.p.Enabled !== false) {
      const at = posOf(host);
      if (at) glows.push({ at, color: n.p.Color ?? "#FFE0A0", r: Math.min(Number(n.p.Range ?? 12), 24) * 0.6 });
    }
    if (host && (n.c === "ParticleEmitter" || n.c === "Fire" || n.c === "Sparkles") && n.p.Enabled !== false) {
      const at = posOf(host);
      const size: V3 = host.p.Size ?? [1, 1, 1];
      if (at) {
        const area = size[0] * size[2];
        const count = Math.max(5, Math.min(40, Math.round(area / 30)));
        const col = typeof n.p.Color === "string" ? n.p.Color : "#FFF5B4";
        for (let i = 0; i < count; i++) {
          const p: V3 = [at[0] + (rnd() - 0.5) * Math.max(2, size[0]), at[1] + rnd() * Math.max(2, Math.min(6, size[1] * 2 + 2)), at[2] + (rnd() - 0.5) * Math.max(2, size[2])];
          dots.push({ at: p, color: col, r: 0.25 + rnd() * 0.35 });
        }
      }
    }
    for (const k of n.k) walk(k, host);
  };
  walk(root, null);
  return { solids, glows, dots };
}

function sortSolids(solids: Solid[]): Solid[] {
  const n = solids.length;
  const sb = solids.map((s) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p: V3 = [i & 1 ? s.hi[0] : s.lo[0], i & 2 ? s.hi[1] : s.lo[1], i & 4 ? s.hi[2] : s.lo[2]];
      const [x, y] = proj(p);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x0, y0, x1, y1, depth: (s.lo[0] + s.hi[0] + s.lo[1] + s.hi[1] + s.lo[2] + s.hi[2]) / 2 };
  });
  const after: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array(n).fill(0);
  const eps = 0.01;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = sb[i], b = sb[j];
    if (a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0) continue;
    const A = solids[i], B = solids[j];
    let first = -1;
    for (let ax = 0; ax < 3 && first < 0; ax++) {
      if (A.hi[ax] <= B.lo[ax] + eps) first = i;
      else if (B.hi[ax] <= A.lo[ax] + eps) first = j;
    }
    if (first < 0) first = a.depth <= b.depth ? i : j;
    const second = first === i ? j : i;
    after[first].push(second);
    indeg[second]++;
  }
  const out: Solid[] = [];
  const done = new Array(n).fill(false);
  const ready = sb.map((_, i) => i).filter((i) => indeg[i] === 0);
  let left = n;
  while (left > 0) {
    let pick: number;
    if (ready.length) {
      ready.sort((x, y) => sb[y].depth - sb[x].depth);
      pick = ready.pop()!;
    } else {
      // cycle: take the farthest remaining
      pick = -1;
      for (let i = 0; i < n; i++) if (!done[i] && (pick < 0 || sb[i].depth < sb[pick].depth)) pick = i;
    }
    if (done[pick]) continue;
    done[pick] = true; left--;
    out.push(solids[pick]);
    for (const k of after[pick]) if (!done[k] && --indeg[k] === 0) ready.push(k);
  }
  return out;
}

export function render3d(root: DumpNode, w = 320, h = 220): string | null {
  const { solids, glows, dots } = collect3d(root);
  if (!solids.length && !dots.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (p: V3, r = 0) => { const [x, y] = proj(p); x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r); };
  for (const s of solids) {
    if (s.ball) ext(s.ball.c, s.ball.r);
    for (const f of s.faces) for (const p of f.pts) ext(p);
  }
  for (const d of dots) ext(d.at, d.r);
  const span = Math.max(x1 - x0, y1 - y0, 1);
  const dotR = Math.min(0.6, span / 70), glowMax = span * 0.3;
  const pad = span * 0.06;
  const sw = r1(span / 500);
  const els: string[] = [];
  for (const s of sortSolids(solids)) {
    const op = s.opacity < 1 ? ` fill-opacity="${r1(s.opacity)}"` : "";
    if (s.ball) {
      const [cx, cy] = proj(s.ball.c);
      els.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(s.ball.r)}" fill="${shade(s.color, 0.92)}"${op}/>`);
      continue;
    }
    const vis = s.faces.filter((f) => dot(f.n, VIEW) > 0.02);
    vis.sort((a, b) => dot(a.n, VIEW) - dot(b.n, VIEW));
    for (const f of vis) {
      const k = s.neon ? 1 : 0.5 + 0.5 * Math.max(0, dot(f.n, LIGHT));
      const fill = shade(s.color, k);
      const pts = f.pts.map((p) => proj(p).map(r1).join(",")).join(" ");
      els.push(`<polygon points="${pts}" fill="${fill}"${op} stroke="${shade(s.color, k * 0.72)}" stroke-width="${sw}" stroke-opacity="${s.opacity < 1 ? 0.3 : 0.55}" stroke-linejoin="round"/>`);
    }
  }
  for (const g of glows) {
    const [cx, cy] = proj(g.at);
    els.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.min(g.r, glowMax))}" fill="url(#gl${g.color.slice(1)})"/>`);
  }
  for (const d of dots) {
    const [cx, cy] = proj(d.at);
    els.push(`<circle cx="${r1(cx)}" cy="${r1(cy)}" r="${r1(Math.max(0.1, d.r * dotR / 0.6))}" fill="${d.color}" fill-opacity="0.8"/>`);
  }
  const grads = [...new Set(glows.map((g) => g.color))].map((c) => `<radialGradient id="gl${c.slice(1)}"><stop offset="0" stop-color="${c}" stop-opacity="0.55"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`).join("");
  const vb = [x0 - pad, y0 - pad, x1 - x0 + pad * 2, y1 - y0 + pad * 2].map(r1).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet">${grads ? `<defs>${grads}</defs>` : ""}${els.join("")}</svg>`;
}

// ------------------------------------------------------------------ GUI
interface Rect { x: number; y: number; w: number; h: number }
const ud = (v: any, i: number): [number, number] => (Array.isArray(v) ? [v[i * 2] ?? 0, v[i * 2 + 1] ?? 0] : [0, 0]);

function guiSize(n: DumpNode, parent: Rect): { w: number; h: number } {
  const s = n.p.Size ?? [0, 100, 0, 100];
  let w = s[0] * parent.w + s[1], h = s[2] * parent.h + s[3];
  for (const k of n.k) {
    if (k.c === "UIAspectRatioConstraint") {
      const a = Number(k.p.AspectRatio ?? 1) || 1;
      if (w / Math.max(h, 0.01) > a) w = h * a; else h = w / a;
    }
    if (k.c === "UISizeConstraint") {
      const mn = k.p.MinSize ?? [0, 0], mx = k.p.MaxSize ?? [Infinity, Infinity];
      w = Math.min(Math.max(w, mn[0]), mx[0] || Infinity); h = Math.min(Math.max(h, mn[1]), mx[1] || Infinity);
    }
  }
  return { w: Math.max(0, w), h: Math.max(0, h) };
}

function contentRect(n: DumpNode, r: Rect): Rect {
  const pad = n.k.find((k) => k.c === "UIPadding");
  if (!pad) return r;
  const g = (key: string, dim: number) => { const v = pad.p[key] ?? [0, 0]; return v[0] * dim + v[1]; };
  const l = g("PaddingLeft", r.w), rr = g("PaddingRight", r.w), t = g("PaddingTop", r.h), b = g("PaddingBottom", r.h);
  return { x: r.x + l, y: r.y + t, w: Math.max(0, r.w - l - rr), h: Math.max(0, r.h - t - b) };
}

const FONTS: [RegExp, string, number, string][] = [
  [/Fredoka|Cartoon|Nunito|PatrickHand/, "'Fredoka One','Arial Rounded MT Bold','Trebuchet MS',Arial,sans-serif", 0.6, "700"],
  [/Luckiest|Bangers|Creepster|DenkOne/, "Impact,'Arial Black',sans-serif", 0.52, "400"],
  [/Michroma|SciFi|Jura|Sarpanch|Titillium/, "Verdana,Arial,sans-serif", 0.72, "700"],
  [/Grenze|Fondamento|Fantasy|Antique|Merriweather|Garamond|Bodoni/, "Georgia,'Times New Roman',serif", 0.6, "700"],
  [/Arcade|Code|Mono|SpecialElite/, "'Courier New',monospace", 0.62, "700"],
  [/Oswald|RobotoCondensed|Highway/, "'Arial Narrow',Impact,Arial,sans-serif", 0.48, "700"],
];
function fontOf(font: string): { family: string; k: number; weight: string } {
  for (const [re, family, k, weight] of FONTS) if (re.test(font)) return { family, k, weight };
  return { family: "Arial, sans-serif", k: 0.58, weight: /Bold|Black|Heavy|SemiBold/.test(font) ? "700" : "400" };
}
type GKey = [number, string];
function lerpHex(a: string, b: string, t: number) { return mix(a, b, Math.max(0, Math.min(1, t))); }
function sampleKeys<T>(keys: [number, T][], t: number, lerp: (a: T, b: T, k: number) => T): T {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) { const [t0, v0] = keys[i - 1], [t1, v1] = keys[i]; return lerp(v0, v1, (t - t0) / Math.max(1e-6, t1 - t0)); }
  return keys[keys.length - 1][1];
}

export function renderGui(root: DumpNode, w = 320, h = 180): string | null {
  const VW = 1366, VH = 768;
  const els: string[] = [];
  const defs: string[] = [];
  let gid = 0;
  const gradFor = (n: DumpNode): string | null => {
    const g = n.k.find((k) => k.c === "UIGradient" && k.p.Enabled !== false);
    if (!g) return null;
    const ck: GKey[] = Array.isArray(g.p.Keys) && g.p.Keys.length ? g.p.Keys : [[0, "#FFFFFF"], [1, "#FFFFFF"]];
    const tk: [number, number][] = Array.isArray(g.p.TKeys) && g.p.TKeys.length ? g.p.TKeys : [[0, 0], [1, 0]];
    const ts = [...new Set([...ck.map((k) => k[0]), ...tk.map((k) => k[0]), 0, 1])].sort((a, b) => a - b);
    const a = (Number(g.p.Rotation ?? 0) * Math.PI) / 180, cx = Math.cos(a) / 2, cy = Math.sin(a) / 2;
    const id = `g${gid++}`;
    const stops = ts.map((t) => `<stop offset="${r1(t)}" stop-color="${sampleKeys(ck, t, lerpHex)}" stop-opacity="${r1(1 - sampleKeys(tk, t, (x, y, k) => x + (y - x) * k))}"/>`).join("");
    defs.push(`<linearGradient id="${id}" x1="${r1(0.5 - cx)}" y1="${r1(0.5 - cy)}" x2="${r1(0.5 + cx)}" y2="${r1(0.5 + cy)}">${stops}</linearGradient>`);
    return `url(#${id})`;
  };
  let shownWindow = false;
  let any = false;
  const visible = (n: DumpNode) => {
    if (n.p.Visible !== false) return true;
    if (n.a.BW_Window && !shownWindow) { shownWindow = true; return true; }
    return false;
  };
  const draw = (n: DumpNode, r: Rect): string => {
    any = true;
    const grad = gradFor(n);
    const bt = Number(n.p.BackgroundTransparency ?? 0);
    const corner = n.k.find((k) => k.c === "UICorner");
    const cr = corner ? Math.min(Math.min(r.w, r.h) / 2, (corner.p.CornerRadius?.[0] ?? 0) * Math.min(r.w, r.h) + (corner.p.CornerRadius?.[1] ?? 8)) : 0;
    const stroke = n.k.find((k) => k.c === "UIStroke");
    const isText = /^Text/.test(n.c);
    const borderStroke = stroke && (!isText || stroke.p.ApplyStrokeMode === "Border");
    const rot = Number(n.p.Rotation ?? 0);
    const tf = rot ? ` transform="rotate(${r1(rot)} ${r1(r.x + r.w / 2)} ${r1(r.y + r.h / 2)})"` : "";
    if (bt < 0.99 || borderStroke) {
      const fill = bt < 0.99 ? `fill="${grad ?? n.p.BackgroundColor3 ?? "#FFFFFF"}"${bt > 0 ? ` fill-opacity="${r1(1 - bt)}"` : ""}` : `fill="none"`;
      const st = borderStroke ? ` stroke="${stroke!.p.Color ?? "#000000"}" stroke-width="${r1(Number(stroke!.p.Thickness ?? 1))}"${stroke!.p.Transparency ? ` stroke-opacity="${r1(1 - stroke!.p.Transparency)}"` : ""}` : "";
      els.push(`<rect x="${r1(r.x)}" y="${r1(r.y)}" width="${r1(r.w)}" height="${r1(r.h)}" rx="${r1(cr)}" ${fill}${st}${tf}/>`);
    }
    if (isText && n.p.Text) {
      const text = String(n.p.Text).replace(/<[^>]+>/g, "");
      const lines = text.split("\n");
      const longest = Math.max(...lines.map((l) => l.length), 1);
      const F = fontOf(String(n.p.Font ?? ""));
      const tsc = n.k.find((k) => k.c === "UITextSizeConstraint");
      let fs = n.p.TextScaled ? Math.min((r.h * 0.8) / lines.length, r.w / (longest * F.k)) : Number(n.p.TextSize ?? 14);
      fs = Math.max(6, Math.min(fs, 120, tsc ? Number(tsc.p.MaxTextSize ?? 100) : 120));
      const xa = String(n.p.TextXAlignment ?? "Center"), ya = String(n.p.TextYAlignment ?? "Center");
      const tx = xa === "Left" ? r.x + 2 : xa === "Right" ? r.x + r.w - 2 : r.x + r.w / 2;
      const anchor = xa === "Left" ? "start" : xa === "Right" ? "end" : "middle";
      const bold = ` font-weight="${F.weight}"`;
      const lh = fs * 1.15, total = lh * lines.length;
      const top = ya === "Top" ? r.y : ya === "Bottom" ? r.y + r.h - total : r.y + (r.h - total) / 2;
      const ts = stroke && !borderStroke && Number(stroke.p.Thickness ?? 1) > 0 ? ` stroke="${stroke.p.Color ?? "#000000"}" stroke-width="${r1(Number(stroke.p.Thickness ?? 1) * 2)}" stroke-linejoin="round" paint-order="stroke"${stroke.p.Transparency ? ` stroke-opacity="${r1(1 - stroke.p.Transparency)}"` : ""}` : "";
      const tt = Number(n.p.TextTransparency ?? 0);
      lines.forEach((l, i) => {
        els.push(`<text x="${r1(tx)}" y="${r1(top + lh * i + lh * 0.78)}" font-size="${r1(fs)}" font-family="${F.family}"${bold} text-anchor="${anchor}" fill="${bt >= 0.99 && grad ? grad : n.p.TextColor3 ?? "#000000"}"${tt ? ` fill-opacity="${r1(1 - tt)}"` : ""}${ts}${tf}>${esc(l)}</text>`);
      });
    }
    return tf;
  };
  const layoutChildren = (n: DumpNode, r: Rect) => {
    const cr = contentRect(n, r);
    const kids = n.k.filter((k) => GUI_CLASSES.has(k.c) && visible(k));
    kids.sort((a, b) => Number(a.p.ZIndex ?? 1) - Number(b.p.ZIndex ?? 1));
    const list = n.k.find((k) => k.c === "UIListLayout");
    const grid = n.k.find((k) => k.c === "UIGridLayout");
    if (list || grid) {
      const ordered = [...kids].sort((a, b) => Number(a.p.LayoutOrder ?? 0) - Number(b.p.LayoutOrder ?? 0));
      const L = (list ?? grid)!;
      const horiz = grid ? String(L.p.FillDirection ?? "Horizontal") === "Horizontal" : String(L.p.FillDirection ?? "Vertical") === "Horizontal";
      const ha = String(L.p.HorizontalAlignment ?? "Left"), va = String(L.p.VerticalAlignment ?? "Top");
      if (grid) {
        const cs = L.p.CellSize ?? [0, 100, 0, 100], cp = L.p.CellPadding ?? [0, 5, 0, 5];
        const cw = cs[0] * cr.w + cs[1], ch = cs[2] * cr.h + cs[3], px = cp[0] * cr.w + cp[1], py = cp[2] * cr.h + cp[3];
        const perRow = Math.max(1, Math.floor((cr.w + px) / (cw + px)));
        const rows = Math.ceil(ordered.length / perRow);
        const usedW = Math.min(ordered.length, perRow) * (cw + px) - px;
        const ox = ha === "Center" ? (cr.w - usedW) / 2 : ha === "Right" ? cr.w - usedW : 0;
        const usedH = rows * (ch + py) - py;
        const oy = va === "Center" ? (cr.h - usedH) / 2 : va === "Bottom" ? cr.h - usedH : 0;
        ordered.forEach((k, i) => {
          const rr = { x: cr.x + ox + (i % perRow) * (cw + px), y: cr.y + oy + Math.floor(i / perRow) * (ch + py), w: cw, h: ch };
          if (rr.y < cr.y + cr.h + 1) node(k, rr);
        });
        return;
      }
      const padU = L.p.Padding ?? [0, 0];
      const gap = padU[0] * (horiz ? cr.w : cr.h) + padU[1];
      const sizes = ordered.map((k) => guiSize(k, cr));
      const total = sizes.reduce((s, z) => s + (horiz ? z.w : z.h), 0) + gap * Math.max(0, ordered.length - 1);
      let cur = horiz ? (ha === "Center" ? (cr.w - total) / 2 : ha === "Right" ? cr.w - total : 0) : (va === "Center" ? (cr.h - total) / 2 : va === "Bottom" ? cr.h - total : 0);
      ordered.forEach((k, i) => {
        const z = sizes[i];
        let x: number, y: number;
        if (horiz) { x = cr.x + cur; y = cr.y + (va === "Center" ? (cr.h - z.h) / 2 : va === "Bottom" ? cr.h - z.h : 0); cur += z.w + gap; }
        else { y = cr.y + cur; x = cr.x + (ha === "Center" ? (cr.w - z.w) / 2 : ha === "Right" ? cr.w - z.w : 0); cur += z.h + gap; }
        node(k, { x, y, w: z.w, h: z.h });
      });
      return;
    }
    for (const k of kids) {
      const z = guiSize(k, cr);
      const [psx, pox] = ud(k.p.Position ?? [0, 0, 0, 0], 0), [psy, poy] = ud(k.p.Position ?? [0, 0, 0, 0], 1);
      const ap = k.p.AnchorPoint ?? [0, 0];
      node(k, { x: cr.x + psx * cr.w + pox - ap[0] * z.w, y: cr.y + psy * cr.h + poy - ap[1] * z.h, w: z.w, h: z.h });
    }
  };
  const node = (n: DumpNode, r: Rect) => {
    const tf = draw(n, r);
    if (tf) els.push(`<g${tf}>`);
    layoutChildren(n, r);
    if (tf) els.push("</g>");
  };
  if (root.c !== "ScreenGui") return null;
  if (root.p.Enabled === false) return null;
  layoutChildren(root, { x: 0, y: 0, w: VW, h: VH });
  if (!any) return null;
  const bg = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7EC8F0"/><stop offset="0.62" stop-color="#CFEFFF"/><stop offset="0.62" stop-color="#6DBB5A"/><stop offset="1" stop-color="#4E9A3F"/></linearGradient></defs><rect width="${VW}" height="${VH}" fill="url(#sky)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VW} ${VH}" width="${w}" height="${h}">${bg}${defs.length ? `<defs>${defs.join("")}</defs>` : ""}${els.join("")}</svg>`;
}

export function renderCard(title: string, lines: string[], icon: string, w = 320, h = 180): string {
  const ic = iconSvg(icon, 64).replace("<svg ", '<svg x="24" y="58" ');
  const ls = lines.slice(0, 5).map((l, i) => `<text x="104" y="${78 + i * 18}" font-size="12" font-family="Consolas, monospace" fill="#B0BEC5">${esc(l.length > 34 ? l.slice(0, 33) + "…" : l)}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="${w}" height="${h}"><rect width="320" height="180" rx="12" fill="#1E2430"/><text x="24" y="38" font-size="18" font-weight="700" font-family="Arial, sans-serif" fill="#ECEFF1">${esc(title)}</text>${ic}${ls}</svg>`;
}
