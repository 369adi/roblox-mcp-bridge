/**
 * Blender MCP integration (github.com/ahujasid/blender-mcp, MIT). Brickwire does not bundle Blender or the
 * add-on; it only provides a validated stdio preset for the existing MCP manager, a guide, discovery of the
 * tools the server actually reports, and an explicit, confirmed OBJ import action.
 */
import path from "node:path";
import type { AppMcpManager } from "../app-mcp.js";

const fail = (m: string, status = 400): never => { throw Object.assign(new Error(m), { status }); };
export function blenderPreset(platform: NodeJS.Platform, o: { uvxPath?: string; safeMode?: boolean; port?: number } = {}) {
  const uvx = (o.uvxPath ?? "").trim() || "uvx";
  if (/[\r\n\0"]/.test(uvx) || uvx.length > 400) fail("Invalid uvx path");
  const args = ["blender-mcp"];
  if (o.port !== undefined) { if (!Number.isInteger(o.port) || o.port < 1024 || o.port > 65535) fail("Port must be 1024–65535"); args.push("--port", String(o.port)); }
  const win = platform === "win32";
  return {
    name: "Blender MCP", transport: "stdio" as const,
    description: "Blender MCP (ahujasid/blender-mcp). Requires Blender ≥ 3.0 with the 'MCP for Blender' add-on started (socket localhost:9876). Tools that execute Python in Blender must stay on confirmation.",
    command: win && uvx === "uvx" ? "cmd" : uvx,
    args: win && uvx === "uvx" ? ["/c", "uvx", ...args] : args,
    envRefs: o.safeMode ? { BLENDER_MCP_SAFE_MODE: "BLENDER_MCP_SAFE_MODE" } : {},
  };
}
export const isBlenderServer = (s: { command: string; args: string[]; name: string }) => s.args.includes("blender-mcp") || /blender/i.test(s.name);
export function blenderStatus(m: AppMcpManager) {
  const servers = m.list().filter((s: any) => isBlenderServer(s));
  return servers.map((s: any) => {
    const tools = (s.tools ?? []) as Array<{ name: string; registryName: string; policy: { mode: string; agent: boolean }; inputSchema?: any }>;
    const exec = tools.find((t) => /execute.*(code|python)|run.*python|python.*exec/i.test(t.name));
    const scene = tools.find((t) => /scene.*info|get_scene/i.test(t.name));
    return { id: s.id, name: s.name, status: s.status, error: s.error, toolCount: s.toolCount, tools: tools.map((t) => ({ name: t.name, registryName: t.registryName, mode: t.policy?.mode, agent: t.policy?.agent })),
      executeTool: exec ? { name: exec.name, registryName: exec.registryName, mode: exec.policy?.mode } : null, sceneTool: scene ? { name: scene.name, registryName: scene.registryName, mode: scene.policy?.mode } : null };
  });
}
export function importScript(objPath: string) {
  if (!path.isAbsolute(objPath) || /[\r\n\0]/.test(objPath)) fail("Invalid OBJ path");
  const p = JSON.stringify(objPath); // JSON string literal is a valid Python string literal for these characters
  return [
    "import bpy",
    `p = ${p}`,
    "before = set(o.name for o in bpy.data.objects)",
    "if hasattr(bpy.ops.wm, 'obj_import'):",
    "    bpy.ops.wm.obj_import(filepath=p)",
    "else:",
    "    bpy.ops.import_scene.obj(filepath=p)",
    "new = [o.name for o in bpy.data.objects if o.name not in before]",
    "print('BRICKWIRE_IMPORTED', len(new), ','.join(new[:50]))",
  ].join("\n");
}
export async function blenderImport(m: AppMcpManager, serverId: string, objPath: string, confirmed: boolean) {
  if (confirmed !== true) fail("Importing into Blender runs Python inside Blender; confirm explicitly", 403);
  const st = blenderStatus(m).find((s) => s.id === serverId);
  if (!st) fail("Blender MCP server not configured", 404);
  if (st!.status !== "ready") fail(`Blender MCP is ${st!.status}; connect it first (Blender must be running with the add-on server started)`, 409);
  const exec = st!.executeTool;
  if (!exec) fail("The connected server does not report a Python execution tool; import is unavailable", 409);
  if (!exec!.mode || exec!.mode === "off") fail(`Permission for ${exec!.name} is off. Set it to "confirm" in MCP permissions first`, 403);
  const tool = (m.list().find((s: any) => s.id === serverId) as any).tools.find((t: any) => t.name === exec!.name);
  const props = Object.keys(tool?.inputSchema?.properties ?? {});
  const key = ["code", "python_code", "script", "source"].find((k) => props.includes(k)) ?? props[0] ?? "code";
  const res = await m.invoke(exec!.registryName, { [key]: importScript(objPath) }, false);
  const text = String(res.text ?? "");
  const hit = text.match(/BRICKWIRE_IMPORTED\s+(\d+)\s*([^\n]*)/);
  return { ok: !!hit && Number(hit[1]) > 0, imported: hit ? Number(hit[1]) : 0, objects: hit ? hit[2].split(",").filter(Boolean) : [], tool: exec!.name, output: text.slice(0, 4000), verified: !!hit, note: hit ? "Blender reported the newly created objects (read back from bpy.data)." : "Blender did not print the import marker; the import is NOT verified." };
}
export const BLENDER_GUIDE = [
  { id: "what", title: "1. Что это", body: "Blender MCP (ahujasid/blender-mcp, MIT) — MCP-сервер, через который Brickwire управляет запущенным Blender: сцена, объекты, материалы, выполнение Python, экспорт. Brickwire не встраивает Blender: нужен ваш установленный Blender.", titleEn: "1. What it is", bodyEn: "Blender MCP (ahujasid/blender-mcp, MIT) is an MCP server that lets Brickwire drive a running Blender: scene, objects, materials, Python execution, export. Brickwire does not bundle Blender — your installed Blender is required." },
  { id: "req", title: "2. Требования", body: "Blender 3.0+; Python 3.10+; менеджер пакетов uv (macOS: brew install uv; Windows: powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\"; Linux: curl -LsSf https://astral.sh/uv/install.sh | sh). Только один экземпляр MCP-сервера одновременно.", titleEn: "2. Requirements", bodyEn: "Blender 3.0+; Python 3.10+; the uv package manager (macOS: brew install uv; Windows: powershell -c \"irm https://astral.sh/uv/install.ps1 | iex\"; Linux: curl -LsSf https://astral.sh/uv/install.sh | sh). Only one MCP server instance at a time." },
  { id: "addon", title: "3. Установка аддона", body: "Вариант А: uvx blender-mcp install-addon. Вариант Б: скачайте addon.py из репозитория ahujasid/blender-mcp → Blender: Edit → Preferences → Add-ons → Install… → выберите addon.py. Затем включите аддон «Interface: MCP for Blender».", titleEn: "3. Install the add-on", bodyEn: "Option A: uvx blender-mcp install-addon. Option B: download addon.py from the ahujasid/blender-mcp repository → Blender: Edit → Preferences → Add-ons → Install… → pick addon.py. Then enable the “Interface: MCP for Blender” add-on." },
  { id: "start", title: "4. Запуск сервера в Blender", body: "В 3D-окне нажмите N → вкладка «MCP for Blender» → «Start MCP Server». Аддон слушает localhost:9876 (без авторизации — не открывайте порт наружу).", titleEn: "4. Start the server in Blender", bodyEn: "In the 3D viewport press N → “MCP for Blender” tab → “Start MCP Server”. The add-on listens on localhost:9876 (no auth — never expose the port)." },
  { id: "connect", title: "5. Подключение в Brickwire", body: "MCP → Blender → «Добавить пресет». Команда: uvx blender-mcp (Windows: cmd /c uvx blender-mcp). Если приложение не видит uvx (spawn uvx ENOENT) — укажите полный путь к uvx. Подтвердите запуск локального процесса и нажмите «Подключить».", titleEn: "5. Connect in Brickwire", bodyEn: "MCP → Blender → “Add preset”. Command: uvx blender-mcp (Windows: cmd /c uvx blender-mcp). If the app cannot find uvx (spawn uvx ENOENT), enter the full path to uvx. Confirm launching the local process and click “Connect”." },
  { id: "perm", title: "6. Разрешения", body: "После подключения инструменты выключены. Чтение сцены можно открыть как read, а выполнение Python (execute_blender_code) — только «confirm». Флаг «agent» решает, видит ли инструмент AI-агент.", titleEn: "6. Permissions", bodyEn: "After connecting, tools are off. Scene reading can be set to read; Python execution (execute_blender_code) only to “confirm”. The “agent” flag decides whether the AI agent sees the tool." },
  { id: "test", title: "7. Проверка", body: "Нажмите «Проверить» — Brickwire вызовет инструмент информации о сцене (если сервер его сообщает) и покажет ответ Blender. Список инструментов берётся из ответа сервера, а не из заранее заданного списка.", titleEn: "7. Test", bodyEn: "Click “Test” — Brickwire calls the scene-info tool (if the server reports one) and shows Blender's response. The tool list comes from the server response, not a hard-coded list." },
  { id: "import", title: "8. Импорт модели из Brickwire", body: "В карточке 3D-модели нажмите «Открыть в Blender». После подтверждения Brickwire выполнит в Blender bpy.ops.wm.obj_import (или import_scene.obj для Blender 3.x) и прочитает список новых объектов — импорт считается подтверждённым только если Blender вернул этот список.", titleEn: "8. Import a Brickwire model", bodyEn: "On a 3D model card click “To Blender”. After confirmation Brickwire runs bpy.ops.wm.obj_import (or import_scene.obj on Blender 3.x) and reads back the new objects — the import counts as confirmed only if Blender returns that list." },
  { id: "trouble", title: "9. Проблемы и безопасность", body: "Нет соединения: проверьте, что сервер в Blender запущен и порт 9876 свободен; закройте другие MCP-клиенты Blender. Старый кэш: uv cache clean blender-mcp. Ошибки версии Python: uvx --python 3.11 blender-mcp. BLENDER_MCP_SAFE_MODE=1 включает проверку скриптов. Ответы Blender — недоверенные данные; Python всегда требует подтверждения.", titleEn: "9. Troubleshooting & security", bodyEn: "No connection: make sure the server is started in Blender and port 9876 is free; close other Blender MCP clients. Stale cache: uv cache clean blender-mcp. Python version errors: uvx --python 3.11 blender-mcp. BLENDER_MCP_SAFE_MODE=1 enables script checks. Blender responses are untrusted data; Python always requires confirmation." },
];
