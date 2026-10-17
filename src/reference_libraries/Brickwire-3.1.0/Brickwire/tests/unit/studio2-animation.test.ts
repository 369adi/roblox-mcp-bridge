import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS, generate, planFromPrompt, analyze, autoFix, applyEdits, mirrorAnimation, toRobloxExport,
  fromRobloxPoses, jointTransform, fromJointTransform, RIGS, normalize, type Animation,
} from "../../shared/src/studio2/animation.js";

test("every preset generates a valid, exportable animation for R6 and R15", () => {
  for (const p of PRESETS) {
    for (const rig of ["R6", "R15"] as const) {
      const { animation: a } = generate({ preset: p.id, rig });
      assert.ok(a.keyframes.length >= 2, p.id);
      assert.ok(a.length > 0, p.id);
      for (let i = 1; i < a.keyframes.length; i++) assert.ok(a.keyframes[i].t > a.keyframes[i - 1].t, `${p.id} sorted`);
      const ex = toRobloxExport(a);
      assert.equal(ex.keyframes.length, a.keyframes.length);
      for (const k of ex.keyframes) for (const pose of k.poses) {
        assert.equal(pose.cf.length, 12);
        assert.ok(pose.cf.every(Number.isFinite), `${p.id} finite`);
      }
      const r = analyze(a);
      assert.ok(!r.issues.some((i) => i.severity === "error"), `${p.id} ${rig}: ${JSON.stringify(r.issues)}`);
    }
  }
});

test("Motor6D transform round-trips through the R6 C0 frames", () => {
  for (const j of Object.values(RIGS.R6.joints)) {
    const rot: [number, number, number] = [35, -20, 50];
    const cf = jointTransform(j!, rot, [0.1, 0.2, -0.3]);
    const back = fromJointTransform(j!, cf);
    back.rot.forEach((v, i) => assert.ok(Math.abs(v - rot[i]) < 0.05, `${j!.part} ${back.rot}`));
    assert.ok(Math.abs(back.pos[2] + 0.3) < 1e-3);
  }
});

test("R6 shoulders: same character-space pitch gives mirrored local Z rotation (Roblox convention)", () => {
  const r = jointTransform(RIGS.R6.joints.armR!, [90, 0, 0]);
  const l = jointTransform(RIGS.R6.joints.armL!, [90, 0, 0]);
  // rotation about local Z: R01 = -sin(angle); opposite signs left vs right
  assert.ok(Math.sign(r[4]) === -Math.sign(l[4]) && Math.abs(r[4]) > 0.99);
});

test("planner understands Russian and English prompts", () => {
  const p = planFromPrompt("сделай быстрый мощный удар мечом справа налево с двуручным мечом");
  assert.equal(p.preset, "heavy_attack");
  assert.equal(p.opts.speed, 1.4);
  assert.equal(p.opts.twoHanded, true);
  assert.equal(planFromPrompt("slow smooth walk loop").preset, "walk");
  assert.equal(planFromPrompt("wave with left hand").mirror, true);
  assert.equal(planFromPrompt("3 hit combo").preset, "combo3");
});

test("mirror swaps sides and is an involution", () => {
  const { animation: a } = generate({ preset: "wave" });
  const m = mirrorAnimation(a);
  assert.ok(m.keyframes[2].rot.armL && !m.keyframes[2].rot.armR?.some((v) => Math.abs(v) > 100));
  assert.deepEqual(mirrorAnimation(m).keyframes, a.keyframes);
});

test("analyze detects broken poses, bad loops and abrupt motion; autofix repairs them", () => {
  const broken: Animation = normalize({
    name: "Broken", rig: "R15", length: 1, loop: true, priority: "Idle",
    keyframes: [
      { t: 0, rot: { armR: [0, 0, 0], head: [0, 0, 0] } },
      { t: 0.05, rot: { armR: [0, 0, 0], head: [170, 0, 0] } },
      { t: 0.9, rot: { armR: [90, 0, 0], head: [0, 0, 0] } },
    ],
    events: [],
  });
  const kinds = new Set(analyze(broken).issues.map((i) => i.kind));
  for (const k of ["extreme_pose", "sudden_movement", "bad_loop"]) assert.ok(kinds.has(k as never), k);
  const { animation: fixed, fixed: log } = autoFix(broken);
  const after = analyze(fixed);
  assert.ok(log.length > 0);
  assert.ok(!after.issues.some((i) => i.kind === "extreme_pose" || i.kind === "bad_loop"), JSON.stringify(after.issues));
  assert.ok(after.score > analyze(broken).score);
});

test("edit operations", () => {
  const { animation: a } = generate({ preset: "sword_attack" });
  const { animation: b, log } = applyEdits(a, [
    { op: "speed", factor: 2 },
    { op: "add_event", t: 0.1, name: "Sound", value: "swoosh" },
    { op: "set_pose", t: 0.2, joint: "head", rot: [10, 0, 0] },
    { op: "impact", amount: 0.5 },
    { op: "retarget", rig: "R6" },
  ]);
  assert.equal(log.length, 5);
  assert.ok(Math.abs(b.length - a.length / 2) < 0.1);
  assert.equal(b.rig, "R6");
  assert.ok(b.events.some((e) => e.name === "CameraShake"));
  assert.ok(b.keyframes.some((k) => k.t === 0.2 && k.rot.head?.[0] === 10));
  assert.throws(() => applyEdits(a, [{ op: "delete_keyframe", t: 9 }]));
});

test("KeyframeSequence import (fromRobloxPoses) inverts export", () => {
  for (const rig of ["R6", "R15"] as const) {
    const { animation: a } = generate({ preset: "punch", rig });
    const ex = toRobloxExport(a);
    const back = fromRobloxPoses({
      name: a.name, loop: a.loop, priority: a.priority, markers: a.events,
      keyframes: ex.keyframes.map((k) => ({ t: k.t, style: k.style, dir: k.dir, poses: Object.fromEntries(k.poses.map((p) => [p.part, p.cf])) })),
    });
    assert.equal(back.rig, rig);
    assert.equal(back.keyframes.length, a.keyframes.length);
    if (rig === "R15") {
      const k = 2;
      for (const [j, v] of Object.entries(a.keyframes[k].rot)) v!.forEach((x, i) => assert.ok(Math.abs(x - back.keyframes[k].rot[j as "armR"]![i]) < 0.1, `${j}`));
    }
  }
});
