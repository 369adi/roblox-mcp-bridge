-- Asset-pack runtime extras (TEST ONLY): appended after roblox-stub + runtime-stub.
local mkRect = valueType("Rect")
Rect = { new = function(a, b, c, d) return mkRect({ Min = Vector2.new(a, b), Max = Vector2.new(c, d) }) end }
PhysicalProperties = { new = function(d, f, e, fw, ew) return valueType("PhysicalProperties")({ Density = d }) end }
Font = { new = function(f, w, s) assert(type(f) == "string", "Font family must be a string") return valueType("Font")({ Family = f, Weight = w, Style = s }) end }
local origCF = CFrame.new
CFrame.new = function(x, y, z, ...)
	if select("#", ...) > 0 then for i = 1, select("#", ...) do assert(type((select(i, ...))) == "number", "CFrame component must be a number") end end
	return origCF(x, y, z)
end
-- Enum:GetEnumItems for the enums the runtime iterates
local ENUM_ITEMS = { NormalId = { "Front", "Back", "Left", "Right", "Top", "Bottom" }, FontWeight = { "Thin", "Regular", "Bold" } }
for en, names in pairs(ENUM_ITEMS) do
	local e = Enum[en]
	local list = {}
	for k, n in ipairs(names) do local it = e[n] rawset(it, "Value", ({ Thin = 100, Regular = 400, Bold = 700 })[n] or k) table.insert(list, it) end
	getmetatable(e).__index = (function(old) return function(t, k) if k == "GetEnumItems" then return function() return list end end return old(t, k) end end)(getmetatable(e).__index)
end
__MESHES, __UNIONS = 0, 0
local gs2 = Methods.GetService
Methods.GetService = function(self, n)
	if n == "AssetService" then
		return { CreateMeshPartAsync = function(_, id, opts)
			assert(type(id) == "string" and string.find(id, "%d"), "CreateMeshPartAsync: bad mesh id " .. tostring(id))
			__MESHES += 1
			local mp = Instance.new("MeshPart") rawget(mp, "__props").MeshId = id
			return mp
		end }
	end
	if n == "GeometryService" then
		return { UnionAsync = function(_, a, others, o)
			assert(rt(a) == "Instance" and a:IsA("BasePart"), "UnionAsync: part expected")
			for _, x in ipairs(others) do assert(rt(x) == "Instance" and x:IsA("BasePart"), "UnionAsync: parts expected") end
			__UNIONS += 1
			return { Instance.new("UnionOperation") }
		end }
	end
	return gs2(self, n)
end
for _, c in ipairs({ "UnionOperation", "NegateOperation", "Part", "MeshPart" }) do ISA[c] = { "BasePart", "PVInstance" } end
ISA.Sky = {} ISA.Sound = {} ISA.Texture = { "Decal" } ISA.Decal = {} ISA.SurfaceAppearance = {}
DEFAULTS.UnionOperation = DEFAULTS.Part
DEFAULTS.NegateOperation = DEFAULTS.Part
function Methods.GetScale() return 1 end
function Methods.ScaleTo() end
if not game:FindFirstChild("SoundService") then local ss = Instance.new("SoundService") ss.Name = "SoundService" ss.Parent = game end
cfMt.__sub = function(a, v) return mkCF(Vector3.new(a.Position.X - v.X, a.Position.Y - v.Y, a.Position.Z - v.Z), a.rot) end
DEFAULTS.SpecialMesh = function() return { Scale = Vector3.new(1, 1, 1), Offset = Vector3.new(0, 0, 0), MeshType = Enum.MeshType.Head } end
