(() => {
  "use strict";
  let token,
    state,
    epoch = 0,
    current,
    assetOffset = 0;
  let vfx = {
      name: "EnergyImpact",
      layers: [
        {
          name: "Shockwave",
          type: "ring",
          color: "#e3bd73",
          size: [8, 0.3, 8],
          offset: [0, 0, 0],
          start: 0,
          duration: 1,
          fromScale: 0.1,
          toScale: 1,
          fromTransparency: 0,
          toTransparency: 1,
        },
        {
          name: "Core",
          type: "sphere",
          color: "#ffe4af",
          size: [3, 3, 3],
          offset: [0, 1, 0],
          start: 0,
          duration: 0.4,
          fromScale: 0.1,
          toScale: 1,
          fromTransparency: 0,
          toTransparency: 1,
        },
        {
          name: "Sparks",
          type: "particles",
          color: "#e3bd73",
          size: [1, 1, 1],
          offset: [0, 1, 0],
          start: 0.1,
          duration: 1,
          count: 35,
        },
      ],
    },
    vfxRecord,
    layerIndex = 0,
    sourceRead,
    meshData,
    lastMeshOptions,
    conversationId,
    conversationTimer,
    graphTimer,
    graphWatching = false;
  const e = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  const definitions = {
    conversations: [
      "API conversations",
      "HISTORY / PROJECT / TOOL USE",
      "Сохранённые диалоги через существующий API-агент, отдельно от browser/plugin feed.",
    ],
    paint: [
      "Paint Studio",
      "CANVAS / LAYERS / EXPORT",
      "Существующий растровый редактор и UI Builder — внутри общего приложения.",
    ],
    lab: [
      "3D & Animation Lab",
      "GEOMETRY / RIG / MOTION",
      "Локальная геометрия и отдельные операции в настоящей Studio.",
    ],
    vfx: [
      "VFX Studio",
      "LAYERS / TIMING / STUDIO",
      "Редактор многослойного эффекта: геометрия, частицы и свет.",
    ],
    designer: [
      "Game Designer",
      "CONCEPT / DEPENDENCIES / TASK",
      "Сохраните дизайн и свяжите его с контролируемой задачей разработки.",
    ],
    scripts: [
      "Scripts & Tools",
      "SOURCE / DIFF / PERMISSIONS",
      "Чтение, сравнение и защищённое изменение исходников без замены объектов.",
    ],
    qa: [
      "QA & Testing",
      "CHECKS / RECEIPTS / LIMITATIONS",
      "Структурные проверки, анализ и экспериментальный Play runner.",
    ],
    project: [
      "Project Graph",
      "OBSERVE / DEPENDENCIES / IMPACT",
      "Снимок иерархии и статических связей из выбранной Studio.",
    ],
    integrations: [
      "Integrations",
      "PROVIDERS / SERVICES / SECRETS",
      "Настройка существующего API-агента. MCP управляется в отдельном разделе.",
    ],
    settings: [
      "Settings",
      "EXECUTION / SAFETY / CAPABILITIES",
      "Реальные настройки моста и доступности встроенных инструментов.",
    ],
  };
  async function api(path, body) {
    if (!token) {
      const r = await fetch("/api/app-mcp/access");
      const a = await r.json();
      if (!r.ok) throw Error(a.error);
      token = a.token;
    }
    const r = await fetch("/api/workspace/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Brickwire-App": token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const a = await r.json();
    if (!r.ok) throw Error(a.error || "HTTP " + r.status);
    return a;
  }
  function root() {
    return document.querySelector(`[data-workspace="${current}"]`);
  }
  function notice(text, bad = false) {
    const n = root()?.querySelector(".ws-notice");
    if (n) {
      n.textContent = text;
      n.classList.toggle("ws-error", bad);
    }
  }
  function modal(title, html) {
    const d = document.createElement("dialog");
    d.className = "ws-dialog";
    d.innerHTML = `<h2>${e(title)}</h2>${html}<p class="ws-error" role="alert"></p><div class="ws-toolbar"><button data-close>Закрыть</button></div>`;
    document.body.append(d);
    d.querySelector("[data-close]").onclick = () => d.close();
    d.onclose = () => d.remove();
    d.showModal();
    return d;
  }
  const json = (v) => e(JSON.stringify(v, null, 2));
  function sameProject(r) {
    return !r.binding || JSON.stringify(r.binding) === JSON.stringify(state.binding);
  }
  function relevant(kind) {
    return (state?.records || []).filter((r) => r.kind === kind && sameProject(r));
  }
  function header() {
    const def = definitions[current];
    return `<div class="ws-head"><div><div class="ws-kicker">${def[1]}</div><h1>${def[0]}</h1><p>${def[2]}</p></div><button data-refresh>Обновить</button></div><div class="ws-toolbar ws-card"><label style="flex:1;margin:0">Целевая Studio<select id="ws-studio"><option value="">Не подключена / выберите Studio</option>${state.studios.map((s) => `<option value="${e(s.id)}" ${state.binding?.studioId === s.id ? "selected" : ""}>${e(s.name)} · ${e(s.id)}</option>`).join("")}</select></label><span class="ws-chip">${e(state.settings.mode)} · ${state.optionalTools ? "инструменты включены" : "создание отключено"}</span></div><p class="ws-notice ws-status" role="status" aria-live="polite"></p>${state.errors.map((x) => `<p class="ws-error">${e(x)}</p>`).join("")}`;
  }
  async function open(tab) {
    root()
      ?.querySelectorAll("canvas")
      .forEach((c) => c._dispose?.());
    root()?.querySelector("#animation-editor")?._dispose?.();
    clearTimeout(graphTimer);
    graphWatching = false;
    current = tab;
    const ticket = ++epoch;
    const r = root();
    r.innerHTML = '<p role="status">Загружаю рабочее пространство…</p>';
    try {
      const next = await api("state");
      if (ticket !== epoch) return;
      state = next;
      r.innerHTML = header() + render(tab);
      r.querySelector("[data-refresh]").onclick = () => open(tab);
      r.querySelector("#ws-studio").onchange = async (ev) => {
        if (!ev.target.value) return;
        try {
          await fetch("/api/app-runtime/select", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Brickwire-App": token },
            body: JSON.stringify({ studioId: ev.target.value }),
          }).then(async (res) => {
            if (!res.ok) throw Error((await res.json()).error);
          });
          await open(tab);
        } catch (err) {
          notice(err.message, true);
        }
      };
      bind(tab, r);
    } catch (err) {
      if (ticket === epoch) {
        r.innerHTML = `<h1>${definitions[tab][0]}</h1><p class="ws-error">${e(err.message)}</p><button>Повторить</button>`;
        r.querySelector("button").onclick = () => open(tab);
      }
    }
  }
  const note = (t) => `<div class="ws-note">${t}</div>`;
  function render(tab) {
    if (tab === "conversations") return conversationView();
    if (tab === "paint")
      return `<div class="ws-toolbar"><button id="ws-paint" class="gold">Растровый canvas</button><button id="ws-ui">UI Builder</button><a href="/paint" target="_blank" rel="noopener">Открыть отдельно</a></div><p>Brush, слои, undo/redo, PNG импорт/экспорт — возможности существующего Paint. UI Builder создаёт интерфейсы через текущий bridge. PNG не считается автоматически опубликованной Roblox-текстурой.</p><iframe title="Paint Studio canvas" class="ws-frame" src="/paint?workspace=1"></iframe>`;
    if (tab === "lab")
      return `<div class="ws-grid"><div class="ws-card"><h2>Procedural mesh</h2><p>Тот же генератор, что использует bridge. Без подключения к Studio.</p><label>Геометрия<select id="mesh-type">${["rock", "crystal", "lathe", "terrain", "tube", "gem"].map((x) => `<option>${x}</option>`).join("")}</select></label><label>Seed<input type="number" id="mesh-seed" value="1"></label><button id="mesh-preview" class="gold">Построить локально</button><div class="ws-toolbar" style="margin-top:16px"><button id="mesh-export" disabled>Экспорт OBJ</button><button id="mesh-studio" disabled>Создать в Studio</button></div><p class="ws-status" id="mesh-stats"></p></div><div class="ws-card"><h2>3D viewport</h2><div class="viewport-tools"><button id="mesh-solid">Solid</button><button id="mesh-wire">Wireframe</button><button id="mesh-reset">Reset view</button></div><canvas class="ws-preview" id="mesh-canvas" aria-label="Локальный mesh: вращение перетаскиванием" tabindex="0"></canvas><p>Перетаскивание — вращение; колесо / + и − — масштаб. Это геометрический просмотр, не изображение из Studio. Материалы, коллизии и сохранение mesh здесь не проверяются.</p></div></div><div class="ws-card"><h2>Character animation</h2><p>Инспектируйте реальный rig, создайте KeyframeSequence существующим генератором, анализируйте его и отдельно запускайте playback. Static pose не считается готовой анимацией.</p><div id="animation-editor" class="anim-editor"></div><details><summary>Дополнительные инструменты анимации</summary><div id="lab-tools"></div></details></div>`;
    if (tab === "vfx") return vfxView();
    if (tab === "designer")
      return `<div class="ws-grid"><aside class="ws-card"><h2>Designs</h2><button id="design-new" class="gold">Новый дизайн</button><div class="ws-list" style="margin-top:16px">${
        relevant("design")
          .map(
            (r) =>
              `<button data-design="${r.id}"><b>${e(r.name)}</b><small>Ревизия ${r.revision} · ${r.data.taskId ? "связан с задачей" : "черновик"}</small></button>`,
          )
          .join("") || "<p>Пока нет сохранённых дизайнов.</p>"
      }</div></aside><div class="ws-card" id="design-detail"><h2>От концепта к плану</h2><p>Core loop, мир, прогрессия и реализация сохраняются в одном проектном черновике. Привязка создаёт Supervised-задачу, но не запускает её.</p><div id="design-tools"></div></div></div>`;
    if (tab === "scripts")
      return `<div class="ws-card"><h2>Guarded source editor</h2><label>Путь скрипта<input id="source-path" placeholder="game.ServerScriptService.Main"></label><button id="source-load" class="gold">Прочитать актуальный source</button><div id="source-editor"></div></div><div class="ws-card"><h2>Ручные инструменты</h2><div id="script-tools"></div></div><div class="ws-card"><h2>Source checkpoints</h2><p>Откат только исходника конкретного скрипта, если его объект сохранился и более новых изменений нет. Runtime-эффекты и остальные объекты не восстанавливаются.</p><button id="source-checkpoints">Получить checkpoints из Studio</button><div id="checkpoint-list"></div></div>`;
    if (tab === "qa")
      return `<div class="ws-card"><h2>Проверки</h2>${note("Receipt успешного вызова не означает, что все проверки пройдены. <b>nil / skipped</b> в результате — заблокированная проверка. Play runner экспериментальный; проверяйте фактический режим Studio.")}<div id="qa-tools"></div></div><div class="ws-card"><h2>Наблюдения и отчёты · ${relevant("qa").length}</h2>${
        relevant("qa")
          .slice(0, 20)
          .map(
            (r) =>
              `<details><summary>${e(r.name)} · ${e(new Date(r.updatedAt).toLocaleString())}</summary><pre>${json(r.data)}</pre><button data-export="${r.id}">Экспорт JSON</button></details>`,
          )
          .join("") ||
        "<p>Здесь появятся фактические результаты вызванных инструментов. Проверки ещё не запускались.</p>"
      }</div>`;
    if (tab === "project")
      return `<div class="ws-card"><h2>Observe project</h2><label>Корень сканирования<input id="graph-root" value="game"></label><div class="ws-toolbar"><button id="graph-scan" class="gold">Сканировать Studio</button><button id="graph-watch">Начать наблюдение</button><label>Интервал, s<select id="graph-interval"><option>5</option><option selected>10</option><option>30</option><option>60</option></select></label></div><span id="graph-live-status" class="depth-live-status">Наблюдение выключено</span>${note("Наблюдение периодически перечитывает реальную Studio, только пока раздел открыт. Это не event stream: изменения между сканами и динамические require/remotes могут быть пропущены. Ошибка или смена Studio останавливает наблюдение.")}<div id="graph-detail"></div></div>`;
    if (tab === "integrations")
      return `<div class="ws-grid"><div class="ws-card"><h2>API provider</h2><p class="ws-status">${state.agent.configured ? "Настроен, не проверен сетевым запросом" : "Не настроен"}</p><form id="provider-form"><label>Provider<select name="provider">${["openai", "deepseek", "openrouter", "ollama", "lmstudio", "custom"].map((p) => `<option ${state.agent.provider === p ? "selected" : ""}>${p}</option>`).join("")}</select></label><label>Endpoint<input name="url" value="${e(state.agent.url)}" placeholder="По умолчанию для выбранного provider"></label><label>Model<input name="model" value="${e(state.agent.model)}" required placeholder="Название модели"></label><label class="ws-ack"><input name="confirm" type="checkbox" required>Я разрешаю использовать этот provider для следующих запусков API-агента.</label><button class="gold">Сохранить</button></form></div><div class="ws-card"><h2>Secrets & services</h2><p>API-ключ: ${state.agent.keyConfigured ? "присутствует во внешнем окружении" : "не задан"}. Значение не возвращается и не вводится в этой форме.</p><p><code>BRICKWIRE_LLM_KEY</code> задайте в локальном .env / окружении. Для Ollama и LM Studio ключ не требуется. Защита .env остаётся ответственностью локальной установки.</p><p>Изображения / Open Cloud: существующие <code>BRICKWIRE_IMAGE_*</code> и <code>ROBLOX_OPEN_CLOUD_API_KEY</code>. Используйте image_status для фактической диагностики.</p><div id="integration-tools"></div><p>MCP-серверы, их ресурсы и разрешения настраиваются только в MCP. Новые серверы не получают доступа от смены provider.</p></div></div>`;
    if (tab === "settings")
      return `<div class="ws-grid"><div class="ws-card"><h2>Execution policy</h2><form id="settings-form"><label>Режим<select name="mode">${["safe", "approval", "auto", "full"].map((m) => `<option ${state.settings.mode === m ? "selected" : ""}>${m}</option>`).join("")}</select></label><p>Safe запрещает изменения. Workspace-записи исходников, preview и внешние действия всё равно требуют отдельного подтверждения.</p><label>Tool timeout, мс<input name="toolTimeoutMs" type="number" min="5000" max="600000" value="${state.settings.toolTimeoutMs}"></label><label>Approval timeout, мс<input name="approvalTimeoutMs" type="number" min="10000" max="3600000" value="${state.settings.approvalTimeoutMs}"></label><label class="ws-ack"><input name="autoSnapshot" type="checkbox" ${state.settings.autoSnapshot ? "checked" : ""}>Автоматические поддерживаемые снапшоты</label><label class="ws-ack"><input name="confirm" type="checkbox" required>Подтверждаю изменение политики для следующих операций. Активные сессии могут сохранять свой режим.</label><button class="gold">Сохранить настройки</button></form></div><div class="ws-card"><h2>Встроенные инструменты</h2><p>Mesh, animation, VFX, design и QA используют существующие composite tools. Включение регистрирует их, но не запускает и не разрешает изменения автоматически.</p><button id="optional-toggle" class="gold">${state.optionalTools ? "Отключить" : "Включить"} composite tools</button><p>Статус: ${state.optionalTools ? "включены" : "выключены"}. Изменение сохраняется только в настройках приложения.</p><h3>Безопасность восстановления</h3><p>Исходник защищён compare-and-swap и source checkpoints. Произвольный execute_luau не имеет универсального rollback. Неизвестный исход операции нельзя просто повторять.</p><h3>Среда</h3><p>Studio: ${state.studios.length}. MCP transport: stdio. Сетевые providers и Roblox API проверяются отдельными реальными запусками, не наличием настройки.</p></div></div>`;
    return "";
  }
  function bind(tab, r) {
    r.querySelectorAll("[data-export]").forEach(
      (x) =>
        (x.onclick = () =>
          api("export", { id: x.dataset.export }).then((v) =>
            download(x.dataset.export + ".json", JSON.stringify(v, null, 2)),
          )),
    );
    if (tab === "conversations") {
      bindConversation(r);
      return;
    }
    if (tab === "paint") {
      const chooseEditor = (ui) => {
        r.querySelector("iframe").src = ui ? "/ui-builder" : "/paint?workspace=1";
        r.querySelector("iframe").title = ui ? "UI Builder" : "Paint Studio canvas";
        r.querySelector("#ws-paint").classList.toggle("gold", !ui);
        r.querySelector("#ws-ui").classList.toggle("gold", ui);
        r.querySelector("a[target=_blank]").href = ui ? "/ui-builder" : "/paint";
      };
      r.querySelector("#ws-paint").onclick = () => chooseEditor(false);
      r.querySelector("#ws-ui").onclick = () => chooseEditor(true);
    }
    if (tab === "lab") {
      window.BrickwireAnimation.mount(r.querySelector("#animation-editor"), {
        api,
        invoke,
        records: relevant("animation"),
        onSaved: () => {},
      }).catch((err) => notice(err.message, true));
      mountTools(r.querySelector("#lab-tools"), (t) => /^(animation_|rig_)/.test(t.name));
      r.querySelector("#mesh-preview").onclick = async () => {
        try {
          lastMeshOptions = {
            type: r.querySelector("#mesh-type").value,
            seed: Number(r.querySelector("#mesh-seed").value),
            detail: 2,
          };
          const out = await api("mesh-preview", lastMeshOptions);
          meshData = out.mesh;
          const scene = drawMesh(r.querySelector("#mesh-canvas"), meshData);
          r.querySelector("#mesh-solid").onclick = () => scene.mode("solid");
          r.querySelector("#mesh-wire").onclick = () => scene.mode("wire");
          r.querySelector("#mesh-reset").onclick = () => scene.reset();
          r.querySelector("#mesh-stats").textContent =
            `${out.stats.vertices} вершин · ${out.stats.triangles} треугольников · local only`;
          r.querySelector("#mesh-export").disabled = false;
          r.querySelector("#mesh-studio").disabled = !state.tools.some(
            (t) => t.name === "mesh_generate" && t.available,
          );
        } catch (err) {
          notice(err.message, true);
        }
      };
      r.querySelector("#mesh-export").onclick = () =>
        download(
          meshData.name + ".obj",
          `o ${meshData.name}\n` +
            meshData.positions.map((p) => "v " + p.join(" ")).join("\n") +
            "\n" +
            meshData.triangles.map((t) => "f " + t.map((i) => i + 1).join(" ")).join("\n"),
        );
      r.querySelector("#mesh-studio").onclick = () =>
        invoke("mesh_generate", { ...lastMeshOptions, buildInStudio: true, upload: false });
      r.querySelector("#mesh-type").value = "crystal";
      r.querySelector("#mesh-preview").click();
    }
    if (tab === "scripts") {
      mountTools(r.querySelector("#script-tools"), (t) =>
        /^(script_|read_instance|modify_instance|create_script|set_script|patch_script|get_game_tree|execute_luau)/.test(
          t.name,
        ),
      );
      r.querySelector("#source-load").onclick = () =>
        invoke("source_read_guarded", { path: r.querySelector("#source-path").value }, (res) => {
          if (!res?.complete || typeof res.source !== "string")
            throw Error("Full editor source was not returned; editing blocked");
          sourceRead = { ...res, binding: structuredClone(state.binding) };
          const panel = r.querySelector("#source-editor");
          panel.innerHTML = `<p class="ws-status">${e(res.path)} · ${e(res.className)} · ${res.bytes} bytes</p><label>Source<textarea id="source-text" spellcheck="false" rows="15">${e(res.source)}</textarea></label><div class="ws-toolbar"><button id="source-diff">Показать diff</button><button id="source-apply" class="gold">Применить с проверкой конфликта</button><button id="source-export">Экспорт .lua</button></div><div id="source-diff-view"></div><p>Синтаксис и выполнение не подтверждены. Для диагностики используйте QA / Script Analysis в Studio.</p>`;
          panel.querySelector("#source-diff").onclick = () => {
            panel.querySelector("#source-diff-view").innerHTML = diff(
              sourceRead.source,
              panel.querySelector("#source-text").value,
            );
          };
          panel.querySelector("#source-export").onclick = () =>
            download("script.lua", panel.querySelector("#source-text").value);
          panel.querySelector("#source-apply").onclick = async () => {
            if (JSON.stringify(sourceRead.binding) !== JSON.stringify(state.binding))
              return notice("Целевая Studio изменилась; перечитайте source", true);
            const src = panel.querySelector("#source-text").value;
            panel.querySelector("#source-diff-view").innerHTML = diff(sourceRead.source, src);
            if (src === sourceRead.source) return notice("Нет изменений");
            await invoke(
              "source_patch_guarded",
              { path: sourceRead.path, expected: sourceRead.source, source: src },
              (res) => {
                if (res.verifiedSource) {
                  sourceRead.source = src;
                  notice("Исходник подтверждён чтением. Runtime пока не проверен.");
                }
              },
            );
          };
        });
      r.querySelector("#source-checkpoints").onclick = () =>
        invoke("source_checkpoints", {}, (res) => {
          r.querySelector("#checkpoint-list").innerHTML =
            (res.checkpoints || [])
              .map(
                (c) =>
                  `<div class="ws-note"><b>${e(c.path)}</b><p>${e(c.id)}</p><button data-restore="${e(c.id)}" ${c.restored ? "disabled" : ""}>Восстановить source</button></div>`,
              )
              .join("") || "<p>Поддерживаемых checkpoints нет.</p>";
          r.querySelectorAll("[data-restore]").forEach(
            (x) =>
              (x.onclick = () =>
                invoke("source_restore_guarded", { checkpoint: x.dataset.restore })),
          );
        });
    }
    if (tab === "designer") {
      mountTools(r.querySelector("#design-tools"), (t) => /^gd_|^mechanic_list$/.test(t.name));
      r.querySelector("#design-new").onclick = () => designDialog();
      r.querySelectorAll("[data-design]").forEach(
        (x) => (x.onclick = () => designDetail(x.dataset.design)),
      );
    }
    if (tab === "qa")
      mountTools(r.querySelector("#qa-tools"), (t) =>
        /^(test_run|playtest_run|project_analyze|debug_logs|get_errors|start_stop_play|animation_analyze)/.test(
          t.name,
        ),
      );
    if (tab === "project") {
      r.querySelector("#graph-scan").onclick = () =>
        invoke(
          "workspace_graph",
          { root: r.querySelector("#graph-root").value, maxNodes: 1200 },
          async () => {
            state = await api("state");
            graphDetail(relevant("graph")[0]);
          },
        );
      graphDetail(relevant("graph")[0]);
      r.querySelector("#graph-watch").onclick = () => {
        graphWatching = !graphWatching;
        clearTimeout(graphTimer);
        r.querySelector("#graph-watch").textContent = graphWatching
          ? "Остановить наблюдение"
          : "Начать наблюдение";
        if (!graphWatching) {
          r.querySelector("#graph-live-status").textContent = "Наблюдение остановлено";
          return;
        }
        const binding = structuredClone(state.binding),
          scanRoot = r.querySelector("#graph-root").value;
        const tick = async () => {
          if (
            !graphWatching ||
            current !== "project" ||
            document.hidden ||
            document.querySelector("#project")?.classList.contains("hide")
          ) {
            graphWatching = false;
            r.querySelector("#graph-live-status").textContent =
              "Наблюдение остановлено: раздел не активен";
            r.querySelector("#graph-watch").textContent = "Начать наблюдение";
            return;
          }
          try {
            const previous = relevant("graph")[0]?.data;
            const out = await api("graph/refresh", { binding, root: scanRoot, confirm: true });
            if (!graphWatching || current !== "project") return;
            state = await api("state");
            const paths = new Map((previous?.nodes || []).map((n) => [n.path, n.className])),
              next = new Map((out.result.nodes || []).map((n) => [n.path, n.className]));
            const added = [...next.keys()].filter((k) => !paths.has(k)).length,
              removed = [...paths.keys()].filter((k) => !next.has(k)).length;
            r.querySelector("#graph-live-status").textContent =
              "Observed " +
              new Date(out.observedAt).toLocaleTimeString() +
              " · +" +
              added +
              " / −" +
              removed +
              " объектов · не проверка source/runtime";
            graphDetail(relevant("graph")[0]);
            graphTimer = setTimeout(tick, Number(r.querySelector("#graph-interval").value) * 1000);
          } catch (err) {
            graphWatching = false;
            r.querySelector("#graph-watch").textContent = "Начать наблюдение";
            r.querySelector("#graph-live-status").textContent =
              "Наблюдение остановлено: " + err.message;
          }
        };
        tick();
      };
    }
    if (tab === "vfx") bindVfx(r);
    if (tab === "integrations") {
      mountTools(r.querySelector("#integration-tools"), (t) => t.name === "image_status");
      r.querySelector("#provider-form").onsubmit = async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        try {
          await api("provider", {
            provider: f.get("provider"),
            url: f.get("url"),
            model: f.get("model"),
            confirm: f.has("confirm"),
          });
          await open("integrations");
          notice("Настройки сохранены. Реальное подключение ещё не проверено.");
        } catch (err) {
          notice(err.message, true);
        }
      };
    }
    if (tab === "settings") {
      r.querySelector("#settings-form").onsubmit = async (ev) => {
        ev.preventDefault();
        const f = new FormData(ev.target);
        try {
          await api("settings", {
            mode: f.get("mode"),
            toolTimeoutMs: Number(f.get("toolTimeoutMs")),
            approvalTimeoutMs: Number(f.get("approvalTimeoutMs")),
            autoSnapshot: f.has("autoSnapshot"),
            confirm: f.has("confirm"),
          });
          await open("settings");
          notice("Настройки сохранены.");
        } catch (err) {
          notice(err.message, true);
        }
      };
      r.querySelector("#optional-toggle").onclick = () => {
        const d = modal(
          "Встроенные инструменты",
          `<p>Регистрация возможностей не выполняет инструментов и не включает Skills или MCP.</p><label class="ws-ack"><input id="optional-ack" type="checkbox">Я подтверждаю ${state.optionalTools ? "отключение" : "включение"} composite tools.</label><button id="optional-confirm" class="gold">Сохранить</button>`,
        );
        d.querySelector("#optional-confirm").onclick = async () => {
          try {
            await api("optional-tools", {
              enabled: !state.optionalTools,
              confirm: d.querySelector("#optional-ack").checked,
            });
            d.close();
            await open("settings");
          } catch (err) {
            d.querySelector(".ws-error").textContent = err.message;
          }
        };
      };
    }
  }
  function conversationView() {
    const list = relevant("conversation");
    if (!conversationId || !list.some((r) => r.id === conversationId)) conversationId = list[0]?.id;
    const selected = list.find((r) => r.id === conversationId);
    const active =
      state.agent.status?.taskId === selected?.data.taskId &&
      ["running", "paused"].includes(state.agent.status?.state);
    return `<div class="ws-grid"><aside class="ws-card"><button id="conversation-new" class="gold">Новый диалог</button><div class="ws-list" style="margin-top:16px">${list.map((r) => `<button data-conversation="${r.id}" class="${r.id === conversationId ? "selected" : ""}"><b>${e(r.name)}</b><small>${e(state.agent.status?.taskId === r.data.taskId ? state.agent.status.state : r.data.lastState || "черновик")} · ${e(r.binding?.name || "без привязки")}</small></button>`).join("") || "<p>Нет диалогов текущей Studio.</p>"}</div></aside><div class="ws-card"><h2>${e(selected?.name || "API chat")}</h2><p class="ws-status">${e(state.agent.provider || "Provider не настроен")} · ${e(state.agent.model || "Model не задан")} · ${e(state.agent.status?.state || "idle")}</p>${selected ? `<div class="ws-messages">${(selected.data.messages || []).map((m) => `<article class="ws-message"><span class="ws-chip">${e(m.role)}${m.verification ? " · " + e(m.verification) : ""}</span><p>${e(m.text)}</p>${m.reason ? `<small>${e(m.reason)}</small>` : ""}</article>`).join("") || "<p>Сообщений пока нет.</p>"}</div>${state.agent.status?.taskId === selected.data.taskId ? (state.agent.approvals || []).map((a) => `<div class="ws-note"><h3>Подтверждение: ${e(a.tool)}</h3><p>${e(a.reason)}</p><pre>${json(a.args)}</pre><p>Аргументы в журнале могут быть сокращены. При сомнениях отклоните и уточните операцию.</p><div class="ws-toolbar"><button data-chat-approve="${e(a.id)}" class="gold">Разрешить эту операцию</button><button data-chat-reject="${e(a.id)}">Отклонить</button></div></div>`).join("") : ""}${active && state.agent.status.partialReply ? `<article class="ws-message"><span class="ws-chip">Потоковый ответ · не выполненная операция</span><pre>${e(state.agent.status.partialReply)}</pre></article>` : ""}<form id="conversation-form"><label>Сообщение<textarea name="text" rows="4" maxlength="12000" required></textarea></label><label>Режим<select name="mode"><option value="plan">Plan · только чтение</option><option value="supervised">Supervised · изменения с подтверждением</option></select></label><label>Критерии текущего запроса · JSON<textarea name="criteria" rows="3">[]</textarea></label><p>Без критериев результат остаётся PARTIAL, даже если модель написала «готово». Настоящие вызовы и approvals видны в Autopilot, запуск связан с задачей.</p><button class="gold" ${active || !state.agent.configured ? "disabled" : ""}>Отправить API-агенту</button></form><div class="ws-toolbar" style="margin-top:16px"><button data-chat-control="pause" ${!active || state.agent.status?.state !== "running" ? "disabled" : ""}>Пауза</button><button data-chat-control="resume" ${!active || state.agent.status?.state !== "paused" ? "disabled" : ""}>Продолжить</button><button data-chat-control="stop" ${!active ? "disabled" : ""}>Остановить</button><button id="conversation-export">Экспорт диалога</button></div><details style="margin-top:16px"><summary>Прогресс и tool-use</summary><pre>${json(state.agent.status?.taskId === selected.data.taskId ? state.agent.status?.log || [] : [])}</pre></details>` : "<p>Создайте диалог; API provider настраивается в Integrations. Это реальный API-путь, не подмена существующего browser-чата.</p>"}</div></div>`;
  }
  function bindConversation(r) {
    r.querySelector("#conversation-new").onclick = () => {
      const d = modal(
        "Новый API-диалог",
        '<form id="conversation-create"><label>Название<input name="name" required maxlength="180"></label><button class="gold">Создать без запуска</button></form>',
      );
      d.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        try {
          const a = await api("conversation/create", { name: new FormData(ev.target).get("name") });
          conversationId = a.record.id;
          d.close();
          await open("conversations");
        } catch (err) {
          d.querySelector(".ws-error").textContent = err.message;
        }
      };
    };
    r.querySelectorAll("[data-conversation]").forEach(
      (x) =>
        (x.onclick = () => {
          conversationId = x.dataset.conversation;
          open("conversations");
        }),
    );
    const selected = state.records.find((x) => x.id === conversationId);
    r.querySelector("#conversation-form")?.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(ev.target);
      try {
        await api("conversation/run", {
          id: selected.id,
          revision: selected.revision,
          text: f.get("text"),
          mode: f.get("mode"),
          criteria: JSON.parse(f.get("criteria")),
        });
        await open("conversations");
      } catch (err) {
        notice(err.message, true);
      }
    });
    r.querySelectorAll("[data-chat-approve],[data-chat-reject]").forEach(
      (x) =>
        (x.onclick = async () => {
          try {
            await api("approve", {
              id: x.dataset.chatApprove || x.dataset.chatReject,
              approve: !!x.dataset.chatApprove,
              acknowledge: true,
            });
            await open("conversations");
          } catch (err) {
            notice(err.message, true);
          }
        }),
    );
    r.querySelectorAll("[data-chat-control]").forEach(
      (x) =>
        (x.onclick = async () => {
          try {
            await api("conversation/control", {
              id: conversationId,
              action: x.dataset.chatControl,
            });
            await open("conversations");
          } catch (err) {
            notice(err.message, true);
          }
        }),
    );
    r.querySelector("#conversation-export")?.addEventListener("click", () =>
      download(selected.name + ".conversation.json", JSON.stringify(selected, null, 2)),
    );
    clearTimeout(conversationTimer);
    if (
      state.agent.status?.taskId === selected?.data.taskId &&
      ["running", "paused"].includes(state.agent.status?.state)
    )
      conversationTimer = setTimeout(async () => {
        if (
          current !== "conversations" ||
          document.querySelector("#api-conversations")?.classList.contains("hide") ||
          document.getElementById("chat")?.classList.contains("hide")
        )
          return;
        try {
          const next = await api("state");
          state = next;
          const form = r.querySelector("#conversation-form"),
            draft = form ? new FormData(form) : null,
            focused = document.activeElement?.getAttribute("name");
          {
            r.innerHTML = header() + conversationView();
            bindConversation(r);
            if (draft) {
              for (const [name, value] of draft) {
                const input = r.querySelector('#conversation-form [name="' + name + '"]');
                if (input) input.value = value;
              }
              if (focused)
                r.querySelector('#conversation-form [name="' + focused + '"]')?.focus({
                  preventScroll: true,
                });
            }
            r.querySelector("[data-refresh]").onclick = () => open("conversations");
            r.querySelector("#ws-studio").onchange = async (ev) => {
              try {
                const res = await fetch("/api/app-runtime/select", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Brickwire-App": token },
                  body: JSON.stringify({ studioId: ev.target.value }),
                });
                if (!res.ok) throw Error((await res.json()).error);
                await open("conversations");
              } catch (err) {
                notice(err.message, true);
              }
            };
          }
        } catch (err) {
          notice(err.message, true);
        }
      }, 500);
  }
  function mountTools(node, filter) {
    const all = state.tools.filter(filter);
    node.innerHTML = `<label>Поиск инструмента<input class="tool-search" placeholder="Имя или описание"></label><div class="ws-grid"><div class="ws-list tool-list"></div><div class="tool-detail"></div></div>`;
    function list(q = "") {
      const ts = all.filter((t) =>
        (t.name + " " + t.description).toLowerCase().includes(q.toLowerCase()),
      );
      node.querySelector(".tool-list").innerHTML =
        ts
          .map(
            (t) =>
              `<button data-tool="${e(t.name)}"><b>${e(t.name)}</b><small>${t.available ? e(t.risk) + " · доступен" : "недоступен"}</small></button>`,
          )
          .join("") ||
        "<p>Нет зарегистрированных инструментов. Включите composite tools в Settings. Наличие MCP-зависимости проверяется отдельно.</p>";
      node.querySelectorAll("[data-tool]").forEach(
        (x) =>
          (x.onclick = () => {
            const t = all.find((t) => t.name === x.dataset.tool);
            toolForm(node.querySelector(".tool-detail"), t);
          }),
      );
      if (ts[0]) toolForm(node.querySelector(".tool-detail"), ts[0]);
      else node.querySelector(".tool-detail").innerHTML = "";
    }
    node.querySelector(".tool-search").oninput = (ev) => list(ev.target.value);
    list();
  }
  function toolForm(node, t) {
    const props = t.inputSchema?.properties || {},
      required = t.inputSchema?.required || [];
    node.innerHTML = `<h3 style="margin-top:0">${e(t.name)}</h3><p>${e(t.description)}</p>${!t.available ? `<p class="ws-error">${e(t.unavailableReason)}</p>` : ""}<form class="tool-form">${Object.entries(
      props,
    )
      .map(
        ([k, s]) =>
          `<label>${e(k)} ${required.includes(k) ? "· обязательно" : ""}<small>${e(s.description || "")}</small>${s.enum ? `<select name="${e(k)}"><option value="">По умолчанию</option>${s.enum.map((v) => `<option>${e(v)}</option>`).join("")}</select>` : s.type === "boolean" ? `<select name="${e(k)}"><option value="">По умолчанию</option><option value="true">true</option><option value="false">false</option></select>` : ["array", "object"].includes(s.type) ? `<textarea rows="3" name="${e(k)}" placeholder="${s.type === "array" ? "[]" : "{}"}"></textarea>` : `<input name="${e(k)}" type="${["number", "integer"].includes(s.type) ? "number" : "text"}" ${s.type === "number" ? 'step="any"' : ""}>`}</label>`,
      )
      .join(
        "",
      )}<button class="gold" ${t.available ? "" : "disabled"}>Вызвать вручную</button></form><details style="margin-top:16px"><summary>Input schema</summary><pre>${json(t.inputSchema)}</pre></details>`;
    node.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const f = new FormData(ev.target),
          args = {};
        for (const [k, s] of Object.entries(props)) {
          const v = f.get(k);
          if (v === "") continue;
          args[k] = ["array", "object", "boolean"].includes(s.type)
            ? JSON.parse(v)
            : ["number", "integer"].includes(s.type)
              ? Number(v)
              : v;
        }
        await invoke(t.name, args);
      } catch (err) {
        notice(err.message, true);
      }
    };
  }
  async function invoke(tool, args, onResult) {
    const desc = state.tools.find((t) => t.name === tool);
    if (!desc?.available) {
      notice(
        desc?.unavailableReason ||
          "Инструмент не зарегистрирован. Включите composite tools в Settings.",
        true,
      );
      return null;
    }
    const d = modal(
      tool,
      `<p>${e(desc.description)}</p><p class="ws-status">${e(state.binding?.name || "Внешний/локальный инструмент")} · ${e(desc.risk)}</p><div id="ws-call-result"><p>Отправка…</p></div><div id="ws-call-approval" class="ws-toolbar"></div>${note("Закрытие окна не отменяет отправленную операцию. Не повторяйте изменяющий вызов с неизвестным исходом.")}`,
    );
    let env,
      approvalSeen,
      poll = true;
    d.addEventListener("close", () => (poll = false));
    async function show() {
      if (!poll) return;
      const n = d.querySelector("#ws-call-result"),
        a = d.querySelector("#ws-call-approval");
      if (env.state === "pending_approval") {
        n.innerHTML = `<p class="ws-status">Ожидает подтверждения: ${e(env.approvalReason)}</p><pre>${json({ server: desc.source, tool, args, target: state.binding })}</pre>`;
        if (approvalSeen !== env.approvalId) {
          approvalSeen = env.approvalId;
          a.innerHTML =
            '<button class="gold" data-yes>Подтвердить эту операцию</button><button data-no>Отклонить</button>';
          for (const [sel, approve] of [
            ["[data-yes]", true],
            ["[data-no]", false],
          ])
            a.querySelector(sel).onclick = async () => {
              a.querySelectorAll("button").forEach((x) => (x.disabled = true));
              await fetch("/api/approvals/" + env.approvalId, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ approve }),
              });
            };
        }
      } else if (env.state === "done") {
        a.innerHTML = "";
        n.innerHTML = `<p class="${env.result?.status === "success" ? "ws-status" : "ws-error"}">${e(env.result?.status || "unknown")}</p><pre>${json(env.result)}</pre><button id="receipt-export">Экспорт результата</button>`;
        n.querySelector("#receipt-export").onclick = () =>
          download(tool + "-receipt.json", JSON.stringify(env.result, null, 2));
        const result = env.result;
        if (result?.status === "success") {
          if (result.result?.captureId) {
            const c = await api("capture", { id: result.result.captureId });
            for (const image of c.images) {
              const img = document.createElement("img");
              img.className = "ws-studio-image";
              img.alt = "Фактический снимок Studio · " + c.at;
              img.src = `data:${image.mimeType};base64,${image.data}`;
              n.append(img);
            }
          }
          await onResult?.(result.result);
        } else notice(result?.error || result?.status, true);
        return;
      } else n.innerHTML = "<p>Выполняется…</p>";
      if (poll) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (!poll) return;
        const response = await fetch("/api/calls/" + env.callId + "?wait=100");
        if (!response.ok) throw Error("Не удалось получить состояние операции; исход неизвестен");
        env = await response.json();
        return show();
      }
    }
    try {
      env = await api("execute", { tool, args });
      await show();
      return env?.result;
    } catch (err) {
      if (poll) d.querySelector(".ws-error").textContent = err.message;
      notice(err.message, true);
      return null;
    }
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function diff(before, after) {
    const a = before.split("\n"),
      b = after.split("\n");
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
    let suffix = 0;
    while (
      suffix < a.length - prefix &&
      suffix < b.length - prefix &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    )
      suffix++;
    return `<h3>Diff · ${Math.max(0, a.length - prefix - suffix)} → ${Math.max(0, b.length - prefix - suffix)} строк</h3><pre class="ws-diff">${a
      .slice(Math.max(0, prefix - 3), prefix)
      .map((x) => "  " + e(x))
      .join("\n")}\n${a
      .slice(prefix, a.length - suffix)
      .map((x) => '<span class="removed">− ' + e(x) + "</span>")
      .join("\n")}\n${b
      .slice(prefix, b.length - suffix)
      .map((x) => '<span class="added">+ ' + e(x) + "</span>")
      .join("\n")}\n${b
      .slice(b.length - suffix, b.length - suffix + 3)
      .map((x) => "  " + e(x))
      .join("\n")}</pre>`;
  }
  function designDialog(record) {
    const data = record?.data || {
      concept: "",
      coreLoop: "",
      progression: "",
      economy: "",
      world: "",
      uiFlow: "",
      dependencies: [],
      objectPaths: [],
      goal: "",
      plan: [],
      criteria: [],
    };
    const d = modal(
      record ? "Редактировать дизайн" : "Новый дизайн",
      `<form id="design-form"><label>Название<input name="name" value="${e(record?.name || "")}" required></label><div class="ws-fields">${[
        ["concept", "Концепт"],
        ["coreLoop", "Core loop"],
        ["progression", "Прогрессия"],
        ["economy", "Экономика"],
        ["world", "Мир и уровни"],
        ["uiFlow", "UI flow"],
        ["goal", "Цель реализации"],
      ]
        .map(
          ([k, label]) =>
            `<label>${label}<textarea name="${k}" rows="3">${e(data[k])}</textarea></label>`,
        )
        .join(
          "",
        )}<label>Связи / объекты · JSON<textarea name="links" rows="3">${json({ dependencies: data.dependencies || [], objectPaths: data.objectPaths || [] })}</textarea></label><label class="wide">Шаги реализации · по строке<textarea name="plan" rows="4">${e((data.plan || []).join("\n"))}</textarea></label><label class="wide">Критерии · JSON (exists / property / script_contains)<textarea name="criteria" rows="4">${json(data.criteria || [])}</textarea></label></div><button class="gold">Сохранить черновик</button></form>`,
    );
    d.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const f = new FormData(ev.target),
          links = JSON.parse(f.get("links"));
        const next = {
          ...data,
          ...links,
          plan: String(f.get("plan")).split("\n").filter(Boolean),
          criteria: JSON.parse(f.get("criteria")),
        };
        for (const k of [
          "concept",
          "coreLoop",
          "progression",
          "economy",
          "world",
          "uiFlow",
          "goal",
        ])
          next[k] = String(f.get(k));
        await api("save", {
          id: record?.id,
          revision: record?.revision,
          kind: "design",
          name: f.get("name"),
          data: next,
        });
        d.close();
        await open("designer");
      } catch (err) {
        d.querySelector(".ws-error").textContent = err.message;
      }
    };
  }
  function designDetail(id) {
    const r = state.records.find((x) => x.id === id);
    const n = root().querySelector("#design-detail");
    n.innerHTML = `<h2>${e(r.name)}</h2><div class="ws-chips"><span class="ws-chip">Ревизия ${r.revision}</span><span class="ws-chip">${e(r.binding?.name || "Не привязан")}</span></div><pre>${json(r.data)}</pre><div class="ws-toolbar"><button id="design-edit">Редактировать</button><button id="design-export">Экспорт JSON</button><button id="design-task" class="gold">${r.data.taskId ? "Открыть связанную задачу" : "Создать связанную задачу"}</button></div><p>Задача создаётся в Supervised-режиме; запуск и проверки выполняются в Autopilot. Сохранение дизайна не меняет Studio.</p>`;
    n.querySelector("#design-edit").onclick = () => designDialog(r);
    n.querySelector("#design-export").onclick = () =>
      download(r.name + ".json", JSON.stringify(r, null, 2));
    n.querySelector("#design-task").onclick = async () => {
      try {
        if (r.data.taskId) {
          window.BrickwireRuntime?.selectTask(r.data.taskId);
          document.querySelector("nav [data-tab=autopilot]").click();
          return;
        }
        const a = await api("design-task", { id: r.id, revision: r.revision });
        await open("designer");
        notice("Создана задача " + a.task.id + " без выполнения. Откройте Autopilot.");
        designDetail(r.id);
      } catch (err) {
        notice(err.message, true);
      }
    };
  }
  function graphDetail(record) {
    const n = root()?.querySelector("#graph-detail");
    if (!n) return;
    if (!record) {
      n.innerHTML = "<p>Нет наблюдений текущей Studio.</p>";
      return;
    }
    const g = record.data;
    n.innerHTML = `<h3>Наблюдение ${e(g.observedAt || record.updatedAt)}</h3><p>${g.nodes?.length || 0} объектов · ${g.edges?.length || 0} связей · ${g.truncated ? "частичное сканирование" : "в пределах указанного корня"}</p><label>Поиск / impact target<input id="graph-search" placeholder="game.ServerScriptService.Main"></label><div class="ws-toolbar"><button id="graph-impact">Оценить связанные системы</button><button id="graph-export">Экспорт наблюдения</button></div><div id="graph-nodes"></div><div id="graph-impact-detail"></div>`;
    const list = () => {
      const q = n.querySelector("#graph-search").value.toLowerCase();
      n.querySelector("#graph-nodes").innerHTML = `<pre>${e(
        (g.nodes || [])
          .filter((x) => x.path.toLowerCase().includes(q))
          .slice(0, 100)
          .map((x) => x.className + " · " + x.path)
          .join("\n"),
      )}</pre><p>Показаны первые 100 совпадений. Полный наблюдённый список — в JSON.</p>`;
    };
    n.querySelector("#graph-search").oninput = list;
    list();
    n.querySelector("#graph-impact").onclick = async () => {
      try {
        const result = await api("impact", {
          id: record.id,
          path: n.querySelector("#graph-search").value,
        });
        n.querySelector("#graph-impact-detail").innerHTML =
          `<h3>Статические связи · не гарантия отсутствия регрессий</h3><pre>${json(result)}</pre>`;
      } catch (err) {
        notice(err.message, true);
      }
    };
    n.querySelector("#graph-export").onclick = () =>
      download("project-graph.json", JSON.stringify(record, null, 2));
  }
  function vfxView() {
    const duration = Math.max(
      ...vfx.layers.map((l) => Number(l.start || 0) + Number(l.duration || 1)),
      1,
    );
    return `<div class="ws-toolbar" style="margin-bottom:24px"><select id="vfx-load" aria-label="Сохранённые эффекты"><option value="">Сохранённые черновики</option>${relevant(
      "vfx",
    )
      .map(
        (r) =>
          `<option value="${r.id}" ${r.id === vfxRecord?.id ? "selected" : ""}>${e(r.name)}</option>`,
      )
      .join(
        "",
      )}</select><button id="vfx-save" class="gold">Сохранить</button><button id="vfx-duplicate">Дублировать</button><button id="vfx-export">Экспорт JSON</button><button id="vfx-install">Создать в Studio</button></div><div class="ws-grid"><aside class="ws-card"><label>Имя эффекта<input id="vfx-name" value="${e(vfx.name)}"></label><h3>Слои · ${vfx.layers.length}</h3><div class="ws-list">${vfx.layers.map((l, i) => `<button data-layer="${i}" class="${i === layerIndex ? "selected" : ""}"><b>${e(l.name)}</b><small>${e(l.type)} · ${l.start || 0}s → ${Number(l.start || 0) + Number(l.duration || 1)}s</small></button>`).join("")}</div><label style="margin-top:16px">Добавить слой<select id="vfx-layer-type">${["ring", "sphere", "block", "particles", "light"].map((x) => `<option>${x}</option>`).join("")}</select></label><button id="vfx-add">Добавить слой</button></aside><div><div class="ws-card"><h2>Inspector</h2><div id="vfx-inspector"></div></div><div class="ws-card"><h2>Timeline · ${duration.toFixed(2)}s</h2><div class="ws-timeline">${vfx.layers.map((l) => `<div class="ws-track"><span>${e(l.name)}</span><div class="ws-bar"><i style="left:${(Number(l.start || 0) / duration) * 100}%;width:${(Number(l.duration || 1) / duration) * 100}%;background:${/^#[0-9a-f]{6}$/i.test(l.color) ? l.color : "#d9b975"}"></i></div></div>`).join("")}</div><label>Время seek, сек<input id="vfx-time" type="range" min="0" max="${duration}" step=".05" value="0"></label><div class="ws-toolbar"><button id="vfx-play">Replay в Studio</button><button id="vfx-seek">Seek в Studio</button><button id="vfx-reset">Reset в Studio</button><button id="vfx-capture">Снимок Studio</button></div>${note("Это редактор времени, не 3D-превью. Replay создаёт эффект в Workspace настоящей Studio на [0,5,0]; Seek показывает геометрию, но не симулирует частицы. Эффект сам удаляет preview. Изображение появится только после реального screen_capture.")}</div></div></div>`;
  }
  function bindVfx(r) {
    r.querySelectorAll("[data-layer]").forEach(
      (x) =>
        (x.onclick = () => {
          layerIndex = Number(x.dataset.layer);
          rerenderVfx();
        }),
    );
    const l = vfx.layers[layerIndex];
    const inspector = r.querySelector("#vfx-inspector");
    inspector.innerHTML = `<form id="vfx-layer-form"><div class="ws-fields"><label>Имя<input name="name" value="${e(l.name)}"></label><label>Цвет<input type="color" name="color" value="${e(l.color || "#e3bd73")}"></label>${[
      ["start", 0],
      ["duration", 1],
      ["fromScale", 0.2],
      ["toScale", 1],
      ["fromTransparency", 0],
      ["toTransparency", 1],
      ["count", 30],
      ["brightness", 2],
    ]
      .filter(([k]) =>
        k === "count"
          ? l.type === "particles"
          : k === "brightness"
            ? l.type === "light"
            : l.type === "light"
              ? !["fromScale", "toScale", "fromTransparency", "toTransparency"].includes(k)
              : true,
      )
      .map(
        ([k, d]) =>
          `<label>${k}<input name="${k}" type="number" step="any" value="${l[k] ?? d}"></label>`,
      )
      .join(
        "",
      )}<label>Size [x,y,z]<input name="size" value="${e(JSON.stringify(l.size || [4, 1, 4]))}"></label><label>Offset [x,y,z]<input name="offset" value="${e(JSON.stringify(l.offset || [0, 0, 0]))}"></label></div><div class="ws-toolbar"><button class="gold">Применить параметры</button><button type="button" id="vfx-remove" ${vfx.layers.length === 1 ? "disabled" : ""}>Удалить слой</button></div></form>`;
    inspector.querySelector("form").onsubmit = (ev) => {
      ev.preventDefault();
      try {
        const f = new FormData(ev.target),
          next = { ...l };
        for (const k of ["name", "color"]) next[k] = String(f.get(k));
        for (const k of [
          "start",
          "duration",
          "fromScale",
          "toScale",
          "fromTransparency",
          "toTransparency",
          "count",
          "brightness",
        ]) {
          if (!f.has(k)) continue;
          next[k] = Number(f.get(k));
          if (!Number.isFinite(next[k]) || next[k] < 0)
            throw Error("Параметры должны быть конечными неотрицательными числами");
        }
        for (const k of ["size", "offset"]) {
          next[k] = JSON.parse(f.get(k));
          if (
            !Array.isArray(next[k]) ||
            next[k].length !== 3 ||
            next[k].some((x) => !Number.isFinite(x))
          )
            throw Error("Вектор требует [x,y,z]");
        }
        if (next.duration < 0.05 || next.start > 30 || next.duration > 30)
          throw Error("Duration .05..30, start 0..30");
        vfx.layers[layerIndex] = next;
        vfx.name = r.querySelector("#vfx-name").value;
        rerenderVfx();
      } catch (err) {
        notice(err.message, true);
      }
    };
    inspector.querySelector("#vfx-remove").onclick = () => {
      vfx.layers.splice(layerIndex, 1);
      layerIndex = 0;
      rerenderVfx();
    };
    r.querySelector("#vfx-name").onchange = (ev) => (vfx.name = ev.target.value);
    r.querySelector("#vfx-add").onclick = () => {
      if (vfx.layers.length >= 32) return notice("Лимит 32 слоя", true);
      vfx.layers.push({
        name: "Layer " + (vfx.layers.length + 1),
        type: r.querySelector("#vfx-layer-type").value,
        color: "#e3bd73",
        size: [4, 1, 4],
        start: 0,
        duration: 1,
      });
      layerIndex = vfx.layers.length - 1;
      rerenderVfx();
    };
    r.querySelector("#vfx-load").onchange = (ev) => {
      const rec = state.records.find((x) => x.id === ev.target.value);
      if (rec) {
        vfxRecord = rec;
        vfx = structuredClone(rec.data.spec);
        layerIndex = 0;
        rerenderVfx();
      }
    };
    r.querySelector("#vfx-save").onclick = async () => {
      try {
        const a = await api("save", {
          id: vfxRecord?.id,
          revision: vfxRecord?.revision,
          kind: "vfx",
          name: vfx.name,
          data: { spec: vfx },
        });
        vfxRecord = a.record;
        state = await api("state");
        rerenderVfx();
        notice("Черновик сохранён. Studio не изменена.");
      } catch (err) {
        notice(err.message, true);
      }
    };
    r.querySelector("#vfx-duplicate").onclick = () => {
      vfxRecord = undefined;
      vfx = structuredClone(vfx);
      vfx.name = vfx.name.slice(0, 48) + "_copy";
      rerenderVfx();
      notice("Копия ещё не сохранена и не установлена.");
    };
    r.querySelector("#vfx-export").onclick = () =>
      download(vfx.name + ".vfx.json", JSON.stringify(vfx, null, 2));
    r.querySelector("#vfx-install").onclick = () => {
      const d = modal(
        "Установить VFX",
        `<p>Создаётся owned template и Runtime ModuleScript в ReplicatedStorage.BW_TimelineVFX. Preview — отдельная операция. Свои существующие эффекты заменяются только явно, с копией в ServerStorage.</p><label class="ws-ack"><input id="vfx-replace" type="checkbox">Разрешаю замену одноимённого Brickwire-owned эффекта</label><button id="vfx-build" class="gold">Отправить на подтверждение</button>`,
      );
      d.querySelector("#vfx-build").onclick = () => {
        const replace = d.querySelector("#vfx-replace").checked;
        d.close();
        invoke("vfx_timeline_build", { spec: vfx, replace });
      };
    };
    for (const a of ["play", "seek", "reset"])
      r.querySelector("#vfx-" + a).onclick = () =>
        invoke("vfx_timeline_preview", {
          name: vfx.name,
          action: a,
          time: Number(r.querySelector("#vfx-time").value),
          position: [0, 5, 0],
        });
    r.querySelector("#vfx-capture").onclick = () => {
      const t = state.tools.find((t) => t.name === "screen_capture");
      if (!t) return notice("Studio MCP не предоставляет screen_capture", true);
      const d = modal(
        "Снимок Studio",
        '<p>Аргументы зависят от фактически подключённого Studio MCP.</p><div id="capture-tool"></div>',
      );
      toolForm(d.querySelector("#capture-tool"), t);
    };
  }
  function rerenderVfx() {
    const r = root();
    const head = r.querySelector(".ws-head")?.outerHTML,
      binding = r.querySelector(".ws-toolbar.ws-card")?.outerHTML;
    r.innerHTML =
      (head || "") +
      (binding || "") +
      '<p class="ws-notice ws-status" role="status"></p>' +
      vfxView();
    r.querySelector("[data-refresh]").onclick = () => open("vfx");
    r.querySelector("#ws-studio").onchange = async (ev) => {
      try {
        const res = await fetch("/api/app-runtime/select", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Brickwire-App": token },
          body: JSON.stringify({ studioId: ev.target.value }),
        });
        if (!res.ok) throw Error((await res.json()).error);
        await open("vfx");
      } catch (err) {
        notice(err.message, true);
      }
    };
    bindVfx(r);
  }
  async function assets() {
    try {
      state = await api("state");
      const n = document.querySelector("#asset-browser");
      n.innerHTML = `<h2>Bundled asset index</h2><p>Ассеты из существующих паков. Ниже сохраняется личная библиотека и её текущие ограничения лицензии.</p><div class="ws-toolbar"><input id="asset-query" placeholder="Название, категория, ID" style="flex:1"><select id="asset-kind"><option value="">Все типы</option>${[
        ...new Set((state.assets?.items || []).map((a) => a.kind)),
      ]
        .sort()
        .map((k) => `<option>${e(k)}</option>`)
        .join(
          "",
        )}</select><button id="asset-search">Найти</button></div><div class="ws-assets" id="asset-cards"></div><div class="ws-toolbar"><button id="asset-prev">Назад</button><button id="asset-next">Далее</button></div>`;
      async function search() {
        const data = await api("assets", {
          query: n.querySelector("#asset-query").value,
          kind: n.querySelector("#asset-kind").value,
          offset: assetOffset,
        });
        n.querySelector("#asset-cards").innerHTML =
          data.items
            .map((a) => {
              const saved = state.records.find(
                (r) => r.kind === "asset" && r.data.assetId === a.id && sameProject(r),
              );
              return `<div class="ws-card"><h3 style="margin-top:0">${e(a.name)}</h3><span class="ws-chip">${e(a.kind)} · ${e(a.category)}</span><p><code>${e(a.id)}</code></p><p>${a.parts === undefined ? "Parts: не указано" : a.parts + " parts"} · ${e((a.size || []).join(" × "))}</p><p>Source: ${e(a.original || "не указан")}; лицензию проверьте в исходном паке.</p><button data-favorite="${e(a.id)}">${saved ? "В избранном" : "В избранное"}</button><button data-reuse="${e(a.id)}" style="margin-top:8px">Код переиспользования</button></div>`;
            })
            .join("") || "<p>Не найдено. Записи ассетов не создавались.</p>";
        n.querySelector("#asset-prev").disabled = assetOffset === 0;
        n.querySelector("#asset-next").disabled = assetOffset + data.items.length >= data.total;
        n.querySelectorAll("[data-favorite]").forEach(
          (x) =>
            (x.onclick = async () => {
              try {
                const id = x.dataset.favorite;
                if (
                  state.records.some(
                    (r) => r.kind === "asset" && r.data.assetId === id && sameProject(r),
                  )
                )
                  return;
                const a = data.items.find((a) => a.id === id);
                await api("save", {
                  kind: "asset",
                  name: a.name,
                  data: {
                    assetId: id,
                    favorite: true,
                    source: a.original || null,
                    license: "See source pack; not inferred",
                    tags: [a.category, a.kind],
                  },
                });
                state = await api("state");
                await search();
              } catch (err) {
                x.textContent = err.message;
              }
            }),
        );
        n.querySelectorAll("[data-reuse]").forEach(
          (x) =>
            (x.onclick = () => {
              const code = `BW.asset(${JSON.stringify(x.dataset.reuse)}, {parent=workspace})`;
              const d = modal(
                "Переиспользование ассета",
                `<p>Это существующий BW helper. Просмотр кода не вставляет объект в Studio. Выполняйте отдельно через разрешённый инструмент с подтверждением.</p><pre>${e(code)}</pre><button id="asset-code-export">Экспорт .lua</button>`,
              );
              d.querySelector("#asset-code-export").onclick = () => download("asset.lua", code);
            }),
        );
      }
      n.querySelector("#asset-search").onclick = () => {
        assetOffset = 0;
        search();
      };
      n.querySelector("#asset-prev").onclick = () => {
        assetOffset = Math.max(0, assetOffset - 100);
        search();
      };
      n.querySelector("#asset-next").onclick = () => {
        assetOffset += 100;
        search();
      };
      await search();
    } catch (err) {
      document.querySelector("#asset-browser").innerHTML =
        `<p class="ws-error">${e(err.message)}</p>`;
    }
  }
  function drawMesh(canvas, m) {
    return window.Brickwire3D.mount(canvas, m);
  }
  window.BrickwireWorkspace = { open, assets };
})();
