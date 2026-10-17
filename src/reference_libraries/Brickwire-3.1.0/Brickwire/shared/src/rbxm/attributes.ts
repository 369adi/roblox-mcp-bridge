/** Decoder for the binary `AttributesSerialize` blob (common attribute types only; stops at unknown types). */
import type { PV } from "./pack.js";

export function decodeAttributes(b64: string): Record<string, PV> {
  const b = Buffer.from(b64, "base64");
  const out: Record<string, PV> = {};
  if (b.length < 4) return out;
  let p = 0;
  const u32 = () => { const v = b.readUInt32LE(p); p += 4; return v; };
  const f32 = () => { const v = b.readFloatLE(p); p += 4; return v; };
  const f64 = () => { const v = b.readDoubleLE(p); p += 8; return v; };
  const str = () => { const n = u32(); const s = b.toString("utf8", p, p + n); p += n; return s; };
  const r = (x: number) => Math.round(x * 1e4) / 1e4;
  try {
    const count = u32();
    for (let i = 0; i < count; i++) {
      const key = str();
      const t = b[p++];
      switch (t) {
        case 0x02: out[key] = str(); break;
        case 0x03: out[key] = b[p++] !== 0; break;
        case 0x04: out[key] = r(f32()); break; // float
        case 0x06: out[key] = r(f64()); break; // double (number)
        case 0x09: { const s = f32(); const o = b.readInt32LE(p); p += 4; out[key] = ["U", r(s), o]; break; }
        case 0x0a: { const xs = f32(); const xo = b.readInt32LE(p); p += 4; const ys = f32(); const yo = b.readInt32LE(p); p += 4; out[key] = ["U2", r(xs), xo, r(ys), yo]; break; }
        case 0x0e: out[key] = ["BC", u32()]; break;
        case 0x0f: out[key] = ["C3", r(f32()), r(f32()), r(f32())]; break;
        case 0x10: out[key] = ["V2", r(f32()), r(f32())]; break;
        case 0x11: out[key] = ["V3", r(f32()), r(f32()), r(f32())]; break;
        case 0x1b: out[key] = ["NR", r(f32()), r(f32())]; break;
        default: return out; // unknown layout: keep what we have
      }
    }
  } catch { /* truncated */ }
  return out;
}
