# Решение проблем

| Симптом | Причина / решение |
|---|---|
| Панель: **OFFLINE** | Мост не запущен → `start.bat`. Порт изменён → укажите тот же в настройках расширения. |
| Панель жёлтая, **«Bridge connected»**, `[MCP] running, 0 tools` | StudioMCP запущен, но Studio к нему не подключилась (StudioMCP отдаёт 0 инструментов). Откройте Studio, откройте place, включите *Enable Studio as MCP server* (Assistant → ⋯ → Manage MCP Servers). Мост сам перезапрашивает список — зелёный появится без перезапуска. |
| `[STUDIO] connected, but no place is open` | Откройте place (Baseplate подойдёт). |
| `[MCP] not found` | Мост не нашёл `StudioMCP.exe` в `%LOCALAPPDATA%\Roblox\Versions\*`. Обновите/переустановите Studio или задайте путь в `.env`: `BRICKWIRE_STUDIO_MCP_PATH=C:\...\StudioMCP.exe`. |
| **MCP ERROR** | Dashboard → Overview → *Restart MCP*; лог моста — `logs\bridge.log`. |
| Несколько окон Studio | Dashboard → Settings → выберите Studio. |
| Панель не появилась | Обновите вкладку; проверьте, что провайдер включён в настройках расширения; сайт мог сменить вёрстку (см. PROVIDERS.md). |
| Текст вставился, но не отправился | Сайт сменил кнопку отправки или поле ввода. Отправьте сообщение вручную (агент продолжит) и пришлите HTML поля ввода для исправления селекторов. |
| Модель отвечает текстом без вызовов | Расширение само отправит напоминание. Если повторяется — начните новый чат и Start. Для Gemini/Kimi это ожидаемо время от времени. |
| `execute_luau did not return values` в логах | Мост сам переключится в print-режим; можно задать `BRICKWIRE_LUAU_PRINT_RESULTS=1`. |
| Arena: Start заблокирован | Переключитесь в Direct-чат (одна модель). |
| Нужно откатить изменения | Dashboard → Projects → Snapshots → Restore, или Ctrl+Z в Studio. |

Логи: `data/logs/*.jsonl` и Dashboard → Logs.

## Ручной чек-лист

Выполните на Windows с настоящей Studio. Отметьте результат для каждого используемого провайдера.

1. `start.bat` → в окне строка `READY` (BRIDGE OK, MCP N tools > 0, STUDIO place open).
2. `node scripts\studio-e2e.mjs` → `RESULT: PASS` (7/7).
3. Откройте https://chat.deepseek.com → панель с зелёной точкой и надписью **Studio Ready**. Пока агент выключен, сайт работает как обычно.
4. Нажмите **Start Agent**, затем задача: «Изучи Workspace и создай в нём Part с именем AgentTestPart».
5. В панели видны вызовы `search_game_tree`/`execute_luau` (чтение), затем `execute_luau` (создание), затем проверка чтением.
6. В Studio появился `Workspace.AgentTestPart`.
7. Напишите в чат: «Удали AgentTestPart» → панель просит подтверждение → Approve.
8. `AgentTestPart` исчез; агент проверил это и прислал `ROBLOX_AGENT_DONE`.
10. Остановите мост (`stop.bat`) во время работы → панель показывает OFFLINE и ставит агента на паузу.

## Site check (1.5)

Кнопка **Site check** в панели проверяет на текущей странице: найдено ли поле ввода (и какое), кнопка
отправки, как читаются ответы (селекторы или метки, сколько наших сообщений видно), идёт ли генерация,
живы ли фоновые часы. Отчёт копируется в буфер обмена — пришлите его вместе со скриншотом и `logs\bridge.log`,
если сайт не работает. Если поле ввода не найдено 10 секунд, панель сама становится плавающим окном.

## «Программа не обнаружена» / Studio not detected (1.8)

1. Studio должна быть запущена и с открытым place; включите Assistant → … → Manage MCP Servers → **Enable Studio as MCP server**.
2. Мост ищет `StudioMCP.exe` рядом с запущенной Studio (подходит Bloxstrap, Fishstrap, Voidstrap и др.), в
   `%LOCALAPPDATA%\Roblox\Versions`, Program Files, `mcp.bat` и конфигах Claude/Cursor/Windsurf/VS Code.
   Поиск повторяется каждые 15 с — перезапускать мост после запуска Studio не нужно.
3. Не нашлось — укажите путь в `.env`: `BRICKWIRE_STUDIO_MCP_PATH=C:\...\StudioMCP.exe` (или папку с ним).
4. Используете open-source MCP-плагин (инструмент `run_code`)? Задайте `BRICKWIRE_MCP_COMMAND` — мост сам
   перенаправит `execute_luau` на его инструмент.
5. В `logs\bridge.log` строки `mcp.*` (например `mcp.rediscovered`) показывают, какой путь выбран и почему.

## «Client proxy is out of date, restart to update» (1.8.1)

Studio обновилась, а StudioMCP.exe (прокси между мостом и Studio) остался старым. Мост 1.8.1 перезапускает его сам
(StudioMCP.exe рядом с запущенной Studio → самые новые версии) и повторяет вызов. Если ошибка осталась:
1. Закройте **все** окна Roblox Studio, откройте Studio снова (обновление завершится) и откройте place.
2. Мост переподключится сам в течение минуты (или перезапустите `start.bat`).
3. Всё ещё нет — в `.env`: `BRICKWIRE_STUDIO_MCP_PATH=` путь к StudioMCP.exe из самой новой папки `%LOCALAPPDATA%\Roblox\Versions`.

