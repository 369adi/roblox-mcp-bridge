--[[ LURONG GUI TEMPLATE
id: rebirth_upgrade
name: Rebirth Upgrade (Before / After)
style: studded
tags: rebirth, prestige, multiplier, before after, upgrade, progress, skip with robux
description: Red-header window comparing the current and next rebirth (two multiplier chips joined by an arrow), a framed progress panel with a caption and bar, and two buttons: Rebirth and a Robux Skip.
customize: title, rebirth numbers, multiplier text, progress caption and value, skip price
]]

local screen = Kit.screen("RebirthUpgradeGui")

local win = Kit.window(screen, {
	name = "Rebirth", title = "Rebirth", theme = "red", bodyTheme = "slate", titleAlign = "Center",
	size = { 900, 660 }, headerHeight = 104, overhang = 12, padding = 26,
})
local c = win.content

local function stage(name, caption, multiplier, x)
	local box = Kit.box(c, { name = name, size = { 320, 130 }, pos = UDim2.new(x, 0, 0, 6), anchor = { x, 0 } })
	Kit.text(box, { name = "Caption", text = caption, textSize = 34, size = { 1, 0, 0, 44 } })
	local chip = Kit.panel(box, { name = "Chip", theme = "lime", size = { 1, 0, 0, 74 }, pos = { 0, 52 }, lip = 7, shine = true, studWidth = 320 })
	Kit.text(chip, { name = "Multiplier", text = multiplier, textSize = 40, size = UDim2.new(1, 0, 1, -8) })
	return box
end
stage("Current", "Rebirth 0", "1x Cash", 0)
stage("Next", "Rebirth 1", "1.5x Cash", 1)
Kit.text(c, { name = "Arrow", text = "▶", font = Enum.Font.GothamBlack, textSize = 70, size = { 120, 80 }, pos = UDim2.new(0.5, 0, 0, 52), anchor = { 0.5, 0 } })

local frame = Kit.panel(c, {
	name = "Progress", theme = { top = { 22, 44, 92 }, bottom = { 10, 20, 44 } }, size = { 1, 0, 0, 168 }, pos = { 0, 168 },
	rim = 4, rimColor = { 90, 150, 255 }, studStrength = 0.5, studWidth = 860,
})
Kit.text(frame, { name = "Caption", text = "Rebirth resets your speed level!", textSize = 34, size = { 1, 0, 0, 48 }, pos = { 0, 18 }, scaled = true })
Kit.bar(frame, {
	name = "SpeedBar", value = 75, max = 100, theme = "blue", text = "Speed: 75/100", textSize = 30,
	size = { 1, -48, 0, 62 }, pos = UDim2.new(0.5, 0, 1, -24), anchor = { 0.5, 1 },
})

Kit.button(c, { name = "RebirthButton", text = "Rebirth", theme = "orange", textSize = 42, size = { 330, 92 }, pos = UDim2.new(0.25, 0, 1, -4), anchor = { 0.5, 1 } })
local skip = Kit.button(c, { name = "SkipButton", text = "Skip", theme = { top = { 255, 150, 40 }, bottom = { 255, 60, 110 } }, textSize = 38, size = { 330, 92 }, pos = UDim2.new(0.75, 0, 1, -4), anchor = { 0.5, 1 } })
skip.Label.Size = UDim2.new(1, -16, 0, 48)
Kit.text(skip, { name = "Price", text = Kit.ROBUX .. " 49", textSize = 22, size = { 1, 0, 0, 26 }, pos = { 0, 50 } })

Kit.controller(screen)
return Kit.report(screen)
