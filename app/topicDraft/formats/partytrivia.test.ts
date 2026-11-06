import { describe, it, expect } from "vitest";
import { answer, settle, buildTeams, init, next, redactFor, teamChoice, tick, QUESTION_MS, REVEAL_MS, type PTState } from "./partytrivia";
import type { TriviaCategory } from "../trivia/types";

const cat = (name: string, n = 4): TriviaCategory => ({
  name,
  clues: Array.from({ length: n }, (_, i) => ({ q: `${name} question tier ${i}`, right: `${name}-right-${i}`, wrong: [`${name}-w1-${i}`, `${name}-w2-${i}`, `${name}-w3-${i}`] })),
});
const CATS = [cat("Alpha"), cat("Beta"), cat("Gamma"), cat("Delta"), cat("Eps"), cat("Zeta")];
const T0 = 1_000_000;
const make = (o: Partial<Parameters<typeof init>[0]> = {}) =>
  init({ players: ["Ann", "Bob", "Cy"], categories: CATS, count: 10, teams: 0, teamMap: {}, seed: 7, now: T0, ...o });
const rightOf = (s: PTState) => s.questions[s.round]!.answer;
const wrongOf = (s: PTState) => s.questions[s.round]!.options.find((o) => o !== rightOf(s))!;

describe("party trivia engine", () => {
  it("scores right answers with a speed bonus, up to 150", () => {
    let s = make();
    s = answer(s, "Ann", rightOf(s), T0); // instant
    s = answer(s, "Bob", rightOf(s), T0 + QUESTION_MS); // at the deadline
    s = answer(s, "Cy", wrongOf(s), T0 + 1000);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ Ann: 150, Bob: 100, Cy: 0 });
    expect(s.correct).toEqual({ Ann: 1, Bob: 1, Cy: 0 });
  });

  it("uses the team's most-voted option, and the earliest chosen on a tie", () => {
    expect(teamChoice([{ choice: "x", at: 5 }, { choice: "y", at: 1 }])).toBe("y");
    expect(teamChoice([{ choice: "x", at: 5 }, { choice: "x", at: 6 }, { choice: "y", at: 1 }])).toBe("x");
    expect(teamChoice([])).toBeNull();
  });

  it("scores a team on its voted option and counts who carried it", () => {
    const players = ["A", "B", "C", "D"];
    let s = init({ players, categories: CATS, count: 10, teams: 2, teamMap: { A: 0, B: 0, C: 1, D: 1 }, seed: 3, now: T0 });
    expect(s.teams).toEqual([["A", "B"], ["C", "D"]]);
    const r = rightOf(s), w = wrongOf(s);
    s = answer(s, "A", r, T0);
    s = answer(s, "B", w, T0 + 100);
    s = answer(s, "C", w, T0 + 100);
    s = answer(s, "D", w, T0 + 200);
    expect(s.phase).toBe("reveal");
    expect(s.history[0]!.teamChoice).toEqual([r, w]); // tie on team 0 goes to the earliest vote
    expect(s.teamPoints).toEqual([150, 0]);
    expect(s.correct.A).toBe(1);
    expect(s.correct.B).toBe(0);
  });

  it("hides answers from other teams until reveal, and shows teammates", () => {
    const s0 = init({ players: ["A", "B", "C", "D"], categories: CATS, count: 10, teams: 2, teamMap: { A: 0, B: 0, C: 1, D: 1 }, seed: 3, now: T0 });
    const w = wrongOf(s0);
    let s = answer(s0, "A", w, T0 + 10);
    s = answer(s, "C", s.questions[0]!.options[0]!, T0 + 20);
    const a = redactFor(s, "B"); // A's teammate
    expect(a.answers.A!.choice).toBe(w);
    expect(a.answers.C!.choice).toBe(""); // other team: only that they answered
    const c = redactFor(s, "D");
    expect(c.answers.A!.choice).toBe("");
    expect(c.answers.C!.choice).toBe(s.answers.C!.choice);
  });

  it("hides all answers in solo play until reveal", () => {
    let s = make();
    s = answer(s, "Ann", wrongOf(s), T0 + 10);
    const v = redactFor(s, "Bob");
    expect(v.answers.Ann!.choice).toBe("");
    expect(redactFor(s, "Ann").answers.Ann!.choice).toBe(s.answers.Ann!.choice);
    expect(redactFor(s, null).answers.Ann!.choice).toBe("");
    s = answer(s, "Bob", rightOf(s), T0 + 20);
    s = answer(s, "Cy", rightOf(s), T0 + 30);
    expect(redactFor(s, "Bob").answers.Ann!.choice).toBe(s.answers.Ann!.choice); // revealed
  });

  it("never sends the current answer or later questions during a question", () => {
    const s = make();
    const v = redactFor(s, "Ann");
    expect(v.questions).toHaveLength(1);
    expect("answer" in v.questions[0]!).toBe(false);
    const json = JSON.stringify(v);
    expect(json).not.toContain('"answer"');
    for (const q of s.questions.slice(1)) expect(json).not.toContain(q.q);
    expect(v.total).toBe(10);
    // After the reveal the answer is open, still no future questions.
    let r = s;
    for (const p of s.players) r = answer(r, p, wrongOf(s), T0 + 5);
    const rv = redactFor(r, "Ann");
    expect(rv.questions).toHaveLength(1);
    expect(rv.questions[0]!.answer).toBe(s.questions[0]!.answer);
    expect(JSON.stringify(rv)).not.toContain(s.questions[1]!.q);
  });

  it("buildTeams respects the host's map and puts late joiners on the smallest team", () => {
    expect(buildTeams(["A", "B", "C", "D", "E"], 2, { A: 0, B: 0, C: 0, D: 1 })).toEqual([["A", "B", "C"], ["D", "E"]]);
    expect(buildTeams(["A", "B", "C"], 3, { A: 0, B: 5, C: -1, Gone: 1 })).toEqual([["A"], ["B"], ["C"]]);
    const t = buildTeams(["A", "B", "C", "D", "E", "F"], 3, {});
    expect(t.map((x) => x.length)).toEqual([2, 2, 2]);
  });

  it("ignores teams with fewer than 4 players", () => {
    expect(make({ teams: 2 }).teams).toBeNull();
    expect(init({ players: ["A", "B", "C", "D"], categories: CATS, count: 10, teams: 2, teamMap: {}, seed: 1, now: T0 }).teams).toHaveLength(2);
    expect(init({ players: ["A", "B", "C", "D"], categories: CATS, count: 10, teams: 1, teamMap: {}, seed: 1, now: T0 }).teams).toBeNull();
  });

  it("ends the question on the timer when players have left, and when all answered", () => {
    let s = make();
    s = answer(s, "Ann", rightOf(s), T0 + 100);
    expect(tick(s, T0 + QUESTION_MS - 1)).toBe(s);
    const t = tick(s, T0 + QUESTION_MS + 1);
    expect(t.phase).toBe("reveal");
    expect(t.history[0]!.answers).toEqual({ Ann: rightOf(s) });
    expect(t.points.Bob).toBe(0);
    const r = tick(t, T0 + QUESTION_MS + 1 + REVEAL_MS + 1);
    expect(r.round).toBe(1);
    expect(r.phase).toBe("question");
    expect(next(t, T0 + QUESTION_MS + 2).round).toBe(1);
  });

  it("rejects unknown options, outsiders and repeat answers", () => {
    const s = make();
    expect(answer(s, "Ann", "not an option", T0)).toBe(s);
    expect(answer(s, "Zed", s.questions[0]!.options[0]!, T0)).toBe(s);
    expect(answer(s, "Ann", 5 as any, T0)).toBe(s);
    const a = answer(s, "Ann", rightOf(s), T0);
    expect(answer(a, "Ann", wrongOf(s), T0 + 5)).toBe(a);
    expect(next(s, T0)).toBe(s); // not in reveal
  });

  it("caps the count to the questions available and goes harder as it goes", () => {
    expect(make({ categories: [cat("Solo")], count: 10 }).questions).toHaveLength(4);
    const s = make({ count: 10 });
    expect(s.questions).toHaveLength(10);
    const tiers = s.questions.map((q) => Number(/tier (\d)/.exec(q.q)![1]));
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(new Set(tiers).size).toBe(4); // easy through hard all appear
    expect(make({ categories: [], count: 10 }).done).toBe(true);
  });

  it("finishes after the last question", () => {
    let s = make({ categories: [cat("Solo")], count: 10 });
    for (let i = 0; i < 4; i++) s = next(tick(s, s.phaseAt + QUESTION_MS + 1), s.phaseAt + QUESTION_MS + 2);
    expect(s.done).toBe(true);
    const v = redactFor(s, "Ann");
    expect(v.questions).toHaveLength(4);
    expect(v.questions[3]!.answer).toBeDefined();
  });

  it("drinking: 1 sip per wrong answer, 1 for the slowest", () => {
    let s = make({ drinking: true });
    s = answer(s, "Ann", rightOf(s), T0 + 100);
    s = answer(s, "Bob", wrongOf(s), T0 + 200);
    s = answer(s, "Cy", rightOf(s), T0 + 9000);
    const calls = s.drinks!.calls;
    const sips = (n: string) => calls.filter((c) => c.to === n).reduce((a, c) => a + c.sips, 0);
    expect([sips("Ann"), sips("Bob"), sips("Cy")]).toEqual([0, 1, 1]); // Bob wrong, Cy slowest
  });

  it("rejects answers after the deadline, accepts exactly at it", () => {
    const s = make();
    expect(answer(s, "Ann", rightOf(s), T0 + QUESTION_MS + 1)).toBe(s);
    expect(answer(s, "Ann", rightOf(s), T0 + QUESTION_MS).points.Ann).toBe(0); // recorded, not yet scored
    expect(tick(s, T0 + QUESTION_MS)).toBe(s); // the deadline itself is still open
    expect(tick(s, T0 + QUESTION_MS + 1).phase).toBe("reveal");
  });

  it("settle closes the question once everyone still present has answered", () => {
    let s = make();
    s = answer(s, "Ann", rightOf(s), T0 + 10);
    expect(settle(s, [], T0 + 20)).toBe(s);
    expect(settle(s, ["Cy"], T0 + 20)).toBe(s); // Bob is still here
    s = answer(s, "Bob", rightOf(s), T0 + 15);
    const r = settle(s, ["Cy"], T0 + 20);
    expect(r.phase).toBe("reveal");
    expect(r.history[0]!.answers).toEqual({ Ann: rightOf(s), Bob: rightOf(s) });
    expect(settle(r, ["Cy"], T0 + 30)).toBe(r);
    expect(settle(s, ["Ann", "Bob", "Cy"], T0 + 20)).toBe(s); // nobody left to wait for
  });

  it("drops empty teams, and one team left plays solo", () => {
    const four = ["A", "B", "C", "D"];
    const a = init({ players: four, categories: CATS, count: 10, teams: 3, teamMap: { A: 0, B: 0, C: 0, D: 1 }, seed: 1, now: T0 });
    expect(a.teams).toEqual([["A", "B", "C"], ["D"]]);
    expect(a.teamPoints).toEqual([0, 0]);
    const b = init({ players: four, categories: CATS, count: 10, teams: 3, teamMap: { A: 0, B: 0, C: 0, D: 0 }, seed: 1, now: T0 });
    expect(b.teams).toBeNull();
    expect(b.teamPoints).toEqual([]);
  });
});

describe("players named after built-in object properties", () => {
  const odd = ["constructor", "toString", "valueOf"];
  it("can answer, aren't counted as having answered before they do, and score", () => {
    let s = make({ players: odd });
    s = answer(s, "constructor", rightOf(s), T0);
    expect(s.phase).toBe("question");
    expect(settle(s, ["valueOf"], T0)).toBe(s); // toString hasn't answered
    s = answer(s, "toString", rightOf(s), T0);
    expect(s.phase).toBe("question");
    s = answer(s, "valueOf", wrongOf(s), T0);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ constructor: 150, toString: 150, valueOf: 0 });
    expect(s.history[0]!.answers).toEqual({ constructor: expect.any(String), toString: expect.any(String), valueOf: expect.any(String) });
  });
  it("one who never answered scores nothing and doesn't break the round", () => {
    let s = make({ players: odd, teams: 0 });
    s = answer(s, "valueOf", rightOf(s), T0);
    s = tick(s, T0 + QUESTION_MS + 1);
    expect(s.phase).toBe("reveal");
    expect(s.points).toEqual({ constructor: 0, toString: 0, valueOf: 150 });
  });
});

describe("sip card key", () => {
  it("is public and differs between two games on the same questions", () => {
    const a = make({ now: T0 }), b = make({ now: T0 + 60_000 });
    expect(a.questions[0]).toEqual(b.questions[0]);
    expect(redactFor(a, "Ann").startedAt).toBe(T0);
    expect(redactFor(b, null).startedAt).toBe(T0 + 60_000);
  });
});
