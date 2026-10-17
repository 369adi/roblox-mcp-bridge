-- Script and model created by Lurong

--[[
	Skyscraper (Hong Kong style glass tower), retro Roblox treatment.
	Size: about 30 x 122 x 30 studs (W x H x D) with its plaza. The entrance faces -Z.
	SUBJECT TYPE: building, a tall tower over a hollow walk-in lobby built with wall().
	SIGNATURE FEATURES: a tall slim blue glass shaft with a floor line every five
	studs; three stepped setbacks, each with a pale ledge; vertical white mullion
	fins; a dark crown gripped by four white prongs; stepped caps with aviation
	lights; a glowing spire. At street level: a canopy over the doors, planters
	and lamp posts on a paved plaza.
	Run from the Roblox Studio command bar: game:GetObjects is Studio-only.
]]

local MS = game:GetService("MaterialService")

-- Stud material pack. Without it the model still builds, just smooth.
local studsLoaded = false
do
	local ok, roots = pcall(game.GetObjects, game, "rbxassetid://13386676607")
	if ok then
		local tmp = Instance.new("Folder")
		for _, r in ipairs(roots) do r.Parent = tmp end
		for _, d in ipairs(tmp:GetDescendants()) do
			if d:IsA("MaterialVariant") and not MS:FindFirstChild(d.Name) then
				d.Parent = MS
			end
		end
		tmp:Destroy()
		studsLoaded = true
	else
		warn("Stud material pack failed to load, building smooth: " .. tostring(roots))
	end
end

-- classic BrickColor names only
local C = {
	glass   = "Medium blue",
	floor   = "Bright blue",      -- floor lines on the shaft
	crown   = "Navy blue",
	fin     = "Light stone grey",
	white   = "White",
	glow    = "Institutional white",
	lobby   = "Dark stone grey",
	stone   = "Medium stone grey",
	pane    = "Pastel Blue",
	planter = "Reddish brown",
	leaf    = "Dark green",
	red     = "Bright red",
}

-- LAYOUT
local PLAZA_W, PLAZA_H = 30, 1
local LOBBY_W, LOBBY_H, T = 20, 12, 1
local POST = 2
local WALL_RUN = LOBBY_W - 2 * POST      -- walls run between the corner posts
local DOOR_W, DOOR_H = 6, 8
local WIN_W, WIN_H, WIN_Y = 3, 5, 3
local half = LOBBY_W / 2
local zFront = -half + T / 2
local TOWER_Y = PLAZA_H + LOBBY_H + 1    -- the shaft starts on the lobby roof slab
local FLOOR = 5                          -- studs between floor lines
local SECTIONS = {
	{ w = 18, h = 40, fins = 3 },
	{ w = 16, h = 25, fins = 2 },
	{ w = 14, h = 15, fins = 1 },
}
local LEDGE_H = 1
local FIN_T, LINE_T = 0.5, 0.2
local CROWN_W, CROWN_H = 12, 8
local PRONG_RISE = 3
local CAP1_W, CAP1_H = 8, 3
local CAP2_W, CAP2_H = 4, 2
local SPIRE_BASE_H, SPIRE_H = 2, 10

local model = Instance.new("Model")
model.Name = "Skyscraper"

-- ---------------------------------------------------------------------------
-- Lurong build helpers (the same block in every Lurong script)
-- ---------------------------------------------------------------------------
local V3 = Vector3.new

local function paint(p, colour, variant)
	p.BrickColor = BrickColor.new(colour)
	if studsLoaded then
		p.Material = Enum.Material.Glacier
		p.MaterialVariant = variant or "2022 Universal"
	else
		p.Material = Enum.Material.SmoothPlastic
	end
end

-- kind is "Part", "Wedge", "Corner", "Cylinder" or "Ball"
local function make(kind, name, size, cf, colour, variant)
	local p
	if kind == "Wedge" then
		p = Instance.new("WedgePart")
	elseif kind == "Corner" then
		p = Instance.new("CornerWedgePart")
	else
		p = Instance.new("Part")
		if kind == "Cylinder" then p.Shape = Enum.PartType.Cylinder end
		if kind == "Ball" then p.Shape = Enum.PartType.Ball end
	end
	p.Name = name
	p.Size = size
	p.CFrame = cf
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	paint(p, colour, variant)
	p.Parent = model
	return p
end

-- A box placed by the centre of its BASE (x, y, z), so parts stack by adding
-- heights instead of writing "+ h / 2" on every line.
local function block(name, w, h, d, x, y, z, colour, variant)
	return make("Part", name, V3(w, h, d), CFrame.new(x, y + h / 2, z), colour, variant)
end

-- A thin glowing lens. Neon is used for nothing else.
local function lamp(name, size, cf, colour)
	local p = make("Part", name, size, cf, colour, "2022 Small Stud")
	p.Material = Enum.Material.Neon
	return p
end

-- An upright cylinder standing on (x, y, z). A Roblox cylinder lies along its
-- local X axis, so it is turned 90 degrees to stand up.
local function column(name, diameter, height, x, y, z, colour, variant)
	return make("Cylinder", name, V3(height, diameter, diameter),
		CFrame.new(x, y + height / 2, z) * CFrame.Angles(0, 0, math.rad(90)), colour, variant)
end

-- A wheel centred on (x, y, z) whose axle runs left-right. That is the
-- cylinder's own X axis, so a wheel needs NO rotation: tyre plus a proud hub.
local function wheel(name, diameter, width, x, y, z, tyre, hub)
	make("Cylinder", name .. "Tyre", V3(width, diameter, diameter), CFrame.new(x, y, z), tyre)
	make("Cylinder", name .. "Hub", V3(width + 0.2, diameter * 0.55, diameter * 0.55), CFrame.new(x, y, z), hub, "2022 Small Stud")
end

-- A wall built as solid panels AROUND its openings, so doors and windows are
-- real holes and the building is hollow. cf is the bottom-centre of the wall
-- and its local X runs along it. Each opening is { x = , y = , w = , h = }
-- measured from the wall's bottom-left corner.
local function wall(name, cf, len, height, thick, openings, colour, variant)
	local ys = { 0, height }
	for _, o in ipairs(openings) do
		table.insert(ys, o.y)
		table.insert(ys, o.y + o.h)
	end
	table.sort(ys)
	for i = 1, #ys - 1 do
		local y1, y2 = ys[i], ys[i + 1]
		if y2 - y1 > 0.01 then
			local xs, cuts = { 0, len }, {}
			for _, o in ipairs(openings) do
				if o.y <= y1 and o.y + o.h >= y2 then
					table.insert(xs, o.x)
					table.insert(xs, o.x + o.w)
					table.insert(cuts, o)
				end
			end
			table.sort(xs)
			for j = 1, #xs - 1 do
				local x1, x2 = xs[j], xs[j + 1]
				local mid, hole = (x1 + x2) / 2, false
				for _, o in ipairs(cuts) do
					if mid > o.x and mid < o.x + o.w then hole = true break end
				end
				if not hole and x2 - x1 > 0.01 then
					make("Part", name, V3(x2 - x1, y2 - y1, thick),
						cf * CFrame.new(x1 + (x2 - x1) / 2 - len / 2, y1 + (y2 - y1) / 2, 0), colour, variant)
				end
			end
		end
	end
end

-- A gable roof: two wedges meeting at a ridge. (cx, cz) is its centre and
-- baseY the eave height. span is the width across both slopes, length the
-- extent along the ridge, both including overhang. alongX = true runs the
-- ridge along X (slopes face -Z and +Z); false runs it along Z.
local function gable(name, cx, baseY, cz, span, length, rise, alongX, colour, variant)
	local run = span / 2
	for _, s in ipairs({ -1, 1 }) do
		local cf
		if alongX then
			cf = CFrame.new(cx, baseY + rise / 2, cz + s * run / 2) * CFrame.Angles(0, s < 0 and 0 or math.pi, 0)
		else
			cf = CFrame.new(cx + s * run / 2, baseY + rise / 2, cz) * CFrame.Angles(0, math.rad(s < 0 and 90 or -90), 0)
		end
		make("Wedge", name, V3(length, rise, run), cf, colour, variant)
	end
end

-- A limb stretched between two points, its length along local Z.
-- Returns its CFrame and length so plates can be attached to it.
local function bone(name, a, b, w, h, colour, variant)
	local len = (b - a).Magnitude
	local cf = CFrame.lookAt((a + b) / 2, b)
	make("Part", name, V3(w, h, len), cf, colour, variant)
	return cf, len
end

-- PLAZA: paved slab with a darker kerb, planters and lamp posts
local plaza = block("Plaza", PLAZA_W, PLAZA_H, PLAZA_W, 0, 0, 0, C.stone, "2022 Big Stud")
block("Kerb", PLAZA_W + 1, PLAZA_H - 0.3, PLAZA_W + 1, 0, 0, 0, C.lobby)
block("Steps", DOOR_W + 6, 0.5, 3, 0, PLAZA_H, -half - 1.5, C.fin)
for _, sx in ipairs({ -1, 1 }) do
	local px = sx * (PLAZA_W / 2 - 2.5)
	block("Planter", 3, 1.5, 3, px, PLAZA_H, -PLAZA_W / 2 + 2.5, C.planter)
	make("Ball", "Shrub", V3(3.4, 3.4, 3.4), CFrame.new(px, PLAZA_H + 2.6, -PLAZA_W / 2 + 2.5), C.leaf, "2022 Big Stud")
	column("LampPost", 0.5, 7, sx * 7, PLAZA_H, -PLAZA_W / 2 + 2, C.lobby)
	lamp("LampHead", V3(1.2, 0.6, 1.2), CFrame.new(sx * 7, PLAZA_H + 7.3, -PLAZA_W / 2 + 2), C.glow)
end

-- LOBBY: hollow, with glass doors standing in an open doorway and two tall windows
local doorX0 = (WALL_RUN - DOOR_W) / 2
local wins = {
	{ x = 0.5, y = WIN_Y, w = WIN_W, h = WIN_H },
	{ x = WALL_RUN - 0.5 - WIN_W, y = WIN_Y, w = WIN_W, h = WIN_H },
}
wall("FrontWall", CFrame.new(0, PLAZA_H, zFront), WALL_RUN, LOBBY_H, T,
	{ { x = doorX0, y = 0, w = DOOR_W, h = DOOR_H }, wins[1], wins[2] }, C.lobby)
wall("BackWall", CFrame.new(0, PLAZA_H, -zFront), WALL_RUN, LOBBY_H, T, {}, C.lobby)
for _, sx in ipairs({ -1, 1 }) do
	wall("SideWall", CFrame.new(sx * (half - T / 2), PLAZA_H, 0) * CFrame.Angles(0, math.rad(90), 0),
		WALL_RUN, LOBBY_H, T, {}, C.lobby)
	for _, sz in ipairs({ -1, 1 }) do
		block("CornerPost", POST, LOBBY_H, POST, sx * (half - POST / 2), PLAZA_H, sz * (half - POST / 2), C.fin)
	end
	-- one door leaf each side, swung open into the lobby
	local hinge = CFrame.new(sx * DOOR_W / 2, PLAZA_H, zFront + T / 2) * CFrame.Angles(0, math.rad(sx * 75), 0)
	make("Part", "GlassDoor", V3(DOOR_W / 2, DOOR_H, 0.3), hinge * CFrame.new(-sx * DOOR_W / 4, DOOR_H / 2, 0), C.pane, "2022 Small Stud")
	lamp("DoorLamp", V3(0.4, 1.2, 0.4), CFrame.new(sx * (DOOR_W / 2 + 0.8), PLAZA_H + DOOR_H - 2, zFront - 0.7), C.glow)
end
for _, o in ipairs(wins) do
	local wx = -WALL_RUN / 2 + o.x + o.w / 2
	block("LobbyPane", o.w, o.h, 0.4, wx, PLAZA_H + o.y, zFront, C.pane, "2022 Small Stud")
	block("Sill", o.w + 1, 1, 2, wx, PLAZA_H + o.y - 1, zFront, C.fin)
	block("Lintel", o.w + 1, 1, 2, wx, PLAZA_H + o.y + o.h, zFront, C.fin)
end
block("DoorLintel", DOOR_W + 2, 1, 2, 0, PLAZA_H + DOOR_H, zFront, C.fin)
block("Canopy", DOOR_W + 6, 0.8, 4, 0, PLAZA_H + DOOR_H + 1, -half - 2, C.crown, "2022 Big Stud")
for _, sx in ipairs({ -1, 1 }) do
	column("CanopyPole", 0.5, DOOR_H + 1, sx * (DOOR_W / 2 + 2.4), PLAZA_H, -half - 3.4, C.fin)
end
block("LobbyFloor", LOBBY_W - 2 * T, 0.2, LOBBY_W - 2 * T, 0, PLAZA_H, 0, C.white, "2022 Small Stud")
block("LobbyRoof", LOBBY_W + 2, 1, LOBBY_W + 2, 0, PLAZA_H + LOBBY_H, 0, C.fin)

-- TOWER SHAFT: three setbacks, each with floor lines, fins and a ledge
local y0 = TOWER_Y
for i, s in ipairs(SECTIONS) do
	local w, h = s.w, s.h
	block("Shaft" .. i, w, h, w, 0, y0, 0, C.glass, "2022 Small Stud")
	-- a floor line every FLOOR studs, wrapped round all four faces as one ring
	for fy = FLOOR, h - 1, FLOOR do
		block("FloorLine", w + 2 * LINE_T, 0.6, w + 2 * LINE_T, 0, y0 + fy - 0.3, 0, C.floor, "2022 Big Stud")
	end
	-- vertical fins on all four faces
	for k = 1, s.fins do
		local off = (k - (s.fins + 1) / 2) * (w / (s.fins + 1)) * 1.4
		for _, sd in ipairs({ -1, 1 }) do
			block("FinZ", 1, h - 1, FIN_T, off, y0 + 0.5, sd * (w / 2 + FIN_T / 2), C.fin)
			block("FinX", FIN_T, h - 1, 1, sd * (w / 2 + FIN_T / 2), y0 + 0.5, off, C.fin)
		end
	end
	block("Ledge" .. i, w + 1.6, LEDGE_H, w + 1.6, 0, y0 + h, 0, C.fin, "2022 Big Stud")
	y0 = y0 + h + LEDGE_H
end

-- rooftop plant on the first setback
local roof1 = TOWER_Y + SECTIONS[1].h + LEDGE_H
for _, sx in ipairs({ -1, 1 }) do
	block("AirUnit", 0.8, 1, 3, sx * (SECTIONS[1].w / 2 - 0.2), roof1, 3, C.lobby)
end

-- CROWN gripped by four rising prongs
local crownY = y0
block("Crown", CROWN_W, CROWN_H, CROWN_W, 0, crownY, 0, C.crown, "2022 Small Stud")
local prongH = CROWN_H + PRONG_RISE
for _, sd in ipairs({ -1, 1 }) do
	block("ProngZ", 2, prongH, 1, 0, crownY, sd * (CROWN_W / 2 + 0.5), C.white, "2022 Big Stud")
	block("ProngX", 1, prongH, 2, sd * (CROWN_W / 2 + 0.5), crownY, 0, C.white, "2022 Big Stud")
end

-- STEPPED CAPS with red aviation lights at the corners
local capY = crownY + CROWN_H
block("Cap1", CAP1_W, CAP1_H, CAP1_W, 0, capY, 0, C.fin)
for _, sx in ipairs({ -1, 1 }) do
	for _, sz in ipairs({ -1, 1 }) do
		lamp("AviationLight", V3(0.6, 0.6, 0.6),
			CFrame.new(sx * (CAP1_W / 2 - 0.5), capY + CAP1_H + 0.3, sz * (CAP1_W / 2 - 0.5)), C.red)
	end
end
block("Cap2", CAP2_W, CAP2_H, CAP2_W, 0, capY + CAP1_H, 0, C.white, "2022 Big Stud")

-- ILLUMINATED SPIRE
local spireY = capY + CAP1_H + CAP2_H
column("SpireBase", 2, SPIRE_BASE_H, 0, spireY, 0, C.lobby)
local spire = lamp("Spire", V3(1, SPIRE_H, 1), CFrame.new(0, spireY + SPIRE_BASE_H + SPIRE_H / 2, 0), C.glow)
local beacon = Instance.new("PointLight")
beacon.Range = 24
beacon.Brightness = 3
beacon.Color = spire.Color
beacon.Parent = spire

model.PrimaryPart = plaza

-- ---------------------------------------------------------------------------
-- Lurong finish (the same block in every Lurong script)
-- ---------------------------------------------------------------------------
-- Stud guarantee: every surface of every part is studded. A classic variant
-- is kept when the pack really has it; anything else becomes Universal.
-- Neon stays glowing only where it is thin (a lens, a strip, a core bar).
if studsLoaded then
	local STUDDED = { ["2022 Universal"] = true, ["2022 Small Stud"] = true, ["2022 Big Stud"] = true,
		["2022 Weld"] = true, ["2022 Glue"] = true }
	for _, p in ipairs(model:GetDescendants()) do
		if p:IsA("BasePart") then
			local s = p.Size
			local thin = math.min(s.X, math.min(s.Y, s.Z))
			local glowing = p.Material == Enum.Material.Neon and thin <= 2.2
			if not glowing then
				p.Material = Enum.Material.Glacier
				if not STUDDED[p.MaterialVariant] or not MS:FindFirstChild(p.MaterialVariant) then
					p.MaterialVariant = "2022 Universal"
				end
			end
		end
	end
end

-- Wheel check: a wheel, tyre or hub whose axle points up would lie flat like
-- a coin. Stand it back up.
for _, p in ipairs(model:GetDescendants()) do
	if p:IsA("Part") and p.Shape == Enum.PartType.Cylinder then
		local n = string.lower(p.Name)
		local isWheel = string.find(n, "wheel") or string.find(n, "tyre") or string.find(n, "tire") or string.find(n, "hub")
		if isWheel and not string.find(n, "steer") and math.abs(p.CFrame.RightVector.Y) > 0.7 then
			p.CFrame = CFrame.new(p.CFrame.Position)
		end
	end
end

model.Parent = workspace

local count = 0
for _, d in ipairs(model:GetDescendants()) do
	if d:IsA("BasePart") then count = count + 1 end
end
local ext = model:GetExtentsSize()
print(string.format("%s built: %d parts, %.1f x %.1f x %.1f studs", model.Name, count, ext.X, ext.Y, ext.Z))
