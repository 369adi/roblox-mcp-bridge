# Changelog

## 3.1.0 — Blender и Figma, результаты прямо в чате приложения
**Blender — без MCP, uv и ручной настройки.**
- Новый аддон **Brickwire Connector** (`blender/brickwire_blender.py`, только стандартный Python Blender).
  В приложении: вкладка **«Blender и Figma» → «Установить в Blender»** — аддон сам кладётся в `scripts/startup`
  всех найденных версий Blender (2.93+) с правильным портом моста; после перезапуска Blender подключается сам.
  Есть «Запустить Blender», «Скачать аддон» (ручная установка), «Удалить аддон», статус (версия Blender, открытый .blend,
  устаревший аддон).
- В Blender: панель **N → Brickwire → «Send selection to Brickwire chat»** — выделенное уходит в чат приложения
  (GLB + OBJ/MTL + снимок вьюпорта), OBJ становится 3D-артефактом с просмотром в чате; «Send viewport picture» — только снимок.
- Новые инструменты для AI (видны всегда, объявляются в уже открытых чатах автоматически):
  `blender_status`, `blender_scene`, `blender_python` (всегда с подтверждением), `blender_render` (картинку видит AI),
  `blender_export` (glb/obj/fbx/stl → файлы + артефакт + чат), `blender_import` (файл или артефакт Brickwire → Blender).
- Кнопка «В Blender» на 3D-карточке работает через новый аддон (старый путь через Blender MCP остался во вкладке MCP).
- Связь: аддон опрашивает мост на 127.0.0.1 (long-poll), наружу ничего не открывается.

**Figma — ссылка или плагин.**
- **Ссылка figma.com + личный токен** (сохраняется в приложении, файл 0600, или `FIGMA_TOKEN`):
  `figma_inspect` (структура + PNG-превью, видит AI и чат), `figma_export` (png/jpg/svg/pdf → файлы),
  `figma_to_studio` (фрейм → настоящий ScreenGui: Frame/TextLabel/кнопки/картинки, UICorner/UIStroke/UIGradient,
  дети в Scale — масштабируется; большие макеты вписываются в экран; картинки и векторы загружаются в Roblox, если
  настроен Open Cloud), `figma_pushes`.
- **Плагин Figma без токена** (`figma-plugin/`, копия с портом моста — в папке данных, путь показан в приложении):
  Figma desktop → Plugins → Development → Import plugin from manifest → выделить фрейм → «Send to Brickwire».
  Макет (слои + PNG картинок) приходит в чат с кнопкой «Собрать UI в Studio».

**Результаты в чате приложения.**
- Модели, снимки и макеты из Blender/Figma приходят в открытый чат (или в чат текущего запуска, или в последний),
  сразу, без перезагрузки: 3D-просмотр, большие картинки, fileId для дальнейших шагов и кнопки действий
  («В Studio», «Загрузить в Roblox и вставить», «Собрать UI в Studio») — с обычными подтверждениями записи.
- Если чат не открыт — всплывающее уведомление.

Тесты: `tests/unit/connect.test.ts` (Figma-ссылки, конвертер в UI, REST с фейковым API, очередь Blender, установка аддона,
импорт OBJ), `tests/e2e/connect.e2e.test.ts` — настоящий аддон на заглушке `bpy` против настоящего моста:
установка, подключение, push выделенного в чат, инструменты AI, push из плагина Figma (Origin: null) и сборка ScreenGui.
Версия 3.1.0 — расширение, мост, плагин и приложение обновляются вместе.

## 3.0.1 — файловые инструменты видны везде + «прямо файлом в Studio»
Почему инструментов `file_*` не было видно и что исправлено:
- **Они были спрятаны за переключателем «composite tools»** (по умолчанию выключен). Теперь файловые инструменты —
  базовые: зарегистрированы всегда, даже без optional-инструментов и без подключённой Studio (кроме `file_to_studio`).
- **Работал старый мост.** `start.bat` и приложение подключались к уже запущенному мосту, даже если он от прошлой версии.
  Теперь старый мост автоматически останавливается и запускается новый.
- **Расширение и мост разных версий** — панель показывает предупреждение (что перезагрузить).
- **ИИ в уже открытом чате не знал о новых инструментах** (инструкции отправлены раньше). Теперь новые инструменты
  объявляются ИИ сами — в следующем сообщении с результатами или с новым запросом.
- Версия 3.0.1 — чтобы расширение, мост, плагин и приложение точно обновились вместе.

Новое:
- **Сырой файловый блок — ИИ пишет целый файл без JSON-экранирования, и он сразу попадает в Studio:**
  ```
  <ROBLOX_FILE name="Shop.server.lua" to="game.ServerScriptService">
  …содержимое файла любой длины…
  </ROBLOX_FILE>
  ```
  `*.server.lua` → Script, `*.client.lua` → LocalScript, другие `.lua` → ModuleScript, остальное — StringValue
  (`as="…"` — явно). Без `to=` файл просто сохраняется (fileId). `encoding="base64"` — для бинарных файлов.
  Незакрытый блок никогда не выполняется; теги внутри файла не исполняются.
- `file_save {name, text, to}` — то же самое через обычный вызов.
- **Файлы от пользователя доступны ИИ:** всё, что вы прикрепили (плагин Studio, «Чаты» приложения, «Чат плагина»),
  сохраняется в хранилище файлов, а ИИ получает список `имя → fileId` и может сразу `file_to_studio` / `file_upload_roblox`.
- **Плагин Studio: кнопка «+ File»** — любые файлы, не только картинки: звуки, модели (fbx/glb/obj/rbxm), скрипты,
  JSON/CSV, zip, pdf (до 6 файлов, ≤ 6 МБ каждый). Лимит тела запроса моста поднят до 40 МБ.
- Skill «Asset import» знает про файловые инструменты; одинаковые файлы не хранятся дважды.
- Тесты: e2e «ИИ пишет файл блоком → Script в Studio» (с выключенными optional-инструментами), парсер `ROBLOX_FILE`,
  вложения → fileId.

## 3.0.0 — стабильный чат в приложении + надёжная отправка в Notion AI
### ИИ сам загружает файлы (новое)
Новые инструменты моста — ИИ вызывает их сам, как остальные инструменты Studio:
- **`file_fetch {url}`** — скачать из интернета что угодно: картинки, текстуры, звуки/музыку, 3D-модели (fbx/glb/gltf/obj),
  `.rbxm/.rbxmx`, видео, zip, JSON, Lua, веб-страницы (страница сразу приходит читаемым текстом). Тип определяется по
  содержимому файла (а не по расширению), до 50 МБ, редиректы проверяются.
- **`file_save {name, text | base64}`** — ИИ создаёт свой файл (скрипт, JSON, CSV, OBJ, SVG, картинку…).
- **`file_list` / `file_read`** — список файлов и чтение текста по страницам (HTML → текст); для бинарных — тип, размер картинки.
- **`file_show {fileIds}`** — расширение **прикрепляет файл к сообщению в AI-чате** (ChatGPT, Claude, Gemini…), чтобы ИИ
  сам увидел скачанную картинку/документ перед использованием.
- **`file_upload_roblox {fileId}`** — загрузка в Roblox через Open Cloud: картинки → Decal (+ imageId), звук mp3/ogg/wav/flac → Audio,
  fbx/glb/gltf/rbxm/rbxmx → Model, mp4/mov → Video. Нужны `ROBLOX_OPEN_CLOUD_API_KEY` и `ROBLOX_CREATOR_USER_ID`/`GROUP_ID` в `.env`.
  Требует подтверждения (публикует на аккаунт).
- **`file_to_studio {fileId, parent?}`** — сразу в Studio: Lua → Script/LocalScript/ModuleScript (по имени `*.server.lua`/
  `*.client.lua`), картинка → Decal на детали или ImageLabel в GUI, звук → Sound, модель → вставленная модель, видео → VideoFrame.
  При необходимости сам загружает файл в Roblox. Отмена — Ctrl+Z.
- Безопасность: загрузки с `localhost` и из локальной сети заблокированы (ИИ не доберётся до вашего роутера/моста);
  разрешить — `BRICKWIRE_FILES_ALLOW_PRIVATE=1`. Хранилище ограничено (500 файлов / 1 ГБ, старые удаляются).
- Тесты: `tests/unit/file-tools.test.ts`, `tests/e2e/files.e2e.test.ts` (ИИ сам скачивает файл и видит его во вложении).

### Чат в приложении («Чаты»)
- **Первое сообщение в новом рабочем пространстве** падало с ошибкой `Cannot set properties of undefined` — сообщение
  не показывалось, а повторные нажатия запускали несколько ответов параллельно. Исправлено.
- **Двойной Enter / Enter во время ответа** больше не запускает параллельные ответы: пока идёт ответ, показывается
  подсказка, а набранный текст остаётся в поле. Кнопка показывает «Отправка…».
- **Переключение между чатами:** быстрые клики больше не открывают «не тот» чат (побеждает последний клик);
  ответ, пришедший после переключения, не перезаписывает другой чат.
- **Обрыв потока ответа** (сон ПК, перезапуск моста, прокси): клиент переподключается, затем переходит на long-poll;
  сервер при каждом подключении отдаёт уже набранный текст ответа — после переключения чата или перезагрузки
  страницы ответ виден с начала, а не «с середины».
- **Плавный стриминг:** при каждом токене обновляется только текст ответа, а не весь блок — открытый 3D-просмотр,
  прокрутка журнала шагов и раскрытые «шаги» больше не сбрасываются; убрана утечка ResizeObserver у 3D-просмотра.
- Картинки во вложениях загружаются один раз и кэшируются (раньше перекачивались при каждой перерисовке).
- Удаление открытого чата корректно останавливает его поток; кнопка «＋ Новый чат» защищена от двойного клика.
### Чат плагина
- Сообщение пользователя больше не показывается **дважды** (локальная копия + эхо из ленты).
- Поле ввода сбрасывает высоту после отправки, лента прокручивается к своему сообщению, хранит до 400 последних
  записей; после перезапуска моста лента корректно начинается заново.
- Убрана ошибка 404 `favicon.ico` в консоли приложения.
### Проверка
- `npm run test:chat` — браузерный QA чата (Playwright + локальный фейковый LLM): первое сообщение, двойной Enter,
  Enter во время ответа, переключение/перезагрузка посреди ответа, быстрые клики, отмена, утечки canvas, чат плагина,
  ошибки консоли.

### Notion AI (ранее 2.4.1)
Причины сбоев отправки в Notion AI и что исправлено:
- **Поле ввода «терялось» после вставки текста.** Placeholder исчезает, как только в поле есть текст; выбор поля
  пересчитывался заново и брал другое (пустое) поле → отправка «подтверждалась», а сообщение оставалось неотправленным.
  Теперь найденное поле **запоминается**, пока оно есть в DOM; выбор кэшируется на 150 мс (меньше нагрузки на Notion).
- **Send/Stop не находились.** Поиск шёл только на 5 уровней вверх; `up` в регулярке совпадал с **upload**.
  Теперь кнопки ищутся во всём блоке ввода (до 12 уровней, ≤ 420 px), кнопки вложений/упоминаний/модели исключены,
  Stop распознаётся по подписи, `<rect>` или квадратному пути.
- **Отправка во время «тихой» работы Notion AI.** Генерация теперь видна по иконке Stop без подписи; ожидание
  занятости 120 с (было 30), подтверждение 6 с, повторная доставка через 25 с (было 7 с → дубли).
  Уже подтверждённое сообщение повторно не набирается (`trustAcceptedSend`).
- **Метка доставки без двоеточия:** `[bw-xxxxx]` вместо `[bw:xxxxx]` (`:abc` в конце открывал подсказку эмодзи, и
  Enter выбирал эмодзи). Старый формат по-прежнему читается. Метка всегда из 5 символов.
  Перед отправкой закрываются всплывающие меню, которые открыл наш текст (Escape).
- **Вставка текста:** повторная вставка через paste только если текст действительно не попал в поле (раньше
  форматирование Notion `**`/`` ` `` вызывало дубль); для Notion отключена запись `textContent` в обход редактора.
- **keep-awake:** исправлен `cancelAnimationFrame`, который вызывал `clearTimeout` с чужим id и убивал таймеры сайта.
  На Notion keep-awake выключен по умолчанию (включить: `localStorage["bw-awake"]="on"`).
- **Компактные чипы** больше не перехватывают программные клики, не сворачивают блок с полем ввода/панелью и не
  прячут его при незакрытом `ROBLOX_TOOL_CALL`.
- **Автонажатие Continue** — только «Continue generating / Продолжить генерацию», не в диалогах; на Notion выключено.
- **Панель на Notion плавающая по умолчанию** (не вставляется в дерево React Notion). Закрепить — кнопкой в панели.
- `maxMessageChars` для Notion 18 000 (было непроверенные 40 000).
- **Site check** показывает последние шаги отправки (на каком шаге упало) и кнопки блока ввода — пришлите этот текст,
  если что-то не так.
- Тест: `npm run test:notion-shape` — реалистичная форма Notion (placeholder исчезает, иконки без подписей,
  приманки upload/attach, меню эмодзи, «тихое» думание). 2.4.0: 0 из 3 отправок, 2.4.1: 3 из 3.

## 2.2.0
- M1: re-send full instructions on new chat / `/bw rules`.
- Chat outbox `/api/outbox*`, `MAX_BODY` 16 MB, `/ui-builder/ui-merge.js`, `/ui-builder/components.json`, `/api/assets`.

### Baseline
- build: package.json is the only version source; `build.mjs` writes `VERSION.txt` and syncs `BRIDGE_VERSION`.
- Replaced all TypeScript parameter properties with explicit fields (works with `--experimental-strip-types`).
- Fixed 3 typecheck errors (imaging.ts, studio2-tools-b.ts).
- Expanded 7 guides (npc, maps, test, gamedesign, pbr, mesh, playtest), which fixes the failing assets test.

### M3 Hang monitor
- `shared/src/hang-monitor.ts`, panel wiring, `pressStop`; docs/HANGS.md. Tests: `hang-monitor.test.ts`.
### M2 Background
- A: `extension/src/core/tab-recovery.ts` + background wiring. B: `bridge/src/headless.ts`, `/api/headless*`, dashboard Headless page.
### M4 Thumbnail scenes
- Tool `thumbnail_scene`, `shared/src/studio2/thumbnail-scene.ts`; read-only CFrame write lint in the bridge before run_luau.
### M8 GFX
- Tools `gfx_style`, `gfx_post`; `shared/src/studio2/gfx.ts`, `bridge/src/imaging-post.ts`. AI enhance: `enhanceImage` (OpenAI edits / Stability), без ключа — понятная причина.
### M7 Mesh VFX
- Tool `vfx_mesh_install`; `shared/src/studio2/vfx-mesh.ts` (12 presets, pack meshes only), runtime module VFX.play / VFX.bindMarkers; docs/VFX.md.
### M6 Design
- ui-builder: frame presets, thumbnail-mode PNG 1920×1080. Components (master/instances/variants), auto-layout List/Grid, constraints, asset library, in-canvas AI, two-way sync with 3-way merge + conflict panel.
### M5 Paint
- `/paint` page: 20 tools, layers, undo/redo, PNG. Attach-to-chat via chat outbox (paste → file input → text fallback), real result shown.

### M1 Fast response
- New `extension/src/core/fast-turn.ts`: ReplyEndDetector, CallScheduler, StepTimer.
- End of reply = Stop/streaming signal disappears + `fastEndMs` (250 ms) of quiet. Providers without a Stop selector use the `settleMs` fallback.
- Streaming execution: closed, valid tool blocks are queued while the reply is still streaming.
- Read calls run in parallel (`readParallel`, default 4). Writes run in order, and any call submitted after a write waits for it. Dedupe uses reply + id + tool + stable args hash.
- Panel: duration of each tool, plus a `⏱` timing row per turn.
- Approval card is no longer hidden by a parallel read finishing.
- New settings: `fastEndMs`, `readParallel`, `streamExec`. New adapter method: `stopSignal()` (optional, backward compatible).
- Tests: `fast-turn.test.ts`, `agent-core-fast.test.ts`, `instructions-once.test.ts`.

### 2.2.0 — UX
- Library: hidden UI style presets + showcase. ui_build autoFix + phone lint.
- Auto-resume (turn limit, bridge reconnect, Continue button). Keep-awake MAIN-world script. Compact chat chips with timers + Code toggle.
