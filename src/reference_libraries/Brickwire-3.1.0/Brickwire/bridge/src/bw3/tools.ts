/** Brickwire 3.0 tools: local OBJ generation (bridge-side) and EditableMesh import into Studio (composite). */
import { wrapLuau, pathSegments } from "../luau.js";
import type { CompositeTool } from "../composites.js";
import type { ArtifactStore } from "./artifact-store.js";

const CHUNK_VERTS = 3000;
export function studioImportChunks(store: ArtifactStore, id: string) {
  const groups = store.importPayload(id), out: Array<{ name: string; color: string; material: string; v: number[][]; t: number[][] }> = [];
  for (const g of groups) {
    // split very large material groups into several meshes so each Luau literal stays small
    let cur = { v: [] as number[][], t: [] as number[][], map: new Map<number, number>() }, k = 0;
    const flush = () => { if (cur.t.length) out.push({ name: `${g.material}${k ? "_" + k : ""}`, color: g.color, material: g.robloxMaterial, v: cur.v, t: cur.t }); k++; cur = { v: [], t: [], map: new Map() }; };
    for (const tri of g.t) {
      if (cur.v.length + 3 > CHUNK_VERTS) flush();
      cur.t.push(tri.map((i) => { if (!cur.map.has(i)) { cur.map.set(i, cur.v.length); cur.v.push(g.v[i]); } return cur.map.get(i)!; }));
    }
    flush();
  }
  return out;
}
const MESH_LUAU = `	local AS = game:GetService("AssetService")
	local parent = ARGS.parent and bw_must(ARGS.parent) or workspace
	local model = parent:FindFirstChild(ARGS.model)
	if ARGS.first then
		if model then error("An instance named " .. ARGS.model .. " already exists under the target; choose another parent or remove it", 0) end
		model = Instance.new("Model"); model.Name = ARGS.model; model:SetAttribute("BrickwireArtifact", ARGS.artifact); model.Parent = parent
		bw_waypoint("Brickwire 3.0 import " .. ARGS.artifact)
	elseif not model or model:GetAttribute("BrickwireArtifact") ~= ARGS.artifact then error("Import target model missing", 0) end
	local okE, em = pcall(function() return AS:CreateEditableMesh() end)
	if not okE or not em then error("EditableMesh unavailable: " .. tostring(em), 0) end
	local vid = {}
	for i, p in ipairs(ARGS.v) do vid[i] = em:AddVertex(Vector3.new(p[1], p[2], p[3])) end
	local tris = 0
	for _, t in ipairs(ARGS.t) do em:AddTriangle(vid[t[1] + 1], vid[t[2] + 1], vid[t[3] + 1]); tris += 1 end
	local okP, part = pcall(function() return AS:CreateMeshPartAsync(Content.fromObject(em)) end)
	if not okP then error("CreateMeshPartAsync failed: " .. tostring(part), 0) end
	part.Name = ARGS.name; part.Anchored = true; part.Color = Color3.fromHex(ARGS.color)
	pcall(function() part.Material = Enum.Material[ARGS.material] end)
	local c = Vector3.new(ARGS.center[1], ARGS.center[2], ARGS.center[3])
	part.Position = Vector3.new(ARGS.origin[1], ARGS.origin[2], ARGS.origin[3]) + c
	part.Parent = model
	return { path = bw_path(part), triangles = tris, size = bw_enc(part.Size) }`;
const VERIFY_LUAU = `	local parent = ARGS.parent and bw_must(ARGS.parent) or workspace
	local model = parent:FindFirstChild(ARGS.model)
	if not model then return { exists = false } end
	local parts, names = 0, {}
	for _, d in ipairs(model:GetChildren()) do if d:IsA("MeshPart") then parts += 1; table.insert(names, d.Name) end end
	local cf, size = model:GetBoundingBox()
	return { exists = true, path = bw_path(model), meshParts = parts, names = names, size = bw_enc(size), artifact = model:GetAttribute("BrickwireArtifact") }`;

export function makeBw3Tools(getStore: () => ArtifactStore | undefined): CompositeTool[] {
  return [{
    name: "artifact_studio_import",
    description: "Brickwire 3.0: import a generated, verified OBJ artifact (artifact_id from asset_generate_obj or the Asset Library) into Roblox Studio as a Model of EditableMesh MeshParts (one per material). Reads the model back afterwards. EditableMesh content is NOT saved with the place — for a persistent asset import model.obj with the 3D Importer.",
    risk: "write", requires: ["execute_luau"],
    inputSchema: { type: "object", required: ["artifact_id"], properties: { artifact_id: { type: "string" }, parent: { type: "string", description: "Instance path, default Workspace" }, position: { type: "array", items: { type: "number" }, description: "[x,y,z] origin in studs" } } },
    async run(a, ctx) {
      const store = getStore(); if (!store) throw new Error("Artifact store unavailable");
      const rec = store.get(String(a.artifact_id));
      if (!rec.verified) throw new Error("Artifact files changed since verification; regenerate before importing");
      const chunks = studioImportChunks(store, rec.id);
      const origin = Array.isArray(a.position) && a.position.length === 3 && a.position.every((x) => Number.isFinite(Number(x))) ? a.position.map(Number) : [0, 0, 0];
      const parent = a.parent ? pathSegments(String(a.parent)) : null;
      const model = ("BW_" + rec.name.replace(/[^\w]+/g, "_")).slice(0, 50) + "_" + rec.id.slice(-6);
      const created: unknown[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        // MeshPart is centred on its bounds: compute the chunk centre so parts keep their relative placement.
        const mn = [0, 1, 2].map((k) => Math.min(...c.v.map((p) => p[k]))), mx = [0, 1, 2].map((k) => Math.max(...c.v.map((p) => p[k])));
        const center = mn.map((x, k) => Math.round(((x + mx[k]) / 2) * 1e4) / 1e4);
        const local = c.v.map((p) => p.map((x, k) => Math.round((x - center[k]) * 1e4) / 1e4));
        created.push(await ctx.runLuau(wrapLuau({ parent, model, artifact: rec.id, first: i === 0, name: c.name, color: c.color, material: c.material, v: local, t: c.t, center, origin }, MESH_LUAU), { readOnly: false }));
      }
      const verify = (await ctx.runLuau(wrapLuau({ parent, model }, VERIFY_LUAU), { readOnly: true })) as any;
      const ok = verify?.exists === true && verify?.meshParts === chunks.length && verify?.artifact === rec.id;
      store.update(rec.id, { studio: [...(rec.studio ?? []), { importedAt: new Date().toISOString(), path: verify?.path, persistent: false }] });
      return { ok, verified: ok, model, expectedMeshParts: chunks.length, readBack: verify, created, persistent: false, warning: "EditableMesh MeshParts disappear when the place is reopened. For a permanent asset, import model.obj through Studio's 3D Importer (File → Import 3D) or upload via Open Cloud." };
    },
  }];
}
