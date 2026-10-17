--[[ LURONG GUI TEMPLATE
id: rebirth
name: Rebirth Requirements
style: studded
tags: rebirth, prestige, requirements, progress bar, warning, modal
description: All-green studded window: "Requirements" row of gold-framed item slots, a red warning line, a progress bar and a REBIRTH button.
customize: title, requirement items (icon + name), warning text, progress value, button text
]]

local screen = Kit.screen("RebirthGui")

local win = Kit.window(screen, {
	name = "Rebirth", title = "Rebirth!", emoji = "🔄", theme = "green",
	bodyTheme = { top = { 12, 104, 22 }, bottom = { 6, 62, 14 } }, bodyStudStrength = 0.8,
	size = { 900, 720 }, headerHeight = 100,
})
local c = win.content

Kit.text(c, { name = "Heading", text = "Requirements:", textSize = 58, size = { 1, 0, 0, 70 }, pos = { 0, 4 } })

-- requirement slots
local requirements = {
	{ name = "Cash", emoji = "💵" },
	{ name = "Potion", emoji = "🧪" },
	{ name = "Weapon", emoji = "🏏" },
}
local row = Kit.box(c, { name = "Requirements", size = { 1, 0, 0, 190 }, pos = { 0, 92 } })
Kit.list(row, { horizontal = true, gap = 34, alignY = "Center" })
for i, item in ipairs(requirements) do
	local slot = Kit.slot(row, {
		name = item.name, size = { 190, 190 }, order = i, outlineColor = { 214, 160, 34 },
		theme = { top = { 52, 44, 12 }, bottom = { 24, 30, 10 } }, transparency = 0,
	})
	Kit.icon(slot, { emoji = item.emoji, size = { 124, 124 }, pos = UDim2.fromScale(0.5, 0.42) })
	Kit.text(slot, { name = "ItemName", text = item.name, textSize = 30, size = { 1, 0, 0, 40 }, pos = UDim2.new(0, 0, 1, -46) })
end

Kit.text(c, {
	name = "Warning", text = "YOU WILL LOSE YOUR POTIONS, CASH & WEAPONS!", color = { 255, 72, 72 },
	textSize = 30, size = { 1, 0, 0, 44 }, pos = { 0, 300 }, scaled = true,
})

Kit.bar(c, {
	name = "Progress", value = 75, max = 100, text = "75K/100K", textSize = 38,
	size = { 740, 70 }, pos = UDim2.new(0.5, 0, 0, 362), anchor = { 0.5, 0 },
})

Kit.button(c, {
	name = "RebirthButton", text = "REBIRTH", theme = "green", textSize = 46,
	size = { 290, 96 }, pos = UDim2.new(0.5, 0, 0, 462), anchor = { 0.5, 0 },
})

Kit.controller(screen)
return Kit.report(screen)
