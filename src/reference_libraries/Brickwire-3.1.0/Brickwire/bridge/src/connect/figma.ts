/**
 * Figma → Brickwire. Two ways in:
 *  1) figma.com links + a personal access token (REST API: read the node tree, export PNG/SVG/JPG);
 *  2) the Brickwire Figma plugin (figma-plugin/) pushes the selected frame (tree + PNGs) to the local bridge —
 *     no token needed.
 * Both produce the same normalized node tree, converted into a Brickwire UI document (ui_build format) and built
 * into Roblox Studio as a real ScreenGui. Previews and exports are posted into the app chat.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { CompositeTool } from "../composites.js";
import type { AiFileStore, AiFile } from "../file-tools.js";
import { compileUIDoc, type UIDoc, type UIElement } from "../../../shared/src/studio2/uidoc.js";
import { wrapLuau, pathSegments } from "../luau.js";
import { type ResultFeed, kb } from "./feed.js";

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; headers: { get(n: string): string | null } }>;
const fail = (m: string, status = 400): never => { throw Object.assign(new Error(m), { status }); };

// ------------------------------------------------------------------ URL + token
export function parseFigmaUrl(raw: string): { fileKey: string; nodeId?: string } {
  const s = String(raw ?? "").trim();
  if (/^[A-Za-z0-9]{10,64}$/.test(s)) return { fileKey: s };
  let u: URL; try { u = new URL(s); } catch { return fail("Paste a figma.com link (https://www.figma.com/design/<key>/…?node-id=…) or a file key"); }
  if (!/(^|\.)figma\.com$/i.test(u.hostname)) fail("The link must point to figma.com");
  const m = /^\/(?:file|design|proto|board|make)\/([A-Za-z0-9]{10,64})(?:\/branch\/([A-Za-z0-9]{10,64}))?/.exec(u.pathname);
  if (!m) fail("Unrecognised Figma link — open the file in Figma and use Share → Copy link");
  const node = u.searchParams.get("node-id");
  return { fileKey: m![2] || m![1], ...(node ? { nodeId: decodeURIComponent(node).replace(/-/g, ":") } : {}) };
}
export class FigmaSettings {
  private file: string;
  constructor(dataDir: string, private env: NodeJS.ProcessEnv = process.env) { this.file = path.join(dataDir, "figma-settings.json"); }
  private read(): { token?: string } { try { return JSON.parse(fs.readFileSync(this.file, "utf8")); } catch { return {}; } }
  token() { return (this.read().token || this.env.FIGMA_TOKEN || "").trim(); }
  setToken(t: string) {
    const token = String(t ?? "").trim();
    if (token && (!/^[\w-]{20,200}$/.test(token))) fail("This does not look like a Figma personal access token (figd_…)");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ token }), { mode: 0o600 });
    return this.public();
  }
  public() { const t = this.token(); return { configured: !!t, fromEnv: !this.read().token && !!this.env.FIGMA_TOKEN, hint: t ? t.slice(0, 5) + "…" + t.slice(-3) : "" }; }
}

// ------------------------------------------------------------------ REST client
export class FigmaApi {
  constructor(private token: string, private doFetch: FetchLike = fetch as unknown as FetchLike, private base = process.env.FIGMA_API_BASE || "https://api.figma.com") {
    if (!token) fail("Figma token is not set: Brickwire app → «Blender и Figma» → Figma → paste a personal access token (Figma → Settings → Security → Personal access tokens, scope file_content:read). Or use the Brickwire Figma plugin, which needs no token.", 412);
  }
  private async get(p: string) {
    const r = await this.doFetch(this.base + p, { headers: { "X-Figma-Token": this.token } });
    if (r.status === 403) fail("Figma rejected the token (403): check it is valid and has file_content:read access to this file", 403);
    if (r.status === 404) fail("Figma file or node not found (404): check the link and that your account can open the file", 404);
    if (r.status === 429) fail("Figma rate limit (429): wait a minute and try again", 429);
    if (!r.ok) fail(`Figma API error ${r.status}: ${(await r.text()).slice(0, 300)}`, 502);
    return r.json();
  }
  file(key: string, depth = 2) { return this.get(`/v1/files/${encodeURIComponent(key)}?depth=${depth}`); }
  nodes(key: string, ids: string[]) { return this.get(`/v1/files/${encodeURIComponent(key)}/nodes?ids=${encodeURIComponent(ids.join(","))}`); }
  async images(key: string, ids: string[], format = "png", scale = 2): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < ids.length; i += 50) {
      const r = await this.get(`/v1/images/${encodeURIComponent(key)}?ids=${encodeURIComponent(ids.slice(i, i + 50).join(","))}&format=${format}&scale=${scale}`);
      if (r.err) fail(`Figma export failed: ${r.err}`, 502);
      Object.assign(out, r.images ?? {});
    }
    return out;
  }
  async download(url: string) {
    const r = await this.doFetch(url, {});
    if (!r.ok) fail(`Could not download the Figma export (${r.status})`, 502);
    return Buffer.from(await r.arrayBuffer());
  }
}

// ------------------------------------------------------------------ normalized node tree
export interface FigPaint { type: string; visible?: boolean; opacity?: number; color?: { r: number; g: number; b: number; a?: number }; gradientStops?: Array<{ position: number; color: { r: number; g: number; b: number; a?: number } }>; gradientHandlePositions?: Array<{ x: number; y: number }>; imageRef?: string; scaleMode?: string }
export interface FigNode {
  id: string; name: string; type: string; visible?: boolean; opacity?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number } | null;
  fills?: FigPaint[]; strokes?: FigPaint[]; strokeWeight?: number; cornerRadius?: number; rectangleCornerRadii?: number[];
  clipsContent?: boolean; characters?: string; style?: { fontFamily?: string; fontWeight?: number; fontSize?: number; textAlignHorizontal?: string; textAlignVertical?: string; fontPostScriptName?: string; italic?: boolean };
  effects?: Array<{ type: string; visible?: boolean }>; rotation?: number; isMask?: boolean; children?: FigNode[];
}
const RASTER = new Set(["VECTOR", "BOOLEAN_OPERATION", "STAR", "LINE", "POLYGON", "REGULAR_POLYGON"]);
const hex = (c: { r: number; g: number; b: number }) => "#" + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");
const vis = (p?: FigPaint[]) => (p ?? []).filter((x) => x.visible !== false && (x.opacity ?? 1) > 0.001);
const r4 = (n: number) => Math.round(n * 10000) / 10000;
export function needsRaster(n: FigNode) {
  return RASTER.has(n.type) || vis(n.fills).some((f) => f.type === "IMAGE");
}
export function countNodes(n: FigNode): number { return 1 + (n.children ?? []).reduce((a, c) => a + countNodes(c), 0); }
export function rasterIds(n: FigNode, out: string[] = []): string[] {
  if (n.visible === false) return out;
  if (needsRaster(n)) { out.push(n.id); return out; }
  for (const c of n.children ?? []) rasterIds(c, out);
  return out;
}
export function robloxFont(st: FigNode["style"] = {}): string {
  const fam = (st.fontFamily ?? "").toLowerCase(), w = st.fontWeight ?? (/(black|heavy)/i.test(st.fontPostScriptName ?? "") ? 900 : /bold/i.test(st.fontPostScriptName ?? "") ? 700 : 400);
  const named: Record<string, string> = { "roboto": "Roboto", "roboto mono": "RobotoMono", "roboto condensed": "RobotoCondensed", "fredoka one": "FredokaOne", "fredoka": "FredokaOne", "luckiest guy": "LuckiestGuy", "bangers": "Bangers", "oswald": "Oswald", "ubuntu": "Ubuntu", "nunito": "Nunito", "merriweather": "Merriweather", "titillium web": "TitilliumWeb", "josefin sans": "JosefinSans", "permanent marker": "PermanentMarker", "press start 2p": "Arcade", "creepster": "Creepster", "amatic sc": "AmaticSC", "kalam": "Kalam", "patrick hand": "PatrickHand", "indie flower": "IndieFlower", "michroma": "Michroma", "jura": "Jura", "special elite": "SpecialElite", "garamond": "Garamond", "eb garamond": "Garamond" };
  if (fam.startsWith("source sans")) return w >= 700 ? "SourceSansBold" : w >= 600 ? "SourceSansSemibold" : "SourceSans";
  if (fam === "arial") return w >= 700 ? "ArialBold" : "Arial";
  if (named[fam]) return named[fam];
  return w >= 900 ? "GothamBlack" : w >= 700 ? "GothamBold" : w >= 500 ? "GothamMedium" : "Gotham";
}
export interface ConvertOptions { name?: string; root?: "auto" | "fixed" | "fit" | "fill"; images?: Record<string, string>; maxNodes?: number }
export interface ConvertResult { doc: UIDoc; warnings: string[]; elements: number; rasterized: string[]; missingImages: string[] }
const safe = (s: string) => s.replace(/[^\w \-]/g, "_").trim().slice(0, 60) || "Layer";
/** Convert a Figma frame (normalized) into a Brickwire UI document. Children are placed in Scale units relative to their parent, so the layout scales with the root. */
export function figmaToUIDoc(root: FigNode, o: ConvertOptions = {}): ConvertResult {
  const warnings = new Set<string>(), rasterized: string[] = [], missingImages: string[] = [];
  const rb = root.absoluteBoundingBox;
  if (!rb || !(rb.width > 0) || !(rb.height > 0)) fail("The Figma node has no size — select a frame");
  const mode = o.root && o.root !== "auto" ? o.root : rb!.width >= 1000 || rb!.height >= 1000 ? "fit" : "fixed";
  const scaledText = mode === "fit" || mode === "fill";
  let elements = 0; const max = o.maxNodes ?? 1500;
  const conv = (n: FigNode, parentBox: { x: number; y: number; width: number; height: number } | null, isRoot: boolean, depth: number): UIElement | null => {
    if (n.visible === false) return null;
    if (n.isMask) { warnings.add("masks are not supported (mask layers skipped)"); return null; }
    if (++elements > max) { warnings.add(`only the first ${max} layers were converted`); return null; }
    const b = n.absoluteBoundingBox ?? { x: parentBox?.x ?? 0, y: parentBox?.y ?? 0, width: 0, height: 0 };
    const el: UIElement = { name: safe(n.name) };
    if (isRoot) {
      if (mode === "fill") { el.size = [1, 0, 1, 0]; el.position = [0, 0, 0, 0]; }
      else if (mode === "fit") { el.anchor = [0.5, 0.5]; el.position = [0.5, 0, 0.5, 0]; el.size = [1, 0, 1, 0]; el.aspect = r4(rb!.width / rb!.height); }
      else { el.anchor = [0.5, 0.5]; el.position = [0.5, 0, 0.5, 0]; el.size = [0, Math.round(rb!.width), 0, Math.round(rb!.height)]; }
    } else if (parentBox) {
      const pw = parentBox.width || 1, ph = parentBox.height || 1;
      el.position = [r4((b.x - parentBox.x) / pw), 0, r4((b.y - parentBox.y) / ph), 0];
      el.size = [r4(b.width / pw), 0, r4(b.height / ph), 0];
    }
    const op = n.opacity ?? 1;
    if (n.rotation && Math.abs(n.rotation) > 0.5) warnings.add("rotated layers are placed by their bounding box (rotation ignored)");
    if ((n.effects ?? []).some((e) => e.visible !== false)) warnings.add("shadows/blur effects are not converted");
    const fills = vis(n.fills);
    if (!isRoot && needsRaster(n)) {
      el.type = "Image"; el.bgTransparency = 1; el.scaleType = "Stretch"; rasterized.push(n.id);
      const img = o.images?.[n.id];
      if (img) el.image = img; else { missingImages.push(n.id); el.attributes = { FigmaNode: n.id }; }
      if (op < 1) el.imageTransparency = r4(1 - op);
      return el;
    }
    if (n.type === "TEXT") {
      el.type = "Text"; el.text = String(n.characters ?? "").slice(0, 2000); el.bgTransparency = 1;
      const f = fills.find((x) => x.type === "SOLID" && x.color);
      if (f?.color) { el.textColor = hex(f.color); const a = (f.color.a ?? 1) * (f.opacity ?? 1) * op; if (a < 0.999) el.props = { TextTransparency: r4(1 - a) }; }
      const st = n.style ?? {};
      el.font = robloxFont(st);
      const fs0 = Math.max(6, Math.min(100, Math.round(st.fontSize ?? 14)));
      if (scaledText) { el.textScaled = true; el.maxTextSize = Math.round(fs0 * 1.6); } else el.textSize = fs0;
      el.textWrapped = true;
      const ha = st.textAlignHorizontal, va = st.textAlignVertical;
      el.textXAlign = ha === "CENTER" ? "Center" : ha === "RIGHT" ? "Right" : "Left";
      el.textYAlign = va === "CENTER" ? "Center" : va === "BOTTOM" ? "Bottom" : "Top";
      if (!el.text) warnings.add("empty text layers kept as empty labels");
      return el;
    }
    // containers & shapes
    const looksButton = /button|btn|кнопк/i.test(n.name) && (n.children ?? []).some((c) => c.type === "TEXT");
    el.type = looksButton ? "Button" : "Frame";
    if (looksButton) el.text = "";
    const solid = fills.find((x) => x.type === "SOLID" && x.color);
    const grad = fills.find((x) => x.type.startsWith("GRADIENT") && x.gradientStops?.length);
    if (grad) {
      if (grad.type !== "GRADIENT_LINEAR") warnings.add("radial/angular gradients approximated as linear");
      const st = grad.gradientStops!.slice(0, 19);
      el.bg = "#ffffff"; el.bgTransparency = r4(1 - (grad.opacity ?? 1) * op);
      el.gradient = { colors: st.map((s) => [r4(Math.max(0, Math.min(1, s.position))), hex(s.color)] as [number, string]) };
      const hp = grad.gradientHandlePositions;
      if (hp && hp.length >= 2) el.gradient.rotation = Math.round((Math.atan2(hp[1].y - hp[0].y, hp[1].x - hp[0].x) * 180) / Math.PI);
      if (st.length >= 2) {
        if (st.some((s) => (s.color.a ?? 1) < 0.999)) el.gradient.transparency = st.map((s) => [r4(Math.max(0, Math.min(1, s.position))), r4(1 - (s.color.a ?? 1))] as [number, number]);
        if (el.gradient.transparency && el.gradient.transparency[0][0] !== 0) el.gradient.transparency.unshift([0, el.gradient.transparency[0][1]]);
        if (el.gradient.transparency && el.gradient.transparency.at(-1)![0] !== 1) el.gradient.transparency.push([1, el.gradient.transparency.at(-1)![1]]);
      } else delete el.gradient;
    } else if (solid?.color) {
      el.bg = hex(solid.color); el.bgTransparency = r4(1 - (solid.color.a ?? 1) * (solid.opacity ?? 1) * op);
    } else el.bgTransparency = 1;
    if (fills.length > 1) warnings.add("layers with several fills use the top-most one");
    const stroke = vis(n.strokes).find((x) => x.type === "SOLID" && x.color);
    if (stroke?.color && (n.strokeWeight ?? 1) > 0) el.stroke = { color: hex(stroke.color), thickness: Math.max(1, Math.round(n.strokeWeight ?? 1)), transparency: r4(1 - (stroke.color.a ?? 1) * (stroke.opacity ?? 1)), border: true };
    if (n.type === "ELLIPSE") el.corner = [0.5, 0];
    else { const rad = n.cornerRadius ?? (n.rectangleCornerRadii?.length ? n.rectangleCornerRadii.reduce((a, c) => a + c, 0) / n.rectangleCornerRadii.length : 0); if (rad > 0) el.corner = Math.round(rad); }
    if (n.clipsContent) el.clip = true;
    if (depth > 40) { warnings.add("very deep nesting truncated"); return el; }
    const kids = (n.children ?? []).map((c) => conv(c, b, false, depth + 1)).filter(Boolean) as UIElement[];
    kids.forEach((k, i) => (k.zIndex = Math.min(1000, depth + 1)) && (k.layoutOrder = i));
    if (kids.length) el.children = kids;
    return el;
  };
  const top = conv(root, null, true, 0)!;
  const doc: UIDoc = { name: safe(o.name || root.name).replace(/\s+/g, "_"), ignoreGuiInset: mode === "fill" || mode === "fit", resetOnSpawn: false, autoFix: true, children: [top] };
  if (missingImages.length) warnings.add(`${missingImages.length} image/vector layer(s) have no uploaded picture yet — they are empty ImageLabels with a FigmaNode attribute (configure Roblox Open Cloud to upload them automatically)`);
  return { doc, warnings: [...warnings], elements, rasterized, missingImages };
}
/** Short outline for the AI (names, types, sizes, texts). */
export function outline(n: FigNode, max = 120): string[] {
  const out: string[] = [];
  const walk = (x: FigNode, d: number) => {
    if (out.length >= max || x.visible === false) return;
    const b = x.absoluteBoundingBox;
    out.push(`${"  ".repeat(d)}${x.type} "${x.name}"${b ? ` ${Math.round(b.width)}×${Math.round(b.height)}` : ""}${x.type === "TEXT" && x.characters ? ` — "${x.characters.slice(0, 60)}"` : ""}${needsRaster(x) ? " [image]" : ""}`);
    for (const c of x.children ?? []) walk(c, d + 1);
  };
  walk(n, 0);
  if (countNodes(n) > out.length) out.push(`… ${countNodes(n) - out.length} more layers`);
  return out;
}

// ------------------------------------------------------------------ plugin pushes
export interface FigmaPush { id: string; at: string; name: string; fileName?: string; root: FigNode; previewFileId?: string; images: Record<string, string>; nodes: number }
export class FigmaPushStore {
  private dir: string;
  constructor(dataDir: string) { this.dir = path.join(dataDir, "figma-pushes"); fs.mkdirSync(this.dir, { recursive: true }); }
  add(p: Omit<FigmaPush, "id" | "at">): FigmaPush {
    const rec: FigmaPush = { id: "fp_" + crypto.randomBytes(5).toString("hex"), at: new Date().toISOString(), ...p };
    fs.writeFileSync(path.join(this.dir, rec.id + ".json"), JSON.stringify(rec));
    const all = fs.readdirSync(this.dir).filter((f) => /^fp_[a-f0-9]{10}\.json$/.test(f)).map((f) => ({ f, t: fs.statSync(path.join(this.dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const old of all.slice(40)) fs.rmSync(path.join(this.dir, old.f), { force: true });
    return rec;
  }
  get(id: string): FigmaPush { if (!/^fp_[a-f0-9]{10}$/.test(String(id))) fail("Invalid Figma push id"); try { return JSON.parse(fs.readFileSync(path.join(this.dir, id + ".json"), "utf8")); } catch { return fail(`Figma push ${id} not found — send the frame again from the Brickwire Figma plugin`, 404); } }
  list() { return fs.readdirSync(this.dir).filter((f) => /^fp_[a-f0-9]{10}\.json$/.test(f)).map((f) => { try { const r = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")) as FigmaPush; return { id: r.id, at: r.at, name: r.name, fileName: r.fileName, nodes: r.nodes, previewFileId: r.previewFileId, images: Object.keys(r.images ?? {}).length }; } catch { return null; } }).filter(Boolean).sort((a, b) => b!.at.localeCompare(a!.at)) as Array<{ id: string; at: string; name: string; fileName?: string; nodes: number; previewFileId?: string; images: number }>; }
}
/** Validate + store what the Figma plugin sent. */
export function ingestPush(deps: FigmaDeps, body: any) {
  const root = body?.root as FigNode;
  if (!root || typeof root !== "object" || typeof root.type !== "string" || !root.absoluteBoundingBox) fail("Figma push must contain the selected frame (root with absoluteBoundingBox)");
  const nodes = countNodes(root); if (nodes > 5000) fail("The frame has more than 5000 layers — select a smaller frame");
  const st = deps.store();
  const preview = typeof body.png === "string" && body.png ? st.add(Buffer.from(body.png, "base64"), { name: `${safe(root.name)}.png`, source: "figma" }) : undefined;
  const images: Record<string, string> = {};
  for (const [id, data] of Object.entries(body.images ?? {})) if (typeof data === "string" && data && Object.keys(images).length < 300) images[String(id).slice(0, 60)] = st.add(Buffer.from(data, "base64"), { name: `figma_${String(id).replace(/[^\w]+/g, "_")}.png`, source: "figma" }).id;
  const push = deps.pushes().add({ name: String(root.name).slice(0, 120), fileName: body.fileName ? String(body.fileName).slice(0, 120) : undefined, root, previewFileId: preview?.id, images, nodes });
  const chat = deps.feed()?.post({
    source: "figma", title: "Figma",
    text: [`**Figma → Brickwire:** «${push.name}»${push.fileName ? ` из файла «${push.fileName}»` : ""} — слоёв: ${nodes}, картинок: ${Object.keys(images).length}.`, preview ? `Превью: ${preview.name} → fileId ${preview.id}` : "", `pushId: ${push.id} — скажите «перенеси в Studio» (figma_to_studio) или нажмите кнопку ниже.`].filter(Boolean).join("\n"),
    images: preview ? [{ name: preview.name, data: st.read(preview.id) }] : [],
    actions: [{ label: "Собрать UI в Studio", tool: "figma_to_studio", args: { pushId: push.id } }],
  }) ?? null;
  return { ok: true, pushId: push.id, nodes, images: Object.keys(images).length, previewFileId: preview?.id, chat, message: chat ? "Sent to the Brickwire chat" : "Stored (open the Brickwire app chat)" };
}

// ------------------------------------------------------------------ tools
export interface FigmaDeps {
  store: () => AiFileStore; feed: () => ResultFeed | null; settings: () => FigmaSettings; pushes: () => FigmaPushStore;
  fetch?: FetchLike;
  /** Upload a stored PNG to Roblox and return "rbxassetid://<imageId>" (null when Open Cloud is not configured). */
  uploadImage?: (f: AiFile, ctx: Parameters<CompositeTool["run"]>[1]) => Promise<string | null>;
}
export const UI_BUILD_BODY = `	local parent = bw_must(ARGS.parentSegs)
	local existing = parent:FindFirstChild(ARGS.tree.name)
	local backup = nil
	if existing ~= nil then
		if not ARGS.replace then
			error("already exists: " .. bw_path(existing) .. " — pass replaceExisting=true (a backup is kept) or choose another name", 0)
		end
		local SS = game:GetService("ServerStorage")
		local bf = SS:FindFirstChild("BrickwireUIBackups") or Instance.new("Folder")
		bf.Name = "BrickwireUIBackups"
		bf.Parent = SS
		existing.Name = existing.Name .. "_" .. os.date("!%Y%m%d_%H%M%S")
		existing.Parent = bf
		backup = bw_path(existing)
	end
	local created, errs = {}, {}
	local root = bw_create_tree(ARGS.tree, parent, created, errs)
	bw_waypoint("Brickwire ui_build " .. root.Name)
	return { path = bw_path(root), instances = #created, propertyErrors = errs, backup = backup }`;
const str = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
export function makeFigmaTools(deps: FigmaDeps): CompositeTool[] {
  const api = () => new FigmaApi(deps.settings().token(), deps.fetch);
  async function loadNode(a: Record<string, unknown>): Promise<{ root: FigNode; images: Record<string, string>; key?: string; previewFileId?: string; source: string }> {
    if (a.pushId) { const p = deps.pushes().get(String(a.pushId)); return { root: p.root, images: { ...p.images }, previewFileId: p.previewFileId, source: `plugin push ${p.id}` }; }
    if (!a.url) fail("Pass url (figma.com link with node-id) or pushId (from the Brickwire Figma plugin)");
    const { fileKey, nodeId } = parseFigmaUrl(String(a.url));
    const id = a.nodeId ? String(a.nodeId).replace(/-/g, ":") : nodeId;
    if (!id) {
      const f = await api().file(fileKey, 2);
      const pages = (f.document?.children ?? []) as FigNode[];
      const frames = pages.flatMap((pg) => (pg.children ?? []).filter((c) => ["FRAME", "COMPONENT", "SECTION", "COMPONENT_SET"].includes(c.type)).map((c) => `${pg.name} / ${c.name} → nodeId ${c.id}`));
      fail(`The link has no node-id. Select a frame in Figma and copy its link, or pass nodeId. Frames in «${f.name}»:\n${frames.slice(0, 40).join("\n")}`);
    }
    const r = await api().nodes(fileKey, [id!]);
    const doc = r.nodes?.[id!]?.document as FigNode | undefined;
    if (!doc) fail(`Node ${id} not found in the file`);
    return { root: doc!, images: {}, key: fileKey, source: `figma.com ${fileKey} ${id}` };
  }
  async function preview(n: { root: FigNode; key?: string; previewFileId?: string }) {
    if (n.previewFileId) return deps.store().get(n.previewFileId);
    if (!n.key) return null;
    const urls = await api().images(n.key, [n.root.id], "png", 1);
    const u = urls[n.root.id]; if (!u) return null;
    return deps.store().add(await api().download(u), { name: `${safe(n.root.name)}.png`, source: "figma" });
  }
  return [
    {
      name: "figma_inspect",
      description: "Look at a Figma design: a figma.com link (with node-id; needs the Figma token set in the app) or a pushId sent by the Brickwire Figma plugin. Returns the layer outline (types, sizes, texts) and attaches a PNG preview so you can see it; the preview is also shown in the app chat.",
      risk: "read", requires: [],
      inputSchema: { type: "object", properties: { url: str("figma.com link"), nodeId: str("node id like 12:34 (if the link has none)"), pushId: str("fp_… from the plugin"), toChat: { type: "boolean", description: "default true" } } },
      async run(a) {
        const n = await loadNode(a);
        const p = await preview(n).catch((e) => { throw e; });
        const chat = a.toChat === false || !p ? null : deps.feed()?.post({ source: "figma", title: "Figma", text: `**Figma:** «${n.root.name}» — слоёв: ${countNodes(n.root)} (${n.source}). Превью → fileId ${p.id}`, images: [{ name: p.name, data: deps.store().read(p.id) }], actions: [{ label: "Собрать UI в Studio", tool: "figma_to_studio", args: a.pushId ? { pushId: a.pushId } : { url: a.url, ...(a.nodeId ? { nodeId: a.nodeId } : {}) } }] }) ?? null;
        return { name: n.root.name, type: n.root.type, size: n.root.absoluteBoundingBox ? [Math.round(n.root.absoluteBoundingBox.width), Math.round(n.root.absoluteBoundingBox.height)] : null, layers: countNodes(n.root), imageLayers: rasterIds(n.root).length, outline: outline(n.root).join("\n"), previewFileId: p?.id, chat, bwAttach: p ? [{ fileId: p.id, name: p.name, mime: p.mime }] : undefined, next: "figma_to_studio to build it as a ScreenGui" };
      },
    },
    {
      name: "figma_export",
      description: "Export Figma layers as image files (png, jpg, svg, pdf) into Brickwire's file store via the Figma API (token required): icons, backgrounds, logos. Returns fileIds (file_upload_roblox → Decal, file_to_studio → ImageLabel) and shows PNG/JPG in the app chat.",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["url"], properties: { url: str("figma.com link"), nodeIds: { type: "array", items: { type: "string" }, description: "node ids (default: the node-id of the link)" }, format: str("png (default) | jpg | svg | pdf", { enum: ["png", "jpg", "svg", "pdf"] }), scale: { type: "number", description: "0.01–4, default 2 (png/jpg)" }, toChat: { type: "boolean" } } },
      async run(a) {
        const { fileKey, nodeId } = parseFigmaUrl(String(a.url));
        const ids = (Array.isArray(a.nodeIds) && a.nodeIds.length ? a.nodeIds.map((x) => String(x).replace(/-/g, ":")) : nodeId ? [nodeId] : []).slice(0, 100);
        if (!ids.length) fail("Pass nodeIds or a link with node-id");
        const format = ["png", "jpg", "svg", "pdf"].includes(String(a.format)) ? String(a.format) : "png";
        const scale = Math.max(0.01, Math.min(4, Number(a.scale) || 2));
        const urls = await api().images(fileKey, ids, format, scale);
        const files: AiFile[] = [], failed: string[] = [];
        let names: Record<string, string> = {};
        try { const r = await api().nodes(fileKey, ids); names = Object.fromEntries(Object.entries(r.nodes ?? {}).map(([k, v]: [string, any]) => [k, v?.document?.name ?? k])); } catch { /* names are optional */ }
        for (const id of ids) { const u = urls[id]; if (!u) { failed.push(id); continue; } files.push(deps.store().add(await api().download(u), { name: `${safe(names[id] ?? "figma_" + id)}.${format}`, source: "figma" })); }
        const pics = files.filter((f) => f.kind === "image" && f.ext !== "svg").slice(0, 4);
        const chat = a.toChat === false || !files.length ? null : deps.feed()?.post({ source: "figma", title: "Figma", text: [`**Figma → файлы (${format.toUpperCase()}):**`, ...files.map((f) => `- ${f.name} (${kb(f.bytes)}) → fileId ${f.id}`)].join("\n"), images: pics.map((f) => ({ name: f.name, data: deps.store().read(f.id) })) }) ?? null;
        return { ok: files.length > 0, files: files.map((f) => ({ fileId: f.id, name: f.name, bytes: f.bytes, width: f.width, height: f.height })), failed, chat, bwAttach: pics.length ? pics.map((f) => ({ fileId: f.id, name: f.name, mime: f.mime })) : undefined };
      },
    },
    {
      name: "figma_to_studio",
      description: "Build a Figma frame as a real Roblox ScreenGui in Studio (Frames, TextLabels, buttons, UICorner/UIStroke/UIGradient; children in Scale units so it scales). Images/vectors are exported and uploaded to Roblox when Open Cloud is configured (otherwise empty ImageLabels are left with a FigmaNode attribute). Source: url (+nodeId, token needed) or pushId from the Brickwire Figma plugin. Undo with Ctrl+Z.",
      risk: "write", requires: ["execute_luau"],
      inputSchema: { type: "object", properties: { url: str("figma.com link with node-id"), nodeId: str("node id"), pushId: str("fp_… from the plugin"), name: str("ScreenGui name (default: frame name)"), root: str("auto (default: fit for ≥1000px designs, else fixed) | fixed (original pixel size, centred) | fit (scale to screen, keep aspect) | fill (stretch to screen)", { enum: ["auto", "fixed", "fit", "fill"] }), parent: str("default game.StarterGui"), uploadImages: { type: "boolean", description: "upload image layers to Roblox (default true when Open Cloud is configured)" }, replaceExisting: { type: "boolean" }, validateOnly: { type: "boolean" } } },
      snapshotTargets: (a) => [`${String(a.parent ?? "game.StarterGui")}.${String(a.name ?? "")}`].filter((x) => !x.endsWith(".")),
      async run(a, ctx) {
        const n = await loadNode(a);
        const need = rasterIds(n.root);
        const images: Record<string, string> = {}, imageErrors: string[] = [];
        const fileFor: Record<string, string> = { ...n.images };
        if (need.length && n.key && !a.validateOnly) {
          const missing = need.filter((id) => !fileFor[id]).slice(0, 200);
          if (missing.length) { const urls = await api().images(n.key, missing, "png", 2); for (const id of missing) { const u = urls[id]; if (u) fileFor[id] = deps.store().add(await api().download(u), { name: `figma_${id.replace(/[^\w]+/g, "_")}.png`, source: "figma" }).id; } }
        }
        if (a.uploadImages !== false && deps.uploadImage && !a.validateOnly) {
          for (const id of need) {
            const fid = fileFor[id]; if (!fid) continue;
            try { const content = await deps.uploadImage(deps.store().get(fid), ctx); if (content) images[id] = content; else { imageErrors.push("Roblox Open Cloud is not configured (ROBLOX_OPEN_CLOUD_API_KEY + creator id) — images not uploaded"); break; } }
            catch (e) { imageErrors.push(`${id}: ${(e as Error).message}`); if (imageErrors.length > 5) break; }
          }
        }
        const conv = figmaToUIDoc(n.root, { name: a.name ? String(a.name) : undefined, root: (["auto", "fixed", "fit", "fill"].includes(String(a.root)) ? String(a.root) : "auto") as ConvertOptions["root"], images });
        const compiled = compileUIDoc(conv.doc);
        const warnings = [...conv.warnings, ...compiled.warnings, ...new Set(imageErrors)];
        if (a.validateOnly) return { valid: true, layers: conv.elements, ...compiled.stats, warnings, doc: conv.doc };
        const studio = (await ctx.runLuau(wrapLuau({ parentSegs: pathSegments(String(a.parent ?? "game.StarterGui")), tree: compiled.tree, replace: !!a.replaceExisting }, UI_BUILD_BODY), { readOnly: false })) as { path?: string; instances?: number; propertyErrors?: unknown[] };
        const p = await preview(n).catch(() => null);
        const chat = deps.feed()?.post({ source: "figma", title: "Figma", text: [`**Figma → Studio:** «${n.root.name}» собран как ${studio?.path ?? conv.doc.name} (${studio?.instances ?? compiled.stats.instances} объектов).`, Object.keys(images).length ? `Картинок загружено в Roblox: ${Object.keys(images).length}/${need.length}` : need.length ? `Картинок/векторов: ${need.length} — не загружены (нужен Roblox Open Cloud).` : "", warnings.length ? "Замечания: " + warnings.slice(0, 6).join("; ") : ""].filter(Boolean).join("\n"), images: p ? [{ name: p.name, data: deps.store().read(p.id) }] : [] }) ?? null;
        return { ok: true, studio, layers: conv.elements, ...compiled.stats, imagesUploaded: Object.keys(images).length, imageLayers: need.length, imageFiles: fileFor, warnings, chat, next: "screenshot_studio / ui_import to check; ui_build with replaceExisting to adjust" };
      },
    },
    {
      name: "figma_pushes",
      description: "List frames recently sent from the Brickwire Figma plugin (pushId, name, layers).",
      risk: "read", requires: [], inputSchema: { type: "object", properties: {} },
      async run() { return { pushes: deps.pushes().list().slice(0, 20), token: deps.settings().public() }; },
    },
  ];
}
