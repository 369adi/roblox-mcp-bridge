--[[ LURONG GUI TEMPLATE
id: timed_rewards
name: Timed Rewards (Playtime Grid)
style: studded
tags: rewards, playtime, timer, countdown, gifts, lucky block, grid, skip all, session rewards
description: Purple-to-pink header window with a 4-column grid of reward cells (title, icon, countdown timer) tinted by reward type, a "Leaving Resets Progress!" line and an orange Skip All button with its Robux price.
customize: title, rewards table (title, icon, seconds, tint), columns, footer text, skip price
]]

local screen = Kit.screen("RewardsGui")

local win = Kit.window(screen, {
	name = "Rewards", title = "Rewards", theme = { top = { 216, 70, 255 }, bottom = { 255, 60, 170 } },
	bodyTheme = "slate", titleAlign = "Center", size = { 1020, 800 }, headerHeight = 108, overhang = 12, padding = 22,
})
local c = win.content

local tints = {
	cash  = { top = { 34, 86, 34 },  bottom = { 16, 48, 18 },  outline = { 84, 170, 70 } },
	lucky = { top = { 96, 74, 16 },  bottom = { 54, 40, 8 },   outline = { 222, 170, 40 } },
}
local rewards = {}
for i = 1, 12 do
	local lucky = (i % 2 == 0)
	rewards[i] = { title = lucky and "Lucky Block" or "Cash", emoji = lucky and "🎁" or "💵", seconds = i * 300, tint = lucky and "lucky" or "cash" }
end

local function clock(seconds)
	return ("%02d:%02d:%02d"):format(seconds // 3600, (seconds % 3600) // 60, seconds % 60)
end

local grid = Kit.box(c, { name = "Grid", size = { 1, 0, 0, 520 } })
Kit.grid(grid, { cell = { 224, 160 }, gap = { 18, 18 }, columns = 4 })

for i, reward in ipairs(rewards) do
	local tint = tints[reward.tint]
	local cell = Kit.slot(grid, {
		name = "Reward" .. i, order = i, theme = tint, outlineColor = tint.outline, transparency = 0, studs = 22, studStrength = 0.5,
	})
	cell:SetAttribute("Seconds", reward.seconds)
	Kit.text(cell, { name = "RewardTitle", text = reward.title, textSize = 24, size = { 1, 0, 0, 32 }, pos = { 0, 6 }, scaled = true })
	Kit.icon(cell, { emoji = reward.emoji, size = { 76, 76 }, pos = UDim2.fromScale(0.5, 0.5) })
	Kit.text(cell, { name = "Timer", text = clock(reward.seconds), textSize = 26, size = { 1, 0, 0, 34 }, pos = UDim2.new(0, 0, 1, -40) })
end

Kit.text(c, {
	name = "Footer", text = "Leaving Resets Progress!", textSize = 40, alignX = "Left", scaled = true,
	size = { 560, 70 }, pos = UDim2.new(0, 6, 1, -78),
})
local skip = Kit.button(c, {
	name = "SkipAll", text = "Skip All", theme = "orange", textSize = 36,
	size = { 300, 84 }, pos = UDim2.new(1, -6, 1, -4), anchor = { 1, 1 },
})
skip.Label.Size = UDim2.new(1, -16, 0, 44)
Kit.text(skip, { name = "Price", text = Kit.ROBUX .. " 49", textSize = 20, size = { 1, 0, 0, 24 }, pos = { 0, 46 } })

-- Counts every cell down once per second and marks finished ones as claimable.
Kit.make("LocalScript", { Name = "RewardsLogic", Source = [==[
local grid = script.Parent:WaitForChild("Rewards"):WaitForChild("Body"):WaitForChild("Content"):WaitForChild("Grid")
local started = os.clock()
while task.wait(1) do
	local elapsed = math.floor(os.clock() - started)
	for _, cell in ipairs(grid:GetChildren()) do
		local total = cell:GetAttribute("Seconds")
		if total then
			local left = math.max(0, total - elapsed)
			cell.Timer.Text = left > 0 and ("%02d:%02d:%02d"):format(left // 3600, (left % 3600) // 60, left % 60) or "CLAIM!"
		end
	end
end
]==] }, screen)

Kit.controller(screen)
return Kit.report(screen)
