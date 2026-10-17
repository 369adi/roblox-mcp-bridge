/**
 * Brickwire 3.0 artifact store + 3D generation pipeline.
 * Every artifact lives in <dataDir>/artifacts-v1/<id>/ with the real files that were written and verified.
 * The pipeline emits only stages that actually happen; there is no simulated percentage.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { interpret, buildModel, type ForgeSpec } from "./asset-forge.js";
import { validateModel, writeObjMtl, parseObj, parseMtl, renderPng, type Validation } from "./mesh-kit.js";

export interface ArtifactFile { name: string; bytes: number; sha256: string; mime: string }
export interface ArtifactRecord {
  id: string; version: 1; kind: "model3d"; name: string; request: string; spec: ForgeSpec;
  assumptions: string[]; createdAt: string; runId?: string; conversationId?: string; parentId?: string;
  stats: { vertices: number; triangles: number; parts: number; materials: number; size: [number, number, number] };
  validation: Pick<Validation, "ok" | "errors" | "warnings" | "fixes"> & { closedParts: number; openParts: string[] };
  inspection: { reparsedFaces: number; reparsedVertices: number; objErrors: string[]; materialsResolved: boolean; thumbnailCoverage: number };
  files: ArtifactFile[]; verified: boolean; library: boolean; tags: string[];
  studio?: { importedAt: string; path?: string; persistent: false; operation?: string }[];
  /** "forge" (generated here) or an external tool the model came from; external models cannot be regenerated. */
  source?: "forge" | "blender" | "figma"; sourceFiles?: string[];
}
export type StageEmitter = (stage: string, title: string, detail?: string, data?: unknown) => void;
const MIME: Record<string, string> = { obj: "text/plain; charset=utf-8", mtl: "text/plain; charset=utf-8", png: "image/png", json: "application/json; charset=utf-8" };
const sha = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");

export class ArtifactStore {
  readonly dir: string;
  private rows = new Map<string, ArtifactRecord>();
  loadErrors: string[] = [];
  constructor(dataDir: string) {
    this.dir = path.join(dataDir, "artifacts-v1");
    fs.mkdirSync(this.dir, { recursive: true });
    for (const id of fs.readdirSync(this.dir).filter((n) => /^art_[a-f0-9]{16}$/.test(n))) {
      try {
        const r = JSON.parse(fs.readFileSync(path.join(this.dir, id, "record.json"), "utf8")) as ArtifactRecord;
        if (r.id !== id || r.version !== 1) throw Error("invalid");
        // Integrity: a record whose files were modified/removed is not reported as verified.
        for (const f of r.files) { const p = path.join(this.dir, id, f.name); if (!fs.existsSync(p) || sha(fs.readFileSync(p)) !== f.sha256) { r.verified = false; r.validation.warnings = [...new Set([...(r.validation.warnings ?? []), `File ${f.name} changed or missing on disk since generation`])]; } }
        this.rows.set(id, r);
      } catch { this.loadErrors.push(id); }
    }
  }
  list(filter: { conversationId?: string; library?: boolean } = {}) {
    return [...this.rows.values()].filter((r) => (!filter.conversationId || r.conversationId === filter.conversationId) && (filter.library === undefined || r.library === filter.library)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  get(id: string) { const r = this.rows.get(String(id)); if (!r) throw Object.assign(new Error("Artifact not found"), { status: 404 }); return r; }
  file(id: string, name: string) {
    const r = this.get(id), f = r.files.find((x) => x.name === name);
    if (!f) throw Object.assign(new Error("File not found"), { status: 404 });
    return { data: fs.readFileSync(path.join(this.dir, r.id, f.name)), mime: f.mime, name: f.name };
  }
  update(id: string, patch: Partial<Pick<ArtifactRecord, "library" | "tags" | "name" | "studio">>) {
    const r = this.get(id);
    if (patch.library !== undefined) r.library = !!patch.library;
    if (patch.tags) r.tags = patch.tags.map((t) => String(t).slice(0, 40)).slice(0, 20);
    if (patch.name) r.name = String(patch.name).slice(0, 120);
    if (patch.studio) r.studio = patch.studio;
    this.save(r); return r;
  }
  assign(id: string, conversationId: string) { const r = this.get(id); r.conversationId = conversationId; this.save(r); return r; }
  private save(r: ArtifactRecord) { const f = path.join(this.dir, r.id, "record.json"); fs.writeFileSync(f + ".tmp", JSON.stringify(r, null, 1)); fs.renameSync(f + ".tmp", f); }

  /** Full pipeline: interpret → generate → validate (→ fix) → export → re-inspect written files → thumbnail → register. */
  forge(request: string, opts: { override?: Partial<ForgeSpec>; runId?: string; conversationId?: string; parentId?: string; extraVerificationPasses?: number; signal?: AbortSignal } = {}, emit: StageEmitter = () => undefined): { ok: true; artifact: ArtifactRecord } | { ok: false; reason: string; stage: string } {
    const abort = () => { if (opts.signal?.aborted) throw Object.assign(new Error("Cancelled by user"), { cancelled: true }); };
    emit("ANALYZING", "Interpreting the object request", request.slice(0, 200));
    const it = interpret(request, opts.override ?? {});
    if (!it.ok || !it.spec) return { ok: false, reason: it.reason ?? "Unsupported request", stage: "ANALYZING" };
    const spec = it.spec;
    emit("ANALYZING", `Recipe ${spec.recipe}${spec.variant && spec.variant !== "default" ? " / " + spec.variant : ""}`, `detail ${spec.detail}, target size ${spec.size} studs, seed ${spec.seed}`, { spec, assumptions: it.assumptions, matched: it.matched });
    abort();
    let model = null as ReturnType<typeof buildModel> | null, v = null as Validation | null;
    for (let attempt = 0; attempt < 3; attempt++) {
      emit("GENERATING", attempt ? `Regenerating geometry (attempt ${attempt + 1})` : "Generating geometry", `${spec.recipe} with procedural parts`);
      const t0 = Date.now();
      model = buildModel(spec);
      const tris = model.parts.reduce((a, p) => a + p.tris.length, 0);
      emit("GENERATING", `Built ${model.parts.length} parts, ${tris} triangles`, `${Date.now() - t0} ms`);
      abort();
      emit("VALIDATING", "Validating mesh topology", "finite vertices, index ranges, degenerate faces, watertightness, winding, budgets");
      v = validateModel(model, true);
      if (v.fixes.length) emit("FIXING", `Applied ${v.fixes.length} automatic fixes`, v.fixes.slice(0, 6).join("; "), { fixes: v.fixes });
      if (v.ok) break;
      emit("FIXING", "Validation failed — adjusting parameters", v.errors.slice(0, 4).join("; "), { errors: v.errors });
      // Real fix strategy: reduce detail (triangle budget) and re-seed to avoid degenerate configurations.
      spec.detail = Math.max(1, spec.detail - 1) as 1 | 2 | 3; spec.seed = (spec.seed * 16807) % 2147483647 || 7;
    }
    if (!model || !v || !v.ok) return { ok: false, reason: `Validation failed after fixes: ${v?.errors.join("; ")}`, stage: "VALIDATING" };
    emit("VALIDATING", "Validation passed", `${v.vertices} vertices, ${v.triangles} triangles, ${v.parts.filter((p) => p.closed).length}/${v.parts.length} parts watertight`, { warnings: v.warnings });
    abort();
    const id = "art_" + crypto.randomBytes(8).toString("hex"), dir = path.join(this.dir, id);
    fs.mkdirSync(dir, { recursive: true });
    emit("EXPORTING", "Writing OBJ + MTL", `${dir}`);
    const { obj, mtl } = writeObjMtl(model, "model", [`Request: ${request.replace(/\s+/g, " ").slice(0, 160)}`, `Recipe: ${spec.recipe}/${spec.variant} seed ${spec.seed} detail ${spec.detail}`, `Artifact: ${id}`]);
    fs.writeFileSync(path.join(dir, "model.obj"), obj); fs.writeFileSync(path.join(dir, "model.mtl"), mtl);
    emit("EXPORTING", "Files written", `model.obj ${obj.length} bytes, model.mtl ${mtl.length} bytes`);
    // Inspect the files that are on disk, not the in-memory model.
    emit("INSPECTING", "Re-reading the written OBJ/MTL", "independent parser");
    const passes = 1 + Math.max(0, Math.min(3, opts.extraVerificationPasses ?? 0));
    let parsed = parseObj(fs.readFileSync(path.join(dir, "model.obj"), "utf8")), mats = parseMtl(fs.readFileSync(path.join(dir, "model.mtl"), "utf8"));
    const problems: string[] = [];
    for (let pass = 1; pass <= passes; pass++) {
      if (pass > 1) { parsed = parseObj(fs.readFileSync(path.join(dir, "model.obj"), "utf8")); mats = parseMtl(fs.readFileSync(path.join(dir, "model.mtl"), "utf8")); }
      const checks: string[] = [];
      if (parsed.errors.length) checks.push(`OBJ errors: ${parsed.errors.slice(0, 3).join(", ")}`);
      if (parsed.faces !== v.triangles) checks.push(`face count ${parsed.faces} ≠ ${v.triangles}`);
      if (parsed.vertices !== v.vertices) checks.push(`vertex count ${parsed.vertices} ≠ ${v.vertices}`);
      if (parsed.mtllib !== "model.mtl") checks.push("mtllib reference missing");
      const missingMats = parsed.materials.filter((m) => !mats.some((x) => x.name === m));
      if (missingMats.length) checks.push(`materials missing from MTL: ${missingMats.join(", ")}`);
      if (pass > 1) { // extra Super-mode pass: per-face geometric sanity on the file
        let bad = 0; for (const f of parsed.faceList) { const [a, b, c] = f.v.map((i) => parsed.positions[i]); const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; const cr = Math.hypot(ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]); if (!(cr > 1e-10)) bad++; }
        if (bad) checks.push(`${bad} zero-area faces in file`);
      }
      emit("INSPECTING", `Verification pass ${pass}/${passes}: ${checks.length ? "issues found" : "passed"}`, checks.join("; ") || `${parsed.faces} faces, ${parsed.vertices} vertices, ${parsed.materials.length} materials resolved`);
      problems.push(...checks);
    }
    if (problems.length) return { ok: false, reason: `Written file failed inspection: ${problems.join("; ")}`, stage: "INSPECTING" };
    abort();
    emit("PREVIEW", "Rendering thumbnail from the written OBJ", "software z-buffer renderer");
    const thumb = renderPng(parsed, mats, { width: 512, height: 384 });
    fs.writeFileSync(path.join(dir, "thumb.png"), thumb.png);
    if (thumb.coverage < 0.005) return { ok: false, reason: "Thumbnail is empty — geometry not visible", stage: "PREVIEW" };
    emit("PREVIEW", "Preview ready", `coverage ${(thumb.coverage * 100).toFixed(1)}% of frame`);
    const files: ArtifactFile[] = ["model.obj", "model.mtl", "thumb.png"].map((n) => { const b = fs.readFileSync(path.join(dir, n)); return { name: n, bytes: b.length, sha256: sha(b), mime: MIME[n.split(".").pop()!] }; });
    const rec: ArtifactRecord = {
      id, version: 1, kind: "model3d", name: spec.name, request: request.slice(0, 2000), spec, assumptions: it.assumptions, createdAt: new Date().toISOString(),
      runId: opts.runId, conversationId: opts.conversationId, parentId: opts.parentId,
      stats: { vertices: v.vertices, triangles: v.triangles, parts: v.parts.length, materials: v.materials.length, size: v.bounds.size.map((x) => Math.round(x * 100) / 100) as [number, number, number] },
      validation: { ok: v.ok, errors: v.errors, warnings: v.warnings, fixes: v.fixes, closedParts: v.parts.filter((p) => p.closed).length, openParts: v.parts.filter((p) => !p.closed).map((p) => p.name) },
      inspection: { reparsedFaces: parsed.faces, reparsedVertices: parsed.vertices, objErrors: parsed.errors, materialsResolved: true, thumbnailCoverage: Math.round(thumb.coverage * 1000) / 1000 },
      files, verified: true, library: true, tags: [spec.recipe, spec.variant].filter(Boolean),
    };
    this.save(rec); this.rows.set(id, rec);
    emit("REGISTERED", "Registered in Asset Library", `${id} · ${files.map((f) => f.name).join(", ")}`, { artifactId: id });
    return { ok: true, artifact: rec };
  }
  /** Register an external model (Blender export etc.): OBJ re-parsed by the independent parser, thumbnail rendered from the file. */
  importModel(m: { name: string; obj: string; mtl?: string; source: "blender" | "figma"; request: string; fileIds?: string[]; conversationId?: string }) {
    const objText = String(m.obj ?? "").replace(/^mtllib\s+.*$/m, "mtllib model.mtl");
    if (objText.length > 60 * 1024 * 1024) throw Object.assign(new Error("OBJ is larger than 60 MB"), { status: 413 });
    const parsed = parseObj(objText);
    if (!parsed.faces) throw Object.assign(new Error(parsed.errors[0] ? `OBJ has no valid faces (${parsed.errors[0]})` : "OBJ has no faces (only meshes can be previewed)"), { status: 422 });
    let mtlText = String(m.mtl ?? "");
    const mats = parseMtl(mtlText);
    const missing = parsed.materials.filter((x) => !mats.some((y) => y.name === x));
    // materials without a diffuse colour get a neutral grey so the preview and Studio import stay valid
    if (missing.length) mtlText += "\n" + missing.map((x) => `newmtl ${x}\nKd 0.700000 0.700000 0.700000\n`).join("\n");
    const allMats = parseMtl(mtlText);
    const thumb = renderPng(parsed, allMats, { width: 512, height: 384 });
    const id = "art_" + crypto.randomBytes(8).toString("hex"), dir = path.join(this.dir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "model.obj"), objText); fs.writeFileSync(path.join(dir, "model.mtl"), mtlText); fs.writeFileSync(path.join(dir, "thumb.png"), thumb.png);
    const files: ArtifactFile[] = ["model.obj", "model.mtl", "thumb.png"].map((n) => { const b = fs.readFileSync(path.join(dir, n)); return { name: n, bytes: b.length, sha256: sha(b), mime: MIME[n.split(".").pop()!] }; });
    const size = [0, 1, 2].map((k) => Math.round((parsed.bounds.max[k] - parsed.bounds.min[k]) * 100) / 100) as [number, number, number];
    const name = String(m.name || "Model").replace(/[\r\n]+/g, " ").slice(0, 120);
    const warnings = [...(parsed.errors.length ? [`${parsed.errors.length} OBJ lines skipped (${parsed.errors[0]})`] : []), ...(missing.length ? [`materials without colour: ${missing.slice(0, 5).join(", ")}`] : []), ...(thumb.coverage < 0.005 ? ["thumbnail is almost empty"] : [])];
    const rec: ArtifactRecord = {
      id, version: 1, kind: "model3d", name, request: String(m.request ?? "").slice(0, 2000), spec: { recipe: m.source, variant: "import", name, size: Math.max(...size), detail: 2, seed: 1 } as unknown as ForgeSpec,
      assumptions: [], createdAt: new Date().toISOString(), conversationId: m.conversationId,
      stats: { vertices: parsed.vertices, triangles: parsed.faces, parts: Math.max(1, parsed.objects.length), materials: allMats.length, size },
      validation: { ok: true, errors: [], warnings, fixes: [], closedParts: 0, openParts: [] },
      inspection: { reparsedFaces: parsed.faces, reparsedVertices: parsed.vertices, objErrors: parsed.errors.slice(0, 10), materialsResolved: true, thumbnailCoverage: Math.round(thumb.coverage * 1000) / 1000 },
      files, verified: true, library: true, tags: [m.source, "import"], source: m.source, sourceFiles: (m.fileIds ?? []).slice(0, 20),
    };
    this.save(rec); this.rows.set(id, rec);
    return rec;
  }
  /** Roblox import payload: one mesh per material group, vertices de-indexed only by material. */
  importPayload(id: string) {
    const r = this.get(id);
    const parsed = parseObj(fs.readFileSync(path.join(this.dir, r.id, "model.obj"), "utf8"));
    const mats = parseMtl(fs.readFileSync(path.join(this.dir, r.id, "model.mtl"), "utf8"));
    const mtlText = fs.readFileSync(path.join(this.dir, r.id, "model.mtl"), "utf8");
    const groups = new Map<string, { v: number[][]; t: number[][]; map: Map<number, number> }>();
    for (const f of parsed.faceList) {
      const g = groups.get(f.m) ?? groups.set(f.m, { v: [], t: [], map: new Map() }).get(f.m)!;
      g.t.push(f.v.map((i) => { if (!g.map.has(i)) { g.map.set(i, g.v.length); g.v.push(parsed.positions[i].map((x) => Math.round(x * 1e4) / 1e4)); } return g.map.get(i)!; }));
    }
    return [...groups.entries()].map(([m, g]) => {
      const kd = mats.find((x) => x.name === m)?.kd ?? [0.6, 0.6, 0.6];
      const hint = mtlText.match(new RegExp(`newmtl ${m}[\\s\\S]*?# Roblox material suggestion: (\\w+)`))?.[1];
      return { material: m, color: "#" + kd.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join(""), robloxMaterial: hint ?? "SmoothPlastic", v: g.v, t: g.t };
    });
  }
}
