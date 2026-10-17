/* Editable animation IR + local articulated proxy. Actual rig playback is separate and approved. */
(() => {
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  function proxy(ir, time) {
    const keys = ir.keyframes;
    let a = keys[0],
      b = keys.at(-1);
    for (let i = 0; i < keys.length - 1; i++)
      if (time >= keys[i].t && time <= keys[i + 1].t) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    if (time >= keys.at(-1).t) a = b = keys.at(-1);
    let k = b.t === a.t ? 0 : Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t)));
    if (a.easing === "Constant") k = 0;
    if (a.easing === "Cubic") k = k * k * (3 - 2 * k);
    const sample = (j, field) =>
      [0, 1, 2].map((i) => (a[field]?.[j]?.[i] ?? 0) * (1 - k) + (b[field]?.[j]?.[i] ?? 0) * k);
    const identity = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ],
      mul = (a, b) =>
        a.map((row) => [0, 1, 2].map((i) => row.reduce((s, v, j) => s + v * b[j][i], 0))),
      mv = (m, v) => m.map((r) => r.reduce((s, x, i) => s + x * v[i], 0));
    const rot = ([x, y, z]) => {
      [x, y, z] = [x, y, z].map((n) => (n * Math.PI) / 180);
      return mul(
        mul(
          [
            [1, 0, 0],
            [0, Math.cos(x), -Math.sin(x)],
            [0, Math.sin(x), Math.cos(x)],
          ],
          [
            [Math.cos(y), 0, Math.sin(y)],
            [0, 1, 0],
            [-Math.sin(y), 0, Math.cos(y)],
          ],
        ),
        [
          [Math.cos(z), -Math.sin(z), 0],
          [Math.sin(z), Math.cos(z), 0],
          [0, 0, 1],
        ],
      );
    };
    const defs = [
      ["root", null, [0, 0, 0], [1.1, 0.55, 0.55]],
      ["waist", "root", [0, 0.8, 0], [1.25, 1.05, 0.55]],
      ["head", "waist", [0, 1, 0], [0.65, 0.75, 0.65]],
      ["armL", "waist", [-0.95, 0.38, 0], [0.38, 1, 0.4]],
      ["armR", "waist", [0.95, 0.38, 0], [0.38, 1, 0.4]],
      ["legL", "root", [-0.38, -0.8, 0], [0.45, 1, 0.45]],
      ["legR", "root", [0.38, -0.8, 0], [0.45, 1, 0.45]],
    ];
    if (ir.rig === "R15")
      defs.push(
        ["forearmL", "armL", [0, -0.95, 0], [0.33, 0.85, 0.34]],
        ["forearmR", "armR", [0, -0.95, 0], [0.33, 0.85, 0.34]],
        ["handL", "forearmL", [0, -0.6, 0], [0.34, 0.35, 0.3]],
        ["handR", "forearmR", [0, -0.6, 0], [0.34, 0.35, 0.3]],
        ["shinL", "legL", [0, -0.95, 0], [0.38, 0.85, 0.4]],
        ["shinR", "legR", [0, -0.95, 0], [0.38, 0.85, 0.4]],
        ["footL", "shinL", [0, -0.6, 0.18], [0.43, 0.3, 0.7]],
        ["footR", "shinR", [0, -0.6, 0.18], [0.43, 0.3, 0.7]],
      );
    const nodes = {},
      positions = [
        [-3, -3, -3],
        [3, 3, 3],
      ],
      triangles = [],
      faces = [
        [0, 2, 1],
        [1, 2, 3],
        [4, 5, 6],
        [5, 7, 6],
        [0, 1, 4],
        [1, 5, 4],
        [2, 6, 3],
        [3, 6, 7],
        [0, 4, 2],
        [2, 4, 6],
        [1, 3, 5],
        [3, 7, 5],
      ];
    for (const [j, parent, offset, size] of defs) {
      const p = nodes[parent] || { m: identity, o: [0, 0, 0] },
        local = offset.map((x, i) => x + sample(j, "pos")[i]),
        o = mv(p.m, local).map((v, i) => v + p.o[i]),
        m = mul(p.m, rot(sample(j, "rot")));
      nodes[j] = { m, o };
      const start = positions.length;
      for (let n = 0; n < 8; n++) {
        const v = mv(
          m,
          size.map((s, i) => ((n & (1 << i) ? 1 : -1) * s) / 2),
        );
        positions.push(v.map((x, i) => x + o[i]));
      }
      for (const f of faces) triangles.push(f.map((i) => i + start));
    }
    return { positions, triangles };
  }
  async function mount(node, { api, invoke, records, onSaved }) {
    let ir,
      quality,
      presets,
      joints,
      record,
      time = 0,
      index = 0,
      joint = "armR",
      scene,
      playing = false,
      raf,
      last = 0,
      undo = [],
      redo = [],
      alive = true;
    node._dispose?.();
    node._dispose = () => {
      alive = false;
      cancelAnimationFrame(raf);
      scene?.dispose();
    };
    const original = await api("animation/draft", {
      preset: "idle",
      name: "MotionStudy",
      rig: "R15",
    });
    if (!node.isConnected) return;
    ({ ir, quality, presets, joints } = original);
    const remember = () => {
      undo.push(JSON.stringify(ir));
      if (undo.length > 30) undo.shift();
      redo = [];
    };
    function stop() {
      playing = false;
      cancelAnimationFrame(raf);
      node.querySelector("[data-anim=play]").textContent = "Play локально";
    }
    function draw() {
      scene?.update(proxy(ir, time));
      node.querySelector("#anim-time").value = time;
      node.querySelector("#anim-clock").textContent =
        time.toFixed(2) + " / " + ir.length.toFixed(2) + " s";
    }
    function tick(ts) {
      if (!playing || !alive || !node.isConnected) return;
      if (document.hidden || node.closest("section")?.classList.contains("hide")) {
        stop();
        return;
      }
      time += (ts - last) / 1000;
      last = ts;
      if (time > ir.length) {
        if (ir.loop) time = 0;
        else {
          time = ir.length;
          stop();
        }
      }
      draw();
      if (playing) raf = requestAnimationFrame(tick);
    }
    function inspector() {
      const k = ir.keyframes[index];
      node.querySelector("#anim-joint").value = joint;
      node.querySelector("#anim-frame-time").value = k.t;
      for (const f of ["rot", "pos"])
        for (let i = 0; i < 3; i++)
          node.querySelector(`[name=${f}${i}]`).value = k[f]?.[joint]?.[i] ?? 0;
      node.querySelector("#anim-easing").value = k.easing || "Linear";
      node
        .querySelectorAll("[data-key]")
        .forEach((x) => x.classList.toggle("selected", Number(x.dataset.key) === index));
    }
    async function validate() {
      const out = await api("animation/draft", { ir });
      ir = out.ir;
      quality = out.quality;
      index = Math.min(index, ir.keyframes.length - 1);
      return out;
    }
    function status(s, bad = false) {
      const n = node.querySelector("#anim-status");
      n.textContent = s;
      n.classList.toggle("ws-error", bad);
    }
    function render() {
      stopSafe();
      node.innerHTML = `<div class="depth-surface-label">ANIMATION WORKSPACE / EDITABLE IR</div><h2>Редактор движения</h2><p>Ключевые кадры, суставы и markers. 3D-модель ниже — локальный геометрический proxy, не rig и не снимок Studio.</p><div class="anim-actions"><label>Пресет<select id="anim-preset">${presets.map((p) => `<option>${esc(p.id)}</option>`).join("")}</select></label><label>Rig<select id="anim-rig"><option ${ir.rig === "R6" ? "selected" : ""}>R6</option><option ${ir.rig === "R15" ? "selected" : ""}>R15</option></select></label><button data-anim="generate">Новый preset</button><label>Сохранённые<select id="anim-saved"><option value="">Выбрать draft</option>${records
        .filter((r) => r.kind === "animation")
        .map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`)
        .join(
          "",
        )}</select></label></div><div class="anim-layout"><div class="depth-viewport"><canvas id="anim-canvas" class="ws-preview" tabindex="0" aria-label="Локальный articulated proxy"></canvas><div class="viewport-axis"><span>X</span><span>Y</span><span>Z</span></div><div class="viewport-caption"><span>ORBIT · DRAG / HOME · RESET</span><span>LOCAL PROXY</span></div><div class="anim-timeline"><div class="anim-info"><span>KEYFRAMES · ${ir.keyframes.length}</span><span id="anim-clock"></span></div><div class="anim-keys">${ir.keyframes.map((k, i) => `<button data-key="${i}" title="Выбрать кадр ${i + 1}">${k.t.toFixed(2)}s</button>`).join("")}</div><label>Playhead<input id="anim-time" aria-label="Animation playhead" type="range" min="0" max="${ir.length}" step=".01" value="${time}"></label><div class="anim-actions"><button data-anim="play">Play локально</button><button data-anim="add">Добавить кадр</button><button data-anim="delete">Удалить кадр</button><button data-anim="undo" ${undo.length ? "" : "disabled"}>Undo</button><button data-anim="redo" ${redo.length ? "" : "disabled"}>Redo</button></div></div></div><div class="anim-inspector"><h3>Joint inspector</h3><form id="anim-pose"><label>Сустав<select id="anim-joint">${joints.map((j) => `<option>${j}</option>`).join("")}</select></label><label>Время кадра, s<input id="anim-frame-time" type="number" step=".01" min="0" max="${ir.length}"></label><label>Easing<select id="anim-easing">${["Linear", "Constant", "Cubic", "Elastic", "Bounce"].map((x) => `<option>${x}</option>`).join("")}</select></label><small>Rotation · degrees</small><div class="anim-vector">${[0, 1, 2].map((i) => `<label>${"XYZ"[i]}<input name="rot${i}" type="number" step="1" min="-360" max="360"></label>`).join("")}</div><small>Offset · studs</small><div class="anim-vector">${[0, 1, 2].map((i) => `<label>${"XYZ"[i]}<input name="pos${i}" type="number" step=".1" min="-100" max="100"></label>`).join("")}</div><button class="gold">Применить pose</button></form></div></div><form id="anim-meta"><div class="ws-fields"><label>Название<input name="name" required pattern="[A-Za-z][A-Za-z0-9_]{0,59}" value="${esc(ir.name)}"></label><label>Длительность, s<input name="length" type="number" min=".05" max="120" step=".01" value="${ir.length}"></label></div><label class="ws-ack"><input name="loop" type="checkbox" ${ir.loop ? "checked" : ""}>Loop</label><label>Markers · JSON<textarea name="events" rows="3">${esc(JSON.stringify(ir.events))}</textarea></label><button>Применить timing и markers</button></form><div class="anim-actions"><button data-anim="save" class="gold">Сохранить draft</button><button data-anim="export">Экспорт JSON</button><label>Импорт JSON<input id="anim-import" type="file" accept=".json,application/json"></label><button data-anim="build">Создать sequence в Studio</button></div><label class="ws-ack"><input id="anim-replace" type="checkbox">Разрешаю замену только owned sequence с резервной копией</label><label>Sequence в Studio<input id="anim-real-sequence" placeholder="game.ServerStorage.BrickwireTimelineAnimations.MotionStudy" value="game.ServerStorage.BrickwireTimelineAnimations.${esc(ir.name)}"></label><button data-anim="studio-read">Загрузить sequence из Studio</button><label>Путь настоящего rig<input id="anim-real-rig" placeholder="game.Workspace.Dummy"></label><div class="anim-actions"><button data-anim="inspect">Инспектировать rig</button><button data-anim="studio-play">Play в Studio</button><button data-anim="studio-stop">Stop в Studio</button></div><p id="anim-status" role="status"></p><details><summary>Статический анализ · не Play-проверка</summary><pre>${esc(JSON.stringify(quality, null, 2))}</pre></details><p><small>Локальный proxy показывает Linear / Constant / сглаженный Cubic; Elastic и Bounce точнее проверяются в Studio. Публикация AnimationId отдельная. Draft и local playback не меняют Studio.</small></p>`;
      scene = Brickwire3D.mount(node.querySelector("#anim-canvas"), proxy(ir, time));
      draw();
      inspector();
      node.querySelectorAll("[data-key]").forEach(
        (x) =>
          (x.onclick = () => {
            stop();
            index = Number(x.dataset.key);
            time = ir.keyframes[index].t;
            inspector();
            draw();
          }),
      );
      node.querySelector("#anim-joint").onchange = (e) => {
        joint = e.target.value;
        inspector();
      };
      node.querySelector("#anim-time").oninput = (e) => {
        stop();
        time = Number(e.target.value);
        draw();
      };
      node.querySelector("#anim-pose").onsubmit = async (e) => {
        e.preventDefault();
        const old = structuredClone(ir);
        try {
          const frame = ir.keyframes[index],
            t = Number(node.querySelector("#anim-frame-time").value);
          frame.t = t;
          frame.easing = node.querySelector("#anim-easing").value;
          frame.rot[joint] = [0, 1, 2].map((i) =>
            Number(node.querySelector(`[name=rot${i}]`).value),
          );
          frame.pos ??= {};
          frame.pos[joint] = [0, 1, 2].map((i) =>
            Number(node.querySelector(`[name=pos${i}]`).value),
          );
          await validate();
          undo.push(JSON.stringify(old));
          redo = [];
          time = t;
          index = ir.keyframes.findIndex((k) => k.t === t);
          render();
          status("Pose изменена локально. Studio не изменена.");
        } catch (err) {
          ir = old;
          status(err.message, true);
        }
      };
      node.querySelector("#anim-meta").onsubmit = async (e) => {
        e.preventDefault();
        const old = structuredClone(ir);
        try {
          const f = new FormData(e.target);
          ir.name = f.get("name");
          ir.length = Number(f.get("length"));
          ir.loop = f.has("loop");
          ir.events = JSON.parse(f.get("events"));
          await validate();
          undo.push(JSON.stringify(old));
          redo = [];
          time = Math.min(time, ir.length);
          render();
        } catch (err) {
          ir = old;
          status(err.message, true);
        }
      };
      node.querySelector("#anim-saved").onchange = async (e) => {
        const r = records.find((r) => r.id === e.target.value);
        if (!r) return;
        try {
          stop();
          const out = await api("animation/draft", { ir: r.data.ir });
          remember();
          ir = out.ir;
          quality = out.quality;
          record = r;
          time = 0;
          index = 0;
          render();
        } catch (err) {
          status(err.message, true);
        }
      };
      node.querySelector("#anim-import").onchange = async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          if (f.size > 512000) throw Error("JSON limit 512 KB");
          const x = JSON.parse(await f.text()),
            out = await api("animation/draft", { ir: x.ir || x });
          remember();
          ir = out.ir;
          quality = out.quality;
          record = undefined;
          index = 0;
          time = 0;
          render();
          status("Импортировано локально. Код не запускался.");
        } catch (err) {
          status(err.message, true);
        }
      };
      for (const b of node.querySelectorAll("[data-anim]"))
        b.onclick = async () => {
          try {
            const a = b.dataset.anim;
            if (a === "play") {
              if (playing) return stop();
              playing = true;
              if (time >= ir.length) time = 0;
              last = performance.now();
              b.textContent = "Pause локально";
              raf = requestAnimationFrame(tick);
              return;
            }
            stop();
            if (a === "generate") {
              const out = await api("animation/draft", {
                preset: node.querySelector("#anim-preset").value,
                rig: node.querySelector("#anim-rig").value,
                name: ir.name,
              });
              remember();
              ir = out.ir;
              quality = out.quality;
              record = undefined;
              index = 0;
              time = 0;
              render();
            }
            if (a === "add") {
              const t = Math.round(time * 100) / 100;
              if (ir.keyframes.some((k) => Math.abs(k.t - t) < 0.001))
                throw Error("На этом времени уже есть кадр. Сдвиньте playhead.");
              remember();
              const k = structuredClone(ir.keyframes[index]);
              k.t = t;
              ir.keyframes.push(k);
              await validate();
              index = ir.keyframes.findIndex((k) => k.t === t);
              render();
            }
            if (a === "delete") {
              if (ir.keyframes.length === 1) throw Error("Нужен минимум один кадр");
              remember();
              ir.keyframes.splice(index, 1);
              await validate();
              render();
            }
            if (a === "undo" || a === "redo") {
              const from = a === "undo" ? undo : redo,
                to = a === "undo" ? redo : undo;
              if (!from.length) return;
              to.push(JSON.stringify(ir));
              ir = JSON.parse(from.pop());
              await validate();
              render();
            }
            if (a === "save") {
              await validate();
              const out = await api("save", {
                ...(record ? { id: record.id, revision: record.revision } : {}),
                kind: "animation",
                name: ir.name,
                data: { ir, verification: "local draft, not Studio acceptance" },
              });
              record = out.record;
              const i = records.findIndex((r) => r.id === record.id);
              if (i >= 0) records[i] = record;
              else records.push(record);
              onSaved?.(record);
              status("Draft сохранён · ревизия " + record.revision);
            }
            if (a === "export") {
              await validate();
              const url = URL.createObjectURL(
                  new Blob([JSON.stringify(ir, null, 2)], { type: "application/json" }),
                ),
                link = document.createElement("a");
              link.href = url;
              link.download = ir.name + ".animation.json";
              link.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
            if (a === "build") {
              await validate();
              await invoke(
                "animation_timeline_build",
                { ir, replace: node.querySelector("#anim-replace").checked },
                (out) => status("Sequence: " + out.path + " · runtime не проверен"),
              );
            }
            if (a === "studio-read")
              await invoke(
                "animation_timeline_read",
                { path: node.querySelector("#anim-real-sequence").value },
                (out) => {
                  remember();
                  ir = out.ir;
                  quality = out.quality;
                  record = undefined;
                  time = 0;
                  index = 0;
                  render();
                  status(
                    "Прочитан фактический sequence: " + out.path + ". Playback ещё не проверен.",
                  );
                },
              );
            if (a === "inspect")
              await invoke("rig_inspect", { path: node.querySelector("#anim-real-rig").value });
            if (a === "studio-play" || a === "studio-stop")
              await invoke("animation_preview_actual", {
                rig: node.querySelector("#anim-real-rig").value,
                sequence: node.querySelector("#anim-real-sequence").value,
                action: a === "studio-play" ? "play" : "stop",
              });
          } catch (err) {
            status(err.message, true);
          }
        };
    }
    function stopSafe() {
      playing = false;
      cancelAnimationFrame(raf);
      scene?.dispose();
    }
    render();
    return node._dispose;
  }
  window.BrickwireAnimation = { mount, proxy };
})();
