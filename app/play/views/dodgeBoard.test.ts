import { describe, expect, it } from "vitest";
import type { DodgeRound } from "../../topicDraft/formats/dodge";
import { ANSWER_MS, REVEAL_MS } from "../../topicDraft/dodge/rules";
import { dodgeClock, dodgePhase, dodgeRanked, revealGroups } from "./dodgeBoard";

const P = ["Ann", "Ben", "Cat", "Dan", "Eve"];
const r: DodgeRound = {
  category: "Pizza toppings", chosen: "Ann",
  answers: { Ann: "Pepperoni", Ben: "pepperoni", Cat: "peperoni", Dan: "Ham", Eve: "" },
  status: { Ann: "chosen", Ben: "match", Cat: "match", Dan: "dodge", Eve: "blank" },
  judged: ["Cat"], gained: { Ann: 2, Ben: -1, Cat: -1, Dan: 1, Eve: 0 },
};

describe("revealGroups", () => {
  it("puts matches beside the chosen player and groups the dodges", () => {
    const g = revealGroups({ ...r, answers: { ...r.answers, Eve: "ham" }, status: { ...r.status, Eve: "dodge" } }, P);
    expect(g.chosen).toEqual({ name: "Ann", text: "Pepperoni" });
    expect(g.matched).toEqual([{ name: "Ben", text: "pepperoni", judged: false }, { name: "Cat", text: "peperoni", judged: true }]);
    expect(g.dodged).toEqual([{ text: "Ham", names: ["Dan", "Eve"] }]);
    expect(g.blank).toEqual([]);
  });
  it("lists blanks apart", () => {
    expect(revealGroups(r, P).blank).toEqual(["Eve"]);
  });
});

describe("board lines", () => {
  it("clocks each phase and stops when done", () => {
    expect(dodgeClock({ phase: "answer", phaseAt: 100, done: false })).toEqual({ deadline: 100 + ANSWER_MS, total: ANSWER_MS });
    expect(dodgeClock({ phase: "reveal", phaseAt: 0, done: false })!.total).toBe(REVEAL_MS);
    expect(dodgeClock({ phase: "reveal", phaseAt: 0, done: true })).toBeNull();
  });
  it("names the round and the chosen player", () => {
    expect(dodgePhase({ phase: "answer", round: 1, total: 5, players: P, done: false })).toBe("Round 2 of 5 · Ben is chosen · Answering");
    expect(dodgePhase({ phase: "answer", round: 1, total: 5, players: P, done: true })).toBe("Final scores");
  });
  it("ranks with shared places", () => {
    expect(dodgeRanked({ players: ["a", "b", "c"], points: { a: 1, b: 3, c: 1 } })).toEqual([
      { name: "b", points: 3, place: 1 }, { name: "a", points: 1, place: 2 }, { name: "c", points: 1, place: 2 },
    ]);
  });
});
