/**
 * Brickwire Project Analyzer / Optimizer (2.0) — Luau bodies for wrapLuau (prelude: bw_path, bw_waypoint).
 * Analyzer is read-only. Optimizer applies only SAFE, reversible (Ctrl+Z) property changes; never edits scripts
 * and never deletes instances.
 */

export const OPTIMIZE_FIXES = [
  { id: "tiny_part_shadows", desc: "CastShadow=false on parts whose largest side < 2 studs" },
  { id: "mesh_fidelity_auto", desc: "RenderFidelity Precise → Automatic on MeshParts" },
  { id: "light_shadows_far", desc: "Shadows=false on lights with Range < 8 (barely visible shadow cost)" },
  { id: "decor_no_touch", desc: "CanTouch=false on anchored, non-colliding parts without scripts/TouchInterest" },
] as const;

export const PROJECT_ANALYZE_LUAU = String.raw`	local MAX = ARGS.maxSamples
	local issues = {}
	local function issue(id, severity, message, inst)
		local it = issues[id]
		if it == nil then
			it = { id = id, severity = severity, message = message, count = 0, samples = {} }
			issues[id] = it
		end
		it.count += 1
		if inst and #it.samples < MAX then table.insert(it.samples, bw_path(inst)) end
	end
	local c = { instances = 0, parts = 0, meshParts = 0, unions = 0, models = 0, scripts = 0, localScripts = 0, moduleScripts = 0,
		scriptLines = 0, remoteEvents = 0, remoteFunctions = 0, sounds = 0, particleEmitters = 0, particleRate = 0, lights = 0,
		shadowLights = 0, decals = 0, guis = 0, humanoids = 0 }
	local textures = {}
	local services = { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService" }
	local truncated = false
	local posKeys = {}
	for _, sname in ipairs(services) do
		local ok, svc = pcall(function() return game:GetService(sname) end)
		if ok and svc then
			for _, d in ipairs(svc:GetDescendants()) do
				c.instances += 1
				if c.instances > 250000 then truncated = true break end
				if d:IsA("BasePart") then
					c.parts += 1
					if d:IsA("MeshPart") then
						c.meshParts += 1
						if d.TextureID ~= "" then textures[d.TextureID] = true end
						if d.RenderFidelity == Enum.RenderFidelity.Precise then issue("mesh_precise", "info", "MeshParts with RenderFidelity=Precise (fix: mesh_fidelity_auto)", d) end
					elseif d:IsA("UnionOperation") then
						c.unions += 1
					end
					if sname == "Workspace" then
						local s = d.Size
						if d.CastShadow and math.max(s.X, s.Y, s.Z) < 2 then issue("tiny_shadows", "perf", "Tiny parts casting shadows (fix: tiny_part_shadows)", d) end
						local model = d:FindFirstAncestorOfClass("Model")
						local isChar = model and model:FindFirstChildOfClass("Humanoid") ~= nil
						if not d.Anchored and not isChar and #d:GetJoints() == 0 then issue("unanchored_loose", "warn", "Unanchored parts with no joints (will fall / cost physics)", d) end
						if d.Transparency >= 1 and d.CanCollide and d.Name ~= "HumanoidRootPart" then issue("invisible_walls", "info", "Invisible collidable parts (intended?)", d) end
						if d.Anchored and not d.CanCollide and d.CanTouch and d:FindFirstChildOfClass("TouchTransmitter") == nil then issue("decor_touch", "info", "Decorative parts with CanTouch=true (fix: decor_no_touch)", d) end
						local p = d.Position
						local key = string.format("%s|%.2f|%.2f|%.2f|%.2f|%.2f|%.2f", d.ClassName, p.X, p.Y, p.Z, s.X, s.Y, s.Z)
						if posKeys[key] then issue("duplicate_overlap", "warn", "Parts exactly overlapping another identical part (z-fighting/duplicates)", d) else posKeys[key] = true end
						if p.Y < workspace.FallenPartsDestroyHeight + 50 then issue("below_kill_plane", "warn", "Parts near/below FallenPartsDestroyHeight", d) end
					end
				elseif d:IsA("Model") then
					c.models += 1
					if d:FindFirstChildOfClass("Humanoid") then c.humanoids += 1 end
					if sname == "Workspace" and d.Parent == workspace and #d:GetDescendants() > 3000 then issue("huge_model", "perf", "Models with > 3000 descendants (consider StreamingEnabled / splitting)", d) end
				elseif d:IsA("LuaSourceContainer") then
					local src = ""
					pcall(function() src = d.Source end)
					local _, lines = string.gsub(src, "\n", "")
					c.scriptLines += lines + 1
					if d:IsA("ModuleScript") then c.moduleScripts += 1 elseif d:IsA("LocalScript") then c.localScripts += 1 else c.scripts += 1 end
					if string.match(src, "^%s*$") then issue("empty_script", "info", "Empty scripts", d) end
					local code = string.gsub(src, "%-%-[^\n]*", "")
					if string.find(code, "[^%.%w_]wait%s*%(") or string.find(code, "^wait%s*%(") or string.find(code, "[^%.%w_]spawn%s*%(") or string.find(code, "[^%.%w_]delay%s*%(") then
						issue("deprecated_wait", "warn", "Deprecated wait()/spawn()/delay() — use task.wait/task.spawn/task.delay", d)
					end
					if string.find(code, ":connect%(") then issue("deprecated_connect", "info", "Deprecated :connect() — use :Connect()", d) end
					for body in string.gmatch(code, "while%s+true%s+do(.-)end") do
						if not (string.find(body, "wait") or string.find(body, "Wait") or string.find(body, "yield") or string.find(body, "Heartbeat") or string.find(body, "RenderStepped")) then
							issue("loop_no_yield", "error", "'while true do' loop without a visible yield (can freeze the game) — heuristic", d)
							break
						end
					end
					if d:IsA("Script") and d.RunContext == Enum.RunContext.Legacy then
						if d:IsA("LocalScript") then
							if sname == "ServerScriptService" or sname == "ServerStorage" or sname == "Workspace" and d:FindFirstAncestorOfClass("Model") == nil then issue("localscript_never_runs", "error", "LocalScripts in a location where they never run", d) end
						elseif sname == "ReplicatedStorage" or sname == "StarterGui" or sname == "StarterPack" or sname == "ReplicatedFirst" then
							issue("script_never_runs", "error", "Server Scripts in a location where they never run", d)
						end
						if not d:IsA("LocalScript") and string.find(code, "LocalPlayer") then issue("server_localplayer", "error", "Server Script uses Players.LocalPlayer (nil on server)", d) end
					end
				elseif d:IsA("RemoteEvent") or d:IsA("UnreliableRemoteEvent") then c.remoteEvents += 1
				elseif d:IsA("RemoteFunction") then c.remoteFunctions += 1
				elseif d:IsA("Sound") then c.sounds += 1
				elseif d:IsA("ParticleEmitter") then
					c.particleEmitters += 1
					if d.Enabled then c.particleRate += d.Rate end
					if d.Enabled and d.Rate > 200 then issue("particle_rate", "perf", "ParticleEmitters with Rate > 200", d) end
				elseif d:IsA("Light") then
					c.lights += 1
					if d.Shadows then
						c.shadowLights += 1
						local okr, r = pcall(function() return d.Range end)
						if okr and r < 8 then issue("small_shadow_lights", "perf", "Short-range lights with Shadows on (fix: light_shadows_far)", d) end
					end
				elseif d:IsA("Decal") or d:IsA("Texture") then
					c.decals += 1
					textures[d.Texture] = true
				elseif d:IsA("LayerCollector") then
					c.guis += 1
				end
			end
		end
		if truncated then break end
	end
	local uniq = 0
	for _ in pairs(textures) do uniq += 1 end
	c.uniqueTextures = uniq
	if c.shadowLights > 40 then issue("many_shadow_lights", "perf", "More than 40 shadow-casting lights (" .. c.shadowLights .. ")") end
	if c.particleRate > 3000 then issue("particle_budget", "perf", "Total particle rate " .. math.floor(c.particleRate) .. "/s is high") end
	if c.remoteEvents + c.remoteFunctions > 150 then issue("many_remotes", "info", "Many remotes — consider a single router") end
	local okS, streaming = pcall(function() return workspace.StreamingEnabled end)
	if okS and not streaming and c.parts > 20000 then issue("no_streaming", "perf", "20k+ parts without StreamingEnabled") end
	local list, score = {}, 100
	local W = { error = 6, warn = 3, perf = 2, info = 0.5 }
	for _, it in pairs(issues) do
		table.insert(list, it)
		score -= math.min(15, (W[it.severity] or 1) * math.min(it.count, 5))
	end
	local order = { error = 1, warn = 2, perf = 3, info = 4 }
	table.sort(list, function(a, b) if order[a.severity] ~= order[b.severity] then return order[a.severity] < order[b.severity] end return a.count > b.count end)
	return { score = math.max(0, math.floor(score)), counts = c, issues = list, truncated = truncated, note = "Script checks are static text heuristics; verify before editing. Use project_optimize for safe automatic fixes." }`;

export const PROJECT_OPTIMIZE_LUAU = String.raw`	local want = {}
	for _, f in ipairs(ARGS.fixes) do want[f] = true end
	local changed = {}
	local samples = {}
	local function hit(id, inst, fn)
		changed[id] = (changed[id] or 0) + 1
		samples[id] = samples[id] or {}
		if #samples[id] < 8 then table.insert(samples[id], bw_path(inst)) end
		if not ARGS.dryRun then fn() end
	end
	for _, d in ipairs(workspace:GetDescendants()) do
		if d:IsA("BasePart") then
			local s = d.Size
			if want.tiny_part_shadows and d.CastShadow and math.max(s.X, s.Y, s.Z) < 2 then hit("tiny_part_shadows", d, function() d.CastShadow = false end) end
			if want.mesh_fidelity_auto and d:IsA("MeshPart") and d.RenderFidelity == Enum.RenderFidelity.Precise then hit("mesh_fidelity_auto", d, function() d.RenderFidelity = Enum.RenderFidelity.Automatic end) end
			if want.decor_no_touch and d.Anchored and not d.CanCollide and d.CanTouch and d:FindFirstChildOfClass("TouchTransmitter") == nil and d:FindFirstChildWhichIsA("LuaSourceContainer") == nil then
				hit("decor_no_touch", d, function() d.CanTouch = false end)
			end
		elseif want.light_shadows_far and d:IsA("Light") and d.Shadows then
			local ok, r = pcall(function() return d.Range end)
			if ok and r < 8 then hit("light_shadows_far", d, function() d.Shadows = false end) end
		end
	end
	if not ARGS.dryRun then bw_waypoint("Brickwire project_optimize") end
	return { dryRun = ARGS.dryRun, changed = changed, samples = samples, undo = if ARGS.dryRun then nil else "Ctrl+Z (single waypoint)" }`;
