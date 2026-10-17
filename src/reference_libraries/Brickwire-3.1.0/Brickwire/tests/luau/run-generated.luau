
-- Execute every script the BW helpers generated, once, with "script" bound (TEST ONLY).
for _, d in ipairs(game:GetDescendants()) do
	if d:IsA("LuaSourceContainer") and string.sub(d.Name, 1, 3) == "BW_" then
		local f, cerr = loadstring(d.Source, "=" .. d:GetFullName())
		if not f then error("compile " .. d:GetFullName() .. ": " .. tostring(cerr), 0) end
		setfenv(f, setmetatable({ script = d }, { __index = getfenv() }))
		__WAITS = 0
		local ok, e = pcall(f)
		if not ok and not string.find(tostring(e), "__STOP_LOOP", 1, true) then error("runtime " .. d:GetFullName() .. ": " .. tostring(e), 0) end
		print("BW_RUN OK " .. d:GetFullName())
	end
end
print("BW_PLAYED " .. table.concat(__PLAYED, " "))
