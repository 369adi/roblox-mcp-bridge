/**
 * Brickwire 2.0 systems: VFX Builder presets, NPC Builder, Map generators, Game Design toolkit.
 * Pure TS (deterministic, testable). Studio side is done by bridge/src/studio2-tools-b.ts.
 */

// ---------------------------------------------------------------- shared
export function rng(seed: number) {
  let s = (Math.floor(seed) >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
const hex = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  if (!m) throw new Error(`bad color "${h}" (use #rrggbb)`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const E = (en: string, value: string) => ({ $type: "Enum", enum: en, value });
const NS = (kps: Array<[number, number, number?]>) => ({ $type: "NumberSequence", value: kps });
const CS = (kps: Array<[number, string]>) => ({ $type: "ColorSequence", value: kps.map(([t, c]) => [t, ...hex(c)]) });
const NR = (a: number, b: number) => ({ $type: "NumberRange", value: [a, b] });

export interface TreeNode { className: string; name?: string; properties?: Record<string, unknown>; attributes?: Record<string, unknown>; source?: string; children?: TreeNode[] }

// ---------------------------------------------------------------- VFX Builder
export interface VfxOpts { color?: string; color2?: string; scale?: number; intensity?: number; name?: string }
interface VfxPreset { id: string; description: string; burst?: number; build(o: Required<Omit<VfxOpts, "name">>): TreeNode[] }

const emitter = (name: string, p: Record<string, unknown>): TreeNode => ({ className: "ParticleEmitter", name, properties: { LightEmission: 0.5, ...p } });

export const VFX_PRESETS: VfxPreset[] = [
  { id: "fire", description: "Looping fire with embers and warm light", build: (o) => [
    emitter("Flames", { Texture: "rbxasset://textures/particles/fire_main.dds", Color: CS([[0, "#ffffff"], [0.3, o.color], [1, o.color2]]), Size: NS([[0, 1.2 * o.scale], [1, 0.2 * o.scale]]), Transparency: NS([[0, 0.3], [1, 1]]), Lifetime: NR(0.6, 1), Rate: 40 * o.intensity, Speed: NR(2 * o.scale, 4 * o.scale), SpreadAngle: [10, 10], LightEmission: 1, RotSpeed: NR(-60, 60), Rotation: NR(0, 360) }),
    emitter("Embers", { Texture: "rbxasset://textures/particles/sparkles_main.dds", Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 0.15 * o.scale], [1, 0]]), Lifetime: NR(1, 2), Rate: 10 * o.intensity, Speed: NR(3, 6), SpreadAngle: [25, 25], Acceleration: [0, 2, 0], LightEmission: 1 }),
    { className: "PointLight", name: "Glow", properties: { Color: o.color, Brightness: 2 * o.intensity, Range: 10 * o.scale, Shadows: false } },
  ] },
  { id: "smoke", description: "Soft rising smoke", build: (o) => [
    emitter("Smoke", { Texture: "rbxasset://textures/particles/smoke_main.dds", Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 1 * o.scale], [1, 4 * o.scale]]), Transparency: NS([[0, 0.6], [0.2, 0.5], [1, 1]]), Lifetime: NR(3, 5), Rate: 8 * o.intensity, Speed: NR(1, 2), SpreadAngle: [15, 15], LightEmission: 0, RotSpeed: NR(-20, 20), Rotation: NR(0, 360), Drag: 1 }),
  ] },
  { id: "sparkles", description: "Magical sparkles around an object", build: (o) => [
    emitter("Sparkles", { Texture: "rbxasset://textures/particles/sparkles_main.dds", Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 0], [0.3, 0.3 * o.scale], [1, 0]]), Lifetime: NR(0.8, 1.5), Rate: 15 * o.intensity, Speed: NR(0.5, 1.5), SpreadAngle: [180, 180], LightEmission: 1, Shape: E("ParticleEmitterShape", "Sphere") }),
  ] },
  { id: "explosion", description: "One-shot explosion (flash, fireball, smoke, debris). Use vfx_emit to play.", burst: 1, build: (o) => [
    emitter("Flash", { Enabled: false, Texture: "rbxasset://textures/particles/sparkles_main.dds", Color: CS([[0, "#ffffff"], [1, o.color]]), Size: NS([[0, 2 * o.scale], [1, 8 * o.scale]]), Transparency: NS([[0, 0], [1, 1]]), Lifetime: NR(0.15, 0.2), Rate: 0, Speed: NR(0, 0), LightEmission: 1, Attributes_emit: 1 }),
    emitter("Fireball", { Enabled: false, Texture: "rbxasset://textures/particles/fire_main.dds", Color: CS([[0, "#ffffff"], [0.25, o.color], [1, o.color2]]), Size: NS([[0, 2 * o.scale], [1, 5 * o.scale]]), Transparency: NS([[0, 0], [1, 1]]), Lifetime: NR(0.4, 0.7), Rate: 0, Speed: NR(6 * o.scale, 14 * o.scale), SpreadAngle: [180, 180], Drag: 4, LightEmission: 1 }),
    emitter("Smoke", { Enabled: false, Texture: "rbxasset://textures/particles/smoke_main.dds", Color: CS([[0, "#555555"], [1, "#222222"]]), Size: NS([[0, 3 * o.scale], [1, 7 * o.scale]]), Transparency: NS([[0, 0.3], [1, 1]]), Lifetime: NR(1.5, 2.5), Rate: 0, Speed: NR(4, 8), SpreadAngle: [180, 180], Drag: 2, LightEmission: 0 }),
    emitter("Debris", { Enabled: false, Color: CS([[0, o.color2], [1, "#333333"]]), Size: NS([[0, 0.3 * o.scale], [1, 0.2 * o.scale]]), Lifetime: NR(0.8, 1.4), Rate: 0, Speed: NR(20, 35), SpreadAngle: [70, 70], Acceleration: [0, -60, 0], LightEmission: 0, RotSpeed: NR(-300, 300) }),
  ] },
  { id: "hit_impact", description: "Short hit spark burst (combat). Use vfx_emit.", burst: 1, build: (o) => [
    emitter("Spark", { Enabled: false, Texture: "rbxasset://textures/particles/sparkles_main.dds", Color: CS([[0, "#ffffff"], [1, o.color]]), Size: NS([[0, 0.6 * o.scale], [1, 0]]), Lifetime: NR(0.15, 0.3), Rate: 0, Speed: NR(15, 30), SpreadAngle: [180, 180], Drag: 8, LightEmission: 1, Orientation: E("ParticleOrientation", "VelocityParallel"), Squash: NS([[0, 2], [1, 0]]) }),
    emitter("Ring", { Enabled: false, Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 0.5 * o.scale], [1, 4 * o.scale]]), Transparency: NS([[0, 0.2], [1, 1]]), Lifetime: NR(0.2, 0.2), Rate: 0, Speed: NR(0, 0), LightEmission: 1 }),
  ] },
  { id: "aura", description: "Rising character/item aura", build: (o) => [
    emitter("Aura", { Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 0.8 * o.scale], [1, 0]]), Transparency: NS([[0, 0.4], [1, 1]]), Lifetime: NR(0.8, 1.2), Rate: 25 * o.intensity, Speed: NR(2, 4), SpreadAngle: [5, 5], Shape: E("ParticleEmitterShape", "Cylinder"), ShapeStyle: E("ParticleEmitterShapeStyle", "Surface"), LightEmission: 1, Acceleration: [0, 3, 0] }),
    { className: "PointLight", name: "AuraLight", properties: { Color: o.color, Brightness: 1 * o.intensity, Range: 8 * o.scale, Shadows: false } },
  ] },
  { id: "heal", description: "Green rising heal particles", build: (o) => [
    emitter("Heal", { Texture: "rbxasset://textures/particles/sparkles_main.dds", Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 0.5 * o.scale], [1, 0]]), Lifetime: NR(1, 1.6), Rate: 20 * o.intensity, Speed: NR(2, 3), SpreadAngle: [20, 20], Shape: E("ParticleEmitterShape", "Disc"), LightEmission: 1 }),
  ] },
  { id: "rain", description: "Area rain (attach to a big transparent part above the map)", build: (o) => [
    emitter("Rain", { Color: CS([[0, o.color], [1, o.color]]), Size: NS([[0, 0.1 * o.scale], [1, 0.1 * o.scale]]), Transparency: NS([[0, 0.4], [1, 0.4]]), Lifetime: NR(1.5, 1.5), Rate: 400 * o.intensity, Speed: NR(60, 70), EmissionDirection: E("NormalId", "Bottom"), Orientation: E("ParticleOrientation", "VelocityParallel"), Squash: NS([[0, 6], [1, 6]]), LightEmission: 0, Shape: E("ParticleEmitterShape", "Box") }),
  ] },
  { id: "portal", description: "Swirling portal", build: (o) => [
    emitter("Swirl", { Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 1.5 * o.scale], [1, 0]]), Transparency: NS([[0, 0.2], [1, 1]]), Lifetime: NR(1, 1.5), Rate: 40 * o.intensity, Speed: NR(0, 0), RotSpeed: NR(120, 200), Rotation: NR(0, 360), Shape: E("ParticleEmitterShape", "Disc"), ShapeStyle: E("ParticleEmitterShapeStyle", "Surface"), LightEmission: 1, LockedToPart: true }),
    { className: "PointLight", name: "PortalLight", properties: { Color: o.color, Brightness: 3 * o.intensity, Range: 12 * o.scale, Shadows: false } },
  ] },
  { id: "dust", description: "Ambient floating dust motes", build: (o) => [
    emitter("Dust", { Color: CS([[0, o.color], [1, o.color2]]), Size: NS([[0, 0], [0.5, 0.08 * o.scale], [1, 0]]), Lifetime: NR(4, 7), Rate: 6 * o.intensity, Speed: NR(0.1, 0.4), SpreadAngle: [180, 180], Shape: E("ParticleEmitterShape", "Box"), LightEmission: 0.3 }),
  ] },
];
const VFX_DEFAULT_COLORS: Record<string, [string, string]> = {
  fire: ["#ff8c1a", "#b81d00"], smoke: ["#bbbbbb", "#555555"], sparkles: ["#fff2a8", "#ffd84d"], explosion: ["#ff9b2e", "#7a1a00"],
  hit_impact: ["#ffe9a8", "#ff7b00"], aura: ["#7cc4ff", "#2a5cff"], heal: ["#7dff9a", "#1ec95b"], rain: ["#a8c8ff", "#a8c8ff"], portal: ["#b46bff", "#3b1aff"], dust: ["#fff4dd", "#d9c7a3"],
};

export function buildVfx(id: string, o: VfxOpts = {}): { node: TreeNode; burst: boolean } {
  const p = VFX_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown vfx preset "${id}" — ${VFX_PRESETS.map((x) => x.id).join(", ")}`);
  const [c1, c2] = VFX_DEFAULT_COLORS[id];
  const opts = { color: o.color ?? c1, color2: o.color2 ?? o.color ?? c2, scale: clampN(o.scale ?? 1, 0.1, 10), intensity: clampN(o.intensity ?? 1, 0.1, 5) };
  hex(opts.color); hex(opts.color2);
  const children = p.build(opts).map((n) => {
    const props = { ...(n.properties ?? {}) };
    delete props.Attributes_emit;
    if (props.Acceleration) props.Acceleration = { $type: "Vector3", value: props.Acceleration };
    if (props.SpreadAngle) props.SpreadAngle = { $type: "Vector2", value: props.SpreadAngle };
    if (typeof props.Color === "string") props.Color = { $type: "Color3", value: props.Color };
    return { ...n, properties: props };
  });
  return {
    node: { className: "Attachment", name: o.name ?? `BW_VFX_${id}`, attributes: { BrickwireVFX: id, BrickwireBurst: !!p.burst }, children },
    burst: !!p.burst,
  };
}
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number(v) || a));

// ---------------------------------------------------------------- NPC Builder
export const NPC_BEHAVIORS = ["idle", "wander", "patrol", "follow", "chase", "guard", "shopkeeper"] as const;
export type NpcBehavior = (typeof NPC_BEHAVIORS)[number];
export interface NpcSpec {
  name: string; rig?: "R6" | "R15"; position?: [number, number, number]; behavior?: NpcBehavior;
  walkSpeed?: number; health?: number; damage?: number; range?: number; dialog?: string[];
  patrolPoints?: Array<[number, number, number]>; bodyColor?: string; shirtColor?: string; pantsColor?: string; displayName?: string;
}
export function npcAttributes(s: NpcSpec) {
  if (!s.name || !/^[\w ]{1,40}$/.test(s.name)) throw new Error("npc name: 1-40 letters/digits/spaces");
  const behavior = s.behavior ?? "idle";
  if (!NPC_BEHAVIORS.includes(behavior)) throw new Error(`behavior must be one of ${NPC_BEHAVIORS.join(", ")}`);
  if (behavior === "patrol" && !(s.patrolPoints && s.patrolPoints.length >= 2)) throw new Error("patrol needs patrolPoints (≥ 2)");
  for (const c of [s.bodyColor, s.shirtColor, s.pantsColor]) if (c) hex(c);
  return {
    BW_Behavior: behavior,
    BW_WalkSpeed: clampN(s.walkSpeed ?? (behavior === "chase" ? 18 : 10), 1, 60),
    BW_Damage: clampN(s.damage ?? (behavior === "chase" || behavior === "guard" ? 10 : 0), 0, 1000),
    BW_Range: clampN(s.range ?? 40, 5, 300),
    BW_Dialog: JSON.stringify(s.dialog ?? (behavior === "shopkeeper" ? ["Welcome! Take a look at my goods."] : [])),
    BW_Patrol: JSON.stringify(s.patrolPoints ?? []),
  };
}

export const NPC_BRAIN_SOURCE = `-- Brickwire NPC brain (config = attributes on the NPC model)
local PFS = game:GetService("PathfindingService")
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local npc = script.Parent
local hum = npc:WaitForChild("Humanoid")
local root = npc:WaitForChild("HumanoidRootPart")
local function A(k, d) local v = npc:GetAttribute(k) if v == nil then return d end return v end
local home = root.Position
root:SetNetworkOwner(nil)
-- dialog (ProximityPrompt + bubble)
local lines = {}
pcall(function() lines = HttpService:JSONDecode(A("BW_Dialog", "[]")) end)
if #lines > 0 then
	local prompt = Instance.new("ProximityPrompt")
	prompt.ActionText = "Talk"
	prompt.ObjectText = npc.Name
	prompt.Parent = root
	local gui = Instance.new("BillboardGui")
	gui.Size = UDim2.fromOffset(240, 60)
	gui.StudsOffset = Vector3.new(0, 3.5, 0)
	gui.MaxDistance = 40
	gui.Enabled = false
	gui.Parent = root
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = Color3.fromRGB(20, 20, 26)
	label.BackgroundTransparency = 0.15
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextWrapped = true
	label.TextScaled = true
	label.Font = Enum.Font.GothamMedium
	label.Parent = gui
	Instance.new("UICorner", label).CornerRadius = UDim.new(0, 10)
	local i, token = 0, 0
	prompt.Triggered:Connect(function(player)
		i = i % #lines + 1
		label.Text = lines[i]
		gui.Enabled = true
		token += 1
		local my = token
		local look = player.Character and player.Character:FindFirstChild("HumanoidRootPart")
		if look and A("BW_Behavior", "idle") ~= "chase" then root.CFrame = CFrame.lookAt(root.Position, Vector3.new(look.Position.X, root.Position.Y, look.Position.Z)) end
		task.delay(4, function() if token == my then gui.Enabled = false end end)
	end)
end
local function nearestPlayer(range)
	local best, bd = nil, range
	for _, p in ipairs(Players:GetPlayers()) do
		local h = p.Character and p.Character:FindFirstChildOfClass("Humanoid")
		local r = p.Character and p.Character:FindFirstChild("HumanoidRootPart")
		if h and r and h.Health > 0 then
			local d = (r.Position - root.Position).Magnitude
			if d < bd then best, bd = p.Character, d end
		end
	end
	return best, bd
end
local function walkTo(pos, maxTime)
	local path = PFS:CreatePath({ AgentRadius = 2, AgentHeight = 5, AgentCanJump = true })
	local ok = pcall(function() path:ComputeAsync(root.Position, pos) end)
	if ok and path.Status == Enum.PathStatus.Success then
		local t0 = os.clock()
		for _, wp in ipairs(path:GetWaypoints()) do
			if hum.Health <= 0 or os.clock() - t0 > (maxTime or 8) then return end
			if wp.Action == Enum.PathWaypointAction.Jump then hum.Jump = true end
			hum:MoveTo(wp.Position)
			hum.MoveToFinished:Wait()
		end
	else
		hum:MoveTo(pos)
		hum.MoveToFinished:Wait()
	end
end
local lastHit = 0
local function attack(target)
	local dmg = A("BW_Damage", 0)
	if dmg <= 0 or os.clock() - lastHit < 1 then return end
	local r = target:FindFirstChild("HumanoidRootPart")
	local h = target:FindFirstChildOfClass("Humanoid")
	if r and h and (r.Position - root.Position).Magnitude < 5 then
		lastHit = os.clock()
		h:TakeDamage(dmg)
	end
end
local patrol = {}
pcall(function() for _, p in ipairs(HttpService:JSONDecode(A("BW_Patrol", "[]"))) do table.insert(patrol, Vector3.new(p[1], p[2], p[3])) end end)
local pi = 1
while hum.Health > 0 do
	hum.WalkSpeed = A("BW_WalkSpeed", 10)
	local b = A("BW_Behavior", "idle")
	local range = A("BW_Range", 40)
	if b == "wander" then
		walkTo(home + Vector3.new(math.random(-range, range) / 2, 0, math.random(-range, range) / 2), 6)
		task.wait(math.random(2, 5))
	elseif b == "patrol" and #patrol > 0 then
		walkTo(patrol[pi], 10)
		pi = pi % #patrol + 1
		task.wait(1)
	elseif b == "follow" or b == "chase" or b == "guard" then
		local target, d = nearestPlayer(range)
		if target and (b ~= "guard" or (target.HumanoidRootPart.Position - home).Magnitude < range) then
			if b == "follow" and d < 6 then task.wait(0.3) else hum:MoveTo(target.HumanoidRootPart.Position) end
			if b ~= "follow" then attack(target) end
			task.wait(0.2)
		else
			if (root.Position - home).Magnitude > 4 then walkTo(home, 8) end
			task.wait(0.5)
		end
	else
		task.wait(1)
	end
end
`;

// ---------------------------------------------------------------- Map generators
export const MAP_TYPES = ["obby", "arena", "maze", "city", "island"] as const;
export type MapType = (typeof MAP_TYPES)[number];
/** Compact part row: [x,y,z, sx,sy,sz, rotY, color, material, name, flags] flags: k=kill, c=checkpoint, s=spawn */
export type PartRow = [number, number, number, number, number, number, number, string, string, string, string];
export interface MapPlan { type: MapType; seed: number; parts: PartRow[]; terrain?: { size: number; height: number; water: number; seed: number }; notes: string[] }

const r1 = (n: number) => Math.round(n * 100) / 100;
export function generateMap(type: MapType, opts: { seed?: number; size?: number; difficulty?: number; theme?: string } = {}): MapPlan {
  if (!MAP_TYPES.includes(type)) throw new Error(`map type must be ${MAP_TYPES.join(", ")}`);
  const seed = opts.seed ?? 1;
  const R = rng(seed);
  const size = clampN(opts.size ?? 1, 0.25, 4);
  const diff = clampN(opts.difficulty ?? 0.5, 0, 1);
  const parts: PartRow[] = [];
  const notes: string[] = [];
  const P = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, mat = "SmoothPlastic", name = "Part", flags = "", rot = 0) =>
    parts.push([r1(x), r1(y), r1(z), r1(sx), r1(sy), r1(sz), r1(rot), color, mat, name, flags]);
  if (type === "obby") {
    const stages = Math.round(10 + 20 * size);
    P(0, 0, 0, 16, 1, 16, "#4ade80", "SmoothPlastic", "Start", "s");
    let x = 0, y = 0, z = 0;
    const palette = ["#60a5fa", "#f472b6", "#facc15", "#a78bfa", "#34d399", "#fb923c"];
    for (let i = 1; i <= stages; i++) {
      const kind = Math.floor(R() * 5);
      const gap = 6 + diff * 6 + R() * 2;
      z += gap + 4;
      x += (R() - 0.5) * 8 * diff;
      y += (R() - 0.3) * 3 * diff;
      const col = palette[i % palette.length];
      if (kind === 0) P(x, y, z, 6 - diff * 3, 1, 6 - diff * 3, col, "SmoothPlastic", `Jump${i}`);
      else if (kind === 1) { P(x, y, z, 2 + (1 - diff) * 2, 1, 14, col, "SmoothPlastic", `Beam${i}`); z += 5; }
      else if (kind === 2) { P(x, y - 0.4, z, 10, 0.2, 10, "#ef4444", "Neon", `Lava${i}`, "k"); P(x - 3, y, z, 2.5, 1, 2.5, col, "SmoothPlastic", `Step${i}a`); P(x + 3, y, z + 3, 2.5, 1, 2.5, col, "SmoothPlastic", `Step${i}b`); z += 3; }
      else if (kind === 3) { P(x, y + 2, z, 1, 6, 1, col, "SmoothPlastic", `Pole${i}`); P(x, y, z, 5, 1, 5, col, "SmoothPlastic", `Pad${i}`); }
      else { P(x, y, z, 8, 1, 4, col, "SmoothPlastic", `Wide${i}`, "", (R() - 0.5) * 50); }
      if (i % 5 === 0) { z += 8; P(x, y, z, 8, 1, 8, "#22d3ee", "SmoothPlastic", `Checkpoint${i / 5}`, "c"); }
    }
    z += 10;
    P(x, y, z, 16, 1, 16, "#fbbf24", "Neon", "Finish", "c");
    notes.push(`${stages} stages; checkpoints every 5; red Neon = kill (tagged BW_Kill — install mechanic kill_brick + checkpoints)`);
  } else if (type === "arena") {
    const r = 60 * size;
    P(0, 0, 0, r * 2, 2, r * 2, "#3f3f46", "Concrete", "Floor");
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      P(Math.cos(a) * r, 8, Math.sin(a) * r, i % 2 ? 2 : r * 2, 14, i % 2 ? r * 2 : 2, "#52525b", "Brick", `Wall${i + 1}`);
    }
    const cover = Math.round(8 + 12 * size);
    for (let i = 0; i < cover; i++) {
      const x = (R() - 0.5) * r * 1.6, z = (R() - 0.5) * r * 1.6;
      if (Math.hypot(x, z) < 10) continue;
      const h = 3 + R() * 5;
      P(x, 1 + h / 2, z, 4 + R() * 6, h, 2 + R() * 3, "#71717a", "Slate", `Cover${i + 1}`, "", R() * 180);
    }
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; P(Math.cos(a) * r * 0.8, 1.5, Math.sin(a) * r * 0.8, 6, 1, 6, "#38bdf8", "Neon", `Spawn${i + 1}`, "s"); }
    P(0, 1.6, 0, 8, 1, 8, "#facc15", "Neon", "Center");
    notes.push("Spawn pads are put into Workspace.BW_Arena when using with mechanic round_system (folder name = map name).");
  } else if (type === "maze") {
    const n = Math.round(8 + 8 * size) | 1, cell = 10;
    const wall: boolean[][] = Array.from({ length: n * 2 + 1 }, () => Array(n * 2 + 1).fill(true));
    const stack: Array<[number, number]> = [[0, 0]];
    const seen = new Set(["0,0"]);
    wall[1][1] = false;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const nb = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]).filter(([x, y]) => x >= 0 && y >= 0 && x < n && y < n && !seen.has(`${x},${y}`));
      if (!nb.length) { stack.pop(); continue; }
      const [nx, ny] = nb[Math.floor(R() * nb.length)];
      wall[cx + nx + 1][cy + ny + 1] = false;
      wall[nx * 2 + 1][ny * 2 + 1] = false;
      seen.add(`${nx},${ny}`);
      stack.push([nx, ny]);
    }
    wall[1][0] = false; wall[n * 2 - 1][n * 2] = false;
    const half = (n * 2 + 1) * cell / 4;
    P(0, -0.5, 0, (n * 2 + 1) * cell / 2, 1, (n * 2 + 1) * cell / 2, "#57534e", "Grass", "Floor");
    let w = 0;
    for (let i = 0; i < n * 2 + 1; i++) {
      let run = -1;
      for (let j = 0; j <= n * 2 + 1; j++) {
        const solid = j <= n * 2 && wall[i][j];
        if (solid && run < 0) run = j;
        if (!solid && run >= 0) {
          const len = j - run;
          P(i * cell / 2 - half + cell / 4, 4, (run + len / 2) * cell / 2 - half, cell / 2, 8, len * cell / 2, "#78716c", "Cobblestone", `Wall${++w}`);
          run = -1;
        }
      }
    }
    P(cell / 2 - half + cell / 4, 0.1, -half - 4, 6, 0.2, 6, "#4ade80", "Neon", "Entrance", "s");
    P((n * 2 - 1) * cell / 2 - half + cell / 4, 0.1, half + 4, 6, 0.2, 6, "#fbbf24", "Neon", "Exit", "c");
    notes.push(`${n}x${n} maze, walls merged into ${w} parts`);
  } else if (type === "city") {
    const blocks = Math.round(4 + 4 * size), bs = 60, road = 16;
    const span = blocks * (bs + road);
    P(0, -0.5, 0, span + road, 1, span + road, "#27272a", "Asphalt", "Ground");
    const pal = ["#a1a1aa", "#d4d4d8", "#93c5fd", "#fde68a", "#fca5a5", "#c4b5fd"];
    let b = 0;
    for (let i = 0; i < blocks; i++) for (let j = 0; j < blocks; j++) {
      const cx = -span / 2 + road + i * (bs + road) + bs / 2, cz = -span / 2 + road + j * (bs + road) + bs / 2;
      P(cx, 0.25, cz, bs, 0.5, bs, "#9ca3af", "Concrete", `Sidewalk${i}_${j}`);
      if (R() < 0.15) { P(cx, 0.6, cz, bs - 6, 0.2, bs - 6, "#4d7c0f", "Grass", `Park${i}_${j}`); continue; }
      const lots = 2;
      for (let a = 0; a < lots; a++) for (let c = 0; c < lots; c++) {
        const h = 15 + R() * (40 + 80 * size * (1 - Math.hypot(cx, cz) / span));
        const w2 = bs / lots - 6;
        P(cx - bs / 4 + a * bs / 2, h / 2 + 0.5, cz - bs / 4 + c * bs / 2, w2, h, w2, pal[Math.floor(R() * pal.length)], R() < 0.5 ? "Glass" : "Concrete", `Building${++b}`);
      }
    }
    P(0, 1, 0, 8, 1, 8, "#38bdf8", "Neon", "Spawn", "s");
    notes.push(`${blocks}x${blocks} blocks, ${b} buildings, taller downtown`);
  } else {
    notes.push("Island uses Terrain (FillBlock columns from math.noise) — can be undone with Ctrl+Z");
    P(0, 30, 0, 8, 1, 8, "#fbbf24", "WoodPlanks", "Spawn", "s");
    return { type, seed, parts, terrain: { size: Math.round(256 * size), height: 40, water: 6, seed }, notes };
  }
  return { type, seed, parts, notes };
}

// ---------------------------------------------------------------- Game Design toolkit
export const GENRES = ["simulator", "obby", "tycoon", "pvp_arena", "horror", "rpg", "tower_defense", "roleplay"] as const;
export type Genre = (typeof GENRES)[number];
const GD: Record<Genre, { loop: string[]; mechanics: string[]; maps: MapType[]; retention: string[]; monetization: string[]; risks: string[] }> = {
  simulator: { loop: ["Click/collect resource", "Sell for coins", "Buy better tool/backpack", "Unlock new zone", "Rebirth for multiplier"], mechanics: ["leaderstats", "coin_pickup", "shop", "sprint"], maps: ["island", "city"], retention: ["Daily rewards", "Rebirth multipliers", "Pets with rarities", "Zone gates every 10–15 min of play"], monetization: ["2x Coins gamepass", "Auto-collect gamepass", "Egg/pet bundles (Robux)", "Extra pet slots"], risks: ["Numbers inflation — use suffix formatting", "Exploitable remotes — validate on server"] },
  obby: { loop: ["Clear stage", "Reach checkpoint", "Earn coins/time", "Buy trails/skips"], mechanics: ["leaderstats", "checkpoints", "kill_brick", "double_jump"], maps: ["obby"], retention: ["Stage counter on leaderboard", "Hard-mode paths", "Weekly new stages"], monetization: ["Skip stage (dev product)", "Speed/gravity coils", "Trails"], risks: ["Difficulty spikes — test every 10 stages", "Fall-through gaps — kill plane"] },
  tycoon: { loop: ["Dropper produces cash", "Collect", "Buy buttons (droppers/walls/upgrades)", "Expand base", "Rebirth"], mechanics: ["leaderstats", "shop", "doors"], maps: ["city"], retention: ["Visible base growth", "Offline earnings", "Rebirth"], monetization: ["2x cash", "Auto-collect", "VIP area"], risks: ["Plot ownership bugs", "Saving purchased buttons — DataStore"] },
  pvp_arena: { loop: ["Join round", "Fight", "Win/earn", "Upgrade weapon/cosmetic"], mechanics: ["leaderstats", "round_system", "kill_brick", "sprint", "shop"], maps: ["arena", "maze"], retention: ["Win streaks", "Ranked leaderboard", "Kill effects"], monetization: ["Weapon skins", "Kill effects", "Battle pass"], risks: ["Server-side hit validation", "Spawn camping — spawn shield"] },
  horror: { loop: ["Explore dark map", "Find key items", "Avoid monster", "Escape"], mechanics: ["doors", "day_night", "sprint", "round_system"], maps: ["maze"], retention: ["Multiple endings", "Monster variants", "Co-op"], monetization: ["Revive", "Flashlight skins", "Private servers"], risks: ["Too dark on mobile — test brightness", "AI pathfinding stuck — waypoints"] },
  rpg: { loop: ["Take quest", "Fight mobs", "Loot/XP", "Level up", "Better gear", "Harder zone"], mechanics: ["leaderstats", "shop", "doors", "day_night"], maps: ["island", "city"], retention: ["Quest chains", "Rare drops", "Party play"], monetization: ["XP boost", "Cosmetic armor", "Extra inventory"], risks: ["Content cost — reuse mobs with variants", "Balance — use the economy curve"] },
  tower_defense: { loop: ["Place towers", "Survive wave", "Earn cash", "Upgrade/place more", "Unlock towers"], mechanics: ["leaderstats", "round_system", "shop"], maps: ["arena"], retention: ["New towers", "Hard modes", "Events"], monetization: ["Premium towers", "2x speed", "Crates"], risks: ["Too many NPCs — pool & simplify", "Pay-to-win perception"] },
  roleplay: { loop: ["Choose role/house", "Customize", "Socialize/jobs", "Earn money", "Buy items"], mechanics: ["leaderstats", "shop", "doors", "day_night", "sprint"], maps: ["city"], retention: ["Housing", "Vehicles", "Seasonal updates"], monetization: ["Premium houses", "Vehicles", "Cosmetics"], risks: ["Moderation of chat/names", "Physics from vehicles"] },
};

/** Economy curve: cost(n) = base * growth^n (rounded nicely); income should keep time-to-next ~ targetMinutes. */
export function economyCurve(o: { base?: number; growth?: number; levels?: number; incomeBase?: number; incomeGrowth?: number }) {
  const base = o.base ?? 10, growth = o.growth ?? 1.15, levels = Math.min(200, Math.max(1, o.levels ?? 30));
  const ib = o.incomeBase ?? 1, ig = o.incomeGrowth ?? 1.1;
  const nice = (v: number) => { if (v < 100) return Math.round(v); const p = 10 ** (Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
  const rows = Array.from({ length: levels }, (_, n) => {
    const cost = nice(base * growth ** n), income = ib * ig ** n;
    return { level: n + 1, cost, incomePerSec: Math.round(income * 100) / 100, secondsToAfford: Math.round(cost / income) };
  });
  const warn: string[] = [];
  if (growth <= ig) warn.push("cost growth ≤ income growth — progression gets faster and faster (no long-term goal)");
  if (rows[rows.length - 1].secondsToAfford > 3600) warn.push("late levels need > 1h — add rebirth/multipliers");
  return { rows, warnings: warn };
}

export function designGame(o: { genre: Genre; name?: string; audience?: string; sessionMinutes?: number }) {
  if (!GENRES.includes(o.genre)) throw new Error(`genre must be ${GENRES.join(", ")}`);
  const g = GD[o.genre];
  const s = o.sessionMinutes ?? 15;
  return {
    name: o.name ?? `My ${o.genre.replace("_", " ")}`,
    genre: o.genre,
    audience: o.audience ?? "9–16, mobile-first",
    coreLoop: g.loop,
    firstSession: [`0–1 min: instant action, tutorial by doing (arrow/beam to the first goal)`, `1–5 min: first upgrade/unlock`, `5–${s} min: first big goal (new zone/round win/rebirth tease)`],
    mechanics: g.mechanics,
    suggestedMaps: g.maps,
    retention: g.retention,
    monetization: g.monetization,
    risks: g.risks,
    economy: economyCurve({ levels: 20 }).rows.slice(0, 10),
    buildPlan: [
      ...g.maps.slice(0, 1).map((m) => `map_generate {type:"${m}"}`),
      ...g.mechanics.map((m) => `mechanic_install {id:"${m}"}`),
      "ui_build HUD (stats, buttons) → ui_components",
      "project_analyze + test_run before publishing",
    ],
  };
}
