# Brickwire 2.4 — cumulative application/plugin Workspaces upgrade

This source upgrade includes Stages 1–3 (MCP, guarded task runtime, supplied Skills) plus the Workspaces work below. **It is not completion of every feature in the supplied 3.0 master plan.** Version remains 2.4.0. Only app/, bridge/ and plugin/ are changed. Original extension/ (54 files), shared/ (40 files), original tests and dependencies are byte-preserved; no original files are removed. No user .env, credentials, installation data or QA-generated images are shipped.

## Installation
1. Stop the application/bridge and back up the installation, local data and Studio place.
2. For an existing original 2.4 or Stage 1–3 installation, merge the PATCH's `Brickwire/` contents into that installation, replacing the included files. FULL contains the cumulative source project. Neither archive is an executable installer.
3. Replace the Studio plugin using `plugin/BrickwireChat.rbxmx` (or your existing installation method for the .lua source). Reopen/reload the plugin and start the existing bridge/application.
4. Open the local `/app` workspace. Existing Browser/plugin chat, history, personal library and license flows are retained. Do not reinstall or rebuild the extension for this upgrade.
5. In Settings, explicitly enable composite tools if desired. This registers existing and reviewed composite tools; it does not run them, enable MCP servers or activate Skills. Mutating workspace calls still require separate approval, including in full/trusted modes; safe mode denies them.
6. Select the actual Studio. Draft saves/local previews do not modify it. Inspect the target and exact arguments before approval. Unknown operation results require inspection, not blind retry.
7. Optional source rebuild: `node app/build.mjs` from the project root. This scoped build updates bridge/dist and plugin XML, not extension/shared. Do not use the original all-project build when you want the extension left untouched.

## Delivered capabilities

### Application shell and existing editors
Desktop and mobile navigation exposes Autopilot, Paint Studio, 3D & Animation Lab, VFX Studio, Game Designer, Scripts & Tools, QA & Testing, Project Graph, Asset Library, Skills & Templates, MCP, Integrations and Settings. Existing chat/history/overview/license/update flows remain.
Paint Studio embeds the actual existing raster Paint and UI Builder; it is not a replacement implementation. Headers wrap; panels fit the iframe and mobile viewport. Canvas fitting uses its container. UI Builder preserves native document coordinates while scaling the stage display. Raster brush, undo/redo, real PNG download and application outbox queuing were browser-tested. **Queued is not delivery.** Application Paint uses `/paint?workspace=1` and the existing outbox endpoint; the extension's original embed convention remains unchanged. UI Builder correctly handles pending_approval, requires approval for its app-workspace write, and does not report queuing as successful Studio assembly.

### Persistent project workspaces
`data/workspace-v1.json` atomically stores project-bound design/VFX/asset/QA/graph/note/conversation records with revisions. Stale revisions and cross-project updates are rejected; corrupt state is preserved and writes are blocked. Limits: 300 records, 512 KB per record data, 12 MB aggregate. These are drafts/observations, not acceptance certificates. Bundled asset favorites deduplicate by asset and binding.

### 3D & Animation Lab
Local procedural preview uses the same existing geometry generator as bridge tools, rendered as real WebGL wireframe. Six supported primitive/procedural types, seed, pointer/keyboard rotation/zoom and actual OBJ download; Studio creation uses the existing approved tool. Local preview does not verify Studio rendering, materials, collision or mesh persistence.
Animation tools expose actual registry schemas, generation/edit/analyze operations and new rig inspection/temporary playback. `rig_inspect` reads actual Humanoid/Animator/Motor6D names. `animation_preview_actual` checks compatible pose names, registers a temporary KeyframeSequence and attempts Animator playback; stop only targets owned Brickwire preview tracks. Unsupported APIs/permissions are errors, not fabricated playback. **No complete interactive bone/timeline editor, published animation pipeline or real-Studio verification is claimed.**

### VFX Studio
Editable, persistent, JSON-exportable multi-layer IR, layer inspector, timing bars, seek/replay/reset controls. Layer types: elliptical ring, sphere, block, particles and light; bounded dimensions, offsets, timing, colors, scale/transparency, count and brightness. Relevant fields only are presented for each layer.
`vfx_timeline_build` creates an owned template and Runtime ModuleScript in ReplicatedStorage.BW_TimelineVFX. Replacement is explicit and only for owned effects; old content is cloned to ServerStorage. Runtime uses coordinated TweenService geometry/light animation, particle NumberSequences/emission and cleanup. Preview/seek/reset are separate confirmed Studio operations; seek shows geometry, not a particle simulation. Studio screenshots display only actual raster results from screen_capture; no local drawing is mislabeled as Studio. **Runtime generation is implemented, but its Luau execution/visual correctness still needs actual Studio acceptance.**

### Scripts & Tools
`source_read_guarded` reads the complete ScriptEditorService editor source (bounded to 200 KB). Known-secret redaction marks it incomplete and blocks overwriting a masked source.
`source_patch_guarded` compares expected source inside UpdateSourceAsync, preserves original script identity/attributes, and stores an owned scoped source checkpoint before the write. Stale source is rejected. Post-read verifies editor-source equality only, not execution.
`source_restore_guarded` requires the same saved ObjectValue target and unchanged post-write source. It refuses replaced scripts, newer edits and already-restored checkpoints. Failed attempts retain their checkpoint for inspection. This is **source-only restoration, not universal project rollback**. UI includes diff, exports, checkpoint list/restore and manual schema-based tools.

### Game Designer and Project Graph
Structured design stores concept/core loop/world/progression/economy/UI/dependencies/objects, goal, plan and structural criteria. Creating a linked task is idempotent and creates a PLANNED Supervised task; it does not execute it.
`workspace_graph` scans actual hierarchy and bounded static source references. Default 1,200 objects; exported JSON records binding/time/partial status. Static impact traversal excludes mere containment to avoid treating the entire game as a dependency. This is **a stale-able snapshot, not continuous/live synchronization**, and may miss dynamic require, remotes or external dependencies.
`workspace_context` and `workspace_impact` provide selected-project, bounded, explicitly untrusted/stale observations to the real API agent. Context does not grant permissions or certify acceptance.

### QA & Testing and Asset Library
Actual available inspection/Play/error/test tools and successful operation receipts are exposed. nil/skipped results are blocked checks, and a successful transport receipt is not a blanket pass. Experimental Play behavior needs the real Studio runtime. Existing bundled asset index supports search/type filter, actual metadata, favorites and source export; missing part counts are not reported as zero. Original personal-library limits/license flow remain. No universal asset import, media editor, automatic publishing or new commercial asset-license guarantees are claimed.

### API conversations, integrations and settings
Project-bound saved conversations use the existing HeadlessRunner and actual configured HTTP provider. Each request creates a guarded task; previous messages are bounded lower-priority context. Plan mode is read-only; Supervised changes require scoped approval. Pause/resume/stop operate on the runner/task, but do not undo dispatched effects. Rejected/expired approvals are not replayed. Final reports are saved with the backend's acceptance state; **without independent criteria evidence, “done” remains PARTIAL**. UI exposes turn-level progress/tool-use, not token streaming.
Integrations saves nonsecret provider/endpoint/model preferences for subsequent runs, prevents changing an active run, and preserves external BRICKWIRE_LLM_KEY. Existing openai/deepseek/openrouter/ollama/lmstudio/custom paths are reused; only local HTTP fixtures were tested here, not paid/signed-in providers. HTTPS or local HTTP endpoint validation is enforced; keys are not returned. Images/Open Cloud continue using the existing BRICKWIRE_IMAGE_* and ROBLOX_OPEN_CLOUD_API_KEY settings/tools. Configuration presence is not service verification.
Settings persists execution mode/timeouts/snapshot preferences and composite-tool availability with explicit acknowledgment. Plugin's Project workspace menu reads real draft metadata and selection context, without executing changes or pretending selection is a test result.

### Prior delivered stages remain included
See UPGRADE-STAGE1.md, UPGRADE-STAGE2.md and UPGRADE-STAGE3.md for stdio MCP trust/access rules, operation idempotency, task evidence/revisions, and supplied Skill adaptation/import.
**11 Skills, 22 source templates and 52 distinct original resources** are preserved by SHA-256. Bundled Skills remain disabled by default. Import/activation does not grant tool permission or execute templates. Source author claims of “verified”, “60 FPS” or “production-ready” are not Brickwire verification.

## Tests actually performed
- Scoped app build passed. Node/Chromium checks passed; plugin XML parsed and embedded Source matched .lua.
- Final regression: **236 tests; 218 passed; 0 failed; 18 skipped** because the Luau binary is unavailable. No original test was edited. 14 new workspace tests cover persistence/revisions/binding/corruption/favorites, graph impact, bounded raster captures, reviewed execution risk, source/VFX contract handling, route authorization, local geometry, linked tasks and real local HTTP API conversation/approval/acceptance paths.
- Studio contract tests use an explicitly test-only JavaScript fixture under app/tests. It is **not a Luau VM or Roblox Studio**. Generated Luau checks and transport contracts do not prove real execution.
- Actual Chromium interactions covered read/diff/approval/source restore, real local WebGL pixels/OBJ download, VFX drafts/confirmation, graph/impact, linked tasks, assets/favorites, configured local HTTP API requests/scoped rejection/PARTIAL history, raster pixels/undo/redo/PNG/outbox and editable UIDoc creation.
- Desktop 1440×1080 and mobile 390×844 states were captured and individually inspected. Fixed clipped embedded toolbars, inappropriate checkbox sizing, output/button spacing, stale design revision labels, canvas-fit race in the QA harness and editor-mode highlighting. Main workspaces intentionally scroll vertically; no page-wide horizontal overflow was accepted in browser checks.
- Reports/logs: TEST-RESULTS-STAGE4.json, CHANGE-MANIFEST-STAGE4.json, app/tests/*STAGE4*. Browser fixtures contain no real account credential or verified production game result.

## Still absent or unverified — not “all done”
Not implemented as complete features: continuous Live Game Graph, full autonomous multi-agent/swarm workflow, universal object/project rollback, full interactive animation/bone timeline, full visual/behavioral game acceptance, complete multimedia import/edit/publish pipeline, token-by-token streaming, HTTP/SSE MCP transport.
Not verified in this environment: actual Roblox Studio/Luau compilation and Play, VFX/animation visual/runtime behavior, Blender execution/import, signed-in production AI/image/Open Cloud services, Electron native runtime/Windows/macOS executables/installers, full TypeScript compiler check and rights to every third-party asset/icon. These limitations are retained rather than represented by simulated success.

## Real Studio acceptance checklist after installation
Use a disposable backed-up place. Select the correct Studio; inspect active Skills and actual tool registry. Verify Plan/safe mode deny writes; Supervised approval changes only the displayed target. Read/edit source, introduce a conflicting editor change, confirm CAS rejects it; restore only an unchanged owned checkpoint. Inspect a real rig before generation/playback. Build a new VFX effect, replay/seek/reset, check actual output/errors, then save/reopen the place to verify persistence. Run structural and Play/visual checks separately; do not count missing checks as passed. Rescan graph after edits. Test provider credentials locally without adding them to Skills, exports or logs. Restore backups for unsupported destructive operations.
