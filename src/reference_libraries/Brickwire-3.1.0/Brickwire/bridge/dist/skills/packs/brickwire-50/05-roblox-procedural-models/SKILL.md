---
name: roblox-procedural-models
description: Generate structured geometry through code and validate its dimensions and placement.
category: 3D Modeling
version: 1.0.0
---

# Skill: Procedural Model Generation

## Purpose
Generate structured geometry through code and validate its dimensions and placement.

## Activate when
Generating scripted props, buildings, vehicles or set pieces.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Inspect existing objects and choose a clear origin/pivot. Declare dimensions, coordinate conventions and reusable helpers. Generate primary geometry first, then detail; name every part semantically and group related pieces. Avoid arbitrary transforms and floating parts. If the object must move, define root, joints/welds and PrimaryPart explicitly. Review a screenshot or returned model metadata, then fix observed defects.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Only use helpers actually provided by the current runtime. Never assume `build_model` or other example APIs exist unless confirmed.
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
Build script or tool plan, model hierarchy, part count/dimensions, verification report.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
