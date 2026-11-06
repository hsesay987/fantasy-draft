import { describe, expect, it, vi } from "vitest";

const { getJeopardy } = vi.hoisted(() => ({
  getJeopardy: vi.fn(async (_pool: string, _avoid: string[], _s?: unknown, _g?: unknown, _r?: unknown, count = 4) =>
    Array.from({ length: count }, (_, i) => ({ name: `Cat ${i}`, clues: [1, 2, 3, 4].map((n) => ({ q: `q${i}${n}`, right: "r", wrong: ["a", "b", "c"] })) })),
  ),
}));
vi.mock("../services/trivia.service", () => ({ getFeud: vi.fn(), getJeopardy, isTriviaPool: (p: unknown) => p === "superheroes" }));

import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import router, { quizFor } from "./playRooms.route";
import { act, createRoom, joinRoom, leaveRoom, needsQuiz, startRoom } from "../services/playRooms";

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

describe("POST /:code/start after a game", () => {
  it("leaves a refused Play again with no new bank on the room", async () => {
    const cats = await getJeopardy("superheroes", [], undefined, undefined, undefined, 4);
    const made = createRoom({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10 } }, "Ann", { categories: cats }) as any;
    const r = made.room, ann = made.seat.token;
    const bob = (joinRoom(r.code, "Bob") as any).seat.token;
    expect(startRoom(r, ann)).toEqual({ ok: true });
    leaveRoom(r, bob);
    for (let guard = 0; r.status === "playing" && guard < 100; guard++) {
      if (r.state.phase === "question") act(r, ann, { type: "answer", choice: r.state.questions[r.state.round].options[0] });
      else act(r, ann, { type: "next" });
    }
    expect(r.status).toBe("done");
    const bank = r.setup.quiz;

    const app = express();
    app.use(express.json());
    app.use("/play-rooms", router);
    const server = await new Promise<Server>((res) => { const s = app.listen(0, () => res(s)); });
    try {
      getJeopardy.mockClear();
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/play-rooms/${r.code}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: ann }) });
      expect(res.status).toBe(400);
      expect(r.setup.quiz).toBe(bank);
      expect(needsQuiz(r)).toBe(true);
    } finally {
      server.close();
    }
  });
});
