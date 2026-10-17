import type { HealthResponse, RuntimeResponse, TabAgentState } from "../../../shared/src/protocol.js";

const $ = (id: string) => document.getElementById(id)!;
const send = <T,>(m: unknown) => new Promise<RuntimeResponse<T>>((r) => chrome.runtime.sendMessage(m, (x: RuntimeResponse<T>) => r(x ?? { ok: false })));

function dot(el: HTMLElement, cls: string) {
  el.className = "dot " + cls;
}

async function refresh() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const states = (await send<Record<string, TabAgentState>>({ type: "getTabStates" })).data ?? {};
  const ts = tab?.id !== undefined ? states[String(tab.id)] : undefined;
  const r = await send<HealthResponse>({ type: "bridge", method: "GET", path: "/api/health" });
  const h = r.ok ? r.data : undefined;
  if (!h) {
    dot($("bdot"), "r");
    $("bridge").textContent = "Offline — run start.bat";
    dot($("sdot"), "");
    $("studio").textContent = "—";
  } else {
    dot($("bdot"), "g");
    $("bridge").textContent = "Connected";
    const ready = h.state === "MCP_READY" || h.state === "SESSION_ACTIVE";
    dot($("sdot"), ready ? "g" : h.state === "ERROR" ? "r" : "y");
    $("studio").textContent = ready ? "Ready" : h.reason;
  }
  $("provider").textContent = ts ? ts.providerName : "Not on a supported AI site";
  $("project").textContent = h?.session?.projectName ?? h?.studio.selected?.name ?? "—";
  const active = !!(h?.session || ts?.active);
  $("session").textContent = active ? `Active · ${ts?.stage ?? h?.session?.stage ?? ""}` : "None";
  ($("stop") as HTMLButtonElement).disabled = !active;
  $("stop").onclick = async () => {
    if (tab?.id !== undefined && ts?.active) chrome.tabs.sendMessage(tab.id, { type: "agent:stop" }, () => void chrome.runtime.lastError);
    else if (h?.session) await send({ type: "bridge", method: "POST", path: "/api/sessions/stop", body: { sessionId: h.session.id } });
    setTimeout(refresh, 400);
  };
}

$("dash").onclick = () => send({ type: "openDashboard" });
$("settings").onclick = () => chrome.runtime.openOptionsPage();
void refresh();
setInterval(refresh, 2500);
