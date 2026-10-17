
-- ---------------------------------------------------------------------------
-- Lurong finish (the same block in every Lurong script)
-- ---------------------------------------------------------------------------
-- Stud guarantee: every surface of every part is studded. A classic variant
-- is kept when the pack really has it; anything else becomes Universal.
-- Neon stays glowing only where it is thin (a lens, a strip, a core bar).
if studsLoaded then
	local STUDDED = { ["2022 Universal"] = true, ["2022 Small Stud"] = true, ["2022 Big Stud"] = true,
		["2022 Weld"] = true, ["2022 Glue"] = true }
	for _, p in ipairs(model:GetDescendants()) do
		if p:IsA("BasePart") then
			local s = p.Size
			local thin = math.min(s.X, math.min(s.Y, s.Z))
			local glowing = p.Material == Enum.Material.Neon and thin <= 2.2
			if not glowing then
				p.Material = Enum.Material.Glacier
				if not STUDDED[p.MaterialVariant] or not MS:FindFirstChild(p.MaterialVariant) then
					p.MaterialVariant = "2022 Universal"
				end
			end
		end
	end
end

-- Wheel check: a wheel, tyre or hub whose axle points up would lie flat like
-- a coin. Stand it back up.
for _, p in ipairs(model:GetDescendants()) do
	if p:IsA("Part") and p.Shape == Enum.PartType.Cylinder then
		local n = string.lower(p.Name)
		local isWheel = string.find(n, "wheel") or string.find(n, "tyre") or string.find(n, "tire") or string.find(n, "hub")
		if isWheel and not string.find(n, "steer") and math.abs(p.CFrame.RightVector.Y) > 0.7 then
			p.CFrame = CFrame.new(p.CFrame.Position)
		end
	end
end

model.Parent = workspace

local count = 0
for _, d in ipairs(model:GetDescendants()) do
	if d:IsA("BasePart") then count = count + 1 end
end
local ext = model:GetExtentsSize()
print(string.format("%s built: %d parts, %.1f x %.1f x %.1f studs", model.Name, count, ext.X, ext.Y, ext.Z))
