/**
 * Native Blender connection (no MCP / uv needed). The "Brickwire Connector" add-on (blender/brickwire_blender.py)
 * long-polls the bridge for jobs and posts results back; the user can also push the selection into the app chat.
 * Everything stays on 127.0.0.1. Python execution in Blender is a destructive tool (always confirmed).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import type { CompositeTool } from "../composites.js";
import type { AiFileStore, AiFile } from "../file-tools.js";
import { type ResultFeed, fileLine, storeB64, kb } from "./feed.js";

export const ADDON_VERSION = "1.0.0";
export const ADDON_FILE = "brickwire_blender.py";
const ONLINE_MS = 25_000;

export interface BlenderClient { id: string; blender: string; file: string; addon: string; lastSeen: number; polling: number }
interface Job { id: string; op: string; args: Record<string, unknown>; createdAt: number }
interface Pending { job: Job; resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; sent: boolean }

export class BlenderLink extends EventEmitter {
  readonly clients = new Map<string, BlenderClient>();
  private queue: Job[] = [];
  private pending = new Map<string, Pending>();
  private waiters = new Set<() => void>();
  constructor(private now: () => number = Date.now) { super(); this.setMaxListeners(50); }

  private touch(c: Partial<BlenderClient> & { id?: string }) {
    const id = String(c?.id ?? "").replace(/[^\w-]/g, "").slice(0, 40) || "blender";
    const cur = this.clients.get(id) ?? { id, blender: "", file: "", addon: "", lastSeen: 0, polling: 0 };
    const wasOnline = this.online();
    Object.assign(cur, { blender: String(c.blender ?? cur.blender).slice(0, 40), file: String(c.file ?? cur.file).slice(0, 200), addon: String(c.addon ?? cur.addon).slice(0, 20), lastSeen: this.now() });
    this.clients.set(id, cur);
    if (!wasOnline) this.emit("changed");
    return cur;
  }
  online() { const t = this.now(); return [...this.clients.values()].some((c) => c.polling > 0 || t - c.lastSeen < ONLINE_MS); }
  status() {
    const t = this.now();
    const clients = [...this.clients.values()].filter((c) => c.polling > 0 || t - c.lastSeen < ONLINE_MS).map((c) => ({ id: c.id, blender: c.blender, file: c.file, addon: c.addon, outdated: c.addon !== ADDON_VERSION, lastSeenMs: t - c.lastSeen }));
    return { connected: clients.length > 0, clients, addonVersion: ADDON_VERSION, queued: this.queue.length, running: [...this.pending.values()].filter((p) => p.sent).map((p) => p.job.op) };
  }
  /** Long-poll from the add-on: resolves with the next job or null after `waitMs`. */
  async poll(client: Partial<BlenderClient>, waitMs = 15000): Promise<Job | null> {
    const c = this.touch(client);
    const next = () => { const j = this.queue.shift(); if (j) { const p = this.pending.get(j.id); if (p) p.sent = true; } return j ?? null; };
    const j = next(); if (j) return j;
    c.polling++;
    try {
      return await new Promise<Job | null>((resolve) => {
        const done = (job: Job | null) => { clearTimeout(t); this.waiters.delete(wake); resolve(job); };
        const wake = () => { const job = next(); if (job) done(job); };
        const t = setTimeout(() => done(null), Math.max(0, Math.min(25000, waitMs)));
        this.waiters.add(wake);
      });
    } finally { c.polling = Math.max(0, c.polling - 1); c.lastSeen = this.now(); }
  }
  result(clientId: string, jobId: string, ok: boolean, data: unknown, error?: string) {
    if (clientId) this.touch({ id: clientId });
    const p = this.pending.get(String(jobId));
    if (!p) return false;
    clearTimeout(p.timer); this.pending.delete(p.job.id);
    if (ok) p.resolve(data); else p.reject(new Error(`Blender: ${String(error ?? "operation failed").slice(0, 3000)}`));
    return true;
  }
  call<T = any>(op: string, args: Record<string, unknown> = {}, timeoutMs = 120_000): Promise<T> {
    if (!this.online()) return Promise.reject(Object.assign(new Error("Blender is not connected. Open Blender with the Brickwire Connector add-on (Brickwire app → Blender & Figma → Install into Blender, then restart Blender)."), { status: 409 }));
    const job: Job = { id: "bj_" + crypto.randomBytes(6).toString("hex"), op, args, createdAt: this.now() };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(job.id); this.queue = this.queue.filter((j) => j !== job); reject(new Error(`Blender did not answer "${op}" within ${Math.round(timeoutMs / 1000)} s (is Blender busy or frozen by a modal dialog?)`)); }, timeoutMs);
      this.pending.set(job.id, { job, resolve: resolve as (v: unknown) => void, reject, timer, sent: false });
      this.queue.push(job);
      for (const w of [...this.waiters]) w();
    });
  }
}

// ------------------------------------------------------------------ add-on file, install, launch
export function addonSource(port: number): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "..", "..", "blender", ADDON_FILE), path.resolve(here, "..", "..", "..", "blender", ADDON_FILE), path.resolve(here, "blender", ADDON_FILE), path.resolve(process.cwd(), "blender", ADDON_FILE)];
  const f = candidates.find((p) => fs.existsSync(p));
  if (!f) throw Object.assign(new Error("blender/brickwire_blender.py is missing from the Brickwire folder — re-download Brickwire"), { status: 500 });
  return fs.readFileSync(f, "utf8").replace(/^DEFAULT_PORT = \d+/m, `DEFAULT_PORT = ${Math.trunc(port)}`);
}
export function blenderConfigRoots(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string[] {
  if (env.BRICKWIRE_BLENDER_CONFIG_DIR) return [env.BRICKWIRE_BLENDER_CONFIG_DIR];
  const home = env.HOME || env.USERPROFILE || os.homedir();
  if (platform === "win32") return [path.join(env.APPDATA || path.join(home, "AppData", "Roaming"), "Blender Foundation", "Blender")];
  if (platform === "darwin") return [path.join(home, "Library", "Application Support", "Blender")];
  return [path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "blender"), path.join(home, "snap", "blender", "common", ".config", "blender")];
}
const verNum = (v: string) => { const [a, b] = v.split(".").map(Number); return a * 1000 + (b || 0); };
export function findBlenderExe(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string | null {
  if (env.BRICKWIRE_BLENDER_EXE) return fs.existsSync(env.BRICKWIRE_BLENDER_EXE) ? env.BRICKWIRE_BLENDER_EXE : null;
  const ok = (p: string) => { try { return fs.statSync(p).isFile() ? p : null; } catch { return null; } };
  if (platform === "win32") {
    const roots = [env.ProgramFiles || "C:\\Program Files", env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"];
    const found: string[] = [];
    for (const r of roots) {
      const bf = path.join(r, "Blender Foundation");
      try { for (const d of fs.readdirSync(bf)) { const p = ok(path.join(bf, d, "blender.exe")); if (p) found.push(p); } } catch { /* none */ }
      const steam = ok(path.join(r, "Steam", "steamapps", "common", "Blender", "blender.exe")); if (steam) found.push(steam);
    }
    found.sort((a, b) => verNum((/(\d+\.\d+)/.exec(b)?.[1]) ?? "0") - verNum((/(\d+\.\d+)/.exec(a)?.[1]) ?? "0"));
    return found[0] ?? null;
  }
  if (platform === "darwin") return ok("/Applications/Blender.app/Contents/MacOS/Blender") ?? ok(path.join(os.homedir(), "Applications", "Blender.app", "Contents", "MacOS", "Blender"));
  for (const d of (env.PATH || "").split(path.delimiter)) { const p = ok(path.join(d, "blender")); if (p) return p; }
  return ok("/snap/bin/blender") ?? ok("/usr/bin/blender");
}
function exeVersion(exe: string | null, platform: NodeJS.Platform): string | null {
  if (!exe) return null;
  const m = /Blender[ \\/]*(\d+\.\d+)/i.exec(exe); if (m) return m[1];
  if (platform === "darwin") { try { const plist = fs.readFileSync(path.join(path.dirname(path.dirname(exe)), "Info.plist"), "utf8"); const v = /CFBundleShortVersionString<\/key>\s*<string>(\d+\.\d+)/.exec(plist); if (v) return v[1]; } catch { /* no plist */ } }
  try { const r = spawnSync(exe, ["--version"], { timeout: 20000, encoding: "utf8" }); const v = /Blender (\d+\.\d+)/.exec(r.stdout ?? ""); return v ? v[1] : null; } catch { return null; }
}
export interface InstallInfo { roots: string[]; versions: Array<{ version: string; dir: string; installed: boolean; current: boolean }>; exe: string | null }
export function installInfo(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): InstallInfo {
  const roots = blenderConfigRoots(env, platform), versions: InstallInfo["versions"] = [];
  for (const r of roots) {
    let dirs: string[] = []; try { dirs = fs.readdirSync(r).filter((d) => /^\d+\.\d+$/.test(d) && verNum(d) >= 2093); } catch { /* none */ }
    for (const v of dirs) {
      const f = path.join(r, v, "scripts", "startup", ADDON_FILE);
      let installed = false, current = false;
      try { const s = fs.readFileSync(f, "utf8"); installed = true; current = s.includes(`ADDON_VERSION = "${ADDON_VERSION}"`); } catch { /* not installed */ }
      versions.push({ version: v, dir: path.join(r, v), installed, current });
    }
  }
  versions.sort((a, b) => verNum(b.version) - verNum(a.version));
  return { roots, versions, exe: findBlenderExe(env, platform) };
}
/** Copy the add-on into Blender's scripts/startup folder of every installed Blender version (auto-loads on start). */
export function installAddon(port: number, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  const info = installInfo(env, platform);
  let targets = info.versions.map((v) => v.dir);
  if (!targets.length) {
    const v = exeVersion(info.exe, platform);
    if (!v) throw Object.assign(new Error(info.exe ? "Could not detect the Blender version. Start Blender once, close it and try again — or install the add-on manually (Download add-on → Blender: Edit → Preferences → Add-ons → Install)." : "Blender was not found on this computer. Install Blender 2.93+ from blender.org (or Steam), start it once, then press Install again."), { status: 404 });
    targets = [path.join(info.roots[0], v)];
  }
  const src = addonSource(port), written: string[] = [];
  for (const dir of targets) {
    const f = path.join(dir, "scripts", "startup", ADDON_FILE);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, src);
    written.push(f);
  }
  return { ok: true, written, note: "Restart Blender — the Brickwire Connector starts automatically (View3D → N panel → Brickwire)." };
}
export function uninstallAddon(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  const removed: string[] = [];
  for (const v of installInfo(env, platform).versions) if (v.installed) { const f = path.join(v.dir, "scripts", "startup", ADDON_FILE); fs.rmSync(f, { force: true }); removed.push(f); }
  return { ok: true, removed };
}
export function launchBlender(port: number, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform) {
  const exe = findBlenderExe(env, platform);
  if (!exe) throw Object.assign(new Error("Blender was not found. Install it from blender.org or set BRICKWIRE_BLENDER_EXE in Brickwire/.env to the full path of blender.exe"), { status: 404 });
  const installed = installInfo(env, platform).versions.some((v) => v.installed);
  const args: string[] = [];
  if (!installed) { const tmp = path.join(os.tmpdir(), ADDON_FILE); fs.writeFileSync(tmp, addonSource(port)); args.push("--python", tmp); }
  const child = spawn(exe, args, { detached: true, stdio: "ignore", windowsHide: false });
  child.on("error", () => undefined);
  child.unref();
  return { ok: true, exe, withAddon: installed ? "installed" : "loaded for this session (--python)" };
}

// ------------------------------------------------------------------ ingest results into files + chat
export interface BlenderDeps { link: BlenderLink; store: () => AiFileStore; feed: () => ResultFeed | null }
export interface ModelPayload { name?: string; objects?: string[]; triangles?: number; files?: Array<{ name?: string; data?: string }>; render?: { name?: string; data?: string }; renderError?: string; skipped?: string[]; file?: string; blender?: string }
export function ingestModel(deps: BlenderDeps, p: ModelPayload, opts: { toChat?: boolean; reason?: string } = {}) {
  const st = deps.store(), feed = deps.feed();
  const files = storeB64(st, p.files ?? [], "blender");
  const img = p.render?.data ? storeB64(st, [{ name: `${(p.name || "blender").replace(/[^\w-]+/g, "_")}_view.png`, data: p.render.data }], "blender")[0] : undefined;
  const obj = files.find((f) => f.ext === "obj"), mtl = files.find((f) => f.ext === "mtl");
  let artifact: ReturnType<ResultFeed["importModel"]> | null = null, artifactError: string | undefined;
  if (obj && feed) {
    try { artifact = feed.importModel({ name: p.name || obj.name.replace(/\.obj$/i, ""), obj: st.read(obj.id).toString("utf8"), mtl: mtl ? st.read(mtl.id).toString("utf8") : undefined, source: "blender", request: `Blender${p.file ? " · " + p.file : ""}: ${(p.objects ?? []).slice(0, 8).join(", ")}`, fileIds: files.map((f) => f.id) }); }
    catch (e) { artifactError = (e as Error).message; }
  }
  const main = files.find((f) => ["fbx", "glb", "gltf"].includes(f.ext));
  let message: { conversationId: string; messageId: string } | null = null;
  if (opts.toChat !== false && feed) {
    const lines = [
      `**Blender → Brickwire:** ${p.name ? `«${p.name}»` : "модель"}${p.objects?.length ? ` — объектов: ${p.objects.length}` : ""}${p.triangles ? `, треугольников: ${p.triangles.toLocaleString("ru-RU")}` : ""}${p.file ? ` (${p.file})` : ""}.`,
      ...(opts.reason ? [opts.reason] : []),
      ...files.map((f) => "- " + fileLine(f)),
      ...(p.skipped?.length ? [`Не отправлено (слишком большие): ${p.skipped.join(", ")}`] : []),
      ...(artifactError ? [`3D-превью не построено: ${artifactError}`] : []),
      ...(p.renderError ? [`Снимок вьюпорта не получен: ${p.renderError}`] : []),
      main ? "Дальше можно: «загрузи в Roblox и вставь в Studio» (file_upload_roblox → file_to_studio) или кнопки ниже." : "",
    ].filter(Boolean);
    message = feed.post({
      source: "blender", title: "Blender", text: lines.join("\n"),
      images: img ? [{ name: img.name, data: st.read(img.id) }] : [],
      artifacts: artifact ? [artifact.id] : [],
      actions: [
        ...(artifact ? [{ label: "В Studio (EditableMesh)", tool: "artifact_studio_import", args: { artifact_id: artifact.id } }] : []),
        ...(main ? [{ label: "Загрузить в Roblox и вставить", tool: "file_to_studio", args: { fileId: main.id } }] : []),
      ],
    });
  }
  return { files: files.map((f) => ({ fileId: f.id, name: f.name, bytes: f.bytes })), imageFileId: img?.id, artifactId: artifact?.id, artifactStats: artifact?.stats, artifactError, chat: message, skipped: p.skipped ?? [] };
}

// ------------------------------------------------------------------ AI tools
const s = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const MODEL_EXT = new Set(["obj", "fbx", "glb", "gltf", "stl", "ply", "dae", "usd", "usdz", "usda", "usdc", "abc"]);
export function makeBlenderTools(deps: BlenderDeps & { artifactFiles?: (id: string) => Array<{ name: string; data: Buffer }> }): CompositeTool[] {
  const st = () => deps.store();
  return [
    {
      name: "blender_status",
      description: "Is Blender connected to Brickwire (Brickwire Connector add-on)? Returns Blender version, open .blend file and how to connect if it is not.",
      risk: "read", requires: [], inputSchema: { type: "object", properties: {} },
      async run() { const s0 = deps.link.status(); return { ...s0, howToConnect: s0.connected ? undefined : "Ask the user: Brickwire app → «Blender и Figma» → «Установить в Blender», then restart Blender (or «Запустить Blender»)." }; },
    },
    {
      name: "blender_scene",
      description: "Read the open Blender scene: objects (type, location, dimensions, vertex/face counts, materials), selection, active object.",
      risk: "read", requires: [], inputSchema: { type: "object", properties: { limit: { type: "number", description: "max objects (default 200)" } } },
      async run(a) { return deps.link.call("scene", { limit: Math.min(1000, Number(a.limit) || 200) }, 30_000); },
    },
    {
      name: "blender_python",
      description: "Run Python (bpy) inside the user's Blender: model, edit, add modifiers/materials, set up scenes. print() output and a variable named `result` are returned. Blender's own undo (Ctrl+Z) applies. Then blender_render to look at the result, blender_export to bring it into Brickwire.",
      risk: "destructive", requires: [],
      inputSchema: { type: "object", required: ["code"], properties: { code: s("Python code using bpy") } },
      async run(a) { const code = String(a.code ?? ""); if (!code.trim()) throw new Error("code is required"); if (code.length > 200_000) throw new Error("code is too long"); return deps.link.call("python", { code }, 300_000); },
    },
    {
      name: "blender_import",
      description: "Import a model into Blender: a stored file (fileId of obj/fbx/glb/gltf/stl/ply — e.g. from file_fetch or the chat) or a Brickwire 3D artifact (artifact_id).",
      risk: "write", requires: [],
      inputSchema: { type: "object", properties: { fileId: s("stored model file id"), artifact_id: s("Brickwire 3D artifact id (art_…)"), name: s("object name in Blender (single-object imports)") } },
      async run(a) {
        let files: Array<{ name: string; data: string }>;
        if (a.artifact_id) {
          if (!deps.artifactFiles) throw new Error("artifact store unavailable");
          files = deps.artifactFiles(String(a.artifact_id)).map((f) => ({ name: f.name, data: f.data.toString("base64") }));
        } else {
          const f = st().get(String(a.fileId ?? ""));
          if (!MODEL_EXT.has(f.ext)) throw new Error(`${f.name} is not a model Blender can import (obj, fbx, glb, gltf, stl, ply, dae, usd, abc)`);
          files = [{ name: f.name, data: st().read(f.id).toString("base64") }];
          if (f.ext === "obj") { const m = st().list().find((x) => x.ext === "mtl" && x.name.replace(/\.mtl$/i, "") === f.name.replace(/\.obj$/i, "")); if (m) files.push({ name: m.name, data: st().read(m.id).toString("base64") }); }
        }
        return deps.link.call("import", { files, ...(a.name ? { name: String(a.name) } : {}) }, 300_000);
      },
    },
    {
      name: "blender_export",
      description: "Export from Blender into Brickwire: the selected objects (default) or the whole scene as GLB/OBJ(+MTL)/FBX/STL. Files land in the file store (fileIds for file_upload_roblox / file_to_studio), OBJ becomes a 3D artifact (artifact_studio_import), and the result with a viewport picture is posted to the Brickwire app chat.",
      risk: "write", requires: [],
      inputSchema: { type: "object", properties: { selection: { type: "boolean", description: "only selected objects (default true)" }, formats: { type: "array", items: { type: "string", enum: ["glb", "obj", "fbx", "stl"] }, description: "default [\"glb\",\"obj\"]; use fbx for Roblox upload of rigged models" }, name: s("file base name"), toChat: { type: "boolean", description: "post into the app chat (default true)" } } },
      async run(a) {
        const formats = Array.isArray(a.formats) && a.formats.length ? a.formats.map(String) : ["glb", "obj"];
        const exp = await deps.link.call<ModelPayload>("export", { selection: a.selection !== false, formats, ...(a.name ? { name: String(a.name) } : {}) }, 300_000);
        let render: ModelPayload["render"]; let renderError: string | undefined;
        try { render = await deps.link.call("render", { width: 1024, height: 768 }, 120_000); } catch (e) { renderError = (e as Error).message; }
        const r = ingestModel(deps, { ...exp, render, renderError }, { toChat: a.toChat !== false });
        return { ok: true, ...r, bwAttach: r.imageFileId ? [{ fileId: r.imageFileId, name: "blender_view.png", mime: "image/png" }] : undefined, next: "file_upload_roblox {fileId of .fbx/.glb} → file_to_studio, or artifact_studio_import {artifact_id}" };
      },
    },
    {
      name: "blender_render",
      description: "Take a picture of the Blender viewport (or render the scene camera with camera=true). The PNG is stored, attached so you can see it, and shown in the app chat.",
      risk: "read", requires: [],
      inputSchema: { type: "object", properties: { width: { type: "number" }, height: { type: "number" }, camera: { type: "boolean", description: "render through the scene camera with the scene's engine (slower)" }, toChat: { type: "boolean", description: "default true" } } },
      async run(a) {
        const r = await deps.link.call<{ name: string; data: string }>("render", { width: Math.min(2048, Number(a.width) || 1024), height: Math.min(2048, Number(a.height) || 768), camera: a.camera === true }, a.camera ? 600_000 : 120_000);
        const f = storeB64(st(), [{ name: "blender_render.png", data: r.data }], "blender")[0];
        if (!f) throw new Error("Blender returned an empty picture");
        const chat = a.toChat === false ? null : deps.feed()?.post({ source: "blender", title: "Blender", text: `**Blender:** снимок ${a.camera ? "камеры" : "вьюпорта"} (${f.width ?? "?"}×${f.height ?? "?"}, ${kb(f.bytes)}) → fileId ${f.id}`, images: [{ name: f.name, data: st().read(f.id) }] }) ?? null;
        return { ok: true, fileId: f.id, width: f.width, height: f.height, chat, bwAttach: [{ fileId: f.id, name: f.name, mime: f.mime }] };
      },
    },
  ];
}
export type { AiFile };
