BW.leaderstats({"Coins", Kills = 0})
local lava = BW.part{Name="Lava", Size={10,1,10}, Position={0,0.5,20}, Color="#FF4400", Material="Neon"}
BW.killPart(lava)
BW.source("ServerScriptService.Leaderstats")
BW.check(BW.find("Workspace.Lava.KillScript") ~= nil, "kill script inside part")
