/**
 * Brickwire wire protocol — shared by extension, bridge, dashboard and tests.
 * Text markers are what the AI emits / receives inside chat messages.
 */

export const PROTOCOL_VERSION = "2.0";
export const BRIDGE_VERSION = "3.1.0"; // synced from package.json by scripts/build.mjs
export const DEFAULT_BRIDGE_PORT = 47821;

/** Tag names. On the wire they are written as XML-like tags: <ROBLOX_TOOL_CALL>{…}</ROBLOX_TOOL_CALL>. */
export const MARKERS = {
  TOOL_CALL: "ROBLOX_TOOL_CALL",
  TOOL_RESULT: "ROBLOX_TOOL_RESULT",
  STATUS: "ROBLOX_AGENT_STATUS",
  ERROR: "ROBLOX_AGENT_ERROR",
  DONE: "ROBLOX_AGENT_DONE",
  /** Raw Luau block for execute_luau — no JSON, no escaping (long code survives intact). */
  LUAU: "ROBLOX_LUAU",
  /** 3.0: raw file block — the AI writes a whole file (script, JSON, CSV, OBJ, SVG…) with no JSON escaping; it becomes file_save. */
  FILE: "ROBLOX_FILE",
  /** 1.8: the AI asks the user (clarifying questions / variants to choose from) and waits — no reminder. */
  ASK: "ROBLOX_AGENT_ASK",
} as const;
export const openTag = (m: string) => `<${m}>`;
export const closeTag = (m: string) => `</${m}>`;

export type BridgeState =
  | "OFFLINE"
  | "BRIDGE_READY"
  | "STUDIO_NOT_FOUND"
  | "STUDIO_FOUND"
  | "MCP_CONNECTING"
  | "MCP_READY"
  | "SESSION_ACTIVE"
  | "ERROR";

export type AgentStage = "IDLE" | "ANALYZE" | "PLAN" | "EXECUTE" | "TEST" | "FIX" | "DONE";
export const AGENT_STAGES: AgentStage[] = ["ANALYZE", "PLAN", "EXECUTE", "TEST", "FIX", "DONE"];

export type ToolSource = "mcp" | "composite" | "bridge";
export type ToolRisk = "read" | "write" | "destructive";

export interface JsonSchema {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JsonSchema;
  [k: string]: unknown;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  source: ToolSource;
  risk: ToolRisk;
  available: boolean;
  unavailableReason?: string;
  /** MCP tools a composite tool depends on. */
  requires?: string[];
}

export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, unknown>;
}

export type ToolResultStatus = "success" | "error" | "denied" | "rejected" | "timeout";

export interface ToolResult {
  id: string;
  status: ToolResultStatus;
  result: unknown;
  error: string | null;
  meta?: {
    durationMs?: number;
    retries?: number;
    snapshotId?: string;
    truncated?: boolean;
    tool?: string;
  };
}

export type CallState = "running" | "pending_approval" | "done";

export interface CallEnvelope {
  callId: string;
  state: CallState;
  tool: string;
  args: Record<string, unknown>;
  approvalId?: string;
  approvalReason?: string;
  result?: ToolResult;
}

export type SafetyMode = "full" | "auto" | "approval" | "safe";
export const SAFETY_MODES: SafetyMode[] = ["full", "auto", "approval", "safe"];
/** Work category the AI is launched for — adds a focused section to the agent prompt. */
export type AgentCategory = "general" | "build" | "scripting" | "ui" | "vfx" | "animation" | "gameplay" | "debug";
export const AGENT_CATEGORIES: AgentCategory[] = ["general", "build", "scripting", "ui", "vfx", "animation", "gameplay", "debug"];

export interface BridgeSettings {
  mode: SafetyMode;
  toolTimeoutMs: number;
  approvalTimeoutMs: number;
  autoSnapshot: boolean;
  maxResultChars: number;
  selectedStudioId: string | null;
}

export interface StudioInfo {
  id: string;
  name: string;
  placeId?: string | number | null;
}

export interface McpHealth {
  state: "disabled" | "connecting" | "ready" | "error" | "stopped";
  command: string | null;
  serverName?: string;
  serverVersion?: string;
  toolCount: number;
  lastError?: string | null;
}

export interface HealthResponse {
  ok: true;
  protocol: string;
  bridgeVersion: string;
  state: BridgeState;
  reason: string;
  platform: string;
  mcp: McpHealth;
  studio: {
    processRunning: boolean | null;
    instances: StudioInfo[];
    selected: StudioInfo | null;
    /** true = a place is open and usable, false = Studio connected but no place, null = unknown. */
    placeOpen: boolean | null;
  };
  session: SessionInfo | null;
  settings: BridgeSettings;
  pendingApprovals: ApprovalRequest[];
}

export interface SessionInfo {
  id: string;
  provider: string;
  projectKey: string;
  projectName: string;
  startedAt: string;
  endedAt?: string | null;
  task?: string | null;
  stage: AgentStage;
  toolCalls: number;
  errors: number;
  active: boolean;
  /** Per-session approval mode chosen in the panel (overrides the bridge default). */
  mode?: SafetyMode | null;
  category?: AgentCategory | null;
  /** "Approve all for this session" — confirmations are skipped (deny rules still apply). */
  trustAll?: boolean;
}

export interface SessionStartResponse {
  session: SessionInfo;
  tools: ToolDescriptor[];
  memorySummary: string;
}

export interface LogEntry {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  event: string;
  provider?: string;
  sessionId?: string;
  tool?: string;
  args?: unknown;
  result?: unknown;
  status?: string;
  durationMs?: number;
  message?: string;
}

export interface ApprovalRequest {
  id: string;
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  reason: string;
  createdAt: string;
  sessionId?: string;
}

/** Messages exchanged between content script / popup and the background service worker. */
export type RuntimeRequest =
  | { type: "bridge"; method: "GET" | "POST" | "PUT"; path: string; body?: unknown }
  | { type: "openDashboard" }
  | { type: "openOptions" }
  | { type: "openUrl"; url: string }
  | { type: "tabState"; state: TabAgentState }
  | { type: "getTabStates" }
  | { type: "customSitesChanged" }
  /** 1.7 Library → Community: downscaled thumbnail (data URL) of an allow-listed https image */
  | { type: "thumb"; url: string; size?: number }
  /** 1.7 Library → Community: fetch the live ui-resources.com catalogue (compacted) */
  | { type: "communityRefresh" };

export interface RuntimeResponse<T = unknown> {
  ok: boolean;
  status?: number;
  data?: T;
  offline?: boolean;
  error?: string;
}

export interface TabAgentState {
  provider: string;
  providerName: string;
  active: boolean;
  stage: AgentStage;
  task: string | null;
  sessionId: string | null;
  url?: string;
  updatedAt?: number;
}
