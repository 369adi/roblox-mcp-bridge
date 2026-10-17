---
name: roblox-autopilot-workflow
description: Run a controlled plan-build-test-review loop with checkpoints.
category: Brickwire Meta
version: 1.0.0
---

# Skill: Autopilot Development Workflow

## Purpose
Run a controlled plan-build-test-review loop with checkpoints.

## Activate when
Multi-step tasks that can be planned and verified autonomously.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Turn the goal into acceptance criteria and a dependency tree. Inspect project state, plan stages, execute the smallest safe step, verify real results, fix observed failures, checkpoint and summarize. Pause for permission on destructive actions, ambiguous requirements or unavailable tools. Surface progress from real events rather than invented percentages.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Autonomy does not override user permission, project constraints or tool limitations.
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
Live stage status, development tree, changed artifacts, test evidence and blockers.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
