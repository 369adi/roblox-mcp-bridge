--!nocheck
-- Minimal Roblox engine stub for executing Brickwire composite Luau in the standalone Luau VM (TEST ONLY).
local rawtypeof = typeof
local function rt(v)
	if type(v) == "table" then
		local m = getmetatable(v)
		if m and m.__rtype then return m.__rtype end
	end
	return rawtypeof(v)
end
typeof = rt

local function valueType(name, fields, tostr)
	local mt = { __rtype = name, __tostring = tostr }
	mt.__index = mt
	return function(t) return setmetatable(t, mt) end
end
local mkV3 = valueType("Vector3")
Vector3 = { new = function(x, y, z) return mkV3({ X = x or 0, Y = y or 0, Z = z or 0 }) end }
local mkV2 = valueType("Vector2")
Vector2 = { new = function(x, y) return mkV2({ X = x or 0, Y = y or 0 }) end }
local mkC3 = valueType("Color3")
Color3 = {
	new = function(r, g, b) return mkC3({ R = r or 0, G = g or 0, B = b or 0 }) end,
	fromRGB = function(r, g, b) return mkC3({ R = (r or 0) / 255, G = (g or 0) / 255, B = (b or 0) / 255 }) end,
	fromHex = function(h)
		h = string.gsub(h, "#", "")
		return mkC3({ R = tonumber(string.sub(h, 1, 2), 16) / 255, G = tonumber(string.sub(h, 3, 4), 16) / 255, B = tonumber(string.sub(h, 5, 6), 16) / 255 })
	end,
}
local mkUD = valueType("UDim")
UDim = { new = function(s, o) return mkUD({ Scale = s or 0, Offset = o or 0 }) end }
local mkUD2 = valueType("UDim2")
UDim2 = {
	new = function(a, b, c, d) return mkUD2({ X = UDim.new(a, b), Y = UDim.new(c, d) }) end,
	fromScale = function(x, y) return mkUD2({ X = UDim.new(x, 0), Y = UDim.new(y, 0) }) end,
	fromOffset = function(x, y) return mkUD2({ X = UDim.new(0, x), Y = UDim.new(0, y) }) end,
}
-- CFrame: position + accumulated rotation list (enough for composition checks)
local cfMt = { __rtype = "CFrame" }
cfMt.__index = cfMt
local function mkCF(pos, rot) return setmetatable({ Position = pos or Vector3.new(0, 0, 0), rot = rot or {} }, cfMt) end
cfMt.__mul = function(a, b)
	if rt(b) ~= "CFrame" then error("CFrame * " .. rt(b) .. " not supported by stub") end
	local r = table.clone(a.rot)
	for _, x in ipairs(b.rot) do table.insert(r, x) end
	return mkCF(Vector3.new(a.Position.X + b.Position.X, a.Position.Y + b.Position.Y, a.Position.Z + b.Position.Z), r)
end
cfMt.__add = function(a, v) return mkCF(Vector3.new(a.Position.X + v.X, a.Position.Y + v.Y, a.Position.Z + v.Z), a.rot) end
CFrame = {
	new = function(x, y, z)
		if rt(x) == "Vector3" then return mkCF(x) end
		return mkCF(Vector3.new(x or 0, y or 0, z or 0))
	end,
	Angles = function(x, y, z) return mkCF(nil, { { x, y, z } }) end,
	fromAxisAngle = function(ax, a) return mkCF(nil, { { ax.X * a, ax.Y * a, ax.Z * a } }) end,
}
local mkNR = valueType("NumberRange")
NumberRange = { new = function(a, b) return mkNR({ Min = a, Max = b or a }) end }
local mkBC = valueType("BrickColor")
BrickColor = { new = function(n) return mkBC({ Name = n, Color = Color3.new(0.5, 0.5, 0.5) }) end }
NumberSequenceKeypoint = { new = function(t, v, e) return { t, v, e } end }
NumberSequence = { new = function(k) return valueType("NumberSequence")({ k = k }) end }
ColorSequenceKeypoint = { new = function(t, c) return { t, c } end }
ColorSequence = { new = function(k) return valueType("ColorSequence")({ k = k }) end }

local enumMt = {}
local enumCache = {}
Enum = setmetatable({}, {
	__index = function(_, enumName)
		if enumCache[enumName] then return enumCache[enumName] end
		local items = {}
		local et = setmetatable({}, { __tostring = function() return enumName end })
		enumCache[enumName] = setmetatable({}, {
			__index = function(_, itemName)
				if not items[itemName] then items[itemName] = setmetatable({ Name = itemName, EnumType = et }, { __rtype = "EnumItem" }) end
				return items[itemName]
			end,
		})
		return enumCache[enumName]
	end,
})

-- ---------------------------------------------------------------- Instances
local DEFAULTS = {
	Part = function() return { Anchored = false, Size = Vector3.new(4, 1, 2), Position = Vector3.new(0, 0, 0), Color = Color3.fromRGB(163, 162, 165), Material = Enum.Material.Plastic, Shape = Enum.PartType.Block, Transparency = 0 } end,
	ScreenGui = function() return { ResetOnSpawn = true, Enabled = true } end,
	Frame = function() return { Size = UDim2.new(0, 100, 0, 100), BackgroundColor3 = Color3.new(1, 1, 1), Visible = true } end,
	TextButton = function() return { Size = UDim2.new(0, 100, 0, 30), Text = "Button", BackgroundColor3 = Color3.new(1, 1, 1) } end,
	TextLabel = function() return { Size = UDim2.new(0, 100, 0, 30), Text = "Label" } end,
	UICorner = function() return { CornerRadius = UDim.new(0, 8) } end,
	ParticleEmitter = function() return { Rate = 20, Color = ColorSequence.new({}), Lifetime = NumberRange.new(1, 2) } end,
	Script = function() return { Source = "", Disabled = false } end,
	LocalScript = function() return { Source = "", Disabled = false } end,
	ModuleScript = function() return { Source = "" } end,
}
for _, c in ipairs({ "SpawnLocation", "WedgePart", "MeshPart", "TrussPart", "CornerWedgePart", "Seat" }) do DEFAULTS[c] = DEFAULTS.Part end
for _, c in ipairs({ "ImageLabel", "ImageButton", "TextBox", "ScrollingFrame" }) do DEFAULTS[c] = DEFAULTS.Frame end
local ISA = {
	Part = { "BasePart", "PVInstance" }, SpawnLocation = { "Part", "BasePart" }, WedgePart = { "BasePart" },
	Script = { "BaseScript", "LuaSourceContainer" }, LocalScript = { "Script", "BaseScript", "LuaSourceContainer" }, ModuleScript = { "LuaSourceContainer" },
	ScreenGui = { "LayerCollector", "GuiBase2d" }, Frame = { "GuiObject" }, TextButton = { "GuiButton", "GuiObject" }, TextLabel = { "GuiObject" },
	RemoteEvent = {}, Folder = {}, Model = { "PVInstance" },
	MeshPart = { "BasePart" }, TrussPart = { "BasePart" }, CornerWedgePart = { "BasePart" }, Seat = { "Part", "BasePart" },
	ImageLabel = { "GuiObject" }, ImageButton = { "GuiButton", "GuiObject" }, TextBox = { "GuiObject" }, ScrollingFrame = { "GuiObject" },
	Motor6D = { "JointInstance" }, Humanoid = {}, Tool = { "BackpackItem" }, KeyframeSequence = { "AnimationClip" },
	PointLight = { "Light" }, SpotLight = { "Light" }, SurfaceLight = { "Light" },
}

local Methods = {}
local InstMt = { __rtype = "Instance" }
local function new(className, name)
	local o = { __class = className, __name = name or className, __children = {}, __parent = nil, __props = DEFAULTS[className] and DEFAULTS[className]() or {}, __attrs = {}, Archivable = true }
	return setmetatable(o, InstMt)
end
InstMt.__index = function(self, k)
	if k == "Name" then return rawget(self, "__name") end
	if k == "ClassName" then return rawget(self, "__class") end
	if k == "Parent" then return rawget(self, "__parent") end
	if Methods[k] then return Methods[k] end
	local p = rawget(self, "__props")
	if p[k] ~= nil then return p[k] end
	for _, c in ipairs(rawget(self, "__children")) do
		if c.Name == k then return c end
	end
	error(k .. " is not a valid member of " .. rawget(self, "__class") .. ' "' .. rawget(self, "__name") .. '"', 2)
end
InstMt.__newindex = function(self, k, v)
	if k == "Name" then rawset(self, "__name", tostring(v)) return end
	if k == "Parent" then
		local old = rawget(self, "__parent")
		if old then
			local kids = rawget(old, "__children")
			for i, c in ipairs(kids) do if c == self then table.remove(kids, i) break end end
		end
		rawset(self, "__parent", v)
		if v then table.insert(rawget(v, "__children"), self) end
		return
	end
	local p = rawget(self, "__props")
	local cur = p[k]
	if cur ~= nil and rt(cur) ~= rt(v) and not (rt(cur) == "EnumItem" and type(v) == "string") then
		error("Unable to assign property " .. k .. ". " .. rt(cur) .. " expected, got " .. rt(v), 2)
	end
	if rt(cur) == "EnumItem" and type(v) == "string" then v = Enum[tostring(cur.EnumType)][v] end
	p[k] = v
end
InstMt.__tostring = function(self) return rawget(self, "__name") end
function Methods.FindFirstChild(self, n)
	for _, c in ipairs(rawget(self, "__children")) do if c.Name == n then return c end end
	return nil
end
function Methods.GetChildren(self)
	local t = {}
	for i, c in ipairs(rawget(self, "__children")) do t[i] = c end
	return t
end
function Methods.GetDescendants(self)
	local t = {}
	local function w(n) for _, c in ipairs(rawget(n, "__children")) do table.insert(t, c) w(c) end end
	w(self)
	return t
end
function Methods.IsA(self, cls)
	local c = rawget(self, "__class")
	if c == cls or cls == "Instance" then return true end
	for _, a in ipairs(ISA[c] or {}) do if a == cls then return true end end
	return false
end
function Methods.GetFullName(self)
	local parts = {}
	local cur = self
	while cur and rawget(cur, "__class") ~= "DataModel" do table.insert(parts, 1, cur.Name) cur = cur.Parent end
	return #parts > 0 and table.concat(parts, ".") or "Game"
end
function Methods.Destroy(self) self.Parent = nil end
function Methods.ClearAllChildren(self) for _, c in ipairs(self:GetChildren()) do c:Destroy() end end
function Methods.Clone(self)
	if rawget(self, "Archivable") == false then return nil end
	local c = new(rawget(self, "__class"), rawget(self, "__name"))
	for k, v in pairs(rawget(self, "__props")) do rawget(c, "__props")[k] = v end
	for k, v in pairs(rawget(self, "__attrs")) do rawget(c, "__attrs")[k] = v end
	for _, ch in ipairs(rawget(self, "__children")) do local cc = ch:Clone() if cc then cc.Parent = c end end
	return c
end
function Methods.FindFirstChildOfClass(self, cls)
	for _, c in ipairs(rawget(self, "__children")) do if rawget(c, "__class") == cls then return c end end
	return nil
end
function Methods.FindFirstChildWhichIsA(self, cls)
	for _, c in ipairs(rawget(self, "__children")) do if c:IsA(cls) then return c end end
	return nil
end
function Methods.GetPivot(self)
	local p = rawget(self, "__props")
	if p.__pivot then return p.__pivot end
	if p.Position then return CFrame.new(p.Position) end
	return CFrame.new()
end
function Methods.PivotTo(self, cf)
	if rt(cf) ~= "CFrame" then error("PivotTo expects a CFrame, got " .. rt(cf), 2) end
	local p = rawget(self, "__props")
	p.__pivot = cf
	if p.Position then p.Position = cf.Position end
end
function Methods.SetAttribute(self, k, v) rawget(self, "__attrs")[k] = v end
function Methods.GetAttribute(self, k) return rawget(self, "__attrs")[k] end
function Methods.GetAttributes(self) local t = {} for k, v in pairs(rawget(self, "__attrs")) do t[k] = v end return t end

Instance = {
	new = function(cls)
		if cls == "NotAClass" then error('Unable to create an Instance of type "' .. cls .. '"', 2) end
		return new(cls)
	end,
}

-- ---------------------------------------------------------------- JSON
local function jsonEncode(v)
	local t = type(v)
	if v == nil then return "null" end
	if t == "boolean" then return tostring(v) end
	if t == "number" then
		if v ~= v or v == math.huge or v == -math.huge then error("cannot encode non-finite number") end
		if v == math.floor(v) and math.abs(v) < 1e15 then return string.format("%d", v) end
		return string.format("%.14g", v)
	end
	if t == "string" then
		return '"' .. string.gsub(v, '[%c"\\]', function(c)
			local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
			return map[c] or string.format("\\u%04x", string.byte(c))
		end) .. '"'
	end
	if t == "table" then
		if getmetatable(v) and getmetatable(v).__rtype then error("cannot encode " .. rt(v)) end
		local n = #v
		local isArr = n > 0 or next(v) == nil
		if isArr then
			for k in pairs(v) do if type(k) ~= "number" then isArr = false break end end
		end
		if isArr then
			local parts = {}
			for i = 1, n do parts[i] = jsonEncode(v[i]) end
			return "[" .. table.concat(parts, ",") .. "]"
		end
		local parts = {}
		for k, x in pairs(v) do table.insert(parts, jsonEncode(tostring(k)) .. ":" .. jsonEncode(x)) end
		return "{" .. table.concat(parts, ",") .. "}"
	end
	error("cannot encode " .. t)
end

-- ---------------------------------------------------------------- DataModel
local services = {}
local DataModelMethods = setmetatable({}, { __index = Methods })
game = new("DataModel", "StubPlace")
rawget(game, "__props").PlaceId = 0
rawget(game, "__props").GameId = 0
rawget(game, "__props").CreatorId = 0
function Methods.GetService(self, n)
	if n == "HttpService" then return { JSONEncode = function(_, v) return jsonEncode(v) end } end
	if n == "ChangeHistoryService" then return { SetWaypoint = function() end } end
	if n == "LogService" then return { GetLogHistory = function() return __LOG end } end
	if n == "Players" then
		return {
			GetPlayers = function() return {} end,
			-- builds a minimal R15/R6 rig: parts + Motor6D joints + Humanoid
			CreateHumanoidModelFromDescription = function(_, desc, rigType)
				if rt(desc) ~= "Instance" or desc.ClassName ~= "HumanoidDescription" then error("HumanoidDescription expected", 2) end
				local m = new("Model", "Rig")
				local hum = new("Humanoid") hum.RigType = rigType hum.Parent = m
				local r15 = rigType.Name == "R15"
				local tree = r15 and {
					{ "LowerTorso", "HumanoidRootPart" }, { "UpperTorso", "LowerTorso" }, { "Head", "UpperTorso" },
					{ "LeftUpperArm", "UpperTorso" }, { "LeftLowerArm", "LeftUpperArm" }, { "LeftHand", "LeftLowerArm" },
					{ "RightUpperArm", "UpperTorso" }, { "RightLowerArm", "RightUpperArm" }, { "RightHand", "RightLowerArm" },
					{ "LeftUpperLeg", "LowerTorso" }, { "LeftLowerLeg", "LeftUpperLeg" }, { "LeftFoot", "LeftLowerLeg" },
					{ "RightUpperLeg", "LowerTorso" }, { "RightLowerLeg", "RightUpperLeg" }, { "RightFoot", "RightLowerLeg" },
				} or { { "Torso", "HumanoidRootPart" }, { "Head", "Torso" }, { "Left Arm", "Torso" }, { "Right Arm", "Torso" }, { "Left Leg", "Torso" }, { "Right Leg", "Torso" } }
				local parts = {}
				local root = new("Part", "HumanoidRootPart") root.Parent = m parts.HumanoidRootPart = root
				for _, e in ipairs(tree) do local p = new("MeshPart", e[1]) p.Parent = m parts[e[1]] = p end
				for _, e in ipairs(tree) do
					local j = new("Motor6D", e[1] == "LowerTorso" and "Root" or e[1])
					j.Part0 = parts[e[2]] j.Part1 = parts[e[1]] j.Parent = parts[e[1]]
				end
				return m
			end,
		}
	end
	if n == "TweenService" then return { Create = function() return { Play = function() end } end } end
	local s = self:FindFirstChild(n)
	if s then return s end
	error("'" .. n .. "' is not a valid Service name", 2)
end
-- LogService history: seeded with one runtime error, plus everything printed/warned
__LOG = { { message = "ServerScriptService.Main:3: attempt to index nil with 'Health'", messageType = Enum.MessageType.MessageError, timestamp = 0 } }
do
	local rp, rw = print, warn
	print = function(...) local t = {} for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end table.insert(__LOG, { message = table.concat(t, " "), messageType = Enum.MessageType.MessageOutput, timestamp = 0 }) rp(...) end
	warn = function(...) local t = {} for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end table.insert(__LOG, { message = table.concat(t, " "), messageType = Enum.MessageType.MessageWarning, timestamp = 0 }) if rw then rw(...) else rp(...) end end
end
local function svc(n) local s = new(n, n) s.Parent = game return s end
local ws = svc("Workspace")
svc("ReplicatedStorage")
svc("ServerScriptService")
svc("ServerStorage")
local sg = svc("StarterGui")
local sp = svc("StarterPlayer")
local sps = new("StarterPlayerScripts") sps.Parent = sp
svc("StarterPack")
svc("Lighting")
workspace = ws
local cam = new("Camera") cam.Parent = ws
local bp = new("Part", "Baseplate") bp.Size = Vector3.new(2048, 16, 2048) bp.Position = Vector3.new(0, -8, 0) bp.Anchored = true bp.Parent = ws
local menu = new("ScreenGui", "MenuCasov") menu.Parent = sg
local mf = new("Frame", "Main") mf.Parent = menu
local ls = new("LocalScript", "MenuClient") ls.Source = "-- menu" ls.Parent = menu
local main = new("Script", "Main") main.Source = 'print("hi")' main.Parent = game.ServerScriptService
