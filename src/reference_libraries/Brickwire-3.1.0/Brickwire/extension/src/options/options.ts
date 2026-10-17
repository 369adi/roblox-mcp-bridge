import { PROVIDERS } from "../../../shared/src/providers.js";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../core/settings.js";
import type { HealthResponse, RuntimeResponse } from "../../../shared/src/protocol.js";

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const send = <T,>(m: unknown) => new Promise<RuntimeResponse<T>>((r) => chrome.runtime.sendMessage(m, (x: RuntimeResponse<T>) => r(x ?? { ok: false })));

async function init() {
  const s = await loadSettings();
  $("port").value = String(s.bridgePort);
  $("turns").value = String(s.maxAutoTurns);
  $("rem").value = String(s.reminderLimit);
  $("calls").value = String(s.maxCallsPerMessage);
  $("provs").innerHTML = PROVIDERS.map(
    (p) => `<label class="prov"><input type="checkbox" data-id="${p.id}" ${s.providers[p.id] ? "checked" : ""}>
      <span><b>${p.name}</b> <span class="tag ${p.status}">${p.status}</span><br><small>${p.hosts.join(", ")}</small><br><small class="mut">${p.notes}</small></span></label>`,
  ).join("");
  ($("floating") as HTMLInputElement).checked = !!s.panelFloating;
  $("customs").innerHTML = s.customSites.length
    ? s.customSites.map((c, i) => `<div class="cs"><span><b>${esc(c.name || c.host)}</b> <small class="mut">${esc(c.host)}</small></span><button data-del="${i}">Remove</button></div>`).join("")
    : '<small class="mut">No custom sites.</small>';
  $("customs").querySelectorAll<HTMLButtonElement>("button[data-del]").forEach(
    (b) =>
      (b.onclick = async () => {
        const cur = await loadSettings();
        const customSites = cur.customSites.filter((_, i) => i !== Number(b.dataset.del));
        await chrome.storage.local.set({ settings: { ...cur, customSites } });
        send({ type: "customSitesChanged" });
        $("c_add").onclick = async () => {
  const raw = $("c_host").value.trim().toLowerCase();
  const host = raw.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) {
    $("c_msg").textContent = "Enter a host like chat.example.com";
    return;
  }
  if (PROVIDERS.some((p) => p.hosts.includes(host))) {
    $("c_msg").textContent = "This site is already supported — enable it above.";
    return;
  }
  // must be requested from the click handler (user gesture)
  const granted: boolean = await new Promise((r) => chrome.permissions.request({ origins: [`https://${host}/*`] }, (g: boolean) => r(!!g)));
  if (!granted) {
    $("c_msg").textContent = "Permission denied — the site was not added.";
    return;
  }
  const cur = await loadSettings();
  const site = { host, name: $("c_name").value.trim() || undefined, composer: $("c_comp").value.trim() || undefined, send: $("c_send").value.trim() || undefined, stop: $("c_stop").value.trim() || undefined };
  const customSites = [...cur.customSites.filter((c) => c.host !== host), site];
  await chrome.storage.local.set({ settings: { ...cur, customSites } });
  await send({ type: "customSitesChanged" });
  $("c_msg").textContent = `Added ${host}. Open/reload it — the panel appears above the message box.`;
  ["c_host", "c_name", "c_comp", "c_send", "c_stop"].forEach((id) => ($(id).value = ""));
  void init();
};
void init();
      }),
  );
  const h = await send<HealthResponse>({ type: "bridge", method: "GET", path: "/api/health" });
  if (h.ok && h.data) ($("mode") as unknown as HTMLSelectElement).value = h.data.settings.mode;
  $("bstate").textContent = h.ok && h.data ? `${h.data.state} — ${h.data.reason}` : "Bridge offline";
}

$("save").onclick = async () => {
  const providers: Record<string, boolean> = {};
  document.querySelectorAll<HTMLInputElement>("#provs input[type=checkbox]").forEach((c) => (providers[c.dataset.id!] = c.checked));
  await saveSettings({
    bridgePort: Number($("port").value) || DEFAULT_SETTINGS.bridgePort,
    maxAutoTurns: Number($("turns").value) || DEFAULT_SETTINGS.maxAutoTurns,
    reminderLimit: Number($("rem").value),
    maxCallsPerMessage: Math.min(10, Math.max(1, Number($("calls").value) || 5)),
    providers,
    panelFloating: ($("floating") as HTMLInputElement).checked,
  });
  await send({ type: "bridge", method: "PUT", path: "/api/settings", body: { mode: ($("mode") as unknown as HTMLSelectElement).value } });
  $("saved").textContent = "Saved. Reload open AI tabs to apply provider changes.";
  void init();
};
void init();
