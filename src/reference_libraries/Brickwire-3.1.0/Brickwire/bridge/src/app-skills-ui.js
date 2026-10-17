(() => {
  "use strict";
  const root = document.getElementById("skills-root");
  if (!root) return;
  let token,
    data,
    mode = "skills",
    selected,
    filter = "",
    category = "all",
    detail,selectionEpoch=0;
  const esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  async function api(p, body, retried = false) {
    if (!token) {
      const r = await fetch("/api/app-mcp/access");
      const v = await r.json();
      if (!r.ok) throw Error(v.error);
      token = v.token;
    }
    const r = await fetch("/api/app-skills/" + p, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-Brickwire-App": token },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const v = await r.json();
    if (r.status === 403 && !retried) {
      token = null;
      return api(p, body, true);
    }
    if (!r.ok) throw Error(v.error);
    return v;
  }
  const notice = (message, bad = false) => {
    const n = root.querySelector(".skills-notice");
    if (n) {
      n.textContent = message;
      n.style.color = bad ? "#edaaaa" : "#d9b975";
    }
  };
  async function refresh() {
    try {
      data = await api("catalog");
      await select(selected);
    } catch (err) {
      root.innerHTML =
        '<h1>Skills & Templates</h1><p role="alert">' +
        esc(err.message) +
        '</p><button id="skills-retry">Повторить</button>';
      root.querySelector("button").onclick = refresh;
    }
  }
  function collection() {
    return data[mode].filter(
      (x) =>
        (category === "all" || x.category === category) &&
        (!filter || (x.name + " " + x.description + " " + x.id).toLowerCase().includes(filter.toLowerCase())),
    );
  }
  async function select(id) {
    const epoch=++selectionEpoch,all=collection(),target=all.some(x=>x.id===id)?id:all[0]?.id,kind=mode;
    const loaded=target?await api(kind==="skills"?"read":"template",{id:target}):null;
    if(epoch!==selectionEpoch)return;
    selected=target;detail=loaded;render();
  }
  function render() {
    const items = collection();
    root.innerHTML = `<div class="skills-head"><div><div class="skills-kicker">KNOWLEDGE / REFERENCES / REUSE</div><h1>Skills & Templates</h1><p>Инструкции для агента и исходники шаблонов — отдельно от инструментов и MCP.</p></div><div class="skills-actions"><button id="skills-refresh">Обновить</button><button id="skills-import" class="gold">Импорт Skill</button></div></div><div class="skills-notice" role="status" aria-live="polite">${esc(data.error || "")}</div><div class="skills-tabs"><button data-mode="skills" class="${mode === "skills" ? "selected" : ""}">Skills · ${data.skills.length}</button><button data-mode="templates" class="${mode === "templates" ? "selected" : ""}">Templates · ${data.templates.length}</button></div><div class="skills-filters"><input id="skills-search" aria-label="Поиск Skills и шаблонов" placeholder="Имя, назначение или ID" value="${esc(filter)}"><select id="skills-category" aria-label="Категория"><option value="all">Все категории</option>${[...new Set(data[mode].map((x) => x.category))].map((c) => `<option ${category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div><div class="skills-grid"><aside class="skills-list">${items.map((s) => `<button data-select="${esc(s.id)}" class="${s.id === selected ? "selected" : ""}"><b>${esc(s.name)}</b><small>${esc(s.category)} · ${mode === "skills" ? (s.enabled ? "Активен" : "Доступен, выключен") : "Исходник · не запускался"}</small></button>`).join("") || "<p>Ничего не найдено.</p>"}</aside><div>${detail ? (mode === "skills" ? skillPanel() : templatePanel()) : '<div class="skills-empty">Измените поиск или импортируйте инструкции. Импорт не включает Skill и не запускает код.</div>'}</div></div><p class="skills-source">Исходные файлы сохранены с SHA-256. Формулировки «verified», «60 FPS», «production-ready» в справочниках не являются результатами проверки Brickwire.</p>`;
    root.querySelector("#skills-refresh").onclick = refresh;
    root.querySelector("#skills-import").onclick = importDialog;
    root.querySelectorAll("[data-mode]").forEach(
      (b) =>
        (b.onclick = async () => {
          mode = b.dataset.mode;
          category = "all";
          filter = "";
          await select();
        }),
    );
    root.querySelectorAll("[data-select]").forEach(
      (b) =>
        (b.onclick = async () => {
          try {
            await select(b.dataset.select);
            if(innerWidth<=1000)root.querySelector(".skills-card")?.scrollIntoView({block:"start",behavior:"auto"});
          } catch (err) {
            notice(err.message, true);
          }
        }),
    );
    root.querySelector("#skills-search").oninput = async (ev) => {
      filter = ev.target.value;
      const pos = ev.target.selectionStart;
      try {
        await select(selected);
        const i = root.querySelector("#skills-search");
        i.focus();
        i.setSelectionRange(pos, pos);
      } catch (err) {
        notice(err.message, true);
      }
    };
    root.querySelector("#skills-category").onchange = async (ev) => {
      category = ev.target.value;
      await select(selected);
    };
    root.querySelector("#skills-toggle")?.addEventListener("click", () => toggleDialog());
    root.querySelector("#skills-export")?.addEventListener("click", async () => {
      try {
        download(
          JSON.stringify(await api("export", { id: selected }), null, 2),
          selected + ".skill.json",
          "application/json",
        );
        notice("Пакет экспортирован. Это JSON-инструкции, не исполняемый инструмент.");
      } catch (err) {
        notice(err.message, true);
      }
    });
    root.querySelector("#skills-remove")?.addEventListener("click", removeDialog);
    root
      .querySelectorAll("[data-resource]")
      .forEach((b) => (b.onclick = () => resourceDialog(b.dataset.resource)));
    root
      .querySelector("#template-download")
      ?.addEventListener("click", () => download(detail.source, selected + ".lua", "text/plain"));
  }
  function skillPanel() {
    const s = detail,
      meta = data.skills.find((x) => x.id === selected);
    return `<article class="skills-card"><span class="skills-status ${s.enabled ? "active" : ""}">${s.enabled ? "Активен для следующего запуска агента" : "Доступен · выключен"}</span><h2>${esc(s.name)}</h2><p>${esc(s.description)}</p><p class="skills-label">${esc(s.id)} · ${esc(s.version)} · ${esc(meta.compatibility)} · не исполняемый инструмент</p><div class="skills-actions"><button id="skills-toggle" class="${s.enabled ? "" : "gold"}" ${data.error ? "disabled" : ""}>${s.enabled ? "Выключить" : "Включить явно"}</button><button id="skills-export">Экспорт JSON</button>${s.sourceType === "user-import" ? '<button id="skills-remove">Удалить импорт</button>' : ""}</div><h3>Адаптация для Brickwire</h3><pre class="skills-body">${esc(s.body)}</pre>${s.warnings.length||meta.missingTools.length?`<div class="skills-warnings"><ul>${s.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>${meta.missingTools.length ? `<p>Не обнаружены зависимости: ${esc(meta.missingTools.join(", "))}. Инструкции не устанавливают эти инструменты.</p>` : ""}</div>`:""}<h3>Источники и зависимости · ${s.resourceIndex.length}</h3>${s.resourceIndex.map((r) => `<div class="skills-reference"><span>${esc(r.name)}<small>${esc(r.kind)} · ${Math.ceil(r.bytes / 1024)} KB · ${esc(r.sha256.slice(0, 12))}</small></span><button data-resource="${r.id}">Открыть</button></div>`).join("")}<h3>Лицензия и проверка</h3><p>${esc(s.license)}</p><p>Импорт и статический просмотр не подтверждают работу в Studio. Включение Skill не даёт права изменять проект и не включает MCP.</p></article>`;
  }
  function templatePanel() {
    const t = detail;
    return `<article class="skills-card"><span class="skills-status">Экспорт исходника · не запускался</span><h2>${esc(t.name)}</h2><p>${esc(t.description)}</p><p class="skills-label">${esc(t.id)} · ${esc(t.category)} · Skill ${esc(t.skillId)}</p><div class="skills-actions"><button id="template-download" class="gold">Скачать .lua</button></div><div class="skills-warnings">${t.warnings.map((w) => `<p>${esc(w)}</p>`).join("")}<p>Этот экран не устанавливает и не запускает шаблон. Для изменений используйте существующие инструменты задачи с отдельным подтверждением и проверкой результата.</p></div><h3>${t.category === "UI" ? "Kit + template · собранный исходник" : "Исходник модели"}</h3><p class="skills-label">${t.chars} символов · SHA-256 ${esc(t.sha256)}</p><pre class="skills-code">${esc(t.source)}</pre></article>`;
  }
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function modal(title, body) {
    const d = document.createElement("dialog");
    d.className = "skills-dialog";
    d.innerHTML = `<h2>${esc(title)}</h2>${body}<p class="skills-error" role="alert"></p><div class="skills-actions"><button class="skills-close">Закрыть</button></div>`;
    document.body.append(d);
    d.querySelector(".skills-close").onclick = () => d.close();
    d.onclose = () => d.remove();
    d.showModal();
    return d;
  }
  function toggleDialog() {
    if (detail.enabled) {
      api("enable", { id: selected, enabled: false })
        .then(refresh)
        .catch((err) => notice(err.message, true));
      return;
    }
    const d = modal(
      "Включить инструкции для агента",
      `<p>${esc(detail.name)}</p><p>Skill не добавляет инструментов, не даёт разрешений и не запускает шаблоны. Контекст меняется для следующего запуска/сессии; уже отправленный контекст нельзя изъять из модели.</p><label class="check"><input type="checkbox" id="skills-ack">Я разрешаю агенту использовать эти инструкции в рамках текущих правил безопасности.</label><button id="skills-confirm-enable" class="gold">Включить Skill</button>`,
    );
    d.querySelector("#skills-confirm-enable").onclick = async () => {
      try {
        await api("enable", {
          id: selected,
          enabled: true,
          acknowledge: d.querySelector("#skills-ack").checked,
        });
        d.close();
        await refresh();
      } catch (err) {
        d.querySelector(".skills-error").textContent = err.message;
      }
    };
  }
  function removeDialog() {
    const d = modal(
      "Удалить импорт",
      `<p>Удалится только локальный импорт инструкций. Внешние изменения Studio не отменяются.</p><button id="skills-confirm-remove">Подтвердить удаление</button>`,
    );
    d.querySelector("#skills-confirm-remove").onclick = async () => {
      try {
        await api("remove", { id: selected, confirm: true });
        d.close();
        await refresh();
      } catch (err) {
        d.querySelector(".skills-error").textContent = err.message;
      }
    };
  }
  function importDialog() {
    const d = modal(
      "Импортировать Skill",
      `<p>Принимается JSON brickwire-skill-pack v1 (экспорт этого раздела). ZIP, локальные команды и MCP-конфигурации здесь не исполняются. Новый Skill остаётся выключенным.</p><label>Файл .skill.json<input type="file" accept=".json,application/json" id="skills-file"></label><label class="check"><input type="checkbox" id="skills-import-ack">Я доверяю источнику и разрешаю сохранить этот пакет инструкций, без включения и запуска.</label><button id="skills-confirm-import" class="gold">Импортировать выключенным</button>`,
    );
    d.querySelector("#skills-confirm-import").onclick = async () => {
      try {
        const f = d.querySelector("#skills-file").files[0];
        if (!f) throw Error("Выберите JSON-файл");
        if (f.size > 1500000) throw Error("Размер пакета превышает 1.5 MB");
        const r = await api("import", {
          authorize: d.querySelector("#skills-import-ack").checked,
          pack: JSON.parse(await f.text()),
        });
        mode = "skills";
        filter = "";
        category = "all";
        selected = r.id;
        d.close();
        await refresh();
        notice(
          r.duplicate ? "Этот пакет уже сохранён, дубликат не создан." : "Skill импортирован и выключен.",
        );
      } catch (err) {
        d.querySelector(".skills-error").textContent = err.message;
      }
    };
  }
  async function resourceDialog(id) {
    const skillId = selected,
      d = modal(
        "Источник · чтение без исполнения",
        '<p class="skills-resource-info"></p><pre class="skills-code"></pre><button class="skills-next">Следующая часть</button>',
      );
    let offset = 0;
    const load = async () => {
      try {
        const r = await api("resource", { skillId, resourceId: id, offset });
        d.querySelector(".skills-resource-info").textContent =
          `${r.name} · ${r.offset}…${r.offset + r.text.length} / ${r.totalChars} · SHA-256 ${r.sha256}`;
        d.querySelector("pre").textContent = r.text;
        offset = r.nextOffset;
        d.querySelector(".skills-next").disabled = offset === null;
      } catch (err) {
        d.querySelector(".skills-error").textContent = err.message;
      }
    };
    d.querySelector(".skills-next").onclick = load;
    await load();
  }
  window.BrickwireSkills = { refresh };
})();
