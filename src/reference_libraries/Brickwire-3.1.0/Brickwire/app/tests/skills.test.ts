import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SkillRegistry } from "../../bridge/src/skill-registry.js";
import { withBridge } from "../../tests/integration/helpers.js";
async function temp(fn: (s: SkillRegistry, d: string) => Promise<void>) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bw-skills-"));
  try {
    await fn(new SkillRegistry(d), d);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
}
const pack = () => ({
  format: "brickwire-skill-pack",
  version: 1,
  skill: {
    name: "Fixture Skill",
    description: "Instructions, not executable tools",
    category: "Custom",
    version: "1.0",
    body: "Inspect before changes; report NOT RUN.",
    requires: ["missing_fixture_tool"],
  },
  resources: [{ name: "example.lua", kind: "template", text: 'return "NOT RUN"' }],
});
test("bundled 11 Skills/22 templates stay disabled; capabilities/metadata do not install tools", () =>
  temp(async (s) => {
    assert.equal(s.list().length, 11);
    assert.equal(s.templates().length, 22);
    assert.ok(s.list().every((x) => !x.enabled && !x.executable && !x.runtimeVerified));
    assert.equal(s.agentContext([]), "");
    assert.throws(() => s.read("lurong-modeling", true), /disabled/);
    assert.throws(() => s.enable("lurong-modeling", true, false), /Подтвердите/);
    s.enable("lurong-modeling", true, true);
    assert.match(s.agentContext([]), /missing: execute_luau/);
    assert.equal(s.list().find((x) => x.id === "lurong-modeling")?.compatibility, "partial");
  }));
test("source duplicates deduplicate; resource pagination reproduces complete text and preserves source SHA", () =>
  temp(async (s) => {
    const skill = s.read("strict-luau-math");
    assert.equal(skill.resources.length, 1);
    assert.equal(skill.resourceIndex[0].sources.length, 2);
    const id = skill.resources[0];
    let offset: number | null = 0,
      text = "";
    while (offset !== null) {
      const r = s.resource(skill.id, id, offset, 1700);
      text += r.text;
      offset = r.nextOffset;
    }
    const exported = s.export(skill.id);
    assert.equal(text, exported.resources[0].text);
    assert.match(text, /STRICT MATH/);
    assert.throws(() => s.resource(skill.id, "../../.env"), /linked/);
    assert.throws(() => s.resource(skill.id, id, -1), /page/);
  }));
test("templates are real sources with Kit dependency composed but not executed", () =>
  temp(async (s) => {
    const ui = s.template("ui-wooden_menu");
    assert.match(ui.source, /local Kit = \(function\(\)/);
    assert.match(ui.source, /return Kit\s*\nend\)\(\)/);
    assert.match(ui.source, /Kit.setStyle\("wooden"\)/);
    assert.equal(ui.execution, "export-only");
    assert.equal(ui.runtimeVerified, false);
    assert.throws(() => s.template("ui-wooden_menu", true), /disabled/);
    s.enable("lurong-checkui", true, true);
    assert.ok(s.template("ui-wooden_menu", true).chars > 49000);
    assert.match(s.template("model-cottage").source, /Cottage/);
    assert.ok(s.read("lurong-checkui").resourceIndex.some((r) => r.kind === "license"));
  }));
test("JSON import requires explicit authorization, deduplicates, remains disabled and survives restart", () =>
  temp(async (s, d) => {
    assert.throws(() => s.import(pack(), false), /authorization/);
    const r = s.import(pack(), true);
    assert.equal(r.enabled, false);
    assert.equal(s.import(pack(), true).duplicate, true);
    assert.equal(s.list().length, 12);
    const reload = new SkillRegistry(d);
    assert.equal(reload.get(r.id).name, "Fixture Skill");
    assert.equal(reload.list().find((x) => x.id === r.id)?.enabled, false);
    reload.enable(r.id, true, true);
    assert.match(new SkillRegistry(d).agentContext([]), /Fixture Skill/);
    assert.throws(() => reload.remove(r.id, false), /Confirm/);
    reload.remove(r.id, true);
    assert.throws(() => reload.get(r.id), /not found/);
  }));
test("export/import round trip includes original references; no executable config or external file imports", () =>
  temp(async (s) => {
    const original = s.export("lurong-checkui");
    const r = s.import(original, true);
    const result = s.export(r.id);
    assert.deepEqual(result.resources, original.resources);
    assert.throws(() => s.import({ format: "mcp", command: "node" }, true), /brickwire-skill-pack/);
    assert.throws(
      () =>
        s.import(
          { ...pack(), resources: [{ name: "../../secret", kind: "reference", file: "/etc/passwd" }] },
          true,
        ),
      /Invalid resource/,
    );
    assert.throws(
      () => s.import({ ...pack(), skill: { ...pack().skill, body: "a".repeat(12001) } }, true),
      /body/,
    );
    assert.throws(() => s.remove("lurong-checkui", true), /Bundled/);
  }));
test("corrupt skills state preserved; cannot silently enable or overwrite", () =>
  temp(async (_s, d) => {
    const file = path.join(d, "skills-v1.json");
    fs.writeFileSync(file, "bad-json");
    const s = new SkillRegistry(d);
    assert.ok(s.loadError);
    assert.equal(s.agentContext([]), "");
    assert.throws(() => s.enable("lurong-agent", true, true), /Повреждён/);
    assert.throws(() => s.import(pack(), true), /Повреждён/);
    assert.equal(fs.readFileSync(file, "utf8"), "bad-json");
  }));
test("HTTP Skills auth, explicit enable, resource export and registry use do not mutate Studio", async () => {
  await withBridge({}, {}, async ({ bridge, url, api }) => {
    assert.equal((await api("/api/app-skills/catalog"))._status, 403);
    const { token } = await api("/api/app-mcp/access", {
      headers: { referer: url + "/app", "sec-fetch-site": "same-origin" },
    });
    const call = (p: string, body?: any) =>
      api("/api/app-skills/" + p, {
        headers: { "x-brickwire-app": token },
        ...(body === undefined ? {} : { body }),
      });
    assert.equal((await call("catalog")).skills.length, 11);
    const before = bridge.operations.list().length;
    const template = await call("template", { id: "ui-wooden_menu" });
    assert.match(template.source, /local Kit/);
    assert.equal(bridge.operations.list().length, before);
    assert.equal((await call("enable", { id: "lurong-agent", enabled: true }))._status, 403);
    await call("enable", { id: "lurong-agent", enabled: true, acknowledge: true });
    const disabled = await bridge.execute(
      { id: "disabled", tool: "skill_read", args: { id: "lurong-data" } },
      {},
    );
    assert.equal(disabled.status, "error");
    const read = await bridge.execute({ id: "active", tool: "skill_read", args: { id: "lurong-agent" } }, {});
    assert.equal(read.status, "success");
    const session = await bridge.startSession("fixture");
    assert.match(session.memorySummary, /lurong-agent/);
    await call("enable", { id: "lurong-agent", enabled: false });
    assert.doesNotMatch((await bridge.startSession("fixture2")).memorySummary, /USER-AUTHORIZED SKILLS/);
    assert.equal((await fetch(url + "/app-skills.js")).status, 200);
    assert.equal((await fetch(url + "/app-skills.css")).status, 200);
  });
});
test("Skills are readable offline and safe; activation never changes application permissions", async () => {
  await withBridge({ mcpCommand: null, mode: "safe" }, {}, async ({ bridge }) => {
    const before = bridge.settings.mode;
    bridge.skills.enable("strict-luau-math", true, true);
    assert.equal(bridge.settings.mode, before);
    const result = await bridge.execute(
      { id: "offline", tool: "skill_read", args: { id: "strict-luau-math" } },
      {},
    );
    assert.equal(result.status, "success");
    assert.ok(
      !bridge
        .listTools()
        .some(
          (t) => t.name === "get_reference" || t.name === "execute_blender_code" || t.name === "build_gui",
        ),
    );
  });
});

test('API-agent receives only enabled Skill metadata and reads guidance through registered readonly tool',async()=>{
 const http=await import('node:http');let turns=0,system='';const model=http.createServer((req,res)=>{let raw='';req.on('data',d=>raw+=d);req.on('end',()=>{turns++;system=JSON.parse(raw).messages[0].content;res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{message:{content:turns===1?'<ROBLOX_TOOL_CALL>{"id":"read-skill","tool":"skill_read","args":{"id":"strict-luau-math"}}</ROBLOX_TOOL_CALL>':'<ROBLOX_AGENT_DONE>{"summary":"Read enabled guidance and inspected Workspace"}</ROBLOX_AGENT_DONE>'}}]}));});});await new Promise<void>(r=>model.listen(0,'127.0.0.1',r));try{await withBridge({}, {BRICKWIRE_LLM_PROVIDER:'custom',BRICKWIRE_LLM_URL:`http://127.0.0.1:${(model.address() as any).port}/v1`,BRICKWIRE_LLM_MODEL:'fixture',BRICKWIRE_LLM_KEY:'local-fixture-only'},async({bridge,url,api})=>{bridge.skills.enable('strict-luau-math',true,true);const {token}=await api('/api/app-mcp/access',{headers:{referer:url+'/app','sec-fetch-site':'same-origin'}});const call=(p:string,body:any)=>api('/api/app-runtime/'+p,{body,headers:{'x-brickwire-app':token}});const t=(await call('tasks',{goal:'Inspect with approved guidance',mode:'plan',criteria:[{kind:'exists',path:'game.Workspace'}]})).task;await call(`tasks/${t.id}/start`,{});await call(`tasks/${t.id}/agent`,{});for(let i=0;i<100&&bridge.tasks.get(t.id).state==='RUNNING';i++)await new Promise(r=>setTimeout(r,20));assert.equal(bridge.tasks.get(t.id).state,'DONE');assert.ok(bridge.operations.list(t.id).some(o=>o.tool==='skill_read'&&o.result?.status==='success'));assert.match(system,/strict-luau-math: /);assert.doesNotMatch(system,/blender-roblox-import: /);assert.match(system,/NOT permission grants/);});}finally{await new Promise<void>(r=>model.close(()=>r()));}
});
