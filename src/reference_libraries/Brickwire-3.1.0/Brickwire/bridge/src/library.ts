/**
 * PRO personal library: save what is selected in Studio (models, UI, scripts — full hierarchy with
 * properties, attributes, tags and script sources), prompts and recipes; insert them into any place later.
 * Stored as JSON files under data/library/.
 */
import fs from "node:fs";
import path from "node:path";

export type LibKind = "model" | "prompt" | "recipe" | "code";
export interface LibItem {
  id: string;
  name: string;
  kind: LibKind;
  tags: string[];
  note?: string;
  createdAt: string;
  updatedAt: string;
  /** model: serialized instance tree; prompt/recipe/code: text */
  data: unknown;
  stats?: { instances?: number; scripts?: number; classes?: string[] };
}

const safeId = (s: string) => /^[a-z0-9_-]{3,64}$/i.test(s);

export class PersonalLibrary {
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }
  private file(id: string) {
    if (!safeId(id)) throw Object.assign(new Error("bad id"), { status: 400 });
    return path.join(this.dir, `${id}.json`);
  }
  list(): Array<Omit<LibItem, "data">> {
    const out: Array<Omit<LibItem, "data">> = [];
    for (const f of fs.readdirSync(this.dir).filter((x) => x.endsWith(".json"))) {
      try {
        const { data: _d, ...meta } = JSON.parse(fs.readFileSync(path.join(this.dir, f), "utf8")) as LibItem;
        out.push(meta);
      } catch {
        /* skip broken file */
      }
    }
    return out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  count() {
    return fs.readdirSync(this.dir).filter((x) => x.endsWith(".json")).length;
  }
  get(id: string): LibItem | null {
    try {
      return JSON.parse(fs.readFileSync(this.file(id), "utf8")) as LibItem;
    } catch {
      return null;
    }
  }
  save(input: { id?: string; name: string; kind: LibKind; tags?: unknown; note?: string; data: unknown; stats?: LibItem["stats"] }): LibItem {
    const now = new Date().toISOString();
    const prev = input.id ? this.get(input.id) : null;
    const item: LibItem = {
      id: prev?.id ?? `lib_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: String(input.name || "Untitled").slice(0, 120),
      kind: input.kind,
      tags: (Array.isArray(input.tags) ? input.tags : String(input.tags ?? "").split(",")).map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 20),
      note: input.note ? String(input.note).slice(0, 2000) : undefined,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      data: input.data,
      stats: input.stats ?? prev?.stats,
    };
    fs.writeFileSync(this.file(item.id), JSON.stringify(item));
    return item;
  }
  remove(id: string): boolean {
    try {
      fs.unlinkSync(this.file(id));
      return true;
    } catch {
      return false;
    }
  }
}

/** Luau long-string literal that is safe for any payload. */
export function luauLongString(s: string): string {
  let eq = "=";
  while (s.includes(`]${eq}]`)) eq += "=";
  return `[${eq}[${s}]${eq}]`;
}

/** All strings inside an MCP result, joined (the printed output is somewhere in there). */
export function resultText(r: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(r);
  return out.join("\n");
}

export function extractMarked(text: string, tag = "BWLIB"): string | null {
  const a = text.indexOf(`<<${tag}>>`);
  const b = text.indexOf(`<<END_${tag}>>`, a + 1);
  return a >= 0 && b > a ? text.slice(a + tag.length + 4, b) : null;
}

const CODEC = String.raw`
local HttpService = game:GetService("HttpService")
local CS = game:GetService("CollectionService")
local function enc(v)
	local t = typeof(v)
	if t == "number" or t == "string" or t == "boolean" then return v end
	if t == "Vector3" then return { t = "V3", v = { v.X, v.Y, v.Z } } end
	if t == "Vector2" then return { t = "V2", v = { v.X, v.Y } } end
	if t == "CFrame" then return { t = "CF", v = { v:GetComponents() } } end
	if t == "Color3" then return { t = "C3", v = { v.R, v.G, v.B } } end
	if t == "UDim2" then return { t = "U2", v = { v.X.Scale, v.X.Offset, v.Y.Scale, v.Y.Offset } } end
	if t == "UDim" then return { t = "U1", v = { v.Scale, v.Offset } } end
	if t == "EnumItem" then return { t = "E", v = { tostring(v.EnumType), v.Name } } end
	if t == "BrickColor" then return { t = "BC", v = { v.Number } } end
	if t == "NumberRange" then return { t = "NR", v = { v.Min, v.Max } } end
	if t == "Rect" then return { t = "R", v = { v.Min.X, v.Min.Y, v.Max.X, v.Max.Y } } end
	if t == "ColorSequence" then
		local k = {}
		for _, p in v.Keypoints do table.insert(k, { p.Time, p.Value.R, p.Value.G, p.Value.B }) end
		return { t = "CS", v = k }
	end
	if t == "NumberSequence" then
		local k = {}
		for _, p in v.Keypoints do table.insert(k, { p.Time, p.Value, p.Envelope }) end
		return { t = "NS", v = k }
	end
	if t == "Font" then return { t = "F", v = { v.Family, v.Weight.Name, v.Style.Name } } end
	return nil
end
local function dec(x)
	if type(x) ~= "table" then return x end
	local t, v = x.t, x.v
	if t == "V3" then return Vector3.new(v[1], v[2], v[3]) end
	if t == "V2" then return Vector2.new(v[1], v[2]) end
	if t == "CF" then return CFrame.new(table.unpack(v)) end
	if t == "C3" then return Color3.new(v[1], v[2], v[3]) end
	if t == "U2" then return UDim2.new(v[1], v[2], v[3], v[4]) end
	if t == "U1" then return UDim.new(v[1], v[2]) end
	if t == "E" then return (Enum :: any)[v[1]][v[2]] end
	if t == "BC" then return BrickColor.new(v[1]) end
	if t == "NR" then return NumberRange.new(v[1], v[2]) end
	if t == "R" then return Rect.new(v[1], v[2], v[3], v[4]) end
	if t == "CS" then
		local k = {}
		for _, p in v do table.insert(k, ColorSequenceKeypoint.new(p[1], Color3.new(p[2], p[3], p[4]))) end
		return ColorSequence.new(k)
	end
	if t == "NS" then
		local k = {}
		for _, p in v do table.insert(k, NumberSequenceKeypoint.new(p[1], p[2], p[3])) end
		return NumberSequence.new(k)
	end
	if t == "F" then return Font.new(v[1], (Enum.FontWeight :: any)[v[2]], (Enum.FontStyle :: any)[v[3]]) end
	return nil
end
local PROPS = { "Size", "CFrame", "PivotOffset", "WorldPivot", "Color", "Material", "MaterialVariant", "Transparency", "Reflectance", "Anchored", "CanCollide", "CanTouch", "CanQuery", "CastShadow", "Massless", "Shape", "TopSurface", "BottomSurface", "MeshId", "TextureID", "MeshType", "Scale", "Offset", "VertexColor", "Texture", "Face", "StudsPerTileU", "StudsPerTileV", "Color3", "Brightness", "Range", "Angle", "Shadows", "Enabled", "Rate", "Lifetime", "Speed", "SpreadAngle", "LightEmission", "LightInfluence", "Rotation", "RotSpeed", "Acceleration", "Drag", "ZOffset", "EmissionDirection", "LockedToPart", "Width0", "Width1", "FaceCamera", "Segments", "Position", "AnchorPoint", "BackgroundColor3", "BackgroundTransparency", "BorderSizePixel", "BorderColor3", "Visible", "ZIndex", "LayoutOrder", "Text", "TextColor3", "TextSize", "FontFace", "TextScaled", "TextWrapped", "TextXAlignment", "TextYAlignment", "TextTransparency", "TextStrokeTransparency", "TextStrokeColor3", "RichText", "Image", "ImageColor3", "ImageTransparency", "ScaleType", "SliceCenter", "AutomaticSize", "ClipsDescendants", "CornerRadius", "Thickness", "ApplyStrokeMode", "LineJoinMode", "PaddingTop", "PaddingBottom", "PaddingLeft", "PaddingRight", "Padding", "FillDirection", "HorizontalAlignment", "VerticalAlignment", "SortOrder", "CellSize", "CellPadding", "AspectRatio", "AspectType", "DominantAxis", "MaxTextSize", "MinTextSize", "MaxSize", "MinSize", "ResetOnSpawn", "ZIndexBehavior", "IgnoreGuiInset", "DisplayOrder", "CanvasSize", "ScrollBarThickness", "AutomaticCanvasSize", "ScrollingDirection", "PlaceholderText", "ClearTextOnFocus", "MultiLine", "AutoButtonColor", "SoundId", "Volume", "Looped", "PlaybackSpeed", "C0", "C1", "Value", "RunContext", "Source", "AnimationId", "MaxForce", "Responsiveness", "Heat", "SecondaryColor", "Opacity", "RiseVelocity", "Density", "Light", "Spread", "Cover", "Haze", "Glare", "Decay" }
`;

/** Luau: serialize Selection (or given paths) → prints <<BWLIB>>json<<END_BWLIB>>. */
export function captureLuau(paths: string[] = []): string {
  return `${CODEC}
local Selection = game:GetService("Selection")
local roots = {}
for _, p in ${luauLongString(JSON.stringify(paths))} ~= "[]" and HttpService:JSONDecode(${luauLongString(JSON.stringify(paths))}) or {} do
	local cur = game
	for part in string.gmatch(p:gsub("^game%.", ""), "[^%.]+") do cur = cur and cur:FindFirstChild(part) end
	if cur then table.insert(roots, cur) end
end
if #roots == 0 then roots = Selection:Get() end
if #roots == 0 then error("BWLIB: nothing selected — select a model, part, ScreenGui or script in Studio first") end
local defaults = {}
local count, scripts, classes = 0, 0, {}
local function default(cls)
	if defaults[cls] == nil then
		local ok, inst = pcall(Instance.new, cls)
		defaults[cls] = ok and inst or false
	end
	return defaults[cls]
end
local function ser(inst, depth)
	count += 1
	if count > 5000 then error("BWLIB: too many instances (max 5000)") end
	classes[inst.ClassName] = true
	if inst:IsA("LuaSourceContainer") then scripts += 1 end
	local d = default(inst.ClassName)
	local props = {}
	for _, name in PROPS do
		local ok, val = pcall(function() return (inst :: any)[name] end)
		if ok and val ~= nil then
			local e = enc(val)
			if e ~= nil then
				local same = false
				if d then
					local okD, dv = pcall(function() return (d :: any)[name] end)
					if okD and dv ~= nil then
						local de = enc(dv)
						same = de ~= nil and HttpService:JSONEncode({ de }) == HttpService:JSONEncode({ e })
					end
				end
				if not same then props[name] = e end
			end
		end
	end
	local attrs = {}
	for k, v in inst:GetAttributes() do
		local e = enc(v)
		if e ~= nil then attrs[k] = e end
	end
	local node = { c = inst.ClassName, n = inst.Name, p = props, a = attrs, g = CS:GetTags(inst), k = {} }
	for _, ch in inst:GetChildren() do
		if ch.Archivable then table.insert(node.k, ser(ch, depth + 1)) end
	end
	return node
end
local out = {}
for _, r in roots do
	table.insert(out, { parent = r.Parent and r.Parent:GetFullName() or "Workspace", tree = ser(r, 0) })
end
local cl = {}
for k in classes do table.insert(cl, k) end
print("<<BWLIB>>" .. HttpService:JSONEncode({ roots = out, stats = { instances = count, scripts = scripts, classes = cl } }) .. "<<END_BWLIB>>")
`;
}

/** Luau: rebuild a captured item. Parents to the original parent when it exists (or a given path), else Workspace. */
export function insertLuau(data: unknown, opts: { parent?: string; name?: string } = {}): string {
  return `${CODEC}
local data = HttpService:JSONDecode(${luauLongString(JSON.stringify(data))})
local function resolve(path)
	if not path or path == "" then return nil end
	local cur = game
	for part in string.gmatch(path:gsub("^game%.", ""), "[^%.]+") do
		cur = cur and cur:FindFirstChild(part)
	end
	return cur
end
local function build(node)
	local ok, inst = pcall(Instance.new, node.c)
	if not ok then
		inst = Instance.new("Folder")
		inst:SetAttribute("BW_MissingClass", node.c)
	end
	inst.Name = node.n
	for k, v in node.p or {} do
		pcall(function() (inst :: any)[k] = dec(v) end)
	end
	for k, v in node.a or {} do pcall(function() inst:SetAttribute(k, dec(v)) end) end
	for _, t in node.g or {} do pcall(function() CS:AddTag(inst, t) end) end
	for _, ch in node.k or {} do
		local c = build(ch)
		c.Parent = inst
	end
	return inst
end
local made = {}
for _, r in data.roots do
	local parent = resolve(${luauLongString(opts.parent ?? "")}) or resolve(r.parent) or workspace
	local inst = build(r.tree)
	${opts.name ? `inst.Name = ${luauLongString(opts.name)}` : ""}
	inst.Parent = parent
	table.insert(made, inst:GetFullName())
end
pcall(function() game:GetService("ChangeHistoryService"):SetWaypoint("Brickwire library insert") end)
pcall(function() game:GetService("Selection"):Set((function() local t = {} for _, p in made do local i = resolve(p) if i then table.insert(t, i) end end return t end)()) end)
print("<<BWLIB>>" .. HttpService:JSONEncode({ inserted = made }) .. "<<END_BWLIB>>")
`;
}
