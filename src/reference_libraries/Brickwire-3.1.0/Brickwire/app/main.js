// Brickwire Pro — Electron shell: runs the bridge (bundled Node via ELECTRON_RUN_AS_NODE), shows /app, lives in the tray.
const { app, BrowserWindow, Tray, Menu, shell, nativeImage, dialog } = require("electron");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const PORT = Number(process.env.BRICKWIRE_PORT || 47821);
const BASE = `http://127.0.0.1:${PORT}`;
const RES = app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "..");
const DATA = path.join(app.getPath("userData"), "data");
let bridge = null, win = null, tray = null, quitting = false;

if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => show());

async function healthy() {
  try { return (await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

function installPlugin() {
  // keep the Studio plugin up to date (Studio loads it on next start)
  const src = path.join(RES, "plugin", "BrickwireChat.plugin.lua");
  const dir = process.platform === "win32" ? path.join(process.env.LOCALAPPDATA || "", "Roblox", "Plugins") : path.join(app.getPath("home"), "Documents", "Roblox", "Plugins");
  try {
    if (!fs.existsSync(src) || !fs.existsSync(path.dirname(dir))) return;
    fs.mkdirSync(dir, { recursive: true });
    const dst = path.join(dir, "BrickwireChat.lua");
    for (const old of ["BrickwireChat.plugin.lua", "BrickwireChat.rbxmx"]) { try { fs.rmSync(path.join(dir, old), { force: true }); } catch { /* ignore */ } }
    if (!fs.existsSync(dst) || !fs.readFileSync(dst).equals(fs.readFileSync(src))) fs.copyFileSync(src, dst);
  } catch { /* not fatal */ }
}

async function runningVersion() {
  try { return (await (await fetch(BASE + "/api/health", { signal: AbortSignal.timeout(1500) })).json()).bridgeVersion || null; } catch { return null; }
}

async function startBridge() {
  const ver = await runningVersion();
  if (ver && ver !== app.getVersion()) {
    // a bridge from an older Brickwire is still running: its tools/UI are outdated → replace it
    try { await fetch(BASE + "/api/shutdown", { method: "POST", signal: AbortSignal.timeout(3000) }); } catch { /* gone */ }
    for (let i = 0; i < 40 && (await healthy()); i++) await new Promise((r) => setTimeout(r, 250));
  }
  if (await healthy()) return; // already running (start.bat), same version
  fs.mkdirSync(DATA, { recursive: true });
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: "1", BRICKWIRE_DATA_DIR: DATA, BRICKWIRE_PORT: String(PORT) };
  bridge = spawn(process.execPath, [path.join(RES, "bridge", "dist", "bridge.mjs")], { cwd: RES, env, stdio: "ignore", windowsHide: true });
  bridge.on("exit", (code) => { bridge = null; if (!quitting) tray?.setToolTip(`Brickwire Pro — bridge stopped (${code})`); });
  for (let i = 0; i < 40 && !(await healthy()); i++) await new Promise((r) => setTimeout(r, 250));
}

function show() {
  if (!win) {
    win = new BrowserWindow({ width: 1200, height: 800, minWidth: 900, minHeight: 600, title: "Brickwire Pro", backgroundColor: "#0e0f14", autoHideMenuBar: true, icon: path.join(__dirname, "icon.png"), webPreferences: { contextIsolation: true, sandbox: true } });
    win.loadURL(BASE + "/app");
    win.webContents.setWindowOpenHandler(({ url }) => {
      // Server/tool content cannot launch arbitrary protocols or executables.
      try { const parsed = new URL(url); if (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname))) shell.openExternal(url); } catch { /* invalid URL */ }
      return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
      try { if (new URL(url).origin !== BASE) event.preventDefault(); } catch { event.preventDefault(); }
    });
    win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  }
  win.show();
  win.focus();
}

app.whenReady().then(async () => {
  installPlugin();
  await startBridge();
  if (!(await healthy())) dialog.showErrorBox("Brickwire Pro", "The bridge did not start. Check that port " + PORT + " is free.");
  const icon = fs.existsSync(path.join(__dirname, "icon.png")) ? nativeImage.createFromPath(path.join(__dirname, "icon.png")) : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("Brickwire Pro");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Brickwire Pro", click: show },
    { label: "Bridge dashboard", click: () => shell.openExternal(BASE + "/") },
    { label: "Open extension folder", click: () => shell.openPath(path.join(RES, "extension")) },
    { type: "separator" },
    { label: "Quit", click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on("click", show);
  show();
});
app.on("window-all-closed", () => { /* stay in the tray */ });
app.on("before-quit", () => { quitting = true; if (bridge) bridge.kill(); });
