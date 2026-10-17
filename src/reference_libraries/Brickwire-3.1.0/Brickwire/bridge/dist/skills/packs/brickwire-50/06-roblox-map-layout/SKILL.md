---
name: roblox-map-layout
description: Design navigable spaces with clear landmarks, pacing and player-readable routes.
category: World Building
version: 1.0.0
---

# Skill: Map Layout and Spatial Flow

## Purpose
Design navigable spaces with clear landmarks, pacing and player-readable routes.

## Activate when
Planning a map, lobby, level or linear stage sequence.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Clarify gameplay loop, player count, movement speed, session length and required destinations. Draw a simple top-down flow before detailing. Establish spawn, main route, side spaces, sightlines, boundaries, landmarks and recovery paths. For linear stages, keep progression legible and avoid dead ends unless intentional. Validate travel distances and camera sightlines at avatar scale.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not fill space with decorative clutter before route and gameplay dimensions are correct.
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
Map flow plan, zone list, rough dimensions, landmark plan and playtest checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
