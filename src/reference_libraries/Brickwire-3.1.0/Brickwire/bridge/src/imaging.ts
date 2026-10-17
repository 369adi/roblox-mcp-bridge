import zlib from "node:zlib";

/** Dependency-free image utilities for Brickwire 2.0: PNG decode/encode, crop/resize, PBR map derivation, GLB writer. */

export interface RGBA { width: number; height: number; data: Uint8Array } // 4 bytes / pixel

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(buf: Uint8Array): boolean { return buf.length > 8 && Buffer.from(buf.subarray(0, 8)).equals(SIG); }

/** Decode 8-bit (and 16-bit) non-interlaced PNG: gray, gray+alpha, RGB, RGBA, palette. */
export function decodePng(input: Uint8Array): RGBA {
  const buf = Buffer.from(input);
  if (!isPng(buf)) throw new Error("not a PNG file");
  let pos = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  let palette: Buffer | null = null, trns: Buffer | null = null;
  const idat: Buffer[] = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; interlace = body[12]; }
    else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (interlace) throw new Error("interlaced PNG is not supported — re-save without interlacing");
  if (depth !== 8 && depth !== 16 && !(ctype === 3 && depth <= 8)) throw new Error(`PNG bit depth ${depth} not supported`);
  const chans = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[ctype];
  if (!chans) throw new Error(`PNG color type ${ctype} not supported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = Math.max(1, (chans * depth) >> 3);
  const stride = Math.ceil((width * chans * depth) / 8);
  const pix = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pix.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = v & 0xff;
    }
    prev = out;
  }
  const data = new Uint8Array(width * height * 4);
  const sample = (row: number, i: number): number => {
    if (depth === 16) return pix[row * stride + i * 2];
    if (depth === 8) return pix[row * stride + i];
    const bitPos = i * depth, byte = pix[row * stride + (bitPos >> 3)];
    return (byte >> (8 - depth - (bitPos & 7))) & ((1 << depth) - 1);
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * 4, i = x * chans;
    if (ctype === 0) { const g = sample(y, i); data[o] = data[o + 1] = data[o + 2] = depth < 8 ? (g * 255) / ((1 << depth) - 1) : g; data[o + 3] = 255; }
    else if (ctype === 4) { data[o] = data[o + 1] = data[o + 2] = sample(y, i); data[o + 3] = sample(y, i + 1); }
    else if (ctype === 2) { data[o] = sample(y, i); data[o + 1] = sample(y, i + 1); data[o + 2] = sample(y, i + 2); data[o + 3] = 255; }
    else if (ctype === 6) { data[o] = sample(y, i); data[o + 1] = sample(y, i + 1); data[o + 2] = sample(y, i + 2); data[o + 3] = sample(y, i + 3); }
    else { const k = sample(y, i); if (!palette) throw new Error("palette PNG without PLTE"); data[o] = palette[k * 3]; data[o + 1] = palette[k * 3 + 1]; data[o + 2] = palette[k * 3 + 2]; data[o + 3] = trns && k < trns.length ? trns[k] : 255; }
  }
  return { width, height, data };
}

function chunk(type: string, body: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const tb = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tb));
  return Buffer.concat([len, tb, crc]);
}

/** Encode RGBA8 PNG (alpha dropped when fully opaque). */
export function encodePng(img: RGBA): Buffer {
  const { width, height, data } = img;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { opaque = false; break; }
  const ch = opaque ? 3 : 4, stride = width * ch;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 1; // Sub filter
    for (let x = 0; x < width; x++) for (let c = 0; c < ch; c++) {
      const v = data[(y * width + x) * 4 + c], left = x > 0 ? data[(y * width + x - 1) * 4 + c] : 0;
      raw[y * (stride + 1) + 1 + x * ch + c] = (v - left) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([SIG, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

export function blank(width: number, height: number, rgba: [number, number, number, number] = [0, 0, 0, 255]): RGBA {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width, height, data };
}

export function crop(img: RGBA, x0: number, y0: number, w: number, h: number): RGBA {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) out.data.set(img.data.subarray(((y + y0) * img.width + x0) * 4, ((y + y0) * img.width + x0 + w) * 4), y * w * 4);
  return out;
}

/** Center-crop to an aspect ratio. */
export function cropToAspect(img: RGBA, aspect: number): RGBA {
  const cur = img.width / img.height;
  if (Math.abs(cur - aspect) < 1e-3) return img;
  if (cur > aspect) { const w = Math.round(img.height * aspect); return crop(img, Math.floor((img.width - w) / 2), 0, w, img.height); }
  const h = Math.round(img.width / aspect); return crop(img, 0, Math.floor((img.height - h) / 2), img.width, h);
}

/** Bilinear resize (box-averaged first when shrinking by >2x). */
export function resize(img: RGBA, w: number, h: number): RGBA {
  let src = img;
  while (src.width >= w * 2 && src.height >= h * 2) src = half(src);
  const out = blank(w, h);
  const sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, (y + 0.5) * sy - 0.5), y0 = Math.floor(fy), y1 = Math.min(src.height - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, (x + 0.5) * sx - 0.5), x0 = Math.floor(fx), x1 = Math.min(src.width - 1, x0 + 1), tx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const p = (yy: number, xx: number) => src.data[(yy * src.width + xx) * 4 + c];
        const v = (p(y0, x0) * (1 - tx) + p(y0, x1) * tx) * (1 - ty) + (p(y1, x0) * (1 - tx) + p(y1, x1) * tx) * ty;
        out.data[(y * w + x) * 4 + c] = Math.round(v);
      }
    }
  }
  return out;
}
function half(img: RGBA): RGBA {
  const w = img.width >> 1, h = img.height >> 1, out = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    const p = (yy: number, xx: number) => img.data[(yy * img.width + xx) * 4 + c];
    out.data[(y * w + x) * 4 + c] = (p(2 * y, 2 * x) + p(2 * y, 2 * x + 1) + p(2 * y + 1, 2 * x) + p(2 * y + 1, 2 * x + 1) + 2) >> 2;
  }
  return out;
}

/** Fit an image to a target size (center crop to aspect, then resize). */
export function fit(img: RGBA, w: number, h: number): RGBA { return resize(cropToAspect(img, w / h), w, h); }

// ------------------------------------------------------------------ PBR

const lum = (img: RGBA, i: number) => (0.2126 * img.data[i * 4] + 0.7152 * img.data[i * 4 + 1] + 0.0722 * img.data[i * 4 + 2]) / 255;

function blurWrap(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r <= 0) return src;
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += src[y * w + ((x + k + w) % w)]; tmp[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += tmp[((y + k + h) % h) * w + x]; out[y * w + x] = s / n; }
  return out;
}

/** Make a texture tile seamlessly: blend with a half-offset copy using a cross-fade mask near the edges. */
export function makeSeamless(img: RGBA, blendFrac = 0.18): RGBA {
  const { width: w, height: h } = img, out = blank(w, h);
  const bw = Math.max(1, Math.floor(w * blendFrac)), bh = Math.max(1, Math.floor(h * blendFrac));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ex = Math.min(x, w - 1 - x) / bw, ey = Math.min(y, h - 1 - y) / bh;
    const t = Math.min(1, Math.min(ex, ey)); // 0 at edges → use offset copy (which is continuous there)
    const sm = t * t * (3 - 2 * t);
    const o = (y * w + x) * 4, o2 = (((y + (h >> 1)) % h) * w + ((x + (w >> 1)) % w)) * 4;
    for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(img.data[o + c] * sm + img.data[o2 + c] * (1 - sm));
  }
  return out;
}

export interface PbrOptions { normalStrength?: number; roughness?: number; roughnessContrast?: number; metalness?: number; invertHeight?: boolean; blur?: number }
export interface PbrMaps { color: RGBA; normal: RGBA; roughness: RGBA; metalness: RGBA; height: RGBA }

/**
 * Derive a PBR set from an albedo texture: height from luminance (detail-preserving blur),
 * tangent-space normal map via Sobel (OpenGL / +Y convention, which Roblox uses),
 * roughness from inverse cavity/luminance, constant metalness.
 */
export function derivePbr(albedo: RGBA, o: PbrOptions = {}): PbrMaps {
  const { width: w, height: h } = albedo, N = w * h;
  const strength = o.normalStrength ?? 2.5, baseR = o.roughness ?? 0.75, rc = o.roughnessContrast ?? 0.5, metal = o.metalness ?? 0;
  let hgt: Float32Array = new Float32Array(N);
  for (let i = 0; i < N; i++) hgt[i] = o.invertHeight ? 1 - lum(albedo, i) : lum(albedo, i);
  hgt = blurWrap(hgt, w, h, o.blur ?? 1);
  const at = (x: number, y: number) => hgt[((y + h) % h) * w + ((x + w) % w)];
  const normal = blank(w, h), rough = blank(w, h), metalImg = blank(w, h, [Math.round(metal * 255), Math.round(metal * 255), Math.round(metal * 255), 255]), height = blank(w, h);
  const low = blurWrap(hgt, w, h, Math.max(2, Math.round(w / 64)));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -gx * strength, ny = gy * strength, nz = 1; // +Y up (OpenGL)
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = y * w + x, p = i * 4;
    normal.data[p] = Math.round((nx * 0.5 + 0.5) * 255); normal.data[p + 1] = Math.round((ny * 0.5 + 0.5) * 255); normal.data[p + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    const cavity = hgt[i] - low[i]; // >0 = raised, <0 = crevice
    const r = Math.min(1, Math.max(0.04, baseR - cavity * rc * 4 + (0.5 - hgt[i]) * rc * 0.3));
    rough.data[p] = rough.data[p + 1] = rough.data[p + 2] = Math.round(r * 255);
    height.data[p] = height.data[p + 1] = height.data[p + 2] = Math.round(hgt[i] * 255);
  }
  return { color: albedo, normal, roughness: rough, metalness: metalImg, height };
}

// ------------------------------------------------------------------ GLB (glTF 2.0 binary)

/** Write a single-mesh GLB (positions, normals, optional UVs, uint32 indices). */
export function writeGlb(name: string, positions: number[][], triangles: number[][], normals?: number[][], uvs?: number[][]): Buffer {
  const vc = positions.length;
  const pos = new Float32Array(vc * 3), nor = normals ? new Float32Array(vc * 3) : null, uv = uvs ? new Float32Array(vc * 2) : null;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  positions.forEach((p, i) => { for (let k = 0; k < 3; k++) { pos[i * 3 + k] = p[k]; min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); } });
  normals?.forEach((n, i) => nor!.set(n, i * 3));
  uvs?.forEach((t, i) => uv!.set(t, i * 2));
  const idx = new Uint32Array(triangles.flat());
  const parts: Buffer[] = []; const views: object[] = []; const accessors: object[] = [];
  let off = 0;
  const add = (arr: Float32Array | Uint32Array, target: number, acc: object) => {
    const b = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength); parts.push(b);
    views.push({ buffer: 0, byteOffset: off, byteLength: b.length, target }); off += b.length;
    accessors.push({ bufferView: views.length - 1, ...acc }); return accessors.length - 1;
  };
  const attributes: Record<string, number> = { POSITION: add(pos, 34962, { componentType: 5126, count: vc, type: "VEC3", min, max }) };
  if (nor) attributes.NORMAL = add(nor, 34962, { componentType: 5126, count: vc, type: "VEC3" });
  if (uv) attributes.TEXCOORD_0 = add(uv, 34962, { componentType: 5126, count: vc, type: "VEC2" });
  const indices = add(idx, 34963, { componentType: 5125, count: idx.length, type: "SCALAR" });
  const bin = Buffer.concat(parts);
  const json = {
    asset: { version: "2.0", generator: "Brickwire 2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name }],
    meshes: [{ name, primitives: [{ attributes, indices, mode: 4 }] }], buffers: [{ byteLength: bin.length }], bufferViews: views, accessors,
  };
  let jb = Buffer.from(JSON.stringify(json)); if (jb.length % 4) jb = Buffer.concat([jb, Buffer.alloc(4 - (jb.length % 4), 0x20)]);
  const bb = bin.length % 4 ? Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]) : bin;
  const head = Buffer.alloc(12); head.write("glTF", 0, "ascii"); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  const ch = (len: number, type: number) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.writeUInt32LE(type, 4); return c; };
  return Buffer.concat([head, ch(jb.length, 0x4e4f534a), jb, ch(bb.length, 0x004e4942), bb]);
}

/** Wavefront OBJ text (1-based indices). */
export function writeObj(name: string, positions: number[][], triangles: number[][], uvs?: number[][]): string {
  const l = [`# Brickwire 2.0 procedural mesh`, `o ${name}`];
  for (const p of positions) l.push(`v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`);
  if (uvs) for (const t of uvs) l.push(`vt ${t[0].toFixed(4)} ${t[1].toFixed(4)}`);
  for (const t of triangles) l.push(uvs ? `f ${t.map((i) => `${i + 1}/${i + 1}`).join(" ")}` : `f ${t.map((i) => i + 1).join(" ")}`);
  return l.join("\n") + "\n";
}
