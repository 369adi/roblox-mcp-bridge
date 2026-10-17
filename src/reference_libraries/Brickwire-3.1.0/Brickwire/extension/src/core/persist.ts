import type { AgentStage, ToolCall, ToolResult } from "../../../shared/src/protocol.js";
import type { ActivityState } from "./agent-core.js";

/**
 * Agent state that survives a page reload (F5, crash-restore, site re-login).
 * Stored per AI site in chrome.storage.local and only restored into the SAME chat (URL path)
 * while the bridge session is still alive. Executed-call keys are persisted so nothing runs twice.
 */
export interface InflightBatch {
  replyIndex: number;
  calls: ToolCall[];
  /** call.id → bridge callId (the bridge keeps running a call even while the page reloads). */
  callIds: Record<string, string>;
  results: ToolResult[];
  footer?: string;
}

export interface SavedRun {
  v: 1;
  provider: string;
  sessionId: string;
  path: string;
  savedAt: number;
  paused: boolean;
  stage: AgentStage;
  task: string | null;
  executed: string[];
  processed: string[];
  baselineKey: string;
  lastHandledCount: number;
  awaitingReply: boolean;
  awaitingReady: boolean;
  agentSent: boolean;
  toolsSinceUser: number;
  remindersThisTurn: number;
  autoTurns: number;
  unverified: boolean;
  unverifiedNagged: boolean;
  activity: Array<{ k: string; t: string; s: ActivityState }>;
  inflight: InflightBatch | null;
  /** Tool names the AI was told about (instructions + later notices). Missing in saves from before 3.0. */
  knownTools?: string[];
}

const key = (provider: string) => `bw_run_${provider}`;
export const MAX_AGE_MS = 24 * 3600 * 1000;

export async function loadRun(provider: string): Promise<SavedRun | null> {
  try {
    const r = await chrome.storage.local.get(key(provider));
    const s = r?.[key(provider)] as SavedRun | undefined;
    if (!s || s.v !== 1 || Date.now() - s.savedAt > MAX_AGE_MS) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveRun(s: SavedRun): void {
  try {
    void chrome.storage.local.set({ [key(s.provider)]: s });
  } catch {
    /* extension reloaded */
  }
}

export function clearRun(provider: string): void {
  try {
    void chrome.storage.local.remove(key(provider));
  } catch {
    /* ignore */
  }
}
