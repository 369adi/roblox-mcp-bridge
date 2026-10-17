import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAgentPrompt, formatToolResults } from "../../shared/src/instructions.js";

test("M1-AC5 turn 2+ carries results + short reminder, never the full instruction block", () => {
  const full = buildAgentPrompt({ providerName: "ChatGPT", tools: [], memorySummary: "", task: "build a house", sessionId: "s1", category: "general", providerId: "chatgpt", notionLog: false, maxChars: 30000, superMode: false } as any);
  const turn2 = formatToolResults([{ id: "c1", status: "success", result: { ok: true } } as any], 30000);
  assert.ok(full.length > 2000, "full prompt is the long instruction block");
  assert.ok(turn2.length < 600, `turn-2 message is short (${turn2.length} chars)`);
  const lines = full.split("\n").map((l) => l.trim()).filter((l) => l.length > 40);
  for (const l of lines) assert.ok(!turn2.includes(l), "instruction line leaked into turn 2: " + l);
  // the full prompt is only built in AgentCore.start()
  const core = readFileSync(new URL("../../extension/src/core/agent-core.ts", import.meta.url), "utf8");
  assert.equal(core.match(/buildAgentPrompt\(/g)?.length, 1);
});
