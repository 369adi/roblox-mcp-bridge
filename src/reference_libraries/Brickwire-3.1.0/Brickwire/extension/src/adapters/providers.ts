import { PROVIDERS, type ProviderInfo } from "../../../shared/src/providers.js";
import { GenericDomAdapter, type AssistantSnapshot, type ProviderAdapter, type SiteReport } from "./base.js";
import { extractText, isDisabled, isVisible, pressEnter, pressEscape, queryAll, queryFirst, setComposerText, tick } from "./dom.js";

/**
 * Provider adapters. Selectors are layered: stable attributes (data-testid, ids, aria) first,
 * then structural/class hints, then the generic semantic fallbacks in GenericDomAdapter.
 * Verified against the mock pages in tests/mocks/pages; live sites must be re-checked when they change.
 */

const info = (id: string): ProviderInfo => PROVIDERS.find((p) => p.id === id)!;

export class ChatGPTAdapter extends GenericDomAdapter {
  constructor() {
    super(info("chatgpt"), {
      composer: ["#prompt-textarea[contenteditable='true']", "div#prompt-textarea", "textarea#prompt-textarea", "form [contenteditable='true'].ProseMirror"],
      send: ["button[data-testid='send-button']", "#composer-submit-button", "button[aria-label*='Send' i]"],
      stop: ["button[data-testid='stop-button']", "button[aria-label*='Stop' i]"],
      assistant: ["[data-message-author-role='assistant']"],
      streaming: [".result-streaming", "[data-message-author-role='assistant'] .streaming-animation"],
      mountAnchor: ["form[data-type='unified-composer']", "form"],
    });
  }
}

/**
 * DeepSeek (chat.deepseek.com) — the primary, fully supported provider.
 * Site facts this adapter relies on (multiple signals each, no single hashed class):
 *  - one turn = one `.ds-message`; replies are `.ds-markdown` OUTSIDE `.ds-think-content` (DeepThink).
 *    Drafts inside reasoning are never read, so they can never be executed.
 *  - composer is a real <textarea> driven by React (native value setter + input event).
 *  - the footer `.ds-button--primary` is BOTH send and stop and has no aria-label. Its svg glyph tells
 *    which: stop = <rect> or a path starting near the origin ("M2…"), send = arrow ("M8…").
 *    Clicking it while generating ABORTS the reply, so we never click it unless idle.
 *  - `.ds-loading` = spin-up; during reasoning there is NO stop glyph — only text growth says "alive".
 */
export class DeepSeekAdapter extends GenericDomAdapter {
  static readonly TURN = ".ds-message";
  static readonly THINK = ".ds-think-content";
  static readonly MD = ".ds-markdown";
  constructor() {
    super(info("deepseek"), {
      composer: ["textarea#chat-input", "textarea[placeholder*='DeepSeek' i]", "textarea[placeholder*='Message' i]", "textarea"],
      send: [".ds-button--primary[role='button']", ".ds-button--primary", "div[role='button'][aria-label*='Send' i]"],
      stop: [],
      assistant: [".ds-markdown"],
      assistantExclude: [".ds-think-content"],
    });
  }

  getComposer(): HTMLElement | null {
    const all = Array.from(document.querySelectorAll<HTMLTextAreaElement>("textarea")).filter((t) => isVisible(t) && !t.closest("[data-brickwire-host]") && !t.closest(".ds-textarea--bordered"));
    if (!all.length) return null;
    return all.find((t) => /deepseek|message|ask|сообщ|发送|给/i.test(t.placeholder)) ?? all[all.length - 1];
  }

  private footerButton(): HTMLElement | null {
    const c = this.getComposer();
    let scope: HTMLElement | null = c;
    for (let i = 0; i < 6 && scope; i++) {
      scope = scope.parentElement;
      const b = scope?.querySelector<HTMLElement>(".ds-button--primary");
      if (b && isVisible(b)) return b;
    }
    return queryFirst([".ds-button--primary"]);
  }

  protected findSend(): HTMLElement | null {
    return this.footerButton();
  }

  protected isStopButton(btn: HTMLElement): boolean {
    if (btn.querySelector("rect")) return true;
    const d = btn.querySelector("path")?.getAttribute("d") ?? "";
    if (/^\s*M\s*[0-3][\s.,]/.test(d)) return true;
    return /stop|停止/i.test(btn.getAttribute("aria-label") ?? "");
  }

  private turns(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(DeepSeekAdapter.TURN)).filter((n) => !n.closest("[data-brickwire-host]"));
  }

  private isUserTurn(t: HTMLElement): boolean {
    // user turns have no reply markdown (they render a plain bubble); assistant turns always contain .ds-markdown or reasoning
    if (t.querySelector(".fbb737a4")) return true;
    return !t.querySelector(DeepSeekAdapter.MD) && !t.querySelector(DeepSeekAdapter.THINK);
  }

  private assistantTurns(): HTMLElement[] {
    const turns = this.turns();
    if (turns.length) return turns.filter((t) => !this.isUserTurn(t));
    // structural fallback: group reply markdown by closest parent turn-like container
    return this.assistantNodes();
  }

  readAssistantResponse(): AssistantSnapshot {
    const turns = this.assistantTurns();
    const node = turns[turns.length - 1] ?? null;
    if (!node) return { text: "", count: 0, node: null };
    const mds = Array.from(node.querySelectorAll<HTMLElement>(DeepSeekAdapter.MD)).filter((m) => !m.closest(DeepSeekAdapter.THINK));
    const outer = mds.filter((m) => !mds.some((o) => o !== m && o.contains(m)));
    const text = outer.length ? outer.map((m) => extractText(m)).join("\n") : node.matches(DeepSeekAdapter.MD) ? extractText(node) : "";
    return { text, count: turns.length, node };
  }

  protected streamLength() {
    const turns = this.assistantTurns();
    const node = turns[turns.length - 1] ?? null;
    return { node, len: node?.textContent?.length ?? 0 };
  }

  isGenerating(): boolean {
    const s = this.streamLength();
    this.meter.sample(s.node, s.len);
    if (document.querySelector(".ds-loading")) return true;
    const btn = this.footerButton();
    if (btn && this.isStopButton(btn)) return true;
    // reasoning phase: no stop glyph, reply still empty, reasoning text present → alive while it grows
    const node = s.node as HTMLElement | null;
    const reasoning = !!node?.querySelector(DeepSeekAdapter.THINK) && !this.readAssistantResponse().text.trim();
    return this.meter.grewWithin(reasoning ? 12000 : 1200);
  }

  protected async doSendMessage(text: string): Promise<boolean> {
    this.rememberMarker(text);
    if (!(await this.waitIdle(60000))) return false;
    const ta = this.getComposer() as HTMLTextAreaElement | null;
    if (!ta) return false;
    const before = this.readAssistantResponse().count;
    ta.focus();
    await setComposerText(ta, text.length > 160000 ? text.slice(0, 160000) + "\n[…truncated to fit DeepSeek's input limit]" : text);
    const accepted = async (ms: number) => {
      for (let t = 0; t < ms; t += 150) {
        await tick(150);
        if (!ta.isConnected ? this.sendAccepted(text, before) : !ta.value.trim() || this.sendAccepted(text, before)) return true;
      }
      return false;
    };
    for (let i = 0; i < 15; i++) {
      const b = this.footerButton();
      if (b && !isDisabled(b) && !this.isStopButton(b)) break;
      await tick(120);
    }
    const btn = this.footerButton();
    if (btn && !isDisabled(btn) && !this.isStopButton(btn)) {
      btn.click();
      if (await accepted(2500)) return true;
    }
    if (this.isGenerating() || this.sendAccepted(text, before)) return accepted(1500);
    pressEnter(ta);
    return accepted(3000);
  }
}

export class ClaudeAdapter extends GenericDomAdapter {
  constructor() {
    super(info("claude"), {
      composer: ["div.ProseMirror[contenteditable='true']", "[data-testid='chat-input'] [contenteditable='true']", "fieldset [contenteditable='true']"],
      send: ["button[aria-label='Send message']", "button[aria-label*='Send' i]", "button[data-testid='send-button']"],
      stop: ["button[aria-label='Stop response']", "button[aria-label*='Stop' i]"],
      assistant: [".font-claude-response", ".font-claude-message", "[data-testid='assistant-message']"],
      assistantExclude: ["[data-testid*='thinking']", "[class*='thinking']"],
      streaming: ["[data-is-streaming='true']"],
      mountAnchor: ["fieldset", "[data-testid='chat-input-container']"],
    });
  }
}

export class GeminiAdapter extends GenericDomAdapter {
  constructor() {
    super(info("gemini"), {
      composer: ["rich-textarea .ql-editor[contenteditable='true']", "div.ql-editor[contenteditable='true']", "[contenteditable='true'][role='textbox']"],
      send: ["button.send-button", "button[aria-label*='Send' i]", "button[mattooltip*='Send' i]"],
      stop: ["button.stop", "button[aria-label*='Stop' i]"],
      assistant: ["model-response message-content", "model-response .markdown", "message-content .markdown"],
      assistantExclude: ["model-thoughts", "[class*='thoughts']"],
      mountAnchor: ["input-area-v2", "input-area", ".input-area-container"],
    });
  }
}

export class QwenAdapter extends GenericDomAdapter {
  constructor() {
    super(info("qwen"), {
      composer: ["textarea#chat-input", "textarea.message-input-textarea", "textarea[placeholder]"],
      send: ["#send-message-button", "button.send-button", "button[aria-label*='Send' i]"],
      stop: ["button.stop-button", "button[aria-label*='Stop' i]", "[class*='stop-button']"],
      assistant: [".response-message-content", "[class*='response-message-content']", ".chat-response-message .markdown-content"],
      assistantExclude: ["[class*='thinking']", "[class*='think-content']"],
    });
  }
}

export class KimiAdapter extends GenericDomAdapter {
  constructor() {
    super(info("kimi"), {
      composer: [".chat-input-editor[contenteditable='true']", "[data-lexical-editor='true']", "div[contenteditable='true'][role='textbox']"],
      send: [".send-button", "[class*='send-button']", "button[aria-label*='Send' i]"],
      stop: ["[class*='stop-button']", "button[aria-label*='Stop' i]", ".send-button.stop"],
      assistant: [".segment-assistant .markdown", ".segment-assistant", "[class*='segment-assistant']"],
      assistantExclude: ["[class*='toolcall']", "[class*='thinking']"],
    });
  }
}

export class GLMAdapter extends GenericDomAdapter {
  constructor() {
    super(info("glm"), {
      composer: ["textarea#chat-input", "textarea[placeholder]"],
      send: ["#send-message-button", "button[type='submit']", "button[aria-label*='Send' i]"],
      stop: ["button[aria-label*='Stop' i]", "[class*='stop']"],
      assistant: [".chat-assistant", "#response-content-container", ".markdown-prose"],
      assistantExclude: ["[class*='thinking']", "details"],
    });
  }
}

export class ArenaAdapter extends GenericDomAdapter {
  constructor() {
    super(info("arena"), {
      composer: ["textarea[name='message']", "textarea[placeholder*='Ask' i]", "textarea"],
      send: ["button[type='submit']", "button[aria-label*='Send' i]"],
      stop: ["button[aria-label*='Stop' i]"],
      assistant: ["[data-role='assistant']", "[data-message-role='assistant']", ".prose"],
    });
  }
  blockReason(): string | null {
    const path = location.pathname.toLowerCase();
    if (/battle|side-by-side|sxs|compare/.test(path) || /mode=(battle|side)/.test(location.search)) return "Arena: switch to Direct mode (Battle / Side-by-Side are not supported).";
    // two assistant columns rendered side by side → battle-style layout
    const nodes = queryAll(["[data-role='assistant']", "[data-message-role='assistant']"]);
    if (nodes.length >= 2) {
      const a = nodes[nodes.length - 1].getBoundingClientRect();
      const b = nodes[nodes.length - 2].getBoundingClientRect();
      if (Math.abs(a.top - b.top) < 8 && Math.abs(a.left - b.left) > 100) return "Arena: side-by-side responses detected — use Direct mode.";
    }
    return null;
  }
}

/**
 * Notion AI — first-class provider. Notion's chat DOM has no stable hooks and the page editor is ALSO
 * contenteditable, so:
 *  - the composer is chosen by score among visible editors that are NOT part of a page
 *    (.notion-page-content, [data-block-id], topbar, sidebar, peek pages): AI-ish placeholder/label,
 *    chat route (/chat, /ai), dialog/aside container, lower on screen;
 *  - once chosen, the composer is LOCKED while it stays in the DOM: its placeholder disappears as soon as it
 *    holds text, and re-scoring then picked another (empty) editor — the send looked "accepted" but was lost;
 *  - Send / Stop are icon-only: they are found among the buttons of the composer box (not just 5 parents up)
 *    and told apart by label, svg shape (square = stop) and position; "upload" is never taken for "up";
 *  - replies are read through our delivery markers (everything rendered after our last message);
 *  - "generating" = a Stop control in the composer box, the send button showing Stop, or reply text still growing.
 */
export class NotionAdapter extends GenericDomAdapter {
  static readonly PAGE_SCOPE = ".notion-page-content, [data-block-id], .notion-topbar, .notion-sidebar, .notion-sidebar-container, .notion-frame .notion-page-block";
  static readonly AI_LABEL = /(ask|ai\b|ии|спрос|задай|anything|message|notion ai|сообщ|chat)/i;
  static readonly NOT_SEND = /(upload|attach|file|paperclip|clip\b|image|photo|mic|voice|dictat|mention|emoji|plus|add|model|settings|more|menu|close|прикреп|файл|загруз|микроф|голос|добав|настро|ещё|закры)/i;
  static readonly STOP = /(stop|останов|停止|中止)/i;
  private locked: HTMLElement | null = null;
  private cache: { at: number; el: HTMLElement | null } = { at: 0, el: null };
  constructor() {
    super(info("notion"), {
      composer: [],
      send: [],
      stop: [],
      assistant: [],
      markers: "primary",
      growthIdleMs: 6000,
      idleWaitMs: 120000,
      confirmMs: 6000,
      allowRawWrite: false,
      trustAcceptedSend: true,
    });
  }

  private label(e: Element) {
    return ["placeholder", "aria-label", "data-placeholder", "aria-placeholder"].map((a) => e.getAttribute(a) ?? "").join(" ") + " " + (e.querySelector("[placeholder],[data-placeholder]")?.getAttribute("placeholder") ?? e.querySelector("[data-placeholder]")?.getAttribute("data-placeholder") ?? "");
  }

  private candidates(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("[contenteditable='true'], textarea")).filter(
      (e) => isVisible(e) && !e.closest("[data-brickwire-host]") && !e.closest(NotionAdapter.PAGE_SCOPE) && !e.parentElement?.closest("[contenteditable='true']"),
    );
  }

  private stillUsable(e: HTMLElement | null): e is HTMLElement {
    return !!e && e.isConnected && isVisible(e) && !e.closest(NotionAdapter.PAGE_SCOPE) && !e.closest("[data-brickwire-host]");
  }

  getComposer(): HTMLElement | null {
    // called many times per tick (mount loop, isGenerating, readers): scoring every editor each time made Notion janky
    const now = Date.now();
    if (now - this.cache.at < 150 && (this.cache.el === null || this.cache.el.isConnected)) return this.cache.el;
    const el = this.pickComposer();
    this.cache = { at: now, el };
    return el;
  }

  private pickComposer(): HTMLElement | null {
    if (this.stillUsable(this.locked)) return this.locked;
    this.locked = null;
    const cands = this.candidates();
    if (!cands.length) return null;
    const chatRoute = /\/(chat|ai)(\/|$|\?)/i.test(location.pathname + "/") || /[?&]t=/.test(location.search);
    const score = (e: HTMLElement) => {
      const r = e.getBoundingClientRect();
      let s = r.bottom / Math.max(1, window.innerHeight);
      if (NotionAdapter.AI_LABEL.test(this.label(e))) s += 2;
      if (e.closest("[role='dialog'], aside, [aria-label*='AI' i], [class*='ai-chat' i], [class*='assistant' i], [class*='chat' i]")) s += 1;
      if (chatRoute) s += 0.5;
      if (e.getAttribute("role") === "textbox") s += 0.3;
      return s;
    };
    const best = cands.sort((a, b) => score(b) - score(a))[0];
    // outside the chat route, accept only a composer that clearly looks like the AI box
    if (!chatRoute && score(best) < 2) return null;
    // lock only an editor that was recognised by its AI label (an empty composer still shows its placeholder)
    if (NotionAdapter.AI_LABEL.test(this.label(best)) || chatRoute) this.locked = best;
    return best;
  }

  /** The composer box: the widest ancestor (≤ 12 levels, ≤ 420 px tall) — Notion nests the editor deeply. */
  private composerBox(c: HTMLElement): HTMLElement {
    let box: HTMLElement = c;
    for (let i = 0, cur = c.parentElement; i < 12 && cur && cur !== document.body; i++, cur = cur.parentElement) {
      const r = cur.getBoundingClientRect();
      if (r.height > 420) break;
      box = cur;
    }
    return box;
  }

  private nearComposerButtons(): HTMLElement[] {
    const c = this.getComposer();
    if (!c) return [];
    const box = this.composerBox(c);
    const br = box.getBoundingClientRect();
    const inBox = Array.from(box.querySelectorAll<HTMLElement>("button, [role='button']"));
    // buttons rendered just outside the box (toolbar row under the editor)
    const parent = box.parentElement;
    const around = parent
      ? Array.from(parent.querySelectorAll<HTMLElement>("button, [role='button']")).filter((b) => {
          if (inBox.includes(b)) return false;
          const r = b.getBoundingClientRect();
          return r.top >= br.top - 40 && r.bottom <= br.bottom + 90 && r.left >= br.left - 40 && r.right <= br.right + 40;
        })
      : [];
    return [...inBox, ...around].filter((b) => isVisible(b) && !b.closest("[data-brickwire-host]") && !b.closest(NotionAdapter.PAGE_SCOPE) && !(b.parentElement?.closest("button, [role='button']")));
  }

  private btnText(b: HTMLElement) {
    return [b.getAttribute("aria-label"), b.getAttribute("title"), b.getAttribute("data-testid"), b.textContent].join(" ");
  }

  private svgInfo(b: HTMLElement) {
    return Array.from(b.querySelectorAll("svg, svg use, svg [class]")).map((e) => `${e.getAttribute("class") ?? ""} ${e.getAttribute("href") ?? e.getAttribute("xlink:href") ?? ""} ${e.getAttribute("aria-label") ?? ""}`).join(" ");
  }

  protected findSend(): HTMLElement | null {
    const btns = this.nearComposerButtons();
    const byLabel = btns.find((b) => /(send|submit|отправ)/i.test(this.btnText(b)) && !NotionAdapter.STOP.test(this.btnText(b)));
    if (byLabel) return byLabel;
    const c = this.getComposer();
    if (!c) return null;
    const cr = this.composerBox(c).getBoundingClientRect();
    // icon-only buttons in the right half / bottom row of the composer box, not attach / mention / model pickers
    const icons = btns.filter((b) => {
      if (!b.querySelector("svg") || (b.textContent ?? "").trim().length > 2) return false;
      if (NotionAdapter.NOT_SEND.test(this.btnText(b) + " " + this.svgInfo(b))) return false;
      const r = b.getBoundingClientRect();
      return r.left + r.width / 2 >= cr.left + cr.width * 0.5 && r.top < cr.bottom + 90 && r.bottom > cr.top - 40;
    });
    if (!icons.length) return null;
    const arrow = icons.filter((b) => /(arrow|send|submit)/i.test(this.svgInfo(b)));
    const pool = arrow.length ? arrow : icons;
    // Notion puts send at the far right of the bottom row
    return pool.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return rb.right + rb.bottom * 0.5 - (ra.right + ra.bottom * 0.5);
    })[0];
  }

  protected isStopButton(btn: HTMLElement): boolean {
    const text = this.btnText(btn);
    if (NotionAdapter.STOP.test(text) || /\bstop|square/i.test(this.svgInfo(btn))) return true;
    // attach / mention / model / plus buttons are never Stop, whatever their glyph looks like
    if (NotionAdapter.NOT_SEND.test(text + " " + this.svgInfo(btn))) return false;
    if ((btn.textContent ?? "").trim().length > 2) return false;
    if (btn.querySelector("svg rect")) return true;
    // a single closed square-ish path (one M, horizontal + vertical edges, closed with z) = stop glyph
    const paths = Array.from(btn.querySelectorAll("svg path"));
    if (paths.length !== 1) return false;
    const d = paths[0].getAttribute("d") ?? "";
    return /^[\sMmHhVvLlZzAaCcQqSs0-9.,\-]+$/.test(d) && (d.match(/[Mm]/g) ?? []).length === 1 && /[Hh]/.test(d) && /[Vv]/.test(d) && /[Zz]\s*$/.test(d);
  }

  /** true once a Stop control was really recognised in this tab — until then "no Stop" means "unknown", not "finished". */
  private seenStop = false;

  /** A Stop control: glyph/label inside the composer box, or a LABELLED Stop button a few levels around it. */
  private stopButton(): HTMLElement | null {
    const inBox = this.nearComposerButtons().find((b) => this.isStopButton(b));
    if (inBox) return inBox;
    const c = this.getComposer();
    if (!c) return null;
    let scope: HTMLElement | null = c;
    for (let i = 0; i < 8 && scope?.parentElement && scope.parentElement !== document.body; i++) scope = scope.parentElement;
    return (
      Array.from((scope ?? document).querySelectorAll<HTMLElement>("button, [role='button']")).find(
        (b) => isVisible(b) && !b.closest("[data-brickwire-host]") && !b.closest(NotionAdapter.PAGE_SCOPE) && NotionAdapter.STOP.test([b.getAttribute("aria-label"), b.getAttribute("title"), b.getAttribute("data-testid")].join(" ")),
      ) ?? null
    );
  }

  stopSignal(): boolean | null {
    const stop = !!this.stopButton();
    if (stop) this.seenStop = true;
    return stop ? true : this.seenStop ? false : null;
  }

  isGenerating(): boolean {
    const s = this.streamLength();
    this.meter.sample(s.node, s.len);
    if (this.stopButton()) {
      this.seenStop = true;
      return true;
    }
    // Stop control recognised in this tab → its absence is reliable, a short growth window is enough.
    // Not recognised (yet) → Notion's silent phases need the long window.
    return this.meter.grewWithin(this.seenStop ? 2500 : (this.cfg.growthIdleMs ?? 6000));
  }

  pressStop(): boolean {
    const b = this.stopButton();
    if (!b) return false;
    b.click();
    return true;
  }

  /** Inline pickers (@mention, :emoji, [[link, /command) — while one is open, Enter picks an item instead of sending. */
  private openPickers(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>("[role='listbox'], [role='menu'], .notion-mention-menu, .notion-emoji-menu, .notion-slash-menu")).filter((e) => isVisible(e) && !e.closest("[data-brickwire-host]"));
  }

  private pickersBefore = new Set<HTMLElement>();

  protected async doSendMessage(text: string): Promise<boolean> {
    this.pickersBefore = new Set(this.openPickers());
    return super.doSendMessage(text);
  }

  /** Close a picker that our text opened, right before the click / Enter. */
  protected beforeSubmit(): void {
    const c = this.getComposer();
    const fresh = this.openPickers().filter((p) => !this.pickersBefore.has(p));
    if (c && fresh.length) {
      this.trace(`closed ${fresh.length} inline menu(s) opened by the text`);
      pressEscape(c);
    }
  }

  diagnose(): SiteReport {
    const r = super.diagnose();
    const c = this.getComposer();
    const lines = [...r.lines];
    if (c) {
      const box = this.composerBox(c);
      const br = box.getBoundingClientRect();
      lines.push(`· composer locked: ${this.locked === c ? "yes" : "no"} · box ${Math.round(br.width)}×${Math.round(br.height)} · route ${location.pathname.slice(0, 30)}`);
      const btns = this.nearComposerButtons();
      lines.push(`· buttons in the composer box: ${btns.length}`);
      for (const b of btns.slice(0, 12)) {
        const rr = b.getBoundingClientRect();
        const lab = this.btnText(b).replace(/\s+/g, " ").trim().slice(0, 40);
        lines.push(`   - ${b.tagName.toLowerCase()} "${lab}" svg[${this.svgInfo(b).replace(/\s+/g, " ").trim().slice(0, 40)}] @${Math.round(rr.left - br.left)},${Math.round(rr.top - br.top)}${isDisabled(b) ? " disabled" : ""}${this.isStopButton(b) ? " STOP" : ""}`);
      }
    } else {
      lines.push(`· editors outside pages: ${this.candidates().length}`);
      for (const e of this.candidates().slice(0, 6)) lines.push(`   - <${e.tagName.toLowerCase()}> "${this.label(e).replace(/\s+/g, " ").trim().slice(0, 50)}"`);
    }
    const pk = this.openPickers().length;
    if (pk) lines.push(`· open menus/pickers: ${pk}`);
    return { lines, ok: r.ok };
  }
}

/** Grok / Mistral / Perplexity / Copilot / Poe — generic composer + marker reader (no stable reply hooks). */
export class GrokAdapter extends GenericDomAdapter {
  constructor() {
    super(info("grok"), {
      composer: ["textarea[aria-label*='Ask' i]", "div.ProseMirror[contenteditable='true']", "textarea"],
      send: ["button[type='submit']", "button[aria-label*='Submit' i]", "button[aria-label*='Send' i]"],
      stop: ["button[aria-label*='Stop' i]"],
      assistant: [".message-bubble", "[class*='response-content']"],
      markers: "primary",
    });
  }
}
export class MistralAdapter extends GenericDomAdapter {
  constructor() {
    super(info("mistral"), {
      composer: ["textarea[name='message.text']", "div.ProseMirror[contenteditable='true']", "textarea"],
      send: ["button[type='submit']", "button[aria-label*='Send' i]"],
      stop: ["button[aria-label*='Stop' i]"],
      assistant: ["[data-message-author-role='assistant']"],
      markers: "primary",
    });
  }
}
export class PerplexityAdapter extends GenericDomAdapter {
  constructor() {
    super(info("perplexity"), {
      composer: ["textarea#ask-input", "#ask-input[contenteditable='true']", "div[contenteditable='true'][role='textbox']", "textarea"],
      send: ["button[aria-label='Submit']", "button[data-testid='submit-button']", "button[aria-label*='Submit' i]"],
      stop: ["button[aria-label*='Stop' i]"],
      assistant: [".prose"],
      markers: "primary",
    });
  }
}
export class CopilotAdapter extends GenericDomAdapter {
  constructor() {
    super(info("copilot"), {
      composer: ["textarea#userInput", "textarea[data-testid='composer-input']", "textarea"],
      send: ["button[data-testid='submit-button']", "button[aria-label*='Submit' i]", "button[aria-label*='Send' i]"],
      stop: ["button[data-testid='stop-button']", "button[aria-label*='Stop' i]"],
      assistant: ["[data-content='ai-message']"],
      markers: "primary",
    });
  }
}
export class PoeAdapter extends GenericDomAdapter {
  constructor() {
    super(info("poe"), {
      composer: ["textarea[class*='GrowingTextArea']", "textarea"],
      send: ["button[data-button-send='true']", "button[aria-label*='Send' i]", "button[class*='sendButton']"],
      stop: ["button[aria-label*='Stop' i]", "button[class*='stopButton']"],
      assistant: ["[class*='Message_botMessageBubble']"],
      markers: "primary",
    });
  }
}

/** User-added site (options page): generic semantic adapter, replies via markers. */
export interface CustomSiteConfig {
  host: string;
  name?: string;
  composer?: string;
  send?: string;
  stop?: string;
}
export function createCustomAdapter(site: CustomSiteConfig): ProviderAdapter {
  const split = (s?: string) => (s ?? "").split(/\s*\|\|\s*|\n/).map((x) => x.trim()).filter(Boolean);
  const pi: ProviderInfo = {
    id: "custom",
    name: site.name || site.host,
    hosts: [site.host],
    url: "https://" + site.host + "/",
    status: "experimental",
    enabledByDefault: true,
    maxMessageChars: 30000,
    notes: "Custom site added in Options.",
  };
  return new GenericDomAdapter(pi, { composer: split(site.composer), send: split(site.send), stop: split(site.stop), assistant: [], markers: "primary" });
}

export function createAdapter(hostname: string): ProviderAdapter | null {
  const h = hostname.toLowerCase();
  const match = (id: string) => info(id).hosts.some((x) => h === x || h.endsWith("." + x));
  if (match("chatgpt")) return new ChatGPTAdapter();
  if (match("deepseek")) return new DeepSeekAdapter();
  if (match("claude")) return new ClaudeAdapter();
  if (match("gemini")) return new GeminiAdapter();
  if (match("qwen")) return new QwenAdapter();
  if (match("kimi")) return new KimiAdapter();
  if (match("glm")) return new GLMAdapter();
  if (match("arena")) return new ArenaAdapter();
  if (match("notion")) return new NotionAdapter();
  if (match("grok")) return new GrokAdapter();
  if (match("mistral")) return new MistralAdapter();
  if (match("perplexity")) return new PerplexityAdapter();
  if (match("copilot")) return new CopilotAdapter();
  if (match("poe")) return new PoeAdapter();
  return null;
}
