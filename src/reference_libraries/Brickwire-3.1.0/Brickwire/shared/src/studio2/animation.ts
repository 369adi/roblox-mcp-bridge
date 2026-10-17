/**
 * Brickwire Character Animation Generator (2.0).
 *
 * A REAL intermediate animation representation (IR) — not a video / GIF:
 *   Animation → Keyframes → per-joint Poses (character-space rotations in degrees + optional offsets) → Events
 * The IR is rig-agnostic (abstract joints). It is converted to Roblox Motor6D Transforms for a concrete rig
 * (R6 / R15, extensible through RIGS) and exported as a KeyframeSequence by bridge composites.
 *
 * Rotation convention (character space, degrees, Euler XYZ like CFrame.Angles):
 *   pitch (X) > 0 swings a down-pointing limb FORWARD (head/torso: tilt BACK)
 *   yaw   (Y) > 0 turns left (counter-clockwise seen from above)
 *   roll  (Z) > 0 moves a down-pointing limb to the character's RIGHT (+X)
 */

export const JOINTS = [
  "root", "waist", "head",
  "armL", "armR", "forearmL", "forearmR", "handL", "handR",
  "legL", "legR", "shinL", "shinR", "footL", "footR",
] as const;
export type Joint = (typeof JOINTS)[number];
export type Vec3 = [number, number, number];
export type RigType = "R6" | "R15";
export type EasingStyle = "Linear" | "Constant" | "Cubic" | "Elastic" | "Bounce";
export type EasingDirection = "In" | "Out" | "InOut";
export type AnimPriority = "Core" | "Idle" | "Movement" | "Action" | "Action2" | "Action3" | "Action4";

export interface AnimKeyframe {
  t: number;
  /** rotations per joint (deg) */
  rot: Partial<Record<Joint, Vec3>>;
  /** translation per joint (studs, character space) — normally only root */
  pos?: Partial<Record<Joint, Vec3>>;
  easing?: EasingStyle;
  direction?: EasingDirection;
}

export interface AnimEvent {
  t: number;
  name: string;
  value?: string;
}

export interface Animation {
  name: string;
  rig: RigType;
  length: number;
  loop: boolean;
  priority: AnimPriority;
  keyframes: AnimKeyframe[];
  events: AnimEvent[];
  meta?: { preset?: string; prompt?: string; category?: string; tags?: string[] };
}

export const MIRROR: Record<Joint, Joint> = {
  root: "root", waist: "waist", head: "head",
  armL: "armR", armR: "armL", forearmL: "forearmR", forearmR: "forearmL", handL: "handR", handR: "handL",
  legL: "legR", legR: "legL", shinL: "shinR", shinR: "shinL", footL: "footR", footR: "footL",
};

// ---------------------------------------------------------------- rigs

export interface RigJoint {
  part: string;
  parent: string;
  motor: string;
  /** rotation part of Motor6D.C0 as Euler XYZ degrees */
  c0: Vec3;
}
export interface RigDef {
  type: RigType;
  rootPart: string;
  joints: Partial<Record<Joint, RigJoint>>;
  /** abstract joints with no own part on this rig and where their motion goes (merged, scaled) */
  merge: Partial<Record<Joint, { into: Joint; weight: number }>>;
}

export const RIGS: Record<RigType, RigDef> = {
  R6: {
    type: "R6",
    rootPart: "HumanoidRootPart",
    joints: {
      root: { part: "Torso", parent: "HumanoidRootPart", motor: "RootJoint", c0: [-90, 0, 180] },
      head: { part: "Head", parent: "Torso", motor: "Neck", c0: [-90, 0, 180] },
      armR: { part: "Right Arm", parent: "Torso", motor: "Right Shoulder", c0: [0, 90, 0] },
      armL: { part: "Left Arm", parent: "Torso", motor: "Left Shoulder", c0: [0, -90, 0] },
      legR: { part: "Right Leg", parent: "Torso", motor: "Right Hip", c0: [0, 90, 0] },
      legL: { part: "Left Leg", parent: "Torso", motor: "Left Hip", c0: [0, -90, 0] },
    },
    merge: {
      waist: { into: "root", weight: 1 },
      forearmR: { into: "armR", weight: 0.35 },
      forearmL: { into: "armL", weight: 0.35 },
      shinR: { into: "legR", weight: 0.25 },
      shinL: { into: "legL", weight: 0.25 },
    },
  },
  R15: {
    type: "R15",
    rootPart: "HumanoidRootPart",
    joints: {
      root: { part: "LowerTorso", parent: "HumanoidRootPart", motor: "Root", c0: [0, 0, 0] },
      waist: { part: "UpperTorso", parent: "LowerTorso", motor: "Waist", c0: [0, 0, 0] },
      head: { part: "Head", parent: "UpperTorso", motor: "Neck", c0: [0, 0, 0] },
      armR: { part: "RightUpperArm", parent: "UpperTorso", motor: "RightShoulder", c0: [0, 0, 0] },
      armL: { part: "LeftUpperArm", parent: "UpperTorso", motor: "LeftShoulder", c0: [0, 0, 0] },
      forearmR: { part: "RightLowerArm", parent: "RightUpperArm", motor: "RightElbow", c0: [0, 0, 0] },
      forearmL: { part: "LeftLowerArm", parent: "LeftUpperArm", motor: "LeftElbow", c0: [0, 0, 0] },
      handR: { part: "RightHand", parent: "RightLowerArm", motor: "RightWrist", c0: [0, 0, 0] },
      handL: { part: "LeftHand", parent: "LeftLowerArm", motor: "LeftWrist", c0: [0, 0, 0] },
      legR: { part: "RightUpperLeg", parent: "LowerTorso", motor: "RightHip", c0: [0, 0, 0] },
      legL: { part: "LeftUpperLeg", parent: "LowerTorso", motor: "LeftHip", c0: [0, 0, 0] },
      shinR: { part: "RightLowerLeg", parent: "RightUpperLeg", motor: "RightKnee", c0: [0, 0, 0] },
      shinL: { part: "LeftLowerLeg", parent: "LeftUpperLeg", motor: "LeftKnee", c0: [0, 0, 0] },
      footR: { part: "RightFoot", parent: "RightLowerLeg", motor: "RightAnkle", c0: [0, 0, 0] },
      footL: { part: "LeftFoot", parent: "LeftLowerLeg", motor: "LeftAnkle", c0: [0, 0, 0] },
    },
    merge: {},
  },
};

// ---------------------------------------------------------------- math

type M3 = number[][];
const D = Math.PI / 180;
const rx = (a: number): M3 => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
const ry = (a: number): M3 => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
const rz = (a: number): M3 => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
export function mul(a: M3, b: M3): M3 {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}
export const transpose = (a: M3): M3 => [0, 1, 2].map((i) => [0, 1, 2].map((j) => a[j][i]));
const mv = (a: M3, v: Vec3): Vec3 => [0, 1, 2].map((i) => a[i][0] * v[0] + a[i][1] * v[1] + a[i][2] * v[2]) as Vec3;
/** CFrame.Angles(x, y, z) = Rx * Ry * Rz, degrees */
export const fromEuler = (e: Vec3): M3 => mul(mul(rx(e[0] * D), ry(e[1] * D)), rz(e[2] * D));
export function toEuler(m: M3): Vec3 {
  const sy = Math.max(-1, Math.min(1, m[0][2]));
  const y = Math.asin(sy);
  if (Math.abs(sy) < 0.99999) return [Math.atan2(-m[1][2], m[2][2]) / D, y / D, Math.atan2(-m[0][1], m[0][0]) / D];
  return [Math.atan2(m[2][1], m[1][1]) / D, y / D, 0]; // gimbal lock
}
const r4 = (n: number) => Math.round(n * 1e4) / 1e4;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Character-space rotation/offset → Motor6D.Transform (12 CFrame components, row-major). */
export function jointTransform(j: RigJoint, rot: Vec3, pos: Vec3 = [0, 0, 0]): number[] {
  const c0 = fromEuler(j.c0);
  const c0t = transpose(c0);
  const t = mul(mul(c0t, fromEuler(rot)), c0);
  const p = mv(c0t, pos);
  return [p[0], p[1], p[2], t[0][0], t[0][1], t[0][2], t[1][0], t[1][1], t[1][2], t[2][0], t[2][1], t[2][2]].map(r4);
}

/** Inverse of jointTransform: Motor6D.Transform → character-space rotation/offset. */
export function fromJointTransform(j: RigJoint, cf: number[]): { rot: Vec3; pos: Vec3 } {
  const c0 = fromEuler(j.c0);
  const t: M3 = [[cf[3], cf[4], cf[5]], [cf[6], cf[7], cf[8]], [cf[9], cf[10], cf[11]]];
  const rot = toEuler(mul(mul(c0, t), transpose(c0))).map(r2) as Vec3;
  const pos = mv(c0, [cf[0], cf[1], cf[2]]).map(r4) as Vec3;
  return { rot, pos };
}

// ---------------------------------------------------------------- helpers

const Z: Vec3 = [0, 0, 0];
const add = (a: Vec3, b: Vec3, w = 1): Vec3 => [a[0] + b[0] * w, a[1] + b[1] * w, a[2] + b[2] * w];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const dist = (a: Vec3, b: Vec3) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

function kf(t: number, rot: Partial<Record<Joint, Vec3>>, extra: Partial<AnimKeyframe> = {}): AnimKeyframe {
  return { t, rot, ...extra };
}

/** Joints that appear anywhere in the animation. */
export function usedJoints(a: Animation): Joint[] {
  const s = new Set<Joint>();
  for (const k of a.keyframes) {
    for (const j of Object.keys(k.rot)) s.add(j as Joint);
    for (const j of Object.keys(k.pos ?? {})) s.add(j as Joint);
  }
  return JOINTS.filter((j) => s.has(j));
}

/** Sort, dedupe, clamp to length and key every used joint in every keyframe (fill-forward / back). */
export function normalize(a: Animation): Animation {
  const out = clone(a);
  out.keyframes.sort((x, y) => x.t - y.t);
  const merged: AnimKeyframe[] = [];
  for (const k of out.keyframes) {
    k.t = r4(Math.max(0, k.t));
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.t - k.t) < 1e-3) {
      Object.assign(last.rot, k.rot);
      if (k.pos) last.pos = { ...(last.pos ?? {}), ...k.pos };
      if (k.easing) last.easing = k.easing;
      if (k.direction) last.direction = k.direction;
    } else merged.push(k);
  }
  out.keyframes = merged;
  out.length = r4(Math.max(out.length, merged.length ? merged[merged.length - 1].t : 0, 0.05));
  const joints = usedJoints(out);
  for (const j of joints) {
    const firstR = out.keyframes.find((k) => k.rot[j])?.rot[j] ?? Z;
    let prevR: Vec3 = firstR;
    for (const k of out.keyframes) {
      if (k.rot[j]) prevR = k.rot[j]!;
      else k.rot[j] = [...prevR] as Vec3;
    }
    const hasPos = out.keyframes.some((k) => k.pos?.[j]);
    if (hasPos) {
      let prevP: Vec3 = out.keyframes.find((k) => k.pos?.[j])?.pos?.[j] ?? Z;
      for (const k of out.keyframes) {
        k.pos = k.pos ?? {};
        if (k.pos[j]) prevP = k.pos[j]!;
        else k.pos[j] = [...prevP] as Vec3;
      }
    }
  }
  for (const k of out.keyframes) for (const j of Object.keys(k.rot) as Joint[]) k.rot[j] = k.rot[j]!.map(r2) as Vec3;
  out.events = [...out.events].filter((e) => e.t >= 0 && e.t <= out.length + 1e-6).sort((x, y) => x.t - y.t);
  return out;
}

// ---------------------------------------------------------------- presets

export interface PresetOpts {
  speed: number; // >1 faster
  intensity: number; // amplitude multiplier
  direction: "right_to_left" | "left_to_right" | "overhead" | "thrust";
  twoHanded: boolean;
}
const DEF: PresetOpts = { speed: 1, intensity: 1, direction: "right_to_left", twoHanded: false };

interface PresetInfo {
  id: string;
  category: "Movement" | "Combat" | "Emotes" | "Interaction" | "Tools" | "Weapons" | "Actions";
  loop: boolean;
  priority: AnimPriority;
  desc: string;
  words: string[];
  build(o: PresetOpts): { length: number; keyframes: AnimKeyframe[]; events?: AnimEvent[] };
}

const cycle = (len: number, frames: Array<[number, Partial<Record<Joint, Vec3>>, Partial<Record<Joint, Vec3>>?]>, ease: EasingStyle = "Cubic") =>
  frames.map(([p, rot, pos]) => kf(r4(p * len), rot, { pos, easing: ease, direction: "InOut" }));

function gait(len: number, swing: number, arm: number, knee: number, lean: number, bob: number) {
  const A = (s: number) => ({
    root: [0, 0, 0] as Vec3,
    waist: [-lean, s * 6, 0] as Vec3,
    head: [lean * 0.5, -s * 4, 0] as Vec3,
    armR: [-s * arm, 0, 6] as Vec3,
    armL: [s * arm, 0, -6] as Vec3,
    forearmR: [20 + Math.max(0, -s) * arm * 0.6, 0, 0] as Vec3,
    forearmL: [20 + Math.max(0, s) * arm * 0.6, 0, 0] as Vec3,
    legR: [s * swing, 0, 0] as Vec3,
    legL: [-s * swing, 0, 0] as Vec3,
    shinR: [-(s < 0 ? knee : knee * 0.15), 0, 0] as Vec3,
    shinL: [-(s > 0 ? knee : knee * 0.15), 0, 0] as Vec3,
  });
  const mid = (s: number) => ({ ...A(0), shinR: [s > 0 ? -knee : -knee * 0.3, 0, 0] as Vec3, shinL: [s > 0 ? -knee * 0.3 : -knee, 0, 0] as Vec3 });
  return cycle(len, [
    [0, A(1), { root: [0, 0, 0] }],
    [0.25, mid(-1), { root: [0, bob, 0] }],
    [0.5, A(-1), { root: [0, 0, 0] }],
    [0.75, mid(1), { root: [0, bob, 0] }],
    [1, A(1), { root: [0, 0, 0] }],
  ]);
}

function swordSwing(o: PresetOpts, heavy: boolean) {
  const i = o.intensity * (heavy ? 1.25 : 1);
  const L = (heavy ? 1.05 : 0.6) / o.speed;
  const dir = o.direction === "left_to_right" ? -1 : 1;
  const both = o.twoHanded;
  const overhead = o.direction === "overhead";
  const thrust = o.direction === "thrust";
  const wind: Partial<Record<Joint, Vec3>> = overhead
    ? { waist: [10, 0, 0], armR: [170 * i, 0, 10], forearmR: [40, 0, 0], legR: [-10, 0, 0], legL: [15, 0, 0] }
    : thrust
      ? { waist: [0, -25, 0], armR: [10, 0, 15], forearmR: [110, 0, 0], legR: [-15, 0, 0], legL: [20, 0, 0] }
      : { waist: [0, -40 * dir * i, 0], head: [0, 20 * dir, 0], armR: [100 * i, 50 * dir, 60 * dir], forearmR: [50, 0, 0], legR: [-15, 0, 0], legL: [20, 0, 0] };
  const strike: Partial<Record<Joint, Vec3>> = overhead
    ? { waist: [-25 * i, 0, 0], armR: [60, 0, 0], forearmR: [5, 0, 0], legR: [25, 0, 0], legL: [-15, 0, 0] }
    : thrust
      ? { waist: [-10, 25, 0], armR: [95, 0, 0], forearmR: [0, 0, 0], legR: [35, 0, 0], legL: [-25, 0, 0] }
      : { waist: [-10, 45 * dir * i, 0], head: [0, -15 * dir, 0], armR: [80, -40 * dir * i, -30 * dir], forearmR: [10, 0, 0], legR: [30, 0, 0], legL: [-20, 0, 0] };
  const follow: Partial<Record<Joint, Vec3>> = overhead
    ? { waist: [-30 * i, 0, 0], armR: [35, 0, -5], forearmR: [5, 0, 0], legR: [28, 0, 0], legL: [-18, 0, 0] }
    : { ...strike, waist: [-12, 55 * dir * i, 0], armR: [70, -60 * dir * i, -40 * dir] };
  const rest: Partial<Record<Joint, Vec3>> = { waist: [0, 0, 0], head: [0, 0, 0], armR: [20, 0, 10], forearmR: [30, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0] };
  const withL = (p: Partial<Record<Joint, Vec3>>) =>
    both ? { ...p, armL: [p.armR![0], -p.armR![1], -p.armR![2] * 0.4] as Vec3, forearmL: p.forearmR } : { ...p, armL: [10, 0, -10] as Vec3, forearmL: [25, 0, 0] as Vec3 };
  const tWind = (heavy ? 0.38 : 0.28) * L;
  const tStrike = (heavy ? 0.55 : 0.45) * L;
  const tFollow = (heavy ? 0.68 : 0.58) * L;
  const keyframes = [
    kf(0, withL(rest), { easing: "Cubic", direction: "Out" }),
    kf(tWind, withL(wind), { easing: "Cubic", direction: "In" }),
    kf(tStrike, withL(strike), { easing: "Cubic", direction: "Out", pos: { root: [0, heavy ? -0.4 : -0.2, thrust ? -0.8 : -0.4] } }),
    kf(tFollow, withL(follow), { easing: "Cubic", direction: "InOut" }),
    kf(L, withL(rest), { pos: { root: [0, 0, 0] } }),
  ];
  keyframes[0].pos = { root: [0, 0, 0] };
  keyframes[1].pos = { root: [0, 0, 0.1] };
  return {
    length: L,
    keyframes,
    events: [
      { t: r4(tWind), name: "AttackStart" },
      { t: r4((tWind + tStrike) / 2 + 0.01), name: "Hit" },
      { t: r4(tStrike), name: "VFX", value: heavy ? "heavy_slash" : "slash" },
      { t: r4(tFollow + (L - tFollow) * 0.5), name: "AttackEnd" },
    ],
  };
}

const P = (
  id: string, category: PresetInfo["category"], loop: boolean, priority: AnimPriority, desc: string, words: string[],
  build: PresetInfo["build"],
): PresetInfo => ({ id, category, loop, priority, desc, words, build });

export const PRESETS: PresetInfo[] = [
  P("idle", "Movement", true, "Idle", "breathing idle loop", ["idle", "stand", "breath", "стой", "idle", "покой", "дыхан"], (o) => {
    const L = 3 / o.speed, a = o.intensity;
    return { length: L, keyframes: cycle(L, [
      [0, { waist: [0, 0, 0], head: [0, 0, 0], armR: [0, 0, 4], armL: [0, 0, -4], forearmR: [8, 0, 0], forearmL: [8, 0, 0] }, { root: [0, 0, 0] }],
      [0.5, { waist: [-2.5 * a, 0, 0], head: [2 * a, 3 * a, 0], armR: [2 * a, 0, 7 * a], armL: [2 * a, 0, -7 * a], forearmR: [12, 0, 0], forearmL: [12, 0, 0] }, { root: [0, 0.05 * a, 0] }],
      [1, { waist: [0, 0, 0], head: [0, 0, 0], armR: [0, 0, 4], armL: [0, 0, -4], forearmR: [8, 0, 0], forearmL: [8, 0, 0] }, { root: [0, 0, 0] }],
    ], "Cubic") };
  }),
  P("walk", "Movement", true, "Movement", "walk cycle", ["walk", "ход", "шаг", "иди", "прогул"], (o) => {
    const L = 1 / o.speed;
    return { length: L, keyframes: gait(L, 30 * o.intensity, 28 * o.intensity, 45, 2, 0.12), events: [{ t: 0, name: "Footstep", value: "R" }, { t: r4(L / 2), name: "Footstep", value: "L" }] };
  }),
  P("run", "Movement", true, "Movement", "run cycle", ["run", "бег", "беж"], (o) => {
    const L = 0.66 / o.speed;
    return { length: L, keyframes: gait(L, 55 * o.intensity, 60 * o.intensity, 85, 10, 0.3), events: [{ t: 0, name: "Footstep", value: "R" }, { t: r4(L / 2), name: "Footstep", value: "L" }] };
  }),
  P("sprint", "Movement", true, "Movement", "fast sprint with strong lean", ["sprint", "спринт", "рывок"], (o) => {
    const L = 0.5 / o.speed;
    return { length: L, keyframes: gait(L, 70 * o.intensity, 80 * o.intensity, 105, 20, 0.35), events: [{ t: 0, name: "Footstep", value: "R" }, { t: r4(L / 2), name: "Footstep", value: "L" }] };
  }),
  P("crouch", "Movement", true, "Movement", "crouch walk", ["crouch", "sneak", "присед", "красться", "на корточ"], (o) => {
    const L = 1.2 / o.speed;
    const kfs = gait(L, 25 * o.intensity, 15, 70, 25, 0.05);
    for (const k of kfs) {
      k.rot.legR = add(k.rot.legR ?? Z, [40, 0, 0]);
      k.rot.legL = add(k.rot.legL ?? Z, [40, 0, 0]);
      k.rot.shinR = add(k.rot.shinR ?? Z, [-30, 0, 0]);
      k.rot.shinL = add(k.rot.shinL ?? Z, [-30, 0, 0]);
      k.pos = { root: add(k.pos?.root ?? Z, [0, -0.9, 0]) };
    }
    return { length: L, keyframes: kfs };
  }),
  P("jump", "Movement", false, "Movement", "jump take-off", ["jump", "прыж", "прыг"], (o) => {
    const L = 0.45 / o.speed, a = o.intensity;
    return { length: L, keyframes: [
      kf(0, { waist: [-10, 0, 0], armR: [-20, 0, 10], armL: [-20, 0, -10], legR: [30, 0, 0], legL: [30, 0, 0], shinR: [-50, 0, 0], shinL: [-50, 0, 0] }, { pos: { root: [0, -0.5, 0] }, easing: "Cubic", direction: "Out" }),
      kf(L * 0.4, { waist: [5, 0, 0], armR: [150 * a, 0, 25], armL: [150 * a, 0, -25], legR: [-5, 0, 0], legL: [10, 0, 0], shinR: [-5, 0, 0], shinL: [-20, 0, 0] }, { pos: { root: [0, 0.2, 0] } }),
      kf(L, { waist: [0, 0, 0], armR: [120, 0, 35], armL: [120, 0, -35], legR: [20, 0, 0], legL: [35, 0, 0], shinR: [-30, 0, 0], shinL: [-60, 0, 0] }, { pos: { root: [0, 0, 0] } }),
    ] };
  }),
  P("fall", "Movement", true, "Movement", "falling loop, arms flailing", ["fall", "паден", "пада"], (o) => {
    const L = 0.8 / o.speed;
    return { length: L, keyframes: cycle(L, [
      [0, { armR: [110, 0, 70], armL: [110, 0, -70], legR: [20, 0, 0], legL: [-10, 0, 0], shinR: [-30, 0, 0], shinL: [-20, 0, 0] }],
      [0.5, { armR: [130, 0, 85], armL: [130, 0, -85], legR: [-10, 0, 0], legL: [20, 0, 0], shinR: [-20, 0, 0], shinL: [-30, 0, 0] }],
      [1, { armR: [110, 0, 70], armL: [110, 0, -70], legR: [20, 0, 0], legL: [-10, 0, 0], shinR: [-30, 0, 0], shinL: [-20, 0, 0] }],
    ]) };
  }),
  P("land", "Movement", false, "Movement", "landing absorb", ["land", "приземл"], (o) => {
    const L = 0.35 / o.speed;
    return { length: L, keyframes: [
      kf(0, { waist: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], shinR: [0, 0, 0], shinL: [0, 0, 0], armR: [40, 0, 30], armL: [40, 0, -30] }, { pos: { root: [0, 0, 0] } }),
      kf(L * 0.35, { waist: [-20, 0, 0], legR: [55, 0, 0], legL: [55, 0, 0], shinR: [-90, 0, 0], shinL: [-90, 0, 0], armR: [30, 0, 20], armL: [30, 0, -20] }, { pos: { root: [0, -0.9, 0] }, easing: "Cubic", direction: "Out" }),
      kf(L, { waist: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], shinR: [0, 0, 0], shinL: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5] }, { pos: { root: [0, 0, 0] } }),
    ], events: [{ t: r4(L * 0.35), name: "Footstep", value: "land" }] };
  }),
  P("climb", "Movement", true, "Movement", "ladder climb", ["climb", "лаз", "карабк", "лестниц"], (o) => {
    const L = 0.9 / o.speed;
    const a = (s: number) => ({ armR: [150 + s * 20, 0, 10] as Vec3, armL: [150 - s * 20, 0, -10] as Vec3, forearmR: [40 - s * 30, 0, 0] as Vec3, forearmL: [40 + s * 30, 0, 0] as Vec3, legR: [40 - s * 30, 0, 0] as Vec3, legL: [40 + s * 30, 0, 0] as Vec3, shinR: [-60 + s * 40, 0, 0] as Vec3, shinL: [-60 - s * 40, 0, 0] as Vec3 });
    return { length: L, keyframes: cycle(L, [[0, a(1)], [0.5, a(-1)], [1, a(1)]]) };
  }),
  P("swim", "Movement", true, "Movement", "front-crawl swim", ["swim", "плав", "плыв"], (o) => {
    const L = 1.2 / o.speed;
    return { length: L, keyframes: cycle(L, [
      [0, { root: [-80, 0, 0], armR: [180, 0, 0], armL: [0, 0, 0], legR: [15, 0, 0], legL: [-15, 0, 0] }],
      [0.5, { root: [-80, 0, 0], armR: [0, 0, 0], armL: [180, 0, 0], legR: [-15, 0, 0], legL: [15, 0, 0] }],
      [1, { root: [-80, 0, 0], armR: [180, 0, 0], armL: [0, 0, 0], legR: [15, 0, 0], legL: [-15, 0, 0] }],
    ], "Linear") };
  }),
  P("sit", "Actions", true, "Action", "seated pose", ["sit", "сид", "сесть", "сяд"], () => ({ length: 1, keyframes: [
    kf(0, { legR: [90, 0, 0], legL: [90, 0, 0], shinR: [-90, 0, 0], shinL: [-90, 0, 0], armR: [30, 0, 5], armL: [30, 0, -5], forearmR: [30, 0, 0], forearmL: [30, 0, 0] }),
    kf(1, { legR: [90, 0, 0], legL: [90, 0, 0], shinR: [-90, 0, 0], shinL: [-90, 0, 0], armR: [30, 0, 5], armL: [30, 0, -5], forearmR: [30, 0, 0], forearmL: [30, 0, 0] }),
  ] })),
  P("wave", "Emotes", false, "Action", "friendly wave / greeting", ["wave", "hello", "greet", "привет", "помах", "маш"], (o) => {
    const L = 1.8 / o.speed, a = o.intensity;
    const up = (s: number): Partial<Record<Joint, Vec3>> => ({ armR: [20, 0, 150], forearmR: [0, 0, 25 * s * a], handR: [0, 0, 10 * s], head: [0, -10, 5] });
    return { length: L, keyframes: [
      kf(0, { armR: [0, 0, 5], forearmR: [10, 0, 0], handR: [0, 0, 0], head: [0, 0, 0] }, { easing: "Cubic", direction: "Out" }),
      kf(L * 0.2, up(1)), kf(L * 0.35, up(-1)), kf(L * 0.5, up(1)), kf(L * 0.65, up(-1)),
      kf(L * 0.8, up(0), { easing: "Cubic", direction: "In" }),
      kf(L, { armR: [0, 0, 5], forearmR: [10, 0, 0], handR: [0, 0, 0], head: [0, 0, 0] }),
    ] };
  }),
  P("cheer", "Emotes", false, "Action", "both arms up cheer", ["cheer", "victory", "win", "побед", "ура", "радост"], (o) => {
    const L = 1.2 / o.speed;
    return { length: L, keyframes: [
      kf(0, { armR: [0, 0, 5], armL: [0, 0, -5], head: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
      kf(L * 0.3, { armR: [20, 0, 160], armL: [20, 0, -160], head: [15, 0, 0] }, { pos: { root: [0, 0.4, 0] }, easing: "Bounce", direction: "Out" }),
      kf(L * 0.6, { armR: [20, 0, 145], armL: [20, 0, -145], head: [10, 0, 0] }, { pos: { root: [0, 0, 0] } }),
      kf(L, { armR: [0, 0, 5], armL: [0, 0, -5], head: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
    ] };
  }),
  P("dance", "Emotes", true, "Action", "simple groove dance loop", ["dance", "танц", "пляс"], (o) => {
    const L = 1 / o.speed, a = o.intensity;
    const s = (d: number): Partial<Record<Joint, Vec3>> => ({ waist: [0, 15 * d * a, 8 * d * a], head: [0, -10 * d, -8 * d], armR: [60, 0, 40 + 30 * d], armL: [60, 0, -40 + 30 * d], forearmR: [70, 0, 0], forearmL: [70, 0, 0], legR: [d > 0 ? 25 : 0, 0, 0], legL: [d < 0 ? 25 : 0, 0, 0], shinR: [d > 0 ? -40 : 0, 0, 0], shinL: [d < 0 ? -40 : 0, 0, 0] });
    return { length: L, keyframes: cycle(L, [[0, s(1), { root: [0, 0, 0] }], [0.25, s(0), { root: [0, -0.3, 0] }], [0.5, s(-1), { root: [0, 0, 0] }], [0.75, s(0), { root: [0, -0.3, 0] }], [1, s(1), { root: [0, 0, 0] }]]) };
  }),
  P("point", "Emotes", false, "Action", "point forward", ["point", "указ"], (o) => {
    const L = 1.2 / o.speed;
    return { length: L, keyframes: [kf(0, { armR: [0, 0, 5], forearmR: [10, 0, 0] }), kf(L * 0.3, { armR: [90, 0, 0], forearmR: [0, 0, 0] }, { easing: "Cubic", direction: "Out" }), kf(L * 0.75, { armR: [90, 0, 0], forearmR: [0, 0, 0] }), kf(L, { armR: [0, 0, 5], forearmR: [10, 0, 0] })] };
  }),
  P("punch", "Combat", false, "Action", "jab punch", ["punch", "jab", "удар рук", "кулак", "панч"], (o) => {
    const L = 0.5 / o.speed, a = o.intensity;
    return { length: L, keyframes: [
      kf(0, { waist: [0, 0, 0], armR: [40, 0, 15], forearmR: [110, 0, 0], armL: [40, 0, -15], forearmL: [110, 0, 0] }),
      kf(L * 0.25, { waist: [0, 15, 0], armR: [30, 0, 20], forearmR: [130, 0, 0] }, { easing: "Cubic", direction: "In" }),
      kf(L * 0.45, { waist: [-5, -30 * a, 0], armR: [90, 0, -5], forearmR: [0, 0, 0] }, { easing: "Cubic", direction: "Out", pos: { root: [0, 0, -0.3] } }),
      kf(L, { waist: [0, 0, 0], armR: [40, 0, 15], forearmR: [110, 0, 0] }, { pos: { root: [0, 0, 0] } }),
    ], events: [{ t: r4(L * 0.25), name: "AttackStart" }, { t: r4(L * 0.45), name: "Hit" }, { t: r4(L * 0.8), name: "AttackEnd" }] };
  }),
  P("kick", "Combat", false, "Action", "front kick", ["kick", "пинок", "удар ног", "пнуть"], (o) => {
    const L = 0.7 / o.speed, a = o.intensity;
    return { length: L, keyframes: [
      kf(0, { legR: [0, 0, 0], shinR: [0, 0, 0], waist: [0, 0, 0], armR: [20, 0, 20], armL: [20, 0, -20] }),
      kf(L * 0.3, { legR: [70, 0, 0], shinR: [-100, 0, 0], waist: [8, 0, 0] }, { easing: "Cubic", direction: "In" }),
      kf(L * 0.5, { legR: [95 * a, 0, 0], shinR: [0, 0, 0], waist: [15, 0, 0], armR: [40, 0, 45], armL: [40, 0, -45] }, { easing: "Cubic", direction: "Out" }),
      kf(L, { legR: [0, 0, 0], shinR: [0, 0, 0], waist: [0, 0, 0], armR: [20, 0, 20], armL: [20, 0, -20] }),
    ], events: [{ t: r4(L * 0.3), name: "AttackStart" }, { t: r4(L * 0.5), name: "Hit" }, { t: r4(L * 0.8), name: "AttackEnd" }] };
  }),
  P("sword_attack", "Weapons", false, "Action", "sword slash (direction: right_to_left | left_to_right | overhead | thrust)", ["sword", "slash", "меч", "рубан", "взмах", "атак", "attack", "удар"], (o) => swordSwing(o, false)),
  P("heavy_attack", "Weapons", false, "Action2", "heavy two-step attack with long anticipation", ["heavy", "мощн", "тяжел", "сильн"], (o) => swordSwing({ ...o, twoHanded: true }, true)),
  P("combo3", "Weapons", false, "Action", "3-hit sword combo", ["combo", "комбо", "серия"], (o) => {
    const a = swordSwing({ ...o, direction: "right_to_left" }, false);
    const b = swordSwing({ ...o, direction: "left_to_right" }, false);
    const c = swordSwing({ ...o, direction: "overhead" }, true);
    const keyframes: AnimKeyframe[] = [];
    const events: AnimEvent[] = [];
    let off = 0;
    for (const [n, part] of [a, b, c].entries()) {
      const ks = n === 0 ? part.keyframes : part.keyframes.slice(1);
      for (const k of ks.slice(0, n === 2 ? undefined : -1)) keyframes.push({ ...clone(k), t: r4(k.t + off) });
      for (const e of part.events ?? []) events.push({ ...e, t: r4(e.t + off), value: e.name === "Hit" ? `hit${n + 1}` : e.value });
      off += part.keyframes[part.keyframes.length - 2].t + (n === 2 ? 0 : 0.05);
    }
    return { length: keyframes[keyframes.length - 1].t, keyframes, events };
  }),
  P("block", "Combat", true, "Action", "guard / block hold", ["block", "guard", "блок", "защит"], () => ({ length: 1, keyframes: [
    kf(0, { waist: [-5, 0, 0], armR: [80, 0, -40], forearmR: [100, 0, 0], armL: [80, 0, 40], forearmL: [100, 0, 0], legR: [15, 0, 0], legL: [-10, 0, 0], shinR: [-20, 0, 0] }),
    kf(1, { waist: [-5, 0, 0], armR: [80, 0, -40], forearmR: [100, 0, 0], armL: [80, 0, 40], forearmL: [100, 0, 0], legR: [15, 0, 0], legL: [-10, 0, 0], shinR: [-20, 0, 0] }),
  ] })),
  P("dodge", "Combat", false, "Action2", "side dodge step", ["dodge", "уклон", "увор", "отскок"], (o) => {
    const L = 0.45 / o.speed;
    return { length: L, keyframes: [
      kf(0, { waist: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
      kf(L * 0.4, { waist: [-10, 0, 25], legR: [0, 0, 30], legL: [0, 0, 10], armR: [30, 0, 50], armL: [30, 0, -20] }, { pos: { root: [1.2, -0.4, 0] }, easing: "Cubic", direction: "Out" }),
      kf(L, { waist: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5] }, { pos: { root: [0, 0, 0] } }),
    ] };
  }),
  P("roll", "Combat", false, "Action2", "forward roll", ["roll", "кувыр", "перекат"], (o) => {
    const L = 0.7 / o.speed;
    const tuck: Partial<Record<Joint, Vec3>> = { legR: [100, 0, 0], legL: [100, 0, 0], shinR: [-120, 0, 0], shinL: [-120, 0, 0], armR: [90, 0, 0], armL: [90, 0, 0], head: [-30, 0, 0] };
    return { length: L, keyframes: [
      kf(0, { root: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], shinR: [0, 0, 0], shinL: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5], head: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
      kf(L * 0.25, { ...tuck, root: [-120, 0, 0] }, { pos: { root: [0, -1.2, -1.5] } }),
      kf(L * 0.5, { ...tuck, root: [-240, 0, 0] }, { pos: { root: [0, -1.4, -3] } }),
      kf(L * 0.75, { ...tuck, root: [-330, 0, 0] }, { pos: { root: [0, -0.8, -4] } }),
      kf(L, { root: [-360, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], shinR: [0, 0, 0], shinL: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5], head: [0, 0, 0] }, { pos: { root: [0, 0, -4.5] } }),
    ] };
  }),
  P("hurt", "Combat", false, "Action3", "hit reaction", ["hurt", "hit react", "получ", "урон", "больно"], (o) => {
    const L = 0.5 / o.speed, a = o.intensity;
    return { length: L, keyframes: [
      kf(0, { waist: [0, 0, 0], head: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5] }),
      kf(L * 0.2, { waist: [20 * a, 10, 0], head: [25 * a, 0, 0], armR: [30, 0, 40], armL: [30, 0, -40] }, { easing: "Cubic", direction: "Out", pos: { root: [0, 0, 0.4] } }),
      kf(L, { waist: [0, 0, 0], head: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5] }, { pos: { root: [0, 0, 0] } }),
    ] };
  }),
  P("knockback", "Combat", false, "Action3", "strong knockback stagger", ["knockback", "отброс", "отлет"], (o) => {
    const L = 0.9 / o.speed;
    return { length: L, keyframes: [
      kf(0, { root: [0, 0, 0], waist: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5], legR: [0, 0, 0], legL: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
      kf(L * 0.25, { root: [25, 0, 0], waist: [25, 0, 0], armR: [70, 0, 60], armL: [70, 0, -60], legR: [40, 0, 0], legL: [20, 0, 0] }, { pos: { root: [0, 0.4, 2] }, easing: "Cubic", direction: "Out" }),
      kf(L * 0.6, { root: [10, 0, 0], waist: [10, 0, 0], armR: [40, 0, 40], armL: [40, 0, -40], legR: [30, 0, 0], legL: [-10, 0, 0] }, { pos: { root: [0, -0.3, 3] } }),
      kf(L, { root: [0, 0, 0], waist: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5], legR: [0, 0, 0], legL: [0, 0, 0] }, { pos: { root: [0, 0, 3] } }),
    ] };
  }),
  P("death", "Combat", false, "Action4", "fall backward death", ["death", "die", "смерт", "умир", "гибел"], (o) => {
    const L = 1.4 / o.speed;
    return { length: L, keyframes: [
      kf(0, { root: [0, 0, 0], head: [0, 0, 0], armR: [0, 0, 5], armL: [0, 0, -5], legR: [0, 0, 0], legL: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
      kf(L * 0.3, { root: [15, 0, 0], head: [30, 0, 0], armR: [60, 0, 50], armL: [60, 0, -50], legR: [30, 0, 0], legL: [10, 0, 0] }, { pos: { root: [0, -0.4, 0.5] } }),
      kf(L * 0.75, { root: [85, 0, 5], head: [10, 20, 0], armR: [10, 0, 80], armL: [10, 0, -70], legR: [20, 0, 10], legL: [5, 0, -5] }, { pos: { root: [0, -2.3, 2] }, easing: "Bounce", direction: "Out" }),
      kf(L, { root: [90, 0, 5], head: [5, 25, 0], armR: [0, 0, 85], armL: [0, 0, -75], legR: [15, 0, 10], legL: [0, 0, -5] }, { pos: { root: [0, -2.5, 2] } }),
    ] };
  }),
  P("equip", "Tools", false, "Action", "draw weapon from back", ["equip", "достать", "экипир", "вынуть"], (o) => {
    const L = 0.6 / o.speed;
    return { length: L, keyframes: [kf(0, { armR: [0, 0, 5], forearmR: [10, 0, 0] }), kf(L * 0.45, { armR: [170, 0, 20], forearmR: [80, 0, 0] }, { easing: "Cubic", direction: "Out" }), kf(L, { armR: [40, 0, 10], forearmR: [60, 0, 0] })], events: [{ t: r4(L * 0.45), name: "Equip" }] };
  }),
  P("unequip", "Tools", false, "Action", "sheathe weapon", ["unequip", "убрать", "спрятать"], (o) => {
    const L = 0.6 / o.speed;
    return { length: L, keyframes: [kf(0, { armR: [40, 0, 10], forearmR: [60, 0, 0] }), kf(L * 0.5, { armR: [170, 0, 20], forearmR: [80, 0, 0] }), kf(L, { armR: [0, 0, 5], forearmR: [10, 0, 0] })], events: [{ t: r4(L * 0.5), name: "Unequip" }] };
  }),
  P("shoot", "Weapons", false, "Action", "pistol shot with recoil", ["shoot", "fire gun", "стрел", "выстрел", "пистолет"], (o) => {
    const L = 0.35 / o.speed;
    return { length: L, keyframes: [
      kf(0, { armR: [90, 0, 0], forearmR: [0, 0, 0], armL: [80, 0, 30], forearmL: [30, 0, 0], head: [0, 0, 0] }),
      kf(L * 0.15, { armR: [110 * o.intensity, 0, 0], forearmR: [15, 0, 0], armL: [95, 0, 30], head: [5, 0, 0] }, { easing: "Cubic", direction: "Out" }),
      kf(L, { armR: [90, 0, 0], forearmR: [0, 0, 0], armL: [80, 0, 30], forearmL: [30, 0, 0], head: [0, 0, 0] }),
    ], events: [{ t: 0, name: "Shoot" }, { t: 0, name: "VFX", value: "muzzle_flash" }] };
  }),
  P("reload", "Weapons", false, "Action", "magazine reload", ["reload", "перезаряд"], (o) => {
    const L = 1.3 / o.speed;
    return { length: L, keyframes: [
      kf(0, { armR: [70, 0, 0], forearmR: [20, 0, 0], armL: [60, 0, 30], forearmL: [40, 0, 0] }),
      kf(L * 0.3, { armR: [50, 0, -20], forearmR: [50, 0, 0], armL: [10, 0, 10], forearmL: [80, 0, 0] }),
      kf(L * 0.6, { armR: [50, 0, -20], forearmR: [50, 0, 0], armL: [55, 0, 35], forearmL: [70, 0, 0] }),
      kf(L, { armR: [70, 0, 0], forearmR: [20, 0, 0], armL: [60, 0, 30], forearmL: [40, 0, 0] }),
    ], events: [{ t: r4(L * 0.3), name: "Sound", value: "mag_out" }, { t: r4(L * 0.6), name: "Sound", value: "mag_in" }] };
  }),
  P("throw", "Actions", false, "Action", "overhand throw", ["throw", "брос", "кинуть", "кидать"], (o) => {
    const L = 0.7 / o.speed;
    return { length: L, keyframes: [
      kf(0, { waist: [0, 0, 0], armR: [0, 0, 5], forearmR: [10, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0] }),
      kf(L * 0.4, { waist: [10, -30, 0], armR: [160, 0, 30], forearmR: [90, 0, 0], legR: [-15, 0, 0], legL: [20, 0, 0] }, { easing: "Cubic", direction: "In" }),
      kf(L * 0.6, { waist: [-15, 25 * o.intensity, 0], armR: [70, 0, -10], forearmR: [0, 0, 0], legR: [25, 0, 0], legL: [-15, 0, 0] }, { easing: "Cubic", direction: "Out" }),
      kf(L, { waist: [0, 0, 0], armR: [0, 0, 5], forearmR: [10, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0] }),
    ], events: [{ t: r4(L * 0.55), name: "Release" }] };
  }),
  P("cast_spell", "Actions", false, "Action", "two-hand spell cast", ["cast", "spell", "magic", "заклин", "магия", "каст", "колдов"], (o) => {
    const L = 1.1 / o.speed;
    return { length: L, keyframes: [
      kf(0, { armR: [0, 0, 5], armL: [0, 0, -5], forearmR: [10, 0, 0], forearmL: [10, 0, 0], waist: [0, 0, 0] }),
      kf(L * 0.45, { armR: [40, 0, -10], armL: [40, 0, 10], forearmR: [100, 0, 0], forearmL: [100, 0, 0], waist: [10, 0, 0] }, { easing: "Cubic", direction: "InOut" }),
      kf(L * 0.6, { armR: [95 * o.intensity, 0, -5], armL: [95 * o.intensity, 0, 5], forearmR: [0, 0, 0], forearmL: [0, 0, 0], waist: [-10, 0, 0] }, { easing: "Cubic", direction: "Out", pos: { root: [0, 0, -0.2] } }),
      kf(L, { armR: [0, 0, 5], armL: [0, 0, -5], forearmR: [10, 0, 0], forearmL: [10, 0, 0], waist: [0, 0, 0] }, { pos: { root: [0, 0, 0] } }),
    ], events: [{ t: r4(L * 0.45), name: "VFX", value: "charge" }, { t: r4(L * 0.6), name: "Cast" }] };
  }),
  P("interact", "Interaction", false, "Action", "reach & press / use", ["interact", "press", "use", "взаимод", "нажать", "открыть"], (o) => {
    const L = 0.8 / o.speed;
    return { length: L, keyframes: [kf(0, { armR: [0, 0, 5], forearmR: [10, 0, 0] }), kf(L * 0.45, { armR: [80, 0, 0], forearmR: [20, 0, 0], handR: [-20, 0, 0] }, { easing: "Cubic", direction: "Out" }), kf(L, { armR: [0, 0, 5], forearmR: [10, 0, 0], handR: [0, 0, 0] })], events: [{ t: r4(L * 0.45), name: "Interact" }] };
  }),
  P("pickup", "Interaction", false, "Action", "bend down and pick up", ["pick up", "pickup", "подобрать", "поднять"], (o) => {
    const L = 1 / o.speed;
    const down: Partial<Record<Joint, Vec3>> = { waist: [-45, 0, 0], armR: [60, 0, 0], forearmR: [20, 0, 0], legR: [50, 0, 0], legL: [50, 0, 0], shinR: [-80, 0, 0], shinL: [-80, 0, 0] };
    const up: Partial<Record<Joint, Vec3>> = { waist: [0, 0, 0], armR: [0, 0, 5], forearmR: [10, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0], shinR: [0, 0, 0], shinL: [0, 0, 0] };
    return { length: L, keyframes: [kf(0, up, { pos: { root: [0, 0, 0] } }), kf(L * 0.45, down, { pos: { root: [0, -1, 0] } }), kf(L, up, { pos: { root: [0, 0, 0] } })], events: [{ t: r4(L * 0.45), name: "Pickup" }] };
  }),
  P("mining", "Tools", true, "Action", "pickaxe swing loop", ["mine", "mining", "pickaxe", "кирк", "копа", "добыч", "шахт"], (o) => {
    const L = 0.9 / o.speed;
    return { length: L, keyframes: [
      kf(0, { waist: [0, 0, 0], armR: [60, 0, 0], armL: [55, 0, 0], forearmR: [20, 0, 0], forearmL: [20, 0, 0] }),
      kf(L * 0.5, { waist: [10, 0, 0], armR: [170, 0, 0], armL: [165, 0, 0], forearmR: [40, 0, 0], forearmL: [40, 0, 0] }, { easing: "Cubic", direction: "In" }),
      kf(L * 0.72, { waist: [-30 * o.intensity, 0, 0], armR: [55, 0, 0], armL: [50, 0, 0], forearmR: [5, 0, 0], forearmL: [5, 0, 0] }, { easing: "Cubic", direction: "Out" }),
      kf(L, { waist: [0, 0, 0], armR: [60, 0, 0], armL: [55, 0, 0], forearmR: [20, 0, 0], forearmL: [20, 0, 0] }),
    ], events: [{ t: r4(L * 0.72), name: "Hit", value: "mine" }] };
  }),
  P("farming", "Tools", true, "Action", "hoe/till loop", ["farm", "hoe", "ферм", "грядк", "мотыг", "вспах"], (o) => {
    const L = 1.1 / o.speed;
    return { length: L, keyframes: [
      kf(0, { waist: [-15, 0, 0], armR: [70, 0, 0], armL: [80, 0, 0], forearmR: [30, 0, 0] }),
      kf(L * 0.5, { waist: [0, 0, 0], armR: [130, 0, 0], armL: [130, 0, 0], forearmR: [40, 0, 0] }),
      kf(L * 0.75, { waist: [-30, 0, 0], armR: [50, 0, 0], armL: [60, 0, 0], forearmR: [10, 0, 0] }, { easing: "Cubic", direction: "Out" }),
      kf(L, { waist: [-15, 0, 0], armR: [70, 0, 0], armL: [80, 0, 0], forearmR: [30, 0, 0] }),
    ], events: [{ t: r4(L * 0.75), name: "Hit", value: "till" }] };
  }),
  P("fishing", "Tools", false, "Action", "rod cast", ["fish", "рыбал", "удочк", "заброс"], (o) => {
    const L = 1.2 / o.speed;
    return { length: L, keyframes: [
      kf(0, { armR: [60, 0, 0], forearmR: [30, 0, 0], waist: [0, 0, 0] }),
      kf(L * 0.4, { armR: [165, 0, 10], forearmR: [60, 0, 0], waist: [10, -15, 0] }, { easing: "Cubic", direction: "In" }),
      kf(L * 0.6, { armR: [80, 0, 0], forearmR: [0, 0, 0], waist: [-10, 10, 0] }, { easing: "Cubic", direction: "Out" }),
      kf(L, { armR: [60, 0, 0], forearmR: [30, 0, 0], waist: [0, 0, 0] }),
    ], events: [{ t: r4(L * 0.6), name: "Cast", value: "bobber" }] };
  }),
];

export const PRESET_IDS = PRESETS.map((p) => p.id);

// ---------------------------------------------------------------- text → animation planner

export interface AnimPlan {
  preset: string;
  opts: PresetOpts;
  mirror: boolean;
  loop?: boolean;
  smooth: boolean;
  anticipation: number;
  impact: number;
  reasons: string[];
}

const has = (s: string, ...w: string[]) => w.some((x) => s.includes(x));

/** Deterministic planner: natural language (en/ru) → preset + modifiers. The calling LLM can override every field. */
export function planFromPrompt(prompt: string): AnimPlan {
  const s = prompt.toLowerCase();
  const reasons: string[] = [];
  // most specific first
  const order = ["combo3", "heavy_attack", "sprint", "crouch", "knockback", "death", "hurt", "dodge", "roll", "block", "reload", "shoot", "cast_spell", "throw", "mining", "farming", "fishing", "pickup", "interact", "equip", "unequip", "kick", "punch", "sword_attack", "wave", "cheer", "dance", "point", "sit", "climb", "swim", "land", "fall", "jump", "run", "walk", "idle"];
  let preset = "";
  for (const id of order) {
    const p = PRESETS.find((x) => x.id === id)!;
    if (p.words.some((w) => s.includes(w))) {
      preset = id;
      break;
    }
  }
  if (!preset) {
    preset = "idle";
    reasons.push("no known action word — started from idle; edit poses with animation_edit set_pose");
  } else reasons.push(`action → ${preset}`);
  const opts: PresetOpts = { ...DEF };
  if (has(s, "fast", "quick", "быстр", "резк", "стремит")) (opts.speed = 1.4), reasons.push("fast → speed 1.4");
  if (has(s, "slow", "медлен", "неторопл")) (opts.speed = 0.7), reasons.push("slow → speed 0.7");
  if (has(s, "powerful", "strong", "мощн", "сильн", "тяжел", "heavy")) (opts.intensity = 1.25), reasons.push("strong → intensity 1.25");
  if (has(s, "subtle", "light ", "лёгк", "легк", "слегка")) (opts.intensity = 0.7), reasons.push("subtle → intensity 0.7");
  if (has(s, "two-hand", "two hand", "двуруч", "двумя рук", "обеими")) (opts.twoHanded = true), reasons.push("two-handed");
  if (has(s, "left to right", "слева направо")) opts.direction = "left_to_right";
  else if (has(s, "overhead", "сверху", "над голов", "вертикал")) opts.direction = "overhead";
  else if (has(s, "thrust", "stab", "укол", "выпад", "тычок")) opts.direction = "thrust";
  else if (has(s, "right to left", "справа налево")) opts.direction = "right_to_left";
  const mirror = has(s, "left hand", "левой рук", "левая рук", "mirror", "зеркаль");
  if (mirror) reasons.push("left side → mirrored");
  const smooth = has(s, "smooth", "плавн", "мягк");
  const anticipation = has(s, "anticipation", "замах", "wind-up", "windup") ? 0.5 : 0;
  const impact = has(s, "impact", "forward movement", "вперёд", "вперед", "акцент", "удар силь") ? 0.5 : 0;
  let loop: boolean | undefined;
  if (has(s, "loop", "цикл", "зацикл")) loop = true;
  return { preset, opts, mirror, loop, smooth, anticipation, impact, reasons };
}

// ---------------------------------------------------------------- generation & edits

export function generate(input: {
  name?: string; rig?: RigType; preset?: string; prompt?: string;
  speed?: number; intensity?: number; direction?: PresetOpts["direction"]; twoHanded?: boolean;
  mirror?: boolean; loop?: boolean; priority?: AnimPriority;
}): { animation: Animation; plan: AnimPlan } {
  const plan = input.prompt ? planFromPrompt(input.prompt) : { preset: input.preset ?? "idle", opts: { ...DEF }, mirror: false, smooth: false, anticipation: 0, impact: 0, reasons: [] as string[] };
  if (input.preset) plan.preset = input.preset;
  if (input.speed) plan.opts.speed = input.speed;
  if (input.intensity) plan.opts.intensity = input.intensity;
  if (input.direction) plan.opts.direction = input.direction;
  if (input.twoHanded !== undefined) plan.opts.twoHanded = input.twoHanded;
  if (input.mirror !== undefined) plan.mirror = input.mirror;
  if (input.loop !== undefined) plan.loop = input.loop;
  const p = PRESETS.find((x) => x.id === plan.preset);
  if (!p) throw new Error(`unknown preset "${plan.preset}" — presets: ${PRESET_IDS.join(", ")}`);
  plan.opts.speed = Math.min(4, Math.max(0.25, plan.opts.speed));
  plan.opts.intensity = Math.min(2, Math.max(0.2, plan.opts.intensity));
  const b = p.build(plan.opts);
  let a: Animation = normalize({
    name: sanitizeName(input.name ?? (plan.preset.replace(/(^|_)(\w)/g, (_m, _u, c: string) => c.toUpperCase()) + "Anim")),
    rig: input.rig ?? "R15",
    length: b.length,
    loop: plan.loop ?? p.loop,
    priority: input.priority ?? p.priority,
    keyframes: b.keyframes,
    events: b.events ?? [],
    meta: { preset: p.id, prompt: input.prompt, category: p.category, tags: p.words.slice(0, 4) },
  });
  if (plan.mirror) a = mirrorAnimation(a);
  if (plan.anticipation) a = addAnticipation(a, plan.anticipation);
  if (plan.impact) a = addImpact(a, plan.impact);
  if (plan.smooth) a = smooth(a);
  if (a.loop) a = makeLoopSeamless(a);
  return { animation: a, plan };
}

export const sanitizeName = (n: string) => (n.replace(/[^A-Za-z0-9_]/g, "_").replace(/^_+/, "").slice(0, 60) || "Animation");

export function mirrorAnimation(a: Animation): Animation {
  const out = clone(a);
  for (const k of out.keyframes) {
    const rot: Partial<Record<Joint, Vec3>> = {};
    for (const [j, v] of Object.entries(k.rot) as Array<[Joint, Vec3]>) rot[MIRROR[j]] = [v[0], -v[1], -v[2]];
    k.rot = rot;
    if (k.pos) {
      const pos: Partial<Record<Joint, Vec3>> = {};
      for (const [j, v] of Object.entries(k.pos) as Array<[Joint, Vec3]>) pos[MIRROR[j]] = [-v[0], v[1], v[2]];
      k.pos = pos;
    }
  }
  out.events = out.events.map((e) => ({ ...e, value: e.value === "R" ? "L" : e.value === "L" ? "R" : e.value }));
  return normalize(out);
}

export function retime(a: Animation, factor: number): Animation {
  if (!(factor > 0)) throw new Error("speed factor must be > 0");
  const out = clone(a);
  for (const k of out.keyframes) k.t = r4(k.t / factor);
  for (const e of out.events) e.t = r4(e.t / factor);
  out.length = r4(out.length / factor);
  return normalize(out);
}

/** Scale motion amplitude around the first keyframe (rest pose). */
export function amplify(a: Animation, factor: number, joints?: Joint[]): Animation {
  const out = normalize(a);
  const base = clone(out.keyframes[0]);
  for (const k of out.keyframes) {
    for (const j of Object.keys(k.rot) as Joint[]) {
      if (joints && !joints.includes(j)) continue;
      const b = base.rot[j] ?? Z;
      k.rot[j] = add(b, add(k.rot[j]!, b, -1), factor);
    }
  }
  return normalize(out);
}

export function smooth(a: Animation): Animation {
  const out = normalize(a);
  for (const k of out.keyframes) {
    if (k.easing === undefined || k.easing === "Linear") (k.easing = "Cubic"), (k.direction = "InOut");
  }
  // soften harsh spikes: moving-average for interior keyframes whose neighbours are far apart
  for (let i = 1; i < out.keyframes.length - 1; i++) {
    const [p, c, n] = [out.keyframes[i - 1], out.keyframes[i], out.keyframes[i + 1]];
    for (const j of Object.keys(c.rot) as Joint[]) {
      const avg = lerp3(p.rot[j] ?? c.rot[j]!, n.rot[j] ?? c.rot[j]!, 0.5);
      if (dist(avg, c.rot[j]!) > 120) c.rot[j] = lerp3(c.rot[j]!, avg, 0.3);
    }
  }
  return normalize(out);
}

export function makeLoopSeamless(a: Animation): Animation {
  const out = normalize(a);
  if (!out.keyframes.length) return out;
  const first = clone(out.keyframes[0]);
  const last = out.keyframes[out.keyframes.length - 1];
  if (last.t < out.length - 1e-3) out.keyframes.push({ ...first, t: out.length });
  else {
    last.rot = clone(first.rot);
    if (first.pos) last.pos = clone(first.pos);
  }
  out.loop = true;
  return normalize(out);
}

/** Exaggerate the wind-up: push the pre-action keyframe further away from the strike pose. */
export function addAnticipation(a: Animation, amount = 0.5): Animation {
  const out = normalize(a);
  const hit = out.events.find((e) => e.name === "Hit" || e.name === "Cast" || e.name === "Release");
  if (!hit || out.keyframes.length < 3) return out;
  const iAfter = out.keyframes.findIndex((k) => k.t >= hit.t);
  const iPre = Math.max(1, iAfter - 1);
  const pre = out.keyframes[iPre], strike = out.keyframes[Math.min(out.keyframes.length - 1, iPre + 1)];
  for (const j of Object.keys(pre.rot) as Joint[]) pre.rot[j] = add(pre.rot[j]!, add(pre.rot[j]!, strike.rot[j] ?? pre.rot[j]!, -1), amount * 0.5);
  pre.easing = "Cubic";
  pre.direction = "In";
  return clamp(out);
}

/** Stronger impact: overshoot + short hold on the strike keyframe. */
export function addImpact(a: Animation, amount = 0.5): Animation {
  const out = normalize(a);
  const hit = out.events.find((e) => e.name === "Hit");
  if (!hit) return out;
  const i = out.keyframes.findIndex((k) => k.t >= hit.t);
  if (i <= 0 || i >= out.keyframes.length - 1) return out;
  const s = out.keyframes[i], prev = out.keyframes[i - 1];
  for (const j of Object.keys(s.rot) as Joint[]) s.rot[j] = add(s.rot[j]!, add(s.rot[j]!, prev.rot[j] ?? s.rot[j]!, -1), amount * 0.25);
  s.easing = "Cubic";
  s.direction = "Out";
  const hold = Math.min(0.06 * (1 + amount), (out.keyframes[i + 1].t - s.t) * 0.5);
  out.keyframes.splice(i + 1, 0, { ...clone(s), t: r4(s.t + hold), easing: "Cubic", direction: "InOut" });
  out.events.push({ t: s.t, name: "CameraShake", value: String(Math.round(amount * 10) / 10) });
  return clamp(out);
}

// ---------------------------------------------------------------- quality: analyze & auto-fix

type Range = [number, number];
const LIMITS: Partial<Record<Joint, [Range, Range, Range]>> = {
  head: [[-75, 65], [-85, 85], [-45, 45]],
  waist: [[-70, 60], [-95, 95], [-45, 45]],
  armR: [[-100, 195], [-130, 130], [-70, 185]],
  forearmR: [[-10, 165], [-95, 95], [-30, 30]],
  handR: [[-80, 80], [-60, 60], [-50, 50]],
  legR: [[-70, 125], [-60, 60], [-50, 50]],
  shinR: [[-160, 5], [-20, 20], [-10, 10]],
  footR: [[-50, 50], [-30, 30], [-25, 25]],
};
function limitsFor(j: Joint): [Range, Range, Range] | undefined {
  if (LIMITS[j]) return LIMITS[j];
  const m = MIRROR[j];
  const l = LIMITS[m];
  if (!l || m === j) return undefined;
  return [l[0], [-l[1][1], -l[1][0]], [-l[2][1], -l[2][0]]];
}

export interface AnimIssue {
  kind: "extreme_pose" | "sudden_movement" | "bad_loop" | "frozen_joint" | "timing" | "excessive_movement" | "event_out_of_range" | "foot_sliding";
  severity: "info" | "warning" | "error";
  message: string;
  joint?: Joint;
  t?: number;
  fixable: boolean;
}

export function analyze(input: Animation): { score: number; issues: AnimIssue[]; stats: Record<string, number | string> } {
  const a = normalize(input);
  const issues: AnimIssue[] = [];
  const ks = a.keyframes;
  if (ks.length < 2) issues.push({ kind: "timing", severity: "error", message: "needs at least 2 keyframes", fixable: false });
  if (a.length < 0.1) issues.push({ kind: "timing", severity: "warning", message: `very short (${a.length}s)`, fixable: false });
  for (let i = 1; i < ks.length; i++) {
    const dt = ks[i].t - ks[i - 1].t;
    if (dt < 1 / 60) issues.push({ kind: "timing", severity: "warning", message: `keyframes ${ks[i - 1].t}s and ${ks[i].t}s are closer than one frame`, t: ks[i].t, fixable: true });
  }
  const combat = /Action/.test(a.priority) || a.events.some((e) => e.name === "Hit");
  const maxVel = combat ? 2600 : 900;
  let maxSeen = 0;
  for (const j of usedJoints(a)) {
    const lim = limitsFor(j);
    let minV: Vec3 = [Infinity, Infinity, Infinity], maxV: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < ks.length; i++) {
      const v = ks[i].rot[j];
      if (!v) continue;
      for (let c = 0; c < 3; c++) (minV[c] = Math.min(minV[c], v[c])), (maxV[c] = Math.max(maxV[c], v[c]));
      if (lim) {
        for (let c = 0; c < 3; c++) {
          if (v[c] < lim[c][0] - 1 || v[c] > lim[c][1] + 1) {
            issues.push({ kind: "extreme_pose", severity: "warning", joint: j, t: ks[i].t, message: `${j} ${["pitch", "yaw", "roll"][c]} ${v[c]}° outside natural range [${lim[c][0]}, ${lim[c][1]}]`, fixable: true });
            break;
          }
        }
      }
      if (i > 0 && ks[i - 1].rot[j]) {
        const dt = Math.max(1e-3, ks[i].t - ks[i - 1].t);
        const vel = dist(ks[i - 1].rot[j]!, v) / dt;
        maxSeen = Math.max(maxSeen, vel);
        if (vel > maxVel && j !== "root") issues.push({ kind: "sudden_movement", severity: "warning", joint: j, t: ks[i].t, message: `${j} turns ${Math.round(vel)}°/s between ${ks[i - 1].t}s and ${ks[i].t}s (limit ${maxVel})`, fixable: true });
      }
    }
    const range = Math.max(maxV[0] - minV[0], maxV[1] - minV[1], maxV[2] - minV[2]);
    if (ks.length > 2 && range < 0.5 && j !== "root" && a.length > 0.5) issues.push({ kind: "frozen_joint", severity: "info", joint: j, message: `${j} is keyed but never moves`, fixable: false });
    if (range > 300 && j !== "root") issues.push({ kind: "excessive_movement", severity: "warning", joint: j, message: `${j} travels ${Math.round(range)}° — likely a broken rotation`, fixable: true });
  }
  if (a.loop && ks.length > 1) {
    const f = ks[0], l = ks[ks.length - 1];
    let worst = 0;
    for (const j of Object.keys(f.rot) as Joint[]) {
      const d = dist(f.rot[j]!, l.rot[j] ?? f.rot[j]!);
      const wrapped = Math.abs(d - 360) < 1 ? 0 : d;
      worst = Math.max(worst, wrapped);
    }
    if (worst > 3 || Math.abs(l.t - a.length) > 1e-3) issues.push({ kind: "bad_loop", severity: "warning", message: `loop seam: last pose differs from first by ${Math.round(worst)}°${Math.abs(l.t - a.length) > 1e-3 ? ", last keyframe is not at the end" : ""}`, fixable: true });
  }
  for (const e of input.events ?? []) if (e.t < 0 || e.t > a.length + 1e-6) issues.push({ kind: "event_out_of_range", severity: "warning", t: e.t, message: `event ${e.name} at ${e.t}s is outside 0..${a.length}`, fixable: true });
  if (a.meta?.preset && ["walk", "run", "sprint", "crouch"].includes(a.meta.preset))
    issues.push({ kind: "foot_sliding", severity: "info", message: "foot sliding depends on WalkSpeed: match Humanoid WalkSpeed to stride (adjust AnimationTrack:AdjustSpeed at runtime)", fixable: false });
  const penalty = issues.reduce((s, i) => s + (i.severity === "error" ? 30 : i.severity === "warning" ? 8 : 1), 0);
  return { score: Math.max(0, 100 - penalty), issues, stats: { keyframes: ks.length, joints: usedJoints(a).length, length: a.length, loop: String(a.loop), maxAngularVelocity: Math.round(maxSeen) } };
}

export function clamp(a: Animation): Animation {
  const out = clone(a);
  for (const k of out.keyframes) {
    for (const j of Object.keys(k.rot) as Joint[]) {
      const lim = limitsFor(j);
      if (!lim) continue;
      k.rot[j] = k.rot[j]!.map((v, c) => Math.min(lim[c][1], Math.max(lim[c][0], v))) as Vec3;
    }
  }
  return normalize(out);
}

/** Fix everything marked fixable by analyze(). Returns the fixed animation and a log. */
export function autoFix(input: Animation): { animation: Animation; fixed: string[] } {
  const fixed: string[] = [];
  let a = normalize(input);
  const before = analyze(a).issues;
  if (before.some((i) => i.kind === "extreme_pose" || i.kind === "excessive_movement")) (a = clamp(a)), fixed.push("clamped joints to natural ranges");
  // stretch too-fast transitions
  for (let pass = 0; pass < 3; pass++) {
    const fast = analyze(a).issues.filter((i) => i.kind === "sudden_movement");
    if (!fast.length) break;
    const ks = a.keyframes;
    const ts = new Set(fast.map((i) => i.t));
    let shift = 0;
    for (let i = 1; i < ks.length; i++) {
      const orig = ks[i].t;
      if (ts.has(orig)) shift += (orig - ks[i - 1].t + 0) * 0.35;
      ks[i].t = r4(orig + shift);
      for (const e of a.events) if (Math.abs(e.t - orig) < 1e-4) e.t = ks[i].t;
    }
    a.length = r4(a.length + shift);
    for (const k of ks) if (!k.easing || k.easing === "Linear") (k.easing = "Cubic"), (k.direction = "InOut");
    fixed.push(`slowed ${fast.length} abrupt transition(s) by 35%`);
    a = normalize(a);
  }
  // too-close keyframes are merged by normalize; drop sub-frame gaps
  const ks = a.keyframes.filter((k, i, arr) => i === 0 || k.t - arr[i - 1].t >= 1 / 60);
  if (ks.length !== a.keyframes.length) (a.keyframes = ks), fixed.push("merged keyframes closer than one frame");
  a.events = a.events.map((e) => ({ ...e, t: Math.min(a.length, Math.max(0, e.t)) }));
  if (a.loop && analyze(a).issues.some((i) => i.kind === "bad_loop")) (a = makeLoopSeamless(a)), fixed.push("made loop seamless");
  return { animation: normalize(a), fixed };
}

// ---------------------------------------------------------------- editing operations

export type AnimEditOp =
  | { op: "speed"; factor: number }
  | { op: "set_length"; length: number }
  | { op: "intensity"; factor: number; joints?: Joint[] }
  | { op: "smooth" }
  | { op: "mirror" }
  | { op: "loop_seamless" }
  | { op: "set_loop"; loop: boolean }
  | { op: "set_priority"; priority: AnimPriority }
  | { op: "anticipation"; amount?: number }
  | { op: "impact"; amount?: number }
  | { op: "add_event"; t: number; name: string; value?: string }
  | { op: "remove_event"; name: string; t?: number }
  | { op: "retarget"; rig: RigType }
  | { op: "set_pose"; t: number; joint: Joint; rot: Vec3; pos?: Vec3 }
  | { op: "add_keyframe"; t: number; copyFrom?: number }
  | { op: "delete_keyframe"; t: number }
  | { op: "move_keyframe"; t: number; to: number }
  | { op: "duplicate_keyframe"; t: number; to: number }
  | { op: "set_easing"; t: number; easing: EasingStyle; direction?: EasingDirection }
  | { op: "mirror_pose"; t: number }
  | { op: "blend_poses"; a: number; b: number; k: number; to: number }
  | { op: "autofix" };

function poseAt(a: Animation, t: number): AnimKeyframe {
  const ks = normalize(a).keyframes;
  if (!ks.length) return { t, rot: {} };
  if (t <= ks[0].t) return { ...clone(ks[0]), t };
  for (let i = 1; i < ks.length; i++) {
    if (t <= ks[i].t) {
      const k = (t - ks[i - 1].t) / Math.max(1e-6, ks[i].t - ks[i - 1].t);
      const rot: Partial<Record<Joint, Vec3>> = {};
      for (const j of Object.keys(ks[i].rot) as Joint[]) rot[j] = lerp3(ks[i - 1].rot[j] ?? ks[i].rot[j]!, ks[i].rot[j]!, k).map(r2) as Vec3;
      const pos: Partial<Record<Joint, Vec3>> = {};
      for (const j of Object.keys(ks[i].pos ?? {}) as Joint[]) pos[j] = lerp3(ks[i - 1].pos?.[j] ?? ks[i].pos![j]!, ks[i].pos![j]!, k).map(r4) as Vec3;
      return { t, rot, pos };
    }
  }
  return { ...clone(ks[ks.length - 1]), t };
}

const findK = (a: Animation, t: number) => {
  const i = a.keyframes.findIndex((k) => Math.abs(k.t - t) < 1e-3);
  if (i < 0) throw new Error(`no keyframe at ${t}s (keyframes: ${a.keyframes.map((k) => k.t).join(", ")})`);
  return i;
};

export function applyEdits(input: Animation, ops: AnimEditOp[]): { animation: Animation; log: string[] } {
  let a = normalize(input);
  const log: string[] = [];
  for (const o of ops) {
    switch (o.op) {
      case "speed": a = retime(a, o.factor); log.push(`speed ×${o.factor} → ${a.length}s`); break;
      case "set_length": a = retime(a, a.length / o.length); log.push(`length → ${a.length}s`); break;
      case "intensity": a = amplify(a, o.factor, o.joints); log.push(`intensity ×${o.factor}`); break;
      case "smooth": a = smooth(a); log.push("smoothed"); break;
      case "mirror": a = mirrorAnimation(a); log.push("mirrored L↔R"); break;
      case "loop_seamless": a = makeLoopSeamless(a); log.push("loop made seamless"); break;
      case "set_loop": a = { ...a, loop: o.loop }; log.push(`loop=${o.loop}`); break;
      case "set_priority": a = { ...a, priority: o.priority }; log.push(`priority=${o.priority}`); break;
      case "anticipation": a = addAnticipation(a, o.amount ?? 0.5); log.push("anticipation increased"); break;
      case "impact": a = addImpact(a, o.amount ?? 0.5); log.push("impact increased"); break;
      case "add_event": a = normalize({ ...a, events: [...a.events, { t: o.t, name: o.name, value: o.value }] }); log.push(`event ${o.name}@${o.t}`); break;
      case "remove_event": a = { ...a, events: a.events.filter((e) => !(e.name === o.name && (o.t === undefined || Math.abs(e.t - o.t) < 1e-3))) }; log.push(`removed event ${o.name}`); break;
      case "retarget": log.push(`retargeted ${a.rig} → ${o.rig}${a.rig !== o.rig ? " (abstract skeleton; R6 has no elbows/knees, forearm/shin motion is folded into arms/legs)" : ""}`); a = { ...a, rig: o.rig }; break;
      case "set_pose": {
        let i = a.keyframes.findIndex((k) => Math.abs(k.t - o.t) < 1e-3);
        if (i < 0) {
          a.keyframes.push(poseAt(a, o.t));
          a = normalize(a);
          i = findK(a, o.t);
        }
        a.keyframes[i].rot[o.joint] = o.rot;
        if (o.pos) a.keyframes[i].pos = { ...(a.keyframes[i].pos ?? {}), [o.joint]: o.pos };
        a = normalize(a);
        log.push(`pose ${o.joint}@${o.t}`);
        break;
      }
      case "add_keyframe": a.keyframes.push({ ...poseAt(a, o.copyFrom ?? o.t), t: o.t }); a = normalize(a); log.push(`keyframe @${o.t}`); break;
      case "delete_keyframe": a.keyframes.splice(findK(a, o.t), 1); a = normalize(a); log.push(`deleted keyframe @${o.t}`); break;
      case "move_keyframe": a.keyframes[findK(a, o.t)].t = o.to; a = normalize(a); log.push(`moved keyframe ${o.t}→${o.to}`); break;
      case "duplicate_keyframe": a.keyframes.push({ ...clone(a.keyframes[findK(a, o.t)]), t: o.to }); a = normalize(a); log.push(`duplicated ${o.t}→${o.to}`); break;
      case "set_easing": { const k = a.keyframes[findK(a, o.t)]; k.easing = o.easing; k.direction = o.direction ?? k.direction ?? "InOut"; log.push(`easing @${o.t}=${o.easing}`); break; }
      case "mirror_pose": {
        const i = findK(a, o.t);
        const m = mirrorAnimation({ ...a, keyframes: [a.keyframes[i]], events: [] }).keyframes[0];
        a.keyframes[i] = { ...m, t: a.keyframes[i].t };
        a = normalize(a);
        log.push(`mirrored pose @${o.t}`);
        break;
      }
      case "blend_poses": {
        const pa = poseAt(a, o.a), pb = poseAt(a, o.b);
        const rot: Partial<Record<Joint, Vec3>> = {};
        for (const j of new Set([...Object.keys(pa.rot), ...Object.keys(pb.rot)]) as Set<Joint>) rot[j] = lerp3(pa.rot[j] ?? Z, pb.rot[j] ?? Z, o.k);
        a.keyframes.push({ t: o.to, rot });
        a = normalize(a);
        log.push(`blended ${o.a}/${o.b} (${o.k}) → @${o.to}`);
        break;
      }
      case "autofix": { const r = autoFix(a); a = r.animation; log.push(...(r.fixed.length ? r.fixed : ["nothing to fix"])); break; }
      default: throw new Error(`unknown op ${(o as { op: string }).op}`);
    }
  }
  return { animation: normalize(a), log };
}

// ---------------------------------------------------------------- Roblox export

export interface ExportPose { part: string; parent: string; cf: number[] }
export interface ExportKeyframe { t: number; style: EasingStyle; dir: EasingDirection; poses: ExportPose[] }
export interface AnimExport {
  name: string; rig: RigType; rootPart: string; loop: boolean; priority: AnimPriority; length: number;
  keyframes: ExportKeyframe[];
  markers: AnimEvent[];
  requiredParts: string[];
}

/** IR → per-keyframe Motor6D transforms for a concrete rig (parents ordered before children). */
export function toRobloxExport(input: Animation): AnimExport {
  const a = normalize(input);
  const rig = RIGS[a.rig];
  const order = JOINTS.filter((j) => rig.joints[j]);
  const depth = (part: string): number => {
    if (part === rig.rootPart) return 0;
    const j = Object.values(rig.joints).find((x) => x!.part === part);
    return j ? 1 + depth(j.parent) : 0;
  };
  order.sort((x, y) => depth(rig.joints[x]!.part) - depth(rig.joints[y]!.part));
  const keyframes: ExportKeyframe[] = a.keyframes.map((k) => {
    const rot: Partial<Record<Joint, Vec3>> = {};
    const pos: Partial<Record<Joint, Vec3>> = {};
    for (const [j, v] of Object.entries(k.rot) as Array<[Joint, Vec3]>) {
      const m = rig.joints[j] ? { into: j, weight: 1 } : rig.merge[j];
      if (!m) continue;
      rot[m.into] = add(rot[m.into] ?? Z, v, m.weight);
    }
    for (const [j, v] of Object.entries(k.pos ?? {}) as Array<[Joint, Vec3]>) if (rig.joints[j]) pos[j] = v;
    const poses: ExportPose[] = [];
    for (const j of order) {
      if (!rot[j] && !pos[j]) continue;
      const rj = rig.joints[j]!;
      poses.push({ part: rj.part, parent: rj.parent, cf: jointTransform(rj, rot[j] ?? Z, pos[j] ?? Z) });
    }
    return { t: k.t, style: k.easing ?? "Linear", dir: k.direction ?? "InOut", poses };
  });
  const requiredParts = [rig.rootPart, ...order.map((j) => rig.joints[j]!.part)];
  return { name: a.name, rig: a.rig, rootPart: rig.rootPart, loop: a.loop, priority: a.priority, length: a.length, keyframes, markers: a.events, requiredParts };
}

/** Decoded KeyframeSequence (from Studio) → IR. poses: per keyframe {part → 12-number CFrame}. */
export function fromRobloxPoses(input: {
  name: string; loop: boolean; priority: string;
  keyframes: Array<{ t: number; poses: Record<string, number[]>; style?: string; dir?: string }>;
  markers?: AnimEvent[];
}): Animation {
  const parts = new Set(input.keyframes.flatMap((k) => Object.keys(k.poses)));
  const rigType: RigType = parts.has("UpperTorso") || parts.has("LowerTorso") || parts.has("RightUpperArm") ? "R15" : "R6";
  const rig = RIGS[rigType];
  const byPart = new Map<string, Joint>();
  for (const [j, d] of Object.entries(rig.joints) as Array<[Joint, RigJoint]>) byPart.set(d.part, j);
  const keyframes: AnimKeyframe[] = input.keyframes.map((k) => {
    const rot: Partial<Record<Joint, Vec3>> = {};
    const pos: Partial<Record<Joint, Vec3>> = {};
    for (const [part, cf] of Object.entries(k.poses)) {
      const j = byPart.get(part);
      if (!j || cf.length < 12) continue;
      const r = fromJointTransform(rig.joints[j]!, cf);
      rot[j] = r.rot;
      if (r.pos.some((v) => Math.abs(v) > 1e-3)) pos[j] = r.pos;
    }
    const style = (["Linear", "Constant", "Cubic", "Elastic", "Bounce"] as EasingStyle[]).find((s) => s === k.style || (k.style === "CubicV2" && s === "Cubic"));
    const dir = (["In", "Out", "InOut"] as EasingDirection[]).find((d) => d === k.dir);
    return { t: k.t, rot, pos: Object.keys(pos).length ? pos : undefined, easing: style, direction: dir };
  });
  const priority = (["Core", "Idle", "Movement", "Action", "Action2", "Action3", "Action4"] as AnimPriority[]).find((p) => p === input.priority) ?? "Action";
  return normalize({ name: sanitizeName(input.name), rig: rigType, length: 0, loop: input.loop, priority, keyframes, events: input.markers ?? [] });
}

export function listPresets() {
  return PRESETS.map((p) => ({ id: p.id, category: p.category, loop: p.loop, priority: p.priority, description: p.desc }));
}
