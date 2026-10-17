/**
 * Asset packs: turn a parsed .rbxm into (1) a searchable index of items with meaningful names and
 * (2) compact per-item build data the Luau runtime (`BW.asset`) reconstructs inside Studio.
 *
 * - Containers (Folders, default-named "Model" groups, the root) become categories; everything else is an item.
 * - Unnamed instances ("Part", "MeshPart", "Texture", "Model", "Weld", …) get names from asset names, shape,
 *   colour and material, faces, weld targets.
 * - Properties: everything scriptable is kept except internal/derived ones and common defaults.
 */
import { nameOf, parseRbxm, type RInst, type RVal, type RbxmFile } from "./parse.js";
import { decodeAttributes } from "./attributes.js";

/** Compact property value: primitive, or a tagged array ["V3", x, y, z] etc. */
export type PV = string | number | boolean | (string | number | number[])[];
export interface PNode {
  c: string; // class
  n: string; // name
  p?: Record<string, PV>;
  a?: Record<string, PV>; // attributes
  k?: PNode[]; // children
  i?: number; // local id (only when referenced)
  u?: PNode[]; // union fallback: the parts the union was made of (from ChildData2)
}
export type ItemKind = "model" | "mesh" | "part" | "texture" | "decal" | "vfx" | "sound" | "sky" | "lighting" | "ui" | "script" | "character" | "other";
export interface PackItem {
  id: string; // "pack/slug"
  name: string;
  original: string; // original instance name
  path: string; // original path under the pack root, "Folder/Sub/Name#k" (k = index among same-name siblings)
  category: string;
  kind: ItemKind;
  className: string;
  size: [number, number, number];
  parts: number;
  meshes: number;
  unions: number;
  scripts: number;
  fx: number;
  tags: string[];
  thumbAsset?: string; // asset id best representing the item (for thumbnails)
  renamed: boolean;
  /** several cross-referencing siblings merged into one synthetic Model (no single original instance) */
  merged?: boolean;
  bytes: number; // size of the build data
}
export interface PackConfig {
  id: string;
  file: string;
  title: string;
  description: string;
  skip?: string[]; // original paths (relative to root, "/"-joined, prefix match)
  /** hand/vision-made names keyed by original path */
  names?: Record<string, string>;
  credits?: string;
}
export interface PackIndex {
  id: string;
  title: string;
  description: string;
  credits: string;
  root: string; // original root instance name (to find a copy the user dragged into Studio)
  categories: Record<string, number>;
  items: PackItem[];
}
export interface BuiltPack { index: PackIndex; data: Record<string, PNode> }
export type AssetNames = Record<string, { n: string; t?: number } | null>;

// ---------------------------------------------------------------- naming helpers
const DEFAULT_NAMES = new Set(
  "Part MeshPart Model Union UnionOperation NegateOperation Mesh SpecialMesh Texture Decal Weld WeldConstraint Motor6D Snap ManualWeld Attachment ParticleEmitter Beam Trail Smoke Fire Sparkles PointLight SpotLight SurfaceLight Sound Script LocalScript ModuleScript Folder Texture Part Wedge WedgePart CornerWedgePart TrussPart Seat VehicleSeat SurfaceAppearance Highlight BillboardGui SurfaceGui Frame ImageLabel TextLabel Group Object Thing Handle Item"
    .split(" ")
    .map((s) => s.toLowerCase()),
);
const GENERIC_ASSET = /^(render ?mesh|mesh(part)?|textures?|images?|decals?|untitled|asset|part|cube|object|default|new|test|\d+|one|two|three|[a-z]|beam|particles?|sound|audio|imagelabel|unnamed|model|group|union|sphere|cylinder|plane|circle|ring|square|thing|item|white|black|blank|noise|png|jpg|smoke)$/i;

export function isDefaultName(name: string, cls: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (n.toLowerCase() === cls.toLowerCase()) return true;
  if (DEFAULT_NAMES.has(n.toLowerCase())) return true;
  if (/^(part|model|meshpart|union|mesh|texture|decal|object|group)\s*\d+$/i.test(n)) return true;
  if (/^(texture|meshes|images)\s?part$/i.test(n)) return true;
  if (/^meshes\//i.test(n)) return true;
  return false;
}

export function cleanAssetName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = raw.replace(/^(images|meshes|textures|decals|audio)\//i, "").replace(/\.(png|jpe?g|tga|bmp|fbx|obj|mesh|rbxm|mp3|ogg|wav)$/i, "");
  s = s.replace(/\(\d+\)/g, " ").replace(/[_\-.]+/g, " ").replace(/\b(cube|cylinder|plane|sphere|circle)\s*\d{2,}\b/gi, " ").replace(/\s+\d{3,}\b/g, " ");
  s = s.replace(/[^\p{L}\p{N} ]+/gu, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/\s(diff|diffuse|color|colour|col|albedo|basecolor|base color|png|jpg|texture|tex)(\s\d+k)?$/i, "").replace(/\s\d+k(\s(color|diff))?$/i, "").replace(/^(textures com|decals?)\s/i, "").trim();
  if (!s || s.length < 2 || s.length > 40 || GENERIC_ASSET.test(s)) return null;
  if (/^(rbxasset|http)/i.test(s)) return null;
  return s;
}

export function toItemName(s: string): string {
  const words = s.replace(/[_\-./]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).filter(Boolean);
  return words.map((w) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0]!.toUpperCase() + w.slice(1).toLowerCase())).join("_").slice(0, 48) || "Item";
}

export function slug(s: string): string {
  return s.toLowerCase().replace(/['"]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "item";
}

const PALETTE: [string, number, number, number][] = [
  ["White", 242, 243, 243], ["Light_Gray", 200, 200, 200], ["Gray", 140, 140, 140], ["Dark_Gray", 80, 80, 80], ["Black", 20, 20, 20],
  ["Red", 210, 40, 40], ["Dark_Red", 120, 20, 20], ["Pink", 255, 150, 190], ["Hot_Pink", 255, 60, 160], ["Orange", 240, 130, 30],
  ["Brown", 120, 80, 50], ["Dark_Brown", 70, 45, 30], ["Tan", 200, 170, 120], ["Beige", 230, 215, 180], ["Yellow", 245, 205, 50],
  ["Gold", 215, 170, 60], ["Lime", 150, 230, 60], ["Green", 60, 160, 70], ["Dark_Green", 30, 90, 40], ["Olive", 120, 130, 60],
  ["Teal", 30, 150, 140], ["Cyan", 60, 210, 230], ["Sky_Blue", 120, 180, 240], ["Blue", 40, 90, 210], ["Navy", 25, 40, 100],
  ["Purple", 120, 60, 180], ["Lavender", 180, 150, 230], ["Magenta", 210, 50, 200],
];
export function colorName(rgb: [number, number, number]): string {
  let best = PALETTE[0]!, bd = Infinity;
  for (const p of PALETTE) {
    const d = (p[1] - rgb[0]) ** 2 * 0.3 + (p[2] - rgb[1]) ** 2 * 0.59 + (p[3] - rgb[2]) ** 2 * 0.11;
    if (d < bd) { bd = d; best = p; }
  }
  return best[0];
}
const MATERIALS: Record<number, string> = {
  256: "Plastic", 272: "Smooth", 288: "Neon", 512: "Wood", 528: "Wood_Planks", 784: "Marble", 800: "Slate", 816: "Concrete",
  832: "Granite", 848: "Brick", 864: "Pebble", 880: "Cobblestone", 1040: "Rusty_Metal", 1056: "Diamond_Plate", 1072: "Foil",
  1088: "Metal", 1280: "Grass", 1296: "Sand", 1312: "Fabric", 1536: "Ice", 1568: "Glass", 1584: "Forcefield",
};
const SHAPES: Record<number, string> = { 0: "Ball", 1: "Block", 2: "Cylinder", 3: "Wedge", 4: "Corner_Wedge" };
const FACES = ["Right", "Top", "Back", "Left", "Bottom", "Front"];

// ---------------------------------------------------------------- property encoding
const SKIP_PROPS = new Set(
  (
    "AttributesSerialize Capabilities DefinesCapabilities SourceAssetId Tags UniqueId HistoryId ScriptGuid LinkedSource IsDifferentFromFileSystem " +
    "BackParamA BackParamB BottomParamA BottomParamB FrontParamA FrontParamB LeftParamA LeftParamB RightParamA RightParamB TopParamA TopParamB " +
    "BackSurfaceInput BottomSurfaceInput FrontSurfaceInput LeftSurfaceInput RightSurfaceInput TopSurfaceInput Velocity RotVelocity " +
    "AssemblyLinearVelocity AssemblyAngularVelocity UnscaledCofm UnscaledVolInertiaDiags UnscaledVolInertiaOffDiags UnscaledVolume " +
    "PhysicsData PhysicalConfigData AeroMeshData VertexCount HasSkinnedMesh HasJointOffset JointOffset FluidFidelityInternal InertiaMigrated " +
    "AudioCanCollide CollisionGroupId RootPriority Locked formFactorRaw FormFactor PivotOffset MeshData MeshData2 ChildData ChildData2 AssetId " +
    "SolidModel ComponentIndex LevelOfDetail ModelStreamingMode NeedsPivotMigration ScaleFactor WorldPivotData ModelMeshCFrame ModelMeshData " +
    "ModelMeshSize SlimHash TexturePack TexturePackMetadata EmissiveMaskContent FlipbookIncompatible PlaybackRegion LoopRegion TimePosition " +
    "Playing IsPlaying TimeLength InternalMeshPartRenderingData EnableFluidForces RenderFidelity CollisionFidelity DoubleSided InitialSize " +
    "ScriptVersion Disabled CachedFaceId AutoLocalize RootLocalizationTable SelectionImageObject SelectionOrder NextSelectionUp NextSelectionDown " +
    "NextSelectionLeft NextSelectionRight SelectionBehaviorDown SelectionBehaviorUp SelectionBehaviorLeft SelectionBehaviorRight SelectionGroup " +
    "Localize RawText ContentText Archivable UsePartColor UsePackageColor ResetOnSpawn HealthDisplayDistance NameDisplayDistance"
  ).split(" "),
);
const RENAME_PROPS: Record<string, string> = {
  size: "Size", shape: "Shape", Color3uint8: "Color", MaterialVariantSerialized: "MaterialVariant", Part0Internal: "Part0", Part1Internal: "Part1",
  xmlRead_MaxDistance_3: "RollOffMaxDistance", xmlRead_MinDistance_3: "RollOffMinDistance", BrickColor: "BrickColor", FontFace: "FontFace",
  MeshID: "MeshId", Texture: "Texture",
};
/** prop → default value (dropped when equal) */
const DEFAULTS: Record<string, unknown> = {
  Transparency: 0, Reflectance: 0, CastShadow: true, CanCollide: true, CanTouch: true, CanQuery: true, Massless: false, Material: 256,
  BackSurface: 0, BottomSurface: 0, FrontSurface: 0, LeftSurface: 0, RightSurface: 0, TopSurface: 0, CollisionGroup: "Default", MaterialVariant: "",
  Enabled: true, Visible: true, ZIndex: 1, LightEmission: 0, Brightness: 1, TimeScale: 1, Drag: 0, VelocityInheritance: 0, ZOffset: 0,
  LockedToPart: false, WindAffectsDrag: false, Shape: 1, Looped: false, PlaybackSpeed: 1, PlayOnRemove: false, RollOffMode: 0,
  RollOffMinDistance: 10, RollOffMaxDistance: 10000, AcousticSimulationEnabled: true, PlaybackRegionsEnabled: false, OffsetStudsU: 0, OffsetStudsV: 0,
  Rotation: 0, StudsPerTileU: 2, StudsPerTileV: 2, FlipbookBlendFrames: true, FlipbookLayout: 0, FlipbookMode: 0, FlipbookSizeX: 1, FlipbookSizeY: 1,
  FlipbookStartRandom: false, ShapePartial: 1, ShapeStyle: 0, ShapeInOut: 0, Shadows: false, EmissiveStrength: 1, AlphaMode: 0, ResampleMode: 0,
  MeshType: 5, TextureId: "", TextureID: "", VertexColor: ["V3", 1, 1, 1], Offset: ["V3", 0, 0, 0], Scale: ["V3", 1, 1, 1], SoundGroup: null,
  Text: "", SoundId: "", Value: undefined,
};
const r4 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : 0);
const r3 = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e3) / 1e3 : 0);

function encodeVal(v: RVal, refId: (ref: number) => number | null): PV | null | undefined {
  switch (v.t) {
    case "string": return v.v;
    case "bytes": return undefined;
    case "bool": return v.v;
    case "int": case "Int64": return v.v;
    case "float": case "double": return r4(v.v);
    case "Enum": return v.v;
    case "UDim": return ["U", r4(v.v[0]), v.v[1]];
    case "UDim2": return ["U2", r4(v.v[0]), v.v[1], r4(v.v[2]), v.v[3]];
    case "Color3": return ["C3", r3(v.v[0]), r3(v.v[1]), r3(v.v[2])];
    case "Color3uint8": return ["C8", v.v[0], v.v[1], v.v[2]];
    case "BrickColor": return ["BC", v.v];
    case "Vector2": return ["V2", r4(v.v[0]), r4(v.v[1])];
    case "Vector3": case "Vector3int16": return ["V3", r4(v.v[0]), r4(v.v[1]), r4(v.v[2])];
    case "CFrame": return ["CF", ...v.v.map((x, i) => (i < 3 ? r3(x) : r4(x)))];
    case "Ref": { if (v.v < 0) return null; const id = refId(v.v); return id === null ? undefined : ["R", id]; }
    case "NumberSequence": return ["NS", v.v.flatMap((k) => [r3(k[0]!), r3(k[1]!), r3(k[2]!)])];
    case "ColorSequence": return ["CS", v.v.flatMap((k) => [r3(k[0]!), r3(k[1]!), r3(k[2]!), r3(k[3]!)])];
    case "NumberRange": return ["NR", r4(v.v[0]), r4(v.v[1])];
    case "Rect": return ["RC", r4(v.v[0]), r4(v.v[1]), r4(v.v[2]), r4(v.v[3])];
    case "PhysicalProperties": return v.v ? ["PP", ...v.v.map(r4)] : undefined;
    case "Font": return ["FT", v.v.family, v.v.weight, v.v.style];
    case "Content": return v.v ?? undefined;
    default: return undefined;
  }
}

function sameAsDefault(prop: string, val: PV | null): boolean {
  if (!(prop in DEFAULTS)) return false;
  const d = DEFAULTS[prop];
  if (d === undefined) return false;
  return JSON.stringify(d) === JSON.stringify(val);
}

// ---------------------------------------------------------------- geometry
function isBasePart(c: string) {
  return /^(Part|MeshPart|WedgePart|CornerWedgePart|TrussPart|Seat|VehicleSeat|SpawnLocation|UnionOperation|NegateOperation|IntersectOperation|PartOperation|SkateboardPlatform)$/.test(c);
}
function cf(i: RInst): number[] | null { const v = i.props.CFrame; return v && v.t === "CFrame" ? v.v : null; }
function sz(i: RInst): [number, number, number] | null { const v = i.props.size ?? i.props.Size; return v && v.t === "Vector3" ? v.v : null; }

function bbox(parts: RInst[]): { min: number[]; max: number[] } | null {
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const p of parts) {
    const c = cf(p), s = sz(p);
    if (!c || !s) continue;
    any = true;
    for (let a = 0; a < 3; a++) {
      const ext = Math.abs(c[3 + a * 3]!) * s[0] / 2 + Math.abs(c[4 + a * 3]!) * s[1] / 2 + Math.abs(c[5 + a * 3]!) * s[2] / 2;
      min[a] = Math.min(min[a]!, c[a]! - ext);
      max[a] = Math.max(max[a]!, c[a]! + ext);
    }
  }
  return any ? { min, max } : null;
}
function descendants(i: RInst): RInst[] { const out: RInst[] = []; const w = (x: RInst) => { out.push(x); x.children.forEach(w); }; w(i); return out; }

// ---------------------------------------------------------------- the pack builder
const SKIP_CLASS = new Set(["Camera"]);
const CREDIT_NAMES = /^(credits?|readme|read me|info|license|remove pack|plugins?)$/i;

function strProp(i: RInst, k: string): string | null { const v = i.props[k]; return v && (v.t === "string" || v.t === "Content") && v.v ? String(v.v) : null; }
export function assetIdOf(s: string | null): string | null { const m = s?.match(/(?:rbxassetid:\/\/|[?&]id=)(\d+)/i); return m ? m[1]! : null; }

/** The most representative asset id of an instance (mesh, texture, sky, sound…) */
function primaryAsset(i: RInst): string | null {
  for (const k of ["MeshId", "TextureID", "Texture", "SoundId", "ColorMap", "SkyboxFt", "Image", "ShirtTemplate", "Graphic"]) {
    const id = assetIdOf(strProp(i, k));
    if (id) return id;
  }
  return null;
}

export class PackBuilder {
  private names: AssetNames;
  private ssCache = new Map<number, RbxmFile | null>();
  private file: RbxmFile;
  private cfg: PackConfig;
  constructor(file: RbxmFile, cfg: PackConfig, names: AssetNames = {}) { this.file = file; this.cfg = cfg; this.names = names; }

  assetName(id: string | null): string | null { return id ? cleanAssetName(this.names[id]?.n) : null; }

  private isContainer(i: RInst, depth: number): boolean {
    if (i.className === "Folder") return true;
    if (depth === 0 && (i.className === "Model" || i.className === "Folder")) return true;
    if (i.className === "Model" && isDefaultName(nameOf(i), "Model") && i.children.length >= 8 && !(i.props.PrimaryPart && i.props.PrimaryPart.t === "Ref" && i.props.PrimaryPart.v >= 0)) return true;
    if (i.className === "Model" && i.children.length >= 12 && /textures?|parts|models|assets|pack|kit|collection/i.test(nameOf(i))) return true;
    return false;
  }

  /** A human-meaningful name for an instance whose own name is a default one. */
  autoName(i: RInst, ctx: { category: string }): string {
    const own = nameOf(i);
    if (!isDefaultName(own, i.className)) return toItemName(own.replace(/^meshes\//i, ""));
    const fromAsset = this.assetName(primaryAsset(i));
    const desc = descendants(i);
    if (fromAsset) return toItemName(fromAsset);
    // a mesh/texture/emitter child that has a meaningful asset name
    for (const d of desc.slice(1)) {
      const nm = !isDefaultName(nameOf(d), d.className) && d.className !== "Attachment" ? nameOf(d) : this.assetName(primaryAsset(d));
      if (nm && !/^(handle|mesh|attachment)$/i.test(nm)) {
        const suffix = d.className === "ParticleEmitter" ? "_Emitter" : d.className === "Beam" ? "_Beam" : "";
        return toItemName(nm) + (i.className === "Model" ? "_Model" : suffix);
      }
    }
    if (i.className === "Sky") return "Sky";
    // shape + colour + material
    const col = i.props.Color3uint8;
    const color = col && col.t === "Color3uint8" ? colorName(col.v) : null;
    const mat = i.props.Material && i.props.Material.t === "Enum" ? MATERIALS[i.props.Material.v] : null;
    const shape = i.className === "Part" && i.props.shape?.t === "Enum" ? SHAPES[i.props.shape.v] : i.className === "WedgePart" ? "Wedge" : i.className === "CornerWedgePart" ? "Corner_Wedge" : i.className === "TrussPart" ? "Truss" : i.className === "MeshPart" ? "Mesh" : i.className === "UnionOperation" ? "Union" : null;
    const hasTex = desc.some((d) => d.className === "Texture");
    const hasDecal = desc.some((d) => d.className === "Decal");
    const hasFx = desc.some((d) => /ParticleEmitter|Beam|Trail|Fire|Smoke|Sparkles/.test(d.className));
    const cat = ctx.category.split("/").pop() ?? "";
    const bits = [color, mat && mat !== "Plastic" && mat !== "Smooth" ? mat : null, hasFx ? "FX" : hasTex ? "Textured" : hasDecal ? "Decal" : null, shape ?? i.className].filter(Boolean) as string[];
    if (i.className === "Model") bits.splice(0, bits.length, cat && !isDefaultName(cat, "Folder") ? toItemName(cat) : "Model", `${desc.filter((d) => isBasePart(d.className)).length}p`);
    return bits.join("_");
  }

  /** Items that still share a name get a distinguishing colour / size word, then a number. */
  private disambiguate(items: PackItem[], data: Record<string, PNode>) {
    const groups = new Map<string, PackItem[]>();
    for (const it of items) { const g = groups.get(it.name) ?? []; g.push(it); groups.set(it.name, g); }
    for (const [name, g] of groups) {
      if (g.length < 2) continue;
      const colorOf = (it: PackItem) => { const n = data[it.id]!; const c = n.p?.Color; return Array.isArray(c) && c[0] === "C8" ? colorName([c[1] as number, c[2] as number, c[3] as number]) : null; };
      const cols = g.map(colorOf);
      const vols = g.map((it) => it.size[0] * it.size[1] * it.size[2]);
      const sorted = [...vols].sort((a, b) => a - b);
      const sizeWord = (v: number) => (v <= sorted[Math.floor(sorted.length / 3)]! ? "Small" : v >= sorted[Math.floor((sorted.length * 2) / 3)]! ? "Large" : "Medium");
      const seen = new Map<string, number>();
      g.forEach((it, k) => {
        const parts = [name];
        const col = cols[k];
        if (col && new Set(cols).size > 1 && !name.includes(col)) parts.push(col);
        if (g.length > 2 && new Set(vols).size > 1) parts.push(sizeWord(vols[k]!));
        let nm = parts.join("_");
        const n = (seen.get(nm) ?? 0) + 1;
        seen.set(nm, n);
        if (n > 1 || g.filter((_, j) => j !== k).length) nm = nm; // numbering below
        it.name = nm;
      });
      // number only the names that are still duplicated
      const again = new Map<string, PackItem[]>();
      for (const it of g) { const a = again.get(it.name) ?? []; a.push(it); again.set(it.name, a); }
      for (const [nm, a] of again) if (a.length > 1) a.forEach((it, k) => { it.name = `${nm}_${k + 1}`; });
      for (const it of g) { data[it.id]!.n = it.name; it.renamed = it.name !== it.original; }
    }
  }

  /** asset-derived name of the item or its first meaningful descendant */
  distinctAsset(i: RInst): string | null {
    for (const d of descendants(i)) {
      const n = this.assetName(primaryAsset(d));
      if (n) return n;
    }
    return null;
  }

  private childName(d: RInst, parent: RInst | null, nameOfNode: Map<RInst, string>): string {
    const own = nameOf(d);
    const c = d.className;
    if (!isDefaultName(own, c) && !(parent && own === nameOf(parent) && (c === "Texture" || c === "Decal"))) return own;
    if (c === "Texture" || c === "Decal") {
      const face = d.props.Face?.t === "Enum" ? FACES[d.props.Face.v] ?? "" : "";
      const an = this.assetName(assetIdOf(strProp(d, "Texture")));
      return (an ? toItemName(an) : c) + (face ? "_" + face : "");
    }
    if (/^(Weld|WeldConstraint|Motor6D|Snap|ManualWeld)$/.test(c)) {
      const p1 = d.props.Part1 ?? d.props.Part1Internal;
      if (p1 && p1.t === "Ref") { const t = this.file.all.find((x) => x.ref === p1.v); if (t) return `${c === "Motor6D" ? "Motor" : "Weld"}_${nameOfNode.get(t) ?? nameOf(t)}`; }
      return own;
    }
    if (c === "SpecialMesh") return "Mesh";
    if (c === "ParticleEmitter" || c === "Beam" || c === "Trail") { const an = this.assetName(assetIdOf(strProp(d, "Texture"))); return an ? toItemName(an) + "_" + c.replace("ParticleEmitter", "Emitter") : own; }
    if (c === "Sound") { const an = this.assetName(assetIdOf(strProp(d, "SoundId"))); return an ? toItemName(an) : own; }
    if (c === "Attachment" || c === "Folder" || c === "Script" || c === "LocalScript" || c === "ModuleScript" || c === "SurfaceAppearance") return own;
    if (isBasePart(c) || c === "Model") return this.autoName(d, { category: "" });
    return own;
  }

  private sharedRbxm(idx: number): RbxmFile | null {
    if (this.ssCache.has(idx)) return this.ssCache.get(idx)!;
    let f: RbxmFile | null = null;
    const b = this.file.sharedStrings[idx];
    if (b && b.length > 32) { try { f = parseRbxm(b); } catch { f = null; } }
    this.ssCache.set(idx, f);
    return f;
  }

  /** Encode an item subtree; positions are re-centred so the bounding-box centre is the origin. */
  encode(item: RInst): { node: PNode; size: [number, number, number] } {
    const all = descendants(item);
    const parts = all.filter((d) => isBasePart(d.className));
    const bb = bbox(parts);
    const centre = bb ? [0, 1, 2].map((a) => (bb.min[a]! + bb.max[a]!) / 2) : [0, 0, 0];
    const size: [number, number, number] = bb ? [r3(bb.max[0]! - bb.min[0]!), r3(bb.max[1]! - bb.min[1]!), r3(bb.max[2]! - bb.min[2]!)] : [0, 0, 0];
    const local = new Map<number, number>();
    all.forEach((d, k) => local.set(d.ref, k + 1));
    const used = new Set<number>();
    const refId = (ref: number) => { const id = local.get(ref); if (id === undefined) return null; used.add(id); return id; };
    const nameOfNode = new Map<RInst, string>();
    const enc = (d: RInst, parent: RInst | null, offset: number[], refFn: (r: number) => number | null, top: boolean): PNode => {
      const nm = top ? nameOf(d) : this.childName(d, parent, nameOfNode);
      nameOfNode.set(d, nm);
      const p: Record<string, PV> = {};
      for (const [k0, v] of Object.entries(d.props)) {
        if (k0 === "Name" || SKIP_PROPS.has(k0)) continue;
        const k = RENAME_PROPS[k0] ?? k0;
        if (k === "BrickColor" && d.props.Color3uint8) continue;
        let e = encodeVal(v, refFn);
        if (e === undefined) continue;
        if (k === "CFrame" && Array.isArray(e) && isBasePart(d.className)) e = ["CF", ...[0, 1, 2].map((a) => r3((v.v as number[])[a]! - offset[a]!)), ...(e.slice(4) as number[])];
        if (e === null) continue;
        if (sameAsDefault(k, e)) continue;
        if (k === "Source" && typeof e === "string" && e.length > 30000) e = e.slice(0, 30000) + "\n-- (truncated by Brickwire)";
        p[k] = e;
      }
      if (d.className === "MeshPart") { const is = d.props.InitialSize; if (is && is.t === "Vector3") p.InitialSize = ["V3", r4(is.v[0]), r4(is.v[1]), r4(is.v[2])]; }
      if (d.className === "Script" || d.className === "LocalScript") { const dis = d.props.Disabled; if (dis && dis.t === "bool" && dis.v) p.Enabled = false; }
      const node: PNode = { c: d.className, n: nm };
      if (Object.keys(p).length) node.p = p;
      const at = d.props.AttributesSerialize;
      if (at && at.t === "bytes") { const a = decodeAttributes(at.v); if (Object.keys(a).length) node.a = a; }
      if (/^(UnionOperation|NegateOperation|IntersectOperation)$/.test(d.className)) {
        const cd = d.props.ChildData2;
        const f = cd && cd.t === "SharedString" ? this.sharedRbxm(cd.v) : null;
        if (f) {
          const sub = f.all.filter((x) => isBasePart(x.className));
          const subLocal = new Map<number, number>();
          const refSub = () => null;
          void subLocal;
          // the union's children were saved at their union-time position; centre them on the union.
          const sbb = bbox(sub);
          const sc = sbb ? [0, 1, 2].map((a) => (sbb.min[a]! + sbb.max[a]!) / 2) : offset;
          node.u = f.roots.filter((x) => isBasePart(x.className)).map((x) => enc(x, null, sc, refSub, false));
        }
      }
      const kids = d.children.filter((x) => !SKIP_CLASS.has(x.className));
      if (kids.length) node.k = kids.map((x) => enc(x, d, offset, refFn, false));
      (node as PNode & { _ref?: number }).i = local.get(d.ref);
      return node;
    };
    const node = enc(item, null, centre, refId, true);
    // keep local ids only where referenced
    const strip = (n: PNode) => { if (n.i !== undefined && !used.has(n.i)) delete n.i; n.k?.forEach(strip); n.u?.forEach(strip); };
    strip(node);
    return { node, size };
  }

  build(): BuiltPack {
    const root = this.file.roots.length === 1 ? this.file.roots[0]! : null;
    const tops = root ? [root] : this.file.roots;
    const items: PackItem[] = [];
    let data: Record<string, PNode> = {};
    const categories: Record<string, number> = {};
    const usedSlugs = new Map<string, number>();
    const credits: string[] = this.cfg.credits ? [this.cfg.credits] : [];
    const skip = (p: string) => (this.cfg.skip ?? []).some((s) => p === s || p.startsWith(s + "/"));
    const walk = (i: RInst, depth: number, catPath: string[], origPath: string[]) => {
      const sameName = new Map<string, number>();
      const totals = new Map<string, number>();
      for (const ch of i.children) totals.set(nameOf(ch), (totals.get(nameOf(ch)) ?? 0) + 1);
      // siblings that reference each other (Beam holder ↔ end part, welds across items) become one item
      const sib = i.children;
      const owner = new Map<number, number>();
      sib.forEach((ch, k) => { for (const d of descendants(ch)) owner.set(d.ref, k); });
      const uf = sib.map((_, k) => k);
      const find = (x: number): number => (uf[x] === x ? x : (uf[x] = find(uf[x]!)));
      sib.forEach((ch, k) => {
        if (this.isContainer(ch, depth + 1)) return;
        for (const d of descendants(ch)) for (const [pk, v] of Object.entries(d.props)) {
          if (v.t !== "Ref" || v.v < 0 || pk === "PrimaryPart") continue;
          const o = owner.get(v.v);
          if (o !== undefined && o !== k && !this.isContainer(sib[o]!, depth + 1)) uf[find(o)] = find(k);
        }
      });
      const groups = new Map<number, number[]>();
      sib.forEach((_, k) => { const r = find(k); const g = groups.get(r) ?? []; g.push(k); groups.set(r, g); });
      const relOf: string[] = [];
      {
        const seen = new Map<string, number>();
        for (const ch of sib) { const on = nameOf(ch); const k = seen.get(on) ?? 0; seen.set(on, k + 1); relOf.push([...origPath, k ? `${on}#${k}` : on].join("/")); }
      }
      for (let si = 0; si < sib.length; si++) {
        let ch = sib[si]!;
        const grp = groups.get(find(si))!;
        let memberPaths = [relOf[si]!];
        if (grp.length > 1) {
          if (grp[0] !== si) continue; // emitted with the first member
          const members = grp.map((g) => sib[g]!);
          const lead = members.find((m) => !isDefaultName(nameOf(m), m.className) && !/part$/i.test(nameOf(m))) ?? members[0]!;
          ch = { ref: -1000000 - si, className: "Model", props: { Name: { t: "string", v: nameOf(lead) } }, children: members, parent: null };
          memberPaths = grp.map((g) => relOf[g]!);
        }
        const on = nameOf(ch);
        const k = sameName.get(on) ?? 0;
        sameName.set(on, k + 1);
        const op = [...origPath, k ? `${on}#${k}` : on];
        const rel = grp.length > 1 ? relOf[si]! : op.join("/");
        if (skip(rel) || skip(op.map((s) => s.replace(/#\d+$/, "")).join("/"))) continue;
        if (SKIP_CLASS.has(ch.className)) continue;
        if (/Script$/.test(ch.className) && CREDIT_NAMES.test(on)) {
          const src = strProp(ch, "Source");
          if (src && credits.length < 12) credits.push(src.replace(/\s+/g, " ").trim().slice(0, 300));
          continue;
        }
        if (this.isContainer(ch, depth + 1)) {
          const cat = isDefaultName(on, ch.className) ? catPath : [...catPath, on];
          walk(ch, depth + 1, cat, op);
          continue;
        }
        const cp = root && catPath[0] === nameOf(root) ? catPath.slice(1) : catPath;
        const category = cp.join("/") || "Misc";
        let name = this.autoName(ch, { category });
        const manual = memberPaths.map((mp) => this.cfg.names?.[mp]).find(Boolean);
        if (manual) name = manual;
        else if ((totals.get(on) ?? 0) >= 2 && !isDefaultName(on, ch.className)) {
          // many siblings share one name ("Graffiti" ×258): add what makes this one different
          const extra = this.distinctAsset(ch);
          if (extra) name = mergeNames(name, extra);
        }
        let s = slug(name);
        const n = (usedSlugs.get(s) ?? 0) + 1;
        usedSlugs.set(s, n);
        if (n > 1) s = `${s}_${n}`;
        const id = `${this.cfg.id}/${s}`;
        const { node, size } = this.encode(ch);
        node.n = name;
        const desc = descendants(ch);
        const cc = (re: RegExp) => desc.filter((d) => re.test(d.className)).length;
        const parts = desc.filter((d) => isBasePart(d.className)).length;
        const item: PackItem = {
          id,
          name,
          original: on,
          path: rel,
          category,
          kind: kindOf(ch, desc),
          className: ch.className,
          size,
          parts,
          meshes: cc(/^MeshPart$|^SpecialMesh$/),
          unions: cc(/Operation$/),
          scripts: cc(/Script$/),
          fx: cc(/^(ParticleEmitter|Beam|Trail|Fire|Smoke|Sparkles)$/),
          tags: [],
          thumbAsset: thumbAssetOf(ch, desc) ?? undefined,
          renamed: name !== on,
          bytes: JSON.stringify(node).length,
        };
        if (grp.length > 1) item.merged = true;
        item.tags = tagsOf(item, category);
        items.push(item);
        data[id] = node;
        categories[category] = (categories[category] ?? 0) + 1;
      }
    };
    for (const t of tops) {
      if (this.isContainer(t, 0)) walk(t, 0, [], []);
    }
    this.disambiguate(items, data);
    // ids follow the FINAL (disambiguated) names: "ultimate/forcefield_red_1" ↔ name Forcefield_Red_1
    {
      const used = new Map<string, number>();
      const remapped: Record<string, PNode> = {};
      for (const it of items) {
        const base = slug(it.name);
        let n = used.get(base) ?? 0;
        let s = base;
        while (remapped[`${this.cfg.id}/${s}`]) s = `${base}_${++n + 1}`;
        used.set(base, n);
        const nid = `${this.cfg.id}/${s}`;
        remapped[nid] = data[it.id]!;
        it.id = nid;
      }
      data = remapped;
    }
    return {
      index: { id: this.cfg.id, title: this.cfg.title, description: this.cfg.description, credits: credits.join(" | ").slice(0, 1200), root: root ? nameOf(root) : "", categories, items },
      data,
    };
  }
}

function mergeNames(base: string, extra: string): string {
  const b = base.split("_");
  const seen = new Set(b.map((w) => w.toLowerCase()));
  const add = toItemName(extra).split("_").filter((w) => !seen.has(w.toLowerCase()));
  return add.length ? [...b, ...add].join("_").slice(0, 48) : base;
}

function kindOf(i: RInst, desc: RInst[]): ItemKind {
  const c = i.className;
  if (c === "Sky") return "sky";
  if (c === "Sound" || c === "SoundGroup") return "sound";
  if (/Effect$|^Atmosphere$|^Clouds$/.test(c)) return "lighting";
  if (/Gui$|^Frame$|^ImageLabel$|^TextLabel$|^TextButton$/.test(c)) return "ui";
  if (/Script$/.test(c)) return "script";
  if (desc.some((d) => d.className === "Humanoid")) return "character";
  if (desc.some((d) => /^(ParticleEmitter|Beam|Trail|Fire|Smoke|Sparkles)$/.test(d.className))) return "vfx";
  const parts = desc.filter((d) => isBasePart(d.className));
  if (parts.length === 1 && isBasePart(c)) {
    if (c === "MeshPart" || desc.some((d) => d.className === "SpecialMesh")) return "mesh";
    if (desc.some((d) => d.className === "Texture" || d.className === "SurfaceAppearance")) return "texture";
    if (desc.some((d) => d.className === "Decal")) return "decal";
    return "part";
  }
  if (c === "Model" || parts.length > 1) return "model";
  return "other";
}

function thumbAssetOf(i: RInst, desc: RInst[]): string | null {
  // the biggest mesh, else a texture/decal/sky/particle texture
  let best: string | null = null, bv = -1;
  for (const d of desc) {
    const mesh = assetIdOf(strProp(d, "MeshId"));
    if (mesh) { const s = sz(d) ?? (d.parent ? sz(d.parent) : null) ?? [1, 1, 1]; const v = s[0] * s[1] * s[2]; if (v > bv) { bv = v; best = mesh; } }
  }
  if (best) return best;
  for (const d of desc) {
    const id = assetIdOf(strProp(d, "ColorMap")) ?? assetIdOf(strProp(d, "Texture")) ?? assetIdOf(strProp(d, "SkyboxFt")) ?? assetIdOf(strProp(d, "Image")) ?? assetIdOf(strProp(d, "ShirtTemplate"));
    if (id) return id;
  }
  void i;
  return null;
}

function tagsOf(it: PackItem, category: string): string[] {
  const t = new Set<string>([it.kind]);
  for (const w of category.split(/[/\s_]+/)) if (w.length > 2) t.add(w.toLowerCase());
  for (const w of it.name.split("_")) if (w.length > 2) t.add(w.toLowerCase());
  if (it.unions) t.add("union");
  if (it.scripts) t.add("scripted");
  return [...t].slice(0, 12);
}

export function buildPack(bytes: Uint8Array, cfg: PackConfig, names: AssetNames = {}): BuiltPack {
  return new PackBuilder(parseRbxm(bytes), cfg, names).build();
}
