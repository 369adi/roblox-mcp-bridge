---
name: roblox-tycoon-systems
description: Create modular progression that prevents duplicate purchases and cross-player interference.
category: Gameplay Systems
version: 1.0.0
---

# Skill: Tycoon and Incremental Progression

## Purpose
Create modular progression that prevents duplicate purchases and cross-player interference.

## Activate when
Droppers, purchase buttons, plot ownership, upgrades.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Inspect existing plot/ownership/economy systems. Define upgrade prerequisites, cost, unlock effect and persistence. Server validates ownership and funds, then marks purchase idempotently. Keep each plot isolated and clean spawned objects on reset/leave. Avoid one script per button when a data-driven system fits.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Never let one player trigger purchases or mutate state in another player’s plot.
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
Upgrade catalog, ownership flow, unlock graph and multiplayer test cases.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
