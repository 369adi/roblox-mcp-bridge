--[[ LURONG GUI TEMPLATE
id: daily_rewards
name: Daily Rewards (7 Days)
style: studded
tags: daily, login rewards, streak, calendar, day 7, claim, locked, weekly
description: Orange-header window with six day cards in a 3x2 grid (orange "Day N" tab, reward icon, amount, claimed tick or lock) and one tall Day 7 jackpot card on the right.
customize: title, rewards per day (icon, amount), which days are claimed, Day 7 reward name
]]

local screen = Kit.screen("DailyGui")

local win = Kit.window(screen, {
	name = "Daily", title = "Daily", theme = "orange", bodyTheme = "slate", titleAlign = "Center",
	size = { 1120, 700 }, headerHeight = 104, overhang = 12, padding = 24,
})
local c = win.content

-- state: "claimed" (tick), "ready" (claim today) or "locked"
local days = {
	{ amount = "x100", emoji = "💵", state = "claimed" },
	{ amount = "Dragon Egg", emoji = "🥚", state = "claimed" },
	{ amount = "x100M", emoji = "💵", state = "ready" },
	{ amount = "Potion", emoji = "🧪", state = "locked" },
	{ amount = "x1B", emoji = "💰", state = "locked" },
	{ amount = "Gem Pack", emoji = "💎", state = "locked" },
}

local function dayCard(parent, day, info, size, pos)
	local card = Kit.box(parent, { name = "Day" .. day, size = size, pos = pos })
	card:SetAttribute("State", info.state)
	local body = Kit.slot(card, { name = "Card", size = UDim2.new(1, 0, 1, -40), pos = { 0, 40 }, transparency = 0.1, outline = 4 })
	local tab = Kit.panel(card, { name = "Tab", theme = "orange", size = UDim2.new(1, 0, 0, 46), outline = 4, lip = 5, studWidth = 360 })
	Kit.text(tab, { name = "DayLabel", text = "Day " .. day, textSize = 28, size = UDim2.new(1, 0, 1, -6) })
	local icon = Kit.icon(body, { emoji = info.emoji, size = UDim2.fromScale(0.5, 0.56), pos = UDim2.fromScale(0.5, 0.42) })
	Kit.text(body, { name = "Amount", text = info.amount, textSize = 30, scaled = true, size = UDim2.new(1, -12, 0, 40), pos = UDim2.new(0, 6, 1, -46) })
	if info.state == "claimed" then
		icon.TextTransparency = 0.55
		Kit.icon(body, { name = "Tick", emoji = "✅", size = UDim2.fromScale(0.34, 0.4), pos = UDim2.fromScale(0.5, 0.42), z = 4 })
	elseif info.state == "locked" then
		icon.TextTransparency = 0.45
		Kit.icon(body, { name = "Lock", emoji = "🔒", size = UDim2.fromScale(0.3, 0.36), pos = UDim2.fromScale(0.5, 0.42), z = 4 })
	else
		body.UIStroke.Color = Color3.fromRGB(255, 214, 60)
	end
	return card
end

local grid = Kit.box(c, { name = "Days", size = UDim2.new(0, 740, 1, 0) })
for i, info in ipairs(days) do
	local col, rowIndex = (i - 1) % 3, (i - 1) // 3
	dayCard(grid, i, info, { 232, 258 }, { col * 254, rowIndex * 282 })
end

dayCard(c, 7, { amount = "Strawberry Elephant", emoji = "🐘", state = "locked" }, UDim2.new(0, 300, 1, -12), UDim2.new(1, -300, 0, 0))

Kit.controller(screen)
return Kit.report(screen)
