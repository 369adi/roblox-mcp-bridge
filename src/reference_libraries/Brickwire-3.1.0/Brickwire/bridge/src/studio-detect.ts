import { execFile } from "node:child_process";

let cache: { at: number; value: boolean | null } | null = null;
/** Executable paths of running Studio processes (Windows: via PowerShell/WMIC; macOS: via ps). */
export let runningStudioPaths: string[] = [];

/** Process image names Roblox Studio is known to run as (official launcher + Bloxstrap-style launchers keep the same exe). */
export const STUDIO_IMAGES = ["RobloxStudioBeta.exe", "RobloxStudio.exe"];

/** Parse `tasklist /FO CSV /NH` output → true when any Studio image is listed. */
export function tasklistHasStudio(out: string): boolean {
  const low = out.toLowerCase();
  return STUDIO_IMAGES.some((n) => low.includes(n.toLowerCase()));
}

function run(cmd: string, args: string[], timeout = 6000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      execFile(cmd, args, { windowsHide: true, timeout }, (err, out) => resolve(err && !out ? null : String(out ?? "")));
    } catch {
      resolve(null);
    }
  });
}

let pathsAt = 0;
/** Refresh runningStudioPaths (rate-limited to once per 30 s; PowerShell is slow). */
export async function refreshStudioPaths(force = false): Promise<string[]> {
  if (!force && Date.now() - pathsAt < 30000) return runningStudioPaths;
  pathsAt = Date.now();
  if (process.platform === "win32") {
    let out = await run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Get-Process RobloxStudioBeta,RobloxStudio -ErrorAction SilentlyContinue | ForEach-Object { $_.Path }"], 12000);
    if (!out || !out.trim()) out = await run("wmic", ["process", "where", "name='RobloxStudioBeta.exe' or name='RobloxStudio.exe'", "get", "ExecutablePath"], 8000);
    runningStudioPaths = [...new Set((out ?? "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /\.exe$/i.test(l)))];
  } else if (process.platform === "darwin") {
    const out = await run("ps", ["-axo", "comm="]);
    runningStudioPaths = [...new Set((out ?? "").split("\n").map((l) => l.trim()).filter((l) => /RobloxStudio(Beta)?$/.test(l)))];
  }
  return runningStudioPaths;
}

/** Is a Roblox Studio process running? null = cannot tell on this OS. */
export function studioProcessRunning(): Promise<boolean | null> {
  if (cache && Date.now() - cache.at < 4000) return Promise.resolve(cache.value);
  return new Promise((resolve) => {
    const done = (v: boolean | null) => {
      cache = { at: Date.now(), value: v };
      if (v) void refreshStudioPaths();
      resolve(v);
    };
    if (process.platform === "win32") {
      // one tasklist call for every known image name (Bloxstrap/Fishstrap keep RobloxStudioBeta.exe; some installs use RobloxStudio.exe)
      execFile("tasklist", ["/FO", "CSV", "/NH"], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => done(err && !out ? null : tasklistHasStudio(String(out))));
    } else if (process.platform === "darwin") {
      execFile("pgrep", ["-f", "RobloxStudio"], (err, out) => done(err ? ((err as { code?: number }).code === 1 ? false : null) : out.trim().length > 0));
    } else {
      done(null);
    }
  });
}

/** Parse list_roblox_studios output defensively (format is not formally documented). */
export function parseStudioList(text: string, json: unknown): Array<{ id: string; name: string; placeId?: string | number | null }> {
  const out: Array<{ id: string; name: string; placeId?: string | number | null }> = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(visit);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const id = o.studio_id ?? o.studioId ?? o.instance_id ?? o.instanceId ?? o.id;
      if (id !== undefined && (typeof id === "string" || typeof id === "number")) {
        out.push({
          id: String(id),
          name: String(o.name ?? o.place_name ?? o.placeName ?? o.title ?? "Studio"),
          placeId: (o.place_id ?? o.placeId ?? null) as string | number | null,
        });
        return;
      }
      Object.values(o).forEach(visit);
    }
  };
  if (json) visit(json);
  if (!out.length && text) {
    try {
      visit(JSON.parse(text));
    } catch {
      // Fallback: lines like "name: X, studio_id: abc, place_id: 123"
      for (const line of text.split(/\r?\n/)) {
        const id = line.match(/studio[_ ]?id["'\s:=]+([A-Za-z0-9-_{}]+)/i)?.[1];
        if (id) {
          out.push({
            id,
            name: line.match(/name["'\s:=]+([^,;]+)/i)?.[1]?.trim() ?? "Studio",
            placeId: line.match(/place[_ ]?id["'\s:=]+(\d+)/i)?.[1] ?? null,
          });
        }
      }
    }
  }
  return out;
}
