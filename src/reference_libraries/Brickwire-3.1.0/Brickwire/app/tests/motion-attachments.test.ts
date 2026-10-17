import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {AttachmentStore} from '../../bridge/src/bw3/attachments.js';
import {withBridge} from '../../tests/integration/helpers.js';
import {PluginHub} from '../../shared/src/plugin-hub.js';
const PNG='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'bw-attach-'));
test('attachment storage persists bytes, classifies text and images, bounds input, sanitizes names',()=>{
 const dir=temp();try{const s=new AttachmentStore(dir),a=s.put({name:'../reference.lua',data:Buffer.from('print("safe")').toString('base64')});assert.equal(a.kind,'text');assert.ok(!a.name.includes('/'));assert.equal(new AttachmentStore(dir).data(a.id).toString(),'print("safe")');assert.match(s.context([a.id]),/untrusted reference/);assert.throws(()=>s.put({name:'x.png',data:Buffer.from('not an image').toString('base64')}),/signature/);assert.throws(()=>s.get('../secret'),/Invalid/);assert.throws(()=>s.select([a.id,a.id]),/unique/);assert.throws(()=>s.put({data:'!@#'}),/base64/);const img=s.put({name:'one.png',data:PNG});assert.equal(img.mime,'image/png');assert.equal(s.images([img.id])[0].data,PNG);const svg=s.put({name:'code.svg',data:Buffer.from('<svg onload="alert(1)"/>').toString('base64')});assert.equal(svg.kind,'file');assert.equal(svg.mime,'application/octet-stream');assert.match(s.context([svg.id]),/NOT decoded/);s.remove(a.id);assert.throws(()=>s.get(a.id),/not found/);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('plugin hub carries actual binary files and frees payloads after delivery',()=>{const h=new PluginHub();const req=h.addRequest({text:'Attached reference',files:[{name:'x.pdf',data:Buffer.from('%PDF-test').toString('base64')}]});assert.equal(req.files?.length,1);assert.match(Buffer.from(req.files![0].data,'base64').toString(),/%PDF/);h.report(req.id,true);assert.equal(req.files?.length,0);assert.throws(()=>h.addRequest({text:'x',files:Array.from({length:7},()=>({data:PNG}))}),/6 files/);});
test('authenticated upload, byte-exact download, persisted message and direct multimodal model payload',async()=>{
 const captured:any[]=[];
 const model=http.createServer((req,res)=>{let raw='';req.on('data',c=>raw+=c);req.on('end',()=>{captured.push(JSON.parse(raw));res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'The attached image is a test reference.'}}]}));});});
 await new Promise<void>(r=>model.listen(0,'127.0.0.1',r));const addr=model.address() as any;
 try{await withBridge({mcpArgs:['/nonexistent'],mcpAuto:false},{BRICKWIRE_LLM_PROVIDER:'custom',BRICKWIRE_LLM_URL:`http://127.0.0.1:${addr.port}/v1`,BRICKWIRE_LLM_MODEL:'vision-fixture',BRICKWIRE_LLM_KEY:'test'},async({api,url,bridge})=>{
 const noAuth=await api('/api/bw3/attachments',{body:{name:'test.png',data:PNG}});assert.equal(noAuth._status,403);
 const token=(await api('/api/app-mcp/access',{headers:{referer:url+'/app','sec-fetch-site':'same-origin'}})).token;
 const headers={'X-Brickwire-App':token};const call=(p:string,body?:unknown)=>api(p,{headers,...(body?{body}:{})});
 const uploaded=await call('/api/bw3/attachments',{name:'test.png',data:PNG});assert.equal(uploaded._status,201);const a=uploaded.attachment;
 const download=await fetch(url+'/api/bw3/attachments/'+a.id,{headers});assert.equal(download.status,200);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.equal(Buffer.from(await download.arrayBuffer()).toString('base64'),PNG);
 const text=(await call('/api/bw3/attachments',{name:'reference.luau',data:Buffer.from('print("reference")').toString('base64')})).attachment;
 const c=(await call('/api/bw3/chats',{title:'test'})).conversation;
 const sent=await call(`/api/bw3/chats/${c.id}/send`,{text:'Describe this image and script',attachments:[a.id,text.id],settings:{autoSkills:false}});assert.equal(sent._status,202);
 for(let i=0;i<100&&!['done','failed'].includes(bridge.bw3.runs.get(sent.run.id).state);i++)await new Promise(r=>setTimeout(r,50));
 assert.equal(bridge.bw3.runs.get(sent.run.id).state,'done');assert.equal(sent.userMessage.attachments.length,2);
 const content=captured[0].messages.at(-1).content;assert.ok(Array.isArray(content));assert.equal(content.find((p:any)=>p.type==='image_url').image_url.url,'data:image/png;base64,'+PNG);assert.match(content[0].text,/print\("reference"\)/);
 assert.equal((await call('/api/bw3/attachments/'+a.id+'/delete',{}))._status,409);
 const history=(await call(`/api/bw3/chats/${c.id}`)).conversation;assert.equal(history.messages[0].attachments[0].id,a.id);
 assert.equal((await call(`/api/bw3/chats/${c.id}/send`,{text:'x',attachments:['att_'+'0'.repeat(24)]}))._status,404);
 await call(`/api/bw3/chats/${c.id}/delete`,{});assert.throws(()=>bridge.bw3.attachments.get(a.id),/not found/);
 });}finally{model.close();}
});
