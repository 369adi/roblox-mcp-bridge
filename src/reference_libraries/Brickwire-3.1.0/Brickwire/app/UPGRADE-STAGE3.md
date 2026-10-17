# Brickwire — Stage 3: supplied Skills & Templates

Cumulative application/plugin upgrade (Stages 1–3), not completion of the full 3.0 master prompt. Application version stays 2.4.0. Only `app/`, `bridge/`, `plugin/` change; extension/shared, original tests/dependencies and user .env/data are preserved.

## Install / use
1. Stop Brickwire and back up your installation/place.
2. Copy the PATCH `Brickwire/` folder over original 2.4 or Stage 1/2. No .env or data files are included. Do not reinstall/rebuild the extension.
3. Start the existing app/local bridge; open `/app#skills`.
4. Review a Skill's adapter, warnings and sources. Click **Включить явно**, acknowledge guidance authorization. All bundled Skills initially remain disabled. Import never silently activates anything.
5. Start a **new API-agent run/session** to receive the updated active index. An already-sent model context cannot be erased by disabling a Skill; subsequent Skill reads are blocked when disabled. Original browser-provider session contract receives metadata through memorySummary without extension edits; real signed-in provider behavior has not been tested.
6. Templates show real source code, not a game preview. **Скачать .lua** exports it; it does not create objects or run it in Studio. Execute/adapt only through existing approved task tools after inspecting project scope. UI export wraps the complete original `_kit.lua` as `local Kit = (function() ... end)()` before the template. Gameplay logic, purchasing and data persistence are not connected automatically.
7. Replace plugin `.lua`/`.rbxmx`; the new Skills & templates menu reads the actual registry summary, without enabling or invoking anything.

Packaged Electron executables/installers are not rebuilt here. Use the source app/local web workspace, or build/test on your actual Windows/macOS environment.

## Inventory
11 descriptive Skills:
- Roblox Luau style and game architecture (preserves the supplied approximately 80/20 variable-casing preference for NEW/edited locals; no runtime randomness or global rename).
- Strict Luau math/logic/type/nil/units checks.
- Blender → Roblox import, with a manual Import 3D step and runtime-specific scale/API verification.
- Creative workflows: BUILD/UI/ANIMATE/FIX/OPTIMIZE/STYLE/SYSTEM/MEGA/REFINE/TEACH/PIPELINE/COHERENT/INTERACT.
- Lurong core workflow.
- Lurong modeling/world/physics.
- Lurong UI/CheckUI/Kit.
- Lurong interface logic, data, security, monetization (4 Skills).

22 source templates: 6 models (cottage, farm warehouse, kitten, wither, zombie, skyscraper) and 16 GUI examples. CheckUI's four .luau modules are source dependencies, not auto-installed tools.
52 distinct SHA-addressed original resources, including every file from both archives (16 model-pack files, 33 UI-pack files), standalone guidance and NOTICE. Duplicate AGENT.md and the two identical message files share content records while retaining source attribution. Original bytes have been checked against the attachments. The adapters are NEW short Brickwire instructions; original references/templates remain unmodified.

## Adaptation / compatibility
Lurong's `get_reference`, `build_gui`, `build_model`, `find_icon`, `install_checkui` are not invented or presented as existing Brickwire tools. Blender's `execute_blender_code` is not installed by a Skill. The adapters direct the agent to the real registry and its existing tools, retaining permission/binding/acceptance gates. API/scale/"verified" claims in supplied sources are author observations, not independent Brickwire certification. Do not apply a universal /100 scale fix blindly; inspect actual geometry first.
CheckUI NOTICE is preserved. It says the upstream README claims MIT, but no separate LICENSE file/icon-origin information was supplied. This is not proof of rights to every icon/asset; confirm before commercial distribution. No blanket license was invented for other supplied content.

## Runtime / safety
- `SkillRegistry` uses a separate `data/skills-v1.json`; originals remain in app-owned `bridge/skills` and copied build assets. New imports and enabled IDs are saved atomically. Corrupt state is preserved and changes are blocked until recovery; reads expose a useful diagnostic.
- Four registry **read-only** tools: `skills_list`, `skill_read`, `skill_resource`, `skill_template`. Skill/source/template reads for the agent require explicit activation. Manual UI browsing/export does not require activation and does not execute source.
- Active metadata enters the existing HeadlessRunner context; adapters and resources are loaded on demand rather than dumping all sources into every prompt. Resource pages include totalChars, offset/nextOffset, SHA-256 and untrusted flags. Template excerpts supplied to the agent are explicitly marked truncated and must not be executed.
- Skills are NOT new permission grants, executable tools, MCP configurations or installers. No new server/program is launched through import/enable. Existing Studio write approvals, mode, target binding and acceptance remain authoritative.
- Manual JSON format: `brickwire-skill-pack`, version 1. Import needs an explicit trust acknowledgment and starts disabled. Identical imports and unchanged built-in exports do not create duplicates. Custom imports can be removed after confirmation; bundled Skills can be disabled, not deleted.
- Export contains guidance and textual resources; user-imported template/module resources remain references, not silently installed entries in the built-in template catalog. To refine bundled guidance, export JSON, edit the body/version deliberately and reimport as a new custom pack.
- Import limits: 1.5 MB JSON; 1.2 MB resource text; 40 resources; 260k characters/resource; 12k body characters. Resource access is whitelist-linked and SHA-verified; arbitrary local paths/URL fetches/commands are not imported as tools.
- Imported text is escaped/textContent in UI. No HTML/code evaluation, automatic publishing, asset import, purchases or permission elevation.
- Do not put secrets in Skills/source exports. Guidance is local project data, not a credential store. JSON export includes its textual sources.

## Tests actually performed
Final full run: **222 tests / 204 passed / 0 failed / 18 skipped** (Luau binary unavailable). 9 new Skills tests cover default-disabled status, explicit activation, missing dependencies, source deduplication/pagination, Kit composition, JSON round trip/deduplication/restart, corrupt state, authorization, offline safe reads, and a real local HTTP model-fixture run reading an enabled Skill through the actual registry before independent structural acceptance.
These fixtures are not signed-in production AI accounts or Roblox Studio. No original test was edited to make the result pass.
Chromium actual browser interaction passed: enable/refusal without acknowledgment, source paging, complete .lua download, JSON import disabled, duplicate import, escaped labels, filtering/empty state and navigation to Autopilot/MCP. Desktop/mobile captures were visually inspected; fixed empty warnings, resource/button spacing, mobile card-row compression and active-tab visibility. Final mobile bounds audit confirmed every label stays in its card, the list scrolls, and document horizontal overflow is absent.
App-only esbuild and Node syntax checks passed. Plugin XML parsed and Source matched .lua. This does not certify Luau compilation, real Studio execution, animation/VFX, Blender runtime, Electron or installer packaging. Full TypeScript type-check certification is not claimed.

## Files / next work
New `skill-registry.ts`, `app-skills-routes.ts`, `app-skills-ui.js`, `app-skills.css`, catalog/resources, `app/tests/skills.test.ts`; integration in existing bridge/server/headless/app UI/plugin and app-only builder. Exact cumulative hashes/list: CHANGE-MANIFEST-STAGE3.json. Test output: TEST-RESULTS-STAGE3.json and app/tests logs.
Safe script patch/diff, stronger plugin project identity, ownership-aware recovery, live graph, integrated VFX/3D/animation/QA and the full platform shell are still staged work; this milestone does not falsely mark them complete. NPC Intelligence Lab and Game Balance Simulator remain deferred. Extension modifications remain excluded.

Rebuild only `node app/build.mjs`. Roll back by restoring backed-up app/bridge/plugin files, preserving user data. Rollback does not undo prior remote changes or grant access to old disabled Skills.
