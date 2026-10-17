/**
 * M6 two-way sync: three-way merge of UIDoc trees (base = last synced state, local = UI Builder, remote = Studio).
 * Elements are matched by their name path ("Root/Panel/Play"; duplicates get "#2"). A property changed on one
 * side wins; changed on both sides to different values = conflict (local by default, overridable via `prefer`).
 *
 * Everything lives inside one self-contained factory so the bridge can also serve it to the browser
 * (`/ui-builder/ui-merge.js` = `(${uiMergeFactory})()`), with exactly the code that the unit tests run.
 */
export interface UIMergeConflict { path: string; key: string; local: unknown; remote: unknown; base: unknown }
export interface UIMergeResult { doc: { name?: string; children: unknown[]; [k: string]: unknown }; conflicts: UIMergeConflict[]; stats: { fromRemote: number; fromLocal: number; added: number; removed: number } }
export interface UIMergeApi {
  flatten(doc: unknown): Record<string, { parent: string; props: Record<string, unknown> }>;
  diff(a: unknown, b: unknown): { added: string[]; removed: string[]; changed: Array<{ path: string; keys: string[] }> };
  merge3(base: unknown, local: unknown, remote: unknown, prefer?: Record<string, "local" | "remote">): UIMergeResult;
}

export function uiMergeFactory(): UIMergeApi {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type El = any;
  function flatten(doc: El) {
    const out: Record<string, { parent: string; props: Record<string, unknown> }> = {};
    const walk = (list: El[], parent: string) => {
      const seen: Record<string, number> = {};
      for (const e of list || []) {
        const nm = String(e.name ?? e.type ?? "El");
        seen[nm] = (seen[nm] || 0) + 1;
        const path = (parent ? parent + "/" : "") + nm + (seen[nm] > 1 ? "#" + seen[nm] : "");
        const props: Record<string, unknown> = {};
        for (const k of Object.keys(e)) if (k !== "children" && e[k] !== undefined) props[k] = e[k];
        out[path] = { parent, props };
        walk(e.children || [], path);
      }
    };
    walk((doc && doc.children) || [], "");
    return out;
  }
  function diff(a: El, b: El) {
    const A = flatten(a), B = flatten(b);
    const added = Object.keys(B).filter((p) => !A[p]);
    const removed = Object.keys(A).filter((p) => !B[p]);
    const changed: Array<{ path: string; keys: string[] }> = [];
    for (const p of Object.keys(A)) {
      if (!B[p]) continue;
      const keys = Array.from(new Set([...Object.keys(A[p].props), ...Object.keys(B[p].props)])).filter((k) => !same(A[p].props[k], B[p].props[k]));
      if (keys.length) changed.push({ path: p, keys });
    }
    return { added, removed, changed };
  }
  function merge3(base: El, local: El, remote: El, prefer: Record<string, "local" | "remote"> = {}) {
    const B = flatten(base), L = flatten(local), R = flatten(remote);
    const conflicts: UIMergeConflict[] = [];
    const stats = { fromRemote: 0, fromLocal: 0, added: 0, removed: 0 };
    const merged: Record<string, Record<string, unknown>> = {};
    const drop = new Set<string>();
    const all = Array.from(new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(B)]));
    for (const p of all) {
      const b = B[p], l = L[p], r = R[p];
      if (l && r) {
        const props: Record<string, unknown> = {};
        const keys = Array.from(new Set([...Object.keys(l.props), ...Object.keys(r.props), ...(b ? Object.keys(b.props) : [])]));
        for (const k of keys) {
          const bv = b ? b.props[k] : undefined, lv = l.props[k], rv = r.props[k];
          let v: unknown;
          if (same(lv, rv)) v = lv;
          else if (b && same(lv, bv)) { v = rv; stats.fromRemote++; }
          else if (b && same(rv, bv)) { v = lv; stats.fromLocal++; }
          else {
            const pick = prefer[p + "|" + k] ?? "local";
            conflicts.push({ path: p, key: k, local: lv, remote: rv, base: bv });
            v = pick === "remote" ? rv : lv;
          }
          if (v !== undefined) props[k] = v;
        }
        merged[p] = props;
      } else if (l && !r) {
        if (b && same(l.props, b.props)) { drop.add(p); stats.removed++; } // deleted in Studio, untouched locally
        else if (b) { conflicts.push({ path: p, key: "*", local: "edited", remote: "deleted", base: "present" }); if ((prefer[p + "|*"] ?? "local") === "remote") drop.add(p); else merged[p] = { ...l.props }; }
        else { merged[p] = { ...l.props }; stats.added++; } // new locally
      } else if (r && !l) {
        if (b && same(r.props, b.props)) { drop.add(p); stats.removed++; } // deleted locally, untouched in Studio
        else if (b) { conflicts.push({ path: p, key: "*", local: "deleted", remote: "edited", base: "present" }); if ((prefer[p + "|*"] ?? "local") === "remote") merged[p] = { ...r.props }; else drop.add(p); }
        else { merged[p] = { ...r.props }; stats.added++; } // new in Studio
      }
    }
    // rebuild: local order first, then remote-only elements appended under their parent
    const nodes: Record<string, El> = {};
    const roots: El[] = [];
    const place = (path: string, parent: string) => {
      if (nodes[path] || !merged[path] || drop.has(path)) return;
      if (parent && (drop.has(parent) || !merged[parent])) return; // parent removed → subtree removed
      const n = { ...merged[path], children: [] as El[] };
      nodes[path] = n;
      if (!parent) roots.push(n);
      else if (nodes[parent]) nodes[parent].children.push(n);
    };
    const order = [...Object.keys(L), ...Object.keys(R).filter((p) => !L[p])];
    for (let pass = 0; pass < 3; pass++) for (const p of order) place(p, (L[p] || R[p]).parent);
    const strip = (n: El) => { if (!n.children.length) delete n.children; else n.children.forEach(strip); return n; };
    roots.forEach(strip);
    const top: Record<string, unknown> = {};
    for (const src of [base || {}, remote || {}, local || {}]) for (const k of Object.keys(src)) if (k !== "children") top[k] = (src as El)[k];
    return { doc: { ...top, children: roots }, conflicts, stats };
  }
  return { flatten, diff, merge3 };
}

export const UIMerge: UIMergeApi = uiMergeFactory();
