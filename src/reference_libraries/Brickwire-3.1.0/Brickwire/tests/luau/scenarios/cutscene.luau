-- 1.9 cutscenes: the 5 kits build, the module exists, BW.cutsceneCheck passes for every scene kind and the place,
-- a bad timeline is reported, BW.cutscene writes a LocalScript
local RS = game:GetService("ReplicatedStorage")
for i, id in ipairs({ "case_opening", "egg_hatch", "dice_roll", "event_start", "story_intro" }) do
	local r = BW.kit(id, { At = { i * 60, 0, 0 } })
	BW.check(typeof(r) == "Instance" and r:GetAttribute("BW_Kit") == id, id .. " built")
end
BW.check(RS:FindFirstChild("BrickwireCutscene") ~= nil, "module installed")
for _, kind in ipairs({ "case", "egg", "dice", "event", "story" }) do
	local rep = BW.cutsceneCheck(kind)
	BW.check(rep.ok, kind .. " check: " .. table.concat(rep.issues or {}, "; "))
end
local place = BW.cutsceneCheck()
BW.check(place.ok, "place check: " .. table.concat(place.issues or {}, "; "))
local bad = BW.cutsceneCheck({ kind = "case", skip = false, events = { { at = 0, say = "Far too long a sentence to read in half a second", time = 0.5 }, { at = 9, title = "WIN" } } })
BW.check(not bad.ok and #bad.issues >= 2, "bad timeline reported")
local ls = BW.cutscene{ timeline = { events = { { at = 0, title = "HELLO", time = 2 }, { at = 0, sound = "rbxasset://sounds/swoosh.wav" } } }, mode = "join" }
BW.check(ls ~= nil and ls:IsA("LocalScript"), "BW.cutscene LocalScript")
