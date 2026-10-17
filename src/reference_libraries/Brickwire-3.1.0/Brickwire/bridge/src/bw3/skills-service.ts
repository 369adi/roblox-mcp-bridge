/**
 * Brickwire 3.0 Skill service: registry state, validation against the live tool registry,
 * automatic routing (selection → dependency resolution → conflict checks → ordering) and
 * full-content context composition for the agent. Selection is NOT a permission grant.
 */
import fs from "node:fs";
import path from "node:path";
import { loadPack, readPackFile, type LoadedPack, type PackSkill } from "./skill-packs.js";

export interface ToolLike { name: string; available?: boolean }
export type SkillRole = "primary" | "supporting" | "dependency" | "manual" | "meta";
export interface SelectedSkill { id: string; title: string; role: SkillRole; score: number; matched: string[]; reason: string; missingTools: string[] }
export interface SkillSelection {
  id: string;
  at: string;
  query: string;
  auto: boolean;
  superMode: boolean;
  selected: SelectedSkill[];
  rejected: Array<{ id: string; reason: string }>;
  warnings: string[];
  order: string[];
  intent: { kind: string; label: string };
}
interface State {
  version: 1;
  autoSelect: boolean;
  disabled: string[]; // curated bw50 Skills disabled by the user
  enabledUser: string[]; // user packs explicitly enabled
  pinned: string[];
  accepted: Record<string, string>; // id → sha256 accepted at registration
  usage: Array<{ skillId: string; selectionId: string; taskId?: string; role: SkillRole; at: string }>;
}
const fail = (m: string, status = 400): never => { throw Object.assign(new Error(m), { status }); };
const tokensOf = (s: string) => (s.toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) ?? []);
function matchTrigger(tokens: string[], trig: string) {
  const words = tokensOf(trig);
  if (!words.length) return false;
  const one = (tok: string, w: string) => (w.length <= 3 ? tok === w : tok.startsWith(w));
  for (let i = 0; i + words.length <= tokens.length; i++) if (words.every((w, k) => one(tokens[i + k], w))) return true;
  return false;
}
/** Coarse intent used by the orchestrator; derived from the same routing evidence the user can inspect. */
export function classifyIntent(text: string, selectedIds: string[]) {
  const t = tokensOf(text);
  const verb = t.some((x) => /^(созда|сдела|сгенер|смодел|построй|нарисуй|generat|creat|make|model|build|design)/.test(x));
  const asset = selectedIds.some((id) => /^bw50\.(05|36|07|04)-/.test(id));
  const file = t.some((x) => /^(obj|mtl|файл|file|скача|download|export|экспорт)/.test(x));
  if (asset && (verb || file)) return { kind: "asset3d", label: "3D asset generation" };
  if (selectedIds.some((id) => /^bw50\.09-/.test(id))) return { kind: "debug", label: "Debugging" };
  if (selectedIds.some((id) => /^bw50\.(39|45|33|34)-/.test(id))) return { kind: "review", label: "Inspection / review" };
  return { kind: "studio", label: "Studio development" };
}
export class SkillService {
  packs: LoadedPack[] = [];
  private file: string;
  private state: State = { version: 1, autoSelect: true, disabled: [], enabledUser: [], pinned: [], accepted: {}, usage: [] };
  loadError: string | null = null;
  constructor(private dataDir: string, builtinPacksDir: string) {
    this.file = path.join(dataDir, "skills-v3.json");
    const curated = path.join(builtinPacksDir, "brickwire-50");
    if (fs.existsSync(curated)) this.packs.push(loadPack(curated, "brickwire-50", { curated: true }));
    // User-extensible training packs: data/skill-packs/<pack>/NN-slug/SKILL.md (disabled until enabled)
    const userRoot = path.join(dataDir, "skill-packs");
    if (fs.existsSync(userRoot))
      for (const d of fs.readdirSync(userRoot).filter((d) => /^[a-z0-9-]{1,40}$/.test(d)).sort())
        this.packs.push(loadPack(path.join(userRoot, d), d, { userPack: true }));
    if (fs.existsSync(this.file)) {
      try {
        const s = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (s.version !== 1 || !Array.isArray(s.disabled) || !Array.isArray(s.usage)) throw Error("invalid");
        this.state = { ...this.state, ...s };
      } catch { this.loadError = "skills-v3.json is corrupt; the file was preserved. Skill state changes are blocked until it is restored."; }
    }
    // Register first-seen Skills: record the accepted digest (version/integrity tracking).
    let changed = false;
    for (const s of this.all()) if (!this.state.accepted[s.id] && s.validation.ok) { this.state.accepted[s.id] = s.sha256; changed = true; }
    if (changed && !this.loadError) this.save();
  }
  private save() {
    if (this.loadError) fail(this.loadError, 409);
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.file + ".tmp", JSON.stringify(this.state, null, 1), { mode: 0o600 });
    fs.renameSync(this.file + ".tmp", this.file);
  }
  all(): PackSkill[] { return this.packs.flatMap((p) => p.skills); }
  has(id: string) { return this.all().some((s) => s.id === id); }
  get(id: string) { const s = this.all().find((s) => s.id === id); if (!s) fail("Skill not found", 404); return s!; }
  pack(id: string) { return this.packs.find((p) => p.skills.some((s) => s.id === id))!; }
  get autoSelect() { return this.state.autoSelect; }
  eligible(s: PackSkill) {
    if (!s.validation.ok) return false;
    if (this.state.accepted[s.id] && this.state.accepted[s.id] !== s.sha256) return false; // changed on disk: re-accept first
    return this.pack(s.id).userPack ? this.state.enabledUser.includes(s.id) : !this.state.disabled.includes(s.id);
  }
  status(s: PackSkill, tools: ToolLike[]) {
    const missingTools = s.tools.filter((n) => !tools.some((t) => t.name === n && t.available !== false));
    const unknownTools = s.tools.filter((n) => !tools.some((t) => t.name === n));
    const outdated = !!this.state.accepted[s.id] && this.state.accepted[s.id] !== s.sha256;
    const uses = this.state.usage.filter((u) => u.skillId === s.id);
    return {
      enabled: this.eligible(s), missingTools, unknownTools, outdated,
      compatibility: !s.validation.ok ? "invalid" : outdated ? "outdated" : missingTools.length ? (missingTools.length === s.tools.length && s.tools.length ? "blocked" : "partial") : "ready",
      usageCount: uses.length, lastUsed: uses.at(-1)?.at ?? null,
    };
  }
  list(tools: ToolLike[]) {
    return this.all().map((s) => ({
      id: s.id, number: s.number, title: s.title, name: s.name, description: s.description, category: s.category, version: s.version, pack: s.pack,
      scope: s.scope, activateWhen: s.activateWhen, triggers: s.triggers, tools: s.tools, dependencies: s.dependencies, conflicts: s.conflicts,
      references: s.references, templates: s.templates, successCriteria: s.successCriteria, limitations: s.limitations, meta: s.meta,
      sha256: s.sha256, validation: s.validation, pinned: this.state.pinned.includes(s.id), userPack: this.pack(s.id).userPack, ...this.status(s, tools),
    }));
  }
  settings() { return { autoSelect: this.state.autoSelect, pinned: this.state.pinned, disabled: this.state.disabled, loadError: this.loadError, packErrors: this.packs.flatMap((p) => p.errors) }; }
  setAuto(v: boolean) { if (typeof v !== "boolean") fail("autoSelect must be boolean"); this.state.autoSelect = v; this.save(); }
  setEnabled(id: string, enabled: boolean) {
    const s = this.get(id);
    if (typeof enabled !== "boolean") fail("enabled must be boolean");
    if (enabled && !s.validation.ok) fail("Invalid Skill cannot be enabled: " + s.validation.errors.join("; "), 409);
    if (this.pack(id).userPack) this.state.enabledUser = [...this.state.enabledUser.filter((x) => x !== id), ...(enabled ? [id] : [])];
    else this.state.disabled = [...this.state.disabled.filter((x) => x !== id), ...(enabled ? [] : [id])];
    this.save();
  }
  setPinned(id: string, pinned: boolean) { this.get(id); this.state.pinned = [...this.state.pinned.filter((x) => x !== id), ...(pinned ? [id] : [])]; this.save(); }
  accept(id: string) { const s = this.get(id); if (!s.validation.ok) fail("Invalid Skill", 409); this.state.accepted[id] = s.sha256; this.save(); }
  history(id?: string) { return this.state.usage.filter((u) => !id || u.skillId === id).slice(-200).reverse(); }

  route(text: string, opts: { tools: ToolLike[]; superMode?: boolean; manual?: string[]; exclude?: string[]; auto?: boolean }): SkillSelection {
    const tokens = tokensOf(text);
    const auto = opts.auto ?? this.state.autoSelect;
    const exclude = new Set(opts.exclude ?? []);
    const all = this.all();
    const byId = new Map(all.map((s) => [s.id, s]));
    const rejected: SkillSelection["rejected"] = [], warnings: string[] = [];
    const picked = new Map<string, SelectedSkill>();
    const add = (s: PackSkill, role: SkillRole, score: number, matched: string[], reason: string) => {
      if (picked.has(s.id) || exclude.has(s.id)) return;
      picked.set(s.id, { id: s.id, title: s.title, role, score, matched, reason, missingTools: this.status(s, opts.tools).missingTools });
    };
    for (const id of [...this.state.pinned, ...(opts.manual ?? [])]) {
      const s = byId.get(id);
      if (!s) { warnings.push(`Unknown manual Skill ${id}`); continue; }
      if (!this.eligible(s)) { rejected.push({ id, reason: "Manually requested but disabled/invalid/outdated" }); continue; }
      add(s, "manual", 0, [], "Enabled manually by the user");
    }
    if (auto) {
      const scored = all.filter((s) => !s.meta && s.triggers.length).map((s) => {
        const matched = s.triggers.filter((t) => matchTrigger(tokens, t));
        const score = matched.reduce((a, t) => a + (tokensOf(t).length > 1 ? 3 : t.length >= 4 ? 2 : 1.5), 0);
        return { s, matched, score };
      }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score || a.s.number - b.s.number);
      const top = scored[0]?.score ?? 0;
      let primary: PackSkill | null = null, supporting = 0;
      for (const c of scored) {
        if (exclude.has(c.s.id)) { rejected.push({ id: c.s.id, reason: "Excluded by the user for this request" }); continue; }
        if (!this.eligible(c.s)) { rejected.push({ id: c.s.id, reason: "Matched, but disabled, invalid or changed on disk" }); continue; }
        if (!primary) { primary = c.s; add(c.s, "primary", c.score, c.matched, `Best trigger match (${c.matched.join(", ")})`); continue; }
        if (primary.conflicts.includes(c.s.id) || c.s.conflicts.includes(primary.id)) { rejected.push({ id: c.s.id, reason: `Conflicts with primary ${primary.id}` }); continue; }
        if (supporting >= (opts.superMode ? 4 : 3) || c.score < Math.max(2, top * 0.4)) { rejected.push({ id: c.s.id, reason: `Lower relevance (${c.score} vs ${top})` }); continue; }
        supporting++;
        add(c.s, "supporting", c.score, c.matched, `Also relevant (${c.matched.join(", ")})`);
      }
      const multi = opts.superMode || text.length > 280 || supporting >= 2;
      const meta = (n: number, why: string) => { const s = all.find((x) => x.pack === "brickwire-50" && x.number === n); if (s && this.eligible(s)) add(s, "meta", 0, [], why); };
      if (picked.size) meta(46, "Router record: selection explained and bounded");
      if (multi) { meta(47, opts.superMode ? "Super Intelligence Mode: staged autopilot workflow" : "Multi-part request: staged workflow"); meta(49, "Live progress and Development Tree reporting"); }
      if ([...picked.keys()].some((id) => /^bw50\.(05|36)-/.test(id))) meta(48, "3D artifact will be previewed in chat");
    }
    // Dependencies (transitive), before dependants
    const queue = [...picked.keys()];
    while (queue.length) {
      const s = byId.get(queue.shift()!)!;
      for (const d of s.dependencies) {
        const dep = byId.get(d);
        if (!dep) { warnings.push(`${s.id}: missing dependency ${d}`); continue; }
        if (picked.has(d)) continue;
        if (!this.eligible(dep)) { warnings.push(`${s.id} depends on disabled ${d}; its guidance is not loaded`); continue; }
        add(dep, "dependency", 0, [], `Required by ${s.id}`);
        queue.push(d);
      }
    }
    // Topological order: router meta, dependencies before dependants, then the rest.
    const order: string[] = [];
    const seen = new Set<string>();
    const visit = (id: string) => { if (seen.has(id) || !picked.has(id)) return; seen.add(id); for (const d of byId.get(id)!.dependencies) visit(d); order.push(id); };
    const rank: Record<SkillRole, number> = { meta: 0, manual: 1, dependency: 2, primary: 3, supporting: 4 };
    const ids = [...picked.keys()].sort((a, b) => (a.endsWith("skill-router") ? -1 : b.endsWith("skill-router") ? 1 : rank[picked.get(a)!.role] - rank[picked.get(b)!.role]));
    for (const id of ids) visit(id);
    const selected = order.map((id) => picked.get(id)!);
    if (!selected.some((s) => s.role === "primary" || s.role === "manual")) warnings.push(auto ? "No Skill matched this request strongly enough; the agent works with base instructions only." : "Automatic selection is off and no Skill is pinned.");
    for (const s of selected) if (s.missingTools.length) warnings.push(`${s.id}: tools unavailable now: ${s.missingTools.join(", ")}`);
    return { id: "sel_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), at: new Date().toISOString(), query: text.slice(0, 500), auto, superMode: !!opts.superMode, selected, rejected: rejected.slice(0, 20), warnings, order, intent: classifyIntent(text, order) };
  }
  recordUsage(sel: SkillSelection, taskId?: string) {
    if (this.loadError) return;
    for (const s of sel.selected) this.state.usage.push({ skillId: s.id, selectionId: sel.id, taskId, role: s.role, at: sel.at });
    this.state.usage = this.state.usage.slice(-2000);
    this.save();
  }
  /** Full instructions of the selected Skills (not just names), bounded by a character budget. */
  compose(sel: SkillSelection, budget = 30000) {
    const loaded: Array<{ id: string; chars: number; full: boolean; files: string[] }> = [];
    const curated = this.packs.find((p) => p.id === "brickwire-50");
    const global = curated?.shared.find((f) => f.rel.endsWith("GLOBAL_RULES.md"));
    let out = "\nBRICKWIRE SKILLS (auto-selected training guides; instructions only, NOT permission grants — every tool call still follows the registry, approvals and project binding).\n";
    if (global && curated) out += "\n### _shared/GLOBAL_RULES.md\n" + readPackFile(curated, global.rel, global.sha256) + "\n";
    for (const item of sel.selected) {
      const s = this.get(item.id), pack = this.pack(item.id);
      const header = `\n### Skill ${s.id} (${item.role}; v${s.version}) — ${s.title}\nWhy: ${item.reason}${item.missingTools.length ? `\nUnavailable tools right now: ${item.missingTools.join(", ")} — report blockers instead of inventing alternatives.` : ""}\n`;
      let body = s.instructions;
      const files: string[] = [`${s.number.toString().padStart(2, "0")}-${s.slug}/SKILL.md`];
      if (item.role === "primary" || item.role === "manual")
        for (const r of s.references) { const t = readPackFile(pack, r.rel, r.sha256); if (out.length + body.length + t.length < budget * 0.8) { body += `\n\n#### Reference ${r.rel}\n${t}`; files.push(r.rel); } }
      const idx = [...s.references, ...s.templates].filter((f) => !files.includes(f.rel)).map((f) => `${f.rel} (${f.kind}, ${f.bytes} B)`);
      if (idx.length) body += `\n\nMore files (read with skill_resource {skillId:"${s.id}", resourceId:"<path>"} only when needed): ${idx.join("; ")}`;
      let full = true;
      if (out.length + header.length + body.length > budget) {
        full = false;
        body = body.slice(0, Math.max(800, budget - out.length - header.length - 200)) + `\n[truncated by budget — call skill_read {id:"${s.id}"} for the full guide]`;
      }
      out += header + body + "\n";
      loaded.push({ id: s.id, chars: body.length, full, files });
      if (out.length >= budget) break;
    }
    return { text: out, loaded, chars: out.length };
  }
  readForAgent(id: string) {
    const s = this.get(id);
    if (!this.eligible(s)) fail("Skill disabled, invalid or changed on disk: only enabled Skills are readable by the agent", 403);
    return { id: s.id, title: s.title, version: s.version, instructions: s.instructions, references: s.references, templates: s.templates, tools: s.tools, dependencies: s.dependencies, successCriteria: s.successCriteria, executable: false, untrustedReferenceContent: true };
  }
  resourceForAgent(id: string, rel: string, offset = 0, limit = 16000) {
    const s = this.get(id);
    if (!this.eligible(s)) fail("Skill disabled", 403);
    const f = [...s.references, ...s.templates, ...this.pack(id).shared].find((f) => f.rel === rel || f.rel.endsWith("/" + rel));
    if (!f) fail("File not linked to this Skill", 403);
    const text = readPackFile(this.pack(id), f!.rel, f!.sha256);
    const end = Math.min(text.length, offset + Math.min(24000, Math.max(1, limit)));
    return { skillId: id, file: f!.rel, text: text.slice(offset, end), offset, nextOffset: end < text.length ? end : null, totalChars: text.length, untrusted: true, executable: false };
  }
}
