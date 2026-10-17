-- Brickwire resource library — ready-made, tested resources (builds, furniture, gameplay systems, UI, VFX, animation, icons).
-- Prepended (after the BW helpers) to execute_luau code that uses BW.kit / BW.kits / BW.icon / BW.furnish.
-- Every kit: BW.kit(id, {At={x,y,z} (bottom-center, default origin on the ground), Facing=deg, palette=, Name=, Parent=, ...options})
do
	local fail = BW.fail
	local KITS = {}
	local group, look = BW._group, BW._look
	local function K(id, fn) KITS[id] = fn end
	local function base(o)
		local a = BW.v3(o.At or { 0, BW.groundY(), 0 })
		return a.X, a.Y, a.Z
	end
	local function pal(o, def) return BW.palette(o.palette or def) end
	local function model(o, def)
		local m = group(o.Name or def, o)
		BW.default = m
		return m
	end
	local function box(m, name, x0, y0, z0, x1, y1, z1, color, mat, extra)
		local p = { Name = name, From = { x0, y0, z0 }, To = { x1, y1, z1 }, Color = color, Material = mat, Parent = m }
		for k, v in pairs(extra or {}) do p[k] = v end
		return BW.part(p)
	end
	local function src(s, cfg)
		-- {{KEY}} placeholders → values (numbers/strings/booleans, strings are quoted)
		return (string.gsub(s, "{{(%w+)}}", function(k)
			local v = cfg[k]
			if type(v) == "string" then return string.format("%q", v) end
			return tostring(v)
		end))
	end
	BW._kitSrc = src

	-- ================================================================== BUILDINGS
	K("cottage", function(o)
		local x, y, z = base(o)
		local P = pal(o, "medieval")
		local m = model(o, "Cottage")
		local w, d, h = o.width or 20, o.depth or 16, o.height or 9
		local room = BW.room{ Name = "Walls", At = { x, y, z }, Size = { w, h, d }, Color = P.wall, Material = P.wallMat, FloorColor = P.floor, FloorMaterial = P.floorMat, GlassColor = P.glass, Parent = m,
			doors = { { side = "front", width = 4, height = 7 } },
			windows = { { side = "front", offset = -w / 4 - 1, width = 3 }, { side = "front", offset = w / 4 + 1, width = 3 }, { side = "left", width = 4 }, { side = "right", width = 4 }, { side = "back", width = 4 } } }
		local top = room:GetAttribute("BW_Top")
		BW.roof{ Name = "Roof", At = { x, top, z }, Size = { w, d }, style = "gable", height = 6, overhang = 1.5, Color = P.roof, Material = P.roofMat, EndColor = P.wall, Parent = m }
		box(m, "Chimney", x + w / 4, top - 2, z - d / 4 - 1, x + w / 4 + 2.5, top + 8, z - d / 4 + 1.5, "#7A6F66", "Brick")
		BW.stairs{ Name = "Porch", From = { x, y, z + d / 2 }, dir = "+Z", steps = 1, rise = 1, run = 3, width = 8, Color = P.trim, Material = P.trimMat, Parent = m }
		box(m, "DoorFrame", x - 2.5, y + 1 + 7, z + d / 2 - 1.2, x + 2.5, y + 1 + 7.6, z + d / 2 + 0.2, P.trim, P.trimMat)
		return m
	end)

	K("modern_house", function(o)
		local x, y, z = base(o)
		local m = model(o, "ModernHouse")
		local b = BW.building{ Name = "Main", At = { x, y, z }, Size = { o.width or 30, o.depth or 26 }, floors = o.floors or 2, floorHeight = 12, palette = o.palette or "modern", windows = 3, windowWidth = 5, roof = "flat", Parent = m }
		local P = pal(o, "modern")
		local w, d = o.width or 30, o.depth or 26
		-- balcony on the 2nd floor + glass railing
		box(m, "Balcony", x - w / 4, y + 12, z + d / 2, x + w / 4, y + 13, z + d / 2 + 5, P.trim, P.trimMat)
		box(m, "BalconyGlass", x - w / 4, y + 13, z + d / 2 + 4.6, x + w / 4, y + 16, z + d / 2 + 5, P.glass, "Glass", { Transparency = 0.5 })
		box(m, "Driveway", x - w / 2 - 12, y, z + d / 2 - 12, x - w / 2, y + 0.2, z + d / 2, "#5A5A5A", "Concrete")
		BW.plant{ Name = "Hedge1", At = { x + w / 2 - 3, y, z + d / 2 + 3 }, style = "bush", height = 3, Parent = m }
		BW.plant{ Name = "Hedge2", At = { x + w / 2 - 8, y, z + d / 2 + 3 }, style = "bush", height = 3, Parent = m }
		return m
	end)

	K("tower", function(o)
		local x, y, z = base(o)
		local P = pal(o, "medieval")
		local m = model(o, "Tower")
		local h, dia = o.height or 26, o.diameter or 14
		BW.cylinder{ Name = "Body", At = { x, y, z }, height = h, diameter = dia, Color = o.Color or "#8F8A82", Material = "Cobblestone", Parent = m }
		BW.cylinder{ Name = "Ledge", At = { x, y + h, z }, height = 1, diameter = dia + 2, Color = "#7D7870", Material = "Cobblestone", Parent = m }
		BW.ring(10, dia / 2 + 0.3, { x, y + h + 1, z }, function(i, pos, deg)
			if i % 2 == 0 then return BW.part{ Name = "Merlon" .. i, Size = { 2.2, 2.5, 1.4 }, Position = { pos.X, pos.Y + 1.25, pos.Z }, Orientation = { 0, -deg + 90, 0 }, Color = "#8F8A82", Material = "Cobblestone", Parent = m } end
		end)
		box(m, "Door", x - 2, y, z + dia / 2 - 1, x + 2, y + 7, z + dia / 2 + 0.3, P.trim, P.trimMat)
		BW.cylinder{ Name = "FlagPole", At = { x, y + h + 1, z }, height = 9, diameter = 0.4, Color = "#3B3B3B", Material = "Metal", Parent = m }
		box(m, "Flag", x + 0.2, y + h + 7, z - 0.1, x + 4.2, y + h + 9.5, z + 0.1, P.accent, "Fabric")
		return m
	end)

	K("castle_wall", function(o)
		local x, y, z = base(o)
		local m = model(o, "CastleWall")
		local len, h, t = o.length or 40, o.height or 16, 4
		local stone, mat = o.Color or "#8F8A82", "Cobblestone"
		box(m, "Wall", x - len / 2, y, z - t / 2, x + len / 2, y + h, z + t / 2, stone, mat)
		box(m, "Walkway", x - len / 2, y + h, z - t / 2 - 1, x + len / 2, y + h + 0.6, z + t / 2, "#7D7870", mat)
		local n = math.floor(len / 4)
		for i = 0, n - 1 do
			if i % 2 == 0 then
				local x0 = x - len / 2 + i * (len / n)
				box(m, "Merlon" .. i, x0, y + h + 0.6, z + t / 2 - 1.2, x0 + len / n, y + h + 3.4, z + t / 2, stone, mat)
			end
		end
		if o.gate ~= false then
			-- gate opening: rebuild the wall in 3 pieces around it
			m.Wall:Destroy()
			box(m, "WallL", x - len / 2, y, z - t / 2, x - 4, y + h, z + t / 2, stone, mat)
			box(m, "WallR", x + 4, y, z - t / 2, x + len / 2, y + h, z + t / 2, stone, mat)
			box(m, "Lintel", x - 4, y + 10, z - t / 2, x + 4, y + h, z + t / 2, stone, mat)
			box(m, "Portcullis", x - 4, y + 2, z + t / 2 - 0.4, x + 4, y + 10, z + t / 2 - 0.1, "#2E2E2E", "Metal", { Transparency = 0.2 })
		end
		return m
	end)

	K("market_stall", function(o)
		local x, y, z = base(o)
		local m = model(o, "MarketStall")
		local a, b = o.Color or "#D9534F", o.Color2 or "#F5F0E6"
		box(m, "Counter", x - 5, y, z - 1, x + 5, y + 3.5, z + 2, "#8B5A2B", "WoodPlanks")
		box(m, "CounterTop", x - 5.3, y + 3.5, z - 1.3, x + 5.3, y + 3.9, z + 2.3, "#6B4423", "Wood")
		for i, px in ipairs({ -5, 5 }) do
			for j, pz in ipairs({ -3, 2 }) do box(m, "Post" .. i .. j, x + px - 0.3, y, z + pz - 0.3, x + px + 0.3, y + 9, z + pz + 0.3, "#6B4423", "Wood") end
		end
		for i = 0, 5 do
			local x0 = x - 6 + i * 2
			BW.part{ Name = "Awning" .. i, Class = "WedgePart", Size = { 2, 1.5, 7 }, Position = { x0 + 1, y + 9.75, z - 0.5 }, Orientation = { 0, 180, 0 }, Color = (i % 2 == 0) and a or b, Material = "Fabric", Parent = m }
		end
		for i = 1, 3 do BW.part{ Name = "Crate" .. i, At = { x - 6 + i * 3, y, z - 3.2 }, Size = { 2, 2, 2 }, Color = "#A0703C", Material = "WoodPlanks", Parent = m } end
		BW.part{ Name = "Apples", Shape = "Ball", Size = { 1.2, 1.2, 1.2 }, Position = { x - 2, y + 4.5, z + 0.5 }, Color = "#C0392B", Parent = m }
		BW.part{ Name = "Melon", Shape = "Ball", Size = { 1.6, 1.6, 1.6 }, Position = { x + 2, y + 4.7, z + 0.5 }, Color = "#27AE60", Parent = m }
		return m
	end)

	K("well", function(o)
		local x, y, z = base(o)
		local m = model(o, "Well")
		BW.ring(12, 3, { x, y, z }, function(i, pos, deg)
			return BW.part{ Name = "Stone" .. i, Size = { 1.8, 3, 1.2 }, Position = { pos.X, y + 1.5, pos.Z }, Orientation = { 0, -deg + 90, 0 }, Color = (i % 2 == 0) and "#8C8C8C" or "#7A7A7A", Material = "Slate", Parent = m }
		end)
		BW.cylinder{ Name = "Water", At = { x, y + 1.6, z }, height = 0.3, diameter = 5, Color = "#2E86C1", Material = "Glass", Transparency = 0.3, Parent = m }
		box(m, "PostL", x - 3.6, y, z - 0.3, x - 3, y + 7, z + 0.3, "#6B4423", "Wood")
		box(m, "PostR", x + 3, y, z - 0.3, x + 3.6, y + 7, z + 0.3, "#6B4423", "Wood")
		BW.cylinder{ Name = "Crank", At = { x, y + 6, z }, height = 6.6, diameter = 0.5, axis = "X", Color = "#5A3A1E", Parent = m }
		BW.roof{ Name = "Roof", At = { x, y + 7, z }, Size = { 8, 5 }, style = "gable", height = 2.5, overhang = 0.5, ridge = "X", Color = "#8B4513", Material = "WoodPlanks", Parent = m }
		return m
	end)

	K("bridge", function(o)
		local x, y, z = base(o)
		local m = model(o, "Bridge")
		local len, w = o.length or 30, o.width or 8
		local deckY = y + (o.deckHeight or 4)
		for i = 0, math.floor(len / 1.5) - 1 do
			local x0 = x - len / 2 + i * 1.5
			box(m, "Plank" .. i, x0, deckY, z - w / 2, x0 + 1.4, deckY + 0.5, z + w / 2, (i % 2 == 0) and "#8B5A2B" or "#7A4E25", "WoodPlanks")
		end
		for _, side in ipairs({ -1, 1 }) do
			box(m, "Beam" .. side, x - len / 2, deckY - 1, z + side * (w / 2 - 0.5) - 0.5, x + len / 2, deckY, z + side * (w / 2 - 0.5) + 0.5, "#5A3A1E", "Wood")
			BW.fence({ x - len / 2, deckY + 0.5, z + side * (w / 2 - 0.3) }, { x + len / 2, deckY + 0.5, z + side * (w / 2 - 0.3) }, { Name = "Rail" .. side, height = 3.5, spacing = 5, Color = "#6B4423", Material = "Wood", Parent = m })
			for _, px in ipairs({ -len / 2, len / 2 }) do box(m, "Pillar", x + px - 0.6, y, z + side * (w / 2 - 0.5) - 0.6, x + px + 0.6, deckY - 1, z + side * (w / 2 - 0.5) + 0.6, "#5A3A1E", "Wood") end
		end
		return m
	end)

	K("lamp_post", function(o)
		local x, y, z = base(o)
		local m = model(o, "LampPost")
		local h = o.height or 12
		box(m, "Base", x - 0.8, y, z - 0.8, x + 0.8, y + 1, z + 0.8, "#2B2B2B", "Metal")
		BW.cylinder{ Name = "Pole", At = { x, y + 1, z }, height = h - 1, diameter = 0.5, Color = "#2B2B2B", Material = "Metal", Parent = m }
		box(m, "Arm", x, y + h - 0.4, z - 0.2, x + 2.2, y + h, z + 0.2, "#2B2B2B", "Metal")
		local lamp = box(m, "Lamp", x + 1.4, y + h - 1.6, z - 0.6, x + 2.6, y + h - 0.4, z + 0.6, o.LightColor or "#FFE6A8", "Neon")
		BW.light(lamp, "PointLight", { Color = o.LightColor or "#FFD58A", Range = 18, Brightness = 2 })
		return m
	end)

	K("bench", function(o)
		local x, y, z = base(o)
		local m = model(o, "Bench")
		local wood, metal = o.Color or "#8B5A2B", "#2B2B2B"
		for i = 0, 2 do box(m, "Seat" .. i, x - 3, y + 1.6, z - 1 + i * 0.7, x + 3, y + 1.9, z - 0.4 + i * 0.7, wood, "WoodPlanks") end
		for i = 0, 1 do box(m, "Back" .. i, x - 3, y + 2.4 + i * 0.8, z - 1.2, x + 3, y + 2.9 + i * 0.8, z - 0.9, wood, "WoodPlanks") end
		for _, px in ipairs({ -2.6, 2.6 }) do
			box(m, "Leg", x + px - 0.15, y, z - 1.2, x + px + 0.15, y + 1.6, z + 1, metal, "Metal")
			box(m, "BackLeg", x + px - 0.15, y + 1.6, z - 1.2, x + px + 0.15, y + 4.1, z - 0.9, metal, "Metal")
		end
		return m
	end)

	K("campfire", function(o)
		local x, y, z = base(o)
		local m = model(o, "Campfire")
		BW.ring(9, 2.2, { x, y, z }, function(i, pos)
			return BW.part{ Name = "Stone" .. i, Shape = "Ball", Size = { 1.3, 1.3, 1.3 }, Position = { pos.X, y + 0.5, pos.Z }, Color = "#7F7F7F", Material = "Slate", Parent = m }
		end)
		for i = 0, 2 do
			BW.part{ Name = "Log" .. i, Shape = "Cylinder", Size = { 3.2, 0.7, 0.7 }, Position = { x, y + 0.5, z }, Orientation = { 0, i * 60, 18 }, Color = "#5A3A1E", Material = "Wood", Parent = m }
		end
		local core = box(m, "Embers", x - 0.6, y, z - 0.6, x + 0.6, y + 0.4, z + 0.6, "#FF6A00", "Neon")
		BW.particles(core, "fire", { Rate = 35 })
		BW.particles(core, "smoke", { Rate = 4 })
		BW.light(core, "PointLight", { Color = "#FF9A3C", Range = 16, Brightness = 3 })
		return m
	end)

	K("fountain", function(o)
		local x, y, z = base(o)
		local m = model(o, "Fountain")
		local r = o.radius or 7
		BW.cylinder{ Name = "Basin", At = { x, y, z }, height = 2.5, diameter = r * 2, Color = "#BDBDBD", Material = "Marble", Parent = m }
		BW.cylinder{ Name = "Water", At = { x, y + 2.5, z }, height = 0.2, diameter = r * 2 - 1.5, Color = "#4FA3E0", Material = "Glass", Transparency = 0.25, Parent = m }
		BW.cylinder{ Name = "Column", At = { x, y + 2.5, z }, height = 5, diameter = 1.6, Color = "#D0D0D0", Material = "Marble", Parent = m }
		BW.cylinder{ Name = "Bowl", At = { x, y + 7.5, z }, height = 1, diameter = 5, Color = "#BDBDBD", Material = "Marble", Parent = m }
		local spout = BW.cylinder{ Name = "Spout", At = { x, y + 8.5, z }, height = 1, diameter = 0.8, Color = "#D0D0D0", Material = "Marble", Parent = m }
		BW.particles(spout, "sparkles", { Color = "#BFE6FF", Rate = 30, Speed = { 6, 9 }, Lifetime = { 0.8, 1.2 }, Size = { 0.5, 0.2 }, Acceleration = Vector3.new(0, -20, 0), SpreadAngle = Vector2.new(25, 25) })
		return m
	end)

	K("watchtower", function(o)
		local x, y, z = base(o)
		local m = model(o, "Watchtower")
		local h = o.height or 18
		local wood = "#6B4423"
		for i, p in ipairs({ { -4, -4 }, { 4, -4 }, { -4, 4 }, { 4, 4 } }) do box(m, "Leg" .. i, x + p[1] - 0.5, y, z + p[2] - 0.5, x + p[1] + 0.5, y + h, z + p[2] + 0.5, wood, "Wood") end
		box(m, "Platform", x - 5, y + h, z - 5, x + 5, y + h + 0.8, z + 5, "#8B5A2B", "WoodPlanks")
		for _, s in ipairs({ { { -5, -5 }, { 5, -5 } }, { { 5, -5 }, { 5, 5 } }, { { 5, 5 }, { -5, 5 } }, { { -5, 5 }, { -5, -5 } } }) do
			BW.fence({ x + s[1][1], y + h + 0.8, z + s[1][2] }, { x + s[2][1], y + h + 0.8, z + s[2][2] }, { Name = "Railing", height = 3, spacing = 2.5, Color = wood, Material = "Wood", Parent = m })
		end
		for i = 1, math.floor(h / 1.5) do box(m, "Rung" .. i, x - 1, y + i * 1.5 - 0.15, z + 5.1, x + 1, y + i * 1.5 + 0.15, z + 5.4, wood, "Wood") end
		box(m, "LadderL", x - 1.2, y, z + 5.1, x - 0.9, y + h + 0.8, z + 5.4, wood, "Wood")
		box(m, "LadderR", x + 0.9, y, z + 5.1, x + 1.2, y + h + 0.8, z + 5.4, wood, "Wood")
		for i, p in ipairs({ { -4.5, -4.5 }, { 4.5, -4.5 }, { -4.5, 4.5 }, { 4.5, 4.5 } }) do box(m, "RoofPost" .. i, x + p[1] - 0.3, y + h + 0.8, z + p[2] - 0.3, x + p[1] + 0.3, y + h + 7, z + p[2] + 0.3, wood, "Wood") end
		BW.roof{ Name = "Roof", At = { x, y + h + 7, z }, Size = { 10, 10 }, style = "gable", height = 3, overhang = 1, Color = "#7A3B1E", Material = "WoodPlanks", Parent = m }
		return m
	end)

	K("skyscraper", function(o)
		local x, y, z = base(o)
		local m = model(o, "Skyscraper")
		local floors = o.floors or 8
		BW.building{ Name = "Tower", At = { x, y, z }, Size = { o.width or 30, o.depth or 30 }, floors = floors, floorHeight = 12, palette = o.palette or "modern", windows = 4, windowWidth = 4, roof = "none", Parent = m }
		local top = y + floors * 12 + 1
		box(m, "RoofUnit", x - 5, top, z - 5, x + 5, top + 4, z + 5, "#9E9E9E", "DiamondPlate")
		BW.cylinder{ Name = "Antenna", At = { x, top + 4, z }, height = 14, diameter = 0.6, Color = "#BDBDBD", Material = "Metal", Parent = m }
		local tip = BW.part{ Name = "Beacon", Shape = "Ball", Size = { 1.2, 1.2, 1.2 }, Position = { x, top + 18.4, z }, Color = "#FF3B30", Material = "Neon", Parent = m }
		BW.light(tip, "PointLight", { Color = "#FF3B30", Range = 20 })
		return m
	end)

	K("shop_building", function(o)
		local x, y, z = base(o)
		local P = pal(o, "modern")
		local m = model(o, "Shop")
		local w, d, h = o.width or 24, o.depth or 18, 11
		local room = BW.room{ Name = "Walls", At = { x, y, z }, Size = { w, h, d }, Color = P.wall, Material = P.wallMat, FloorColor = P.floor, FloorMaterial = P.floorMat, GlassColor = P.glass, ceiling = true, Parent = m,
			doors = { { side = "front", width = 5, height = 8 } },
			windows = { { side = "front", offset = -w / 4 - 1.25, width = w / 2 - 6, height = 6, bottom = 1.5 }, { side = "front", offset = w / 4 + 1.25, width = w / 2 - 6, height = 6, bottom = 1.5 } } }
		local top = room:GetAttribute("BW_Top")
		local sign = box(m, "Sign", x - w / 2 + 2, top - 3.2, z + d / 2, x + w / 2 - 2, top - 0.6, z + d / 2 + 0.6, P.accent, "SmoothPlastic")
		local sg = BW.new("SurfaceGui", { Name = "SignGui", Face = "Front", Parent = sign })
		BW.new("TextLabel", { Name = "Text", Text = o.title or "SHOP", Size = { 1, 0, 1, 0 }, BackgroundTransparency = 1, TextScaled = true, Font = "GothamBlack", TextColor3 = "#FFFFFF", Parent = sg })
		for i = 0, 3 do
			BW.part{ Name = "Awning" .. i, Class = "WedgePart", Size = { w / 4, 1.2, 3 }, Position = { x - w / 2 + w / 8 + i * w / 4, top - 4.4, z + d / 2 + 1.5 }, Orientation = { 0, 180, 0 }, Color = (i % 2 == 0) and P.accent or "#FFFFFF", Material = "Fabric", Parent = m }
		end
		box(m, "Counter", x - 4, y + 1, z - d / 2 + 3, x + 4, y + 4.5, z - d / 2 + 5, P.trim, P.trimMat)
		return m
	end)

	K("house_plan", function(o)
		local x, y, z = base(o)
		local P = pal(o, "nature")
		local m = model(o, "PlanHouse")
		local fp = BW.floorplan(o.plan or {
			"##W####W####W##",
			"#.....#.......#",
			"W.....D.......W",
			"#.....#.......#",
			"###D######W####",
			"#.....#.......#",
			"W.....D.......#",
			"#######D#######",
		}, { Name = "Floor", At = { x, y, z }, cell = 2, height = 10, palette = o.palette or "nature", Parent = m })
		local cols, rows = 15, 8
		BW.roof{ Name = "Roof", At = { x, fp:GetAttribute("BW_Top"), z }, Size = { cols * 2, rows * 2 }, style = "gable", height = 6, overhang = 1.2, Color = P.roof, Material = P.roofMat, EndColor = P.wall, Parent = m }
		return m
	end)

	K("park", function(o)
		local x, y, z = base(o)
		local m = model(o, "Park")
		local s = o.size or 60
		box(m, "Lawn", x - s / 2, y, z - s / 2, x + s / 2, y + 0.3, z + s / 2, "#5DAA47", "Grass")
		BW.path({ { x - s / 2, z }, { x + s / 2, z } }, { Name = "PathX", y = y + 0.3, width = 5, Parent = m })
		BW.path({ { x, z - s / 2 }, { x, z + s / 2 } }, { Name = "PathZ", y = y + 0.31, width = 5, Parent = m })
		KITS.fountain({ Name = "Fountain", At = { x, y + 0.3, z }, Parent = m, radius = 5 })
		for i, p in ipairs({ { 9, 5 }, { -9, -5 }, { 5, -9 }, { -5, 9 } }) do
			KITS.bench({ Name = "Bench" .. i, At = { x + p[1], y + 0.3, z + p[2] }, Parent = m })
		end
		for i, p in ipairs({ { 4, 14 }, { -4, -14 }, { 14, -4 }, { -14, 4 } }) do KITS.lamp_post({ Name = "Lamp" .. i, At = { x + p[1], y + 0.3, z + p[2] }, Parent = m }) end
		BW.scatter({ From = { x - s / 2 + 4, z - s / 2 + 4 }, To = { x + s / 2 - 4, z + s / 2 - 4 } }, o.trees or 10, function(i, pos, rnd)
			if math.abs(pos.X - x) < 7 or math.abs(pos.Z - z) < 7 then return nil end
			return BW.plant{ Name = "Tree" .. i, At = { pos.X, y + 0.3, pos.Z }, style = (i % 3 == 0) and "pine" or "oak", height = 11 + rnd(0, 5), Parent = m }
		end, { seed = o.seed or 4, minDist = 9 })
		return m
	end)

	K("barn", function(o)
		local x, y, z = base(o)
		local m = model(o, "Barn")
		local w, d, h = 22, 30, 12
		BW.room{ Name = "Walls", At = { x, y, z }, Size = { w, h, d }, Color = "#A93226", Material = "WoodPlanks", FloorColor = "#8B6B3E", FloorMaterial = "WoodPlanks", Parent = m,
			doors = { { side = "front", width = 10, height = 10 } }, windows = { { side = "left", width = 3 }, { side = "right", width = 3 } } }
		BW.roof{ Name = "Roof", At = { x, y + h + 1, z }, Size = { w, d }, style = "gable", height = 8, overhang = 1, ridge = "Z", Color = "#5D6D7E", Material = "CorrodedMetal", EndColor = "#A93226", Parent = m }
		box(m, "DoorX1", x - 5, y + 1, z + d / 2 + 0.05, x + 5, y + 1.6, z + d / 2 + 0.35, "#FFFFFF", "Wood")
		box(m, "Hay", x - 8, y + 1, z - 12, x - 4, y + 4, z - 8, "#E5C76B", "Fabric")
		return m
	end)

	-- ================================================================== FURNITURE (interiors; At = floor point)
	K("table", function(o)
		local x, y, z = base(o)
		local m = model(o, "Table")
		local w, d, c = o.width or 6, o.depth or 4, o.Color or "#8B5A2B"
		box(m, "Top", x - w / 2, y + 3, z - d / 2, x + w / 2, y + 3.4, z + d / 2, c, "WoodPlanks")
		for i, p in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
			local lx, lz = x + p[1] * (w / 2 - 0.4), z + p[2] * (d / 2 - 0.4)
			box(m, "Leg" .. i, lx - 0.2, y, lz - 0.2, lx + 0.2, y + 3, lz + 0.2, c, "Wood")
		end
		return m
	end)
	K("chair", function(o)
		local x, y, z = base(o)
		local m = model(o, "Chair")
		local c = o.Color or "#8B5A2B"
		local seat = BW.part{ Name = "Seat", Class = "Seat", From = { x - 1, y + 1.8, z - 1 }, To = { x + 1, y + 2.1, z + 1 }, Color = c, Material = "WoodPlanks", Parent = m }
		box(m, "Back", x - 1, y + 2.1, z - 1, x + 1, y + 4.4, z - 0.75, c, "WoodPlanks")
		for i, p in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do
			local lx, lz = x + p[1] * 0.8, z + p[2] * 0.8
			box(m, "Leg" .. i, lx - 0.15, y, lz - 0.15, lx + 0.15, y + 1.8, lz + 0.15, c, "Wood")
		end
		return m
	end)
	K("bed", function(o)
		local x, y, z = base(o)
		local m = model(o, "Bed")
		box(m, "Frame", x - 2.5, y, z - 4, x + 2.5, y + 1.2, z + 4, o.Color or "#6B4423", "Wood")
		box(m, "Mattress", x - 2.3, y + 1.2, z - 3.8, x + 2.3, y + 2, z + 3.8, "#F2F2F2", "Fabric")
		box(m, "Blanket", x - 2.35, y + 1.25, z - 1, x + 2.35, y + 2.1, z + 3.85, o.Accent or "#3D6CB9", "Fabric")
		box(m, "Pillow", x - 1.8, y + 2, z - 3.6, x + 1.8, y + 2.6, z - 2.4, "#FFFFFF", "Fabric")
		box(m, "Headboard", x - 2.5, y, z - 4.4, x + 2.5, y + 4, z - 4, o.Color or "#6B4423", "Wood")
		return m
	end)
	K("bookshelf", function(o)
		local x, y, z = base(o)
		local m = model(o, "Bookshelf")
		local c = o.Color or "#6B4423"
		box(m, "Back", x - 3, y, z - 0.8, x + 3, y + 8, z - 0.6, c, "Wood")
		box(m, "SideL", x - 3, y, z - 0.8, x - 2.7, y + 8, z + 0.8, c, "Wood")
		box(m, "SideR", x + 2.7, y, z - 0.8, x + 3, y + 8, z + 0.8, c, "Wood")
		local cols = { "#C0392B", "#2980B9", "#27AE60", "#F1C40F", "#8E44AD", "#D35400" }
		local rnd = BW.rng(o.seed or 2)
		for s = 0, 3 do
			local sy = y + s * 2
			box(m, "Shelf" .. s, x - 2.7, sy, z - 0.6, x + 2.7, sy + 0.25, z + 0.8, c, "Wood")
			local bx = x - 2.6
			local n = 0
			while bx < x + 2.2 do
				local bw = rnd(0.3, 0.55)
				n = n + 1
				box(m, "Book" .. s .. "_" .. n, bx, sy + 0.25, z - 0.5, bx + bw, sy + 0.25 + rnd(1.1, 1.6), z + 0.5, cols[(n + s) % #cols + 1], "SmoothPlastic")
				bx = bx + bw + 0.03
			end
		end
		box(m, "Top", x - 3, y + 8, z - 0.8, x + 3, y + 8.25, z + 0.8, c, "Wood")
		return m
	end)
	K("sofa", function(o)
		local x, y, z = base(o)
		local m = model(o, "Sofa")
		local c = o.Color or "#5D6D7E"
		box(m, "Base", x - 4, y, z - 1.5, x + 4, y + 1.6, z + 1.5, c, "Fabric")
		box(m, "Back", x - 4, y + 1.6, z - 1.5, x + 4, y + 4, z - 0.7, c, "Fabric")
		box(m, "ArmL", x - 4.6, y, z - 1.5, x - 4, y + 2.8, z + 1.5, c, "Fabric")
		box(m, "ArmR", x + 4, y, z - 1.5, x + 4.6, y + 2.8, z + 1.5, c, "Fabric")
		for i = 0, 1 do box(m, "Cushion" .. i, x - 3.9 + i * 3.95, y + 1.6, z - 0.7, x - 0.05 + i * 3.95, y + 2.2, z + 1.4, "#85929E", "Fabric") end
		return m
	end)
	K("kitchen", function(o)
		local x, y, z = base(o)
		local m = model(o, "Kitchen")
		local len = o.length or 12
		box(m, "Cabinets", x - len / 2, y, z - 1.2, x + len / 2, y + 3.4, z + 1.2, "#ECF0F1", "SmoothPlastic")
		box(m, "Worktop", x - len / 2 - 0.1, y + 3.4, z - 1.3, x + len / 2 + 0.1, y + 3.7, z + 1.3, "#34495E", "Marble")
		box(m, "Sink", x - 1.5, y + 3.71, z - 0.7, x + 0.5, y + 3.75, z + 0.7, "#BDC3C7", "Metal")
		box(m, "Stove", x + 2, y + 3.71, z - 0.9, x + 4, y + 3.8, z + 0.9, "#1C1C1C", "Metal")
		box(m, "Fridge", x + len / 2 + 0.2, y, z - 1.2, x + len / 2 + 3, y + 7, z + 1.2, "#D5D8DC", "Metal")
		for i = 0, math.floor(len / 3) - 1 do box(m, "Handle" .. i, x - len / 2 + 1.2 + i * 3, y + 2.6, z + 1.2, x - len / 2 + 1.8 + i * 3, y + 2.8, z + 1.3, "#7F8C8D", "Metal") end
		return m
	end)
	K("floor_lamp", function(o)
		local x, y, z = base(o)
		local m = model(o, "FloorLamp")
		BW.cylinder{ Name = "Foot", At = { x, y, z }, height = 0.3, diameter = 1.6, Color = "#2B2B2B", Material = "Metal", Parent = m }
		BW.cylinder{ Name = "Pole", At = { x, y + 0.3, z }, height = 5.5, diameter = 0.25, Color = "#2B2B2B", Material = "Metal", Parent = m }
		local shade = BW.cylinder{ Name = "Shade", At = { x, y + 5.6, z }, height = 1.6, diameter = 2, Color = "#F7E7C6", Material = "Fabric", Parent = m }
		BW.light(shade, "PointLight", { Color = "#FFE2A8", Range = 14, Brightness = 1.5 })
		return m
	end)
	K("rug", function(o)
		local x, y, z = base(o)
		local m = model(o, "Rug")
		box(m, "Rug", x - 4, y, z - 3, x + 4, y + 0.1, z + 3, o.Color or "#A93226", "Fabric")
		box(m, "Inner", x - 3.2, y + 0.1, z - 2.2, x + 3.2, y + 0.12, z + 2.2, o.Accent or "#F5CBA7", "Fabric")
		return m
	end)
	K("potted_plant", function(o)
		local x, y, z = base(o)
		local m = model(o, "PottedPlant")
		BW.cylinder{ Name = "Pot", At = { x, y, z }, height = 1.6, diameter = 1.6, Color = "#B9663C", Material = "Slate", Parent = m }
		BW.plant{ Name = "Plant", At = { x, y + 1.6, z }, style = "bush", height = 2.5, Parent = m }
		return m
	end)
	K("tv", function(o)
		local x, y, z = base(o)
		local m = model(o, "TV")
		box(m, "Stand", x - 3, y, z - 1, x + 3, y + 2, z + 1, "#2B2B2B", "Wood")
		box(m, "Screen", x - 3.5, y + 2.2, z - 0.2, x + 3.5, y + 6.2, z + 0.2, "#111111", "SmoothPlastic")
		box(m, "Display", x - 3.3, y + 2.4, z + 0.2, x + 3.3, y + 6, z + 0.25, "#3A7BD5", "Neon", { Transparency = 0.2 })
		return m
	end)

	-- Furnish a room (BW.room / BW.floorplan model or any model with a floor): picks furniture for the room type
	-- and places it along the walls inside the bounds. kind = "bedroom" | "living" | "kitchen" | "office" | "shop"
	function BW.furnish(target, kind, opts)
		opts = opts or {}
		local inst, list = BW._partsOf(target)
		local lo, hi = BW._boundsOf(list)
		if not lo then fail("furnish: no parts in " .. tostring(target)) end
		local fy = opts.floorY or lo[2] + 1
		local x0, x1, z0, z1 = lo[1] + 2, hi[1] - 2, lo[3] + 2, hi[3] - 2
		local cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
		local w, d = x1 - x0, z1 - z0
		if w < 8 or d < 8 then fail("furnish: room interior is too small (" .. math.floor(w) .. "x" .. math.floor(d) .. ", needs 8x8)") end
		local par = opts.Parent or inst
		local plans = {
			bedroom = { { "bed", x0 + 3, z0 + 4.5 }, { "bookshelf", x1 - 3.2, z0 + 1 }, { "rug", cx, cz + 1 }, { "floor_lamp", x0 + 7, z0 + 1.5 }, { "potted_plant", x1 - 1.2, z1 - 1.2 } },
			living = { { "sofa", cx, z0 + 2 }, { "tv", cx, z1 - 1.2, 180 }, { "rug", cx, cz }, { "floor_lamp", x0 + 1.2, z0 + 1.2 }, { "potted_plant", x1 - 1.2, z0 + 1.2 }, { "bookshelf", x0 + 3.2, z1 - 1 } },
			kitchen = { { "kitchen", cx - 1.5, z0 + 1.4, nil, { length = math.min(12, w - 5) } }, { "table", cx, cz + 1.5 }, { "chair", cx - 2, cz + 4.2, 180 }, { "chair", cx + 2, cz + 4.2, 180 }, { "chair", cx, cz - 1.5 } },
			office = { { "table", cx, cz }, { "chair", cx, cz - 2.6 }, { "bookshelf", x0 + 3.2, z0 + 1 }, { "bookshelf", x1 - 3.2, z0 + 1 }, { "floor_lamp", x1 - 1.2, z1 - 1.2 }, { "potted_plant", x0 + 1.2, z1 - 1.2 } },
			shop = { { "table", cx, z0 + 3, nil, { width = math.min(10, w - 4), depth = 3 } }, { "bookshelf", x0 + 3.2, z1 - 1, 180 }, { "bookshelf", x1 - 3.2, z1 - 1, 180 }, { "potted_plant", x0 + 1.2, z0 + 1.2 }, { "rug", cx, cz + 2 } },
		}
		local plan = plans[kind or "living"]
		if not plan then fail("furnish kind must be bedroom, living, kitchen, office or shop") end
		local out = {}
		for i, it in ipairs(plan) do
			local ko = { Name = it[1] .. i, At = { it[2], fy, it[3] }, Facing = it[4], Parent = par, _quiet = true }
			for k, v in pairs(it[5] or {}) do ko[k] = v end
			table.insert(out, BW.kit(it[1], ko))
		end
		print("BW_FURNISH " .. inst:GetFullName() .. " as " .. (kind or "living") .. ": " .. #out .. " items")
		return out
	end

	-- ================================================================== GAMEPLAY SYSTEMS (parts + server scripts, best practices built in)
	local function serverScript(name, parent, source) return BW.script("Script", name, parent, source) end
	local function remote(name) return BW.remote(name) end

	local STAGE_SRC = [==[
-- Brickwire kit: obby checkpoints. Every SpawnLocation named StageN in this model is a checkpoint.
local Players = game:GetService("Players")
local model = script.Parent
local stages = {}
for _, d in ipairs(model:GetDescendants()) do
	local n = d:IsA("SpawnLocation") and tonumber(string.match(d.Name, "^Stage(%d+)$"))
	if n then stages[n] = d end
end
local function stat(player)
	local ls = player:FindFirstChild("leaderstats")
	if not ls then
		ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		ls.Parent = player
	end
	local s = ls:FindFirstChild("Stage")
	if not s then
		s = Instance.new("IntValue")
		s.Name = "Stage"
		s.Value = 1
		s.Parent = ls
	end
	return s
end
Players.PlayerAdded:Connect(function(player)
	local s = stat(player)
	player.CharacterAdded:Connect(function(char)
		task.wait()
		local cp = stages[s.Value]
		if cp then char:PivotTo(cp.CFrame + Vector3.new(0, 4, 0)) end
	end)
end)
for n, cp in pairs(stages) do
	cp.Touched:Connect(function(hit)
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		if not player then return end
		local s = stat(player)
		if n == s.Value + 1 then s.Value = n end
	end)
end
]==]
	local KILL_SRC = [==[
-- Brickwire kit: every part named Kill/Lava inside this model kills on touch (debounced per character).
local model = script.Parent
local touched = {}
local function hook(p)
	if not p:IsA("BasePart") then return end
	if not (string.find(p.Name, "^Kill") or string.find(p.Name, "^Lava")) then return end
	p.Touched:Connect(function(hit)
		local hum = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 and not touched[hum] then
			touched[hum] = true
			hum.Health = 0
			task.delay(1, function() touched[hum] = nil end)
		end
	end)
end
for _, d in ipairs(model:GetDescendants()) do hook(d) end
]==]

	K("obby", function(o)
		local x, y, z = base(o)
		local m = model(o, "Obby")
		local n = o.stages or 5
		local colors = { "#FF5E5B", "#FFB400", "#00C49A", "#2E86DE", "#A55EEA", "#FF6B81" }
		local cz = z
		for s = 1, n do
			local col = colors[(s - 1) % #colors + 1]
			BW.part{ Name = "Stage" .. s, Class = "SpawnLocation", At = { x, y + (s - 1) * 2, cz }, Size = { 10, 1, 10 }, Color = col, Material = "SmoothPlastic", Parent = m, Attributes = { Stage = s } }
			if s < n then
				-- jumps: small pads, a kill-brick strip and gaps that grow with the stage
				local gap = 4 + s * 0.6
				local py = y + (s - 1) * 2
				local pz = cz + 5
				for j = 1, 3 do
					pz = pz + gap
					BW.part{ Name = "Jump" .. s .. "_" .. j, At = { x + ((j % 2 == 0) and 3 or -3), py + j * 0.5, pz }, Size = { 4, 1, 4 }, Color = col, Material = "SmoothPlastic", Parent = m }
				end
				BW.part{ Name = "Kill" .. s, At = { x, py - 3, (cz + pz) / 2 + 2 }, Size = { 20, 1, pz - cz }, Color = "#FF2D2D", Material = "Neon", Parent = m }
				cz = pz + gap + 5
			end
		end
		local fin = BW.part{ Name = "Finish", At = { x, y + (n - 1) * 2 + 1, cz }, Size = { 6, 0.5, 6 }, Color = "#FFD700", Material = "Neon", Parent = m }
		BW.particles(fin, "sparkles", { Rate = 20 })
		serverScript("ObbyCheckpoints", m, STAGE_SRC)
		serverScript("ObbyKillParts", m, KILL_SRC)
		return m
	end)

	K("kill_bricks", function(o)
		local x, y, z = base(o)
		local m = model(o, "KillBricks")
		for i = 0, (o.count or 4) - 1 do
			BW.part{ Name = "Kill" .. i, At = { x - 9 + i * 6, y, z }, Size = { 4, 1, 12 }, Color = "#FF2D2D", Material = "Neon", Parent = m }
		end
		serverScript("KillParts", m, KILL_SRC)
		return m
	end)

	K("lava_floor", function(o)
		local x, y, z = base(o)
		local m = model(o, "LavaFloor")
		local s = o.size or 40
		local lava = BW.part{ Name = "Lava", At = { x, y, z }, Size = { s, 1, s }, Color = "#FF4500", Material = "Neon", Parent = m }
		BW.particles(lava, "fire", { Rate = 25, Size = { 2, 0.5 }, Speed = { 1, 3 } })
		BW.particles(lava, "smoke", { Rate = 3 })
		BW.light(lava, "PointLight", { Color = "#FF6A00", Range = 30, Brightness = 2 })
		for i = 1, (o.platforms or 6) do
			local a = i * 2.3
			BW.part{ Name = "Safe" .. i, At = { x + math.cos(a) * s * 0.3, y + 1, z + math.sin(a) * s * 0.3 }, Size = { 5, 1, 5 }, Color = "#5D4037", Material = "Slate", Parent = m }
		end
		serverScript("LavaKill", m, KILL_SRC)
		return m
	end)

	local PAD_SRC = [==[
-- Brickwire kit: pads. JumpPad = launch up, SpeedPad = temporary speed boost.
local Players = game:GetService("Players")
local pad = script.Parent
local KIND, POWER, BOOST, TIME = {{KIND}}, {{POWER}}, {{BOOST}}, {{TIME}}
local cooldown = {}
pad.Touched:Connect(function(hit)
	local char = hit.Parent
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	local root = char and char:FindFirstChild("HumanoidRootPart")
	if not (hum and root) or cooldown[char] then return end
	cooldown[char] = true
	if KIND == "jump" then
		root.AssemblyLinearVelocity = Vector3.new(root.AssemblyLinearVelocity.X, POWER, root.AssemblyLinearVelocity.Z)
	else
		local normal = hum:GetAttribute("BaseSpeed") or hum.WalkSpeed
		hum:SetAttribute("BaseSpeed", normal)
		hum.WalkSpeed = BOOST
		task.delay(TIME, function() if hum.Parent then hum.WalkSpeed = normal end end)
	end
	task.delay(0.6, function() cooldown[char] = nil end)
end)
]==]
	K("jump_pad", function(o)
		local x, y, z = base(o)
		local m = model(o, "JumpPad")
		BW.cylinder{ Name = "Ring", At = { x, y, z }, height = 0.6, diameter = 7, Color = "#2B2B2B", Material = "Metal", Parent = m }
		local pad = BW.cylinder{ Name = "Pad", At = { x, y + 0.6, z }, height = 0.3, diameter = 5.5, Color = o.Color or "#00E5FF", Material = "Neon", Parent = m }
		BW.particles(pad, "sparkles", { Rate = 12, Speed = { 4, 8 }, SpreadAngle = Vector2.new(10, 10), Color = "#9FF6FF" })
		serverScript("PadScript", pad, src(PAD_SRC, { KIND = "jump", POWER = o.power or 120, BOOST = 0, TIME = 0 }))
		return m
	end)
	K("speed_pad", function(o)
		local x, y, z = base(o)
		local m = model(o, "SpeedPad")
		local pad = BW.part{ Name = "Pad", At = { x, y, z }, Size = { 6, 0.4, 10 }, Color = o.Color or "#39FF14", Material = "Neon", Parent = m }
		for i = 0, 2 do BW.part{ Name = "Arrow" .. i, Class = "WedgePart", Size = { 3, 0.3, 2 }, Position = { x, y + 0.55, z - 3 + i * 3 }, Orientation = { 0, 180, 0 }, Color = "#FFFFFF", Material = "Neon", Parent = m } end
		serverScript("PadScript", pad, src(PAD_SRC, { KIND = "speed", POWER = 0, BOOST = o.speed or 40, TIME = o.time or 4 }))
		return m
	end)

	local TP_SRC = [==[
-- Brickwire kit: two-way teleporter. Touch PadA → arrive on PadB and back (per-player cooldown).
local Players = game:GetService("Players")
local model = script.Parent
local a, b = model:WaitForChild("PadA"), model:WaitForChild("PadB")
local busy = {}
local function link(from, to)
	from.Touched:Connect(function(hit)
		local player = Players:GetPlayerFromCharacter(hit.Parent)
		if not player or busy[player] then return end
		busy[player] = true
		hit.Parent:PivotTo(to.CFrame + Vector3.new(0, 4, 0))
		task.delay(2, function() busy[player] = nil end)
	end)
end
link(a, b)
link(b, a)
]==]
	K("teleporter", function(o)
		local x, y, z = base(o)
		local m = model(o, "Teleporter")
		local dist = o.distance or 40
		for i, side in ipairs({ { "PadA", -dist / 2, "#A55EEA" }, { "PadB", dist / 2, "#00C2FF" } }) do
			local pad = BW.cylinder{ Name = side[1], At = { x + side[2], y, z }, height = 0.5, diameter = 6, Color = side[3], Material = "Neon", Parent = m }
			BW.particles(pad, "magic", { Rate = 20, Color = side[3] })
			BW.light(pad, "PointLight", { Color = side[3], Range = 12 })
			BW.ring(6, 3.6, { x + side[2], y, z }, function(k, pos) return BW.cylinder{ Name = "Pillar" .. i .. k, At = pos, height = 5, diameter = 0.6, Color = "#2B2B2B", Material = "Metal", Parent = m } end)
		end
		serverScript("TeleportScript", m, TP_SRC)
		return m
	end)

	local COIN_SRC = [==[
-- Brickwire kit: collectable coins. Every part named Coin* in this model: +VALUE coins, respawns after RESPAWN s.
local Players = game:GetService("Players")
local VALUE, RESPAWN = {{VALUE}}, {{RESPAWN}}
local model = script.Parent
local function coins(player)
	local ls = player:FindFirstChild("leaderstats")
	if not ls then
		ls = Instance.new("Folder")
		ls.Name = "leaderstats"
		ls.Parent = player
	end
	local c = ls:FindFirstChild("Coins")
	if not c then
		c = Instance.new("IntValue")
		c.Name = "Coins"
		c.Parent = ls
	end
	return c
end
Players.PlayerAdded:Connect(coins)
for _, p in ipairs(Players:GetPlayers()) do coins(p) end
for _, coin in ipairs(model:GetChildren()) do
	if coin:IsA("BasePart") and string.find(coin.Name, "^Coin") then
		local taken = false
		coin.Touched:Connect(function(hit)
			if taken then return end
			local player = Players:GetPlayerFromCharacter(hit.Parent)
			if not player then return end
			taken = true
			coins(player).Value += VALUE
			coin.Transparency = 1
			coin.CanTouch = false
			task.delay(RESPAWN, function()
				coin.Transparency = 0
				coin.CanTouch = true
				taken = false
			end)
		end)
	end
end
-- spin (server-side, cheap)
local RunService = game:GetService("RunService")
local angle = 0
RunService.Heartbeat:Connect(function(dt)
	angle = (angle + dt * 120) % 360
	for _, coin in ipairs(model:GetChildren()) do
		if coin:IsA("BasePart") and string.find(coin.Name, "^Coin") then
			local base = coin:GetAttribute("BaseCFrame")
			if not base then
				coin:SetAttribute("BaseCFrame", coin.CFrame)
				base = coin.CFrame
			end
			coin.CFrame = base * CFrame.Angles(0, math.rad(angle), 0)
		end
	end
end)
]==]
	K("coins", function(o)
		local x, y, z = base(o)
		local m = model(o, "Coins")
		local n, shape = o.count or 12, o.shape or "line"
		for i = 1, n do
			local px, pz
			if shape == "ring" then
				local a = (i / n) * math.pi * 2
				px, pz = x + math.cos(a) * (o.radius or 12), z + math.sin(a) * (o.radius or 12)
			else
				px, pz = x, z - (n - 1) * 2 + (i - 1) * 4
			end
			BW.part{ Name = "Coin" .. i, Shape = "Cylinder", Size = { 0.4, 2.4, 2.4 }, Position = { px, y + 2.5, pz }, Orientation = { 0, 0, 0 }, Color = "#FFD700", Material = "Neon", CanCollide = false, Parent = m }
		end
		serverScript("CoinScript", m, src(COIN_SRC, { VALUE = o.value or 1, RESPAWN = o.respawn or 10 }))
		return m
	end)

	K("spawn_area", function(o)
		local x, y, z = base(o)
		local m = model(o, "SpawnArea")
		local s = o.size or 30
		box(m, "Platform", x - s / 2, y, z - s / 2, x + s / 2, y + 1, z + s / 2, "#ECEFF1", "Concrete")
		box(m, "Border", x - s / 2 - 0.5, y, z - s / 2 - 0.5, x + s / 2 + 0.5, y + 1.2, z - s / 2, "#90A4AE", "Concrete")
		BW.part{ Name = "Spawn", Class = "SpawnLocation", At = { x, y + 1, z }, Size = { 8, 1, 8 }, Color = o.Color or "#2E86DE", Material = "SmoothPlastic", Parent = m }
		for i, p in ipairs({ { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }) do KITS.lamp_post({ Name = "Lamp" .. i, At = { x + p[1] * (s / 2 - 2), y + 1, z + p[2] * (s / 2 - 2) }, Parent = m, height = 9 }) end
		local sign = box(m, "Sign", x - 6, y + 1, z - s / 2 + 1, x + 6, y + 6, z - s / 2 + 1.6, "#263238", "SmoothPlastic")
		local sg = BW.new("SurfaceGui", { Name = "SignGui", Face = "Front", Parent = sign })
		BW.new("TextLabel", { Name = "Text", Text = o.title or "WELCOME", Size = { 1, 0, 1, 0 }, BackgroundTransparency = 1, TextScaled = true, Font = "GothamBlack", TextColor3 = "#FFFFFF", Parent = sg })
		return m
	end)

	local ROUND_SRC = [==[
-- Brickwire kit: round system. Lobby → intermission → teleport to the arena → timer → back to lobby.
-- ReplicatedStorage.RoundStatus (StringValue) is shown by the timer_bar UI kit.
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local INTERMISSION, ROUND, MIN_PLAYERS = {{INTERMISSION}}, {{ROUND}}, {{MIN}}
local model = script.Parent
local lobby, arena = model:WaitForChild("LobbySpawn"), model:WaitForChild("ArenaFloor")
local status = RS:FindFirstChild("RoundStatus") or Instance.new("StringValue")
status.Name = "RoundStatus"
status.Parent = RS
local function alive(p)
	local h = p.Character and p.Character:FindFirstChildOfClass("Humanoid")
	return h and h.Health > 0
end
while true do
	while #Players:GetPlayers() < MIN_PLAYERS do
		status.Value = "Waiting for players (" .. #Players:GetPlayers() .. "/" .. MIN_PLAYERS .. ")"
		task.wait(1)
	end
	for t = INTERMISSION, 1, -1 do
		status.Value = "Round starts in " .. t
		task.wait(1)
	end
	local playing = {}
	for i, p in ipairs(Players:GetPlayers()) do
		if alive(p) then
			table.insert(playing, p)
			local a = (i / #Players:GetPlayers()) * math.pi * 2
			p.Character:PivotTo(arena.CFrame * CFrame.new(math.cos(a) * 12, 4, math.sin(a) * 12))
		end
	end
	for t = ROUND, 1, -1 do
		local left = {}
		for _, p in ipairs(playing) do if p.Parent and alive(p) then table.insert(left, p) end end
		playing = left
		status.Value = "Time left: " .. t .. "  ·  alive: " .. #playing
		if #playing <= 1 and MIN_PLAYERS > 1 then break end
		task.wait(1)
	end
	status.Value = (#playing == 1) and (playing[1].Name .. " wins!") or "Round over"
	for _, p in ipairs(playing) do
		local ls = p:FindFirstChild("leaderstats")
		local w = ls and ls:FindFirstChild("Wins")
		if w then w.Value += 1 end
		if p.Character then p.Character:PivotTo(lobby.CFrame + Vector3.new(0, 4, 0)) end
	end
	task.wait(3)
end
]==]
	K("round_system", function(o)
		local x, y, z = base(o)
		local m = model(o, "RoundSystem")
		box(m, "Lobby", x - 15, y, z - 15, x + 15, y + 1, z + 15, "#CFD8DC", "Concrete")
		BW.part{ Name = "LobbySpawn", Class = "SpawnLocation", At = { x, y + 1, z }, Size = { 8, 1, 8 }, Color = "#2E86DE", Parent = m }
		local ax = x + (o.arenaDistance or 80)
		BW.cylinder{ Name = "ArenaFloor", At = { ax, y, z }, height = 1, diameter = 50, Color = "#455A64", Material = "Slate", Parent = m }
		BW.ring(16, 25, { ax, y + 1, z }, function(i, pos, deg) return BW.part{ Name = "ArenaWall" .. i, Size = { 10, 6, 1 }, Position = { pos.X, y + 4, pos.Z }, Orientation = { 0, -deg + 90, 0 }, Color = "#263238", Material = "Concrete", Parent = m } end)
		serverScript("RoundScript", m, src(ROUND_SRC, { INTERMISSION = o.intermission or 15, ROUND = o.roundTime or 90, MIN = o.minPlayers or 2 }))
		BW.leaderstats({ Wins = 0 })
		return m
	end)

	local SAVE_SRC = [==[
-- Brickwire kit: leaderstats that SAVE (DataStore with retries, autosave and BindToClose).
local Players = game:GetService("Players")
local DSS = game:GetService("DataStoreService")
local store = DSS:GetDataStore({{STORE}})
local STATS = {{STATS}}
local function retry(fn)
	for i = 1, 3 do
		local ok, res = pcall(fn)
		if ok then return true, res end
		warn("DataStore attempt " .. i .. " failed: " .. tostring(res))
		task.wait(i)
	end
	return false
end
local function load(player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	for name, start in pairs(STATS) do
		local v = Instance.new("IntValue")
		v.Name = name
		v.Value = start
		v.Parent = ls
	end
	ls.Parent = player
	local ok, data = retry(function() return store:GetAsync("p_" .. player.UserId) end)
	if ok and type(data) == "table" then
		for name, val in pairs(data) do
			local v = ls:FindFirstChild(name)
			if v and type(val) == "number" then v.Value = val end
		end
	end
	player:SetAttribute("DataLoaded", ok)
end
local function save(player)
	if not player:GetAttribute("DataLoaded") then return end -- never overwrite with defaults after a failed load
	local ls = player:FindFirstChild("leaderstats")
	if not ls then return end
	local data = {}
	for _, v in ipairs(ls:GetChildren()) do if v:IsA("IntValue") or v:IsA("NumberValue") then data[v.Name] = v.Value end end
	retry(function() store:SetAsync("p_" .. player.UserId, data) end)
end
Players.PlayerAdded:Connect(load)
Players.PlayerRemoving:Connect(save)
for _, p in ipairs(Players:GetPlayers()) do task.spawn(load, p) end
game:BindToClose(function()
	for _, p in ipairs(Players:GetPlayers()) do save(p) end
end)
task.spawn(function()
	while true do
		task.wait(120)
		for _, p in ipairs(Players:GetPlayers()) do save(p) end
	end
end)
]==]
	local function luaTable(t)
		local parts = {}
		for k, v in pairs(t) do table.insert(parts, string.format("[%q] = %s", k, tostring(v))) end
		table.sort(parts)
		return "{ " .. table.concat(parts, ", ") .. " }"
	end
	K("saved_stats", function(o)
		local stats = o.stats or { Coins = 0, Wins = 0 }
		local s = string.gsub(SAVE_SRC, "{{STATS}}", function() return luaTable(stats) end)
		local sc = serverScript("SavedStats", "ServerScriptService", src(s, { STORE = o.store or "PlayerStats_v1" }))
		print("BW_KIT note: Studio needs Game Settings → Security → Enable Studio Access to API Services for DataStores in Play mode")
		return sc
	end)

	local DAYNIGHT_SRC = [==[
-- Brickwire kit: day/night cycle. One full day = DAY_MINUTES real minutes.
local Lighting = game:GetService("Lighting")
local DAY_MINUTES = {{MINUTES}}
local RunService = game:GetService("RunService")
RunService.Heartbeat:Connect(function(dt)
	Lighting.ClockTime = (Lighting.ClockTime + dt * 24 / (DAY_MINUTES * 60)) % 24
end)
]==]
	K("day_night", function(o)
		return serverScript("DayNightCycle", "ServerScriptService", src(DAYNIGHT_SRC, { MINUTES = o.minutes or 10 }))
	end)

	local NPC_DIALOG_SRC = [==[
-- Brickwire kit: NPC dialog. ProximityPrompt → server sends lines to the client (DialogUI kit shows them).
local RS = game:GetService("ReplicatedStorage")
local remotes = RS:WaitForChild("Remotes")
local show = remotes:WaitForChild("ShowDialog")
local npc = script.Parent
local prompt = npc:FindFirstChildWhichIsA("ProximityPrompt", true)
local LINES = {{LINES}}
prompt.Triggered:Connect(function(player)
	show:FireClient(player, npc.Name, LINES)
end)
]==]
	K("npc_dialog", function(o)
		local x, y, z = base(o)
		local npc = BW.rig(o.Name or "Villager", { Position = { x, y + 3, z }, Facing = o.Facing or 0, DisplayName = o.title or "Villager", Parent = o.Parent })
		local root = npc:FindFirstChild("HumanoidRootPart") or npc:FindFirstChildWhichIsA("BasePart")
		BW.new("ProximityPrompt", { Name = "TalkPrompt", ActionText = "Talk", ObjectText = o.title or "Villager", HoldDuration = 0, MaxActivationDistance = 10, Parent = root })
		remote("ShowDialog")
		local lines = o.lines or { "Hello, traveler!", "The castle is to the north.", "Good luck!" }
		local q = {}
		for _, l in ipairs(lines) do table.insert(q, string.format("%q", l)) end
		serverScript("DialogScript", npc, (string.gsub(NPC_DIALOG_SRC, "{{LINES}}", function() return "{ " .. table.concat(q, ", ") .. " }" end)))
		if not game:GetService("StarterGui"):FindFirstChild("DialogUI") then BW.kit("dialog", { _quiet = true }) end
		pcall(function() BW.playAnim(npc, "idle", { loop = true }) end)
		return npc
	end)

	-- ================================================================== UI STYLE SYSTEM (1.7)
	-- BW.style(name) → a complete visual language (fonts, gradients, outlines, 3D buttons, headers, rarity colours).
	-- Components: BW.uiButton / uiIconButton / uiPanel / uiWindow / uiTitle / uiBar / uiPill / uiCard / uiToggle / uiRays / uiJuice.
	-- Every UI kit takes style= (or the legacy theme=): simulator, cartoon, anime, glass, neon, fantasy, minimal, dark, candy, pixel, horror, tactical, luxury.
	local STYLES = {
		simulator = { desc = "bright bubbly simulator look: thick dark outlines, glossy 3D buttons, rounded FredokaOne", refs = "Pet Simulator 99, Bee Swarm Simulator, Bubble Gum Simulator",
			font = "FredokaOne", body = "FredokaOne", text = "#FFFFFF", mut = "#E3ECFF", ts = { "#16224A", 2.5 },
			panel = { "#5AB0FF", "#2F6FE8" }, stroke = { "#13204A", 3.5 }, corner = 20, inner = { "#EEF6FF", "#CFE3FF" }, innerText = "#1B2550", innerStroke = { "#13204A", 2.5 },
			primary = { "#9BFF5C", "#2DBE3C" }, secondary = { "#62D8FF", "#2A86FF" }, danger = { "#FF8080", "#E5383B" }, gold = { "#FFE45C", "#FF9F1C" }, neutral = { "#FFFFFF", "#C3CEEA" },
			btnText = "#FFFFFF", btnTs = { "#16224A", 2.5 }, lip = 0.38, gloss = 0.72, btnCorner = 16, header = "ribbon", headerColor = { "#FFE066", "#FF9F1C" }, rot = -2,
			bar = { "#9BFF5C", "#2DBE3C" }, barBg = "#16224A", bg = { "#7CC6FF", "#3F7BEA" }, accent = "#2F8CFF", good = "#2DBE3C", warn = "#FF9F1C", bad = "#E5383B", rays = true },
		cartoon = { desc = "warm cartoon: chunky LuckiestGuy text, orange/yellow, very thick outlines, bouncy", refs = "Adopt Me, Overcooked-like casual games",
			font = "LuckiestGuy", body = "FredokaOne", text = "#FFFFFF", mut = "#FFF1D6", ts = { "#3B1F0E", 3 },
			panel = { "#FFB347", "#FF7A1A" }, stroke = { "#3B1F0E", 4 }, corner = 22, inner = { "#FFF6E5", "#FFE1B3" }, innerText = "#3B1F0E", innerStroke = { "#3B1F0E", 3 },
			primary = { "#7DFF7A", "#22B14C" }, secondary = { "#6CD3FF", "#1E90FF" }, danger = { "#FF7070", "#D62828" }, gold = { "#FFF06A", "#FFB703" }, neutral = { "#FFFFFF", "#E8D3B5" },
			btnText = "#FFFFFF", btnTs = { "#3B1F0E", 3 }, lip = 0.42, gloss = 0.7, btnCorner = 18, header = "ribbon", headerColor = { "#FF6B6B", "#D62828" }, rot = 2,
			bar = { "#FF6B6B", "#D62828" }, barBg = "#3B1F0E", bg = { "#FFD27A", "#FF8C42" }, accent = "#FF7A1A", good = "#22B14C", warn = "#FFB703", bad = "#D62828", rays = true },
		anime = { desc = "anime action: dark navy, magenta→violet gradients, slanted headers, Bangers titles, thin white strokes", refs = "Anime Defenders, Anime Vanguards, Blox Fruits",
			font = "Bangers", body = "GothamBold", text = "#FFFFFF", mut = "#C9C3FF", ts = { "#12002B", 2 },
			panel = { "#241445", "#0E0822" }, stroke = { "#FF4FD8", 2 }, corner = 6, inner = { "#2E1B5C", "#1A0F3A" }, innerText = "#FFFFFF", innerStroke = { "#7B5CFF", 1.5 },
			primary = { "#FF5FD2", "#8A2BFF" }, secondary = { "#4FE0FF", "#3A5BFF" }, danger = { "#FF5A5A", "#B3122E" }, gold = { "#FFE27A", "#FF9A3C" }, neutral = { "#3A2B6B", "#22174A" },
			btnText = "#FFFFFF", btnTs = { "#12002B", 2 }, lip = 0.3, gloss = 0.85, btnCorner = 6, header = "slant", headerColor = { "#FF4FD8", "#7B2FFF" }, rot = -4,
			bar = { "#FF5FD2", "#8A2BFF" }, barBg = "#0B0618", bg = { "#2A1659", "#07030F" }, accent = "#FF4FD8", good = "#3DFFB0", warn = "#FFD23F", bad = "#FF3B5C", rays = true },
		glass = { desc = "glassmorphism: translucent dark panels, hairline light strokes, soft corners, clean Gotham", refs = "modern hangout / showcase games, iOS-like menus",
			font = "GothamBold", body = "GothamMedium", text = "#FFFFFF", mut = "#C7D0E0", ts = false,
			panel = { "#2A3350", "#141A2B" }, panelT = 0.22, stroke = { "#FFFFFF", 1.2, 0.7 }, corner = 22, inner = { "#FFFFFF", "#FFFFFF" }, innerT = 0.9, innerText = "#FFFFFF", innerStroke = { "#FFFFFF", 1, 0.8 },
			primary = { "#7FB2FF", "#4C7DFF" }, secondary = { "#FFFFFF", "#DDE6F5" }, danger = { "#FF8A8A", "#FF4D5E" }, gold = { "#FFE08A", "#FFC24B" }, neutral = { "#FFFFFF", "#FFFFFF" }, neutralT = 0.85,
			btnText = "#FFFFFF", btnTs = false, lip = 0, gloss = false, btnCorner = 14, header = "plain", headerColor = { "#FFFFFF", "#FFFFFF" }, rot = 0,
			bar = { "#9CC3FF", "#5B8CFF" }, barBg = "#0B0F1A", bg = { "#3B4A7A", "#0D1222" }, accent = "#6E9BFF", good = "#46E39B", warn = "#FFC24B", bad = "#FF4D5E" },
		neon = { desc = "sci-fi neon: near-black, cyan glow outlines, Michroma titles, sharp corners, scanline bars", refs = "sci-fi shooters, cyberpunk hubs",
			font = "Michroma", body = "GothamMedium", text = "#E6FBFF", mut = "#7FC8D6", ts = false,
			panel = { "#0B1A26", "#05090F" }, panelT = 0.05, stroke = { "#00E5FF", 2 }, corner = 4, inner = { "#0F2433", "#08131C" }, innerText = "#E6FBFF", innerStroke = { "#00A6C7", 1 },
			primary = { "#00F0FF", "#0077FF" }, secondary = { "#B26BFF", "#5A2BFF" }, danger = { "#FF4D7D", "#B3003C" }, gold = { "#FFE45C", "#FFB000" }, neutral = { "#123247", "#0A1C29" },
			btnText = "#03141C", btnTs = false, lip = 0, gloss = false, btnCorner = 3, header = "bar", headerColor = { "#00E5FF", "#0077FF" }, headerText = "#03141C", rot = 0,
			bar = { "#00F0FF", "#0077FF" }, barBg = "#02070B", bg = { "#06121C", "#000000" }, accent = "#00E5FF", good = "#39FF14", warn = "#FFD60A", bad = "#FF3D71" },
		fantasy = { desc = "fantasy RPG: parchment panels, dark wood outlines, gothic titles, red ribbon, gold buttons", refs = "Deepwoken, World of Warcraft-like RPG menus",
			font = "GrenzeGotisch", body = "Merriweather", text = "#3B2412", mut = "#6B4A2B", ts = false,
			panel = { "#F6E7C1", "#DCC08A" }, stroke = { "#4A2E14", 3 }, corner = 10, inner = { "#FFF6DD", "#EBD6A6" }, innerText = "#3B2412", innerStroke = { "#7A5228", 1.5 },
			primary = { "#D9534F", "#8E1F1B" }, secondary = { "#5C8A4A", "#2F5A22" }, danger = { "#AA3333", "#5C1010" }, gold = { "#FFE08A", "#C8912E" }, neutral = { "#E9D4A3", "#BFA06A" },
			btnText = "#FFF6DD", btnTs = { "#3B1A0A", 1.5 }, lip = 0.35, gloss = 0.85, btnCorner = 8, header = "ribbon", headerColor = { "#C0392B", "#7B1E16" }, headerText = "#FFF3D6", rot = 0,
			bar = { "#D9534F", "#8E1F1B" }, barBg = "#3B2412", bg = { "#5A3B1E", "#1E120A" }, accent = "#C0392B", good = "#4E8A3A", warn = "#C8912E", bad = "#8E1F1B" },
		minimal = { desc = "clean minimal: white cards, soft grey hairlines, one accent colour, lots of spacing", refs = "Apple / Material-style menus, tycoon dashboards",
			font = "GothamBold", body = "GothamMedium", text = "#1D2233", mut = "#6B7280", ts = false,
			panel = { "#FFFFFF", "#F6F7FB" }, stroke = { "#E3E7EF", 1.5 }, corner = 16, inner = { "#F4F6FA", "#EEF1F6" }, innerText = "#1D2233", innerStroke = { "#E3E7EF", 1 },
			primary = { "#3B82F6", "#2563EB" }, secondary = { "#EEF2FF", "#E0E7FF" }, secondaryText = "#1E3A8A", danger = { "#F87171", "#DC2626" }, gold = { "#FBBF24", "#F59E0B" }, neutral = { "#F3F4F6", "#E5E7EB" }, neutralText = "#1D2233",
			btnText = "#FFFFFF", btnTs = false, lip = 0, gloss = false, btnCorner = 12, header = "plain", headerColor = { "#FFFFFF", "#FFFFFF" }, headerText = "#1D2233", rot = 0,
			bar = { "#60A5FA", "#2563EB" }, barBg = "#E5E7EB", bg = { "#F8FAFC", "#E2E8F0" }, accent = "#2563EB", good = "#16A34A", warn = "#F59E0B", bad = "#DC2626" },
		dark = { desc = "modern dark: deep blue-grey panels, subtle gradients, blue accent, rounded Gotham", refs = "Arsenal lobby, modern dashboard menus",
			font = "GothamBlack", body = "GothamMedium", text = "#FFFFFF", mut = "#A9B1D6", ts = false,
			panel = { "#232B4A", "#161C33" }, stroke = { "#3A4470", 1.5 }, corner = 14, inner = { "#1C2340", "#141A31" }, innerText = "#FFFFFF", innerStroke = { "#2E375E", 1 },
			primary = { "#5B9BFF", "#3366FF" }, secondary = { "#2E375E", "#232B4A" }, danger = { "#FF6B7A", "#E23D51" }, gold = { "#FFD36B", "#FFAA2B" }, neutral = { "#2E375E", "#232B4A" },
			btnText = "#FFFFFF", btnTs = false, lip = 0.25, gloss = false, btnCorner = 12, header = "plain", headerColor = { "#232B4A", "#232B4A" }, rot = 0,
			bar = { "#43E38B", "#1FB866" }, barBg = "#0E1222", bg = { "#1A2140", "#0A0D1A" }, accent = "#4F8CFF", good = "#2FD67B", warn = "#FFC43D", bad = "#FF5C6C" },
		candy = { desc = "kawaii pastel: pink/mint/lilac, bubbly FredokaOne, soft pink outlines, hearts and stars", refs = "dress-up / roleplay games, cute obbies",
			font = "FredokaOne", body = "FredokaOne", text = "#FFFFFF", mut = "#FFE3F1", ts = { "#C2407E", 2.5 },
			panel = { "#FFB3D9", "#FF7FBF" }, stroke = { "#C2407E", 3 }, corner = 24, inner = { "#FFF5FA", "#FFE0F0" }, innerText = "#8A2A5A", innerStroke = { "#E77FB3", 2 },
			primary = { "#8CF5C8", "#36C995" }, secondary = { "#C9B6FF", "#9B7BFF" }, danger = { "#FF9AA8", "#FF5D7A" }, gold = { "#FFE9A3", "#FFC94D" }, neutral = { "#FFFFFF", "#FFD6EA" }, neutralText = "#8A2A5A",
			btnText = "#FFFFFF", btnTs = { "#B03A72", 2 }, lip = 0.3, gloss = 0.7, btnCorner = 20, header = "ribbon", headerColor = { "#C9B6FF", "#9B7BFF" }, rot = 0,
			bar = { "#FF9AD5", "#FF5DA2" }, barBg = "#8A2A5A", bg = { "#FFE3F1", "#FFB3D9" }, accent = "#FF5DA2", good = "#36C995", warn = "#FFB000", bad = "#FF4D6D", rays = true },
		pixel = { desc = "retro pixel: square corners, Arcade font, hard black outlines, 8-bit palette, chunky lips", refs = "retro arcade / 8-bit games",
			font = "Arcade", body = "Arcade", text = "#FFFFFF", mut = "#C8C8FF", ts = { "#000000", 2 },
			panel = { "#3B2D6B", "#3B2D6B" }, stroke = { "#000000", 4 }, corner = 0, inner = { "#22184A", "#22184A" }, innerText = "#FFFFFF", innerStroke = { "#000000", 3 },
			primary = { "#3EE05A", "#3EE05A" }, secondary = { "#3FA9F5", "#3FA9F5" }, danger = { "#F2453D", "#F2453D" }, gold = { "#FFD93D", "#FFD93D" }, neutral = { "#8C8CB4", "#8C8CB4" },
			btnText = "#FFFFFF", btnTs = { "#000000", 2 }, lip = 0.45, gloss = false, btnCorner = 0, header = "bar", headerColor = { "#F2453D", "#F2453D" }, rot = 0,
			bar = { "#3EE05A", "#3EE05A" }, barBg = "#000000", bg = { "#1B1236", "#0B0618" }, accent = "#FFD93D", good = "#3EE05A", warn = "#FFD93D", bad = "#F2453D" },
		horror = { desc = "horror: near-black, dried-blood red, Creepster titles, worn edges, low contrast greys", refs = "Doors, The Mimic, Piggy",
			font = "Creepster", body = "SpecialElite", text = "#E8D9C5", mut = "#9C8F80", ts = { "#000000", 1.5 },
			panel = { "#1A1110", "#0A0606" }, panelT = 0.06, stroke = { "#5A1212", 2 }, corner = 4, inner = { "#211615", "#140D0C" }, innerText = "#E8D9C5", innerStroke = { "#3A1010", 1 },
			primary = { "#8B1A1A", "#4A0707" }, secondary = { "#3A3330", "#211C1A" }, danger = { "#B22222", "#5C0A0A" }, gold = { "#C9A45C", "#7A5A22" }, neutral = { "#2A2321", "#171211" },
			btnText = "#E8D9C5", btnTs = { "#000000", 1.5 }, lip = 0.3, gloss = false, btnCorner = 3, header = "plain", headerColor = { "#1A1110", "#1A1110" }, headerText = "#C0392B", rot = 0,
			bar = { "#A11D1D", "#560A0A" }, barBg = "#050303", bg = { "#140C0B", "#000000" }, accent = "#A11D1D", good = "#6E8B3D", warn = "#C9A45C", bad = "#B22222" },
		tactical = { desc = "tactical shooter: dark olive glass, thin amber lines, Oswald caps, square corners, HUD brackets", refs = "Frontlines, Arsenal, Phantom Forces",
			font = "Oswald", body = "RobotoCondensed", text = "#F2F2EC", mut = "#A7AE9A", ts = false,
			panel = { "#262D27", "#151915" }, panelT = 0.12, stroke = { "#E0A93B", 1.2 }, corner = 2, inner = { "#1E241F", "#141814" }, innerText = "#F2F2EC", innerStroke = { "#4A5546", 1 },
			primary = { "#F0B43C", "#C98A12" }, secondary = { "#3C4A3C", "#2A332A" }, danger = { "#E2553B", "#A3301C" }, gold = { "#F0B43C", "#C98A12" }, neutral = { "#2F3830", "#20271F" },
			btnText = "#151915", btnTs = false, lip = 0, gloss = false, btnCorner = 2, header = "bar", headerColor = { "#E0A93B", "#C98A12" }, headerText = "#151915", rot = 0,
			bar = { "#9BD35A", "#5E9E2E" }, barBg = "#0A0C0A", bg = { "#2A322B", "#0C0F0C" }, accent = "#E0A93B", good = "#9BD35A", warn = "#F0B43C", bad = "#E2553B" },
		luxury = { desc = "luxury / royal: black and gold, serif Merriweather titles, thin gold outlines, deep purple accents", refs = "VIP rooms, casino / royale themes",
			font = "Merriweather", body = "GothamMedium", text = "#F7E7B4", mut = "#BFAE7E", ts = false,
			panel = { "#1E1830", "#0B0912" }, stroke = { "#D4AF37", 2 }, corner = 12, inner = { "#2A2142", "#16111F" }, innerText = "#F7E7B4", innerStroke = { "#8C7426", 1 },
			primary = { "#F7DC8A", "#C8962E" }, secondary = { "#7B4DBB", "#4A2A80" }, danger = { "#D9534F", "#8E1F1B" }, gold = { "#F7DC8A", "#C8962E" }, neutral = { "#2E2546", "#1B1529" },
			btnText = "#1B1406", btnTs = false, lip = 0.3, gloss = 0.8, btnCorner = 10, header = "ribbon", headerColor = { "#F7DC8A", "#C8962E" }, headerText = "#1B1406", rot = 0,
			bar = { "#F7DC8A", "#C8962E" }, barBg = "#07050B", bg = { "#2A1F45", "#05040A" }, accent = "#D4AF37", good = "#7BD88F", warn = "#F7DC8A", bad = "#D9534F", rays = true },
	}
	local STYLE_ALIAS = { light = "minimal", scifi = "neon", sim = "simulator", kawaii = "candy", pastel = "candy", retro = "pixel", military = "tactical", shooter = "tactical", royal = "luxury", gold = "luxury", rpg = "fantasy", medieval = "fantasy", cyber = "neon", modern = "dark", clean = "minimal" }
	local STYLE_ORDER = { "simulator", "cartoon", "anime", "glass", "neon", "fantasy", "minimal", "dark", "candy", "pixel", "horror", "tactical", "luxury" }
	BW.uiStyles = STYLES
	local RARITY = {
		common = { "#D7DEE6", "#8E9AA6" }, uncommon = { "#8CFF8A", "#2FB344" }, rare = { "#6CD3FF", "#2F7BFF" }, epic = { "#D59BFF", "#8A2BE2" },
		legendary = { "#FFE070", "#FF8C1A" }, mythic = { "#FF7AD9", "#FF2E63" }, secret = { "#4A4A4A", "#0A0A0A" },
	}
	BW.uiRarity = RARITY
	function BW.style(s)
		if type(s) == "table" then
			if s.font and s.panel then return s end
			s = s.style or s.theme
		end
		s = s and (STYLE_ALIAS[s] or s) or "simulator"
		local S = STYLES[s]
		if not S then fail("unknown UI style '" .. tostring(s) .. "' — available: " .. table.concat(STYLE_ORDER, ", ")) end
		S.name = s
		return S
	end
	function BW.styles()
		print("BW_STYLES " .. #STYLE_ORDER)
		for _, n in ipairs(STYLE_ORDER) do print("  " .. n .. " — " .. STYLES[n].desc .. " (like " .. STYLES[n].refs .. ")") end
		return STYLE_ORDER
	end

	local function C3(v) return BW.color(v) end
	local function darker(hex, k)
		local c = C3(hex)
		k = 1 - (k or 0.3)
		return Color3.new(c.R * k, c.G * k, c.B * k)
	end
	local function seq(pair)
		if type(pair) ~= "table" then pair = { pair, pair } end
		return ColorSequence.new({ ColorSequenceKeypoint.new(0, C3(pair[1])), ColorSequenceKeypoint.new(1, C3(pair[2] or pair[1])) })
	end
	local function vec2(v) if type(v) == "table" then return Vector2.new(v[1] or 0, v[2] or 0) end return v end
	local function corner(inst, r) if r and r > 0 then BW.new("UICorner", { CornerRadius = UDim.new(0, r), Parent = inst }) end end
	local function roundFull(inst) BW.new("UICorner", { CornerRadius = UDim.new(0.5, 0), Parent = inst }) end
	local function stroke(inst, s, mode)
		if not s then return end
		local st = BW.new("UIStroke", { Color = C3(s[1]), Thickness = s[2] or 1, Transparency = s[3] or 0, Parent = inst })
		pcall(function() st.ApplyStrokeMode = mode or Enum.ApplyStrokeMode.Border end)
		pcall(function() st.LineJoinMode = Enum.LineJoinMode.Round end)
		return st
	end
	local function textStroke(lbl, s) if s then stroke(lbl, s, Enum.ApplyStrokeMode.Contextual) end end
	local function gradient(inst, pair, rot)
		local g = BW.new("UIGradient", { Rotation = rot or 90, Parent = inst })
		g.Color = seq(pair)
		return g
	end
	local function cbase(props, S)
		-- common Size/Position/AnchorPoint/Name/LayoutOrder/ZIndex handling for components
		local p = { Name = props.Name, Size = props.Size, Position = props.Position, LayoutOrder = props.LayoutOrder, Visible = props.Visible, ZIndex = props.ZIndex }
		if props.AnchorPoint then p.AnchorPoint = vec2(props.AnchorPoint) end
		return p
	end
	local function label(parent, text, S, o)
		o = o or {}
		local l = BW.new("TextLabel", { Name = o.Name or "Label", Parent = parent, Size = o.Size or { 1, 0, 1, 0 }, Position = o.Position or { 0, 0, 0, 0 }, BackgroundTransparency = 1,
			Text = text or "", Font = o.Font or S.body, TextColor3 = o.Color or S.text, TextScaled = true, TextWrapped = true, TextXAlignment = o.X or "Center", TextYAlignment = o.Y or "Center", ZIndex = o.ZIndex })
		if o.AnchorPoint then l.AnchorPoint = vec2(o.AnchorPoint) end
		BW.new("UITextSizeConstraint", { MaxTextSize = o.max or 48, MinTextSize = o.min or 8, Parent = l })
		if o.stroke ~= false then textStroke(l, o.stroke or S.ts) end
		return l
	end
	BW._uiLabel = label

	-- Title text: big font, outline, optional gradient fill (UIGradient on a TextLabel colours the text).
	function BW.uiTitle(parent, text, o)
		o = o or {}
		local S = BW.style(o.style)
		local p = cbase(o, S)
		p.Name = p.Name or "Title"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 1, 0, 0, 48 }
		local l = BW.new("TextLabel", p)
		l.BackgroundTransparency = 1
		l.Text = text or ""
		l.Font = o.Font or S.font
		l.TextColor3 = C3(o.Color or S.text)
		l.TextScaled = true
		l.TextXAlignment = o.X or "Center"
		BW.new("UITextSizeConstraint", { MaxTextSize = o.max or 96, Parent = l })
		textStroke(l, o.stroke or S.ts or { "#000000", 0 })
		if o.Gradient then gradient(l, o.Gradient, 90) end
		if o.Rotation or S.rot ~= 0 and o.tilt then l.Rotation = o.Rotation or S.rot end
		return l
	end

	-- Glossy 3D button. kind = primary | secondary | danger | gold | neutral. Children: Face (gradient), Gloss, Label (+ icon).
	function BW.uiButton(parent, text, o)
		o = o or {}
		local S = BW.style(o.style)
		local kind = o.kind or "primary"
		local pair = o.Colors or S[kind] or S.primary
		local p = cbase(o, S)
		p.Name = p.Name or "Button"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 0, 200, 0, 56 }
		local b = BW.new("TextButton", p)
		b.Text = ""
		b.AutoButtonColor = false
		b.BackgroundColor3 = S.lip > 0 and darker(pair[2] or pair[1], S.lip) or C3(pair[2] or pair[1])
		b.BackgroundTransparency = (kind == "neutral" and S.neutralT) or 0
		corner(b, S.btnCorner)
		stroke(b, o.stroke or S.btnStroke or S.stroke)
		local lipPx = S.lip > 0 and (o.lip or 5) or 0
		local face = BW.new("Frame", { Name = "Face", Parent = b, Size = UDim2.new(1, 0, 1, -lipPx), BackgroundColor3 = "#FFFFFF", BackgroundTransparency = b.BackgroundTransparency })
		corner(face, S.btnCorner)
		gradient(face, pair, 90)
		if S.gloss then
			local g = BW.new("Frame", { Name = "Gloss", Parent = face, Size = UDim2.new(1, -10, 0.42, 0), Position = UDim2.new(0, 5, 0, 3), BackgroundColor3 = "#FFFFFF", BackgroundTransparency = S.gloss })
			corner(g, math.max(0, (S.btnCorner or 8) - 4))
		end
		local txtColor = S[kind .. "Text"] or (kind == "neutral" and S.innerText) or S.btnText
		local hasIcon = o.icon ~= nil
		if hasIcon then
			BW.icon(face, o.icon, { Size = { 0, 0, 0.72, 0 }, Position = { 0, (text and text ~= "") and 8 or 0, 0.5, 0 }, AnchorPoint = { 0, 0.5 }, Name = "Icon" })
			local ic = face:FindFirstChild("Icon")
			if ic then ic.Size = UDim2.new(0.72, 0, 0.72, 0) if not text or text == "" then ic.Position = UDim2.new(0.5, 0, 0.5, 0) ic.AnchorPoint = Vector2.new(0.5, 0.5) end end
		end
		if text and text ~= "" then
			local lx = hasIcon and 0.3 or 0.06
			label(face, text, S, { Name = "Label", Size = { 1 - lx - 0.06, 0, 0.7, 0 }, Position = { lx, 0, 0.15, 0 }, Font = S.font, Color = txtColor, stroke = (txtColor == S.btnText) and S.btnTs or false, max = o.max or 34 })
		end
		b:SetAttribute("BW_Juice", true)
		return b
	end
	-- Square icon button with an optional caption under it (side menu buttons: Shop, Pets, Rewards…).
	function BW.uiIconButton(parent, icon, o)
		o = o or {}
		local S = BW.style(o.style)
		local oo = table.clone(o)
		oo.icon = icon
		oo.Size = o.Size or { 0, 68, 0, 68 }
		local b = BW.uiButton(parent, "", oo)
		BW.new("UIAspectRatioConstraint", { AspectRatio = 1, Parent = b })
		if o.caption then label(b, o.caption, S, { Name = "Caption", Size = { 1.3, 0, 0.32, 0 }, Position = { 0.5, 0, 1, -4 }, AnchorPoint = { 0.5, 0.5 }, Font = S.font, max = 22, stroke = S.ts or { "#000000", 1.5 } }) end
		return b
	end

	-- Panel: gradient background + outline + corner (+ padding). inner=true → the lighter "card inside a window" variant.
	function BW.uiPanel(parent, o)
		o = o or {}
		local S = BW.style(o.style)
		local p = cbase(o, S)
		p.Name = p.Name or "Panel"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 0, 300, 0, 200 }
		local f = BW.new("Frame", p)
		f.BackgroundColor3 = C3("#FFFFFF")
		f.BackgroundTransparency = o.inner and (S.innerT or 0) or (S.panelT or 0)
		corner(f, o.corner or (o.inner and math.max(4, S.corner - 6)) or S.corner)
		gradient(f, o.Colors or (o.inner and S.inner or S.panel), o.gradRot or 90)
		stroke(f, o.inner and S.innerStroke or S.stroke)
		if o.Padding then local pd = UDim.new(0, o.Padding) BW.new("UIPadding", { PaddingTop = pd, PaddingBottom = pd, PaddingLeft = pd, PaddingRight = pd, Parent = f }) end
		return f
	end

	-- Close button (round, red, X with outline) sitting on the window's top-right corner.
	function BW.uiClose(parent, o)
		o = o or {}
		local S = BW.style(o.style)
		local size = o.size or 44
		local b = BW.uiButton(parent, "X", { style = S, kind = "danger", Name = o.Name or "Close", Size = { 0, size, 0, size }, Position = o.Position or { 1, size * 0.3, 0, -size * 0.3 }, AnchorPoint = { 1, 0 }, ZIndex = 5, max = 30, lip = 4 })
		return b
	end

	-- Window: panel + header (ribbon / slant / bar / plain title) + close button. Hidden by default (BW_Window → pops open via uiJuice).
	-- Returns the window and the y-offset (px) where content should start.
	function BW.uiWindow(gui, o)
		o = o or {}
		local S = BW.style(o.style)
		local w = BW.uiPanel(gui, { style = S, Name = o.Name or "Window", Size = o.Size or { 0.42, 0, 0.62, 0 }, Position = o.Position or { 0.5, 0, 0.5, 0 }, AnchorPoint = { 0.5, 0.5 }, Visible = o.Visible == true })
		w:SetAttribute("BW_Window", true)
		BW.new("UISizeConstraint", { MinSize = Vector2.new(o.minW or 320, o.minH or 240), MaxSize = Vector2.new(o.maxW or 900, o.maxH or 640), Parent = w })
		local top = 14
		local title = o.title or ""
		if S.header == "ribbon" or S.header == "slant" then
			local h = BW.new("Frame", { Name = "Header", Parent = w, Size = UDim2.new(0.56, 0, 0, 50), Position = UDim2.new(0.5, 0, 0, -24), AnchorPoint = Vector2.new(0.5, 0), BackgroundColor3 = "#FFFFFF", ZIndex = 3 })
			corner(h, S.header == "slant" and 4 or math.min(S.corner, 16))
			gradient(h, S.headerColor, 90)
			stroke(h, S.stroke)
			h.Rotation = S.rot or 0
			label(h, title, S, { Name = "Title", Size = { 0.9, 0, 0.78, 0 }, Position = { 0.05, 0, 0.11, 0 }, Font = S.font, Color = S.headerText or S.text, max = 40, ZIndex = 4 })
			top = 36
		elseif S.header == "bar" then
			local h = BW.new("Frame", { Name = "Header", Parent = w, Size = UDim2.new(1, 0, 0, 44), BackgroundColor3 = "#FFFFFF" })
			corner(h, S.corner)
			gradient(h, S.headerColor, 0)
			label(h, string.upper(title), S, { Name = "Title", Size = { 0.8, 0, 0.62, 0 }, Position = { 0.04, 0, 0.19, 0 }, Font = S.font, Color = S.headerText or S.text, X = "Left", max = 28, stroke = false })
			top = 56
		else
			label(w, title, S, { Name = "Title", Size = { 0.8, 0, 0, 40 }, Position = { 0, 18, 0, 12 }, Font = S.font, Color = S.headerText or S.text, X = "Left", max = 34 })
			BW.new("Frame", { Name = "Divider", Parent = w, Size = UDim2.new(1, -36, 0, 1), Position = UDim2.new(0, 18, 0, 58), BackgroundColor3 = S.stroke[1], BackgroundTransparency = 0.5 })
			top = 68
		end
		if o.close ~= false then
			if S.header == "bar" then BW.uiClose(w, { style = S, size = 32, Position = { 1, -6, 0, 6 } })
			elseif S.header == "plain" then BW.uiClose(w, { style = S, size = 36, Position = { 1, -12, 0, 14 } })
			else BW.uiClose(w, { style = S }) end
		end
		w:SetAttribute("BW_Top", top)
		return w, top
	end

	-- Progress / health bar: Bar → Fill (gradient) + Gloss + Label.
	function BW.uiBar(parent, o)
		o = o or {}
		local S = BW.style(o.style)
		local p = cbase(o, S)
		p.Name = p.Name or "Bar"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 0, 260, 0, 26 }
		local b = BW.new("Frame", p)
		b.BackgroundColor3 = C3(S.barBg)
		b.BackgroundTransparency = 0.1
		if S.corner >= 8 then roundFull(b) else corner(b, S.corner) end
		stroke(b, S.stroke)
		local f = BW.new("Frame", { Name = "Fill", Parent = b, Size = UDim2.new(o.value or 0.65, 0, 1, 0), BackgroundColor3 = "#FFFFFF" })
		if S.corner >= 8 then roundFull(f) else corner(f, S.corner) end
		gradient(f, o.Colors or S.bar, 90)
		if S.gloss then
			local g = BW.new("Frame", { Name = "Gloss", Parent = f, Size = UDim2.new(1, -8, 0.4, 0), Position = UDim2.new(0, 4, 0, 2), BackgroundColor3 = "#FFFFFF", BackgroundTransparency = S.gloss })
			roundFull(g)
		end
		if o.text then label(b, o.text, S, { Name = "Label", Size = { 1, 0, 0.8, 0 }, Position = { 0, 0, 0.1, 0 }, Font = S.font, max = 22, ZIndex = 3 }) end
		return b
	end

	-- Currency counter pill with the icon overlapping its left edge (+ optional green "+" button). Children: Amount, Plus.
	function BW.uiPill(parent, o)
		o = o or {}
		local S = BW.style(o.style)
		local p = cbase(o, S)
		p.Name = p.Name or "Pill"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 0, 190, 0, 46 }
		local f = BW.new("Frame", p)
		f.BackgroundColor3 = C3("#FFFFFF")
		f.BackgroundTransparency = S.panelT or 0
		if S.corner >= 8 then roundFull(f) else corner(f, S.corner) end
		gradient(f, o.Colors or S.panel, 90)
		stroke(f, S.stroke)
		if o.icon then BW.icon(f, o.icon, { Name = "Icon", Size = { 0, 0, 1.3, 0 }, Position = { 0, -12, 0.5, 0 }, AnchorPoint = { 0, 0.5 }, ZIndex = 3 }) local ic = f:FindFirstChild("Icon") if ic then ic.Size = UDim2.new(1.3, 0, 1.3, 0) end end
		label(f, o.text or "0", S, { Name = "Amount", Size = { 0.56, 0, 0.72, 0 }, Position = { 0.3, 0, 0.14, 0 }, Font = S.font, X = "Left", max = 30 })
		if o.plus then BW.uiButton(f, "+", { style = S, kind = "primary", Name = "Plus", Size = { 0, 34, 0, 34 }, Position = { 1, -6, 0.5, 0 }, AnchorPoint = { 1, 0.5 }, max = 26, lip = 3 }) end
		return f
	end

	-- Item card with rarity colours: icon, ItemName, Price chip (+coin). rarity = common | uncommon | rare | epic | legendary | mythic | secret.
	function BW.uiCard(parent, o)
		o = o or {}
		local S = BW.style(o.style)
		local p = cbase(o, S)
		p.Name = p.Name or "Card"
		p.Parent = BW.get(parent)
		local c = BW.new("Frame", p)
		c.BackgroundColor3 = C3("#FFFFFF")
		local r = RARITY[o.rarity or "common"] or RARITY.common
		corner(c, math.max(4, S.corner - 6))
		gradient(c, o.rarity and r or S.inner, 90)
		stroke(c, o.rarity and { darker(r[2], 0.45), S.innerStroke and S.innerStroke[2] or 2 } or S.innerStroke)
		if o.rarity then c.BackgroundTransparency = 0 c:SetAttribute("Rarity", o.rarity) else c.BackgroundTransparency = S.innerT or 0 end
		if o.rays then BW.uiRays(c, { Size = { 1.1, 0, 1.1, 0 }, Position = { 0.5, 0, 0.36, 0 }, Color = "#FFFFFF", Transparency = 0.75, count = 10 }) end
		if o.icon then BW.icon(c, o.icon, { Name = "Icon", Size = { 0, 0, 0.42, 0 }, Position = { 0.5, 0, 0.08, 0 }, AnchorPoint = { 0.5, 0 } }) local ic = c:FindFirstChild("Icon") if ic then ic.Size = UDim2.new(0.42, 0, 0.42, 0) end end
		local tcol = o.rarity and "#FFFFFF" or S.innerText
		label(c, o.title or "", S, { Name = "ItemName", Size = { 0.92, 0, 0.15, 0 }, Position = { 0.04, 0, 0.52, 0 }, Font = S.font, Color = tcol, stroke = o.rarity and { darker(r[2], 0.6), 2 } or (tcol == S.text and S.ts or false), max = 24 })
		if o.price then
			local chip = BW.new("Frame", { Name = "PriceTag", Parent = c, Size = UDim2.new(0.8, 0, 0.13, 0), Position = UDim2.new(0.1, 0, 0.67, 0), BackgroundColor3 = "#000000", BackgroundTransparency = 0.55 })
			roundFull(chip)
			if o.currencyIcon ~= false then BW.icon(chip, o.currencyIcon or "coin", { Name = "Icon", Size = { 0, 0, 0.9, 0 }, Position = { 0, 4, 0.5, 0 }, AnchorPoint = { 0, 0.5 } }) local ic = chip:FindFirstChild("Icon") if ic then ic.Size = UDim2.new(0.9, 0, 0.9, 0) end end
			label(chip, tostring(o.price), S, { Name = "Price", Size = { 0.7, 0, 0.8, 0 }, Position = { 0.26, 0, 0.1, 0 }, Font = S.font, Color = "#FFFFFF", stroke = { "#000000", 1.5 }, X = "Left", max = 20 })
		end
		return c
	end

	-- On/off switch: Toggle (button) → Knob. Attribute On = true/false; uiJuice / your script animates it.
	function BW.uiToggle(parent, o)
		o = o or {}
		local S = BW.style(o.style)
		local p = cbase(o, S)
		p.Name = p.Name or "Toggle"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 0, 74, 0, 36 }
		local t = BW.new("TextButton", p)
		t.Text = ""
		t.AutoButtonColor = false
		t.BackgroundColor3 = C3(o.on == false and "#5A6078" or S.good)
		if S.corner >= 6 then roundFull(t) else corner(t, S.corner) end
		stroke(t, S.innerStroke or S.stroke)
		local k = BW.new("Frame", { Name = "Knob", Parent = t, Size = UDim2.new(0, 0, 0.8, 0), Position = UDim2.new(o.on == false and 0.06 or 0.94, 0, 0.5, 0), AnchorPoint = Vector2.new(o.on == false and 0 or 1, 0.5), BackgroundColor3 = "#FFFFFF" })
		k.Size = UDim2.new(0.8, 0, 0.8, 0)
		BW.new("UIAspectRatioConstraint", { AspectRatio = 1, Parent = k })
		if S.corner >= 6 then roundFull(k) else corner(k, S.corner) end
		t:SetAttribute("On", o.on ~= false)
		t:SetAttribute("BW_Juice", true)
		return t
	end

	-- Sunburst rays behind an icon/title (no image upload: thin rotated frames with a fade). BW_Spin attribute → uiJuice rotates it.
	function BW.uiRays(parent, o)
		o = o or {}
		local p = cbase(o, nil)
		p.Name = p.Name or "Rays"
		p.Parent = BW.get(parent)
		p.Size = p.Size or { 1.4, 0, 1.4, 0 }
		p.Position = p.Position or { 0.5, 0, 0.5, 0 }
		p.AnchorPoint = Vector2.new(0.5, 0.5)
		local r = BW.new("Frame", p)
		r.BackgroundTransparency = 1
		BW.new("UIAspectRatioConstraint", { AspectRatio = 1, Parent = r })
		local n = o.count or 12
		for i = 1, n do
			local ray = BW.new("Frame", { Name = "Ray" .. i, Parent = r, Size = UDim2.new(0.09, 0, 1, 0), Position = UDim2.new(0.5, 0, 0.5, 0), AnchorPoint = Vector2.new(0.5, 0.5), Rotation = (i - 1) * 180 / n, BackgroundColor3 = o.Color or "#FFFFFF", BackgroundTransparency = o.Transparency or 0.6 })
			local g = BW.new("UIGradient", { Rotation = 90, Parent = ray })
			g.Transparency = NumberSequence.new({ NumberSequenceKeypoint.new(0, 1), NumberSequenceKeypoint.new(0.5, 0), NumberSequenceKeypoint.new(1, 1) })
		end
		r:SetAttribute("BW_Spin", o.spin or 12)
		return r
	end

	local JUICE_SRC = [==[
-- Brickwire UI juice: hover/press bounce on buttons (BW_Juice), pop-in for windows (BW_Window), spinning rays (BW_Spin),
-- animated toggles (On attribute), optional click sound (attribute BW_ClickSound = "rbxassetid://…" on the button or the ScreenGui).
local TweenService = game:GetService("TweenService")
local RunService = game:GetService("RunService")
local gui = script.Parent
local function tw(o, t, goal, style, dir)
	TweenService:Create(o, TweenInfo.new(t, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out), goal):Play()
end
local function scaleOf(o)
	local s = o:FindFirstChild("BW_Scale")
	if not s then
		s = Instance.new("UIScale")
		s.Name = "BW_Scale"
		s.Parent = o
	end
	return s
end
local function click(b)
	local id = b:GetAttribute("BW_ClickSound") or gui:GetAttribute("BW_ClickSound")
	if type(id) ~= "string" or id == "" then return end
	local snd = Instance.new("Sound")
	snd.SoundId = id
	snd.Volume = 0.5
	snd.Parent = gui
	snd:Play()
	game:GetService("Debris"):AddItem(snd, 3)
end
local function toggleLook(b)
	local knob = b:FindFirstChild("Knob")
	if not knob or b:GetAttribute("On") == nil then return end
	local on = b:GetAttribute("On")
	tw(knob, 0.18, { Position = UDim2.new(on and 0.94 or 0.06, 0, 0.5, 0), AnchorPoint = Vector2.new(on and 1 or 0, 0.5) }, Enum.EasingStyle.Back)
	tw(b, 0.18, { BackgroundColor3 = on and Color3.fromRGB(47, 214, 123) or Color3.fromRGB(90, 96, 120) })
end
local function juice(b)
	if not b:IsA("GuiButton") or b:GetAttribute("BW_JuiceOn") then return end
	b:SetAttribute("BW_JuiceOn", true)
	local s = scaleOf(b)
	b.MouseEnter:Connect(function() tw(s, 0.12, { Scale = 1.06 }) end)
	b.MouseLeave:Connect(function() tw(s, 0.12, { Scale = 1 }) end)
	b.MouseButton1Down:Connect(function() tw(s, 0.07, { Scale = 0.92 }) end)
	b.MouseButton1Up:Connect(function() tw(s, 0.25, { Scale = 1 }, Enum.EasingStyle.Back) end)
	b.Activated:Connect(function() click(b) end)
	if b:GetAttribute("On") ~= nil then
		b:GetAttributeChangedSignal("On"):Connect(function() toggleLook(b) end)
	end
end
local function pop(w)
	if not w:IsA("GuiObject") or w:GetAttribute("BW_PopOn") then return end
	w:SetAttribute("BW_PopOn", true)
	local s = scaleOf(w)
	w:GetPropertyChangedSignal("Visible"):Connect(function()
		if w.Visible then
			s.Scale = 0.82
			tw(s, 0.28, { Scale = 1 }, Enum.EasingStyle.Back)
		end
	end)
end
local spinners = {}
local function scan(d)
	if d:GetAttribute("BW_Juice") then juice(d) end
	if d:GetAttribute("BW_Window") then pop(d) end
	if d:GetAttribute("BW_Spin") and d:IsA("GuiObject") then table.insert(spinners, d) end
end
for _, d in ipairs(gui:GetDescendants()) do scan(d) end
gui.DescendantAdded:Connect(scan)
RunService.Heartbeat:Connect(function(dt)
	for _, d in ipairs(spinners) do
		if d.Parent and d.Visible then d.Rotation = (d.Rotation + (d:GetAttribute("BW_Spin") or 0) * dt) % 360 end
	end
end)
]==]
	-- Adds the juice LocalScript to a ScreenGui (once).
	function BW.uiJuice(gui)
		gui = BW.get(gui)
		local old = gui:FindFirstChild("UIJuice")
		if old then old:Destroy() end
		return BW.script("LocalScript", "UIJuice", gui, JUICE_SRC)
	end
	BW._juiceSrc = JUICE_SRC

	-- Full-screen background: gradient + optional rays (menus, loading screens).
	function BW.uiBackdrop(gui, o)
		o = o or {}
		local S = BW.style(o.style)
		local f = BW.new("Frame", { Name = o.Name or "Backdrop", Parent = BW.get(gui), Size = UDim2.new(1, 0, 1, 0), BackgroundColor3 = "#FFFFFF", BackgroundTransparency = o.Transparency or 0, Visible = o.Visible ~= false, ZIndex = 0 })
		gradient(f, o.Colors or S.bg, 90)
		if o.rays ~= false and S.rays then BW.uiRays(f, { Size = { 1.6, 0, 1.6, 0 }, Position = { 0.5, 0, 0.42, 0 }, Transparency = 0.82, count = 16, spin = 6 }) end
		return f
	end

	-- ================================================================== UI KITS (ScreenGuis in StarterGui + LocalScripts; Scale sizes → phone-safe)
	BW.uiThemes = STYLES
	local function theme(o) return BW.style(o.style or o.theme or "simulator") end
	local function screen(o, def)
		local g = BW.screen(o.Name or def, { replace = true })
		return g
	end
	local function client(g, name, source) return BW.script("LocalScript", name, g, source) end
	local function finish(g, o)
		BW.uiJuice(g)
		g:SetAttribute("BW_Style", theme(o).name)
		return g
	end

	local HUD_SRC = [==[
-- Brickwire kit: HUD — coins counter bound to leaderstats (with a bump on change) + health bar bound to the Humanoid.
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local player = Players.LocalPlayer
local gui = script.Parent
local coins = gui:WaitForChild("Coins")
local coinsLabel = coins:WaitForChild("Amount")
local bar = gui:WaitForChild("Health"):WaitForChild("Fill")
local STAT = {{STAT}}
local function short(n)
	if n >= 1e9 then return string.format("%.1fB", n / 1e9) elseif n >= 1e6 then return string.format("%.1fM", n / 1e6) elseif n >= 1e4 then return string.format("%.1fK", n / 1e3) end
	return tostring(n)
end
local function bindStat()
	local ls = player:WaitForChild("leaderstats", 30)
	local v = ls and ls:WaitForChild(STAT, 30)
	if not v then return end
	local scale = coins:FindFirstChild("Bump") or Instance.new("UIScale")
	scale.Name = "Bump"
	scale.Parent = coins
	local function show()
		coinsLabel.Text = short(tonumber(v.Value) or 0)
		scale.Scale = 1.12
		TweenService:Create(scale, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	end
	v.Changed:Connect(show)
	show()
end
task.spawn(bindStat)
local function bindHealth(char)
	local hum = char:WaitForChild("Humanoid")
	local function upd()
		TweenService:Create(bar, TweenInfo.new(0.2), { Size = UDim2.new(math.clamp(hum.Health / hum.MaxHealth, 0, 1), 0, 1, 0) }):Play()
	end
	hum.HealthChanged:Connect(upd)
	upd()
end
if player.Character then bindHealth(player.Character) end
player.CharacterAdded:Connect(bindHealth)
]==]
	K("hud", function(o)
		local S = theme(o)
		local g = screen(o, "HUD")
		local c = BW.uiPill(g, { style = S, Name = "Coins", icon = "coin", text = "0", plus = o.plus ~= false, Size = { 0.17, 0, 0.07, 0 }, Position = { 0.035, 0, 0.04, 0 } })
		BW.new("UISizeConstraint", { MinSize = Vector2.new(150, 44), MaxSize = Vector2.new(280, 64), Parent = c })
		if o.gems then
			local gp = BW.uiPill(g, { style = S, Name = "Gems", icon = "gem", text = "0", Size = { 0.17, 0, 0.07, 0 }, Position = { 0.035, 0, 0.13, 0 } })
			BW.new("UISizeConstraint", { MinSize = Vector2.new(150, 44), MaxSize = Vector2.new(280, 64), Parent = gp })
		end
		local h = BW.uiBar(g, { style = S, Name = "Health", value = 1, Colors = { "#7CFF6B", "#22B14C" }, Size = { 0.3, 0, 0.04, 0 }, Position = { 0.5, 0, 0.93, 0 }, AnchorPoint = { 0.5, 0.5 } })
		BW.new("UISizeConstraint", { MinSize = Vector2.new(220, 22), MaxSize = Vector2.new(460, 34), Parent = h })
		BW.icon(h, "heart", { Name = "HeartIcon", Size = { 0, 34, 0, 34 }, Position = { 0, -22, 0.5, 0 }, AnchorPoint = { 0, 0.5 }, ZIndex = 4 })
		client(g, "HUDClient", src(HUD_SRC, { STAT = o.stat or "Coins" }))
		return finish(g, o)
	end)

	local SHOP_CLIENT = [==[
-- Brickwire kit: shop window (client). Prices live on the SERVER; the client only asks to buy an item id.
local RS = game:GetService("ReplicatedStorage")
local buy = RS:WaitForChild("Remotes"):WaitForChild("ShopBuy")
local gui = script.Parent
local win = gui:WaitForChild("ShopWindow")
local toggle = gui:WaitForChild("ShopButton")
local msg = win:WaitForChild("Message")
toggle.Activated:Connect(function() win.Visible = not win.Visible end)
win:WaitForChild("Close").Activated:Connect(function() win.Visible = false end)
for _, card in ipairs(win:WaitForChild("Grid"):GetChildren()) do
	local b = card:FindFirstChild("Buy")
	if b then
		b.Activated:Connect(function()
			local ok, text = buy:InvokeServer(card.Name)
			msg.Text = text
			msg.TextColor3 = ok and Color3.fromRGB(47, 214, 123) or Color3.fromRGB(255, 92, 108)
		end)
	end
end
]==]
	local SHOP_SERVER = [==[
-- Brickwire kit: shop (server). Validates EVERYTHING: item exists, player can afford it, not owned yet.
local RS = game:GetService("ReplicatedStorage")
local buy = RS:WaitForChild("Remotes"):WaitForChild("ShopBuy")
local ITEMS = {{ITEMS}} -- id = {price, stat}
local CURRENCY = {{CURRENCY}}
buy.OnServerInvoke = function(player, itemId)
	if typeof(itemId) ~= "string" then return false, "Bad request" end
	local item = ITEMS[itemId]
	if not item then return false, "Unknown item" end
	local ls = player:FindFirstChild("leaderstats")
	local money = ls and ls:FindFirstChild(CURRENCY)
	if not money then return false, "No " .. CURRENCY end
	local owned = player:FindFirstChild("Owned") or Instance.new("Folder")
	owned.Name = "Owned"
	owned.Parent = player
	if owned:FindFirstChild(itemId) then return false, "Already owned" end
	if money.Value < item.price then return false, "Not enough " .. CURRENCY end
	money.Value -= item.price
	local flag = Instance.new("BoolValue")
	flag.Name = itemId
	flag.Parent = owned
	return true, "Bought " .. itemId .. "!"
end
]==]
	local RARITY_BY_PRICE = function(p) if p >= 500 then return "legendary" elseif p >= 200 then return "epic" elseif p >= 100 then return "rare" elseif p >= 50 then return "uncommon" end return "common" end
	K("shop", function(o)
		local S = theme(o)
		local g = screen(o, "ShopUI")
		local items = o.items or { { "Sword", 50, "sword" }, { "Shield", 80, "shield" }, { "Potion", 20, "potion" }, { "Speed", 120, "bolt" }, { "Gem", 200, "gem" }, { "Crown", 500, "crown" } }
		BW.uiIconButton(g, "cart", { style = S, Name = "ShopButton", kind = "gold", caption = "Shop", Position = { 0.02, 0, 0.5, -34 } })
		local w, top = BW.uiWindow(g, { style = S, Name = "ShopWindow", title = o.title or "Shop", Size = { 0.46, 0, 0.66, 0 } })
		local grid = BW.ui("ScrollingFrame", { Name = "Grid", Parent = w, Size = { 1, -28, 1, -(top + 52) }, Position = { 0, 14, 0, top }, BackgroundTransparency = 1, ScrollBarThickness = 6, CanvasSize = { 0, 0, 0, 0 }, AutomaticCanvasSize = "Y" })
		BW.new("UIGridLayout", { CellSize = UDim2.new(0.31, 0, 0, 168), CellPadding = UDim2.new(0.025, 0, 0, 12), SortOrder = "LayoutOrder", HorizontalAlignment = "Center", Parent = grid })
		BW.new("UIPadding", { PaddingTop = UDim.new(0, 4), PaddingBottom = UDim.new(0, 4), Parent = grid })
		local list = {}
		for i, it in ipairs(items) do
			local card = BW.uiCard(grid, { style = S, Name = it[1], title = it[1], icon = it[3] or "star", price = it[2], rarity = it[4] or (o.rarity ~= false and RARITY_BY_PRICE(it[2]) or nil), LayoutOrder = i })
			BW.uiButton(card, "Buy", { style = S, kind = "primary", Name = "Buy", Size = { 0.84, 0, 0.17, 0 }, Position = { 0.08, 0, 0.8, 0 }, max = 22, lip = 4 })
			table.insert(list, string.format("[%q] = { price = %d }", it[1], it[2]))
		end
		BW._uiLabel(w, "", S, { Name = "Message", Size = { 1, -28, 0, 30 }, Position = { 0, 14, 1, -42 }, Color = S.mut, max = 22 })
		BW.remote("ShopBuy", "RemoteFunction")
		client(g, "ShopClient", SHOP_CLIENT)
		local s = string.gsub(SHOP_SERVER, "{{ITEMS}}", function() return "{ " .. table.concat(list, ", ") .. " }" end)
		BW.script("Script", "ShopServer", "ServerScriptService", src(s, { CURRENCY = o.currency or "Coins" }))
		return finish(g, o)
	end)

	local INV_SRC = [==[
-- Brickwire kit: inventory grid. Toggle with the bag button or the G key; shows the player's Backpack tools.
local Players = game:GetService("Players")
local UIS = game:GetService("UserInputService")
local player = Players.LocalPlayer
local gui = script.Parent
local win = gui:WaitForChild("Inventory")
local grid = win:WaitForChild("Grid")
local function refresh()
	for _, s in ipairs(grid:GetChildren()) do
		local l = s:FindFirstChild("Label")
		if l then l.Text = "" end
	end
	local i = 0
	for _, tool in ipairs(player:WaitForChild("Backpack"):GetChildren()) do
		i += 1
		local slot = grid:FindFirstChild("Slot" .. i)
		if slot and slot:FindFirstChild("Label") then slot.Label.Text = tool.Name end
	end
end
gui:WaitForChild("BagButton").Activated:Connect(function() win.Visible = not win.Visible refresh() end)
win:WaitForChild("Close").Activated:Connect(function() win.Visible = false end)
UIS.InputBegan:Connect(function(input, processed)
	if not processed and input.KeyCode == Enum.KeyCode.G then win.Visible = not win.Visible refresh() end
end)
player:WaitForChild("Backpack").ChildAdded:Connect(refresh)
]==]
	K("inventory", function(o)
		local S = theme(o)
		local g = screen(o, "InventoryUI")
		BW.uiIconButton(g, "bag", { style = S, Name = "BagButton", kind = "secondary", caption = "Items", Position = { 0.02, 0, 0.5, 52 } })
		local w, top = BW.uiWindow(g, { style = S, Name = "Inventory", title = o.title or "Inventory", Size = { 0.5, 0, 0.58, 0 } })
		local grid = BW.ui("Frame", { Name = "Grid", Parent = w, Size = { 1, -28, 1, -(top + 14) }, Position = { 0, 14, 0, top }, BackgroundTransparency = 1 })
		BW.new("UIGridLayout", { CellSize = UDim2.new(0.18, 0, 0.3, 0), CellPadding = UDim2.new(0.02, 0, 0.03, 0), SortOrder = "LayoutOrder", HorizontalAlignment = "Center", Parent = grid })
		for i = 1, o.slots or 15 do
			local s = BW.uiPanel(grid, { style = S, inner = true, Name = "Slot" .. i, LayoutOrder = i })
			BW._uiLabel(s, "", S, { Name = "Label", Size = { 1, -8, 0.32, 0 }, Position = { 0, 4, 0.64, 0 }, Color = S.innerText, stroke = false, max = 16 })
		end
		client(g, "InventoryClient", INV_SRC)
		return finish(g, o)
	end)

	local MENU_SRC = [==[
-- Brickwire kit: main menu. Shown on join with a blurred world; Play hides it.
local Lighting = game:GetService("Lighting")
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local menu = gui:WaitForChild("Menu")
local blur = Instance.new("BlurEffect")
blur.Size = 18
blur.Parent = Lighting
menu.Visible = true
local title = menu:FindFirstChild("GameTitle")
if title then
	task.spawn(function()
		local t = 0
		while menu.Visible and title.Parent do
			t += 0.03
			title.Rotation = math.sin(t * 2) * 2
			task.wait(0.03)
		end
	end)
end
menu:WaitForChild("Buttons"):WaitForChild("Play").Activated:Connect(function()
	TweenService:Create(blur, TweenInfo.new(0.4), { Size = 0 }):Play()
	menu.Visible = false
	game:GetService("Players").LocalPlayer:SetAttribute("InMenu", false) -- stops the menu_camera kit, if any
	task.delay(0.45, function() blur:Destroy() end)
end)
local settings = menu.Buttons:FindFirstChild("Settings")
if settings then
	settings.Activated:Connect(function()
		local s = gui.Parent:FindFirstChild("SettingsUI")
		if s and s:FindFirstChild("Settings") then s.Settings.Visible = true end
	end)
end
local shop = menu.Buttons:FindFirstChild("Shop")
if shop then
	shop.Activated:Connect(function()
		local s = gui.Parent:FindFirstChild("ShopUI")
		if s and s:FindFirstChild("ShopWindow") then menu.Visible = false blur:Destroy() s.ShopWindow.Visible = true end
	end)
end
]==]
	K("main_menu", function(o)
		local S = theme(o)
		local g = screen(o, "MainMenu")
		g.IgnoreGuiInset = true
		local menu = BW.ui("Frame", { Name = "Menu", Parent = g, Size = { 1, 0, 1, 0 }, BackgroundTransparency = 1, Visible = false, Attributes = { BW_Window = true } })
		BW.uiBackdrop(menu, { style = S, Transparency = 0.12 })
		BW.uiTitle(menu, o.title or "MY GAME", { style = S, Name = "GameTitle", Size = { 0.62, 0, 0.17, 0 }, Position = { 0.5, 0, 0.25, 0 }, AnchorPoint = { 0.5, 0.5 }, Gradient = S.headerColor, max = 120, stroke = { S.stroke[1], math.max(3, (S.stroke[2] or 2) + 1) } })
		BW._uiLabel(menu, o.subtitle or "Made with Brickwire", S, { Name = "Subtitle", Size = { 0.5, 0, 0.05, 0 }, Position = { 0.5, 0, 0.37, 0 }, AnchorPoint = { 0.5, 0.5 }, Color = S.mut, max = 30 })
		local b = BW.ui("Frame", { Name = "Buttons", Parent = menu, Size = { 0.26, 0, 0.36, 0 }, Position = { 0.5, 0, 0.64, 0 }, AnchorPoint = Vector2.new(0.5, 0.5), BackgroundTransparency = 1, List = { Padding = 14 } })
		BW.new("UISizeConstraint", { MinSize = Vector2.new(230, 190), MaxSize = Vector2.new(420, 330), Parent = b })
		BW.uiButton(b, "PLAY", { style = S, kind = "primary", Name = "Play", Size = { 1, 0, 0.3, 0 }, LayoutOrder = 1, max = 44 })
		BW.uiButton(b, "SHOP", { style = S, kind = "gold", Name = "Shop", Size = { 0.86, 0, 0.26, 0 }, LayoutOrder = 2, icon = "cart" })
		BW.uiButton(b, "SETTINGS", { style = S, kind = "secondary", Name = "Settings", Size = { 0.86, 0, 0.26, 0 }, LayoutOrder = 3, icon = "gear" })
		client(g, "MenuClient", MENU_SRC)
		return finish(g, o)
	end)

	local DIALOG_SRC = [==[
-- Brickwire kit: dialog box. Server: Remotes.ShowDialog:FireClient(player, "Speaker", {"line 1", "line 2"}).
local RS = game:GetService("ReplicatedStorage")
local show = RS:WaitForChild("Remotes"):WaitForChild("ShowDialog")
local gui = script.Parent
local box = gui:WaitForChild("Dialog")
local nameL, textL, nextB = box:WaitForChild("Speaker"), box:WaitForChild("Text"), box:WaitForChild("Next")
local queue, typing = {}, false
local function typeLine(line)
	typing = true
	for i = 1, #line do
		textL.Text = string.sub(line, 1, i)
		task.wait(0.02)
		if not typing then textL.Text = line break end
	end
	typing = false
end
local function nextLine()
	if typing then typing = false return end
	local line = table.remove(queue, 1)
	if not line then box.Visible = false return end
	task.spawn(typeLine, line)
end
show.OnClientEvent:Connect(function(speaker, lines)
	if type(lines) ~= "table" then return end
	local l = nameL:FindFirstChild("Label")
	if l then l.Text = tostring(speaker) else nameL.Text = tostring(speaker) end
	queue = table.clone(lines)
	box.Visible = true
	nextLine()
end)
nextB.Activated:Connect(nextLine)
]==]
	K("dialog", function(o)
		local S = theme(o)
		local g = screen(o, "DialogUI")
		local d = BW.uiPanel(g, { style = S, Name = "Dialog", Size = { 0.6, 0, 0.21, 0 }, Position = { 0.5, 0, 0.95, 0 }, AnchorPoint = { 0.5, 1 }, Visible = false })
		d:SetAttribute("BW_Window", true)
		BW.new("UISizeConstraint", { MinSize = Vector2.new(340, 140), MaxSize = Vector2.new(900, 220), Parent = d })
		local tag = BW.uiPanel(d, { style = S, Name = "Speaker", Colors = S.headerColor, Size = { 0.3, 0, 0, 40 }, Position = { 0, 18, 0, -22 }, ZIndex = 3 })
		tag.Rotation = S.rot or 0
		BW._uiLabel(tag, "Villager", S, { Name = "Label", Size = { 0.9, 0, 0.75, 0 }, Position = { 0.05, 0, 0.12, 0 }, Font = S.font, Color = S.headerText or S.text, max = 28, ZIndex = 4 })
		BW._uiLabel(d, "Hello, traveler! The castle is to the north.", S, { Name = "Text", Size = { 0.76, 0, 0.56, 0 }, Position = { 0.03, 0, 0.3, 0 }, X = "Left", Y = "Top", max = 28, stroke = false })
		BW.uiButton(d, "Next", { style = S, kind = "primary", Name = "Next", Size = { 0.17, 0, 0.32, 0 }, Position = { 0.97, 0, 0.9, 0 }, AnchorPoint = { 1, 1 }, icon = "play" })
		BW.remote("ShowDialog")
		client(g, "DialogClient", DIALOG_SRC)
		return finish(g, o)
	end)

	local TOAST_SRC = [==[
-- Brickwire kit: notifications. Server: Remotes.Notify:FireClient(player, "text", "good"|"warn"|"bad"|"info").
local RS = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local notify = RS:WaitForChild("Remotes"):WaitForChild("Notify")
local gui = script.Parent
local stack = gui:WaitForChild("Stack")
local template = stack:WaitForChild("Template")
template.Visible = false
local COLORS = {{COLORS}}
local n = 0
notify.OnClientEvent:Connect(function(text, kind)
	n += 1
	local t = template:Clone()
	t.Name = "Toast" .. n
	t.LayoutOrder = n
	t.Text.Text = tostring(text)
	t.Bar.BackgroundColor3 = COLORS[kind] or COLORS.info
	t.Position = UDim2.new(1.2, 0, 0, 0)
	t.Visible = true
	t.Parent = stack
	local s = Instance.new("UIScale")
	s.Scale = 0.6
	s.Parent = t
	TweenService:Create(s, TweenInfo.new(0.3, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	task.delay(4, function()
		TweenService:Create(s, TweenInfo.new(0.25), { Scale = 0 }):Play()
		task.wait(0.25)
		t:Destroy()
	end)
end)
]==]
	K("notifications", function(o)
		local S = theme(o)
		local g = screen(o, "Notifications")
		local stack = BW.ui("Frame", { Name = "Stack", Parent = g, Size = { 0.25, 0, 0.5, 0 }, Position = { 0.98, 0, 0.04, 0 }, AnchorPoint = Vector2.new(1, 0), BackgroundTransparency = 1, List = { Padding = 10, Align = "Right" } })
		BW.new("UISizeConstraint", { MinSize = Vector2.new(230, 100), MaxSize = Vector2.new(380, 600), Parent = stack })
		local t = BW.uiPanel(stack, { style = S, Name = "Template", Size = { 1, 0, 0, 60 } })
		t:SetAttribute("BW_Window", true)
		local bar = BW.new("Frame", { Name = "Bar", Parent = t, Size = UDim2.new(0, 8, 1, -16), Position = UDim2.new(0, 8, 0, 8), BackgroundColor3 = S.good })
		roundFull(bar)
		BW._uiLabel(t, "+50 Coins!", S, { Name = "Text", Size = { 1, -36, 0.7, 0 }, Position = { 0, 26, 0.15, 0 }, Font = S.font, X = "Left", max = 26 })
		BW.remote("Notify")
		local cols = string.format("{ good = Color3.fromHex(%q), warn = Color3.fromHex(%q), bad = Color3.fromHex(%q), info = Color3.fromHex(%q) }", S.good, S.warn, S.bad, S.accent)
		client(g, "NotifyClient", (string.gsub(TOAST_SRC, "{{COLORS}}", function() return cols end)))
		return finish(g, o)
	end)

	local SETTINGS_SRC = [==[
-- Brickwire kit: settings panel. Toggles are stored as player attributes (Setting_<Name>) — read them in your scripts.
local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local player = Players.LocalPlayer
local gui = script.Parent
local win = gui:WaitForChild("Settings")
win:WaitForChild("Close").Activated:Connect(function() win.Visible = false end)
gui:WaitForChild("SettingsButton").Activated:Connect(function() win.Visible = not win.Visible end)
for _, row in ipairs(win:WaitForChild("Rows"):GetChildren()) do
	local t = row:FindFirstChild("Toggle")
	if t then
		local key = "Setting_" .. row.Name
		local on = row:GetAttribute("Default") ~= false
		local function show()
			t:SetAttribute("On", on) -- UIJuice animates the knob + colour
			player:SetAttribute(key, on)
			if row.Name == "Shadows" then Lighting.GlobalShadows = on end
		end
		t.Activated:Connect(function() on = not on show() end)
		show()
	end
end
]==]
	K("settings", function(o)
		local S = theme(o)
		local g = screen(o, "SettingsUI")
		BW.uiIconButton(g, "gear", { style = S, Name = "SettingsButton", kind = "neutral", Size = { 0, 58, 0, 58 }, Position = { 0.98, -58, 0.9, -58 } })
		local w, top = BW.uiWindow(g, { style = S, Name = "Settings", title = o.title or "Settings", Size = { 0.36, 0, 0.52, 0 } })
		local rows = BW.ui("Frame", { Name = "Rows", Parent = w, Size = { 1, -28, 1, -(top + 14) }, Position = { 0, 14, 0, top }, BackgroundTransparency = 1, List = { Padding = 10 } })
		for i, name in ipairs(o.toggles or { "Music", "Sounds", "Shadows", "ShowTips" }) do
			local r = BW.uiPanel(rows, { style = S, inner = true, Name = name, Size = { 1, 0, 0, 50 }, LayoutOrder = i })
			BW._uiLabel(r, name, S, { Name = "Label", Size = { 0.6, 0, 0.6, 0 }, Position = { 0.05, 0, 0.2, 0 }, Font = S.font, Color = S.innerText, X = "Left", stroke = S.innerText == S.text and S.ts or false, max = 26 })
			BW.uiToggle(r, { style = S, Name = "Toggle", Size = { 0, 74, 0, 34 }, Position = { 0.95, 0, 0.5, 0 }, AnchorPoint = { 1, 0.5 } })
		end
		client(g, "SettingsClient", SETTINGS_SRC)
		return finish(g, o)
	end)

	local LOADING_SRC = [==[
-- Brickwire kit: loading screen. Waits for the game to load (max 8 s), animates the bar + percent, then fades out.
local ContentProvider = game:GetService("ContentProvider")
local TweenService = game:GetService("TweenService")
local gui = script.Parent
local screen = gui:WaitForChild("Loading")
local bar = screen:WaitForChild("Bar")
local fill = bar:WaitForChild("Fill")
local pct = bar:FindFirstChild("Label")
screen.Visible = true
local function set(a)
	fill.Size = UDim2.new(a, 0, 1, 0)
	if pct then pct.Text = math.floor(a * 100) .. "%" end
end
local start = os.clock()
while not game:IsLoaded() and os.clock() - start < 8 do
	set(math.min(0.9, (os.clock() - start) / 8))
	task.wait(0.1)
end
pcall(function() ContentProvider:PreloadAsync({ workspace }) end)
set(1)
task.wait(0.3)
for _, d in ipairs(screen:GetDescendants()) do
	if d:IsA("GuiObject") then TweenService:Create(d, TweenInfo.new(0.5), { BackgroundTransparency = 1 }):Play() end
	if d:IsA("TextLabel") then TweenService:Create(d, TweenInfo.new(0.5), { TextTransparency = 1 }):Play() end
end
TweenService:Create(screen, TweenInfo.new(0.6), { BackgroundTransparency = 1 }):Play()
task.wait(0.6)
screen.Visible = false
]==]
	K("loading_screen", function(o)
		local S = theme(o)
		local g = screen(o, "LoadingScreen")
		g.IgnoreGuiInset = true
		g.DisplayOrder = 100
		local s = BW.ui("Frame", { Name = "Loading", Parent = g, Size = { 1, 0, 1, 0 }, BackgroundColor3 = S.bg[2], Visible = false, Attributes = { BW_Window = true } })
		BW.uiBackdrop(s, { style = S })
		BW.uiTitle(s, o.title or "MY GAME", { style = S, Name = "GameTitle", Size = { 0.5, 0, 0.14, 0 }, Position = { 0.5, 0, 0.42, 0 }, AnchorPoint = { 0.5, 0.5 }, Gradient = S.headerColor, max = 110 })
		local bar = BW.uiBar(s, { style = S, Name = "Bar", value = 0.6, text = "60%", Size = { 0.4, 0, 0.04, 0 }, Position = { 0.5, 0, 0.58, 0 }, AnchorPoint = { 0.5, 0.5 } })
		BW.new("UISizeConstraint", { MinSize = Vector2.new(260, 24), MaxSize = Vector2.new(620, 40), Parent = bar })
		BW._uiLabel(s, o.tip or "Tip: collect coins to buy upgrades", S, { Name = "Tip", Size = { 0.6, 0, 0.04, 0 }, Position = { 0.5, 0, 0.67, 0 }, AnchorPoint = { 0.5, 0.5 }, Color = S.mut, max = 26 })
		client(g, "LoadingClient", LOADING_SRC)
		return finish(g, o)
	end)

	local REWARD_CLIENT = [==[
-- Brickwire kit: daily reward (client).
local RS = game:GetService("ReplicatedStorage")
local claim = RS:WaitForChild("Remotes"):WaitForChild("DailyReward")
local gui = script.Parent
local win = gui:WaitForChild("Reward")
gui:WaitForChild("GiftButton").Activated:Connect(function() win.Visible = not win.Visible end)
win:WaitForChild("Close").Activated:Connect(function() win.Visible = false end)
win:WaitForChild("Claim").Activated:Connect(function()
	local ok, text = claim:InvokeServer()
	win.Info.Text = text
end)
]==]
	local REWARD_SERVER = [==[
-- Brickwire kit: daily reward (server). One claim per 24 h, stored in a DataStore, amount decided by the server.
local RS = game:GetService("ReplicatedStorage")
local DSS = game:GetService("DataStoreService")
local store = DSS:GetDataStore("DailyReward_v1")
local claim = RS:WaitForChild("Remotes"):WaitForChild("DailyReward")
local AMOUNT, CURRENCY = {{AMOUNT}}, {{CURRENCY}}
local busy = {}
claim.OnServerInvoke = function(player)
	if busy[player] then return false, "Please wait" end
	busy[player] = true
	local key = "u_" .. player.UserId
	local ok, last = pcall(function() return store:GetAsync(key) end)
	local result, text = false, "Try again later"
	if ok then
		local now = os.time()
		if type(last) == "number" and now - last < 86400 then
			local h = math.ceil((86400 - (now - last)) / 3600)
			text = "Come back in " .. h .. " h"
		else
			local saved = pcall(function() store:SetAsync(key, now) end)
			local ls = player:FindFirstChild("leaderstats")
			local cur = ls and ls:FindFirstChild(CURRENCY)
			if saved and cur then
				cur.Value += AMOUNT
				result, text = true, "+" .. AMOUNT .. " " .. CURRENCY .. "!"
			end
		end
	end
	busy[player] = nil
	return result, text
end
]==]
	K("daily_reward", function(o)
		local S = theme(o)
		local g = screen(o, "DailyRewardUI")
		BW.uiIconButton(g, "gift", { style = S, Name = "GiftButton", kind = "gold", caption = "Daily", Position = { 0.02, 0, 0.5, -124 } })
		local w, top = BW.uiWindow(g, { style = S, Name = "Reward", title = o.title or "Daily reward", Size = { 0.32, 0, 0.5, 0 } })
		local holder = BW.ui("Frame", { Name = "GiftArt", Parent = w, Size = { 0.5, 0, 0.42, 0 }, Position = { 0.5, 0, 0, top + 6 }, AnchorPoint = Vector2.new(0.5, 0), BackgroundTransparency = 1 })
		BW.new("UIAspectRatioConstraint", { AspectRatio = 1, Parent = holder })
		BW.uiRays(holder, { Color = S.gold[1], Transparency = 0.45, count = 12, spin = 20 })
		BW.icon(holder, "gift", { Name = "Icon", Size = { 0.8, 0, 0.8, 0 }, Position = { 0.5, 0, 0.5, 0 }, AnchorPoint = { 0.5, 0.5 } })
		BW._uiLabel(w, "+" .. (o.amount or 100) .. " " .. (o.currency or "Coins") .. " every day", S, { Name = "Info", Size = { 0.9, 0, 0, 30 }, Position = { 0.05, 0, 1, -112 }, Font = S.font, max = 26 })
		BW.uiButton(w, "CLAIM", { style = S, kind = "primary", Name = "Claim", Size = { 0.6, 0, 0, 54 }, Position = { 0.5, 0, 1, -16 }, AnchorPoint = { 0.5, 1 }, max = 34 })
		BW.remote("DailyReward", "RemoteFunction")
		client(g, "RewardClient", REWARD_CLIENT)
		BW.script("Script", "DailyRewardServer", "ServerScriptService", src(REWARD_SERVER, { AMOUNT = o.amount or 100, CURRENCY = o.currency or "Coins" }))
		return finish(g, o)
	end)

	local STATUS_SRC = [==[
-- Brickwire kit: round status bar (shows ReplicatedStorage.RoundStatus).
local RS = game:GetService("ReplicatedStorage")
local label = script.Parent:WaitForChild("Status"):WaitForChild("Text")
local v = RS:WaitForChild("RoundStatus", 60)
if not v then return end
local function show() label.Text = v.Value end
v.Changed:Connect(show)
show()
]==]
	K("timer_bar", function(o)
		local S = theme(o)
		local g = screen(o, "RoundStatusUI")
		local s = BW.uiPill(g, { style = S, Name = "Status", icon = "clock", text = "Round starts in 10", Size = { 0.34, 0, 0.065, 0 }, Position = { 0.5, 0, 0.025, 0 }, AnchorPoint = { 0.5, 0 } })
		BW.new("UISizeConstraint", { MinSize = Vector2.new(250, 40), MaxSize = Vector2.new(520, 60), Parent = s })
		local a = s:FindFirstChild("Amount")
		if a then a.Name = "Text" a.Size = UDim2.new(0.74, 0, 0.72, 0) a.Position = UDim2.new(0.2, 0, 0.14, 0) a.TextXAlignment = "Center" end
		client(g, "StatusClient", STATUS_SRC)
		return finish(g, o)
	end)

	-- Style showcase: one screen per style (HUD pill, window with rarity cards, buttons, bar, toggle) — Library previews + a quick look in Studio.
	K("ui_showcase", function(o)
		local S = theme(o)
		local g = screen(o, "StyleShowcase_" .. S.name)
		local c = BW.uiPill(g, { style = S, Name = "Coins", icon = "coin", text = "12.5K", plus = true, Size = { 0, 200, 0, 50 }, Position = { 0, 40, 0, 30 } })
		BW.uiPill(g, { style = S, Name = "Gems", icon = "gem", text = "340", Size = { 0, 200, 0, 50 }, Position = { 0, 40, 0, 96 } })
		local side = BW.ui("Frame", { Name = "Side", Parent = g, Size = { 0, 80, 0, 300 }, Position = { 0, 30, 0.5, -110 }, BackgroundTransparency = 1, List = { Padding = 26 } })
		BW.uiIconButton(side, "cart", { style = S, Name = "ShopButton", kind = "gold", caption = "Shop", LayoutOrder = 1 })
		BW.uiIconButton(side, "gift", { style = S, Name = "GiftButton", kind = "secondary", caption = "Daily", LayoutOrder = 2 })
		BW.uiIconButton(side, "gear", { style = S, Name = "SettingsButton", kind = "neutral", LayoutOrder = 3 })
		local w, top = BW.uiWindow(g, { style = S, Name = "Window", title = o.title or "Shop", Size = { 0, 560, 0, 400 }, Position = { 0.5, 30, 0.5, 20 }, Visible = true })
		local grid = BW.ui("Frame", { Name = "Grid", Parent = w, Size = { 1, -28, 0, 196 }, Position = { 0, 14, 0, top }, BackgroundTransparency = 1 })
		BW.new("UIGridLayout", { CellSize = UDim2.new(0.31, 0, 0, 190), CellPadding = UDim2.new(0.025, 0, 0, 10), HorizontalAlignment = "Center", SortOrder = "LayoutOrder", Parent = grid })
		for i, it in ipairs({ { "Sword", 50, "sword", "rare" }, { "Crown", 900, "crown", "legendary" }, { "Potion", 20, "potion", "epic" } }) do
			local card = BW.uiCard(grid, { style = S, Name = it[1], title = it[1], icon = it[3], price = it[2], rarity = it[4], rays = it[4] == "legendary", LayoutOrder = i })
			BW.uiButton(card, "Buy", { style = S, kind = "primary", Name = "Buy", Size = { 0.84, 0, 0.17, 0 }, Position = { 0.08, 0, 0.8, 0 }, max = 22, lip = 4 })
		end
		BW.uiBar(w, { style = S, Name = "XP", value = 0.62, text = "Level 7", Size = { 1, -150, 0, 30 }, Position = { 0, 14, 1, -58 } })
		BW.uiToggle(w, { style = S, Name = "Toggle", Size = { 0, 74, 0, 34 }, Position = { 1, -16, 1, -56 }, AnchorPoint = { 1, 0 } })
		local bb = BW.ui("Frame", { Name = "Buttons", Parent = g, Size = { 0, 560, 0, 60 }, Position = { 0.5, 30, 1, -40 }, AnchorPoint = Vector2.new(0.5, 1), BackgroundTransparency = 1, List = { Padding = 12, Direction = "Horizontal" } })
		BW.uiButton(bb, "PLAY", { style = S, kind = "primary", Name = "Play", Size = { 0, 170, 0, 58 }, LayoutOrder = 1 })
		BW.uiButton(bb, "UPGRADE", { style = S, kind = "gold", Name = "Upgrade", Size = { 0, 170, 0, 58 }, LayoutOrder = 2, icon = "star" })
		BW.uiButton(bb, "QUIT", { style = S, kind = "danger", Name = "Quit", Size = { 0, 170, 0, 58 }, LayoutOrder = 3 })
		return finish(g, o)
	end)

	K("style_simulator", function(o) local oo = table.clone(o) oo.style = "simulator" return KITS.ui_showcase(oo) end)
	K("style_cartoon", function(o) local oo = table.clone(o) oo.style = "cartoon" return KITS.ui_showcase(oo) end)
	K("style_anime", function(o) local oo = table.clone(o) oo.style = "anime" return KITS.ui_showcase(oo) end)
	K("style_glass", function(o) local oo = table.clone(o) oo.style = "glass" return KITS.ui_showcase(oo) end)
	K("style_neon", function(o) local oo = table.clone(o) oo.style = "neon" return KITS.ui_showcase(oo) end)
	K("style_fantasy", function(o) local oo = table.clone(o) oo.style = "fantasy" return KITS.ui_showcase(oo) end)
	K("style_minimal", function(o) local oo = table.clone(o) oo.style = "minimal" return KITS.ui_showcase(oo) end)
	K("style_dark", function(o) local oo = table.clone(o) oo.style = "dark" return KITS.ui_showcase(oo) end)
	K("style_candy", function(o) local oo = table.clone(o) oo.style = "candy" return KITS.ui_showcase(oo) end)
	K("style_pixel", function(o) local oo = table.clone(o) oo.style = "pixel" return KITS.ui_showcase(oo) end)
	K("style_horror", function(o) local oo = table.clone(o) oo.style = "horror" return KITS.ui_showcase(oo) end)
	K("style_tactical", function(o) local oo = table.clone(o) oo.style = "tactical" return KITS.ui_showcase(oo) end)
	K("style_luxury", function(o) local oo = table.clone(o) oo.style = "luxury" return KITS.ui_showcase(oo) end)

	-- ================================================================== VFX LIBRARY (1.7): ReplicatedStorage.BrickwireVFX
	-- Layered, timed 3D effects made only from built-in content (no uploads): particles with rbxasset textures,
	-- ForceField/Neon shells and rings, lights, lightning bolts, slash arcs, physics debris, camera shake.
	local VFX_SRC = [==[
-- Brickwire VFX module (ReplicatedStorage.BrickwireVFX). Usage (Script or LocalScript):
--   local VFX = require(game.ReplicatedStorage:WaitForChild("BrickwireVFX"))
--   VFX.play("explosion", part.CFrame)            -- or a Vector3 / BasePart / Attachment
--   VFX.play("slash", hrp.CFrame, { color = Color3.fromRGB(120, 200, 255), scale = 1.5 })
--   VFX.bolt(fromPos, toPos, { color = … })      VFX.shake(1, 0.4) (client)      VFX.flash(model)
--   VFX.list() → preset names.  Hit/impact effects: call them on the CLIENT (via a RemoteEvent) for zero server cost.
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")
local RunService = game:GetService("RunService")
local VFX = {}
local TEX = {
	spark = "rbxasset://textures/particles/sparkles_main.dds",
	fire = "rbxasset://textures/particles/fire_main.dds",
	smoke = "rbxasset://textures/particles/smoke_main.dds",
	embers = "rbxasset://textures/particles/fire_sparks_main.dds",
	core = "rbxasset://textures/particles/explosion01_core_main.dds",
	wave = "rbxasset://textures/particles/explosion01_shockwave_main.dds",
	puff = "rbxasset://textures/particles/explosion01_smoke_main.dds",
	implode = "rbxasset://textures/particles/explosion01_implosion_main.dds",
	glow = "rbxasset://textures/particles/forcefield_glow_main.dds",
	vortex = "rbxasset://textures/particles/forcefield_vortex_main.dds",
}
VFX.TEX = TEX
local function C(h) return typeof(h) == "Color3" and h or Color3.fromHex(h) end
local function cseq(c)
	if typeof(c) == "ColorSequence" then return c end
	if type(c) ~= "table" then return ColorSequence.new(C(c)) end
	local k = {}
	for i, v in ipairs(c) do table.insert(k, ColorSequenceKeypoint.new((i - 1) / math.max(1, #c - 1), C(v))) end
	if #k == 1 then table.insert(k, ColorSequenceKeypoint.new(1, k[1].Value)) end
	return ColorSequence.new(k)
end
local function nseq(v, scale)
	scale = scale or 1
	if typeof(v) == "NumberSequence" then return v end
	if type(v) == "number" then return NumberSequence.new(v * scale) end
	local k = {}
	for i, x in ipairs(v) do
		if type(x) == "table" then table.insert(k, NumberSequenceKeypoint.new(x[1], x[2] * scale))
		else table.insert(k, NumberSequenceKeypoint.new((i - 1) / math.max(1, #v - 1), x * scale)) end
	end
	if #k == 1 then table.insert(k, NumberSequenceKeypoint.new(1, k[1].Value)) end
	return NumberSequence.new(k)
end
local function range(v, s)
	s = s or 1
	if type(v) == "number" then return NumberRange.new(v * s) end
	return NumberRange.new(v[1] * s, (v[2] or v[1]) * s)
end
local function tween(o, t, goal, style, dir)
	local tw = TweenService:Create(o, TweenInfo.new(t, style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out), goal)
	tw:Play()
	return tw
end
local function later(t, fn) if t and t > 0 then task.delay(t, fn) else fn() end end
local folder
local function fxFolder()
	if folder and folder.Parent then return folder end
	folder = workspace:FindFirstChild("BrickwireFX")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "BrickwireFX"
		folder.Parent = workspace
	end
	return folder
end
local function toCF(where)
	if typeof(where) == "CFrame" then return where end
	if typeof(where) == "Vector3" then return CFrame.new(where) end
	if typeof(where) == "Instance" then
		if where:IsA("Attachment") then return where.WorldCFrame end
		if where:IsA("BasePart") then return where.CFrame end
		if where:IsA("Model") then return where:GetPivot() end
	end
	error("BrickwireVFX: where must be a CFrame, Vector3, BasePart, Model or Attachment", 3)
end
local function anchorPart(cf, life)
	local p = Instance.new("Part")
	p.Name = "FX"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.new(0.2, 0.2, 0.2)
	p.CFrame = cf
	p.Parent = fxFolder()
	Debris:AddItem(p, life)
	return p
end
local function shellPart(parent, shape, color, material, cf, size, tr)
	local p = Instance.new("Part")
	p.Name = "Shell"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Shape = shape
	p.Material = material
	p.Color = color
	p.Transparency = tr
	p.Size = size
	p.CFrame = cf
	p.Parent = parent
	return p
end

-- layer builders -------------------------------------------------------------------------------------------
local L = {}
-- particle burst: count, tex, color, size, transp, life, speed, spread, accel, drag, rot, rotSpeed, light, zoffset, orient, squash, shape, inward, rate+time (stream)
function L.emit(root, cf, d, o)
	local s = o.scale
	local a = Instance.new("Attachment")
	a.Parent = root
	if d.offset then a.Position = d.offset * s end
	local e = Instance.new("ParticleEmitter")
	e.Enabled = false
	e.Texture = TEX[d.tex or "spark"] or d.tex
	e.Color = cseq(o.color and d.tint ~= false and { o.color, d.color and (type(d.color) == "table" and d.color[#d.color] or d.color) or o.color } or d.color or "#FFFFFF")
	e.Size = nseq(d.size or { 1, 0 }, s)
	e.Transparency = nseq(d.transp or { 0, 1 })
	e.Lifetime = range(d.life or { 0.4, 0.8 })
	e.Speed = range(d.speed or { 5, 10 }, s)
	e.SpreadAngle = Vector2.new(d.spread or 180, d.spread or 180)
	e.Acceleration = d.accel or Vector3.new(0, 0, 0)
	e.Drag = d.drag or 0
	e.Rotation = range(d.rot or { 0, 360 })
	e.RotSpeed = range(d.rotSpeed or { -90, 90 })
	e.LightEmission = d.light or 1
	e.LightInfluence = d.lightInfluence or 0
	e.ZOffset = d.zoffset or 0
	if d.brightness then pcall(function() e.Brightness = d.brightness end) end
	if d.orient then e.Orientation = Enum.ParticleOrientation[d.orient] end
	if d.squash then pcall(function() e.Squash = nseq(d.squash) end) end
	if d.emitDir then e.EmissionDirection = Enum.NormalId[d.emitDir] end
	if d.shape then
		pcall(function()
			e.Shape = Enum.ParticleEmitterShape[d.shape]
			e.ShapeStyle = Enum.ParticleEmitterShapeStyle[d.shapeStyle or "Volume"]
			if d.inward then e.ShapeInOut = Enum.ParticleEmitterShapeInOut.Inward end
		end)
	end
	if d.lockedToPart then e.LockedToPart = true end
	e.Parent = a
	later(d.delay, function()
		if d.rate then
			e.Rate = d.rate
			e.Enabled = true
			task.delay(d.time or 0.5, function() e.Enabled = false end)
		else
			e:Emit(math.max(1, math.floor((d.count or 10) * (o.density or 1) + 0.5)))
		end
	end)
end
-- expanding shell: shape Ball|Cylinder (ring/disc, flat), material ForceField (bright edges) or Neon
function L.shell(root, cf, d, o)
	local s = o.scale
	local shape = d.ring and Enum.PartType.Cylinder or Enum.PartType.Ball
	local from, to = (d.from or 1) * s, (d.to or 10) * s
	local thick = (d.thick or 0.4) * s
	local pcf = d.ring and (cf * CFrame.Angles(0, 0, math.rad(90))) or cf
	if d.offset then pcf = pcf + d.offset * s end
	local function sz(r) return d.ring and Vector3.new(thick, r, r) or Vector3.new(r, r, r) end
	local p = shellPart(root.Parent, shape, C(o.color or d.color or "#FFFFFF"), Enum.Material[d.material or "ForceField"], pcf, sz(from), d.startT or 0)
	Debris:AddItem(p, (d.delay or 0) + (d.time or 0.4) + 0.2)
	if d.delay then p.Transparency = 1 end
	later(d.delay, function()
		p.Transparency = d.startT or 0
		tween(p, d.time or 0.4, { Size = sz(to), Transparency = 1 }, Enum.EasingStyle[d.ease or "Quart"])
	end)
end
-- point light flash
function L.light(root, cf, d, o)
	local l = Instance.new("PointLight")
	l.Color = C(o.color or d.color or "#FFFFFF")
	l.Range = (d.range or 16) * o.scale
	l.Brightness = 0
	l.Shadows = false
	l.Parent = root
	later(d.delay, function()
		l.Brightness = d.brightness or 4
		tween(l, d.time or 0.35, { Brightness = 0 })
	end)
end
-- lightning bolt made of neon segments (+ branches); from = offset above (studs) or Vector3 start
local function boltSegments(parent, a, b, color, width, segs, jitter, life)
	local pts = { a }
	for i = 1, segs - 1 do
		local t = i / segs
		local p = a:Lerp(b, t)
		local off = Vector3.new((math.random() - 0.5) * 2, (math.random() - 0.5) * 2, (math.random() - 0.5) * 2) * jitter
		table.insert(pts, p + off)
	end
	table.insert(pts, b)
	local parts = {}
	for i = 1, #pts - 1 do
		local p0, p1 = pts[i], pts[i + 1]
		local len = (p1 - p0).Magnitude
		local seg = shellPart(parent, Enum.PartType.Block, color, Enum.Material.Neon, CFrame.lookAt((p0 + p1) / 2, p1), Vector3.new(width, width, len), 0)
		table.insert(parts, seg)
		Debris:AddItem(seg, life + 0.2)
	end
	return parts, pts
end
function L.bolt(root, cf, d, o)
	local s = o.scale
	local b = cf.Position
	local a = d.fromPos or (b + Vector3.new((math.random() - 0.5) * 8, d.height or 40, (math.random() - 0.5) * 8) * s)
	later(d.delay, function()
		local col = C(o.color or d.color or "#BFE6FF")
		local life = d.time or 0.25
		local parts, pts = boltSegments(root.Parent, a, b, col, (d.width or 0.35) * s, d.segments or 9, (d.jitter or 2.2) * s, life)
		for _ = 1, d.branches or 2 do
			local i = math.random(2, math.max(2, #pts - 2))
			local start = pts[i]
			local dir = (pts[i + 1] - start).Unit
			local endp = start + (dir + Vector3.new((math.random() - 0.5) * 2, -0.3, (math.random() - 0.5) * 2)).Unit * (6 * s)
			local bp = boltSegments(root.Parent, start, endp, col, (d.width or 0.35) * 0.6 * s, 4, 1.2 * s, life)
			for _, x in ipairs(bp) do table.insert(parts, x) end
		end
		for _, p in ipairs(parts) do tween(p, life, { Transparency = 1 }, Enum.EasingStyle.Linear) end
	end)
end
-- slash arc: neon crescent segments that sweep in and fade (in the root's XZ plane, facing -Z)
function L.arc(root, cf, d, o)
	local s = o.scale
	local r = (d.radius or 6) * s
	local n = d.segments or 14
	local sweep = math.rad(d.sweep or 150)
	local tilt = CFrame.Angles(0, 0, math.rad(d.tilt or 0))
	local col = C(o.color or d.color or "#E6F7FF")
	for i = 1, n do
		local t = (i - 1) / (n - 1)
		local ang = -sweep / 2 + sweep * t
		local w = math.sin(t * math.pi) * (d.width or 1.2) * s + 0.1
		local pos = (cf * tilt * CFrame.new(math.sin(ang) * r, 0, -math.cos(ang) * r))
		local seg = shellPart(root.Parent, Enum.PartType.Block, col, Enum.Material.Neon, pos * CFrame.Angles(0, -ang, 0), Vector3.new(2 * r * math.sin(sweep / n / 2) * 1.15, 0.12 * s, w), 1)
		Debris:AddItem(seg, (d.delay or 0) + 0.6)
		later((d.delay or 0) + t * (d.time or 0.12), function()
			seg.Transparency = 0.05
			tween(seg, 0.25, { Transparency = 1, Size = seg.Size * Vector3.new(1, 1, 0.3) })
		end)
	end
end
-- physics debris (rocks / shards / confetti)
function L.debris(root, cf, d, o)
	local s = o.scale
	later(d.delay, function()
		for i = 1, d.count or 8 do
			local p = Instance.new("Part")
			p.Name = "Debris"
			p.Size = Vector3.new(math.random(4, 10) / 10, math.random(4, 10) / 10, math.random(4, 10) / 10) * (d.size or 1) * s
			local cols = d.colors or { d.color or "#6B6B6B" }
			p.Color = C(cols[(i - 1) % #cols + 1])
			p.Material = Enum.Material[d.material or "Slate"]
			p.CFrame = cf * CFrame.new(0, 0.5 * s, 0) * CFrame.Angles(math.random() * 6, math.random() * 6, math.random() * 6)
			p.CanCollide = d.collide ~= false
			p.CanQuery = false
			p.CastShadow = false
			p.Anchored = false
			p.Parent = root.Parent
			local dir = Vector3.new(math.random() - 0.5, (d.up or 0.9) + math.random() * 0.5, math.random() - 0.5).Unit
			p.AssemblyLinearVelocity = dir * (d.speed or 40) * (0.6 + math.random() * 0.6) * math.sqrt(s)
			p.AssemblyAngularVelocity = Vector3.new(math.random() - 0.5, math.random() - 0.5, math.random() - 0.5) * 20
			local life = d.time or 2
			task.delay(life * 0.6, function() if p.Parent then tween(p, life * 0.4, { Transparency = 1, Size = p.Size * 0.3 }) end end)
			Debris:AddItem(p, life + 0.1)
		end
	end)
end
-- vertical pillar of light (teleport / level up)
function L.pillar(root, cf, d, o)
	local s = o.scale
	local h = (d.height or 18) * s
	local p = shellPart(root.Parent, Enum.PartType.Cylinder, C(o.color or d.color or "#FFE27A"), Enum.Material[d.material or "Neon"], cf * CFrame.new(0, h / 2, 0) * CFrame.Angles(0, 0, math.rad(90)), Vector3.new(h, (d.width or 3) * s, (d.width or 3) * s), 0.2)
	Debris:AddItem(p, (d.delay or 0) + (d.time or 0.8) + 0.2)
	p.Transparency = 1
	later(d.delay, function()
		p.Transparency = 0.15
		tween(p, d.time or 0.8, { Transparency = 1, Size = Vector3.new(h * 1.1, 0.1, 0.1) }, Enum.EasingStyle.Quint, Enum.EasingDirection.In)
	end)
end
-- camera shake (client only; ignored on the server)
function L.shake(_, _, d, o) if RunService:IsClient() then later(d.delay, function() VFX.shake((d.amp or 0.6) * o.shake, d.time or 0.35) end) end end

-- presets: arrays of layers (timing in seconds; sizes in studs, multiplied by opts.scale) ---------------------------
local P = {}
VFX.PRESETS = P
P.explosion = {
	{ "light", color = "#FFB347", range = 40, brightness = 8, time = 0.6 },
	{ "emit", tex = "core", count = 2, color = { "#FFFFFF", "#FFD27A", "#FF6A00" }, size = { { 0, 2 }, { 0.3, 14 }, { 1, 16 } }, transp = { { 0, 0 }, { 0.6, 0.3 }, { 1, 1 } }, life = { 0.35, 0.45 }, speed = 0, rotSpeed = { -40, 40 } },
	{ "emit", tex = "fire", count = 40, color = { "#FFF2A8", "#FF8A00", "#7A1E00" }, size = { { 0, 3 }, { 1, 0 } }, life = { 0.5, 0.9 }, speed = { 18, 34 }, drag = 6, zoffset = 1 },
	{ "emit", tex = "spark", count = 40, color = { "#FFFFFF", "#FFC14D" }, size = { { 0, 0.6 }, { 1, 0 } }, life = { 0.5, 1.1 }, speed = { 40, 75 }, drag = 3, accel = Vector3.new(0, -40, 0), orient = "VelocityParallel", squash = { { 0, -1.5 }, { 1, -1.5 } } },
	{ "emit", tex = "puff", count = 16, color = { "#6B5B52", "#2B2B2B" }, size = { { 0, 5 }, { 1, 14 } }, transp = { { 0, 0.35 }, { 1, 1 } }, life = { 1.8, 3 }, speed = { 6, 14 }, drag = 2.5, accel = Vector3.new(0, 4, 0), light = 0, lightInfluence = 1, delay = 0.05, tint = false },
	{ "shell", color = "#FFB347", from = 2, to = 28, time = 0.4, material = "ForceField" },
	{ "shell", ring = true, color = "#FFE0A0", from = 2, to = 36, time = 0.55, thick = 0.3, offset = Vector3.new(0, -0.8, 0) },
	{ "debris", count = 8, speed = 45, time = 2.2 },
	{ "shake", amp = 1, time = 0.45 },
}
P.hit_spark = {
	{ "light", color = "#FFFFFF", range = 10, brightness = 4, time = 0.15 },
	{ "emit", tex = "core", count = 1, color = { "#FFFFFF", "#9FD8FF" }, size = { { 0, 1 }, { 0.3, 4 }, { 1, 4.5 } }, life = 0.18, speed = 0 },
	{ "emit", tex = "spark", count = 18, color = { "#FFFFFF", "#7FD3FF" }, size = { { 0, 0.35 }, { 1, 0 } }, life = { 0.18, 0.35 }, speed = { 25, 45 }, drag = 8, orient = "VelocityParallel", squash = { { 0, -2 }, { 1, -2 } } },
	{ "shell", color = "#BFE6FF", from = 0.5, to = 5, time = 0.18 },
	{ "shake", amp = 0.25, time = 0.12 },
}
P.slash = {
	{ "arc", radius = 6, sweep = 160, width = 1.4, time = 0.1, tilt = -20 },
	{ "arc", radius = 5.2, sweep = 140, width = 0.6, time = 0.12, tilt = -20, color = "#FFFFFF", delay = 0.02 },
	{ "emit", tex = "spark", count = 14, color = { "#FFFFFF", "#9FD8FF" }, size = { { 0, 0.4 }, { 1, 0 } }, life = { 0.2, 0.4 }, speed = { 12, 22 }, drag = 6, offset = Vector3.new(0, 0, -5), orient = "VelocityParallel", squash = { { 0, -1 }, { 1, -1 } } },
	{ "shake", amp = 0.2, time = 0.1 },
}
P.shockwave = {
	{ "light", color = "#9FD8FF", range = 30, brightness = 5, time = 0.5 },
	{ "shell", ring = true, color = "#BFE6FF", from = 2, to = 46, time = 0.7, thick = 0.5 },
	{ "shell", ring = true, color = "#FFFFFF", from = 1, to = 30, time = 0.5, thick = 0.25, delay = 0.08 },
	{ "emit", tex = "smoke", count = 30, color = { "#D9D2C5", "#8C857A" }, size = { { 0, 2 }, { 1, 6 } }, transp = { { 0, 0.4 }, { 1, 1 } }, life = { 0.8, 1.4 }, speed = { 30, 45 }, drag = 4, spread = 2, emitDir = "Top", shape = "Disc", light = 0, lightInfluence = 1, tint = false, orient = "FacingCamera" },
	{ "shake", amp = 0.7, time = 0.4 },
}
P.lightning = {
	{ "bolt", height = 45, branches = 3, time = 0.28 },
	{ "bolt", height = 45, branches = 1, time = 0.2, delay = 0.08 },
	{ "light", color = "#CFE9FF", range = 60, brightness = 10, time = 0.4 },
	{ "emit", tex = "spark", count = 30, color = { "#FFFFFF", "#8FD0FF" }, size = { { 0, 0.5 }, { 1, 0 } }, life = { 0.3, 0.7 }, speed = { 20, 40 }, drag = 4, accel = Vector3.new(0, -30, 0), orient = "VelocityParallel", squash = { { 0, -1.5 }, { 1, -1.5 } } },
	{ "shell", ring = true, color = "#BFE6FF", from = 1, to = 14, time = 0.35, thick = 0.3 },
	{ "emit", tex = "smoke", count = 8, color = { "#5A5A6A", "#2A2A33" }, size = { { 0, 2 }, { 1, 6 } }, transp = { { 0, 0.5 }, { 1, 1 } }, life = { 1, 1.8 }, speed = { 2, 5 }, light = 0, lightInfluence = 1, tint = false, delay = 0.1 },
	{ "shake", amp = 0.6, time = 0.3 },
}
P.magic_burst = {
	{ "light", color = "#C77DFF", range = 26, brightness = 6, time = 0.6 },
	{ "shell", color = "#B46CFF", from = 1, to = 12, time = 0.45, material = "Neon", startT = 0.3 },
	{ "shell", color = "#E0B3FF", from = 1, to = 18, time = 0.6 },
	{ "emit", tex = "implode", count = 1, color = { "#FFFFFF", "#B46CFF" }, size = { { 0, 2 }, { 1, 12 } }, life = 0.5, speed = 0 },
	{ "emit", tex = "spark", count = 50, color = { "#FFFFFF", "#FF7AD9", "#7B5CFF" }, size = { { 0, 0.8 }, { 1, 0 } }, life = { 0.6, 1.2 }, speed = { 14, 30 }, drag = 5, rotSpeed = { -200, 200 } },
	{ "emit", tex = "glow", count = 12, color = { "#C77DFF", "#5A2BFF" }, size = { { 0, 1.5 }, { 1, 0 } }, life = { 1, 1.6 }, speed = { 3, 8 }, drag = 2, accel = Vector3.new(0, 5, 0) },
}
P.heal = {
	{ "light", color = "#7CFFB2", range = 16, brightness = 3, time = 1.2 },
	{ "shell", ring = true, color = "#7CFFB2", from = 4, to = 9, time = 0.9, thick = 0.2, offset = Vector3.new(0, -2.8, 0) },
	{ "emit", tex = "spark", count = 36, color = { "#E6FFF0", "#3DFF8F" }, size = { { 0, 0 }, { 0.2, 0.7 }, { 1, 0 } }, life = { 1, 1.6 }, speed = { 1, 3 }, accel = Vector3.new(0, 7, 0), shape = "Cylinder", shapeStyle = "Surface", spread = 10, emitDir = "Top", offset = Vector3.new(0, -2.5, 0) },
	{ "emit", tex = "glow", count = 10, color = { "#B8FFD6", "#2BD67B" }, size = { { 0, 1.2 }, { 1, 0 } }, life = { 1.2, 1.8 }, speed = { 0.5, 1.5 }, accel = Vector3.new(0, 5, 0), delay = 0.1 },
}
P.level_up = {
	{ "light", color = "#FFD86B", range = 30, brightness = 7, time = 1.2 },
	{ "pillar", height = 22, width = 4, time = 0.9 },
	{ "shell", ring = true, color = "#FFE27A", from = 2, to = 22, time = 0.8, thick = 0.3, offset = Vector3.new(0, -2.8, 0) },
	{ "emit", tex = "spark", count = 60, color = { "#FFFFFF", "#FFD24D", "#FF9F1C" }, size = { { 0, 0.9 }, { 1, 0 } }, life = { 0.9, 1.6 }, speed = { 8, 20 }, accel = Vector3.new(0, 12, 0), drag = 2, spread = 40, emitDir = "Top", rotSpeed = { -180, 180 } },
	{ "debris", count = 26, colors = { "#FFD24D", "#FF5D8F", "#4FC3FF", "#7CFF6B", "#C77DFF" }, size = 0.5, material = "SmoothPlastic", speed = 35, up = 2, time = 2.5, collide = false, delay = 0.2 },
}
P.dash = {
	{ "emit", tex = "smoke", count = 10, color = { "#E8E8E8", "#9A9A9A" }, size = { { 0, 1.5 }, { 1, 4 } }, transp = { { 0, 0.4 }, { 1, 1 } }, life = { 0.4, 0.8 }, speed = { 4, 8 }, light = 0, lightInfluence = 1, tint = false, emitDir = "Back", spread = 30 },
	{ "emit", tex = "spark", count = 22, color = { "#FFFFFF", "#BFE6FF" }, size = { { 0, 0.25 }, { 1, 0 } }, life = { 0.15, 0.3 }, speed = { 40, 60 }, emitDir = "Back", spread = 12, orient = "VelocityParallel", squash = { { 0, -3 }, { 1, -3 } } },
	{ "shell", ring = true, color = "#FFFFFF", from = 1, to = 8, time = 0.25, thick = 0.15 },
}
P.ground_slam = {
	{ "light", color = "#FFC890", range = 30, brightness = 4, time = 0.5 },
	{ "shell", ring = true, color = "#FFE6C7", from = 3, to = 40, time = 0.6, thick = 0.6 },
	{ "emit", tex = "puff", count = 34, color = { "#B8A58C", "#6B5B4A" }, size = { { 0, 3 }, { 1, 8 } }, transp = { { 0, 0.3 }, { 1, 1 } }, life = { 0.9, 1.6 }, speed = { 25, 40 }, drag = 4, spread = 3, emitDir = "Top", shape = "Disc", light = 0, lightInfluence = 1, tint = false },
	{ "debris", count = 16, speed = 50, time = 2.4, size = 1.4 },
	{ "shake", amp = 1.2, time = 0.5 },
}
P.smoke_puff = {
	{ "emit", tex = "smoke", count = 18, color = { "#F0F0F0", "#8A8A8A" }, size = { { 0, 2 }, { 1, 6 } }, transp = { { 0, 0.3 }, { 1, 1 } }, life = { 0.8, 1.6 }, speed = { 4, 10 }, drag = 3, light = 0, lightInfluence = 1, tint = false },
}
P.confetti = {
	{ "debris", count = 60, colors = { "#FF5D8F", "#FFD24D", "#4FC3FF", "#7CFF6B", "#C77DFF", "#FF9F1C" }, size = 0.45, material = "SmoothPlastic", speed = 45, up = 2.5, time = 3.5, collide = false },
	{ "emit", tex = "spark", count = 30, color = { "#FFFFFF", "#FFE27A" }, size = { { 0, 0.8 }, { 1, 0 } }, life = { 0.4, 0.9 }, speed = { 15, 30 }, drag = 4 },
}
P.pickup = {
	{ "light", color = "#FFE27A", range = 12, brightness = 3, time = 0.3 },
	{ "shell", color = "#FFF2B3", from = 0.5, to = 6, time = 0.3 },
	{ "emit", tex = "spark", count = 16, color = { "#FFFFFF", "#FFD24D" }, size = { { 0, 0.7 }, { 1, 0 } }, life = { 0.4, 0.8 }, speed = { 6, 14 }, drag = 4, accel = Vector3.new(0, 8, 0) },
}
P.ice_shatter = {
	{ "light", color = "#9FE8FF", range = 20, brightness = 5, time = 0.4 },
	{ "shell", color = "#CFF6FF", from = 1, to = 10, time = 0.35 },
	{ "emit", tex = "spark", count = 30, color = { "#FFFFFF", "#7FDBFF" }, size = { { 0, 0.6 }, { 1, 0 } }, life = { 0.4, 0.9 }, speed = { 15, 30 }, drag = 5 },
	{ "emit", tex = "smoke", count = 10, color = { "#E6FBFF", "#9ADFFF" }, size = { { 0, 2 }, { 1, 5 } }, transp = { { 0, 0.5 }, { 1, 1 } }, life = { 0.8, 1.4 }, speed = { 3, 6 }, light = 0.3, tint = false },
	{ "debris", count = 12, colors = { "#BFF2FF", "#8FDFFF", "#E6FBFF" }, material = "Glass", size = 0.9, speed = 30, time = 2 },
}
P.teleport = {
	{ "light", color = "#6FE7FF", range = 26, brightness = 6, time = 0.8 },
	{ "pillar", color = "#6FE7FF", height = 16, width = 5, time = 0.7 },
	{ "emit", tex = "implode", count = 1, color = { "#FFFFFF", "#6FE7FF" }, size = { { 0, 12 }, { 1, 1 } }, life = 0.45, speed = 0, offset = Vector3.new(0, 2, 0) },
	{ "emit", tex = "spark", count = 40, color = { "#FFFFFF", "#6FE7FF", "#4F6BFF" }, size = { { 0, 0.6 }, { 1, 0 } }, life = { 0.8, 1.3 }, speed = { 2, 5 }, accel = Vector3.new(0, 14, 0), shape = "Cylinder", shapeStyle = "Surface", emitDir = "Top", spread = 5 },
	{ "shell", ring = true, color = "#6FE7FF", from = 8, to = 1, time = 0.5, thick = 0.25, offset = Vector3.new(0, -2.8, 0) },
}
P.fire_burst = {
	{ "light", color = "#FF8A3C", range = 24, brightness = 6, time = 0.6 },
	{ "emit", tex = "fire", count = 45, color = { "#FFF2A8", "#FF6A00", "#5A0F00" }, size = { { 0, 2.5 }, { 1, 0 } }, life = { 0.5, 1 }, speed = { 10, 22 }, drag = 4, accel = Vector3.new(0, 10, 0) },
	{ "emit", tex = "embers", count = 30, color = { "#FFD27A", "#FF4D00" }, size = { { 0, 0.4 }, { 1, 0 } }, life = { 0.8, 1.6 }, speed = { 12, 26 }, drag = 2, accel = Vector3.new(0, 6, 0) },
	{ "shell", color = "#FF9A3C", from = 1, to = 12, time = 0.35 },
}
P.poison = {
	{ "emit", tex = "smoke", rate = 30, time = 1.5, color = { "#B6FF6B", "#3E7F1A" }, size = { { 0, 2 }, { 1, 5 } }, transp = { { 0, 0.5 }, { 1, 1 } }, life = { 1.2, 2 }, speed = { 1, 3 }, accel = Vector3.new(0, 2, 0), light = 0.4, shape = "Sphere", tint = false },
	{ "emit", tex = "glow", rate = 14, time = 1.5, color = { "#E6FF9A", "#5ACF2A" }, size = { { 0, 0.6 }, { 1, 0 } }, life = { 0.8, 1.4 }, speed = { 1, 2 }, accel = Vector3.new(0, 4, 0), shape = "Sphere" },
}
P.vortex = {
	{ "light", color = "#9B5CFF", range = 30, brightness = 5, time = 1.6 },
	{ "emit", tex = "vortex", rate = 6, time = 1.2, color = { "#1A0033", "#9B5CFF" }, size = { { 0, 10 }, { 1, 2 } }, transp = { { 0, 0.2 }, { 1, 1 } }, life = 0.8, speed = 0, rotSpeed = { 200, 300 }, light = 0.6 },
	{ "emit", tex = "spark", rate = 60, time = 1.2, color = { "#FFFFFF", "#B46CFF" }, size = { { 0, 0.6 }, { 1, 0 } }, life = { 0.5, 0.8 }, speed = { 12, 16 }, shape = "Sphere", inward = true },
	{ "shell", color = "#2A0050", from = 10, to = 0.5, time = 1.2, material = "Neon", startT = 0.6, ease = "Quad" },
}

local DEFAULT_COLOR_LAYERS = { light = true, shell = true, bolt = true, arc = true, pillar = true }
function VFX.play(name, where, opts)
	opts = opts or {}
	local layers = type(name) == "table" and name or P[name]
	if not layers then error("BrickwireVFX: unknown preset '" .. tostring(name) .. "' — " .. table.concat(VFX.list(), ", "), 2) end
	local cf = toCF(where)
	local o = { scale = opts.scale or 1, color = opts.color and C(opts.color) or nil, density = opts.density or 1, shake = opts.shake or 1 }
	local root = anchorPart(cf, opts.life or 4)
	for _, d in ipairs(layers) do
		local fn = L[d[1]]
		if fn then
			local oo = o
			if o.color and not DEFAULT_COLOR_LAYERS[d[1]] and d.tint == false then oo = { scale = o.scale, density = o.density, shake = o.shake } end
			local ok, err = pcall(fn, root, cf, d, oo)
			if not ok then warn("BrickwireVFX layer " .. tostring(d[1]) .. ": " .. tostring(err)) end
		end
	end
	return root
end
function VFX.bolt(from, to, opts)
	opts = opts or {}
	local root = anchorPart(CFrame.new(to), 1)
	L.bolt(root, CFrame.new(to), { fromPos = from, branches = opts.branches or 2, time = opts.time or 0.25, width = opts.width }, { scale = opts.scale or 1, color = opts.color and C(opts.color) or nil })
	return root
end
function VFX.flash(target, color, time)
	local h = Instance.new("Highlight")
	h.FillColor = C(color or "#FFFFFF")
	h.OutlineColor = C(color or "#FFFFFF")
	h.FillTransparency = 0.2
	h.Parent = target
	tween(h, time or 0.25, { FillTransparency = 1, OutlineTransparency = 1 })
	Debris:AddItem(h, (time or 0.25) + 0.1)
	return h
end
function VFX.trail(part, opts)
	opts = opts or {}
	local a0, a1 = Instance.new("Attachment"), Instance.new("Attachment")
	local w = opts.width or 1.5
	a0.Position = Vector3.new(0, w / 2, 0)
	a1.Position = Vector3.new(0, -w / 2, 0)
	a0.Parent, a1.Parent = part, part
	local t = Instance.new("Trail")
	t.Attachment0, t.Attachment1 = a0, a1
	t.Color = cseq(opts.color or { "#FFFFFF", "#7FD3FF" })
	t.Transparency = nseq({ 0.2, 1 })
	t.Lifetime = opts.lifetime or 0.25
	t.LightEmission = 1
	t.FaceCamera = true
	t.Parent = part
	return t
end
local shaking = 0
function VFX.shake(intensity, duration)
	if not RunService:IsClient() then return end
	local cam = workspace.CurrentCamera
	if not cam then return end
	shaking += 1
	local id = shaking
	local t0 = os.clock()
	local conn
	conn = RunService.RenderStepped:Connect(function()
		local t = os.clock() - t0
		if t > duration or id ~= shaking then conn:Disconnect() return end
		local k = (1 - t / duration) * intensity
		cam.CFrame = cam.CFrame * CFrame.Angles(math.rad((math.random() - 0.5) * 2 * k), math.rad((math.random() - 0.5) * 2 * k), 0)
	end)
end
function VFX.list()
	local t = {}
	for k in pairs(P) do table.insert(t, k) end
	table.sort(t)
	return t
end
-- loop a preset on a part (demo pads, ambient effects): returns a stop() function
function VFX.loop(name, where, every, opts)
	local alive = true
	task.spawn(function()
		while alive do
			if typeof(where) == "Instance" and not where.Parent then break end
			VFX.play(name, typeof(where) == "Instance" and where:IsA("BasePart") and (where.CFrame * CFrame.new(0, where.Size.Y / 2 + 3, 0)) or where, opts)
			task.wait(every or 3)
		end
	end)
	return function() alive = false end
end
return VFX
]==]
	BW._vfxSrc = VFX_SRC
	local VFX_NAMES = { "explosion", "hit_spark", "slash", "shockwave", "lightning", "magic_burst", "heal", "level_up", "dash", "ground_slam", "smoke_puff", "confetti", "pickup", "ice_shatter", "teleport", "fire_burst", "poison", "vortex" }
	BW.vfxNames = VFX_NAMES
	local VFX_COLORS = {
		explosion = "#FFB347,#FF6A00,#FFE0A0", hit_spark = "#FFFFFF,#7FD3FF", slash = "#E6F7FF,#9FD8FF", shockwave = "#BFE6FF,#FFFFFF", lightning = "#CFE9FF,#8FD0FF",
		magic_burst = "#B46CFF,#FF7AD9,#7B5CFF", heal = "#7CFFB2,#3DFF8F", level_up = "#FFD86B,#FF9F1C,#FFFFFF", dash = "#FFFFFF,#BFE6FF", ground_slam = "#FFE6C7,#B8A58C",
		smoke_puff = "#F0F0F0,#8A8A8A", confetti = "#FF5D8F,#FFD24D,#4FC3FF,#7CFF6B", pickup = "#FFE27A,#FFFFFF", ice_shatter = "#9FE8FF,#FFFFFF", teleport = "#6FE7FF,#4F6BFF",
		fire_burst = "#FF8A3C,#FFD27A,#FF4D00", poison = "#B6FF6B,#3E7F1A", vortex = "#9B5CFF,#1A0033",
	}

	-- Installs/updates ReplicatedStorage.BrickwireVFX (idempotent). Returns the ModuleScript.
	function BW.vfxLib()
		local rs = game:GetService("ReplicatedStorage")
		local m = rs:FindFirstChild("BrickwireVFX")
		if m and not m:IsA("ModuleScript") then fail("ReplicatedStorage.BrickwireVFX exists and is not a ModuleScript") end
		if not m then
			m = Instance.new("ModuleScript")
			m.Name = "BrickwireVFX"
			m:SetAttribute("BW_Owned", true)
			m.Parent = rs
		end
		if m.Source ~= VFX_SRC then m.Source = VFX_SRC end
		return m
	end
	local DEMO_SRC = [==[
-- Brickwire VFX demo pad: plays a BrickwireVFX preset every few seconds above this pad (delete the pad when done).
local VFX = require(game:GetService("ReplicatedStorage"):WaitForChild("BrickwireVFX"))
local pad = script.Parent
local NAME, EVERY, SCALE = {{NAME}}, {{EVERY}}, {{SCALE}}
VFX.loop(NAME, pad, EVERY, { scale = SCALE })
]==]
	-- Demo pad that loops a preset in Play mode (so you can SEE it) + installs the module. at = bottom-center.
	function BW.vfx(name, at, opts)
		opts = opts or {}
		local ok = false
		for _, n in ipairs(VFX_NAMES) do if n == name then ok = true end end
		if not ok then fail("unknown VFX preset '" .. tostring(name) .. "' — available: " .. table.concat(VFX_NAMES, ", ")) end
		BW.vfxLib()
		local a = BW.v3(at or { 0, BW.groundY(), 0 })
		local m = BW._group(opts.Name or ("VFX_" .. name), opts)
		local pad = BW.part{ Name = "Pad", Size = { 8, 1, 8 }, At = { a.X, a.Y, a.Z }, Color = "#2B2F3A", Material = "Slate", Parent = m }
		BW.part{ Name = "Rim", Shape = "Cylinder", Size = { 0.3, 7, 7 }, Position = { a.X, a.Y + 1.15, a.Z }, Orientation = { 0, 0, 90 }, Color = BW.color(string.match(VFX_COLORS[name], "^[^,]+")), Material = "Neon", CanCollide = false, Parent = m }
		pad:SetAttribute("BW_FxColors", VFX_COLORS[name])
		pad:SetAttribute("BW_Fx", name)
		BW.script("Script", "VFXDemo", pad, src(DEMO_SRC, { NAME = name, EVERY = opts.every or 3, SCALE = opts.scale or 1 }))
		print("BW_VFX " .. name .. " demo → " .. m:GetFullName() .. " (plays every " .. (opts.every or 3) .. " s in Play mode; in code: VFX.play(\"" .. name .. "\", cframe))")
		return m
	end
	-- Plays a preset right now in the edit viewport (requires the module from the plugin context) — for a quick look / screen_capture.
	function BW.vfxPreview(name, at, opts)
		local m = BW.vfxLib()
		local okReq, VFXmod = pcall(require, m)
		if not okReq then fail("could not require BrickwireVFX in edit mode: " .. tostring(VFXmod)) end
		local a = BW.v3(at or { 0, BW.groundY() + 3, 0 })
		return VFXmod.play(name, CFrame.new(a.X, a.Y, a.Z), opts)
	end
	-- ================================================================== VFX
	K("fx_explosion", function(o) local x, y, z = base(o) return BW.vfx("explosion", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_hit_spark", function(o) local x, y, z = base(o) return BW.vfx("hit_spark", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_slash", function(o) local x, y, z = base(o) return BW.vfx("slash", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_shockwave", function(o) local x, y, z = base(o) return BW.vfx("shockwave", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_lightning", function(o) local x, y, z = base(o) return BW.vfx("lightning", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_magic_burst", function(o) local x, y, z = base(o) return BW.vfx("magic_burst", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_heal", function(o) local x, y, z = base(o) return BW.vfx("heal", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_level_up", function(o) local x, y, z = base(o) return BW.vfx("level_up", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_ground_slam", function(o) local x, y, z = base(o) return BW.vfx("ground_slam", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_ice_shatter", function(o) local x, y, z = base(o) return BW.vfx("ice_shatter", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_teleport", function(o) local x, y, z = base(o) return BW.vfx("teleport", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_confetti", function(o) local x, y, z = base(o) return BW.vfx("confetti", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_vortex", function(o) local x, y, z = base(o) return BW.vfx("vortex", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("fx_fire_burst", function(o) local x, y, z = base(o) return BW.vfx("fire_burst", { x, y, z }, { Name = o.Name, Parent = o.Parent, every = o.every, scale = o.scale }) end)
	K("portal", function(o)
		local x, y, z = base(o)
		local m = model(o, "Portal")
		local r, col = o.radius or 6, o.Color or "#A55EEA"
		local n = 20
		for i = 0, n - 1 do
			local a = (i / n) * math.pi * 2
			BW.part{ Name = "Ring" .. i, Size = { 1.2, 2 * math.pi * r / n + 0.2, 1.2 }, Position = { x + math.cos(a) * r, y + r + 1 + math.sin(a) * r, z }, Orientation = { 0, 0, math.deg(a) }, Color = (i % 2 == 0) and "#2B2B2B" or "#3A3A3A", Material = "Slate", Parent = m }
		end
		local core = BW.part{ Name = "Core", Shape = "Cylinder", Size = { 0.2, 2 * r - 0.6, 2 * r - 0.6 }, Position = { x, y + r + 1, z }, Orientation = { 0, 90, 0 }, Color = col, Material = "Neon", Transparency = 0.35, CanCollide = false, Parent = m }
		BW.particles(core, "magic", { Rate = 60, Color = { col, "#3CC8FF" }, Speed = { 0.5, 2 } })
		BW.light(core, "PointLight", { Color = col, Range = 20, Brightness = 3 })
		box(m, "Base", x - r - 1, y, z - 2, x + r + 1, y + 1, z + 2, "#2B2B2B", "Slate")
		BW.animate(core, "pulse", { scale = 1.06, period = 1.6 })
		return m
	end)
	K("magic_circle", function(o)
		local x, y, z = base(o)
		local m = model(o, "MagicCircle")
		local r, col = o.radius or 8, o.Color or "#3CC8FF"
		local n = 28
		for i = 0, n - 1 do
			local a = (i / n) * math.pi * 2
			BW.part{ Name = "Rune" .. i, Size = { 2 * math.pi * r / n * 0.8, 0.12, 0.5 }, Position = { x + math.cos(a) * r, y + 0.06, z + math.sin(a) * r }, Orientation = { 0, -math.deg(a) + 90, 0 }, Color = col, Material = "Neon", CanCollide = false, Parent = m }
		end
		for i = 0, 5 do
			local a1, a2 = (i / 6) * math.pi * 2, ((i + 2) / 6) * math.pi * 2
			BW.wall({ x + math.cos(a1) * r * 0.85, y, z + math.sin(a1) * r * 0.85 }, { x + math.cos(a2) * r * 0.85, y, z + math.sin(a2) * r * 0.85 }, { Name = "Star" .. i, height = 0.12, thickness = 0.35, Color = col, Material = "Neon", CanCollide = false, Parent = m })
		end
		local c = BW.part{ Name = "Center", At = { x, y, z }, Size = { 1, 0.2, 1 }, Transparency = 1, CanCollide = false, Parent = m }
		BW.particles(c, "magic", { Rate = 40, Color = col, Speed = { 2, 5 }, SpreadAngle = Vector2.new(15, 15) })
		BW.light(c, "PointLight", { Color = col, Range = 16, Brightness = 2 })
		BW.animate(m, "spin", { speed = 20 })
		return m
	end)
	K("torch", function(o)
		local x, y, z = base(o)
		local m = model(o, "Torch")
		BW.cylinder{ Name = "Stick", At = { x, y, z }, height = 5, diameter = 0.5, Color = "#5A3A1E", Material = "Wood", Parent = m }
		local head = BW.cylinder{ Name = "Head", At = { x, y + 5, z }, height = 0.8, diameter = 0.9, Color = "#2B2B2B", Material = "Metal", Parent = m }
		BW.particles(head, "fire", { Rate = 30, Size = { 1, 0.1 } })
		local l = BW.light(head, "PointLight", { Color = "#FF9A3C", Range = 14, Brightness = 2 })
		BW.script("Script", "Flicker", head, "-- Brickwire kit: torch flicker\nlocal light = script.Parent:FindFirstChildOfClass(\"PointLight\")\nwhile light and light.Parent do\n\tlight.Brightness = 1.6 + math.random() * 0.8\n\ttask.wait(0.08 + math.random() * 0.1)\nend")
		return m
	end)
	K("crystals", function(o)
		local x, y, z = base(o)
		local m = model(o, "Crystals")
		local col = o.Color or "#7DF9FF"
		local rnd = BW.rng(o.seed or 5)
		for i = 1, o.count or 7 do
			local h = rnd(3, 9)
			local a = rnd(0, 6.28)
			local d = (i == 1) and 0 or rnd(1.5, 4)
			BW.part{ Name = "Crystal" .. i, Size = { 1.2 + h * 0.12, h, 1.2 + h * 0.12 }, Position = { x + math.cos(a) * d, y + h / 2 - 0.4, z + math.sin(a) * d }, Orientation = { rnd(-18, 18), rnd(0, 90), rnd(-18, 18) }, Color = col, Material = "Neon", Transparency = 0.15, Parent = m }
		end
		local c = m:FindFirstChild("Crystal1")
		BW.light(c, "PointLight", { Color = col, Range = 18, Brightness = 2 })
		BW.particles(c, "sparkles", { Rate = 10, Color = col })
		return m
	end)
	K("waterfall", function(o)
		local x, y, z = base(o)
		local m = model(o, "Waterfall")
		local h = o.height or 24
		box(m, "Cliff", x - 10, y, z - 8, x + 10, y + h, z - 2, "#6D6A65", "Rock")
		local fall = box(m, "Water", x - 3, y + 1, z - 2, x + 3, y + h, z - 1.2, "#5DADE2", "Glass", { Transparency = 0.25, CanCollide = false })
		BW.cylinder{ Name = "Pool", At = { x, y, z + 3 }, height = 0.6, diameter = 16, Color = "#3498DB", Material = "Glass", Transparency = 0.3, Parent = m }
		local mist = box(m, "Mist", x - 3, y + 0.6, z - 1, x + 3, y + 1, z + 1, "#FFFFFF", "SmoothPlastic", { Transparency = 1, CanCollide = false })
		BW.particles(mist, "smoke", { Color = "#FFFFFF", Rate = 14, Size = { 2, 5 }, Transparency = { 0.6, 1 } })
		BW.particles(fall, "sparkles", { Color = "#D6F0FF", Rate = 30, Speed = { 1, 2 }, Acceleration = Vector3.new(0, -30, 0), SpreadAngle = Vector2.new(5, 5) })
		return m
	end)
	local WEATHER_SRC = [==[
-- Brickwire kit: weather emitter follows the local camera so it rains/snows everywhere the player looks.
local RunService = game:GetService("RunService")
local part = workspace:WaitForChild({{PART}})
RunService.RenderStepped:Connect(function()
	local cam = workspace.CurrentCamera
	if cam then part.CFrame = CFrame.new(cam.CFrame.Position + Vector3.new(0, 30, 0)) end
end)
]==]
	local function weather(o, kind)
		local x, y, z = base(o)
		local name = o.Name or (kind == "rain" and "Rain" or "Snow")
		local p = BW.part{ Name = name, At = { x, y + 40, z }, Size = { o.size or 120, 1, o.size or 120 }, Transparency = 1, CanCollide = false, CanQuery = false, Parent = o.Parent }
		if kind == "rain" then
			BW.particles(p, "sparkles", { Name = "RainFX", Texture = "rbxasset://textures/particles/sparkles_main.dds", Color = "#AFC8E8", Size = { 0.15, 0.15 }, Squash = { 4, 4 }, Lifetime = { 1.2, 1.5 }, Rate = 400, Speed = { 60, 70 }, EmissionDirection = "Bottom", SpreadAngle = Vector2.new(3, 3), LightEmission = 0.2 })
		else
			BW.particles(p, "sparkles", { Name = "SnowFX", Color = "#FFFFFF", Size = { 0.4, 0.3 }, Lifetime = { 5, 7 }, Rate = 150, Speed = { 6, 9 }, EmissionDirection = "Bottom", SpreadAngle = Vector2.new(20, 20), RotSpeed = { -60, 60 } })
		end
		if o.followCamera ~= false then
			BW.script("LocalScript", name .. "Follow", "StarterPlayer.StarterPlayerScripts", src(WEATHER_SRC, { PART = name }))
		end
		return p
	end
	K("rain", function(o) return weather(o, "rain") end)
	K("snow", function(o) return weather(o, "snow") end)
	K("fireflies", function(o)
		local x, y, z = base(o)
		local p = BW.part{ Name = o.Name or "Fireflies", At = { x, y + 1, z }, Size = { o.size or 40, 6, o.size or 40 }, Transparency = 1, CanCollide = false, Parent = o.Parent }
		BW.particles(p, "sparkles", { Name = "FirefliesFX", Color = "#FFF27A", Size = { 0.25, 0.1 }, Lifetime = { 3, 5 }, Rate = 12, Speed = { 0.3, 1 }, SpreadAngle = Vector2.new(180, 180), LightEmission = 1 })
		return p
	end)
	local AURA_SRC = [==[
-- Brickwire kit: player aura — every character gets a glowing particle aura.
local Players = game:GetService("Players")
local COLOR = Color3.fromHex({{COLOR}})
local function add(char)
	local root = char:WaitForChild("HumanoidRootPart", 10)
	if not root or root:FindFirstChild("BW_Aura") then return end
	local att = Instance.new("Attachment")
	att.Name = "BW_Aura"
	att.Parent = root
	local e = Instance.new("ParticleEmitter")
	e.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	e.Color = ColorSequence.new(COLOR)
	e.LightEmission = 1
	e.Size = NumberSequence.new(0.6, 0)
	e.Lifetime = NumberRange.new(0.8, 1.4)
	e.Rate = 25
	e.Speed = NumberRange.new(0.5, 1.5)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Parent = att
end
Players.PlayerAdded:Connect(function(p) p.CharacterAdded:Connect(add) end)
for _, p in ipairs(Players:GetPlayers()) do
	if p.Character then add(p.Character) end
	p.CharacterAdded:Connect(add)
end
]==]
	K("player_aura", function(o)
		return BW.script("Script", "PlayerAura", "ServerScriptService", src(AURA_SRC, { COLOR = o.Color or "#B46CFF" }))
	end)

	-- ================================================================== ANIMATION
	-- ================================================================== CINEMATICS (1.7): ReplicatedStorage.BrickwireCinema
	-- Camera fly-throughs / cutscenes as plain data "shots" → smooth eased camera moves, letterbox, fades, skip, FOV, DOF.
	local CINEMA_SRC = [==[
-- Brickwire Cinema module (ReplicatedStorage.BrickwireCinema). CLIENT-side camera cutscenes (LocalScript):
--   local Cinema = require(game.ReplicatedStorage:WaitForChild("BrickwireCinema"))
--   Cinema.play({
--     { type = "flyby", points = { {0,60,-120}, {40,30,-60}, {20,14,-25} }, look = "Workspace.Castle", time = 5 },
--     { type = "orbit", target = "Workspace.Castle", radius = 45, height = 14, from = 200, to = 290, time = 6 },
--     { type = "push_in", target = "Workspace.Castle.Gate", from = 40, to = 16, height = 4, angle = 180, time = 3, fov = { 70, 55 } },
--   }, { letterbox = true, skip = true, fadeIn = 0.6, fadeOut = 0.6 })
-- Shot types: hold, pan, dolly, orbit, flyby (Catmull-Rom spline, constant speed), push_in, pull_out, crane, reveal, track.
-- Common fields: time (s), ease ("sine" | "quad" | "cubic" | "quint" | "expo" | "back" | "smooth" | "linear"), fov (number or {from,to}),
--   roll (deg, dutch angle), shake (0..1), cut = "fade" (dip to black before the shot), focus = {x,y,z} offset added to the look point.
-- Targets: Vector3, {x,y,z}, an Instance, or a path string "Workspace.Castle" (centre of its bounding box).
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local Cinema = {}

local function V(v)
	if typeof(v) == "Vector3" then return v end
	if type(v) == "table" then return Vector3.new(v[1] or v.X or 0, v[2] or v.Y or 0, v[3] or v.Z or 0) end
	error("BrickwireCinema: expected a Vector3 or {x,y,z}, got " .. typeof(v), 3)
end
local function resolve(path)
	local cur = game
	for part in string.gmatch(path, "[^%.]+") do
		if cur == game and (part == "Workspace" or part == "workspace") then cur = workspace
		else
			local nxt = cur:FindFirstChild(part) or (RunService:IsRunning() and cur:WaitForChild(part, 5))
			if not nxt then return nil end
			cur = nxt
		end
	end
	return cur
end
-- Centre (Vector3) and size (number) of a target
function Cinema.focusOf(target)
	if typeof(target) == "string" then
		local inst = resolve(target)
		if not inst then error("BrickwireCinema: target '" .. target .. "' not found", 2) end
		target = inst
	end
	if typeof(target) == "Instance" then
		if target:IsA("BasePart") then return target.Position, math.max(target.Size.X, target.Size.Y, target.Size.Z) end
		if target:IsA("Model") then
			local ok, cf, size = pcall(function() return target:GetBoundingBox() end)
			if ok then return cf.Position, math.max(size.X, size.Y, size.Z) end
			return target:GetPivot().Position, 8
		end
		if target:IsA("Attachment") then return target.WorldPosition, 4 end
		error("BrickwireCinema: target must be a BasePart, Model or Attachment, got " .. target.ClassName, 2)
	end
	return V(target), 8
end

local EASE = {
	linear = function(t) return t end,
	sine = function(t) return -(math.cos(math.pi * t) - 1) / 2 end,
	quad = function(t) return t < 0.5 and 2 * t * t or 1 - (-2 * t + 2) ^ 2 / 2 end,
	cubic = function(t) return t < 0.5 and 4 * t * t * t or 1 - (-2 * t + 2) ^ 3 / 2 end,
	quint = function(t) return t < 0.5 and 16 * t ^ 5 or 1 - (-2 * t + 2) ^ 5 / 2 end,
	expo = function(t) if t <= 0 then return 0 elseif t >= 1 then return 1 end return t < 0.5 and 2 ^ (20 * t - 10) / 2 or (2 - 2 ^ (-20 * t + 10)) / 2 end,
	smooth = function(t) return t * t * t * (t * (t * 6 - 15) + 10) end,
	back = function(t) local c = 1.70158 * 1.525 return t < 0.5 and ((2 * t) ^ 2 * ((c + 1) * 2 * t - c)) / 2 or ((2 * t - 2) ^ 2 * ((c + 1) * (t * 2 - 2) + c) + 2) / 2 end,
	out = function(t) return 1 - (1 - t) ^ 3 end,
	["in"] = function(t) return t * t * t end,
}
Cinema.EASE = EASE
function Cinema.ease(name, t)
	t = math.clamp(t, 0, 1)
	local f = EASE[name or "sine"] or error("BrickwireCinema: unknown ease '" .. tostring(name) .. "'", 2)
	return f(t)
end
local function lerp(a, b, t) return a + (b - a) * t end

-- Catmull-Rom spline through points with constant-speed (arc-length) parameterisation
local function catmull(p0, p1, p2, p3, t)
	local t2, t3 = t * t, t * t * t
	return ((p1 * 2) + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * t2 + (p3 - p0 + p1 * 3 - p2 * 3) * t3) * 0.5
end
local function splineOf(points)
	local P = {}
	for i, p in ipairs(points) do P[i] = V(p) end
	if #P < 2 then error("BrickwireCinema: flyby needs at least 2 points", 3) end
	local segs = #P - 1
	local function raw(u) -- u in 0..1 over all segments
		local x = math.clamp(u, 0, 1) * segs
		local i = math.min(segs, math.floor(x) + 1)
		local lt = x - (i - 1)
		local p0 = P[math.max(1, i - 1)]
		local p3 = P[math.min(#P, i + 2)]
		return catmull(p0, P[i], P[i + 1], p3, lt)
	end
	local N = segs * 24
	local cum, prev = { 0 }, raw(0)
	for k = 1, N do
		local p = raw(k / N)
		cum[k + 1] = cum[k] + (p - prev).Magnitude
		prev = p
	end
	local total = cum[N + 1]
	return function(t)
		if total <= 0 then return raw(t) end
		local d = math.clamp(t, 0, 1) * total
		local lo, hi = 1, N + 1
		while hi - lo > 1 do
			local mid = (lo + hi) // 2
			if cum[mid] < d then lo = mid else hi = mid end
		end
		local span = cum[hi] - cum[lo]
		local f = span > 0 and (d - cum[lo]) / span or 0
		return raw(((lo - 1) + f) / N)
	end, total
end

local function orbitPos(c, r, h, deg) local a = math.rad(deg) return c + Vector3.new(math.sin(a) * r, h, math.cos(a) * r) end
-- Pure sampler: shot + eased progress e (0..1) → camera position, look point, fov, roll
local SAMPLERS = {}
function SAMPLERS.hold(s, e)
	return V(s.pos), s.look and Cinema.focusOf(s.look) or V(s.pos) + Vector3.new(0, 0, -1)
end
function SAMPLERS.pan(s, e)
	local a, b = Cinema.focusOf(s.from), Cinema.focusOf(s.to)
	return V(s.pos), a:Lerp(b, e)
end
function SAMPLERS.dolly(s, e)
	local a, b = V(s.from), V(s.to)
	local p = a:Lerp(b, e)
	return p, s.look and Cinema.focusOf(s.look) or p + (b - a).Unit * 10
end
function SAMPLERS.orbit(s, e)
	local c, size = Cinema.focusOf(s.target)
	local r = s.radius or math.max(12, size * 1.3)
	return orbitPos(c, r, s.height or r * 0.35, lerp(s.from or 0, s.to or 120, e)), c
end
function SAMPLERS.push_in(s, e, inv)
	local c, size = Cinema.focusOf(s.target)
	local d0, d1 = s.from or math.max(14, size * 2), s.to or math.max(6, size * 0.8)
	if inv then d0, d1 = d1, d0 end
	local d = lerp(d0, d1, e)
	local h = s.height or d * 0.25
	return orbitPos(c, d, h, s.angle or 0), c
end
function SAMPLERS.pull_out(s, e) return SAMPLERS.push_in(s, e, true) end
function SAMPLERS.crane(s, e)
	local c, size = Cinema.focusOf(s.target)
	local r = s.radius or math.max(14, size * 1.4)
	local h = lerp(s.fromHeight or 2, s.toHeight or size * 1.2 + 10, e)
	return orbitPos(c, lerp(r, r * (s.radiusEnd or 1), e), h, lerp(s.angle or 0, (s.angle or 0) + (s.turn or 25), e)), c + Vector3.new(0, lerp(0, s.lookRise or 0, e), 0)
end
-- reveal: starts low and close behind a foreground, rises and pulls back to show the whole target
function SAMPLERS.reveal(s, e)
	local c, size = Cinema.focusOf(s.target)
	local r0, r1 = s.fromRadius or math.max(8, size * 0.6), s.toRadius or math.max(20, size * 1.8)
	local h0, h1 = s.fromHeight or 1.5, s.toHeight or size * 0.9 + 6
	local ang = lerp(s.angle or 0, (s.angle or 0) + (s.turn or 40), e)
	return orbitPos(c, lerp(r0, r1, e), lerp(h0, h1, e), ang), c + Vector3.new(0, lerp(-size * 0.2, 0, e), 0)
end
function SAMPLERS.flyby(s, e)
	local f = s._spline
	if not f then f = splineOf(s.points) s._spline = f end
	local p = f(e)
	local look = s.look and Cinema.focusOf(s.look) or nil
	if not look then
		local q = f(math.min(1, e + 0.02))
		if (q - p).Magnitude < 1e-3 then q = p + (p - f(math.max(0, e - 0.02))) end
		look = p + (q - p).Unit * 20
	end
	return p, look
end
function SAMPLERS.track(s, e)
	local c = Cinema.focusOf(s.subject or s.target)
	local off = V(s.offset or { 0, 6, 16 })
	return c + off, c + V(s.focus or { 0, 1.5, 0 })
end

function Cinema.sample(shot, t)
	local f = SAMPLERS[shot.type or "hold"] or error("BrickwireCinema: unknown shot type '" .. tostring(shot.type) .. "'", 2)
	local e = Cinema.ease(shot.ease or (shot.type == "track" and "linear" or "sine"), t)
	local pos, look = f(shot, e)
	if shot.focus and shot.type ~= "track" then look = look + V(shot.focus) end
	local fov = shot.fov or 70
	if type(fov) == "table" then fov = lerp(fov[1], fov[2], e) end
	return pos, look, fov, lerp(type(shot.roll) == "table" and shot.roll[1] or shot.roll or 0, type(shot.roll) == "table" and shot.roll[2] or shot.roll or 0, e)
end
function Cinema.cframe(shot, t)
	local pos, look, fov, roll = Cinema.sample(shot, t)
	if (look - pos).Magnitude < 1e-3 then look = pos + Vector3.new(0, 0, -1) end
	return CFrame.lookAt(pos, look) * CFrame.Angles(0, 0, math.rad(roll)), fov
end
function Cinema.duration(shots)
	local t = 0
	for _, s in ipairs(shots) do t += (s.time or 3) end
	return t
end
-- Global time → shot index + local progress
function Cinema.at(shots, time)
	local acc = 0
	for i, s in ipairs(shots) do
		local d = s.time or 3
		if time <= acc + d or i == #shots then return i, math.clamp((time - acc) / d, 0, 1) end
		acc += d
	end
	return 1, 0
end

-- Quality check (pure math + optional raycasts in a live place). Returns { ok, issues = { "…" }, duration }
function Cinema.check(shots, opts)
	opts = opts or {}
	local issues = {}
	local function add(i, msg) table.insert(issues, string.format("shot %d (%s): %s", i, tostring(shots[i] and shots[i].type), msg)) end
	if type(shots) ~= "table" or #shots == 0 then return { ok = false, issues = { "no shots" }, duration = 0 } end
	local total = Cinema.duration(shots)
	if total > (opts.maxTotal or 40) then table.insert(issues, string.format("total %.1f s is long — players skip long intros; aim for 8–25 s", total)) end
	local types = {}
	local world = opts.world ~= false and select(2, pcall(function() return workspace.Raycast ~= nil and RaycastParams ~= nil end)) == true
	local ignore = table.clone(opts.ignore or {})
	for _, s in ipairs(shots) do
		for _, k in ipairs({ "target", "look", "subject", "from", "to" }) do
			local v = s[k]
			if typeof(v) == "string" then v = resolve(v) end
			if typeof(v) == "Instance" then table.insert(ignore, v) end
		end
	end
	for i, s in ipairs(shots) do
		local d = s.time or 3
		types[s.type or "hold"] = true
		if d < 1.2 then add(i, string.format("%.1f s is too short (reads as a glitch) — ≥1.5 s", d)) end
		if d > 12 and not opts.loop then add(i, string.format("%.1f s is long — split it or add motion", d)) end
		local okS, err = pcall(Cinema.sample, s, 0)
		if not okS then add(i, tostring(err)) else
			local N = 24
			local prevPos, prevVel, blocked, maxSpeed, near = nil, nil, 0, 0, math.huge
			for k = 0, N do
				local pos, look, fov, roll = Cinema.sample(s, k / N)
				local dir = look - pos
				near = math.min(near, dir.Magnitude)
				if k == 0 then
					if fov < 20 or fov > 100 then add(i, string.format("fov %.0f outside 20–100 (use 50–75 for most shots)", fov)) end
					if math.abs(roll) > 25 then add(i, string.format("roll %.0f° is extreme — keep dutch angles ≤ 15°", roll)) end
				end
				if dir.Magnitude > 1e-3 and math.abs(dir.Unit.Y) > 0.97 then add(i, "looks straight up/down — lookAt flips; offset the camera sideways") break end
				if prevPos then
					local vel = (pos - prevPos) / (d / N)
					maxSpeed = math.max(maxSpeed, vel.Magnitude)
					prevVel = vel
				end
				prevPos = pos
				if world then
					local okR, hit = pcall(function()
						local p = RaycastParams.new()
						p.FilterType = Enum.RaycastFilterType.Exclude
						p.FilterDescendantsInstances = ignore
						return workspace:Raycast(pos, dir * 0.95, p)
					end)
					if okR and hit and hit.Instance and hit.Instance.Transparency < 0.9 then blocked += 1 end
					if k % 6 == 0 then
						local okG, n = pcall(function()
							local c = 0
							for _, part in ipairs(workspace:GetPartBoundsInRadius(pos, 0.6)) do if part.Transparency < 0.9 then c += 1 end end
							return c
						end)
						if okG and n > 0 then add(i, string.format("camera is inside geometry at %.0f%% of the shot", k / N * 100)) end
					end
				end
			end
			if maxSpeed > (opts.maxSpeed or 140) then add(i, string.format("camera moves %.0f studs/s — too fast/nauseating; lengthen the shot or shorten the path", maxSpeed)) end
			if near < 2 then add(i, string.format("camera gets within %.1f studs of the look point — clipping risk", near)) end
			if blocked > N * 0.3 then add(i, string.format("view to the target is blocked in %d/%d samples — move the camera or ignore the blocker", blocked, N + 1)) end
		end
	end
	local n = 0
	for _ in pairs(types) do n += 1 end
	if #shots >= 3 and n == 1 then table.insert(issues, "every shot is the same type — vary it (wide → medium → close, orbit → push_in → crane)") end
	return { ok = #issues == 0, issues = issues, duration = total }
end

-- Ready-made shot lists. style: "intro" | "showcase" | "epic" | "boss" | "trailer" | "menu"
function Cinema.auto(target, style, opts)
	opts = opts or {}
	local c, size = Cinema.focusOf(target)
	local R = math.max(14, size * 1.3)
	local a = opts.angle or 200
	local T = opts.speed and (1 / opts.speed) or 1
	style = style or "intro"
	local t = target
	if style == "menu" then
		return { { type = "orbit", target = t, radius = R * 1.2, height = R * 0.35, from = a, to = a + 360, time = (opts.time or 60), ease = "linear", fov = 60 } }
	elseif style == "boss" then
		return {
			{ type = "reveal", target = t, angle = a, fromRadius = R * 0.5, toRadius = R * 1.1, fromHeight = 1, toHeight = size * 0.3, turn = 15, time = 3.5 * T, fov = 60, ease = "out" },
			{ type = "push_in", target = t, angle = a + 15, from = R * 1.1, to = R * 0.55, height = size * 0.15, time = 2 * T, fov = { 60, 45 }, roll = { 0, 8 }, ease = "quint", shake = 0.25 },
			{ type = "hold", pos = orbitPos(c, R * 0.55, size * 0.15, a + 15), look = t, time = 1.5 * T, fov = 45, roll = 8, shake = 0.15 },
		}
	elseif style == "epic" then
		return {
			{ type = "crane", target = t, angle = a, radius = R * 1.4, fromHeight = 1.5, toHeight = size * 1.4 + 12, turn = 20, time = 6 * T, fov = 65 },
			{ type = "orbit", target = t, radius = R * 1.1, height = size * 0.25, from = a + 20, to = a + 110, time = 6 * T, fov = 55 },
			{ type = "pull_out", target = t, angle = a + 110, from = R * 0.8, to = R * 2.4, height = size * 0.9, time = 5 * T, fov = 70, cut = "fade" },
		}
	elseif style == "trailer" then
		return {
			{ type = "flyby", points = { orbitPos(c, R * 3, size * 2 + 30, a - 40), orbitPos(c, R * 2, size + 15, a - 10), orbitPos(c, R * 1.2, size * 0.5, a + 10) }, look = t, time = 3 * T, fov = 70 },
			{ type = "push_in", target = t, angle = a + 60, from = R, to = R * 0.6, height = 2, time = 2.2 * T, fov = 55, cut = "fade" },
			{ type = "orbit", target = t, radius = R * 0.9, height = 3, from = a + 120, to = a + 160, time = 2.2 * T, fov = 50, roll = 6 },
			{ type = "crane", target = t, angle = a + 200, radius = R, fromHeight = 2, toHeight = size + 10, turn = 15, time = 2.5 * T, fov = 60 },
			{ type = "pull_out", target = t, angle = a + 230, from = R, to = R * 2.6, height = size * 0.8, time = 3 * T, fov = 65, cut = "fade" },
		}
	end
	-- intro / showcase: establishing fly-in → orbit → hero push-in → crane reveal
	return {
		{ type = "flyby", points = { orbitPos(c, R * 3.2, size * 1.6 + 35, a - 50), orbitPos(c, R * 2, size * 0.9 + 14, a - 20), orbitPos(c, R * 1.25, size * 0.4 + 3, a) }, look = t, time = 5 * T, fov = 70 },
		{ type = "orbit", target = t, radius = R * 1.25, height = size * 0.4 + 3, from = a, to = a + 75, time = 5 * T, fov = 60 },
		{ type = "push_in", target = t, angle = a + 75, from = R * 1.25, to = R * 0.7, height = size * 0.2 + 1.5, time = 3 * T, fov = { 60, 50 }, ease = "cubic" },
		{ type = "crane", target = t, angle = a + 75, radius = R * 0.9, fromHeight = size * 0.2 + 1.5, toHeight = size * 1.2 + 14, radiusEnd = 1.8, turn = 30, time = 4.5 * T, fov = 65, cut = "fade" },
	}
end

-- ---------------------------------------------------------------- player (client)
local function overlay()
	local pg = game:GetService("Players").LocalPlayer:WaitForChild("PlayerGui")
	local g = Instance.new("ScreenGui")
	g.Name = "BrickwireCinema"
	g.IgnoreGuiInset = true
	g.ResetOnSpawn = false
	g.DisplayOrder = 50
	local function bar(name, y, ay)
		local f = Instance.new("Frame")
		f.Name = name
		f.BackgroundColor3 = Color3.new(0, 0, 0)
		f.BorderSizePixel = 0
		f.AnchorPoint = Vector2.new(0, ay)
		f.Position = UDim2.fromScale(0, y)
		f.Size = UDim2.new(1, 0, 0, 0)
		f.Parent = g
		return f
	end
	local top, bottom = bar("Top", 0, 0), bar("Bottom", 1, 1)
	local fade = Instance.new("Frame")
	fade.Name = "Fade"
	fade.BackgroundColor3 = Color3.new(0, 0, 0)
	fade.BorderSizePixel = 0
	fade.Size = UDim2.fromScale(1, 1)
	fade.BackgroundTransparency = 1
	fade.ZIndex = 5
	fade.Parent = g
	g.Parent = pg
	return g, top, bottom, fade
end

-- Plays shots on the local camera. opts: letterbox (true), skip (true), fadeIn/fadeOut (s), dof (true), loop (false),
-- onDone(fn), restore (true: give the camera back to the player). Returns handle { stop = fn, done = bool }.
function Cinema.play(shots, opts)
	opts = opts or {}
	if not RunService:IsClient() then error("BrickwireCinema.play runs on the CLIENT (LocalScript)", 2) end
	local cam = workspace.CurrentCamera
	local handle = { done = false }
	local g, top, bottom, fade = overlay()
	local prevType, prevFov = cam.CameraType, cam.FieldOfView
	cam.CameraType = Enum.CameraType.Scriptable
	local dof
	if opts.dof then
		dof = Instance.new("DepthOfFieldEffect")
		dof.Name = "BrickwireCinemaDOF"
		dof.FarIntensity, dof.NearIntensity, dof.InFocusRadius = 0.35, 0.2, 18
		dof.Parent = cam
	end
	local tw = function(o, t, goal) TweenService:Create(o, TweenInfo.new(t, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut), goal):Play() end
	if opts.letterbox ~= false then
		tw(top, 0.6, { Size = UDim2.new(1, 0, 0.11, 0) })
		tw(bottom, 0.6, { Size = UDim2.new(1, 0, 0.11, 0) })
	end
	if opts.fadeIn and opts.fadeIn > 0 then
		fade.BackgroundTransparency = 0
		tw(fade, opts.fadeIn, { BackgroundTransparency = 1 })
	end
	local conn
	local function finish()
		if handle.done then return end
		handle.done = true
		if conn then conn:Disconnect() end
		local function restore()
			if opts.restore ~= false then
				cam.CameraType = prevType == Enum.CameraType.Scriptable and Enum.CameraType.Custom or prevType
				cam.FieldOfView = prevFov
			end
			if dof then dof:Destroy() end
			tw(top, 0.4, { Size = UDim2.new(1, 0, 0, 0) })
			tw(bottom, 0.4, { Size = UDim2.new(1, 0, 0, 0) })
			tw(fade, 0.4, { BackgroundTransparency = 1 })
			task.delay(0.5, function() g:Destroy() end)
			if opts.onDone then task.spawn(opts.onDone) end
		end
		if opts.fadeOut and opts.fadeOut > 0 then
			tw(fade, opts.fadeOut, { BackgroundTransparency = 0 })
			task.delay(opts.fadeOut, restore)
		else
			restore()
		end
	end
	handle.stop = finish
	if opts.skip ~= false then
		local b = Instance.new("TextButton")
		b.Name = "Skip"
		b.Text = opts.skipText or "Skip  ›"
		b.Font = Enum.Font.GothamBold
		b.TextSize = 18
		b.TextColor3 = Color3.new(1, 1, 1)
		b.BackgroundColor3 = Color3.new(0, 0, 0)
		b.BackgroundTransparency = 0.45
		b.AnchorPoint = Vector2.new(1, 1)
		b.Position = UDim2.new(1, -24, 1, -24)
		b.Size = UDim2.fromOffset(110, 40)
		b.ZIndex = 6
		local corner = Instance.new("UICorner")
		corner.CornerRadius = UDim.new(0, 10)
		corner.Parent = b
		b.Parent = g
		b.Activated:Connect(finish)
	end
	local total = Cinema.duration(shots)
	local t0 = os.clock()
	local lastIdx = 0
	conn = RunService.RenderStepped:Connect(function()
		local now = os.clock() - t0
		if now >= total then
			if opts.loop then t0 = os.clock() now = 0 else finish() return end
		end
		local i, p = Cinema.at(shots, now)
		local s = shots[i]
		if i ~= lastIdx then
			lastIdx = i
			if s.cut == "fade" and i > 1 then
				fade.BackgroundTransparency = 0
				tw(fade, 0.35, { BackgroundTransparency = 1 })
			end
		end
		local cf, fov = Cinema.cframe(s, p)
		if s.shake and s.shake > 0 then
			local k = s.shake * 0.6
			cf = cf * CFrame.Angles(math.rad((math.random() - 0.5) * k), math.rad((math.random() - 0.5) * k), 0)
		end
		cam.CFrame = cf
		cam.FieldOfView = fov
		if dof then
			local pos, look = Cinema.sample(s, p)
			dof.FocusDistance = (look - pos).Magnitude
		end
	end)
	return handle
end

-- Edit-mode preview: puts the (edit) camera where the cutscene is at time seconds (for screenshots).
function Cinema.preview(shots, time)
	local i, p = Cinema.at(shots, time or 0)
	local cf, fov = Cinema.cframe(shots[i], p)
	local cam = workspace.CurrentCamera
	cam.CFrame = cf
	cam.FieldOfView = fov
	return i, p
end
return Cinema
]==]
	-- Installs/updates ReplicatedStorage.BrickwireCinema (idempotent). Returns the ModuleScript.
	function BW.cinemaLib()
		local rs = game:GetService("ReplicatedStorage")
		local m = rs:FindFirstChild("BrickwireCinema")
		if m and not m:IsA("ModuleScript") then fail("ReplicatedStorage.BrickwireCinema exists and is not a ModuleScript") end
		if not m then
			m = Instance.new("ModuleScript")
			m.Name = "BrickwireCinema"
			m:SetAttribute("BW_Owned", true)
			m.Parent = rs
		end
		if m.Source ~= CINEMA_SRC then m.Source = CINEMA_SRC end
		return m
	end
	BW._cinemaSrc = CINEMA_SRC
	-- fresh require (a clone, so edits to the module are never cached) for edit-mode math/preview
	local function cinemaModule()
		local m = BW.cinemaLib()
		local c = m:Clone()
		c.Name = "BrickwireCinema_edit"
		c.Parent = m.Parent
		local ok, mod = pcall(require, c)
		c:Destroy()
		if not ok then fail("could not require BrickwireCinema: " .. tostring(mod)) end
		return mod
	end
	BW._cinemaModule = cinemaModule
	-- Serialise plain shot data (numbers/strings/booleans/Vector3/{…}) as a Luau literal for generated LocalScripts
	local function lit(v, depth)
		depth = depth or 0
		if depth > 8 then fail("shots nested too deep") end
		local t = typeof(v)
		if t == "number" then return (v == math.floor(v) and string.format("%d", v)) or string.format("%.3f", v)
		elseif t == "string" then return string.format("%q", v)
		elseif t == "boolean" then return tostring(v)
		elseif t == "Vector3" then return string.format("{ %.2f, %.2f, %.2f }", v.X, v.Y, v.Z)
		elseif t == "Instance" then return string.format("%q", v:GetFullName())
		elseif t == "table" then
			local parts, n = {}, #v
			for i = 1, n do table.insert(parts, lit(v[i], depth + 1)) end
			local keys = {}
			for k in pairs(v) do if type(k) == "string" and string.sub(k, 1, 1) ~= "_" then table.insert(keys, k) end end
			table.sort(keys)
			for _, k in ipairs(keys) do table.insert(parts, k .. " = " .. lit(v[k], depth + 1)) end
			return "{ " .. table.concat(parts, ", ") .. " }"
		end
		fail("cannot serialise " .. t .. " in shots")
	end
	BW._shotsLiteral = lit
	-- Auto shot list around a target (Instance / path / position). style: intro showcase epic boss trailer menu
	function BW.shots(target, style, opts)
		if typeof(target) == "Instance" then target = target:GetFullName() end
		return cinemaModule().auto(target, style, opts)
	end
	-- Quality gate for a shot list: speed, durations, fov/roll, clipping, blocked view, variety. Prints BW_CAM lines.
	function BW.camCheck(shots, opts)
		local r = cinemaModule().check(shots, opts)
		print(string.format("BW_CAM %s shots=%d duration=%.1fs issues=%d", r.ok and "OK" or "ISSUES", #shots, r.duration, #r.issues))
		for _, s in ipairs(r.issues) do print("BW_CAM  - " .. s) end
		return r
	end
	-- Puts the edit camera where the cutscene is at time s (then screen_capture to see the frame).
	function BW.camPreview(shots, time)
		local i, p = cinemaModule().preview(shots, time or 0)
		print(string.format("BW_CAM preview t=%.1fs → shot %d (%s) at %.0f%%", time or 0, i, tostring(shots[i].type), p * 100))
		return i
	end
	local CINE_SRC = [==[
-- Brickwire cinematic (client). Plays the shot list below with BrickwireCinema. Edit the shots freely —
-- every shot: type, time, fov, ease, roll, cut="fade"; see the header of ReplicatedStorage.BrickwireCinema.
local Players = game:GetService("Players")
local Cinema = require(game:GetService("ReplicatedStorage"):WaitForChild("BrickwireCinema"))
local SHOTS = {{SHOTS}}
local MODE, TRIGGER, ONCE = {{MODE}}, {{TRIGGER}}, {{ONCE}}
local OPTS = { letterbox = {{LETTERBOX}}, skip = {{SKIP}}, fadeIn = 0.8, fadeOut = 0.6, dof = {{DOF}}, loop = MODE == "menu" }
local player = Players.LocalPlayer
if MODE == "join" then
	if not game:IsLoaded() then game.Loaded:Wait() end
	task.wait(1)
	Cinema.play(SHOTS, OPTS)
elseif MODE == "menu" then
	-- background camera for a main menu: loops until something sets the player attribute InMenu = false
	local h = Cinema.play(SHOTS, { letterbox = false, skip = false, loop = true, dof = true })
	player:SetAttribute("InMenu", true)
	player:GetAttributeChangedSignal("InMenu"):Connect(function() if player:GetAttribute("InMenu") == false then h.stop() end end)
elseif MODE == "trigger" then
	local part = game
	for seg in string.gmatch(TRIGGER, "[^%.]+") do
		if part == game and seg == "Workspace" then part = workspace else part = part and part:WaitForChild(seg, 30) end
	end
	if part == game then part = nil end
	local playing, seen = false, false
	if part then
		part.Touched:Connect(function(hit)
			if playing or (ONCE and seen) then return end
			local char = player.Character
			if not char or not hit:IsDescendantOf(char) then return end
			playing, seen = true, true
			Cinema.play(SHOTS, { letterbox = OPTS.letterbox, skip = OPTS.skip, fadeIn = 0.4, fadeOut = 0.4, dof = OPTS.dof, onDone = function() playing = false end })
		end)
	end
end
]==]
	-- Generates the LocalScript that plays a cutscene. opts: shots= (or target= + style=), mode = "join" | "menu" | "trigger",
	-- trigger = part (Instance or full path, mode trigger), once (true), letterbox/skip/dof, Name.
	function BW.cinematic(opts)
		opts = opts or {}
		BW.cinemaLib()
		local shots = opts.shots
		if not shots then
			if not opts.target then fail("BW.cinematic needs shots= or target=") end
			shots = BW.shots(opts.target, opts.style or (opts.mode == "menu" and "menu" or "intro"), opts)
		end
		local mode = opts.mode or "join"
		if mode ~= "join" and mode ~= "menu" and mode ~= "trigger" then fail("mode must be join, menu or trigger") end
		local name = opts.Name or (mode == "menu" and "BrickwireMenuCamera" or mode == "trigger" and "BrickwireCutscene" or "BrickwireIntro")
		local s = BW.script("LocalScript", name, "StarterPlayer.StarterPlayerScripts", src(CINE_SRC, {
			MODE = mode, TRIGGER = typeof(opts.trigger) == "Instance" and opts.trigger:GetFullName() or opts.trigger or "Workspace.CutsceneTrigger", ONCE = opts.once ~= false,
			LETTERBOX = opts.letterbox ~= false, SKIP = opts.skip ~= false, DOF = opts.dof == true, SHOTS = "__SHOTS__",
		}))
		s.Source = string.gsub(s.Source, '"__SHOTS__"', function() return lit(shots) end)
		local okC, rep = pcall(BW.camCheck, shots, opts.check)
		print("BW_CINEMA " .. mode .. " → " .. s:GetFullName() .. string.format(" shots=%d duration=%.1fs", #shots, okC and rep.duration or 0))
		return s, shots
	end
	K("cinematic_intro", function(o)
		local x, y, z = base(o)
		local m = model(o, "CinematicIntro")
		local target = o.target
		if not target then
			-- demo subject so the kit is self-contained: a monument on a plinth (point target= at your map/building instead)
			BW.cylinder{ Name = "Plinth", At = { x, y, z }, height = 2, diameter = 16, Color = "#C9C1B1", Material = "Slate", Parent = m }
			BW.part{ Name = "Obelisk", Size = { 4, 18, 4 }, At = { x, y + 2, z }, Color = "#E8E2D4", Material = "Marble", Parent = m }
			local gem = BW.part{ Name = "Subject", Shape = "Ball", Size = { 4, 4, 4 }, Position = { x, y + 22.5, z }, Color = "#7DF9FF", Material = "Neon", Parent = m }
			BW.light(gem, "PointLight", { Color = "#7DF9FF", Range = 24, Brightness = 2 })
			target = m
		end
		BW.cinematic{ target = target, style = o.style or "intro", mode = "join", dof = o.dof, Name = o.scriptName or "BrickwireIntro" }
		return m
	end)
	K("cutscene_trigger", function(o)
		local x, y, z = base(o)
		local m = model(o, "CutsceneTrigger")
		local pad = BW.part{ Name = "Trigger", Size = { o.size or 10, 0.4, o.size or 10 }, At = { x, y, z }, Color = "#FFD24D", Material = "Neon", Transparency = 0.55, CanCollide = false, Parent = m }
		BW.particles(pad, "sparkles", { Rate = 6, Color = "#FFE27A" })
		BW.cinematic{ target = o.target or pad, style = o.style or "epic", mode = "trigger", trigger = pad, once = o.once, dof = o.dof, Name = o.scriptName or "BrickwireCutscene" }
		return m
	end)
	K("menu_camera", function(o)
		local x, y, z = base(o)
		local m = model(o, "MenuCamera")
		local focus = BW.part{ Name = "Focus", Size = { 1, 1, 1 }, Position = { x, y + (o.height or 6), z }, Transparency = 1, CanCollide = false, CanQuery = false, Parent = m }
		local r = o.radius or 70
		local shots = { { type = "orbit", target = focus, radius = r, height = r * 0.4, from = 0, to = 360, time = o.time or 70, ease = "linear", fov = 55 } }
		BW.cinematic{ shots = shots, mode = "menu", Name = o.scriptName or "BrickwireMenuCamera" }
		return m
	end)
	-- ================================================================== CUTSCENES (1.9): ReplicatedStorage.BrickwireCutscene
	-- Timeline cutscenes (camera, subtitles, titles, sound, VFX, tweens, shake/FOV/blur/colour, events) + ready scenes:
	-- case opening, egg hatch, Anime Dice roll, event start, back-story. Default style "animedice".
	local CUTSCENE_SRC = [==[
-- Brickwire Cutscene module (ReplicatedStorage.BrickwireCutscene) 1.9 — timeline cutscenes + ready gacha / event / story scenes.
-- Default look: style = "animedice" (Roblox Anime Dice: chunky FredokaOne text with a black outline, roll ticker with "1 in N"
-- odds, rarity colours, bigger pause / shake / flash / rays the rarer it is, fake ending for Mythic+). style = "clean" is calmer.
-- CLIENT (LocalScript):
--   local Cutscene = require(game.ReplicatedStorage:WaitForChild("BrickwireCutscene"))
--   Cutscene.listen()   -- plays whatever the server sends: "case" | "egg" | "dice" | "event" | "story" | "timeline"
--   Cutscene.play({ style = "animedice", events = {
--     { at = 0,   camera = { { type = "push_in", target = "Workspace.Boss", from = 40, to = 14, time = 3 } } },   -- BrickwireCinema shots
--     { at = 0,   sound = "rbxassetid://…", music = true, volume = 0.6, fadeIn = 1, fadeOut = 1, time = 8 },
--     { at = 0.5, say = "You came…", speaker = "Shadow King", time = 2.5 },      -- subtitle typed letter by letter
--     { at = 3,   title = "BOSS FIGHT", sub = "Shadow King", time = 2 },         -- title card
--     { at = 3,   shake = 0.8, time = 0.4 }, { at = 3, flash = "#FFFFFF", time = 0.25 }, { at = 3, vfx = "explosion", where = "Workspace.Boss" },
--     { at = 4,   tween = "Workspace.Gate", goal = { Transparency = 1 }, time = 1 },
--     { at = 4,   fov = 50, time = 0.6 }, { at = 4, blur = 12, time = 0.3 }, { at = 5, color = { Saturation = -0.4 }, time = 1 },
--     { at = 6,   fire = "BossReady" },                                          -- opts.onEvent("BossReady")
--   } }, { skip = true, lockControls = true, onDone = function() end })
-- SERVER (Script): rewards are ALWAYS rolled on the server, the client only shows them:
--   local item = Cutscene.roll(POOL, { luck = 2 })       -- POOL = { { name = "Naruto", rarity = "Rare", chance = 1/300 }, … }
--   Cutscene.show(player | "all", "case", { result = item, pool = POOL })
-- Ready scenes (client): Cutscene.caseOpen(result, opts) · Cutscene.eggHatch(results, opts) · Cutscene.diceRoll(result, opts)
--   · Cutscene.eventStart(opts) · Cutscene.story(frames, opts). Each also has a *Timeline(...) builder for Cutscene.check.
-- Rarities: Common Uncommon Rare Epic Legendary Mythic Secret (or a number 1..7).
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local RS = game:GetService("ReplicatedStorage")
local Cutscene = { VERSION = "1.9.0", defaultStyle = "animedice" }

-- built-in Roblox sounds (always available); replace with your own rbxassetid:// ids
Cutscene.SOUNDS = {
	tick = "rbxasset://sounds/clickfast.wav", whoosh = "rbxasset://sounds/swoosh.wav", hit = "rbxasset://sounds/snap.wav",
	reveal = "rbxasset://sounds/electronicpingshort.wav", music = "",
}
Cutscene.RARITIES = { "Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic", "Secret" }
local COLORS = { Common = "#D2D2D2", Uncommon = "#5CFF5C", Rare = "#3DA5FF", Epic = "#B14CFF", Legendary = "#FFC727", Mythic = "#FF3D6E", Secret = "#FFFFFF" }
Cutscene.STYLES = {
	animedice = { font = Enum.Font.FredokaOne, titleFont = Enum.Font.LuckiestGuy, stroke = 3, dim = 0.35, punch = true, tilt = -6, speedLines = true, fakeout = true, colors = COLORS },
	clean = { font = Enum.Font.GothamBold, titleFont = Enum.Font.GothamBlack, stroke = 1.5, dim = 0.25, punch = false, tilt = 0, speedLines = false, fakeout = false, colors = COLORS },
}
Cutscene.MUTATIONS = { Silver = "#D9E3EA", Gold = "#FFD54A", Huge = "#7CF0FF", Titanic = "#FF7A3D", Perfect = "#FFF27A", Rainbow = "#FF66CC" }
-- reading time limits per scene kind (seconds) used by Cutscene.check
Cutscene.LIMITS = { case = { 4, 6 }, egg = { 3, 5 }, dice = { 0.8, 6 }, event = { 3, 12 }, story = { 6, 30 }, intro = { 4, 30 } }

local function C(v)
	if typeof(v) == "Color3" then return v end
	return Color3.fromHex(tostring(v or "#FFFFFF"))
end
local function styleOf(s)
	if type(s) == "table" then return s end
	return Cutscene.STYLES[s or Cutscene.defaultStyle] or Cutscene.STYLES.animedice
end
local function lib(name)
	local m = RS:FindFirstChild(name)
	if not m then return nil end
	local ok, mod = pcall(require, m)
	return ok and mod or nil
end
local RNG = (Random and Random.new) and Random.new() or nil
local function rand(a, b)
	local r = RNG and RNG:NextNumber() or math.random()
	if a then return a + (b - a) * r end
	return r
end

-- ---------------------------------------------------------------- rarity / odds / ease (pure)
function Cutscene.tier(r)
	if type(r) == "table" then r = r.rarity end
	if type(r) == "number" then return math.clamp(math.floor(r), 1, #Cutscene.RARITIES) end
	for i, n in ipairs(Cutscene.RARITIES) do
		if n == r or string.lower(n) == string.lower(tostring(r)) then return i end
	end
	return 1
end
-- Feel parameters for a rarity: the rarer, the longer the pause before the hit and the stronger everything is.
function Cutscene.rarity(r, style)
	local st = styleOf(style)
	local t = Cutscene.tier(r)
	local name = Cutscene.RARITIES[t]
	local k = (t - 1) / (#Cutscene.RARITIES - 1)
	return {
		name = name, tier = t, color = C(st.colors[name] or "#FFFFFF"), rainbow = t == #Cutscene.RARITIES,
		pause = 0.1 + 0.6 * k, shake = 0.1 + 1.2 * k * k, flash = t >= 3, rays = t >= 4, big = t >= 4,
		fakeout = st.fakeout == true and t >= 6, particles = 8 + 10 * t, label = string.upper(name) .. (t >= 4 and "!" or ""),
	}
end
-- 300 → "1 in 300", 17250 → "1 in 17.3k", 2.5e6 → "1 in 2.5M"
function Cutscene.odds(n)
	if type(n) ~= "number" or n <= 0 then return "" end
	if n < 1 then n = 1 / n end
	local units = { { 1e12, "T" }, { 1e9, "B" }, { 1e6, "M" }, { 1e3, "k" } }
	for _, u in ipairs(units) do
		if n >= u[1] then
			local v = n / u[1]
			local s = v >= 100 and string.format("%d", math.floor(v + 0.5)) or string.gsub(string.format("%.1f", math.floor(v * 10 + 0.5) / 10), "%.0$", "")
			return "1 in " .. s .. u[2]
		end
	end
	return "1 in " .. string.format("%d", math.floor(n + 0.5))
end
local EASE = {
	linear = function(t) return t end,
	sine = function(t) return -(math.cos(math.pi * t) - 1) / 2 end,
	quad = function(t) return 1 - (1 - t) * (1 - t) end,
	cubic = function(t) return 1 - (1 - t) ^ 3 end,
	quart = function(t) return 1 - (1 - t) ^ 4 end,
	quint = function(t) return 1 - (1 - t) ^ 5 end,
	expo = function(t) return t >= 1 and 1 or 1 - 2 ^ (-10 * t) end,
	back = function(t) local c = 1.70158 return 1 + (c + 1) * (t - 1) ^ 3 + c * (t - 1) ^ 2 end,
}
Cutscene.EASE = EASE
function Cutscene.ease(name, t)
	t = math.clamp(t, 0, 1)
	return (EASE[name or "quart"] or EASE.quart)(t)
end

-- ---------------------------------------------------------------- server: weighted roll
-- pool items: { name=, rarity=, weight= | chance= (0..1) | odds= (N of "1 in N"), icon=, … }. opts.luck boosts rarer items.
function Cutscene.roll(pool, opts)
	opts = opts or {}
	if RunService:IsClient() and not opts.allowClient then error("Cutscene.roll must run on the SERVER (the client only shows the result)", 2) end
	if type(pool) ~= "table" or #pool == 0 then error("Cutscene.roll: empty pool", 2) end
	local luck = math.max(opts.luck or 1, 0.01)
	local ws, total = {}, 0
	for i, it in ipairs(pool) do
		local w = it.weight or (it.chance and it.chance > 0 and it.chance) or (it.odds and it.odds > 0 and 1 / it.odds) or 1
		local k = (Cutscene.tier(it) - 1) / (#Cutscene.RARITIES - 1)
		w = w * luck ^ k
		ws[i] = w
		total += w
	end
	local pick, acc = #pool, rand() * total
	for i, w in ipairs(ws) do
		acc -= w
		if acc <= 0 then pick = i break end
	end
	local out = table.clone(pool[pick])
	out.rarity = out.rarity or Cutscene.RARITIES[Cutscene.tier(out)]
	out.odds = out.odds or math.floor(total / ws[pick] + 0.5)
	out.index = pick
	return out
end

-- ---------------------------------------------------------------- UI helpers
local function tw(o, t, goal, style, dir)
	local tween = TweenService:Create(o, TweenInfo.new(math.max(t, 0.01), style or Enum.EasingStyle.Quad, dir or Enum.EasingDirection.Out), goal)
	tween:Play()
	return tween
end
local function new(cls, props, parent)
	local o = Instance.new(cls)
	for k, v in pairs(props or {}) do o[k] = v end
	if parent then o.Parent = parent end
	return o
end
local function text(parent, st, props)
	local l = new("TextLabel", {
		BackgroundTransparency = 1, Font = props.font or st.font, Text = props.text or "", TextColor3 = C(props.color or "#FFFFFF"),
		TextScaled = true, Size = props.size or UDim2.fromScale(1, 0.2), Position = props.pos or UDim2.fromScale(0.5, 0.5),
		AnchorPoint = props.anchor or Vector2.new(0.5, 0.5), Rotation = props.rot or 0, ZIndex = props.z or 3, Name = props.name or "Text",
	}, parent)
	new("UIStroke", { Thickness = props.stroke or st.stroke, Color = C(props.strokeColor or "#000000"), Name = "Stroke" }, l)
	return l
end
local function rainbow(o)
	return new("UIGradient", { Name = "Rainbow", Color = ColorSequence.new({
		ColorSequenceKeypoint.new(0, C("#FF4D4D")), ColorSequenceKeypoint.new(0.2, C("#FFC727")), ColorSequenceKeypoint.new(0.4, C("#5CFF5C")),
		ColorSequenceKeypoint.new(0.6, C("#3DA5FF")), ColorSequenceKeypoint.new(0.8, C("#B14CFF")), ColorSequenceKeypoint.new(1, C("#FF4D4D")),
	}) }, o)
end
local function sound(parent, id, vol, pitch)
	if type(id) ~= "string" or id == "" then return nil end
	local s = new("Sound", { SoundId = id, Volume = vol or 0.6, PlaybackSpeed = pitch or 1, Name = "CutsceneSound" }, parent)
	s:Play()
	pcall(function() game:GetService("Debris"):AddItem(s, 8) end)
	return s
end

-- ---------------------------------------------------------------- timeline length + quality check (pure)
local function eventLength(e)
	local len = e.time or 0
	if e.camera then
		local cm = lib("BrickwireCinema")
		local d = 0
		if cm then d = cm.duration(e.camera) else for _, s in ipairs(e.camera) do d += s.time or 3 end end
		len = math.max(len, d)
	end
	return len
end
function Cutscene.duration(tl)
	local d = tl.length or 0
	for _, e in ipairs(tl.events or tl) do
		if type(e) == "table" then d = math.max(d, (e.at or 0) + eventLength(e)) end
	end
	return d
end
-- Quality gate: Skip, length per kind, sound on key moments, readable subtitles, camera (BrickwireCinema.check: walls,
-- speed, clipping), reward rolled on the server. opts: kind = "case"|"egg"|"dice"|"event"|"story"|"intro", reward, world.
function Cutscene.check(tl, opts)
	opts = opts or {}
	local issues = {}
	local function add(s) table.insert(issues, s) end
	if type(tl) ~= "table" then return { ok = false, issues = { "timeline must be a table" }, duration = 0 } end
	local events = tl.events or tl
	local kind = opts.kind or tl.kind
	local d = Cutscene.duration(tl)
	local lim = Cutscene.LIMITS[kind or ""] or { 0.5, 40 }
	if d > lim[2] + 0.05 then add(string.format("too long: %.1f s (aim ≤ %d s for %s) — players replay this; cut pauses", d, lim[2], kind or "a cutscene")) end
	if d < lim[1] - 0.05 then add(string.format("too short: %.1f s (≥ %d s for %s) — no build-up before the reveal", d, lim[1], kind or "a cutscene")) end
	if tl.skip == false or opts.skip == false then add("no Skip — every cutscene needs Skip (and a short skip-to-result for rewards)") end
	local sounds, keys = 0, 0
	local cm = lib("BrickwireCinema")
	for i, e in ipairs(events) do
		if type(e) ~= "table" then add("event " .. i .. " is not a table") continue end
		if (e.at or 0) < 0 then add("event " .. i .. ": negative at") end
		if e.sound or e.music or e.sfx then sounds += 1 end
		if e.title or e.flash or e.shake or e.vfx or e.key then keys += 1 end
		local line = e.say or e.subtitle
		if type(line) == "string" then
			local need = 0.8 + #line / 18
			if (e.time or 3) < need then add(string.format("event %d: subtitle shown %.1f s, needs ≥ %.1f s to read", i, e.time or 3, need)) end
		end
		if e.tween and type(e.goal) ~= "table" then add("event " .. i .. ": tween needs goal = { Property = value }") end
		if e.camera and cm then
			local r = cm.check(e.camera, { maxTotal = lim[2], world = opts.world })
			for _, s in ipairs(r.issues) do add("camera: " .. s) end
		end
	end
	if sounds == 0 then add("no sound — add a sound to every key moment (whoosh on moves, hit on impacts, reveal on the result, music for intros)") end
	if keys >= 3 and sounds < 2 then add(string.format("%d key moments but %d sound(s) — sound every accent", keys, sounds)) end
	local reward = opts.reward or tl.reward or kind == "case" or kind == "egg" or kind == "dice"
	if reward and not (tl.serverResult or opts.serverResult) then add("reward scene: roll the result on the SERVER (Cutscene.roll) and pass it in — the client only shows it") end
	return { ok = #issues == 0, issues = issues, duration = d }
end

-- ---------------------------------------------------------------- player (client)
local function localPlayer() return Players.LocalPlayer end
local function character()
	local ok, c = pcall(function() return localPlayer().Character end)
	return ok and c or nil
end
local function controls(on)
	pcall(function()
		local pm = require(localPlayer():WaitForChild("PlayerScripts"):WaitForChild("PlayerModule"))
		local c = pm:GetControls()
		if on then c:Enable() else c:Disable() end
	end)
end
local function resolve(v)
	if typeof(v) == "Instance" then return v end
	if type(v) ~= "string" then return nil end
	local cur = game
	for seg in string.gmatch(v, "[^%.]+") do
		if cur == game and seg == "Workspace" then cur = workspace else cur = cur and cur:FindFirstChild(seg) end
	end
	return cur ~= game and cur or nil
end
Cutscene.resolve = resolve
local ACTIVE = nil

-- Plays a timeline. tl = { events = {…}, style =, skip =, onSkip = fn(ctx), length = }. opts: skip (true), lockControls (true),
-- letterbox (false), restore (true), onDone(skipped), onEvent(name, e). Returns handle { stop(), skip(), done, skipped }.
function Cutscene.play(tl, opts)
	opts = opts or {}
	if not RunService:IsClient() then error("Cutscene.play runs on the CLIENT (LocalScript); on the server use Cutscene.show(player, scene, data)", 2) end
	if ACTIVE and not ACTIVE.done then ACTIVE.stop() end
	local st = styleOf(tl.style or opts.style)
	local player = localPlayer()
	local cam = workspace.CurrentCamera
	local handle = { done = false, skipped = false }
	ACTIVE = handle
	local gui = new("ScreenGui", { Name = "BrickwireCutscene", IgnoreGuiInset = true, ResetOnSpawn = false, DisplayOrder = 60 })
	local layer = new("Frame", { Name = "Layer", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 2 }, gui)
	local dim = new("Frame", { Name = "Dim", BackgroundColor3 = C("#000000"), BackgroundTransparency = 1, BorderSizePixel = 0, Size = UDim2.fromScale(1, 1), ZIndex = 1 }, gui)
	local top = new("Frame", { Name = "Top", BackgroundColor3 = C("#000000"), BorderSizePixel = 0, Size = UDim2.new(1, 0, 0, 0), ZIndex = 8 }, gui)
	local bottom = new("Frame", { Name = "Bottom", BackgroundColor3 = C("#000000"), BorderSizePixel = 0, AnchorPoint = Vector2.new(0, 1), Position = UDim2.fromScale(0, 1), Size = UDim2.new(1, 0, 0, 0), ZIndex = 8 }, gui)
	local flash = new("Frame", { Name = "Flash", BackgroundColor3 = C("#FFFFFF"), BackgroundTransparency = 1, BorderSizePixel = 0, Size = UDim2.fromScale(1, 1), ZIndex = 9 }, gui)
	gui.Parent = player:WaitForChild("PlayerGui")
	local prevType, prevFov, prevCF = cam.CameraType, cam.FieldOfView, cam.CFrame
	local owned = {}
	local frames = {}
	local camShots, camStart, camHold = nil, 0, nil
	local shakeAmp, shakeEnd = 0, 0
	local t0 = os.clock()
	local gen = 0
	local ctx = { gui = gui, layer = layer, style = st, cam = cam, handle = handle, player = player, sounds = tl.sounds or Cutscene.SOUNDS, owned = owned }
	local function now() return os.clock() - t0 end
	function ctx.after(t, fn)
		local g = gen
		task.delay(math.max(t or 0, 0), function() if g == gen and not handle.done then fn() end end)
	end
	function ctx.frame(fn) table.insert(frames, fn) end
	function ctx.sound(id, vol, pitch) return sound(gui, ctx.sounds[id] or id, vol, pitch) end
	function ctx.shake(a, t)
		shakeAmp = math.max(shakeAmp, a or 0.5)
		shakeEnd = now() + (t or 0.35)
	end
	function ctx.flash(color, t)
		flash.BackgroundColor3 = C(color or "#FFFFFF")
		flash.BackgroundTransparency = 0
		tw(flash, t or 0.3, { BackgroundTransparency = 1 })
	end
	function ctx.dim(alpha, t) tw(dim, t or 0.3, { BackgroundTransparency = 1 - (alpha or st.dim) }) end
	function ctx.letterbox(on, t)
		local h = on and 0.11 or 0
		tw(top, t or 0.5, { Size = UDim2.new(1, 0, h, 0) })
		tw(bottom, t or 0.5, { Size = UDim2.new(1, 0, h, 0) })
	end
	function ctx.text(props) return text(props.parent or layer, st, props) end
	function ctx.camera(shots)
		cam.CameraType = Enum.CameraType.Scriptable
		camShots, camStart, camHold = shots, now(), nil
	end
	function ctx.hold(cf)
		cam.CameraType = Enum.CameraType.Scriptable
		camShots, camHold = nil, cf
		cam.CFrame = cf
	end
	function ctx.effect(cls, props)
		local o = owned[cls]
		if not o then
			o = new(cls, props or {})
			o.Name = "BrickwireCutscene" .. cls
			o.Parent = cam
			owned[cls] = o
		end
		return o
	end
	function ctx.button(label, color, pos, cb)
		local b = new("TextButton", { Name = label, Text = label, Font = st.font, TextScaled = true, TextColor3 = C("#FFFFFF"), BackgroundColor3 = C(color or "#3CCB4A"),
			AnchorPoint = Vector2.new(0.5, 0.5), Position = pos or UDim2.fromScale(0.5, 0.86), Size = UDim2.fromScale(0.16, 0.075), ZIndex = 7, AutoButtonColor = true }, gui)
		new("UICorner", { CornerRadius = UDim.new(0.25, 0) }, b)
		new("UIStroke", { Thickness = st.stroke, Color = C("#000000"), ApplyStrokeMode = Enum.ApplyStrokeMode.Contextual }, b)
		new("UISizeConstraint", { MinSize = Vector2.new(120, 40) }, b)
		b.Activated:Connect(function() if cb then cb() end end)
		return b
	end
	-- rarity reveal card (centre of the screen): rays + RARITY! + name + odds, punch-in for style animedice
	function ctx.pop(result, o)
		o = o or {}
		local R = Cutscene.rarity(result, st)
		local card = new("Frame", { Name = "Reveal", BackgroundTransparency = 1, AnchorPoint = Vector2.new(0.5, 0.5), Position = o.pos or UDim2.fromScale(0.5, 0.45), Size = UDim2.fromScale(0.6, 0.4), ZIndex = 4 }, layer)
		new("UIAspectRatioConstraint", { AspectRatio = 1.6 }, card)
		local scale = new("UIScale", { Scale = st.punch and 0.2 or 0.85 }, card)
		if R.rays then
			local rays = new("Frame", { Name = "Rays", BackgroundTransparency = 1,
				AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.45), Size = UDim2.fromScale(1.6, 2.4), ZIndex = 3 }, card)
			for i = 1, 10 do
				new("Frame", { Name = "Ray" .. i, BackgroundColor3 = R.color, BackgroundTransparency = 0.55, BorderSizePixel = 0, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromScale(0.05, 1.5), Rotation = i * 18, ZIndex = 3 }, rays)
			end
			local spin = 0
			ctx.frame(function(_, dt)
				if not rays.Parent then return true end
				spin += (dt or 1 / 60) * 40
				rays.Rotation = spin
				return false
			end)
		end
		local rl = text(card, st, { name = "Rarity", text = R.label, color = R.color, font = st.titleFont, size = UDim2.fromScale(1, 0.34), pos = UDim2.fromScale(0.5, 0.2), rot = st.tilt, z = 5, stroke = st.stroke + 1 })
		if R.rainbow then rainbow(rl) end
		text(card, st, { name = "ItemName", text = (result.mutation and (result.mutation .. " ") or "") .. tostring(result.name or "?"), size = UDim2.fromScale(1, 0.24), pos = UDim2.fromScale(0.5, 0.56), z = 5 })
		local odds = result.odds and Cutscene.odds(result.odds) or ""
		if odds ~= "" then text(card, st, { name = "Odds", text = odds, size = UDim2.fromScale(0.7, 0.15), pos = UDim2.fromScale(0.5, 0.78), z = 5 }) end
		if result.icon then
			new("ImageLabel", { Name = "Icon", BackgroundTransparency = 1, Image = result.icon, AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.fromScale(0.5, 0.05), Size = UDim2.fromScale(0.35, 0.55), ZIndex = 5 }, card)
		end
		tw(scale, st.punch and 0.35 or 0.25, { Scale = 1 }, Enum.EasingStyle.Back)
		return card, R
	end
	local conn
	local function restore()
		gen += 1
		if conn then conn:Disconnect() conn = nil end
		if opts.restore ~= false then
			cam.CameraType = (prevType == Enum.CameraType.Scriptable) and Enum.CameraType.Custom or prevType
			cam.FieldOfView = prevFov
			if prevType == Enum.CameraType.Scriptable then cam.CFrame = prevCF end
		end
		for _, o in pairs(owned) do
			pcall(function()
				if o:IsA("Sound") then
					tw(o, 0.4, { Volume = 0 })
					task.delay(0.45, function() o:Destroy() end)
				else
					o:Destroy()
				end
			end)
		end
		if opts.lockControls ~= false then controls(true) end
		tw(top, 0.3, { Size = UDim2.new(1, 0, 0, 0) })
		tw(bottom, 0.3, { Size = UDim2.new(1, 0, 0, 0) })
		tw(dim, 0.3, { BackgroundTransparency = 1 })
		task.delay(0.35, function() gui:Destroy() end)
	end
	local function finish()
		if handle.done then return end
		handle.done = true
		restore()
		if ACTIVE == handle then ACTIVE = nil end
		if tl.onDone then task.spawn(tl.onDone, handle.skipped) end
		if opts.onDone then task.spawn(opts.onDone, handle.skipped) end
	end
	ctx.finish = finish
	handle.stop = finish
	function handle.skip()
		if handle.done or handle.skipped then return end
		handle.skipped = true
		if ctx.revealed then finish() return end
		gen += 1 -- cancels everything still scheduled
		frames = {}
		layer:ClearAllChildren()
		if tl.onSkip then
			local ok, err = pcall(tl.onSkip, ctx)
			if not ok then warn("BrickwireCutscene onSkip: " .. tostring(err)) finish() end
		else
			finish()
		end
	end
	if opts.lockControls ~= false then controls(false) end
	if opts.letterbox or tl.letterbox then ctx.letterbox(true) end
	if opts.skip ~= false and tl.skip ~= false then
		local b = ctx.button(opts.skipText or "Skip", "#2B2B2B", UDim2.new(1, -90, 1, -50), function() handle.skip() end)
		b.Name = "Skip"
		b.Size = UDim2.fromOffset(130, 46)
	end
	-- event runner
	local cinema = lib("BrickwireCinema")
	local vfx = lib("BrickwireVFX")
	local function runEvent(e)
		if e.run then e.run(ctx, e) end
		if e.camera then ctx.camera(e.camera) end
		if e.cut then ctx.hold(typeof(e.cut) == "CFrame" and e.cut or CFrame.lookAt(e.cut.pos, e.cut.look)) end
		if e.sound or e.sfx then
			local s = ctx.sound(e.sound or e.sfx, e.music and 0 or (e.volume or 0.6), e.pitch)
			if s then
				if e.music then
					s.Looped = true
					tw(s, e.fadeIn or 1, { Volume = e.volume or 0.5 })
					owned["Music" .. tostring(s)] = s
				end
				if e.time and e.fadeOut then ctx.after(math.max(e.time - e.fadeOut, 0), function() tw(s, e.fadeOut, { Volume = 0 }) end) end
			end
		end
		if e.say or e.subtitle then
			local line = e.say or e.subtitle
			local box = new("Frame", { Name = "Subtitle", BackgroundColor3 = C("#000000"), BackgroundTransparency = 0.45, AnchorPoint = Vector2.new(0.5, 1), Position = UDim2.fromScale(0.5, 0.86), Size = UDim2.fromScale(0.62, 0.12), ZIndex = 6 }, layer)
			new("UICorner", { CornerRadius = UDim.new(0.2, 0) }, box)
			if e.speaker then text(box, st, { name = "Speaker", text = e.speaker, color = e.speakerColor or "#FFD24D", size = UDim2.fromScale(0.4, 0.38), pos = UDim2.fromScale(0.03, -0.12), anchor = Vector2.new(0, 0.5), z = 7 }) end
			local l = text(box, st, { name = "Line", text = "", size = UDim2.fromScale(0.94, 0.62), pos = UDim2.fromScale(0.5, 0.58), z = 7, stroke = 1.5 })
			l.TextXAlignment = Enum.TextXAlignment.Left
			local n, cps = 0, e.cps or 38
			local started = now()
			ctx.frame(function()
				if not l.Parent then return true end
				local k = math.min(#line, math.floor((now() - started) * cps))
				if k ~= n then n = k l.Text = string.sub(line, 1, k) end
				return k >= #line
			end)
			if e.typing == false then l.Text = line end
			ctx.after(e.time or 3, function() box:Destroy() end)
		end
		if e.title then
			local card = new("Frame", { Name = "Title", BackgroundTransparency = 1, AnchorPoint = Vector2.new(0.5, 0.5), Position = e.pos or UDim2.fromScale(0.5, 0.42), Size = UDim2.fromScale(0.8, 0.3), ZIndex = 5 }, layer)
			local sc = new("UIScale", { Scale = st.punch and 1.8 or 1.1 }, card)
			local tl1 = text(card, st, { name = "Main", text = e.title, color = e.color or "#FFFFFF", font = st.titleFont, size = UDim2.fromScale(1, 0.62), pos = UDim2.fromScale(0.5, 0.35), rot = st.tilt, z = 6, stroke = st.stroke + 1 })
			if e.rainbow then rainbow(tl1) end
			if e.sub then text(card, st, { name = "Sub", text = e.sub, size = UDim2.fromScale(0.7, 0.26), pos = UDim2.fromScale(0.5, 0.85), z = 6 }) end
			tw(sc, 0.35, { Scale = 1 }, Enum.EasingStyle.Back)
			ctx.after(e.time or 2, function()
				tw(sc, 0.25, { Scale = 0.6 }, Enum.EasingStyle.Quad, Enum.EasingDirection.In)
				ctx.after(0.25, function() card:Destroy() end)
			end)
		end
		if e.flash then ctx.flash(e.flash == true and "#FFFFFF" or e.flash, e.time or 0.3) end
		if e.shake then ctx.shake(e.shake, e.time) end
		if e.dim then ctx.dim(e.dim == true and st.dim or e.dim, e.time) end
		if e.letterbox ~= nil then ctx.letterbox(e.letterbox, e.time) end
		if e.fov then tw(cam, e.time or 0.5, { FieldOfView = e.fov }, Enum.EasingStyle.Sine) end
		if e.blur then
			local b = ctx.effect("BlurEffect", { Size = 0 })
			tw(b, e.time or 0.3, { Size = e.blur })
		end
		if type(e.color) == "table" then
			local cc = ctx.effect("ColorCorrectionEffect", { Brightness = 0, Contrast = 0, Saturation = 0, TintColor = C("#FFFFFF") })
			local goal = {}
			for k, v in pairs(e.color) do goal[k] = (k == "TintColor") and C(v) or v end
			tw(cc, e.time or 0.5, goal)
		end
		if e.vfx and vfx then
			local where = resolve(e.where) or e.where
			if where then pcall(vfx.play, e.vfx, where, e.opts) end
		end
		if e.tween then
			local o = resolve(e.tween)
			if o then tw(o, e.time or 1, e.goal or {}, Enum.EasingStyle[e.ease or "Sine"] or Enum.EasingStyle.Sine) end
		end
		if e.fire then
			if opts.onEvent then task.spawn(opts.onEvent, e.fire, e) end
			if tl.onEvent then task.spawn(tl.onEvent, e.fire, e) end
		end
		if e.finish then finish() end
	end
	for _, e in ipairs(tl.events or tl) do
		if type(e) == "table" then ctx.after(e.at or 0, function() runEvent(e) end) end
	end
	local total = Cutscene.duration(tl)
	if tl.autoFinish ~= false then ctx.after(total + (tl.tail or 0.15), finish) end
	-- safety net: never leave a player locked in a cutscene (claim screens wait at most maxHold seconds)
	task.delay(total + (opts.maxHold or 12), function() if not handle.done then finish() end end)
	conn = RunService.RenderStepped:Connect(function(dt)
		if handle.done then return end
		local t = now()
		local cf
		if camShots and cinema then
			local local_t = t - camStart
			local d = cinema.duration(camShots)
			local i, p = cinema.at(camShots, math.min(local_t, d - 1e-3))
			local fov
			cf, fov = cinema.cframe(camShots[i], p)
			cam.FieldOfView = fov
		elseif camHold then
			cf = camHold
		end
		if shakeAmp > 0 then
			if t > shakeEnd then shakeAmp = 0 else
				local k = shakeAmp * 0.9
				cf = (cf or cam.CFrame) * CFrame.Angles(math.rad((rand() - 0.5) * k), math.rad((rand() - 0.5) * k), math.rad((rand() - 0.5) * k * 0.5))
			end
		end
		if cf then cam.CFrame = cf end
		local keep = {}
		for _, fn in ipairs(frames) do
			local ok, fin = pcall(fn, t, dt)
			if ok and not fin then table.insert(keep, fn) elseif not ok then warn("BrickwireCutscene frame: " .. tostring(fin)) end
		end
		frames = keep
	end)
	return handle
end

-- ---------------------------------------------------------------- ready scenes
local function resultCard(parent, st, item, size)
	local R = Cutscene.rarity(item, st)
	local f = new("Frame", { Name = "Card", BackgroundColor3 = C("#1E1E28"), BorderSizePixel = 0, Size = size, ZIndex = 3 }, parent)
	new("UICorner", { CornerRadius = UDim.new(0.08, 0) }, f)
	local stroke = new("UIStroke", { Thickness = 3, Color = R.color }, f)
	if R.rainbow then rainbow(stroke) end
	new("UIGradient", { Rotation = 90, Color = ColorSequence.new(C("#2C2C3A"), R.color:Lerp(C("#1E1E28"), 0.55)) }, f)
	if item.icon then
		new("ImageLabel", { Name = "Icon", BackgroundTransparency = 1, Image = item.icon, Size = UDim2.fromScale(0.8, 0.6), Position = UDim2.fromScale(0.1, 0.06), ZIndex = 4 }, f)
	else
		text(f, st, { name = "Initial", text = string.upper(string.sub(tostring(item.name or "?"), 1, 1)), color = R.color, size = UDim2.fromScale(0.7, 0.5), pos = UDim2.fromScale(0.5, 0.36), z = 4 })
	end
	text(f, st, { name = "Name", text = tostring(item.name or "?"), size = UDim2.fromScale(0.92, 0.2), pos = UDim2.fromScale(0.5, 0.8), z = 4, stroke = 1.5 })
	new("Frame", { Name = "Bar", BackgroundColor3 = R.color, BorderSizePixel = 0, AnchorPoint = Vector2.new(0, 1), Position = UDim2.fromScale(0, 1), Size = UDim2.fromScale(1, 0.06), ZIndex = 4 }, f)
	return f, R
end
local function fillerPool(pool, result)
	if type(pool) == "table" and #pool > 0 then return pool end
	local t = {}
	for i, r in ipairs(Cutscene.RARITIES) do t[i] = { name = r, rarity = r } end
	if result then table.insert(t, result) end
	return t
end
local function weightedFiller(pool)
	-- filler cards look like a real drop table: commons often, rares seldom (cosmetic only)
	local best, bestW = pool[1], -1
	for _ = 1, 2 do
		local it = pool[math.random(1, #pool)]
		local w = 1 / Cutscene.tier(it) + math.random()
		if w > bestW then best, bestW = it, w end
	end
	return best
end
local function claim(ctx, opts, hold)
	ctx.revealed = true
	local done = false
	local function close() if not done then done = true ctx.finish() end end
	ctx.button(opts.claimText or "Claim", "#3CCB4A", UDim2.fromScale(opts.rollAgain and 0.41 or 0.5, 0.86), close)
	if opts.rollAgain then
		ctx.button(opts.rollAgainText or "Roll again", "#3DA5FF", UDim2.fromScale(0.59, 0.86), function()
			close()
			task.spawn(opts.rollAgain)
		end)
	end
	ctx.after(opts.autoClose or hold or 3, close)
end

-- CS-style case: a strip of cards slides and decelerates (quart/quint ease) onto the server's result.
function Cutscene.caseTimeline(result, opts)
	opts = opts or {}
	local st = styleOf(opts.style)
	local R = Cutscene.rarity(result, st)
	local spin = opts.spin or 3.8
	local pool = fillerPool(opts.pool, result)
	local N, W = opts.cards or 44, opts.winIndex or 38
	local hit = spin + R.pause
	local tl = { kind = "case", style = opts.style, serverResult = opts.serverResult, skip = opts.skip, events = {} }
	local E = tl.events
	table.insert(E, { at = 0, dim = st.dim + 0.15, time = 0.25, sound = "whoosh", run = function(ctx)
		local win = new("Frame", { Name = "CaseWindow", BackgroundColor3 = C("#14141C"), BackgroundTransparency = 0.1, ClipsDescendants = true, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.42), Size = UDim2.new(0.86, 0, 0, 170), ZIndex = 2 }, ctx.layer)
		new("UICorner", { CornerRadius = UDim.new(0, 14) }, win)
		new("UIStroke", { Thickness = 3, Color = C("#000000") }, win)
		local strip = new("Frame", { Name = "Strip", BackgroundTransparency = 1, AnchorPoint = Vector2.new(0, 0.5), Position = UDim2.new(0.5, 0, 0.5, 0), Size = UDim2.new(0, 1, 0, 150), ZIndex = 3 }, win)
		local cw, gap = opts.cardWidth or 130, 8
		local cards = {}
		for i = 1, N do
			local item = (i == W) and result or weightedFiller(pool)
			local c = resultCard(strip, st, item, UDim2.fromOffset(cw, 150))
			c.Position = UDim2.fromOffset((i - 1) * (cw + gap), 0)
			cards[i] = c
		end
		new("Frame", { Name = "Marker", BackgroundColor3 = C("#FFD24D"), BorderSizePixel = 0, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.new(0, 4, 1, 0), ZIndex = 6 }, win)
		local target = (W - 1) * (cw + gap) + cw / 2 + rand(-0.38, 0.38) * cw -- cosmetic landing offset inside the winning card
		local start, lastIdx = os.clock(), 0
		ctx.frame(function()
			local p = math.clamp((os.clock() - start) / spin, 0, 1)
			local x = Cutscene.ease(opts.ease or "quint", p) * target
			strip.Position = UDim2.new(0.5, -x, 0.5, 0)
			local idx = math.floor(x / (cw + gap))
			if idx ~= lastIdx then
				lastIdx = idx
				ctx.sound("tick", 0.35, 1 + 0.25 * p)
			end
			return p >= 1
		end)
		ctx.caseWinner = cards[W]
	end })
	table.insert(E, { at = hit - 0.05, key = true, sound = "reveal", volume = 0.8, flash = R.flash and R.color or nil, time = 0.3, shake = R.shake, run = function(ctx)
		if ctx.caseWinner then
			local s = new("UIScale", { Scale = 1 }, ctx.caseWinner)
			tw(s, 0.25, { Scale = 1.12 }, Enum.EasingStyle.Back)
		end
	end })
	table.insert(E, { at = hit + 0.25, time = 1.2, run = function(ctx)
		local win = ctx.layer:FindFirstChild("CaseWindow")
		if win then tw(win, 0.25, { Position = UDim2.fromScale(0.5, 0.18) }) end
		ctx.pop(result, { pos = UDim2.fromScale(0.5, 0.52) })
		if R.big then ctx.sound("hit", 0.7) end
	end })
	tl.autoFinish = false
	table.insert(E, { at = hit + 1.45, run = function(ctx) claim(ctx, opts, 2.5) end })
	tl.onSkip = function(ctx)
		ctx.dim(st.dim + 0.15, 0.1)
		ctx.pop(result)
		ctx.sound("reveal", 0.8)
		claim(ctx, opts, 1.5)
	end
	return tl
end

-- Egg hatch: push-in, wobbles that grow, cracks, flash, the pet pops out with rarity glow. results = item or { item, item, … }.
function Cutscene.eggTimeline(results, opts)
	opts = opts or {}
	if results.name or results.rarity then results = { results } end
	local st = styleOf(opts.style)
	local best = results[1]
	for _, r in ipairs(results) do if Cutscene.tier(r) > Cutscene.tier(best) then best = r end end
	local R = Cutscene.rarity(best, st)
	local wob = opts.wobble or 1.9
	local hit = 0.4 + wob + R.pause
	local tl = { kind = "egg", style = opts.style, serverResult = opts.serverResult, skip = opts.skip, autoFinish = false, events = {} }
	local E = tl.events
	local eggs = {}
	local function eggFolder()
		local f = workspace:FindFirstChild("BrickwireEggs")
		if not f then f = new("Folder", { Name = "BrickwireEggs" }, workspace) end
		return f
	end
	table.insert(E, { at = 0, dim = st.dim, time = 0.3, sound = "whoosh", fov = 52, run = function(ctx)
		local cam = ctx.cam
		local base = cam.CFrame
		ctx.hold(base)
		local n = #results
		local spacing = opts.spacing or 4.2
		local folder = eggFolder()
		for i, r in ipairs(results) do
			local offset = (i - (n + 1) / 2) * spacing
			local cf = base * CFrame.new(offset, -0.6, -(opts.distance or 10) - (n > 1 and 2 or 0))
			local egg = new("Part", { Name = "Egg" .. i, Shape = Enum.PartType.Ball, Size = Vector3.new(3, 3, 3), Anchored = true, CanCollide = false, CastShadow = false,
				Color = C(opts.eggColor or "#FFF4DC"), Material = Enum.Material.SmoothPlastic, CFrame = cf }, folder)
			new("SpecialMesh", { MeshType = Enum.MeshType.Sphere, Scale = Vector3.new(1, 1.28, 1) }, egg)
			local spots = new("PointLight", { Color = Cutscene.rarity(r, st).color, Range = 8, Brightness = 0 }, egg)
			eggs[i] = { part = egg, cf = cf, item = r, light = spots }
			ctx.owned["Egg" .. i] = egg
		end
		local start = os.clock()
		ctx.frame(function()
			local t = os.clock() - start
			if t > 0.4 + wob then return true end
			local p = math.clamp((t - 0.4) / wob, 0, 1)
			local amp = math.rad(4 + 22 * p * p)
			for i, e in ipairs(eggs) do
				if e.part.Parent then
					local a = math.sin((t + i * 0.13) * (9 + 12 * p)) * amp * (t > 0.4 and 1 or 0)
					e.part.CFrame = e.cf * CFrame.new(0, math.abs(a) * 0.6, 0) * CFrame.Angles(0, 0, a)
					e.light.Brightness = 3 * p
				end
			end
			return false
		end)
	end })
	for i, at in ipairs({ 0.4 + wob * 0.35, 0.4 + wob * 0.7, 0.4 + wob * 0.92 }) do
		table.insert(E, { at = at, sfx = "hit", volume = 0.4 + 0.15 * i, pitch = 0.9 + 0.1 * i, shake = 0.15 * i, time = 0.15, run = function()
			if i < 2 then return end
			for _, e in ipairs(eggs) do
				if e.part.Parent then
					local col = Cutscene.rarity(e.item, st).color
					for k = 1, i do
						new("Part", { Name = "Crack", Anchored = true, CanCollide = false, Material = Enum.Material.Neon, Color = col, Size = Vector3.new(0.12, 0.9, 0.12),
							CFrame = e.part.CFrame * CFrame.new(rand(-0.7, 0.7), rand(-0.5, 0.9), -1.45) * CFrame.Angles(0, 0, math.rad(rand(-60, 60))) }, e.part)
					end
				end
			end
		end })
	end
	table.insert(E, { at = hit, key = true, flash = "#FFFFFF", time = 0.35, shake = R.shake + 0.3, sound = "reveal", volume = 0.9, run = function(ctx)
		local vfx = lib("BrickwireVFX")
		for i, e in ipairs(eggs) do
			local pos = e.part.CFrame
			local Ri = Cutscene.rarity(e.item, st)
			if e.part.Parent then e.part:Destroy() end
			if vfx then pcall(vfx.play, Ri.tier >= 5 and "level_up" or (Ri.tier >= 3 and "magic_burst" or "confetti"), pos, { color = Ri.color, scale = 0.6 }) end
			local pet
			if opts.petModel then pet = opts.petModel(e.item) end
			local tpl = not pet and RS:FindFirstChild(opts.petsFolder or "Pets")
			if tpl then tpl = tpl:FindFirstChild(tostring(e.item.name)) end
			if tpl then pet = tpl:Clone() end
			if not pet then
				pet = new("Part", { Name = tostring(e.item.name), Shape = Enum.PartType.Ball, Size = Vector3.new(2.4, 2.4, 2.4), Anchored = true, CanCollide = false, Material = Enum.Material.Neon, Color = Ri.color })
			end
			pet.Parent = eggFolder()
			ctx.owned["Pet" .. i] = pet
			local root = pet:IsA("BasePart") and pet or pet:FindFirstChildWhichIsA("BasePart")
			if pet:IsA("Model") then pet:PivotTo(pos) elseif root then root.CFrame = pos end
			if root then
				new("PointLight", { Color = Ri.color, Range = 10 + Ri.tier * 2, Brightness = 2 + Ri.tier * 0.5 }, root)
				local pe = new("ParticleEmitter", { Texture = "rbxasset://textures/particles/sparkles_main.dds", Color = ColorSequence.new(Ri.color), LightEmission = 1,
					Size = NumberSequence.new(0.5, 0), Lifetime = NumberRange.new(0.6, 1.2), Rate = Ri.particles, Speed = NumberRange.new(2, 5), SpreadAngle = Vector2.new(180, 180) }, root)
				pe:Emit(math.min(Ri.particles, 120))
			end
			local spin = 0
			ctx.frame(function(_, dt)
				if not pet.Parent then return true end
				spin += (dt or 1 / 60) * 90
				local cf = pos * CFrame.Angles(0, math.rad(spin), 0)
				if pet:IsA("Model") then pet:PivotTo(cf) elseif root then root.CFrame = cf end
				return false
			end)
			if #results > 1 then
				local bb = new("BillboardGui", { Name = "BrickwirePetTag", Size = UDim2.fromOffset(160, 60), StudsOffset = Vector3.new(0, 2.6, 0), AlwaysOnTop = true, Adornee = root }, ctx.gui.Parent)
				ctx.owned["Tag" .. i] = bb
				text(bb, ctx.style, { text = tostring(e.item.name), size = UDim2.fromScale(1, 0.5), pos = UDim2.fromScale(0.5, 0.25), z = 2, stroke = 2 })
				local rl = text(bb, ctx.style, { text = Ri.name, color = Ri.color, size = UDim2.fromScale(1, 0.45), pos = UDim2.fromScale(0.5, 0.75), z = 2, stroke = 2 })
				if Ri.rainbow then rainbow(rl) end
			end
		end
	end })
	table.insert(E, { at = hit + 0.3, time = 1, run = function(ctx)
		if #results == 1 or R.big then ctx.pop(best, { pos = UDim2.fromScale(0.5, #results > 1 and 0.2 or 0.24) }) end
	end })
	table.insert(E, { at = hit + 1.3, run = function(ctx) claim(ctx, opts, 2) end })
	tl.onSkip = function(ctx)
		for _, e in ipairs(eggs) do if e.part.Parent then e.part:Destroy() end end
		ctx.pop(best)
		ctx.sound("reveal", 0.8)
		claim(ctx, opts, 1.5)
	end
	return tl
end

-- Anime Dice roll: a ticker above the player's head (odds "1 in N", portrait, name) cycles faster→slower and lands on the
-- server's result; Epic+ adds a screen reveal (dim, rays, "LEGENDARY!", shake, flash); Mythic+ fakes an ending first.
function Cutscene.diceTimeline(result, opts)
	opts = opts or {}
	local st = styleOf(opts.style)
	local R = Cutscene.rarity(result, st)
	local pool = fillerPool(opts.pool, result)
	local rollT = opts.rollTime or math.min(0.9 + 0.22 * R.tier, 2.6)
	local fake = R.fakeout and not opts.noFakeout
	local land = rollT + (fake and 0.85 or 0) + R.pause * 0.6
	local tl = { kind = "dice", style = opts.style, serverResult = opts.serverResult, skip = opts.skip, autoFinish = not R.big, events = {} }
	local E = tl.events
	local ui = {}
	local function show(item, ctx)
		local Ri = Cutscene.rarity(item, st)
		ui.odds.Text = item.odds and Cutscene.odds(item.odds) or ""
		ui.name.Text = (item.mutation and (item.mutation .. " ") or "") .. tostring(item.name or "?")
		ui.tile.BackgroundColor3 = Ri.color
		ui.initial.Text = item.icon and "" or string.upper(string.sub(tostring(item.name or "?"), 1, 1))
		ui.icon.Image = item.icon or ""
		ui.rarity.Text = Ri.name
		ui.rarity.TextColor3 = Ri.color
	end
	table.insert(E, { at = 0, sound = "whoosh", volume = 0.4, run = function(ctx)
		local head = character() and character():FindFirstChild("Head")
		local holder
		if head and opts.overhead ~= false then
			holder = new("BillboardGui", { Name = "BrickwireDiceRoll", Size = UDim2.fromOffset(200, 190), StudsOffset = Vector3.new(0, 3.6, 0), AlwaysOnTop = true, Adornee = head, ResetOnSpawn = false }, ctx.gui.Parent)
		else
			holder = new("Frame", { Name = "DiceRoll", BackgroundTransparency = 1, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.3), Size = UDim2.fromOffset(220, 210), ZIndex = 3 }, ctx.layer)
		end
		ctx.owned.DiceRoll = holder
		ui.root = new("Frame", { Name = "Ticker", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 3 }, holder)
		ui.scale = new("UIScale", { Scale = 1 }, ui.root)
		ui.odds = text(ui.root, st, { name = "Odds", text = "", size = UDim2.fromScale(0.8, 0.16), pos = UDim2.fromScale(0.5, 0.08), rot = st.tilt * 1.4, z = 4, stroke = 2.5 })
		ui.tile = new("Frame", { Name = "Portrait", BackgroundColor3 = C("#D2D2D2"), AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.44), Size = UDim2.fromScale(0.42, 0.44), ZIndex = 3 }, ui.root)
		new("UICorner", { CornerRadius = UDim.new(0.18, 0) }, ui.tile)
		new("UIStroke", { Thickness = 3, Color = C("#000000") }, ui.tile)
		ui.icon = new("ImageLabel", { Name = "Icon", BackgroundTransparency = 1, Image = "", Size = UDim2.fromScale(1, 1), ZIndex = 4 }, ui.tile)
		ui.initial = text(ui.tile, st, { name = "Initial", text = "", size = UDim2.fromScale(0.8, 0.8), z = 4 })
		ui.name = text(ui.root, st, { name = "UnitName", text = "", size = UDim2.fromScale(1, 0.17), pos = UDim2.fromScale(0.5, 0.77), z = 4, stroke = 2.5 })
		ui.rarity = text(ui.root, st, { name = "Rarity", text = "", size = UDim2.fromScale(0.8, 0.13), pos = UDim2.fromScale(0.5, 0.92), z = 4, stroke = 2 })
		local start, nextAt, k = os.clock(), 0, 0
		ctx.frame(function()
			local t = os.clock() - start
			if t >= rollT then return true end
			if t >= nextAt then
				k += 1
				local p = t / rollT
				nextAt = t + 0.05 + 0.3 * p * p -- fast → slow
				show(weightedFiller(pool), ctx)
				ui.scale.Scale = 1.08
				tw(ui.scale, 0.08, { Scale = 1 })
				ctx.sound("tick", 0.3, 0.9 + 0.5 * p)
			end
			return false
		end)
	end })
	if fake then
		-- fake ending: settles on something worse, holds, then the dice "kicks" to the real tier
		table.insert(E, { at = rollT, sfx = "hit", volume = 0.4, run = function(ctx)
			local worse = { name = (pool[1] and pool[1].name) or "Common", rarity = Cutscene.RARITIES[math.max(1, R.tier - 3)] }
			for _, it in ipairs(pool) do if Cutscene.tier(it) <= R.tier - 3 then worse = it break end end
			show(worse, ctx)
		end })
		table.insert(E, { at = rollT + 0.6, key = true, shake = 0.6, time = 0.3, sound = "whoosh", volume = 0.7, flash = R.color, run = function(ctx) ui.scale.Scale = 1.4 end })
	end
	table.insert(E, { at = land, key = true, sound = "reveal", volume = 0.5 + 0.06 * R.tier, shake = R.big and R.shake or nil, time = 0.35, flash = R.big and "#FFFFFF" or nil, run = function(ctx)
		show(result, ctx)
		if R.rainbow then rainbow(ui.rarity) end
		ui.scale.Scale = st.punch and 1.45 or 1.15
		tw(ui.scale, 0.3, { Scale = 1 }, Enum.EasingStyle.Back)
		if R.big then
			ctx.dim(st.dim, 0.2)
			ctx.pop(result, { pos = UDim2.fromScale(0.5, 0.45) })
			if st.speedLines then
				local lines = new("Frame", { Name = "SpeedLines", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 2 }, ctx.layer)
				for i = 1, 18 do
					local a = i / 18 * math.pi * 2
					new("Frame", { Name = "Line" .. i, BackgroundColor3 = C("#FFFFFF"), BackgroundTransparency = 0.35, BorderSizePixel = 0, AnchorPoint = Vector2.new(0.5, 0.5),
						Position = UDim2.fromScale(0.5 + math.cos(a) * 0.42, 0.5 + math.sin(a) * 0.42), Size = UDim2.new(0, 3, 0.35, 0), Rotation = math.deg(a) + 90, ZIndex = 2 }, lines)
				end
				ctx.after(0.5, function() lines:Destroy() end)
			end
		end
	end })
	if R.big then
		table.insert(E, { at = land + 0.4, time = 1.4, sfx = "hit", volume = 0.6 })
		table.insert(E, { at = land + 1.2, run = function(ctx) claim(ctx, opts, opts.auto and 1.2 or 2.2) end })
	else
		table.insert(E, { at = land + 0.2, time = opts.hold or 0.9 })
	end
	tl.onSkip = function(ctx)
		if not ui.root then ctx.finish() return end
		show(result, ctx)
		ctx.sound("reveal", 0.6)
		if R.big then ctx.pop(result) claim(ctx, opts, 1.4) else ctx.after(0.6, ctx.finish) end
	end
	return tl
end

-- Event start for everyone: countdown 3-2-1, letterbox, fly-over the event zone, "EVENT STARTED!" title.
function Cutscene.eventTimeline(opts)
	opts = opts or {}
	local st = styleOf(opts.style)
	local n = opts.countdown or 3
	local step = opts.step or 0.8
	local tl = { kind = "event", style = opts.style, skip = opts.skip, events = {} }
	local E = tl.events
	table.insert(E, { at = 0, letterbox = true, time = 0.4, sound = "whoosh", volume = 0.5 })
	for i = n, 1, -1 do
		local at = (n - i) * step
		table.insert(E, { at = at + 0.05, sfx = "tick", volume = 0.7, pitch = 1 + (n - i) * 0.12, run = function(ctx)
			local l = ctx.text({ name = "Count", text = tostring(i), font = st.titleFont, size = UDim2.fromScale(0.3, 0.3), pos = UDim2.fromScale(0.5, 0.45), color = opts.color or "#FFD24D", stroke = st.stroke + 2 })
			local s = new("UIScale", { Scale = 1.8 }, l)
			tw(s, step * 0.5, { Scale = 1 }, Enum.EasingStyle.Back)
			ctx.after(step * 0.9, function() l:Destroy() end)
		end })
	end
	local fly = n * step
	local zone = opts.zone
	local shots = opts.shots
	if not shots and zone then
		local cm = lib("BrickwireCinema")
		if cm then
			local ok, s = pcall(cm.auto, zone, "epic")
			if ok and type(s) == "table" and #s > 0 then
				shots = {}
				local budget = opts.flyTime or 5
				local m = math.min(#s, 2)
				local sum = 0
				for i = 1, m do sum += s[i].time or 3 end
				for i = 1, m do
					local c = table.clone(s[i])
					c.time = math.max(2, (s[i].time or 3) / sum * budget)
					c.cut = nil
					shots[i] = c
				end
			end
		end
	end
	if shots then table.insert(E, { at = fly, camera = shots, sound = "whoosh", volume = 0.6 }) end
	local cmL = lib("BrickwireCinema")
	local flyLen = shots and (cmL and cmL.duration(shots) or (opts.flyTime or 5)) or 0
	local titleAt = fly + math.max(flyLen - 2.2, 0.2)
	table.insert(E, { at = titleAt, key = true, title = opts.text or "EVENT STARTED!", sub = opts.name, color = opts.color or "#FFD24D", rainbow = opts.rainbow, time = 2.2, flash = "#FFFFFF", shake = 0.5, sound = "reveal", volume = 0.9 })
	if opts.music then table.insert(E, { at = 0, sound = opts.music, music = true, volume = 0.5, fadeIn = 0.8, fadeOut = 1, time = titleAt + 2.4 }) end
	table.insert(E, { at = titleAt + 2.3, letterbox = false, time = 0.4, fire = opts.fire or "EventStarted" })
	return tl
end

-- Back-story: 3–6 frames { shots = {…} | shot = {…}, text =, speaker =, time = } with dips to black, typed subtitles, music.
function Cutscene.storyTimeline(frames, opts)
	opts = opts or {}
	local tl = { kind = "story", style = opts.style, skip = opts.skip, letterbox = true, events = {} }
	local E = tl.events
	local at = 0
	for i, f in ipairs(frames) do
		local d = f.time or math.max(3.5, 1.2 + #(f.text or "") / 16)
		local shots = f.shots or (f.shot and { f.shot }) or nil
		if shots then
			local cm = lib("BrickwireCinema")
			local total = cm and cm.duration(shots) or d
			if total < d then shots = table.clone(shots) shots[#shots] = table.clone(shots[#shots]) shots[#shots].time = (shots[#shots].time or 3) + (d - total) end
		end
		table.insert(E, { at = at, camera = shots, run = function(ctx)
			if i > 1 then ctx.flash("#000000", 0.5) end
		end })
		if f.text then table.insert(E, { at = at + 0.3, say = f.text, speaker = f.speaker, time = d - 0.4 }) end
		if f.sound then table.insert(E, { at = at + 0.2, sound = f.sound }) end
		at += d
	end
	local music = opts.music or (Cutscene.SOUNDS.music ~= "" and Cutscene.SOUNDS.music) or nil
	table.insert(E, 1, { at = 0, sound = music or "whoosh", music = music ~= nil, volume = music and 0.45 or 0.5, fadeIn = 1.5, fadeOut = 1.2, time = at })
	if opts.title then table.insert(E, { at = math.max(at - 2.4, 0), title = opts.title, sub = opts.sub, time = 2.2, sound = "reveal", key = true }) end
	table.insert(E, { at = at, run = function(ctx) ctx.flash("#000000", 0.6) end })
	return tl
end

function Cutscene.caseOpen(result, opts) return Cutscene.play(Cutscene.caseTimeline(result, opts), opts) end
function Cutscene.eggHatch(results, opts) return Cutscene.play(Cutscene.eggTimeline(results, opts), opts) end
function Cutscene.diceRoll(result, opts) return Cutscene.play(Cutscene.diceTimeline(result, opts), opts) end
function Cutscene.eventStart(opts) return Cutscene.play(Cutscene.eventTimeline(opts), opts) end
function Cutscene.story(frames, opts) return Cutscene.play(Cutscene.storyTimeline(frames, opts), opts) end

-- Build a ready scene's timeline from network data (used by run/listen and by Cutscene.check / BW.cutsceneCheck).
function Cutscene.build(scene, data)
	data = data or {}
	local o = table.clone(data.opts or {})
	o.style = o.style or data.style
	o.pool = o.pool or data.pool
	o.serverResult = data.__server == true or o.serverResult
	if scene == "case" then return Cutscene.caseTimeline(data.result, o)
	elseif scene == "egg" then return Cutscene.eggTimeline(data.results or data.result, o)
	elseif scene == "dice" then return Cutscene.diceTimeline(data.result, o)
	elseif scene == "event" then o.zone = o.zone or data.zone o.name = o.name or data.name o.text = o.text or data.text return Cutscene.eventTimeline(o)
	elseif scene == "story" then o.title = o.title or data.title return Cutscene.storyTimeline(data.frames or {}, o)
	elseif scene == "timeline" then return data.timeline or data
	end
	error("BrickwireCutscene: unknown scene '" .. tostring(scene) .. "' (case, egg, dice, event, story, timeline)", 2)
end
function Cutscene.run(scene, data)
	local tl = Cutscene.build(scene, data)
	return Cutscene.play(tl, data and data.opts)
end

-- ---------------------------------------------------------------- networking
function Cutscene.remote()
	local r = RS:FindFirstChild("BrickwireCutsceneRemote")
	if r then return r end
	if RunService:IsClient() then return RS:WaitForChild("BrickwireCutsceneRemote", 15) end
	r = Instance.new("RemoteEvent")
	r.Name = "BrickwireCutsceneRemote"
	r.Parent = RS
	return r
end
-- SERVER: Cutscene.show(player | {players} | "all", scene, data). data.result must come from Cutscene.roll (server).
function Cutscene.show(who, scene, data)
	data = data or {}
	if RunService:IsClient() then return Cutscene.run(scene, data) end
	data.__server = true
	local r = Cutscene.remote()
	if who == nil or who == "all" then r:FireAllClients(scene, data)
	elseif type(who) == "table" and not (typeof(who) == "Instance") then for _, p in ipairs(who) do r:FireClient(p, scene, data) end
	else r:FireClient(who, scene, data) end
end
-- CLIENT: plays every scene the server sends. handlers[scene] = fn(data) overrides a scene. Returns the connection.
function Cutscene.listen(handlers)
	local r = Cutscene.remote()
	if not r then warn("BrickwireCutscene: no BrickwireCutsceneRemote — require the module on the server first") return nil end
	return r.OnClientEvent:Connect(function(scene, data)
		if handlers and handlers[scene] then handlers[scene](data) return end
		local ok, err = pcall(Cutscene.run, scene, data)
		if not ok then warn("BrickwireCutscene " .. tostring(scene) .. ": " .. tostring(err)) end
	end)
end
-- CLIENT → SERVER request (e.g. the ROLL button): Cutscene.request("roll", {dice = "Fire"})
function Cutscene.request(action, data)
	local r = Cutscene.remote()
	if r then r:FireServer(action, data) end
end
return Cutscene
]==]
	-- Installs/updates ReplicatedStorage.BrickwireCutscene (+ BrickwireCinema and BrickwireVFX it uses). Returns the ModuleScript.
	function BW.cutsceneLib()
		BW.cinemaLib()
		BW.vfxLib()
		local rs = game:GetService("ReplicatedStorage")
		local m = rs:FindFirstChild("BrickwireCutscene")
		if m and not m:IsA("ModuleScript") then fail("ReplicatedStorage.BrickwireCutscene exists and is not a ModuleScript") end
		if not m then
			m = Instance.new("ModuleScript")
			m.Name = "BrickwireCutscene"
			m:SetAttribute("BW_Owned", true)
			m.Parent = rs
		end
		if m.Source ~= CUTSCENE_SRC then m.Source = CUTSCENE_SRC end
		return m
	end
	BW._cutsceneSrc = CUTSCENE_SRC
	local function cutsceneModule()
		local m = BW.cutsceneLib()
		local c = m:Clone()
		c.Name = "BrickwireCutscene_edit"
		c.Parent = m.Parent
		local ok, mod = pcall(require, c)
		c:Destroy()
		if not ok then fail("could not require BrickwireCutscene: " .. tostring(mod)) end
		return mod
	end
	BW._cutsceneModule = cutsceneModule
	local SAMPLE = { Common = 2, Uncommon = 6, Rare = 30, Epic = 300, Legendary = 5000, Mythic = 250000, Secret = 10000000 }
	-- Quality gate. target = scene kind ("case" | "egg" | "dice" | "event" | "story": checks the ready scene for EVERY rarity),
	-- a timeline table, or nil (only the place scan). Also scans the place: reward rolled in a LocalScript, server shows scenes
	-- but no client listens, scenes without the module. Prints BW_CUT lines, returns { ok, issues, duration }.
	function BW.cutsceneCheck(target, opts)
		opts = opts or {}
		local Cut = cutsceneModule()
		local issues, worst = {}, 0
		local seen = {}
		local function add(s) if not seen[s] then seen[s] = true table.insert(issues, s) end end
		local function checkTl(tl, label)
			local r = Cut.check(tl, { kind = opts.kind or tl.kind, world = opts.world })
			worst = math.max(worst, r.duration)
			for _, s in ipairs(r.issues) do add((label and (label .. ": ") or "") .. s) end
		end
		if type(target) == "string" then
			local kind = target
			if kind == "case" or kind == "egg" or kind == "dice" then
				for _, rar in ipairs(Cut.RARITIES) do
					local item = { name = "Sample " .. rar, rarity = rar, odds = SAMPLE[rar] }
					checkTl(Cut.build(kind, { result = item, results = kind == "egg" and { item, item, item } or nil, __server = true, opts = opts.opts }), rar)
				end
			elseif kind == "event" then
				checkTl(Cut.build("event", { zone = opts.zone, name = "Event", opts = opts.opts }))
			elseif kind == "story" then
				checkTl(Cut.build("story", { frames = opts.frames or { { text = "Long ago…" }, { text = "A hero appeared." }, { text = "Now it is your turn." } }, opts = opts.opts }))
			else
				fail("BW.cutsceneCheck: unknown kind '" .. kind .. "' (case, egg, dice, event, story) or pass a timeline table")
			end
		elseif type(target) == "table" then
			checkTl(target)
		end
		-- place scan
		local shows, listens = {}, false
		for _, d in ipairs(game:GetDescendants()) do
			if d:IsA("LuaSourceContainer") and d.Name ~= "BrickwireCutscene" and d.Name ~= "BrickwireCinema" and d.Name ~= "BrickwireVFX" then
				local okS, s = pcall(function() return d.Source end)
				if okS and type(s) == "string" then
					local isClient = d:IsA("LocalScript") or (d:IsA("Script") and d:GetAttribute("RunContext") == "Client")
					if isClient and (string.find(s, "Cutscene.roll(", 1, true) or (string.find(s, "math.random", 1, true) and (string.find(s, "rarity", 1, true) or string.find(s, "chance", 1, true)) and string.find(s, "Cutscene", 1, true))) then
						add("reward rolled on the CLIENT in " .. d:GetFullName() .. " — exploitable; roll with Cutscene.roll in a server Script and Cutscene.show the result")
					end
					if string.find(s, "Cutscene.show(", 1, true) and not isClient then table.insert(shows, d:GetFullName()) end
					if isClient and (string.find(s, "Cutscene.listen(", 1, true) or string.find(s, "OnClientEvent", 1, true)) then listens = true end
				end
			end
		end
		if #shows > 0 and not listens then add("server shows cutscenes (" .. shows[1] .. ") but no LocalScript calls Cutscene.listen() — add BW.kit(\"case_opening\") or a client with Cutscene.listen()") end
		local r = { ok = #issues == 0, issues = issues, duration = worst }
		print(string.format("BW_CUT %s %s duration=%.1fs issues=%d", r.ok and "OK" or "ISSUES", type(target) == "string" and target or (type(target) == "table" and "timeline" or "place"), worst, #issues))
		for _, s in ipairs(issues) do print("BW_CUT  - " .. s) end
		return r
	end
	local CUT_CLIENT_SRC = [==[
-- Brickwire cutscene client (StarterPlayerScripts): plays every scene the server sends — case, egg, dice, event, story.
-- Look: Cutscene.defaultStyle = "animedice" | "clean". The dice ROLL / AUTO buttons appear when this script has attribute DiceUI = true.
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local Cutscene = require(RS:WaitForChild("BrickwireCutscene"))
Cutscene.defaultStyle = {{STYLE}}
local player = Players.LocalPlayer
local auto, busy = false, false
local autoBtn
local function roll()
	if busy then return end
	busy = true
	Cutscene.request("roll")
	task.delay(8, function() busy = false end)
end
local handlers = {}
function handlers.dice(data)
	data.opts = data.opts or {}
	data.opts.auto = auto
	data.opts.rollAgain = roll
	data.opts.onDone = function()
		busy = false
		if auto then task.delay(0.2, roll) end
	end
	local ok, err = pcall(Cutscene.run, "dice", data)
	if not ok then busy = false warn("dice: " .. tostring(err)) end
end
Cutscene.listen(handlers)
if script:GetAttribute("DiceUI") then
	local gui = Instance.new("ScreenGui")
	gui.Name = "BrickwireDiceUI"
	gui.ResetOnSpawn = false
	local function button(name, label, color, x, w)
		local b = Instance.new("TextButton")
		b.Name = name
		b.Text = label
		b.Font = Enum.Font.FredokaOne
		b.TextScaled = true
		b.TextColor3 = Color3.new(1, 1, 1)
		b.BackgroundColor3 = Color3.fromHex(color)
		b.AnchorPoint = Vector2.new(0.5, 1)
		b.Position = UDim2.new(x, 0, 1, -24)
		b.Size = UDim2.new(w, 0, 0.09, 0)
		local c = Instance.new("UICorner")
		c.CornerRadius = UDim.new(0.3, 0)
		c.Parent = b
		local s = Instance.new("UIStroke")
		s.Thickness = 3
		s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
		s.Parent = b
		local ts = Instance.new("UIStroke")
		ts.Thickness = 2.5
		ts.Parent = b
		local lim = Instance.new("UISizeConstraint")
		lim.MinSize = Vector2.new(110, 46)
		lim.Parent = b
		b.Parent = gui
		return b
	end
	local rollBtn = button("Roll", "ROLL", "#7B4DFF", 0.5, 0.16)
	autoBtn = button("Auto", "AUTO: OFF", "#3A3A4A", 0.66, 0.12)
	rollBtn.Activated:Connect(roll)
	autoBtn.Activated:Connect(function()
		auto = not auto
		autoBtn.Text = auto and "AUTO: ON" or "AUTO: OFF"
		autoBtn.BackgroundColor3 = Color3.fromHex(auto and "#3CCB4A" or "#3A3A4A")
		if auto then roll() end
	end)
	gui.Parent = player:WaitForChild("PlayerGui")
end
]==]
	-- the one client listener every cutscene kit shares (idempotent); diceUI adds the ROLL / AUTO buttons
	local function cutsceneClient(o, diceUI)
		BW.cutsceneLib()
		local sps = game:GetService("StarterPlayer"):FindFirstChild("StarterPlayerScripts")
		local old = sps and sps:FindFirstChild("BrickwireCutsceneClient")
		local hadDice = old and old:GetAttribute("DiceUI") == true
		local s = BW.script("LocalScript", "BrickwireCutsceneClient", "StarterPlayer.StarterPlayerScripts", src(CUT_CLIENT_SRC, { STYLE = o.style or "animedice" }))
		s:SetAttribute("DiceUI", diceUI or hadDice or false)
		return s
	end
	local CUT_SERVER_HEAD = [==[
local Players = game:GetService("Players")
local RS = game:GetService("ReplicatedStorage")
local Cutscene = require(RS:WaitForChild("BrickwireCutscene"))
local function find(path)
	local cur = game
	for seg in string.gmatch(path, "[^%.]+") do
		if cur == game and seg == "Workspace" then cur = workspace else cur = cur and cur:WaitForChild(seg, 20) end
	end
	return cur ~= game and cur or nil
end
local PRICE, CURRENCY = {{PRICE}}, {{CURRENCY}}
-- pays PRICE of leaderstats[CURRENCY] (free when PRICE = 0 or the stat does not exist)
local function pay(player)
	if PRICE <= 0 then return true end
	local ls = player:FindFirstChild("leaderstats")
	local stat = ls and ls:FindFirstChild(CURRENCY)
	if not stat then return true end
	if stat.Value < PRICE then return false end
	stat.Value -= PRICE
	return true
end
-- gives the reward (Inventory folder of StringValues; plug in your own inventory / DataStore here)
local function grant(player, item)
	local inv = player:FindFirstChild("Inventory")
	if not inv then
		inv = Instance.new("Folder")
		inv.Name = "Inventory"
		inv.Parent = player
	end
	local v = Instance.new("StringValue")
	v.Name = (item.mutation and (item.mutation .. " ") or "") .. item.name
	v.Value = item.rarity
	v.Parent = inv
end
local busy = setmetatable({}, { __mode = "k" })
]==]
	local CASE_SERVER_SRC = [==[
-- Brickwire case opening (server). The reward is rolled HERE (Cutscene.roll); the client only plays the animation.
-- Edit POOL (chance = drop weight), PRICE / CURRENCY. Player attribute Luck (number) boosts rare drops.
]==] .. CUT_SERVER_HEAD .. [==[
local POOL = {{POOL}}
local prompt = find({{PROMPT}})
prompt.Triggered:Connect(function(player)
	if not player or busy[player] then return end
	if not pay(player) then return end
	busy[player] = true
	local item = Cutscene.roll(POOL, { luck = player:GetAttribute("Luck") or 1 })
	grant(player, item) -- grant BEFORE the animation: leaving mid-scene never loses the reward
	Cutscene.show(player, "case", { result = item, pool = POOL })
	task.delay(6.5, function() busy[player] = nil end)
end)
]==]
	local EGG_SERVER_SRC = [==[
-- Brickwire egg hatching (server). Pets are rolled HERE; the client only plays the hatch. Two prompts: Hatch and Hatch x3.
]==] .. CUT_SERVER_HEAD .. [==[
local POOL = {{POOL}}
local function hatch(player, n)
	if not player or busy[player] then return end
	if not pay(player) then return end
	busy[player] = true
	local items = {}
	for i = 1, n do
		if i > 1 and not pay(player) then break end
		items[i] = Cutscene.roll(POOL, { luck = player:GetAttribute("Luck") or 1 })
		grant(player, items[i])
	end
	Cutscene.show(player, "egg", { results = items, pool = POOL })
	task.delay(5.5, function() busy[player] = nil end)
end
find({{PROMPT}}).Triggered:Connect(function(player) hatch(player, 1) end)
local triple = find({{PROMPT3}})
if triple then triple.Triggered:Connect(function(player) hatch(player, 3) end) end
]==]
	local DICE_SERVER_SRC = [==[
-- Brickwire dice roll in the style of Anime Dice (server). The ROLL button asks, the server rolls (odds = "1 in N"),
-- applies a random mutation, grants, then the client shows the ticker above the head. Player attribute Luck boosts rares.
]==] .. CUT_SERVER_HEAD .. [==[
local POOL = {{POOL}}
local MUTATIONS = {{MUTATIONS}} -- { name, odds } — e.g. Gold 1 in 50 multiplies the shown odds
local COOLDOWN = {{COOLDOWN}}
local last = setmetatable({}, { __mode = "k" })
local remote = Cutscene.remote()
remote.OnServerEvent:Connect(function(player, action)
	if action ~= "roll" then return end
	local now = os.clock()
	if last[player] and now - last[player] < COOLDOWN then return end
	last[player] = now
	if not pay(player) then return end
	local item = Cutscene.roll(POOL, { luck = player:GetAttribute("Luck") or 1 })
	for _, m in ipairs(MUTATIONS) do
		if math.random() < 1 / m[2] then
			item.mutation = m[1]
			item.odds = item.odds * m[2]
			break
		end
	end
	grant(player, item)
	Cutscene.show(player, "dice", { result = item, pool = POOL })
end)
]==]
	local EVENT_SERVER_SRC = [==[
-- Brickwire event start (server): countdown, fly-over of the zone and "EVENT STARTED!" for EVERY player.
-- Start it: set this script's attribute Start = true (from any server code), or every EVERY seconds (0 = manual only).
]==] .. CUT_SERVER_HEAD .. [==[
local ZONE, NAME, EVERY, DURATION = {{ZONE}}, {{NAME}}, {{EVERY}}, {{DURATION}}
local running = false
local function start()
	if running then return end
	running = true
	workspace:SetAttribute("EventActive", true)
	Cutscene.show("all", "event", { zone = ZONE, name = NAME })
	task.delay(DURATION, function()
		workspace:SetAttribute("EventActive", false)
		running = false
	end)
end
script:GetAttributeChangedSignal("Start"):Connect(function()
	if script:GetAttribute("Start") then
		script:SetAttribute("Start", false)
		start()
	end
end)
if EVERY > 0 then
	task.spawn(function()
		while true do
			task.wait(EVERY)
			start()
		end
	end)
end
]==]
	local STORY_SERVER_SRC = [==[
-- Brickwire back-story (server): plays the story to a player on their FIRST visit only (remembered in a DataStore).
-- Edit FRAMES: { shots = {BrickwireCinema shots}, text = "subtitle", speaker = "Name", time = seconds }. Replay: player attribute ReplayStory = true.
]==] .. CUT_SERVER_HEAD .. [==[
local FRAMES, TITLE, SUB = {{FRAMES}}, {{TITLE}}, {{SUB}}
local KEY = "story_v1_"
local store
pcall(function() store = game:GetService("DataStoreService"):GetDataStore("BrickwireCutscenes") end)
local function seen(player)
	if not store then return player:GetAttribute("StorySeen") == true end
	local ok, v = pcall(function() return store:GetAsync(KEY .. player.UserId) end)
	return ok and v == true
end
local function remember(player)
	player:SetAttribute("StorySeen", true)
	if store then pcall(function() store:SetAsync(KEY .. player.UserId, true) end) end
end
local function play(player)
	if not player.Character then player.CharacterAdded:Wait() end
	task.wait(1.5)
	Cutscene.show(player, "story", { frames = FRAMES, title = TITLE, opts = { sub = SUB } })
	remember(player)
end
local function joined(player)
	if not seen(player) then task.spawn(play, player) end
	player:GetAttributeChangedSignal("ReplayStory"):Connect(function()
		if player:GetAttribute("ReplayStory") then player:SetAttribute("ReplayStory", false) task.spawn(play, player) end
	end)
end
Players.PlayerAdded:Connect(joined)
for _, p in ipairs(Players:GetPlayers()) do joined(p) end
]==]
	local CASE_POOL = {
		{ name = "Wooden Sword", rarity = "Common", chance = 0.45 }, { name = "Iron Blade", rarity = "Uncommon", chance = 0.28 },
		{ name = "Frost Katana", rarity = "Rare", chance = 0.15 }, { name = "Shadow Scythe", rarity = "Epic", chance = 0.08 },
		{ name = "Solar Lance", rarity = "Legendary", chance = 0.03 }, { name = "Void Reaper", rarity = "Mythic", chance = 0.009 },
		{ name = "Celestial Edge", rarity = "Secret", chance = 0.001 },
	}
	local EGG_POOL = {
		{ name = "Dog", rarity = "Common", chance = 0.4 }, { name = "Cat", rarity = "Uncommon", chance = 0.3 }, { name = "Bunny", rarity = "Rare", chance = 0.17 },
		{ name = "Fox", rarity = "Epic", chance = 0.09 }, { name = "Dragonling", rarity = "Legendary", chance = 0.035 }, { name = "Phoenix", rarity = "Mythic", chance = 0.0045 },
		{ name = "Galaxy Kitsune", rarity = "Secret", chance = 0.0005 },
	}
	local DICE_POOL = {
		{ name = "Ninja Rookie", rarity = "Common", odds = 2 }, { name = "Flame Fist", rarity = "Uncommon", odds = 6 }, { name = "Storm Samurai", rarity = "Rare", odds = 30 },
		{ name = "Spirit Monk", rarity = "Epic", odds = 300 }, { name = "Sky Emperor", rarity = "Legendary", odds = 5000 }, { name = "Void King", rarity = "Mythic", odds = 250000 },
		{ name = "Chrono God", rarity = "Secret", odds = 10000000 },
	}
	local function pedestal(m, x, y, z, color)
		BW.cylinder{ Name = "Pedestal", At = { x, y, z }, height = 2.5, diameter = 8, Color = "#2B2B3A", Material = "Slate", Parent = m }
		BW.cylinder{ Name = "Ring", At = { x, y + 2.5, z }, height = 0.3, diameter = 8.4, Color = color, Material = "Neon", Parent = m }
		return y + 2.8
	end
	local function prompt(part, action, object, key)
		local p = BW.new("ProximityPrompt", { Name = key or "Prompt", ActionText = action, ObjectText = object, HoldDuration = 0.3, MaxActivationDistance = 12, Parent = part })
		return p
	end
	K("case_opening", function(o)
		local x, y, z = base(o)
		local m = model(o, "CaseOpening")
		local top = pedestal(m, x, y, z, o.Color or "#FFC727")
		local case = BW.part{ Name = "Case", Size = { 4, 2.6, 3 }, At = { x, top, z }, Color = o.Color or "#FFC727", Material = "SmoothPlastic", Parent = m }
		BW.part{ Name = "Lid", Size = { 4.2, 0.6, 3.2 }, At = { x, top + 2.6, z }, Color = "#3A2A10", Material = "Metal", Parent = m }
		BW.part{ Name = "Lock", Size = { 0.8, 0.8, 0.3 }, Position = { x, top + 1.8, z + 1.55 }, Color = "#FFFFFF", Material = "Neon", Parent = m }
		BW.particles(case, "sparkles", { Rate = 6, Color = o.Color or "#FFE27A" })
		local pr = prompt(case, "Open", o.title or "Case", "OpenPrompt")
		BW.cutsceneLib()
		local s = BW.script("Script", o.scriptName or "BrickwireCaseServer", "ServerScriptService", src(CASE_SERVER_SRC, { PRICE = o.price or 0, CURRENCY = o.currency or "Coins", PROMPT = pr:GetFullName(), POOL = "__POOL__" }))
		s.Source = string.gsub(s.Source, '"__POOL__"', function() return lit(o.pool or CASE_POOL) end)
		cutsceneClient(o)
		return m
	end)
	K("egg_hatch", function(o)
		local x, y, z = base(o)
		local m = model(o, "EggHatch")
		local top = pedestal(m, x, y, z, o.Color or "#B14CFF")
		local egg = BW.part{ Name = "Egg", Shape = "Ball", Size = { 4, 4, 4 }, Position = { x, top + 2.6, z }, Color = o.eggColor or "#FFF4DC", Material = "SmoothPlastic", Parent = m }
		BW.new("SpecialMesh", { MeshType = Enum.MeshType.Sphere, Scale = Vector3.new(1, 1.28, 1), Parent = egg })
		BW.particles(egg, "sparkles", { Rate = 5, Color = o.Color or "#D9A8FF" })
		local p1 = prompt(egg, "Hatch", o.title or "Egg", "HatchPrompt")
		local p3 = prompt(egg, "Hatch x3", o.title or "Egg", "Hatch3Prompt")
		p3.KeyboardKeyCode = Enum.KeyCode.R
		p3.UIOffset = Vector2.new(0, 70)
		BW.cutsceneLib()
		local s = BW.script("Script", o.scriptName or "BrickwireEggServer", "ServerScriptService", src(EGG_SERVER_SRC, { PRICE = o.price or 0, CURRENCY = o.currency or "Coins", PROMPT = p1:GetFullName(), PROMPT3 = p3:GetFullName(), POOL = "__POOL__" }))
		s.Source = string.gsub(s.Source, '"__POOL__"', function() return lit(o.pool or EGG_POOL) end)
		cutsceneClient(o)
		return m
	end)
	K("dice_roll", function(o)
		local x, y, z = base(o)
		local m = model(o, "DiceRoll")
		local top = pedestal(m, x, y, z, o.Color or "#7B4DFF")
		local die = BW.part{ Name = "Die", Size = { 4, 4, 4 }, At = { x, top + 0.5, z }, Color = "#FFFFFF", Material = "SmoothPlastic", Parent = m }
		for i, p in ipairs({ { 0, 0 }, { -1.1, -1.1 }, { 1.1, 1.1 }, { -1.1, 1.1 }, { 1.1, -1.1 } }) do
			BW.part{ Name = "Pip" .. i, Shape = "Ball", Size = { 0.7, 0.7, 0.7 }, Position = { x + p[1], top + 2.5 + p[2], z + 2 }, Color = "#1E1E28", Material = "SmoothPlastic", Parent = m }
		end
		BW.animate(die, "hover", { height = 0.6, speed = 60 })
		BW.cutsceneLib()
		local mut = o.mutations or { { "Titanic", 1000 }, { "Huge", 200 }, { "Gold", 50 }, { "Silver", 10 } }
		local s = BW.script("Script", o.scriptName or "BrickwireDiceServer", "ServerScriptService", src(DICE_SERVER_SRC, { PRICE = o.price or 0, CURRENCY = o.currency or "Coins", COOLDOWN = o.cooldown or 0.6, POOL = "__POOL__", MUTATIONS = "__MUT__" }))
		s.Source = string.gsub(s.Source, '"__POOL__"', function() return lit(o.pool or DICE_POOL) end)
		s.Source = string.gsub(s.Source, '"__MUT__"', function() return lit(mut) end)
		cutsceneClient(o, true)
		return m
	end)
	K("event_start", function(o)
		local x, y, z = base(o)
		local m = model(o, "EventStart")
		local zone = o.zone
		if not zone then
			local size = o.size or 60
			local pad = BW.part{ Name = "EventZone", Size = { size, 0.4, size }, At = { x, y, z }, Color = o.Color or "#FF3D6E", Material = "Neon", Transparency = 0.6, CanCollide = false, Parent = m }
			BW.part{ Name = "Beacon", Size = { 3, 30, 3 }, At = { x, y, z }, Color = o.Color or "#FF3D6E", Material = "Neon", Transparency = 0.3, CanCollide = false, Parent = m }
			BW.particles(pad, "sparkles", { Rate = 20, Color = o.Color or "#FF8FB0" })
			zone = m:GetFullName()
		elseif typeof(zone) == "Instance" then
			zone = zone:GetFullName()
		end
		BW.cutsceneLib()
		BW.script("Script", o.scriptName or "BrickwireEventServer", "ServerScriptService", src(EVENT_SERVER_SRC, { PRICE = 0, CURRENCY = "Coins", ZONE = zone, NAME = o.title or "Meteor Shower", EVERY = o.every or 0, DURATION = o.duration or 120 }))
		cutsceneClient(o)
		return m
	end)
	K("story_intro", function(o)
		local x, y, z = base(o)
		local m = model(o, "StoryIntro")
		local target = o.target
		if not target then
			BW.cylinder{ Name = "Plinth", At = { x, y, z }, height = 2, diameter = 14, Color = "#3A3550", Material = "Slate", Parent = m }
			local crystal = BW.part{ Name = "Crystal", Size = { 3, 9, 3 }, At = { x, y + 2, z }, Color = "#9B7BFF", Material = "Neon", Parent = m }
			BW.light(crystal, "PointLight", { Color = "#9B7BFF", Range = 26, Brightness = 2 })
			target = m
		end
		local path = typeof(target) == "Instance" and target:GetFullName() or target
		local shots = BW.shots(path, "intro")
		local lines = o.lines or { "Long ago, the crystal held this world together…", "Then it cracked, and the dark spirits came.", "Only a hero who rolls fate itself can restore it.", "Your story starts now." }
		local frames = {}
		for i, line in ipairs(lines) do
			local shot = shots[((i - 1) % #shots) + 1]
			frames[i] = { shots = { shot }, text = line, speaker = o.speaker, time = math.max(4, 1.5 + #line / 16) }
		end
		BW.cutsceneLib()
		local s = BW.script("Script", o.scriptName or "BrickwireStoryServer", "ServerScriptService", src(STORY_SERVER_SRC, { PRICE = 0, CURRENCY = "Coins", FRAMES = "__FRAMES__", TITLE = o.title or "THE BROKEN CRYSTAL", SUB = o.sub or "Chapter 1" }))
		s.Source = string.gsub(s.Source, '"__FRAMES__"', function() return lit(frames) end)
		cutsceneClient(o)
		return m
	end)
	local CUT_PLAY_SRC = [==[
-- Brickwire cutscene (client): plays the timeline below with BrickwireCutscene. Events: camera, say/speaker, title/sub,
-- sound/music, vfx/where, tween/goal, shake, flash, fov, blur, color, dim, letterbox, fire — see ReplicatedStorage.BrickwireCutscene.
local Players = game:GetService("Players")
local Cutscene = require(game:GetService("ReplicatedStorage"):WaitForChild("BrickwireCutscene"))
local TIMELINE = {{TIMELINE}}
local MODE, TRIGGER, ONCE = {{MODE}}, {{TRIGGER}}, {{ONCE}}
local player = Players.LocalPlayer
if MODE == "join" then
	if not game:IsLoaded() then game.Loaded:Wait() end
	task.wait(1)
	Cutscene.play(TIMELINE)
elseif MODE == "trigger" then
	local part = Cutscene.resolve(TRIGGER)
	local playing, seen = false, false
	if part then
		part.Touched:Connect(function(hit)
			if playing or (ONCE and seen) then return end
			local char = player.Character
			if not char or not hit:IsDescendantOf(char) then return end
			playing, seen = true, true
			Cutscene.play(TIMELINE, { onDone = function() playing = false end })
		end)
	end
end
]==]
	-- Writes a LocalScript that plays a custom timeline. opts: timeline = { events = {…}, style = } (plain data, no functions),
	-- mode = "join" | "trigger", trigger = part, once (true), Name. Runs BW.cutsceneCheck on it.
	function BW.cutscene(opts)
		opts = opts or {}
		local tl = opts.timeline or (opts.events and { events = opts.events, style = opts.style })
		if type(tl) ~= "table" then fail("BW.cutscene needs timeline = { events = { … } }") end
		BW.cutsceneLib()
		local mode = opts.mode or "join"
		if mode ~= "join" and mode ~= "trigger" then fail("mode must be join or trigger (server-driven scenes: Cutscene.show from a Script)") end
		local s = BW.script("LocalScript", opts.Name or "BrickwireTimeline", "StarterPlayer.StarterPlayerScripts", src(CUT_PLAY_SRC, {
			MODE = mode, TRIGGER = typeof(opts.trigger) == "Instance" and opts.trigger:GetFullName() or opts.trigger or "Workspace.CutsceneTrigger", ONCE = opts.once ~= false, TIMELINE = "__TL__",
		}))
		s.Source = string.gsub(s.Source, '"__TL__"', function() return lit(tl) end)
		local okC, rep = pcall(BW.cutsceneCheck, tl, { kind = opts.kind })
		print("BW_CUTSCENE " .. mode .. " → " .. s:GetFullName() .. string.format(" events=%d duration=%.1fs", #(tl.events or tl), okC and rep.duration or 0))
		return s
	end
	K("elevator", function(o)
		local x, y, z = base(o)
		local m = model(o, "Elevator")
		local h = o.height or 24
		for i, p in ipairs({ { -4, -4 }, { 4, -4 }, { -4, 4 }, { 4, 4 } }) do box(m, "Rail" .. i, x + p[1] - 0.3, y, z + p[2] - 0.3, x + p[1] + 0.3, y + h + 2, z + p[2] + 0.3, "#9E9E9E", "Metal") end
		local plat = box(m, "Platform", x - 3.6, y, z - 3.6, x + 3.6, y + 0.8, z + 3.6, "#FFC107", "DiamondPlate")
		box(m, "TopDeck", x + 4.5, y + h, z - 4, x + 14, y + h + 0.8, z + 4, "#9E9E9E", "Concrete")
		BW.animate(plat, "slide", { offset = { 0, h, 0 }, period = o.period or 8 })
		return m
	end)
	K("windmill", function(o)
		local x, y, z = base(o)
		local m = model(o, "Windmill")
		local h = o.height or 22
		BW.cylinder{ Name = "Tower", At = { x, y, z }, height = h, diameter = 8, Color = "#F5F0E6", Material = "Brick", Parent = m }
		BW.roof{ Name = "Cap", At = { x, y + h, z }, Size = { 8, 8 }, style = "gable", height = 4, overhang = 0.5, Color = "#8B4513", Material = "WoodPlanks", Parent = m }
		local hub = BW.part{ Name = "Hub", Shape = "Cylinder", Size = { 1.2, 2, 2 }, Position = { x, y + h - 2, z + 4.6 }, Orientation = { 0, 90, 0 }, Color = "#5A3A1E", Material = "Wood", Parent = m }
		local blades = group("Blades", { Parent = m })
		hub.Parent = blades
		for i = 0, 3 do
			local a = i * 90
			local rad = math.rad(a)
			BW.part{ Name = "Blade" .. i, Size = { 1.6, 11, 0.3 }, Position = { x + math.cos(rad + math.pi / 2) * 6, y + h - 2 + math.sin(rad + math.pi / 2) * 6, z + 5.2 }, Orientation = { 0, 0, a }, Color = "#EDE3CF", Material = "Fabric", Parent = blades }
		end
		blades.PrimaryPart = hub
		BW.animate(blades, "spin", { speed = o.speed or 40, axis = "Z" })
		return m
	end)
	K("ferris_wheel", function(o)
		local x, y, z = base(o)
		local m = model(o, "FerrisWheel")
		local r = o.radius or 20
		local cy = y + r + 4
		for _, sx in ipairs({ -3, 3 }) do
			BW.wall({ x - 8, y, z + sx }, { x, cy, z + sx }, { Name = "LegA", height = 1, thickness = 1, Color = "#ECEFF1", Material = "Metal", Parent = m })
		end
		for i, sx in ipairs({ -3, 3 }) do
			box(m, "Support" .. i, x - 0.6, y, z + sx - 0.6, x + 0.6, cy, z + sx + 0.6, "#ECEFF1", "Metal")
		end
		local wheel = group("Wheel", { Parent = m })
		local hub = BW.part{ Name = "Hub", Shape = "Cylinder", Size = { 7, 3, 3 }, Position = { x, cy, z }, Orientation = { 0, 90, 0 }, Color = "#B0BEC5", Material = "Metal", Parent = wheel }
		local n = o.cabins or 8
		local colors = { "#FF5E5B", "#FFB400", "#00C49A", "#2E86DE", "#A55EEA", "#FF6B81" }
		for i = 0, n - 1 do
			local a = (i / n) * math.pi * 2
			BW.part{ Name = "Spoke" .. i, Size = { 0.5, r, 0.5 }, Position = { x + math.cos(a) * r / 2, cy + math.sin(a) * r / 2, z }, Orientation = { 0, 0, math.deg(a) - 90 }, Color = "#ECEFF1", Material = "Metal", Parent = wheel }
			BW.part{ Name = "Cabin" .. i, Size = { 3, 3, 4 }, Position = { x + math.cos(a) * r, cy + math.sin(a) * r - 2, z }, Color = colors[i % #colors + 1], Material = "SmoothPlastic", Parent = wheel }
		end
		wheel.PrimaryPart = hub
		BW.animate(wheel, "spin", { speed = o.speed or 10, axis = "Z" })
		return m
	end)
	K("guard_npc", function(o)
		local x, y, z = base(o)
		local npc = BW.rig(o.Name or "Guard", { Position = { x, y + 3, z }, DisplayName = o.title or "Guard", Parent = o.Parent })
		local pts = o.points or { { x, y + 3, z }, { x + 20, y + 3, z }, { x + 20, y + 3, z + 20 }, { x, y + 3, z + 20 } }
		BW.patrol(npc, pts, { speed = o.speed or 8, pause = 1 })
		return npc
	end)
	K("dancer_npc", function(o)
		local x, y, z = base(o)
		local npc = BW.rig(o.Name or "Dancer", { Position = { x, y + 3, z }, Facing = o.Facing or 0, DisplayName = o.title or "Dancer", Parent = o.Parent })
		BW.playAnim(npc, o.dance or "dance", { loop = true })
		return npc
	end)
	K("auto_door", function(o)
		local x, y, z = base(o)
		local m = model(o, "AutoDoor")
		box(m, "FrameL", x - 4, y, z - 0.6, x - 3, y + 9, z + 0.6, "#455A64", "Metal")
		box(m, "FrameR", x + 3, y, z - 0.6, x + 4, y + 9, z + 0.6, "#455A64", "Metal")
		box(m, "FrameTop", x - 4, y + 8, z - 0.6, x + 4, y + 9, z + 0.6, "#455A64", "Metal")
		local door = box(m, "Door", x - 3, y, z - 0.25, x + 3, y + 8, z + 0.25, "#90CAF9", "Glass", { Transparency = 0.3 })
		BW.door(door, { mode = "slide", offset = { 6, 0, 0 }, time = 0.5, autoClose = 3 })
		return m
	end)
	K("flag", function(o)
		local x, y, z = base(o)
		local m = model(o, "Flag")
		BW.cylinder{ Name = "Pole", At = { x, y, z }, height = 16, diameter = 0.5, Color = "#BDBDBD", Material = "Metal", Parent = m }
		local f = box(m, "Cloth", x + 0.25, y + 11, z - 0.05, x + 6.25, y + 15, z + 0.05, o.Color or "#E53935", "Fabric")
		BW.animate(f, "wobble", { angle = 8, period = 1.2, axis = "Y" })
		return m
	end)

	-- ================================================================== ICONS
	-- BW.icon(parent, name, {Size=, Position=, Color=, AnchorPoint=, ZIndex=, px=}) → Frame with vector shapes (no image upload needed)
	local function iconColor(c, main)
		if c == "a" then return main end
		if c == "w" then return "#FFFFFF" end
		return c
	end
	function BW.icon(parent, name, opts)
		opts = opts or {}
		local data = BW._iconData and BW._iconData[name]
		if not data then
			local ids = {}
			for k in pairs(BW._iconData or {}) do table.insert(ids, k) end
			table.sort(ids)
			fail("unknown icon '" .. tostring(name) .. "' — available: " .. table.concat(ids, ", "))
		end
		parent = BW.get(parent)
		local main = opts.Color or data.color
		local size = BW.udim2(opts.Size or { 0, 48, 0, 48 })
		local root = BW.new("Frame", { Name = opts.Name or ("Icon_" .. name), Size = size, Position = opts.Position and BW.udim2(opts.Position) or UDim2.new(0, 0, 0, 0),
			AnchorPoint = opts.AnchorPoint and Vector2.new(opts.AnchorPoint[1], opts.AnchorPoint[2]) or nil, BackgroundTransparency = 1, Parent = parent })
		root:SetAttribute("BW_Icon", name)
		if opts.ZIndex then root.ZIndex = opts.ZIndex end
		if opts.Aspect ~= false then BW.new("UIAspectRatioConstraint", { AspectRatio = 1, Parent = root }) end
		-- approximate pixel size (for ring stroke thickness)
		local px = opts.px or (size.X.Offset > 0 and size.X.Offset) or (size.Y.Offset > 0 and size.Y.Offset) or 48
		local z = (opts.ZIndex or 1)
		for i, s in ipairs(data.shapes) do
			local kind = s[1]
			local f
			if kind == "c" then
				f = BW.new("Frame", { Name = "C" .. i, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(s[2] / 100, s[3] / 100), Size = UDim2.fromScale(s[4] / 50, s[4] / 50),
					BackgroundColor3 = iconColor(s[5], main), BorderSizePixel = 0, Parent = root })
				BW.new("UICorner", { CornerRadius = UDim.new(0.5, 0), Parent = f })
			elseif kind == "o" then
				local r, t = s[4], s[5]
				f = BW.new("Frame", { Name = "O" .. i, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(s[2] / 100, s[3] / 100), Size = UDim2.fromScale((r - t) / 50, (r - t) / 50),
					BackgroundTransparency = 1, Parent = root })
				BW.new("UICorner", { CornerRadius = UDim.new(0.5, 0), Parent = f })
				BW.new("UIStroke", { Thickness = math.max(1, math.floor(t / 100 * px + 0.5)), Color = iconColor(s[6], main), Parent = f })
			elseif kind == "r" then
				local w, h = s[4], s[5]
				f = BW.new("Frame", { Name = "R" .. i, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(s[2] / 100, s[3] / 100), Size = UDim2.fromScale(w / 100, h / 100),
					Rotation = s[7] or 0, BackgroundColor3 = iconColor(s[6], main), BorderSizePixel = 0, Parent = root })
				if (s[8] or 0) > 0 then BW.new("UICorner", { CornerRadius = UDim.new(math.min(0.5, s[8] / math.min(w, h)), 0), Parent = f }) end
			elseif kind == "t" then
				f = BW.new("TextLabel", { Name = "T" .. i, AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(s[2] / 100, s[3] / 100), Size = UDim2.fromScale(s[4] / 100, s[5] / 100),
					BackgroundTransparency = 1, Text = s[7], TextScaled = true, Font = "GothamBlack", TextColor3 = iconColor(s[6], main), Parent = root })
			end
			if f then f.ZIndex = z end
		end
		return root
	end

	-- ================================================================== CATALOG / ENTRY POINT
	local FACES_ITSELF = { dancer_npc = true, npc_dialog = true }
	local function kitIds(cat)
		local ids = {}
		for id in pairs(KITS) do
			local info = BW._kitInfo and BW._kitInfo[id]
			if not cat or (info and info.kind == cat) then table.insert(ids, id) end
		end
		table.sort(ids)
		return ids
	end
	-- BW.kit(id, opts) → builds a ready-made resource and returns its root (Model / ScreenGui / Folder)
	function BW.kit(id, opts)
		local fn = KITS[id]
		if not fn then fail("unknown kit '" .. tostring(id) .. "' — call BW.kits() for the catalog. Available: " .. table.concat(kitIds(), ", ")) end
		local o = {}
		for k, v in pairs(opts or {}) do o[k] = v end
		if o.At == nil then o.At = { 0, BW.groundY(), 0 } end
		local prevDefault = BW.default
		local ok, res = pcall(fn, o)
		BW.default = prevDefault
		if not ok then fail("kit '" .. id .. "' failed: " .. tostring(res)) end
		if typeof(res) ~= "Instance" then return res end
		pcall(function() res:SetAttribute("BW_Kit", id) end)
		local facing = tonumber(o.Facing) or 0
		if facing ~= 0 and not FACES_ITSELF[id] and res:IsA("Model") then
			local at = BW.v3(o.At)
			res:PivotTo(CFrame.new(at.X, at.Y, at.Z) * CFrame.Angles(0, math.rad(-facing), 0) * CFrame.new(-at.X, -at.Y, -at.Z) * res:GetPivot())
		end
		if not o._quiet then
			local _, list = BW._partsOf(res)
			local line = "BW_KIT " .. id .. " → " .. res:GetFullName() .. " parts=" .. #list
			if #list > 0 then
				local lo, hi = BW._boundsOf(list)
				line = line .. string.format(" size=%.0fx%.0fx%.0f", hi[1] - lo[1], hi[2] - lo[2], hi[3] - lo[3])
			end
			print(line)
		end
		return res
	end
	-- BW.kits([category]) → prints the catalog (id — description — options); categories: build furniture gameplay ui vfx anim
	function BW.kits(cat)
		local ids = kitIds(cat)
		local lines = {}
		for _, id in ipairs(ids) do
			local info = BW._kitInfo and BW._kitInfo[id] or {}
			table.insert(lines, string.format("%s [%s] — %s%s", id, info.kind or "?", info.desc or "", info.opts and info.opts ~= "" and (" | opts: " .. info.opts) or ""))
		end
		if not cat then
			local icons = {}
			for k in pairs(BW._iconData or {}) do table.insert(icons, k) end
			table.sort(icons)
			table.insert(lines, "icons (BW.icon(parent, name, {Size=,Position=,Color=})): " .. table.concat(icons, ", "))
		end
		print("BW_KITS " .. #ids .. "\n" .. table.concat(lines, "\n"))
		return ids
	end
	BW._kits = KITS
end
