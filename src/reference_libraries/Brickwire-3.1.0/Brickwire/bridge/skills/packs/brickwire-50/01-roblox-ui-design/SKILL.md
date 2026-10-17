---
name: roblox-ui-design
description: Design a coherent, polished Roblox interface that fits the requested visual direction and current game.
category: UI
version: 1.0.0
---

# Skill: Roblox UI Design System

## Purpose
Design a coherent, polished Roblox interface that fits the requested visual direction and current game.

## Activate when
GUI design, redesign, layout, HUD, menus.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Audit existing ScreenGuis, layouts, naming and input behavior. Ask only for missing decisions that materially affect the design. Define hierarchy, states, navigation, responsive constraints and style tokens before building. Prefer reusable components and a consistent spacing/type/color system. Use actual provided references; do not invent that a visual was matched if no screenshot/reference was available.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not create a second copy of an existing GUI when the project requires reuse. Preserve existing required instance names and button flows.
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
ScreenGui hierarchy, style tokens, component map, responsive behavior, and acceptance checklist.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
