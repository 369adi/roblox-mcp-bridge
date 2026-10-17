import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ToolResult, ToolCall } from "../../shared/src/protocol.js";
export interface ProjectBinding {
  studioId: string;
  placeId: string | null;
  name: string;
  projectKey: string;
}
export interface OperationRecord {
  id: string;
  key: string;
  callId: string;
  sessionId?: string;
  taskId?: string;
  tool: string;
  args: unknown;
  binding: ProjectBinding | null;
  risk: string;
  state: "running" | "finished" | "uncertain";
  createdAt: string;
  endedAt?: string;
  result?: ToolResult;
  taskRevision?: number;
}
export function canonical(v: unknown): string {
  if (v === undefined) return "null";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
  return (
    "{" +
    Object.keys(v as object)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical((v as any)[k]))
      .join(",") +
    "}"
  );
}
export const digest = (v: unknown) => crypto.createHash("sha256").update(canonical(v)).digest("hex");
export class OperationStore {
  private dir: string;
  private rows = new Map<string, OperationRecord>();
  private byKey = new Map<string, string>();
  private actionKeys = new Map<string, string>();
  private pending = new Map<string, Promise<ToolResult>>();
  private locks = new Map<string, Promise<unknown>>();
  loadErrors: string[] = [];
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "operations-v1");
    fs.mkdirSync(this.dir, { recursive: true });
    for (const name of fs.readdirSync(this.dir).filter((n) => /^op_[a-f0-9]{24}\.json$/.test(n))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(this.dir, name), "utf8")) as OperationRecord;
        if (!r.id || !r.key || !r.tool || !["running", "finished", "uncertain"].includes(r.state))
          throw Error("invalid");
        if (r.state === "running") {
          r.state = "uncertain";
          this.persist(r);
        }
        this.rows.set(r.id, r);
        this.byKey.set(r.key, r.id);
        if (r.risk !== "read")
          this.actionKeys.set(this.actionKey(r.sessionId, r.taskId, r.callId, r.binding), r.key);
      } catch {
        this.loadErrors.push(name);
      }
    }
  }
  private actionKey(
    sessionId: string | undefined,
    taskId: string | undefined,
    callId: string,
    binding: ProjectBinding | null,
  ) {
    return digest([sessionId ?? "manual", taskId ?? "", callId, binding?.studioId ?? "external"]);
  }
  private persist(r: OperationRecord) {
    const file = path.join(this.dir, r.id + ".json");
    fs.writeFileSync(file + ".tmp", JSON.stringify(r), { mode: 0o600 });
    fs.renameSync(file + ".tmp", file);
  }
  list(taskId?: string) {
    return [...this.rows.values()]
      .filter((r) => !taskId || r.taskId === taskId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 500);
  }
  async execute(
    call: ToolCall,
    ctx: {
      sessionId?: string;
      taskId?: string;
      binding: ProjectBinding | null;
      risk: string;
      args: unknown;
      taskRevision?: number;
    },
    run: () => Promise<ToolResult>,
  ): Promise<ToolResult> {
    const write = ctx.risk !== "read";
    const key = digest([
      ctx.sessionId ?? "manual",
      ctx.taskId ?? "",
      call.id,
      call.tool,
      call.args,
      ctx.binding,
    ]);
    const actionKey = this.actionKey(ctx.sessionId, ctx.taskId, call.id, ctx.binding);
    if (write && this.actionKeys.has(actionKey) && this.actionKeys.get(actionKey) !== key)
      return {
        id: call.id,
        status: "denied",
        result: null,
        error:
          "Action ID reused with different arguments/tool/binding. Use a new explicit action ID only after inspecting the previous operation.",
      };
    if (write) this.actionKeys.set(actionKey, key);
    if (write && this.pending.has(key)) return this.pending.get(key)!;
    const old = write ? this.rows.get(this.byKey.get(key) ?? "") : undefined;
    if (old) {
      if (old.state === "uncertain" || old.state === "running")
        return {
          id: call.id,
          status: "denied",
          result: null,
          error:
            "Outcome of an earlier operation is uncertain. Inspect current project; do not replay automatically.",
        };
      if (old.result && ["success", "timeout", "error"].includes(old.result.status))
        return {
          ...old.result,
          meta: { ...old.result.meta, operationId: old.id, replayed: false, deduplicated: true } as any,
        };
    }
    const r: OperationRecord = {
      id: "op_" + crypto.randomBytes(12).toString("hex"),
      key: write ? key : digest([key, Date.now(), Math.random()]),
      callId: call.id,
      tool: call.tool,
      args: ctx.args,
      binding: ctx.binding,
      risk: ctx.risk,
      state: "running",
      createdAt: new Date().toISOString(),
      ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
      ...(ctx.taskId ? { taskId: ctx.taskId, taskRevision: ctx.taskRevision } : {}),
    };
    this.rows.set(r.id, r);
    this.byKey.set(r.key, r.id);
    if (r.risk !== "read")
      this.actionKeys.set(this.actionKey(r.sessionId, r.taskId, r.callId, r.binding), r.key);
    this.persist(r); // durable PREPARE before any side effects
    const work = (async () => {
      let result: ToolResult;
      try {
        result = await run();
      } catch (e) {
        result = { id: call.id, status: "error", result: null, error: (e as Error).message };
      }
      r.state = write && ["timeout", "error"].includes(result.status) ? "uncertain" : "finished";
      r.endedAt = new Date().toISOString();
      r.result = {
        ...result,
        meta: {
          ...result.meta,
          operationId: r.id,
          verification: "transport-only",
          mayHaveChanged: write && ["timeout", "error"].includes(result.status),
        } as any,
      };
      this.persist(r);
      return r.result;
    })();
    if (write) this.pending.set(key, work);
    try {
      return await work;
    } finally {
      this.pending.delete(key);
    }
  }
  async serialize<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(fn);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }
}
