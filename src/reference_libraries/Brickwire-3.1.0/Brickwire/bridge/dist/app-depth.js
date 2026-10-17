(() => {
  const bar = document.createElement("header");
  bar.className = "depth-bar";
  bar.innerHTML =
    '<div class="depth-path"><span>Brickwire</span><span class="depth-slash">/</span><b id="depth-location">Workspace</b></div><div class="depth-meta"><div class="depth-lang" role="group" aria-label="Language"><button type="button" data-lang="ru">RU</button><button type="button" data-lang="en">EN</button></div><span class="depth-version">LOCAL WORKSPACE · 2.4</span></div>';
  const current = (window.BrickwireI18n && window.BrickwireI18n.lang) || "ru";
  bar.querySelectorAll("[data-lang]").forEach((b) => {
    b.setAttribute("aria-pressed", String(b.dataset.lang === current));
    b.onclick = () => b.dataset.lang !== current && window.BrickwireI18n && window.BrickwireI18n.set(b.dataset.lang);
  });
  document.querySelector("main").prepend(bar);
  const update = () => {
    const a = document.querySelector("nav a.on");
    document.querySelector("#depth-location").textContent = a?.textContent.trim() || "Workspace";
  };
  new MutationObserver(update).observe(document.querySelector("nav"), {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  update();
  const home = document.querySelector("#home"),
    intro = home.querySelector("h1");
  home.querySelector(".eyebrow").textContent = "WORKSPACE / CREATE / VERIFY";
  intro.textContent = "Идея. Геометрия. Результат.";
  home.querySelector(".sub").textContent =
    "Единое рабочее пространство для проекта Roblox. Создавайте локально, применяйте осознанно, проверяйте в Studio.";
  const hero = document.createElement("div");
  hero.className = "depth-home-hero";
  const copy = document.createElement("div");
  for (const el of [...home.children].slice(0, 3)) copy.append(el);
  hero.append(copy);
  const view = document.createElement("div");
  view.className = "depth-viewport";
  view.innerHTML =
    '<div class="depth-surface-label">PROCEDURAL GEOMETRY / LOCAL</div><canvas class="ws-preview" aria-label="Интерактивный локальный кристалл" tabindex="0"></canvas><div class="viewport-caption"><span>ORBIT · DRAG</span><span>Не снимок Studio</span></div>';
  hero.append(view);
  home.prepend(hero);
  const launch = document.createElement("div");
  launch.className = "depth-launch";
  for (const [tab, title, desc] of [
    ["lab", "3D & Motion", "Геометрия, ключевые кадры, rig"],
    ["vfx", "VFX Studio", "Слои, время, свет"],
    ["scripts", "Source Editor", "Diff, конфликты, checkpoints"],
    ["designer", "Game Designer", "Концепт и проверяемая задача"],
    ["paint", "Paint & UI", "Canvas и интерфейсы"],
    ["autopilot", "Autopilot", "План, инструменты, доказательства"],
  ]) {
    const b = document.createElement("button");
    b.innerHTML = "<b>" + title + "</b><small>" + desc + "</small>";
    b.onclick = () => document.querySelector("nav [data-tab=" + tab + "]").click();
    launch.append(b);
  }
  hero.after(launch);
  fetch("/api/app-mcp/access")
    .then((r) => r.json())
    .then((a) =>
      fetch("/api/workspace/mesh-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Brickwire-App": a.token },
        body: JSON.stringify({ type: "crystal", seed: 7, detail: 2 }),
      }),
    )
    .then((r) => r.json())
    .then((a) => {
      if (a.mesh) Brickwire3D.mount(view.querySelector("canvas"), a.mesh);
    })
    .catch(() => {
      view.querySelector(".viewport-caption").textContent = "Локальный просмотр недоступен";
    });
})();
