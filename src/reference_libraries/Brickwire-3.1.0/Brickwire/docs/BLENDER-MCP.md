# Blender MCP в Brickwire 3.0

Brickwire подключает Blender как внешний MCP-сервер (`blender-mcp`, stdio через `uvx`) и умеет отправлять в него сгенерированные OBJ/MTL. В приложении: **MCP → Blender MCP** (статус, тест соединения, пресет, гайд).

## 9 шагов
1. Установите Blender 3.6+ (рекомендуется 4.x).
2. Установите `uv` (Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 | iex"`, macOS: `brew install uv`). Проверка: `uvx --version`.
3. Скачайте `addon.py` из репозитория blender-mcp.
4. Blender → Edit → Preferences → Add-ons → Install… → выберите `addon.py`, включите **Interface: MCP for Blender**.
5. В 3D Viewport нажмите **N** → вкладка **MCP for Blender** → **Start MCP Server** (порт по умолчанию 9876).
6. В Brickwire: MCP → Blender MCP → «Добавить пресет» (Windows: `cmd /c uvx blender-mcp`; macOS/Linux: `uvx blender-mcp`). Пресет создаётся только после явного подтверждения; SAFE_MODE включён по умолчанию.
7. Нажмите «Тест соединения» — Brickwire вызывает инструмент чтения сцены (`get_scene_info`) и показывает найденные инструменты.
8. В карточке 3D-артефакта нажмите «Send to Blender» и подтвердите. Импорт выполняется скриптом `wm.obj_import` (fallback `import_scene.obj`) и считается успешным только при маркере `BRICKWIRE_IMPORTED` в ответе.
9. Неполадки: `uv cache clean`, `uvx --python 3.11 blender-mcp`, проверьте что порт 9876 свободен, что в Blender нажат Start MCP Server и что одновременно запущен только один клиент blender-mcp (Claude Desktop / Cursor могут занимать его).

## Безопасность
- Импорт требует подтверждения пользователя и политики инструмента ≠ `off`.
- Выполнение произвольного Python в Blender — только через инструмент `execute_blender_code` сервера; Brickwire отправляет только сгенерированный скрипт импорта своего файла.

## Ограничения
Проверено с тестовым MCP-сервером (`app/tests/blender-fixture.mjs`), реальным Blender в этой среде не проверялось.
