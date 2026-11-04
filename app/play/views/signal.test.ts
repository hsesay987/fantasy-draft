import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bandPoints } from "../../topicDraft/formats/insync";
import { createPacer, createThrottle, freqOf, locksNeeded, posFromPointer, revealAt, SCORE_BANDS, shownMarker, syncGameKey, verdictFor } from "./signal";

describe("createThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends the first value at once and at most one send per window", () => {
    const sent: number[] = [];
    const t = createThrottle<number>((v) => sent.push(v), 200);
    t.push(1);
    t.push(2);
    t.push(3);
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(199);
    expect(sent).toEqual([1]);
    vi.advanceTimersByTime(1);
    expect(sent).toEqual([1, 3]); // only the newest waiting value goes
    t.push(4);
    expect(sent).toEqual([1, 3]); // the window restarted when 3 was sent
    vi.advanceTimersByTime(200);
    expect(sent).toEqual([1, 3, 4]);
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([1, 3, 4]);
  });

  it("never exceeds one send per 200ms over a long fast drag", () => {
    const at: number[] = [];
    const t = createThrottle<number>(() => at.push(Date.now()), 200);
    for (let i = 0; i < 300; i++) {
      t.push(i);
      vi.advanceTimersByTime(7);
    }
    vi.advanceTimersByTime(400);
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBeGreaterThanOrEqual(200);
  });

  it("sends right away again after a quiet window", () => {
    const sent: number[] = [];
    const t = createThrottle<number>((v) => sent.push(v), 200);
    t.push(1);
    vi.advanceTimersByTime(500);
    t.push(2);
    expect(sent).toEqual([1, 2]);
  });

  it("settle waits for a waiting value, so a lock can never be undone by its own late move", () => {
    const log: string[] = [];
    const t = createThrottle<number>((v) => log.push(`move ${v}`), 200);
    t.push(1);
    t.push(2);
    t.settle(() => log.push("lock"));
    expect(log).toEqual(["move 1"]);
    vi.advanceTimersByTime(200);
    expect(log).toEqual(["move 1", "move 2", "lock"]);
  });

  it("settle runs at once when nothing is waiting", () => {
    const log: string[] = [];
    const t = createThrottle<number>((v) => log.push(`move ${v}`), 200);
    t.settle(() => log.push("lock"));
    expect(log).toEqual(["lock"]);
  });

  it("cancel drops a waiting value and anything settling on it", () => {
    const log: string[] = [];
    const t = createThrottle<number>((v) => log.push(`move ${v}`), 200);
    t.push(1);
    t.push(2);
    t.settle(() => log.push("lock"));
    t.cancel();
    vi.advanceTimersByTime(1000);
    expect(log).toEqual(["move 1"]);
  });
});

describe("shownMarker", () => {
  it("shows the server's marker when this seat is not touching it", () => {
    expect(shownMarker(40, null, 1000)).toBe(40);
  });
  it("shows the finger's position for the whole drag, whatever the server echoes", () => {
    expect(shownMarker(40, { pos: 70, at: 0, dragging: true }, 99_000)).toBe(70);
  });
  it("holds the released position until the server catches up, then follows the server", () => {
    expect(shownMarker(40, { pos: 70, at: 1000, dragging: false }, 1200)).toBe(70);
    expect(shownMarker(70, { pos: 70, at: 1000, dragging: false }, 1200)).toBe(70);
    expect(shownMarker(40, { pos: 70, at: 1000, dragging: false }, 9000)).toBe(40); // someone else moved it, or the send failed
  });
});

describe("locksNeeded", () => {
  it("is more than half of the guessers, and one guesser decides alone", () => {
    expect([1, 2, 3, 4, 5, 11].map(locksNeeded)).toEqual([1, 2, 2, 3, 3, 6]);
  });
});

describe("score bands", () => {
  it("draws exactly the bands the engine scores", () => {
    for (const { gap, points } of SCORE_BANDS) {
      expect(bandPoints(50, 50 + gap)).toBe(points);
      expect(bandPoints(50, 50 + gap + 1)).toBeLessThan(points);
    }
    expect(bandPoints(50, 50 + SCORE_BANDS[0]!.gap + 1)).toBe(0);
  });
  it("names every result", () => {
    expect([4, 3, 2, 0].map((p) => verdictFor(p as 0 | 2 | 3 | 4))).toEqual(["Bullseye", "Close", "Near", "Static"]);
  });
});

describe("posFromPointer", () => {
  it("maps the scale's ends to 0 and 100, inside the canvas's side margins", () => {
    expect(posFromPointer(110, 100, 200, 0.05)).toBe(0);
    expect(posFromPointer(290, 100, 200, 0.05)).toBe(100);
    expect(posFromPointer(200, 100, 200, 0.05)).toBe(50);
  });
  it("clamps a drag past either end and survives a zero-width box", () => {
    expect(posFromPointer(-500, 100, 200, 0.05)).toBe(0);
    expect(posFromPointer(5000, 100, 200, 0.05)).toBe(100);
    expect(posFromPointer(5, 0, 0, 0)).toBe(0);
  });
});

describe("freqOf", () => {
  it("shifts with the position, so dragging visibly changes the wave", () => {
    expect(freqOf(100)).toBeGreaterThan(freqOf(0));
    expect(freqOf(50)).toBeGreaterThan(freqOf(49));
  });
});

describe("revealAt", () => {
  it("starts scrambled and unlocked, with the static not yet cleared", () => {
    const r = revealAt(0, 4);
    expect(r.wipe).toBe(0);
    expect(r.scramble).toBe(1);
    expect(r.lock).toBe(0);
    expect(r.outcome).toBe(false);
  });
  it("a bullseye ends fully locked, and only a bullseye does", () => {
    expect(revealAt(9000, 4).lock).toBe(1);
    expect(revealAt(9000, 3).lock).toBeLessThan(1);
    expect(revealAt(9000, 2).lock).toBeLessThan(revealAt(9000, 3).lock);
    expect(revealAt(9000, 0).lock).toBe(0);
  });
  it("only a miss goes flat", () => {
    expect(revealAt(9000, 0).flat).toBe(1);
    for (const p of [2, 3, 4] as const) expect(revealAt(9000, p).flat).toBe(0);
  });
  it("clears the static before the waves resolve, and shows the outcome last", () => {
    const early = revealAt(500, 4);
    expect(early.wipe).toBeGreaterThan(0);
    expect(early.scramble).toBe(1);
    const late = revealAt(9000, 4);
    expect(late).toMatchObject({ wipe: 1, scramble: 0, bands: 1, outcome: true });
  });
});

describe("syncGameKey", () => {
  const pairs = (...ids: string[]) => ids.map((id) => ({ id }));
  it("is the same on every seat and every refresh of one game", () => {
    expect(syncGameKey(pairs("a", "b"))).toBe(syncGameKey(pairs("a", "b")));
  });
  it("changes between rematches, so sip cards are not treated as already seen", () => {
    expect(syncGameKey(pairs("a", "b"))).not.toBe(syncGameKey(pairs("c", "d")));
    expect(syncGameKey(pairs("a", "b"))).not.toBe(syncGameKey(pairs("b", "a")));
  });
});

describe("createPacer", () => {
  it("draws every frame while frames are quick", () => {
    const p = createPacer();
    for (let i = 1; i <= 200; i++) expect(p.shouldDraw(i * 16.7)).toBe(true);
    expect(p.slow()).toBe(false);
  });
  it("drops to about 30fps once frames keep running long", () => {
    const p = createPacer();
    let now = 0;
    for (let i = 0; i < 40; i++) p.shouldDraw((now += 30));
    expect(p.slow()).toBe(true);
    let drawn = 0;
    for (let i = 0; i < 60; i++) if (p.shouldDraw((now += 1000 / 60))) drawn++;
    expect(drawn).toBeLessThanOrEqual(31);
    expect(drawn).toBeGreaterThanOrEqual(29);
  });
  it("does not count a long pause, such as a hidden tab, as a slow frame", () => {
    const p = createPacer();
    let now = 0;
    for (let i = 0; i < 40; i++) p.shouldDraw((now += 5000));
    expect(p.slow()).toBe(false);
  });
});
