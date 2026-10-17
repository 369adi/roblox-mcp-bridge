--[[ LURONG GUI TEMPLATE
id: codes_glossy
name: Codes (Glossy Blue)
style: glossy
tags: codes, redeem, clicker, glossy, rounded, light, blue, modal, text input
description: Rounded glossy window in the clicker-simulator style: navy title bar wider than the pale blue body, navy outlines, a white pill text box and a green Redeem button.
customize: title, promo text, placeholder, button text and theme, colours
]]

Kit.setStyle("glossy")
local screen = Kit.screen("CodesGui")

local win = Kit.window(screen, {
	name = "Codes", title = "Codes", theme = "navy", bodyTheme = { top = { 244, 250, 255 }, bottom = { 196, 222, 255 } },
	size = { 860, 580 }, headerHeight = 112, overhang = 18, padding = 26, rim = 0,
})
local c = win.content

Kit.text(c, {
	name = "Promo", text = "Follow @YourStudio for\nin game codes!", textSize = 54, wrap = true,
	size = { 1, 0, 0, 140 }, pos = { 0, 8 },
})

local field = Kit.panel(c, {
	name = "CodeInput", theme = "white", size = { 760, 100 }, pos = UDim2.new(0.5, 0, 0, 168), anchor = { 0.5, 0 },
	corner = 26, lip = 8,
})
local box = Kit.make("TextBox", {
	Name = "TextBox", BackgroundTransparency = 1, Size = UDim2.new(1, -40, 1, -14), Position = UDim2.fromOffset(20, 2),
	Font = Kit.Style.font, PlaceholderText = "Enter code here", PlaceholderColor3 = Color3.fromRGB(255, 255, 255),
	Text = "", TextColor3 = Color3.fromRGB(255, 255, 255), TextSize = 50, ClearTextOnFocus = false, ZIndex = 2,
}, field)
Kit.stroke(box, 4, Kit.Style.ink, true)

Kit.button(c, {
	name = "Redeem", text = "Redeem", theme = { top = { 90, 240, 130 }, bottom = { 24, 196, 96 }, stroke = { 10, 96, 44 } },
	textSize = 46, strokeColor = { 10, 96, 44 }, size = { 290, 104 }, pos = UDim2.new(0.5, 0, 0, 300), anchor = { 0.5, 0 }, lip = 10,
})

Kit.controller(screen)
Kit.setStyle("studded")
return Kit.report(screen)
