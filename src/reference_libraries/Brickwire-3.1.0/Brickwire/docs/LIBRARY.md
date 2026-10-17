# Библиотека ресурсов Brickwire (1.7)

Готовые, проверенные ресурсы: постройки, мебель, игровые системы, интерфейсы, эффекты, анимированные объекты и иконки.
Один источник правды: Luau-код — `shared/src/library/bw-library.luau`, описание — `shared/src/library/catalog.ts`,
иконки — `shared/src/library/icons.ts`. Из них же собираются раздел RESOURCE LIBRARY в инструкциях ИИ,
вкладка **Library** в панели и `BW.kits()` внутри Studio.

## Как пользоваться

* **С нуля по промпту** — просто напишите задачу в чат и нажмите **Start Agent**. ИИ видит каталог в инструкциях
  и сам берёт подходящие ресурсы (например «деревня с магазином и монетками» → `cottage` ×4 + `well` + `park` + `coins` + `shop`),
  а потом дорабатывает их обычным кодом BW.
* **Из библиотеки** — вкладка **Library** в панели → карточка ресурса (превью) → поле «заметки» (необязательно) →
  * **Build this** — построить ровно этот ресурс (`BW.kit(id, …)`) и проверить;
  * **Make something like it** — ИИ делает свой вариант «в том же духе» (другая планировка/детали, тот же смысл и стиль);
  * **Like my screenshot…** — текст запроса кладётся в поле ввода; прикрепите свой скриншот и отправьте/нажмите Start.
  * **Restyle my UI** (у стилей UI) — перекрасить ваш существующий интерфейс в выбранный стиль (имена и скрипты сохраняются).
  Если агент уже работает, запрос уходит как новое сообщение пользователя.
* **Community** (переключатель над поиском) — 1100+ ресурсов с [ui-resources.com](https://ui-resources.com)
  (эффекты, фоны, рендеры, текстуры, иконки, плагины, сайты-референсы) + подборка других бесплатных ресурсов
  (Game UI Database, Kenney, game-icons.net, Lospec, Coolors, easings.net, документация Roblox…), см. `docs/REFERENCES.md`.
  Карточка → **Open page / Download file** → (необязательно) Roblox asset id → **Use in my game** или
  **Make something inspired by it** (только как визуальный референс, без загрузки картинок).
  Картинку в игру можно вставить только с asset id: агент **не выдумывает id** — либо загружает файл инструментом
  Studio (если такой есть), либо просит вас импортировать его (View → Asset Manager → Bulk Import) и прислать id.
  Миниатюры грузит фоновый процесс расширения (уменьшенные, в кэше); **↻ Refresh** подтягивает свежий каталог.
  Права на ресурсы — у их авторов: смотрите условия на странице источника.

## Вызов в Luau

```lua
BW.kit("cottage", {At = {0, 0, 0}, Facing = 90, palette = "medieval"})   -- постройка
BW.kit("shop", {style = "simulator", items = {{"Sword", 100, "sword"}, {"Speed", 50, "bolt"}}})
local gui = BW.screen("Rewards")                                          -- свой UI из компонентов
local w = BW.uiWindow(gui, {title = "Daily Reward", style = "cartoon", header = "ribbon"})
BW.uiButton(w, "Claim", {style = "cartoon", Size = {0.5, 0, 0.16, 0}, Position = {0.25, 0, 0.78, 0}})
BW.uiJuice(gui)                                                           -- hover/press/pop-анимации
BW.vfx("explosion", {20, 0, 0})                                           -- демо-площадка эффекта (крутится в Play)
BW.cinematic{target = workspace.Castle, style = "intro"}                  -- пролёт камеры при входе
BW.furnish("Workspace.House.Floor", "bedroom")                           -- обставить комнату
BW.icon(frame, "coin", {Size = {0, 32, 0, 32}, Position = {0, 8, 0.5, -16}})
BW.kits("ui")                                                             -- каталог с опциями
```

Общие опции всех ресурсов: `At` (центр низа, по умолчанию — земля в начале координат), `Facing` (градусы),
`Name`, `Parent`, `palette` (постройки), `style` (UI): simulator | cartoon | anime | glass | neon | fantasy | minimal |
dark | candy | pixel | horror | tactical | luxury (старое `theme` = dark | light | candy | scifi тоже работает).
Библиотека подставляется мостом **только** в код, где есть `BW.kit / BW.kits / BW.icon / BW.furnish / BW.style /
BW.ui<Компонент> / BW.vfx* / BW.cinematic / BW.shots / BW.camCheck / BW.camPreview`.

## 1.9: катсцены (кейсы, яйца, кубики, ивенты, предыстория)

Модуль `ReplicatedStorage.BrickwireCutscene` (ставится китами автоматически):
* **Таймлайн** `Cutscene.play({events = {...}}, opts)`: камера (шоты BrickwireCinema), субтитры с печатью по буквам и
  именем говорящего, титры, звук/музыка с fade, VFX, твины, тряска, вспышка, FOV, blur, цветокоррекция, затемнение,
  леттербокс, склейки, события `fire` и `run(ctx)`. Всегда есть **Skip** (сразу к результату, награда не теряется),
  блокировка управления и возврат камеры, защитный таймаут.
* **Готовые сцены:** `caseOpen` (лента карточек замедляется на награде), `eggHatch` (x1/x3, покачивания, трещины, вспышка),
  `diceRoll` (как в **Anime Dice**: «рулетка» над головой игрока — шанс «1 in 20k», портрет, имя; быстро → медленно),
  `eventStart` (3-2-1, леттербокс, пролёт, «EVENT STARTED!» всем), `story` (3–6 кадров с закадровым текстом, один раз).
* **Редкости** Common → Uncommon → Rare → Epic → Legendary → Mythic → Secret: пауза, тряска, вспышка, лучи и частицы растут
  с редкостью; Epic+ — экран с лучами, Mythic+ — ложная концовка. Мутации Silver/Gold/Huge/Titanic/Perfect умножают шанс.
* **Стили:** `animedice` (по умолчанию: FredokaOne/LuckiestGuy, белый текст с толстой чёрной обводкой, наклон) и `clean`.
* **Сервер решает:** `Cutscene.roll(POOL, {luck=})` (веса / chance / odds) → `Cutscene.show(player|"all", "case", {result=…})`;
  клиент только показывает (`Cutscene.listen()`, `Cutscene.request("roll")`).
* **Проверка:** `BW.cutsceneCheck(kind | timeline)` → строка `BW_CUT` (длина по типу: кейс 4–6 с, яйцо 3–5 с, кубик ≤ 6 с,
  ивент 3–12 с, история 6–30 с; Skip; звуки; время чтения субтитров; камера; ролл на сервере; есть ли клиентский слушатель;
  нет ли выдачи наград через `math.random` на клиенте). `BW.cutscene{timeline=, mode="join"|"trigger"}` пишет LocalScript.
* Киты: `case_opening`, `egg_hatch`, `dice_roll`, `event_start`, `story_intro`. Гайд для ИИ: `brickwire_guide {"topic":"cutscene"}`.

## 1.8: паки ассетов

Вкладка **Packs**: 2370 объектов из 5 паков (каталог — [PACKS.md](PACKS.md)). Place / Apply ставит объект через
`BW.asset`, «Build something with it» — строит с ним что-то большее. Свои `.rbxm` → `data/packs`.
Пересборка: `node --import tsx scripts/gen-packs.ts`.

## 1.7: красивый UI, 3D VFX, пролёты камеры

**UI-стили и компоненты.** `BW.style(name)` — палитра, шрифты, скругления, обводки стиля; компоненты
`BW.uiWindow` (шапка ribbon/slant/bar/plain + кнопка закрытия), `BW.uiButton` (объёмная глянцевая), `BW.uiIconButton`,
`BW.uiPanel`, `BW.uiTitle`, `BW.uiBar`, `BW.uiPill` (счётчик валюты с «+»), `BW.uiCard` (редкости common…secret, ценник),
`BW.uiToggle`, `BW.uiRays` (вращающиеся лучи за наградой), `BW.uiBackdrop`, `BW.uiJuice(gui)` (LocalScript: наведение,
нажатие, появление окон, переключатели, звук клика по атрибуту `BW_ClickSound`). Все 10 UI-ресурсов переписаны на
компонентах; `ui_showcase` и `style_<name>` показывают все компоненты в каждом стиле. Инструкции UI учат дизайну:
сетка 8 px, шкала шрифтов, ≤ 2 шрифта, цвет 60-30-10, контраст, цвета редкостей, «сок» анимаций, 3 варианта на выбор.

**VFX-библиотека** (`ReplicatedStorage.BrickwireVFX`, ставится автоматически): 18 многослойных пресетов
(explosion, hit_spark, slash, shockwave, lightning, magic_burst, heal, level_up, dash, ground_slam, smoke_puff, confetti,
pickup, ice_shatter, teleport, fire_burst, poison, vortex) из встроенных текстур Roblox — частицы, ForceField/Neon-оболочки
и кольца, свет, молнии, дуги взмахов, обломки с физикой, тряска камеры. В игре: `VFX.play(name, cframe, {color=, scale=})`,
`VFX.bolt`, `VFX.flash`, `VFX.trail`, `VFX.shake`. `BW.vfx(name, at)` — демо-площадка (`fx_*` в каталоге),
`BW.vfxPreview(name, at)` — проиграть прямо в редакторе для скриншота.

**Кинематографичные камеры** (`ReplicatedStorage.BrickwireCinema`): шоты hold, pan, dolly, orbit, flyby (сплайн
Catmull-Rom с постоянной скоростью), push_in, pull_out, crane, reveal, track; easing, FOV/зум, dutch-ролл, тряска,
смена шотов через затемнение, леттербокс, кнопка Skip, DOF. `BW.shots(target, "intro"|"showcase"|"epic"|"boss"|"trailer"|"menu")`
— готовые раскадровки; `BW.camCheck(shots)` — проверка (скорость, слишком короткие/длинные шоты, FOV, крен, камера в стене,
перекрытый вид, однообразие); `BW.camPreview(shots, t)` — поставить камеру редактора на момент t; `BW.cinematic{…}` пишет
LocalScript (режимы join / trigger / menu). Ресурсы: `cinematic_intro`, `cutscene_trigger`, `menu_camera`.

## Каталог (101 ресурсов + 32 иконок)

### Постройки (17)

| id | Название | Что это | Опции |
|---|---|---|---|
| `cottage` | Домик | medieval cottage 20x16: door, 5 windows, gable roof, chimney, porch | `width` `depth` `height` |
| `modern_house` | Современный дом | 2-storey modern house with stairs inside, balcony with glass rail, driveway, hedges | `width` `depth` `floors` |
| `tower` | Каменная башня | round cobblestone tower with merlons, door and flag | `height` `diameter` `Color` |
| `castle_wall` | Крепостная стена | crenellated wall segment with walkway and optional gate | `length` `height` `Color` `gate` |
| `market_stall` | Рыночный прилавок | wooden stall with striped awning, counter and crates | `Color` |
| `well` | Колодец | stone well with roof, crank and bucket |  |
| `bridge` | Мост | wooden plank bridge with rails and posts | `length` `width` `deckHeight` |
| `lamp_post` | Фонарь | street lamp with warm PointLight | `height` `LightColor` |
| `bench` | Скамейка | park bench with seat (sittable) | `Color` |
| `campfire` | Костёр | stones + logs + fire/smoke particles + flickering light |  |
| `fountain` | Фонтан | round stone fountain with water and spray particles | `radius` |
| `watchtower` | Сторожевая вышка | wooden tower on 4 legs with ladder, platform, rails and roof | `height` |
| `skyscraper` | Небоскрёб | multi-storey glass tower (BW.building) with lobby door and roof details | `floors` `width` `depth` |
| `shop_building` | Магазин | shop with big front windows, awning and lit sign (SurfaceGui) | `width` `depth` `title` |
| `house_plan` | Дом по плану | single-storey house from an ASCII floor plan (rooms, doors, windows) + roof | `plan` |
| `park` | Парк | grass square with paths, fountain, benches, lamps and trees | `size` `trees` `seed` |
| `barn` | Амбар | red barn with big doors, gable roof, hay bales and fence |  |

### Мебель (10)

| id | Название | Что это | Опции |
|---|---|---|---|
| `table` | Стол | wooden table | `width` `depth` `Color` |
| `chair` | Стул | chair with Seat (sittable) | `Color` |
| `bed` | Кровать | bed with pillow and blanket | `Color` `Accent` |
| `bookshelf` | Книжный шкаф | shelf with random coloured books | `Color` `seed` |
| `sofa` | Диван | 3-seat sofa (sittable) | `Color` |
| `kitchen` | Кухня | counter with sink, stove and cabinets | `length` |
| `floor_lamp` | Торшер | floor lamp with soft light |  |
| `rug` | Ковёр | rug with border | `Color` `Accent` |
| `potted_plant` | Растение в горшке | pot with leafy plant |  |
| `tv` | Телевизор | TV on a stand with glowing screen |  |

### Геймплей (12)

| id | Название | Что это | Опции |
|---|---|---|---|
| `obby` | Обби (паркур) | complete obby: start, N stages with checkpoints (SpawnLocation), jumps, kill strips, jump pads, finish + scripts | `stages` |
| `kill_bricks` | Убивающие блоки | row of neon kill bricks with server script | `count` |
| `lava_floor` | Лавовый пол | lava pool with safe platforms to jump across | `size` `platforms` |
| `jump_pad` | Батут | pad that launches the player up | `power` `Color` |
| `speed_pad` | Ускоритель | pad that gives temporary speed boost | `speed` `time` `Color` |
| `teleporter` | Телепорт | two linked pads with cooldown | `distance` |
| `coins` | Монетки | spinning coins in a line or ring; touch → leaderstats Coins, respawn | `count` `shape(line/ring)` `radius` `value` `respawn` |
| `spawn_area` | Зона спавна | spawn platform with SpawnLocation, sign and rails | `size` `Color` `title` |
| `round_system` | Система раундов | lobby ↔ arena rounds: intermission, teleports, timer, winner gets Wins (RoundStatus value for UI) | `intermission` `roundTime` `minPlayers` `arenaDistance` |
| `saved_stats` | Сохранение данных | leaderstats + DataStore save/load with retries, autosave and BindToClose | `stats` `store` |
| `day_night` | Смена дня и ночи | Lighting ClockTime cycle script | `minutes` |
| `npc_dialog` | NPC с диалогом | NPC rig + ProximityPrompt + dialog UI with lines | `lines` `title` `style` |

### Интерфейс (11)

| id | Название | Что это | Опции |
|---|---|---|---|
| `hud` | HUD | coins pill with icon + plus button (leaderstats, bump on change, 12.5K format) + health bar | `stat` `style` |
| `shop` | Магазин (UI) | side shop button + window with rarity item cards, price chips, server-validated purchase (RemoteFunction) | `items` `title` `currency` `style` |
| `inventory` | Инвентарь | inventory button + grid window with slots | `slots` `style` |
| `main_menu` | Главное меню | full-screen menu: gradient backdrop with rays, big outlined title, Play / Shop / Settings | `title` `subtitle` `style` |
| `dialog` | Окно диалога | bottom dialog box with speaker name, text and Next | `style` |
| `notifications` | Уведомления | toast notifications (Notify RemoteEvent from server) | `style` |
| `settings` | Настройки | settings window with animated switches (music, sfx, shadows…) | `toggles` `style` |
| `loading_screen` | Экран загрузки | loading screen with progress bar and tips | `title` `tip` `style` |
| `daily_reward` | Ежедневная награда | gift button + window, claim once per 24h (DataStore, server-validated) | `amount` `currency` `style` |
| `ui_showcase` | Витрина стиля | one screen with every component of a style: currency pills, side buttons, window, rarity cards, XP bar, switch, buttons | `style` `title` |
| `timer_bar` | Таймер раунда | top timer that shows RoundStatus text | `style` |

### Стили UI (13)

| id | Название | Что это | Опции |
|---|---|---|---|
| `style_simulator` | Стиль: Симулятор | bright bubbly simulator look: thick dark outlines, glossy 3D buttons, FredokaOne (like Pet Simulator 99, Bee Swarm) — use style="simulator" in any UI kit / BW.ui* component | `title` |
| `style_cartoon` | Стиль: Мультяшный | warm cartoon: chunky LuckiestGuy text, orange/yellow, very thick outlines (like Adopt Me) — use style="cartoon" in any UI kit / BW.ui* component | `title` |
| `style_anime` | Стиль: Аниме | anime action: dark navy, magenta→violet gradients, slanted headers, Bangers titles (like Anime Defenders, Blox Fruits) — use style="anime" in any UI kit / BW.ui* component | `title` |
| `style_glass` | Стиль: Стекло | glassmorphism: translucent dark panels, hairline light strokes, soft corners — use style="glass" in any UI kit / BW.ui* component | `title` |
| `style_neon` | Стиль: Неон / sci-fi | sci-fi neon: near-black, cyan glow outlines, Michroma titles, sharp corners — use style="neon" in any UI kit / BW.ui* component | `title` |
| `style_fantasy` | Стиль: Фэнтези RPG | fantasy RPG: parchment panels, dark wood outlines, gothic titles, red ribbon — use style="fantasy" in any UI kit / BW.ui* component | `title` |
| `style_minimal` | Стиль: Минимализм | clean minimal: white cards, grey hairlines, one accent colour — use style="minimal" in any UI kit / BW.ui* component | `title` |
| `style_dark` | Стиль: Тёмный модерн | modern dark: blue-grey panels, subtle gradients, blue accent — use style="dark" in any UI kit / BW.ui* component | `title` |
| `style_candy` | Стиль: Пастель / kawaii | kawaii pastel: pink/mint/lilac, bubbly FredokaOne, soft pink outlines — use style="candy" in any UI kit / BW.ui* component | `title` |
| `style_pixel` | Стиль: Пиксель-ретро | retro pixel: square corners, Arcade font, hard black outlines, 8-bit palette — use style="pixel" in any UI kit / BW.ui* component | `title` |
| `style_horror` | Стиль: Хоррор | horror: near-black, dried-blood red, Creepster titles (like Doors, Piggy) — use style="horror" in any UI kit / BW.ui* component | `title` |
| `style_tactical` | Стиль: Тактический шутер | tactical shooter: dark olive glass, amber lines, Oswald caps (like Frontlines, Arsenal) — use style="tactical" in any UI kit / BW.ui* component | `title` |
| `style_luxury` | Стиль: Люкс / золото | luxury / royal: black and gold, serif titles, thin gold outlines — use style="luxury" in any UI kit / BW.ui* component | `title` |

### Эффекты (23)

| id | Название | Что это | Опции |
|---|---|---|---|
| `portal` | Портал | glowing ring portal with swirl particles and light | `radius` `Color` |
| `magic_circle` | Магический круг | glowing rune circle on the ground, rotating, with sparkles | `radius` `Color` |
| `torch` | Факел | wall/stand torch with fire, smoke and flickering light |  |
| `crystals` | Кристаллы | cluster of neon crystals with glow | `count` `Color` `seed` |
| `waterfall` | Водопад | rock cliff with falling water, mist and pool | `height` |
| `rain` | Дождь | rain that follows the camera (LocalScript) |  |
| `snow` | Снег | snowfall that follows the camera (LocalScript) |  |
| `fireflies` | Светлячки | floating glowing fireflies over an area | `size` |
| `player_aura` | Аура игрока | sparkle aura attached to every player's character | `Color` |
| `fx_explosion` | VFX: Взрыв | fireball core, shockwave ring, smoke, embers, debris, light flash, camera shake — BrickwireVFX preset "explosion" (demo pad loops it in Play; in code VFX.play("explosion", cf)) | `every` `scale` |
| `fx_hit_spark` | VFX: Искры удара | fast white-blue impact sparks + flash for melee/gun hits — BrickwireVFX preset "hit_spark" (demo pad loops it in Play; in code VFX.play("hit_spark", cf)) | `every` `scale` |
| `fx_slash` | VFX: Взмах клинка | curved neon slash arc with trailing sparks — BrickwireVFX preset "slash" (demo pad loops it in Play; in code VFX.play("slash", cf)) | `every` `scale` |
| `fx_shockwave` | VFX: Ударная волна | expanding ForceField ring + dust ring — BrickwireVFX preset "shockwave" (demo pad loops it in Play; in code VFX.play("shockwave", cf)) | `every` `scale` |
| `fx_lightning` | VFX: Молния | branching neon bolt from the sky + flash + sparks — BrickwireVFX preset "lightning" (demo pad loops it in Play; in code VFX.play("lightning", cf)) | `every` `scale` |
| `fx_magic_burst` | VFX: Магический взрыв | purple-pink arcane burst: sphere shell, sparkles, glow — BrickwireVFX preset "magic_burst" (demo pad loops it in Play; in code VFX.play("magic_burst", cf)) | `every` `scale` |
| `fx_heal` | VFX: Лечение | green rising sparkles, ring and soft light — BrickwireVFX preset "heal" (demo pad loops it in Play; in code VFX.play("heal", cf)) | `every` `scale` |
| `fx_level_up` | VFX: Новый уровень | golden pillar of light, rays, confetti sparks — BrickwireVFX preset "level_up" (demo pad loops it in Play; in code VFX.play("level_up", cf)) | `every` `scale` |
| `fx_ground_slam` | VFX: Удар о землю | dust ring, rock debris, shockwave, shake — BrickwireVFX preset "ground_slam" (demo pad loops it in Play; in code VFX.play("ground_slam", cf)) | `every` `scale` |
| `fx_ice_shatter` | VFX: Ледяной взрыв | ice shards debris, frost puff, cold light — BrickwireVFX preset "ice_shatter" (demo pad loops it in Play; in code VFX.play("ice_shatter", cf)) | `every` `scale` |
| `fx_teleport` | VFX: Телепорт | cyan-blue pillar + implosion + sparkles — BrickwireVFX preset "teleport" (demo pad loops it in Play; in code VFX.play("teleport", cf)) | `every` `scale` |
| `fx_confetti` | VFX: Конфетти | colourful confetti burst for wins/rewards — BrickwireVFX preset "confetti" (demo pad loops it in Play; in code VFX.play("confetti", cf)) | `every` `scale` |
| `fx_vortex` | VFX: Вихрь | dark-purple swirling vortex with implosion — BrickwireVFX preset "vortex" (demo pad loops it in Play; in code VFX.play("vortex", cf)) | `every` `scale` |
| `fx_fire_burst` | VFX: Огненный взрыв | burst of flame, embers and heat light — BrickwireVFX preset "fire_burst" (demo pad loops it in Play; in code VFX.play("fire_burst", cf)) | `every` `scale` |

### Анимация и камера (15)

| id | Название | Что это | Опции |
|---|---|---|---|
| `case_opening` | Открытие кейса | CS-style case: card strip decelerates onto the SERVER-rolled reward, rarity frames, ticks, flash, reward card + Claim (BrickwireCutscene) | `pool` `price` `currency` `title` `style` |
| `egg_hatch` | Вылупление яйца | egg stand with Hatch / Hatch x3: push-in, wobbles, cracks, flash, pet with rarity glow (server rolls) | `pool` `price` `currency` `eggColor` `style` |
| `dice_roll` | Бросок кубика (Anime Dice) | ROLL/AUTO → server rolls a unit ("1 in N", mutations) → ticker above the head fast→slow; Epic+ screen reveal, Mythic+ fake ending | `pool` `mutations` `cooldown` `price` `style` |
| `event_start` | Начало ивента | countdown 3-2-1, letterbox, fly-over of the zone, "EVENT STARTED!" for all players | `zone` `title` `every` `duration` `style` |
| `story_intro` | Предыстория | back-story on first join only: 3–6 shots, typed voice-over subtitles, music, title, Skip | `target` `lines` `speaker` `title` `sub` `style` |
| `cinematic_intro` | Кинематографичное интро | camera fly-through on join: fly-in → orbit → hero push-in → crane reveal, letterbox, fades, Skip button (BrickwireCinema); target= any model/part | `target` `style(intro/showcase/epic/boss/trailer)` `dof` |
| `cutscene_trigger` | Катсцена по триггеру | glowing pad: touching it plays a camera cutscene (once per player by default) | `target` `style` `size` `once` |
| `menu_camera` | Камера меню | slow looping orbit behind the main menu until the player presses Play (attribute InMenu=false) | `radius` `height` `time` |
| `elevator` | Лифт | moving platform elevator with shaft | `height` `period` |
| `windmill` | Мельница | windmill with spinning blades | `height` `speed` |
| `ferris_wheel` | Колесо обозрения | spinning ferris wheel with cabins | `radius` `cabins` `speed` |
| `guard_npc` | Патрульный NPC | NPC rig walking a patrol route | `points` `speed` `title` |
| `dancer_npc` | Танцующий NPC | NPC rig playing a looped dance | `dance` `title` |
| `auto_door` | Автодверь | sliding glass door that opens when a player approaches |  |
| `flag` | Флаг | flag on a pole with waving cloth | `Color` |

### Иконки (32)

Векторные, из GUI-примитивов (Frame + UICorner + UIStroke + TextLabel) — загружать картинки не нужно:
`coin`, `gem`, `heart`, `star`, `bolt`, `shield`, `sword`, `trophy`, `crown`, `gear`, `cart`, `bag`, `lock`, `check`, `close`, `plus`, `minus`, `play`, `pause`, `home`, `user`, `info`, `warning`, `music`, `map`, `clock`, `gift`, `key`, `potion`, `flame`, `trash`, `rocket`.

## Как проверено

* Каждый ресурс собирается в **настоящей Luau VM** со стабом Roblox API (`tests/luau/scenarios/library.luau`,
  `tests/integration/library.test.ts`): без ошибок, с атрибутом `BW_Kit`; `BW.furnish` — для всех 5 типов комнат.
* Все скрипты, которые создают ресурсы (монеты, раунды, сохранение, магазин, диалоги, телепорты…), **компилируются**
  `luau-compile`; анимационные скрипты BW_* ещё и выполняются в стабе.
* Превью в панели (`extension/public/library/previews.json`) **сгенерированы из этих же сборок** в стабе
  (`node --import tsx scripts/gen-library.ts`): изометрия партов, макет UI на экране 1366×768, карточка для чисто скриптовых систем.
  Это приближение: стаб не Studio (меши, текстуры, физика, реальная отрисовка шрифтов не моделируются).
* 1.7: модули `BrickwireVFX` и `BrickwireCinema` выполняются в стабе (`tests/luau/fx-cinema-run.luau`): все 18 пресетов
  на сервере и клиенте, сплайн с постоянной скоростью, все easing-кривые, все авто-раскадровки проходят `camCheck`,
  плохие шоты ловятся, проигрывание на клиенте. Это проверка API и математики, не картинки.
* **Не проверено в настоящей Roblox Studio.** DataStore-ресурсы (`saved_stats`, `daily_reward`) требуют
  Game Settings → Security → *Enable Studio Access to API Services* для теста в Studio.
