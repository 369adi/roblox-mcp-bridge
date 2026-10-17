"use strict";
(() => {
  // shared/src/providers.ts
  var PROVIDERS = [
    {
      id: "chatgpt",
      name: "ChatGPT",
      hosts: ["chatgpt.com", "chat.openai.com"],
      url: "https://chatgpt.com/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. ProseMirror composer (#prompt-textarea); messages carry data-message-author-role."
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      hosts: ["chat.deepseek.com"],
      url: "https://chat.deepseek.com/",
      status: "beta",
      enabledByDefault: true,
      maxMessageChars: 6e4,
      notes: "Primary provider. Dedicated adapter: textarea composer, shared Send/Stop button handled, DeepThink reasoning excluded. Verified against a realistic replica; needs confirmation on the live site."
    },
    {
      id: "claude",
      name: "Claude",
      hosts: ["claude.ai"],
      url: "https://claude.ai/new",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 4e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. ProseMirror composer; streaming flag data-is-streaming. Tool calls inside Artifacts are not read \u2014 they must be in chat text."
    },
    {
      id: "gemini",
      name: "Gemini",
      hosts: ["gemini.google.com"],
      url: "https://gemini.google.com/app",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. Quill composer inside <rich-textarea>. Gemini can drift away from tool use in long sessions; reminders handle it."
    },
    {
      id: "qwen",
      name: "Qwen",
      hosts: ["chat.qwen.ai"],
      url: "https://chat.qwen.ai/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. Textarea composer (#chat-input)."
    },
    {
      id: "kimi",
      name: "Kimi",
      hosts: ["www.kimi.com", "kimi.com", "www.kimi.ai", "kimi.ai"],
      url: "https://www.kimi.ai/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. Contenteditable composer. Kimi may prefer its native tools; reminders push it back to RBX_TOOL_CALL."
    },
    {
      id: "glm",
      name: "GLM (Z.ai)",
      hosts: ["chat.z.ai"],
      url: "https://chat.z.ai/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. Open-WebUI style textarea (#chat-input)."
    },
    {
      id: "arena",
      name: "Arena",
      hosts: ["lmarena.ai", "arena.ai", "www.arena.ai"],
      url: "https://lmarena.ai/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 2e4,
      notes: "Generic adapter, not verified against the live site yet \u2014 use DeepSeek first. Only Direct (single-model) chat. Battle / side-by-side layouts are detected and Start is blocked."
    },
    {
      id: "notion",
      name: "Notion AI",
      hosts: ["www.notion.so", "notion.so", "app.notion.com"],
      url: "https://www.notion.so/chat",
      status: "beta",
      enabledByDefault: true,
      // 40 000 was never verified on the live site; long messages also get collapsed in Notion's chat
      maxMessageChars: 18e3,
      // Notion AI often works silently for 10–60 s (search, page edits, Dev Log) — re-sending after 7 s doubled messages
      redeliverAfterMs: 25e3,
      // inserting the panel into Notion's React tree made it re-render the composer (draft lost)
      preferFloatingPanel: true,
      // "Continue" buttons in Notion belong to onboarding / upgrade dialogs, not to a cut-off reply
      autoContinue: false,
      notes: "First-class provider with a dedicated adapter: finds the AI chat box and never the page editor, reads replies via delivery markers (Notion's DOM has no stable hooks), Notion mode in the prompt (specs from pages, optional Dev Log page). Verified against a replica; selectors may need tuning on the live site \u2014 use Site check in the panel."
    },
    {
      id: "grok",
      name: "Grok",
      hosts: ["grok.com"],
      url: "https://grok.com/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter + marker reader. Not verified on the live site."
    },
    {
      id: "mistral",
      name: "Mistral Le Chat",
      hosts: ["chat.mistral.ai"],
      url: "https://chat.mistral.ai/chat",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter + marker reader. Not verified on the live site."
    },
    {
      id: "perplexity",
      name: "Perplexity",
      hosts: ["www.perplexity.ai", "perplexity.ai"],
      url: "https://www.perplexity.ai/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 2e4,
      notes: "Generic adapter + marker reader. Perplexity prefers web search answers; reminders push it back to tool calls. Not verified on the live site."
    },
    {
      id: "copilot",
      name: "Microsoft Copilot",
      hosts: ["copilot.microsoft.com"],
      url: "https://copilot.microsoft.com/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 1e4,
      notes: "Generic adapter + marker reader. Short input limit. Not verified on the live site."
    },
    {
      id: "poe",
      name: "Poe",
      hosts: ["poe.com"],
      url: "https://poe.com/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Generic adapter + marker reader. Not verified on the live site."
    }
  ];

  // shared/src/protocol.ts
  var DEFAULT_BRIDGE_PORT = 47821;

  // extension/src/core/settings.ts
  var DEFAULT_SETTINGS = {
    bridgePort: DEFAULT_BRIDGE_PORT,
    providers: Object.fromEntries(PROVIDERS.map((p) => [p.id, p.enabledByDefault])),
    maxAutoTurns: 40,
    reminderLimit: 2,
    maxCallsPerMessage: 5,
    settleMs: 1500,
    fastEndMs: 250,
    readParallel: 4,
    streamExec: true,
    panelCollapsed: false,
    perProvider: {},
    customSites: [],
    panelFloating: false
  };
  async function loadSettings() {
    try {
      const r = await chrome.storage.local.get("settings");
      const s = r?.settings ?? {};
      return { ...DEFAULT_SETTINGS, ...s, providers: { ...DEFAULT_SETTINGS.providers, ...s.providers ?? {} }, perProvider: { ...s.perProvider ?? {} } };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  async function saveSettings(patch) {
    const cur = await loadSettings();
    const next = { ...cur, ...patch, providers: { ...cur.providers, ...patch.providers ?? {} }, perProvider: { ...cur.perProvider, ...patch.perProvider ?? {} } };
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  // extension/src/options/options.ts
  var $ = (id) => document.getElementById(id);
  var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x ?? { ok: false })));
  async function init() {
    const s = await loadSettings();
    $("port").value = String(s.bridgePort);
    $("turns").value = String(s.maxAutoTurns);
    $("rem").value = String(s.reminderLimit);
    $("calls").value = String(s.maxCallsPerMessage);
    $("provs").innerHTML = PROVIDERS.map(
      (p) => `<label class="prov"><input type="checkbox" data-id="${p.id}" ${s.providers[p.id] ? "checked" : ""}>
      <span><b>${p.name}</b> <span class="tag ${p.status}">${p.status}</span><br><small>${p.hosts.join(", ")}</small><br><small class="mut">${p.notes}</small></span></label>`
    ).join("");
    $("floating").checked = !!s.panelFloating;
    $("customs").innerHTML = s.customSites.length ? s.customSites.map((c, i) => `<div class="cs"><span><b>${esc(c.name || c.host)}</b> <small class="mut">${esc(c.host)}</small></span><button data-del="${i}">Remove</button></div>`).join("") : '<small class="mut">No custom sites.</small>';
    $("customs").querySelectorAll("button[data-del]").forEach(
      (b) => b.onclick = async () => {
        const cur = await loadSettings();
        const customSites = cur.customSites.filter((_, i) => i !== Number(b.dataset.del));
        await chrome.storage.local.set({ settings: { ...cur, customSites } });
        send({ type: "customSitesChanged" });
        $("c_add").onclick = async () => {
          const raw = $("c_host").value.trim().toLowerCase();
          const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
          if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
            $("c_msg").textContent = "Enter a host like chat.example.com";
            return;
          }
          if (PROVIDERS.some((p) => p.hosts.includes(host))) {
            $("c_msg").textContent = "This site is already supported \u2014 enable it above.";
            return;
          }
          const granted = await new Promise((r) => chrome.permissions.request({ origins: [`https://${host}/*`] }, (g) => r(!!g)));
          if (!granted) {
            $("c_msg").textContent = "Permission denied \u2014 the site was not added.";
            return;
          }
          const cur2 = await loadSettings();
          const site = { host, name: $("c_name").value.trim() || void 0, composer: $("c_comp").value.trim() || void 0, send: $("c_send").value.trim() || void 0, stop: $("c_stop").value.trim() || void 0 };
          const customSites2 = [...cur2.customSites.filter((c) => c.host !== host), site];
          await chrome.storage.local.set({ settings: { ...cur2, customSites: customSites2 } });
          await send({ type: "customSitesChanged" });
          $("c_msg").textContent = `Added ${host}. Open/reload it \u2014 the panel appears above the message box.`;
          ["c_host", "c_name", "c_comp", "c_send", "c_stop"].forEach((id) => $(id).value = "");
          void init();
        };
        void init();
      }
    );
    const h = await send({ type: "bridge", method: "GET", path: "/api/health" });
    if (h.ok && h.data) $("mode").value = h.data.settings.mode;
    $("bstate").textContent = h.ok && h.data ? `${h.data.state} \u2014 ${h.data.reason}` : "Bridge offline";
  }
  $("save").onclick = async () => {
    const providers = {};
    document.querySelectorAll("#provs input[type=checkbox]").forEach((c) => providers[c.dataset.id] = c.checked);
    await saveSettings({
      bridgePort: Number($("port").value) || DEFAULT_SETTINGS.bridgePort,
      maxAutoTurns: Number($("turns").value) || DEFAULT_SETTINGS.maxAutoTurns,
      reminderLimit: Number($("rem").value),
      maxCallsPerMessage: Math.min(10, Math.max(1, Number($("calls").value) || 5)),
      providers,
      panelFloating: $("floating").checked
    });
    await send({ type: "bridge", method: "PUT", path: "/api/settings", body: { mode: $("mode").value } });
    $("saved").textContent = "Saved. Reload open AI tabs to apply provider changes.";
    void init();
  };
  void init();
})();
