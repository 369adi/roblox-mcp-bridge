local p = BW.part{Name="Torch", Size={1,4,1}, Position={0,2,0}}
BW.particles(p, "fire")
BW.particles(p, "smoke", {Rate=4})
BW.light(p, "PointLight", {Color="#FFA040", Range=16})
BW.report(p)
local ok, err = pcall(function() BW.particles(p, "laser") end)
BW.check(not ok, "unknown preset rejected: " .. tostring(err))
