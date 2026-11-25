import { describe, expect, it } from "vitest";
import { answer, judged, lock, next, pendingUnknowns, redactFor, reviewItems, settle, tick, winners, type DigState } from "./npatDig";
import { init, seenKeys } from "./npatQuestion";
import { DIG_ANSWER_MS, JUDGE_MS, QUESTION_LETTERS, QUESTION_MAX_ROUNDS, QUESTION_MIN_ROUNDS, REEL_MS, VERDICT_MS, WRITE_GRACE_MS } from "../npat/rules";
import { NPAT_QUESTIONS, questionByText } from "../npat/questions";

// No list source is set here on purpose: question style never looks anything up, so it must not need the lists.

const T0 = 1_000_000;
const P3 = ["Ann", "Bob", "Cy"];
type O = Parameters<typeof init>[0];
const make = (o: Partial<O> = {}): DigState => init({ players: P3, rounds: 3, teams: 0, teamMap: {}, seed: 7, now: T0, ...o } as O);
const ask = (s: DigState) => tick(s, s.phaseAt + REEL_MS);
const closeAsk = (s: DigState) => tick(s, s.phaseAt + DIG_ANSWER_MS + WRITE_GRACE_MS);
const a = (s: DigState, p: string, c = s.cat) => s.results[p]![c]!;
const play = (s: DigState, rows: Record<string, string>): DigState => {
  for (const [p, t] of Object.entries(rows)) s = answer(s, p, t, s.phaseAt + 1);
  return closeAsk(s);
};
/** A started round with letter B, whatever the seed drew. */
const withB = (o: Partial<O> = {}) => ask(make({ questions: ["q1", "q2", "q3"], letters: ["B", "C", "D"], ...o }));

describe("init", () => {
  it("draws one bank question and one letter per round, all different", () => {
    const s = make({ rounds: 5 });
    expect(s).toMatchObject({ phase: "reel", cat: 0, done: false });
    expect(s.categories).toHaveLength(5);
    expect(new Set(s.categories).size).toBe(5);
    for (const q of s.categories) expect(questionByText(q)).toBeTruthy();
    expect(s.letters).toHaveLength(5);
    expect(new Set(s.letters).size).toBe(5);
    for (const l of s.letters!) expect(QUESTION_LETTERS).toContain(l);
    expect(s.letter).toBe(s.letters![0]);
  });

  it("clamps the round count", () => {
    expect(make({ rounds: 1 }).categories).toHaveLength(QUESTION_MIN_ROUNDS);
    expect(make({ rounds: 99 }).categories).toHaveLength(QUESTION_MAX_ROUNDS);
    expect(make({ rounds: NaN }).categories.length).toBeGreaterThanOrEqual(QUESTION_MIN_ROUNDS);
  });

  it("is seeded, and prefers questions and letters not in avoid", () => {
    expect(make()).toEqual(make());
    const seen = make({ rounds: 5 });
    const later = make({ rounds: 5, avoid: seenKeys(seen) });
    expect(later.categories.some((q) => seen.categories.includes(q))).toBe(false);
    expect(later.letters!.some((l) => seen.letters!.includes(l))).toBe(false);
  });

  it("takes fixed questions and letters (by id), ignoring unknown ones", () => {
    const s = make({ questions: ["q1", "nope", "q2", "q3"], letters: ["b", "C", "D"] });
    expect(s.categories).toEqual([NPAT_QUESTIONS[0]!.text, NPAT_QUESTIONS[1]!.text, NPAT_QUESTIONS[2]!.text]);
    expect(s.letters).toEqual(["B", "C", "D"]);
  });
});

describe("rounds", () => {
  it("every round starts with its own reel and letter", () => {
    let s = withB();
    expect(s).toMatchObject({ phase: "ask", cat: 0, letter: "B" });
    s = closeAsk(s); // nobody answered: straight to the verdict
    expect(s.phase).toBe("verdict");
    s = tick(s, s.phaseAt + VERDICT_MS);
    expect(s).toMatchObject({ phase: "reel", cat: 1, letter: "C" });
    s = ask(s);
    expect(s).toMatchObject({ phase: "ask", cat: 1, letter: "C" });
    s = closeAsk(s);
    s = tick(s, s.phaseAt + VERDICT_MS); // round 3's reel
    s = closeAsk(ask(s));
    s = tick(s, s.phaseAt + VERDICT_MS);
    expect(s.phase).toBe("summary");
  });

  it("host skip moves from a verdict to the next reel", () => {
    let s = closeAsk(withB());
    s = next(s, s.phaseAt + 1);
    expect(s).toMatchObject({ phase: "reel", cat: 1, letter: "C" });
  });

  it("everyone locked closes early; a leaver is not waited for", () => {
    let s = withB();
    s = answer(s, "Ann", "Bucket", s.phaseAt + 1);
    s = lock(lock(s, "Ann", s.phaseAt + 2), "Bob", s.phaseAt + 2);
    expect(s.phase).toBe("ask");
    s = settle(s, ["Cy"], s.phaseAt + 3);
    expect(s.phase).toBe("judge");
  });
});

describe("judging and scoring", () => {
  it("every answer with the right letter goes to the judge, with the question as its category", () => {
    const s = play(withB(), { Ann: "Bucket", Bob: "Towel", Cy: "  " });
    expect(s.phase).toBe("judge");
    expect(a(s, "Bob").status).toBe("wrong-letter");
    expect(a(s, "Cy").status).toBe("blank");
    expect(pendingUnknowns(s)).toEqual([{ player: "Ann", category: NPAT_QUESTIONS[0]!.text, letter: "B", text: "Bucket" }]);
  });

  it("10 for a unique valid answer, 5 each when shared, 0 when invalid; niche never matters", () => {
    let s = play(withB({ players: ["Ann", "Bob", "Cy", "Dee"] }), { Ann: "Bucket", Bob: "bucket", Cy: "Bikini", Dee: "Banana phone" });
    s = judged(s, [
      { player: "Ann", ok: true, niche: 90 }, { player: "Bob", ok: true, niche: 90 },
      { player: "Cy", ok: true, niche: 80, reason: "fits" }, { player: "Dee", ok: false, niche: 0, reason: "not a thing" },
    ], s.phaseAt + 1);
    expect(s.phase).toBe("verdict");
    expect(a(s, "Ann")).toMatchObject({ status: "ai-ok", points: 5, shared: true });
    expect(a(s, "Bob")).toMatchObject({ points: 5, shared: true });
    expect(a(s, "Cy")).toMatchObject({ status: "ai-ok", points: 10, shared: false, reason: "fits" });
    expect(a(s, "Dee")).toMatchObject({ status: "ai-no", points: 0 });
    expect(s.points).toEqual({ Ann: 5, Bob: 5, Cy: 10, Dee: 0 });
    expect(winners(s)).toEqual(["Cy"]);
  });

  it("a leading a, an, the or some is dropped before the letter check", () => {
    const s = play(ask(make({ questions: ["q1", "q2", "q3"], letters: ["T", "C", "D"] })), { Ann: "a towel", Bob: "Some tongs", Cy: "an umbrella" });
    expect(a(s, "Ann")).toMatchObject({ status: "unknown", text: "towel" });
    expect(a(s, "Bob")).toMatchObject({ status: "unknown", text: "tongs" });
    expect(a(s, "Cy").status).toBe("wrong-letter");
    expect(pendingUnknowns(s).map((u) => u.text)).toEqual(["towel", "tongs"]);
  });

  it("simple plurals and articles count as the same answer", () => {
    let s = play(ask(make({ questions: ["q1", "q2", "q3"], letters: ["S", "C", "D"] })), { Ann: "Sandwich", Bob: "sandwiches", Cy: "the sandwich" });
    s = judged(s, ["Ann", "Bob", "Cy"].map((p) => ({ player: p, ok: true, niche: 0 })), s.phaseAt + 1);
    expect(s.points).toEqual({ Ann: 5, Bob: 5, Cy: 5 });
  });

  it("a judge that never answers accepts right-letter answers unchecked, for 10", () => {
    let s = play(withB(), { Ann: "Bucket" });
    s = tick(s, s.phaseAt + JUDGE_MS);
    expect(a(s, "Ann")).toMatchObject({ status: "ai-ok", points: 10, reason: "unchecked" });
  });

  it("teammates who say the same thing score it once", () => {
    let s = play(withB({ players: ["Ann", "Bob", "Cy", "Dee"], teams: 2, teamMap: { Ann: 0, Bob: 0, Cy: 1, Dee: 1 } }), { Ann: "Bucket", Bob: "Bucket", Cy: "Ball" });
    s = judged(s, ["Ann", "Bob", "Cy"].map((p) => ({ player: p, ok: true, niche: 0 })), s.phaseAt + 1);
    expect(s.teamPoints).toEqual([10, 10]);
  });

  it("nothing goes to the list review queue", () => {
    let s = play(withB(), { Ann: "Bucket" });
    s = judged(s, [{ player: "Ann", ok: true, niche: 0 }], s.phaseAt + 1);
    expect(reviewItems(s)).toEqual([]);
  });
});

describe("redaction", () => {
  it("later questions and letters stay hidden, and so does the open round's question until its reel ends", () => {
    const s = make({ questions: ["q1", "q2", "q3"], letters: ["B", "C", "D"] });
    const v = redactFor(s, "Ann");
    expect(v.categories).toEqual(["", "", ""]);
    expect(v.letters).toEqual(["B", "", ""]);
    const json = JSON.stringify(v);
    for (const q of [NPAT_QUESTIONS[0]!.text, NPAT_QUESTIONS[1]!.text, NPAT_QUESTIONS[2]!.text]) expect(json).not.toContain(q);
    const asking = redactFor(ask(s), null);
    expect(asking.categories).toEqual([NPAT_QUESTIONS[0]!.text, "", ""]);
    expect(asking.letters).toEqual(["B", "", ""]);
  });
});

describe("seenKeys", () => {
  it("names the questions by id and the letters", () => {
    expect(seenKeys(make({ questions: ["q1", "q2", "q3"], letters: ["B", "C", "D"] }))).toEqual(["nq:q1", "nq:q2", "nq:q3", "np:B", "np:C", "np:D"]);
  });
});

describe("the bank", () => {
  it("has about 150 distinct questions with distinct ids, short enough for the judge", () => {
    expect(NPAT_QUESTIONS.length).toBeGreaterThanOrEqual(140);
    expect(new Set(NPAT_QUESTIONS.map((q) => q.id)).size).toBe(NPAT_QUESTIONS.length);
    expect(new Set(NPAT_QUESTIONS.map((q) => q.text.toLowerCase())).size).toBe(NPAT_QUESTIONS.length);
    for (const q of NPAT_QUESTIONS) {
      expect(q.text.length).toBeLessThanOrEqual(60);
      expect(q.text).toMatch(/^[A-Z][A-Za-z' -]+$/);
    }
  });
});
