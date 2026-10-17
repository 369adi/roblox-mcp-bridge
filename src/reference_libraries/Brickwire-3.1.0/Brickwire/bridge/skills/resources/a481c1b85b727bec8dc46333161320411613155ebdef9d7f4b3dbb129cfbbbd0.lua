--[[ LURONG GUI TEMPLATE
id: shop_tabs
name: Shop with Category Sidebar
style: studded
tags: shop, categories, sidebar, vertical tabs, exclusive, potions, passes, rewards, item grid, pages
description: Wide shop window with a column of four rounded, studded category buttons on the left (pink, blue, orange, cyan) and one item grid page per category on the right; each item cell has an icon, a name and a green price button.
customize: categories (text, theme), items per category (name, icon, price), cell size, header theme
]]

local screen = Kit.screen("ShopGui")

local win = Kit.window(screen, {
	name = "Shop", title = "Shop", emoji = "🛒", theme = "orange",
	bodyTheme = { top = { 214, 164, 72 }, bottom = { 190, 136, 52 } }, bodyStudStrength = 0.45,
	size = { 1180, 760 }, headerHeight = 104, padding = 20,
})
local c = win.content

local categories = {
	{ text = "Exclusive", theme = "pink", items = { { "Dragon", "🐉", 799 }, { "Unicorn", "🦄", 599 }, { "Rocket", "🚀", 449 }, { "Crown", "👑", 399 }, { "UFO", "🛸", 349 }, { "Trophy", "🏆", 299 } } },
	{ text = "Potions", theme = "blue", items = { { "Luck", "🍀", 49 }, { "Speed", "⚡", 39 }, { "Cash", "💰", 59 }, { "Magnet", "🧲", 29 } } },
	{ text = "Passes", theme = "orange", items = { { "VIP", "⭐", 399 }, { "2x Cash", "💵", 249 }, { "Auto Farm", "🤖", 199 } } },
	{ text = "Rewards", theme = "cyan", items = { { "Daily", "📅", 0 }, { "Group", "👥", 0 }, { "Invite", "🤝", 0 } } },
}

-- category buttons (rounded like plastic bricks; every button keeps its own colour)
local tabItems = {}
for i, cat in ipairs(categories) do tabItems[i] = { text = cat.text, theme = cat.theme } end
Kit.tabs(c, {
	name = "Categories", group = "Shop", items = tabItems, vertical = true, dimInactive = false,
	size = { 290, 420 }, gap = 18, corner = 14, textSize = 38, tabSize = UDim2.new(1, 0, 0, 86), lip = 9, outline = 4,
})

-- one page of items per category
for index, cat in ipairs(categories) do
	local page = Kit.page(c, { name = cat.text, group = "Shop", visible = index == 1, size = { 1, -314, 1, 0 }, pos = { 314, 0 } })
	local panel = Kit.slot(page, { name = "Backdrop", size = UDim2.fromScale(1, 1), transparency = 0.45, outline = 4 })
	local grid = Kit.scroll(panel, { name = "Items", size = { 1, -16, 1, -16 }, pos = { 8, 8 } })
	Kit.grid(grid, { cell = { 240, 270 }, gap = { 16, 16 }, alignX = "Left" })
	Kit.pad(grid, 6, 6, 6, 6)
	for i, item in ipairs(cat.items) do
		local cell = Kit.slot(grid, { name = item[1]:gsub("%s", ""), order = i, transparency = 0.1, outline = 4 })
		Kit.icon(cell, { emoji = item[2], size = { 120, 120 }, pos = UDim2.new(0.5, 0, 0, 82) })
		Kit.text(cell, { name = "ItemName", text = item[1], textSize = 30, scaled = true, size = { 1, -12, 0, 38 }, pos = { 6, 150 } })
		Kit.button(cell, {
			name = "Buy", text = item[3] > 0 and (Kit.ROBUX .. " " .. item[3]) or "Claim", theme = "green", textSize = 30,
			size = { 1, -24, 0, 60 }, pos = UDim2.new(0.5, 0, 1, -12), anchor = { 0.5, 1 }, lip = 6, studWidth = 220,
		})
	end
end

Kit.controller(screen)
return Kit.report(screen)
