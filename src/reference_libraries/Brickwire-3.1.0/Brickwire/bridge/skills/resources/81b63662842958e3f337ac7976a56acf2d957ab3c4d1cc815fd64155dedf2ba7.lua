--[[ LURONG GUI TEMPLATE
id: leaderboard
name: Leaderboard
style: studded
tags: leaderboard, ranking, top players, score, category tabs, gold silver bronze, scrolling list
description: White-bodied window with a blue header, four category tabs and ranked rows (gold, silver, bronze, then white) showing rank, avatar, name and score.
customize: title, tab names, row count, score label, rank colours
]]

local screen = Kit.screen("LeaderboardGui")

local win = Kit.window(screen, {
	name = "Leaderboard", title = "Leaderboard", emoji = "🏆", theme = "blue", bodyTheme = "white",
	bodyStuds = false, size = { 920, 700 }, headerHeight = 100, padding = 20,
})
local c = win.content

local categories = { "Cash", "Wins", "Rebirths", "Playtime" }
Kit.tabs(c, { group = "Leaderboard", items = categories, active = 1, size = { 1, 0, 0, 60 }, textSize = 26 })

local rankThemes = { "gold", "silver", "bronze" }

for index, category in ipairs(categories) do
	local page = Kit.page(c, { name = category, group = "Leaderboard", visible = index == 1, size = { 1, 0, 1, -76 }, pos = { 0, 76 } })
	local list = Kit.scroll(page, { name = "Rows" })
	Kit.list(list, { gap = 12 })
	Kit.pad(list, 3, 3, 3, 3)
	-- At runtime, clear these rows and create one per leaderboard entry.
	for rank = 1, 6 do
		local row = Kit.panel(list, {
			name = "Rank" .. rank, theme = rankThemes[rank] or "white", size = { 1, -20, 0, 112 }, order = rank,
			outline = 3, studStrength = 0.7, lip = 6,
		})
		local rankBox = Kit.panel(row, { name = "RankBox", theme = "white", size = { 70, 70 }, pos = UDim2.new(0, 16, 0.5, -3), anchor = { 0, 0.5 }, outline = 3, studs = false })
		Kit.text(rankBox, { name = "Rank", text = "#" .. rank, textSize = 34 })
		Kit.avatar(row, { size = { 100, 100 }, pos = UDim2.new(0, 104, 1, -6), anchor = { 0, 1 }, corner = 0, outline = 0, theme = { top = { 255, 255, 255 }, bottom = { 255, 255, 255 } } }).BackgroundTransparency = 1
		Kit.text(row, { name = "DisplayName", text = "OnlyTwentyCharacters", textSize = 32, alignX = "Left", size = { 440, 44 }, pos = { 220, 14 }, scaled = true })
		Kit.text(row, { name = "Username", text = "@OnlyTwentyCharacters", textSize = 22, alignX = "Left", size = { 440, 30 }, pos = { 220, 60 }, scaled = true })
		Kit.text(row, { name = "ScoreLabel", text = "Score:", textSize = 22, alignX = "Right", size = { 180, 28 }, pos = UDim2.new(1, -196, 0, 16) })
		Kit.text(row, { name = "Score", text = "560", textSize = 38, alignX = "Right", size = { 180, 46 }, pos = UDim2.new(1, -196, 0, 46) })
	end
end

Kit.controller(screen)
return Kit.report(screen)
