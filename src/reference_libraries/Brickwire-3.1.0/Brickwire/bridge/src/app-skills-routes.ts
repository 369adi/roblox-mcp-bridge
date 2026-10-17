import crypto from "node:crypto";
import type http from "node:http";
import type { Bridge } from "./bridge.js";
export async function handleAppSkills(ctx: {
  bridge: Bridge;
  req: http.IncomingMessage;
  pathname: string;
  body: Record<string, any>;
  token: string;
  send: (status: number, body: unknown) => unknown;
}) {
  const { bridge: b, req, pathname: p, body, token, send } = ctx;
  if (req.method === "GET" && p === "/api/app-skills/summary")
    return send(200, {
      skills: b.skills
        .list(b.listTools())
        .map((s) => ({ id: s.id, name: s.name, enabled: s.enabled, compatibility: s.compatibility })),
      templates: b.skills.templates().length,
      error: b.skills.loadError,
    });
  const key = req.headers["x-brickwire-app"];
  if (
    typeof key !== "string" ||
    key.length !== token.length ||
    !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(token))
  )
    return send(403, { error: "Application authorization required" });
  try {
    if (req.method === "GET" && p === "/api/app-skills/catalog")
      return send(200, {
        skills: b.skills.list(b.listTools()),
        templates: b.skills.templates(),
        error: b.skills.loadError,
        limitations: [
          "Descriptive guidance is not tool permission.",
          "Templates and imported source are not automatically installed or executed.",
          "Studio/Blender output is not verified by importing Skills.",
        ],
      });
    if (req.method !== "POST") return send(405, { error: "POST required" });
    if (p === "/api/app-skills/import") return send(201, b.skills.import(body.pack, body.authorize === true));
    if (p === "/api/app-skills/read") return send(200, b.skills.read(String(body.id)));
    if (p === "/api/app-skills/resource")
      return send(
        200,
        b.skills.resource(
          String(body.skillId),
          String(body.resourceId),
          Number(body.offset ?? 0),
          Number(body.limit ?? 16000),
        ),
      );
    if (p === "/api/app-skills/template") return send(200, b.skills.template(String(body.id)));
    if (p === "/api/app-skills/export") return send(200, b.skills.export(String(body.id)));
    if (p === "/api/app-skills/enable") {
      b.skills.enable(String(body.id), body.enabled, body.acknowledge === true);
      return send(200, { ok: true });
    }
    if (p === "/api/app-skills/remove") {
      b.skills.remove(String(body.id), body.confirm === true);
      return send(200, { ok: true });
    }
    return send(404, { error: "Skill route not found" });
  } catch (e) {
    return send((e as any).status ?? 500, { error: b.appMcp.sanitize((e as Error).message) });
  }
}
