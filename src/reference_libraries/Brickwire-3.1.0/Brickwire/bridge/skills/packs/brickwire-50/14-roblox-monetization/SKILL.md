---
name: roblox-monetization
description: Integrate Roblox monetization without duplicate receipt handlers or invented IDs.
category: Monetization
version: 1.0.0
---

# Skill: Gamepasses and Developer Products

## Purpose
Integrate Roblox monetization without duplicate receipt handlers or invented IDs.

## Activate when
Robux purchases, permanent perks and consumables.

## Inputs to establish
- The user’s exact outcome and any required visual/functional reference.
- Current project/place identity and relevant existing systems.
- Constraints: required object names, style, platforms, performance budget, and what must not change.
- Available tools and permissions; verify them rather than assuming they exist.

## Workflow
Ask for real gamepass/product IDs and exact benefits. Inspect current MarketplaceService and ProcessReceipt assignment. Gamepasses are permanent ownership; developer products are consumables granted through one central ProcessReceipt handler. Handle retries, cached ownership and post-purchase updates. Explain dashboard setup and test limitations.

1. **Inspect:** collect the minimum relevant project context and current implementation. Identify existing owners, interfaces, assets and dependencies.
2. **Plan:** state the intended result, acceptance criteria, non-goals and the smallest safe change.
3. **Execute:** use only verified tools and project conventions. Keep changes localized and reversible.
4. **Validate:** check success and failure paths against the acceptance criteria. Use actual runtime evidence when available.
5. **Report:** provide artifacts, paths/instances changed, checks actually run, remaining risks and blockers.

## Rules specific to this Skill
- Never invent product IDs/prices. Never assign a second ProcessReceipt function.
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
ID table with clearly marked missing values, central receipt-handler integration plan and verification cases.

## References and templates
- Add task-specific examples to `references/` and reusable starting points to `templates/`.
- Do not copy a template blindly; adapt it to the real project.
