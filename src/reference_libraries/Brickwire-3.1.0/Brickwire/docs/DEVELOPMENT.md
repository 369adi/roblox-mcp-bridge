# Разработка

```bash
npm install
npm run typecheck     # TypeScript strict
npm run build         # extension/dist (MV3, manifest из реестра провайдеров) + bridge/dist/bridge.mjs
npm test              # unit + integration (mock MCP по stdio, Luau VM)
npm run test:e2e      # Chromium + расширение + мост + mock MCP + mock-страницы провайдеров
npm run test:all      # всё сразу
npm run release       # сборка + release/Brickwire + release.zip
npm run dev:bridge    # мост из исходников (tsx)
```

## Структура

```
shared/src      протокол, парсер, валидация, безопасность, провайдеры, инструкции
bridge/src      мост: config, logger, mcp-client, studio-detect, luau, composites, memory, sessions,
                approvals, bridge (executor), server (HTTP), dashboard.html
extension/src   adapters/ (dom, base, providers), core/ (agent-core, bridge-client, settings),
                ui/panel, content, background, popup, options
tests/unit      parser, protocol, safety, luau, memory/session
tests/integration  mcp-client, bridge (HTTP API), luau-exec (настоящая Luau VM)
tests/e2e       harness + providers (настоящий Chromium)
tests/mocks     mock-studio-mcp.mjs (stdio MCP с in-memory DataModel), pages/mock-ai.js
scripts         build.mjs, release.mjs, studio-e2e.mjs
```

## Тесты Luau

`tests/integration/luau-exec.test.ts` берёт настоящий код каждого композитного инструмента,
добавляет стаб Roblox API (`tests/luau/roblox-stub.luau`), компилирует `luau-compile` и выполняет
`luau`. Путь к бинарнику — `LUAU_BIN` (иначе тест пропускается). Бинарники: https://github.com/luau-lang/luau/releases.

## E2E

Требуется Chromium с поддержкой `--load-extension` (Chrome for Testing / Chromium). Путь — `CHROME_PATH` (по умолчанию `/usr/local/bin/chromium`).
Mock-страницы подменяют реальные домены через перехват запросов Playwright, поэтому content script
запускается так же, как на настоящем сайте.

## Новый провайдер

1. Добавьте запись в `shared/src/providers.ts` (id, hosts, url, status, лимит сообщения).
2. Создайте адаптер в `extension/src/adapters/providers.ts` (наследник `GenericDomAdapter` с
   селекторами `composer/send/stop/assistant/streaming/mountAnchor`) и зарегистрируйте в `createAdapter`.
3. Добавьте mock-страницу в `tests/mocks/pages/mock-ai.js` и провайдера в `tests/e2e/providers.e2e.test.ts`.
4. `npm run build` — домены попадут в manifest автоматически.
