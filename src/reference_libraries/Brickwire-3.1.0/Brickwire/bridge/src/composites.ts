import type { JsonSchema, ToolRisk } from "../../shared/src/protocol.js";
import { pathSegments, joinPath, wrapLuau } from "./luau.js";

/**
 * Composite tools: higher-level, strictly-typed operations implemented on top of
 * the REAL Studio MCP tools (mostly execute_luau). They are registered only when
 * the MCP tools they depend on are actually provided by Studio — never faked.
 */

export interface SnapshotEntry {
  index: number;
  path: string;
  segs: string[];
  parentSegs: string[] | null;
  absent: boolean;
  saved: boolean;
  name?: string;
}

export interface SnapshotRecord {
  id: string;
  label: string;
  createdAt: string;
  entries: SnapshotEntry[];
  sessionId?: string;
  restoredAt?: string | null;
}

export interface CompositeContext {
  runLuau(code: string, opts: { readOnly: boolean }): Promise<unknown>;
  callMcp(name: string, args: Record<string, unknown>): Promise<{ text: string; json: unknown; isError: boolean }>;
  newId(prefix: string): string;
  getSnapshot(id: string): SnapshotRecord | undefined;
  listSnapshots(): SnapshotRecord[];
}

export interface CompositeTool {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  risk: ToolRisk;
  requires: string[];
  /** Paths to snapshot automatically before running (existing or about-to-be-created). */
  snapshotTargets?(args: Record<string, unknown>): string[];
  run(args: Record<string, unknown>, ctx: CompositeContext): Promise<unknown>;
}

const str = (d: string, extra: JsonSchema = {}): JsonSchema => ({ type: "string", description: d, ...extra });
const obj = (d: string): JsonSchema => ({ type: "object", description: d });

const NODE_SCHEMA: JsonSchema = {
  type: "object",
  description: "{className, name?, properties?, attributes?, source? (scripts), children?: [node]}",
  required: ["className"],
  properties: {
    className: { type: "string" },
    name: { type: "string" },
    properties: { type: "object" },
    attributes: { type: "object" },
    source: { type: "string" },
    children: { type: "array" },
  },
};

const UI_ROOTS = /^(ScreenGui|SurfaceGui|BillboardGui|Frame|ScrollingFrame|TextLabel|TextButton|TextBox|ImageLabel|ImageButton|CanvasGroup|ViewportFrame|VideoFrame)$/;
const VFX_CLASSES = /^(ParticleEmitter|Beam|Trail|Attachment|PointLight|SpotLight|SurfaceLight|Fire|Smoke|Sparkles|Highlight|Explosion|Folder|Part|MeshPart)$/;
const SCRIPT_CLASSES = ["Script", "LocalScript", "ModuleScript"];

/** Recursively convert Ref paths into segments so Luau never parses paths. */
function prepValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(prepValue);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o["$type"] === "Ref" && typeof o.path === "string") return { $type: "Ref", segs: pathSegments(o.path) };
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, prepValue(x)]));
  }
  return v;
}

function prepNode(n: unknown, depth = 0, count = { n: 0 }): Record<string, unknown> {
  if (depth > 25) throw new Error("tree too deep (max 25)");
  if (++count.n > 500) throw new Error("tree too large (max 500 instances per call)");
  if (!n || typeof n !== "object") throw new Error("tree node must be an object");
  const node = n as Record<string, unknown>;
  if (typeof node.className !== "string" || !/^[A-Za-z][A-Za-z0-9]*$/.test(node.className)) throw new Error("tree node needs a valid className");
  return {
    className: node.className,
    name: typeof node.name === "string" ? node.name : undefined,
    properties: node.properties ? prepValue(node.properties) : undefined,
    attributes: node.attributes ? prepValue(node.attributes) : undefined,
    source: typeof node.source === "string" ? node.source : undefined,
    children: Array.isArray(node.children) ? node.children.map((c) => prepNode(c, depth + 1, count)) : undefined,
  };
}

const childPath = (parent: string, name: string) => joinPath([...pathSegments(parent), name]);

function treeTool(
  name: string,
  description: string,
  defaultParent: string | null,
  rootCheck: ((cls: string) => string | null) | null,
): CompositeTool {
  return {
    name,
    description,
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: defaultParent ? ["tree"] : ["parent", "tree"],
      properties: {
        parent: str(`Parent path${defaultParent ? ` (default ${defaultParent})` : ""}`),
        tree: NODE_SCHEMA,
        replaceExisting: { type: "boolean", description: "Replace a same-named existing child instead of failing (default false)" },
      },
    },
    snapshotTargets: (a) => {
      const t = a.tree as Record<string, unknown>;
      return typeof t?.name === "string" ? [childPath(String(a.parent ?? defaultParent), t.name)] : [];
    },
    async run(a, ctx) {
      const parent = String(a.parent ?? defaultParent);
      const tree = prepNode(a.tree);
      if (rootCheck) {
        const problem = rootCheck(String(tree.className));
        if (problem) throw new Error(problem);
      }
      return ctx.runLuau(
        wrapLuau(
          { parentSegs: pathSegments(parent), tree, replace: !!a.replaceExisting, label: name },
          `	local parent = bw_must(ARGS.parentSegs)
	local tree = ARGS.tree
	if tree.name ~= nil then
		local existing = parent:FindFirstChild(tree.name)
		if existing ~= nil then
			if ARGS.replace then
				existing:Destroy()
			else
				error("already exists: " .. bw_path(existing) .. " (" .. existing.ClassName .. ") — reuse/modify it or pass replaceExisting=true", 0)
			end
		end
	end
	local created, errs = {}, {}
	local root = bw_create_tree(tree, parent, created, errs)
	bw_waypoint("Brickwire: " .. ARGS.label .. " " .. root.Name)
	return { path = bw_path(root), className = root.ClassName, created = created, propertyErrors = errs }`,
        ),
        { readOnly: false },
      );
    },
  };
}

export const COMPOSITE_TOOLS: CompositeTool[] = [
  {
    name: "get_game_tree",
    description: "Hierarchical tree of instances under a path (name, class, childCount). Use small depth first, then drill down.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      properties: {
        path: str("Root path (default game)"),
        depth: { type: "integer", description: "Levels below root (default 2, max 6)" },
        maxNodes: { type: "integer", description: "Max nodes (default 300, max 1500)" },
      },
    },
    async run(a, ctx) {
      const depth = Math.min(6, Math.max(0, Number(a.depth ?? 2)));
      const maxNodes = Math.min(1500, Math.max(1, Number(a.maxNodes ?? 300)));
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path ?? "game")), depth, maxNodes },
          `	local root = bw_must(ARGS.segs)
	local count = 0
	local function walk(inst, d)
		count += 1
		local node = { name = inst.Name, class = inst.ClassName }
		local okk, kids = pcall(function()
			return inst:GetChildren()
		end)
		if not okk then
			kids = {}
		end
		node.childCount = #kids
		if d < ARGS.depth and #kids > 0 then
			node.children = {}
			for _, c in ipairs(kids) do
				if count >= ARGS.maxNodes then
					node.truncated = true
					break
				end
				local okc, n = pcall(walk, c, d + 1)
				if okc then
					table.insert(node.children, n)
				end
			end
		end
		return node
	end
	local tree = walk(root, 0)
	return { path = bw_path(root), nodes = count, truncated = count >= ARGS.maxNodes, tree = tree }`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "get_project_info",
    description: "Place name/ids, service summaries, all scripts (path+class) and top-level GUIs. Use at the start of a task.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", properties: { maxScripts: { type: "integer", description: "default 300" } } },
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { maxScripts: Math.min(2000, Number(a.maxScripts ?? 300)) },
          `	local info = { placeName = game.Name, placeId = game.PlaceId, gameId = game.GameId, creatorId = game.CreatorId }
	local svcNames = { "Workspace", "ReplicatedStorage", "ReplicatedFirst", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPack", "StarterPlayer", "Lighting", "SoundService", "Teams" }
	info.services = {}
	for _, n in ipairs(svcNames) do
		local ok, svc = pcall(function()
			return game:GetService(n)
		end)
		if ok and svc then
			info.services[n] = { children = #svc:GetChildren(), descendants = #svc:GetDescendants() }
		end
	end
	info.scripts = {}
	local total = 0
	for _, n in ipairs(svcNames) do
		local ok, svc = pcall(function()
			return game:GetService(n)
		end)
		if ok and svc then
			for _, d in ipairs(svc:GetDescendants()) do
				if d:IsA("LuaSourceContainer") then
					total += 1
					if #info.scripts < ARGS.maxScripts then
						table.insert(info.scripts, { path = bw_path(d), class = d.ClassName })
					end
				end
			end
		end
	end
	info.scriptCount = total
	info.guis = {}
	for _, g in ipairs(game:GetService("StarterGui"):GetChildren()) do
		table.insert(info.guis, { path = bw_path(g), class = g.ClassName, descendants = #g:GetDescendants() })
	end
	info.remotes = 0
	for _, d in ipairs(game:GetService("ReplicatedStorage"):GetDescendants()) do
		if d:IsA("RemoteEvent") or d:IsA("RemoteFunction") or d:IsA("UnreliableRemoteEvent") then
			info.remotes += 1
		end
	end
	return info`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "read_instance",
    description: "Read chosen properties + attributes + children names of one instance (lighter than inspect_instance).",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: str("Instance path"), properties: { type: "array", items: { type: "string" }, description: "Property names to read" } },
    },
    async run(a, ctx) {
      const props = Array.isArray(a.properties) ? a.properties.map(String) : null;
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)), props, explicit: props !== null },
          `	local inst = bw_must(ARGS.segs)
	if ARGS.props == nil then
		-- sensible defaults per class family when the model did not ask for specific properties
		ARGS.props = { "Name", "ClassName" }
		local extra = {}
		if inst:IsA("BasePart") then
			extra = { "Size", "Position", "Color", "Material", "Anchored", "CanCollide", "Transparency" }
		elseif inst:IsA("LuaSourceContainer") then
			extra = { "Source" }
			if inst:IsA("BaseScript") then
				table.insert(extra, "Disabled")
			end
		elseif inst:IsA("GuiObject") then
			extra = { "Size", "Position", "Visible", "BackgroundColor3", "Text" }
		elseif inst:IsA("LayerCollector") then
			extra = { "Enabled", "ResetOnSpawn" }
		end
		for _, p in ipairs(extra) do
			table.insert(ARGS.props, p)
		end
	end
	local out = { path = bw_path(inst), className = inst.ClassName, properties = {}, attributes = {}, children = {} }
	for _, p in ipairs(ARGS.props) do
		local ok, v = pcall(function()
			return inst[p]
		end)
		if ok then
			if p == "Source" and type(v) == "string" and #v > 20000 then
				v = string.sub(v, 1, 20000) .. "\\n-- [truncated by Brickwire; use script_read for full source]"
			end
			out.properties[p] = bw_enc(v)
		elseif ARGS.explicit then
			out.properties[p] = "<error: " .. tostring(v) .. ">"
		end
	end
	for k, v in pairs(inst:GetAttributes()) do
		out.attributes[k] = bw_enc(v)
	end
	for _, c in ipairs(inst:GetChildren()) do
		if #out.children >= 200 then
			break
		end
		table.insert(out.children, c.Name .. " (" .. c.ClassName .. ")")
	end
	return out`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "create_instance",
    description: "Create one instance. Fails if a same-named child exists (no duplicates).",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["className", "parent"],
      properties: {
        className: str("Roblox class, e.g. Part, Folder, RemoteEvent"),
        parent: str("Parent path"),
        name: str("Name"),
        properties: obj("Property map (typed values allowed)"),
        attributes: obj("Attribute map"),
      },
    },
    snapshotTargets: (a) => (typeof a.name === "string" ? [childPath(String(a.parent), a.name)] : []),
    async run(a, ctx) {
      return treeTool("create_instance", "", null, null).run(
        { parent: a.parent, tree: { className: a.className, name: a.name, properties: a.properties, attributes: a.attributes } },
        ctx,
      );
    },
  },
  {
    name: "create_part",
    description: "Create a Part (anchored by default). size/position as [x,y,z], color [r,g,b] 0-255 or '#hex'.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: str("Part name"),
        parent: str("Parent path (default game.Workspace)"),
        size: { type: "array", items: { type: "number" } },
        position: { type: "array", items: { type: "number" } },
        color: { type: ["array", "string"] },
        material: str("Enum.Material name, e.g. Plastic, Neon"),
        shape: str("Block|Ball|Cylinder|Wedge|CornerWedge"),
        anchored: { type: "boolean" },
        properties: obj("Extra properties"),
      },
    },
    snapshotTargets: (a) => [childPath(String(a.parent ?? "game.Workspace"), String(a.name))],
    async run(a, ctx) {
      const shape = String(a.shape ?? "Block");
      const className = shape === "Wedge" ? "WedgePart" : shape === "CornerWedge" ? "CornerWedgePart" : "Part";
      const props: Record<string, unknown> = { Anchored: a.anchored ?? true, ...((a.properties as object) ?? {}) };
      if (a.size) props.Size = { $type: "Vector3", value: a.size };
      if (a.position) props.Position = { $type: "Vector3", value: a.position };
      if (a.color) props.Color = { $type: "Color3", value: a.color };
      if (a.material) props.Material = { $type: "Enum", enum: "Material", value: a.material };
      if (className === "Part" && shape !== "Block") props.Shape = { $type: "Enum", enum: "PartType", value: shape };
      return treeTool("create_part", "", null, null).run(
        { parent: a.parent ?? "game.Workspace", tree: { className, name: a.name, properties: props } },
        ctx,
      );
    },
  },
  treeTool("create_instance_tree", "Create a nested instance tree in one call (models, folders, systems).", null, null),
  treeTool("create_model", "Create a Model with children (parts, scripts, attachments).", "game.Workspace", (c) =>
    c === "Model" ? null : "create_model root must be className Model",
  ),
  treeTool("create_ui", "Create GUI hierarchy (ScreenGui/Frame/TextButton…, UICorner, UIStroke, layouts). Default parent StarterGui.", "game.StarterGui", (c) =>
    UI_ROOTS.test(c) ? null : `create_ui root must be a GUI class (got ${c})`,
  ),
  treeTool("create_vfx", "Create VFX (ParticleEmitter, Beam, Trail, Attachment, lights, Highlight…) under a parent.", null, (c) =>
    VFX_CLASSES.test(c) ? null : `create_vfx root must be a VFX class (got ${c})`,
  ),
  {
    name: "modify_instance",
    description: "Set properties/attributes on an existing instance. Returns before/after values.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: str("Instance path"), properties: obj("Property map"), attributes: obj("Attribute map"), name: str("Rename to") },
    },
    snapshotTargets: (a) => [String(a.path)],
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)), props: prepValue(a.properties ?? {}), attrs: prepValue(a.attributes ?? {}), rename: a.name },
          `	local inst = bw_must(ARGS.segs)
	local before, after = {}, {}
	for p, _ in pairs(ARGS.props) do
		local ok, v = pcall(function()
			return inst[p]
		end)
		before[p] = if ok then bw_enc(v) else nil
	end
	local errs = bw_apply(inst, ARGS.props)
	for k, a in pairs(ARGS.attrs) do
		local ok, e = pcall(function()
			inst:SetAttribute(k, bw_decode(a))
		end)
		if not ok then
			table.insert(errs, { attribute = k, error = tostring(e) })
		end
	end
	if ARGS.rename ~= nil then
		inst.Name = ARGS.rename
	end
	for p, _ in pairs(ARGS.props) do
		local ok, v = pcall(function()
			return inst[p]
		end)
		after[p] = if ok then bw_enc(v) else nil
	end
	bw_waypoint("Brickwire: modify " .. inst.Name)
	return { path = bw_path(inst), before = before, after = after, errors = errs }`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "delete_instance",
    description: "Delete one instance (services and game cannot be deleted). Requires confirmation; auto-snapshotted.",
    risk: "destructive",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: str("Instance path") } },
    snapshotTargets: (a) => [String(a.path)],
    async run(a, ctx) {
      const segs = pathSegments(String(a.path));
      if (segs.length < 3) throw new Error("refusing to delete game or a service");
      return ctx.runLuau(
        wrapLuau(
          { segs },
          `	local inst = bw_must(ARGS.segs)
	if inst.Parent == game then
		error("refusing to delete a service", 0)
	end
	local info = { deleted = bw_path(inst), className = inst.ClassName, descendants = #inst:GetDescendants() }
	inst:Destroy()
	bw_waypoint("Brickwire: delete " .. info.deleted)
	return info`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "clone_instance",
    description: "Clone an instance to a parent (default: same parent) with optional new name.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: str("Source path"), parent: str("Target parent path"), name: str("New name") } },
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)), parentSegs: a.parent ? pathSegments(String(a.parent)) : null, name: a.name },
          `	local src = bw_must(ARGS.segs)
	local parent = if ARGS.parentSegs then bw_must(ARGS.parentSegs) else src.Parent
	local c = src:Clone()
	if c == nil then
		error("instance is not Archivable", 0)
	end
	if ARGS.name ~= nil then
		c.Name = ARGS.name
	end
	c.Parent = parent
	bw_waypoint("Brickwire: clone " .. src.Name)
	return { path = bw_path(c), className = c.ClassName }`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "create_script",
    description: "Create a Script/LocalScript/ModuleScript with source. Fails if it already exists (edit it instead).",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["parent", "name", "source"],
      properties: {
        parent: str("Parent path, e.g. game.ServerScriptService"),
        name: str("Script name"),
        className: str("Script | LocalScript | ModuleScript (default Script)", { enum: SCRIPT_CLASSES }),
        source: str("Luau source"),
      },
    },
    snapshotTargets: (a) => [childPath(String(a.parent), String(a.name))],
    async run(a, ctx) {
      return treeTool("create_script", "", null, null).run(
        { parent: a.parent, tree: { className: a.className ?? "Script", name: a.name, source: a.source } },
        ctx,
      );
    },
  },
  {
    name: "set_script_source",
    description: "Replace the full source of an existing script (auto-snapshotted). For small edits prefer multi_edit.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path", "source"], properties: { path: str("Script path"), source: str("New full source") } },
    snapshotTargets: (a) => [String(a.path)],
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)), source: String(a.source) },
          `	local s = bw_must(ARGS.segs)
	if not s:IsA("LuaSourceContainer") then
		error(bw_path(s) .. " is not a script", 0)
	end
	local old = #s.Source
	s.Source = ARGS.source
	bw_waypoint("Brickwire: edit " .. s.Name)
	return { path = bw_path(s), oldLength = old, newLength = #s.Source }`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "delete_script",
    description: "Delete a script (must be a LuaSourceContainer). Requires confirmation; auto-snapshotted.",
    risk: "destructive",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: str("Script path") } },
    snapshotTargets: (a) => [String(a.path)],
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)) },
          `	local s = bw_must(ARGS.segs)
	if not s:IsA("LuaSourceContainer") then
		error(bw_path(s) .. " is not a script", 0)
	end
	local p = bw_path(s)
	s:Destroy()
	bw_waypoint("Brickwire: delete script " .. p)
	return { deleted = p }`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "take_snapshot",
    description: "Snapshot instances (clones stored in ServerStorage.__BrickwireSnapshots) so they can be restored. Paths that do not exist yet are recorded as absent (restore removes them).",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["paths"],
      properties: { paths: { type: "array", items: { type: "string" } }, label: str("Label") },
    },
    async run(a, ctx) {
      const paths = (a.paths as unknown[]).map(String).slice(0, 50);
      const id = ctx.newId("snap");
      const segsList = paths.map((p) => pathSegments(p));
      const res = (await ctx.runLuau(
        wrapLuau(
          { id, label: String(a.label ?? ""), segsList },
          `	local ss = game:GetService("ServerStorage")
	local store = ss:FindFirstChild("__BrickwireSnapshots")
	if store == nil then
		store = Instance.new("Folder")
		store.Name = "__BrickwireSnapshots"
		store.Parent = ss
	end
	local snap = Instance.new("Folder")
	snap.Name = ARGS.id
	snap:SetAttribute("Label", ARGS.label)
	snap:SetAttribute("CreatedAt", os.time())
	local entries = {}
	for i, segs in ipairs(ARGS.segsList) do
		local inst = bw_resolve(segs)
		local e = { index = i, absent = inst == nil, saved = false }
		if inst ~= nil then
			e.parent = if inst.Parent then bw_path(inst.Parent) else nil
			e.name = inst.Name
			local ok, c = pcall(function()
				return inst:Clone()
			end)
			if ok and c ~= nil then
				c.Name = tostring(i)
				c:SetAttribute("BW_OriginalName", inst.Name)
				for _, d in ipairs(c:GetDescendants()) do
					if d:IsA("BaseScript") then
						d:SetAttribute("BW_WasDisabled", d.Disabled)
						d.Disabled = true
					end
				end
				if c:IsA("BaseScript") then
					c:SetAttribute("BW_WasDisabled", c.Disabled)
					c.Disabled = true
				end
				c.Parent = snap
				e.saved = true
			else
				e.reason = "not archivable"
			end
		end
		table.insert(entries, e)
	end
	snap.Parent = store
	return { id = ARGS.id, entries = entries }`,
        ),
        { readOnly: false },
      )) as { id: string; entries: Array<{ index: number; absent: boolean; saved: boolean; parent?: string; name?: string }> };
      const record: SnapshotRecord = {
        id,
        label: String(a.label ?? ""),
        createdAt: new Date().toISOString(),
        entries: res.entries.map((e) => ({
          index: e.index,
          path: paths[e.index - 1],
          segs: segsList[e.index - 1],
          parentSegs: e.parent ? pathSegments(e.parent) : segsList[e.index - 1].slice(0, -1),
          absent: e.absent,
          saved: e.saved,
          name: e.name,
        })),
      };
      return { snapshot: record };
    },
  },
  {
    name: "restore_snapshot",
    description: "Restore a snapshot: replaces snapshotted instances with their saved copies and removes instances that were absent at snapshot time.",
    risk: "destructive",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["snapshotId"], properties: { snapshotId: str("Snapshot id") } },
    async run(a, ctx) {
      const rec = ctx.getSnapshot(String(a.snapshotId));
      if (!rec) throw new Error(`unknown snapshot ${a.snapshotId}; call list_snapshots`);
      return ctx.runLuau(
        wrapLuau(
          { id: rec.id, entries: rec.entries },
          `	local store = game:GetService("ServerStorage"):FindFirstChild("__BrickwireSnapshots")
	local snap = if store then store:FindFirstChild(ARGS.id) else nil
	local restored, removed, failed = {}, {}, {}
	for _, e in ipairs(ARGS.entries) do
		local current = bw_resolve(e.segs)
		if e.absent then
			if current ~= nil then
				current:Destroy()
				table.insert(removed, e.path)
			end
		elseif e.saved then
			local saved = if snap then snap:FindFirstChild(tostring(e.index)) else nil
			local parent = bw_resolve(e.parentSegs)
			if saved == nil or parent == nil then
				table.insert(failed, e.path)
			else
				if current ~= nil then
					current:Destroy()
				end
				local c = saved:Clone()
				c.Name = saved:GetAttribute("BW_OriginalName") or c.Name
				c:SetAttribute("BW_OriginalName", nil)
				local all = c:GetDescendants()
				table.insert(all, c)
				for _, d in ipairs(all) do
					if d:IsA("BaseScript") then
						local was = d:GetAttribute("BW_WasDisabled")
						if was ~= nil then
							d.Disabled = was
							d:SetAttribute("BW_WasDisabled", nil)
						end
					end
				end
				c.Parent = parent
				table.insert(restored, e.path)
			end
		end
	end
	bw_waypoint("Brickwire: restore " .. ARGS.id)
	return { snapshotId = ARGS.id, restored = restored, removed = removed, failed = failed }`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "get_errors",
    description: "Error/warning lines from the Studio output log (filtered get_console_output).",
    risk: "read",
    requires: ["get_console_output"],
    inputSchema: { type: "object", properties: { limit: { type: "integer", description: "default 50" } } },
    async run(a, ctx) {
      const r = await ctx.callMcp("get_console_output", {});
      const lines = r.text.split(/\r?\n/);
      const errs = lines.filter((l) => /error|exception|stack begin|traceback|attempt to|expected|failed|warn/i.test(l));
      const limit = Math.min(200, Number(a.limit ?? 50));
      return { errorCount: errs.length, lines: errs.slice(-limit) };
    },
  },
];
