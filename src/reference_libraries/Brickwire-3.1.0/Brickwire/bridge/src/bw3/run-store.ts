/**
 * Brickwire 3.0 runs: one record per chat turn / autopilot execution with a bounded, ordered event log.
 * Events are appended only when the corresponding work actually happens (no synthetic progress).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

export type RunState = "queued" | "running" | "waiting_approval" | "done" | "partial" | "blocked" | "failed" | "cancelled" | "interrupted";
export const TERMINAL: RunState[] = ["done", "partial", "blocked", "failed", "cancelled", "interrupted"];
export interface RunEvent { seq: number; at: string; type: string; stage?: string; title: string; detail?: string; data?: unknown; planStep?: string }
export interface PlanStep { id: string; title: string; deps: string[]; state: "planned" | "running" | "done" | "failed" | "skipped"; detail?: string; criteria?: string[] }
export interface RunSettings { mode: "standard" | "super"; depth: 1 | 2 | 3; maxIterations: number; verificationPasses: number; autoSkills: boolean; manualSkills: string[]; permission: "confirm" | "auto_read"; model?: string }
export interface RunRecord {
  attachments?: string[]; inputContext?: string; id: string; version: 1; conversationId?: string; messageId?: string; goal: string; intent: string;
  state: RunState; stage: string; settings: RunSettings; createdAt: string; updatedAt: string; endedAt?: string;
  skills?: unknown; plan: PlanStep[]; events: RunEvent[]; seq: number; artifacts: string[];
  taskId?: string; sessionId?: string; iterations: number; verification: Array<{ pass: number; ok: boolean; by: string; notes: string }>;
  reply?: string; error?: string; retryOf?: string; fromRun?: string; model?: string; path: "local-asset" | "studio-agent" | "chat-llm" | "browser-agent" | "none";
}
const MAX_EVENTS = 600;
export class RunStore extends EventEmitter {
  private dir: string;
  private rows = new Map<string, RunRecord>();
  private timers = new Map<string, NodeJS.Timeout>();
  loadErrors: string[] = [];
  /** Live reply text per active run, so a client that (re)connects mid-stream can replay what it missed. */
  private drafts = new Map<string, string>();
  constructor(dataDir: string) {
    super(); this.setMaxListeners(200);
    this.on("delta", (id: string, d: string | null) => { if (typeof d === "string" && d) this.drafts.set(id, ((this.drafts.get(id) ?? "") + d).slice(-400_000)); });
    this.on("delta-replace", (id: string, d: string) => { this.drafts.set(id, String(d ?? "").slice(-400_000)); });
    this.dir = path.join(dataDir, "bw3-runs-v1");
    fs.mkdirSync(this.dir, { recursive: true });
    for (const n of fs.readdirSync(this.dir).filter((n) => /^run_[a-f0-9]{16}\.json$/.test(n))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(this.dir, n), "utf8")) as RunRecord;
        if (r.version !== 1 || !r.id) throw Error("invalid");
        if (!TERMINAL.includes(r.state)) { r.state = "interrupted"; r.error = "Application restarted while this run was active; nothing further was executed."; r.events.push({ seq: ++r.seq, at: new Date().toISOString(), type: "state", title: "Interrupted by application restart" }); this.write(r); }
        this.rows.set(r.id, r);
      } catch { this.loadErrors.push(n); }
    }
  }
  create(input: Pick<RunRecord, "goal" | "intent" | "settings" | "path"> & Partial<RunRecord>) {
    const now = new Date().toISOString();
    const r: RunRecord = { version: 1, id: "run_" + crypto.randomBytes(8).toString("hex"), state: "queued", stage: "QUEUED", createdAt: now, updatedAt: now, plan: [], events: [], seq: 0, artifacts: [], iterations: 0, verification: [], ...input } as RunRecord;
    this.rows.set(r.id, r); this.write(r); return r;
  }
  get(id: string) { const r = this.rows.get(String(id)); if (!r) throw Object.assign(new Error("Run not found"), { status: 404 }); return r; }
  has(id: string) { return this.rows.has(id); }
  list(filter: { conversationId?: string } = {}) { return [...this.rows.values()].filter((r) => !filter.conversationId || r.conversationId === filter.conversationId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  active() { return [...this.rows.values()].filter((r) => !TERMINAL.includes(r.state)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  event(id: string, e: Omit<RunEvent, "seq" | "at">) {
    const r = this.get(id);
    const ev: RunEvent = { seq: ++r.seq, at: new Date().toISOString(), ...e };
    if (e.stage) r.stage = e.stage;
    r.events.push(ev);
    if (r.events.length > MAX_EVENTS) r.events.splice(0, r.events.length - MAX_EVENTS);
    this.touch(r); this.emit("event", r.id, ev); return ev;
  }
  patch(id: string, p: Partial<RunRecord>) { const r = this.get(id); Object.assign(r, p); this.touch(r, true); this.emit("event", r.id, null); return r; }
  step(id: string, stepId: string, state: PlanStep["state"], detail?: string) {
    const r = this.get(id), s = r.plan.find((x) => x.id === stepId); if (!s) return;
    s.state = state; if (detail !== undefined) s.detail = detail.slice(0, 2000);
    this.event(id, { type: "plan", title: `${s.title}: ${state}`, detail, planStep: stepId });
  }
  finish(id: string, state: RunState, p: Partial<RunRecord> = {}) {
    const r = this.get(id); if (TERMINAL.includes(r.state)) return r;
    Object.assign(r, p, { state, endedAt: new Date().toISOString() });
    this.drafts.delete(id);
    this.event(id, { type: "state", stage: state === "done" ? "DONE" : state.toUpperCase(), title: `Run ${state}`, detail: p.error ?? undefined });
    this.write(r); return r;
  }
  draft(id: string) { const r = this.rows.get(id); return r && !TERMINAL.includes(r.state) ? this.drafts.get(id) ?? "" : ""; }
  since(id: string, after: number) { const r = this.get(id); return r.events.filter((e) => e.seq > after); }
  private touch(r: RunRecord, now = false) {
    r.updatedAt = new Date().toISOString();
    if (now) { this.write(r); return; }
    if (this.timers.has(r.id)) return;
    this.timers.set(r.id, setTimeout(() => { this.timers.delete(r.id); this.write(r); }, 120));
  }
  private write(r: RunRecord) { const f = path.join(this.dir, r.id + ".json"); fs.writeFileSync(f + ".tmp", JSON.stringify(r)); fs.renameSync(f + ".tmp", f); }
  flush() { for (const [id, t] of this.timers) { clearTimeout(t); this.timers.delete(id); this.write(this.get(id)); } }
}
