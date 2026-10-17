/* Mock AI chat page runtime — TEST ONLY. Renders a provider-like DOM and a scripted "model". */
(function () {
  const P = window.MOCK_PROVIDER;
  const LAZY = !!window.MOCK_LAZY;
  const $ = (s) => document.querySelector(s);
  const T = {
    chatgpt: {
      composer: '<form data-type="unified-composer" class="composer"><div id="prompt-textarea" class="ProseMirror" contenteditable="true"></div><button type="button" data-testid="send-button" id="send">↑</button></form>',
      user: (t) => `<div data-message-author-role="user"><div class="whitespace-pre-wrap"></div></div>`,
      asst: () => '<div data-message-author-role="assistant"><div class="markdown"></div></div>',
      stop: '<button data-testid="stop-button" aria-label="Stop streaming">■</button>',
      code: (c) => `<pre><div class="code-header">rbx<button>Copy code</button></div><code class="language-rbx">${esc(c)}</code></pre>`,
    },
    deepseek: {
      composer: '<div class="ds-input"><textarea id="chat-input" placeholder="Message DeepSeek"></textarea><div role="button" class="_7436101 sendbtn" aria-disabled="false">➤</div></div>',
      asst: () => '<div class="ds-message"><div class="ds-think-content"><div class="ds-markdown think"></div></div><div class="ds-markdown answer"></div></div>',
      stop: '<div role="button" aria-label="Stop generating" class="stopbtn">■</div>',
      enterOnly: true,
    },
    claude: {
      composer: '<fieldset><div class="ProseMirror" contenteditable="true"></div><button aria-label="Send message" id="send">↑</button></fieldset>',
      asst: () => '<div data-is-streaming="true"><div class="font-claude-response"></div></div>',
      stop: '<button aria-label="Stop response">■</button>',
      streamingAttr: true,
    },
    gemini: {
      composer: '<input-area-v2><rich-textarea><div class="ql-editor" contenteditable="true" role="textbox"></div></rich-textarea><button class="send-button" aria-label="Send message" id="send">➤</button></input-area-v2>',
      asst: () => '<model-response><message-content><div class="markdown"></div></message-content></model-response>',
      stop: '<button aria-label="Stop response" class="stop">■</button>',
    },
    qwen: {
      composer: '<div class="input-wrap"><textarea id="chat-input" placeholder="How can I help you today?"></textarea><button id="send-message-button">↑</button></div>',
      asst: () => '<div class="chat-response-message"><div class="response-message-content"></div></div>',
      stop: '<button class="stop-button" aria-label="Stop">■</button>',
    },
    kimi: {
      composer: '<div class="chat-input"><div class="chat-input-editor" contenteditable="true" data-lexical-editor="true" role="textbox"></div><div class="send-button" id="send">➤</div></div>',
      asst: () => '<div class="segment segment-assistant"><div class="markdown"></div></div>',
      stop: '<div class="send-button-stop stop-button" aria-label="Stop">■</div>',
    },
    glm: {
      composer: '<form class="ow"><textarea id="chat-input" placeholder="Send a Message"></textarea><button id="send-message-button" type="button">↑</button></form>',
      asst: () => '<div class="chat-assistant"><div class="markdown-prose"></div></div>',
      stop: '<button aria-label="Stop" class="stopx">■</button>',
    },
    arena: {
      composer: '<form id="f"><textarea name="message" placeholder="Ask anything…"></textarea><button type="submit">↑</button></form>',
      asst: () => '<div data-role="assistant"><div class="prose"></div></div>',
      stop: '<button aria-label="Stop generating">■</button>',
    },
    // Notion replica: a page editor (decoy, also contenteditable) + the AI chat with no stable hooks
    notion: {
      decoy: '<div class="notion-topbar"><div contenteditable="true" placeholder="Search">x</div></div><div class="notion-page-content"><div data-block-id="b1" class="notion-text-block"><div contenteditable="true" placeholder="Press space for AI, / for commands">Game spec: castle with 4 towers</div></div></div>',
      composer: '<div class="sc-k1 a8f"><div contenteditable="true" role="textbox" data-placeholder="Ask AI anything…" class="x9q"></div><div role="button" tabindex="0" class="r0u" id="send"><svg class="arrowUpSmall" viewBox="0 0 20 20"><path d="M10 3l6 6"/></svg></div><div role="button" tabindex="0" aria-label="Upload file" class="r0v"><svg class="uploadSmall" viewBox="0 0 20 20"><path d="M10 3l6 6"/></svg></div></div>',
      asst: () => '<div class="q7z"><div class="m2"></div></div>',
      body: ".m2",
      stop: '<div role="button" aria-label="Stop generating">■</div>',
    },
    grok: {
      composer: '<form><textarea aria-label="Ask Grok anything"></textarea><button type="submit" aria-label="Submit">↑</button></form>',
      asst: () => '<div class="message-bubble"><div class="resp"></div></div>',
      body: ".resp",
      stop: '<button aria-label="Stop model response">■</button>',
    },
    mistral: {
      composer: '<form><textarea name="message.text" placeholder="Ask Le Chat"></textarea><button type="submit" aria-label="Send question">↑</button></form>',
      asst: () => '<div class="x1"><div class="x2"></div></div>',
      body: ".x2",
      stop: '<button aria-label="Stop">■</button>',
    },
    perplexity: {
      composer: '<div class="pw"><textarea id="ask-input" placeholder="Ask anything…"></textarea><button aria-label="Submit" id="send">→</button></div>',
      asst: () => '<div class="ans"><div class="prose"></div></div>',
      stop: '<button aria-label="Stop">■</button>',
    },
    copilot: {
      composer: '<div class="cw"><textarea id="userInput" placeholder="Message Copilot"></textarea><button data-testid="submit-button" aria-label="Submit message" id="send">↑</button></div>',
      asst: () => '<div data-content="ai-message"><div class="t"></div></div>',
      body: ".t",
      stop: '<button data-testid="stop-button" aria-label="Stop responding">■</button>',
    },
    poe: {
      composer: '<div class="ChatMessageInputContainer"><textarea class="GrowingTextArea_textArea__x" placeholder="Talk to Assistant"></textarea><button data-button-send="true" aria-label="Send message" id="send">↑</button></div>',
      asst: () => '<div class="Message_botMessageBubble__x"><div class="Markdown_md"></div></div>',
      body: ".Markdown_md",
      stop: '<button aria-label="Stop message">■</button>',
    },
  }[P];
  function esc(s) {
    return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  }
  document.body.innerHTML = `<div id="app" style="display:flex;flex-direction:column;height:100vh;font-family:sans-serif">${T.decoy || ""}<div id="thread" style="flex:1;overflow:auto;padding:16px"></div><div id="bottom" style="padding:12px;max-width:780px;margin:0 auto;width:100%">${T.composer}</div><div id="stopslot"></div></div>`;
  const composer = $("#bottom textarea, #bottom [contenteditable='true']");
  const getText = () => (composer.tagName === "TEXTAREA" ? composer.value : composer.innerText);
  const clear = () => (composer.tagName === "TEXTAREA" ? (composer.value = "") : (composer.innerHTML = ""));
  window.__mock = { sent: [], replies: [], generating: false, dropNext: 0, dropped: [] };

  function onSubmit() {
    const text = getText();
    if (!text.trim() || window.__mock.generating) return;
    clear();
    if (window.__mock.dropNext > 0) {
      // flaky site: the message box clears but the message is silently lost
      window.__mock.dropNext--;
      window.__mock.dropped.push(text);
      return;
    }
    const u = document.createElement("div");
    u.setAttribute("data-message-author-role", "user");
    u.className = "user-msg segment-user chat-user";
    u.textContent = text;
    $("#thread").appendChild(u);
    window.__mock.sent.push(text);
    respond(brain(text));
  }
  const sendBtn = $("#bottom #send, #bottom #send-message-button, #bottom [role='button'], #bottom button[type='submit']");
  if (!T.enterOnly && sendBtn) sendBtn.addEventListener("click", (e) => (e.preventDefault(), onSubmit()));
  const form = $("#bottom form");
  if (form) form.addEventListener("submit", (e) => (e.preventDefault(), onSubmit()));
  // pasted / dropped files show up as attachment chips next to the composer (like real AI sites)
  window.__mock.files = window.__mock.files || [];
  const addFiles = (list) => { for (const f of list) { window.__mock.files.push({ name: f.name, type: f.type, size: f.size }); const chip = document.createElement("div"); chip.className = "attachment-chip"; chip.textContent = f.name; composer.parentElement.insertBefore(chip, composer); } };
  composer.addEventListener("paste", (e) => { const fs = Array.from(e.clipboardData?.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } });
  composer.addEventListener("drop", (e) => { const fs = Array.from(e.dataTransfer?.files || []); if (fs.length) { e.preventDefault(); addFiles(fs); } });
  composer.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  });

  function respond(parts) {
    window.__mock.generating = true;
    const wrap = document.createElement("div");
    wrap.innerHTML = T.asst();
    const node = wrap.firstElementChild;
    $("#thread").appendChild(node);
    const body = (T.body && node.querySelector(T.body)) || node.querySelector(".ds-markdown.answer, .font-claude-response, .markdown, .response-message-content, .markdown-prose, .prose") || node;
    if (P === "deepseek") node.querySelector(".think").textContent = 'Thinking… maybe <ROBLOX_TOOL_CALL>{"id":"think1","tool":"delete_instance","args":{"path":"game.Workspace.Baseplate"}}</ROBLOX_TOOL_CALL>';
    $("#stopslot").innerHTML = T.stop;
    // stream: render progressively
    const html = parts.map((p) => (p.code !== undefined ? (T.code ? T.code(p.code) : `<pre><code>${esc(p.code)}</code></pre>`) : `<p>${esc(p.text)}</p>`)).join("");
    const steps = 6;
    let i = 0;
    const iv = setInterval(() => {
      i++;
      if (i < steps) {
        // partial: plain text prefix of the final content (simulates streaming, incl. unfinished JSON)
        const full = parts.map((p) => (p.code !== undefined ? p.code : p.text)).join("\n");
        body.textContent = full.slice(0, Math.floor((full.length * i) / steps));
        return;
      }
      clearInterval(iv);
      body.innerHTML = html;
      if (T.streamingAttr) node.setAttribute("data-is-streaming", "false");
      $("#stopslot").innerHTML = "";
      window.__mock.generating = false;
      window.__mock.replies.push(body.innerText);
    }, 60);
  }

  // ---------------- scripted model ----------------
  const st = { scenario: null, step: 0, n: 0, lazyDone: false };
  const call = (tool, args) => ({ code: "<ROBLOX_TOOL_CALL>\n" + JSON.stringify({ id: "m" + ++st.n, tool, args }, null, 1) + "\n</ROBLOX_TOOL_CALL>" });
  const say = (text) => ({ text });
  function results(msg) {
    const out = [];
    const re = /<ROBLOX_TOOL_RESULT>\s*(\{[\s\S]*?\})\s*<\/ROBLOX_TOOL_RESULT>/g;
    let m;
    while ((m = re.exec(msg))) {
      try {
        out.push(JSON.parse(m[1]));
      } catch {}
    }
    return out;
  }
  function pickScenario(t) {
    if (/Inspect the current Roblox project/i.test(t)) return "inspect";
    if (/Create a Part named AgentTestPart/i.test(t)) return "create";
    if (/Delete AgentTestPart/i.test(t)) return "delete";
    if (/Write the coin script as a file/i.test(t)) return "rawfile";
    if (/Download the test file from (\S+)/i.test(t)) { st.url = /Download the test file from (\S+)/i.exec(t)[1]; return "files"; }
    return null;
  }
  function brain(msg) {
    if (/^\[(Roblox Agent|Brickwire Roblox Agent) — session/.test(msg)) {
      const task = msg.split("User task:\n")[1];
      if (!task) return [say("Connected."), { code: '<ROBLOX_AGENT_STATUS>{"stage":"ANALYZE","task":"ready","note":"connected"}</ROBLOX_AGENT_STATUS>' }];
      msg = task;
    }
    if (msg.startsWith("[Roblox Agent] Reminder")) {
      return next(null);
    }
    if (msg.startsWith("[Roblox Agent] You reported done")) {
      return [call("inspect_instance", { path: "game.Workspace.AgentTestPart" })];
    }
    const sc = pickScenario(msg);
    if (sc) {
      st.scenario = sc;
      st.step = 0;
      if (LAZY && !st.lazyDone) {
        st.lazyDone = true;
        return [say("Sure! I will take a look at your project now.")]; // no tool call → reminder expected
      }
      return next(null);
    }
    const rs = results(msg);
    if (rs.length) return next(rs);
    return [say("I am not sure what to do.")];
  }
  function next(rs) {
    const r = rs && rs[0];
    if (st.scenario === "inspect") {
      if (!r) return [{ code: '<ROBLOX_AGENT_STATUS>{"stage":"ANALYZE","task":"Inspect Workspace","note":"reading tree"}</ROBLOX_AGENT_STATUS>' }, call("get_game_tree", { path: "game.Workspace", depth: 1 })];
      const names = (r.result?.tree?.children || []).map((c) => `${c.name} (${c.class})`);
      st.scenario = null;
      return [say("Workspace contains: " + names.join(", ")), { code: "<ROBLOX_AGENT_DONE>" + JSON.stringify({ summary: "Listed " + names.length + " Workspace objects from live data" }) + "</ROBLOX_AGENT_DONE>" }];
    }
    if (st.scenario === "create") {
      st.step++;
      if (st.step === 1) return [call("search_game_tree", { path: "game.Workspace", keywords: "AgentTestPart" })];
      if (st.step === 2) {
        if (Array.isArray(r?.result) && r.result.length) return [say("Already exists."), { code: '<ROBLOX_AGENT_DONE>{"summary":"exists"}</ROBLOX_AGENT_DONE>' }];
        return [{ code: '<ROBLOX_AGENT_STATUS>{"stage":"EXECUTE","task":"Create AgentTestPart"}</ROBLOX_AGENT_STATUS>' }, call("create_part", { name: "AgentTestPart", size: [4, 1, 2], position: [0, 5, 0], color: [0, 170, 255] })];
      }
      if (st.step === 3) {
        if (r?.status !== "success") return [{ code: '<ROBLOX_AGENT_ERROR>{"message":"create failed"}</ROBLOX_AGENT_ERROR>' }];
        return [say("Created AgentTestPart!"), { code: '<ROBLOX_AGENT_DONE>{"summary":"created"}</ROBLOX_AGENT_DONE>' }]; // claims done without verify
      }
      // after the unverified reminder → inspect_instance result arrives here
      st.scenario = null;
      return [say(`Verified: ${r?.result?.path} is a ${r?.result?.className}.`), { code: '<ROBLOX_AGENT_DONE>{"summary":"AgentTestPart created and verified"}</ROBLOX_AGENT_DONE>' }];
    }
    if (st.scenario === "rawfile") {
      st.step++;
      if (st.step === 1) return [say("Writing the whole file:"), { code: '<ROBLOX_FILE name="Coins.server.lua" to="game.ServerScriptService">\nlocal coins = {gold = "a\\"b"}\nprint("coins", coins.gold)\n</ROBLOX_FILE>' }];
      st.scenario = null;
      const placed = r?.result?.studio?.created?.[0];
      return [say("File placed: " + placed + " status " + r?.status), { code: '<ROBLOX_AGENT_DONE>{"summary":"file placed ' + placed + '"}</ROBLOX_AGENT_DONE>' }];
    }
    if (st.scenario === "files") {
      st.step++;
      if (st.step === 1) return [call("file_fetch", { url: st.url })];
      if (st.step === 2) { if (r?.status !== "success") return [{ code: '<ROBLOX_AGENT_ERROR>{"message":"fetch ' + r?.status + ' ' + (r?.error || "") + '"}</ROBLOX_AGENT_ERROR>' }]; st.fileId = r.result.fileId; return [call("file_show", { fileIds: [r.result.fileId] })]; }
      st.scenario = null;
      const seen = (window.__mock.files || []).map((f) => f.name);
      return [say("I can see the file: " + seen.join(", ") + " id " + st.fileId), { code: '<ROBLOX_AGENT_DONE>{"summary":"downloaded and viewed ' + seen.join(", ") + '"}</ROBLOX_AGENT_DONE>' }];
    }
    if (st.scenario === "delete") {
      st.step++;
      if (st.step === 1) return [call("delete_instance", { path: "game.Workspace.AgentTestPart" })];
      if (st.step === 2) {
        if (r?.status !== "success") return [{ code: '<ROBLOX_AGENT_ERROR>{"message":"delete ' + r?.status + '"}</ROBLOX_AGENT_ERROR>' }];
        return [call("search_game_tree", { path: "game.Workspace", keywords: "AgentTestPart" })];
      }
      st.scenario = null;
      const gone = Array.isArray(r?.result) && r.result.length === 0;
      return [say(gone ? "Verified: AgentTestPart no longer exists." : "Still exists!"), { code: "<ROBLOX_AGENT_DONE>" + JSON.stringify({ summary: gone ? "deleted and verified" : "NOT deleted" }) + "</ROBLOX_AGENT_DONE>" }];
    }
    return [say("Waiting for a task.")];
  }
})();
