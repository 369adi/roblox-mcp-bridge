# Референсы и бесплатные ресурсы (1.7)

Всё это доступно в панели: **Library → Community**. Права на ресурсы принадлежат их авторам — перед использованием
в игре проверьте условия на странице источника и укажите автора, если этого требуют.

## ui-resources.com (основной источник)

Публичный каталог [ui-resources.com](https://ui-resources.com) (≈1100 записей; API `https://ui-resources.com/api/resources`):

| Категория | Что там | Как применять |
|---|---|---|
| Effects (~430) | halftone, sunburst, звёзды, блёстки, молнии, свечения | оверлеи в UI (ImageLabel), текстуры частиц |
| Backgrounds (~200) | фоны меню и экранов загрузки | ImageLabel на весь экран под меню |
| Renders (~160) | рендеры персонажей/предметов | главное меню, магазин, загрузка |
| Textures (~130) | паттерны, бумага, шум | ImageLabel ScaleType=Tile, Decal/Texture |
| Icons, Faces, Brushes, Gfx | иконки, лица, кисти | ImageLabel / ImageButton |
| Websites, Tutorials, Plugins, Software | референсы, уроки, плагины Studio | идеи и инструменты, не ассеты |

Каталог в расширении: `extension/public/library/community.json`, пересобрать — `node --import tsx scripts/fetch-community.ts`,
в панели — **↻ Refresh**.

**Картинка в игре = asset id.** Roblox показывает только загруженные изображения (`rbxassetid://…`). Скачайте файл
(**Download file**), импортируйте в Studio (View → Asset Manager → Bulk Import), скопируйте id и вставьте в поле
карточки. Без id агент построит всё с «пустым местом» (атрибут `BW_AssetNeeded`) и попросит id — выдумывать id он не будет.
Если ваш Studio MCP предоставляет инструмент загрузки картинок, агент попробует загрузить файл сам.

## Другие источники (подборка)

* **Референсы UI:** [Game UI Database](https://www.gameuidatabase.com/), [Interface In Game](https://interfaceingame.com/),
  [Mobbin](https://mobbin.com/), [Dribbble — Game UI](https://dribbble.com/search/game-ui),
  [Behance — Game UI](https://www.behance.net/search/projects/game%20ui), [Pinterest — Roblox UI](https://www.pinterest.com/search/pins/?q=roblox%20ui).
* **Бесплатные ассеты:** [Kenney (CC0)](https://kenney.nl/assets), [game-icons.net (CC BY 3.0)](https://game-icons.net/),
  [Lucide (ISC)](https://lucide.dev/icons/), [Poly Haven (CC0)](https://polyhaven.com/textures),
  [Roblox Creator Store](https://create.roblox.com/store), [Freesound](https://freesound.org/) (лицензия у каждого звука своя).
* **Цвет:** [Lospec](https://lospec.com/palette-list), [Coolors](https://coolors.co/), [Realtime Colors](https://www.realtimecolors.com/).
* **Движение и шрифты:** [easings.net](https://easings.net/) (соответствие Enum.EasingStyle), [Google Fonts](https://fonts.google.com/)
  (для подбора пар; в Roblox доступны Fredoka One, Luckiest Guy, Bangers, Oswald, Montserrat и др.).
* **Документация Roblox:** [UI](https://create.roblox.com/docs/ui), [Particle emitters](https://create.roblox.com/docs/effects/particle-emitters),
  [Camera](https://create.roblox.com/docs/workspace/camera), [DevForum — UI](https://devforum.roblox.com/tag/ui).

## Как ИИ использует референсы

Кнопка **Make something inspired by it** просит ИИ описать референс в числах (палитра hex, формы, пропорции,
настроение) и собрать **свою** версию из компонентов BW (`BW.style`, `BW.ui*`, `BrickwireVFX`) — без копирования
и без загрузки картинок.
