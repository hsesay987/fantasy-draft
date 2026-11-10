import { describe, expect, it, vi } from "vitest";

const { getJeopardy } = vi.hoisted(() => ({
  getJeopardy: vi.fn(async (_pool: string, _avoid: string[], _s?: unknown, _g?: unknown, _r?: unknown, count = 4) =>
    Array.from({ length: count }, (_, i) => ({ name: `Cat ${i}`, clues: [1, 2, 3, 4].map((n) => ({ q: `q${i}${n}`, right: "r", wrong: ["a", "b", "c"] })) })),
  ),
}));
vi.mock("../services/trivia.service", () => ({ getFeud: vi.fn(), getJeopardy, isTriviaPool: (p: unknown) => p === "superheroes" || p === "villains" }));

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

describe("quizFor mixed topics", () => {
  const ask = (pools: string[]) => quizFor({ format: "partytrivia", pool: pools[0], pools, seed: 5, opts: { teamSize: 15 } });
  const forPool = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ name: `${p} ${i}`, clues: [1, 2, 3, 4].map((k) => ({ q: `${p}${i}${k}`, right: "r", wrong: ["a", "b", "c"] })) }));
  it("splits the categories evenly (5 gives 3 and 2) and shuffles them", async () => {
    getJeopardy.mockClear();
    const per = (_p: string, _a: string[], _s?: unknown, _g?: unknown, _r?: unknown, count = 4) => forPool(_p, count);
    getJeopardy.mockImplementationOnce(async (...a: [string, string[]]) => per(...a, undefined, undefined, undefined, 3)).mockImplementationOnce(async (...a: [string, string[]]) => per(...a, undefined, undefined, undefined, 2));
    const quiz = await ask(["superheroes", "villains"]);
    expect(getJeopardy.mock.calls.map((c) => [c[0], c[5]])).toEqual([["superheroes", 3], ["villains", 2]]);
    const names = quiz!.categories!.map((c) => c.name);
    expect(names).toHaveLength(5);
    expect(new Set(names).size).toBe(5);
  });
  it("shuffles by the given seed: a permutation, and other seeds can order it differently", async () => {
    const orders = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      getJeopardy.mockClear();
      getJeopardy.mockImplementationOnce(async () => forPool("S", 3)).mockImplementationOnce(async () => forPool("V", 2));
      const quiz = await quizFor({ format: "partytrivia", pool: "superheroes", pools: ["superheroes", "villains"], opts: { teamSize: 15 } }, [], seed);
      const names = quiz!.categories!.map((c) => c.name);
      expect([...names].sort()).toEqual(["S 0", "S 1", "S 2", "V 0", "V 1"]);
      orders.add(names.join());
    }
    expect(orders.size).toBeGreaterThan(1);
  });
  it.each([
    ["pools only", { pools: ["superheroes", "villains"] }],
    ["pool that differs from pools[0]", { pool: "villains", pools: ["superheroes", "villains"] }],
  ])("a room created with %s gets a mixed server quiz", async (_n, pick) => {
    const app = express();
    app.use(express.json());
    app.use("/play-rooms", router);
    const server = await new Promise<Server>((res) => { const s = app.listen(0, () => res(s)); });
    try {
      getJeopardy.mockClear();
      const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/play-rooms`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Ann", setup: { format: "partytrivia", opts: { teamSize: 15 }, ...pick } }) });
      expect(res.status).toBe(200);
      expect(getJeopardy.mock.calls.map((c) => c[0]).slice(0, 2).sort()).toEqual(["superheroes", "villains"]);
    } finally {
      server.close();
    }
  });
  it("fills from the other topic when one fails", async () => {
    getJeopardy.mockClear();
    getJeopardy.mockImplementationOnce(async (_p: string, _a: string[], _s?: unknown, _g?: unknown, _r?: unknown, count = 4) => forPool("S", count)).mockImplementationOnce(async () => { throw new Error("down"); });
    getJeopardy.mockImplementationOnce(async (_p: string, _a: string[], _s?: unknown, _g?: unknown, _r?: unknown, count = 4) => forPool("S2", count));
    const quiz = await ask(["superheroes", "villains"]);
    expect(quiz!.categories).toHaveLength(5);
    expect(getJeopardy.mock.calls[2]![0]).toBe("superheroes");
  });
  it("returns undefined when every topic fails", async () => {
    getJeopardy.mockImplementationOnce(async () => { throw new Error("down"); }).mockImplementationOnce(async () => { throw new Error("down"); });
    expect(await ask(["superheroes", "villains"])).toBeUndefined();
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
