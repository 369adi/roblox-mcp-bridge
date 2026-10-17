/**
 * Brickwire 2.0 — AI image providers + Roblox Open Cloud asset upload.
 *
 * Providers (env, or .env next to the bridge):
 *   BRICKWIRE_IMAGE_PROVIDER = openai | stability | custom      (default: openai if a key is set)
 *   BRICKWIRE_IMAGE_API_KEY  = provider key
 *   BRICKWIRE_IMAGE_API_URL  = base URL (custom / OpenAI-compatible gateways; default https://api.openai.com/v1)
 *   BRICKWIRE_IMAGE_MODEL    = model (default gpt-image-1 for openai)
 * Open Cloud upload (optional):
 *   ROBLOX_OPEN_CLOUD_API_KEY (scope: asset:read + asset:write)
 *   ROBLOX_CREATOR_USER_ID   or ROBLOX_CREATOR_GROUP_ID
 *
 * Nothing here is mocked: without keys the functions throw a clear "not configured" error.
 */

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: unknown }) => Promise<{
  ok: boolean; status: number; json(): Promise<any>; text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; headers?: { get(n: string): string | null };
}>;

export interface ImageRequest { prompt: string; negative?: string; size?: "1024x1024" | "1536x1024" | "1024x1536"; quality?: "low" | "medium" | "high"; transparent?: boolean }
export interface ImageResult { png: Buffer; provider: string; model: string; revisedPrompt?: string }

export interface ImageEnv { provider: string | null; key: string | null; url: string; model: string }
export function imageEnv(env: NodeJS.ProcessEnv = process.env): ImageEnv {
  const key = env.BRICKWIRE_IMAGE_API_KEY ?? env.OPENAI_API_KEY ?? null;
  const provider = env.BRICKWIRE_IMAGE_PROVIDER ?? (key ? "openai" : null);
  const url = (env.BRICKWIRE_IMAGE_API_URL ?? (provider === "stability" ? "https://api.stability.ai" : "https://api.openai.com/v1")).replace(/\/$/, "");
  const model = env.BRICKWIRE_IMAGE_MODEL ?? (provider === "stability" ? "core" : "gpt-image-1");
  return { provider, key, url, model };
}

export function imageProviderStatus(env = process.env) {
  const i = imageEnv(env), oc = openCloudEnv(env);
  return {
    imageProvider: i.provider && i.key ? { provider: i.provider, model: i.model, url: i.url } : null,
    openCloud: oc ? { creator: oc.creator } : null,
    setup: i.key ? undefined : "Set BRICKWIRE_IMAGE_API_KEY (+ BRICKWIRE_IMAGE_PROVIDER=openai|stability|custom) in Brickwire/.env and restart the bridge.",
  };
}

export async function generateImage(req: ImageRequest, fetchImpl: FetchLike = fetch as unknown as FetchLike, env = process.env): Promise<ImageResult> {
  const e = imageEnv(env);
  if (!e.provider || !e.key) throw new Error("image provider not configured: set BRICKWIRE_IMAGE_API_KEY and BRICKWIRE_IMAGE_PROVIDER in Brickwire/.env");
  const size = req.size ?? "1024x1024";
  if (e.provider === "openai" || e.provider === "custom") {
    const body: Record<string, unknown> = { model: e.model, prompt: req.negative ? `${req.prompt}\n\nAvoid: ${req.negative}` : req.prompt, size, n: 1 };
    if (/gpt-image/.test(e.model)) { body.quality = req.quality ?? "high"; if (req.transparent) body.background = "transparent"; }
    else body.response_format = "b64_json";
    const r = await fetchImpl(`${e.url}/images/generations`, { method: "POST", headers: { Authorization: `Bearer ${e.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`image API ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const j = await r.json();
    const d = j?.data?.[0];
    if (d?.b64_json) return { png: Buffer.from(d.b64_json, "base64"), provider: e.provider, model: e.model, revisedPrompt: d.revised_prompt };
    if (d?.url) { const g = await fetchImpl(d.url); return { png: Buffer.from(await g.arrayBuffer()), provider: e.provider, model: e.model, revisedPrompt: d.revised_prompt }; }
    throw new Error("image API returned no image");
  }
  if (e.provider === "stability") {
    const [w, h] = size.split("x").map(Number);
    const aspect = w === h ? "1:1" : w > h ? "3:2" : "2:3";
    const fd = new FormData();
    fd.append("prompt", req.prompt);
    if (req.negative) fd.append("negative_prompt", req.negative);
    fd.append("aspect_ratio", aspect);
    fd.append("output_format", "png");
    const r = await fetchImpl(`${e.url}/v2beta/stable-image/generate/${e.model}`, { method: "POST", headers: { Authorization: `Bearer ${e.key}`, Accept: "image/*" }, body: fd });
    if (!r.ok) throw new Error(`Stability API ${r.status}: ${(await r.text()).slice(0, 400)}`);
    return { png: Buffer.from(await r.arrayBuffer()), provider: "stability", model: e.model };
  }
  throw new Error(`unknown BRICKWIRE_IMAGE_PROVIDER "${e.provider}" (openai | stability | custom)`);
}

/**
 * M8: AI enhance pass (image-to-image). OpenAI-compatible: POST /images/edits (multipart, image + prompt).
 * Stability: POST /v2beta/stable-image/generate/sd3 with mode=image-to-image + strength.
 * Without a key it throws the same "not configured" error as generateImage (the caller keeps the local result).
 */
export const ENHANCE_PROMPT = "Enhance this Roblox game thumbnail: crisper details, richer lighting, vivid but clean colors, keep composition, characters, text and layout exactly the same.";
export async function enhanceImage(png: Buffer, opts: { prompt?: string; strength?: number } = {}, fetchImpl: FetchLike = fetch as unknown as FetchLike, env = process.env): Promise<ImageResult> {
  const e = imageEnv(env);
  if (!e.provider || !e.key) throw new Error("image provider not configured: set BRICKWIRE_IMAGE_API_KEY and BRICKWIRE_IMAGE_PROVIDER in Brickwire/.env");
  const prompt = opts.prompt ?? ENHANCE_PROMPT;
  const blob = new Blob([new Uint8Array(png)], { type: "image/png" });
  if (e.provider === "openai" || e.provider === "custom") {
    const fd = new FormData();
    fd.append("model", e.model);
    fd.append("prompt", prompt);
    fd.append("image", blob, "input.png");
    fd.append("size", "1536x1024");
    fd.append("n", "1");
    const r = await fetchImpl(`${e.url}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${e.key}` }, body: fd });
    if (!r.ok) throw new Error(`image edit API ${r.status}: ${(await r.text()).slice(0, 400)}`);
    const j = await r.json();
    const d = j?.data?.[0];
    if (d?.b64_json) return { png: Buffer.from(d.b64_json, "base64"), provider: e.provider, model: e.model };
    if (d?.url) { const g = await fetchImpl(d.url); return { png: Buffer.from(await g.arrayBuffer()), provider: e.provider, model: e.model }; }
    throw new Error("image edit API returned no image");
  }
  if (e.provider === "stability") {
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("mode", "image-to-image");
    fd.append("image", blob, "input.png");
    fd.append("strength", String(opts.strength ?? 0.35));
    fd.append("output_format", "png");
    const r = await fetchImpl(`${e.url}/v2beta/stable-image/generate/sd3`, { method: "POST", headers: { Authorization: `Bearer ${e.key}`, Accept: "image/*" }, body: fd });
    if (!r.ok) throw new Error(`Stability API ${r.status}: ${(await r.text()).slice(0, 400)}`);
    return { png: Buffer.from(await r.arrayBuffer()), provider: "stability", model: "sd3" };
  }
  throw new Error(`unknown BRICKWIRE_IMAGE_PROVIDER "${e.provider}" (openai | stability | custom)`);
}

// ------------------------------------------------------------------ Roblox Open Cloud

export interface OpenCloudEnv { key: string; creator: { userId: string } | { groupId: string } }
export function openCloudEnv(env: NodeJS.ProcessEnv = process.env): OpenCloudEnv | null {
  const key = env.ROBLOX_OPEN_CLOUD_API_KEY;
  if (!key) return null;
  if (env.ROBLOX_CREATOR_GROUP_ID) return { key, creator: { groupId: env.ROBLOX_CREATOR_GROUP_ID } };
  if (env.ROBLOX_CREATOR_USER_ID) return { key, creator: { userId: env.ROBLOX_CREATOR_USER_ID } };
  return null;
}

export type UploadAssetType = "Decal" | "Model" | "Audio" | "Video";
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", tga: "image/tga",
  glb: "model/gltf-binary", gltf: "model/gltf+json", fbx: "model/fbx", rbxm: "model/x-rbxm", rbxmx: "model/x-rbxmx",
  mp3: "audio/mpeg", ogg: "audio/ogg", wav: "audio/wav", flac: "audio/flac", mp4: "video/mp4", mov: "video/mov",
};

/** Upload via Open Cloud Assets API (POST /assets/v1/assets) and poll the operation until it has an assetId. */
export async function uploadAsset(
  file: Buffer, ext: keyof typeof CONTENT_TYPES | string, assetType: UploadAssetType, displayName: string, description: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike, env = process.env, pollMs = 1500, maxPolls = 40,
): Promise<{ assetId: string; operation: string }> {
  const oc = openCloudEnv(env);
  if (!oc) throw new Error("Open Cloud not configured: set ROBLOX_OPEN_CLOUD_API_KEY and ROBLOX_CREATOR_USER_ID (or ROBLOX_CREATOR_GROUP_ID) in Brickwire/.env");
  const ct = CONTENT_TYPES[ext];
  if (!ct) throw new Error(`unsupported upload type .${ext}`);
  const fd = new FormData();
  fd.append("request", JSON.stringify({ assetType, displayName: displayName.slice(0, 50), description: description.slice(0, 1000), creationContext: { creator: oc.creator } }));
  fd.append("fileContent", new Blob([new Uint8Array(file)], { type: ct }), `${displayName.replace(/[^\w-]/g, "_")}.${ext}`);
  const r = await fetchImpl("https://apis.roblox.com/assets/v1/assets", { method: "POST", headers: { "x-api-key": oc.key }, body: fd });
  if (!r.ok) throw new Error(`Open Cloud upload ${r.status}: ${(await r.text()).slice(0, 400)}`);
  let op = await r.json();
  const opPath: string = op.path ?? (op.operationId ? `operations/${op.operationId}` : "");
  for (let i = 0; !(op.done && op.response) && i < maxPolls; i++) {
    if (!opPath) break;
    await new Promise((res) => setTimeout(res, pollMs));
    const g = await fetchImpl(`https://apis.roblox.com/assets/v1/${opPath}`, { headers: { "x-api-key": oc.key } });
    if (!g.ok) throw new Error(`Open Cloud operation ${g.status}: ${(await g.text()).slice(0, 300)}`);
    op = await g.json();
  }
  const assetId = op?.response?.assetId ?? op?.assetId;
  if (!assetId) throw new Error(`upload accepted but not finished yet (operation ${opPath}) — check Creator Dashboard later`);
  return { assetId: String(assetId), operation: opPath };
}

/** Luau that resolves a Decal asset id to its underlying Image id (Texture of the inserted Decal). */
export const DECAL_TO_IMAGE_LUAU = `	local out = {}
	for _, id in ipairs(ARGS.ids) do
		local img, err = nil, nil
		for attempt = 1, 6 do
			local ok, model = pcall(function() return game:GetService("InsertService"):LoadAsset(tonumber(id)) end)
			if ok and model then
				local d = model:FindFirstChildWhichIsA("Decal", true)
				if d then img = string.match(d.Texture, "%d+$") end
				model:Destroy()
				if img then break end
			else err = tostring(model) end
			task.wait(2)
		end
		out[id] = { imageId = img, error = if img then nil else (err or "decal not loadable yet (moderation?)") }
	end
	return out`;
