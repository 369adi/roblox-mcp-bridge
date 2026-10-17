---
name: roblox-mesh-obj
description: Create a verifiable mesh asset workflow from geometry to in-chat preview and Studio import.
category: 3D Pipeline
version: 1.0.0
---

# Skill: OBJ/3D Mesh Export and Roblox Import

## Purpose
Create a verifiable mesh asset workflow from geometry to in-chat preview and Studio import.

## Activate when
Generating or importing OBJ/MTL models.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Confirm the actual mesh generator/export tool. Generate real geometry, export OBJ and any required MTL/textures, validate file existence and basic mesh integrity, and create a preview from the same artifact. Document scale, axes, materials and import settings. If no exporter exists, state that and provide a supported alternative.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Never fabricate a file path or display a generic image as a preview of the actual mesh.
- Do not invent IDs, APIs, files, screenshots, test results, Studio state or external permissions.
- If an essential requirement is ambiguous, ask one focused question; otherwise state reasonable assumptions.
- Read [`../../_shared/GLOBAL_RULES.md`](../../_shared/GLOBAL_RULES.md) before making project changes.

## Acceptance checklist
- [ ] Existing project structure and dependencies were inspected.
- [ ] Output meets the requested goal and preserves unrelated behavior.
- [ ] Invalid inputs, retries and cleanup are handled where relevant.
- [ ] Actual tests/evidence are separated from static reasoning.
- [ ] Output and unresolved limitations are reported honestly.

## Output contract
OBJ/MTL artifact, preview, dimensions, import instructions and validation status.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
