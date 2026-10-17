import { MARKERS, type ToolCall } from "./protocol.js";
import { extractJsonObject, parseLenientJson } from "./json-lenient.js";

/**
 * CommandParser — finds ONLY structured agent tags in AI output. Plain prose is never a command.
 *
 *   <ROBLOX_TOOL_CALL>
 *   {"id":"c1","tool":"search_game_tree","args":{"path":"game.Workspace"}}
 *   </ROBLOX_TOOL_CALL>
 *
 * Tolerated noise (what chat sites do to it): a surrounding code fence, code-block chrome between the
 * tag and the JSON ("json", "Copy", "Download"), the angle brackets being eaten by a markdown renderer.
 * A block whose JSON is not finished is reported as incomplete and never executed.
 *
 * Long code uses a raw block instead of JSON (escaping hundreds of lines of Luau into a JSON string is
 * where models break):
 *
 *   ```lua
 *   <ROBLOX_LUAU mode="Edit">
 *   local p = Instance.new("Part") ...
 *   </ROBLOX_LUAU>
 *   ```
 * It becomes execute_luau {code, datamodel_type}. Without a closing tag it is incomplete (never run).
 *
 * Whole files use the same raw form (3.0) and become file_save {name, text, to?, as?}:
 *
 *   <ROBLOX_FILE name="Shop.server.lua" to="game.ServerScriptService">
 *   print("shop")
 *   </ROBLOX_FILE>
 */

export type ParsedKind = "call" | "result" | "status" | "error" | "done";

export interface ParsedBlock {
  kind: ParsedKind;
  marker: string;
  index: number;
  complete: boolean;
  closed: boolean;
  valid: boolean;
  value?: Record<string, unknown>;
  problem?: string;
  raw: string;
}

export interface ParseOutput {
  calls: ToolCall[];
  invalidCalls: ParsedBlock[];
  statuses: Record<string, unknown>[];
  errors: Record<string, unknown>[];
  done: Record<string, unknown> | null;
  /** ROBLOX_TOOL_RESULT blocks written by the AI itself — forged, never trusted. */
  forgedResults: number;
  /** A tag exists but its JSON is not finished (still streaming or truncated). */
  hasIncomplete: boolean;
  blocks: ParsedBlock[];
  /** 1.7: the reply contains Roblox Luau code but NO agent tag — it was not executed (models often forget the tag). */
  untaggedCode?: boolean;
  /** 1.8: the AI ended with <ROBLOX_AGENT_ASK> — it waits for the user's answer (questions / variants). */
  ask?: boolean;
  /** 1.8 heuristic: no tags, but the reply clearly asks the user something (questions, "Variant A/B"). */
  asksUser?: boolean;
}

const ASK_RE = new RegExp(`(?<![A-Za-z0-9_/])${MARKERS.ASK}(?![A-Za-z0-9_])`);
const ASK_WORDS = /(вариант|variant|option\s*[A-C1-3]\b|\bwhich\b|\bprefer|would you like|do you want|should i|shall i|какой|какую|какое|какие|выбери|выберите|уточн|clarif|хочешь|хотите|нужн[оа] ли|подтверд|confirm)/i;
/** Heuristic: the tail of the reply asks the user something. */
export function looksLikeQuestion(text: string): boolean {
  const tail = text.slice(-1200);
  const q = (tail.match(/\?/g) ?? []).length;
  return (q >= 1 && ASK_WORDS.test(tail)) || /(^|\n)\s*(\*\*)?(вариант|variant|option)\s*[A-CА-В1-3]\b/i.test(text) && q >= 1;
}

const LUAU_LINE = /^\s*(local\s+[\w,\s]+=|for\s+.+\s+do\b|if\s+.+\s+then\b|end\b|function\b|return\b|print\(|task\.wait|[\w.:\[\]"]+\s*=\s*.+|[\w.:]+\(.*\)\s*$)/;
const ROBLOX_API = /\b(Instance\.new\(|game:GetService\(|workspace[.:]|game\.Workspace|BW\.[a-zA-Z]+\s*[({]|Vector3\.new\(|CFrame\.|Color3\.|:FindFirstChild\(|:WaitForChild\()/;
/** Heuristic: ≥ 3 Luau-looking lines and a Roblox API reference. */
export function looksLikeUntaggedLuau(text: string): boolean {
  if (!ROBLOX_API.test(text)) return false;
  let n = 0;
  for (const line of text.split("\n")) if (LUAU_LINE.test(line) && line.length < 400) n++;
  return n >= 3;
}

const KIND_BY_MARKER: Record<string, ParsedKind> = {
  [MARKERS.TOOL_CALL]: "call",
  [MARKERS.TOOL_RESULT]: "result",
  [MARKERS.STATUS]: "status",
  [MARKERS.ERROR]: "error",
  [MARKERS.DONE]: "done",
};
const NAMES = Object.keys(KIND_BY_MARKER).join("|");
/** Opening tag (or bare tag name). The lookbehind rejects closing tags ("</NAME>" / "/NAME"). */
const OPEN_RE = new RegExp(`(?<![A-Za-z0-9_/])(${NAMES})(?![A-Za-z0-9_])\\s*>?`, "g");
/** Allowed noise between the opening tag and `{`. */
const GAP_RE = /^[\s:=\->`]*(?:(?:json|jsonc|lua|luau|rbx|text|plaintext|copy code|copy|download|run|скопировать|код)\s*`*)*[\s`]*$/i;
const MAX_GAP = 80;
const TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/;

function closeAfter(text: string, from: number, marker: string): number {
  const m = new RegExp(`^[\\s\`]*(?:<\\s*)?\\/\\s*${marker}\\s*>?`).exec(text.slice(from, from + 200));
  return m ? from + m[0].length : -1;
}

const LUAU_OPEN_RE = new RegExp(`(?<![A-Za-z0-9_/])<?\\s*${MARKERS.LUAU}((?:\\s+[a-z_]+\\s*=\\s*["']?[\\w.-]*["']?)*)\\s*>`, "gi");
const LUAU_CLOSE_RE = new RegExp(`<?\\s*\\/\\s*${MARKERS.LUAU}\\s*>?`, "i");
const FILE_OPEN_RE = new RegExp(`(?<![A-Za-z0-9_/])<?\\s*${MARKERS.FILE}((?:\\s+[a-z_]+\\s*=\\s*(?:"[^"\\n]*"|'[^'\\n]*'|[^\\s>"']+))*)\\s*>`, "gi");
const FILE_CLOSE_RE = new RegExp(`<?\\s*\\/\\s*${MARKERS.FILE}\\s*>?`, "i");
const CHROME_LINE = /^\s*(lua|luau|copy|copy code|download|run|скопировать|код)\s*$/i;

/** Strip code-fence / code-block chrome that ends up between the raw-Luau tags. */
function cleanLuau(raw: string): string {
  const lines = raw.replace(/\r/g, "").split("\n");
  while (lines.length && (CHROME_LINE.test(lines[0]) || /^\s*```\s*\w*\s*$/.test(lines[0]) || !lines[0].trim())) lines.shift();
  while (lines.length && (/^\s*```\s*$/.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines.pop();
  return lines.join("\n");
}

interface RawLuau {
  index: number;
  end: number;
  call?: ToolCall;
}

function findRawLuau(text: string, out: ParseOutput): RawLuau[] {
  const found: RawLuau[] = [];
  const re = new RegExp(LUAU_OPEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    const bodyStart = m.index + m[0].length;
    const close = LUAU_CLOSE_RE.exec(text.slice(bodyStart));
    const attrs: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([a-z_]+)\s*=\s*["']?([\w.-]*)["']?/gi)) attrs[a[1].toLowerCase()] = a[2];
    if (!close) {
      out.hasIncomplete = true;
      out.blocks.push({ kind: "call", marker: MARKERS.LUAU, index: m.index, complete: false, closed: false, valid: false, raw: text.slice(bodyStart, bodyStart + 200) });
      found.push({ index: m.index, end: text.length });
      break;
    }
    const end = bodyStart + close.index + close[0].length;
    const code = cleanLuau(text.slice(bodyStart, bodyStart + close.index));
    const modeRaw = (attrs.mode ?? attrs.datamodel ?? attrs.datamodel_type ?? "Edit").toLowerCase();
    const mode = modeRaw === "server" ? "Server" : modeRaw === "client" ? "Client" : "Edit";
    const block: ParsedBlock = { kind: "call", marker: MARKERS.LUAU, index: m.index, complete: true, closed: true, valid: !!code.trim(), raw: code.slice(0, 200) };
    out.blocks.push(block);
    if (!code.trim()) {
      block.problem = "empty <ROBLOX_LUAU> block";
      out.invalidCalls.push(block);
      found.push({ index: m.index, end });
    } else {
      found.push({ index: m.index, end, call: { id: attrs.id || `lua${++n}`, tool: "execute_luau", args: { code, datamodel_type: mode } } });
    }
    re.lastIndex = end;
  }
  return found;
}

/** <ROBLOX_FILE name="…" to="…" as="…" encoding="base64"> … </ROBLOX_FILE> → file_save. */
function findRawFiles(text: string, out: ParseOutput, skip: (i: number) => boolean): RawLuau[] {
  const found: RawLuau[] = [];
  const re = new RegExp(FILE_OPEN_RE.source, "gi");
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (skip(m.index)) continue;
    const bodyStart = m.index + m[0].length;
    const close = FILE_CLOSE_RE.exec(text.slice(bodyStart));
    const attrs: Record<string, string> = {};
    for (const a of (m[1] ?? "").matchAll(/([a-z_]+)\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s>"']+))/gi)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    if (!close) {
      out.hasIncomplete = true;
      out.blocks.push({ kind: "call", marker: MARKERS.FILE, index: m.index, complete: false, closed: false, valid: false, raw: text.slice(bodyStart, bodyStart + 200) });
      found.push({ index: m.index, end: text.length });
      break;
    }
    const end = bodyStart + close.index + close[0].length;
    const body = cleanLuau(text.slice(bodyStart, bodyStart + close.index));
    const name = (attrs.name ?? attrs.file ?? attrs.filename ?? "").trim();
    const block: ParsedBlock = { kind: "call", marker: MARKERS.FILE, index: m.index, complete: true, closed: true, valid: !!name && !!body.length, raw: body.slice(0, 200) };
    out.blocks.push(block);
    if (!name || !body.length) {
      block.problem = !name ? 'ROBLOX_FILE needs name="file.ext"' : "empty <ROBLOX_FILE> block";
      out.invalidCalls.push(block);
      found.push({ index: m.index, end });
    } else {
      const b64 = /^base64$/i.test(attrs.encoding ?? "");
      const args: Record<string, unknown> = { name, ...(b64 ? { base64: body.replace(/\s+/g, "") } : { text: body + "\n" }) };
      const to = attrs.to ?? attrs.parent; if (to) args.to = to;
      if (attrs.as) args.as = attrs.as;
      found.push({ index: m.index, end, call: { id: attrs.id || `file${++n}`, tool: "file_save", args } });
    }
    re.lastIndex = end;
  }
  return found;
}

export function parseAgentOutput(text: string): ParseOutput {
  const out: ParseOutput = { calls: [], invalidCalls: [], statuses: [], errors: [], done: null, forgedResults: 0, hasIncomplete: false, blocks: [] };
  if (!text) return out;
  const seenIds = new Set<string>();
  const luauOnly = findRawLuau(text, out);
  const luau = [...luauOnly, ...findRawFiles(text, out, (i) => luauOnly.some((b) => i >= b.index && i < b.end))];
  const inLuau = (i: number) => luau.some((b) => i >= b.index && i < b.end);
  const ordered: Array<{ index: number; call: ToolCall }> = luau.filter((b) => b.call).map((b) => ({ index: b.index, call: b.call! }));
  const re = new RegExp(OPEN_RE.source, "g");
  let m: RegExpExecArray | null;
  let consumedUntil = 0;
  while ((m = re.exec(text))) {
    if (m.index < consumedUntil) continue; // tag text inside a previous block's JSON (e.g. inside Luau code)
    if (inLuau(m.index)) continue; // tag-like text inside raw Luau code
    const marker = m[1];
    const kind = KIND_BY_MARKER[marker];
    const after = m.index + m[0].length;
    const brace = text.indexOf("{", after);
    const gap = brace < 0 ? text.slice(after) : text.slice(after, brace);
    if (brace < 0 || gap.length > MAX_GAP || !GAP_RE.test(gap)) {
      const tagForm = m[0].includes(">") && text[m.index - 1] === "<";
      const lineRest = (text.slice(after).split("\n")[0] ?? "").trim();
      if (kind === "done" && (tagForm || /^[`.!:]*$/.test(lineRest))) {
        // <ROBLOX_AGENT_DONE>free text</ROBLOX_AGENT_DONE> or a bare DONE tag
        const end = text.indexOf("/" + marker, after);
        const summary = text.slice(after, end < 0 ? Math.min(text.length, after + 300) : end).replace(/[<`]+\s*$/, "").trim();
        out.done = out.done ?? { summary };
        out.blocks.push({ kind, marker, index: m.index, complete: true, closed: end >= 0, valid: true, value: { summary }, raw: marker });
      } else if (brace < 0 && GAP_RE.test(gap)) {
        out.hasIncomplete = true; // tag at the very end of a still-streaming answer
      }
      continue;
    }
    const obj = extractJsonObject(text, brace);
    if (!obj) continue;
    const block: ParsedBlock = { kind, marker, index: m.index, complete: obj.complete, closed: false, valid: false, raw: obj.raw };
    out.blocks.push(block);
    if (!obj.complete) {
      out.hasIncomplete = true;
      break; // the rest is an unfinished tail
    }
    const closeEnd = closeAfter(text, obj.end, marker);
    block.closed = closeEnd >= 0;
    consumedUntil = block.closed ? closeEnd : obj.end;
    const parsed = parseLenientJson(obj.raw);
    if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
      block.problem = "invalid JSON: " + (parsed.error ?? "not an object");
      if (kind === "call") out.invalidCalls.push(block);
      continue;
    }
    const value = parsed.value as Record<string, unknown>;
    block.value = value;
    switch (kind) {
      case "call": {
        // accept common aliases models use: "name"/"command" for tool, "arguments"/"params" for args
        if (value.tool === undefined && typeof (value.name ?? value.command) === "string") value.tool = value.name ?? value.command;
        if (value.args === undefined && (value.arguments ?? value.params) !== undefined) value.args = value.arguments ?? value.params;
        if (value.id === undefined) value.id = `auto${out.calls.length + out.invalidCalls.length + 1}_${m.index}`;
        const problem = validateCallShape(value);
        if (problem) {
          block.problem = problem;
          out.invalidCalls.push(block);
          break;
        }
        block.valid = true;
        ordered.push({ index: m.index, call: { id: String(value.id), tool: String(value.tool), args: (value.args as Record<string, unknown>) ?? {} } });
        break;
      }
      case "result":
        out.forgedResults++;
        block.valid = true;
        break;
      case "status":
        block.valid = true;
        out.statuses.push(value);
        break;
      case "error":
        block.valid = true;
        out.errors.push(value);
        break;
      case "done":
        block.valid = true;
        out.done = value;
        break;
    }
  }
  // JSON calls and raw-Luau calls, in the order the AI wrote them; ids unique within the reply
  ordered.sort((a, b) => a.index - b.index);
  for (const { call } of ordered) {
    let id = call.id;
    if (seenIds.has(id)) id = `${id}#${out.calls.length + 1}`;
    seenIds.add(id);
    out.calls.push({ ...call, id });
  }
  if (!out.calls.length && !out.blocks.length && !out.hasIncomplete && !out.done && !out.forgedResults && !luau.length) out.untaggedCode = looksLikeUntaggedLuau(text);
  {
    const am = ASK_RE.exec(text);
    if (am && !inLuau(am.index)) out.ask = true;
    if (!out.calls.length && !out.done) out.asksUser = out.ask || looksLikeQuestion(text);
  }
  return out;
}

export function validateCallShape(v: Record<string, unknown>): string | null {
  if (v.id === undefined || v.id === null || (typeof v.id !== "string" && typeof v.id !== "number")) return 'missing "id" (string)';
  if (String(v.id).length > 100) return '"id" too long';
  if (typeof v.tool !== "string" || !TOOL_NAME_RE.test(v.tool)) return 'missing or invalid "tool" name';
  if (v.args !== undefined && (typeof v.args !== "object" || v.args === null || Array.isArray(v.args))) return '"args" must be an object';
  return null;
}
