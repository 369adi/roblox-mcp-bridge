import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { slimResult, formatToolResults, buildAgentPrompt } from "../../shared/src/instructions.js";
import { defaultMcpLauncher } from "../../bridge/src/config.js";
import { guideFor, GUIDE_TOPICS } from "../../shared/src/guides.js";
import { usesLibrary } from "../../shared/src/bw-luau.js";
import { KITS } from "../../shared/src/library/catalog.js";

test("1.8.2 slimResult: drops thumbnails, data URLs, free CDN urls; cuts long descriptions; parses JSON text", () => {
  const big = "x".repeat(1000);
  const r = slimResult({
    items: [{ name: "Sword", thumbnailUrl: "https://tr.rbxcdn.com/abc/420/420/Image/Png", description: big, image: "data:image/png;base64,AAAA" }],
    text: JSON.stringify({ assetId: 1, thumbnail: "https://x", nextSteps: ["insert it"] }),
  }) as { items: Record<string, string>[]; text: string };
  const it = r.items[0]!;
  assert.equal(it.name, "Sword");
  assert.equal(it.thumbnailUrl, undefined);
  assert.equal(it.image, undefined);
  assert.ok(it.description!.length < 300 && it.description!.endsWith("…"));
  const inner = JSON.parse(r.text);
  assert.equal(inner.assetId, 1);
  assert.equal(inner.thumbnail, undefined);
});

test("1.8.2 formatToolResults: repeated nextSteps are sent once", () => {
  const ns = ["Use insert_asset next", "Then position it"];
  const msg = formatToolResults(
    [1, 2, 3].map((i) => ({ id: "c" + i, status: "success" as const, result: { id: i, nextSteps: ns }, error: null })),
    20000,
  );
  assert.equal(msg.split("Use insert_asset next").length - 1, 1);
});

test("1.8.2 BRICKWIRE_STUDIO_MCP_PATH: a stale pinned folder loses to StudioMCP next to the running Studio", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bw-mcp-"));
  const oldDir = path.join(d, "version-old"), newDir = path.join(d, "version-new");
  for (const x of [oldDir, newDir]) {
    fs.mkdirSync(x);
    fs.writeFileSync(path.join(x, "StudioMCP.exe"), "");
  }
  const prev = process.env.BRICKWIRE_STUDIO_MCP_PATH;
  process.env.BRICKWIRE_STUDIO_MCP_PATH = oldDir;
  try {
    assert.equal(defaultMcpLauncher("win32", []).command, path.join(oldDir, "StudioMCP.exe"));
    assert.equal(defaultMcpLauncher("win32", [path.join(oldDir, "RobloxStudioBeta.exe")]).command, path.join(oldDir, "StudioMCP.exe"));
    const r = defaultMcpLauncher("win32", [path.join(newDir, "RobloxStudioBeta.exe")]);
    assert.equal(r.command, path.join(newDir, "StudioMCP.exe"));
    assert.match(r.reason, /running Studio/);
  } finally {
    if (prev === undefined) delete process.env.BRICKWIRE_STUDIO_MCP_PATH;
    else process.env.BRICKWIRE_STUDIO_MCP_PATH = prev;
  }
});

test("1.9 cutscene guide, kits and prompt", () => {
  assert.ok((GUIDE_TOPICS as readonly string[]).includes("cutscene"));
  const g = guideFor("cutscene")!;
  for (const w of ["Skip", "SERVER", "animedice", "BW.cutsceneCheck", "1 in", "case 4–6 s", "egg 3–5 s"]) assert.ok(g.includes(w), w);
  for (const a of ["gacha", "case", "egg", "dice", "story"]) assert.equal(guideFor(a), g, a);
  for (const id of ["case_opening", "egg_hatch", "dice_roll", "event_start", "story_intro"]) assert.ok(KITS.some((k) => k.id === id), id);
  assert.ok(usesLibrary('BW.cutsceneCheck("case")') && usesLibrary("BW.cutscene{timeline = t}"));
  const tools = [{ name: "execute_luau", description: "Run Luau", available: true, inputSchema: {} }];
  const p = buildAgentPrompt({ providerName: "X", tools: tools as never, memorySummary: "", sessionId: "s", category: "animation", maxChars: 10000 });
  assert.match(p, /dice_roll/);
  assert.ok(p.length <= 9600, String(p.length));
});
