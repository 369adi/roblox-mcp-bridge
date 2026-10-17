# Roblox Studio MCP

Brickwire использует **встроенный** MCP-сервер Roblox Studio (официальная документация:
https://create.roblox.com/docs/studio/mcp). Плагины не нужны.

## Включение

Roblox Studio → **Assistant** → меню **…** → **Manage MCP Servers** → **Enable Studio as MCP server**.
Studio создаёт лаунчер: Windows `%LOCALAPPDATA%\Roblox\mcp.bat`, macOS
`/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP`. Мост запускает его как дочерний процесс (stdio).

## Клиент (`bridge/src/mcp-client.ts`)

* JSON-RPC 2.0 по stdio, `initialize` (protocol `2025-06-18`), `tools/list` с пагинацией,
  `notifications/tools/list_changed` → автоматическое обновление реестра.
* Ответы на `ping` и `roots/list` от сервера.
* Таймаут каждого запроса + `notifications/cancelled`.
* Падение процесса → переподключение с экспоненциальной задержкой; на Windows дерево процессов
  завершается через `taskkill /T`.
* Если запущено несколько Studio, используется `list_roblox_studios`, `studio_id` подставляется
  автоматически (выбор — в Dashboard → Settings).

## Реестр инструментов

Реестр **динамический**: всё, что вернул `tools/list` вашей Studio, + композитные инструменты Brickwire +
служебные инструменты моста. Если Studio не предоставляет какой-то инструмент, он не появляется.

**Нативные инструменты Studio** (по документации): `script_read, multi_edit, script_search, script_grep,
search_game_tree, inspect_instance, execute_luau, get_studio_state, start_stop_play, get_console_output,
screen_capture, character_navigation, user_keyboard_input, user_mouse_input, generate_mesh,
generate_material, generate_procedural_model, wait_job_finished, search_asset, insert_asset,
upload_image, store_image, subagent, http_get, skill, list_roblox_studios`. `store_image` по умолчанию
заблокирован (читает локальные файлы).

**Композитные инструменты** (работают через `execute_luau`, регистрируются только если он есть):

| Инструмент | Риск | Назначение |
|---|---|---|
| `get_game_tree` | read | дерево экземпляров с ограничением глубины/узлов |
| `get_project_info` | read | сводка: сервисы, скрипты, GUI, RemoteEvents |
| `read_instance` | read | свойства (умные значения по умолчанию по классу), атрибуты, дети |
| `create_instance`, `create_part`, `create_instance_tree`, `create_model`, `create_ui`, `create_vfx` | write | создание (отказ при дубликате имени, `replaceExisting` для замены) |
| `modify_instance` | write | свойства/атрибуты/переименование, возвращает before/after |
| `clone_instance` | write | копия |
| `create_script`, `set_script_source` | write | скрипты |
| `delete_instance`, `delete_script`, `restore_snapshot` | destructive | удаление, откат |
| `take_snapshot` | write | ручной снапшот |
| `get_errors` | read | ошибки/предупреждения из Output |

**Инструменты моста**: `memory_get`, `memory_note`, `list_snapshots`.

Весь генерируемый Luau возвращает ровно один JSON-пакет `BWJSON<<…>>BWJSON`, ошибки ловятся через
`pcall`, изменения добавляют точку в Undo-историю (ChangeHistoryService). Этот Luau проверяется
тестом `tests/integration/luau-exec.test.ts` в настоящей Luau VM.
