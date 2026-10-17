import { chromium } from 'playwright';
import fs from 'node:fs';
const browser=await chromium.launch({executablePath:'/usr/local/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const errors=[],results=[];
const page=await browser.newPage({viewport:{width:1440,height:960}});
page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4317/app');await page.waitForTimeout(1500);
await page.screenshot({path:'/data/brickwire-home.png'});
for(const route of ['chats','autopilot','devtree','skills','library','lab','paint','mcp','history','settings']){
 await page.evaluate(tab=>location.hash=tab,route);await page.waitForTimeout(1000);
 const el=page.locator(`section#${route}`);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 results.push({route,visible:await el.isVisible(),horizontalOverflow:overflow,errors:await el.locator('.b3-err').allTextContents()});
 await page.screenshot({path:`/data/brickwire-${route}.png`});
}
await page.evaluate(()=>location.hash='chats');await page.waitForTimeout(600);
await page.locator('#b3-in').fill('Проверь приложенный скрипт');
await page.locator('#bw3-chats input[type=file]').setInputFiles({name:'reference.luau',mimeType:'text/plain',buffer:Buffer.from('print("Brickwire attachment QA")')});
await page.waitForFunction(()=>window.Brickwire3.Chat.files.ready()&&window.Brickwire3.Chat.files.ids().length===1);
results.push({attachmentChip:await page.locator('#bw3-chats .bw-attach-chip').count()});
await page.locator('.b3-send').click();await page.waitForFunction(()=>window.Brickwire3.Chat.conv?.messages.some(m=>m.role==='user'));await page.waitForTimeout(1400);
console.log('AFTER_SEND',await page.evaluate(()=>({rootConnected:window.Brickwire3.Chat.root.isConnected,conv:window.Brickwire3.Chat.conv?.id,messages:window.Brickwire3.Chat.conv?.messages?.length,n:document.querySelectorAll('.b3-msg.user').length,inner:window.Brickwire3.Chat.root.querySelector('.b3-msgs')?.innerHTML.slice(0,200),toast:document.querySelector('#toast').textContent})));
results.push({attachmentMessage:await page.locator('.b3-msg.user .bw-message-file').count(),messageText:await page.locator('.b3-msg.user').allTextContents()});
await page.screenshot({path:'/data/brickwire-chat-file.png'});
await page.reload();await page.waitForTimeout(1000);
results.push({attachmentAfterReload:await page.locator('.b3-msg.user .bw-message-file').count()});
await page.setViewportSize({width:390,height:844});
for(const route of ['home','chats','lab','paint','skills','mcp']){
 await page.evaluate(tab=>location.hash=tab,route);await page.waitForTimeout(900);await page.screenshot({path:`/data/brickwire-mobile-${route}.png`,fullPage:route==='home'});
 results.push({mobile:route,horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});
}
await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>location.hash='home');await page.waitForTimeout(500);
results.push({reducedMotion:await page.evaluate(()=>window.BrickwireMotion.isLowMotion())});
await page.screenshot({path:'/data/brickwire-reduced-motion.png'});
const noWebgl=await browser.newPage({viewport:{width:1200,height:900}});await noWebgl.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2')return null;return original.call(this,type,...args);};});await noWebgl.goto('http://127.0.0.1:4317/app');await noWebgl.waitForTimeout(1000);results.push({noWebglFallback:await noWebgl.locator('.bw-sculpture .bw-empty').isVisible()});await noWebgl.screenshot({path:'/data/brickwire-no-webgl.png'});await noWebgl.close();
fs.writeFileSync('/data/brickwire-motion-qa.json',JSON.stringify({errors,results},null,2));console.log(JSON.stringify({errors,results}));await browser.close();
