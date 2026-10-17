-- Runs the BrickwireVFX / BrickwireCinema runtime modules in the stub (appended after the library). Prints RUN lines.
local function load(m)
	local fn, err = loadstring(rawget(m, "__props").Source, "=" .. m.Name)
	assert(fn, err)
	setfenv(fn, getfenv())
	return fn()
end
local function run(label, f, ...)
	local ok, e = pcall(f, ...)
	print("RUN " .. (ok and "OK " or "FAIL ") .. label .. (ok and "" or (" :: " .. tostring(e))))
	return ok, e
end
-- VFX: every preset on the server and on the client (shake), plus helpers
local VFX = load(BW.vfxLib())
for _, client in ipairs({ false, true }) do
	__IS_CLIENT = client
	for _, n in ipairs(VFX.list()) do
		run("vfx " .. n .. (client and " client" or " server"), VFX.play, n, CFrame.new(0, 5, 0), { scale = 1.3, color = "#FF0000" })
	end
end
__IS_CLIENT = false
local part = BW.part{ Name = "FxTarget", Size = { 2, 2, 2 }, Position = { 0, 3, 0 } }
run("vfx at part", VFX.play, "explosion", part)
run("vfx at vector", VFX.play, "heal", Vector3.new(1, 2, 3))
run("vfx bolt", VFX.bolt, Vector3.new(0, 0, 0), Vector3.new(0, 30, 0))
run("vfx trail", VFX.trail, part)
run("vfx flash", VFX.flash, part)
run("vfx unknown rejected", function() assert(not pcall(VFX.play, "nope", part)) end)
print("RUN EMITTED " .. tostring(__EMITTED))
-- Cinema: math + checks + client playback
local Cinema = load(BW.cinemaLib())
run("ease endpoints", function()
	for name in pairs(Cinema.EASE) do
		assert(math.abs(Cinema.ease(name, 0)) < 1e-6, name .. "(0)")
		assert(math.abs(Cinema.ease(name, 1) - 1) < 1e-6, name .. "(1)")
	end
end)
local castle = BW.part{ Name = "Castle", Size = { 30, 20, 30 }, Position = { 0, 10, 0 } }
run("flyby constant speed", function()
	local s = { type = "flyby", points = { { 0, 50, -100 }, { 10, 30, -60 }, { 60, 20, -50 }, { 40, 10, -20 } }, look = "Workspace.Castle", time = 5, ease = "linear" }
	local prev, steps = nil, {}
	for k = 0, 40 do
		local p = Cinema.sample(s, k / 40)
		if prev then table.insert(steps, (p - prev).Magnitude) end
		prev = p
	end
	local lo, hi = math.huge, 0
	for _, d in ipairs(steps) do lo, hi = math.min(lo, d), math.max(hi, d) end
	assert(hi / lo < 1.25, string.format("speed varies %.2f..%.2f", lo, hi))
	local p0 = Cinema.sample(s, 0)
	assert((p0 - Vector3.new(0, 50, -100)).Magnitude < 1e-6, "starts at first point")
	local p1 = Cinema.sample(s, 1)
	assert((p1 - Vector3.new(40, 10, -20)).Magnitude < 1e-3, "ends at last point")
end)
for _, style in ipairs({ "intro", "showcase", "epic", "boss", "trailer", "menu" }) do
	run("auto " .. style, function()
		local shots = Cinema.auto("Workspace.Castle", style)
		assert(#shots >= 1)
		local r = Cinema.check(shots, { loop = style == "menu", maxTotal = style == "menu" and 120 or 40 })
		assert(r.ok, table.concat(r.issues, " | "))
		for _, s in ipairs(shots) do
			for k = 0, 10 do
				local pos, look = Cinema.sample(s, k / 10)
				assert((pos - Vector3.new(0, 10, 0)).Magnitude > 8, style .. " " .. s.type .. ": camera inside the castle")
				assert((look - pos).Magnitude > 2, "look too close")
			end
		end
	end)
end
run("check catches bad shots", function()
	local r = Cinema.check({ { type = "dolly", from = { 0, 5, 0 }, to = { 0, 5, 900 }, time = 1 }, { type = "hold", pos = { 0, 5, 0 }, look = { 0, 6, 0 }, time = 3, fov = 140, roll = 40 } })
	assert(not r.ok and #r.issues >= 4, "expected ≥4 issues, got " .. #r.issues .. ": " .. table.concat(r.issues, " | "))
end)
run("at / duration", function()
	local shots = { { type = "hold", pos = { 0, 5, 20 }, look = { 0, 0, 0 }, time = 2 }, { type = "hold", pos = { 0, 5, 30 }, look = { 0, 0, 0 }, time = 4 } }
	assert(Cinema.duration(shots) == 6)
	local i, p = Cinema.at(shots, 3)
	assert(i == 2 and math.abs(p - 0.25) < 1e-6)
end)
run("preview", Cinema.preview, Cinema.auto("Workspace.Castle", "intro"), 7)
run("play rejects server", function() __IS_CLIENT = false assert(not pcall(Cinema.play, Cinema.auto(castle, "boss"))) end)
run("play client", function()
	__IS_CLIENT = true
	local h = Cinema.play(Cinema.auto(castle, "trailer"), { dof = true, fadeIn = 0.5, fadeOut = 0.5 })
	assert(type(h.stop) == "function")
	h.stop()
	__IS_CLIENT = false
end)
run("BW.shots + camCheck + literal", function()
	local shots = BW.shots(castle, "epic")
	assert(BW.camCheck(shots).ok)
	local litSrc = "return " .. BW._shotsLiteral(shots)
	local f = loadstring(litSrc)
	assert(f, "literal compiles")
	local back = f()
	assert(#back == #shots and back[1].type == shots[1].type)
	BW.camPreview(shots, 2)
end)
