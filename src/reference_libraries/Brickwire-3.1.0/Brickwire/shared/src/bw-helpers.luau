-- Brickwire helper library "BW" — prepended by the bridge to execute_luau code that uses BW.
-- Goal: short, correct AI code. Every helper validates input and fails with a clear message.
local BW = {}
do
	local function svc(n) return game:GetService(n) end
	BW.version = "1.8"
	pcall(function() svc("ChangeHistoryService"):SetWaypoint("Brickwire: before AI change") end)

	local function fail(msg) error("BW: " .. msg, 0) end
	BW.fail = fail

	-- ------------------------------------------------------------ paths
	function BW.find(path, root)
		if typeof(path) == "Instance" then return path end
		if type(path) ~= "string" then return nil end
		local cur = root or game
		for seg in string.gmatch(path, "[^%.]+") do
			if cur == game and seg == "game" then
				-- skip
			elseif cur == game and (seg == "workspace" or seg == "Workspace") then
				cur = workspace
			else
				local nxt = cur:FindFirstChild(seg)
				if not nxt and cur == game then
					local ok, s = pcall(function() return svc(seg) end)
					if ok then nxt = s end
				end
				if not nxt then return nil end
				cur = nxt
			end
		end
		return cur
	end
	function BW.get(path, root)
		local i = BW.find(path, root)
		if not i then fail("not found: " .. tostring(path)) end
		return i
	end
	function BW.exists(path)
		local i = BW.find(path)
		print("BW_EXISTS " .. tostring(path) .. " = " .. tostring(i ~= nil) .. (i and (" [" .. i.ClassName .. "]") or ""))
		return i ~= nil
	end

	-- ------------------------------------------------------------ values
	function BW.color(v)
		if typeof(v) == "Color3" then return v end
		if typeof(v) == "BrickColor" then return v.Color end
		if type(v) == "string" then
			local h = string.gsub(v, "^#", "")
			if #h == 6 and string.match(h, "^%x+$") then
				return Color3.fromRGB(tonumber(string.sub(h, 1, 2), 16), tonumber(string.sub(h, 3, 4), 16), tonumber(string.sub(h, 5, 6), 16))
			end
			return BrickColor.new(v).Color
		end
		if type(v) == "table" then
			local r, g, b = v[1] or v.r or v.R or 0, v[2] or v.g or v.G or 0, v[3] or v.b or v.B or 0
			if r > 1 or g > 1 or b > 1 then return Color3.fromRGB(r, g, b) end
			return Color3.new(r, g, b)
		end
		fail("cannot convert to Color3: " .. tostring(v))
	end
	function BW.v3(v)
		if typeof(v) == "Vector3" then return v end
		if type(v) == "number" then return Vector3.new(v, v, v) end
		if type(v) == "table" then return Vector3.new(v[1] or v.x or v.X or 0, v[2] or v.y or v.Y or 0, v[3] or v.z or v.Z or 0) end
		fail("cannot convert to Vector3: " .. tostring(v))
	end
	-- {xScale, xOffset, yScale, yOffset} | {xScale, yScale} (2 numbers = scale) | UDim2
	function BW.udim2(v)
		if typeof(v) == "UDim2" then return v end
		if type(v) == "table" then
			if #v == 2 then return UDim2.fromScale(v[1], v[2]) end
			return UDim2.new(v[1] or 0, v[2] or 0, v[3] or 0, v[4] or 0)
		end
		fail("cannot convert to UDim2: " .. tostring(v))
	end
	local function numseq(v)
		if type(v) == "number" then return NumberSequence.new(v) end
		if type(v) == "table" and type(v[1]) == "number" then
			if #v == 2 then return NumberSequence.new({ NumberSequenceKeypoint.new(0, v[1]), NumberSequenceKeypoint.new(1, v[2]) }) end
		end
		return v
	end
	local function colseq(v)
		if typeof(v) == "ColorSequence" then return v end
		if type(v) == "table" and #v == 2 and (type(v[1]) ~= "number") then
			return ColorSequence.new({ ColorSequenceKeypoint.new(0, BW.color(v[1])), ColorSequenceKeypoint.new(1, BW.color(v[2])) })
		end
		return ColorSequence.new(BW.color(v))
	end
	local function range(v)
		if type(v) == "number" then return NumberRange.new(v) end
		if type(v) == "table" then return NumberRange.new(v[1], v[2] or v[1]) end
		return v
	end

	-- ------------------------------------------------------------ instances
	-- shortcut keys: META always, UI_DECOR only on GuiObjects/ScreenGuis (elsewhere e.g. UIListLayout.Padding is a real property)
	local META = { Children = true, Attributes = true, Class = true, Parent = true, From = true, To = true, At = true }
	local UI_DECOR = { Corner = true, Stroke = true, Padding = true, List = true, Aspect = true, Gradient = true }
	local VFX = { ParticleEmitter = true, Beam = true, Trail = true }

	-- Set many properties with automatic conversion. Unknown property → clear error naming the class.
	function BW.set(inst, props)
		local isPart, isGui = inst:IsA("BasePart"), inst:IsA("GuiObject")
		local deco = isGui or inst:IsA("LayerCollector")
		for k, v in pairs(props) do
			if not META[k] and not (deco and UI_DECOR[k]) and not (type(k) == "number") then
				local val = v
				if VFX[inst.ClassName] then
					if k == "Color" then val = colseq(v)
					elseif k == "Size" or k == "Transparency" or k == "Squash" then val = numseq(v)
					elseif k == "Lifetime" or k == "Speed" or k == "Rotation" or k == "RotSpeed" then val = range(v) end
				elseif string.match(k, "Color3?$") and (type(v) == "string" or type(v) == "table") and typeof(v) ~= "BrickColor" and k ~= "BrickColor" then
					val = BW.color(v)
				elseif isGui and (k == "Size" or k == "Position") then
					val = BW.udim2(v)
				elseif isPart and (k == "Size" or k == "Position" or k == "Orientation" or k == "Velocity") then
					val = BW.v3(v)
				elseif k == "CFrame" and type(v) == "table" then
					val = CFrame.new(v[1] or 0, v[2] or 0, v[3] or 0)
				end
				local ok, err = pcall(function() inst[k] = val end)
				if not ok then fail("cannot set " .. inst.ClassName .. "." .. k .. " = " .. tostring(v) .. " (" .. tostring(err) .. ")") end
			end
		end
		-- UI decorations
		if deco then
		if props.Corner then BW.new("UICorner", { CornerRadius = UDim.new(0, props.Corner), Parent = inst }) end
		if props.Stroke then
			local s = type(props.Stroke) == "table" and props.Stroke or { Thickness = props.Stroke }
			BW.new("UIStroke", { Color = BW.color(s.Color or s[1] or "#000000"), Thickness = s.Thickness or s[2] or 1, Parent = inst })
		end
		if props.Padding then
			local p = UDim.new(0, props.Padding)
			BW.new("UIPadding", { PaddingTop = p, PaddingBottom = p, PaddingLeft = p, PaddingRight = p, Parent = inst })
		end
		if props.List then
			local l = type(props.List) == "table" and props.List or {}
			BW.new("UIListLayout", { Padding = UDim.new(0, l.Padding or 6), FillDirection = l.Direction or "Vertical", HorizontalAlignment = l.Align or "Center", SortOrder = "LayoutOrder", Parent = inst })
		end
		if props.Aspect then BW.new("UIAspectRatioConstraint", { AspectRatio = props.Aspect, Parent = inst }) end
		if props.Gradient then BW.new("UIGradient", { Color = colseq(props.Gradient), Parent = inst }) end
		end
		if props.Attributes then for a, av in pairs(props.Attributes) do inst:SetAttribute(a, av) end end
		if props.Children then
			for _, c in ipairs(props.Children) do
				local cp = table.clone(c)
				cp.Parent = inst
				BW.new(c.Class or c[1] or "Part", cp)
			end
		end
		return inst
	end

	BW.default = nil -- default parent for BW.part (set by BW.model)
	function BW.new(className, props)
		props = props or {}
		local ok, inst = pcall(function() return Instance.new(className) end)
		if not ok then fail("unknown class '" .. tostring(className) .. "'") end
		if inst:IsA("BasePart") then
			if props.Anchored == nil then inst.Anchored = true end
			pcall(function() inst.TopSurface = "Smooth" inst.BottomSurface = "Smooth" end)
		end
		if inst:IsA("GuiObject") and props.BorderSizePixel == nil then pcall(function() inst.BorderSizePixel = 0 end) end
		if inst:IsA("BasePart") and (props.From or props.At) then
			-- From/To = opposite corners; At = bottom-center (stands exactly on that point)
			props = table.clone(props)
			if props.From then
				if not props.To then fail("From needs To (the opposite corner)") end
				local a, b = BW.v3(props.From), BW.v3(props.To)
				props.Size = { math.abs(b.X - a.X), math.abs(b.Y - a.Y), math.abs(b.Z - a.Z) }
				props.Position = { (a.X + b.X) / 2, (a.Y + b.Y) / 2, (a.Z + b.Z) / 2 }
			else
				local sz = props.Size and BW.v3(props.Size) or inst.Size
				local at = BW.v3(props.At)
				props.Position = { at.X, at.Y + sz.Y / 2, at.Z }
			end
		end
		BW.set(inst, props)
		local parent = props.Parent
		if type(parent) == "string" then parent = BW.get(parent) end
		if parent == nil and inst:IsA("BasePart") then parent = BW.default or workspace end
		if parent then inst.Parent = parent end
		return inst
	end
	function BW.part(props) return BW.new(props.Class or props[1] or "Part", props) end
	function BW.folder(name, parent)
		parent = parent and BW.get(parent) or workspace
		local f = parent:FindFirstChild(name)
		if f then return f end
		return BW.new("Folder", { Name = name, Parent = parent })
	end

	-- A Model the agent owns. Re-running replaces ONLY a previous agent-built model of the same name.
	local function owned(parent, name, replace, what)
		local old = parent:FindFirstChild(name)
		if old then
			if old:GetAttribute("BW_Owned") or replace then old:Destroy()
			else fail(what .. " '" .. name .. "' already exists in " .. parent:GetFullName() .. " and was not made by the agent — use another name or {replace=true}") end
		end
	end
	function BW.model(name, parent, opts)
		parent = parent and BW.get(parent) or workspace
		owned(parent, name, opts and opts.replace, "Model")
		local m = Instance.new("Model")
		m.Name = name
		m:SetAttribute("BW_Owned", true)
		m.Parent = parent
		BW.default = m
		return m
	end
	-- Weld every part of a model to its first/primary part (for unanchored assemblies).
	function BW.weldAll(model, unanchor)
		local root = model.PrimaryPart
		local parts = {}
		for _, d in ipairs(model:GetDescendants()) do if d:IsA("BasePart") then table.insert(parts, d) end end
		root = root or parts[1]
		if not root then fail("weldAll: no parts in " .. model:GetFullName()) end
		for _, p in ipairs(parts) do
			if p ~= root then BW.new("WeldConstraint", { Part0 = root, Part1 = p, Parent = p }) end
			if unanchor then p.Anchored = false end
		end
		return #parts
	end


	-- ------------------------------------------------------------ building kit (bottom-anchored, no center math)
	-- Coordinates: Y is up, studs. "At" = BOTTOM-center of the thing, so At={x,0,z} stands exactly on the ground.
	local function parentOf(opts)
		if opts and opts.Parent then return BW.get(opts.Parent) end
		return BW.default or workspace
	end
	local function p3(v, y)
		if type(v) == "table" and #v == 2 and v.x == nil then return Vector3.new(v[1], y or 0, v[2]) end
		return BW.v3(v)
	end
	local function styleOf(opts, keys)
		local t = {}
		for _, k in ipairs(keys) do if opts[k] ~= nil then t[k] = opts[k] end end
		return t
	end
	local LOOK = { "Color", "Material", "Transparency", "Reflectance", "CastShadow", "CanCollide" }
	local function look(opts, extra)
		local t = styleOf(opts or {}, LOOK)
		for k, v in pairs(extra or {}) do t[k] = v end
		return t
	end
	local function group(name, opts)
		local m = Instance.new("Model")
		m.Name = name
		m:SetAttribute("BW_Owned", true)
		m.Parent = parentOf(opts)
		return m
	end

	-- Part between two opposite corners: BW.block{From={x1,y1,z1}, To={x2,y2,z2}, Color=…}
	function BW.block(props)
		if not (props.From and props.To) then fail("BW.block needs From={x,y,z} and To={x,y,z} (opposite corners)") end
		return BW.part(props)
	end

	-- Straight wall from A to B (any direction) with door/window openings.
	-- BW.wall({x,y,z}|{x,z}, {x,y,z}|{x,z}, {height=10, thickness=1, y=0, Color=, Material=,
	--   openings={{width=4, height=7, offset=0 (from wall center), bottom=0}, {width=4, height=3, bottom=3, glass=true}}})
	function BW.wall(a, b, opts)
		opts = opts or {}
		local A, B = p3(a, opts.y), p3(b, opts.y)
		local h, t = opts.height or 10, opts.thickness or 1
		local dx, dz = B.X - A.X, B.Z - A.Z
		local len = math.sqrt(dx * dx + dz * dz)
		if len < 0.2 then fail("wall is too short (" .. len .. " studs)") end
		local ux, uz = dx / len, dz / len
		local yaw = math.deg(math.atan2(-uz, ux))
		local ops = {}
		for i, o in ipairs(opts.openings or {}) do
			local w, oh, bottom = o.width or 4, o.height or 7, o.bottom or 0
			local c = len / 2 + (o.offset or 0)
			local s0, s1 = c - w / 2, c + w / 2
			if s0 < -0.01 or s1 > len + 0.01 then fail("opening " .. i .. " (width " .. w .. ", offset " .. (o.offset or 0) .. ") does not fit in a wall of length " .. string.format("%.1f", len)) end
			if bottom < 0 or bottom + oh > h + 0.01 then fail("opening " .. i .. ": bottom+height (" .. (bottom + oh) .. ") exceeds wall height " .. h) end
			table.insert(ops, { s0 = math.max(0, s0), s1 = math.min(len, s1), y0 = bottom, y1 = bottom + oh, glass = o.glass, i = i })
		end
		table.sort(ops, function(x, y) return x.s0 < y.s0 end)
		for i = 2, #ops do if ops[i].s0 < ops[i - 1].s1 - 0.01 then fail("openings " .. ops[i - 1].i .. " and " .. ops[i].i .. " overlap") end end
		local m = group(opts.Name or "Wall", opts)
		local n = 0
		local function piece(s0, s1, y0, y1, extra)
			if s1 - s0 < 0.05 or y1 - y0 < 0.05 then return end
			n = n + 1
			local mid = (s0 + s1) / 2
			local props = look(opts, extra)
			props.Name = props.Name or ("Wall" .. n)
			props.Size = { s1 - s0, y1 - y0, extra and extra.thick or t }
			props.thick = nil
			props.Position = { A.X + ux * mid, A.Y + (y0 + y1) / 2, A.Z + uz * mid }
			props.Orientation = { 0, yaw, 0 }
			props.Parent = m
			BW.part(props)
		end
		local cur = 0
		for _, o in ipairs(ops) do
			piece(cur, o.s0, 0, h)
			piece(o.s0, o.s1, 0, o.y0)
			piece(o.s0, o.s1, o.y1, h)
			if o.glass then piece(o.s0, o.s1, o.y0, o.y1, { Name = "Glass", Material = "Glass", Transparency = 0.45, Color = opts.GlassColor or "#A8D8FF", thick = math.max(0.2, t * 0.3) }) end
			cur = o.s1
		end
		piece(cur, len, 0, h)
		return m
	end

	-- Closed room: floor + 4 walls (+ ceiling). Sides: front (+Z), back (-Z), left (-X), right (+X).
	-- BW.room{At={x,y,z}, Size={w,h,d}, thickness=1, floor=true, ceiling=false, Color=, Material=, FloorColor=, FloorMaterial=,
	--   doors={{side="front", offset=0, width=4, height=7}}, windows={{side="left", offset=0, width=4, height=3, bottom=3}}}
	function BW.room(opts)
		local at, size = BW.v3(opts.At or { 0, 0, 0 }), BW.v3(opts.Size or { 20, 10, 16 })
		local w, h, d, t = size.X, size.Y, size.Z, opts.thickness or 1
		if w < 2 * t + 1 or d < 2 * t + 1 then fail("room is too small for its wall thickness") end
		local m = group(opts.Name or "Room", opts)
		local base = at.Y
		if opts.floor ~= false then
			BW.part{ Name = "Floor", From = { at.X - w / 2, base, at.Z - d / 2 }, To = { at.X + w / 2, base + 1, at.Z + d / 2 }, Color = opts.FloorColor or opts.Color, Material = opts.FloorMaterial or opts.Material, Parent = m }
			base = base + 1
		end
		local open = { front = {}, back = {}, left = {}, right = {} }
		local function add(list, glass)
			for _, o in ipairs(list or {}) do
				local s = o.side or "front"
				if not open[s] then fail("side must be front, back, left or right (got " .. tostring(s) .. ")") end
				local c = table.clone(o)
				if glass and c.glass == nil then c.glass = true end
				if glass and c.bottom == nil then c.bottom = 3 end
				if glass and c.height == nil then c.height = 3 end
				table.insert(open[s], c)
			end
		end
		add(opts.doors, false)
		add(opts.windows, true)
		local x0, x1, z0, z1 = at.X - w / 2, at.X + w / 2, at.Z - d / 2, at.Z + d / 2
		local wo = function(name, list) return { Name = name, height = h, thickness = t, y = base, openings = list, Color = opts.Color, Material = opts.Material, Transparency = opts.Transparency, GlassColor = opts.GlassColor, Parent = m } end
		BW.wall({ x0, z1 - t / 2 }, { x1, z1 - t / 2 }, wo("FrontWall", open.front))
		-- back wall runs right→left so "offset" is mirrored consistently when seen from outside
		BW.wall({ x1, z0 + t / 2 }, { x0, z0 + t / 2 }, wo("BackWall", open.back))
		BW.wall({ x0 + t / 2, z0 + t }, { x0 + t / 2, z1 - t }, wo("LeftWall", open.left))
		BW.wall({ x1 - t / 2, z1 - t }, { x1 - t / 2, z0 + t }, wo("RightWall", open.right))
		if opts.ceiling then
			BW.part{ Name = "Ceiling", From = { x0, base + h, z0 }, To = { x1, base + h + 1, z1 }, Color = opts.CeilingColor or opts.Color, Material = opts.Material, Parent = m }
		end
		m:SetAttribute("BW_Top", base + h + (opts.ceiling and 1 or 0))
		return m
	end

	-- Roof on top of walls. At={x,y,z} with y = TOP of the walls. style "gable" (default) | "shed" | "flat".
	-- BW.roof{At=, Size={w,d}, style="gable", height=5, overhang=1, ridge="X"|"Z", gableEnds=true, Color=, Material=, EndColor=}
	function BW.roof(opts)
		local at = BW.v3(opts.At or { 0, 10, 0 })
		local s = opts.Size or { 20, 16 }
		local w, d = s[1] or s.X, s[2] or s[3] or s.Z
		local o, H = opts.overhang or 1, opts.height or 5
		local W, D = w + 2 * o, d + 2 * o
		local style = opts.style or "gable"
		local m = group(opts.Name or "Roof", opts)
		local L = look(opts)
		local function wedge(name, size, pos, yaw, extra)
			local p = table.clone(L)
			for k, v in pairs(extra or {}) do p[k] = v end
			p.Name, p.Class, p.Size, p.Position, p.Orientation, p.Parent = name, "WedgePart", size, pos, { 0, yaw, 0 }, m
			return BW.part(p)
		end
		if style == "flat" then
			local p = table.clone(L)
			p.Name, p.From, p.To, p.Parent = "RoofSlab", { at.X - W / 2, at.Y, at.Z - D / 2 }, { at.X + W / 2, at.Y + 1, at.Z + D / 2 }, m
			BW.part(p)
			-- parapet
			if opts.parapet ~= false then
				for _, e in ipairs({ { -1, 0 }, { 1, 0 }, { 0, -1 }, { 0, 1 } }) do
					local q = table.clone(L)
					q.Name = "Parapet"
					if e[1] ~= 0 then q.From, q.To = { at.X + e[1] * W / 2 - (e[1] > 0 and 1 or 0), at.Y + 1, at.Z - D / 2 }, { at.X + e[1] * W / 2 + (e[1] < 0 and 1 or 0), at.Y + 2, at.Z + D / 2 }
					else q.From, q.To = { at.X - W / 2, at.Y + 1, at.Z + e[2] * D / 2 - (e[2] > 0 and 1 or 0) }, { at.X + W / 2, at.Y + 2, at.Z + e[2] * D / 2 + (e[2] < 0 and 1 or 0) } end
					q.Parent = m
					BW.part(q)
				end
			end
		elseif style == "shed" then
			wedge("RoofShed", { W, H, D }, { at.X, at.Y + H / 2, at.Z }, 0)
		elseif style == "gable" then
			local ridgeZ = opts.ridge == "Z"
			if not ridgeZ then
				wedge("RoofA", { W, H, D / 2 }, { at.X, at.Y + H / 2, at.Z - D / 4 }, 0)
				wedge("RoofB", { W, H, D / 2 }, { at.X, at.Y + H / 2, at.Z + D / 4 }, 180)
			else
				wedge("RoofA", { D, H, W / 2 }, { at.X - W / 4, at.Y + H / 2, at.Z }, 90)
				wedge("RoofB", { D, H, W / 2 }, { at.X + W / 4, at.Y + H / 2, at.Z }, -90)
			end
			if opts.gableEnds ~= false then
				-- triangular wall pieces closing the gable under the roof (same slope, no overhang)
				local Hi = H * (d / D)
				local ec = { Color = opts.EndColor or opts.WallColor or opts.Color, Material = opts.EndMaterial or opts.WallMaterial or opts.Material }
				local t = opts.thickness or 1
				for _, sgn in ipairs({ -1, 1 }) do
					if not ridgeZ then
						wedge("GableEnd", { t, Hi, d / 2 }, { at.X + sgn * (w / 2 - t / 2), at.Y + Hi / 2, at.Z - d / 4 }, 0, ec)
						wedge("GableEnd", { t, Hi, d / 2 }, { at.X + sgn * (w / 2 - t / 2), at.Y + Hi / 2, at.Z + d / 4 }, 180, ec)
					else
						local Hw = H * (w / W)
						wedge("GableEnd", { t, Hw, w / 2 }, { at.X - w / 4, at.Y + Hw / 2, at.Z + sgn * (d / 2 - t / 2) }, 90, ec)
						wedge("GableEnd", { t, Hw, w / 2 }, { at.X + w / 4, at.Y + Hw / 2, at.Z + sgn * (d / 2 - t / 2) }, -90, ec)
					end
				end
			end
		else
			fail("roof style must be gable, shed or flat (got " .. tostring(style) .. ")")
		end
		return m
	end

	-- Staircase. From = bottom-front-center of the first step; dir "+Z"|"-Z"|"+X"|"-X". Solid steps (no gaps underneath).
	-- BW.stairs{From={x,y,z}, dir="+Z", steps=10, rise=1, run=1.5, width=4, Color=, Material=}
	function BW.stairs(opts)
		local f = BW.v3(opts.From or opts.At or { 0, 0, 0 })
		local n, rise, run, w = opts.steps or 10, opts.rise or 1, opts.run or 1.5, opts.width or 4
		local dirs = { ["+Z"] = { 0, 1 }, ["-Z"] = { 0, -1 }, ["+X"] = { 1, 0 }, ["-X"] = { -1, 0 } }
		local dv = dirs[opts.dir or "+Z"]
		if not dv then fail("stairs dir must be +Z, -Z, +X or -X") end
		if rise > 2 then fail("rise " .. rise .. " is too high for a character to climb (max 2, use 1)") end
		local m = group(opts.Name or "Stairs", opts)
		for i = 1, n do
			local a0, a1 = (i - 1) * run, i * run
			local p = look(opts, { Name = "Step" .. i, Parent = m })
			if dv[1] == 0 then
				p.From = { f.X - w / 2, f.Y, f.Z + dv[2] * a0 }
				p.To = { f.X + w / 2, f.Y + i * rise, f.Z + dv[2] * a1 }
			else
				p.From = { f.X + dv[1] * a0, f.Y, f.Z - w / 2 }
				p.To = { f.X + dv[1] * a1, f.Y + i * rise, f.Z + w / 2 }
			end
			BW.part(p)
		end
		m:SetAttribute("BW_Top", f.Y + n * rise)
		return m
	end

	-- Cylinder standing on At (bottom center) — pillars, columns, trunks, wheels (axis="X"|"Z": At = center).
	function BW.cylinder(opts)
		local at = BW.v3(opts.At or { 0, 0, 0 })
		local h, dia, axis = opts.height or 8, opts.diameter or 2, opts.axis or "Y"
		local p = look(opts, { Name = opts.Name or "Cylinder", Shape = "Cylinder", Size = { h, dia, dia }, Parent = parentOf(opts) })
		if axis == "Y" then p.Orientation, p.Position = { 0, 0, 90 }, { at.X, at.Y + h / 2, at.Z }
		elseif axis == "Z" then p.Orientation, p.Position = { 0, 90, 0 }, { at.X, at.Y, at.Z }
		else p.Orientation, p.Position = { 0, 0, 0 }, { at.X, at.Y, at.Z } end
		return BW.part(p)
	end

	-- Repetition: BW.array(n, {dx,dy,dz}, function(i, offset) ... end) and BW.ring(n, radius, center, function(i, pos, angleDeg) ... end)
	function BW.array(n, step, fn)
		local s = BW.v3(step)
		local out = {}
		for i = 0, n - 1 do table.insert(out, fn(i, Vector3.new(s.X * i, s.Y * i, s.Z * i)) or false) end
		return out
	end
	function BW.ring(n, radius, center, fn)
		local c = BW.v3(center or { 0, 0, 0 })
		local out = {}
		for i = 0, n - 1 do
			local a = (i / n) * 2 * math.pi
			table.insert(out, fn(i, Vector3.new(c.X + math.cos(a) * radius, c.Y, c.Z + math.sin(a) * radius), math.deg(a)) or false)
		end
		return out
	end

	-- Fence / railing along a line: posts every spacing studs + horizontal rails.
	function BW.fence(a, b, opts)
		opts = opts or {}
		local A, B = p3(a, opts.y), p3(b, opts.y)
		local h, sp, post, rails = opts.height or 4, opts.spacing or 4, opts.post or 0.6, opts.rails or 2
		local dx, dz = B.X - A.X, B.Z - A.Z
		local len = math.sqrt(dx * dx + dz * dz)
		if len < 0.5 then fail("fence is too short") end
		local ux, uz = dx / len, dz / len
		local yaw = math.deg(math.atan2(-uz, ux))
		local m = group(opts.Name or "Fence", opts)
		local count = math.max(1, math.floor(len / sp + 0.5))
		for i = 0, count do
			local s = len * i / count
			BW.part(look(opts, { Name = "Post", Size = { post, h, post }, Position = { A.X + ux * s, A.Y + h / 2, A.Z + uz * s }, Parent = m }))
		end
		for r = 1, rails do
			local y = A.Y + h * r / (rails + 1)
			BW.part(look(opts, { Name = "Rail", Size = { len, 0.3, 0.3 }, Position = { A.X + ux * len / 2, y, A.Z + uz * len / 2 }, Orientation = { 0, yaw, 0 }, Parent = m }))
		end
		return m
	end

	-- Ready-made tree/plant. style "oak" | "pine" | "palm" | "bush".
	function BW.plant(opts)
		local at = BW.v3(opts.At or { 0, 0, 0 })
		local style, H = opts.style or "oak", opts.height or 12
		local m = group(opts.Name or "Tree", opts)
		local bark = { Color = opts.TrunkColor or "#6B4A2B", Material = "Wood" }
		local leaf = { Color = opts.LeafColor or (style == "pine" and "#2F6B3A" or "#4C9A3F"), Material = opts.LeafMaterial or "Grass" }
		local function ball(name, d, pos)
			BW.part{ Name = name, Shape = "Ball", Size = { d, d, d }, Position = pos, Color = leaf.Color, Material = leaf.Material, Parent = m }
		end
		if style == "bush" then
			ball("Bush", H * 0.5, { at.X, at.Y + H * 0.2, at.Z })
			ball("Bush", H * 0.35, { at.X + H * 0.2, at.Y + H * 0.15, at.Z + H * 0.1 })
			return m
		end
		local trunkH = style == "pine" and H * 0.35 or (style == "palm" and H * 0.9 or H * 0.55)
		BW.cylinder{ Name = "Trunk", At = at, height = trunkH, diameter = math.max(0.6, H * (style == "palm" and 0.06 or 0.1)), Color = bark.Color, Material = bark.Material, Parent = m }
		if style == "oak" then
			ball("Leaves", H * 0.55, { at.X, at.Y + trunkH + H * 0.12, at.Z })
			ball("Leaves", H * 0.4, { at.X + H * 0.2, at.Y + trunkH, at.Z + H * 0.05 })
			ball("Leaves", H * 0.4, { at.X - H * 0.18, at.Y + trunkH - H * 0.02, at.Z - H * 0.08 })
		elseif style == "pine" then
			local tiers = 4
			for i = 1, tiers do
				local w = H * 0.55 * (1 - (i - 1) / tiers)
				local y = at.Y + trunkH * 0.7 + (i - 1) * H * 0.17
				BW.part{ Name = "Needles" .. i, Size = { w, H * 0.2, w }, Position = { at.X, y + H * 0.1, at.Z }, Orientation = { 0, (i % 2) * 45, 0 }, Color = leaf.Color, Material = leaf.Material, Parent = m }
			end
		elseif style == "palm" then
			for i = 0, 4 do
				local a = i * 72
				local r = math.rad(a)
				BW.part{ Name = "Frond", Size = { H * 0.45, 0.3, 1.6 }, Position = { at.X + math.cos(r) * H * 0.2, at.Y + trunkH - 0.3, at.Z - math.sin(r) * H * 0.2 }, Orientation = { 0, a, -18 }, Color = leaf.Color, Material = leaf.Material, Parent = m }
			end
		else
			fail("tree style must be oak, pine, palm or bush")
		end
		return m
	end

	-- Coherent colour/material sets. BW.palette("medieval").wall etc.
	local PALETTES = {
		medieval = { wall = "#C9B79C", wallMat = "Cobblestone", trim = "#5B3A1E", trimMat = "Wood", roof = "#7A2E1F", roofMat = "Slate", floor = "#8B6A43", floorMat = "WoodPlanks", accent = "#D9A441", glass = "#9FC6D9" },
		modern = { wall = "#EDEDED", wallMat = "SmoothPlastic", trim = "#2B2B2B", trimMat = "Metal", roof = "#3A3A3A", roofMat = "Concrete", floor = "#B08D68", floorMat = "WoodPlanks", accent = "#2F80ED", glass = "#BFE3FF" },
		scifi = { wall = "#1E2430", wallMat = "Metal", trim = "#00E5FF", trimMat = "Neon", roof = "#2C3444", roofMat = "DiamondPlate", floor = "#2A2F3A", floorMat = "DiamondPlate", accent = "#FF3DCB", glass = "#66E0FF" },
		nature = { wall = "#8A6A4A", wallMat = "Wood", trim = "#4E3624", trimMat = "Wood", roof = "#4C7A3A", roofMat = "Grass", floor = "#7A5C3E", floorMat = "WoodPlanks", accent = "#E8C15A", glass = "#BFE8D0" },
		desert = { wall = "#D8B583", wallMat = "Sandstone", trim = "#9C6B3C", trimMat = "Wood", roof = "#C69C6D", roofMat = "Sandstone", floor = "#C9A36B", floorMat = "Sand", accent = "#2E8B9A", glass = "#A7D3E0" },
		snow = { wall = "#DCE6EE", wallMat = "Ice", trim = "#6F8FA8", trimMat = "Wood", roof = "#FFFFFF", roofMat = "Snow", floor = "#8C7A6B", floorMat = "WoodPlanks", accent = "#D9534F", glass = "#CDEBFF" },
		japanese = { wall = "#EFE6D2", wallMat = "SmoothPlastic", trim = "#3B2A20", trimMat = "Wood", roof = "#2F3B45", roofMat = "Slate", floor = "#B89B72", floorMat = "WoodPlanks", accent = "#B8312F", glass = "#F5F1E6" },
		candy = { wall = "#FFC6E0", wallMat = "SmoothPlastic", trim = "#FFFFFF", trimMat = "SmoothPlastic", roof = "#8FD3FF", roofMat = "SmoothPlastic", floor = "#FFF1A8", floorMat = "SmoothPlastic", accent = "#FF5DA2", glass = "#E0F7FF" },
	}
	function BW.palette(name)
		local p = PALETTES[name or "modern"]
		if not p then
			local k = {}
			for n in pairs(PALETTES) do table.insert(k, n) end
			table.sort(k)
			fail("unknown palette '" .. tostring(name) .. "' (" .. table.concat(k, ", ") .. ")")
		end
		return table.clone(p)
	end

	-- ---- placement + quality checks
	local function partsOf(target)
		local inst = BW.get(target)
		local list = {}
		if inst:IsA("BasePart") then table.insert(list, inst) end
		for _, d in ipairs(inst:GetDescendants()) do if d:IsA("BasePart") then table.insert(list, d) end end
		return inst, list
	end
	-- Part.Shape exists only on Part (WedgePart/MeshPart have none)
	local function shapeOf(p)
		local ok, sh = pcall(function() return p.Shape end)
		if ok and sh then return typeof(sh) == "EnumItem" and sh.Name or tostring(sh) end
		return p.ClassName
	end
	-- plain axis-aligned blocks (only these are checked for overlaps: balls/rotated decor overlap on purpose)
	local function flat(p)
		if p.ClassName ~= "Part" or shapeOf(p) ~= "Block" then return false end
		local ok, o = pcall(function() return p.Orientation end)
		return not ok or typeof(o) ~= "Vector3" or (math.abs(o.X) < 0.5 and math.abs(o.Z) < 0.5)
	end
	-- world-space AABB of a part (yaw-aware; other rotations → conservative)
	local function aabb(p)
		local pos, s = p.Position, p.Size
		local ok, o = pcall(function() return p.Orientation end)
		local ex, ey, ez = s.X / 2, s.Y / 2, s.Z / 2
		if ok and typeof(o) == "Vector3" then
			if math.abs(o.X) > 0.5 or math.abs(o.Z) > 0.5 then
				if shapeOf(p) == "Cylinder" then
					-- standing cylinder: length along Y
					if math.abs(math.abs(o.Z) - 90) < 1 and math.abs(o.X) < 1 then ex, ey, ez = s.Y / 2, s.X / 2, s.Z / 2
					else local r = math.max(ex, ey, ez) ex, ey, ez = r, r, r end
				elseif math.abs(math.abs(o.Z) - 90) < 1 and math.abs(o.X) < 1 then ex, ey = s.Y / 2, s.X / 2
				else local r = math.sqrt(ex * ex + ey * ey + ez * ez) ex, ey, ez = r, r, r end
			end
			local a = math.rad(o.Y)
			local c, sn = math.abs(math.cos(a)), math.abs(math.sin(a))
			ex, ez = c * ex + sn * ez, sn * ex + c * ez
		end
		return { pos.X - ex, pos.Y - ey, pos.Z - ez }, { pos.X + ex, pos.Y + ey, pos.Z + ez }
	end
	local function boundsOf(list)
		local lo, hi
		for _, p in ipairs(list) do
			local a, b = aabb(p)
			if not lo then lo, hi = a, b else for i = 1, 3 do lo[i] = math.min(lo[i], a[i]) hi[i] = math.max(hi[i], b[i]) end end
		end
		return lo, hi
	end
	local function groundY()
		local bp = workspace:FindFirstChild("Baseplate")
		if bp and bp:IsA("BasePart") then return bp.Position.Y + bp.Size.Y / 2 end
		return 0
	end
	BW.groundY = groundY
	-- Move by a delta {dx,dy,dz}.
	function BW.move(target, delta)
		local _, list = partsOf(target)
		local d = BW.v3(delta)
		for _, p in ipairs(list) do p.Position = Vector3.new(p.Position.X + d.X, p.Position.Y + d.Y, p.Position.Z + d.Z) end
		return #list
	end
	-- Put the bottom-center of the whole object at At={x,y,z}.
	function BW.place(target, at)
		local _, list = partsOf(target)
		local lo, hi = boundsOf(list)
		if not lo then fail("nothing to place: no parts") end
		local a = BW.v3(at)
		return BW.move(target, { a.X - (lo[1] + hi[1]) / 2, a.Y - lo[2], a.Z - (lo[3] + hi[3]) / 2 })
	end
	-- Drop/lift so the lowest point sits exactly on the ground (Baseplate top or y).
	function BW.ground(target, y)
		local _, list = partsOf(target)
		local lo = boundsOf(list)
		if not lo then fail("nothing to ground: no parts") end
		local gy = y or groundY()
		BW.move(target, { 0, gy - lo[2], 0 })
		return gy - lo[2]
	end
	-- Build QA: floating parts, parts below ground, heavy overlaps (z-fighting / duplicates), unanchored loose parts.
	function BW.inspect(target, opts)
		opts = opts or {}
		local inst, list = partsOf(target)
		local gy = opts.ground or groundY()
		local n = #list
		local boxes = {}
		for i, p in ipairs(list) do local a, b = aabb(p) boxes[i] = { a, b } end
		local floating, buried, overlaps, loose = {}, {}, {}, {}
		local tol = opts.tolerance or 0.15
		if n <= (opts.maxParts or 1500) then
			for i = 1, n do
				local a, b = boxes[i][1], boxes[i][2]
				if a[2] < gy - 0.5 then table.insert(buried, list[i].Name) end
				if a[2] > gy + tol then
					-- supported = touches (within tol) another part that reaches lower than this part's bottom
					local supported = false
					for j = 1, n do
						if j ~= i then
							local c, e = boxes[j][1], boxes[j][2]
							if c[2] < a[2] - 0.01 and c[1] <= b[1] + tol and e[1] >= a[1] - tol and c[2] <= b[2] + tol and e[2] >= a[2] - tol and c[3] <= b[3] + tol and e[3] >= a[3] - tol then supported = true break end
						end
					end
					if not supported then table.insert(floating, list[i].Name .. string.format("@y%.1f", a[2])) end
				end
				for j = i + 1, n do
					local c, e = boxes[j][1], boxes[j][2]
					local ix = math.min(b[1], e[1]) - math.max(a[1], c[1])
					local iy = math.min(b[2], e[2]) - math.max(a[2], c[2])
					local iz = math.min(b[3], e[3]) - math.max(a[3], c[3])
					if ix > 0.05 and iy > 0.05 and iz > 0.05 then
						local v = ix * iy * iz
						local va = (b[1] - a[1]) * (b[2] - a[2]) * (b[3] - a[3])
						local vb = (e[1] - c[1]) * (e[2] - c[2]) * (e[3] - c[3])
						if v > 0.6 * math.min(va, vb) and flat(list[i]) and flat(list[j]) then table.insert(overlaps, list[i].Name .. "+" .. list[j].Name) end
					end
				end
				if not list[i].Anchored then
					local welded = false
					for _, c in ipairs(list[i]:GetChildren()) do if c.ClassName == "WeldConstraint" or c.ClassName == "Weld" or c.ClassName == "Motor6D" then welded = true end end
					if not welded and list[i].Name ~= "Handle" then table.insert(loose, list[i].Name) end
				end
			end
		end
		local lo, hi = boundsOf(list)
		local f = function(x) return string.format("%.1f", x) end
		local function few(t) local s = {} for k = 1, math.min(8, #t) do s[k] = t[k] end return table.concat(s, ", ") .. (#t > 8 and (" …+" .. (#t - 8)) or "") end
		local line = "BW_INSPECT " .. inst:GetFullName() .. " parts=" .. n
		if lo then line = line .. " size=(" .. f(hi[1] - lo[1]) .. "," .. f(hi[2] - lo[2]) .. "," .. f(hi[3] - lo[3]) .. ") minY=" .. f(lo[2]) .. " ground=" .. f(gy) end
		line = line .. " floating=" .. #floating .. " buried=" .. #buried .. " overlaps=" .. #overlaps .. " loose=" .. #loose
		if #floating > 0 then line = line .. "\n  floating: " .. few(floating) end
		if #buried > 0 then line = line .. "\n  below ground: " .. few(buried) end
		if #overlaps > 0 then line = line .. "\n  overlapping (z-fighting/duplicates): " .. few(overlaps) end
		if #loose > 0 then line = line .. "\n  unanchored & unwelded (will fall): " .. few(loose) end
		if n > 1500 then line = line .. "\n  (too many parts for the full check)" end
		local ok = #floating == 0 and #buried == 0 and #overlaps == 0 and #loose == 0
		print(line .. (ok and "\n  OK: build looks clean" or ""))
		return { parts = n, floating = floating, buried = buried, overlaps = overlaps, loose = loose, ok = ok }
	end

	-- ------------------------------------------------------------ inspection / verification
	function BW.report(target)
		local inst = BW.get(target or workspace)
		local counts, parts, n = {}, 0, 0
		local minV, maxV
		for _, d in ipairs(inst:GetDescendants()) do
			n = n + 1
			counts[d.ClassName] = (counts[d.ClassName] or 0) + 1
			if d:IsA("BasePart") then
				parts = parts + 1
				local p, s = d.Position, d.Size
				local lo = { p.X - s.X / 2, p.Y - s.Y / 2, p.Z - s.Z / 2 }
				local hi = { p.X + s.X / 2, p.Y + s.Y / 2, p.Z + s.Z / 2 }
				if not minV then minV, maxV = lo, hi else
					for i = 1, 3 do minV[i] = math.min(minV[i], lo[i]) maxV[i] = math.max(maxV[i], hi[i]) end
				end
			end
		end
		local cls = {}
		for c, k in pairs(counts) do table.insert(cls, c .. "=" .. k) end
		table.sort(cls)
		local line = "BW_REPORT " .. inst:GetFullName() .. " [" .. inst.ClassName .. "] descendants=" .. n .. " parts=" .. parts .. " {" .. table.concat(cls, ",") .. "}"
		if minV then
			local f = function(x) return string.format("%.1f", x) end
			line = line .. " size=(" .. f(maxV[1] - minV[1]) .. "," .. f(maxV[2] - minV[2]) .. "," .. f(maxV[3] - minV[3]) .. ") minY=" .. f(minV[2])
		end
		print(line)
		return n
	end
	function BW.tree(target, depth)
		local inst = BW.get(target or workspace)
		depth = depth or 2
		local out = {}
		local function walk(i, d, pad)
			table.insert(out, pad .. i.Name .. " [" .. i.ClassName .. "]")
			if d >= depth then
				local k = #i:GetChildren()
				if k > 0 then table.insert(out, pad .. "  … " .. k .. " children") end
				return
			end
			local kids = i:GetChildren()
			for idx, c in ipairs(kids) do
				if idx > 60 then table.insert(out, pad .. "  … " .. (#kids - 60) .. " more") break end
				walk(c, d + 1, pad .. "  ")
			end
		end
		walk(inst, 0, "")
		print(table.concat(out, "\n"))
	end
	function BW.check(cond, msg)
		print((cond and "BW_CHECK OK " or "BW_CHECK FAIL ") .. tostring(msg))
		return cond and true or false
	end

	-- ------------------------------------------------------------ scripting
	local DEFAULT_PARENT = { Script = "ServerScriptService", LocalScript = "StarterPlayer.StarterPlayerScripts", ModuleScript = "ReplicatedStorage" }
	local function setSource(s, src)
		local ok = pcall(function() s.Source = src end)
		if not ok then
			local ok2, err = pcall(function() svc("ScriptEditorService"):UpdateSourceAsync(s, function() return src end) end)
			if not ok2 then fail("cannot write Source of " .. s:GetFullName() .. ": " .. tostring(err)) end
		end
	end
	-- Create or update a script. kind = "Script" | "LocalScript" | "ModuleScript".
	function BW.script(kind, name, parent, source)
		if not DEFAULT_PARENT[kind] then fail("script kind must be Script, LocalScript or ModuleScript (got " .. tostring(kind) .. ")") end
		if type(source) ~= "string" then fail("BW.script needs the source code as a string (use [==[ ... ]==])") end
		parent = BW.get(parent or DEFAULT_PARENT[kind])
		local s = parent:FindFirstChild(name)
		local action = "updated"
		if s and s.ClassName ~= kind then fail(s:GetFullName() .. " exists but is a " .. s.ClassName .. ", not a " .. kind) end
		if not s then
			s = Instance.new(kind)
			s.Name = name
			s:SetAttribute("BW_Owned", true)
			s.Parent = parent
			action = "created"
		end
		setSource(s, source)
		local lines = select(2, string.gsub(source, "\n", "\n")) + 1
		print("BW_SCRIPT " .. action .. " " .. s:GetFullName() .. " [" .. kind .. "] lines=" .. lines)
		return s
	end
	-- Print a script's source with line numbers (read before editing).
	function BW.source(path, from, to)
		local s = BW.get(path)
		if not s:IsA("LuaSourceContainer") then fail(s:GetFullName() .. " is not a script") end
		local out, i = {}, 0
		from, to = from or 1, to or math.huge
		for line in string.gmatch(s.Source .. "\n", "(.-)\n") do
			i = i + 1
			if i >= from and i <= to then table.insert(out, string.format("%4d| %s", i, line)) end
		end
		print("BW_SOURCE " .. s:GetFullName() .. " (" .. i .. " lines)\n" .. table.concat(out, "\n"))
	end
	-- Plain-text find/replace inside a script (no patterns). Fails if the text is not found.
	function BW.patch(path, find, replace, maxCount)
		local s = BW.get(path)
		local src = s.Source
		local out, count, pos = {}, 0, 1
		while true do
			local a, b = string.find(src, find, pos, true)
			if not a or (maxCount and count >= maxCount) then break end
			table.insert(out, string.sub(src, pos, a - 1))
			table.insert(out, replace)
			pos = b + 1
			count = count + 1
		end
		if count == 0 then fail("patch: text not found in " .. s:GetFullName() .. ": " .. string.sub(find, 1, 80)) end
		table.insert(out, string.sub(src, pos))
		setSource(s, table.concat(out))
		print("BW_PATCH " .. s:GetFullName() .. " replaced " .. count .. "x")
		return count
	end
	-- Search all scripts for text (plain). Prints path:line: text.
	function BW.scan(text, limit)
		limit = limit or 40
		local hits = 0
		for _, d in ipairs(game:GetDescendants()) do
			if d:IsA("LuaSourceContainer") then
				local ok, src = pcall(function() return d.Source end)
				if ok and src then
					local i = 0
					for line in string.gmatch(src .. "\n", "(.-)\n") do
						i = i + 1
						if string.find(line, text, 1, true) then
							hits = hits + 1
							if hits <= limit then print("BW_SCAN " .. d:GetFullName() .. ":" .. i .. ": " .. string.sub(line, 1, 160)) end
						end
					end
				end
			end
		end
		print("BW_SCAN total=" .. hits)
		return hits
	end
	-- RemoteEvent / RemoteFunction in ReplicatedStorage.Remotes (reused if it exists).
	function BW.remote(name, class)
		class = class or "RemoteEvent"
		local f = BW.folder("Remotes", svc("ReplicatedStorage"))
		local r = f:FindFirstChild(name)
		if r then return r end
		return BW.new(class, { Name = name, Parent = f })
	end

	-- ------------------------------------------------------------ UI
	function BW.screen(name, props)
		local sg = svc("StarterGui")
		owned(sg, name, props and props.replace, "ScreenGui")
		local g = Instance.new("ScreenGui")
		g.Name = name
		g.ResetOnSpawn = false
		pcall(function() g.ZIndexBehavior = "Sibling" end)
		g:SetAttribute("BW_Owned", true)
		if props then local p = table.clone(props) p.replace = nil BW.set(g, p) end
		g.Parent = sg
		return g
	end
	function BW.ui(className, props)
		props = props or {}
		if props.Parent == nil then fail("BW.ui needs Parent (a ScreenGui or Frame)") end
		if (className == "TextLabel" or className == "TextButton" or className == "TextBox") then
			if props.Font == nil then props.Font = "GothamMedium" end
			if props.TextColor3 == nil then props.TextColor3 = "#FFFFFF" end
			if props.BackgroundTransparency == nil and className == "TextLabel" then props.BackgroundTransparency = 1 end
		end
		return BW.new(className, props)
	end

	-- ------------------------------------------------------------ VFX
	local TEX = { fire = "rbxasset://textures/particles/fire_main.dds", smoke = "rbxasset://textures/particles/smoke_main.dds", sparkles = "rbxasset://textures/particles/sparkles_main.dds" }
	local PRESETS = {
		fire = { Texture = TEX.fire, Color = { "#FFB43C", "#FF3C14" }, LightEmission = 1, Size = { 1.6, 0.2 }, Transparency = { 0.1, 1 }, Lifetime = { 0.6, 1.1 }, Rate = 45, Speed = { 3, 6 }, SpreadAngle = Vector2.new(12, 12) },
		smoke = { Texture = TEX.smoke, Color = "#5A5A5A", Size = { 2, 6 }, Transparency = { 0.4, 1 }, Lifetime = { 3, 5 }, Rate = 8, Speed = { 1, 2 }, SpreadAngle = Vector2.new(20, 20) },
		sparkles = { Texture = TEX.sparkles, Color = "#FFF5B4", LightEmission = 1, Size = { 0.4, 0 }, Lifetime = { 0.5, 1 }, Rate = 25, Speed = { 2, 4 }, SpreadAngle = Vector2.new(180, 180) },
		magic = { Texture = TEX.sparkles, Color = { "#B46CFF", "#3CC8FF" }, LightEmission = 1, Size = { 0.8, 0 }, Transparency = { 0, 1 }, Lifetime = { 1, 1.6 }, Rate = 30, Speed = { 0.5, 1.5 }, SpreadAngle = Vector2.new(180, 180) },
		dust = { Texture = TEX.smoke, Color = "#C8B48C", Size = { 0.5, 2 }, Transparency = { 0.5, 1 }, Lifetime = { 1, 2 }, Rate = 10, Speed = { 0.5, 1 }, SpreadAngle = Vector2.new(60, 60) },
	}
	function BW.particles(parent, preset, overrides)
		parent = BW.get(parent)
		local base = PRESETS[preset or "sparkles"]
		if not base then fail("unknown particle preset '" .. tostring(preset) .. "' (fire, smoke, sparkles, magic, dust)") end
		local props = table.clone(base)
		for k, v in pairs(overrides or {}) do props[k] = v end
		props.Name = props.Name or ((preset or "sparkles") .. "FX")
		props.Parent = parent
		return BW.new("ParticleEmitter", props)
	end
	function BW.light(parent, kind, props)
		props = props and table.clone(props) or {}
		props.Parent = BW.get(parent)
		if props.Brightness == nil then props.Brightness = 2 end
		if props.Range == nil then props.Range = 12 end
		return BW.new(kind or "PointLight", props)
	end

	-- ------------------------------------------------------------ gameplay templates
	function BW.leaderstats(stats)
		local lines = { "-- Brickwire: leaderstats", "local Players = game:GetService(\"Players\")", "Players.PlayerAdded:Connect(function(player)", "\tlocal ls = Instance.new(\"Folder\")", "\tls.Name = \"leaderstats\"", "\tls.Parent = player" }
		local names = {}
		for k, v in pairs(stats) do
			local name, start = (type(k) == "number") and v or k, (type(k) == "number") and 0 or v
			table.insert(names, name)
			table.insert(lines, string.format("\tlocal v_%s = Instance.new(\"IntValue\")\n\tv_%s.Name = %q\n\tv_%s.Value = %d\n\tv_%s.Parent = ls", name, name, name, name, start, name))
		end
		table.insert(lines, "end)")
		return BW.script("Script", "Leaderstats", "ServerScriptService", table.concat(lines, "\n"))
	end
	-- A part that kills (or damages) players on touch.
	function BW.killPart(part, damage)
		part = BW.get(part)
		local src = "local part = script.Parent\nlocal DAMAGE = " .. tostring(damage or "math.huge") .. "\nlocal debounce = {}\npart.Touched:Connect(function(hit)\n\tlocal hum = hit.Parent and hit.Parent:FindFirstChildOfClass(\"Humanoid\")\n\tif hum and not debounce[hum] then\n\t\tdebounce[hum] = true\n\t\thum:TakeDamage(DAMAGE)\n\t\ttask.wait(0.5)\n\t\tdebounce[hum] = nil\n\tend\nend)"
		return BW.script("Script", "KillScript", part, src)
	end

	-- ------------------------------------------------------------ animation (objects + characters)
	-- Embed a Luau value as source text (numbers, strings, booleans, Vector3, tables).
	local function lit(v)
		local t = typeof(v)
		if t == "number" or t == "boolean" or t == "nil" then return tostring(v) end
		if t == "string" then return string.format("%q", v) end
		if t == "Vector3" then return "Vector3.new(" .. v.X .. ", " .. v.Y .. ", " .. v.Z .. ")" end
		if t == "table" then
			local parts = {}
			for k, x in pairs(v) do table.insert(parts, "[" .. lit(k) .. "] = " .. lit(x)) end
			table.sort(parts)
			return "{" .. table.concat(parts, ", ") .. "}"
		end
		fail("cannot embed a " .. t .. " value in generated code")
	end
	BW.lit = lit
	-- Roblox's own default animations (public, play in every game).
	local ANIM_IDS = {
		R15 = { idle = 507766666, walk = 507777826, run = 507767714, jump = 507765000, fall = 507767968, climb = 507765644, swim = 507784897, wave = 507770239, point = 507770453, dance = 507771019, dance2 = 507776043, dance3 = 507777268, laugh = 507770818, cheer = 507770677, slash = 522635514, lunge = 522638767 },
		R6 = { idle = 180435571, walk = 180426354, run = 180426354, jump = 125750702, fall = 180436148, climb = 180436334, swim = 180426354, wave = 128777973, point = 128853357, dance = 182435998, dance2 = 182436842, dance3 = 182436935, laugh = 129423131, cheer = 129423030, slash = 129967390, lunge = 129967478 },
	}
	BW.ANIMS = ANIM_IDS
	local function presetList()
		local t = {}
		for k in pairs(ANIM_IDS.R15) do table.insert(t, k) end
		table.sort(t)
		return table.concat(t, ", ")
	end
	local function animId(a)
		if type(a) == "number" then return "rbxassetid://" .. a end
		if type(a) == "string" and string.match(a, "^rbxassetid://%d+$") then return a end
		if type(a) == "string" and string.match(a, "^%d+$") then return "rbxassetid://" .. a end
		return nil
	end

	-- Looping motion of a part or model, driven by a server Script inside it.
	local MOTION = {
		spin = { speed = 90, axis = "Y" }, bob = { height = 1, period = 2 }, hover = { height = 0.5, period = 3, speed = 45 },
		swing = { angle = 30, period = 2, axis = "X" }, wobble = { angle = 8, period = 1.5, axis = "Z" },
		slide = { offset = { 0, 0, 8 }, period = 4 }, pulse = { scale = 1.2, period = 1 }, blink = { period = 1 },
	}
	local MOTION_SRC = [==[
local RunService = game:GetService("RunService")
local target = script.Parent
local base = target:GetPivot()
local isPart = target:IsA("BasePart")
local baseSize = isPart and target.Size or nil
local baseTr = isPart and target.Transparency or 0
local AX = { X = Vector3.new(1, 0, 0), Y = Vector3.new(0, 1, 0), Z = Vector3.new(0, 0, 1) }
local axis = AX[string.upper(tostring(CFG.axis or "Y"))] or AX.Y
local hinge = CFrame.new(CFG.hinge or Vector3.new(0, 0, 0))
local w = 2 * math.pi / (CFG.period or 2)
local t0 = os.clock()
local function around(rot) return base * hinge * rot * hinge:Inverse() end
RunService.Heartbeat:Connect(function()
	local t = (os.clock() - t0) * (CFG.timeScale or 1)
	local p = CFG.preset
	if p == "spin" then
		target:PivotTo(around(CFrame.fromAxisAngle(axis, math.rad(CFG.speed * t))))
	elseif p == "bob" then
		target:PivotTo(base + Vector3.new(0, math.sin(w * t) * CFG.height, 0))
	elseif p == "hover" then
		target:PivotTo((base + Vector3.new(0, math.sin(w * t) * CFG.height, 0)) * CFrame.Angles(0, math.rad(CFG.speed * t), 0))
	elseif p == "swing" or p == "wobble" then
		target:PivotTo(around(CFrame.fromAxisAngle(axis, math.rad(CFG.angle) * math.sin(w * t))))
	elseif p == "slide" then
		target:PivotTo(base + CFG.offset * ((1 - math.cos(w * t)) / 2))
	elseif p == "pulse" then
		target.Size = baseSize * (1 + (CFG.scale - 1) * (1 + math.sin(w * t)) / 2)
	elseif p == "blink" then
		target.Transparency = (math.sin(w * t) >= 0) and baseTr or 1
	end
end)
]==]
	function BW.animate(target, preset, opts)
		target = BW.get(target)
		if not (target:IsA("BasePart") or target:IsA("Model")) then fail("BW.animate needs a BasePart or Model (got " .. target.ClassName .. " " .. target:GetFullName() .. ")") end
		local base = MOTION[preset]
		if not base then fail("unknown motion '" .. tostring(preset) .. "' (spin, bob, hover, swing, wobble, slide, pulse, blink)") end
		if (preset == "pulse" or preset == "blink") and not target:IsA("BasePart") then fail(preset .. " works on a BasePart, not on a Model — animate a part of it") end
		local cfg = table.clone(base)
		for k, v in pairs(opts or {}) do cfg[k] = v end
		if cfg.offset then cfg.offset = BW.v3(cfg.offset) end
		if cfg.hinge then cfg.hinge = BW.v3(cfg.hinge) end
		cfg.preset = preset
		-- anchored, otherwise physics fights the motion
		if target:IsA("BasePart") then target.Anchored = true end
		for _, d in ipairs(target:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = true end end
		for _, c in ipairs(target:GetChildren()) do
			if c:IsA("Script") and string.sub(c.Name, 1, 8) == "BW_Anim_" and c.Name ~= "BW_Anim_" .. preset then c:Destroy() end
		end
		return BW.script("Script", "BW_Anim_" .. preset, target, "-- Brickwire motion: " .. preset .. " (edit CFG to tune)\nlocal CFG = " .. lit(cfg) .. "\n" .. MOTION_SRC)
	end

	-- Door (or gate/hatch) that opens with a ProximityPrompt: swings on a hinge or slides.
	local DOOR_SRC = [==[
local TweenService = game:GetService("TweenService")
local door = script.Parent
local closed = door.CFrame
local open
if CFG.mode == "slide" then
	open = closed + closed:VectorToWorldSpace(CFG.offset)
else
	local hx = door.Size.X / 2 * (CFG.hinge == "right" and 1 or -1)
	local hingeCF = closed * CFrame.new(hx, 0, 0)
	open = hingeCF * CFrame.Angles(0, math.rad(CFG.angle), 0) * hingeCF:ToObjectSpace(closed)
end
local info = TweenInfo.new(CFG.time, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local isOpen = false
local prompt = door:FindFirstChildOfClass("ProximityPrompt") or Instance.new("ProximityPrompt")
prompt.ActionText = "Open"
prompt.ObjectText = door.Name
prompt.HoldDuration = 0
prompt.MaxActivationDistance = 10
prompt.Parent = door
local function set(o)
	isOpen = o
	prompt.ActionText = o and "Close" or "Open"
	TweenService:Create(door, info, { CFrame = o and open or closed }):Play()
end
prompt.Triggered:Connect(function()
	set(not isOpen)
	if isOpen and CFG.autoClose then
		task.delay(CFG.autoClose, function() if isOpen then set(false) end end)
	end
end)
]==]
	function BW.door(part, opts)
		part = BW.get(part)
		if not part:IsA("BasePart") then fail("BW.door needs a BasePart (the door panel), got " .. part.ClassName) end
		opts = opts or {}
		local cfg = { mode = opts.mode or "swing", angle = opts.angle or 90, hinge = opts.hinge or "left", time = opts.time or 0.6, autoClose = opts.autoClose or false, offset = BW.v3(opts.offset or { -part.Size.X, 0, 0 }) }
		if cfg.mode ~= "swing" and cfg.mode ~= "slide" then fail("door mode must be swing or slide") end
		part.Anchored = true
		return BW.script("Script", "BW_Door", part, "-- Brickwire door (edit CFG to tune)\nlocal CFG = " .. lit(cfg) .. "\n" .. DOOR_SRC)
	end

	-- ---- characters / rigs
	local function jointMap(rig)
		local parentOf = {}
		for _, m in ipairs(rig:GetDescendants()) do
			if m:IsA("Motor6D") and m.Part0 and m.Part1 then parentOf[m.Part1.Name] = m.Part0.Name end
		end
		return parentOf
	end
	-- List the animatable joints (part names) of a rig: these are the names BW.keyframes accepts.
	function BW.joints(rig, quiet)
		rig = BW.get(rig)
		local parentOf = jointMap(rig)
		local names, desc = {}, {}
		for k, p in pairs(parentOf) do table.insert(names, k) end
		table.sort(names)
		for _, k in ipairs(names) do table.insert(desc, k .. "<" .. parentOf[k]) end
		local hum = rig:FindFirstChildOfClass("Humanoid")
		if not quiet then print("BW_JOINTS " .. rig:GetFullName() .. " rig=" .. (hum and hum.RigType.Name or "custom") .. " joints=" .. #names .. ": " .. table.concat(desc, ", ")) end
		return names
	end
	-- A humanoid character (NPC / animation dummy). type "R15" (default) or "R6".
	function BW.rig(name, opts)
		opts = opts or {}
		local parent = opts.Parent and BW.get(opts.Parent) or workspace
		owned(parent, name, opts.replace, "Rig")
		local rigType = opts.type == "R6" and Enum.HumanoidRigType.R6 or Enum.HumanoidRigType.R15
		local desc = Instance.new("HumanoidDescription")
		for k, v in pairs(opts.description or {}) do
			local val = (string.match(k, "Color$") and typeof(v) ~= "Color3") and BW.color(v) or v
			local ok, err = pcall(function() desc[k] = val end)
			if not ok then fail("HumanoidDescription." .. k .. ": " .. tostring(err)) end
		end
		local ok, rig = pcall(function() return svc("Players"):CreateHumanoidModelFromDescription(desc, rigType) end)
		if not ok or not rig then fail("could not build a rig (" .. tostring(rig) .. ") — insert one with Avatar > Rig Builder and use its path instead") end
		rig.Name = name
		rig:SetAttribute("BW_Owned", true)
		local cf = CFrame.new(BW.v3(opts.Position or { 0, 3, 0 }))
		if opts.Facing then cf = cf * CFrame.Angles(0, math.rad(opts.Facing), 0) end
		rig:PivotTo(cf)
		local root = rig:FindFirstChild("HumanoidRootPart")
		if root then root.Anchored = opts.Anchored ~= false end
		local hum = rig:FindFirstChildOfClass("Humanoid")
		if hum and opts.DisplayName then hum.DisplayName = opts.DisplayName end
		rig.Parent = parent
		print("BW_RIG " .. rig:GetFullName() .. " " .. rigType.Name .. " joints=" .. #BW.joints(rig, true))
		return rig
	end
	-- Author a keyframe animation for a rig. frames = {{time=0, poses={RightUpperArm={x,y,z}}}, {time=0.4, poses={...}}, ...}
	-- A pose is rotation in degrees {x,y,z} or {rot={x,y,z}, pos={x,y,z}, easing="Cubic"}. Saved to ServerStorage.BrickwireAnimations.
	function BW.keyframes(rig, name, frames, opts)
		rig = BW.get(rig)
		opts = opts or {}
		local parentOf = jointMap(rig)
		if next(parentOf) == nil then fail(rig:GetFullName() .. " has no Motor6D joints — it is not an animatable rig") end
		if type(frames) ~= "table" or #frames < 2 then fail("BW.keyframes needs at least 2 frames: {{time=0, poses={...}}, {time=0.5, poses={...}}}") end
		local folder = BW.folder("BrickwireAnimations", "ServerStorage")
		owned(folder, name, opts.replace, "Animation")
		local kfs = Instance.new("KeyframeSequence")
		kfs.Name = name
		kfs:SetAttribute("BW_Owned", true)
		kfs:SetAttribute("BW_Rig", rig:GetFullName())
		kfs.Loop = opts.loop == true
		local okP = pcall(function() kfs.Priority = Enum.AnimationPriority[opts.priority or "Action"] end)
		if not okP then fail("priority must be Idle, Movement, Action, Action2, Action3 or Action4") end
		local last = -1
		for i, f in ipairs(frames) do
			local t = f.time or f.t
			if type(t) ~= "number" or t <= last then fail("frame " .. i .. ": time must be a number greater than the previous frame's time") end
			last = t
			local kf = Instance.new("Keyframe")
			kf.Name = "KF" .. i
			kf.Time = t
			local poses = {}
			local function poseFor(partName)
				if poses[partName] then return poses[partName] end
				local p = Instance.new("Pose")
				p.Name = partName
				p.CFrame = CFrame.new()
				local par = parentOf[partName]
				p.Parent = par and poseFor(par) or kf
				poses[partName] = p
				return p
			end
			for part, spec in pairs(f.poses or f.pose or {}) do
				if not parentOf[part] then fail("frame " .. i .. ": '" .. tostring(part) .. "' is not a joint of " .. rig.Name .. " — valid: " .. table.concat(BW.joints(rig, true), ", ")) end
				if type(spec) ~= "table" then fail("frame " .. i .. " " .. part .. ": pose must be {x,y,z} degrees or {rot={...}, pos={...}}") end
				local rot = spec.rot or ((spec.pos == nil) and spec or { 0, 0, 0 })
				local cf = CFrame.new(spec.pos and BW.v3(spec.pos) or Vector3.new(0, 0, 0)) * CFrame.Angles(math.rad(rot[1] or 0), math.rad(rot[2] or 0), math.rad(rot[3] or 0))
				local p = poseFor(part)
				p.CFrame = cf
				local easing = spec.easing or f.easing or opts.easing
				if easing then
					local okE = pcall(function() p.EasingStyle = Enum.PoseEasingStyle[easing] end)
					if not okE then fail("easing must be Linear, Constant, Cubic, Elastic or Bounce") end
				end
			end
			kf.Parent = kfs
		end
		kfs.Parent = folder
		print("BW_ANIM " .. kfs:GetFullName() .. " frames=" .. #frames .. " length=" .. last .. "s loop=" .. tostring(kfs.Loop) .. " — preview in play test via BW.playAnim; to publish: right-click it > Save to Roblox")
		return kfs
	end
	local PLAY_SRC = [==[
local rig = script.Parent
local hum = rig:FindFirstChildOfClass("Humanoid")
local owner = hum or rig:FindFirstChildOfClass("AnimationController")
local animator = owner:FindFirstChildOfClass("Animator") or Instance.new("Animator")
animator.Parent = owner
local id = CFG.id
if CFG.preset then
	local kind = (hum and hum.RigType == Enum.HumanoidRigType.R6) and "R6" or "R15"
	id = "rbxassetid://" .. ANIMS[kind][CFG.preset]
elseif CFG.sequence then
	local seq = game
	for seg in string.gmatch(CFG.sequence, "[^%.]+") do seq = seq and seq:FindFirstChild(seg) end
	if not seq then error("Brickwire: KeyframeSequence " .. CFG.sequence .. " not found") end
	local ok, res = pcall(function() return game:GetService("KeyframeSequenceProvider"):RegisterKeyframeSequence(seq) end)
	if not ok then error("Brickwire: " .. CFG.sequence .. " can only be previewed in Studio (" .. tostring(res) .. "). Publish it (right-click > Save to Roblox) and use the asset id.") end
	id = res
end
local anim = Instance.new("Animation")
anim.AnimationId = id
local track = animator:LoadAnimation(anim)
track.Looped = CFG.loop
track:Play(CFG.fade, 1, CFG.speed)
print("Brickwire: playing " .. tostring(id) .. " on " .. rig:GetFullName())
]==]
	local function animSource(anim, opts)
		local cfg = { loop = opts.loop ~= false, speed = opts.speed or 1, fade = opts.fade or 0.2 }
		local id = animId(anim)
		if id then cfg.id = id
		elseif type(anim) == "string" and ANIM_IDS.R15[anim] then cfg.preset = anim
		else
			local kfs = (typeof(anim) == "Instance" and anim) or BW.find(anim) or BW.find("ServerStorage.BrickwireAnimations." .. tostring(anim))
			if not kfs or not kfs:IsA("KeyframeSequence") then fail("unknown animation '" .. tostring(anim) .. "' — use a preset (" .. presetList() .. "), an asset id, or a KeyframeSequence made by BW.keyframes") end
			cfg.sequence = kfs:GetFullName()
		end
		return cfg
	end
	-- Play an animation on a rig/NPC (looped by default): preset name, asset id, or BW.keyframes result.
	function BW.playAnim(rig, anim, opts)
		rig = BW.get(rig)
		opts = opts or {}
		if not rig:FindFirstChildOfClass("Humanoid") and not rig:FindFirstChildOfClass("AnimationController") then
			fail(rig:GetFullName() .. " has no Humanoid or AnimationController — use BW.rig, or BW.new(\"AnimationController\", {Parent=model}) for a non-humanoid model")
		end
		local cfg = animSource(anim, opts)
		return BW.script("Script", opts.name or "BW_PlayAnim", rig, "-- Brickwire: play an animation on this rig\nlocal CFG = " .. lit(cfg) .. "\nlocal ANIMS = " .. lit(ANIM_IDS) .. "\n" .. PLAY_SRC)
	end
	-- NPC walks between points (positions or parts) with walk/idle animations.
	local PATROL_SRC = [==[
local npc = script.Parent
local hum = npc:FindFirstChildOfClass("Humanoid")
local animator = hum:FindFirstChildOfClass("Animator") or Instance.new("Animator")
animator.Parent = hum
local kind = hum.RigType == Enum.HumanoidRigType.R6 and "R6" or "R15"
local function load(n)
	local a = Instance.new("Animation")
	a.AnimationId = "rbxassetid://" .. ANIMS[kind][n]
	local t = animator:LoadAnimation(a)
	t.Looped = true
	return t
end
local walk, idle = load("walk"), load("idle")
hum.WalkSpeed = CFG.speed
idle:Play()
repeat
	for _, p in ipairs(CFG.points) do
		idle:Stop(0.2)
		walk:Play(0.2)
		walk:AdjustSpeed(CFG.speed / 16)
		hum:MoveTo(p)
		hum.MoveToFinished:Wait()
		walk:Stop(0.2)
		idle:Play(0.2)
		task.wait(CFG.pause)
	end
until not CFG.loop
]==]
	function BW.patrol(npc, points, opts)
		npc = BW.get(npc)
		opts = opts or {}
		if not npc:FindFirstChildOfClass("Humanoid") then fail(npc:GetFullName() .. " has no Humanoid — create the NPC with BW.rig") end
		if type(points) ~= "table" or #points < 1 then fail("BW.patrol needs a list of points: {{x,y,z}, {x,y,z}} or part paths") end
		local pts = {}
		for _, p in ipairs(points) do
			if typeof(p) == "Instance" or type(p) == "string" then table.insert(pts, BW.get(p):GetPivot().Position)
			else table.insert(pts, BW.v3(p)) end
		end
		for _, d in ipairs(npc:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = false end end
		local cfg = { points = pts, speed = opts.speed or 8, pause = opts.pause or 1, loop = opts.loop ~= false }
		return BW.script("Script", "BW_Patrol", npc, "-- Brickwire NPC patrol (edit CFG to tune)\nlocal CFG = " .. lit(cfg) .. "\nlocal ANIMS = " .. lit(ANIM_IDS) .. "\n" .. PATROL_SRC)
	end
	-- Replace the PLAYERS' default animations (walk/run/idle/jump/fall/climb/swim) with presets or asset ids.
	local PLAYER_SRC = [==[
local Players = game:GetService("Players")
local SLOTS = { idle = { "idle", { "Animation1", "Animation2" } }, walk = { "walk", { "WalkAnim" } }, run = { "run", { "RunAnim" } }, jump = { "jump", { "JumpAnim" } }, fall = { "fall", { "FallAnim" } }, climb = { "climb", { "ClimbAnim" } }, swim = { "swim", { "Swim" } } }
local function apply(char)
	local animate = char:WaitForChild("Animate", 10)
	if not animate then return end
	for slot, id in pairs(CFG) do
		local s = SLOTS[slot]
		local folder = s and animate:FindFirstChild(s[1])
		if folder then
			for _, n in ipairs(s[2]) do
				local a = folder:FindFirstChild(n)
				if a then a.AnimationId = id end
			end
		end
	end
end
local function onPlayer(p)
	p.CharacterAdded:Connect(apply)
	if p.Character then apply(p.Character) end
end
Players.PlayerAdded:Connect(onPlayer)
for _, p in ipairs(Players:GetPlayers()) do onPlayer(p) end
]==]
	function BW.playerAnims(map)
		if type(map) ~= "table" then fail("BW.playerAnims needs a table like {walk=\"run\", idle=507766666}") end
		local cfg = {}
		local okSlots = { idle = true, walk = true, run = true, jump = true, fall = true, climb = true, swim = true }
		for slot, a in pairs(map) do
			if not okSlots[slot] then fail("unknown slot '" .. tostring(slot) .. "' (idle, walk, run, jump, fall, climb, swim)") end
			local id = animId(a) or (type(a) == "string" and ANIM_IDS.R15[a] and "rbxassetid://" .. ANIM_IDS.R15[a])
			if not id then fail("slot " .. slot .. ": use an asset id or a preset (" .. presetList() .. ")") end
			cfg[slot] = id
		end
		return BW.script("Script", "BW_PlayerAnimations", "ServerScriptService", "-- Brickwire: custom player animations (R15 ids)\nlocal CFG = " .. lit(cfg) .. "\n" .. PLAYER_SRC)
	end
	-- Tool (item the player holds) that plays an animation on click: preset "slash"/"lunge"/…, asset id or BW.keyframes result.
	local TOOL_SRC = [==[
local tool = script.Parent
local track
tool.Equipped:Connect(function()
	local char = tool.Parent
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if not hum then return end
	local animator = hum:FindFirstChildOfClass("Animator") or Instance.new("Animator", hum)
	local id = CFG.id
	if CFG.preset then
		id = "rbxassetid://" .. ANIMS[hum.RigType == Enum.HumanoidRigType.R6 and "R6" or "R15"][CFG.preset]
	end
	local a = Instance.new("Animation")
	a.AnimationId = id
	track = animator:LoadAnimation(a)
	track.Priority = Enum.AnimationPriority.Action
end)
tool.Unequipped:Connect(function() if track then track:Stop() end track = nil end)
tool.Activated:Connect(function() if track then track:Play(0.1, 1, CFG.speed) end end)
]==]
	function BW.toolAnim(tool, anim, opts)
		tool = BW.get(tool)
		opts = opts or {}
		if not tool:IsA("Tool") then fail("BW.toolAnim needs a Tool (BW.new(\"Tool\", {Name=, Parent=\"StarterPack\"}) with a part named Handle)") end
		local cfg = animSource(anim or "slash", { speed = opts.speed })
		if cfg.sequence then fail("tools need a published animation id or a preset (" .. presetList() .. ")") end
		cfg.loop = nil
		return BW.script("LocalScript", "BW_ToolAnim", tool, "-- Brickwire: tool animation on click\nlocal CFG = " .. lit(cfg) .. "\nlocal ANIMS = " .. lit(ANIM_IDS) .. "\n" .. TOOL_SRC)
	end

	-- ------------------------------------------------------------ building kit v2 (1.6)
	-- internal helpers shared with the resource library (bw-library.luau)
	BW._group, BW._look, BW._aabb, BW._partsOf, BW._boundsOf, BW._p3 = group, look, aabb, partsOf, boundsOf, p3

	-- deterministic random (same seed → same layout; re-running a build gives the same result)
	function BW.rng(seed)
		local s = math.floor((seed or 1) * 9973) % 2147483647
		if s <= 0 then s = s + 2147483646 end
		return function(a, b)
			s = (s * 16807) % 2147483647
			local r = (s - 1) / 2147483646
			if a == nil then return r end
			if b == nil then return a * r end
			return a + (b - a) * r
		end
	end

	-- ASCII floor plan → building. One character = one cell (cell studs, default 2):
	--   "#" wall   "D" door (opening 7 high)   "W" window (glass, sill 3)   "." floor   " " nothing
	-- Row 1 is the BACK (-Z) side, columns run along +X. Walls are full cells, merged into long runs.
	-- BW.floorplan({"#####", "#...#", "##D##"}, {At={x,y,z} (center), cell=2, height=10, palette="modern", ceiling=false})
	function BW.floorplan(rows, opts)
		opts = opts or {}
		if type(rows) == "string" then
			local t = {}
			for line in string.gmatch(rows, "[^\n]+") do table.insert(t, line) end
			rows = t
		end
		if type(rows) ~= "table" or #rows == 0 then fail("floorplan needs rows like {\"#####\", \"#...#\", \"##D##\"}") end
		local cell, h = opts.cell or 2, opts.height or 10
		local pal = opts.palette and BW.palette(opts.palette) or {}
		local wallC, wallM = opts.Color or pal.wall, opts.Material or pal.wallMat
		local floorC, floorM = opts.FloorColor or pal.floor, opts.FloorMaterial or pal.floorMat
		local glassC = opts.GlassColor or pal.glass or "#A8D8FF"
		local W = 0
		for _, r in ipairs(rows) do W = math.max(W, #r) end
		local D = #rows
		local at = BW.v3(opts.At or { 0, 0, 0 })
		local x0, z0 = at.X - W * cell / 2, at.Z - D * cell / 2
		local m = group(opts.Name or "Floorplan", opts)
		local fl = at.Y
		local doorH, sill, winH = opts.doorHeight or 7, opts.sill or 3, opts.windowHeight or 4
		local counts = { wall = 0, door = 0, window = 0 }
		for zi, row in ipairs(rows) do
			local zA, zB = z0 + (zi - 1) * cell, z0 + zi * cell
			local xi = 1
			while xi <= W do
				local ch = string.sub(row, xi, xi)
				if ch == "" then ch = " " end
				local xj = xi
				while xj < W and string.sub(row, xj + 1, xj + 1) == ch do xj = xj + 1 end
				local xA, xB = x0 + (xi - 1) * cell, x0 + xj * cell
				if ch ~= " " then
					BW.part{ Name = "Floor", From = { xA, fl, zA }, To = { xB, fl + 1, zB }, Color = floorC, Material = floorM, Parent = m }
				end
				local base = fl + 1
				if ch == "#" then
					counts.wall = counts.wall + 1
					BW.part{ Name = "Wall", From = { xA, base, zA }, To = { xB, base + h, zB }, Color = wallC, Material = wallM, Parent = m }
				elseif ch == "D" then
					counts.door = counts.door + (xj - xi + 1)
					BW.part{ Name = "Lintel", From = { xA, base + doorH, zA }, To = { xB, base + h, zB }, Color = wallC, Material = wallM, Parent = m }
				elseif ch == "W" then
					counts.window = counts.window + (xj - xi + 1)
					BW.part{ Name = "Sill", From = { xA, base, zA }, To = { xB, base + sill, zB }, Color = wallC, Material = wallM, Parent = m }
					BW.part{ Name = "Glass", From = { xA + 0.01, base + sill, zA + cell * 0.4 }, To = { xB - 0.01, base + sill + winH, zB - cell * 0.4 }, Color = glassC, Material = "Glass", Transparency = 0.45, Parent = m }
					BW.part{ Name = "Header", From = { xA, base + sill + winH, zA }, To = { xB, base + h, zB }, Color = wallC, Material = wallM, Parent = m }
				elseif ch ~= "." and ch ~= " " then
					fail("floorplan: unknown cell '" .. ch .. "' in row " .. zi .. " (use # D W . or space)")
				end
				xi = xj + 1
			end
		end
		if opts.ceiling then
			BW.part{ Name = "Ceiling", From = { x0, fl + 1 + h, z0 }, To = { x0 + W * cell, fl + 2 + h, z0 + D * cell }, Color = opts.CeilingColor or wallC, Material = wallM, Parent = m }
		end
		m:SetAttribute("BW_Top", fl + 1 + h + (opts.ceiling and 1 or 0))
		print(string.format("BW_FLOORPLAN %s %dx%d cells (%dx%d studs) wallRuns=%d doorCells=%d windowCells=%d top=%.1f", m.Name, W, D, W * cell, D * cell, counts.wall, counts.door, counts.window, m:GetAttribute("BW_Top")))
		return m
	end

	-- Evenly spaced openings on a wall of length len: n windows of width w → offsets from the center.
	local function spread(len, n, w, margin)
		local out = {}
		if n <= 0 then return out end
		local usable = len - 2 * (margin or 2)
		if n * (w + 1) > usable then n = math.max(0, math.floor(usable / (w + 1))) end
		for i = 1, n do table.insert(out, -usable / 2 + usable * (i - 0.5) / n) end
		return out
	end
	BW._spread = spread

	-- Multi-storey building: slabs, walls with evenly spaced windows on every floor, front door,
	-- an internal staircase (with a hole in each slab above it) and a roof.
	-- BW.building{At={x,y,z}, Size={w,d}, floors=3, floorHeight=12, palette="modern", windows=3 (per side per floor),
	--   windowWidth=4, door="front", roof="flat"|"gable"|"shed"|"none", stairs=true, Name="Building"}
	function BW.building(opts)
		local at = BW.v3(opts.At or { 0, 0, 0 })
		local s = opts.Size or { 28, 24 }
		local w, d = s[1] or s.X, s[2] or s[3] or s.Z
		local floors, fh = opts.floors or 2, opts.floorHeight or 12
		local pal = BW.palette(opts.palette or "modern")
		local t = 1
		if w < 16 or d < 16 then fail("building needs Size of at least {16,16} (got " .. w .. "x" .. d .. ")") end
		local m = group(opts.Name or "Building", opts)
		local x0, x1, z0, z1 = at.X - w / 2, at.X + w / 2, at.Z - d / 2, at.Z + d / 2
		local rise, run, sw = 1, 1.5, 4
		local steps = fh - 1
		local L = steps * run
		local wantStairs = opts.stairs ~= false and floors > 1
		if wantStairs and L > d - 2 * t - 4 then fail(string.format("building is too shallow for stairs: depth %d needs >= %d (or floorHeight smaller / stairs=false)", d, math.ceil(L + 2 * t + 4))) end
		-- stairwell in the right-back corner, climbing toward -Z
		local hx0, hx1 = x1 - t - sw, x1 - t
		local hz0, hz1 = z0 + t, z0 + t + L
		local nwin, ww = opts.windows or 3, opts.windowWidth or 4
		for f = 0, floors - 1 do
			local y = at.Y + f * fh
			local slab = { Color = pal.floor, Material = pal.floorMat, Parent = m }
			local function block(name, a, b)
				local p = table.clone(slab)
				p.Name, p.From, p.To = name, a, b
				BW.part(p)
			end
			if f == 0 or not wantStairs then
				block("Floor" .. (f + 1), { x0, y, z0 }, { x1, y + 1, z1 })
			else
				block("Floor" .. (f + 1), { x0, y, z0 }, { hx0, y + 1, z1 })
				block("Floor" .. (f + 1) .. "b", { hx0, y, hz1 }, { x1, y + 1, z1 })
				block("Floor" .. (f + 1) .. "c", { hx0, y, z0 }, { x1, y + 1, hz0 })
				block("Floor" .. (f + 1) .. "d", { hx1, y, hz0 }, { x1, y + 1, hz1 })
			end
			local function wins(len, bottom)
				local list = {}
				for _, off in ipairs(spread(len, nwin, ww, 3)) do table.insert(list, { offset = off, width = ww, height = math.min(5, fh - 5), bottom = bottom or 3, glass = true }) end
				return list
			end
			local front = wins(w)
			if f == 0 and opts.door ~= false then
				-- replace the middle window by a door
				local keep = {}
				for _, o in ipairs(front) do if math.abs(o.offset) > ww / 2 + 3 then table.insert(keep, o) end end
				table.insert(keep, { offset = 0, width = 5, height = math.min(8, fh - 2) })
				front = keep
			end
			local wo = function(name, list) return { Name = name .. (f + 1), height = fh - 1, thickness = t, y = y + 1, openings = list, Color = pal.wall, Material = pal.wallMat, GlassColor = pal.glass, Parent = m } end
			BW.wall({ x0, z1 - t / 2 }, { x1, z1 - t / 2 }, wo("Front", front))
			BW.wall({ x1, z0 + t / 2 }, { x0, z0 + t / 2 }, wo("Back", wins(w)))
			BW.wall({ x0 + t / 2, z0 + t }, { x0 + t / 2, z1 - t }, wo("Left", wins(d - 2 * t)))
			BW.wall({ x1 - t / 2, z1 - t }, { x1 - t / 2, z0 + t }, wo("Right", wins(d - 2 * t)))
			-- trim band between floors
			BW.part{ Name = "Trim" .. (f + 1), From = { x0 - 0.3, y + fh - 0.6, z0 - 0.3 }, To = { x1 + 0.3, y + fh, z1 + 0.3 }, Color = pal.trim, Material = pal.trimMat, Parent = m }
			if wantStairs and f < floors - 1 then
				BW.stairs{ Name = "Stairs" .. (f + 1), From = { (hx0 + hx1) / 2, y + 1, hz1 }, dir = "-Z", steps = steps, rise = rise, run = run, width = sw, Color = pal.trim, Material = pal.trimMat, Parent = m }
			end
		end
		local top = at.Y + floors * fh
		BW.part{ Name = "RoofSlab", From = { x0, top, z0 }, To = { x1, top + 1, z1 }, Color = pal.roof, Material = pal.roofMat, Parent = m }
		local style = opts.roof or "flat"
		if style ~= "none" then
			BW.roof{ Name = "Roof", At = { at.X, top + 1, at.Z }, Size = { w, d }, style = style, height = opts.roofHeight or math.max(4, math.floor(math.min(w, d) / 4)), overhang = style == "flat" and 0 or 1, Color = pal.roof, Material = pal.roofMat, EndColor = pal.wall, Parent = m }
		end
		m:SetAttribute("BW_Top", top + 1)
		print(string.format("BW_BUILDING %s %dx%d floors=%d floorHeight=%d stairs=%s top=%.1f", m.Name, w, d, floors, fh, tostring(wantStairs), top + 1))
		return m
	end

	-- Path / road through points (flat strips with round joints). BW.path({{x,z},{x,z},…}, {width=4, y=ground, Color=, Material="Cobblestone"})
	function BW.path(points, opts)
		opts = opts or {}
		if #points < 2 then fail("path needs at least 2 points") end
		local y = opts.y or groundY()
		local wd, th = opts.width or 4, opts.thickness or 0.2
		local m = group(opts.Name or "Path", opts)
		local st = look(opts)
		if st.Material == nil then st.Material = "Cobblestone" end
		if st.Color == nil then st.Color = "#8C8C8C" end
		for i = 1, #points - 1 do
			local A, B = p3(points[i], y), p3(points[i + 1], y)
			local dx, dz = B.X - A.X, B.Z - A.Z
			local len = math.sqrt(dx * dx + dz * dz)
			local p = table.clone(st)
			p.Name, p.Size, p.Position, p.Orientation, p.Parent = "Segment" .. i, { len, th, wd }, { (A.X + B.X) / 2, y + th / 2, (A.Z + B.Z) / 2 }, { 0, math.deg(math.atan2(-dz, dx)), 0 }, m
			BW.part(p)
			if i > 1 then
				local j = table.clone(st)
				j.Name, j.Shape, j.Size, j.Position, j.Orientation, j.Parent = "Joint" .. i, "Cylinder", { th, wd, wd }, { A.X, y + th / 2 + 0.001, A.Z }, { 0, 0, 90 }, m
				BW.part(j)
			end
		end
		return m
	end

	-- Scatter n things in an area without overlaps: BW.scatter({From={x,z}, To={x,z}}, n, function(i, pos, rnd) … end, {seed=1, minDist=6})
	function BW.scatter(area, n, fn, opts)
		opts = opts or {}
		local a, b = area.From or area[1], area.To or area[2]
		if not (a and b) then fail("scatter area needs From={x,z} and To={x,z}") end
		local rnd = BW.rng(opts.seed or 1)
		local md = opts.minDist or 6
		local y = opts.y or groundY()
		local placed, out = {}, {}
		local tries = 0
		while #placed < n and tries < n * 40 do
			tries = tries + 1
			local x, z = rnd(math.min(a[1], b[1]), math.max(a[1], b[1])), rnd(math.min(a[2], b[2]), math.max(a[2], b[2]))
			local ok = true
			for _, q in ipairs(placed) do if (q[1] - x) ^ 2 + (q[2] - z) ^ 2 < md * md then ok = false break end end
			for _, r in ipairs(opts.avoid or {}) do
				local _, lst = partsOf(r)
				local lo, hi = boundsOf(lst)
				if lo and x > lo[1] - md / 2 and x < hi[1] + md / 2 and z > lo[3] - md / 2 and z < hi[3] + md / 2 then ok = false end
			end
			if ok then
				table.insert(placed, { x, z })
				table.insert(out, fn(#placed, Vector3.new(x, y, z), rnd) or false)
			end
		end
		if #placed < n then print("BW_SCATTER placed " .. #placed .. " of " .. n .. " (area too small for minDist " .. md .. ")") end
		return out
	end

	-- Column with base and capital. BW.column{At={x,y,z}, height=12, diameter=2, Color=, Material="Marble"}
	function BW.column(opts)
		local at = BW.v3(opts.At or { 0, 0, 0 })
		local h, dia = opts.height or 12, opts.diameter or 2
		local m = group(opts.Name or "Column", opts)
		local st = look(opts)
		if st.Material == nil then st.Material = "Marble" end
		local cap = dia * 1.4
		local function blk(name, y0, y1, s)
			local p = table.clone(st)
			p.Name, p.From, p.To, p.Parent = name, { at.X - s / 2, y0, at.Z - s / 2 }, { at.X + s / 2, y1, at.Z + s / 2 }, m
			BW.part(p)
		end
		blk("Base", at.Y, at.Y + 0.6, cap)
		local c = table.clone(st)
		c.Name, c.At, c.height, c.diameter, c.Parent = "Shaft", { at.X, at.Y + 0.6, at.Z }, h - 1.2, dia, m
		BW.cylinder(c)
		blk("Capital", at.Y + h - 0.6, at.Y + h, cap)
		return m
	end

	-- Round arch over an opening between two points (blocks along a half circle).
	-- BW.arch({x,z}, {x,z}, {y=top of the opening's straight part, thickness=1, depth=2, segments=9, Color=, Material=})
	function BW.arch(a, b, opts)
		opts = opts or {}
		local y = opts.y or (groundY() + 8)
		local A, B = p3(a, y), p3(b, y)
		local dx, dz = B.X - A.X, B.Z - A.Z
		local span = math.sqrt(dx * dx + dz * dz)
		local r = span / 2
		local ux, uz = dx / span, dz / span
		local yaw = math.deg(math.atan2(-uz, ux))
		local n, th, dp = opts.segments or 9, opts.thickness or 1, opts.depth or 2
		local m = group(opts.Name or "Arch", opts)
		local cx, cz = (A.X + B.X) / 2, (A.Z + B.Z) / 2
		for i = 1, n do
			local ang = math.pi * (i - 0.5) / n
			local px, py = math.cos(ang) * (r + th / 2), math.sin(ang) * (r + th / 2)
			local seg = math.pi * (r + th) / n + 0.15
			BW.part(look(opts, { Name = "Voussoir" .. i, Size = { seg, th, dp }, Position = { cx - ux * px, y + py, cz - uz * px }, Orientation = { 0, yaw, math.deg(ang) - 90 }, Parent = m }))
		end
		return m
	end

	-- ------------------------------------------------------------ QA for every category (1.6)
	-- UI QA: off-screen elements, unreadable text, sizes that break on phones, buttons without behaviour.
	-- BW.uiCheck(screenGuiOrPath) — checks layouts on a 1366×768 desktop and a 390×844 phone screen.
	local function getp(inst, k) local ok, v = pcall(function() return inst[k] end) if ok then return v end return nil end
	BW._getp = getp
	local function udim(u, total) return (u and u.Scale or 0) * total + (u and u.Offset or 0) end
	function BW.uiCheck(target)
		local root = BW.get(target)
		local issues, n, buttons, texts = {}, 0, 0, 0
		local hasScript = false
		for _, d in ipairs(root:GetDescendants()) do if d:IsA("LocalScript") then hasScript = true end end
		local function add(s) if #issues < 40 then table.insert(issues, s) end end
		local function walk(inst, px, py, pw, ph, screenW, screenH, label, laidOut)
			for _, c in ipairs(inst:GetChildren()) do
				if c:IsA("GuiObject") then
					n = n + 1
					local sz, pos = getp(c, "Size"), getp(c, "Position")
					local w, h = udim(sz and sz.X, pw), udim(sz and sz.Y, ph)
					local ap = getp(c, "AnchorPoint") or { X = 0, Y = 0 }
					local x = px + udim(pos and pos.X, pw) - (ap.X or 0) * w
					local y = py + udim(pos and pos.Y, ph) - (ap.Y or 0) * h
					local name = c:GetFullName()
					if getp(c, "Visible") ~= false and not laidOut then
						if x + w < 1 or y + h < 1 or x > screenW - 1 or y > screenH - 1 then add(label .. " off-screen: " .. name)
						elseif x < -2 or y < -2 or x + w > screenW + 2 or y + h > screenH + 2 then add(label .. " cut off at the screen edge: " .. name) end
					end
					if label == "phone" and sz and sz.X.Scale == 0 and sz.X.Offset > 390 then add("phone: " .. name .. " is " .. sz.X.Offset .. "px wide (use Scale, e.g. {0.9,0,…})") end
					if label == "desktop" then
						if c:IsA("TextLabel") or c:IsA("TextButton") or c:IsA("TextBox") then
							texts = texts + 1
							if not getp(c, "TextScaled") and (getp(c, "TextSize") or 14) < 12 then add("text too small (" .. tostring(getp(c, "TextSize")) .. "): " .. name) end
							if getp(c, "TextColor3") and getp(c, "BackgroundColor3") and (getp(c, "BackgroundTransparency") or 0) < 0.5 then
								local function lum(col) return 0.2126 * col.R + 0.7152 * col.G + 0.0722 * col.B end
								if math.abs(lum(getp(c, "TextColor3")) - lum(getp(c, "BackgroundColor3"))) < 0.25 then add("low contrast text: " .. name) end
							end
						end
						if c:IsA("TextButton") or c:IsA("ImageButton") then
							buttons = buttons + 1
							if h > 0 and h < 24 then add("button too small to tap (" .. math.floor(h) .. "px high): " .. name) end
						end
					end
					local lay = c:FindFirstChildOfClass("UIListLayout") or c:FindFirstChildOfClass("UIGridLayout")
					walk(c, x, y, w, h, screenW, screenH, label, lay ~= nil)
				end
			end
		end
		local function run(W, H, label)
			if root:IsA("LayerCollector") then walk(root, 0, 0, W, H, W, H, label, false)
			else
				local sz = getp(root, "Size")
				walk(root, 0, 0, udim(sz and sz.X, W), udim(sz and sz.Y, H), W, H, label, false)
			end
		end
		run(1366, 768, "desktop")
		run(390, 844, "phone")
		if buttons > 0 and not hasScript then add("there are " .. buttons .. " buttons but no LocalScript — nothing will happen on click") end
		if root:IsA("ScreenGui") and root.Parent and root.Parent.Name ~= "StarterGui" and root.Parent.ClassName ~= "PlayerGui" then add("ScreenGui is not in StarterGui (players will not see it)") end
		local ok = #issues == 0
		print("BW_UICHECK " .. root:GetFullName() .. " elements=" .. n .. " texts=" .. texts .. " buttons=" .. buttons .. " localScript=" .. tostring(hasScript) .. " issues=" .. #issues .. (ok and "\n  OK: UI looks clean on desktop and phone" or ("\n  " .. table.concat(issues, "\n  "))))
		return { ok = ok, issues = issues, elements = n }
	end

	-- Script QA (static): deprecated APIs, client/server mistakes, unsafe remotes, DataStore without pcall, busy loops.
	-- BW.lint([scriptPath]) — no argument = every script in the place.
	local LINT = {
		{ "%f[%w_%.:]wait%s*%(", "wait() is deprecated → task.wait()" },
		{ "%f[%w_%.:]spawn%s*%(", "spawn() is deprecated → task.spawn()" },
		{ "%f[%w_%.:]delay%s*%(", "delay() is deprecated → task.delay()" },
		{ ":connect%s*%(", ":connect is deprecated → :Connect" },
		{ "Instance%.new%s*%(%s*[\"'][%w_]+[\"']%s*,", "Instance.new(class, parent) is slow → set Parent last" },
		{ "game%.Players%.LocalPlayer", nil },
	}
	function BW.lint(target)
		local list = {}
		if target then
			local s = BW.get(target)
			if s:IsA("LuaSourceContainer") then table.insert(list, s) end
			for _, d in ipairs(s:GetDescendants()) do if d:IsA("LuaSourceContainer") then table.insert(list, d) end end
		else
			for _, d in ipairs(game:GetDescendants()) do if d:IsA("LuaSourceContainer") and not string.find(d:GetFullName(), "CoreGui", 1, true) then table.insert(list, d) end end
		end
		local out, total = {}, 0
		for _, s in ipairs(list) do
			local ok, src = pcall(function() return s.Source end)
			src = ok and src or ""
			local name = s:GetFullName()
			local probs = {}
			local function p(msg) table.insert(probs, msg) end
			for _, rule in ipairs(LINT) do
				if rule[2] and string.find(src, rule[1]) then p(rule[2]) end
			end
			local isLocal, isServer = s.ClassName == "LocalScript", s.ClassName == "Script"
			if isServer and string.find(src, "LocalPlayer", 1, true) then p("Script (server) uses LocalPlayer — it is nil on the server; use a LocalScript or the player argument") end
			if isLocal and (string.find(name, "ServerScriptService", 1, true) or string.find(name, "ServerStorage", 1, true)) then p("LocalScript in " .. (string.find(name, "ServerScriptService", 1, true) and "ServerScriptService" or "ServerStorage") .. " never runs") end
			if isLocal and string.find(name, "^Workspace%.") and not string.find(name, "StarterCharacter", 1, true) then p("LocalScript in Workspace does not run (unless inside the player's character)") end
			if isServer and (string.find(name, "StarterPlayerScripts", 1, true)) then p("Script in StarterPlayerScripts does not run — use a LocalScript") end
			if string.find(src, "while%s+true%s+do") and not string.find(src, "wait", 1, true) and not string.find(src, "Heartbeat", 1, true) then p("while true do without task.wait → freezes the game") end
			if string.find(src, "OnServerEvent", 1, true) and not (string.find(src, "typeof%(") or string.find(src, "type%(") or string.find(src, "tonumber%(")) then p("OnServerEvent without input validation — exploiters can send anything (check types/ranges, never trust client values like price or damage)") end
			if (string.find(src, ":GetAsync", 1, true) or string.find(src, ":SetAsync", 1, true) or string.find(src, ":UpdateAsync", 1, true)) and not string.find(src, "pcall", 1, true) then p("DataStore calls without pcall — they fail sometimes and will crash the script") end
			if string.find(src, "DataStoreService", 1, true) and not string.find(src, "BindToClose", 1, true) then p("DataStore without game:BindToClose — data may be lost when the server shuts down") end
			if isLocal and string.find(src, "ReplicatedStorage%.[%a_]") and not string.find(src, "WaitForChild", 1, true) then p("client indexes ReplicatedStorage children directly — use :WaitForChild (they may not be loaded yet)") end
			if string.find(src, "%.Touched:Connect") and not (string.find(src, "debounce") or string.find(src, "cooldown") or string.find(src, "touched%[") or string.find(src, "debounce%[")) then p("Touched handler without debounce — fires many times per touch") end
			if #probs > 0 then
				total = total + #probs
				table.insert(out, name .. ":\n    - " .. table.concat(probs, "\n    - "))
			end
		end
		print("BW_LINT scripts=" .. #list .. " problems=" .. total .. (total == 0 and "\n  OK: no known problems" or ("\n  " .. table.concat(out, "\n  "))))
		return { ok = total == 0, problems = total, scripts = #list }
	end

	-- VFX QA: performance and visibility of emitters, lights, beams and trails.
	function BW.fxCheck(target)
		local root = BW.get(target or workspace)
		local issues, em, li, rate = {}, 0, 0, 0
		local function add(s) if #issues < 30 then table.insert(issues, s) end end
		for _, d in ipairs(root:GetDescendants()) do
			local cls = d.ClassName
			if cls == "ParticleEmitter" then
				em = em + 1
				local r = getp(d, "Rate") or 0
				rate = rate + r
				if r > 200 then add("Rate " .. r .. " is heavy (keep < 100 per emitter): " .. d:GetFullName()) end
				if getp(d, "Enabled") == false then add("emitter disabled (call :Emit(n) from a script or enable it): " .. d:GetFullName()) end
				if not (d.Parent and (d.Parent:IsA("BasePart") or d.Parent:IsA("Attachment"))) then add("emitter must be inside a Part or Attachment: " .. d:GetFullName()) end
				local lt = getp(d, "Lifetime")
				if typeof(lt) == "NumberRange" and lt.Max > 10 then add("Lifetime " .. lt.Max .. "s is long (particles pile up): " .. d:GetFullName()) end
			elseif cls == "PointLight" or cls == "SpotLight" or cls == "SurfaceLight" then
				li = li + 1
				if (getp(d, "Range") or 0) > 60 then add("light Range " .. getp(d, "Range") .. " > 60 (max effective 60): " .. d:GetFullName()) end
				if getp(d, "Shadows") then add("light with Shadows=true is expensive: " .. d:GetFullName()) end
			elseif cls == "Beam" or cls == "Trail" then
				if not (getp(d, "Attachment0") and getp(d, "Attachment1")) then add(cls .. " needs Attachment0 and Attachment1: " .. d:GetFullName()) end
			end
		end
		if em > 40 then add(em .. " emitters in one area — combine or lower Rate") end
		if rate > 1500 then add("total particle rate " .. rate .. "/s — will lag on phones") end
		local ok = #issues == 0
		print("BW_FXCHECK " .. root:GetFullName() .. " emitters=" .. em .. " lights=" .. li .. " totalRate=" .. rate .. (ok and "\n  OK: effects look fine" or ("\n  " .. table.concat(issues, "\n  "))))
		return { ok = ok, issues = issues }
	end

	-- Gameplay QA: spawn, stats, remotes with handlers, kill parts, checkpoints.
	function BW.gameCheck()
		local issues, info = {}, {}
		local function add(s) table.insert(issues, s) end
		local spawns = 0
		for _, d in ipairs(workspace:GetDescendants()) do if d.ClassName == "SpawnLocation" then spawns = spawns + 1 end end
		if spawns == 0 then add("no SpawnLocation — players spawn at the origin") end
		table.insert(info, "spawns=" .. spawns)
		local serverSrc, clientSrc = "", ""
		for _, d in ipairs(game:GetDescendants()) do
			if d:IsA("LuaSourceContainer") then
				local ok, s = pcall(function() return d.Source end)
				if ok then if d.ClassName == "LocalScript" then clientSrc = clientSrc .. "\n" .. s else serverSrc = serverSrc .. "\n" .. s end end
			end
		end
		local rs = svc("ReplicatedStorage")
		local remotes = 0
		for _, d in ipairs(rs:GetDescendants()) do
			if d.ClassName == "RemoteEvent" or d.ClassName == "RemoteFunction" then
				remotes = remotes + 1
				if not string.find(serverSrc, d.Name, 1, true) then add("remote " .. d.Name .. " has no server handler (name not used in any server script)") end
				if not string.find(clientSrc, d.Name, 1, true) and not string.find(serverSrc, "FireClient", 1, true) then add("remote " .. d.Name .. " is never used by the client") end
			end
		end
		table.insert(info, "remotes=" .. remotes)
		if string.find(serverSrc, "leaderstats", 1, true) then table.insert(info, "leaderstats=yes") end
		if string.find(serverSrc, "DataStoreService", 1, true) then table.insert(info, "saving=yes") end
		local ok = #issues == 0
		print("BW_GAMECHECK " .. table.concat(info, " ") .. (ok and "\n  OK" or ("\n  " .. table.concat(issues, "\n  "))))
		return { ok = ok, issues = issues }
	end

	-- ------------------------------------------------------------ debugging
	-- Recent Output lines. kind = "error" | "warn" | "all" (default "error"+"warn").
	function BW.logs(n, kind)
		n = n or 30
		kind = kind or "problems"
		local ok, hist = pcall(function() return svc("LogService"):GetLogHistory() end)
		if not ok then fail("LogService unavailable: " .. tostring(hist)) end
		local out = {}
		for i = #hist, 1, -1 do
			local e = hist[i]
			local t = e.messageType and e.messageType.Name or "MessageOutput"
			local keep = kind == "all" or (kind == "error" and t == "MessageError") or (kind == "warn" and t == "MessageWarning") or (kind == "problems" and (t == "MessageError" or t == "MessageWarning"))
			if keep and not string.find(e.message, "BW_", 1, true) then
				table.insert(out, 1, "[" .. string.gsub(t, "Message", "") .. "] " .. e.message)
				if #out >= n then break end
			end
		end
		print("BW_LOGS " .. #out .. " line(s)\n" .. table.concat(out, "\n"))
		return #out
	end
end
