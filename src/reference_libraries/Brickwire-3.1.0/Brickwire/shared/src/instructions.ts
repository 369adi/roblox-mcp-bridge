import { bwApiFor, librarySection, notionSection, PLAYBOOKS } from "./playbooks.js";
import { MARKERS, type AgentCategory, type ToolDescriptor, type ToolResult, type JsonSchema } from "./protocol.js";

/** Categories the AI can be launched for. Each adds a focused section to the prompt. */
export const CATEGORY_INFO: Record<AgentCategory, { label: string; hint: string; focus: string }> = {
  general: { label: "General", hint: "Any Studio task", focus: PLAYBOOKS.general },
  build: { label: "Build", hint: "Parts, models, maps, terrain", focus: PLAYBOOKS.build },
  scripting: { label: "Scripting", hint: "Scripts, LocalScripts, modules", focus: PLAYBOOKS.scripting },
  ui: { label: "UI", hint: "ScreenGui, menus, HUD", focus: PLAYBOOKS.ui },
  vfx: { label: "VFX", hint: "Particles, lights, effects", focus: PLAYBOOKS.vfx },
  animation: { label: "Animation", hint: "Moving objects, doors, NPCs, character animations", focus: PLAYBOOKS.animation },
  gameplay: { label: "Gameplay", hint: "Systems: leaderstats, items, rounds", focus: PLAYBOOKS.gameplay },
  debug: { label: "Debug / Fix", hint: "Find and fix errors", focus: PLAYBOOKS.debug },
};

/** ContextManager text builders: compact agent instructions, results, reminders. */

function sig(schema: JsonSchema | undefined): string {
  const props = schema?.properties ?? {};
  const req = new Set(schema?.required ?? []);
  const parts = Object.entries(props)
    .filter(([k]) => k !== "studio_id") // the bridge fills studio_id automatically
    .map(([k, s]) => {
      const t = Array.isArray(s.type) ? s.type.join("|") : s.type ?? "any";
      const en = s.enum ? `:${(s.enum as unknown[]).slice(0, 5).join("|")}` : "";
      return `${k}${req.has(k) ? "" : "?"}:${t}${en}`;
    });
  return parts.join(", ");
}

/** 3.0 file tools: how the AI downloads / creates / shows / uploads / places files. */
export const FILES_HINT = `Files: get anything you need yourself — file_fetch {url} downloads images, textures, sounds, music, fbx/glb/rbxm models, videos, web pages → fileId; file_show {fileIds} attaches files to this chat so you can SEE them; file_upload_roblox {fileId} → Roblox asset id; file_to_studio {fileId, parent?} puts it into Studio (Lua → Script/LocalScript/ModuleScript, image → Decal/ImageLabel, sound → Sound, model → inserted model). To write a whole file (script, JSON, CSV, OBJ…) straight into Studio, use a raw file block — no JSON escaping, any length:
<${MARKERS.FILE} name="Shop.server.lua" to="game.ServerScriptService">
…file content…
</${MARKERS.FILE}>
(to= is optional; *.server.lua → Script, *.client.lua → LocalScript, other .lua → ModuleScript). Files the user attaches are listed with their fileId. Use only content the user may use (check licenses).`;

export const CONNECT_HINT = `Blender & Figma: when the user mentions Blender, call blender_status; blender_scene reads the open scene, blender_python edits it (bpy), blender_render shows you a picture, blender_export brings the selection into Brickwire (fbx/glb → file_upload_roblox → file_to_studio, OBJ → artifact_studio_import), blender_import sends a fileId/artifact into Blender. For Figma: figma_inspect {url} (figma.com link with node-id) or a pushId the user sent from the Brickwire Figma plugin, then figma_to_studio builds it as a real ScreenGui; figma_export saves icons/images. Results are shown in the Brickwire app chat automatically.`;

/** Short notice for tools that appeared after the instructions were sent (bridge updated / Studio connected later). */
export function newToolsNotice(tools: ToolDescriptor[]): string {
  const list = tools.filter((t) => t.available);
  if (!list.length) return "";
  return `[Brickwire] New tools are available now — call them like the others:\n${toolCatalog(list)}${list.some((t) => t.name === "file_fetch") ? "\n" + FILES_HINT : ""}${list.some((t) => t.name === "blender_status") ? "\n" + CONNECT_HINT : ""}`;
}

export function toolCatalog(tools: ToolDescriptor[]): string {
  return tools
    .filter((t) => t.available)
    .map((t) => {
      const d = t.description.replace(/\s+/g, " ").slice(0, 150);
      const risk = t.risk === "read" ? "" : t.risk === "write" ? " [write]" : " [destructive]";
      return `- ${t.name}(${sig(t.inputSchema)})${risk} — ${d}`;
    })
    .join("\n");
}

export interface PromptInput {
  providerName: string;
  tools: ToolDescriptor[];
  memorySummary: string;
  task?: string | null;
  sessionId: string;
  category?: AgentCategory | null;
  /** Provider id (e.g. "notion") — some AIs get a provider-specific section. */
  providerId?: string;
  /** Notion AI: keep a dev log page in the workspace. */
  notionLog?: boolean;
  /** Provider message limit: the prompt is compacted to fit. */
  maxChars?: number;
  /** 1.8 SUPER mode: think long, design doc, phased build, self-critique — outstanding result over speed. */
  superMode?: boolean;
}

export function superSection(compact: boolean): string {
  if (compact)
    return `SUPER MODE ON — quality over speed: first read brickwire_guide {"topic":"super"} and follow it (variants + <${MARKERS.ASK}> if open, design doc + acceptance checklist, phased build with a checker per phase, screen_capture review, fix the 5 weakest points, report every checklist item).`;
  return `SUPER MODE is ON — I want an outstanding result, not a fast one. Work like a senior Roblox studio:
1. Before starting read brickwire_guide {"topic":"super"} and the guide of the task's topic (camera / animation / gameplay / ui / vfx / build / scripting).
2. THINK: goal in one line, the player's experience second by second, what the best games of the genre do; open task → 2–3 strong, different variants with effort + your recommendation, end with <${MARKERS.ASK}> and wait.
3. Inspect deeply, then write a short design doc: layout with numbers, systems and where each script lives, pack assets you will use (brickwire_assets), an acceptance checklist of 5–10 testable items.
4. Build in phases — blockout → structure → detail & pack assets → lighting/atmosphere/sky → VFX & sound → UI → scripts/wiring — one block per phase, its checker right after.
5. Look at the result (screen_capture from several angles if available, play test if available), list the 5 weakest points honestly (flat areas, dull lighting, no feedback, tiny text, missing sounds…), fix them, re-verify.
6. Report each acceptance item and how it was verified. Never stop at "good enough" while a check fails.`;
}

export function buildAgentPrompt(p: PromptInput): string {
  const full = renderPrompt(p, false);
  if (!p.maxChars || full.length <= p.maxChars - 400) return full;
  return renderPrompt(p, true);
}

function renderPrompt(p: PromptInput, compact: boolean): string {
  const C = MARKERS.TOOL_CALL;
  const R = MARKERS.TOOL_RESULT;
  const D = MARKERS.DONE;
  const hasLuau = p.tools.some((t) => t.name === "execute_luau" && t.available);
  const L = MARKERS.LUAU;
  const focus = CATEGORY_INFO[p.category ?? "general"]?.focus ?? PLAYBOOKS.general;
  return `[Roblox Agent — session ${p.sessionId}]
You are now connected to my LIVE Roblox Studio through a local bridge. You can read and change my open place, but ONLY by writing tool calls in exactly this format (inside a code block, valid JSON, double quotes, newlines inside strings written as \\n):

\`\`\`json
<${C}>
{"id":"c1","tool":"search_game_tree","args":{"path":"game.Workspace","max_depth":1}}
</${C}>
\`\`\`

Rules:
1. After writing tool calls, STOP and wait. I will reply with <${R}> blocks containing the REAL output from Studio. Never write <${R}> yourself and never guess results.
2. Up to 5 calls per message, each in its own block, each with a unique "id".
3. Inspect before changing anything. After a change, verify it with a read tool.${hasLuau ? `
4. To run Luau (create, modify or delete instances, write scripts) do NOT put code in JSON. Write a raw block instead — plain Luau, no escaping, any length:

\`\`\`lua
<${L} mode="Edit">
local m = BW.model("Tower")
BW.part({Name = "Base", Size = {8, 1, 8}, Position = {0, 0.5, 0}, Color = "Medium stone grey", Parent = m})
BW.report(m)
</${L}>
\`\`\`
   It runs as execute_luau (mode Edit; use mode="Server" only during a play test). Always close it with </${L}>. Use print() to report values. The BW helper library (below) is preloaded in every block — prefer it over raw Instance.new. If the code is very long, split it into several blocks (max ~250 lines each) and send them one reply at a time.` : ""}
5. Paths use dot notation from game, e.g. game.Workspace.Model.Part.
6. When the task is finished and verified, answer me in plain text and end with <${D}>{"summary":"short summary"}</${D}>
7. Do not use your own built-in tools, canvas, artifacts or code interpreters for Studio work — only <${C}>.
8. THINK FIRST like a senior Roblox developer: restate the goal, inspect what exists. Big, vague or taste-dependent request → ask 1–3 short questions (with defaults) and/or offer 2–3 concrete variants (A/B/C, effort, your pick), end with <${MARKERS.ASK}> and wait. Clear or "just do it" → build. Expert guides: brickwire_guide {"topic":"camera"|"animation"|"gameplay"|…}.

${p.tools.some((t) => t.name === "file_fetch" && t.available) ? FILES_HINT + "\n\n" : ""}${p.tools.some((t) => t.name === "blender_status" && t.available) ? CONNECT_HINT + "\n\n" : ""}Available tools (studio_id is filled in automatically):
${toolCatalog(p.tools)}
${hasLuau ? `\n${bwApiFor(p.category ?? "general", compact)}\n\n${librarySection(p.category ?? "general", compact)}\n` : ""}\n${focus}\n${p.superMode ? `\n${superSection(compact)}\n` : ""}${p.providerId === "notion" ? `\n${notionSection({ devLog: !!p.notionLog })}\n` : ""}${p.memorySummary ? `\nProject memory:\n${p.memorySummary}\n` : ""}
${p.task ? `User task:\n${p.task}` : `Reply with one short sentence confirming you are ready, then wait for my task. Do not call tools yet.`}`;
}

const THUMB_KEY = /^(thumbnails?|thumbnail_?url|thumb(_?url)?|image_?url|preview_?(url|image)?|icon_?url|images|screenshot_?url)$/i;
const DESC_KEY = /^(description|desc|details|summary|about)$/i;
const FREE_ASSET_URL = /^https?:\/\/(www\.|create\.)?roblox\.com\/(store|marketplace|library|catalog)\b|^https?:\/\/(t\d|tr)\.rbxcdn\.com\//i;
const DESC_MAX = 240;

/**
 * 1.8.2: shrink an MCP result for the chat: drops thumbnails / image previews / data: URLs and links to free
 * Creator Store assets, cuts long descriptions to 240 chars and prints repeated `nextSteps` only once per message
 * (`seen` is shared by all results of one message). JSON text results are parsed, slimmed and re-serialised.
 */
export function slimResult(value: unknown, seen: Set<string> = new Set()): unknown {
  const walk = (v: unknown, key: string, depth: number): unknown => {
    if (depth > 24) return v;
    if (typeof v === "string") {
      if (/^data:[a-z]+\/[\w.+-]+;base64,/i.test(v)) return undefined;
      if (FREE_ASSET_URL.test(v.trim())) return undefined;
      if (DESC_KEY.test(key) && v.length > DESC_MAX) return v.slice(0, DESC_MAX) + "…";
      const t = v.trim();
      if (t.length > 2 && (t[0] === "{" || t[0] === "[")) {
        try {
          return JSON.stringify(walk(JSON.parse(t), key, depth + 1)); // MCP text content that is itself JSON
        } catch {
          /* plain text */
        }
      }
      return v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key, depth + 1)).filter((x) => x !== undefined);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (THUMB_KEY.test(k)) continue;
        if (/^next_?steps$/i.test(k) && x != null) {
          const sig = JSON.stringify(x);
          if (seen.has(sig)) continue;
          seen.add(sig);
        }
        const y = walk(x, k, depth + 1);
        if (y !== undefined) out[k] = y;
      }
      return out;
    }
    return v;
  };
  return walk(value, "", 0);
}

/** Turn results into one chat message, truncating to fit the provider's message budget. */
export function formatToolResults(results: ToolResult[], maxChars: number, footer?: string): string {
  const budget = Math.max(2000, maxChars - 600);
  const per = Math.floor(budget / Math.max(1, results.length));
  const seen = new Set<string>();
  const blocks = results.map((r) => {
    const payload: Record<string, unknown> = { id: r.id, status: r.status, result: slimResult(r.result ?? null, seen) ?? null };
    if (r.error) payload.error = r.error;
    let json = JSON.stringify(payload);
    if (json.length > per) {
      const resultStr = typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result);
      const keep = Math.max(200, per - 300 - (r.error?.length ?? 0));
      payload.result = resultStr.slice(0, keep) + `…[truncated ${resultStr.length - keep} chars — narrow the query (path/depth/line range)]`;
      json = JSON.stringify(payload);
    }
    return `<${MARKERS.TOOL_RESULT}>\n${json}\n</${MARKERS.TOOL_RESULT}>`;
  });
  const anyFail = results.some((r) => r.status !== "success");
  const tail =
    footer ??
    (anyFail
      ? `Some calls failed. Read the error, fix the problem and continue with <${MARKERS.TOOL_CALL}>.`
      : `Continue with the next <${MARKERS.TOOL_CALL}>, or, if the task is complete and verified, answer and end with <${MARKERS.DONE}>.`);
  return blocks.join("\n") + "\n" + tail;
}

export const REMINDERS = {
  noTools: `[Roblox Agent] Reminder: you are connected to my Roblox Studio. To act, write <${MARKERS.TOOL_CALL}> blocks (JSON inside a code block) and wait for the results. If you are finished, end with <${MARKERS.DONE}>.`,
  untagged: `[Roblox Agent] Your Luau code was NOT executed — it has no tag. Studio runs code only inside a tag. Re-send it as:\n${"```"}lua\n<${MARKERS.LUAU}>\n…your code…\n</${MARKERS.LUAU}>\n${"```"}\n(or a <${MARKERS.TOOL_CALL}> JSON block) and wait for the result. If that code was only an example for me, reply "ok".`,
  unverified: `[Roblox Agent] You reported done, but the last change was not verified. Verify it with a read tool (e.g. search_game_tree / inspect_instance) and then end with <${MARKERS.DONE}>.`,
  forged: `[Roblox Agent] You wrote a <${MARKERS.TOOL_RESULT}> yourself. Results come only from Studio — nothing was executed. Write <${MARKERS.TOOL_CALL}> and wait.`,
  truncated: `[Roblox Agent] Your last block was cut off (no closing tag / incomplete JSON) — nothing was executed. Re-send it complete. For long Luau use <${MARKERS.LUAU}> … </${MARKERS.LUAU}> and split it into parts of ~250 lines, one per reply.`,
  category: (label: string, focus: string) => `[Roblox Agent] Category switched to ${label}. ${focus || "No special focus."} Reply "ok" and continue with my next request.`,
  invalid: (problems: string[]) => `[Roblox Agent] Invalid <${MARKERS.TOOL_CALL}>: ${problems.join("; ")}. Fix the JSON (double quotes, \\n for newlines) and re-send.`,
  tooMany: (n: number) => `[Roblox Agent] Only the first ${n} calls were executed; re-send the rest after reviewing these results.`,
};
