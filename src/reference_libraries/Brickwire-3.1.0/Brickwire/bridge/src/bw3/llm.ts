/** Direct OpenAI-compatible completions for Brickwire 3.0 chat, planner and reviewer calls (streaming when offered). */
import { headlessConfigFromEnv, completionsUrl, type FetchFn, type HeadlessConfig } from "../headless.js";
import { readCompletionStream } from "../stream-reader.js";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> };
export function llmConfig(env: Record<string, string | undefined>, model?: string) {
  const e = model ? { ...env, BRICKWIRE_LLM_MODEL: model } : env;
  return headlessConfigFromEnv(e);
}
export function envWithModel(env: Record<string, string | undefined>, model?: string) { return model ? { ...env, BRICKWIRE_LLM_MODEL: model } : env; }
export async function complete(c: HeadlessConfig, messages: ChatMsg[], o: { fetch?: FetchFn; signal?: AbortSignal; onDelta?: (d: string) => void; temperature?: number; json?: boolean } = {}) {
  const f = (o.fetch ?? (fetch as unknown as FetchFn));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (c.key) headers.Authorization = `Bearer ${c.key}`;
  const body = JSON.stringify({ model: c.model, messages, temperature: o.temperature ?? 0.2, stream: !!o.onDelta });
  let last = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600 * 2 ** (attempt - 1)));
    if (o.signal?.aborted) throw Object.assign(new Error("Cancelled by user"), { cancelled: true });
    let res;
    try {
      res = await f(completionsUrl(c.url), { method: "POST", headers, body, signal: AbortSignal.any([o.signal ?? new AbortController().signal, AbortSignal.timeout(120000)]) });
    } catch (e) {
      if (o.signal?.aborted) throw Object.assign(new Error("Cancelled by user"), { cancelled: true });
      last = `LLM API unreachable at ${completionsUrl(c.url)}: ${(e as Error).message}`; continue;
    }
    if (res.ok && res.body && res.headers?.get("content-type")?.includes("text/event-stream"))
      return await readCompletionStream(res.body, (d) => o.onDelta?.(d), o.signal);
    const text = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error(`LLM API rejected the key (HTTP ${res.status})`);
    if (!res.ok) { last = `LLM API HTTP ${res.status}: ${text.slice(0, 200)}`; if (res.status >= 500 || res.status === 429) continue; throw new Error(last); }
    const content = (JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("LLM API answer has no choices[0].message.content");
    o.onDelta?.(content);
    return content;
  }
  throw new Error(last);
}
/** Extract the first JSON object from a model reply (fenced or bare). */
export function extractJson(text: string): any {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = fence ? fence[1] : text;
  const start = src.indexOf("{");
  if (start < 0) throw new Error("No JSON object in model reply");
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) { if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true; else if (ch === "{") depth++; else if (ch === "}" && --depth === 0) return JSON.parse(src.slice(start, i + 1));
  }
  throw new Error("Unterminated JSON object in model reply");
}
export async function listModels(c: HeadlessConfig, f?: FetchFn): Promise<string[]> {
  const url = c.url.replace(/\/+$/, "").replace(/\/chat\/completions$/, "") + "/models";
  const headers: Record<string, string> = {}; if (c.key) headers.Authorization = `Bearer ${c.key}`;
  const res = await (f ?? (fetch as unknown as FetchFn))(url, { method: "GET", headers, body: undefined as unknown as string, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`GET /models HTTP ${res.status}`);
  const j = JSON.parse(await res.text()) as { data?: Array<{ id?: string }>; models?: Array<{ name?: string }> };
  return [...(j.data ?? []).map((m) => m.id), ...(j.models ?? []).map((m) => m.name)].filter((x): x is string => typeof x === "string").slice(0, 300);
}
