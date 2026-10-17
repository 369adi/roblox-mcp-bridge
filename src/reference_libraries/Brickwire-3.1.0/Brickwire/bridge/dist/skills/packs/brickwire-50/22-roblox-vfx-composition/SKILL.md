---
name: roblox-vfx-composition
description: Compose effects from layers with timing, shape and readable gameplay intent.
category: VFX
version: 1.0.0
---

# Skill: Layered VFX Composition

## Purpose
Compose effects from layers with timing, shape and readable gameplay intent.

## Activate when
Abilities, impacts, portals, magic, stylized effects.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Specify visual language, duration, palette, scale and readability at gameplay distance. Layer geometry, beams, trails, particles, lights and sound only as appropriate. Prefer reusable effect modules and bounded lifetimes. Use mesh-based shapes where the supported pipeline allows; do not reduce every effect to ParticleEmitter spam. Separate cosmetic client effects from authoritative hit logic.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Never imply a custom mesh/VFX preview exists unless it was actually generated and displayed.
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
Effect layer plan, timing table, asset requirements, performance budget and preview checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
