--[[ LURONG GUI TEMPLATE
id: item_shop
name: Item Shop (Rows)
style: studded
tags: shop, store, items, buy, purchase, robux, cash, price buttons, scrolling list
description: Blue-header shop window with a scrolling list of item rows: dark icon slot, item name, two-line description and two stacked buy buttons (orange Robux price, green cash price).
customize: title, items table (name, description, icon, robux, cash), button themes, row height
]]

local screen = Kit.screen("ItemShopGui")

local win = Kit.window(screen, {
	name = "ItemShop", title = "Item Shop", emoji = "📦", theme = "blue",
	size = { 1000, 820 }, headerHeight = 104, padding = 16,
})

local items = {
	{ name = "Wheat", description = "Grows fast and sells for a steady profit.", emoji = "🌾", robux = 125, cash = 100 },
	{ name = "Carrot", description = "Takes longer to grow but sells for double.", emoji = "🥕", robux = 199, cash = 450 },
	{ name = "Pumpkin", description = "A rare crop worth a small fortune.", emoji = "🎃", robux = 349, cash = 2500 },
	{ name = "Golden Apple", description = "Boosts every harvest for ten minutes.", emoji = "🍎", robux = 499, cash = 10000 },
}

local list = Kit.scroll(win.content, { name = "Items" })
Kit.list(list, { gap = 16 })
Kit.pad(list, 3, 4, 3, 4)

for i, item in ipairs(items) do
	local row = Kit.slot(list, { name = item.name, size = { 1, -18, 0, 206 }, order = i, transparency = 0.3, outline = 4 })
	local iconSlot = Kit.slot(row, { name = "IconSlot", size = { 150, 150 }, pos = UDim2.new(0, 22, 0.5, 0), anchor = { 0, 0.5 }, transparency = 0.1 })
	Kit.icon(iconSlot, { emoji = item.emoji, size = { 112, 112 } })
	Kit.text(row, { name = "ItemName", text = item.name, textSize = 50, alignX = "Left", size = { 440, 62 }, pos = { 194, 24 }, scaled = true })
	Kit.text(row, { name = "Description", text = item.description, textSize = 32, alignX = "Left", alignY = "Top", wrap = true, size = { 440, 84 }, pos = { 196, 94 } })
	Kit.button(row, {
		name = "BuyRobux", text = Kit.ROBUX .. " " .. item.robux, theme = "orange", textSize = 42,
		size = { 250, 82 }, pos = UDim2.new(1, -22, 0, 16), anchor = { 1, 0 },
	})
	Kit.button(row, {
		name = "BuyCash", text = "$" .. item.cash, theme = "green", textSize = 42,
		size = { 250, 82 }, pos = UDim2.new(1, -22, 1, -16), anchor = { 1, 1 },
	})
end

Kit.controller(screen)
return Kit.report(screen)
