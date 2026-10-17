import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ProjectBinding } from "./operation-store.js";
export type WorkspaceKind =
  "design" | "vfx" | "asset" | "qa" | "graph" | "note" | "conversation" | "animation";
export interface WorkspaceRecord {
  id: string;
  kind: WorkspaceKind;
  name: string;
  binding: ProjectBinding | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
}
const kinds = new Set([
  "design",
  "vfx",
  "asset",
  "qa",
  "graph",
  "note",
  "conversation",
  "animation",
]);
/** Local records are drafts/observations, never evidence of successful Studio execution. */
export class WorkspaceStore {
  private file: string;
  private rows: WorkspaceRecord[] = [];
  readonly errors: string[] = [];
  constructor(dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "workspace-v1.json");
    if (fs.existsSync(this.file))
      try {
        const v = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (
          v.version !== 1 ||
          !Array.isArray(v.records) ||
          v.records.some(
            (r: any) =>
              !/^ws_[a-f0-9]{20}$/.test(r.id) ||
              !kinds.has(r.kind) ||
              !Number.isInteger(r.revision) ||
              !r.data,
          )
        )
          throw Error("invalid workspace schema");
        this.rows = v.records;
      } catch (e) {
        this.errors.push("Workspace state unreadable; original file preserved: " + String(e));
      }
  }
  list(kind?: string) {
    return this.rows
      .filter((r) => !kind || r.kind === kind)
      .slice()
      .reverse()
      .map((r) => structuredClone(r));
  }
  get(id: string) {
    const r = this.rows.find((r) => r.id === id);
    if (!r) throw Error("Record not found");
    return structuredClone(r);
  }
  private persist(next: WorkspaceRecord[]) {
    if (this.errors.length) throw Error(this.errors[0]);
    const text = JSON.stringify({ version: 1, records: next });
    if (Buffer.byteLength(text) > 12 * 1024 * 1024)
      throw Error("Workspace quota reached. Export/remove old drafts.");
    const tmp = this.file + "." + crypto.randomBytes(6).toString("hex") + ".tmp";
    fs.writeFileSync(tmp, text, { mode: 0o600 });
    try {
      fs.renameSync(tmp, this.file);
      this.rows = next;
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  }
  save(input: any, binding: ProjectBinding | null) {
    if (
      !kinds.has(input.kind) ||
      typeof input.name !== "string" ||
      !input.name.trim() ||
      input.name.length > 180 ||
      !input.data ||
      typeof input.data !== "object" ||
      Array.isArray(input.data)
    )
      throw Error("Kind, name and JSON object required");
    if (Buffer.byteLength(JSON.stringify(input.data)) > 512000)
      throw Error("Record exceeds 512 KB");
    if (input.kind === "asset" && !input.id && typeof input.data.assetId === "string") {
      const same = this.rows.find(
        (r) =>
          r.kind === "asset" &&
          r.data.assetId === input.data.assetId &&
          JSON.stringify(r.binding) === JSON.stringify(binding),
      );
      if (same) return structuredClone(same);
    }
    const old = input.id ? this.get(input.id) : null;
    if (
      old &&
      (input.revision !== old.revision || JSON.stringify(old.binding) !== JSON.stringify(binding))
    )
      throw Error("Revision/project conflict; reload before saving");
    if (old && old.kind !== input.kind) throw Error("Record kind cannot change");
    if (!old && this.rows.length >= 300) throw Error("Workspace record limit reached");
    const now = new Date().toISOString();
    const r: WorkspaceRecord = {
      id: old?.id ?? "ws_" + crypto.randomBytes(10).toString("hex"),
      kind: input.kind,
      name: input.name.trim(),
      binding: old?.binding ?? binding,
      revision: (old?.revision ?? 0) + 1,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
      data: structuredClone(input.data),
    };
    this.persist([...this.rows.filter((x) => x.id !== r.id), r]);
    return structuredClone(r);
  }
  remove(id: string, revision: number) {
    const r = this.get(id);
    if (r.revision !== revision) throw Error("Revision conflict");
    this.persist(this.rows.filter((r) => r.id !== id));
  }
}
export function graphImpact(graph: any, target: string) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const related = new Set([target]);
  for (let i = 0; i < 3; i++)
    for (const e of edges)
      if (e.kind !== "contains" && (related.has(e.to) || related.has(e.from))) {
        related.add(e.from);
        related.add(e.to);
      }
  return {
    target,
    nodes: nodes.filter((n: any) => related.has(n.path)),
    edges: edges.filter((e: any) => related.has(e.from) && related.has(e.to)),
    observedAt: graph?.observedAt,
    partial: !!graph?.truncated,
    note: "Static references and hierarchy only; dynamic require/remote names may be missed. Re-scan before changes.",
  };
}
