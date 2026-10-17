---
name: roblox-ui-luau
description: Implement UI components in Luau with maintainable hierarchy and working interaction.
category: UI
version: 1.0.0
---

# Skill: Roblox UI Implementation in Luau

## Purpose
Implement UI components in Luau with maintainable hierarchy and working interaction.

## Activate when
Creating or modifying ScreenGui components.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Inspect existing GUI instances and controllers first. Separate view construction from state/logic where practical. Use UIListLayout/UIGridLayout/constraints for adaptable layouts, anchor points and scale-aware sizing. Connect events once, disconnect temporary connections when destroyed, and give buttons loading/disabled/error states. Test keyboard, mouse, touch and gamepad only where relevant.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Never leave fake buttons, placeholder click handlers, or decorative controls that appear functional but do nothing.
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
Runnable/adaptable Luau implementation, hierarchy notes, interaction map, test steps.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
