/**
 * Roblox Studio plugin ⇄ this chat tab (through the bridge, see shared/src/plugin-hub.ts).
 * Works in background tabs too (the user is in Studio): timers come from the extension clock.
 */
import type { AgentCore } from "./agent-core.js";
import type { ProviderAdapter } from "../adapters/base.js";
import { every } from "./clock.js";
import type { RuntimeResponse } from "../../../shared/src/protocol.js";

interface PluginReq {
  id: string;
  text: string;
  images: Array<{ name: string; mime: string; data: string }>;
  files?: Array<{ name:string; mime:string; data:string }>;
  selection: string[];
  place?: string;
}

const call = async <T,>(method: string, path: string, body?: unknown): Promise<RuntimeResponse<T> | null> => {
  try {
    return (await chrome.runtime.sendMessage({ type: "bridge", method, path, body })) as RuntimeResponse<T>;
  } catch {
    return null; // extension reloaded / bridge offline
  }
};

/** The message the AI gets for a plugin request. */
export function pluginRequestText(r: Pick<PluginReq, "text" | "selection" | "place" | "images">, attached: number): string {
  const parts = [r.text.trim() || "(see the attached image)"];
  if (r.selection.length) parts.push(`Selected in Studio: ${r.selection.join(", ")}`);
  if (r.images.length) parts.push(attached === r.images.length ? `Attached image(s): ${r.images.map((i) => i.name).join(", ")} — use them as the visual reference.` : `[${r.images.length - attached} image(s) from Studio could not be attached to this chat]`);
  if (r.place) parts.push(`Place: ${r.place}`);
  return parts.join("\n");
}

export function startPluginLink(core: AgentCore, adapter: ProviderAdapter) {
  const tab = (() => {
    try {
      let id = sessionStorage.getItem("bw-tab-id");
      if (!id) sessionStorage.setItem("bw-tab-id", (id = Math.random().toString(36).slice(2, 10)));
      return id;
    } catch {
      return Math.random().toString(36).slice(2, 10);
    }
  })();
  let queue: unknown[] = [];
  let flushing = false;
  const flush = async () => {
    if (flushing || !queue.length) return;
    flushing = true;
    const events = queue.splice(0, 50);
    const r = await call("POST", "/api/plugin/event", { events });
    if (!r?.ok && queue.length < 200) queue.unshift(...events.filter((e) => (e as { type: string }).type !== "reply" || !(e as { partial?: boolean }).partial));
    flushing = false;
  };
  core.onPluginEvent = (e) => {
    // only the agent of a session (or the tab that delivered a plugin request) talks to the plugin
    queue.push({ ...e, provider: adapter.info.name });
    if (queue.length > 300) queue.splice(0, queue.length - 300);
    void flush();
  };

  let delivering = false;
  const deliver = async (r: PluginReq) => {
    let attached = 0;
    for (const im of r.images) {
      if (!adapter.attachImage) break;
      try {
        const bin = Uint8Array.from(atob(im.data), (c) => c.charCodeAt(0));
        if (await adapter.attachImage(new File([bin], im.name, { type: im.mime || "image/png" }))) attached++;
      } catch {
        /* counted as not attached */
      }
    }
    const fileReports: string[] = [];
    for (const f of r.files || []) {
      let ok=false;
      try { const bytes=Uint8Array.from(atob(f.data),c=>c.charCodeAt(0)); ok=!!(await adapter.attachImage?.(new File([bytes],f.name,{type:f.mime||"application/octet-stream"}))); } catch {}
      fileReports.push(ok ? `Attached file: ${f.name}` : `File ${f.name} could not be attached to this AI chat; do NOT claim to have read its binary content.`);
    }
    const ok = await core.submitTask([pluginRequestText(r, attached),...fileReports].join("\n"), "the Roblox Studio plugin");
    await call("POST", `/api/plugin/request/${encodeURIComponent(r.id)}/result`, { ok, error: ok ? undefined : "the AI chat did not accept the message" });
  };

  const poll = async () => {
    if (delivering || !adapter.getComposer()) return;
    // the agent is mid-turn: report "busy" so the hub keeps the request queued until the turn ends
    const ready = core.readyForUser() && !core.paused;
    const r = await call<{ request: PluginReq | null; controls: string[] }>("POST", "/api/plugin/next", {
      tab,
      provider: adapter.info.id,
      providerName: adapter.info.name,
      active: core.active,
      paused: core.paused,
      ready,
      stage: core.stage,
      task: core.task,
      url: location.href,
    });
    if (!r?.ok || !r.data) return;
    for (const c of r.data.controls ?? []) {
      if (c === "stop" && core.active) await core.stop();
      else if (c === "pause" && core.active) core.pause(true);
      else if (c === "resume" && core.active) core.pause(false);
    }
    const req = r.data.request;
    if (!req) return;
    delivering = true;
    try {
      await deliver(req);
    } finally {
      delivering = false;
    }
  };
  every(1500, () => void poll());
}
