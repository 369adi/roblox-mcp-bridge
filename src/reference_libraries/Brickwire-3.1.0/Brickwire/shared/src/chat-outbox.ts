/**
 * Chat outbox (M5 / M6): things the local tools (Paint, UI Builder) want to post into the AI chat.
 * The bridge holds the queue; the extension content script polls `/api/outbox/next`, attaches the image
 * (paste / file input) and/or types the text, then reports what really happened (`image` | `text` | `none`).
 */
export type OutboxKind = "image" | "text";
export type OutboxState = "queued" | "taken" | "done" | "failed";
export interface OutboxResult { mode: "image" | "text" | "none"; provider?: string; error?: string }
export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  text: string;
  /** base64 PNG without the data: prefix */
  png?: string;
  name?: string;
  source: string;
  createdAt: number;
  takenAt?: number;
  state: OutboxState;
  result?: OutboxResult;
}

export const OUTBOX_MAX_PNG = 12 * 1024 * 1024;
export const OUTBOX_TAKE_TIMEOUT = 90_000;

export class ChatOutbox {
  private items = new Map<string, OutboxItem>();
  private seq = 0;
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  add(input: { kind?: OutboxKind; text?: string; png?: string | null; name?: string; source?: string }): OutboxItem {
    let png = input.png ?? undefined;
    if (png && png.startsWith("data:")) png = png.slice(png.indexOf(",") + 1);
    if (png && !/^[A-Za-z0-9+/=\s]+$/.test(png)) throw new Error("png must be base64");
    if (png && png.length * 0.75 > OUTBOX_MAX_PNG) throw new Error("png too large (max 12 MB)");
    const kind: OutboxKind = png ? "image" : "text";
    const text = String(input.text ?? "").slice(0, 60000);
    if (!png && !text.trim()) throw new Error("nothing to send (no image and no text)");
    const item: OutboxItem = { id: `ob_${this.now().toString(36)}_${++this.seq}`, kind, text, png, name: input.name, source: input.source ?? "tool", createdAt: this.now(), state: "queued" };
    this.items.set(item.id, item);
    this.gc();
    return item;
  }

  /** Next item for an extension tab. Items taken but never reported come back after OUTBOX_TAKE_TIMEOUT. */
  next(): OutboxItem | null {
    const t = this.now();
    for (const it of this.items.values()) {
      if (it.state === "taken" && it.takenAt !== undefined && t - it.takenAt > OUTBOX_TAKE_TIMEOUT) it.state = "queued";
    }
    for (const it of this.items.values()) {
      if (it.state === "queued") {
        it.state = "taken";
        it.takenAt = t;
        return it;
      }
    }
    return null;
  }

  report(id: string, result: OutboxResult): OutboxItem | null {
    const it = this.items.get(id);
    if (!it) return null;
    it.result = { mode: result.mode, provider: result.provider, error: result.error };
    it.state = result.mode === "none" ? "failed" : "done";
    return it;
  }

  get(id: string): OutboxItem | null {
    return this.items.get(id) ?? null;
  }

  /** Public view without the image payload. */
  view(it: OutboxItem) {
    const { png, ...rest } = it;
    return { ...rest, hasImage: !!png };
  }

  private gc() {
    const t = this.now();
    for (const [id, it] of this.items) if (t - it.createdAt > 3_600_000 || this.items.size > 50) { if (it.state !== "queued") this.items.delete(id); }
  }
}
