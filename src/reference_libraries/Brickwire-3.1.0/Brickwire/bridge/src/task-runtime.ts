import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ProjectBinding, OperationRecord } from "./operation-store.js";
export type TaskState =
  "PLANNED" | "RUNNING" | "PAUSED" | "PARTIAL" | "BLOCKED" | "FAILED" | "DONE" | "CANCELLED";
export type TaskMode = "plan" | "supervised" | "autopilot";
export interface Criterion {
  id: string;
  label: string;
  kind: "exists" | "property" | "script_contains";
  path: string;
  property?: string;
  expected?: unknown;
  text?: string;
}
export interface Evidence {
  criterionId: string;
  status: "passed" | "failed" | "blocked";
  observed: unknown;
  at: string;
  revision: number;
  binding: ProjectBinding;
  reason?: string;
}
export interface PlatformTask {
  id: string;
  version: 1;
  goal: string;
  mode: TaskMode;
  state: TaskState;
  binding: ProjectBinding;
  sessionId?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  pausedAt?: string;
  pausedMs: number;
  maxCalls: number;
  maxMinutes: number;
  calls: number;
  revision: number;
  criteria: Criterion[];
  evidence: Evidence[];
  plan: Array<{ id: string; title: string; state: "planned" | "done" }>;
  summary?: string;
  reason?: string;
}
const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
export class TaskRuntime {
  private dir: string;
  private tasks = new Map<string, PlatformTask>();
  private writes = new Map<string, number>();
  loadErrors: string[] = [];
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "tasks-v1");
    fs.mkdirSync(this.dir, { recursive: true });
    for (const n of fs.readdirSync(this.dir).filter((n) => /^task_[a-f0-9]{16}\.json$/.test(n))) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(this.dir, n), "utf8")) as PlatformTask;
        if (t.version !== 1 || !t.id || !Array.isArray(t.criteria) || !t.binding) throw Error("invalid");
        if (t.state === "RUNNING") {
          t.state = "PAUSED";
          t.reason = "Application restarted. Verify project binding before resuming.";
          t.pausedAt = new Date().toISOString();
        }
        this.tasks.set(t.id, t);
      } catch {
        this.loadErrors.push(n);
      }
    }
  }
  private save(t: PlatformTask) {
    t.updatedAt = new Date().toISOString();
    const f = path.join(this.dir, t.id + ".json");
    fs.writeFileSync(f + ".tmp", JSON.stringify(t), { mode: 0o600 });
    fs.renameSync(f + ".tmp", f);
  }
  list() {
    return [...this.tasks.values()].reverse().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  get(id: string) {
    const t = this.tasks.get(id);
    if (!t) fail("Task not found", 404);
    return t!;
  }
  forSession(id?: string) {
    return id ? this.list().filter(t=>t.sessionId===id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0] : undefined;
  }
  create(input: any, binding: ProjectBinding) {
    if (typeof input.goal !== "string" || !input.goal.trim() || input.goal.length > 10000)
      fail("Укажите цель задачи");
    if (!["plan", "supervised", "autopilot"].includes(input.mode)) fail("Invalid mode");
    if (!Array.isArray(input.criteria) || input.criteria.length > 40) fail("Invalid criteria");
    const criteria: Criterion[] = input.criteria.map((c: any, i: number) => {
      if (
        !c ||
        !["exists", "property", "script_contains"].includes(c.kind) ||
        typeof c.path !== "string" ||
        !/^game\.[A-Za-z]/.test(c.path) ||
        c.path.length > 500
      )
        fail("Критерий требует тип проверки и путь game.…");
      if (
        c.kind === "property" &&
        (typeof c.property !== "string" || !c.property || c.expected === undefined)
      )
        fail("Укажите свойство и ожидаемое значение");
      if (c.kind === "script_contains" && (typeof c.text !== "string" || !c.text || c.text.length > 10000))
        fail("Укажите проверяемый фрагмент");
      return { ...c, id: "c" + (i + 1), label: String(c.label || c.path).slice(0, 300) };
    });
    const maxCalls = Number(input.maxCalls ?? 40),
      maxMinutes = Number(input.maxMinutes ?? 15);
    if (
      !Number.isInteger(maxCalls) ||
      maxCalls < 1 ||
      maxCalls > 500 ||
      !Number.isFinite(maxMinutes) ||
      maxMinutes < 1 ||
      maxMinutes > 120
    )
      fail("Budget out of range");
    const now = new Date().toISOString();
    const t: PlatformTask = {
      version: 1,
      id: "task_" + crypto.randomBytes(8).toString("hex"),
      goal: input.goal.trim(),
      mode: input.mode,
      state: "PLANNED",
      binding,
      createdAt: now,
      updatedAt: now,
      pausedMs: 0,
      maxCalls,
      maxMinutes,
      calls: 0,
      revision: 0,
      criteria,
      evidence: [],
      plan: (Array.isArray(input.plan) ? input.plan : [])
        .slice(0, 40)
        .map((title: any, i: number) => ({
          id: "p" + i,
          title: String(title).slice(0, 500),
          state: "planned",
        })),
    };
    this.tasks.set(t.id, t);
    this.save(t);
    return t;
  }
  control(id: string, action: string, sessionId?: string) {
    const t = this.get(id);
    if (action === "start" || action === "resume") {
      if (["DONE", "CANCELLED", "FAILED"].includes(t.state)) fail("Terminal task cannot resume", 409);
      if (!sessionId) fail("Studio session required", 409);
      const busy = this.forSession(sessionId);
      if (busy && busy.id !== id && ["RUNNING", "PAUSED"].includes(busy.state))
        fail("Сессия занята другой задачей", 409);
      if (t.pausedAt) t.pausedMs += Math.max(0, Date.now() - Date.parse(t.pausedAt));
      t.pausedAt = undefined;
      t.sessionId = sessionId;
      t.evidence=[];t.revision++;
      t.startedAt ??= new Date().toISOString();
      t.state = "RUNNING";
      t.reason = undefined;
    } else if (action === "pause") {
      if (t.state !== "RUNNING") fail("Task is not running", 409);
      t.state = "PAUSED";
      t.pausedAt = new Date().toISOString();
    } else if (action === "cancel") {
      if (t.state === "DONE") fail("Completed task cannot be cancelled", 409);
      t.state = "CANCELLED";
      t.reason = "Cancelled. In-flight remote side effects are not automatically undone.";
    } else fail("Unknown task control");
    this.save(t);
    return t;
  }
  check(t: PlatformTask, write: boolean) {
    if (t.state !== "RUNNING") return "Task is " + t.state;
    if (t.mode === "plan" && write) return "Plan mode forbids mutations";
    if (t.calls >= t.maxCalls) return "Operation budget reached";
    const elapsed = Date.now() - Date.parse(t.startedAt ?? t.createdAt) - t.pausedMs;
    if (elapsed >= t.maxMinutes * 60000) return "Time budget reached";
    return null;
  }
  consume(t: PlatformTask, write: boolean) {
    const e = this.check(t, write);
    if (e) {
      if (/budget/.test(e)) {
        t.state = "BLOCKED";
        t.reason = e;
        this.save(t);
      }
      fail(e, 409);
    }
    t.calls++;
    if (write) {
      t.revision++;
      t.evidence = [];
    }
    this.save(t);
  }
  beginWrite(t: PlatformTask) {
    this.writes.set(t.id, (this.writes.get(t.id) ?? 0) + 1);
  }
  endWrite(t: PlatformTask) {
    this.writes.set(t.id, Math.max(0, (this.writes.get(t.id) ?? 1) - 1));
    this.invalidate(t);
  }
  invalidate(t: PlatformTask) {
    t.revision++;
    t.evidence = [];
    if (t.state === "DONE") t.state = "PARTIAL";
    this.save(t);
  }
  addEvidence(t: PlatformTask, ev: Evidence) {
    t.evidence = t.evidence.filter((e) => e.criterionId !== ev.criterionId);
    t.evidence.push(ev);
    this.save(t);
  }
  claim(id: string, summary: string) {
    const t = this.get(id);
    if (["CANCELLED", "DONE"].includes(t.state)) return t;
    const passed =
      !this.writes.get(t.id) &&
      t.state === "RUNNING" &&
      t.criteria.length > 0 &&
      t.criteria.every((c) =>
        t.evidence.some(
          (e) =>
            e.criterionId === c.id &&
            e.status === "passed" &&
            e.revision === t.revision &&
            JSON.stringify(e.binding) === JSON.stringify(t.binding),
        ),
      );
    if (this.writes.get(t.id))
      fail("Modifying operation still in flight. Wait before claiming completion.", 409);
    t.summary = summary.slice(0, 4000);
    t.state = passed
      ? "DONE"
      : t.evidence.some((e) => e.status === "failed")
        ? "FAILED"
        : t.evidence.some((e) => e.status === "blocked")
          ? "BLOCKED"
          : "PARTIAL";
    t.reason = passed
      ? undefined
      : "Completion has insufficient acceptance evidence. Transport success and AI reports are not verification.";
    this.save(t);
    return t;
  }
  block(id: string, reason: string) {
    const t = this.get(id);
    if (t.state !== "CANCELLED" && t.state !== "DONE") {
      t.state = "BLOCKED";
      t.reason = reason;
      this.save(t);
    }
    return t;
  }
  tree(id: string, operations: OperationRecord[]) {
    const t = this.get(id);
    return {
      id: t.id,
      goal: t.goal,
      state: t.state,
      binding: t.binding,
      criteria: t.criteria.map((c) => ({
        ...c,
        evidence: t.evidence.find((e) => e.criterionId === c.id) ?? null,
      })),
      operations: operations
        .filter((o) => o.taskId === id)
        .map((o) => ({
          id: o.id,
          tool: o.tool,
          state: o.state,
          status: o.result?.status,
          binding: o.binding,
          createdAt: o.createdAt,
          taskRevision: o.taskRevision,
        })),
      plan: t.plan,
      limitations: ["Task/object relationships only; not a full dependency or Live Game Graph."],
    };
  }
}
