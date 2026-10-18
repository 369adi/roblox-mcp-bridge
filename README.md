# Roblox MCP Bridge 5.7

Visible Windows MCP bridge for local Roblox Studio, with persistent notes, focused
Brickwire references, optional REA tooling and Tailscale Funnel connectivity.

## Security

This is **full-PC access with your Windows user's permissions**, not a sandbox.
Only connect trusted clients. Keep keys private and use the visible Stop/revoke controls.
Identity/OAuth data is DPAPI-encrypted per Windows user; local notes are ordinary SQLite.
Neither belongs in this repository or a release. Tailscale is installed/configured separately.
No auto-Play; screenshots use either the official Studio renderer or explicit verified Studio-window capture. Never the whole desktop or unrelated apps.

## Run/build

Windows 11, Python 3.12, Node.js and Tailscale are required for building/running all features.
Install Python requirements, run `npm ci` inside `rea-runtime`, then `./build.ps1`.
Enable Roblox Studio's MCP server. Run the resulting EXE with `_internal` beside it.
Use the bridge's Copy URL / Copy key controls. Do not paste tokens into environment-variable-name fields.
No system-wide plugin, game or framework is automatically installed.

## Fast workflow

Normal work needs at most one optional bundled `roblox_context` call per chat.
Reuse a stable caller-provided chat_id; cache is in-memory, expires after 24h/restart.
Say `FAST` or `Regeln sind gelesen` to skip optional loading. Safety/scope rules still apply.
Short ProBuilder skill is default; long profile is available only on request.
Design profiles are game-scoped and only relevant for actual design work.
`run_builder` handles cloned ModuleScript loading, cleanup and ChangeHistory recording.
`builder` is the module result; errors can leave partial changes (undo before retrying).
`model_summary` returns counts, top colors/shapes and bounding box.
`model_check` returns heuristic counts and <=10 examples, not proof of rendering correctness.
`execute_luau` output is capped at 4000 characters, including duplicate structured payloads.
Captures default to readable 1280x720 JPEG quality 82. Preview (640x360) is optional, not mandatory.
The normal byte safety limit is 1 MiB, independent of deprecated max_tokens.
The bridge never silently shrinks an image or changes the camera to fit a tiny byte budget.
An insufficient explicit budget returns a clear error plus a locally stored capture_id for recovery.
Views/presets, target framing, compare_to and capture_get crops are supported.
Original per-view pixels are stored losslessly; capture_get(view=0, crop=...) reads original detail.
Unchanged suppression is opt-in so new chats are not denied an unseen image.
Opt-in unchanged checks return metadata and a reusable capture_id. Actual visual tokens are model-dependent, not measured.
The official renderer does not expose isolation/neutral lighting/part overlays/custom FOV; true requests fail clearly rather than mutate the scene.
return_mode=file returns a **PC-local path**, not a public URL.

## Locally enabled Studio plugin UI

For Eclipse and other Studio plugin panels, use studio_windows and studio_window_capture.
The latter captures the verified Studio process window, not desktop rectangles.
In the bridge click **Enable Studio UI (10 min)**. This is local-only, never remotely armable.
**Ctrl+Alt+F12** or **STOP UI** disarms it. Restart/expiry does not silently re-enable it.
Use studio_focus, then a fresh studio_window_capture, then studio_mouse / studio_drag /
studio_scroll / studio_type / studio_hotkey. Coordinates belong to that returned image;
position, dimensions and DPI mapping are checked. Each input invalidates its capture_id;
captures expire after 30 seconds. Other foreground windows or occlusion cause rejection.
Windows keys, shell-switch combinations and Play function keys are blocked.
Never click Play through the UI. The regular renderer capture still handles pure game views.
Old unscoped mouse_action/keyboard_type/keyboard_hotkey are not exposed by this server.
Native window capture uses PrintWindow, has a bounded wait and may fail on minimized/GPU windows.
Failure is an error, never a desktop screenshot. Floating plugin windows must belong to the
verified Studio process. OS dialogs, other processes and arbitrary windows are not allowed.
Windows input is focus-guarded, not an OS-isolated input channel: external focus races
cannot be eliminated completely. Other full-PC shell/filesystem tools are still not sandboxed.
No real mouse/key mutation was used in the fixture tests; verify Eclipse workflows deliberately.

## Extension-free method/reference features

`ultracode(query)` is an independently implemented, bounded task-method router: UI, Luau,
maps, models, animation, VFX, audio and materials. It returns at most three methods.
It is not the PlazCode extension, a model upgrade, a benchmark claim or a giant system prompt.
The bundled `syphodev` library is a text-only subset of eleven separately licensed skills
supplied in PlazCode 1.24.20. No scripts, installers, executables, browser integration or fonts
are imported. Follow the separate LICENSE.txt and ATTRIBUTION.md; some links target absent files.
No full PlazCode GPL program code was incorporated; the bridge is not silently relicensed.

## Updates

After publication, pin `src/update_config.py` to `OWNER/roblox-mcp-bridge` before building.
An empty origin disables network update checks rather than trusting a guessed account.
The app checks GitHub Releases on startup, downloads a newer stable checksummed bundle,
validates every file and stages it locally. Normal app close installs it and restarts the app.
Identity and notes remain outside the installation directory. Backup/rollback files are retained.
No forced mid-task shutdown, silent key rotation or automatic Play.
SHA-256 detects corruption; it is **not independent code signing** or protection from a compromised publisher.
Publish only trusted builds. Release bundles must follow `make_release.py`'s format.

## Third-party material

Brickwire 3.1.0 MIT source/credits are retained under `src/reference_libraries`.
Asset credits do not independently establish redistribution/use rights; verify them before use.
REA/Node/dependency notices remain with their distributions. Tailscale is not bundled.
See THIRD-PARTY-NOTICES.txt and upstream licenses. No additional license is granted for original bridge code.
