---
name: roblox-datastore
description: Prevent data loss with a single reliable profile owner.
category: Data
version: 1.0.0
---

# Skill: Player Data and DataStore Safety

## Purpose
Prevent data loss with a single reliable profile owner.

## Activate when
Saving, loading, persistent currency, inventory, progression.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Inspect existing ProfileService/ProfileStore/DataStore2/custom persistence before any change. Ask what must persist. Use one authoritative server-side owner, safe retries, UpdateAsync where appropriate, session-lock strategy, autosave and shutdown handling. Store serializable values only; version schemas and keep ordered migrations. Never let failed loads overwrite real profiles with defaults.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Warn before tests that can write to live stores. Never create a second persistence system beside an existing one.
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
Data schema, ownership map, failure policy, migration plan and test checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
