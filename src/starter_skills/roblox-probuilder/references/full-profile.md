---
name: roblox-probuilder
description: Apply the user's ProBuilder quality perspectives to Roblox asset building, UI, animation, debugging, optimization, styling, game systems, refinement, teaching and production workflows. Select by the actual request, including ordinary German requests; explicit mode keywords are optional.
---

# ProBuilder for Roblox

Treat the user's BUILD / UI / ANIMATE / FIX / OPTIMIZE / STYLE / SYSTEM / MEGA / REFINE / TEACH / PIPELINE / COHERENT / INTERACT prompts as quality perspectives, not literal mandatory deliverables for every request.

Infer one primary perspective from intent, not just keywords. Combine relevant secondary perspectives: "Mach einen Shop mit Kauf-Buttons" is UI + INTERACT, and SYSTEM only if purchase/economy behavior is requested. "Warum speichert mein Inventar nicht?" is FIX, not permission to replace the inventory. Explicit user scope, references and constraints take precedence. Ask only about missing choices that materially change the result; otherwise state useful assumptions and proceed.

Use the context already loaded in this chat; at most one targeted context call before implementation. Use Brickwire's catalog/skills selectively; verify actual dependencies before using BW.* examples. Do not import whole frameworks merely to satisfy this profile. For changes, define a small observable success criterion and a proportionate check. Read only the relevant perspectives below; a small task does not require a lengthy plan or all outputs.

The user performs playtests manually: do not start/stop Play or create an automatic playtest/fix loop. Use static checks and Edit-mode inspection; report unverified runtime behavior for the user's manual check. Only for genuine design work, load `design_profile_get` once per chat for `place:<PlaceId>` (or the local project id): direction varies by game, never impose one global aesthetic. Save relevant palette/typography/components/motion/references per game with revision-aware `design_profile_set`; unapproved assumptions remain draft. When actual BW helpers are needed, stage the exact operation with `brickwire_prepare`, inspect its code/manifest/asset scripts, then use `brickwire_execute` only within the requested edit scope. This supplies a local BW runtime for that call, not an automatic framework migration.

## BUILD

Use the already-loaded roblox-rules; do not reload context. Vary silhouette, proportions, construction/details or decoration rather than cloning identical geometry or only recoloring it. Distribute variants when populating repeated props; keep the same game's art direction, readable naming and requested scale/performance budget. Share functional logic rather than duplicating global systems. Preserve approved existing models; this does not expand narrow repairs into unrelated work or require three copies of an entire game/map. Respect an explicit request for one exact model/copy.

Use the already-loaded roblox-rules; do not reload context. Avoid duplicate/coplanar visible faces and unintended surface intersections that flicker. Inspect alignment, overlap and scale, and use deliberate separation for visible layered surfaces where needed. Preserve intended internal intersections and silhouettes; never fix this by globally disabling collisions or blindly deleting overlapping parts. Check relevant camera views; still images do not prove the absence of temporal flicker. If geometry is sound, investigate transparency sorting, shadows and animated effects rather than guessing.

Produce assets/environments with an intentional silhouette, scale, proportions, material palette and reusable module boundaries. Fit the existing map and gameplay/collision needs. Choose Parts, MeshParts, textures and external DCC work based on actual available tools and the target device budget. PBR/topology/export work applies only to suitable assets and supported tools; do not claim Blender exports or optimized topology without producing and checking them. Report created instance/module locations and check placement, scale, collisions and visual fit.

## UI

Establish hierarchy, spacing, typography, colors and interaction states before adding decoration. Reuse the game's components and required names. Translate the user's references into specific visual decisions rather than defaulting every UI to minimalist/cyberpunk/fantasy. Use UICorner, UIStroke, UIGradient or TweenService where they support the design, not as a checklist. Check desktop and relevant mobile aspect ratios, text overflow, safe areas, touch targets and input support. Describe intended layout briefly; a Figma-style breakdown does not imply an actual Figma file.

## ANIMATE

The user prefers Eclipse Animator instead of Moon Animator for animation authoring/editing/polish. Use the already-loaded roblox-rules. Verify Eclipse availability and actual UI/tool access in the intended Studio session; do not assume installation or a dedicated MCP API. Use Eclipse Animator when accessible. If access is unavailable, explain the specific limitation and ask before replacing its authoring workflow. Do not claim to have used Eclipse just because a KeyframeSequence was created elsewhere. Preserve existing animation projects, clips and keyframes; publishing/uploading remains a separate authorized action.

Inspect the actual rig, joints, ownership and requested motion. Define poses, timing, easing, anticipation, follow-through, looping/blending and transitions as appropriate. Create only requested clips; idle/run/attack/emote/death are examples, not automatic scope. Distinguish keyframe timing, target playback and measured device FPS. Verify available import/export and publishing permissions before claiming an animation asset exists; preview actual motion where possible.

## FIX

Gather the failing path, relevant code and runtime evidence; identify the root cause rather than replacing whole systems. Apply the smallest justified fix, explain why it works and check the original reproduction plus a relevant regression. Add concise prevention guidance only when useful. If the user asks for diagnosis/explanation only, do not implement changes without authorization.

## OPTIMIZE

Measure or establish a reproducible baseline first. Identify whether scripts, rendering, physics, networking, memory or loading dominate; optimize that bottleneck. StreamingEnabled, LOD, atlases, collision changes and asset consolidation are conditional options with tradeoffs. Never disable required collisions globally or present engine occlusion as a universal script switch. A 60 FPS target is a goal on a specified device/workload, not a guaranteed result. Compare before/after evidence and preserve behavior.

## STYLE

Extract palette, value contrast, shapes, material treatment, lighting and motion language from the supplied reference. Adapt those principles coherently to the game rather than claiming an exact match without visual evidence. Preserve functionality and gameplay readability. Use original or authorized assets; a named reference does not grant asset rights. Avoid expensive effects whose visual gain does not justify the target-device cost.

## SYSTEM

Define interfaces, data ownership and failure cases before adding modules. Keep authoritative gameplay/economy validation server-side, validate remote payloads and context, and handle abuse/rate limits and lifecycle cleanup. Integrate existing persistence and migration rules; DataStore2/ProfileService are examples from the user's prompt, not mandatory dependencies or assumed current recommendations. Verify maintenance/API compatibility before choosing a new package. Test failure/retry paths and never write to production stores as an incidental test. Include only requested controls, stats and monetization.

## MEGA

For an explicitly requested starter/game scaffold, establish the core loop and a small playable vertical slice before expanding folders and systems. Define module responsibilities, replication boundaries, minimal UI and performance assumptions. Add monetization only when requested or explicitly accepted, never publish or change live products as a side effect. Clearly separate implemented/tested functionality, placeholders and future work; do not label an untested scaffold production-ready.

## REFINE

Identify the weakest observable aspects of the supplied result, then improve a coherent set: composition, feedback, motion, accessibility, edge states or detail. Preserve the approved direction and functionality. Offer A/B variants when the design choice is genuinely unresolved, not as automatic extra work. Show/check the actual result when tools permit; "AAA" is an ambition, not evidence of quality.

## TEACH

Explain at the user's level with an actionable example, the reason behind important choices and relevant pitfalls. Prefer a runnable/testable small example over a full unrelated system. Teaching is not permission to edit the project unless requested. Distinguish verified APIs/tool capabilities from conceptual suggestions.

## PIPELINE

Map the actual creation/import/integration/test/handoff boundaries and the artifacts between them. Use existing naming, source-control and collaboration conventions; introduce tools only when they solve a concrete gap. Include proportionate QA and recoverability. Do not install external tools, change global configuration or upload/publish assets merely because a workflow mentions them.

## COHERENT

Audit existing components/assets, extract a reusable visual language and record approved tokens, component patterns, icon rules and motion behavior. Apply consistently without renaming required instances or breaking script references. Produce a style guide at the scale of the task, not a large style bible for a single button. Save accepted design decisions to project memory.

## INTERACT

Specify applicable default, hover/focus, press, release, selected, disabled and loading/error states. Support the requested mouse/touch/controller paths; do not rely on hover for touch. Provide visible feedback and cleanup for event connections/tweens. Add sound hooks only where useful and never invent uploaded sound ids. Keep purchase/gameplay validation on the server; client animations are not authority.

## Completion standard

Use the already-loaded roblox-rules; do not reload context. Capture after building, after corrections and at final review; combine identical phases and omit pre-build images for new objects. Capture ONLY Studio-rendered content via `screen_capture(studio_id)` or official Studio MCP. Never capture desktop pixels, monitors or OS window/region rectangles, and never use shell/REA/browser screenshot workarounds. Inspect images against this game profile/references without unchanged polling. If Studio capture fails, report the limitation; do not substitute a desktop capture or start Play. Studio image coordinates are not desktop mouse coordinates.

All in-game text must be English. Preserve unrelated user edits. Use actual Studio/screenshots/logs where useful; do not invent observations, tests, exports or performance results. Summarize the result, the checks actually performed and any limitations. Store compact durable project decisions, not secrets or entire chats. This profile guides the client model; it cannot force a client to load skills, grant permissions or guarantee visual quality.
