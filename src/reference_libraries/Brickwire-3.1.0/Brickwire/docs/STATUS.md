# Brickwire 2.2 — status

Legend: **Done** (verified by the named test) · **Not implemented** · **Not verified — needs X**.

## §1 Baseline fixes — Done
| Item | Status | Verified by |
|---|---|---|
| VERSION.txt + BRIDGE_VERSION come from package.json | Done | `scripts/build.mjs` rewrites both on every build; `npm run build` → VERSION.txt = "Brickwire 2.1.0" |
| Parameter properties removed (bridge, memory, logger, mcp-client, assets, bridge-client, panel, base adapter, agent-core, rbxm parse/pack) | Done | `node --experimental-strip-types --import ./tests/unit/_register.mjs --test` on memory-session (3/3) and v18 (8/8) |
| Typecheck (3 errors: imaging.ts Float32Array, studio2-tools-b.ts `.type`) | Done | `npm run typecheck` exit 0 |
| Guides test failed (7 topics < 600 chars) | Done | expanded npc, maps, test, gamedesign, pbr, mesh, playtest with real guidance; `assets.test.ts` passes |
| Real test count | — | Brief said 76/78; actual baseline 141 tests (122 pass, 1 fail, 18 skipped). Now 153 tests, 0 fail, 18 skipped (skips need Studio/MCP) |

## "C0 read only" — cause found, fix pending (M4)
- No Brickwire code writes `C0`/`C1` fields: `bw-helpers.luau` (BW.rig, BW.keyframes) and `bw-library.luau` never touch joint C0 (the only `C0` matches there are hex colours like `#C0392B`). `studio2/animation.ts` writes `Motor6D.Transform` only.
- Cause: **model-generated Luau** assigning to a component of a CFrame, e.g. `motor.C0.Position = …` / `joint.C0.X = …`. CFrame is immutable in Luau; component writes raise "… cannot be assigned to" (recorded in project memory as "C0 read only").
- Planned fix (M4): `BW.pose` that assigns a whole new CFrame (`m.C0 = base * CFrame.Angles(…)`) on joints of the agent's own rig, plus a lint that rejects `.C0.<field> =` / `.C1.<field> =` in run_luau before execution. **Not implemented yet; not verified — needs Studio.**

## M1 Fast response — Done (Studio-free module)
| AC | Status | Verified by |
|---|---|---|
| 1 Stop disappears → results sent < 500 ms | Done | `agent-core-fast.test.ts` "M1-AC1+AC2 fake DOM" (real AgentCore, fake provider/DOM); `fast-turn.test.ts` M1-AC1 |
| 2 Closed block runs before the reply ends | Done | `agent-core-fast.test.ts` M1-AC1+AC2 |
| 3 3 reads parallel, 2 writes sequential | Done | `fast-turn.test.ts` M1-AC3 (+ read-after-write ordering test) |
| 4 No call runs twice | Done | `fast-turn.test.ts` M1-AC4, `agent-core-fast.test.ts` |
| 5 Turn 2 has no full instructions | Done (partly) | `instructions-once.test.ts`. Full instructions were already sent only from `start()`; the brief's "re-sent often" did not match the 2.1 code. **Not implemented:** automatic full re-send on new chat / context loss / user request |
| 6 Fallback without Stop selector | Done | `agent-core-fast.test.ts` M1-AC6, `fast-turn.test.ts` M1-AC6 |
| 7 Step timings in panel | Done | timing row `⏱ wait for model · parse · <tool> · send results` + per-tool duration; asserted in `agent-core-fast.test.ts`. **Not verified — needs a real browser** for the look |
| Live provider check (ChatGPT etc.) | Not verified — needs a browser with the extension loaded |

## M3 Hang monitor
| AC | Status | How verified |
|---|---|---|
| Hang detection + recovery (Stop, retry) | Done | `hang-monitor.test.ts` (unit). **Not verified — needs a real browser** |

## M2 Background work
| AC | Status | How verified |
|---|---|---|
| A: tab recovery after reload/close | Done | `tab-recovery.test.ts` (unit). **Not verified — needs Chrome with the extension** |
| B: headless mode (`/api/headless*`, dashboard page) | Done | `headless.test.ts` (unit). **Not verified — needs a live provider** |

## M4 Thumbnail scenes (`thumbnail_scene` → `Workspace.BW_ThumbnailScene`)
| AC | Status | How verified |
|---|---|---|
| 3 templates, R6 rigs, poses, faces, labels, 16:9 camera + frame check (≤2 fixes) | Done (code) | `thumbnail-scene.test.ts` |
| No "C0 read only" error | Done (code) | Root cause: model-written Luau assigned CFrame components (`m.C0.X = …`). Fix: whole-CFrame assignment in the scene code + lint that rejects such writes before run_luau. Lint unit-tested. **Not verified — needs Studio** |
| Empty baseplate / user place; rerun replaces only own model; undo | Done (code) | snapshotTargets + ChangeHistory waypoints + verify read. **Not verified — needs Studio** |

## M8 GFX (`gfx_style`, `gfx_post`)
| AC | Status | How verified |
|---|---|---|
| 6 styles change settings measurably | Done (code) | `gfx.test.ts`; Studio returns a measured read. **Not verified — needs Studio** |
| Exact PNG size, text readable at 480×270, works without a key | Done | `gfx.test.ts` |
| Optional AI enhance | **Done (unit)** — `gfx_post {enhance:true}` → `enhanceImage` (OpenAI `/images/edits`, Stability sd3 image-to-image). Без ключа локальный результат сохраняется + понятная причина. `v22-complete.test.ts` (fake fetch). Not verified with a real key. |

## M7 Mesh VFX (`vfx_mesh_install`, runtime `ReplicatedStorage.BW_VFX.VFX`)
| AC | Status | How verified |
|---|---|---|
| Real mesh count | Done | vfx pack: 186 items, 176 of kind mesh (`vfx-mesh.test.ts`) |
| 12 layered presets, only pack mesh ids | Done | `vfx-mesh.test.ts` |
| VFX.play / edit-mode preview / KeyframeMarker trigger | Done (code) | **Not verified — needs Studio** (marker binding needs Play mode) |
| BW.fxCheck passes | Called after install. **Not verified — needs Studio** |
| Perf budget documented | Done | `docs/VFX.md` |

## M6 Design (ui-builder)
| AC | Status | How verified |
|---|---|---|
| Frame presets (desktop/laptop/tablet/phone/thumbnail) | Done | manual code review. **Not verified — needs a browser** |
| Thumbnail mode PNG 1920×1080 | Done (code) | canvas is created at exactly 1920×1080. **Not verified — needs a browser** |
| BW.uiCheck desktop + phone, round-trip names/hierarchy | Existing `ui_build`/`ui_import`. **Not verified — needs Studio** |
| Auto-layout (List/Grid), constraints (anchor 9 pt, aspect), components (master → all instances, variants, detach), asset library (`/api/assets`, real packs), in-canvas AI (через outbox → ui_build), two-way sync with conflicts (3-way merge по пути имён) | **Done (unit + syntax)** — merge: `v22-complete.test.ts`; UI: `node --check`. **Not verified — needs browser + Studio** (BW.uiCheck desktop/phone, round-trip в Studio). |

## M5 Paint (`/paint`)
| AC | Status | How verified |
|---|---|---|
| 20 tools, layers (add/delete/order/merge/hide), undo/redo (40 steps), PNG export | Done (code) | **Not verified — needs a browser** |
| "Send to chat" attaches the image (ChatGPT + one more) | **Done (code), Not verified — needs browser**. Paint → `/api/outbox` → расширение: paste DataTransfer → fallback `input[type=file]` → проверка превью; иначе текстовый fallback. Реальный результат (image/text/failed) показывается в Paint. Outbox: `v22-complete.test.ts`. |

## Tests
Run `npm test` for the current count (see the final report in CHANGELOG).


## 2.2 completion pass
- M1: полные инструкции пересылаются повторно: новый чат в той же вкладке, команда `/bw rules` (`/bw правила`), лимит раз в 20 с. Test: `v22-complete.test.ts` (детекция команды), `instructions-once.test.ts` (полный prompt строится только в `start()`).
- Suite: 184 tests, 166 pass, 0 fail, 18 skipped (нет бинарника luau).

## Paint в чате (2.2.0, доработка)
- В панели расширения отдельный блок **🎨 Paint**. Paint открывается поверх текущей страницы чата (Notion AI, ChatGPT и т.д.) как страница расширения — мост и локальный сайт не нужны.
- «Отправить в чат» кладёт картинку прямо в поле ввода этого чата (вставка → поле загрузки файла → проверка превью) и отправляет; если сайт не принял файл — отправляется текст. Результат показывается в Paint и в панели.
- Окно сворачивается кнопкой ✕, рисунок сохраняется до перезагрузки страницы.
- Not verified — needs browser: прикрепление на конкретных сайтах (в т.ч. Notion AI).

## 2.2 — UX-обновление (компактный чат, keep-awake, авто-resume)
| Функция | Статус |
|---|---|
| Библиотека: скрыты 13 UI-стилей и ui_showcase (стили доступны через `style=` у UI-китов) | Реализовано, unit-тест |
| ui_build autoFix: UITextSizeConstraint для TextScaled, hover/press для кнопок, линт (44px, телефон, за экраном); `autoFix:false` выключает | Реализовано, unit-тесты |
| Авто-resume: до 3 авто-продолжений при лимите ходов; авто-продолжение при возврате моста; авто-клик «Continue generating» | Реализовано, в браузере не проверено |
| Keep-awake (MAIN world): сайт видит вкладку как видимую/в фокусе; rAF→timer в фоне; тихий аудио-keepalive пока агент работает. Выкл: `localStorage bw-awake=off` | Реализовано, в браузере не проверено |
| Компактный чат: вызовы/результаты/инструкции свёрнуты в чипы «⚙ generate_mesh · 12 с»; клик — раскрыть, двойной клик — свернуть; кнопка «Code» в панели | Реализовано, в браузере не проверено |
