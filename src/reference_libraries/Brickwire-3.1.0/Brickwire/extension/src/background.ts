import { COMMUNITY_API, COMMUNITY_HOSTS, communityData } from "../../shared/src/library/community.js";
import { decideRecovery, type RecoveryLedger } from "./core/tab-recovery.js";
import { DEFAULT_BRIDGE_PORT, type RuntimeRequest, type RuntimeResponse, type TabAgentState } from "../../shared/src/protocol.js";

/**
 * MV3 service worker: the only component that talks to the local bridge
 * (host_permissions for 127.0.0.1 avoid page CORS/CSP/Private-Network restrictions).
 * Stateless by design — calls are long-polled in ≤25s chunks so worker suspension cannot lose work.
 */

const tabStates = new Map<number, TabAgentState>();

async function port(): Promise<number> {
  try {
    const r = await chrome.storage.local.get("settings");
    return Number(r?.settings?.bridgePort) || DEFAULT_BRIDGE_PORT;
  } catch {
    return DEFAULT_BRIDGE_PORT;
  }
}

async function bridgeFetch(method: string, path: string, body?: unknown): Promise<RuntimeResponse> {
  if (!path.startsWith("/api/")) return { ok: false, error: "invalid path" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(`http://127.0.0.1:${await port()}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, error: res.ok ? undefined : (data as { error?: string })?.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, offline: true, error: "Bridge offline (" + ((e as Error).name === "AbortError" ? "timeout" : (e as Error).message) + ")" };
  } finally {
    clearTimeout(timer);
  }
}

function setBadge(tabId: number, s: TabAgentState) {
  try {
    chrome.action.setBadgeText({ tabId, text: s.active ? "ON" : "" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f8cff" });
  } catch {
    /* ignore */
  }
}

chrome.runtime.onMessage.addListener((msg: RuntimeRequest, sender: { tab?: { id?: number } }, reply: (r: RuntimeResponse) => void) => {
  switch (msg?.type) {
    case "bridge":
      void bridgeFetch(msg.method, msg.path, msg.body).then(reply);
      return true;
    case "openDashboard":
      void port().then((p) => chrome.tabs.create({ url: `http://127.0.0.1:${p}/` }));
      reply({ ok: true });
      return false;
    case "openUrl": {
      const url = String(msg.url ?? "");
      if (/^https:\/\//.test(url)) chrome.tabs.create({ url });
      reply({ ok: true });
      return false;
    }
    case "openOptions":
      chrome.runtime.openOptionsPage();
      reply({ ok: true });
      return false;
    case "tabState":
      if (sender.tab?.id !== undefined) {
        tabStates.set(sender.tab.id, { ...msg.state, updatedAt: Date.now() });
        setBadge(sender.tab.id, msg.state);
      }
      reply({ ok: true });
      return false;
    case "customSitesChanged":
      void syncCustomSites().then(() => reply({ ok: true }));
      return true;
    case "thumb":
      void thumb(String(msg.url ?? ""), Number(msg.size) || 192).then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: (e as Error).message }));
      return true;
    case "communityRefresh":
      void fetchWithTimeout(COMMUNITY_API, 20000)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((raw) => reply({ ok: true, data: communityData(raw) }), (e) => reply({ ok: false, error: (e as Error).message }));
      return true;
    case "getTabStates":
      reply({ ok: true, data: Object.fromEntries(tabStates) });
      return false;
  }
  return false;
});

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
  } finally {
    clearTimeout(t);
  }
}

/** Community thumbnails: fetched here (page CSP cannot block it), downscaled, returned as a small data URL. LRU-cached. */
const thumbs = new Map<string, string>();
async function thumb(url: string, size: number): Promise<string> {
  let host = "";
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") throw new Error("https only");
    host = u.hostname;
  } catch {
    throw new Error("bad image url");
  }
  if (!COMMUNITY_HOSTS.some((h) => host === h || host.endsWith("." + h))) throw new Error("host not allowed: " + host);
  const key = `${size}|${url}`;
  const hit = thumbs.get(key);
  if (hit) {
    thumbs.delete(key);
    thumbs.set(key, hit);
    return hit;
  }
  const res = await fetchWithTimeout(url, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  if (blob.size > 25 * 1024 * 1024) throw new Error("image too large");
  let out: Blob = blob;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    out = await c.convertToBlob({ type: "image/webp", quality: 0.82 });
  } catch {
    if (blob.size > 400 * 1024) throw new Error("cannot decode image");
  }
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const data = `data:${out.type || "image/png"};base64,${btoa(bin)}`;
  thumbs.set(key, data);
  if (thumbs.size > 400) thumbs.delete(thumbs.keys().next().value as string);
  return data;
}

/** User-added chat sites: register the content script for the hosts the user granted. */
async function syncCustomSites() {
  try {
    const r = await chrome.storage.local.get("settings");
    const sites: { host: string }[] = Array.isArray(r?.settings?.customSites) ? r.settings.customSites : [];
    const matches: string[] = [];
    for (const s of sites) {
      const origin = `https://${s.host}/*`;
      const ok: boolean = await new Promise((res) => chrome.permissions.contains({ origins: [origin] }, (g: boolean) => res(!!g)));
      if (ok) matches.push(origin);
    }
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ["bw-custom", "bw-custom-awake"] }).catch(() => chrome.scripting.unregisterContentScripts({ ids: ["bw-custom"] }));
    } catch {
      /* not registered yet */
    }
    if (matches.length) await chrome.scripting.registerContentScripts([
      { id: "bw-custom", matches, js: ["content.js"], runAt: "document_idle", persistAcrossSessions: true },
      { id: "bw-custom-awake", matches, js: ["keepawake.js"], runAt: "document_start", world: "MAIN", persistAcrossSessions: true } as never,
    ]);
  } catch (e) {
    console.warn("[brickwire] custom sites", e);
  }
}
chrome.runtime.onInstalled?.addListener(() => void syncCustomSites());
chrome.runtime.onStartup?.addListener(() => void syncCustomSites());
chrome.permissions?.onRemoved?.addListener(() => void syncCustomSites());

// M2-A: a chat tab closed/discarded during an active session is reopened minimized; the content script
// restores the run from persist.ts (finished calls are never re-run, pending results are re-sent).
const recoveryLedger: RecoveryLedger = {};
chrome.tabs.onRemoved.addListener((tabId: number, info?: { isWindowClosing?: boolean }) => {
  const state = tabStates.get(tabId);
  tabStates.delete(tabId);
  const d = decideRecovery(state, { isWindowClosing: info?.isWindowClosing }, recoveryLedger, Date.now());
  if (!d.recover) return;
  try {
    chrome.windows.create({ url: d.url, state: "minimized", focused: false });
  } catch {
    chrome.tabs.create({ url: d.url, active: false });
  }
});
// A discarded tab (memory saver) keeps its id but loses the page: reload it so the agent restores itself.
chrome.tabs.onUpdated?.addListener((tabId: number, change: { discarded?: boolean }) => {
  if (change.discarded && tabStates.get(tabId)?.active) chrome.tabs.reload(tabId);
});

// Background-tab-proof clock for content scripts (see extension/src/core/clock.ts):
// hidden tabs get their timers throttled to once a minute, extension messages are not.
chrome.runtime.onConnect.addListener((p: any) => {
  if (p?.name !== "bw-clock") return;
  const t = setInterval(() => {
    try {
      p.postMessage(0);
    } catch {
      clearInterval(t);
    }
  }, 250);
  p.onDisconnect.addListener(() => clearInterval(t));
});
