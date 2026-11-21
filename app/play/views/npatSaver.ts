// NPAT's answer saving on a phone: each field is sent a moment after typing stops in it, and never faster than the
// server takes answers. Pure timers, no React, so the rate can be tested.

/** A field is sent this long after the last keystroke in it. */
export const SAVE_DEBOUNCE_MS = 300;
/** Most sends in any one second. The server refuses an NPAT seat's 11th answer in a second, so this leaves room for jitter. */
export const SAVES_PER_SECOND = 8;

/** `send(i)` sends field `i` if it changed since it was last sent, resolving true once saved; null when there is nothing to send. */
export type Send = (i: number) => Promise<boolean> | null;

export type Saver = {
  /** Field `i` was typed in: it is sent once typing in it stops for the debounce. */
  changed(i: number): void;
  /** Every field now, ahead of any debounce, still within the rate. Resolves false if any send failed. */
  flush(): Promise<boolean>;
  /** Drops anything waiting. */
  stop(): void;
};

type Waiting = { i: number; done: ((ok: boolean) => void)[] };

export function makeSaver(fields: number, send: Send, o: { debounceMs?: number; perSecond?: number; now?: () => number } = {}): Saver {
  const debounceMs = o.debounceMs ?? SAVE_DEBOUNCE_MS;
  const perSecond = o.perSecond ?? SAVES_PER_SECOND;
  const now = o.now ?? Date.now;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const queue: Waiting[] = [];
  let log: number[] = [];
  let wake: ReturnType<typeof setTimeout> | null = null;

  const enqueue = (i: number, done?: (ok: boolean) => void) => {
    const w = queue.find((q) => q.i === i) ?? (queue.push({ i, done: [] }), queue[queue.length - 1]!);
    if (done) w.done.push(done);
  };

  const pump = () => {
    if (wake) return;
    while (queue.length) {
      const t = now();
      log = log.filter((at) => t - at < 1000);
      if (log.length >= perSecond) {
        wake = setTimeout(() => { wake = null; pump(); }, Math.max(1, log[0]! + 1000 - t));
        return;
      }
      const w = queue.shift()!;
      const p = send(w.i);
      if (!p) { for (const d of w.done) d(true); continue; }
      log.push(t);
      p.then((ok) => { for (const d of w.done) d(ok); }, () => { for (const d of w.done) d(false); });
    }
  };

  return {
    changed(i) {
      const old = timers.get(i);
      if (old) clearTimeout(old);
      timers.set(i, setTimeout(() => { timers.delete(i); enqueue(i); pump(); }, debounceMs));
    },
    flush() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      const all = Array.from({ length: fields }, (_, i) => new Promise<boolean>((res) => enqueue(i, res)));
      pump();
      return Promise.all(all).then((oks) => oks.every(Boolean));
    },
    stop() {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
      if (wake) clearTimeout(wake);
      wake = null;
      for (const w of queue.splice(0)) for (const d of w.done) d(false);
    },
  };
}
