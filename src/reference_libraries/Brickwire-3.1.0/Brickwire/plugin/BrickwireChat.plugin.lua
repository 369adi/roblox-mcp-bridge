--!nonstrict
--[[
	Brickwire AI — Roblox Studio plugin (v2)
	Studio ⇄ Brickwire bridge (127.0.0.1) ⇄ browser extension ⇄ AI web chat.
	Installed as %LOCALAPPDATA%\Roblox\Plugins\BrickwireChat.rbxmx by install.bat / start.bat / the Pro app.
	Open: Plugins tab → Brickwire → AI Chat. Errors are printed to Output as "[Brickwire] …".
]]

local VERSION = "2.0.0"
local HttpService = game:GetService("HttpService")
local StudioService = game:GetService("StudioService")
local Selection = game:GetService("Selection")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")

-- the toolbar button is created FIRST, so it always shows even if something below fails
local toolbar = plugin:CreateToolbar("Brickwire")
local toggleButton = toolbar:CreateButton("BrickwireAIChat", "Brickwire AI — talk to your AI chat from Studio", "rbxasset://textures/ui/Settings/Help/AdvancedIcon.png", "AI Chat")
toggleButton.ClickableWhenViewportHidden = true
local widget = plugin:CreateDockWidgetPluginGui("BrickwireAIChatV2", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, true, false, 400, 680, 340, 460))
widget.Title = "Brickwire AI"
toggleButton.Click:Connect(function() widget.Enabled = not widget.Enabled end)
widget:GetPropertyChangedSignal("Enabled"):Connect(function() toggleButton:SetActive(widget.Enabled) end)
toggleButton:SetActive(widget.Enabled)

local function main()
	local DEFAULT_PORT = 47821
	local MAX_IMAGE_BYTES = 6 * 1024 * 1024
	local MAX_IMAGES = 4
	local MAX_FILES = 6 -- 3.0: any file (sound, model, script, json…) — the AI gets it as a file it can put into Studio
	local FILE_TYPES = { "png", "jpg", "jpeg", "gif", "webp", "bmp", "tga", "mp3", "ogg", "wav", "flac", "mp4", "mov", "fbx", "glb", "gltf", "obj", "mtl", "rbxm", "rbxmx", "lua", "luau", "txt", "json", "csv", "md", "xml", "svg", "zip", "pdf" }
	local port = DEFAULT_PORT
	pcall(function() port = tonumber(plugin:GetSetting("bw_port")) or DEFAULT_PORT end)

	-- ── palette: graphite + champagne gold
	local function hex(h) return Color3.fromHex(h) end
	local C = {
		bg = hex("#0B0B0E"), surface = hex("#121217"), raised = hex("#1A1A21"), hover = hex("#22222A"),
		line = hex("#FFFFFF"), text = hex("#F3F1EC"), dim = hex("#9A97A1"), faint = hex("#605E68"),
		gold = hex("#D8B878"), goldDeep = hex("#B08F55"), goldTint = hex("#1F1B13"),
		good = hex("#7BC99A"), bad = hex("#E8806F"), warn = hex("#E2B866"), ink = hex("#141109"),
	}
	local function face(family, weight)
		local ok, f = pcall(Font.new, family, weight)
		if ok and f then return f end
		return Font.fromEnum(Enum.Font.Gotham)
	end
	local GOTHAM = "rbxasset://fonts/families/GothamSSm.json"
	local F = {
		body = face(GOTHAM, Enum.FontWeight.Regular), med = face(GOTHAM, Enum.FontWeight.Medium),
		bold = face(GOTHAM, Enum.FontWeight.Bold), display = face("rbxasset://fonts/families/Montserrat.json", Enum.FontWeight.SemiBold),
		mono = face("rbxasset://fonts/families/RobotoMono.json", Enum.FontWeight.Regular),
	}

	local function new(class, props, children)
		local inst = Instance.new(class)
		for k, v in props do
			if k ~= "Parent" then inst[k] = v end
		end
		for _, c in children or {} do c.Parent = inst end
		if props.Parent then inst.Parent = props.Parent end
		return inst
	end
	local function corner(r) return new("UICorner", { CornerRadius = UDim.new(0, r) }) end
	local function stroke(t, color) return new("UIStroke", { Color = color or C.line, Transparency = t, ApplyStrokeMode = Enum.ApplyStrokeMode.Border }) end
	local function padding(t, r, b, l)
		return new("UIPadding", { PaddingTop = UDim.new(0, t), PaddingRight = UDim.new(0, r or t), PaddingBottom = UDim.new(0, b or t), PaddingLeft = UDim.new(0, l or r or t) })
	end
	local function list(gap, dir, halign)
		return new("UIListLayout", { Padding = UDim.new(0, gap), FillDirection = dir or Enum.FillDirection.Vertical, SortOrder = Enum.SortOrder.LayoutOrder, HorizontalAlignment = halign or Enum.HorizontalAlignment.Left, VerticalAlignment = Enum.VerticalAlignment.Center })
	end
	local function tween(inst, props, t) TweenService:Create(inst, TweenInfo.new(t or 0.14, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), props):Play() end
	local function label(props)
		props.BackgroundTransparency = 1
		props.FontFace = props.FontFace or F.body
		props.TextColor3 = props.TextColor3 or C.text
		props.TextXAlignment = props.TextXAlignment or Enum.TextXAlignment.Left
		return new("TextLabel", props)
	end
	local function caps(s) return string.upper(s):gsub("(.)", "%1\u{200A}"):gsub("\u{200A}$", "") end -- hair-space tracking

	-- a quiet text button: dim → bright on hover
	local function ghostButton(parent, text, props)
		local b = new("TextButton", {
			Text = text, FontFace = F.med, TextSize = 11, TextColor3 = C.dim, BackgroundColor3 = C.hover, BackgroundTransparency = 1,
			AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.fromOffset(0, 26), AutoButtonColor = false, Parent = parent,
		}, { corner(7), padding(0, 9, 0, 9) })
		for k, v in props or {} do b[k] = v end
		b.MouseEnter:Connect(function() tween(b, { TextColor3 = C.text, BackgroundTransparency = 0 }) end)
		b.MouseLeave:Connect(function() tween(b, { TextColor3 = b:GetAttribute("On") and C.gold or C.dim, BackgroundTransparency = 1 }) end)
		return b
	end

	-- ── root
	local root = new("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = C.bg, BorderSizePixel = 0, Parent = widget })

	-- header
	local header = new("Frame", { Size = UDim2.new(1, 0, 0, 58), BackgroundColor3 = C.bg, BorderSizePixel = 0, Parent = root }, { padding(12, 12, 10, 16) })
	label({ Text = caps("Brickwire"), FontFace = F.display, TextSize = 13, TextColor3 = C.gold, Size = UDim2.new(1, -150, 0, 16), Parent = header })
	local statusText = label({ Text = "Connecting…", FontFace = F.body, TextSize = 11, TextColor3 = C.dim, RichText = true, Size = UDim2.new(1, -150, 0, 14), Position = UDim2.fromOffset(0, 21), TextTruncate = Enum.TextTruncate.AtEnd, Parent = header })
	local headerActions = new("Frame", { BackgroundTransparency = 1, AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0), Size = UDim2.fromOffset(150, 26), Parent = header }, { list(2, Enum.FillDirection.Horizontal, Enum.HorizontalAlignment.Right) })
	local btnPause = ghostButton(headerActions, "PAUSE", { LayoutOrder = 1 })
	local btnStop = ghostButton(headerActions, "STOP", { LayoutOrder = 2 })
	local btnMenu = ghostButton(headerActions, "•••", { LayoutOrder = 3 })
	new("Frame", { Size = UDim2.new(1, 0, 0, 1), Position = UDim2.new(0, 0, 0, 58), BackgroundColor3 = C.gold, BorderSizePixel = 0, Parent = root }, {
		new("UIGradient", { Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 0.55), NumberSequenceKeypoint.new(0.5, 0.85), NumberSequenceKeypoint.new(1, 1) }) }),
	})

	-- menu (clear / port)
	local menu = new("Frame", { Visible = false, ZIndex = 20, AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -12, 0, 52), Size = UDim2.fromOffset(210, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = C.raised, Parent = root }, { corner(10), stroke(0.9), padding(6), list(2) })
	local function menuItem(text, order)
		local b = new("TextButton", { Text = text, FontFace = F.body, TextSize = 13, TextColor3 = C.text, TextXAlignment = Enum.TextXAlignment.Left, BackgroundColor3 = C.hover, BackgroundTransparency = 1, AutoButtonColor = false, Size = UDim2.new(1, 0, 0, 30), ZIndex = 21, LayoutOrder = order, Parent = menu }, { corner(6), padding(0, 10, 0, 10) })
		b.MouseEnter:Connect(function() b.BackgroundTransparency = 0 end)
		b.MouseLeave:Connect(function() b.BackgroundTransparency = 1 end)
		return b
	end
	local miClear = menuItem("Clear conversation", 1)
	local miMcp = menuItem("MCP connections", 4)
	local miTasks = menuItem("Tasks & verification", 5)
	local miSkills = menuItem("Skills & templates", 6)
	local miWorkspace = menuItem("Project workspace", 7)
	local miProgress = menuItem("Live task progress (3.0)", 8)
	local miDiag = menuItem("Send diagnostics to Brickwire", 9)
	local miCancelRun = menuItem("Cancel Brickwire 3.0 run", 10)
	local portRow = new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 30), ZIndex = 21, LayoutOrder = 2, Parent = menu }, { padding(0, 10, 0, 10) })
	label({ Text = "Bridge port", TextSize = 13, TextColor3 = C.dim, Size = UDim2.new(0.5, 0, 1, 0), ZIndex = 21, Parent = portRow })
	local portBox = new("TextBox", { Text = tostring(port), FontFace = F.mono, TextSize = 12, TextColor3 = C.text, BackgroundColor3 = C.bg, ClearTextOnFocus = false, AnchorPoint = Vector2.new(1, 0.5), Position = UDim2.new(1, 0, 0.5, 0), Size = UDim2.fromOffset(70, 22), ZIndex = 21, Parent = portRow }, { corner(5), stroke(0.88) })
	label({ Text = "Brickwire AI v" .. VERSION, TextSize = 11, TextColor3 = C.faint, Size = UDim2.new(1, 0, 0, 22), ZIndex = 21, LayoutOrder = 3, Parent = menu })
	btnMenu.MouseButton1Click:Connect(function() menu.Visible = not menu.Visible end)

	-- conversation
	local COMPOSER_H = 136
	local scroller = new("ScrollingFrame", {
		Position = UDim2.fromOffset(0, 59), Size = UDim2.new(1, 0, 1, -(59 + COMPOSER_H)), BackgroundTransparency = 1, BorderSizePixel = 0,
		ScrollBarThickness = 3, ScrollBarImageColor3 = C.faint, CanvasSize = UDim2.new(), AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollingDirection = Enum.ScrollingDirection.Y, Parent = root,
	}, { list(14), padding(18, 16, 18, 16) })
	local order = 0
	local function nextOrder() order += 1 return order end
	local stick = true
	scroller:GetPropertyChangedSignal("CanvasPosition"):Connect(function()
		stick = scroller.CanvasPosition.Y >= scroller.AbsoluteCanvasSize.Y - scroller.AbsoluteWindowSize.Y - 48
	end)
	local function toBottom()
		if stick then task.defer(function() scroller.CanvasPosition = Vector2.new(0, scroller.AbsoluteCanvasSize.Y) end) end
	end
	local function selectable(parent, text, size, color, fontFace)
		return new("TextBox", {
			Text = text, FontFace = fontFace or F.body, TextSize = size, TextColor3 = color or C.text, TextWrapped = true, TextEditable = false, ClearTextOnFocus = false,
			MultiLine = true, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, BackgroundTransparency = 1,
			Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LineHeight = 1.18, Parent = parent,
		})
	end

	-- empty state
	local TEMPLATES = {
		{ "Build an environment", "Build a small village with three houses, a well and stone paths around the spawn" },
		{ "Design a shop", "Make a shop UI with six items, coin prices and a working buy button" },
		{ "Fix my errors", "Read the Output errors, find the broken scripts and fix them" },
		{ "Add visual effects", "Add a magic portal effect to the selected part" },
		{ "Cinematic intro", "Make a cinematic intro camera for this map" },
		{ "Audit the game", "Audit this game: lag, unsafe remotes, DataStore without pcall, mobile UI problems" },
	}
	local composerBox
	local empty = new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = 0, Parent = scroller }, { list(0) })
	label({ Text = caps("Brickwire AI"), FontFace = F.med, TextSize = 10, TextColor3 = C.gold, Size = UDim2.new(1, 0, 0, 14), LayoutOrder = 1, Parent = empty })
	new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 10), LayoutOrder = 2, Parent = empty })
	label({ Text = "What are we building today?", FontFace = F.display, TextSize = 22, TextWrapped = true, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = 3, Parent = empty })
	new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 8), LayoutOrder = 4, Parent = empty })
	label({ Text = "Describe it in your own words. Your AI chat answers in the browser and builds right here — every step appears below.", TextSize = 13, TextColor3 = C.dim, TextWrapped = true, LineHeight = 1.2, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = 5, Parent = empty })
	new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 22), LayoutOrder = 6, Parent = empty })
	local tlist = new("Frame", { BackgroundColor3 = C.surface, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = 7, Parent = empty }, { corner(12), stroke(0.93), list(0) })
	for i, t in TEMPLATES do
		local row = new("TextButton", { Text = "", AutoButtonColor = false, BackgroundColor3 = C.hover, BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 42), LayoutOrder = i, Parent = tlist }, { corner(12) })
		label({ Text = t[1], FontFace = F.med, TextSize = 13, Position = UDim2.fromOffset(16, 0), Size = UDim2.new(1, -48, 1, 0), Parent = row })
		local arrow = label({ Text = "→", FontFace = F.med, TextSize = 14, TextColor3 = C.faint, TextXAlignment = Enum.TextXAlignment.Right, AnchorPoint = Vector2.new(1, 0), Position = UDim2.new(1, -16, 0, 0), Size = UDim2.fromOffset(20, 42), Parent = row })
		if i < #TEMPLATES then new("Frame", { BackgroundColor3 = C.line, BackgroundTransparency = 0.94, BorderSizePixel = 0, Size = UDim2.new(1, -32, 0, 1), Position = UDim2.new(0, 16, 1, -1), Parent = row }) end
		row.MouseEnter:Connect(function() tween(row, { BackgroundTransparency = 0.4 }) tween(arrow, { TextColor3 = C.gold }) end)
		row.MouseLeave:Connect(function() tween(row, { BackgroundTransparency = 1 }) tween(arrow, { TextColor3 = C.faint }) end)
		row.MouseButton1Click:Connect(function()
			composerBox.Text = t[2]
			composerBox:CaptureFocus()
		end)
	end

	-- message blocks
	local function userMessage(text, meta)
		local row = new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = nextOrder(), Parent = scroller })
		local b = new("Frame", { AnchorPoint = Vector2.new(1, 0), Position = UDim2.fromScale(1, 0), Size = UDim2.new(0.84, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = C.goldTint, Parent = row }, { corner(14), stroke(0.78, C.gold), padding(11, 14, 11, 14), list(6) })
		selectable(b, text, 14, C.text).LayoutOrder = 1
		if meta and meta ~= "" then label({ Text = meta, TextSize = 11, TextColor3 = C.goldDeep, Size = UDim2.new(1, 0, 0, 14), LayoutOrder = 2, Parent = b }) end
		toBottom()
	end
	local function aiMessage(provider, text)
		local holder = new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = nextOrder(), Parent = scroller }, { list(6) })
		label({ Text = caps("Brickwire AI") .. (provider ~= "" and ("  ·  " .. provider) or ""), FontFace = F.med, TextSize = 10, TextColor3 = C.gold, Size = UDim2.new(1, 0, 0, 14), LayoutOrder = 1, Parent = holder })
		local body = selectable(holder, text, 14, C.text)
		body.LayoutOrder = 2
		toBottom()
		return body
	end
	local STATE_COLOR = { done = C.good, error = C.bad, wait = C.warn, info = C.faint }
	local function stepRow(text, state)
		local row = new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = nextOrder(), Parent = scroller })
		local dot = new("Frame", { Size = UDim2.fromOffset(6, 6), Position = UDim2.fromOffset(4, 5), BackgroundColor3 = STATE_COLOR[state] or C.faint, BorderSizePixel = 0, Parent = row }, { corner(3) })
		local l = label({ Text = text, TextSize = 12, TextColor3 = state == "error" and C.bad or C.dim, TextWrapped = true, Position = UDim2.fromOffset(20, 0), Size = UDim2.new(1, -20, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Parent = row })
		toBottom()
		return { row = row, dot = dot, label = l }
	end
	local function setStep(s, text, state)
		s.label.Text = text
		s.label.TextColor3 = state == "error" and C.bad or C.dim
		tween(s.dot, { BackgroundColor3 = STATE_COLOR[state] or C.faint })
	end
	local function card(title, text, color)
		local c = new("Frame", { BackgroundColor3 = C.surface, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, LayoutOrder = nextOrder(), Parent = scroller }, { corner(12), stroke(0.92), padding(12, 14, 12, 18) })
		new("Frame", { Size = UDim2.new(0, 2, 1, -16), Position = UDim2.new(0, -10, 0, 8), BackgroundColor3 = color, BorderSizePixel = 0, Parent = c })
		local inner = new("Frame", { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Parent = c }, { list(4) })
		label({ Text = caps(title), FontFace = F.med, TextSize = 10, TextColor3 = color, Size = UDim2.new(1, 0, 0, 14), LayoutOrder = 1, Parent = inner })
		if text and text ~= "" then selectable(inner, text, 13, C.text).LayoutOrder = 2 end
		toBottom()
	end

	-- composer
	local composer = new("Frame", { BackgroundTransparency = 1, AnchorPoint = Vector2.new(0, 1), Position = UDim2.fromScale(0, 1), Size = UDim2.new(1, 0, 0, COMPOSER_H), Parent = root }, { padding(6, 12, 10, 12) })
	local cardC = new("Frame", { BackgroundColor3 = C.raised, Size = UDim2.new(1, 0, 1, -18), Parent = composer }, { corner(14) })
	local cardStroke = stroke(0.9)
	cardStroke.Parent = cardC
	local chips = new("Frame", { BackgroundTransparency = 1, Position = UDim2.fromOffset(12, 8), Size = UDim2.new(1, -24, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, Parent = cardC }, { list(6, Enum.FillDirection.Horizontal) })
	chips:FindFirstChildOfClass("UIListLayout").Wraps = true
	composerBox = new("TextBox", {
		Text = "", PlaceholderText = "Describe what to build, script or fix…", PlaceholderColor3 = C.faint, FontFace = F.body, TextSize = 14, TextColor3 = C.text,
		MultiLine = true, ClearTextOnFocus = false, TextWrapped = true, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top,
		BackgroundTransparency = 1, Position = UDim2.fromOffset(14, 12), Size = UDim2.new(1, -28, 1, -54), ClipsDescendants = true, Parent = cardC,
	})
	composerBox.Focused:Connect(function() tween(cardStroke, { Transparency = 0.55, Color = C.gold }) end)
	composerBox.FocusLost:Connect(function() tween(cardStroke, { Transparency = 0.9, Color = C.line }) end)
	local tools = new("Frame", { BackgroundTransparency = 1, AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 6, 1, -6), Size = UDim2.new(1, -60, 0, 30), Parent = cardC }, { list(2, Enum.FillDirection.Horizontal) })
	local btnImage = ghostButton(tools, "+  File", { TextSize = 12, Size = UDim2.fromOffset(0, 28) })
	local btnSel = ghostButton(tools, "◎  Selection", { TextSize = 12, Size = UDim2.fromOffset(0, 28) })
	local btnSend = new("TextButton", { Text = "↑", FontFace = F.bold, TextSize = 17, TextColor3 = C.ink, BackgroundColor3 = C.gold, AutoButtonColor = false, AnchorPoint = Vector2.new(1, 1), Position = UDim2.new(1, -8, 1, -8), Size = UDim2.fromOffset(32, 32), Parent = cardC }, { corner(16) })
	btnSend.MouseEnter:Connect(function() tween(btnSend, { BackgroundColor3 = C.text }) end)
	btnSend.MouseLeave:Connect(function() tween(btnSend, { BackgroundColor3 = C.gold }) end)
	local hint = label({ Text = "Enter to send  ·  Shift+Enter for a new line", TextSize = 11, TextColor3 = C.faint, AnchorPoint = Vector2.new(0, 1), Position = UDim2.new(0, 4, 1, 0), Size = UDim2.new(1, -8, 0, 14), TextTruncate = Enum.TextTruncate.AtEnd, Parent = composer })

	local function setHint(text, color)
		hint.Text = text
		hint.TextColor3 = color or C.faint
	end

	-- ── HTTP
	local function base() return "http://127.0.0.1:" .. tostring(port) end
	local function request(method, path, body)
		local ok, res = pcall(function()
			return HttpService:RequestAsync({ Url = base() .. path, Method = method, Headers = { ["Content-Type"] = "application/json" }, Body = body ~= nil and HttpService:JSONEncode(body) or nil })
		end)
		if not ok then return false, tostring(res) end
		local data
		pcall(function() data = HttpService:JSONDecode(res.Body) end)
		if not res.Success then return false, (data and data.error) or ("HTTP " .. tostring(res.StatusCode)) end
		return true, data
	end

	-- base64 (buffer based)
	local B64 = buffer.fromstring("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
	local function base64(s)
		local n = #s
		local src = buffer.fromstring(s)
		local out = buffer.create(math.ceil(n / 3) * 4)
		local i, o = 0, 0
		while i + 2 < n do
			local v = buffer.readu8(src, i) * 65536 + buffer.readu8(src, i + 1) * 256 + buffer.readu8(src, i + 2)
			buffer.writeu8(out, o, buffer.readu8(B64, bit32.rshift(v, 18)))
			buffer.writeu8(out, o + 1, buffer.readu8(B64, bit32.band(bit32.rshift(v, 12), 63)))
			buffer.writeu8(out, o + 2, buffer.readu8(B64, bit32.band(bit32.rshift(v, 6), 63)))
			buffer.writeu8(out, o + 3, buffer.readu8(B64, bit32.band(v, 63)))
			i += 3
			o += 4
		end
		local rest = n - i
		if rest > 0 then
			local b = rest == 2 and buffer.readu8(src, i + 1) or 0
			local v = buffer.readu8(src, i) * 65536 + b * 256
			buffer.writeu8(out, o, buffer.readu8(B64, bit32.rshift(v, 18)))
			buffer.writeu8(out, o + 1, buffer.readu8(B64, bit32.band(bit32.rshift(v, 12), 63)))
			buffer.writeu8(out, o + 2, rest == 2 and buffer.readu8(B64, bit32.band(bit32.rshift(v, 6), 63)) or 61)
			buffer.writeu8(out, o + 3, 61)
		end
		return buffer.tostring(out)
	end

	-- ── state
	local images = {}
	local useSelection = false
	local sending = false
	local lastSeq, clearedAt = 0, 0
	local bridgeOnline, status, paused = false, nil, false
	local replies, steps = {}, {}

	local function selectionPaths()
		local out = {}
		for i, inst in Selection:Get() do
			if i > 20 then break end
			table.insert(out, inst:GetFullName() .. " (" .. inst.ClassName .. ")")
		end
		return out
	end

	local function layoutComposer()
		local h = chips.AbsoluteSize.Y
		local extra = (#images > 0 or useSelection) and (h + 6) or 0
		composerBox.Position = UDim2.fromOffset(14, 12 + extra)
		composerBox.Size = UDim2.new(1, -28, 1, -(54 + extra))
	end
	local function renderChips()
		for _, c in chips:GetChildren() do
			if c:IsA("GuiObject") then c:Destroy() end
		end
		local function chip(text, onRemove)
			local c = new("TextButton", { Text = text .. "   ×", FontFace = F.med, TextSize = 11, TextColor3 = C.gold, BackgroundColor3 = C.goldTint, AutoButtonColor = false, AutomaticSize = Enum.AutomaticSize.X, Size = UDim2.fromOffset(0, 22), Parent = chips }, { corner(6), stroke(0.75, C.gold), padding(0, 9, 0, 9) })
			c.MouseButton1Click:Connect(onRemove)
		end
		for i, im in images do
			chip(im.name, function()
				table.remove(images, i)
				renderChips()
			end)
		end
		if useSelection then
			local n = #Selection:Get()
			chip(n == 0 and "Nothing selected" or (n .. " selected"), function()
				useSelection = false
				btnSel:SetAttribute("On", false)
				btnSel.TextColor3 = C.dim
				renderChips()
			end)
		end
		task.defer(layoutComposer)
	end
	Selection.SelectionChanged:Connect(function() if useSelection then renderChips() end end)
	btnSel.MouseButton1Click:Connect(function()
		useSelection = not useSelection
		btnSel:SetAttribute("On", useSelection)
		btnSel.TextColor3 = useSelection and C.gold or C.dim
		renderChips()
	end)
	btnImage.MouseButton1Click:Connect(function()
		if #images >= MAX_FILES then return setHint("Up to " .. MAX_FILES .. " files per message", C.warn) end
		local ok, picked = pcall(function() return StudioService:PromptImportFiles(FILE_TYPES) end)
		if not ok or not picked then return end
		for _, f in picked do
			if #images >= MAX_FILES then break end
			local okB, bin = pcall(function() return f:GetBinaryContents() end)
			if okB and bin then
				local lower = string.lower(f.Name)
				local isImage = lower:match("%.png$") or lower:match("%.jpe?g$")
				local nImages = 0
				for _, im in images do if im.kind == "image" then nImages += 1 end end
				if #bin > MAX_IMAGE_BYTES then
					setHint(f.Name .. " is larger than 6 MB", C.warn)
				elseif isImage and nImages >= MAX_IMAGES then
					setHint("Up to " .. MAX_IMAGES .. " images per message", C.warn)
				else
					table.insert(images, { kind = isImage and "image" or "file", name = f.Name, mime = lower:match("%.jpe?g$") and "image/jpeg" or (lower:match("%.png$") and "image/png" or "application/octet-stream"), data = base64(bin) })
				end
			end
		end
		renderChips()
	end)

	local function onlyKind(kind)
		local out = {}
		for _, im in images do if im.kind == kind then table.insert(out, { name = im.name, mime = im.mime, data = im.data }) end end
		return out
	end

	local function send()
		if sending then return end
		local text = composerBox.Text:gsub("^%s+", ""):gsub("%s+$", "")
		if text == "" and #images == 0 then return end
		if not bridgeOnline then return setHint("The bridge is offline — run start.bat", C.bad) end
		sending = true
		tween(btnSend, { BackgroundColor3 = C.goldDeep })
		setHint("Sending…")
		local ok, res = request("POST", "/api/plugin/request", {
			text = text, images = onlyKind("image"), files = onlyKind("file"), selection = useSelection and selectionPaths() or {},
			place = game.Name .. (game.PlaceId ~= 0 and (" (" .. tostring(game.PlaceId) .. ")") or ""),
		})
		sending = false
		tween(btnSend, { BackgroundColor3 = C.gold })
		if ok then
			composerBox.Text = ""
			table.clear(images)
			renderChips()
			if res and res.status and not res.status.browser then
				setHint("Queued — open your AI chat tab (with the Brickwire extension) to deliver it", C.warn)
			else
				setHint("Delivering to your AI chat…")
			end
		else
			setHint("Could not send: " .. tostring(res), C.bad)
		end
	end
	btnSend.MouseButton1Click:Connect(send)
	-- Enter sends, Shift+Enter keeps the new line
	local prevText = ""
	composerBox:GetPropertyChangedSignal("Text"):Connect(function()
		local t = composerBox.Text
		local added = #t == #prevText + 1 and string.sub(t, composerBox.CursorPosition - 1, composerBox.CursorPosition - 1) == "\n"
		prevText = t
		if added then
			local shift = false
			pcall(function() shift = UserInputService:IsKeyDown(Enum.KeyCode.LeftShift) or UserInputService:IsKeyDown(Enum.KeyCode.RightShift) end)
			if not shift then
				local pos = composerBox.CursorPosition
				composerBox.Text = string.sub(t, 1, pos - 2) .. string.sub(t, pos)
				prevText = composerBox.Text
				task.defer(send)
			end
		end
	end)

	-- ── feed
	local function dot(color, text) return string.format('<font color="#%s">●</font> %s', color:ToHex(), text) end
	local function renderStatus()
		local parts = {}
		table.insert(parts, bridgeOnline and dot(C.good, "Bridge") or dot(C.bad, "Bridge offline"))
		local sess = status and type(status.session) == "table" and status.session or nil
		local tab = status and status.tabs and status.tabs[1]
		if sess then
			paused = sess.paused == true
			table.insert(parts, dot(paused and C.warn or C.good, tostring(sess.provider) .. (sess.stage and sess.stage ~= "" and ("  ·  " .. string.lower(tostring(sess.stage))) or "")))
		elseif tab then
			paused = false
			table.insert(parts, dot(C.warn, tostring(tab.providerName) .. " · no session yet"))
		else
			paused = false
			table.insert(parts, dot(C.faint, "No AI chat tab"))
		end
		statusText.Text = table.concat(parts, "     ")
		btnPause.Text = paused and "RESUME" or "PAUSE"
	end

	local function handle(e)
		if e.seq <= clearedAt then return end
		local t = e.type
		if t ~= "status" and t ~= "control" then empty.Visible = false end
		if t == "user" then
			local meta = {}
			for _, n in e.images or {} do table.insert(meta, tostring(n)) end
			if e.selection and #e.selection > 0 then table.insert(meta, #e.selection .. " selected") end
			userMessage(tostring(e.text or ""), table.concat(meta, "  ·  "))
		elseif t == "request" then
			local key = "req:" .. tostring(e.id)
			local text, state
			if e.state == "taken" then text, state = "Delivering to " .. tostring(e.provider or "your AI chat"), "wait"
			elseif e.state == "waiting" then text, state = "The agent is finishing its turn — your message is next", "wait"
			elseif e.state == "delivered" then text, state = "Delivered", "done"
			else text, state = "Not delivered — " .. tostring(e.error or "send failed"), "error" end
			if steps[key] then setStep(steps[key], text, state) else steps[key] = stepRow(text, state) end
			setHint(state == "done" and "Thinking…" or text, state == "error" and C.bad or nil)
		elseif t == "reply" then
			local text = tostring(e.text or "")
			if text == "" then return end
			if #text > 12000 then text = string.sub(text, 1, 12000) .. "\n…" end
			local key = tostring(e.key)
			if replies[key] then replies[key].Text = text else replies[key] = aiMessage(tostring(e.provider or ""), text) end
			setHint(e.partial and "Writing…" or "")
			toBottom()
		elseif t == "activity" then
			local key = "act:" .. tostring(e.key)
			local state = tostring(e.state)
			if steps[key] then setStep(steps[key], tostring(e.text), state) else steps[key] = stepRow(tostring(e.text), state) end
			if state == "wait" then setHint(tostring(e.text)) end
		elseif t == "notice" then
			stepRow(tostring(e.text), e.level == "error" and "error" or e.level == "warn" and "wait" or "info")
		elseif t == "done" then
			card("Agent report · verification required", tostring(e.summary or "") .. "\nThis is the agent’s report, not an independently verified test result.", C.warn)
			setHint(tostring(e.verificationState or "PARTIAL") .. " — review task evidence", C.warn)
		elseif t == "ask" then
			card("Your input needed", "The AI asked you something — answer below.", C.gold)
			setHint("Waiting for your answer", C.warn)
			composerBox:CaptureFocus()
		elseif t == "status" then
			status = e.status
			renderStatus()
		end
	end

	local running = true
	plugin.Unloading:Connect(function() running = false end)
	task.spawn(function()
		local first, wasOnline = true, nil
		while running do
			local ok, res = request("GET", "/api/plugin/feed?since=" .. tostring(lastSeq) .. "&wait=" .. (first and "0" or "12000"))
			bridgeOnline = ok
			if ok and res then
				first = false
				if (res.last or 0) < lastSeq then lastSeq = 0 end
				status = res.status
				for _, e in res.events or {} do
					if e.seq > lastSeq then
						lastSeq = e.seq
						local okH, err = pcall(handle, e)
						if not okH then warn("[Brickwire] " .. tostring(err)) end
					end
				end
				if wasOnline == false then setHint("Bridge connected", C.good) end
				wasOnline = true
				renderStatus()
			else
				if wasOnline ~= false then
					setHint("Bridge offline — run start.bat (port " .. tostring(port) .. ")", C.bad)
					if not tostring(res):find("refused") and tostring(res):find("[Hh][Tt][Tt][Pp]") then warn("[Brickwire] " .. tostring(res)) end
				end
				wasOnline = false
				renderStatus()
				task.wait(3)
			end
		end
	end)

	miWorkspace.MouseButton1Click:Connect(function()
		menu.Visible = false
		task.spawn(function()
			local ok, result = request("GET", "/api/workspace/summary")
			if not ok or type(result) ~= "table" then card("Workspace unavailable", "Bridge offline or application not upgraded.", C.warn) return end
			local lines = { "Application: http://127.0.0.1:" .. tostring(port) .. "/app", "Target place: " .. game.Name .. " · " .. tostring(game.PlaceId), "Selected object paths (context only, not verification):" }
			for _, inst in ipairs(Selection:Get()) do table.insert(lines, "game." .. inst:GetFullName() .. " · " .. inst.ClassName) end
			for _, item in ipairs(result.records or {}) do table.insert(lines, tostring(item.kind) .. " · " .. tostring(item.name) .. " · revision " .. tostring(item.revision)) end
			table.insert(lines, tostring(result.coverage or ""))
			card("Project workspace", table.concat(lines, "\n"), C.gold)
		end)
	end)

	miSkills.MouseButton1Click:Connect(function()
		menu.Visible = false
		task.spawn(function()
			local ok, result = request("GET", "/api/app-skills/summary")
			if not ok or type(result) ~= "table" then card("Skills unavailable", "Bridge offline or not upgraded.", C.warn) return end
			local lines = { "Instructions only; no automatic execution or permission grants." }
			for _, item in ipairs(result.skills or {}) do table.insert(lines, tostring(item.name) .. " · " .. (item.enabled and "active" or "available, disabled")) end
			table.insert(lines, tostring(result.templates or 0) .. " templates (not executed)")
			if result.error then table.insert(lines, tostring(result.error)) end
			table.insert(lines, "Manage in app: " .. base() .. "/app#skills")
			card("Skills & templates", table.concat(lines, "\n"), C.gold)
		end)
	end)
	miTasks.MouseButton1Click:Connect(function()
		menu.Visible = false
		task.spawn(function()
			local ok, result = request("GET", "/api/app-runtime/summary")
			if not ok or type(result) ~= "table" then card("Tasks unavailable", "The bridge is offline or not upgraded.", C.warn) return end
			local lines = {}
			for _, item in ipairs(result.tasks or {}) do
				table.insert(lines, tostring(item.state) .. " · " .. tostring(item.goal) .. " · " .. tostring(item.binding and item.binding.name or "unknown"))
			end
			if #lines == 0 then table.insert(lines, "No application tasks yet.") end
			table.insert(lines, "Structural evidence only, not a Play/visual test. Open: " .. base() .. "/app#autopilot")
			card("Tasks & verification", table.concat(lines, "\n"), C.gold)
		end)
	end)
	-- Application-owned MCP status. Reading this does not connect or execute servers.
	miMcp.MouseButton1Click:Connect(function()
		menu.Visible = false
		task.spawn(function()
			local ok, result = request("GET", "/api/app-mcp/summary")
			if not ok or type(result) ~= "table" then
				card("MCP unavailable", "The bridge is offline or has not been upgraded. Existing chat controls are unchanged.", C.warn)
				return
			end
			local lines = { "Studio: " .. tostring(result.studio and result.studio.state or "unknown") }
			for _, server in ipairs(result.servers or {}) do
				table.insert(lines, tostring(server.name) .. " · " .. tostring(server.status) .. " · " .. tostring(server.toolCount or 0) .. " tools")
			end
			if #(result.servers or {}) == 0 then table.insert(lines, "No additional servers configured.") end
			table.insert(lines, "Manage connections and permissions in the application: " .. base() .. "/app#mcp")
			card("MCP connections", table.concat(lines, "\n"), C.gold)
		end)
	end)

	-- ── Brickwire 3.0: live progress from real run state (no synthetic percentages)
	local LogService = game:GetService("LogService")
	local followProgress = false
	local lastProgressKey = nil
	local function progressLine(r)
		local line = tostring(r.state) .. " · " .. tostring(r.stage or "") .. " · steps " .. tostring(r.steps and r.steps.done or 0) .. "/" .. tostring(r.steps and r.steps.total or 0)
		if r.current then line = line .. " · " .. tostring(r.current) end
		return line
	end
	miProgress.MouseButton1Click:Connect(function()
		menu.Visible = false
		followProgress = not followProgress
		miProgress.Text = followProgress and "Stop following progress" or "Live task progress (3.0)"
		task.spawn(function()
			local ok, r = request("GET", "/api/plugin/task-progress")
			if not ok or type(r) ~= "table" then card("Progress unavailable", "Bridge offline or not upgraded to 3.0.", C.warn) return end
			if not r.runId then card("Brickwire 3.0", "No runs yet. Start one in the app: " .. base() .. "/app#chats", C.gold) return end
			local lines = { tostring(r.goal), progressLine(r) }
			for _, e in ipairs(r.events or {}) do table.insert(lines, "#" .. tostring(e.seq) .. " " .. tostring(e.stage or "") .. " · " .. tostring(e.title)) end
			table.insert(lines, "Run " .. tostring(r.runId) .. " · Development Tree: " .. base() .. "/app#devtree")
			card("Live task progress", table.concat(lines, "\n"), r.active and C.gold or C.good)
		end)
		if followProgress then
			task.spawn(function()
				while running and followProgress do
					local ok, r = request("GET", "/api/plugin/task-progress")
					if ok and type(r) == "table" and r.runId then
						local key = tostring(r.runId) .. progressLine(r)
						if key ~= lastProgressKey then
							lastProgressKey = key
							setHint("3.0 · " .. progressLine(r), r.active and C.gold or (r.state == "done" and C.good or C.warn))
						end
					end
					task.wait(2)
				end
			end)
		end
	end)
	miDiag.MouseButton1Click:Connect(function()
		menu.Visible = false
		task.spawn(function()
			local errors = {}
			local okLog, history = pcall(function() return LogService:GetLogHistory() end)
			if okLog and type(history) == "table" then
				for i = #history, 1, -1 do
					local m = history[i]
					if m.messageType == Enum.MessageType.MessageError or m.messageType == Enum.MessageType.MessageWarning then
						table.insert(errors, (m.messageType == Enum.MessageType.MessageError and "ERROR: " or "WARN: ") .. tostring(m.message))
						if #errors >= 40 then break end
					end
				end
			end
			local selection = {}
			for _, inst in ipairs(Selection:Get()) do table.insert(selection, "game." .. inst:GetFullName() .. " · " .. inst.ClassName) end
			local ok, r = request("POST", "/api/plugin/diagnostics", { errors = errors, selection = selection, placeId = game.PlaceId, placeName = game.Name })
			if not ok or type(r) ~= "table" or not r.diagnostics then card("Diagnostics not sent", "Bridge offline or not upgraded: " .. tostring(r), C.bad) return end
			local d = r.diagnostics
			local lines = { tostring(#errors) .. " errors/warnings, " .. tostring(#selection) .. " selected objects" }
			if d.duplicate then table.insert(lines, "Already sent earlier (duplicate ignored).") end
			if d.matchesBinding == false then table.insert(lines, "WARNING: this place differs from the session bound in the app.") end
			table.insert(lines, d.runId and ("Attached to run " .. tostring(d.runId)) or "Stored; no active run to attach to.")
			card("Diagnostics sent", table.concat(lines, "\n"), d.matchesBinding == false and C.warn or C.good)
		end)
	end)
	miCancelRun.MouseButton1Click:Connect(function()
		menu.Visible = false
		task.spawn(function()
			local ok, r = request("GET", "/api/plugin/task-progress")
			if not ok or type(r) ~= "table" or not r.active then card("Nothing to cancel", "No active Brickwire 3.0 run.", C.dim) return end
			local ok2, res = request("POST", "/api/plugin/task-control", { action = "cancel", runId = r.runId })
			if ok2 and type(res) == "table" and res.ok then card("Run cancelled", tostring(r.goal) .. "\nState: " .. tostring(res.state), C.warn)
			else card("Cancel failed", tostring(type(res) == "table" and res.error or res), C.bad) end
		end)
	end)

	-- ── header actions
	btnPause.MouseButton1Click:Connect(function() request("POST", "/api/plugin/control", { action = paused and "resume" or "pause" }) end)
	btnStop.MouseButton1Click:Connect(function() request("POST", "/api/plugin/control", { action = "stop" }) end)
	miClear.MouseButton1Click:Connect(function()
		menu.Visible = false
		clearedAt = lastSeq
		for _, c in scroller:GetChildren() do
			if c:IsA("GuiObject") and c ~= empty then c:Destroy() end
		end
		table.clear(replies)
		table.clear(steps)
		empty.Visible = true
	end)
	portBox.FocusLost:Connect(function()
		local n = tonumber(portBox.Text)
		if n and n > 0 and n < 65536 then
			port = math.floor(n)
			pcall(function() plugin:SetSetting("bw_port", port) end)
			lastSeq = 0
		end
		portBox.Text = tostring(port)
	end)
	renderStatus()
	setHint("Enter to send  ·  Shift+Enter for a new line")
end

local ok, err = pcall(main)
if not ok then
	warn("[Brickwire] plugin failed to start: " .. tostring(err))
	local l = Instance.new("TextLabel")
	l.Size = UDim2.fromScale(1, 1)
	l.TextWrapped = true
	l.Text = "Brickwire AI could not start:\n" .. tostring(err) .. "\n\nSend this text to support."
	l.BackgroundColor3 = Color3.fromHex("#0B0B0E")
	l.TextColor3 = Color3.fromHex("#E8806F")
	l.Parent = widget
end
