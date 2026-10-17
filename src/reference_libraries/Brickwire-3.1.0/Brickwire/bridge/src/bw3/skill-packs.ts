/**
 * Directory-based Skill packs (Brickwire 3.0). A pack is a folder of `NN-slug/SKILL.md` files with
 * YAML-like frontmatter (name, description, category, version) plus optional references/ and templates/.
 * Files are read byte-for-byte and integrity-hashed; nothing in a pack is executed.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SKILL_META_50, type SkillMeta } from "./skill-meta-50.js";

export interface PackFile { rel: string; kind: "skill" | "reference" | "template" | "shared"; sha256: string; bytes: number }
export interface PackSkill {
  id: string; // stable: bw50.NN-slug or pack.<pack>.<slug>
  number: number;
  slug: string;
  name: string;
  title: string;
  description: string;
  category: string;
  version: string;
  pack: string;
  activateWhen: string;
  scope: string;
  instructions: string; // full SKILL.md body
  triggers: string[];
  tools: string[];
  dependencies: string[];
  conflicts: string[];
  references: PackFile[];
  templates: PackFile[];
  limitations: string[];
  successCriteria: string[];
  outputContract: string;
  meta: boolean;
  sha256: string;
  validation: { ok: boolean; errors: string[]; warnings: string[] };
}
export interface LoadedPack { id: string; root: string; skills: PackSkill[]; shared: PackFile[]; errors: string[]; userPack: boolean }

const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
function frontmatter(src: string) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const fields: Record<string, string> = {};
  if (m) for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { fields, body: m ? src.slice(m[0].length) : src, has: !!m };
}
function section(body: string, title: string) {
  const re = new RegExp(`^##\\s+${title}[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "mi");
  const m = body.match(re);
  return m ? m[1].trim() : "";
}
function listFiles(dir: string, kind: PackFile["kind"], root: string): PackFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((n) => /\.(md|txt|lua|luau|json)$/i.test(n)).sort().map((n) => {
    const full = path.join(dir, n), b = fs.readFileSync(full);
    return { rel: path.relative(root, full).split(path.sep).join("/"), kind, sha256: sha(b), bytes: b.length };
  });
}
/** Generic trigger stems for user packs without curated metadata. */
function derivedTriggers(name: string, activate: string, category: string) {
  const words = `${name} ${activate} ${category}`.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const stop = new Set(["when", "with", "that", "this", "from", "into", "creating", "modifying", "roblox", "existing", "или", "для", "когда"]);
  return [...new Set(words.filter((w) => !stop.has(w)).map((w) => w.slice(0, Math.max(4, w.length - 2))))].slice(0, 24);
}
export function loadPack(root: string, packId: string, opts: { curated?: boolean; userPack?: boolean } = {}): LoadedPack {
  const errors: string[] = [];
  const shared = listFiles(path.join(root, "_shared"), "shared", root);
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^\d{2}-[a-z0-9-]+$/.test(d) && fs.existsSync(path.join(root, d, "SKILL.md"))).sort() : [];
  const meta = new Map<number, SkillMeta>(opts.curated ? SKILL_META_50.map((m) => [m.n, m]) : []);
  const idFor = (n: number, slug: string) => (opts.curated ? `bw50.${String(n).padStart(2, "0")}-${slug}` : `pack.${packId}.${slug}`);
  const bySlugNumber = new Map(dirs.map((d) => [Number(d.slice(0, 2)), d.slice(3)]));
  const skills: PackSkill[] = [];
  for (const d of dirs) {
    const n = Number(d.slice(0, 2)), slug = d.slice(3);
    const file = path.join(root, d, "SKILL.md"), raw = fs.readFileSync(file);
    const src = raw.toString("utf8");
    const { fields, body, has } = frontmatter(src);
    const v: PackSkill["validation"] = { ok: true, errors: [], warnings: [] };
    if (!has) v.errors.push("Missing frontmatter");
    for (const k of ["name", "description", "version"]) if (!fields[k]) v.errors.push(`Missing frontmatter field: ${k}`);
    if (fields.name && fields.name !== slug) v.warnings.push(`Frontmatter name "${fields.name}" differs from folder "${slug}"`);
    if (!/^\d+\.\d+\.\d+/.test(fields.version ?? "")) v.warnings.push("Version is not semver");
    const title = (body.match(/^#\s+(?:Skill:\s*)?(.+)$/m)?.[1] ?? fields.name ?? slug).trim();
    const activateWhen = section(body, "Activate when");
    const checklist = section(body, "Acceptance checklist").split(/\r?\n/).map((l) => l.replace(/^- \[[ x]\]\s*/, "").trim()).filter(Boolean);
    const rules = section(body, "Rules specific to this Skill").split(/\r?\n/).map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean);
    if (!activateWhen) v.warnings.push("No 'Activate when' section");
    if (!section(body, "Workflow")) v.errors.push("No 'Workflow' section");
    // Links to sibling files must resolve inside the pack (no path escape).
    for (const link of body.matchAll(/\]\(([^)#]+)\)/g)) {
      const target = path.resolve(path.join(root, d), link[1]);
      if (/^[a-z]+:/i.test(link[1])) continue;
      if (!target.startsWith(path.resolve(root) + path.sep)) {
        // Supplied package links "../../_shared/X" from NN-slug/SKILL.md (one level too high).
        const shared = link[1].match(/^(?:\.\.\/)+(_shared\/[A-Za-z0-9_.-]+)$/);
        if (shared && fs.existsSync(path.join(root, shared[1]))) v.warnings.push(`Link ${link[1]} points above the pack; resolved to pack ${shared[1]}`);
        else v.errors.push(`Link escapes pack: ${link[1]}`);
      }
      else if (!fs.existsSync(target)) v.warnings.push(`Broken link: ${link[1]}`);
    }
    if (/\b(rm -rf|curl\s+[^|]+\|\s*(sh|bash)|Invoke-Expression)\b/i.test(src)) v.warnings.push("Contains shell commands; they are reference text only and never executed");
    const m = meta.get(n);
    if (opts.curated && !m) v.errors.push("No Brickwire adaptation metadata");
    const deps = (m?.deps ?? []).map((x) => { const s = bySlugNumber.get(x); if (!s) v.errors.push(`Missing dependency ${x}`); return idFor(x, s ?? "missing"); });
    const conflicts = (m?.conflicts ?? []).map((x) => idFor(x, bySlugNumber.get(x) ?? "missing"));
    v.ok = v.errors.length === 0;
    skills.push({
      id: idFor(n, slug), number: n, slug, name: fields.name ?? slug, title, description: fields.description ?? "", category: fields.category ?? "Custom",
      version: fields.version ?? "0.0.0", pack: packId, activateWhen, scope: m?.scope ?? activateWhen, instructions: body.trim(),
      triggers: m ? m.triggers : derivedTriggers(title, activateWhen, fields.category ?? ""), tools: m?.tools ?? [], dependencies: deps, conflicts,
      references: listFiles(path.join(root, d, "references"), "reference", root), templates: listFiles(path.join(root, d, "templates"), "template", root),
      limitations: rules, successCriteria: checklist, outputContract: section(body, "Output contract"), meta: !!m?.meta, sha256: sha(raw), validation: v,
    });
  }
  const ids = new Set<string>();
  for (const s of skills) { if (ids.has(s.id)) errors.push(`Duplicate Skill id ${s.id}`); ids.add(s.id); }
  // Dependency cycle check
  const byId = new Map(skills.map((s) => [s.id, s]));
  const visit = (id: string, stack: string[]): void => {
    if (stack.includes(id)) { errors.push(`Dependency cycle: ${[...stack, id].join(" → ")}`); return; }
    for (const d of byId.get(id)?.dependencies ?? []) visit(d, [...stack, id]);
  };
  for (const s of skills) visit(s.id, []);
  return { id: packId, root, skills, shared, errors, userPack: !!opts.userPack };
}
export function readPackFile(pack: LoadedPack, rel: string, expectedSha?: string) {
  if (!/^[A-Za-z0-9_./-]+$/.test(rel) || rel.includes("..")) throw Object.assign(Error("Invalid pack path"), { status: 400 });
  const full = path.resolve(pack.root, rel);
  if (!full.startsWith(path.resolve(pack.root) + path.sep)) throw Object.assign(Error("Path escapes pack"), { status: 403 });
  const b = fs.readFileSync(full);
  if (expectedSha && sha(b) !== expectedSha) throw Object.assign(Error("Pack file integrity check failed"), { status: 409 });
  return b.toString("utf8");
}
