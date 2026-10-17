-- Script and model created by Lurong

--[[
	Cottage: retro Roblox, studs on every surface.
	Size: the cottage is 22 x 22 x 18 studs (W x H x D) on a 34 x 30 garden. Faces -Z.
	SUBJECT TYPE: building, hollow, built with wall() and a 45 degree gable() roof.
	SIGNATURE FEATURES: bright yellow walls under a steep red roof; a doorway you
	can walk through with its door standing open; cross-barred windows with white
	sills and lintels; a stone chimney with a clay pot; a cobbled path through a
	picket fence.
	Run this from the Studio command bar (game:GetObjects is Studio-only).
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
	walls   = "Bright yellow",
	roof    = "Bright red",
	timber  = "Reddish brown",
	door    = "Rust",
	knob    = "Cool yellow",
	glass   = "Pastel Blue",
	trim    = "White",
	stone   = "Dark stone grey",
	flue    = "Medium stone grey",
	pot     = "Dark orange",
	floor   = "Brick yellow",
	lawn    = "Bright green",
	bush    = "Dark green",
	cobbleA = "Medium stone grey",
	cobbleB = "Light stone grey",
	light   = "Cool yellow",
	flowers = { "Bright red", "Bright violet", "Bright orange" },
}

-- LAYOUT: whole studs throughout
local W, D   = 20, 16        -- outer wall footprint
local H      = 10            -- one storey
local T      = 1             -- wall thickness
local PLINTH = 1
local OVER   = 1             -- roof overhang past the walls
local RUN    = W / 2 + OVER
local RISE   = RUN           -- rise equal to run: a true 45 degrees
local YARD_W, YARD_D, YARD_Z = 34, 30, -3
local LAWN   = 0.4

local yFloor = PLINTH
local yTop   = yFloor + H
local zFront, zBack = -(D - T) / 2, (D - T) / 2
local SIDE   = D - 2 * T     -- side walls fit between the front and back walls

-- openings, measured from each wall's bottom-left corner
local DOOR        = { x = 3,  y = 0, w = 4, h = 7 }   -- player-sized: 4 x 7
local WINDOW      = { x = 13, y = 3, w = 4, h = 4 }   -- sill 3 studs up
local BACK_WINDOW = { x = 8,  y = 3, w = 4, h = 4 }
local SIDE_WINDOW = { x = (SIDE - 4) / 2, y = 3, w = 4, h = 4 }
local doorX = DOOR.x + DOOR.w / 2 - W / 2             -- world X of the doorway centre

local model = Instance.new("Model")
model.Name = "Cottage"

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

-- GROUND: lawn, plinth, front step and a cobbled path to the gate
block("Lawn", YARD_W, LAWN, YARD_D, 0, 0, YARD_Z, C.lawn, "2022 Small Stud")
local plinth = block("Plinth", W + 2, PLINTH, D + 2, 0, 0, 0, C.stone)
block("Step", 6, 0.7, 2, doorX, 0, -D / 2 - 2, C.stone, "2022 Big Stud")
local yardFront = YARD_Z - YARD_D / 2
local stone = 0
for z = -D / 2 - 4, yardFront + 1, -2 do
	for _, sx in ipairs({ -1, 1 }) do
		stone = stone + 1
		block("Cobble", 1.8, 0.3, 1.8, doorX + sx, LAWN - 0.1, z, stone % 2 == 0 and C.cobbleA or C.cobbleB, "2022 Big Stud")
	end
end

-- WALLS: hollow, with real openings
local frontCF = CFrame.new(0, yFloor, zFront)
local backCF = CFrame.new(0, yFloor, zBack) * CFrame.Angles(0, math.pi, 0)
wall("Front", frontCF, W, H, T, { DOOR, WINDOW }, C.walls)
wall("Back", backCF, W, H, T, { BACK_WINDOW }, C.walls)
local sideCFs = {}
for _, sx in ipairs({ -1, 1 }) do
	local cf = CFrame.new(sx * (W - T) / 2, yFloor, 0) * CFrame.Angles(0, math.rad(90), 0)
	wall("Side", cf, SIDE, H, T, { SIDE_WINDOW }, C.walls)
	table.insert(sideCFs, cf)
end
block("Floor", W - 2 * T, 0.2, D - 2 * T, 0, PLINTH, 0, C.floor, "2022 Small Stud")

-- WINDOWS: studded pane, cross bars, and a sill and lintel standing half a stud proud
local function dressWindow(cf, len, o)
	local centre = cf * CFrame.new(o.x + o.w / 2 - len / 2, o.y + o.h / 2, 0)
	make("Part", "Glass", V3(o.w, o.h, 0.4), centre, C.glass, "2022 Small Stud")
	make("Part", "BarV", V3(0.4, o.h, 0.8), centre, C.trim)
	make("Part", "BarH", V3(o.w, 0.4, 0.8), centre, C.trim)
	make("Part", "Sill", V3(o.w + 2, 1, 2), centre * CFrame.new(0, -o.h / 2 - 0.5, 0), C.trim)
	make("Part", "Lintel", V3(o.w + 2, 1, 2), centre * CFrame.new(0, o.h / 2 + 0.5, 0), C.trim)
end
dressWindow(frontCF, W, WINDOW)
dressWindow(backCF, W, BACK_WINDOW)
for _, cf in ipairs(sideCFs) do dressWindow(cf, SIDE, SIDE_WINDOW) end

-- DOORWAY: lintel, jambs, and the door standing open into the room
make("Part", "DoorLintel", V3(DOOR.w + 2, 1, 2), CFrame.new(doorX, yFloor + DOOR.h + 0.5, zFront), C.trim)
for _, sx in ipairs({ -1, 1 }) do
	block("DoorJamb", 0.6, DOOR.h, 1.6, doorX + sx * (DOOR.w / 2 + 0.3), yFloor, zFront, C.trim)
end
local hinge = CFrame.new(doorX - DOOR.w / 2, yFloor, zFront + T / 2) * CFrame.Angles(0, math.rad(-70), 0)
make("Part", "Door", V3(DOOR.w, DOOR.h, 0.4), hinge * CFrame.new(DOOR.w / 2, DOOR.h / 2, 0), C.door, "2022 Small Stud")
make("Ball", "DoorKnob", V3(0.7, 0.7, 0.7), hinge * CFrame.new(DOOR.w - 0.7, DOOR.h / 2, -0.45), C.knob)
block("Mat", 3, 0.2, 1.4, doorX, 0.7, -D / 2 - 2, C.roof, "2022 Small Stud")
lamp("Lantern", V3(0.8, 1.2, 0.8), CFrame.new(doorX + DOOR.w / 2 + 1.6, yFloor + 5.4, zFront - 1), C.light)
block("LanternArm", 0.4, 0.4, 1.2, doorX + DOOR.w / 2 + 1.6, yFloor + 6, zFront - 0.9, C.stone)

-- TIMBER FRAME: corner posts and a wall plate under the eaves
for _, sx in ipairs({ -1, 1 }) do
	for _, sz in ipairs({ -1, 1 }) do
		block("Post", 2, H, 2, sx * (W - T) / 2, yFloor, sz * (D - T) / 2, C.timber)
	end
end
for _, sz in ipairs({ -1, 1 }) do
	block("WallPlate", W, 1, 1.4, 0, yTop - 1, sz * (D - T) / 2, C.timber)
end

-- ROOF: 45 degrees, with a ridge beam, eave boards and a round attic window
gable("Roof", 0, yTop, 0, 2 * RUN, D + 2 * OVER, RISE, false, C.roof, "2022 Big Stud")
block("Ridge", 1, 0.6, D + 2 * OVER + 0.4, 0, yTop + RISE - 0.3, 0, C.timber)
for _, sx in ipairs({ -1, 1 }) do
	block("Eave", 1, 0.6, D + 2 * OVER, sx * (RUN - 0.5), yTop - 0.6, 0, C.trim)
end
local gableZ = -(D / 2 + OVER)
make("Cylinder", "AtticFrame", V3(0.4, 3.2, 3.2), CFrame.new(0, yTop + 4, gableZ - 0.1) * CFrame.Angles(0, math.rad(90), 0), C.trim)
make("Cylinder", "AtticGlass", V3(0.5, 2.2, 2.2), CFrame.new(0, yTop + 4, gableZ - 0.15) * CFrame.Angles(0, math.rad(90), 0), C.glass, "2022 Small Stud")

-- CHIMNEY: starts inside the roof and clears it by five studs
block("Chimney", 3, 10, 3, 6, yTop, 4, C.flue, "2022 Big Stud")
block("ChimneyCap", 4, 1, 4, 6, yTop + 10, 4, C.stone)
column("ChimneyPot", 1.6, 1.5, 6, yTop + 11, 4, C.pot)

-- FLOWER BOX under the front window
local boxX = WINDOW.x + WINDOW.w / 2 - W / 2
local boxY = yFloor + WINDOW.y - 2
block("FlowerBox", 5, 1, 1.4, boxX, boxY, zFront - 1.8, C.timber)
block("Leaves", 4.6, 0.4, 1, boxX, boxY + 1, zFront - 1.8, C.bush, "2022 Small Stud")
for i, colour in ipairs(C.flowers) do
	block("Flower", 0.8, 0.8, 0.8, boxX + (i - 2) * 1.5, boxY + 1.3, zFront - 1.8, colour, "2022 Small Stud")
end

-- GARDEN: two round bushes and a picket fence with a gap for the path
for _, sx in ipairs({ -1, 1 }) do
	make("Ball", "Bush", V3(4, 4, 4), CFrame.new(sx * (W / 2 + 4), LAWN + 1.6, -D / 2 - 3), C.bush, "2022 Big Stud")
end
local fenceZ = yardFront + 0.6
local railFrom = nil
local function closeRail(xEnd)
	if railFrom and xEnd > railFrom then
		for _, y in ipairs({ 1.2, 2.2 }) do
			block("FenceRail", xEnd - railFrom + 0.8, 0.4, 0.4, (railFrom + xEnd) / 2, y, fenceZ, C.trim)
		end
	end
	railFrom = nil
end
local lastX = nil
for x = -YARD_W / 2 + 1, YARD_W / 2 - 1, 3 do
	if math.abs(x - doorX) < 3 then
		closeRail(lastX)
	else
		block("FencePost", 0.8, 3, 0.8, x, LAWN, fenceZ, C.trim)
		railFrom = railFrom or x
		lastX = x
	end
end
closeRail(lastX)

model.PrimaryPart = plinth

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
