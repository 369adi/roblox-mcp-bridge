# Архитектура Brickwire

```
┌──────────── Браузер (вкладка ИИ) ────────────┐      ┌──────── Локально (127.0.0.1) ───────┐      ┌──── Roblox Studio ────┐
│ AI-сайт (ChatGPT, DeepSeek, …)               │      │ Brickwire Bridge (Node.js)          │      │                        │
│   ▲ ответы модели        │ сообщения         │      │  server.ts   HTTP API + SSE + UI    │ stdio│ Studio MCP server      │
│   │                      ▼                   │ HTTP │  bridge.ts   реестр, executor       │◄────►│ (mcp.bat / StudioMCP)  │
│ Provider Adapter  (content script)           │◄────►│  safety      approvals, режимы      │JSON- │   execute_luau,        │
│ Agent Core        (цикл агента)              │ via  │  composites  высокоуровневые tools  │ RPC  │   script_read, …       │
│ Panel UI          (Shadow DOM)               │ bg SW│  memory      память проекта         │      │        ▼               │
└──────────────────────────────────────────────┘      │  logger      JSONL-логи             │      │   ваш place (Edit DM)  │
                                                      └─────────────────────────────────────┘      └────────────────────────┘
```

## Компоненты

| Слой | Файлы | Ответственность |
|---|---|---|
| Shared | `shared/src/*` | Протокол и типы, парсер `ROBLOX_*` блоков, толерантный JSON, валидация аргументов по JSON Schema, оценка риска, реестр провайдеров, тексты инструкций |
| Provider Adapter | `extension/src/adapters/*` | `detect / health / getComposer / sendMessage / readAssistant / isGenerating / injectUI / parseResponse / blockReason` для каждого сайта |
| Agent Core | `extension/src/core/agent-core.ts` | Цикл: отправить инструкции → дождаться окончания ответа → распарсить → выполнить вызовы через мост → вставить результаты → повторить; стадии, напоминания, проверка перед DONE |
| Panel UI | `extension/src/ui/panel.ts` | Панель ROBLOX AGENT: статус, Start/Stop/Pause, задача, стадии, активность, подтверждения |
| Background | `extension/src/background.ts` | Прокси запросов к `127.0.0.1:<port>` (content script сам не ходит на localhost), бейдж, состояния вкладок |
| Bridge | `bridge/src/*` | Процесс MCP, реестр инструментов, исполнение, безопасность, снапшоты, память, логи, Dashboard |

## Поток одного шага

1. Пользователь жмёт **Start**. Agent Core → `POST /api/sessions/start`: мост проверяет MCP/Studio,
   сканирует проект (дерево, скрипты, GUI) в память и возвращает каталог инструментов.
2. Agent Core собирает промпт (`buildAgentPrompt`): правила протокола, каталог инструментов с
   сигнатурами, сводку памяти проекта, задачу. Адаптер вставляет текст в поле ввода и отправляет.
3. Agent Core следит за ответом: `isGenerating()` + стабильность текста `settleMs` (по умолчанию 1500 мс).
4. `parseAgentOutput` находит `ROBLOX_TOOL_CALL` (в code fence или без), чинит «почти JSON», отбрасывает
   поддельные `ROBLOX_TOOL_RESULT`, неполные блоки и дубликаты `id`, извлекает STATUS/DONE/ERROR.
5. До 5 вызовов выполняются **последовательно**: `POST /api/calls` → мост валидирует → оценивает риск →
   при необходимости ждёт подтверждения (панель/Dashboard) → делает снапшот → вызывает MCP → возвращает
   `ToolResult`. Long-poll `GET /api/calls/:id?wait=…` для долгих операций.
6. Результаты форматируются в `ROBLOX_TOOL_RESULT` блоки (с обрезкой под лимит провайдера) и
   отправляются в чат. Если модель не вызвала инструменты / заявила успех без проверки / подделала
   результат — отправляется короткое напоминание.
7. `ROBLOX_AGENT_DONE` принимается только если после последнего изменения была успешная read-проверка;
   иначе агент получает требование проверить.

## Состояния моста

`OFFLINE → BRIDGE_READY → STUDIO_NOT_FOUND | STUDIO_FOUND → MCP_CONNECTING → MCP_READY → SESSION_ACTIVE`, плюс `ERROR`.
Панель показывает их и блокирует Start, пока нет `MCP_READY`.

## Хранение данных

`data/` рядом с мостом: `logs/*.jsonl`, `projects/<placeKey>.json` (память, изменения, снапшоты),
`sessions.json`, `settings.json`. Копии объектов для отката — в самом place:
`ServerStorage.__BrickwireSnapshots` (скрипты внутри отключены).
