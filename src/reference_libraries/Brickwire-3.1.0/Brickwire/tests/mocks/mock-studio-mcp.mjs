#!/usr/bin/env node
let staleProc = null;
/**
 * Mock Roblox Studio MCP server — TEST ONLY.
 * Speaks real MCP over stdio (newline-delimited JSON-RPC) with tool names/shapes modeled on
 * the documented Studio MCP tools, backed by an in-memory DataModel.
 * It interprets Brickwire composite Luau by reading the `--@bw-op` tag and the `local ARGS = …` literal;
 * arbitrary Luau is NOT executed (returns a notice), which is exactly why this is a mock.
 *
 * Env: MOCK_NO_STUDIO=1 (no studio connected), MOCK_EXIT_AFTER=n (crash after n calls),
 *      MOCK_SLOW=toolName:ms, MOCK_PRINT_ONLY=1 (execute_luau returns only printed output),
 *      MOCK_STATE_FILE=path (dump DataModel after each call, for test assertions)
 */
import { createInterface } from "node:readline";
import fs from "node:fs";

let uid = 0;
function inst(className, name, props = {}, children = []) {
  const n = { id: ++uid, className, name, props: { ...props }, attrs: {}, children: [], parent: null };
  for (const c of children) {
    c.parent = n;
    n.children.push(c);
  }
  return n;
}
const game = inst("DataModel", "TestPlace", {}, [
  inst("Workspace", "Workspace", {}, [
    inst("Camera", "Camera"),
    inst("Part", "Baseplate", { Anchored: true, Size: [2048, 16, 2048], Position: [0, -8, 0] }),
    inst("SpawnLocation", "SpawnLocation", { Anchored: true, Position: [0, 0.5, 0] }),
  ]),
  inst("ReplicatedStorage", "ReplicatedStorage", {}, [inst("RemoteEvent", "OpenCase")]),
  inst("ServerScriptService", "ServerScriptService", {}, [inst("Script", "Main", { Source: 'print("server up")\n' })]),
  inst("ServerStorage", "ServerStorage"),
  inst("StarterGui", "StarterGui", {}, [inst("ScreenGui", "MenuCasov", {}, [inst("Frame", "Main"), inst("LocalScript", "MenuClient", { Source: "-- menu\n" })])]),
  inst("StarterPlayer", "StarterPlayer"),
  inst("Lighting", "Lighting"),
]);
const console_ = ["Studio mock started"];
let playing = false;
let calls = 0;

const isScript = (n) => ["Script", "LocalScript", "ModuleScript"].includes(n.className);
const isBaseScript = (n) => ["Script", "LocalScript"].includes(n.className);
const pathOf = (n) => {
  const parts = [];
  for (let c = n; c && c !== game; c = c.parent) parts.unshift(/^[A-Za-z_][A-Za-z0-9_]*$/.test(c.name) ? "." + c.name : `["${c.name}"]`);
  return "game" + parts.join("");
};
const desc = (n) => n.children.flatMap((c) => [c, ...desc(c)]);
function resolveSegs(segs) {
  let cur = game;
  for (const s of segs.slice(1)) {
    const nx = cur.children.find((c) => c.name === s);
    if (!nx) return { err: `not found: '${s}' in ${cur === game ? "Game" : pathOf(cur).slice(5)}` };
    cur = nx;
  }
  return { inst: cur };
}
const segsOf = (p) => {
  const s = String(p).split(".");
  if (s[0] !== "game") s.unshift("game");
  return s;
};
function clone(n) {
  const c = { id: ++uid, className: n.className, name: n.name, props: JSON.parse(JSON.stringify(n.props)), attrs: { ...n.attrs }, children: [], parent: null };
  for (const ch of n.children) {
    const cc = clone(ch);
    cc.parent = c;
    c.children.push(cc);
  }
  return c;
}
const setParent = (n, p) => {
  if (n.parent) n.parent.children = n.parent.children.filter((x) => x !== n);
  n.parent = p;
  if (p) p.children.push(n);
};
const destroy = (n) => setParent(n, null);
const decode = (v) => (v && typeof v === "object" && !Array.isArray(v) && v.$type ? (v.$type === "Ref" ? { $ref: v.segs } : v.value) : v);
const applyProps = (n, props = {}) => {
  for (const [k, v] of Object.entries(props || {})) if (k !== "Parent" && k !== "ClassName") n.props[k] = decode(v);
  return [];
};

// --- tiny Luau literal parser (only the subset Brickwire's toLuau emits)
function parseLuauLiteral(src) {
  let i = 0;
  const ws = () => {
    while (/\s/.test(src[i])) i++;
  };
  const val = () => {
    ws();
    if (src.startsWith("nil", i)) return (i += 3), null;
    if (src.startsWith("true", i)) return (i += 4), true;
    if (src.startsWith("false", i)) return (i += 5), false;
    if (src[i] === '"') {
      i++;
      let s = "";
      while (src[i] !== '"') {
        if (src[i] === "\\") {
          const n = src[i + 1];
          if (n === "n") s += "\n", (i += 2);
          else if (n === "r") s += "\r", (i += 2);
          else if (n === "t") s += "\t", (i += 2);
          else if (/\d/.test(n)) {
            const m = src.slice(i + 1).match(/^\d{1,3}/)[0];
            s += String.fromCharCode(+m);
            i += 1 + m.length;
          } else s += n, (i += 2);
        } else s += src[i++];
      }
      i++;
      return s;
    }
    if (src[i] === "{") {
      i++;
      ws();
      const arr = [];
      const obj = {};
      let isObj = false;
      while (src[i] !== "}") {
        ws();
        if (src[i] === "[") {
          i++;
          const k = val();
          ws();
          i++; // ]
          ws();
          i++; // =
          obj[k] = val();
          isObj = true;
        } else arr.push(val());
        ws();
        if (src[i] === ",") i++;
        ws();
      }
      i++;
      return isObj ? obj : arr;
    }
    const m = src.slice(i).match(/^-?\d+(\.\d+)?(e[-+]?\d+)?/i);
    if (m) return (i += m[0].length), Number(m[0]);
    throw new Error("luau literal parse error at " + i + ": " + src.slice(i, i + 20));
  };
  return val();
}

function encodeProp(v) {
  if (Array.isArray(v) && v.length === 3) return { $type: "Vector3", value: v };
  return v;
}

function bwOp(op, A) {
  const must = (segs) => {
    const r = resolveSegs(segs);
    if (r.err) throw new Error(r.err);
    return r.inst;
  };
  const createTree = (node, parent, created) => {
    const n = inst(node.className, node.name ?? node.className);
    applyProps(n, node.properties);
    if (node.attributes) Object.assign(n.attrs, node.attributes);
    if (node.source !== undefined && isScript(n)) n.props.Source = node.source;
    for (const ch of node.children ?? []) createTree(ch, n, created);
    setParent(n, parent);
    created.push(pathOf(n));
    return n;
  };
  switch (op) {
    case "get_game_tree": {
      const root = must(A.segs);
      let count = 0;
      const walk = (n, d) => {
        count++;
        const node = { name: n.name, class: n.className, childCount: n.children.length };
        if (d < A.depth && n.children.length) {
          node.children = [];
          for (const c of n.children) {
            if (count >= A.maxNodes) {
              node.truncated = true;
              break;
            }
            node.children.push(walk(c, d + 1));
          }
        }
        return node;
      };
      const tree = walk(root, 0);
      return { path: pathOf(root), nodes: count, truncated: count >= A.maxNodes, tree };
    }
    case "get_project_info": {
      const all = desc(game);
      return {
        placeName: game.name,
        placeId: 0,
        gameId: 0,
        creatorId: 0,
        services: Object.fromEntries(game.children.map((s) => [s.name, { children: s.children.length, descendants: desc(s).length }])),
        scripts: all.filter(isScript).map((s) => ({ path: pathOf(s), class: s.className })),
        scriptCount: all.filter(isScript).length,
        guis: game.children.find((s) => s.name === "StarterGui").children.map((g) => ({ path: pathOf(g), class: g.className, descendants: desc(g).length })),
        remotes: all.filter((d) => d.className === "RemoteEvent").length,
      };
    }
    case "read_instance": {
      const n = must(A.segs);
      const props = A.props || ["Name", "ClassName", ...Object.keys(n.props)];
      return { path: pathOf(n), className: n.className, properties: Object.fromEntries(props.map((p) => [p, p === "Name" ? n.name : p === "ClassName" ? n.className : encodeProp(n.props[p])])), attributes: n.attrs, children: n.children.map((c) => `${c.name} (${c.className})`) };
    }
    case "create_instance":
    case "create_part":
    case "create_instance_tree":
    case "create_model":
    case "create_ui":
    case "ui_build":
    case "figma_to_studio":
    case "create_vfx":
    case "create_script": {
      const parent = must(A.parentSegs);
      if (A.tree.name) {
        const ex = parent.children.find((c) => c.name === A.tree.name);
        if (ex) {
          if (A.replace) destroy(ex);
          else throw new Error(`already exists: ${pathOf(ex)} (${ex.className}) — reuse/modify it or pass replaceExisting=true`);
        }
      }
      const created = [];
      const root = createTree(A.tree, parent, created);
      return { path: pathOf(root), className: root.className, created, propertyErrors: [] };
    }
    case "file_save":
    case "file_to_studio": {
      // Brickwire 3.0 file placement (only the script mode is simulated)
      if (A.mode !== "script") throw new Error("mock Studio simulates only script files");
      const def = A.className === "LocalScript" ? ["game", "StarterPlayer", "StarterPlayerScripts"] : A.className === "ModuleScript" ? ["game", "ReplicatedStorage"] : ["game", "ServerScriptService"];
      const parent = must(A.parent ?? def);
      const n = inst(A.className, A.name);
      if (A.className === "StringValue") n.props.Value = A.text; else n.props.Source = A.text;
      setParent(n, parent);
      return { created: [pathOf(n)] };
    }
    case "modify_instance": {
      const n = must(A.segs);
      const before = Object.fromEntries(Object.keys(A.props || {}).map((k) => [k, n.props[k] ?? null]));
      applyProps(n, A.props);
      Object.assign(n.attrs, A.attrs || {});
      if (A.rename) n.name = A.rename;
      return { path: pathOf(n), before, after: Object.fromEntries(Object.keys(A.props || {}).map((k) => [k, n.props[k]])), errors: [] };
    }
    case "delete_instance": {
      const n = must(A.segs);
      if (n.parent === game) throw new Error("refusing to delete a service");
      const info = { deleted: pathOf(n), className: n.className, descendants: desc(n).length };
      destroy(n);
      return info;
    }
    case "delete_script": {
      const n = must(A.segs);
      if (!isScript(n)) throw new Error(pathOf(n) + " is not a script");
      const p = pathOf(n);
      destroy(n);
      return { deleted: p };
    }
    case "clone_instance": {
      const src = must(A.segs);
      const parent = A.parentSegs ? must(A.parentSegs) : src.parent;
      const c = clone(src);
      if (A.name) c.name = A.name;
      setParent(c, parent);
      return { path: pathOf(c), className: c.className };
    }
    case "set_script_source": {
      const n = must(A.segs);
      if (!isScript(n)) throw new Error(pathOf(n) + " is not a script");
      const old = (n.props.Source ?? "").length;
      n.props.Source = A.source;
      return { path: pathOf(n), oldLength: old, newLength: A.source.length };
    }
    case "take_snapshot": {
      const ss = game.children.find((s) => s.name === "ServerStorage");
      let store = ss.children.find((c) => c.name === "__BrickwireSnapshots");
      if (!store) setParent((store = inst("Folder", "__BrickwireSnapshots")), ss);
      const snap = inst("Folder", A.id);
      const entries = A.segsList.map((segs, k) => {
        const i = k + 1;
        const r = resolveSegs(segs);
        const e = { index: i, absent: !r.inst, saved: false };
        if (r.inst) {
          e.parent = pathOf(r.inst.parent);
          e.name = r.inst.name;
          const c = clone(r.inst);
          c.attrs.BW_OriginalName = r.inst.name;
          c.name = String(i);
          setParent(c, snap);
          e.saved = true;
        }
        return e;
      });
      setParent(snap, store);
      return { id: A.id, entries };
    }
    case "restore_snapshot": {
      const ss = game.children.find((s) => s.name === "ServerStorage");
      const store = ss.children.find((c) => c.name === "__BrickwireSnapshots");
      const snap = store?.children.find((c) => c.name === A.id);
      const restored = [], removed = [], failed = [];
      for (const e of A.entries) {
        const cur = resolveSegs(e.segs).inst;
        if (e.absent) {
          if (cur) destroy(cur), removed.push(e.path);
        } else if (e.saved) {
          const saved = snap?.children.find((c) => c.name === String(e.index));
          const parent = resolveSegs(e.parentSegs).inst;
          if (!saved || !parent) failed.push(e.path);
          else {
            if (cur) destroy(cur);
            const c = clone(saved);
            c.name = saved.attrs.BW_OriginalName ?? c.name;
            delete c.attrs.BW_OriginalName;
            setParent(c, parent);
            restored.push(e.path);
          }
        }
      }
      return { snapshotId: A.id, restored, removed, failed };
    }
  }
  throw new Error("mock cannot run op " + op);
}

const S = { type: "string" };
const SID = { type: "string", description: "Studio instance id from list_roblox_studios" };
const TOOLS = [
  { name: "list_roblox_studios", description: "Lists all connected Studio instances.", inputSchema: { type: "object", properties: {} } },
  { name: "search_game_tree", description: "Explores the instance hierarchy as a flat JSON array.", inputSchema: { type: "object", required: ["studio_id"], properties: { studio_id: SID, path: S, instance_type: S, keywords: S, max_depth: { type: "integer" } } } },
  { name: "inspect_instance", description: "Detailed information about an instance.", inputSchema: { type: "object", required: ["studio_id", "path"], properties: { studio_id: SID, path: S } } },
  { name: "script_read", description: "Reads a script by dot path.", inputSchema: { type: "object", required: ["studio_id", "path"], properties: { studio_id: SID, path: S, start_line: { type: "integer" }, end_line: { type: "integer" } } } },
  { name: "script_search", description: "Fuzzy search scripts by name.", inputSchema: { type: "object", required: ["studio_id", "query"], properties: { studio_id: SID, query: S } } },
  { name: "script_grep", description: "Search a pattern across scripts.", inputSchema: { type: "object", required: ["studio_id", "pattern"], properties: { studio_id: SID, pattern: S } } },
  { name: "multi_edit", description: "Applies multiple edits to a script; creates it if missing.", inputSchema: { type: "object", required: ["studio_id", "path", "edits", "datamodel_type"], properties: { studio_id: SID, path: S, datamodel_type: { type: "string", enum: ["Edit"] }, edits: { type: "array", items: { type: "object", properties: { old_string: S, new_string: S } } } } } },
  { name: "execute_luau", description: "Runs Luau code in Studio.", inputSchema: { type: "object", required: ["studio_id", "code", "datamodel_type"], properties: { studio_id: SID, code: S, datamodel_type: { type: "string", enum: ["Edit", "Client", "Server"] } } } },
  { name: "get_studio_state", description: "Current Studio state.", inputSchema: { type: "object", required: ["studio_id"], properties: { studio_id: SID } } },
  { name: "start_stop_play", description: "Starts or stops playtesting.", inputSchema: { type: "object", required: ["studio_id", "action"], properties: { studio_id: SID, action: { type: "string", enum: ["start", "stop"] } } } },
  { name: "get_console_output", description: "Output log.", inputSchema: { type: "object", required: ["studio_id"], properties: { studio_id: SID } } },
];

const text = (t, isError = false) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t) }], isError });

function callTool(name, a) {
  const noStudio = process.env.MOCK_NO_STUDIO === "1";
  if (name === "list_roblox_studios") return text(noStudio ? [] : [{ studio_id: "studio-1", name: game.name, place_id: null }]);
  if (noStudio || (a.studio_id !== "studio-1" && name !== "run_code")) return text(`unknown studio_id ${a.studio_id}`, true);
  switch (name) {
    case "search_game_tree": {
      const r = resolveSegs(segsOf(a.path ?? "game"));
      if (r.err) return text(r.err, true);
      const maxD = a.max_depth ?? 3;
      const out = [];
      const walk = (n, d) => {
        for (const c of n.children) {
          if ((!a.instance_type || c.className === a.instance_type) && (!a.keywords || c.name.toLowerCase().includes(a.keywords.toLowerCase())))
            out.push({ path: pathOf(c), name: c.name, className: c.className });
          if (d < maxD) walk(c, d + 1);
        }
      };
      walk(r.inst, 1);
      return text(out);
    }
    case "inspect_instance": {
      const r = resolveSegs(segsOf(a.path));
      if (r.err) return text(r.err, true);
      const n = r.inst;
      return text({ path: pathOf(n), className: n.className, name: n.name, properties: n.props, attributes: n.attrs, children: n.children.map((c) => ({ name: c.name, className: c.className })), descendantCount: desc(n).length });
    }
    case "script_read": {
      const r = resolveSegs(segsOf(a.path));
      if (r.err || !isScript(r.inst)) return text(r.err ?? "not a script", true);
      return text(r.inst.props.Source ?? "");
    }
    case "script_search":
      return text(desc(game).filter((n) => isScript(n) && n.name.toLowerCase().includes(String(a.query).toLowerCase())).slice(0, 10).map((n) => ({ path: pathOf(n), className: n.className })));
    case "script_grep": {
      const hits = [];
      for (const n of desc(game).filter(isScript)) (n.props.Source ?? "").split("\n").forEach((l, i) => l.includes(a.pattern) && hits.push({ path: pathOf(n), line: i + 1, text: l }));
      return text(hits.slice(0, 50));
    }
    case "multi_edit": {
      const segs = segsOf(a.path);
      let r = resolveSegs(segs);
      if (r.err) {
        const parent = resolveSegs(segs.slice(0, -1));
        if (parent.err) return text(parent.err, true);
        const s = inst("Script", segs.at(-1), { Source: "" });
        setParent(s, parent.inst);
        r = { inst: s };
      }
      let src = r.inst.props.Source ?? "";
      for (const e of a.edits) {
        if (e.old_string === "" || e.old_string === undefined) src += e.new_string;
        else if (!src.includes(e.old_string)) return text(`old_string not found: ${e.old_string}`, true);
        else src = src.replace(e.old_string, e.new_string);
      }
      r.inst.props.Source = src;
      return text(`Edited ${pathOf(r.inst)} (${a.edits.length} edits)`);
    }
    case "run_code": // open-source studio-rust-mcp-server shape: run_code {command}, output = printed text
    case "execute_luau": {
      const code = String(name === "run_code" ? a.command : a.code);
      if (name === "run_code" && a.code !== undefined) return text("unexpected argument 'code' (run_code takes 'command')", true);
      const op = code.match(/^--@bw-op (\S+)/m)?.[1];
      const lit = code.match(/^local ARGS = (.*)$/m)?.[1];
      if (!op || !lit) return text("[mock] arbitrary Luau is not executed by the mock Studio", false);
      let payload;
      try {
        payload = { ok: true, result: bwOp(op, parseLuauLiteral(lit)) };
      } catch (e) {
        payload = { ok: false, error: e.message };
      }
      const s = "BWJSON<<" + JSON.stringify(payload) + ">>BWJSON";
      if (name === "run_code") return text(code.includes("print(__s)") ? s : "nil");
      if (process.env.MOCK_PRINT_ONLY === "1") {
        if (code.includes("print(__s)")) console_.push(s);
        return text("nil");
      }
      return text(s);
    }
    case "get_studio_state":
      return text({ play_state: playing ? "Play" : "Edit", datamodel_types: playing ? ["Edit", "Client", "Server"] : ["Edit"] });
    case "start_stop_play":
      playing = a.action === "start";
      if (playing) {
        console_.push("Play started");
        for (const n of desc(game).filter((x) => isBaseScript(x) && !String(x.props.Source ?? "").includes("--disabled"))) {
          const m = String(n.props.Source ?? "").match(/error\("([^"]*)"\)/);
          if (m) console_.push(`${pathOf(n).slice(5)}:1: ${m[1]}`, "Stack Begin", `Script '${pathOf(n).slice(5)}', Line 1`, "Stack End");
          const p = String(n.props.Source ?? "").match(/print\("([^"]*)"\)/);
          if (p) console_.push(p[1]);
        }
      } else console_.push("Play stopped");
      return text(`Playtest ${playing ? "started" : "stopped"}`);
    case "get_console_output":
      return text(console_.slice(-200).join("\n"));
  }
  return text("unknown tool " + name, true);
}

function send(m) {
  process.stdout.write(JSON.stringify(m) + "\n");
}
process.stdout.write("mock studio mcp booting (non-JSON noise line)\n");
createInterface({ input: process.stdin }).on("line", async (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.method === "initialize") return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: m.params.protocolVersion, capabilities: { tools: { listChanged: true } }, serverInfo: { name: "MockStudioMCP", version: "0.0-test" } } });
  if (m.method === "notifications/initialized") {
    send({ jsonrpc: "2.0", id: "srv-ping-1", method: "ping" }); // exercise server→client requests
    return;
  }
  if (m.method === "tools/list") {
    const hide = (process.env.MOCK_HIDE_TOOLS ?? "").split(",").filter(Boolean);
    let tools = TOOLS.filter((t) => !hide.includes(t.name));
    if (process.env.MOCK_RUN_CODE === "1")
      tools = tools.filter((t) => t.name !== "execute_luau").concat([{ name: "run_code", description: "Runs a command in Roblox Studio and returns the printed output. Can be used to make changes or retrieve information", inputSchema: { type: "object", required: ["command"], properties: { command: { type: "string", description: "code to run" } } } }]);
    return send({ jsonrpc: "2.0", id: m.id, result: { tools } });
  }
  if (m.method === "tools/call") {
    calls++;
    const slow = process.env.MOCK_SLOW?.split(":");
    if (slow && slow[0] === m.params.name) await new Promise((r) => setTimeout(r, Number(slow[1])));
    if (process.env.MOCK_EXIT_AFTER && calls >= Number(process.env.MOCK_EXIT_AFTER)) process.exit(3);
    // stale StudioMCP.exe after a Studio update: every call fails until the proxy process is restarted
    if (process.env.MOCK_STALE_FILE && (staleProc ??= fs.existsSync(process.env.MOCK_STALE_FILE))) {
      if (process.env.MOCK_STALE_FOREVER !== "1") try { fs.unlinkSync(process.env.MOCK_STALE_FILE); } catch {}
      return send({ jsonrpc: "2.0", id: m.id, error: { code: -32603, message: "Client proxy is out of date, restart to update" } });
    }
    let result;
    try {
      result = callTool(m.params.name, m.params.arguments ?? {});
    } catch (e) {
      result = text(String(e.stack || e), true);
    }
    if (process.env.MOCK_STATE_FILE) {
      const dump = (n) => ({ name: n.name, className: n.className, props: n.props, children: n.children.map(dump) });
      fs.writeFileSync(process.env.MOCK_STATE_FILE, JSON.stringify(dump(game)));
    }
    return send({ jsonrpc: "2.0", id: m.id, result });
  }
  if (m.id !== undefined && m.method) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
});
