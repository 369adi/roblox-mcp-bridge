import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type BrowserContext } from "playwright";
import { PROVIDERS } from "../../shared/src/providers.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const EXT = path.join(ROOT, "extension", "dist");
const MOCK_AI = fs.readFileSync(path.join(ROOT, "tests", "mocks", "pages", "mock-ai.js"), "utf8");

export interface BridgeProc {
  proc: ChildProcess;
  home: string;
  stateFile: string;
  port: number;
  out: () => string;
  stop: () => Promise<void>;
}

export async function startBridge(env: Record<string, string> = {}, port = 47821): Promise<BridgeProc> {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "bw-e2e-"));
  const stateFile = path.join(home, "studio-state.json");
  let out = "";
  const proc = spawn(process.execPath, [path.join(ROOT, "bridge", "dist", "bridge.mjs")], {
    env: {
      ...process.env,
      BRICKWIRE_HOME: home,
      BRICKWIRE_PORT: String(port),
      BRICKWIRE_MCP_COMMAND: process.execPath,
      BRICKWIRE_MCP_ARGS: JSON.stringify([path.join(ROOT, "tests", "mocks", "mock-studio-mcp.mjs")]),
      MOCK_STATE_FILE: stateFile,
      BRICKWIRE_STUDIO_POLL_MS: "1000",
      BRICKWIRE_COMPOSITES: "1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout!.on("data", (d) => (out += d));
  proc.stderr!.on("data", (d) => (out += d));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`);
      const h = (await r.json()) as { state: string };
      if (h.state === "MCP_READY" || (env.MOCK_NO_STUDIO && h.state.startsWith("STUDIO"))) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    proc,
    home,
    stateFile,
    port,
    out: () => out,
    stop: async () => {
      proc.kill();
      await new Promise((r) => setTimeout(r, 300));
    },
  };
}

export function mockHtml(provider: string, opts: { lazy?: boolean } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${provider} mock</title></head><body>
<script>window.MOCK_PROVIDER=${JSON.stringify(provider)};window.MOCK_LAZY=${opts.lazy ? "true" : "false"};</script>
<script>${MOCK_AI}</script></body></html>`;
}

export async function launch(opts: { lazy?: string[]; settings?: Record<string, unknown> } = {}): Promise<{ ctx: BrowserContext; close: () => Promise<void> }> {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "bw-chrome-"));
  const ctx = await chromium.launchPersistentContext(userDir, {
    executablePath: process.env.CHROME_PATH || "/usr/local/bin/chromium",
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-sandbox", "--headless=new"],
    viewport: { width: 1280, height: 900 },
  });
  for (const p of PROVIDERS) {
    for (const h of p.hosts) {
      await ctx.route(`https://${h}/**`, (route) =>
        route.fulfill({ status: 200, contentType: "text/html", body: mockHtml(p.id, { lazy: opts.lazy?.includes(p.id) }) }),
      );
    }
  }
  // Community thumbnails (fetched by the service worker): a tiny PNG instead of the real host
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await ctx.route("https://uiassets.commissiontoolz.xyz/**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  if (opts.settings) await sw.evaluate((s) => chrome.storage.local.set({ settings: s }), opts.settings);
  return {
    ctx,
    close: async () => {
      await ctx.close();
      fs.rmSync(userDir, { recursive: true, force: true });
    },
  };
}

export function studioState(file: string): { name: string; className: string; children: unknown[] } {
  // The mock rewrites this file after every change; retry if we catch it mid-write.
  for (let i = 0; ; i++) {
    try {
      return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      if (i >= 20) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

export function findChild(tree: any, ...names: string[]): any {
  let cur = tree;
  for (const n of names) {
    cur = cur?.children?.find((c: any) => c.name === n);
  }
  return cur;
}
