import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MemoryStore, projectKeyFor } from "../../bridge/src/memory.js";
import { SessionManager } from "../../bridge/src/sessions.js";
import { ApprovalManager } from "../../bridge/src/approvals.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bw-unit-"));

test("project memory persists and summarizes existing systems", () => {
  const dir = tmp();
  const m1 = new MemoryStore(dir);
  const m = m1.ensure(projectKeyFor(0, "My Game"), "My Game", null);
  assert.equal(m.key, "local-My_Game");
  m.scan = { at: "", scripts: [{ path: "game.ServerScriptService.Cases", class: "Script" }], guis: [{ path: "game.StarterGui.MenuCasov", class: "ScreenGui" }] };
  m1.save(m);
  m1.addItem(m, "system", "MenuCasov already exists — do not create CaseMenu", "game.StarterGui.MenuCasov");
  m1.addChange(m, "create_part", "create_part game.Workspace.A");
  m1.addError(m, "execute_luau", "attempt to index nil");
  const again = new MemoryStore(dir).get("local-My_Game")!;
  const s = new MemoryStore(dir).summary(again);
  assert.match(s, /Existing GUIs in StarterGui \(do NOT recreate\): MenuCasov/);
  assert.match(s, /do not create CaseMenu/);
  assert.match(s, /Known errors: execute_luau: attempt to index nil/);
  assert.deepEqual(m1.importantPaths(again), ["game.StarterGui.MenuCasov"]);
  assert.equal(projectKeyFor(12345, "x"), "place-12345");
});

test("sessions: single active session, persisted, stale sessions closed on restart", () => {
  const dir = tmp();
  const sm = new SessionManager(dir);
  const a = sm.start("chatgpt", "k", "P");
  const b = sm.start("claude", "k", "P");
  assert.equal(sm.get(a.id)!.active, false);
  assert.equal(sm.current?.id, b.id);
  sm.countCall(b.id, true);
  sm.update(b.id, { stage: "TEST" });
  const sm2 = new SessionManager(dir);
  assert.equal(sm2.get(b.id)!.active, false, "previous run's session closed");
  assert.equal(sm2.get(b.id)!.errors, 1);
  assert.equal(sm2.current, null);
});

test("approvals resolve, reject and time out", async () => {
  const am = new ApprovalManager();
  const a = am.request({ callId: "1", tool: "delete_instance", args: {}, reason: "x" }, 1000);
  assert.equal(am.list().length, 1);
  am.decide(a.approval.id, true);
  assert.equal(await a.decision, true);
  const b = am.request({ callId: "2", tool: "t", args: {}, reason: "x" }, 50);
  assert.equal(await b.decision, "timeout");
  const c = am.request({ callId: "3", tool: "t", args: {}, reason: "x" }, 1000);
  am.rejectAll();
  assert.equal(await c.decision, false);
});
