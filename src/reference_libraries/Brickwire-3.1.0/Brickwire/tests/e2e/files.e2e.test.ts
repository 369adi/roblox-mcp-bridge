/**
 * E2E: the AI downloads a file by itself (file_fetch through the real bridge) and asks to see it (file_show):
 * the extension attaches the downloaded file to the AI chat composer before sending the tool results.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { launch, startBridge, studioState, findChild } from "./harness.js";
import { PROVIDERS } from "../../shared/src/providers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function waitFor<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms; let v = await fn();
  while (!pred(v)) { if (Date.now() > end) throw new Error(`timeout waiting for ${what}; last=${JSON.stringify(v).slice(0, 600)}`); await new Promise((r) => setTimeout(r, 200)); v = await fn(); }
  return v;
}

for (const id of ["chatgpt", "claude"]) {
  const prov = PROVIDERS.find((p) => p.id === id)!;
  test(`E2E ${prov.name}: AI downloads a file itself and sees it attached (file_fetch → file_show)`, { timeout: 120000 }, async () => {
    const files = http.createServer((req, res) => { if (req.url === "/assets/sword.png") { res.writeHead(200, { "Content-Type": "image/png" }); res.end(PNG); } else { res.writeHead(404); res.end(); } });
    await new Promise<void>((r) => files.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(files.address() as any).port}/assets/sword.png`;
    const bridge = await startBridge({ BRICKWIRE_FILES_ALLOW_PRIVATE: "1" }); // the test file server is local
    const { ctx, close } = await launch({ settings: { settleMs: 600 } });
    try {
      const page = await ctx.newPage();
      await page.goto(prov.url);
      await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "panel connected");
      await page.locator("#bottom textarea, #bottom [contenteditable='true']").first().fill(`Download the test file from ${url} and look at it.`);
      await page.locator("#start").click();
      const replies = await waitFor(() => page.evaluate(() => (window as any).__mock.replies as string[]), (r) => r.some((x) => x.includes("I can see the file")), 60000, "file reply");
      const answer = replies.find((x) => x.includes("I can see the file"))!;
      assert.match(answer, /sword\.png/, "the downloaded file was attached to the chat");
      const attached = await page.evaluate(() => (window as any).__mock.files as Array<{ name: string; type: string; size: number }>);
      assert.equal(attached.length, 1); assert.equal(attached[0].type, "image/png"); assert.equal(attached[0].size, PNG.length);
      const sent = await page.evaluate(() => (window as any).__mock.sent as string[]);
      assert.ok(sent.some((m) => m.includes("[Brickwire attached: sword.png]")), "results message notes the attachment");
      const list = await (await fetch(`http://127.0.0.1:${bridge.port}/api/files`)).json() as any;
      assert.equal(list.files[0].name, "sword.png"); assert.equal(list.files[0].kind, "image");
    } finally { await close(); await bridge.stop(); files.close(); }
  });
}

test("E2E ChatGPT: AI writes a whole file in a raw <ROBLOX_FILE> block and it lands in Studio as a Script", { timeout: 120000 }, async () => {
  const prov = PROVIDERS.find((p) => p.id === "chatgpt")!;
  const bridge = await startBridge({ BRICKWIRE_COMPOSITES: "0" }); // file tools must work even with optional tools off
  const { ctx, close } = await launch({ settings: { settleMs: 600 } });
  try {
    const page = await ctx.newPage();
    await page.goto(prov.url);
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "panel connected");
    const tools = await (await fetch(`http://127.0.0.1:${bridge.port}/api/tools`)).json() as any;
    const names = (tools.tools ?? tools).map((t: any) => t.name);
    for (const n of ["file_fetch", "file_save", "file_show", "file_to_studio", "file_upload_roblox"]) assert.ok(names.includes(n), `${n} registered`);
    await page.locator("#bottom textarea, #bottom [contenteditable='true']").first().fill("Write the coin script as a file.");
    await page.locator("#start").click();
    const replies = await waitFor(() => page.evaluate(() => (window as any).__mock.replies as string[]), (r) => r.some((x) => x.includes("File placed")), 60000, "file placed reply");
    assert.match(replies.find((x) => x.includes("File placed"))!, /ServerScriptService\.Coins status success/);
    const st = studioState(bridge.stateFile);
    const script = findChild(st, "ServerScriptService", "Coins");
    assert.equal(script?.className, "Script");
    assert.equal(script?.props?.Source ?? script?.source, 'local coins = {gold = "a\\"b"}\nprint("coins", coins.gold)\n');
  } finally { await close(); await bridge.stop(); }
});
