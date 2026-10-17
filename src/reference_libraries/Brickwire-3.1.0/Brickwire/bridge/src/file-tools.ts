/**
 * Brickwire 3.0 AI file tools: the AI can download files from the internet, create its own files, read them,
 * upload them to Roblox (Open Cloud), put them into Studio and attach them to the AI chat so it can look at them.
 * Files live under <dataDir>/ai-files/ (bounded: count, size per file, total size; oldest evicted first).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { CompositeTool } from "./composites.js";
import { pathSegments, wrapLuau } from "./luau.js";
import { uploadAsset, openCloudEnv, DECAL_TO_IMAGE_LUAU, type FetchLike } from "./imagegen.js";

export type FileKind = "image" | "audio" | "video" | "model" | "text" | "archive" | "document" | "binary";
export interface AiFile {
  id: string; name: string; mime: string; kind: FileKind; ext: string; bytes: number; sha256: string;
  createdAt: string; source: "url" | "ai" | "studio" | "user" | "blender" | "figma"; url?: string; width?: number; height?: number;
  roblox?: { assetId: string; assetType: string; imageId?: string; at: string };
}

const MB = 1024 * 1024;
const TEXT_EXT = new Set(["txt", "md", "lua", "luau", "json", "csv", "tsv", "xml", "html", "htm", "js", "ts", "css", "yaml", "yml", "toml", "ini", "log", "svg", "obj", "mtl", "gltf", "rbxmx", "py", "sh"]);
const KIND_BY_EXT: Record<string, FileKind> = {
  png: "image", jpg: "image", jpeg: "image", gif: "image", webp: "image", bmp: "image", tga: "image", svg: "image",
  mp3: "audio", ogg: "audio", wav: "audio", flac: "audio",
  mp4: "video", mov: "video", webm: "video",
  fbx: "model", glb: "model", gltf: "model", obj: "model", mtl: "model", rbxm: "model", rbxmx: "model",
  zip: "archive", pdf: "document",
};
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", tga: "image/tga", svg: "image/svg+xml",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  fbx: "model/fbx", glb: "model/gltf-binary", gltf: "model/gltf+json", obj: "model/obj", mtl: "text/plain", rbxm: "model/x-rbxm", rbxmx: "model/x-rbxmx",
  zip: "application/zip", pdf: "application/pdf", json: "application/json", html: "text/html", htm: "text/html", xml: "application/xml",
};
const EXT_BY_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_BY_EXT).filter(([e]) => !["jpeg", "htm"].includes(e)).map(([e, m]) => [m, e]));

/** Detect the real type from the first bytes (never trust the URL / server header alone). */
export function sniff(buf: Buffer): string | null {
  const s = (o: number, l: number) => buf.subarray(o, o + l).toString("latin1");
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return "png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (s(0, 4) === "GIF8") return "gif";
  if (s(0, 4) === "RIFF" && s(8, 4) === "WEBP") return "webp";
  if (s(0, 4) === "RIFF" && s(8, 4) === "WAVE") return "wav";
  if (s(0, 4) === "OggS") return "ogg";
  if (s(0, 4) === "fLaC") return "flac";
  if (s(0, 3) === "ID3" || (buf.length > 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) return "mp3";
  if (s(4, 4) === "ftyp") return /^qt/.test(s(8, 2)) ? "mov" : "mp4";
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0x1a45dfa3) return "webm";
  if (s(0, 4) === "glTF") return "glb";
  if (s(0, 18) === "Kaydara FBX Binary") return "fbx";
  if (s(0, 8) === "<roblox!") return "rbxm";
  if (s(0, 8) === "<roblox ") return "rbxmx";
  if (s(0, 4) === "PK\x03\x04") return "zip";
  if (s(0, 4) === "%PDF") return "pdf";
  if (s(0, 2) === "BM" && buf.length > 26) return "bmp";
  return null;
}
export function isText(buf: Buffer) {
  const head = buf.subarray(0, 8192);
  if (head.includes(0)) return false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(head.length < buf.length ? head.subarray(0, Math.max(0, head.length - 4)) : head); return true; } catch { return false; }
}
export function imageSize(buf: Buffer, ext: string): { width: number; height: number } | null {
  try {
    if (ext === "png") return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    if (ext === "gif") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    if (ext === "bmp") return { width: buf.readInt32LE(18), height: Math.abs(buf.readInt32LE(22)) };
    if (ext === "jpg") {
      let o = 2;
      while (o + 9 < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const m = buf[o + 1], len = buf.readUInt16BE(o + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { width: buf.readUInt16BE(o + 7), height: buf.readUInt16BE(o + 5) };
        o += 2 + len;
      }
    }
    if (ext === "webp" && buf.subarray(12, 16).toString("latin1") === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  } catch { /* truncated */ }
  return null;
}
const cleanName = (n: string) => n.replace(/[\\/\x00-\x1f<>:"|?*]+/g, "_").replace(/^\.+/, "").trim().slice(0, 120) || "file";
export function htmlToText(html: string) {
  return html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n\n").trim();
}

/** Private / loopback / link-local addresses are blocked for downloads (the AI must not reach your LAN or the bridge). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const x = ip.toLowerCase();
  if (x.startsWith("::ffff:")) return isPrivateAddress(x.slice(7));
  return x === "::" || x === "::1" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
}

export interface FileStoreOptions { maxFileBytes?: number; maxTotalBytes?: number; maxFiles?: number }
export class AiFileStore {
  readonly dir: string;
  private index: AiFile[] = [];
  readonly maxFileBytes: number; readonly maxTotalBytes: number; readonly maxFiles: number;
  constructor(dataDir: string, o: FileStoreOptions = {}) {
    this.dir = path.join(dataDir, "ai-files");
    this.maxFileBytes = o.maxFileBytes ?? 50 * MB; this.maxTotalBytes = o.maxTotalBytes ?? 1024 * MB; this.maxFiles = o.maxFiles ?? 500;
    fs.mkdirSync(this.dir, { recursive: true });
    try { this.index = (JSON.parse(fs.readFileSync(this.indexFile, "utf8")) as AiFile[]).filter((f) => /^f_[a-f0-9]{12}$/.test(f.id) && fs.existsSync(this.blob(f.id))); } catch { this.index = []; }
  }
  private get indexFile() { return path.join(this.dir, "index.json"); }
  private blob(id: string) { return path.join(this.dir, id + ".bin"); }
  private save() { fs.writeFileSync(this.indexFile + ".tmp", JSON.stringify(this.index, null, 1)); fs.renameSync(this.indexFile + ".tmp", this.indexFile); }
  list(kind?: string) { return [...this.index].reverse().filter((f) => !kind || f.kind === kind); }
  get(id: string): AiFile {
    const f = this.index.find((x) => x.id === String(id ?? "").trim());
    if (!f) throw new Error(`file "${id}" not found — call file_list to see available fileId values`);
    return f;
  }
  read(id: string) { return fs.readFileSync(this.blob(this.get(id).id)); }
  update(id: string, p: Partial<AiFile>) { const f = this.get(id); Object.assign(f, p); this.save(); return f; }
  delete(id: string) { const f = this.get(id); this.index = this.index.filter((x) => x !== f); try { fs.unlinkSync(this.blob(f.id)); } catch { /* gone */ } this.save(); return f; }
  add(data: Buffer, meta: { name: string; mime?: string; source: AiFile["source"]; url?: string }): AiFile {
    if (!data.length) throw new Error("file is empty");
    if (data.length > this.maxFileBytes) throw new Error(`file too large: ${(data.length / MB).toFixed(1)} MB (limit ${(this.maxFileBytes / MB).toFixed(0)} MB)`);
    let name = cleanName(meta.name);
    const nameExt = (/\.([a-z0-9]{1,6})$/i.exec(name)?.[1] ?? "").toLowerCase();
    const sniffed = sniff(data);
    const text = !sniffed && isText(data);
    const headerExt = meta.mime ? EXT_BY_MIME[meta.mime.split(";")[0].trim().toLowerCase()] : undefined;
    let ext = sniffed ?? (text ? (TEXT_EXT.has(nameExt) ? nameExt : headerExt && TEXT_EXT.has(headerExt) ? headerExt : "txt") : nameExt || headerExt || "bin");
    if (ext === "jpeg") ext = "jpg";
    if (!name.toLowerCase().endsWith("." + ext) && !(ext === "jpg" && /\.jpe?g$/i.test(name))) name = name.replace(/\.[a-z0-9]{1,6}$/i, "") + "." + ext;
    const kind: FileKind = text && !["svg", "obj", "mtl", "gltf", "rbxmx"].includes(ext) ? "text" : KIND_BY_EXT[ext] ?? (text ? "text" : "binary");
    const mime = MIME_BY_EXT[ext] ?? (text ? "text/plain; charset=utf-8" : "application/octet-stream");
    const sha = crypto.createHash("sha256").update(data).digest("hex");
    const same = this.index.find((x) => x.sha256 === sha && x.name === name);
    if (same) return same; // the same attachment arriving through two paths is stored once
    const f: AiFile = { id: "f_" + crypto.randomBytes(6).toString("hex"), name, mime, kind, ext, bytes: data.length, sha256: sha, createdAt: new Date().toISOString(), source: meta.source, ...(meta.url ? { url: meta.url } : {}) };
    if (kind === "image") Object.assign(f, imageSize(data, ext) ?? {});
    fs.writeFileSync(this.blob(f.id), data);
    this.index.push(f);
    // bounded store: drop the oldest files first
    while (this.index.length > this.maxFiles || this.index.reduce((n, x) => n + x.bytes, 0) > this.maxTotalBytes) { const old = this.index.shift()!; try { fs.unlinkSync(this.blob(old.id)); } catch { /* gone */ } }
    this.save();
    return f;
  }
}

export interface FileToolsDeps { dataDir: string; fetch?: FetchLike; env?: NodeJS.ProcessEnv; lookup?: (host: string) => Promise<string[]>; store?: AiFileStore }
const s = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const n = (description: string) => ({ type: "number", description });
const b = (description: string) => ({ type: "boolean", description });
const info = (f: AiFile) => ({ fileId: f.id, name: f.name, kind: f.kind, mime: f.mime, bytes: f.bytes, ...(f.width ? { width: f.width, height: f.height } : {}), ...(f.url ? { url: f.url } : {}), sha256: f.sha256.slice(0, 16), ...(f.roblox ? { roblox: f.roblox } : {}) });

/** Roblox Open Cloud asset type for a file (null = Roblox does not accept this format). */
export function robloxTypeFor(f: Pick<AiFile, "ext">): "Decal" | "Audio" | "Model" | "Video" | null {
  if (["png", "jpg", "bmp", "tga"].includes(f.ext)) return "Decal";
  if (["mp3", "ogg", "wav", "flac"].includes(f.ext)) return "Audio";
  if (["fbx", "glb", "gltf", "rbxm", "rbxmx"].includes(f.ext)) return "Model";
  if (["mp4", "mov"].includes(f.ext)) return "Video";
  return null;
}

const TO_STUDIO_LUAU = `
local parent = ARGS.parent and bw_must(ARGS.parent) or nil
local made = {}
local function put(inst, defaultParent)
	inst.Parent = parent or defaultParent
	table.insert(made, inst:GetFullName())
	return inst
end
if ARGS.mode == "script" then
	local s = Instance.new(ARGS.className)
	s.Name = ARGS.name
	if ARGS.className == "StringValue" then s.Value = ARGS.text else s.Source = ARGS.text end
	put(s, ARGS.className == "LocalScript" and game:GetService("StarterPlayer"):FindFirstChildOfClass("StarterPlayerScripts") or (ARGS.className == "ModuleScript" and game:GetService("ReplicatedStorage")) or game:GetService("ServerScriptService"))
elseif ARGS.mode == "model" then
	local m = game:GetService("InsertService"):LoadAsset(tonumber(ARGS.assetId))
	for _, c in ipairs(m:GetChildren()) do put(c, workspace) end
	m:Destroy()
elseif ARGS.mode == "image" then
	local tex = "rbxassetid://" .. tostring(ARGS.imageId)
	local p = parent
	if p and p:IsA("GuiObject") or (p and (p:IsA("ScreenGui") or p:IsA("SurfaceGui") or p:IsA("BillboardGui"))) then
		local l = Instance.new("ImageLabel") l.Name = ARGS.name l.Image = tex l.Size = UDim2.fromOffset(200, 200) l.BackgroundTransparency = 1
		put(l, nil)
	else
		local d = Instance.new("Decal") d.Name = ARGS.name d.Texture = tex
		if not p then
			local part = Instance.new("Part") part.Name = ARGS.name .. "_Board" part.Anchored = true part.Size = Vector3.new(8, 8, 0.4)
			local cam = workspace.CurrentCamera
			part.CFrame = cam and (cam.CFrame * CFrame.new(0, 0, -20)) or CFrame.new(0, 6, 0)
			part.Parent = workspace table.insert(made, part:GetFullName())
			d.Parent = part table.insert(made, d:GetFullName())
		else put(d, nil) end
	end
elseif ARGS.mode == "audio" then
	local snd = Instance.new("Sound") snd.Name = ARGS.name snd.SoundId = "rbxassetid://" .. tostring(ARGS.assetId)
	put(snd, game:GetService("SoundService"))
elseif ARGS.mode == "video" then
	local v = Instance.new("VideoFrame") v.Name = ARGS.name v.Video = "rbxassetid://" .. tostring(ARGS.assetId) v.Size = UDim2.fromOffset(320, 180)
	if parent then put(v, nil) else
		local g = Instance.new("ScreenGui") g.Name = ARGS.name .. "_Gui" g.Parent = game:GetService("StarterGui") table.insert(made, g:GetFullName())
		v.Parent = g table.insert(made, v:GetFullName())
	end
end
bw_waypoint("Brickwire: file_to_studio")
return { created = made }`;

/** Upload a stored file through Roblox Open Cloud (cached on the file record). Shared by file tools and Figma. */
export async function uploadToRoblox(store: AiFileStore, f: AiFile, ctx: Parameters<CompositeTool["run"]>[1] | null, opts: { assetType?: string; name?: string; description?: string; force?: boolean }, envv: NodeJS.ProcessEnv = process.env, doFetch: FetchLike = fetch as unknown as FetchLike) {
  if (f.roblox && !opts.force) return f.roblox;
  const type = (opts.assetType && opts.assetType !== "auto" ? opts.assetType : robloxTypeFor(f)) as "Decal" | "Audio" | "Model" | "Video" | null;
  if (!type) throw new Error(`Roblox does not accept .${f.ext} files. Supported: images png/jpg/bmp/tga, audio mp3/ogg/wav/flac, models fbx/glb/gltf/rbxm/rbxmx, video mp4/mov`);
  if (!openCloudEnv(envv)) throw new Error("Roblox upload is not configured: set ROBLOX_OPEN_CLOUD_API_KEY (asset:read + asset:write) and ROBLOX_CREATOR_USER_ID or ROBLOX_CREATOR_GROUP_ID in Brickwire/.env, then restart the bridge");
  const up = await uploadAsset(store.read(f.id), f.ext, type, opts.name || f.name.replace(/\.[^.]+$/, ""), opts.description || "Uploaded by Brickwire", doFetch, envv);
  const rb: NonNullable<AiFile["roblox"]> = { assetId: up.assetId, assetType: type, at: new Date().toISOString() };
  if (type === "Decal" && ctx) { try { const r = (await ctx.runLuau(wrapLuau({ ids: [up.assetId] }, DECAL_TO_IMAGE_LUAU), { readOnly: true })) as Record<string, { imageId?: string }>; if (r?.[up.assetId]?.imageId) rb.imageId = r[up.assetId].imageId; } catch { /* Studio offline — imageId resolved later */ } }
  store.update(f.id, { roblox: rb });
  return rb;
}


export function makeFileTools(deps: FileToolsDeps): CompositeTool[] {
  const env = () => deps.env ?? process.env;
  let store = deps.store;
  const st = () => (store ??= new AiFileStore(deps.dataDir, { maxFileBytes: Number(env().BRICKWIRE_FILES_MAX_MB || 50) * MB }));
  const doFetch = (deps.fetch ?? (fetch as unknown as FetchLike));
  const lookup = deps.lookup ?? (async (h: string) => (await dns.lookup(h, { all: true })).map((a) => a.address));
  const allowPrivate = () => env().BRICKWIRE_FILES_ALLOW_PRIVATE === "1";

  async function checkUrl(raw: string) {
    let u: URL;
    try { u = new URL(raw); } catch { throw new Error("url must be an absolute http(s) URL"); }
    if (!/^https?:$/.test(u.protocol)) throw new Error("only http:// and https:// URLs can be downloaded");
    if (u.username || u.password) throw new Error("URLs with credentials are not allowed");
    if (!allowPrivate()) {
      const host = u.hostname.replace(/^\[|\]$/g, "");
      if (/^localhost$|\.local$|\.internal$/i.test(host)) throw new Error(`blocked: ${host} is a local address (set BRICKWIRE_FILES_ALLOW_PRIVATE=1 to allow)`);
      const ips = net.isIP(host) ? [host] : await lookup(host).catch(() => { throw new Error(`cannot resolve host ${host}`); });
      if (!ips.length || ips.some(isPrivateAddress)) throw new Error(`blocked: ${host} resolves to a private/local address (set BRICKWIRE_FILES_ALLOW_PRIVATE=1 to allow)`);
    }
    return u;
  }
  async function download(raw: string, limit: number) {
    let u = await checkUrl(raw);
    for (let hop = 0; hop < 6; hop++) {
      const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 60_000);
      try {
        const r = await (doFetch as any)(u.toString(), { redirect: "manual", signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (Brickwire file_fetch)", Accept: "*/*" } });
        if ([301, 302, 303, 307, 308].includes(r.status)) { const loc = r.headers.get("location"); if (!loc) throw new Error(`redirect without location (${r.status})`); u = await checkUrl(new URL(loc, u).toString()); continue; }
        if (!r.ok) throw new Error(`download failed: HTTP ${r.status} ${r.statusText ?? ""}`.trim());
        const len = Number(r.headers.get("content-length") || 0);
        if (len > limit) throw new Error(`file too large: ${(len / MB).toFixed(1)} MB (limit ${(limit / MB).toFixed(0)} MB)`);
        const chunks: Buffer[] = []; let total = 0;
        if (r.body && typeof r.body.getReader === "function") {
          const rd = r.body.getReader();
          for (;;) { const { value, done } = await rd.read(); if (done) break; total += value.length; if (total > limit) { ctrl.abort(); throw new Error(`file too large (limit ${(limit / MB).toFixed(0)} MB)`); } chunks.push(Buffer.from(value)); }
        } else { const ab = Buffer.from(await r.arrayBuffer()); total = ab.length; if (total > limit) throw new Error(`file too large (limit ${(limit / MB).toFixed(0)} MB)`); chunks.push(ab); }
        const cd = r.headers.get("content-disposition") || "";
        const cdName = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1] ?? /filename="?([^";]+)"?/i.exec(cd)?.[1];
        return { data: Buffer.concat(chunks), url: u.toString(), mime: r.headers.get("content-type") || "", name: cdName ? decodeURIComponent(cdName) : decodeURIComponent(u.pathname.split("/").filter(Boolean).at(-1) || u.hostname) };
      } catch (e) { if ((e as Error).name === "AbortError") throw new Error("download timed out (60 s)"); throw e; }
      finally { clearTimeout(timer); }
    }
    throw new Error("too many redirects");
  }
  const preview = (f: AiFile, data: Buffer, max = 1500) => f.kind === "text" ? { preview: (f.ext === "html" || f.ext === "htm" ? htmlToText(data.toString("utf8")) : data.toString("utf8")).slice(0, max) } : {};

  const toRoblox = (f: AiFile, ctx: Parameters<CompositeTool["run"]>[1] | null, opts: { assetType?: string; name?: string; description?: string; force?: boolean }) => uploadToRoblox(st(), f, ctx, opts, env(), doFetch);

  async function place(f: AiFile, args: Record<string, unknown>, ctx: Parameters<CompositeTool["run"]>[1]) {
        const name = String(args.name || f.name.replace(/\.(server|client)?\.?[^.]+$/i, "").replace(/\.$/, "")).slice(0, 100) || "File";
        const parent = args.parent ? pathSegments(String(args.parent)) : null;
        let call: Record<string, unknown>;
        if (f.kind === "text") {
          const text = st().read(f.id).toString("utf8");
          if (text.length > 199_000) throw new Error("text is too long for a Studio script (max ~199 000 characters)");
          const cls = String(args.as || (/\.server\.(lua|luau)$/i.test(f.name) ? "Script" : /\.client\.(lua|luau)$/i.test(f.name) ? "LocalScript" : /\.(lua|luau)$/i.test(f.name) ? "ModuleScript" : "StringValue"));
          if (!["Script", "LocalScript", "ModuleScript", "StringValue"].includes(cls)) throw new Error("as must be Script, LocalScript, ModuleScript or StringValue");
          call = { mode: "script", className: cls, name, text, parent };
        } else {
          const rb = await toRoblox(f, ctx, {});
          if (rb.assetType === "Decal") {
            if (!rb.imageId) { const r = (await ctx.runLuau(wrapLuau({ ids: [rb.assetId] }, DECAL_TO_IMAGE_LUAU), { readOnly: true })) as Record<string, { imageId?: string; error?: string }>; const img = r?.[rb.assetId]; if (!img?.imageId) throw new Error(`uploaded as Decal ${rb.assetId}, but its image is not available yet (${img?.error ?? "moderation"}) — try again in a minute`); rb.imageId = img.imageId; st().update(f.id, { roblox: rb }); }
            call = { mode: "image", imageId: rb.imageId, name, parent };
          } else call = { mode: rb.assetType === "Audio" ? "audio" : rb.assetType === "Video" ? "video" : "model", assetId: rb.assetId, name, parent };
        }
        const out = (await ctx.runLuau(wrapLuau(call, TO_STUDIO_LUAU), { readOnly: false })) as { created?: string[] };
        return { fileId: f.id, mode: call.mode as string, created: out?.created ?? [], ...(f.roblox ? { assetId: f.roblox.assetId } : {}) };
  }

  return [
    {
      name: "file_fetch",
      description: "Download any file from the internet (image, texture, sound, music, 3D model fbx/glb/obj, rbxm, video, zip, json, Lua, web page…) into Brickwire's file store. Returns a fileId for file_read / file_show / file_upload_roblox / file_to_studio. The real type is detected from the bytes. Web pages: use text=true to get readable text. Local/private network addresses are blocked. Limit 50 MB per file.",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["url"], properties: { url: s("http(s) URL of the file or page"), name: s("file name to store (optional, default from URL)"), text: b("return the readable text of a text/HTML file in the result (default true for text, up to 6000 chars)") } },
      async run(args) {
        const url = String(args.url ?? "").trim(); if (!url) throw new Error("url is required");
        const d = await download(url, st().maxFileBytes);
        const f = st().add(d.data, { name: String(args.name || d.name), mime: d.mime, source: "url", url: d.url });
        return { ok: true, ...info(f), ...(args.text === false ? {} : preview(f, d.data, 6000)), next: f.kind === "image" ? "file_show to look at it · file_upload_roblox → Decal · file_to_studio to place it" : f.kind === "text" ? "file_read for more · file_to_studio to make a Script/ModuleScript" : robloxTypeFor(f) ? "file_upload_roblox, then file_to_studio" : "file_read for details" };
      },
    },
    {
      name: "file_save",
      description: "Create a file yourself: text (Lua, JSON, CSV, Markdown, OBJ, SVG…) via `text`, or binary via `base64`. With `to` the file goes straight into Studio (same as file_to_studio). Long files: write a raw block instead of JSON — <ROBLOX_FILE name=\"Shop.server.lua\" to=\"game.ServerScriptService\"> …content… </ROBLOX_FILE>. Returns a fileId usable with file_show / file_upload_roblox / file_to_studio.",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["name"], properties: { name: s("file name with extension, e.g. Shop.server.lua, data.json, logo.png"), text: s("UTF-8 text content"), base64: s("binary content as base64 (alternative to text)"), to: s("optional: put it into Studio right away under this parent path (e.g. game.ServerScriptService, game.Workspace.Sign); use \"auto\" for the default place"), as: s("optional for text: Script | LocalScript | ModuleScript | StringValue") } },
      async run(args, ctx) {
        const has = typeof args.text === "string", has64 = typeof args.base64 === "string" && args.base64;
        if (!has && !has64) throw new Error("give text or base64");
        let data: Buffer;
        if (has64) { const raw = String(args.base64).replace(/^data:[^,]*,/, "").replace(/\s+/g, ""); if (!/^[A-Za-z0-9+/=_-]+$/.test(raw)) throw new Error("base64 is not valid"); data = Buffer.from(raw, "base64"); }
        else data = Buffer.from(String(args.text), "utf8");
        const f = st().add(data, { name: String(args.name), source: "ai" });
        if (!args.to) return { ok: true, ...info(f), next: "file_to_studio {fileId} puts it into Studio" };
        try {
          const placed = await place(f, { ...args, name: undefined, parent: String(args.to).toLowerCase() === "auto" ? undefined : args.to }, ctx);
          return { ok: true, ...info(f), studio: placed };
        } catch (e) { return { ok: false, ...info(f), studioError: (e as Error).message, note: "the file is saved; fix the problem and call file_to_studio {fileId}" }; }
      },
    },
    {
      name: "file_list",
      description: "List files in Brickwire's file store (downloaded with file_fetch, created with file_save). Newest first.",
      risk: "read", requires: [],
      inputSchema: { type: "object", properties: { kind: s("filter: image | audio | video | model | text | archive | document | binary"), limit: n("max items (default 30)") } },
      async run(args) { const all = st().list(args.kind ? String(args.kind) : undefined); return { total: all.length, files: all.slice(0, Math.min(200, Number(args.limit) || 30)).map(info) }; },
    },
    {
      name: "file_read",
      description: "Read a stored file. Text files (incl. HTML → readable text) return content with offset/maxChars paging; binary files return metadata, detected type, image size, and a short hex header.",
      risk: "read", requires: [],
      inputSchema: { type: "object", required: ["fileId"], properties: { fileId: s("id from file_fetch / file_save / file_list"), offset: n("start character (text)"), maxChars: n("max characters (default 8000, max 30000)"), raw: b("HTML: return raw markup instead of readable text") } },
      async run(args) {
        const f = st().get(String(args.fileId)), data = st().read(f.id);
        if (f.kind !== "text" && !["svg", "obj", "mtl", "gltf", "rbxmx"].includes(f.ext)) return { ...info(f), headerHex: data.subarray(0, 32).toString("hex"), robloxType: robloxTypeFor(f), note: "binary file — use file_show to view images, file_upload_roblox / file_to_studio to use it" };
        let text = data.toString("utf8"); if ((f.ext === "html" || f.ext === "htm") && !args.raw) text = htmlToText(text);
        const off = Math.max(0, Number(args.offset) || 0), max = Math.min(30000, Math.max(100, Number(args.maxChars) || 8000));
        return { ...info(f), totalChars: text.length, offset: off, content: text.slice(off, off + max), ...(off + max < text.length ? { nextOffset: off + max } : {}) };
      },
    },
    {
      name: "file_show",
      description: "Attach stored files (images, PDFs, text, any file the AI site accepts) to the next message in this AI chat so you can SEE them — e.g. check a downloaded texture or reference picture before using it. Up to 4 files per call.",
      risk: "read", requires: [],
      inputSchema: { type: "object", required: ["fileIds"], properties: { fileIds: { type: "array", items: { type: "string" }, description: "fileId values (max 4)" } } },
      async run(args) {
        const ids = (Array.isArray(args.fileIds) ? args.fileIds : [args.fileIds]).map(String).filter(Boolean).slice(0, 4);
        if (!ids.length) throw new Error("fileIds is required");
        const files = ids.map((id) => st().get(id));
        for (const f of files) if (f.bytes > 8 * MB) throw new Error(`${f.name} is larger than 8 MB — AI sites do not accept it`);
        return { ok: true, files: files.map(info), bwAttach: files.map((f) => ({ fileId: f.id, name: f.name, mime: f.mime })), note: "The files are attached to this message (if the AI site accepts attachments)." };
      },
    },
    {
      name: "file_upload_roblox",
      description: "Upload a stored file to Roblox via Open Cloud and get an asset id: images → Decal (+ imageId for Texture/Image properties), audio mp3/ogg/wav/flac → Audio, fbx/glb/gltf/rbxm/rbxmx → Model, mp4/mov → Video. Needs ROBLOX_OPEN_CLOUD_API_KEY + ROBLOX_CREATOR_USER_ID/GROUP_ID in Brickwire/.env. Uploads go through Roblox moderation and appear in the creator's inventory.",
      risk: "destructive", requires: [],
      inputSchema: { type: "object", required: ["fileId"], properties: { fileId: s("stored file id"), assetType: s("auto (default) | Decal | Audio | Model | Video", { enum: ["auto", "Decal", "Audio", "Model", "Video"] }), name: s("asset display name (≤50 chars)"), description: s("asset description"), force: b("upload again even if this file was uploaded before") } },
      async run(args, ctx) {
        const f = st().get(String(args.fileId));
        const rb = await toRoblox(f, ctx, { assetType: args.assetType ? String(args.assetType) : undefined, name: args.name ? String(args.name) : undefined, description: args.description ? String(args.description) : undefined, force: !!args.force });
        return { ok: true, fileId: f.id, ...rb, content: `rbxassetid://${rb.imageId ?? rb.assetId}`, next: "file_to_studio {fileId} places it in Studio" };
      },
    },
    {
      name: "file_to_studio",
      description: "Put a stored file into the open Studio place. Text/Lua → Script / LocalScript / ModuleScript / StringValue with that source. Images → Decal on a part (or ImageLabel inside a GUI), audio → Sound, models → inserted model, video → VideoFrame. Non-text files are uploaded to Roblox first (file_upload_roblox) if needed. Undo: Ctrl+Z.",
      risk: "write", requires: ["execute_luau"],
      inputSchema: { type: "object", required: ["fileId"], properties: { fileId: s("stored file id"), parent: s("parent path, e.g. Workspace.Shop.Sign or StarterGui.MainGui.Frame (optional — sensible default per type)"), as: s("text files: Script | LocalScript | ModuleScript | StringValue (default from name: *.server.lua → Script, *.client.lua → LocalScript, else ModuleScript)"), name: s("instance name (default: file name)") } },
      snapshotTargets: (a) => (a.parent ? [String(a.parent)] : []),
      async run(args, ctx) { return { ok: true, ...(await place(st().get(String(args.fileId)), args, ctx)) }; },
    },
    {
      name: "file_delete",
      description: "Delete a stored file from Brickwire's file store (does not touch Roblox assets or Studio).",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["fileId"], properties: { fileId: s("stored file id") } },
      async run(args) { const f = st().delete(String(args.fileId)); return { ok: true, deleted: f.id, name: f.name }; },
    },
  ];
}
