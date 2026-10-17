-- Script and model created by Lurong

--[[
	Minecraft Wither Boss: a floating skeletal boss of charcoal-black pixel bone.
	Size: about 21 studs wide, 22 studs tall and 7 studs deep. Faces -Z.
	SUBJECT TYPE: creature, BLOCK-BUILT. It is a compact block stack, so it uses no skeleton helpers.
	SIGNATURE FEATURES:
	 1. Three square skulls on a crossbar: a big centre skull and two smaller side skulls.
	 2. Glowing pale eyes in dark sockets under a brow ridge, with a toothed jaw on each skull.
	 3. A long horizontal shoulder crossbar.
	 4. A knuckled spine with three ribs that narrow as they step down, each ending in hooked tips.
	 5. A tail that angles back so the body hangs in the air, its tip just touching y = 0.
	Run this from the Studio command bar, because game:GetObjects only works in Studio.
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
	bone   = "Really black",
	skull  = "Black",
	patch  = "Dark stone grey",
	eye    = "Light stone grey",
	tooth  = "Light stone grey",
	socket = "Really black",
}

-- LAYOUT
local TAIL_L1, TAIL_T1 = 4, 2             -- upper tail: length, thickness
local TAIL_L2, TAIL_T2 = 2, 1             -- tail tip
local TAIL_RAD = math.rad(25)             -- how far the tail swings back
local TAIL_TOP_Y = (TAIL_L1 + TAIL_L2) * math.cos(TAIL_RAD) + (TAIL_T2 / 2) * math.sin(TAIL_RAD)
local SPINE_W, SPINE_H = 2, 8
local SPINE_TOP = TAIL_TOP_Y + SPINE_H
local RIB_WIDTHS = { 7, 6, 5 }
local RIB_H, RIB_D, RIB_GAP = 1, 3, 2
local BAR_L, BAR_T = 16, 2                -- shoulder crossbar
local BAR_Y = SPINE_TOP + BAR_T / 2
local MID_S, SIDE_S = 6, 5                -- skull sizes
local SIDE_X = BAR_L / 2
local MID_Y = SPINE_TOP + BAR_T + MID_S / 2
local SIDE_Y = SPINE_TOP - 0.5 + SIDE_S / 2
local PLATE = 0.2

local model = Instance.new("Model")
model.Name = "WitherBoss"

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

-- One skull of side s centred on (cx, cy, 0): head block, brow, sockets with
-- glowing eyes, nose, toothed jaw and pixel-shading patches.
local function skull(name, cx, cy, s)
	local head = make("Part", name, V3(s, s, s), CFrame.new(cx, cy, 0), C.skull, "2022 Small Stud")
	local face = -s / 2
	local eyeY = cy + s * 0.12
	make("Part", name .. "Brow", V3(s - 0.6, 0.7, 0.5), CFrame.new(cx, eyeY + 1.2, face - 0.25), C.bone)
	make("Part", name .. "Socket", V3(s - 1, 1.6, PLATE), CFrame.new(cx, eyeY, face - PLATE / 2), C.socket)
	local eye
	for _, sx in ipairs({ -1, 1 }) do
		eye = lamp(name .. "Eye", V3(s * 0.26, 0.9, PLATE), CFrame.new(cx + sx * s * 0.22, eyeY, face - PLATE * 1.5), C.eye)
	end
	make("Part", name .. "Nose", V3(0.6, 0.6, PLATE), CFrame.new(cx, eyeY - 1.3, face - PLATE / 2), C.socket, "2022 Small Stud")
	-- jaw: a dark mouth slot, a row of teeth, and a chin standing proud
	local mouthY = cy - s * 0.3
	make("Part", name .. "Mouth", V3(s * 0.66, 1, PLATE), CFrame.new(cx, mouthY, face - PLATE / 2), C.socket)
	for i = 1, 4 do
		make("Part", name .. "Tooth", V3(s * 0.1, 0.55, PLATE),
			CFrame.new(cx + (i - 2.5) * s * 0.16, mouthY + 0.22, face - PLATE * 1.5), C.tooth, "2022 Small Stud")
	end
	make("Part", name .. "Chin", V3(s * 0.7, 0.6, 0.5), CFrame.new(cx, cy - s / 2 + 0.3, face - 0.25), C.bone)
	-- pixel shading on the top and both sides
	make("Part", name .. "TopPatch", V3(s - 2, PLATE, s - 3), CFrame.new(cx + 0.5, cy + s / 2 + PLATE / 2, -0.5), C.patch, "2022 Big Stud")
	for _, sx in ipairs({ -1, 1 }) do
		make("Part", name .. "SidePatch", V3(PLATE, s - 3, s - 2), CFrame.new(cx + sx * (s / 2 + PLATE / 2), cy + 0.5, 0.5), C.patch, "2022 Big Stud")
	end
	return head, eye
end

-- TAIL: angled back from the base of the spine, its tip resting at y = 0
local tailPivot = CFrame.new(0, TAIL_TOP_Y, 0) * CFrame.Angles(-TAIL_RAD, 0, 0)
make("Part", "Tail", V3(TAIL_T1, TAIL_L1, TAIL_T1), tailPivot * CFrame.new(0, -TAIL_L1 / 2, 0), C.bone)
make("Part", "TailTip", V3(TAIL_T2, TAIL_L2, TAIL_T2), tailPivot * CFrame.new(0, -TAIL_L1 - TAIL_L2 / 2, 0), C.bone, "2022 Small Stud")
make("Part", "TailPatch", V3(TAIL_T1 - 0.8, 1.5, PLATE), tailPivot * CFrame.new(0, -TAIL_L1 / 2, -TAIL_T1 / 2 - PLATE / 2), C.patch, "2022 Big Stud")
make("Ball", "TailJoint", V3(SPINE_W + 0.4, SPINE_W + 0.4, SPINE_W + 0.4), CFrame.new(0, TAIL_TOP_Y, 0), C.bone)

-- SPINE with knuckles down the back, and three ribs with hooked tips
block("Spine", SPINE_W, SPINE_H, SPINE_W, 0, TAIL_TOP_Y, 0, C.bone)
for i = 0, 3 do
	block("Vertebra", 1, 1, 0.6, 0, TAIL_TOP_Y + 0.6 + i * 2, SPINE_W / 2 + 0.3, C.patch, "2022 Small Stud")
end
for i, w in ipairs(RIB_WIDTHS) do
	local ribY = SPINE_TOP - 1 - (i - 1) * RIB_GAP - RIB_H
	block("Rib" .. i, w, RIB_H, RIB_D, 0, ribY, 0, C.skull)
	for _, sx in ipairs({ -1, 1 }) do
		block("RibTip", 1, 1.2, RIB_D - 1, sx * (w / 2 - 0.5), ribY - 1.2, -0.5, C.skull)
	end
	block("RibPatch", w - 3, 0.5, PLATE, 0.5, ribY + 0.25, -RIB_D / 2 - PLATE / 2, C.patch, "2022 Big Stud")
end

-- CROSSBAR
block("Crossbar", BAR_L, BAR_T, BAR_T, 0, SPINE_TOP, 0, C.bone)
for _, sx in ipairs({ -1, 1 }) do
	make("Part", "BarPatch", V3(3, 1, PLATE), CFrame.new(sx * BAR_L / 4, BAR_Y, -BAR_T / 2 - PLATE / 2), C.patch, "2022 Big Stud")
end

-- THREE SKULLS
local midHead, midEye = skull("MidSkull", 0, MID_Y, MID_S)
for _, sx in ipairs({ -1, 1 }) do
	skull("SideSkull", sx * SIDE_X, SIDE_Y, SIDE_S)
end
local glow = Instance.new("PointLight")
glow.Color = BrickColor.new(C.eye).Color
glow.Range = 10
glow.Brightness = 1.5
glow.Parent = midEye

model.PrimaryPart = midHead

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
