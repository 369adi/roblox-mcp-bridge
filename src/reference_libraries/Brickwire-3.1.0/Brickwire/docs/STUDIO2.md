# Brickwire 2.0 — stage 1 (what is real)

New composite tools (registered in `bridge.ts` next to `COMPOSITE_TOOLS`, all via the real `execute_luau`):

| Tool | Risk | What it really does |
|---|---|---|
| `animation_presets` | read | 37 presets (movement, combat, weapons, tools, emotes, interaction) |
| `animation_generate` | write | prompt (ru/en) or preset → keyframes → quality check + autofix → **KeyframeSequence** in `ServerStorage.BrickwireAnimations` (+ rig `AnimSaves`, markers/events, session preview id) |
| `animation_edit` | write | 22 ops: speed, length, intensity, smooth, mirror, seamless loop, anticipation, impact, events, retarget R6↔R15, set/mirror/blend poses, keyframe add/delete/move/duplicate, easing, autofix. Old version → `_history` (last 5) |
| `animation_analyze` | read | works on any KeyframeSequence, including hand-made ones |
| `animation_list` | read | animation library |
| `ui_components` | read | Button (primary/secondary/danger/ghost), Panel, Card, Title, Label, IconButton, ProgressBar, HealthBar, InventorySlot, Grid, TopBar, Modal |
| `ui_build` | write | JSON UI doc → ScreenGui (UICorner/Stroke/Gradient/Padding/List/Grid/Aspect/Scale), hover/pressed/disabled/selected states + fade/pop/slide via generated LocalScript `BrickwireUIStates`; `validateOnly`; backup to `ServerStorage.BrickwireUIBackups` |
| `ui_import` | read | ScreenGui → UI doc (round trip), reports what could not be imported |
| `project_analyze` | read | counts + issues + score (shadows, lights, particles, loose parts, duplicates, deprecated wait/spawn, loops without yield, scripts in places where they never run, LocalPlayer on server…) |
| `project_optimize` | write | 4 safe fixes, `dryRun` by default, one undo waypoint, never deletes or edits scripts |

## Limitations (honest)
- **AnimationId**: a script/plugin cannot publish. Last step is manual: Animation Editor → Load (AnimSaves) → Publish to Roblox, or Open Cloud upload. `previewId` from `KeyframeSequenceProvider` only lives in the current Studio session.
- Script checks in the analyzer are static text heuristics.
- Tests here are unit tests with a mock Studio; the real Studio run (`npm run studio:e2e`) was not possible in the build sandbox.

## NOT implemented yet (no UI/buttons were added for these)
UI Builder visual canvas in the extension panel, Thumbnail Generator, AI image/texture providers, Mesh 2.0, VFX Builder UI, Mechanics install manager, NPC Builder, Game Designer, map generators, Debugger, Test Center, agent unification (stage 7).

## Tests
`tests/unit/studio2-animation.test.ts`, `tests/unit/studio2-tools.test.ts` (16 tests). Run with `npm test`, or without deps:
`node --experimental-strip-types --import ./tests/unit/_register.mjs --test tests/unit/studio2-*.test.ts`
(`_register.mjs`/`_ts-resolve.mjs` are a small loader that maps `.js`→`.ts`; harmless, can be deleted if you use tsx.)


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
