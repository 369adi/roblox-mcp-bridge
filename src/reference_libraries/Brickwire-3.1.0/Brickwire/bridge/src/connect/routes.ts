/**
 * Local endpoints used by the Blender add-on (/api/blender/*) and the Figma plugin (/api/figma/*).
 * Host-checked like every bridge route (127.0.0.1/localhost only). They can only deliver data into Brickwire or
 * fetch jobs the bridge itself queued; nothing here executes code on this computer.
 */
import type http from "node:http";
import type { Bridge } from "../bridge.js";
import { BRIDGE_VERSION } from "../../../shared/src/protocol.js";
import { addonSource, ingestModel } from "./blender-link.js";
import { ingestPush } from "./figma.js";
import { storeB64, kb } from "./feed.js";

export async function handleConnect(ctx: { bridge: Bridge; req: http.IncomingMessage; res: http.ServerResponse; pathname: string; url: URL; body: any; send: (s: number, b: unknown, h?: Record<string, string>) => unknown }) {
  const { bridge: b, req, res, pathname: p, body, send } = ctx;
  const GET = req.method === "GET", POST = req.method === "POST";
  try {
    // ---------------- Blender add-on
    if (POST && p === "/api/blender/poll") {
      const job = await b.blender.poll(body.client ?? {}, Number(body.wait ?? 15000));
      return send(200, { ok: true, job, version: BRIDGE_VERSION });
    }
    if (POST && p === "/api/blender/result") return send(200, { ok: b.blender.result(String(body.client ?? ""), String(body.jobId ?? ""), body.ok === true, body.data, body.error ? String(body.error) : undefined) });
    if (POST && p === "/api/blender/push") {
      const deps = { link: b.blender, store: () => b.aiFiles, feed: () => b.feed };
      if (body.client) b.blender.result(String(body.client), "", false, null); // marks the add-on as seen
      if (body.kind === "image") {
        const f = storeB64(b.aiFiles, [{ name: "blender_view.png", data: body.render?.data }], "blender")[0];
        if (!f) return send(400, { ok: false, error: body.renderError ? `No picture: ${body.renderError}` : "No picture in the request" });
        const chat = b.feed?.post({ source: "blender", title: "Blender", text: `**Blender:** снимок вьюпорта${body.file ? ` (${String(body.file).slice(0, 80)})` : ""} — ${f.width ?? "?"}×${f.height ?? "?"}, ${kb(f.bytes)} → fileId ${f.id}`, images: [{ name: f.name, data: b.aiFiles.read(f.id) }] }) ?? null;
        return send(200, { ok: true, fileId: f.id, chat, message: "Picture sent to the Brickwire chat" });
      }
      const r = ingestModel(deps, body);
      if (!r.files.length && !r.imageFileId) return send(400, { ok: false, error: "Nothing to send (no files)" });
      return send(200, { ok: true, ...r, message: r.chat ? `Sent ${r.files.length} file(s) to the Brickwire chat` : "Stored in Brickwire" });
    }
    if (GET && p === "/api/blender/addon.py") {
      const src = addonSource(b.config.port);
      res.writeHead(200, { "Content-Type": "text/x-python; charset=utf-8", "Content-Disposition": 'attachment; filename="brickwire_blender.py"', "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      return res.end(src);
    }
    if (GET && p === "/api/blender/status") return send(200, { ok: true, ...b.blender.status() });
    // ---------------- Figma plugin
    if (GET && p === "/api/figma/ping") return send(200, { ok: true, app: "brickwire", version: BRIDGE_VERSION });
    if (POST && p === "/api/figma/push") return send(200, ingestPush({ store: () => b.aiFiles, feed: () => b.feed, settings: () => b.figma.settings, pushes: () => b.figma.pushes }, body));
    return send(404, { ok: false, error: "not found" });
  } catch (e) {
    const st = (e as { status?: number }).status ?? 400;
    if (res.headersSent) { try { res.end(); } catch { /* closed */ } return; }
    return send(st, { ok: false, error: (e as Error).message });
  }
}
