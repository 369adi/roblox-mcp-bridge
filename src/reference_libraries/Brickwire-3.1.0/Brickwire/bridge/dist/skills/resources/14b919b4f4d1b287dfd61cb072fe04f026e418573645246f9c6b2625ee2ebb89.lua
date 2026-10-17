--[[ LURONG GUI TEMPLATE
id: hud_clicker
name: Clicker HUD (Glossy Blue)
style: glossy
tags: hud, clicker, tapping, glossy, rounded, blue, currency pill, gamepass buttons, auto clicker, round buttons
description: Clicker-simulator HUD in rounded glossy blue: currency pill with a plus button and a 3x2 grid of round icon buttons on the left, a column of five wide Gamepass buttons on the right, and a big round click button between two red toggles at the bottom.
customize: currency value and icon, round button list, right column button list, bottom toggle texts
]]

Kit.setStyle("glossy")
local screen = Kit.screen("HudGui", { displayOrder = 1 })

-- top left: currency + round shortcuts
local left = Kit.dock(screen, { name = "LeftMenu", corner = "TopLeft", size = { 470, 560 }, margin = { 22, 150 } })
Kit.pill(left, { name = "Clicks", text = "999,999,999", emoji = "⚙️", theme = "navy", size = { 400, 92 }, plus = true, plusTheme = "navy", plusAction = "toggle:Store" })

local shortcuts = {
	{ text = "Pets", emoji = "🐶" }, { text = "Shop", emoji = "🛒" }, { text = "Rebirth", emoji = "🔄" },
	{ text = "Codes", emoji = "🎟️", opens = "Codes" }, { text = "Quests", emoji = "📜" }, { text = "Settings", emoji = "⚙️" },
}
local grid = Kit.box(left, { name = "Shortcuts", size = { 470, 320 }, pos = { 0, 128 } })
Kit.grid(grid, { cell = { 138, 138 }, gap = { 20, 26 }, columns = 3, alignX = "Left" })
for i, s in ipairs(shortcuts) do
	local holder = Kit.box(grid, { name = s.text, order = i })
	Kit.tile(holder, { name = "Button", emoji = s.emoji, theme = "navy", side = 124, corner = 999, pos = { 7, 0 }, action = "toggle:" .. (s.opens or s.text) })
	Kit.text(holder, { name = "Caption", text = s.text, textSize = 32, size = { 1, 0, 0, 40 }, pos = UDim2.new(0, 0, 1, -42), z = 4 })
end

-- right: gamepass column
local right = Kit.dock(screen, { name = "Gamepasses", corner = "Right", size = { 320, 620 }, margin = { 22, 0 } })
Kit.list(right, { gap = 22, alignY = "Center" })
for i, name in ipairs({ "2x Clicks", "Auto Click", "Lucky", "VIP", "Triple Egg" }) do
	Kit.button(right, { name = name:gsub("%s", ""), text = name, theme = "navy", textSize = 40, size = { 310, 100 }, order = i, lip = 10 })
end

-- bottom: toggles + the big click button
local bottom = Kit.dock(screen, { name = "ClickBar", corner = "Bottom", size = { 860, 160 }, margin = { 0, 14 } })
Kit.button(bottom, { name = "AutoRebirth", text = "Auto Rebirth", theme = "red", strokeColor = { 110, 8, 28 }, outlineColor = { 110, 8, 28 }, textSize = 40,
	size = { 320, 104 }, pos = UDim2.new(0, 0, 1, -8), anchor = { 0, 1 }, lip = 10 })
Kit.tile(bottom, { name = "Click", emoji = "👆", theme = "navy", side = 156, corner = 999, pos = UDim2.new(0.5, 0, 0.5, 0), anchor = { 0.5, 0.5 } })
Kit.button(bottom, { name = "AutoClicker", text = "Auto Clicker", theme = "red", strokeColor = { 110, 8, 28 }, outlineColor = { 110, 8, 28 }, textSize = 40,
	size = { 320, 104 }, pos = UDim2.new(1, 0, 1, -8), anchor = { 1, 1 }, lip = 10 })

Kit.controller(screen)
Kit.setStyle("studded")
return Kit.report(screen)
