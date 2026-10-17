/**
 * Results feed: puts what Blender / Figma (or the tools that drive them) produce into the Brickwire app chat —
 * 3D models as artifact cards (WebGL viewer), pictures as image attachments, plus one-click follow-up actions.
 */
import type { AiFileStore, AiFile } from "../file-tools.js";

export interface ChatAction { label: string; tool: string; args: Record<string, unknown> }
export interface FeedPost {
  source: "blender" | "figma";
  title: string;
  text: string;
  images?: Array<{ name: string; data: Buffer }>;
  artifacts?: string[];
  actions?: ChatAction[];
}
export interface ResultFeed {
  post(p: FeedPost): { conversationId: string; messageId: string } | null;
  /** Register an external OBJ (+MTL) as a 3D artifact with a rendered thumbnail. */
  importModel(m: { name: string; obj: string; mtl?: string; source: "blender" | "figma"; request: string; fileIds?: string[] }): { id: string; stats: { vertices: number; triangles: number; parts: number; materials: number; size: [number, number, number] } };
}
export const kb = (n: number) => (n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
export const fileLine = (f: AiFile) => `${f.name} (${kb(f.bytes)}) → fileId ${f.id}`;
export function storeB64(store: AiFileStore, items: Array<{ name?: string; data?: string }>, source: AiFile["source"]) {
  const out: AiFile[] = [];
  for (const it of items ?? []) {
    if (!it || typeof it.data !== "string" || !it.data) continue;
    out.push(store.add(Buffer.from(it.data, "base64"), { name: String(it.name || "file.bin").slice(0, 120), source }));
  }
  return out;
}
