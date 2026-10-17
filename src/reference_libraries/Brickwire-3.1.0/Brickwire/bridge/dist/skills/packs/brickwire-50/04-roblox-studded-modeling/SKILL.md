---
name: roblox-studded-modeling
description: Create readable classic Roblox models using well-proportioned Parts rather than noisy detail.
category: 3D Modeling
version: 1.0.0
---

# Skill: Classic Studded Part Modeling

## Purpose
Create readable classic Roblox models using well-proportioned Parts rather than noisy detail.

## Activate when
Models built from Roblox Parts in classic/studded style.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Establish target style and approximate size. Check the workspace before placing anything. Build silhouette and primary masses first, then secondary forms, then restrained accents. Use consistent palette, meaningful names, loops for repetition and a sensible part budget. Ensure parts touch or overlap slightly where seams would otherwise appear. Hollow buildings should have real interior volume, openings and roof structure.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not imitate complex organic meshes with hundreds of tiny blocks; recommend MeshPart/import workflow when Parts are unsuitable.
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
Model plan, dimension assumptions, part hierarchy and visual review checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
