--[[ LURONG GUI TEMPLATE
id: trades
name: Trades Player List
style: studded
tags: trade, trading, player list, friends, invite, request, avatar, scrolling list
description: Tall window with a pink header and a scrolling list of player rows: round avatar, nickname and a green Trade button.
customize: title, header theme, row count, button text and theme (Trade / Invite / Add)
]]

local screen = Kit.screen("TradesGui")

local win = Kit.window(screen, {
	name = "Trades", title = "Trades", emoji = "🔁", theme = "pink",
	bodyTheme = { top = { 22, 58, 64 }, bottom = { 14, 38, 44 } },
	size = { 760, 980 }, headerHeight = 124, padding = 14,
})

local list = Kit.scroll(win.content, { name = "Players" })
Kit.list(list, { gap = 14 })
Kit.pad(list, 3, 4, 3, 4)

-- One row per player. At runtime, clone "Row" for each player and set Nickname / Headshot.
local function playerRow(order, nickname, userId)
	local row = Kit.slot(list, { name = "Row", size = { 1, -14, 0, 118 }, order = order, transparency = 0.35 })
	Kit.avatar(row, { size = { 92, 92 }, pos = UDim2.new(0, 16, 0.5, 0), anchor = { 0, 0.5 }, userId = userId })
	Kit.text(row, { name = "Nickname", text = nickname, textSize = 42, alignX = "Left", size = { 300, 60 }, pos = UDim2.new(0, 126, 0.5, -30), scaled = true })
	Kit.button(row, { name = "Trade", text = "Trade", theme = "green", textSize = 30, size = { 250, 62 }, pos = UDim2.new(1, -18, 0.5, 0), anchor = { 1, 0.5 }, lip = 6 })
	return row
end

for i = 1, 6 do
	playerRow(i, "Nickname", 1)
end

Kit.controller(screen)
return Kit.report(screen)
