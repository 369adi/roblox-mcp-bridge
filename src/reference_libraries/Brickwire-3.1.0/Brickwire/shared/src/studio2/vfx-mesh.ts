/**
 * M7: layered Mesh VFX presets built ONLY from meshes of the bundled vfx pack (packs/built/vfx.json, ids "vfx/...").
 * Install: templates go to ReplicatedStorage.BW_VFX/<preset> (built via BW.asset with literal ids so the bridge
 * injects the pack data), plus a ModuleScript ReplicatedStorage.BW_VFX.VFX with VFX.play(name, cframe, opts)
 * and VFX.bindMarkers(track) (AnimationTrack KeyframeMarker "vfx:<preset>" → effect).
 * Perf budget (documented in docs/VFX.md): ≤ 4 mesh layers per preset, ≤ 1.2 s lifetime, no particles, CanCollide/
 * CanQuery/CanTouch off, CastShadow off, max 24 live effect parts per client (oldest destroyed first).
 */
export interface VfxLayer { id: string; color: [number, number, number]; from: number; to: number; t: number; delay?: number; spin?: number; material?: "Neon" | "ForceField"; fade?: [number, number]; rise?: number }
export interface MeshVfxPreset { id: string; label: string; layers: VfxLayer[] }

export const VFX_BUDGET = { maxLayers: 4, maxLifetime: 1.2, maxLiveParts: 24 };

export const MESH_VFX_PRESETS: MeshVfxPreset[] = [
  { id: "ground_slam", label: "Ground slam", layers: [
    { id: "vfx/ground_smash_crown_8", color: [200, 170, 120], from: 0.6, to: 2.2, t: 0.45, material: "Neon", fade: [0.1, 1] },
    { id: "vfx/thin_shockwave_ring", color: [255, 255, 255], from: 0.5, to: 4, t: 0.35, fade: [0, 1] },
    { id: "vfx/rock_chunk", color: [120, 100, 80], from: 1, to: 1.4, t: 0.6, rise: 3, spin: 180, fade: [0, 1] } ] },
  { id: "fire_burst", label: "Fire burst", layers: [
    { id: "vfx/fire_ball_b", color: [255, 120, 30], from: 0.4, to: 2, t: 0.4, material: "Neon", fade: [0, 1] },
    { id: "vfx/swirl_shockwave_fire", color: [255, 200, 60], from: 0.5, to: 3, t: 0.5, spin: 120, fade: [0.2, 1] },
    { id: "vfx/lumpy_explosion_cloud", color: [70, 50, 40], from: 0.8, to: 2.6, t: 0.9, delay: 0.1, rise: 2, fade: [0.3, 1] } ] },
  { id: "thunder_strike", label: "Thunder strike", layers: [
    { id: "vfx/thunder_bolt", color: [170, 220, 255], from: 1, to: 1.2, t: 0.25, material: "Neon", fade: [0, 1] },
    { id: "vfx/thunder_spark", color: [255, 255, 255], from: 0.5, to: 2, t: 0.3, material: "Neon", fade: [0, 1] },
    { id: "vfx/electric_rough_shockwave", color: [120, 180, 255], from: 0.5, to: 3.5, t: 0.4, fade: [0.1, 1] } ] },
  { id: "sword_slash", label: "Sword slash", layers: [
    { id: "vfx/fancy_slash", color: [255, 255, 255], from: 0.9, to: 1.3, t: 0.25, spin: 90, material: "Neon", fade: [0, 1] },
    { id: "vfx/crescent_shard_slash", color: [160, 220, 255], from: 0.8, to: 1.5, t: 0.3, spin: 120, fade: [0.2, 1] } ] },
  { id: "wind_dash", label: "Wind dash", layers: [
    { id: "vfx/speed_streaks", color: [230, 245, 255], from: 1, to: 1.6, t: 0.3, fade: [0.2, 1] },
    { id: "vfx/thin_wind_ring", color: [255, 255, 255], from: 0.4, to: 2.4, t: 0.35, fade: [0.1, 1] },
    { id: "vfx/twisted_wind_cylinder", color: [210, 235, 255], from: 0.6, to: 1.4, t: 0.4, spin: 200, fade: [0.3, 1] } ] },
  { id: "energy_charge", label: "Energy charge", layers: [
    { id: "vfx/swirled_energy_sphere", color: [150, 90, 255], from: 2, to: 0.6, t: 0.8, spin: 240, material: "ForceField", fade: [0.6, 0] },
    { id: "vfx/concentric_rings", color: [200, 160, 255], from: 2.5, to: 0.5, t: 0.8, fade: [0.8, 0.2] },
    { id: "vfx/flash_star", color: [255, 255, 255], from: 0.2, to: 1.6, t: 0.2, delay: 0.8, material: "Neon", fade: [0, 1] } ] },
  { id: "heal_pulse", label: "Heal pulse", layers: [
    { id: "vfx/fancy_sphere_light", color: [120, 255, 160], from: 0.6, to: 2, t: 0.6, material: "ForceField", fade: [0.3, 1] },
    { id: "vfx/rising_wind_spiral", color: [180, 255, 200], from: 0.8, to: 1.2, t: 0.9, rise: 4, spin: 180, fade: [0.2, 1] },
    { id: "vfx/thin_circle_ring", color: [220, 255, 230], from: 0.5, to: 3, t: 0.5, fade: [0, 1] } ] },
  { id: "explosion", label: "Explosion", layers: [
    { id: "vfx/spiky_explosion_ball", color: [255, 170, 50], from: 0.4, to: 2.6, t: 0.35, material: "Neon", fade: [0, 1] },
    { id: "vfx/bubbly_explosion_cloud", color: [90, 80, 75], from: 0.8, to: 3, t: 0.9, rise: 2, fade: [0.3, 1] },
    { id: "vfx/circle_shockwave", color: [255, 230, 180], from: 0.5, to: 5, t: 0.4, fade: [0, 1] },
    { id: "vfx/shard_rays_burst", color: [255, 240, 200], from: 0.6, to: 2.2, t: 0.3, material: "Neon", fade: [0, 1] } ] },
  { id: "tornado", label: "Tornado", layers: [
    { id: "vfx/spiral_tornado_cone", color: [220, 230, 240], from: 0.6, to: 1.6, t: 1.1, spin: 720, fade: [0.2, 1] },
    { id: "vfx/wind_gray_vortex", color: [180, 190, 200], from: 0.8, to: 2, t: 1.1, spin: -540, fade: [0.4, 1] },
    { id: "vfx/broken_ground_ring", color: [130, 110, 90], from: 0.6, to: 2.4, t: 0.6, fade: [0.2, 1] } ] },
  { id: "ground_spikes", label: "Ground spikes", layers: [
    { id: "vfx/ground_spike_cluster", color: [150, 140, 130], from: 0.2, to: 1.4, t: 0.25, rise: 1, fade: [0, 0.2] },
    { id: "vfx/jagged_ground_ring", color: [170, 150, 120], from: 0.5, to: 2.2, t: 0.45, fade: [0.2, 1] },
    { id: "vfx/faint_shock_ring", color: [255, 255, 255], from: 0.5, to: 3, t: 0.4, fade: [0.3, 1] } ] },
  { id: "pickup_burst", label: "Pickup burst", layers: [
    { id: "vfx/tmnt_pickup_burst", color: [255, 220, 80], from: 0.4, to: 1.6, t: 0.4, material: "Neon", fade: [0, 1] },
    { id: "vfx/star_4_point", color: [255, 255, 255], from: 0.2, to: 1.2, t: 0.3, spin: 90, material: "Neon", fade: [0, 1] } ] },
  { id: "portal_open", label: "Portal open", layers: [
    { id: "vfx/swirl_disc", color: [120, 80, 255], from: 0.2, to: 2.4, t: 0.6, spin: 360, material: "Neon", fade: [0.1, 0.5] },
    { id: "vfx/tangled_swirl_ring", color: [200, 120, 255], from: 0.3, to: 2.8, t: 0.7, spin: -240, fade: [0.2, 1] },
    { id: "vfx/hexagon_cage_rings", color: [160, 200, 255], from: 1, to: 2, t: 0.8, rise: 1, fade: [0.4, 1] } ] },
];

export function meshVfxIds(): string[] { return [...new Set(MESH_VFX_PRESETS.flatMap((p) => p.layers.map((l) => l.id)))]; }
export function meshVfxPreset(id: string): MeshVfxPreset {
  const p = MESH_VFX_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown mesh VFX preset '${id}' (${MESH_VFX_PRESETS.map((x) => x.id).join(", ")})`);
  return p;
}

/** Runtime module (client or server): plays installed templates. */
export const VFX_RUNTIME_MODULE = String.raw`-- Brickwire Mesh VFX runtime (generated). VFX.play(name, cframe, {scale=1, color=Color3?})
local TweenService = game:GetService("TweenService")
local Debris = game:GetService("Debris")
local root = script.Parent
local VFX = { maxLive = ${VFX_BUDGET.maxLiveParts} }
local live = {}
local function track(p)
  table.insert(live, p)
  while #live > VFX.maxLive do local o = table.remove(live, 1) if o and o.Parent then o:Destroy() end end
end
function VFX.play(name, cf, opts)
  opts = opts or {}
  local tpl = root:FindFirstChild(name)
  if not tpl then warn("[VFX] unknown effect " .. tostring(name)) return nil end
  local scale = opts.scale or 1
  local folder = Instance.new("Folder") folder.Name = "VFX_" .. name folder.Parent = opts.parent or workspace
  for _, layer in ipairs(tpl:GetChildren()) do
    if layer:IsA("BasePart") then
      local p = layer:Clone()
      local from, to, t = p:GetAttribute("From") * scale, p:GetAttribute("To") * scale, p:GetAttribute("T")
      local delay, spin, rise = p:GetAttribute("Delay") or 0, p:GetAttribute("Spin") or 0, (p:GetAttribute("Rise") or 0) * scale
      local base = p:GetAttribute("BaseSize")
      local f0, f1 = p:GetAttribute("Fade0") or 0, p:GetAttribute("Fade1") or 1
      if opts.color then p.Color = opts.color end
      p.Anchored = true p.CanCollide = false p.CanQuery = false p.CanTouch = false p.CastShadow = false
      p.Size = base * from p.Transparency = f0 p.CFrame = cf
      task.delay(delay, function()
        p.Parent = folder track(p)
        TweenService:Create(p, TweenInfo.new(t, Enum.EasingStyle.Quad, Enum.EasingDirection.Out), {
          Size = base * to, Transparency = f1, CFrame = cf * CFrame.new(0, rise, 0) * CFrame.Angles(0, math.rad(spin), 0),
        }):Play()
      end)
    end
  end
  Debris:AddItem(folder, (tpl:GetAttribute("Lifetime") or 1) + 0.2)
  return folder
end
-- KeyframeMarker "vfx" with parameter "<preset>" (or marker named "vfx:<preset>") fires the effect at the character root.
function VFX.bindMarkers(animTrack, getCFrame)
  local conns = {}
  table.insert(conns, animTrack:GetMarkerReachedSignal("vfx"):Connect(function(param) VFX.play(param, getCFrame()) end))
  for _, tpl in ipairs(root:GetChildren()) do
    if tpl:IsA("Model") then
      table.insert(conns, animTrack:GetMarkerReachedSignal("vfx:" .. tpl.Name):Connect(function() VFX.play(tpl.Name, getCFrame()) end))
    end
  end
  return conns
end
return VFX
`;

/** Install Luau for the given presets. Asset ids are written literally (the bridge only injects literal ids). */
export function vfxInstallLuau(presetIds: string[], preview?: { at: [number, number, number]; preset: string }): string {
  const presets = presetIds.map(meshVfxPreset);
  const L: string[] = [];
  L.push(`local RS = game:GetService("ReplicatedStorage")`);
  L.push(`pcall(function() game:GetService("ChangeHistoryService"):SetWaypoint("Brickwire: before vfx_mesh_install") end)`);
  L.push(`local root = RS:FindFirstChild("BW_VFX") or Instance.new("Folder") root.Name = "BW_VFX" root:SetAttribute("BW_Owned", true) root.Parent = RS`);
  L.push(`local made, failed = {}, {}`);
  L.push(`local function layer(model, id, o)
  local ok, inst = pcall(BW.asset, id, { Parent = model, At = { 0, -1000, 0 } })
  if not ok then table.insert(failed, id .. ": " .. tostring(inst)) return end
  local p = inst:IsA("BasePart") and inst or inst:FindFirstChildWhichIsA("BasePart", true)
  if not p then inst:Destroy() table.insert(failed, id .. ": no part") return end
  if p ~= inst then p.Parent = model inst:Destroy() end
  p.Name = o.name p.Anchored = true p.CanCollide = false p.CanQuery = false p.CanTouch = false p.CastShadow = false
  p.Color = Color3.fromRGB(o.c[1], o.c[2], o.c[3]) p.Material = Enum.Material[o.mat]
  p:SetAttribute("BW_Asset", id) p:SetAttribute("BaseSize", p.Size) p:SetAttribute("From", o.from) p:SetAttribute("To", o.to) p:SetAttribute("T", o.t)
  p:SetAttribute("Delay", o.delay) p:SetAttribute("Spin", o.spin) p:SetAttribute("Rise", o.rise) p:SetAttribute("Fade0", o.f0) p:SetAttribute("Fade1", o.f1)
end`);
  for (const p of presets) {
    const life = Math.max(...p.layers.map((l) => (l.delay ?? 0) + l.t));
    L.push(`do local old = root:FindFirstChild("${p.id}") if old then old:Destroy() end
  local m = Instance.new("Model") m.Name = "${p.id}" m:SetAttribute("Lifetime", ${life}) m.Parent = root`);
    p.layers.forEach((l, i) => {
      L.push(`  layer(m, "${l.id}", { name = "L${i + 1}", c = {${l.color.join(",")}}, mat = "${l.material ?? "Neon"}", from = ${l.from}, to = ${l.to}, t = ${l.t}, delay = ${l.delay ?? 0}, spin = ${l.spin ?? 0}, rise = ${l.rise ?? 0}, f0 = ${l.fade?.[0] ?? 0}, f1 = ${l.fade?.[1] ?? 1} })`);
    });
    L.push(`  table.insert(made, { preset = "${p.id}", layers = #m:GetChildren(), lifetime = ${life} }) end`);
  }
  L.push(`local mod = root:FindFirstChild("VFX") or Instance.new("ModuleScript") mod.Name = "VFX" mod.Source = ARGS.runtime mod.Parent = root`);
  if (preview) {
    L.push(`-- Edit-mode preview: play the template directly with TweenService (same logic as the runtime).
local tpl = root:FindFirstChild("${preview.preset}")
local pf = workspace:FindFirstChild("BW_VfxPreview") if pf then pf:Destroy() end
pf = Instance.new("Folder") pf.Name = "BW_VfxPreview" pf:SetAttribute("BW_Owned", true) pf.Parent = workspace
local TS = game:GetService("TweenService")
local cf = CFrame.new(${preview.at.join(",")})
if tpl then for _, l in ipairs(tpl:GetChildren()) do
  local p = l:Clone() local base = p:GetAttribute("BaseSize")
  p.Size = base * p:GetAttribute("From") p.Transparency = p:GetAttribute("Fade0") p.CFrame = cf p.Parent = pf
  task.delay(p:GetAttribute("Delay"), function() TS:Create(p, TweenInfo.new(p:GetAttribute("T")), { Size = base * p:GetAttribute("To"), Transparency = p:GetAttribute("Fade1"), CFrame = cf * CFrame.new(0, p:GetAttribute("Rise"), 0) * CFrame.Angles(0, math.rad(p:GetAttribute("Spin")), 0) }):Play() end)
end end
task.wait((tpl and tpl:GetAttribute("Lifetime") or 1) + 0.1)
local ended = {} for _, p in ipairs(pf:GetChildren()) do table.insert(ended, { name = p.Name, transparency = p.Transparency }) end`);
  }
  L.push(`pcall(function() game:GetService("ChangeHistoryService"):SetWaypoint("Brickwire: vfx_mesh_install") end)`);
  L.push(`local check = BW.fxCheck and BW.fxCheck(root) or nil`);
  L.push(`return { installed = made, failed = failed, module = mod:GetFullName(), fxCheck = check${preview ? ", preview = ended" : ""} }`);
  return L.join("\n");
}
