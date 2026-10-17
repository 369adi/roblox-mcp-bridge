/* Brickwire living workspace: deterministic geometry, section-specific atmosphere, real execution data. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let low;try{low=localStorage.getItem('bw-low-motion')==='true';}catch{low=false;}
  const noMotion=()=>low||reduced.matches;
  function navigate(tab){location.hash=tab;}
  const advanced=document.createElement('details');advanced.className='bw-secondary';advanced.innerHTML='<summary>Другие инструменты</summary>';
  const nav=$('nav'),primary=['home','chats','autopilot','devtree','skills','library','lab','paint','mcp','settings'];
  // Preserve the original navigation nodes and all their handlers.
  nav.querySelectorAll('a[data-tab]').forEach(a=>{if(!primary.includes(a.dataset.tab))advanced.append(a);});
  nav.insertBefore(advanced,nav.querySelector('.grow'));
  const secondaryLinks=Array.from(advanced.querySelectorAll('a[data-tab]'));
  function arrangeNav(){if(innerWidth<=900){secondaryLinks.forEach(a=>nav.insertBefore(a,advanced));advanced.style.display='none';}else{secondaryLinks.forEach(a=>advanced.append(a));advanced.style.display='';}}
  window.addEventListener('resize',arrangeNav);arrangeNav();
  nav.querySelector('[data-tab="home"]').lastChild.textContent='Workspace';
  nav.querySelector('[data-tab="chats"]').lastChild.textContent='Чаты';
  const bar=document.createElement('header');bar.className='bw-shellbar';bar.innerHTML='<span>Workspace</span><span class="bw-slash">/</span><strong class="bw-current-section">Обзор</strong><div class="bw-bar-actions"><button class="bw-motion-toggle" type="button" aria-pressed="false">Меньше движения</button><button class="bw-tochat" type="button">Открыть чат ↗</button></div>';$('main').prepend(bar);
  const langPicker=document.createElement('div');langPicker.className='bw-lang-picker';langPicker.innerHTML='<button type="button" data-lang="ru">RU</button><button type="button" data-lang="en">EN</button>';bar.querySelector('.bw-bar-actions').prepend(langPicker);
  langPicker.querySelectorAll('button').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.lang===window.BrickwireI18n.lang));b.onclick=()=>window.BrickwireI18n.set(b.dataset.lang);});
  $('.bw-tochat').onclick=()=>navigate('chats');
  const motionButton=$('.bw-motion-toggle');
  function applyMotion(){document.documentElement.classList.toggle('bw-low-motion',noMotion());motionButton.setAttribute('aria-pressed',String(low));motionButton.textContent=low?'Движение: минимум':reduced.matches?'Системный режим: минимум':'Меньше движения';window.dispatchEvent(new Event('bw-motion-change'));}
  motionButton.onclick=()=>{low=!low;try{localStorage.setItem('bw-low-motion',String(low));}catch{}applyMotion();};reduced.addEventListener('change',applyMotion);applyMotion();
  const atmosphere=document.createElement('div');atmosphere.className='bw-atmosphere';atmosphere.setAttribute('aria-hidden','true');atmosphere.innerHTML='<div class="bw-field"></div><canvas></canvas>';$('main').before(atmosphere);
  const cv=atmosphere.querySelector('canvas'),ctx=cv.getContext('2d');let scene='home',pointer={x:0,y:0},time=0,lastFrame=0;
  const sectionNames={home:'Обзор',chats:'Чаты',chat:'Чат плагина',autopilot:'Autopilot',devtree:'Development Tree',skills:'Skills',library:'Asset Library',lab:'3D & Animation Lab',paint:'Paint Studio',mcp:'Blender MCP & Studio',history:'История'};
  function route(){scene=location.hash.slice(1)||'home';if(advanced.querySelector(`[data-tab="${CSS.escape(scene)}"]`))advanced.open=true;$('.bw-current-section').textContent=sectionNames[scene]||nav.querySelector(`[data-tab="${CSS.escape(scene)}"]`)?.textContent||'Workspace';document.body.dataset.bwScene=scene;if(['home','chats','lab'].includes(scene))refreshHome();drawAtmosphere(time);schedule();}
  window.addEventListener('hashchange',route);
  // Clamp pointer response to small light displacement. No magnetic changes to input hit targets.
  $('main').addEventListener('pointermove',e=>{if(noMotion()||e.pointerType==='touch')return;pointer.x=(e.clientX/innerWidth-.5)*12;pointer.y=(e.clientY/innerHeight-.5)*8;},{passive:true});
  function resize(){const r=atmosphere.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,1.5);cv.width=Math.round(r.width*d);cv.height=Math.round(r.height*d);cv.style.width=r.width+'px';cv.style.height=r.height+'px';ctx?.setTransform(d,0,0,d,0,0);drawAtmosphere(time);}window.addEventListener('resize',resize);resize();
  function drawAtmosphere(t){
    if(!ctx)return;const w=cv.clientWidth,h=cv.clientHeight;ctx.clearRect(0,0,w,h);ctx.lineWidth=.7;
    const spatial=['lab','devtree','project','skills','library'].includes(scene),paint=scene==='paint';
    ctx.strokeStyle='rgba(181,197,112,.17)';
    if(spatial){const horizon=h*.38;for(let i=-10;i<=10;i++){ctx.beginPath();ctx.moveTo(w*.55+i*18,horizon);ctx.lineTo(w*.5+i*w*.14,h);ctx.stroke();}for(let j=1;j<14;j++){let y=horizon+Math.pow(j/14,2)*(h-horizon);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}}
    if(paint){for(let i=0;i<5;i++){ctx.strokeStyle=`rgba(180,192,106,${.06+i*.012})`;ctx.lineWidth=12-i*2;ctx.beginPath();ctx.moveTo(w*.1,h*(.2+i*.1));ctx.bezierCurveTo(w*.35,h*.9+Math.sin(t*.15+i)*25,w*.6,-20,w*.9,h*(.5+i*.07));ctx.stroke();}}
    else{ctx.lineWidth=.8;for(let i=0;i<6;i++){const x=w*(.32+i*.12)+Math.sin(t*.09+i)*12+pointer.x,y=h*(.12+(i%3)*.16)+pointer.y,sz=25+(i%3)*12;ctx.strokeStyle='rgba(203,215,161,.16)';ctx.beginPath();ctx.moveTo(x,y-sz);ctx.lineTo(x+sz,y);ctx.lineTo(x,y+sz);ctx.lineTo(x-sz,y);ctx.closePath();ctx.stroke();if(scene==='devtree'||scene==='skills'||scene==='autopilot'){ctx.beginPath();ctx.moveTo(x+sz,y);ctx.lineTo(x+sz+30,y);ctx.lineTo(x+sz+30,y+90);ctx.stroke();}}}
    ctx.fillStyle='rgba(200,213,150,.035)';ctx.font=`600 ${Math.min(w*.16,190)}px 'BW Display',sans-serif`;ctx.fillText(scene==='paint'?'MAKE MARKS.':scene==='skills'?'MODULAR.':scene==='lab'?'IN SPACE.':'BRICKWIRE.',w*.2,h*.88);
  }
  let raf=0;
  function schedule(){if(!raf&&!document.hidden&&!noMotion())raf=requestAnimationFrame(frame);}
  function frame(ts){raf=0;if(document.hidden||noMotion())return;if(ts-lastFrame>=1000/24){time=ts/1000;lastFrame=ts;drawAtmosphere(time);}schedule();}
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0;}else schedule();});window.addEventListener('bw-motion-change',()=>{if(noMotion()){cancelAnimationFrame(raf);raf=0;drawAtmosphere(0);}else schedule();});
  // Signature landing lives inside the actual overview. Existing stats/onboarding remain connected.
  const home=$('#home');const oldIntro=Array.from(home.children).slice(0,3);oldIntro.forEach(el=>el.remove());
  const onboarding=document.createElement('details');onboarding.className='bw-onboarding';onboarding.innerHTML='<summary>Как подключить Studio и начать работу</summary>';
  const steps=home.querySelector('.steps'),heading=home.querySelector('h2');if(steps)onboarding.append(steps);heading?.remove();home.append(onboarding);
  const layout=document.createElement('div');layout.className='bw-home-layout';layout.innerHTML=`<div class="bw-home-primary"><div class="bw-hero"><div class="bw-hero-copy"><div class="bw-kicker">YOUR NEXT WORLD STARTS HERE</div><h1><span><i>BUILD WORLDS.</i></span><span><i>BREAK LIMITS.</i></span></h1><p>Создавай, строй и выпускай Roblox-игры с AI. От первой идеи до целого мира.</p></div><div class="bw-sculpture"><canvas aria-label="Живая 3D-композиция Brickwire"></canvas><span class="bw-object-label">BRICK / 001 · PROCEDURAL</span></div></div><form class="bw-home-composer"><h2>Что хочешь построить?</h2><textarea class="bw-home-prompt" aria-label="Запрос для AI" placeholder="Опиши игру или прикрепи свой референс…" rows="2"></textarea><div class="bw-home-input-row"><span>Фото, код, референсы — начинаем здесь.</span><button class="primary" type="submit">Начать в чате ↗</button></div></form><div class="bw-section-label"><h2>Недавние проекты и ассеты</h2><button class="quiet bw-open-library" type="button">В библиотеку ↗</button></div><div class="bw-recent-list"></div></div><aside class="bw-live"><div><div class="bw-kicker">LIVE WORKSPACE</div><h2 class="bw-live-title">Готов к новой идее</h2></div><div class="bw-live-content">Здесь появятся реальные шаги агента, когда ты запустишь задачу.</div><div class="bw-live-preview"><p>Никакого вымышленного прогресса.<br>Только реальные события выполнения.</p></div><button type="button" class="primary bw-open-workspace">Открыть workspace ↗</button></aside>`;
  home.prepend(layout);$('.bw-open-library').onclick=()=>navigate('library');$('.bw-open-workspace').onclick=()=>navigate('chats');
  const homeComposer=$('.bw-home-composer'),homeFiles=window.BrickwireAttachments.mount(homeComposer);
  // Attach controls after the textarea, before send row, for a clear reading order.
  homeComposer.querySelector('textarea').after(homeComposer.querySelector('.bw-attachments'));
  homeComposer.onsubmit=async e=>{e.preventDefault();const text=$('.bw-home-prompt').value.trim();if(!homeFiles.ready()||(!text&&!homeFiles.ids().length)){$('.bw-home-prompt').focus();return;}const button=homeComposer.querySelector('button[type=submit]');button.disabled=true;try{navigate('chats');await window.Brickwire3.chats();const chat=window.Brickwire3.Chat;if(!chat.root||!chat.files)throw Error('Чат не загрузился');if(chat.conv?.messages.length){const d=await window.BrickwireAttachments.api('/api/bw3/chats',{title:text.slice(0,60)||'Новый чат'});await chat.open(d.conversation.id);}chat.files.set(homeFiles.take());chat.root.querySelector('#b3-in').value=text;$('.bw-home-prompt').value='';await chat.send();}catch(err){console.error(err);const toast=$('#toast');toast.textContent=err.message;toast.className='toast bad';}finally{button.disabled=false;}};
  $('.bw-home-prompt').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();homeComposer.requestSubmit();}};
  // Legacy browser composer uses the same widget, mounted once, not per send.
  browserFiles=window.BrickwireAttachments.mount($('#browser-chat .composer'));
  let refreshBusy=false,readyData=null;
  async function refreshHome(){if(refreshBusy||document.hidden)return;refreshBusy=true;try{
    const [state,artData]=await Promise.all([window.BrickwireAttachments.api('/api/bw3/state'),window.BrickwireAttachments.api('/api/bw3/artifacts')]);readyData=state;
    const artifacts=(artData.artifacts||[]).slice(0,2),recents=$('.bw-recent-list');
    if(!artifacts.length){recents.innerHTML='<div class="bw-empty"><b>Твой первый мир начинается с идеи.</b><br>Здесь появятся настоящие превью созданных ассетов и последние чаты.<button class="bw-first-project" type="button">Создать первый проект ↗</button></div>';recents.querySelector('button').onclick=()=>$('.bw-home-prompt').focus();}
    else if(recents.dataset.ids!==artifacts.map(a=>a.id).join(',')){recents.dataset.ids=artifacts.map(a=>a.id).join(',');recents.innerHTML=artifacts.map(a=>`<article class="bw-project"><div class="bw-project-preview"><img alt="${esc(a.name)} — превью реального OBJ"></div><div class="bw-project-meta"><b>${esc(a.name)}</b><button type="button" data-id="${a.id}">Открыть ↗</button></div></article>`).join('');recents.querySelectorAll('article').forEach((el,i)=>{image(el.querySelector('img'),artifacts[i].id);el.querySelector('button').onclick=async()=>{navigate('chats');await window.Brickwire3.chats();if(artifacts[i].conversationId)await window.Brickwire3.Chat.open(artifacts[i].conversationId);else navigate('library');};});}
    if(!artifacts.length&&state.conversations?.length){recents.innerHTML=state.conversations.slice(0,2).map(c=>`<article class="bw-project"><div class="bw-project-meta"><b>${esc(c.title)}</b><button type="button" data-conv="${c.id}">Продолжить ↗</button></div></article>`).join('');recents.querySelectorAll('button').forEach(b=>b.onclick=async()=>{navigate('chats');await window.Brickwire3.chats();await window.Brickwire3.Chat.open(b.dataset.conv);});}
    const live=state.active?.[0];$('.bw-live-title').textContent=live?.goal?.slice(0,65)||'Готов к новой идее';
    $('.bw-live-content').innerHTML=live?`<div class="bw-live-step running"><i></i><span>${esc(live.stage)} · ${esc(live.state)}</span></div>`+(live.plan||[]).slice(0,4).map(p=>`<div class="bw-live-step ${esc(p.state)}"><i></i><span>${esc(p.title)}</span></div>`).join(''):`<div class="bw-live-step"><i></i><span>${state.studio.ready?'Studio подключён':'Подключи Roblox Studio'}</span></div><div class="bw-live-step"><i></i><span>${state.llm.configured?'LLM: '+esc(state.llm.model):state.browser.live?'AI-чат подключён':'Настрой LLM или открой AI-чат'}</span></div><div class="bw-live-step"><i></i><span>Нет активных задач</span></div>`;
    $('.bw-open-workspace').onclick=async()=>{navigate('chats');await window.Brickwire3.chats();if(live?.conversationId)await window.Brickwire3.Chat.open(live.conversationId);};
    if(artifacts[0]&&$('.bw-live-preview').dataset.id!==artifacts[0].id){const pr=$('.bw-live-preview');pr.dataset.id=artifacts[0].id;pr.innerHTML='<img alt="Последний реальный ассет"><p>PREVIEW / GENERATED ASSET</p>';image(pr.querySelector('img'),artifacts[0].id);}
    // Motion intensity reflects genuine API state, never a simulated percentage.
    let active=!!live;if(scene==='autopilot'){const runtime=await window.BrickwireAttachments.api('/api/app-runtime/state');active=active||(runtime.tasks||[]).some(t=>t.state==='RUNNING');}document.body.classList.toggle('bw-agent-active',active);
  }catch(e){$('.bw-live-content').textContent='Локальный мост недоступен. Проверь подключение.';}finally{refreshBusy=false;}}
  async function image(img,id){try{const b=await window.BrickwireAttachments.api(`/api/bw3/artifacts/${id}/file/thumb.png`);if(!img.isConnected)return;const u=URL.createObjectURL(b);img.onload=()=>URL.revokeObjectURL(u);img.src=u;}catch{img.alt='Превью пока недоступно';}}
  setInterval(()=>{if(scene==='home'||scene==='autopilot')refreshHome();},6000);
  // Native WebGL sculpture: actual cube / torus triangle geometry, not a flat image.
  function sculpture(canvas){
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
    if(!gl){canvas.remove();const f=document.createElement('div');f.className='bw-empty';f.textContent='BRICKWIRE / Пространство идей. 3D-эффекты недоступны на этом устройстве.';$('.bw-sculpture').prepend(f);return;}
    const vs=`attribute vec3 p;attribute vec3 n;attribute vec3 c;uniform vec2 angle;uniform float aspect;varying vec3 normal;varying vec3 color;varying vec3 position;void main(){float a=angle.x,b=angle.y;mat3 ry=mat3(cos(a),0.,-sin(a),0.,1.,0.,sin(a),0.,cos(a));mat3 rx=mat3(1.,0.,0.,0.,cos(b),sin(b),0.,-sin(b),cos(b));vec3 q=rx*ry*p;normal=rx*ry*n;color=c;position=q;float z=5.7-q.z;gl_Position=vec4(q.x*2.7/aspect,q.y*2.7,(z-3.)*.35,z);}`;
    const fs=`precision mediump float;varying vec3 normal;varying vec3 color;varying vec3 position;void main(){vec3 N=normalize(normal);float d=max(0.,dot(N,normalize(vec3(-.7,1.,1.))));float rim=pow(1.-abs(N.z),3.);float spec=pow(max(0.,dot(reflect(-normalize(vec3(-.7,1.,1.)),N),vec3(0.,0.,1.))),32.);vec3 col=color*(.32+.78*d)+vec3(.15,.18,.07)*rim+spec*.32;gl_FragColor=vec4(col,1.);}`;
    function shader(type,src){const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
    const program=gl.createProgram();try{gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('WebGL link failed');}catch{gl.getExtension('WEBGL_lose_context')?.loseContext();return;}
    const vertices=[],normals=[],colors=[];
    function tri(a,b,c,col){const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;for(const p of [a,b,c]){vertices.push(...p);normals.push(...n.map(x=>x/len));colors.push(...col);}}
    const faces=[[0,3,2,1],[4,5,6,7],[0,1,5,4],[3,7,6,2],[0,4,7,3],[1,2,6,5]];
    function cube(x,y,z,size,col){const h=size/2,P=[[-h,-h,-h],[h,-h,-h],[h,h,-h],[-h,h,-h],[-h,-h,h],[h,-h,h],[h,h,h],[-h,h,h]].map(p=>[p[0]+x,p[1]+y,p[2]+z]);for(const f of faces){tri(P[f[0]],P[f[1]],P[f[2]],col);tri(P[f[0]],P[f[2]],P[f[3]],col);}}
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){if(Math.abs(x)+Math.abs(y)+Math.abs(z)===3||(!x&&!y&&!z))continue;const accent=x===1&&y===-1&&z===0;cube(x*.65,y*.65,z*.65,.52,accent?[.83,.94,.27]:[.78,.80,.76]);}
    // Sculpted orbital ring tilted against the cube structure.
    function torus(u,v){const r=1.57+.046*Math.cos(v),x=r*Math.cos(u),y=.046*Math.sin(v),z=r*Math.sin(u),a=.55;return [x,Math.cos(a)*y-Math.sin(a)*z,Math.sin(a)*y+Math.cos(a)*z];}
    for(let i=0;i<100;i++)for(let j=0;j<8;j++){const u=i/100*Math.PI*2,v=j/8*Math.PI*2,du=Math.PI*2/100,dv=Math.PI*2/8,col=[.88,.91,.82];tri(torus(u,v),torus(u+du,v),torus(u+du,v+dv),col);tri(torus(u,v),torus(u+du,v+dv),torus(u,v+dv),col);}
    gl.useProgram(program);for(const [name,data] of [['p',vertices],['n',normals],['c',colors]]){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,0,0);}
    const angles=gl.getUniformLocation(program,'angle'),aspect=gl.getUniformLocation(program,'aspect');let yaw=-.6,pitch=.38,drag=null,anim=0,last=0,visible=true,lost=false;
    function draw(t=0){if(lost)return;const w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const d=Math.min(devicePixelRatio||1,1.5);if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);}gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.uniform2f(angles,yaw+(noMotion()?0:Math.sin(t*.15)*.15),pitch);gl.uniform1f(aspect,w/h);gl.drawArrays(gl.TRIANGLES,0,vertices.length/3);}
    function start(){if(!anim&&visible&&!document.hidden&&!noMotion()&&!lost)anim=requestAnimationFrame(loop);else if(noMotion())draw();}
    function stop(){cancelAnimationFrame(anim);anim=0;}
    function loop(t){anim=0;if(!visible||document.hidden||noMotion()||lost)return;if(t-last>1000/30){draw(t/1000);last=t;}start();}
    new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){draw();start();}else stop();}).observe(canvas);
    new ResizeObserver(()=>draw()).observe(canvas);
    canvas.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')return;drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.007;pitch=Math.max(-1,Math.min(1,pitch+(e.clientY-drag[1])*.007));drag=[e.clientX,e.clientY];draw();});canvas.addEventListener('pointerup',()=>drag=null);
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;stop();});canvas.addEventListener('webglcontextrestored',()=>location.reload());
    document.addEventListener('visibilitychange',()=>document.hidden?stop():start());window.addEventListener('bw-motion-change',()=>{stop();draw();start();});draw();start();
  }
  sculpture($('.bw-sculpture canvas'));route();
  window.BrickwireMotion={refresh:refreshHome,isLowMotion:noMotion,version:'3.1-motion'};
})();
