import type { AgentCategory, AgentStage, CallEnvelope, HealthResponse, SafetyMode, ToolCall, ToolDescriptor, ToolResult } from "../../../shared/src/protocol.js";
import { buildAgentPrompt, CATEGORY_INFO, REMINDERS, formatToolResults, superSection, newToolsNotice } from "../../../shared/src/instructions.js";
import { every, sleep } from "./clock.js";
import { assessCall } from "../../../shared/src/safety.js";
import type { ParseOutput } from "../../../shared/src/parser.js";
import { newMarkerId, type ProviderAdapter } from "../adapters/base.js";
import { hashText, composerText, setComposerText } from "../adapters/dom.js";
import type { BridgeClient } from "./bridge-client.js";
import { prefsFor, type ExtensionSettings, type ProviderPrefs } from "./settings.js";
import { clearRun, loadRun, saveRun, type InflightBatch, type SavedRun } from "./persist.js";
import { CallScheduler, ReplyEndDetector, StepTimer, callKey, fmtMs } from "./fast-turn.js";
import { HangMonitor, CONTINUE_MESSAGE } from "../../../shared/src/hang-monitor.js";

export type ActivityState = "done" | "run" | "wait" | "error" | "info";

export interface AgentUI {
  setConnection(s: { online: boolean; health?: HealthResponse; error?: string }): void;
  setSession(s: { active: boolean; paused: boolean; sessionId: string | null }): void;
  setStage(stage: AgentStage): void;
  setTask(task: string | null): void;
  activity(key: string, text: string, state: ActivityState): void;
  showApproval(env: CallEnvelope | null): void;
  notify(msg: string, level: "info" | "warn" | "error"): void;
}

const TEST_TOOLS = /^(start_stop_play|get_console_output|get_errors|character_navigation|user_keyboard_input|user_mouse_input|screen_capture|get_studio_state)$/;
const STAGES: AgentStage[] = ["ANALYZE", "PLAN", "EXECUTE", "TEST", "FIX", "DONE"];

/**
 * AgentCore — provider-independent agent loop:
 * observe assistant output → parse structured commands → execute through the bridge →
 * inject results → verify → repeat; with reminders, approval, pause/stop and guards.
 */
export class AgentCore {
  active = false;
  paused = false;
  /** Studio plugin link: every activity row / reply / stage change is mirrored here (see core/plugin-link.ts). */
  onPluginEvent: ((e: { type: string; [k: string]: unknown }) => void) | null = null;
  private emit(e: { type: string; [k: string]: unknown }) {
    try {
      this.onPluginEvent?.(e);
    } catch {
      /* the plugin link must never break the agent */
    }
  }
  private lastPartialAt = 0;
  /**
   * A new user request (Studio plugin / app) may only go out when the agent is between turns: not running
   * tools, not sending, not waiting for a reply that is still coming. Otherwise it would cut into the
   * agent's own turn (tool results + the user's message mixed, reply tracking broken).
   */
  readyForUser(): boolean {
    if (!this.active) return true;
    if (this.busy || this.sending || this.inflight || this.adapter.isGenerating()) return false;
    if (this.awaitingReply && Date.now() - (this.sentAt || 0) < 180000) return false;
    return true;
  }
  sessionId: string | null = null;
  stage: AgentStage = "IDLE";
  task: string | null = null;
  lastHealth: HealthResponse | undefined;

  private tools = new Map<string, ToolDescriptor>();
  private baselineKey = "";
  private processedKeys = new Set<string>();
  private lastSeenKey = "";
  private lastChangeAt = 0;
  private busy = false;
  /** A send is in progress (any caller). The loop and the delivery watchdog wait for it to finish. */
  private sending = 0;
  private timer: (() => void) | null = null;
  private healthTimer: (() => void) | null = null;
  private observer: MutationObserver | null = null;
  private remindersThisTurn = 0;
  private autoTurns = 0;
  private unverified = false;
  private unverifiedNagged = false;
  private executedIds = new Set<string>();
  private awaitingReply = false;
  private actSeq = 0;
  /** We (not the user) sent the message the next reply answers. */
  private agentSent = false;
  /** M1: chat path + memory of the last full-instructions send (re-sent on new chat / user request). */
  private chatPath = "";
  private lastMemory = "";
  private lastResendAt = 0;
  private lastPrompt = "";
  /** Auto-resume: turn-limit continuations used in this task, and "paused because the bridge went offline". */
  private autoResumes = 0;
  private pausedByBridge = false;
  /** First reply after instructions without a task is just "ready". */
  private awaitingReady = false;
  /** Tools executed since the user's last own message. */
  private toolsSinceUser = 0;
  private hiddenNotified = false;
  /** A message that could not be sent; retried on Resume. */
  private pendingSend: string | null = null;
  /** Last message we put into the composer (so leftover text of OURS is never mistaken for a user draft). */
  private lastInjected = "";
  /** Delivery watchdog for the last message we sent (see checkDelivery). */
  private delivery: { marker: string; text: string; at: number; count: number; tries: number; confirmed: boolean; warned: boolean } | null = null;

  private adapter: ProviderAdapter;
  /** M1 fast response */
  private endDet: ReplyEndDetector;
  /** M3 hang monitor (docs/HANGS.md) */
  private hang = new HangMonitor();
  private lastGrowthAt = Date.now();
  private sched: CallScheduler<ToolResult | null> | null = null;
  private schedReply = -1;
  private sentAt = 0;
  private stepTimer: StepTimer | null = null;
  private bridge: BridgeClient;
  private ui: AgentUI;
  private settings: ExtensionSettings;
  private onStateChange: () => void;

  constructor(adapter: ProviderAdapter, bridge: BridgeClient, ui: AgentUI, settings: ExtensionSettings, onStateChange: () => void = () => undefined) {
    this.adapter = adapter;
    this.bridge = bridge;
    this.ui = ui;
    this.settings = settings;
    this.onStateChange = onStateChange;
    this.endDet = new ReplyEndDetector({ fastEndMs: settings.fastEndMs ?? 250, settleMs: settings.settleMs });
    this.prefs = prefsFor(settings, adapter.info.id);
    // record activity rows so they can be restored after a page reload
    const orig = ui.activity.bind(ui);
    ui.activity = (key, text, state) => {
      const i = this.activityLog.findIndex((a) => a.k === key);
      if (i >= 0) this.activityLog[i] = { k: key, t: text, s: state };
      else this.activityLog.push({ k: key, t: text, s: state });
      if (this.activityLog.length > 40) this.activityLog.splice(0, this.activityLog.length - 40);
      orig(key, text, state);
      this.persist();
      this.emit({ type: "activity", key, text, state });
    };
    const origNotify = ui.notify.bind(ui);
    ui.notify = (msg, level) => {
      origNotify(msg, level);
      this.emit({ type: "notice", text: msg, level });
    };
  }

  // -------------------------------------------------------------- persistence (survives page reload)
  private activityLog: SavedRun["activity"] = [];
  private inflight: InflightBatch | null = null;
  private lastHandledCount = -1;

  private persist() {
    if (!this.active || !this.sessionId) return;
    const keep = <T,>(a: T[], n: number) => a.slice(Math.max(0, a.length - n));
    saveRun({
      v: 1,
      provider: this.adapter.info.id,
      sessionId: this.sessionId,
      path: location.pathname,
      savedAt: Date.now(),
      paused: this.paused,
      stage: this.stage,
      task: this.task,
      executed: keep([...this.executedIds], 400),
      processed: keep([...this.processedKeys], 400),
      baselineKey: this.baselineKey,
      lastHandledCount: this.lastHandledCount,
      awaitingReply: this.awaitingReply,
      awaitingReady: this.awaitingReady,
      agentSent: this.agentSent,
      toolsSinceUser: this.toolsSinceUser,
      remindersThisTurn: this.remindersThisTurn,
      autoTurns: this.autoTurns,
      unverified: this.unverified,
      unverifiedNagged: this.unverifiedNagged,
      activity: this.activityLog,
      inflight: this.inflight,
      knownTools: [...this.knownTools],
    });
  }

  /**
   * After a page reload: if this chat had a running agent and the bridge session is still alive,
   * restore everything (panel log, stage, task) and continue exactly where it stopped.
   * Calls that were running during the reload are picked up by their bridge callId — never re-run.
   */
  async tryResume(): Promise<boolean> {
    const s = await loadRun(this.adapter.info.id);
    if (!s || this.active) return false;
    if (s.path !== location.pathname) return false; // another chat — keep it for that chat
    const h = await this.bridge.health();
    if (!h.online || h.health?.session?.id !== s.sessionId) {
      if (h.online) {
        clearRun(this.adapter.info.id);
        this.ui.notify("The agent session from before the reload has ended (bridge restarted or stopped). Press Start Agent to begin a new one.", "warn");
      } else this.ui.notify("Bridge offline — start start.bat and reload the page to continue the agent from before the reload.", "warn");
      return false;
    }
    const tools = await this.bridge.tools();
    this.tools = new Map((tools ?? []).map((t) => [t.name, t]));
    // saves from before 3.0 have no list: the AI knew everything except the new file tools
    this.knownTools = new Set(s.knownTools ?? (tools ?? []).filter((t) => !t.name.startsWith("file_")).map((t) => t.name));
    this.sessionId = s.sessionId;
    this.active = true;
    this.paused = s.paused;
    this.stage = s.stage;
    this.task = s.task;
    this.executedIds = new Set(s.executed);
    this.processedKeys = new Set(s.processed);
    this.baselineKey = s.baselineKey;
    this.lastHandledCount = s.lastHandledCount;
    this.awaitingReply = s.awaitingReply;
    this.awaitingReady = s.awaitingReady;
    this.agentSent = s.agentSent;
    this.toolsSinceUser = s.toolsSinceUser;
    this.remindersThisTurn = s.remindersThisTurn;
    this.autoTurns = s.autoTurns;
    this.unverified = s.unverified;
    this.unverifiedNagged = s.unverifiedNagged;
    this.inflight = s.inflight;
    for (const a of s.activity) this.ui.activity(a.k, a.t, a.s);
    this.ui.setSession({ active: true, paused: this.paused, sessionId: this.sessionId });
    this.ui.setStage(this.stage);
    this.ui.setTask(this.task ?? "Waiting for your task");
    this.ui.activity("resume" + Date.now(), "Page reloaded — agent restored", "info");
    this.onStateChange();

    // wait until the site has re-rendered the conversation, then mark already-handled replies
    for (let i = 0; i < 40; i++) {
      if (this.adapter.readAssistantResponse().count >= Math.max(0, this.lastHandledCount)) break;
      await sleep(250);
    }
    const cur = this.adapter.readAssistantResponse();
    const curKey = this.keyOf(cur.count, cur.text);
    if (cur.count <= this.lastHandledCount || this.inflight) {
      this.processedKeys.add(curKey);
      this.baselineKey = curKey;
    }
    this.lastSeenKey = curKey;
    this.lastChangeAt = Date.now();
    this.observer = new MutationObserver(() => this.onMutation());
    this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    this.timer = every(500, () => void this.tickLoop());
    this.persist();
    if (this.inflight) {
      this.busy = true;
      void this.runBatch(this.inflight).finally(() => (this.busy = false));
    }
    return true;
  }

  /** Category + approval mode chosen in the panel for THIS AI site. */
  prefs: ProviderPrefs;

  /** Approval mode changed in the panel: applies immediately to the running session. */
  async setMode(mode: SafetyMode) {
    this.prefs = { ...this.prefs, mode };
    if (this.sessionId) await this.bridge.updateSession(this.sessionId, { mode, trustAll: false });
    if (this.active) this.ui.activity("mode" + ++this.actSeq, `Approvals: ${mode}`, "info");
  }

  /** Notion mode: Dev Log page on/off (takes effect at the next Start; a running session gets a note). */
  async setNotionLog(on: boolean) {
    this.prefs = { ...this.prefs, notionLog: on };
    if (!this.active || !this.sessionId || this.busy) return;
    this.busy = true;
    try {
      await this.send(on ? 'From now on also keep the Notion page "Roblox Dev Log" updated after each finished step (use your native Notion tools; Studio still only via tool calls). Reply READY.' : 'Stop updating the "Roblox Dev Log" page. Reply READY.');
      this.awaitingReady = true;
    } finally {
      this.busy = false;
    }
  }

  /** SUPER mode on/off (prompt section at the next Start; a running session gets the instructions now). */
  async setSuperMode(on: boolean) {
    if (!!this.prefs.superMode === on) return;
    this.prefs = { ...this.prefs, superMode: on };
    this.ui.activity("super" + ++this.actSeq, on ? "SUPER mode on — deep thinking, phased build, self-review" : "SUPER mode off", "info");
    if (!this.active || !this.sessionId || this.busy) return;
    this.busy = true;
    try {
      await this.send(on ? `[Roblox Agent] ${superSection(false)}\nReply "ok" and apply this to my next requests.` : `[Roblox Agent] SUPER mode is OFF — normal speed again (still inspect and verify). Reply "ok".`);
      this.awaitingReady = true;
    } finally {
      this.busy = false;
    }
  }

  /** Category changed: stored for this AI; a running session gets a short focus message. */
  async setCategory(category: AgentCategory) {
    if (this.prefs.category === category) return;
    this.prefs = { ...this.prefs, category };
    if (!this.sessionId || !this.active) return;
    await this.bridge.updateSession(this.sessionId, { category });
    const info = CATEGORY_INFO[category];
    this.ui.activity("cat" + ++this.actSeq, `Category: ${info.label}`, "info");
    this.busy = true;
    try {
      await this.send(REMINDERS.category(info.label, info.focus));
      this.awaitingReady = true; // the reply is an acknowledgement, not an answer to a task
    } finally {
      this.busy = false;
    }
  }

  /** Approve this call and every further confirmation in this session. */
  async approveAll(approvalId: string) {
    if (this.sessionId) await this.bridge.updateSession(this.sessionId, { trustAll: true });
    this.ui.activity("trust" + ++this.actSeq, "All actions approved for this session", "info");
    await this.approve(approvalId, true);
  }

  // -------------------------------------------------------------- lifecycle
  startMonitoring() {
    void this.refreshHealth();
    this.healthTimer = every(3000, () => void this.refreshHealth());
  }

  async refreshHealth() {
    const h = await this.bridge.health();
    this.lastHealth = h.health;
    this.ui.setConnection(h);
    this.checkVersions(h.health?.bridgeVersion);
    if (this.active && !h.online && !this.paused) {
      this.pause(true);
      this.pausedByBridge = true;
      this.ui.notify("Bridge offline — session paused. It resumes by itself when the bridge is back.", "error");
    }
    if (this.active && h.online && this.paused && this.pausedByBridge && this.autoResumeOn()) {
      this.pausedByBridge = false;
      this.ui.notify("Bridge is back — auto-resumed.", "info");
      this.pause(false);
    }
    if (this.active && h.online && h.health && !h.health.session) {
      // bridge restarted or session stopped elsewhere (dashboard)
      this.ui.notify("Session ended by the bridge.", "warn");
      this.teardown();
    }
    return h;
  }

  private versionWarned = "";
  /** Extension and bridge from different Brickwire releases → new tools/fixes are missing on one side. Warn once. */
  private checkVersions(bridgeVersion?: string) {
    let ext = "";
    try { ext = typeof chrome !== "undefined" ? chrome.runtime?.getManifest?.()?.version ?? "" : ""; } catch { /* tests */ }
    if (!ext || !bridgeVersion || ext === bridgeVersion || this.versionWarned === bridgeVersion) return;
    this.versionWarned = bridgeVersion;
    const newer = ext.localeCompare(bridgeVersion, undefined, { numeric: true }) > 0;
    this.ui.notify(newer
      ? `The bridge is an older version (${bridgeVersion}, extension ${ext}) — close the old bridge window / run stop.bat, then start.bat (or reopen the Brickwire app). New tools appear after that.`
      : `The extension is older (${ext}) than the bridge (${bridgeVersion}) — open chrome://extensions and press Reload on Brickwire, then reload this page.`, "warn");
  }

  async start(): Promise<void> {
    if (this.active) return;
    const block = this.adapter.blockReason();
    if (block) return this.ui.notify(block, "error");
    const health = this.adapter.health();
    if (!health.ok) return this.ui.notify(`Provider integration unavailable: ${health.problems.join(", ")}`, "error");
    const h = await this.refreshHealth();
    if (!h.online) return this.ui.notify("Bridge offline — run start.bat (or npm start) and try again.", "error");
    const st = h.health!.state;
    if (st !== "MCP_READY" && st !== "SESSION_ACTIVE") return this.ui.notify(`Studio not ready — ${h.health!.reason}`, "error");

    const draft = composerText(this.adapter.getComposer()).trim() || null;
    if (draft) this.lastInjected = draft; // the draft becomes the task: our prompt replaces it in the box
    let res;
    try {
      res = await this.bridge.startSession(this.adapter.info.id, draft, { mode: this.prefs.mode, category: this.prefs.category });
    } catch (e) {
      return this.ui.notify((e as Error).message, "error");
    }
    this.sessionId = res.session.id;
    this.tools = new Map(res.tools.map((t) => [t.name, t]));
    this.knownTools = new Set(res.tools.filter((t) => t.available).map((t) => t.name));
    this.task = draft;
    this.active = true;
    this.paused = false;
    this.stage = "ANALYZE";
    this.autoTurns = 0;
    this.remindersThisTurn = 0;
    this.unverified = false;
    this.executedIds.clear();
    this.processedKeys.clear();
    const cur = this.adapter.readAssistantResponse();
    this.baselineKey = this.keyOf(cur.count, cur.text);
    this.lastSeenKey = this.baselineKey;
    this.ui.setSession({ active: true, paused: false, sessionId: this.sessionId });
    this.ui.setStage(this.stage);
    this.ui.setTask(this.task ?? "Waiting for your task");
    this.ui.activity("start", `Session ${this.sessionId} · ${res.tools.filter((t) => t.available).length} tools`, "done");
    this.onStateChange();

    const prompt = buildAgentPrompt({ providerName: this.adapter.info.name, tools: res.tools, memorySummary: res.memorySummary, task: draft, sessionId: this.sessionId, category: this.prefs.category, providerId: this.adapter.info.id, notionLog: !!this.prefs.notionLog, maxChars: this.adapter.info.maxMessageChars, superMode: !!this.prefs.superMode });
    this.lastPrompt = prompt;
    this.autoResumes = 0;
    this.agentSent = true;
    this.chatPath = location.pathname;
    this.lastMemory = res.memorySummary;
    this.awaitingReady = !draft;
    this.toolsSinceUser = 0;
    const sent = await this.send(prompt, { pauseOnFail: false });
    if (!sent) {
      this.ui.notify("Could not send the agent instructions (composer/send not found). Provider integration unavailable.", "error");
      await this.stop();
      return;
    }
    this.awaitingReply = true;
    this.ui.activity("prompt", "Agent instructions injected", "done");
    this.lastChangeAt = Date.now();
    this.observer = new MutationObserver(() => this.onMutation());
    this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    this.timer = every(500, () => void this.tickLoop());
  }

  /**
   * A request from the panel (Library "Build this" / "Make something like it"): starts the agent with it as the
   * task, or — when a session is already running — sends it as a new user turn (fresh turn budget).
   */
  async submitTask(text: string, source = "the Brickwire panel"): Promise<boolean> {
    if (!this.active) {
      const c = this.adapter.getComposer();
      if (!c) {
        this.ui.notify("Message box not found — open a chat first.", "error");
        return false;
      }
      await setComposerText(c, text, { allowRawWrite: this.adapter.info.id !== "notion" });
      await this.start();
      return this.active;
    }
    this.toolsSinceUser = 0;
    this.remindersThisTurn = 0;
    this.unverifiedNagged = false;
    this.autoTurns = 0;
    this.setTask(text.split("\n")[0].slice(0, 140));
    this.ui.activity("lib" + ++this.actSeq, source === "the Brickwire panel" ? "Library request sent" : `Request from ${source} sent`, "info");
    const news = await this.toolNews();
    const ok = await this.send(`NEW USER REQUEST (from ${source}):\n` + text + (news ? "\n\n" + news : ""));
    this.persist();
    return ok;
  }

  /** Put text into the site's message box without sending (e.g. the user still has to attach a screenshot). */
  async fillComposer(text: string): Promise<boolean> {
    const c = this.adapter.getComposer();
    if (!c) return false;
    return setComposerText(c, text, { allowRawWrite: this.adapter.info.id !== "notion" });
  }

  pause(p = !this.paused) {
    if (!this.active) return;
    this.paused = p;
    this.ui.setSession({ active: true, paused: p, sessionId: this.sessionId });
    this.ui.activity("pause" + ++this.actSeq, p ? "Paused" : "Resumed", "info");
    this.onStateChange();
    if (!p && this.pendingSend) {
      const text = this.pendingSend;
      this.pendingSend = null;
      this.busy = true;
      void this.send(text).finally(() => (this.busy = false));
    }
  }

  async stop() {
    const id = this.sessionId;
    this.teardown();
    if (id) await this.bridge.stopSession(id);
    this.ui.activity("stop" + ++this.actSeq, "Session stopped", "info");
  }

  private teardown() {
    clearRun(this.adapter.info.id);
    this.inflight = null;
    this.activityLog = [];
    this.active = false;
    this.paused = false;
    this.observer?.disconnect();
    this.observer = null;
    this.timer?.();
    this.timer = null;
    this.delivery = null;
    this.ui.showApproval(null);
    this.ui.setSession({ active: false, paused: false, sessionId: null });
    this.stage = "IDLE";
    this.ui.setStage("IDLE");
    this.sessionId = null;
    this.onStateChange();
  }

  async approve(approvalId: string, ok: boolean) {
    await this.bridge.decide(approvalId, ok);
    this.ui.showApproval(null);
  }

  // -------------------------------------------------------------- observe
  private keyOf(count: number, text: string) {
    return `${count}|${hashText(text)}`;
  }

  private onMutation() {
    const a = this.adapter.readAssistantResponse();
    const k = this.keyOf(a.count, a.text);
    if (k !== this.lastSeenKey) {
      this.lastSeenKey = k;
      this.lastChangeAt = Date.now();
    }
  }

  /**
   * M1: re-send the FULL agent instructions into the running session (new chat in the same tab, user
   * request "/bw rules", or the panel button). Rate-limited to once per 20 s.
   */
  async resendInstructions(reason: "new_chat" | "user" | "context_lost"): Promise<boolean> {
    if (!this.active || !this.sessionId) return false;
    const now = Date.now();
    if (now - this.lastResendAt < 20000) return false;
    this.lastResendAt = now;
    const prompt = this.lastPrompt;
    if (!prompt) return false;
    this.ui.activity("resend" + ++this.actSeq, `Full instructions re-sent (${reason.replace("_", " ")})`, "info");
    this.agentSent = true;
    this.chatPath = location.pathname;
    const ok = await this.send(prompt, { pauseOnFail: false });
    if (ok) this.awaitingReply = true;
    return ok;
  }

  /** M1: "/bw rules" | "/bw instructions" | "/brickwire правила" typed by the user. */
  static isResendCommand(text: string): boolean {
    return /^\s*\/(bw|brickwire)\s+(rules|instructions|prompt|правила|инструкции)(?=\s|$|[.,!?])/i.test(text);
  }

  private async tickLoop() {
    if (!this.active || this.paused || this.busy || this.sending) return;
    // M1: the user opened a new chat in this tab while the session runs → the model has no instructions there
    if (this.chatPath && location.pathname !== this.chatPath && this.adapter.getComposer() && this.adapter.readAssistantResponse().count === 0) {
      await this.resendInstructions("new_chat");
      return;
    }
    // Background tabs keep working (the user is usually looking at Studio). Timers are driven by the
    // extension clock, so they are not throttled; only rendering may lag, so hidden tabs settle longer.
    const hidden = document.hidden;
    if (hidden && !this.hiddenNotified) {
      this.hiddenNotified = true;
      this.ui.activity("hidden", "Tab in background — agent keeps working", "info");
    } else if (!hidden && this.hiddenNotified) {
      this.hiddenNotified = false;
      this.ui.activity("hidden", "Tab in background — agent keeps working", "done");
    }
    if (await this.checkDelivery()) return;
    const prevKey = this.lastSeenKey;
    this.onMutation();
    const now = Date.now();
    // M1: end of reply = the provider's Stop signal disappears (+ fastEndMs of quiet). Providers without a
    // Stop selector (stopSignal() === null) keep the classic settle timeout below.
    const stop = this.adapter.stopSignal ? this.adapter.stopSignal() : null;
    this.endDet.sample(now, stop, this.lastSeenKey !== prevKey);
    // M3 case 1: Stop visible but no new text for a long time -> press Stop and ask to continue
    if (this.lastSeenKey !== prevKey || stop !== true) this.lastGrowthAt = now;
    const stuck = this.hang.generation({ now, stopVisible: stop === true, lastGrowthAt: this.lastGrowthAt, replyIndex: this.lastHandledCount + 1 });
    if (stuck) {
      this.ui.activity("hang" + ++this.actSeq, stuck.log, "error");
      this.adapter.pressStop?.();
      await sleep(800);
      this.lastGrowthAt = Date.now();
      await this.sendSystem(CONTINUE_MESSAGE);
      return;
    }
    if (this.adapter.isGenerating()) {
      this.lastChangeAt = now;
      if (this.onPluginEvent && now - this.lastPartialAt > 1200) {
        this.lastPartialAt = now;
        const cur = this.adapter.readAssistantResponse();
        const prose = replyProse(cur.text);
        if (prose) this.emit({ type: "reply", key: String(cur.count), partial: true, text: prose });
      }
      if (this.settings.streamExec !== false) this.streamExec();
      // isGenerating() also reports "text grew in the last 2.5 s"; once the explicit Stop signal is gone the
      // short confirm in endDet decides instead.
      if (!(this.endDet.fastPath && stop === false)) return;
    }
    const via = this.endDet.fastPath ? this.endDet.done(now) : null;
    if (this.endDet.fastPath && !via) return;
    const quiet = now - this.lastChangeAt;
    const settle = hidden ? Math.max(4000, this.settings.settleMs * 3) : this.settings.settleMs;
    if (!via && quiet < settle) return;
    const a = this.adapter.readAssistantResponse();
    const key = this.keyOf(a.count, a.text);
    if (!a.text.trim() || key === this.baselineKey || this.processedKeys.has(key)) return;
    const tParse = Date.now();
    const parsed = this.adapter.extractToolCalls(a.text);
    const parseMs = Date.now() - tParse;
    const sinceEnd = this.endDet.quietMs(now);
    if (via) {
      // The site said it finished. Only give a cut-off block a short grace for the final render.
      if (parsed.hasIncomplete && sinceEnd < (hidden ? 4000 : 1500)) return;
    } else {
      // An unfinished tool call: the site may just be slow. Wait longer before calling it truncated.
      if (parsed.hasIncomplete && quiet < (hidden ? 60000 : Math.max(8000, this.settings.settleMs * 4))) return;
      // Prose without any command may be a reply that merely paused mid-stream: give it longer before reacting.
      const plain = !parsed.calls.length && !parsed.done && !parsed.invalidCalls.length && !parsed.forgedResults && !parsed.statuses.length;
      if (plain && quiet < (hidden ? 12000 : Math.max(4000, this.settings.settleMs * 2))) return;
    }
    this.stepTimer = new StepTimer();
    if (this.sentAt) this.stepTimer.add(via ? "wait for model" : "wait for model (settle fallback)", now - this.sentAt);
    this.stepTimer.add("parse", parseMs);
    if (this.delivery) this.delivery.confirmed = true;
    this.processedKeys.add(key);
    this.lastHandledCount = a.count;
    this.emit({ type: "reply", key: String(a.count), partial: false, text: replyProse(a.text), calls: parsed.calls.length });
    this.busy = true;
    try {
      await this.handleResponse(parsed, a.count);
    } catch (e) {
      this.ui.notify("Agent loop error: " + (e as Error).message, "error");
    } finally {
      this.busy = false;
      this.lastChangeAt = Date.now(); // our own sent message changes the DOM
    }
  }

  // -------------------------------------------------------------- handle
  private async handleResponse(p: ParseOutput, replyIndex: number) {
    this.awaitingReply = false;
    const replyToUser = !this.agentSent;
    this.agentSent = false;
    if (replyToUser) {
      // the user typed a new request themselves → fresh turn budget
      this.toolsSinceUser = 0;
      this.remindersThisTurn = 0;
      this.unverifiedNagged = false;
      this.autoTurns = 0;
    }
    const wasAwaitingReady = this.awaitingReady;
    this.awaitingReady = false;
    for (const s of p.statuses) {
      const st = String(s.stage ?? "").toUpperCase() as AgentStage;
      if (STAGES.includes(st) && st !== "DONE") this.setStage(st);
      if (typeof s.task === "string" && s.task.trim() && s.task !== "ready") this.setTask(s.task.trim());
      if (typeof s.note === "string" && s.note) this.ui.activity("st" + ++this.actSeq, s.note.slice(0, 120), "info");
    }
    for (const e of p.errors) this.ui.activity("err" + ++this.actSeq, "AI: " + String(e.message ?? "error").slice(0, 140), "error");

    if (p.forgedResults && !p.calls.length) {
      this.ui.activity("forged" + ++this.actSeq, "AI wrote a fake RBX_TOOL_RESULT — ignored", "error");
      return this.sendSystem(REMINDERS.forged);
    }
    if (p.invalidCalls.length && !p.calls.length) {
      this.ui.activity("inv" + ++this.actSeq, `Invalid tool call (${p.invalidCalls[0].problem})`, "error");
      return this.sendSystem(REMINDERS.invalid(p.invalidCalls.map((b) => b.problem ?? "invalid")));
    }
    if (p.hasIncomplete && !p.calls.length) {
      const cut = this.hang.replyEnded({ replyIndex: ++this.actSeq, hasIncomplete: true });
      this.ui.activity("trunc" + this.actSeq, cut?.log ?? "Tool call was cut off", "error");
      return this.sendSystem(REMINDERS.truncated);
    }

    // Models reuse ids ("c1") in every reply, so a call is only a duplicate if the SAME reply
    // (same turn index) already ran it — e.g. the DOM re-rendered. A new reply always executes.
    const ib = this.inflight && this.inflight.replyIndex === replyIndex ? this.inflight : null;
    const inBatch = (c: ToolCall) => !!ib && ib.calls.some((x) => this.execKey(replyIndex, x) === this.execKey(replyIndex, c));
    const calls = p.calls.filter((c) => !this.executedIds.has(this.execKey(replyIndex, c)) && !inBatch(c));
    if (ib) {
      // M1: some calls of this reply already started while it was streaming — add the rest, then finish.
      for (const c of calls) {
        if (ib.calls.length >= this.settings.maxCallsPerMessage) {
          ib.footer = REMINDERS.tooMany(ib.calls.length);
          break;
        }
        ib.calls.push(c);
      }
      this.persist();
      await this.runBatch(ib);
      return;
    }
    if (p.calls.length && !calls.length) {
      this.ui.activity("dup" + ++this.actSeq, "Same reply re-rendered — calls already executed, skipped", "info");
      return;
    }
    if (calls.length) {
      if (!this.beginTurn()) return;
      const batch = calls.slice(0, this.settings.maxCallsPerMessage);
      this.inflight = {
        replyIndex,
        calls: batch,
        callIds: {},
        results: [],
        footer: calls.length > batch.length ? REMINDERS.tooMany(batch.length) : undefined,
      };
      this.persist();
      await this.runBatch(this.inflight);
      return;
    }

    if (p.done) {
      if (this.unverified && !this.unverifiedNagged) {
        this.unverifiedNagged = true;
        this.ui.activity("ver" + ++this.actSeq, "Done claimed without verification — asking to verify", "wait");
        return this.sendSystem(REMINDERS.unverified);
      }
      this.setStage("DONE");
      this.ui.activity("done" + ++this.actSeq, "Done: " + String(p.done.summary ?? "").slice(0, 140), "done");
      this.emit({ type: "done", summary: String(p.done.summary ?? "") });
      this.autoTurns = 0;
      this.remindersThisTurn = 0;
      return;
    }

    // 1.8: questions / variants for the user → wait for the answer (no "use tools" nagging)
    if (p.ask || (p.asksUser && !p.untaggedCode && this.toolsSinceUser === 0)) {
      this.setStage("PLAN");
      const waitEv = this.hang.waitingForUser({ replyIndex: ++this.actSeq, ask: true, question: false, hasCalls: false });
      this.emit({ type: "ask" });
      this.ui.activity("ask" + this.actSeq, "AI asks you (questions / variants) — answer in the chat" + (waitEv ? " · auto-run paused" : ""), "wait");
      this.autoTurns = 0;
      return;
    }
    if (p.statuses.length || p.errors.length) return; // e.g. READY acknowledgement — wait for the user
    if (wasAwaitingReady) {
      this.ui.activity("ready" + ++this.actSeq, "AI is ready — type your request", "done");
      return;
    }
    // Code without a tag is never executed — the most common "my command did nothing" case. Tell the AI exactly that.
    if (p.untaggedCode && this.remindersThisTurn < this.settings.reminderLimit) {
      this.remindersThisTurn++;
      this.ui.activity("rem" + ++this.actSeq, "Luau code without a tag — asked the AI to re-send it tagged", "wait");
      return this.sendSystem(REMINDERS.untagged);
    }
    // Plain text, no command. If the AI already used tools for this request, this is its final answer.
    // If it answered a request without touching Studio, remind it once that it can (and must) act.
    if (this.toolsSinceUser === 0 && this.remindersThisTurn < this.settings.reminderLimit) {
      this.remindersThisTurn++;
      this.ui.activity("rem" + ++this.actSeq, "No tool call — agent reminder sent", "wait");
      return this.sendSystem(REMINDERS.noTools);
    }
    this.setStage("DONE");
    this.ui.activity("ans" + ++this.actSeq, "AI answered — waiting for your next request", "done");
  }

  private execKey(replyIndex: number, c: { id: string; tool: string; args: unknown }) {
    // Models reuse ids ("c1") in every reply → a duplicate is the SAME reply + the same call.
    return `${replyIndex}|${c.id}|${c.tool}|${JSON.stringify(c.args)}`;
  }

  /** Auto-resume is on unless the user turned it off (localStorage "bw-autoresume" = "off"). */
  private autoResumeOn(): boolean {
    try { return globalThis.localStorage?.getItem("bw-autoresume") !== "off"; } catch { return true; }
  }

  /** Counts one automatic turn; false (and paused) when the limit is reached. */
  private beginTurn(): boolean {
    const turnLimit = this.settings.maxAutoTurns * (this.prefs.superMode ? 2 : 1); // SUPER mode works longer
    if (++this.autoTurns > turnLimit && this.autoResumeOn() && this.autoResumes < 3) {
      this.autoResumes++;
      this.autoTurns = 1;
      this.ui.activity("autoresume" + ++this.actSeq, `Auto-resume ${this.autoResumes}/3 after ${turnLimit} turns`, "info");
    }
    if (this.autoTurns > turnLimit) {
      this.pause(true);
      this.ui.notify(`Reached ${turnLimit} automatic turns — paused. Resume to continue.`, "warn");
      return false;
    }
    this.remindersThisTurn = 0;
    return true;
  }

  /**
   * M1 streaming execution: while the reply is still being written, every CLOSED and valid tool block is
   * queued at once (reads start immediately, writes run in order). The reply-end handler finishes the batch.
   */
  private streamExec() {
    const a = this.adapter.readAssistantResponse();
    if (!a.text.trim() || a.count <= this.lastHandledCount) return;
    if (this.keyOf(a.count, a.text) === this.baselineKey) return;
    let parsed: ParseOutput;
    try {
      parsed = this.adapter.extractToolCalls(a.text);
    } catch {
      return;
    }
    if (!parsed.calls.length) return;
    let b = this.inflight;
    if (b && b.replyIndex !== a.count) return; // the previous batch is still being delivered
    let added = false;
    for (const c of parsed.calls) {
      const k = this.execKey(a.count, c);
      if (this.executedIds.has(k) || (b && b.calls.some((x) => this.execKey(a.count, x) === k))) continue;
      if (!b) {
        if (!this.beginTurn()) return;
        b = this.inflight = { replyIndex: a.count, calls: [], callIds: {}, results: [] };
      }
      if (b.calls.length >= this.settings.maxCallsPerMessage) {
        b.footer = REMINDERS.tooMany(b.calls.length);
        break;
      }
      b.calls.push(c);
      added = true;
      this.ui.activity("stream:" + a.count + ":" + c.id, `${c.tool} queued while the reply is streaming`, "info");
      void this.queueCall(b, c).catch(() => undefined);
    }
    if (added) this.persist();
  }

  /** Submit one call to the per-reply scheduler (dedupe by reply + id + tool + args hash). */
  private queueCall(b: InflightBatch, call: ToolCall): Promise<ToolResult | null> {
    const done = b.results.find((r) => r.id === call.id);
    if (done) return Promise.resolve(done); // finished before a reload
    const desc = this.tools.get(call.tool);
    const risk = desc ? assessCall(desc, call.args).risk : "read";
    if (!this.sched || this.schedReply !== b.replyIndex) {
      this.sched = new CallScheduler<ToolResult | null>({ readParallel: this.settings.readParallel ?? 4 });
      this.schedReply = b.replyIndex;
    }
    return this.sched.submit(callKey(b.replyIndex, call), risk === "read" ? "read" : "write", () => this.execOne(b, call, risk));
  }

  private async execOne(b: InflightBatch, call: ToolCall, risk: string): Promise<ToolResult | null> {
    if (!this.active) return null;
    const resumeCallId = b.callIds[call.id];
    this.executedIds.add(this.execKey(b.replyIndex, call));
    if (!resumeCallId) this.toolsSinceUser++;
    this.inferStage(call.tool, risk);
    const key = "call:" + b.replyIndex + ":" + call.id;
    this.ui.activity(key, `${call.tool} ${shortArgs(call.args)}${resumeCallId ? " (resumed after reload)" : ""}`, "run");
    const t0 = Date.now();
    let showedApproval = false;
    // M3 case 7: identical call (tool + args) issued 3x in a row across turns -> stop the loop
    if (!resumeCallId) {
      const loop = this.hang.callIssued(call.tool + "|" + hashText(JSON.stringify(call.args ?? {})), call.tool);
      if (loop) {
        this.ui.activity(key, loop.log, "error");
        this.autoTurns = Number.MAX_SAFE_INTEGER; // no further automatic turns until the user acts
        const lr = { id: call.id, status: "error", error: (loop.recovery as { message: string }).message } as ToolResult;
        if (!b.results.some((x) => x.id === lr.id)) b.results.push(lr);
        return lr;
      }
    }
    const r = await this.bridge.callTool(
      call,
      { sessionId: this.sessionId!, provider: this.adapter.info.id },
      {
        resumeCallId,
        onSubmitted: (callId) => {
          if (b.callIds[call.id] !== callId) {
            b.callIds[call.id] = callId;
            this.persist();
          }
        },
        onPending: (env) => {
          showedApproval = true;
          this.ui.activity(key, `${call.tool} — waiting for approval`, "wait");
          this.ui.showApproval(env);
        },
        shouldAbort: () => !this.active,
      },
    );
    // parallel reads must not hide an approval card that belongs to another call
    if (showedApproval) this.ui.showApproval(null);
    // M3 case 5: Studio in the wrong play/edit state -> read get_studio_state and give the model the facts
    if (r.status !== "success" && r.error) {
      const mode = this.hang.callError({ callId: call.id, tool: call.tool, error: r.error });
      if (mode) {
        this.ui.activity("hang" + ++this.actSeq, mode.log, "wait");
        try {
          const st = await this.bridge.callTool({ id: call.id + "_state", tool: "get_studio_state", args: {} } as ToolCall, { sessionId: this.sessionId!, provider: this.adapter.info.id }, { shouldAbort: () => !this.active });
          const dm = (mode.recovery as { datamodel: string }).datamodel;
          r.error += ` | Brickwire read get_studio_state: ${JSON.stringify(st.result ?? st.error ?? null).slice(0, 300)}. Retry this call against the ${dm} datamodel.`;
        } catch {
          /* state read failed: the original error still reaches the model */
        }
      }
    }
    const ms = Date.now() - t0;
    (this.stepTimer ??= new StepTimer()).add(call.tool, ms);
    if (!b.results.some((x) => x.id === r.id)) b.results.push(r);
    const ok = r.status === "success";
    this.ui.activity(key, `${call.tool} ${ok ? "" : "— " + r.status + ": " + (r.error ?? "").slice(0, 90)} · ${fmtMs(ms)}`.replace(/\s+·/, " ·").trim(), ok ? "done" : "error");
    if (ok && risk !== "read") {
      this.unverified = true;
      this.unverifiedNagged = false;
    } else if (ok && risk === "read") this.unverified = false;
    if (!ok) this.setStage("FIX");
    this.persist();
    return r;
  }

  /** Execute (or, after a reload, finish) a batch of calls, then inject all results at once. */
  private async runBatch(b: InflightBatch) {
    let jobs: Array<Promise<ToolResult | null>> = [];
    do {
      jobs = b.calls.map((c) => this.queueCall(b, c));
      await Promise.allSettled(jobs);
    } while (this.active && jobs.length < b.calls.length);
    if (!this.active) return;
    const results = b.calls.map((c) => b.results.find((r) => r.id === c.id)!).filter(Boolean);
    const st = (this.stepTimer ??= new StepTimer());
    const tSend = Date.now();
    const attachNote = await this.attachToolFiles(results);
    const news = await this.toolNews();
    const footer = [b.footer, attachNote, news].filter(Boolean).join("\n") || undefined;
    await this.send(formatToolResults(results, this.adapter.info.maxMessageChars, footer));
    st.add("send results", Date.now() - tSend);
    this.ui.activity("timing:" + b.replyIndex, "⏱ " + st.summary(), "info");
    this.stepTimer = null;
    if (this.inflight === b) this.inflight = null;
    this.persist();
  }

  /** Tools the AI was told about. New ones (bridge updated, Studio connected later) are announced once. */
  private knownTools = new Set<string>();
  private async toolNews(): Promise<string> {
    try {
      const tools = await this.bridge.tools();
      if (!tools) return "";
      this.tools = new Map(tools.map((t) => [t.name, t]));
      const fresh = tools.filter((t) => t.available && !this.knownTools.has(t.name));
      if (!fresh.length || !this.knownTools.size) { for (const t of tools) if (t.available) this.knownTools.add(t.name); return ""; }
      for (const t of fresh) this.knownTools.add(t.name);
      this.ui.activity("tools" + ++this.actSeq, `New tools announced to the AI: ${fresh.map((t) => t.name).join(", ")}`, "info");
      return newToolsNotice(fresh);
    } catch { return ""; }
  }

  /** file_show results carry {bwAttach:[{fileId}]}: put those files into the composer before the results message is sent. */
  private async attachToolFiles(results: ToolResult[]): Promise<string> {
    const ids: string[] = [];
    for (const r of results) {
      if (r.status !== "success") continue;
      const json = JSON.stringify(r.result ?? null) ?? "";
      for (const m of json.matchAll(/\\?"bwAttach\\?"\s*:\s*\[([^\]]*)\]/g)) for (const id of m[1].matchAll(/f_[a-f0-9]{12}/g)) if (!ids.includes(id[0])) ids.push(id[0]);
    }
    if (!ids.length) return "";
    if (!this.adapter.attachImage) return `[Brickwire: ${this.adapter.info.name} does not support attachments here — files ${ids.join(", ")} were not attached; use file_read instead]`;
    const ok: string[] = [], bad: string[] = [];
    for (const id of ids.slice(0, 4)) {
      try {
        const f = await this.bridge.fileBase64(id);
        const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
        if (await this.adapter.attachImage(new File([bytes], f.name, { type: f.mime || "application/octet-stream" }))) ok.push(f.name); else bad.push(f.name);
      } catch (e) { bad.push(`${id} (${(e as Error).message})`); }
    }
    this.ui.activity("attach" + ++this.actSeq, ok.length ? `Attached to the chat: ${ok.join(", ")}` : "Could not attach files to the chat", ok.length && !bad.length ? "done" : "error");
    return [ok.length ? `[Brickwire attached: ${ok.join(", ")}]` : "", bad.length ? `[Brickwire could not attach: ${bad.join(", ")} — the site refused the upload; use file_read for text]` : ""].filter(Boolean).join("\n");
  }

  private async sendSystem(text: string) {
    return this.send(text);
  }

  /** Leftover composer text that is (part of) a message WE injected — not a user draft. */
  private isOwnText(draft: string) {
    if (!this.lastInjected) return false;
    const n = (x: string) => x.replace(/\s+/g, " ").trim().slice(0, 300);
    const a = n(draft);
    const b = n(this.lastInjected);
    return !!a && (b.startsWith(a.slice(0, 120)) || a.startsWith(b.slice(0, 120)));
  }

  /**
   * Send one message to the AI site. Waits for the site to be idle and for the user's own draft to clear,
   * retries once, tags the message with a delivery marker and arms the delivery watchdog.
   */
  private async send(text: string, opts: { pauseOnFail?: boolean } = {}): Promise<boolean> {
    this.sending++;
    try {
      return await this.sendInner(text, opts);
    } finally {
      this.sending--;
      this.lastChangeAt = Date.now(); // our own message changes the DOM
    }
  }

  private async sendInner(text: string, opts: { pauseOnFail?: boolean }): Promise<boolean> {
    // The previous message is answered (or superseded) — the watchdog must not re-send it while this one goes out.
    this.delivery = null;
    for (let i = 0; i < 240; i++) {
      if (!this.active) return false;
      const draft = composerText(this.adapter.getComposer()).trim();
      const userDraft = !!draft && !this.isOwnText(draft);
      if (!userDraft && !this.adapter.isGenerating()) break;
      if (i === 6 && userDraft) this.ui.notify("Waiting: the message box has your draft — send or clear it.", "warn");
      await sleep(500);
    }
    if (!this.active) return false;
    // no colon: ":abcde" opened Notion's emoji picker at the very end of the message (Enter then picked an emoji)
    const marker = `[bw-${newMarkerId()}]`;
    const full = `${text}\n\n${marker}`;
    const before = this.adapter.readAssistantResponse();
    this.baselineKey = this.keyOf(before.count, before.text);
    this.agentSent = true;
    this.lastInjected = full;
    let ok = await this.adapter.sendMessage(full);
    for (let attempt = 2; !ok && this.active && attempt <= 3; attempt++) {
      this.ui.activity("send" + ++this.actSeq, `Send did not go through — retrying (${attempt}/3)`, "wait");
      await sleep(1500 * (attempt - 1));
      ok = this.markerDelivered(marker) || this.adapter.readAssistantResponse().count > before.count || (await this.adapter.sendMessage(full));
    }
    if (!ok) {
      this.agentSent = false;
      if (opts.pauseOnFail === false) return false;
      this.pendingSend = text;
      this.pause(true);
      this.ui.notify("Could not send the message to the AI site (message box / send button not found or the site is busy). Session paused — press Resume to send it again.", "error");
      return false;
    }
    this.pendingSend = null;
    this.sentAt = Date.now();
    this.endDet.reset(this.sentAt);
    this.delivery = { marker, text: full, at: Date.now(), count: before.count, tries: 1, confirmed: false, warned: false };
    this.awaitingReply = true;
    this.persist();
    return true;
  }

  /** The marker of a sent message is visible in the chat (outside the message box) → the site took it. */
  private markerDelivered(marker: string): boolean {
    try {
      const composer = this.adapter.getComposer();
      const res = document.evaluate(`//text()[contains(., '${marker}')]`, document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < res.snapshotLength; i++) {
        const n = res.snapshotItem(i)!.parentElement;
        if (n && !(composer && composer.contains(n)) && !n.closest("[data-brickwire-host]") && !n.closest("textarea,[contenteditable='true']")) return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  /**
   * Delivery watchdog: some sites silently drop a send (button not enabled yet, editor state not synced,
   * a modal stole the click). If neither our message nor a reply appears, press send again / re-send.
   * Returns true when it did something this tick.
   */
  private async checkDelivery(): Promise<boolean> {
    const d = this.delivery;
    if (!d) return false;
    const a = this.adapter.readAssistantResponse();
    if (!d.confirmed && (a.count > d.count || this.adapter.isGenerating() || this.markerDelivered(d.marker))) d.confirmed = true;
    const age = Date.now() - d.at;
    if (d.confirmed) {
      if (!d.warned && this.awaitingReply && a.count === d.count && !this.adapter.isGenerating() && age > 150000) {
        d.warned = true;
        this.ui.notify("The AI has not answered for 2.5 minutes. If the site shows an error, press Pause → Resume to send the last message again, or answer in the chat yourself.", "warn");
        this.pendingSend = d.text.replace(/\n\n\[bw[:\-][a-z0-9]+\]$/, "");
      }
      return false;
    }
    if (age < (this.adapter.info.redeliverAfterMs ?? 7000)) return false;
    if (d.tries >= 4) {
      this.delivery = null;
      this.pendingSend = d.text.replace(/\n\n\[bw[:\-][a-z0-9]+\]$/, "");
      this.pause(true);
      this.ui.notify("The AI site did not accept the message after 4 attempts. Session paused — press Resume to try again (or send it from the message box yourself).", "error");
      return true;
    }
    // last check right before re-sending: a slow site may only now render our message
    if (this.markerDelivered(d.marker)) {
      d.confirmed = true;
      return false;
    }
    d.tries++;
    this.ui.activity("redeliver" + d.marker, `Message not delivered — sending again (try ${d.tries}/4)`, "wait");
    this.busy = true;
    this.sending++;
    try {
      if (await this.adapter.sendMessage(d.text)) this.lastChangeAt = Date.now();
    } finally {
      this.sending--;
      this.busy = false;
      d.at = Date.now();
    }
    return true;
  }

  private inferStage(tool: string, risk: string) {
    if (TEST_TOOLS.test(tool)) this.setStage("TEST");
    else if (risk !== "read") this.setStage(this.stage === "FIX" ? "FIX" : "EXECUTE");
    else if (this.stage === "IDLE" || this.stage === "DONE") this.setStage("ANALYZE");
  }

  private setStage(s: AgentStage) {
    if (this.stage === s) return;
    this.stage = s;
    this.emit({ type: "stage", stage: s });
    this.persist();
    this.ui.setStage(s);
    if (this.sessionId) void this.bridge.updateSession(this.sessionId, { stage: s });
    this.onStateChange();
  }

  private setTask(t: string) {
    if (this.task === t) return;
    this.task = t;
    this.emit({ type: "task", task: t });
    this.ui.setTask(t);
    if (this.sessionId) void this.bridge.updateSession(this.sessionId, { task: t });
    this.onStateChange();
  }
}

function shortArgs(a: Record<string, unknown>): string {
  const v = a.path ?? a.name ?? a.parent ?? a.query ?? a.pattern ?? "";
  return typeof v === "string" ? v.slice(0, 60) : "";
}

/** The human-readable part of a reply: tool blocks, Luau blocks and delivery markers removed. */
export function replyProse(text: string): string {
  let n = 0;
  const out = (text ?? "")
    .replace(/```[a-z]*\s*<ROBLOX_(TOOL_CALL|LUAU)[\s\S]*?(<\/ROBLOX_\1>\s*```|$)/gi, () => (n++, "\n"))
    .replace(/<ROBLOX_(TOOL_CALL|LUAU)[\s\S]*?(<\/ROBLOX_\1>|$)/gi, () => (n++, "\n"))
    .replace(/<ROBLOX_AGENT_DONE>[\s\S]*?(<\/ROBLOX_AGENT_DONE>|$)/gi, "")
    .replace(/<\/?ROBLOX_AGENT_ASK>/gi, "")
    .replace(/\[bw[:\-][a-z0-9]{5}\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return n ? `${out}${out ? "\n\n" : ""}⚙ ${n} action(s) sent to Studio` : out;
}
