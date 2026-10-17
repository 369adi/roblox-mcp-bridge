/**
 * Binary Roblox model (.rbxm / .rbxl) reader. Pure TypeScript, no dependencies.
 * Decodes the instance tree with typed property values. Unknown / failing property
 * types are skipped per-chunk (recorded in `warnings`) so a single exotic property
 * never breaks the whole file.
 */
import { lz4DecodeBlock } from "./lz4.js";

export type RVal =
  | { t: "string"; v: string }
  | { t: "bytes"; v: string } // base64 (binary strings, e.g. AttributesSerialize)
  | { t: "bool"; v: boolean }
  | { t: "int"; v: number }
  | { t: "float"; v: number }
  | { t: "double"; v: number }
  | { t: "UDim"; v: [number, number] }
  | { t: "UDim2"; v: [number, number, number, number] }
  | { t: "Ray"; v: number[] }
  | { t: "Faces"; v: number }
  | { t: "Axes"; v: number }
  | { t: "BrickColor"; v: number }
  | { t: "Color3"; v: [number, number, number] }
  | { t: "Vector2"; v: [number, number] }
  | { t: "Vector3"; v: [number, number, number] }
  | { t: "CFrame"; v: number[] } // 12 numbers: x,y,z, r00,r01,r02, r10,r11,r12, r20,r21,r22 (CFrame.new order)
  | { t: "Enum"; v: number }
  | { t: "Ref"; v: number } // referent, -1 = nil
  | { t: "Vector3int16"; v: [number, number, number] }
  | { t: "NumberSequence"; v: number[][] } // [time, value, envelope]
  | { t: "ColorSequence"; v: number[][] } // [time, r, g, b]
  | { t: "NumberRange"; v: [number, number] }
  | { t: "Rect"; v: [number, number, number, number] }
  | { t: "PhysicalProperties"; v: number[] | null }
  | { t: "Color3uint8"; v: [number, number, number] }
  | { t: "Int64"; v: number }
  | { t: "SharedString"; v: number }
  | { t: "OptionalCFrame"; v: number[] | null }
  | { t: "UniqueId"; v: string }
  | { t: "Font"; v: { family: string; weight: number; style: number } }
  | { t: "SecurityCapabilities"; v: number }
  | { t: "Content"; v: string | null };

export interface RInst {
  ref: number;
  className: string;
  props: Record<string, RVal>;
  children: RInst[];
  parent: RInst | null;
}

export interface RbxmFile {
  roots: RInst[];
  all: RInst[];
  sharedStrings: Uint8Array[];
  meta: Record<string, string>;
  warnings: string[];
}

class Reader {
  p = 0;
  b: Uint8Array;
  constructor(b: Uint8Array) { this.b = b; }
  get dv() { return new DataView(this.b.buffer, this.b.byteOffset, this.b.byteLength); }
  u8() { if (this.p >= this.b.length) throw new Error("eof"); return this.b[this.p++]!; }
  u16() { const v = this.dv.getUint16(this.p, true); this.p += 2; return v; }
  i16() { const v = this.dv.getInt16(this.p, true); this.p += 2; return v; }
  u32() { const v = this.dv.getUint32(this.p, true); this.p += 4; return v; }
  f32() { const v = this.dv.getFloat32(this.p, true); this.p += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.p, true); this.p += 8; return v; }
  bytes(n: number) { if (this.p + n > this.b.length) throw new Error("eof"); const v = this.b.subarray(this.p, this.p + n); this.p += n; return v; }
  str() { const n = this.u32(); return this.bytes(n); }
  /** n big-endian 4-byte values, byte-interleaved */
  interleaved32(n: number): number[] {
    const raw = this.bytes(n * 4); const out = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = ((raw[i]! << 24) | (raw[n + i]! << 16) | (raw[2 * n + i]! << 8) | raw[3 * n + i]!) >>> 0;
    return out;
  }
  interleaved64(n: number): bigint[] {
    const raw = this.bytes(n * 8); const out = new Array<bigint>(n);
    for (let i = 0; i < n; i++) { let v = 0n; for (let k = 0; k < 8; k++) v = (v << 8n) | BigInt(raw[k * n + i]!); out[i] = v; }
    return out;
  }
  ints(n: number) { return this.interleaved32(n).map(zz); }
  floats(n: number) { return this.interleaved32(n).map(rotF); }
  refs(n: number) { const d = this.ints(n); let acc = 0; return d.map((x) => (acc += x)); }
}
const zz = (u: number) => (u >>> 1) ^ -(u & 1);
const f32buf = new DataView(new ArrayBuffer(4));
function rotF(u: number): number { const bits = ((u >>> 1) | (u << 31)) >>> 0; f32buf.setUint32(0, bits); return f32buf.getFloat32(0); }
const zz64 = (u: bigint) => Number((u >> 1n) ^ -(u & 1n));

const td = new TextDecoder("utf-8", { fatal: false });
function isText(b: Uint8Array) { for (const c of b) if (c < 9 || (c > 13 && c < 32)) return false; return true; }
function b64(b: Uint8Array) { return Buffer.from(b).toString("base64"); }

const NORMALS: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
function basicRotation(id: number): number[] | null {
  const xn = Math.floor((id - 1) / 6), yn = (id - 1) % 6;
  const R = NORMALS[xn], U = NORMALS[yn];
  if (!R || !U || xn % 3 === yn % 3) return null;
  const B: [number, number, number] = [R[1] * U[2] - R[2] * U[1], R[2] * U[0] - R[0] * U[2], R[0] * U[1] - R[1] * U[0]];
  // columns = right, up, back → row-major r00 r01 r02 / r10 ... like CFrame.new(x,y,z, R00..R22)
  return [R[0], U[0], B[0], R[1], U[1], B[1], R[2], U[2], B[2]];
}

function decompress(chunkData: Uint8Array, comp: number, uncomp: number, zstd?: (b: Uint8Array) => Uint8Array): Uint8Array {
  if (comp === 0) return chunkData;
  if (chunkData[0] === 0x28 && chunkData[1] === 0xb5 && chunkData[2] === 0x2f && chunkData[3] === 0xfd) {
    if (!zstd) throw new Error("zstd-compressed chunk: no zstd decoder available (Node 22.15+/23.8+ needed)");
    return zstd(chunkData);
  }
  return lz4DecodeBlock(chunkData, uncomp);
}

function readCFrames(r: Reader, n: number): number[][] {
  const rots: number[][] = [];
  for (let i = 0; i < n; i++) {
    const id = r.u8();
    if (id === 0) { const m: number[] = []; for (let k = 0; k < 9; k++) m.push(r.f32()); rots.push(m); }
    else rots.push(basicRotation(id) ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  }
  const X = r.floats(n), Y = r.floats(n), Z = r.floats(n);
  return rots.map((m, i) => [X[i]!, Y[i]!, Z[i]!, ...m]);
}

function readValues(r: Reader, type: number, n: number): RVal[] {
  const out: RVal[] = [];
  switch (type) {
    case 0x01: case 0x1d: for (let i = 0; i < n; i++) { const s = r.str(); out.push(isText(s) ? { t: "string", v: td.decode(s) } : { t: "bytes", v: b64(s) }); } break;
    case 0x02: for (let i = 0; i < n; i++) out.push({ t: "bool", v: r.u8() !== 0 }); break;
    case 0x03: for (const v of r.ints(n)) out.push({ t: "int", v }); break;
    case 0x04: for (const v of r.floats(n)) out.push({ t: "float", v }); break;
    case 0x05: for (let i = 0; i < n; i++) out.push({ t: "double", v: r.f64() }); break;
    case 0x06: { const s = r.floats(n), o = r.ints(n); for (let i = 0; i < n; i++) out.push({ t: "UDim", v: [s[i]!, o[i]!] }); break; }
    case 0x07: { const sx = r.floats(n), sy = r.floats(n), ox = r.ints(n), oy = r.ints(n); for (let i = 0; i < n; i++) out.push({ t: "UDim2", v: [sx[i]!, ox[i]!, sy[i]!, oy[i]!] }); break; }
    case 0x08: for (let i = 0; i < n; i++) { const v: number[] = []; for (let k = 0; k < 6; k++) v.push(r.f32()); out.push({ t: "Ray", v }); } break;
    case 0x09: for (let i = 0; i < n; i++) out.push({ t: "Faces", v: r.u8() }); break;
    case 0x0a: for (let i = 0; i < n; i++) out.push({ t: "Axes", v: r.u8() }); break;
    case 0x0b: for (const v of r.interleaved32(n)) out.push({ t: "BrickColor", v }); break;
    case 0x0c: { const R = r.floats(n), G = r.floats(n), B = r.floats(n); for (let i = 0; i < n; i++) out.push({ t: "Color3", v: [R[i]!, G[i]!, B[i]!] }); break; }
    case 0x0d: { const X = r.floats(n), Y = r.floats(n); for (let i = 0; i < n; i++) out.push({ t: "Vector2", v: [X[i]!, Y[i]!] }); break; }
    case 0x0e: { const X = r.floats(n), Y = r.floats(n), Z = r.floats(n); for (let i = 0; i < n; i++) out.push({ t: "Vector3", v: [X[i]!, Y[i]!, Z[i]!] }); break; }
    case 0x10: for (const v of readCFrames(r, n)) out.push({ t: "CFrame", v }); break;
    case 0x12: for (const v of r.interleaved32(n)) out.push({ t: "Enum", v }); break;
    case 0x13: for (const v of r.refs(n)) out.push({ t: "Ref", v }); break;
    case 0x14: for (let i = 0; i < n; i++) out.push({ t: "Vector3int16", v: [r.i16(), r.i16(), r.i16()] }); break;
    case 0x15: for (let i = 0; i < n; i++) { const c = r.u32(); const v: number[][] = []; for (let k = 0; k < c; k++) v.push([r.f32(), r.f32(), r.f32()]); out.push({ t: "NumberSequence", v }); } break;
    case 0x16: for (let i = 0; i < n; i++) { const c = r.u32(); const v: number[][] = []; for (let k = 0; k < c; k++) { const t = r.f32(), R = r.f32(), G = r.f32(), B = r.f32(); r.f32(); v.push([t, R, G, B]); } out.push({ t: "ColorSequence", v }); } break;
    case 0x17: for (let i = 0; i < n; i++) out.push({ t: "NumberRange", v: [r.f32(), r.f32()] }); break;
    case 0x18: { const a = r.floats(n), b = r.floats(n), c = r.floats(n), d = r.floats(n); for (let i = 0; i < n; i++) out.push({ t: "Rect", v: [a[i]!, b[i]!, c[i]!, d[i]!] }); break; }
    case 0x19: for (let i = 0; i < n; i++) { const f = r.u8(); if (f & 1) { const v = [r.f32(), r.f32(), r.f32(), r.f32(), r.f32()]; if (f & 2) r.f32(); out.push({ t: "PhysicalProperties", v }); } else out.push({ t: "PhysicalProperties", v: null }); } break;
    case 0x1a: { const R = r.bytes(n).slice(), G = r.bytes(n).slice(), B = r.bytes(n).slice(); for (let i = 0; i < n; i++) out.push({ t: "Color3uint8", v: [R[i]!, G[i]!, B[i]!] }); break; }
    case 0x1b: for (const v of r.interleaved64(n)) out.push({ t: "Int64", v: zz64(v) }); break;
    case 0x1c: for (const v of r.interleaved32(n)) out.push({ t: "SharedString", v }); break;
    case 0x1e: {
      if (r.u8() !== 0x10) throw new Error("OptionalCFrame: expected CFrame block");
      const cfs = readCFrames(r, n);
      if (r.u8() !== 0x02) throw new Error("OptionalCFrame: expected bool block");
      for (let i = 0; i < n; i++) out.push({ t: "OptionalCFrame", v: r.u8() ? cfs[i]! : null });
      break;
    }
    case 0x1f: { const raw = r.bytes(n * 16); for (let i = 0; i < n; i++) { let h = ""; for (let k = 0; k < 16; k++) h += raw[k * n + i]!.toString(16).padStart(2, "0"); out.push({ t: "UniqueId", v: h }); } break; }
    case 0x20: for (let i = 0; i < n; i++) { const family = td.decode(r.str()); const weight = r.u16(); const style = r.u8(); r.str(); out.push({ t: "Font", v: { family, weight, style } }); } break;
    case 0x21: for (const v of r.interleaved64(n)) out.push({ t: "SecurityCapabilities", v: Number(v) }); break;
    case 0x22: {
      const kinds = r.ints(n);
      const uriCount = r.u32(); const uris: string[] = []; for (let i = 0; i < uriCount; i++) uris.push(td.decode(r.str()));
      let ui = 0;
      for (let i = 0; i < n; i++) out.push({ t: "Content", v: kinds[i] === 1 ? (uris[ui++] ?? null) : null });
      break;
    }
    default: throw new Error(`unknown property type 0x${type.toString(16)}`);
  }
  return out;
}

export interface ParseOptions { zstd?: (b: Uint8Array) => Uint8Array }

export function parseRbxm(input: Uint8Array, opts: ParseOptions = {}): RbxmFile {
  const head = td.decode(input.subarray(0, 8));
  if (head !== "<roblox!") {
    if (td.decode(input.subarray(0, 64)).includes("<roblox")) throw new Error("XML model (.rbxmx) — save it as binary .rbxm instead");
    throw new Error("not a binary Roblox model file");
  }
  const R = new Reader(input);
  R.p = 32;
  const classes = new Map<number, { name: string; refs: number[] }>();
  const byRef = new Map<number, RInst>();
  const all: RInst[] = [];
  const warnings: string[] = [];
  const sharedStrings: Uint8Array[] = [];
  const meta: Record<string, string> = {};
  const parents: [number, number][] = [];
  while (R.p < input.length) {
    const name = td.decode(R.bytes(4));
    const comp = R.u32(), uncomp = R.u32(); R.u32();
    const raw = R.bytes(comp === 0 ? uncomp : comp);
    if (name === "END\0") break;
    let data: Uint8Array;
    try { data = decompress(raw, comp, uncomp, opts.zstd); } catch (e) { warnings.push(`${name}: ${(e as Error).message}`); continue; }
    const r = new Reader(data);
    try {
      if (name === "META") { const c = r.u32(); for (let i = 0; i < c; i++) { const k = td.decode(r.str()); meta[k] = td.decode(r.str()); } }
      else if (name === "SSTR") { r.u32(); const c = r.u32(); for (let i = 0; i < c; i++) { r.bytes(16); sharedStrings.push(r.str().slice()); } }
      else if (name === "INST") {
        const id = r.u32(); const cname = td.decode(r.str()); r.u8(); const c = r.u32(); const refs = r.refs(c);
        classes.set(id, { name: cname, refs });
        for (const ref of refs) { const inst: RInst = { ref, className: cname, props: {}, children: [], parent: null }; byRef.set(ref, inst); all.push(inst); }
      } else if (name === "PROP") {
        const id = r.u32(); const pname = td.decode(r.str()); const type = r.u8();
        const cls = classes.get(id); if (!cls) continue;
        try {
          const vals = readValues(r, type, cls.refs.length);
          cls.refs.forEach((ref, i) => { const inst = byRef.get(ref); if (inst && vals[i]) inst.props[pname] = vals[i]!; });
        } catch (e) { warnings.push(`${cls.name}.${pname}: ${(e as Error).message}`); }
      } else if (name === "PRNT") {
        r.u8(); const c = r.u32(); const ch = r.refs(c), pa = r.refs(c);
        for (let i = 0; i < c; i++) parents.push([ch[i]!, pa[i]!]);
      }
    } catch (e) { warnings.push(`${name}: ${(e as Error).message}`); }
  }
  const roots: RInst[] = [];
  const parented = new Set<number>();
  for (const [c, p] of parents) {
    const ci = byRef.get(c); if (!ci) continue; parented.add(c);
    const pi = p >= 0 ? byRef.get(p) : undefined;
    if (pi) { ci.parent = pi; pi.children.push(ci); } else roots.push(ci);
  }
  for (const i of all) if (!parented.has(i.ref)) roots.push(i);
  return { roots, all, sharedStrings, meta, warnings };
}

export function nameOf(i: RInst): string { const n = i.props.Name; return n && n.t === "string" ? n.v : i.className; }
