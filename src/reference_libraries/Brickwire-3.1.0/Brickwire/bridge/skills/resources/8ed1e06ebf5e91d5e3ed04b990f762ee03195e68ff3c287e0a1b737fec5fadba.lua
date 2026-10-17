-- Script and model created by Lurong

--[[
	Farm Warehouse: a broad grey metal-clad machine shed with a dark roof, on its yard.
	Size: the yard is 72 x 58 studs; the shed is 44 wide, 32 deep and 26 tall to the ridge. Faces -Z.
	SUBJECT TYPE: building, a hollow shed built with wall() and a gable() roof, with yard props.
	SIGNATURE FEATURES: two massive gridded bay doors and a small staff door on the
	front; ribbed metal cladding; a broad, low black roof with vents; a white silo
	with hoops and a ladder at the left corner; a pyramid of strapped hay bales; a
	green tractor with a cab parked on the dirt.
	Run this from the Roblox Studio command bar. game:GetObjects only works in Studio.
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
	wall     = "Medium stone grey",
	rib      = "Light stone grey",
	post     = "Dark stone grey",
	roof     = "Really black",
	trim     = "White",
	door     = "White",
	doorGrid = "Sand red",
	staff    = "Bright blue",
	glass    = "Pastel Blue",
	dirt     = "Sand red",
	grass    = "Bright green",
	hedge    = "Earth green",
	hay      = "Bright yellow",
	strap    = "Dark orange",
	silo     = "White",
	hoop     = "Medium stone grey",
	tractor  = "Bright green",
	metal    = "Dark stone grey",
	tyre     = "Really black",
	hub      = "Bright yellow",
	seat     = "Black",
	wood     = "Reddish brown",
	water    = "Medium blue",
	lamp     = "Cool yellow",
}

-- LAYOUT
local W, D, T, H = 40, 28, 1, 16          -- shed walls
local YARD_H, PLINTH_H = 1, 1
local BASE = YARD_H + PLINTH_H            -- wall base
local EAVE = BASE + H
local OH, RISE = 2, 8                     -- roof overhang and rise
local zFront = -D / 2 + T / 2
local BAY_W, BAY_H, BAY_IN = 12, 13, 4    -- bay doors
local DOOR_W, DOOR_H = 4, 7               -- staff door
local WIN, WIN_Y = 4, 5                   -- side windows
local YARD_W = 72
local DIRT_Z0, DIRT_Z1, GRASS_Z1 = -28, 16, 30
local SILO_D, SILO_H = 6, 18
local SILO_X = -W / 2 - SILO_D / 2 - 1
local SILO_Z = -D / 2 + SILO_D / 2 + 1
local HAY_X, HAY_Z = -12, -D / 2 - 8
local BALE_L, BALE_H, BALE_D = 4, 2, 2
local TR_X, TR_Z = 28, -10                -- tractor: centre between the axles
local REAR_D, FRONT_D = 5, 3              -- wheel diameters

local model = Instance.new("Model")
model.Name = "FarmWarehouse"

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

-- GROUND: dirt yard in front, grass strip and hedges behind
local yard = block("DirtYard", YARD_W, YARD_H, DIRT_Z1 - DIRT_Z0, 0, 0, (DIRT_Z0 + DIRT_Z1) / 2, C.dirt, "2022 Glue")
block("Grass", YARD_W, YARD_H, GRASS_Z1 - DIRT_Z1, 0, 0, (DIRT_Z1 + GRASS_Z1) / 2, C.grass, "2022 Small Stud")
for i = -2, 2 do
	block("Hedge", 8, 6 + (i % 2) * 2, 6, i * 13, YARD_H, (DIRT_Z1 + GRASS_Z1) / 2 + 1, C.hedge, "2022 Big Stud")
end
block("Plinth", W + 2, PLINTH_H, D + 2, 0, YARD_H, 0, C.post)

-- WALLS: hollow, with two bays and a staff door in front and a window each side
local bayXs = { BAY_IN, W - BAY_IN - BAY_W }
local doorX0 = (W - DOOR_W) / 2
wall("FrontWall", CFrame.new(0, BASE, zFront), W, H, T, {
	{ x = bayXs[1], y = 0, w = BAY_W, h = BAY_H },
	{ x = bayXs[2], y = 0, w = BAY_W, h = BAY_H },
	{ x = doorX0, y = 0, w = DOOR_W, h = DOOR_H },
}, C.wall)
wall("BackWall", CFrame.new(0, BASE, -zFront), W, H, T, {}, C.wall)
local sideLen = D - 2 * T
for _, sx in ipairs({ -1, 1 }) do
	local cf = CFrame.new(sx * (W / 2 - T / 2), BASE, 0) * CFrame.Angles(0, math.rad(90), 0)
	wall("SideWall", cf, sideLen, H, T, { { x = (sideLen - WIN) / 2, y = WIN_Y, w = WIN, h = WIN } }, C.wall)
	make("Part", "WindowGlass", V3(WIN, WIN, 0.4), cf * CFrame.new(0, WIN_Y + WIN / 2, 0), C.glass, "2022 Small Stud")
	make("Part", "WindowBar", V3(0.4, WIN, 0.8), cf * CFrame.new(0, WIN_Y + WIN / 2, 0), C.trim)
	make("Part", "WindowSill", V3(WIN + 2, 1, 2), cf * CFrame.new(0, WIN_Y - 0.5, 0), C.post)
	make("Part", "WindowLintel", V3(WIN + 2, 1, 2), cf * CFrame.new(0, WIN_Y + WIN + 0.5, 0), C.post)
	-- cladding ribs on the side walls, skipping the window
	for z = -sideLen / 2 + 3, sideLen / 2 - 3, 4 do
		if math.abs(z) > WIN / 2 + 1 then
			block("Rib", 0.4, H, 0.6, sx * (W / 2 + 0.2), BASE, z, C.rib)
		end
	end
end
-- cladding ribs across the back wall
for x = -W / 2 + 4, W / 2 - 4, 4 do
	block("Rib", 0.6, H, 0.4, x, BASE, D / 2 + 0.2, C.rib)
end
-- corner posts, standing proud of both faces
for _, sx in ipairs({ -1, 1 }) do
	for _, sz in ipairs({ -1, 1 }) do
		block("CornerPost", 2, H, 2, sx * (W / 2 - 0.8), BASE, sz * (D / 2 - 0.8), C.post)
	end
end

-- BAY DOORS: a white panel behind a grid of rails, a lintel and a lamp above each
for _, bx in ipairs(bayXs) do
	local cx = bx + BAY_W / 2 - W / 2
	block("BayDoor", BAY_W, BAY_H, 0.6, cx, BASE, zFront, C.door, "2022 Small Stud")
	for k = 1, 3 do
		block("BayRail", BAY_W, 0.6, 0.3, cx, BASE + k * BAY_H / 4 - 0.3, zFront - 0.45, C.doorGrid, "2022 Big Stud")
	end
	for k = -1, 1 do
		block("BayStile", 0.6, BAY_H, 0.2, cx + k * BAY_W / 3, BASE, zFront - 0.4, C.doorGrid, "2022 Big Stud")
	end
	block("BayHandle", 2, 0.4, 0.5, cx, BASE + 1.2, zFront - 0.7, C.metal)
	block("BayLintel", BAY_W + 2, 1, 2, cx, BASE + BAY_H, zFront, C.post)
	local light = lamp("BayLamp", V3(1.6, 0.5, 0.6), CFrame.new(cx, BASE + BAY_H + 1.8, zFront - 0.8), C.lamp)
	local glow = Instance.new("PointLight")
	glow.Color = light.Color
	glow.Range = 14
	glow.Parent = light
end

-- STAFF DOOR with a little window, and the farm sign over it
block("StaffDoor", DOOR_W, DOOR_H, 0.6, 0, BASE, zFront, C.staff, "2022 Small Stud")
block("StaffWindow", 2, 2, 0.2, 0, BASE + 4, zFront - 0.4, C.glass, "2022 Small Stud")
make("Ball", "StaffKnob", V3(0.6, 0.6, 0.6), CFrame.new(1.4, BASE + 3, zFront - 0.5), C.hub)
block("DoorLintel", DOOR_W + 2, 1, 2, 0, BASE + DOOR_H, zFront, C.post)
block("Sign", 8, 3, 0.4, 0, BASE + DOOR_H + 2.5, zFront - 0.7, C.staff, "2022 Small Stud")
block("SignStripe", 7, 0.6, 0.2, 0, BASE + DOOR_H + 3.7, zFront - 1, C.trim, "2022 Small Stud")

-- ROOF: broad and low, with a ridge cap, eave gutters, two vents and gable louvres
gable("Roof", 0, EAVE, 0, D + 2 * OH, W + 2 * OH, RISE, true, C.roof, "2022 Big Stud")
block("Ridge", W + 2 * OH + 0.6, 0.8, 1.2, 0, EAVE + RISE - 0.4, 0, C.post)
for _, sz in ipairs({ -1, 1 }) do
	block("Gutter", W + 2 * OH, 0.8, 0.8, 0, EAVE - 0.8, sz * (D / 2 + OH - 0.4), C.trim)
end
for _, sx in ipairs({ -1, 1 }) do
	block("RoofVent", 3, 2, 3, sx * 10, EAVE + RISE - 0.5, 0, C.post)
	block("RoofVentCap", 4, 0.5, 4, sx * 10, EAVE + RISE + 1.5, 0, C.trim)
	for k = 0, 2 do
		block("Louvre", 0.3, 0.6, 6 - k * 1.6, sx * (W / 2 + OH + 0.15), EAVE + 1.5 + k * 1.3, 0, C.rib)
	end
end

-- SILO: hooped white drum with a domed cap, a ladder and a feed pipe into the shed
column("Silo", SILO_D, SILO_H, SILO_X, YARD_H, SILO_Z, C.silo)
for k = 1, 3 do
	column("SiloHoop", SILO_D + 0.5, 0.6, SILO_X, YARD_H + k * SILO_H / 4, SILO_Z, C.hoop)
end
make("Ball", "SiloCap", V3(SILO_D, SILO_D, SILO_D), CFrame.new(SILO_X, YARD_H + SILO_H, SILO_Z), C.silo)
local ladderZ = SILO_Z - SILO_D / 2 - 0.3
for _, sx in ipairs({ -1, 1 }) do
	block("LadderRail", 0.3, SILO_H, 0.3, SILO_X + sx * 0.8, YARD_H, ladderZ, C.metal)
end
for y = 2, SILO_H - 2, 2 do
	block("LadderRung", 1.6, 0.3, 0.3, SILO_X, YARD_H + y, ladderZ, C.metal)
end
make("Cylinder", "FeedPipe", V3(4.5, 1, 1), CFrame.new(SILO_X + SILO_D / 2 + 1.2, YARD_H + SILO_H - 3, SILO_Z), C.hoop)

-- HAY: a pyramid of strapped bales
for row = 0, 2 do
	for i = 0, 2 - row do
		local x = HAY_X + (i + row / 2) * (BALE_L + 0.4)
		block("HayBale", BALE_L, BALE_H, BALE_D, x, YARD_H + row * BALE_H, HAY_Z, C.hay, "2022 Weld")
		for _, off in ipairs({ -1, 1 }) do
			block("BaleStrap", 0.3, BALE_H + 0.1, BALE_D + 0.1, x + off, YARD_H + row * BALE_H, HAY_Z, C.strap)
		end
	end
end

-- TRACTOR, facing -Z: big rear wheels, small front wheels, open cab
local ground = YARD_H
local rearZ, frontZ = TR_Z + 1.5, TR_Z - 4.5
for _, sx in ipairs({ -1, 1 }) do
	wheel("Rear", REAR_D, 1.6, TR_X + sx * 2.5, ground + REAR_D / 2, rearZ, C.tyre, C.hub)
	wheel("Front", FRONT_D, 1.2, TR_X + sx * 2.1, ground + FRONT_D / 2, frontZ, C.tyre, C.hub)
	block("Fender", 1.8, 0.4, 4.4, TR_X + sx * 2.5, ground + REAR_D + 0.2, rearZ, C.tractor)
	lamp("Headlight", V3(0.6, 0.6, 0.2), CFrame.new(TR_X + sx * 0.8, ground + 4.1, TR_Z - 6.05), C.lamp)
	for _, z in ipairs({ TR_Z - 0.4, TR_Z + 3 }) do
		block("CabPost", 0.4, 4.2, 0.4, TR_X + sx * 1.3, ground + 5, z, C.metal)
	end
end
make("Cylinder", "RearAxle", V3(5, 0.8, 0.8), CFrame.new(TR_X, ground + REAR_D / 2, rearZ), C.metal)
make("Cylinder", "FrontAxle", V3(4.2, 0.6, 0.6), CFrame.new(TR_X, ground + FRONT_D / 2, frontZ), C.metal)
block("Chassis", 2.2, 1, 8.5, TR_X, ground + 1.3, TR_Z - 1.6, C.metal)
block("Body", 3, 2.8, 4, TR_X, ground + 2.2, TR_Z + 1.3, C.tractor)
block("Hood", 2.6, 2.4, 5, TR_X, ground + 2.2, TR_Z - 3.3, C.tractor)
block("Grille", 2.2, 1.8, 0.3, TR_X, ground + 2.4, TR_Z - 5.95, C.metal, "2022 Small Stud")
column("Exhaust", 0.5, 3.2, TR_X + 0.8, ground + 4.6, TR_Z - 3.4, C.metal)
block("Seat", 1.8, 0.4, 1.6, TR_X, ground + 5, TR_Z + 1.8, C.seat)
block("SeatBack", 1.8, 2, 0.4, TR_X, ground + 5, TR_Z + 2.7, C.seat)
column("SteeringColumn", 0.3, 1.4, TR_X, ground + 5, TR_Z - 0.2, C.metal)
make("Cylinder", "SteeringRing", V3(0.3, 1.6, 1.6), CFrame.new(TR_X, ground + 6.5, TR_Z - 0.2) * CFrame.Angles(0, 0, math.rad(90)), C.seat)
block("CabRoof", 3.6, 0.4, 4.4, TR_X, ground + 9.2, TR_Z + 1.3, C.trim)

-- YARD PROPS: a rail fence on the left edge, a water trough and crates on the right
local fenceX = -YARD_W / 2 + 1
for z = DIRT_Z0 + 2, DIRT_Z1 - 2, 6 do
	block("FencePost", 1, 4, 1, fenceX, YARD_H, z, C.wood)
end
for _, y in ipairs({ 1.4, 2.8 }) do
	block("FenceRail", 0.4, 0.5, DIRT_Z1 - DIRT_Z0 - 4, fenceX, YARD_H + y, (DIRT_Z0 + DIRT_Z1) / 2, C.wood)
end
block("Trough", 8, 2, 3, 16, YARD_H, -22, C.wood)
block("TroughWater", 7, 0.3, 2, 16, YARD_H + 1.8, -22, C.water, "2022 Small Stud")
block("Crate", 3, 3, 3, 24.5, YARD_H, 3, C.wood, "2022 Weld")
block("Crate", 3, 3, 3, 28, YARD_H, 3.5, C.wood, "2022 Weld")
block("Crate", 3, 3, 3, 26, YARD_H + 3, 3.2, C.wood, "2022 Weld")

model.PrimaryPart = yard

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
