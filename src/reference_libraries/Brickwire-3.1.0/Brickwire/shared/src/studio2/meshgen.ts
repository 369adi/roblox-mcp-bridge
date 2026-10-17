/**
 * Brickwire 2.0 — Mesh 2.0: procedural mesh generators (pure TS).
 * Output is consumed by the mesh_generate tool, which builds a real EditableMesh in Studio
 * (AssetService:CreateEditableMesh → AddVertex/AddTriangle/SetUV → CreateMeshPartAsync) and/or
 * exports GLB/OBJ files for permanent upload (Open Cloud) or import (3D Importer).
 */

export interface MeshData { name: string; positions: number[][]; triangles: number[][]; uvs: number[][] }
export const MESH_TYPES = ["rock", "crystal", "lathe", "terrain", "tube", "gem"] as const;
export type MeshType = (typeof MESH_TYPES)[number];

function rng(seed: number) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }
function hash3(x: number, y: number, z: number, seed: number) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 13.13) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t: number) => t * t * (3 - 2 * t), u = f(xf), v = f(yf), w = f(zf);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz, seed);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
const fbm = (x: number, y: number, z: number, seed: number, oct = 4) => { let a = 0, amp = 0.5, fr = 1; for (let i = 0; i < oct; i++) { a += amp * vnoise(x * fr, y * fr, z * fr, seed + i); amp *= 0.5; fr *= 2; } return a; };

function icosphere(sub: number): { p: number[][]; t: number[][] } {
  const g = (1 + Math.sqrt(5)) / 2;
  let p = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]].map(norm);
  let t = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let s = 0; s < sub; s++) {
    const cache = new Map<string, number>(), nt: number[][] = [];
    const mid = (a: number, b: number) => { const k = a < b ? `${a}_${b}` : `${b}_${a}`; let i = cache.get(k); if (i === undefined) { i = p.length; p.push(norm([(p[a][0] + p[b][0]) / 2, (p[a][1] + p[b][1]) / 2, (p[a][2] + p[b][2]) / 2])); cache.set(k, i); } return i; };
    for (const [a, b, c] of t) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nt.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    t = nt;
  }
  return { p, t };
}
function norm(v: number[]) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
const sphUV = (v: number[]) => [0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(Math.max(-1, Math.min(1, v[1]))) / Math.PI];

export interface MeshOptions { seed?: number; size?: number[]; detail?: number; roughness?: number; profile?: number[][]; segments?: number; points?: number[][]; radius?: number; count?: number; height?: number }

export function generateMesh(type: MeshType, o: MeshOptions = {}): MeshData {
  const seed = Math.floor(o.seed ?? 1);
  const size = o.size ?? [4, 4, 4];
  const R = rng(seed);
  if (!(MESH_TYPES as readonly string[]).includes(type)) throw new Error(`unknown mesh type "${type}" — ${MESH_TYPES.join(", ")}`);
  if (type === "rock") {
    const { p, t } = icosphere(Math.max(1, Math.min(4, Math.round(o.detail ?? 3))));
    const rough = o.roughness ?? 0.35;
    const flat = 0.6 + R() * 0.3; // flatten bottom slightly
    const positions = p.map((v) => { const n = 1 + fbm(v[0] * 1.6 + 7, v[1] * 1.6, v[2] * 1.6, seed) * rough; let y = v[1] * n; if (y < -flat) y = -flat - (y + flat) * 0.15; return [v[0] * n * size[0] / 2, y * size[1] / 2, v[2] * n * size[2] / 2]; });
    return { name: `Rock_${seed}`, positions, triangles: t, uvs: p.map(sphUV) };
  }
  if (type === "gem") {
    const sides = Math.max(5, Math.min(16, Math.round(o.segments ?? 8)));
    const positions: number[][] = [[0, size[1] * 0.5, 0], [0, -size[1] * 0.5, 0]]; const uvs: number[][] = [[0.5, 0], [0.5, 1]]; const triangles: number[][] = [];
    for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; positions.push([Math.cos(a) * size[0] / 2, size[1] * 0.15, Math.sin(a) * size[2] / 2]); uvs.push([i / sides, 0.35]); }
    for (let i = 0; i < sides; i++) { const a = 2 + i, b = 2 + ((i + 1) % sides); triangles.push([0, b, a], [1, a, b]); }
    return { name: `Gem_${seed}`, positions, triangles, uvs };
  }
  if (type === "crystal") {
    const count = Math.max(1, Math.min(12, Math.round(o.count ?? 5)));
    const positions: number[][] = [], triangles: number[][] = [], uvs: number[][] = [];
    for (let c = 0; c < count; c++) {
      const h = size[1] * (0.45 + R() * 0.55) * (c === 0 ? 1 : 0.75), r = Math.min(size[0], size[2]) * (0.08 + R() * 0.1);
      const tiltX = (R() - 0.5) * (c === 0 ? 0.2 : 1.1), tiltZ = (R() - 0.5) * (c === 0 ? 0.2 : 1.1), ox = (R() - 0.5) * size[0] * 0.4, oz = (R() - 0.5) * size[2] * 0.4;
      const tf = (x: number, y: number, z: number) => { const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX), z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX); const x2 = x * Math.cos(tiltZ) - y1 * Math.sin(tiltZ), y2 = x * Math.sin(tiltZ) + y1 * Math.cos(tiltZ); return [x2 + ox, y2 - size[1] / 2, z1 + oz]; };
      const base = positions.length, sides = 6;
      for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2; positions.push(tf(Math.cos(a) * r, 0, Math.sin(a) * r)); uvs.push([i / sides, 1]); positions.push(tf(Math.cos(a) * r, h * 0.8, Math.sin(a) * r)); uvs.push([i / sides, 0.2]); }
      positions.push(tf(0, h, 0)); uvs.push([0.5, 0]); const tip = positions.length - 1;
      for (let i = 0; i < sides; i++) { const a0 = base + i * 2, a1 = a0 + 1, b0 = base + ((i + 1) % sides) * 2, b1 = b0 + 1; triangles.push([a0, a1, b1], [a0, b1, b0], [a1, tip, b1]); }
    }
    return { name: `Crystal_${seed}`, positions, triangles, uvs };
  }
  if (type === "lathe") {
    const prof = o.profile ?? [[0.5, 0], [0.8, 0.15], [0.9, 0.5], [0.6, 0.85], [0.4, 0.95], [0.45, 1]]; // vase [radius, height] in 0..1
    if (prof.length < 2) throw new Error("profile needs ≥ 2 points [radius, height]");
    const seg = Math.max(6, Math.min(64, Math.round(o.segments ?? 24)));
    const positions: number[][] = [], uvs: number[][] = [], triangles: number[][] = [];
    for (let j = 0; j < prof.length; j++) for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; positions.push([Math.cos(a) * prof[j][0] * size[0] / 2, (prof[j][1] - 0.5) * size[1], Math.sin(a) * prof[j][0] * size[2] / 2]); uvs.push([i / seg, 1 - prof[j][1]]); }
    for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; triangles.push([a, b, a + 1], [a + 1, b, b + 1]); }
    // bottom cap
    positions.push([0, (prof[0][1] - 0.5) * size[1], 0]); uvs.push([0.5, 0.5]); const cb = positions.length - 1;
    for (let i = 0; i < seg; i++) triangles.push([cb, i, i + 1]);
    return { name: `Lathe_${seed}`, positions, triangles, uvs };
  }
  if (type === "terrain") {
    const n = Math.max(4, Math.min(96, Math.round(o.segments ?? 32))), H = o.height ?? size[1];
    const positions: number[][] = [], uvs: number[][] = [], triangles: number[][] = [];
    for (let z = 0; z <= n; z++) for (let x = 0; x <= n; x++) { const u = x / n, v = z / n; const h = (fbm(u * 3, 0, v * 3, seed, 5) * 0.5 + 0.5) * H; positions.push([(u - 0.5) * size[0], h, (v - 0.5) * size[2]]); uvs.push([u * 4, v * 4]); }
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) { const a = z * (n + 1) + x, b = a + n + 1; triangles.push([a, b, a + 1], [a + 1, b, b + 1]); }
    return { name: `Terrain_${seed}`, positions, triangles, uvs };
  }
  // tube along points (Catmull-like linear sweep)
  const pts = o.points ?? [[0, 0, 0], [0, 4, 2], [0, 6, 6], [0, 5, 10]];
  if (pts.length < 2) throw new Error("tube needs ≥ 2 points");
  const r = o.radius ?? 0.5, seg = Math.max(4, Math.min(32, Math.round(o.segments ?? 10)));
  const positions: number[][] = [], uvs: number[][] = [], triangles: number[][] = [];
  for (let j = 0; j < pts.length; j++) {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
    const t = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const up = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const n1 = norm([t[1] * up[2] - t[2] * up[1], t[2] * up[0] - t[0] * up[2], t[0] * up[1] - t[1] * up[0]]);
    const n2 = [t[1] * n1[2] - t[2] * n1[1], t[2] * n1[0] - t[0] * n1[2], t[0] * n1[1] - t[1] * n1[0]];
    for (let i = 0; i <= seg; i++) { const ang = (i / seg) * Math.PI * 2, c = Math.cos(ang) * r, s = Math.sin(ang) * r; positions.push([pts[j][0] + n1[0] * c + n2[0] * s, pts[j][1] + n1[1] * c + n2[1] * s, pts[j][2] + n1[2] * c + n2[2] * s]); uvs.push([i / seg, j / (pts.length - 1)]); }
  }
  for (let j = 0; j < pts.length - 1; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; triangles.push([a, a + 1, b], [a + 1, b + 1, b]); }
  return { name: `Tube_${seed}`, positions, triangles, uvs };
}

/** Per-vertex smooth normals. */
export function vertexNormals(m: MeshData): number[][] {
  const n = m.positions.map(() => [0, 0, 0]);
  for (const [a, b, c] of m.triangles) {
    const p = m.positions, u = [p[b][0] - p[a][0], p[b][1] - p[a][1], p[b][2] - p[a][2]], v = [p[c][0] - p[a][0], p[c][1] - p[a][1], p[c][2] - p[a][2]];
    const f = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const i of [a, b, c]) for (let k = 0; k < 3; k++) n[i][k] += f[k];
  }
  return n.map(norm);
}

export function meshStats(m: MeshData) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of m.positions) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  let bad = 0; for (const t of m.triangles) if (t.some((i) => i < 0 || i >= m.positions.length) || new Set(t).size < 3) bad++;
  return { vertices: m.positions.length, triangles: m.triangles.length, bounds: max.map((v, k) => Math.round((v - min[k]) * 100) / 100), invalidTriangles: bad };
}
