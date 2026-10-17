/**
 * THE acceptance chain, as close to reality as possible without Roblox Studio on this machine:
 *
 *   realistic DeepSeek page → REAL unpacked extension (MV3, Chromium) → provider adapter → agent core
 *   → background SW → REAL bundled bridge → stdio MCP client → StudioMCP stand-in that runs the AI's
 *   Luau for real in the Luau VM → result → bridge → extension → injected into the DeepSeek chat → AI continues.
 *
 * The page replica reproduces the live-site traits that broke the old build (shared send/stop button
 * without aria-label, reasoning phase with no stop glyph, 2.6 s mid-stream pauses, DOM re-renders,
 * draft tool calls inside reasoning). The MCP stand-in reproduces StudioMCP's "0 tools until Studio
 * attaches" and "errors reported as normal text".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { ROOT, EXT } from "./harness.js";

const PAGE_JS = fs.readFileSync(path.join(ROOT, "tests", "mocks", "pages", "deepseek-live.js"), "utf8");
const PORT = 47821;
const LUAU = process.env.LUAU_BIN ?? "/data/tools/luau/luau";
const skip = !fs.existsSync(LUAU) ? `luau binary not found at ${LUAU}` : false;

async function until<T>(fn: () => Promise<T>, pred: (v: T) => boolean, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms;
  let v = await fn();
  while (!pred(v)) {
    if (Date.now() > end) {
      fs.writeFileSync(path.join(os.tmpdir(), "bw-e2e-last.json"), JSON.stringify(v, null, 1));
      throw new Error(`timeout waiting for ${what}; full state in ${path.join(os.tmpdir(), "bw-e2e-last.json")}; last=${JSON.stringify(v).slice(-900)}`);
    }
    await new Promise((r) => setTimeout(r, 250));
    v = await fn();
  }
  return v;
}
const health = async () => {
  try {
    return (await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json()) as { state: string; reason: string; mcp: { toolCount: number }; session: unknown };
  } catch {
    return { state: "OFFLINE", reason: "", mcp: { toolCount: 0 }, session: null };
  }
};
const mock = (page: Page) => page.evaluate(() => (window as any).__mock as { sent: string[]; replies: string[]; aborted: number; sendsWhileBusy: number; reloads?: number });
const panel = (page: Page, sel: string) => page.evaluate((s) => (document.querySelector("[data-brickwire-host]") as HTMLElement)?.shadowRoot?.querySelector(s)?.textContent ?? null, sel);
const panelDot = (page: Page) => page.evaluate(() => (document.querySelector("[data-brickwire-host]") as HTMLElement)?.shadowRoot?.querySelector("#dot")?.className ?? null);
const clickPanel = (page: Page, sel: string) => page.evaluate((s) => ((document.querySelector("[data-brickwire-host]") as HTMLElement).shadowRoot!.querySelector(s) as HTMLElement).click(), sel);
async function userSays(page: Page, text: string) {
  await page.fill("textarea", text);
  await page.press("textarea", "Enter");
}
const tree = (f: string) => JSON.parse(fs.readFileSync(f, "utf8"));
const wsNames = (f: string) => (tree(f).children.find((c: any) => c.name === "Workspace")?.children ?? []).map((c: any) => c.name);

test("DeepSeek live replica: normal chat untouched; agent inspects, creates and deletes through the real chain", { skip, timeout: 240000 }, async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "bw-live-"));
  const stateFile = path.join(home, "studio.json");
  let out = "";
  const bridge = spawn(process.execPath, [path.join(ROOT, "bridge", "dist", "bridge.mjs")], {
    env: {
      ...process.env,
      BRICKWIRE_HOME: home,
      BRICKWIRE_PORT: String(PORT),
      BRICKWIRE_MCP_COMMAND: process.execPath,
      BRICKWIRE_MCP_ARGS: JSON.stringify([path.join(ROOT, "tests", "mocks", "studio-mcp-luau.mjs")]),
      BRICKWIRE_STUDIO_POLL_MS: "1000",
      MOCK_ATTACH_MS: "16000", // Studio attaches only well after the MCP handshake + initial tool retries
      MOCK_STATE_FILE: stateFile,
      LUAU_BIN: LUAU,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  bridge.stdout!.on("data", (d) => (out += d));
  bridge.stderr!.on("data", (d) => (out += d));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-chrome-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-sandbox", "--headless=new"],
    viewport: { width: 1280, height: 900 },
  });
  try {
    await ctx.route("https://chat.deepseek.com/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<!doctype html><html><head><meta charset="utf-8"></head><body><script>${PAGE_JS}</script></body></html>` }));
    const page = await ctx.newPage();
    await page.goto("https://chat.deepseek.com/");

    // 1. Status must be honest: bridge up, MCP handshake done, but Studio not attached → YELLOW, never green.
    await until(health, (h) => h.state !== "OFFLINE", 15000, "bridge up");
    const early = await health();
    assert.notEqual(early.state, "MCP_READY", `must not claim ready with ${early.mcp.toolCount} tools: ${early.reason}`);
    await until(() => panelDot(page), (c) => c === "dot y", 15000, "yellow dot while Studio unavailable");

    // 2. Agent OFF → the site works normally; nothing is intercepted.
    await userSays(page, "hi there");
    await until(() => mock(page), (m) => m.replies.length === 1, 20000, "normal reply");
    assert.deepEqual((await mock(page)).sent, ["hi there"]);

    // 3. Studio attaches later → bridge picks the tools up by itself → GREEN.
    await until(health, (h) => h.state === "MCP_READY", 30000, "MCP ready after Studio attach");
    await until(() => panelDot(page), (c) => c === "dot g", 10000, "green dot");
    assert.equal(await panel(page, "#state"), "Studio Ready");

    // 4. Per-AI settings in the panel: category Build. Start Agent → instructions (with Build focus) → AI ready.
    await page.locator("#cat").selectOption("build");
    await clickPanel(page, "#start");
    await until(() => mock(page), (m) => m.replies.length === 2, 30000, "ready reply");
    assert.match((await mock(page)).sent[1], /^\[Roblox Agent — session/);
    assert.match((await mock(page)).sent[1], /BUILD playbook/, "category from the panel reaches the prompt");
    assert.match((await mock(page)).sent[1], /<ROBLOX_LUAU mode="Edit">/, "prompt teaches the raw Luau block");

    // 5. Inspect → REAL data comes back from the Luau-backed DataModel.
    await userSays(page, "Inspect the current Workspace and tell me what objects exist.");
    const r1 = await until(() => mock(page), (m) => m.replies.some((x) => x.startsWith("Workspace contains")), 60000, "inspect answer");
    const answer = r1.replies.find((x) => x.startsWith("Workspace contains"))!;
    assert.match(answer, /Camera \(Camera\)/);
    assert.match(answer, /Baseplate \(Part\)/);
    assert.ok(r1.sent.some((s) => s.includes("<ROBLOX_TOOL_RESULT>") && s.includes('"status":"success"')), "real tool result injected");

    // 6. Create → Studio changes → AI verifies.
    await userSays(page, "Create a Part named ZeroScriptTestPart in Workspace.");
    await until(() => mock(page), (m) => m.replies.some((x) => x.startsWith("Verified: ZeroScriptTestPart exists")), 90000, "create verified");
    assert.ok(wsNames(stateFile).includes("ZeroScriptTestPart"), "part exists in the DataModel");
    const createOut = (await mock(page)).sent.find((s) => s.includes("notes=240"));
    assert.ok(createOut, "the whole 245-line raw Luau script ran (notes=240 printed by Studio)");

    // 7. Delete → destructive → approval in the panel → executed → verified gone.
    await userSays(page, "Delete ZeroScriptTestPart.");
    await until(() => panel(page, "#apTool"), (t) => !!t && t.includes("execute_luau"), 60000, "approval prompt");
    assert.match((await panel(page, "#apCode")) ?? "", /p:Destroy\(\)/, "approval box shows the full code");
    // 7b. The user reloads the page (F5) while the approval is pending → nothing is lost:
    //     the agent comes back active with its activity log, re-attaches to the SAME bridge call
    //     (no re-execution) and shows the approval again.
    await page.reload();
    await until(() => panel(page, "#apTool"), (t) => !!t && t.includes("execute_luau"), 30000, "approval prompt restored after reload");
    assert.equal((await mock(page)).reloads, 1);
    const act = (await panel(page, "#act")) ?? "";
    assert.match(act, /Page reloaded — agent restored/, "activity log restored after reload");
    assert.match(act, /search_game_tree/, "earlier activity rows restored");
    assert.match((await panel(page, "#apCode")) ?? "", /p:Destroy\(\)/);
    if (process.env.BW_SHOT) await page.locator("[data-brickwire-host]").screenshot({ path: process.env.BW_SHOT });
    await clickPanel(page, "#approveAll");
    await until(() => mock(page), (m) => m.replies.some((x) => x.startsWith("Verified: ZeroScriptTestPart is gone")), 90000, "delete verified");
    const names = wsNames(stateFile);
    assert.ok(!names.includes("ZeroScriptTestPart"), "part removed");
    assert.ok(names.includes("Baseplate"), "draft tool calls inside DeepThink reasoning were never executed");

    // 8. Nothing was sent while the AI was generating (that would hit DeepSeek's stop button).
    const m = await mock(page);
    assert.equal(m.aborted, 0, "no reply was aborted");
    assert.equal(m.sendsWhileBusy, 0);
    // exactly one execution per call id (no duplicates from re-renders)
    const calls = out.split("\n").filter((l) => l.includes('"event":"tool.call"'));
    const logs = fs.readdirSync(path.join(home, "data", "logs")).map((f) => fs.readFileSync(path.join(home, "data", "logs", f), "utf8")).join("\n");
    const execLines = logs.split("\n").filter((l) => l.includes('"event":"tool.call"'));
    assert.equal(execLines.length, 5, `expected 5 tool executions (inspect, create, verify, delete, verify), got ${execLines.length}\n${execLines.join("\n")}${calls.length}`);
  } finally {
    await ctx.close();
    bridge.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
