import { describe, expect, it } from "vitest";
import { tierPools } from "../shared/topicDraft/trivia/tiers";
import { DAILY_TOPICS, dayNumber, isDailyGame, puzzleFor, statsOf, submitResult, topicFor, type DailyStore } from "./daily.service";
import { getJeopardy, memoryStore } from "./trivia.service";

const memory = (): DailyStore & { builds: number } => {
  const puzzles = new Map<string, unknown>();
  const results = new Map<string, number>();
  return {
    builds: 0,
    async puzzle(g, d) { return puzzles.get(`${g}|${d}`) ?? null; },
    async savePuzzle(g, d, c) { if (!puzzles.has(`${g}|${d}`)) puzzles.set(`${g}|${d}`, c); return puzzles.get(`${g}|${d}`); },
    async addResult(r) { const k = `${r.game}|${r.day}|${r.player}`; if (results.has(k)) return false; results.set(k, r.score); return true; },
    async scores(g, d) { return [...results.entries()].filter(([k]) => k.startsWith(`${g}|${d}|`)).map(([, v]) => v); },
    async resultOf(g, d, p) { return results.get(`${g}|${d}|${p}`) ?? null; },
  };
};

describe("daily puzzles", () => {
  it("numbers days from launch", () => {
    expect(dayNumber("2026-10-31")).toBe(1);
    expect(dayNumber("2026-11-30")).toBe(31);
    expect(dayNumber("2027-01-01")).toBe(63);
  });
  it("rotates topics and keeps Summit and Hot Air on different topics each day", () => {
    for (const d of ["2026-11-01", "2026-11-02", "2026-12-25"]) expect(topicFor("summit", d)).not.toBe(topicFor("hotair", d));
    expect(topicFor("summit", "2026-11-01")).not.toBe(topicFor("summit", "2026-11-02"));
  });
  it("knows its games", () => {
    expect(isDailyGame("summit")).toBe(true);
    expect(isDailyGame("jeopardy")).toBe(false);
  });
  it("gives Top Rung its own topic, different from Summit's and Hot Air's every day", () => {
    expect(isDailyGame("toprung")).toBe(true);
    for (let i = 0; i < 40; i++) {
      const day = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
      expect(topicFor("toprung", day)).not.toBe(topicFor("summit", day));
      expect(topicFor("toprung", day)).not.toBe(topicFor("hotair", day));
      expect(DAILY_TOPICS).toContain(topicFor("toprung", day));
    }
  });
  it.each(DAILY_TOPICS)("%s can fill a whole Top Rung climb and its spares from the seeded bank", async (pool) => {
    const categories = await getJeopardy(pool, [], memoryStore(), null);
    const seen = new Set<string>();
    // The same test the climb applies: four distinct options, and no question asked twice.
    const usable = tierPools(categories, 1).map((tier) => tier.filter((q) => {
      if (seen.has(q.q) || new Set(q.options).size !== 4) return false;
      seen.add(q.q);
      return true;
    }));
    for (const tier of usable) expect(tier.length).toBeGreaterThanOrEqual(4);
  });
  it("builds a day's puzzle once and serves the same one after", async () => {
    const s = memory();
    let n = 0;
    const build = async () => ({ v: ++n });
    expect(await puzzleFor(s, "summit", "2026-11-05", build)).toEqual({ v: 1 });
    expect(await puzzleFor(s, "summit", "2026-11-05", build)).toEqual({ v: 1 });
    expect(await puzzleFor(s, "summit", "2026-11-06", build)).toEqual({ v: 2 });
  });
});

describe("daily stats", () => {
  it("buckets scores by tenths and works out the share of players below you", () => {
    const st = statsOf([0.05, 0.15, 0.15, 0.55, 0.95, 1], 0.55);
    expect(st.buckets).toEqual([1, 2, 0, 0, 0, 1, 0, 0, 0, 2]);
    expect(st.players).toBe(6);
    expect(st.percentile).toBe(50);
    expect(st.best).toBe(1);
  });
  it("counts only a player's first result", async () => {
    const s = memory();
    await submitResult(s, { game: "hotair", day: "2026-11-05", player: "a", score: 0.4 });
    const again = await submitResult(s, { game: "hotair", day: "2026-11-05", player: "a", score: 0.9 });
    expect(again.score).toBe(0.4);
    expect(again.stats.players).toBe(1);
  });
  it("an empty day has no percentile", () => expect(statsOf([], 0.5).percentile).toBeNull());
});
