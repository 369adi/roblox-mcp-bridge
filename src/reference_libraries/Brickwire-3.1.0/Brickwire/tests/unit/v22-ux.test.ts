import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileUIDoc } from "../../shared/src/studio2/uidoc.js";
import { KITS } from "../../shared/src/library/catalog.js";

const find = (n: any, cls: string): any[] => [ ...(n.className === cls ? [n] : []), ...((n.children ?? []).flatMap((c: any) => find(c, cls))) ];

test("ui_build autoFix: TextScaled gets a UITextSizeConstraint", () => {
  const r = compileUIDoc({ name: "G", children: [{ type: "Label", name: "T", text: "Hi", textScaled: true, size: [0.3, 0, 0.1, 0] } as any] });
  const c = find(r.tree, "UITextSizeConstraint");
  assert.equal(c.length, 1);
  assert.equal(c[0].properties.MaxTextSize, 48);
  assert.ok(r.warnings.some((w) => w.startsWith("auto-fixed")));
});

test("ui_build autoFix:false keeps the old output", () => {
  const r = compileUIDoc({ name: "G", autoFix: false, children: [{ type: "Label", text: "Hi", textScaled: true } as any, { type: "Button", text: "Go" } as any] });
  assert.equal(find(r.tree, "UITextSizeConstraint").length, 0);
  assert.equal(find(r.tree, "LocalScript").length, 0);
});

test("ui_build: plain buttons get hover/press feedback + lint warnings", () => {
  const r = compileUIDoc({ name: "G", children: [
    { type: "Button", name: "Tiny", text: "x", size: [0, 30, 0, 30] } as any,
    { type: "Frame", name: "Huge", size: [0, 900, 0, 500] } as any,
    { type: "Frame", name: "Off", position: [1.5, 0, 0.5, 0] } as any,
  ] });
  const btn = find(r.tree, "TextButton")[0];
  assert.ok(btn.attributes?.BW_States);
  assert.equal(btn.properties.AutoButtonColor, false);
  assert.equal(find(r.tree, "LocalScript").length, 1);
  assert.ok(r.warnings.some((w) => w.includes("44 px")));
  assert.ok(r.warnings.some((w) => w.includes("phone screen")));
  assert.ok(r.warnings.some((w) => w.includes("outside the screen")));
});

test("library list hides UI style presets and the showcase demo", () => {
  const src = readFileSync("extension/src/ui/panel.ts", "utf8");
  assert.match(src, /LIB_KITS = KITS\.filter\(\(k\) => k\.kind !== "style" && k\.id !== "ui_showcase"\)/);
  const lib = KITS.filter((k) => k.kind !== "style" && k.id !== "ui_showcase");
  assert.ok(lib.length < KITS.length && lib.some((k) => k.kind === "ui"));
});

test("keep-awake + auto-resume + compact chat are wired", () => {
  const ka = readFileSync("extension/src/keepawake.ts", "utf8");
  assert.match(ka, /visibilityState/);
  assert.match(ka, /visibilitychange/);
  const core = readFileSync("extension/src/core/agent-core.ts", "utf8");
  assert.match(core, /autoResumes < 3/);
  assert.match(core, /pausedByBridge/);
  const ct = readFileSync("extension/src/content.ts", "utf8");
  assert.match(ct, /data-bw-label/);
  assert.match(ct, /bw-compact/);
  const b = readFileSync("scripts/build.mjs", "utf8");
  assert.match(b, /keepawake\.js"\], run_at: "document_start", world: "MAIN"/);
});
