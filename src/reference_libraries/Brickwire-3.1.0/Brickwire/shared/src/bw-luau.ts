import { BW_HELPERS_LUAU } from "./bw-helpers.generated.js";
import { BW_LIBRARY_LUAU } from "./library/bw-library.generated.js";
import { BW_ASSETS_LUAU } from "./library/bw-assets.generated.js";

/**
 * The BW helper library is prepended to execute_luau code that uses it (plus the resource library when the
 * code uses BW.kit / BW.kits / BW.icon / BW.furnish). Line numbers in Luau errors are mapped back to the AI's
 * own code so "line 12" means line 12 of what the AI wrote.
 */
export const BW_PRELUDE_LINES = BW_HELPERS_LUAU.split("\n").length;
export const BW_LIBRARY_PRELUDE_LINES = BW_PRELUDE_LINES + BW_LIBRARY_LUAU.split("\n").length;

export function usesHelpers(code: string): boolean {
  return /\bBW\s*[.:]/.test(code);
}

export function usesLibrary(code: string): boolean {
  return /\bBW\s*[.:]\s*(kit|kits|icon|furnish|style|styles|ui(?:Button|IconButton|Panel|Window|Title|Bar|Pill|Card|Toggle|Rays|Juice|Backdrop|Close)|vfx|vfxLib|vfxPreview|vfxNames|cinematic|cinemaLib|shots|camPreview|camCheck|cutscene|cutsceneLib|cutsceneCheck)\b/.test(code);
}

export function usesAssets(code: string): boolean {
  return /\bBW\s*[.:]\s*asset(?:Info)?\b/.test(code);
}

/**
 * helpers [+ resource library] [+ asset runtime + injected asset data] + the AI's code.
 * `assetData` = Luau statements defining BW.__assetData (from the bridge's AssetLibrary), any line count.
 */
export function prepareLuau(code: string, assetData?: string | null): { code: string; preludeLines: number } {
  const chunks = [BW_HELPERS_LUAU];
  if (usesLibrary(code)) chunks.push(BW_LIBRARY_LUAU);
  if (usesAssets(code) || assetData) {
    chunks.push(BW_ASSETS_LUAU);
    if (assetData) chunks.push(assetData);
  }
  const prelude = chunks.join("\n");
  return { code: prelude + "\n" + code, preludeLines: prelude.split("\n").length };
}

export function withHelpers(code: string): string {
  return prepareLuau(code).code;
}

/** Map `:<line>:` positions in an error/output text back to the AI's code lines. */
export function remapLuauLines(text: string, preludeLines = BW_PRELUDE_LINES): string {
  return text.replace(/(\]|\.luau|"|'|\w):(\d+):/g, (m, pre: string, n: string) => {
    const line = Number(n);
    if (line > preludeLines) return `${pre}:${line - preludeLines}:`;
    return `${pre}:BW-helper:`;
  });
}
