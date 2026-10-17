import fs from "node:fs";
import path from "node:path";
import type { SnapshotRecord } from "./composites.js";

/** Persistent per-place project memory (JSON files in data/projects). */

export interface MemoryItem {
  path?: string;
  text: string;
  ts: string;
}

export interface ProjectMemory {
  key: string;
  name: string;
  placeId: string | number | null;
  createdAt: string;
  updatedAt: string;
  place: Record<string, unknown>;
  scan: { at: string; scripts: Array<{ path: string; class: string }>; guis: Array<{ path: string; class: string; descendants?: number }>; scriptCount?: number; remotes?: number } | null;
  importantScripts: MemoryItem[];
  importantGuis: MemoryItem[];
  systems: MemoryItem[];
  dependencies: MemoryItem[];
  preferences: MemoryItem[];
  notes: MemoryItem[];
  changes: Array<{ ts: string; tool: string; summary: string; sessionId?: string }>;
  errors: Array<{ ts: string; tool: string; message: string; sessionId?: string }>;
  lastSession: { id: string; provider: string; startedAt: string; endedAt?: string | null; task?: string | null } | null;
  snapshots: SnapshotRecord[];
}

export const MEMORY_CATEGORIES = ["important_script", "important_gui", "system", "dependency", "preference", "note"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

const FIELD: Record<MemoryCategory, keyof ProjectMemory> = {
  important_script: "importantScripts",
  important_gui: "importantGuis",
  system: "systems",
  dependency: "dependencies",
  preference: "preferences",
  note: "notes",
};

export function projectKeyFor(placeId: unknown, name: string): string {
  const id = placeId !== undefined && placeId !== null && String(placeId) !== "0" && String(placeId) !== "" ? String(placeId) : null;
  return id ? `place-${id}` : `local-${name.replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 60) || "untitled"}`;
}

export class MemoryStore {
  private cache = new Map<string, ProjectMemory>();
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  private file(key: string) {
    return path.join(this.dir, key.replace(/[^A-Za-z0-9_-]/g, "_") + ".json");
  }

  get(key: string): ProjectMemory | undefined {
    if (this.cache.has(key)) return this.cache.get(key);
    const f = this.file(key);
    if (!fs.existsSync(f)) return undefined;
    try {
      const m = JSON.parse(fs.readFileSync(f, "utf8")) as ProjectMemory;
      this.cache.set(key, m);
      return m;
    } catch {
      return undefined;
    }
  }

  ensure(key: string, name: string, placeId: string | number | null): ProjectMemory {
    let m = this.get(key);
    if (!m) {
      const now = new Date().toISOString();
      m = {
        key,
        name,
        placeId,
        createdAt: now,
        updatedAt: now,
        place: {},
        scan: null,
        importantScripts: [],
        importantGuis: [],
        systems: [],
        dependencies: [],
        preferences: [],
        notes: [],
        changes: [],
        errors: [],
        lastSession: null,
        snapshots: [],
      };
      this.cache.set(key, m);
      this.save(m);
    }
    return m;
  }

  save(m: ProjectMemory) {
    m.updatedAt = new Date().toISOString();
    const f = this.file(m.key);
    const tmp = f + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2));
    fs.renameSync(tmp, f);
  }

  list(): Array<Pick<ProjectMemory, "key" | "name" | "placeId" | "updatedAt">> {
    return fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.get(f.slice(0, -5)))
      .filter((m): m is ProjectMemory => !!m)
      .map((m) => ({ key: m.key, name: m.name, placeId: m.placeId, updatedAt: m.updatedAt }));
  }

  addItem(m: ProjectMemory, category: MemoryCategory, text: string, p?: string) {
    const list = m[FIELD[category]] as MemoryItem[];
    const existing = list.find((i) => (p && i.path === p) || (!p && i.text === text));
    if (existing) {
      existing.text = text;
      existing.ts = new Date().toISOString();
    } else list.push({ path: p, text, ts: new Date().toISOString() });
    if (list.length > 200) list.splice(0, list.length - 200);
    this.save(m);
  }

  removeItem(m: ProjectMemory, category: MemoryCategory, index: number) {
    (m[FIELD[category]] as MemoryItem[]).splice(index, 1);
    this.save(m);
  }

  addChange(m: ProjectMemory, tool: string, summary: string, sessionId?: string) {
    m.changes.push({ ts: new Date().toISOString(), tool, summary: summary.slice(0, 300), sessionId });
    if (m.changes.length > 300) m.changes.splice(0, m.changes.length - 300);
    this.save(m);
  }

  addError(m: ProjectMemory, tool: string, message: string, sessionId?: string) {
    m.errors.push({ ts: new Date().toISOString(), tool, message: message.slice(0, 400), sessionId });
    if (m.errors.length > 150) m.errors.splice(0, m.errors.length - 150);
    this.save(m);
  }

  importantPaths(m: ProjectMemory | undefined): string[] {
    if (!m) return [];
    return [...m.importantScripts, ...m.importantGuis, ...m.systems].map((i) => i.path).filter((p): p is string => !!p);
  }

  /** Compact text for context injection. */
  summary(m: ProjectMemory | undefined): string {
    if (!m) return "";
    const lines: string[] = [];
    lines.push(`Project: ${m.name}${m.placeId ? ` (placeId ${m.placeId})` : ""}`);
    if (m.scan) {
      const guis = m.scan.guis.map((g) => g.path.replace(/^game\.StarterGui\./, "")).slice(0, 30);
      if (guis.length) lines.push(`Existing GUIs in StarterGui (do NOT recreate): ${guis.join(", ")}`);
      const scripts = m.scan.scripts.slice(0, 40).map((s) => `${s.path} (${s.class})`);
      if (scripts.length) lines.push(`Existing scripts (${m.scan.scriptCount ?? scripts.length}): ${scripts.join("; ")}${(m.scan.scriptCount ?? 0) > 40 ? " …" : ""}`);
    }
    const sect = (title: string, items: MemoryItem[]) => {
      if (items.length) lines.push(`${title}: ${items.slice(-15).map((i) => (i.path ? `${i.path} — ${i.text}` : i.text)).join("; ")}`);
    };
    sect("Important scripts", m.importantScripts);
    sect("Important GUIs", m.importantGuis);
    sect("Existing systems", m.systems);
    sect("Dependencies", m.dependencies);
    sect("Preferences", m.preferences);
    sect("Notes", m.notes);
    if (m.changes.length) lines.push(`Recent changes: ${m.changes.slice(-8).map((c) => c.summary).join("; ")}`);
    if (m.errors.length) lines.push(`Known errors: ${m.errors.slice(-5).map((e) => `${e.tool}: ${e.message}`).join("; ")}`);
    if (m.lastSession) lines.push(`Last session: ${m.lastSession.startedAt} via ${m.lastSession.provider}${m.lastSession.task ? ` — "${m.lastSession.task.slice(0, 80)}"` : ""}`);
    return lines.join("\n");
  }
}
