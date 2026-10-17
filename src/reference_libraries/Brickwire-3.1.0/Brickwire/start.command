#!/bin/sh
# macOS / Linux launcher: starts the bridge and shows live BRIDGE / MCP / STUDIO status.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }
exec node scripts/start.mjs
