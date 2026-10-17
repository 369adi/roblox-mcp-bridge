import { enhanceImage } from "./imagegen.js";
import fs from "node:fs";
import path from "node:path";
import type { CompositeTool } from "./composites.js";
import { pathSegments, wrapLuau } from "./luau.js";
import { decodePng, encodePng, fit, makeSeamless, derivePbr, writeGlb, writeObj, isPng } from "./imaging.js";
import { generateImage, uploadAsset, imageProviderStatus, openCloudEnv, DECAL_TO_IMAGE_LUAU, type FetchLike } from "./imagegen.js";
import { buildThumbnailPrompt, learnFromFeedback, emptyStyleMemory, SCENE_BRIEF_LUAU, THUMB_FORMATS, THUMB_STYLES, type StyleMemory, type ThumbFormat, type SceneBrief } from "../../shared/src/studio2/thumbnail.js";
import { THUMB_SCENE_LUAU, THUMB_SCENE_VERIFY_LUAU, THUMB_TEMPLATES, normalizeSceneArgs, SCENE_NAME } from "../../shared/src/studio2/thumbnail-scene.js";
import { GFX_STYLES, GFX_APPLY_LUAU, gfxStyle } from "../../shared/src/studio2/gfx.js";
import { postProcess, GFX_SIZES, type GfxSize } from "./imaging-post.js";
import { MESH_VFX_PRESETS, VFX_RUNTIME_MODULE, vfxInstallLuau, VFX_BUDGET } from "../../shared/src/studio2/vfx-mesh.js";
import { generateMesh, vertexNormals, meshStats, MESH_TYPES, type MeshType } from "../../shared/src/studio2/meshgen.js";

/**
 * Brickwire 2.0 stage C: AI Thumbnail/Icon generator (with learning loop), image generation, PBR generator,
 * Mesh 2.0 (EditableMesh + GLB/OBJ export), Open Cloud upload, automated playtest (StudioTestService).
 * Files are written under <dataDir>/generated/.
 */

const s = (description: string) => ({ type: "string", description });
const n = (description: string) => ({ type: "number", description });
const b = (description: string) => ({ type: "boolean", description });
const safe = (x: string) => x.replace(/[^\w-]+/g, "_").slice(0, 60) || "asset";
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

export interface ToolsCDeps { dataDir: string; fetch?: FetchLike; env?: NodeJS.ProcessEnv }

export function makeStudio2ToolsC(deps: ToolsCDeps): CompositeTool[] {
  const genDir = (...p: string[]) => { const d = path.join(deps.dataDir, "generated", ...p); fs.mkdirSync(d, { recursive: true }); return d; };
  const memFile = () => path.join(genDir(), "thumbnail-style-memory.json");
  const loadMem = (): StyleMemory => { try { return JSON.parse(fs.readFileSync(memFile(), "utf8")); } catch { return emptyStyleMemory(); } };
  const saveMem = (m: StyleMemory) => fs.writeFileSync(memFile(), JSON.stringify(m, null, 2));
  const env = () => deps.env ?? process.env;
  const doFetch = deps.fetch;

  async function upload(file: Buffer, ext: string, type: "Decal" | "Model", name: string, desc: string) {
    return uploadAsset(file, ext, type, name, desc, doFetch, env());
  }
  async function decalsToImages(ctx: Parameters<CompositeTool["run"]>[1], ids: string[]) {
    return (await ctx.runLuau(wrapLuau({ ids }, DECAL_TO_IMAGE_LUAU), { readOnly: true })) as Record<string, { imageId?: string; error?: string }>;
  }

  return [
    {
      name: "thumbnail_scene",
      description: "Build a ready-to-screenshot thumbnail scene in Workspace.BW_ThumbnailScene from parts only (R6 rigs with poses/faces that work in Edit mode, labels with outline, 16:9 auto camera + frame check with up to 2 fixes). Templates: poor_vs_rich (default), hero_peek, item_showcase. Re-running replaces only its own model. Undo: Ctrl+Z.",
      risk: "write", requires: ["execute_luau"],
      inputSchema: { type: "object", properties: {
        template: { type: "string", enum: [...THUMB_TEMPLATES], description: "scene template" },
        title: s("headline text (\n for stacked lines)"),
        labels: { type: "array", items: { type: "string" }, description: "poor_vs_rich: [leftLabel, rightLabel]" },
        side: { type: "string", enum: ["left", "right"], description: "hero_peek: which side the hero peeks from" },
        at: { type: "array", items: { type: "number" }, description: "stage origin [x,y,z], default [0,500,0]" },
        capture: b("also take a screen_capture via the Studio MCP when available (default true)"),
      } },
      snapshotTargets: () => [`Workspace.${SCENE_NAME}`],
      async run(args, ctx) {
        const a = normalizeSceneArgs(args);
        const built = await ctx.runLuau(wrapLuau(a, THUMB_SCENE_LUAU), { readOnly: false }) as Record<string, unknown>;
        const verify = await ctx.runLuau(wrapLuau({}, THUMB_SCENE_VERIFY_LUAU), { readOnly: true }) as Record<string, unknown>;
        let capture: unknown = "skipped";
        if (args.capture !== false) {
          try {
            const r = await ctx.callMcp("screen_capture", {});
            capture = r.isError ? `capture failed: ${r.text.slice(0, 200)}` : { ok: true, note: "screenshot taken by the Studio MCP" };
          } catch (e) { capture = `capture not available: ${(e as Error).message}`; }
        }
        const ok = verify.exists === true && verify.owned === true && Number(verify.jointsMismatched ?? 1) === 0;
        return { ok, built, verify, capture, undo: "Ctrl+Z in Studio (ChangeHistory waypoint 'Brickwire: thumbnail_scene')" };
      },
    },
    {
      name: "gfx_style",
      description: `Apply a GFX style to Studio (Lighting + BW_Gfx_* post effects + camera FOV) and return a measured read. Styles: ${GFX_STYLES.map((x) => x.id).join(", ")}. Undo: Ctrl+Z.`,
      risk: "write", requires: ["execute_luau"],
      inputSchema: { type: "object", properties: { style: { type: "string", enum: GFX_STYLES.map((x) => x.id), description: "style id" }, applyCamera: b("also set camera FOV (default true)") }, required: ["style"] },
      snapshotTargets: () => ["Lighting.BW_Gfx_CC", "Lighting.BW_Gfx_Bloom", "Lighting.BW_Gfx_DOF", "Lighting.BW_Gfx_SunRays", "Lighting.BW_Gfx_Atmosphere"],
      async run(args, ctx) {
        const style = gfxStyle(String(args.style));
        const read = await ctx.runLuau(wrapLuau({ style, applyCamera: args.applyCamera !== false }, GFX_APPLY_LUAU), { readOnly: false });
        return { style: style.id, applied: read, post: style.post, cameraRule: style.camera.rule, next: "take a screenshot (screen_capture) and run gfx_post on the PNG" };
      },
    },
    {
      name: "gfx_post",
      description: "Post-process a PNG locally (no API key needed): exact crop to 1920x1080 (thumbnail) or 512x512 (icon), saturation, sharpen, vignette (from a GFX style or explicit), outlined headline text that stays readable at 480x270. Writes a new PNG under generated/gfx.",
      risk: "write", requires: [],
      inputSchema: { type: "object", properties: {
        input: s("path to a PNG file"), size: { type: "string", enum: Object.keys(GFX_SIZES), description: "thumbnail | icon" },
        style: { type: "string", enum: GFX_STYLES.map((x) => x.id), description: "take post params from this style" },
        saturation: n("1 = unchanged"), sharpen: n("0..2"), vignette: n("0..1"),
        text: s("headline (\n for lines; A-Z 0-9 + - ! ? . , : ' $ % &)"), textPosition: { type: "string", enum: ["top", "left", "bottom"], description: "where" },
        enhance: b("AI enhance pass (image-to-image via BRICKWIRE_IMAGE_* key); without a key the local result is kept and the reason is returned"), enhancePrompt: s("optional enhance prompt"),
      }, required: ["input"] },
      async run(args) {
        const file = String(args.input);
        const buf = fs.readFileSync(file);
        if (!isPng(buf)) throw new Error("input is not a PNG");
        const st = args.style ? gfxStyle(String(args.style)).post : { saturation: 1, sharpen: 0, vignette: 0 };
        const num = (k: string, d: number) => (typeof args[k] === "number" ? (args[k] as number) : d);
        let src = decodePng(buf);
        let enhance: string = "off";
        if (args.enhance) {
          // enhance BEFORE the headline/crop so the text stays sharp and the exact size is still guaranteed
          try {
            const r = await enhanceImage(Buffer.from(buf), { prompt: typeof args.enhancePrompt === "string" ? args.enhancePrompt : undefined });
            if (!isPng(r.png)) throw new Error("provider did not return a PNG");
            src = decodePng(r.png);
            enhance = `done (${r.provider}/${r.model})`;
          } catch (e) {
            enhance = `skipped: ${(e as Error).message} — local post-processing applied`;
          }
        }
        const { image, textPxAt480 } = postProcess(src, {
          size: (args.size as GfxSize) ?? "thumbnail", saturation: num("saturation", st.saturation), sharpen: num("sharpen", st.sharpen), vignette: num("vignette", st.vignette),
          text: typeof args.text === "string" && args.text ? { value: args.text, position: (args.textPosition as "top") ?? "top" } : undefined,
        });
        const out = path.join(genDir("gfx"), `${safe(path.basename(file, ".png"))}-${stamp()}.png`);
        fs.writeFileSync(out, encodePng(image));
        return { file: out, width: image.width, height: image.height, textPxAt480, enhance };
      },
    },
    {
      name: "vfx_mesh_install",
      description: `Install layered Mesh VFX presets (only meshes from the bundled vfx pack) into ReplicatedStorage.BW_VFX + a runtime ModuleScript (VFX.play(name, cframe, {scale,color}); VFX.bindMarkers(animTrack, getCFrame) fires on KeyframeMarker "vfx" param=<preset> or "vfx:<preset>"). Optional edit-mode preview in Workspace.BW_VfxPreview. Presets: ${MESH_VFX_PRESETS.map((p) => p.id).join(", ")}.`,
      risk: "write", requires: ["execute_luau"],
      inputSchema: { type: "object", properties: {
        presets: { type: "array", items: { type: "string", enum: MESH_VFX_PRESETS.map((p) => p.id) }, description: "default: all 12" },
        preview: s("preset to preview in Edit mode"), at: { type: "array", items: { type: "number" }, description: "preview position [x,y,z]" },
      } },
      snapshotTargets: () => ["ReplicatedStorage.BW_VFX", "Workspace.BW_VfxPreview"],
      async run(args, ctx) {
        const ids = Array.isArray(args.presets) && args.presets.length ? args.presets.map(String) : MESH_VFX_PRESETS.map((p) => p.id);
        const at = Array.isArray(args.at) && args.at.length === 3 ? (args.at.map(Number) as [number, number, number]) : ([0, 10, 0] as [number, number, number]);
        const preview = typeof args.preview === "string" ? { preset: args.preview, at } : undefined;
        const studio = await ctx.runLuau(wrapLuau({ runtime: VFX_RUNTIME_MODULE }, vfxInstallLuau(ids, preview)), { readOnly: false });
        return { studio, budget: VFX_BUDGET, usage: "local VFX = require(game.ReplicatedStorage.BW_VFX.VFX); VFX.play(\"explosion\", hrp.CFrame)" };
      },
    },
    {
      name: "image_status",
      description: "Show whether an AI image provider and Roblox Open Cloud upload are configured (and how to configure them).",
      risk: "read", requires: [], inputSchema: { type: "object", properties: {} },
      async run() { return { ...imageProviderStatus(env()), outputDir: genDir() }; },
    },
    {
      name: "image_generate",
      description: "Generate an image with the configured AI provider (OpenAI gpt-image / Stability / OpenAI-compatible). Saves a PNG; optional resize and Open Cloud upload as Decal (returns rbxassetid).",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["prompt"], properties: { prompt: s("Prompt"), negative: s("Things to avoid"), size: { type: "string", enum: ["1024x1024", "1536x1024", "1024x1536"] }, width: n("Output width"), height: n("Output height"), transparent: b("Transparent background (gpt-image)"), name: s("File/asset name"), upload: b("Upload to Roblox as Decal") } },
      async run(a, ctx) {
        const img = await generateImage({ prompt: String(a.prompt), negative: a.negative as string, size: a.size as never, transparent: !!a.transparent }, doFetch, env());
        let png = img.png;
        if (a.width && a.height && isPng(png)) png = encodePng(fit(decodePng(png), Number(a.width), Number(a.height)));
        const name = safe(String(a.name ?? "image"));
        const file = path.join(genDir("images"), `${name}_${stamp()}.png`);
        fs.writeFileSync(file, png);
        let roblox: unknown = null;
        if (a.upload) { const up = await upload(png, "png", "Decal", name, String(a.prompt).slice(0, 900)); const m = await decalsToImages(ctx, [up.assetId]); roblox = { decalId: up.assetId, imageId: m[up.assetId]?.imageId ?? null, note: m[up.assetId]?.error }; }
        return { file, bytes: png.length, provider: img.provider, model: img.model, revisedPrompt: img.revisedPrompt, roblox };
      },
    },
    {
      name: "thumbnail_generate",
      description: `AI Thumbnail/Icon generator. Reads the open place (name, design brief, dominant colors, key models, lighting), builds an art-director prompt from top-Roblox-thumbnail rules + genre conventions + what this user liked before, generates ${"`variants`"} images, crops to exact size (thumbnail 1920x1080, icon/badge/gamepass 512x512). Rate results with thumbnail_feedback so it learns. Styles: ${Object.keys(THUMB_STYLES).join(", ")}.`,
      risk: "write", requires: [],
      inputSchema: { type: "object", properties: {
        format: { type: "string", enum: Object.keys(THUMB_FORMATS) }, style: { type: "string", enum: Object.keys(THUMB_STYLES) }, variants: n("1..4 (default 2)"),
        brief: { type: "object", description: "Override/extend scene brief: gameName, genre, description, keyObjects[], palette[], mood, lighting, characters, action" },
        direction: s("Extra art direction"), useScene: b("Read the open place for grounding (default true, needs execute_luau)"), promptOnly: b("Only build the prompt (no API call)"), upload: b("Upload results to Roblox as Decals"),
      } },
      async run(a, ctx) {
        const format = (a.format as ThumbFormat) ?? "thumbnail";
        let brief: SceneBrief = {};
        let sceneError: string | undefined;
        if (a.useScene !== false) { try { brief = ((await ctx.runLuau(wrapLuau({}, SCENE_BRIEF_LUAU), { readOnly: true })) as SceneBrief) ?? {}; } catch (e) { sceneError = String((e as Error).message ?? e); } }
        brief = { ...brief, ...((a.brief as SceneBrief) ?? {}) };
        const mem = loadMem();
        const p = buildThumbnailPrompt(brief, format, mem, a.style as string, a.direction as string);
        if (a.promptOnly) return { ...p, brief, sceneError };
        const variants = Math.max(1, Math.min(4, Math.round(Number(a.variants ?? 2))));
        const dir = genDir("thumbnails");
        const results: Array<Record<string, unknown>> = [];
        for (let i = 0; i < variants; i++) {
          const vprompt = variants > 1 ? `${p.prompt}\nVariation ${i + 1} of ${variants}: ${["hero close-up", "wide action shot", "low dramatic angle", "over-the-shoulder view"][i]}.` : p.prompt;
          try {
            const img = await generateImage({ prompt: vprompt, negative: p.negative, size: p.size as never, quality: "high" }, doFetch, env());
            const png = isPng(img.png) ? encodePng(fit(decodePng(img.png), p.target.w, p.target.h)) : img.png;
            const id = `${format}_${stamp()}_${i + 1}`;
            const file = path.join(dir, `${id}.png`);
            fs.writeFileSync(file, png);
            fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, style: p.style, format, prompt: vprompt, negative: p.negative, brief }, null, 2));
            const r: Record<string, unknown> = { id, file, size: `${p.target.w}x${p.target.h}` };
            if (a.upload) { const up = await upload(png, "png", "Decal", `${brief.gameName ?? "Game"} ${format} ${i + 1}`, "Brickwire AI thumbnail"); const m = await decalsToImages(ctx, [up.assetId]); r.decalId = up.assetId; r.imageId = m[up.assetId]?.imageId ?? null; }
            results.push(r);
          } catch (e) { results.push({ error: String((e as Error).message ?? e) }); if (i === 0) break; }
        }
        return {
          results, style: p.style, prompt: p.prompt, learned: p.learned, sceneError,
          next: "Show the files to the user, then call thumbnail_feedback {id, rating 1-5, notes} for each — future thumbnails adapt to it.",
          howItLearns: "Prompt-level learning: ratings shift style choice and feed liked traits into the prompt and disliked ones into the negative prompt. The provider model itself is not retrained.",
          publish: format === "thumbnail" || format === "icon" ? "Set it in Creator Dashboard → your experience → Places/Icon & Thumbnails (Roblox has no public API to set experience thumbnails)." : undefined,
        };
      },
    },
    {
      name: "thumbnail_feedback",
      description: "Teach the thumbnail AI: rate a generated thumbnail 1–5 with notes (e.g. 'more contrast, no blur, bigger character'). Stored per user and applied to all future thumbnail_generate calls.",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["id", "rating"], properties: { id: s("Thumbnail id from thumbnail_generate"), rating: n("1..5"), notes: s("What to keep / change"), reset: b("Forget everything learned") } },
      async run(a) {
        if (a.reset) { saveMem(emptyStyleMemory()); return { reset: true }; }
        const meta = path.join(genDir("thumbnails"), `${safe(String(a.id))}.json`);
        if (!fs.existsSync(meta)) throw new Error(`unknown thumbnail id "${a.id}"`);
        const m = JSON.parse(fs.readFileSync(meta, "utf8"));
        const mem = learnFromFeedback(loadMem(), { id: String(a.id), style: m.style, format: m.format, rating: Number(a.rating), notes: a.notes as string, prompt: m.prompt });
        saveMem(mem);
        return { learned: { liked: mem.liked, disliked: mem.disliked, styleScore: mem.styleScore }, ratings: mem.ratings.length };
      },
    },
    {
      name: "pbr_generate",
      description: "PBR material generator: AI seamless albedo (or your PNG via sourceFile) → tileable fix → derived Normal (OpenGL), Roughness, Metalness maps → PNG files. With Open Cloud configured it uploads them and creates a MaterialVariant in MaterialService (optionally applied to parts).",
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["name"], properties: {
        name: s("Material name"), prompt: s("Surface description, e.g. 'mossy cobblestone'"), sourceFile: s("Local PNG path instead of AI"), resolution: n("256|512|1024 (default 1024)"),
        baseMaterial: s("Roblox base Material, e.g. Slate"), studsPerTile: n("Default 8"), normalStrength: n("Default 2.5"), roughness: n("0..1 base"), metalness: n("0..1"), applyTo: { type: "array", items: { type: "string" } }, upload: b("Upload + create MaterialVariant (default true if Open Cloud configured)"),
      } },
      async run(a, ctx) {
        const name = safe(String(a.name));
        const res = [256, 512, 1024].includes(Number(a.resolution)) ? Number(a.resolution) : 1024;
        let src: Buffer;
        if (a.sourceFile) src = fs.readFileSync(String(a.sourceFile));
        else {
          if (!a.prompt) throw new Error("give prompt (AI) or sourceFile (PNG)");
          src = (await generateImage({ prompt: `Seamless tileable PBR albedo texture of ${a.prompt}. Orthographic top-down, perfectly flat even lighting, no shadows, no highlights, no perspective, fills the whole frame, high detail, game texture.`, negative: "shadows, perspective, objects, text, vignette, borders", size: "1024x1024" }, doFetch, env())).png;
        }
        const albedo = makeSeamless(fit(decodePng(src), res, res));
        const maps = derivePbr(albedo, { normalStrength: a.normalStrength as number, roughness: a.roughness as number, metalness: a.metalness as number });
        const dir = genDir("pbr", name);
        const files: Record<string, string> = {};
        for (const k of ["color", "normal", "roughness", "metalness", "height"] as const) { files[k] = path.join(dir, `${name}_${k}.png`); fs.writeFileSync(files[k], encodePng(maps[k])); }
        const doUpload = a.upload ?? !!openCloudEnv(env());
        if (!doUpload) return { files, studio: null, note: "Files saved. To use in Studio: configure Open Cloud (image_status) and rerun, or import the 4 PNGs with Asset Manager and create a MaterialVariant / SurfaceAppearance manually." };
        const decals: Record<string, string> = {};
        for (const k of ["color", "normal", "roughness", "metalness"] as const) decals[k] = (await upload(fs.readFileSync(files[k]), "png", "Decal", `${name}_${k}`, `Brickwire PBR ${k}`)).assetId;
        const imgs = await decalsToImages(ctx, Object.values(decals));
        const ids: Record<string, string | null> = {};
        for (const k of Object.keys(decals)) ids[k] = imgs[decals[k]]?.imageId ?? null;
        if (Object.values(ids).some((v) => !v)) return { files, decals, imageIds: ids, studio: null, note: "Uploaded, but some images are not loadable yet (moderation). Rerun with the same sourceFile later." };
        const studio = await ctx.runLuau(wrapLuau({ name, ids, base: String(a.baseMaterial ?? "Plastic"), spt: Number(a.studsPerTile ?? 8), apply: ((a.applyTo as string[]) ?? []).map((p) => pathSegments(p)) }, `	local MS = game:GetService("MaterialService")
	local mv = MS:FindFirstChild(ARGS.name) or Instance.new("MaterialVariant")
	mv.Name = ARGS.name
	mv.BaseMaterial = Enum.Material[ARGS.base]
	mv.StudsPerTile = ARGS.spt
	mv.ColorMap = "rbxassetid://" .. ARGS.ids.color
	mv.NormalMap = "rbxassetid://" .. ARGS.ids.normal
	mv.RoughnessMap = "rbxassetid://" .. ARGS.ids.roughness
	mv.MetalnessMap = "rbxassetid://" .. ARGS.ids.metalness
	mv.Parent = MS
	local applied = {}
	for _, segs in ipairs(ARGS.apply) do
		local inst = bw_must(segs)
		local list = inst:IsA("BasePart") and { inst } or inst:GetDescendants()
		for _, p in ipairs(list) do if p:IsA("BasePart") then p.Material = mv.BaseMaterial p.MaterialVariant = ARGS.name table.insert(applied, bw_path(p)) end end
	end
	bw_waypoint("Brickwire pbr_generate " .. ARGS.name)
	return { materialVariant = bw_path(mv), applied = #applied }`), { readOnly: false });
        return { files, imageIds: ids, studio };
      },
    },
    {
      name: "mesh_generate",
      description: `Mesh 2.0: procedural mesh (${MESH_TYPES.join(", ")}). Builds a real MeshPart in Studio via EditableMesh (AssetService:CreateEditableMesh → CreateMeshPartAsync) and always exports GLB+OBJ files. Note: EditableMesh content is not saved with the place — for a permanent mesh use upload=true (Open Cloud Model) or import the GLB with the 3D Importer.`,
      risk: "write", requires: [],
      inputSchema: { type: "object", required: ["type"], properties: {
        type: { type: "string", enum: [...MESH_TYPES] }, seed: n("Seed"), size: { type: "array", items: { type: "number" } }, detail: n("rock subdivisions 1..4"), roughness: n("rock noise 0..1"),
        segments: n("Segments"), count: n("crystal count"), profile: { type: "array", items: { type: "array" }, description: "lathe [[radius 0..1, height 0..1], ...]" }, points: { type: "array", items: { type: "array" } }, radius: n("tube radius"),
        position: { type: "array", items: { type: "number" } }, color: s("#hex"), material: s("Material"), parent: s("Parent path (default Workspace)"), buildInStudio: b("Default true"), upload: b("Upload GLB to Roblox as Model (Open Cloud) and insert it permanently"),
      } },
      async run(a, ctx) {
        const m = generateMesh(a.type as MeshType, a as never);
        const st = meshStats(m);
        if (st.invalidTriangles) throw new Error(`generator produced ${st.invalidTriangles} invalid triangles`);
        if (st.vertices > 20000) throw new Error(`too many vertices (${st.vertices}) — lower detail/segments`);
        const normals = vertexNormals(m);
        const dir = genDir("meshes");
        const base = path.join(dir, `${m.name}_${stamp()}`);
        fs.writeFileSync(`${base}.glb`, writeGlb(m.name, m.positions, m.triangles, normals, m.uvs));
        fs.writeFileSync(`${base}.obj`, writeObj(m.name, m.positions, m.triangles, m.uvs));
        const out: Record<string, unknown> = { stats: st, files: { glb: `${base}.glb`, obj: `${base}.obj` } };
        const r4 = (v: number) => Math.round(v * 1000) / 1000;
        const pos = a.position ?? [0, 5, 0];
        if (a.upload) {
          const up = await upload(fs.readFileSync(`${base}.glb`), "glb", "Model", m.name, "Brickwire procedural mesh");
          out.modelAssetId = up.assetId;
          out.studio = await ctx.runLuau(wrapLuau({ id: up.assetId, pos, parent: a.parent ? pathSegments(String(a.parent)) : null }, `	local ok, model = pcall(function() return game:GetService("InsertService"):LoadAsset(tonumber(ARGS.id)) end)
	if not ok then error("uploaded, but not loadable yet: " .. tostring(model), 0) end
	model.Parent = ARGS.parent and bw_must(ARGS.parent) or workspace
	model:PivotTo(CFrame.new(ARGS.pos[1], ARGS.pos[2], ARGS.pos[3]))
	bw_waypoint("Brickwire mesh upload")
	return { path = bw_path(model) }`), { readOnly: false });
          return out;
        }
        if (a.buildInStudio === false) return out;
        out.studio = await ctx.runLuau(wrapLuau({
          name: m.name, v: m.positions.map((p) => p.map(r4)), t: m.triangles, uv: m.uvs.map((p) => p.map(r4)), nrm: normals.map((p) => p.map(r4)), pos,
          color: (a.color as string) ?? "#8a8a8a", material: (a.material as string) ?? "Rock", parent: a.parent ? pathSegments(String(a.parent)) : null,
        }, `	local AS = game:GetService("AssetService")
	local okE, em = pcall(function() return AS:CreateEditableMesh() end)
	if not okE or not em then error("EditableMesh unavailable: " .. tostring(em) .. " (update Studio; GLB file was exported instead)", 0) end
	local vid, uvid, nid = {}, {}, {}
	for i, p in ipairs(ARGS.v) do vid[i] = em:AddVertex(Vector3.new(p[1], p[2], p[3])) end
	local hasUV = pcall(function() for i, t in ipairs(ARGS.uv) do uvid[i] = em:AddUV(Vector2.new(t[1], t[2])) end end)
	local hasN = pcall(function() for i, q in ipairs(ARGS.nrm) do nid[i] = em:AddNormal(Vector3.new(q[1], q[2], q[3])) end end)
	for _, t in ipairs(ARGS.t) do
		local f = em:AddTriangle(vid[t[1] + 1], vid[t[2] + 1], vid[t[3] + 1])
		if hasUV then pcall(function() em:SetFaceUVs(f, { uvid[t[1] + 1], uvid[t[2] + 1], uvid[t[3] + 1] }) end) end
		if hasN then pcall(function() em:SetFaceNormals(f, { nid[t[1] + 1], nid[t[2] + 1], nid[t[3] + 1] }) end) end
	end
	local okP, part = pcall(function() return AS:CreateMeshPartAsync(Content.fromObject(em)) end)
	if not okP then error("CreateMeshPartAsync failed: " .. tostring(part), 0) end
	part.Name = ARGS.name
	part.Anchored = true
	part.Color = Color3.fromHex(ARGS.color)
	pcall(function() part.Material = Enum.Material[ARGS.material] end)
	part.Position = Vector3.new(ARGS.pos[1], ARGS.pos[2], ARGS.pos[3])
	part:SetAttribute("BrickwireMesh", true)
	part.Parent = ARGS.parent and bw_must(ARGS.parent) or workspace
	bw_waypoint("Brickwire mesh_generate " .. ARGS.name)
	return { path = bw_path(part), size = bw_enc(part.Size), uv = hasUV, normals = hasN, persistent = false }`), { readOnly: false });
        out.warning = "This MeshPart uses an in-memory EditableMesh: it disappears when the place is reopened. Keep it permanently with upload=true or import the GLB (Avatar/3D Importer).";
        return out;
      },
    },
    {
      name: "playtest_run",
      description: "Automated playtest: starts Run mode (server only) or Play mode (with a player) via StudioTestService, runs runtime checks inside the game for `seconds`, stops and returns results: runtime errors, NPCs moved, mechanics alive (leaderstats, round status, day/night), player spawned/health. Experimental: needs plugin-level Studio access.",
      risk: "read", requires: ["execute_luau"],
      inputSchema: { type: "object", properties: { mode: { type: "string", enum: ["run", "play"] }, seconds: n("3..60 (default 10)") } },
      async run(a, ctx) {
        const seconds = Math.max(3, Math.min(60, Number(a.seconds ?? 10)));
        const mode = a.mode === "play" ? "play" : "run";
        return ctx.runLuau(wrapLuau({ seconds, mode, runner: PLAYTEST_RUNNER }, `	local STS = game:GetService("StudioTestService")
	local SSS = game:GetService("ServerScriptService")
	local old = SSS:FindFirstChild("BW_PlaytestRunner")
	if old then old:Destroy() end
	local r = Instance.new("Script")
	r.Name = "BW_PlaytestRunner"
	r.Source = ARGS.runner
	r.Parent = SSS
	local ok, res = pcall(function()
		if ARGS.mode == "play" then return STS:ExecutePlayModeAsync({ seconds = ARGS.seconds, mode = ARGS.mode }) end
		return STS:ExecuteRunModeAsync({ seconds = ARGS.seconds, mode = ARGS.mode })
	end)
	if r.Parent then r:Destroy() end
	if not ok then error("automated playtest unavailable here: " .. tostring(res) .. " — press F5 manually and use debug_logs/test_run", 0) end
	return res`), { readOnly: true });
      },
    },
  ];
}

/** Server-side runner inserted only for the duration of an automated playtest. */
export const PLAYTEST_RUNNER = `-- Brickwire automated playtest runner (temporary; removed after the test)
local STS = game:GetService("StudioTestService")
local RunService = game:GetService("RunService")
if not RunService:IsRunning() then return end
local okArgs, args = pcall(function() return STS:GetTestArgs() end)
if not okArgs or type(args) ~= "table" then return end
local LogService = game:GetService("LogService")
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local errors = {}
LogService.MessageOut:Connect(function(msg, t)
	if t == Enum.MessageType.MessageError and #errors < 50 then table.insert(errors, string.sub(msg, 1, 300)) end
end)
local npcStart = {}
local npcFolder = workspace:FindFirstChild("BW_NPCs")
if npcFolder then for _, m in ipairs(npcFolder:GetChildren()) do if m:IsA("Model") then npcStart[m] = m:GetPivot().Position end end end
local statusSeen = {}
local st = RS:FindFirstChild("BW_Status")
if st and st:IsA("ValueBase") then statusSeen[tostring(st.Value)] = true st.Changed:Connect(function(v) statusSeen[tostring(v)] = true end) end
local clock0 = game:GetService("Lighting").ClockTime
if args.mode == "play" then local t0 = os.clock() while #Players:GetPlayers() == 0 and os.clock() - t0 < 10 do task.wait(0.2) end end
task.wait(args.seconds)
local checks = {}
local function add(name, pass, detail) table.insert(checks, { check = name, pass = pass, detail = detail }) end
add("no runtime errors", #errors == 0, errors)
local moved, total = 0, 0
for m, p in pairs(npcStart) do total += 1 if m.Parent and (m:GetPivot().Position - p).Magnitude > 1 then moved += 1 end end
if total > 0 then add("NPCs active", nil, { moved = moved, total = total, note = "idle/guard NPCs stand still by design" }) end
if st then local n = 0 for _ in pairs(statusSeen) do n += 1 end add("round_system status updates", n >= 1, { distinctValues = n }) end
if RS:FindFirstChild("BW_IsNight") then add("day_night clock running", game:GetService("Lighting").ClockTime ~= clock0, { from = clock0, to = game:GetService("Lighting").ClockTime }) end
if args.mode == "play" then
	local pl = Players:GetPlayers()
	add("player joined", #pl > 0, { players = #pl })
	for _, p in ipairs(pl) do
		local ch = p.Character
		local hum = ch and ch:FindFirstChildOfClass("Humanoid")
		add("character spawned: " .. p.Name, hum ~= nil and hum.Health > 0, { health = hum and hum.Health })
		if game:GetService("ServerScriptService"):FindFirstChild("BW_leaderstats", true) or workspace:FindFirstChild("BW_leaderstats", true) then
			add("leaderstats created: " .. p.Name, p:FindFirstChild("leaderstats") ~= nil)
		end
	end
end
local passed, failed = 0, 0
for _, c in ipairs(checks) do if c.pass == true then passed += 1 elseif c.pass == false then failed += 1 end end
STS:EndTest({ mode = args.mode, seconds = args.seconds, passed = passed, failed = failed, checks = checks })
`;
