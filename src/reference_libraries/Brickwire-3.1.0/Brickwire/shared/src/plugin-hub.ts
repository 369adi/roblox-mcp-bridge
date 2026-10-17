/**
 * Studio plugin hub: Roblox Studio plugin ⇄ bridge ⇄ extension (AI chat tab).
 *
 *  plugin  POST /api/plugin/request   → a request (text + images + selection) is queued
 *  ext     GET  /api/plugin/next      → takes the request (prefers the tab with a running agent session) + control actions
 *  ext     POST /api/plugin/event     → reply text, activity rows, stage, notices …
 *  plugin  GET  /api/plugin/feed      → long-poll of those events
 */
export interface PluginImage {
  name: string;
  mime: string;
  /** base64 without data: prefix */
  data: string;
}
export type PluginRequestState = "queued" | "taken" | "delivered" | "failed";
export interface PluginRequest {
  id: string;
  text: string;
  images: PluginImage[];
  files?: PluginImage[];
  selection: string[];
  place?: string;
  provider?: string;
  createdAt: number;
  takenAt?: number;
  takenBy?: string;
  state: PluginRequestState;
  error?: string;
  waitNoted?: boolean;
}
export type PluginControl = "stop" | "pause" | "resume";
export interface PluginEvent {
  seq: number;
  ts: number;
  type: string;
  [k: string]: unknown;
}
export interface PluginTab {
  tab: string;
  provider: string;
  providerName?: string;
  active: boolean;
  /** the agent is between turns and can take a new user request (false while it works) */
  ready?: boolean;
  paused?: boolean;
  stage?: string;
  task?: string | null;
  url?: string;
  at: number;
}

export const PLUGIN_MAX_IMAGES = 4;
export const PLUGIN_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const PLUGIN_TAKE_TIMEOUT = 120_000;
/** A tab that polled within this window counts as connected. */
export const PLUGIN_TAB_TTL = 8_000;
/** An idle tab only takes a request when no session tab picked it up within this time. */
export const PLUGIN_ACTIVE_PREFERENCE_MS = 3_000;

export class PluginHub {
  private requests = new Map<string, PluginRequest>();
  private events: PluginEvent[] = [];
  private seq = 0;
  private reqSeq = 0;
  private waiters = new Set<() => void>();
  private tabs = new Map<string, PluginTab>();
  private controls: Array<{ action: PluginControl; at: number }> = [];
  private now: () => number;
  /** 3.0: stores attached images/files where the AI's file tools can reach them; returns a line per file ("name → fileId"). */
  attachmentSink: ((items: PluginImage[]) => string[]) | null = null;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  addRequest(input: { text?: unknown; images?: unknown; files?: unknown; selection?: unknown; place?: unknown; provider?: unknown }): PluginRequest {
    const text = String(input.text ?? "").slice(0, 60000);
    const images: PluginImage[] = [];
    for (const raw of Array.isArray(input.images) ? input.images.slice(0, PLUGIN_MAX_IMAGES) : []) {
      const im = raw as Partial<PluginImage>;
      let data = String(im?.data ?? "");
      if (data.startsWith("data:")) data = data.slice(data.indexOf(",") + 1);
      data = data.replace(/\s+/g, "");
      if (!data) continue;
      if (!/^[A-Za-z0-9+/=]+$/.test(data)) throw new Error("image data must be base64");
      if (data.length * 0.75 > PLUGIN_MAX_IMAGE_BYTES) throw new Error("image too large (max 8 MB)");
      const name = String(im?.name ?? `studio-image-${images.length + 1}.png`).slice(0, 120);
      const mime = String(im?.mime ?? (/\.jpe?g$/i.test(name) ? "image/jpeg" : "image/png"));
      images.push({ name, mime, data });
    }
    const files: PluginImage[] = [];
    if (Array.isArray(input.files) && input.files.length > 6) throw Error("Up to 6 files allowed");
    for (const raw of Array.isArray(input.files) ? input.files : []) {
      const f = raw as Partial<PluginImage>, data = String(f?.data || "");
      if (!data || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data) || data.length * .75 > PLUGIN_MAX_IMAGE_BYTES) throw Error("File must be valid base64, up to 8 MB");
      files.push({ name:String(f.name || "attachment").replace(/[\\/\x00-\x1f]/g,"_").slice(0,180),mime:"application/octet-stream",data });
    }
    if (images.length + files.length > 6 || [...images,...files].reduce((n,f)=>n+f.data.length*.75,0) > 24*1024*1024) throw Error("Up to 6 attachments / 24 MB allowed");
    const selection = (Array.isArray(input.selection) ? input.selection : []).map((s) => String(s).slice(0, 300)).slice(0, 50);
    if (!text.trim() && !images.length && !files.length) throw new Error("nothing to send (no text and no image)");
    let aiText = text;
    if (this.attachmentSink && (images.length || files.length)) {
      try { const lines = this.attachmentSink([...images, ...files]); if (lines.length) aiText = `${text}${text ? "\n\n" : ""}[Brickwire] Attached files are also stored for your file tools (file_show / file_to_studio / file_upload_roblox / file_read):\n${lines.map((l) => "- " + l).join("\n")}`; } catch { /* storage problem: still deliver the request */ }
    }
    const req: PluginRequest = {
      id: `pr_${this.now().toString(36)}_${++this.reqSeq}`,
      text: aiText,
      images,
      ...(files.length ? {files} : {}),
      selection,
      place: input.place ? String(input.place).slice(0, 200) : undefined,
      provider: input.provider ? String(input.provider) : undefined,
      createdAt: this.now(),
      state: "queued",
    };
    this.requests.set(req.id, req);
    this.push({ type: "user", id: req.id, text, images: images.map((i) => i.name), selection });
    this.gc();
    return req;
  }

  /** Extension tab polls: reports its state, gets the next request and pending control actions. */
  poll(tab: Omit<PluginTab, "at">): { request: PluginRequest | null; controls: PluginControl[] } {
    const t = this.now();
    const prev = this.tabs.get(tab.tab);
    this.tabs.set(tab.tab, { ...tab, at: t });
    if (!prev || prev.active !== tab.active || prev.stage !== tab.stage || prev.paused !== tab.paused) this.push({ type: "status", status: this.status() });
    for (const r of this.requests.values()) {
      if (r.state === "taken" && r.takenAt !== undefined && t - r.takenAt > PLUGIN_TAKE_TIMEOUT) r.state = "queued";
    }
    // control actions go to the tab with the running session
    let controls: PluginControl[] = [];
    if (tab.active || !this.liveTabs().some((x) => x.active)) {
      controls = this.controls.filter((c) => t - c.at < 30_000).map((c) => c.action);
      this.controls = [];
    }
    const sessionTabs = this.liveTabs().filter((x) => x.active);
    for (const r of this.requests.values()) {
      if (r.state !== "queued") continue;
      if (r.provider && r.provider !== tab.provider) continue;
      // a running agent session owns the requests; an idle tab only takes one when no session tab is
      // connected (it then starts a session). A tab that has not polled yet gets a short head start.
      if (!tab.active && (sessionTabs.length || t - r.createdAt < PLUGIN_ACTIVE_PREFERENCE_MS && this.liveTabs().some((x) => x.tab !== tab.tab))) continue;
      if (tab.active && tab.ready === false) {
        // the agent is mid-turn: keep it queued, tell the plugin once
        if (!r.waitNoted) {
          r.waitNoted = true;
          this.push({ type: "request", id: r.id, state: "waiting", provider: tab.providerName ?? tab.provider });
        }
        continue;
      }
      r.state = "taken";
      r.takenAt = t;
      r.takenBy = tab.tab;
      this.push({ type: "request", id: r.id, state: "taken", provider: tab.providerName ?? tab.provider });
      return { request: r, controls };
    }
    return { request: null, controls };
  }

  report(id: string, ok: boolean, error?: string): PluginRequest | null {
    const r = this.requests.get(id);
    if (!r) return null;
    r.state = ok ? "delivered" : "failed";
    r.error = ok ? undefined : String(error ?? "send failed").slice(0, 300);
    r.images = []; r.files = []; // free memory: the chat has it now
    this.push({ type: "request", id, state: r.state, error: r.error });
    return r;
  }

  control(action: PluginControl) {
    this.controls.push({ action, at: this.now() });
    this.push({ type: "control", action });
  }

  /** Events from the extension (reply text, activity rows, stage, notices). */
  pushFromExtension(events: unknown[]) {
    for (const raw of events.slice(0, 50)) {
      if (!raw || typeof raw !== "object") continue;
      const e = { ...(raw as Record<string, unknown>) };
      const type = String(e.type ?? "");
      if (!/^(reply|activity|stage|task|notice|done|ask|session)$/.test(type)) continue;
      delete e.seq;
      delete e.ts;
      for (const k of Object.keys(e)) if (typeof e[k] === "string") e[k] = (e[k] as string).slice(0, 20000);
      this.push({ ...e, type });
    }
  }

  push(e: { type: string; [k: string]: unknown }): PluginEvent {
    const ev = { ...e, seq: ++this.seq, ts: this.now() } as PluginEvent;
    // streaming reply snapshots replace each other: keep only the latest one per reply key
    if (ev.type === "reply" && ev.partial && ev.key) {
      const i = this.events.findIndex((x) => x.type === "reply" && x.partial && x.key === ev.key);
      if (i >= 0) this.events.splice(i, 1);
    }
    this.events.push(ev);
    if (this.events.length > 600) this.events.splice(0, this.events.length - 600);
    for (const w of Array.from(this.waiters)) w();
    return ev;
  }

  eventsSince(since: number): PluginEvent[] {
    return this.events.filter((e) => e.seq > since);
  }

  /** Long-poll: resolves as soon as there are events after `since` (or after waitMs). */
  async feed(since: number, waitMs: number): Promise<{ events: PluginEvent[]; last: number; status: ReturnType<PluginHub["status"]> }> {
    // the bridge restarted (seq reset) → hand the plugin everything we have
    if (since > this.seq) since = 0;
    let ev = this.eventsSince(since);
    if (!ev.length && waitMs > 0) {
      await new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer);
          this.waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, waitMs);
        this.waiters.add(done);
      });
      ev = this.eventsSince(since);
    }
    return { events: ev, last: this.seq, status: this.status() };
  }

  liveTabs(): PluginTab[] {
    const t = this.now();
    return Array.from(this.tabs.values()).filter((x) => t - x.at < PLUGIN_TAB_TTL);
  }

  status() {
    const tabs = this.liveTabs();
    const active = tabs.find((x) => x.active) ?? null;
    return {
      browser: tabs.length > 0,
      tabs: tabs.map((x) => ({ provider: x.provider, providerName: x.providerName ?? x.provider, active: x.active, paused: !!x.paused, stage: x.stage ?? null })),
      session: active ? { provider: active.providerName ?? active.provider, paused: !!active.paused, stage: active.stage ?? null, task: active.task ?? null } : null,
      queued: Array.from(this.requests.values()).filter((r) => r.state === "queued" || r.state === "taken").length,
    };
  }

  getRequest(id: string) {
    return this.requests.get(id) ?? null;
  }

  private gc() {
    const t = this.now();
    for (const [id, r] of this.requests) if ((r.state === "delivered" || r.state === "failed") && (t - r.createdAt > 3_600_000 || this.requests.size > 40)) this.requests.delete(id);
  }
}
