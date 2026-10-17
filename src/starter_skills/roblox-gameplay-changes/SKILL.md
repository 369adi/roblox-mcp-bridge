---
name: roblox-gameplay-changes
description: Make focused Roblox gameplay and economy changes while preserving existing state ownership, save behavior and player feedback. Use for rewards, progression, purchases, checkpoints and related server/client features.
---

# Roblox gameplay changes

Locate the existing server authority, remote boundary and persistence owner for the requested mechanic before editing it. Read the relevant scripts and shared modules through Studio or the local codebase as appropriate. Search imported references for the project's service/component conventions; verify a reference's API and dependencies before reuse.

Trace one concrete player action through validation, state change, persistence and UI feedback. Changes to rewards or purchases must preserve duplicate/replay handling and failure behavior already present. Do not shift authority to a client to make an interaction appear faster.

Keep the modification focused on the requested behavior. Preserve existing module boundaries and live player/save semantics unless the user explicitly asks to change them. Keep player-facing strings English.

The user performs playtests manually. Do not automatically start/stop Play or a test/fix loop. Inspect code and available Edit state, provide a focused manual reproduction/check list, and distinguish static evidence from runtime behavior awaiting user verification. Do not publish or mutate production stores to verify a change. Record verified behavior and unresolved cases in project memory.
