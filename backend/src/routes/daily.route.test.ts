import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// The route's stores and the judge are faked: no database and no model.
const saved: { puzzle: unknown; results: { score: number }[] } = { puzzle: null, results: [] };
vi.mock("../services/daily.service", async (orig) => {
  const real = await orig<typeof import("../services/daily.service")>();
  return {
    ...real,
    prismaDailyStore: {
      async puzzle() { return saved.puzzle; },
      async savePuzzle(_g: string, _d: string, content: unknown) { saved.puzzle = content; return content; },
      async addResult(r: { score: number }) { saved.results.push(r); return true; },
      async scores() { return saved.results.map((r) => r.score); },
      async resultOf() { return saved.results[0]?.score ?? null; },
    },
  };
});
vi.mock("../services/npatJudge.instance", () => ({ cachedVerdict: async () => null }));
vi.mock("../services/trivia.service", () => ({ getFeud: vi.fn(), getJeopardy: vi.fn(), isTriviaPool: () => false }));
vi.mock("../services/costimation.service", () => ({ pickProducts: vi.fn(), prismaCostStore: {} }));

import router from "./daily.route";
import { dayKey, npatPuzzle, npatRescore } from "../services/daily.service";
import { entriesOf } from "../shared/topicDraft/npat/source";
import { startsWith } from "../shared/topicDraft/npat/rules";

let server: Server;
let base = "";
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/daily", router);
  await new Promise<void>((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/daily`;
});
afterAll(() => { server.close(); });
beforeEach(() => { saved.puzzle = null; saved.results = []; });

describe("daily npat route", () => {
  it("stores the server's re-score, not a forged high score", async () => {
    const puzzle = npatPuzzle(dayKey());
    saved.puzzle = puzzle;
    // One real list answer; the other four categories are left blank, so the true score is well under 1.
    const cat = puzzle.categories[0]!;
    const e = entriesOf(cat).find((x) => startsWith(puzzle.letter, x.name))!;
    const answers = [{ category: cat, text: e.name }];
    const truth = (await npatRescore(puzzle, answers, async () => null)).score;
    expect(truth).toBeLessThan(1);
    const res = await fetch(`${base}/npat/result`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ player: "player-abcdef12", score: 1, answers }),
    });
    expect(res.status).toBe(200);
    expect(saved.results).toHaveLength(1);
    expect(saved.results[0]!.score).toBe(truth);
  });

  it("rebuilds a saved four-category puzzle to five categories", async () => {
    const good = npatPuzzle(dayKey());
    saved.puzzle = { letter: good.letter, categories: good.categories.slice(0, 4) };
    const res = await fetch(`${base}/npat`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { content: { letter: string; categories: string[] } };
    expect(body.content.categories).toHaveLength(5);
    expect(body.content.categories).toEqual(good.categories);
  });
});
