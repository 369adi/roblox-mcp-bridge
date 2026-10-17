/**
 * Lenient JSON extraction for AI output.
 * AIs often emit raw newlines inside strings (Luau code), trailing commas,
 * smart quotes, or get cut off mid-stream. We extract one balanced object
 * starting at `{` and repair common defects without guessing content.
 */

export interface ExtractedObject {
  raw: string;
  start: number;
  end: number; // index after closing brace (or text end when incomplete)
  complete: boolean;
}

/** Find a balanced JSON object starting at `from` (must be '{'). String-aware. */
export function extractJsonObject(text: string, from: number): ExtractedObject | null {
  const start = text.indexOf("{", from);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"' || c === "\u201d") inStr = false;
      continue;
    }
    if (c === '"' || c === "\u201c") {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return { raw: text.slice(start, i + 1), start, end: i + 1, complete: true };
    }
  }
  return { raw: text.slice(start), start, end: text.length, complete: false };
}

/** Escape raw control characters that appear inside JSON strings. */
function escapeControlCharsInStrings(src: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) {
        esc = false;
        out += c;
        continue;
      }
      if (c === "\\") {
        esc = true;
        out += c;
        continue;
      }
      if (c === '"') {
        inStr = false;
        out += c;
        continue;
      }
      if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else if (c.charCodeAt(0) < 0x20) out += "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
      else out += c;
      continue;
    }
    if (c === '"') inStr = true;
    out += c;
  }
  return out;
}

function removeTrailingCommas(src: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === "}" || src[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

export interface LenientParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  repaired?: boolean;
}

export function parseLenientJson(raw: string): LenientParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    /* fall through to repairs */
  }
  let s = raw.replace(/[\u201c\u201d]/g, '"').replace(/\u00a0/g, " ");
  s = escapeControlCharsInStrings(s);
  s = removeTrailingCommas(s);
  try {
    return { ok: true, value: JSON.parse(s), repaired: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
