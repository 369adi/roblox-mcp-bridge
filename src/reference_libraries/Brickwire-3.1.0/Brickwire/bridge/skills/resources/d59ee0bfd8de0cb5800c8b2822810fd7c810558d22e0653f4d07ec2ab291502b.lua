--[[ LURONG GUI TEMPLATE
id: hud_simulator
name: Simulator HUD (Studded)
style: studded
tags: hud, main menu, side buttons, currency, cash, top buttons, boosts, simulator, tycoon, always on screen
description: Full in-game HUD: left column with an offer card, a 2x3 grid of square menu tiles (with "!" and SALE badges) and a toggle; three big buttons at the top centre; cash, tickets and friend boost at the bottom left; a spin shortcut at the top right; active boosts at the bottom right.
customize: tile list (text, icon, theme, window it opens), top buttons, currency values, boosts
]]

local screen = Kit.screen("HudGui", { displayOrder = 1 })

-- ── Left column ─────────────────────────────────────────────────────────────
local left = Kit.dock(screen, { name = "LeftMenu", corner = "Left", size = { 380, 580 }, margin = { 14, 0 } })

local offer = Kit.slot(left, { name = "Offer", size = { 376, 112 }, transparency = 0.1, outline = 4, studs = 22, studStrength = 0.5 })
Kit.icon(offer, { emoji = "👻", size = { 84, 84 }, pos = UDim2.new(0, 56, 0.5, -4) })
Kit.text(offer, { name = "OfferName", text = "Starter Pack", textSize = 26, alignX = "Left", size = { 250, 30 }, pos = { 112, 8 }, scaled = true })
Kit.text(offer, { name = "OfferText", text = "Earn lots of money and progress much faster!", textSize = 18, color = { 196, 204, 210 }, alignX = "Left", alignY = "Top",
	wrap = true, stroke = 0, size = { 252, 62 }, pos = { 112, 42 } })
Kit.text(offer, { name = "OfferPrice", text = Kit.ROBUX .. "420", textSize = 24, color = { 120, 255, 80 }, size = { 96, 28 }, pos = { 8, 80 } })

local tiles = {
	{ text = "Index", emoji = "📘", theme = "blue", opens = "Index" },
	{ text = "Store", emoji = "🧺", theme = "red", opens = "Store", tag = "SALE!" },
	{ text = "Gifts", emoji = "🎁", theme = "purple", opens = "Rewards", badge = "!" },
	{ text = "Rebirth", emoji = "🔄", theme = "pink", opens = "Rebirth" },
	{ text = "Invite", emoji = "🤝", theme = "green", opens = "Invite" },
	{ text = "Config", emoji = "⚙️", theme = "gray", opens = "Settings" },
}
local grid = Kit.box(left, { name = "Tiles", size = { 220, 330 }, pos = { 0, 126 } })
Kit.grid(grid, { cell = { 104, 104 }, gap = { 10, 10 }, columns = 2, alignX = "Left" })
for i, t in ipairs(tiles) do
	local tile = Kit.tile(grid, { text = t.text, emoji = t.emoji, theme = t.theme, side = 104, order = i, studs = 20, shine = true, action = "toggle:" .. t.opens })
	if t.badge then Kit.badge(tile, { text = t.badge, side = 34 }) end
	if t.tag then
		local tag = Kit.text(tile, { name = "Tag", text = t.tag, textSize = 20, color = { 255, 70, 70 }, size = { 90, 26 }, pos = UDim2.new(1, 4, 0, -8), anchor = { 1, 0 }, z = 6 })
		tag.Rotation = 8
	end
end

Kit.button(left, { name = "SlowToggle", text = "Slow: On", theme = "green", textSize = 30, size = { 218, 62 }, pos = { 0, 468 }, lip = 6 })

-- ── Top centre buttons ──────────────────────────────────────────────────────
local top = Kit.dock(screen, { name = "TopButtons", corner = "Top", size = { 920, 96 }, margin = { 0, 8 } })
Kit.list(top, { horizontal = true, gap = 18, alignY = "Center" })
for i, b in ipairs({ { "Sell", "lime" }, { "Base", "blue" }, { "Shop", "orange" } }) do
	Kit.button(top, { name = b[1], text = b[1], theme = b[2], textSize = 44, size = { 286, 84 }, order = i, lip = 9 })
end

-- ── Bottom left: currencies ─────────────────────────────────────────────────
local wallet = Kit.dock(screen, { name = "Wallet", corner = "BottomLeft", size = { 460, 170 }, margin = { 16, 12 } })
Kit.icon(wallet, { emoji = "🎟️", size = { 54, 54 }, pos = { 30, 30 } })
Kit.text(wallet, { name = "Tickets", text = "189", textSize = 44, color = { 255, 196, 40 }, alignX = "Left", size = { 240, 54 }, pos = { 64, 4 } })
Kit.text(wallet, { name = "Cash", text = "$167,000", textSize = 56, color = { 96, 255, 60 }, alignX = "Left", size = { 320, 66 }, pos = { 4, 58 }, scaled = true })
Kit.button(wallet, { name = "BuyCash", text = "+", theme = "green", textSize = 44, size = { 56, 56 }, pos = { 270, 62 }, lip = 5, action = "toggle:Store" })
Kit.text(wallet, { name = "FriendBoost", text = "Friend Boost  +0%", textSize = 30, alignX = "Left", size = { 400, 38 }, pos = { 6, 128 } })

-- ── Top right: spin shortcut ────────────────────────────────────────────────
local spin = Kit.dock(screen, { name = "SpinShortcut", corner = "TopRight", size = { 130, 150 }, margin = { 220, 10 } })
local spinTile = Kit.tile(spin, { name = "Spin", emoji = "🎡", theme = "dark", side = 110, corner = 999, studs = false, action = "toggle:Wheel" })
spinTile.Position = UDim2.fromOffset(10, 0)
Kit.text(spin, { name = "SpinCount", text = "Spin 0x", textSize = 26, size = { 130, 32 }, pos = { 0, 114 } })

-- ── Bottom right: active boosts ─────────────────────────────────────────────
local boosts = Kit.dock(screen, { name = "Boosts", corner = "BottomRight", size = { 400, 110 }, margin = { 16, 12 } })
Kit.list(boosts, { horizontal = true, gap = 8, alignX = "Right", alignY = "Bottom" })
for i, b in ipairs({ { "🍀", "x2" }, { "🌼", "x4" }, { "🌸", "x8" }, { "👑", "50%" } }) do
	local holder = Kit.box(boosts, { name = "Boost" .. i, size = { 90, 100 }, order = i })
	Kit.icon(holder, { emoji = b[1], size = { 74, 74 }, pos = UDim2.new(0.5, 0, 0, 40) })
	Kit.text(holder, { name = "Amount", text = b[2], textSize = 26, alignX = "Right", size = { 86, 30 }, pos = { 0, 68 }, z = 4 })
end

Kit.controller(screen)
return Kit.report(screen)
