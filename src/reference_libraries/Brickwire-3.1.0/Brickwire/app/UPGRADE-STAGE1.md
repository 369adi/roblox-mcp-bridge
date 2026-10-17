# Brickwire 2.4 — application/plugin upgrade, stage 1

## Scope
Implemented: application-owned MCP management and read-only MCP diagnostics in the Studio plugin.
This is NOT completion of the full platform-upgrade prompt.
All original `extension/` and `shared/` files are byte-identical to the supplied 2.4 archive.
No new dependencies. No changes to user data, .env, original packages, or provider adapters.
No Studio execution, asset publication, Windows installer build, or real signed-in provider test was performed.

## Installation for the existing 2.4 project (Russian)
1. Остановите Brickwire/bridge. Сохраните резервную копию текущей папки приложения.
2. Из PATCH-архива скопируйте содержимое папки `Brickwire` поверх существующей папки Brickwire.
   Патч содержит только `app/`, `bridge/`, `plugin/`. Папок `extension/`, `shared/`, `data/` и `.env` в нём нет.
   Не удаляйте пользовательские данные и не запускайте install.bat ради этого обновления.
3. Запустите существующий `start-app.bat` (bridge/dist уже собран).
   Если используете упакованный Electron installer, исходный установленный .exe этим ZIP не пересобирается:
   используйте локальный /app либо соберите Electron отдельно в Windows после проверки.
4. Откройте MCP в приложении. Полная прямая страница: `/mcp`; встроенная: `/app#mcp`.
5. Для плагина используйте обновлённый `plugin/BrickwireChat.plugin.lua`.
   Существующий start.bat устанавливает его прежним способом; перезапустите Roblox Studio после установки.
6. Расширение не переустанавливайте и не пересобирайте.

## Rollback
Stop bridge; restore the backed-up app/bridge/plugin files. Preserve data and .env.
The new configuration is stored separately in data/app-mcp.json; previous Brickwire ignores it.
Rollback does NOT undo external MCP tool actions; those may require service-specific recovery.

## Features
- Dedicated MCP application tab, standalone workspace, keyboard navigation, responsive layout.
- Explicitly authorized local stdio commands, no shell-string launcher, no automatic connection on startup.
- Create/edit/remove/enable/disable/connect/disconnect/retry/refresh connections.
- Actual initialize handshake; tool, resource and prompt discovery (when advertised).
- Searchable tools and schemas, per-tool execution mode, separate agent access opt-in.
- New tools default off; edited configurations reset permissions; changed schemas require reauthorization.
- Reuse existing bridge executor/validation/approvals/history. Namespaced tool IDs avoid collisions.
- Confirmed tools ALWAYS require approval even in legacy full/trust-all mode; safe mode denies them.
- Resources/prompts require separate read grants; no prompt is automatically executed/injected.
- Minimal child environment plus explicit references to bridge environment variables.
- Credential redaction in managed logs, results and bridge action history; no UI plaintext credential storage.
- App-session protection for new configuration routes; origin/Host checks retained.
- Plugin menu: MCP connections, real status/tool counts, address of the application workspace.
- Agent DONE is presented as an unverified agent report in app/plugin, not independent QA.
- Electron external navigation restricted to HTTPS and local HTTP; arbitrary protocols blocked.

## Credential setup
Set secrets externally in the bridge environment or existing .env (not in command arguments).
The app stores variable NAME references only. Example envRefs: {"API_KEY":"MY_MCP_API_KEY"}.
Selected values are passed only to that server. Other bridge secret variables are not inherited.
This is not an OS sandbox: a trusted local process still runs with the user's OS permissions.
On Windows, the host's userData/file ACLs apply; no claim of keychain storage is made.

## Unsupported / remaining
- Only newline-delimited JSON-RPC stdio is supported here; Streamable HTTP/SSE/OAuth are not implemented.
- The built-in Studio connection remains managed by existing Studio/.env settings (not duplicated).
- Resource templates/subscriptions are not implemented; resources/list and prompts/list/read/get are supported.
- Prompt discovery is metadata-only. Images from MCP still follow existing text-only summarization.
- Live provider/Studio, Electron packaging and plugin rendering must be tested in the user's Windows/macOS setup.
- Existing legacy read-only Luau classification, task verification, project binding and universal rollback risks
  from the audit remain unresolved. This stage hardens the NEW managed-server path, not all legacy tooling.
- Full navigation, Autopilot, Live Game Graph, VFX/Animation/Paint upgrades and Skills remain future stages.
- Revoking access prevents future calls, but cannot undo an already running external operation.
- No automatic approval of newly discovered tools and no automatic package installation.

## Verification actually performed
- App-only esbuild build (Node 20 target); JS syntax checks.
- 8 new app/tests/mcp.test.ts integration cases: authorization, lifecycle, discovery, schemas,
  environment isolation/redaction, errors, agent/manual access, approvals, safe-mode block and history.
- Existing unit/integration suite: 193 tests = 175 pass + 18 skipped (Luau binary unavailable), 0 failures.
- Chromium against real local application + a clearly named local MCP test fixture:
  add/configure/connect, permission save, invoke/read result, resources and live search; no page errors.
- Visual inspection: MCP workspace desktop 1440x1080, mobile 390x844, add-server dialog and result dialog.
- No horizontal document overflow; vertical scrolling of tool lists is intentional.
- SHA-256 comparison against original ZIP: extension and shared unchanged.

## Build/test without touching extension
From project root:
  node app/build.mjs
Standard development setup may use the original root devDependencies; this update adds none.
In the audit sandbox, tests ran with Node 24's TS transformer and existing resolution hook:
  node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./tests/unit/_register.mjs --test --test-concurrency=1 app/tests/mcp.test.ts
  node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./tests/unit/_register.mjs --test --test-concurrency=1 "tests/unit/*.test.ts" "tests/integration/*.test.ts"
The original `npm run build` is intentionally NOT used: it rebuilds extension/dist.

## Next coherent stage
Backend-owned task evidence and project binding, then an app/plugin Autopilot workspace.
Keep extension and shared unchanged; do not add fake navigation or previews for unimplemented modules.
