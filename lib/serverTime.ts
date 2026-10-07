// Server time for checks that compare with server timestamps (stale room
// presence, /park, entry effects), like the app's serverNowMs(). A computer
// whose clock runs hours ahead would otherwise think everybody in a room is
// stale and clear them. The offset is learned from server timestamps this
// browser sees (e.g. its own presence heartbeat); until one is seen it is unknown.

let offsetMs: number | null = null;

/** A server timestamp (ms) that was written at or before "now". */
export function noteServerTime(serverMs: number) {
  if (!Number.isFinite(serverMs) || serverMs <= 0) return;
  const seen = serverMs - Date.now();
  // The stamp can only be older than now, so the largest offset seen is the best guess.
  offsetMs = offsetMs === null ? seen : Math.max(offsetMs, seen);
}

export const serverTimeKnown = () => offsetMs !== null;

export const serverNow = () => Date.now() + (offsetMs ?? 0);
