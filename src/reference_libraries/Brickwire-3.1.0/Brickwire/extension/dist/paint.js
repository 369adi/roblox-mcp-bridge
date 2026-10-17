
// M5: layered paint. 20 tools; every tool action is one undo step (snapshot of the affected layer).
const $=s=>document.querySelector(s);let W=1920,H=1080,layers=[],cur=0,tool="brush",undoS=[],redoS=[],scale=1;
const TOOLS=[["brush","Кисть"],["pencil","Карандаш"],["marker","Маркер"],["spray","Спрей"],["eraser","Ластик"],["fill","Заливка"],["picker","Пипетка"],["line","Линия"],["arrow","Стрелка"],["rect","Прямоуг."],["rectf","Прямоуг. ⬛"],["ellipse","Эллипс"],["ellipsef","Эллипс ⬤"],["star","Звезда"],["text","Текст"],["outline","Текст+обв."],["gradient","Градиент"],["blur","Размытие"],["glow","Свечение"],["move","Сдвиг слоя"]];
const tbox=$("#tools");for(const[id,l]of TOOLS){const b=document.createElement("button");b.textContent=l;b.dataset.t=id;b.onclick=()=>{tool=id;syncTools()};tbox.appendChild(b)}
function syncTools(){tbox.querySelectorAll("button").forEach(b=>b.classList.toggle("on",b.dataset.t===tool))}
const view=$("#view"),overlay=document.createElement("canvas");
function log(t){const l=$("#log");l.style.display="block";l.textContent=t;clearTimeout(log.t);log.t=setTimeout(()=>l.style.display="none",6000)}
function mk(){const c=document.createElement("canvas");c.width=W;c.height=H;return c}
function fit(){const wrap=$("#wrap");scale=Math.max(.01,Math.min(Math.max(1,wrap.clientWidth-24)/W,Math.max(1,wrap.clientHeight-24)/H,1));view.style.width=W*scale+"px";view.style.height=H*scale+"px";for(const c of[...layers.map(l=>l.c),overlay]){c.style.width=W*scale+"px";c.style.height=H*scale+"px"}}
function relayout(){view.innerHTML="";layers.forEach(l=>{l.c.style.display=l.visible?"":"none";view.appendChild(l.c)});overlay.width=W;overlay.height=H;view.appendChild(overlay);fit();renderLayers()}
function newDoc(){[W,H]=$("#size").value.split("x").map(Number);layers=[];undoS=[];redoS=[];addLayer("Фон","#1b1e24");cur=0;relayout()}
function addLayer(name,fill){const c=mk();if(fill){const x=c.getContext("2d");x.fillStyle=fill;x.fillRect(0,0,W,H)}layers.splice(cur+1,0,{name:name||("Слой "+(layers.length+1)),c,visible:true});cur=Math.min(cur+1,layers.length-1);if(layers.length===1)cur=0;pushStruct();relayout()}
function delLayer(){if(layers.length<2)return;pushStruct();layers.splice(cur,1);cur=Math.max(0,cur-1);relayout()}
function moveLayer(d){const j=cur+d;if(j<0||j>=layers.length)return;pushStruct();[layers[cur],layers[j]]=[layers[j],layers[cur]];cur=j;relayout()}
function mergeDown(){if(cur<1)return;pushStruct();layers[cur-1].c.getContext("2d").drawImage(layers[cur].c,0,0);layers.splice(cur,1);cur--;relayout()}
function renderLayers(){const L=$("#layers");L.innerHTML="";[...layers].map((l,i)=>[l,i]).reverse().forEach(([l,i])=>{const d=document.createElement("div");d.className="layer"+(i===cur?" sel":"");
 d.innerHTML=`<input type=checkbox ${l.visible?"checked":""}><span>${l.name}</span>`;d.querySelector("input").onclick=e=>{e.stopPropagation();l.visible=e.target.checked;relayout()};d.onclick=()=>{cur=i;renderLayers()};L.appendChild(d)})}
// undo: pixel snapshots for drawing, structure snapshots for layer ops
function snapLayers(){return layers.map(l=>{const c=mk();c.getContext("2d").drawImage(l.c,0,0);return{name:l.name,c,visible:l.visible}})}
function pushStruct(){if(!layers.length)return;undoS.push({type:"struct",layers:snapLayers(),cur});if(undoS.length>40)undoS.shift();redoS=[]}
function pushPixels(){const l=layers[cur];undoS.push({type:"px",layer:l,data:l.c.getContext("2d").getImageData(0,0,W,H)});if(undoS.length>40)undoS.shift();redoS=[]}
function applyState(s,stackTo){if(s.type==="px"){const x=s.layer.c.getContext("2d");stackTo.push({type:"px",layer:s.layer,data:x.getImageData(0,0,W,H)});x.putImageData(s.data,0,0)}else{stackTo.push({type:"struct",layers:snapLayers(),cur});layers=s.layers;cur=Math.min(s.cur,layers.length-1);relayout()}}
function undo(){const s=undoS.pop();if(s)applyState(s,redoS)}function redo(){const s=redoS.pop();if(s)applyState(s,undoS)}
addEventListener("keydown",e=>{if(e.target.tagName==="INPUT")return;if(e.ctrlKey&&e.key==="z"){e.preventDefault();e.shiftKey?redo():undo()}if(e.ctrlKey&&e.key==="y"){e.preventDefault();redo()}});
const ctx=()=>layers[cur].c.getContext("2d"),col=()=>$("#color").value,col2=()=>$("#color2").value,bs=()=>+$("#bsize").value,al=()=>+$("#alpha").value/100;
function pos(e){const r=overlay.getBoundingClientRect();return[(e.clientX-r.left)/scale,(e.clientY-r.top)/scale]}
function hex(h){const n=parseInt(h.slice(1),16);return[n>>16&255,n>>8&255,n&255]}
function flood(x,y){const c=ctx(),img=c.getImageData(0,0,W,H),d=img.data,i0=((y|0)*W+(x|0))*4,t=[d[i0],d[i0+1],d[i0+2],d[i0+3]],[r,g,b]=hex(col()),a=Math.round(al()*255);
 if(t[0]===r&&t[1]===g&&t[2]===b&&t[3]===a)return;const st=[[x|0,y|0]],m=(i)=>Math.abs(d[i]-t[0])+Math.abs(d[i+1]-t[1])+Math.abs(d[i+2]-t[2])+Math.abs(d[i+3]-t[3])<=32;
 while(st.length){const[px,py]=st.pop();if(px<0||py<0||px>=W||py>=H)continue;const i=(py*W+px)*4;if(!m(i))continue;d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=a;st.push([px+1,py],[px-1,py],[px,py+1],[px,py-1])}c.putImageData(img,0,0)}
function shape(c,t,x0,y0,x1,y1){c.save();c.globalAlpha=al();c.strokeStyle=col();c.fillStyle=col();c.lineWidth=bs();c.lineCap="round";c.lineJoin="round";
 if(t==="line"||t==="arrow"){c.beginPath();c.moveTo(x0,y0);c.lineTo(x1,y1);c.stroke();if(t==="arrow"){const a=Math.atan2(y1-y0,x1-x0),h=bs()*3;c.beginPath();c.moveTo(x1,y1);c.lineTo(x1-h*Math.cos(a-0.5),y1-h*Math.sin(a-0.5));c.lineTo(x1-h*Math.cos(a+0.5),y1-h*Math.sin(a+0.5));c.closePath();c.fill()}}
 else if(t==="rect"||t==="rectf"){t==="rect"?c.strokeRect(x0,y0,x1-x0,y1-y0):c.fillRect(x0,y0,x1-x0,y1-y0)}
 else if(t==="ellipse"||t==="ellipsef"){c.beginPath();c.ellipse((x0+x1)/2,(y0+y1)/2,Math.abs(x1-x0)/2,Math.abs(y1-y0)/2,0,0,7);t==="ellipse"?c.stroke():c.fill()}
 else if(t==="star"){const cx=x0,cy=y0,R=Math.hypot(x1-x0,y1-y0);c.beginPath();for(let i=0;i<10;i++){const r=i%2?R*0.45:R,a=-Math.PI/2+i*Math.PI/5;c.lineTo(cx+r*Math.cos(a),cy+r*Math.sin(a))}c.closePath();c.fill();c.strokeStyle=col2();c.lineWidth=Math.max(2,bs()/3);c.stroke()}
 else if(t==="gradient"){const g=c.createLinearGradient(x0,y0,x1,y1);g.addColorStop(0,col());g.addColorStop(1,col2());c.fillStyle=g;c.fillRect(0,0,W,H)}
 c.restore()}
let down=null,last=null,moveSnap=null;
overlay.onpointerdown=e=>{const[x,y]=pos(e);if(!layers[cur].visible){log("Слой скрыт");return}
 if(tool==="picker"){const p=ctx().getImageData(x|0,y|0,1,1).data;$("#color").value="#"+[p[0],p[1],p[2]].map(v=>v.toString(16).padStart(2,"0")).join("");return}
 pushPixels();
 if(tool==="fill"){flood(x,y);return}
 if(tool==="text"||tool==="outline"){const c=ctx(),fs=bs()*4;c.save();c.globalAlpha=al();c.font=`900 ${fs}px "Fredoka One","Luckiest Guy","Arial Black",sans-serif`;c.textBaseline="middle";c.textAlign="center";
  if(tool==="outline"){c.lineJoin="round";c.lineWidth=Math.max(4,fs*0.2);c.strokeStyle=col2();c.strokeText($("#txt").value,x,y)}c.fillStyle=col();c.fillText($("#txt").value,x,y);c.restore();return}
 if(tool==="move"){moveSnap=mk();moveSnap.getContext("2d").drawImage(layers[cur].c,0,0)}
 down=[x,y];last=[x,y];overlay.setPointerCapture(e.pointerId);stroke(x,y)};
function stroke(x,y){const c=ctx();c.save();c.lineCap="round";c.lineJoin="round";c.globalAlpha=al();
 if(["brush","pencil","marker","eraser"].includes(tool)){c.globalCompositeOperation=tool==="eraser"?"destination-out":"source-over";c.strokeStyle=col();c.lineWidth=tool==="pencil"?Math.max(1,bs()/4):bs();if(tool==="marker"){c.globalAlpha=al()*0.35;c.lineCap="square"}
  c.beginPath();c.moveTo(last[0],last[1]);c.lineTo(x,y);c.stroke()}
 else if(tool==="spray"){c.fillStyle=col();for(let i=0;i<30;i++){const a=Math.random()*7,r=Math.random()*bs();c.fillRect(x+r*Math.cos(a),y+r*Math.sin(a),1.5,1.5)}}
 else if(tool==="blur"||tool==="glow"){const r=bs(),sx=Math.max(0,x-r|0),sy=Math.max(0,y-r|0),w=Math.min(W-sx,r*2),h=Math.min(H-sy,r*2);if(w>0&&h>0){const tmp=document.createElement("canvas");tmp.width=w;tmp.height=h;tmp.getContext("2d").drawImage(layers[cur].c,sx,sy,w,h,0,0,w,h);
  c.filter=tool==="blur"?`blur(${Math.max(1,r/6)}px)`:`blur(${Math.max(2,r/4)}px) brightness(1.6)`;if(tool==="glow")c.globalCompositeOperation="lighter";c.drawImage(tmp,sx,sy)}}
 c.restore();last=[x,y]}
overlay.onpointermove=e=>{if(!down)return;const[x,y]=pos(e),o=overlay.getContext("2d");
 if(["line","arrow","rect","rectf","ellipse","ellipsef","star","gradient"].includes(tool)){o.clearRect(0,0,W,H);shape(o,tool,down[0],down[1],x,y)}
 else if(tool==="move"){const c=ctx();c.clearRect(0,0,W,H);c.drawImage(moveSnap,x-down[0],y-down[1])}else stroke(x,y)};
overlay.onpointerup=e=>{if(!down)return;const[x,y]=pos(e);overlay.getContext("2d").clearRect(0,0,W,H);
 if(["line","arrow","rect","rectf","ellipse","ellipsef","star","gradient"].includes(tool))shape(ctx(),tool,down[0],down[1],x,y);down=null;moveSnap=null};
function flatten(){const c=mk(),x=c.getContext("2d");layers.forEach(l=>{if(l.visible)x.drawImage(l.c,0,0)});return c}
function savePng(){flatten().toBlob(b=>{const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`paint-${W}x${H}.png`;a.click();log(`PNG ${W}×${H}, слоёв: ${layers.length}`)},"image/png")}
function openImg(){const i=document.createElement("input");i.type="file";i.accept="image/*";i.onchange=()=>{const f=i.files[0];if(!f)return;const im=new Image();im.onload=()=>{addLayer(f.name);ctx().drawImage(im,0,0,W,H)};im.src=URL.createObjectURL(f)};i.click()}
// Send to chat: the bridge relays the PNG to the extension, which attaches it to the active AI chat; text fallback otherwise.
const EMBED=window.parent!==window&&new URLSearchParams(location.search).get("workspace")!=="1";
if(EMBED){addEventListener("message",e=>{const d=e.data||{};if(e.source!==window.parent||d.type!=="brickwire:paint:result")return;const w=EMBED_WAIT[d.id];if(w){delete EMBED_WAIT[d.id];w(d)}});
 document.addEventListener("DOMContentLoaded",()=>{const c=document.getElementById("bwClose");if(c){c.style.display="";c.addEventListener("click",()=>window.parent.postMessage({type:"brickwire:paint:hide"},"*"))}})}
const EMBED_WAIT={};
async function sendToChat(){const data=flatten().toDataURL("image/png");const text=$("#txt").value;const withImg=$("#chatAttach")?$("#chatAttach").checked:true;
 if(EMBED){const id="p"+Date.now();log("Отправляю в этот чат…");const res=await new Promise(ok=>{EMBED_WAIT[id]=ok;window.parent.postMessage({type:"brickwire:paint:send",id,png:withImg?data:null,text},"*");setTimeout(()=>{if(EMBED_WAIT[id]){delete EMBED_WAIT[id];ok({mode:"none",error:"нет ответа от страницы чата"})}},60000)});
  log(res.mode==="image"?" Картинка прикреплена и отправлена в чат ("+res.provider+")":res.mode==="text"?" Сайт не принял картинку — отправлен текст ("+(res.error||"fallback")+")":" Не удалось отправить: "+(res.error||"unknown"));return}
 try{const r=await fetch("/api/outbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({source:"paint",kind:withImg?"image":"text",png:withImg?data:null,text,width:W,height:H,layers:layers.map(l=>l.name),name:"paint-"+Date.now()+".png"})});const j=await r.json();
  if(!j.ok){log("Не отправлено: "+(j.error||r.status));return}const id=j.item.id;log("В очереди… откройте вкладку AI-чата с Brickwire (PNG: "+(j.file||"-")+")");
  for(let i=0;i<90;i++){await new Promise(z=>setTimeout(z,1000));const it=await (await fetch("/api/outbox/"+encodeURIComponent(id))).json();const st=(it.item||it).state;
   if(st==="done"){const m=(it.item||it).result||{};log(m.mode==="image"?" Картинка прикреплена и отправлена ("+m.provider+")":" Картинку сайт не принял — отправлен текст (fallback, "+m.provider+")"+(m.error?": "+m.error:""));return}
   if(st==="failed"){log(" Не удалось отправить: "+(((it.item||it).result||{}).error||"unknown"));return}}
  log("Нет вкладки чата с Brickwire — сообщение ждёт в очереди")}catch(e){log("Ошибка: "+e.message)}}
addEventListener("resize",fit);new ResizeObserver(fit).observe($("#wrap"));syncTools();newDoc();

;(function(){document.querySelector('[data-bwh="0"]').addEventListener("change",function(event){newDoc()});
document.querySelector('[data-bwh="1"]').addEventListener("click",function(event){undo()});
document.querySelector('[data-bwh="2"]').addEventListener("click",function(event){redo()});
document.querySelector('[data-bwh="3"]').addEventListener("click",function(event){openImg()});
document.querySelector('[data-bwh="4"]').addEventListener("click",function(event){savePng()});
document.querySelector('[data-bwh="5"]').addEventListener("click",function(event){sendToChat()});
document.querySelector('[data-bwh="6"]').addEventListener("input",function(event){sv.textContent=this.value});
document.querySelector('[data-bwh="7"]').addEventListener("click",function(event){addLayer()});
document.querySelector('[data-bwh="8"]').addEventListener("click",function(event){delLayer()});
document.querySelector('[data-bwh="9"]').addEventListener("click",function(event){moveLayer(1)});
document.querySelector('[data-bwh="10"]').addEventListener("click",function(event){moveLayer(-1)});
document.querySelector('[data-bwh="11"]').addEventListener("click",function(event){mergeDown()});})();
