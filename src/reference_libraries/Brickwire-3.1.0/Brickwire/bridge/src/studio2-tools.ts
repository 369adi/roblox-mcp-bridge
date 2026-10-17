import type { CompositeTool, CompositeContext } from "./composites.js";
import { pathSegments, wrapLuau } from "./luau.js";
import {
  generate, analyze, autoFix, applyEdits, toRobloxExport, fromRobloxPoses, listPresets, RIGS, sanitizeName,
  type Animation, type AnimEditOp, type RigType,
} from "../../shared/src/studio2/animation.js";
import { compileUIDoc, BUILTIN_COMPONENTS, UI_IMPORT_LUAU, type UIDoc } from "../../shared/src/studio2/uidoc.js";
import { PROJECT_ANALYZE_LUAU, PROJECT_OPTIMIZE_LUAU, OPTIMIZE_FIXES } from "../../shared/src/studio2/analyzer.js";

/**
 * Brickwire 2.0 composite tools: Animation Generator, UI Builder (doc ↔ ScreenGui), Project Analyzer/Optimizer.
 * Everything runs through the REAL execute_luau Studio tool. Limits are reported honestly in results.
 */

const ANIM_FOLDER = "BrickwireAnimations";
const PUBLISH_NOTE =
  "A playable public AnimationId cannot be created from a plugin/script: Roblox requires publishing. In Studio: select the rig → Avatar tab → Animation Editor → ⋯ → Load → pick this animation from AnimSaves → ⋯ → Publish to Roblox (or upload the exported .rbxm via Open Cloud). previewId works only inside this Studio session.";

const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const bool = (description: string) => ({ type: "boolean", description });

export async function readAnimation(ctx: CompositeContext, name?: string, path?: string): Promise<{ animation: Animation; source: string; path: string }> {
  const segs = path ? pathSegments(path) : null;
  const r = (await ctx.runLuau(
    wrapLuau(
      { segs, folder: ANIM_FOLDER, name: name ?? null },
      `	local kfs
	if ARGS.segs ~= nil then
		kfs = bw_must(ARGS.segs)
	else
		local f = game:GetService("ServerStorage"):FindFirstChild(ARGS.folder)
		kfs = f and f:FindFirstChild(ARGS.name)
		if kfs == nil then error("animation not found: ServerStorage." .. ARGS.folder .. "." .. tostring(ARGS.name), 0) end
	end
	if not kfs:IsA("KeyframeSequence") then error("not a KeyframeSequence: " .. kfs.ClassName, 0) end
	local ir = kfs:GetAttribute("BrickwireIR")
	if type(ir) == "string" then return { ir = ir, path = bw_path(kfs) } end
	local kfList = {}
    assert(#kfs:GetDescendants()<=20000,"Sequence too large to inspect safely")
	for _, k in ipairs(kfs:GetChildren()) do
		if k:IsA("Keyframe") then
			local poses, style, dir = {}, nil, nil
			for _, p in ipairs(k:GetDescendants()) do
				if p:IsA("Pose") and p.Weight > 0 then
					poses[p.Name] = { p.CFrame:GetComponents() }
					style = p.EasingStyle.Name
					dir = p.EasingDirection.Name
				end
			end
			local markers = {}
			for _, m in ipairs(k:GetMarkers()) do table.insert(markers, { name = m.Name, value = m.Value }) end
			table.insert(kfList, { t = k.Time, poses = poses, style = style, dir = dir, markers = markers, name = k.Name })
		end
	end
	return { path = bw_path(kfs), name = kfs.Name, loop = kfs.Loop, priority = kfs.Priority.Name, keyframes = kfList }`,
    ),
    { readOnly: true },
  )) as Record<string, unknown>;
  if (typeof r.ir === "string") return { animation: JSON.parse(r.ir) as Animation, source: "brickwire-ir", path: String(r.path) };
  const kfs = (r.keyframes as Array<{ t: number; poses: Record<string, number[]>; style?: string; dir?: string; markers?: Array<{ name: string; value: string }>; name?: string }>) ?? [];
  const markers = kfs.flatMap((k) => [
    ...(k.markers ?? []).map((m) => ({ t: k.t, name: m.name, value: m.value || undefined })),
    ...(k.name && k.name !== "Keyframe" ? [{ t: k.t, name: k.name }] : []),
  ]);
  const animation = fromRobloxPoses({ name: String(r.name), loop: !!r.loop, priority: String(r.priority), keyframes: kfs.filter((k) => Object.keys(k.poses).length), markers });
  return { animation, source: "decoded-keyframesequence", path: String(r.path) };
}

async function buildAnimation(ctx: CompositeContext, a: Animation, opts: { rigPath?: string; createRig?: boolean; keepHistory?: number }) {
  const ex = toRobloxExport(a);
  const parentOf: Record<string, string> = {};
  for (const j of Object.values(RIGS[a.rig].joints)) parentOf[j!.part] = j!.parent;
  return ctx.runLuau(
    wrapLuau(
      {
        ex, parentOf, ir: JSON.stringify(a), folder: ANIM_FOLDER,
        rigSegs: opts.rigPath ? pathSegments(opts.rigPath) : null,
        createRig: !!opts.createRig, keep: opts.keepHistory ?? 5,
      },
      `	local E = ARGS.ex
	local SS = game:GetService("ServerStorage")
	local kfs = Instance.new("KeyframeSequence")
	kfs.Name = E.name
	kfs.Loop = E.loop
	kfs.Priority = Enum.AnimationPriority[E.priority]
	kfs:SetAttribute("BrickwireIR", ARGS.ir)
	kfs:SetAttribute("BrickwireRig", E.rig)
	local poseCount = 0
	local byTime = {}
	for _, k in ipairs(E.keyframes) do
		local kf = Instance.new("Keyframe")
		kf.Time = k.t
		local map = {}
		local function ensure(part)
			if map[part] then return map[part] end
			local p = Instance.new("Pose")
			p.Name = part
			p.Weight = 1
			local parentName = ARGS.parentOf[part]
			p.Parent = if parentName then ensure(parentName) else kf
			map[part] = p
			return p
		end
		ensure(E.rootPart)
		for _, ps in ipairs(k.poses) do
			local p = ensure(ps.part)
			p.CFrame = CFrame.new(table.unpack(ps.cf))
			p.EasingStyle = Enum.PoseEasingStyle[k.style]
			p.EasingDirection = Enum.PoseEasingDirection[k.dir]
			poseCount += 1
		end
		kf.Parent = kfs
		table.insert(byTime, kf)
	end
	local markerCount = 0
	for _, m in ipairs(E.markers) do
		local target
		for _, kf in ipairs(byTime) do
			if math.abs(kf.Time - m.t) < 0.001 then target = kf break end
		end
		if target == nil then
			target = Instance.new("Keyframe")
			target.Time = m.t
			target.Parent = kfs
			table.insert(byTime, target)
		end
		local mk = Instance.new("KeyframeMarker")
		mk.Name = m.name
		mk.Value = m.value or ""
		target:AddMarker(mk)
		markerCount += 1
	end
	-- save (previous version is moved to _history, last N kept)
	local folder = SS:FindFirstChild(ARGS.folder) or Instance.new("Folder")
	folder.Name = ARGS.folder
	folder.Parent = SS
	local hist = folder:FindFirstChild("_history") or Instance.new("Folder")
	hist.Name = "_history"
	hist.Parent = folder
	local old = folder:FindFirstChild(E.name)
	local backup = nil
	if old then
		old.Name = E.name .. "_" .. os.date("!%Y%m%d_%H%M%S")
		old.Parent = hist
		backup = bw_path(old)
		local mine = {}
		for _, h in ipairs(hist:GetChildren()) do
			if string.sub(h.Name, 1, #E.name + 1) == E.name .. "_" then table.insert(mine, h) end
		end
		table.sort(mine, function(a, b) return a.Name > b.Name end)
		for i = ARGS.keep + 1, #mine do mine[i]:Destroy() end
	end
	kfs.Parent = folder
	-- rig
	local rig, rigNote = nil, nil
	if ARGS.rigSegs ~= nil then
		rig = bw_must(ARGS.rigSegs)
	elseif ARGS.createRig then
		local rigName = "BW_AnimRig_" .. E.rig
		rig = workspace:FindFirstChild(rigName)
		if rig == nil then
			local ok, res = pcall(function()
				return game:GetService("Players"):CreateHumanoidModelFromDescription(Instance.new("HumanoidDescription"), Enum.HumanoidRigType[E.rig])
			end)
			if ok and res then
				rig = res
				rig.Name = rigName
				rig.Parent = workspace
				local hrp = rig:FindFirstChild("HumanoidRootPart")
				if hrp then hrp.Anchored = true end
				rig:PivotTo(CFrame.new(0, 5, 0))
			else
				rigNote = "could not create a rig automatically (" .. tostring(res) .. "). Insert one via Avatar → Rig Builder and pass rigPath."
			end
		end
	end
	local missing, animSaves = {}, nil
	if rig ~= nil then
		for _, part in ipairs(E.requiredParts) do
			if rig:FindFirstChild(part) == nil then table.insert(missing, part) end
		end
		local hum = rig:FindFirstChildOfClass("Humanoid")
		if hum and hum.RigType.Name ~= E.rig then
			rigNote = "rig is " .. hum.RigType.Name .. " but animation is " .. E.rig .. " — use animation_edit retarget"
		end
		local saves = rig:FindFirstChild("AnimSaves")
		if saves == nil then
			saves = Instance.new("ObjectValue")
			saves.Name = "AnimSaves"
			saves.Parent = rig
		end
		local prev = saves:FindFirstChild(E.name)
		if prev then prev:Destroy() end
		kfs:Clone().Parent = saves
		animSaves = bw_path(saves) .. "." .. E.name
	end
	local previewId = nil
	local okp, idOrErr = pcall(function()
		return game:GetService("KeyframeSequenceProvider"):RegisterKeyframeSequence(kfs)
	end)
	if okp then previewId = idOrErr end
	bw_waypoint("Brickwire animation " .. E.name)
	return {
		path = bw_path(kfs), backup = backup, keyframes = #byTime, poses = poseCount, markers = markerCount,
		rig = rig and bw_path(rig) or nil, animSaves = animSaves, missingParts = missing, rigNote = rigNote,
		previewId = previewId, previewError = if okp then nil else tostring(idOrErr),
	}`,
    ),
    { readOnly: false },
  );
}

function summary(a: Animation) {
  return {
    name: a.name, rig: a.rig, length: a.length, loop: a.loop, priority: a.priority, keyframes: a.keyframes.length,
    keyTimes: a.keyframes.map((k) => k.t), events: a.events, preset: a.meta?.preset,
  };
}

const animSchemaCommon = {
  rigPath: str("Optional rig Model path (e.g. game.Workspace.Dummy). The animation is also saved into its AnimSaves for the Animation Editor"),
  createRig: bool("Create/reuse a default rig BW_AnimRig_<R6|R15> in Workspace when no rigPath (default false)"),
};

export const STUDIO2_TOOLS: CompositeTool[] = [
  {
    name: "animation_presets",
    description: "List built-in character animation presets (movement, combat, weapons, tools, emotes, interaction) for animation_generate.",
    risk: "read",
    requires: [],
    inputSchema: { type: "object", properties: {} },
    async run() {
      return { presets: listPresets(), rigs: Object.keys(RIGS), note: PUBLISH_NOTE };
    },
  },
  {
    name: "animation_generate",
    description:
      "Generate a REAL R6/R15 character animation (keyframes → KeyframeSequence) from a text prompt (en/ru) or preset, quality-check + auto-fix it, and build it in Studio (ServerStorage.BrickwireAnimations + rig AnimSaves + session preview id). Does NOT fake an AnimationId.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      properties: {
        prompt: str("Natural language, e.g. 'fast heavy two-handed sword slash right to left'"),
        preset: str("Preset id (see animation_presets); overrides the prompt's action"),
        name: str("KeyframeSequence name"),
        rig: { type: "string", enum: ["R6", "R15"] },
        speed: num("Speed multiplier 0.25..4"),
        intensity: num("Amplitude multiplier 0.2..2"),
        direction: { type: "string", enum: ["right_to_left", "left_to_right", "overhead", "thrust"] },
        twoHanded: bool("Two-handed weapon pose"),
        mirror: bool("Mirror (left-handed)"),
        loop: bool("Force looping on/off"),
        autoFix: bool("Apply auto-fix for detected problems (default true)"),
        build: bool("Build in Studio (default true). false = only return the IR"),
        ...animSchemaCommon,
      },
    },
    async run(args, ctx) {
      const { animation, plan } = generate({
        name: args.name as string | undefined, rig: args.rig as RigType | undefined, preset: args.preset as string | undefined,
        prompt: args.prompt as string | undefined, speed: args.speed as number | undefined, intensity: args.intensity as number | undefined,
        direction: args.direction as never, twoHanded: args.twoHanded as boolean | undefined, mirror: args.mirror as boolean | undefined,
        loop: args.loop as boolean | undefined,
      });
      let a = animation;
      let fixed: string[] = [];
      if (args.autoFix !== false) ({ animation: a, fixed } = autoFix(a));
      const quality = analyze(a);
      const studio = args.build === false ? null : await buildAnimation(ctx, a, { rigPath: args.rigPath as string | undefined, createRig: !!args.createRig });
      return { animation: summary(a), plan: plan.reasons, autoFixed: fixed, quality, studio, ir: args.build === false ? a : undefined, publish: PUBLISH_NOTE };
    },
  },
  {
    name: "animation_edit",
    description:
      "Edit an existing animation with operations (speed, set_length, intensity, smooth, mirror, loop_seamless, set_loop, set_priority, anticipation, impact, add_event, remove_event, retarget R6↔R15, set_pose, add/delete/move/duplicate_keyframe, set_easing, mirror_pose, blend_poses, autofix) and rebuild it. The previous version is kept in BrickwireAnimations._history.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["ops"],
      properties: {
        name: str("Animation name in ServerStorage.BrickwireAnimations"),
        path: str("Or full path of any KeyframeSequence (e.g. rig AnimSaves)"),
        newName: str("Save as a new name (keeps the original)"),
        ops: { type: "array", items: { type: "object" }, description: "[{op:'speed',factor:1.5},{op:'set_pose',t:0.2,joint:'armR',rot:[90,0,0]},...]. Joints: root waist head armL armR forearmL forearmR handL handR legL legR shinL shinR footL footR" },
        ...animSchemaCommon,
      },
    },
    async run(args, ctx) {
      if (!args.name && !args.path) throw new Error("name or path is required");
      const src = await readAnimation(ctx, args.name as string | undefined, args.path as string | undefined);
      const { animation, log } = applyEdits(src.animation, (args.ops as AnimEditOp[]) ?? []);
      if (args.newName) animation.name = sanitizeName(String(args.newName));
      const quality = analyze(animation);
      const studio = await buildAnimation(ctx, animation, { rigPath: args.rigPath as string | undefined, createRig: !!args.createRig });
      return { from: src.path, source: src.source, log, animation: summary(animation), quality, studio, publish: PUBLISH_NOTE };
    },
  },
  {
    name: "animation_analyze",
    description: "Quality-check any KeyframeSequence (Brickwire or hand-made): extreme poses, sudden motion, bad loops, frozen joints, timing, events. Read-only; use animation_edit [{op:'autofix'}] to repair.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", properties: { name: str("Name in BrickwireAnimations"), path: str("Or KeyframeSequence path"), includeIR: bool("Return the decoded IR") } },
    async run(args, ctx) {
      if (!args.name && !args.path) throw new Error("name or path is required");
      const src = await readAnimation(ctx, args.name as string | undefined, args.path as string | undefined);
      const preview = autoFix(src.animation);
      return { path: src.path, source: src.source, animation: summary(src.animation), quality: analyze(src.animation), autoFixWouldDo: preview.fixed, ir: args.includeIR ? src.animation : undefined };
    },
  },
  {
    name: "animation_list",
    description: "List animations in ServerStorage.BrickwireAnimations (the animation library) with rig/length/markers.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", properties: {} },
    async run(_args, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { folder: ANIM_FOLDER },
          `	local f = game:GetService("ServerStorage"):FindFirstChild(ARGS.folder)
	local out = {}
	if f == nil then return { animations = out, note = "no animations yet — use animation_generate" } end
	for _, k in ipairs(f:GetChildren()) do
		if k:IsA("KeyframeSequence") then
			local len, n, markers = 0, 0, {}
			for _, kf in ipairs(k:GetChildren()) do
				if kf:IsA("Keyframe") then
					n += 1
					len = math.max(len, kf.Time)
					for _, m in ipairs(kf:GetMarkers()) do markers[m.Name] = true end
				end
			end
			local names = {}
			for m in pairs(markers) do table.insert(names, m) end
			local hist = 0
			local h = f:FindFirstChild("_history")
			if h then for _, x in ipairs(h:GetChildren()) do if string.sub(x.Name, 1, #k.Name + 1) == k.Name .. "_" then hist += 1 end end end
			table.insert(out, { name = k.Name, rig = k:GetAttribute("BrickwireRig"), length = len, keyframes = n, loop = k.Loop, priority = k.Priority.Name, markers = names, versions = hist })
		end
	end
	return { animations = out }`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "ui_components",
    description: "List built-in UI Builder components (Button with variants/states, Panel, Card, Modal, HealthBar, InventorySlot, ProgressBar, Grid, TopBar...).",
    risk: "read",
    requires: [],
    inputSchema: { type: "object", properties: {} },
    async run() {
      return {
        components: Object.entries(BUILTIN_COMPONENTS).map(([name, c]) => ({ name, description: c.description, type: c.type, variants: Object.keys(c.variants ?? {}), states: Object.keys(c.states ?? {}) })),
        elementTypes: ["Frame", "Group", "Text", "Button", "Image", "ImageButton", "Input", "Scroll", "Viewport", "Canvas"],
      };
    },
  },
  {
    name: "ui_build",
    description:
      "Build a ScreenGui from a UI Builder document {name, children:[{type|component, variant, name, position/size [xs,xo,ys,yo], bg '#hex', text, corner, stroke, gradient, padding, list|grid, aspect, states{hover,pressed,disabled,selected}, appear, children}]}. Validates first; generates a LocalScript for states/animations. Use validateOnly to dry-run.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["doc"],
      properties: {
        doc: { type: "object", description: "UI document" },
        parent: str("Parent path (default game.StarterGui)"),
        replaceExisting: bool("Replace a ScreenGui with the same name (old one is kept in ServerStorage.BrickwireUIBackups)"),
        validateOnly: bool("Only compile/validate, do not touch Studio"),
      },
    },
    snapshotTargets: (a) => {
      const d = a.doc as UIDoc | undefined;
      return d?.name ? [`${String(a.parent ?? "game.StarterGui")}.${d.name}`] : [];
    },
    async run(args, ctx) {
      const compiled = compileUIDoc(args.doc as UIDoc);
      if (args.validateOnly) return { valid: true, ...compiled.stats, warnings: compiled.warnings };
      const studio = await ctx.runLuau(
        wrapLuau(
          { parentSegs: pathSegments(String(args.parent ?? "game.StarterGui")), tree: compiled.tree, replace: !!args.replaceExisting },
          `	local parent = bw_must(ARGS.parentSegs)
	local existing = parent:FindFirstChild(ARGS.tree.name)
	local backup = nil
	if existing ~= nil then
		if not ARGS.replace then
			error("already exists: " .. bw_path(existing) .. " — pass replaceExisting=true (a backup is kept) or choose another name", 0)
		end
		local SS = game:GetService("ServerStorage")
		local bf = SS:FindFirstChild("BrickwireUIBackups") or Instance.new("Folder")
		bf.Name = "BrickwireUIBackups"
		bf.Parent = SS
		existing.Name = existing.Name .. "_" .. os.date("!%Y%m%d_%H%M%S")
		existing.Parent = bf
		backup = bw_path(existing)
	end
	local created, errs = {}, {}
	local root = bw_create_tree(ARGS.tree, parent, created, errs)
	bw_waypoint("Brickwire ui_build " .. root.Name)
	return { path = bw_path(root), instances = #created, propertyErrors = errs, backup = backup }`,
        ),
        { readOnly: false },
      );
      return { studio, ...compiled.stats, warnings: compiled.warnings };
    },
  },
  {
    name: "ui_import",
    description: "Read an existing ScreenGui/GuiObject from Studio back into a UI Builder document (edit it, then ui_build with replaceExisting).",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: str("GUI path, e.g. game.StarterGui.MainMenu") } },
    async run(args, ctx) {
      return ctx.runLuau(wrapLuau({ segs: pathSegments(String(args.path)) }, UI_IMPORT_LUAU), { readOnly: true });
    },
  },
  {
    name: "project_analyze",
    description: "Scan the whole place: instance/part/mesh/script/remote counts, performance risks (shadows, lights, particles, unanchored parts, huge models), script problems (deprecated wait/spawn, infinite loops without yield, scripts in places where they never run, empty scripts), duplicates. Read-only, returns a score and issues with sample paths.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", properties: { maxSamples: num("Sample paths per issue (default 8)") } },
    async run(args, ctx) {
      return ctx.runLuau(wrapLuau({ maxSamples: Number(args.maxSamples ?? 8) }, PROJECT_ANALYZE_LUAU), { readOnly: true });
    },
  },
  {
    name: "project_optimize",
    description: `Apply SAFE optimizations found by project_analyze. Fixes: ${OPTIMIZE_FIXES.map((f) => `${f.id} (${f.desc})`).join("; ")}. dryRun defaults to true (reports what would change). Undo with Ctrl+Z (one waypoint).`,
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["fixes"],
      properties: { fixes: { type: "array", items: { type: "string", enum: OPTIMIZE_FIXES.map((f) => f.id) } }, dryRun: bool("Default true") },
    },
    async run(args, ctx) {
      const fixes = (args.fixes as string[]) ?? [];
      const unknown = fixes.filter((f) => !OPTIMIZE_FIXES.some((x) => x.id === f));
      if (unknown.length) throw new Error(`unknown fixes: ${unknown.join(", ")}`);
      return ctx.runLuau(wrapLuau({ fixes, dryRun: args.dryRun !== false }, PROJECT_OPTIMIZE_LUAU), { readOnly: args.dryRun !== false });
    },
  },
];
