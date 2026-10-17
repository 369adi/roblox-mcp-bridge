import { parseAgentOutput, type ParseOutput } from "../../../shared/src/parser.js";
import { formatToolResults } from "../../../shared/src/instructions.js";
import type { ProviderInfo } from "../../../shared/src/providers.js";
import type { ToolResult } from "../../../shared/src/protocol.js";
import { composerText, extractText, findComposerSemantic, findSendButton, isDisabled, isVisible, pressEnter, queryAll, queryFirst, setComposerText, tick } from "./dom.js";

export interface AssistantSnapshot {
  /** Final-answer text of the LAST assistant turn (reasoning panels excluded). */
  text: string;
  /** Number of assistant turns currently in the DOM. */
  count: number;
  node: HTMLElement | null;
}

export interface AdapterHealth {
  ok: boolean;
  composer: boolean;
  send: boolean;
  assistantReader: boolean;
  problems: string[];
}

/**
 * The contract every provider implements. ALL site-specific DOM knowledge lives behind it;
 * AgentCore never touches the page DOM directly.
 */
export interface ProviderAdapter {
  readonly info: ProviderInfo;
  /** Are we on a usable chat page of this provider (composer present)? */
  detect(): boolean;
  health(): AdapterHealth;
  getComposer(): HTMLElement | null;
  /** Put text in the composer and submit it. Never submits while a reply is generating. Resolves true once the site accepted it. */
  sendMessage(text: string): Promise<boolean>;
  readAssistantResponse(): AssistantSnapshot;
  /** True while the site is still producing the last reply (incl. reasoning phases and mid-stream pauses). */
  isGenerating(): boolean;
  /** M1: explicit Stop/streaming indicator. true/false when the provider has Stop selectors, null when it has none. */
  stopSignal?(): boolean | null;
  /** M5: attach an image file to the composer (paste, then drop, then file input). Resolves true when a preview showed up. */
  attachImage?(file: File): Promise<boolean>;
  /** M3: click the provider Stop button. Returns false when none is visible. */
  pressStop?(): boolean;
  /** Mount the agent panel next to the composer. Returns false if the composer is not there yet. */
  injectAgentUI(host: HTMLElement): boolean;
  extractToolCalls(text: string): ParseOutput;
  /** Format tool results for this site's message budget and send them as the next user message. */
  injectToolResult(results: ToolResult[], footer?: string): Promise<boolean>;
  /** Non-null when Start must be blocked (e.g. Arena battle mode). */
  blockReason(): string | null;
  /** Human-readable self-test of the integration on the current page (panel "Site check"). */
  diagnose(): SiteReport;
  /** The USER submitted a message themselves (trusted Enter / click): a reply boundary for the marker reader. */
  noteUserMessage(text: string): void;
}

export interface AdapterConfig {
  composer: string[];
  send: string[];
  stop: string[];
  assistant: string[];
  /** Ancestors whose content must be ignored (reasoning panels, tool UIs). */
  assistantExclude?: string[];
  /** Selectors that indicate a reply is streaming. */
  streaming?: string[];
  /** Where to mount the panel: the composer ancestor matching one of these (fallback: auto). */
  mountAnchor?: string[];
  /** Some sites only submit via Enter. */
  preferEnter?: boolean;
  /** A reply whose text has not grown for this long is considered finished (when no stop/streaming signal). */
  growthIdleMs?: number;
  /**
   * Reading replies through our delivery markers ("[bw:xxxxx]" at the end of every message we send):
   * the reply = everything rendered after our last message, up to the composer. Works on any chat DOM.
   * "primary" for sites without stable hooks, "fallback" (default) = only when the selectors find nothing.
   */
  markers?: "primary" | "fallback";
  /** How long a send waits for the site to stop generating before giving up (default 30 s). */
  idleWaitMs?: number;
  /** How long a click/Enter is given to be confirmed (default 2.5 s / 3 s). */
  confirmMs?: number;
  /**
   * Last-resort `el.textContent = text` when the editor ignored insertText/paste. It bypasses the editor's
   * own model (Notion, Lexical, ProseMirror), so the site may send an empty message or wipe it. Default true.
   */
  allowRawWrite?: boolean;
  /**
   * A send we confirmed ourselves ("our text left the box after the click") is final: a queued re-send of the
   * same marker is skipped instead of typed again (Notion renders our message late → doubled messages).
   */
  trustAcceptedSend?: boolean;
}

export interface SiteReport {
  lines: string[];
  ok: boolean;
}

const STOP_LABEL = /(stop|остановить|停止|中止)/i;

/**
 * Tracks the maximum length the current turn's stream reached and when it last advanced.
 * Text growth is the only universal liveness signal (reasoning phases often show no stop button).
 */
export class StreamMeter {
  private node: Element | null = null;
  private max = -1;
  private at = 0;
  sample(node: Element | null, len: number) {
    const now = Date.now();
    if (node !== this.node || len < this.max - 400) {
      this.node = node;
      this.max = len;
      this.at = now;
      return;
    }
    if (len > this.max) {
      this.max = len;
      this.at = now;
    }
  }
  grewWithin(ms: number) {
    return this.max > 0 && Date.now() - this.at < ms;
  }
}

/** Delivery marker: "[bw-xxxxx]" (new, no colon — ":abc" opens emoji pickers in some editors) or legacy "[bw:xxxxx]". */
export const MARK_RE = /\[bw[:\-]([a-z0-9]{5})\]\s*$/;
const MARK_ANY = /\[bw[:\-]([a-z0-9]{5})\]/;
/** XPath predicate: a text node that contains marker `m` in either format. */
const markXPath = (m: string) => `//text()[contains(., 'bw-${m}]') or contains(., 'bw:${m}]')]`;
/** Five random [a-z0-9] chars (Math.random().toString(36).slice(2,7) can be shorter). */
export function newMarkerId(): string {
  const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
const MARK_STORE = "bw_markers";

export class GenericDomAdapter implements ProviderAdapter {
  protected meter = new StreamMeter();
  protected panelHost: HTMLElement | null = null;
  /** markers of messages WE sent in this tab (survive reloads via sessionStorage) */
  protected sent: string[] = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(MARK_STORE) ?? "[]") as string[];
    } catch {
      return [];
    }
  })();
  protected usingMarkers = false;
  /** Ring buffer of send steps — shown by Site check, so "sometimes it does not send" can be traced. */
  protected sendLog: string[] = [];
  /** markers whose send WE confirmed (see AdapterConfig.trustAcceptedSend) */
  protected acceptedMarks = new Set<string>();
  /** Hook right before the send button is clicked / Enter is pressed (e.g. close inline pickers). */
  protected beforeSubmit(): void {
    /* default: nothing */
  }
  protected trace(step: string) {
    const t = new Date();
    const hh = (n: number) => String(n).padStart(2, "0");
    this.sendLog.push(`${hh(t.getHours())}:${hh(t.getMinutes())}:${hh(t.getSeconds())} ${step}`);
    if (this.sendLog.length > 40) this.sendLog.splice(0, this.sendLog.length - 40);
  }
  /** tail snippets of messages the USER typed after our last marker (they carry no marker) */
  protected userMsgs: string[] = [];
  readonly info: ProviderInfo;
  protected cfg: AdapterConfig;
  constructor(info: ProviderInfo, cfg: AdapterConfig) {
    this.info = info;
    this.cfg = cfg;
  }

  detect(): boolean {
    const hostOk = this.info.hosts.some((h) => location.hostname === h || location.hostname.endsWith("." + h));
    return hostOk && !!this.getComposer();
  }

  health(): AdapterHealth {
    const composer = this.getComposer();
    const problems: string[] = [];
    if (!composer) problems.push("composer not found");
    const send = composer ? !!this.findSend(composer) || !!this.cfg.preferEnter : false;
    if (composer && !send) problems.push("send button not found (will use Enter)");
    const reader = this.assistantNodes().length > 0;
    return { ok: !!composer, composer: !!composer, send, assistantReader: reader, problems };
  }

  getComposer(): HTMLElement | null {
    return queryFirst(this.cfg.composer) ?? findComposerSemantic();
  }

  protected findSend(composer: HTMLElement): HTMLElement | null {
    return findSendButton(composer, this.cfg.send);
  }

  /** Wait until the site is idle (sending while generating would be ignored or hit the stop button). */
  protected async waitIdle(ms: number): Promise<boolean> {
    for (let t = 0; t < ms; t += 200) {
      if (!this.isGenerating()) return true;
      await tick(200);
    }
    return !this.isGenerating();
  }

  protected rememberMarker(text: string) {
    const m = text.match(MARK_RE);
    if (!m || this.sent.includes(m[1])) return;
    this.sent.push(m[1]);
    this.userMsgs = [];
    if (this.sent.length > 300) this.sent.splice(0, this.sent.length - 300);
    try {
      sessionStorage.setItem(MARK_STORE, JSON.stringify(this.sent));
    } catch {
      /* private mode */
    }
  }

  /** Text nodes of OUR sent markers, in document order, outside any editor/panel. */
  protected markerNodes(): Text[] {
    if (!this.sent.length) return [];
    const composer = this.getComposer();
    const out: Text[] = [];
    const seen = new Set<string>();
    try {
      const res = document.evaluate("//text()[contains(., '[bw')]", document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < res.snapshotLength; i++) {
        const t = res.snapshotItem(i) as Text;
        const el = t.parentElement;
        if (!el || (composer && composer.contains(el)) || el.closest("[data-brickwire-host]") || el.closest("textarea,[contenteditable='true']")) continue;
        const m = (t.nodeValue ?? "").match(MARK_ANY);
        if (!m || !this.sent.includes(m[1]) || seen.has(m[1])) continue; // first occurrence only (the AI may echo it)
        seen.add(m[1]);
        out.push(t);
      }
    } catch {
      /* XPath unavailable */
    }
    return out;
  }

  noteUserMessage(text: string) {
    const lines = text.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
    const tail = (lines[lines.length - 1] ?? "").slice(-24).trim();
    if (tail.length >= 3) this.userMsgs.push(tail);
  }

  /** After `from`: the first rendered (non-editor) text node containing `snippet`. */
  private textAfter(from: Node, snippet: string): Text | null {
    const composer = this.getComposer();
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    w.currentNode = from;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const el = n.parentElement;
      if (!el || (composer && composer.contains(el)) || el.closest("[data-brickwire-host],textarea,[contenteditable='true']")) continue;
      if ((n.nodeValue ?? "").includes(snippet)) return n as Text;
    }
    return null;
  }

  /** Reply after our last message: everything rendered after its marker, up to the panel/composer. */
  protected readByMarkers(): AssistantSnapshot | null {
    const marks = this.markerNodes();
    if (!marks.length) return null;
    let last: Text = marks[marks.length - 1];
    let extra = 0;
    // the user typed messages themselves after our last one → the reply starts after the latest of them
    for (const snip of this.userMsgs) {
      const t = this.textAfter(last, snip);
      if (!t) break;
      last = t;
      extra++;
    }
    const composer = this.getComposer();
    const end = this.panelHost?.isConnected && this.panelHost.parentElement !== document.body ? this.panelHost : composer;
    const range = document.createRange();
    range.setStartAfter(last);
    if (end && last.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING) range.setEndBefore(end);
    else range.setEndAfter(document.body.lastChild ?? document.body);
    const box = document.createElement("div");
    box.appendChild(range.cloneContents());
    box.querySelectorAll("[data-brickwire-host],textarea,[contenteditable='true'],[role='textbox']").forEach((e) => e.remove());
    if (this.cfg.assistantExclude?.length) {
      try {
        box.querySelectorAll(this.cfg.assistantExclude.join(",")).forEach((e) => e.remove());
      } catch {
        /* ignore */
      }
    }
    let text = extractText(box).replace(/^\s+/, "");
    // only UI chrome so far ("Copy", "Edit", timestamps) → no reply yet
    if (text.replace(/\s+/g, "").length < 24 && !text.includes("<")) text = "";
    return { text, count: marks.length + extra, node: last.parentElement };
  }

  /**
   * One send at a time per tab. Several callers (agent loop, delivery watchdog, hang recovery, outbox,
   * panel buttons) can fire at once; two overlapping sends wrote into the same composer, overwrote or
   * doubled each other's text and left the editor stuck. All sends are queued here.
   */
  private sendQueue: Promise<unknown> = Promise.resolve();

  sendMessage(text: string): Promise<boolean> {
    const run = this.sendQueue.then(async () => {
      // a queued duplicate of a message that is already in the chat → nothing to do
      const mark = text.match(MARK_RE)?.[1];
      if (mark && this.markerVisible(mark)) {
        this.trace(`skip: [${mark}] is already in the chat`);
        return true;
      }
      if (mark && this.cfg.trustAcceptedSend && this.acceptedMarks.has(mark)) {
        this.trace(`skip re-send: [${mark}] was already accepted (not rendered yet)`);
        return true;
      }
      try {
        const ok = await this.doSendMessage(text);
        if (ok && mark) {
          this.acceptedMarks.add(mark);
          if (this.acceptedMarks.size > 200) this.acceptedMarks.delete(this.acceptedMarks.values().next().value as string);
        }
        this.trace(`${ok ? "OK" : "FAILED"}: send ${mark ? "[" + mark + "]" : ""} (${text.length} chars)`);
        return ok;
      } catch (e) {
        this.trace(`FAILED: exception ${(e as Error)?.message ?? e}`);
        return false;
      }
    });
    this.sendQueue = run.catch(() => false);
    return run;
  }

  /** Our marker is rendered in the chat (outside the composer / editors / panel) → the site took the message. */
  protected markerVisible(mark: string): boolean {
    try {
      const composer = this.getComposer();
      const res = document.evaluate(markXPath(mark), document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < res.snapshotLength; i++) {
        const el = res.snapshotItem(i)!.parentElement;
        if (el && !(composer && composer.contains(el)) && !el.closest("[data-brickwire-host]") && !el.closest("textarea,[contenteditable='true']")) return true;
      }
    } catch {
      /* XPath unavailable */
    }
    return false;
  }

  /**
   * Did the site accept `text`? Marker rendered in the chat, a new reply turn, or the composer no longer
   * holds our text. A composer that is missing (re-rendering right after submit) is NOT proof by itself.
   */
  protected sendAccepted(text: string, before: number): boolean {
    const mark = text.match(MARK_RE)?.[1];
    if (mark && this.markerVisible(mark)) return true;
    if (this.readAssistantResponse().count > before) return true;
    const c = this.getComposer();
    if (!c) return false;
    const left = composerText(c).replace(/\s+/g, " ").trim();
    return left.length < Math.min(10, text.trim().length);
  }

  protected async doSendMessage(text: string): Promise<boolean> {
    this.rememberMarker(text);
    const idleMs = this.cfg.idleWaitMs ?? 30000;
    if (!(await this.waitIdle(idleMs))) {
      this.trace(`site still generating after ${Math.round(idleMs / 1000)} s`);
      return false;
    }
    const el = this.getComposer();
    if (!el) {
      this.trace("message box not found");
      return false;
    }
    const before = this.readAssistantResponse().count;
    if (!(await setComposerText(el, text, { allowRawWrite: this.cfg.allowRawWrite !== false }))) {
      this.trace("text could not be put into the message box");
      return false;
    }
    await tick(150);
    const confirmMs = this.cfg.confirmMs ?? 2500;
    const confirmed = async (ms: number) => {
      for (let waited = 0; waited < ms; waited += 150) {
        await tick(150);
        if (this.sendAccepted(text, before)) return true;
      }
      return false;
    };
    // Strategy chain, each step confirmed: click send (waiting for it to enable) → Enter key.
    if (!this.cfg.preferEnter) {
      let btn: HTMLElement | null = null;
      for (let i = 0; i < 20; i++) {
        btn = this.findSend(this.getComposer() ?? el);
        if (btn && !isDisabled(btn) && !this.isStopButton(btn)) break;
        await tick(150); // frameworks enable the button after an input debounce
      }
      if (btn && !isDisabled(btn) && !this.isStopButton(btn)) {
        this.beforeSubmit();
        btn.click();
        if (await confirmed(confirmMs)) return true;
        this.trace("send button clicked, not confirmed — trying Enter");
      } else this.trace(btn ? "send button disabled / shows Stop — trying Enter" : "send button not found — trying Enter");
    }
    // The click may have gone through while the page is still catching up: never press Enter on top of a
    // message that is already on its way (that produced doubled messages / a stuck half-sent state).
    if (this.sendAccepted(text, before) || this.isGenerating()) return confirmed(1500);
    const c = this.getComposer() ?? el;
    if (!c.isConnected) {
      this.trace("message box was replaced by the site");
      return false;
    }
    c.focus();
    this.beforeSubmit();
    pressEnter(c);
    const ok = await confirmed(Math.max(3000, confirmMs));
    if (!ok) this.trace("Enter pressed, not confirmed (text still in the box)");
    return ok;
  }

  /** Attachment previews near the composer (img/blob previews, file chips). Used to confirm attachImage. */
  protected attachmentCount(): number {
    const c = this.getComposer();
    const root = (c?.closest("form, fieldset, [data-testid*='composer' i], [class*='composer' i], [class*='input-area' i]") as HTMLElement | null) ?? c?.parentElement?.parentElement?.parentElement ?? null;
    if (!root) return 0;
    return root.querySelectorAll("img[src^='blob:'], img[src^='data:'], [data-testid*='attachment' i], [data-testid*='file' i], [class*='attachment' i], [aria-label*='Remove file' i], [aria-label*='remove attachment' i]").length;
  }

  async attachImage(file: File): Promise<boolean> {
    if (!(await this.waitIdle(30000))) return false;
    const el = this.getComposer();
    if (!el) return false;
    const before = this.attachmentCount();
    const shown = async (ms: number) => {
      for (let t = 0; t < ms; t += 150) {
        await tick(150);
        if (this.attachmentCount() > before) return true;
      }
      return false;
    };
    const dt = () => {
      const d = new DataTransfer();
      d.items.add(file);
      return d;
    };
    el.focus();
    // 1) paste (ChatGPT, Claude, Gemini, DeepSeek and most React composers accept pasted files)
    try {
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt(), bubbles: true, cancelable: true }));
      if (await shown(2500)) return true;
    } catch {
      /* ignore */
    }
    // 2) drag & drop onto the composer
    try {
      const d = dt();
      for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { dataTransfer: d, bubbles: true, cancelable: true }));
      if (await shown(2500)) return true;
    } catch {
      /* ignore */
    }
    // 3) the site's own hidden <input type=file>
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='file']")).filter((i) => !i.closest("[data-brickwire-host]"));
    const extension="." + file.name.split(".").at(-1)?.toLowerCase();
    const pick = inputs.find(i=>!i.accept || i.accept.split(",").some(raw=>{const a=raw.trim().toLowerCase();return a==="*"||a===extension||a===file.type||a.endsWith("/*")&&file.type.startsWith(a.slice(0,-1));})) ?? inputs[0];
    if (pick) {
      try {
        pick.files = dt().files;
        pick.dispatchEvent(new Event("input", { bubbles: true }));
        pick.dispatchEvent(new Event("change", { bubbles: true }));
        if (await shown(4000)) return true;
      } catch {
        /* ignore */
      }
    }
    return false;
  }

  /** Providers whose send button doubles as stop override this. */
  protected isStopButton(_btn: HTMLElement): boolean {
    return false;
  }

  protected assistantNodes(): HTMLElement[] {
    let nodes = queryAll(this.cfg.assistant).filter((n) => !n.closest("[data-brickwire-host]"));
    if (this.cfg.assistantExclude?.length) {
      const ex = this.cfg.assistantExclude.join(",");
      nodes = nodes.filter((n) => {
        try {
          return !n.closest(ex) && !n.matches(ex);
        } catch {
          return true;
        }
      });
    }
    return nodes;
  }

  readAssistantResponse(): AssistantSnapshot {
    if (this.cfg.markers === "primary" || this.usingMarkers) return this.readByMarkers() ?? { text: "", count: 0, node: null };
    const nodes = this.assistantNodes();
    const node = nodes[nodes.length - 1] ?? null;
    if (!node) {
      // selectors found nothing: switch (for this tab) to the universal marker reader once our messages are visible
      const m = this.readByMarkers();
      if (m) {
        this.usingMarkers = true;
        return m;
      }
      return { text: "", count: 0, node: null };
    }
    let text: string;
    if (this.cfg.assistantExclude?.length) {
      const clone = node.cloneNode(true) as HTMLElement;
      try {
        clone.querySelectorAll(this.cfg.assistantExclude.join(",")).forEach((e) => e.remove());
      } catch {
        /* ignore */
      }
      text = extractText(clone);
    } else text = extractText(node);
    return { text, count: nodes.length, node };
  }

  /** Everything the site is streaming for the last turn (answer + reasoning) — used only as a liveness signal. */
  protected streamLength(): { node: Element | null; len: number } {
    if (this.cfg.markers === "primary" || this.usingMarkers) {
      const m = this.readByMarkers();
      return { node: m?.node ?? null, len: m?.text.length ?? 0 };
    }
    const nodes = queryAll(this.cfg.assistant);
    const node = nodes[nodes.length - 1] ?? null;
    return { node, len: node?.textContent?.length ?? 0 };
  }

  pressStop(): boolean {
    const btn = this.cfg.stop.length ? (queryFirst(this.cfg.stop) as HTMLElement | null) : null;
    if (!btn) return false;
    btn.click();
    return true;
  }

  stopSignal(): boolean | null {
    const streaming = this.cfg.streaming ?? [];
    if (!this.cfg.stop.length && !streaming.length) return null;
    if (streaming.length && queryFirst(streaming, document, false)) return true;
    return !!(this.cfg.stop.length && queryFirst(this.cfg.stop));
  }

  isGenerating(): boolean {
    const s = this.streamLength();
    this.meter.sample(s.node, s.len);
    if (this.cfg.streaming?.length && queryFirst(this.cfg.streaming, document, false)) return true;
    if (queryFirst(this.cfg.stop)) return true;
    const composer = this.getComposer();
    if (composer) {
      // semantic: a visible "Stop" button near the composer
      let scope: HTMLElement | null = composer;
      for (let i = 0; i < 6 && scope; i++) scope = scope.parentElement;
      const btns = Array.from((scope ?? document).querySelectorAll<HTMLElement>('button, [role="button"]'));
      if (btns.some((b) => isVisible(b) && !b.closest("[data-brickwire-host]") && STOP_LABEL.test((b.getAttribute("aria-label") ?? "") + (b.getAttribute("title") ?? "") + (b.getAttribute("data-testid") ?? "")))) return true;
    }
    return this.meter.grewWithin(this.cfg.growthIdleMs ?? 2500);
  }

  injectAgentUI(host: HTMLElement): boolean {
    this.panelHost = host;
    const composer = this.getComposer();
    if (!composer) return false;
    let anchor: HTMLElement | null = this.cfg.mountAnchor?.length ? (composer.closest(this.cfg.mountAnchor.join(",")) as HTMLElement | null) : null;
    if (!anchor) {
      // climb to the widest ancestor that still looks like the composer box (≤ 5 levels, ≤ 320px tall)
      anchor = composer;
      for (let i = 0, cur: HTMLElement | null = composer.parentElement; i < 5 && cur; i++, cur = cur.parentElement) {
        const r = cur.getBoundingClientRect();
        if (r.height > 320 || cur === document.body) break;
        anchor = cur;
      }
    }
    if (!anchor.parentElement) return false;
    if (host.parentElement === anchor.parentElement && host.nextElementSibling === anchor) return true;
    anchor.parentElement.insertBefore(host, anchor);
    return true;
  }

  extractToolCalls(text: string): ParseOutput {
    return parseAgentOutput(text);
  }

  async injectToolResult(results: ToolResult[], footer?: string): Promise<boolean> {
    return this.sendMessage(formatToolResults(results, this.info.maxMessageChars, footer));
  }

  blockReason(): string | null {
    return null;
  }

  diagnose(): SiteReport {
    const lines: string[] = [];
    const c = this.getComposer();
    const desc = (e: Element | null) => {
      if (!e) return "—";
      const h = e as HTMLElement;
      const ph = h.getAttribute("placeholder") ?? h.getAttribute("aria-label") ?? h.getAttribute("data-placeholder") ?? "";
      return `<${h.tagName.toLowerCase()}${h.id ? "#" + h.id : ""}${h.isContentEditable ? " contenteditable" : ""}>${ph ? ` "${ph.slice(0, 40)}"` : ""}`;
    };
    lines.push(`${c ? "✓" : "✕"} message box: ${desc(c)}`);
    const send = c ? this.findSend(c) : null;
    lines.push(`${send ? "✓" : "○"} send button: ${send ? desc(send) : this.cfg.preferEnter ? "uses Enter" : "not found — Enter key will be used"}`);
    const sel = this.cfg.markers === "primary" ? 0 : this.assistantNodes().length;
    const mk = this.markerNodes().length;
    lines.push(`${sel || mk ? "✓" : "○"} reply reader: ${this.cfg.markers === "primary" || this.usingMarkers ? `markers (${mk} of our messages visible)` : `selectors (${sel} replies)${mk ? `, markers ${mk}` : ""}`}`);
    lines.push(`· generating now: ${this.isGenerating() ? "yes" : "no"}`);
    const block = this.blockReason();
    if (block) lines.push("✕ " + block);
    if (this.sendLog.length) {
      lines.push("Last send steps:");
      for (const l of this.sendLog.slice(-12)) lines.push("  " + l);
    }
    return { lines, ok: !!c && !block };
  }
}
