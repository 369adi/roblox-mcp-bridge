import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { AGENT_CATEGORIES, SAFETY_MODES } from "../../shared/src/protocol.js";
import type { AgentCategory, AgentStage, SafetyMode, SessionInfo } from "../../shared/src/protocol.js";

export type SessionPatch = { stage?: AgentStage; task?: string | null; mode?: SafetyMode | null; category?: AgentCategory | null; trustAll?: boolean };

export class SessionManager {
  current: SessionInfo | null = null;
  private history: SessionInfo[] = [];
  private file: string;
  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "sessions.json");
    try {
      this.history = JSON.parse(fs.readFileSync(this.file, "utf8"));
      for (const s of this.history) if (s.active) {
        s.active = false;
        s.endedAt = s.endedAt ?? new Date().toISOString();
      }
    } catch {
      this.history = [];
    }
  }

  start(provider: string, projectKey: string, projectName: string, task?: string | null): SessionInfo {
    if (this.current) this.stop(this.current.id);
    const s: SessionInfo = {
      id: "s_" + crypto.randomBytes(5).toString("hex"),
      provider,
      projectKey,
      projectName,
      startedAt: new Date().toISOString(),
      endedAt: null,
      task: task ?? null,
      stage: "ANALYZE",
      toolCalls: 0,
      errors: 0,
      active: true,
    };
    this.current = s;
    this.history.push(s);
    if (this.history.length > 200) this.history.splice(0, this.history.length - 200);
    this.persist();
    return s;
  }

  get(id: string | undefined): SessionInfo | undefined {
    return id ? this.history.find((s) => s.id === id) : undefined;
  }

  update(id: string, patch: SessionPatch) {
    const s = this.get(id);
    if (!s) return undefined;
    if (patch.stage) s.stage = patch.stage;
    if (patch.task !== undefined) s.task = patch.task;
    if (patch.mode !== undefined) s.mode = patch.mode && SAFETY_MODES.includes(patch.mode) ? patch.mode : null;
    if (patch.category !== undefined) s.category = patch.category && AGENT_CATEGORIES.includes(patch.category) ? patch.category : null;
    if (patch.trustAll !== undefined) s.trustAll = patch.trustAll === true;
    this.persist();
    return s;
  }

  countCall(id: string | undefined, error: boolean) {
    const s = this.get(id);
    if (!s) return;
    s.toolCalls++;
    if (error) s.errors++;
    this.persist();
  }

  stop(id: string): SessionInfo | undefined {
    const s = this.get(id);
    if (!s) return undefined;
    s.active = false;
    s.endedAt = new Date().toISOString();
    if (this.current?.id === id) this.current = null;
    this.persist();
    return s;
  }

  list(): SessionInfo[] {
    return [...this.history].reverse();
  }

  private persist() {
    try {
      fs.writeFileSync(this.file, JSON.stringify(this.history, null, 1));
    } catch {
      /* ignore */
    }
  }
}
