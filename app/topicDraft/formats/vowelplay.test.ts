import { describe, expect, it } from "vitest";
import { DUEL_WORDS, GUESS_MS, REVEAL_ALL_MS, REVEAL_MS, giveUp, guess, init, redactFor, speedPoints, tick, winners, type VPState, type VPMode } from "./vowelplay";
import { VOWEL_TOPICS, wordsFor } from "../party/vowelWords";
import { toPuzzle } from "../party/vowelText";

const topic = VOWEL_TOPICS[0]!.id;
const T0 = 1_000;
const mk = (mode: VPMode = "first", players = ["Ann", "Bo", "Cy"], count = 3): VPState =>
  init({ players, topic, mode, answer: "type", count, seed: 7, now: T0, drinking: mode === "all" });
const cur = (s: VPState) => s.words[s.round]!;

describe("speedPoints", () => {
  it("is 100 early, falls evenly, floors at 10", () => {
    expect(speedPoints(0)).toBe(100);
    expect(speedPoints(2000)).toBe(100);
    expect(speedPoints(11000)).toBe(55);
    expect(speedPoints(20000)).toBe(10);
    expect(speedPoints(99999)).toBe(10);
  });
});

describe("init", () => {
  it("uses unseen names first, then avoid, never repeats, fixes total", () => {
    const names = wordsFor(topic);
    const avoid = names.slice(0, names.length - 3);
    const s = init({ players: ["A", "B"], topic, mode: "first", answer: "type", count: 10, avoid, seed: 1, now: T0 });
    expect(s.total).toBe(10);
    expect(s.words).toHaveLength(10);
    const got = s.words.map((w) => w.name);
    expect(new Set(got).size).toBe(10);
    const fresh = names.filter((n) => !avoid.includes(n));
    for (const n of fresh) expect(got).toContain(n);
    expect(s.words.every((w) => w.puzzle === toPuzzle(w.name))).toBe(true);
  });
  it("duel plays DUEL_WORDS", () => {
    expect(init({ players: ["A", "B"], topic, mode: "duel", answer: "type", count: 10, seed: 1, now: T0 }).total).toBe(DUEL_WORDS);
  });
  it("accepts any name sharing the puzzle", () => {
    const s0 = mk("first", ["A", "B"]);
    const s = { ...s0, words: [{ name: "Bat", puzzle: "BT", also: ["Bot"] }, ...s0.words.slice(1)] };
    expect(guess(s, "A", "bot", T0 + 10)).not.toBe(s);
    expect(guess(s, "A", "bat", T0 + 10)).not.toBe(s);
  });
});

describe("first", () => {
  it("right guess scores and reveals; wrong returns same object", () => {
    const s = mk();
    expect(guess(s, "Ann", "zzzzqx", T0 + 5)).toBe(s);
    const r = guess(s, "Bo", cur(s).name, T0 + 5);
    expect(r.points.Bo).toBe(1);
    expect(r.phase).toBe("reveal");
    expect(r.history[0]!.winner).toBe("Bo");
    expect(guess(r, "Ann", cur(s).name, T0 + 6)).toBe(r);
  });
  it("times out, advances and finishes", () => {
    let s = mk();
    expect(tick(s, T0 + GUESS_MS - 1)).toBe(s);
    s = tick(s, T0 + GUESS_MS);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.winner).toBeNull();
    let now = T0 + GUESS_MS;
    expect(tick(s, now + REVEAL_MS - 1)).toBe(s);
    for (let i = 0; i < 2; i++) {
      s = tick(s, (now += REVEAL_MS));
      expect(s.round).toBe(i + 1);
      expect(s.phase).toBe("guess");
      s = tick(s, (now += GUESS_MS));
    }
    expect(s.done).toBe(false);
    s = tick(s, now + REVEAL_MS);
    expect(s.done).toBe(true);
  });
  it("ignores strangers and giving up", () => {
    const s = mk();
    expect(guess(s, "Zed", cur(s).name, T0 + 1)).toBe(s);
    expect(giveUp(s, "Ann", T0 + 1)).toBe(s);
  });
  it("a player named constructor can score", () => {
    const s = mk("first", ["constructor", "Bo"]);
    const r = guess(s, "constructor", cur(s).name, T0 + 1);
    expect(r.points.constructor).toBe(1);
    expect(winners(r)).toEqual(["constructor"]);
  });
});

describe("all", () => {
  it("scores by speed, stays open, ends when all done", () => {
    const s = mk("all");
    const a = guess(s, "Ann", cur(s).name, T0 + 1000);
    expect(a.points.Ann).toBe(100);
    expect(a.gotMs.Ann).toBe(1000);
    expect(a.phase).toBe("guess");
    expect(guess(a, "Ann", cur(s).name, T0 + 2000)).toBe(a);
    const b = giveUp(a, "Bo", T0 + 3000);
    expect(b.gaveUp).toEqual(["Bo"]);
    expect(b.phase).toBe("guess");
    const c = guess(b, "Cy", cur(s).name, T0 + 11000 + 0);
    expect(c.phase).toBe("reveal");
    expect(c.points.Cy).toBe(speedPoints(11000));
    expect(c.history[0]!.winner).toBe("Ann");
    expect(tick(c, c.phaseAt + REVEAL_MS)).toBe(c);
    expect(tick(c, c.phaseAt + REVEAL_ALL_MS).round).toBe(1);
  });
  it("solo reveal uses REVEAL_MS", () => {
    const s = mk("all", ["Ann"]);
    const r = guess(s, "Ann", cur(s).name, T0 + 100);
    expect(r.phase).toBe("reveal");
    expect(tick(r, r.phaseAt + REVEAL_MS).round).toBe(1);
  });
  it("drinks: slowest correct and each miss get a sip", () => {
    let s = mk("all", ["Ann", "Bo", "Cy", "Di"]);
    s = guess(s, "Ann", cur(s).name, T0 + 1000);
    s = guess(s, "Bo", cur(s).name, T0 + 5000);
    s = giveUp(s, "Cy", T0 + 6000);
    expect(s.drinks!.calls).toHaveLength(0);
    s = tick(s, T0 + GUESS_MS);
    expect(s.phase).toBe("reveal");
    const to = s.drinks!.calls.filter((c) => c.sips === 1).map((c) => c.to).sort();
    expect(to).toEqual(["Bo", "Cy", "Di"]);
  });
  it("no slowest drink when only one got it", () => {
    let s = mk("all", ["Ann", "Bo"]);
    s = guess(s, "Ann", cur(s).name, T0 + 1000);
    s = giveUp(s, "Bo", T0 + 2000);
    expect(s.drinks!.calls.map((c) => c.to)).toEqual(["Bo"]);
  });
  it("first mode has no drinks", () => {
    expect(mk("first").drinks).toBeUndefined();
  });
});

describe("winners", () => {
  it("most points, ties share", () => {
    const s = { ...mk(), points: { Ann: 2, Bo: 2, Cy: 1 } };
    expect(winners(s)).toEqual(["Ann", "Bo"]);
  });
});

describe("redactFor", () => {
  it("hides current and later words while guessing", () => {
    let s = mk("first", ["Ann", "Bo"], 3);
    s = guess(s, "Ann", cur(s).name, T0 + 1);
    s = tick(s, s.phaseAt + REVEAL_MS); // round 1, guess
    const r = redactFor(s, "Ann");
    expect(r.words).toHaveLength(2);
    expect(r.words[1]!.name).toBe("");
    expect(r.words[1]!.also).toEqual([]);
    expect(r.words[1]!.puzzle).toBe(s.words[1]!.puzzle);
    expect(r.words[0]!.name).toBe(s.words[0]!.name);
    expect(r.total).toBe(3);
    expect(r.seed).toBe(0);
    expect(redactFor(s, null).words[1]!.name).toBe("");
    expect(JSON.stringify(redactFor(s, "Bo"))).not.toContain(s.words[1]!.name);
    expect(JSON.stringify(redactFor(s, "Bo"))).not.toContain(s.words[2]!.name);
  });
  it("shows the name in reveal and everything when done", () => {
    let s = mk("first", ["Ann", "Bo"], 2);
    s = guess(s, "Ann", cur(s).name, T0 + 1);
    const r = redactFor(s, "Bo");
    expect(r.words).toHaveLength(1);
    expect(r.words[0]!.name).toBe(cur(s).name);
    s = tick(tick(s, s.phaseAt + REVEAL_MS), T0 + 99_000);
    s = tick(s, s.phaseAt + REVEAL_MS);
    expect(s.done).toBe(true);
    expect(redactFor(s, null).words).toEqual(s.words);
  });
});
