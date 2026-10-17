/**
 * Library updates: a signed-by-hash manifest on your server/CDN lists asset packs, kits and selector
 * configs. The bridge downloads what changed into data/packs-updates (asset packs) and data/remote/
 * (remote JSON configs such as AI-site selectors). PRO channel items need an active license.
 *
 * manifest.json:
 * { "version": 3, "items": [ { "id": "ndc", "kind": "pack", "version": 5, "channel": "free"|"pro",
 *     "files": [ { "name": "ndc.json", "url": "https://…", "sha256": "…" }, … ] }, … ] }
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface ManifestFile { name: string; url: string; sha256: string }
export interface ManifestItem { id: string; kind: "pack" | "selectors" | "kits" | "guide"; version: number; channel: "free" | "pro"; title?: string; files: ManifestFile[] }
export interface Manifest { version: number; items: ManifestItem[]; notes?: string }
export interface UpdateStatus { url: string | null; checkedAt?: string; available: Array<{ id: string; title?: string; from: number | null; to: number; channel: string; locked: boolean }>; installed: Record<string, number>; error?: string; installedNow?: string[] }

const SAFE_NAME = /^[a-z0-9._-]{1,80}$/i;

export class LibraryUpdater {
  private stateFile: string;
  private last: UpdateStatus;
  constructor(private dataDir: string, private url = process.env.BRICKWIRE_UPDATE_URL || null, private fetchImpl: typeof fetch = fetch) {
    this.stateFile = path.join(dataDir, "updates.json");
    this.last = { url: this.url, available: [], installed: this.installed() };
  }
  get packsDir() {
    return path.join(this.dataDir, "packs-updates");
  }
  get remoteDir() {
    return path.join(this.dataDir, "remote");
  }
  private installed(): Record<string, number> {
    try {
      return JSON.parse(fs.readFileSync(this.stateFile, "utf8")).installed ?? {};
    } catch {
      return {};
    }
  }
  status(): UpdateStatus {
    return this.last;
  }
  async check(opts: { pro: boolean; install?: boolean }): Promise<UpdateStatus> {
    const installed = this.installed();
    if (!this.url) return (this.last = { url: null, available: [], installed, error: "no update server configured (BRICKWIRE_UPDATE_URL in .env)" });
    try {
      const res = await this.fetchImpl(this.url, { signal: AbortSignal.timeout(15000), cache: "no-store" } as RequestInit);
      if (!res.ok) throw new Error(`manifest HTTP ${res.status}`);
      const m = (await res.json()) as Manifest;
      const available = (m.items ?? [])
        .filter((it) => it && SAFE_NAME.test(it.id) && (installed[it.id] ?? -1) < it.version)
        .map((it) => ({ id: it.id, title: it.title, from: installed[it.id] ?? null, to: it.version, channel: it.channel, locked: it.channel === "pro" && !opts.pro }));
      const done: string[] = [];
      if (opts.install) {
        for (const it of m.items ?? []) {
          const a = available.find((x) => x.id === it.id);
          if (!a || a.locked) continue;
          await this.install(it);
          installed[it.id] = it.version;
          done.push(it.id);
        }
        fs.writeFileSync(this.stateFile, JSON.stringify({ installed, at: new Date().toISOString() }));
      }
      return (this.last = { url: this.url, checkedAt: new Date().toISOString(), available: available.filter((a) => !done.includes(a.id)), installed, installedNow: done });
    } catch (e) {
      return (this.last = { url: this.url, checkedAt: new Date().toISOString(), available: [], installed, error: (e as Error).message });
    }
  }
  private async install(it: ManifestItem) {
    const dir = it.kind === "pack" ? this.packsDir : path.join(this.remoteDir, it.kind);
    fs.mkdirSync(dir, { recursive: true });
    const staged: Array<[string, Buffer]> = [];
    for (const f of it.files ?? []) {
      if (!SAFE_NAME.test(f.name)) throw new Error(`bad file name in manifest: ${f.name}`);
      if (!/^https:\/\//.test(f.url)) throw new Error(`only https downloads are allowed (${f.name})`);
      const r = await this.fetchImpl(f.url, { signal: AbortSignal.timeout(120000) } as RequestInit);
      if (!r.ok) throw new Error(`${f.name}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const hash = crypto.createHash("sha256").update(buf).digest("hex");
      if (hash !== String(f.sha256).toLowerCase()) throw new Error(`${f.name}: checksum mismatch`);
      staged.push([f.name, buf]);
    }
    for (const [name, buf] of staged) fs.writeFileSync(path.join(dir, name), buf); // all verified → write
  }
  /** Remote JSON config (e.g. selectors/providers.json) downloaded by an update, or null. */
  remoteConfig(kind: string, name: string): unknown {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.remoteDir, kind, name), "utf8"));
    } catch {
      return null;
    }
  }
}
