# Blender и Figma в Brickwire 3.1

Всё, что приходит из Blender и Figma, появляется **в чате приложения Brickwire**: 3D-модели с просмотром,
снимки, макеты интерфейсов, fileId файлов и кнопки следующих шагов. AI (и в приложении, и в веб-чате через
расширение) получает новые инструменты автоматически.

## Blender

### Подключение (1 раз)
1. Приложение → вкладка **«Blender и Figma»** → **«Установить в Blender»**.
   Brickwire находит папки настроек Blender (2.93+) и кладёт `brickwire_blender.py` в `scripts/startup`:
   - Windows: `%APPDATA%\Blender Foundation\Blender\<версия>\scripts\startup`
   - macOS: `~/Library/Application Support/Blender/<версия>/scripts/startup`
   - Linux: `~/.config/blender/<версия>/scripts/startup`
   Если Blender ещё ни разу не запускался — Brickwire определит версию по `blender.exe`; если не найдёт — запустите
   Blender один раз и нажмите снова, или укажите `BRICKWIRE_BLENDER_EXE` в `.env`.
2. Перезапустите Blender (или «Запустить Blender»). Статус станет **«подключён»**.

Ручная установка: «Скачать аддон» → Blender: Edit → Preferences → Add-ons → Install… → `brickwire_blender.py` →
включить «Brickwire Connector». Удаление — кнопка «Удалить аддон».

### Как пользоваться
- **Из Blender:** панель N → вкладка **Brickwire** → «Send selection to Brickwire chat» (GLB + OBJ/MTL + снимок) или
  «Send viewport picture». В чате появится карточка 3D-модели и кнопки «В Studio (EditableMesh)» /
  «Загрузить в Roblox и вставить» (нужен Roblox Open Cloud в `.env`).
- **Из приложения:** «Получить выделенное», «Снимок вьюпорта», «Сцена»; на 3D-карточках — «В Blender».
- **Попросите AI:** «посмотри, что у меня в Blender», «сделай в Blender низкополигональный сундук и перенеси в Studio» —
  AI использует `blender_scene`, `blender_python` (каждый запуск Python подтверждаете вы), `blender_render`,
  `blender_export`, `blender_import`, затем `file_upload_roblox` / `file_to_studio` / `artifact_studio_import`.

### Безопасность
Аддон соединяется только с `127.0.0.1:<порт моста>` и забирает задания, которые поставил сам мост. Выполнение Python
в Blender — инструмент с риском *destructive*: всегда требует подтверждения.

## Figma

### Вариант 1 — ссылка на figma.com
1. Figma → Settings → Security → **Personal access tokens** → создать токен с доступом `file_content:read`.
2. Приложение → «Blender и Figma» → вставить токен → «Сохранить токен» (или `FIGMA_TOKEN` в `.env`).
3. В Figma выделите фрейм → Share → **Copy link** (ссылка с `node-id`) → вставьте в приложение:
   «Показать в чате», «Собрать UI в Studio», «Экспорт PNG». Или просто дайте ссылку AI в чате.

### Вариант 2 — плагин Figma (без токена)
1. Figma **desktop** → Plugins → Development → **Import plugin from manifest…**
2. Выберите `manifest.json` из папки, путь к которой показан в приложении (копия `figma-plugin/` с портом вашего моста).
3. Выделите фрейм → Plugins → Development → **Brickwire** → «Send to Brickwire». Макет (слои + картинки) придёт в чат
   с кнопкой «Собрать UI в Studio».

### Как переносится в Roblox
`figma_to_studio` строит настоящий `ScreenGui` через тот же компилятор, что и `ui_build`: Frame/TextLabel/TextButton
(слои с именем button/кнопка и текстом)/ImageLabel, UICorner, UIStroke, UIGradient. Дети размещаются в Scale
относительно родителя. Корень: `fixed` (размер в пикселях, по центру) для небольших макетов, `fit` (вписать в экран с
сохранением пропорций, текст масштабируется) для макетов ≥1000 px, `fill` — растянуть. Векторы и картинки экспортируются
в PNG и загружаются в Roblox (Decal → Image), если настроен Roblox Open Cloud; иначе остаются пустые ImageLabel с
атрибутом `FigmaNode`. Не переносятся: тени/blur, маски, поворот слоёв (берётся рамка), несколько заливок (верхняя).
Отмена — Ctrl+Z в Studio; повторная сборка — `replaceExisting` (старая версия сохраняется в ServerStorage).
