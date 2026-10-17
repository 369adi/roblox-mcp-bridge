/**
 * PRO action history: every tool call, every plugin request and every finished task, append-only JSONL
 * per day under data/history/. Survives restarts; searchable; exportable as a Luau replay script.
 */
import fs from "node:fs";
import path from "node:path";

export interface HistoryEntry {
  id: string;
  ts: string;
  kind: "tool" | "request" | "done" | "note";
  sessionId?: string;
  provider?: string;
  tool?: string;
  args?: unknown;
  status?: string;
  error?: string | null;
  result?: string;
  durationMs?: number;
  snapshotId?: string;
  text?: string;
}

export interface HistoryQuery {
  q?: string;
  sessionId?: string;
  kind?: string;
  /** only entries newer than this many days (free tier: 7) */
  days?: number;
  limit?: number;
  before?: string;
}

const clipStr = (v: unknown, n: number): string => {
  const s = typeof v === "string" ? v : JSON.stringify(v ?? null);
  return s.length > n ? s.slice(0, n) + "…" : s;
};

export class ActionHistory {
  private seq = 0;
  constructor(private dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(day: string) {
    return path.join(this.dir, `${day}.jsonl`);
  }

  record(e: Omit<HistoryEntry, "id" | "ts">): HistoryEntry {
    const ts = new Date().toISOString();
    const entry: HistoryEntry = { id: `h_${Date.now().toString(36)}_${(++this.seq).toString(36)}`, ts, ...e };
    if (entry.args !== undefined) {
      const s = JSON.stringify(entry.args);
      if (s.length > 40000) entry.args = clipStr(entry.args, 40000);
    }
    if (entry.result !== undefined) entry.result = clipStr(entry.result, 3000);
    try {
      fs.appendFileSync(this.file(ts.slice(0, 10)), JSON.stringify(entry) + "\n");
    } catch {
      /* disk full / read-only: history is best-effort, never breaks a call */
    }
    return entry;
  }

  days(): string[] {
    try {
      return fs.readdirSync(this.dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse();
    } catch {
      return [];
    }
  }

  private readDay(day: string): HistoryEntry[] {
    try {
      return fs.readFileSync(this.file(day), "utf8").split("\n").filter(Boolean).flatMap((l) => {
        try {
          return [JSON.parse(l) as HistoryEntry];
        } catch {
          return [];
        }
      });
    } catch {
      return [];
    }
  }

  /** Newest first. */
  query(q: HistoryQuery = {}): HistoryEntry[] {
    const limit = Math.min(2000, Math.max(1, q.limit ?? 200));
    const minDay = q.days ? new Date(Date.now() - q.days * 86400000).toISOString().slice(0, 10) : "";
    const needle = q.q?.toLowerCase().trim();
    const out: HistoryEntry[] = [];
    for (const day of this.days()) {
      if (minDay && day < minDay) break;
      const rows = this.readDay(day).reverse();
      for (const r of rows) {
        if (q.before && r.ts >= q.before) continue;
        if (q.sessionId && r.sessionId !== q.sessionId) continue;
        if (q.kind && r.kind !== q.kind) continue;
        if (needle && !`${r.tool ?? ""} ${r.text ?? ""} ${JSON.stringify(r.args ?? "")} ${r.error ?? ""}`.toLowerCase().includes(needle)) continue;
        out.push(r);
        if (out.length >= limit) return out;
      }
    }
    return out;
  }

  /** Sessions with counts, newest first. */
  sessions(days?: number) {
    const map = new Map<string, { sessionId: string; provider?: string; first: string; last: string; calls: number; errors: number; task?: string }>();
    for (const r of this.query({ days, limit: 2000 })) {
      const id = r.sessionId ?? "no-session";
      const s = map.get(id) ?? { sessionId: id, provider: r.provider, first: r.ts, last: r.ts, calls: 0, errors: 0 };
      if (r.ts < s.first) s.first = r.ts;
      if (r.ts > s.last) s.last = r.ts;
      if (r.kind === "tool") {
        s.calls++;
        if (r.status !== "success") s.errors++;
      }
      if (r.kind === "request" && r.text) s.task = r.text.slice(0, 140); // oldest request wins (rows come newest first)
      map.set(id, s);
    }
    return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
  }

  /** Replay script: every successful Luau/edit action of a session, in order, as one Luau file. */
  exportLuau(sessionId: string): string {
    const rows = this.query({ sessionId, kind: "tool", limit: 2000 }).reverse().filter((r) => r.status === "success");
    const parts = [`-- Brickwire replay · session ${sessionId} · ${rows.length} successful actions`, "-- Paste into the Studio command bar or run with execute_luau (BW helpers needed for BW.* calls).", ""];
    for (const r of rows) {
      const a = (r.args ?? {}) as Record<string, unknown>;
      const code = typeof a.code === "string" ? a.code : typeof a.source === "string" ? a.source : null;
      if (code) parts.push(`-- [${r.ts}] ${r.tool}`, "do", code, "end", "");
      else if (r.tool && !/^(search_|script_read|inspect_|get_|list_|screen_capture|memory_get|script_grep|script_search)/.test(r.tool)) parts.push(`-- [${r.ts}] ${r.tool} ${clipStr(a, 300)}`, "");
    }
    return parts.join("\n");
  }

  exportMarkdown(sessionId: string): string {
    const rows = this.query({ sessionId, limit: 2000 }).reverse();
    const lines = [`# Brickwire session ${sessionId}`, ""];
    for (const r of rows) {
      if (r.kind === "request") lines.push(`## 🧑 ${r.text ?? ""}`, "");
      else if (r.kind === "done") lines.push(`**✅ ${r.text ?? "done"}**`, "");
      else if (r.kind === "tool") lines.push(`- ${r.status === "success" ? "✓" : "✗"} \`${r.tool}\` ${r.durationMs ?? 0} ms${r.error ? ` — ${r.error}` : ""}`);
    }
    return lines.join("\n");
  }
}
