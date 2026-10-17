/** Fail-closed application policy. Raw source is never proved read-only with mutation regexes. */
import type { ToolDescriptor, ToolRisk } from "../../shared/src/protocol.js";
export const STUDIO_READS = new Set([
  "list_roblox_studios",
  "get_studio_state",
  "get_console_output",
  "search_game_tree",
  "inspect_instance",
  "script_read",
  "script_search",
  "script_grep",
  "get_instance",
  "get_properties",
  "screen_capture",
]);
export const COMPOSITE_READS = new Set([
  "workspace_graph",
  "animation_timeline_read",
  "source_read_guarded",
  "source_checkpoints",
  "rig_inspect",
  "get_game_tree",
  "get_project_info",
  "read_instance",
  "get_errors",
  "animation_presets",
  "animation_analyze",
  "animation_list",
  "ui_components",
  "ui_import",
  "project_analyze",
  "mechanic_list",
  "mechanic_status",
  "vfx_presets",
  "gd_economy",
  "debug_logs",
  "test_run",
  "image_status",
]);
export const BRIDGE_READS = new Set([
  "memory_get",
  "memory_add",
  "list_snapshots",
  "brickwire_assets",
  "brickwire_guide",
  "brickwire_library",
]);
export const RAW_RUNNERS = new Set([
  "execute_luau",
  "run_code",
  "run_luau",
  "execute_code",
  "execute_lua",
  "run_lua",
  "run_script",
  "execute_script",
  "luau",
  "eval_luau",
  "run_command",
]);
export function registryRisk(tool: ToolDescriptor): ToolRisk {
  if (tool.name.startsWith("mc_")) return tool.risk; // explicit app-managed grants; never inferred from name
  if (tool.source === "mcp")
    return STUDIO_READS.has(tool.name)
      ? "read"
      : tool.risk === "destructive"
        ? "destructive"
        : "write";
  if (tool.source === "composite")
    return COMPOSITE_READS.has(tool.name)
      ? "read"
      : tool.risk === "destructive"
        ? "destructive"
        : "write";
  return BRIDGE_READS.has(tool.name) ? "read" : tool.risk;
}
/** Closed scalar grammar evaluated locally, NOT sent to Studio. No identifiers, methods or expressions. */
export function localLiteral(code: string): { value: string | number | boolean | null } | null {
  const m = /^\s*return\s+([^\r\n]+?)\s*$/.exec(code);
  if (!m) return null;
  if (m[1] === "nil") return { value: null };
  try {
    const v: unknown = JSON.parse(m[1]);
    if (
      typeof v === "string" ||
      typeof v === "boolean" ||
      (typeof v === "number" && Number.isFinite(v))
    )
      return { value: v };
  } catch {}
  return null;
}
export function executionRisk(tool: ToolDescriptor, previous: ToolRisk, code = ""): ToolRisk {
  if (RAW_RUNNERS.has(tool.name))
    return localLiteral(code) ? "read" : previous === "destructive" ? "destructive" : "write";
  const explicit = registryRisk(tool);
  return previous === "destructive" ? "destructive" : explicit;
}
