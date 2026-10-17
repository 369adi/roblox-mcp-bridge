---
name: roblox-skill-authoring
description: Create reusable training packages that improve agent performance on a specific task family.
category: Brickwire Meta
version: 1.0.0
---

# Skill: Creating and Maintaining Skills

## Purpose
Create reusable training packages that improve agent performance on a specific task family.

## Activate when
Writing new Skill packages or updating existing ones.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Study the expected Skill format and existing examples. Define activation triggers, prerequisites, workflow, constraints, examples/templates, verification and failure handling. Keep the core `SKILL.md` scannable and move detailed references into separate files. Test activation on representative tasks and revise based on failures.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not create a shallow list of names and call it a training pack; avoid claiming executable behavior from prose alone.
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
Folder with SKILL.md, relevant references/templates, README and metadata.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
