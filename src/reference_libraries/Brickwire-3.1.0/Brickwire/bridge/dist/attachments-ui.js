/* Shared attachment composer. No remote uploads until the user explicitly sends a message. */
(() => {
  'use strict';
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let token;
  async function api(path, body) {
    if (!token) { const r = await fetch('/api/app-mcp/access'); if (!r.ok) throw Error('Сессия приложения недоступна'); token = (await r.json()).token; }
    const r = await fetch(path,{method:body?'POST':'GET',headers:{'X-Brickwire-App':token,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
    if (!r.ok) { if(r.status===403)token=null; throw Error((await r.json()).error || 'Ошибка загрузки'); }
    return r.headers.get('content-type')?.includes('json') ? r.json() : r.blob();
  }
  const notify = message => { const t=document.querySelector('#toast'); if(t){t.textContent=message;t.className='toast bad';setTimeout(()=>t.classList.add('hide'),5500);}else console.warn(message); };
  function mount(host, options={}) {
    let items=[], busy=false, locked=false;
    const panel=document.createElement('div');panel.className='bw-attachments';panel.innerHTML=`<div class="bw-attach-toolbar"><button type="button" class="bw-attach-button" aria-label="Прикрепить фото или файл" title="Прикрепить фото или файл"><svg viewBox="0 0 24 24"><path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2"/></svg><span>Файлы</span></button><span class="bw-attach-hint">Перетащите файл · вставьте фото · до 8 МБ</span><input type="file" class="bw-file-picker" multiple hidden></div><div class="bw-attach-list" aria-live="polite"></div>`;
    host.prepend(panel);
    const picker=panel.querySelector('input'),button=panel.querySelector('button'),list=panel.querySelector('.bw-attach-list');
    function draw(){
      button.disabled=busy||locked;button.querySelector('span').textContent=busy?'Загрузка…':'Файлы';
      list.innerHTML=items.map((a,i)=>`<div class="bw-attach-chip">${a.preview?`<img src="${esc(a.preview)}" alt="">`:'<span class="bw-file-symbol">↗</span>'}<span><b>${esc(a.name)}</b><small>${(a.bytes/1024).toFixed(0)} КБ · ${a.kind==='image'?'фото':a.kind==='text'?'текст для AI':'файл; AI видит только сведения'}</small></span><button type="button" data-remove="${i}" aria-label="Удалить ${esc(a.name)}" ${locked?'disabled':''}>×</button></div>`).join('');
      list.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(busy||locked)return;const a=items.splice(+b.dataset.remove,1)[0];if(a.preview)URL.revokeObjectURL(a.preview);draw();await api(`/api/bw3/attachments/${a.id}/delete`,{}).catch(()=>{});});
      options.onChange?.();
    }
    async function add(files) {
      if(busy||locked)return;
      busy=true; draw();
      try {
        for(const file of Array.from(files)){
          if(items.length>=6)throw Error('Максимум 6 вложений на сообщение');
          if(!file.size||file.size>8*1024*1024)throw Error(`${file.name}: допустимый размер 1 байт — 8 МБ`);
          if(items.reduce((n,a)=>n+a.bytes,0)+file.size>24*1024*1024)throw Error('Суммарный размер не более 24 МБ');
          if(/\.(png|jpe?g|gif|webp)$/i.test(file.name)&&items.filter(a=>a.kind==='image').length>=4)throw Error('Максимум 4 фотографии');
          const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('Не удалось прочитать файл'));r.readAsDataURL(file);});
          const {attachment:a}=await api('/api/bw3/attachments',{name:file.name,data});
          a.preview=a.kind==='image'?URL.createObjectURL(file):null;items.push(a);draw();
        }
      } catch(e){notify(e.message);}finally{busy=false;picker.value='';draw();}
    }
    button.onclick=()=>picker.click();picker.onchange=()=>add(picker.files);
    host.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();host.classList.add('bw-dragover');}});
    host.addEventListener('dragleave',e=>{if(!host.contains(e.relatedTarget))host.classList.remove('bw-dragover');});
    host.addEventListener('drop',e=>{if(!e.dataTransfer.files.length)return;e.preventDefault();host.classList.remove('bw-dragover');add(e.dataTransfer.files);});
    host.addEventListener('paste',e=>{const files=Array.from(e.clipboardData?.items||[]).filter(i=>i.kind==='file').map(i=>i.getAsFile()).filter(Boolean);if(files.length){e.preventDefault();add(files);}});
    return {ids:()=>items.map(a=>a.id),items:()=>items,ready:()=>!busy,lock(v){locked=v;draw();},reset(){items.forEach(a=>{if(a.preview)URL.revokeObjectURL(a.preview);});items=[];draw();},set(arr){items=arr.map(a=>({...a}));draw();},take(){const arr=items;items=[];draw();return arr;},add};
  }
  // Message images are fetched once per attachment and reused across re-renders (chat re-renders on every send).
  const imageCache=new Map();
  function imageUrl(id){if(!imageCache.has(id)){const p=api(`/api/bw3/attachments/${id}`).then(blob=>URL.createObjectURL(blob));p.catch(()=>imageCache.delete(id));imageCache.set(id,p);if(imageCache.size>200){const [k,v]=imageCache.entries().next().value;imageCache.delete(k);v.then(u=>URL.revokeObjectURL(u)).catch(()=>{});}}return imageCache.get(id);}
  function render(host,attachments) {
    if(!attachments?.length)return;
    const box=document.createElement('div');box.className='bw-message-files';host.append(box);
    attachments.forEach(a=>{
      const b=document.createElement('button');b.type='button';b.className='bw-message-file';b.innerHTML=`<span>${esc(a.name)}</span><small>${(a.bytes/1024).toFixed(0)} КБ ↓</small>`;
      b.onclick=async()=>{try{const blob=await api(`/api/bw3/attachments/${a.id}`),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=a.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){notify(e.message);}};
      box.append(b);
      if(a.kind==='image'){const img=document.createElement('img');img.alt=a.name;b.prepend(img);imageUrl(a.id).then(url=>{img.src=url;}).catch(()=>img.remove());}
    });
  }
  window.BrickwireAttachments={mount,render,api};
})();
