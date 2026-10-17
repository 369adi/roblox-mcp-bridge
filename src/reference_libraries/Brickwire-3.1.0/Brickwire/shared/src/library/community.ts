/**
 * Community resources (panel Library → Community): the public catalogue of https://ui-resources.com plus curated links.
 * Data file: extension/public/library/community.json (built by scripts/fetch-community.ts; the panel can refresh it live).
 */
export interface CommunityItem {
  id: string;
  /** title */ t: string;
  /** author ("By X") */ a: string;
  /** description */ d: string;
  /** category: Effects, Backgrounds, Renders, Textures, Icons, Websites, Faces, Plugins, Brushes, Other, Tutorials, Sounds, Software, Components, Gfx, References, Free assets, Colour, Motion, Fonts */ c: string;
  /** tags */ g: string;
  /** preview image (https) */ i: string;
  /** direct download (https) */ dl: string;
  /** web page (https) */ w: string;
  /** source host */ s: string;
}
export interface CommunityData { source: string; fetchedAt: string; lastUpdated: string | null; count: number; items: CommunityItem[] }

export const COMMUNITY_API = "https://ui-resources.com/api/resources";
/** Hosts the extension may fetch thumbnails / the catalogue from (manifest host_permissions). */
export const COMMUNITY_HOSTS = ["ui-resources.com", "uiassets.commissiontoolz.xyz"];

const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const https = (s: unknown) => (/^https:\/\/[^\s"'<>]+$/.test(clean(s)) ? clean(s) : "");

/** Raw ui-resources.com API JSON → compact items (drops entries without an https image or page). */
export function compactCommunity(raw: unknown): CommunityItem[] {
  const list = Array.isArray(raw) ? raw : (raw as { resources?: unknown[] })?.resources;
  if (!Array.isArray(list)) throw new Error("unexpected ui-resources.com API response");
  const out: CommunityItem[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r !== "object") continue;
    const img = https(r.image), page = https(r.website_url);
    if (!img && !page) continue;
    const desc = clean(r.description);
    const by = /^by\s+(.+)$/i.exec(desc)?.[1] ?? "";
    out.push({
      id: `ur${clean(r.id)}`,
      t: clean(r.title).slice(0, 80) || "Untitled",
      a: by.slice(0, 40),
      d: by ? "" : desc.slice(0, 160),
      c: clean(r.category) || "Other",
      g: (Array.isArray(r.tags) ? r.tags : []).map(clean).filter((x) => x && x !== "Undefined").join(", ").slice(0, 80),
      i: img,
      dl: https(r.download_url),
      w: page,
      s: "ui-resources.com",
    });
  }
  return out;
}

const X = (id: string, t: string, c: string, d: string, w: string, g: string): CommunityItem => ({ id: `x_${id}`, t, a: "", d, c, g, i: "", dl: "", w, s: new URL(w).hostname.replace(/^www\./, "") });
/** Curated extra resources / references (links only). */
export const CURATED: CommunityItem[] = [
  X("gameuidb", "Game UI Database", "References", "Thousands of screenshots of real game UI, filterable by screen type (inventory, shop, HUD…) — the best place for UI references.", "https://www.gameuidatabase.com/", "ui reference hud menu inventory"),
  X("interfaceingame", "Interface In Game", "References", "Video/screenshot library of game interfaces and UI animations.", "https://interfaceingame.com/", "ui reference animation"),
  X("mobbin", "Mobbin", "References", "Library of real mobile app screens and flows (clean, modern layouts).", "https://mobbin.com/", "ui reference mobile"),
  X("dribbble_gameui", "Dribbble — Game UI", "References", "Concept shots of game interfaces (stylised, simulator, RPG).", "https://dribbble.com/search/game-ui", "ui reference concept"),
  X("behance_gameui", "Behance — Game UI", "References", "Full UI case studies from game artists.", "https://www.behance.net/search/projects/game%20ui", "ui reference case study"),
  X("pinterest_robloxui", "Pinterest — Roblox UI", "References", "Mood boards of Roblox simulator/cartoon UI.", "https://www.pinterest.com/search/pins/?q=roblox%20ui", "ui reference roblox"),
  X("kenney", "Kenney assets (CC0)", "Free assets", "Huge CC0 packs: UI packs, icons, game sprites, sounds — free for commercial use.", "https://kenney.nl/assets", "ui icons sounds cc0"),
  X("gameicons", "game-icons.net (CC BY 3.0)", "Free assets", "4000+ game icons as SVG/PNG, any colour; credit the authors.", "https://game-icons.net/", "icons svg"),
  X("lucide", "Lucide icons (ISC)", "Free assets", "Clean outline UI icons (settings, close, shop…) as SVG/PNG.", "https://lucide.dev/icons/", "icons outline"),
  X("creatorstore", "Roblox Creator Store", "Free assets", "Official Roblox store: free images/decals, meshes, audio, plugins (check the creator before using models).", "https://create.roblox.com/store", "roblox decals audio models"),
  X("polyhaven", "Poly Haven (CC0)", "Free assets", "CC0 textures and HDRIs — good for SurfaceAppearance / MaterialVariant textures.", "https://polyhaven.com/textures", "textures pbr cc0"),
  X("lospec", "Lospec palettes", "Colour", "Curated colour palettes (pixel/retro styles and more).", "https://lospec.com/palette-list", "palette colour"),
  X("coolors", "Coolors", "Colour", "Palette generator — lock colours, export hex codes for BW.style / palette=.", "https://coolors.co/", "palette colour generator"),
  X("realtimecolors", "Realtime Colors", "Colour", "Preview a palette on a real layout; checks contrast.", "https://www.realtimecolors.com/", "palette contrast"),
  X("easings", "easings.net", "Motion", "Visual cheat sheet of easing curves (match them to Enum.EasingStyle).", "https://easings.net/", "tween easing animation"),
  X("googlefonts", "Google Fonts", "Fonts", "Try pairings of fonts that also exist in Roblox (Fredoka One, Luckiest Guy, Bangers, Oswald, Montserrat…).", "https://fonts.google.com/", "fonts typography"),
  X("freesound", "Freesound", "Sounds", "Free sound effects (check each licence); upload via the Asset Manager.", "https://freesound.org/", "sounds sfx"),
  X("devforum_ui", "DevForum — UI design", "Tutorials", "Community guides on Roblox UI design, scaling and tweening.", "https://devforum.roblox.com/tag/ui", "tutorial ui roblox"),
  X("roblox_ui_docs", "Roblox docs — UI", "Tutorials", "Official docs: layouts, constraints, UIGradient, UIStroke, safe areas.", "https://create.roblox.com/docs/ui", "docs ui"),
  X("roblox_vfx_docs", "Roblox docs — Particle emitters", "Tutorials", "Official docs for ParticleEmitter, Beam, Trail and flipbooks.", "https://create.roblox.com/docs/effects/particle-emitters", "docs vfx particles"),
  X("roblox_camera_docs", "Roblox docs — Camera", "Tutorials", "Official camera scripting docs (Scriptable camera, CFrame.lookAt, FieldOfView).", "https://create.roblox.com/docs/workspace/camera", "docs camera cutscene"),
];

export function communityData(raw: unknown, fetchedAt = new Date().toISOString()): CommunityData {
  const items = [...compactCommunity(raw), ...CURATED];
  return { source: COMMUNITY_API, fetchedAt, lastUpdated: (raw as { lastUpdated?: string })?.lastUpdated ?? null, count: items.length, items };
}

/** Image-like categories that end up as rbxassetid images in the game. */
const IMAGE_CATS = /^(effects|backgrounds|renders|textures|icons|faces|brushes|gfx|components)$/i;

/** Task text for "Use in my game" / "Make something inspired by it" on a community resource. */
export function communityTask(it: CommunityItem, mode: "use" | "inspired", assetId = "", notes = ""): string {
  const extra = notes.trim() ? `\nMy notes: ${notes.trim()}` : "";
  const where = [it.w && `page ${it.w}`, it.dl && `file ${it.dl}`, !it.dl && it.i && `image ${it.i}`].filter(Boolean).join(", ");
  const head = `Community resource "${it.t}"${it.a ? ` by ${it.a}` : ""} (${it.c}${it.g ? `: ${it.g}` : ""}; from ${it.s}${where ? `; ${where}` : ""}).`;
  const id = assetId.trim().replace(/^rbxassetid:\/\//, "");
  if (mode === "inspired") {
    return `${head} Use it as a VISUAL REFERENCE only: describe its look in numbers (palette as hex, shapes, proportions, mood), then build my own version with the BW helpers (BW.style / BW.ui* components for UI, BrickwireVFX layers for effects) — no copying, no image upload needed. Verify (BW.uiCheck / BW.fxCheck) and show what you made.${extra}`;
  }
  if (IMAGE_CATS.test(it.c) || /^sounds$/i.test(it.c)) {
    const kind = /^sounds$/i.test(it.c) ? "Sound (SoundId)" : /^textures$/i.test(it.c) ? "Texture/Decal or ImageLabel (ScaleType Tile)" : /^effects$/i.test(it.c) ? "ImageLabel overlay in the UI, or a ParticleEmitter Texture for 3D" : /^backgrounds$/i.test(it.c) ? "full-screen ImageLabel behind the menu (ScaleType Crop, ZIndex lowest)" : "ImageLabel / ImageButton";
    const asset = id
      ? `Its Roblox asset id is ${id} — use "rbxassetid://${id}".`
      : `It needs a Roblox asset id first. If the Studio tools include an image-upload tool, upload ${it.dl || it.i} with it and use the returned id. Otherwise do NOT invent an id: build everything with the image slot ready (attribute BW_AssetNeeded="${it.t}") and tell me to download the file, import it in Studio (View → Asset Manager → Bulk Import) and paste the rbxassetid back to you.`;
    return `${head} Put it into my game as a ${kind} where it fits (ask me only if the place is unclear). ${asset} Respect the author's terms; credit "${it.a || it.s}" if required. Then verify (BW.uiCheck / BW.fxCheck) and tell me exactly what you changed.${extra}`;
  }
  if (/^plugins$|^software$/i.test(it.c)) return `${head} This is a tool, not an in-game asset. Explain briefly what it does and how it would help in my project, then do the same job with the BW helpers if possible.${extra}`;
  return `${head} This is a reference / guide. Use its ideas for my game: summarise the key rules that apply, then apply them (for UI: BW.style + BW.ui* components; for effects: BrickwireVFX; for cameras: BrickwireCinema) and verify.${extra}`;
}
