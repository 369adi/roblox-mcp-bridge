/** Minimal LZ4 *block* decoder (the format Roblox uses inside binary .rbxm/.rbxl chunks). */
export function lz4DecodeBlock(src: Uint8Array, outLen: number): Uint8Array {
  const out = new Uint8Array(outLen);
  let ip = 0, op = 0;
  while (ip < src.length) {
    const token = src[ip++]!;
    let lit = token >>> 4;
    if (lit === 15) { let b: number; do { b = src[ip++]!; lit += b; } while (b === 255 && ip < src.length); }
    if (op + lit > outLen) throw new Error("lz4: literal overflow");
    out.set(src.subarray(ip, ip + lit), op); ip += lit; op += lit;
    if (ip >= src.length) break;
    const off = src[ip]! | (src[ip + 1]! << 8); ip += 2;
    if (off === 0 || off > op) throw new Error("lz4: bad offset");
    let ml = token & 15;
    if (ml === 15) { let b: number; do { b = src[ip++]!; ml += b; } while (b === 255 && ip < src.length); }
    ml += 4;
    if (op + ml > outLen) throw new Error("lz4: match overflow");
    let m = op - off;
    for (let i = 0; i < ml; i++) out[op++] = out[m++]!;
  }
  if (op !== outLen) throw new Error(`lz4: size mismatch ${op} != ${outLen}`);
  return out;
}
