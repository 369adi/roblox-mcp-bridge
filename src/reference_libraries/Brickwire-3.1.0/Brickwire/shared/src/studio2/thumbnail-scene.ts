/**
 * M4: thumbnail scenes built from parts only (no asset ids). Output: Workspace.BW_ThumbnailScene.
 * The scene sits on its own stage at `at` (default 0,500,0) so it never overlaps the user's map.
 * Rigs are R6 proportions; poses are applied by assigning WHOLE CFrames to Motor6D.C0 (never C0.Position = …),
 * which is what causes "C0 read only"-style errors in model-generated code.
 */
export const THUMB_TEMPLATES = ["poor_vs_rich", "hero_peek", "item_showcase"] as const;
export type ThumbTemplate = (typeof THUMB_TEMPLATES)[number];
export const THUMB_POSES = ["idle", "wave", "cheer", "sad", "point", "hold", "shocked"] as const;
export const THUMB_SKINS = ["noob", "rich", "hero", "seeker", "farmer"] as const;
export const SCENE_NAME = "BW_ThumbnailScene";

export interface ThumbSceneArgs {
  template?: string;
  title?: string;
  labels?: string[];
  side?: "left" | "right";
  at?: [number, number, number];
}

export function normalizeSceneArgs(a: Record<string, unknown>): Required<Omit<ThumbSceneArgs, "title">> & { title: string } {
  const template = String(a.template ?? "poor_vs_rich");
  if (!(THUMB_TEMPLATES as readonly string[]).includes(template)) throw new Error(`unknown template '${template}' (${THUMB_TEMPLATES.join(", ")})`);
  const defaults: Record<string, { title: string; labels: string[] }> = {
    poor_vs_rich: { title: "", labels: ["+1", "+999999"] },
    hero_peek: { title: "HIDE\nAND\nSEEK", labels: [] },
    item_showcase: { title: "GROWS OFFLINE!", labels: [] },
  };
  const labels = Array.isArray(a.labels) ? a.labels.map(String).slice(0, 4) : defaults[template].labels;
  const at = Array.isArray(a.at) && a.at.length === 3 && a.at.every((n) => Number.isFinite(Number(n))) ? (a.at.map(Number) as [number, number, number]) : ([0, 500, 0] as [number, number, number]);
  const side = a.side === "right" ? "right" : "left";
  const title = typeof a.title === "string" ? a.title.slice(0, 60) : defaults[template].title;
  return { template, title, labels, side, at };
}

/** Rejects model-generated Luau that assigns a component of a CFrame property (read-only in Luau). */
const CFRAME_FIELD_WRITE = /\.(C0|C1|CFrame|CoordinateFrame|WorldCFrame|PivotOffset)\s*\.\s*(Position|X|Y|Z|p|Rotation|LookVector|RightVector|UpVector|XVector|YVector|ZVector)\s*=(?!=)/g;
export function lintReadonlyCFrameWrites(code: string): string[] {
  const out: string[] = [];
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    const l = line.replace(/--.*$/, "");
    for (const m of l.matchAll(CFRAME_FIELD_WRITE)) {
      out.push(`line ${i + 1}: ".${m[1]}.${m[2]} =" — CFrame components are read only. Assign the whole CFrame instead, e.g. motor.${m[1] === "C1" ? "C1" : m[1]} = CFrame.new(pos) * CFrame.Angles(rx, ry, rz) (or BW.pose(rig, "wave")).`);
    }
  });
  return out;
}

export const THUMB_SCENE_LUAU = String.raw`
local A = ARGS
local CHS = game:GetService("ChangeHistoryService")
pcall(function() CHS:SetWaypoint("Brickwire: before thumbnail_scene") end)
local origin = CFrame.new(A.at[1], A.at[2], A.at[3])
local old = workspace:FindFirstChild("${SCENE_NAME}")
if old then
  if not old:GetAttribute("BW_Owned") then error("Workspace.${SCENE_NAME} exists and was not made by Brickwire — rename it first") end
  old:Destroy()
end
local cam = workspace.CurrentCamera
local oldFx = cam and cam:FindFirstChild("BW_ThumbScene_DOF")
if oldFx then oldFx:Destroy() end
local scene = Instance.new("Model")
scene.Name = "${SCENE_NAME}"
scene:SetAttribute("BW_Owned", true)
scene:SetAttribute("BW_Template", A.template)
local subjects = Instance.new("Model") subjects.Name = "Subjects" subjects.Parent = scene
local props = Instance.new("Model") props.Name = "Props" props.Parent = scene
local labels = Instance.new("Folder") labels.Name = "Labels" labels.Parent = scene
local function rgb(r, g, b) return Color3.fromRGB(r, g, b) end
local function part(parent, name, size, cf, color, mat, extra)
  local p = Instance.new("Part")
  p.Name = name p.Anchored = true p.Size = size p.CFrame = origin * cf p.Color = color
  p.Material = mat or Enum.Material.SmoothPlastic p.TopSurface = Enum.SurfaceType.Smooth p.BottomSurface = Enum.SurfaceType.Smooth
  for k, v in pairs(extra or {}) do p[k] = v end
  p.Parent = parent
  return p
end

-- R6 rig (parts only). Pose = rotations per joint in degrees; applied as whole CFrames.
local SKINS = {
  noob = { head = rgb(245,205,48), torso = rgb(13,105,172), arms = rgb(245,205,48), legs = rgb(75,151,75) },
  rich = { head = rgb(255,220,180), torso = rgb(30,30,36), arms = rgb(255,220,180), legs = rgb(30,30,36), crown = true, chain = true },
  hero = { head = rgb(255,214,170), torso = rgb(220,60,60), arms = rgb(255,214,170), legs = rgb(40,40,60) },
  seeker = { head = rgb(240,200,160), torso = rgb(60,60,70), arms = rgb(240,200,160), legs = rgb(30,30,40) },
  farmer = { head = rgb(255,215,175), torso = rgb(90,170,90), arms = rgb(255,215,175), legs = rgb(70,90,160), hat = true },
}
local POSES = {
  idle = { ra = {0,0}, la = {0,0}, head = {0,0} },
  wave = { ra = {0,150}, la = {0,8}, head = {0,10} },
  cheer = { ra = {0,160}, la = {0,160}, head = {10,0} },
  sad = { ra = {10,4}, la = {10,4}, head = {-22,0} },
  point = { ra = {90,0}, la = {0,6}, head = {0,0} },
  hold = { ra = {70,-12}, la = {70,-12}, head = {-8,0} },
  shocked = { ra = {30,60}, la = {30,60}, head = {8,0} },
}
local FACES = { idle = {"•  •","‿"}, wave = {"^  ^","◡"}, cheer = {"^  ^","D"}, sad = {"•  •","︵"}, point = {"•  •","◡"}, hold = {"•  •","◡"}, shocked = {"O  O","o"} }
local function face(head, pose)
  local f = FACES[pose] or FACES.idle
  local g = Instance.new("SurfaceGui") g.Name = "BW_Face" g.Face = Enum.NormalId.Front g.CanvasSize = Vector2.new(200, 100) g.LightInfluence = 0 g.Parent = head
  local function txt(t, y, h)
    local l = Instance.new("TextLabel") l.BackgroundTransparency = 1 l.Size = UDim2.new(1,0,h,0) l.Position = UDim2.new(0,0,y,0)
    l.Font = Enum.Font.FredokaOne l.TextScaled = true l.TextColor3 = rgb(20,20,20) l.Text = t l.Parent = g
  end
  txt(f[1], 0.12, 0.42) txt(f[2], 0.5, 0.42)
end
local function rig(name, at, yaw, skinName, poseName)
  local skin = SKINS[skinName] or SKINS.noob
  local pose = POSES[poseName] or POSES.idle
  local m = Instance.new("Model") m.Name = name m:SetAttribute("BW_Pose", poseName) m:SetAttribute("BW_Skin", skinName) m.Parent = subjects
  local base = CFrame.new(at[1], at[2] + 3, at[3]) * CFrame.Angles(0, math.rad(yaw or 0), 0)
  local torso = part(m, "Torso", Vector3.new(2,2,1), base, skin.torso)
  local root = part(m, "HumanoidRootPart", Vector3.new(2,2,1), base, skin.torso, nil, { Transparency = 1, CanCollide = false })
  local hum = Instance.new("Humanoid") hum.RigType = Enum.HumanoidRigType.R6 hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None hum.Parent = m
  m.PrimaryPart = root
  local function joint(name0, p0, p1, c0, c1)
    local j = Instance.new("Motor6D") j.Name = name0 j.Part0 = p0 j.Part1 = p1
    j.C0 = c0 j.C1 = c1 -- whole-CFrame assignment (the C0 fix)
    j.Parent = p0
    return j
  end
  local function limb(name0, jointName, color, pivot, rx, rz, len)
    local R = CFrame.Angles(math.rad(rx), 0, math.rad(rz))
    local c0 = CFrame.new(pivot) * R
    local c1 = CFrame.new(0, len / 2, 0)
    local p = part(m, name0, Vector3.new(1, len, 1), base * c0 * c1:Inverse(), color)
    joint(jointName, torso, p, c0, c1)
    return p
  end
  limb("Right Arm", "Right Shoulder", skin.arms, Vector3.new(1.5, 1, 0), pose.ra[1], pose.ra[2], 2)
  limb("Left Arm", "Left Shoulder", skin.arms, Vector3.new(-1.5, 1, 0), pose.la[1], -pose.la[2], 2)
  limb("Right Leg", "Right Hip", skin.legs, Vector3.new(0.5, -1, 0), 0, 0, 2)
  limb("Left Leg", "Left Hip", skin.legs, Vector3.new(-0.5, -1, 0), 0, 0, 2)
  local hc0 = CFrame.new(0, 1, 0) * CFrame.Angles(math.rad(pose.head[1]), 0, math.rad(pose.head[2]))
  local hc1 = CFrame.new(0, -0.5, 0)
  local head = part(m, "Head", Vector3.new(2,1,1), base * hc0 * hc1:Inverse(), skin.head)
  local sm = Instance.new("SpecialMesh") sm.MeshType = Enum.MeshType.Head sm.Scale = Vector3.new(1.25,1.25,1.25) sm.Parent = head
  joint("Neck", torso, head, hc0, hc1)
  face(head, poseName)
  local hcf = base * hc0 * hc1:Inverse()
  if skin.crown then
    local gold = rgb(255,196,40)
    part(m, "CrownBand", Vector3.new(1.9,0.35,1.9), hcf * CFrame.new(0,0.85,0), gold, Enum.Material.Metal)
    for i = 0, 3 do
      local a = i * math.pi / 2 + math.pi / 4
      part(m, "CrownSpike", Vector3.new(0.4,0.6,0.4), hcf * CFrame.new(math.cos(a) * 0.75, 1.3, math.sin(a) * 0.75) * CFrame.Angles(0, a, math.rad(45)), gold, Enum.Material.Metal)
    end
  end
  if skin.chain then part(m, "GoldChain", Vector3.new(1.4,0.2,0.2), base * CFrame.new(0,0.5,-0.55), rgb(255,200,40), Enum.Material.Metal) end
  if skin.hat then part(m, "StrawHat", Vector3.new(2.6,0.3,2.6), hcf * CFrame.new(0,0.75,0), rgb(230,200,110), Enum.Material.Fabric) end
  -- parts were created relative to origin by part(); re-base everything that used absolute hcf
  return m
end

local function label(text, pos, color, h)
  local anchor = part(labels, "LabelAnchor", Vector3.new(0.2,0.2,0.2), CFrame.new(pos[1], pos[2], pos[3]), rgb(0,0,0), nil, { Transparency = 1, CanCollide = false })
  local bb = Instance.new("BillboardGui") bb.Name = "BW_Label" bb.Size = UDim2.new(h * 4.5, 0, h, 0) bb.LightInfluence = 0 bb.AlwaysOnTop = true bb.Parent = anchor
  bb:SetAttribute("BW_HeightStuds", h)
  local l = Instance.new("TextLabel") l.BackgroundTransparency = 1 l.Size = UDim2.fromScale(1,1) l.Text = text l.TextScaled = true
  l.Font = (string.len(text) <= 8) and Enum.Font.LuckiestGuy or Enum.Font.FredokaOne l.TextColor3 = color l.Parent = bb
  local s = Instance.new("UIStroke") s.Thickness = 5 s.Color = rgb(0,0,0) s.LineJoinMode = Enum.LineJoinMode.Round s.Parent = l
  return anchor
end

local T = A.template
if T == "poor_vs_rich" then
  part(props, "FloorPoor", Vector3.new(22,1,18), CFrame.new(-11,-0.5,0), rgb(200,170,120), Enum.Material.Sand)
  part(props, "FloorRich", Vector3.new(22,1,18), CFrame.new(11,-0.5,0), rgb(50,20,90), Enum.Material.Glass)
  part(props, "WallPoor", Vector3.new(22,16,1), CFrame.new(-11,7.5,-9), rgb(140,60,45), Enum.Material.Brick)
  part(props, "WallRich", Vector3.new(22,16,1), CFrame.new(11,7.5,-9), rgb(70,25,130), Enum.Material.SmoothPlastic)
  for i = 0, 3 do part(props, "NeonStrip", Vector3.new(20,0.3,0.3), CFrame.new(11, 2 + i * 4, -8.4), (i % 2 == 0) and rgb(255,60,220) or rgb(60,230,255), Enum.Material.Neon) end
  -- lightning divider (outlined zigzag)
  local zig = { {0,13,15}, {-1.2,7,-25}, {1,1.5,15} }
  for i, z in ipairs(zig) do
    part(props, "BoltOutline" .. i, Vector3.new(2.4,6.6,0.6), CFrame.new(z[1], z[2], 1.1) * CFrame.Angles(0,0,math.rad(z[3])), rgb(10,10,10))
    part(props, "Bolt" .. i, Vector3.new(1.6,6,0.7), CFrame.new(z[1], z[2], 1.3) * CFrame.Angles(0,0,math.rad(z[3])), rgb(255,230,40), Enum.Material.Neon)
  end
  -- poor props: cheap PC on a box
  part(props, "Box", Vector3.new(4,2.5,3), CFrame.new(-15,1.25,-2), rgb(170,130,80), Enum.Material.WoodPlanks)
  part(props, "OldMonitor", Vector3.new(2.6,2,1.6), CFrame.new(-15,3.5,-2), rgb(220,215,200))
  part(props, "OldScreen", Vector3.new(2,1.4,0.1), CFrame.new(-15,3.6,-1.15), rgb(90,110,90), Enum.Material.SmoothPlastic)
  part(props, "Crack", Vector3.new(4,0.1,0.1), CFrame.new(-7,0.05,3) * CFrame.Angles(0,math.rad(30),0), rgb(90,70,50))
  -- rich props: glowing PC, pedestal, coins
  part(props, "Desk", Vector3.new(7,0.6,3.5), CFrame.new(15,3,-3), rgb(20,20,25), Enum.Material.Metal)
  part(props, "Tower", Vector3.new(2,4.5,4), CFrame.new(18.8,2.25,-3), rgb(15,15,20), Enum.Material.Glass)
  local core = part(props, "TowerGlow", Vector3.new(0.2,3.6,3.2), CFrame.new(17.75,2.3,-3), rgb(60,230,255), Enum.Material.Neon)
  local pl = Instance.new("PointLight") pl.Color = rgb(150,90,255) pl.Range = 18 pl.Brightness = 3 pl.Parent = core
  part(props, "BigMonitor", Vector3.new(6,3.4,0.4), CFrame.new(15,5.2,-4.2), rgb(15,15,20))
  part(props, "BigScreen", Vector3.new(5.6,3,0.1), CFrame.new(15,5.2,-3.95), rgb(255,60,220), Enum.Material.Neon)
  for s = 0, 2 do for c = 0, 4 do
    part(props, "Coin", Vector3.new(0.3,1.4,1.4), CFrame.new(5 + s * 1.7, 0.15 + c * 0.32, 3.5) * CFrame.Angles(0,0,math.rad(90)), rgb(255,200,40), Enum.Material.Metal, { Shape = Enum.PartType.Cylinder })
  end end
  local sp = Instance.new("Sparkles") sp.SparkleColor = rgb(255,220,80) sp.Parent = props:FindFirstChild("Coin")
  rig("Noob", {-9,0,2}, 20, "noob", "sad")
  rig("Rich", {9,0,2}, -20, "rich", "cheer")
  label(A.labels[1] or "+1", {-9,9,2}, rgb(255,255,255), 3)
  label(A.labels[2] or "+999999", {9,10,2}, rgb(255,210,40), 3.4)
  if A.title ~= "" then label(A.title, {0,15,0}, rgb(255,255,255), 3) end
elseif T == "hero_peek" then
  local sx = (A.side == "right") and -1 or 1
  part(props, "Ground", Vector3.new(60,1,60), CFrame.new(0,-0.5,-10), rgb(110,170,90), Enum.Material.Grass)
  part(props, "PeekWall", Vector3.new(3,14,6), CFrame.new(sx * 6.5,7,10), rgb(200,190,170), Enum.Material.Concrete)
  part(props, "Backdrop", Vector3.new(60,24,1), CFrame.new(0,12,-30), rgb(120,180,240))
  for i = 1, 4 do part(props, "Crate" .. i, Vector3.new(3,3,3), CFrame.new(-10 + i * 5, 1.5, -14 - (i % 2) * 4) * CFrame.Angles(0, math.rad(i * 17), 0), rgb(160,110,60), Enum.Material.WoodPlanks) end
  rig("Hero", {sx * 4.6,0,10}, sx * 25, "hero", "shocked")
  rig("Seeker", {-sx * 3,0,-12}, 0, "seeker", "point")
  rig("Hider", {sx * 8,0,-18}, -sx * 30, "noob", "idle")
  label(A.title, {-sx * 9,9,4}, rgb(255,255,255), 5)
  if cam then
    local dof = Instance.new("DepthOfFieldEffect") dof.Name = "BW_ThumbScene_DOF" dof.FocusDistance = 12 dof.InFocusRadius = 10 dof.FarIntensity = 0.45 dof.NearIntensity = 0 dof.Parent = cam
  end
else -- item_showcase (voxel)
  local pastel = { rgb(255,182,213), rgb(176,224,255), rgb(200,255,190), rgb(255,240,170) }
  for gx = -6, 6 do for gz = -5, 3 do
    part(props, "Voxel", Vector3.new(3,1,3), CFrame.new(gx * 3, -0.5 + ((gx + gz) % 2) * 0.05, gz * 3), ((gx + gz) % 2 == 0) and rgb(120,200,90) or rgb(110,185,85), Enum.Material.SmoothPlastic)
  end end
  local trees = { {-13,-8}, {-8,-12}, {9,-11}, {14,-7}, {-15,2}, {15,1} }
  for i, t in ipairs(trees) do
    part(props, "Trunk" .. i, Vector3.new(1.5,4,1.5), CFrame.new(t[1],2,t[2]), rgb(140,95,60))
    part(props, "Leaves" .. i, Vector3.new(5,4,5), CFrame.new(t[1],6,t[2]), pastel[(i % 4) + 1])
    part(props, "LeavesTop" .. i, Vector3.new(3,2,3), CFrame.new(t[1],9,t[2]), pastel[((i + 1) % 4) + 1])
  end
  rig("Farmer", {0,0,0}, 0, "farmer", "hold")
  local rainbow = { rgb(255,80,80), rgb(255,160,60), rgb(255,230,70), rgb(90,220,110), rgb(80,160,255), rgb(170,100,255) }
  for i, c in ipairs(rainbow) do part(props, "RainbowItem" .. i, Vector3.new(2.2,0.45,0.9), CFrame.new(0, 3.6 + i * 0.45, -2.6), c, Enum.Material.Neon) end
  local ip = Instance.new("PointLight") ip.Range = 10 ip.Brightness = 2 ip.Parent = props:FindFirstChild("RainbowItem3")
  label(A.title, {0,14,0}, rgb(255,255,255), 3.6)
end
scene.Parent = workspace

-- 16:9 auto-framing + frame check (WorldToViewportPoint on the subject box + label legibility at 480x270).
local result = { template = T, parts = 0, fixes = 0 }
for _, d in ipairs(scene:GetDescendants()) do if d:IsA("BasePart") then result.parts += 1 end end
local cf, size = subjects:GetBoundingBox()
local fov = 50
local aspect = 16 / 9
local halfV = math.rad(fov / 2)
local halfH = math.atan(math.tan(halfV) * aspect)
local function needed(margin)
  local hw, hh = size.X / 2 * margin, size.Y / 2 * margin
  return math.max(hh / math.tan(halfV), hw / math.tan(halfH)) + size.Z / 2
end
local margin = (T == "hero_peek") and 1.0 or 1.25
local target = cf.Position + Vector3.new(0, size.Y * 0.08, 0)
local frame = { ok = false, reason = "no camera" }
if cam then
  cam.CameraType = Enum.CameraType.Scriptable
  cam.FieldOfView = fov
  for attempt = 0, 2 do
    local d = needed(margin)
    local pos = target + Vector3.new(0, size.Y * 0.15, d)
    cam.CFrame = CFrame.lookAt(pos, target)
    local vp = cam.ViewportSize
    -- the 16:9 safe rect inside the current viewport
    local w, h = vp.X, vp.X / aspect
    if h > vp.Y then h = vp.Y w = vp.Y * aspect end
    local x0, y0 = (vp.X - w) / 2, (vp.Y - h) / 2
    local inside, total = 0, 0
    for _, sx in ipairs({-1,1}) do for _, sy in ipairs({-1,1}) do for _, sz in ipairs({-1,1}) do
      local p = (cf * CFrame.new(sx * size.X / 2, sy * size.Y / 2, sz * size.Z / 2)).Position
      local v, on = cam:WorldToViewportPoint(p)
      total += 1
      if on and v.X >= x0 and v.X <= x0 + w and v.Y >= y0 and v.Y <= y0 + h then inside += 1 end
    end end end
    local minLabelPx = math.huge
    for _, an in ipairs(labels:GetChildren()) do
      local bb = an:FindFirstChild("BW_Label")
      if bb then
        local hs = bb:GetAttribute("BW_HeightStuds")
        local a1 = cam:WorldToViewportPoint(an.Position + Vector3.new(0, hs / 2, 0))
        local a2 = cam:WorldToViewportPoint(an.Position - Vector3.new(0, hs / 2, 0))
        minLabelPx = math.min(minLabelPx, math.abs(a2.Y - a1.Y) * (270 / h))
      end
    end
    frame = { ok = inside == total and (minLabelPx == math.huge or minLabelPx >= 18), cornersInside = inside, corners = total, minLabelPxAt480x270 = (minLabelPx == math.huge) and nil or math.floor(minLabelPx), viewport = { vp.X, vp.Y }, distance = math.floor(d * 10) / 10 }
    if frame.ok then break end
    if inside < total then margin = margin * 1.15 else margin = margin * 0.9 end
    result.fixes = attempt + 1
  end
end
result.frame = frame
result.camera = cam and { position = { cam.CFrame.Position.X, cam.CFrame.Position.Y, cam.CFrame.Position.Z }, fov = fov } or nil
pcall(function() CHS:SetWaypoint("Brickwire: thumbnail_scene " .. T) end)
return result
`;

/** Read-only verification after the build. */
export const THUMB_SCENE_VERIFY_LUAU = String.raw`
local s = workspace:FindFirstChild("${SCENE_NAME}")
if not s then return { exists = false } end
local parts, rigs, motors, badC0 = 0, 0, 0, 0
for _, d in ipairs(s:GetDescendants()) do
  if d:IsA("BasePart") then parts += 1 end
  if d:IsA("Humanoid") then rigs += 1 end
  if d:IsA("Motor6D") then
    motors += 1
    if d.Part0 and d.Part1 then
      local want = d.Part0.CFrame * d.C0 * d.C1:Inverse()
      if (want.Position - d.Part1.CFrame.Position).Magnitude > 0.05 then badC0 += 1 end
    end
  end
end
return { exists = true, owned = s:GetAttribute("BW_Owned") == true, template = s:GetAttribute("BW_Template"), parts = parts, rigs = rigs, motors = motors, jointsMismatched = badC0, labels = #s.Labels:GetChildren() }
`;
