# Brickwire app localization (RU / EN)

Scope: application, bridge pages and Studio plugin only. The browser extension is unchanged.

- `bridge/src/i18n.js` is loaded first by `app.html`, `paint.html`, `ui-builder.html`, `dashboard.html` and `mcp.html`.
- Russian remains the source language. English is a translation layer: a dictionary of every Russian UI literal in app-owned sources (792 entries, including the Skill catalog names and descriptions shown in the app).
- Text is translated in the DOM, including dynamically rendered panels, dialogs, placeholders, titles, ARIA labels and `alert/confirm/prompt` messages. Dynamic strings are translated by fragments, so numbers and names stay intact.
- Not translated on purpose: user and AI chat messages, textareas, code, `pre` blocks (JSON, logs, Luau), and stored Skill instruction files sent to the agent.
- Language switch: RU / EN in the top bar. The choice is stored in `localStorage` (`brickwire.lang`) and applies to embedded Paint / UI Builder. Without a stored choice, Russian system languages get RU and all others get EN.
- Dates in MCP use the selected locale.
- The Studio plugin UI contains no Russian text. Bridge error messages are translated when shown in the app; the plugin shows them as sent.

Verification: the `depth.test.ts` coverage test fails if any Russian literal in `bridge/src` lacks an English entry. A headless browser scan of all 18 sections, key dialogs, the embedded editors, `/` and `/mcp` in EN mode found no remaining Cyrillic UI text (`app/tests/BROWSER-QA-STAGE5-I18N.json`).
