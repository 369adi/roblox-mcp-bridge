import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import type { LogEntry } from "../../shared/src/protocol.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

/** Structured logger: JSONL file per day + in-memory ring buffer + live events for the dashboard. */
export class Logger extends EventEmitter {
  private ring: LogEntry[] = [];
  private dir: string | null;
  private level: keyof typeof LEVELS;
  private quiet: boolean;
  private ringSize: number;
  constructor(dir: string | null, level: keyof typeof LEVELS = "info", quiet = false, ringSize = 3000) {
    super();
    this.dir = dir;
    this.level = level;
    this.quiet = quiet;
    this.ringSize = ringSize;
    if (dir) fs.mkdirSync(dir, { recursive: true });
  }

  log(entry: Omit<LogEntry, "ts"> & { ts?: string }): LogEntry {
    const e: LogEntry = { ts: new Date().toISOString(), ...entry };
    this.ring.push(e);
    if (this.ring.length > this.ringSize) this.ring.splice(0, this.ring.length - this.ringSize);
    if (this.dir) {
      try {
        fs.appendFileSync(path.join(this.dir, `bridge-${e.ts.slice(0, 10)}.jsonl`), JSON.stringify(clip(e)) + "\n");
      } catch {
        /* disk full etc. — never crash on logging */
      }
    }
    if (!this.quiet && LEVELS[e.level] >= LEVELS[this.level]) {
      const tag = e.level === "error" ? "ERR " : e.level === "warn" ? "WARN" : e.level === "info" ? "INFO" : "DBG ";
      const extra = [e.tool, e.status, e.durationMs !== undefined ? `${e.durationMs}ms` : ""].filter(Boolean).join(" ");
      console.log(`${e.ts.slice(11, 19)} ${tag} ${e.event}${extra ? " [" + extra + "]" : ""}${e.message ? " — " + e.message : ""}`);
    }
    this.emit("log", e);
    return e;
  }
  debug(event: string, message?: string, extra: Partial<LogEntry> = {}) {
    return this.log({ level: "debug", event, message, ...extra });
  }
  info(event: string, message?: string, extra: Partial<LogEntry> = {}) {
    return this.log({ level: "info", event, message, ...extra });
  }
  warn(event: string, message?: string, extra: Partial<LogEntry> = {}) {
    return this.log({ level: "warn", event, message, ...extra });
  }
  error(event: string, message?: string, extra: Partial<LogEntry> = {}) {
    return this.log({ level: "error", event, message, ...extra });
  }
  recent(limit = 200, filter: (e: LogEntry) => boolean = () => true): LogEntry[] {
    return this.ring.filter(filter).slice(-limit);
  }
}

/** Keep log lines bounded. */
export function clip(v: unknown, max = 4000): unknown {
  if (typeof v === "string") return v.length > max ? v.slice(0, max) + `…[${v.length - max} more]` : v;
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => clip(x, max));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clip(x, max)]));
  return v;
}
