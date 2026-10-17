import { HeadlessRunner, headlessConfigFromEnv } from "./headless.js";
import crypto from "node:crypto";
import type http from "node:http";
import type { Bridge } from "./bridge.js";
import { canonical } from "./operation-store.js";
export async function handleAppRuntime(ctx: {
  bridge: Bridge;
  req: http.IncomingMessage;
  pathname: string;
  body: Record<string, any>;
  token: string;
  headless: HeadlessRunner;
  send: (status: number, body: unknown) => unknown;
}) {
  const { bridge: b, req, pathname: p, body, token, send, headless } = ctx;
  if (req.method === "GET" && p === "/api/app-runtime/summary")
    return send(200, {
      tasks: b.tasks.list().map((t) => ({
        id: t.id,
        goal: t.goal,
        state: t.state,
        binding: t.binding,
        reason: t.reason,
      })),
      limitations: [
        "Structural verification only. No automatic rollback or visual/Play verification.",
      ],
    });
  const supplied = req.headers["x-brickwire-app"];
  if (
    typeof supplied !== "string" ||
    supplied.length !== token.length ||
    !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
  )
    return send(403, { error: "Application authorization required" });
  try {
    if (req.method === "GET" && p === "/api/app-runtime/state")
      return send(
        200,
        b.appMcp.sanitize({
          tasks: b.tasks.list(),
          studios: b.studios,
          binding: b.currentBinding(),
          tools: b.listTools(),
          agent: { configured: headlessConfigFromEnv(process.env).ok, status: headless.status() },
          operations: b.operations.list(),
          approvals: b.approvals.list(),
          errors: [...b.tasks.loadErrors, ...b.operations.loadErrors],
          mode: b.settings.mode,
          limitations: [
            "Only exists/property/script_contains acceptance checks are implemented. No Play/visual acceptance or full Live Game Graph.",
            "Pause/cancel prevents new calls; it cannot undo in-flight changes.",
            "Unknown outcome operations require inspection; never replay automatically.",
          ],
        }),
      );
    if (req.method === "POST" && p === "/api/app-runtime/select") {
      await b.pollStudios();
      if (!b.studios.some((s) => s.id === body.studioId))
        return send(409, { error: "Studio target not found" });
      b.saveSettings({ selectedStudioId: body.studioId });
      return send(200, { binding: b.currentBinding() });
    }
    if (req.method === "POST" && p === "/api/app-runtime/tasks") {
      await b.pollStudios();
      const binding = b.currentBinding();
      b.assertBinding(binding);
      return send(201, { task: b.tasks.create(body, binding!) });
    }
    const m = p.match(
      /^\/api\/app-runtime\/tasks\/(task_[a-f0-9]{16})\/(start|resume|pause|cancel|verify|claim|tree|execute|agent)$/,
    );
    if (!m) return send(404, { error: "Task route not found" });
    const [, id, action] = m,
      t = b.tasks.get(id);
    if (req.method === "GET" && action === "tree")
      return send(200, b.appMcp.sanitize(b.tasks.tree(id, b.operations.list(id))));
    if (req.method !== "POST") return send(405, { error: "POST required" });
    if (action === "agent") {
      if (t.state !== "RUNNING" || !t.sessionId)
        return send(409, { error: "Start/resume task first" });
      if (headless.running) return send(409, { error: "Another API-agent run is active" });
      const cfg = headlessConfigFromEnv(process.env);
      if (!cfg.ok) return send(400, { error: cfg.error });
      await b.pollStudios();
      b.assertBinding(t.binding);
      const prompt = `${t.goal}\nTask mode: ${t.mode}. Target: ${t.binding.name} (${t.binding.studioId}). User acceptance criteria: ${JSON.stringify(t.criteria)}. Plan: ${JSON.stringify(t.plan)}. Use registered tools only. Transport receipt is not completion. Do not run arbitrary source in plan mode. Backend will independently inspect the specified criteria after your final report.`;
      void headless
        .run(prompt, process.env, { sessionId: t.sessionId, taskId: id })
        .then((result) => {
          if (result.state === "error") b.tasks.block(id, result.error ?? "API-agent failed");
          else if (result.state === "stopped" && t.state === "RUNNING")
            b.tasks.block(id, "API-agent stopped before verified completion");
        });
      return send(202, { status: headless.status() });
    }
    if (action === "verify") return send(200, { task: await b.verifyTask(id) });
    if (action === "claim")
      return send(200, {
        task: b.claimTask(id, String(body.summary ?? "User requested acceptance check")),
      });
    if (action === "execute") {
      if (
        typeof body.tool !== "string" ||
        !body.args ||
        typeof body.args !== "object" ||
        Array.isArray(body.args)
      )
        return send(400, { error: "Tool and JSON object args required" });
      const call = {
        id:
          typeof body.actionId === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(body.actionId)
            ? body.actionId
            : "app_task_" + crypto.randomBytes(8).toString("hex"),
        tool: body.tool,
        args: body.args,
      };
      return send(
        200,
        await b.submitCall(call, { sessionId: t.sessionId, provider: "app-task", taskId: id }, 100),
      );
    }
    let sid = t.sessionId;
    if (action === "start" || action === "resume") {
      await b.pollStudios();
      b.assertBinding(t.binding);
      const current = b.sessions.current;
      if (current?.active) {
        if (canonical(b.currentBinding(current.id)) !== canonical(t.binding))
          return send(409, {
            error:
              "Another Studio session is active. Stop it explicitly before starting this task.",
          });
        sid = current.id;
      } else sid = (await b.startSession("app-task", t.goal)).session.id;
    }
    const task = b.tasks.control(id, action, sid);
    if (headless.status().taskId === id) {
      if (action === "pause") headless.pause();
      else if (action === "resume") headless.resume();
      else if (action === "cancel") {
        headless.stop();
        b.approvals.rejectAll();
      }
    }
    return send(200, { task });
  } catch (e) {
    return send((e as any).status ?? 409, { error: b.appMcp.sanitize((e as Error).message) });
  }
}
