/**
 * Brickwire 3.0 mesh kit: real geometry primitives, validation/repair, OBJ+MTL export,
 * an independent OBJ re-parser and a software z-buffer renderer for genuine thumbnails.
 * Units are Roblox studs, +Y up, -Z forward. No external dependency.
 */
import zlib from "node:zlib";
export type V3 = [number, number, number];
export interface Part { name: string; material: string; positions: V3[]; uvs: [number, number][]; tris: [number, number, number][] }
export interface Material { name: string; color: string; roughness?: number; metalness?: number; opacity?: number; roblox?: string }
export interface Model { name: string; parts: Part[]; materials: Material[] }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const vec = { sub, add, mul, dot, cross, len, norm };
export function rng(seed: number) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }

class PB {
  p: V3[] = []; uv: [number, number][] = []; t: [number, number, number][] = [];
  v(p: V3, uv: [number, number] = [0, 0]) { this.p.push(p); this.uv.push(uv); return this.p.length - 1; }
  /** Add a triangle oriented so that its normal points along `out` (robust outward winding). */
  tri(a: number, b: number, c: number, out: V3) {
    if (a === b || b === c || a === c) return;
    const n = cross(sub(this.p[b], this.p[a]), sub(this.p[c], this.p[a]));
    if (len(n) < 1e-12) return;
    this.t.push(dot(n, out) >= 0 ? [a, b, c] : [a, c, b]);
  }
  part(name: string, material: string): Part { return { name, material, positions: this.p, uvs: this.uv, tris: this.t }; }
}
/** Tube/loft along a polyline. ring(j) returns cross-section 2D points (CCW) and scale. Caps closed. */
export function sweep(name: string, material: string, path: V3[], radius: (t: number) => number | [number, number], o: { seg?: number; shape?: (a: number) => [number, number]; capStart?: boolean; capEnd?: boolean; roll?: number } = {}) {
  const seg = Math.max(3, o.seg ?? 12), pb = new PB(), M = path.length;
  const shape = o.shape ?? ((a: number) => [Math.cos(a), Math.sin(a)] as [number, number]);
  // parallel transport frames
  const T: V3[] = path.map((_, j) => norm(sub(path[Math.min(M - 1, j + 1)], path[Math.max(0, j - 1)])));
  let n0: V3 = Math.abs(T[0][1]) < 0.9 ? norm(cross(T[0], [0, 1, 0])) : norm(cross(T[0], [1, 0, 0]));
  if (o.roll) { const b = cross(T[0], n0); n0 = norm(add(mul(n0, Math.cos(o.roll)), mul(b, Math.sin(o.roll)))); }
  const N: V3[] = [n0];
  for (let j = 1; j < M; j++) { const n = sub(N[j - 1], mul(T[j], dot(N[j - 1], T[j]))); N.push(len(n) < 1e-6 ? N[j - 1] : norm(n)); }
  const rings: number[][] = [], centers: V3[] = [];
  for (let j = 0; j < M; j++) {
    const t = M === 1 ? 0 : j / (M - 1), r = radius(t), [rx, ry] = Array.isArray(r) ? r : [r, r];
    const B = cross(T[j], N[j]), row: number[] = [];
    centers.push(path[j]);
    for (let i = 0; i <= seg; i++) {
      const [cx, cy] = shape((i % seg) / seg * Math.PI * 2);
      row.push(pb.v(add(path[j], add(mul(N[j], cx * rx), mul(B, cy * ry))), [i / seg, t]));
    }
    rings.push(row);
  }
  for (let j = 0; j < M - 1; j++) for (let i = 0; i < seg; i++) {
    const a = rings[j][i], b = rings[j][i + 1], c = rings[j + 1][i], d = rings[j + 1][i + 1];
    const mid = mul(add(add(pb.p[a], pb.p[b]), add(pb.p[c], pb.p[d])), 0.25), out = sub(mid, mul(add(centers[j], centers[j + 1]), 0.5));
    pb.tri(a, c, d, out); pb.tri(a, d, b, out);
  }
  const cap = (j: number, dir: V3) => { const c = pb.v(centers[j], [0.5, 0.5]); for (let i = 0; i < seg; i++) pb.tri(c, rings[j][i], rings[j][i + 1], dir); };
  if (o.capStart !== false) cap(0, mul(T[0], -1));
  if (o.capEnd !== false) cap(M - 1, T[M - 1]);
  return pb.part(name, material);
}
export function ellipsoid(name: string, material: string, c: V3, r: V3, o: { seg?: number; rings?: number; noise?: (p: V3) => number } = {}) {
  const seg = o.seg ?? 16, rings = o.rings ?? 10, pb = new PB(), idx: number[][] = [];
  for (let j = 0; j <= rings; j++) {
    const phi = (j / rings) * Math.PI, row: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2, d: V3 = [Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)];
      const k = 1 + (o.noise ? o.noise(d) : 0);
      row.push(pb.v([c[0] + d[0] * r[0] * k, c[1] + d[1] * r[1] * k, c[2] + d[2] * r[2] * k], [i / seg, j / rings]));
    }
    idx.push(row);
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const a = idx[j][i], b = idx[j][i + 1], cc = idx[j + 1][i], d = idx[j + 1][i + 1];
    const out = sub(mul(add(add(pb.p[a], pb.p[b]), add(pb.p[cc], pb.p[d])), 0.25), c);
    pb.tri(a, cc, d, out); pb.tri(a, d, b, out);
  }
  return pb.part(name, material);
}
export function box(name: string, material: string, c: V3, s: V3, rotY = 0) {
  const pb = new PB(), h = mul(s, 0.5);
  const R = (p: V3): V3 => [c[0] + p[0] * Math.cos(rotY) - p[2] * Math.sin(rotY), c[1] + p[1], c[2] + p[0] * Math.sin(rotY) + p[2] * Math.cos(rotY)];
  const faces: Array<[V3, V3, V3]> = [[[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, 1]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]], [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]]];
  for (const [n, u, v] of faces) {
    const q = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => pb.v(R([
      (n[0] + u[0] * a + v[0] * b) * h[0], (n[1] + u[1] * a + v[1] * b) * h[1], (n[2] + u[2] * a + v[2] * b) * h[2]]), [(a + 1) / 2, (b + 1) / 2]));
    const out = sub(R(mul(n, 1)), R([0, 0, 0]));
    pb.tri(q[0], q[1], q[2], out); pb.tri(q[0], q[2], q[3], out);
  }
  return pb.part(name, material);
}
export function cylinder(name: string, material: string, a: V3, b: V3, r0: number, r1 = r0, seg = 16) {
  return sweep(name, material, [a, b], (t) => r0 + (r1 - r0) * t, { seg });
}
/** Cone with a true apex (no degenerate cap). */
export function cone(name: string, material: string, base: V3, tip: V3, r: number, seg = 10) {
  const pb = new PB(), axis = norm(sub(tip, base));
  const n0 = Math.abs(axis[1]) < 0.9 ? norm(cross(axis, [0, 1, 0])) : norm(cross(axis, [1, 0, 0])), b0 = cross(axis, n0);
  const ring: number[] = [];
  for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; ring.push(pb.v(add(base, add(mul(n0, Math.cos(a) * r), mul(b0, Math.sin(a) * r))), [i / seg, 0])); }
  const apex = pb.v(tip, [0.5, 1]), center = pb.v(base, [0.5, 0.5]);
  for (let i = 0; i < seg; i++) { const m = mul(add(pb.p[ring[i]], pb.p[ring[i + 1]]), 0.5); pb.tri(ring[i], ring[i + 1], apex, sub(m, base)); pb.tri(center, ring[i], ring[i + 1], mul(axis, -1)); }
  return pb.part(name, material);
}
/** Extrude a simple polygon (XY outline, CCW) along Z by depth, centred, then place with transform. */
export function extrude(name: string, material: string, outline: [number, number][], depth: number, place: (p: V3) => V3) {
  const pb = new PB(), n = outline.length, z = depth / 2;
  const front = outline.map(([x, y]) => pb.v(place([x, y, z]), [x, y])), back = outline.map(([x, y]) => pb.v(place([x, y, -z]), [x, y]));
  const centroid = place([outline.reduce((a, p) => a + p[0], 0) / n, outline.reduce((a, p) => a + p[1], 0) / n, 0]);
  const fz = sub(place([0, 0, 1]), place([0, 0, 0]));
  for (const [a, b, c] of earClip(outline)) { pb.tri(front[a], front[b], front[c], fz); pb.tri(back[a], back[c], back[b], mul(fz, -1)); }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const s = [pb.v(pb.p[front[i]], [i / n, 0]), pb.v(pb.p[front[j]], [(i + 1) / n, 0]), pb.v(pb.p[back[j]], [(i + 1) / n, 1]), pb.v(pb.p[back[i]], [i / n, 1])];
    const out = sub(mul(add(pb.p[s[0]], pb.p[s[2]]), 0.5), centroid);
    const edgeOut = sub(out, mul(fz, dot(out, fz) / Math.max(1e-9, dot(fz, fz))));
    pb.tri(s[0], s[1], s[2], edgeOut); pb.tri(s[0], s[2], s[3], edgeOut);
  }
  return pb.part(name, material);
}
export function earClip(poly: [number, number][]): [number, number, number][] {
  const idx = poly.map((_, i) => i), out: [number, number, number][] = [];
  const area = poly.reduce((a, p, i) => { const q = poly[(i + 1) % poly.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
  if (area < 0) idx.reverse();
  const crossZ = (a: number[], b: number[], c: number[]) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: number[], a: number[], b: number[], c: number[]) => crossZ(a, b, p) >= 0 && crossZ(b, c, p) >= 0 && crossZ(c, a, p) >= 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 5000) {
    let cut = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (crossZ(poly[a], poly[b], poly[c]) <= 1e-12) continue;
      if (idx.some((k) => k !== a && k !== b && k !== c && inside(poly[k], poly[a], poly[b], poly[c]))) continue;
      out.push([a, b, c]); idx.splice(i, 1); cut = true; break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
export function transformPart(p: Part, f: (v: V3) => V3): Part { return { ...p, positions: p.positions.map(f) }; }
export function mirrorX(p: Part, name = p.name + "_R"): Part {
  return { ...p, name, positions: p.positions.map(([x, y, z]) => [-x, y, z] as V3), tris: p.tris.map(([a, b, c]) => [a, c, b] as [number, number, number]) };
}
export const rotY = (a: number) => ([x, y, z]: V3): V3 => [x * Math.cos(a) - z * Math.sin(a), y, x * Math.sin(a) + z * Math.cos(a)];
export const rotZ = (a: number) => ([x, y, z]: V3): V3 => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
export const rotX = (a: number) => ([x, y, z]: V3): V3 => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];

// ---------------------------------------------------------------- validation
export interface PartReport { name: string; vertices: number; triangles: number; degenerate: number; boundaryEdges: number; nonManifoldEdges: number; closed: boolean; volume: number; flipped: boolean }
export interface Validation {
  ok: boolean; errors: string[]; warnings: string[]; fixes: string[];
  vertices: number; triangles: number; parts: PartReport[];
  bounds: { min: V3; max: V3; size: V3 }; materials: string[];
}
export const ROBLOX_TRIANGLE_LIMIT_PER_MESH = 20000;
export function validateModel(m: Model, repair = true): Validation {
  const errors: string[] = [], warnings: string[] = [], fixes: string[] = [];
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  const parts: PartReport[] = [];
  if (!m.parts.length) errors.push("Model has no parts");
  for (const p of m.parts) {
    if (!m.materials.some((x) => x.name === p.material)) errors.push(`${p.name}: material ${p.material} is not defined`);
    if (p.uvs.length !== p.positions.length) errors.push(`${p.name}: UV count differs from vertex count`);
    for (const v of p.positions) { if (!v.every(Number.isFinite)) { errors.push(`${p.name}: non-finite vertex`); break; } for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); } }
    let degenerate = 0;
    const keep: [number, number, number][] = [];
    for (const t of p.tris) {
      if (t.some((i) => !Number.isInteger(i) || i < 0 || i >= p.positions.length)) { errors.push(`${p.name}: triangle index out of range`); continue; }
      const a = len(cross(sub(p.positions[t[1]], p.positions[t[0]]), sub(p.positions[t[2]], p.positions[t[0]])));
      if (a < 1e-10) { degenerate++; continue; }
      keep.push(t);
    }
    if (degenerate && repair) { p.tris = keep; fixes.push(`${p.name}: removed ${degenerate} degenerate triangles`); }
    // topology on welded positions
    const key = (v: V3) => v.map((x) => Math.round(x * 1e4)).join(",");
    const weld = new Map<string, number>(), wid = p.positions.map((v) => { const k = key(v); if (!weld.has(k)) weld.set(k, weld.size); return weld.get(k)!; });
    const edges = new Map<string, number>();
    for (const [a, b, c] of p.tris) for (const [x, y] of [[a, b], [b, c], [c, a]]) { const u = wid[x], w = wid[y], k = u < w ? `${u}_${w}` : `${w}_${u}`; edges.set(k, (edges.get(k) ?? 0) + 1); }
    let boundary = 0, nonManifold = 0;
    for (const n of edges.values()) { if (n === 1) boundary++; else if (n > 2) nonManifold++; }
    let volume = 0;
    for (const [a, b, c] of p.tris) volume += dot(p.positions[a], cross(p.positions[b], p.positions[c])) / 6;
    let flipped = false;
    if (boundary === 0 && volume < 0 && repair) { p.tris = p.tris.map(([a, b, c]) => [a, c, b]); volume = -volume; flipped = true; fixes.push(`${p.name}: inverted winding corrected (normals now outward)`); }
    if (boundary === 0 && volume <= 0) errors.push(`${p.name}: closed part has non-positive volume (inside-out)`);
    if (boundary) warnings.push(`${p.name}: ${boundary} open boundary edges (not watertight)`);
    if (nonManifold) warnings.push(`${p.name}: ${nonManifold} non-manifold edges`);
    if (p.tris.length > ROBLOX_TRIANGLE_LIMIT_PER_MESH) errors.push(`${p.name}: ${p.tris.length} triangles exceeds the ${ROBLOX_TRIANGLE_LIMIT_PER_MESH}-triangle per-mesh budget used for Roblox import`);
    parts.push({ name: p.name, vertices: p.positions.length, triangles: p.tris.length, degenerate, boundaryEdges: boundary, nonManifoldEdges: nonManifold, closed: boundary === 0, volume: Math.round(volume * 1000) / 1000, flipped });
  }
  const triangles = m.parts.reduce((a, p) => a + p.tris.length, 0), vertices = m.parts.reduce((a, p) => a + p.positions.length, 0);
  if (!triangles) errors.push("Model has no triangles");
  if (triangles && triangles < 24) errors.push("Model is too simple to be a generated asset (fewer than 24 triangles)");
  const size: V3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  if (size.some((s) => !(s > 0.01))) errors.push("Model has a degenerate (flat or empty) bounding box");
  if (size.some((s) => s > 2048)) errors.push("Model exceeds 2048 studs on an axis");
  return { ok: errors.length === 0, errors, warnings, fixes, vertices, triangles, parts, bounds: { min, max, size }, materials: [...new Set(m.parts.map((p) => p.material))] };
}
/** Place on the ground (min y = 0) and centre on X/Z. */
export function groundAndCenter(m: Model) {
  const all = m.parts.flatMap((p) => p.positions);
  const min = [0, 1, 2].map((k) => Math.min(...all.map((v) => v[k]))), max = [0, 1, 2].map((k) => Math.max(...all.map((v) => v[k])));
  const off: V3 = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];
  for (const p of m.parts) p.positions = p.positions.map((v) => add(v, off));
}
export function smoothNormals(p: Part): V3[] {
  const n = p.positions.map(() => [0, 0, 0] as V3);
  const key = (v: V3) => v.map((x) => Math.round(x * 1e4)).join(",");
  const groups = new Map<string, number[]>();
  p.positions.forEach((v, i) => { const k = key(v); (groups.get(k) ?? groups.set(k, []).get(k)!).push(i); });
  for (const [a, b, c] of p.tris) { const f = cross(sub(p.positions[b], p.positions[a]), sub(p.positions[c], p.positions[a])); for (const i of [a, b, c]) n[i] = add(n[i], f); }
  // Smooth across welded seams only where faces are not sharply creased (keeps box edges hard).
  const out = n.map((v) => norm(v));
  for (const ids of groups.values()) if (ids.length > 1) {
    const avg = norm(ids.reduce((a, i) => add(a, n[i]), [0, 0, 0] as V3));
    for (const i of ids) if (dot(out[i], avg) > 0.82) out[i] = avg;
  }
  return out;
}
// ---------------------------------------------------------------- OBJ / MTL
const f6 = (x: number) => (Math.round(x * 1e6) / 1e6).toString();
export function hexToRgb(h: string): V3 { const v = parseInt(h.replace("#", ""), 16); return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; }
export function writeObjMtl(m: Model, base: string, meta: string[] = []) {
  let obj = `# Brickwire 3.0 Asset Forge\n# ${meta.join("\n# ")}\n# Units: Roblox studs, +Y up\nmtllib ${base}.mtl\n`;
  let vo = 1;
  for (const p of m.parts) {
    const n = smoothNormals(p);
    obj += `o ${p.name.replace(/\s+/g, "_")}\n`;
    for (const v of p.positions) obj += `v ${f6(v[0])} ${f6(v[1])} ${f6(v[2])}\n`;
    for (const t of p.uvs) obj += `vt ${f6(t[0])} ${f6(t[1])}\n`;
    for (const v of n) obj += `vn ${f6(v[0])} ${f6(v[1])} ${f6(v[2])}\n`;
    obj += `usemtl ${p.material}\ns 1\n`;
    for (const [a, b, c] of p.tris) obj += `f ${a + vo}/${a + vo}/${a + vo} ${b + vo}/${b + vo}/${b + vo} ${c + vo}/${c + vo}/${c + vo}\n`;
    vo += p.positions.length;
  }
  let mtl = `# Brickwire 3.0 Asset Forge materials (colour only; no texture maps)\n`;
  for (const mat of m.materials.filter((x) => m.parts.some((p) => p.material === x.name))) {
    const [r, g, b] = hexToRgb(mat.color), rough = mat.roughness ?? 0.6;
    mtl += `\nnewmtl ${mat.name}\nKa 0 0 0\nKd ${f6(r)} ${f6(g)} ${f6(b)}\nKs ${f6(0.5 * (1 - rough))} ${f6(0.5 * (1 - rough))} ${f6(0.5 * (1 - rough))}\nNs ${Math.round((1 - rough) * 200 + 10)}\nd ${mat.opacity ?? 1}\nillum 2\n`;
    if (mat.roblox) mtl += `# Roblox material suggestion: ${mat.roblox}\n`;
  }
  return { obj, mtl };
}
export interface ParsedObj { vertices: number; uvs: number; normals: number; faces: number; objects: string[]; materials: string[]; mtllib: string | null; bounds: { min: V3; max: V3 }; errors: string[]; positions: V3[]; faceList: Array<{ v: [number, number, number]; m: string }> }
/** Independent reader used to verify the written file (not the in-memory model). */
export function parseObj(text: string): ParsedObj {
  const pos: V3[] = [], errors: string[] = [], objects: string[] = [], materials = new Set<string>(), faceList: ParsedObj["faceList"] = [];
  let uvs = 0, normals = 0, mtllib: string | null = null, cur = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line[0] === "#") continue;
    const [k, ...r] = line.split(/\s+/);
    if (k === "v") { const v = r.slice(0, 3).map(Number) as V3; if (v.length < 3 || !v.every(Number.isFinite)) errors.push("bad vertex"); pos.push(v); }
    else if (k === "vt") uvs++;
    else if (k === "vn") normals++;
    else if (k === "o" || k === "g") objects.push(r.join(" "));
    else if (k === "usemtl") { cur = r[0]; materials.add(cur); }
    else if (k === "mtllib") mtllib = r.join(" ");
    else if (k === "f") {
      const ids = r.map((x) => { const i = parseInt(x.split("/")[0], 10); return i < 0 ? pos.length + 1 + i : i; });
      if (ids.length < 3 || ids.some((i) => !Number.isInteger(i) || i < 1 || i > pos.length)) { errors.push("face index out of range"); continue; }
      for (let i = 1; i + 1 < ids.length; i++) faceList.push({ v: [ids[0] - 1, ids[i] - 1, ids[i + 1] - 1], m: cur });
    }
  }
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (const v of pos) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], v[k]); max[k] = Math.max(max[k], v[k]); }
  return { vertices: pos.length, uvs, normals, faces: faceList.length, objects, materials: [...materials], mtllib, bounds: { min, max }, errors, positions: pos, faceList };
}
export function parseMtl(text: string) { return [...text.matchAll(/^newmtl\s+(\S+)[\s\S]*?^Kd\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/gm)].map((m) => ({ name: m[1], kd: [Number(m[2]), Number(m[3]), Number(m[4])] as V3 })); }

// ---------------------------------------------------------------- software renderer (thumbnail from the written OBJ)
export function renderPng(obj: ParsedObj, mtl: Array<{ name: string; kd: V3 }>, o: { width?: number; height?: number; yaw?: number; pitch?: number; background?: V3 } = {}) {
  const W = o.width ?? 512, H = o.height ?? 384, yaw = o.yaw ?? -0.65, pitch = o.pitch ?? 0.38;
  const bg = o.background ?? [0.11, 0.12, 0.15];
  const img = Buffer.alloc(W * H * 4), zb = new Float32Array(W * H).fill(Infinity);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const g = 1 - (y / H) * 0.35, i = (y * W + x) * 4; img[i] = bg[0] * 255 * g; img[i + 1] = bg[1] * 255 * g; img[i + 2] = bg[2] * 255 * g; img[i + 3] = 255; }
  const { min, max } = obj.bounds, c: V3 = mul(add(min, max), 0.5), size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;
  const view = (p: V3): V3 => { let v = sub(p, c); v = rotY(yaw)(v); v = rotX(pitch)(v); return v; };
  const L = norm([-0.45, 0.8, 0.55] as V3);
  const colors = new Map(mtl.map((m) => [m.name, m.kd]));
  const P = obj.positions.map(view);
  // Fit the projected silhouette (not the 3D box) so long/thin models fill the frame.
  let px0 = Infinity, px1 = -Infinity, py0 = Infinity, py1 = -Infinity;
  for (const v of P) { px0 = Math.min(px0, v[0]); px1 = Math.max(px1, v[0]); py0 = Math.min(py0, v[1]); py1 = Math.max(py1, v[1]); }
  const scale = Math.min(W * 0.86 / ((px1 - px0) || size), H * 0.86 / ((py1 - py0) || size));
  const ox = (px0 + px1) / 2, oy = (py0 + py1) / 2;
  for (const v of P) { v[0] -= ox; v[1] -= oy; }
  for (const f of obj.faceList) {
    const [a, b, cc] = f.v.map((i) => P[i]);
    const n = norm(cross(sub(b, a), sub(cc, a)));
    if (n[2] < 0) continue; // back-face (camera looks along -Z)
    const kd = colors.get(f.m) ?? [0.7, 0.7, 0.7], lam = 0.35 + 0.65 * Math.max(0, dot(n, L)), rim = 0.12 * Math.pow(1 - Math.abs(n[2]), 2);
    const col = kd.map((k) => Math.min(255, (k * lam + rim) * 255));
    const sx = (v: V3) => W / 2 + v[0] * scale, sy = (v: V3) => H / 2 - v[1] * scale;
    const xs = [sx(a), sx(b), sx(cc)], ys = [sy(a), sy(b), sy(cc)], zs = [-a[2], -b[2], -cc[2]];
    const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs))), y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)));
    const den = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2]);
    if (Math.abs(den) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const w0 = ((ys[1] - ys[2]) * (x + 0.5 - xs[2]) + (xs[2] - xs[1]) * (y + 0.5 - ys[2])) / den, w1 = ((ys[2] - ys[0]) * (x + 0.5 - xs[2]) + (xs[0] - xs[2]) * (y + 0.5 - ys[2])) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
      const z = w0 * zs[0] + w1 * zs[1] + w2 * zs[2], k = y * W + x;
      if (z >= zb[k]) continue;
      zb[k] = z; img[k * 4] = col[0]; img[k * 4 + 1] = col[1]; img[k * 4 + 2] = col[2];
    }
  }
  let covered = 0; for (let i = 0; i < zb.length; i++) if (zb[i] !== Infinity) covered++;
  return { png: encodePng(img, W, H), width: W, height: H, coverage: covered / (W * H) };
}
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b: Buffer) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function encodePng(rgba: Buffer, w: number, h: number) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type: string, data: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
