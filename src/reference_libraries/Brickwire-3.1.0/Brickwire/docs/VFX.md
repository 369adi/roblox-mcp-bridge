# Mesh VFX (M7)

Source: only meshes from `packs/built/vfx.json` (186 items, 176 of kind mesh). Presets live in `shared/src/studio2/vfx-mesh.ts`.

Install: tool `vfx_mesh_install` → `ReplicatedStorage.BW_VFX/<preset>` templates + `ReplicatedStorage.BW_VFX.VFX` ModuleScript.

```lua
local VFX = require(game.ReplicatedStorage.BW_VFX.VFX)
VFX.play("explosion", hrp.CFrame, { scale = 1.5 })
-- Animation: KeyframeMarker "vfx" with parameter "sword_slash", or a marker named "vfx:sword_slash"
VFX.bindMarkers(animTrack, function() return hrp.CFrame end)
```

## Perf budget
- ≤ 4 mesh layers per preset, ≤ 1.2 s lifetime (checked by `vfx-mesh.test.ts`).
- No particle emitters in mesh presets.
- CanCollide / CanQuery / CanTouch / CastShadow off on every layer.
- ≤ 24 live effect parts per client: the oldest are destroyed first (`VFX.maxLive`).
- Play effects on the client for cosmetic hits; the server should only send a RemoteEvent.
