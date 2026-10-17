# Brickwire — Depth workspace rebuild (cumulative 2.4 source upgrade)

Application interface rebuilt around a titanium / optical-blue system: raised beveled controls, layered work surfaces, persistent location bar, responsive navigation, consistent editor panels and actual shaded WebGL geometry. No emoji/pictographic stickers in the app's own UI literals. Original references/templates may still contain their author's symbols: their bytes have not been rewritten for styling.

Only app/, bridge/ and plugin/ are in the cumulative PATCH. Extension/shared/original tests are byte-preserved. Version remains 2.4.0. This is not an executable installer and not a declaration that the entire master plan is complete.

## Install
Stop Brickwire; back up installation, data and place. Merge the PATCH's Brickwire/ folder into original 2.4 or previous cumulative upgrade. Keep your .env and data. Replace the included plugin as previously documented. Launch the existing application/bridge; open /app. Scoped rebuild: `node app/build.mjs`; do not run the original all-project build to keep the extension untouched. Composite Studio tools must be explicitly enabled in Settings. Approve each write separately.

## New working functionality

### Interface and real 3D
- A new workspace landing screen, actual generated crystal viewport and direct working-section launch controls.
- Unified titanium surfaces/blue controls in application, Skills, MCP, Autopilot, dialogs, Paint and UI Builder; existing functionality is retained rather than replaced with decorative buttons.
- Native WebGL solid shaded triangles with real flat normals, depth testing, floor grid, wireframe, orbit, zoom, keyboard controls and reset. No external renderer dependency or generated screenshot stand-in.
- Responsive viewports and ResizeObserver lifecycle; disposal releases observers/programs/buffers. Reduced-motion settings are honored. Forms are not tilted or moved by pointer parallax.
- Local rendering is labeled local, not verified Roblox rendering. Material/collision/persistence acceptance still requires Studio.

### Editable animation timeline
New workspace uses the original shared R6/R15 animation generator and export math without modifying shared/:
- Generate a real time-varying preset, choose frame/joint, edit XYZ rotation and translation, frame time/easing, duration, looping and JSON event markers.
- Add/delete timed frames, seek/play/pause local articulated proxy, undo/redo, persistent project-bound drafts, validated JSON import/export and saved draft loading.
- Preview uses actual edited IR and hierarchical Euler transforms on an explicitly labeled geometric proxy. It is not a scanned avatar. Linear/Constant and a smoothed Cubic are displayed locally; exact Elastic/Bounce/rig behavior is a Studio acceptance step.
- `animation_timeline_read` reads an actual bounded KeyframeSequence through the existing decoder; data is validated before editing. Read-only, not a playback claim.
- `animation_timeline_build` creates an owned sequence in ServerStorage.BrickwireTimelineAnimations with frame/pose hierarchies and markers. Foreign folder/name collisions are rejected. Existing owned sequence replacement requires explicit acknowledgment/approval and keeps a cloned backup. No automatic play or publication.
- Rig inspection and actual playback remain separate approved tools. Compatible pose names/Animator are required; permissions or unavailable APIs stay errors. Import/draft/local playback never edit Studio.
- Limits: simple name, R6/R15, .05–120s, 1–256 uniquely timed frames, 64 bounded markers, known joints, finite rotation ±360° and offsets ±100 studs. Invalid input is rejected, not “fixed” by inventing frames.

This is a working keyframe/joint inspector, not a full Maya-like editor: direct viewport bone picking/transform gizmos, precise scanned-rig skinning, advanced curve editor and publishing pipeline remain absent.

### Live graph observation
- Explicit Start/Stop observation with 5/10/30/60-second intervals while the Project Graph view is active.
- Each cycle invokes a real reviewed workspace_graph read against the pinned project binding. Error, changed binding, inactive page or hidden tab stops observation. No implicit watch after restart/navigation.
- Shows real observed timestamp and added/removed hierarchy path counts. Same scope/binding updates a stable graph record/revision rather than filling storage with hundreds of snapshots.
- Watch is a restricted detached graph read; it cannot call writes and does not consume an unrelated API-agent task's call budget. Target is rechecked in the bridge.
- This is periodic live observation, **not event-level continuous synchronization**: changes between scans, same-path identity replacement, dynamic source dependencies, remotes and external systems can be missed. It is not proof of regression freedom or runtime correctness.

### Real token streaming
- Existing OpenAI-compatible provider loop now requests stream=true and incrementally consumes actual text/event-stream response bodies. JSON providers remain supported without simulated streaming.
- Bounded, UTF-8-safe SSE parser handles split bytes/lines, CRLF, comments, delta events and [DONE]. Malformed/error/interrupted streams fail closed. Interrupted streaming replies are not retried automatically and partial tool blocks are never executed.
- Actual partial text is exposed to the app and displayed during the active request (UI polls the app status at 500 ms). Full completed protocol is parsed only after the stream finishes; writes retain exact scoped approvals and independent acceptance gates.
- The browser status delivery is polling, not an app SSE/WebSocket stream. Provider token streaming is real; display cadence is bounded by polling. No model chunks are fabricated from a final JSON answer.
- A finished AI report still cannot make an unverified task DONE. Pause stops new tool dispatch; stop aborts provider fetch; already-dispatched Studio effects are not undone.

## Verification actually run
See TEST-RESULTS-STAGE5.json and app/tests/*STAGE5*. Full regression: **251 tests, 233 passed, 0 failed, 18 skipped** (Luau executable unavailable). No original test changed. Fifteen new tests cover SSE split UTF-8, limits/errors/abort/interruption, real local HTTP streaming/partial status/completed-only tool execution, animation validation/generator/storage/owned export, actual sequence read contract, authorized pinned graph refresh/stable record, and the session-lock fix (an unverified PARTIAL task no longer blocks a new run; RUNNING/PAUSED still do), and RU/EN localization coverage (see UPGRADE-I18N.md).
Studio-dependent tests use an explicitly test-only JavaScript transport/contract fixture, not a Luau VM or Roblox Studio. Chromium checks exercise the actual app: shaded geometry pixels, pose changes, timed frame creation, undo/redo, real exports/draft persistence, live graph stop, actual local SSE approval/rejection/PARTIAL history, brush raster pixels/undo/redo/PNG/outbox, and actual UIDoc element creation. Desktop/mobile captures are individually inspected and corrected. A previously stale test form wait and old gold-only framebuffer threshold were corrected in the browser harness, not by weakening original tests.

## Not represented as complete
Still absent: universal object/project rollback; full autonomous multi-agent/swarm scheduler; event-level continuous Live Game Graph; full visual/gameplay acceptance automation; full multimedia import/edit/publish pipeline; HTTP/SSE external MCP transport; advanced bone gizmos/scanned-rig animation workspace. No native installers have been rebuilt here.
Still unverified here: actual Studio/Luau compilation/Play, visual/runtime animation and VFX, Blender, signed-in production AI/image/Open Cloud providers, Electron native/Windows/macOS packaging and full TypeScript compiler certification. These require their real environments and are not replaced by fixtures.
Previous cumulative modules (MCP, guarded task runtime, Skills/Templates, VFX/source/design/assets/QA) remain included. Earlier stage reports describe those historical builds; this document and Stage5 report describe the new changes.
