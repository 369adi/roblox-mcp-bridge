// Realistic Notion-shape check for NotionAdapter (no extension needed):
//   node tests/browser/notion-shape.mjs [adapter.js]
// Page: placeholder vanishes with text, icon-only Send/Stop, attach+upload decoys, decoy editors,
// emoji picker on ":abc", silent thinking phase.
import { chromium } from "playwright";
import { buildSync } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
let bundle = process.argv[2];
if (!bundle) {
  bundle = "/tmp/notion-adapter.js";
  buildSync({ entryPoints: [path.join(here, "notion-entry.ts")], bundle: true, format: "iife", outfile: bundle, target: "chrome116" });
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/usr/local/bin/chromium", args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto("file://" + path.join(here, "notion-live-shape.html"));
await page.addScriptTag({ path: bundle });
const res = await page.evaluate(async () => {
  const out = {};
  const a = new window.NotionAdapter();
  const c = document.getElementById("composer");
  out.composerFound = a.getComposer() === c;
  out.sendFound = a.findSend?.call(a)?.id ?? null;
  // 1) normal send with the new marker format
  const id = "abcde";
  const ok1 = await a.sendMessage("Build a castle with **4 towers** and a `gate`.\n\n[bw-" + id + "]");
  out.send1 = ok1;
  out.sent1 = window.__sent.length;
  // 2) while it is "thinking" silently: generating must be true (icon-only Stop)
  window.__think = 2500;
  const p2 = a.sendMessage("Second message with enough text in it.\n\n[bw-fghij]");
  await new Promise((r) => setTimeout(r, 1200));
  out.generatingDuringThink = a.isGenerating();
  out.send2 = await p2;
  await new Promise((r) => setTimeout(r, 3500));
  out.generatingAfter = a.isGenerating();
  // 3) legacy colon marker: opens the emoji picker at the end of the text
  window.__think = 200;
  out.send3 = await a.sendMessage("Third message, legacy marker format here.\n\n[bw:klmno]");
  out.pickedEmoji = window.__pickedEmoji || 0;
  out.totalSent = window.__sent.length;
  out.leftInBox = c.innerText.trim().slice(0, 40);
  out.diagnose = a.diagnose().lines;
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
const checks = {
  "composer found and kept": res.composerFound,
  "send = the arrow button (not upload/attach)": res.sendFound === "send",
  "3 of 3 messages sent": res.send1 && res.send2 && res.send3 && res.totalSent === 3,
  "icon-only Stop seen while thinking silently": res.generatingDuringThink,
  "no emoji picked by Enter": res.pickedEmoji === 0,
  "message box empty at the end": res.leftInBox === "",
};
let bad = 0;
for (const [k, v] of Object.entries(checks)) {
  console.log(`${v ? "✔" : "✖"} ${k}`);
  if (!v) bad++;
}
process.exit(bad ? 1 : 0);
