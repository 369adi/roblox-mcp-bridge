--[[ LURONG GUI TEMPLATE
id: index
name: Index / Collection
style: studded
tags: index, collection, pets, brainrots, inventory grid, discovered, completion bar, bonus
description: Purple-header window with a scrolling grid of dark slots (icon + name, undiscovered ones dimmed with "???") and a completion line with a progress bar at the bottom.
customize: title, entries table, columns, bonus text, progress value, header theme
]]

local screen = Kit.screen("IndexGui")

local win = Kit.window(screen, {
	name = "Index", title = "Index", theme = "purple", bodyTheme = "slate", titleAlign = "Center",
	size = { 980, 760 }, headerHeight = 104, padding = 20,
})
local c = win.content

local entries = {
	{ name = "Tung Sahur", emoji = "🥁", found = true },
	{ name = "Boneca", emoji = "🐸", found = true },
	{ name = "Patapim", emoji = "🐒", found = true },
	{ name = "Lirili Larila", emoji = "🐘", found = true },
	{ name = "Tralalero", emoji = "🦈", found = true },
	{ name = "Bombardiro", emoji = "🐊", found = false },
	{ name = "Cappuccino", emoji = "☕", found = false },
	{ name = "Chimpanzini", emoji = "🍌", found = false },
}

local grid = Kit.scroll(c, { name = "Entries", size = { 1, 0, 1, -140 } })
Kit.grid(grid, { cell = { 210, 210 }, gap = { 18, 18 }, alignX = "Left" })
Kit.pad(grid, 4, 4, 4, 4)

local found = 0
for i, entry in ipairs(entries) do
	local slot = Kit.slot(grid, { name = entry.name:gsub("%s", ""), order = i, transparency = 0.15, outline = 4 })
	slot:SetAttribute("Found", entry.found)
	local icon = Kit.icon(slot, { emoji = entry.emoji, size = { 128, 128 }, pos = UDim2.fromScale(0.5, 0.42) })
	local label = Kit.text(slot, { name = "EntryName", text = entry.found and entry.name or "???", textSize = 26, scaled = true,
		size = { 1, -12, 0, 40 }, pos = UDim2.new(0, 6, 1, -48) })
	if entry.found then
		found += 1
	else
		icon.TextTransparency = 0.75
		label.TextTransparency = 0.4
	end
end

Kit.text(c, {
	name = "Bonus", text = "Collect all Brainrots for a 50% Cash Boost", textSize = 34, scaled = true,
	size = { 1, 0, 0, 44 }, pos = UDim2.new(0, 0, 1, -122),
})
Kit.bar(c, {
	name = "Completion", value = found, max = #entries, text = found .. "/" .. #entries, textSize = 30,
	size = { 1, -8, 0, 58 }, pos = UDim2.new(0.5, 0, 1, -4), anchor = { 0.5, 1 },
})

Kit.controller(screen)
return Kit.report(screen)
