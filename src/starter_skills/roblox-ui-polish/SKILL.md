---
name: roblox-ui-polish
description: Build or refine Roblox HUDs, menus and responsive interfaces within the existing component system.
---
# UI polish
Use cached roblox-rules and this game's design profile only when needed for real design; no repeated loading.
Implement after at most one bundled context read. FAST skips optional preflight.
Preserve component/state ownership; clear typography, spacing, strong contrast and responsive layout.
Player-facing text is English. Purchases/rewards remain server-authoritative.
Avoid accidental duplicate layers and animation conflicts; preserve intended GUI layering.
For visual changes take a Studio-only image after build, corrections and final review; merge identical phases.
No pre-build image for a new screen. No desktop workaround. Playtests remain manual.
Report unverified runtime layout honestly; no extra checklist loops.

