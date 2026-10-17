-- every kit in the catalog builds without errors in the stub; every icon renders; BW.kits prints the catalog
local ids = {}
for id in pairs(BW._kitInfo) do table.insert(ids, id) end
table.sort(ids)
local failed = {}
for i, id in ipairs(ids) do
	if not BW._kits[id] then table.insert(failed, id .. ": no Luau implementation") end
	local ok, err = pcall(function()
		local r = BW.kit(id, { At = { (i % 8) * 80, 0, math.floor(i / 8) * 80 } })
		assert(typeof(r) == "Instance", "kit returned " .. typeof(r))
		assert(r:GetAttribute("BW_Kit") == id, "no BW_Kit attribute")
	end)
	if not ok then table.insert(failed, id .. ": " .. tostring(err)) end
end
for id in pairs(BW._kits) do if not BW._kitInfo[id] then table.insert(failed, id .. ": missing in catalog") end end
local sg = Instance.new("ScreenGui")
sg.Name = "IconTest"
sg.Parent = game:GetService("StarterGui")
local n = 0
for name in pairs(BW._iconData) do
	local ok, err = pcall(BW.icon, sg, name, { Size = { 0, 40, 0, 40 } })
	if not ok then table.insert(failed, "icon " .. name .. ": " .. tostring(err)) else n += 1 end
end
local ok, err = pcall(BW.kit, "nope")
assert(not ok and string.find(tostring(err), "unknown kit"), "unknown kit should fail")
for i, kind in ipairs({ "bedroom", "living", "kitchen", "office", "shop" }) do
	local room = BW.room{ Name = "Room_" .. kind, At = { i * 40, 0, -200 }, Size = { 20, 10, 18 }, Color = "#EEEEEE" }
	local ok2, items = pcall(BW.furnish, room, kind)
	if not ok2 then table.insert(failed, "furnish " .. kind .. ": " .. tostring(items)) elseif #items < 4 then table.insert(failed, "furnish " .. kind .. ": only " .. #items) end
end
local turned = BW.kit("bench", { Name = "TurnedBench", At = { 0, 0, -300 }, Facing = 90 })
assert(turned:GetAttribute("BW_Kit") == "bench")
local listed = BW.kits()
assert(#BW.kits("ui") >= 8, "ui category")
print("LIBRARY_KITS " .. #ids .. " icons " .. n .. " listed " .. #listed)
if #failed > 0 then error("LIBRARY_FAIL\n" .. table.concat(failed, "\n")) end
print("LIBRARY_OK")
