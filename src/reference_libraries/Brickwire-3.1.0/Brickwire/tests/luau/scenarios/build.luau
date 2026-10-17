local m = BW.model("House")
BW.part{Name="Floor", Size={20,1,20}, Position={0,0.5,0}, Color="#8B5A2B", Material="WoodPlanks"}
for i, x in ipairs({-9.5, 9.5}) do BW.part{Name="Wall"..i, Size={1,10,20}, Position={x,6,0}, Color="#EEEEEE"} end
BW.part{Name="Roof", Class="WedgePart", Size={20,4,10}, Position={0,13,5}, Color="Bright red"}
BW.report(m)
BW.model("House") -- rebuild replaces own model
BW.check(#workspace:GetChildren() == 3, "only one House")
local ok, err = pcall(function() BW.model("Baseplate") end)
BW.check(not ok and string.find(err, "not made by the agent") ~= nil, "refuses to replace user's object")
