import { iconsToLuau } from "./icons.js";
import { kitInfoToLuau } from "./catalog.js";

/**
 * Packs bw-library.luau for injection: strips indentation and full-line comments outside long strings
 * (embedded script sources in [==[ … ]==] stay verbatim) and prepends the generated icon + catalog data.
 * Line count is not important (the bridge maps error lines using the actual prelude length).
 */
export function minifyLuau(src: string): string {
  const out: string[] = [];
  let closer: string | null = null;
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    if (closer) {
      out.push(raw);
      if (raw.includes(closer)) closer = null;
      continue;
    }
    const line = raw.trim();
    if (line === "" || (line.startsWith("--") && !line.startsWith("--["))) continue;
    out.push(line);
    const m = /\[(=*)\[/.exec(line.replace(/--.*$/, ""));
    if (m) {
      const close = "]" + m[1] + "]";
      if (!line.slice(m.index + m[0].length).includes(close)) closer = close;
    }
  }
  return out.join("\n");
}

export function packLibrary(librarySrc: string): string {
  return iconsToLuau() + "\n" + kitInfoToLuau() + "\n" + minifyLuau(librarySrc);
}
