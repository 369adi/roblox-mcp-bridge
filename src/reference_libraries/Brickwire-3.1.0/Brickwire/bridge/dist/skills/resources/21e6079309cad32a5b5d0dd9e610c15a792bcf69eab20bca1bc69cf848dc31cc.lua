-- Script and model created by Lurong

--[[
	Sitting Tabby Kitten (retro Roblox brick build)
	Size: about 8 x 14 x 9 studs (W x H x D). Faces -Z.
	SUBJECT TYPE: creature, BLOCK-BUILT (a compact pet, no skeleton).
	SIGNATURE FEATURES: a big square head with pointed ears and pink inner ears;
	yellow eyes with slit pupils and fanned white whiskers; grey tabby stripes on
	the head, back and flanks; a white bib and white-tipped paws; a red collar
	with a bell; and a ringed tail that curls along the flank and round the paws.
	Run this from the Studio command bar: game:GetObjects is Studio-only.
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
	body     = "Black",
	stripe   = "Dark stone grey",
	bib      = "White",
	muzzle   = "Light stone grey",
	eye      = "Cool yellow",
	pupil    = "Really black",
	nose     = "Nougat",
	innerEar = "Sand red",
	tail     = "Really black",
	whisker  = "White",
	collar   = "Bright red",
	bell     = "Bright yellow",
}

-- LAYOUT
local HAUNCH_W, HAUNCH_H, HAUNCH_D, HAUNCH_Z = 6, 3, 5, 1
local TORSO_W, TORSO_H, TORSO_D = 4, 4, 4
local TORSO_Z = HAUNCH_Z - 0.5
local TORSO_FRONT = TORSO_Z - TORSO_D / 2
local NECK_W, NECK_H, NECK_D = 3, 1, 3
local NECK_Y = HAUNCH_H + TORSO_H                 -- base of the neck
local HEAD_W, HEAD_H, HEAD_D = 5, 4, 4
local HEAD_BASE = NECK_Y + NECK_H
local HEAD_Y = HEAD_BASE + HEAD_H / 2             -- centre of the head
local HEAD_TOP = HEAD_BASE + HEAD_H
local HEAD_FRONT = -HEAD_D / 2
local LEG_X, LEG_H, LEG_W = 1, 3, 1
local PAW_H, PAW_D = 1, 2
local LEG_Z = TORSO_FRONT - LEG_W / 2
local PAW_Z = TORSO_FRONT - PAW_D / 2 - 0.5
local EAR_X, EAR_H, EAR_W, EAR_T = 1.5, 2, 2, 1
local INNER = 1.2
local EYE_X, EYE_Y = 1.2, HEAD_Y + 0.5
local MUZ_W, MUZ_H = 2, 1
local MUZ_Y = HEAD_Y - 1
local PLATE = 0.2                                  -- thickness of stripes and face plates
local TAIL_X = HAUNCH_W / 2 + 0.5                  -- the tail runs along the right flank
local TAIL_BACK = HAUNCH_Z + HAUNCH_D / 2 + 0.5
local TAIL_FRONT = PAW_Z - PAW_D / 2 - 0.5

local model = Instance.new("Model")
model.Name = "TabbyKitten"

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

-- BODY: haunches on the ground, upright torso, neck
local haunch = block("Haunch", HAUNCH_W, HAUNCH_H, HAUNCH_D, 0, 0, HAUNCH_Z, C.body, "2022 Small Stud")
block("Torso", TORSO_W, TORSO_H, TORSO_D, 0, HAUNCH_H, TORSO_Z, C.body, "2022 Small Stud")
block("Neck", NECK_W, NECK_H, NECK_D, 0, NECK_Y, TORSO_Z, C.stripe)
block("Bib", TORSO_W - 2, TORSO_H - 1, 0.4, 0, HAUNCH_H, TORSO_FRONT - 0.2, C.bib)

-- collar and bell
block("Collar", NECK_W + 0.4, 0.5, NECK_D + 0.4, 0, NECK_Y + 0.25, TORSO_Z, C.collar, "2022 Small Stud")
make("Ball", "Bell", V3(0.8, 0.8, 0.8), CFrame.new(0, NECK_Y + 0.3, TORSO_Z - NECK_D / 2 - 0.5), C.bell)

-- tabby stripes: across the back of the torso, down the flanks
for i = 0, 2 do
	block("BackStripe", TORSO_W - 1, 0.5, PLATE, 0, HAUNCH_H + 0.6 + i * 1.2, TORSO_Z + TORSO_D / 2 + PLATE / 2, C.stripe, "2022 Small Stud")
end
for _, sx in ipairs({ -1, 1 }) do
	for _, z in ipairs({ 0, 1.4 }) do
		block("TorsoStripe", PLATE, TORSO_H - 1, 0.5, sx * (TORSO_W / 2 + PLATE / 2), HAUNCH_H + 0.5, z, C.stripe, "2022 Small Stud")
	end
	for _, z in ipairs({ 0, 1.5, 3 }) do
		block("FlankStripe", PLATE, HAUNCH_H - 1, 0.5, sx * (HAUNCH_W / 2 + PLATE / 2), 0.8, z, C.stripe, "2022 Small Stud")
	end
end

-- FRONT LEGS, white-tipped paws, and the hind feet peeking out beside them
for _, sx in ipairs({ -1, 1 }) do
	block("Leg", LEG_W, LEG_H, LEG_W, sx * LEG_X, PAW_H, LEG_Z, C.stripe)
	block("Paw", LEG_W, PAW_H, PAW_D, sx * LEG_X, 0, PAW_Z, C.bib)
	block("HindFoot", 1.4, PAW_H, 2, sx * 2.3, 0, TORSO_FRONT - 0.7, C.muzzle)
end

-- HEAD
block("Head", HEAD_W, HEAD_H, HEAD_D, 0, HEAD_BASE, 0, C.body)
make("Part", "Muzzle", V3(MUZ_W, MUZ_H, 1), CFrame.new(0, MUZ_Y, HEAD_FRONT - 0.5), C.muzzle)
make("Part", "Nose", V3(0.6, 0.4, 0.4), CFrame.new(0, MUZ_Y + MUZ_H / 2 - 0.2, HEAD_FRONT - 1.2), C.nose, "2022 Small Stud")
make("Part", "Mouth", V3(0.2, 0.5, PLATE), CFrame.new(0, MUZ_Y - 0.2, HEAD_FRONT - 1.1), C.pupil, "2022 Small Stud")
-- the tabby "M" on the forehead and three stripes over the top of the head
for i = -1, 1 do
	make("Part", "BrowStripe", V3(0.3, i == 0 and 1.4 or 1, PLATE), CFrame.new(i * 0.8, EYE_Y + 1, HEAD_FRONT - PLATE / 2), C.stripe, "2022 Small Stud")
	block("CrownStripe", 0.4, PLATE, HEAD_D - 1, i * 1.1, HEAD_TOP, 0.5, C.stripe, "2022 Small Stud")
end

for _, sx in ipairs({ -1, 1 }) do
	-- eye, slit pupil and a glint
	make("Part", "Eye", V3(1, 1, PLATE), CFrame.new(sx * EYE_X, EYE_Y, HEAD_FRONT - 0.1), C.eye, "2022 Small Stud")
	make("Part", "Pupil", V3(0.4, 0.8, PLATE), CFrame.new(sx * EYE_X, EYE_Y, HEAD_FRONT - 0.3), C.pupil, "2022 Small Stud")
	make("Part", "Glint", V3(0.25, 0.25, PLATE), CFrame.new(sx * EYE_X - 0.25, EYE_Y + 0.25, HEAD_FRONT - 0.35), C.whisker, "2022 Small Stud")
	-- cheek fluff
	block("Cheek", 0.5, 1.4, 2, sx * (HEAD_W / 2 + 0.25), HEAD_BASE + 0.2, -0.5, C.body)
	-- three whiskers fanned from the side of the muzzle
	for _, tilt in ipairs({ -16, 0, 16 }) do
		make("Part", "Whisker", V3(1.8, 0.12, 0.12),
			CFrame.new(sx * (MUZ_W / 2 + 0.2), MUZ_Y, HEAD_FRONT - 0.7) * CFrame.Angles(0, 0, math.rad(sx * tilt)) * CFrame.new(sx * 0.9, 0, 0),
			C.whisker, "2022 Small Stud")
	end
	-- pointed ear, tall edge on the outside, with a pink inner plate on its front face
	local yaw = CFrame.Angles(0, math.rad(sx * 90), 0)
	make("Wedge", "Ear", V3(EAR_T, EAR_H, EAR_W), CFrame.new(sx * EAR_X, HEAD_TOP + EAR_H / 2, 0) * yaw, C.body)
	make("Wedge", "InnerEar", V3(PLATE, INNER, INNER),
		CFrame.new(sx * (EAR_X + 0.3), HEAD_TOP + INNER / 2, -EAR_T / 2 - PLATE / 2) * yaw, C.innerEar, "2022 Small Stud")
end

-- TAIL: out from the back, along the right flank, then curled across the front paws
block("TailRoot", TAIL_X + 1, 1, 1, TAIL_X / 2, 0, TAIL_BACK, C.tail, "2022 Small Stud")
local sideLen = TAIL_BACK - TAIL_FRONT
block("TailSide", 1, 1, sideLen - 1, TAIL_X, 0, (TAIL_BACK + TAIL_FRONT) / 2, C.tail, "2022 Small Stud")
block("TailCurl", TAIL_X + 0.5, 1, 1, TAIL_X / 2 + 0.25, 0, TAIL_FRONT, C.tail, "2022 Small Stud")
block("TailTip", 1, 1, 1, -0.5, 0, TAIL_FRONT, C.bib, "2022 Small Stud")
for i = 0, 3 do
	block("TailRing", 1.2, 1.1, 0.5, TAIL_X, 0, TAIL_BACK - 1.5 - i * 1.8, C.stripe, "2022 Small Stud")
end

model.PrimaryPart = haunch

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
