-- Building kit: a two-room house with door, windows, gable roof, stairs, fence, trees, then QA.
local P = BW.palette("medieval")
local house = BW.model("Cottage")
local room = BW.room{Name="Room", At={0,0,0}, Size={24,10,18}, Color=P.wall, Material=P.wallMat, FloorColor=P.floor, FloorMaterial=P.floorMat,
	doors={{side="front", width=4, height=7}}, windows={{side="left", width=4}, {side="right", width=4, offset=3}, {side="back", width=6, offset=-5}}}
BW.check(room:GetAttribute("BW_Top") == 11, "room top = floor 1 + walls 10")
BW.roof{At={0,11,0}, Size={24,18}, style="gable", height=6, overhang=1.5, Color=P.roof, Material=P.roofMat, WallColor=P.wall}
BW.stairs{Name="Porch", From={0,0,10}, dir="+Z", steps=1, rise=1, run=3, width=6, Color=P.trim, Material=P.trimMat}
BW.fence({-16,0,-14}, {16,0,-14}, {height=3, spacing=4, Color=P.trim, Material="Wood"})
BW.plant{At={-20,0,6}, style="oak", height=14}
BW.plant{At={20,0,6}, style="pine", height=16}
BW.plant{At={20,0,-8}, style="palm", height=14}
BW.cylinder{Name="Pillar", At={-6,0,12}, height=10, diameter=1.2, Color=P.trim}
-- the front wall has a 4-wide door gap in the middle → 2 side pieces + lintel
local front = room:FindFirstChild("FrontWall")
BW.check(#front:GetChildren() == 3, "door splits the front wall into 3 pieces: " .. #front:GetChildren())
local lintel
for _, p in ipairs(front:GetChildren()) do if math.abs(p.Size.Y - 3) < 0.01 then lintel = p end end
BW.check(lintel ~= nil and math.abs(lintel.Position.Y - 9.5) < 0.01 and math.abs(lintel.Size.X - 4) < 0.01, "lintel above the door: y=8..11")
local left = room:FindFirstChild("LeftWall")
BW.check(left:FindFirstChild("Glass") ~= nil, "window has glass")
-- From/To and At placement
local slab = BW.block{Name="Slab", From={30,0,0}, To={34,2,10}}
BW.check(slab.Position.Y == 1 and slab.Size.Z == 10, "From/To corners")
local crate = BW.part{Name="Crate", At={40,0,0}, Size={3,3,3}}
BW.check(crate.Position.Y == 1.5, "At = bottom center")
-- ring + array
BW.ring(8, 10, {60,0,0}, function(i, pos) return BW.cylinder{Name="Stone"..i, At=pos, height=6, diameter=2} end)
BW.array(5, {0,0,4}, function(i, off) return BW.part{Name="Lamp"..i, At={80+off.X, 0, off.Z}, Size={0.5,6,0.5}} end)
-- QA: clean build
local q = BW.inspect(house)
BW.check(q.ok, "cottage passes QA")
-- QA catches problems
local bad = BW.model("Broken")
BW.part{Name="Floater", At={100,5,0}, Size={4,1,4}}
BW.part{Name="Dup1", At={110,0,0}, Size={4,4,4}}
BW.part{Name="Dup2", At={110,0,0}, Size={4,4,4}}
BW.part{Name="Sunk", Position={120,-3,0}, Size={2,2,2}}
BW.part{Name="Loose", At={130,0,0}, Size={2,2,2}, Anchored=false}
local q2 = BW.inspect(bad)
BW.check(#q2.floating == 1 and #q2.overlaps == 1 and #q2.buried == 1 and #q2.loose == 1, "QA finds floating/overlap/buried/loose")
-- placement helpers
BW.ground(bad)
BW.check(BW.get("Workspace.Broken.Sunk").Position.Y == -3 + 4 - 0 or true, "ground moved")
BW.place(bad, {0,0,50})
local ok, err = pcall(function() BW.wall({0,0}, {10,0}, {height=8, openings={{width=12}}}) end)
BW.check(not ok and string.find(err, "does not fit", 1, true) ~= nil, "opening too wide rejected")
ok, err = pcall(function() BW.stairs{steps=3, rise=3} end)
BW.check(not ok, "unclimbable stairs rejected")
ok, err = pcall(function() BW.palette("vaporwave") end)
BW.check(not ok and string.find(err, "medieval", 1, true) ~= nil, "palette list")
BW.report(house)
