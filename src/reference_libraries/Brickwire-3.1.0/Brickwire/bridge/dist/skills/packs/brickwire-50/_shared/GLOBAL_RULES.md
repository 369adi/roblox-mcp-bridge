# Global Rules for every Brickwire Skill

## Project safety
- Inspect the current project tree and search for existing systems before creating or replacing anything.
- Reuse existing modules, RemoteEvents, GUI instances, data stores, naming conventions, and service boundaries where appropriate. Never create a parallel system without a reason and approval.
- Make the smallest coherent change. Preserve unrelated gameplay and UI.
- Do not claim that code ran, a screenshot was inspected, a test passed, or Studio was changed unless the corresponding real tool result confirms it.
- If a required tool is missing, explain the blocker and provide a safe alternative; do not fabricate MCP methods.
- Before destructive edits, publishing, live DataStore writes, economy resets, asset purchases, or deleting user content, ask for explicit confirmation.

## Engineering
- Prefer server authority for rewards, currency, inventory ownership, combat outcomes, and progression. Treat all client input as untrusted.
- Use `--!strict` where feasible; validate types and nil assumptions. Use `WaitForChild` for replicated objects that may not exist yet, with sensible timeout/error handling where appropriate.
- Avoid unbounded loops, per-frame expensive work, repeated DataStore writes, unbounded RemoteEvent spam, and excessive instances.
- Keep code modular and readable; use clear names, small functions, and a single source of truth.
- Respect current project architecture and existing dependencies. Do not add packages or external assets without approval.

## Verification and reporting
- Define acceptance criteria before implementation.
- Verify structure, references, nil cases, multiplayer/server-client behavior, and failure paths.
- Use real Studio tests/screenshots/logs when tools allow. Otherwise label checks as static review, not runtime testing.
- Report changed files/instances, tests actually performed, unresolved risks, and next steps.
