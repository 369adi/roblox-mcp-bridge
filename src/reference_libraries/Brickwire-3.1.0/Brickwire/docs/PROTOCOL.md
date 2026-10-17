# Протокол агента

Модель общается с Studio **только** XML-подобными тегами в тексте ответа (как в ZeroScript).
Рекомендуемая форма — тег внутри ```json блока (сайты не портят содержимое код-блоков):

````
```json
<ROBLOX_TOOL_CALL>
{"id":"c1","tool":"execute_luau","args":{"code":"print(#workspace:GetChildren())","datamodel_type":"Edit"}}
</ROBLOX_TOOL_CALL>
```
````

**Длинный Luau — только сырым блоком** (без JSON и экранирования, любой длины; так же делает ZeroScript):

````
```lua
<ROBLOX_LUAU mode="Edit">
local p = Instance.new("Part")
p.Name = "MyPart"
p.Parent = workspace
print(p:GetFullName())
</ROBLOX_LUAU>
```
````
Превращается в `execute_luau {code, datamodel_type}`. `mode` = Edit (по умолчанию) / Server / Client.
Без закрывающего тега блок считается неполным и **не выполняется** — модель получает просьбу прислать его целиком
(очень длинный код — частями по ~250 строк).

Ответ расширения: `<ROBLOX_TOOL_RESULT>{"id":"c1","status":"success","result":…}</ROBLOX_TOOL_RESULT>`.
Конец задачи: `<ROBLOX_AGENT_DONE>краткий итог</ROBLOX_AGENT_DONE>`. Парсер понимает тег и вне код-блока,
с «хромом» сайта между строками (json / Copy / Download), алиасы `name`/`arguments`, авто-`id`.

Инструменты — те, что **сам StudioMCP** отдаёт в `tools/list` (обычно `execute_luau`, `search_game_tree`,
`inspect_instance`, `list_roblox_studios`, `get_studio_state` …). Старые составные инструменты моста
(`create_part`, `get_game_tree` …) выключены по умолчанию (`BRICKWIRE_COMPOSITES=1` включает).

## Маркеры

| Маркер | Кто пишет | Содержимое |
|---|---|---|
| `ROBLOX_TOOL_CALL` | модель | `{"id": string, "tool": string, "args": object}` |
| `ROBLOX_TOOL_RESULT` | **только** расширение | `{"id", "status": "success"\|"error"\|"denied"\|"rejected"\|"timeout", "result", "error"}` |
| `ROBLOX_AGENT_STATUS` | модель | `{"stage":"ANALYZE\|PLAN\|EXECUTE\|TEST\|FIX","task":"…","note":"…"}` |
| `ROBLOX_AGENT_ERROR` | модель | `{"message":"…"}` — не может продолжать |
| `ROBLOX_AGENT_DONE` | модель | текст или `{"summary":"…"}` — задача выполнена и проверена |

## Правила парсера (`shared/src/parser.ts`)

* До 5 вызовов на сообщение (настраивается); лишние не выполняются — модель получает просьбу прислать их следующим сообщением.
* Терпим к шуму: текст между маркером и JSON, одинарные кавычки, хвостовые запятые, комментарии,
  неэкранированные переводы строк в строках (`json-lenient.ts`).
* Незакрытый блок → `incomplete` (ждём, пока модель допишет).
* `ROBLOX_TOOL_RESULT`, написанный моделью, считается **подделкой**: игнорируется, модель получает напоминание.
* Блоки внутри «мыслей» (DeepSeek DeepThink и т.п.) не читаются — их исключает адаптер.
* Повторный `id` внутри одного сообщения получает суффикс `#n`; вызов с уже выполненным `id` из прошлых сообщений повторно не выполняется.

## Пути и типы

Пути — через точку от `game`: `game.Workspace.Map.Door`. Имена с точками/пробелами: `game.Workspace["My.Part"]`.
Типизированные значения:

```json
{"$type":"Vector3","value":[0,5,0]}
{"$type":"Color3","value":[255,0,0]}      // или "#ff0000"
{"$type":"UDim2","value":[0.5,0,0.5,0]}
{"$type":"Enum","enum":"Material","value":"Neon"}
{"$type":"Ref","path":"game.Workspace.Part"}
```

Также поддерживаются `Vector2, UDim, CFrame, BrickColor, NumberRange, NumberSequence, ColorSequence`.
Мост дополнительно приводит простые массивы/строки к типу текущего свойства (например `Size: [4,1,4]`).

## Результаты

Длинные результаты обрезаются под лимит сообщения провайдера с подсказкой сузить запрос.
Результат всегда честный: при ошибке — `status:"error"` и текст ошибки Studio, успех никогда не подделывается.

## 1.3: библиотека BW и восстановление после перезагрузки

* Если код `execute_luau` (в том числе из блока `<ROBLOX_LUAU>`) содержит `BW.`/`BW:`, мост подставляет
  перед ним `shared/src/bw-helpers.luau` (выключить: `BRICKWIRE_LUAU_HELPERS=0`). Номера строк в ошибках
  пересчитываются в строки кода ИИ; ошибки внутри библиотеки помечаются `BW-helper`.
* Политика безопасности считает `BW.part/new/model/script/patch/screen/ui/particles/light/leaderstats/killPart/remote/folder/set/weldAll`
  изменением (write); `BW.find/get/exists/tree/report/check/source/scan/logs/joints` — чтением.
* Расширение сохраняет состояние сессии в `chrome.storage.local` (`bw_run_<provider>`, версия 1, срок 24 ч):
  этап, задача, обработанные ответы, журнал панели и незавершённый пакет вызовов с `callId` моста.
  После перезагрузки того же чата (тот же `location.pathname`) и при живой сессии моста агент продолжает работу;
  незавершённые вызовы дочитываются через `GET /api/calls/:id`, а не отправляются заново.

## 1.5: метки доставки, Notion mode, стройка

* Каждое сообщение расширения заканчивается строкой `[bw:xxxxx]` (`[a-z0-9]{5}`). ИИ не должен её повторять;
  если повторит — учитывается только первое вхождение. Используется для подтверждения доставки
  (переотправка до 4 раз) и для чтения ответа «после нашего последнего сообщения».
* Инструкции зависят от провайдера: для `notion` добавляется раздел **NOTION MODE** (и `DEV LOG is ON/OFF`).
  Справка по `BW` в инструкциях сокращена до тем выбранной категории (`bwApiFor(category)`).
* Политика безопасности считает изменением (write) также `BW.animate/door/rig/keyframes/playAnim/patrol/playerAnims/toolAnim`
  и строительные `BW.block/wall/room/roof/stairs/fence/cylinder/plant/array/ring/move/place/ground`;
  `BW.inspect/palette/groundY` — чтение.
* Свойства размещения в `BW.part` и строительных функциях: `At = {x,y,z}` — центр нижней грани,
  `From/To` — противоположные углы (размер и позиция вычисляются).

## 1.6: библиотека ресурсов, автопроверки

* Если код `execute_luau` содержит `BW.kit` / `BW.kits` / `BW.icon` / `BW.furnish`, мост подставляет после
  `bw-helpers.luau` ещё и библиотеку ресурсов (`shared/src/library/bw-library.luau`, упакованную вместе с данными
  иконок и каталога: `BW._iconData`, `BW._kitInfo`). Длина пролога учитывается при пересчёте номеров строк.
* Политика безопасности считает изменением (write) также `BW.kit/furnish/floorplan/building/path/scatter/column/arch/icon`;
  `BW.kits/uiCheck/lint/fxCheck/gameCheck/rng` — чтение.
* `BW.kit` печатает `BW_KIT <id> → <path> parts=N size=WxHxD`; `BW.kits` — `BW_KITS <n>` и каталог;
  `BW.uiCheck` / `BW.lint` / `BW.fxCheck` / `BW.gameCheck` печатают найденные проблемы и возвращают `{ok=…}`.
* Инструкции содержат раздел **RESOURCE LIBRARY** (каталог для выбранной категории). Для ИИ с маленьким лимитом
  сообщения (например, Copilot, 10 000 символов) инструкции автоматически сокращаются (`maxChars`).
* Запросы из вкладки Library: если агент не запущен — текст кладётся в поле ввода и запускается Start; если запущен —
  отправляется сообщением `NEW USER REQUEST (from the Brickwire panel): …` с новым бюджетом шагов.

## 1.7: стили UI, VFX, камеры, сообщество, «прощающие» вызовы

* Библиотека подставляется также для `BW.style/styles`, `BW.ui<Компонент>` (Button, IconButton, Panel, Window, Title, Bar,
  Pill, Card, Toggle, Rays, Juice, Backdrop, Close), `BW.vfx/vfxLib/vfxPreview/vfxNames`, `BW.cinematic/cinemaLib/shots/camPreview/camCheck`.
* Безопасность: компоненты UI, `BW.vfx*`, `BW.cinematic`, `BW.camPreview` — запись; `BW.style`, `BW.shots`, `BW.camCheck` — чтение.
* Новые строки результатов: `BW_VFX <name> demo → <path>`, `BW_CINEMA <mode> → <path> shots=N duration=Ts`,
  `BW_CAM OK|ISSUES shots=N duration=Ts issues=K` (+ строки `BW_CAM  - …`), `BW_CAM preview t=…`.
* **Неточные имена инструментов** больше не ломают вызов: `functions.execute_luau`, `mcp__studio__execute_luau`,
  `Execute-Luau`, а также известные синонимы (`run_code`, `run_luau`, `execute_lua`… → `execute_luau`; `get_game_tree` →
  `search_game_tree`; `screenshot` → `screen_capture` и т. п.) сопоставляются с реальным инструментом, если он есть
  (`resolveToolName`, лог `tool.alias`). Неизвестное имя → ошибка со списком доступных инструментов.
* **Аргументы приводятся к схеме** перед проверкой (`coerceArgs`, лог `tool.args_coerced`): синонимы ключей
  (`script`/`source`/`lua` → `code`, `mode` → `datamodel_type`, `instance_path` → `path`, `search` → `query`),
  регистр enum (`"edit"` → `"Edit"`), строки `"true"`/`"3"` → boolean/number, числа → строки, JSON-строки → объект/массив,
  одиночное значение → массив.
* Панель: сообщения фоновому процессу `thumb` (миниатюра картинки с ui-resources.com в виде data URL, только https и
  только разрешённые хосты) и `communityRefresh` (свежий каталог).

## 1.8: вопросы, паки ассетов, гайды, Super

* Маркер `ROBLOX_AGENT_ASK` — ИИ задал вопрос / предложил варианты и ждёт ответа пользователя (этап PLAN, без напоминаний).
  Без метки работает эвристика `asksUser` (вопрос + «вариант / which / какой…» в конце ответа).
* Инструменты моста: `brickwire_assets {query, kind, pack, category, id, limit, offset}` — поиск по пакам;
  `brickwire_guide {topic}` — подробный гайд (understand, super, camera, animation, gameplay, build, ui, vfx, scripting, assets, polish).
* `BW.asset(id, {At, Facing, Parent, Scale, ApplyTo})`, `BW.assetInfo(id)`: мост находит id в коде `execute_luau` и
  вкладывает данные (`BW.__assetData`, ≤ 900 КБ); неизвестный id → `BW.__assetMiss` с похожими вариантами.
* Super mode: в начало сессии добавляется секция SUPER MODE, `maxAutoTurns` ×2.
* Если MCP-сервер не имеет `execute_luau`, но есть `run_code`/`run_luau`/… — вызовы перенаправляются (alias).

