# Hang monitor (M3)

Logic: `shared/src/hang-monitor.ts` (`HangMonitor`). Tests: `tests/unit/hang-monitor.test.ts` (one test per row, M3-1 … M3-8).
Every recovery writes a log line, and the extension shows it as a panel activity row.

| # | Hang | Detection | Recovery | Wired in |
|---|---|---|---|---|
| 1 | Model never finishes | Stop visible, no text growth for 90 s | press Stop → send "Continue exactly from where you stopped" (once per reply) | `agent-core.tickLoop` + `adapter.pressStop()` |
| 2 | Reply ended mid-block | unclosed tool block after end of reply | ask to resend ONLY that block | `agent-core.handleResponse` (reuses `REMINDERS.truncated`) |
| 3 | Message not delivered | composer still holds text / no user turn after 8 s | retry send (max 2, refocus composer) → then notify user | existing 2.1 `checkDelivery` watchdog (4 retries, refocus); `HangMonitor.delivery` holds the same policy for the headless loop |
| 4 | Studio not responding | call without result > 120 s | ping Studio, mark the call failed, tell the model | bridge per-call timeout (2.1) + `HangMonitor.callPending` |
| 5 | Studio in wrong mode | error matches "Edit datamodel is not available in Play mode" etc. | read `get_studio_state`, attach the state, tell the model which datamodel to retry against (one retry hint per call) | `agent-core.execOne` |
| 6 | Bridge offline | health check fails | reconnect with backoff 1 s → 2 s → 4 s … max 30 s, banner | `HangMonitor.bridgeHealth`; the panel already shows the offline state from 2.1 |
| 7 | Loop | same tool + args hash 3× in a row | auto-run stopped, model gets an explanation, user sees the panel row | `agent-core.execOne` |
| 8 | Model waits for user | `<ROBLOX_AGENT_ASK>` or a question with no tools | notify user, no auto-continue | `agent-core.handleResponse` |

Verification limits:
- Rows 1, 2, 5, 7 and 8 run the real recovery path in the extension.
- Row 5 tells the model which datamodel to use; it does not switch automatically, because the right datamodel depends on what the model's code was trying to do.
- Row 6: the backoff schedule is unit tested. The live banner was **not verified — needs a browser with the bridge stopped**.
- No row has been checked on a live ChatGPT/Claude page (**needs a browser**).
