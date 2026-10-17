import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { Bridge } from "../../bridge/src/bridge.js";
import { createServer } from "../../bridge/src/server.js";
import type { BridgeConfig } from "../../bridge/src/config.js";

export const MOCK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "mocks", "mock-studio-mcp.mjs");

export function config(over: Partial<BridgeConfig> = {}): BridgeConfig {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-int-"));
  return {
    port: 0,
    host: "127.0.0.1",
    baseDir: dir,
    dataDir: path.join(dir, "data"),
    mcpCommand: process.execPath,
    mcpArgs: [MOCK],
    mcpReason: "test",
    mcpAuto: false,
    mode: "auto",
    luauHelpers: true,
    blockedTools: ["store_image"],
    studioPollMs: 300,
    logLevel: "error",
    luauPrintResults: false,
    composites: true, // legacy composite-tool tests
    ...over,
  };
}

export async function withBridge(
  over: Partial<BridgeConfig>,
  env: Record<string, string>,
  fn: (ctx: { bridge: Bridge; url: string; api: (p: string, o?: { method?: string; body?: unknown; headers?: Record<string, string> }) => Promise<any> }) => Promise<void>,
) {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  const cfg = config(over);
  const bridge = new Bridge(cfg, { quiet: true });
  const server = createServer(bridge);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  (bridge.config as { port: number }).port = port;
  // the server captured port at creation; recreate with the real port
  server.close();
  const server2 = createServer(bridge);
  await new Promise<void>((r) => server2.listen(port, "127.0.0.1", r));
  const url = `http://127.0.0.1:${port}`;
  const api = async (p: string, o: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) => {
    const r = await fetch(url + p, { method: o.method ?? (o.body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(o.headers ?? {}) }, body: o.body ? JSON.stringify(o.body) : undefined });
    const j = await r.json();
    return Object.assign(j, { _status: r.status });
  };
  await bridge.start();
  try {
    for (let i = 0; i < 100 && bridge.mcp.state !== "ready" && bridge.mcp.state !== "disabled"; i++) await new Promise((r) => setTimeout(r, 50));
    await bridge.pollStudios();
    await fn({ bridge, url, api });
  } finally {
    await bridge.stop();
    server2.close();
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
