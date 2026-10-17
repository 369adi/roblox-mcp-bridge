/**
 * M1 "fast response" — pure, DOM-free building blocks used by AgentCore:
 *  - ReplyEndDetector: end of reply = the provider's Stop signal disappears + a short quiet check;
 *    providers without a detectable Stop signal fall back to the classic settle timeout.
 *  - CallScheduler: read-only calls run immediately (parallel, limited); writes run strictly in order;
 *    a call submitted after a write waits for it (reads never see stale state); duplicates never run.
 *  - StepTimer: durations of each step of a turn for the panel.
 *  - instructionPlan: full instructions once per session; later turns only results + a short reminder.
 */

export interface EndOptions {
  /** quiet time after the Stop signal disappeared (default 250 ms) */
  fastEndMs: number;
  /** classic settle timeout for providers without a Stop signal */
  settleMs: number;
}

export type EndVia = "stop" | "settle";

export class ReplyEndDetector {
  private opts: EndOptions;
  private sawStop = false;
  private stopGoneAt = 0;
  private lastChange = 0;
  constructor(opts: EndOptions) {
    this.opts = opts;
  }
  /** New reply expected (we just sent a message). */
  reset(now: number) {
    this.sawStop = false;
    this.stopGoneAt = 0;
    this.lastChange = now;
  }
  /**
   * One observation. stopVisible = explicit provider Stop/streaming signal (null = provider has none).
   * changed = the assistant text/DOM changed since the previous sample.
   */
  sample(now: number, stopVisible: boolean | null, changed: boolean) {
    if (changed) this.lastChange = now;
    if (stopVisible === true) {
      this.sawStop = true;
      this.stopGoneAt = 0;
      this.lastChange = now;
    } else if (stopVisible === false && this.sawStop && !this.stopGoneAt) this.stopGoneAt = now;
  }
  /** The Stop signal was seen for the current reply (fast path available). */
  get fastPath() {
    return this.sawStop;
  }
  quietMs(now: number) {
    return now - this.lastChange;
  }
  /** null = not finished yet. */
  done(now: number, settleMs = this.opts.settleMs): EndVia | null {
    if (this.sawStop) {
      if (!this.stopGoneAt) return null;
      return now - Math.max(this.stopGoneAt, this.lastChange) >= this.opts.fastEndMs ? "stop" : null;
    }
    return now - this.lastChange >= settleMs ? "settle" : null;
  }
}

export type CallRisk = "read" | "write";

export interface SchedulerOptions {
  readParallel: number;
}

/** Stable key for dedupe: call id + tool + args hash, scoped to one reply. */
export function callKey(replyIndex: number, c: { id: string; tool: string; args: unknown }): string {
  return `${replyIndex}|${c.id}|${c.tool}|${stableJson(c.args)}`;
}

export function stableJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
  const o = v as Record<string, unknown>;
  return "{" + Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + stableJson(o[k])).join(",") + "}";
}

export class CallScheduler<R> {
  private opts: SchedulerOptions;
  private seen = new Map<string, Promise<R>>();
  /** resolves when every write submitted so far has finished */
  private writeTail: Promise<unknown> = Promise.resolve();
  /** resolves when every call submitted so far has finished (a write waits for all earlier calls) */
  private allTail: Promise<unknown> = Promise.resolve();
  private running = 0;
  private readQueue: Array<() => void> = [];
  readonly order: string[] = [];
  constructor(opts: SchedulerOptions) {
    this.opts = { readParallel: Math.max(1, Math.floor(opts.readParallel || 1)) };
  }
  has(key: string) {
    return this.seen.has(key);
  }
  get size() {
    return this.seen.size;
  }
  /** Returns the (shared) promise; a duplicate key returns the first promise and never re-runs. */
  submit(key: string, risk: CallRisk, run: () => Promise<R>): Promise<R> {
    const prev = this.seen.get(key);
    if (prev) return prev;
    this.order.push(key);
    const swallow = (p: Promise<unknown>) => p.then(() => undefined, () => undefined);
    let p: Promise<R>;
    if (risk === "read") {
      const gate = this.writeTail;
      p = swallow(gate).then(() => this.withReadSlot(run));
    } else {
      const gate = this.allTail;
      p = swallow(gate).then(run);
      this.writeTail = swallow(Promise.all([this.writeTail, p]));
    }
    this.allTail = swallow(Promise.all([this.allTail, p]));
    this.seen.set(key, p);
    return p;
  }
  /** Wait until everything submitted so far has settled. */
  async drain(): Promise<void> {
    let n = -1;
    while (n !== this.seen.size) {
      n = this.seen.size;
      await Promise.allSettled([...this.seen.values()]);
    }
  }
  private async withReadSlot(run: () => Promise<R>): Promise<R> {
    if (this.running >= this.opts.readParallel) await new Promise<void>((r) => this.readQueue.push(r));
    this.running++;
    try {
      return await run();
    } finally {
      this.running--;
      this.readQueue.shift()?.();
    }
  }
}

export interface StepTiming {
  step: string;
  ms: number;
}

export class StepTimer {
  readonly steps: StepTiming[] = [];
  private now: () => number;
  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }
  add(step: string, ms: number) {
    this.steps.push({ step, ms: Math.max(0, Math.round(ms)) });
  }
  async time<T>(step: string, fn: () => Promise<T> | T): Promise<T> {
    const t = this.now();
    try {
      return await fn();
    } finally {
      this.add(step, this.now() - t);
    }
  }
  summary(): string {
    return this.steps.map((s) => `${s.step} ${fmtMs(s.ms)}`).join(" · ");
  }
}

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export type InstructionReason = "session_start" | "new_chat" | "context_lost" | "user_request";

/**
 * Full instructions once per session (and chat). Later turns: results + short reminder only.
 */
export class InstructionPlan {
  private sentFor: { session: string; chat: string } | null = null;
  private forced: InstructionReason | null = null;
  needsFull(session: string, chat: string): InstructionReason | null {
    if (this.forced) return this.forced;
    if (!this.sentFor || this.sentFor.session !== session) return "session_start";
    if (this.sentFor.chat !== chat) return "new_chat";
    return null;
  }
  markSent(session: string, chat: string) {
    this.sentFor = { session, chat };
    this.forced = null;
  }
  force(reason: InstructionReason) {
    this.forced = reason;
  }
  restore(v: { session: string; chat: string } | null | undefined) {
    this.sentFor = v ?? null;
  }
  get state() {
    return this.sentFor;
  }
}
