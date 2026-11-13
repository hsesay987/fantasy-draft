import { beforeAll, describe, expect, it } from "vitest";
import { JUDGE_MS, REVEAL_MS, SPEAK_MS, WORD_MS, turnBudget } from "../sayless/rules";
import { setWordSource, type SayWord } from "../sayless/source";
import {
  buzz, clue, currentDescriber, guess, init, mark, next, pass, redactFor, seenKeys, settle, spoke, tick, winners,
  type SLState, type SLWord,
} from "./sayless";

const FIX: Record<string, SayWord[]> = {
  alpha: [
    { name: "zebrafish", par: 3 },
    { name: "quokka", par: 3, also: ["setonix"] },
    { name: "xylophone", par: 3 },
    { name: "marzipan", par: 3 },
    { name: "kumquat", par: 3, also: ["cumquat"] },
    { name: "gondola", par: 3 },
  ],
  beta: [
    { name: "walrus", par: 2 },
    { name: "tamarind", par: 2 },
    { name: "origami", par: 2 },
  ],
  tiny: [{ name: "ox", par: 2 }],
};
const ALL = Object.values(FIX).flat();

beforeAll(() => setWordSource((d) => FIX[d] ?? []));

const T0 = 1_000;
type Opts = Partial<Parameters<typeof init>[0]>;
const mk = (o: Opts = {}): SLState =>
  init({ players: ["Ann", "Bo", "Cy"], decks: ["alpha"], rounds: 1, wordsPerTurn: 3, teams: 0, teamMap: {}, seed: 7, now: T0, ...o });
const cur = (s: SLState): SLWord => s.deal[s.turn]![s.at]!;
/** Replaces the current turn's words (and its budget) so a test knows exactly what is being described. */
const withWords = (s: SLState, words: SayWord[]): SLState => {
  const turnWords = words.map((w) => ({ ...w, id: `sl:${w.name}` }));
  const deal = s.deal.map((t, i) => (i === s.turn ? turnWords : t));
  const budget = turnBudget(turnWords.map((w) => w.par));
  return { ...s, deal, budget, budgetStart: budget };
};
const D = (s: SLState) => currentDescriber(s);
/** Clues `n` safe words. */
const clues = (s: SLState, n: number, now = T0 + 1): SLState => {
  const safe = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"];
  for (let i = 0; i < n; i++) {
    const r = clue(s, D(s), safe[i]!, now);
    expect(r.clues).toHaveLength(s.clues.length + 1);
    s = r;
  }
  return s;
};

describe("init and turn order", () => {
  it("3 players x 2 rounds describe in seat order each round", () => {
    const s = mk({ decks: ["alpha", "beta"], rounds: 2, wordsPerTurn: 3, players: ["Ann", "Bo", "Cy"] });
    expect(s.teams).toBeNull();
    // 9 words only cover 3 turns of 3
    expect(s.turns.map((t) => t.describer)).toEqual(["Ann", "Bo", "Cy"]);
    const big = mk({ decks: ["alpha", "beta"], rounds: 2, wordsPerTurn: 3 });
    expect(big.turns.length).toBe(3);
  });
  it("builds rounds x players turns when there are enough words", () => {
    const many: SayWord[] = Array.from({ length: 30 }, (_, i) => ({ name: `word${i}`, par: 2 }));
    setWordSource((d) => (d === "many" ? many : FIX[d] ?? []));
    const s = mk({ decks: ["many"], rounds: 2, wordsPerTurn: 3 });
    expect(s.turns.map((t) => t.describer)).toEqual(["Ann", "Bo", "Cy", "Ann", "Bo", "Cy"]);
    expect(s.turns.every((t) => t.team === null)).toBe(true);
    const t = mk({ decks: ["many"], rounds: 2, wordsPerTurn: 3, players: ["A", "B", "C", "D"], teams: 2, teamMap: { A: 0, B: 1, C: 0, D: 1 } });
    expect(t.teams).toEqual([["A", "C"], ["B", "D"]]);
    expect(t.turns.map((x) => x.describer).slice(0, 4)).toEqual(["A", "B", "C", "D"]);
    expect(t.turns.map((x) => x.team).slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(t.teamPoints).toEqual([0, 0]);
    // unequal teams: the shorter one runs out
    const u = mk({ decks: ["many"], rounds: 1, wordsPerTurn: 3, players: ["A", "B", "C", "D", "E"], teams: 2, teamMap: { A: 0, B: 1, C: 0, D: 1, E: 0 } });
    expect(u.turns.map((x) => x.describer)).toEqual(["A", "B", "C", "D", "E"]);
    setWordSource((d) => FIX[d] ?? []);
  });
  it("teams need 2+ players each, else solo", () => {
    const s = mk({ players: ["A", "B", "C", "D"], teams: 2, teamMap: { A: 0, B: 0, C: 0, D: 1 } });
    expect(s.teams).toBeNull();
    expect(s.teamPoints).toEqual([]);
  });
  it("deals distinct words from mixed decks, deterministic by seed, skipping avoid", () => {
    const a = mk({ decks: ["alpha", "beta"] });
    const b = mk({ decks: ["alpha", "beta"] });
    expect(a.deal).toEqual(b.deal);
    const ids = a.deal.flat().map((w) => w.id);
    expect(new Set(ids).size).toBe(9);
    expect(ids.some((i) => i === "sl:walrus" || i === "sl:tamarind" || i === "sl:origami")).toBe(true);
    const av = mk({ decks: ["alpha"], avoid: ["sl:zebrafish", "sl:quokka"] });
    const got = av.deal.flat().map((w) => w.id);
    expect(got).not.toContain("sl:zebrafish");
    expect(got).not.toContain("sl:quokka");
    expect(got).toHaveLength(4);
  });
  it("starts the first word with the turn budget", () => {
    const s = mk();
    expect(s.phase).toBe("clue");
    expect(s.budget).toBe(turnBudget(s.deal[0]!.map((w) => w.par)));
    expect(s.budgetStart).toBe(s.budget);
    expect(s.guessers).toEqual(["Bo", "Cy"]);
    expect(D(s)).toBe("Ann");
    expect(s.done).toBe(false);
  });
  it("an empty pool is done at once", () => {
    const s = mk({ decks: ["nothing"] });
    expect(s.done).toBe(true);
    expect(s.turns).toEqual([]);
  });
});

describe("clues", () => {
  it("accepted clue costs one budget and clears a refusal", () => {
    const s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    const r = clue(s, "Ann", "zebrafishy", T0 + 1);
    expect(r).not.toBe(s);
    expect(r.clues).toEqual([]);
    expect(r.budget).toBe(s.budget);
    expect(r.refused).toEqual({ seq: 1, reason: "contains" });
    const r2 = clue(r, "Ann", "stripes stripes", T0 + 2);
    expect(r2.clues).toEqual([]);
    expect(r2.refused).toEqual({ seq: 2, reason: "spaces" });
    const ok = clue(r2, "Ann", "stripes", T0 + 3);
    expect(ok.clues).toEqual(["stripes"]);
    expect(ok.budget).toBe(s.budget - 1);
    expect(ok.refused).toBeUndefined();
  });
  it("only the describer, only in the clue phase, only in time", () => {
    const s = mk();
    expect(clue(s, "Bo", "stripes", T0 + 1)).toBe(s);
    expect(clue(s, "Zed", "stripes", T0 + 1)).toBe(s);
    expect(clue(s, "Ann", "stripes", T0 + WORD_MS)).not.toBe(s);
    expect(clue(s, "Ann", "stripes", T0 + WORD_MS + 1)).toBe(s);
  });
  it("an alias in the clue is refused too, and does not sip", () => {
    const s = withWords(mk({ drinking: true }), [FIX.alpha![1]!, FIX.alpha![0]!, FIX.alpha![2]!]);
    const r = clue(s, "Ann", "setonix", T0 + 1);
    expect(r.clues).toEqual([]);
    expect(r.refused?.reason).toBe("contains");
    expect(r.drinks).toEqual(s.drinks);
  });
  it("budget 0 refuses clues, pass still works and the word still ends by guess or timer", () => {
    let s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    s = { ...s, budget: 0 };
    expect(clue(s, "Ann", "stripes", T0 + 1)).toBe(s);
    const g = guess(s, "Bo", "zebrafish", T0 + 2);
    expect(g.phase).toBe("reveal");
    expect(g.history[0]!.winner).toBe("Bo");
    const t = tick(s, T0 + WORD_MS + 1);
    expect(t.phase).toBe("reveal");
    expect(t.history[0]!.winner).toBeNull();
    const p = pass(s, "Ann", T0 + 3);
    expect(p.phase).toBe("reveal");
    expect(p.budget).toBe(0);
    expect(p.history[0]!.passed).toBe(true);
  });
});

describe("guessing and scoring", () => {
  it("right guess scores par + 2 - clues for guesser and describer", () => {
    let s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    s = clues(s, 2);
    const r = guess(s, "Bo", "Zebrafish", T0 + 5);
    expect(r.points).toEqual({ Ann: 3, Bo: 3, Cy: 0 });
    expect(r.history[0]).toMatchObject({ word: "zebrafish", par: 3, describer: "Ann", winner: "Bo", points: 3, clues: ["alpha", "bravo"] });
    const s5 = clues(withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]), 5);
    expect(guess(s5, "Cy", "zebrafish", T0 + 5).points).toEqual({ Ann: 1, Bo: 0, Cy: 1 });
  });
  it("accepts an alias, refuses wrong guesses with the same object", () => {
    const s = withWords(mk(), [FIX.alpha![4]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    expect(guess(s, "Bo", "banana", T0 + 1)).toBe(s);
    expect(guess(s, "Bo", 42, T0 + 1)).toBe(s);
    expect(guess(s, "Bo", "cumquat", T0 + 1).history[0]!.winner).toBe("Bo");
  });
  it("only the first right guesser scores; the describer cannot guess", () => {
    const s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    expect(guess(s, "Ann", "zebrafish", T0 + 1)).toBe(s);
    const r = guess(s, "Bo", "zebrafish", T0 + 1);
    expect(guess(r, "Cy", "zebrafish", T0 + 2)).toBe(r);
    expect(r.points.Cy).toBe(0);
  });
  it("the deadline is inclusive and a timeout scores nobody", () => {
    const s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    expect(guess(s, "Bo", "zebrafish", T0 + WORD_MS).phase).toBe("reveal");
    expect(guess(s, "Bo", "zebrafish", T0 + WORD_MS + 1)).toBe(s);
    expect(tick(s, T0 + WORD_MS)).toBe(s);
    const t = tick(s, T0 + WORD_MS + 1);
    expect(t.phase).toBe("reveal");
    expect(t.history[0]).toMatchObject({ winner: null, points: 0 });
    expect(t.points).toEqual({ Ann: 0, Bo: 0, Cy: 0 });
  });
  it("pass scores nobody and costs 1 budget; only the describer passes", () => {
    const s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    expect(pass(s, "Bo", T0 + 1)).toBe(s);
    const p = pass(s, "Ann", T0 + 1);
    expect(p.budget).toBe(s.budget - 1);
    expect(p.history[0]).toMatchObject({ winner: null, points: 0, passed: true });
    expect(p.points).toEqual({ Ann: 0, Bo: 0, Cy: 0 });
  });
  it("a player named constructor can play", () => {
    const s = withWords(mk({ players: ["constructor", "Bo"] }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    const r = guess(s, "Bo", "zebrafish", T0 + 1);
    expect(r.points).toEqual({ constructor: 5, Bo: 5 });
  });
});

describe("par guard", () => {
  const setup = (guard?: boolean) => {
    let s = withWords(mk({ players: ["Ann", "Bo", "Cy", "Di"], guard }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    s = { ...s, points: { Ann: 0, Bo: 0, Cy: 1, Di: 5 } };
    return clues(s, 5);
  };
  it("is off by default", () => {
    const r = guess(setup(), "Bo", "zebrafish", T0 + 5);
    expect(r.points).toEqual({ Ann: 1, Bo: 1, Cy: 1, Di: 5 });
    expect(r.history[0]!.guarded).toBeUndefined();
  });
  it("on: docks every other guesser by clues - par, floored at 0", () => {
    const r = guess(setup(true), "Bo", "zebrafish", T0 + 5);
    expect(r.points).toEqual({ Ann: 1, Bo: 1, Cy: 0, Di: 3 });
    expect(r.history[0]!.guarded).toEqual({ Cy: 1, Di: 2 });
  });
  it("on: nothing when clues are within par", () => {
    let s = withWords(mk({ players: ["Ann", "Bo", "Cy"], guard: true }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    s = clues({ ...s, points: { Ann: 0, Bo: 0, Cy: 4 } }, 3);
    expect(guess(s, "Bo", "zebrafish", T0 + 5).points.Cy).toBe(4);
  });
});

describe("turn flow", () => {
  const three = [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!];
  it("reveal moves on after REVEAL_MS; next only works in reveal", () => {
    const s = withWords(mk(), three);
    expect(next(s, T0 + 1)).toBe(s);
    const r = guess(s, "Bo", "zebrafish", T0 + 10);
    expect(tick(r, T0 + 10 + REVEAL_MS - 1)).toBe(r);
    const n = tick(r, T0 + 10 + REVEAL_MS);
    expect(n.phase).toBe("clue");
    expect(n.at).toBe(1);
    expect(n.clues).toEqual([]);
    expect(n.wordAt).toBe(T0 + 10 + REVEAL_MS);
    expect(next(r, T0 + 11)).toMatchObject({ phase: "clue", at: 1 });
    // the word clock restarts
    expect(tick(n, n.wordAt + WORD_MS)).toBe(n);
  });
  it("unused budget is a bonus for the describer on the last word of the turn", () => {
    let s = withWords(mk(), three); // budget 14
    s = clues(s, 2);
    s = next(guess(s, "Bo", "zebrafish", T0 + 2), T0 + 3); // Ann 3, budget 12
    s = clues(s, 1, T0 + 4);
    s = next(pass(s, "Ann", T0 + 5), T0 + 6); // budget 10
    expect(s.at).toBe(2);
    expect(s.history.every((h) => h.bonus === undefined)).toBe(true);
    s = clues(s, 1, T0 + 7); // budget 9
    s = guess(s, "Cy", "xylophone", T0 + 8); // 4 each
    // 9 unused, capped at the 3 + 4 the turn's guessed words earned
    expect(s.history[2]!.bonus).toBe(7);
    expect(s.points).toEqual({ Ann: 3 + 4 + 7, Bo: 3, Cy: 4 });
    s = next(s, T0 + 9);
    expect(s.turn).toBe(1);
    expect(D(s)).toBe("Bo");
    expect(s.guessers).toEqual(["Ann", "Cy"]);
    expect(s.budget).toBe(turnBudget(s.deal[1]!.map((w) => w.par)));
    expect(s.at).toBe(0);
  });
  it("the budget running out ends the turn after that word; the unplayed words never show", () => {
    const A = FIX.alpha!;
    const deal = [[A[0]!, A[1]!, A[2]!], [A[3]!, A[4]!, A[5]!]].map((t) => t.map((w) => ({ ...w, id: `sl:${w.name}` })));
    let s: SLState = { ...mk(), deal, budget: 1, budgetStart: 14 };
    expect(s.turns.map((t) => t.describer)).toEqual(["Ann", "Bo"]);
    s = clues(s, 1); // budget 0
    expect(s.budget).toBe(0);
    s = guess(s, "Bo", "zebrafish", T0 + 2); // 4 each
    expect(s.history[0]!.bonus).toBe(0);
    expect(s.points).toEqual({ Ann: 4, Bo: 4, Cy: 0 });
    s = next(s, T0 + 3);
    expect(s).toMatchObject({ turn: 1, at: 0, phase: "clue" });
    expect(D(s)).toBe("Bo");
    expect(s.history.filter((h) => h.describer === "Ann")).toHaveLength(1);
    const unplayed = ["quokka", "setonix", "xylophone"];
    for (const me of ["Ann", "Bo", "Cy", null]) for (const w of unplayed) expect(JSON.stringify(redactFor(s, me))).not.toContain(w);
    expect(seenKeys(s)).toEqual(["sl:zebrafish"]);
    // the same on the last turn ends the game cleanly
    s = clues({ ...s, budget: 1 }, 1, T0 + 4);
    s = pass(s, "Bo", T0 + 5);
    expect(s.history[1]).toMatchObject({ word: "marzipan", passed: true, bonus: 0 });
    s = tick(s, T0 + 5 + REVEAL_MS);
    expect(s.done).toBe(true);
    expect(s.history).toHaveLength(2);
    expect(seenKeys(s)).toEqual(["sl:zebrafish", "sl:marzipan"]);
    for (const me of ["Ann", "Bo", "Cy", null]) for (const w of [...unplayed, "kumquat", "cumquat", "gondola"]) expect(JSON.stringify(redactFor(s, me))).not.toContain(w);
  });
  it("clamps rounds to 1..10", () => {
    const many: SayWord[] = Array.from({ length: 200 }, (_, i) => ({ name: `word${i}`, par: 2 }));
    setWordSource((d) => (d === "many" ? many : FIX[d] ?? []));
    expect(mk({ decks: ["many"], rounds: 9 }).turns).toHaveLength(27);
    expect(mk({ decks: ["many"], rounds: 99, wordsPerTurn: 2 }).turns).toHaveLength(30);
    expect(mk({ decks: ["many"], rounds: 0 }).turns).toHaveLength(3);
    setWordSource((d) => FIX[d] ?? []);
  });
  it("an idle describer (no clues, every word times out) gets no bonus", () => {
    let s = withWords(mk(), three);
    for (let i = 0; i < 3; i++) {
      s = tick(s, s.wordAt + WORD_MS + 1);
      if (i < 2) s = next(s, s.phaseAt);
    }
    expect(s.history[2]!.bonus).toBe(0);
    expect(s.points).toEqual({ Ann: 0, Bo: 0, Cy: 0 });
  });
  it("one guessed word worth 3 with 10 unused: bonus 3", () => {
    let s = withWords(mk(), three); // budget 14
    s = next(pass(s, "Ann", T0 + 1), T0 + 2); // 13
    s = next(pass(s, "Ann", T0 + 3), T0 + 4); // 12
    s = clues(s, 2, T0 + 5); // 10
    s = guess(s, "Bo", "xylophone", T0 + 6); // 3 each
    expect(s.history[2]!.bonus).toBe(3);
    expect(s.points.Ann).toBe(6);
  });
  it("a 5-point turn with 2 unused: bonus 2", () => {
    const s = { ...withWords(mk(), three), at: 2, budget: 2 };
    const r = guess(s, "Bo", "xylophone", T0 + 1); // no clues, par 3: 5 each
    expect(r.history[0]!.bonus).toBe(2);
    expect(r.points.Ann).toBe(7);
  });
  it("is done after the last turn, and a small pool ends early", () => {
    let s = mk({ decks: ["alpha"], rounds: 2, wordsPerTurn: 4 }); // 6 words: turns of 4 and 2
    expect(s.turns.map((t) => t.describer)).toEqual(["Ann", "Bo"]);
    expect(s.deal.map((t) => t.length)).toEqual([4, 2]);
    let now = T0;
    while (!s.done) {
      if (s.phase === "clue") s = tick(s, (now = s.wordAt + WORD_MS + 1));
      else s = tick(s, (now = now + REVEAL_MS));
    }
    expect(s.history).toHaveLength(6);
    expect(s.done).toBe(true);
    expect(tick(s, now + 99_999)).toBe(s);
    expect(clue(s, "Ann", "x", now)).toBe(s);
  });
  it("clamps words per turn to 2..8", () => {
    expect(mk({ wordsPerTurn: 1 }).deal[0]).toHaveLength(2);
    expect(mk({ wordsPerTurn: 2 }).deal[0]).toHaveLength(2);
    expect(mk({ decks: ["alpha", "beta"], wordsPerTurn: 9 }).deal[0]).toHaveLength(8);
  });
  it("the host's extra budget (slack) sets every turn's budget: pars + slack, clamped 0..15, default 5", () => {
    const pars = (s: SLState, t: number) => s.deal[t]!.reduce((a, w) => a + w.par, 0);
    const s0 = mk({ rounds: 2, slack: 0 });
    expect(s0.budget).toBe(pars(s0, 0));
    const s12 = mk({ rounds: 2, slack: 12 });
    expect(s12.budget).toBe(pars(s12, 0) + 12);
    expect(mk({ slack: 99 }).budget).toBe(pars(mk({ slack: 99 }), 0) + 15);
    expect(mk({ slack: -3 }).budget).toBe(pars(mk({ slack: -3 }), 0));
    expect(mk({ slack: NaN }).budget).toBe(pars(mk({}), 0) + 5);
    expect(mk({}).budget).toBe(pars(mk({}), 0) + 5);
  });
  it("later turns use the same slack", () => {
    let s = mk({ decks: ["alpha", "beta"], rounds: 2, slack: 1 });
    for (let i = 0; i < 20 && s.turn === 0; i++) s = s.phase === "reveal" ? next(s, s.phaseAt + REVEAL_MS) : pass(s, currentDescriber(s)!, s.phaseAt);
    expect(s.turn).toBe(1);
    expect(s.budget).toBe(s.deal[s.turn]!.reduce((a, w) => a + w.par, 0) + 1);
  });
});

describe("teams", () => {
  const tm = () => withWords(mk({ players: ["A", "B", "C", "D"], teams: 2, teamMap: { A: 0, B: 1, C: 0, D: 1 } }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
  it("only the describer's teammates guess and points go to the team", () => {
    const s = tm();
    expect(s.guessers).toEqual(["C"]);
    expect(guess(s, "B", "zebrafish", T0 + 1)).toBe(s);
    const r = guess(clues(s, 2), "C", "zebrafish", T0 + 2);
    expect(r.points).toEqual({ A: 3, B: 0, C: 3, D: 0 });
    expect(r.teamPoints).toEqual([6, 0]);
  });
});

describe("buzz mode", () => {
  const bz = (players = ["Ann", "Bo", "Cy", "Di"], drinking = false) =>
    withWords(mk({ players, answer: "buzz", drinking }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
  it("typed guesses are refused in buzz mode and buzzing in type mode", () => {
    const s = bz();
    expect(s.answerMode).toBe("buzz");
    expect(guess(s, "Bo", "zebrafish", T0 + 1)).toBe(s);
    const t = mk();
    expect(buzz(t, "Bo", T0 + 1)).toBe(t);
  });
  it("buzz holds, spoke goes to judge, and only the describer's call counts", () => {
    const s = bz();
    expect(buzz(s, "Ann", T0 + 1)).toBe(s);
    const b = buzz(s, "Bo", T0 + 1);
    expect(b).toMatchObject({ phase: "speak", buzzer: "Bo" });
    expect(buzz(b, "Cy", T0 + 2)).toBe(b);
    expect(clue(b, "Ann", "stripes", T0 + 2)).toBe(b);
    expect(spoke(b, "Cy", T0 + 2)).toBe(b);
    const j = spoke(b, "Bo", T0 + 2);
    expect(j.phase).toBe("judge");
    // Nobody but the describer may judge: not the buzzer, not the other guessers.
    for (const p of ["Bo", "Cy", "Di"]) for (const v of ["right", "wrong"]) expect(mark(j, p, v, T0 + 3)).toBe(j);
    expect(mark(j, "Ann", "maybe", T0 + 3)).toBe(j);
    const r = mark(j, "Ann", "right", T0 + 3);
    expect(r.phase).toBe("reveal");
    expect(r.history[0]!.winner).toBe("Bo");
    expect(r.points).toMatchObject({ Ann: 5, Bo: 5 });
    expect(r).not.toHaveProperty("marks");
  });
  it("wrong locks the buzzer out of this word only and reopens buzzing", () => {
    let s = spoke(buzz(bz(), "Bo", T0 + 1), "Bo", T0 + 2);
    s = mark(s, "Ann", "wrong", T0 + 3);
    expect(s).toMatchObject({ phase: "clue", buzzer: null, locked: ["Bo"] });
    expect(s.points.Bo).toBe(0);
    expect(buzz(s, "Bo", T0 + 4)).toBe(s);
    expect(buzz(s, "Cy", T0 + 4).buzzer).toBe("Cy");
    // next word: unlocked
    const n = next(pass(s, "Ann", T0 + 5), T0 + 6);
    expect(n.locked).toEqual([]);
    expect(buzz(n, "Bo", T0 + 7).buzzer).toBe("Bo");
  });
  it("2 players: the describer judges the same way", () => {
    const s = spoke(buzz(bz(["Ann", "Bo"]), "Bo", T0 + 1), "Bo", T0 + 2);
    const w = mark(s, "Ann", "wrong", T0 + 3);
    expect(w.locked).toEqual(["Bo"]);
    // the only guesser locked out: nobody can get it, so the word ends
    expect(w.phase).toBe("reveal");
    expect(w.history[0]!.winner).toBeNull();
    const r = mark(s, "Ann", "right", T0 + 3);
    expect(r.history[0]!.winner).toBe("Bo");
  });
  it("speak timeout is wrong; judge timeout with no call is right", () => {
    const b = buzz(bz(), "Bo", T0 + 1);
    expect(spoke(b, "Bo", T0 + 1 + SPEAK_MS).phase).toBe("judge");
    expect(spoke(b, "Bo", T0 + 2 + SPEAK_MS)).toBe(b);
    expect(tick(b, T0 + 1 + SPEAK_MS)).toBe(b);
    const late = tick(b, T0 + 2 + SPEAK_MS);
    expect(late).toMatchObject({ phase: "clue", locked: ["Bo"] });
    const j = spoke(b, "Bo", T0 + 2);
    expect(tick(j, T0 + 2 + JUDGE_MS)).toBe(j);
    expect(tick(j, T0 + 3 + JUDGE_MS).history[0]!.winner).toBe("Bo");
    // a call after the clock is refused
    expect(mark(j, "Ann", "wrong", T0 + 3 + JUDGE_MS)).toBe(j);
  });
  it("a reopen after the word clock ran out ends the word", () => {
    let s = spoke(buzz(bz(), "Bo", T0 + WORD_MS - 1), "Bo", T0 + WORD_MS);
    s = mark(s, "Ann", "wrong", T0 + WORD_MS + 2);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.winner).toBeNull();
  });
});

describe("drinking", () => {
  it("refused clue with the whole secret word sips the describer", () => {
    const s = withWords(mk({ drinking: true }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    const r = clue(s, "Ann", "zebrafishes", T0 + 1);
    expect(r.drinks!.calls).toEqual([expect.objectContaining({ to: "Ann", sips: 1 })]);
    expect(r.drinks!.totals.Ann).toBe(1);
  });
  it("a short secret word does not sip", () => {
    const s = withWords(mk({ drinking: true }), [FIX.tiny![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    const r = clue(s, "Ann", "oxen", T0 + 1);
    expect(r.refused).toBeDefined();
    expect(r.drinks).toEqual(s.drinks);
  });
  it("a wrong buzz sips the buzzer; right guesses, passes and timeouts sip nobody", () => {
    const s = withWords(mk({ players: ["Ann", "Bo", "Cy", "Di"], answer: "buzz", drinking: true }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    let w = spoke(buzz(s, "Bo", T0 + 1), "Bo", T0 + 2);
    w = mark(w, "Ann", "wrong", T0 + 3);
    expect(w.drinks!.calls).toEqual([expect.objectContaining({ to: "Bo", sips: 1 })]);
    const t = mk({ drinking: true });
    expect(guess(t, "Bo", cur(t).name, T0 + 1).drinks).toEqual(t.drinks);
    expect(pass(t, "Ann", T0 + 1).drinks).toEqual(t.drinks);
    expect(tick(t, T0 + WORD_MS + 1).drinks).toEqual(t.drinks);
    expect(mk().drinks).toBeUndefined();
  });
});

describe("redactFor", () => {
  const players = ["Ann", "Bo", "Cy", "Di"];
  const has = (v: unknown, w: string) => JSON.stringify(v).toLowerCase().includes(w.toLowerCase());
  const secretsOf = (w: SLWord) => [w.name, ...(w.also ?? [])];
  const check = (s: SLState, describerSees: boolean) => {
    const live = cur(s);
    const future = s.deal.flat().filter((w) => w.id !== live.id && !s.history.some((h) => h.word === w.name));
    for (const me of [...players, null]) {
      const v = redactFor(s, me);
      expect(v).not.toHaveProperty("deal");
      expect(v).not.toHaveProperty("seed");
      for (const w of future) for (const x of secretsOf(w)) expect(has(v, x), `${me} sees later ${x}`).toBe(false);
      const sees = me === D(s) && describerSees;
      for (const x of secretsOf(live)) expect(has(v, x), `${me} ${s.phase} ${x}`).toBe(sees);
      expect(v.word === null).toBe(!sees);
      if (sees) expect(v.word).toEqual(live);
      expect(v.current?.par).toBe(live.par);
      expect(v.total).toBe(s.turns.length);
    }
  };
  it("hides the word and aliases from everyone but the describer during the word, in every phase", () => {
    const s = withWords(mk({ players, answer: "buzz" }), [FIX.alpha![1]!, FIX.alpha![4]!, FIX.alpha![2]!]);
    check(s, true);
    check(clue(s, "Ann", "marsupial", T0 + 1), true);
    const b = buzz(s, "Bo", T0 + 1);
    check(b, true);
    const j = spoke(b, "Bo", T0 + 2);
    check(j, true);
    // a wrong call reopens buzzing: the word stays hidden from the guessers still in
    check(mark(j, "Ann", "wrong", T0 + 3), true);
  });
  it("shows the word to everyone in the reveal and in history, never later words", () => {
    const s = withWords(mk({ players }), [FIX.alpha![1]!, FIX.alpha![4]!, FIX.alpha![2]!]);
    const r = guess(s, "Bo", "quokka", T0 + 1);
    for (const me of [...players, null]) {
      const v = redactFor(r, me);
      expect(v.current?.name).toBe("quokka");
      expect(v.word).toBeNull();
      expect(has(v, "kumquat")).toBe(false);
      expect(has(v, "xylophone")).toBe(false);
    }
    const n = next(r, T0 + 2);
    check(n, true);
    expect(redactFor(n, "Bo").history[0]!.word).toBe("quokka");
  });
  it("done: no deal, no current secret", () => {
    let s = mk({ players: ["Ann", "Bo"] });
    let now = T0;
    while (!s.done) s = s.phase === "clue" ? tick(s, (now = s.wordAt + WORD_MS + 1)) : tick(s, (now += REVEAL_MS));
    const v = redactFor(s, "Ann");
    expect(v).not.toHaveProperty("deal");
    expect(v.word).toBeNull();
    for (const w of ALL.filter((w) => !s.history.some((h) => h.word === w.name))) expect(has(v, w.name)).toBe(false);
  });
});

describe("settle", () => {
  const players = ["Ann", "Bo", "Cy", "Di"];
  const base = (answer?: "buzz") => withWords(mk({ players, rounds: 1, decks: ["alpha", "beta"], answer }), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
  it("describer gone: the word ends with no points and the next turn starts", () => {
    const s = clues(base(), 2);
    expect(settle(s, [], T0 + 2)).toBe(s);
    const r = settle(s, ["Ann"], T0 + 2);
    expect(r.history).toHaveLength(1);
    expect(r.history[0]).toMatchObject({ word: "zebrafish", winner: null, points: 0 });
    expect(r.history[0]!.bonus).toBeUndefined();
    expect(Object.values(r.points).every((p) => p === 0)).toBe(true);
    expect(r.turn).toBe(1);
    expect(D(r)).toBe("Bo");
    expect(r.phase).toBe("clue");
    // the skipped words of Ann's turn never show
    expect(JSON.stringify(redactFor(r, null))).not.toContain("quokka");
  });
  it("describer gone on the turn's last word: no unused-budget bonus", () => {
    const s = { ...base(), at: 2 };
    const r = settle(s, ["Ann"], T0 + 2);
    expect(r.history[0]).toMatchObject({ word: "xylophone", winner: null, points: 0 });
    expect(r.history[0]!.bonus).toBeUndefined();
    expect(r.points.Ann).toBe(0);
    expect(r.turn).toBe(1);
  });
  it("several departed describers in a row are all skipped", () => {
    const r = settle(base(), ["Ann", "Bo"], T0 + 2);
    expect(D(r)).toBe("Cy");
    expect(r.history.map((h) => h.winner)).toEqual([null, null]);
  });
  it("all guessers gone: the word ends like a timeout", () => {
    const s = base();
    const r = settle(s, ["Bo", "Cy", "Di"], T0 + 2);
    expect(r.phase).toBe("reveal");
    expect(r.history[0]).toMatchObject({ winner: null, points: 0 });
    expect(settle(s, ["Bo", "Cy"], T0 + 2)).toBe(s);
  });
  it("buzzer gone counts as wrong, while speaking or being judged; other guessers leaving changes nothing", () => {
    const b = buzz(base("buzz"), "Bo", T0 + 1);
    const r = settle(b, ["Bo"], T0 + 2);
    expect(r).toMatchObject({ phase: "clue", buzzer: null, locked: ["Bo"] });
    const j = spoke(b, "Bo", T0 + 2);
    expect(settle(j, ["Bo"], T0 + 3)).toMatchObject({ phase: "clue", buzzer: null, locked: ["Bo"] });
    expect(settle(j, ["Di"], T0 + 3)).toBe(j);
  });
  it("describer gone while judging: the word ends with no points and the next turn starts", () => {
    const j = spoke(buzz(base("buzz"), "Bo", T0 + 1), "Bo", T0 + 2);
    const r = settle(j, ["Ann"], T0 + 3);
    expect(r.history[0]).toMatchObject({ word: "zebrafish", winner: null, points: 0 });
    expect(Object.values(r.points).every((p) => p === 0)).toBe(true);
    expect(r).toMatchObject({ turn: 1, phase: "clue", buzzer: null });
  });
});

describe("seenKeys and winners", () => {
  it("seenKeys lists only finished words", () => {
    const s = withWords(mk(), [FIX.alpha![0]!, FIX.alpha![1]!, FIX.alpha![2]!]);
    expect(seenKeys(s)).toEqual([]);
    const r = guess(s, "Bo", "zebrafish", T0 + 1);
    expect(seenKeys(r)).toEqual(["sl:zebrafish"]);
    expect(seenKeys(next(r, T0 + 2))).toEqual(["sl:zebrafish"]);
  });
  it("winners: most points, ties share", () => {
    const s = mk();
    expect(winners(s)).toEqual(["Ann", "Bo", "Cy"]);
    expect(winners({ ...s, points: { Ann: 2, Bo: 5, Cy: 5 } })).toEqual(["Bo", "Cy"]);
  });
});
