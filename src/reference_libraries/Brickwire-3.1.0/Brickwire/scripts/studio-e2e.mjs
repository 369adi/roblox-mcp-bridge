#!/usr/bin/env node
/**
 * Brickwire — REAL Roblox Studio end-to-end check.
 *
 * Run this on the machine where Roblox Studio is open (Windows/macOS) with a place loaded,
 * "Enable Studio as MCP server" turned on, and the bridge running (start.bat).
 *
 *   node scripts/studio-e2e.mjs [--port 47821] [--keep]
 *
 * Steps (mandatory acceptance test):
 *   1. bridge health → MCP connected, Studio found
 *   2. start session — StudioMCP must advertise execute_luau (0 tools = Studio not attached)
 *   3. execute_luau: list Workspace children
 *   4. execute_luau: create AgentTestPart
 *   5. execute_luau: verify AgentTestPart exists
 *   6. execute_luau: destroy AgentTestPart (destructive → approved via the bridge API by this script)
 *   7. execute_luau: verify AgentTestPart is gone
 * Prints PASS/FAIL per step and exits 0 only if everything passed.
 */
const argv = process.argv.slice(2);
const port = Number(argv[argv.indexOf("--port") + 1]) || Number(process.env.BRICKWIRE_PORT) || 47821;
const keep = argv.includes("--keep");
const BASE = `http://127.0.0.1:${port}`;
const PART = "AgentTestPart";
const results = [];
let failed = false;

const c = (code, s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
async function api(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} → HTTP ${r.status}: ${j.error ?? JSON.stringify(j)}`);
  return j;
}
async function step(name, fn) {
  const t0 = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`${c(32, "PASS")} ${name} ${c(90, `(${Date.now() - t0} ms)`)}${detail ? "  " + c(90, String(detail).slice(0, 200)) : ""}`);
    return true;
  } catch (e) {
    failed = true;
    results.push({ name, ok: false, error: e.message });
    console.log(`${c(31, "FAIL")} ${name}: ${e.message}`);
    return false;
  }
}

let sessionId;
let seq = 0;
/** Submit a tool call; auto-approve any approval the bridge requests for THIS call only. */
async function call(tool, args) {
  let env = await api("POST", "/api/calls", { sessionId, provider: "studio-e2e", call: { id: `e2e_${++seq}`, tool, args }, waitMs: 25000 });
  const deadline = Date.now() + 240000;
  while (env.state !== "done") {
    if (Date.now() > deadline) throw new Error(`${tool}: timed out waiting for result`);
    if (env.state === "pending_approval" && env.approvalId) {
      console.log(c(33, `     approval requested (${env.approvalReason ?? "risky"}) → approving via API`));
      await api("POST", `/api/approvals/${env.approvalId}`, { approve: true });
    }
    env = await api("GET", `/api/calls/${env.callId}?wait=25000&since=${env.state}`);
  }
  const r = env.result;
  if (r.status !== "success") throw new Error(`${tool} → ${r.status}: ${r.error}`);
  return r.result;
}

console.log(c(1, `Brickwire Studio E2E against ${BASE}\n`));

const okHealth = await step("1. bridge health (MCP connected + Studio found)", async () => {
  const h = await api("GET", "/api/health");
  if (h.mcp.state !== "ready") throw new Error(`MCP state=${h.mcp.state} ${h.mcp.lastError ?? ""} (command: ${h.mcp.command}). Enable Studio as MCP server in Assistant → Manage MCP Servers.`);
  if (!["MCP_READY", "SESSION_ACTIVE"].includes(h.state)) throw new Error(`bridge state=${h.state}: ${h.reason ?? ""}`);
  return `${h.mcp.serverName ?? "?"} ${h.mcp.serverVersion ?? ""}, ${h.mcp.toolCount} MCP tools, studio=${h.studio.selected?.name ?? h.studio.selected?.id ?? "?"}, mode=${h.settings.mode}`;
});
if (!okHealth) await finish();

await step("2. start session (tools advertised by StudioMCP)", async () => {
  const s = await api("POST", "/api/sessions/start", { provider: "studio-e2e", task: "Brickwire acceptance test" });
  sessionId = s.session.id;
  const names = s.tools.map((t) => t.name);
  if (!names.includes("execute_luau")) throw new Error(`execute_luau missing (have: ${names.join(", ") || "NO TOOLS"}) — Studio is not attached to StudioMCP`);
  return `${s.tools.length} tools: ${names.join(", ")}`;
});
if (!sessionId) await finish();

// Every step below goes through the same path the AI uses: bridge → StudioMCP → execute_luau → Studio.
const luau = (code) => call("execute_luau", { code, datamodel_type: "Edit" }).then((r) => (typeof r === "string" ? r : JSON.stringify(r)));
const EXISTS = `local p = workspace:FindFirstChild("${PART}")\nprint("BW_EXISTS=" .. tostring(p ~= nil) .. " CLASS=" .. (p and p.ClassName or "none"))`;

await step("3. read Workspace children", async () => {
  const out = await luau(`local n = {}\nfor _, c in ipairs(workspace:GetChildren()) do table.insert(n, c.Name) end\nprint("BW_CHILDREN=" .. table.concat(n, ","))`);
  const m = out.match(/BW_CHILDREN=([^"\\\n]*)/);
  if (!m) throw new Error("no output from Studio: " + out.slice(0, 300));
  if (m[1].split(",").includes(PART)) {
    console.log(c(33, `     ${PART} already exists — removing leftover from a previous run`));
    await luau(`workspace["${PART}"]:Destroy()`);
  }
  return m[1].slice(0, 200);
});

await step(`4. create ${PART} (execute_luau)`, async () => {
  const out = await luau(`local p = Instance.new("Part")\np.Name = "${PART}"\np.Size = Vector3.new(4, 1, 4)\np.Position = Vector3.new(0, 10, 0)\np.Anchored = true\np.Color = Color3.fromRGB(0, 170, 255)\np.Parent = workspace\nprint("BW_CREATED=" .. p:GetFullName())`);
  if (!/BW_CREATED=Workspace\.AgentTestPart/.test(out)) throw new Error("unexpected output: " + out.slice(0, 300));
  return "Workspace." + PART;
});

await step(`5. verify ${PART} exists (separate read)`, async () => {
  const out = await luau(EXISTS);
  if (!/BW_EXISTS=true CLASS=Part/.test(out)) throw new Error("not found after create: " + out.slice(0, 300));
  return "exists, ClassName=Part";
});

if (!keep) {
  await step(`6. delete ${PART} (execute_luau, destructive → approved by this script)`, async () => {
    const out = await luau(`workspace:FindFirstChild("${PART}"):Destroy()\nprint("BW_DELETED")`);
    if (!/BW_DELETED/.test(out)) throw new Error("unexpected output: " + out.slice(0, 300));
    return "destroyed";
  });
  await step(`7. verify ${PART} is gone`, async () => {
    const out = await luau(EXISTS);
    if (!/BW_EXISTS=false/.test(out)) throw new Error(`${PART} still exists: ` + out.slice(0, 300));
    return "gone";
  });
}
await finish();

async function finishAsync() {
  if (sessionId) await api("POST", "/api/sessions/stop", { sessionId }).catch(() => {});
}
function finish() {
  finishAsync().finally(() => {
    const passed = results.filter((r) => r.ok).length;
    console.log(`\n${failed ? c(31, "RESULT: FAIL") : c(32, "RESULT: PASS")} — ${passed}/${results.length} steps passed`);
    if (failed) console.log("See TROUBLESHOOTING.md and the bridge log (dashboard → Logs).");
    process.exit(failed ? 1 : 0);
  });
  return new Promise(() => {});
}
