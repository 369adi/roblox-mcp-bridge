---
name: roblox-audio-design
description: Integrate audio with clear ownership, spatial behavior and lifecycle.
category: Audio
version: 1.0.0
---

# Skill: Sound Design and Audio Integration

## Purpose
Integrate audio with clear ownership, spatial behavior and lifecycle.

## Activate when
SFX, ambience, music, UI sounds and spatial audio.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Map events to sound cues. Determine 2D vs 3D, rolloff, volume group, loop behavior and replication. Avoid duplicate Sound instances and sounds that survive their source unexpectedly. Respect user-provided asset IDs and permissions. Add volume controls and avoid audio spam during repeated events.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not invent asset IDs or fetch restricted assets without authorization.
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
Audio event map, sound placement plan, settings and verification checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
