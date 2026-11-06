import { describe, expect, it } from "vitest";
import { CLUE_MS, REVEAL_MS, TUNE_MS, bandPoints, clue, giver, init, lock, move, next, rankFor, redactFor, settle, tick, type InSyncState } from "./insync";
import { INSYNC_DECKS, insyncDeckOf } from "../party/insyncDecks";

const pairs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, left: `L${i}`, right: `R${i}` }));
const start = (players: string[], extra: Partial<Parameters<typeof init>[0]> = {}) =>
  init({ players, deck: "friends", pairs: pairs(10), rounds: Math.max(4, players.length), seed: 5, now: 0, ...extra });
/** Pin the hidden target so the scoring in a test is exact. */
const pin = (s: InSyncState, target: number): InSyncState => ({ ...s, target });
/** Gets a round through clue and tune with the marker at `at`, then every guesser locks. */
const play = (s: InSyncState, at: number, now = 1): InSyncState => {
  s = clue(s, giver(s), "a clue", now);
  const guessers = s.players.filter((p) => p !== giver(s));
  s = move(s, guessers[0]!, at, now);
  for (const g of guessers) s = lock(s, g, now);
  return s;
};

describe("in-sync scoring", () => {
  it("scores the bands exactly", () => {
    expect([bandPoints(50, 50), bandPoints(50, 53), bandPoints(50, 57), bandPoints(50, 62), bandPoints(50, 63)]).toEqual([4, 4, 3, 2, 0]);
    expect([bandPoints(50, 47), bandPoints(50, 43), bandPoints(50, 38), bandPoints(50, 37)]).toEqual([4, 3, 2, 0]);
  });

  it("ranks the group from Out of Sync up to Perfectly In-Sync", () => {
    expect(rankFor(0, 16)).toBe("Out of Sync");
    expect(rankFor(16, 16)).toBe("Perfectly In-Sync");
    expect(rankFor(0, 0)).toBe("Out of Sync");
    const ranks = [0, 3, 6, 9, 12, 15, 16].map((n) => rankFor(n, 16));
    expect(new Set(ranks).size).toBeGreaterThanOrEqual(5);
  });
});

describe("in-sync rounds", () => {
  it("plays with 2 players: one clue, one guesser, one lock decides", () => {
    let s = pin(start(["A", "B"]), 50);
    expect(s.phase).toBe("clue");
    expect(giver(s)).toBe("A");
    s = clue(s, "A", "  Sunday roast  ", 1);
    expect(s.phase).toBe("tune");
    expect(s.clue).toBe("Sunday roast");
    s = move(s, "B", 52, 2);
    expect(s.marker).toBe(52);
    expect(s.markerBy).toBe("B");
    s = lock(s, "B", 3);
    expect(s.phase).toBe("reveal");
    expect(s.score).toBe(4);
    expect(s.maxScore).toBe(4);
    expect(s.history).toEqual([{ pair: s.pairs[0], clue: "Sunday roast", target: 50, marker: 52, points: 4, giver: "A" }]);
  });

  it("gives at least 4 rounds and rotates the clue giver", () => {
    let s = start(["A", "B"]);
    expect(s.pairs).toHaveLength(4);
    const givers: string[] = [];
    for (let i = 0; i < 4; i++) {
      givers.push(giver(s));
      s = play(pin(s, 50), 50);
      s = next(s, 2);
    }
    expect(givers).toEqual(["A", "B", "A", "B"]);
    expect(s.done).toBe(true);
    expect(s.score).toBe(16);
  });

  it("runs one round per player on a big table", () => {
    const s = start(["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"]);
    expect(s.pairs).toHaveLength(10); // only 10 pairs in this test deck
    expect(start(["A", "B", "C", "D", "E", "F"], { pairs: pairs(30) }).pairs).toHaveLength(6);
  });

  it("needs more than half the guessers to lock", () => {
    let s = pin(start(["A", "B", "C", "D", "E"]), 50);
    s = clue(s, "A", "hello", 1);
    s = lock(s, "B", 2);
    s = lock(s, "C", 2);
    expect(s.phase).toBe("tune");
    expect(s.locks).toEqual(["B", "C"]);
    expect(lock(s, "B", 3)).toBe(s); // a second lock from the same player does nothing
    s = lock(s, "D", 3);
    expect(s.phase).toBe("reveal");
  });

  it("moving the marker takes back locks, so a lock always means this spot", () => {
    let s = pin(start(["A", "B", "C", "D", "E"]), 50);
    s = clue(s, "A", "hello", 1);
    s = lock(s, "B", 2);
    s = move(s, "C", 80, 3);
    expect(s.locks).toEqual([]);
    expect(move(s, "C", 80, 4)).toBe(s); // same spot again changes nothing
  });

  it("rejects moves from the giver, NaN, out-of-range clamps to 0-100, ignores outside tune", () => {
    const clueing = start(["A", "B", "C"]);
    expect(move(clueing, "B", 10, 0)).toBe(clueing);
    const tuning = clue(clueing, "A", "x", 0);
    expect(move(tuning, giver(tuning), 10, 0)).toBe(tuning);
    expect(move(tuning, "B", NaN, 0)).toBe(tuning);
    expect(move(tuning, "B", 500, 0).marker).toBe(100);
    expect(move(tuning, "B", -20, 0).marker).toBe(0);
    expect(move(tuning, "Zed", 20, 0)).toBe(tuning);
    expect(move(tuning, "B", 33.6, 0).marker).toBe(34);
    for (const bad of [null, "", "40", [], false, true, undefined, {}, Infinity, -Infinity]) expect(move(tuning, "B", bad as any, 0), String(bad)).toBe(tuning);
  });

  it("ignores clues from the wrong player, empty clues, repeats and the wrong phase", () => {
    const s = start(["A", "B", "C"]);
    expect(clue(s, "B", "nope", 0)).toBe(s);
    expect(clue(s, "A", "   ", 0)).toBe(s);
    const tuning = clue(s, "A", "ok", 0);
    expect(clue(tuning, "A", "again", 0)).toBe(tuning);
    expect(lock(s, "B", 0)).toBe(s); // cannot lock before a clue
    expect(lock(tuning, "A", 0)).toBe(tuning); // the giver cannot lock
    expect(next(tuning, 0)).toBe(tuning);
    expect(clue(tuning, "A", "x".repeat(500), 0)).toBe(tuning);
    expect(clue(s, "A", "x".repeat(500), 0).clue.length).toBe(40);
  });

  it("skips the round with no score when the giver gives no clue before the timer", () => {
    let s = start(["A", "B", "C"]);
    expect(tick(s, CLUE_MS)).toBe(s);
    s = tick(s, CLUE_MS + 1);
    expect(s.round).toBe(1);
    expect(s.phase).toBe("clue");
    expect(giver(s)).toBe("B");
    expect(s.score).toBe(0);
    expect(s.maxScore).toBe(0);
    expect(s.history).toHaveLength(1);
    expect(s.history[0]).toMatchObject({ skipped: true, points: 0, giver: "A", clue: "" });
  });

  it("finishes if the last round is skipped", () => {
    let s = start(["A", "B"], { rounds: 4, pairs: pairs(4) });
    for (let i = 0; i < 4; i++) s = tick(s, s.phaseAt + CLUE_MS + 1);
    expect(s.done).toBe(true);
    expect(s.history.every((h) => h.skipped)).toBe(true);
  });

  it("locks on the timer during tune when guessers have left", () => {
    let s = pin(start(["A", "B", "C", "D"]), 50);
    s = clue(s, "A", "hi", 1000);
    s = move(s, "B", 48, 1000);
    expect(tick(s, 1000 + TUNE_MS)).toBe(s);
    s = tick(s, 1000 + TUNE_MS + 1);
    expect(s.phase).toBe("reveal");
    expect(s.score).toBe(4);
  });

  it("moves on from a reveal by itself or when anyone taps next, and finishes after the last round", () => {
    let s = pin(start(["A", "B"]), 50);
    s = play(s, 90, 10);
    expect(s.score).toBe(0);
    expect(tick(s, 10 + REVEAL_MS)).toBe(s);
    const auto = tick(s, 10 + REVEAL_MS + 1);
    expect(auto.round).toBe(1);
    expect(auto.phase).toBe("clue");
    expect(auto.marker).toBe(50);
    expect(auto.locks).toEqual([]);
    expect(auto.clue).toBe("");
    expect(next(s, 11).round).toBe(1);
    let t = s;
    for (let i = 0; i < 4; i++) t = tick(play(pin(t.phase === "reveal" ? next(t, 20) : t, 50), 50, 21), 21 + REVEAL_MS + 1);
    expect(t.done).toBe(true);
    expect(tick(t, 1e9)).toBe(t);
    expect(move(t, "B", 3, 0)).toBe(t);
  });
});

describe("in-sync secrecy", () => {
  it("hides target and clue setup from guessers until reveal; the giver sees it", () => {
    let s = pin(start(["A", "B", "C"]), 61);
    expect(redactFor(s, "A").target).toBe(61);
    expect(redactFor(s, "B").target).toBe(-1);
    expect(redactFor(s, null).target).toBe(-1);
    s = clue(s, "A", "a clue", 1);
    expect(redactFor(s, "B").target).toBe(-1);
    expect(redactFor(s, "B").clue).toBe("a clue");
    expect(redactFor(s, "A").target).toBe(61);
    s = lock(lock(s, "B", 2), "C", 2);
    expect(s.phase).toBe("reveal");
    expect(redactFor(s, "B").target).toBe(61);
  });

  it("does not leak the seed or an in-progress target through the history", () => {
    const s = pin(start(["A", "B", "C"]), 61);
    const r = redactFor(s, "B");
    expect(r.seed).toBe(0);
    expect(r.target).toBe(-1);
    expect(r.history).toEqual([]);
    expect(r.marker).toBe(50);
    expect(redactFor(s, "A").seed).toBe(0);
  });

  it("shows everything once the game is done", () => {
    let s = start(["A", "B"], { pairs: pairs(4) });
    for (let i = 0; i < 4; i++) s = play(pin(s.phase === "reveal" ? next(s, 1) : s, 50), 50, 2);
    s = next(s, 3);
    expect(s.done).toBe(true);
    expect(redactFor(s, "B").target).toBe(s.target);
  });
});

describe("in-sync decks", () => {
  it("every deck has enough original pairs: friends 60+, topics 20+, no duplicate ids", () => {
    expect(INSYNC_DECKS.map((d) => d.id)).toEqual(["friends", "food", "films", "shows", "music", "books", "geography", "history", "heroes", "anime", "videogames", "nba", "football"]);
    const all = new Set<string>();
    for (const d of INSYNC_DECKS) {
      expect(d.pairs.length, d.id).toBeGreaterThanOrEqual(d.id === "friends" ? 60 : 20);
      expect(d.title && d.blurb, d.id).toBeTruthy();
      const lines = new Set<string>();
      for (const p of d.pairs) {
        expect(all.has(p.id), p.id).toBe(false);
        all.add(p.id);
        expect(p.left.trim() && p.right.trim()).toBeTruthy();
        expect(p.left.toLowerCase()).not.toBe(p.right.toLowerCase());
        expect(p.left.length).toBeLessThanOrEqual(40);
        expect(p.right.length).toBeLessThanOrEqual(40);
        const line = `${p.left}|${p.right}`.toLowerCase();
        expect(lines.has(line), line).toBe(false);
        lines.add(line);
      }
    }
    expect(insyncDeckOf("food")?.title).toBeTruthy();
    expect(insyncDeckOf("nope")).toBeUndefined();
  });

  it("never uses the other game's name in player-visible copy", () => {
    expect(JSON.stringify(INSYNC_DECKS).toLowerCase()).not.toContain("wavelength");
  });

  it("reuses seen pairs when unseen pairs run short", () => {
    const deck = insyncDeckOf("food")!;
    const allSeen = init({ players: ["A", "B", "C"], deck: "food", pairs: deck.pairs, rounds: 6, avoid: deck.pairs.map((p) => p.id), seed: 3, now: 0 });
    expect(allSeen.pairs).toHaveLength(6);
    expect(allSeen.done).toBe(false);
    const mostSeen = init({ players: ["A", "B", "C"], deck: "food", pairs: deck.pairs, rounds: 6, avoid: deck.pairs.slice(2).map((p) => p.id), seed: 3, now: 0 });
    expect(mostSeen.pairs.slice(0, 2).map((p) => p.id).sort()).toEqual(deck.pairs.slice(0, 2).map((p) => p.id).sort());
    expect(new Set(mostSeen.pairs.map((p) => p.id)).size).toBe(6);
  });
});

describe("in-sync drinking", () => {
  it("is off unless asked", () => {
    expect(start(["A", "B"]).drinks).toBeUndefined();
    expect(play(pin(start(["A", "B"]), 50), 99).drinks).toBeUndefined();
  });

  it("drinking: 2 sips for the giver on a miss, a group toast on a bullseye", () => {
    let s = play(pin(start(["A", "B", "C"], { drinking: true }), 10), 90);
    expect(s.score).toBe(0);
    expect(s.drinks!.calls).toEqual([{ to: "A", sips: 2, reason: expect.any(String) }]);
    s = play(pin(next(s, 1), 50), 52);
    expect(s.score).toBe(4);
    expect(s.drinks!.calls).toEqual([{ to: "all", sips: 1, reason: expect.any(String) }]);
    expect(s.drinks!.totals).toEqual({ A: 3, B: 1, C: 1 });
    s = play(pin(next(s, 1), 50), 65); // 15 away: a miss, giver is C
    expect(s.drinks!.calls.map((c) => [c.to, c.sips])).toEqual([["C", 2]]);
  });

  it("calls nothing on the in-between bands or a skipped round", () => {
    let s = play(pin(start(["A", "B", "C"], { drinking: true }), 50), 56);
    expect(s.score).toBe(3);
    expect(s.drinks!.calls).toEqual([]);
    s = tick(next(s, 1), 1 + CLUE_MS + 100);
    expect(s.history.at(-1)?.skipped).toBe(true);
    expect(s.drinks!.calls).toEqual([]);
  });
});

describe("in-sync when someone leaves", () => {
  const five = ["A", "B", "C", "D", "E"];
  const tuning = () => clue(start(five), "A", "a clue", 1); // A gives the clue

  it("bases the majority on the guessers still here", () => {
    let s = tuning();
    s = lock(lock(s, "B", 2), "C", 2);
    expect(s.phase).toBe("tune"); // 2 of 4 is not more than half
    expect(settle(s, [], 3)).toBe(s);
    expect(settle(s, ["D", "E"], 3).phase).toBe("reveal");
  });

  it("needs a real majority of those here, and a departed guesser's lock doesn't count", () => {
    const one = lock(tuning(), "B", 2);
    expect(settle(one, ["D", "E"], 3)).toBe(one); // 1 of 2
    const gone = lock(lock(tuning(), "B", 2), "C", 2);
    expect(settle(gone, ["B", "C"], 3)).toBe(gone); // the two locks left with them; D and E haven't locked
  });

  it("reveals where the marker is when no guesser is left", () => {
    expect(settle(tuning(), ["B", "C", "D", "E"], 3).phase).toBe("reveal");
  });

  it("skips a departed giver at once, scoring nothing", () => {
    const s = start(five);
    expect(settle(s, ["C"], 1)).toBe(s);
    const moved = settle(s, ["A"], 1);
    expect(giver(moved)).toBe("B");
    expect(moved.round).toBe(1);
    expect(moved.phase).toBe("clue");
    expect(moved.history).toHaveLength(1);
    expect(moved.history[0]).toMatchObject({ giver: "A", skipped: true, points: 0 });
    expect(moved.maxScore).toBe(0);
  });

  it("skips several departed givers in one go, and can finish the game", () => {
    const moved = settle(start(five), ["A", "B", "C"], 1);
    expect(giver(moved)).toBe("D");
    expect(moved.round).toBe(3);
    const over = settle(start(["A", "B", "C", "D"]), ["A", "B", "C", "D"], 1);
    expect(over.done).toBe(true);
  });

  it("a giver who left after giving the clue doesn't stop the tuning", () => {
    const s = lock(lock(lock(tuning(), "B", 2), "C", 2), "D", 2);
    expect(s.phase).toBe("reveal");
    const t = tuning();
    expect(settle(t, ["A"], 3)).toBe(t);
  });
});
