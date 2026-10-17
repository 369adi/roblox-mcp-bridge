/**
 * Development Tree: a hierarchical view derived only from persisted records (runs, plan steps,
 * events, tool operations, artifacts, verification passes, platform tasks). Node IDs are stable
 * because they are composed from persisted identifiers.
 */
import type { RunRecord } from "./run-store.js";
import type { ArtifactRecord } from "./artifact-store.js";
import type { OperationRecord } from "../operation-store.js";
import type { PlatformTask } from "../task-runtime.js";

export type NodeStatus = "planned" | "running" | "waiting" | "done" | "failed" | "blocked" | "partial" | "cancelled" | "info" | "warning";
export interface DevNode { id: string; type: string; title: string; status: NodeStatus; detail?: string; at?: string; ref?: { conversationId?: string; messageId?: string; runId?: string; artifactId?: string; file?: string; operationId?: string; taskId?: string; skillId?: string }; children: DevNode[] }
const runStatus = (s: string): NodeStatus => ({ queued: "planned", running: "running", waiting_approval: "waiting", done: "done", partial: "partial", blocked: "blocked", failed: "failed", cancelled: "cancelled", interrupted: "blocked" } as Record<string, NodeStatus>)[s] ?? "info";
const stepStatus = (s: string): NodeStatus => ({ planned: "planned", running: "running", done: "done", failed: "failed", skipped: "cancelled" } as Record<string, NodeStatus>)[s] ?? "info";

export function runNode(r: RunRecord, artifacts: ArtifactRecord[], ops: OperationRecord[], task?: PlatformTask | null): DevNode {
  const ref = { conversationId: r.conversationId, messageId: r.messageId, runId: r.id };
  const sel = r.skills as any;
  const skills: DevNode = { id: `skills:${r.id}`, type: "skills", title: `Skills (${sel?.selected?.length ?? 0})`, status: sel?.selected?.length ? "done" : "info", ref, children: (sel?.selected ?? []).map((s: any) => ({ id: `skill:${r.id}:${s.id}`, type: "skill", title: `${s.title}`, status: s.missingTools?.length ? "warning" : "done", detail: `${s.id} · ${s.role} · ${s.reason}${s.missingTools?.length ? "\nMissing tools: " + s.missingTools.join(", ") : ""}`, ref: { ...ref, skillId: s.id }, children: [] })) };
  const opsFor = (stepId?: string) => {
    const evs = r.events.filter((e) => e.type === "tool" && (e.data as any)?.phase === "end" && (stepId ? e.planStep === stepId : !e.planStep));
    return evs.map((e) => ({ id: `tool:${r.id}:${e.seq}`, type: "operation", title: e.title, status: ((e.data as any)?.status === "success" ? "done" : "failed") as NodeStatus, detail: e.detail, at: e.at, ref, children: [] }));
  };
  const plan: DevNode = { id: `plan:${r.id}`, type: "plan", title: `Plan (${r.plan.filter((p) => p.state === "done").length}/${r.plan.length})`, status: r.plan.some((p) => p.state === "failed") ? "failed" : r.plan.length && r.plan.every((p) => p.state === "done") ? "done" : r.plan.some((p) => p.state === "running") ? "running" : "planned", ref,
    children: r.plan.map((p) => ({ id: `step:${r.id}:${p.id}`, type: "step", title: p.title, status: stepStatus(p.state), detail: [p.deps.length ? "Depends on: " + p.deps.join(", ") : "", p.criteria?.length ? "Acceptance: " + p.criteria.join("; ") : "", p.detail ?? ""].filter(Boolean).join("\n"), ref,
      children: [...r.events.filter((e) => e.planStep === p.id && e.type === "stage").map((e) => ({ id: `ev:${r.id}:${e.seq}`, type: "event", title: e.title, status: (/FIXING/.test(e.stage ?? "") ? "warning" : "info") as NodeStatus, detail: e.detail, at: e.at, ref, children: [] })), ...opsFor(p.id)] })) };
  const arts: DevNode = { id: `artifacts:${r.id}`, type: "artifacts", title: `Artifacts (${r.artifacts.length})`, status: r.artifacts.length ? "done" : "info", ref, children: artifacts.filter((a) => r.artifacts.includes(a.id)).map((a) => ({ id: `artifact:${a.id}`, type: "artifact", title: `${a.name} · ${a.stats.triangles} tris`, status: (a.verified ? "done" : "warning") as NodeStatus, detail: `${a.spec.recipe}/${a.spec.variant} · ${a.stats.size.join("×")} studs${a.parentId ? " · iteration of " + a.parentId : ""}`, at: a.createdAt, ref: { ...ref, artifactId: a.id }, children: [
    ...a.files.map((f) => ({ id: `file:${a.id}:${f.name}`, type: "file", title: `${f.name} (${f.bytes} B)`, status: "done" as NodeStatus, detail: `sha256 ${f.sha256}`, ref: { ...ref, artifactId: a.id, file: f.name }, children: [] })),
    { id: `validation:${a.id}`, type: "check", title: `Validation ${a.validation.ok ? "passed" : "failed"} (${a.validation.closedParts}/${a.stats.parts} watertight)`, status: (a.validation.ok ? "done" : "failed") as NodeStatus, detail: [...a.validation.fixes, ...a.validation.warnings].join("\n"), ref: { ...ref, artifactId: a.id }, children: [] },
    ...(a.studio ?? []).map((s, i) => ({ id: `studio:${a.id}:${i}`, type: "studio", title: `Imported to Studio ${s.path ?? ""}`, status: "done" as NodeStatus, detail: "EditableMesh (not persistent)", at: s.importedAt, ref: { ...ref, artifactId: a.id }, children: [] })),
  ] })) };
  const ver: DevNode = { id: `verify:${r.id}`, type: "verification", title: `Verification (${r.verification.length})`, status: !r.verification.length ? "info" : r.verification.at(-1)!.ok ? "done" : "failed", ref, children: r.verification.map((v, i) => ({ id: `vpass:${r.id}:${i}`, type: "check", title: `${v.by} pass ${v.pass}: ${v.ok ? "ok" : "issues"}`, status: (v.ok ? "done" : "failed") as NodeStatus, detail: v.notes, ref, children: [] })) };
  const problems = r.events.filter((e) => e.type === "warning" || e.type === "diagnostics" || (e.type === "tool" && (e.data as any)?.status && (e.data as any).status !== "success"));
  const issues: DevNode = { id: `issues:${r.id}`, type: "issues", title: `Errors & warnings (${problems.length})`, status: problems.length ? "warning" : "info", ref, children: problems.map((e) => ({ id: `issue:${r.id}:${e.seq}`, type: e.type, title: e.title, status: "warning" as NodeStatus, detail: e.detail, at: e.at, ref, children: [] })) };
  const children = [skills, plan, arts, ver, issues];
  if (task) children.push({ id: `task:${task.id}`, type: "task", title: `Platform task ${task.state}`, status: runStatus(task.state.toLowerCase()), detail: task.reason ?? task.summary, ref: { ...ref, taskId: task.id }, children: [
    ...task.criteria.map((c) => { const e = task.evidence.find((x) => x.criterionId === c.id); return { id: `crit:${task.id}:${c.id}`, type: "criterion", title: c.label, status: (e?.status === "passed" ? "done" : e?.status === "failed" ? "failed" : e ? "blocked" : "planned") as NodeStatus, detail: e ? JSON.stringify(e.observed).slice(0, 300) : "no evidence yet", ref: { ...ref, taskId: task.id }, children: [] }; }),
    ...ops.filter((o) => o.taskId === task.id).map((o) => ({ id: `op:${o.id}`, type: "operation", title: `${o.tool} · ${o.result?.status ?? o.state}`, status: (o.result?.status === "success" ? "done" : o.state === "running" ? "running" : "failed") as NodeStatus, detail: o.result?.error ?? undefined, at: o.createdAt, ref: { ...ref, operationId: o.id, taskId: task.id }, children: [] })),
  ] });
  return { id: `run:${r.id}`, type: "goal", title: r.goal.replace(/\s+/g, " ").slice(0, 140), status: runStatus(r.state), detail: `${r.settings.mode} · ${r.path} · stage ${r.stage}${r.error ? "\n" + r.error : ""}`, at: r.createdAt, ref, children };
}
export function conversationTree(conv: { id: string; title: string }, runs: RunRecord[], artifacts: ArtifactRecord[], ops: OperationRecord[], taskOf: (id?: string) => PlatformTask | null): DevNode {
  const nodes = runs.map((r) => runNode(r, artifacts, ops, taskOf(r.taskId)));
  const st: NodeStatus = nodes.some((n) => n.status === "running" || n.status === "waiting") ? "running" : nodes.at(-1)?.status ?? "info";
  return { id: `conv:${conv.id}`, type: "conversation", title: conv.title, status: st, ref: { conversationId: conv.id }, children: nodes };
}
export function countNodes(n: DevNode): number { return 1 + n.children.reduce((a, c) => a + countNodes(c), 0); }
