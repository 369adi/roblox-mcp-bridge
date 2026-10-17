/**
 * Brickwire 2.0 — AI Thumbnail / Icon art director.
 *
 * The image model is an external provider (OpenAI / Stability / custom). What Brickwire "teaches" it:
 *  1. A knowledge base of what makes top Roblox thumbnails & icons click (composition, focal character,
 *     contrast, readability at small size, genre conventions) → compiled into a structured prompt.
 *  2. Scene grounding: the brief is built from the REAL place (game name, design brief, dominant colors,
 *     key models, lighting) so the picture matches the game.
 *  3. A learning loop: the user rates results (1–5 + notes). Liked traits are reinforced, disliked ones
 *     go to the negative prompt, and per-style weights shift toward what this user likes (few-shot style memory).
 * This is prompt-level learning (no model weights are trained) — stated honestly in the tool output.
 */

export const THUMB_FORMATS = {
  thumbnail: { w: 1920, h: 1080, gen: "1536x1024" as const, label: "Experience thumbnail 16:9" },
  icon: { w: 512, h: 512, gen: "1024x1024" as const, label: "Experience icon 1:1" },
  badge: { w: 512, h: 512, gen: "1024x1024" as const, label: "Badge (circular crop safe)" },
  gamepass: { w: 512, h: 512, gen: "1024x1024" as const, label: "Game pass / dev product" },
};
export type ThumbFormat = keyof typeof THUMB_FORMATS;

export const THUMB_STYLES: Record<string, string> = {
  roblox_render: "high-end Roblox 3D render, Blender Cycles look, soft global illumination, rim light, glossy plastic materials, slightly exaggerated proportions",
  cartoon: "vibrant cartoon 3D style, chunky shapes, thick readable silhouettes, saturated candy colors",
  anime: "anime-styled 3D render, cel shading accents, dramatic speed lines, energetic pose",
  realistic: "cinematic realistic lighting on stylized Roblox characters, volumetric fog, depth of field",
  minimal: "clean minimal flat-shaded 3D, two-color palette, strong negative space, iconic single object",
  horror: "dark horror mood, single cold light source, fog, high contrast silhouettes, subtle red accents",
};

/** Genre conventions observed on top-performing Roblox experiences. */
export const GENRE_RULES: Record<string, string> = {
  obby: "a character mid-jump over a colorful hazard course, lava or void below, sense of height, bright sky",
  tycoon: "a proud character in front of a growing base, piles of cash/coins, upgrade arrows, warm golden light",
  simulator: "oversized pet or item, exploding coins and gems, big number-like sparkles (no text), bright pastel colors",
  pvp: "two characters clashing with weapons, impact flash between them, dynamic diagonal composition",
  horror: "scared character in foreground, a looming monster silhouette behind, flashlight beam",
  rpg: "hero with a glowing weapon facing a large boss, magical particles, epic scale",
  racing: "a car drifting toward the camera, motion blur, sparks, low camera angle",
  roleplay: "a friendly group of characters in a cozy detailed town, golden hour",
  survival: "character with tools at a campfire, threatening night forest, contrast of warm and cold light",
  tower_defense: "towers firing at a wave of enemies on a path, explosions, top-down 3/4 view",
};

const BASE_RULES_THUMB = [
  "one clear focal point occupying 40–60% of the frame",
  "main character face/expression readable even at 256 px wide, exaggerated emotion",
  "strong foreground/background separation: saturated subject, slightly darker or blurred background",
  "rule of thirds, diagonal action lines, camera close to the action",
  "complementary color contrast (e.g. orange subject on blue background)",
  "important content away from the edges (safe area 10%)",
];
const BASE_RULES_ICON = [
  "a single iconic subject centered, filling ~70% of the square",
  "bold silhouette readable at 64 px, minimal background detail, simple radial gradient backdrop",
  "thick clean rim light so the subject pops from the background",
  "keep the subject inside a central circle (badges are cropped round)",
];
const BASE_NEGATIVE = [
  "text", "letters", "words", "logos", "watermark", "UI elements", "real-world brands", "photorealistic humans", "gore", "blurry subject", "cluttered composition", "cropped head",
];

export interface SceneBrief {
  gameName?: string; genre?: string; description?: string;
  keyObjects?: string[]; palette?: string[]; mood?: string; lighting?: string; characters?: string; action?: string;
}

export interface StyleMemory {
  /** rating history */
  ratings: Array<{ id: string; style: string; format: ThumbFormat; rating: number; notes?: string; prompt: string; at: string }>;
  liked: string[];    // traits to reinforce
  disliked: string[]; // traits to avoid
  styleScore: Record<string, number>;
}
export const emptyStyleMemory = (): StyleMemory => ({ ratings: [], liked: [], disliked: [], styleScore: {} });

/** Split free-form feedback ("больше контраста, без текста; too dark") into short traits. */
export function feedbackTraits(notes: string): string[] {
  return notes.split(/[,;\n.]+/).map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 3 && s.length <= 80);
}

/** Learning step: record a rating and update liked/disliked traits and style weights. */
export function learnFromFeedback(mem: StyleMemory, r: { id: string; style: string; format: ThumbFormat; rating: number; notes?: string; prompt: string }): StyleMemory {
  const rating = Math.max(1, Math.min(5, Math.round(r.rating)));
  const m: StyleMemory = { ratings: [...mem.ratings, { ...r, rating, at: new Date().toISOString() }].slice(-200), liked: [...mem.liked], disliked: [...mem.disliked], styleScore: { ...mem.styleScore } };
  m.styleScore[r.style] = Math.round(((m.styleScore[r.style] ?? 0) * 0.7 + (rating - 3)) * 100) / 100;
  for (const t of feedbackTraits(r.notes ?? "")) {
    const neg = /^(no|not|without|less|avoid|без|не |меньше|убери|убрать)(\s|$)/.test(t) || /(too |слишком|плох|ugly|bad)/.test(t);
    const clean = t.replace(/^(no|not|without|less|avoid|без|не|меньше|убери|убрать)\s+/, "");
    if (neg || rating <= 2) { if (!m.disliked.includes(clean)) m.disliked.push(clean); m.liked = m.liked.filter((x) => x !== clean); }
    else if (rating >= 4) { if (!m.liked.includes(clean)) m.liked.push(clean); m.disliked = m.disliked.filter((x) => x !== clean); }
  }
  m.liked = m.liked.slice(-25); m.disliked = m.disliked.slice(-25);
  return m;
}

/** Pick the style: explicit > best-rated by this user > genre default. */
export function pickStyle(mem: StyleMemory, explicit?: string, genre?: string): string {
  if (explicit) { if (!THUMB_STYLES[explicit]) throw new Error(`unknown style "${explicit}" — ${Object.keys(THUMB_STYLES).join(", ")}`); return explicit; }
  const best = Object.entries(mem.styleScore).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1])[0];
  if (best && THUMB_STYLES[best[0]]) return best[0];
  return genre === "horror" ? "horror" : "roblox_render";
}

export interface ThumbPrompt { prompt: string; negative: string; style: string; format: ThumbFormat; size: string; target: { w: number; h: number }; rules: string[]; learned: { liked: string[]; disliked: string[] } }

export function buildThumbnailPrompt(brief: SceneBrief, format: ThumbFormat = "thumbnail", mem: StyleMemory = emptyStyleMemory(), style?: string, extra?: string): ThumbPrompt {
  const f = THUMB_FORMATS[format];
  if (!f) throw new Error(`unknown format "${format}" — ${Object.keys(THUMB_FORMATS).join(", ")}`);
  const genreKey = (brief.genre ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const st = pickStyle(mem, style, genreKey);
  const rules = [...(format === "thumbnail" ? BASE_RULES_THUMB : BASE_RULES_ICON)];
  const subject = brief.action ?? GENRE_RULES[genreKey] ?? "a Roblox character in an exciting moment of the game";
  const lines = [
    `${f.label} for the Roblox experience${brief.gameName ? ` "${brief.gameName}"` : ""}${brief.genre ? ` (${brief.genre})` : ""}.`,
    `Scene: ${subject}.`,
    brief.description ? `Game: ${brief.description}.` : "",
    brief.characters ? `Characters: ${brief.characters}.` : "Characters: blocky Roblox avatars with expressive faces.",
    brief.keyObjects?.length ? `Include these elements from the game: ${brief.keyObjects.slice(0, 6).join(", ")}.` : "",
    brief.palette?.length ? `Color palette based on the game: ${brief.palette.slice(0, 5).join(", ")}.` : "",
    brief.mood ? `Mood: ${brief.mood}.` : "",
    brief.lighting ? `Lighting: ${brief.lighting}.` : "",
    `Style: ${THUMB_STYLES[st]}.`,
    `Composition rules: ${rules.join("; ")}.`,
    mem.liked.length ? `This creator prefers: ${mem.liked.slice(-10).join("; ")}.` : "",
    extra ? `Extra direction: ${extra}.` : "",
    "No text or lettering anywhere in the image.",
  ].filter(Boolean);
  const negative = [...BASE_NEGATIVE, ...mem.disliked.slice(-15)].join(", ");
  return { prompt: lines.join("\n"), negative, style: st, format, size: f.gen, target: { w: f.w, h: f.h }, rules, learned: { liked: mem.liked, disliked: mem.disliked } };
}

/** Luau: collect a grounded scene brief from the open place (read-only). */
export const SCENE_BRIEF_LUAU = `	local brief = { keyObjects = {}, palette = {} }
	local okn, info = pcall(function() return game:GetService("MarketplaceService"):GetProductInfo(game.PlaceId) end)
	brief.gameName = (okn and info and info.Name) or (game.Name ~= "Game" and game.Name) or nil
	local RS = game:GetService("ReplicatedStorage")
	local d = RS:FindFirstChild("BrickwireDesign")
	if d and d:IsA("ModuleScript") then
		brief.genre = string.match(d.Source, '"genre":"([^"]+)"')
		brief.description = string.match(d.Source, '"pitch":"([^"]+)"')
	end
	local colors, sizes = {}, {}
	for _, p in ipairs(workspace:GetDescendants()) do
		if p:IsA("BasePart") and p.Transparency < 0.8 and p.Name ~= "Baseplate" then
			local key = p.Color:ToHex()
			local area = p.Size.X * p.Size.Z + p.Size.Y * p.Size.X
			colors[key] = (colors[key] or 0) + math.min(area, 4000)
		end
	end
	for _, m in ipairs(workspace:GetChildren()) do
		if m:IsA("Model") and not game:GetService("Players"):GetPlayerFromCharacter(m) then
			local ok, cf, size = pcall(function() local a, b = m:GetBoundingBox() return a, b end)
			table.insert(sizes, { name = m.Name, v = (ok and size) and size.Magnitude or 0, npc = m:FindFirstChildOfClass("Humanoid") ~= nil })
		end
	end
	table.sort(sizes, function(a, b) return a.v > b.v end)
	for i = 1, math.min(8, #sizes) do table.insert(brief.keyObjects, (string.gsub(sizes[i].name, "^BW_", ""))) end
	local arr = {}
	for k, v in pairs(colors) do table.insert(arr, { k = k, v = v }) end
	table.sort(arr, function(a, b) return a.v > b.v end)
	for i = 1, math.min(5, #arr) do table.insert(brief.palette, "#" .. arr[i].k) end
	local L = game:GetService("Lighting")
	brief.lighting = (L.ClockTime < 6 or L.ClockTime > 19) and "night scene, moonlight and glowing accents" or (L.ClockTime > 16 and "golden hour sunset" or "bright daylight")
	local npcs = 0
	for _, s in ipairs(sizes) do if s.npc then npcs += 1 end end
	if npcs > 0 then brief.characters = "the player avatar and " .. npcs .. " NPC character(s) from the game" end
	return brief`;
