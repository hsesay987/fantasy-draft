// Pure logic behind the In-Sync screen: how often the marker is sent, which position to show, and how the reveal plays.
// Kept away from React and canvas so it can be tested.

export type Points = 0 | 2 | 3 | 4;

/** The engine's scoring bands, widest first (see `bandPoints`; a test keeps the two in step). */
export const SCORE_BANDS = [{ gap: 12, points: 2 }, { gap: 7, points: 3 }, { gap: 3, points: 4 }] as const;

const VERDICTS: Record<Points, string> = { 4: "Bullseye", 3: "Close", 2: "Near", 0: "Static" };
export const verdictFor = (points: Points) => VERDICTS[points];

/** How many guessers must lock to settle the marker: more than half, so one guesser decides alone. */
export const locksNeeded = (guessers: number) => Math.floor(guessers / 2) + 1;

/**
 * Sends at most one value per `ms`: the first goes at once, then only the newest value waiting when the window ends.
 * `settle` runs a callback after any waiting value has gone, so what is sent next lands after the last move.
 */
export function createThrottle<T>(send: (v: T) => void, ms = 200) {
  let last = -Infinity;
  let waiting: { v: T } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let after: (() => void)[] = [];
  const fire = () => {
    timer = null;
    if (waiting) {
      const { v } = waiting;
      waiting = null;
      last = Date.now();
      send(v);
    }
    const run = after;
    after = [];
    run.forEach((f) => f());
  };
  return {
    push(v: T) {
      const wait = last + ms - Date.now();
      if (wait <= 0 && timer == null) {
        last = Date.now();
        send(v);
        return;
      }
      waiting = { v };
      if (timer == null) timer = setTimeout(fire, Math.max(0, wait));
    },
    settle(f: () => void) {
      if (timer == null) f();
      else after.push(f);
    },
    cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null;
      waiting = null;
      after = [];
    },
  };
}

export type LocalMarker = { pos: number; at: number; dragging: boolean };
/** How long a released marker waits for the server before following it again. */
export const MARKER_HOLD_MS = 700;

/** Which position this seat shows: its own finger while dragging and just after, otherwise the server's. */
export function shownMarker(server: number, local: LocalMarker | null, now: number): number {
  if (!local) return server;
  if (local.dragging) return local.pos;
  return now - local.at > MARKER_HOLD_MS ? server : local.pos;
}

/** A pointer's x as a 0-100 position, where `margin` is the share of the width left bare on each side of the scale. */
export function posFromPointer(clientX: number, left: number, width: number, margin: number): number {
  const scale = width * (1 - margin * 2);
  if (scale <= 0) return 0;
  return Math.round(Math.max(0, Math.min(100, ((clientX - left - width * margin) / scale) * 100)));
}

/** Cycles across the screen for a wave tuned to this position. */
export const freqOf = (pos: number) => 2.5 + (pos / 100) * 6;

const unit = (x: number) => Math.max(0, Math.min(1, x));
const LOCK: Record<Points, number> = { 4: 1, 3: 0.72, 2: 0.42, 0: 0 };
export const REVEAL_WIPE_MS = 700, REVEAL_OUTCOME_MS = 1900;

/** Where the reveal has got to `ms` after the marker locked: the static clears, the target resolves, then the result lands. */
export function revealAt(ms: number, points: Points) {
  const resolve = unit((ms - REVEAL_WIPE_MS) / (REVEAL_OUTCOME_MS - REVEAL_WIPE_MS));
  const eased = resolve * resolve * (3 - 2 * resolve);
  return {
    wipe: unit(ms / REVEAL_WIPE_MS),
    scramble: 1 - eased,
    lock: LOCK[points] * eased,
    bands: unit((ms - REVEAL_WIPE_MS) / 600),
    flat: points === 0 ? unit((ms - REVEAL_OUTCOME_MS) / 700) : 0,
    outcome: ms >= REVEAL_OUTCOME_MS,
    /** Time since the result landed. */
    age: Math.max(0, ms - REVEAL_OUTCOME_MS),
  };
}

/**
 * A number for `DrinkCard` that names this game: the same on every seat and refresh, different on a rematch. Built from
 * the dealt pairs, because a running party game never sends its seed. The room's path is added by `DrinkCard` itself.
 */
export function syncGameKey(pairs: { id: string }[]): number {
  let h = 2166136261;
  for (const ch of pairs.map((p) => p.id).join("|")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** Keeps the scope at 60fps, and drops it to 30 for good once frames keep running long on a slower phone. */
export function createPacer(longMs = 24, strikesToSlow = 30, slowMs = 31) {
  let last = 0, lastDraw = 0, strikes = 0, isSlow = false;
  return {
    slow: () => isSlow,
    shouldDraw(now: number) {
      const dt = now - last;
      last = now;
      // A very long gap is a pause (a hidden tab, a scroll stall), not a slow phone.
      if (dt > 0 && dt < 250) strikes = dt > longMs ? strikes + 1 : Math.max(0, strikes - 1);
      if (strikes >= strikesToSlow) isSlow = true;
      if (isSlow && now - lastDraw < slowMs) return false;
      lastDraw = now;
      return true;
    },
  };
}
