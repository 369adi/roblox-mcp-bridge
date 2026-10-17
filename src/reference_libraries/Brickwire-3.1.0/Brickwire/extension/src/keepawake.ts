/**
 * Brickwire keep-awake (runs in the page's MAIN world at document_start).
 * Makes the chat site believe the tab is visible and focused, so it keeps streaming / loading replies
 * while you are in another tab or window. Turn off per site: localStorage "bw-awake" = "off"
 * (the content script mirrors it into <html data-bw-awake>).
 */
(() => {
  const root = document.documentElement;
  // Notion: off unless explicitly enabled (localStorage "bw-awake" = "on"). Swallowing visibilitychange/blur kept
  // Notion from re-syncing after the tab was hidden / the PC slept → its chat refused to send on a stale connection.
  const optIn = /(^|\.)notion\.(so|com)$/i.test(location.hostname);
  const stored = (): string | null => {
    try { return localStorage.getItem("bw-awake"); } catch { return null; }
  };
  const on = () => {
    const attr = root.getAttribute("data-bw-awake");
    if (optIn) return stored() === "on" && attr !== "off";
    return attr !== "off";
  };
  const D = Document.prototype as unknown as Record<string, unknown>;
  const desc = (n: string) => Object.getOwnPropertyDescriptor(Document.prototype, n);
  const vis = desc("visibilityState");
  const hid = desc("hidden");
  const realHidden = (): boolean => {
    try { return !!hid?.get?.call(document); } catch { return false; }
  };
  const define = (name: string, awake: unknown, real?: PropertyDescriptor) => {
    try {
      Object.defineProperty(Document.prototype, name, {
        configurable: true,
        get() { return on() ? awake : real?.get?.call(this); },
      });
    } catch { /* locked by the site */ }
  };
  define("visibilityState", "visible", vis);
  define("hidden", false, hid);
  define("webkitVisibilityState", "visible", desc("webkitVisibilityState") ?? vis);
  define("webkitHidden", false, desc("webkitHidden") ?? hid);
  try {
    const hasFocus = Document.prototype.hasFocus;
    D.hasFocus = function (this: Document) { return on() ? true : hasFocus.call(this); };
  } catch { /* ignore */ }
  const block = (e: Event) => { if (on()) e.stopImmediatePropagation(); };
  for (const t of ["visibilitychange", "webkitvisibilitychange", "freeze"]) {
    window.addEventListener(t, block, true);
    document.addEventListener(t, block, true);
  }
  window.addEventListener("blur", (e) => { if (on() && e.target === window) e.stopImmediatePropagation(); }, true);
  // Hidden tabs get no animation frames; sites that render the stream in rAF would stall. Fall back to timers.
  const raf = window.requestAnimationFrame.bind(window);
  const caf = window.cancelAnimationFrame.bind(window);
  // Timer ids handed out in place of rAF ids. rAF ids and setTimeout ids are separate counters with overlapping
  // values: the old `clearTimeout(id)` for EVERY cancelAnimationFrame killed unrelated site timers.
  const timerIds = new Set<number>();
  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    if (!(on() && realHidden())) return raf(cb);
    const id = setTimeout(() => { timerIds.delete(id); cb(performance.now()); }, 16) as unknown as number;
    timerIds.add(id);
    return id;
  };
  window.cancelAnimationFrame = (id: number) => {
    if (timerIds.delete(id)) clearTimeout(id);
    else caf(id);
  };
  root.setAttribute("data-bw-awake-installed", "1");
})();
