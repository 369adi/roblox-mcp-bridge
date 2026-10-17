/* Brickwire 3.0 workspace UI: Chats (agent chat with live progress + 3D preview), Development Tree,
   generated Asset Library, Skills registry, Blender MCP guide. Talks only to /api/bw3/* with the app token. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  let TOKEN = null;
  async function token() {
    if (TOKEN) return TOKEN;
    const r = await fetch("/api/app-mcp/access"); const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Application session required");
    return (TOKEN = d.token);
  }
  async function api(p, body, method) {
    const t = await token();
    const r = await fetch(p, { method: method || (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", "X-Brickwire-App": t }, body: body ? JSON.stringify(body) : undefined });
    const ct = r.headers.get("content-type") || "";
    const d = ct.includes("json") ? await r.json() : await r.text();
    if (r.status === 403 && /authorization/i.test(d.error || "")) TOKEN = null;
    if (!r.ok) throw new Error((d && d.error) || "HTTP " + r.status);
    return d;
  }
  const resImages = new Map();
  function resImage(id) { if (!resImages.has(id)) { const p = blob(`/api/bw3/attachments/${id}`).then((b) => URL.createObjectURL(b)); p.catch(() => resImages.delete(id)); resImages.set(id, p); } return resImages.get(id); }
  function resultSummary(r) { if (!r || typeof r !== "object") return ""; const st = r.studio?.path || r.readBack?.path || (r.created || [])[0] || r.path; return st ? "· " + st : r.objects ? "· " + r.objects.slice(0, 5).join(", ") : ""; }
  async function blob(p) { const t = await token(); const r = await fetch(p, { headers: { "X-Brickwire-App": t } }); if (!r.ok) throw new Error("HTTP " + r.status); return r.blob(); }
  const toast = (t, bad) => { const e = document.getElementById("toast"); if (!e) return alert(t); e.textContent = t; e.className = "toast" + (bad ? " bad" : ""); clearTimeout(toast.t); toast.t = setTimeout(() => e.classList.add("hide"), 4600); };
  const fmtT = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "";
  const STATE_RU = { queued: "в очереди", running: "выполняется", waiting_approval: "ждёт подтверждения", done: "готово", partial: "частично", blocked: "заблокировано", failed: "ошибка", cancelled: "отменено", interrupted: "прервано" };
  const STAGE_RU = { QUEUED: "Очередь", ANALYZING: "Анализ", SKILLS: "Выбор Skills", PLANNING: "Планирование", GENERATING: "Генерация", VALIDATING: "Проверка", FIXING: "Исправление", EXPORTING: "Экспорт", INSPECTING: "Инспекция файла", PREVIEW: "Превью", REGISTERED: "В библиотеке", EXECUTING: "Выполнение", REVIEWING: "Ревью", VERIFYING: "Верификация", DONE: "Готово", FAILED: "Ошибка", CANCELLED: "Отменено", PARTIAL: "Частично", BLOCKED: "Заблокировано", INTERRUPTED: "Прервано" };
  const TERMINAL = ["done", "partial", "blocked", "failed", "cancelled", "interrupted"];
  // minimal safe markdown: code fences, inline code, bold, headings, lists, quotes
  function md(src) {
    const parts = String(src || "").split(/```(\w*)\n?([\s\S]*?)```/g); let out = "";
    for (let i = 0; i < parts.length; i++) {
      if (i % 3 === 1) continue;
      if (i % 3 === 2) { out += `<pre class="b3-code"><button class="b3-copy" type="button">Копировать</button><code>${esc(parts[i])}</code></pre>`; continue; }
      out += esc(parts[i]).split(/\n/).map((l) => {
        let x = l.replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
        if (/^#{1,4}\s/.test(l)) return `<div class="b3-h">${x.replace(/^#+\s/, "")}</div>`;
        if (/^\s*[-*]\s/.test(l)) return `<div class="b3-li">• ${x.replace(/^\s*[-*]\s/, "")}</div>`;
        if (/^&gt;\s?/.test(x)) return `<div class="b3-quote">${x.replace(/^&gt;\s?/, "")}</div>`;
        return x ? `<div>${x}</div>` : `<div class="b3-gap"></div>`;
      }).join("");
    }
    return out;
  }
  document.addEventListener("click", (e) => { const b = e.target.closest(".b3-copy"); if (b) { navigator.clipboard?.writeText(b.nextElementSibling.textContent); b.textContent = "Скопировано"; setTimeout(() => (b.textContent = "Копировать"), 1200); } });

  // ===================================================================== OBJ viewer (WebGL)
  function parseObjText(text, mtlText) {
    const P = [], N = [], colors = {}; let cur = "default"; const groups = {};
    for (const m of (mtlText || "").matchAll(/newmtl\s+(\S+)[\s\S]*?\nKd\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/g)) colors[m[1]] = [+m[2], +m[3], +m[4]];
    for (const raw of text.split(/\r?\n/)) {
      const l = raw.trim(); if (!l || l[0] === "#") continue; const a = l.split(/\s+/);
      if (a[0] === "v") P.push([+a[1], +a[2], +a[3]]); else if (a[0] === "vn") N.push([+a[1], +a[2], +a[3]]);
      else if (a[0] === "usemtl") cur = a[1];
      else if (a[0] === "f") { const ids = a.slice(1).map((s) => s.split("/")); const g = groups[cur] || (groups[cur] = []); for (let i = 1; i + 1 < ids.length; i++) g.push(ids[0], ids[i], ids[i + 1]); }
    }
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of P) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    let tris = 0; const meshes = Object.entries(groups).map(([m, ids]) => {
      const pos = new Float32Array(ids.length * 3), nor = new Float32Array(ids.length * 3); tris += ids.length / 3;
      for (let i = 0; i < ids.length; i += 3) {
        const v = [0, 1, 2].map((k) => P[+ids[i + k][0] - 1]);
        const e1 = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], e2 = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
        let fn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; const L = Math.hypot(...fn) || 1; fn = fn.map((x) => x / L);
        for (let k = 0; k < 3; k++) { pos.set(v[k], (i + k) * 3); const ni = ids[i + k][2]; nor.set(ni && N[+ni - 1] ? N[+ni - 1] : fn, (i + k) * 3); }
      }
      return { material: m, color: colors[m] || [0.7, 0.7, 0.7], pos, nor };
    });
    return { meshes, min, max, vertices: P.length, triangles: tris, materials: Object.keys(groups) };
  }
  const SH_V = `attribute vec3 p;attribute vec3 n;uniform mat4 mvp;uniform mat4 mv;varying vec3 vn;varying vec3 vp;void main(){vn=mat3(mv)*n;vp=(mv*vec4(p,1.)).xyz;gl_Position=mvp*vec4(p,1.);}`;
  const SH_F = `precision mediump float;varying vec3 vn;varying vec3 vp;uniform vec3 col;uniform float flat_;void main(){vec3 N=normalize(vn);if(!gl_FrontFacing)N=-N;vec3 L=normalize(vec3(-.4,.8,.6));float d=max(dot(N,L),0.);float rim=pow(1.-abs(N.z),2.)*.18;vec3 c=col*(.32+.68*d)+rim;if(flat_>.5)c=col;gl_FragColor=vec4(c,1.);}`;
  function mat4mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
  function persp(f, a, n, fr) { const t = 1 / Math.tan(f / 2); return new Float32Array([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) / (n - fr), -1, 0, 0, (2 * fr * n) / (n - fr), 0]); }
  function mountViewer(host, model, opts = {}) {
    host.innerHTML = ""; const cv = document.createElement("canvas"); cv.className = "b3-canvas"; host.appendChild(cv);
    const gl = cv.getContext("webgl", { antialias: true, preserveDrawingBuffer: true });
    if (!gl) { host.innerHTML = `<div class="b3-muted">WebGL недоступен в этом окне — используйте превью PNG или скачайте OBJ.</div>`; return null; }
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); return x; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, SH_V)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, SH_F)); gl.linkProgram(pr); gl.useProgram(pr);
    const loc = { p: gl.getAttribLocation(pr, "p"), n: gl.getAttribLocation(pr, "n"), mvp: gl.getUniformLocation(pr, "mvp"), mv: gl.getUniformLocation(pr, "mv"), col: gl.getUniformLocation(pr, "col"), flat: gl.getUniformLocation(pr, "flat_") };
    const center = [0, 1, 2].map((k) => (model.min[k] + model.max[k]) / 2), radius = Math.hypot(...[0, 1, 2].map((k) => model.max[k] - model.min[k])) / 2 || 1;
    const bufs = model.meshes.map((m) => {
      const b = { color: m.color, count: m.pos.length / 3, p: gl.createBuffer(), n: gl.createBuffer(), l: gl.createBuffer(), lc: 0 };
      gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.bufferData(gl.ARRAY_BUFFER, m.pos, gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.bufferData(gl.ARRAY_BUFFER, m.nor, gl.STATIC_DRAW);
      const lines = new Float32Array((m.pos.length / 9) * 18); for (let t = 0; t < m.pos.length / 9; t++) { const o = t * 9; const e = [0, 1, 1, 2, 2, 0]; e.forEach((vi, j) => lines.set(m.pos.subarray(o + vi * 3, o + vi * 3 + 3), t * 18 + j * 3)); }
      gl.bindBuffer(gl.ARRAY_BUFFER, b.l); gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW); b.lc = lines.length / 3; return b;
    });
    const st = { yaw: -0.7, pitch: 0.35, dist: radius * 2.6, pan: [0, 0], wire: false, solid: true, dark: true };
    const reset = () => { st.yaw = -0.7; st.pitch = 0.35; st.dist = radius * 2.6; st.pan = [0, 0]; draw(); };
    function draw() {
      const w = cv.clientWidth, hh = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
      gl.viewport(0, 0, cv.width, cv.height); const bg = st.dark ? [0.075, 0.08, 0.1] : [0.86, 0.87, 0.9];
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
      const cy = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      const rot = new Float32Array([cy, sy * sp, -sy * cp, 0, 0, cp, sp, 0, sy, -cy * sp, cy * cp, 0, 0, 0, 0, 1]);
      const tr = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -center[0], -center[1], -center[2], 1]);
      const view = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, st.pan[0], st.pan[1], -st.dist, 1]);
      const mv = mat4mul(view, mat4mul(rot, tr)), mvp = mat4mul(persp(0.8, cv.width / cv.height, radius * 0.02, radius * 20), mv);
      gl.uniformMatrix4fv(loc.mvp, false, mvp); gl.uniformMatrix4fv(loc.mv, false, mv);
      for (const b of bufs) {
        gl.bindBuffer(gl.ARRAY_BUFFER, b.n); gl.enableVertexAttribArray(loc.n); gl.vertexAttribPointer(loc.n, 3, gl.FLOAT, false, 0, 0);
        if (st.solid) { gl.bindBuffer(gl.ARRAY_BUFFER, b.p); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0); gl.uniform3fv(loc.col, b.color); gl.uniform1f(loc.flat, 0); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); gl.drawArrays(gl.TRIANGLES, 0, b.count); }
        if (st.wire) { gl.disableVertexAttribArray(loc.n); gl.vertexAttrib3f(loc.n, 0, 0, 1); gl.bindBuffer(gl.ARRAY_BUFFER, b.l); gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 3, gl.FLOAT, false, 0, 0); gl.uniform3fv(loc.col, st.solid ? [0.05, 0.05, 0.06] : (st.dark ? [0.85, 0.75, 0.5] : [0.15, 0.15, 0.2])); gl.uniform1f(loc.flat, 1); gl.drawArrays(gl.LINES, 0, b.lc); }
      }
    }
    let drag = null;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; if (drag.pan) { const k = st.dist / cv.clientHeight; st.pan[0] += dx * k; st.pan[1] -= dy * k; } else { st.yaw += dx * 0.01; st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch + dy * 0.01)); } draw(); });
    cv.addEventListener("pointerup", () => (drag = null)); cv.addEventListener("contextmenu", (e) => e.preventDefault());
    cv.addEventListener("wheel", (e) => { e.preventDefault(); st.dist = Math.max(radius * 0.3, Math.min(radius * 12, st.dist * Math.exp(e.deltaY * 0.0012))); draw(); }, { passive: false });
    cv.addEventListener("dblclick", reset);
    const ro = new ResizeObserver(() => { if (!cv.isConnected) { ro.disconnect(); return; } draw(); }); ro.observe(cv); requestAnimationFrame(draw);
    return { draw, reset, st, canvas: cv, set(k, v) { st[k] = v; draw(); } };
  }
  async function loadArtifactModel(id) {
    const [obj, mtl] = await Promise.all([blob(`/api/bw3/artifacts/${id}/file/model.obj`).then((b) => b.text()), blob(`/api/bw3/artifacts/${id}/file/model.mtl`).then((b) => b.text())]);
    return parseObjText(obj, mtl);
  }
  async function download(id, name, file) { const b = await blob(`/api/bw3/artifacts/${id}/file/${file}`); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `${name.replace(/[^\w-]+/g, "_")}_${file}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const thumbCache = new Map();
  async function thumb(img, id) { try { if (!thumbCache.has(id)) thumbCache.set(id, URL.createObjectURL(await blob(`/api/bw3/artifacts/${id}/file/thumb.png`))); img.src = thumbCache.get(id); } catch { img.alt = "превью недоступно"; } }

  // ===================================================================== modal + confirm
  function modal(title, body, actions = []) {
    const m = h(`<div class="b3-modal"><div class="b3-dialog" role="dialog" aria-modal="true"><div class="b3-dhead"><b>${esc(title)}</b><button class="quiet b3-x" aria-label="Закрыть">✕</button></div><div class="b3-dbody"></div><div class="b3-dfoot"></div></div></div>`);
    if (typeof body === "string") $(".b3-dbody", m).innerHTML = body; else $(".b3-dbody", m).appendChild(body);
    const close = () => m.remove();
    $(".b3-x", m).onclick = close; m.addEventListener("click", (e) => { if (e.target === m) close(); });
    for (const a of actions) { const b = h(`<button class="${a.primary ? "primary" : ""}">${esc(a.label)}</button>`); b.onclick = async () => { b.disabled = true; try { if ((await a.run?.(m)) !== false) close(); } catch (e) { toast(e.message, true); } finally { b.disabled = false; } }; $(".b3-dfoot", m).appendChild(b); }
    document.body.appendChild(m); return m;
  }
  const confirmBox = (title, text, label = "Подтвердить") => new Promise((res) => { const m = modal(title, `<p>${text}</p>`, [{ label: "Отмена", run: () => res(false) }, { label, primary: true, run: () => res(true) }]); $(".b3-x", m).addEventListener("click", () => res(false)); });

  // ===================================================================== artifact card
  function artifactCard(a, opts = {}) {
    const el = h(`<div class="b3-art" data-artifact="${a.id}">
      <div class="b3-art-view"><img class="b3-thumb" alt="${esc(a.name)}"><button class="b3-open3d">Открыть 3D-просмотр</button></div>
      <div class="b3-art-side">
        <div class="b3-art-title"><b>${esc(a.name)}</b><span class="b3-badge ${a.verified ? "ok" : "warn"}">${a.verified ? "проверено" : "файлы изменены"}</span></div>
        <div class="b3-stats"><span>${a.stats.triangles.toLocaleString()} треуг.</span><span>${a.stats.vertices.toLocaleString()} верш.</span><span>${a.stats.parts} частей</span><span>${a.stats.materials} матер.</span><span>${a.stats.size.join(" × ")} studs</span></div>
        ${a.source && a.source !== "forge" ? `<div class="b3-muted b3-small">${a.source === "blender" ? "Импорт из Blender" : "Импорт"} · ${esc(a.request || "")}</div>` : `<div class="b3-muted b3-small">${esc(a.spec.recipe)}${a.spec.variant ? " / " + esc(a.spec.variant) : ""} · seed ${a.spec.seed} · detail ${a.spec.detail} · ${a.validation.closedParts}/${a.stats.parts} watertight${a.validation.fixes.length ? " · авто-исправлений: " + a.validation.fixes.length : ""}</div>`}
        <div class="b3-tools">
          <button data-a="wire" class="quiet" title="Каркас">Каркас</button><button data-a="solid" class="quiet" title="Заливка">Заливка</button><button data-a="bg" class="quiet">Фон</button><button data-a="reset" class="quiet">Сброс вида</button>
        </div>
        <div class="b3-tools">
          <button data-a="obj">OBJ</button><button data-a="mtl">MTL</button><button data-a="png">PNG</button>
          ${a.source && a.source !== "forge" ? "" : `<button data-a="regen">Перегенерировать</button><button data-a="variant">Вариант</button>`}
          <button data-a="lib">${a.library ? "В библиотеке ✓" : "В библиотеку"}</button>
          <button data-a="studio" class="primary">В Studio</button><button data-a="blender">В Blender</button>
        </div>
        <div class="b3-art-note b3-small b3-muted"></div>
      </div></div>`);
    thumb($(".b3-thumb", el), a.id);
    let viewer = null;
    const open3d = async () => { const host = $(".b3-art-view", el); host.innerHTML = `<div class="b3-muted">Загрузка model.obj…</div>`; try { const model = await loadArtifactModel(a.id); host.innerHTML = ""; const box = h(`<div class="b3-viewer"></div>`); host.appendChild(box); viewer = mountViewer(box, model); host.appendChild(h(`<div class="b3-vhint">ЛКМ — вращение · ПКМ/Shift — сдвиг · колесо — зум · двойной клик — сброс · из файла: ${model.triangles} треуг.</div>`)); } catch (e) { host.innerHTML = `<div class="b3-err">${esc(e.message)}</div>`; } };
    $(".b3-open3d", el).onclick = open3d; if (opts.autoOpen) open3d();
    const note = (t, bad) => { const n = $(".b3-art-note", el); n.textContent = t; n.classList.toggle("b3-errtext", !!bad); };
    el.addEventListener("click", async (e) => {
      const b = e.target.closest("button[data-a]"); if (!b) return; const act = b.dataset.a;
      try {
        if (["wire", "solid", "bg", "reset"].includes(act)) { if (!viewer) await open3d(); if (!viewer) return; if (act === "wire") viewer.set("wire", !viewer.st.wire); if (act === "solid") viewer.set("solid", !viewer.st.solid || !viewer.st.wire ? true : false); if (act === "bg") viewer.set("dark", !viewer.st.dark); if (act === "reset") viewer.reset(); return; }
        if (act === "obj") return download(a.id, a.name, "model.obj"); if (act === "mtl") return download(a.id, a.name, "model.mtl"); if (act === "png") return download(a.id, a.name, "thumb.png");
        if (act === "lib") { const r = await api(`/api/bw3/artifacts/${a.id}/update`, { library: !a.library }); a.library = r.artifact.library; b.textContent = a.library ? "В библиотеке ✓" : "В библиотеку"; return; }
        if (act === "regen" || act === "variant") { const r = await api(`/api/bw3/artifacts/${a.id}/regenerate`, { variant: act === "variant", settings: Chat.settings() }); toast(act === "variant" ? "Генерирую вариант…" : "Перегенерирую…"); go3("chats"); Chat.open(r.conversationId); return; }
        if (act === "studio") return sendToStudio(a, note);
        if (act === "blender") return sendToBlender(a, note);
      } catch (err) { note(err.message, true); toast(err.message, true); }
    });
    return el;
  }
  /** Follow a submitted tool call until it finishes, asking for approval when the bridge requires it. */
  async function runCall(env, note = () => {}) {
    for (let i = 0; i < 200 && env.state !== "done"; i++) {
      if (env.state === "pending_approval") {
        note("Ожидает подтверждения…");
        const ok = await confirmBox("Подтверждение", `Инструмент <code>${esc(env.tool || "")}</code>: ${esc(env.approvalReason || "действие изменит проект")}`, "Разрешить");
        await api("/api/bw3/approve", { approvalId: env.approvalId, approve: ok });
      }
      env = await api(`/api/bw3/calls/${env.callId}?wait=4000`);
    }
    return env.result || null;
  }
  async function runTool(tool, args, note = () => {}) {
    const env = await api("/api/bw3/connect/tool", { tool, args });
    return runCall(env, note);
  }
  async function sendToStudio(a, note) {
    if (!(await confirmBox("Импорт в Roblox Studio", `Будет создана модель <b>${esc(a.name)}</b> из ${a.stats.materials} MeshPart (EditableMesh) в Workspace подключённого плейса. EditableMesh <b>не сохраняется</b> вместе с плейсом — для постоянного ассета импортируйте model.obj через 3D Importer.`, "Импортировать"))) return;
    note("Отправка в Studio…");
    let env = await api(`/api/bw3/artifacts/${a.id}/studio`, { confirm: true });
    for (let i = 0; i < 90 && env.state !== "done"; i++) {
      if (env.state === "pending_approval") {
        note("Ожидает подтверждения записи в Studio…");
        const ok = await confirmBox("Подтверждение записи", `Инструмент artifact_studio_import изменит проект: ${esc(env.approvalReason || "")}`, "Разрешить");
        await api("/api/bw3/approve", { approvalId: env.approvalId, approve: ok });
      }
      env = await api(`/api/bw3/calls/${env.callId}?wait=4000`);
    }
    const r = env.result || {}; const out = r.result || {};
    if (r.status === "success" && out.verified) note(`Импортировано и прочитано обратно: ${out.readBack?.path} (${out.readBack?.meshParts} MeshPart). Не сохраняется с плейсом.`);
    else note(`Импорт не подтверждён: ${r.error || JSON.stringify(out.readBack || out).slice(0, 300)}`, true);
  }
  async function sendToBlender(a, note) {
    const c = await api("/api/bw3/connect").catch(() => null);
    if (c?.blender?.connected) {
      note("Импорт в Blender…");
      const env = await api("/api/bw3/connect/blender/import", { artifactId: a.id });
      const r = await runCall(env, note);
      const out = r?.result || {};
      if (r?.status === "success") note(`Blender создал объекты: ${(out.objects || []).slice(0, 8).join(", ") || out.imported}`); else note(`Импорт не выполнен: ${r?.error || "нет ответа"}`, true);
      return;
    }
    const d = await api("/api/bw3/blender");
    if (!d.servers.length) { note("Blender не подключён — откройте вкладку «Blender и Figma» и нажмите «Установить в Blender».", true); return; }
    const ready = d.servers.filter((s) => s.status === "ready");
    if (!ready.length) { note(d.servers.length ? "Blender MCP не подключён — откройте MCP → Blender и нажмите «Подключить»." : "Blender MCP не настроен — откройте MCP → Blender (там пошаговое руководство).", true); return; }
    const s = ready[0];
    if (!s.executeTool) { note("Сервер Blender не сообщает инструмент выполнения Python — импорт недоступен.", true); return; }
    if (!(await confirmBox("Импорт в Blender", `Brickwire выполнит в Blender Python-код импорта OBJ (инструмент <code>${esc(s.executeTool.name)}</code>) и прочитает список созданных объектов.`, "Выполнить"))) return;
    note("Импорт в Blender…");
    const r = await api(`/api/bw3/artifacts/${a.id}/blender`, { serverId: s.id, confirm: true });
    note(r.ok ? `Blender создал объекты: ${r.objects.slice(0, 8).join(", ")}${r.objects.length > 8 ? "…" : ""}` : `Импорт не подтверждён: ${r.note} ${r.output.slice(0, 200)}`, !r.ok);
  }

  // ===================================================================== live run stream
  function follow(runId, after, on) {
    // SSE first; if the stream drops (sleep, proxy, bridge restart) without an "end" event we reconnect, and after
    // repeated failures fall back to JSON long-polling. The server replays the current draft on every (re)connect.
    let stopped = false, ctrl = null, ended = false;
    const emit = (ev, d) => { if (stopped || ended) return; if (ev === "end") ended = true; try { on(ev, d); } catch (e) { console.warn("[bw3] stream handler", e); } };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    async function sse() {
      ctrl = new AbortController();
      const t = await token();
      const r = await fetch(`/api/bw3/stream?run=${encodeURIComponent(runId)}&after=${after}`, { headers: { "X-Brickwire-App": t }, signal: ctrl.signal });
      if (r.status === 404) { emit("end", { state: "failed", reply: null, missing: true }); return; }
      if (r.status === 403) TOKEN = null;
      if (!r.ok || !r.body) throw new Error("stream unavailable");
      const rd = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }).replace(/\r\n/g, "\n"); let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1], data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          let d; try { d = JSON.parse(data); } catch { continue; }
          if (ev === "events") after = d.events.at(-1)?.seq ?? after;
          emit(ev, d); if (ended || stopped) { try { ctrl.abort(); } catch { /* closed */ } return; }
        }
      }
      throw new Error("stream closed before the run ended");
    }
    async function poll() {
      const d = await api(`/api/bw3/runs/${encodeURIComponent(runId)}/events?after=${after}&wait=15000`);
      if (d.events.length) { after = d.events.at(-1).seq; emit("events", { events: d.events }); }
      emit("run", d.run); if (d.draft) emit("partial", { text: d.draft });
      if (TERMINAL.includes(d.run.state)) emit("end", { state: d.run.state, reply: d.reply });
    }
    (async () => {
      let fails = 0;
      while (!stopped && !ended) {
        try { if (fails < 3) await sse(); else await poll(); if (fails >= 3) fails = 3; }
        catch (e) {
          if (stopped) return;
          if (/not found/i.test(e.message)) { emit("end", { state: "failed", reply: null, missing: true }); return; }
          fails++; await sleep(Math.min(5000, 400 * fails));
        }
      }
    })();
    return () => { stopped = true; try { ctrl?.abort(); } catch { /* closed */ } };
  }

  // ===================================================================== Chats
  const GENRES = ["Obby с чекпоинтами", "Tycoon с кнопками покупки", "Симулятор с питомцами", "Магазин UI с монетами", "Сгенерируй японского дракона в OBJ", "Средневековая башня замка 3D", "Найди и исправь ошибки в скриптах", "Катана low poly OBJ"];
  const Chat = {
    root: null, conv: null, runs: {}, arts: {}, events: {}, stops: new Map(), state: null, partial: {}, openTok: 0, sending: false,
    settings() {
      const r = this.root; if (!r) return {};
      return { mode: $(".b3-mode .on", r)?.dataset.mode || "standard", depth: +$("#b3-depth", r).value, maxIterations: +$("#b3-iter", r).value, verificationPasses: +$("#b3-pass", r).value, autoSkills: $("#b3-auto", r).checked, model: $("#b3-model", r).value.trim() };
    },
    async mount(root) {
      this.root = root;
      root.innerHTML = `<div class="b3 b3-chat">
        <aside class="b3-convs"><button class="primary b3-new">＋ Новый чат</button><input class="b3-csearch" placeholder="Поиск по чатам"><div class="b3-clist"></div></aside>
        <div class="b3-main">
          <div class="b3-topbar"><div class="b3-ttl">Brickwire</div><div class="b3-pills"></div><div class="b3-mode b3-cviews" role="group"><button data-v="chat" class="on">Чат</button><button data-v="tree">Дерево</button></div><button class="quiet b3-totree">Development Tree →</button></div>
          <div class="b3-msgs"></div><div class="b3-chatgraph hide"></div>
          <div class="b3-composer">
            <div class="b3-skillpreview"></div>
            <textarea id="b3-in" rows="2" placeholder="Опишите игру, механику или 3D-объект… (Enter — отправить, Shift+Enter — новая строка)"></textarea>
            <div class="b3-crow">
              <div class="b3-mode" role="group" aria-label="Режим"><button data-mode="standard" class="on">Standard</button><button data-mode="super">Super Intelligence</button></div>
              <span class="b3-superopts"><label>Глубина <select id="b3-depth"><option>1</option><option selected>2</option><option>3</option></select></label><label>Итерации <select id="b3-iter"><option>1</option><option selected>2</option><option>3</option><option>4</option><option>5</option></select></label><label>Проверки <select id="b3-pass"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label></span>
              <label class="b3-check"><input type="checkbox" id="b3-auto" checked> Авто-Skills</label>
              <input id="b3-model" list="b3-models" placeholder="модель (по умолчанию)" class="b3-modelin"><datalist id="b3-models"></datalist>
              <span class="b3-grow"></span>
              <button class="b3-cancel hide">Отменить</button><button class="primary b3-send">Отправить</button>
            </div>
          </div>
        </div></div>`;
      $(".b3-new", root).onclick = async (e) => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; try { const d = await api("/api/bw3/chats", { title: "Новый чат" }); await this.open(d.conversation.id); $("#b3-in", root).focus(); } catch (er) { toast(er.message, true); } finally { b.disabled = false; } };
      $(".b3-csearch", root).oninput = () => this.renderList();
      this.graph = makeGraph($(".b3-chatgraph", root));
      clearInterval(this._pill); this._pill = setInterval(async () => { if (!this.state || !root.isConnected || !root.offsetParent) return; try { const st = await api("/api/bw3/state"); this.state.browser = st.browser; const bt = st.browser || {}, tab = (bt.tabs || []).find((t) => t.active) || (bt.tabs || [])[0], el = $(".b3-aipill", root); if (el) { el.className = `b3-pill b3-aipill ${bt.live ? "ok" : "warn"}`; el.textContent = bt.live ? "AI-чат: " + (tab?.providerName || "подключён") : "AI-чат не подключён"; } } catch { /* offline */ } }, 8000);
      $(".b3-cviews", root).onclick = (e) => { const v = e.target.dataset.v; if (v) this.setView(v); };
      $(".b3-totree", root).onclick = () => { go3("devtree"); Tree.show(this.conv ? { conversation: this.conv.id } : {}); };
      root.querySelectorAll(".b3-mode button[data-mode]").forEach((b) => (b.onclick = () => { root.querySelectorAll(".b3-mode button[data-mode]").forEach((x) => x.classList.toggle("on", x === b)); root.classList.toggle("b3-super", b.dataset.mode === "super"); this.saveSettings(); }));
      for (const id of ["#b3-depth", "#b3-iter", "#b3-pass", "#b3-auto", "#b3-model"]) $(id, root).addEventListener("change", () => this.saveSettings());
      const inp = $("#b3-in", root);
      this.files = window.BrickwireAttachments.mount($(".b3-composer", root));
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); this.send(); } });
      let tmr; inp.addEventListener("input", () => { clearTimeout(tmr); tmr = setTimeout(() => this.preview(), 450); inp.style.height = "auto"; inp.style.height = Math.min(220, inp.scrollHeight) + "px"; });
      $(".b3-send", root).onclick = () => this.send();
      $(".b3-cancel", root).onclick = () => this.cancelActive();
      await this.refresh();
      api("/api/bw3/models").then((d) => { $("#b3-models", root).innerHTML = (d.models || []).map((m) => `<option value="${esc(m)}">`).join(""); }).catch(() => {});
    },
    /** A Blender/Figma result arrived (results long-poll). */
    async onResult(it) {
      if (!this.root) return false;
      if (!this.conv || this.conv.id === it.conversationId) {
        if (this.conv && this.busy()) return true; // the live run stream reloads the chat itself
        const c = await api(`/api/bw3/chats/${it.conversationId}`);
        if (this.conv && this.conv.id !== it.conversationId) return false;
        this.conv = c.conversation; this.runs = { ...this.runs, ...Object.fromEntries(c.runs.map((r) => [r.id, r])) }; this.arts = Object.fromEntries(c.artifacts.map((a) => [a.id, a]));
        this.renderMessages(); this.refreshList().catch(() => {}); return true;
      }
      this.refreshList().catch(() => {}); return false;
    },
    async saveSettings() { const s = this.settings(); try { await api("/api/bw3/settings", { settings: s }); } catch (e) { toast(e.message, true); } },
    async refresh() {
      this.state = await api("/api/bw3/state");
      const d = this.state.defaults, r = this.root;
      r.querySelectorAll(".b3-mode button[data-mode]").forEach((x) => x.classList.toggle("on", x.dataset.mode === d.mode)); r.classList.toggle("b3-super", d.mode === "super");
      $("#b3-depth", r).value = d.depth; $("#b3-iter", r).value = d.maxIterations; $("#b3-pass", r).value = d.verificationPasses; $("#b3-auto", r).checked = d.autoSkills; $("#b3-model", r).value = d.model || "";
      const l = this.state.llm, s = this.state.studio;
      const bt = this.state.browser || {}, tab = (bt.tabs || []).find((t) => t.active) || (bt.tabs || [])[0];
      $(".b3-pills", r).innerHTML = `<span class="b3-pill b3-aipill ${bt.live ? "ok" : "warn"}" title="Запросы, которые нельзя выполнить локально, пересылаются в подключённый AI-чат">${bt.live ? "AI-чат: " + esc(tab?.providerName || "подключён") : "AI-чат не подключён"}</span><span class="b3-pill ${l.configured ? "ok" : "warn"}" title="${esc(l.error || l.url || "")}">${l.configured ? "LLM: " + esc(l.provider + " · " + l.model) : "LLM не настроен"}</span><span class="b3-pill ${s.ready ? "ok" : "warn"}">${s.ready ? "Studio: " + esc(s.binding?.name || "подключён") : "Studio не подключён"}</span><span class="b3-pill">${this.state.skills.total} Skills${this.state.skills.auto ? " · авто" : ""}</span><span class="b3-pill">${this.state.tools} инструментов</span>`;
      this.renderList();
      if (this._stale && !this.busy()) { const id = this._stale; this._stale = null; await this.open(id); }
      else if (!this.conv && this.state.conversations[0]) await this.open(this.state.conversations[0].id); else if (!this.conv) this.renderMessages();
    },
    renderList() {
      if (!this.root || !this.state) return;
      const q = ($(".b3-csearch", this.root).value || "").toLowerCase();
      $(".b3-clist", this.root).innerHTML = this.state.conversations.filter((c) => !q || (c.title + " " + c.last).toLowerCase().includes(q)).map((c) => `<div class="b3-citem ${this.conv?.id === c.id ? "on" : ""}" data-id="${c.id}"><div class="b3-ctitle">${esc(c.title)}</div><div class="b3-csub">${c.messages} сообщ. · ${new Date(c.updatedAt).toLocaleDateString()}</div><button class="quiet b3-cdel" title="Удалить" data-del="${c.id}">✕</button></div>`).join("") || `<div class="b3-muted b3-small">Чатов пока нет</div>`;
      this.root.querySelectorAll(".b3-citem").forEach((el) => (el.onclick = async (e) => { if (e.target.dataset.del) { if (await confirmBox("Удалить чат", "История сообщений будет удалена. Артефакты останутся в библиотеке.", "Удалить")) { await api(`/api/bw3/chats/${e.target.dataset.del}/delete`, {}); if (this.conv?.id === e.target.dataset.del) { for (const s of this.stops.values()) s(); this.stops.clear(); this.conv = null; this.runs = {}; this.events = {}; this.partial = {}; this.openTok++; this.syncButtons(); } await this.refresh(); } return; } this.open(el.dataset.id); }));
    },
    async open(id) {
      const tok = ++this.openTok;
      const d = await api(`/api/bw3/chats/${id}`);
      if (tok !== this.openTok) return; // a newer open() won the race (fast clicking between chats)
      for (const s of this.stops.values()) s(); this.stops.clear();
      this.conv = d.conversation; this.runs = Object.fromEntries(d.runs.map((r) => [r.id, r])); this.arts = Object.fromEntries(d.artifacts.map((a) => [a.id, a])); this.events = {}; this.partial = {};
      this.renderList(); this.renderMessages();
      api("/api/bw3/focus", { conversationId: id }).catch(() => {});
      for (const r of d.runs) if (!TERMINAL.includes(r.state)) this.watch(r.id);
      this.refreshList().catch(() => {});
      if (this.view === "tree") this.graph.load(id);
      this.syncButtons();
    },
    renderMessages() {
      const box = $(".b3-msgs", this.root);
      if (!this.conv || !this.conv.messages.length) {
        box.innerHTML = `<div class="b3-hero"><div class="b3-eyebrow">Brickwire 3.0</div><h1>Что построим сегодня?</h1><p class="b3-muted">Опишите игру, механику, интерфейс или 3D-объект. Brickwire подберёт Skills, составит план, выполнит его и покажет каждый шаг.</p><div class="b3-chips">${GENRES.map((g) => `<button class="b3-chip">${esc(g)}</button>`).join("")}</div></div>`;
        box.querySelectorAll(".b3-chip").forEach((b) => (b.onclick = () => { const i = $("#b3-in", this.root); i.value = b.textContent; i.focus(); this.preview(); }));
        return;
      }
      box.innerHTML = ""; for (const m of this.conv.messages) box.appendChild(this.msgEl(m));
      box.scrollTop = box.scrollHeight;
    },
    msgEl(m) {
      if (m.role === "user") { const el=h(`<div class="b3-msg user" id="m-${m.id}"><div class="b3-bubble">${esc(m.text)}</div></div>`); window.BrickwireAttachments.render($(".b3-bubble",el),m.attachments); return el; }
      const run = m.runId ? this.runs[m.runId] : null;
      const el = h(`<div class="b3-msg bot" id="m-${m.id}" data-run="${m.runId || ""}"><div class="b3-avatar">B</div><div class="b3-body"></div></div>`);
      this.fillBot(el, m, run); return el;
    },
    fillBot(el, m, run) {
      const body = $(".b3-body", el);
      const keep = new Map([...body.querySelectorAll(":scope > .b3-art")].map((x) => [x.dataset.artifact, x])); // keep open 3D viewers
      body.innerHTML = "";
      if (run) {
        const sel = run.skills?.selected || [];
        if (sel.length) body.appendChild(h(`<div class="b3-skillrow">${sel.map((s) => `<span class="b3-skill ${s.role}" title="${esc(s.id + " — " + s.reason + (s.missingTools?.length ? " · нет инструментов: " + s.missingTools.join(", ") : ""))}">${esc(s.title)}<i>${esc(s.role)}</i></span>`).join("")}</div>`));
        body.appendChild(this.progressEl(run));
      }
      if (m.source) body.appendChild(h(`<div class="b3-srcrow"><span class="b3-badge ok">${m.source === "blender" ? "Blender" : m.source === "figma" ? "Figma" : esc(m.source)}</span></div>`));
      const text = m.text || (run && this.partial[run.id]) || "";
      if (text) { const t = h(`<div class="b3-text"></div>`); t.innerHTML = md(text); body.appendChild(t); }
      if (m.attachments?.length) {
        const pics = m.attachments.filter((a) => a.kind === "image"), other = m.attachments.filter((a) => a.kind !== "image");
        if (pics.length) { const g = h(`<div class="b3-resimgs"></div>`); for (const a of pics) { const img = h(`<img class="b3-resimg" alt="${esc(a.name)}" title="${esc(a.name)}">`); resImage(a.id).then((u) => (img.src = u)).catch(() => img.remove()); img.onclick = () => modal(a.name, `<img src="${img.src}" style="max-width:100%">`); g.appendChild(img); } body.appendChild(g); }
        if (other.length) window.BrickwireAttachments.render(body, other);
      }
      else if (run && !TERMINAL.includes(run.state)) body.appendChild(h(`<div class="b3-typing"><i></i><i></i><i></i></div>`));
      for (const id of m.artifacts || run?.artifacts || []) { const a = this.arts[id]; if (a) body.appendChild(keep.get(id) || artifactCard(a, { autoOpen: (m.artifacts || []).at(-1) === id && TERMINAL.includes(run?.state) && id === this.lastArt })); }
      if (m.actions?.length) {
        const bar = h(`<div class="b3-resactions">${m.actions.map((x, i) => `<button class="${i ? "" : "primary"}" data-i="${i}">${esc(x.label)}</button>`).join("")}<span class="b3-small b3-muted b3-resnote"></span></div>`);
        const note = (t, bad) => { const n = $(".b3-resnote", bar); n.textContent = t; n.classList.toggle("b3-errtext", !!bad); };
        bar.onclick = async (e) => { const b = e.target.closest("button[data-i]"); if (!b || b.disabled) return; b.disabled = true; try { note("Выполняю…"); const env = await api(`/api/bw3/chats/${this.conv.id}/action`, { messageId: m.id, index: Number(b.dataset.i) }); const r = await runCall(env, note); note(r?.status === "success" ? "Готово ✓ " + resultSummary(r.result) : "Не выполнено: " + (r?.error || "нет ответа"), r?.status !== "success"); } catch (er) { note(er.message, true); } finally { b.disabled = false; } };
        body.appendChild(bar);
      }
      if (run && TERMINAL.includes(run.state)) {
        const act = h(`<div class="b3-actions"><span class="b3-badge ${run.state === "done" ? "ok" : run.state === "partial" ? "warn" : "bad"}">${STATE_RU[run.state] || run.state}</span>${run.model ? `<span class="b3-muted b3-small">${esc(run.model)}</span>` : ""}<span class="b3-muted b3-small">${esc(run.path)}</span><button class="quiet" data-x="retry">Повторить</button><button class="quiet" data-x="tree">В дереве</button><button class="quiet" data-x="copy">Копировать</button></div>`);
        act.onclick = async (e) => { const x = e.target.dataset.x; if (x === "retry") { const r = await api(`/api/bw3/runs/${run.id}/retry`, {}).catch((er) => toast(er.message, true)); if (r) this.open(this.conv.id); } if (x === "tree") { go3("devtree"); Tree.show({ conversation: this.conv.id }, `run:${run.id}`); } if (x === "copy") navigator.clipboard?.writeText(m.text || ""); };
        body.appendChild(act);
      }
    },
    progressEl(run) {
      const ev = (this.events[run.id] || []);
      const live = !TERMINAL.includes(run.state);
      const steps = run.plan || [];
      const done = steps.filter((s) => s.state === "done").length;
      const el = h(`<details class="b3-progress ${live ? "live" : ""}" ${live ? "open" : ""}><summary><span class="b3-stage">${live ? '<span class="b3-spin"></span>' : ""}${esc(STAGE_RU[run.stage] || run.stage)}</span><span class="b3-muted b3-small">${steps.length ? `шагов: ${done}/${steps.length}` : ""}${run.settings?.mode === "super" ? " · Super" + (run.iterations ? " · итерация " + run.iterations : "") : ""}</span>${live ? '<button class="quiet b3-stop">Отменить</button>' : ""}</summary>
        <div class="b3-steps">${steps.map((s) => `<div class="b3-step ${s.state}"><i></i><span>${esc(s.title)}</span>${s.deps?.length ? `<em>← ${esc(s.deps.join(", "))}</em>` : ""}</div>`).join("")}</div>
        <div class="b3-evlog">${ev.slice(-40).map((e) => `<div class="b3-ev ${e.type}"><time>${fmtT(e.at)}</time><b>${esc(e.title)}</b>${e.detail ? `<span>${esc(String(e.detail).slice(0, 400))}</span>` : ""}${e.type === "approval" && e.data?.approvalId && run.state === "waiting_approval" ? `<button class="primary b3-appr" data-id="${e.data.approvalId}" data-ok="1">Разрешить</button><button class="b3-appr" data-id="${e.data.approvalId}" data-ok="0">Отклонить</button>` : ""}</div>`).join("")}</div>
        ${run.verification?.length ? `<div class="b3-verif">${run.verification.map((v) => `<span class="b3-badge ${v.ok ? "ok" : "bad"}" title="${esc(v.notes)}">${esc(v.by)} #${v.pass}: ${v.ok ? "ok" : "замечания"}</span>`).join("")}</div>` : ""}
        ${run.error ? `<div class="b3-err">${esc(run.error)}</div>` : ""}</details>`);
      el.addEventListener("toggle", async () => { if (el.open && !(this.events[run.id] || []).length) { await this.loadEvents(run.id); const m = this.conv?.messages.find((x) => x.runId === run.id); const node = m && document.getElementById("m-" + m.id); if (node) { this.fillBot(node, m, this.runs[run.id]); const d = $(".b3-progress", node); if (d) d.open = true; } } });
      el.querySelector(".b3-stop")?.addEventListener("click", (e) => { e.preventDefault(); api(`/api/bw3/runs/${run.id}/cancel`, {}).catch((er) => toast(er.message, true)); });
      el.querySelectorAll(".b3-appr").forEach((b) => (b.onclick = () => api("/api/bw3/approve", { runId: run.id, approvalId: b.dataset.id, approve: b.dataset.ok === "1" }).catch((er) => toast(er.message, true))));
      return el;
    },
    async loadEvents(runId) { const d = await api(`/api/bw3/runs/${runId}`); this.events[runId] = d.run.events; this.runs[runId] = { ...this.runs[runId], ...d.run }; return d.run; },
    watch(runId) {
      if (this.stops.has(runId)) return;
      const convId = this.conv?.id;
      this.events[runId] = this.events[runId] || [];
      const mine = () => this.conv?.id === convId && this.stops.has(runId);
      const node = () => { const m = this.conv?.messages.find((x) => x.runId === runId); const el = m && document.getElementById("m-" + m.id); return el ? { m, el } : null; };
      let full = false;
      const rerender = () => {
        if (!mine() && !full) return;
        const n = node(); if (!n) return;
        const box = $(".b3-msgs", this.root), stick = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        const textEl = $(".b3-body > .b3-text", n.el), typing = $(".b3-body > .b3-typing", n.el);
        if (!full && (textEl || typing) && !n.m.text) {
          // text-only update: patch the reply in place instead of rebuilding cards / viewers on every token
          const t = this.partial[runId] || "";
          if (t) { let te = textEl; if (!te) { te = h(`<div class="b3-text"></div>`); typing.replaceWith(te); } te.innerHTML = md(t); }
        } else {
          const det = $(".b3-progress", n.el), wasOpen = det ? det.open : true, log = det && $(".b3-evlog", det), logTop = log ? log.scrollTop : 0;
          this.fillBot(n.el, n.m, this.runs[runId]);
          const nd = $(".b3-progress", n.el); if (nd && !TERMINAL.includes(this.runs[runId]?.state)) { nd.open = wasOpen; const nl = $(".b3-evlog", nd); if (nl) nl.scrollTop = logTop; }
        }
        full = false;
        if (stick) box.scrollTop = box.scrollHeight;
      };
      let raf = 0; const schedule = (isFull) => { if (isFull) full = true; if (!raf) raf = requestAnimationFrame(() => { raf = 0; try { rerender(); } catch (e) { console.warn("[bw3] render", e); } }); };
      const reloadConv = async () => { const c = await api(`/api/bw3/chats/${convId}`); if (this.conv?.id !== convId) return null; this.conv = c.conversation; this.arts = Object.fromEntries(c.artifacts.map((a) => [a.id, a])); c.runs.forEach((r) => (this.runs[r.id] = r)); return c; };
      const stop = follow(runId, 0, async (ev, d) => {
        if (this.conv?.id !== convId) return;
        if (ev === "events") { this.events[runId] = [...(this.events[runId] || []), ...d.events].slice(-300); schedule(true); }
        else if (ev === "run") { this.runs[runId] = { ...this.runs[runId], ...d }; schedule(true); }
        else if (ev === "delta") { if (d.text === null) return; this.partial[runId] = (this.partial[runId] || "") + d.text; schedule(false); }
        else if (ev === "partial") { if (this.partial[runId] === d.text) return; this.partial[runId] = d.text; schedule(false); }
        if (ev === "end") {
          this.stops.delete(runId);
          if (this.runs[runId] && d.state) this.runs[runId] = { ...this.runs[runId], state: d.state };
          try { const c = await reloadConv(); if (!c) return; this.lastArt = this.runs[runId]?.artifacts?.at(-1); delete this.partial[runId]; }
          catch (e) { toast("Не удалось обновить чат: " + e.message, true); }
          this.syncButtons(); this.renderList(); schedule(true); this.refreshTreeIfOpen(); this.refreshList().catch(() => {});
          return;
        }
        if (ev === "events" && d.events.some((e) => e.stage === "REGISTERED" || e.type === "result")) { try { await reloadConv(); schedule(true); } catch { /* next event retries */ } }
        if (ev === "events") this.refreshTreeIfOpen();
      });
      this.stops.set(runId, stop);
    },
    refreshTreeIfOpen() { clearTimeout(this._rt); this._rt = setTimeout(() => this._refreshTree(), 700); },
    _refreshTree() { if (!document.getElementById("devtree")?.classList.contains("hide")) { if (Tree.view === "graph") Tree.graph?.load(Tree.scope.conversation); else Tree.reload(); } if (this.view === "tree") this.graph?.load(this.conv?.id); },
    busy() { return Object.values(this.runs || {}).some((r) => r && !TERMINAL.includes(r.state)); },
    syncButtons() { if (!this.root) return; const active = this.busy(); $(".b3-cancel", this.root).classList.toggle("hide", !active); const b = $(".b3-send", this.root); b.disabled = active || this.sending; b.textContent = this.sending ? "Отправка…" : "Отправить"; },
    async cancelActive() { for (const r of Object.values(this.runs)) if (!TERMINAL.includes(r.state)) await api(`/api/bw3/runs/${r.id}/cancel`, {}).catch((e) => toast(e.message, true)); },
    async preview() {
      const t = $("#b3-in", this.root).value.trim(), box = $(".b3-skillpreview", this.root);
      if (t.length < 4 || !$("#b3-auto", this.root).checked) { box.innerHTML = ""; return; }
      try { const d = await api("/api/bw3/skills/route", { text: t, superMode: this.settings().mode === "super" }); box.innerHTML = d.selection.selected.length ? `<span class="b3-muted b3-small">Skills:</span> ${d.selection.selected.map((s) => `<span class="b3-skill ${s.role}" title="${esc(s.reason)}">${esc(s.title)}</span>`).join("")}<span class="b3-muted b3-small">· ${esc(d.selection.intent?.label || "")}</span>` : `<span class="b3-muted b3-small">Skills не подобраны</span>`; } catch { box.innerHTML = ""; }
    },
    async send(extra = {}) {
      const inp = $("#b3-in", this.root), text = inp.value.trim();
      if (this.sending || !this.files.ready() || (!text && !this.files.ids().length)) return;
      if (this.busy()) { toast("Дождитесь окончания текущего ответа или нажмите «Отменить» — текст сохранён в поле ввода."); return; }
      this.sending = true; this.files.lock(true); this.syncButtons();
      const tok = this.openTok;
      try {
        if (!this.conv) {
          const d = await api("/api/bw3/chats", { title: (text || "Файлы").slice(0, 60) });
          this.conv = d.conversation; this.runs = {}; this.events = {}; this.partial = {};
        }
        const convId = this.conv.id;
        const d = await api(`/api/bw3/chats/${convId}/send`, { text, attachments: this.files.ids(), settings: this.settings(), ...(extra.fromRun ? { fromRun: extra.fromRun } : {}) });
        this.files.reset(); if (inp.value.trim() === text) { inp.value = ""; inp.style.height = ""; } $(".b3-skillpreview", this.root).innerHTML = "";
        if (this.conv?.id === convId && tok === this.openTok) {
          this.conv = d.conversation; this.runs[d.run.id] = d.run; this.events[d.run.id] = [];
          this.renderMessages(); this.watch(d.run.id);
          const box = $(".b3-msgs", this.root); box.scrollTop = box.scrollHeight;
        }
        this.refreshList().catch(() => {});
      } catch (e) { toast(e.message, true); }
      finally { this.sending = false; this.files.lock(false); this.syncButtons(); }
    },
    view: "chat",
    setView(v) {
      this.view = v; this.root.querySelectorAll(".b3-cviews button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
      $(".b3-msgs", this.root).classList.toggle("hide", v !== "chat"); $(".b3-chatgraph", this.root).classList.toggle("hide", v !== "tree");
      if (v === "tree") this.graph.load(this.conv?.id);
    },
    async refreshList() { const c = (await api("/api/bw3/chats")).conversations; if (this.state) { this.state.conversations = c; this.renderList(); } },
    async jump(conversationId, messageId) { if (this.conv?.id !== conversationId) await this.open(conversationId); const el = document.getElementById("m-" + messageId); if (el) { el.scrollIntoView({ block: "center" }); el.classList.add("b3-flash"); setTimeout(() => el.classList.remove("b3-flash"), 1600); } },
  };


  // ===================================================================== Per-chat graph (Development Tree canvas)
  const G_ST = { done: "готово", partial: "частично", running: "выполняется", queued: "в очереди", waiting_approval: "ждёт подтверждения", blocked: "заблокировано", failed: "ошибка", cancelled: "отменено", interrupted: "прервано", planned: "предложено", info: "чат" };
  function makeGraph(el, opts = {}) {
    el.innerHTML = `<div class="b3-graph"><div class="b3-gworld"><svg class="b3-gsvg"></svg><div class="b3-gnodes"></div></div><div class="b3-gctl"><button class="quiet" data-z="in" title="Zoom in">+</button><button class="quiet" data-z="out" title="Zoom out">−</button><button class="quiet" data-z="fit" title="Fit">Fit</button></div><div class="b3-gnote b3-small b3-muted"></div><div class="b3-gpop hide"></div></div>`;
    const wrap = $(".b3-graph", el), world = $(".b3-gworld", el), svg = $(".b3-gsvg", el), layer = $(".b3-gnodes", el), pop = $(".b3-gpop", el);
    const st = { x: 0, y: 0, k: 1, data: null, conv: null, timer: null, fitted: false, sel: null };
    const apply = () => { world.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.k})`; wrap.style.backgroundPosition = `${st.x}px ${st.y}px`; wrap.style.backgroundSize = `${22 * st.k}px ${22 * st.k}px`; };
    const zoomAt = (f, cx, cy) => { const k = Math.min(2.2, Math.max(0.35, st.k * f)); st.x = cx - (cx - st.x) * (k / st.k); st.y = cy - (cy - st.y) * (k / st.k); st.k = k; apply(); };
    wrap.addEventListener("wheel", (e) => { e.preventDefault(); const r = wrap.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    let drag = null;
    wrap.addEventListener("pointerdown", (e) => { if (e.target.closest(".b3-gn,.b3-gctl,.b3-gpop,button")) return; drag = { x: e.clientX - st.x, y: e.clientY - st.y }; wrap.setPointerCapture(e.pointerId); wrap.classList.add("drag"); pop.classList.add("hide"); st.sel = null; });
    wrap.addEventListener("pointermove", (e) => { if (!drag) return; st.x = e.clientX - drag.x; st.y = e.clientY - drag.y; apply(); });
    wrap.addEventListener("pointerup", () => { drag = null; wrap.classList.remove("drag"); });
    $(".b3-gctl", el).onclick = (e) => { const z = e.target.dataset.z; const r = wrap.getBoundingClientRect(); if (z === "in") zoomAt(1.2, r.width / 2, r.height / 2); if (z === "out") zoomAt(1 / 1.2, r.width / 2, r.height / 2); if (z === "fit") fit(); };
    let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };
    function fit() { const r = wrap.getBoundingClientRect(); if (!r.width) return; const w = bounds.maxX - bounds.minX + 260, hgt = bounds.maxY - bounds.minY + 200; st.k = Math.min(1.25, Math.max(0.6, Math.min(r.width / w, r.height / hgt))); st.x = r.width / 2 - ((bounds.minX + bounds.maxX) / 2) * st.k; st.y = Math.max(20, r.height / 2 - ((bounds.minY + bounds.maxY) / 2) * st.k); apply(); }
    function layout(nodes) {
      const kids = new Map(nodes.map((n) => [n.id, []])); for (const n of nodes) if (n.parent && kids.has(n.parent)) kids.get(n.parent).push(n);
      const W = (n) => (n.kind === "suggestion" ? 200 : 150), pos = new Map();
      const width = (n) => { const c = kids.get(n.id); n._w = c.length ? Math.max(W(n), c.reduce((a, x) => a + width(x), 0)) : W(n); return n._w; };
      const place = (n, x0, d) => { pos.set(n.id, { x: x0 + n._w / 2, y: d * 150 + (n.kind === "suggestion" ? 18 : 0) }); let x = x0; for (const c of kids.get(n.id)) { place(c, x, d + 1); x += c._w; } };
      const root = nodes.find((n) => !n.parent); width(root); place(root, -root._w / 2, 0);
      return pos;
    }
    function edgePath(a, b, fromRoot) { const y1 = a.y + (fromRoot ? 40 : 68), y2 = b.y - 30, m = (y1 + y2) / 2; return `M${a.x},${y1} C${a.x},${m} ${b.x},${m} ${b.x},${y2}`; }
    function render() {
      const d = st.data; if (!d) return; const pos = layout(d.nodes);
      const xs = [...pos.values()].map((p) => p.x), ys = [...pos.values()].map((p) => p.y);
      bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
      svg.setAttribute("width", 10); svg.setAttribute("height", 10);
      svg.innerHTML = `<defs><marker id="b3arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#7cc6d6"/></marker></defs>` + d.edges.map((e) => { const a = pos.get(e.from), b = pos.get(e.to); if (!a || !b) return ""; return `<path class="b3-ge ${e.style}" d="${edgePath(a, b, e.from === "root")}" ${e.style === "chain" ? 'marker-end="url(#b3arrow)"' : ""}/>${e.style === "suggest" ? `<circle class="b3-gedot" cx="${b.x}" cy="${b.y - 30}" r="3"/>` : ""}`; }).join("");
      layer.innerHTML = "";
      for (const n of d.nodes) {
        const p = pos.get(n.id); let node;
        if (n.kind === "suggestion") {
          node = h(`<div class="b3-gn b3-gsug ${n.best ? "best" : ""}" style="left:${p.x}px;top:${p.y}px"><div class="b3-gsrow"><span class="b3-hex sm"><span>${esc(n.kind === "chat" ? "AI" : n.kind === "suggestion" ? "+" : n.status === "blocked" ? "!" : "OBJ")}</span></span><div>${n.best ? '<div class="b3-gbest">Best next move</div>' : ""}<div class="b3-gstitle">${esc(n.title)}</div></div></div><button class="b3-gadd">Add</button></div>`);
          $(".b3-gadd", node).onclick = (e) => { e.stopPropagation(); act(n, e.target); };
          node.title = n.action?.prompt || n.title;
        } else if (n.kind === "chat") {
          node = h(`<div class="b3-gn b3-groot" style="left:${p.x}px;top:${p.y}px"><span class="b3-hex lg"><span>${esc(n.kind === "chat" ? "AI" : n.kind === "suggestion" ? "+" : n.status === "blocked" ? "!" : "OBJ")}</span></span><div class="b3-gpill"><b>${esc(n.title)}</b><button class="quiet b3-gren" title="Переименовать">✎</button></div></div>`);
          $(".b3-gren", node).onclick = async (e) => { e.stopPropagation(); const t = prompt("Название чата", n.title); if (t && t.trim()) { await api(`/api/bw3/chats/${st.conv}/rename`, { title: t.trim() }).catch((er) => toast(er.message, true)); load(st.conv); Chat.refreshList?.().catch(() => {}); } };
        } else {
          const badge = n.status === "done" ? '<i class="b3-gok">✓</i>' : n.status === "partial" ? '<i class="b3-gwarn">!</i>' : /failed|blocked|cancelled|interrupted/.test(n.status) ? '<i class="b3-gbad">✕</i>' : "";
          node = h(`<div class="b3-gn b3-gres g-${n.status}" style="left:${p.x}px;top:${p.y}px"><span class="b3-hex ${/running|queued|waiting/.test(n.status) ? "live" : ""}"><span>${esc(n.kind === "chat" ? "AI" : n.kind === "suggestion" ? "+" : n.status === "blocked" ? "!" : "OBJ")}</span>${badge}</span><div class="b3-glabel">${esc(n.title)}</div>${n.subtitle ? `<div class="b3-gsub">${esc(n.subtitle)}</div>` : ""}</div>`);
          node.onclick = (e) => { e.stopPropagation(); inspect(n, node); };
        }
        if (st.sel === n.id) node.classList.add("sel");
        layer.appendChild(node);
      }
      $(".b3-gnote", el).textContent = `${d.nodes.filter((n) => n.kind !== "suggestion" && n.kind !== "chat").length} результатов · предложения — по правилам, выполняются только по Add`;
      const sig = d.nodes.length; if (!st.fitted || st.sig !== sig) { st.fitted = true; st.sig = sig; requestAnimationFrame(fit); }
    }
    function inspect(n, nodeEl) {
      st.sel = n.id; layer.querySelectorAll(".b3-gn.sel").forEach((x) => x.classList.remove("sel")); nodeEl.classList.add("sel");
      if (opts.onSelect) return opts.onSelect(n);
      const r = nodeEl.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
      pop.innerHTML = `<b>${esc(n.title)}</b><div class="b3-small b3-muted">${esc(G_ST[n.status] || n.status)}${n.subtitle ? " · " + esc(n.subtitle) : ""}</div><div class="b3-tools"></div>`;
      graphActions(n, $(".b3-tools", pop), st.conv);
      pop.style.left = Math.min(wr.width - 260, r.right - wr.left + 10) + "px"; pop.style.top = Math.max(8, r.top - wr.top - 10) + "px"; pop.classList.remove("hide");
    }
    async function act(n, btn) {
      btn.disabled = true; btn.textContent = "…";
      try {
        const a = n.action || {};
        if (a.type === "send") { go3("chats"); if (Chat.conv?.id !== st.conv) await Chat.open(st.conv); const i = $("#b3-in"); i.value = a.prompt; await Chat.send({ fromRun: st.data.nodes.find((x) => x.id === n.parent)?.ref?.runId }); }
        else if (a.type === "variant") { const r = await api(`/api/bw3/artifacts/${a.artifactId}/regenerate`, { variant: true, settings: Chat.settings() }); toast("Генерирую вариант…"); if (r.conversationId === Chat.conv?.id) Chat.open(r.conversationId); }
        else if (a.type === "studio") { const d = await api(`/api/bw3/artifacts/${a.artifactId}`); await sendToStudio(d.artifact, null); }
        setTimeout(() => load(st.conv), 600);
      } catch (e) { toast(e.message, true); } finally { btn.disabled = false; btn.textContent = "Add"; }
    }
    async function load(conv) {
      if (conv !== st.conv) { st.fitted = false; st.sel = null; pop.classList.add("hide"); }
      st.conv = conv; if (!conv) { layer.innerHTML = `<div class="b3-gempty b3-muted">Выберите чат — у каждого чата своё дерево.</div>`; svg.innerHTML = ""; return; }
      try { st.data = await api(`/api/bw3/chats/${conv}/graph`); render(); } catch (e) { layer.innerHTML = `<div class="b3-gempty b3-errtext">${esc(e.message)}</div>`; }
      clearInterval(st.timer);
      if (st.data?.nodes.some((n) => /running|queued|waiting/.test(n.status))) st.timer = setTimeout(() => { if (el.isConnected && el.offsetParent) load(st.conv); }, 2000);
    }
    return { load, fit, get conv() { return st.conv; } };
  }
  function graphActions(n, tools, conv) {
    const r = n.ref || {};
    if (r.messageId) { const b = h(`<button>Открыть сообщение</button>`); b.onclick = () => { go3("chats"); Chat.setView?.("chat"); Chat.jump(conv, r.messageId); }; tools.appendChild(b); }
    if (r.artifactId) { const b = h(`<button>Открыть 3D-просмотр</button>`); b.onclick = async () => { const d = await api(`/api/bw3/artifacts/${r.artifactId}`); modal(d.artifact.name, artifactCard(d.artifact)); }; tools.appendChild(b); }
    if (r.runId) { const b = h(`<button>Шаги и вызовы</button>`); b.onclick = () => { go3("devtree"); Tree.show({ run: r.runId }); }; tools.appendChild(b); }
  }
  // ===================================================================== Development Tree
  const ST_RU = { planned: "запланировано", running: "выполняется", waiting: "ждёт", done: "готово", failed: "ошибка", blocked: "заблокировано", partial: "частично", cancelled: "отменено", info: "инфо", warning: "внимание" };
  const Tree = {
    root: null, scope: {}, data: null, open: new Set(["root"]), sel: null, timer: null,
    async mount(root) {
      this.root = root;
      root.innerHTML = `<div class="b3 b3-tree"><div class="b3-treebar"><select class="b3-tscope"></select><div class="b3-mode b3-tviews" role="group"><button data-v="graph" class="on">Граф</button><button data-v="list">Детали</button></div><span class="b3-tlist-only"><input class="b3-tq" placeholder="Поиск узлов: инструмент, файл, ошибка…"><select class="b3-tf"><option value="">Все статусы</option>${Object.entries(ST_RU).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select><button class="quiet b3-texp">Развернуть всё</button><button class="quiet b3-tcol">Свернуть</button></span><span class="b3-grow"></span><span class="b3-muted b3-small b3-tcount"></span></div><div class="b3-tgraph"></div><div class="b3-tsplit hide"><div class="b3-tview"></div><div class="b3-tinspect b3-muted">Выберите узел, чтобы увидеть детали.</div></div></div>`;
      this.graph = makeGraph($(".b3-tgraph", root));
      $(".b3-tscope", root).onchange = (e) => this.show({ conversation: e.target.value });
      $(".b3-tviews", root).onclick = (e) => { const v = e.target.dataset.v; if (v) this.setView(v); };
      $(".b3-tq", root).oninput = () => this.render(); $(".b3-tf", root).onchange = () => this.render();
      $(".b3-texp", root).onclick = () => { const all = (n) => { this.open.add(n.id); n.children.forEach(all); }; all(this.data.tree); this.render(); };
      $(".b3-tcol", root).onclick = () => { this.open = new Set([this.data.tree.id]); this.render(); };
    },
    view: "graph",
    setView(v) {
      this.view = v; this.root.querySelectorAll(".b3-tviews button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
      $(".b3-tgraph", this.root).classList.toggle("hide", v !== "graph"); $(".b3-tsplit", this.root).classList.toggle("hide", v !== "list"); $(".b3-tlist-only", this.root).classList.toggle("hide", v !== "list");
      if (v === "graph") { this.graph.load(this.scope.conversation); $(".b3-tcount", this.root).textContent = ""; } else this.reload();
    },
    async show(scope = {}, focus) {
      const cs = (await api("/api/bw3/chats")).conversations;
      if (!scope.conversation && !scope.run && !scope.task) scope = { conversation: Chat.conv?.id || cs[0]?.id };
      this.scope = scope;
      $(".b3-tscope", this.root).innerHTML = (cs.length ? "" : `<option value="">Чатов пока нет</option>`) + cs.map((c) => `<option value="${c.id}" ${scope.conversation === c.id ? "selected" : ""}>${esc(c.title)}</option>`).join("") + (scope.run ? `<option selected value="">Запуск ${esc(scope.run)}</option>` : "");
      if (scope.conversation && !focus) { this.setView("graph"); return; }
      this.view = "list"; this.root.querySelectorAll(".b3-tviews button").forEach((b) => b.classList.toggle("on", b.dataset.v === "list")); $(".b3-tgraph", this.root).classList.add("hide"); $(".b3-tsplit", this.root).classList.remove("hide"); $(".b3-tlist-only", this.root).classList.remove("hide");
      await this.reload();
      if (focus) { this.open.add(this.data.tree.id); this.open.add(focus); const f = this.find(this.data.tree, focus); if (f) { this.sel = focus; f.children.forEach((c) => this.open.add(c.id)); } this.render(); document.querySelector(`[data-node="${CSS.escape(focus)}"]`)?.scrollIntoView({ block: "center" }); }
      clearInterval(this.timer); this.timer = setInterval(() => { if (document.getElementById("devtree")?.classList.contains("hide") || this.view !== "list") return clearInterval(this.timer); if (this.hasLive(this.data?.tree)) this.reload(); }, 2500);
    },
    hasLive(n) { return !!n && (n.status === "running" || n.status === "waiting" || n.children.some((c) => this.hasLive(c))); },
    async reload() {
      const q = this.scope.conversation ? `?conversation=${this.scope.conversation}` : this.scope.run ? `?run=${this.scope.run}` : this.scope.task ? `?task=${this.scope.task}` : "";
      this.data = await api("/api/bw3/devtree" + q); this.open.add(this.data.tree.id);
      if (this.data.tree.type === "conversation") this.data.tree.children.slice(-1).forEach((c) => this.open.add(c.id));
      $(".b3-tcount", this.root).textContent = `${this.data.nodes} узлов · обновлено ${fmtT(this.data.generatedAt)}`; this.render();
    },
    find(n, id) { if (n.id === id) return n; for (const c of n.children) { const f = this.find(c, id); if (f) return f; } return null; },
    match(n, q, f) { const self = (!q || (n.title + " " + (n.detail || "") + " " + n.type).toLowerCase().includes(q)) && (!f || n.status === f); return self || n.children.some((c) => this.match(c, q, f)); },
    render() {
      const q = $(".b3-tq", this.root).value.trim().toLowerCase(), f = $(".b3-tf", this.root).value, filtering = !!(q || f);
      const row = (n, d) => {
        if (filtering && !this.match(n, q, f)) return "";
        const kids = n.children.length, isOpen = filtering || this.open.has(n.id);
        return `<div class="b3-node ${this.sel === n.id ? "sel" : ""}" data-node="${esc(n.id)}" style="--d:${d}"><span class="b3-tw">${kids ? (isOpen ? "▾" : "▸") : ""}</span><span class="b3-st ${n.status}" title="${ST_RU[n.status] || n.status}"></span><span class="b3-ntype">${esc(n.type)}</span><span class="b3-ntitle">${esc(n.title)}</span>${kids ? `<span class="b3-nk">${kids}</span>` : ""}</div>` + (kids && isOpen ? n.children.map((c) => row(c, d + 1)).join("") : "");
      };
      const v = $(".b3-tview", this.root); v.innerHTML = this.data ? row(this.data.tree, 0) : "";
      v.querySelectorAll(".b3-node").forEach((el) => (el.onclick = (e) => { const id = el.dataset.node; if (e.target.classList.contains("b3-tw")) { this.open.has(id) ? this.open.delete(id) : this.open.add(id); } else { this.sel = id; this.open.add(id); this.inspect(this.find(this.data.tree, id)); } this.render(); }));
      if (this.sel) { const n = this.find(this.data.tree, this.sel); if (n) this.inspect(n); }
    },
    inspect(n) {
      const box = $(".b3-tinspect", this.root); box.classList.remove("b3-muted");
      const r = n.ref || {};
      box.innerHTML = `<div class="b3-ihead"><span class="b3-st ${n.status}"></span><b>${esc(n.title)}</b></div><div class="b3-small b3-muted">${esc(n.type)} · ${ST_RU[n.status] || n.status}${n.at ? " · " + new Date(n.at).toLocaleString() : ""}</div><div class="b3-small b3-mono">${esc(n.id)}</div>${n.detail ? `<pre class="b3-idetail">${esc(n.detail)}</pre>` : ""}<div class="b3-tools"></div><div class="b3-iart"></div>`;
      const tools = $(".b3-tools", box);
      if (r.conversationId && r.messageId) { const b = h(`<button>Открыть сообщение</button>`); b.onclick = () => { go3("chats"); Chat.jump(r.conversationId, r.messageId); }; tools.appendChild(b); }
      if (r.artifactId) { api(`/api/bw3/artifacts/${r.artifactId}`).then((d) => { $(".b3-iart", box).appendChild(artifactCard(d.artifact)); if (r.file) { const b = h(`<button>Скачать ${esc(r.file)}</button>`); b.onclick = () => download(d.artifact.id, d.artifact.name, r.file); tools.appendChild(b); } }).catch(() => {}); }
      if (r.skillId) { const b = h(`<button>Открыть Skill</button>`); b.onclick = () => Skills.detail(r.skillId); tools.appendChild(b); }
      if (r.runId && n.type === "goal") { const b = h(`<button>Только этот запуск</button>`); b.onclick = () => this.show({ run: r.runId }, n.id); tools.appendChild(b); }
    },
  };

  // ===================================================================== Generated assets (Asset Library)
  const Assets = {
    async mount(root) {
      root.innerHTML = `<div class="b3 b3-assets"><div class="b3-sechead"><div><div class="b3-eyebrow">Brickwire 3.0 · Asset Forge</div><h2>Сгенерированные 3D-модели</h2></div><span class="b3-grow"></span><input class="b3-aq" placeholder="Поиск: дракон, sword…"><button class="b3-anew primary">Создать модель</button></div><div class="b3-agrid"></div></div>`;
      $(".b3-aq", root).oninput = () => this.render(root); $(".b3-anew", root).onclick = () => { go3("chats"); const i = $("#b3-in"); if (i) { i.value = "Сгенерируй "; i.focus(); } };
      this.list = (await api("/api/bw3/artifacts")).artifacts; this.render(root);
    },
    render(root) {
      const q = ($(".b3-aq", root).value || "").toLowerCase(), g = $(".b3-agrid", root);
      const items = this.list.filter((a) => !q || (a.name + " " + a.request + " " + a.tags.join(" ")).toLowerCase().includes(q));
      g.innerHTML = items.length ? "" : `<div class="b3-muted">Пока нет сгенерированных моделей. Попросите в чате, например: «Сгенерируй японского дракона».</div>`;
      for (const a of items) { const c = h(`<div class="b3-acard"><img alt="${esc(a.name)}"><div class="b3-acap"><b>${esc(a.name)}</b><span class="b3-small b3-muted">${a.stats.triangles} треуг. · ${a.stats.size.join("×")} studs</span>${a.studio?.length ? '<span class="b3-badge ok">в Studio</span>' : ""}</div></div>`); thumb($("img", c), a.id); c.onclick = () => modal(a.name, artifactCard(a, { autoOpen: true })); g.appendChild(c); }
    },
  };

  // ===================================================================== Skills registry
  const Skills = {
    root: null, data: null,
    async mount(root) {
      this.root = root;
      root.innerHTML = `<div class="b3 b3-skills"><div class="b3-sechead"><div><div class="b3-eyebrow">Brickwire 3.0 · Automatic Skills</div><h2>Реестр Skills</h2><p class="b3-muted b3-small">Skills подбираются автоматически по запросу; полные инструкции SKILL.md, общие правила и ссылки загружаются в контекст агента. Skills — инструкции, а не права: каждый вызов инструмента всё равно проходит реестр, подтверждения и привязку к проекту.</p></div></div>
        <div class="b3-skbar"><label class="b3-check"><input type="checkbox" class="b3-skauto"> Автоматический выбор</label><input class="b3-skq" placeholder="Поиск по названию, триггеру, инструменту"><select class="b3-skcat"><option value="">Все категории</option></select><select class="b3-skst"><option value="">Любой статус</option><option value="ready">ready</option><option value="partial">partial</option><option value="blocked">blocked</option><option value="invalid">invalid</option><option value="outdated">outdated</option><option value="disabled">выключены</option></select></div>
        <div class="b3-route"><input class="b3-rq" placeholder="Проверить маршрутизацию: например «сделай магазин с монетами»"><label class="b3-check"><input type="checkbox" class="b3-rsuper"> Super</label><button class="b3-rgo">Подобрать</button></div><div class="b3-rout"></div>
        <div class="b3-sklist"></div></div>`;
      $(".b3-skauto", root).onchange = async (e) => { await api("/api/bw3/skills/auto", { value: e.target.checked }); };
      for (const s of [".b3-skq", ".b3-skcat", ".b3-skst"]) $(s, root).addEventListener("input", () => this.render());
      $(".b3-rgo", root).onclick = () => this.route();
      $(".b3-rq", root).onkeydown = (e) => { if (e.key === "Enter") this.route(); };
      await this.reload();
    },
    async reload() {
      this.data = await api("/api/bw3/skills");
      $(".b3-skauto", this.root).checked = this.data.settings.autoSelect;
      const cats = [...new Set(this.data.skills.map((s) => s.category))].sort();
      $(".b3-skcat", this.root).innerHTML = `<option value="">Все категории (${this.data.skills.length})</option>` + cats.map((c) => `<option>${esc(c)}</option>`).join("");
      this.render();
    },
    render() {
      const q = $(".b3-skq", this.root).value.toLowerCase(), cat = $(".b3-skcat", this.root).value, st = $(".b3-skst", this.root).value;
      const list = this.data.skills.filter((s) => (!q || [s.id, s.title, s.description, ...(s.triggers || []), ...(s.tools || [])].join(" ").toLowerCase().includes(q)) && (!cat || s.category === cat) && (!st || (st === "disabled" ? !s.enabled : s.compatibility === st)));
      $(".b3-sklist", this.root).innerHTML = `<div class="b3-skhead"><span>Skill</span><span>Статус</span><span>Инструменты</span><span>Исп.</span><span></span></div>` + list.map((s) => `<div class="b3-skrow" data-id="${esc(s.id)}"><span><b>${esc(s.title)}</b><em class="b3-small b3-muted">${esc(s.id)} · v${esc(s.version)} · ${esc(s.category)}</em></span><span><span class="b3-badge ${s.compatibility === "ready" ? "ok" : s.compatibility === "partial" ? "warn" : "bad"}">${esc(s.compatibility)}</span>${s.validation?.warnings?.length ? `<span class="b3-small b3-muted" title="${esc(s.validation.warnings.join("\n"))}"> ⚠ ${s.validation.warnings.length}</span>` : ""}</span><span class="b3-small b3-muted">${(s.tools || []).length}${s.missingTools?.length ? ` <span class="b3-errtext">(нет: ${esc(s.missingTools.slice(0, 3).join(", "))}${s.missingTools.length > 3 ? "…" : ""})</span>` : ""}</span><span class="b3-small">${s.usageCount ?? 0}</span><span class="b3-skact"><label class="b3-switch" title="Включён"><input type="checkbox" data-en ${s.enabled ? "checked" : ""}><i></i></label><button class="quiet" data-pin>${s.pinned ? "★" : "☆"}</button><button class="quiet" data-open>Открыть</button></span></div>`).join("");
      this.root.querySelectorAll(".b3-skrow").forEach((r) => {
        const id = r.dataset.id;
        $("[data-en]", r).onchange = async (e) => { try { await api(`/api/bw3/skills/${id}/enable`, { enabled: e.target.checked }); await this.reload(); } catch (er) { toast(er.message, true); e.target.checked = !e.target.checked; } };
        $("[data-pin]", r).onclick = async () => { const s = this.data.skills.find((x) => x.id === id); await api(`/api/bw3/skills/${id}/pin`, { pinned: !s.pinned }); await this.reload(); };
        $("[data-open]", r).onclick = () => this.detail(id);
      });
    },
    async route() {
      const t = $(".b3-rq", this.root).value.trim(); if (!t) return;
      const d = await api("/api/bw3/skills/route", { text: t, superMode: $(".b3-rsuper", this.root).checked });
      $(".b3-rout", this.root).innerHTML = `<div class="b3-card"><div class="b3-small b3-muted">Намерение: ${esc(d.selection.intent?.label)} · загружено ${d.chars.toLocaleString()} символов инструкций</div>${d.selection.selected.map((s, i) => `<div class="b3-rrow"><span class="b3-skill ${s.role}">${i + 1}. ${esc(s.title)}<i>${s.role}</i></span><span class="b3-small">${esc(s.reason)}</span>${d.loaded.find((l) => l.id === s.id) ? `<span class="b3-small b3-muted">${d.loaded.find((l) => l.id === s.id).files.length} файл(ов)${d.loaded.find((l) => l.id === s.id).full ? "" : " · сокращено бюджетом"}</span>` : ""}</div>`).join("") || "<div>Ничего не подобрано</div>"}${d.selection.warnings.length ? `<div class="b3-small b3-errtext">${d.selection.warnings.map(esc).join("<br>")}</div>` : ""}${d.selection.rejected.length ? `<details class="b3-small"><summary>Отклонённые (${d.selection.rejected.length})</summary>${d.selection.rejected.slice(0, 20).map((r) => `<div>${esc(r.id)} — ${esc(r.reason)}</div>`).join("")}</details>` : ""}</div>`;
    },
    async detail(id) {
      const d = await api(`/api/bw3/skills/${id}`); const s = d.skill;
      const body = h(`<div class="b3-skdetail"><div class="b3-small b3-muted">${esc(s.id)} · v${esc(s.version)} · ${esc(s.category)} · пакет ${esc(s.pack)} · sha256 ${esc((s.sha256 || "").slice(0, 16))}…</div><p>${esc(s.description)}</p>
        <div class="b3-kv"><b>Триггеры</b><span>${(s.triggers || []).map(esc).join(", ") || "—"}</span><b>Область</b><span>${esc(s.scope)}</span><b>Инструменты</b><span>${(s.tools || []).map(esc).join(", ") || "—"}${s.missingTools?.length ? `<br><span class="b3-errtext">Недоступны: ${s.missingTools.map(esc).join(", ")}</span>` : ""}</span><b>Зависимости</b><span>${(s.dependencies || []).map(esc).join(", ") || "—"}</span><b>Конфликты</b><span>${(s.conflicts || []).map(esc).join(", ") || "—"}</span><b>Ограничения</b><span>${(s.limitations || []).map(esc).join("<br>") || "—"}</span><b>Критерии успеха</b><span>${(s.successCriteria || []).slice(0, 12).map(esc).join("<br>") || "—"}</span><b>Файлы</b><span>${[...(s.references || []), ...(s.templates || [])].map((f) => `${esc(f.rel)} (${f.bytes} B)`).join("<br>") || "—"}</span><b>Проверка</b><span>${s.validation?.ok ? "ok" : "ошибки: " + (s.validation?.errors || []).map(esc).join("; ")}${s.validation?.warnings?.length ? "<br>" + s.validation.warnings.map(esc).join("<br>") : ""}</span><b>История</b><span>${d.history.slice(0, 10).map((u) => `${new Date(u.at).toLocaleString()} · ${esc(u.role)}${u.taskId ? " · " + esc(u.taskId) : ""}`).join("<br>") || "ещё не использовался"}</span></div>
        <details><summary>Полный текст SKILL.md</summary><pre class="b3-idetail">${esc(s.instructions)}</pre></details></div>`);
      modal(s.title, body, s.compatibility === "outdated" ? [{ label: "Принять новую версию", primary: true, run: async () => { await api(`/api/bw3/skills/${id}/accept`, {}); await this.reload(); } }] : []);
    },
  };

  // ===================================================================== Blender MCP panel
  const Blender = {
    async mount(root) {
      const d = await api("/api/bw3/blender");
      root.innerHTML = `<div class="b3 b3-blender"><div class="b3-sechead"><div><div class="b3-eyebrow">Brickwire 3.0 · Blender MCP</div><h2>Blender</h2><p class="b3-muted b3-small">Подключение к вашему Blender через ahujasid/blender-mcp. Инструменты берутся из ответа сервера; выполнение Python всегда требует подтверждения.</p></div></div>
        <div class="b3-bgrid"><div class="b3-card"><b>Серверы</b><div class="b3-bservers"></div>
          <details ${d.servers.length ? "" : "open"}><summary>Добавить пресет Blender MCP</summary>
          <div class="b3-form"><div class="b3-small b3-muted">Команда: <code>${esc(d.preset.command)} ${esc(d.preset.args.join(" "))}</code></div>
          <input class="b3-uvx" placeholder="Полный путь к uvx (если приложение не находит uvx)"><input class="b3-port" placeholder="Порт сервера (необязательно)"><label class="b3-check"><input type="checkbox" class="b3-safe"> Передать BLENDER_MCP_SAFE_MODE из окружения моста</label><label class="b3-check"><input type="checkbox" class="b3-auth"> Я разрешаю запуск этого локального процесса</label><button class="primary b3-add">Добавить</button></div></details></div>
        <div class="b3-card"><b>Руководство</b>${d.guide.map((g, i) => `<details ${i === 0 ? "open" : ""}><summary>${esc(document.documentElement.lang === "en" ? g.titleEn || g.title : g.title)}</summary><p>${esc(document.documentElement.lang === "en" ? g.bodyEn || g.body : g.body)}</p></details>`).join("")}</div></div></div>`;
      const sv = $(".b3-bservers", root);
      sv.innerHTML = d.servers.length ? d.servers.map((s) => `<div class="b3-bsrv"><span class="b3-badge ${s.status === "ready" ? "ok" : "warn"}">${esc(s.status)}</span><b>${esc(s.name)}</b><span class="b3-small b3-muted">${s.toolCount} инструментов${s.executeTool ? " · Python: " + esc(s.executeTool.name) + " (" + esc(s.executeTool.mode || "off") + ")" : ""}</span>${s.error ? `<div class="b3-small b3-errtext">${esc(s.error)}</div>` : ""}<button data-test="${s.id}">Проверить</button><button class="quiet" data-mcp>Подключение и разрешения →</button></div>`).join("") : `<div class="b3-muted b3-small">Не настроен.</div>`;
      sv.querySelectorAll("[data-test]").forEach((b) => (b.onclick = async () => { try { const r = await api("/api/bw3/blender/test", { serverId: b.dataset.test }); modal("Ответ Blender", `<pre class="b3-idetail">${esc(r.output || r.note || JSON.stringify(r.tools))}</pre>`); } catch (e) { toast(e.message, true); } }));
      sv.querySelectorAll("[data-mcp]").forEach((b) => (b.onclick = () => document.getElementById("mcp-root")?.scrollIntoView({ behavior: "smooth" })));
      $(".b3-add", root).onclick = async () => { try { await api("/api/bw3/blender/preset", { authorize: $(".b3-auth", root).checked, uvxPath: $(".b3-uvx", root).value.trim() || undefined, safeMode: $(".b3-safe", root).checked, port: $(".b3-port", root).value.trim() }); toast("Пресет добавлен. Подключите сервер в списке MCP ниже."); this.mount(root); window.BrickwireMcp?.refresh(); } catch (e) { toast(e.message, true); } };
    },
  };

  // ===================================================================== Blender & Figma connections
  const Connect = {
    async mount(root) {
      this.root = root;
      root.innerHTML = `<div class="b3 b3-connect"><div class="b3-sechead"><div><div class="b3-eyebrow">Brickwire 3.1</div><h2>Blender и Figma</h2><p class="b3-muted b3-small">Подключите Blender и Figma — модели, картинки и интерфейсы будут приходить прямо в чат приложения, а AI сможет с ними работать.</p></div></div>
        <div class="b3-bgrid">
          <div class="b3-card b3-cblender"><div class="b3-conhead"><b>Blender</b><span class="b3-badge b3-bstate">…</span></div><div class="b3-bbody"></div></div>
          <div class="b3-card b3-cfigma"><div class="b3-conhead"><b>Figma</b><span class="b3-badge b3-fstate">…</span></div><div class="b3-fbody"></div></div>
        </div></div>`;
      await this.refresh();
      clearInterval(this.timer); this.timer = setInterval(() => { if (root.isConnected && root.offsetParent) this.refresh(true).catch(() => {}); }, 4000);
    },
    async refresh(quiet) {
      const d = await api("/api/bw3/connect"); this.d = d;
      const r = this.root, bl = d.blender, inst = bl.install.versions.filter((v) => v.installed), cli = bl.clients[0];
      const bs = $(".b3-bstate", r); bs.className = `b3-badge b3-bstate ${bl.connected ? "ok" : "warn"}`; bs.textContent = bl.connected ? "подключён" : "не подключён";
      const bKey = JSON.stringify([bl.connected, cli?.blender, cli?.file, cli?.outdated, inst.map((v) => v.version + v.current), bl.install.exe]);
      if (!quiet || bKey !== this.bKey) {
        this.bKey = bKey;
        $(".b3-bbody", r).innerHTML = `${bl.connected ? `<p>Blender ${esc(cli.blender)} · <b>${esc(cli.file || "")}</b>${cli.outdated ? ` <span class="b3-badge warn">аддон устарел — нажмите «Установить» и перезапустите Blender</span>` : ""}</p>
            <div class="b3-tools"><button class="primary" data-b="export">Получить выделенное</button><button data-b="render">Снимок вьюпорта</button><button data-b="scene">Сцена</button></div>
            <p class="b3-small b3-muted">В Blender: панель N → вкладка <b>Brickwire</b> → «Send selection to Brickwire chat». Результат появится в чате с 3D-просмотром.</p>`
          : `<ol class="b3-steps-ol"><li>Нажмите <b>«Установить в Blender»</b> — Brickwire сам положит аддон в Blender${bl.install.versions.length ? ` (найдено: ${bl.install.versions.map((v) => esc(v.version)).join(", ")})` : ""}.</li><li>Перезапустите Blender (или «Запустить Blender»).</li><li>Статус сменится на «подключён» — без MCP, uv и настроек.</li></ol>`}
          <div class="b3-tools"><button ${bl.connected ? "" : 'class="primary"'} data-b="install">${inst.length ? "Переустановить аддон" : "Установить в Blender"}</button><button data-b="launch" ${bl.install.exe ? "" : `disabled title="Blender не найден"`}>Запустить Blender</button><button data-b="download">Скачать аддон</button>${inst.length ? `<button class="quiet" data-b="uninstall">Удалить аддон</button>` : ""}</div>
          <div class="b3-small b3-muted">${inst.length ? "Аддон установлен: " + inst.map((v) => esc(v.version) + (v.current ? "" : " (старая версия)")).join(", ") : "Аддон не установлен"}${bl.install.exe ? " · " + esc(bl.install.exe) : ""}</div>
          <details class="b3-small"><summary>Ручная установка</summary><p>«Скачать аддон» → Blender: Edit → Preferences → Add-ons → Install… → выберите brickwire_blender.py → включите «Brickwire Connector». Старый способ через Blender MCP остаётся во вкладке MCP.</p></details>
          <div class="b3-small b3-bnote"></div>`;
      }
      const f = d.figma, fs = $(".b3-fstate", r); fs.className = `b3-badge b3-fstate ${f.token.configured ? "ok" : "warn"}`; fs.textContent = f.token.configured ? "токен задан" : "без токена";
      const fKey = JSON.stringify([f.token, f.pushes.map((x) => x.id), f.pluginDir]);
      if (!quiet || fKey !== this.fKey) {
        this.fKey = fKey;
        const keep = $(".b3-furl", r)?.value || "";
        $(".b3-fbody", r).innerHTML = `<p class="b3-small"><b>Ссылка на макет (figma.com)</b> — выделите фрейм в Figma → Share → Copy link.</p>
          <input class="b3-furl" placeholder="https://www.figma.com/design/…?node-id=…" value="${esc(keep)}">
          <div class="b3-tools"><button class="primary" data-f="inspect">Показать в чате</button><button data-f="studio">Собрать UI в Studio</button><button data-f="export">Экспорт PNG</button></div>
          <div class="b3-small b3-muted">Для ссылок нужен личный токен Figma: Settings → Security → Personal access tokens (доступ file_content:read).</div>
          <div class="b3-form"><input class="b3-ftoken" type="password" placeholder="${f.token.configured ? "Токен сохранён: " + esc(f.token.hint) : "figd_…"}"><button data-f="token">Сохранить токен</button></div>
          <details class="b3-small" ${f.token.configured ? "" : "open"}><summary>Плагин Figma — без токена</summary><ol class="b3-steps-ol"><li>Откройте Figma desktop → Plugins → Development → Import plugin from manifest…</li><li>Выберите файл: <code>${esc((f.pluginDir || "") + "/manifest.json")}</code> <button class="quiet" data-f="copy">Копировать путь</button></li><li>Выделите фрейм → Plugins → Development → Brickwire → «Send to Brickwire». Макет придёт в чат.</li></ol></details>
          ${f.pushes.length ? `<div class="b3-small"><b>Получено из плагина</b>${f.pushes.map((x) => `<div class="b3-fpush"><span>${esc(x.name)} · ${x.nodes} слоёв · ${new Date(x.at).toLocaleString()}</span><button data-push="${x.id}">В Studio</button></div>`).join("")}</div>` : ""}
          <div class="b3-small b3-fnote"></div>`;
      }
      this.wire();
    },
    wire() {
      const r = this.root;
      const bnote = (t, bad) => { const n = $(".b3-bnote", r); if (n) { n.textContent = t; n.classList.toggle("b3-errtext", !!bad); } };
      const fnote = (t, bad) => { const n = $(".b3-fnote", r); if (n) { n.textContent = t; n.classList.toggle("b3-errtext", !!bad); } };
      r.querySelectorAll("[data-b]").forEach((b) => (b.onclick = async () => {
        const a = b.dataset.b; b.disabled = true;
        try {
          if (a === "install") { const x = await api("/api/bw3/connect/blender/install", {}); bnote("Установлено: " + x.written.join(", ") + ". Перезапустите Blender."); }
          if (a === "uninstall") { if (!(await confirmBox("Удалить аддон", "Аддон Brickwire Connector будет удалён из Blender.", "Удалить"))) return; await api("/api/bw3/connect/blender/uninstall", {}); bnote("Аддон удалён."); }
          if (a === "launch") { const x = await api("/api/bw3/connect/blender/launch", {}); bnote("Blender запускается… " + x.exe); }
          if (a === "download") { const t = await (await fetch("/api/blender/addon.py")).text(); const u = URL.createObjectURL(new Blob([t], { type: "text/x-python" })); const l = document.createElement("a"); l.href = u; l.download = "brickwire_blender.py"; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
          if (a === "export") { bnote("Экспорт из Blender…"); const x = await runTool("blender_export", {}, bnote); bnote(x?.status === "success" ? "Готово — результат в чате." : "Ошибка: " + (x?.error || ""), x?.status !== "success"); }
          if (a === "render") { bnote("Снимок…"); const x = await runTool("blender_render", {}, bnote); bnote(x?.status === "success" ? "Снимок в чате." : "Ошибка: " + (x?.error || ""), x?.status !== "success"); }
          if (a === "scene") { const x = await runTool("blender_scene", {}, bnote); if (x?.status === "success") modal("Сцена Blender", `<pre class="b3-idetail">${esc(JSON.stringify(x.result, null, 1).slice(0, 20000))}</pre>`); else bnote("Ошибка: " + (x?.error || ""), true); }
          await this.refresh(true);
        } catch (e) { bnote(e.message, true); } finally { b.disabled = false; }
      }));
      r.querySelectorAll("[data-f],[data-push]").forEach((b) => (b.onclick = async () => {
        const a = b.dataset.f, url = ($(".b3-furl", r)?.value || "").trim(); b.disabled = true;
        try {
          if (a === "token") { const t = $(".b3-ftoken", r).value.trim(); const x = await api("/api/bw3/connect/figma/token", { token: t }); fnote(x.token.configured ? "Токен сохранён." : "Токен удалён."); this.fKey = ""; await this.refresh(true); return; }
          if (a === "copy") { await navigator.clipboard?.writeText((this.d.figma.pluginDir || "") + "/manifest.json"); fnote("Путь скопирован."); return; }
          if (b.dataset.push) { fnote("Собираю UI в Studio…"); const x = await runTool("figma_to_studio", { pushId: b.dataset.push }, fnote); fnote(x?.status === "success" ? "Готово ✓ " + resultSummary(x.result) : "Ошибка: " + (x?.error || ""), x?.status !== "success"); return; }
          if (!url) { fnote("Вставьте ссылку на фрейм Figma.", true); return; }
          const tool = a === "inspect" ? "figma_inspect" : a === "studio" ? "figma_to_studio" : "figma_export";
          fnote("Работаю…"); const x = await runTool(tool, { url }, fnote);
          fnote(x?.status === "success" ? "Готово — результат в чате. " + resultSummary(x.result) : "Ошибка: " + (x?.error || ""), x?.status !== "success");
        } catch (e) { fnote(e.message, true); } finally { b.disabled = false; }
      }));
    },
  };
  // Results from Blender / Figma: long-poll and show them in the chat (or a toast with a link when the chat is not open).
  let inboxOn = false;
  async function inbox() {
    if (inboxOn) return; inboxOn = true;
    let head = null, fails = 0;
    while (fails < 20) {
      try {
        if (head === null) head = (await api("/api/bw3/results?after=-1")).head;
        const d = await api(`/api/bw3/results?after=${head}&wait=20000`); head = d.head; fails = 0;
        for (const it of d.items) {
          const shown = Chat.root && Chat.root.offsetParent ? await Chat.onResult(it).catch(() => false) : false;
          if (!shown) { toast(it.title + " — откройте «Чаты»"); if (Chat.root) { if (!Chat.conv || Chat.conv.id === it.conversationId) Chat._stale = it.conversationId; Chat.refreshList?.().catch(() => {}); } }
        }
      } catch { fails++; await new Promise((r) => setTimeout(r, 3000)); }
    }
    inboxOn = false;
  }
  if (document.getElementById("bw3-chats")) setTimeout(inbox, 1500);

  // ===================================================================== mounting into the app shell
  const go3 = (tab) => { try { if (typeof go === "function") return go(tab); } catch { /* not in app shell */ } location.hash = tab; };
  const mounted = {};
  async function ensure(key, sel, mod) { const el = document.querySelector(sel); if (!el) return; try { if (!mounted[key]) { mounted[key] = true; await mod.mount(el); } else if (mod.reload) await mod.reload(); else if (mod.refresh) await mod.refresh(); else await mod.mount(el); } catch (e) { mounted[key] = false; el.innerHTML = `<div class="b3-err">${esc(e.message)}</div>`; } }
  window.Brickwire3 = {
    chats: () => ensure("chats", "#bw3-chats", Chat),
    devtree: async () => { await ensure("tree", "#bw3-tree", Tree); if (!Tree.data) await Tree.show(Chat.conv ? { conversation: Chat.conv.id } : {}); },
    assets: () => { mounted.assets = false; return ensure("assets", "#bw3-assets", Assets); },
    skills: () => ensure("skills", "#bw3-skills", Skills),
    blender: () => { mounted.blender = false; return ensure("blender", "#bw3-blender", Blender); },
    connect: () => ensure("connect", "#bw3-connect", Connect),
    Chat, Tree, Skills, Connect, parseObjText, mountViewer, runTool,
  };
})();
