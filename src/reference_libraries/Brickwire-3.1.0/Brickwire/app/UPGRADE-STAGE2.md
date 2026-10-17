# Brickwire — Application & Plugin, Stage 2: execution foundation and task workspace

This is a tested development milestone towards the supplied 3.0 prompt, **not the complete 3.0 platform or a production release certification**. The application version remains 2.4.0 intentionally. The cumulative PATCH includes Stage 1 MCP management and this stage.

## Scope and installation
Only `app/`, `bridge/`, `plugin/` are changed. `extension/`, `shared/`, original provider adapters, original tests, package manifests and dependencies are unchanged. No user `.env` or `data/` files are included in the PATCH.

1. Stop Brickwire/bridge; back up your installation and project/place first.
2. Copy `Brickwire/` from PATCH over your original 2.4 project (or over Stage 1). Do not delete data or .env. Do not rebuild/reinstall the browser extension.
3. Run the existing application launcher. `bridge/dist/bridge.mjs` and the required UI assets are already built.
4. Open `/app#autopilot`. The separate `/app#mcp` and `/mcp` remain available.
5. Replace the Studio plugin using `plugin/BrickwireChat.plugin.lua` or the generated `.rbxmx`, then restart Studio.
6. A prepackaged Electron installer/executable is not rebuilt by copying source files. Windows/macOS packaging and actual Electron execution require validation on that platform.

New persistent storage lives in existing dataDir, separately from previous stores: `tasks-v1/`, `operations-v1/`. Existing memory/history/library data is preserved. Backups and app rollback do **not** undo remote project changes.

## Implemented
- App Autopilot workspace: Studio selection, tasks, user plan, three modes, call/time budgets, start/resume/pause/cancel, criteria, recorded evidence, operation journal, manual tool execution and actual confirmations.
- Explicit user action starts the **existing** OpenAI-compatible HeadlessRunner with the task's pinned session. It reuses providers, prompts, registry, approvals and Bridge.execute; no second agent engine or dependencies were introduced.
- API-agent pause/resume retains the in-memory conversation while the process is alive. Cancel aborts the LLM request and prevents subsequent calls; it cannot undo in-flight Studio/MCP actions. Across app restart tasks become PAUSED; the LLM conversation is **not** transparently restored. A new explicit agent run is necessary.
- Before an API-agent's final report is accepted, the backend independently inspects user-specified criteria using the existing typed `read_instance` implementation. Supported checks: `exists`, `property`, `script_contains` (truncated/unavailable source is blocked, not passed).
- DONE requires nonempty approved criteria, all passed at the task's current revision and project binding; AI claims and successful transport alone give PARTIAL/BLOCKED/FAILED instead. Writes invalidate previous evidence; resuming invalidates it again. Pending writes prevent claiming completion.
- Task/object/evidence/operation JSON tree endpoint. It is a task tree, **not** a full dependency graph or Live Game Graph.
- Studio/project identity is pinned by Studio ID, available placeId and name; session calls cannot redirect through a new global selection. An explicitly selected missing Studio is not replaced. Per-Studio modifying calls are serialized and target/task permission is rechecked after approval.
- Persisted PREPARE/receipt ledger: same action/session/task/payload is not executed twice; different payload under the same ID is rejected. Unknown outcomes and interrupted PREPARE become uncertain and are not replayed. Reads deliberately bypass result reuse to obtain fresh inspection data.
- A Studio-drop response to a modifying native MCP call no longer triggers automatic replay. Existing explicit stale-proxy rejection recovery is retained.
- Safe no longer treats arbitrary Luau as read-only using regex mutation detection. Only reviewed typed inspection tools are allowed. A closed scalar `return 1/true/nil/"text"` grammar is evaluated **locally**, not sent to Studio. All other raw source requires write permissions; raw source in a task additionally requires explicit confirmation even with trustAll/full.
- Reviewed tree/project/instance/error inspection composites are available without enabling all optional creators. Other creators remain behind the original `BRICKWIRE_COMPOSITES` switch.
- When an advertised auto-checkpoint attempt throws, the corresponding mutation is denied instead of silently continuing. Existing snapshots are reused; this is not universal rollback coverage.
- Plugin has read-only Tasks & verification and MCP diagnostics. AI report event transport remains backward compatible; verificationState is separate and app/plugin display it as an agent report, not proof of a successful play-test.
- Headless HTTP requests have a 120-second per-attempt timeout; per-task operation/time guards and the existing max-turn limit bound continuation. Provider fixtures were used for verification, not real account credentials.

## Exact mode semantics
Plan forbids Studio mutations. Supervised confirms every modifying task call, regardless of full/trustAll. Autopilot uses the existing application/session safety mode for typed calls; destructive, raw-source and custom MCP gates are still enforced. Choosing a task mode does **not** elevate the application/session's safety mode. Safe can therefore deny a modifying Autopilot action.
Budgets count attempted registry calls, including criterion inspections. The task's pause time is excluded. Already-sent remote actions cannot be forcibly undone; uncertainty must be inspected before a new explicit action ID is used.

API-agent configuration remains the existing .env mechanism (`BRICKWIRE_LLM_PROVIDER`, `BRICKWIRE_LLM_URL`, `BRICKWIRE_LLM_MODEL`, `BRICKWIRE_LLM_KEY`). No credential input was added to the task UI. Secrets must not be placed in task text or tool arguments. Newly discovered Skills/MCP tools are not silently activated.

## Changed architecture / files
New backend modules: `execution-policy.ts` (fail-closed classification), `operation-store.ts` (durable receipts/deduplication/queue), `task-runtime.ts` (states/budgets/criteria/evidence), `app-runtime-routes.ts` (application-authorized APIs). New frontend: `app-runtime-ui.js`; application-only styles/navigation are in existing `app.html`.
Integration changes: existing `bridge.ts`, `server.ts`, `headless.ts`, app-only builder, plugin .lua/.rbxmx; generated dist artifacts. Full exact list and SHA-256 values: `app/CHANGE-MANIFEST-STAGE2.json`.
No framework migration, no code copied from PlazCode and no major architecture replacement.

## Tests and evidence
Actual commands and counts are in `app/TEST-RESULTS-STAGE2.json`; full run log in `app/tests/TEST-LOG-STAGE2.txt`.
- Application-only esbuild build and Node syntax checks.
- Original unit/integration suite plus Stage 1 MCP tests and 12 new runtime tests.
- Real local HTTP model fixture + real stdio protocol fixture: tool dispatch, independent criterion inspection, acceptance, auth, task states, confirmation, ledger and binding. Mock Studio parses known generated operations; it does not run arbitrary Luau and is not Roblox Studio.
- Chromium browser interaction: create/start task, manual tool confirmation, fixture mutation, fresh inspection, acceptance, desktop/mobile layouts, navigation, zero page exceptions/horizontal document overflow.
- Six relevant desktop/mobile states rendered through the required Chromium capture helper and visually inspected. Fixed button spacing and title hierarchy; no fake game viewport was added.
- Plugin XML parsed and embedded Source checked byte-for-byte against .lua. This is packaging validation, not Luau compilation or Studio execution.

## Limitations / remaining work
No real Studio, Play test, VFX/animation playback, asset persistence/publication, signed-in production provider, installed Electron or Windows/macOS installer validation was possible here. Luau-VM tests are skipped because the Luau binary is absent; they are not reported as passing. No TypeScript type-check certification is claimed (esbuild bundles/transforms source).
Studio ID/name/placeId are the strongest identity signals currently exposed by the existing bridge. Unsaved place swaps reusing all those identifiers cannot be reliably detected without additional plugin/runtime evidence. External/manual edits are not continuously observed; evidence is a timestamped structural observation, not a lock on the live project.
No safe universal rollback, arbitrary-Luau transaction, ownership ledger, compare-and-set source editing, conflict merge, persisted LLM conversation, visual scenario acceptance or full live graph is claimed. Existing snapshots may be incomplete; uncertain effects need human inspection. Ledger concurrency is single-process, not a distributed lock across multiple bridge processes.
The full 13-section shell, Custom VFX editor/Studio previews, interactive 3D/animation timeline, Paint/Asset refinements, Skills registry, Game Designer, IDE/Luau diagnostics, broad QA/scenarios, transactional recovery and release regression remain staged work. Existing implementations are preserved, not falsely marked upgraded.
Next dependency-first milestone: guarded script patch/diff with conflict detection and ownership-aware recovery, stronger plugin project-generation identity, then unified context/graph and visual workflows. NPC Intelligence Lab and Game Balance Simulator remain deferred. Extension changes remain excluded even where the supplied prompt mentions them.

## Rebuild / tests
Run only `node app/build.mjs` for this scoped upgrade. Original global build may rebuild extension/shared and should not be used for this handoff.
```
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./tests/unit/_register.mjs --test --test-concurrency=1 'tests/unit/*.test.ts' 'tests/integration/*.test.ts' 'app/tests/*.test.ts'
```
This command was run with Node 24. Plugin/runtime acceptance still requires the actual target environment.
