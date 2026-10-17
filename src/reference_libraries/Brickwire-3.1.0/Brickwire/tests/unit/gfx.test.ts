import test from "node:test";
import assert from "node:assert/strict";
import { GFX_STYLES, GFX_APPLY_LUAU, gfxStyle } from "../../shared/src/studio2/gfx.js";
import { postProcess, sharpen, saturation, vignette, drawText, exactSize } from "../../bridge/src/imaging-post.js";
import { blank, encodePng, decodePng, isPng, type RGBA } from "../../bridge/src/imaging.js";

function gradient(w: number, h: number): RGBA {
  const img = blank(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; img.data[i] = (x * 255 / w) | 0; img.data[i + 1] = 120; img.data[i + 2] = (y * 255 / h) | 0; img.data[i + 3] = 255; }
  return img;
}
const mean = (img: RGBA) => { let s = 0; for (let i = 0; i < img.data.length; i += 4) s += img.data[i] + img.data[i + 1] + img.data[i + 2]; return s / (img.data.length / 4) / 3; };
const chroma = (img: RGBA) => { let s = 0; for (let i = 0; i < img.data.length; i += 4) s += Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) - Math.min(img.data[i], img.data[i + 1], img.data[i + 2]); return s / (img.data.length / 4); };

test("M8-AC1: 6 styles with measurably different settings, Luau applies all of them", () => {
  assert.equal(GFX_STYLES.length, 6);
  const sig = new Set(GFX_STYLES.map((s) => JSON.stringify([s.lighting.ClockTime, s.lighting.Brightness, s.cc.Saturation, s.cc.Contrast, s.bloom.Intensity])));
  assert.equal(sig.size, 6);
  for (const k of ["BW_Gfx_CC", "BW_Gfx_Bloom", "BW_Gfx_DOF", "BW_Gfx_SunRays", "SetWaypoint", "BW_GfxStyle"]) assert.match(GFX_APPLY_LUAU, new RegExp(k));
  assert.throws(() => gfxStyle("nope"));
});

test("M8-AC2: exact PNG sizes 1920x1080 and 512x512 survive encode/decode", () => {
  const src = gradient(800, 600);
  for (const [size, w, h] of [["thumbnail", 1920, 1080], ["icon", 512, 512]] as const) {
    const png = encodePng(exactSize(src, size));
    assert.ok(isPng(png));
    const back = decodePng(png);
    assert.equal(back.width, w); assert.equal(back.height, h);
  }
});

test("M8: filters change the image in the expected direction", () => {
  const src = gradient(64, 36);
  assert.ok(chroma(saturation(src, 1.5)) > chroma(src));
  assert.ok(chroma(saturation(src, 0)) < 1);
  assert.ok(mean(vignette(src, 0.6)) < mean(src));
  const edge = blank(16, 16, [0, 0, 0, 255]); for (let y = 0; y < 16; y++) for (let x = 8; x < 16; x++) edge.data[(y * 16 + x) * 4] = 200;
  assert.ok(sharpen(edge, 1).data[(8 * 16 + 8) * 4] > 200);
  const t = drawText(blank(100, 40), "HI", { x: 5, y: 5, scale: 3, color: [255, 255, 255], outline: [255, 0, 0], outlinePx: 2 });
  let white = 0, red = 0; for (let i = 0; i < t.data.length; i += 4) { if (t.data[i] === 255 && t.data[i + 1] === 255) white++; else if (t.data[i] === 255) red++; }
  assert.ok(white > 0 && red > 0, "fill + outline drawn");
});

test("M8-AC3/AC4: text readable at 480x270, full pipeline works without any API key", () => {
  const { image, textPxAt480 } = postProcess(gradient(640, 360), { size: "thumbnail", ...gfxStyle("neon_night").post, text: { value: "POOR VS RICH\n+999999" } });
  assert.equal(image.width, 1920); assert.equal(image.height, 1080);
  assert.ok(textPxAt480 !== null && textPxAt480 >= 18, `text ${textPxAt480}px at 480x270`);
});
