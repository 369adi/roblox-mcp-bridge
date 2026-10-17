import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { AppMcpManager, redact } from '../../bridge/src/app-mcp.js';
import { Logger } from '../../bridge/src/logger.js';
import { withBridge } from '../../tests/integration/helpers.js';
const fixture=path.join(path.dirname(fileURLToPath(import.meta.url)),'mcp-fixture.mjs');
const input=(over={})=>({name:'Test server',description:'Local test fixture — not Studio',transport:'stdio',command:process.execPath,args:[fixture],envRefs:{},authorize:true,...over});
async function setup(fn:(m:AppMcpManager,dir:string)=>Promise<void>){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bw-app-mcp-'));const m=new AppMcpManager(dir,new Logger(null,'error',true),'test');try{await fn(m,dir)}finally{await m.stop();fs.rmSync(dir,{recursive:true,force:true})}}
test('MCP add requires authorization; unsupported transport rejected; no automatic launch',()=>setup(async(m,dir)=>{
 assert.throws(()=>m.add(input({authorize:false})),/Подтвердите/);
 assert.throws(()=>m.add(input({transport:'http'})),/stdio/);
 const id=m.add(input());assert.equal(m.list()[0].status,'disconnected');assert.equal(m.descriptors().length,0);
 assert.equal(new AppMcpManager(dir,new Logger(null,'error',true),'t').list()[0].status,'disconnected');
 await m.remove(id,true);assert.equal(m.list().length,0);
}));
test('MCP actual stdio handshake, tools/resources/prompts discovery, explicit access and result',()=>setup(async m=>{
 const id=m.add(input());await m.connect(id);let s=m.list()[0];assert.equal(s.status,'ready');assert.equal(s.tools.length,6);assert.equal(s.resources.length,1);assert.equal(s.prompts.length,1);assert.equal(m.descriptors().length,0);
 assert.throws(()=>m.manualDescriptor(id,'echo'),/Разрешение/);
 m.permissions(id,{tool:'echo',mode:'read',agent:false});const d=m.manualDescriptor(id,'echo');assert.equal(m.descriptors().length,0);
 await assert.rejects(m.invoke(d.name,{text:4},false),/string/);
 assert.equal((await m.invoke(d.name,{text:'hello'},false)).text,'hello');
 await assert.rejects(m.invoke(d.name,{text:'x'},true),/permission/);
 m.permissions(id,{tool:'echo',mode:'read',agent:true});assert.equal(m.descriptors().length,1);
 await assert.rejects(m.read(id,'resource',{uri:'test://readme'}),/разрешено/);
 m.permissions(id,{resourcesAllowed:true,promptsAllowed:true});assert.equal((await m.read(id,'resource',{uri:'test://readme'})).result.contents[0].text,'resource body');
 assert.equal((await m.read(id,'prompt',{name:'example',args:{}})).untrusted,true);
 await assert.rejects(m.read(id,'resource',{uri:'file:///private'}),/обнаруженный/);
 await m.disconnect(id);assert.equal(m.descriptors().length,0);await assert.rejects(m.invoke(d.name,{text:'x'},false),/permission/);
 await m.enable(id,false);assert.equal(m.list()[0].status,'disabled');await assert.rejects(m.connect(id),/отключён/);
 await m.enable(id,true);await m.connect(id);assert.equal(m.list()[0].status,'ready');
}));
test('MCP edited configuration revokes permissions; changed schemas revoke access',()=>setup(async m=>{
 const id=m.add(input());await m.connect(id);m.permissions(id,{tool:'echo',mode:'read',agent:true});assert.equal(m.descriptors().length,1);
 m.permissions(id,{tool:'schema_change',mode:'confirm',agent:false});await m.invoke(m.manualDescriptor(id,'schema_change').name,{},false);await m.refresh(id);
 assert.equal(m.descriptors().length,0);assert.equal(m.list()[0].tools.find(t=>t.name==='echo').changedSchema,true);
 await m.edit(id,input({name:'Renamed'}));assert.equal(m.list()[0].status,'stopped');await m.connect(id);assert.equal(m.descriptors().length,0);
}));
test('MCP minimal environment and credential redaction',()=>setup(async(m,dir)=>{
 process.env.UNRELATED_SECRET='must-not-leak';process.env.MY_TEST_SECRET='test-secret-value';
 try{const id=m.add(input({envRefs:{API_KEY:'MY_TEST_SECRET'}}));await m.connect(id);m.permissions(id,{tool:'inspect_environment',mode:'read',agent:false});const r=await m.invoke(m.manualDescriptor(id,'inspect_environment').name,{},false);
 assert.doesNotMatch(JSON.stringify(r),/test-secret-value|must-not-leak/);assert.match(r.text,/REDACTED/);
 assert.doesNotMatch(fs.readFileSync(path.join(dir,'app-mcp.json'),'utf8'),/test-secret-value/);
 assert.equal(redact({password:'x'}).password,'[REDACTED]');
 }finally{delete process.env.UNRELATED_SECRET;delete process.env.MY_TEST_SECRET}
}));
test('MCP malformed/missing command reports real connection failure',()=>setup(async m=>{
 const id=m.add(input({command:'/nonexistent/brickwire-mcp'}));await assert.rejects(m.connect(id),/MCP/);assert.equal(m.list()[0].status,'error');assert.ok(m.list()[0].error);
}));
test('MCP app-only HTTP authorization, registry integration, manual invocation and forced confirmation',async()=>{
 await withBridge({mode:'full'}, {}, async({bridge,url,api})=>{
  assert.equal((await api('/api/app-mcp/servers'))._status,403);
  assert.equal((await api('/api/app-mcp/access'))._status,403);
  const access=await api('/api/app-mcp/access',{headers:{referer:url+'/mcp','sec-fetch-site':'same-origin'}});assert.ok(access.token);
  const headers={'x-brickwire-app':access.token};const call=(p:string,body?:any)=>api(p,{headers,...(body===undefined?{}:{body})});
  const added=await call('/api/app-mcp/servers',input());const base=`/api/app-mcp/servers/${added.id}`;
  assert.equal((await call(base+'/connect',{}))._status,200);
  await call(base+'/permissions',{tool:'echo',mode:'read',agent:true});const d=(await call('/api/app-mcp/servers')).servers[0].tools.find((t:any)=>t.name==='echo');
  assert.ok(bridge.listTools().some(t=>t.name===d.registryName));
  const result=await bridge.execute({id:'agent',tool:d.registryName,args:{text:'real fixture result'}},{provider:'test'});assert.equal(result.status,'success');
  await call(base+'/permissions',{tool:'write_note',mode:'confirm',agent:false});
  const pending=await call(base+'/invoke',{tool:'write_note',args:{text:'confirmed fixture result'}});assert.equal(pending.state,'pending_approval','full mode must not bypass new-server gate');
  const approved=await api('/api/approvals/'+pending.approvalId,{body:{approve:true}});assert.equal(approved.ok,true);
  const done=await api('/api/calls/'+pending.callId+'?wait=1000');assert.equal(done.result.status,'success');
  const hist=bridge.history.query({limit:100});assert.ok(hist.some(h=>h.provider==='app-mcp'&&h.status==='success'));
  const manual=(await call('/api/app-mcp/servers')).servers[0].tools.find((t:any)=>t.name==='write_note');assert.equal((await bridge.execute({id:'deny',tool:manual.registryName,args:{text:'x'}},{provider:'test'})).status,'denied');
  bridge.settings.mode='safe';const blocked=await call(base+'/invoke',{tool:'write_note',args:{text:'x'}});assert.equal(blocked.result.status,'denied');
  assert.equal((await fetch(url+'/mcp')).status,200);assert.equal((await fetch(url+'/app-mcp.js')).status,200);
  await call(base+'/remove',{confirm:true});
 });
});

test('MCP corrupt configuration is preserved and cannot be silently overwritten',()=>setup(async(_m,dir)=>{
 const file=path.join(dir,'app-mcp.json');fs.writeFileSync(file,'broken-json');
 const other=new AppMcpManager(dir,new Logger(null,'error',true),'t');assert.ok(other.loadError);
 assert.throws(()=>other.add(input()),/повреждена/);assert.equal(fs.readFileSync(file,'utf8'),'broken-json');
}));
test('MCP tool errors remain errors and unsafe read grants are rejected',()=>setup(async m=>{
 const id=m.add(input());await m.connect(id);
 assert.throws(()=>m.permissions(id,{tool:'write_note',mode:'read',agent:true}),/Read-only/);
 m.permissions(id,{tool:'fail',mode:'confirm',agent:false});
 await assert.rejects(m.invoke(m.manualDescriptor(id,'fail').name,{},false),/fixture failure/);
 m.permissions(id,{tool:'echo',mode:'read',agent:true});const descriptor=m.manualDescriptor(id,'echo');
 m.permissions(id,{tool:'echo',mode:'off',agent:false});await assert.rejects(m.invoke(descriptor.name,{text:'must not execute'},false),/permission denied/);
}));
