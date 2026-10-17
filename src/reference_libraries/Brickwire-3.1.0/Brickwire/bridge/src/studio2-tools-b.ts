import type { CompositeTool } from "./composites.js";
import { pathSegments, wrapLuau } from "./luau.js";
import { listMechanics, planMechanicInstall, getMechanic, type MechConfigValue } from "../../shared/src/studio2/mechanics.js";
import {
  VFX_PRESETS, buildVfx, NPC_BEHAVIORS, npcAttributes, NPC_BRAIN_SOURCE, MAP_TYPES, generateMap, GENRES, designGame, economyCurve,
  type NpcSpec, type MapType, type Genre,
} from "../../shared/src/studio2/systems.js";

/** Brickwire 2.0 stage 3–6 tools: Mechanics, NPC, VFX Builder, Maps, Game Design, Debug/Test. */

const s = (description: string) => ({ type: "string", description });
const n = (description: string) => ({ type: "number", description });
const b = (description: string) => ({ type: "boolean", description });

/** Luau: back up then remove every instance tagged BrickwireMechanic=<id> (searched in all relevant services). */
const FIND_MECH = `	local SERVICES = { "Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer" }
	local function findMech(id)
		local out = {}
		for _, sn in ipairs(SERVICES) do
			for _, d in ipairs(game:GetService(sn):GetDescendants()) do
				local a = d:GetAttribute("BrickwireMechanic")
				if a ~= nil and (id == nil or a == id) and (d.Parent == nil or d.Parent:GetAttribute("BrickwireMechanic") ~= a) then table.insert(out, d) end
			end
		end
		return out
	end
	local function backupFolder()
		local SS = game:GetService("ServerStorage")
		local f = SS:FindFirstChild("BrickwireBackups") or Instance.new("Folder")
		f.Name = "BrickwireBackups"
		f.Parent = SS
		return f
	end
`;

export const STUDIO2_TOOLS_B: CompositeTool[] = [
  // ------------------------------------------------------------ Mechanics
  {
    name: "mechanic_list",
    description: "List the Mechanics Library (leaderstats+save, coins, checkpoints, kill bricks, sprint, double jump, day/night, doors, rounds, shop) with config options and dependencies.",
    risk: "read", requires: [], inputSchema: { type: "object", properties: {} },
    async run() { return { mechanics: listMechanics() }; },
  },
  {
    name: "mechanic_install",
    description: "Install a working gameplay mechanic (+ its dependencies) into the place. Config is stored as attributes on BW_<id> (change later with mechanic_configure, no code edits). Reinstall replaces the old copy (backup kept).",
    risk: "write", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["id"], properties: { id: s("Mechanic id"), config: { type: "object", description: "Config overrides" }, skipDependencies: b("Do not auto-install dependencies (default false)"), reinstall: b("Replace if already installed (default false: installed ones are skipped)") } },
    async run(a, ctx) {
      const plan = planMechanicInstall(String(a.id), (a.config as Record<string, MechConfigValue>) ?? {}, !a.skipDependencies);
      const items = plan.map((p) => ({ id: p.id, isDependency: p.isDependency, installs: p.installs.map((i) => ({ segs: pathSegments(`game.${i.service}`), node: i.node })) }));
      const res = await ctx.runLuau(wrapLuau({ items, reinstall: !!a.reinstall, main: String(a.id) }, `${FIND_MECH}
	local report = {}
	for _, item in ipairs(ARGS.items) do
		local existing = findMech(item.id)
		if #existing > 0 and (item.isDependency or not ARGS.reinstall) then
			table.insert(report, { id = item.id, status = "already installed" })
		else
			local backups = {}
			if #existing > 0 then
				local bf = backupFolder()
				for _, e in ipairs(existing) do
					e.Name = e.Name .. "_" .. os.date("!%Y%m%d_%H%M%S")
					e.Parent = bf
					table.insert(backups, bw_path(e))
				end
			end
			local created, errs = {}, {}
			for _, inst in ipairs(item.installs) do
				bw_create_tree(inst.node, bw_must(inst.segs), created, errs)
			end
			table.insert(report, { id = item.id, status = "installed", created = created, propertyErrors = errs, backups = backups })
		end
	end
	bw_waypoint("Brickwire mechanic_install " .. ARGS.main)
	return report`), { readOnly: false });
      const m = getMechanic(String(a.id));
      return { result: res, usage: m.usage, test: `test_run {checks:[{type:"mechanic",id:"${m.id}"}]}`, note: "Playtest (F5) to try it. DataStore saving in Studio needs Game Settings → Security → Enable Studio Access to API Services." };
    },
  },
  {
    name: "mechanic_status",
    description: "Show which Brickwire mechanics are installed, where, and their current config.",
    risk: "read", requires: ["execute_luau"], inputSchema: { type: "object", properties: {} },
    async run(_a, ctx) {
      return ctx.runLuau(wrapLuau({}, `${FIND_MECH}
	local out = {}
	for _, d in ipairs(findMech(nil)) do
		local id = d:GetAttribute("BrickwireMechanic")
		out[id] = out[id] or { id = id, paths = {}, config = {} }
		table.insert(out[id].paths, bw_path(d))
		for k, v in pairs(d:GetAttributes()) do if k ~= "BrickwireMechanic" then out[id].config[k] = bw_enc(v) end end
	end
	local list = {}
	for _, v in pairs(out) do table.insert(list, v) end
	return { installed = list }`), { readOnly: true });
    },
  },
  {
    name: "mechanic_configure",
    description: "Change config of an installed mechanic (writes attributes; scripts read them live or on next start).",
    risk: "write", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["id", "config"], properties: { id: s("Mechanic id"), config: { type: "object" } } },
    async run(a, ctx) {
      const m = getMechanic(String(a.id));
      const cfg = (a.config as Record<string, MechConfigValue>) ?? {};
      for (const [k, v] of Object.entries(cfg)) {
        if (!m.config[k]) throw new Error(`no config "${k}" — options: ${Object.keys(m.config).join(", ")}`);
        if (typeof v !== typeof m.config[k].default) throw new Error(`config ${k} must be ${typeof m.config[k].default}`);
      }
      return ctx.runLuau(wrapLuau({ id: m.id, cfg }, `${FIND_MECH}
	local changed = {}
	for _, d in ipairs(findMech(ARGS.id)) do
		if string.sub(d.Name, 1, 3) == "BW_" and d:IsA("Folder") and d:FindFirstChildWhichIsA("LuaSourceContainer") then
			for k, v in pairs(ARGS.cfg) do d:SetAttribute(k, v) end
			table.insert(changed, bw_path(d))
		end
	end
	if #changed == 0 then error("mechanic not installed: " .. ARGS.id, 0) end
	bw_waypoint("Brickwire mechanic_configure")
	return { changed = changed }`), { readOnly: false });
    },
  },
  {
    name: "mechanic_remove",
    description: "Remove an installed mechanic (all its instances). They are moved to ServerStorage.BrickwireBackups, not destroyed.",
    risk: "destructive", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["id"], properties: { id: s("Mechanic id") } },
    async run(a, ctx) {
      getMechanic(String(a.id));
      return ctx.runLuau(wrapLuau({ id: String(a.id) }, `${FIND_MECH}
	local found = findMech(ARGS.id)
	if #found == 0 then error("mechanic not installed: " .. ARGS.id, 0) end
	local bf = backupFolder()
	local moved = {}
	for _, d in ipairs(found) do
		local from = bw_path(d)
		d.Name = d.Name .. "_removed_" .. os.date("!%Y%m%d_%H%M%S")
		d.Parent = bf
		table.insert(moved, { from = from, backup = bw_path(d) })
	end
	bw_waypoint("Brickwire mechanic_remove " .. ARGS.id)
	return { removed = moved }`), { readOnly: false });
    },
  },
  // ------------------------------------------------------------ NPC
  {
    name: "npc_create",
    description: `Create a working NPC: rig (R6/R15) + brain script with behavior ${NPC_BEHAVIORS.join("/")} (PathfindingService), dialog via ProximityPrompt + bubble, damage for chase/guard. Behavior is attributes → editable later.`,
    risk: "write", requires: ["execute_luau"],
    inputSchema: {
      type: "object", required: ["name"],
      properties: {
        name: s("NPC name"), rig: { type: "string", enum: ["R6", "R15"] }, position: { type: "array", items: { type: "number" } },
        behavior: { type: "string", enum: [...NPC_BEHAVIORS] }, walkSpeed: n("Speed"), health: n("Max health"), damage: n("Damage per hit"), range: n("Detection/wander range"),
        dialog: { type: "array", items: { type: "string" } }, patrolPoints: { type: "array", items: { type: "array" } },
        bodyColor: s("#hex skin"), shirtColor: s("#hex torso"), pantsColor: s("#hex legs"), parent: s("Parent (default game.Workspace.BW_NPCs)"),
      },
    },
    async run(a, ctx) {
      const spec = a as unknown as NpcSpec;
      const attrs = npcAttributes(spec);
      return ctx.runLuau(wrapLuau({
        name: spec.name, rig: spec.rig ?? "R15", pos: spec.position ?? [0, 5, 10], attrs, health: spec.health ?? 100, brain: NPC_BRAIN_SOURCE,
        colors: { body: spec.bodyColor ?? null, shirt: spec.shirtColor ?? null, pants: spec.pantsColor ?? null },
        parentSegs: a.parent ? pathSegments(String(a.parent)) : null,
      }, `	local parent
	if ARGS.parentSegs ~= nil then parent = bw_must(ARGS.parentSegs) else
		parent = workspace:FindFirstChild("BW_NPCs") or Instance.new("Folder")
		parent.Name = "BW_NPCs"
		parent.Parent = workspace
	end
	local desc = Instance.new("HumanoidDescription")
	local function c(h) return Color3.fromHex(h) end
	if ARGS.colors.body then local col = c(ARGS.colors.body) desc.HeadColor = col desc.LeftArmColor = col desc.RightArmColor = col end
	if ARGS.colors.shirt then desc.TorsoColor = c(ARGS.colors.shirt) end
	if ARGS.colors.pants then local col = c(ARGS.colors.pants) desc.LeftLegColor = col desc.RightLegColor = col end
	local ok, npc = pcall(function() return game:GetService("Players"):CreateHumanoidModelFromDescription(desc, Enum.HumanoidRigType[ARGS.rig]) end)
	if not ok or not npc then error("could not create rig: " .. tostring(npc) .. " (insert one via Avatar → Rig Builder and use modify_instance)", 0) end
	npc.Name = ARGS.name
	local hum = npc:FindFirstChildOfClass("Humanoid")
	hum.MaxHealth = ARGS.health
	hum.Health = ARGS.health
	hum.DisplayName = ARGS.name
	for k, v in pairs(ARGS.attrs) do npc:SetAttribute(k, v) end
	npc:SetAttribute("BrickwireNPC", true)
	local brain = Instance.new("Script")
	brain.Name = "BW_NPCBrain"
	brain.Source = ARGS.brain
	brain.Parent = npc
	npc:PivotTo(CFrame.new(ARGS.pos[1], ARGS.pos[2], ARGS.pos[3]))
	npc.Parent = parent
	bw_waypoint("Brickwire npc_create " .. ARGS.name)
	return { path = bw_path(npc), behavior = ARGS.attrs.BW_Behavior, note = "Behavior runs in Play mode (F5). Change with modify_instance attributes BW_Behavior/BW_WalkSpeed/BW_Damage/BW_Range/BW_Dialog(JSON)." }`), { readOnly: false });
    },
  },
  // ------------------------------------------------------------ VFX Builder
  {
    name: "vfx_presets",
    description: "List VFX Builder presets (fire, smoke, sparkles, explosion, hit_impact, aura, heal, rain, portal, dust).",
    risk: "read", requires: [], inputSchema: { type: "object", properties: {} },
    async run() { return { presets: VFX_PRESETS.map((p) => ({ id: p.id, description: p.description, oneShot: !!p.burst })) }; },
  },
  {
    name: "vfx_build",
    description: "Build a layered VFX preset (Attachment + ParticleEmitters + light) on a BasePart/Attachment, tuned by color/color2/scale/intensity. One-shot presets are disabled and played with vfx_emit.",
    risk: "write", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["preset", "parent"], properties: { preset: { type: "string", enum: VFX_PRESETS.map((p) => p.id) }, parent: s("BasePart path"), color: s("#hex"), color2: s("#hex"), scale: n("0.1..10"), intensity: n("0.1..5"), name: s("Attachment name") } },
    async run(a, ctx) {
      const v = buildVfx(String(a.preset), a as never);
      return ctx.runLuau(wrapLuau({ segs: pathSegments(String(a.parent)), node: v.node }, `	local parent = bw_must(ARGS.segs)
	if not (parent:IsA("BasePart") or parent:IsA("Attachment")) then error("parent must be a BasePart or Attachment (got " .. parent.ClassName .. ")", 0) end
	local old = parent:FindFirstChild(ARGS.node.name)
	if old then old:Destroy() end
	local created, errs = {}, {}
	local root
	if parent:IsA("Attachment") then
		for _, ch in ipairs(ARGS.node.children) do bw_create_tree(ch, parent, created, errs) end
		root = parent
	else
		root = bw_create_tree(ARGS.node, parent, created, errs)
	end
	bw_waypoint("Brickwire vfx_build")
	return { path = bw_path(root), created = created, propertyErrors = errs }`), { readOnly: false }).then((r) => ({ studio: r, oneShot: v.burst, play: v.burst ? `vfx_emit {path:"${a.parent}.${v.node.name}"}` : "loops automatically" }));
    },
  },
  {
    name: "vfx_emit",
    description: "Play a one-shot VFX in edit mode (calls :Emit on every ParticleEmitter under the path) to preview it.",
    risk: "read", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: s("VFX attachment path"), count: n("Particles per emitter (default 20)") } },
    async run(a, ctx) {
      return ctx.runLuau(wrapLuau({ segs: pathSegments(String(a.path)), count: Number(a.count ?? 20) }, `	local root = bw_must(ARGS.segs)
	local n = 0
	for _, e in ipairs(root:GetDescendants()) do if e:IsA("ParticleEmitter") then e:Emit(ARGS.count) n += 1 end end
	if root:IsA("ParticleEmitter") then root:Emit(ARGS.count) n += 1 end
	return { emitters = n, runtime = "In game: for _, e in attachment:GetChildren() do if e:IsA('ParticleEmitter') then e:Emit(20) end end" }`), { readOnly: true });
    },
  },
  // ------------------------------------------------------------ Maps
  {
    name: "map_generate",
    description: `Generate a playable map (${MAP_TYPES.join(", ")}) deterministically from a seed: obby stages with checkpoints/kill parts, arena with cover+spawns, perfect maze (merged walls), city grid, terrain island. Use preview=true for stats only.`,
    risk: "write", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["type"], properties: { type: { type: "string", enum: [...MAP_TYPES] }, seed: n("Seed"), size: n("0.25..4"), difficulty: n("0..1 (obby)"), name: s("Model name"), origin: { type: "array", items: { type: "number" } }, preview: b("Only plan") } },
    async run(a, ctx) {
      const plan = generateMap(a.type as MapType, { seed: a.seed as number, size: a.size as number, difficulty: a.difficulty as number });
      const name = String(a.name ?? `BW_Map_${plan.type}_${plan.seed}`);
      if (a.preview) return { type: plan.type, seed: plan.seed, parts: plan.parts.length, terrain: plan.terrain ?? null, notes: plan.notes };
      const studio = await ctx.runLuau(wrapLuau({ name, rows: plan.parts, terrain: plan.terrain ?? null, origin: a.origin ?? [0, 0, 0], arena: plan.type === "arena" }, `	local CS = game:GetService("CollectionService")
	if workspace:FindFirstChild(ARGS.name) then error("Workspace." .. ARGS.name .. " exists — pass another name or seed", 0) end
	local model = Instance.new("Model")
	model.Name = ARGS.name
	model:SetAttribute("BrickwireMap", true)
	local o = Vector3.new(ARGS.origin[1], ARGS.origin[2], ARGS.origin[3])
	local cps = Instance.new("Folder")
	cps.Name = "Checkpoints"
	local ci, kills, spawns = 0, 0, 0
	for _, r in ipairs(ARGS.rows) do
		local p = Instance.new("Part")
		p.Anchored = true
		p.Size = Vector3.new(r[4], r[5], r[6])
		p.CFrame = CFrame.new(o + Vector3.new(r[1], r[2], r[3])) * CFrame.Angles(0, math.rad(r[7]), 0)
		p.Color = Color3.fromHex(r[8])
		local okm = pcall(function() p.Material = Enum.Material[r[9]] end)
		p.Name = r[10]
		p.TopSurface = Enum.SurfaceType.Smooth
		p.BottomSurface = Enum.SurfaceType.Smooth
		local f = r[11]
		if string.find(f, "k") then CS:AddTag(p, "BW_Kill") kills += 1 end
		if string.find(f, "c") then ci += 1 p.Parent = cps p:SetAttribute("Stage", ci) else p.Parent = model end
		if string.find(f, "s") then spawns += 1 p:SetAttribute("BW_Spawn", true) end
	end
	if ci > 0 then cps.Parent = model end
	if ARGS.terrain ~= nil then
		local T = ARGS.terrain
		local terrain = workspace.Terrain
		local step = 8
		local half = T.size / 2
		for x = -half, half, step do
			for z = -half, half, step do
				local d = math.sqrt(x * x + z * z) / half
				local fall = math.clamp(1 - d * d, 0, 1)
				local nz = math.noise(x / 90, z / 90, T.seed * 0.137) * 0.6 + math.noise(x / 30, z / 30, T.seed * 0.71) * 0.25
				local h = math.floor((fall * T.height * (0.7 + nz)) / 2) * 2
				if h > 1 then
					local mat = if h < T.water + 3 then Enum.Material.Sand elseif h > T.height * 0.8 then Enum.Material.Rock else Enum.Material.Grass
					terrain:FillBlock(CFrame.new(o + Vector3.new(x, h / 2, z)), Vector3.new(step, h, step), mat)
				end
			end
		end
		terrain:FillBlock(CFrame.new(o + Vector3.new(0, T.water / 2 - 2, 0)), Vector3.new(T.size * 1.6, T.water + 4, T.size * 1.6), Enum.Material.Water)
	end
	model.Parent = workspace
	if ARGS.arena then
		local ar = workspace:FindFirstChild("BW_Arena")
		if ar == nil then
			ar = Instance.new("Folder")
			ar.Name = "BW_Arena"
			ar.Parent = workspace
			for _, p in ipairs(model:GetChildren()) do if p:GetAttribute("BW_Spawn") then p.Parent = ar end end
		end
	end
	bw_waypoint("Brickwire map_generate " .. ARGS.name)
	return { path = bw_path(model), parts = #ARGS.rows, checkpoints = ci, killParts = kills, spawns = spawns, terrain = ARGS.terrain ~= nil }`), { readOnly: false });
      return { studio, notes: plan.notes, next: plan.type === "obby" ? "mechanic_install kill_brick; for checkpoints rename/move Checkpoints parts into Workspace.BW_Checkpoints (1..N) or use mechanic checkpoints" : undefined };
    },
  },
  // ------------------------------------------------------------ Game Design
  {
    name: "gd_design",
    description: `Game design brief for a genre (${GENRES.join(", ")}): core loop, first-session plan, retention, monetization, risks, economy table and a concrete Brickwire build plan (maps + mechanics). Optionally saves it as ModuleScript ReplicatedStorage.BrickwireDesign.`,
    risk: "write", requires: [],
    inputSchema: { type: "object", required: ["genre"], properties: { genre: { type: "string", enum: [...GENRES] }, name: s("Game name"), audience: s("Audience"), sessionMinutes: n("Target session length"), saveToStudio: b("Write ModuleScript (needs execute_luau)") } },
    async run(a, ctx) {
      const d = designGame({ genre: a.genre as Genre, name: a.name as string, audience: a.audience as string, sessionMinutes: a.sessionMinutes as number });
      let studio: unknown = null;
      if (a.saveToStudio) {
        const src = `-- Brickwire game design brief (generated)\nreturn game:GetService("HttpService"):JSONDecode([==[${JSON.stringify(d)}]==])\n`;
        studio = await ctx.runLuau(wrapLuau({ src }, `	local RS = game:GetService("ReplicatedStorage")
	local m = RS:FindFirstChild("BrickwireDesign") or Instance.new("ModuleScript")
	m.Name = "BrickwireDesign"
	m.Source = ARGS.src
	m.Parent = RS
	return { path = bw_path(m) }`), { readOnly: false });
      }
      return { design: d, studio };
    },
  },
  {
    name: "gd_economy",
    description: "Economy/progression calculator: cost = base·growth^n vs income, time-to-afford per level, balance warnings.",
    risk: "read", requires: [],
    inputSchema: { type: "object", properties: { base: n("Level 1 cost"), growth: n("Cost growth per level (e.g. 1.15)"), levels: n("Levels (≤200)"), incomeBase: n("Income/s at level 1"), incomeGrowth: n("Income growth per level") } },
    async run(a) { return economyCurve(a as never); },
  },
  // ------------------------------------------------------------ Debug / Test
  {
    name: "debug_logs",
    description: "Read Studio Output history (LogService): errors/warnings with script paths and line numbers, grouped and counted.",
    risk: "read", requires: ["execute_luau"],
    inputSchema: { type: "object", properties: { level: { type: "string", enum: ["error", "warning", "all"] }, limit: n("Max groups (default 30)"), contains: s("Filter text") } },
    async run(a, ctx) {
      return ctx.runLuau(wrapLuau({ level: String(a.level ?? "error"), limit: Number(a.limit ?? 30), contains: (a.contains as string) ?? null }, `	local hist = game:GetService("LogService"):GetLogHistory()
	local groups, order = {}, {}
	for _, e in ipairs(hist) do
		local t = e.messageType
		local lv = if t == Enum.MessageType.MessageError then "error" elseif t == Enum.MessageType.MessageWarning then "warning" else "info"
		if (ARGS.level == "all" or ARGS.level == lv) and (ARGS.contains == nil or string.find(e.message, ARGS.contains, 1, true)) and not string.find(e.message, "BWJSON", 1, true) then
			local key = string.gsub(e.message, "%d+%.?%d*", "#")
			local g = groups[key]
			if not g then
				g = { level = lv, message = string.sub(e.message, 1, 300), count = 0, script = string.match(e.message, "^([%w_%.]+):%d+"), line = tonumber(string.match(e.message, ":(%d+):")) }
				groups[key] = g
				table.insert(order, g)
			end
			g.count += 1
			g.lastTime = e.timestamp
		end
	end
	table.sort(order, function(x, y) return (x.lastTime or 0) > (y.lastTime or 0) end)
	local out = {}
	for i = 1, math.min(ARGS.limit, #order) do out[i] = order[i] end
	return { total = #hist, groups = out, hint = "read_instance the script at the reported line, fix with set_script_source, re-run test_run" }`), { readOnly: true });
    },
  },
  {
    name: "test_run",
    description: "Test Center: run checks in Studio and get pass/fail. Check types: exists{path}, property{path,prop,equals}, script_syntax{path?} (all scripts if no path; uses loadstring when available), mechanic{id}, no_errors (Output has no errors), count{className,min?,max?}. Default = full suite (syntax of all scripts + all installed mechanics + no_errors).",
    risk: "read", requires: ["execute_luau"],
    inputSchema: { type: "object", properties: { checks: { type: "array", items: { type: "object" } } } },
    async run(a, ctx) {
      const checks = ((a.checks as Array<Record<string, unknown>>) ?? [{ type: "script_syntax" }, { type: "mechanic" }, { type: "no_errors" }]).map((c): Record<string, unknown> => ({ ...c, segs: c.path ? pathSegments(String(c.path)) : null }));
      const known = ["exists", "property", "script_syntax", "mechanic", "no_errors", "count"];
      for (const c of checks) if (!known.includes(String(c.type))) throw new Error(`unknown check type "${String(c.type)}" — ${known.join(", ")}`);
      const res = (await ctx.runLuau(wrapLuau({ checks }, `${FIND_MECH}
	local results = {}
	local function add(name, pass, detail) table.insert(results, { check = name, pass = pass, detail = detail }) end
	local function syntax(scr)
		local ok, fn, err = pcall(function() return loadstring(scr.Source, scr.Name) end)
		if not ok then return nil, "loadstring unavailable in this context" end
		if fn == nil then return false, err end
		return true
	end
	for _, c in ipairs(ARGS.checks) do
		if c.type == "exists" then
			local inst = bw_resolve(c.segs)
			add("exists " .. table.concat(c.segs, "."), inst ~= nil)
		elseif c.type == "property" then
			local inst = bw_resolve(c.segs)
			if inst == nil then add("property " .. tostring(c.prop), false, "instance missing") else
				local ok, v = pcall(function() return inst[c.prop] end)
				local enc = if ok then bw_enc(v) else nil
				local pass = ok and (game:GetService("HttpService"):JSONEncode(enc) == game:GetService("HttpService"):JSONEncode(c.equals) or tostring(v) == tostring(c.equals))
				add("property " .. bw_path(inst) .. "." .. c.prop, pass, { actual = enc, expected = c.equals })
			end
		elseif c.type == "script_syntax" then
			local list = {}
			if c.segs ~= nil then table.insert(list, bw_must(c.segs)) else
				for _, sn in ipairs(SERVICES) do for _, d in ipairs(game:GetService(sn):GetDescendants()) do if d:IsA("LuaSourceContainer") then table.insert(list, d) end end end
			end
			local bad, unavailable = {}, false
			for _, scr in ipairs(list) do
				local ok, err = syntax(scr)
				if ok == nil then unavailable = true break end
				if not ok then table.insert(bad, { path = bw_path(scr), error = err }) end
			end
			if unavailable then add("script_syntax", nil, "skipped: loadstring is not available in this Studio context — use Script Analysis window") else
				add("script_syntax (" .. #list .. " scripts)", #bad == 0, bad) end
		elseif c.type == "mechanic" then
			local ids = {}
			if c.id then ids = { c.id } else
				local seen = {}
				for _, d in ipairs(findMech(nil)) do local id = d:GetAttribute("BrickwireMechanic") if not seen[id] then seen[id] = true table.insert(ids, id) end end
			end
			for _, id in ipairs(ids) do
				local found = findMech(id)
				local scripts, empty = 0, 0
				for _, f in ipairs(found) do for _, d in ipairs(f:GetDescendants()) do if d:IsA("LuaSourceContainer") then scripts += 1 if #d.Source < 10 then empty += 1 end end end end
				add("mechanic " .. id, #found > 0 and (scripts > 0 or id == "shop") and empty == 0, { instances = #found, scripts = scripts, emptyScripts = empty })
			end
			if #ids == 0 then add("mechanic", nil, "no mechanics installed") end
		elseif c.type == "no_errors" then
			local errs = {}
			for _, e in ipairs(game:GetService("LogService"):GetLogHistory()) do
				if e.messageType == Enum.MessageType.MessageError and not string.find(e.message, "BWJSON", 1, true) then table.insert(errs, string.sub(e.message, 1, 200)) end
			end
			add("no_errors in Output", #errs == 0, { count = #errs, last = errs[#errs] })
		elseif c.type == "count" then
			local k = 0
			for _, d in ipairs(workspace:GetDescendants()) do if d:IsA(c.className) then k += 1 end end
			add("count " .. c.className, (c.min == nil or k >= c.min) and (c.max == nil or k <= c.max), { count = k })
		end
	end
	return results`), { readOnly: true })) as Array<{ pass: boolean | null }>;
      const list = Array.isArray(res) ? res : [];
      return {
        passed: list.filter((r) => r.pass === true).length, failed: list.filter((r) => r.pass === false).length, skipped: list.filter((r) => r.pass == null).length,
        results: res,
        limits: "Edit-mode checks only. Automatic Play-mode runs (player join, combat, UI clicks) are not automated — press F5 and run test_run again / debug_logs.",
      };
    },
  },
];
