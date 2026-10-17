import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseAgentOutput, looksLikeQuestion } from "../../shared/src/parser.js";
import { buildAgentPrompt, superSection } from "../../shared/src/instructions.js";
import { MARKERS } from "../../shared/src/protocol.js";
import { packTask } from "../../shared/src/library/tasks.js";
import { guideFor } from "../../shared/src/guides.js";
import { findLuauRunner } from "../../bridge/src/bridge.js";
import { tasklistHasStudio } from "../../bridge/src/studio-detect.js";
import { findStudioMcpWindows, studioMcpPathFromText } from "../../bridge/src/config.js";

test("ASK marker → p.ask", () => {
  const p = parseAgentOutput(`Variant A: castle. Variant B: city. Which one?\n${MARKERS.ASK}`);
  assert.ok(p.ask);
});

test("untagged clarifying question → asksUser heuristic", () => {
  assert.equal(looksLikeQuestion("Я могу сделать два варианта. Какой тебе больше нравится?"), true);
  assert.equal(looksLikeQuestion("**Variant A** — obby. **Variant B** — tycoon. Which do you prefer?"), true);
  assert.equal(looksLikeQuestion("Built the tower. Everything verified."), false);
  assert.equal(parseAgentOutput("Built it. Done.").asksUser ?? false, false);
});

test("findLuauRunner maps open-source MCP servers", () => {
  assert.deepEqual(findLuauRunner([{ name: "run_code", inputSchema: { type: "object", properties: { command: { type: "string" } } } }]), { name: "run_code", codeKey: "command" });
  assert.deepEqual(findLuauRunner([{ name: "Eval", description: "Execute Luau in Studio", inputSchema: { type: "object", properties: { studio_id: { type: "string" }, body: { type: "string" } } } }]), { name: "Eval", codeKey: "body" });
  assert.equal(findLuauRunner([{ name: "get_tree", description: "tree", inputSchema: { type: "object", properties: {} } }]), null);
});

test("tasklist CSV detects both Studio image names", () => {
  assert.equal(tasklistHasStudio('"RobloxStudioBeta.exe","1234","Console","1","900,000 K"'), true);
  assert.equal(tasklistHasStudio('"RobloxStudio.exe","1","Console","1","1 K"'), true);
  assert.equal(tasklistHasStudio("INFO: No tasks are running which match the specified criteria."), false);
});

test("findStudioMcpWindows: Bloxstrap folders, running-Studio dirs first", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bw-mcp-"));
  const blox = path.join(tmp, "Bloxstrap", "Versions", "version-abc");
  fs.mkdirSync(blox, { recursive: true });
  fs.writeFileSync(path.join(blox, "StudioMCP.exe"), "");
  fs.writeFileSync(path.join(blox, "RobloxStudioBeta.exe"), "");
  assert.equal(findStudioMcpWindows({ LOCALAPPDATA: tmp }), path.join(blox, "StudioMCP.exe"));
  const live = path.join(tmp, "Custom", "Studio");
  fs.mkdirSync(live, { recursive: true });
  fs.writeFileSync(path.join(live, "StudioMCP.exe"), "");
  assert.equal(findStudioMcpWindows({ LOCALAPPDATA: tmp }, [live]), path.join(live, "StudioMCP.exe"));
  assert.equal(findStudioMcpWindows({ LOCALAPPDATA: path.join(tmp, "none") }), null);
  const exe = path.join(live, "StudioMCP.exe");
  assert.equal(studioMcpPathFromText(JSON.stringify({ mcpServers: { Roblox: { command: exe } } })), exe);
  assert.equal(studioMcpPathFromText('"/nope/StudioMCP"'), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const tools = [{ name: "execute_luau", description: "Run", inputSchema: {}, source: "mcp" as const, risk: "write" as const, available: true }];
test("prompt: think-first rule, asset library, guides; super section", () => {
  const p = buildAgentPrompt({ providerName: "X", tools, memorySummary: "", task: "Make a game", sessionId: "s", category: "build" });
  assert.match(p, new RegExp(MARKERS.ASK));
  assert.match(p, /BW\.asset/);
  assert.match(p, /brickwire_guide/);
  assert.doesNotMatch(p, /SUPER MODE/);
  const s = buildAgentPrompt({ providerName: "X", tools, memorySummary: "", task: "Make a game", sessionId: "s", category: "build", superMode: true });
  assert.match(s, /SUPER MODE/);
  const c = buildAgentPrompt({ providerName: "X", tools, memorySummary: "", task: "Make a game", sessionId: "s", category: "build", superMode: true, maxChars: 9600 });
  assert.ok(c.length <= 9600, `compact super prompt ${c.length}`);
  assert.ok(superSection(true).length < superSection(false).length);
});

test("guides and packTask", () => {
  for (const t of ["super", "camera", "animation", "gameplay", "assets"]) assert.ok((guideFor(t) ?? "").length > 200, t);
  const it = { id: "ndc/tree", n: "Tree", c: "Nature", k: "model", s: [4, 10, 4], t: 0 };
  assert.match(packTask(it, "place"), /BW\.asset\("ndc\/tree"/);
  assert.match(packTask({ ...it, k: "texture" }, "place"), /ApplyTo/);
  assert.match(packTask(it, "use", "near spawn"), /near spawn/);
});

test("stale proxy: candidates ordered by the Studio build, running Studio first", async () => {
  const { studioMcpCandidatesWindows } = await import("../../bridge/src/config.js");
  const { isStaleProxyError } = await import("../../bridge/src/mcp-client.js");
  assert.ok(isStaleProxyError("tools/call: Client proxy is out of date, restart to update (-32603)"));
  assert.ok(!isStaleProxyError("timeout"));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bw-cand-"));
  const mk = (dir: string, t: number, studio = true) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "StudioMCP.exe"), "");
    if (studio) fs.writeFileSync(path.join(dir, "RobloxStudioBeta.exe"), "");
    for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), t, t);
  };
  const v = path.join(tmp, "Roblox", "Versions");
  mk(path.join(v, "old"), 1000);
  mk(path.join(v, "new"), 5000);
  mk(path.join(v, "orphan"), 9000, false);
  const list = studioMcpCandidatesWindows({ LOCALAPPDATA: tmp }, [path.join(v, "old")]);
  assert.deepEqual(list.map((f) => path.basename(path.dirname(f))), ["old", "new", "orphan"]);
  assert.equal(studioMcpCandidatesWindows({ LOCALAPPDATA: tmp })[0], path.join(v, "new", "StudioMCP.exe"));
  fs.rmSync(tmp, { recursive: true, force: true });
});
