/** PRO HTTP API: license, action history, personal library, library updates, the app window (/app). */
import fs from "node:fs";
import path from "node:path";
import type { Bridge } from "./bridge.js";
import type { PluginHub } from "../../shared/src/plugin-hub.js";
import { FREE_LIMITS } from "./license.js";
import { captureLuau, insertLuau, resultText, extractMarked, type LibKind } from "./library.js";

type Send = (status: number, body: unknown, headers?: Record<string, string>) => void;
interface Ctx { bridge: Bridge; pluginHub: PluginHub; dashFile: string | null; send: Send }

async function runLuau(bridge: Bridge, code: string): Promise<{ ok: boolean; json?: any; error?: string }> {
  const r = await bridge.execute({ id: "lib_" + Date.now().toString(36), tool: "execute_luau", args: { code } }, { provider: "library", trusted: true });
  const text = resultText(r.result) + "\n" + (r.error ?? "");
  const marked = extractMarked(text);
  if (r.status !== "success" || !marked) {
    const m = text.match(/BWLIB: ([^\n"]+)/);
    return { ok: false, error: m?.[1] ?? r.error ?? "Studio did not return the data (is a place open?)" };
  }
  try {
    return { ok: true, json: JSON.parse(marked) };
  } catch (e) {
    return { ok: false, error: "bad data from Studio: " + (e as Error).message };
  }
}

export async function handlePro(method: string, p: string, url: URL, body: Record<string, any>, ctx: Ctx): Promise<boolean | void> {
  const { bridge, send } = ctx;
  const lic = bridge.license.state();

  if (method === "GET" && (p === "/app" || p === "/app/")) {
    const f = ctx.dashFile ? path.join(path.dirname(ctx.dashFile), "app.html") : null;
    if (!f || !fs.existsSync(f)) return send(500, "app.html missing", { "Content-Type": "text/plain" });
    return send(200, fs.readFileSync(f, "utf8"), { "Content-Type": "text/html; charset=utf-8" });
  }

  // ── license
  if (p === "/api/pro/license") {
    if (method === "GET") return send(200, { license: lic, limits: lic.pro ? null : FREE_LIMITS });
    if (method === "POST") {
      const st = bridge.license.activate(String(body.key ?? ""));
      return send(st.pro ? 200 : 400, { license: st, ok: st.pro, error: st.error });
    }
  }
  if (method === "POST" && p === "/api/pro/license/remove") {
    bridge.license.deactivate();
    return send(200, { license: bridge.license.state() });
  }

  // ── history
  const days = lic.pro ? undefined : FREE_LIMITS.historyDays;
  if (method === "GET" && p === "/api/pro/history") {
    const rows = bridge.history.query({ q: url.searchParams.get("q") ?? undefined, sessionId: url.searchParams.get("session") ?? undefined, kind: url.searchParams.get("kind") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 300), before: url.searchParams.get("before") ?? undefined, days });
    return send(200, { rows, limitedToDays: days ?? null });
  }
  if (method === "GET" && p === "/api/pro/history/sessions") return send(200, { sessions: bridge.history.sessions(days), limitedToDays: days ?? null });
  if (method === "GET" && p === "/api/pro/history/export") {
    if (!lic.pro) return send(402, { error: "Export is a PRO feature" });
    const sid = url.searchParams.get("session") ?? "";
    const md = url.searchParams.get("format") === "md";
    const text = md ? bridge.history.exportMarkdown(sid) : bridge.history.exportLuau(sid);
    return send(200, text, { "Content-Type": md ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="brickwire-${sid.replace(/[^a-z0-9_-]/gi, "")}.${md ? "md" : "lua"}"` });
  }
  if (method === "POST" && p === "/api/pro/history/restore") {
    if (!lic.pro) return send(402, { error: "Rollback from history is a PRO feature" });
    const env = await bridge.submitCall({ id: "app_restore_" + Date.now().toString(36), tool: "restore_snapshot", args: { snapshotId: String(body.snapshotId ?? "") } }, { provider: "app" }, 20000);
    return send(200, env);
  }

  // ── personal library
  if (method === "GET" && p === "/api/pro/library") return send(200, { items: bridge.library.list(), limit: lic.pro ? null : FREE_LIMITS.libraryItems });
  const canAdd = () => lic.pro || bridge.library.count() < FREE_LIMITS.libraryItems;
  if (method === "POST" && p === "/api/pro/library") {
    if (!body.id && !canAdd()) return send(402, { error: `Free version keeps up to ${FREE_LIMITS.libraryItems} items — upgrade to PRO` });
    const kind = (["prompt", "recipe", "code"].includes(body.kind) ? body.kind : "prompt") as LibKind;
    const text = String(body.text ?? "").slice(0, 200000);
    if (!text.trim()) return send(400, { error: "text is required" });
    return send(200, { item: bridge.library.save({ id: body.id, name: String(body.name ?? text.slice(0, 60)), kind, tags: body.tags, note: body.note, data: text }) });
  }
  if (method === "POST" && p === "/api/pro/library/capture") {
    if (!canAdd()) return send(402, { error: `Free version keeps up to ${FREE_LIMITS.libraryItems} items — upgrade to PRO` });
    const r = await runLuau(bridge, captureLuau(Array.isArray(body.paths) ? body.paths.map(String) : []));
    if (!r.ok) return send(409, { error: r.error });
    const first = r.json.roots?.[0]?.tree;
    const item = bridge.library.save({ name: String(body.name || first?.n || "Studio capture"), kind: "model", tags: body.tags, note: body.note, data: { roots: r.json.roots }, stats: r.json.stats });
    const { data: _d, ...meta } = item;
    return send(200, { item: meta });
  }
  const lm = p.match(/^\/api\/pro\/library\/([A-Za-z0-9_-]+)(\/(insert|delete|send))?$/);
  if (lm) {
    const item = bridge.library.get(lm[1]);
    if (!item) return send(404, { error: "unknown item" });
    if (method === "GET" && !lm[3]) return send(200, { item });
    if (method === "POST" && lm[3] === "delete") return send(200, { ok: bridge.library.remove(item.id) });
    if (method === "POST" && lm[3] === "insert") {
      if (item.kind === "model") {
        const r = await runLuau(bridge, insertLuau(item.data, { parent: body.parent ? String(body.parent) : undefined }));
        return r.ok ? send(200, { inserted: r.json.inserted }) : send(409, { error: r.error });
      }
      if (item.kind === "code") {
        const r = await bridge.execute({ id: "lib_code_" + Date.now().toString(36), tool: "execute_luau", args: { code: String(item.data) } }, { provider: "library", trusted: true });
        return send(r.status === "success" ? 200 : 409, { result: r.result, error: r.error });
      }
      return send(400, { error: "prompts are sent to the AI chat (use /send)" });
    }
    if (method === "POST" && lm[3] === "send") {
      const text = item.kind === "model" ? `Use my saved library item "${item.name}" (${item.stats?.instances ?? "?"} instances). ${String(body.text ?? "")}` : String(item.data) + (body.text ? `\n${body.text}` : "");
      const r = ctx.pluginHub.addRequest({ text });
      bridge.history.record({ kind: "request", provider: "app", text });
      return send(200, { ok: true, id: r.id, status: ctx.pluginHub.status() });
    }
  }

  // ── chat from the app (same queue as the Studio plugin)
  if (method === "POST" && p === "/api/pro/chat") {
    try {
      const r = ctx.pluginHub.addRequest(body);
      bridge.history.record({ kind: "request", provider: "app", text: r.text });
      return send(200, { ok: true, id: r.id, status: ctx.pluginHub.status() });
    } catch (e) {
      return send(400, { error: (e as Error).message });
    }
  }

  // ── updates
  if (method === "GET" && p === "/api/pro/updates") return send(200, { updates: bridge.updates.status(), pro: lic.pro });
  if (method === "POST" && p === "/api/pro/updates/check") return send(200, { updates: await bridge.updates.check({ pro: lic.pro, install: body.install === true }) });
  if (method === "GET" && p === "/api/pro/remote") {
    const kind = String(url.searchParams.get("kind") ?? "");
    const name = String(url.searchParams.get("name") ?? "");
    if (!/^[a-z0-9_-]+$/i.test(kind) || !/^[a-z0-9._-]+$/i.test(name)) return send(400, { error: "bad name" });
    return send(200, { config: bridge.updates.remoteConfig(kind, name) });
  }

  // ── stats for the app overview
  if (method === "GET" && p === "/api/pro/stats") {
    const rows = bridge.history.query({ limit: 2000, days: days ?? 30 });
    const tools = rows.filter((r) => r.kind === "tool");
    return send(200, { actions: tools.length, errors: tools.filter((r) => r.status !== "success").length, requests: rows.filter((r) => r.kind === "request").length, done: rows.filter((r) => r.kind === "done").length, library: bridge.library.count(), sessions: bridge.history.sessions(days ?? 30).length });
  }
  return false;
}
