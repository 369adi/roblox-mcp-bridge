-- Brickwire asset packs runtime: BW.asset(id, opts) rebuilds an item of a bundled/user .rbxm pack.
-- The bridge injects the data of every asset id written literally in the code (BW.asset("vfx/shockwave")).
do
	local function svc(n) return game:GetService(n) end
	local fail = BW.fail
	BW.__assetData = BW.__assetData or {}
	BW.__assetMiss = BW.__assetMiss or {}
	-- mesh templates cached across calls (_G persists in the Studio plugin VM; read-only elsewhere → local cache)
	local meshCache = {}
	pcall(function()
		_G.__BWMeshCache = _G.__BWMeshCache or {}
		meshCache = _G.__BWMeshCache
	end)
	local weights
	local function fontWeight(n)
		if not weights then
			weights = {}
			for _, e in ipairs(Enum.FontWeight:GetEnumItems()) do weights[e.Value] = e end
		end
		return weights[n] or Enum.FontWeight.Regular
	end

	-- tagged value → Roblox value (refs resolved by the caller)
	local function dv(v)
		if type(v) ~= "table" then return v end
		local t = v[1]
		if t == "V3" then return Vector3.new(v[2], v[3], v[4])
		elseif t == "V2" then return Vector2.new(v[2], v[3])
		elseif t == "C3" then return Color3.new(v[2], v[3], v[4])
		elseif t == "C8" then return Color3.fromRGB(v[2], v[3], v[4])
		elseif t == "BC" then return BrickColor.new(v[2])
		elseif t == "CF" then return CFrame.new(v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[11], v[12], v[13])
		elseif t == "U" then return UDim.new(v[2], v[3])
		elseif t == "U2" then return UDim2.new(v[2], v[3], v[4], v[5])
		elseif t == "NR" then return NumberRange.new(math.min(v[2], v[3]), math.max(v[2], v[3]))
		elseif t == "RC" then return Rect.new(v[2], v[3], v[4], v[5])
		elseif t == "PP" then return PhysicalProperties.new(v[2], v[3], v[4], v[5], v[6])
		elseif t == "FT" then return Font.new(v[2], fontWeight(v[3]), v[4] == 1 and Enum.FontStyle.Italic or Enum.FontStyle.Normal)
		elseif t == "NS" then
			local f, kp = v[2], {}
			for i = 1, #f, 3 do table.insert(kp, NumberSequenceKeypoint.new(f[i], f[i + 1], f[i + 2])) end
			if #kp == 1 then return NumberSequence.new(kp[1].Value) end
			return NumberSequence.new(kp)
		elseif t == "CS" then
			local f, kp = v[2], {}
			for i = 1, #f, 4 do table.insert(kp, ColorSequenceKeypoint.new(f[i], Color3.new(f[i + 1], f[i + 2], f[i + 3]))) end
			if #kp == 1 then return ColorSequence.new(kp[1].Value) end
			return ColorSequence.new(kp)
		end
		return nil
	end
	BW._assetValue = dv

	local SKIP_SET = { MeshId = true, InitialSize = true }
	local FIRST = { "Shape", "Size" }

	local function newMesh(meshId, p, stats)
		local fid = p.CanCollide == false and "box" or "default"
		local key = meshId .. "|" .. fid
		local tpl = meshCache[key]
		if tpl == nil then
			local ok, mp = pcall(function()
				local o = {}
				if fid == "box" then o.CollisionFidelity = Enum.CollisionFidelity.Box end
				return svc("AssetService"):CreateMeshPartAsync(meshId, o)
			end)
			tpl = (ok and typeof(mp) == "Instance") and mp or false
			meshCache[key] = tpl
		end
		if tpl then return tpl:Clone() end
		-- fallback: a Part carrying a FileMesh (same look, box collisions)
		stats.meshFallback = (stats.meshFallback or 0) + 1
		local part = Instance.new("Part")
		local sm = Instance.new("SpecialMesh")
		sm.Name = "Mesh"
		sm.MeshType = Enum.MeshType.FileMesh
		sm.MeshId = meshId
		if type(p.TextureID) == "string" then sm.TextureId = p.TextureID end
		local init, size = p.InitialSize and dv(p.InitialSize), p.Size and dv(p.Size)
		if init and size and init.X > 0 and init.Y > 0 and init.Z > 0 then sm.Scale = Vector3.new(size.X / init.X, size.Y / init.Y, size.Z / init.Z) end
		sm.Parent = part
		return part
	end

	local function create(node, refs, stats)
		local p = node.p or {}
		local inst
		if node.c == "MeshPart" and type(p.MeshId) == "string" and p.MeshId ~= "" then
			inst = newMesh(p.MeshId, p, stats)
		elseif (node.c == "UnionOperation" or node.c == "NegateOperation") and node.u and #node.u > 0 then
			local parts = {}
			for _, u in ipairs(node.u) do table.insert(parts, create(u, {}, stats)) end
			local ok, res = pcall(function()
				local gs = svc("GeometryService")
				local out = gs:UnionAsync(parts[1], { table.unpack(parts, 2) }, { SplitApart = false })
				return out[1]
			end)
			if not ok or typeof(res) ~= "Instance" then
				ok, res = pcall(function() return parts[1]:UnionAsync({ table.unpack(parts, 2) }) end)
			end
			if ok and typeof(res) == "Instance" then
				inst = res
				for _, x in ipairs(parts) do x:Destroy() end
			else
				stats.unionFallback = (stats.unionFallback or 0) + 1
				inst = Instance.new("Model")
				for _, x in ipairs(parts) do x.Parent = inst end
				node = { c = "Model", n = node.n, k = node.k }
				p = {}
			end
		elseif node.c == "UnionOperation" or node.c == "NegateOperation" then
			stats.unionFallback = (stats.unionFallback or 0) + 1
			inst = Instance.new("Part")
			if string.find(string.lower(node.n or ""), "sphere") or string.find(string.lower(node.n or ""), "ball") then pcall(function() inst.Shape = Enum.PartType.Ball end) end
		else
			local ok, x = pcall(Instance.new, node.c)
			if not ok then
				stats.skipped = (stats.skipped or 0) + 1
				x = Instance.new(node.k and "Folder" or "Configuration")
			end
			inst = x
		end
		pcall(function() inst.Name = node.n or node.c end)
		if node.i then refs[node.i] = inst end
		stats.count = (stats.count or 0) + 1
		return inst, node, p
	end

	local function setProps(inst, p, refs, deferred, isUnionModel)
		if isUnionModel then return end
		for _, k in ipairs(FIRST) do
			if p[k] ~= nil then pcall(function() inst[k] = dv(p[k]) end) end
		end
		for k, v in pairs(p) do
			if not SKIP_SET[k] and k ~= "Shape" and k ~= "Size" then
				if type(v) == "table" and v[1] == "R" then
					table.insert(deferred, { inst, k, v[2] })
				else
					local val = dv(v)
					if val ~= nil then pcall(function() inst[k] = val end) end
				end
			end
		end
	end

	local function build(node, parent, refs, deferred, stats)
		local inst, n2, p = create(node, refs, stats)
		setProps(inst, p, refs, deferred, n2.c == "Model" and node.c ~= "Model")
		if node.a then for k, v in pairs(node.a) do pcall(function() inst:SetAttribute(k, dv(v)) end) end end
		for _, ch in ipairs(node.k or {}) do build(ch, inst, refs, deferred, stats) end
		if parent then inst.Parent = parent end
		return inst
	end

	local function resident(info)
		if not info or not info.r or info.r == "" or not info.path or info.merged then return nil end
		local function walk(root, path)
			local cur = root
			for seg in string.gmatch(path, "[^/]+") do
				local nm, idx = string.match(seg, "^(.-)#(%d+)$")
				nm = nm or seg
				idx = tonumber(idx) or 0
				local hit, k = nil, 0
				for _, c in ipairs(cur:GetChildren()) do
					if c.Name == nm then
						if k == idx then hit = c break end
						k += 1
					end
				end
				if not hit then return nil end
				cur = hit
			end
			return cur
		end
		for _, sname in ipairs({ "ServerStorage", "ReplicatedStorage", "Workspace" }) do
			local ok, s = pcall(svc, sname)
			if ok and s then
				local holders = { s, s:FindFirstChild("BrickwirePacks") }
				for _, h in ipairs(holders) do
					if h then
						local root = h:FindFirstChild(info.r)
						local pre = info.r .. "/"
						local stripped = string.sub(info.path, 1, #pre) == pre and string.sub(info.path, #pre + 1) or nil
						local hit = (root and (walk(root, info.path) or (stripped and walk(root, stripped)))) or (stripped and walk(h, info.path))
						if hit then return hit end
					end
				end
			end
		end
		return nil
	end

	local function defaultParent(kind, inst)
		if kind == "sky" or kind == "lighting" or inst:IsA("Sky") or inst:IsA("PostEffect") or inst:IsA("Atmosphere") then return svc("Lighting") end
		if inst:IsA("ScreenGui") then return svc("StarterGui") end
		if kind == "sound" or inst:IsA("Sound") then return svc("SoundService") end
		return workspace
	end

	local function suggest(id)
		local miss = BW.__assetMiss[id]
		return miss and (" — did you mean: " .. miss) or " — search with the brickwire_assets tool (or write the id exactly as listed)"
	end

	-- BW.asset(id, {At={x,y,z}, Facing=deg, Parent=, Scale=, Name=, ApplyTo=part|model, Rebuild=true})
	function BW.asset(id, opts)
		opts = opts or {}
		if type(id) ~= "string" then fail("BW.asset(id): id must be a string like \"vfx/shockwave\"") end
		local info = BW.__assetData[id]
		if not info then fail("unknown asset '" .. id .. "'" .. suggest(id)) end
		local stats = {}
		local inst, source
		local res = (not opts.Rebuild) and resident(info) or nil
		if res then
			inst = res:Clone()
			source = "studio copy " .. res:GetFullName()
		else
			local refs, deferred = {}, {}
			inst = build(info.d, nil, refs, deferred, stats)
			for _, d in ipairs(deferred) do
				local target = refs[d[3]]
				if target then pcall(function() d[1][d[2]] = target end) end
			end
			source = "rebuilt"
		end
		pcall(function() inst.Name = opts.Name or info.d.n end)
		pcall(function() inst:SetAttribute("BW_Asset", id) end)

		-- textures / decals / surface appearances onto existing parts
		if opts.ApplyTo then
			local targets = {}
			local tgt = typeof(opts.ApplyTo) == "Instance" and opts.ApplyTo or BW.get(opts.ApplyTo)
			if tgt:IsA("BasePart") then table.insert(targets, tgt) end
			for _, d in ipairs(tgt:GetDescendants()) do if d:IsA("BasePart") then table.insert(targets, d) end end
			local src = inst:IsA("BasePart") and inst or inst:FindFirstChildWhichIsA("BasePart", true)
			local n = 0
			for _, part in ipairs(targets) do
				for _, c in ipairs((src or inst):GetChildren()) do
					if c:IsA("Texture") or c:IsA("Decal") then
						c:Clone().Parent = part
						n += 1
					elseif c:IsA("SurfaceAppearance") then
						if part:IsA("MeshPart") then
							c:Clone().Parent = part
						else
							-- SurfaceAppearance only renders on MeshParts: approximate with a tiling Texture per face
							local ok, map = pcall(function() return c.ColorMap end)
							if ok and map and map ~= "" then
								for _, face in ipairs(Enum.NormalId:GetEnumItems()) do
									local t = Instance.new("Texture")
									t.Texture = map
									t.Face = face
									t.StudsPerTileU, t.StudsPerTileV = 8, 8
									t.Parent = part
								end
							end
						end
						n += 1
					end
				end
				if src and opts.Material ~= false then
					pcall(function() part.Material = src.Material end)
					if opts.Color ~= false then pcall(function() part.Color = src.Color end) end
				end
			end
			inst:Destroy()
			print(string.format("BW_ASSET %s applied to %d part(s) (%d surface items)", id, #targets, n))
			return tgt
		end

		local parent = opts.Parent and (typeof(opts.Parent) == "Instance" and opts.Parent or BW.get(opts.Parent)) or defaultParent(info.k, inst)
		if inst:IsA("Sky") and parent == svc("Lighting") then
			for _, s in ipairs(parent:GetChildren()) do if s:IsA("Sky") then s:Destroy() end end
		end
		local scale = tonumber(opts.Scale) or 1
		local isGeo = inst:IsA("BasePart") or (inst:IsA("Model") and inst:FindFirstChildWhichIsA("BasePart", true) ~= nil)
		if isGeo then
			if inst:IsA("Model") then
				if source == "rebuilt" then pcall(function() inst.WorldPivot = CFrame.new() end) end
				if scale ~= 1 then pcall(function() inst:ScaleTo(inst:GetScale() * scale) end) end
			elseif scale ~= 1 then
				inst.Size *= scale
				local m = inst:FindFirstChildOfClass("SpecialMesh")
				if m then m.Scale *= scale end
			end
			local at = opts.At and BW.v3(opts.At) or Vector3.new(0, BW.groundY(), 0)
			local yaw = math.rad(-(tonumber(opts.Facing) or 0))
			if yaw ~= 0 then
				local pv = inst:GetPivot()
				inst:PivotTo(CFrame.new(pv.Position) * CFrame.Angles(0, yaw, 0) * (pv - pv.Position))
			end
			BW.place(inst, { at.X, at.Y, at.Z })
			if opts.Anchored ~= nil then
				for _, d in ipairs(inst:GetDescendants()) do if d:IsA("BasePart") then d.Anchored = opts.Anchored end end
				if inst:IsA("BasePart") then inst.Anchored = opts.Anchored end
			end
		end
		inst.Parent = parent
		local line = "BW_ASSET " .. id .. " → " .. inst:GetFullName() .. " (" .. source
		if stats.count then line ..= ", " .. stats.count .. " instances" end
		if stats.meshFallback then line ..= ", " .. stats.meshFallback .. " mesh(es) as SpecialMesh" end
		if stats.unionFallback then line ..= ", " .. stats.unionFallback .. " union(s) approximated" end
		print(line .. ")")
		return inst
	end

	-- BW.assetInfo(id) → table {kind, size, name} of an injected asset (nil if unknown)
	function BW.assetInfo(id)
		local info = BW.__assetData[id]
		if not info then return nil end
		return { kind = info.k, size = info.s and Vector3.new(info.s[1], info.s[2], info.s[3]) or nil, name = info.d.n }
	end
end
