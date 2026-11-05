import { describe, expect, it, vi } from "vitest";

const { getJeopardy } = vi.hoisted(() => ({
  getJeopardy: vi.fn(async (_pool: string, _avoid: string[], _s?: unknown, _g?: unknown, _r?: unknown, count = 4) =>
    Array.from({ length: count }, (_, i) => ({ name: `Cat ${i}`, clues: [1, 2, 3, 4].map((n) => ({ q: `q${i}${n}`, right: "r", wrong: ["a", "b", "c"] })) })),
  ),
}));
vi.mock("../services/trivia.service", () => ({ getFeud: vi.fn(), getJeopardy, isTriviaPool: (p: unknown) => p === "superheroes" }));

import { quizFor } from "./playRooms.route";

describe("quizFor party trivia", () => {
  it.each([10, 15, 20])("returns enough questions for %i", async (n) => {
    const quiz = await quizFor({ format: "partytrivia", pool: "superheroes", opts: { teamSize: n } });
    const questions = quiz!.categories!.reduce((sum, c) => sum + c.clues.length, 0);
    expect(questions).toBeGreaterThanOrEqual(n);
    expect(getJeopardy).toHaveBeenLastCalledWith("superheroes", [], undefined, undefined, undefined, Math.ceil(n / 4) + 1);
  });
  it("passes along what the room has seen, and ignores non-trivia topics", async () => {
    await quizFor({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10, avoid: ["cat:X"] } }, ["cat:Y"]);
    expect(getJeopardy.mock.lastCall![1]).toEqual(["cat:Y", "cat:X"]);
    expect(await quizFor({ format: "partytrivia", pool: "nope", opts: { teamSize: 10 } })).toBeUndefined();
  });
});
