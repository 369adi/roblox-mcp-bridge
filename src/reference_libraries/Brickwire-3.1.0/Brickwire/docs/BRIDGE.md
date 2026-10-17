# Brickwire Bridge

Node.js-процесс без runtime-зависимостей (`bridge/dist/bridge.mjs`). Слушает **только 127.0.0.1**.

## Запуск

* Windows: `start.bat` (стоп: `stop.bat`)
* macOS: `start.command`
* вручную: `node bridge/dist/bridge.mjs`

Dashboard: `http://127.0.0.1:47821/` — Overview (статус, подтверждения), Sessions, Tools, Projects
(память, изменения, снапшоты с кнопкой Restore), Logs, Providers, Settings.

## Конфигурация (`.env`)

| Переменная | По умолчанию | Описание |
|---|---|---|
| `BRICKWIRE_PORT` | `47821` | порт API/Dashboard |
| `BRICKWIRE_MCP_COMMAND` | `auto` | `auto` = официальный лаунчер (`cmd.exe /c %LOCALAPPDATA%\Roblox\mcp.bat` / `.../StudioMCP`), `none` = без MCP, иначе команда |
| `BRICKWIRE_MCP_ARGS` | — | JSON-массив аргументов для своей команды |
| `BRICKWIRE_MODE` | `auto` | `auto` / `approval` / `safe` |
| `BRICKWIRE_BLOCKED_TOOLS` | `store_image` | MCP-инструменты, запрещённые для ИИ |
| `BRICKWIRE_DATA_DIR` | `data` | логи, память, сессии |
| `BRICKWIRE_LOG_LEVEL` | `info` | `debug`…`error` |
| `BRICKWIRE_LUAU_PRINT_RESULTS` | `0` | `1`, если `execute_luau` вашей версии Studio не возвращает значения (результат печатается и читается из Output) |
| `BRICKWIRE_STUDIO_POLL_MS` | `4000` | период опроса Studio |
| `BRICKWIRE_HOME` | папка релиза | базовая папка для `.env` и `data/` |

## HTTP API

| Метод и путь | Назначение |
|---|---|
| `GET /api/health` | состояние моста, MCP, Studio, сессии, настройки, ожидающие подтверждения |
| `GET /api/events` | SSE-поток событий (логи, состояние, подтверждения) |
| `GET /api/tools`, `POST /api/tools/refresh` | реестр инструментов |
| `POST /api/mcp/restart` | перезапуск MCP-процесса |
| `GET /api/providers` | реестр провайдеров |
| `POST /api/sessions/start` `{provider, task?}` | новая сессия: скан проекта, каталог, сводка памяти |
| `POST /api/sessions/stop` `{sessionId}`, `POST /api/sessions/update`, `GET /api/sessions` | сессии |
| `POST /api/calls` `{sessionId, provider, call:{id,tool,args}, waitMs?}` | выполнить вызов; возвращает конверт `{callId, state, result?}` |
| `GET /api/calls/:id?wait=ms&since=state` | long-poll конверта |
| `GET /api/approvals`, `POST /api/approvals/:id` `{approve}` | подтверждения |
| `POST /api/snapshots/:id/restore` | откат снапшота из Dashboard (через те же правила подтверждения) |
| `GET /api/projects`, `GET /api/projects/:key`, `POST /api/projects/:key/notes` | память проекта |
| `GET /api/logs?limit=` | последние логи |
| `GET/PUT /api/settings`, `POST /api/studio/select` | настройки, выбор Studio при нескольких окнах |
| `POST /api/shutdown` | остановка |

## Безопасность

* Привязка к 127.0.0.1, проверка `Host` (защита от DNS-rebinding), CORS только для
  `chrome-extension://…` и самого Dashboard. Веб-страницы не могут обращаться к мосту напрямую.
* Режимы `auto/approval/safe`; риск определяется по инструменту **и аргументам** (Luau с `Destroy`,
  массовые циклы, важные системы из памяти проекта, массовые изменения).
* Авто-снапшот перед изменениями, откат `restore_snapshot`.
* Таймауты (обычные 60 с, долгие генерации/плейтест 180 с), повтор чтений один раз, честные ошибки.
