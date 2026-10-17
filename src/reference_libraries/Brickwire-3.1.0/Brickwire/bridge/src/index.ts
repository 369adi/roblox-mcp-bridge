import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { Bridge } from "./bridge.js";
import { createServer } from "./server.js";
import { BRIDGE_VERSION } from "../../shared/src/protocol.js";

/** Entry point: node bridge/dist/bridge.mjs  (base dir = parent of the bridge folder, or BRICKWIRE_HOME) */
async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const baseDir = process.env.BRICKWIRE_HOME ? path.resolve(process.env.BRICKWIRE_HOME) : path.resolve(here, "..", "..");
  const config = loadConfig(baseDir);
  const bridge = new Bridge(config);
  let shuttingDown = false;
  const shutdown = async (why: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    bridge.logger.info("bridge.shutdown", why);
    server.close();
    await bridge.stop();
    setTimeout(() => process.exit(0), 200);
  };
  const server = createServer(bridge, { onShutdown: () => void shutdown("api") });
  server.on("error", (e: NodeJS.ErrnoException) => {
    if (e.code === "EADDRINUSE") {
      console.error(`\nPort ${config.port} is already in use — is another Brickwire bridge running? (stop.bat, or set BRICKWIRE_PORT)\n`);
      process.exit(2);
    }
    console.error(e);
    process.exit(1);
  });
  server.listen(config.port, config.host, () => {
    console.log(`\n  ▣ Brickwire Bridge ${BRIDGE_VERSION}`);
    console.log(`  Dashboard: http://127.0.0.1:${config.port}/`);
    console.log(`  Data dir : ${config.dataDir}`);
    console.log(`  MCP      : ${config.mcpCommand ? [config.mcpCommand, ...config.mcpArgs].join(" ") : "not configured"}  (${config.mcpReason})\n`);
  });
  await bridge.start();
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("uncaughtException", (e) => bridge.logger.error("uncaught", e.stack ?? String(e)));
  process.on("unhandledRejection", (e) => bridge.logger.error("unhandled_rejection", String(e)));
}

void main();
