-- objects
local m = BW.model("Shop")
local coin = BW.part{Name="Coin", Class="Part", Shape="Cylinder", Size={0.4,3,3}, Position={0,3,0}, Color="#FFD700", Material="Neon"}
BW.animate(coin, "hover", {height=0.5, speed=90})
local fan = BW.part{Name="Fan", Size={8,0.2,1}, Position={6,8,0}}
BW.animate(fan, "spin", {speed=360, axis="Y"})
local lamp = BW.part{Name="Lamp", Size={1,4,1}, Position={-6,8,0}}
BW.animate(lamp, "swing", {angle=20, hinge={0,2,0}})
BW.animate(m, "bob", {height=0.2})
local door = BW.part{Name="Door", Size={4,7,0.5}, Position={0,3.5,-8}, Color="#6B4226"}
BW.door(door, {hinge="right", angle=100, autoClose=4})
BW.door(BW.part{Name="Gate", Size={6,6,0.5}, Position={10,3,-8}}, {mode="slide", offset={0,-6,0}})
local ok, err = pcall(function() BW.animate(m, "pulse") end)
BW.check(not ok and string.find(err, "BasePart", 1, true) ~= nil, "pulse on model rejected")
ok, err = pcall(function() BW.animate(coin, "teleport") end)
BW.check(not ok and string.find(err, "unknown motion", 1, true) ~= nil, "unknown motion rejected")
-- switching motion replaces the old script
BW.animate(coin, "spin")
BW.check(coin:FindFirstChild("BW_Anim_hover") == nil and coin:FindFirstChild("BW_Anim_spin") ~= nil, "one motion per object")

-- characters
local npc = BW.rig("Guard", {Position={0,3,10}, Facing=180, DisplayName="Guard"})
BW.check(npc:FindFirstChild("HumanoidRootPart").Anchored == true, "static rig anchored")
local joints = BW.joints(npc)
BW.check(#joints == 15, "R15 joints: " .. #joints)
local wave = BW.keyframes(npc, "GuardWave", {
	{time=0, poses={RightUpperArm={0,0,0}}},
	{time=0.3, poses={RightUpperArm={0,0,150}, RightLowerArm={rot={0,0,20}}, Head={0,15,0}}, easing="Cubic"},
	{time=0.6, poses={RightUpperArm={0,0,120}, RightLowerArm={rot={0,0,-20}}}},
	{time=0.9, poses={RightUpperArm={0,0,0}}},
}, {loop=true, priority="Action"})
-- pose hierarchy follows the joints: KF2 > HumanoidRootPart > LowerTorso > UpperTorso > RightUpperArm > RightLowerArm
local kf2 = wave:FindFirstChild("KF2")
local ra = kf2.HumanoidRootPart.LowerTorso.UpperTorso.RightUpperArm.RightLowerArm
BW.check(ra ~= nil and kf2.HumanoidRootPart.LowerTorso.UpperTorso.Head ~= nil, "pose hierarchy")
BW.check(wave.Loop == true, "loop")
ok, err = pcall(function() BW.keyframes(npc, "Bad", {{time=0, poses={Tail={0,0,0}}}, {time=1, poses={}}}) end)
BW.check(not ok and string.find(err, "not a joint", 1, true) ~= nil and string.find(err, "RightUpperArm", 1, true) ~= nil, "bad joint lists valid joints")
ok, err = pcall(function() BW.keyframes(npc, "Bad2", {{time=0.5, poses={}}, {time=0.2, poses={}}}) end)
BW.check(not ok, "times must increase")
BW.playAnim(npc, "GuardWave")
BW.playAnim(npc, "dance", {name="BW_Dance"})
BW.playAnim(npc, 507770239, {name="BW_Id"})
ok, err = pcall(function() BW.playAnim(npc, "moonwalk") end)
BW.check(not ok and string.find(err, "wave", 1, true) ~= nil, "unknown anim lists presets")
local walker = BW.rig("Villager", {type="R6", Position={20,3,0}})
BW.check(#BW.joints(walker, true) == 6, "R6 joints")
BW.part{Name="WP1", Size={1,1,1}, Position={30,0.5,0}, Transparency=1}
BW.patrol(walker, {{20,3,0}, "Workspace.Shop.WP1"}, {speed=10, pause=2})
BW.check(walker.HumanoidRootPart.Anchored == false, "patrol unanchors")
BW.playerAnims({walk="walk", idle=507766666, run="run"})
ok = pcall(function() BW.playerAnims({fly="walk"}) end)
BW.check(not ok, "unknown slot rejected")
local sword = BW.new("Tool", {Name="Sword", Parent="StarterPack"})
BW.part{Name="Handle", Size={0.4,4,0.4}, Parent=sword, Anchored=false}
BW.toolAnim(sword, "slash")
BW.check(sword:FindFirstChild("BW_ToolAnim").ClassName == "LocalScript", "tool LocalScript")

-- dump generated sources for the syntax check in the TS test
for _, d in ipairs(game:GetDescendants()) do
	if d:IsA("LuaSourceContainer") and string.sub(d.Name, 1, 3) == "BW_" then
		print("BW_SRC_BEGIN " .. d:GetFullName())
		print(d.Source)
		print("BW_SRC_END")
	end
end
