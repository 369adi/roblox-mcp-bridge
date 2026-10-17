(() => {
  "use strict";
  let token, selected, state, timer;
  const root = document.getElementById("runtime-root");
  if (!root) return;
  const e = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  async function api(p, body) {
    if (!token) {
      const r = await fetch("/api/app-mcp/access");
      const a = await r.json();
      if (!r.ok) throw Error(a.error);
      token = a.token;
    }
    const r = await fetch("/api/app-runtime/" + p, {
      headers: { "Content-Type": "application/json", "X-Brickwire-App": token },
      method: body === undefined ? "GET" : "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const a = await r.json();
    if (!r.ok) throw Error(a.error);
    return a;
  }
  const report = (message, bad = false) => {
    const node = root.querySelector("#runtime-notice");
    if (node) {
      node.textContent = message;
      node.style.color = bad ? "#eea5a5" : "#d9b975";
    }
  };
  const labels = {
    PLANNED: "План",
    RUNNING: "В работе",
    PAUSED: "Пауза",
    PARTIAL: "Не подтверждено",
    BLOCKED: "Заблокировано",
    FAILED: "Проверка не пройдена",
    DONE: "Критерии подтверждены",
    CANCELLED: "Отменено",
  };
  async function refresh() {
    try {
      state = await api("state");
      if (!selected || !state.tasks.some((t) => t.id === selected)) selected = state.tasks[0]?.id;
      render();
    } catch (err) {
      root.innerHTML = `<h1>Autopilot</h1><p role="alert">${e(err.message)}</p><button id="runtime-retry">Повторить</button>`;
      root.querySelector("button").onclick = refresh;
    }
  }
  function render() {
    const t = state.tasks.find((t) => t.id === selected);
    root.innerHTML = `<div class="runtime-head"><div><div class="runtime-kicker">PROJECT / TASK / EVIDENCE</div><h1>Autopilot</h1><p>Управление задачами и структурная проверка результата.</p></div><button id="runtime-refresh">Обновить</button></div><div id="runtime-notice" role="status" aria-live="polite"></div><div class="runtime-binding"><label>Целевая Studio <select id="runtime-studio"><option value="">Выберите Studio</option>${state.studios.map((s) => `<option value="${e(s.id)}" ${state.binding?.studioId === s.id ? "selected" : ""}>${e(s.name)} · ${e(s.id)}</option>`).join("")}</select></label><p>${e(state.binding ? "Привязка: " + state.binding.projectKey : "Studio не подключена. Создание и проверка задач заблокированы.")}</p></div><div class="runtime-grid"><aside><button id="runtime-new" class="gold">Новая задача</button><div class="runtime-list">${state.tasks.map((x) => `<button data-task="${x.id}" class="${x.id === selected ? "selected" : ""}"><b>${e(x.goal.slice(0, 100))}</b><small>${e(labels[x.state])} · ${e(x.binding.name)}</small></button>`).join("") || "<p>Пока нет задач. Задайте цель и проверяемые критерии.</p>"}</div></aside><div>${t ? detail(t) : '<div class="runtime-card"><h2>От идеи к подтверждённому результату</h2><p>Выберите Studio, сохраните цель, план и критерии. Затем запускайте существующие инструменты с контролем разрешений.</p><p>Настроенный API-агент работает через существующий исполнительный слой. Визуальная и Play QA, генераторы и полный workflow — следующие этапы.</p></div>'}</div></div><p class="runtime-limits">Проверяется структура, не внешний вид или игровой сценарий. Pause/Cancel блокирует новые вызовы, но не отменяет уже отправленную операцию. Полный rollback и Live Game Graph пока не реализованы.</p>`;
    root.querySelector("#runtime-refresh").onclick = refresh;
    root.querySelector("#runtime-new").onclick = createDialog;
    root.querySelector("#runtime-studio").onchange = async (ev) => {
      if (!ev.target.value) return;
      try {
        await api("select", { studioId: ev.target.value });
        await refresh();
      } catch (err) {
        report(err.message, true);
      }
    };
    root.querySelectorAll("[data-task]").forEach(
      (x) =>
        (x.onclick = () => {
          selected = x.dataset.task;
          render();
        }),
    );
    root
      .querySelectorAll("[data-action]")
      .forEach((x) => (x.onclick = () => action(x.dataset.action)));
    root.querySelectorAll("[data-runtime-approve],[data-runtime-reject]").forEach(
      (x) =>
        (x.onclick = async () => {
          try {
            const r = await fetch(
              "/api/approvals/" + (x.dataset.runtimeApprove || x.dataset.runtimeReject),
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ approve: !!x.dataset.runtimeApprove }),
              },
            );
            if (!r.ok) throw Error("Approval no longer available");
            await refresh();
          } catch (err) {
            report(err.message, true);
          }
        }),
    );
    root.querySelector("#runtime-execute")?.addEventListener("click", execute);
  }
  function detail(t) {
    const ops = state.operations.filter((o) => o.taskId === t.id);
    return `<div class="runtime-card"><div class="runtime-head"><h2>${e(t.goal)}</h2><span class="runtime-state">${e(labels[t.state])}</span></div><p>${e(t.binding.name)} · ${e(t.binding.studioId)} · ${e(t.mode)}</p><p>${t.calls}/${t.maxCalls} вызовов · лимит ${t.maxMinutes} мин · ревизия ${t.revision}</p>${t.reason ? `<p role="status">${e(t.reason)}</p>` : ""}<div class="runtime-actions">${["start", "resume", "pause", "cancel", "verify", "claim", "agent"].map((a, i) => `<button data-action="${a}" ${(a === "start" && t.state !== "PLANNED") || (a === "resume" && !["PAUSED", "PARTIAL", "BLOCKED"].includes(t.state)) || (a === "pause" && t.state !== "RUNNING") || (a === "cancel" && ["DONE", "CANCELLED"].includes(t.state)) || (a === "verify" && t.state !== "RUNNING") || (a === "agent" && (t.state !== "RUNNING" || !state.agent.configured || ["running", "paused"].includes(state.agent.status.state))) ? "disabled" : ""}>${["Начать", "Продолжить", "Пауза", "Отменить", "Проверить критерии", "Оценить завершение", "Запустить API-агента"][i]}</button>`).join("")}</div><p>${e(state.agent.configured ? "API-агент: " + state.agent.status.state : "API-агент не настроен. Используйте существующие BRICKWIRE_LLM_PROVIDER / URL / MODEL / KEY в .env; секреты здесь не вводятся.")}</p>${(
      state.approvals || []
    )
      .filter((a) => a.sessionId === t.sessionId)
      .map(
        (a) =>
          `<div class="runtime-criterion"><b>Подтверждение · ${e(a.tool)}</b><p>${e(a.reason)}</p><pre>${e(JSON.stringify(a.args, null, 2))}</pre><div class="runtime-actions"><button data-runtime-approve="${e(a.id)}">Разрешить эту операцию</button><button data-runtime-reject="${e(a.id)}">Отклонить</button></div></div>`,
      )
      .join(
        "",
      )}<h3>План</h3>${t.plan.length ? `<ol>${t.plan.map((p) => `<li>${e(p.title)} · запланировано</li>`).join("")}</ol>` : "<p>План не задан.</p>"}<h3>Критерии и доказательства</h3>${
      t.criteria
        .map((c) => {
          const ev = t.evidence.find((v) => v.criterionId === c.id);
          return `<div class="runtime-criterion"><b>${e(c.label)}</b><code>${e(c.path)}${c.property ? " · " + e(c.property) : ""}</code><span>${e(ev?.status || "untested")}</span>${ev ? `<pre>${e(JSON.stringify({ observed: ev.observed, at: ev.at, revision: ev.revision, reason: ev.reason }, null, 2))}</pre>` : ""}</div>`;
        })
        .join("") || "<p>Без критериев DONE невозможен.</p>"
    }<h3>Ручной вызов инструмента</h3><p>Это ручная операция, не действие AI. Изменяющие вызовы проходят текущую политику разрешений. Неизвестный исход требует инспекции.</p><label>Инструмент<select id="runtime-tool">${state.tools
      .filter((x) => x.available)
      .map((x) => `<option value="${e(x.name)}">${e(x.name)} · ${e(x.risk)}</option>`)
      .join(
        "",
      )}</select></label><label>Аргументы — JSON<textarea id="runtime-args" rows="4">{}</textarea></label><button id="runtime-execute" ${t.state !== "RUNNING" ? "disabled" : ""}>Вызвать в этой задаче</button><h3>Журнал операций · ${ops.length}</h3>${
      ops
        .slice(0, 20)
        .map(
          (o) =>
            `<div class="runtime-criterion"><b>${e(o.tool)} · ${e(o.result?.status || o.state)}</b><code>${e(o.id)}</code><small>${e(o.createdAt)} · ${e(o.binding?.name || "внешний сервер")}</small>${o.result?.error ? `<p>${e(o.result.error)}</p>` : ""}</div>`,
        )
        .join("") || "<p>Операции ещё не выполнялись.</p>"
    }</div>`;
  }
  async function action(a) {
    try {
      await api(`tasks/${selected}/${a}`, {});
      await refresh();
      report(
        a === "verify"
          ? "Проверки выполнены. DONE требует отдельной оценки всех критериев."
          : "Состояние задачи обновлено.",
      );
    } catch (err) {
      report(err.message, true);
    }
  }
  async function execute() {
    let args;
    try {
      args = JSON.parse(root.querySelector("#runtime-args").value);
      const tool = root.querySelector("#runtime-tool").value;
      const result = await api(`tasks/${selected}/execute`, {
        tool,
        args,
        actionId: "manual_" + crypto.randomUUID(),
      });
      showResult(result);
    } catch (err) {
      report(err.message, true);
    }
  }
  function modal(title, content) {
    const d = document.createElement("dialog");
    d.className = "runtime-dialog";
    d.innerHTML = `<h2>${e(title)}</h2>${content}<button class="runtime-close">Закрыть</button>`;
    document.body.append(d);
    d.querySelector(".runtime-close").onclick = () => d.close();
    d.onclose = () => d.remove();
    d.showModal();
    return d;
  }
  function showResult(initial) {
    const d = modal("Результат операции", '<div class="runtime-output"></div>');
    const output = d.querySelector(".runtime-output");
    let stopped = false;
    d.addEventListener("close", () => {
      stopped = true;
      refresh();
    });
    async function update(env) {
      if (stopped) return;
      output.innerHTML = `<p>${e(env.state)}</p><pre>${e(JSON.stringify(env.result ?? env, null, 2))}</pre>`;
      if (env.state === "pending_approval") {
        const btn = document.createElement("button");
        btn.textContent = "Подтвердить эту операцию";
        const reject = document.createElement("button");
        reject.textContent = "Отклонить";
        for (const [b, approve] of [
          [btn, true],
          [reject, false],
        ]) {
          b.onclick = async () => {
            try {
              const r = await fetch("/api/approvals/" + env.approvalId, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ approve }),
              });
              if (!r.ok) throw Error("Confirmation failed");
              b.disabled = true;
            } catch (err) {
              b.textContent = err.message;
            }
          };
          output.append(b);
        }
      }
      if (env.state !== "done")
        setTimeout(async () => {
          if (stopped) return;
          try {
            const r = await fetch("/api/calls/" + env.callId + "?wait=1000");
            await update(await r.json());
          } catch (err) {
            output.textContent = err.message;
          }
        }, 500);
    }
    update(initial);
  }
  function createDialog() {
    const d = modal(
      "Новая задача",
      `<form><label>Цель<textarea name="goal" required rows="3"></textarea></label><label>Режим<select name="mode"><option value="plan">Plan · только чтение</option><option value="supervised" selected>Supervised · подтверждение изменений</option><option value="autopilot">Autopilot · текущая политика разрешений</option></select></label><div class="runtime-actions"><label>Лимит вызовов<input name="maxCalls" type="number" min="1" max="500" value="40"></label><label>Минуты<input name="maxMinutes" type="number" min="1" max="120" value="15"></label></div><label>Шаги плана — по строке<textarea name="plan" rows="3"></textarea></label><label>Критерии — JSON-массив<textarea name="criteria" rows="6">[{"kind":"exists","path":"game.Workspace","label":"Workspace доступен"}]</textarea></label><p>Типы: exists, property (property + expected), script_contains (text). Это структурная приёмка, не Play-тест.</p><p role="alert" class="runtime-form-error"></p><button type="submit" class="gold">Сохранить без выполнения</button></form>`,
    );
    d.querySelector("form").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        const f = new FormData(ev.target);
        const r = await api("tasks", {
          goal: f.get("goal"),
          mode: f.get("mode"),
          maxCalls: Number(f.get("maxCalls")),
          maxMinutes: Number(f.get("maxMinutes")),
          plan: String(f.get("plan")).split("\n").filter(Boolean),
          criteria: JSON.parse(f.get("criteria")),
        });
        selected = r.task.id;
        d.close();
        await refresh();
      } catch (err) {
        d.querySelector(".runtime-form-error").textContent = err.message;
      }
    };
  }
  setInterval(() => {
    if (
      !document.getElementById("autopilot")?.classList.contains("hide") &&
      !document.querySelector("dialog[open]")
    ) {
      if (["running", "paused"].includes(state?.agent?.status?.state)) refresh();
    }
  }, 2500);
  window.BrickwireRuntime = {
    refresh,
    selectTask: (id) => {
      selected = id;
    },
  };
})();
