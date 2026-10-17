"use strict";
(() => {
  // shared/src/library/community.ts
  var COMMUNITY_API = "https://ui-resources.com/api/resources";
  var COMMUNITY_HOSTS = ["ui-resources.com", "uiassets.commissiontoolz.xyz"];
  var clean = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
  var https = (s) => /^https:\/\/[^\s"'<>]+$/.test(clean(s)) ? clean(s) : "";
  function compactCommunity(raw) {
    const list = Array.isArray(raw) ? raw : raw?.resources;
    if (!Array.isArray(list)) throw new Error("unexpected ui-resources.com API response");
    const out = [];
    for (const r of list) {
      if (!r || typeof r !== "object") continue;
      const img = https(r.image), page = https(r.website_url);
      if (!img && !page) continue;
      const desc = clean(r.description);
      const by = /^by\s+(.+)$/i.exec(desc)?.[1] ?? "";
      out.push({
        id: `ur${clean(r.id)}`,
        t: clean(r.title).slice(0, 80) || "Untitled",
        a: by.slice(0, 40),
        d: by ? "" : desc.slice(0, 160),
        c: clean(r.category) || "Other",
        g: (Array.isArray(r.tags) ? r.tags : []).map(clean).filter((x) => x && x !== "Undefined").join(", ").slice(0, 80),
        i: img,
        dl: https(r.download_url),
        w: page,
        s: "ui-resources.com"
      });
    }
    return out;
  }
  var X = (id, t, c, d, w, g) => ({ id: `x_${id}`, t, a: "", d, c, g, i: "", dl: "", w, s: new URL(w).hostname.replace(/^www\./, "") });
  var CURATED = [
    X("gameuidb", "Game UI Database", "References", "Thousands of screenshots of real game UI, filterable by screen type (inventory, shop, HUD\u2026) \u2014 the best place for UI references.", "https://www.gameuidatabase.com/", "ui reference hud menu inventory"),
    X("interfaceingame", "Interface In Game", "References", "Video/screenshot library of game interfaces and UI animations.", "https://interfaceingame.com/", "ui reference animation"),
    X("mobbin", "Mobbin", "References", "Library of real mobile app screens and flows (clean, modern layouts).", "https://mobbin.com/", "ui reference mobile"),
    X("dribbble_gameui", "Dribbble \u2014 Game UI", "References", "Concept shots of game interfaces (stylised, simulator, RPG).", "https://dribbble.com/search/game-ui", "ui reference concept"),
    X("behance_gameui", "Behance \u2014 Game UI", "References", "Full UI case studies from game artists.", "https://www.behance.net/search/projects/game%20ui", "ui reference case study"),
    X("pinterest_robloxui", "Pinterest \u2014 Roblox UI", "References", "Mood boards of Roblox simulator/cartoon UI.", "https://www.pinterest.com/search/pins/?q=roblox%20ui", "ui reference roblox"),
    X("kenney", "Kenney assets (CC0)", "Free assets", "Huge CC0 packs: UI packs, icons, game sprites, sounds \u2014 free for commercial use.", "https://kenney.nl/assets", "ui icons sounds cc0"),
    X("gameicons", "game-icons.net (CC BY 3.0)", "Free assets", "4000+ game icons as SVG/PNG, any colour; credit the authors.", "https://game-icons.net/", "icons svg"),
    X("lucide", "Lucide icons (ISC)", "Free assets", "Clean outline UI icons (settings, close, shop\u2026) as SVG/PNG.", "https://lucide.dev/icons/", "icons outline"),
    X("creatorstore", "Roblox Creator Store", "Free assets", "Official Roblox store: free images/decals, meshes, audio, plugins (check the creator before using models).", "https://create.roblox.com/store", "roblox decals audio models"),
    X("polyhaven", "Poly Haven (CC0)", "Free assets", "CC0 textures and HDRIs \u2014 good for SurfaceAppearance / MaterialVariant textures.", "https://polyhaven.com/textures", "textures pbr cc0"),
    X("lospec", "Lospec palettes", "Colour", "Curated colour palettes (pixel/retro styles and more).", "https://lospec.com/palette-list", "palette colour"),
    X("coolors", "Coolors", "Colour", "Palette generator \u2014 lock colours, export hex codes for BW.style / palette=.", "https://coolors.co/", "palette colour generator"),
    X("realtimecolors", "Realtime Colors", "Colour", "Preview a palette on a real layout; checks contrast.", "https://www.realtimecolors.com/", "palette contrast"),
    X("easings", "easings.net", "Motion", "Visual cheat sheet of easing curves (match them to Enum.EasingStyle).", "https://easings.net/", "tween easing animation"),
    X("googlefonts", "Google Fonts", "Fonts", "Try pairings of fonts that also exist in Roblox (Fredoka One, Luckiest Guy, Bangers, Oswald, Montserrat\u2026).", "https://fonts.google.com/", "fonts typography"),
    X("freesound", "Freesound", "Sounds", "Free sound effects (check each licence); upload via the Asset Manager.", "https://freesound.org/", "sounds sfx"),
    X("devforum_ui", "DevForum \u2014 UI design", "Tutorials", "Community guides on Roblox UI design, scaling and tweening.", "https://devforum.roblox.com/tag/ui", "tutorial ui roblox"),
    X("roblox_ui_docs", "Roblox docs \u2014 UI", "Tutorials", "Official docs: layouts, constraints, UIGradient, UIStroke, safe areas.", "https://create.roblox.com/docs/ui", "docs ui"),
    X("roblox_vfx_docs", "Roblox docs \u2014 Particle emitters", "Tutorials", "Official docs for ParticleEmitter, Beam, Trail and flipbooks.", "https://create.roblox.com/docs/effects/particle-emitters", "docs vfx particles"),
    X("roblox_camera_docs", "Roblox docs \u2014 Camera", "Tutorials", "Official camera scripting docs (Scriptable camera, CFrame.lookAt, FieldOfView).", "https://create.roblox.com/docs/workspace/camera", "docs camera cutscene")
  ];
  function communityData(raw, fetchedAt = (/* @__PURE__ */ new Date()).toISOString()) {
    const items = [...compactCommunity(raw), ...CURATED];
    return { source: COMMUNITY_API, fetchedAt, lastUpdated: raw?.lastUpdated ?? null, count: items.length, items };
  }

  // extension/src/core/tab-recovery.ts
  var RECOVERY_COOLDOWN_MS = 6e4;
  var MAX_RECOVERIES_PER_SESSION = 3;
  function decideRecovery(state, info, ledger, now) {
    if (!state) return { recover: false, reason: "tab had no agent" };
    if (!state.active) return { recover: false, reason: "agent not active" };
    if (!state.sessionId) return { recover: false, reason: "no session" };
    if (info.browserShuttingDown) return { recover: false, reason: "browser shutting down" };
    const url = state.url ?? "";
    if (!/^https:\/\//.test(url)) return { recover: false, reason: "no https chat url" };
    const past = (ledger[state.sessionId] ?? []).filter((t) => now - t < 24 * 36e5);
    if (past.length >= MAX_RECOVERIES_PER_SESSION) return { recover: false, reason: `already recovered ${past.length}\xD7 for this session` };
    const last = past[past.length - 1];
    if (last !== void 0 && now - last < RECOVERY_COOLDOWN_MS) return { recover: false, reason: "recovered less than 60 s ago" };
    ledger[state.sessionId] = [...past, now];
    return { recover: true, url, sessionId: state.sessionId };
  }

  // shared/src/protocol.ts
  var DEFAULT_BRIDGE_PORT = 47821;

  // extension/src/background.ts
  var tabStates = /* @__PURE__ */ new Map();
  async function port() {
    try {
      const r = await chrome.storage.local.get("settings");
      return Number(r?.settings?.bridgePort) || DEFAULT_BRIDGE_PORT;
    } catch {
      return DEFAULT_BRIDGE_PORT;
    }
  }
  async function bridgeFetch(method, path, body) {
    if (!path.startsWith("/api/")) return { ok: false, error: "invalid path" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3e4);
    try {
      const res = await fetch(`http://127.0.0.1:${await port()}${path}`, {
        method,
        headers: body !== void 0 ? { "Content-Type": "application/json" } : void 0,
        body: body !== void 0 ? JSON.stringify(body) : void 0,
        signal: ctrl.signal,
        cache: "no-store"
      });
      const data = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, data, error: res.ok ? void 0 : data?.error ?? `HTTP ${res.status}` };
    } catch (e) {
      return { ok: false, offline: true, error: "Bridge offline (" + (e.name === "AbortError" ? "timeout" : e.message) + ")" };
    } finally {
      clearTimeout(timer);
    }
  }
  function setBadge(tabId, s) {
    try {
      chrome.action.setBadgeText({ tabId, text: s.active ? "ON" : "" });
      chrome.action.setBadgeBackgroundColor({ tabId, color: "#4f8cff" });
    } catch {
    }
  }
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
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
        if (sender.tab?.id !== void 0) {
          tabStates.set(sender.tab.id, { ...msg.state, updatedAt: Date.now() });
          setBadge(sender.tab.id, msg.state);
        }
        reply({ ok: true });
        return false;
      case "customSitesChanged":
        void syncCustomSites().then(() => reply({ ok: true }));
        return true;
      case "thumb":
        void thumb(String(msg.url ?? ""), Number(msg.size) || 192).then((data) => reply({ ok: true, data }), (e) => reply({ ok: false, error: e.message }));
        return true;
      case "communityRefresh":
        void fetchWithTimeout(COMMUNITY_API, 2e4).then((r) => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))).then((raw) => reply({ ok: true, data: communityData(raw) }), (e) => reply({ ok: false, error: e.message }));
        return true;
      case "getTabStates":
        reply({ ok: true, data: Object.fromEntries(tabStates) });
        return false;
    }
    return false;
  });
  async function fetchWithTimeout(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    } finally {
      clearTimeout(t);
    }
  }
  var thumbs = /* @__PURE__ */ new Map();
  async function thumb(url, size) {
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
    const res = await fetchWithTimeout(url, 15e3);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (blob.size > 25 * 1024 * 1024) throw new Error("image too large");
    let out = blob;
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
      const c = new OffscreenCanvas(w, h);
      c.getContext("2d").drawImage(bmp, 0, 0, w, h);
      bmp.close?.();
      out = await c.convertToBlob({ type: "image/webp", quality: 0.82 });
    } catch {
      if (blob.size > 400 * 1024) throw new Error("cannot decode image");
    }
    const buf = new Uint8Array(await out.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768));
    const data = `data:${out.type || "image/png"};base64,${btoa(bin)}`;
    thumbs.set(key, data);
    if (thumbs.size > 400) thumbs.delete(thumbs.keys().next().value);
    return data;
  }
  async function syncCustomSites() {
    try {
      const r = await chrome.storage.local.get("settings");
      const sites = Array.isArray(r?.settings?.customSites) ? r.settings.customSites : [];
      const matches = [];
      for (const s of sites) {
        const origin = `https://${s.host}/*`;
        const ok = await new Promise((res) => chrome.permissions.contains({ origins: [origin] }, (g) => res(!!g)));
        if (ok) matches.push(origin);
      }
      try {
        await chrome.scripting.unregisterContentScripts({ ids: ["bw-custom", "bw-custom-awake"] }).catch(() => chrome.scripting.unregisterContentScripts({ ids: ["bw-custom"] }));
      } catch {
      }
      if (matches.length) await chrome.scripting.registerContentScripts([
        { id: "bw-custom", matches, js: ["content.js"], runAt: "document_idle", persistAcrossSessions: true },
        { id: "bw-custom-awake", matches, js: ["keepawake.js"], runAt: "document_start", world: "MAIN", persistAcrossSessions: true }
      ]);
    } catch (e) {
      console.warn("[brickwire] custom sites", e);
    }
  }
  chrome.runtime.onInstalled?.addListener(() => void syncCustomSites());
  chrome.runtime.onStartup?.addListener(() => void syncCustomSites());
  chrome.permissions?.onRemoved?.addListener(() => void syncCustomSites());
  var recoveryLedger = {};
  chrome.tabs.onRemoved.addListener((tabId, info) => {
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
  chrome.tabs.onUpdated?.addListener((tabId, change) => {
    if (change.discarded && tabStates.get(tabId)?.active) chrome.tabs.reload(tabId);
  });
  chrome.runtime.onConnect.addListener((p) => {
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
})();
