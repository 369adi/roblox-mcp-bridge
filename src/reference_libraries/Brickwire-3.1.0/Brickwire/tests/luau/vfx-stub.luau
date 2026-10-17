-- Extra engine bits for running the BrickwireVFX / BrickwireCinema runtime modules in the stub (TEST ONLY).
-- Appended after roblox-stub.luau + runtime-stub.luau (same chunk). Math is approximate; the point is API/type shape.
__EMITTED, __DEBRIS = 0, 0
local v3 = getmetatable(Vector3.new(0, 0, 0))
local v3fields = {}
function v3fields.Magnitude(v) return math.sqrt(v.X * v.X + v.Y * v.Y + v.Z * v.Z) end
function v3fields.Unit(v) local m = v3fields.Magnitude(v) if m == 0 then return Vector3.new(0, 0, 0) end return Vector3.new(v.X / m, v.Y / m, v.Z / m) end
local v3methods = {
	Lerp = function(a, b, t) assert(typeof(b) == "Vector3" and type(t) == "number", "Vector3:Lerp args") return Vector3.new(a.X + (b.X - a.X) * t, a.Y + (b.Y - a.Y) * t, a.Z + (b.Z - a.Z) * t) end,
	Dot = function(a, b) return a.X * b.X + a.Y * b.Y + a.Z * b.Z end,
	Cross = function(a, b) return Vector3.new(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X) end,
}
v3.__index = function(v, k)
	if v3fields[k] then return v3fields[k](v) end
	if v3methods[k] then return v3methods[k] end
	error(tostring(k) .. " is not a valid member of Vector3", 2)
end
v3.__div = function(a, b) assert(type(b) == "number", "Vector3 / number only") return Vector3.new(a.X / b, a.Y / b, a.Z / b) end
v3.__unm = function(a) return Vector3.new(-a.X, -a.Y, -a.Z) end
Vector3.zero, Vector3.one, Vector3.yAxis = Vector3.new(0, 0, 0), Vector3.new(1, 1, 1), Vector3.new(0, 1, 0)
local c3 = getmetatable(Color3.new(0, 0, 0))
c3.__index = function(c, k)
	if k == "Lerp" then return function(a, b, t) return Color3.new(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t) end end
	if k == "ToHSV" then return function() return 0, 0, 1 end end
	error(tostring(k) .. " is not a valid member of Color3", 2)
end
Color3.fromHSV = function(h, s, v) return Color3.new(v, v, v) end
local cfMt = getmetatable(CFrame.new())
local origMul = cfMt.__mul
cfMt.__mul = function(a, b)
	if typeof(b) == "Vector3" then return a.Position + b end
	return origMul(a, b)
end
cfMt.__sub = function(a, v) return CFrame.new(a.Position - v) end
local cfIdx = cfMt.__index
cfMt.__index = function(cf, k)
	if k == "LookVector" then return rawget(cf, "look") or Vector3.new(0, 0, -1) end
	if k == "RightVector" then return Vector3.new(1, 0, 0) end
	if k == "UpVector" then return Vector3.new(0, 1, 0) end
	if k == "X" or k == "Y" or k == "Z" then return cf.Position[k] end
	if k == "Lerp" then return function(a, b, t) assert(typeof(b) == "CFrame", "CFrame:Lerp expects CFrame") return CFrame.new(a.Position:Lerp(b.Position, t)) end end
	if k == "PointToWorldSpace" then return function(a, v) return a.Position + v end end
	if k == "PointToObjectSpace" then return function(a, v) return v - a.Position end end
	if k == "ToEulerAnglesYXZ" or k == "ToOrientation" then return function() return 0, 0, 0 end end
	local v = type(cfIdx) == "table" and cfIdx[k] or nil
	if v ~= nil then return v end
	error(tostring(k) .. " is not a valid member of CFrame", 2)
end
CFrame.lookAt = function(at, target)
	assert(typeof(at) == "Vector3" and typeof(target) == "Vector3", "CFrame.lookAt expects Vector3s")
	local cf = CFrame.new(at)
	rawset(cf, "look", (target - at).Unit)
	return cf
end
CFrame.fromEulerAnglesYXZ = CFrame.Angles
CFrame.identity = CFrame.new()
local function sig()
	return { Connect = function(_, fn) for _ = 1, 3 do fn(1 / 60) end return { Disconnect = function() end } end, Wait = function() return 1 / 60 end }
end
local runSvc = { Heartbeat = sig(), RenderStepped = sig(), Stepped = sig(),
	IsClient = function() return __IS_CLIENT == true end, IsServer = function() return __IS_CLIENT ~= true end,
	IsStudio = function() return true end, IsRunning = function() return __IS_RUNNING == true end,
	BindToRenderStep = function(_, name, prio, fn) assert(type(name) == "string" and type(prio) == "number" and type(fn) == "function", "BindToRenderStep args") for _ = 1, 3 do fn(1 / 60) end end,
	UnbindFromRenderStep = function() end,
}
local debrisSvc = { AddItem = function(_, inst, t) assert(typeof(inst) == "Instance" and type(t) == "number", "Debris:AddItem args") __DEBRIS += 1 end }
local MethodsGS = Methods.GetService
Methods.GetService = function(self, n)
	if n == "RunService" then return runSvc end
	if n == "Debris" then return debrisSvc end
	if n == "Players" then
		local p = MethodsGS(self, n)
		p.LocalPlayer = __LOCAL_PLAYER
		return p
	end
	return MethodsGS(self, n)
end
function Methods.Emit(self, n)
	assert(self.ClassName == "ParticleEmitter", "Emit on " .. self.ClassName)
	assert(type(n) == "number" and n > 0 and n <= 500, "Emit count " .. tostring(n))
	__EMITTED += n
end
__LOCAL_PLAYER = new("Player", "Tester")
do local pg = new("PlayerGui") pg.Parent = __LOCAL_PLAYER end
local btnDefaults = DEFAULTS.TextButton
DEFAULTS.TextButton = function()
	local t = btnDefaults and btnDefaults() or {}
	t.Activated = { Connect = function() return { Disconnect = function() end } end }
	return t
end
DEFAULTS.Highlight = function() return { FillTransparency = 0.5, OutlineTransparency = 0, FillColor = Color3.new(1, 0, 0), OutlineColor = Color3.new(1, 1, 1) } end
do
	local cam = workspace:FindFirstChildOfClass("Camera")
	local p = rawget(cam, "__props")
	p.CFrame, p.FieldOfView, p.CameraType = CFrame.new(0, 10, 20), 70, Enum.CameraType.Custom
	rawget(workspace, "__props").CurrentCamera = cam
end
-- 1.9 BrickwireCutscene: sounds, remotes, character-less local player
__SOUNDS, __FIRED = 0, {}
function Methods.Play(self) assert(self.ClassName == "Sound", "Play on " .. self.ClassName) assert(type(self.SoundId) == "string" and self.SoundId ~= "", "Sound without SoundId") __SOUNDS += 1 end
function Methods.Stop() end
function Methods.FireClient(self, player, scene, data) assert(self.ClassName == "RemoteEvent", "FireClient on " .. self.ClassName) assert(typeof(player) == "Instance", "FireClient needs a player") table.insert(__FIRED, { "one", scene, data }) end
function Methods.FireAllClients(self, scene, data) assert(self.ClassName == "RemoteEvent", "FireAllClients on " .. self.ClassName) table.insert(__FIRED, { "all", scene, data }) end
function Methods.FireServer(self, ...) assert(self.ClassName == "RemoteEvent", "FireServer on " .. self.ClassName) table.insert(__FIRED, { "server", ... }) end
DEFAULTS.RemoteEvent = function()
	return { OnClientEvent = { Connect = function(_, fn) __CLIENT_HANDLER = fn return { Disconnect = function() end } end }, OnServerEvent = { Connect = function(_, fn) __SERVER_HANDLER = fn return { Disconnect = function() end } end } }
end
