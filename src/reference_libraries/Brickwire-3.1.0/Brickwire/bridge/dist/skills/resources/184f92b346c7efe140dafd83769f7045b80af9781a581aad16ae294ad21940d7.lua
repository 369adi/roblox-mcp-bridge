--[[ LURONG GUI TEMPLATE
id: spin_wheel
name: Spin Wheel
style: studded
tags: wheel, spin, prize wheel, lucky spin, daily spin, gacha, rewards, buy spins
description: Blue-header window with an eight-segment prize wheel (label and icon per segment, pointer on top) and three buttons underneath: +1 Spin, Spin [count] and +5 Spins. Includes a working spin animation.
customize: title, segments (text, theme, icon), wheel diameter, button texts and prices
]]

local screen = Kit.screen("WheelGui")

local win = Kit.window(screen, {
	name = "Wheel", title = "Wheel", theme = "blue", bodyTheme = "slate", titleAlign = "Center",
	size = { 760, 900 }, headerHeight = 104, overhang = 12, padding = 20,
})
local c = win.content

local segments = {
	{ text = "500 Cash", theme = "red", emoji = "💵" },
	{ text = "Potion", theme = "white", emoji = "🧪" },
	{ text = "2K Cash", theme = "blue", emoji = "💰" },
	{ text = "Gem", theme = "white", emoji = "💎" },
	{ text = "1K Cash", theme = "red", emoji = "💵" },
	{ text = "Lucky Egg", theme = "white", emoji = "🥚" },
	{ text = "5K Cash", theme = "blue", emoji = "💰" },
	{ text = "Jackpot", theme = "gold", emoji = "👑" },
}

Kit.wheel(c, { name = "Wheel", diameter = 560, segments = segments, pos = UDim2.new(0.5, 0, 0, 34), anchor = { 0.5, 0 } })

Kit.button(c, { name = "BuyOne", text = "+1 Spin", theme = "orange", textSize = 30, size = { 196, 76 }, pos = UDim2.new(0, 4, 1, -8), anchor = { 0, 1 } })
Kit.button(c, { name = "Spin", text = "Spin [3]", theme = "blue", textSize = 40, size = { 280, 92 }, pos = UDim2.new(0.5, 0, 1, -4), anchor = { 0.5, 1 } })
Kit.button(c, { name = "BuyFive", text = "+5 Spins", theme = "purple", textSize = 30, size = { 196, 76 }, pos = UDim2.new(1, -4, 1, -8), anchor = { 1, 1 } })

-- Spin animation. The winning segment must be chosen by the SERVER in a real game.
Kit.make("LocalScript", { Name = "WheelLogic", Source = [==[
local TweenService = game:GetService("TweenService")
local content = script.Parent:WaitForChild("Wheel"):WaitForChild("Body"):WaitForChild("Content")
local spinner = content:WaitForChild("Wheel"):WaitForChild("Spinner")
local button = content:WaitForChild("Spin")
local SEGMENTS = 8
local spins, busy = 3, false

local function refresh() button.Label.Text = ("Spin [%d]"):format(spins) end

button.Activated:Connect(function()
	if busy or spins <= 0 then return end
	busy = true
	spins -= 1
	refresh()
	-- TODO: replace with the index returned by a RemoteFunction on the server.
	local winner = math.random(1, SEGMENTS)
	local arc = 360 / SEGMENTS
	local target = 360 * 6 - (winner - 1) * arc + math.random(-12, 12)
	spinner.Rotation = spinner.Rotation % 360
	local tween = TweenService:Create(spinner, TweenInfo.new(5, Enum.EasingStyle.Quart, Enum.EasingDirection.Out), { Rotation = target })
	tween:Play()
	tween.Completed:Wait()
	local prize = spinner:FindFirstChild("Segment" .. winner)
	print("Wheel landed on:", prize and prize:GetAttribute("Prize"))
	busy = false
end)
refresh()
]==] }, screen)

Kit.controller(screen)
return Kit.report(screen)
