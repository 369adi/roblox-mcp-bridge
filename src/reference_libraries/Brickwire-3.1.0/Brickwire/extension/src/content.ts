import { createAdapter, createCustomAdapter } from "./adapters/providers.js";
import { composerText } from "./adapters/dom.js";
import { AgentCore } from "./core/agent-core.js";
import { startPluginLink } from "./core/plugin-link.js";
import { clockAlive, startClock } from "./core/clock.js";
import { BridgeClient } from "./core/bridge-client.js";
import { loadSettings, prefsFor, saveProviderPrefs, saveSettings } from "./core/settings.js";
import { AgentPanel } from "./ui/panel.js";
import type { RuntimeResponse, TabAgentState } from "../../shared/src/protocol.js";
import type { CommunityData } from "../../shared/src/library/community.js";
import type { PackLite } from "../../shared/src/library/tasks.js";

/** Content script entry: pick the provider adapter, mount the panel, keep it mounted across SPA re-renders. */
(async function main() {
  if ((window as unknown as { __brickwire?: boolean }).__brickwire) return;
  (window as unknown as { __brickwire?: boolean }).__brickwire = true;
  const settings = await loadSettings();
  const host = location.hostname.toLowerCase();
  const custom = settings.customSites.find((c) => host === c.host || host.endsWith("." + c.host));
  const adapter = createAdapter(host) ?? (custom ? createCustomAdapter(custom) : null);
  if (!adapter) return;
  if (adapter.info.id !== "custom" && settings.providers[adapter.info.id] === false) return; // disabled in Options

  startClock(); // background-tab-proof timers (the chat tab is hidden while the user works in Studio)
  const bridge = new BridgeClient();
  let core: AgentCore;
  const report = () => {
    const state: TabAgentState = {
      provider: adapter.info.id,
      providerName: adapter.info.name,
      active: core.active,
      stage: core.stage,
      task: core.task,
      sessionId: core.sessionId,
      url: location.href,
    };
    try {
      chrome.runtime.sendMessage({ type: "tabState", state }, () => void chrome.runtime.lastError);
    } catch {
      /* extension reloaded */
    }
  };
  const panel = new AgentPanel(
    adapter.info.name,
    {
      start: () => void core.start(),
      stop: () => void core.stop(),
      pause: () => core.pause(),
      approve: (id, ok) => void core.approve(id, ok),
      approveAll: (id) => void core.approveAll(id),
      setCategory: (c) => {
        void saveProviderPrefs(adapter.info.id, { category: c });
        void core.setCategory(c);
      },
      setMode: (m) => {
        void saveProviderPrefs(adapter.info.id, { mode: m });
        void core.setMode(m);
      },
      switchProvider: (url) => chrome.runtime.sendMessage({ type: "openUrl", url }),
      openBridge: () => chrome.runtime.sendMessage({ type: "openDashboard" }),
      openPaint: () => openPaint(),
      toggleCompact: () => { try { return setCompact(localStorage.getItem("bw-compact") === "off"); } catch { return localStorage.getItem("bw-compact") !== "off"; } },
      // called from the panel constructor, before the compact-chat block runs: must not touch later `let`s (TDZ)
      compactState: () => localStorage.getItem("bw-compact") !== "off",
      openSettings: () => chrome.runtime.sendMessage({ type: "openOptions" }),
      toggleCollapsed: (c) => void saveSettings({ panelCollapsed: c }),
      toggleFloating: (f) => {
        void saveSettings({ panelFloating: f });
        if (adapter.info.preferFloatingPanel) localStorage.setItem("bw-docked", f ? "off" : "on");
        userFloating = f;
        ensureMounted();
      },
      setSuperMode: (on) => {
        void saveProviderPrefs(adapter.info.id, { superMode: on });
        void core.setSuperMode(on);
      },
      setNotionLog: (on) => {
        void saveProviderPrefs(adapter.info.id, { notionLog: on });
        void core.setNotionLog(on);
        if (on) panel.notify("Dev Log is on: after each step Notion AI also edits a page — turns get slower, Brickwire waits longer for it.", "info");
      },
      useResource: (text) => void core.submitTask(text),
      fillComposer: (text) => core.fillComposer(text),
      loadPreviews: async () => {
        const r = await fetch(chrome.runtime.getURL("library/previews.json"));
        return (await r.json()) as Record<string, string>;
      },
      loadPacks: async () => {
        const r = await fetch(chrome.runtime.getURL("library/packs.json"));
        return (await r.json()) as PackLite[];
      },
      resourceUrl: (p) => chrome.runtime.getURL(p),
      loadCommunity: async () => {
        try {
          const c = await chrome.storage.local.get("communityCache");
          if (c?.communityCache?.items?.length) return c.communityCache as CommunityData;
        } catch {
          /* fall back to the bundled file */
        }
        const r = await fetch(chrome.runtime.getURL("library/community.json"));
        return (await r.json()) as CommunityData;
      },
      refreshCommunity: async () => {
        const r: RuntimeResponse<CommunityData> = await chrome.runtime.sendMessage({ type: "communityRefresh" });
        if (!r?.ok || !r.data?.items?.length) throw new Error(r?.error ?? "no data");
        try {
          await chrome.storage.local.set({ communityCache: r.data });
        } catch {
          /* quota — keep it in memory only */
        }
        return r.data;
      },
      thumb: async (url) => {
        const r: RuntimeResponse<string> = await chrome.runtime.sendMessage({ type: "thumb", url, size: 192 });
        if (!r?.ok || typeof r.data !== "string") throw new Error(r?.error ?? "no thumbnail");
        return r.data;
      },
      siteCheck: () => {
        const r = adapter.diagnose();
        const lines = [`Site check — ${adapter.info.name} (${location.hostname}${location.pathname.slice(0, 40)})`, ...r.lines];
        lines.push(`${clockAlive() ? "✓" : "✕"} background timer: ${clockAlive() ? "alive (works in hidden tabs)" : "not connected — reload the tab"}`);
        lines.push(`· tab ${document.hidden ? "hidden" : "visible"} · agent ${core.active ? "active" : "idle"} · stage ${core.stage}`);
        lines.push(r.ok ? "Result: OK" : "Result: problems found — send this text + a screenshot to the developer");
        try {
          void navigator.clipboard?.writeText(lines.join("\n")).catch(() => undefined);
        } catch {
          /* no clipboard */
        }
        return lines;
      },
    },
    settings.panelCollapsed,
    adapter.info.id,
    prefsFor(settings, adapter.info.id),
  );
  core = new AgentCore(adapter, bridge, panel, settings, report);
  startPluginLink(core, adapter); // Roblox Studio plugin requests → this chat
  if (adapter.info.status === "experimental") panel.notify(`${adapter.info.name} support is experimental: ${adapter.info.notes}`, "warn");

  // mount + self-heal (SPAs replace the composer on navigation)
  let mountedOnce = false;
  const startOnce = () => {
    if (mountedOnce) return;
    mountedOnce = true;
    core.startMonitoring();
    // page reload mid-session: restore the running agent for this chat
    void core.tryResume().then((ok) => ok && report());
  };
  const bootAt = Date.now();
  // Notion: the panel floats by default — inserted into the site's React tree it made Notion re-render the composer
  const preferFloat = !!adapter.info.preferFloatingPanel && localStorage.getItem("bw-docked") !== "on";
  let userFloating = settings.panelFloating || preferFloat;
  let autoFloated = false;
  const ensureMounted = () => {
    if (panel.floating && autoFloated && !userFloating && adapter.getComposer()) {
      autoFloated = false; // message box showed up: dock again
      panel.setFloating(false);
    }
    if (panel.floating) {
      if (panel.host.parentElement !== document.body) document.body.appendChild(panel.host);
      if (adapter.getComposer()) startOnce();
      return;
    }
    if (!mountedOnce && !autoFloated && Date.now() - bootAt > 10000 && !adapter.getComposer()) {
      // the message box was not recognised: show the panel floating so Site check is reachable
      autoFloated = true;
      panel.setFloating(true);
      panel.notify(`${adapter.info.name}: message box not found yet. Open a chat, then press Site check if this stays.`, "warn");
      return ensureMounted();
    }
    if (panel.host.isConnected && adapter.getComposer()) {
      // still placed before the current composer?
      const c = adapter.getComposer()!;
      if (panel.host.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) return;
    }
    if (adapter.injectAgentUI(panel.host)) startOnce();
  };
  if (settings.panelFloating || preferFloat) panel.setFloating(true);
  ensureMounted();
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      ensureMounted();
    });
  }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(ensureMounted, 2000);

  /** Put an image (+ text) into THIS chat: attach -> send; text fallback if the site rejects the file. */
  const deliverToChat = async (png: string | null | undefined, rawText: string | undefined, name?: string): Promise<{ mode: "image" | "text" | "none"; provider: string; error?: string }> => {
    let mode: "image" | "text" | "none" = "none";
    let error: string | undefined;
    if (!adapter.getComposer()) return { mode, provider: adapter.info.id, error: "message box not found on this page" };
    if (png && adapter.attachImage) {
      const bin = Uint8Array.from(atob(png.replace(/^data:[^,]*,/, "")), (ch) => ch.charCodeAt(0));
      const file = new File([bin], name || "brickwire-paint.png", { type: "image/png" });
      if (await adapter.attachImage(file)) mode = "image";
      else error = "this site did not accept the image \u2014 sent as text";
    }
    const text = rawText?.trim() || (mode === "image" ? "\u{1F3A8} (image from Brickwire Paint)" : "");
    if (text) {
      const ok = await adapter.sendMessage(mode === "image" || !png ? text : `${text}\n[image could not be attached]`);
      if (ok && mode === "none") mode = "text";
      if (!ok) { error = error ?? "send failed"; if (mode !== "image") mode = "none"; }
    } else if (mode === "none") error = error ?? "nothing to send";
    return { mode, provider: adapter.info.id, error };
  };

  // Paint inside the chat page (extension frame). "Send to chat" goes straight into this chat \u2014 no bridge, no local site.
  let paintHost: HTMLDivElement | null = null;
  let paintFrame: HTMLIFrameElement | null = null;
  const closePaint = () => { paintHost?.remove(); paintHost = null; paintFrame = null; };
  const openPaint = () => {
    if (paintHost) { paintHost.style.display = "block"; return; }
    paintHost = document.createElement("div");
    paintHost.setAttribute("data-brickwire-host", "paint");
    paintHost.style.cssText = "position:fixed;inset:4vh 4vw;z-index:2147483646;background:#0e0f12;border:1px solid #2c3039;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6);overflow:hidden";
    paintFrame = document.createElement("iframe");
    paintFrame.src = chrome.runtime.getURL("paint.html") + "?embed=1";
    paintFrame.style.cssText = "width:100%;height:100%;border:0;display:block";
    paintFrame.allow = "clipboard-write";
    paintHost.appendChild(paintFrame);
    document.documentElement.appendChild(paintHost);
  };
  addEventListener("message", (ev: MessageEvent) => {
    if (!paintFrame || ev.source !== paintFrame.contentWindow) return;
    const d = ev.data as { type?: string; id?: string; png?: string | null; text?: string };
    if (d?.type === "brickwire:paint:close") return closePaint();
    if (d?.type === "brickwire:paint:hide") { if (paintHost) paintHost.style.display = "none"; return; }
    if (d?.type !== "brickwire:paint:send") return;
    const target = paintFrame.contentWindow;
    if (paintHost) paintHost.style.display = "none"; // the composer must be reachable while we attach
    void (async () => {
      let r: { mode: string; provider: string; error?: string };
      try { r = await deliverToChat(d.png, d.text); } catch (e) { r = { mode: "none", provider: adapter.info.id, error: (e as Error).message }; }
      panel.notify(r.mode === "image" ? "Brickwire: picture attached and sent" : r.mode === "text" ? `Brickwire: sent as text (${r.error ?? "fallback"})` : `Brickwire: could not send (${r.error})`, r.mode === "none" ? "error" : r.mode === "text" ? "warn" : "info");
      target?.postMessage({ type: "brickwire:paint:result", id: d.id, ...r }, "*");
      if (r.mode === "none" && paintHost) paintHost.style.display = "block";
    })();
  });

  // ---------- Compact chat: tool calls / results / instructions collapse into chips like "⚙ generate_mesh · 12 с" ----------
  // Visual only: nothing is removed from the page, so the reply reader still sees the full text.
  let compactOn = localStorage.getItem("bw-compact") !== "off";
  const compactCss = document.createElement("style");
  compactCss.setAttribute("data-brickwire", "compact");
  compactCss.textContent = `
[data-bw-label]:not([data-bw-open]){max-height:28px!important;min-height:0!important;overflow:hidden!important;font-size:0!important;line-height:0!important;color:transparent!important;padding:0!important;margin:4px 0!important;border:0!important;background:none!important;box-shadow:none!important;cursor:pointer!important}
[data-bw-label]:not([data-bw-open]) *{font-size:0!important;line-height:0!important;color:transparent!important;border-color:transparent!important;background:none!important;box-shadow:none!important}
[data-bw-label]:not([data-bw-open])::before{content:attr(data-bw-label);display:inline-block;font:500 12px/20px system-ui,-apple-system,Segoe UI,sans-serif;color:#b9bfd0;background:#1b1d23;border:1px solid #2c3039;border-radius:999px;padding:2px 10px;white-space:nowrap}
[data-bw-hide]:not([data-bw-open]){max-height:0!important;min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;font-size:0!important}
[data-bw-open]{outline:1px dashed #3a3f4b;outline-offset:2px}`;
  const applyCompactCss = () => { if (compactOn) { if (!compactCss.isConnected) document.head.appendChild(compactCss); } else compactCss.remove(); };
  type Chip = { first: number; done?: number; kind: "call" | "result" | "prompt" | "service" };
  const chips = new WeakMap<Element, Chip>();
  const chipEls = new Set<Element>();
  const isOurs = (el: Element) => !!el.closest("[data-brickwire-host],textarea,[contenteditable='true'],[contenteditable=''],input");
  const holdsUi = (el: Element) => !!el.querySelector("textarea,[contenteditable='true'],[contenteditable=''],input,[data-brickwire-host]") || !!el.closest("[data-brickwire-host]");
  const blockOf = (start: Element): Element => {
    let el = start;
    const pre = el.closest("pre");
    if (pre) {
      el = pre;
      const len = (pre.textContent ?? "").length;
      while (el.parentElement && el.parentElement !== document.body && (el.parentElement.textContent ?? "").length < len + 60) el = el.parentElement;
      return el;
    }
    const t = (el.textContent ?? "").trim();
    while (el.parentElement && el.parentElement !== document.body && (el.parentElement.textContent ?? "").trim() === t) el = el.parentElement;
    return el;
  };
  const toolsIn = (text: string) => Array.from(new Set(Array.from(text.matchAll(/"(?:tool|name)"\s*:\s*"([\w.\-]+)"/g), (m) => m[1]))).slice(0, 4);
  const secs = (ms: number) => (ms < 60000 ? `${Math.round(ms / 1000)} с` : `${Math.floor(ms / 60000)} мин ${Math.round((ms % 60000) / 1000)} с`);
  const labelFor = (el: Element, c: Chip): string => {
    const text = el.textContent ?? "";
    if (c.kind === "result") {
      const n = (text.match(/"status"\s*:/g) ?? []).length || 1;
      const bad = /"status"\s*:\s*"(error|failed|denied)"/.test(text);
      return `${bad ? "⚠" : "↩"} результаты отправлены модели (${n})`;
    }
    if (c.kind === "prompt") return "📋 задача + инструкции Brickwire";
    if (c.kind === "service") return "↪ служебное сообщение Brickwire";
    const tools = toolsIn(text);
    const name = tools.length ? tools.join(", ") : "готовит команду…";
    return c.done ? `✓ ${name} · ${secs(c.done - c.first)}` : `⚙ ${name} · ${secs(Date.now() - c.first)}`;
  };
  const markRange = (first: Element) => {
    // a tool call written as plain paragraphs: collapse following siblings up to the closing tag
    if (!/ROBLOX_TOOL_CALL/.test(first.textContent ?? "") || /\/ROBLOX_TOOL_CALL/.test(first.textContent ?? "")) return;
    let n = first.nextElementSibling;
    for (let i = 0; n && i < 60; i++, n = n.nextElementSibling) {
      if (holdsUi(n)) break; // never hide the message box / panel (a call without a closing tag hid everything below)
      n.setAttribute("data-bw-hide", "");
      if (/\/ROBLOX_TOOL_CALL/.test(n.textContent ?? "")) break;
    }
  };
  const scanCompact = () => {
    if (!compactOn || !document.body) return;
    applyCompactCss();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (/ROBLOX_TOOL_(CALL|RESULT)|\[bw[:\-]/.test(n.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const found: Element[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement;
      if (!p || isOurs(p) || p.closest("[data-bw-label]")) continue;
      const blk = blockOf(p);
      // a block that climbed up to the message box (empty composer has no text) would hide it and eat its clicks
      if (holdsUi(blk)) continue;
      found.push(blk);
    }
    for (const el of found) {
      if (chips.has(el) || el.closest("[data-bw-label]") !== null && !chips.has(el)) { if (chips.has(el)) continue; }
      const text = el.textContent ?? "";
      const kind: Chip["kind"] = /ROBLOX_TOOL_RESULT/.test(text) && /\[bw[:\-]/.test(text) ? "result" : /ROBLOX_TOOL_CALL/.test(text) && !/\[bw[:\-]/.test(text) ? "call" : text.length > 1500 ? "prompt" : "service";
      const c: Chip = { first: Date.now(), kind };
      chips.set(el, c);
      chipEls.add(el);
      el.setAttribute("data-bw-label", labelFor(el, c));
      if (kind === "call") markRange(el);
    }
    refreshChips();
  };
  const refreshChips = () => {
    const all = Array.from(chipEls).filter((e) => e.isConnected);
    for (const el of Array.from(chipEls)) if (!el.isConnected) chipEls.delete(el);
    for (const el of all) {
      const c = chips.get(el);
      if (!c) continue;
      if (c.kind === "call" && !c.done) {
        // finished when a results message from us appears later in the chat
        const later = all.some((o) => o !== el && chips.get(o)?.kind === "result" && !!(el.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (later) c.done = Date.now();
        if (c.kind === "call") markRange(el);
      }
      const l = labelFor(el, c);
      if (el.getAttribute("data-bw-label") !== l) el.setAttribute("data-bw-label", l);
    }
  };
  const setCompact = (on: boolean): boolean => {
    compactOn = on;
    localStorage.setItem("bw-compact", on ? "on" : "off");
    applyCompactCss();
    if (on) scanCompact();
    return on;
  };
  // click a chip = show its content; double-click shown content = collapse again
  document.addEventListener("click", (e) => {
    // only real user clicks: programmatic clicks (our own send button click) must reach the site
    if (!e.isTrusted) return;
    const t = (e.target as Element | null)?.closest?.("[data-bw-label]:not([data-bw-open])");
    if (!t || !compactOn) return;
    if ((e.target as Element).closest("button,[role='button'],a,input,textarea,[contenteditable='true']")) return;
    e.preventDefault();
    e.stopPropagation();
    t.setAttribute("data-bw-open", "");
    let n = t.nextElementSibling;
    while (n && n.hasAttribute("data-bw-hide")) { n.setAttribute("data-bw-open", ""); n = n.nextElementSibling; }
  }, true);
  document.addEventListener("dblclick", (e) => {
    const t = (e.target as Element | null)?.closest?.("[data-bw-label][data-bw-open]");
    if (!t) return;
    t.removeAttribute("data-bw-open");
    let n = t.nextElementSibling;
    while (n && n.hasAttribute("data-bw-hide")) { n.removeAttribute("data-bw-open"); n = n.nextElementSibling; }
  }, true);
  let compactQueued = false;
  new MutationObserver(() => {
    if (compactQueued || !compactOn) return;
    compactQueued = true;
    setTimeout(() => { compactQueued = false; scanCompact(); }, 400);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(() => compactOn && refreshChips(), 1000);
  scanCompact();

  // ---------- Keep-awake: the site thinks the tab is visible (MAIN-world script) + keep-alive audio against timer throttling ----------
  // Notion: keep-awake is opt-in ("bw-awake" = "on"), see keepawake.ts
  const awakeOn = () => (adapter.info.id === "notion" ? localStorage.getItem("bw-awake") === "on" : localStorage.getItem("bw-awake") !== "off");
  document.documentElement.setAttribute("data-bw-awake", awakeOn() ? "on" : "off");
  let keepAlive: AudioContext | null = null;
  const coreActive = () => !!(core as unknown as { active?: boolean } | undefined)?.active;
  setInterval(() => {
    const want = awakeOn() && coreActive();
    if (want && !keepAlive && (navigator as unknown as { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 20; // below hearing; keeps Chrome from freezing timers in a background tab
        gain.gain.value = 0.0006;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        keepAlive = ctx;
      } catch { keepAlive = null; }
    } else if (!want && keepAlive) {
      void keepAlive.close();
      keepAlive = null;
    }
    // Auto-resume: a cut-off reply shows "Continue generating" — press it while the agent runs.
    if (adapter.info.autoContinue !== false && coreActive() && Date.now() - lastContinueClick > 20000) {
      // only the explicit "continue generating" wording: a bare "Continue" is usually a dialog / upgrade / onboarding button
      const btn = Array.from(document.querySelectorAll("button")).find((b) => !isOurs(b) && b.offsetParent !== null && !b.closest("[role='dialog'],[aria-modal='true']") && /^(continue generating|продолжить генерацию)$/i.test((b.textContent ?? "").trim()));
      if (btn) { lastContinueClick = Date.now(); btn.click(); panel.notify("Brickwire: reply was cut off — pressed Continue", "info"); }
    }
  }, 2000);
  let lastContinueClick = 0;

  // M5/M6: chat outbox (bridge pages). Only the visible tab with a composer takes items.
  let outboxBusy = false;
  const pollOutbox = async () => {
    if (outboxBusy || document.visibilityState !== "visible" || !adapter.getComposer()) return;
    outboxBusy = true;
    try {
      const r = (await chrome.runtime.sendMessage({ type: "bridge", method: "GET", path: "/api/outbox/next" })) as RuntimeResponse<{ item: { id: string; kind: string; text: string; png?: string; name?: string } | null }>;
      const it = r?.ok ? r.data?.item : null;
      if (!it) return;
      const { mode, error } = await deliverToChat(it.png, it.text, it.name);
      panel.notify(mode === "image" ? "Brickwire: image attached to the chat" : mode === "text" ? "Brickwire: sent as text (fallback)" : `Brickwire: could not send (${error})`, mode === "none" ? "error" : mode === "text" ? "warn" : "info");
      await chrome.runtime.sendMessage({ type: "bridge", method: "POST", path: `/api/outbox/${encodeURIComponent(it.id)}/result`, body: { mode, provider: adapter.info.id, error } });
    } catch {
      /* bridge offline — try later */
    } finally {
      outboxBusy = false;
    }
  };
  setInterval(() => void pollOutbox(), 2000);

  chrome.runtime.onMessage.addListener((msg: { type: string }, _s: unknown, reply: (r: unknown) => void) => {
    if (msg?.type === "agent:stop") void core.stop().then(() => reply({ ok: true }));
    else if (msg?.type === "agent:state") {
      report();
      reply({ ok: true, active: core.active, stage: core.stage, provider: adapter.info.name });
    } else return false;
    return true;
  });
  // Messages the USER sends themselves carry no delivery marker: note them as reply boundaries.
  const userSubmit = (e: Event) => {
    if (!e.isTrusted) return; // our own sends dispatch synthetic events
    const c = adapter.getComposer();
    if (!c) return;
    const t = e.target as Node | null;
    if (e.type === "keydown") {
      const k = e as KeyboardEvent;
      if (k.key !== "Enter" || k.shiftKey || k.isComposing || !t || !c.contains(t)) return;
    } else {
      const btn = (t as HTMLElement | null)?.closest?.("button,[role='button']");
      if (!btn || btn.closest("[data-brickwire-host]")) return;
      let scope: HTMLElement | null = c;
      for (let i = 0; i < 5 && scope?.parentElement; i++) scope = scope.parentElement;
      if (!scope?.contains(btn)) return;
    }
    const text = composerText(c);
    if (text.trim()) adapter.noteUserMessage(text);
    // M1: "/bw rules" → the full instructions follow the user's message
    if (core.active && AgentCore.isResendCommand(text)) setTimeout(() => void core.resendInstructions("user"), 4000);
  };
  document.addEventListener("keydown", userSubmit, true);
  document.addEventListener("click", userSubmit, true);
  report();
})();
