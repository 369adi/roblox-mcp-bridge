-- TEST/DEV ONLY: runs every kit in the Luau Roblox stub and prints its instance tree as JSON (one line per kit).
-- Used by scripts/gen-library.ts (panel previews) and the integration test (all generated scripts compile).
local function hex(c)
	return string.format("#%02X%02X%02X", math.floor(c.R * 255 + 0.5), math.floor(c.G * 255 + 0.5), math.floor(c.B * 255 + 0.5))
end
local function enc(v, depth)
	local t = typeof(v)
	if t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then return "0" end
		return string.format("%.3f", v):gsub("%.?0+$", "")
	elseif t == "boolean" then return tostring(v)
	elseif t == "string" then
		return '"' .. v:gsub('[%c"\\]', function(ch)
			if ch == "\n" then return "\\n" elseif ch == '"' then return '\\"' elseif ch == "\\" then return "\\\\" elseif ch == "\t" then return "\\t" end
			return string.format("\\u%04x", string.byte(ch))
		end) .. '"'
	elseif t == "Vector3" then return "[" .. enc(v.X) .. "," .. enc(v.Y) .. "," .. enc(v.Z) .. "]"
	elseif t == "Vector2" then return "[" .. enc(v.X) .. "," .. enc(v.Y) .. "]"
	elseif t == "Color3" then return '"' .. hex(v) .. '"'
	elseif t == "UDim" then return "[" .. enc(v.Scale) .. "," .. enc(v.Offset) .. "]"
	elseif t == "UDim2" then return "[" .. enc(v.X.Scale) .. "," .. enc(v.X.Offset) .. "," .. enc(v.Y.Scale) .. "," .. enc(v.Y.Offset) .. "]"
	elseif t == "EnumItem" then return '"' .. v.Name .. '"'
	elseif t == "BrickColor" then return '"' .. hex(v.Color) .. '"'
	elseif t == "NumberRange" then return "[" .. enc(v.Min) .. "," .. enc(v.Max) .. "]"
	elseif t == "CFrame" then
		local rs = {}
		for _, r in ipairs(v.rot) do table.insert(rs, "[" .. enc(r[1] or 0) .. "," .. enc(r[2] or 0) .. "," .. enc(r[3] or 0) .. "]") end
		return '{"p":' .. enc(v.Position) .. ',"r":[' .. table.concat(rs, ",") .. "]}"
	elseif t == "ColorSequence" then
		local k = v.k
		if typeof(k) == "Color3" then return '"' .. hex(k) .. '"' end
		if type(k) == "table" and k[1] and typeof(k[1][2]) == "Color3" then return '"' .. hex(k[1][2]) .. '"' end
		return "null"
	elseif t == "NumberSequence" then
		local k = v.k
		if type(k) == "number" then return enc(k) end
		if type(k) == "table" and k[1] then return enc(k[1][2] or 0) end
		return "null"
	elseif t == "Instance" then return '"' .. v.Name .. '"'
	end
	return "null"
end
local function node(inst)
	local props = {}
	for k, v in pairs(rawget(inst, "__props")) do
		local e = enc(v)
		if e ~= "null" then table.insert(props, enc(k) .. ":" .. e) end
	end
	if inst.ClassName == "UIGradient" then
		local pr = rawget(inst, "__props")
		local cs, ts = pr.Color, pr.Transparency
		if cs and type(cs.k) == "table" then
			local ks = {}
			for _, kp in ipairs(cs.k) do if typeof(kp[2]) == "Color3" then table.insert(ks, "[" .. enc(kp[1]) .. "," .. enc(kp[2]) .. "]") end end
			table.insert(props, '"Keys":[' .. table.concat(ks, ",") .. "]")
		end
		if ts and type(ts.k) == "table" then
			local ks = {}
			for _, kp in ipairs(ts.k) do table.insert(ks, "[" .. enc(kp[1]) .. "," .. enc(kp[2]) .. "]") end
			table.insert(props, '"TKeys":[' .. table.concat(ks, ",") .. "]")
		end
	end
	local attrs = {}
	for k, v in pairs(inst:GetAttributes()) do table.insert(attrs, enc(k) .. ":" .. enc(v)) end
	local kids = {}
	for _, c in ipairs(inst:GetChildren()) do table.insert(kids, node(c)) end
	return '{"c":' .. enc(inst.ClassName) .. ',"n":' .. enc(inst.Name) .. ',"p":{' .. table.concat(props, ",") .. '},"a":{' .. table.concat(attrs, ",") .. '},"k":[' .. table.concat(kids, ",") .. "]}"
end
local ids = {}
for id in pairs(BW._kitInfo) do table.insert(ids, id) end
table.sort(ids)
local services = { "Workspace", "ServerScriptService", "StarterGui", "StarterPlayer", "ReplicatedStorage", "Lighting", "ServerStorage" }
for _, id in ipairs(ids) do
	-- clean world between kits
	for _, sn in ipairs(services) do
		local s = game:GetService(sn)
		for _, c in ipairs(s:GetChildren()) do if c.Name ~= "StarterPlayerScripts" and c.Name ~= "StarterCharacterScripts" then c:Destroy() end end
	end
	for _, sn in ipairs({ "StarterPlayerScripts", "StarterCharacterScripts" }) do
		local s = game:GetService("StarterPlayer"):FindFirstChild(sn)
		if s then s:ClearAllChildren() end
	end
	local ok, res = pcall(BW.kit, id, { At = { 0, 0, 0 }, _quiet = true })
	if not ok then
		print("BWDUMP " .. '{"id":' .. enc(id) .. ',"error":' .. enc(tostring(res)) .. "}")
	else
		local scripts = {}
		for _, sn in ipairs(services) do
			for _, d in ipairs(game:GetService(sn):GetDescendants()) do
				if d:IsA("LuaSourceContainer") then table.insert(scripts, '{"path":' .. enc(d:GetFullName()) .. ',"class":' .. enc(d.ClassName) .. ',"source":' .. enc(rawget(d, "__props").Source or "") .. "}") end
			end
		end
		print("BWDUMP " .. '{"id":' .. enc(id) .. ',"root":' .. node(res) .. ',"scripts":[' .. table.concat(scripts, ",") .. "]}")
	end
end
