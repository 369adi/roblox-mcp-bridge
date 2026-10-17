import { readAnimation } from "./studio2-tools.js";
import {
  JOINTS,
  normalize,
  analyze,
  generate,
  PRESETS,
  RIGS,
  toRobloxExport,
  type Animation,
} from "../../shared/src/studio2/animation.js";
import type { CompositeTool } from "./composites.js";
import { wrapLuau } from "./luau.js";
export function validateAnimation(v: any): Animation {
  if (
    !v ||
    !["R6", "R15"].includes(v.rig) ||
    !/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(v.name ?? "") ||
    !Number.isFinite(v.length) ||
    v.length < 0.05 ||
    v.length > 120 ||
    !Array.isArray(v.keyframes) ||
    !v.keyframes.length ||
    v.keyframes.length > 256
  )
    throw Error("Invalid animation: simple name, R6/R15, length .05–120s, 1–256 frames required");
  if (!["Core", "Idle", "Movement", "Action", "Action2", "Action3", "Action4"].includes(v.priority))
    throw Error("Invalid animation priority");
  const vec = (x: any, min: number, max: number) => {
    if (
      !Array.isArray(x) ||
      x.length !== 3 ||
      x.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < min || n > max)
    )
      throw Error("Invalid joint vector");
    return x;
  };
  const seen = new Set();
  const keyframes = v.keyframes.map((k: any) => {
    if (!Number.isFinite(k.t) || k.t < 0 || k.t > v.length || seen.has(k.t))
      throw Error("Frame times must be unique and within duration");
    seen.add(k.t);
    const rot: any = {},
      pos: any = {};
    for (const [j, x] of Object.entries(k.rot ?? {})) {
      if (!(JOINTS as readonly string[]).includes(j)) throw Error("Unknown joint");
      rot[j] = vec(x, -360, 360);
    }
    for (const [j, x] of Object.entries(k.pos ?? {})) {
      if (!(JOINTS as readonly string[]).includes(j)) throw Error("Unknown joint");
      pos[j] = vec(x, -100, 100);
    }
    if (
      !["Linear", "Constant", "Cubic", "Elastic", "Bounce"].includes(k.easing ?? "Linear") ||
      !["In", "Out", "InOut"].includes(k.direction ?? "InOut")
    )
      throw Error("Invalid easing");
    return { t: k.t, rot, pos, easing: k.easing ?? "Linear", direction: k.direction ?? "InOut" };
  });
  if (!Array.isArray(v.events ?? []) || (v.events ?? []).length > 64)
    throw Error("Event limit exceeded");
  const events = (v.events ?? []).map((m: any) => {
    if (
      !Number.isFinite(m.t) ||
      m.t < 0 ||
      m.t > v.length ||
      typeof m.name !== "string" ||
      !m.name ||
      m.name.length > 60 ||
      typeof (m.value ?? "") !== "string" ||
      (m.value ?? "").length > 200
    )
      throw Error("Invalid marker");
    return { t: m.t, name: m.name, value: m.value ?? "" };
  });
  return normalize({
    name: v.name,
    rig: v.rig,
    length: v.length,
    priority: v.priority,
    loop: !!v.loop,
    keyframes,
    events,
  } as Animation);
}
export function animationDraft(body: any) {
  const a = body.ir
    ? validateAnimation(body.ir)
    : validateAnimation(
        generate({
          name: body.name || "MotionStudy",
          rig: body.rig === "R6" ? "R6" : "R15",
          preset: body.preset || "idle",
        }).animation,
      );
  return {
    ir: a,
    quality: analyze(a),
    joints: JOINTS,
    presets: PRESETS.map((p) => ({ id: p.id, label: p.id })),
    studioVerified: false,
  };
}
export const ANIMATION_WORKSPACE_TOOLS: CompositeTool[] = [
  {
    name: "animation_timeline_read",
    description:
      "Read an actual KeyframeSequence into bounded validated timeline IR; does not run or edit it.",
    risk: "read",
    requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
    async run(a, ctx) {
      const out = await readAnimation(ctx, undefined, String(a.path));
      const ir = validateAnimation(out.animation);
      return {
        ...animationDraft({ ir }),
        path: out.path,
        source: out.source,
        verification: "observed sequence, not playback verification",
      };
    },
  },
  {
    name: "animation_timeline_build",
    description:
      "Build a validated edited timeline as an owned KeyframeSequence. Does not publish/play it; rejects foreign folder/name collisions. Explicit replacement preserves old owned sequence.",
    risk: "write",
    requires: ["execute_luau"],
    inputSchema: {
      type: "object",
      required: ["ir"],
      properties: { ir: { type: "object" }, replace: { type: "boolean" } },
    },
    async run(a, ctx) {
      const ir = validateAnimation(a.ir),
        ex = toRobloxExport(ir),
        parents: Record<string, string> = {};
      for (const j of Object.values(RIGS[ir.rig].joints)) if (j) parents[j.part] = j.parent;
      return ctx.runLuau(
        wrapLuau(
          { ex, parents, ir: JSON.stringify(ir), replace: a.replace === true },
          `local SS=game:GetService("ServerStorage") local f=SS:FindFirstChild("BrickwireTimelineAnimations")
 if f then assert(f:IsA("Folder") and f:GetAttribute("BrickwireTimelineOwner")==1,"Foreign animation folder collision") end
 if not f then f=Instance.new("Folder") f.Name="BrickwireTimelineAnimations" f:SetAttribute("BrickwireTimelineOwner",1) f.Parent=SS end
 local E=ARGS.ex local old=f:FindFirstChild(E.name) if old then assert(ARGS.replace and old:IsA("KeyframeSequence") and old:GetAttribute("BrickwireTimelineOwner")==1,"Sequence collision: explicit owned replacement required") end
 local seq=Instance.new("KeyframeSequence") seq.Name=E.name seq.Loop=E.loop seq.Priority=Enum.AnimationPriority[E.priority] seq:SetAttribute("BrickwireTimelineOwner",1) seq:SetAttribute("BrickwireIR",ARGS.ir) seq:SetAttribute("BrickwireRig",E.rig)
 local frames={} for _,k in ipairs(E.keyframes) do local frame=Instance.new("Keyframe") frame.Time=k.t local map={} local function ensure(part) if map[part] then return map[part] end local p=Instance.new("Pose") p.Name=part p.Weight=1 map[part]=p local parent=ARGS.parents[part] p.Parent=if parent then ensure(parent) else frame return p end ensure(E.rootPart) for _,ps in ipairs(k.poses) do local p=ensure(ps.part) p.CFrame=CFrame.new(table.unpack(ps.cf)) p.EasingStyle=Enum.PoseEasingStyle[k.style] p.EasingDirection=Enum.PoseEasingDirection[k.dir] end frame.Parent=seq table.insert(frames,frame) end
 for _,m in ipairs(E.markers) do local target=nil for _,frame in ipairs(frames) do if math.abs(frame.Time-m.t)<.001 then target=frame break end end if not target then target=Instance.new("Keyframe") target.Time=m.t target.Parent=seq end local marker=Instance.new("KeyframeMarker") marker.Name=m.name marker.Value=m.value or "" marker.Parent=target end
 if old then local h=Instance.new("Folder") h.Name="Backup_"..game:GetService("HttpService"):GenerateGUID(false) h:SetAttribute("BrickwireTimelineOwner",1) h.Parent=f old:Clone().Parent=h old:Destroy() end seq.Parent=f bw_waypoint("Brickwire timeline "..E.name) return{path=bw_path(seq),keyframes=#frames,rig=E.rig,visualVerified=false,published=false}`,
        ),
        { readOnly: false },
      );
    },
  },
];
