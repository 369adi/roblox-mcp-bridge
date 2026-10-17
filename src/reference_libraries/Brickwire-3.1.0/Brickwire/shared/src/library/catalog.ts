/**
 * Brickwire resource library catalog — the single source of truth for the system prompt (RESOURCE LIBRARY),
 * the panel's Library tab and BW.kits() inside Studio. Every id here has a Luau implementation in bw-library.luau
 * (checked by tests).
 */
import { ICONS, ICON_IDS } from "./icons.js";

export type KitKind = "build" | "furniture" | "gameplay" | "ui" | "style" | "vfx" | "anim";

export interface KitInfo {
  id: string;
  kind: KitKind;
  name: string;
  nameRu: string;
  desc: string;
  /** options besides the universal At / Facing / Name / Parent / palette */
  opts: string;
  tags: string;
}

export const KIND_LABELS: Record<KitKind | "icon", { en: string; ru: string }> = {
  build: { en: "Buildings", ru: "Постройки" },
  furniture: { en: "Furniture", ru: "Мебель" },
  gameplay: { en: "Gameplay", ru: "Геймплей" },
  ui: { en: "UI", ru: "Интерфейс" },
  style: { en: "UI styles", ru: "Стили UI" },
  vfx: { en: "Effects", ru: "Эффекты" },
  anim: { en: "Animated", ru: "Анимация" },
  icon: { en: "Icons", ru: "Иконки" },
};

const k = (id: string, kind: KitKind, name: string, nameRu: string, desc: string, opts = "", tags = ""): KitInfo => ({ id, kind, name, nameRu, desc, opts, tags });

export const KITS: KitInfo[] = [
  // buildings
  k("cottage", "build", "Cottage", "Домик", "medieval cottage 20x16: door, 5 windows, gable roof, chimney, porch", "width depth height", "house home medieval village"),
  k("modern_house", "build", "Modern house", "Современный дом", "2-storey modern house with stairs inside, balcony with glass rail, driveway, hedges", "width depth floors", "house villa city"),
  k("tower", "build", "Stone tower", "Каменная башня", "round cobblestone tower with merlons, door and flag", "height diameter Color", "castle medieval fort"),
  k("castle_wall", "build", "Castle wall", "Крепостная стена", "crenellated wall segment with walkway and optional gate", "length height Color gate", "castle fort medieval"),
  k("market_stall", "build", "Market stall", "Рыночный прилавок", "wooden stall with striped awning, counter and crates", "Color", "shop market village"),
  k("well", "build", "Well", "Колодец", "stone well with roof, crank and bucket", "", "village medieval water"),
  k("bridge", "build", "Bridge", "Мост", "wooden plank bridge with rails and posts", "length width deckHeight", "river path"),
  k("lamp_post", "build", "Lamp post", "Фонарь", "street lamp with warm PointLight", "height LightColor", "street city light park"),
  k("bench", "build", "Bench", "Скамейка", "park bench with seat (sittable)", "Color", "park street"),
  k("campfire", "build", "Campfire", "Костёр", "stones + logs + fire/smoke particles + flickering light", "", "camp forest fire"),
  k("fountain", "build", "Fountain", "Фонтан", "round stone fountain with water and spray particles", "radius", "park plaza city"),
  k("watchtower", "build", "Watchtower", "Сторожевая вышка", "wooden tower on 4 legs with ladder, platform, rails and roof", "height", "fort camp military"),
  k("skyscraper", "build", "Skyscraper", "Небоскрёб", "multi-storey glass tower (BW.building) with lobby door and roof details", "floors width depth", "city tower office"),
  k("shop_building", "build", "Shop building", "Магазин", "shop with big front windows, awning and lit sign (SurfaceGui)", "width depth title", "store city street"),
  k("house_plan", "build", "House from plan", "Дом по плану", "single-storey house from an ASCII floor plan (rooms, doors, windows) + roof", "plan", "house rooms layout floorplan"),
  k("park", "build", "Park", "Парк", "grass square with paths, fountain, benches, lamps and trees", "size trees seed", "city nature plaza"),
  k("barn", "build", "Barn", "Амбар", "red barn with big doors, gable roof, hay bales and fence", "", "farm village"),
  // furniture
  k("table", "furniture", "Table", "Стол", "wooden table", "width depth Color", "interior dining office"),
  k("chair", "furniture", "Chair", "Стул", "chair with Seat (sittable)", "Color", "interior dining"),
  k("bed", "furniture", "Bed", "Кровать", "bed with pillow and blanket", "Color Accent", "bedroom interior"),
  k("bookshelf", "furniture", "Bookshelf", "Книжный шкаф", "shelf with random coloured books", "Color seed", "library office interior"),
  k("sofa", "furniture", "Sofa", "Диван", "3-seat sofa (sittable)", "Color", "living interior"),
  k("kitchen", "furniture", "Kitchen counter", "Кухня", "counter with sink, stove and cabinets", "length", "kitchen interior"),
  k("floor_lamp", "furniture", "Floor lamp", "Торшер", "floor lamp with soft light", "", "interior light"),
  k("rug", "furniture", "Rug", "Ковёр", "rug with border", "Color Accent", "interior"),
  k("potted_plant", "furniture", "Potted plant", "Растение в горшке", "pot with leafy plant", "", "interior decor"),
  k("tv", "furniture", "TV", "Телевизор", "TV on a stand with glowing screen", "", "living interior"),
  // gameplay
  k("obby", "gameplay", "Obby course", "Обби (паркур)", "complete obby: start, N stages with checkpoints (SpawnLocation), jumps, kill strips, jump pads, finish + scripts", "stages", "parkour obstacle course checkpoint"),
  k("kill_bricks", "gameplay", "Kill bricks", "Убивающие блоки", "row of neon kill bricks with server script", "count", "obby trap lava"),
  k("lava_floor", "gameplay", "Lava floor", "Лавовый пол", "lava pool with safe platforms to jump across", "size platforms", "obby trap"),
  k("jump_pad", "gameplay", "Jump pad", "Батут", "pad that launches the player up", "power Color", "obby launch"),
  k("speed_pad", "gameplay", "Speed pad", "Ускоритель", "pad that gives temporary speed boost", "speed time Color", "boost obby race"),
  k("teleporter", "gameplay", "Teleporter pair", "Телепорт", "two linked pads with cooldown", "distance", "portal travel"),
  k("coins", "gameplay", "Collectible coins", "Монетки", "spinning coins in a line or ring; touch → leaderstats Coins, respawn", "count shape(line|ring) radius value respawn", "collect currency simulator"),
  k("spawn_area", "gameplay", "Spawn area", "Зона спавна", "spawn platform with SpawnLocation, sign and rails", "size Color title", "lobby start"),
  k("round_system", "gameplay", "Round system", "Система раундов", "lobby ↔ arena rounds: intermission, teleports, timer, winner gets Wins (RoundStatus value for UI)", "intermission roundTime minPlayers arenaDistance", "minigame pvp match"),
  k("saved_stats", "gameplay", "Saved stats", "Сохранение данных", "leaderstats + DataStore save/load with retries, autosave and BindToClose", "stats store", "datastore save progress"),
  k("day_night", "gameplay", "Day/night cycle", "Смена дня и ночи", "Lighting ClockTime cycle script", "minutes", "lighting time sky"),
  k("npc_dialog", "gameplay", "NPC with dialog", "NPC с диалогом", "NPC rig + ProximityPrompt + dialog UI with lines", "lines title style", "quest talk shopkeeper"),
  // ui
  k("hud", "ui", "HUD", "HUD", "coins pill with icon + plus button (leaderstats, bump on change, 12.5K format) + health bar", "stat style", "hud stats coins health"),
  k("shop", "ui", "Shop", "Магазин (UI)", "side shop button + window with rarity item cards, price chips, server-validated purchase (RemoteFunction)", "items title currency style", "store buy gamepass"),
  k("inventory", "ui", "Inventory", "Инвентарь", "inventory button + grid window with slots", "slots style", "items backpack"),
  k("main_menu", "ui", "Main menu", "Главное меню", "full-screen menu: gradient backdrop with rays, big outlined title, Play / Shop / Settings", "title subtitle style", "start menu lobby"),
  k("dialog", "ui", "Dialog box", "Окно диалога", "bottom dialog box with speaker name, text and Next", "style", "talk npc story"),
  k("notifications", "ui", "Notifications", "Уведомления", "toast notifications (Notify RemoteEvent from server)", "style", "toast alert message"),
  k("settings", "ui", "Settings", "Настройки", "settings window with animated switches (music, sfx, shadows…)", "toggles style", "options"),
  k("loading_screen", "ui", "Loading screen", "Экран загрузки", "loading screen with progress bar and tips", "title tip style", "intro loading"),
  k("daily_reward", "ui", "Daily reward", "Ежедневная награда", "gift button + window, claim once per 24h (DataStore, server-validated)", "amount currency style", "reward bonus retention"),
  k("ui_showcase", "ui", "Style showcase", "Витрина стиля", "one screen with every component of a style: currency pills, side buttons, window, rarity cards, XP bar, switch, buttons", "style title", "style theme design components"),
  k("timer_bar", "ui", "Round timer", "Таймер раунда", "top timer that shows RoundStatus text", "style", "round countdown"),
  // UI styles (each = ui_showcase in that style)
  k("style_simulator", "style", "Simulator UI", "Стиль: Симулятор", "bright bubbly simulator look: thick dark outlines, glossy 3D buttons, FredokaOne (like Pet Simulator 99, Bee Swarm) — use style=\"simulator\" in any UI kit / BW.ui* component", "title", "style theme simulator"),
  k("style_cartoon", "style", "Cartoon UI", "Стиль: Мультяшный", "warm cartoon: chunky LuckiestGuy text, orange/yellow, very thick outlines (like Adopt Me) — use style=\"cartoon\" in any UI kit / BW.ui* component", "title", "style theme cartoon"),
  k("style_anime", "style", "Anime UI", "Стиль: Аниме", "anime action: dark navy, magenta→violet gradients, slanted headers, Bangers titles (like Anime Defenders, Blox Fruits) — use style=\"anime\" in any UI kit / BW.ui* component", "title", "style theme anime"),
  k("style_glass", "style", "Glass UI", "Стиль: Стекло", "glassmorphism: translucent dark panels, hairline light strokes, soft corners — use style=\"glass\" in any UI kit / BW.ui* component", "title", "style theme glass"),
  k("style_neon", "style", "Neon sci-fi UI", "Стиль: Неон / sci-fi", "sci-fi neon: near-black, cyan glow outlines, Michroma titles, sharp corners — use style=\"neon\" in any UI kit / BW.ui* component", "title", "style theme neon"),
  k("style_fantasy", "style", "Fantasy RPG UI", "Стиль: Фэнтези RPG", "fantasy RPG: parchment panels, dark wood outlines, gothic titles, red ribbon — use style=\"fantasy\" in any UI kit / BW.ui* component", "title", "style theme fantasy"),
  k("style_minimal", "style", "Minimal UI", "Стиль: Минимализм", "clean minimal: white cards, grey hairlines, one accent colour — use style=\"minimal\" in any UI kit / BW.ui* component", "title", "style theme minimal"),
  k("style_dark", "style", "Modern dark UI", "Стиль: Тёмный модерн", "modern dark: blue-grey panels, subtle gradients, blue accent — use style=\"dark\" in any UI kit / BW.ui* component", "title", "style theme dark"),
  k("style_candy", "style", "Candy pastel UI", "Стиль: Пастель / kawaii", "kawaii pastel: pink/mint/lilac, bubbly FredokaOne, soft pink outlines — use style=\"candy\" in any UI kit / BW.ui* component", "title", "style theme candy"),
  k("style_pixel", "style", "Pixel retro UI", "Стиль: Пиксель-ретро", "retro pixel: square corners, Arcade font, hard black outlines, 8-bit palette — use style=\"pixel\" in any UI kit / BW.ui* component", "title", "style theme pixel"),
  k("style_horror", "style", "Horror UI", "Стиль: Хоррор", "horror: near-black, dried-blood red, Creepster titles (like Doors, Piggy) — use style=\"horror\" in any UI kit / BW.ui* component", "title", "style theme horror"),
  k("style_tactical", "style", "Tactical shooter UI", "Стиль: Тактический шутер", "tactical shooter: dark olive glass, amber lines, Oswald caps (like Frontlines, Arsenal) — use style=\"tactical\" in any UI kit / BW.ui* component", "title", "style theme tactical"),
  k("style_luxury", "style", "Luxury gold UI", "Стиль: Люкс / золото", "luxury / royal: black and gold, serif titles, thin gold outlines — use style=\"luxury\" in any UI kit / BW.ui* component", "title", "style theme luxury"),
  // vfx
  k("portal", "vfx", "Portal", "Портал", "glowing ring portal with swirl particles and light", "radius Color", "magic gate teleport"),
  k("magic_circle", "vfx", "Magic circle", "Магический круг", "glowing rune circle on the ground, rotating, with sparkles", "radius Color", "magic spell"),
  k("torch", "vfx", "Torch", "Факел", "wall/stand torch with fire, smoke and flickering light", "", "fire medieval dungeon"),
  k("crystals", "vfx", "Crystals", "Кристаллы", "cluster of neon crystals with glow", "count Color seed", "cave magic gem"),
  k("waterfall", "vfx", "Waterfall", "Водопад", "rock cliff with falling water, mist and pool", "height", "nature water"),
  k("rain", "vfx", "Rain", "Дождь", "rain that follows the camera (LocalScript)", "", "weather storm"),
  k("snow", "vfx", "Snow", "Снег", "snowfall that follows the camera (LocalScript)", "", "weather winter"),
  k("fireflies", "vfx", "Fireflies", "Светлячки", "floating glowing fireflies over an area", "size", "night nature magic"),
  k("player_aura", "vfx", "Player aura", "Аура игрока", "sparkle aura attached to every player's character", "Color", "effect vip"),
  k("fx_explosion", "vfx", "Explosion FX", "VFX: Взрыв", "fireball core, shockwave ring, smoke, embers, debris, light flash, camera shake — BrickwireVFX preset \"explosion\" (demo pad loops it in Play; in code VFX.play(\"explosion\", cf))", "every scale", "vfx effect bomb blast boom"),
  k("fx_hit_spark", "vfx", "Hit spark FX", "VFX: Искры удара", "fast white-blue impact sparks + flash for melee/gun hits — BrickwireVFX preset \"hit_spark\" (demo pad loops it in Play; in code VFX.play(\"hit_spark\", cf))", "every scale", "vfx effect impact combat"),
  k("fx_slash", "vfx", "Slash FX", "VFX: Взмах клинка", "curved neon slash arc with trailing sparks — BrickwireVFX preset \"slash\" (demo pad loops it in Play; in code VFX.play(\"slash\", cf))", "every scale", "vfx effect sword melee combat"),
  k("fx_shockwave", "vfx", "Shockwave FX", "VFX: Ударная волна", "expanding ForceField ring + dust ring — BrickwireVFX preset \"shockwave\" (demo pad loops it in Play; in code VFX.play(\"shockwave\", cf))", "every scale", "vfx effect impact wave"),
  k("fx_lightning", "vfx", "Lightning FX", "VFX: Молния", "branching neon bolt from the sky + flash + sparks — BrickwireVFX preset \"lightning\" (demo pad loops it in Play; in code VFX.play(\"lightning\", cf))", "every scale", "vfx effect storm magic thunder"),
  k("fx_magic_burst", "vfx", "Magic burst FX", "VFX: Магический взрыв", "purple-pink arcane burst: sphere shell, sparkles, glow — BrickwireVFX preset \"magic_burst\" (demo pad loops it in Play; in code VFX.play(\"magic_burst\", cf))", "every scale", "vfx effect spell magic"),
  k("fx_heal", "vfx", "Heal FX", "VFX: Лечение", "green rising sparkles, ring and soft light — BrickwireVFX preset \"heal\" (demo pad loops it in Play; in code VFX.play(\"heal\", cf))", "every scale", "vfx effect buff health"),
  k("fx_level_up", "vfx", "Level up FX", "VFX: Новый уровень", "golden pillar of light, rays, confetti sparks — BrickwireVFX preset \"level_up\" (demo pad loops it in Play; in code VFX.play(\"level_up\", cf))", "every scale", "vfx effect reward levelup"),
  k("fx_ground_slam", "vfx", "Ground slam FX", "VFX: Удар о землю", "dust ring, rock debris, shockwave, shake — BrickwireVFX preset \"ground_slam\" (demo pad loops it in Play; in code VFX.play(\"ground_slam\", cf))", "every scale", "vfx effect impact stomp"),
  k("fx_ice_shatter", "vfx", "Ice shatter FX", "VFX: Ледяной взрыв", "ice shards debris, frost puff, cold light — BrickwireVFX preset \"ice_shatter\" (demo pad loops it in Play; in code VFX.play(\"ice_shatter\", cf))", "every scale", "vfx effect frost freeze"),
  k("fx_teleport", "vfx", "Teleport FX", "VFX: Телепорт", "cyan-blue pillar + implosion + sparkles — BrickwireVFX preset \"teleport\" (demo pad loops it in Play; in code VFX.play(\"teleport\", cf))", "every scale", "vfx effect portal blink"),
  k("fx_confetti", "vfx", "Confetti FX", "VFX: Конфетти", "colourful confetti burst for wins/rewards — BrickwireVFX preset \"confetti\" (demo pad loops it in Play; in code VFX.play(\"confetti\", cf))", "every scale", "vfx effect celebrate win"),
  k("fx_vortex", "vfx", "Vortex FX", "VFX: Вихрь", "dark-purple swirling vortex with implosion — BrickwireVFX preset \"vortex\" (demo pad loops it in Play; in code VFX.play(\"vortex\", cf))", "every scale", "vfx effect void portal magic"),
  k("fx_fire_burst", "vfx", "Fire burst FX", "VFX: Огненный взрыв", "burst of flame, embers and heat light — BrickwireVFX preset \"fire_burst\" (demo pad loops it in Play; in code VFX.play(\"fire_burst\", cf))", "every scale", "vfx effect fire flame"),
  // anim
  k("cinematic_intro", "anim", "Cinematic intro", "Кинематографичное интро", "camera fly-through on join: fly-in → orbit → hero push-in → crane reveal, letterbox, fades, Skip button (BrickwireCinema); target= any model/part", "target style(intro|showcase|epic|boss|trailer) dof", "cutscene camera flythrough intro trailer"),
  k("cutscene_trigger", "anim", "Cutscene trigger", "Катсцена по триггеру", "glowing pad: touching it plays a camera cutscene (once per player by default)", "target style size once", "cutscene camera boss reveal"),
  k("menu_camera", "anim", "Menu camera", "Камера меню", "slow looping orbit behind the main menu until the player presses Play (attribute InMenu=false)", "radius height time", "menu camera background orbit"),
  k("case_opening", "anim", "Case opening", "Открытие кейса", "CS-style case: card strip decelerates onto the SERVER-rolled reward (Cutscene.roll), rarity frames, ticks, flash, reward card + Claim; Anime Dice look (BrickwireCutscene)", "pool price currency title style(animedice|clean)", "cutscene gacha case crate loot reward rarity"),
  k("egg_hatch", "anim", "Egg hatch", "Вылупление яйца", "egg stand with Hatch / Hatch x3: push-in, growing wobbles, cracks, flash, pet pops out with rarity glow/particles, name + rarity (server rolls)", "pool price currency eggColor style", "cutscene egg pet hatch gacha simulator"),
  k("dice_roll", "anim", "Dice roll (Anime Dice)", "Бросок кубика (Anime Dice)", "ROLL/AUTO buttons → server rolls a unit (\"1 in N\" odds, mutations Silver/Gold/Huge/Titanic) → ticker above the head cycles fast→slow, Epic+ gets a screen reveal, Mythic+ a fake ending", "pool mutations cooldown price style", "cutscene dice rng roll anime gacha rarity"),
  k("event_start", "anim", "Event start", "Начало ивента", "event zone + server: countdown 3-2-1, letterbox, fly-over of the zone, \"EVENT STARTED!\" for all players; start via script attribute Start or every N s", "zone title every duration style", "cutscene event countdown announcement"),
  k("story_intro", "anim", "Story intro", "Предыстория", "back-story on first join only (DataStore): 3–6 shots with typed voice-over subtitles, dips to black, music, title, Skip", "target lines speaker title sub style", "cutscene story intro lore prologue"),
  k("elevator", "anim", "Elevator", "Лифт", "moving platform elevator with shaft", "height period", "lift platform"),
  k("windmill", "anim", "Windmill", "Мельница", "windmill with spinning blades", "height speed", "farm village"),
  k("ferris_wheel", "anim", "Ferris wheel", "Колесо обозрения", "spinning ferris wheel with cabins", "radius cabins speed", "amusement park"),
  k("guard_npc", "anim", "Patrolling guard", "Патрульный NPC", "NPC rig walking a patrol route", "points speed title", "npc guard patrol"),
  k("dancer_npc", "anim", "Dancing NPC", "Танцующий NPC", "NPC rig playing a looped dance", "dance title", "npc party"),
  k("auto_door", "anim", "Automatic door", "Автодверь", "sliding glass door that opens when a player approaches", "", "door shop"),
  k("flag", "anim", "Waving flag", "Флаг", "flag on a pole with waving cloth", "Color", "decor castle"),
];

export const KIT_BY_ID: Record<string, KitInfo> = Object.fromEntries(KITS.map((x) => [x.id, x]));

export function kitsOf(kind: KitKind): KitInfo[] {
  return KITS.filter((x) => x.kind === kind);
}

/** Luau table literal for BW._kitInfo (generated into the library prelude). */
export function kitInfoToLuau(): string {
  const q = (s: string) => JSON.stringify(s);
  return "BW._kitInfo = {" + KITS.map((x) => `${x.id}={kind=${q(x.kind)},desc=${q(x.desc)},opts=${q(x.opts)}}`).join(",") + "}";
}

/** Compact catalog for the system prompt. */
export function catalogForPrompt(kinds?: KitKind[]): string {
  const lines: string[] = [];
  for (const kind of Object.keys(KIND_LABELS) as (KitKind | "icon")[]) {
    if (kind === "icon") continue;
    if (kinds && !kinds.includes(kind)) continue;
    const list = kitsOf(kind).map((x) => (x.opts ? `${x.id}(${x.opts})` : x.id));
    lines.push(`${KIND_LABELS[kind].en}: ${list.join(", ")}`);
  }
  if (!kinds || kinds.includes("ui")) lines.push(`Icons (BW.icon): ${ICON_IDS.join(", ")}`);
  return lines.join("\n");
}

export { ICONS, ICON_IDS };
