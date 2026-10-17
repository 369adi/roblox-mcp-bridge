--[[ LURONG GUI TEMPLATE
id: wooden_menu
name: Wooden Menu (Wood and Gold)
style: wooden
tags: wood, wooden, gold, fantasy, rpg, adventure, pirate, jungle, pause menu, settings, level progress, stars, casual
description: Carved-wood pause menu: wooden board with a gold inner frame, a title plaque, three star slots, a segmented gold progress bar, three big gold buttons and a row of square and round gold icon buttons.
customize: title, button list, progress value and segments, stars earned, icon row
]]

Kit.setStyle("wooden")
local screen = Kit.screen("WoodenMenuGui")

local root = Kit.box(screen, { name = "Menu", size = { 760, 900 }, pos = UDim2.fromScale(0.5, 0.5), anchor = { 0.5, 0.5 } })
root:SetAttribute("LurongWindow", true)
Kit.fit(root)

-- board: dark plank edge, lighter wood face, gold inner frame
local board = Kit.panel(root, { name = "Board", theme = "plank", size = { 760, 840 }, pos = { 0, 60 }, corner = 26, outline = 6 })
local face = Kit.panel(board, {
	name = "Face", theme = "wood", size = UDim2.new(1, -28, 1, -28), pos = { 14, 14 }, corner = 18, outline = 0,
	rim = 5, rimColor = { 246, 176, 62 }, rimTransparency = 0.1,
})
-- wood grain: a few soft dark streaks
for i, y in ipairs({ 0.2, 0.37, 0.55, 0.71, 0.86 }) do
	Kit.make("Frame", {
		Name = "Grain", BackgroundColor3 = Color3.fromRGB(96, 44, 14), BackgroundTransparency = 0.72, BorderSizePixel = 0,
		Size = UDim2.new(0.34 + (i % 3) * 0.14, 0, 0, 5), Position = UDim2.new(0.08 + (i % 2) * 0.36, 0, y, 0), ZIndex = 0,
	}, face)
end

-- title plaque overlapping the top edge
local plaque = Kit.panel(root, { name = "Plaque", theme = "plank", size = { 440, 112 }, pos = UDim2.new(0.5, 0, 0, 0), anchor = { 0.5, 0 }, corner = 22, outline = 6 })
local plaqueFace = Kit.panel(plaque, { name = "Face", theme = "amber", size = UDim2.new(1, -20, 1, -20), pos = { 10, 10 }, corner = 14, outline = 0, gloss = true })
Kit.text(plaqueFace, { name = "Title", text = "PAUSED", textSize = 58, size = UDim2.new(1, 0, 1, -4), pos = { 0, 4 } })

-- stars
local stars = Kit.box(face, { name = "Stars", size = { 1, 0, 0, 110 }, pos = { 0, 74 } })
Kit.list(stars, { horizontal = true, gap = 20, alignY = "Center" })
for i = 1, 3 do
	local star = Kit.icon(stars, { name = "Star" .. i, emoji = "⭐", size = { 100, 100 }, order = i })
	if i == 3 then star.TextTransparency = 0.7 end
end

-- level progress
Kit.text(face, { name = "ProgressLabel", text = "Level 12", textSize = 36, size = { 1, 0, 0, 44 }, pos = { 0, 198 } })
Kit.bar(face, {
	name = "LevelBar", value = 3, max = 5, segments = 5, theme = "amber", trackTheme = "plank",
	size = { 560, 58 }, pos = UDim2.new(0.5, 0, 0, 250), anchor = { 0.5, 0 }, corner = 16, outline = 5, lip = 6,
})

-- main buttons
local buttons = Kit.box(face, { name = "Buttons", size = { 1, 0, 0, 330 }, pos = { 0, 340 } })
Kit.list(buttons, { gap = 20 })
for i, text in ipairs({ "RESUME", "SETTINGS", "QUIT" }) do
	Kit.button(buttons, {
		name = text, text = text, theme = "amber", textSize = 46, size = { 470, 96 }, order = i, corner = 20, lip = 10,
		action = text == "RESUME" and "close" or nil,
	})
end

-- icon row: square and round gold buttons
local icons = Kit.box(face, { name = "IconRow", size = { 1, 0, 0, 100 }, pos = UDim2.new(0, 0, 1, -124) })
Kit.list(icons, { horizontal = true, gap = 18, alignY = "Center" })
for i, def in ipairs({ { "Home", "🏠", 18 }, { "Sound", "🔊", 999 }, { "Music", "🎵", 18 }, { "Info", "ℹ️", 999 }, { "Restart", "🔄", 18 } }) do
	Kit.tile(icons, { name = def[1], emoji = def[2], theme = "amber", side = 96, corner = def[3], order = i, outline = 5, lip = 8 })
end

Kit.controller(screen)
Kit.setStyle("studded")
return Kit.report(screen)
