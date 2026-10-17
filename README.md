# Roblox MCP Bridge

Visible Windows MCP bridge for local Roblox Studio, with persistent notes, focused
Brickwire references, optional REA tooling and Tailscale Funnel connectivity.

## Security

This is **full-PC access with your Windows user's permissions**, not a sandbox.
Only connect trusted clients. Keep keys private and use the visible Stop/revoke controls.
Identity/OAuth data is DPAPI-encrypted per Windows user; local notes are ordinary SQLite.
Neither belongs in this repository or a release. Tailscale is installed/configured separately.
No auto-Play; screenshots use only the official Studio renderer, never OS capture.

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
Captures default to 640x360 JPEG quality 60 with a <=480x270 preview and 6000-byte image budget.\nViews/presets, target framing, compare_to and capture_get crops are supported.\nUnchanged frames return metadata only. Actual visual tokens are model-dependent, not measured.\nThe official renderer does not expose isolation/neutral lighting/part overlays/custom FOV; true requests fail clearly rather than mutate the scene.\nreturn_mode=file returns a **PC-local path**, not a public URL.

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
