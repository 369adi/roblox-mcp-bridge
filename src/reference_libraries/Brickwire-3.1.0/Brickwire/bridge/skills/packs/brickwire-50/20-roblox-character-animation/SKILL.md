---
name: roblox-character-animation
description: Create animations compatible with the target rig and integrate them safely.
category: Animation
version: 1.0.0
---

# Skill: Character Rigging and Animation

## Purpose
Create animations compatible with the target rig and integrate them safely.

## Activate when
Character animation, rigs, emotes, NPC movement.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Identify R6/R15/custom rig, joint hierarchy and available animation tools. If direct animation generation is unsupported, create a temporary compatible rig/dummy or provide keyframe/rig instructions rather than pretending an animation was generated. Define priority, loop, transitions and ownership. Test at gameplay speed and after respawn.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not invent published animation asset IDs or claim transfer succeeded without tool confirmation.
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
Rig requirements, animation state mapping, asset-ID placeholders and validation steps.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
