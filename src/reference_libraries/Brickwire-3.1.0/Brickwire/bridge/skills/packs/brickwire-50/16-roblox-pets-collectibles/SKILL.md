---
name: roblox-pets-collectibles
description: Create collectible systems with consistent definitions, ownership and progression.
category: Gameplay Systems
version: 1.0.0
---

# Skill: Pets, Collectibles and Companion Systems

## Purpose
Create collectible systems with consistent definitions, ownership and progression.

## Activate when
Pets, eggs, collectible followers and rarity systems.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Define rarity, obtainable sources, duplicate behavior, equip limits, stats and visuals. Use a server-side catalog and deterministic roll table. Validate probability totals and communicate odds honestly. Separate cosmetic following from stat calculations. Make equip/unequip and rewards idempotent and persist only stable IDs/counts.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not imply an unverified chance or grant an item twice after retries.
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
Catalog schema, roll rules, companion lifecycle and balancing checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
