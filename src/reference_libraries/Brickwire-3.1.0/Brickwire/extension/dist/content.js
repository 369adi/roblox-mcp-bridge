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
  var MARKERS = {
    TOOL_CALL: "ROBLOX_TOOL_CALL",
    TOOL_RESULT: "ROBLOX_TOOL_RESULT",
    STATUS: "ROBLOX_AGENT_STATUS",
    ERROR: "ROBLOX_AGENT_ERROR",
    DONE: "ROBLOX_AGENT_DONE",
    /** Raw Luau block for execute_luau — no JSON, no escaping (long code survives intact). */
    LUAU: "ROBLOX_LUAU",
    /** 3.0: raw file block — the AI writes a whole file (script, JSON, CSV, OBJ, SVG…) with no JSON escaping; it becomes file_save. */
    FILE: "ROBLOX_FILE",
    /** 1.8: the AI asks the user (clarifying questions / variants to choose from) and waits — no reminder. */
    ASK: "ROBLOX_AGENT_ASK"
  };
  var AGENT_CATEGORIES = ["general", "build", "scripting", "ui", "vfx", "animation", "gameplay", "debug"];

  // shared/src/json-lenient.ts
  function extractJsonObject(text, from) {
    const start = text.indexOf("{", from);
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc2 = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inStr) {
        if (esc2) esc2 = false;
        else if (c === "\\") esc2 = true;
        else if (c === '"' || c === "\u201D") inStr = false;
        continue;
      }
      if (c === '"' || c === "\u201C") {
        inStr = true;
        continue;
      }
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) return { raw: text.slice(start, i + 1), start, end: i + 1, complete: true };
      }
    }
    return { raw: text.slice(start), start, end: text.length, complete: false };
  }
  function escapeControlCharsInStrings(src) {
    let out = "";
    let inStr = false;
    let esc2 = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inStr) {
        if (esc2) {
          esc2 = false;
          out += c;
          continue;
        }
        if (c === "\\") {
          esc2 = true;
          out += c;
          continue;
        }
        if (c === '"') {
          inStr = false;
          out += c;
          continue;
        }
        if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "	") out += "\\t";
        else if (c.charCodeAt(0) < 32) out += "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0");
        else out += c;
        continue;
      }
      if (c === '"') inStr = true;
      out += c;
    }
    return out;
  }
  function removeTrailingCommas(src) {
    let out = "";
    let inStr = false;
    let esc2 = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (inStr) {
        out += c;
        if (esc2) esc2 = false;
        else if (c === "\\") esc2 = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') {
        inStr = true;
        out += c;
        continue;
      }
      if (c === ",") {
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] === "}" || src[j] === "]") continue;
      }
      out += c;
    }
    return out;
  }
  function parseLenientJson(raw) {
    try {
      return { ok: true, value: JSON.parse(raw) };
    } catch {
    }
    let s = raw.replace(/[\u201c\u201d]/g, '"').replace(/\u00a0/g, " ");
    s = escapeControlCharsInStrings(s);
    s = removeTrailingCommas(s);
    try {
      return { ok: true, value: JSON.parse(s), repaired: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // shared/src/parser.ts
  var ASK_RE = new RegExp(`(?<![A-Za-z0-9_/])${MARKERS.ASK}(?![A-Za-z0-9_])`);
  var ASK_WORDS = /(вариант|variant|option\s*[A-C1-3]\b|\bwhich\b|\bprefer|would you like|do you want|should i|shall i|какой|какую|какое|какие|выбери|выберите|уточн|clarif|хочешь|хотите|нужн[оа] ли|подтверд|confirm)/i;
  function looksLikeQuestion(text) {
    const tail = text.slice(-1200);
    const q = (tail.match(/\?/g) ?? []).length;
    return q >= 1 && ASK_WORDS.test(tail) || /(^|\n)\s*(\*\*)?(вариант|variant|option)\s*[A-CА-В1-3]\b/i.test(text) && q >= 1;
  }
  var LUAU_LINE = /^\s*(local\s+[\w,\s]+=|for\s+.+\s+do\b|if\s+.+\s+then\b|end\b|function\b|return\b|print\(|task\.wait|[\w.:\[\]"]+\s*=\s*.+|[\w.:]+\(.*\)\s*$)/;
  var ROBLOX_API = /\b(Instance\.new\(|game:GetService\(|workspace[.:]|game\.Workspace|BW\.[a-zA-Z]+\s*[({]|Vector3\.new\(|CFrame\.|Color3\.|:FindFirstChild\(|:WaitForChild\()/;
  function looksLikeUntaggedLuau(text) {
    if (!ROBLOX_API.test(text)) return false;
    let n = 0;
    for (const line of text.split("\n")) if (LUAU_LINE.test(line) && line.length < 400) n++;
    return n >= 3;
  }
  var KIND_BY_MARKER = {
    [MARKERS.TOOL_CALL]: "call",
    [MARKERS.TOOL_RESULT]: "result",
    [MARKERS.STATUS]: "status",
    [MARKERS.ERROR]: "error",
    [MARKERS.DONE]: "done"
  };
  var NAMES = Object.keys(KIND_BY_MARKER).join("|");
  var OPEN_RE = new RegExp(`(?<![A-Za-z0-9_/])(${NAMES})(?![A-Za-z0-9_])\\s*>?`, "g");
  var GAP_RE = /^[\s:=\->`]*(?:(?:json|jsonc|lua|luau|rbx|text|plaintext|copy code|copy|download|run|скопировать|код)\s*`*)*[\s`]*$/i;
  var MAX_GAP = 80;
  var TOOL_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,63}$/;
  function closeAfter(text, from, marker) {
    const m = new RegExp(`^[\\s\`]*(?:<\\s*)?\\/\\s*${marker}\\s*>?`).exec(text.slice(from, from + 200));
    return m ? from + m[0].length : -1;
  }
  var LUAU_OPEN_RE = new RegExp(`(?<![A-Za-z0-9_/])<?\\s*${MARKERS.LUAU}((?:\\s+[a-z_]+\\s*=\\s*["']?[\\w.-]*["']?)*)\\s*>`, "gi");
  var LUAU_CLOSE_RE = new RegExp(`<?\\s*\\/\\s*${MARKERS.LUAU}\\s*>?`, "i");
  var FILE_OPEN_RE = new RegExp(`(?<![A-Za-z0-9_/])<?\\s*${MARKERS.FILE}((?:\\s+[a-z_]+\\s*=\\s*(?:"[^"\\n]*"|'[^'\\n]*'|[^\\s>"']+))*)\\s*>`, "gi");
  var FILE_CLOSE_RE = new RegExp(`<?\\s*\\/\\s*${MARKERS.FILE}\\s*>?`, "i");
  var CHROME_LINE = /^\s*(lua|luau|copy|copy code|download|run|скопировать|код)\s*$/i;
  function cleanLuau(raw) {
    const lines = raw.replace(/\r/g, "").split("\n");
    while (lines.length && (CHROME_LINE.test(lines[0]) || /^\s*```\s*\w*\s*$/.test(lines[0]) || !lines[0].trim())) lines.shift();
    while (lines.length && (/^\s*```\s*$/.test(lines[lines.length - 1]) || !lines[lines.length - 1].trim())) lines.pop();
    return lines.join("\n");
  }
  function findRawLuau(text, out) {
    const found = [];
    const re = new RegExp(LUAU_OPEN_RE.source, "gi");
    let m;
    let n = 0;
    while (m = re.exec(text)) {
      const bodyStart = m.index + m[0].length;
      const close = LUAU_CLOSE_RE.exec(text.slice(bodyStart));
      const attrs = {};
      for (const a of (m[1] ?? "").matchAll(/([a-z_]+)\s*=\s*["']?([\w.-]*)["']?/gi)) attrs[a[1].toLowerCase()] = a[2];
      if (!close) {
        out.hasIncomplete = true;
        out.blocks.push({ kind: "call", marker: MARKERS.LUAU, index: m.index, complete: false, closed: false, valid: false, raw: text.slice(bodyStart, bodyStart + 200) });
        found.push({ index: m.index, end: text.length });
        break;
      }
      const end = bodyStart + close.index + close[0].length;
      const code = cleanLuau(text.slice(bodyStart, bodyStart + close.index));
      const modeRaw = (attrs.mode ?? attrs.datamodel ?? attrs.datamodel_type ?? "Edit").toLowerCase();
      const mode = modeRaw === "server" ? "Server" : modeRaw === "client" ? "Client" : "Edit";
      const block = { kind: "call", marker: MARKERS.LUAU, index: m.index, complete: true, closed: true, valid: !!code.trim(), raw: code.slice(0, 200) };
      out.blocks.push(block);
      if (!code.trim()) {
        block.problem = "empty <ROBLOX_LUAU> block";
        out.invalidCalls.push(block);
        found.push({ index: m.index, end });
      } else {
        found.push({ index: m.index, end, call: { id: attrs.id || `lua${++n}`, tool: "execute_luau", args: { code, datamodel_type: mode } } });
      }
      re.lastIndex = end;
    }
    return found;
  }
  function findRawFiles(text, out, skip) {
    const found = [];
    const re = new RegExp(FILE_OPEN_RE.source, "gi");
    let m;
    let n = 0;
    while (m = re.exec(text)) {
      if (skip(m.index)) continue;
      const bodyStart = m.index + m[0].length;
      const close = FILE_CLOSE_RE.exec(text.slice(bodyStart));
      const attrs = {};
      for (const a of (m[1] ?? "").matchAll(/([a-z_]+)\s*=\s*(?:"([^"\n]*)"|'([^'\n]*)'|([^\s>"']+))/gi)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
      if (!close) {
        out.hasIncomplete = true;
        out.blocks.push({ kind: "call", marker: MARKERS.FILE, index: m.index, complete: false, closed: false, valid: false, raw: text.slice(bodyStart, bodyStart + 200) });
        found.push({ index: m.index, end: text.length });
        break;
      }
      const end = bodyStart + close.index + close[0].length;
      const body = cleanLuau(text.slice(bodyStart, bodyStart + close.index));
      const name = (attrs.name ?? attrs.file ?? attrs.filename ?? "").trim();
      const block = { kind: "call", marker: MARKERS.FILE, index: m.index, complete: true, closed: true, valid: !!name && !!body.length, raw: body.slice(0, 200) };
      out.blocks.push(block);
      if (!name || !body.length) {
        block.problem = !name ? 'ROBLOX_FILE needs name="file.ext"' : "empty <ROBLOX_FILE> block";
        out.invalidCalls.push(block);
        found.push({ index: m.index, end });
      } else {
        const b64 = /^base64$/i.test(attrs.encoding ?? "");
        const args = { name, ...b64 ? { base64: body.replace(/\s+/g, "") } : { text: body + "\n" } };
        const to = attrs.to ?? attrs.parent;
        if (to) args.to = to;
        if (attrs.as) args.as = attrs.as;
        found.push({ index: m.index, end, call: { id: attrs.id || `file${++n}`, tool: "file_save", args } });
      }
      re.lastIndex = end;
    }
    return found;
  }
  function parseAgentOutput(text) {
    const out = { calls: [], invalidCalls: [], statuses: [], errors: [], done: null, forgedResults: 0, hasIncomplete: false, blocks: [] };
    if (!text) return out;
    const seenIds = /* @__PURE__ */ new Set();
    const luauOnly = findRawLuau(text, out);
    const luau = [...luauOnly, ...findRawFiles(text, out, (i) => luauOnly.some((b) => i >= b.index && i < b.end))];
    const inLuau = (i) => luau.some((b) => i >= b.index && i < b.end);
    const ordered = luau.filter((b) => b.call).map((b) => ({ index: b.index, call: b.call }));
    const re = new RegExp(OPEN_RE.source, "g");
    let m;
    let consumedUntil = 0;
    while (m = re.exec(text)) {
      if (m.index < consumedUntil) continue;
      if (inLuau(m.index)) continue;
      const marker = m[1];
      const kind = KIND_BY_MARKER[marker];
      const after = m.index + m[0].length;
      const brace = text.indexOf("{", after);
      const gap = brace < 0 ? text.slice(after) : text.slice(after, brace);
      if (brace < 0 || gap.length > MAX_GAP || !GAP_RE.test(gap)) {
        const tagForm = m[0].includes(">") && text[m.index - 1] === "<";
        const lineRest = (text.slice(after).split("\n")[0] ?? "").trim();
        if (kind === "done" && (tagForm || /^[`.!:]*$/.test(lineRest))) {
          const end = text.indexOf("/" + marker, after);
          const summary = text.slice(after, end < 0 ? Math.min(text.length, after + 300) : end).replace(/[<`]+\s*$/, "").trim();
          out.done = out.done ?? { summary };
          out.blocks.push({ kind, marker, index: m.index, complete: true, closed: end >= 0, valid: true, value: { summary }, raw: marker });
        } else if (brace < 0 && GAP_RE.test(gap)) {
          out.hasIncomplete = true;
        }
        continue;
      }
      const obj = extractJsonObject(text, brace);
      if (!obj) continue;
      const block = { kind, marker, index: m.index, complete: obj.complete, closed: false, valid: false, raw: obj.raw };
      out.blocks.push(block);
      if (!obj.complete) {
        out.hasIncomplete = true;
        break;
      }
      const closeEnd = closeAfter(text, obj.end, marker);
      block.closed = closeEnd >= 0;
      consumedUntil = block.closed ? closeEnd : obj.end;
      const parsed = parseLenientJson(obj.raw);
      if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null || Array.isArray(parsed.value)) {
        block.problem = "invalid JSON: " + (parsed.error ?? "not an object");
        if (kind === "call") out.invalidCalls.push(block);
        continue;
      }
      const value = parsed.value;
      block.value = value;
      switch (kind) {
        case "call": {
          if (value.tool === void 0 && typeof (value.name ?? value.command) === "string") value.tool = value.name ?? value.command;
          if (value.args === void 0 && (value.arguments ?? value.params) !== void 0) value.args = value.arguments ?? value.params;
          if (value.id === void 0) value.id = `auto${out.calls.length + out.invalidCalls.length + 1}_${m.index}`;
          const problem = validateCallShape(value);
          if (problem) {
            block.problem = problem;
            out.invalidCalls.push(block);
            break;
          }
          block.valid = true;
          ordered.push({ index: m.index, call: { id: String(value.id), tool: String(value.tool), args: value.args ?? {} } });
          break;
        }
        case "result":
          out.forgedResults++;
          block.valid = true;
          break;
        case "status":
          block.valid = true;
          out.statuses.push(value);
          break;
        case "error":
          block.valid = true;
          out.errors.push(value);
          break;
        case "done":
          block.valid = true;
          out.done = value;
          break;
      }
    }
    ordered.sort((a, b) => a.index - b.index);
    for (const { call: call2 } of ordered) {
      let id = call2.id;
      if (seenIds.has(id)) id = `${id}#${out.calls.length + 1}`;
      seenIds.add(id);
      out.calls.push({ ...call2, id });
    }
    if (!out.calls.length && !out.blocks.length && !out.hasIncomplete && !out.done && !out.forgedResults && !luau.length) out.untaggedCode = looksLikeUntaggedLuau(text);
    {
      const am = ASK_RE.exec(text);
      if (am && !inLuau(am.index)) out.ask = true;
      if (!out.calls.length && !out.done) out.asksUser = out.ask || looksLikeQuestion(text);
    }
    return out;
  }
  function validateCallShape(v) {
    if (v.id === void 0 || v.id === null || typeof v.id !== "string" && typeof v.id !== "number") return 'missing "id" (string)';
    if (String(v.id).length > 100) return '"id" too long';
    if (typeof v.tool !== "string" || !TOOL_NAME_RE.test(v.tool)) return 'missing or invalid "tool" name';
    if (v.args !== void 0 && (typeof v.args !== "object" || v.args === null || Array.isArray(v.args))) return '"args" must be an object';
    return null;
  }

  // shared/src/library/icons.ts
  var W = "#FFFFFF";
  var D = "#263238";
  var ICONS = {
    coin: { color: "#F9A825", tags: "money currency gold cash", shapes: [["c", 50, 50, 46, "a"], ["c", 50, 50, 37, "#FFD54F"], ["t", 50, 52, 50, 60, "#F57F17", "$"]] },
    gem: { color: "#26C6DA", tags: "diamond crystal premium robux", shapes: [["r", 50, 50, 56, 56, "a", 45, 6], ["r", 40, 40, 20, 20, "#B2EBF2", 45, 3]] },
    heart: { color: "#E53935", tags: "health life love hp", shapes: [["c", 34, 40, 20, "a"], ["c", 66, 40, 20, "a"], ["r", 50, 56, 42, 42, "a", 45, 4], ["c", 30, 36, 6, "#FFCDD2"]] },
    star: { color: "#FFC107", tags: "favorite rating xp level", shapes: [["t", 50, 52, 100, 100, "a", "\u2605"]] },
    bolt: { color: "#FFB300", tags: "energy power speed lightning", shapes: [["r", 58, 30, 16, 46, "a", 25, 2], ["r", 42, 70, 16, 46, "a", 25, 2], ["r", 50, 50, 44, 13, "a", -20, 2]] },
    shield: { color: "#1E88E5", tags: "defense armor protection", shapes: [["r", 50, 38, 60, 44, "a", 0, 8], ["r", 50, 60, 42, 42, "a", 45, 5], ["r", 50, 50, 10, 56, "#90CAF9", 0, 3]] },
    sword: { color: "#B0BEC5", tags: "weapon attack combat damage", shapes: [["r", 50, 38, 11, 58, "a", 0, 4], ["r", 50, 70, 38, 8, "#8D6E63", 0, 3], ["r", 50, 82, 8, 16, "#5D4037", 0, 2], ["c", 50, 93, 6, "#FFC107"]] },
    trophy: { color: "#FFC107", tags: "win award leaderboard first", shapes: [["o", 25, 34, 11, 6, "a"], ["o", 75, 34, 11, 6, "a"], ["r", 50, 34, 44, 40, "a", 0, 14], ["r", 50, 62, 10, 18, "a"], ["r", 50, 82, 40, 10, "#8D6E63", 0, 3]] },
    crown: { color: "#FFC107", tags: "vip king premium rank", shapes: [["r", 22, 52, 20, 20, "a", 45, 2], ["r", 50, 44, 22, 22, "a", 45, 2], ["r", 78, 52, 20, 20, "a", 45, 2], ["r", 50, 68, 66, 22, "a", 0, 3], ["c", 50, 68, 5, "#E53935"], ["c", 30, 68, 4, "#1E88E5"], ["c", 70, 68, 4, "#1E88E5"]] },
    gear: { color: "#78909C", tags: "settings options config", shapes: [["r", 50, 50, 16, 86, "a", 0, 3], ["r", 50, 50, 16, 86, "a", 45, 3], ["r", 50, 50, 16, 86, "a", 90, 3], ["r", 50, 50, 16, 86, "a", 135, 3], ["c", 50, 50, 30, "a"], ["c", 50, 50, 12, W]] },
    cart: { color: "#43A047", tags: "shop store buy purchase", shapes: [["r", 18, 26, 22, 7, "a", 20, 3], ["r", 54, 46, 56, 30, "a", 0, 5], ["r", 54, 66, 50, 6, "a", 0, 3], ["c", 36, 80, 8, D], ["c", 70, 80, 8, D]] },
    bag: { color: "#8D6E63", tags: "inventory backpack items", shapes: [["o", 50, 30, 16, 6, "a"], ["r", 50, 62, 64, 52, "a", 0, 12], ["r", 50, 54, 64, 6, "#6D4C41"]] },
    lock: { color: "#FFA000", tags: "locked secure closed", shapes: [["o", 50, 38, 18, 7, "#90A4AE"], ["r", 50, 64, 58, 42, "a", 0, 7], ["c", 50, 60, 6, D], ["r", 50, 70, 4, 12, D]] },
    check: { color: "#43A047", tags: "ok done yes confirm", shapes: [["r", 35, 62, 13, 32, "a", -45, 4], ["r", 61, 50, 13, 60, "a", 45, 4]] },
    close: { color: "#E53935", tags: "x cancel no exit", shapes: [["r", 50, 50, 13, 76, "a", 45, 4], ["r", 50, 50, 13, 76, "a", -45, 4]] },
    plus: { color: "#43A047", tags: "add more increase", shapes: [["r", 50, 50, 15, 70, "a", 0, 4], ["r", 50, 50, 70, 15, "a", 0, 4]] },
    minus: { color: "#E53935", tags: "remove less decrease", shapes: [["r", 50, 50, 70, 15, "a", 0, 4]] },
    play: { color: "#43A047", tags: "start go resume", shapes: [["c", 50, 50, 46, "a"], ["t", 54, 50, 60, 60, W, "\u25B6"]] },
    pause: { color: "#546E7A", tags: "stop wait", shapes: [["r", 36, 50, 15, 60, "a", 0, 4], ["r", 64, 50, 15, 60, "a", 0, 4]] },
    home: { color: "#5C6BC0", tags: "house lobby menu", shapes: [["r", 50, 42, 48, 48, "a", 45, 4], ["r", 50, 66, 54, 36, "a", 0, 4], ["r", 50, 74, 14, 20, W, 0, 3]] },
    user: { color: "#5C6BC0", tags: "player profile account avatar", shapes: [["c", 50, 32, 17, "a"], ["r", 50, 76, 60, 38, "a", 0, 18]] },
    info: { color: "#1E88E5", tags: "help about information", shapes: [["c", 50, 50, 46, "a"], ["t", 50, 52, 50, 70, W, "i"]] },
    warning: { color: "#FFB300", tags: "alert caution danger", shapes: [["r", 50, 52, 62, 62, "a", 45, 9], ["t", 50, 52, 40, 60, D, "!"]] },
    music: { color: "#AB47BC", tags: "sound audio song", shapes: [["r", 42, 44, 6, 60, "a"], ["r", 78, 38, 6, 60, "a"], ["r", 60, 15, 42, 10, "a", -10, 2], ["c", 33, 74, 12, "a"], ["c", 69, 68, 12, "a"]] },
    map: { color: "#66BB6A", tags: "world location quest travel", shapes: [["r", 50, 50, 78, 64, "#C8E6C9", 0, 5], ["r", 36, 56, 40, 7, "#8D6E63", 25, 3], ["r", 62, 46, 30, 7, "#8D6E63", -20, 3], ["c", 70, 36, 11, "#E53935"], ["c", 70, 36, 4, W]] },
    clock: { color: "#5C6BC0", tags: "time timer countdown", shapes: [["c", 50, 50, 46, "a"], ["c", 50, 50, 38, W], ["r", 50, 38, 6, 26, D, 0, 3], ["r", 60, 50, 22, 6, D, 0, 3], ["c", 50, 50, 5, D]] },
    gift: { color: "#E53935", tags: "reward daily present bonus", shapes: [["c", 39, 22, 10, "#FFC107"], ["c", 61, 22, 10, "#FFC107"], ["r", 50, 62, 64, 44, "a", 0, 4], ["r", 50, 36, 74, 14, "a", 0, 3], ["r", 50, 57, 11, 56, "#FFC107"]] },
    key: { color: "#FFC107", tags: "unlock door access", shapes: [["o", 28, 50, 16, 8, "a"], ["r", 62, 50, 46, 10, "a", 0, 2], ["r", 76, 61, 7, 14, "a"], ["r", 87, 61, 7, 14, "a"]] },
    potion: { color: "#8E24AA", tags: "magic boost buff drink", shapes: [["r", 50, 14, 22, 9, "#8D6E63", 0, 2], ["r", 50, 30, 16, 26, "#B39DDB", 0, 3], ["c", 50, 64, 29, "a"], ["c", 41, 57, 7, "#E1BEE7"]] },
    flame: { color: "#FF7043", tags: "fire hot streak burn", shapes: [["r", 50, 44, 38, 38, "a", 45, 8], ["c", 50, 64, 27, "a"], ["c", 50, 70, 14, "#FFCA28"]] },
    trash: { color: "#78909C", tags: "delete remove bin", shapes: [["r", 50, 22, 62, 9, "a", 0, 3], ["r", 50, 15, 20, 8, "a", 0, 2], ["r", 50, 60, 50, 56, "a", 0, 5], ["r", 38, 60, 5, 40, W], ["r", 62, 60, 5, 40, W]] },
    rocket: { color: "#ECEFF1", tags: "launch boost upgrade speed", shapes: [["r", 32, 66, 18, 18, "#E53935", 45, 3], ["r", 68, 66, 18, 18, "#E53935", 45, 3], ["r", 50, 48, 26, 56, "a", 0, 13], ["c", 50, 40, 7, "#29B6F6"], ["r", 50, 84, 12, 12, "#FF9800", 45, 3]] }
  };
  var ICON_IDS = Object.keys(ICONS);
  function iconSvg(id, size = 48, color) {
    const d = ICONS[id];
    if (!d) return "";
    const col = (c) => c === "a" ? color ?? d.color : c === "w" ? W : c;
    const parts = d.shapes.map((s) => {
      if (s[0] === "c") return `<circle cx="${s[1]}" cy="${s[2]}" r="${s[3]}" fill="${col(s[4])}"/>`;
      if (s[0] === "o") return `<circle cx="${s[1]}" cy="${s[2]}" r="${s[3] - s[4] / 2}" fill="none" stroke="${col(s[5])}" stroke-width="${s[4]}"/>`;
      if (s[0] === "r") {
        const [, cx2, cy2, w, h2, c2, rot = 0, rad = 0] = s;
        return `<rect x="${cx2 - w / 2}" y="${cy2 - h2 / 2}" width="${w}" height="${h2}" rx="${rad}" fill="${col(c2)}" transform="rotate(${rot} ${cx2} ${cy2})"/>`;
      }
      const [, cx, cy, , h, c, text] = s;
      return `<text x="${cx}" y="${cy}" font-size="${h * 0.8}" font-weight="700" font-family="Arial, sans-serif" text-anchor="middle" dominant-baseline="central" fill="${col(c)}">${text}</text>`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${parts.join("")}</svg>`;
  }

  // shared/src/library/catalog.ts
  var KIND_LABELS = {
    build: { en: "Buildings", ru: "\u041F\u043E\u0441\u0442\u0440\u043E\u0439\u043A\u0438" },
    furniture: { en: "Furniture", ru: "\u041C\u0435\u0431\u0435\u043B\u044C" },
    gameplay: { en: "Gameplay", ru: "\u0413\u0435\u0439\u043C\u043F\u043B\u0435\u0439" },
    ui: { en: "UI", ru: "\u0418\u043D\u0442\u0435\u0440\u0444\u0435\u0439\u0441" },
    style: { en: "UI styles", ru: "\u0421\u0442\u0438\u043B\u0438 UI" },
    vfx: { en: "Effects", ru: "\u042D\u0444\u0444\u0435\u043A\u0442\u044B" },
    anim: { en: "Animated", ru: "\u0410\u043D\u0438\u043C\u0430\u0446\u0438\u044F" },
    icon: { en: "Icons", ru: "\u0418\u043A\u043E\u043D\u043A\u0438" }
  };
  var k = (id, kind, name, nameRu, desc, opts = "", tags = "") => ({ id, kind, name, nameRu, desc, opts, tags });
  var KITS = [
    // buildings
    k("cottage", "build", "Cottage", "\u0414\u043E\u043C\u0438\u043A", "medieval cottage 20x16: door, 5 windows, gable roof, chimney, porch", "width depth height", "house home medieval village"),
    k("modern_house", "build", "Modern house", "\u0421\u043E\u0432\u0440\u0435\u043C\u0435\u043D\u043D\u044B\u0439 \u0434\u043E\u043C", "2-storey modern house with stairs inside, balcony with glass rail, driveway, hedges", "width depth floors", "house villa city"),
    k("tower", "build", "Stone tower", "\u041A\u0430\u043C\u0435\u043D\u043D\u0430\u044F \u0431\u0430\u0448\u043D\u044F", "round cobblestone tower with merlons, door and flag", "height diameter Color", "castle medieval fort"),
    k("castle_wall", "build", "Castle wall", "\u041A\u0440\u0435\u043F\u043E\u0441\u0442\u043D\u0430\u044F \u0441\u0442\u0435\u043D\u0430", "crenellated wall segment with walkway and optional gate", "length height Color gate", "castle fort medieval"),
    k("market_stall", "build", "Market stall", "\u0420\u044B\u043D\u043E\u0447\u043D\u044B\u0439 \u043F\u0440\u0438\u043B\u0430\u0432\u043E\u043A", "wooden stall with striped awning, counter and crates", "Color", "shop market village"),
    k("well", "build", "Well", "\u041A\u043E\u043B\u043E\u0434\u0435\u0446", "stone well with roof, crank and bucket", "", "village medieval water"),
    k("bridge", "build", "Bridge", "\u041C\u043E\u0441\u0442", "wooden plank bridge with rails and posts", "length width deckHeight", "river path"),
    k("lamp_post", "build", "Lamp post", "\u0424\u043E\u043D\u0430\u0440\u044C", "street lamp with warm PointLight", "height LightColor", "street city light park"),
    k("bench", "build", "Bench", "\u0421\u043A\u0430\u043C\u0435\u0439\u043A\u0430", "park bench with seat (sittable)", "Color", "park street"),
    k("campfire", "build", "Campfire", "\u041A\u043E\u0441\u0442\u0451\u0440", "stones + logs + fire/smoke particles + flickering light", "", "camp forest fire"),
    k("fountain", "build", "Fountain", "\u0424\u043E\u043D\u0442\u0430\u043D", "round stone fountain with water and spray particles", "radius", "park plaza city"),
    k("watchtower", "build", "Watchtower", "\u0421\u0442\u043E\u0440\u043E\u0436\u0435\u0432\u0430\u044F \u0432\u044B\u0448\u043A\u0430", "wooden tower on 4 legs with ladder, platform, rails and roof", "height", "fort camp military"),
    k("skyscraper", "build", "Skyscraper", "\u041D\u0435\u0431\u043E\u0441\u043A\u0440\u0451\u0431", "multi-storey glass tower (BW.building) with lobby door and roof details", "floors width depth", "city tower office"),
    k("shop_building", "build", "Shop building", "\u041C\u0430\u0433\u0430\u0437\u0438\u043D", "shop with big front windows, awning and lit sign (SurfaceGui)", "width depth title", "store city street"),
    k("house_plan", "build", "House from plan", "\u0414\u043E\u043C \u043F\u043E \u043F\u043B\u0430\u043D\u0443", "single-storey house from an ASCII floor plan (rooms, doors, windows) + roof", "plan", "house rooms layout floorplan"),
    k("park", "build", "Park", "\u041F\u0430\u0440\u043A", "grass square with paths, fountain, benches, lamps and trees", "size trees seed", "city nature plaza"),
    k("barn", "build", "Barn", "\u0410\u043C\u0431\u0430\u0440", "red barn with big doors, gable roof, hay bales and fence", "", "farm village"),
    // furniture
    k("table", "furniture", "Table", "\u0421\u0442\u043E\u043B", "wooden table", "width depth Color", "interior dining office"),
    k("chair", "furniture", "Chair", "\u0421\u0442\u0443\u043B", "chair with Seat (sittable)", "Color", "interior dining"),
    k("bed", "furniture", "Bed", "\u041A\u0440\u043E\u0432\u0430\u0442\u044C", "bed with pillow and blanket", "Color Accent", "bedroom interior"),
    k("bookshelf", "furniture", "Bookshelf", "\u041A\u043D\u0438\u0436\u043D\u044B\u0439 \u0448\u043A\u0430\u0444", "shelf with random coloured books", "Color seed", "library office interior"),
    k("sofa", "furniture", "Sofa", "\u0414\u0438\u0432\u0430\u043D", "3-seat sofa (sittable)", "Color", "living interior"),
    k("kitchen", "furniture", "Kitchen counter", "\u041A\u0443\u0445\u043D\u044F", "counter with sink, stove and cabinets", "length", "kitchen interior"),
    k("floor_lamp", "furniture", "Floor lamp", "\u0422\u043E\u0440\u0448\u0435\u0440", "floor lamp with soft light", "", "interior light"),
    k("rug", "furniture", "Rug", "\u041A\u043E\u0432\u0451\u0440", "rug with border", "Color Accent", "interior"),
    k("potted_plant", "furniture", "Potted plant", "\u0420\u0430\u0441\u0442\u0435\u043D\u0438\u0435 \u0432 \u0433\u043E\u0440\u0448\u043A\u0435", "pot with leafy plant", "", "interior decor"),
    k("tv", "furniture", "TV", "\u0422\u0435\u043B\u0435\u0432\u0438\u0437\u043E\u0440", "TV on a stand with glowing screen", "", "living interior"),
    // gameplay
    k("obby", "gameplay", "Obby course", "\u041E\u0431\u0431\u0438 (\u043F\u0430\u0440\u043A\u0443\u0440)", "complete obby: start, N stages with checkpoints (SpawnLocation), jumps, kill strips, jump pads, finish + scripts", "stages", "parkour obstacle course checkpoint"),
    k("kill_bricks", "gameplay", "Kill bricks", "\u0423\u0431\u0438\u0432\u0430\u044E\u0449\u0438\u0435 \u0431\u043B\u043E\u043A\u0438", "row of neon kill bricks with server script", "count", "obby trap lava"),
    k("lava_floor", "gameplay", "Lava floor", "\u041B\u0430\u0432\u043E\u0432\u044B\u0439 \u043F\u043E\u043B", "lava pool with safe platforms to jump across", "size platforms", "obby trap"),
    k("jump_pad", "gameplay", "Jump pad", "\u0411\u0430\u0442\u0443\u0442", "pad that launches the player up", "power Color", "obby launch"),
    k("speed_pad", "gameplay", "Speed pad", "\u0423\u0441\u043A\u043E\u0440\u0438\u0442\u0435\u043B\u044C", "pad that gives temporary speed boost", "speed time Color", "boost obby race"),
    k("teleporter", "gameplay", "Teleporter pair", "\u0422\u0435\u043B\u0435\u043F\u043E\u0440\u0442", "two linked pads with cooldown", "distance", "portal travel"),
    k("coins", "gameplay", "Collectible coins", "\u041C\u043E\u043D\u0435\u0442\u043A\u0438", "spinning coins in a line or ring; touch \u2192 leaderstats Coins, respawn", "count shape(line|ring) radius value respawn", "collect currency simulator"),
    k("spawn_area", "gameplay", "Spawn area", "\u0417\u043E\u043D\u0430 \u0441\u043F\u0430\u0432\u043D\u0430", "spawn platform with SpawnLocation, sign and rails", "size Color title", "lobby start"),
    k("round_system", "gameplay", "Round system", "\u0421\u0438\u0441\u0442\u0435\u043C\u0430 \u0440\u0430\u0443\u043D\u0434\u043E\u0432", "lobby \u2194 arena rounds: intermission, teleports, timer, winner gets Wins (RoundStatus value for UI)", "intermission roundTime minPlayers arenaDistance", "minigame pvp match"),
    k("saved_stats", "gameplay", "Saved stats", "\u0421\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u0438\u0435 \u0434\u0430\u043D\u043D\u044B\u0445", "leaderstats + DataStore save/load with retries, autosave and BindToClose", "stats store", "datastore save progress"),
    k("day_night", "gameplay", "Day/night cycle", "\u0421\u043C\u0435\u043D\u0430 \u0434\u043D\u044F \u0438 \u043D\u043E\u0447\u0438", "Lighting ClockTime cycle script", "minutes", "lighting time sky"),
    k("npc_dialog", "gameplay", "NPC with dialog", "NPC \u0441 \u0434\u0438\u0430\u043B\u043E\u0433\u043E\u043C", "NPC rig + ProximityPrompt + dialog UI with lines", "lines title style", "quest talk shopkeeper"),
    // ui
    k("hud", "ui", "HUD", "HUD", "coins pill with icon + plus button (leaderstats, bump on change, 12.5K format) + health bar", "stat style", "hud stats coins health"),
    k("shop", "ui", "Shop", "\u041C\u0430\u0433\u0430\u0437\u0438\u043D (UI)", "side shop button + window with rarity item cards, price chips, server-validated purchase (RemoteFunction)", "items title currency style", "store buy gamepass"),
    k("inventory", "ui", "Inventory", "\u0418\u043D\u0432\u0435\u043D\u0442\u0430\u0440\u044C", "inventory button + grid window with slots", "slots style", "items backpack"),
    k("main_menu", "ui", "Main menu", "\u0413\u043B\u0430\u0432\u043D\u043E\u0435 \u043C\u0435\u043D\u044E", "full-screen menu: gradient backdrop with rays, big outlined title, Play / Shop / Settings", "title subtitle style", "start menu lobby"),
    k("dialog", "ui", "Dialog box", "\u041E\u043A\u043D\u043E \u0434\u0438\u0430\u043B\u043E\u0433\u0430", "bottom dialog box with speaker name, text and Next", "style", "talk npc story"),
    k("notifications", "ui", "Notifications", "\u0423\u0432\u0435\u0434\u043E\u043C\u043B\u0435\u043D\u0438\u044F", "toast notifications (Notify RemoteEvent from server)", "style", "toast alert message"),
    k("settings", "ui", "Settings", "\u041D\u0430\u0441\u0442\u0440\u043E\u0439\u043A\u0438", "settings window with animated switches (music, sfx, shadows\u2026)", "toggles style", "options"),
    k("loading_screen", "ui", "Loading screen", "\u042D\u043A\u0440\u0430\u043D \u0437\u0430\u0433\u0440\u0443\u0437\u043A\u0438", "loading screen with progress bar and tips", "title tip style", "intro loading"),
    k("daily_reward", "ui", "Daily reward", "\u0415\u0436\u0435\u0434\u043D\u0435\u0432\u043D\u0430\u044F \u043D\u0430\u0433\u0440\u0430\u0434\u0430", "gift button + window, claim once per 24h (DataStore, server-validated)", "amount currency style", "reward bonus retention"),
    k("ui_showcase", "ui", "Style showcase", "\u0412\u0438\u0442\u0440\u0438\u043D\u0430 \u0441\u0442\u0438\u043B\u044F", "one screen with every component of a style: currency pills, side buttons, window, rarity cards, XP bar, switch, buttons", "style title", "style theme design components"),
    k("timer_bar", "ui", "Round timer", "\u0422\u0430\u0439\u043C\u0435\u0440 \u0440\u0430\u0443\u043D\u0434\u0430", "top timer that shows RoundStatus text", "style", "round countdown"),
    // UI styles (each = ui_showcase in that style)
    k("style_simulator", "style", "Simulator UI", "\u0421\u0442\u0438\u043B\u044C: \u0421\u0438\u043C\u0443\u043B\u044F\u0442\u043E\u0440", 'bright bubbly simulator look: thick dark outlines, glossy 3D buttons, FredokaOne (like Pet Simulator 99, Bee Swarm) \u2014 use style="simulator" in any UI kit / BW.ui* component', "title", "style theme simulator"),
    k("style_cartoon", "style", "Cartoon UI", "\u0421\u0442\u0438\u043B\u044C: \u041C\u0443\u043B\u044C\u0442\u044F\u0448\u043D\u044B\u0439", 'warm cartoon: chunky LuckiestGuy text, orange/yellow, very thick outlines (like Adopt Me) \u2014 use style="cartoon" in any UI kit / BW.ui* component', "title", "style theme cartoon"),
    k("style_anime", "style", "Anime UI", "\u0421\u0442\u0438\u043B\u044C: \u0410\u043D\u0438\u043C\u0435", 'anime action: dark navy, magenta\u2192violet gradients, slanted headers, Bangers titles (like Anime Defenders, Blox Fruits) \u2014 use style="anime" in any UI kit / BW.ui* component', "title", "style theme anime"),
    k("style_glass", "style", "Glass UI", "\u0421\u0442\u0438\u043B\u044C: \u0421\u0442\u0435\u043A\u043B\u043E", 'glassmorphism: translucent dark panels, hairline light strokes, soft corners \u2014 use style="glass" in any UI kit / BW.ui* component', "title", "style theme glass"),
    k("style_neon", "style", "Neon sci-fi UI", "\u0421\u0442\u0438\u043B\u044C: \u041D\u0435\u043E\u043D / sci-fi", 'sci-fi neon: near-black, cyan glow outlines, Michroma titles, sharp corners \u2014 use style="neon" in any UI kit / BW.ui* component', "title", "style theme neon"),
    k("style_fantasy", "style", "Fantasy RPG UI", "\u0421\u0442\u0438\u043B\u044C: \u0424\u044D\u043D\u0442\u0435\u0437\u0438 RPG", 'fantasy RPG: parchment panels, dark wood outlines, gothic titles, red ribbon \u2014 use style="fantasy" in any UI kit / BW.ui* component', "title", "style theme fantasy"),
    k("style_minimal", "style", "Minimal UI", "\u0421\u0442\u0438\u043B\u044C: \u041C\u0438\u043D\u0438\u043C\u0430\u043B\u0438\u0437\u043C", 'clean minimal: white cards, grey hairlines, one accent colour \u2014 use style="minimal" in any UI kit / BW.ui* component', "title", "style theme minimal"),
    k("style_dark", "style", "Modern dark UI", "\u0421\u0442\u0438\u043B\u044C: \u0422\u0451\u043C\u043D\u044B\u0439 \u043C\u043E\u0434\u0435\u0440\u043D", 'modern dark: blue-grey panels, subtle gradients, blue accent \u2014 use style="dark" in any UI kit / BW.ui* component', "title", "style theme dark"),
    k("style_candy", "style", "Candy pastel UI", "\u0421\u0442\u0438\u043B\u044C: \u041F\u0430\u0441\u0442\u0435\u043B\u044C / kawaii", 'kawaii pastel: pink/mint/lilac, bubbly FredokaOne, soft pink outlines \u2014 use style="candy" in any UI kit / BW.ui* component', "title", "style theme candy"),
    k("style_pixel", "style", "Pixel retro UI", "\u0421\u0442\u0438\u043B\u044C: \u041F\u0438\u043A\u0441\u0435\u043B\u044C-\u0440\u0435\u0442\u0440\u043E", 'retro pixel: square corners, Arcade font, hard black outlines, 8-bit palette \u2014 use style="pixel" in any UI kit / BW.ui* component', "title", "style theme pixel"),
    k("style_horror", "style", "Horror UI", "\u0421\u0442\u0438\u043B\u044C: \u0425\u043E\u0440\u0440\u043E\u0440", 'horror: near-black, dried-blood red, Creepster titles (like Doors, Piggy) \u2014 use style="horror" in any UI kit / BW.ui* component', "title", "style theme horror"),
    k("style_tactical", "style", "Tactical shooter UI", "\u0421\u0442\u0438\u043B\u044C: \u0422\u0430\u043A\u0442\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0448\u0443\u0442\u0435\u0440", 'tactical shooter: dark olive glass, amber lines, Oswald caps (like Frontlines, Arsenal) \u2014 use style="tactical" in any UI kit / BW.ui* component', "title", "style theme tactical"),
    k("style_luxury", "style", "Luxury gold UI", "\u0421\u0442\u0438\u043B\u044C: \u041B\u044E\u043A\u0441 / \u0437\u043E\u043B\u043E\u0442\u043E", 'luxury / royal: black and gold, serif titles, thin gold outlines \u2014 use style="luxury" in any UI kit / BW.ui* component', "title", "style theme luxury"),
    // vfx
    k("portal", "vfx", "Portal", "\u041F\u043E\u0440\u0442\u0430\u043B", "glowing ring portal with swirl particles and light", "radius Color", "magic gate teleport"),
    k("magic_circle", "vfx", "Magic circle", "\u041C\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u043A\u0440\u0443\u0433", "glowing rune circle on the ground, rotating, with sparkles", "radius Color", "magic spell"),
    k("torch", "vfx", "Torch", "\u0424\u0430\u043A\u0435\u043B", "wall/stand torch with fire, smoke and flickering light", "", "fire medieval dungeon"),
    k("crystals", "vfx", "Crystals", "\u041A\u0440\u0438\u0441\u0442\u0430\u043B\u043B\u044B", "cluster of neon crystals with glow", "count Color seed", "cave magic gem"),
    k("waterfall", "vfx", "Waterfall", "\u0412\u043E\u0434\u043E\u043F\u0430\u0434", "rock cliff with falling water, mist and pool", "height", "nature water"),
    k("rain", "vfx", "Rain", "\u0414\u043E\u0436\u0434\u044C", "rain that follows the camera (LocalScript)", "", "weather storm"),
    k("snow", "vfx", "Snow", "\u0421\u043D\u0435\u0433", "snowfall that follows the camera (LocalScript)", "", "weather winter"),
    k("fireflies", "vfx", "Fireflies", "\u0421\u0432\u0435\u0442\u043B\u044F\u0447\u043A\u0438", "floating glowing fireflies over an area", "size", "night nature magic"),
    k("player_aura", "vfx", "Player aura", "\u0410\u0443\u0440\u0430 \u0438\u0433\u0440\u043E\u043A\u0430", "sparkle aura attached to every player's character", "Color", "effect vip"),
    k("fx_explosion", "vfx", "Explosion FX", "VFX: \u0412\u0437\u0440\u044B\u0432", 'fireball core, shockwave ring, smoke, embers, debris, light flash, camera shake \u2014 BrickwireVFX preset "explosion" (demo pad loops it in Play; in code VFX.play("explosion", cf))', "every scale", "vfx effect bomb blast boom"),
    k("fx_hit_spark", "vfx", "Hit spark FX", "VFX: \u0418\u0441\u043A\u0440\u044B \u0443\u0434\u0430\u0440\u0430", 'fast white-blue impact sparks + flash for melee/gun hits \u2014 BrickwireVFX preset "hit_spark" (demo pad loops it in Play; in code VFX.play("hit_spark", cf))', "every scale", "vfx effect impact combat"),
    k("fx_slash", "vfx", "Slash FX", "VFX: \u0412\u0437\u043C\u0430\u0445 \u043A\u043B\u0438\u043D\u043A\u0430", 'curved neon slash arc with trailing sparks \u2014 BrickwireVFX preset "slash" (demo pad loops it in Play; in code VFX.play("slash", cf))', "every scale", "vfx effect sword melee combat"),
    k("fx_shockwave", "vfx", "Shockwave FX", "VFX: \u0423\u0434\u0430\u0440\u043D\u0430\u044F \u0432\u043E\u043B\u043D\u0430", 'expanding ForceField ring + dust ring \u2014 BrickwireVFX preset "shockwave" (demo pad loops it in Play; in code VFX.play("shockwave", cf))', "every scale", "vfx effect impact wave"),
    k("fx_lightning", "vfx", "Lightning FX", "VFX: \u041C\u043E\u043B\u043D\u0438\u044F", 'branching neon bolt from the sky + flash + sparks \u2014 BrickwireVFX preset "lightning" (demo pad loops it in Play; in code VFX.play("lightning", cf))', "every scale", "vfx effect storm magic thunder"),
    k("fx_magic_burst", "vfx", "Magic burst FX", "VFX: \u041C\u0430\u0433\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0432\u0437\u0440\u044B\u0432", 'purple-pink arcane burst: sphere shell, sparkles, glow \u2014 BrickwireVFX preset "magic_burst" (demo pad loops it in Play; in code VFX.play("magic_burst", cf))', "every scale", "vfx effect spell magic"),
    k("fx_heal", "vfx", "Heal FX", "VFX: \u041B\u0435\u0447\u0435\u043D\u0438\u0435", 'green rising sparkles, ring and soft light \u2014 BrickwireVFX preset "heal" (demo pad loops it in Play; in code VFX.play("heal", cf))', "every scale", "vfx effect buff health"),
    k("fx_level_up", "vfx", "Level up FX", "VFX: \u041D\u043E\u0432\u044B\u0439 \u0443\u0440\u043E\u0432\u0435\u043D\u044C", 'golden pillar of light, rays, confetti sparks \u2014 BrickwireVFX preset "level_up" (demo pad loops it in Play; in code VFX.play("level_up", cf))', "every scale", "vfx effect reward levelup"),
    k("fx_ground_slam", "vfx", "Ground slam FX", "VFX: \u0423\u0434\u0430\u0440 \u043E \u0437\u0435\u043C\u043B\u044E", 'dust ring, rock debris, shockwave, shake \u2014 BrickwireVFX preset "ground_slam" (demo pad loops it in Play; in code VFX.play("ground_slam", cf))', "every scale", "vfx effect impact stomp"),
    k("fx_ice_shatter", "vfx", "Ice shatter FX", "VFX: \u041B\u0435\u0434\u044F\u043D\u043E\u0439 \u0432\u0437\u0440\u044B\u0432", 'ice shards debris, frost puff, cold light \u2014 BrickwireVFX preset "ice_shatter" (demo pad loops it in Play; in code VFX.play("ice_shatter", cf))', "every scale", "vfx effect frost freeze"),
    k("fx_teleport", "vfx", "Teleport FX", "VFX: \u0422\u0435\u043B\u0435\u043F\u043E\u0440\u0442", 'cyan-blue pillar + implosion + sparkles \u2014 BrickwireVFX preset "teleport" (demo pad loops it in Play; in code VFX.play("teleport", cf))', "every scale", "vfx effect portal blink"),
    k("fx_confetti", "vfx", "Confetti FX", "VFX: \u041A\u043E\u043D\u0444\u0435\u0442\u0442\u0438", 'colourful confetti burst for wins/rewards \u2014 BrickwireVFX preset "confetti" (demo pad loops it in Play; in code VFX.play("confetti", cf))', "every scale", "vfx effect celebrate win"),
    k("fx_vortex", "vfx", "Vortex FX", "VFX: \u0412\u0438\u0445\u0440\u044C", 'dark-purple swirling vortex with implosion \u2014 BrickwireVFX preset "vortex" (demo pad loops it in Play; in code VFX.play("vortex", cf))', "every scale", "vfx effect void portal magic"),
    k("fx_fire_burst", "vfx", "Fire burst FX", "VFX: \u041E\u0433\u043D\u0435\u043D\u043D\u044B\u0439 \u0432\u0437\u0440\u044B\u0432", 'burst of flame, embers and heat light \u2014 BrickwireVFX preset "fire_burst" (demo pad loops it in Play; in code VFX.play("fire_burst", cf))', "every scale", "vfx effect fire flame"),
    // anim
    k("cinematic_intro", "anim", "Cinematic intro", "\u041A\u0438\u043D\u0435\u043C\u0430\u0442\u043E\u0433\u0440\u0430\u0444\u0438\u0447\u043D\u043E\u0435 \u0438\u043D\u0442\u0440\u043E", "camera fly-through on join: fly-in \u2192 orbit \u2192 hero push-in \u2192 crane reveal, letterbox, fades, Skip button (BrickwireCinema); target= any model/part", "target style(intro|showcase|epic|boss|trailer) dof", "cutscene camera flythrough intro trailer"),
    k("cutscene_trigger", "anim", "Cutscene trigger", "\u041A\u0430\u0442\u0441\u0446\u0435\u043D\u0430 \u043F\u043E \u0442\u0440\u0438\u0433\u0433\u0435\u0440\u0443", "glowing pad: touching it plays a camera cutscene (once per player by default)", "target style size once", "cutscene camera boss reveal"),
    k("menu_camera", "anim", "Menu camera", "\u041A\u0430\u043C\u0435\u0440\u0430 \u043C\u0435\u043D\u044E", "slow looping orbit behind the main menu until the player presses Play (attribute InMenu=false)", "radius height time", "menu camera background orbit"),
    k("case_opening", "anim", "Case opening", "\u041E\u0442\u043A\u0440\u044B\u0442\u0438\u0435 \u043A\u0435\u0439\u0441\u0430", "CS-style case: card strip decelerates onto the SERVER-rolled reward (Cutscene.roll), rarity frames, ticks, flash, reward card + Claim; Anime Dice look (BrickwireCutscene)", "pool price currency title style(animedice|clean)", "cutscene gacha case crate loot reward rarity"),
    k("egg_hatch", "anim", "Egg hatch", "\u0412\u044B\u043B\u0443\u043F\u043B\u0435\u043D\u0438\u0435 \u044F\u0439\u0446\u0430", "egg stand with Hatch / Hatch x3: push-in, growing wobbles, cracks, flash, pet pops out with rarity glow/particles, name + rarity (server rolls)", "pool price currency eggColor style", "cutscene egg pet hatch gacha simulator"),
    k("dice_roll", "anim", "Dice roll (Anime Dice)", "\u0411\u0440\u043E\u0441\u043E\u043A \u043A\u0443\u0431\u0438\u043A\u0430 (Anime Dice)", 'ROLL/AUTO buttons \u2192 server rolls a unit ("1 in N" odds, mutations Silver/Gold/Huge/Titanic) \u2192 ticker above the head cycles fast\u2192slow, Epic+ gets a screen reveal, Mythic+ a fake ending', "pool mutations cooldown price style", "cutscene dice rng roll anime gacha rarity"),
    k("event_start", "anim", "Event start", "\u041D\u0430\u0447\u0430\u043B\u043E \u0438\u0432\u0435\u043D\u0442\u0430", 'event zone + server: countdown 3-2-1, letterbox, fly-over of the zone, "EVENT STARTED!" for all players; start via script attribute Start or every N s', "zone title every duration style", "cutscene event countdown announcement"),
    k("story_intro", "anim", "Story intro", "\u041F\u0440\u0435\u0434\u044B\u0441\u0442\u043E\u0440\u0438\u044F", "back-story on first join only (DataStore): 3\u20136 shots with typed voice-over subtitles, dips to black, music, title, Skip", "target lines speaker title sub style", "cutscene story intro lore prologue"),
    k("elevator", "anim", "Elevator", "\u041B\u0438\u0444\u0442", "moving platform elevator with shaft", "height period", "lift platform"),
    k("windmill", "anim", "Windmill", "\u041C\u0435\u043B\u044C\u043D\u0438\u0446\u0430", "windmill with spinning blades", "height speed", "farm village"),
    k("ferris_wheel", "anim", "Ferris wheel", "\u041A\u043E\u043B\u0435\u0441\u043E \u043E\u0431\u043E\u0437\u0440\u0435\u043D\u0438\u044F", "spinning ferris wheel with cabins", "radius cabins speed", "amusement park"),
    k("guard_npc", "anim", "Patrolling guard", "\u041F\u0430\u0442\u0440\u0443\u043B\u044C\u043D\u044B\u0439 NPC", "NPC rig walking a patrol route", "points speed title", "npc guard patrol"),
    k("dancer_npc", "anim", "Dancing NPC", "\u0422\u0430\u043D\u0446\u0443\u044E\u0449\u0438\u0439 NPC", "NPC rig playing a looped dance", "dance title", "npc party"),
    k("auto_door", "anim", "Automatic door", "\u0410\u0432\u0442\u043E\u0434\u0432\u0435\u0440\u044C", "sliding glass door that opens when a player approaches", "", "door shop"),
    k("flag", "anim", "Waving flag", "\u0424\u043B\u0430\u0433", "flag on a pole with waving cloth", "Color", "decor castle")
  ];
  var KIT_BY_ID = Object.fromEntries(KITS.map((x) => [x.id, x]));
  function kitsOf(kind) {
    return KITS.filter((x) => x.kind === kind);
  }
  function catalogForPrompt(kinds) {
    const lines = [];
    for (const kind of Object.keys(KIND_LABELS)) {
      if (kind === "icon") continue;
      if (kinds && !kinds.includes(kind)) continue;
      const list = kitsOf(kind).map((x) => x.opts ? `${x.id}(${x.opts})` : x.id);
      lines.push(`${KIND_LABELS[kind].en}: ${list.join(", ")}`);
    }
    if (!kinds || kinds.includes("ui")) lines.push(`Icons (BW.icon): ${ICON_IDS.join(", ")}`);
    return lines.join("\n");
  }

  // shared/src/playbooks.ts
  var BW_API_LINES = [
    ["all", `Paths & checks: BW.find(path) \u2192 inst|nil \xB7 BW.get(path) \u2192 inst or error \xB7 BW.exists(path) \xB7 BW.tree(path, depth) prints the hierarchy \xB7 BW.report(path) (counts, size, minY) \xB7 BW.check(cond, "msg")`],
    ["all", `Building: BW.model(name[, parent]) \u2192 new Model, becomes default parent; re-running replaces ONLY the agent's previous model`],
    ["all", `  BW.part{Name=, Size={x,y,z}, Position={x,y,z}, Color="#hex"|"Bright red"|{r,g,b}, Material="Wood", Class="WedgePart", Anchored=true(default), Transparency=, Orientation={x,y,z}, Parent=}`],
    ["all", `  BW.new(className, {props\u2026, Parent=}) for any class \xB7 BW.set(inst, {props}) \xB7 BW.folder(name, parent) \xB7 BW.weldAll(model, unanchor)`],
    ["all", `  placement keys for any part: At={x,y,z} = bottom-center (stands on that point) \xB7 From={x1,y1,z1}, To={x2,y2,z2} = opposite corners (BW.block)`],
    ["build", `Building kit: BW.room{At=, Size={w,h,d}, doors={{side="front"|"back"|"left"|"right", offset=0, width=4, height=7}}, windows={{side=, width=4, height=3, bottom=3}}, Color=, Material=, FloorColor=, ceiling=false}`],
    ["build", `  BW.wall({x,z}|{x,y,z}, {x,z}, {height=10, thickness=1, y=0, openings={{offset=0, width=4, height=7, bottom=0, glass=true}}}) \xB7 BW.roof{At={x,wallTopY,z}, Size={w,d}, style="gable"|"shed"|"flat", height=5, overhang=1, ridge="X"|"Z"}`],
    ["build", `  BW.stairs{From=, dir="+Z"|"-Z"|"+X"|"-X", steps=, rise=1, run=1.5, width=4} \xB7 BW.fence(a, b, {height=4, spacing=4}) \xB7 BW.cylinder{At=, height=, diameter=, axis="Y"} \xB7 BW.plant{At=, style="oak"|"pine"|"palm"|"bush", height=}`],
    ["build", `  BW.array(n, {dx,dy,dz}, function(i, offset) \u2026 end) \xB7 BW.ring(n, radius, center, function(i, pos, angleDeg) \u2026 end) \xB7 BW.palette(name) \u2192 {wall, wallMat, roof, roofMat, floor, floorMat, trim, trimMat, accent, glass}`],
    ["build", `Building v2: BW.floorplan({"#######", "#..W..#", "#.....#", "###D###"}, {At=, cell=2, height=10, palette=}) ASCII plan: # wall, D door, W window, . floor, space = nothing; row 1 = back (-Z) \u2192 rooms in one call`],
    ["build", `  BW.building{At=, Size={w,d}, floors=3, floorHeight=12, palette=, windows=3, windowWidth=4, roof="flat"|"gable"|"shed"|"none", stairs=true} multi-storey shell with slabs, stair holes, stairs, door, trims, roof; attribute BW_Top`],
    ["build", `  BW.path({{x,z},{x,z},\u2026}, {width=4, Material="Cobblestone"}) \xB7 BW.scatter({From={x,z}, To={x,z}}, n, function(i, pos, rnd) \u2026 end, {seed=1, minDist=6, avoid={paths}}) \xB7 BW.column{At=, height=, diameter=} \xB7 BW.arch({x,z}, {x,z}, {y=, thickness=1, depth=2}) \xB7 BW.rng(seed)`],
    ["build", `  BW.inspect(path) \u2192 build QA (floating / below ground / overlapping / loose parts) \xB7 BW.ground(path[, y]) \xB7 BW.move(path, {dx,dy,dz}) \xB7 BW.place(path, {x,y,z}) \xB7 BW.groundY()`],
    ["scripts", `Scripts: BW.script("Script"|"LocalScript"|"ModuleScript", name, parent|nil, [==[ source ]==]) creates or updates (default parents: ServerScriptService / StarterPlayer.StarterPlayerScripts / ReplicatedStorage)`],
    ["scripts", `  BW.lint([path]) static check of one/all scripts: deprecated APIs, wrong script type/location, loops without wait, unvalidated remotes, DataStore without pcall/BindToClose, Touched without debounce`],
    ["scripts", `  BW.source(path[, from, to]) prints numbered lines \xB7 BW.patch(path, "old text", "new text") exact replace \xB7 BW.scan("text") finds text in all scripts \xB7 BW.remote(name[, "RemoteFunction"]) in ReplicatedStorage.Remotes`],
    ["ui", `UI QA: BW.uiCheck(screen) checks desktop 1366\xD7768 + phone 390\xD7844 (off-screen, cut-off, tiny text, low contrast, small buttons, buttons without a script) \xB7 icons: BW.icon(parent, "coin"|"gem"|"heart"|\u2026, {Size=, Position=, Color=}) (vector, no upload)`],
    ["ui", `UI: BW.screen(name) \u2192 ScreenGui in StarterGui \xB7 BW.ui(class, {Parent=, Size={xs,xo,ys,yo}|{xs,ys}, Position=\u2026, BackgroundColor3="#hex", Text=, Corner=8, Stroke={"#hex",2}, Padding=8, List={Padding=6, Direction="Vertical"}, Gradient={"#a","#b"}, Aspect=1})`],
    ["uistyle", `UI styles: BW.style(name) \u2192 {bg, panel, text, accent, good, bad, font, title, corner, stroke\u2026}; styles: simulator cartoon anime glass neon fantasy minimal dark candy pixel horror tactical luxury (BW.styles() lists them)`],
    ["uistyle", `  components (all take {style=, Size=, Position=, AnchorPoint=, Name=}): BW.uiWindow(gui, {title=, header="ribbon"|"slant"|"bar"|"plain", close=true}) \u2192 window, top \xB7 BW.uiButton(parent, text, {color=, icon=, variant="primary"|"secondary"|"danger"}) 3D glossy \xB7 BW.uiIconButton(parent, icon, {badge=}) \xB7 BW.uiPanel \xB7 BW.uiTitle \xB7 BW.uiBar(parent, {value=0.6, label=}) \xB7 BW.uiPill(parent, {icon="coin", amount="1.2K", plus=true}) \xB7 BW.uiCard(parent, {title=, icon=, rarity="common"\u2026"secret", price=}) \xB7 BW.uiToggle(parent, {on=true, label=}) \xB7 BW.uiRays(parent) \xB7 BW.uiBackdrop(gui) \xB7 BW.uiJuice(gui) (hover/press bounce, window pop, toggle anims \u2014 call once per ScreenGui)`],
    ["vfx", `VFX library: BW.vfx(preset, {x,y,z}) \u2192 demo pad that loops the preset in Play + installs ReplicatedStorage.BrickwireVFX \xB7 BW.vfxPreview(preset, {x,y,z}) plays it NOW in edit (for screen_capture) \xB7 presets: ${"explosion hit_spark slash shockwave lightning magic_burst heal level_up dash ground_slam smoke_puff confetti pickup ice_shatter teleport fire_burst poison vortex"}`],
    ["vfx", `  in game scripts: local VFX = require(ReplicatedStorage.BrickwireVFX); VFX.play(preset, cframe|part|position, {color=, scale=, shake=}) \xB7 VFX.bolt(a, b, {color=}) \xB7 VFX.flash(model) \xB7 VFX.trail(part) \xB7 VFX.shake(amp, time) (client) \u2014 hits/impacts: play on the CLIENT via a RemoteEvent`],
    ["vfx", `VFX QA: BW.fxCheck(target) \u2192 emitter rates, lifetimes, lights, beams/trails attachments, totals`],
    ["vfx", `VFX: BW.particles(part, "fire"|"smoke"|"sparkles"|"magic"|"dust", {overrides}) \xB7 BW.light(part, "PointLight"|"SpotLight", {Color=, Range=, Brightness=})`],
    ["anim", `Animation (objects): BW.animate(partOrModel, "spin"|"bob"|"hover"|"swing"|"wobble"|"slide"|"pulse"|"blink", {speed=deg/s, height=, period=s, angle=, axis="X"|"Y"|"Z", hinge={x,y,z}, offset={x,y,z}, scale=}) \xB7 BW.door(part, {mode="swing"|"slide", hinge="left"|"right", angle=90, time=0.6, autoClose=4, offset={x,y,z}})`],
    ["anim", `Animation (characters): BW.rig(name, {type="R15"|"R6", Position={x,y,z}, Facing=deg, Anchored=true, DisplayName=}) \u2192 NPC \xB7 BW.joints(rig) prints joint names`],
    ["anim", `  BW.keyframes(rig, name, {{time=0, poses={RightUpperArm={x,y,z}}}, {time=0.4, poses={RightUpperArm={0,0,150}, Head={rot={0,15,0}, easing="Cubic"}}}}, {loop=true, priority="Action"}) \u2192 KeyframeSequence in ServerStorage.BrickwireAnimations (degrees, joint space)`],
    ["anim", `  BW.playAnim(rig, "wave"|"dance"|"idle"|\u2026|assetId|keyframesName, {loop=true, speed=1, name=}) \xB7 BW.patrol(npc, {{x,y,z}, "Workspace.Point2"}, {speed=8, pause=1}) walks with walk/idle anims`],
    ["anim", `  BW.playerAnims({walk=id|"preset", run=, idle=, jump=, fall=, climb=, swim=}) players' default animations \xB7 BW.toolAnim(tool, "slash"|"lunge"|id) animation on click`],
    ["anim", `Cinematics: BW.shots(target, "intro"|"showcase"|"epic"|"boss"|"trailer"|"menu") \u2192 shot list \xB7 BW.camCheck(shots) \u2192 speed/clipping/blocked view/fov/variety issues \xB7 BW.camPreview(shots, t) moves the edit camera to time t (then screen_capture) \xB7 BW.cinematic{shots=|target=, style=, mode="join"|"trigger"|"menu", trigger=part} writes the LocalScript (ReplicatedStorage.BrickwireCinema: letterbox, fades, Skip)`],
    ["anim", `  shot = {type="flyby", points={{x,y,z},\u2026}, look=target, time=5} | {type="orbit", target=, radius=, height=, from=deg, to=deg} | push_in/pull_out {target, from=dist, to=dist, angle=, height=} | crane {target, fromHeight, toHeight, turn} | reveal | dolly {from, to, look} | pan | track {subject, offset} | hold {pos, look}; common: time, ease="sine"|"cubic"|"quint"|"out"|"linear", fov=60|{70,50}, roll=deg, cut="fade", shake=0..1`],
    ["anim", `  Presets (Roblox default anims, R15/R6 auto): idle walk run jump fall climb swim wave point dance dance2 dance3 laugh cheer slash lunge`],
    ["gameplay", `Gameplay: BW.leaderstats({"Coins", Kills=0}) \xB7 BW.killPart(part[, damage]) \xB7 QA: BW.gameCheck() (spawns, remotes without handlers, leaderstats, saving)`],
    ["debug", `Debug: BW.logs(n[, "error"|"warn"|"all"]) recent Output \xB7 BW.scan("text") \xB7 BW.lint() all scripts \xB7 BW.gameCheck() \xB7 BW.uiCheck(screen) \xB7 BW.fxCheck(target) \xB7 BW.inspect(model)`],
    ["assets", `ASSET PACKS (use them OFTEN \u2014 real Roblox meshes, textures, decals, skies, sounds, VFX, ~2370 named items): find ids with the brickwire_assets tool {query="barrel", kind=mesh|texture|decal|vfx|sky|sound|part|model, pack=ndc|retro|ultimate|textures|vfx} \u2014 never guess ids \xB7 BW.asset("pack/item", {At={x,y,z}, Facing=deg, Scale=, Parent=, Name=}) \u2192 instance (skies \u2192 Lighting, sounds \u2192 SoundService) \xB7 BW.asset("textures/\u2026", {ApplyTo=part|model}) puts its Texture/Decal/SurfaceAppearance on your parts`],
    ["assetsc", `ASSET PACKS (use often): brickwire_assets {query=, kind=, pack=ndc|retro|ultimate|textures|vfx} \u2192 ids (never guess) \xB7 BW.asset(id, {At={x,y,z}, Facing=, Scale=, Parent=}) \xB7 textures/decals: BW.asset(id, {ApplyTo=part})`],
    ["all", `Rules: helpers fail with a clear "BW: \u2026" message \u2014 read it and fix. Colors accept "#RRGGBB". Sizes are studs. Changes are undoable with Ctrl+Z in Studio.`]
  ];
  var API_TOPICS = {
    general: ["all", "assets", "build", "scripts", "ui", "uistyle", "vfx", "anim", "gameplay", "debug"],
    build: ["all", "assets", "build", "vfx", "debug"],
    scripting: ["all", "assets", "scripts", "gameplay", "debug"],
    ui: ["all", "assets", "ui", "uistyle", "scripts", "debug"],
    vfx: ["all", "assets", "build", "vfx", "scripts", "debug"],
    animation: ["all", "assets", "build", "anim", "scripts", "debug"],
    gameplay: ["all", "assets", "build", "scripts", "ui", "uistyle", "gameplay", "anim", "debug"],
    debug: ["all", "assets", "scripts", "debug", "build"]
  };
  var COMPACT_TOPICS = {
    general: ["all", "assetsc", "build", "scripts", "ui"],
    build: ["all", "assetsc", "build"],
    scripting: ["all", "assetsc", "scripts", "gameplay"],
    ui: ["all", "assetsc", "ui", "uistyle", "scripts"],
    vfx: ["all", "assetsc", "vfx"],
    animation: ["all", "assetsc", "anim"],
    gameplay: ["all", "assetsc", "scripts", "gameplay", "ui"],
    debug: ["all", "assetsc", "scripts", "debug"]
  };
  function bwApiFor(category = "general", compact = false) {
    const topics = (compact ? COMPACT_TOPICS : API_TOPICS)[category] ?? API_TOPICS.general;
    return `BW helper library (available inside every <ROBLOX_LUAU> block \u2014 prefer it over raw API calls):
` + BW_API_LINES.filter(([t]) => topics.includes(t)).map(([, l]) => l).join("\n");
  }
  var BW_API = bwApiFor("general");
  var PLAYBOOKS = {
    general: `General workflow for any task:
1. ANALYZE: look before you touch \u2014 BW.tree("Workspace", 1) / search_game_tree, read scripts with BW.source before editing.
2. CHOOSE the fastest good path: a fitting RESOURCE LIBRARY kit (BW.kit) \u2192 customise it; otherwise build from scratch with the BW helpers. Mixed requests ("a village with a shop UI and coins") = several kits + glue code.
3. PLAN in numbers (sizes in studs, positions, colours as hex, script locations) in 2\u20135 bullets.
4. EXECUTE in small steps (one <ROBLOX_LUAU> block per logical step, max ~250 lines).
5. VERIFY with the category's checker \u2014 builds BW.inspect, UI BW.uiCheck, effects BW.fxCheck, scripts BW.lint, systems BW.gameCheck \u2014 fix what it lists, then <ROBLOX_AGENT_DONE>.
Category rules: buildings \u2192 anchored parts in a named Model; server code in ServerScriptService, client in StarterPlayerScripts/StarterGui; UI \u2192 ScreenGui with Scale sizes; effects \u2192 ParticleEmitter/Light on a part; motion/NPCs \u2192 BW.animate / BW.rig + BW.playAnim (visible only in Play mode).`,
    build: `BUILD playbook (parts, houses, maps) \u2014 think like a level designer, build with the kit, never raw center math:
1. ANALYZE: BW.groundY() for the ground level, BW.tree("Workspace", 1) for free space. Library first: is there a kit (cottage, modern_house, skyscraper, castle_wall, tower, park, market_stall\u2026)? Use BW.kit(id, {At=, Facing=, palette=, \u2026}) and customise instead of re-inventing.
2. PLAN in numbers: footprint W\xD7D, floors, wall height, origin, style/palette, what goes where. E.g. "Village 120\xD7120: 4 cottages Facing the plaza, well at (0,0,0), path ring r=30, 20 trees scattered outside".
3. SCALE (character \u2248 5 studs): door 4\xD77, window 4\xD73 (sill 3), floor height 12 (wall 10\u201311 + slab), walls 1 thick, stairs rise 1 / run 1.5, corridors \u2265 6, rooms \u2265 12\xD712, table 4\xD73\xD73, chair seat 2, bed 5\xD78, street 12\u201316 wide, sidewalk 4.
4. BUILD \u2014 pick the right tool:
   - whole buildings: BW.building{Size={w,d}, floors=, roof=} (slabs + stairs + windows) \xB7 interiors from a plan: BW.floorplan({"#####","#.W.#","##D##"}, {cell=2}) \xB7 single rooms: BW.room{\u2026}
   - parts of buildings: BW.wall / BW.roof / BW.stairs / BW.column / BW.arch / BW.fence; BW.block{From,To} and BW.part{At=} for pieces
   - interiors: BW.furnish(room, "bedroom"|"living"|"kitchen"|"office"|"shop") or furniture kits (table, chair, bed, sofa, bookshelf, kitchen, tv, rug, floor_lamp, potted_plant)
   - maps: BW.path(points, {width=}) for roads, BW.scatter(area, n, fn, {minDist=, avoid=}) for trees/rocks/props (seeded, no overlaps), BW.array / BW.ring for regular patterns
   - style: local P = BW.palette("medieval"|"modern"|"scifi"|"nature"|"desert"|"snow"|"japanese"|"candy"); max 3\u20134 colours + 1 accent; real materials (Brick, WoodPlanks, Slate, Concrete, Glass, Metal).
5. DETAIL pass (what makes it look professional): real props/decals/textures/skies from the ASSET PACKS (brickwire_assets \u2192 BW.asset), trims and baseboards, window frames/sills, roof ridge, chimney, porch/steps, lamps (lamp_post kit / BW.light), props, plants, a path to every door. Break symmetry: vary sizes \xB110\u201320 %, rotate props, mix 2 plant styles.
6. Big builds: one <ROBLOX_LUAU> per section (layout \u2192 shells \u2192 roofs \u2192 interiors \u2192 decor), \u2264 250 lines each; later blocks: BW.default = BW.get("Workspace.Name"). Keep a model under ~1500 parts (skyscraper floors are the expensive part).
7. VERIFY (mandatory): BW.inspect("Workspace.Name") must say floating=0 buried=0 overlaps=0 loose=0. Fix what it lists (BW.ground, BW.move, BW.place), re-inspect, then DONE with the size from BW.report.
Rules: Anchored=true (default). Physics props: BW.weldAll(model, true). Never Destroy things the user built \u2014 BW.model / BW.kit only replace the agent's own models.`,
    scripting: `SCRIPTING playbook (Script / LocalScript / ModuleScript):
1. ANALYZE: what exists (BW.tree("ServerScriptService", 2), BW.scan("Name")); read before editing (BW.source). Library systems already solve common needs \u2014 coins, round_system, saved_stats, speed/jump pads, teleporter, npc_dialog, day_night: BW.kit(id) then adapt its script with BW.patch.
2. PLAN the architecture in bullets: which scripts, where (server: ServerScriptService \xB7 client: StarterPlayer.StarterPlayerScripts or inside a ScreenGui \xB7 shared: ModuleScript in ReplicatedStorage), which RemoteEvents (BW.remote) and values.
3. WRITE with BW.script(kind, name, parent, [==[ \u2026 ]==]) (re-running updates the same script). Small edits: BW.patch(path, "exact old", "new"). Never touch scripts you were not asked about.
4. PATTERNS: services via game:GetService; Players.PlayerAdded + loop over Players:GetPlayers(); player.CharacterAdded; client: :WaitForChild for everything from the server; task.wait/task.spawn/task.delay; debounce tables per player; connections stored and disconnected; ModuleScripts return a table of functions; constants at the top (CONFIG).
5. SECURITY: the client only requests \u2014 validate every RemoteEvent argument on the server (type, range, ownership, cooldown); never trust client-sent prices or damage. DataStores only on the server, every call in pcall with retries, save on PlayerRemoving + game:BindToClose.
6. PERFORMANCE: no while true without task.wait; prefer events (Touched, Changed, Heartbeat sparingly); one loop per system, not per part.
7. VERIFY (mandatory): BW.lint() (or BW.lint(path)) \u2192 0 problems; BW.source confirms the saved code. If a play-test tool exists (start_stop_play / get_console_output), run it and read errors; otherwise BW.logs(20) after the user plays. Then DONE.`,
    ui: `UI playbook \u2014 make it look like a top Roblox game, not a default form:
1. ANALYZE: BW.tree("StarterGui", 2). Pick ONE style that fits the game (simulator / cartoon = bright, chunky, glossy; anime = bold slants; glass / minimal = clean; neon / tactical = sci-fi & shooters; fantasy / luxury = RPG; horror; pixel; candy). Ask yourself what the best games of that genre do (Pet Simulator, Blox Fruits, Adopt Me, Doors\u2026). Library: hud, shop, inventory, main_menu, dialog, notifications, settings, loading_screen, daily_reward, timer_bar \u2014 BW.kit(id, {style="simulator"}); ui_showcase / style_<name> show every component.
2. PLAN in numbers: list screens and elements with Scale sizes + anchors ("coin pill 0.16\xD70.06 top-left 2 %; shop window 0.55\xD70.65 centered; 3\xD72 card grid"). Think in 3 variants when designing something new (e.g. ribbon header + cards / slanted tabs + list / minimal glass) and pick the strongest.
3. DESIGN RULES: 8-px spacing grid (8/16/24); type scale title 28\u201340, heading 20\u201324, body 14\u201318 (never < 12 on phone); \u2264 2 fonts; colour 60-30-10 (base / panel / accent) with the accent only on the main action; rarity colours common grey \u2192 uncommon green \u2192 rare blue \u2192 epic purple \u2192 legendary gold \u2192 mythic red \u2192 secret black/rainbow; contrast \u2265 4.5:1 (text stroke on bright backgrounds); depth = gradient + 2\u20133 px stroke + darker bottom edge ("3D button"); consistent corner radius; icons with every number (BW.icon / BW.uiPill) \u2014 never invent image ids.
4. BUILD with components (BW.uiWindow, BW.uiButton, BW.uiCard, BW.uiPill, BW.uiBar, BW.uiToggle, BW.uiRays behind rewards) in the chosen style; layouts via UIListLayout/UIGridLayout, Scale for containers, UIAspectRatioConstraint for squares, buttons \u2265 44 px on phone, safe margins 2\u20134 %.
5. JUICE: BW.uiJuice(gui) once per ScreenGui (hover grow 1.05, press 0.95, window pop-in 0.2 s Back, toggle slide); counters bump on change; rewards get rays + scale-in; tweens 0.15\u20130.3 s, Quad/Back Out. Logic: LocalScript in the ScreenGui, Activated, one window open at a time, purchases via a validated RemoteFunction.
6. VERIFY (mandatory): BW.uiCheck("StarterGui.Name") \u2192 fix every issue (off-screen on phone, cut-off/tiny text, low contrast, small buttons, buttons without script), re-check until OK; if screen_capture exists, look at the result and polish spacing/alignment. Then DONE.`,
    vfx: `VFX playbook \u2014 readable, layered, punchy 3D effects:
1. ANALYZE the target (BW.report(path)). Library: fx_* presets via BW.vfx / BrickwireVFX (explosion, hit_spark, slash, shockwave, lightning, magic_burst, heal, level_up, ground_slam, ice_shatter, teleport, confetti, vortex, fire_burst, dash, pickup, poison, smoke_puff) + ambient kits portal, magic_circle, torch, crystals, waterfall, rain, snow, fireflies, player_aura + mesh VFX of the vfx pack (shockwaves, slashes, waves: BW.asset then tween Size/Transparency).
2. DESIGN in 3 beats: ANTICIPATION (0.05\u20130.2 s: implosion, charge glow) \u2192 IMPACT (flash: bright core, light pulse, shell/ring expanding, sparks, camera shake 0.3\u20130.8) \u2192 DISSIPATION (smoke, embers, debris that fall, 0.5\u20132 s fade). Every effect = 3\u20136 layers with different size/speed/lifetime: core + secondary + accents + light. Shape language: sharp/fast = combat, round/slow = magic/heal.
3. CURVES: Size big\u2192small (or ring 0\u2192max), Transparency 0\u21921 with an ease (keypoints {0,0},{0.7,0.3},{1,1}), Color hot\u2192cool (white core \u2192 hue \u2192 dark), LightEmission 1 for glows / 0 for smoke, Drag 3\u20138 for bursts that slow down, Acceleration for gravity on sparks/debris, SpreadAngle + Rotation/RotSpeed random ranges, ZOffset for core in front; flash via emitter:Emit(n) instead of Rate for bursts.
4. COLOUR: 2\u20133 related hues + white core (fire #FFF3B0\u2192#FF8A00\u2192#5A1E00; magic #FFFFFF\u2192#B46CFF\u2192#3A0F7A; ice #FFFFFF\u2192#9FE8FF\u2192#2E6FA8); the light matches the particles.
5. PERFORMANCE: bursts Emit \u2264 80 per layer, Rate \u2264 60, Lifetime \u2264 3 s, \u2264 40 emitters per area, shells/debris cleaned with Debris, lights Range \u2264 30, Shadows off; impacts on the CLIENT (RemoteEvent \u2192 VFX.play) so the server stays light.
6. VERIFY (mandatory): BW.fxCheck(path) \u2192 fix warnings; BW.vfxPreview(preset, pos) + screen_capture if available to see the frame; say that looping demos/bursts need Play. Then DONE.`,
    animation: `ANIMATION playbook (moving objects, doors, NPCs, character animations):
- Library first: elevator, windmill, ferris_wheel, auto_door, flag, guard_npc, dancer_npc, cinematic_intro, cutscene_trigger, menu_camera \u2014 BW.kit then adjust.
- Gacha/reveal cutscenes: kits case_opening, egg_hatch, dice_roll (Anime Dice), event_start, story_intro; server rolls, Skip on, BW.cutsceneCheck; brickwire_guide {"topic":"cutscene"}.
- CAMERA / CUTSCENES (BrickwireCinema): think like a film-maker. Start wide (establishing flyby, high, FOV 65\u201375) \u2192 medium (orbit/track, FOV 55\u201365) \u2192 close (push_in, FOV 40\u201355) \u2192 end on a reveal/crane up. 3\u20136 shots of 2\u20136 s, total 8\u201325 s; vary shot types and directions; smooth ease (sine/cubic) inside a shot, cuts or cut="fade" between; keep the subject on a third of the frame (focus={x,y,z} offset), horizon level (roll \u2264 8\xB0, only for tension); foreground objects passing the lens give parallax; never fly through walls. Use BW.shots(target, style) as a base, edit numbers, BW.camCheck(shots) \u2192 0 issues, BW.camPreview(shots, t) + screen_capture at 2\u20133 times, then BW.cinematic{shots=\u2026}. Letterbox + Skip stay on.
- Decide the kind: (a) OBJECT motion (coins, fans, platforms, lamps, doors) \u2192 BW.animate / BW.door, no assets needed; (b) CHARACTER animation (NPC waves, dances, walks; player walk/run style) \u2192 rig + Animator.
- Objects: BW.animate(target, preset, {...}) writes a server Script "BW_Anim_<preset>" inside the target and anchors it. One motion per object (a new preset replaces the old). Combine by animating different objects (spin the blades, bob the whole Model). Pendulums/lamps: swing with hinge={0, h/2, 0}. Platforms: slide {offset={0,0,20}, period=6}. Hazards: spin {speed=180}. Collectibles: hover.
- Doors: separate door part; BW.door(part, {hinge="left"|"right", angle=90}) adds a ProximityPrompt; slide mode for gates/elevators ({mode="slide", offset={0,-8,0}}).
- Characters: BW.rig("Name", {Position={x,3,z}, Facing=180}) (R15 default). Before keyframing run BW.joints(rig) \u2014 pose only the joint names it prints.
- Ready animations: BW.playAnim(rig, "wave"|"dance"|"cheer"|"laugh"|"point"|"idle"\u2026) \u2014 public default animations, R15/R6 automatic. Walking NPC: BW.patrol(npc, points, {speed=8}).
- Custom: BW.keyframes(rig, "Name", frames, {loop=true}) \u2014 degrees {x,y,z} relative to rest, 3\u20138 keyframes, first = last for loops, 0.2\u20130.5 s apart, easing "Cubic", anticipation + overshoot for life (small counter-move before a big move), head 10\u201320\xB0, arm raise 90\u2013160\xB0 on Z (R15 RightUpperArm), legs \xB130\xB0 on X. BW.playAnim(rig, "Name") previews in a Studio play test. HONEST LIMIT: for a published game the user must publish the KeyframeSequence (ServerStorage.BrickwireAnimations \u2192 Save to Roblox) and you play that id.
- Player animations: BW.playerAnims({walk="run", idle=ID}); tools: Handle part + BW.toolAnim(tool, "slash"). Only use ids the user gave you or the presets.
- VERIFY (mandatory): BW.tree(target, 2) shows the BW_* script; BW.lint(path of the script) \u2192 0 problems; for keyframes the BW_ANIM line; say clearly that motion is visible only in Play/Run mode (F5/F8).`,
    gameplay: `GAMEPLAY playbook (systems: stats, currency, items, rounds, obbies, NPCs):
1. ANALYZE what already exists (BW.gameCheck() lists spawns, leaderstats, remotes, saving). Library systems: obby (stages + checkpoints), kill_bricks, lava_floor, jump_pad, speed_pad, teleporter, coins, spawn_area, round_system, saved_stats, day_night, npc_dialog \u2014 plus UI kits hud, shop, daily_reward, timer_bar. Compose them: e.g. simulator = coins + saved_stats + hud + shop.
2. DESIGN the loop in 3\u20136 bullets: goal, actions, rewards, progression, fail state; then the pieces (server scripts, RemoteEvents, values, UI) and where each lives.
3. NUMBERS: walk speed 16, jump power 50 (\u22487 studs high), obby gaps 6\u201310 studs (max ~12), platforms \u2265 4\xD74, checkpoints every 3\u20135 jumps, round 60\u2013180 s + intermission 10\u201320 s, prices rising \xD71.5\u20132 per tier, first reward within 30 s.
4. RULES: the server owns stats, damage, currency, rounds; the client only requests (RemoteEvent/RemoteFunction) and displays. Validate everything on the server, debounce Touched per player, respawn collectibles, clean up on PlayerRemoving. DataStores: pcall + retries, save on leave + BindToClose + autosave; tell the user to enable "Studio Access to API Services" to test saving.
5. BUILD in steps: world pieces (kits) \u2192 server systems \u2192 UI \u2192 wiring; keep shared state in ReplicatedStorage Values (RoundStatus) so UI can show it.
6. VERIFY (mandatory): BW.gameCheck() \u2192 no issues; BW.lint() \u2192 0 problems; BW.uiCheck for new UI; if a play-test tool exists, run it and read the console. Then DONE.`,
    debug: `DEBUG / FIX playbook:
1. Collect evidence: BW.logs(30) (recent errors/warnings), get_console_output if available, and the exact error line "Script:LINE: message". Static scan: BW.lint() finds common bugs in all scripts in one call; BW.gameCheck() finds missing spawns/handlers; BW.uiCheck / BW.inspect for UI/builds.
2. Locate: BW.source(path, line-10, line+10) around the failing line; BW.scan("name") to find where a value/function is defined or used.
3. Explain the ROOT cause in one sentence (nil index \u2192 object not found/not loaded yet; "is not a valid member" \u2192 wrong name/path or client/server mismatch; infinite yield \u2192 WaitForChild on a missing child; nothing happens \u2192 script disabled/in the wrong container/LocalScript where it cannot run).
4. Fix minimally with BW.patch(path, "old", "new") \u2014 do not rewrite working code. Common fixes: :WaitForChild on the client, nil checks, correct service/path names, task.wait in loops, move a script to the right container, add server validation.
5. VERIFY: BW.lint(path) \u2192 0 problems, BW.source shows the fix; run a play test if a play tool exists and confirm the error is gone from BW.logs, then DONE with the cause + fix.`
  };
  function notionSection(opts) {
    return `NOTION MODE (you are Notion AI, running inside the user's Notion workspace):
- Studio work happens ONLY through <ROBLOX_TOOL_CALL> / <ROBLOX_LUAU> blocks written as plain text in your chat reply. Your Notion actions (creating/editing pages, databases, search) can NOT touch Roblox Studio \u2014 never use them instead of a tool call, and never claim a Studio change that you did not get a <ROBLOX_TOOL_RESULT> for.
- Write the blocks as text in this chat (not into a page, not into a code-only artifact), each in a fenced code block, then stop and wait for my results.
- Use Notion for what it is good at:
  \u2022 SPECS: when I mention a page (@page, link or title) with a game design / level layout / feature list, read it with your Notion abilities first, turn it into a numbered build plan, then implement it in Studio step by step and verify each step.
  \u2022 TASKS: if I ask, keep a checklist/database of the game's tasks and tick items off only after the Studio result confirms them.
  \u2022 ASSETS & NUMBERS: take sizes, colours, prices, stats from the spec page exactly; ask me if the spec is ambiguous.
${opts.devLog ? `- DEV LOG is ON: after every verified <ROBLOX_AGENT_DONE> add a short entry to a Notion page "Roblox Dev Log" (create it once if it does not exist): date, what changed, the Studio paths you created/edited (e.g. Workspace.Cottage, ServerScriptService.Coins), and how it was verified. Keep entries short, newest first. Do this with your Notion abilities AFTER the Studio work, never instead of it.` : `- DEV LOG is OFF: do not create or edit Notion pages unless I ask.`}
- Keep chat replies compact: the tool blocks plus one or two sentences.`;
  }
  var LIBRARY_KINDS = {
    general: ["build", "furniture", "gameplay", "ui", "vfx", "anim"],
    build: ["build", "furniture", "vfx", "anim"],
    scripting: ["gameplay"],
    ui: ["ui", "style"],
    vfx: ["vfx"],
    animation: ["anim", "gameplay"],
    gameplay: ["gameplay", "ui", "build"],
    debug: []
  };
  function librarySection(category = "general", compact = false) {
    const kinds = LIBRARY_KINDS[category] ?? LIBRARY_KINDS.general;
    const head = `RESOURCE LIBRARY (ready-made, tested resources \u2014 use them to be fast, then customise):
- BW.kit(id, {At={x,y,z} (bottom-center on the ground), Facing=deg, Name=, Parent=, palette=, style="simulator"|"cartoon"|"glass"|"neon"|\u2026 (UI kits), \u2026options}) builds one and prints "BW_KIT id \u2192 path parts=N size=\u2026". BW.kits([category]) prints the full catalog with options.
- Start from a fitting kit whenever the request matches one (even partly), then adapt it with normal BW code (move, recolour, add parts, BW.patch its script). Several kits + glue code = a whole game area in a few blocks. Nothing fits \u2192 build from scratch.
- If I say "exactly like the library X" use BW.kit unchanged; "something like X" = your own variation (different layout/details, same purpose and style).`;
    if (!kinds.length) return `RESOURCE LIBRARY: BW.kits() prints ready-made kits (BW.kit(id, {At=\u2026})) \u2014 useful to rebuild a broken system quickly.`;
    const cat = compact ? catalogForPrompt(kinds).replace(/\([^)]*\)/g, "") : catalogForPrompt(kinds);
    if (compact)
      return `RESOURCE LIBRARY: BW.kit(id, {At={x,y,z}, Facing=deg, Name=, palette=, style=\u2026}) builds a tested kit (prints "BW_KIT id \u2192 path"); BW.kits() lists options. Start from a fitting kit and customise it; nothing fits \u2192 build from scratch.
${cat}`;
    return `${head}
${cat}`;
  }

  // shared/src/instructions.ts
  var CATEGORY_INFO = {
    general: { label: "General", hint: "Any Studio task", focus: PLAYBOOKS.general },
    build: { label: "Build", hint: "Parts, models, maps, terrain", focus: PLAYBOOKS.build },
    scripting: { label: "Scripting", hint: "Scripts, LocalScripts, modules", focus: PLAYBOOKS.scripting },
    ui: { label: "UI", hint: "ScreenGui, menus, HUD", focus: PLAYBOOKS.ui },
    vfx: { label: "VFX", hint: "Particles, lights, effects", focus: PLAYBOOKS.vfx },
    animation: { label: "Animation", hint: "Moving objects, doors, NPCs, character animations", focus: PLAYBOOKS.animation },
    gameplay: { label: "Gameplay", hint: "Systems: leaderstats, items, rounds", focus: PLAYBOOKS.gameplay },
    debug: { label: "Debug / Fix", hint: "Find and fix errors", focus: PLAYBOOKS.debug }
  };
  function sig(schema) {
    const props = schema?.properties ?? {};
    const req = new Set(schema?.required ?? []);
    const parts = Object.entries(props).filter(([k2]) => k2 !== "studio_id").map(([k2, s]) => {
      const t = Array.isArray(s.type) ? s.type.join("|") : s.type ?? "any";
      const en = s.enum ? `:${s.enum.slice(0, 5).join("|")}` : "";
      return `${k2}${req.has(k2) ? "" : "?"}:${t}${en}`;
    });
    return parts.join(", ");
  }
  var FILES_HINT = `Files: get anything you need yourself \u2014 file_fetch {url} downloads images, textures, sounds, music, fbx/glb/rbxm models, videos, web pages \u2192 fileId; file_show {fileIds} attaches files to this chat so you can SEE them; file_upload_roblox {fileId} \u2192 Roblox asset id; file_to_studio {fileId, parent?} puts it into Studio (Lua \u2192 Script/LocalScript/ModuleScript, image \u2192 Decal/ImageLabel, sound \u2192 Sound, model \u2192 inserted model). To write a whole file (script, JSON, CSV, OBJ\u2026) straight into Studio, use a raw file block \u2014 no JSON escaping, any length:
<${MARKERS.FILE} name="Shop.server.lua" to="game.ServerScriptService">
\u2026file content\u2026
</${MARKERS.FILE}>
(to= is optional; *.server.lua \u2192 Script, *.client.lua \u2192 LocalScript, other .lua \u2192 ModuleScript). Files the user attaches are listed with their fileId. Use only content the user may use (check licenses).`;
  var CONNECT_HINT = `Blender & Figma: when the user mentions Blender, call blender_status; blender_scene reads the open scene, blender_python edits it (bpy), blender_render shows you a picture, blender_export brings the selection into Brickwire (fbx/glb \u2192 file_upload_roblox \u2192 file_to_studio, OBJ \u2192 artifact_studio_import), blender_import sends a fileId/artifact into Blender. For Figma: figma_inspect {url} (figma.com link with node-id) or a pushId the user sent from the Brickwire Figma plugin, then figma_to_studio builds it as a real ScreenGui; figma_export saves icons/images. Results are shown in the Brickwire app chat automatically.`;
  function newToolsNotice(tools) {
    const list = tools.filter((t) => t.available);
    if (!list.length) return "";
    return `[Brickwire] New tools are available now \u2014 call them like the others:
${toolCatalog(list)}${list.some((t) => t.name === "file_fetch") ? "\n" + FILES_HINT : ""}${list.some((t) => t.name === "blender_status") ? "\n" + CONNECT_HINT : ""}`;
  }
  function toolCatalog(tools) {
    return tools.filter((t) => t.available).map((t) => {
      const d = t.description.replace(/\s+/g, " ").slice(0, 150);
      const risk = t.risk === "read" ? "" : t.risk === "write" ? " [write]" : " [destructive]";
      return `- ${t.name}(${sig(t.inputSchema)})${risk} \u2014 ${d}`;
    }).join("\n");
  }
  function superSection(compact) {
    if (compact)
      return `SUPER MODE ON \u2014 quality over speed: first read brickwire_guide {"topic":"super"} and follow it (variants + <${MARKERS.ASK}> if open, design doc + acceptance checklist, phased build with a checker per phase, screen_capture review, fix the 5 weakest points, report every checklist item).`;
    return `SUPER MODE is ON \u2014 I want an outstanding result, not a fast one. Work like a senior Roblox studio:
1. Before starting read brickwire_guide {"topic":"super"} and the guide of the task's topic (camera / animation / gameplay / ui / vfx / build / scripting).
2. THINK: goal in one line, the player's experience second by second, what the best games of the genre do; open task \u2192 2\u20133 strong, different variants with effort + your recommendation, end with <${MARKERS.ASK}> and wait.
3. Inspect deeply, then write a short design doc: layout with numbers, systems and where each script lives, pack assets you will use (brickwire_assets), an acceptance checklist of 5\u201310 testable items.
4. Build in phases \u2014 blockout \u2192 structure \u2192 detail & pack assets \u2192 lighting/atmosphere/sky \u2192 VFX & sound \u2192 UI \u2192 scripts/wiring \u2014 one block per phase, its checker right after.
5. Look at the result (screen_capture from several angles if available, play test if available), list the 5 weakest points honestly (flat areas, dull lighting, no feedback, tiny text, missing sounds\u2026), fix them, re-verify.
6. Report each acceptance item and how it was verified. Never stop at "good enough" while a check fails.`;
  }
  function buildAgentPrompt(p) {
    const full = renderPrompt(p, false);
    if (!p.maxChars || full.length <= p.maxChars - 400) return full;
    return renderPrompt(p, true);
  }
  function renderPrompt(p, compact) {
    const C = MARKERS.TOOL_CALL;
    const R = MARKERS.TOOL_RESULT;
    const D2 = MARKERS.DONE;
    const hasLuau = p.tools.some((t) => t.name === "execute_luau" && t.available);
    const L = MARKERS.LUAU;
    const focus = CATEGORY_INFO[p.category ?? "general"]?.focus ?? PLAYBOOKS.general;
    return `[Roblox Agent \u2014 session ${p.sessionId}]
You are now connected to my LIVE Roblox Studio through a local bridge. You can read and change my open place, but ONLY by writing tool calls in exactly this format (inside a code block, valid JSON, double quotes, newlines inside strings written as \\n):

\`\`\`json
<${C}>
{"id":"c1","tool":"search_game_tree","args":{"path":"game.Workspace","max_depth":1}}
</${C}>
\`\`\`

Rules:
1. After writing tool calls, STOP and wait. I will reply with <${R}> blocks containing the REAL output from Studio. Never write <${R}> yourself and never guess results.
2. Up to 5 calls per message, each in its own block, each with a unique "id".
3. Inspect before changing anything. After a change, verify it with a read tool.${hasLuau ? `
4. To run Luau (create, modify or delete instances, write scripts) do NOT put code in JSON. Write a raw block instead \u2014 plain Luau, no escaping, any length:

\`\`\`lua
<${L} mode="Edit">
local m = BW.model("Tower")
BW.part({Name = "Base", Size = {8, 1, 8}, Position = {0, 0.5, 0}, Color = "Medium stone grey", Parent = m})
BW.report(m)
</${L}>
\`\`\`
   It runs as execute_luau (mode Edit; use mode="Server" only during a play test). Always close it with </${L}>. Use print() to report values. The BW helper library (below) is preloaded in every block \u2014 prefer it over raw Instance.new. If the code is very long, split it into several blocks (max ~250 lines each) and send them one reply at a time.` : ""}
5. Paths use dot notation from game, e.g. game.Workspace.Model.Part.
6. When the task is finished and verified, answer me in plain text and end with <${D2}>{"summary":"short summary"}</${D2}>
7. Do not use your own built-in tools, canvas, artifacts or code interpreters for Studio work \u2014 only <${C}>.
8. THINK FIRST like a senior Roblox developer: restate the goal, inspect what exists. Big, vague or taste-dependent request \u2192 ask 1\u20133 short questions (with defaults) and/or offer 2\u20133 concrete variants (A/B/C, effort, your pick), end with <${MARKERS.ASK}> and wait. Clear or "just do it" \u2192 build. Expert guides: brickwire_guide {"topic":"camera"|"animation"|"gameplay"|\u2026}.

${p.tools.some((t) => t.name === "file_fetch" && t.available) ? FILES_HINT + "\n\n" : ""}${p.tools.some((t) => t.name === "blender_status" && t.available) ? CONNECT_HINT + "\n\n" : ""}Available tools (studio_id is filled in automatically):
${toolCatalog(p.tools)}
${hasLuau ? `
${bwApiFor(p.category ?? "general", compact)}

${librarySection(p.category ?? "general", compact)}
` : ""}
${focus}
${p.superMode ? `
${superSection(compact)}
` : ""}${p.providerId === "notion" ? `
${notionSection({ devLog: !!p.notionLog })}
` : ""}${p.memorySummary ? `
Project memory:
${p.memorySummary}
` : ""}
${p.task ? `User task:
${p.task}` : `Reply with one short sentence confirming you are ready, then wait for my task. Do not call tools yet.`}`;
  }
  var THUMB_KEY = /^(thumbnails?|thumbnail_?url|thumb(_?url)?|image_?url|preview_?(url|image)?|icon_?url|images|screenshot_?url)$/i;
  var DESC_KEY = /^(description|desc|details|summary|about)$/i;
  var FREE_ASSET_URL = /^https?:\/\/(www\.|create\.)?roblox\.com\/(store|marketplace|library|catalog)\b|^https?:\/\/(t\d|tr)\.rbxcdn\.com\//i;
  var DESC_MAX = 240;
  function slimResult(value, seen = /* @__PURE__ */ new Set()) {
    const walk = (v, key2, depth) => {
      if (depth > 24) return v;
      if (typeof v === "string") {
        if (/^data:[a-z]+\/[\w.+-]+;base64,/i.test(v)) return void 0;
        if (FREE_ASSET_URL.test(v.trim())) return void 0;
        if (DESC_KEY.test(key2) && v.length > DESC_MAX) return v.slice(0, DESC_MAX) + "\u2026";
        const t = v.trim();
        if (t.length > 2 && (t[0] === "{" || t[0] === "[")) {
          try {
            return JSON.stringify(walk(JSON.parse(t), key2, depth + 1));
          } catch {
          }
        }
        return v;
      }
      if (Array.isArray(v)) return v.map((x) => walk(x, key2, depth + 1)).filter((x) => x !== void 0);
      if (v && typeof v === "object") {
        const out = {};
        for (const [k2, x] of Object.entries(v)) {
          if (THUMB_KEY.test(k2)) continue;
          if (/^next_?steps$/i.test(k2) && x != null) {
            const sig2 = JSON.stringify(x);
            if (seen.has(sig2)) continue;
            seen.add(sig2);
          }
          const y = walk(x, k2, depth + 1);
          if (y !== void 0) out[k2] = y;
        }
        return out;
      }
      return v;
    };
    return walk(value, "", 0);
  }
  function formatToolResults(results, maxChars, footer) {
    const budget = Math.max(2e3, maxChars - 600);
    const per = Math.floor(budget / Math.max(1, results.length));
    const seen = /* @__PURE__ */ new Set();
    const blocks = results.map((r) => {
      const payload = { id: r.id, status: r.status, result: slimResult(r.result ?? null, seen) ?? null };
      if (r.error) payload.error = r.error;
      let json = JSON.stringify(payload);
      if (json.length > per) {
        const resultStr = typeof payload.result === "string" ? payload.result : JSON.stringify(payload.result);
        const keep = Math.max(200, per - 300 - (r.error?.length ?? 0));
        payload.result = resultStr.slice(0, keep) + `\u2026[truncated ${resultStr.length - keep} chars \u2014 narrow the query (path/depth/line range)]`;
        json = JSON.stringify(payload);
      }
      return `<${MARKERS.TOOL_RESULT}>
${json}
</${MARKERS.TOOL_RESULT}>`;
    });
    const anyFail = results.some((r) => r.status !== "success");
    const tail = footer ?? (anyFail ? `Some calls failed. Read the error, fix the problem and continue with <${MARKERS.TOOL_CALL}>.` : `Continue with the next <${MARKERS.TOOL_CALL}>, or, if the task is complete and verified, answer and end with <${MARKERS.DONE}>.`);
    return blocks.join("\n") + "\n" + tail;
  }
  var REMINDERS = {
    noTools: `[Roblox Agent] Reminder: you are connected to my Roblox Studio. To act, write <${MARKERS.TOOL_CALL}> blocks (JSON inside a code block) and wait for the results. If you are finished, end with <${MARKERS.DONE}>.`,
    untagged: `[Roblox Agent] Your Luau code was NOT executed \u2014 it has no tag. Studio runs code only inside a tag. Re-send it as:
${"```"}lua
<${MARKERS.LUAU}>
\u2026your code\u2026
</${MARKERS.LUAU}>
${"```"}
(or a <${MARKERS.TOOL_CALL}> JSON block) and wait for the result. If that code was only an example for me, reply "ok".`,
    unverified: `[Roblox Agent] You reported done, but the last change was not verified. Verify it with a read tool (e.g. search_game_tree / inspect_instance) and then end with <${MARKERS.DONE}>.`,
    forged: `[Roblox Agent] You wrote a <${MARKERS.TOOL_RESULT}> yourself. Results come only from Studio \u2014 nothing was executed. Write <${MARKERS.TOOL_CALL}> and wait.`,
    truncated: `[Roblox Agent] Your last block was cut off (no closing tag / incomplete JSON) \u2014 nothing was executed. Re-send it complete. For long Luau use <${MARKERS.LUAU}> \u2026 </${MARKERS.LUAU}> and split it into parts of ~250 lines, one per reply.`,
    category: (label, focus) => `[Roblox Agent] Category switched to ${label}. ${focus || "No special focus."} Reply "ok" and continue with my next request.`,
    invalid: (problems) => `[Roblox Agent] Invalid <${MARKERS.TOOL_CALL}>: ${problems.join("; ")}. Fix the JSON (double quotes, \\n for newlines) and re-send.`,
    tooMany: (n) => `[Roblox Agent] Only the first ${n} calls were executed; re-send the rest after reviewing these results.`
  };

  // extension/src/core/clock.ts
  var waiters = /* @__PURE__ */ new Set();
  var intervals = /* @__PURE__ */ new Set();
  var port = null;
  var lastTick = 0;
  function pump() {
    const now = Date.now();
    for (const w of Array.from(waiters)) {
      if (now >= w.at) {
        waiters.delete(w);
        w.fn();
      }
    }
    for (const iv of intervals) {
      if (now >= iv.next) {
        iv.next = now + iv.every;
        try {
          iv.fn();
        } catch {
        }
      }
    }
  }
  function connect() {
    try {
      port = chrome.runtime.connect({ name: "bw-clock" });
      port.onMessage.addListener(() => {
        lastTick = Date.now();
        pump();
        try {
          port?.postMessage(1);
        } catch {
        }
      });
      port.onDisconnect.addListener(() => {
        port = null;
        void chrome.runtime.lastError;
        setTimeout(connect, 1e3);
      });
    } catch {
      port = null;
    }
  }
  function startClock() {
    if (port || typeof chrome === "undefined" || !chrome.runtime?.connect) return;
    connect();
  }
  function clockAlive() {
    return Date.now() - lastTick < 2e3;
  }
  function sleep(ms) {
    return new Promise((resolve) => {
      let done = false;
      const w = {
        at: Date.now() + ms,
        fn: () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          resolve();
        }
      };
      const t = setTimeout(() => {
        waiters.delete(w);
        w.fn();
      }, ms);
      waiters.add(w);
    });
  }
  function every(ms, fn) {
    const iv = { every: ms, next: Date.now() + ms, fn };
    intervals.add(iv);
    const t = setInterval(() => {
      if (Date.now() >= iv.next) {
        iv.next = Date.now() + ms;
        fn();
      }
    }, ms);
    return () => {
      intervals.delete(iv);
      clearInterval(t);
    };
  }

  // extension/src/adapters/dom.ts
  function isVisible(el) {
    if (!el || !(el instanceof HTMLElement) || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  }
  function queryFirst(selectors, root = document, visibleOnly = true) {
    for (const s of selectors) {
      let list;
      try {
        list = root.querySelectorAll(s);
      } catch {
        continue;
      }
      for (const el of Array.from(list)) if (!visibleOnly || isVisible(el)) return el;
    }
    return null;
  }
  function queryAll(selectors, root = document) {
    const seen = /* @__PURE__ */ new Set();
    for (const s of selectors) {
      try {
        root.querySelectorAll(s).forEach((e) => seen.add(e));
      } catch {
      }
    }
    const arr = Array.from(seen).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    return arr.filter((e) => !arr.some((o) => o !== e && o.contains(e)));
  }
  function findComposerSemantic(exclude) {
    const cands = Array.from(
      document.querySelectorAll('textarea, [contenteditable="true"][role="textbox"], div.ProseMirror[contenteditable="true"], [contenteditable="true"][data-lexical-editor="true"], .ql-editor[contenteditable="true"]')
    ).filter((e) => isVisible(e) && !(exclude && exclude.contains(e)) && !e.closest("[data-brickwire-host]"));
    if (!cands.length) return null;
    const score = (e) => {
      const r = e.getBoundingClientRect();
      const label = (e.getAttribute("placeholder") ?? "") + (e.getAttribute("aria-label") ?? "") + (e.getAttribute("data-placeholder") ?? "");
      return r.bottom / window.innerHeight + (/(message|ask|prompt|chat|send|сообщ|спрос)/i.test(label) ? 1 : 0) + (e.tagName === "TEXTAREA" ? 0.2 : 0);
    };
    return cands.sort((a, b) => score(b) - score(a))[0];
  }
  var SEND_LABEL = /(send|submit|отправ|发送|送信)/i;
  function findSendButton(composer, selectors) {
    const byConfig = queryFirst(selectors);
    if (byConfig) return byConfig;
    let scope = composer;
    for (let i = 0; i < 6 && scope; i++) {
      scope = scope.parentElement;
      if (!scope) break;
      const btns = Array.from(scope.querySelectorAll('button, [role="button"]')).filter(isVisible);
      const hit = btns.find((b) => SEND_LABEL.test((b.getAttribute("aria-label") ?? "") + (b.getAttribute("title") ?? "") + (b.getAttribute("data-testid") ?? "") + (b.id ?? "")));
      if (hit) return hit;
      const submit = btns.find((b) => b.getAttribute("type") === "submit");
      if (submit) return submit;
    }
    return null;
  }
  function isDisabled(el) {
    return el.disabled === true || el.getAttribute("aria-disabled") === "true" || el.hasAttribute("disabled");
  }
  var core = (s) => (s ?? "").replace(/[^\p{L}\p{N}]+/gu, "");
  async function setComposerText(el, text, opts = {}) {
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      setter ? setter.call(el, text) : el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return el.value === text;
    }
    const want = core(text).length;
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
    selectAll();
    let ok = false;
    try {
      ok = document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    await tick();
    if (!inserted()) {
      await tick(120);
      if (!inserted()) {
        try {
          selectAll();
          const dt = new DataTransfer();
          dt.setData("text/plain", text);
          el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
          await tick(150);
        } catch {
        }
      }
    }
    if (opts.allowRawWrite !== false && normalize(el.innerText).length < Math.min(20, normalize(text).length)) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      await tick();
    }
    return opts.allowRawWrite === false ? inserted() || normalize(el.innerText).length >= Math.min(20, normalize(text).length) : normalize(el.innerText).length > 0;
  }
  function composerText(el) {
    if (!el) return "";
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
    return el.innerText ?? el.textContent ?? "";
  }
  var normalize = (s) => (s ?? "").replace(/\s+/g, " ").trim();
  var tick = (ms = 30) => sleep(ms);
  function pressEscape(el) {
    const opts = { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }
  function pressEnter(el) {
    const opts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent("keydown", opts));
    el.dispatchEvent(new KeyboardEvent("keypress", opts));
    el.dispatchEvent(new KeyboardEvent("keyup", opts));
  }
  var BLOCK = /* @__PURE__ */ new Set(["P", "DIV", "LI", "UL", "OL", "PRE", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "TR", "TABLE", "SECTION", "ARTICLE", "BR", "HR"]);
  var SKIP = /(line-?numbers?|linenumber|hljs-ln-n|copy|toolbar|code-?header|sr-only)/i;
  function extractText(node) {
    let out = "";
    const walk = (n) => {
      if (n.nodeType === Node.TEXT_NODE) {
        out += n.nodeValue ?? "";
        return;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return;
      const el = n;
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
  function hashText(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36) + ":" + s.length;
  }

  // extension/src/adapters/base.ts
  var STOP_LABEL = /(stop|остановить|停止|中止)/i;
  var StreamMeter = class {
    node = null;
    max = -1;
    at = 0;
    sample(node, len) {
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
    grewWithin(ms) {
      return this.max > 0 && Date.now() - this.at < ms;
    }
  };
  var MARK_RE = /\[bw[:\-]([a-z0-9]{5})\]\s*$/;
  var MARK_ANY = /\[bw[:\-]([a-z0-9]{5})\]/;
  var markXPath = (m) => `//text()[contains(., 'bw-${m}]') or contains(., 'bw:${m}]')]`;
  function newMarkerId() {
    const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }
  var MARK_STORE = "bw_markers";
  var GenericDomAdapter = class {
    meter = new StreamMeter();
    panelHost = null;
    /** markers of messages WE sent in this tab (survive reloads via sessionStorage) */
    sent = (() => {
      try {
        return JSON.parse(sessionStorage.getItem(MARK_STORE) ?? "[]");
      } catch {
        return [];
      }
    })();
    usingMarkers = false;
    /** Ring buffer of send steps — shown by Site check, so "sometimes it does not send" can be traced. */
    sendLog = [];
    /** markers whose send WE confirmed (see AdapterConfig.trustAcceptedSend) */
    acceptedMarks = /* @__PURE__ */ new Set();
    /** Hook right before the send button is clicked / Enter is pressed (e.g. close inline pickers). */
    beforeSubmit() {
    }
    trace(step) {
      const t = /* @__PURE__ */ new Date();
      const hh = (n) => String(n).padStart(2, "0");
      this.sendLog.push(`${hh(t.getHours())}:${hh(t.getMinutes())}:${hh(t.getSeconds())} ${step}`);
      if (this.sendLog.length > 40) this.sendLog.splice(0, this.sendLog.length - 40);
    }
    /** tail snippets of messages the USER typed after our last marker (they carry no marker) */
    userMsgs = [];
    info;
    cfg;
    constructor(info2, cfg) {
      this.info = info2;
      this.cfg = cfg;
    }
    detect() {
      const hostOk = this.info.hosts.some((h) => location.hostname === h || location.hostname.endsWith("." + h));
      return hostOk && !!this.getComposer();
    }
    health() {
      const composer = this.getComposer();
      const problems = [];
      if (!composer) problems.push("composer not found");
      const send = composer ? !!this.findSend(composer) || !!this.cfg.preferEnter : false;
      if (composer && !send) problems.push("send button not found (will use Enter)");
      const reader = this.assistantNodes().length > 0;
      return { ok: !!composer, composer: !!composer, send, assistantReader: reader, problems };
    }
    getComposer() {
      return queryFirst(this.cfg.composer) ?? findComposerSemantic();
    }
    findSend(composer) {
      return findSendButton(composer, this.cfg.send);
    }
    /** Wait until the site is idle (sending while generating would be ignored or hit the stop button). */
    async waitIdle(ms) {
      for (let t = 0; t < ms; t += 200) {
        if (!this.isGenerating()) return true;
        await tick(200);
      }
      return !this.isGenerating();
    }
    rememberMarker(text) {
      const m = text.match(MARK_RE);
      if (!m || this.sent.includes(m[1])) return;
      this.sent.push(m[1]);
      this.userMsgs = [];
      if (this.sent.length > 300) this.sent.splice(0, this.sent.length - 300);
      try {
        sessionStorage.setItem(MARK_STORE, JSON.stringify(this.sent));
      } catch {
      }
    }
    /** Text nodes of OUR sent markers, in document order, outside any editor/panel. */
    markerNodes() {
      if (!this.sent.length) return [];
      const composer = this.getComposer();
      const out = [];
      const seen = /* @__PURE__ */ new Set();
      try {
        const res = document.evaluate("//text()[contains(., '[bw')]", document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < res.snapshotLength; i++) {
          const t = res.snapshotItem(i);
          const el = t.parentElement;
          if (!el || composer && composer.contains(el) || el.closest("[data-brickwire-host]") || el.closest("textarea,[contenteditable='true']")) continue;
          const m = (t.nodeValue ?? "").match(MARK_ANY);
          if (!m || !this.sent.includes(m[1]) || seen.has(m[1])) continue;
          seen.add(m[1]);
          out.push(t);
        }
      } catch {
      }
      return out;
    }
    noteUserMessage(text) {
      const lines = text.trim().split(/\n/).map((l) => l.trim()).filter(Boolean);
      const tail = (lines[lines.length - 1] ?? "").slice(-24).trim();
      if (tail.length >= 3) this.userMsgs.push(tail);
    }
    /** After `from`: the first rendered (non-editor) text node containing `snippet`. */
    textAfter(from, snippet) {
      const composer = this.getComposer();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      w.currentNode = from;
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const el = n.parentElement;
        if (!el || composer && composer.contains(el) || el.closest("[data-brickwire-host],textarea,[contenteditable='true']")) continue;
        if ((n.nodeValue ?? "").includes(snippet)) return n;
      }
      return null;
    }
    /** Reply after our last message: everything rendered after its marker, up to the panel/composer. */
    readByMarkers() {
      const marks = this.markerNodes();
      if (!marks.length) return null;
      let last = marks[marks.length - 1];
      let extra = 0;
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
        }
      }
      let text = extractText(box).replace(/^\s+/, "");
      if (text.replace(/\s+/g, "").length < 24 && !text.includes("<")) text = "";
      return { text, count: marks.length + extra, node: last.parentElement };
    }
    /**
     * One send at a time per tab. Several callers (agent loop, delivery watchdog, hang recovery, outbox,
     * panel buttons) can fire at once; two overlapping sends wrote into the same composer, overwrote or
     * doubled each other's text and left the editor stuck. All sends are queued here.
     */
    sendQueue = Promise.resolve();
    sendMessage(text) {
      const run = this.sendQueue.then(async () => {
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
            if (this.acceptedMarks.size > 200) this.acceptedMarks.delete(this.acceptedMarks.values().next().value);
          }
          this.trace(`${ok ? "OK" : "FAILED"}: send ${mark ? "[" + mark + "]" : ""} (${text.length} chars)`);
          return ok;
        } catch (e) {
          this.trace(`FAILED: exception ${e?.message ?? e}`);
          return false;
        }
      });
      this.sendQueue = run.catch(() => false);
      return run;
    }
    /** Our marker is rendered in the chat (outside the composer / editors / panel) → the site took the message. */
    markerVisible(mark) {
      try {
        const composer = this.getComposer();
        const res = document.evaluate(markXPath(mark), document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < res.snapshotLength; i++) {
          const el = res.snapshotItem(i).parentElement;
          if (el && !(composer && composer.contains(el)) && !el.closest("[data-brickwire-host]") && !el.closest("textarea,[contenteditable='true']")) return true;
        }
      } catch {
      }
      return false;
    }
    /**
     * Did the site accept `text`? Marker rendered in the chat, a new reply turn, or the composer no longer
     * holds our text. A composer that is missing (re-rendering right after submit) is NOT proof by itself.
     */
    sendAccepted(text, before) {
      const mark = text.match(MARK_RE)?.[1];
      if (mark && this.markerVisible(mark)) return true;
      if (this.readAssistantResponse().count > before) return true;
      const c = this.getComposer();
      if (!c) return false;
      const left = composerText(c).replace(/\s+/g, " ").trim();
      return left.length < Math.min(10, text.trim().length);
    }
    async doSendMessage(text) {
      this.rememberMarker(text);
      const idleMs = this.cfg.idleWaitMs ?? 3e4;
      if (!await this.waitIdle(idleMs)) {
        this.trace(`site still generating after ${Math.round(idleMs / 1e3)} s`);
        return false;
      }
      const el = this.getComposer();
      if (!el) {
        this.trace("message box not found");
        return false;
      }
      const before = this.readAssistantResponse().count;
      if (!await setComposerText(el, text, { allowRawWrite: this.cfg.allowRawWrite !== false })) {
        this.trace("text could not be put into the message box");
        return false;
      }
      await tick(150);
      const confirmMs = this.cfg.confirmMs ?? 2500;
      const confirmed = async (ms) => {
        for (let waited = 0; waited < ms; waited += 150) {
          await tick(150);
          if (this.sendAccepted(text, before)) return true;
        }
        return false;
      };
      if (!this.cfg.preferEnter) {
        let btn = null;
        for (let i = 0; i < 20; i++) {
          btn = this.findSend(this.getComposer() ?? el);
          if (btn && !isDisabled(btn) && !this.isStopButton(btn)) break;
          await tick(150);
        }
        if (btn && !isDisabled(btn) && !this.isStopButton(btn)) {
          this.beforeSubmit();
          btn.click();
          if (await confirmed(confirmMs)) return true;
          this.trace("send button clicked, not confirmed \u2014 trying Enter");
        } else this.trace(btn ? "send button disabled / shows Stop \u2014 trying Enter" : "send button not found \u2014 trying Enter");
      }
      if (this.sendAccepted(text, before) || this.isGenerating()) return confirmed(1500);
      const c = this.getComposer() ?? el;
      if (!c.isConnected) {
        this.trace("message box was replaced by the site");
        return false;
      }
      c.focus();
      this.beforeSubmit();
      pressEnter(c);
      const ok = await confirmed(Math.max(3e3, confirmMs));
      if (!ok) this.trace("Enter pressed, not confirmed (text still in the box)");
      return ok;
    }
    /** Attachment previews near the composer (img/blob previews, file chips). Used to confirm attachImage. */
    attachmentCount() {
      const c = this.getComposer();
      const root = c?.closest("form, fieldset, [data-testid*='composer' i], [class*='composer' i], [class*='input-area' i]") ?? c?.parentElement?.parentElement?.parentElement ?? null;
      if (!root) return 0;
      return root.querySelectorAll("img[src^='blob:'], img[src^='data:'], [data-testid*='attachment' i], [data-testid*='file' i], [class*='attachment' i], [aria-label*='Remove file' i], [aria-label*='remove attachment' i]").length;
    }
    async attachImage(file) {
      if (!await this.waitIdle(3e4)) return false;
      const el = this.getComposer();
      if (!el) return false;
      const before = this.attachmentCount();
      const shown = async (ms) => {
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
      try {
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt(), bubbles: true, cancelable: true }));
        if (await shown(2500)) return true;
      } catch {
      }
      try {
        const d = dt();
        for (const type of ["dragenter", "dragover", "drop"]) el.dispatchEvent(new DragEvent(type, { dataTransfer: d, bubbles: true, cancelable: true }));
        if (await shown(2500)) return true;
      } catch {
      }
      const inputs = Array.from(document.querySelectorAll("input[type='file']")).filter((i) => !i.closest("[data-brickwire-host]"));
      const extension = "." + file.name.split(".").at(-1)?.toLowerCase();
      const pick = inputs.find((i) => !i.accept || i.accept.split(",").some((raw) => {
        const a = raw.trim().toLowerCase();
        return a === "*" || a === extension || a === file.type || a.endsWith("/*") && file.type.startsWith(a.slice(0, -1));
      })) ?? inputs[0];
      if (pick) {
        try {
          pick.files = dt().files;
          pick.dispatchEvent(new Event("input", { bubbles: true }));
          pick.dispatchEvent(new Event("change", { bubbles: true }));
          if (await shown(4e3)) return true;
        } catch {
        }
      }
      return false;
    }
    /** Providers whose send button doubles as stop override this. */
    isStopButton(_btn) {
      return false;
    }
    assistantNodes() {
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
    readAssistantResponse() {
      if (this.cfg.markers === "primary" || this.usingMarkers) return this.readByMarkers() ?? { text: "", count: 0, node: null };
      const nodes = this.assistantNodes();
      const node = nodes[nodes.length - 1] ?? null;
      if (!node) {
        const m = this.readByMarkers();
        if (m) {
          this.usingMarkers = true;
          return m;
        }
        return { text: "", count: 0, node: null };
      }
      let text;
      if (this.cfg.assistantExclude?.length) {
        const clone = node.cloneNode(true);
        try {
          clone.querySelectorAll(this.cfg.assistantExclude.join(",")).forEach((e) => e.remove());
        } catch {
        }
        text = extractText(clone);
      } else text = extractText(node);
      return { text, count: nodes.length, node };
    }
    /** Everything the site is streaming for the last turn (answer + reasoning) — used only as a liveness signal. */
    streamLength() {
      if (this.cfg.markers === "primary" || this.usingMarkers) {
        const m = this.readByMarkers();
        return { node: m?.node ?? null, len: m?.text.length ?? 0 };
      }
      const nodes = queryAll(this.cfg.assistant);
      const node = nodes[nodes.length - 1] ?? null;
      return { node, len: node?.textContent?.length ?? 0 };
    }
    pressStop() {
      const btn = this.cfg.stop.length ? queryFirst(this.cfg.stop) : null;
      if (!btn) return false;
      btn.click();
      return true;
    }
    stopSignal() {
      const streaming = this.cfg.streaming ?? [];
      if (!this.cfg.stop.length && !streaming.length) return null;
      if (streaming.length && queryFirst(streaming, document, false)) return true;
      return !!(this.cfg.stop.length && queryFirst(this.cfg.stop));
    }
    isGenerating() {
      const s = this.streamLength();
      this.meter.sample(s.node, s.len);
      if (this.cfg.streaming?.length && queryFirst(this.cfg.streaming, document, false)) return true;
      if (queryFirst(this.cfg.stop)) return true;
      const composer = this.getComposer();
      if (composer) {
        let scope = composer;
        for (let i = 0; i < 6 && scope; i++) scope = scope.parentElement;
        const btns = Array.from((scope ?? document).querySelectorAll('button, [role="button"]'));
        if (btns.some((b) => isVisible(b) && !b.closest("[data-brickwire-host]") && STOP_LABEL.test((b.getAttribute("aria-label") ?? "") + (b.getAttribute("title") ?? "") + (b.getAttribute("data-testid") ?? "")))) return true;
      }
      return this.meter.grewWithin(this.cfg.growthIdleMs ?? 2500);
    }
    injectAgentUI(host) {
      this.panelHost = host;
      const composer = this.getComposer();
      if (!composer) return false;
      let anchor = this.cfg.mountAnchor?.length ? composer.closest(this.cfg.mountAnchor.join(",")) : null;
      if (!anchor) {
        anchor = composer;
        for (let i = 0, cur = composer.parentElement; i < 5 && cur; i++, cur = cur.parentElement) {
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
    extractToolCalls(text) {
      return parseAgentOutput(text);
    }
    async injectToolResult(results, footer) {
      return this.sendMessage(formatToolResults(results, this.info.maxMessageChars, footer));
    }
    blockReason() {
      return null;
    }
    diagnose() {
      const lines = [];
      const c = this.getComposer();
      const desc = (e) => {
        if (!e) return "\u2014";
        const h = e;
        const ph = h.getAttribute("placeholder") ?? h.getAttribute("aria-label") ?? h.getAttribute("data-placeholder") ?? "";
        return `<${h.tagName.toLowerCase()}${h.id ? "#" + h.id : ""}${h.isContentEditable ? " contenteditable" : ""}>${ph ? ` "${ph.slice(0, 40)}"` : ""}`;
      };
      lines.push(`${c ? "\u2713" : "\u2715"} message box: ${desc(c)}`);
      const send = c ? this.findSend(c) : null;
      lines.push(`${send ? "\u2713" : "\u25CB"} send button: ${send ? desc(send) : this.cfg.preferEnter ? "uses Enter" : "not found \u2014 Enter key will be used"}`);
      const sel = this.cfg.markers === "primary" ? 0 : this.assistantNodes().length;
      const mk = this.markerNodes().length;
      lines.push(`${sel || mk ? "\u2713" : "\u25CB"} reply reader: ${this.cfg.markers === "primary" || this.usingMarkers ? `markers (${mk} of our messages visible)` : `selectors (${sel} replies)${mk ? `, markers ${mk}` : ""}`}`);
      lines.push(`\xB7 generating now: ${this.isGenerating() ? "yes" : "no"}`);
      const block = this.blockReason();
      if (block) lines.push("\u2715 " + block);
      if (this.sendLog.length) {
        lines.push("Last send steps:");
        for (const l of this.sendLog.slice(-12)) lines.push("  " + l);
      }
      return { lines, ok: !!c && !block };
    }
  };

  // extension/src/adapters/providers.ts
  var info = (id) => PROVIDERS.find((p) => p.id === id);
  var ChatGPTAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("chatgpt"), {
        composer: ["#prompt-textarea[contenteditable='true']", "div#prompt-textarea", "textarea#prompt-textarea", "form [contenteditable='true'].ProseMirror"],
        send: ["button[data-testid='send-button']", "#composer-submit-button", "button[aria-label*='Send' i]"],
        stop: ["button[data-testid='stop-button']", "button[aria-label*='Stop' i]"],
        assistant: ["[data-message-author-role='assistant']"],
        streaming: [".result-streaming", "[data-message-author-role='assistant'] .streaming-animation"],
        mountAnchor: ["form[data-type='unified-composer']", "form"]
      });
    }
  };
  var DeepSeekAdapter = class _DeepSeekAdapter extends GenericDomAdapter {
    static TURN = ".ds-message";
    static THINK = ".ds-think-content";
    static MD = ".ds-markdown";
    constructor() {
      super(info("deepseek"), {
        composer: ["textarea#chat-input", "textarea[placeholder*='DeepSeek' i]", "textarea[placeholder*='Message' i]", "textarea"],
        send: [".ds-button--primary[role='button']", ".ds-button--primary", "div[role='button'][aria-label*='Send' i]"],
        stop: [],
        assistant: [".ds-markdown"],
        assistantExclude: [".ds-think-content"]
      });
    }
    getComposer() {
      const all = Array.from(document.querySelectorAll("textarea")).filter((t) => isVisible(t) && !t.closest("[data-brickwire-host]") && !t.closest(".ds-textarea--bordered"));
      if (!all.length) return null;
      return all.find((t) => /deepseek|message|ask|сообщ|发送|给/i.test(t.placeholder)) ?? all[all.length - 1];
    }
    footerButton() {
      const c = this.getComposer();
      let scope = c;
      for (let i = 0; i < 6 && scope; i++) {
        scope = scope.parentElement;
        const b = scope?.querySelector(".ds-button--primary");
        if (b && isVisible(b)) return b;
      }
      return queryFirst([".ds-button--primary"]);
    }
    findSend() {
      return this.footerButton();
    }
    isStopButton(btn) {
      if (btn.querySelector("rect")) return true;
      const d = btn.querySelector("path")?.getAttribute("d") ?? "";
      if (/^\s*M\s*[0-3][\s.,]/.test(d)) return true;
      return /stop|停止/i.test(btn.getAttribute("aria-label") ?? "");
    }
    turns() {
      return Array.from(document.querySelectorAll(_DeepSeekAdapter.TURN)).filter((n) => !n.closest("[data-brickwire-host]"));
    }
    isUserTurn(t) {
      if (t.querySelector(".fbb737a4")) return true;
      return !t.querySelector(_DeepSeekAdapter.MD) && !t.querySelector(_DeepSeekAdapter.THINK);
    }
    assistantTurns() {
      const turns = this.turns();
      if (turns.length) return turns.filter((t) => !this.isUserTurn(t));
      return this.assistantNodes();
    }
    readAssistantResponse() {
      const turns = this.assistantTurns();
      const node = turns[turns.length - 1] ?? null;
      if (!node) return { text: "", count: 0, node: null };
      const mds = Array.from(node.querySelectorAll(_DeepSeekAdapter.MD)).filter((m) => !m.closest(_DeepSeekAdapter.THINK));
      const outer = mds.filter((m) => !mds.some((o) => o !== m && o.contains(m)));
      const text = outer.length ? outer.map((m) => extractText(m)).join("\n") : node.matches(_DeepSeekAdapter.MD) ? extractText(node) : "";
      return { text, count: turns.length, node };
    }
    streamLength() {
      const turns = this.assistantTurns();
      const node = turns[turns.length - 1] ?? null;
      return { node, len: node?.textContent?.length ?? 0 };
    }
    isGenerating() {
      const s = this.streamLength();
      this.meter.sample(s.node, s.len);
      if (document.querySelector(".ds-loading")) return true;
      const btn = this.footerButton();
      if (btn && this.isStopButton(btn)) return true;
      const node = s.node;
      const reasoning = !!node?.querySelector(_DeepSeekAdapter.THINK) && !this.readAssistantResponse().text.trim();
      return this.meter.grewWithin(reasoning ? 12e3 : 1200);
    }
    async doSendMessage(text) {
      this.rememberMarker(text);
      if (!await this.waitIdle(6e4)) return false;
      const ta = this.getComposer();
      if (!ta) return false;
      const before = this.readAssistantResponse().count;
      ta.focus();
      await setComposerText(ta, text.length > 16e4 ? text.slice(0, 16e4) + "\n[\u2026truncated to fit DeepSeek's input limit]" : text);
      const accepted = async (ms) => {
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
      return accepted(3e3);
    }
  };
  var ClaudeAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("claude"), {
        composer: ["div.ProseMirror[contenteditable='true']", "[data-testid='chat-input'] [contenteditable='true']", "fieldset [contenteditable='true']"],
        send: ["button[aria-label='Send message']", "button[aria-label*='Send' i]", "button[data-testid='send-button']"],
        stop: ["button[aria-label='Stop response']", "button[aria-label*='Stop' i]"],
        assistant: [".font-claude-response", ".font-claude-message", "[data-testid='assistant-message']"],
        assistantExclude: ["[data-testid*='thinking']", "[class*='thinking']"],
        streaming: ["[data-is-streaming='true']"],
        mountAnchor: ["fieldset", "[data-testid='chat-input-container']"]
      });
    }
  };
  var GeminiAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("gemini"), {
        composer: ["rich-textarea .ql-editor[contenteditable='true']", "div.ql-editor[contenteditable='true']", "[contenteditable='true'][role='textbox']"],
        send: ["button.send-button", "button[aria-label*='Send' i]", "button[mattooltip*='Send' i]"],
        stop: ["button.stop", "button[aria-label*='Stop' i]"],
        assistant: ["model-response message-content", "model-response .markdown", "message-content .markdown"],
        assistantExclude: ["model-thoughts", "[class*='thoughts']"],
        mountAnchor: ["input-area-v2", "input-area", ".input-area-container"]
      });
    }
  };
  var QwenAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("qwen"), {
        composer: ["textarea#chat-input", "textarea.message-input-textarea", "textarea[placeholder]"],
        send: ["#send-message-button", "button.send-button", "button[aria-label*='Send' i]"],
        stop: ["button.stop-button", "button[aria-label*='Stop' i]", "[class*='stop-button']"],
        assistant: [".response-message-content", "[class*='response-message-content']", ".chat-response-message .markdown-content"],
        assistantExclude: ["[class*='thinking']", "[class*='think-content']"]
      });
    }
  };
  var KimiAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("kimi"), {
        composer: [".chat-input-editor[contenteditable='true']", "[data-lexical-editor='true']", "div[contenteditable='true'][role='textbox']"],
        send: [".send-button", "[class*='send-button']", "button[aria-label*='Send' i]"],
        stop: ["[class*='stop-button']", "button[aria-label*='Stop' i]", ".send-button.stop"],
        assistant: [".segment-assistant .markdown", ".segment-assistant", "[class*='segment-assistant']"],
        assistantExclude: ["[class*='toolcall']", "[class*='thinking']"]
      });
    }
  };
  var GLMAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("glm"), {
        composer: ["textarea#chat-input", "textarea[placeholder]"],
        send: ["#send-message-button", "button[type='submit']", "button[aria-label*='Send' i]"],
        stop: ["button[aria-label*='Stop' i]", "[class*='stop']"],
        assistant: [".chat-assistant", "#response-content-container", ".markdown-prose"],
        assistantExclude: ["[class*='thinking']", "details"]
      });
    }
  };
  var ArenaAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("arena"), {
        composer: ["textarea[name='message']", "textarea[placeholder*='Ask' i]", "textarea"],
        send: ["button[type='submit']", "button[aria-label*='Send' i]"],
        stop: ["button[aria-label*='Stop' i]"],
        assistant: ["[data-role='assistant']", "[data-message-role='assistant']", ".prose"]
      });
    }
    blockReason() {
      const path = location.pathname.toLowerCase();
      if (/battle|side-by-side|sxs|compare/.test(path) || /mode=(battle|side)/.test(location.search)) return "Arena: switch to Direct mode (Battle / Side-by-Side are not supported).";
      const nodes = queryAll(["[data-role='assistant']", "[data-message-role='assistant']"]);
      if (nodes.length >= 2) {
        const a = nodes[nodes.length - 1].getBoundingClientRect();
        const b = nodes[nodes.length - 2].getBoundingClientRect();
        if (Math.abs(a.top - b.top) < 8 && Math.abs(a.left - b.left) > 100) return "Arena: side-by-side responses detected \u2014 use Direct mode.";
      }
      return null;
    }
  };
  var NotionAdapter = class _NotionAdapter extends GenericDomAdapter {
    static PAGE_SCOPE = ".notion-page-content, [data-block-id], .notion-topbar, .notion-sidebar, .notion-sidebar-container, .notion-frame .notion-page-block";
    static AI_LABEL = /(ask|ai\b|ии|спрос|задай|anything|message|notion ai|сообщ|chat)/i;
    static NOT_SEND = /(upload|attach|file|paperclip|clip\b|image|photo|mic|voice|dictat|mention|emoji|plus|add|model|settings|more|menu|close|прикреп|файл|загруз|микроф|голос|добав|настро|ещё|закры)/i;
    static STOP = /(stop|останов|停止|中止)/i;
    locked = null;
    cache = { at: 0, el: null };
    constructor() {
      super(info("notion"), {
        composer: [],
        send: [],
        stop: [],
        assistant: [],
        markers: "primary",
        growthIdleMs: 6e3,
        idleWaitMs: 12e4,
        confirmMs: 6e3,
        allowRawWrite: false,
        trustAcceptedSend: true
      });
    }
    label(e) {
      return ["placeholder", "aria-label", "data-placeholder", "aria-placeholder"].map((a) => e.getAttribute(a) ?? "").join(" ") + " " + (e.querySelector("[placeholder],[data-placeholder]")?.getAttribute("placeholder") ?? e.querySelector("[data-placeholder]")?.getAttribute("data-placeholder") ?? "");
    }
    candidates() {
      return Array.from(document.querySelectorAll("[contenteditable='true'], textarea")).filter(
        (e) => isVisible(e) && !e.closest("[data-brickwire-host]") && !e.closest(_NotionAdapter.PAGE_SCOPE) && !e.parentElement?.closest("[contenteditable='true']")
      );
    }
    stillUsable(e) {
      return !!e && e.isConnected && isVisible(e) && !e.closest(_NotionAdapter.PAGE_SCOPE) && !e.closest("[data-brickwire-host]");
    }
    getComposer() {
      const now = Date.now();
      if (now - this.cache.at < 150 && (this.cache.el === null || this.cache.el.isConnected)) return this.cache.el;
      const el = this.pickComposer();
      this.cache = { at: now, el };
      return el;
    }
    pickComposer() {
      if (this.stillUsable(this.locked)) return this.locked;
      this.locked = null;
      const cands = this.candidates();
      if (!cands.length) return null;
      const chatRoute = /\/(chat|ai)(\/|$|\?)/i.test(location.pathname + "/") || /[?&]t=/.test(location.search);
      const score = (e) => {
        const r = e.getBoundingClientRect();
        let s = r.bottom / Math.max(1, window.innerHeight);
        if (_NotionAdapter.AI_LABEL.test(this.label(e))) s += 2;
        if (e.closest("[role='dialog'], aside, [aria-label*='AI' i], [class*='ai-chat' i], [class*='assistant' i], [class*='chat' i]")) s += 1;
        if (chatRoute) s += 0.5;
        if (e.getAttribute("role") === "textbox") s += 0.3;
        return s;
      };
      const best = cands.sort((a, b) => score(b) - score(a))[0];
      if (!chatRoute && score(best) < 2) return null;
      if (_NotionAdapter.AI_LABEL.test(this.label(best)) || chatRoute) this.locked = best;
      return best;
    }
    /** The composer box: the widest ancestor (≤ 12 levels, ≤ 420 px tall) — Notion nests the editor deeply. */
    composerBox(c) {
      let box = c;
      for (let i = 0, cur = c.parentElement; i < 12 && cur && cur !== document.body; i++, cur = cur.parentElement) {
        const r = cur.getBoundingClientRect();
        if (r.height > 420) break;
        box = cur;
      }
      return box;
    }
    nearComposerButtons() {
      const c = this.getComposer();
      if (!c) return [];
      const box = this.composerBox(c);
      const br = box.getBoundingClientRect();
      const inBox = Array.from(box.querySelectorAll("button, [role='button']"));
      const parent = box.parentElement;
      const around = parent ? Array.from(parent.querySelectorAll("button, [role='button']")).filter((b) => {
        if (inBox.includes(b)) return false;
        const r = b.getBoundingClientRect();
        return r.top >= br.top - 40 && r.bottom <= br.bottom + 90 && r.left >= br.left - 40 && r.right <= br.right + 40;
      }) : [];
      return [...inBox, ...around].filter((b) => isVisible(b) && !b.closest("[data-brickwire-host]") && !b.closest(_NotionAdapter.PAGE_SCOPE) && !b.parentElement?.closest("button, [role='button']"));
    }
    btnText(b) {
      return [b.getAttribute("aria-label"), b.getAttribute("title"), b.getAttribute("data-testid"), b.textContent].join(" ");
    }
    svgInfo(b) {
      return Array.from(b.querySelectorAll("svg, svg use, svg [class]")).map((e) => `${e.getAttribute("class") ?? ""} ${e.getAttribute("href") ?? e.getAttribute("xlink:href") ?? ""} ${e.getAttribute("aria-label") ?? ""}`).join(" ");
    }
    findSend() {
      const btns = this.nearComposerButtons();
      const byLabel = btns.find((b) => /(send|submit|отправ)/i.test(this.btnText(b)) && !_NotionAdapter.STOP.test(this.btnText(b)));
      if (byLabel) return byLabel;
      const c = this.getComposer();
      if (!c) return null;
      const cr = this.composerBox(c).getBoundingClientRect();
      const icons = btns.filter((b) => {
        if (!b.querySelector("svg") || (b.textContent ?? "").trim().length > 2) return false;
        if (_NotionAdapter.NOT_SEND.test(this.btnText(b) + " " + this.svgInfo(b))) return false;
        const r = b.getBoundingClientRect();
        return r.left + r.width / 2 >= cr.left + cr.width * 0.5 && r.top < cr.bottom + 90 && r.bottom > cr.top - 40;
      });
      if (!icons.length) return null;
      const arrow = icons.filter((b) => /(arrow|send|submit)/i.test(this.svgInfo(b)));
      const pool = arrow.length ? arrow : icons;
      return pool.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return rb.right + rb.bottom * 0.5 - (ra.right + ra.bottom * 0.5);
      })[0];
    }
    isStopButton(btn) {
      const text = this.btnText(btn);
      if (_NotionAdapter.STOP.test(text) || /\bstop|square/i.test(this.svgInfo(btn))) return true;
      if (_NotionAdapter.NOT_SEND.test(text + " " + this.svgInfo(btn))) return false;
      if ((btn.textContent ?? "").trim().length > 2) return false;
      if (btn.querySelector("svg rect")) return true;
      const paths = Array.from(btn.querySelectorAll("svg path"));
      if (paths.length !== 1) return false;
      const d = paths[0].getAttribute("d") ?? "";
      return /^[\sMmHhVvLlZzAaCcQqSs0-9.,\-]+$/.test(d) && (d.match(/[Mm]/g) ?? []).length === 1 && /[Hh]/.test(d) && /[Vv]/.test(d) && /[Zz]\s*$/.test(d);
    }
    /** true once a Stop control was really recognised in this tab — until then "no Stop" means "unknown", not "finished". */
    seenStop = false;
    /** A Stop control: glyph/label inside the composer box, or a LABELLED Stop button a few levels around it. */
    stopButton() {
      const inBox = this.nearComposerButtons().find((b) => this.isStopButton(b));
      if (inBox) return inBox;
      const c = this.getComposer();
      if (!c) return null;
      let scope = c;
      for (let i = 0; i < 8 && scope?.parentElement && scope.parentElement !== document.body; i++) scope = scope.parentElement;
      return Array.from((scope ?? document).querySelectorAll("button, [role='button']")).find(
        (b) => isVisible(b) && !b.closest("[data-brickwire-host]") && !b.closest(_NotionAdapter.PAGE_SCOPE) && _NotionAdapter.STOP.test([b.getAttribute("aria-label"), b.getAttribute("title"), b.getAttribute("data-testid")].join(" "))
      ) ?? null;
    }
    stopSignal() {
      const stop = !!this.stopButton();
      if (stop) this.seenStop = true;
      return stop ? true : this.seenStop ? false : null;
    }
    isGenerating() {
      const s = this.streamLength();
      this.meter.sample(s.node, s.len);
      if (this.stopButton()) {
        this.seenStop = true;
        return true;
      }
      return this.meter.grewWithin(this.seenStop ? 2500 : this.cfg.growthIdleMs ?? 6e3);
    }
    pressStop() {
      const b = this.stopButton();
      if (!b) return false;
      b.click();
      return true;
    }
    /** Inline pickers (@mention, :emoji, [[link, /command) — while one is open, Enter picks an item instead of sending. */
    openPickers() {
      return Array.from(document.querySelectorAll("[role='listbox'], [role='menu'], .notion-mention-menu, .notion-emoji-menu, .notion-slash-menu")).filter((e) => isVisible(e) && !e.closest("[data-brickwire-host]"));
    }
    pickersBefore = /* @__PURE__ */ new Set();
    async doSendMessage(text) {
      this.pickersBefore = new Set(this.openPickers());
      return super.doSendMessage(text);
    }
    /** Close a picker that our text opened, right before the click / Enter. */
    beforeSubmit() {
      const c = this.getComposer();
      const fresh = this.openPickers().filter((p) => !this.pickersBefore.has(p));
      if (c && fresh.length) {
        this.trace(`closed ${fresh.length} inline menu(s) opened by the text`);
        pressEscape(c);
      }
    }
    diagnose() {
      const r = super.diagnose();
      const c = this.getComposer();
      const lines = [...r.lines];
      if (c) {
        const box = this.composerBox(c);
        const br = box.getBoundingClientRect();
        lines.push(`\xB7 composer locked: ${this.locked === c ? "yes" : "no"} \xB7 box ${Math.round(br.width)}\xD7${Math.round(br.height)} \xB7 route ${location.pathname.slice(0, 30)}`);
        const btns = this.nearComposerButtons();
        lines.push(`\xB7 buttons in the composer box: ${btns.length}`);
        for (const b of btns.slice(0, 12)) {
          const rr = b.getBoundingClientRect();
          const lab = this.btnText(b).replace(/\s+/g, " ").trim().slice(0, 40);
          lines.push(`   - ${b.tagName.toLowerCase()} "${lab}" svg[${this.svgInfo(b).replace(/\s+/g, " ").trim().slice(0, 40)}] @${Math.round(rr.left - br.left)},${Math.round(rr.top - br.top)}${isDisabled(b) ? " disabled" : ""}${this.isStopButton(b) ? " STOP" : ""}`);
        }
      } else {
        lines.push(`\xB7 editors outside pages: ${this.candidates().length}`);
        for (const e of this.candidates().slice(0, 6)) lines.push(`   - <${e.tagName.toLowerCase()}> "${this.label(e).replace(/\s+/g, " ").trim().slice(0, 50)}"`);
      }
      const pk = this.openPickers().length;
      if (pk) lines.push(`\xB7 open menus/pickers: ${pk}`);
      return { lines, ok: r.ok };
    }
  };
  var GrokAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("grok"), {
        composer: ["textarea[aria-label*='Ask' i]", "div.ProseMirror[contenteditable='true']", "textarea"],
        send: ["button[type='submit']", "button[aria-label*='Submit' i]", "button[aria-label*='Send' i]"],
        stop: ["button[aria-label*='Stop' i]"],
        assistant: [".message-bubble", "[class*='response-content']"],
        markers: "primary"
      });
    }
  };
  var MistralAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("mistral"), {
        composer: ["textarea[name='message.text']", "div.ProseMirror[contenteditable='true']", "textarea"],
        send: ["button[type='submit']", "button[aria-label*='Send' i]"],
        stop: ["button[aria-label*='Stop' i]"],
        assistant: ["[data-message-author-role='assistant']"],
        markers: "primary"
      });
    }
  };
  var PerplexityAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("perplexity"), {
        composer: ["textarea#ask-input", "#ask-input[contenteditable='true']", "div[contenteditable='true'][role='textbox']", "textarea"],
        send: ["button[aria-label='Submit']", "button[data-testid='submit-button']", "button[aria-label*='Submit' i]"],
        stop: ["button[aria-label*='Stop' i]"],
        assistant: [".prose"],
        markers: "primary"
      });
    }
  };
  var CopilotAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("copilot"), {
        composer: ["textarea#userInput", "textarea[data-testid='composer-input']", "textarea"],
        send: ["button[data-testid='submit-button']", "button[aria-label*='Submit' i]", "button[aria-label*='Send' i]"],
        stop: ["button[data-testid='stop-button']", "button[aria-label*='Stop' i]"],
        assistant: ["[data-content='ai-message']"],
        markers: "primary"
      });
    }
  };
  var PoeAdapter = class extends GenericDomAdapter {
    constructor() {
      super(info("poe"), {
        composer: ["textarea[class*='GrowingTextArea']", "textarea"],
        send: ["button[data-button-send='true']", "button[aria-label*='Send' i]", "button[class*='sendButton']"],
        stop: ["button[aria-label*='Stop' i]", "button[class*='stopButton']"],
        assistant: ["[class*='Message_botMessageBubble']"],
        markers: "primary"
      });
    }
  };
  function createCustomAdapter(site) {
    const split = (s) => (s ?? "").split(/\s*\|\|\s*|\n/).map((x) => x.trim()).filter(Boolean);
    const pi = {
      id: "custom",
      name: site.name || site.host,
      hosts: [site.host],
      url: "https://" + site.host + "/",
      status: "experimental",
      enabledByDefault: true,
      maxMessageChars: 3e4,
      notes: "Custom site added in Options."
    };
    return new GenericDomAdapter(pi, { composer: split(site.composer), send: split(site.send), stop: split(site.stop), assistant: [], markers: "primary" });
  }
  function createAdapter(hostname) {
    const h = hostname.toLowerCase();
    const match = (id) => info(id).hosts.some((x) => h === x || h.endsWith("." + x));
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

  // shared/src/studio2/thumbnail-scene.ts
  var SCENE_NAME = "BW_ThumbnailScene";
  var THUMB_SCENE_LUAU = String.raw`
local A = ARGS
local CHS = game:GetService("ChangeHistoryService")
pcall(function() CHS:SetWaypoint("Brickwire: before thumbnail_scene") end)
local origin = CFrame.new(A.at[1], A.at[2], A.at[3])
local old = workspace:FindFirstChild("${SCENE_NAME}")
if old then
  if not old:GetAttribute("BW_Owned") then error("Workspace.${SCENE_NAME} exists and was not made by Brickwire — rename it first") end
  old:Destroy()
end
local cam = workspace.CurrentCamera
local oldFx = cam and cam:FindFirstChild("BW_ThumbScene_DOF")
if oldFx then oldFx:Destroy() end
local scene = Instance.new("Model")
scene.Name = "${SCENE_NAME}"
scene:SetAttribute("BW_Owned", true)
scene:SetAttribute("BW_Template", A.template)
local subjects = Instance.new("Model") subjects.Name = "Subjects" subjects.Parent = scene
local props = Instance.new("Model") props.Name = "Props" props.Parent = scene
local labels = Instance.new("Folder") labels.Name = "Labels" labels.Parent = scene
local function rgb(r, g, b) return Color3.fromRGB(r, g, b) end
local function part(parent, name, size, cf, color, mat, extra)
  local p = Instance.new("Part")
  p.Name = name p.Anchored = true p.Size = size p.CFrame = origin * cf p.Color = color
  p.Material = mat or Enum.Material.SmoothPlastic p.TopSurface = Enum.SurfaceType.Smooth p.BottomSurface = Enum.SurfaceType.Smooth
  for k, v in pairs(extra or {}) do p[k] = v end
  p.Parent = parent
  return p
end

-- R6 rig (parts only). Pose = rotations per joint in degrees; applied as whole CFrames.
local SKINS = {
  noob = { head = rgb(245,205,48), torso = rgb(13,105,172), arms = rgb(245,205,48), legs = rgb(75,151,75) },
  rich = { head = rgb(255,220,180), torso = rgb(30,30,36), arms = rgb(255,220,180), legs = rgb(30,30,36), crown = true, chain = true },
  hero = { head = rgb(255,214,170), torso = rgb(220,60,60), arms = rgb(255,214,170), legs = rgb(40,40,60) },
  seeker = { head = rgb(240,200,160), torso = rgb(60,60,70), arms = rgb(240,200,160), legs = rgb(30,30,40) },
  farmer = { head = rgb(255,215,175), torso = rgb(90,170,90), arms = rgb(255,215,175), legs = rgb(70,90,160), hat = true },
}
local POSES = {
  idle = { ra = {0,0}, la = {0,0}, head = {0,0} },
  wave = { ra = {0,150}, la = {0,8}, head = {0,10} },
  cheer = { ra = {0,160}, la = {0,160}, head = {10,0} },
  sad = { ra = {10,4}, la = {10,4}, head = {-22,0} },
  point = { ra = {90,0}, la = {0,6}, head = {0,0} },
  hold = { ra = {70,-12}, la = {70,-12}, head = {-8,0} },
  shocked = { ra = {30,60}, la = {30,60}, head = {8,0} },
}
local FACES = { idle = {"•  •","‿"}, wave = {"^  ^","◡"}, cheer = {"^  ^","D"}, sad = {"•  •","︵"}, point = {"•  •","◡"}, hold = {"•  •","◡"}, shocked = {"O  O","o"} }
local function face(head, pose)
  local f = FACES[pose] or FACES.idle
  local g = Instance.new("SurfaceGui") g.Name = "BW_Face" g.Face = Enum.NormalId.Front g.CanvasSize = Vector2.new(200, 100) g.LightInfluence = 0 g.Parent = head
  local function txt(t, y, h)
    local l = Instance.new("TextLabel") l.BackgroundTransparency = 1 l.Size = UDim2.new(1,0,h,0) l.Position = UDim2.new(0,0,y,0)
    l.Font = Enum.Font.FredokaOne l.TextScaled = true l.TextColor3 = rgb(20,20,20) l.Text = t l.Parent = g
  end
  txt(f[1], 0.12, 0.42) txt(f[2], 0.5, 0.42)
end
local function rig(name, at, yaw, skinName, poseName)
  local skin = SKINS[skinName] or SKINS.noob
  local pose = POSES[poseName] or POSES.idle
  local m = Instance.new("Model") m.Name = name m:SetAttribute("BW_Pose", poseName) m:SetAttribute("BW_Skin", skinName) m.Parent = subjects
  local base = CFrame.new(at[1], at[2] + 3, at[3]) * CFrame.Angles(0, math.rad(yaw or 0), 0)
  local torso = part(m, "Torso", Vector3.new(2,2,1), base, skin.torso)
  local root = part(m, "HumanoidRootPart", Vector3.new(2,2,1), base, skin.torso, nil, { Transparency = 1, CanCollide = false })
  local hum = Instance.new("Humanoid") hum.RigType = Enum.HumanoidRigType.R6 hum.DisplayDistanceType = Enum.HumanoidDisplayDistanceType.None hum.Parent = m
  m.PrimaryPart = root
  local function joint(name0, p0, p1, c0, c1)
    local j = Instance.new("Motor6D") j.Name = name0 j.Part0 = p0 j.Part1 = p1
    j.C0 = c0 j.C1 = c1 -- whole-CFrame assignment (the C0 fix)
    j.Parent = p0
    return j
  end
  local function limb(name0, jointName, color, pivot, rx, rz, len)
    local R = CFrame.Angles(math.rad(rx), 0, math.rad(rz))
    local c0 = CFrame.new(pivot) * R
    local c1 = CFrame.new(0, len / 2, 0)
    local p = part(m, name0, Vector3.new(1, len, 1), base * c0 * c1:Inverse(), color)
    joint(jointName, torso, p, c0, c1)
    return p
  end
  limb("Right Arm", "Right Shoulder", skin.arms, Vector3.new(1.5, 1, 0), pose.ra[1], pose.ra[2], 2)
  limb("Left Arm", "Left Shoulder", skin.arms, Vector3.new(-1.5, 1, 0), pose.la[1], -pose.la[2], 2)
  limb("Right Leg", "Right Hip", skin.legs, Vector3.new(0.5, -1, 0), 0, 0, 2)
  limb("Left Leg", "Left Hip", skin.legs, Vector3.new(-0.5, -1, 0), 0, 0, 2)
  local hc0 = CFrame.new(0, 1, 0) * CFrame.Angles(math.rad(pose.head[1]), 0, math.rad(pose.head[2]))
  local hc1 = CFrame.new(0, -0.5, 0)
  local head = part(m, "Head", Vector3.new(2,1,1), base * hc0 * hc1:Inverse(), skin.head)
  local sm = Instance.new("SpecialMesh") sm.MeshType = Enum.MeshType.Head sm.Scale = Vector3.new(1.25,1.25,1.25) sm.Parent = head
  joint("Neck", torso, head, hc0, hc1)
  face(head, poseName)
  local hcf = base * hc0 * hc1:Inverse()
  if skin.crown then
    local gold = rgb(255,196,40)
    part(m, "CrownBand", Vector3.new(1.9,0.35,1.9), hcf * CFrame.new(0,0.85,0), gold, Enum.Material.Metal)
    for i = 0, 3 do
      local a = i * math.pi / 2 + math.pi / 4
      part(m, "CrownSpike", Vector3.new(0.4,0.6,0.4), hcf * CFrame.new(math.cos(a) * 0.75, 1.3, math.sin(a) * 0.75) * CFrame.Angles(0, a, math.rad(45)), gold, Enum.Material.Metal)
    end
  end
  if skin.chain then part(m, "GoldChain", Vector3.new(1.4,0.2,0.2), base * CFrame.new(0,0.5,-0.55), rgb(255,200,40), Enum.Material.Metal) end
  if skin.hat then part(m, "StrawHat", Vector3.new(2.6,0.3,2.6), hcf * CFrame.new(0,0.75,0), rgb(230,200,110), Enum.Material.Fabric) end
  -- parts were created relative to origin by part(); re-base everything that used absolute hcf
  return m
end

local function label(text, pos, color, h)
  local anchor = part(labels, "LabelAnchor", Vector3.new(0.2,0.2,0.2), CFrame.new(pos[1], pos[2], pos[3]), rgb(0,0,0), nil, { Transparency = 1, CanCollide = false })
  local bb = Instance.new("BillboardGui") bb.Name = "BW_Label" bb.Size = UDim2.new(h * 4.5, 0, h, 0) bb.LightInfluence = 0 bb.AlwaysOnTop = true bb.Parent = anchor
  bb:SetAttribute("BW_HeightStuds", h)
  local l = Instance.new("TextLabel") l.BackgroundTransparency = 1 l.Size = UDim2.fromScale(1,1) l.Text = text l.TextScaled = true
  l.Font = (string.len(text) <= 8) and Enum.Font.LuckiestGuy or Enum.Font.FredokaOne l.TextColor3 = color l.Parent = bb
  local s = Instance.new("UIStroke") s.Thickness = 5 s.Color = rgb(0,0,0) s.LineJoinMode = Enum.LineJoinMode.Round s.Parent = l
  return anchor
end

local T = A.template
if T == "poor_vs_rich" then
  part(props, "FloorPoor", Vector3.new(22,1,18), CFrame.new(-11,-0.5,0), rgb(200,170,120), Enum.Material.Sand)
  part(props, "FloorRich", Vector3.new(22,1,18), CFrame.new(11,-0.5,0), rgb(50,20,90), Enum.Material.Glass)
  part(props, "WallPoor", Vector3.new(22,16,1), CFrame.new(-11,7.5,-9), rgb(140,60,45), Enum.Material.Brick)
  part(props, "WallRich", Vector3.new(22,16,1), CFrame.new(11,7.5,-9), rgb(70,25,130), Enum.Material.SmoothPlastic)
  for i = 0, 3 do part(props, "NeonStrip", Vector3.new(20,0.3,0.3), CFrame.new(11, 2 + i * 4, -8.4), (i % 2 == 0) and rgb(255,60,220) or rgb(60,230,255), Enum.Material.Neon) end
  -- lightning divider (outlined zigzag)
  local zig = { {0,13,15}, {-1.2,7,-25}, {1,1.5,15} }
  for i, z in ipairs(zig) do
    part(props, "BoltOutline" .. i, Vector3.new(2.4,6.6,0.6), CFrame.new(z[1], z[2], 1.1) * CFrame.Angles(0,0,math.rad(z[3])), rgb(10,10,10))
    part(props, "Bolt" .. i, Vector3.new(1.6,6,0.7), CFrame.new(z[1], z[2], 1.3) * CFrame.Angles(0,0,math.rad(z[3])), rgb(255,230,40), Enum.Material.Neon)
  end
  -- poor props: cheap PC on a box
  part(props, "Box", Vector3.new(4,2.5,3), CFrame.new(-15,1.25,-2), rgb(170,130,80), Enum.Material.WoodPlanks)
  part(props, "OldMonitor", Vector3.new(2.6,2,1.6), CFrame.new(-15,3.5,-2), rgb(220,215,200))
  part(props, "OldScreen", Vector3.new(2,1.4,0.1), CFrame.new(-15,3.6,-1.15), rgb(90,110,90), Enum.Material.SmoothPlastic)
  part(props, "Crack", Vector3.new(4,0.1,0.1), CFrame.new(-7,0.05,3) * CFrame.Angles(0,math.rad(30),0), rgb(90,70,50))
  -- rich props: glowing PC, pedestal, coins
  part(props, "Desk", Vector3.new(7,0.6,3.5), CFrame.new(15,3,-3), rgb(20,20,25), Enum.Material.Metal)
  part(props, "Tower", Vector3.new(2,4.5,4), CFrame.new(18.8,2.25,-3), rgb(15,15,20), Enum.Material.Glass)
  local core = part(props, "TowerGlow", Vector3.new(0.2,3.6,3.2), CFrame.new(17.75,2.3,-3), rgb(60,230,255), Enum.Material.Neon)
  local pl = Instance.new("PointLight") pl.Color = rgb(150,90,255) pl.Range = 18 pl.Brightness = 3 pl.Parent = core
  part(props, "BigMonitor", Vector3.new(6,3.4,0.4), CFrame.new(15,5.2,-4.2), rgb(15,15,20))
  part(props, "BigScreen", Vector3.new(5.6,3,0.1), CFrame.new(15,5.2,-3.95), rgb(255,60,220), Enum.Material.Neon)
  for s = 0, 2 do for c = 0, 4 do
    part(props, "Coin", Vector3.new(0.3,1.4,1.4), CFrame.new(5 + s * 1.7, 0.15 + c * 0.32, 3.5) * CFrame.Angles(0,0,math.rad(90)), rgb(255,200,40), Enum.Material.Metal, { Shape = Enum.PartType.Cylinder })
  end end
  local sp = Instance.new("Sparkles") sp.SparkleColor = rgb(255,220,80) sp.Parent = props:FindFirstChild("Coin")
  rig("Noob", {-9,0,2}, 20, "noob", "sad")
  rig("Rich", {9,0,2}, -20, "rich", "cheer")
  label(A.labels[1] or "+1", {-9,9,2}, rgb(255,255,255), 3)
  label(A.labels[2] or "+999999", {9,10,2}, rgb(255,210,40), 3.4)
  if A.title ~= "" then label(A.title, {0,15,0}, rgb(255,255,255), 3) end
elseif T == "hero_peek" then
  local sx = (A.side == "right") and -1 or 1
  part(props, "Ground", Vector3.new(60,1,60), CFrame.new(0,-0.5,-10), rgb(110,170,90), Enum.Material.Grass)
  part(props, "PeekWall", Vector3.new(3,14,6), CFrame.new(sx * 6.5,7,10), rgb(200,190,170), Enum.Material.Concrete)
  part(props, "Backdrop", Vector3.new(60,24,1), CFrame.new(0,12,-30), rgb(120,180,240))
  for i = 1, 4 do part(props, "Crate" .. i, Vector3.new(3,3,3), CFrame.new(-10 + i * 5, 1.5, -14 - (i % 2) * 4) * CFrame.Angles(0, math.rad(i * 17), 0), rgb(160,110,60), Enum.Material.WoodPlanks) end
  rig("Hero", {sx * 4.6,0,10}, sx * 25, "hero", "shocked")
  rig("Seeker", {-sx * 3,0,-12}, 0, "seeker", "point")
  rig("Hider", {sx * 8,0,-18}, -sx * 30, "noob", "idle")
  label(A.title, {-sx * 9,9,4}, rgb(255,255,255), 5)
  if cam then
    local dof = Instance.new("DepthOfFieldEffect") dof.Name = "BW_ThumbScene_DOF" dof.FocusDistance = 12 dof.InFocusRadius = 10 dof.FarIntensity = 0.45 dof.NearIntensity = 0 dof.Parent = cam
  end
else -- item_showcase (voxel)
  local pastel = { rgb(255,182,213), rgb(176,224,255), rgb(200,255,190), rgb(255,240,170) }
  for gx = -6, 6 do for gz = -5, 3 do
    part(props, "Voxel", Vector3.new(3,1,3), CFrame.new(gx * 3, -0.5 + ((gx + gz) % 2) * 0.05, gz * 3), ((gx + gz) % 2 == 0) and rgb(120,200,90) or rgb(110,185,85), Enum.Material.SmoothPlastic)
  end end
  local trees = { {-13,-8}, {-8,-12}, {9,-11}, {14,-7}, {-15,2}, {15,1} }
  for i, t in ipairs(trees) do
    part(props, "Trunk" .. i, Vector3.new(1.5,4,1.5), CFrame.new(t[1],2,t[2]), rgb(140,95,60))
    part(props, "Leaves" .. i, Vector3.new(5,4,5), CFrame.new(t[1],6,t[2]), pastel[(i % 4) + 1])
    part(props, "LeavesTop" .. i, Vector3.new(3,2,3), CFrame.new(t[1],9,t[2]), pastel[((i + 1) % 4) + 1])
  end
  rig("Farmer", {0,0,0}, 0, "farmer", "hold")
  local rainbow = { rgb(255,80,80), rgb(255,160,60), rgb(255,230,70), rgb(90,220,110), rgb(80,160,255), rgb(170,100,255) }
  for i, c in ipairs(rainbow) do part(props, "RainbowItem" .. i, Vector3.new(2.2,0.45,0.9), CFrame.new(0, 3.6 + i * 0.45, -2.6), c, Enum.Material.Neon) end
  local ip = Instance.new("PointLight") ip.Range = 10 ip.Brightness = 2 ip.Parent = props:FindFirstChild("RainbowItem3")
  label(A.title, {0,14,0}, rgb(255,255,255), 3.6)
end
scene.Parent = workspace

-- 16:9 auto-framing + frame check (WorldToViewportPoint on the subject box + label legibility at 480x270).
local result = { template = T, parts = 0, fixes = 0 }
for _, d in ipairs(scene:GetDescendants()) do if d:IsA("BasePart") then result.parts += 1 end end
local cf, size = subjects:GetBoundingBox()
local fov = 50
local aspect = 16 / 9
local halfV = math.rad(fov / 2)
local halfH = math.atan(math.tan(halfV) * aspect)
local function needed(margin)
  local hw, hh = size.X / 2 * margin, size.Y / 2 * margin
  return math.max(hh / math.tan(halfV), hw / math.tan(halfH)) + size.Z / 2
end
local margin = (T == "hero_peek") and 1.0 or 1.25
local target = cf.Position + Vector3.new(0, size.Y * 0.08, 0)
local frame = { ok = false, reason = "no camera" }
if cam then
  cam.CameraType = Enum.CameraType.Scriptable
  cam.FieldOfView = fov
  for attempt = 0, 2 do
    local d = needed(margin)
    local pos = target + Vector3.new(0, size.Y * 0.15, d)
    cam.CFrame = CFrame.lookAt(pos, target)
    local vp = cam.ViewportSize
    -- the 16:9 safe rect inside the current viewport
    local w, h = vp.X, vp.X / aspect
    if h > vp.Y then h = vp.Y w = vp.Y * aspect end
    local x0, y0 = (vp.X - w) / 2, (vp.Y - h) / 2
    local inside, total = 0, 0
    for _, sx in ipairs({-1,1}) do for _, sy in ipairs({-1,1}) do for _, sz in ipairs({-1,1}) do
      local p = (cf * CFrame.new(sx * size.X / 2, sy * size.Y / 2, sz * size.Z / 2)).Position
      local v, on = cam:WorldToViewportPoint(p)
      total += 1
      if on and v.X >= x0 and v.X <= x0 + w and v.Y >= y0 and v.Y <= y0 + h then inside += 1 end
    end end end
    local minLabelPx = math.huge
    for _, an in ipairs(labels:GetChildren()) do
      local bb = an:FindFirstChild("BW_Label")
      if bb then
        local hs = bb:GetAttribute("BW_HeightStuds")
        local a1 = cam:WorldToViewportPoint(an.Position + Vector3.new(0, hs / 2, 0))
        local a2 = cam:WorldToViewportPoint(an.Position - Vector3.new(0, hs / 2, 0))
        minLabelPx = math.min(minLabelPx, math.abs(a2.Y - a1.Y) * (270 / h))
      end
    end
    frame = { ok = inside == total and (minLabelPx == math.huge or minLabelPx >= 18), cornersInside = inside, corners = total, minLabelPxAt480x270 = (minLabelPx == math.huge) and nil or math.floor(minLabelPx), viewport = { vp.X, vp.Y }, distance = math.floor(d * 10) / 10 }
    if frame.ok then break end
    if inside < total then margin = margin * 1.15 else margin = margin * 0.9 end
    result.fixes = attempt + 1
  end
end
result.frame = frame
result.camera = cam and { position = { cam.CFrame.Position.X, cam.CFrame.Position.Y, cam.CFrame.Position.Z }, fov = fov } or nil
pcall(function() CHS:SetWaypoint("Brickwire: thumbnail_scene " .. T) end)
return result
`;
  var THUMB_SCENE_VERIFY_LUAU = String.raw`
local s = workspace:FindFirstChild("${SCENE_NAME}")
if not s then return { exists = false } end
local parts, rigs, motors, badC0 = 0, 0, 0, 0
for _, d in ipairs(s:GetDescendants()) do
  if d:IsA("BasePart") then parts += 1 end
  if d:IsA("Humanoid") then rigs += 1 end
  if d:IsA("Motor6D") then
    motors += 1
    if d.Part0 and d.Part1 then
      local want = d.Part0.CFrame * d.C0 * d.C1:Inverse()
      if (want.Position - d.Part1.CFrame.Position).Magnitude > 0.05 then badC0 += 1 end
    end
  end
end
return { exists = true, owned = s:GetAttribute("BW_Owned") == true, template = s:GetAttribute("BW_Template"), parts = parts, rigs = rigs, motors = motors, jointsMismatched = badC0, labels = #s.Labels:GetChildren() }
`;

  // shared/src/safety.ts
  var DESTRUCTIVE_LUAU = [/:\s*Destroy\s*\(/, /:\s*ClearAllChildren\s*\(/, /\.Parent\s*=\s*nil\b/, /:\s*Remove\s*\(/, /Debris\s*:\s*AddItem/];
  var MASS_LUAU = [/\bfor\b[^\n]*\bin\b[^\n]*:\s*Get(Descendants|Children)\s*\(/, /\bfor\b[^\n]*\bin\b[^\n]*\b(workspace|game)\s*:\s*GetService/];
  var BW_WRITE = /\bBW\s*\.\s*(part|new|model|script|patch|screen|ui|particles|light|leaderstats|killPart|remote|folder|set|weldAll|animate|door|rig|keyframes|playAnim|patrol|playerAnims|toolAnim|block|wall|room|roof|stairs|fence|cylinder|plant|array|ring|move|place|ground|kit|furnish|floorplan|building|path|scatter|column|arch|icon|ui(?:Title|Button|IconButton|Panel|Close|Window|Bar|Pill|Card|Toggle|Rays|Juice|Backdrop)|vfx|vfxLib|vfxPreview|cinematic|cinemaLib|camPreview|cutscene|cutsceneLib)\s*[({"'\[]/;
  var MUTATING_LUAU = [BW_WRITE, /[\w\]\)]\s*\.\s*\w+\s*=[^=]/, /Instance\.new/, /:\s*Clone\s*\(/, /\.Source\s*=/, /:\s*Set[A-Z]\w*\s*\(/, /:\s*Insert\w*\s*\(/];
  function findLuauCode(args) {
    for (const k2 of ["code", "source", "luau", "script", "command"]) if (typeof args[k2] === "string") return args[k2];
    const strings = Object.entries(args).filter(([k2, v]) => typeof v === "string" && !/studio_id|datamodel/i.test(k2));
    strings.sort((a, b) => String(b[1]).length - String(a[1]).length);
    return strings.length ? String(strings[0][1]) : "";
  }
  function assessCall(tool, args, importantPaths = []) {
    let risk = tool.risk;
    const reasons = [];
    if (tool.name === "execute_luau") {
      const code = findLuauCode(args).replace(/--\[\[[\s\S]*?\]\]|--[^\n]*/g, "");
      const destructive = DESTRUCTIVE_LUAU.some((r) => r.test(code));
      const mutating = MUTATING_LUAU.some((r) => r.test(code));
      const mass = MASS_LUAU.some((r) => r.test(code)) && (destructive || mutating);
      if (destructive) {
        risk = "destructive";
        reasons.push("Luau code destroys/removes instances");
      }
      if (mass) {
        risk = "destructive";
        reasons.push("Luau code changes many instances in a loop");
      }
      if (!destructive && !mutating) risk = "read";
    }
    const targets = Object.entries(args).filter(([k2, v]) => typeof v === "string" && /path|parent|target|script/i.test(k2)).map(([, v]) => String(v));
    for (const p of targets) {
      const hit = importantPaths.find((ip) => p === ip || p.startsWith(ip + "."));
      if (hit && risk !== "read") {
        reasons.push(`touches important system ${hit}`);
        risk = "destructive";
      }
    }
    if (Array.isArray(args.paths) && args.paths.length > 10 && risk !== "read") {
      risk = "destructive";
      reasons.push(`mass change (${args.paths.length} targets)`);
    }
    if (risk === "destructive" && reasons.length === 0) reasons.push(`${tool.name} is a destructive action`);
    return { risk, reasons };
  }

  // extension/src/core/settings.ts
  var DEFAULT_PROVIDER_PREFS = { category: "general", mode: "auto" };
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
  function prefsFor(s, provider) {
    return { ...DEFAULT_PROVIDER_PREFS, ...s.perProvider?.[provider] ?? {} };
  }
  async function saveProviderPrefs(provider, patch) {
    const cur = await loadSettings();
    const perProvider = { ...cur.perProvider, [provider]: { ...prefsFor(cur, provider), ...patch } };
    await chrome.storage.local.set({ settings: { ...cur, perProvider } });
    return { ...cur, perProvider };
  }
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

  // extension/src/core/persist.ts
  var key = (provider) => `bw_run_${provider}`;
  var MAX_AGE_MS = 24 * 3600 * 1e3;
  async function loadRun(provider) {
    try {
      const r = await chrome.storage.local.get(key(provider));
      const s = r?.[key(provider)];
      if (!s || s.v !== 1 || Date.now() - s.savedAt > MAX_AGE_MS) return null;
      return s;
    } catch {
      return null;
    }
  }
  function saveRun(s) {
    try {
      void chrome.storage.local.set({ [key(s.provider)]: s });
    } catch {
    }
  }
  function clearRun(provider) {
    try {
      void chrome.storage.local.remove(key(provider));
    } catch {
    }
  }

  // extension/src/core/fast-turn.ts
  var ReplyEndDetector = class {
    opts;
    sawStop = false;
    stopGoneAt = 0;
    lastChange = 0;
    constructor(opts) {
      this.opts = opts;
    }
    /** New reply expected (we just sent a message). */
    reset(now) {
      this.sawStop = false;
      this.stopGoneAt = 0;
      this.lastChange = now;
    }
    /**
     * One observation. stopVisible = explicit provider Stop/streaming signal (null = provider has none).
     * changed = the assistant text/DOM changed since the previous sample.
     */
    sample(now, stopVisible, changed) {
      if (changed) this.lastChange = now;
      if (stopVisible === true) {
        this.sawStop = true;
        this.stopGoneAt = 0;
        this.lastChange = now;
      } else if (stopVisible === false && this.sawStop && !this.stopGoneAt) this.stopGoneAt = now;
    }
    /** The Stop signal was seen for the current reply (fast path available). */
    get fastPath() {
      return this.sawStop;
    }
    quietMs(now) {
      return now - this.lastChange;
    }
    /** null = not finished yet. */
    done(now, settleMs = this.opts.settleMs) {
      if (this.sawStop) {
        if (!this.stopGoneAt) return null;
        return now - Math.max(this.stopGoneAt, this.lastChange) >= this.opts.fastEndMs ? "stop" : null;
      }
      return now - this.lastChange >= settleMs ? "settle" : null;
    }
  };
  function callKey(replyIndex, c) {
    return `${replyIndex}|${c.id}|${c.tool}|${stableJson(c.args)}`;
  }
  function stableJson(v) {
    if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
    if (Array.isArray(v)) return "[" + v.map(stableJson).join(",") + "]";
    const o = v;
    return "{" + Object.keys(o).sort().map((k2) => JSON.stringify(k2) + ":" + stableJson(o[k2])).join(",") + "}";
  }
  var CallScheduler = class {
    opts;
    seen = /* @__PURE__ */ new Map();
    /** resolves when every write submitted so far has finished */
    writeTail = Promise.resolve();
    /** resolves when every call submitted so far has finished (a write waits for all earlier calls) */
    allTail = Promise.resolve();
    running = 0;
    readQueue = [];
    order = [];
    constructor(opts) {
      this.opts = { readParallel: Math.max(1, Math.floor(opts.readParallel || 1)) };
    }
    has(key2) {
      return this.seen.has(key2);
    }
    get size() {
      return this.seen.size;
    }
    /** Returns the (shared) promise; a duplicate key returns the first promise and never re-runs. */
    submit(key2, risk, run) {
      const prev = this.seen.get(key2);
      if (prev) return prev;
      this.order.push(key2);
      const swallow = (p2) => p2.then(() => void 0, () => void 0);
      let p;
      if (risk === "read") {
        const gate = this.writeTail;
        p = swallow(gate).then(() => this.withReadSlot(run));
      } else {
        const gate = this.allTail;
        p = swallow(gate).then(run);
        this.writeTail = swallow(Promise.all([this.writeTail, p]));
      }
      this.allTail = swallow(Promise.all([this.allTail, p]));
      this.seen.set(key2, p);
      return p;
    }
    /** Wait until everything submitted so far has settled. */
    async drain() {
      let n = -1;
      while (n !== this.seen.size) {
        n = this.seen.size;
        await Promise.allSettled([...this.seen.values()]);
      }
    }
    async withReadSlot(run) {
      if (this.running >= this.opts.readParallel) await new Promise((r) => this.readQueue.push(r));
      this.running++;
      try {
        return await run();
      } finally {
        this.running--;
        this.readQueue.shift()?.();
      }
    }
  };
  var StepTimer = class {
    steps = [];
    now;
    constructor(now = () => Date.now()) {
      this.now = now;
    }
    add(step, ms) {
      this.steps.push({ step, ms: Math.max(0, Math.round(ms)) });
    }
    async time(step, fn) {
      const t = this.now();
      try {
        return await fn();
      } finally {
        this.add(step, this.now() - t);
      }
    }
    summary() {
      return this.steps.map((s) => `${s.step} ${fmtMs(s.ms)}`).join(" \xB7 ");
    }
  };
  function fmtMs(ms) {
    return ms < 1e3 ? `${Math.round(ms)} ms` : `${(ms / 1e3).toFixed(1)} s`;
  }

  // shared/src/hang-monitor.ts
  var DEFAULT_HANG_THRESHOLDS = {
    stuckGenerationMs: 9e4,
    deliveryMs: 8e3,
    maxSendRetries: 2,
    callTimeoutMs: 12e4,
    backoffBaseMs: 1e3,
    backoffMaxMs: 3e4,
    loopRepeats: 3
  };
  var CONTINUE_MESSAGE = "Continue exactly from where you stopped. Do not repeat finished steps.";
  var WRONG_MODE = [
    { re: /edit\s*data\s*model\s+is\s+not\s+available/i, datamodel: "server" },
    { re: /not\s+available\s+in\s+play\s+mode/i, datamodel: "server" },
    { re: /(server|client)\s*data\s*model\s+is\s+not\s+available/i, datamodel: "edit" },
    { re: /studio\s+is\s+not\s+in\s+(play|run)\s+mode/i, datamodel: "edit" }
  ];
  function wrongModeTarget(error) {
    for (const w of WRONG_MODE) if (w.re.test(error)) return w.datamodel;
    return null;
  }
  var HangMonitor = class {
    t;
    fired = /* @__PURE__ */ new Set();
    sendRetries = 0;
    bridgeFailures = 0;
    recentHashes = [];
    log = [];
    constructor(t = {}) {
      this.t = { ...DEFAULT_HANG_THRESHOLDS, ...t };
    }
    once(incident, ev) {
      if (this.fired.has(incident)) return null;
      this.fired.add(incident);
      this.log.push(ev.log);
      return ev;
    }
    /** Forget incidents of the previous reply (call after a new reply starts). */
    newReply() {
      this.fired.clear();
      this.sendRetries = 0;
    }
    /** 1 — Stop visible, no text growth for stuckGenerationMs. */
    generation(o) {
      if (!o.stopVisible || o.now - o.lastGrowthAt < this.t.stuckGenerationMs) return null;
      return this.once(`gen:${o.replyIndex}`, {
        kind: "model_never_finishes",
        recovery: { kind: "press_stop_and_continue", message: CONTINUE_MESSAGE },
        log: `Model stuck ${Math.round((o.now - o.lastGrowthAt) / 1e3)} s without new text \u2014 pressing Stop and asking to continue`
      });
    }
    /** 2 — reply finished but contains an unclosed tool block. */
    replyEnded(o) {
      if (!o.hasIncomplete) return null;
      const tag = o.incompleteTag ?? "ROBLOX_TOOL_CALL";
      return this.once(`trunc:${o.replyIndex}`, {
        kind: "reply_ended_mid_block",
        recovery: { kind: "ask_resend_block", message: `Your last <${tag}> block was cut off. Resend ONLY that block, complete and closed. Do not repeat earlier blocks.` },
        log: `Reply ended inside an unclosed <${tag}> \u2014 asked to resend only that block`
      });
    }
    /** 3 — message not delivered: composer still holds our text / no new user message. */
    delivery(o) {
      if (o.delivered) {
        this.sendRetries = 0;
        return null;
      }
      if (o.now - o.sentAt < this.t.deliveryMs) return null;
      if (this.sendRetries >= this.t.maxSendRetries) {
        return this.once(`deliv-giveup:${o.sentAt}`, {
          kind: "message_not_delivered",
          recovery: { kind: "notify_user", message: "Brickwire could not send the message. Click into the chat box and press Send, or press Resume." },
          log: `Message not delivered after ${this.sendRetries} retries \u2014 user notified`
        });
      }
      const attempt = ++this.sendRetries;
      const ev = {
        kind: "message_not_delivered",
        recovery: { kind: "retry_send", attempt, refocus: o.composerHoldsText || attempt > 1 },
        log: `Message not delivered after ${Math.round((o.now - o.sentAt) / 1e3)} s \u2014 retry ${attempt}${o.composerHoldsText ? " (composer refocused)" : ""}`
      };
      this.log.push(ev.log);
      return ev;
    }
    /** 4 — a tool call without result for callTimeoutMs. */
    callPending(o) {
      const limit = o.timeoutMs ?? this.t.callTimeoutMs;
      if (o.now - o.startedAt < limit) return null;
      return this.once(`call:${o.callId}`, {
        kind: "studio_not_responding",
        recovery: { kind: "fail_call", callId: o.callId, pingStudio: true, message: `Studio did not answer ${o.tool} within ${Math.round(limit / 1e3)} s; the call was marked failed. Check that Studio is open and not blocked by a dialog, then retry.` },
        log: `${o.tool}: no result for ${Math.round((o.now - o.startedAt) / 1e3)} s \u2014 pinging Studio, call marked failed, model told`
      });
    }
    /** 5 — Studio refused because of the play/edit state. */
    callError(o) {
      if (o.retried) return null;
      const dm = wrongModeTarget(o.error);
      if (!dm) return null;
      return this.once(`mode:${o.callId}`, {
        kind: "studio_wrong_mode",
        recovery: { kind: "read_state_and_retry", callId: o.callId, datamodel: dm },
        log: `${o.tool}: Studio in the wrong mode ("${o.error.slice(0, 80)}") \u2014 reading get_studio_state, retrying in ${dm}`
      });
    }
    /** 6 — bridge health check result. Returns a reconnect decision with exponential backoff while offline. */
    bridgeHealth(ok) {
      if (ok) {
        const was = this.bridgeFailures;
        this.bridgeFailures = 0;
        if (was) this.log.push(`Bridge back online after ${was} failed checks`);
        return null;
      }
      const n = ++this.bridgeFailures;
      const delayMs = Math.min(this.t.backoffMaxMs, this.t.backoffBaseMs * 2 ** (n - 1));
      const ev = {
        kind: "bridge_offline",
        recovery: { kind: "reconnect", delayMs, banner: "Bridge offline \u2014 reconnecting\u2026 (run `npm start` in the Brickwire folder if this stays)" },
        log: `Bridge health check failed (${n}) \u2014 reconnect in ${Math.round(delayMs / 1e3)} s`
      };
      this.log.push(ev.log);
      return ev;
    }
    /** 7 — the same call (tool + args hash) issued loopRepeats times in a row across turns. */
    callIssued(hash, tool) {
      this.recentHashes.push(hash);
      if (this.recentHashes.length > this.t.loopRepeats) this.recentHashes.shift();
      const loop = this.recentHashes.length === this.t.loopRepeats && this.recentHashes.every((h) => h === hash);
      if (!loop) return null;
      this.recentHashes = [];
      const ev = {
        kind: "call_loop",
        recovery: { kind: "stop_loop", message: `You called ${tool} with the same arguments ${this.t.loopRepeats} times. Stop repeating it: explain what you expected, read the last result, and choose a different step.` },
        log: `Loop: ${tool} with identical args ${this.t.loopRepeats}\xD7 \u2014 auto-run stopped, model and user told`
      };
      this.log.push(ev.log);
      return ev;
    }
    /** 8 — the model is waiting for the user. */
    waitingForUser(o) {
      if (o.hasCalls || !(o.ask || o.question)) return null;
      return this.once(`ask:${o.replyIndex}`, {
        kind: "waiting_for_user",
        recovery: { kind: "notify_user", message: "The AI is waiting for your answer \u2014 reply in the chat to continue." },
        log: "AI asked a question \u2014 user notified, not auto-continuing"
      });
    }
  };

  // extension/src/core/agent-core.ts
  var TEST_TOOLS = /^(start_stop_play|get_console_output|get_errors|character_navigation|user_keyboard_input|user_mouse_input|screen_capture|get_studio_state)$/;
  var STAGES = ["ANALYZE", "PLAN", "EXECUTE", "TEST", "FIX", "DONE"];
  var AgentCore = class {
    active = false;
    paused = false;
    /** Studio plugin link: every activity row / reply / stage change is mirrored here (see core/plugin-link.ts). */
    onPluginEvent = null;
    emit(e) {
      try {
        this.onPluginEvent?.(e);
      } catch {
      }
    }
    lastPartialAt = 0;
    /**
     * A new user request (Studio plugin / app) may only go out when the agent is between turns: not running
     * tools, not sending, not waiting for a reply that is still coming. Otherwise it would cut into the
     * agent's own turn (tool results + the user's message mixed, reply tracking broken).
     */
    readyForUser() {
      if (!this.active) return true;
      if (this.busy || this.sending || this.inflight || this.adapter.isGenerating()) return false;
      if (this.awaitingReply && Date.now() - (this.sentAt || 0) < 18e4) return false;
      return true;
    }
    sessionId = null;
    stage = "IDLE";
    task = null;
    lastHealth;
    tools = /* @__PURE__ */ new Map();
    baselineKey = "";
    processedKeys = /* @__PURE__ */ new Set();
    lastSeenKey = "";
    lastChangeAt = 0;
    busy = false;
    /** A send is in progress (any caller). The loop and the delivery watchdog wait for it to finish. */
    sending = 0;
    timer = null;
    healthTimer = null;
    observer = null;
    remindersThisTurn = 0;
    autoTurns = 0;
    unverified = false;
    unverifiedNagged = false;
    executedIds = /* @__PURE__ */ new Set();
    awaitingReply = false;
    actSeq = 0;
    /** We (not the user) sent the message the next reply answers. */
    agentSent = false;
    /** M1: chat path + memory of the last full-instructions send (re-sent on new chat / user request). */
    chatPath = "";
    lastMemory = "";
    lastResendAt = 0;
    lastPrompt = "";
    /** Auto-resume: turn-limit continuations used in this task, and "paused because the bridge went offline". */
    autoResumes = 0;
    pausedByBridge = false;
    /** First reply after instructions without a task is just "ready". */
    awaitingReady = false;
    /** Tools executed since the user's last own message. */
    toolsSinceUser = 0;
    hiddenNotified = false;
    /** A message that could not be sent; retried on Resume. */
    pendingSend = null;
    /** Last message we put into the composer (so leftover text of OURS is never mistaken for a user draft). */
    lastInjected = "";
    /** Delivery watchdog for the last message we sent (see checkDelivery). */
    delivery = null;
    adapter;
    /** M1 fast response */
    endDet;
    /** M3 hang monitor (docs/HANGS.md) */
    hang = new HangMonitor();
    lastGrowthAt = Date.now();
    sched = null;
    schedReply = -1;
    sentAt = 0;
    stepTimer = null;
    bridge;
    ui;
    settings;
    onStateChange;
    constructor(adapter, bridge, ui, settings, onStateChange = () => void 0) {
      this.adapter = adapter;
      this.bridge = bridge;
      this.ui = ui;
      this.settings = settings;
      this.onStateChange = onStateChange;
      this.endDet = new ReplyEndDetector({ fastEndMs: settings.fastEndMs ?? 250, settleMs: settings.settleMs });
      this.prefs = prefsFor(settings, adapter.info.id);
      const orig = ui.activity.bind(ui);
      ui.activity = (key2, text, state) => {
        const i = this.activityLog.findIndex((a) => a.k === key2);
        if (i >= 0) this.activityLog[i] = { k: key2, t: text, s: state };
        else this.activityLog.push({ k: key2, t: text, s: state });
        if (this.activityLog.length > 40) this.activityLog.splice(0, this.activityLog.length - 40);
        orig(key2, text, state);
        this.persist();
        this.emit({ type: "activity", key: key2, text, state });
      };
      const origNotify = ui.notify.bind(ui);
      ui.notify = (msg, level) => {
        origNotify(msg, level);
        this.emit({ type: "notice", text: msg, level });
      };
    }
    // -------------------------------------------------------------- persistence (survives page reload)
    activityLog = [];
    inflight = null;
    lastHandledCount = -1;
    persist() {
      if (!this.active || !this.sessionId) return;
      const keep = (a, n) => a.slice(Math.max(0, a.length - n));
      saveRun({
        v: 1,
        provider: this.adapter.info.id,
        sessionId: this.sessionId,
        path: location.pathname,
        savedAt: Date.now(),
        paused: this.paused,
        stage: this.stage,
        task: this.task,
        executed: keep([...this.executedIds], 400),
        processed: keep([...this.processedKeys], 400),
        baselineKey: this.baselineKey,
        lastHandledCount: this.lastHandledCount,
        awaitingReply: this.awaitingReply,
        awaitingReady: this.awaitingReady,
        agentSent: this.agentSent,
        toolsSinceUser: this.toolsSinceUser,
        remindersThisTurn: this.remindersThisTurn,
        autoTurns: this.autoTurns,
        unverified: this.unverified,
        unverifiedNagged: this.unverifiedNagged,
        activity: this.activityLog,
        inflight: this.inflight,
        knownTools: [...this.knownTools]
      });
    }
    /**
     * After a page reload: if this chat had a running agent and the bridge session is still alive,
     * restore everything (panel log, stage, task) and continue exactly where it stopped.
     * Calls that were running during the reload are picked up by their bridge callId — never re-run.
     */
    async tryResume() {
      const s = await loadRun(this.adapter.info.id);
      if (!s || this.active) return false;
      if (s.path !== location.pathname) return false;
      const h = await this.bridge.health();
      if (!h.online || h.health?.session?.id !== s.sessionId) {
        if (h.online) {
          clearRun(this.adapter.info.id);
          this.ui.notify("The agent session from before the reload has ended (bridge restarted or stopped). Press Start Agent to begin a new one.", "warn");
        } else this.ui.notify("Bridge offline \u2014 start start.bat and reload the page to continue the agent from before the reload.", "warn");
        return false;
      }
      const tools = await this.bridge.tools();
      this.tools = new Map((tools ?? []).map((t) => [t.name, t]));
      this.knownTools = new Set(s.knownTools ?? (tools ?? []).filter((t) => !t.name.startsWith("file_")).map((t) => t.name));
      this.sessionId = s.sessionId;
      this.active = true;
      this.paused = s.paused;
      this.stage = s.stage;
      this.task = s.task;
      this.executedIds = new Set(s.executed);
      this.processedKeys = new Set(s.processed);
      this.baselineKey = s.baselineKey;
      this.lastHandledCount = s.lastHandledCount;
      this.awaitingReply = s.awaitingReply;
      this.awaitingReady = s.awaitingReady;
      this.agentSent = s.agentSent;
      this.toolsSinceUser = s.toolsSinceUser;
      this.remindersThisTurn = s.remindersThisTurn;
      this.autoTurns = s.autoTurns;
      this.unverified = s.unverified;
      this.unverifiedNagged = s.unverifiedNagged;
      this.inflight = s.inflight;
      for (const a of s.activity) this.ui.activity(a.k, a.t, a.s);
      this.ui.setSession({ active: true, paused: this.paused, sessionId: this.sessionId });
      this.ui.setStage(this.stage);
      this.ui.setTask(this.task ?? "Waiting for your task");
      this.ui.activity("resume" + Date.now(), "Page reloaded \u2014 agent restored", "info");
      this.onStateChange();
      for (let i = 0; i < 40; i++) {
        if (this.adapter.readAssistantResponse().count >= Math.max(0, this.lastHandledCount)) break;
        await sleep(250);
      }
      const cur = this.adapter.readAssistantResponse();
      const curKey = this.keyOf(cur.count, cur.text);
      if (cur.count <= this.lastHandledCount || this.inflight) {
        this.processedKeys.add(curKey);
        this.baselineKey = curKey;
      }
      this.lastSeenKey = curKey;
      this.lastChangeAt = Date.now();
      this.observer = new MutationObserver(() => this.onMutation());
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      this.timer = every(500, () => void this.tickLoop());
      this.persist();
      if (this.inflight) {
        this.busy = true;
        void this.runBatch(this.inflight).finally(() => this.busy = false);
      }
      return true;
    }
    /** Category + approval mode chosen in the panel for THIS AI site. */
    prefs;
    /** Approval mode changed in the panel: applies immediately to the running session. */
    async setMode(mode) {
      this.prefs = { ...this.prefs, mode };
      if (this.sessionId) await this.bridge.updateSession(this.sessionId, { mode, trustAll: false });
      if (this.active) this.ui.activity("mode" + ++this.actSeq, `Approvals: ${mode}`, "info");
    }
    /** Notion mode: Dev Log page on/off (takes effect at the next Start; a running session gets a note). */
    async setNotionLog(on) {
      this.prefs = { ...this.prefs, notionLog: on };
      if (!this.active || !this.sessionId || this.busy) return;
      this.busy = true;
      try {
        await this.send(on ? 'From now on also keep the Notion page "Roblox Dev Log" updated after each finished step (use your native Notion tools; Studio still only via tool calls). Reply READY.' : 'Stop updating the "Roblox Dev Log" page. Reply READY.');
        this.awaitingReady = true;
      } finally {
        this.busy = false;
      }
    }
    /** SUPER mode on/off (prompt section at the next Start; a running session gets the instructions now). */
    async setSuperMode(on) {
      if (!!this.prefs.superMode === on) return;
      this.prefs = { ...this.prefs, superMode: on };
      this.ui.activity("super" + ++this.actSeq, on ? "SUPER mode on \u2014 deep thinking, phased build, self-review" : "SUPER mode off", "info");
      if (!this.active || !this.sessionId || this.busy) return;
      this.busy = true;
      try {
        await this.send(on ? `[Roblox Agent] ${superSection(false)}
Reply "ok" and apply this to my next requests.` : `[Roblox Agent] SUPER mode is OFF \u2014 normal speed again (still inspect and verify). Reply "ok".`);
        this.awaitingReady = true;
      } finally {
        this.busy = false;
      }
    }
    /** Category changed: stored for this AI; a running session gets a short focus message. */
    async setCategory(category) {
      if (this.prefs.category === category) return;
      this.prefs = { ...this.prefs, category };
      if (!this.sessionId || !this.active) return;
      await this.bridge.updateSession(this.sessionId, { category });
      const info2 = CATEGORY_INFO[category];
      this.ui.activity("cat" + ++this.actSeq, `Category: ${info2.label}`, "info");
      this.busy = true;
      try {
        await this.send(REMINDERS.category(info2.label, info2.focus));
        this.awaitingReady = true;
      } finally {
        this.busy = false;
      }
    }
    /** Approve this call and every further confirmation in this session. */
    async approveAll(approvalId) {
      if (this.sessionId) await this.bridge.updateSession(this.sessionId, { trustAll: true });
      this.ui.activity("trust" + ++this.actSeq, "All actions approved for this session", "info");
      await this.approve(approvalId, true);
    }
    // -------------------------------------------------------------- lifecycle
    startMonitoring() {
      void this.refreshHealth();
      this.healthTimer = every(3e3, () => void this.refreshHealth());
    }
    async refreshHealth() {
      const h = await this.bridge.health();
      this.lastHealth = h.health;
      this.ui.setConnection(h);
      this.checkVersions(h.health?.bridgeVersion);
      if (this.active && !h.online && !this.paused) {
        this.pause(true);
        this.pausedByBridge = true;
        this.ui.notify("Bridge offline \u2014 session paused. It resumes by itself when the bridge is back.", "error");
      }
      if (this.active && h.online && this.paused && this.pausedByBridge && this.autoResumeOn()) {
        this.pausedByBridge = false;
        this.ui.notify("Bridge is back \u2014 auto-resumed.", "info");
        this.pause(false);
      }
      if (this.active && h.online && h.health && !h.health.session) {
        this.ui.notify("Session ended by the bridge.", "warn");
        this.teardown();
      }
      return h;
    }
    versionWarned = "";
    /** Extension and bridge from different Brickwire releases → new tools/fixes are missing on one side. Warn once. */
    checkVersions(bridgeVersion) {
      let ext = "";
      try {
        ext = typeof chrome !== "undefined" ? chrome.runtime?.getManifest?.()?.version ?? "" : "";
      } catch {
      }
      if (!ext || !bridgeVersion || ext === bridgeVersion || this.versionWarned === bridgeVersion) return;
      this.versionWarned = bridgeVersion;
      const newer = ext.localeCompare(bridgeVersion, void 0, { numeric: true }) > 0;
      this.ui.notify(newer ? `The bridge is an older version (${bridgeVersion}, extension ${ext}) \u2014 close the old bridge window / run stop.bat, then start.bat (or reopen the Brickwire app). New tools appear after that.` : `The extension is older (${ext}) than the bridge (${bridgeVersion}) \u2014 open chrome://extensions and press Reload on Brickwire, then reload this page.`, "warn");
    }
    async start() {
      if (this.active) return;
      const block = this.adapter.blockReason();
      if (block) return this.ui.notify(block, "error");
      const health = this.adapter.health();
      if (!health.ok) return this.ui.notify(`Provider integration unavailable: ${health.problems.join(", ")}`, "error");
      const h = await this.refreshHealth();
      if (!h.online) return this.ui.notify("Bridge offline \u2014 run start.bat (or npm start) and try again.", "error");
      const st = h.health.state;
      if (st !== "MCP_READY" && st !== "SESSION_ACTIVE") return this.ui.notify(`Studio not ready \u2014 ${h.health.reason}`, "error");
      const draft = composerText(this.adapter.getComposer()).trim() || null;
      if (draft) this.lastInjected = draft;
      let res;
      try {
        res = await this.bridge.startSession(this.adapter.info.id, draft, { mode: this.prefs.mode, category: this.prefs.category });
      } catch (e) {
        return this.ui.notify(e.message, "error");
      }
      this.sessionId = res.session.id;
      this.tools = new Map(res.tools.map((t) => [t.name, t]));
      this.knownTools = new Set(res.tools.filter((t) => t.available).map((t) => t.name));
      this.task = draft;
      this.active = true;
      this.paused = false;
      this.stage = "ANALYZE";
      this.autoTurns = 0;
      this.remindersThisTurn = 0;
      this.unverified = false;
      this.executedIds.clear();
      this.processedKeys.clear();
      const cur = this.adapter.readAssistantResponse();
      this.baselineKey = this.keyOf(cur.count, cur.text);
      this.lastSeenKey = this.baselineKey;
      this.ui.setSession({ active: true, paused: false, sessionId: this.sessionId });
      this.ui.setStage(this.stage);
      this.ui.setTask(this.task ?? "Waiting for your task");
      this.ui.activity("start", `Session ${this.sessionId} \xB7 ${res.tools.filter((t) => t.available).length} tools`, "done");
      this.onStateChange();
      const prompt = buildAgentPrompt({ providerName: this.adapter.info.name, tools: res.tools, memorySummary: res.memorySummary, task: draft, sessionId: this.sessionId, category: this.prefs.category, providerId: this.adapter.info.id, notionLog: !!this.prefs.notionLog, maxChars: this.adapter.info.maxMessageChars, superMode: !!this.prefs.superMode });
      this.lastPrompt = prompt;
      this.autoResumes = 0;
      this.agentSent = true;
      this.chatPath = location.pathname;
      this.lastMemory = res.memorySummary;
      this.awaitingReady = !draft;
      this.toolsSinceUser = 0;
      const sent = await this.send(prompt, { pauseOnFail: false });
      if (!sent) {
        this.ui.notify("Could not send the agent instructions (composer/send not found). Provider integration unavailable.", "error");
        await this.stop();
        return;
      }
      this.awaitingReply = true;
      this.ui.activity("prompt", "Agent instructions injected", "done");
      this.lastChangeAt = Date.now();
      this.observer = new MutationObserver(() => this.onMutation());
      this.observer.observe(document.body, { subtree: true, childList: true, characterData: true });
      this.timer = every(500, () => void this.tickLoop());
    }
    /**
     * A request from the panel (Library "Build this" / "Make something like it"): starts the agent with it as the
     * task, or — when a session is already running — sends it as a new user turn (fresh turn budget).
     */
    async submitTask(text, source = "the Brickwire panel") {
      if (!this.active) {
        const c = this.adapter.getComposer();
        if (!c) {
          this.ui.notify("Message box not found \u2014 open a chat first.", "error");
          return false;
        }
        await setComposerText(c, text, { allowRawWrite: this.adapter.info.id !== "notion" });
        await this.start();
        return this.active;
      }
      this.toolsSinceUser = 0;
      this.remindersThisTurn = 0;
      this.unverifiedNagged = false;
      this.autoTurns = 0;
      this.setTask(text.split("\n")[0].slice(0, 140));
      this.ui.activity("lib" + ++this.actSeq, source === "the Brickwire panel" ? "Library request sent" : `Request from ${source} sent`, "info");
      const news = await this.toolNews();
      const ok = await this.send(`NEW USER REQUEST (from ${source}):
` + text + (news ? "\n\n" + news : ""));
      this.persist();
      return ok;
    }
    /** Put text into the site's message box without sending (e.g. the user still has to attach a screenshot). */
    async fillComposer(text) {
      const c = this.adapter.getComposer();
      if (!c) return false;
      return setComposerText(c, text, { allowRawWrite: this.adapter.info.id !== "notion" });
    }
    pause(p = !this.paused) {
      if (!this.active) return;
      this.paused = p;
      this.ui.setSession({ active: true, paused: p, sessionId: this.sessionId });
      this.ui.activity("pause" + ++this.actSeq, p ? "Paused" : "Resumed", "info");
      this.onStateChange();
      if (!p && this.pendingSend) {
        const text = this.pendingSend;
        this.pendingSend = null;
        this.busy = true;
        void this.send(text).finally(() => this.busy = false);
      }
    }
    async stop() {
      const id = this.sessionId;
      this.teardown();
      if (id) await this.bridge.stopSession(id);
      this.ui.activity("stop" + ++this.actSeq, "Session stopped", "info");
    }
    teardown() {
      clearRun(this.adapter.info.id);
      this.inflight = null;
      this.activityLog = [];
      this.active = false;
      this.paused = false;
      this.observer?.disconnect();
      this.observer = null;
      this.timer?.();
      this.timer = null;
      this.delivery = null;
      this.ui.showApproval(null);
      this.ui.setSession({ active: false, paused: false, sessionId: null });
      this.stage = "IDLE";
      this.ui.setStage("IDLE");
      this.sessionId = null;
      this.onStateChange();
    }
    async approve(approvalId, ok) {
      await this.bridge.decide(approvalId, ok);
      this.ui.showApproval(null);
    }
    // -------------------------------------------------------------- observe
    keyOf(count, text) {
      return `${count}|${hashText(text)}`;
    }
    onMutation() {
      const a = this.adapter.readAssistantResponse();
      const k2 = this.keyOf(a.count, a.text);
      if (k2 !== this.lastSeenKey) {
        this.lastSeenKey = k2;
        this.lastChangeAt = Date.now();
      }
    }
    /**
     * M1: re-send the FULL agent instructions into the running session (new chat in the same tab, user
     * request "/bw rules", or the panel button). Rate-limited to once per 20 s.
     */
    async resendInstructions(reason) {
      if (!this.active || !this.sessionId) return false;
      const now = Date.now();
      if (now - this.lastResendAt < 2e4) return false;
      this.lastResendAt = now;
      const prompt = this.lastPrompt;
      if (!prompt) return false;
      this.ui.activity("resend" + ++this.actSeq, `Full instructions re-sent (${reason.replace("_", " ")})`, "info");
      this.agentSent = true;
      this.chatPath = location.pathname;
      const ok = await this.send(prompt, { pauseOnFail: false });
      if (ok) this.awaitingReply = true;
      return ok;
    }
    /** M1: "/bw rules" | "/bw instructions" | "/brickwire правила" typed by the user. */
    static isResendCommand(text) {
      return /^\s*\/(bw|brickwire)\s+(rules|instructions|prompt|правила|инструкции)(?=\s|$|[.,!?])/i.test(text);
    }
    async tickLoop() {
      if (!this.active || this.paused || this.busy || this.sending) return;
      if (this.chatPath && location.pathname !== this.chatPath && this.adapter.getComposer() && this.adapter.readAssistantResponse().count === 0) {
        await this.resendInstructions("new_chat");
        return;
      }
      const hidden = document.hidden;
      if (hidden && !this.hiddenNotified) {
        this.hiddenNotified = true;
        this.ui.activity("hidden", "Tab in background \u2014 agent keeps working", "info");
      } else if (!hidden && this.hiddenNotified) {
        this.hiddenNotified = false;
        this.ui.activity("hidden", "Tab in background \u2014 agent keeps working", "done");
      }
      if (await this.checkDelivery()) return;
      const prevKey = this.lastSeenKey;
      this.onMutation();
      const now = Date.now();
      const stop = this.adapter.stopSignal ? this.adapter.stopSignal() : null;
      this.endDet.sample(now, stop, this.lastSeenKey !== prevKey);
      if (this.lastSeenKey !== prevKey || stop !== true) this.lastGrowthAt = now;
      const stuck = this.hang.generation({ now, stopVisible: stop === true, lastGrowthAt: this.lastGrowthAt, replyIndex: this.lastHandledCount + 1 });
      if (stuck) {
        this.ui.activity("hang" + ++this.actSeq, stuck.log, "error");
        this.adapter.pressStop?.();
        await sleep(800);
        this.lastGrowthAt = Date.now();
        await this.sendSystem(CONTINUE_MESSAGE);
        return;
      }
      if (this.adapter.isGenerating()) {
        this.lastChangeAt = now;
        if (this.onPluginEvent && now - this.lastPartialAt > 1200) {
          this.lastPartialAt = now;
          const cur = this.adapter.readAssistantResponse();
          const prose = replyProse(cur.text);
          if (prose) this.emit({ type: "reply", key: String(cur.count), partial: true, text: prose });
        }
        if (this.settings.streamExec !== false) this.streamExec();
        if (!(this.endDet.fastPath && stop === false)) return;
      }
      const via = this.endDet.fastPath ? this.endDet.done(now) : null;
      if (this.endDet.fastPath && !via) return;
      const quiet = now - this.lastChangeAt;
      const settle = hidden ? Math.max(4e3, this.settings.settleMs * 3) : this.settings.settleMs;
      if (!via && quiet < settle) return;
      const a = this.adapter.readAssistantResponse();
      const key2 = this.keyOf(a.count, a.text);
      if (!a.text.trim() || key2 === this.baselineKey || this.processedKeys.has(key2)) return;
      const tParse = Date.now();
      const parsed = this.adapter.extractToolCalls(a.text);
      const parseMs = Date.now() - tParse;
      const sinceEnd = this.endDet.quietMs(now);
      if (via) {
        if (parsed.hasIncomplete && sinceEnd < (hidden ? 4e3 : 1500)) return;
      } else {
        if (parsed.hasIncomplete && quiet < (hidden ? 6e4 : Math.max(8e3, this.settings.settleMs * 4))) return;
        const plain = !parsed.calls.length && !parsed.done && !parsed.invalidCalls.length && !parsed.forgedResults && !parsed.statuses.length;
        if (plain && quiet < (hidden ? 12e3 : Math.max(4e3, this.settings.settleMs * 2))) return;
      }
      this.stepTimer = new StepTimer();
      if (this.sentAt) this.stepTimer.add(via ? "wait for model" : "wait for model (settle fallback)", now - this.sentAt);
      this.stepTimer.add("parse", parseMs);
      if (this.delivery) this.delivery.confirmed = true;
      this.processedKeys.add(key2);
      this.lastHandledCount = a.count;
      this.emit({ type: "reply", key: String(a.count), partial: false, text: replyProse(a.text), calls: parsed.calls.length });
      this.busy = true;
      try {
        await this.handleResponse(parsed, a.count);
      } catch (e) {
        this.ui.notify("Agent loop error: " + e.message, "error");
      } finally {
        this.busy = false;
        this.lastChangeAt = Date.now();
      }
    }
    // -------------------------------------------------------------- handle
    async handleResponse(p, replyIndex) {
      this.awaitingReply = false;
      const replyToUser = !this.agentSent;
      this.agentSent = false;
      if (replyToUser) {
        this.toolsSinceUser = 0;
        this.remindersThisTurn = 0;
        this.unverifiedNagged = false;
        this.autoTurns = 0;
      }
      const wasAwaitingReady = this.awaitingReady;
      this.awaitingReady = false;
      for (const s of p.statuses) {
        const st = String(s.stage ?? "").toUpperCase();
        if (STAGES.includes(st) && st !== "DONE") this.setStage(st);
        if (typeof s.task === "string" && s.task.trim() && s.task !== "ready") this.setTask(s.task.trim());
        if (typeof s.note === "string" && s.note) this.ui.activity("st" + ++this.actSeq, s.note.slice(0, 120), "info");
      }
      for (const e of p.errors) this.ui.activity("err" + ++this.actSeq, "AI: " + String(e.message ?? "error").slice(0, 140), "error");
      if (p.forgedResults && !p.calls.length) {
        this.ui.activity("forged" + ++this.actSeq, "AI wrote a fake RBX_TOOL_RESULT \u2014 ignored", "error");
        return this.sendSystem(REMINDERS.forged);
      }
      if (p.invalidCalls.length && !p.calls.length) {
        this.ui.activity("inv" + ++this.actSeq, `Invalid tool call (${p.invalidCalls[0].problem})`, "error");
        return this.sendSystem(REMINDERS.invalid(p.invalidCalls.map((b) => b.problem ?? "invalid")));
      }
      if (p.hasIncomplete && !p.calls.length) {
        const cut = this.hang.replyEnded({ replyIndex: ++this.actSeq, hasIncomplete: true });
        this.ui.activity("trunc" + this.actSeq, cut?.log ?? "Tool call was cut off", "error");
        return this.sendSystem(REMINDERS.truncated);
      }
      const ib = this.inflight && this.inflight.replyIndex === replyIndex ? this.inflight : null;
      const inBatch = (c) => !!ib && ib.calls.some((x) => this.execKey(replyIndex, x) === this.execKey(replyIndex, c));
      const calls = p.calls.filter((c) => !this.executedIds.has(this.execKey(replyIndex, c)) && !inBatch(c));
      if (ib) {
        for (const c of calls) {
          if (ib.calls.length >= this.settings.maxCallsPerMessage) {
            ib.footer = REMINDERS.tooMany(ib.calls.length);
            break;
          }
          ib.calls.push(c);
        }
        this.persist();
        await this.runBatch(ib);
        return;
      }
      if (p.calls.length && !calls.length) {
        this.ui.activity("dup" + ++this.actSeq, "Same reply re-rendered \u2014 calls already executed, skipped", "info");
        return;
      }
      if (calls.length) {
        if (!this.beginTurn()) return;
        const batch = calls.slice(0, this.settings.maxCallsPerMessage);
        this.inflight = {
          replyIndex,
          calls: batch,
          callIds: {},
          results: [],
          footer: calls.length > batch.length ? REMINDERS.tooMany(batch.length) : void 0
        };
        this.persist();
        await this.runBatch(this.inflight);
        return;
      }
      if (p.done) {
        if (this.unverified && !this.unverifiedNagged) {
          this.unverifiedNagged = true;
          this.ui.activity("ver" + ++this.actSeq, "Done claimed without verification \u2014 asking to verify", "wait");
          return this.sendSystem(REMINDERS.unverified);
        }
        this.setStage("DONE");
        this.ui.activity("done" + ++this.actSeq, "Done: " + String(p.done.summary ?? "").slice(0, 140), "done");
        this.emit({ type: "done", summary: String(p.done.summary ?? "") });
        this.autoTurns = 0;
        this.remindersThisTurn = 0;
        return;
      }
      if (p.ask || p.asksUser && !p.untaggedCode && this.toolsSinceUser === 0) {
        this.setStage("PLAN");
        const waitEv = this.hang.waitingForUser({ replyIndex: ++this.actSeq, ask: true, question: false, hasCalls: false });
        this.emit({ type: "ask" });
        this.ui.activity("ask" + this.actSeq, "AI asks you (questions / variants) \u2014 answer in the chat" + (waitEv ? " \xB7 auto-run paused" : ""), "wait");
        this.autoTurns = 0;
        return;
      }
      if (p.statuses.length || p.errors.length) return;
      if (wasAwaitingReady) {
        this.ui.activity("ready" + ++this.actSeq, "AI is ready \u2014 type your request", "done");
        return;
      }
      if (p.untaggedCode && this.remindersThisTurn < this.settings.reminderLimit) {
        this.remindersThisTurn++;
        this.ui.activity("rem" + ++this.actSeq, "Luau code without a tag \u2014 asked the AI to re-send it tagged", "wait");
        return this.sendSystem(REMINDERS.untagged);
      }
      if (this.toolsSinceUser === 0 && this.remindersThisTurn < this.settings.reminderLimit) {
        this.remindersThisTurn++;
        this.ui.activity("rem" + ++this.actSeq, "No tool call \u2014 agent reminder sent", "wait");
        return this.sendSystem(REMINDERS.noTools);
      }
      this.setStage("DONE");
      this.ui.activity("ans" + ++this.actSeq, "AI answered \u2014 waiting for your next request", "done");
    }
    execKey(replyIndex, c) {
      return `${replyIndex}|${c.id}|${c.tool}|${JSON.stringify(c.args)}`;
    }
    /** Auto-resume is on unless the user turned it off (localStorage "bw-autoresume" = "off"). */
    autoResumeOn() {
      try {
        return globalThis.localStorage?.getItem("bw-autoresume") !== "off";
      } catch {
        return true;
      }
    }
    /** Counts one automatic turn; false (and paused) when the limit is reached. */
    beginTurn() {
      const turnLimit = this.settings.maxAutoTurns * (this.prefs.superMode ? 2 : 1);
      if (++this.autoTurns > turnLimit && this.autoResumeOn() && this.autoResumes < 3) {
        this.autoResumes++;
        this.autoTurns = 1;
        this.ui.activity("autoresume" + ++this.actSeq, `Auto-resume ${this.autoResumes}/3 after ${turnLimit} turns`, "info");
      }
      if (this.autoTurns > turnLimit) {
        this.pause(true);
        this.ui.notify(`Reached ${turnLimit} automatic turns \u2014 paused. Resume to continue.`, "warn");
        return false;
      }
      this.remindersThisTurn = 0;
      return true;
    }
    /**
     * M1 streaming execution: while the reply is still being written, every CLOSED and valid tool block is
     * queued at once (reads start immediately, writes run in order). The reply-end handler finishes the batch.
     */
    streamExec() {
      const a = this.adapter.readAssistantResponse();
      if (!a.text.trim() || a.count <= this.lastHandledCount) return;
      if (this.keyOf(a.count, a.text) === this.baselineKey) return;
      let parsed;
      try {
        parsed = this.adapter.extractToolCalls(a.text);
      } catch {
        return;
      }
      if (!parsed.calls.length) return;
      let b = this.inflight;
      if (b && b.replyIndex !== a.count) return;
      let added = false;
      for (const c of parsed.calls) {
        const k2 = this.execKey(a.count, c);
        if (this.executedIds.has(k2) || b && b.calls.some((x) => this.execKey(a.count, x) === k2)) continue;
        if (!b) {
          if (!this.beginTurn()) return;
          b = this.inflight = { replyIndex: a.count, calls: [], callIds: {}, results: [] };
        }
        if (b.calls.length >= this.settings.maxCallsPerMessage) {
          b.footer = REMINDERS.tooMany(b.calls.length);
          break;
        }
        b.calls.push(c);
        added = true;
        this.ui.activity("stream:" + a.count + ":" + c.id, `${c.tool} queued while the reply is streaming`, "info");
        void this.queueCall(b, c).catch(() => void 0);
      }
      if (added) this.persist();
    }
    /** Submit one call to the per-reply scheduler (dedupe by reply + id + tool + args hash). */
    queueCall(b, call2) {
      const done = b.results.find((r) => r.id === call2.id);
      if (done) return Promise.resolve(done);
      const desc = this.tools.get(call2.tool);
      const risk = desc ? assessCall(desc, call2.args).risk : "read";
      if (!this.sched || this.schedReply !== b.replyIndex) {
        this.sched = new CallScheduler({ readParallel: this.settings.readParallel ?? 4 });
        this.schedReply = b.replyIndex;
      }
      return this.sched.submit(callKey(b.replyIndex, call2), risk === "read" ? "read" : "write", () => this.execOne(b, call2, risk));
    }
    async execOne(b, call2, risk) {
      if (!this.active) return null;
      const resumeCallId = b.callIds[call2.id];
      this.executedIds.add(this.execKey(b.replyIndex, call2));
      if (!resumeCallId) this.toolsSinceUser++;
      this.inferStage(call2.tool, risk);
      const key2 = "call:" + b.replyIndex + ":" + call2.id;
      this.ui.activity(key2, `${call2.tool} ${shortArgs(call2.args)}${resumeCallId ? " (resumed after reload)" : ""}`, "run");
      const t0 = Date.now();
      let showedApproval = false;
      if (!resumeCallId) {
        const loop = this.hang.callIssued(call2.tool + "|" + hashText(JSON.stringify(call2.args ?? {})), call2.tool);
        if (loop) {
          this.ui.activity(key2, loop.log, "error");
          this.autoTurns = Number.MAX_SAFE_INTEGER;
          const lr = { id: call2.id, status: "error", error: loop.recovery.message };
          if (!b.results.some((x) => x.id === lr.id)) b.results.push(lr);
          return lr;
        }
      }
      const r = await this.bridge.callTool(
        call2,
        { sessionId: this.sessionId, provider: this.adapter.info.id },
        {
          resumeCallId,
          onSubmitted: (callId) => {
            if (b.callIds[call2.id] !== callId) {
              b.callIds[call2.id] = callId;
              this.persist();
            }
          },
          onPending: (env) => {
            showedApproval = true;
            this.ui.activity(key2, `${call2.tool} \u2014 waiting for approval`, "wait");
            this.ui.showApproval(env);
          },
          shouldAbort: () => !this.active
        }
      );
      if (showedApproval) this.ui.showApproval(null);
      if (r.status !== "success" && r.error) {
        const mode = this.hang.callError({ callId: call2.id, tool: call2.tool, error: r.error });
        if (mode) {
          this.ui.activity("hang" + ++this.actSeq, mode.log, "wait");
          try {
            const st = await this.bridge.callTool({ id: call2.id + "_state", tool: "get_studio_state", args: {} }, { sessionId: this.sessionId, provider: this.adapter.info.id }, { shouldAbort: () => !this.active });
            const dm = mode.recovery.datamodel;
            r.error += ` | Brickwire read get_studio_state: ${JSON.stringify(st.result ?? st.error ?? null).slice(0, 300)}. Retry this call against the ${dm} datamodel.`;
          } catch {
          }
        }
      }
      const ms = Date.now() - t0;
      (this.stepTimer ??= new StepTimer()).add(call2.tool, ms);
      if (!b.results.some((x) => x.id === r.id)) b.results.push(r);
      const ok = r.status === "success";
      this.ui.activity(key2, `${call2.tool} ${ok ? "" : "\u2014 " + r.status + ": " + (r.error ?? "").slice(0, 90)} \xB7 ${fmtMs(ms)}`.replace(/\s+·/, " \xB7").trim(), ok ? "done" : "error");
      if (ok && risk !== "read") {
        this.unverified = true;
        this.unverifiedNagged = false;
      } else if (ok && risk === "read") this.unverified = false;
      if (!ok) this.setStage("FIX");
      this.persist();
      return r;
    }
    /** Execute (or, after a reload, finish) a batch of calls, then inject all results at once. */
    async runBatch(b) {
      let jobs = [];
      do {
        jobs = b.calls.map((c) => this.queueCall(b, c));
        await Promise.allSettled(jobs);
      } while (this.active && jobs.length < b.calls.length);
      if (!this.active) return;
      const results = b.calls.map((c) => b.results.find((r) => r.id === c.id)).filter(Boolean);
      const st = this.stepTimer ??= new StepTimer();
      const tSend = Date.now();
      const attachNote = await this.attachToolFiles(results);
      const news = await this.toolNews();
      const footer = [b.footer, attachNote, news].filter(Boolean).join("\n") || void 0;
      await this.send(formatToolResults(results, this.adapter.info.maxMessageChars, footer));
      st.add("send results", Date.now() - tSend);
      this.ui.activity("timing:" + b.replyIndex, "\u23F1 " + st.summary(), "info");
      this.stepTimer = null;
      if (this.inflight === b) this.inflight = null;
      this.persist();
    }
    /** Tools the AI was told about. New ones (bridge updated, Studio connected later) are announced once. */
    knownTools = /* @__PURE__ */ new Set();
    async toolNews() {
      try {
        const tools = await this.bridge.tools();
        if (!tools) return "";
        this.tools = new Map(tools.map((t) => [t.name, t]));
        const fresh = tools.filter((t) => t.available && !this.knownTools.has(t.name));
        if (!fresh.length || !this.knownTools.size) {
          for (const t of tools) if (t.available) this.knownTools.add(t.name);
          return "";
        }
        for (const t of fresh) this.knownTools.add(t.name);
        this.ui.activity("tools" + ++this.actSeq, `New tools announced to the AI: ${fresh.map((t) => t.name).join(", ")}`, "info");
        return newToolsNotice(fresh);
      } catch {
        return "";
      }
    }
    /** file_show results carry {bwAttach:[{fileId}]}: put those files into the composer before the results message is sent. */
    async attachToolFiles(results) {
      const ids = [];
      for (const r of results) {
        if (r.status !== "success") continue;
        const json = JSON.stringify(r.result ?? null) ?? "";
        for (const m of json.matchAll(/\\?"bwAttach\\?"\s*:\s*\[([^\]]*)\]/g)) for (const id of m[1].matchAll(/f_[a-f0-9]{12}/g)) if (!ids.includes(id[0])) ids.push(id[0]);
      }
      if (!ids.length) return "";
      if (!this.adapter.attachImage) return `[Brickwire: ${this.adapter.info.name} does not support attachments here \u2014 files ${ids.join(", ")} were not attached; use file_read instead]`;
      const ok = [], bad = [];
      for (const id of ids.slice(0, 4)) {
        try {
          const f = await this.bridge.fileBase64(id);
          const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
          if (await this.adapter.attachImage(new File([bytes], f.name, { type: f.mime || "application/octet-stream" }))) ok.push(f.name);
          else bad.push(f.name);
        } catch (e) {
          bad.push(`${id} (${e.message})`);
        }
      }
      this.ui.activity("attach" + ++this.actSeq, ok.length ? `Attached to the chat: ${ok.join(", ")}` : "Could not attach files to the chat", ok.length && !bad.length ? "done" : "error");
      return [ok.length ? `[Brickwire attached: ${ok.join(", ")}]` : "", bad.length ? `[Brickwire could not attach: ${bad.join(", ")} \u2014 the site refused the upload; use file_read for text]` : ""].filter(Boolean).join("\n");
    }
    async sendSystem(text) {
      return this.send(text);
    }
    /** Leftover composer text that is (part of) a message WE injected — not a user draft. */
    isOwnText(draft) {
      if (!this.lastInjected) return false;
      const n = (x) => x.replace(/\s+/g, " ").trim().slice(0, 300);
      const a = n(draft);
      const b = n(this.lastInjected);
      return !!a && (b.startsWith(a.slice(0, 120)) || a.startsWith(b.slice(0, 120)));
    }
    /**
     * Send one message to the AI site. Waits for the site to be idle and for the user's own draft to clear,
     * retries once, tags the message with a delivery marker and arms the delivery watchdog.
     */
    async send(text, opts = {}) {
      this.sending++;
      try {
        return await this.sendInner(text, opts);
      } finally {
        this.sending--;
        this.lastChangeAt = Date.now();
      }
    }
    async sendInner(text, opts) {
      this.delivery = null;
      for (let i = 0; i < 240; i++) {
        if (!this.active) return false;
        const draft = composerText(this.adapter.getComposer()).trim();
        const userDraft = !!draft && !this.isOwnText(draft);
        if (!userDraft && !this.adapter.isGenerating()) break;
        if (i === 6 && userDraft) this.ui.notify("Waiting: the message box has your draft \u2014 send or clear it.", "warn");
        await sleep(500);
      }
      if (!this.active) return false;
      const marker = `[bw-${newMarkerId()}]`;
      const full = `${text}

${marker}`;
      const before = this.adapter.readAssistantResponse();
      this.baselineKey = this.keyOf(before.count, before.text);
      this.agentSent = true;
      this.lastInjected = full;
      let ok = await this.adapter.sendMessage(full);
      for (let attempt = 2; !ok && this.active && attempt <= 3; attempt++) {
        this.ui.activity("send" + ++this.actSeq, `Send did not go through \u2014 retrying (${attempt}/3)`, "wait");
        await sleep(1500 * (attempt - 1));
        ok = this.markerDelivered(marker) || this.adapter.readAssistantResponse().count > before.count || await this.adapter.sendMessage(full);
      }
      if (!ok) {
        this.agentSent = false;
        if (opts.pauseOnFail === false) return false;
        this.pendingSend = text;
        this.pause(true);
        this.ui.notify("Could not send the message to the AI site (message box / send button not found or the site is busy). Session paused \u2014 press Resume to send it again.", "error");
        return false;
      }
      this.pendingSend = null;
      this.sentAt = Date.now();
      this.endDet.reset(this.sentAt);
      this.delivery = { marker, text: full, at: Date.now(), count: before.count, tries: 1, confirmed: false, warned: false };
      this.awaitingReply = true;
      this.persist();
      return true;
    }
    /** The marker of a sent message is visible in the chat (outside the message box) → the site took it. */
    markerDelivered(marker) {
      try {
        const composer = this.adapter.getComposer();
        const res = document.evaluate(`//text()[contains(., '${marker}')]`, document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < res.snapshotLength; i++) {
          const n = res.snapshotItem(i).parentElement;
          if (n && !(composer && composer.contains(n)) && !n.closest("[data-brickwire-host]") && !n.closest("textarea,[contenteditable='true']")) return true;
        }
      } catch {
      }
      return false;
    }
    /**
     * Delivery watchdog: some sites silently drop a send (button not enabled yet, editor state not synced,
     * a modal stole the click). If neither our message nor a reply appears, press send again / re-send.
     * Returns true when it did something this tick.
     */
    async checkDelivery() {
      const d = this.delivery;
      if (!d) return false;
      const a = this.adapter.readAssistantResponse();
      if (!d.confirmed && (a.count > d.count || this.adapter.isGenerating() || this.markerDelivered(d.marker))) d.confirmed = true;
      const age = Date.now() - d.at;
      if (d.confirmed) {
        if (!d.warned && this.awaitingReply && a.count === d.count && !this.adapter.isGenerating() && age > 15e4) {
          d.warned = true;
          this.ui.notify("The AI has not answered for 2.5 minutes. If the site shows an error, press Pause \u2192 Resume to send the last message again, or answer in the chat yourself.", "warn");
          this.pendingSend = d.text.replace(/\n\n\[bw[:\-][a-z0-9]+\]$/, "");
        }
        return false;
      }
      if (age < (this.adapter.info.redeliverAfterMs ?? 7e3)) return false;
      if (d.tries >= 4) {
        this.delivery = null;
        this.pendingSend = d.text.replace(/\n\n\[bw[:\-][a-z0-9]+\]$/, "");
        this.pause(true);
        this.ui.notify("The AI site did not accept the message after 4 attempts. Session paused \u2014 press Resume to try again (or send it from the message box yourself).", "error");
        return true;
      }
      if (this.markerDelivered(d.marker)) {
        d.confirmed = true;
        return false;
      }
      d.tries++;
      this.ui.activity("redeliver" + d.marker, `Message not delivered \u2014 sending again (try ${d.tries}/4)`, "wait");
      this.busy = true;
      this.sending++;
      try {
        if (await this.adapter.sendMessage(d.text)) this.lastChangeAt = Date.now();
      } finally {
        this.sending--;
        this.busy = false;
        d.at = Date.now();
      }
      return true;
    }
    inferStage(tool, risk) {
      if (TEST_TOOLS.test(tool)) this.setStage("TEST");
      else if (risk !== "read") this.setStage(this.stage === "FIX" ? "FIX" : "EXECUTE");
      else if (this.stage === "IDLE" || this.stage === "DONE") this.setStage("ANALYZE");
    }
    setStage(s) {
      if (this.stage === s) return;
      this.stage = s;
      this.emit({ type: "stage", stage: s });
      this.persist();
      this.ui.setStage(s);
      if (this.sessionId) void this.bridge.updateSession(this.sessionId, { stage: s });
      this.onStateChange();
    }
    setTask(t) {
      if (this.task === t) return;
      this.task = t;
      this.emit({ type: "task", task: t });
      this.ui.setTask(t);
      if (this.sessionId) void this.bridge.updateSession(this.sessionId, { task: t });
      this.onStateChange();
    }
  };
  function shortArgs(a) {
    const v = a.path ?? a.name ?? a.parent ?? a.query ?? a.pattern ?? "";
    return typeof v === "string" ? v.slice(0, 60) : "";
  }
  function replyProse(text) {
    let n = 0;
    const out = (text ?? "").replace(/```[a-z]*\s*<ROBLOX_(TOOL_CALL|LUAU)[\s\S]*?(<\/ROBLOX_\1>\s*```|$)/gi, () => (n++, "\n")).replace(/<ROBLOX_(TOOL_CALL|LUAU)[\s\S]*?(<\/ROBLOX_\1>|$)/gi, () => (n++, "\n")).replace(/<ROBLOX_AGENT_DONE>[\s\S]*?(<\/ROBLOX_AGENT_DONE>|$)/gi, "").replace(/<\/?ROBLOX_AGENT_ASK>/gi, "").replace(/\[bw[:\-][a-z0-9]{5}\]/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return n ? `${out}${out ? "\n\n" : ""}\u2699 ${n} action(s) sent to Studio` : out;
  }

  // extension/src/core/plugin-link.ts
  var call = async (method, path, body) => {
    try {
      return await chrome.runtime.sendMessage({ type: "bridge", method, path, body });
    } catch {
      return null;
    }
  };
  function pluginRequestText(r, attached) {
    const parts = [r.text.trim() || "(see the attached image)"];
    if (r.selection.length) parts.push(`Selected in Studio: ${r.selection.join(", ")}`);
    if (r.images.length) parts.push(attached === r.images.length ? `Attached image(s): ${r.images.map((i) => i.name).join(", ")} \u2014 use them as the visual reference.` : `[${r.images.length - attached} image(s) from Studio could not be attached to this chat]`);
    if (r.place) parts.push(`Place: ${r.place}`);
    return parts.join("\n");
  }
  function startPluginLink(core2, adapter) {
    const tab = (() => {
      try {
        let id = sessionStorage.getItem("bw-tab-id");
        if (!id) sessionStorage.setItem("bw-tab-id", id = Math.random().toString(36).slice(2, 10));
        return id;
      } catch {
        return Math.random().toString(36).slice(2, 10);
      }
    })();
    let queue = [];
    let flushing = false;
    const flush = async () => {
      if (flushing || !queue.length) return;
      flushing = true;
      const events = queue.splice(0, 50);
      const r = await call("POST", "/api/plugin/event", { events });
      if (!r?.ok && queue.length < 200) queue.unshift(...events.filter((e) => e.type !== "reply" || !e.partial));
      flushing = false;
    };
    core2.onPluginEvent = (e) => {
      queue.push({ ...e, provider: adapter.info.name });
      if (queue.length > 300) queue.splice(0, queue.length - 300);
      void flush();
    };
    let delivering = false;
    const deliver = async (r) => {
      let attached = 0;
      for (const im of r.images) {
        if (!adapter.attachImage) break;
        try {
          const bin = Uint8Array.from(atob(im.data), (c) => c.charCodeAt(0));
          if (await adapter.attachImage(new File([bin], im.name, { type: im.mime || "image/png" }))) attached++;
        } catch {
        }
      }
      const fileReports = [];
      for (const f of r.files || []) {
        let ok2 = false;
        try {
          const bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
          ok2 = !!await adapter.attachImage?.(new File([bytes], f.name, { type: f.mime || "application/octet-stream" }));
        } catch {
        }
        fileReports.push(ok2 ? `Attached file: ${f.name}` : `File ${f.name} could not be attached to this AI chat; do NOT claim to have read its binary content.`);
      }
      const ok = await core2.submitTask([pluginRequestText(r, attached), ...fileReports].join("\n"), "the Roblox Studio plugin");
      await call("POST", `/api/plugin/request/${encodeURIComponent(r.id)}/result`, { ok, error: ok ? void 0 : "the AI chat did not accept the message" });
    };
    const poll = async () => {
      if (delivering || !adapter.getComposer()) return;
      const ready = core2.readyForUser() && !core2.paused;
      const r = await call("POST", "/api/plugin/next", {
        tab,
        provider: adapter.info.id,
        providerName: adapter.info.name,
        active: core2.active,
        paused: core2.paused,
        ready,
        stage: core2.stage,
        task: core2.task,
        url: location.href
      });
      if (!r?.ok || !r.data) return;
      for (const c of r.data.controls ?? []) {
        if (c === "stop" && core2.active) await core2.stop();
        else if (c === "pause" && core2.active) core2.pause(true);
        else if (c === "resume" && core2.active) core2.pause(false);
      }
      const req = r.data.request;
      if (!req) return;
      delivering = true;
      try {
        await deliver(req);
      } finally {
        delivering = false;
      }
    };
    every(1500, () => void poll());
  }

  // extension/src/core/bridge-client.ts
  var BridgeClient = class {
    transport;
    constructor(transport = defaultTransport) {
      this.transport = transport;
    }
    async req(method, path, body) {
      return await this.transport({ type: "bridge", method, path, body });
    }
    async health() {
      const r = await this.req("GET", "/api/health");
      if (!r.ok || !r.data) return { online: false, error: r.error ?? "Bridge offline" };
      return { online: true, health: r.data };
    }
    async startSession(provider, task, opts = {}) {
      const r = await this.req("POST", "/api/sessions/start", { provider, task, ...opts });
      if (!r.ok || !r.data?.session) throw new Error(r.data?.error ?? r.error ?? "could not start session");
      return r.data;
    }
    async tools() {
      const r = await this.req("GET", "/api/tools");
      return r.ok && r.data?.tools ? r.data.tools : null;
    }
    async stopSession(sessionId) {
      await this.req("POST", "/api/sessions/stop", { sessionId });
    }
    async updateSession(sessionId, patch) {
      await this.req("POST", "/api/sessions/update", { sessionId, ...patch });
    }
    /** Content of a file from the bridge's AI file store (file_* tools), for attaching it to the AI chat. */
    async fileBase64(fileId) {
      const r = await this.req("GET", `/api/files/${encodeURIComponent(fileId)}/base64`);
      if (!r.ok || !r.data?.data) throw new Error(r.data?.error ?? r.error ?? "file not available");
      return r.data;
    }
    async decide(approvalId, approve) {
      return this.req("POST", `/api/approvals/${approvalId}`, { approve });
    }
    /** Execute a call, long-polling until done. onPending is invoked when user approval is needed. */
    async callTool(call2, ctx, hooks = {}) {
      const first = hooks.resumeCallId ? await this.req("GET", `/api/calls/${hooks.resumeCallId}?wait=1000`) : await this.req("POST", "/api/calls", { ...ctx, call: call2, waitMs: 2e4 });
      if (!first.ok || !first.data?.callId) {
        if (hooks.resumeCallId && !first.offline)
          return { id: call2.id, status: "error", result: null, error: "the result of this call was lost while the page reloaded \u2014 check the current state with a read tool before retrying" };
        return { id: call2.id, status: "error", result: null, error: first.offline ? "Bridge offline" : first.data?.error ?? first.error ?? "bridge error" };
      }
      let env = first.data;
      hooks.onSubmitted?.(env.callId);
      let offlineStrikes = 0;
      while (env.state !== "done") {
        if (env.state === "pending_approval") hooks.onPending?.(env);
        if (hooks.shouldAbort?.()) return { id: call2.id, status: "rejected", result: null, error: "session stopped by user" };
        const r = await this.req("GET", `/api/calls/${env.callId}?wait=15000&since=${env.state}`);
        if (!r.ok || !r.data) {
          if (++offlineStrikes > 4) return { id: call2.id, status: "error", result: null, error: "Bridge offline while waiting for result" };
          await sleep(1e3);
          continue;
        }
        offlineStrikes = 0;
        env = r.data;
      }
      return env.result;
    }
  };
  function defaultTransport(req) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(req, (res) => {
          const err = chrome.runtime.lastError;
          if (err) resolve({ ok: false, offline: true, error: "Extension context unavailable: " + err.message });
          else resolve(res ?? { ok: false, error: "no response" });
        });
      } catch (e) {
        resolve({ ok: false, offline: true, error: "Extension reloaded \u2014 refresh this page (" + e.message + ")" });
      }
    });
  }

  // shared/src/library/tasks.ts
  function resourceTask(id, mode, notes = "") {
    const extra = notes.trim() ? `
My notes: ${notes.trim()}` : "";
    if (ICONS[id]) {
      const t = `Use the library icon "${id}" in my UI: BW.icon(parent, "${id}", {Size={0,48,0,48}, Position=\u2026}) where it fits (buttons, counters, cards). Then run BW.uiCheck on the ScreenGui.`;
      return t + extra;
    }
    const k2 = KIT_BY_ID[id];
    if (!k2) return `Build the library resource "${id}".${extra}`;
    const what = `the library resource "${k2.name}" (${KIND_LABELS[k2.kind].en}: ${k2.desc})`;
    const opts = k2.opts ? ` Options you may set: ${k2.opts}.` : "";
    if (mode === "restyle" || k2.kind === "style" && mode === "similar") {
      const st = k2.id.replace(/^style_/, "");
      return `Restyle my game's UI in the "${st}" style (${k2.desc}). Inspect the existing ScreenGuis first (BW.uiCheck / search_game_tree). Keep every name, script reference and layout logic; change only the look: re-create buttons/panels/bars with BW.uiButton / BW.uiPanel / BW.uiWindow / BW.uiBar / BW.uiPill {style="${st}"} or restyle them with the BW.style("${st}") palette, fonts and strokes, add BW.uiJuice(gui). If I have no UI yet, build BW.kit("style_${st}") as a showcase. Then run BW.uiCheck on every changed ScreenGui and list what changed.${extra}`;
    }
    if (mode === "exact") {
      return `Build ${what} exactly as in the library: ONE execute_luau with BW.kit("${k2.id}", {At={x,y,z} \u2014 a free spot near the origin/selection, Facing=0}).${opts} Then verify it (BW.inspect for 3D, BW.uiCheck for UI, BW.lint for scripts) and tell me what was created and where.${extra}`;
    }
    if (mode === "similar") {
      return `Make something LIKE ${what} \u2014 same purpose and style, but your own design, not a copy. Start from BW.kit("${k2.id}", {...}) only if it helps, then change it clearly (layout, proportions, colours/palette, extra details) or build your own version with the BW helpers. Plan in numbers first, then build, then verify (BW.inspect / BW.uiCheck / BW.lint) and show me what is different from the library version.${extra}`;
    }
    return `I attached a screenshot/image to this message. Recreate what it shows in Studio as closely as you can (shapes, proportions, colours, layout). The library resource "${k2.name}" (BW.kit("${k2.id}")) is a close starting point \u2014 use it and adapt it if that is faster. First describe what you see in numbers (sizes in studs or pixels, colours as hex), then build and verify.${extra}`;
  }
  function packTask(it, mode, notes = "") {
    const extra = notes.trim() ? `
My notes: ${notes.trim()}` : "";
    const size = it.s?.length === 3 ? ` (${it.s.join("\xD7")} studs)` : "";
    const apply = it.k === "texture" || it.k === "decal";
    if (mode === "place") {
      if (apply)
        return `Apply the asset pack item "${it.id}" \u2014 ${it.n}, ${it.k} from ${it.c} \u2014 to the parts I mean (selection / what I describe; if unclear, ask me which part): BW.asset("${it.id}", {ApplyTo = part}). Then confirm which parts got it.${extra}`;
      return `Place the asset pack item "${it.id}" \u2014 ${it.n}, ${it.k} from ${it.c}${size}: ONE execute_luau with BW.asset("${it.id}", {At = {x, y, z} \u2014 a free spot near the origin or where I say, Facing = 0}). Then verify it exists (BW.report on the returned instance) and tell me where it is.${extra}`;
    }
    return `Use the asset pack item "${it.id}" (${it.n}, ${it.k}) as part of something bigger that fits my game \u2014 e.g. several copies arranged with intent, combined with BW parts, lights or effects. Plan in numbers first, use BW.asset("${it.id}", {...}) (and brickwire_assets to find matching items), then build and verify (BW.inspect / BW.fxCheck).${extra}`;
  }

  // shared/src/library/community.ts
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
  var IMAGE_CATS = /^(effects|backgrounds|renders|textures|icons|faces|brushes|gfx|components)$/i;
  function communityTask(it, mode, assetId = "", notes = "") {
    const extra = notes.trim() ? `
My notes: ${notes.trim()}` : "";
    const where = [it.w && `page ${it.w}`, it.dl && `file ${it.dl}`, !it.dl && it.i && `image ${it.i}`].filter(Boolean).join(", ");
    const head = `Community resource "${it.t}"${it.a ? ` by ${it.a}` : ""} (${it.c}${it.g ? `: ${it.g}` : ""}; from ${it.s}${where ? `; ${where}` : ""}).`;
    const id = assetId.trim().replace(/^rbxassetid:\/\//, "");
    if (mode === "inspired") {
      return `${head} Use it as a VISUAL REFERENCE only: describe its look in numbers (palette as hex, shapes, proportions, mood), then build my own version with the BW helpers (BW.style / BW.ui* components for UI, BrickwireVFX layers for effects) \u2014 no copying, no image upload needed. Verify (BW.uiCheck / BW.fxCheck) and show what you made.${extra}`;
    }
    if (IMAGE_CATS.test(it.c) || /^sounds$/i.test(it.c)) {
      const kind = /^sounds$/i.test(it.c) ? "Sound (SoundId)" : /^textures$/i.test(it.c) ? "Texture/Decal or ImageLabel (ScaleType Tile)" : /^effects$/i.test(it.c) ? "ImageLabel overlay in the UI, or a ParticleEmitter Texture for 3D" : /^backgrounds$/i.test(it.c) ? "full-screen ImageLabel behind the menu (ScaleType Crop, ZIndex lowest)" : "ImageLabel / ImageButton";
      const asset = id ? `Its Roblox asset id is ${id} \u2014 use "rbxassetid://${id}".` : `It needs a Roblox asset id first. If the Studio tools include an image-upload tool, upload ${it.dl || it.i} with it and use the returned id. Otherwise do NOT invent an id: build everything with the image slot ready (attribute BW_AssetNeeded="${it.t}") and tell me to download the file, import it in Studio (View \u2192 Asset Manager \u2192 Bulk Import) and paste the rbxassetid back to you.`;
      return `${head} Put it into my game as a ${kind} where it fits (ask me only if the place is unclear). ${asset} Respect the author's terms; credit "${it.a || it.s}" if required. Then verify (BW.uiCheck / BW.fxCheck) and tell me exactly what you changed.${extra}`;
    }
    if (/^plugins$|^software$/i.test(it.c)) return `${head} This is a tool, not an in-game asset. Explain briefly what it does and how it would help in my project, then do the same job with the BW helpers if possible.${extra}`;
    return `${head} This is a reference / guide. Use its ideas for my game: summarise the key rules that apply, then apply them (for UI: BW.style + BW.ui* components; for effects: BrickwireVFX; for cameras: BrickwireCinema) and verify.${extra}`;
  }

  // extension/src/ui/panel.ts
  var MODE_INFO = {
    full: { label: "Full auto", hint: "Runs everything without asking (undo with Ctrl+Z in Studio)" },
    auto: { label: "Ask before deleting", hint: "Creates/changes run automatically; deleting asks first" },
    approval: { label: "Ask every change", hint: "Every write or delete waits for your Approve" },
    safe: { label: "Read-only", hint: "Only reads Studio; all changes are blocked" }
  };
  var esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  var CSS = `
:host{all:initial}
*{box-sizing:border-box;font-family:Inter,"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{--bg:#0B0B0E;--bg2:#111116;--card:#17171D;--line:rgba(255,255,255,.08);--line2:rgba(255,255,255,.14);--text:#F3F1EC;--mut:#9A97A1;--faint:#5E5C66;--btn:#17171D;--code:#08080A;--codetx:#CFCBC2;--opt:#17171D;
 --gold:#D8B878;--goldT:rgba(216,184,120,.10);--blue:#D8B878;--purple:#B08F55;--cyan:#D8B878;--green:#7BC99A;--yellow:#E2B866;--red:#E8806F;--acc:linear-gradient(180deg,#E3C68C,#C9A462);--accTx:#17130A;
 margin:8px auto 10px;max-width:820px;width:100%;color:var(--text);background:var(--bg);border:1px solid var(--line);border-radius:16px;
 box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 18px 40px -18px rgba(0,0,0,.55);font-size:12.5px;line-height:1.45;overflow:hidden;letter-spacing:.005em}
.wrap.light{--bg:#FBFAF7;--bg2:#F4F2EC;--card:#EFECE4;--line:rgba(20,17,9,.09);--line2:rgba(20,17,9,.16);--text:#1A1813;--mut:#6E6A60;--faint:#A29D91;--btn:#FFFFFF;--code:#F4F2EC;--codetx:#2A261D;--opt:#FFFFFF;--gold:#A9874A;--goldT:rgba(169,135,74,.10);--blue:#A9874A;--cyan:#A9874A;box-shadow:0 10px 30px -14px rgba(40,30,10,.22)}
.wrap.light .note.error{color:#A33A2A}.wrap.light .note.warn{color:#7A5A12}.wrap.light .note.info{color:#6B5226}
.wrap.float{margin:0;max-width:none;box-shadow:0 24px 60px -16px rgba(0,0,0,.6)}
.wrap.float .bar{cursor:move}
.note.pre{white-space:pre-wrap;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Consolas,monospace}
.bar{display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:48px;background:var(--bg2)}
.logo{width:24px;height:24px;border-radius:7px;background:var(--acc);display:grid;place-items:center;font-size:0;flex:none;box-shadow:0 4px 12px -5px rgba(216,184,120,.7);position:relative}
.logo::after{content:"";width:8px;height:8px;border:1.6px solid #17130A;border-radius:1.5px;transform:rotate(45deg)}
.title{font-weight:600;font-size:13px;white-space:nowrap;letter-spacing:.01em}
button.ic svg{display:block}
.st{display:flex;align-items:center;gap:7px;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;font-size:11.5px;padding:4px 11px;border-radius:99px;border:1px solid var(--line)}
.st b{color:var(--text);font-weight:500}
.dot{width:7px;height:7px;border-radius:50%;background:var(--faint);flex:none}
.g{background:var(--green);box-shadow:0 0 0 3px rgba(123,201,154,.15)}.y{background:var(--yellow);box-shadow:0 0 0 3px rgba(226,184,102,.15)}.r{background:var(--red)}.b{background:var(--gold);animation:pulse 1.4s infinite}
@keyframes pulse{50%{opacity:.4}}
.sp{flex:1}
.tabs{display:flex;border:1px solid var(--line);border-radius:99px;padding:2px;gap:2px;flex:none}
.tabs button{border:0;background:transparent;padding:5px 12px;color:var(--mut);border-radius:99px;font-weight:500}
.tabs button.on{background:var(--card);color:var(--text)}
button{all:unset;cursor:pointer;padding:6px 13px;border-radius:99px;border:1px solid var(--line2);background:transparent;color:var(--text);font-size:12px;font-weight:500;white-space:nowrap;transition:border-color .18s,background .18s,color .18s,filter .18s}
button:hover{border-color:rgba(216,184,120,.5)}
button.pri{background:var(--acc);border-color:transparent;color:var(--accTx);font-weight:600;box-shadow:0 1px 0 rgba(255,255,255,.35) inset,0 6px 16px -8px rgba(216,184,120,.6)}
button.pri:hover{filter:brightness(1.07)}
button.ok{background:var(--green);color:#0A160F;border-color:transparent;font-weight:600}
button.no{color:var(--red);border-color:rgba(232,128,111,.4)}
button.ghost{border-color:transparent;background:transparent;color:var(--mut)}
button.ghost:hover{color:var(--text);background:var(--card)}
button.ic{padding:6px 8px;color:var(--mut);border-color:transparent;background:transparent;border-radius:8px}
button.ic:hover{color:var(--text);background:var(--card)}
.body{border-top:1px solid var(--line)}
.body.hide{display:none}
.view{padding:14px 16px 14px;display:grid;grid-template-columns:1fr 1fr;gap:12px 20px}
.lbl{font-size:9.5px;letter-spacing:.18em;color:var(--gold);text-transform:uppercase;margin-bottom:6px;font-weight:600}
.task{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stages{display:flex;gap:4px;flex-wrap:wrap}
.stg{padding:3px 8px;border-radius:99px;font-size:9.5px;font-weight:600;letter-spacing:.08em;color:var(--faint);border:1px solid var(--line)}
.stg.on{color:var(--accTx);background:var(--acc);border-color:transparent}
.stg.past{color:var(--gold);border-color:rgba(216,184,120,.3)}
.act{grid-column:1/-1;max-height:124px;overflow:auto;display:flex;flex-direction:column;gap:3px;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Consolas,monospace;font-size:11.5px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:9px 12px;min-height:34px}
.act:empty::before{content:"No activity yet \u2014 type a task in the message box and press Start, or pick something in Library.";color:var(--mut);font-family:Inter,"Segoe UI",system-ui,sans-serif}
.act div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.i-done{color:var(--green)}.i-run{color:var(--gold)}.i-wait{color:var(--yellow)}.i-error{color:var(--red)}.i-info{color:var(--mut)}
.appr{grid-column:1/-1;border:1px solid rgba(216,184,120,.35);background:linear-gradient(90deg,var(--goldT),transparent);border-radius:12px;padding:10px 12px;display:flex;gap:12px;align-items:flex-start}
.appr .t{flex:1;min-width:0}.appr .t div{white-space:normal}
.appr .acts{display:flex;flex-direction:column;gap:6px}
.note{margin:10px 16px 0;font-size:11.5px;padding:8px 12px;border-radius:10px;border:1px solid var(--line)}
.note.error{background:rgba(232,128,111,.07);color:#F2B3A8;border-color:rgba(232,128,111,.25)}.note.warn{background:rgba(226,184,102,.06);color:#EBD3A0;border-color:rgba(226,184,102,.22)}.note.info{background:var(--goldT);color:#E7D6B2;border-color:rgba(216,184,120,.2)}
.btns{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.paintRow{grid-column:1/-1;display:flex;gap:10px;align-items:center;padding:7px 10px;border:1px solid var(--line);border-radius:12px;background:var(--bg2)}
.paintBtn{background:transparent!important;color:var(--gold)!important;border:1px solid rgba(216,184,120,.4)!important;font-weight:500}
.paintHint{color:var(--mut);font-size:11px}
.hidden{display:none!important}
.cfg{grid-column:1/-1;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cfg label{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:600}
select{all:unset;cursor:pointer;padding:5px 26px 5px 11px;border-radius:99px;border:1px solid var(--line2);background:transparent url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239A97A1' fill='none' stroke-width='1.4'/%3E%3C/svg%3E") no-repeat right 10px center;color:var(--text);font-size:12px;font-weight:500;letter-spacing:0;text-transform:none}
select:hover{border-color:rgba(216,184,120,.5)}
select:disabled{opacity:.5;cursor:default}
select.m-full{border-color:rgba(232,128,111,.55)}select.m-safe{border-color:rgba(123,201,154,.55)}
option{background:var(--opt);color:var(--text)}
.code{margin-top:8px;max-height:240px;overflow:auto;background:var(--code);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-family:"JetBrains Mono","Cascadia Code",ui-monospace,Consolas,monospace;font-size:11.5px;white-space:pre;color:var(--codetx)}
/* library */
.lib{padding:14px 16px 16px;display:flex;flex-direction:column;gap:12px}
.ltop{display:flex;gap:10px;align-items:center}
input.q,textarea{all:unset;box-sizing:border-box;flex:1;padding:8px 14px;border-radius:99px;border:1px solid var(--line);background:var(--bg2);color:var(--text);font-size:12px;transition:border-color .18s}
textarea{width:100%;min-height:44px;white-space:pre-wrap;border-radius:12px}
input.q:focus,textarea:focus{border-color:rgba(216,184,120,.5)}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{padding:4px 11px;border-radius:99px;font-size:11px;background:transparent;border-color:var(--line);color:var(--mut)}
.chip.on{background:var(--goldT);border-color:rgba(216,184,120,.45);color:var(--gold)}
.chip i{font-style:normal;opacity:.6;margin-left:5px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;max-height:340px;overflow:auto;padding-right:2px}
.card{all:unset;cursor:pointer;display:flex;flex-direction:column;border-radius:12px;background:var(--bg2);border:1px solid var(--line);overflow:hidden;transition:border-color .18s,transform .18s}
.card:hover{border-color:rgba(216,184,120,.45);transform:translateY(-1px)}
.pv{height:88px;display:grid;place-items:center;background:radial-gradient(120% 90% at 50% 0%,rgba(216,184,120,.07),transparent 70%)}
.pv img{max-width:100%;max-height:100%;display:block}
.pv.ico img{height:46px}
.card .nm{padding:8px 10px 2px;font-weight:500;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.card .ds{padding:0 10px 9px;color:var(--mut);font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.det{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px}
.det .big{border-radius:12px;background:var(--bg2);border:1px solid var(--line);display:grid;place-items:center;min-height:170px;padding:8px}
.det .big img{max-width:100%;max-height:220px}
.det h3{margin:0 0 4px;font-size:15px;font-weight:600;letter-spacing:-.005em}
.det .kd{color:var(--mut);font-size:11px;margin-bottom:8px}
.det .opt{font-family:"JetBrains Mono",ui-monospace,Consolas,monospace;font-size:11px;color:var(--codetx);background:var(--code);border:1px solid var(--line);border-radius:8px;padding:5px 8px;margin:8px 0;word-break:break-word}
.det .acts2{display:flex;flex-direction:column;gap:7px;margin-top:10px}
.det .acts2 button{text-align:center}
.hint{color:var(--mut);font-size:11px}
.empty{color:var(--mut);padding:20px;text-align:center;grid-column:1/-1}
.src{display:flex;gap:2px;border:1px solid var(--line);border-radius:99px;padding:2px}
.src button{padding:5px 12px;border-radius:99px;font-size:11.5px;background:transparent;border-color:transparent;color:var(--mut)}
.src button.on{background:var(--card);color:var(--gold)}
.pv.cm{background:repeating-conic-gradient(rgba(255,255,255,.035) 0 25%,transparent 0 50%) 0 0/14px 14px}
.pv.cm img{width:100%;height:100%;object-fit:contain}
.det .big.pv.cm{height:auto;min-height:190px}
.pv.pk{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.01))}
.pv.pk .ph{color:var(--mut);font-size:10px;text-transform:uppercase;letter-spacing:.12em}
.spr{image-rendering:auto;border-radius:6px}
.det .big.pv.pk{min-height:120px}
.pv.cm .ph{color:var(--mut);font-size:10.5px;padding:6px;text-align:center}
.det input.q{width:100%;flex:none}
.det a{color:var(--gold)}
.more{grid-column:1/-1;justify-self:center}
::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-thumb{background:rgba(255,255,255,.1);border-radius:8px}::-webkit-scrollbar-track{background:transparent}
@media (max-width:560px){.view{grid-template-columns:1fr}.det{grid-template-columns:1fr}}
`;
  var ICON = { done: "\u2713", run: "\u2192", wait: "\u25CB", error: "\u2715", info: "\xB7" };
  var AgentPanel = class {
    host;
    root;
    el = {};
    acts = /* @__PURE__ */ new Map();
    stage = "IDLE";
    approvalId = null;
    collapsed;
    active = false;
    providerName;
    h;
    providerId;
    prefs;
    constructor(providerName, h, collapsed = false, providerId = "", prefs = { category: "general", mode: "auto" }) {
      this.providerName = providerName;
      this.h = h;
      this.providerId = providerId;
      this.prefs = prefs;
      this.collapsed = collapsed;
      this.host = document.createElement("div");
      this.host.setAttribute("data-brickwire-host", "");
      this.host.style.cssText = "display:block;width:100%;position:relative;z-index:5";
      this.root = this.host.attachShadow({ mode: "open" });
      this.root.innerHTML = `<style>${CSS}</style>
<div class="wrap" part="panel">
  <div class="bar">
    <div class="logo"></div><div class="title">Brickwire</div>
    <div class="st" id="conn"><span class="dot" id="dot"></span><b id="state">Checking\u2026</b><span id="studio"></span><span id="project"></span></div>
    <div class="sp"></div>
    <div class="tabs"><button id="tabAgent" class="on">Agent</button><button id="tabLib" title="Ready-made builds, furniture, gameplay systems, UI, effects, animations and icons">Library</button></div>
    <button class="pri" id="start">Start Agent</button>
    <button class="ic" id="float" title="Floating window / dock above the message box"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="3.5" width="7.5" height="7.5" rx="1.5"/><path d="M4 1h6.2c.4 0 .8.4.8.8V8"/></svg></button>
    <button class="ic" id="collapse" title="Collapse">\u2212</button>
  </div>
  <div class="body" id="body">
    <div class="note hidden" id="note"></div>
    <div class="view" id="vAgent">
      <div class="cfg">
        <label>AI <select id="ai" title="Settings below are saved separately for each AI">${PROVIDERS.filter((p) => p.id === providerId || p.enabledByDefault).map((p) => `<option value="${p.id}" ${p.id === providerId ? "selected" : ""}>${esc(p.name)}${p.status === "beta" ? "" : " (experimental)"}</option>`).join("")}</select></label>
        <label title="What the AI focuses on: Build, Scripting, UI, VFX, Animation, Gameplay, Debug">Focus <select id="cat">${AGENT_CATEGORIES.map((c) => `<option value="${c}" ${c === prefs.category ? "selected" : ""} title="${esc(CATEGORY_INFO[c].hint)}">${esc(CATEGORY_INFO[c].label)}</option>`).join("")}</select></label>
        ${providerId === "notion" ? `<label title="Notion mode: Notion AI also keeps a 'Roblox Dev Log' page in your workspace up to date">Dev log <select id="nlog"><option value="off">Off</option><option value="on" ${prefs.notionLog ? "selected" : ""}>Notion page</option></select></label>` : ""}
        <label title="Super: the AI thinks long, proposes variants, writes a design doc, builds in phases and reviews its own result \u2014 slower, much better">Brain <select id="brain"><option value="normal">Normal</option><option value="super" ${prefs.superMode ? "selected" : ""}>Super</option></select></label>
        <label>Approvals <select id="mode">${Object.keys(MODE_INFO).map((m) => `<option value="${m}" ${m === prefs.mode ? "selected" : ""} title="${esc(MODE_INFO[m].hint)}">${esc(MODE_INFO[m].label)}</option>`).join("")}</select></label>
      </div>
      <div><div class="lbl">Current task</div><div class="task" id="task">\u2014</div></div>
      <div><div class="lbl">Stage</div><div class="stages" id="stages"></div></div>
      <div class="appr hidden" id="appr"><div class="t"><div><b>Approval required:</b> <span id="apTool"></span> <span id="apWhy" style="color:var(--mut)"></span></div><div class="code" id="apCode"></div></div><div class="acts"><button class="ok" id="approve">Approve</button><button class="ok" id="approveAll" title="Approve this and every further action until the agent stops">Approve all (session)</button><button class="no" id="reject">Reject</button></div></div>
      <div class="act" id="act"></div>
      <div class="paintRow"><button id="paint" class="paintBtn" title="Draw a picture and send it straight into this chat">Paint</button><span class="paintHint">draw \u2192 send into this chat</span></div>
      <div class="btns">
        <button id="pause" class="hidden">Pause</button>
        <button id="stop" class="no hidden">Stop</button>
        <button id="approveTop" class="ok hidden">Approve</button>
        <div class="sp"></div>
        <button id="compact" class="ghost" title="Show / hide the code of tool calls and results in the chat">Code: hidden</button>
        <button id="bridge" class="ghost">Bridge</button>
        <button id="check" class="ghost" title="Self-test: message box, send button, reply reader, background timers">Site check</button>
        <button id="settings" class="ghost">Settings</button>
      </div>
    </div>
    <div class="lib hidden" id="vLib">
      <div id="libList">
        <div class="ltop"><div class="src" id="libSrc"><button data-s="bw" class="on" title="Ready-made, tested Brickwire resources (one click builds them)">Brickwire</button><button data-s="pk" title="Asset packs: ~2370 real Roblox meshes, textures, decals, skies, sounds and VFX with meaningful names (NDC Build Kit, Retro Roblox Pack, Ultimate Building Asset Pack, texture swatches, VFX meshes)">Packs</button><button data-s="cm" title="Community resources from ui-resources.com and other free sites: effects, backgrounds, textures, icons, references">Community</button></div><input class="q" id="libQ" placeholder="Search: house, shop, obby, portal, coin\u2026"></div>
        <div class="chips" id="libCats" style="margin:8px 0"></div>
        <div class="grid" id="libGrid"></div>
        <div class="hint" style="margin-top:8px">Two ways to work: describe anything in the chat and press Start (the agent uses these resources on its own), or pick a resource here.</div>
      </div>
      <div id="libDet" class="hidden"></div>
    </div>
  </div>
</div>`;
      for (const id of ["dot", "state", "studio", "project", "start", "collapse", "body", "task", "stages", "appr", "apTool", "apWhy", "approve", "approveAll", "apCode", "ai", "cat", "mode", "reject", "note", "act", "pause", "stop", "approveTop", "bridge", "paint", "compact", "settings", "check", "float", "nlog", "brain", "tabAgent", "tabLib", "vAgent", "vLib", "libQ", "libSrc", "libCats", "libGrid", "libList", "libDet"])
        this.el[id] = this.root.getElementById(id);
      this.el.start.onclick = () => this.active ? this.h.stop() : this.h.start();
      this.el.stop.onclick = () => this.h.stop();
      this.el.pause.onclick = () => this.h.pause();
      this.el.approve.onclick = this.el.approveTop.onclick = () => this.approvalId && this.h.approve(this.approvalId, true);
      this.el.reject.onclick = () => this.approvalId && this.h.approve(this.approvalId, false);
      this.el.approveAll.onclick = () => this.approvalId && this.h.approveAll(this.approvalId);
      const ai = this.el.ai;
      ai.onchange = () => {
        const p = PROVIDERS.find((x) => x.id === ai.value);
        ai.value = this.providerId;
        if (p && p.id !== this.providerId) this.h.switchProvider(p.url);
      };
      const cat = this.el.cat;
      cat.onchange = () => this.h.setCategory(cat.value);
      const mode = this.el.mode;
      mode.onchange = () => {
        this.styleMode();
        this.h.setMode(mode.value);
      };
      this.styleMode();
      this.el.bridge.onclick = () => this.h.openBridge();
      if (this.el.paint) this.el.paint.onclick = () => this.h.openPaint?.();
      if (this.el.compact) {
        const label = (on) => this.el.compact.textContent = on ? "Code: hidden" : "Code: shown";
        label(this.h.compactState?.() ?? true);
        this.el.compact.onclick = () => label(this.h.toggleCompact?.() ?? true);
      }
      this.el.settings.onclick = () => this.h.openSettings();
      this.el.check.onclick = () => {
        const lines = this.h.siteCheck?.() ?? ["Site check is not available here."];
        this.notify(lines.join("\n"), lines.some((l) => l.startsWith("\u2715")) ? "error" : "info", 45e3, true);
      };
      this.el.float.onclick = () => {
        this.setFloating(!this.floating);
        this.h.toggleFloating?.(this.floating);
      };
      const brain = this.el.brain;
      if (brain) brain.onchange = () => this.h.setSuperMode?.(brain.value === "super");
      const nlog = this.el.nlog;
      if (nlog) nlog.onchange = () => this.h.setNotionLog?.(nlog.value === "on");
      this.applyTheme();
      window.setInterval(() => this.applyTheme(), 3e3);
      this.el.collapse.onclick = () => {
        this.collapsed = !this.collapsed;
        this.applyCollapse();
        this.h.toggleCollapsed(this.collapsed);
      };
      this.el.tabAgent.onclick = () => this.showTab("agent");
      this.el.tabLib.onclick = () => this.showTab("lib");
      this.el.libQ.oninput = () => {
        this.cmLimit = 60;
        this.renderLibrary();
      };
      for (const b of Array.from(this.el.libSrc.querySelectorAll("button"))) b.onclick = () => this.setSource(b.dataset.s);
      this.renderStages();
      this.applyCollapse();
    }
    // -------------------------------------------------------------- Library
    tab = "agent";
    libCat = "all";
    previews = null;
    previewsLoading = false;
    showTab(t) {
      this.tab = t;
      this.el.tabAgent.classList.toggle("on", t === "agent");
      this.el.tabLib.classList.toggle("on", t === "lib");
      this.el.vAgent.classList.toggle("hidden", t !== "agent");
      this.el.vLib.classList.toggle("hidden", t !== "lib");
      if (this.collapsed) {
        this.collapsed = false;
        this.applyCollapse();
      }
      if (t === "lib") {
        this.renderLibrary();
        if (!this.previews && !this.previewsLoading && this.h.loadPreviews) {
          this.previewsLoading = true;
          this.h.loadPreviews().then((p) => {
            this.previews = p;
            this.renderLibrary();
          }, () => this.previewsLoading = false);
        }
      }
    }
    img(svg, alt) {
      return `<img alt="${esc(alt)}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;
    }
    previewOf(id) {
      if (ICONS[id]) return this.img(iconSvg(id, 96), id);
      const svg = this.previews?.[id];
      if (svg) return this.img(svg, id);
      const k2 = KITS.find((x) => x.id === id);
      return `<span class="hint">${esc(k2 ? KIND_LABELS[k2.kind].en : "")}</span>`;
    }
    // ---------------------------------------------------- Community (ui-resources.com + curated links)
    libSource = "bw";
    packs = null;
    packsLoading = false;
    pkSel = "all";
    community = null;
    communityLoading = false;
    cmCat = "All";
    cmLimit = 60;
    thumbCache = /* @__PURE__ */ new Map();
    thumbObserver = null;
    setSource(s) {
      if (s !== this.libSource) this.el.libQ.value = "";
      this.libSource = s;
      for (const b of Array.from(this.el.libSrc.querySelectorAll("button"))) b.classList.toggle("on", b.dataset.s === s);
      this.el.libQ.placeholder = s === "cm" ? "Search: halftone, sparkle, background, glow, icon\u2026" : s === "pk" ? "Search: barrel, sword, brick, sky, shockwave, graffiti\u2026" : "Search: house, shop, obby, portal, coin\u2026";
      this.cmLimit = 60;
      if (s === "pk" && !this.packs && !this.packsLoading && this.h.loadPacks) {
        this.packsLoading = true;
        this.h.loadPacks().then(
          (d) => {
            this.packs = d;
            this.packsLoading = false;
            this.renderLibrary();
          },
          (e) => {
            this.packsLoading = false;
            this.el.libGrid.innerHTML = `<div class="empty">Could not load asset packs: ${esc(e.message)}</div>`;
          }
        );
      }
      this.el.libDet.classList.add("hidden");
      this.el.libList.classList.remove("hidden");
      if (s === "cm" && !this.community && !this.communityLoading && this.h.loadCommunity) {
        this.communityLoading = true;
        this.h.loadCommunity().then(
          (d) => {
            this.community = d;
            this.communityLoading = false;
            this.renderLibrary();
          },
          (e) => {
            this.communityLoading = false;
            this.el.libGrid.innerHTML = `<div class="empty">Could not load community resources: ${esc(e.message)}</div>`;
          }
        );
      }
      this.renderLibrary();
    }
    cmThumb(it) {
      if (!it.i) return `<div class="ph">${esc(it.s)}<br>${esc(it.c)}</div>`;
      const hit = this.thumbCache.get(it.i);
      return hit ? `<img alt="" src="${hit}">` : `<div class="ph" data-th="${esc(it.i)}">\u2026</div>`;
    }
    observeThumbs() {
      if (!this.h.thumb) return;
      const load = (el) => {
        const url = el.dataset.th;
        delete el.dataset.th;
        this.h.thumb(url).then(
          (data) => {
            this.thumbCache.set(url, data);
            if (el.isConnected) el.outerHTML = `<img alt="" src="${data}">`;
          },
          () => {
            if (el.isConnected) el.textContent = "no preview";
          }
        );
      };
      this.thumbObserver?.disconnect();
      const els = Array.from(this.root.querySelectorAll("[data-th]"));
      if (typeof IntersectionObserver === "undefined") {
        els.slice(0, 24).forEach(load);
        return;
      }
      this.thumbObserver = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) {
          this.thumbObserver?.unobserve(e.target);
          load(e.target);
        }
      }, { root: this.el.libGrid, rootMargin: "120px" });
      for (const el of els) this.thumbObserver.observe(el);
    }
    renderCommunity() {
      const d = this.community;
      if (!d) {
        this.el.libCats.innerHTML = "";
        this.el.libGrid.innerHTML = `<div class="empty">${this.communityLoading ? "Loading community resources\u2026" : "Community resources are not available."}</div>`;
        return;
      }
      const counts = /* @__PURE__ */ new Map([["All", d.items.length]]);
      for (const it of d.items) counts.set(it.c, (counts.get(it.c) ?? 0) + 1);
      const cats = [...counts.keys()].sort((a, b) => a === "All" ? -1 : b === "All" ? 1 : counts.get(b) - counts.get(a));
      this.el.libCats.innerHTML = cats.map((c) => `<button class="chip ${c === this.cmCat ? "on" : ""}" data-c="${esc(c)}">${esc(c)}<i>${counts.get(c)}</i></button>`).join("") + `<button class="chip" id="cmRefresh" title="Fetch the latest catalogue from ui-resources.com">\u21BB Refresh</button>`;
      for (const b of Array.from(this.el.libCats.querySelectorAll("button[data-c]"))) b.onclick = () => {
        this.cmCat = b.dataset.c;
        this.cmLimit = 60;
        this.renderLibrary();
      };
      const rf = this.root.getElementById("cmRefresh");
      if (rf) rf.onclick = () => {
        if (!this.h.refreshCommunity) return;
        rf.textContent = "\u21BB \u2026";
        this.h.refreshCommunity().then(
          (nd) => {
            this.community = nd;
            this.notify(`Community: ${nd.count} resources (updated ${nd.lastUpdated ?? nd.fetchedAt.slice(0, 10)}).`, "info", 6e3);
            this.renderLibrary();
          },
          (e) => {
            rf.textContent = "\u21BB Refresh";
            this.notify("Refresh failed: " + e.message, "error", 8e3);
          }
        );
      };
      const q = this.el.libQ.value.trim().toLowerCase();
      const match = (it) => !q || q.split(/\s+/).every((w) => `${it.t} ${it.a} ${it.c} ${it.g} ${it.d} ${it.s}`.toLowerCase().includes(w));
      const list = d.items.filter((it) => (this.cmCat === "All" || it.c === this.cmCat) && match(it));
      const shown = list.slice(0, this.cmLimit);
      this.el.libGrid.innerHTML = shown.length ? shown.map((it) => `<button class="card" data-id="${esc(it.id)}" title="${esc(`${it.t}${it.a ? " \u2014 by " + it.a : ""}`)}"><div class="pv cm">${this.cmThumb(it)}</div><div class="nm">${esc(it.t)}</div><div class="ds">${esc(`${it.c}${it.a ? " \xB7 " + it.a : ""}${it.g ? " \xB7 " + it.g : ""}`)}</div></button>`).join("") + (list.length > shown.length ? `<button class="ghost more" id="cmMore">Show more (${list.length - shown.length})</button>` : "") : `<div class="empty">Nothing found.</div>`;
      for (const c of Array.from(this.el.libGrid.querySelectorAll(".card"))) c.onclick = () => this.openCommunity(c.dataset.id);
      const more = this.root.getElementById("cmMore");
      if (more) more.onclick = () => {
        this.cmLimit += 60;
        this.renderLibrary();
      };
      this.observeThumbs();
    }
    openCommunity(id) {
      const it = this.community?.items.find((x) => x.id === id);
      if (!it) return;
      const det = this.el.libDet;
      const imageLike = !!it.i;
      det.innerHTML = `<div class="det"><div class="big pv cm">${this.cmThumb(it)}</div><div>
      <h3>${esc(it.t)}</h3><div class="kd">${esc(`${it.c}${it.a ? " \xB7 by " + it.a : ""} \xB7 ${it.s}`)}</div>
      ${it.d ? `<div>${esc(it.d)}</div>` : ""}${it.g ? `<div class="hint">Tags: ${esc(it.g)}</div>` : ""}
      <div class="acts2" style="flex-direction:row;flex-wrap:wrap">${it.w ? `<button class="ghost" id="cmOpen">Open page \u2197</button>` : ""}${it.dl ? `<button class="ghost" id="cmDl">Download file \u2197</button>` : ""}</div>
      ${imageLike ? `<input class="q" id="cmAsset" placeholder="Roblox asset id (optional): rbxassetid://\u2026 or number" style="margin-top:8px">` : ""}
      <textarea id="libNotes" placeholder="Optional notes: where to use it, colours, size\u2026" style="margin-top:6px"></textarea>
      <div class="acts2">
        <button class="pri" id="cmUse" title="The agent puts it into your game (uses the asset id if you have one; never invents ids)">${imageLike ? "Use in my game" : "Apply to my game"}</button>
        <button id="cmLike" title="The agent uses it only as a visual reference and builds its own version with the BW helpers \u2014 no upload needed">Make something inspired by it</button>
        <button class="ghost" id="libBack">\u2190 Back to community</button>
      </div>
      <div class="hint" style="margin-top:6px">Resources belong to their authors \u2014 check the terms on the source page and credit them when required.</div></div></div>`;
      this.el.libList.classList.add("hidden");
      det.classList.remove("hidden");
      this.observeThumbs();
      const val = (id2) => this.root.getElementById(id2)?.value ?? "";
      const open = (url) => this.h.switchProvider(url);
      const o = this.root.getElementById("cmOpen");
      if (o) o.onclick = () => open(it.w);
      const dl = this.root.getElementById("cmDl");
      if (dl) dl.onclick = () => open(it.dl);
      const run = (mode) => {
        const asset = val("cmAsset").trim();
        if (asset && !/^(rbxassetid:\/\/)?\d{5,}$/.test(asset)) {
          this.notify("Asset id must be a number (e.g. 1234567890) or rbxassetid://1234567890.", "error", 8e3);
          return;
        }
        this.h.useResource?.(communityTask(it, mode, asset, val("libNotes")));
        det.classList.add("hidden");
        this.el.libList.classList.remove("hidden");
        this.showTab("agent");
      };
      this.root.getElementById("cmUse").onclick = () => run("use");
      this.root.getElementById("cmLike").onclick = () => run("inspired");
      this.root.getElementById("libBack").onclick = () => {
        det.classList.add("hidden");
        this.el.libList.classList.remove("hidden");
      };
    }
    // ---------------------------------------------------- Packs (bundled .rbxm asset packs)
    pkThumb(p, it, size = 48) {
      if (p.sprite && it.t >= 0 && this.h.resourceUrl) {
        const sc = size / p.tile;
        const x = it.t % p.cols * size;
        const y = Math.floor(it.t / p.cols) * size;
        return `<div class="spr" style="width:${size}px;height:${size}px;background:url('${this.h.resourceUrl(p.sprite)}') -${x}px -${y}px/${p.cols * p.tile * sc}px auto no-repeat"></div>`;
      }
      return `<div class="ph">${esc(it.k)}</div>`;
    }
    renderPacks() {
      const d = this.packs;
      if (!d) {
        this.el.libCats.innerHTML = "";
        this.el.libGrid.innerHTML = `<div class="empty">${this.packsLoading ? "Loading asset packs\u2026" : "Asset packs are not available."}</div>`;
        return;
      }
      const total = d.reduce((a, p) => a + p.items.length, 0);
      const kinds = /* @__PURE__ */ new Map();
      for (const p of d) for (const it of p.items) kinds.set(it.k, (kinds.get(it.k) ?? 0) + 1);
      const chips = [["all", "All", total], ...d.map((p) => [p.id, p.title.replace(/^(Official |The )/, "").replace(/ (Pack|Build Kit|Building Asset Pack)$/, ""), p.items.length]), ...[...kinds].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k2, n]) => ["k:" + k2, k2, n])];
      this.el.libCats.innerHTML = chips.map(([v, l, n]) => `<button class="chip ${v === this.pkSel ? "on" : ""}" data-c="${esc(v)}">${esc(l)}<i>${n}</i></button>`).join("");
      for (const b of Array.from(this.el.libCats.querySelectorAll("button[data-c]"))) b.onclick = () => {
        this.pkSel = b.dataset.c;
        this.cmLimit = 60;
        this.renderLibrary();
      };
      const q = this.el.libQ.value.trim().toLowerCase();
      const words = q.split(/\s+/).filter(Boolean);
      const list = [];
      for (const p of d) {
        if (this.pkSel !== "all" && !this.pkSel.startsWith("k:") && p.id !== this.pkSel) continue;
        for (const it of p.items) {
          if (this.pkSel.startsWith("k:") && it.k !== this.pkSel.slice(2)) continue;
          const hay = `${it.n} ${it.c} ${it.k} ${it.id}`.toLowerCase().replace(/_/g, " ");
          if (words.every((w) => hay.includes(w))) list.push([p, it]);
        }
      }
      const shown = list.slice(0, this.cmLimit);
      this.el.libGrid.innerHTML = shown.length ? shown.map(([p, it]) => `<button class="card" data-id="${esc(it.id)}" title="${esc(`${it.n} \u2014 ${it.c} (${p.title})`)}"><div class="pv pk">${this.pkThumb(p, it, 64)}</div><div class="nm">${esc(it.n.replace(/_/g, " "))}</div><div class="ds">${esc(`${it.k} \xB7 ${it.c}`)}</div></button>`).join("") + (list.length > shown.length ? `<button class="ghost more" id="pkMore">Show more (${list.length - shown.length})</button>` : "") : `<div class="empty">Nothing found. The agent can also search the packs itself (brickwire_assets).</div>`;
      for (const c of Array.from(this.el.libGrid.querySelectorAll(".card"))) c.onclick = () => this.openPackItem(c.dataset.id);
      const more = this.root.getElementById("pkMore");
      if (more) more.onclick = () => {
        this.cmLimit += 60;
        this.renderLibrary();
      };
    }
    openPackItem(id) {
      let found = null;
      for (const p2 of this.packs ?? []) {
        const it2 = p2.items.find((x) => x.id === id);
        if (it2) found = [p2, it2];
      }
      if (!found) return;
      const [p, it] = found;
      const apply = it.k === "texture" || it.k === "decal";
      const det = this.el.libDet;
      det.innerHTML = `<div class="det"><div class="big pv pk">${this.pkThumb(p, it, 96)}</div><div>
      <h3>${esc(it.n.replace(/_/g, " "))}</h3><div class="kd">${esc(`${it.k} \xB7 ${it.c} \xB7 ${p.title}`)}</div>
      <div class="hint">${esc(p.description)}</div>
      <div class="opt">${esc(apply ? `BW.asset("${it.id}", {ApplyTo = part})` : `BW.asset("${it.id}", {At={x,y,z}, Facing=0, Scale=1})`)}${it.s?.length === 3 ? `<br>size ${esc(it.s.join(" \xD7 "))} studs` : ""}</div>
      <textarea id="libNotes" placeholder="Optional notes: where to put it, how many, scale, which part to apply it to\u2026"></textarea>
      <div class="acts2">
        <button class="pri" id="pkPlace">${apply ? "Apply to my parts" : "Place in my game"}</button>
        <button id="pkUse" title="The agent builds something bigger with this asset">Build something with it</button>
        <button class="ghost" id="pkCopy" title="Copy the id">Copy id</button>
        <button class="ghost" id="libBack">\u2190 Back to packs</button>
      </div></div></div>`;
      this.el.libList.classList.add("hidden");
      det.classList.remove("hidden");
      const notes = () => this.root.getElementById("libNotes")?.value ?? "";
      const run = (mode) => {
        this.h.useResource?.(packTask(it, mode, notes()));
        det.classList.add("hidden");
        this.el.libList.classList.remove("hidden");
        this.showTab("agent");
      };
      this.root.getElementById("pkPlace").onclick = () => run("place");
      this.root.getElementById("pkUse").onclick = () => run("use");
      this.root.getElementById("pkCopy").onclick = () => {
        void navigator.clipboard?.writeText(it.id).then(() => this.notify(`Copied ${it.id}`, "info", 3e3), () => void 0);
      };
      this.root.getElementById("libBack").onclick = () => {
        det.classList.add("hidden");
        this.el.libList.classList.remove("hidden");
      };
    }
    renderLibrary() {
      if (this.libSource === "cm") return this.renderCommunity();
      if (this.libSource === "pk") return this.renderPacks();
      const LIB_KITS = KITS.filter((k2) => k2.kind !== "style" && k2.id !== "ui_showcase");
      if (this.libCat === "style") this.libCat = "all";
      const counts = { all: LIB_KITS.length + ICON_IDS.length, icon: ICON_IDS.length };
      for (const k2 of LIB_KITS) counts[k2.kind] = (counts[k2.kind] ?? 0) + 1;
      const cats = ["all", "build", "furniture", "gameplay", "ui", "vfx", "anim", "icon"];
      this.el.libCats.innerHTML = cats.map((c) => `<button class="chip ${c === this.libCat ? "on" : ""}" data-c="${c}">${c === "all" ? "All" : KIND_LABELS[c].en}<i>${counts[c] ?? 0}</i></button>`).join("");
      for (const b of Array.from(this.el.libCats.querySelectorAll("button"))) b.onclick = () => {
        this.libCat = b.dataset.c;
        this.renderLibrary();
      };
      const q = this.el.libQ.value.trim().toLowerCase();
      const match = (s) => !q || q.split(/\s+/).every((w) => s.toLowerCase().includes(w));
      const items = [];
      if (this.libCat !== "icon") {
        for (const k2 of LIB_KITS) if ((this.libCat === "all" || k2.kind === this.libCat) && match(`${k2.id} ${k2.name} ${k2.nameRu} ${k2.desc} ${k2.tags}`)) items.push({ id: k2.id, name: k2.name, desc: k2.desc, icon: false });
      }
      if (this.libCat === "all" || this.libCat === "icon") {
        for (const id of ICON_IDS) if (match(`${id} icon ${ICONS[id].tags}`)) items.push({ id, name: id[0].toUpperCase() + id.slice(1), desc: "icon \xB7 " + ICONS[id].tags, icon: true });
      }
      this.el.libGrid.innerHTML = items.length ? items.map((it) => `<button class="card" data-id="${it.id}" title="${esc(it.desc)}"><div class="pv ${it.icon ? "ico" : ""}">${this.previewOf(it.id)}</div><div class="nm">${esc(it.name)}</div><div class="ds">${esc(it.desc)}</div></button>`).join("") : `<div class="empty">Nothing found. Describe it in the chat instead \u2014 the agent can build it from scratch.</div>`;
      for (const c of Array.from(this.el.libGrid.querySelectorAll(".card"))) c.onclick = () => this.openResource(c.dataset.id);
    }
    openResource(id) {
      const k2 = KITS.find((x) => x.id === id);
      const icon = ICONS[id];
      const name = k2?.name ?? id;
      const det = this.el.libDet;
      det.innerHTML = `<div class="det"><div class="big">${this.previewOf(id)}</div><div>
      <h3>${esc(name)}</h3><div class="kd">${esc(k2 ? `${KIND_LABELS[k2.kind].en} \xB7 ${k2.nameRu}` : "Icon \xB7 BW.icon")}</div>
      <div>${esc(k2?.desc ?? "Vector icon made of GUI frames \u2014 no image upload needed. Tags: " + (icon?.tags ?? ""))}</div>
      <div class="opt">${esc(k2 ? `BW.kit("${k2.id}", {At={x,y,z}, Facing=0${k2.opts ? ", " + k2.opts.split(" ").filter((o) => /^[a-zA-Z]+$/.test(o)).map((o) => o + "=\u2026").join(", ") : ""}})` : `BW.icon(parent, "${id}", {Size={0,48,0,48}, Color="#hex"})`)}</div>
      <textarea id="libNotes" placeholder="Optional notes: size, colours, where to put it, what to change\u2026"></textarea>
      <div class="acts2">
        <button class="pri" id="libExact" title="Builds this resource as-is (ONE BW.kit call), then verifies it">${k2 ? "Build this" : "Use this icon"}</button>
        ${k2?.kind === "style" ? `<button id="libRestyle" title="Re-skins your existing UI in this style (names and scripts stay)">Restyle my UI</button>` : ""}
        ${k2 && k2.kind !== "style" ? `<button id="libLike" title="The AI designs its own version in the same style">Make something like it</button>
        <button id="libShot" title="Puts a request into the message box \u2014 attach your screenshot and send">Like my screenshot\u2026</button>` : ""}
        <button class="ghost" id="libBack">\u2190 Back to library</button>
      </div></div></div>`;
      this.el.libList.classList.add("hidden");
      det.classList.remove("hidden");
      const notes = () => this.root.getElementById("libNotes")?.value ?? "";
      const run = (mode) => {
        const text = resourceTask(id, mode, notes());
        this.h.useResource?.(text);
        det.classList.add("hidden");
        this.el.libList.classList.remove("hidden");
        this.showTab("agent");
      };
      this.root.getElementById("libExact").onclick = () => run("exact");
      const restyle = this.root.getElementById("libRestyle");
      if (restyle) restyle.onclick = () => run("restyle");
      const like = this.root.getElementById("libLike");
      if (like) like.onclick = () => run("similar");
      const shot = this.root.getElementById("libShot");
      if (shot) shot.onclick = async () => {
        const ok = await this.h.fillComposer?.(resourceTask(id, "screenshot", notes()));
        this.notify(ok ? "Request is in the message box \u2014 attach your screenshot to it, then press Start Agent (or send it if the agent is already running)." : "Message box not found \u2014 open a chat first.", ok ? "info" : "error", 2e4);
      };
      this.root.getElementById("libBack").onclick = () => {
        det.classList.add("hidden");
        this.el.libList.classList.remove("hidden");
      };
    }
    floating = false;
    drag = null;
    /** Floating window (fixed, draggable by the title bar) or docked above the composer. */
    setFloating(on) {
      this.floating = on;
      const wrap = this.root.querySelector(".wrap");
      wrap.classList.toggle("float", on);
      if (on) {
        this.host.style.cssText = "display:block;position:fixed;right:18px;bottom:18px;width:min(480px,calc(100vw - 36px));z-index:2147483646";
        const bar = this.root.querySelector(".bar");
        bar.onpointerdown = (e) => {
          if (e.target.closest("button,select")) return;
          const r = this.host.getBoundingClientRect();
          this.drag = { x: e.clientX, y: e.clientY, r: window.innerWidth - r.right, b: window.innerHeight - r.bottom };
          bar.setPointerCapture(e.pointerId);
        };
        bar.onpointermove = (e) => {
          if (!this.drag) return;
          const right = Math.max(0, Math.min(window.innerWidth - 120, this.drag.r - (e.clientX - this.drag.x)));
          const bottom = Math.max(0, Math.min(window.innerHeight - 40, this.drag.b - (e.clientY - this.drag.y)));
          this.host.style.right = right + "px";
          this.host.style.bottom = bottom + "px";
        };
        bar.onpointerup = () => this.drag = null;
        if (this.host.parentElement !== document.body) document.body.appendChild(this.host);
      } else {
        this.host.style.cssText = "display:block;width:100%;position:relative;z-index:5";
        const bar = this.root.querySelector(".bar");
        bar.onpointerdown = bar.onpointermove = bar.onpointerup = null;
        if (this.host.parentElement === document.body) this.host.remove();
      }
      this.el.float.title = on ? "Dock above the message box" : "Floating window";
    }
    /** Match the site's theme: light panel on light pages (Notion, Claude light…), dark otherwise. */
    applyTheme() {
      const lum = (() => {
        const probe = [this.host.parentElement, document.body, document.documentElement];
        for (let el = probe.find(Boolean) ?? null; el; el = el.parentElement) {
          const m = getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
          if (m && (m[4] === void 0 || Number(m[4]) > 0.5)) return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
        }
        for (const el of [document.body, document.documentElement]) {
          const m = el && getComputedStyle(el).backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/);
          if (m && (m[4] === void 0 || Number(m[4]) > 0.5)) return (0.2126 * Number(m[1]) + 0.7152 * Number(m[2]) + 0.0722 * Number(m[3])) / 255;
        }
        return matchMedia?.("(prefers-color-scheme: light)").matches ? 1 : 0;
      })();
      this.root.querySelector(".wrap").classList.toggle("light", lum > 0.6);
    }
    styleMode() {
      const m = this.el.mode.value;
      this.el.mode.className = "m-" + m;
      this.el.mode.title = MODE_INFO[m]?.hint ?? "";
    }
    applyCollapse() {
      this.el.body.classList.toggle("hide", this.collapsed);
      this.el.collapse.textContent = this.collapsed ? "+" : "\u2212";
    }
    setConnection(s) {
      const dot = this.el.dot;
      if (!s.online || !s.health) {
        dot.className = "dot";
        this.el.state.textContent = "Bridge offline";
        this.el.studio.textContent = " \xB7 run start.bat";
        dot.title = s.error ?? "Bridge offline";
        this.el.project.textContent = "";
        return;
      }
      const h = s.health;
      const ready = h.state === "MCP_READY" || h.state === "SESSION_ACTIVE";
      dot.className = "dot " + (ready ? "g" : "y");
      dot.title = `${h.reason} (MCP: ${h.mcp.state}, ${h.mcp.toolCount} tools)`;
      this.el.state.textContent = this.active ? ready ? "Agent Active" : "Agent \u2014 Studio unavailable" : ready ? "Studio Ready" : "Bridge connected";
      this.el.studio.textContent = ready ? ` \xB7 ${h.mcp.toolCount} tools` : ` \xB7 ${h.reason}`;
      this.el.project.textContent = h.studio.selected ? ` \xB7 Project: ${h.session?.projectName ?? h.studio.selected.name}` : "";
    }
    setSession(s) {
      this.active = s.active;
      this.el.start.textContent = s.active ? "Stop Agent" : "Start Agent";
      this.el.start.className = s.active ? "no" : "pri";
      this.el.pause.classList.toggle("hidden", !s.active);
      this.el.stop.classList.toggle("hidden", !s.active);
      this.el.pause.textContent = s.paused ? "Resume" : "Pause";
      if (s.active && this.collapsed) {
        this.collapsed = false;
        this.applyCollapse();
      }
      if (s.active) this.el.state.textContent = s.paused ? "Agent Paused" : "Agent Active";
    }
    setStage(stage) {
      this.stage = stage;
      this.renderStages();
    }
    renderStages() {
      const order = ["ANALYZE", "PLAN", "EXECUTE", "TEST", "FIX", "DONE"];
      const idx = order.indexOf(this.stage);
      this.el.stages.innerHTML = order.map((s, i) => `<span class="stg ${i === idx ? "on" : i < idx ? "past" : ""}">${s}</span>`).join("");
    }
    setTask(task) {
      this.el.task.textContent = task ?? "\u2014";
      this.el.task.title = task ?? "";
    }
    activity(key2, text, state) {
      let row = this.acts.get(key2);
      if (!row) {
        row = document.createElement("div");
        this.acts.set(key2, row);
        this.el.act.appendChild(row);
        while (this.el.act.children.length > 40) {
          const first = this.el.act.firstElementChild;
          for (const [k2, v] of this.acts) if (v === first) this.acts.delete(k2);
          first.remove();
        }
      }
      row.className = "i-" + state;
      row.textContent = `${ICON[state]} ${text}`;
      row.title = text;
      this.el.act.scrollTop = this.el.act.scrollHeight;
    }
    baseTitle = null;
    showApproval(env) {
      this.approvalId = env?.approvalId ?? null;
      if (env && this.baseTitle === null) {
        this.baseTitle = document.title;
        document.title = "\u26A0 Approve \u2014 " + this.baseTitle;
      } else if (!env && this.baseTitle !== null) {
        document.title = this.baseTitle;
        this.baseTitle = null;
      }
      this.el.appr.classList.toggle("hidden", !env);
      this.el.approveTop.classList.toggle("hidden", !env);
      if (env) {
        const a = env.args;
        const code = typeof a.code === "string" ? a.code : typeof a.source === "string" ? a.source : "";
        const target = String(a.path ?? a.parent ?? a.name ?? "");
        this.el.apTool.textContent = `${env.tool} ${target}`.trim();
        this.el.apWhy.textContent = env.approvalReason ? `\u2014 ${env.approvalReason}` : "";
        this.el.apCode.textContent = code || JSON.stringify(a, null, 2);
        this.el.apCode.scrollTop = 0;
        if (this.collapsed) {
          this.collapsed = false;
          this.applyCollapse();
        }
      }
    }
    notify(msg, level, ms, pre = false) {
      const n = this.el.note;
      n.className = "note " + level + (pre || msg.includes("\n") ? " pre" : "");
      n.textContent = msg;
      clearTimeout(n._t);
      n._t = window.setTimeout(() => n.classList.add("hidden"), ms ?? (level === "error" ? 15e3 : 8e3));
      if (this.collapsed) {
        this.collapsed = false;
        this.applyCollapse();
      }
    }
  };

  // extension/src/content.ts
  (async function main() {
    if (window.__brickwire) return;
    window.__brickwire = true;
    const settings = await loadSettings();
    const host = location.hostname.toLowerCase();
    const custom = settings.customSites.find((c) => host === c.host || host.endsWith("." + c.host));
    const adapter = createAdapter(host) ?? (custom ? createCustomAdapter(custom) : null);
    if (!adapter) return;
    if (adapter.info.id !== "custom" && settings.providers[adapter.info.id] === false) return;
    startClock();
    const bridge = new BridgeClient();
    let core2;
    const report = () => {
      const state = {
        provider: adapter.info.id,
        providerName: adapter.info.name,
        active: core2.active,
        stage: core2.stage,
        task: core2.task,
        sessionId: core2.sessionId,
        url: location.href
      };
      try {
        chrome.runtime.sendMessage({ type: "tabState", state }, () => void chrome.runtime.lastError);
      } catch {
      }
    };
    const panel = new AgentPanel(
      adapter.info.name,
      {
        start: () => void core2.start(),
        stop: () => void core2.stop(),
        pause: () => core2.pause(),
        approve: (id, ok) => void core2.approve(id, ok),
        approveAll: (id) => void core2.approveAll(id),
        setCategory: (c) => {
          void saveProviderPrefs(adapter.info.id, { category: c });
          void core2.setCategory(c);
        },
        setMode: (m) => {
          void saveProviderPrefs(adapter.info.id, { mode: m });
          void core2.setMode(m);
        },
        switchProvider: (url) => chrome.runtime.sendMessage({ type: "openUrl", url }),
        openBridge: () => chrome.runtime.sendMessage({ type: "openDashboard" }),
        openPaint: () => openPaint(),
        toggleCompact: () => {
          try {
            return setCompact(localStorage.getItem("bw-compact") === "off");
          } catch {
            return localStorage.getItem("bw-compact") !== "off";
          }
        },
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
          void core2.setSuperMode(on);
        },
        setNotionLog: (on) => {
          void saveProviderPrefs(adapter.info.id, { notionLog: on });
          void core2.setNotionLog(on);
          if (on) panel.notify("Dev Log is on: after each step Notion AI also edits a page \u2014 turns get slower, Brickwire waits longer for it.", "info");
        },
        useResource: (text) => void core2.submitTask(text),
        fillComposer: (text) => core2.fillComposer(text),
        loadPreviews: async () => {
          const r = await fetch(chrome.runtime.getURL("library/previews.json"));
          return await r.json();
        },
        loadPacks: async () => {
          const r = await fetch(chrome.runtime.getURL("library/packs.json"));
          return await r.json();
        },
        resourceUrl: (p) => chrome.runtime.getURL(p),
        loadCommunity: async () => {
          try {
            const c = await chrome.storage.local.get("communityCache");
            if (c?.communityCache?.items?.length) return c.communityCache;
          } catch {
          }
          const r = await fetch(chrome.runtime.getURL("library/community.json"));
          return await r.json();
        },
        refreshCommunity: async () => {
          const r = await chrome.runtime.sendMessage({ type: "communityRefresh" });
          if (!r?.ok || !r.data?.items?.length) throw new Error(r?.error ?? "no data");
          try {
            await chrome.storage.local.set({ communityCache: r.data });
          } catch {
          }
          return r.data;
        },
        thumb: async (url) => {
          const r = await chrome.runtime.sendMessage({ type: "thumb", url, size: 192 });
          if (!r?.ok || typeof r.data !== "string") throw new Error(r?.error ?? "no thumbnail");
          return r.data;
        },
        siteCheck: () => {
          const r = adapter.diagnose();
          const lines = [`Site check \u2014 ${adapter.info.name} (${location.hostname}${location.pathname.slice(0, 40)})`, ...r.lines];
          lines.push(`${clockAlive() ? "\u2713" : "\u2715"} background timer: ${clockAlive() ? "alive (works in hidden tabs)" : "not connected \u2014 reload the tab"}`);
          lines.push(`\xB7 tab ${document.hidden ? "hidden" : "visible"} \xB7 agent ${core2.active ? "active" : "idle"} \xB7 stage ${core2.stage}`);
          lines.push(r.ok ? "Result: OK" : "Result: problems found \u2014 send this text + a screenshot to the developer");
          try {
            void navigator.clipboard?.writeText(lines.join("\n")).catch(() => void 0);
          } catch {
          }
          return lines;
        }
      },
      settings.panelCollapsed,
      adapter.info.id,
      prefsFor(settings, adapter.info.id)
    );
    core2 = new AgentCore(adapter, bridge, panel, settings, report);
    startPluginLink(core2, adapter);
    if (adapter.info.status === "experimental") panel.notify(`${adapter.info.name} support is experimental: ${adapter.info.notes}`, "warn");
    let mountedOnce = false;
    const startOnce = () => {
      if (mountedOnce) return;
      mountedOnce = true;
      core2.startMonitoring();
      void core2.tryResume().then((ok) => ok && report());
    };
    const bootAt = Date.now();
    const preferFloat = !!adapter.info.preferFloatingPanel && localStorage.getItem("bw-docked") !== "on";
    let userFloating = settings.panelFloating || preferFloat;
    let autoFloated = false;
    const ensureMounted = () => {
      if (panel.floating && autoFloated && !userFloating && adapter.getComposer()) {
        autoFloated = false;
        panel.setFloating(false);
      }
      if (panel.floating) {
        if (panel.host.parentElement !== document.body) document.body.appendChild(panel.host);
        if (adapter.getComposer()) startOnce();
        return;
      }
      if (!mountedOnce && !autoFloated && Date.now() - bootAt > 1e4 && !adapter.getComposer()) {
        autoFloated = true;
        panel.setFloating(true);
        panel.notify(`${adapter.info.name}: message box not found yet. Open a chat, then press Site check if this stays.`, "warn");
        return ensureMounted();
      }
      if (panel.host.isConnected && adapter.getComposer()) {
        const c = adapter.getComposer();
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
    setInterval(ensureMounted, 2e3);
    const deliverToChat = async (png, rawText, name) => {
      let mode = "none";
      let error;
      if (!adapter.getComposer()) return { mode, provider: adapter.info.id, error: "message box not found on this page" };
      if (png && adapter.attachImage) {
        const bin = Uint8Array.from(atob(png.replace(/^data:[^,]*,/, "")), (ch) => ch.charCodeAt(0));
        const file = new File([bin], name || "brickwire-paint.png", { type: "image/png" });
        if (await adapter.attachImage(file)) mode = "image";
        else error = "this site did not accept the image \u2014 sent as text";
      }
      const text = rawText?.trim() || (mode === "image" ? "\u{1F3A8} (image from Brickwire Paint)" : "");
      if (text) {
        const ok = await adapter.sendMessage(mode === "image" || !png ? text : `${text}
[image could not be attached]`);
        if (ok && mode === "none") mode = "text";
        if (!ok) {
          error = error ?? "send failed";
          if (mode !== "image") mode = "none";
        }
      } else if (mode === "none") error = error ?? "nothing to send";
      return { mode, provider: adapter.info.id, error };
    };
    let paintHost = null;
    let paintFrame = null;
    const closePaint = () => {
      paintHost?.remove();
      paintHost = null;
      paintFrame = null;
    };
    const openPaint = () => {
      if (paintHost) {
        paintHost.style.display = "block";
        return;
      }
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
    addEventListener("message", (ev) => {
      if (!paintFrame || ev.source !== paintFrame.contentWindow) return;
      const d = ev.data;
      if (d?.type === "brickwire:paint:close") return closePaint();
      if (d?.type === "brickwire:paint:hide") {
        if (paintHost) paintHost.style.display = "none";
        return;
      }
      if (d?.type !== "brickwire:paint:send") return;
      const target = paintFrame.contentWindow;
      if (paintHost) paintHost.style.display = "none";
      void (async () => {
        let r;
        try {
          r = await deliverToChat(d.png, d.text);
        } catch (e) {
          r = { mode: "none", provider: adapter.info.id, error: e.message };
        }
        panel.notify(r.mode === "image" ? "Brickwire: picture attached and sent" : r.mode === "text" ? `Brickwire: sent as text (${r.error ?? "fallback"})` : `Brickwire: could not send (${r.error})`, r.mode === "none" ? "error" : r.mode === "text" ? "warn" : "info");
        target?.postMessage({ type: "brickwire:paint:result", id: d.id, ...r }, "*");
        if (r.mode === "none" && paintHost) paintHost.style.display = "block";
      })();
    });
    let compactOn = localStorage.getItem("bw-compact") !== "off";
    const compactCss = document.createElement("style");
    compactCss.setAttribute("data-brickwire", "compact");
    compactCss.textContent = `
[data-bw-label]:not([data-bw-open]){max-height:28px!important;min-height:0!important;overflow:hidden!important;font-size:0!important;line-height:0!important;color:transparent!important;padding:0!important;margin:4px 0!important;border:0!important;background:none!important;box-shadow:none!important;cursor:pointer!important}
[data-bw-label]:not([data-bw-open]) *{font-size:0!important;line-height:0!important;color:transparent!important;border-color:transparent!important;background:none!important;box-shadow:none!important}
[data-bw-label]:not([data-bw-open])::before{content:attr(data-bw-label);display:inline-block;font:500 12px/20px system-ui,-apple-system,Segoe UI,sans-serif;color:#b9bfd0;background:#1b1d23;border:1px solid #2c3039;border-radius:999px;padding:2px 10px;white-space:nowrap}
[data-bw-hide]:not([data-bw-open]){max-height:0!important;min-height:0!important;overflow:hidden!important;margin:0!important;padding:0!important;border:0!important;font-size:0!important}
[data-bw-open]{outline:1px dashed #3a3f4b;outline-offset:2px}`;
    const applyCompactCss = () => {
      if (compactOn) {
        if (!compactCss.isConnected) document.head.appendChild(compactCss);
      } else compactCss.remove();
    };
    const chips = /* @__PURE__ */ new WeakMap();
    const chipEls = /* @__PURE__ */ new Set();
    const isOurs = (el) => !!el.closest("[data-brickwire-host],textarea,[contenteditable='true'],[contenteditable=''],input");
    const holdsUi = (el) => !!el.querySelector("textarea,[contenteditable='true'],[contenteditable=''],input,[data-brickwire-host]") || !!el.closest("[data-brickwire-host]");
    const blockOf = (start) => {
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
    const toolsIn = (text) => Array.from(new Set(Array.from(text.matchAll(/"(?:tool|name)"\s*:\s*"([\w.\-]+)"/g), (m) => m[1]))).slice(0, 4);
    const secs = (ms) => ms < 6e4 ? `${Math.round(ms / 1e3)} \u0441` : `${Math.floor(ms / 6e4)} \u043C\u0438\u043D ${Math.round(ms % 6e4 / 1e3)} \u0441`;
    const labelFor = (el, c) => {
      const text = el.textContent ?? "";
      if (c.kind === "result") {
        const n = (text.match(/"status"\s*:/g) ?? []).length || 1;
        const bad = /"status"\s*:\s*"(error|failed|denied)"/.test(text);
        return `${bad ? "\u26A0" : "\u21A9"} \u0440\u0435\u0437\u0443\u043B\u044C\u0442\u0430\u0442\u044B \u043E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u044B \u043C\u043E\u0434\u0435\u043B\u0438 (${n})`;
      }
      if (c.kind === "prompt") return "\u{1F4CB} \u0437\u0430\u0434\u0430\u0447\u0430 + \u0438\u043D\u0441\u0442\u0440\u0443\u043A\u0446\u0438\u0438 Brickwire";
      if (c.kind === "service") return "\u21AA \u0441\u043B\u0443\u0436\u0435\u0431\u043D\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 Brickwire";
      const tools = toolsIn(text);
      const name = tools.length ? tools.join(", ") : "\u0433\u043E\u0442\u043E\u0432\u0438\u0442 \u043A\u043E\u043C\u0430\u043D\u0434\u0443\u2026";
      return c.done ? `\u2713 ${name} \xB7 ${secs(c.done - c.first)}` : `\u2699 ${name} \xB7 ${secs(Date.now() - c.first)}`;
    };
    const markRange = (first) => {
      if (!/ROBLOX_TOOL_CALL/.test(first.textContent ?? "") || /\/ROBLOX_TOOL_CALL/.test(first.textContent ?? "")) return;
      let n = first.nextElementSibling;
      for (let i = 0; n && i < 60; i++, n = n.nextElementSibling) {
        if (holdsUi(n)) break;
        n.setAttribute("data-bw-hide", "");
        if (/\/ROBLOX_TOOL_CALL/.test(n.textContent ?? "")) break;
      }
    };
    const scanCompact = () => {
      if (!compactOn || !document.body) return;
      applyCompactCss();
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => /ROBLOX_TOOL_(CALL|RESULT)|\[bw[:\-]/.test(n.nodeValue ?? "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      });
      const found = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const p = n.parentElement;
        if (!p || isOurs(p) || p.closest("[data-bw-label]")) continue;
        const blk = blockOf(p);
        if (holdsUi(blk)) continue;
        found.push(blk);
      }
      for (const el of found) {
        if (chips.has(el) || el.closest("[data-bw-label]") !== null && !chips.has(el)) {
          if (chips.has(el)) continue;
        }
        const text = el.textContent ?? "";
        const kind = /ROBLOX_TOOL_RESULT/.test(text) && /\[bw[:\-]/.test(text) ? "result" : /ROBLOX_TOOL_CALL/.test(text) && !/\[bw[:\-]/.test(text) ? "call" : text.length > 1500 ? "prompt" : "service";
        const c = { first: Date.now(), kind };
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
          const later = all.some((o) => o !== el && chips.get(o)?.kind === "result" && !!(el.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING));
          if (later) c.done = Date.now();
          if (c.kind === "call") markRange(el);
        }
        const l = labelFor(el, c);
        if (el.getAttribute("data-bw-label") !== l) el.setAttribute("data-bw-label", l);
      }
    };
    const setCompact = (on) => {
      compactOn = on;
      localStorage.setItem("bw-compact", on ? "on" : "off");
      applyCompactCss();
      if (on) scanCompact();
      return on;
    };
    document.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      const t = e.target?.closest?.("[data-bw-label]:not([data-bw-open])");
      if (!t || !compactOn) return;
      if (e.target.closest("button,[role='button'],a,input,textarea,[contenteditable='true']")) return;
      e.preventDefault();
      e.stopPropagation();
      t.setAttribute("data-bw-open", "");
      let n = t.nextElementSibling;
      while (n && n.hasAttribute("data-bw-hide")) {
        n.setAttribute("data-bw-open", "");
        n = n.nextElementSibling;
      }
    }, true);
    document.addEventListener("dblclick", (e) => {
      const t = e.target?.closest?.("[data-bw-label][data-bw-open]");
      if (!t) return;
      t.removeAttribute("data-bw-open");
      let n = t.nextElementSibling;
      while (n && n.hasAttribute("data-bw-hide")) {
        n.removeAttribute("data-bw-open");
        n = n.nextElementSibling;
      }
    }, true);
    let compactQueued = false;
    new MutationObserver(() => {
      if (compactQueued || !compactOn) return;
      compactQueued = true;
      setTimeout(() => {
        compactQueued = false;
        scanCompact();
      }, 400);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(() => compactOn && refreshChips(), 1e3);
    scanCompact();
    const awakeOn = () => adapter.info.id === "notion" ? localStorage.getItem("bw-awake") === "on" : localStorage.getItem("bw-awake") !== "off";
    document.documentElement.setAttribute("data-bw-awake", awakeOn() ? "on" : "off");
    let keepAlive = null;
    const coreActive = () => !!core2?.active;
    setInterval(() => {
      const want = awakeOn() && coreActive();
      if (want && !keepAlive && navigator.userActivation?.hasBeenActive) {
        try {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 20;
          gain.gain.value = 6e-4;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          keepAlive = ctx;
        } catch {
          keepAlive = null;
        }
      } else if (!want && keepAlive) {
        void keepAlive.close();
        keepAlive = null;
      }
      if (adapter.info.autoContinue !== false && coreActive() && Date.now() - lastContinueClick > 2e4) {
        const btn = Array.from(document.querySelectorAll("button")).find((b) => !isOurs(b) && b.offsetParent !== null && !b.closest("[role='dialog'],[aria-modal='true']") && /^(continue generating|продолжить генерацию)$/i.test((b.textContent ?? "").trim()));
        if (btn) {
          lastContinueClick = Date.now();
          btn.click();
          panel.notify("Brickwire: reply was cut off \u2014 pressed Continue", "info");
        }
      }
    }, 2e3);
    let lastContinueClick = 0;
    let outboxBusy = false;
    const pollOutbox = async () => {
      if (outboxBusy || document.visibilityState !== "visible" || !adapter.getComposer()) return;
      outboxBusy = true;
      try {
        const r = await chrome.runtime.sendMessage({ type: "bridge", method: "GET", path: "/api/outbox/next" });
        const it = r?.ok ? r.data?.item : null;
        if (!it) return;
        const { mode, error } = await deliverToChat(it.png, it.text, it.name);
        panel.notify(mode === "image" ? "Brickwire: image attached to the chat" : mode === "text" ? "Brickwire: sent as text (fallback)" : `Brickwire: could not send (${error})`, mode === "none" ? "error" : mode === "text" ? "warn" : "info");
        await chrome.runtime.sendMessage({ type: "bridge", method: "POST", path: `/api/outbox/${encodeURIComponent(it.id)}/result`, body: { mode, provider: adapter.info.id, error } });
      } catch {
      } finally {
        outboxBusy = false;
      }
    };
    setInterval(() => void pollOutbox(), 2e3);
    chrome.runtime.onMessage.addListener((msg, _s, reply) => {
      if (msg?.type === "agent:stop") void core2.stop().then(() => reply({ ok: true }));
      else if (msg?.type === "agent:state") {
        report();
        reply({ ok: true, active: core2.active, stage: core2.stage, provider: adapter.info.name });
      } else return false;
      return true;
    });
    const userSubmit = (e) => {
      if (!e.isTrusted) return;
      const c = adapter.getComposer();
      if (!c) return;
      const t = e.target;
      if (e.type === "keydown") {
        const k2 = e;
        if (k2.key !== "Enter" || k2.shiftKey || k2.isComposing || !t || !c.contains(t)) return;
      } else {
        const btn = t?.closest?.("button,[role='button']");
        if (!btn || btn.closest("[data-brickwire-host]")) return;
        let scope = c;
        for (let i = 0; i < 5 && scope?.parentElement; i++) scope = scope.parentElement;
        if (!scope?.contains(btn)) return;
      }
      const text = composerText(c);
      if (text.trim()) adapter.noteUserMessage(text);
      if (core2.active && AgentCore.isResendCommand(text)) setTimeout(() => void core2.resendInstructions("user"), 4e3);
    };
    document.addEventListener("keydown", userSubmit, true);
    document.addEventListener("click", userSubmit, true);
    report();
  })();
})();
