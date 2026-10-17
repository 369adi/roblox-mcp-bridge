---
name: roblox-ui-audit
description: Find and prioritize interface defects with evidence and reproducible steps.
category: UI
version: 1.0.0
---

# Skill: UI Audit and Visual QA

## Purpose
Find and prioritize interface defects with evidence and reproducible steps.

## Activate when
Auditing existing interfaces or fixing visual defects.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Capture or inspect each relevant screen and its states. Check clipping, overlap, text overflow, hierarchy, contrast, scale, input affordances, safe areas, focus, loading/empty/error states and consistency. Distinguish visual findings from assumptions. Rank issues by severity and propose minimal fixes. Recheck the same states after changes.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Do not claim screenshot or runtime verification without actual capture/tool evidence.
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
Issue list with severity, affected instances, evidence, fixes and retest status.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
