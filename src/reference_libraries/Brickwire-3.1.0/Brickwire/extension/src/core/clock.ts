/**
 * Background-tab-proof timing.
 *
 * Chrome throttles timers in hidden tabs (≥1 s, and to ONCE PER MINUTE after ~5 min hidden). While the
 * user watches Roblox Studio the chat tab is hidden, so plain setTimeout/setInterval made the agent stall
 * for minutes — tool results looked like they were "never sent". Extension messages are not throttled:
 * the service worker sends a tick every 250 ms over a long-lived port, and every sleep()/interval()
 * here wakes up on whichever comes first — the normal timer or the next tick past its deadline.
 */
type Waiter = { at: number; fn: () => void };
const waiters = new Set<Waiter>();
const intervals = new Set<{ every: number; next: number; fn: () => void }>();
let port: any = null; // chrome.runtime.Port
let lastTick = 0;

function pump() {
  const now = Date.now();
  for (const w of Array.from(waiters)) {
    if (now >= w.at) {
      waiters.delete(w);
      w.fn();
    }
  }
  for (const iv of intervals) {
    if (now >= iv.next) {
      iv.next = now + iv.every;
      try {
        iv.fn();
      } catch {
        /* keep ticking */
      }
    }
  }
}

function connect() {
  try {
    port = chrome.runtime.connect({ name: "bw-clock" });
    port.onMessage.addListener(() => {
      lastTick = Date.now();
      pump();
      try {
        port?.postMessage(1); // traffic from the page keeps the service worker alive
      } catch {
        /* reconnect below */
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
      void chrome.runtime.lastError;
      setTimeout(connect, 1000); // service worker restarted / extension reloaded
    });
  } catch {
    port = null;
  }
}

/** Start the background clock (idempotent). Safe outside an extension (tests): falls back to timers. */
export function startClock() {
  if (port || typeof chrome === "undefined" || !chrome.runtime?.connect) return;
  connect();
}

export function clockAlive(): boolean {
  return Date.now() - lastTick < 2000;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const w: Waiter = {
      at: Date.now() + ms,
      fn: () => {
        if (done) return;
        done = true;
        clearTimeout(t);
        resolve();
      },
    };
    const t = setTimeout(() => {
      waiters.delete(w);
      w.fn();
    }, ms);
    waiters.add(w);
  });
}

/** setInterval that keeps its pace in background tabs. Returns a stop function. */
export function every(ms: number, fn: () => void): () => void {
  const iv = { every: ms, next: Date.now() + ms, fn };
  intervals.add(iv);
  const t = setInterval(() => {
    if (Date.now() >= iv.next) {
      iv.next = Date.now() + ms;
      fn();
    }
  }, ms);
  return () => {
    intervals.delete(iv);
    clearInterval(t);
  };
}
