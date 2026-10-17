import type { SafetyMode, ToolDescriptor, ToolRisk } from "./protocol.js";

/**
 * SafetyManager policy — pure functions shared by bridge (enforcement point)
 * and extension (to display the same decision).
 *
 * Modes:
 *   full     — everything runs without asking (Studio undo / snapshots are the safety net)
 *   auto     — reads & writes run; destructive actions need confirmation
 *   approval — every write/destructive action needs confirmation
 *   safe     — read-only; writes are denied
 */

export type SafetyDecision =
  | { action: "allow" }
  | { action: "confirm"; reason: string }
  | { action: "deny"; reason: string };

const DESTRUCTIVE_LUAU = [/:\s*Destroy\s*\(/, /:\s*ClearAllChildren\s*\(/, /\.Parent\s*=\s*nil\b/, /:\s*Remove\s*\(/, /Debris\s*:\s*AddItem/];
/** A loop that walks existing children/descendants (counting them, e.g. #x:GetDescendants(), is not "mass"). */
const MASS_LUAU = [/\bfor\b[^\n]*\bin\b[^\n]*:\s*Get(Descendants|Children)\s*\(/, /\bfor\b[^\n]*\bin\b[^\n]*\b(workspace|game)\s*:\s*GetService/];
/** BW helper calls that change the place (see shared/src/bw-helpers.luau). Read helpers (find/report/tree/source/scan/logs/check) are not listed. */
const BW_WRITE = /\bBW\s*\.\s*(part|new|model|script|patch|screen|ui|particles|light|leaderstats|killPart|remote|folder|set|weldAll|animate|door|rig|keyframes|playAnim|patrol|playerAnims|toolAnim|block|wall|room|roof|stairs|fence|cylinder|plant|array|ring|move|place|ground|kit|furnish|floorplan|building|path|scatter|column|arch|icon|ui(?:Title|Button|IconButton|Panel|Close|Window|Bar|Pill|Card|Toggle|Rays|Juice|Backdrop)|vfx|vfxLib|vfxPreview|cinematic|cinemaLib|camPreview|cutscene|cutsceneLib)\s*[({"'\[]/;
const MUTATING_LUAU = [BW_WRITE, /[\w\]\)]\s*\.\s*\w+\s*=[^=]/, /Instance\.new/, /:\s*Clone\s*\(/, /\.Source\s*=/, /:\s*Set[A-Z]\w*\s*\(/, /:\s*Insert\w*\s*\(/];
const WRITE_NAME = /(create|edit|modify|delete|remove|insert|clone|generate|set_|update|upload|restore|multi_edit|write|start_stop_play|store_image|_input|navigation)/i;
const DESTRUCTIVE_NAME = /(delete|remove|destroy|clear|restore_snapshot)/i;

/** Static risk of a tool by its name (for MCP tools, which don't declare risk). */
export function riskFromName(name: string): ToolRisk {
  if (DESTRUCTIVE_NAME.test(name)) return "destructive";
  if (name === "execute_luau") return "write";
  if (WRITE_NAME.test(name)) return "write";
  return "read";
}

/** Find the Luau source string inside execute_luau args (param name differs between versions). */
export { lintReadonlyCFrameWrites } from "./studio2/thumbnail-scene.js";

export function findLuauCode(args: Record<string, unknown>): string {
  for (const k of ["code", "source", "luau", "script", "command"]) if (typeof args[k] === "string") return args[k] as string;
  const strings = Object.entries(args).filter(([k, v]) => typeof v === "string" && !/studio_id|datamodel/i.test(k));
  strings.sort((a, b) => String(b[1]).length - String(a[1]).length);
  return strings.length ? String(strings[0][1]) : "";
}

/** Dynamic risk including arguments (e.g. Luau that destroys things, important systems). */
export function assessCall(
  tool: ToolDescriptor,
  args: Record<string, unknown>,
  importantPaths: string[] = [],
): { risk: ToolRisk; reasons: string[] } {
  let risk: ToolRisk = tool.risk;
  const reasons: string[] = [];
  if (tool.name === "execute_luau") {
    const code = findLuauCode(args).replace(/--\[\[[\s\S]*?\]\]|--[^\n]*/g, "");
    const destructive = DESTRUCTIVE_LUAU.some((r) => r.test(code));
    const mutating = MUTATING_LUAU.some((r) => r.test(code));
    const mass = MASS_LUAU.some((r) => r.test(code)) && (destructive || mutating);
    if (destructive) {
      risk = "destructive";
      reasons.push("Luau code destroys/removes instances");
    }
    if (mass) {
      risk = "destructive";
      reasons.push("Luau code changes many instances in a loop");
    }
    if (!destructive && !mutating) risk = "read";
  }
  const targets = Object.entries(args)
    .filter(([k, v]) => typeof v === "string" && /path|parent|target|script/i.test(k))
    .map(([, v]) => String(v));
  for (const p of targets) {
    const hit = importantPaths.find((ip) => p === ip || p.startsWith(ip + "."));
    if (hit && risk !== "read") {
      reasons.push(`touches important system ${hit}`);
      risk = "destructive";
    }
  }
  if (Array.isArray(args.paths) && (args.paths as unknown[]).length > 10 && risk !== "read") {
    risk = "destructive";
    reasons.push(`mass change (${(args.paths as unknown[]).length} targets)`);
  }
  if (risk === "destructive" && reasons.length === 0) reasons.push(`${tool.name} is a destructive action`);
  return { risk, reasons };
}

export function decide(mode: SafetyMode, risk: ToolRisk, reasons: string[]): SafetyDecision {
  const why = reasons.join("; ") || `${risk} action`;
  if (risk === "read") return { action: "allow" };
  if (mode === "full") return { action: "allow" };
  if (mode === "safe") return { action: "deny", reason: `Safe mode is read-only (${why})` };
  if (mode === "approval") return { action: "confirm", reason: `Approval mode: ${why}` };
  if (risk === "destructive") return { action: "confirm", reason: why };
  return { action: "allow" };
}
