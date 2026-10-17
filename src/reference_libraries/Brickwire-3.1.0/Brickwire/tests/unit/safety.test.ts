import { test } from "node:test";
import assert from "node:assert/strict";
import { assessCall, decide, riskFromName } from "../../shared/src/safety.js";
import type { ToolDescriptor } from "../../shared/src/protocol.js";

const d = (name: string, risk = riskFromName(name)): ToolDescriptor => ({ name, description: "", inputSchema: {}, source: "mcp", risk, available: true });

test("risk from tool names", () => {
  assert.equal(riskFromName("search_game_tree"), "read");
  assert.equal(riskFromName("script_read"), "read");
  assert.equal(riskFromName("multi_edit"), "write");
  assert.equal(riskFromName("insert_asset"), "write");
  assert.equal(riskFromName("delete_instance"), "destructive");
  assert.equal(riskFromName("execute_luau"), "write");
});

test("execute_luau is classified by its code", () => {
  const t = d("execute_luau");
  assert.equal(assessCall(t, { code: "return #workspace:GetChildren()" }).risk, "read");
  assert.equal(assessCall(t, { code: "workspace.Part.Anchored = true" }).risk, "write");
  assert.equal(assessCall(t, { code: "workspace.Baseplate:Destroy()" }).risk, "destructive");
  assert.equal(assessCall(t, { code: "for _,v in workspace:GetDescendants() do v.Transparency = 1 end" }).risk, "destructive");
  assert.equal(assessCall(t, { code: "-- x:Destroy() in a comment\nreturn 1" }).risk, "read");
  // BW helper library: builders write, read helpers stay read
  assert.equal(assessCall(t, { code: 'BW.part{Name="A", Size={4,1,4}}' }).risk, "write");
  assert.equal(assessCall(t, { code: 'BW.script("Script", "Coins", nil, "print(1)")' }).risk, "write");
  assert.equal(assessCall(t, { code: 'BW.tree("Workspace", 2)\nBW.logs(20)' }).risk, "read");
  assert.equal(assessCall(t, { code: 'BW.animate("Workspace.Coin", "spin")' }).risk, "write");
  assert.equal(assessCall(t, { code: 'BW.playAnim(BW.rig("Guard"), "wave")' }).risk, "write");
  assert.equal(assessCall(t, { code: 'BW.joints("Workspace.Guard")' }).risk, "read");
});

test("important systems escalate risk", () => {
  const r = assessCall(d("modify_instance", "write"), { path: "game.StarterGui.MenuCasov.Frame" }, ["game.StarterGui.MenuCasov"]);
  assert.equal(r.risk, "destructive");
  assert.match(r.reasons.join(), /important system/);
});

test("mode decisions", () => {
  assert.equal(decide("auto", "read", []).action, "allow");
  assert.equal(decide("auto", "write", []).action, "allow");
  assert.equal(decide("auto", "destructive", []).action, "confirm");
  assert.equal(decide("approval", "write", []).action, "confirm");
  assert.equal(decide("full", "destructive", ["x"]).action, "allow");
  assert.equal(decide("safe", "write", []).action, "deny");
  assert.equal(decide("safe", "read", []).action, "allow");
});

test("execute_luau: counting descendants or numeric build loops are not 'mass change'; replace pattern still confirmed", () => {
  const luau = { name: "execute_luau", description: "", inputSchema: { type: "object" }, risk: "write", source: "mcp", available: true } as any;
  const build = `local m = Instance.new('Model')\nfor i=1,16 do local p = Instance.new('Part') p.Parent = m end\nreturn #m:GetDescendants()`;
  assert.deepEqual(assessCall(luau, { code: build }), { risk: "write", reasons: [] });
  const replace = `local old = workspace:FindFirstChild('Dragon')\nif old then old:Destroy() end\n` + build;
  const r = assessCall(luau, { code: replace });
  assert.equal(r.risk, "destructive");
  assert.deepEqual(r.reasons, ["Luau code destroys/removes instances"]);
  const mass = `for _, d in ipairs(workspace:GetDescendants()) do d.Transparency = 1 end`;
  assert.match(assessCall(luau, { code: mass }).reasons.join(), /many instances/);
});
