import { ANIMATION_WORKSPACE_TOOLS } from "./animation-workspace.js";
import type { CompositeTool } from "./composites.js";
import { wrapLuau, pathSegments } from "./luau.js";
import crypto from "node:crypto";
const str = { type: "string" } as const;
export function validateVfx(input: any) {
  if (!input || !Array.isArray(input.layers) || !input.layers.length || input.layers.length > 32)
    throw Error("VFX requires 1–32 layers");
  const name = String(input.name ?? "Effect");
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(name)) throw Error("Use a simple effect name");
  const number = (x: any, d: number, min: number, max: number) => {
    const v = x === undefined ? d : Number(x);
    if (!Number.isFinite(v) || v < min || v > max) throw Error(`Number must be ${min}..${max}`);
    return v;
  };
  const vec = (x: any, d: number[]) => {
    const v = x ?? d;
    if (!Array.isArray(v) || v.length !== 3) throw Error("Expected vector [x,y,z]");
    return v.map((n) => number(n, 0, -500, 500));
  };
  const layers = input.layers.map((l: any, i: number) => {
    if (!["ring", "sphere", "block", "particles", "light"].includes(l.type))
      throw Error("Unsupported VFX layer");
    if (l.count !== undefined && !Number.isInteger(Number(l.count)))
      throw Error("Particle count must be an integer");
    const color = String(l.color ?? "#e3bd73");
    if (!/^#[0-9a-f]{6}$/i.test(color)) throw Error("Expected #RRGGBB");
    const size = vec(l.size, [4, 1, 4]);
    if (size.some((n) => n <= 0)) throw Error("Size must be positive");
    return {
      id: "layer_" + i,
      name: String(l.name ?? "Layer " + (i + 1)).slice(0, 80),
      type: l.type,
      color,
      offset: vec(l.offset, [0, 0, 0]),
      size,
      start: number(l.start, 0, 0, 30),
      duration: number(l.duration, 1, 0.05, 30),
      fromScale: number(l.fromScale, 0.2, 0.01, 20),
      toScale: number(l.toScale, 1, 0.01, 20),
      fromTransparency: number(l.fromTransparency, 0, 0, 1),
      toTransparency: number(l.toTransparency, 1, 0, 1),
      count: number(l.count, 30, 1, 200),
      brightness: number(l.brightness, 2, 0, 10),
    };
  });
  return {
    version: 1,
    name,
    layers,
    duration: Math.max(...layers.map((l: any) => l.start + l.duration)),
  };
}
const VFX_RUNTIME = `local TS=game:GetService("TweenService")
local Debris=game:GetService("Debris")
local Http=game:GetService("HttpService")
local root=script.Parent
local spec=Http:JSONDecode(root.Spec.Value)
local M={}
function M.stop()
 local old=workspace:FindFirstChild("BW_VfxPreview_"..root.Name)
 if old then assert(old:GetAttribute("BrickwireVfxOwner")==root.Name,"Preview name collision") end
 if old and old:GetAttribute("BrickwireVfxOwner")==root.Name then old:Destroy() end
end
function M.play(at,seek)
 M.stop()
 local model=Instance.new("Model")
 model.Name="BW_VfxPreview_"..root.Name
 model:SetAttribute("BrickwireVfxOwner",root.Name)
 model.Parent=workspace
 Debris:AddItem(model,spec.duration+5)
 for _,layer in ipairs(root.Layers:GetChildren()) do
  local index=layer:GetAttribute("LayerIndex")
  local l=spec.layers[index]
  local function show()
   if not model.Parent then return end
   local clone=layer:Clone()
   clone.Parent=model
   local alpha=seek and math.clamp((seek-l.start)/l.duration,0,1) or 0
   local scale=l.fromScale+(l.toScale-l.fromScale)*alpha
   local transparency=l.fromTransparency+(l.toTransparency-l.fromTransparency)*alpha
   for _,d in ipairs(clone:GetDescendants()) do
    if d:IsA("BasePart") then
     local size=d.Size
     local layerOffset=Vector3.new(unpack(l.offset))
     local position=d.Position-layerOffset
     local rotation=d.CFrame.Rotation
     d.Size=size*scale
     d.CFrame=at*CFrame.new(layerOffset+position*scale)*rotation
     d.Transparency=d:GetAttribute("Helper") and 1 or transparency
     if seek==nil then TS:Create(d,TweenInfo.new(l.duration,Enum.EasingStyle.Quad,Enum.EasingDirection.Out),{Size=size*l.toScale,CFrame=at*CFrame.new(layerOffset+position*l.toScale)*rotation,Transparency=d:GetAttribute("Helper") and 1 or l.toTransparency}):Play() end
    elseif d:IsA("ParticleEmitter") then
     if seek==nil then d:Emit(l.count) end
    elseif d:IsA("PointLight") then
     if seek==nil then TS:Create(d,TweenInfo.new(l.duration),{Brightness=0}):Play() end
    end
   end
   if seek==nil then Debris:AddItem(clone,l.duration+3) end
  end
  if seek~=nil then
   if seek>=l.start and seek<=l.start+l.duration then show() end
  else task.delay(l.start,show) end
 end
 return model
end
return M`;
export const WORKSPACE_TOOLS: CompositeTool[] = [
  ...ANIMATION_WORKSPACE_TOOLS,
  {
    name: "workspace_graph",
    description:
      "Observe a bounded live hierarchy and static script dependencies. Partial graph, not continuous synchronization. Sources are not returned.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", properties: { root: str, maxNodes: { type: "integer" } } },
    async run(a, ctx) {
      const max = Math.min(5000, Math.max(10, Number(a.maxNodes ?? 1200)));
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.root ?? "game")), max },
          `local root=bw_must(ARGS.segs)
 local nodes,edges={},{}
 local truncated=false
 local function visit(inst,parent)
  if #nodes>=ARGS.max then truncated=true return end
  local p=bw_path(inst)
  local node={path=p,name=inst.Name,className=inst.ClassName}
  if inst:IsA("LuaSourceContainer") then
   local ok,src=pcall(function() return game:GetService("ScriptEditorService"):GetEditorSource(inst) end)
   if not ok then ok,src=pcall(function() return inst.Source end) end
   node.sourceReadable=ok
   if ok then
    node.sourceBytes=#src
    src=string.sub(src,1,200000)
    for ref in string.gmatch(src,"game%.[%w_%.]+") do if #edges<15000 then table.insert(edges,{from=p,to=ref,kind="static-reference"}) else truncated=true break end end
    for ref in string.gmatch(src,[[GetService%(["']([%w_]+)["']%)]]) do if #edges<15000 then table.insert(edges,{from=p,to="game."..ref,kind="service"}) else truncated=true break end end
   end
  end
  table.insert(nodes,node)
  if parent then table.insert(edges,{from=parent,to=p,kind="contains"}) end
  for _,c in ipairs(inst:GetChildren()) do if #nodes>=ARGS.max then truncated=true break end visit(c,p) end
 end
 visit(root,nil)
 return {nodes=nodes,edges=edges,truncated=truncated,continuous=false,scope=bw_path(root)}`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "source_read_guarded",
    description:
      "Read complete current editor source and class for a scoped script. Does not execute source. Maximum 200 KB.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: str } },
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)) },
          `local s=bw_must(ARGS.segs)
 assert(s:IsA("LuaSourceContainer"),"Target is not a script")
 local src=game:GetService("ScriptEditorService"):GetEditorSource(s)
 assert(#src<=200000,"Source exceeds editor limit")
 return {path=bw_path(s),className=s.ClassName,source=src,complete=true,bytes=#src}`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "source_patch_guarded",
    description:
      "Compare-and-swap complete editor source using ScriptEditorService. Saves a Studio-only scoped source checkpoint, preserves script identity/attributes. Rejects stale expected source. This is not an execution or full project rollback.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["path", "expected", "source"],
      properties: { path: str, expected: str, source: str },
    },
    async run(a, ctx) {
      for (const k of ["expected", "source"])
        if (typeof a[k] !== "string" || Buffer.byteLength(a[k] as string) > 200000)
          throw Error("Source must be a string up to 200 KB");
      const id = "cp_" + crypto.randomBytes(12).toString("hex");
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)), expected: a.expected, source: a.source, id },
          `local s=bw_must(ARGS.segs)
 assert(s:IsA("LuaSourceContainer"),"Target is not a script")
 local editor=game:GetService("ScriptEditorService")
 assert(editor:GetEditorSource(s)==ARGS.expected,"Conflict: editor source changed; reload")
 local ss=game:GetService("ServerStorage")
 local folder=ss:FindFirstChild("BrickwireSourceCheckpoints")
 if folder then assert(folder:IsA("Folder") and folder:GetAttribute("BrickwireSourceOwner")==1,"Checkpoint folder collision") else folder=Instance.new("Folder") folder.Name="BrickwireSourceCheckpoints" folder:SetAttribute("BrickwireSourceOwner",1) folder.Parent=ss end
 local cp=Instance.new("Folder") cp.Name=ARGS.id cp:SetAttribute("BrickwireSourceOwner",1)
 local target=Instance.new("ObjectValue") target.Name="Target" target.Value=s target.Parent=cp
 local before=Instance.new("StringValue") before.Name="Before" before.Value=ARGS.expected before.Parent=cp
 local after=Instance.new("StringValue") after.Name="After" after.Value=ARGS.source after.Parent=cp
 cp.Parent=folder
 local ok,err=pcall(function() editor:UpdateSourceAsync(s,function(current) assert(current==ARGS.expected,"Source changed during apply") return ARGS.source end) end)
 if not ok then cp:SetAttribute("AttemptFailed",true) error(tostring(err)) end
 local observed=editor:GetEditorSource(s)
 assert(observed==ARGS.source,"Patch sent but resulting editor source differs; inspect before retry")
 pcall(function() game:GetService("ChangeHistoryService"):SetWaypoint("Brickwire guarded source patch") end)
 return {path=bw_path(s),checkpoint=ARGS.id,verifiedSource=true,coverage="single script editor source only",runtimeTested=false}`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "source_checkpoints",
    description:
      "List only Brickwire-owned source checkpoints in the selected Studio. Coverage is source only.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", properties: {} },
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          {},
          `local folder=game:GetService("ServerStorage"):FindFirstChild("BrickwireSourceCheckpoints") local out={}
 if folder and folder:GetAttribute("BrickwireSourceOwner")==1 then for _,cp in ipairs(folder:GetChildren()) do if cp:GetAttribute("BrickwireSourceOwner")==1 and cp:FindFirstChild("Target") then table.insert(out,{id=cp.Name,path=cp.Target.Value and bw_path(cp.Target.Value) or "missing",restored=cp:GetAttribute("Restored")==true}) end end end
 return {checkpoints=out,coverage="editor source only; other objects and runtime effects excluded"}`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "source_restore_guarded",
    description:
      "Restore one owned source checkpoint ONLY if current source still equals its saved After value and target identity matches. Refuses overwriting later edits. Source-only recovery, not a project rollback.",
    risk: "destructive",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["checkpoint"], properties: { checkpoint: str } },
    async run(a, ctx) {
      if (!/^cp_[a-f0-9]{24}$/.test(String(a.checkpoint))) throw Error("Invalid checkpoint id");
      return ctx.runLuau(
        wrapLuau(
          { id: a.checkpoint },
          `local folder=game:GetService("ServerStorage"):FindFirstChild("BrickwireSourceCheckpoints")
 assert(folder and folder:GetAttribute("BrickwireSourceOwner")==1,"Checkpoints unavailable")
 local cp=folder:FindFirstChild(ARGS.id) assert(cp and cp:GetAttribute("BrickwireSourceOwner")==1,"Unknown checkpoint")
 assert(not cp:GetAttribute("Restored"),"Checkpoint already restored")
 local s=cp.Target.Value assert(s and s:IsDescendantOf(game),"Original script missing; no replacement by path")
 local editor=game:GetService("ScriptEditorService")
 assert(editor:GetEditorSource(s)==cp.After.Value,"Conflict: newer source exists; recovery refused")
 editor:UpdateSourceAsync(s,function(current) assert(current==cp.After.Value,"Concurrent edit; recovery refused") return cp.Before.Value end)
 assert(editor:GetEditorSource(s)==cp.Before.Value,"Recovery outcome unknown; inspect")
 cp:SetAttribute("Restored",true)
 return {path=bw_path(s),checkpoint=cp.Name,verifiedSource=true,runtimeTested=false}`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "vfx_timeline_build",
    description:
      "Build an original layered geometry/particles/light VFX template and runtime ModuleScript in ReplicatedStorage. No overwrite of unrelated objects. Preview separately in actual Studio. Ring is segmented geometry, not a mesh import.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["spec"],
      properties: { spec: { type: "object" }, replace: { type: "boolean" } },
    },
    async run(a, ctx) {
      const spec = validateVfx(a.spec);
      return ctx.runLuau(
        wrapLuau(
          { spec, json: JSON.stringify(spec), runtime: VFX_RUNTIME, replace: !!a.replace },
          `local rs=game:GetService("ReplicatedStorage")
 local folder=rs:FindFirstChild("BW_TimelineVFX")
 if folder then assert(folder:IsA("Folder") and folder:GetAttribute("BrickwireVfxOwner")==1,"VFX folder collision") else folder=Instance.new("Folder") folder.Name="BW_TimelineVFX" folder:SetAttribute("BrickwireVfxOwner",1) folder.Parent=rs end
 local old=folder:FindFirstChild(ARGS.spec.name)
 if old then assert(ARGS.replace and old:GetAttribute("BrickwireVfxOwner")==1,"Existing effect: explicit replace required, owned effects only") end
 local model=Instance.new("Folder") model.Name=ARGS.spec.name model:SetAttribute("BrickwireVfxOwner",1)
 local encoded=Instance.new("StringValue") encoded.Name="Spec" encoded.Value=ARGS.json encoded.Parent=model
 local layers=Instance.new("Folder") layers.Name="Layers" layers.Parent=model
 for i,l in ipairs(ARGS.spec.layers) do
  local layer=Instance.new("Folder") layer.Name=l.name layer:SetAttribute("LayerIndex",i) layer.Parent=layers
  local color=Color3.fromRGB(tonumber(string.sub(l.color,2,3),16),tonumber(string.sub(l.color,4,5),16),tonumber(string.sub(l.color,6,7),16))
  local function part(size,cf)
   local p=Instance.new("Part") p.Anchored=true p.CanCollide=false p.CanTouch=false p.CanQuery=false p.CastShadow=false p.Material=Enum.Material.Neon p.Color=color p.Size=size p.CFrame=cf p.Parent=layer return p
  end
  local offset=Vector3.new(unpack(l.offset))
  if l.type=="ring" then
   local segments=32 local rx=l.size[1]/2 local rz=l.size[3]/2
   for j=1,segments do local a=(j-1)*math.pi*2/segments local b=j*math.pi*2/segments local p0=offset+Vector3.new(rx*math.cos(a),0,rz*math.sin(a)) local p1=offset+Vector3.new(rx*math.cos(b),0,rz*math.sin(b)) part(Vector3.new(math.max(.05,l.size[2]),math.max(.05,l.size[2]),(p1-p0).Magnitude),CFrame.lookAt((p0+p1)/2,p1)) end
  else
   local p=part(Vector3.new(unpack(l.size)),CFrame.new(offset))
   if l.type=="sphere" then p.Shape=Enum.PartType.Ball end
   if l.type=="particles" or l.type=="light" then
    p.Transparency=1 p:SetAttribute("Helper",true)
    if l.type=="particles" then local attachment=Instance.new("Attachment") attachment.Parent=p local emitter=Instance.new("ParticleEmitter") emitter.Rate=0 emitter.Lifetime=NumberRange.new(l.duration) emitter.Speed=NumberRange.new(2,8) emitter.Transparency=NumberSequence.new(l.fromTransparency,l.toTransparency) emitter.Size=NumberSequence.new(l.size[1]*l.fromScale,l.size[1]*l.toScale) emitter.Color=ColorSequence.new(color) emitter.LightEmission=1 emitter.Parent=attachment else local light=Instance.new("PointLight") light.Color=color light.Brightness=l.brightness light.Range=math.clamp(l.size[1]*3,1,60) light.Parent=p end
   end
  end
 end
 local runtime=Instance.new("ModuleScript") runtime.Name="Runtime" runtime.Source=ARGS.runtime runtime.Parent=model
 if old then local backup=old:Clone() backup.Name=old.Name.."_"..tostring(os.time()) backup.Parent=game:GetService("ServerStorage") old:Destroy() end
 model.Parent=folder
 return {path=bw_path(model),runtime=bw_path(runtime),layers=#ARGS.spec.layers,duration=ARGS.spec.duration,previewed=false,visualVerified=false}`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "vfx_timeline_preview",
    description:
      "Actual Studio VFX preview: replay runtime, seek a geometric frame or reset owned preview. Seek does not simulate particles; explicitly inspect/screenshot Studio after invoking.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["name", "action"],
      properties: {
        name: str,
        action: { type: "string", enum: ["play", "seek", "reset"] },
        time: { type: "number" },
        position: { type: "array", items: { type: "number" } },
      },
    },
    async run(a, ctx) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,59}$/.test(String(a.name))) throw Error("Invalid effect name");
      const pos = a.position ?? [0, 5, 0];
      if (
        !Array.isArray(pos) ||
        pos.length !== 3 ||
        pos.some((n) => !Number.isFinite(n) || Math.abs(n) > 100000)
      )
        throw Error("Invalid position");
      const t = Number(a.time ?? 0);
      if (!Number.isFinite(t) || t < 0 || t > 60) throw Error("Invalid seek time");
      return ctx.runLuau(
        wrapLuau(
          { name: a.name, action: a.action, time: t, pos },
          `local folder=game:GetService("ReplicatedStorage"):FindFirstChild("BW_TimelineVFX") assert(folder and folder:GetAttribute("BrickwireVfxOwner")==1,"No owned VFX folder")
 local root=folder:FindFirstChild(ARGS.name) assert(root and root:GetAttribute("BrickwireVfxOwner")==1,"Effect not installed")
 local runtime=require(root.Runtime)
 if ARGS.action=="reset" then runtime.stop() return {reset=true} end
 local model=runtime.play(CFrame.new(unpack(ARGS.pos)),ARGS.action=="seek" and ARGS.time or nil)
 return {path=bw_path(model),action=ARGS.action,visualVerified=false,seekParticles=false}`,
        ),
        { readOnly: false },
      );
    },
  },
  {
    name: "rig_inspect",
    description:
      "Inspect actual rig Humanoid, Animator and Motor6D joint names. Does not assume R6/R15 compatibility.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: str } },
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          { segs: pathSegments(String(a.path)) },
          `local rig=bw_must(ARGS.segs) local joints={}
 for _,d in ipairs(rig:GetDescendants()) do if d:IsA("Motor6D") then table.insert(joints,{name=d.Name,part0=d.Part0 and d.Part0.Name,part1=d.Part1 and d.Part1.Name}) end end
 local humanoid=rig:FindFirstChildOfClass("Humanoid")
 return {path=bw_path(rig),joints=joints,rigType=humanoid and tostring(humanoid.RigType) or "custom",humanoid=humanoid~=nil,compatible=#joints>0}`,
        ),
        { readOnly: true },
      );
    },
  },
  {
    name: "animation_preview_actual",
    description:
      "Attempt real KeyframeSequence playback on an actual rig via KeyframeSequenceProvider and Animator. Reports unsupported permissions/API errors rather than fake playback. Generated animation must already exist. Stop explicitly after preview.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["rig", "sequence", "action"],
      properties: { rig: str, sequence: str, action: { type: "string", enum: ["play", "stop"] } },
    },
    async run(a, ctx) {
      return ctx.runLuau(
        wrapLuau(
          {
            rig: pathSegments(String(a.rig)),
            sequence: pathSegments(String(a.sequence)),
            action: a.action,
          },
          `local rig=bw_must(ARGS.rig)
 local controller=rig:FindFirstChildOfClass("Humanoid") or rig:FindFirstChildOfClass("AnimationController") assert(controller,"Rig lacks Humanoid/AnimationController")
 local animator=controller:FindFirstChildOfClass("Animator") assert(animator,"Rig lacks Animator; add explicitly before preview")
 if ARGS.action=="stop" then local stopped=0 for _,track in ipairs(animator:GetPlayingAnimationTracks()) do if track.Name=="BrickwirePreview" and track:GetAttribute("BrickwirePreviewOwner")==1 then track:Stop() stopped+=1 end end return {stopped=stopped} end
 local seq=bw_must(ARGS.sequence) assert(seq:IsA("KeyframeSequence"),"Expected KeyframeSequence")
 local valid={} for _,d in ipairs(rig:GetDescendants()) do if d:IsA("BasePart") then valid[d.Name]=true end end
 local missing={} for _,d in ipairs(seq:GetDescendants()) do if d:IsA("Pose") and d.Name~="HumanoidRootPart" and not valid[d.Name] then table.insert(missing,d.Name) end end
 assert(#missing==0,"Pose names incompatible with rig: "..table.concat(missing,","))
 local id=game:GetService("KeyframeSequenceProvider"):RegisterKeyframeSequence(seq)
 local animation=Instance.new("Animation") animation.AnimationId=id
 local track=animator:LoadAnimation(animation) track.Name="BrickwirePreview" track:SetAttribute("BrickwirePreviewOwner",1) track:Play()
 game:GetService("Debris"):AddItem(animation,5)
 return {rig=bw_path(rig),sequence=bw_path(seq),playing=track.IsPlaying,length=track.Length,visualVerified=false,temporaryRegistration=true}`,
        ),
        { readOnly: false },
      );
    },
  },
];
