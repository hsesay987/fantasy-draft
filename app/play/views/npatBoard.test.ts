import { describe, expect, it } from "vitest";
import type { NPAnswer, NPRound } from "../../topicDraft/formats/npat";
import { bestAnswer, groupAnswers, npatClock, placeOf, roundTotals, tierBadge } from "./npatBoard";
import { REVEAL_MS, VOTE_MS } from "../../topicDraft/npat/rules";

const ok = (text: string, entry: string, tier: NPAnswer["tier"], points: number, shared = false): NPAnswer => ({ text, entry, status: "ok", tier, points, shared });
const unknown = (text: string, accepted: boolean, points = 0): NPAnswer => ({ text, entry: null, status: "unknown", accepted, points, ...(accepted ? { tier: "common" as const, shared: false } : {}) });
const wrong = (text: string): NPAnswer => ({ text, entry: null, status: "wrong-letter", points: 0 });
const blank: NPAnswer = { text: "", entry: null, status: "blank", points: 0 };

describe("groupAnswers", () => {
  it("groups The Hulk and hulk together, by entry and by typed text", () => {
    const byEntry = groupAnswers({ Ann: ok("The Hulk", "Hulk", "common", 5, true), Bob: ok("hulk", "Hulk", "common", 5, true) }, ["Ann", "Bob"]);
    expect(byEntry.map((g) => [g.text, g.members])).toEqual([["Hulk", ["Ann", "Bob"]]]);
    expect(byEntry[0]!.shared).toBe(true);
    const byText = groupAnswers({ Ann: unknown("The Hulk", true, 10), Bob: unknown("hulk", true, 10) }, ["Ann", "Bob"]);
    expect(byText.map((g) => [g.text, g.members])).toEqual([["The Hulk", ["Ann", "Bob"]]]);
  });

  it("groups an alias with its entry's name", () => {
    const g = groupAnswers({ Ann: ok("Bruce Banner", "Hulk", "solid", 15, true), Bob: ok("Hulk", "Hulk", "solid", 15, true) }, ["Ann", "Bob"]);
    expect(g).toHaveLength(1);
    expect(g[0]!.typed).toEqual(["Bruce Banner", "Hulk"]);
  });

  it("orders by tier points, then by size, with invalid and blank answers last", () => {
    const answers: Record<string, NPAnswer> = {
      Ann: ok("Hulk", "Hulk", "common", 10),
      Bob: wrong("Batman"),
      Cy: ok("Havok", "Havok", "unicorn", 100),
      Di: blank,
      Ed: ok("Hawkeye", "Hawkeye", "solid", 15, true),
      Fay: ok("hawkeye", "Hawkeye", "solid", 15, true),
      Gus: ok("Hellboy", "Hellboy", "solid", 30),
      Hal: unknown("Hypno Man", false),
    };
    const g = groupAnswers(answers, Object.keys(answers));
    expect(g.map((x) => x.text)).toEqual(["Havok", "Hawkeye", "Hellboy", "Hulk", "Hypno Man", "Batman", "—"]);
    expect(g.map((x) => x.kind)).toEqual(["ok", "ok", "ok", "ok", "voted-out", "wrong-letter", "blank"]);
  });

  it("puts every blank in one group and counts an accepted unknown as a scoring answer", () => {
    const g = groupAnswers({ Ann: blank, Bob: blank, Cy: unknown("Hoppy", true, 10) }, ["Ann", "Bob", "Cy"]);
    expect(g.map((x) => [x.kind, x.members])).toEqual([["accepted", ["Cy"]], ["blank", ["Ann", "Bob"]]]);
  });
});

describe("tierBadge", () => {
  it("names the tier and carries the answer's points", () => {
    expect(tierBadge(ok("Havok", "Havok", "deep", 43, true))).toEqual({ tier: "deep", label: "Deep Cut", points: 43 });
    expect(tierBadge(ok("Hulk", "Hulk", "obvious", 15))).toEqual({ tier: "obvious", label: "Too Obvious", points: 15 });
    expect(tierBadge(wrong("Batman"))).toBeNull();
    expect(tierBadge(blank)).toBeNull();
  });
});

describe("round recap", () => {
  const round: NPRound = {
    letter: "H",
    answers: {
      Ann: [ok("Hulk", "Hulk", "common", 10), ok("Hippo", "Hippo", "common", 5, true)],
      Bob: [ok("Havok", "Havok", "unicorn", 100), ok("hippo", "Hippo", "common", 5, true)],
      Cy: [blank, wrong("Zebra")],
    },
  };
  it("adds up each player's round", () => {
    expect(roundTotals(round, ["Ann", "Bob", "Cy"])).toEqual({ Ann: 15, Bob: 105, Cy: 0 });
  });
  it("finds the round's best answer", () => {
    expect(bestAnswer(round, ["Ann", "Bob", "Cy"], ["superhero", "animal"])).toEqual({ player: "Bob", text: "Havok", category: "superhero", points: 100 });
    expect(bestAnswer({ letter: "H", answers: { Cy: [blank] } }, ["Cy"], ["animal"])).toBeNull();
  });
});

describe("placeOf", () => {
  it("shares a place on a tie", () => {
    const scores = [50, 30, 30, 10];
    expect(scores.map((_, i) => placeOf(scores, i))).toEqual([1, 2, 2, 4]);
  });
});

describe("npatClock", () => {
  const base = { phaseAt: 1000, roundMs: 60_000, done: false };
  it("runs the round's clock while writing and the phase clocks after", () => {
    expect(npatClock({ ...base, phase: "write" })).toEqual({ deadline: 61_000, total: 60_000 });
    expect(npatClock({ ...base, phase: "vote" })).toEqual({ deadline: 1000 + VOTE_MS, total: VOTE_MS });
    expect(npatClock({ ...base, phase: "reveal" })).toEqual({ deadline: 1000 + REVEAL_MS, total: REVEAL_MS });
    expect(npatClock({ ...base, phase: "summary" })).toEqual({ deadline: 1000 + REVEAL_MS, total: REVEAL_MS });
    expect(npatClock({ ...base, phase: "summary", done: true })).toBeNull();
  });
});
