-- Script and model created by Lurong

--[[
	Minecraft Zombie on a cobblestone forest path.
	Size: about 28 x 17 x 22 studs (W x H x L). The zombie is 16 studs tall on a 1-stud path. Faces -Z.
	SUBJECT TYPE: creature, built as an UPRIGHT CHARACTER (blocky voxel-style humanoid).
	It uses the Minecraft proportions of 1 pixel = 0.5 stud.
	SIGNATURE FEATURES: a big square green head with black eyes, a dark nose and mouth;
	a torn cyan shirt; indigo trousers with a belt and grey shoes; both arms locked
	straight out in front; a shuffling stride. Two oaks, grass tufts and a torch
	frame the cobbled path.
	Run from the Studio command bar: game:GetObjects is Studio-only.
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
	skin      = "Dark green",
	skinDark  = "Earth green",
	skinLight = "Bright green",
	skinPale  = "Sand green",
	shirt     = "Bright bluish green",
	shirtTear = "Medium blue",
	pants     = "Bright violet",
	pantsDark = "Navy blue",
	belt      = "Reddish brown",
	shoe      = "Dark stone grey",
	eye       = "Really black",
	pathBase  = "Dark stone grey",
	cobbleA   = "Medium stone grey",
	cobbleB   = "Light stone grey",
	grass     = "Bright green",
	trunk     = "Reddish brown",
	leaf      = "Earth green",
	leafDark  = "Dark green",
	torch     = "Rust",
	flame     = "Bright orange",
}

-- LAYOUT
local PATH_W, PATH_L, PATH_H = 10, 22, 1
local PATH_Z = -2
local G = PATH_H                  -- top of the path, where the feet rest
local LEG_W, LEG_H = 2, 6
local SHOE_H = 1
local STEP = 0.5                  -- shuffle stride offset
local TORSO_W, TORSO_D, TORSO_H = 4, 2, 6
local WAIST_H = 1
local HEAD = 4
local ARM = 2
local ARM_L = 6
local SLEEVE_L = 2
local ARM_LIFT = 0.5              -- the right arm is raised slightly higher
local PLATE = 0.2
local HIP_Y = G + LEG_H
local SHOULDER_Y = HIP_Y + TORSO_H
local HEAD_TOP = SHOULDER_Y + HEAD
local FACE_Z = -HEAD / 2 - PLATE / 2
local TILE, TILE_H = 2, 0.4
local TILE_XS = { -3, 0, 3 }
local TILE_ZS = { -11, -8, -5, -2, 1, 4, 7 }
local TRUNK_W, TRUNK_H = 2, 10
local TREES = { { x = -9, z = 5 }, { x = 9, z = 1 } }   -- both behind the zombie

local model = Instance.new("Model")
model.Name = "MinecraftZombie"

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

-- COBBLESTONE PATH with grass verges
local base = block("PathBase", PATH_W, PATH_H, PATH_L, 0, 0, PATH_Z, C.pathBase, "2022 Glue")
for _, sx in ipairs({ -1, 1 }) do
	block("Verge", 6, PATH_H - 0.2, PATH_L, sx * (PATH_W / 2 + 3), 0, PATH_Z, C.grass, "2022 Small Stud")
end
local n = 0
for _, tx in ipairs(TILE_XS) do
	for _, tz in ipairs(TILE_ZS) do
		n = n + 1
		-- no raised cobbles where the zombie stands
		if not (tx == 0 and math.abs(tz) <= 2) then
			block("Cobble", TILE, TILE_H, TILE, tx, G - 0.1, tz, (n % 2 == 0) and C.cobbleA or C.cobbleB, "2022 Big Stud")
		end
	end
end
for i, spot in ipairs({ { -7, -9 }, { -9.5, -3 }, { 7, 2 }, { 9.5, 6 }, { 6.5, -11 } }) do
	block("GrassTuft", 0.6, 1 + (i % 2) * 0.6, 0.6, spot[1], PATH_H - 0.2, spot[2], C.leafDark, "2022 Small Stud")
	block("GrassTuft", 0.6, 0.8, 0.6, spot[1] + 0.7, PATH_H - 0.2, spot[2] + 0.3, C.leaf, "2022 Small Stud")
end

-- OAK TREES: square trunk, three stepped tiers of leaves
for _, t in ipairs(TREES) do
	block("Trunk", TRUNK_W, TRUNK_H, TRUNK_W, t.x, PATH_H - 0.2, t.z, C.trunk)
	local top = PATH_H - 0.2 + TRUNK_H
	block("Canopy", 8, 3, 8, t.x, top - 2, t.z, C.leaf, "2022 Big Stud")
	block("Canopy", 6, 2, 6, t.x, top + 1, t.z, C.leafDark, "2022 Big Stud")
	block("Canopy", 3, 2, 3, t.x, top + 3, t.z, C.leaf, "2022 Big Stud")
	block("LeafClump", 3, 2, 3, t.x + 4, top - 1, t.z - 1, C.leafDark, "2022 Big Stud")
end

-- TORCH on a post beside the path
block("TorchPost", 0.6, 4, 0.6, -6, PATH_H - 0.2, -8, C.torch)
local flame = lamp("TorchFlame", V3(0.9, 0.9, 0.9), CFrame.new(-6, PATH_H + 4.2, -8), C.flame)
local fire = Instance.new("PointLight")
fire.Color = flame.Color
fire.Range = 14
fire.Parent = flame

-- LEGS: grey shoes, indigo trousers, dark knee patches
for _, sx in ipairs({ -1, 1 }) do
	local lx, lz = sx * LEG_W / 2, sx * STEP
	block("Shoe", LEG_W, SHOE_H, LEG_W + 0.4, lx, G, lz - 0.2, C.shoe)
	block("Leg", LEG_W, LEG_H - SHOE_H, LEG_W, lx, G + SHOE_H, lz, C.pants)
	make("Part", "KneePatch", V3(1.2, 1, PLATE), CFrame.new(lx, G + 3, lz - LEG_W / 2 - PLATE / 2), C.pantsDark, "2022 Small Stud")
	make("Part", "TrouserHem", V3(LEG_W + 0.2, 0.4, LEG_W + 0.2), CFrame.new(lx, G + SHOE_H + 0.2, lz), C.pantsDark)
end

-- TORSO: belt, torn cyan shirt, bare patch of green skin
block("Waist", TORSO_W, WAIST_H, TORSO_D, 0, HIP_Y, 0, C.pants)
block("Belt", TORSO_W + 0.2, 0.5, TORSO_D + 0.2, 0, HIP_Y + WAIST_H - 0.25, 0, C.belt)
block("Shirt", TORSO_W, TORSO_H - WAIST_H, TORSO_D, 0, HIP_Y + WAIST_H, 0, C.shirt, "2022 Small Stud")
local chestZ = -TORSO_D / 2 - PLATE / 2
make("Part", "Collar", V3(2, 1, PLATE), CFrame.new(0, SHOULDER_Y - 0.5, chestZ), C.skin, "2022 Small Stud")
make("Part", "ShirtTear", V3(1.5, 1, PLATE), CFrame.new(-1, HIP_Y + 2, chestZ), C.shirtTear, "2022 Small Stud")
make("Part", "ShirtHole", V3(1, 1.5, PLATE), CFrame.new(1.2, HIP_Y + 3.5, chestZ), C.skinDark, "2022 Small Stud")

-- HEAD: the big square signature block
block("Head", HEAD, HEAD, HEAD, 0, SHOULDER_Y, 0, C.skin)
make("Part", "Forehead", V3(3, 1, PLATE), CFrame.new(0.5, HEAD_TOP - 1, FACE_Z), C.skinPale, "2022 Small Stud")
make("Part", "Nose", V3(1, 0.5, PLATE), CFrame.new(0, HEAD_TOP - 2.75, FACE_Z), C.skinDark, "2022 Small Stud")
make("Part", "Mouth", V3(2, 0.5, PLATE), CFrame.new(0, HEAD_TOP - 3.35, FACE_Z), C.skinDark, "2022 Small Stud")
make("Part", "HairTop", V3(HEAD, PLATE, HEAD), CFrame.new(0, HEAD_TOP + PLATE / 2, 0), C.skinDark, "2022 Small Stud")
make("Part", "HairPatch", V3(2, PLATE, 2), CFrame.new(-0.5, HEAD_TOP + PLATE * 1.5, 0.5), C.skinLight, "2022 Small Stud")
for _, sx in ipairs({ -1, 1 }) do
	make("Part", "Eye", V3(1, 0.5, PLATE), CFrame.new(sx * 1, HEAD_TOP - 2.25, FACE_Z), C.eye, "2022 Small Stud")
	make("Part", "Cheek", V3(1, 1, PLATE), CFrame.new(sx * 1.5, HEAD_TOP - 3, FACE_Z), C.skinLight, "2022 Small Stud")
	make("Part", "HeadSide", V3(PLATE, 2, 2), CFrame.new(sx * (HEAD / 2 + PLATE / 2), HEAD_TOP - 1.5, 0.5), C.skinDark, "2022 Small Stud")
end

-- ARMS: stiff and straight out in front, with cyan sleeves
for i, sx in ipairs({ -1, 1 }) do
	local lift = (i == 2) and ARM_LIFT or 0
	local ax = sx * (TORSO_W / 2 + ARM / 2)
	local shoulder = V3(ax, SHOULDER_Y - ARM / 2, TORSO_D / 2)
	local hand = V3(ax, SHOULDER_Y - ARM / 2 + lift, TORSO_D / 2 - ARM_L)
	local cuff = shoulder + (hand - shoulder) * (SLEEVE_L / ARM_L)
	bone("Sleeve", shoulder, cuff, ARM + 0.2, ARM + 0.2, C.shirt)
	local armCF, armLen = bone("Arm", cuff, hand, ARM, ARM, C.skin)
	make("Part", "ArmPatch", V3(1, PLATE, 2), armCF * CFrame.new(0, ARM / 2 + PLATE / 2, -armLen / 4), C.skinDark, "2022 Small Stud")
	make("Part", "Hand", V3(1.6, 1.6, PLATE), CFrame.lookAt(hand, hand + (hand - shoulder).Unit) * CFrame.new(0, 0, -PLATE / 2), C.skinDark, "2022 Small Stud")
end

model.PrimaryPart = base

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
