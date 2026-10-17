/* Realistic DeepSeek (chat.deepseek.com) replica — TEST ONLY.
 * Mirrors the DOM/behaviour of the live site that the old adapter got wrong:
 *  - turns are .ds-message; user turns carry a hashed class + .fbb737a4 bubble; replies are .ds-markdown
 *    OUTSIDE .ds-think-content (DeepThink reasoning, which may contain draft tool calls);
 *  - ONE footer button (.ds-button--primary) is both SEND (svg path "M8…") and STOP (path "M2…");
 *    it has no aria-label; clicking it while generating ABORTS the reply;
 *  - during reasoning there is no stop glyph and no spinner — only text growth;
 *  - the reply streams with long pauses (2.6 s, longer than the old settle window), including a pause
 *    in the middle of a tool-call JSON; the markdown subtree is re-rendered (replaced) on every chunk;
 *  - code blocks render with a banner ("json", "Copy", "Download" as div text, not <button>s).
 * The scripted model follows whatever protocol the injected instructions describe.
 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const SEND_D = "M8.3125 0.981587C8.66767 1.0545 8.97902 1.20558 9.2627 1.43374Z";
  const STOP_D = "M2 4.88C2 3.68009 2 3.08013 2.30557 2.65954Z";
  document.body.innerHTML = `<div id="root"><div class="_765a5cd"><div class="dad65929" id="scroll"></div>
  <div class="_77cefa5"><div class="_24fad49"><textarea placeholder="Message DeepSeek" rows="2"></textarea>
  <div class="ec4f5d61"><div class="ds-toggle-button">DeepThink</div><div class="ds-toggle-button">Search</div>
  <div role="button" class="ds-button ds-button--primary ds-button--filled _7436101" aria-disabled="true"><div class="ds-icon"><svg viewBox="0 0 16 16"><path d="${SEND_D}"></path></svg></div></div></div></div></div></div></div>`;
  const ta = $("textarea");
  const btn = $(".ds-button--primary");
  const glyph = (d) => btn.querySelector("path").setAttribute("d", d);
  const M = (window.__mock = { sent: [], replies: [], aborted: 0, generating: false, sendsWhileBusy: 0 });
  let cur = null; // current generation
  // like the real site, the conversation survives a page reload (the real one reloads it from the server)
  const KEY = "__ds_replica";
  const save = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ html: $("#scroll").innerHTML, M: { sent: M.sent, replies: M.replies, aborted: M.aborted, sendsWhileBusy: M.sendsWhileBusy, reloads: M.reloads || 0 }, st }));
    } catch {}
  };

  // React-like controlled textarea: button enabled only when value non-empty (via input events)
  ta.addEventListener("input", () => btn.setAttribute("aria-disabled", ta.value.trim() ? "false" : "true"));
  function submit() {
    if (cur) {
      // the same button is STOP while generating
      M.sendsWhileBusy++;
      abort();
      return;
    }
    const t = ta.value;
    if (!t.trim()) return;
    const proto = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    proto.call(ta, "");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    const u = document.createElement("div");
    u.className = "ds-message _9663006 d29f3d7d";
    u.innerHTML = `<div class="fbb737a4"></div>`;
    u.firstChild.textContent = t;
    $("#scroll").appendChild(u);
    M.sent.push(t);
    st.n = 0; // like real DeepSeek: every reply numbers its calls from c1 again
    generate(brain(t));
  }
  btn.addEventListener("click", () => {
    if (btn.getAttribute("aria-disabled") === "true" && !cur) return;
    submit();
  });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (cur) return; // Enter does nothing while generating
      submit();
    }
  });

  function abort() {
    if (!cur) return;
    clearTimeout(cur.timer);
    M.aborted++;
    cur.node.appendChild(Object.assign(document.createElement("div"), { className: "stopped-tag", textContent: "Stopped" }));
    finish();
  }
  function finish() {
    glyph(SEND_D);
    btn.setAttribute("aria-disabled", ta.value.trim() ? "false" : "true");
    M.generating = false;
    if (cur) M.replies.push(cur.final);
    cur = null;
    save();
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  function render(md) {
    // minimal markdown: ``` fences → DeepSeek code block chrome; other lines → <p>
    const out = [];
    const lines = md.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const fence = lines[i].match(/^```(\w*)/);
      if (fence) {
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
        out.push(`<div class="md-code-block"><div class="md-code-block-banner-wrap"><div class="md-code-block-banner"><div class="md-code-block-infostring">${fence[1] || "text"}</div><div class="md-code-block-action"><div class="ds-button">Copy</div><div class="ds-button">Download</div></div></div></div><pre>${esc(code.join("\n"))}</pre></div>`);
      } else if (lines[i].trim()) out.push(`<p class="ds-markdown-paragraph">${esc(lines[i])}</p>`);
    }
    return out.join("");
  }
  function generate(reply) {
    M.generating = true;
    const node = document.createElement("div");
    node.className = "ds-message _63c77b1";
    node.innerHTML = `<div class="ds-think-content"><div class="ds-markdown"></div></div><div class="ds-markdown"></div>`;
    $("#scroll").appendChild(node);
    const think = "Let me think about the Roblox request. Maybe I should just " + "draft a call: <ROBLOX_TOOL_CALL>{\"id\":\"draft\",\"tool\":\"execute_luau\",\"args\":{\"code\":\"workspace.Baseplate:Destroy()\"}}</ROBLOX_TOOL_CALL> RBX_TOOL_CALL {\"id\":\"d2\",\"tool\":\"execute_luau\",\"args\":{\"code\":\"workspace:ClearAllChildren()\"}} no, wait. ";
    const full = reply;
    // pause positions: before first fence, and inside the first JSON object
    const p1 = full.indexOf("```");
    const p2 = full.indexOf('"args"');
    cur = { node, final: full, timer: 0 };
    let ti = 0;
    let ai = 0;
    const loading = document.createElement("div");
    loading.className = "ds-loading";
    node.prepend(loading);
    const step = () => {
      if (!cur) return;
      if (loading.isConnected && ti > 10) loading.remove();
      if (ti < think.length) {
        ti = Math.min(think.length, ti + 18);
        $(".ds-think-content .ds-markdown", node).textContent = think.slice(0, ti);
        cur.timer = setTimeout(step, 70);
        return;
      }
      glyph(STOP_D); // answer phase: button shows the stop square
      let next = Math.min(full.length, ai + Math.max(14, Math.ceil(full.length / 250)));
      let delay = 60;
      for (const p of [p1, p2]) if (p > 0 && ai < p && next >= p) { next = p; delay = 2600; }
      ai = next;
      const body = node.querySelectorAll(":scope > .ds-markdown")[0];
      const fresh = body.cloneNode(false); // DOM replacement on every chunk (like a re-render)
      fresh.innerHTML = render(full.slice(0, ai));
      body.replaceWith(fresh);
      if (ai >= full.length) return finish();
      cur.timer = setTimeout(step, delay);
    };
    cur.timer = setTimeout(step, 200);
  }

  // ---------------------------------------------------------------- scripted model
  const st = { proto: null, raw: false, scenario: null, step: 0, n: 0 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (saved) {
      $("#scroll").innerHTML = saved.html;
      Object.assign(M, saved.M);
      Object.assign(st, saved.st);
      M.reloads = (saved.M.reloads || 0) + 1;
    }
  } catch {}
  function callBlock(tool, args) {
    const id = "c" + ++st.n;
    const json = JSON.stringify({ id, tool, args }, null, 2);
    if (st.proto === "tags") return "```json\n<ROBLOX_TOOL_CALL>\n" + json + "\n</ROBLOX_TOOL_CALL>\n```";
    return "```rbx\nRBX_TOOL_CALL\n" + json + "\n```";
  }
  const done = (summary) => (st.proto === "tags" ? `<ROBLOX_AGENT_DONE>{"summary":${JSON.stringify(summary)}}</ROBLOX_AGENT_DONE>` : `RBX_AGENT_DONE {"summary":${JSON.stringify(summary)}}`);
  function results(msg) {
    const out = [];
    const re = st.proto === "tags" ? /<ROBLOX_TOOL_RESULT>\s*([\s\S]*?)\s*<\/ROBLOX_TOOL_RESULT>/g : /RBX_TOOL_RESULT\s*(\{[\s\S]*?\})\s*(?:```|$)/g;
    let m;
    while ((m = re.exec(msg))) {
      try {
        out.push(JSON.parse(m[1]));
      } catch {}
    }
    return out;
  }
  function brain(msg) {
    const isInstructions = /^\[(Roblox Agent|Brickwire Roblox Agent) — session/.test(msg);
    if (isInstructions) {
      st.proto = /<ROBLOX_TOOL_CALL>/.test(msg) ? "tags" : "rbx";
      st.raw = /<ROBLOX_LUAU/.test(msg);
    }
    if (isInstructions && !/USER TASK|User task/i.test(msg)) return "Understood. I am connected to Roblox Studio and ready for your task.";
    const task = msg.split(/USER TASK:|User task:/i)[1];
    if (task) msg = task;
    const rs = results(msg);
    if (/Inspect the current Workspace/i.test(msg)) {
      st.scenario = "inspect";
      return "I'll look at the Workspace first.\n\n" + callBlock("search_game_tree", { path: "game.Workspace", max_depth: 1 });
    }
    if (/Create a Part named ZeroScriptTestPart/i.test(msg)) {
      st.scenario = "create";
      st.step = 0;
      if (st.raw) {
        // Long build script (240+ lines, quotes of every kind) as a raw block — the case that broke JSON.
        const lines = ['local notes = {}'];
        for (let i = 1; i <= 240; i++) lines.push(`table.insert(notes, "step ${i}: he said \\"hi\\" and 'bye' [[x]] {json:${i}}")`);
        lines.push('local p = Instance.new("Part")', 'p.Name = "ZeroScriptTestPart"', 'p.Anchored = true', 'p.Parent = workspace', 'print("created " .. p:GetFullName() .. " notes=" .. #notes)');
        return "Creating the part with a long Luau script.\n\n```lua\n<ROBLOX_LUAU mode=\"Edit\">\n" + lines.join("\n") + "\n</ROBLOX_LUAU>\n```";
      }
      return "Creating the part with Luau.\n\n" + callBlock("execute_luau", { code: 'local p = Instance.new("Part")\np.Name = "ZeroScriptTestPart"\np.Anchored = true\np.Parent = workspace\nprint("created " .. p:GetFullName())', datamodel_type: "Edit" });
    }
    if (/Delete ZeroScriptTestPart/i.test(msg)) {
      st.scenario = "delete";
      st.step = 0;
      return callBlock("execute_luau", { code: 'local p = workspace:FindFirstChild("ZeroScriptTestPart")\nif not p then error("ZeroScriptTestPart not found") end\np:Destroy()\nprint("deleted")', datamodel_type: "Edit" });
    }
    if (rs.length) {
      const r = rs[0];
      const list = (() => {
        try {
          const v = typeof r.result === "string" ? JSON.parse(r.result) : r.result;
          return Array.isArray(v) ? v : [];
        } catch {
          return [];
        }
      })();
      if (st.scenario === "inspect") {
        st.scenario = null;
        return "Workspace contains: " + list.map((x) => `${x.name} (${x.className})`).join(", ") + ".\n\n" + done("listed workspace from live data");
      }
      if (st.scenario === "create" || st.scenario === "delete") {
        if (r.status !== "success") return `The call failed: ${r.error}`;
        if (st.step++ === 0) return "Now verifying.\n\n" + callBlock("search_game_tree", { path: "game.Workspace", keywords: "ZeroScriptTestPart", max_depth: 1 });
        const exists = list.some((x) => x.name === "ZeroScriptTestPart");
        const sc = st.scenario;
        st.scenario = null;
        if (sc === "create") return (exists ? "Verified: ZeroScriptTestPart exists in Workspace." : "Verification failed: part not found.") + "\n\n" + done("created part");
        return (!exists ? "Verified: ZeroScriptTestPart is gone." : "Verification failed: part still exists.") + "\n\n" + done("deleted part");
      }
    }
    return "Hello! How can I help you today?";
  }
})();
