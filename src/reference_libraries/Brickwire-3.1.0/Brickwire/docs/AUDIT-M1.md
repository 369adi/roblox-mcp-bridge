# M1 audit note

**What exists (2.1):**
- `agent-core.tickLoop` polls every 500 ms. A reply ends after `settleMs` of no change (hidden tab: ×3), with longer waits for incomplete or plain replies.
- `isGenerating()` combines the provider Stop/streaming selectors, a semantic Stop button and text growth in the last 2.5 s. Because of that 2.5 s growth heuristic, Stop disappearing could never end a reply fast.
- `runBatch` ran calls one by one, after the whole reply. Dedupe used `executedIds` (reply|id|tool|args).
- The full prompt is built only in `start()`. Later messages are `formatToolResults` plus a short footer.

**Changed:**
- Added an explicit `stopSignal()` (reuses the provider `stop`/`streaming` selectors) and an end detector with a 250 ms confirm.
- Streaming parse queues closed blocks while the reply is still being written.
- Added a scheduler: parallel reads, ordered writes.
- Added step timings.

**Reused:**
- Parser, `assessCall` risk levels, `bridge.callTool` (long-poll, resume ids), persisted `InflightBatch`, panel activity rows, `REMINDERS.tooMany`.
- `executedIds` key format is unchanged, so saved runs from 2.1 still resume correctly.
