import { describe, expect, it } from "vitest";
import * as D from "./dodge";
import { ANSWER_MS, JUDGE_MS, REVEAL_MS, WRITE_GRACE_MS } from "../dodge/rules";

const P = ["Ann", "Ben", "Cat", "Dan"];
const CATS = ["Pizza toppings", "Fruits", "Colours", "Pets", "Sports", "Jobs", "Shapes", "Birds", "Weather", "Toys", "Trees", "Flowers"];
const start = (o: Partial<Parameters<typeof D.init>[0]> = {}) => D.init({ players: P, decks: ["food"], categories: CATS, laps: 1, seed: 7, now: 0, ...o });

/** Everyone types and locks; the chosen player (round 0: Ann) first. */
function play(s: D.DodgeState, said: Record<string, string>, now = 1000): D.DodgeState {
  let t = s;
  for (const [p, text] of Object.entries(said)) t = D.answer(t, p, text, now);
  for (const p of t.players) t = D.lock(t, p, now);
  return t;
}

describe("init", () => {
  it("deals one category per player per lap, from the given list", () => {
    const s = start({ laps: 2 });
    expect(s.categories).toHaveLength(8);
    for (const c of s.categories) expect(CATS).toContain(c);
    expect(s.phase).toBe("answer");
    expect(D.chosen(s)).toBe("Ann");
    expect(s.points).toEqual({ Ann: 0, Ben: 0, Cat: 0, Dan: 0 });
  });
  it("deals unseen categories first", () => {
    const avoid = CATS.slice(0, 8).map((c) => `dg:${c.toLowerCase()}`);
    const s = start({ avoid });
    expect(s.categories.every((c) => CATS.slice(8).includes(c))).toBe(true);
  });
  it("repeats categories when the decks run short", () => {
    const s = start({ categories: ["Fruits", "Pets"], laps: 3 });
    expect(s.categories).toHaveLength(12);
  });
  it("turns drinking on only when asked", () => {
    expect(start().drinks).toBeUndefined();
    expect(start({ drinking: true }).drinks).toBeDefined();
  });
});

describe("answering", () => {
  it("saves and replaces answers, refusing anything too long or after locking", () => {
    let s = start();
    s = D.answer(s, "Ben", "ham", 100);
    s = D.answer(s, "Ben", "cheese", 200);
    expect(s.typed.Ben).toBe("cheese");
    expect(D.answer(s, "Ben", "x".repeat(41), 300)).toBe(s);
    s = D.lock(s, "Ben", 300);
    expect(D.answer(s, "Ben", "olives", 400)).toBe(s);
    expect(D.answer(s, "Zed", "olives", 400)).toBe(s);
  });
  it("refuses answers after the clock and its grace", () => {
    const s = start();
    expect(D.answer(s, "Ben", "ham", ANSWER_MS + WRITE_GRACE_MS)).toBe(s);
  });
  it("closes once everyone has locked", () => {
    const s = play(start(), { Ann: "pepperoni", Ben: "ham", Cat: "cheese", Dan: "olives" });
    expect(s.phase).toBe("reveal");
  });
  it("closes when the clock runs out", () => {
    let s = D.answer(start(), "Ann", "pepperoni", 100);
    s = D.tick(s, ANSWER_MS + WRITE_GRACE_MS);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.answers.Ann).toBe("pepperoni");
  });
});

describe("scoring", () => {
  it("pays the chosen player per matcher, takes one from each matcher and pays each dodger", () => {
    const s = play(start(), { Ann: "Pepperoni", Ben: "pepperoni", Cat: "the Pepperonis", Dan: "ham" });
    const r = s.history[0]!;
    expect(r.chosen).toBe("Ann");
    expect(r.status).toEqual({ Ann: "chosen", Ben: "match", Cat: "match", Dan: "dodge" });
    expect(r.gained).toEqual({ Ann: 2, Ben: -1, Cat: -1, Dan: 1 });
    expect(s.points).toEqual({ Ann: 2, Ben: -1, Cat: -1, Dan: 1 });
  });
  it("scores a blank 0 and never as a match", () => {
    const s = play(start(), { Ann: "pepperoni", Ben: "", Cat: "pepperoni" });
    const r = s.history[0]!;
    expect(r.status.Ben).toBe("blank");
    expect(r.status.Dan).toBe("blank");
    expect(r.gained).toEqual({ Ann: 1, Ben: 0, Cat: -1, Dan: 0 });
  });
  it("lets everyone who answered dodge a blank chosen player", () => {
    const s = play(start(), { Ann: "  ", Ben: "ham", Cat: "ham" });
    expect(s.history[0]!.gained).toEqual({ Ann: 0, Ben: 1, Cat: 1, Dan: 0 });
  });
  it("pours a sip for each matcher when drinking", () => {
    const s = play(start({ drinking: true }), { Ann: "ham", Ben: "ham", Cat: "olives", Dan: "Ham" });
    expect(s.drinks!.calls.map((c) => c.to).sort()).toEqual(["Ben", "Dan"]);
  });
});

describe("judge", () => {
  const judging = () => play(start(), { Ann: "pepperoni", Ben: "peperoni", Cat: "pepperoni", Dan: "ham" });
  it("sends close calls to the judge and hides answers meanwhile", () => {
    const s = judging();
    expect(s.phase).toBe("judge");
    expect(D.pendingPairs(s)).toEqual([{ player: "Ben", category: s.categories[0], chosen: "pepperoni", answer: "peperoni" }]);
    const v = D.redactFor(s, "Dan");
    expect(v.closing).toBeNull();
  });
  it("counts a judged match like an exact one", () => {
    const s = D.judged(judging(), [{ player: "Ben", same: true }], 2000);
    expect(s.phase).toBe("reveal");
    const r = s.history[0]!;
    expect(r.status.Ben).toBe("match");
    expect(r.judged).toEqual(["Ben"]);
    expect(r.gained.Ann).toBe(2);
  });
  it("counts a judged miss as a dodge", () => {
    const s = D.judged(judging(), [{ player: "Ben", same: false }], 2000);
    expect(s.history[0]!.status.Ben).toBe("dodge");
  });
  it("ignores verdicts for players not waiting", () => {
    const s = judging();
    const t = D.judged(s, [{ player: "Dan", same: true }], 2000);
    expect(t.phase).toBe("judge");
  });
  it("falls back to exact matches when the judge is slow", () => {
    const s = D.tick(judging(), 1000 + JUDGE_MS);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.status.Ben).toBe("dodge");
    expect(s.history[0]!.unchecked).toBe(true);
  });
  it("a host skip during the judge falls back too", () => {
    const s = D.next(judging(), 1500);
    expect(s.phase).toBe("reveal");
  });
});

describe("rounds", () => {
  it("rotates the chosen player and ends after the last lap", () => {
    let s = start();
    for (let i = 0; i < 4; i++) {
      expect(D.chosen(s)).toBe(P[i]);
      s = play(s, { [P[i]!]: "x" }, s.phaseAt + 100);
      s = D.tick(s, s.phaseAt + REVEAL_MS);
    }
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(4);
  });
  it("the host can end a reveal early", () => {
    const s = D.next(play(start(), { Ann: "x" }), 2000);
    expect(s.round).toBe(1);
    expect(s.phase).toBe("answer");
  });
});

describe("settle", () => {
  it("does not wait for players who left", () => {
    let s = start();
    for (const p of ["Ann", "Ben", "Cat"]) s = D.lock(D.answer(s, p, "ham", 100), p, 100);
    expect(s.phase).toBe("answer");
    s = D.settle(s, ["Dan"], 200);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.status.Dan).toBe("blank");
  });
  it("skips the round of a chosen player who left", () => {
    const s = D.settle(start(), ["Ann"], 100);
    expect(s.round).toBe(1);
    expect(D.chosen(s)).toBe("Ben");
  });
  it("numbers rounds without the skipped ones", () => {
    const s = D.settle(start(), ["Ann"], 100); // Ann's round is skipped, and she won't be chosen again
    expect(D.redactFor(s, "Ben")).toMatchObject({ round: 1, number: 1, total: 3 });
    const t = D.next(D.next(s, 200), 300);
    expect(D.redactFor(t, "Ben")).toMatchObject({ round: 2, number: 2, total: 3 });
  });
  it("returns the same state when nothing changed", () => {
    const s = start();
    expect(D.settle(s, [], 10)).toBe(s);
  });
});

describe("redactFor", () => {
  it("shows only your own typing and upcoming categories stay hidden", () => {
    let s = D.answer(start(), "Ben", "ham", 100);
    s = D.answer(s, "Cat", "olives", 100);
    const v = D.redactFor(s, "Ben");
    expect(v.typed).toEqual({ Ben: "ham" });
    expect(v.typedCount).toBe(2);
    expect(v.categories).toHaveLength(1);
    expect(v.total).toBe(4);
    expect(v.seed).toBe(0);
    expect(D.redactFor(s, null).typed).toEqual({});
  });
  it("opens everything once done", () => {
    let s = start();
    while (!s.done) s = D.next(s, s.phaseAt + 1);
    expect(D.redactFor(s, null).categories).toHaveLength(4);
  });
});

describe("winners and keys", () => {
  it("top points win, ties share", () => {
    const s = play(start(), { Ann: "ham", Ben: "ham", Cat: "olives", Dan: "kale" });
    expect(D.winners(s)).toEqual(["Ann", "Cat", "Dan"]);
    expect(D.seenKeys(s)).toEqual([`dg:${s.categories[0]!.toLowerCase()}`]);
  });
});
