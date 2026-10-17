--[[
	LurongUI Kit  -  v1.0.0
	A small Luau library for building Roblox simulator-style interfaces entirely
	from code (no image assets needed): studded gradient panels, thick outlines,
	bubble text, glossy buttons, progress bars, item slots, tabs, HUD tiles.

	HOW IT IS USED
	  * The Lurong GUI Builder prepends this file to every script it runs in
	    Studio as:   local Kit = (function() <this file> end)()
	  * Templates in this folder (and the code Gemini writes) only call Kit.*.
	  * Everything is laid out in DESIGN PIXELS on a 1920x1080 canvas. Each
	    top-level piece gets an "AutoScale" UIScale so it fits any screen; the
	    controller LocalScript (Kit.controller) keeps that scale up to date and
	    wires close/open/tab buttons plus hover and press animations.

	Nothing here needs to exist in the place at runtime except the instances it
	created and the one controller LocalScript inside the ScreenGui.
]]

local Kit = {}
Kit.VERSION = "1.0.0"
Kit.DESIGN = Vector2.new(1920, 1080)

local StarterGui = game:GetService("StarterGui")
local TextService = game:GetService("TextService")

local function rgb(r, g, b) return Color3.fromRGB(r, g, b) end
local BLACK, WHITE = rgb(0, 0, 0), rgb(255, 255, 255)

-- ---------------------------------------------------------------------------
-- Themes: every coloured surface is a vertical gradient  top -> bottom.
-- ---------------------------------------------------------------------------
Kit.Themes = {
	green  = { top = rgb(176, 255, 42),  bottom = rgb(22, 196, 44) },
	lime   = { top = rgb(214, 255, 40),  bottom = rgb(92, 214, 20) },
	blue   = { top = rgb(72, 214, 255),  bottom = rgb(22, 112, 255) },
	navy   = { top = rgb(46, 138, 255),  bottom = rgb(18, 84, 226) },
	cyan   = { top = rgb(110, 244, 255), bottom = rgb(0, 176, 255) },
	red    = { top = rgb(255, 96, 96),   bottom = rgb(228, 22, 48) },
	pink   = { top = rgb(255, 100, 236), bottom = rgb(204, 34, 204) },
	purple = { top = rgb(206, 92, 255),  bottom = rgb(122, 44, 236) },
	orange = { top = rgb(255, 196, 34),  bottom = rgb(255, 98, 12) },
	yellow = { top = rgb(255, 244, 70),  bottom = rgb(255, 176, 14) },
	gold   = { top = rgb(255, 226, 60),  bottom = rgb(255, 150, 8) },
	silver = { top = rgb(232, 248, 255), bottom = rgb(170, 214, 232) },
	bronze = { top = rgb(255, 160, 50),  bottom = rgb(224, 92, 10) },
	white  = { top = rgb(255, 255, 255), bottom = rgb(226, 234, 244) },
	gray   = { top = rgb(214, 214, 214), bottom = rgb(128, 128, 128) },
	dark   = { top = rgb(54, 70, 80),    bottom = rgb(32, 42, 50) },
	slate  = { top = rgb(62, 66, 74),    bottom = rgb(40, 43, 50) },
	black  = { top = rgb(30, 34, 38),    bottom = rgb(14, 16, 20) },
	-- wooden / gold kit
	wood   = { top = rgb(196, 110, 48),  bottom = rgb(150, 72, 28),  stroke = rgb(84, 38, 12) },
	plank  = { top = rgb(120, 58, 24),   bottom = rgb(92, 42, 16),   stroke = rgb(60, 26, 8) },
	amber  = { top = rgb(255, 222, 84),  bottom = rgb(246, 150, 22), stroke = rgb(120, 56, 12) },
}

-- ---------------------------------------------------------------------------
-- Style: the look shared by everything built after Kit.setStyle().
-- ---------------------------------------------------------------------------
Kit.Styles = {
	-- rounded-square corners, stud texture, black outlines (most simulator games)
	studded = { font = Enum.Font.FredokaOne, ink = BLACK, corner = 14, studs = true, shine = true, outline = 4 },
	-- rounded glossy plastic with navy outlines, no studs (clicker games)
	glossy  = { font = Enum.Font.FredokaOne, ink = rgb(8, 40, 110), corner = 16, studs = false, shine = false, gloss = true, outline = 5 },
	-- carved wood and gold
	wooden  = { font = Enum.Font.LuckiestGuy, ink = rgb(84, 38, 12), corner = 12, studs = false, shine = false, gloss = true, outline = 5 },
}
Kit.Style = table.clone(Kit.Styles.studded)

function Kit.setStyle(nameOrTable)
	local src = type(nameOrTable) == "string" and Kit.Styles[nameOrTable] or nameOrTable
	assert(type(src) == "table", "Kit.setStyle: unknown style " .. tostring(nameOrTable))
	local s = table.clone(Kit.Styles.studded)
	for k, v in pairs(src) do s[k] = v end
	Kit.Style = s
	return s
end

-- ---------------------------------------------------------------------------
-- Small converters so templates can write {w, h} instead of UDim2.fromOffset
-- ---------------------------------------------------------------------------
local function U2(v, default)
	if v == nil then return default end
	if typeof(v) == "UDim2" then return v end
	if type(v) == "table" then
		if #v == 2 then return UDim2.fromOffset(v[1], v[2]) end
		if #v == 4 then return UDim2.new(v[1], v[2], v[3], v[4]) end
	end
	error("LurongUI: expected UDim2, {x, y} pixels or {xs, xo, ys, yo}, got " .. typeof(v))
end

local function V2(v, default)
	if v == nil then return default end
	if typeof(v) == "Vector2" then return v end
	if type(v) == "table" then return Vector2.new(v[1], v[2]) end
	error("LurongUI: expected Vector2 or {x, y}")
end

local function C3(v, default)
	if v == nil then return default end
	if typeof(v) == "Color3" then return v end
	if type(v) == "table" then return rgb(v[1], v[2], v[3]) end
	if type(v) == "string" then
		local hex = v:gsub("#", "")
		return Color3.fromHex(hex)
	end
	error("LurongUI: expected Color3, {r, g, b} or hex string")
end

function Kit.theme(t)
	if type(t) == "table" then
		return { top = C3(t.top), bottom = C3(t.bottom or t.top), stroke = t.stroke and C3(t.stroke) or nil }
	end
	local th = Kit.Themes[t or "dark"]
	assert(th, "LurongUI: unknown theme '" .. tostring(t) .. "'")
	return th
end

Kit.udim2, Kit.color = U2, C3

-- ---------------------------------------------------------------------------
-- Primitives
-- ---------------------------------------------------------------------------
function Kit.make(class, props, parent)
	local inst = Instance.new(class)
	for k, v in pairs(props or {}) do inst[k] = v end
	if parent then inst.Parent = parent end
	return inst
end

function Kit.corner(obj, radius)
	if not radius or radius <= 0 then return nil end
	local c = Instance.new("UICorner")
	c.CornerRadius = radius >= 999 and UDim.new(1, 0) or UDim.new(0, radius)
	c.Parent = obj
	return c
end

function Kit.stroke(obj, thickness, color, forText)
	if not thickness or thickness <= 0 then return nil end
	local s = Instance.new("UIStroke")
	s.Thickness = thickness
	s.Color = color or Kit.Style.ink
	s.LineJoinMode = Enum.LineJoinMode.Round
	s.ApplyStrokeMode = forText and Enum.ApplyStrokeMode.Contextual or Enum.ApplyStrokeMode.Border
	s.Parent = obj
	return s
end

function Kit.gradient(obj, top, bottom, rotation)
	local g = Instance.new("UIGradient")
	g.Color = ColorSequence.new(top, bottom)
	g.Rotation = rotation or 90
	g.Parent = obj
	return g
end

function Kit.pad(obj, left, top, right, bottom)
	top = top or left; right = right or left; bottom = bottom or top
	local p = Instance.new("UIPadding")
	p.PaddingLeft, p.PaddingTop = UDim.new(0, left), UDim.new(0, top)
	p.PaddingRight, p.PaddingBottom = UDim.new(0, right), UDim.new(0, bottom)
	p.Parent = obj
	return p
end

function Kit.list(obj, p)
	p = p or {}
	local l = Instance.new("UIListLayout")
	l.FillDirection = p.horizontal and Enum.FillDirection.Horizontal or Enum.FillDirection.Vertical
	l.Padding = UDim.new(0, p.gap or 10)
	l.SortOrder = Enum.SortOrder.LayoutOrder
	l.HorizontalAlignment = Enum.HorizontalAlignment[p.alignX or "Center"]
	l.VerticalAlignment = Enum.VerticalAlignment[p.alignY or "Top"]
	if p.wraps then l.Wraps = true end
	l.Parent = obj
	return l
end

function Kit.grid(obj, p)
	p = p or {}
	local g = Instance.new("UIGridLayout")
	local cell = p.cell or { 120, 120 }
	local gap = p.gap or { 10, 10 }
	if type(gap) == "number" then gap = { gap, gap } end
	g.CellSize = UDim2.fromOffset(cell[1], cell[2])
	g.CellPadding = UDim2.fromOffset(gap[1], gap[2])
	g.SortOrder = Enum.SortOrder.LayoutOrder
	g.HorizontalAlignment = Enum.HorizontalAlignment[p.alignX or "Center"]
	g.VerticalAlignment = Enum.VerticalAlignment[p.alignY or "Top"]
	if p.columns then g.FillDirectionMaxCells = p.columns end
	g.Parent = obj
	return g
end

-- A plain invisible container.
function Kit.box(parent, p)
	p = p or {}
	local f = Instance.new("Frame")
	f.Name = p.name or "Box"
	f.BackgroundTransparency = 1
	f.BorderSizePixel = 0
	f.Size = U2(p.size, UDim2.fromScale(1, 1))
	f.Position = U2(p.pos, UDim2.new())
	f.AnchorPoint = V2(p.anchor, Vector2.zero)
	f.LayoutOrder = p.order or 0
	if p.clip then f.ClipsDescendants = true end
	f.Parent = parent
	return f
end

-- ---------------------------------------------------------------------------
-- Text: bubble lettering = bold font + thick dark outline.
-- ---------------------------------------------------------------------------
function Kit.text(parent, p)
	p = p or {}
	local size = p.textSize or 28
	local l = Instance.new("TextLabel")
	l.Name = p.name or "Label"
	l.BackgroundTransparency = 1
	l.BorderSizePixel = 0
	l.Size = U2(p.size, UDim2.fromScale(1, 1))
	l.Position = U2(p.pos, UDim2.new())
	l.AnchorPoint = V2(p.anchor, Vector2.zero)
	l.Font = p.font or Kit.Style.font
	l.Text = p.text or ""
	l.TextColor3 = C3(p.color, WHITE)
	l.TextSize = size
	l.TextXAlignment = Enum.TextXAlignment[p.alignX or "Center"]
	l.TextYAlignment = Enum.TextYAlignment[p.alignY or "Center"]
	l.TextWrapped = p.wrap or false
	l.RichText = p.rich or false
	l.LayoutOrder = p.order or 0
	l.ZIndex = p.z or 2
	if p.transparency then l.TextTransparency = p.transparency end
	if p.scaled then
		l.TextScaled = true
		local c = Instance.new("UITextSizeConstraint")
		c.MaxTextSize, c.MinTextSize = size, math.max(8, p.minTextSize or 10)
		c.Parent = l
	end
	local th = p.stroke
	if th == nil then th = math.clamp(math.floor(size / 11 + 0.5), 2, 5) end
	Kit.stroke(l, th, C3(p.strokeColor, Kit.Style.ink), true)
	l.Parent = parent
	return l
end

-- ---------------------------------------------------------------------------
-- Stud texture: ONE TextLabel of repeated squares per layer (light + shadow),
-- so a whole studded panel costs 3 instances instead of hundreds of frames.
-- ---------------------------------------------------------------------------
local studMetrics = {}
local STUD_FONT = Enum.Font.Code
local STUD_GLYPH = "\226\150\160 " -- U+25A0 BLACK SQUARE + space

local function measureStuds()
	if studMetrics.ready then return studMetrics end
	local big = Vector2.new(1e5, 1e5)
	local ok, w, h = pcall(function()
		local row = TextService:GetTextSize(string.rep(STUD_GLYPH, 20), 100, STUD_FONT, big)
		local col = TextService:GetTextSize(string.rep("\226\150\160\n", 19) .. "\226\150\160", 100, STUD_FONT, big)
		return row.X / 20, col.Y / 20
	end)
	if not ok or w <= 0 or h <= 0 then w, h = 94, 105 end
	studMetrics.pitchPerSize = w / 100   -- horizontal pitch for TextSize 1
	studMetrics.linePerSize = h / 100    -- natural line height for TextSize 1
	studMetrics.ready = true
	return studMetrics
end

function Kit.studs(parent, p)
	p = p or {}
	local m = measureStuds()
	local pitch = p.pitch or 26
	local textSize = math.max(8, math.floor(pitch / m.pitchPerSize + 0.5))
	local lineHeight = pitch / (textSize * m.linePerSize)
	-- Sizes given in scale are unknown here, so cover a generous area (the holder clips the rest).
	local w = p.width or 1400
	local h = p.height or 900
	local cols = math.clamp(math.ceil(w / pitch) + 2, 2, 140)
	local rows = math.clamp(math.ceil(h / pitch) + 2, 2, 90)
	local line = string.rep(STUD_GLYPH, cols)
	local text = string.rep(line .. "\n", rows - 1) .. line
	local inset = p.inset or 0

	local holder = Instance.new("Frame")
	holder.Name = "Studs"
	holder.BackgroundTransparency = 1
	holder.BorderSizePixel = 0
	holder.ClipsDescendants = true
	holder.Size = UDim2.new(1, -inset * 2, 1, -inset * 2)
	holder.Position = UDim2.fromOffset(inset, inset)
	holder.ZIndex = 0
	holder.Parent = parent

	local strength = p.strength or 1
	local function layer(name, color, transparency, dx, dy)
		local t = Instance.new("TextLabel")
		t.Name = name
		t.BackgroundTransparency = 1
		t.Size = UDim2.new(1, pitch * 2, 1, pitch * 2)
		t.Position = UDim2.fromOffset(-pitch * 0.32 + dx, -pitch * 0.3 + dy)
		t.Font = STUD_FONT
		t.TextSize = textSize
		t.LineHeight = lineHeight
		t.TextColor3 = color
		t.TextTransparency = transparency
		t.TextXAlignment = Enum.TextXAlignment.Left
		t.TextYAlignment = Enum.TextYAlignment.Top
		t.Text = text
		t.ZIndex = 0
		t.Parent = holder
	end
	local depth = math.max(1, math.floor(pitch / 13))
	layer("Shade", BLACK, 1 - 0.16 * strength, depth, depth)
	layer("Light", p.color and C3(p.color) or WHITE, 1 - 0.13 * strength, 0, 0)
	return holder
end

-- Diagonal light stripes across a surface (the "shine" on headers and buttons).
function Kit.shine(parent, p)
	p = p or {}
	local f = Instance.new("Frame")
	f.Name = "Shine"
	f.BackgroundColor3 = WHITE
	f.BorderSizePixel = 0
	f.Size = UDim2.fromScale(1, 1)
	f.ZIndex = 0
	local a = 1 - (p.strength or 0.16)
	local g = Instance.new("UIGradient")
	g.Rotation = p.rotation or 18
	g.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.08, 1),
		NumberSequenceKeypoint.new(0.081, a), NumberSequenceKeypoint.new(0.15, a),
		NumberSequenceKeypoint.new(0.151, 1), NumberSequenceKeypoint.new(0.19, 1),
		NumberSequenceKeypoint.new(0.191, a), NumberSequenceKeypoint.new(0.215, a),
		NumberSequenceKeypoint.new(0.216, 1), NumberSequenceKeypoint.new(0.62, 1),
		NumberSequenceKeypoint.new(0.621, a), NumberSequenceKeypoint.new(0.74, a),
		NumberSequenceKeypoint.new(0.741, 1), NumberSequenceKeypoint.new(0.78, 1),
		NumberSequenceKeypoint.new(0.781, a), NumberSequenceKeypoint.new(0.80, a),
		NumberSequenceKeypoint.new(0.801, 1), NumberSequenceKeypoint.new(1, 1),
	})
	g.Parent = f
	Kit.corner(f, p.corner)
	f.Parent = parent
	return f
end

-- ---------------------------------------------------------------------------
-- Panel: the themed surface everything else is made of.
--   theme, size, pos, anchor, name, order
--   corner (px), outline (px), studs (bool | pitch), shine (bool), gloss (bool),
--   lip (px darker strip along the bottom = 3D edge), rim (px bright inner edge)
-- ---------------------------------------------------------------------------
function Kit.panel(parent, p, class)
	p = p or {}
	local S = Kit.Style
	local th = Kit.theme(p.theme)
	local f = Instance.new(class or "Frame")
	f.Name = p.name or "Panel"
	f.BackgroundColor3 = WHITE
	f.BorderSizePixel = 0
	f.Size = U2(p.size, UDim2.fromOffset(200, 100))
	f.Position = U2(p.pos, UDim2.new())
	f.AnchorPoint = V2(p.anchor, Vector2.zero)
	f.LayoutOrder = p.order or 0
	if p.z then f.ZIndex = p.z end
	if p.transparency then f.BackgroundTransparency = p.transparency end
	if class == "TextButton" then
		f.Text = ""
		f.AutoButtonColor = false
	elseif class == "ImageButton" then
		f.AutoButtonColor = false
	end
	Kit.gradient(f, th.top, th.bottom, p.gradientRotation or 90)
	local corner = p.corner
	if corner == nil then corner = S.corner end
	Kit.corner(f, corner)
	-- A pill radius (999) is clamped to half the short side for the inner decorations.
	local round = corner >= 999
	do
		local sz = f.Size
		local short = math.min(sz.X.Scale == 0 and sz.X.Offset or 96, sz.Y.Scale == 0 and sz.Y.Offset or 96)
		corner = math.min(corner, math.floor(short / 2))
	end
	local outline = p.outline
	if outline == nil then outline = S.outline end
	Kit.stroke(f, outline, p.outlineColor and C3(p.outlineColor) or th.stroke or S.ink)
	f.Parent = parent

	local studs = p.studs
	if studs == nil then studs = S.studs end
	if studs and not round then
		local sz = f.Size
		Kit.studs(f, {
			pitch = type(studs) == "number" and studs or nil,
			strength = p.studStrength,
			inset = corner > 0 and math.ceil(corner * 0.3) or 0,
			width = p.studWidth or (sz.X.Scale == 0 and sz.X.Offset or nil),
			height = p.studHeight or (sz.Y.Scale == 0 and sz.Y.Offset or nil),
		})
	end
	local shine = p.shine
	if shine == nil then shine = false end
	if shine then Kit.shine(f, { corner = corner, strength = type(shine) == "number" and shine or nil }) end
	local gloss = p.gloss
	if gloss == nil then gloss = S.gloss and p.glossDefault end
	if gloss then
		local g = Instance.new("Frame")
		g.Name = "Gloss"
		g.BackgroundColor3 = WHITE
		g.BackgroundTransparency = 0.72
		g.BorderSizePixel = 0
		g.AnchorPoint = Vector2.new(0.5, 0)
		g.Position = UDim2.new(0.5, 0, 0, math.max(3, corner * 0.25))
		g.Size = UDim2.new(1, -math.max(10, corner), 0.36, 0)
		g.ZIndex = 0
		Kit.corner(g, math.max(0, corner - 4))
		g.Parent = f
	end
	if p.rim and p.rim > 0 then
		local r = Instance.new("Frame")
		r.Name = "Rim"
		r.BackgroundTransparency = 1
		r.Size = UDim2.new(1, -p.rim * 2, 1, -p.rim * 2)
		r.Position = UDim2.fromOffset(p.rim, p.rim)
		r.ZIndex = 0
		Kit.corner(r, math.max(0, corner - p.rim))
		local rs = Kit.stroke(r, p.rim, p.rimColor and C3(p.rimColor) or th.top:Lerp(WHITE, 0.45))
		rs.Transparency = p.rimTransparency or 0.15
		r.Parent = f
	end
	if p.lip and p.lip > 0 and not round then
		local lip = Instance.new("Frame")
		lip.Name = "Lip"
		lip.BackgroundColor3 = BLACK
		lip.BackgroundTransparency = 0.72
		lip.BorderSizePixel = 0
		lip.AnchorPoint = Vector2.new(0, 1)
		lip.Position = UDim2.fromScale(0, 1)
		lip.Size = UDim2.new(1, 0, 0, p.lip)
		lip.ZIndex = 0
		Kit.corner(lip, corner)
		lip.Parent = f
	end
	return f
end

-- Dark inset slot (item cells, list rows, text boxes).
function Kit.slot(parent, p)
	p = p or {}
	local q = table.clone(p)
	q.theme = p.theme or { top = rgb(16, 22, 26), bottom = rgb(24, 32, 38) }
	q.name = p.name or "Slot"
	q.outline = p.outline or 3
	if q.studs == nil then q.studs = false end
	local f = Kit.panel(parent, q)
	if p.transparency == nil then f.BackgroundTransparency = 0.25 end
	return f
end

-- ---------------------------------------------------------------------------
-- Icons: an asset id when you have art, an emoji when you do not.
-- ---------------------------------------------------------------------------
function Kit.icon(parent, p)
	p = p or {}
	local size = U2(p.size, UDim2.fromOffset(64, 64))
	local pos = U2(p.pos, UDim2.fromScale(0.5, 0.5))
	local anchor = V2(p.anchor, Vector2.new(0.5, 0.5))
	local inst
	if p.image then
		inst = Instance.new("ImageLabel")
		inst.Image = type(p.image) == "number" and ("rbxassetid://" .. p.image) or p.image
		inst.ScaleType = Enum.ScaleType.Fit
	else
		inst = Instance.new("TextLabel")
		inst.Text = p.emoji or "\226\173\144"
		inst.Font = Enum.Font.SourceSans
		inst.TextScaled = true
		inst.TextColor3 = WHITE
	end
	inst.Name = p.name or "Icon"
	inst.BackgroundTransparency = 1
	inst.BorderSizePixel = 0
	inst.Size, inst.Position, inst.AnchorPoint = size, pos, anchor
	inst.Rotation = p.rotation or 0
	inst.LayoutOrder = p.order or 0
	inst.ZIndex = p.z or 2
	inst:SetAttribute("IconSlot", p.hint or p.emoji or "icon")
	inst.Parent = parent
	return inst
end

-- Round player headshot. userId 1 is only a placeholder; set it per player.
function Kit.avatar(parent, p)
	p = p or {}
	local f = Kit.panel(parent, {
		name = p.name or "Avatar", theme = p.theme or "black", size = p.size or { 72, 72 },
		pos = p.pos, anchor = p.anchor, corner = p.corner or 999, outline = p.outline or 3,
		studs = false, order = p.order,
	})
	local img = Instance.new("ImageLabel")
	img.Name = "Headshot"
	img.BackgroundTransparency = 1
	img.Size = UDim2.fromScale(1, 1)
	img.Image = ("rbxthumb://type=AvatarHeadShot&id=%d&w=150&h=150"):format(p.userId or 1)
	Kit.corner(img, p.corner or 999)
	img.Parent = f
	return f
end

-- ---------------------------------------------------------------------------
-- Buttons
-- ---------------------------------------------------------------------------
function Kit.button(parent, p)
	p = p or {}
	local S = Kit.Style
	local q = table.clone(p)
	q.name = p.name or ((p.text and p.text:gsub("[^%w]", "") or "") .. "Button")
	q.theme = p.theme or "green"
	q.size = p.size or { 240, 72 }
	if q.shine == nil then q.shine = S.shine end
	if q.lip == nil then q.lip = p.lip or 7 end
	if q.gloss == nil then q.gloss = S.gloss end
	local b = Kit.panel(parent, q, "TextButton")
	b:SetAttribute("LurongButton", true)
	if p.action then b:SetAttribute("LurongAction", p.action) end
	local hasIcon = p.emoji or p.image
	if hasIcon then
		local h = (typeof(b.Size) == "UDim2" and b.Size.Y.Offset > 0) and b.Size.Y.Offset or 64
		local isz = p.iconSize or math.floor(h * 0.62)
		Kit.icon(b, { emoji = p.emoji, image = p.image, size = { isz, isz },
			pos = p.text and UDim2.new(0, math.floor(h * 0.5), 0.5, -(q.lip or 0) / 2) or UDim2.new(0.5, 0, 0.5, -(q.lip or 0) / 2) })
	end
	if p.text then
		local left = hasIcon and (b.Size.Y.Offset * 0.9) or 8
		Kit.text(b, {
			name = "Label", text = p.text, textSize = p.textSize or 34, color = p.textColor,
			font = p.font, stroke = p.stroke, strokeColor = p.strokeColor, scaled = true,
			size = UDim2.new(1, -(left + 8), 1, -(q.lip or 0) - 6), pos = UDim2.fromOffset(left, 2),
		})
	end
	return b
end

function Kit.closeButton(parent, p)
	p = p or {}
	local s = p.side or 56
	local b = Kit.panel(parent, {
		name = "Close", theme = p.theme or "red", size = { s, s },
		pos = p.pos or UDim2.new(1, -12, 0.5, 0), anchor = p.anchor or { 1, 0.5 },
		corner = p.corner, outline = p.outline or 4, studs = false, shine = false, lip = math.floor(s * 0.1),
		rim = 2, rimTransparency = 0.45, glossDefault = true,
	}, "TextButton")
	b:SetAttribute("LurongButton", true)
	b:SetAttribute("LurongAction", p.action or "close")
	Kit.text(b, { name = "X", text = "X", font = Enum.Font.GothamBlack, textSize = math.floor(s * 0.64),
		stroke = math.max(2, math.floor(s / 18)), size = UDim2.new(1, 0, 1, -math.floor(s * 0.1)) })
	return b
end

-- ---------------------------------------------------------------------------
-- Progress bar:  Kit.bar(parent, { value = 75, max = 100, text = "75K/100K" })
-- ---------------------------------------------------------------------------
function Kit.bar(parent, p)
	p = p or {}
	local S = Kit.Style
	local corner = p.corner
	if corner == nil then corner = S.corner end
	local track = Kit.panel(parent, {
		name = p.name or "Bar", theme = p.trackTheme or "black", size = p.size or { 420, 46 },
		pos = p.pos, anchor = p.anchor, corner = corner, outline = p.outline or 3, studs = false, order = p.order,
	})
	local pct = math.clamp((p.value or 0) / math.max(1, p.max or 100), 0, 1)
	local fill = Kit.panel(track, {
		name = "Fill", theme = p.theme or "green", size = UDim2.new(pct, 0, 1, 0), corner = corner,
		outline = 0, studs = false, shine = S.shine, gloss = S.gloss, lip = p.lip or 5,
	})
	track:SetAttribute("Value", p.value or 0)
	track:SetAttribute("Max", p.max or 100)
	if p.segments and p.segments > 1 then
		for i = 1, p.segments - 1 do
			local d = Instance.new("Frame")
			d.Name = "Divider"
			d.BackgroundColor3 = Kit.theme(p.trackTheme or "black").bottom
			d.BorderSizePixel = 0
			d.AnchorPoint = Vector2.new(0.5, 0)
			d.Position = UDim2.fromScale(i / p.segments, 0)
			d.Size = UDim2.new(0, p.dividerWidth or 5, 1, 0)
			d.ZIndex = 2
			d.Parent = track
		end
	end
	if p.text then
		Kit.text(track, { name = "Value", text = p.text, textSize = p.textSize or 26, scaled = true, z = 3,
			size = UDim2.new(1, -12, 1, -6), pos = UDim2.fromOffset(6, 2) })
	end
	return track, fill
end

-- ---------------------------------------------------------------------------
-- Scrolling list area
-- ---------------------------------------------------------------------------
function Kit.scroll(parent, p)
	p = p or {}
	local s = Instance.new("ScrollingFrame")
	s.Name = p.name or "Scroll"
	s.BackgroundTransparency = 1
	s.BorderSizePixel = 0
	s.Size = U2(p.size, UDim2.fromScale(1, 1))
	s.Position = U2(p.pos, UDim2.new())
	s.AnchorPoint = V2(p.anchor, Vector2.zero)
	s.ScrollBarThickness = p.barThickness or 10
	s.ScrollBarImageColor3 = C3(p.barColor, rgb(20, 24, 28))
	s.ScrollingDirection = p.horizontal and Enum.ScrollingDirection.X or Enum.ScrollingDirection.Y
	s.AutomaticCanvasSize = p.horizontal and Enum.AutomaticSize.X or Enum.AutomaticSize.Y
	s.CanvasSize = UDim2.new()
	s.VerticalScrollBarInset = Enum.ScrollBarInset.ScrollBar
	s.LayoutOrder = p.order or 0
	s.Parent = parent
	return s
end

-- ---------------------------------------------------------------------------
-- Window: studded header (icon, title, close) on top of a dark body.
--   Kit.window(screen, { name, title, emoji|image, theme, size = {w, h},
--                        headerHeight, overhang, bodyTheme, pos, anchor, visible })
--   returns { root, header, body, content, title, close }
-- ---------------------------------------------------------------------------
function Kit.window(parent, p)
	p = p or {}
	local S = Kit.Style
	local size = p.size or { 820, 560 }
	local w, h = size[1], size[2]
	local hh = p.headerHeight or 92
	local over = p.overhang or 0

	local root = Kit.box(parent, {
		name = p.name or ((p.title or "Window"):gsub("[^%w]", "") .. "Window"),
		size = { w + over * 2, h }, pos = p.pos or UDim2.fromScale(0.5, 0.5), anchor = p.anchor or { 0.5, 0.5 },
	})
	root:SetAttribute("LurongWindow", true)
	if p.visible == false then root.Visible = false end
	Kit.fit(root)

	local body = Kit.panel(root, {
		name = "Body", theme = p.bodyTheme or "dark", size = { w, h - hh + S.outline },
		pos = { over, hh - S.outline }, studs = p.bodyStuds, studStrength = p.bodyStudStrength or 0.55,
		gloss = false,
	})
	local header = Kit.panel(root, {
		name = "Header", theme = p.theme or "blue", size = { w + over * 2, hh }, pos = { 0, 0 },
		shine = p.shine == nil and S.shine or p.shine, rim = p.rim == nil and 3 or p.rim, z = 2,
	})

	local titleLeft = 26
	if p.emoji or p.image then
		local isz = p.iconSize or math.floor(hh * 0.92)
		Kit.icon(header, { emoji = p.emoji, image = p.image, size = { isz, isz },
			pos = UDim2.new(0, 16 + isz / 2, 0.5, 0), rotation = p.iconRotation })
		titleLeft = 16 + isz + 14
	end
	local closeSide = math.floor(hh * 0.66)
	local close = nil
	if p.close ~= false then
		close = Kit.closeButton(header, { side = closeSide, pos = UDim2.new(1, -math.floor(hh * 0.17), 0.5, 0) })
	end
	local centered = p.titleAlign == "Center"
	local title = Kit.text(header, {
		name = "Title", text = p.title or "Window", textSize = p.titleSize or math.floor(hh * 0.56),
		alignX = centered and "Center" or "Left", scaled = true,
		size = centered and UDim2.new(1, -(closeSide + 40) * 2, 1, -10) or UDim2.new(1, -(titleLeft + closeSide + 40), 1, -10),
		pos = centered and UDim2.fromOffset(closeSide + 40, 5) or UDim2.fromOffset(titleLeft, 5),
	})

	local content = Kit.box(body, { name = "Content" })
	local padding = p.padding or 18
	Kit.pad(content, padding)
	return { root = root, header = header, body = body, content = content, title = title, close = close }
end

-- ---------------------------------------------------------------------------
-- Tabs:  Kit.tabs(parent, { group = "Leaderboard", items = {"Cash","Wins"}, active = 1 })
-- Each tab button shows the page named after it (see Kit.page).
-- ---------------------------------------------------------------------------
function Kit.tabs(parent, p)
	p = p or {}
	local items = p.items or {}
	local holder = Kit.box(parent, { name = p.name or "Tabs", size = p.size or UDim2.new(1, 0, 0, 56), pos = p.pos, order = p.order })
	Kit.list(holder, { horizontal = not p.vertical, gap = p.gap or 8, alignX = "Left", alignY = "Center" })
	local buttons = {}
	local n = math.max(1, #items)
	local gap = p.gap or 8
	for i, item in ipairs(items) do
		local label = type(item) == "table" and item.text or item
		local theme = type(item) == "table" and item.theme or p.theme or "green"
		local b = Kit.button(holder, {
			name = label:gsub("[^%w]", "") .. "Tab", text = label, theme = theme, textSize = p.textSize or 26,
			size = p.tabSize or (p.vertical and UDim2.new(1, 0, 0, 64) or UDim2.new(1 / n, -math.ceil(gap * (n - 1) / n), 1, 0)),
			outline = p.outline or 3, lip = p.lip or 5, order = i, corner = p.corner,
			emoji = type(item) == "table" and item.emoji or nil,
		})
		b:SetAttribute("LurongAction", ("tab:%s:%s"):format(p.group or "Tabs", label))
		-- inactive tabs are covered by a grey "Dim" plate (skipped when every tab keeps its colour)
		if p.dimInactive ~= false then
			local dim = Instance.new("Frame")
			dim.Name = "Dim"
			dim.BackgroundColor3 = WHITE
			dim.BorderSizePixel = 0
			dim.Size = UDim2.fromScale(1, 1)
			dim.ZIndex = 1
			Kit.gradient(dim, rgb(101, 101, 101), rgb(56, 56, 56))
			Kit.corner(dim, p.corner or Kit.Style.corner)
			dim.Visible = i ~= (p.active or 1)
			dim.Parent = b
		end
		buttons[i] = b
	end
	return holder, buttons
end

-- A page shown by a tab of the same group / name.
function Kit.page(parent, p)
	p = p or {}
	local f = Kit.box(parent, { name = p.name or "Page", size = p.size, pos = p.pos })
	f:SetAttribute("LurongTabGroup", p.group or "Tabs")
	f.Visible = p.visible ~= false
	return f
end

-- ---------------------------------------------------------------------------
-- HUD pieces
-- ---------------------------------------------------------------------------
-- Square menu tile: big icon with a caption along the bottom.
function Kit.tile(parent, p)
	p = p or {}
	local side = p.side or 132
	local b = Kit.panel(parent, {
		name = p.name or ((p.text or "Tile"):gsub("[^%w]", "") .. "Tile"), theme = p.theme or "blue",
		size = p.size or { side, side }, pos = p.pos, anchor = p.anchor, corner = p.corner, outline = p.outline or 4,
		studs = p.studs, shine = p.shine, lip = p.lip or 0, order = p.order, rim = p.rim, glossDefault = true,
	}, "TextButton")
	b:SetAttribute("LurongButton", true)
	if p.action then b:SetAttribute("LurongAction", p.action) end
	Kit.icon(b, { emoji = p.emoji, image = p.image, size = UDim2.fromScale(0.66, 0.66), pos = UDim2.fromScale(0.5, 0.42) })
	if p.text then
		Kit.text(b, { name = "Caption", text = p.text, textSize = p.textSize or math.floor(side * 0.22), scaled = true, z = 3,
			size = UDim2.new(1, -6, 0.32, 0), pos = UDim2.new(0, 3, 0.7, 0) })
	end
	return b
end

-- Small round "!" / count badge pinned to a corner of its parent.
function Kit.badge(parent, p)
	p = p or {}
	local s = p.side or 40
	local b = Kit.panel(parent, {
		name = "Badge", theme = p.theme or "red", size = { s, s }, pos = p.pos or UDim2.new(1, 6, 0, -6),
		anchor = p.anchor or { 1, 0 }, corner = p.corner or 999, outline = 3, studs = false, z = 5,
	})
	Kit.text(b, { text = p.text or "!", textSize = math.floor(s * 0.66), z = 6 })
	return b
end

-- Currency read-out: icon + amount on a pill, optional "+" button.
function Kit.pill(parent, p)
	p = p or {}
	local size = p.size or { 380, 72 }
	local hgt = size[2]
	local f = Kit.panel(parent, {
		name = p.name or "Currency", theme = p.theme or "white", size = size, pos = p.pos, anchor = p.anchor,
		corner = p.corner or 999, outline = p.outline or 4, studs = false, order = p.order,
	})
	Kit.icon(f, { emoji = p.emoji or "\240\159\146\176", image = p.image, size = { hgt * 1.05, hgt * 1.05 }, pos = UDim2.new(0, hgt * 0.3, 0.5, 0) })
	Kit.text(f, { name = "Amount", text = p.text or "0", textSize = p.textSize or math.floor(hgt * 0.58), scaled = true,
		color = p.textColor, size = UDim2.new(1, -(hgt * 0.95 + (p.plus and hgt or 16)), 1, -8), pos = UDim2.fromOffset(hgt * 0.95, 4) })
	if p.plus then
		local b = Kit.button(f, { name = "Add", text = "+", theme = p.plusTheme or "blue", size = { hgt * 0.74, hgt * 0.74 },
			pos = UDim2.new(1, -hgt * 0.13, 0.5, 0), anchor = { 1, 0.5 }, corner = 999, outline = 3, lip = 0, textSize = math.floor(hgt * 0.6), shine = false })
		if p.plusAction then b:SetAttribute("LurongAction", p.plusAction) end
	end
	return f
end

-- Text entry:  local slot, textBox = Kit.input(parent, { placeholder = "Type here...", size = {760, 96} })
function Kit.input(parent, p)
	p = p or {}
	local slot = Kit.slot(parent, {
		name = p.name or "Input", theme = p.theme or { top = rgb(30, 30, 58), bottom = rgb(38, 36, 70) },
		size = p.size or { 600, 84 }, pos = p.pos, anchor = p.anchor, corner = p.corner, outline = p.outline,
		order = p.order, transparency = 0,
	})
	local box = Instance.new("TextBox")
	box.Name = "TextBox"
	box.BackgroundTransparency = 1
	box.Size = UDim2.new(1, -24, 1, -8)
	box.Position = UDim2.fromOffset(12, 4)
	box.Font = p.font or Kit.Style.font
	box.PlaceholderText = p.placeholder or "Type here..."
	box.PlaceholderColor3 = C3(p.placeholderColor, rgb(176, 150, 255))
	box.Text = ""
	box.TextColor3 = C3(p.color, WHITE)
	box.TextSize = p.textSize or 40
	box.TextScaled = true
	box.ClearTextOnFocus = false
	box.ZIndex = 2
	local c = Instance.new("UITextSizeConstraint")
	c.MaxTextSize = p.textSize or 40
	c.Parent = box
	box.Parent = slot
	return slot, box
end

-- The Robux symbol (renders in every built-in Roblox font).
Kit.ROBUX = "\238\128\130"

-- Prize wheel built from thin rotated bars (no images).
--   local holder, spinner = Kit.wheel(parent, { diameter = 460, segments = { { text = "First", theme = "red", emoji = "..." }, ... } })
--   Segment i is centred (i - 1) * 360 / n degrees clockwise from the top. Tween spinner.Rotation to spin it.
function Kit.wheel(parent, p)
	p = p or {}
	local d = p.diameter or 460
	local segs = p.segments or {}
	local n = math.max(2, #segs)
	local arc = 360 / n
	local holder = Kit.box(parent, { name = p.name or "Wheel", size = { d, d }, pos = p.pos, anchor = p.anchor, order = p.order })
	local spinner = Kit.box(holder, { name = "Spinner" })

	local function colorOf(i)
		local s = segs[((i - 1) % n) + 1] or {}
		local th = Kit.theme(s.theme or (i % 2 == 0 and "white" or "red"))
		return th.top:Lerp(th.bottom, 0.45)
	end
	local function segmentAt(deg)
		return math.floor(((deg + arc / 2) % 360) / arc) + 1
	end

	-- colour fill: bars through the centre, top half one segment, bottom half the opposite one
	local per = math.max(2, math.ceil(arc / 3 / 2) * 2)
	local step = arc / per
	local total = n * per
	local barW = math.ceil(d * math.pi * step / 360) + 2
	for k = 0, math.ceil(total / 2) - 1 do
		local deg = -arc / 2 + (k + 0.5) * step
		local bar = Instance.new("Frame")
		bar.Name = "Fill"
		bar.BackgroundColor3 = WHITE
		bar.BorderSizePixel = 0
		bar.AnchorPoint = Vector2.new(0.5, 0.5)
		bar.Position = UDim2.fromScale(0.5, 0.5)
		bar.Size = UDim2.new(0, barW, 1, 0)
		bar.Rotation = deg
		bar.ZIndex = 0
		local a, b = colorOf(segmentAt(deg)), colorOf(segmentAt(deg + 180))
		local g = Instance.new("UIGradient")
		g.Rotation = 90
		g.Color = ColorSequence.new({ ColorSequenceKeypoint.new(0, a), ColorSequenceKeypoint.new(0.4999, a),
			ColorSequenceKeypoint.new(0.5, b), ColorSequenceKeypoint.new(1, b) })
		g.Parent = bar
		bar.Parent = spinner
	end

	for i = 1, n do
		local s = segs[i] or {}
		-- divider on the leading edge of the segment
		local div = Kit.box(spinner, { name = "Divider" .. i })
		div.Rotation = (i - 1) * arc + arc / 2
		local line = Instance.new("Frame")
		line.BackgroundColor3 = Kit.Style.ink
		line.BorderSizePixel = 0
		line.AnchorPoint = Vector2.new(0.5, 0)
		line.Position = UDim2.fromScale(0.5, 0)
		line.Size = UDim2.new(0, p.dividerWidth or 4, 0.5, 0)
		line.Parent = div
		-- label + icon
		local spoke = Kit.box(spinner, { name = "Segment" .. i })
		spoke.Rotation = (i - 1) * arc
		spoke:SetAttribute("Prize", s.text or ("Prize " .. i))
		if s.text then
			local t = Kit.text(spoke, { name = "Label", text = s.text, textSize = p.textSize or math.floor(d * 0.058),
				size = { d * 0.22, d * 0.085 }, pos = UDim2.new(0.5, 0, 0, d * 0.145), anchor = { 0.5, 0.5 }, scaled = true })
			t.Rotation = 90
		end
		if s.emoji or s.image then
			Kit.icon(spoke, { emoji = s.emoji, image = s.image, size = { d * 0.105, d * 0.105 },
				pos = UDim2.new(0.5, 0, 0, d * 0.325) })
		end
	end

	local ring = Kit.box(holder, { name = "Ring" })
	Kit.corner(ring, 999)
	Kit.stroke(ring, p.ring or 8, Kit.Style.ink)
	local hub = Kit.panel(holder, { name = "Hub", theme = "gray", size = { d * 0.1, d * 0.1 }, pos = UDim2.fromScale(0.5, 0.5),
		anchor = { 0.5, 0.5 }, corner = 999, outline = 4, studs = false })
	hub.ZIndex = 3
	local pointer = Kit.text(holder, { name = "Pointer", text = "\226\150\188", font = Enum.Font.GothamBlack, textSize = math.floor(d * 0.1),
		size = { d * 0.14, d * 0.12 }, pos = UDim2.new(0.5, 0, 0, -d * 0.02), anchor = { 0.5, 0.5 }, z = 4 })
	pointer.Name = "Pointer"
	return holder, spinner
end

-- ---------------------------------------------------------------------------
-- Screen + scaling + behaviour
-- ---------------------------------------------------------------------------
local function currentScale()
	local cam = workspace.CurrentCamera
	local vp = cam and cam.ViewportSize or Kit.DESIGN
	if vp.X < 50 or vp.Y < 50 then vp = Kit.DESIGN end
	return math.clamp(math.min(vp.X / Kit.DESIGN.X, vp.Y / Kit.DESIGN.Y), 0.35, 2)
end

-- Give a top-level piece an AutoScale so its 1920x1080 design pixels fit the screen.
function Kit.fit(obj, factor)
	local s = obj:FindFirstChild("AutoScale") or Instance.new("UIScale")
	s.Name = "AutoScale"
	s:SetAttribute("Factor", factor or 1)
	s.Scale = currentScale() * (factor or 1)
	s.Parent = obj
	return s
end

-- A HUD cluster pinned to a screen edge/corner: Kit.dock(screen, { name, corner = "TopLeft", size, margin })
function Kit.dock(parent, p)
	p = p or {}
	local m = p.margin or { 24, 24 }
	m = { m[1] or 24, m[2] or 24 }
	local anchors = {
		TopLeft = { 0, 0 }, Top = { 0.5, 0 }, TopRight = { 1, 0 },
		Left = { 0, 0.5 }, Center = { 0.5, 0.5 }, Right = { 1, 0.5 },
		BottomLeft = { 0, 1 }, Bottom = { 0.5, 1 }, BottomRight = { 1, 1 },
	}
	local a = anchors[p.corner or "TopLeft"]
	assert(a, "Kit.dock: unknown corner " .. tostring(p.corner))
	-- a HUD piece never touches the screen edge it hangs from
	if a[1] ~= 0.5 then m[1] = math.max(m[1], 18) end
	if a[2] ~= 0.5 then m[2] = math.max(m[2], 14) end
	local f = Kit.box(parent, { name = p.name or "Dock", size = p.size or { 300, 300 }, anchor = a })
	local ox = (a[1] == 0 and m[1]) or (a[1] == 1 and -m[1]) or 0
	local oy = (a[2] == 0 and m[2]) or (a[2] == 1 and -m[2]) or 0
	f.Position = UDim2.new(a[1], ox, a[2], oy)
	local sc = Kit.fit(f)
	sc:SetAttribute("Margin", Vector2.new(ox, oy))
	f.Position = UDim2.new(a[1], ox * sc.Scale, a[2], oy * sc.Scale)
	return f
end

-- Create (or replace) a ScreenGui in StarterGui.
function Kit.screen(name, p)
	p = p or {}
	local old = StarterGui:FindFirstChild(name)
	if old then old:Destroy() end
	local sg = Instance.new("ScreenGui")
	sg.Name = name
	sg.ResetOnSpawn = false
	sg.IgnoreGuiInset = true
	sg.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	sg.DisplayOrder = p.displayOrder or 5
	sg:SetAttribute("LurongUI", Kit.VERSION)
	sg.Parent = p.parent or StarterGui
	return sg
end

Kit.CONTROLLER_SOURCE = [==[
-- LurongUI controller: keeps AutoScale fitted to the screen, animates buttons
-- and runs the LurongAction attributes (close / open:Name / toggle:Name / tab:Group:Page).
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local DESIGN = Vector2.new(1920, 1080)

local function fitScale()
	local cam = workspace.CurrentCamera
	local vp = cam and cam.ViewportSize or DESIGN
	return math.clamp(math.min(vp.X / DESIGN.X, vp.Y / DESIGN.Y), 0.35, 2)
end

local function rescale()
	local k = fitScale()
	for _, d in ipairs(gui:GetDescendants()) do
		if d:IsA("UIScale") and d.Name == "AutoScale" then
			d.Scale = k * (d:GetAttribute("Factor") or 1)
			local margin = d:GetAttribute("Margin")
			local host = d.Parent
			if margin and host and host:IsA("GuiObject") then
				host.Position = UDim2.new(host.Position.X.Scale, margin.X * d.Scale, host.Position.Y.Scale, margin.Y * d.Scale)
			end
		end
	end
end

local function findWindow(name)
	for _, d in ipairs(gui:GetDescendants()) do
		if d:GetAttribute("LurongWindow") and d.Name == name then return d end
	end
	return nil
end

local function setWindow(win, open)
	if not win then return end
	local scale = win:FindFirstChild("AutoScale")
	local target = fitScale() * ((scale and scale:GetAttribute("Factor")) or 1)
	if open then
		win.Visible = true
		if scale then
			scale.Scale = target * 0.86
			TweenService:Create(scale, TweenInfo.new(0.22, Enum.EasingStyle.Back, Enum.EasingDirection.Out), { Scale = target }):Play()
		end
	else
		if scale then
			local t = TweenService:Create(scale, TweenInfo.new(0.12, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { Scale = target * 0.86 })
			t.Completed:Once(function() win.Visible = false; scale.Scale = target end)
			t:Play()
		else
			win.Visible = false
		end
	end
end

local function selectTab(group, page)
	for _, d in ipairs(gui:GetDescendants()) do
		if d:GetAttribute("LurongTabGroup") == group then
			d.Visible = (d.Name == page)
		elseif d:IsA("GuiButton") then
			local g, pg = string.match(d:GetAttribute("LurongAction") or "", "^tab:([^:]+):(.+)$")
			if g == group then
				local dim = d:FindFirstChild("Dim")
				if dim then dim.Visible = (pg ~= page) end
			end
		end
	end
end

local function run(button)
	local action = button:GetAttribute("LurongAction")
	if not action then return end
	if action == "close" then
		local p = button.Parent
		while p and p ~= gui and not p:GetAttribute("LurongWindow") do p = p.Parent end
		if p and p ~= gui then setWindow(p, false) end
		return
	end
	local verb, a, b = string.match(action, "^(%a+):([^:]+):?(.*)$")
	if verb == "open" then
		setWindow(findWindow(a), true)
	elseif verb == "toggle" then
		local w = findWindow(a)
		if w then setWindow(w, not w.Visible) end
	elseif verb == "tab" then
		selectTab(a, b)
	end
end

local function hook(button)
	if not button:IsA("GuiButton") or not button:GetAttribute("LurongButton") then return end
	if button:GetAttribute("LurongHooked") then return end
	button:SetAttribute("LurongHooked", true)
	local press = button:FindFirstChild("PressScale") or Instance.new("UIScale")
	press.Name = "PressScale"
	press.Parent = button
	local function to(s, t)
		TweenService:Create(press, TweenInfo.new(t or 0.09, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), { Scale = s }):Play()
	end
	button.MouseEnter:Connect(function() to(1.05) end)
	button.MouseLeave:Connect(function() to(1) end)
	button.MouseButton1Down:Connect(function() to(0.93, 0.06) end)
	button.MouseButton1Up:Connect(function() to(1.05) end)
	button.Activated:Connect(function() run(button) end)
end

for _, d in ipairs(gui:GetDescendants()) do hook(d) end
gui.DescendantAdded:Connect(hook)

rescale()
local cam = workspace.CurrentCamera
if cam then cam:GetPropertyChangedSignal("ViewportSize"):Connect(rescale) end
]==]

-- Install the controller LocalScript into a ScreenGui (call once, at the end).
function Kit.controller(screen)
	local old = screen:FindFirstChild("LurongUIController")
	if old then old:Destroy() end
	local ls = Instance.new("LocalScript")
	ls.Name = "LurongUIController"
	ls.Source = Kit.CONTROLLER_SOURCE
	ls.Parent = screen
	return ls
end

-- Summarise what was built (the agent reads this back to check its work).
-- Looks over a finished screen for the usual layout defects. Returns a list of sentences.
function Kit.check(screen)
	local out, seen = {}, {}
	local function note(msg)
		if not seen[msg] and #out < 14 then seen[msg] = true; table.insert(out, msg) end
	end
	local vp = screen.AbsoluteSize
	if vp.X < 50 or vp.Y < 50 then return out end
	local function shownAll(o)
		local n = o
		while n and n ~= screen do
			if n:IsA("GuiObject") and not n.Visible then return false end
			n = n.Parent
		end
		return true
	end
	-- 1. top-level pieces: against the edge, off the screen, on top of each other
	local tops = {}
	for _, c in ipairs(screen:GetChildren()) do
		if c:IsA("GuiObject") and c.Visible then
			local p, sz = c.AbsolutePosition, c.AbsoluteSize
			local full = sz.X >= vp.X * 0.9 and sz.Y >= vp.Y * 0.9
			if not full and sz.X > 4 and sz.Y > 4 then
				table.insert(tops, c)
				if p.X < -2 or p.Y < -2 or p.X + sz.X > vp.X + 2 or p.Y + sz.Y > vp.Y + 2 then
					note(("%s reaches outside the screen (%dx%d at %d,%d on a %dx%d screen): make it smaller or move it in."):format(c.Name, sz.X, sz.Y, p.X, p.Y, vp.X, vp.Y))
				elseif p.X < 3 or p.Y < 3 or p.X + sz.X > vp.X - 3 or p.Y + sz.Y > vp.Y - 3 then
					note(("%s touches the screen edge: put it in a Kit.dock with a margin."):format(c.Name))
				end
			end
		end
	end
	for i = 1, #tops do
		for j = i + 1, #tops do
			local A, B = tops[i], tops[j]
			local ap, as, bp, bs = A.AbsolutePosition, A.AbsoluteSize, B.AbsolutePosition, B.AbsoluteSize
			local w = math.min(ap.X + as.X, bp.X + bs.X) - math.max(ap.X, bp.X)
			local h = math.min(ap.Y + as.Y, bp.Y + bs.Y) - math.max(ap.Y, bp.Y)
			if w > 0 and h > 0 and w * h > 0.15 * math.min(as.X * as.Y, bs.X * bs.Y) then
				note(("%s and %s overlap: move one of them or make it smaller."):format(A.Name, B.Name))
			end
		end
	end
	-- 2. panels: square ones mixed with rounded ones; neighbours of the same kind with different sizes
	local square, rounded, firstSquare = 0, 0, nil
	for _, d in ipairs(screen:GetDescendants()) do
		if (d:IsA("Frame") or d:IsA("TextButton") or d:IsA("ImageButton")) and d:FindFirstChildOfClass("UIStroke") and shownAll(d)
			and d.AbsoluteSize.X >= 40 and d.AbsoluteSize.Y >= 40 and d.BackgroundTransparency < 1 then
			if d:FindFirstChildOfClass("UICorner") then rounded += 1 else square += 1; firstSquare = firstSquare or d end
		end
		local layout = d:IsA("GuiObject") and (d:FindFirstChildOfClass("UIListLayout"))
		if layout and shownAll(d) then
			local horizontal = layout.FillDirection == Enum.FillDirection.Horizontal
			local lo, hi, n = math.huge, 0, 0
			for _, k in ipairs(d:GetChildren()) do
				if k:IsA("GuiButton") and k.Visible and k:GetAttribute("LurongButton") then
					local v = horizontal and k.AbsoluteSize.Y or k.AbsoluteSize.X
					lo, hi, n = math.min(lo, v), math.max(hi, v), n + 1
				end
			end
			if n >= 2 and hi > lo * 1.12 then note(("The buttons in %s have different sizes (%d to %d px): give them one size."):format(d.Name, lo, hi)) end
			if n >= 2 and layout.Padding.Offset < 6 and layout.Padding.Scale == 0 then note(("The buttons in %s have no gap between them: use a gap of 10 or more."):format(d.Name)) end
		end
	end
	if square >= 1 and rounded >= 2 and square <= rounded then
		note(("Square and rounded panels are mixed (%d square, %d rounded; e.g. %s is square): do not pass corner = 0 to single pieces, let them all follow the style."):format(square, rounded, firstSquare.Name))
	elseif rounded >= 1 and square >= 2 and rounded < square then
		note(("Square and rounded panels are mixed (%d square, %d rounded): give them one shape with Kit.setStyle instead of per-piece corners."):format(square, rounded))
	end
	-- 3. text: cut off, or tiny inside a big box
	for _, d in ipairs(screen:GetDescendants()) do
		if (d:IsA("TextLabel") or d:IsA("TextButton")) and d.Text ~= "" and shownAll(d) and d.TextTransparency < 1 then
			local sz, tb = d.AbsoluteSize, d.TextBounds
			local label = (d.Text:gsub("%s+", " ")):sub(1, 24)
			if sz.X > 8 and sz.Y > 8 and tb.X > 0 then
				if not d.TextScaled and not d.TextWrapped and tb.X > sz.X + 4 then
					note(('The text "%s" in %s is wider than its box (%d px of text in %d px): widen the box, shorten the text or use scaled = true.'):format(label, d.Parent.Name, tb.X, sz.X))
				elseif not d.TextScaled and tb.Y > sz.Y + 4 then
					note(('The text "%s" in %s is taller than its box: make the box taller or the text smaller.'):format(label, d.Parent.Name))
				end
				local host = d.Parent
				if host and host:IsA("GuiObject") and host:FindFirstChildOfClass("UIStroke") and host.BackgroundTransparency < 1 then
					local hs = host.AbsoluteSize
					local lines = math.max(1, #d.Text:split("\n"))
					local alone = true
					for _, k in ipairs(host:GetChildren()) do
						if k ~= d and (k:IsA("TextLabel") or k:IsA("ImageLabel")) and k.Name ~= "Studs" and k.Name ~= "Shine" and k.AbsoluteSize.Y > hs.Y * 0.3 then alone = false end
					end
					if alone and lines == 1 and hs.Y >= 36 and hs.Y <= 220 and tb.Y < hs.Y * 0.36 and tb.X < hs.X * 0.62 then
						note(('The text "%s" is small for its %dx%d panel %s (text is %d px tall): raise textSize to about %d, or shrink the panel to fit the text.'):format(label, hs.X, hs.Y, host.Name, tb.Y, math.floor(hs.Y * 0.56 / math.max(0.35, screen.AbsoluteSize.Y / 1080))))
					end
				end
			end
		end
	end
	return out
end

function Kit.report(screen)
	local counts, total = {}, 0
	for _, d in ipairs(screen:GetDescendants()) do
		counts[d.ClassName] = (counts[d.ClassName] or 0) + 1
		total += 1
	end
	local parts = {}
	for cls, n in pairs(counts) do table.insert(parts, cls .. "=" .. n) end
	table.sort(parts)
	local tops = {}
	for _, c in ipairs(screen:GetChildren()) do
		if c:IsA("GuiObject") then
			table.insert(tops, ("%s[%dx%d @%d,%d%s]"):format(c.Name, c.AbsoluteSize.X, c.AbsoluteSize.Y,
				c.AbsolutePosition.X, c.AbsolutePosition.Y, c.Visible and "" or " hidden"))
		end
	end
	local text = ("BUILT %s: %d instances (%s)\nTOP LEVEL: %s"):format(screen:GetFullName(), total, table.concat(parts, ", "), table.concat(tops, "; "))
	local ok, found = pcall(Kit.check, screen)
	if ok and #found > 0 then
		text ..= "\n" .. #found .. " layout defect(s) found - fix every one and rebuild before answering:"
		for _, line in ipairs(found) do text ..= "\nCHECK: " .. line end
	elseif ok then
		text ..= "\nLayout check: no defects found."
	end
	return text
end

return Kit
