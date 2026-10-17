--[[ LURONG GUI TEMPLATE
id: gamepass_store
name: Gamepass Store (Banners)
style: studded
tags: store, shop, gamepass, robux, vip, banners, developer products, monetization, scrolling list
description: Red-header "Store" window (header wider than the body) with a scrolling stack of big colourful gamepass banners: large icon on the left, tinted title, wrapped description and the Robux price in the corner.
customize: title, passes table (name, description, icon, theme, price), banner height, header theme
]]

local screen = Kit.screen("StoreGui")

local win = Kit.window(screen, {
	name = "Store", title = "Store", theme = "red", bodyTheme = "slate", titleAlign = "Center",
	size = { 1060, 760 }, headerHeight = 118, overhang = 14, padding = 22,
})

local passes = {
	{ name = "VIP", description = "Exclusive chat tag, 2x cash and a daily VIP crate.", emoji = "👑", theme = "orange", price = 399 },
	{ name = "Server Luck", description = "Doubles the luck of everyone in this server for 15 minutes.", emoji = "🍀", theme = "lime", price = 67 },
	{ name = "Starter Pack", description = "A head start: 10K cash, 3 potions and a rare pet.", emoji = "😈", theme = "pink", price = 149 },
	{ name = "2x Speed", description = "Run twice as fast forever.", emoji = "⚡", theme = "cyan", price = 249 },
}

local list = Kit.scroll(win.content, { name = "Passes" })
Kit.list(list, { gap = 20 })
Kit.pad(list, 4, 4, 4, 4)

for i, pass in ipairs(passes) do
	local theme = Kit.theme(pass.theme)
	local banner = Kit.panel(list, {
		name = pass.name:gsub("%s", ""), theme = pass.theme, size = { 1, -22, 0, 250 }, order = i,
		shine = true, lip = 10, rim = 5, outline = 5,
	}, "TextButton")
	banner:SetAttribute("LurongButton", true)
	banner:SetAttribute("Price", pass.price)
	-- emoji have no outline of their own, so they sit on a dark medallion to stay readable on bright banners
	local plate = Kit.slot(banner, { name = "IconPlate", size = { 190, 190 }, pos = UDim2.new(0, 150, 0.5, -5), anchor = { 0.5, 0.5 }, corner = 999, outline = 5, transparency = 0.45 })
	Kit.icon(plate, { emoji = pass.emoji, size = { 132, 132 } })
	Kit.text(banner, {
		name = "Title", text = pass.name, textSize = 50, color = theme.top:Lerp(Color3.new(1, 1, 1), 0.35),
		size = { 600, 62 }, pos = { 320, 18 }, scaled = true,
	})
	Kit.text(banner, {
		name = "Description", text = pass.description, textSize = 34, wrap = true,
		size = { 600, 110 }, pos = { 320, 80 },
	})
	Kit.text(banner, {
		name = "Price", text = Kit.ROBUX .. " " .. pass.price, textSize = 38, alignX = "Right",
		size = { 220, 46 }, pos = UDim2.new(1, -244, 1, -66),
	})
end

Kit.controller(screen)
return Kit.report(screen)
