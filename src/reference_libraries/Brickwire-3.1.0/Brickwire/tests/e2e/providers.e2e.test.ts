/**
 * Full-stack E2E with the REAL extension (unpacked, MV3) in Chromium + REAL bundled bridge
 * + mock Studio MCP (stdio). Provider sites are served as mock pages on their real domains.
 * Mirrors the mandatory Roblox test: inspect Workspace → create AgentTestPart → delete it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Page } from "playwright";
import { launch, startBridge, studioState, findChild } from "./harness.js";
import { PROVIDERS } from "../../shared/src/providers.js";

const FAST = { settleMs: 600 };
// DOM-shape smoke tests against simplified mocks (NOT proof the live site works — see deepseek-live.e2e for the realistic test)
const SUPPORTED = PROVIDERS;

async function waitFor<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!pred(v)) {
    if (Date.now() > end) throw new Error(`timeout waiting for ${what}; last=${JSON.stringify(v).slice(0, 600)}`);
    await new Promise((r) => setTimeout(r, 200));
    v = await fn();
  }
  return v;
}
const replies = (page: Page) => page.evaluate(() => (window as any).__mock.replies as string[]);
const sent = (page: Page) => page.evaluate(() => (window as any).__mock.sent as string[]);
const composerSel = "#bottom textarea, #bottom [contenteditable='true']";

async function userSays(page: Page, text: string) {
  const c = page.locator(composerSel).first();
  await c.click();
  await c.fill(text);
  await c.press("Enter");
}

for (const prov of SUPPORTED) {
  test(`E2E ${prov.name}: inspect → create → delete through extension → bridge → MCP`, { timeout: 150000 }, async () => {
    const bridge = await startBridge();
    const { ctx, close } = await launch({ settings: FAST });
    try {
      const page = await ctx.newPage();
      await page.goto(prov.url);
      await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "panel connected");
      if (prov.id === "notion") {
        // the panel must sit at the AI chat box, never at the page editor (decoy contenteditable)
        assert.equal(await page.locator(".notion-page-content [data-brickwire-host]").count(), 0, "not mounted in the page");
        // Notion: the panel floats (outside Notion's React tree) unless the user docks it
        assert.equal(await page.locator("[data-brickwire-host]").count() >= 1, true, "panel mounted");
      }

      // 1) inspect — task typed in the composer, then Start Session
      await page.locator(composerSel).first().fill("Inspect the current Roblox project and tell me what objects exist in Workspace.");
      await page.locator("#start").click();
      const r1 = await waitFor(() => replies(page), (r) => r.some((x) => x.includes("Workspace contains")), 30000, "inspect reply");
      const answer = r1.find((x) => x.includes("Workspace contains"))!;
      for (const n of ["Camera", "Baseplate", "SpawnLocation"]) assert.ok(answer.includes(n), `answer lists ${n}: ${answer}`);
      const s1 = await sent(page);
      assert.ok(/^\[Roblox Agent — session/.test(s1[0]), "instructions injected first");
      assert.ok(s1.some((m) => m.includes("<ROBLOX_TOOL_RESULT>") && m.includes('"status":"success"')), "real tool result injected");

      // 2) create — user message mid-session
      await userSays(page, "Create a Part named AgentTestPart in Workspace.");
      await waitFor(() => replies(page), (r) => r.some((x) => x.includes("Verified: game.Workspace.AgentTestPart is a Part")), 45000, "create verified");
      const s2 = await sent(page);
      assert.ok(s2.some((m) => m.startsWith("[Roblox Agent] You reported done")), "unverified DONE triggered a verify reminder");
      const part = findChild(studioState(bridge.stateFile), "Workspace", "AgentTestPart");
      assert.equal(part?.className, "Part", "AgentTestPart exists in (mock) Studio");

      // 3) delete — destructive → approval in panel
      await userSays(page, "Delete AgentTestPart.");
      await page.locator("#approve").waitFor({ state: "visible", timeout: 30000 });
      assert.match((await page.locator("#apTool").textContent()) ?? "", /delete_instance/);
      await page.locator("#approve").click();
      await waitFor(() => replies(page), (r) => r.some((x) => x.includes("Verified: AgentTestPart no longer exists.")), 45000, "delete verified");
      assert.equal(findChild(studioState(bridge.stateFile), "Workspace", "AgentTestPart"), undefined, "AgentTestPart deleted");
      assert.ok(findChild(studioState(bridge.stateFile), "Workspace", "Baseplate"), "Baseplate untouched (DeepSeek think-block call ignored)");

      // stop session from the panel
      await page.locator("#start").click();
      const h = await waitFor(async () => (await (await fetch(`http://127.0.0.1:${bridge.port}/api/health`)).json()) as any, (x) => x.session === null, 10000, "session stopped");
      assert.equal(h.state, "MCP_READY");
      const logs = (await (await fetch(`http://127.0.0.1:${bridge.port}/api/logs?calls=1&limit=100`)).json()) as any;
      assert.ok(!logs.logs.some((l: any) => l.args?.path === "game.Workspace.Baseplate"), "no call touched Baseplate");
    } finally {
      await close();
      await bridge.stop();
    }
  });
}

test("E2E reminder: AI answers without tools → agent reminder → continues", { timeout: 90000 }, async () => {
  const bridge = await startBridge();
  const { ctx, close } = await launch({ settings: FAST, lazy: ["chatgpt"] });
  try {
    const page = await ctx.newPage();
    await page.goto("https://chatgpt.com/");
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "connected");
    await page.locator(composerSel).first().fill("Inspect the current Roblox project and tell me what objects exist in Workspace.");
    await page.locator("#start").click();
    await waitFor(() => replies(page), (r) => r.some((x) => x.includes("Workspace contains")), 40000, "answer after reminder");
    assert.ok((await sent(page)).some((m) => m.startsWith("[Roblox Agent] Reminder")), "reminder sent");
  } finally {
    await close();
    await bridge.stop();
  }
});

test("E2E errors: bridge offline / Studio unavailable / Arena battle", { timeout: 90000 }, async () => {
  const { ctx, close } = await launch({ settings: FAST });
  try {
    // bridge offline
    const page = await ctx.newPage();
    await page.goto("https://chat.deepseek.com/");
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Bridge offline", 15000, "offline state");
    await page.locator("#start").click();
    await waitFor(() => page.locator("#note").textContent(), (t) => /Bridge offline/.test(t ?? ""), 10000, "offline notice");

    // Studio unavailable
    const bridge = await startBridge({ MOCK_NO_STUDIO: "1" });
    try {
      await waitFor(() => page.locator("#state").textContent(), (t) => t === "Bridge connected", 15000, "studio not found");
      await page.locator("#start").click();
      await waitFor(() => page.locator("#note").textContent(), (t) => /Studio not ready/.test(t ?? ""), 10000, "studio notice");
      const h = (await (await fetch(`http://127.0.0.1:${bridge.port}/api/health`)).json()) as any;
      assert.equal(h.session, null, "no session started");
    } finally {
      await bridge.stop();
    }

    // Arena battle mode blocked (bridge not required for the check)
    const arena = await ctx.newPage();
    await arena.goto("https://lmarena.ai/c/battle");
    await arena.locator("#start").waitFor({ timeout: 15000 });
    await arena.locator("#start").click();
    await waitFor(() => arena.locator("#note").textContent(), (t) => /Direct mode/.test(t ?? ""), 10000, "arena block");

  } finally {
    await close();
  }
});

test("E2E Notion: disabled in Options → no panel; enabled → Site check + Dev log control; decoy page never touched", { timeout: 90000 }, async () => {
  const off = await launch({ settings: { ...FAST, providers: { notion: false } } });
  try {
    const p = await off.ctx.newPage();
    await p.goto("https://www.notion.so/chat");
    await p.waitForTimeout(2500);
    assert.equal(await p.locator("[data-brickwire-host]").count(), 0, "disabled → not injected");
  } finally {
    await off.close();
  }
  const bridge = await startBridge();
  const { ctx, close } = await launch({ settings: FAST });
  try {
    const page = await ctx.newPage();
    await page.goto("https://www.notion.so/chat");
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "connected");
    assert.equal(await page.locator("#nlog").count(), 1, "Dev log control (Notion only)");
    const note = await waitFor(
      async () => {
        await page.locator("#check").click();
        return (await page.locator("#note").textContent()) ?? "";
      },
      (t) => /background timer: alive/.test(t),
      10000,
      "site check",
    );
    assert.match(note, /message box: <div contenteditable> "Ask AI anything/);
    assert.match(note, /background timer: alive/);
    assert.match(note, /Result: OK/);
    await page.locator("#nlog").selectOption("on");
    await page.locator(composerSel).first().fill("Inspect the current Roblox project and tell me what objects exist in Workspace.");
    await page.locator("#start").click();
    await waitFor(() => replies(page), (r) => r.some((x) => x.includes("Workspace contains")), 30000, "inspect reply");
    const first = (await sent(page))[0];
    assert.match(first, /NOTION MODE/);
    assert.match(first, /DEV LOG is ON/);
    assert.match(first, /\[bw-[a-z0-9]{5}\]$/, "delivery marker appended (no colon)");
    assert.equal(await page.locator(".notion-page-content [contenteditable]").textContent(), "Game spec: castle with 4 towers", "page editor untouched");
  } finally {
    await close();
    await bridge.stop();
  }
});

test("E2E delivery watchdog: the site silently drops the first message → Brickwire resends it", { timeout: 90000 }, async () => {
  const bridge = await startBridge();
  const { ctx, close } = await launch({ settings: FAST });
  try {
    const page = await ctx.newPage();
    await page.goto("https://grok.com/");
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "connected");
    await page.evaluate(() => ((window as any).__mock.dropNext = 1));
    await page.locator(composerSel).first().fill("Inspect the current Roblox project and tell me what objects exist in Workspace.");
    await page.locator("#start").click();
    await waitFor(() => replies(page), (r) => r.some((x) => x.includes("Workspace contains")), 45000, "reply after resend");
    const dropped = await page.evaluate(() => (window as any).__mock.dropped as string[]);
    assert.equal(dropped.length, 1, "first send was dropped by the site");
    assert.equal((await sent(page))[0], dropped[0], "the same message was delivered again");
  } finally {
    await close();
    await bridge.stop();
  }
});

test("E2E Library: previews load, 'Build this' starts the agent with BW.kit, 'Make something like it' becomes a new turn", { timeout: 90000 }, async () => {
  const bridge = await startBridge();
  const { ctx, close } = await launch({ settings: FAST });
  try {
    const page = await ctx.newPage();
    await page.goto(PROVIDERS.find((p) => p.id === "chatgpt")!.url);
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "connected");
    await page.locator("#tabLib").click();
    await waitFor(() => page.locator("#libGrid .card").count(), (n) => n >= 90, 10000, "library cards (kits + icons)");
    await page.locator('#libGrid .card[data-id="cottage"] img').waitFor({ state: "attached", timeout: 10000 });
    await page.locator("#libQ").fill("ferris");
    await waitFor(() => page.locator("#libGrid .card").count(), (n) => n === 1, 5000, "search filters");
    await page.locator("#libQ").fill("");
    await page.locator('#libGrid .card[data-id="cottage"]').click();
    await page.locator("#libNotes").fill("blue roof");
    await page.locator("#libExact").click();
    const s1 = await waitFor(() => sent(page), (s) => s.length > 0, 20000, "prompt sent");
    assert.match(s1[0], /^\[Roblox Agent — session/);
    assert.match(s1[0], /BW\.kit\("cottage"/);
    assert.match(s1[0], /blue roof/);
    assert.match(s1[0], /RESOURCE LIBRARY/);
    await waitFor(() => page.locator("#vAgent").isVisible(), (v) => v, 5000, "back on the Agent tab");
    // while running: another resource → sent as a new user turn
    await waitFor(() => page.evaluate(() => (window as any).__mock.replies.length as number), (n) => n >= 1, 20000, "first reply");
    await page.locator("#tabLib").click();
    await page.locator('#libGrid .card[data-id="coins"]').click();
    await page.locator("#libLike").click();
    await waitFor(() => sent(page), (s) => s.some((m) => m.startsWith("NEW USER REQUEST") && /LIKE the library resource "Collectible coins"/.test(m)), 30000, "library request as a new turn");
    await page.locator("#start").click();
  } finally {
    await close();
    await bridge.stop();
  }
});

test("E2E Library → Community: catalogue loads, filters, thumbnails via the worker, 'Use in my game' sends a task with the asset id", { timeout: 90000 }, async () => {
  const bridge = await startBridge();
  const { ctx, close } = await launch({ settings: FAST });
  try {
    const page = await ctx.newPage();
    await page.goto(PROVIDERS.find((p) => p.id === "chatgpt")!.url);
    await waitFor(() => page.locator("#state").textContent(), (t) => t === "Studio Ready", 15000, "connected");
    await page.locator("#tabLib").click();
    await page.locator('#libSrc button[data-s="cm"]').click();
    await waitFor(() => page.locator("#libGrid .card").count(), (n) => n === 60, 15000, "first page of community cards");
    await waitFor(() => page.locator("#libCats .chip").count(), (n) => n >= 10, 5000, "community categories");
    await page.locator("#libQ").fill("halftone");
    await waitFor(() => page.locator("#libGrid .card").count(), (n) => n >= 3 && n <= 60, 5000, "search filters");
    await waitFor(() => page.locator("#libGrid .card img").count(), (n) => n >= 1, 20000, "thumbnail loaded through the service worker");
    await page.locator("#libGrid .card").first().click();
    await page.locator("#cmAsset").fill("1234567890");
    await page.locator("#libNotes").fill("behind the shop title");
    await page.locator("#cmUse").click();
    const s1 = await waitFor(() => sent(page), (s) => s.length > 0, 20000, "prompt sent");
    assert.match(s1[0], /Community resource "[^"]*Halftone/i);
    assert.match(s1[0], /rbxassetid:\/\/1234567890/);
    assert.match(s1[0], /behind the shop title/);
    // back to Brickwire source
    await page.locator("#tabLib").click();
    await page.locator('#libSrc button[data-s="bw"]').click();
    await waitFor(() => page.locator("#libGrid .card").count(), (n) => n >= 90, 5000, "brickwire cards again");
    await page.locator("#start").click();
  } finally {
    await close();
    await bridge.stop();
  }
});
