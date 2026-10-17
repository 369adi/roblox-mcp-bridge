# Brickwire 1.9.0 — аудит перед расширением 2.0

Аудит исходников архива `Brickwire-1.9.0.zip` (179 файлов, ~39 тыс. строк без node_modules).
Статус: только чтение кода. Typecheck/build/tests в этой среде НЕ запускались (нет node_modules и доступа к npm).

## Карта системы

```
BRICKWIRE 1.9.0
├── AI Agent            extension/src/core/agent-core.ts (758) — цикл: промпт → ответ → parse ROBLOX_TOOL_CALL → мост → результат; проверка перед DONE
│                       shared/src/instructions.ts, playbooks.ts, guides.ts — системный промпт, плейбуки, гайды
│                       extension/src/adapters/* — ChatGPT, DeepSeek, Claude, Gemini, Qwen, Kimi, GLM, Arena (DOM-адаптеры)
├── Roblox Studio Bridge bridge/src/bridge.ts (898) — реестр инструментов, исполнение, approvals, снапшоты
│                       server.ts (HTTP + SSE + dashboard.html), sessions.ts, memory.ts, logger.ts, studio-detect.ts
├── MCP                 bridge/src/mcp-client.ts (441) — stdio JSON-RPC к встроенному Studio MCP (execute_luau, script_read, …)
├── Tool registry       composites.ts: get_game_tree, get_project_info, read_instance, create_instance, create_part,
│                       modify_instance, delete_instance, clone_instance, create_script, set_script_source, delete_script,
│                       take_snapshot, restore_snapshot, get_errors
│                       bridge.ts: execute_luau, memory_get, memory_note, list_snapshots, brickwire_assets, brickwire_guide
├── Asset Library       shared/src/library/catalog.ts — 101 кит (единый источник для промпта, панели Library и BW.kits())
│                       bw-library.luau (4980) — реализации китов; icons.ts; community.ts (1100+ внешних ссылок)
│                       bridge/src/assets.ts + bw-assets.luau — вставка ассетов из RBXM-паков
├── RBXM packs          packs/src/*.rbxm → packs/built/*.json + *.tiles.json:
│                       ultimate 1133 · retro 362 · ndc 318 · vfx 139 · textures 125 тайлов
│                       shared/src/rbxm/parse.ts, pack.ts — собственный парсер/упаковщик RBXM
├── VFX                 23 кита: fx_explosion, fx_slash, fx_hit_spark, fx_lightning, fx_ice_shatter, fx_fire_burst,
│                       fx_ground_slam, fx_heal, fx_level_up, fx_magic_burst, fx_shockwave, fx_teleport, fx_vortex,
│                       fx_confetti, magic_circle, player_aura, portal, rain, snow, torch, waterfall, fireflies, crystals
│                       + vfx-пак (139). BW.vfx(...) — демо-площадка эффекта
├── Mesh                ОТДЕЛЬНОЙ СИСТЕМЫ НЕТ. MeshPart встречается только в ассетах паков
├── Buildings           17 китов (cottage, modern_house, skyscraper, shop_building, house_plan, park, barn, tower…)
│                       + 10 furniture; BW.building, BW.furnish — placement-хелперы в bw-helpers.luau (1769)
├── Mechanics           12 gameplay-китов: obby, coins, round_system, saved_stats (DataStore), npc_dialog, teleporter,
│                       jump/speed pad, kill_bricks, lava_floor, spawn_area, day_night
├── UI                  11 UI-китов (hud, shop, inventory, daily_reward, dialog, main_menu, settings, notifications…)
│                       13 стилей; BW.screen / BW.uiWindow / BW.uiButton / BW.uiJuice — компонентный API в Luau
│                       UI Builder (визуальный canvas) — НЕТ
├── Animation           BW.animate (объекты + дефолтные анимации Roblox), 15 anim-китов, Cutscene (1.9: таймлайн,
│                       caseOpen, eggHatch, diceRoll, eventStart, story), BrickwireCinema (камера)
│                       Генератора анимаций персонажа (KeyframeSequence) — НЕТ
├── Game Designer       НЕТ (есть только плейбуки в промпте)
├── Testing             tests/unit (8), integration (7), e2e (3), luau-стабы (18), scripts/studio-e2e.mjs; get_errors
├── Optimization        НЕТ
├── Project Intelligence get_game_tree / get_project_info + скан проекта в memory.ts при старте сессии
└── Panel UI            extension/src/ui/panel.ts (839) — 2 вкладки: Agent, Library
```

## Что расширять, а не дублировать

| Запрос 2.0 | Расширяем существующее |
|---|---|
| Asset Library 2.0 / Asset Intelligence | catalog.ts + packs/built/*.tiles.json + brickwire_assets → единый индекс с метаданными |
| Thumbnail System | scripts/library/render.ts (уже рендерит превью) + BW.shots / BW.camPreview / BrickwireCinema |
| VFX 2.0 / VFX Builder | fx_* киты + vfx-пак + BW.vfx |
| UI Builder → Roblox | экспортер строит дерево через тот же путь, что BW.screen / BW.ui* (create_instance / execute_luau) |
| Mechanics Library | gameplay-киты + saved_stats как основа сохранения |
| NPC Builder | npc_dialog, guard_npc, dancer_npc |
| Animation Editor | BW.animate + таймлайн Cutscene |
| Project Analyzer | get_game_tree, get_project_info, memory.ts |
| Debugger / Test Center | get_errors, snapshots, studio-e2e.mjs |
| Разделы CREATE…PROJECT | вкладки panel.ts + поле `section` в реестре инструментов |

## Ключевые технические ограничения

1. Публикация анимации (AnimationId) через встроенный Studio MCP недоступна: execute_luau работает в Edit DataModel,
   а загрузка ассета требует Open Cloud API-ключа или ручного шага в Studio. Реальный путь: собрать KeyframeSequence
   в place → пользователь публикует через Animation Editor / Open Cloud → id сохраняется в библиотеке.
2. Импорт мешей и картинок также требует Open Cloud (Assets API) или Asset Manager. Агент не выдумывает asset id
   (это правило уже есть в 1.9).
3. Генерация изображений: в проекте нет провайдеров — нужна абстракция ImageProvider + ключи пользователя.
4. Polycount reduction / LOD самого меша внутри Roblox невозможны: только выбор вариантов, CollisionFidelity,
   RenderFidelity и внешняя обработка до импорта.
5. Каждый новый инструмент нужно проверять в реальном Studio (scripts/studio-e2e.mjs) — в облачной среде это невозможно.

## План этапов (по приоритету из ТЗ)

1. Реестр по разделам + Asset Intelligence (единый индекс китов и паков, поиск/фильтры/сортировка) + Thumbnails
   на базе render.ts + VFX 2.0 (недостающие категории: projectile, muzzle flash, wind, earth, beam, fog, dust, leaves,
   purchase, quest complete) + Mesh-инструменты в пределах API Roblox.
2. UI Builder: модель документа (JSON) → canvas в панели/дашборде → экспорт в ScreenGui и импорт обратно.
3. Mechanics Library (install/configure/test/remove с манифестами), NPC Builder, Animation IR → KeyframeSequence.
4–7. Game Designer, Map Generator, Debugger/Optimizer/Test Center, объединение через агента.

## Status update (stage 1 build)
Implemented & unit-tested: Animation Generator (generate/edit/analyze/list/presets), UI Builder doc compiler + ui_build/ui_import/ui_components, Project Analyzer + safe Optimizer. See docs/STUDIO2.md. Everything else in the plan remains NOT implemented.


## Этапы 3–7 (Brickwire 2.0 full)

Новые файлы: `shared/src/studio2/mechanics.ts`, `shared/src/studio2/systems.ts`, `bridge/src/studio2-tools-b.ts`, `tests/unit/studio2-systems.test.ts`. Регистрация: `bridge.ts` (`STUDIO2_TOOLS_B`). Гайды агента: `mechanics`, `npc`, `maps`, `test`, `gamedesign`.

| Раздел | Инструменты | Что делает |
|---|---|---|
| MECHANICS | mechanic_list, mechanic_install, mechanic_status, mechanic_configure, mechanic_remove | 10 рабочих механик (leaderstats+DataStore, coin_pickup, checkpoints, kill_brick, sprint, double_jump, day_night, doors, round_system, shop). Зависимости ставятся автоматически, конфиг в атрибутах, удаление = перенос в ServerStorage.BrickwireBackups |
| NPC | npc_create | Риг R6/R15, мозг на PathfindingService: idle/wander/patrol/follow/chase/guard/shopkeeper, диалог через ProximityPrompt, урон |
| VFX 2.0 | vfx_presets, vfx_build, vfx_emit | 10 многослойных пресетов (fire, smoke, sparkles, explosion, hit_impact, aura, heal, rain, portal, dust), цвет/масштаб/интенсивность, one-shot превью |
| MAPS | map_generate | obby / arena / maze / city / island(terrain), детерминированно по seed, preview без изменений в Studio |
| GAME DESIGN | gd_design, gd_economy | Бриф по жанру + план сборки из реальных инструментов Brickwire, калькулятор экономики с предупреждениями |
| TEST / DEBUG | test_run, debug_logs | Проверки exists/property/script_syntax/mechanic/no_errors/count, группировка ошибок Output |

### Честно: не реализовано
- Thumbnail Generator — плагин Studio не может делать скриншоты/рендер в файл.
- AI-генерация изображений и загрузка декалей — нужен внешний API-ключ и Open Cloud; не подключено.
- Mesh 2.0 / EditableMesh и генератор PBR-текстур — не реализовано.
- Визуальный холст UI-редактора внутри панели расширения — есть только JSON-документ → ScreenGui и обратный импорт.
- Автоматический плейтест (Play mode) — test_run проверяет только режим редактирования.
- Публикация анимаций и получение AnimationId — только вручную (Animation Editor → Publish to Roblox). AnimationId никогда не подставляется фиктивно.

### Проверка
- Юнит-тесты в песочнице: 31/31 по studio2 + luau. Общий набор: 67/69; 2 падения (memory-session, v18) — это ограничение запуска без компилятора: `bridge.ts` использует parameter properties, которые Node strip-types не поддерживает. Код этих модулей не менялся.
- Не запускалось в песочнице (нет node_modules/интернета/Studio): `npm run typecheck`, `npm run build`, `npm run test:all`, `npm run studio:e2e`.


## 2.1 — Media & Runtime (stage C)

| Tool | Status | Notes |
|---|---|---|
| `image_status` | ✅ | Shows provider / Open Cloud configuration |
| `image_generate` | ✅ (needs key) | OpenAI gpt-image, Stability, OpenAI-compatible; PNG to `data/generated/images`; optional Decal upload |
| `thumbnail_generate` | ✅ (needs key; `promptOnly` works without) | Art director: reads the place → prompt built from top-thumbnail rules + genre + learned preferences → variants → exact 1920x1080 / 512x512 |
| `thumbnail_feedback` | ✅ | Learning loop: ratings + notes → liked/disliked traits, style weights (`data/generated/thumbnail-style-memory.json`). Prompt-level learning; the model is not retrained |
| `pbr_generate` | ✅ files / ⚠️ Studio part needs Open Cloud | Seamless albedo → Normal (OpenGL), Roughness, Metalness, Height → MaterialVariant |
| `mesh_generate` | ✅ / ⚠️ | rock, crystal, lathe, terrain, tube, gem → EditableMesh MeshPart + GLB/OBJ. EditableMesh is not saved with the place; `upload` (GLB→Model via Open Cloud) is experimental |
| `playtest_run` | ⚠️ experimental | StudioTestService Run/Play mode + temporary runner script that is removed afterwards; runtime checks |
| UI Builder canvas | ✅ | `http://127.0.0.1:<port>/ui-builder`: drag/resize, properties, layers, JSON, build in Studio (`ui_build`), import (`ui_import`) |

.env:
```
BRICKWIRE_IMAGE_PROVIDER=openai        # openai | stability | custom
BRICKWIRE_IMAGE_API_KEY=...
# BRICKWIRE_IMAGE_API_URL=https://api.openai.com/v1
# BRICKWIRE_IMAGE_MODEL=gpt-image-1
ROBLOX_OPEN_CLOUD_API_KEY=...          # scope: asset:read + asset:write
ROBLOX_CREATOR_USER_ID=...             # or ROBLOX_CREATOR_GROUP_ID
```

Still not implemented: publishing an AnimationId automatically (Roblox requires a manual Publish); setting the experience thumbnail/icon through an API (no public API exists — upload it in Creator Dashboard).

Tests: `tests/unit/studio2-media.test.ts` — 9/9. Full unit suite 76/78 (the 2 failures are pre-existing: strip-types cannot load `bridge.ts` parameter properties).
