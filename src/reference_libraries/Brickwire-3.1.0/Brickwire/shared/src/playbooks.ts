import type { AgentCategory } from "./protocol.js";
import { catalogForPrompt, type KitKind } from "./library/catalog.js";

/**
 * Agent know-how. The model cannot be retrained, so skill comes from three things the prompt gives it:
 *  1. the BW helper library (short, validated Luau — shared/src/bw-helpers.luau),
 *  2. a playbook per category (workflow, Roblox rules, pitfalls),
 *  3. a mandatory verification step per category before DONE.
 */

/** BW API reference lines, tagged by topic so each category only gets what it needs (keeps prompts short). */
const BW_API_LINES: Array<[string, string]> = [
  ["all", `Paths & checks: BW.find(path) → inst|nil · BW.get(path) → inst or error · BW.exists(path) · BW.tree(path, depth) prints the hierarchy · BW.report(path) (counts, size, minY) · BW.check(cond, "msg")`],
  ["all", `Building: BW.model(name[, parent]) → new Model, becomes default parent; re-running replaces ONLY the agent's previous model`],
  ["all", `  BW.part{Name=, Size={x,y,z}, Position={x,y,z}, Color="#hex"|"Bright red"|{r,g,b}, Material="Wood", Class="WedgePart", Anchored=true(default), Transparency=, Orientation={x,y,z}, Parent=}`],
  ["all", `  BW.new(className, {props…, Parent=}) for any class · BW.set(inst, {props}) · BW.folder(name, parent) · BW.weldAll(model, unanchor)`],
  ["all", `  placement keys for any part: At={x,y,z} = bottom-center (stands on that point) · From={x1,y1,z1}, To={x2,y2,z2} = opposite corners (BW.block)`],
  ["build", `Building kit: BW.room{At=, Size={w,h,d}, doors={{side="front"|"back"|"left"|"right", offset=0, width=4, height=7}}, windows={{side=, width=4, height=3, bottom=3}}, Color=, Material=, FloorColor=, ceiling=false}`],
  ["build", `  BW.wall({x,z}|{x,y,z}, {x,z}, {height=10, thickness=1, y=0, openings={{offset=0, width=4, height=7, bottom=0, glass=true}}}) · BW.roof{At={x,wallTopY,z}, Size={w,d}, style="gable"|"shed"|"flat", height=5, overhang=1, ridge="X"|"Z"}`],
  ["build", `  BW.stairs{From=, dir="+Z"|"-Z"|"+X"|"-X", steps=, rise=1, run=1.5, width=4} · BW.fence(a, b, {height=4, spacing=4}) · BW.cylinder{At=, height=, diameter=, axis="Y"} · BW.plant{At=, style="oak"|"pine"|"palm"|"bush", height=}`],
  ["build", `  BW.array(n, {dx,dy,dz}, function(i, offset) … end) · BW.ring(n, radius, center, function(i, pos, angleDeg) … end) · BW.palette(name) → {wall, wallMat, roof, roofMat, floor, floorMat, trim, trimMat, accent, glass}`],
  ["build", `Building v2: BW.floorplan({"#######", "#..W..#", "#.....#", "###D###"}, {At=, cell=2, height=10, palette=}) ASCII plan: # wall, D door, W window, . floor, space = nothing; row 1 = back (-Z) → rooms in one call`],
  ["build", `  BW.building{At=, Size={w,d}, floors=3, floorHeight=12, palette=, windows=3, windowWidth=4, roof="flat"|"gable"|"shed"|"none", stairs=true} multi-storey shell with slabs, stair holes, stairs, door, trims, roof; attribute BW_Top`],
  ["build", `  BW.path({{x,z},{x,z},…}, {width=4, Material="Cobblestone"}) · BW.scatter({From={x,z}, To={x,z}}, n, function(i, pos, rnd) … end, {seed=1, minDist=6, avoid={paths}}) · BW.column{At=, height=, diameter=} · BW.arch({x,z}, {x,z}, {y=, thickness=1, depth=2}) · BW.rng(seed)`],
  ["build", `  BW.inspect(path) → build QA (floating / below ground / overlapping / loose parts) · BW.ground(path[, y]) · BW.move(path, {dx,dy,dz}) · BW.place(path, {x,y,z}) · BW.groundY()`],
  ["scripts", `Scripts: BW.script("Script"|"LocalScript"|"ModuleScript", name, parent|nil, [==[ source ]==]) creates or updates (default parents: ServerScriptService / StarterPlayer.StarterPlayerScripts / ReplicatedStorage)`],
  ["scripts", `  BW.lint([path]) static check of one/all scripts: deprecated APIs, wrong script type/location, loops without wait, unvalidated remotes, DataStore without pcall/BindToClose, Touched without debounce`],
  ["scripts", `  BW.source(path[, from, to]) prints numbered lines · BW.patch(path, "old text", "new text") exact replace · BW.scan("text") finds text in all scripts · BW.remote(name[, "RemoteFunction"]) in ReplicatedStorage.Remotes`],
  ["ui", `UI QA: BW.uiCheck(screen) checks desktop 1366×768 + phone 390×844 (off-screen, cut-off, tiny text, low contrast, small buttons, buttons without a script) · icons: BW.icon(parent, "coin"|"gem"|"heart"|…, {Size=, Position=, Color=}) (vector, no upload)`],
  ["ui", `UI: BW.screen(name) → ScreenGui in StarterGui · BW.ui(class, {Parent=, Size={xs,xo,ys,yo}|{xs,ys}, Position=…, BackgroundColor3="#hex", Text=, Corner=8, Stroke={"#hex",2}, Padding=8, List={Padding=6, Direction="Vertical"}, Gradient={"#a","#b"}, Aspect=1})`],
  ["uistyle", `UI styles: BW.style(name) → {bg, panel, text, accent, good, bad, font, title, corner, stroke…}; styles: simulator cartoon anime glass neon fantasy minimal dark candy pixel horror tactical luxury (BW.styles() lists them)`],
  ["uistyle", `  components (all take {style=, Size=, Position=, AnchorPoint=, Name=}): BW.uiWindow(gui, {title=, header="ribbon"|"slant"|"bar"|"plain", close=true}) → window, top · BW.uiButton(parent, text, {color=, icon=, variant="primary"|"secondary"|"danger"}) 3D glossy · BW.uiIconButton(parent, icon, {badge=}) · BW.uiPanel · BW.uiTitle · BW.uiBar(parent, {value=0.6, label=}) · BW.uiPill(parent, {icon="coin", amount="1.2K", plus=true}) · BW.uiCard(parent, {title=, icon=, rarity="common"…"secret", price=}) · BW.uiToggle(parent, {on=true, label=}) · BW.uiRays(parent) · BW.uiBackdrop(gui) · BW.uiJuice(gui) (hover/press bounce, window pop, toggle anims — call once per ScreenGui)`],
  ["vfx", `VFX library: BW.vfx(preset, {x,y,z}) → demo pad that loops the preset in Play + installs ReplicatedStorage.BrickwireVFX · BW.vfxPreview(preset, {x,y,z}) plays it NOW in edit (for screen_capture) · presets: ${"explosion hit_spark slash shockwave lightning magic_burst heal level_up dash ground_slam smoke_puff confetti pickup ice_shatter teleport fire_burst poison vortex"}`],
  ["vfx", `  in game scripts: local VFX = require(ReplicatedStorage.BrickwireVFX); VFX.play(preset, cframe|part|position, {color=, scale=, shake=}) · VFX.bolt(a, b, {color=}) · VFX.flash(model) · VFX.trail(part) · VFX.shake(amp, time) (client) — hits/impacts: play on the CLIENT via a RemoteEvent`],
  ["vfx", `VFX QA: BW.fxCheck(target) → emitter rates, lifetimes, lights, beams/trails attachments, totals`],
  ["vfx", `VFX: BW.particles(part, "fire"|"smoke"|"sparkles"|"magic"|"dust", {overrides}) · BW.light(part, "PointLight"|"SpotLight", {Color=, Range=, Brightness=})`],
  ["anim", `Animation (objects): BW.animate(partOrModel, "spin"|"bob"|"hover"|"swing"|"wobble"|"slide"|"pulse"|"blink", {speed=deg/s, height=, period=s, angle=, axis="X"|"Y"|"Z", hinge={x,y,z}, offset={x,y,z}, scale=}) · BW.door(part, {mode="swing"|"slide", hinge="left"|"right", angle=90, time=0.6, autoClose=4, offset={x,y,z}})`],
  ["anim", `Animation (characters): BW.rig(name, {type="R15"|"R6", Position={x,y,z}, Facing=deg, Anchored=true, DisplayName=}) → NPC · BW.joints(rig) prints joint names`],
  ["anim", `  BW.keyframes(rig, name, {{time=0, poses={RightUpperArm={x,y,z}}}, {time=0.4, poses={RightUpperArm={0,0,150}, Head={rot={0,15,0}, easing="Cubic"}}}}, {loop=true, priority="Action"}) → KeyframeSequence in ServerStorage.BrickwireAnimations (degrees, joint space)`],
  ["anim", `  BW.playAnim(rig, "wave"|"dance"|"idle"|…|assetId|keyframesName, {loop=true, speed=1, name=}) · BW.patrol(npc, {{x,y,z}, "Workspace.Point2"}, {speed=8, pause=1}) walks with walk/idle anims`],
  ["anim", `  BW.playerAnims({walk=id|"preset", run=, idle=, jump=, fall=, climb=, swim=}) players' default animations · BW.toolAnim(tool, "slash"|"lunge"|id) animation on click`],
  ["anim", `Cinematics: BW.shots(target, "intro"|"showcase"|"epic"|"boss"|"trailer"|"menu") → shot list · BW.camCheck(shots) → speed/clipping/blocked view/fov/variety issues · BW.camPreview(shots, t) moves the edit camera to time t (then screen_capture) · BW.cinematic{shots=|target=, style=, mode="join"|"trigger"|"menu", trigger=part} writes the LocalScript (ReplicatedStorage.BrickwireCinema: letterbox, fades, Skip)`],
  ["anim", `  shot = {type="flyby", points={{x,y,z},…}, look=target, time=5} | {type="orbit", target=, radius=, height=, from=deg, to=deg} | push_in/pull_out {target, from=dist, to=dist, angle=, height=} | crane {target, fromHeight, toHeight, turn} | reveal | dolly {from, to, look} | pan | track {subject, offset} | hold {pos, look}; common: time, ease="sine"|"cubic"|"quint"|"out"|"linear", fov=60|{70,50}, roll=deg, cut="fade", shake=0..1`],
  ["anim", `  Presets (Roblox default anims, R15/R6 auto): idle walk run jump fall climb swim wave point dance dance2 dance3 laugh cheer slash lunge`],
  ["gameplay", `Gameplay: BW.leaderstats({"Coins", Kills=0}) · BW.killPart(part[, damage]) · QA: BW.gameCheck() (spawns, remotes without handlers, leaderstats, saving)`],
  ["debug", `Debug: BW.logs(n[, "error"|"warn"|"all"]) recent Output · BW.scan("text") · BW.lint() all scripts · BW.gameCheck() · BW.uiCheck(screen) · BW.fxCheck(target) · BW.inspect(model)`],
  ["assets", `ASSET PACKS (use them OFTEN — real Roblox meshes, textures, decals, skies, sounds, VFX, ~2370 named items): find ids with the brickwire_assets tool {query="barrel", kind=mesh|texture|decal|vfx|sky|sound|part|model, pack=ndc|retro|ultimate|textures|vfx} — never guess ids · BW.asset("pack/item", {At={x,y,z}, Facing=deg, Scale=, Parent=, Name=}) → instance (skies → Lighting, sounds → SoundService) · BW.asset("textures/…", {ApplyTo=part|model}) puts its Texture/Decal/SurfaceAppearance on your parts`],
  ["assetsc", `ASSET PACKS (use often): brickwire_assets {query=, kind=, pack=ndc|retro|ultimate|textures|vfx} → ids (never guess) · BW.asset(id, {At={x,y,z}, Facing=, Scale=, Parent=}) · textures/decals: BW.asset(id, {ApplyTo=part})`],
  ["all", `Rules: helpers fail with a clear "BW: …" message — read it and fix. Colors accept "#RRGGBB". Sizes are studs. Changes are undoable with Ctrl+Z in Studio.`],
];
const API_TOPICS: Record<AgentCategory, string[]> = {
  general: ["all", "assets", "build", "scripts", "ui", "uistyle", "vfx", "anim", "gameplay", "debug"],
  build: ["all", "assets", "build", "vfx", "debug"],
  scripting: ["all", "assets", "scripts", "gameplay", "debug"],
  ui: ["all", "assets", "ui", "uistyle", "scripts", "debug"],
  vfx: ["all", "assets", "build", "vfx", "scripts", "debug"],
  animation: ["all", "assets", "build", "anim", "scripts", "debug"],
  gameplay: ["all", "assets", "build", "scripts", "ui", "uistyle", "gameplay", "anim", "debug"],
  debug: ["all", "assets", "scripts", "debug", "build"],
};
/** compact = for AIs with a small message limit: only the category's core topics. */
const COMPACT_TOPICS: Record<AgentCategory, string[]> = {
  general: ["all", "assetsc", "build", "scripts", "ui"],
  build: ["all", "assetsc", "build"],
  scripting: ["all", "assetsc", "scripts", "gameplay"],
  ui: ["all", "assetsc", "ui", "uistyle", "scripts"],
  vfx: ["all", "assetsc", "vfx"],
  animation: ["all", "assetsc", "anim"],
  gameplay: ["all", "assetsc", "scripts", "gameplay", "ui"],
  debug: ["all", "assetsc", "scripts", "debug"],
};
export function bwApiFor(category: AgentCategory = "general", compact = false): string {
  const topics = (compact ? COMPACT_TOPICS : API_TOPICS)[category] ?? API_TOPICS.general;
  return `BW helper library (available inside every <ROBLOX_LUAU> block — prefer it over raw API calls):\n` + BW_API_LINES.filter(([t]) => topics.includes(t)).map(([, l]) => l).join("\n");
}
/** Full reference (all topics). */
export const BW_API = bwApiFor("general");

export const PLAYBOOKS: Record<AgentCategory, string> = {
  general: `General workflow for any task:
1. ANALYZE: look before you touch — BW.tree("Workspace", 1) / search_game_tree, read scripts with BW.source before editing.
2. CHOOSE the fastest good path: a fitting RESOURCE LIBRARY kit (BW.kit) → customise it; otherwise build from scratch with the BW helpers. Mixed requests ("a village with a shop UI and coins") = several kits + glue code.
3. PLAN in numbers (sizes in studs, positions, colours as hex, script locations) in 2–5 bullets.
4. EXECUTE in small steps (one <ROBLOX_LUAU> block per logical step, max ~250 lines).
5. VERIFY with the category's checker — builds BW.inspect, UI BW.uiCheck, effects BW.fxCheck, scripts BW.lint, systems BW.gameCheck — fix what it lists, then <ROBLOX_AGENT_DONE>.
Category rules: buildings → anchored parts in a named Model; server code in ServerScriptService, client in StarterPlayerScripts/StarterGui; UI → ScreenGui with Scale sizes; effects → ParticleEmitter/Light on a part; motion/NPCs → BW.animate / BW.rig + BW.playAnim (visible only in Play mode).`,

  build: `BUILD playbook (parts, houses, maps) — think like a level designer, build with the kit, never raw center math:
1. ANALYZE: BW.groundY() for the ground level, BW.tree("Workspace", 1) for free space. Library first: is there a kit (cottage, modern_house, skyscraper, castle_wall, tower, park, market_stall…)? Use BW.kit(id, {At=, Facing=, palette=, …}) and customise instead of re-inventing.
2. PLAN in numbers: footprint W×D, floors, wall height, origin, style/palette, what goes where. E.g. "Village 120×120: 4 cottages Facing the plaza, well at (0,0,0), path ring r=30, 20 trees scattered outside".
3. SCALE (character ≈ 5 studs): door 4×7, window 4×3 (sill 3), floor height 12 (wall 10–11 + slab), walls 1 thick, stairs rise 1 / run 1.5, corridors ≥ 6, rooms ≥ 12×12, table 4×3×3, chair seat 2, bed 5×8, street 12–16 wide, sidewalk 4.
4. BUILD — pick the right tool:
   - whole buildings: BW.building{Size={w,d}, floors=, roof=} (slabs + stairs + windows) · interiors from a plan: BW.floorplan({"#####","#.W.#","##D##"}, {cell=2}) · single rooms: BW.room{…}
   - parts of buildings: BW.wall / BW.roof / BW.stairs / BW.column / BW.arch / BW.fence; BW.block{From,To} and BW.part{At=} for pieces
   - interiors: BW.furnish(room, "bedroom"|"living"|"kitchen"|"office"|"shop") or furniture kits (table, chair, bed, sofa, bookshelf, kitchen, tv, rug, floor_lamp, potted_plant)
   - maps: BW.path(points, {width=}) for roads, BW.scatter(area, n, fn, {minDist=, avoid=}) for trees/rocks/props (seeded, no overlaps), BW.array / BW.ring for regular patterns
   - style: local P = BW.palette("medieval"|"modern"|"scifi"|"nature"|"desert"|"snow"|"japanese"|"candy"); max 3–4 colours + 1 accent; real materials (Brick, WoodPlanks, Slate, Concrete, Glass, Metal).
5. DETAIL pass (what makes it look professional): real props/decals/textures/skies from the ASSET PACKS (brickwire_assets → BW.asset), trims and baseboards, window frames/sills, roof ridge, chimney, porch/steps, lamps (lamp_post kit / BW.light), props, plants, a path to every door. Break symmetry: vary sizes ±10–20 %, rotate props, mix 2 plant styles.
6. Big builds: one <ROBLOX_LUAU> per section (layout → shells → roofs → interiors → decor), ≤ 250 lines each; later blocks: BW.default = BW.get("Workspace.Name"). Keep a model under ~1500 parts (skyscraper floors are the expensive part).
7. VERIFY (mandatory): BW.inspect("Workspace.Name") must say floating=0 buried=0 overlaps=0 loose=0. Fix what it lists (BW.ground, BW.move, BW.place), re-inspect, then DONE with the size from BW.report.
Rules: Anchored=true (default). Physics props: BW.weldAll(model, true). Never Destroy things the user built — BW.model / BW.kit only replace the agent's own models.`,

  scripting: `SCRIPTING playbook (Script / LocalScript / ModuleScript):
1. ANALYZE: what exists (BW.tree("ServerScriptService", 2), BW.scan("Name")); read before editing (BW.source). Library systems already solve common needs — coins, round_system, saved_stats, speed/jump pads, teleporter, npc_dialog, day_night: BW.kit(id) then adapt its script with BW.patch.
2. PLAN the architecture in bullets: which scripts, where (server: ServerScriptService · client: StarterPlayer.StarterPlayerScripts or inside a ScreenGui · shared: ModuleScript in ReplicatedStorage), which RemoteEvents (BW.remote) and values.
3. WRITE with BW.script(kind, name, parent, [==[ … ]==]) (re-running updates the same script). Small edits: BW.patch(path, "exact old", "new"). Never touch scripts you were not asked about.
4. PATTERNS: services via game:GetService; Players.PlayerAdded + loop over Players:GetPlayers(); player.CharacterAdded; client: :WaitForChild for everything from the server; task.wait/task.spawn/task.delay; debounce tables per player; connections stored and disconnected; ModuleScripts return a table of functions; constants at the top (CONFIG).
5. SECURITY: the client only requests — validate every RemoteEvent argument on the server (type, range, ownership, cooldown); never trust client-sent prices or damage. DataStores only on the server, every call in pcall with retries, save on PlayerRemoving + game:BindToClose.
6. PERFORMANCE: no while true without task.wait; prefer events (Touched, Changed, Heartbeat sparingly); one loop per system, not per part.
7. VERIFY (mandatory): BW.lint() (or BW.lint(path)) → 0 problems; BW.source confirms the saved code. If a play-test tool exists (start_stop_play / get_console_output), run it and read errors; otherwise BW.logs(20) after the user plays. Then DONE.`,

  ui: `UI playbook — make it look like a top Roblox game, not a default form:
1. ANALYZE: BW.tree("StarterGui", 2). Pick ONE style that fits the game (simulator / cartoon = bright, chunky, glossy; anime = bold slants; glass / minimal = clean; neon / tactical = sci-fi & shooters; fantasy / luxury = RPG; horror; pixel; candy). Ask yourself what the best games of that genre do (Pet Simulator, Blox Fruits, Adopt Me, Doors…). Library: hud, shop, inventory, main_menu, dialog, notifications, settings, loading_screen, daily_reward, timer_bar — BW.kit(id, {style="simulator"}); ui_showcase / style_<name> show every component.
2. PLAN in numbers: list screens and elements with Scale sizes + anchors ("coin pill 0.16×0.06 top-left 2 %; shop window 0.55×0.65 centered; 3×2 card grid"). Think in 3 variants when designing something new (e.g. ribbon header + cards / slanted tabs + list / minimal glass) and pick the strongest.
3. DESIGN RULES: 8-px spacing grid (8/16/24); type scale title 28–40, heading 20–24, body 14–18 (never < 12 on phone); ≤ 2 fonts; colour 60-30-10 (base / panel / accent) with the accent only on the main action; rarity colours common grey → uncommon green → rare blue → epic purple → legendary gold → mythic red → secret black/rainbow; contrast ≥ 4.5:1 (text stroke on bright backgrounds); depth = gradient + 2–3 px stroke + darker bottom edge ("3D button"); consistent corner radius; icons with every number (BW.icon / BW.uiPill) — never invent image ids.
4. BUILD with components (BW.uiWindow, BW.uiButton, BW.uiCard, BW.uiPill, BW.uiBar, BW.uiToggle, BW.uiRays behind rewards) in the chosen style; layouts via UIListLayout/UIGridLayout, Scale for containers, UIAspectRatioConstraint for squares, buttons ≥ 44 px on phone, safe margins 2–4 %.
5. JUICE: BW.uiJuice(gui) once per ScreenGui (hover grow 1.05, press 0.95, window pop-in 0.2 s Back, toggle slide); counters bump on change; rewards get rays + scale-in; tweens 0.15–0.3 s, Quad/Back Out. Logic: LocalScript in the ScreenGui, Activated, one window open at a time, purchases via a validated RemoteFunction.
6. VERIFY (mandatory): BW.uiCheck("StarterGui.Name") → fix every issue (off-screen on phone, cut-off/tiny text, low contrast, small buttons, buttons without script), re-check until OK; if screen_capture exists, look at the result and polish spacing/alignment. Then DONE.`,

  vfx: `VFX playbook — readable, layered, punchy 3D effects:
1. ANALYZE the target (BW.report(path)). Library: fx_* presets via BW.vfx / BrickwireVFX (explosion, hit_spark, slash, shockwave, lightning, magic_burst, heal, level_up, ground_slam, ice_shatter, teleport, confetti, vortex, fire_burst, dash, pickup, poison, smoke_puff) + ambient kits portal, magic_circle, torch, crystals, waterfall, rain, snow, fireflies, player_aura + mesh VFX of the vfx pack (shockwaves, slashes, waves: BW.asset then tween Size/Transparency).
2. DESIGN in 3 beats: ANTICIPATION (0.05–0.2 s: implosion, charge glow) → IMPACT (flash: bright core, light pulse, shell/ring expanding, sparks, camera shake 0.3–0.8) → DISSIPATION (smoke, embers, debris that fall, 0.5–2 s fade). Every effect = 3–6 layers with different size/speed/lifetime: core + secondary + accents + light. Shape language: sharp/fast = combat, round/slow = magic/heal.
3. CURVES: Size big→small (or ring 0→max), Transparency 0→1 with an ease (keypoints {0,0},{0.7,0.3},{1,1}), Color hot→cool (white core → hue → dark), LightEmission 1 for glows / 0 for smoke, Drag 3–8 for bursts that slow down, Acceleration for gravity on sparks/debris, SpreadAngle + Rotation/RotSpeed random ranges, ZOffset for core in front; flash via emitter:Emit(n) instead of Rate for bursts.
4. COLOUR: 2–3 related hues + white core (fire #FFF3B0→#FF8A00→#5A1E00; magic #FFFFFF→#B46CFF→#3A0F7A; ice #FFFFFF→#9FE8FF→#2E6FA8); the light matches the particles.
5. PERFORMANCE: bursts Emit ≤ 80 per layer, Rate ≤ 60, Lifetime ≤ 3 s, ≤ 40 emitters per area, shells/debris cleaned with Debris, lights Range ≤ 30, Shadows off; impacts on the CLIENT (RemoteEvent → VFX.play) so the server stays light.
6. VERIFY (mandatory): BW.fxCheck(path) → fix warnings; BW.vfxPreview(preset, pos) + screen_capture if available to see the frame; say that looping demos/bursts need Play. Then DONE.`,

  animation: `ANIMATION playbook (moving objects, doors, NPCs, character animations):
- Library first: elevator, windmill, ferris_wheel, auto_door, flag, guard_npc, dancer_npc, cinematic_intro, cutscene_trigger, menu_camera — BW.kit then adjust.
- Gacha/reveal cutscenes: kits case_opening, egg_hatch, dice_roll (Anime Dice), event_start, story_intro; server rolls, Skip on, BW.cutsceneCheck; brickwire_guide {"topic":"cutscene"}.
- CAMERA / CUTSCENES (BrickwireCinema): think like a film-maker. Start wide (establishing flyby, high, FOV 65–75) → medium (orbit/track, FOV 55–65) → close (push_in, FOV 40–55) → end on a reveal/crane up. 3–6 shots of 2–6 s, total 8–25 s; vary shot types and directions; smooth ease (sine/cubic) inside a shot, cuts or cut="fade" between; keep the subject on a third of the frame (focus={x,y,z} offset), horizon level (roll ≤ 8°, only for tension); foreground objects passing the lens give parallax; never fly through walls. Use BW.shots(target, style) as a base, edit numbers, BW.camCheck(shots) → 0 issues, BW.camPreview(shots, t) + screen_capture at 2–3 times, then BW.cinematic{shots=…}. Letterbox + Skip stay on.
- Decide the kind: (a) OBJECT motion (coins, fans, platforms, lamps, doors) → BW.animate / BW.door, no assets needed; (b) CHARACTER animation (NPC waves, dances, walks; player walk/run style) → rig + Animator.
- Objects: BW.animate(target, preset, {...}) writes a server Script "BW_Anim_<preset>" inside the target and anchors it. One motion per object (a new preset replaces the old). Combine by animating different objects (spin the blades, bob the whole Model). Pendulums/lamps: swing with hinge={0, h/2, 0}. Platforms: slide {offset={0,0,20}, period=6}. Hazards: spin {speed=180}. Collectibles: hover.
- Doors: separate door part; BW.door(part, {hinge="left"|"right", angle=90}) adds a ProximityPrompt; slide mode for gates/elevators ({mode="slide", offset={0,-8,0}}).
- Characters: BW.rig("Name", {Position={x,3,z}, Facing=180}) (R15 default). Before keyframing run BW.joints(rig) — pose only the joint names it prints.
- Ready animations: BW.playAnim(rig, "wave"|"dance"|"cheer"|"laugh"|"point"|"idle"…) — public default animations, R15/R6 automatic. Walking NPC: BW.patrol(npc, points, {speed=8}).
- Custom: BW.keyframes(rig, "Name", frames, {loop=true}) — degrees {x,y,z} relative to rest, 3–8 keyframes, first = last for loops, 0.2–0.5 s apart, easing "Cubic", anticipation + overshoot for life (small counter-move before a big move), head 10–20°, arm raise 90–160° on Z (R15 RightUpperArm), legs ±30° on X. BW.playAnim(rig, "Name") previews in a Studio play test. HONEST LIMIT: for a published game the user must publish the KeyframeSequence (ServerStorage.BrickwireAnimations → Save to Roblox) and you play that id.
- Player animations: BW.playerAnims({walk="run", idle=ID}); tools: Handle part + BW.toolAnim(tool, "slash"). Only use ids the user gave you or the presets.
- VERIFY (mandatory): BW.tree(target, 2) shows the BW_* script; BW.lint(path of the script) → 0 problems; for keyframes the BW_ANIM line; say clearly that motion is visible only in Play/Run mode (F5/F8).`,

  gameplay: `GAMEPLAY playbook (systems: stats, currency, items, rounds, obbies, NPCs):
1. ANALYZE what already exists (BW.gameCheck() lists spawns, leaderstats, remotes, saving). Library systems: obby (stages + checkpoints), kill_bricks, lava_floor, jump_pad, speed_pad, teleporter, coins, spawn_area, round_system, saved_stats, day_night, npc_dialog — plus UI kits hud, shop, daily_reward, timer_bar. Compose them: e.g. simulator = coins + saved_stats + hud + shop.
2. DESIGN the loop in 3–6 bullets: goal, actions, rewards, progression, fail state; then the pieces (server scripts, RemoteEvents, values, UI) and where each lives.
3. NUMBERS: walk speed 16, jump power 50 (≈7 studs high), obby gaps 6–10 studs (max ~12), platforms ≥ 4×4, checkpoints every 3–5 jumps, round 60–180 s + intermission 10–20 s, prices rising ×1.5–2 per tier, first reward within 30 s.
4. RULES: the server owns stats, damage, currency, rounds; the client only requests (RemoteEvent/RemoteFunction) and displays. Validate everything on the server, debounce Touched per player, respawn collectibles, clean up on PlayerRemoving. DataStores: pcall + retries, save on leave + BindToClose + autosave; tell the user to enable "Studio Access to API Services" to test saving.
5. BUILD in steps: world pieces (kits) → server systems → UI → wiring; keep shared state in ReplicatedStorage Values (RoundStatus) so UI can show it.
6. VERIFY (mandatory): BW.gameCheck() → no issues; BW.lint() → 0 problems; BW.uiCheck for new UI; if a play-test tool exists, run it and read the console. Then DONE.`,

  debug: `DEBUG / FIX playbook:
1. Collect evidence: BW.logs(30) (recent errors/warnings), get_console_output if available, and the exact error line "Script:LINE: message". Static scan: BW.lint() finds common bugs in all scripts in one call; BW.gameCheck() finds missing spawns/handlers; BW.uiCheck / BW.inspect for UI/builds.
2. Locate: BW.source(path, line-10, line+10) around the failing line; BW.scan("name") to find where a value/function is defined or used.
3. Explain the ROOT cause in one sentence (nil index → object not found/not loaded yet; "is not a valid member" → wrong name/path or client/server mismatch; infinite yield → WaitForChild on a missing child; nothing happens → script disabled/in the wrong container/LocalScript where it cannot run).
4. Fix minimally with BW.patch(path, "old", "new") — do not rewrite working code. Common fixes: :WaitForChild on the client, nil checks, correct service/path names, task.wait in loops, move a script to the right container, add server validation.
5. VERIFY: BW.lint(path) → 0 problems, BW.source shows the fix; run a play test if a play tool exists and confirm the error is gone from BW.logs, then DONE with the cause + fix.`,
};

/**
 * Notion AI: an AI that also lives in the user's workspace. We use that on purpose — Notion holds the
 * game's specs and the dev log, Studio work goes only through Brickwire tags.
 */
export function notionSection(opts: { devLog: boolean }): string {
  return `NOTION MODE (you are Notion AI, running inside the user's Notion workspace):
- Studio work happens ONLY through <ROBLOX_TOOL_CALL> / <ROBLOX_LUAU> blocks written as plain text in your chat reply. Your Notion actions (creating/editing pages, databases, search) can NOT touch Roblox Studio — never use them instead of a tool call, and never claim a Studio change that you did not get a <ROBLOX_TOOL_RESULT> for.
- Write the blocks as text in this chat (not into a page, not into a code-only artifact), each in a fenced code block, then stop and wait for my results.
- Use Notion for what it is good at:
  • SPECS: when I mention a page (@page, link or title) with a game design / level layout / feature list, read it with your Notion abilities first, turn it into a numbered build plan, then implement it in Studio step by step and verify each step.
  • TASKS: if I ask, keep a checklist/database of the game's tasks and tick items off only after the Studio result confirms them.
  • ASSETS & NUMBERS: take sizes, colours, prices, stats from the spec page exactly; ask me if the spec is ambiguous.
${opts.devLog ? `- DEV LOG is ON: after every verified <ROBLOX_AGENT_DONE> add a short entry to a Notion page "Roblox Dev Log" (create it once if it does not exist): date, what changed, the Studio paths you created/edited (e.g. Workspace.Cottage, ServerScriptService.Coins), and how it was verified. Keep entries short, newest first. Do this with your Notion abilities AFTER the Studio work, never instead of it.` : `- DEV LOG is OFF: do not create or edit Notion pages unless I ask.`}
- Keep chat replies compact: the tool blocks plus one or two sentences.`;
}

/** Which library sections each category sees (keeps prompts short). */
const LIBRARY_KINDS: Record<AgentCategory, KitKind[]> = {
  general: ["build", "furniture", "gameplay", "ui", "vfx", "anim"],
  build: ["build", "furniture", "vfx", "anim"],
  scripting: ["gameplay"],
  ui: ["ui", "style"],
  vfx: ["vfx"],
  animation: ["anim", "gameplay"],
  gameplay: ["gameplay", "ui", "build"],
  debug: [],
};

/** RESOURCE LIBRARY section: ready-made, tested kits the AI should start from. */
export function librarySection(category: AgentCategory = "general", compact = false): string {
  const kinds = LIBRARY_KINDS[category] ?? LIBRARY_KINDS.general;
  const head = `RESOURCE LIBRARY (ready-made, tested resources — use them to be fast, then customise):
- BW.kit(id, {At={x,y,z} (bottom-center on the ground), Facing=deg, Name=, Parent=, palette=, style="simulator"|"cartoon"|"glass"|"neon"|… (UI kits), …options}) builds one and prints "BW_KIT id → path parts=N size=…". BW.kits([category]) prints the full catalog with options.
- Start from a fitting kit whenever the request matches one (even partly), then adapt it with normal BW code (move, recolour, add parts, BW.patch its script). Several kits + glue code = a whole game area in a few blocks. Nothing fits → build from scratch.
- If I say "exactly like the library X" use BW.kit unchanged; "something like X" = your own variation (different layout/details, same purpose and style).`;
  if (!kinds.length) return `RESOURCE LIBRARY: BW.kits() prints ready-made kits (BW.kit(id, {At=…})) — useful to rebuild a broken system quickly.`;
  const cat = compact ? catalogForPrompt(kinds).replace(/\([^)]*\)/g, "") : catalogForPrompt(kinds);
  if (compact)
    return `RESOURCE LIBRARY: BW.kit(id, {At={x,y,z}, Facing=deg, Name=, palette=, style=…}) builds a tested kit (prints "BW_KIT id → path"); BW.kits() lists options. Start from a fitting kit and customise it; nothing fits → build from scratch.
${cat}`;
  return `${head}
${cat}`;
}
