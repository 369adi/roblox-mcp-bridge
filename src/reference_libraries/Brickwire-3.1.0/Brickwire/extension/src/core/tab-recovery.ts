/**
 * M2-A tab recovery: decide whether a closed or discarded chat tab should be reopened.
 * background.ts reopens the chat URL in a minimized window. The content script then restores the run
 * from persist.ts (same chat path): finished calls are skipped via `executed`, and the pending inflight
 * batch is resumed by bridge call id, so it is not re-run.
 */
import type { TabAgentState } from "../../../shared/src/protocol.js";

export const RECOVERY_COOLDOWN_MS = 60_000;
export const MAX_RECOVERIES_PER_SESSION = 3;

export interface RecoveryLedger {
  /** sessionId -> timestamps of earlier recoveries */
  [sessionId: string]: number[];
}

export type RecoveryDecision = { recover: true; url: string; sessionId: string } | { recover: false; reason: string };

export function decideRecovery(state: TabAgentState | undefined, info: { isWindowClosing?: boolean; browserShuttingDown?: boolean }, ledger: RecoveryLedger, now: number): RecoveryDecision {
  if (!state) return { recover: false, reason: "tab had no agent" };
  if (!state.active) return { recover: false, reason: "agent not active" };
  if (!state.sessionId) return { recover: false, reason: "no session" };
  if (info.browserShuttingDown) return { recover: false, reason: "browser shutting down" };
  const url = state.url ?? "";
  if (!/^https:\/\//.test(url)) return { recover: false, reason: "no https chat url" };
  const past = (ledger[state.sessionId] ?? []).filter((t) => now - t < 24 * 3600_000);
  if (past.length >= MAX_RECOVERIES_PER_SESSION) return { recover: false, reason: `already recovered ${past.length}× for this session` };
  const last = past[past.length - 1];
  if (last !== undefined && now - last < RECOVERY_COOLDOWN_MS) return { recover: false, reason: "recovered less than 60 s ago" };
  ledger[state.sessionId] = [...past, now];
  return { recover: true, url, sessionId: state.sessionId };
}
