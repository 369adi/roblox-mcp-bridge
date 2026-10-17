-- 1.6 building kit v2 + QA helpers for every category.
local fp = BW.floorplan({
	"#######WW#######",
	"#......#.......#",
	"#......D.......#",
	"#......#.......#",
	"W......#.......W",
	"#......#.......#",
	"####D######D####",
}, {At={0,0,0}, cell=2, height=10, palette="medieval", Name="Inn"})
BW.check(fp:GetAttribute("BW_Top") == 11, "floorplan top")
local glass = 0
for _, p in ipairs(fp:GetChildren()) do if p.Name == "Glass" then glass += 1 end end
BW.check(glass == 3, "3 window runs → 3 glass panes, got " .. glass)
local r = BW.inspect(fp)
BW.check(r.ok, "floorplan is clean")

local b = BW.building{At={60,0,0}, Size={28,26}, floors=3, floorHeight=12, palette="modern", windows=3, roof="flat", Name="Office"}
BW.check(b:GetAttribute("BW_Top") == 37, "3 floors x 12 + roof slab: " .. tostring(b:GetAttribute("BW_Top")))
BW.check(b:FindFirstChild("Stairs1") and b:FindFirstChild("Stairs2") and not b:FindFirstChild("Stairs3"), "stairs between floors")
BW.check(b:FindFirstChild("Floor2d") ~= nil, "slab with a stair hole")
local ins = BW.inspect(b)
BW.check(#ins.buried == 0 and #ins.loose == 0, "building has no buried/loose parts")
BW.check(#ins.floating == 0, "building has no floating parts: " .. table.concat(ins.floating, ","))
local ok = pcall(function() BW.building{At={0,0,200}, Size={16,16}, floors=2, floorHeight=12} end)
BW.check(not ok, "too shallow for stairs → clear error")

local g = BW.building{At={-60,0,0}, Size={20,24}, floors=1, palette="medieval", roof="gable", Name="Barn"}
BW.check(g:FindFirstChild("Roof") ~= nil, "gable roof")

BW.path({{0,20}, {30,20}, {30,40}, {60,45}}, {width=5, Name="Road"})
local trees = BW.scatter({From={-40,60}, To={40,100}}, 12, function(i, pos, rnd)
	return BW.plant{At=pos, style=(i % 2 == 0) and "pine" or "oak", height=10 + rnd(0, 6), Name="Tree"..i}
end, {seed=7, minDist=8})
BW.check(#trees == 12, "scatter placed 12 trees")
local again = {}
local rnd1, rnd2 = BW.rng(3), BW.rng(3)
BW.check(rnd1(0, 100) == rnd2(0, 100), "rng is deterministic")
BW.column{At={0,0,-30}, height=12, diameter=2}
BW.arch({-6,-40}, {6,-40}, {y=8})

-- UI QA
local sg = BW.screen("QAUI")
local f = BW.ui("Frame", {Name="Wide", Parent=sg, Size={0,600,0,300}, Position={0.5,-300,0.5,-150}, BackgroundColor3="#202020"})
BW.ui("TextButton", {Name="Tiny", Parent=f, Size={0,80,0,16}, Text="x", TextSize=9, BackgroundColor3="#2A2A2A", TextColor3="#303030"})
local u = BW.uiCheck(sg)
BW.check(not u.ok and #u.issues >= 4, "uiCheck finds phone width, tiny text, low contrast, small button, no script: " .. #u.issues)

-- script lint
BW.script("Script", "Bad", "ServerScriptService", "while true do\n  print(game.Players.LocalPlayer)\nend\nlocal r = game.ReplicatedStorage.X\nr.OnServerEvent:Connect(function(p, price) p.leaderstats.Coins.Value -= price end)")
local l = BW.lint("ServerScriptService.Bad")
BW.check(l.problems >= 3, "lint finds LocalPlayer on server, busy loop, unvalidated remote: " .. l.problems)
BW.script("Script", "Good", "ServerScriptService", "local x = 1\ntask.wait(1)\nprint(x)")
BW.check(BW.lint("ServerScriptService.Good").ok, "clean script passes lint")

-- fx QA
local p = BW.part{Name="FxPart", At={0,0,-60}, Size={2,2,2}}
BW.particles(p, "fire", {Rate=500})
BW.light(p, "PointLight", {Range=80})
local fx = BW.fxCheck(p)
BW.check(#fx.issues == 2, "fxCheck: heavy rate + light range: " .. #fx.issues)
BW.gameCheck()
