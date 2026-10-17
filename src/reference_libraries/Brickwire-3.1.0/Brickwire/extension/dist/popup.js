"use strict";
(() => {
  // extension/src/popup/popup.ts
  var $ = (id) => document.getElementById(id);
  var send = (m) => new Promise((r) => chrome.runtime.sendMessage(m, (x) => r(x ?? { ok: false })));
  function dot(el, cls) {
    el.className = "dot " + cls;
  }
  async function refresh() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const states = (await send({ type: "getTabStates" })).data ?? {};
    const ts = tab?.id !== void 0 ? states[String(tab.id)] : void 0;
    const r = await send({ type: "bridge", method: "GET", path: "/api/health" });
    const h = r.ok ? r.data : void 0;
    if (!h) {
      dot($("bdot"), "r");
      $("bridge").textContent = "Offline \u2014 run start.bat";
      dot($("sdot"), "");
      $("studio").textContent = "\u2014";
    } else {
      dot($("bdot"), "g");
      $("bridge").textContent = "Connected";
      const ready = h.state === "MCP_READY" || h.state === "SESSION_ACTIVE";
      dot($("sdot"), ready ? "g" : h.state === "ERROR" ? "r" : "y");
      $("studio").textContent = ready ? "Ready" : h.reason;
    }
    $("provider").textContent = ts ? ts.providerName : "Not on a supported AI site";
    $("project").textContent = h?.session?.projectName ?? h?.studio.selected?.name ?? "\u2014";
    const active = !!(h?.session || ts?.active);
    $("session").textContent = active ? `Active \xB7 ${ts?.stage ?? h?.session?.stage ?? ""}` : "None";
    $("stop").disabled = !active;
    $("stop").onclick = async () => {
      if (tab?.id !== void 0 && ts?.active) chrome.tabs.sendMessage(tab.id, { type: "agent:stop" }, () => void chrome.runtime.lastError);
      else if (h?.session) await send({ type: "bridge", method: "POST", path: "/api/sessions/stop", body: { sessionId: h.session.id } });
      setTimeout(refresh, 400);
    };
  }
  $("dash").onclick = () => send({ type: "openDashboard" });
  $("settings").onclick = () => chrome.runtime.openOptionsPage();
  void refresh();
  setInterval(refresh, 2500);
})();
