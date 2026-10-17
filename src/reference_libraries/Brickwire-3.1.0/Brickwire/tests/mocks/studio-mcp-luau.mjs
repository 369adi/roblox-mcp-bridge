#!/usr/bin/env node
/**
 * Realistic Roblox StudioMCP stand-in — TEST ONLY.
 *
 * Reproduces the behaviours of the real StudioMCP that broke Brickwire in practice:
 *  - tools/list returns ZERO tools until Studio "attaches" (MOCK_ATTACH_MS after boot),
 *    and it does NOT send notifications/tools/list_changed when they appear;
 *  - list_roblox_studios answers {"studios":[...]} (empty before attach);
 *  - get_studio_state answers plain text; "doesn't have a place opened" when MOCK_NO_PLACE=1;
 *  - execute_luau reports Luau failures as a NORMAL result ("Error executing code: …", isError=false);
 *  - studio_id is optional (the active Studio is used).
 *
 * Unlike the old mock, execute_luau runs the AI's arbitrary Luau for real in the Luau VM
 * (LUAU_BIN, default /data/tools/luau/luau) against tests/luau/roblox-stub.luau. The DataModel
 * persists by replaying every previously successful chunk before the current one.
 * Env: MOCK_ATTACH_MS (default 1500), MOCK_NO_PLACE=1, MOCK_STATE_FILE (JSON dump after calls).
 */
import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const LUAU = process.env.LUAU_BIN ?? "/data/tools/luau/luau";
const STUB = fs.readFileSync(path.join(here, "..", "luau", "roblox-stub.luau"), "utf8");
const ATTACH_MS = Number(process.env.MOCK_ATTACH_MS ?? 1500);
const bootAt = Date.now();
const attached = () => Date.now() - bootAt >= ATTACH_MS;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bw-studio-"));
const history = []; // successful execute_luau chunks (replayed to rebuild the DataModel)

const S = { type: "string" };
const TOOLS = [
  { name: "list_roblox_studios", description: "Lists Roblox Studio instances connected to this MCP server.", inputSchema: { type: "object", properties: {} } },
  { name: "get_studio_state", description: "Returns the state of the active Studio.", inputSchema: { type: "object", properties: { studio_id: S } } },
  { name: "search_game_tree", description: "Explores the instance hierarchy and returns a flat JSON array of instances.", inputSchema: { type: "object", properties: { studio_id: S, path: S, keywords: S, instance_type: S, max_depth: { type: "integer" } } } },
  { name: "inspect_instance", description: "Returns details (class, children) of one instance.", inputSchema: { type: "object", required: ["path"], properties: { studio_id: S, path: S } } },
  { name: "execute_luau", description: "Runs Luau code in Studio and returns printed output and the return value.", inputSchema: { type: "object", required: ["code", "datamodel_type"], properties: { studio_id: S, code: S, datamodel_type: { type: "string", enum: ["Edit", "Client", "Server"] } } } },
];

const DUMP = `
local function enc(v) return game:GetService("HttpService"):JSONEncode(v) end
local function node(i) return { name = i.Name, className = i.ClassName, path = "game." .. i:GetFullName() } end
local function resolve(p)
  local cur = game
  local segs = string.split and string.split(p, ".") or {}
  if #segs == 0 then for s in string.gmatch(p, "[^%.]+") do table.insert(segs, s) end end
  for i, s in ipairs(segs) do
    if not (i == 1 and (s == "game" or s == "Game")) then
      cur = cur:FindFirstChild(s)
      if not cur then return nil end
    end
  end
  return cur
end
`;

function runLuau(chunk, { record }) {
  const replay = history.map((c) => `do local print = function() end local ok = pcall(function()\n${c}\nend) end`).join("\n");
  const prog = `${STUB}\n${DUMP}\n${replay}\nprint("<<<BW-BEGIN>>>")\nlocal __ok, __ret = pcall(function()\n${chunk}\nend)\nif __ok then if __ret ~= nil then print("<<<BW-RET>>>" .. tostring(__ret)) end else print("<<<BW-ERR>>>" .. tostring(__ret)) end\n`;
  const f = path.join(tmp, "prog.luau");
  fs.writeFileSync(f, prog);
  let out = "";
  try {
    out = execFileSync(LUAU, [f], { encoding: "utf8", timeout: 15000 });
  } catch (e) {
    const msg = String(e.stdout ?? "") + String(e.stderr ?? e.message);
    return { ok: false, text: msg.split("\n").filter(Boolean).slice(-3).join("\n") };
  }
  const tail = out.split("<<<BW-BEGIN>>>\n")[1] ?? "";
  const err = tail.match(/<<<BW-ERR>>>([\s\S]*)$/);
  if (err) return { ok: false, text: err[1].trim() };
  if (record) history.push(chunk);
  const ret = tail.match(/<<<BW-RET>>>([\s\S]*)$/);
  const printed = tail.replace(/<<<BW-RET>>>[\s\S]*$/, "").trimEnd();
  return { ok: true, text: printed, ret: ret ? ret[1].trim() : null };
}

const text = (t, isError = false) => ({ content: [{ type: "text", text: typeof t === "string" ? t : JSON.stringify(t) }], isError });

function dumpState() {
  if (!process.env.MOCK_STATE_FILE) return;
  const r = runLuau(`local function d(i) local c = {} for _, ch in ipairs(i:GetChildren()) do table.insert(c, d(ch)) end return { name = i.Name, className = i.ClassName, children = c } end return enc(d(game))`, { record: false });
  if (r.ok && r.ret) fs.writeFileSync(process.env.MOCK_STATE_FILE, r.ret);
}

function callTool(name, a) {
  if (name === "list_roblox_studios") return text({ studios: attached() ? [{ id: "8521cfad-f8d9-46f4-8cbe-2a1b3c4d5e6f", name: process.env.MOCK_NO_PLACE === "1" ? null : "TestPlace", active: true }] : [] });
  if (!attached()) return text("Unable to find an active Studio instance. Make sure Studio is open with MCP enabled.");
  if (process.env.MOCK_NO_PLACE === "1") return text("The active Studio doesn't have a place opened.");
  switch (name) {
    case "get_studio_state":
      return text("Studio mode: Edit\nAvailable DataModels: Edit");
    case "search_game_tree": {
      const p = JSON.stringify(a.path ?? "game");
      const depth = Number(a.max_depth ?? 2);
      const kw = JSON.stringify(String(a.keywords ?? "").toLowerCase());
      const r = runLuau(
        `local root = resolve(${p}) if not root then error("Instance not found: " .. ${p}) end
local out = {}
local function w(i, d) for _, c in ipairs(i:GetChildren()) do if ${kw} == "" or string.find(string.lower(c.Name), ${kw}, 1, true) then table.insert(out, node(c)) end if d < ${depth} then w(c, d + 1) end end end
w(root, 1) return enc(out)`,
        { record: false },
      );
      return r.ok ? text(r.ret ?? "[]") : text("Error: " + r.text);
    }
    case "inspect_instance": {
      const p = JSON.stringify(a.path ?? "");
      const r = runLuau(`local i = resolve(${p}) if not i then error("Instance not found: " .. ${p}) end local n = node(i) n.children = {} for _, c in ipairs(i:GetChildren()) do table.insert(n.children, node(c)) end return enc(n)`, { record: false });
      return r.ok ? text(r.ret) : text("Error: " + r.text);
    }
    case "execute_luau": {
      if (typeof a.code !== "string") return text("Error: missing code", true);
      const r = runLuau(a.code, { record: true });
      dumpState();
      if (!r.ok) return text(`Error executing code: ${r.text}`); // NOTE: isError=false, like the real server
      const parts = [];
      if (r.text) parts.push(r.text);
      if (r.ret !== null) parts.push(`Return value: ${r.ret}`);
      return text(parts.join("\n") || "Code executed successfully (no output).");
    }
  }
  return { content: [], isError: true };
}

const send = (m) => process.stdout.write(JSON.stringify(m) + "\n");
process.stderr.write("StudioMCP stand-in booting\n");
createInterface({ input: process.stdin }).on("line", (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.method === "initialize")
    return send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "StudioMCP-standin", version: "test" } } });
  if (m.method === "tools/list") return send({ jsonrpc: "2.0", id: m.id, result: { tools: attached() ? TOOLS : [] } });
  if (m.method === "tools/call") {
    if (!attached()) return send({ jsonrpc: "2.0", id: m.id, error: { code: -32602, message: `Unknown tool: ${m.params?.name}` } });
    let result;
    try {
      result = callTool(m.params.name, m.params.arguments ?? {});
    } catch (e) {
      result = text(String(e), true);
    }
    return send({ jsonrpc: "2.0", id: m.id, result });
  }
  if (m.id !== undefined && m.method) send({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "method not found" } });
});
