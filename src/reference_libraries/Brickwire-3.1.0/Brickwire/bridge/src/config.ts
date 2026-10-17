import fs from "node:fs";
import path from "node:path";
import { DEFAULT_BRIDGE_PORT, type SafetyMode } from "../../shared/src/protocol.js";

export interface BridgeConfig {
  port: number;
  host: string;
  baseDir: string;
  dataDir: string;
  mcpCommand: string | null;
  mcpArgs: string[];
  mcpReason: string;
  mode: SafetyMode;
  blockedTools: string[];
  studioPollMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
  luauPrintResults: boolean;
  /** Prepend the BW Luau helper library to execute_luau code that uses BW.* (default on). */
  luauHelpers: boolean;
  /** Brickwire's own high-level Luau composite tools (create_part, …). Off by default: the AI uses the real Studio tools. */
  composites: boolean;
  /** MCP launcher was auto-detected (not set via BRICKWIRE_MCP_COMMAND) → the bridge may re-detect it later. */
  mcpAuto: boolean;
}

/** Tiny .env reader (no dependency). Existing process env wins. */
export function loadDotEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

function expandEnv(s: string): string {
  return s.replace(/%([A-Za-z0-9_]+)%/g, (_, n) => process.env[n] ?? `%${n}%`).replace(/\$\{([A-Za-z0-9_]+)\}/g, (_, n) => process.env[n] ?? "");
}

function parseArgs(raw: string | undefined): string[] {
  if (!raw) return [];
  const t = raw.trim();
  if (t.startsWith("[")) return (JSON.parse(t) as unknown[]).map((x) => expandEnv(String(x)));
  return t.split(/\s+/).map(expandEnv);
}

const WIN_STUDIO_EXES = ["RobloxStudioBeta.exe", "RobloxStudio.exe"];

function newest(files: string[]): string | null {
  let best: string | null = null;
  let bestT = -1;
  for (const f of files) {
    try {
      const t = fs.statSync(f).mtimeMs;
      if (t > bestT) {
        bestT = t;
        best = f;
      }
    } catch {
      /* vanished */
    }
  }
  return best;
}

/**
 * Find StudioMCP.exe of the LIVE Studio install (Windows).
 * Why not %LOCALAPPDATA%\Roblox\mcp.bat: it hard-codes one Studio version folder; after a Studio auto-update
 * that folder disappears and the .bat silently fails (bridge sees no server / 0 tools). We scan every
 * version folder and prefer the newest one that ALSO contains the Studio executable (old "zombie" folders
 * keep a StudioMCP.exe without a Studio to attach to).
 */
export function findStudioMcpWindows(env = process.env, extraDirs: string[] = []): string | null {
  return studioMcpCandidatesWindows(env, extraDirs)[0] ?? null;
}

/**
 * Every StudioMCP.exe found, best first: next to the running Studio, then version folders that also hold a
 * Studio exe (newest Studio build first — by the Studio exe time, not the proxy's), then orphans.
 * Used to recover from "Client proxy is out of date": try the next candidate until Studio accepts it.
 */
export function studioMcpCandidatesWindows(env = process.env, extraDirs: string[] = []): string[] {
  const la = env.LOCALAPPDATA;
  const roots = [
    la && path.join(la, "Roblox", "Versions"),
    // Bloxstrap-family launchers keep their own Studio copies
    ...["Bloxstrap", "Fishstrap", "Voidstrap", "Froststrap", "Lunastrap", "Plexity"].map((n) => la && path.join(la, n, "Versions")),
    env.ProgramFiles && path.join(env.ProgramFiles, "Roblox", "Versions"),
    env["ProgramFiles(x86)"] && path.join(env["ProgramFiles(x86)"]!, "Roblox", "Versions"),
    env.USERPROFILE && path.join(env.USERPROFILE, "AppData", "Local", "Roblox", "Versions"),
  ].filter(Boolean) as string[];
  const live: string[] = [];
  const paired: Array<{ exe: string; t: number }> = [];
  const orphans: Array<{ exe: string; t: number }> = [];
  const mtime = (f: string) => {
    try {
      return fs.statSync(f).mtimeMs;
    } catch {
      return -1;
    }
  };
  // folders of the RUNNING Studio first: whatever launcher started it, StudioMCP.exe sits next to it
  for (const d of extraDirs) {
    const exe = path.join(d, "StudioMCP.exe");
    if (fs.existsSync(exe)) live.push(exe);
  }
  for (const root of [...new Set(roots)]) {
    let dirs: string[] = [];
    try {
      dirs = fs.readdirSync(root);
    } catch {
      continue;
    }
    for (const d of dirs) {
      const exe = path.join(root, d, "StudioMCP.exe");
      if (!fs.existsSync(exe)) continue;
      const studio = WIN_STUDIO_EXES.map((s) => path.join(root, d, s)).find((f) => fs.existsSync(f));
      if (studio) paired.push({ exe, t: Math.max(mtime(studio), mtime(exe)) });
      else orphans.push({ exe, t: mtime(exe) });
    }
  }
  const by = (a: { t: number }, b: { t: number }) => b.t - a.t;
  const all = [...live, ...paired.sort(by).map((x) => x.exe), ...orphans.sort(by).map((x) => x.exe)];
  const seen = new Set<string>();
  return all.filter((f) => {
    const k = path.resolve(f).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Extract an existing StudioMCP executable path from a mcp.bat / MCP client config text. */
export function studioMcpPathFromText(text: string): string | null {
  const re = /([A-Za-z]:\\[^"'\r\n<>|*?]*?StudioMCP(?:\.exe)?|\/[^"'\r\n<>|*?]*?StudioMCP(?:\.exe)?)(?=["'\s]|$)/gi;
  for (const m of text.replace(/\\\\/g, "\\").matchAll(re)) {
    const f = m[1];
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** MCP client configs that may already point at the Studio MCP server (Claude Desktop, Cursor, VS Code, Windsurf…). */
export function mcpClientConfigFiles(env = process.env): string[] {
  const home = env.USERPROFILE || env.HOME || "";
  const appdata = env.APPDATA || (home && path.join(home, "AppData", "Roaming"));
  return [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Roblox", "mcp.bat"),
    appdata && path.join(appdata, "Claude", "claude_desktop_config.json"),
    home && path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json"),
    home && path.join(home, ".cursor", "mcp.json"),
    home && path.join(home, ".codeium", "windsurf", "mcp_config.json"),
    appdata && path.join(appdata, "Code", "User", "mcp.json"),
    home && path.join(home, ".claude.json"),
  ].filter(Boolean) as string[];
}

export function findStudioMcpInConfigs(env = process.env): { file: string; exe: string } | null {
  for (const file of mcpClientConfigFiles(env)) {
    try {
      if (!fs.existsSync(file) || fs.statSync(file).size > 4_000_000) continue;
      const exe = studioMcpPathFromText(fs.readFileSync(file, "utf8"));
      if (exe) return { file, exe };
    } catch {
      /* unreadable */
    }
  }
  return null;
}

/** Resolve how to launch Roblox's Studio MCP server (stdio). */
export function defaultMcpLauncher(platform = process.platform, runningExes: string[] = []): { command: string | null; args: string[]; reason: string } {
  const override = process.env.BRICKWIRE_STUDIO_MCP_PATH;
  if (override) {
    let f = override;
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, platform === "darwin" ? "Contents/MacOS/StudioMCP" : "StudioMCP.exe");
    if (fs.existsSync(f)) {
      // 1.8.2: a pinned version-… folder goes stale after every Studio update. If Studio is running from a
      // DIFFERENT folder that has its own StudioMCP, that one wins (it is the only proxy the new Studio accepts).
      const bin = platform === "darwin" ? "StudioMCP" : "StudioMCP.exe";
      const norm = (p: string) => path.resolve(p).toLowerCase();
      const pinnedDir = norm(path.dirname(f));
      for (const e of runningExes) {
        const dir = path.dirname(e);
        if (norm(dir) === pinnedDir) break;
        const near = path.join(dir, bin);
        if (fs.existsSync(near)) return { command: near, args: [], reason: `BRICKWIRE_STUDIO_MCP_PATH points at ${path.dirname(f)}, but Studio runs from ${dir} — using StudioMCP next to the running Studio` };
      }
      return { command: f, args: [], reason: "BRICKWIRE_STUDIO_MCP_PATH" };
    }
  }
  if (platform === "win32") {
    const exe = findStudioMcpWindows(process.env, runningExes.map((e) => path.dirname(e)));
    if (exe) {
      const live = runningExes.some((e) => path.dirname(e).toLowerCase() === path.dirname(exe).toLowerCase());
      return { command: exe, args: [], reason: live ? `StudioMCP.exe next to the running Studio (${path.dirname(exe)})` : `StudioMCP.exe of the newest Studio install (${path.dirname(exe)})` };
    }
    const cfg = findStudioMcpInConfigs();
    if (cfg) return { command: cfg.exe, args: [], reason: `StudioMCP path taken from ${cfg.file}` };
    const local = process.env.LOCALAPPDATA;
    const bat = local ? path.join(local, "Roblox", "mcp.bat") : null;
    if (bat && fs.existsSync(bat)) return { command: "cmd.exe", args: ["/d", "/s", "/c", bat], reason: "fallback %LOCALAPPDATA%\\Roblox\\mcp.bat" };
    return {
      command: null,
      args: [],
      reason:
        "StudioMCP.exe not found (searched %LOCALAPPDATA%\\Roblox\\Versions, Bloxstrap/Fishstrap/Voidstrap Versions, Program Files, the running Studio folder, mcp.bat and Claude/Cursor MCP configs). Update Roblox Studio, open a place, enable Assistant → … → Manage MCP Servers → Enable Studio as MCP server, or set BRICKWIRE_STUDIO_MCP_PATH in .env. The bridge keeps looking every few seconds.",
    };
  }
  if (platform === "darwin") {
    const home = process.env.HOME ?? "";
    for (const p of runningExes) {
      const bin = path.join(path.dirname(p), "StudioMCP");
      if (fs.existsSync(bin)) return { command: bin, args: [], reason: `StudioMCP next to the running Studio (${path.dirname(p)})` };
    }
    const cfg = findStudioMcpInConfigs();
    if (cfg) return { command: cfg.exe, args: [], reason: `StudioMCP path taken from ${cfg.file}` };
    for (const app of ["/Applications/RobloxStudio.app", path.join(home, "Applications/RobloxStudio.app"), "/Applications/Roblox.app", "/Applications/RobloxStudioBeta.app"]) {
      const bin = path.join(app, "Contents", "MacOS", "StudioMCP");
      if (fs.existsSync(bin)) return { command: bin, args: [], reason: `StudioMCP in ${app}` };
    }
    return { command: null, args: [], reason: "StudioMCP binary not found in /Applications/RobloxStudio.app" };
  }
  return { command: null, args: [], reason: "Roblox Studio is only available on Windows and macOS; set BRICKWIRE_MCP_COMMAND to use another MCP server." };
}

export function loadConfig(baseDir: string): BridgeConfig {
  loadDotEnv(path.join(baseDir, ".env"));
  const env = process.env;
  let mcpCommand: string | null;
  let mcpArgs: string[];
  let mcpReason: string;
  if (env.BRICKWIRE_MCP_COMMAND && env.BRICKWIRE_MCP_COMMAND !== "auto") {
    if (env.BRICKWIRE_MCP_COMMAND === "none") {
      mcpCommand = null;
      mcpArgs = [];
      mcpReason = "MCP disabled by BRICKWIRE_MCP_COMMAND=none";
    } else {
      mcpCommand = expandEnv(env.BRICKWIRE_MCP_COMMAND);
      mcpArgs = parseArgs(env.BRICKWIRE_MCP_ARGS);
      mcpReason = "configured via BRICKWIRE_MCP_COMMAND";
    }
  } else {
    const d = defaultMcpLauncher();
    mcpCommand = d.command;
    mcpArgs = d.args;
    mcpReason = d.reason;
  }
  const mode = (env.BRICKWIRE_MODE as SafetyMode) || "auto";
  return {
    port: Number(env.BRICKWIRE_PORT || DEFAULT_BRIDGE_PORT),
    host: "127.0.0.1",
    baseDir,
    dataDir: path.resolve(baseDir, env.BRICKWIRE_DATA_DIR || "data"),
    mcpCommand,
    mcpArgs,
    mcpReason,
    mode: ["full", "auto", "approval", "safe"].includes(mode) ? mode : "auto",
    blockedTools: (env.BRICKWIRE_BLOCKED_TOOLS ?? "store_image").split(",").map((s) => s.trim()).filter(Boolean),
    studioPollMs: Number(env.BRICKWIRE_STUDIO_POLL_MS || 4000),
    logLevel: (env.BRICKWIRE_LOG_LEVEL as BridgeConfig["logLevel"]) || "info",
    luauPrintResults: env.BRICKWIRE_LUAU_PRINT_RESULTS === "1",
    luauHelpers: env.BRICKWIRE_LUAU_HELPERS !== "0",
    composites: env.BRICKWIRE_COMPOSITES === "1",
    mcpAuto: !(env.BRICKWIRE_MCP_COMMAND && env.BRICKWIRE_MCP_COMMAND !== "auto"),
  };
}
