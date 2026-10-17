/**
 * M3 hang monitor — pure detection + recovery decisions, shared by the extension (agent-core) and the
 * bridge (headless loop). Callers feed observations; the monitor returns at most one recovery per
 * incident (no repeated spam) and every decision carries a human-readable log line for the panel.
 * Table and thresholds: docs/HANGS.md.
 */

export type HangKind =
  | "model_never_finishes"
  | "reply_ended_mid_block"
  | "message_not_delivered"
  | "studio_not_responding"
  | "studio_wrong_mode"
  | "bridge_offline"
  | "call_loop"
  | "waiting_for_user";

export type Recovery =
  | { kind: "press_stop_and_continue"; message: string }
  | { kind: "ask_resend_block"; message: string }
  | { kind: "retry_send"; attempt: number; refocus: boolean }
  | { kind: "fail_call"; callId: string; pingStudio: true; message: string }
  | { kind: "read_state_and_retry"; callId: string; datamodel: "edit" | "server" | "client" }
  | { kind: "reconnect"; delayMs: number; banner: string }
  | { kind: "stop_loop"; message: string }
  | { kind: "notify_user"; message: string };

export interface HangEvent {
  kind: HangKind;
  recovery: Recovery;
  log: string;
}

export interface HangThresholds {
  /** case 1: Stop visible and no text growth for this long */
  stuckGenerationMs: number;
  /** case 3: our message not seen as delivered after this long */
  deliveryMs: number;
  maxSendRetries: number;
  /** case 4: a tool call without result for this long */
  callTimeoutMs: number;
  /** case 6: reconnect backoff */
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** case 7: same call hash this many times in a row */
  loopRepeats: number;
}

export const DEFAULT_HANG_THRESHOLDS: HangThresholds = {
  stuckGenerationMs: 90_000,
  deliveryMs: 8_000,
  maxSendRetries: 2,
  callTimeoutMs: 120_000,
  backoffBaseMs: 1_000,
  backoffMaxMs: 30_000,
  loopRepeats: 3,
};

export const CONTINUE_MESSAGE = "Continue exactly from where you stopped. Do not repeat finished steps.";

/** Studio error strings that mean "wrong datamodel / play state", with the datamodel to retry in. */
const WRONG_MODE: Array<{ re: RegExp; datamodel: "edit" | "server" | "client" }> = [
  { re: /edit\s*data\s*model\s+is\s+not\s+available/i, datamodel: "server" },
  { re: /not\s+available\s+in\s+play\s+mode/i, datamodel: "server" },
  { re: /(server|client)\s*data\s*model\s+is\s+not\s+available/i, datamodel: "edit" },
  { re: /studio\s+is\s+not\s+in\s+(play|run)\s+mode/i, datamodel: "edit" },
];

export function wrongModeTarget(error: string): "edit" | "server" | "client" | null {
  for (const w of WRONG_MODE) if (w.re.test(error)) return w.datamodel;
  return null;
}

export class HangMonitor {
  readonly t: HangThresholds;
  private fired = new Set<string>();
  private sendRetries = 0;
  private bridgeFailures = 0;
  private recentHashes: string[] = [];
  readonly log: string[] = [];
  constructor(t: Partial<HangThresholds> = {}) {
    this.t = { ...DEFAULT_HANG_THRESHOLDS, ...t };
  }

  private once(incident: string, ev: HangEvent): HangEvent | null {
    if (this.fired.has(incident)) return null;
    this.fired.add(incident);
    this.log.push(ev.log);
    return ev;
  }
  /** Forget incidents of the previous reply (call after a new reply starts). */
  newReply() {
    this.fired.clear();
    this.sendRetries = 0;
  }

  /** 1 — Stop visible, no text growth for stuckGenerationMs. */
  generation(o: { now: number; stopVisible: boolean; lastGrowthAt: number; replyIndex: number }): HangEvent | null {
    if (!o.stopVisible || o.now - o.lastGrowthAt < this.t.stuckGenerationMs) return null;
    return this.once(`gen:${o.replyIndex}`, {
      kind: "model_never_finishes",
      recovery: { kind: "press_stop_and_continue", message: CONTINUE_MESSAGE },
      log: `Model stuck ${Math.round((o.now - o.lastGrowthAt) / 1000)} s without new text — pressing Stop and asking to continue`,
    });
  }

  /** 2 — reply finished but contains an unclosed tool block. */
  replyEnded(o: { replyIndex: number; hasIncomplete: boolean; incompleteTag?: string }): HangEvent | null {
    if (!o.hasIncomplete) return null;
    const tag = o.incompleteTag ?? "ROBLOX_TOOL_CALL";
    return this.once(`trunc:${o.replyIndex}`, {
      kind: "reply_ended_mid_block",
      recovery: { kind: "ask_resend_block", message: `Your last <${tag}> block was cut off. Resend ONLY that block, complete and closed. Do not repeat earlier blocks.` },
      log: `Reply ended inside an unclosed <${tag}> — asked to resend only that block`,
    });
  }

  /** 3 — message not delivered: composer still holds our text / no new user message. */
  delivery(o: { now: number; sentAt: number; delivered: boolean; composerHoldsText: boolean }): HangEvent | null {
    if (o.delivered) {
      this.sendRetries = 0;
      return null;
    }
    if (o.now - o.sentAt < this.t.deliveryMs) return null;
    if (this.sendRetries >= this.t.maxSendRetries) {
      return this.once(`deliv-giveup:${o.sentAt}`, {
        kind: "message_not_delivered",
        recovery: { kind: "notify_user", message: "Brickwire could not send the message. Click into the chat box and press Send, or press Resume." },
        log: `Message not delivered after ${this.sendRetries} retries — user notified`,
      });
    }
    const attempt = ++this.sendRetries;
    const ev: HangEvent = {
      kind: "message_not_delivered",
      recovery: { kind: "retry_send", attempt, refocus: o.composerHoldsText || attempt > 1 },
      log: `Message not delivered after ${Math.round((o.now - o.sentAt) / 1000)} s — retry ${attempt}${o.composerHoldsText ? " (composer refocused)" : ""}`,
    };
    this.log.push(ev.log);
    return ev;
  }

  /** 4 — a tool call without result for callTimeoutMs. */
  callPending(o: { now: number; callId: string; tool: string; startedAt: number; timeoutMs?: number }): HangEvent | null {
    const limit = o.timeoutMs ?? this.t.callTimeoutMs;
    if (o.now - o.startedAt < limit) return null;
    return this.once(`call:${o.callId}`, {
      kind: "studio_not_responding",
      recovery: { kind: "fail_call", callId: o.callId, pingStudio: true, message: `Studio did not answer ${o.tool} within ${Math.round(limit / 1000)} s; the call was marked failed. Check that Studio is open and not blocked by a dialog, then retry.` },
      log: `${o.tool}: no result for ${Math.round((o.now - o.startedAt) / 1000)} s — pinging Studio, call marked failed, model told`,
    });
  }

  /** 5 — Studio refused because of the play/edit state. */
  callError(o: { callId: string; tool: string; error: string; retried?: boolean }): HangEvent | null {
    if (o.retried) return null;
    const dm = wrongModeTarget(o.error);
    if (!dm) return null;
    return this.once(`mode:${o.callId}`, {
      kind: "studio_wrong_mode",
      recovery: { kind: "read_state_and_retry", callId: o.callId, datamodel: dm },
      log: `${o.tool}: Studio in the wrong mode ("${o.error.slice(0, 80)}") — reading get_studio_state, retrying in ${dm}`,
    });
  }

  /** 6 — bridge health check result. Returns a reconnect decision with exponential backoff while offline. */
  bridgeHealth(ok: boolean): HangEvent | null {
    if (ok) {
      const was = this.bridgeFailures;
      this.bridgeFailures = 0;
      if (was) this.log.push(`Bridge back online after ${was} failed checks`);
      return null;
    }
    const n = ++this.bridgeFailures;
    const delayMs = Math.min(this.t.backoffMaxMs, this.t.backoffBaseMs * 2 ** (n - 1));
    const ev: HangEvent = {
      kind: "bridge_offline",
      recovery: { kind: "reconnect", delayMs, banner: "Bridge offline — reconnecting… (run `npm start` in the Brickwire folder if this stays)" },
      log: `Bridge health check failed (${n}) — reconnect in ${Math.round(delayMs / 1000)} s`,
    };
    this.log.push(ev.log);
    return ev;
  }

  /** 7 — the same call (tool + args hash) issued loopRepeats times in a row across turns. */
  callIssued(hash: string, tool: string): HangEvent | null {
    this.recentHashes.push(hash);
    if (this.recentHashes.length > this.t.loopRepeats) this.recentHashes.shift();
    const loop = this.recentHashes.length === this.t.loopRepeats && this.recentHashes.every((h) => h === hash);
    if (!loop) return null;
    this.recentHashes = [];
    const ev: HangEvent = {
      kind: "call_loop",
      recovery: { kind: "stop_loop", message: `You called ${tool} with the same arguments ${this.t.loopRepeats} times. Stop repeating it: explain what you expected, read the last result, and choose a different step.` },
      log: `Loop: ${tool} with identical args ${this.t.loopRepeats}× — auto-run stopped, model and user told`,
    };
    this.log.push(ev.log);
    return ev;
  }

  /** 8 — the model is waiting for the user. */
  waitingForUser(o: { replyIndex: number; ask: boolean; question: boolean; hasCalls: boolean }): HangEvent | null {
    if (o.hasCalls || !(o.ask || o.question)) return null;
    return this.once(`ask:${o.replyIndex}`, {
      kind: "waiting_for_user",
      recovery: { kind: "notify_user", message: "The AI is waiting for your answer — reply in the chat to continue." },
      log: "AI asked a question — user notified, not auto-continuing",
    });
  }
}

/** A reply "asks the user" when it ends with a question and contains no tool calls. */
export function looksLikeQuestion(text: string): boolean {
  const tail = text.trim().split("\n").filter(Boolean).slice(-2).join(" ");
  return /\?\s*$/.test(tail);
}
