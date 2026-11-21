import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSaver, SAVE_DEBOUNCE_MS, SAVES_PER_SECOND } from "./npatSaver";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { vi.useRealTimers(); });

/** A send that records when each field went and always saves; `changed` says which fields have something new. */
function rig(fields = 4) {
  const sent: { i: number; at: number }[] = [];
  const dirty = new Set<number>();
  const send = (i: number) => {
    if (!dirty.has(i)) return null;
    dirty.delete(i);
    sent.push({ i, at: Date.now() });
    return Promise.resolve(true);
  };
  const saver = makeSaver(fields, send);
  const type = (i: number) => { dirty.add(i); saver.changed(i); };
  return { sent, saver, type };
}

describe("makeSaver", () => {
  it("sends a field once typing in it stops for the debounce", () => {
    const { sent, type } = rig();
    type(0);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    type(0); // still typing: the debounce starts again
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([{ i: 0, at: 2 * SAVE_DEBOUNCE_MS - 1 }]);
  });

  it("typing never loses more than the debounce: whatever was typed is out 300 ms after the last key", () => {
    const { sent, type } = rig();
    for (let k = 0; k < 20; k++) { type(1); vi.advanceTimersByTime(50); }
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 50);
    expect(sent.map((x) => x.i)).toEqual([1]);
  });

  it("fast typing hopping across fields never sends more than the cap in any second", () => {
    const { sent, type } = rig(6);
    // A key every 20 ms, rotating through 6 fields with a pause: worst case for per-field debounces all firing.
    for (let k = 0; k < 400; k++) {
      type(k % 6);
      vi.advanceTimersByTime(k % 6 === 5 ? SAVE_DEBOUNCE_MS + 10 : 20);
    }
    vi.advanceTimersByTime(5000);
    expect(sent.length).toBeGreaterThan(20);
    for (const s of sent) expect(sent.filter((x) => x.at > s.at - 1000 && x.at <= s.at).length).toBeLessThanOrEqual(SAVES_PER_SECOND);
    expect(SAVES_PER_SECOND).toBeLessThan(10); // the server's limit per seat
  });

  it("flush sends every changed field now, skips the debounce, and still keeps to the cap", async () => {
    const { sent, saver, type } = rig(6);
    for (let i = 0; i < 6; i++) type(i);
    const ok = saver.flush();
    expect(sent.map((x) => x.i)).toEqual([0, 1, 2, 3, 4, 5]);
    await expect(ok).resolves.toBe(true);
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(sent).toHaveLength(6); // the cancelled debounces don't send again
    // A second burst inside the same second waits for room under the cap.
    for (let i = 0; i < 6; i++) type(i);
    const later = saver.flush();
    expect(sent).toHaveLength(SAVES_PER_SECOND);
    vi.advanceTimersByTime(1000);
    await expect(later).resolves.toBe(true);
    expect(sent).toHaveLength(12);
  });

  it("flush resolves false when a send fails, and stop drops what is waiting", async () => {
    const saver = makeSaver(2, (i) => (i === 1 ? Promise.resolve(false) : null));
    await expect(saver.flush()).resolves.toBe(false);
    const calls: number[] = [];
    const s2 = makeSaver(1, (i) => { calls.push(i); return null; });
    s2.changed(0);
    s2.stop();
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2);
    expect(calls).toEqual([]);
  });
});
