/**
 * M8: GFX styles. Each style = Lighting settings + post effects (applied in Studio, measurable by a read)
 * + camera rule + image post-processing params (bridge/src/imaging-post.ts).
 * Applying a style backs up Lighting children it replaces into ServerStorage.BrickwireBackups (via snapshotTargets)
 * and only creates/updates effects named BW_Gfx_*.
 */
export interface GfxStyle {
  id: string;
  label: string;
  lighting: { ClockTime: number; Brightness: number; ExposureCompensation: number; Ambient: [number, number, number]; OutdoorAmbient: [number, number, number]; EnvironmentDiffuseScale: number; EnvironmentSpecularScale: number; ShadowSoftness: number };
  cc: { Brightness: number; Contrast: number; Saturation: number; TintColor: [number, number, number] };
  bloom: { Intensity: number; Size: number; Threshold: number };
  dof?: { FarIntensity: number; FocusDistance: number; InFocusRadius: number; NearIntensity: number };
  sunRays?: { Intensity: number; Spread: number };
  atmosphere?: { Density: number; Haze: number; Glare: number; Color: [number, number, number] };
  camera: { fov: number; rule: string };
  post: { saturation: number; sharpen: number; vignette: number };
}

export const GFX_STYLES: GfxStyle[] = [
  { id: "cartoon_bright", label: "Cartoon bright", lighting: { ClockTime: 14, Brightness: 3, ExposureCompensation: 0.3, Ambient: [120, 120, 130], OutdoorAmbient: [150, 150, 160], EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 0.5, ShadowSoftness: 0.6 },
    cc: { Brightness: 0.05, Contrast: 0.15, Saturation: 0.35, TintColor: [255, 255, 255] }, bloom: { Intensity: 0.6, Size: 24, Threshold: 1.6 }, camera: { fov: 50, rule: "subject fills 60% height, slight low angle" }, post: { saturation: 1.3, sharpen: 0.6, vignette: 0.2 } },
  { id: "neon_night", label: "Neon night", lighting: { ClockTime: 0, Brightness: 1, ExposureCompensation: 0.4, Ambient: [40, 20, 70], OutdoorAmbient: [50, 30, 90], EnvironmentDiffuseScale: 0.4, EnvironmentSpecularScale: 1, ShadowSoftness: 0.3 },
    cc: { Brightness: 0, Contrast: 0.25, Saturation: 0.45, TintColor: [235, 215, 255] }, bloom: { Intensity: 1.4, Size: 40, Threshold: 0.9 }, atmosphere: { Density: 0.35, Haze: 1.5, Glare: 0.4, Color: [120, 70, 200] }, camera: { fov: 55, rule: "rule of thirds, neon sources in frame" }, post: { saturation: 1.35, sharpen: 0.5, vignette: 0.45 } },
  { id: "cinematic", label: "Cinematic", lighting: { ClockTime: 17.6, Brightness: 2.2, ExposureCompensation: 0, Ambient: [70, 60, 60], OutdoorAmbient: [110, 95, 90], EnvironmentDiffuseScale: 0.8, EnvironmentSpecularScale: 1, ShadowSoftness: 0.15 },
    cc: { Brightness: -0.02, Contrast: 0.3, Saturation: 0.05, TintColor: [255, 236, 214] }, bloom: { Intensity: 0.4, Size: 30, Threshold: 1.8 }, dof: { FarIntensity: 0.5, FocusDistance: 18, InFocusRadius: 14, NearIntensity: 0.3 }, sunRays: { Intensity: 0.12, Spread: 0.8 }, camera: { fov: 35, rule: "long lens, subject on a third, depth" }, post: { saturation: 1.05, sharpen: 0.4, vignette: 0.5 } },
  { id: "soft_pastel", label: "Soft pastel", lighting: { ClockTime: 11, Brightness: 2.6, ExposureCompensation: 0.5, Ambient: [170, 160, 180], OutdoorAmbient: [190, 180, 200], EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 0.2, ShadowSoftness: 1 },
    cc: { Brightness: 0.08, Contrast: -0.05, Saturation: 0.1, TintColor: [255, 245, 250] }, bloom: { Intensity: 0.3, Size: 50, Threshold: 2 }, camera: { fov: 45, rule: "centered subject, flat front light" }, post: { saturation: 1.1, sharpen: 0.3, vignette: 0.1 } },
  { id: "horror_fog", label: "Horror fog", lighting: { ClockTime: 1, Brightness: 0.6, ExposureCompensation: -0.3, Ambient: [25, 30, 35], OutdoorAmbient: [30, 35, 40], EnvironmentDiffuseScale: 0.2, EnvironmentSpecularScale: 0.3, ShadowSoftness: 0.2 },
    cc: { Brightness: -0.05, Contrast: 0.35, Saturation: -0.45, TintColor: [200, 225, 220] }, bloom: { Intensity: 0.2, Size: 20, Threshold: 2.2 }, atmosphere: { Density: 0.6, Haze: 3, Glare: 0, Color: [90, 100, 100] }, camera: { fov: 70, rule: "wide, low, subject small with negative space" }, post: { saturation: 0.75, sharpen: 0.5, vignette: 0.6 } },
  { id: "golden_hour", label: "Golden hour", lighting: { ClockTime: 18.2, Brightness: 2.8, ExposureCompensation: 0.2, Ambient: [110, 80, 60], OutdoorAmbient: [150, 110, 80], EnvironmentDiffuseScale: 1, EnvironmentSpecularScale: 0.8, ShadowSoftness: 0.4 },
    cc: { Brightness: 0.03, Contrast: 0.15, Saturation: 0.25, TintColor: [255, 225, 190] }, bloom: { Intensity: 0.8, Size: 36, Threshold: 1.4 }, sunRays: { Intensity: 0.2, Spread: 1 }, atmosphere: { Density: 0.3, Haze: 1, Glare: 0.6, Color: [255, 200, 150] }, camera: { fov: 45, rule: "backlit subject, sun in upper corner" }, post: { saturation: 1.2, sharpen: 0.4, vignette: 0.35 } },
];

export function gfxStyle(id: string): GfxStyle {
  const s = GFX_STYLES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown GFX style '${id}' (${GFX_STYLES.map((x) => x.id).join(", ")})`);
  return s;
}

/** ARGS = { style: GfxStyle, applyCamera: boolean, focus?: string path }. Returns a measured read of the result. */
export const GFX_APPLY_LUAU = String.raw`
local S = ARGS.style
local L = game:GetService("Lighting")
local CHS = game:GetService("ChangeHistoryService")
pcall(function() CHS:SetWaypoint("Brickwire: before gfx_style") end)
local function c3(t) return Color3.fromRGB(t[1], t[2], t[3]) end
for k, v in pairs(S.lighting) do
  if type(v) == "table" then L[k] = c3(v) else L[k] = v end
end
local function fx(class, name, props)
  local e = L:FindFirstChild(name)
  if not props then if e then e:Destroy() end return end
  if not e then e = Instance.new(class) e.Name = name e.Parent = L end
  for k, v in pairs(props) do if type(v) == "table" then e[k] = c3(v) else e[k] = v end end
end
fx("ColorCorrectionEffect", "BW_Gfx_CC", S.cc)
fx("BloomEffect", "BW_Gfx_Bloom", S.bloom)
fx("DepthOfFieldEffect", "BW_Gfx_DOF", S.dof)
fx("SunRaysEffect", "BW_Gfx_SunRays", S.sunRays)
local atm = L:FindFirstChildOfClass("Atmosphere")
if S.atmosphere then
  if not atm then atm = Instance.new("Atmosphere") atm.Name = "BW_Gfx_Atmosphere" atm.Parent = L end
  for k, v in pairs(S.atmosphere) do if type(v) == "table" then atm[k] = c3(v) else atm[k] = v end end
elseif atm and atm.Name == "BW_Gfx_Atmosphere" then atm:Destroy() end
L:SetAttribute("BW_GfxStyle", S.id)
local cam = workspace.CurrentCamera
if ARGS.applyCamera and cam then
  cam.FieldOfView = S.camera.fov
end
pcall(function() CHS:SetWaypoint("Brickwire: gfx_style " .. S.id) end)
local cc = L:FindFirstChild("BW_Gfx_CC")
return { style = L:GetAttribute("BW_GfxStyle"), ClockTime = L.ClockTime, Brightness = L.Brightness, Exposure = L.ExposureCompensation,
  ccSaturation = cc and cc.Saturation, ccContrast = cc and cc.Contrast, bloom = L:FindFirstChild("BW_Gfx_Bloom") and L.BW_Gfx_Bloom.Intensity,
  dof = L:FindFirstChild("BW_Gfx_DOF") ~= nil, fov = cam and cam.FieldOfView, cameraRule = S.camera.rule }
`;
