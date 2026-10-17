/**
 * In-depth know-how the AI pulls on demand with the bridge tool `brickwire_guide {topic}`.
 * Prompts stay short (some chat sites cap a message at ~10k chars); the depth lives here.
 * Each guide ≤ ~5.5k chars so it fits one tool result on every provider.
 */
export const GUIDE_TOPICS = ["understand", "super", "camera", "cutscene", "animation", "gameplay", "build", "ui", "vfx", "scripting", "assets", "polish", "mechanics", "npc", "maps", "test", "gamedesign", "thumbnails", "pbr", "mesh", "playtest"] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

export const GUIDES: Record<GuideTopic, string> = {
  understand: `UNDERSTANDING THE TASK (do this before any big change)
1. Restate the goal in ONE line in the user's language: what the PLAYER will see/do, not what code you write.
2. Fill the gaps from context — genre, scale (one prop / a room / a map / a whole game), mood/style, platform (phone players → bigger UI), what already exists in the place (inspect first: tree, scripts, memory).
3. Decide: is it CLEAR (one obvious good result, e.g. "make the door open", "fix this error") → just do it. Is it OPEN (several good designs, big scope, taste-dependent: "make a lobby", "add a combat system", "cool cutscene") → ASK first.
4. Asking well (one message, then STOP and end with <ROBLOX_AGENT_ASK>):
   - 1–3 short questions, each with your default in brackets: "Сколько этажей? [3]".
   - 2–3 VARIANTS, concrete and different in kind, not just in colour:
     A) "Compact medieval square: fountain, 4 stalls, lanterns — fast (~2 blocks)"
     B) "Floating sky island lobby with portals to modes, waterfalls, VFX — medium (~5 blocks)"
     C) "Neon city rooftop with billboards and a cinematic intro — big (~8 blocks)"
     For each: what it looks/plays like, key features, effort, risk. Say which you RECOMMEND and why (fit for the genre, effort/impact).
   - Offer "or say 'go' and I will build A".
5. User said "just do it", "сам реши", "без вопросов", or answered → pick the recommended variant, state it in one line, build.
6. Never ask about things you can look up yourself (existing objects, script names) — inspect instead.
7. During the work: if you discover a real fork (e.g. existing system conflicts), ask briefly; otherwise keep going.
8. At the end: say what you built, where (paths), how it was verified, and 2–3 concrete ideas for the next step.`,

  super: `SUPER MODE — take your time, deliver an outstanding result (quality > speed)
PHASE 0 — THINK (no tools yet): restate the goal; list what a top Roblox studio would ship for this request (references: best games of the genre); list risks. If the task is open, present 2–3 strong variants with a recommendation and end with <ROBLOX_AGENT_ASK> (unless the user said "just do it").
PHASE 1 — INSPECT deeply: BW.tree("Workspace", 2), BW.tree("ServerScriptService", 2), StarterGui, ReplicatedStorage; read every script you will touch (BW.source); BW.gameCheck(); note scale (BW.groundY, existing sizes) and style (colours/materials already used).
PHASE 2 — DESIGN DOC (short, in the chat): goal · player experience second by second · layout with numbers (studs, positions) · systems & where each script lives · assets you will use (brickwire_assets search: meshes, textures, skies, VFX, sounds from the packs) · what "done" means (acceptance checklist of 5–10 testable items).
PHASE 3 — BUILD in phases, each one block ≤ 250 lines, each followed by its checker: layout/blockout → structure → detail & props (packs!) → lighting/atmosphere/sky → VFX & sound → UI → scripts/wiring. Name everything clearly, group in Models/Folders.
PHASE 4 — VERIFY like QA: run every relevant checker (BW.inspect, BW.uiCheck, BW.fxCheck, BW.lint, BW.gameCheck, BW.camCheck); if screen_capture exists, LOOK at the result from 2–3 angles (BW.camPreview / camera moves) and judge it honestly as a player; play-test with start_stop_play + get_console_output when available.
PHASE 5 — SELF-CRITIQUE & POLISH (at least one full pass): list the 5 weakest points (flat areas, empty space, inconsistent style, tiny text, no feedback, dull lighting, missing sounds, no juice) and fix them. Typical upgrades: trims/edges/props break flat surfaces, light sources with colour temperature, Atmosphere + ColorCorrection + Bloom, ambient particles, sounds, tween feedback on every interaction, camera intro.
PHASE 6 — REPORT: what was built (paths), how each acceptance item was verified, known limits (honest), next ideas.
Rules: never stop at "good enough" if a check fails; keep the user's existing work intact; prefer pack assets + library kits over primitive boxes when they fit; keep part counts sane (< 5k for a map area).`,

  camera: `CAMERA & CINEMATOGRAPHY (cutscenes, intros, menu cameras, fly-throughs)
STORY FIRST: every sequence answers "what should the player feel/learn?" — awe (scale), orientation (where things are), tension (threat), reward (showcase). Build an arc: ESTABLISH → EXPLORE → FOCUS → PAYOFF.
SHOT GRAMMAR:
- Establishing: high & wide (60–150 studs out, 30–80 up), slow drift or crane-down, FOV 65–75, 4–7 s.
- Fly-through: a smooth spline through the space at head-to-roof height, passing CLOSE to foreground objects (pillars, trees, arches) for parallax; speed 15–40 studs/s; look slightly ahead of the path (look-ahead 10–20 studs) or at a fixed point of interest.
- Orbit/showcase: radius 1.5–3× object size, 60–180° in 5–8 s, slight height change, FOV 50–60.
- Push-in (dolly in) on the hero/object for emphasis, FOV narrowing 60→45 = "vertigo light".
- Reveal: start behind an occluder (wall, cliff, door) and move sideways/up to reveal the subject.
- Crane up at the end = "the journey begins" ending; pull-out = "you are small in a big world".
COMPOSITION: rule of thirds (subject off-centre, look-room in the direction it faces), keep the horizon level (roll only for tension ≤ 8°), foreground–midground–background layers, never point at empty sky/void, avoid clipping (raycast from subject to camera), keep the subject's silhouette against a contrasting background, low angle = power, high angle = weakness.
MOTION: ease in/out on every shot (Sine/Cubic InOut); avoid linear starts; constant speed through a spline (reparametrize by arc length); no abrupt direction flips; cuts between very different angles (≥ 30° change) — never jump-cut to almost the same view; cut on action; 3–6 shots for 10–25 s total; add subtle handheld noise (0.05–0.15) only for action.
IMPLEMENT: BW.shots(target, style) gives a base list; edit numbers; types flyby/orbit/push_in/pull_out/crane/reveal/dolly/pan/track/hold; BW.camCheck(shots) must report 0 issues; BW.camPreview(shots, t) + screen_capture at 3+ times to SEE frames; then BW.cinematic{shots=…, mode="join"|"trigger"|"menu"} (letterbox, fades, Skip button). Custom code: Camera.CameraType = Scriptable, drive CFrame each RenderStepped from your spline (Catmull-Rom through points; CFrame.lookAt(pos, lookTarget)), restore CameraType = Custom and CameraSubject = Humanoid at the end, always offer Skip, disable player controls during the shot (PlayerModule:GetControls():Disable()).
SOUND & TEXT: a whoosh on fast moves, music swell at the payoff, short title text (fade in 0.5 s, hold 2 s) in the lower third.`,

  cutscene: `CUTSCENES — gacha reveals (case / egg / dice), event starts, story intros
STRUCTURE (every one): SETUP (what is at stake: the case, the egg, the boss) → BUILD-UP (speed, wobble, ticks, music rising) → CLIMAX (the reveal: flash + shake + sound + big text) → RESOLUTION (result card, Claim / Roll again, camera back). The climax is the only loud moment; everything before it builds to it.
TIMINGS: case 4–6 s · egg 3–5 s · dice ticker 1–6 s · event start 3–12 s · story intro 6–30 s (3–6 shots). Repeated actions (auto-roll, Hatch x3) must stay short; long scenes only once (first join).
MUST HAVE: Skip button on every scene (skip jumps to the result, never loses the reward) · the reward is rolled on the SERVER (Cutscene.roll in a Script) and only SHOWN on the client · controls locked + camera restored after · subtitles stay ≥ 0.06 s per letter + 1 s · a sound on every accent (tick, whoosh, hit, reveal).
RARITY FEEL (Common → Uncommon → Rare → Epic → Legendary → Mythic → Secret): pause before the reveal, shake, flash, rays and particles grow with the tier. Common = quick pop; Epic+ = screen reveal with rays; Mythic+ = fake ending (slows, "stops" on a worse item, then jumps). Colours: Common grey, Uncommon green, Rare blue, Epic purple, Legendary gold, Mythic red-pink, Secret white/rainbow.
DEFAULT LOOK = style "animedice" (Roblox Anime Dice): chunky FredokaOne / LuckiestGuy text, white with a thick black outline, slightly tilted; the roll is a ticker ABOVE THE PLAYER'S HEAD (BillboardGui): odds "1 in 20k" on top, square portrait, unit name below, cycling fast → slow; pedestal billboards "Name / Rarity (colour) / 1 in 300 / $156/s"; mutation prefixes Silver, Gold, Huge, Titanic, Perfect multiply the odds; auras on rare units. style "clean" = calm Gotham, no tilt / fake-outs.
LIBRARY (ReplicatedStorage.BrickwireCutscene, created by the kits):
- BW.kit("case_opening", {pool=, price=, currency=}) · BW.kit("egg_hatch", {pool=, price=}) · BW.kit("dice_roll", {pool=, mutations=, cooldown=}) · BW.kit("event_start", {zone=, title=, every=}) · BW.kit("story_intro", {target=, lines=, speaker=, title=}) — each writes a server Script + the shared client LocalScript. Pool item = {name=, rarity=, chance=0..1 | odds=N | weight=, icon=}.
- Server: local item = Cutscene.roll(POOL, {luck=2}); Cutscene.show(player | {players} | "all", "case"|"egg"|"dice"|"event"|"story", {result=item, pool=POOL}).
- Client: Cutscene.listen() plays what the server sends; Cutscene.request("roll") asks the server.
- Custom timeline: Cutscene.play({style=, events={ {at=0, camera={shots}}, {at=0, sound=id, music=true, fadeIn=1}, {at=0.5, say="…", speaker="…", time=2.5}, {at=3, title="BOSS", sub="…"}, {at=3, shake=0.8}, {at=3, flash="#FFFFFF"}, {at=3, vfx="explosion", where=path}, {at=4, tween=path, goal={…}}, {at=4, fov=50}, {at=4, blur=12}, {at=5, color={Saturation=-0.4}}, {at=6, fire="Ready"} }}, {skip=true, onDone=fn}). Camera shots = the BrickwireCinema grammar (see topic camera). BW.cutscene{timeline=, mode="join"|"trigger"} writes the LocalScript.
VERIFY (mandatory): BW.cutsceneCheck("case"|"egg"|"dice"|"event"|"story" | timeline) → BW_CUT line with 0 issues (checks every rarity: length limits, Skip, sounds, subtitle reading time, camera, server-side roll, client listener present, no client-side math.random rewards). Then a Play test: roll several times, press Skip once, check the console is clean. Report honestly that the look was checked in code, not seen, unless you used screen_capture in Play.`,
  animation: `CHARACTER & OBJECT ANIMATION — make motion feel alive
THE 12 PRINCIPLES that matter most in Roblox: anticipation (small opposite move first), squash & stretch (scale pulses on objects), follow-through & overlap (arms/tail/hair settle after the body stops), slow-in/slow-out (easing), arcs (limbs move on curves, not straight lines), secondary action (head turn while waving), timing (fast = light/energetic, slow = heavy/calm), exaggeration (Roblox reads best at 120 %), appeal (clear silhouettes).
KEYFRAMES: 3–8 keys per action; key poses first (extremes), then breakdowns; loops: first = last pose; 0.15–0.5 s between keys; ease Cubic/Sine for organic motion, Linear only for mechanical spins; hold the final pose 0.1–0.2 s for readability; offset limbs by 1–2 frames (overlap).
TYPICAL VALUES (R15, degrees relative to rest): idle breathing UpperTorso X ±2–3° over 2–3 s; wave RightUpperArm Z 120–160°, RightLowerArm Z 20–40° with ±25° oscillation 0.3 s; nod Head X −15°; walk LeftUpperLeg/RightUpperLeg X ±30°, arms opposite ±20°, torso Y ±5°; jump: crouch 0.1 s (legs X +40, torso X +15) → extend → tuck; attack: wind-up 0.2 s back, strike 0.08 s fast, recover 0.3 s.
OBJECT MOTION (TweenService / BW.animate): doors 0.4–0.7 s Quad Out; platforms slide with Sine InOut and 0.5–1 s pause at ends; coins spin 90–180°/s + bob 0.5 stud; pickups pop scale 1→1.3→0 in 0.25 s; buttons press 0.1 s down, 0.15 s back with Back easing.
IMPLEMENT: rigs via BW.rig; BW.joints(rig) for joint names; BW.keyframes(rig, name, frames, {loop}) → KeyframeSequence; BW.playAnim(rig, preset|id|name); NPC paths BW.patrol; players BW.playerAnims; tools BW.toolAnim. For runtime-only custom motion without publishing, animate Motor6D.Transform on RenderStepped/Stepped (client) — smooth, no asset upload needed. Honest limit: KeyframeSequences must be published (Save to Roblox) for live games.
POLISH: add sound on contact frames (footsteps, swoosh), particles on impact frames, camera shake for heavy moves, and check the animation from the player's camera distance.`,

  gameplay: `GAMEPLAY DESIGN — systems that are fun, fair and robust
1. CORE LOOP in one sentence: "Collect X → upgrade Y → unlock Z" (simulator), "Run → jump → reach checkpoint" (obby), "Join → round → win/lose → reward" (round games), "Explore → fight → loot → level up" (RPG). Every action gives feedback within 0.2 s and progress within 30 s.
2. PROGRESSION: tiers with costs ×1.5–2.5, rewards ×1.3–2; first upgrade affordable in < 1 min, 10th in ~20–30 min; prestige/rebirth resets with a permanent multiplier; visible goals (next unlock shown in UI).
3. ARCHITECTURE: server-authoritative. ServerScriptService: one Script per system (Currency, Rounds, Combat) or a ModuleScript service pattern; ReplicatedStorage: Remotes folder (BW.remote), shared ModuleScripts (config tables: prices, stats), Values for global state (RoundStatus, TimeLeft). Client: LocalScripts for input, UI, VFX, camera. Data: one DataStore key per player (table), session cache, autosave every 60–120 s, save on PlayerRemoving + BindToClose, pcall + retries + version field.
4. SECURITY: never trust the client — validate types, ranges, cooldowns, distance (player near the shop/NPC), ownership, rate-limit remotes per player; prices and damage live on the server.
5. COMBAT basics: hitboxes on the server (spatial query: workspace:GetPartBoundsInBox / GetPartsInPart) with cooldown per attack; damage numbers + hit VFX on clients; i-frames 0.3–0.5 s; knockback via AssemblyLinearVelocity; ragdoll optional.
6. ROUNDS: Intermission (15 s) → choose map/mode → teleport → play (60–180 s) → result → reward → cleanup; handle players joining mid-round and leaving; minimum players.
7. NPCs/AI: state machine (Idle → Patrol → Chase → Attack → Return), PathfindingService for chase, re-path every 0.5–1 s, give up after distance; dialog via ProximityPrompt.
8. OBBIES: difficulty curve (easy first 5 stages), variety every 3 stages (moving, kill, truss, wrap, spinning), checkpoints with SpawnLocation + saved stage, stage counter UI, skip-stage as a reward.
9. FEEL: sounds for every action, UI counters bump, VFX on rewards, camera shake on hits; tutorial arrows/beam to the first goal.
10. VERIFY: BW.gameCheck(), BW.lint(), play-test (start_stop_play + get_console_output) and walk the loop once as a player.`,

  build: `LEVEL & ENVIRONMENT DESIGN
1. BLOCKOUT first: big shapes, paths, sightlines, landmarks (one tall element visible from everywhere), spawn facing the main attraction. Scale: character 5 studs, doors 4×7, corridors ≥ 6, rooms ≥ 12×12, streets 12–16.
2. COMPOSITION: hero area + supporting areas + filler; guide players with light, colour and paths; frame views (arches, trees); avoid big empty flats — add height variation (terrain, stairs, platforms).
3. STYLE: one palette (BW.palette), 3–4 colours + 1 accent, consistent materials; low-poly/cartoon: bright saturated, SmoothPlastic; realistic: muted, real materials + textures from the packs (ultimate PBR/low-poly textures, textures swatches) via BW.asset(id, {ApplyTo=part}).
4. DETAIL ("the 3 passes"): primary (structures) → secondary (trims, frames, roofs, fences, props) → tertiary (decals: graffiti/debris/dirt from ultimate, small props from ndc, plants, lights). Break repetition: rotate/scale ±15 %, mix 2–3 variants of each prop.
5. LIGHTING & MOOD: Lighting.Technology Future (or ShadowMap), ClockTime per mood (golden hour 17–18, night 0–2 with lamps), Atmosphere density 0.25–0.4 with haze, ColorCorrection (+contrast 0.05–0.15, saturation by style), Bloom subtle, a Sky from the retro pack (27 skyboxes: BW.asset("retro/…") with kind sky) — matching the mood; local PointLights/SpotLights in warm 2700–3500 K colours (#FFC98A) vs cool moonlight (#9FB8FF).
6. PROPS FROM PACKS: search brickwire_assets for barrels, crates, lamps, food, weapons, signs, trees, rocks; place with BW.asset(id, {At=, Facing=, Scale=}); combine with your own parts.
7. PERFORMANCE: anchored, CanCollide off for decoration, CastShadow off for tiny props, ≤ 5k parts per area, reuse meshes.
8. VERIFY: BW.inspect → floating/buried/overlaps 0; screen_capture from player height and from above.`,

  ui: `UI DESIGN — top-game quality
- Hierarchy: one primary action per screen (biggest, accent colour), secondary actions smaller/neutral; group related info; 8-px grid; consistent radius & stroke.
- Genre styles: simulator/cartoon (chunky, glossy, thick dark strokes, bouncy), anime (slants, high contrast), sci-fi/tactical (thin lines, mono fonts, cyan/orange), fantasy (ornate frames, gold), horror (dark, desaturated, flicker), minimal/glass (blur-like translucency, white text).
- HUD: currency pills top-left/top-right with icons, menu buttons left-centre column (phone thumbs), notifications top-centre, never cover the centre of the screen.
- Windows: header + close button, content grid, footer with the main action; open with pop (scale 0.8→1, 0.2 s Back), close fast (0.12 s); dim backdrop.
- Mobile: buttons ≥ 44 px, text ≥ 14 px, keep within safe area, test 390×844 (BW.uiCheck does).
- Feedback: hover/press scale, sounds on click, counters tween numbers, rewards with rays + particles, errors shake 0.2 s red.
- Use BW style components (BW.uiWindow, uiButton, uiCard, uiPill, uiBar, uiToggle, uiRays, uiBackdrop, uiJuice) and icons (BW.icon); pack decals/images only for decoration that fits.
- VERIFY: BW.uiCheck(screen) → 0 issues; screen_capture and judge spacing/alignment.`,

  vfx: `VFX — readable, layered, performant
- Beats: anticipation → impact → dissipation; 3–6 layers (core flash, shell/ring, sparks, smoke, light, decal/ground mark).
- Mesh VFX (from the vfx pack: shockwaves, waves, slashes, explosions, spheres, swirls, spikes): spawn with BW.asset("vfx/…", {At=}), then tween Size ×2–4, Transparency 0→1, rotate, in 0.2–0.6 s, then Destroy; Material Neon or ForceField for glow; colour via Color.
- Particles (retro/ultimate particle items or BW.particles): Size/Transparency NumberSequences with eased keypoints, LightEmission 1 for glow, Drag for bursts, Emit(n) for one-shots.
- Beams for lightning/lasers (ultimate Beams items, Attachment0/1), Trails for swings and dashes.
- Colour: white-hot core + 2 hues; matching PointLight pulse.
- Run on the client for hits (RemoteEvent → client spawns VFX); clean up with Debris; caps: Emit ≤ 80, emitters ≤ 40 per area.
- VERIFY: BW.fxCheck + BW.vfxPreview / screen_capture; looping effects need Play.`,

  scripting: `SCRIPTING — clean, safe, modern Luau
- Structure: services at top, CONFIG table, small functions, early returns; ModuleScripts for shared logic; one responsibility per script.
- Modern APIs: task.wait/spawn/delay/defer, GetAttribute/SetAttribute for config, CollectionService tags for many similar objects (one script handles all tagged parts), Workspace:Raycast with RaycastParams, GetPartBoundsInBox for hitboxes, TweenService for motion, ProximityPrompt for interaction.
- Client/server: RemoteEvent for fire-and-forget, RemoteFunction only client→server with validation (never server→client InvokeClient), UnreliableRemoteEvent for frequent cosmetic updates.
- Robustness: WaitForChild on the client with timeouts for optional things, pcall around DataStore/HTTP/MarketplaceService, disconnect connections, clean up on PlayerRemoving/Destroying.
- Performance: avoid per-frame work for many objects (batch in one Heartbeat), no busy loops, cache lookups.
- Typed Luau (--!strict optional) for bigger modules.
- VERIFY: BW.lint → 0 problems; play-test and read console errors.`,

  assets: `ASSET PACKS — real Roblox items, use them often
- 5 bundled packs (+ user packs dropped as .rbxm into the bridge's data/packs folder): ndc (props: food, weapons, staffs, hats, helmets, glasses, animals, cryptids, letters, numbers, symbols, holiday items), retro (classic Roblox: studs/inlet surface textures, 27 skyboxes, faces, sounds, star/smoke/bubble emitters, characters, GUI), ultimate (building materials: low-poly & PBR textures, graffiti/debris/dirt decals, meshes, particles, beams, forcefields), textures (tiling texture swatches), vfx (shockwaves, waves, slashes, explosions, spheres, swirls, spikes, skill models).
- FIND: brickwire_assets {query="barrel"} (also kind=mesh|texture|decal|vfx|sky|sound|part|model|character, pack=, category=). Never guess ids — copy them from the results.
- PLACE: BW.asset("ndc/…", {At={x,y,z}, Facing=deg, Scale=1.5, Parent=model, Name=, Anchored=true}) → the instance (rebuilt from the pack data; meshes via CreateMeshPartAsync, unions via GeometryService). Skies/atmosphere go to Lighting automatically (old Sky replaced), sounds to SoundService.
- APPLY materials: BW.asset("textures/…" | "ultimate/…texture…", {ApplyTo=part|model}) copies Texture/Decal/SurfaceAppearance onto your parts (and their material/colour; Material=false / Color=false to keep yours).
- VFX meshes: spawn + tween (see brickwire_guide vfx). Particles/beams items carry their emitters — parent them where you need the effect.
- Combine: your structure (BW.part/kits) + pack props/decals/textures/skies for realism. 1–3 BW.asset calls per item type, loops for scatter (BW.scatter with BW.asset inside).
- If the user dragged the original pack into Studio (ServerStorage/ReplicatedStorage/Workspace), BW.asset clones that original (100 % fidelity). Rebuild=true forces the data copy.`,

  polish: `POLISH CHECKLIST (run before DONE on anything visual)
- Silhouette & scale readable from the player camera? Nothing floating, clipping or z-fighting (BW.inspect).
- Flat/empty areas broken up with props, decals, height changes? Style consistent (palette, materials)?
- Lighting: a key light/sun direction, warm/cool contrast, local lights at points of interest, Atmosphere/ColorCorrection/Bloom tuned, matching Sky.
- Motion: something moves (ambient particles, swaying, spinning collectibles) — but not everything.
- Sound: ambience + interaction sounds.
- UI: 0 issues in BW.uiCheck, juice on, mobile sizes OK.
- Gameplay: loop works end to end in a play test; errors 0 in the console.
- Performance: part counts sane, decoration CanCollide off, effects capped.
- Report honestly what could not be verified.`,
  mechanics: `MECHANICS LIBRARY — install working systems instead of writing them from scratch
- mechanic_list → pick ids (leaderstats, coin_pickup, checkpoints, kill_brick, sprint, double_jump, day_night, doors, round_system, shop).
- mechanic_install {id, config?} installs dependencies first (e.g. coin_pickup → leaderstats). Config lives in attributes on BW_<id>.
- Change values with mechanic_configure (no code edits). mechanic_status shows what is installed.
- mechanic_remove moves everything to ServerStorage.BrickwireBackups (reversible).
- After installing: test_run {checks:[{type:"mechanic",id}]} then ask the user to playtest (F5).`,
  npc: `NPC BUILDER
- npc_create {name, rig R6|R15, behavior idle|wander|patrol|follow|chase|guard|shopkeeper, dialog[], walkSpeed, damage, range, patrolPoints}.
- Behavior is driven by attributes BW_* on the model — tweak with modify_instance.
- Enemies: chase/guard + damage; quest givers: idle + dialog; animate them with animation_generate on the same rig.
DESIGN RULES
- Every NPC has ONE job the player understands in 2 s: sells, gives a quest, blocks a path, attacks. Show it with a BillboardGui name tag + icon above the head ("!" quest, coin = shop).
- Placement: shopkeepers behind a counter facing the spawn path; guards at chokepoints; wanderers inside a bounded zone (patrolPoints ≥ 3, all on walkable ground, no point inside a wall).
- Combat: start with damage 10–20 and range 6–10 studs; walkSpeed below the player's 16 so players can escape; add a cooldown (BW_Cooldown) so hits are readable.
- Dialog: 1–3 short lines, the last one tells the player what to do next.
VERIFY: read_instance on the model (BW_* attributes present, HumanoidRootPart anchored only for idle/shopkeeper), test_run, then playtest_run {mode:"run", seconds:10} and debug_logs — no pathfinding or script errors.`,
  maps: `MAP GENERATORS
- map_generate {type: obby|arena|maze|city|island, seed, size, difficulty}; preview:true first to see the part count.
- Same seed = same map. Change seed to get variants. Then decorate with brickwire_assets and lighting.
- Obby: kill parts are tagged BW_Kill (install kill_brick). Arena: spawns go to Workspace.BW_Arena (round_system).
WORKFLOW
1. Inspect first: BW.tree("Workspace", 1) — never generate on top of existing builds; pick an empty area or use an offset.
2. map_generate {preview:true} → check part count (aim < 3000 for an obby, < 5000 for a city) → generate for real.
3. Theme it: one material palette (2–3 materials + 1 accent colour), brickwire_assets props, Lighting/Atmosphere preset.
4. Readability: the next goal must be visible from the current platform; checkpoints every 5–8 jumps; difficulty rises slowly with one break after a hard section.
5. Performance: anchor everything static, CastShadow off on tiny parts, merge repeated decorations into models.
VERIFY: test_run (kill bricks tagged, spawns exist), project_analyze for performance, a screen_capture from the spawn.`,
  test: `TEST CENTER & DEBUGGING
- test_run (default suite: syntax of all scripts, all installed mechanics, no errors in Output).
- Custom checks: exists, property, script_syntax, mechanic, no_errors, count.
- debug_logs groups Output errors with script + line → read_instance → fix → test_run again.
- project_analyze / project_optimize (dryRun first) for performance. Automated runtime check: playtest_run {mode:"run"|"play", seconds} (experimental); if unavailable, ask the user to press F5.
LOOP (always the same)
1. Reproduce: get_console_output / debug_logs after the user's action or after playtest_run.
2. Locate: the error line gives script + line → read_instance on that script; read the surrounding 30 lines, not just the line.
3. Fix the cause, not the symptom (nil checks hide bugs; find why the value is nil: wrong path, wrong side client/server, runs before the instance exists → WaitForChild).
4. Re-run the same check that failed and keep it in the final report.
COMMON CAUSES: LocalScript in Workspace (never runs), server code touching PlayerGui, RemoteEvent fired before the client connected, infinite while-true without task.wait, deprecated wait()/spawn().
REPORT: list each check with pass/fail; never claim "tested" without a tool result.`,
  gamedesign: `GAME DESIGN
- gd_design {genre} gives core loop, first-session plan, retention, monetization, risks and a buildPlan of real Brickwire calls — follow it step by step.
- gd_economy checks progression (cost growth must exceed income growth; add rebirth when late levels > 1h).
CORE PRINCIPLES
- First 60 seconds decide retention: spawn → the core action within 10 s → first reward within 30 s → first upgrade within 60 s.
- One core loop, stated in one line: ACTION → REWARD → UPGRADE → bigger ACTION (e.g. click → coins → better PC → more coins per click).
- Progression: each upgrade ~1.5–2.5× the previous cost; income should grow slower than cost so the next goal always takes a bit longer.
- Social & return: leaderboard, visible upgrades on the avatar or base, daily reward, offline earnings if the genre fits.
- Monetization stays optional: 2× boosts, cosmetics, VIP area — never sell the only way to progress.
PLAN → BUILD: turn the gd_design buildPlan into phases; after each phase run gd_economy / test_run and show the player-facing result.`,
  thumbnails: `AI THUMBNAILS & ICONS — you are the art director
- image_status first: needs BRICKWIRE_IMAGE_API_KEY (+ provider) in .env. Without it use thumbnail_generate {promptOnly:true} and give the prompt to the user.
- thumbnail_generate {format: thumbnail|icon|badge|gamepass, style?, variants 1-4, direction?}. It reads the place (name, design brief, colors, key models, lighting) so the image matches the game.
- Rules it enforces: one focal character with a readable emotion, strong contrast, no text, safe margins, genre conventions.
- ALWAYS ask the user to rate each variant, then thumbnail_feedback {id, rating 1-5, notes}. Liked traits are reinforced, disliked ones go to the negative prompt, and the preferred style is remembered.
- Experience thumbnails/icons are set by the user in Creator Dashboard (no public API); badges/game passes can use the uploaded image ids.`,
  pbr: `PBR MATERIALS
- pbr_generate {name, prompt | sourceFile, resolution, baseMaterial, studsPerTile, applyTo[]}: seamless albedo → Normal/Roughness/Metalness PNGs.
- With Open Cloud (ROBLOX_OPEN_CLOUD_API_KEY + ROBLOX_CREATOR_USER_ID) it uploads them and creates a MaterialVariant in MaterialService and applies it.
- Without Open Cloud: files are saved; tell the user to import them with Asset Manager.
GOOD MAPS
- Albedo has NO baked lighting or strong shadows; keep it flat and evenly lit, otherwise the normal map doubles the shadows.
- Tiling: check the seam by viewing a 3×3 grid; studsPerTile 4–8 for floors, 2–4 for small props.
- Roughness: wood/stone/fabric 0.7–0.9, painted metal 0.4–0.6, polished metal 0.1–0.3; metalness 0 for non-metals, 1 only for raw metal.
- Normal strength: 1.5–3 for stone/bricks, ≤ 1 for fabric and plastic; too strong looks noisy at a distance.
APPLY: MaterialVariant in MaterialService, BaseMaterial must match (Wood variant on Wood parts); set part.MaterialVariant to the variant name.
VERIFY: read_instance on MaterialService and one target part; screen_capture close up and from 30 studs.`,
  mesh: `MESH 2.0
- mesh_generate {type: rock|crystal|lathe|terrain|tube|gem, seed, size, ...}: builds a MeshPart through EditableMesh and exports GLB + OBJ.
- EditableMesh parts are NOT saved with the place. For permanent meshes: upload:true (Open Cloud Model, experimental) or import the GLB with the 3D Importer.
- Prefer meshes for organic shapes (rocks, crystals, vases); keep using Parts for blocky geometry.
PARAMETERS THAT MATTER
- seed: same seed = same shape; generate 2–3 seeds and keep the best.
- size: in studs; rocks 2–12, crystals 1–6, terrain patches up to the map tile size.
- Keep triangle counts modest (a few thousand per mesh) — many unique meshes cost memory; reuse one mesh with different Size/Color/Material.
STYLE: match the place — low-poly flat-shaded for cartoon games, smoother lathe/tube shapes for props (vases, pillars, pipes).
COLLISION: set CollisionFidelity Box/Hull for decoration, PreciseConvexDecomposition only where players stand.
VERIFY: read_instance (MeshPart exists, Size as expected), a screen_capture, and tell the user honestly when a mesh is session-only (EditableMesh) and will not be saved.`,
  playtest: `AUTOMATED PLAYTEST (experimental)
- playtest_run {mode:"run"} = server only (NPCs, round status, day/night, runtime errors); {mode:"play"} also checks player spawn, health, leaderstats.
- Max 60 s. The temporary runner script is removed after the test.
- If Studio refuses StudioTestService, fall back to: ask the user to press F5, then debug_logs + test_run.
WHAT IT CHECKS
- Runtime errors in Output during the run (with script + line), NPC/round/day-night scripts actually running, in play mode the character spawns with Health > 0 and leaderstats exist.
HOW TO USE
1. Before: test_run (syntax + mechanics) so the playtest is not wasted on a typo.
2. playtest_run {mode:"run", seconds:10–20} for server systems; {mode:"play"} when the change touches players, UI or spawn.
3. Read the result list; every failure → debug_logs → read_instance → fix → run the same playtest again.
LIMITS (be honest): no real input (cannot jump an obby or click UI), timings in Studio differ from live servers; say what was and was not verified.`,
};

export function guideFor(topic: string): string | null {
  const t = String(topic ?? "").toLowerCase().trim();
  const alias: Record<string, GuideTopic> = { cinematic: "camera", cinematics: "camera", cutscenes: "cutscene", case: "cutscene", egg: "cutscene", hatch: "cutscene", gacha: "cutscene", dice: "cutscene", reveal: "cutscene", story: "cutscene", flythrough: "camera", fly: "camera", anim: "animation", animations: "animation", game: "gameplay", systems: "gameplay", level: "build", map: "build", building: "build", gui: "ui", effects: "vfx", effect: "vfx", scripts: "scripting", code: "scripting", packs: "assets", pack: "assets", library: "assets", quality: "polish", questions: "understand", variants: "understand", plan: "understand", deep: "super" };
  const k = (GUIDE_TOPICS as readonly string[]).includes(t) ? (t as GuideTopic) : alias[t];
  return k ? GUIDES[k] : null;
}
