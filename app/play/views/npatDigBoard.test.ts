import { describe, expect, it } from "vitest";
import { DIG_ANSWER_MS, JUDGE_MS, REEL_MS, VERDICT_MS } from "../../topicDraft/npat/rules";
import { digClock, digPhase, digRanked, zoneName } from "./npatDigBoard";

describe("dig board", () => {
  it("clocks every phase on its own length, and nothing once done", () => {
    expect(digClock({ phase: "reel", phaseAt: 100, done: false })).toEqual({ deadline: 100 + REEL_MS, total: REEL_MS });
    expect(digClock({ phase: "ask", phaseAt: 100, done: false })).toEqual({ deadline: 100 + DIG_ANSWER_MS, total: DIG_ANSWER_MS });
    expect(digClock({ phase: "judge", phaseAt: 0, done: false })!.total).toBe(JUDGE_MS);
    expect(digClock({ phase: "verdict", phaseAt: 0, done: false })!.total).toBe(VERDICT_MS);
    expect(digClock({ phase: "summary", phaseAt: 0, done: true })).toBeNull();
  });

  it("says which category and what is happening", () => {
    const s = { phase: "ask" as const, cat: 1, categories: ["name", "place", "animal", "thing", "food"], letter: "B", done: false };
    expect(digPhase(s)).toBe("Category 2 of 5 · Place · B · Answering");
    expect(digPhase({ ...s, phase: "judge" })).toContain("Judging");
    expect(digPhase({ ...s, phase: "reel" })).toBe("Drawing the letter");
    expect(digPhase({ ...s, phase: "summary" })).toBe("Final depths");
  });

  it("names question-style rounds by their question", () => {
    const q = { phase: "ask" as const, cat: 1, categories: ["Something soft", "A hobby", ""], letter: "K", letters: ["B", "K", ""], done: false };
    expect(digPhase(q)).toBe("Round 2 of 3 · A hobby · K · Answering");
    expect(digPhase({ ...q, phase: "reel" })).toBe("Round 2 of 3 · Drawing the letter");
    expect(digPhase({ ...q, phase: "summary" })).toBe("Final scores");
  });

  it("ranks by points with shared places and names the zone", () => {
    const rows = digRanked({ players: ["Ann", "Bob", "Cy"], points: { Ann: 100, Bob: 300, Cy: 100 } });
    expect(rows.map((r) => [r.name, r.place, r.depth, r.zone])).toEqual([["Bob", 1, 3000, "Fossil seam"], ["Ann", 2, 1000, "Clay beds"], ["Cy", 2, 1000, "Clay beds"]]);
    expect(zoneName(0)).toBe("Topsoil");
    expect(zoneName(5000)).toBe("The core");
  });
});
