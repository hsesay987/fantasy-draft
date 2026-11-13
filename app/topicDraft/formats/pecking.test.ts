import { describe, it, expect } from "vitest";
import {
  CLOSEST_BONUS, DAILY_COUNT, QUESTION_MS, REVEAL_MS, distance, guessRank, init, makeQuestions, next, pickName, pointsFor, redactFor, seenKeys, settle, tick,
  type PeckQuestion, type PeckState,
} from "./pecking";
import { spanOf, type PeckList } from "../pecking/lists";

const NAMES = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliet",
  "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango"];
// Size 20; Echo, Foxtrot and Golf tie at rank 5 (span 5..7).
const VALUES = [200, 190, 180, 170, 160, 160, 160, 130, 120, 110, 100, 90, 80, 70, 60, 50, 40, 30, 20, 10];
const RANKS = [1, 2, 3, 4, 5, 5, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const LIST: PeckList = {
  id: "fx", title: "Fixture", stat: "Score", source: "test", asOf: "2026-11-13",
  items: NAMES.map((name, i) => ({ name, value: VALUES[i]!, rank: RANKS[i]!, ...(name === "Delta" ? { aliases: ["Dee"] } : {}) })),
};
const LIST2: PeckList = { ...LIST, id: "fy", title: "Fixture 2", items: LIST.items.map((it) => ({ ...it, name: `${it.name} Two`, aliases: undefined })) };
const item = (name: string) => LIST.items.find((i) => i.name === name)!;

const rankQ = (name: string): PeckQuestion => ({
  kind: "rank", list: LIST.id, title: LIST.title, stat: LIST.stat, size: 20, item: name,
  answer: { span: spanOf(LIST, item(name)), names: [name], value: item(name).value },
});
const nameQ = (n: number): PeckQuestion => {
  const at = LIST.items.filter((i) => { const [a, b] = spanOf(LIST, i); return a <= n && n <= b; });
  return {
    kind: "name", list: LIST.id, title: LIST.title, stat: LIST.stat, size: 20, at: n,
    answer: { span: spanOf(LIST, at[0]!), names: at.map((i) => i.name), value: at[0]!.value },
    pool: LIST.items.map((i) => ({ name: i.name, span: spanOf(LIST, i), ...(i.aliases ? { aliases: i.aliases } : {}) })),
  };
};

const T0 = 1_000_000;
const PLAYERS = ["Ann", "Bob", "Cy"];
const make = (questions: PeckQuestion[], o: { players?: string[]; drinking?: boolean } = {}): PeckState => ({
  ...init({ players: o.players ?? PLAYERS, lists: [LIST], mode: "rank", count: questions.length, seed: 1, now: T0, drinking: o.drinking }),
  questions,
});
const sips = (s: PeckState) => Object.fromEntries(Object.entries(s.drinks!.totals).filter(([, v]) => v > 0));

describe("pecking order engine", () => {
  it("exports the binding constants", () => {
    expect([QUESTION_MS, REVEAL_MS, CLOSEST_BONUS, DAILY_COUNT]).toEqual([20_000, 8_000, 20, 5]);
  });

  it("pointsFor: exact 100, linear to 0 at a quarter of the list", () => {
    expect(pointsFor(0, 20)).toBe(100);
    expect(pointsFor(1, 20)).toBe(80);
    expect(pointsFor(5, 20)).toBe(0);
    expect(pointsFor(9, 20)).toBe(0);
    expect(pointsFor(10, 1025)).toBe(96); // 1 - 10/256.25 = 0.961
  });

  it("distance to a tie span is to its nearest end", () => {
    expect(distance(3, [2, 3])).toBe(0);
    expect(distance(6, [2, 3])).toBe(3);
    expect(distance(1, [2, 3])).toBe(1);
  });

  it("mixed mode alternates, starting with rank; count is respected; avoid skips asked items", () => {
    const qs = makeQuestions([LIST, LIST2], "mixed", 6, 42);
    expect(qs).toHaveLength(6);
    expect(qs.map((q) => q.kind)).toEqual(["rank", "name", "rank", "name", "rank", "name"]);
    expect(qs.map((q) => q.list)).toEqual(["fx", "fy", "fx", "fy", "fx", "fy"]);
    expect(makeQuestions([LIST, LIST2], "mixed", 6, 42)).toEqual(qs); // deterministic
    expect(makeQuestions([LIST], "rank", 4, 1).every((q) => q.kind === "rank")).toBe(true);
    expect(makeQuestions([LIST], "name", 4, 1).every((q) => q.kind === "name" && q.at! >= 1 && q.at! <= 20)).toBe(true);
    // Avoiding all but one item leaves that item for a rank question.
    const avoid = NAMES.filter((n) => n !== "Kilo").map((n) => `pk:fx:${n}`);
    const [only] = makeQuestions([LIST], "rank", 1, 9, avoid);
    expect(only!.item).toBe("Kilo");
    expect(only!.answer).toEqual({ span: [11, 11], names: ["Kilo"], value: 100 });
    // For name kind, an N whose names are all avoided is skipped: only #11 (Kilo) is left.
    const [nq] = makeQuestions([LIST], "name", 1, 9, avoid);
    expect(nq!.at).toBe(11);
    // A tie group counts as avoided only when every name in it is.
    const tieLeft = NAMES.filter((n) => n !== "Golf").map((n) => `pk:fx:${n}`);
    const [tq] = makeQuestions([LIST], "name", 1, 3, tieLeft);
    expect(tq!.at! >= 5 && tq!.at! <= 7).toBe(true);
    expect(tq!.answer).toEqual({ span: [5, 7], names: ["Echo", "Foxtrot", "Golf"], value: 160 });
    // Questions within one game do not repeat an item.
    const ranks = makeQuestions([LIST], "rank", 20, 5).map((q) => q.item);
    expect(new Set(ranks).size).toBe(20);
  });

  it("init draws the questions and seenKeys lists asked items", () => {
    const s = init({ players: PLAYERS, lists: [LIST], mode: "rank", count: 3, seed: 4, now: T0 });
    expect(s.questions).toHaveLength(3);
    expect(s.round).toBe(0);
    expect(s.phase).toBe("question");
    expect(s.points).toEqual({ Ann: 0, Bob: 0, Cy: 0 });
    expect(s.taken).toEqual([]);
    expect(s.drinks).toBeUndefined();
    expect(seenKeys(s)).toEqual([`pk:fx:${s.questions[0]!.item}`]);
    expect(seenKeys(make([nameQ(6)]))).toEqual(["pk:fx:Echo", "pk:fx:Foxtrot", "pk:fx:Golf"]);
  });

  it("guessRank accepts only integers 1..size, once, before the deadline", () => {
    const s = make([rankQ("Delta"), rankQ("Kilo")]);
    for (const bad of [0, 21, 3.5, "12", NaN, null, undefined, Infinity]) expect(guessRank(s, "Ann", bad, T0)).toBe(s);
    expect(guessRank(s, "Zed", 4, T0)).toBe(s); // not a player
    const a = guessRank(s, "Ann", 4, T0 + 10);
    expect(a.answers).toEqual({ Ann: { guess: 4, at: T0 + 10 } });
    expect(guessRank(a, "Ann", 5, T0 + 20)).toBe(a); // once
    expect(guessRank(s, "Ann", 20, T0 + QUESTION_MS).answers.Ann).toEqual({ guess: 20, at: T0 + QUESTION_MS });
    expect(guessRank(s, "Ann", 20, T0 + QUESTION_MS + 1)).toBe(s);
    expect(pickName(s, "Ann", "Delta", T0)).toBe(s); // wrong kind
  });

  it("pickName locks a name for one player; a second pick of it is refused, then another name is accepted", () => {
    let s = make([nameQ(4)]);
    s = pickName(s, "Ann", "  dee ", T0 + 5); // alias, any case
    expect(s.answers.Ann).toEqual({ guess: null, name: "Delta", at: T0 + 5 });
    expect(s.taken).toEqual(["Delta"]);
    const refused = pickName(s, "Bob", "Delta", T0 + 6);
    expect(refused).toBe(s);
    s = pickName(s, "Bob", "Charlie", T0 + 7);
    expect(s.answers.Bob).toEqual({ guess: null, name: "Charlie", at: T0 + 7 });
    expect(s.taken).toEqual(["Delta", "Charlie"]);
    expect(pickName(s, "Ann", "Bravo", T0 + 8)).toBe(s); // one answer each
    expect(guessRank(s, "Cy", 4, T0 + 8)).toBe(s); // wrong kind
    expect(pickName(s, "Cy", 42, T0 + 8)).toBe(s);
    expect(pickName(s, "Cy", "Bravo", T0 + QUESTION_MS + 1)).toBe(s);
  });

  it("an unknown name is accepted, scores 0 and is not added to taken", () => {
    let s = make([nameQ(4)]);
    s = pickName(s, "Ann", "Zulu", T0);
    expect(s.answers.Ann).toEqual({ guess: null, name: "Zulu", at: T0 });
    expect(s.taken).toEqual([]);
    s = pickName(s, "Bob", "Zulu", T0 + 1); // never locked
    expect(s.answers.Bob!.name).toBe("Zulu");
    expect(pickName(s, "Cy", "   ", T0)).toBe(s); // blank is not an answer
    s = pickName(s, "Cy", "Delta", T0 + 2);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ Ann: 0, Bob: 0, Cy: 120 }); // exact, and the only one above 0
    expect(s.history[0]!.scores.Ann).toEqual({ guess: null, name: "Zulu", points: 0, bonus: false });
  });

  it("who's at #N scores by the picked name's span", () => {
    let s = make([nameQ(6)]);
    s = pickName(s, "Ann", "Echo", T0); // span 5..7 holds 6
    s = pickName(s, "Bob", "Delta", T0); // rank 4: error 2 → 60
    s = pickName(s, "Cy", "Hotel", T0); // rank 8: error 2 → 60
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.scores.Ann).toEqual({ guess: null, name: "Echo", span: [5, 7], points: 100, bonus: true });
    expect(s.history[0]!.scores.Bob).toEqual({ guess: null, name: "Delta", span: [4, 4], points: 60, bonus: false });
    expect(s.points).toEqual({ Ann: 120, Bob: 60, Cy: 60 });
  });

  it("reveal: closest player +20, ties each get it, 0 points get none, a lone answerer gets none", () => {
    // Delta is #4. Ann 4 (exact), Bob 6 (60), Cy 9 (0).
    let s = make([rankQ("Delta")]);
    s = guessRank(guessRank(guessRank(s, "Ann", 4, T0), "Bob", 6, T0), "Cy", 9, T0);
    expect(s.points).toEqual({ Ann: 120, Bob: 60, Cy: 0 });
    expect(s.history[0]!.scores).toEqual({
      Ann: { guess: 4, points: 100, bonus: true }, Bob: { guess: 6, points: 60, bonus: false }, Cy: { guess: 9, points: 0, bonus: false },
    });
    // Ties: Ann 3 and Bob 5 are both 1 off → 80 + 20 each.
    let t = make([rankQ("Delta")]);
    t = guessRank(guessRank(guessRank(t, "Ann", 3, T0), "Bob", 5, T0), "Cy", 20, T0);
    expect(t.points).toEqual({ Ann: 100, Bob: 100, Cy: 0 });
    // Closest but scoring 0 gets no bonus.
    let z = make([rankQ("Alpha")], { players: ["Ann", "Bob"] });
    z = guessRank(guessRank(z, "Ann", 10, T0), "Bob", 20, T0);
    expect(z.points).toEqual({ Ann: 0, Bob: 0 });
    expect(z.history[0]!.scores.Ann!.bonus).toBe(false);
    // Only one player answered (the other timed out): no bonus.
    let l = make([rankQ("Delta")], { players: ["Ann", "Bob"] });
    l = tick(guessRank(l, "Ann", 4, T0), T0 + QUESTION_MS + 1);
    expect(l.points).toEqual({ Ann: 100, Bob: 0 });
    expect(l.history[0]!.scores.Bob).toEqual({ guess: null, points: 0, bonus: false });
    // Solo never gets it.
    let solo = make([rankQ("Delta")], { players: ["Ann"] });
    solo = guessRank(solo, "Ann", 4, T0);
    expect(solo.points).toEqual({ Ann: 100 });
  });

  it("everyone answered closes the question; tick closes it at the deadline; reveal moves on after REVEAL_MS; next only in reveal", () => {
    let s = make([rankQ("Delta"), rankQ("Kilo")]);
    expect(next(s, T0)).toBe(s);
    s = guessRank(s, "Ann", 4, T0);
    expect(tick(s, T0 + QUESTION_MS)).toBe(s);
    s = tick(s, T0 + QUESTION_MS + 1);
    expect(s.phase).toBe("reveal");
    expect(s.phaseAt).toBe(T0 + QUESTION_MS + 1);
    const R = s.phaseAt;
    expect(tick(s, R + REVEAL_MS - 1)).toBe(s);
    const moved = tick(s, R + REVEAL_MS);
    expect(moved).toMatchObject({ round: 1, phase: "question", answers: {}, taken: [], phaseAt: R + REVEAL_MS });
    expect(next(s, R + 1)).toMatchObject({ round: 1, phase: "question", phaseAt: R + 1 });
    let t = moved;
    for (const p of PLAYERS) t = guessRank(t, p, 11, R + REVEAL_MS + 1);
    expect(t.phase).toBe("reveal");
    const done = next(t, R + REVEAL_MS + 2);
    expect(done.done).toBe(true);
    expect(next(done, R + REVEAL_MS + 3)).toBe(done);
    expect(tick(done, R + 99_999)).toBe(done);
    expect(guessRank(done, "Ann", 1, R + REVEAL_MS + 3)).toBe(done);
  });

  it("taken resets for the next question", () => {
    let s = make([nameQ(4), nameQ(9)]);
    s = pickName(s, "Ann", "Delta", T0);
    s = next(tick(s, T0 + QUESTION_MS + 1), T0 + QUESTION_MS + 2);
    expect(s.taken).toEqual([]);
    expect(pickName(s, "Bob", "Delta", s.phaseAt).taken).toEqual(["Delta"]);
  });

  it("settle closes once everyone still present has answered", () => {
    let s = make([rankQ("Delta")]);
    s = guessRank(s, "Ann", 4, T0);
    expect(settle(s, ["Cy"], T0 + 1)).toBe(s);
    s = guessRank(s, "Bob", 5, T0);
    const closed = settle(s, ["Cy"], T0 + 2);
    expect(closed.phase).toBe("reveal");
    expect(closed.phaseAt).toBe(T0 + 2);
    expect(settle(s, PLAYERS, T0 + 2)).toBe(s); // nobody left: the clock closes it
    expect(settle(closed, [], T0 + 3)).toBe(closed);
  });

  it("drinking: 1 sip for 0 points or no answer, nobody else", () => {
    let s = make([rankQ("Delta")], { players: ["Ann", "Bob", "Cy", "Di"], drinking: true });
    s = guessRank(guessRank(guessRank(s, "Ann", 4, T0), "Bob", 6, T0), "Cy", 15, T0);
    s = tick(s, T0 + QUESTION_MS + 1);
    expect(sips(s)).toEqual({ Cy: 1, Di: 1 });
    expect(s.drinks!.calls).toEqual([
      { to: "Cy", sips: 1, reason: "Way off" },
      { to: "Di", sips: 1, reason: "No answer" },
    ]);
    expect(make([rankQ("Delta")]).drinks).toBeUndefined();
  });

  it("redactFor hides answer, pool, spans and other players' guesses during a question, for a player and for null", () => {
    for (const q of [rankQ("Echo"), nameQ(6)]) {
      let s = make([q, rankQ("Kilo")]);
      s = q.kind === "rank" ? guessRank(s, "Ann", 5, T0) : pickName(s, "Ann", "Golf", T0);
      for (const me of [...PLAYERS, null]) {
        const v = redactFor(s, me);
        expect(v.total).toBe(2);
        expect(v.questions).toHaveLength(1); // later questions are not sent
        const json = JSON.stringify(v.questions[0]);
        expect(json).not.toContain('"answer"');
        expect(json).not.toContain('"pool"');
        expect(json).not.toContain('"span"');
        expect(JSON.stringify(v)).not.toContain('"span"');
        if (q.kind === "name") {
          expect(v.questions[0]!.choices).toEqual([...NAMES].sort((a, b) => a.localeCompare(b)));
          expect(v.taken).toEqual(["Golf"]);
        } else {
          expect(v.questions[0]!.choices).toBeUndefined();
          expect(v.questions[0]!.item).toBe("Echo");
        }
        expect(v.answers.Ann).toEqual(me === "Ann" ? s.answers.Ann : { guess: null, at: 0 });
      }
    }
  });

  it("redactFor after the reveal shows the answer but never the pool", () => {
    let s = make([nameQ(6), rankQ("Kilo")]);
    s = pickName(s, "Ann", "Golf", T0);
    s = tick(s, T0 + QUESTION_MS + 1);
    const v = redactFor(s, "Bob");
    expect(v.questions[0]!.answer).toEqual({ span: [5, 7], names: ["Echo", "Foxtrot", "Golf"], value: 160 });
    expect(JSON.stringify(v)).not.toContain('"pool"');
    expect(v.answers.Ann).toEqual(s.answers.Ann);
    expect(v.history[0]!.scores.Ann).toMatchObject({ name: "Golf", span: [5, 7], points: 100 });
  });

  it("done game: still no pool in the view", () => {
    let s = make([nameQ(6)]);
    s = next(tick(s, T0 + QUESTION_MS + 1), T0 + QUESTION_MS + 2);
    expect(s.done).toBe(true);
    for (const me of ["Ann", null]) {
      const v = redactFor(s, me);
      expect(JSON.stringify(v)).not.toContain('"pool"');
      expect(v.questions[0]!.answer!.names).toEqual(["Echo", "Foxtrot", "Golf"]);
      expect(v.total).toBe(1);
    }
    expect(s.questions[0]!.pool).toHaveLength(20); // state itself is untouched
  });

  it("init with no questions is done", () => {
    expect(init({ players: PLAYERS, lists: [], mode: "mixed", count: 5, seed: 1, now: T0 }).done).toBe(true);
  });
});
