import type { JsonSchema } from "./protocol.js";

/** Minimal JSON-schema validator (the subset MCP tool schemas use). */
export function validateArgs(schema: JsonSchema | undefined, value: unknown, path = "args"): string[] {
  const errors: string[] = [];
  if (!schema || typeof schema !== "object") return errors;
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.length && !types.some((t) => matchesType(t, value))) {
    errors.push(`${path}: expected ${types.join("|")}, got ${describe(value)}`);
    return errors;
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) {
    errors.push(`${path}: must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (obj[req] === undefined) errors.push(`${path}.${req}: required`);
    }
    if (schema.properties) {
      for (const [k, sub] of Object.entries(schema.properties)) {
        if (obj[k] !== undefined) errors.push(...validateArgs(sub, obj[k], `${path}.${k}`));
      }
      if (schema.additionalProperties === false) {
        for (const k of Object.keys(obj)) if (!(k in schema.properties)) errors.push(`${path}.${k}: unknown property`);
      }
    }
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((v, i) => errors.push(...validateArgs(schema.items, v, `${path}[${i}]`)));
  }
  return errors;
}

function matchesType(t: string, v: unknown): boolean {
  switch (t) {
    case "string":
      return typeof v === "string";
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "integer":
      return typeof v === "number" && Number.isInteger(v);
    case "boolean":
      return typeof v === "boolean";
    case "object":
      return typeof v === "object" && v !== null && !Array.isArray(v);
    case "array":
      return Array.isArray(v);
    case "null":
      return v === null;
    default:
      return true;
  }
}

function describe(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}

/** Suggest close tool names for "unknown tool" errors. */
export function closestNames(name: string, candidates: string[], max = 3): string[] {
  const dist = (a: string, b: string) => {
    const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[a.length][b.length];
  };
  const n = name.toLowerCase();
  return candidates
    .map((c) => ({ c, s: dist(n, c.toLowerCase()) - (c.includes(n) || n.includes(c) ? 3 : 0) }))
    .sort((x, y) => x.s - y.s)
    .slice(0, max)
    .map((x) => x.c);
}

const TOOL_SYNONYMS: Record<string, string[]> = {
  execute_luau: ["run_code", "run_luau", "run_lua", "execute_code", "execute_lua", "exec_luau", "luau", "lua", "execute_script", "run_script", "eval", "execute", "run"],
  search_game_tree: ["get_game_tree", "game_tree", "search_tree", "explorer", "get_explorer", "list_children", "find_instances"],
  inspect_instance: ["get_instance", "inspect", "get_properties", "read_instance", "describe_instance"],
  get_console_output: ["console_output", "get_output", "output", "read_console", "get_logs", "logs"],
  screen_capture: ["screenshot", "take_screenshot", "capture_screen", "capture"],
  get_studio_state: ["studio_state", "get_state", "state"],
  list_roblox_studios: ["list_studios", "studios"],
};

/**
 * Resolve the tool name a model wrote to a real tool: exact → case/namespace-insensitive ("functions.execute_luau",
 * "roblox:execute_luau", "mcp__studio__execute_luau", "Execute-Luau") → well-known synonyms ("run_code" → execute_luau).
 * Returns null when nothing matches unambiguously.
 */
export function resolveToolName(name: string, available: string[]): string | null {
  if (available.includes(name)) return name;
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const stripped = norm(name).replace(/^mcp__[a-z0-9-]+?__/, "").replace(/^(functions|tools?|mcp|roblox(_studio)?|studio|studiomcp|default_api)[.:/]+/, "").split(/[.:/]/).pop()!;
  const byNorm = new Map(available.map((a) => [norm(a), a]));
  if (byNorm.has(stripped)) return byNorm.get(stripped)!;
  for (const [canon, syn] of Object.entries(TOOL_SYNONYMS)) {
    if (syn.includes(stripped) && byNorm.has(canon)) return byNorm.get(canon)!;
  }
  return null;
}

const ARG_SYNONYMS: Record<string, string[]> = {
  code: ["source", "script", "luau", "lua", "command", "src", "luau_code", "lua_code", "snippet"],
  datamodel_type: ["mode", "datamodel", "context", "data_model", "datamodel_mode"],
  path: ["instance_path", "instance", "target", "object", "full_name", "fullname"],
  query: ["search", "q", "name", "term", "keyword", "pattern"],
};

/**
 * Forgiving argument coercion against the tool's JSON schema (applied before validation):
 * synonym keys (script → code), enum case ("edit" → "Edit"), "true"/"3" strings → booleans/numbers, numbers → strings,
 * JSON strings for object/array params, a single value for an array param. Returns notes for the log.
 */
export function coerceArgs(schema: JsonSchema | undefined, args: Record<string, unknown>): string[] {
  const notes: string[] = [];
  const props = schema?.properties;
  if (!props) return notes;
  for (const [canon, syn] of Object.entries(ARG_SYNONYMS)) {
    if (!(canon in props) || args[canon] !== undefined) continue;
    const k = syn.find((s) => args[s] !== undefined && !(s in props));
    if (k) {
      args[canon] = args[k];
      delete args[k];
      notes.push(`${k}→${canon}`);
    }
  }
  for (const [k, sub] of Object.entries(props)) {
    const v = args[k];
    if (v === undefined || !sub) continue;
    const types = sub.type === undefined ? [] : Array.isArray(sub.type) ? sub.type : [sub.type];
    if (sub.enum && typeof v === "string" && !sub.enum.includes(v)) {
      const hit = sub.enum.find((e) => typeof e === "string" && e.toLowerCase() === v.trim().toLowerCase());
      if (hit !== undefined) { args[k] = hit; notes.push(`${k}: ${v}→${hit}`); }
      continue;
    }
    if (!types.length || types.some((t) => matchesType(t, v))) continue;
    if (typeof v === "string") {
      const s = v.trim();
      if (types.includes("boolean") && /^(true|false)$/i.test(s)) args[k] = /^true$/i.test(s);
      else if ((types.includes("number") || types.includes("integer")) && /^-?\d+(\.\d+)?$/.test(s)) args[k] = Number(s);
      else if ((types.includes("object") || types.includes("array")) && /^[[{]/.test(s)) {
        try { args[k] = JSON.parse(s); } catch { /* keep */ }
      } else if (types.includes("array")) args[k] = [v];
    } else if (typeof v === "number" || typeof v === "boolean") {
      if (types.includes("string")) args[k] = String(v);
      else if (types.includes("array")) args[k] = [v];
    } else if (types.includes("array") && v && typeof v === "object") args[k] = [v];
    if (args[k] !== v) notes.push(`${k} coerced`);
  }
  return notes;
}
