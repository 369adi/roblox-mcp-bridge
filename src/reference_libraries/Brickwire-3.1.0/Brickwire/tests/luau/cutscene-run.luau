-- 1.9: runs the BrickwireCutscene runtime module in the stub (appended after fx-cinema-run.luau). Prints RUN lines.
local Cut = load(BW.cutsceneLib())
__FOV0 = workspace.CurrentCamera.FieldOfView
local RAR = Cut.RARITIES
run("rarity order + feel grows with tier", function()
	assert(#RAR == 7 and RAR[1] == "Common" and RAR[7] == "Secret")
	local prev
	for i, r in ipairs(RAR) do
		local R = Cut.rarity(r)
		assert(R.tier == i and Cut.tier(r) == i and Cut.tier(string.lower(r)) == i, r)
		if prev then assert(R.pause > prev.pause and R.shake > prev.shake, "monotonic " .. r) end
		prev = R
	end
	assert(Cut.rarity("Legendary").big and not Cut.rarity("Rare").big)
	assert(Cut.rarity("Mythic").fakeout and not Cut.rarity("Mythic", "clean").fakeout, "fake ending only in animedice")
	assert(Cut.rarity("Secret").rainbow)
	assert(Cut.tier("???") == 1 and Cut.tier(99) == 7)
end)
run("odds text", function()
	assert(Cut.odds(300) == "1 in 300", Cut.odds(300))
	assert(Cut.odds(20000) == "1 in 20k", Cut.odds(20000))
	assert(Cut.odds(17250) == "1 in 17.3k", Cut.odds(17250))
	assert(Cut.odds(2.5e6) == "1 in 2.5M", Cut.odds(2.5e6))
	assert(Cut.odds(0.01) == "1 in 100", Cut.odds(0.01))
	assert(Cut.odds(nil) == "")
end)
run("ease endpoints", function()
	for name in pairs(Cut.EASE) do
		assert(math.abs(Cut.ease(name, 0)) < 1e-6 and math.abs(Cut.ease(name, 1) - 1) < 1e-6, name)
	end
end)
local POOL = { { name = "A", rarity = "Common", odds = 2 }, { name = "B", rarity = "Rare", odds = 30 }, { name = "C", rarity = "Secret", odds = 10000000 } }
run("server roll: weighted, luck, refuses client", function()
	local counts = { A = 0, B = 0, C = 0 }
	for _ = 1, 3000 do local it = Cut.roll(POOL) counts[it.name] += 1 assert(it.odds and it.rarity and it.index) end
	assert(counts.A > counts.B and counts.B > counts.C, "weights")
	local lucky = 0
	for _ = 1, 3000 do if Cut.roll(POOL, { luck = 50 }).name == "B" then lucky += 1 end end
	assert(lucky > counts.B, "luck boosts rares")
	__IS_CLIENT = true
	assert(not pcall(Cut.roll, POOL), "roll on the client must fail")
	__IS_CLIENT = false
	assert(not pcall(Cut.roll, {}), "empty pool")
end)
-- every ready scene for every rarity passes its own quality gate
for _, kind in ipairs({ "case", "egg", "dice" }) do
	for _, st in ipairs({ "animedice", "clean" }) do
		run("check " .. kind .. " " .. st .. " all rarities", function()
			for _, r in ipairs(RAR) do
				local item = { name = "X", rarity = r, odds = 1000 }
				local tl = Cut.build(kind, { result = item, results = kind == "egg" and { item, { name = "Y", rarity = "Common" } } or nil, __server = true, pool = POOL, opts = { style = st } })
				local rep = Cut.check(tl)
				assert(rep.ok, kind .. " " .. r .. ": " .. table.concat(rep.issues, " | "))
				assert(rep.duration > 0)
			end
		end)
	end
end
run("check event + story", function()
	local castle = workspace:FindFirstChild("Castle")
	for _, tl in ipairs({ Cut.eventTimeline({ zone = "Workspace.Castle", name = "Meteor" }), Cut.eventTimeline({}), Cut.storyTimeline({ { text = "Long ago, a crystal held the world together." }, { text = "Then it cracked." }, { text = "Now it is your turn, hero." } }) }) do
		local rep = Cut.check(tl, { world = false })
		assert(rep.ok, tl.kind .. ": " .. table.concat(rep.issues, " | "))
	end
	assert(castle)
end)
run("check catches bad timelines", function()
	local bad = { kind = "case", skip = false, reward = true, events = { { at = 0, say = "This sentence is far too long to read in half a second", time = 0.5 }, { at = 9, title = "WIN" }, { at = 9, flash = true }, { at = 9, shake = 1 } } }
	local r = Cut.check(bad)
	local all = table.concat(r.issues, " | ")
	for _, k in ipairs({ "too long", "no Skip", "no sound", "to read", "SERVER" }) do assert(string.find(all, k, 1, true), "missing issue '" .. k .. "': " .. all) end
	local short = Cut.check({ kind = "egg", events = { { at = 0, sound = "x", time = 1 } } }, { serverResult = true })
	assert(string.find(table.concat(short.issues, "|"), "too short", 1, true))
	local cam = Cut.check({ events = { { at = 0, sound = "x" }, { at = 0, camera = { { type = "dolly", from = { 0, 5, 0 }, to = { 0, 5, 900 }, time = 1 } } } } }, { world = false })
	assert(string.find(table.concat(cam.issues, "|"), "camera:", 1, true), "camera issues forwarded")
end)
-- client playback: every scene, both styles, normal + skip
__IS_CLIENT = true
local function played(label, fn)
	run(label, function()
		local before = __SOUNDS
		local h = fn()
		assert(type(h) == "table" and h.stop and h.skip, "handle")
		assert(__SOUNDS > before, "no sound played")
		h.stop()
		assert(h.done, "stopped")
	end)
end
for _, st in ipairs({ "animedice", "clean" }) do
	for _, r in ipairs({ "Common", "Epic", "Mythic", "Secret" }) do
		local item = { name = "Unit " .. r, rarity = r, odds = 5000, mutation = r == "Secret" and "Titanic" or nil }
		played("play case " .. st .. " " .. r, function() return Cut.caseOpen(item, { pool = POOL, style = st, serverResult = true }) end)
		played("play egg " .. st .. " " .. r, function() return Cut.eggHatch({ item, item, item }, { style = st }) end)
		played("play dice " .. st .. " " .. r, function() return Cut.diceRoll(item, { pool = POOL, style = st }) end)
	end
end
played("play event", function() return Cut.eventStart({ zone = "Workspace.Castle", name = "Meteor Shower", music = "rbxassetid://1" }) end)
played("play story", function() return Cut.story({ { shot = { type = "orbit", target = "Workspace.Castle", radius = 40, height = 12, from = 0, to = 60, time = 4 }, text = "Long ago…", speaker = "Elder" }, { text = "Then it broke." }, { text = "Now go." } }, { title = "PROLOGUE" }) end)
played("play custom timeline (all event types)", function()
	return Cut.play({ events = {
		{ at = 0, camera = { { type = "push_in", target = "Workspace.Castle", from = 50, to = 20, height = 6, time = 3 } } },
		{ at = 0, sound = "rbxassetid://123", music = true, fadeIn = 1, fadeOut = 1, time = 5 },
		{ at = 0.2, say = "You came…", speaker = "Boss", time = 2.5 },
		{ at = 1, title = "BOSS FIGHT", sub = "Shadow King", time = 2, rainbow = true },
		{ at = 1, shake = 0.8, time = 0.4 }, { at = 1, flash = "#FF0000", time = 0.2 }, { at = 1, vfx = "explosion", where = "Workspace.Castle" },
		{ at = 2, tween = "Workspace.Castle", goal = { Transparency = 1 }, time = 1 },
		{ at = 2, fov = 50, time = 0.5 }, { at = 2, blur = 12, time = 0.3 }, { at = 2, color = { Saturation = -0.4, TintColor = "#FFE0E0" }, time = 1 },
		{ at = 2, dim = 0.5 }, { at = 2, letterbox = true }, { at = 3, cut = { pos = Vector3.new(0, 20, 40), look = Vector3.new(0, 10, 0) } },
		{ at = 3, fire = "Ready" },
	} }, { letterbox = true, onEvent = function(n) __EVENT = n end })
end)
run("custom timeline fired its event", function() assert(__EVENT == "Ready", tostring(__EVENT)) end)
run("skip shows the result and closes", function()
	local h = Cut.diceRoll({ name = "Z", rarity = "Legendary", odds = 9000 }, { pool = POOL })
	local wasDone = h.done
	h.skip()
	assert(h.done and (wasDone or h.skipped), "skip finishes")
	local h2 = Cut.play({ events = { { at = 0, sound = "x", time = 5 } }, autoFinish = false }, {})
	h2.skip()
	assert(h2.done, "skip without onSkip finishes")
end)
run("camera restored after play", function()
	local cam = workspace.CurrentCamera
	assert(cam.CameraType == Enum.CameraType.Custom, "camera type " .. tostring(cam.CameraType))
	assert(cam.FieldOfView == __FOV0, "fov " .. tostring(cam.FieldOfView) .. " vs " .. tostring(__FOV0))
end)
run("listen/run dispatch + unknown scene", function()
	__IS_CLIENT = false
	Cut.remote()
	__IS_CLIENT = true
	Cut.listen()
	assert(__CLIENT_HANDLER, "OnClientEvent connected")
	__CLIENT_HANDLER("dice", { result = { name = "Q", rarity = "Rare", odds = 30 }, pool = POOL, __server = true })
	assert(not pcall(Cut.build, "nope", {}))
	Cut.request("roll")
	assert(__FIRED[#__FIRED][1] == "server" and __FIRED[#__FIRED][2] == "roll")
end)
__IS_CLIENT = false
run("server show: one / all / list", function()
	local p = __LOCAL_PLAYER
	Cut.show(p, "case", { result = Cut.roll(POOL), pool = POOL })
	assert(__FIRED[#__FIRED][1] == "one" and __FIRED[#__FIRED][3].__server == true)
	Cut.show("all", "event", { name = "E" })
	assert(__FIRED[#__FIRED][1] == "all")
	Cut.show({ p, p }, "story", { frames = {} })
	assert(__FIRED[#__FIRED][2] == "story")
	assert(not pcall(Cut.play, { events = {} }), "play on the server must fail")
end)
print("RUN SOUNDS " .. tostring(__SOUNDS))
