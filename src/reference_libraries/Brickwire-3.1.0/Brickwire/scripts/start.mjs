#!/usr/bin/env node
/**
 * One-command launcher: starts the bridge (unless already running), then prints an honest,
 * live status of the whole chain until Studio is really usable:
 *   [BRIDGE] up?   [MCP] StudioMCP process + how many tools it advertises   [STUDIO] place open?
 * Green "READY" is printed only when the bridge reports MCP_READY (tools > 0 and a place is open).
 * Ctrl+C stops the bridge it started.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let port = process.env.BRICKWIRE_PORT;
try {
  const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
  port ??= env.match(/^BRICKWIRE_PORT=(\d+)/m)?.[1];
} catch {}
port ??= "47821";
const URL_ = `http://127.0.0.1:${port}`;
const color = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
const G = (s) => c(32, s), Y = (s) => c(33, s), R = (s) => c(31, s), D = (s) => c(90, s);
const ts = () => new Date().toTimeString().slice(0, 8);
const say = (s) => console.log(`${D(ts())} ${s}`);

/** Keeps the Brickwire Studio plugin installed and up to date (Studio loads it on its next start). */
function installStudioPlugin() {
  const src = path.join(ROOT, "plugin", "BrickwireChat.plugin.lua");
  if (!fs.existsSync(src) || process.env.BRICKWIRE_NO_PLUGIN) return;
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const dirs = process.platform === "win32"
    ? [path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Roblox", "Plugins")]
    : [path.join(home, "Documents", "Roblox", "Plugins")];
  for (const dir of dirs) {
    try {
      if (!fs.existsSync(path.dirname(dir))) continue; // Studio not installed for this user
      fs.mkdirSync(dir, { recursive: true });
      const dst = path.join(dir, "BrickwireChat.lua");
      // remove stale copies under other names so Studio does not show two toolbars
      for (const old of ["BrickwireChat.plugin.lua", "BrickwireChat.rbxmx", "Brickwire.lua"]) {
        try { fs.rmSync(path.join(dir, old), { force: true }); } catch { /* ignore */ }
      }
      const body = fs.readFileSync(src);
      if (fs.existsSync(dst) && fs.readFileSync(dst).equals(body)) {
        say(D("[PLUGIN] Studio plugin up to date → " + dst + "  (Plugins tab → Brickwire → AI Chat)"));
        continue;
      }
      fs.writeFileSync(dst, body);
      say(G("[PLUGIN] Brickwire AI Chat plugin installed → ") + dst + D("  (RESTART Studio, then Plugins tab → Brickwire → AI Chat)"));
    } catch (e) {
      say(Y("[PLUGIN] could not install the Studio plugin: " + e.message));
    }
  }
}
installStudioPlugin();

async function health() {
  try {
    const r = await fetch(`${URL_}/api/health`, { signal: AbortSignal.timeout(2000) });
    return await r.json();
  } catch {
    return null;
  }
}

let child = null;
const logDir = path.join(ROOT, "logs");
async function main() {
  console.log(`Brickwire launcher — bridge ${URL_}`);
  const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
  let running = await health();
  if (running && running.bridgeVersion && running.bridgeVersion !== PKG) {
    // an OLD bridge from a previous version is still running → its tools are outdated: replace it
    say(Y(`[BRIDGE] old bridge ${running.bridgeVersion} is running — restarting it as ${PKG}`));
    try { await fetch(`${URL_}/api/shutdown`, { method: "POST", signal: AbortSignal.timeout(3000) }); } catch { /* already gone */ }
    for (let i = 0; i < 40 && (await health()); i++) await new Promise((r) => setTimeout(r, 250));
    running = await health();
    if (running) say(R("[BRIDGE] the old bridge did not stop — close its window (or run stop.bat) and start again"));
  }
  if (running) {
    say(G("[BRIDGE] already running") + " — monitoring only (use stop.bat to stop it)");
  } else {
    const entry = path.join(ROOT, "bridge", "dist", "bridge.mjs");
    if (!fs.existsSync(entry)) {
      say(R("[BRIDGE] bridge/dist/bridge.mjs missing — run install.bat (npm install && npm run build)"));
      process.exit(1);
    }
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "bridge.log");
    const out = fs.openSync(logFile, "a");
    child = spawn(process.execPath, [entry], { cwd: ROOT, stdio: ["ignore", out, out], env: process.env });
    child.on("exit", (code) => {
      say(R(`[BRIDGE] exited (code ${code}). See ${logFile}`));
      process.exit(code ?? 1);
    });
    say(`[BRIDGE] starting… (log: ${logFile})`);
  }

  let last = "";
  let readyShown = false;
  let zeroToolsSince = null;
  for (;;) {
    const h = await health();
    let line, base;
    if (!h) line = Y("[BRIDGE] not responding yet…");
    else {
      const m = h.mcp ?? {};
      const bridge = G("[BRIDGE] OK");
      const mcp =
        m.state === "ready"
          ? m.toolCount > 0
            ? G(`[MCP] ${m.serverName ?? "StudioMCP"} — ${m.toolCount} tools`)
            : Y("[MCP] running, 0 tools (Studio not attached yet)")
          : m.state === "disabled"
            ? R(`[MCP] not found — ${h.reason}`)
            : m.state === "error"
              ? R(`[MCP] error — ${m.lastError ?? h.reason}`)
              : Y(`[MCP] ${m.state}…`);
      const studio =
        h.state === "MCP_READY" || h.state === "SESSION_ACTIVE"
          ? G(`[STUDIO] ${h.studio?.selected?.name ?? "place"} open`)
          : h.studio?.placeOpen === false
            ? Y("[STUDIO] connected, but no place is open — open a place")
            : Y(`[STUDIO] ${h.reason}`);
      line = `${bridge}  ${mcp}  ${studio}`;
      base = line;
      if (m.state === "ready" && !(m.toolCount > 0)) {
        zeroToolsSince ??= Date.now();
        if (Date.now() - zeroToolsSince > 30000 && !readyShown) {
          line += "\n         " + Y("Hint: open Roblox Studio, open a place, and enable the MCP server (Assistant → ⋯ → Manage MCP Servers / Studio as MCP server).");
          zeroToolsSince = Date.now() + 60000;
        }
      } else zeroToolsSince = null;
      const ok = h.state === "MCP_READY" || h.state === "SESSION_ACTIVE";
      if (ok && !readyShown) {
        readyShown = true;
        line += "\n\n  " + G("READY") + " — open your AI chat (ChatGPT, Claude, Gemini, DeepSeek…), click \"Start Agent\" in the Brickwire panel —\n  or type in Studio: Plugins → Brickwire → AI Chat.\n  Brickwire Pro app: " + URL_ + "/app   Dashboard: " + URL_ + "/\n  Keep this window open. Ctrl+C stops the bridge.\n";
      }
      if (!ok) readyShown = false;
    }
    base ??= line;
    if (base !== last) {
      say(line);
      last = base;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { child?.kill(); process.exit(0); });
main();
