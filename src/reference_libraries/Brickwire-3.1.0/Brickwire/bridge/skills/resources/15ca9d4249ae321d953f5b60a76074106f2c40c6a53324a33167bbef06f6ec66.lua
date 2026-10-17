--[[ LURONG GUI TEMPLATE
id: codes
name: Codes (Studded)
style: studded
tags: codes, redeem, twitter, promo, reward code, text input, modal
description: Dark studded window with a bright blue header, three lines of promo text, a code text box and a big lime REDEEM button.
customize: title, header theme, promo text, placeholder, button text and theme, window size
]]

local screen = Kit.screen("CodesGui")

local win = Kit.window(screen, {
	name = "Codes", title = "Codes", emoji = "🎟️", theme = "blue",
	size = { 1080, 700 }, headerHeight = 116,
})
local c = win.content

Kit.text(c, {
	name = "Promo", text = "Follow @YourStudio on twitter\nto get the latest codes and\nrewards in the game!",
	textSize = 54, wrap = true, size = { 1, 0, 0, 210 }, pos = { 0, 20 },
})

Kit.input(c, {
	name = "CodeInput", placeholder = "Type here...", textSize = 52,
	size = { 780, 100 }, pos = UDim2.new(0.5, 0, 0, 258), anchor = { 0.5, 0 },
})

Kit.button(c, {
	name = "Redeem", text = "REDEEM", theme = "lime", font = Enum.Font.GothamBlack, textSize = 72,
	size = { 370, 128 }, pos = UDim2.new(0.5, 0, 0, 392), anchor = { 0.5, 0 }, lip = 10,
})

-- Game logic stub: send the typed code to the server.
Kit.make("LocalScript", { Name = "CodesLogic", Source = [==[
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local content = script.Parent:WaitForChild("Codes"):WaitForChild("Body"):WaitForChild("Content")
local box = content:WaitForChild("CodeInput"):WaitForChild("TextBox")
local button = content:WaitForChild("Redeem")
local label = button:WaitForChild("Label")

button.Activated:Connect(function()
	local code = string.upper((box.Text:gsub("%s", "")))
	if code == "" then return end
	-- TODO: create a RemoteFunction named "RedeemCode" in ReplicatedStorage and validate the code on the server.
	local remote = ReplicatedStorage:FindFirstChild("RedeemCode")
	local ok = remote and remote:IsA("RemoteFunction") and remote:InvokeServer(code)
	label.Text = ok and "REDEEMED!" or "INVALID"
	task.wait(1.2)
	label.Text = "REDEEM"
	box.Text = ""
end)
]==] }, screen)

Kit.controller(screen)
return Kit.report(screen)
