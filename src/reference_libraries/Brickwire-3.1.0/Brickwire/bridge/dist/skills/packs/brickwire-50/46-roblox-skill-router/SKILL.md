---
name: roblox-skill-router
description: Select only the relevant training guides and compose them without prompt bloat.
category: Brickwire Meta
version: 1.0.0
---

# Skill: Automatic Skill Selection and Composition

## Purpose
Select only the relevant training guides and compose them without prompt bloat.

## Activate when
Choosing Skills for incoming Brickwire requests.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Parse the user goal, target artifact, environment and risk. Match triggers and required dependencies. Choose one primary Skill and only necessary supporting Skills. Load the primary `SKILL.md` first, then referenced material on demand. Detect conflicting instructions and prefer project-specific constraints. Report selected Skills when useful.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Never load all 50 Skills for every request or claim a Skill grants unavailable tools.
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
Selected Skill IDs, reason, dependencies and any missing tool/capability.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
