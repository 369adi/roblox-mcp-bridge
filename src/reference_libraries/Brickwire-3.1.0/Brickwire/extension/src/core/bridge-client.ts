import { sleep } from "./clock.js";
import type { CallEnvelope, HealthResponse, RuntimeRequest, RuntimeResponse, SessionStartResponse, ToolCall, ToolDescriptor, ToolResult } from "../../../shared/src/protocol.js";

/** BridgeClient — content-script side. All traffic goes through the background service worker. */
export class BridgeClient {
  private transport: (req: RuntimeRequest) => Promise<RuntimeResponse>;
  constructor(transport: (req: RuntimeRequest) => Promise<RuntimeResponse> = defaultTransport) {
    this.transport = transport;
  }

  private async req<T>(method: "GET" | "POST" | "PUT", path: string, body?: unknown): Promise<RuntimeResponse<T>> {
    return (await this.transport({ type: "bridge", method, path, body })) as RuntimeResponse<T>;
  }

  async health(): Promise<{ online: boolean; health?: HealthResponse; error?: string }> {
    const r = await this.req<HealthResponse>("GET", "/api/health");
    if (!r.ok || !r.data) return { online: false, error: r.error ?? "Bridge offline" };
    return { online: true, health: r.data };
  }

  async startSession(provider: string, task: string | null, opts: { mode?: string; category?: string } = {}): Promise<SessionStartResponse> {
    const r = await this.req<SessionStartResponse & { error?: string }>("POST", "/api/sessions/start", { provider, task, ...opts });
    if (!r.ok || !r.data?.session) throw new Error((r.data as { error?: string })?.error ?? r.error ?? "could not start session");
    return r.data;
  }

  async tools(): Promise<ToolDescriptor[] | null> {
    const r = await this.req<{ tools: ToolDescriptor[] }>("GET", "/api/tools");
    return r.ok && r.data?.tools ? r.data.tools : null;
  }

  async stopSession(sessionId: string) {
    await this.req("POST", "/api/sessions/stop", { sessionId });
  }

  async updateSession(sessionId: string, patch: { stage?: string; task?: string | null; mode?: string; category?: string; trustAll?: boolean }) {
    await this.req("POST", "/api/sessions/update", { sessionId, ...patch });
  }

  /** Content of a file from the bridge's AI file store (file_* tools), for attaching it to the AI chat. */
  async fileBase64(fileId: string) {
    const r = await this.req<{ name: string; mime: string; data: string; error?: string }>("GET", `/api/files/${encodeURIComponent(fileId)}/base64`);
    if (!r.ok || !r.data?.data) throw new Error(r.data?.error ?? r.error ?? "file not available");
    return r.data;
  }

  async decide(approvalId: string, approve: boolean) {
    return this.req("POST", `/api/approvals/${approvalId}`, { approve });
  }

  /** Execute a call, long-polling until done. onPending is invoked when user approval is needed. */
  async callTool(
    call: ToolCall,
    ctx: { sessionId: string; provider: string },
    hooks: { onPending?: (env: CallEnvelope) => void; shouldAbort?: () => boolean; onSubmitted?: (callId: string) => void; resumeCallId?: string } = {},
  ): Promise<ToolResult> {
    // Resume a call that was already submitted before a page reload (the bridge kept running it).
    const first = hooks.resumeCallId
      ? await this.req<CallEnvelope & { error?: string }>("GET", `/api/calls/${hooks.resumeCallId}?wait=1000`)
      : await this.req<CallEnvelope & { error?: string }>("POST", "/api/calls", { ...ctx, call, waitMs: 20000 });
    if (!first.ok || !first.data?.callId) {
      if (hooks.resumeCallId && !first.offline)
        return { id: call.id, status: "error", result: null, error: "the result of this call was lost while the page reloaded — check the current state with a read tool before retrying" };
      return { id: call.id, status: "error", result: null, error: first.offline ? "Bridge offline" : first.data?.error ?? first.error ?? "bridge error" };
    }
    let env = first.data;
    hooks.onSubmitted?.(env.callId);
    let offlineStrikes = 0;
    while (env.state !== "done") {
      if (env.state === "pending_approval") hooks.onPending?.(env);
      if (hooks.shouldAbort?.()) return { id: call.id, status: "rejected", result: null, error: "session stopped by user" };
      const r = await this.req<CallEnvelope>("GET", `/api/calls/${env.callId}?wait=15000&since=${env.state}`);
      if (!r.ok || !r.data) {
        if (++offlineStrikes > 4) return { id: call.id, status: "error", result: null, error: "Bridge offline while waiting for result" };
        await sleep(1000);
        continue;
      }
      offlineStrikes = 0;
      env = r.data;
    }
    return env.result!;
  }
}

function defaultTransport(req: RuntimeRequest): Promise<RuntimeResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (res: RuntimeResponse) => {
        const err = chrome.runtime.lastError;
        if (err) resolve({ ok: false, offline: true, error: "Extension context unavailable: " + err.message });
        else resolve(res ?? { ok: false, error: "no response" });
      });
    } catch (e) {
      resolve({ ok: false, offline: true, error: "Extension reloaded — refresh this page (" + (e as Error).message + ")" });
    }
  });
}
