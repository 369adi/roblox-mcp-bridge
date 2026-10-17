---
name: roblox-pathfinding
description: Make NPC movement robust to dynamic obstacles and failed paths.
category: AI Gameplay
version: 1.0.0
---

# Skill: NPC Pathfinding and Navigation

## Purpose
Make NPC movement robust to dynamic obstacles and failed paths.

## Activate when
NPC movement, patrol routes, obstacle avoidance.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Check rig setup, Humanoid/root, collision and navigation geometry. Compute paths on meaningful target changes, move waypoint-by-waypoint, handle Path.Blocked and MoveToFinished, and apply cooldowns. Define fallback when no path exists and stop work when NPC is removed. Test narrow passages, moving targets and multiple NPCs.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not assume pathfinding can pass through collision geometry or every moving obstacle.
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
Navigation implementation plan, recovery behavior and test scenarios.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
