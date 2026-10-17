/** DOM utilities shared by provider adapters. No provider-specific selectors here. */
import { sleep } from "../core/clock.js";

export function isVisible(el: Element | null | undefined): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement) || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
}

/** First visible match across several selectors (selectors that throw are skipped). */
export function queryFirst(selectors: string[], root: ParentNode = document, visibleOnly = true): HTMLElement | null {
  for (const s of selectors) {
    let list: NodeListOf<Element>;
    try {
      list = root.querySelectorAll(s);
    } catch {
      continue;
    }
    for (const el of Array.from(list)) if (!visibleOnly || isVisible(el)) return el as HTMLElement;
  }
  return null;
}

export function queryAll(selectors: string[], root: ParentNode = document): HTMLElement[] {
  const seen = new Set<Element>();
  for (const s of selectors) {
    try {
      root.querySelectorAll(s).forEach((e) => seen.add(e));
    } catch {
      /* invalid selector on this engine */
    }
  }
  // document order, drop nested duplicates (keep outermost)
  const arr = Array.from(seen).sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  return arr.filter((e) => !arr.some((o) => o !== e && o.contains(e))) as HTMLElement[];
}

/** Semantic fallback: the most plausible chat composer on the page. */
export function findComposerSemantic(exclude?: Element | null): HTMLElement | null {
  const cands = Array.from(
    document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"], .ql-editor[contenteditable="true"]'),
  ).filter((e) => isVisible(e) && !(exclude && exclude.contains(e)) && !e.closest("[data-brickwire-host]"));
  if (!cands.length) return null;
  // prefer elements low on the screen with a "message"-ish placeholder / label
  const score = (e: HTMLElement) => {
    const r = e.getBoundingClientRect();
    const label = (e.getAttribute("placeholder") ?? "") + (e.getAttribute("aria-label") ?? "") + (e.getAttribute("data-placeholder") ?? "");
    return r.bottom / window.innerHeight + (/(message|ask|prompt|chat|send|сообщ|спрос)/i.test(label) ? 1 : 0) + (e.tagName === "TEXTAREA" ? 0.2 : 0);
  };
  return cands.sort((a, b) => score(b) - score(a))[0];
}

const SEND_LABEL = /(send|submit|отправ|发送|送信)/i;

/** Find the send button near the composer. */
export function findSendButton(composer: HTMLElement, selectors: string[]): HTMLElement | null {
  const byConfig = queryFirst(selectors);
  if (byConfig) return byConfig;
  let scope: HTMLElement | null = composer;
  for (let i = 0; i < 6 && scope; i++) {
    scope = scope.parentElement;
    if (!scope) break;
    const btns = Array.from(scope.querySelectorAll<HTMLElement>('button, [role="button"]')).filter(isVisible);
    const hit = btns.find((b) => SEND_LABEL.test((b.getAttribute("aria-label") ?? "") + (b.getAttribute("title") ?? "") + (b.getAttribute("data-testid") ?? "") + (b.id ?? "")));
    if (hit) return hit;
    const submit = btns.find((b) => b.getAttribute("type") === "submit");
    if (submit) return submit;
  }
  return null;
}

export function isDisabled(el: HTMLElement): boolean {
  return (el as HTMLButtonElement).disabled === true || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled");
}

/**
 * Text as a rich editor shows it: markdown shortcuts (**, `, #, >, - …) may be turned into formatting,
 * so compare letters/digits only.
 */
const core = (s: string) => (s ?? "").replace(/[^\p{L}\p{N}]+/gu, "");

/** Put text into a textarea or rich editor in a way frameworks (React, ProseMirror, Lexical, Quill, Notion) observe. */
export async function setComposerText(el: HTMLElement, text: string, opts: { allowRawWrite?: boolean } = {}): Promise<boolean> {
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter ? setter.call(el, text) : (el.value = text);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return el.value === text;
  }
  const want = core(text).length;
  // the editor holds (almost) all of our text, possibly reformatted
  const inserted = () => {
    const have = core(el.innerText).length;
    return want === 0 ? normalize(el.innerText).length > 0 : have >= want * 0.9 && have <= want * 1.1 + 4;
  };
  const selectAll = () => {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel?.removeAllRanges();
    sel?.addRange(range);
  };
  // contenteditable: select all, then insertText (keeps editor state in sync); fallback to synthetic paste.
  selectAll();
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  await tick();
  if (!inserted()) {
    // Only when insertText clearly did not land: pasting on top of text that IS there (just reformatted
    // by the editor) doubled the message on Notion.
    await tick(120); // some editors (Notion) render the model asynchronously
    if (!inserted()) {
      try {
        selectAll();
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
        await tick(150);
      } catch {
        /* ignore */
      }
    }
  }
  if (opts.allowRawWrite !== false && normalize(el.innerText).length < Math.min(20, normalize(text).length)) {
    // last resort (not for editors with their own model — see AdapterConfig.allowRawWrite): plain DOM write + input event
    el.textContent = text;
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    await tick();
  }
  return opts.allowRawWrite === false ? inserted() || normalize(el.innerText).length >= Math.min(20, normalize(text).length) : normalize(el.innerText).length > 0;
}

export function composerText(el: HTMLElement | null): string {
  if (!el) return "";
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText ?? el.textContent ?? "";
}

const normalize = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
/** Waits that keep working in background tabs (see core/clock.ts). */
export const tick = (ms = 30) => sleep(ms);

/** Close inline menus (mention / emoji / slash / link pickers) so the next Enter submits instead of picking an item. */
export function pressEscape(el: HTMLElement) {
  const opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

export function pressEnter(el: HTMLElement) {
  const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
  el.dispatchEvent(new KeyboardEvent("keydown", opts));
  el.dispatchEvent(new KeyboardEvent("keypress", opts));
  el.dispatchEvent(new KeyboardEvent("keyup", opts));
}

const BLOCK = new Set(["P", "DIV", "LI", "UL", "OL", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TR", "TABLE", "SECTION", "ARTICLE", "BR", "HR"]);
const SKIP = /(line-?numbers?|linenumber|hljs-ln-n|copy|toolbar|code-?header|sr-only)/i;

/** Text extraction that keeps code-block newlines and drops UI chrome (copy buttons, line numbers). */
export function extractText(node: Element): string {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += n.nodeValue ?? "";
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement;
    if (el.tagName === "BUTTON" || el.tagName === "SVG" || el.tagName === "STYLE" || el.tagName === "SCRIPT") return;
    if (el.closest("pre") && SKIP.test(el.className?.toString() ?? "")) return;
    if (el.hasAttribute("data-brickwire-host")) return;
    if (el.tagName === "BR") {
      out += "\n";
      return;
    }
    const block = BLOCK.has(el.tagName);
    if (block && out && !out.endsWith("\n")) out += "\n";
    el.childNodes.forEach(walk);
    if (block && !out.endsWith("\n")) out += "\n";
  };
  walk(node);
  return out.replace(/\u00a0/g, " ");
}

export function hashText(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ":" + s.length;
}
