# Brickwire 2.3 — Studio plugin + Pro app

## Studio plugin (Plugins → Brickwire → AI Chat)
- Installed automatically by `install.bat` / `start.bat` / the Pro app into `%LOCALAPPDATA%\Roblox\Plugins\BrickwireChat.lua` (restart Studio once).
- First request: Studio asks to allow HTTP to `127.0.0.1` — allow it.
- Write a request, attach images (📎, PNG/JPG up to 6 MB, 4 per message) and the current selection (🎯).
- The request goes bridge → the browser tab with the Brickwire extension (the tab with a running agent is preferred;
  if none runs, the first open AI chat tab starts a session with it) → AI chat. Replies stream back, every step is shown
  (✓ / ✗ / ⏳), pause / resume / stop from the plugin header. Port in ⚙ (default 47821).

## Pro app (`start-app.bat`, or `http://127.0.0.1:47821/app`, or the Electron app in `app/`)
| Tab | What |
|---|---|
| Overview | actions, requests, finished tasks, errors, sessions, library size |
| Chat | the same chat as the Studio plugin |
| History | every request / tool call / result, search, session filter, ↩ rollback to the snapshot before a step, export as Luau replay or Markdown report |
| Library | 🎯 save the Studio selection (models, UI, scripts with full properties, attributes, tags, sources), prompts, recipes, Luau code; insert into any place; send to the AI chat |
| Updates | manifest-based pack / kit / selector updates (`BRICKWIRE_UPDATE_URL`), sha256-checked, PRO channel |
| License | Ed25519-signed keys |

Free: history 7 days, 5 library items, no export / rollback from history, free update channel.

## Licenses (seller)
Keys are signed with `license-private.pem` (NOT shipped). `node license-sign.mjs buyer@mail.com pro 365` prints a key.
The public key is in `bridge/src/license.ts` (or `BRICKWIRE_LICENSE_PUBKEY`).

## Update server
Host `manifest.json` (format in `bridge/src/updates.ts`) and the files over HTTPS, set `BRICKWIRE_UPDATE_URL` in `.env`.

## Desktop build (Electron)
```
npm run build
cd app && npm install && npm run dist   # → app/release/Brickwire Pro Setup.exe
```

## API (bridge, 127.0.0.1 only)
`/api/plugin/{request,feed,status,control,next,event,request/:id/result}` · `/api/pro/{license,history,history/sessions,history/export,history/restore,library,library/capture,library/:id/{insert,send,delete},chat,updates,updates/check,remote,stats}` · `/app`
