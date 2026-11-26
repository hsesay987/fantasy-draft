import { describe, expect, it } from "vitest";
import { tierPools } from "../shared/topicDraft/trivia/tiers";
import { createNpatDailyCap, DAILY_TOPICS, dayNumber, isDailyGame, NPAT_MAX, npatOverlay, npatPlays, npatPuzzle, npatRescore, peckingPuzzle, puzzleFor, recordNpatDaily, statsOf, submitResult, topicFor, type DailyStore } from "./daily.service";
import { NPAT_CATEGORIES } from "../shared/topicDraft/npat/categories";
import { entriesOf, lettersAvailable, lookup, MIN_PER_LETTER } from "../shared/topicDraft/npat/source";
import { normAnswer, startsWith } from "../shared/topicDraft/npat/rules";
import type { NpatHistoryStore } from "./npatHistory.service";
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
    // A fixed seed: the bank must fill a climb, not every random draw of four categories.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const categories = await getJeopardy(pool, [], memoryStore(), null, rand);
    const seen = new Set<string>();
    // The same test the climb applies: four distinct options, and no question asked twice.
    const usable = tierPools(categories, 1).map((tier) => tier.filter((q) => {
      if (seen.has(q.q) || new Set(q.options).size !== 4) return false;
      seen.add(q.q);
      return true;
    }));
    for (const tier of usable) expect(tier.length).toBeGreaterThanOrEqual(4);
  });
  it("deals Pecking Order five mixed questions a day, the same all day and different the next", () => {
    expect(isDailyGame("pecking")).toBe(true);
    const a = peckingPuzzle("2026-11-13");
    expect(peckingPuzzle("2026-11-13")).toEqual(a);
    expect(a.questions.map((q) => q.kind)).toEqual(["rank", "name", "rank", "name", "rank"]);
    const b = peckingPuzzle("2026-11-14");
    expect(b.questions).toHaveLength(5);
    expect(b.questions.map((q) => q.answer.names[0])).not.toEqual(a.questions.map((q) => q.answer.names[0]));
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


describe("NPAT daily", () => {
  const days = Array.from({ length: 60 }, (_, i) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10));

  it("is a daily game", () => expect(isDailyGame("npat")).toBe(true));

  it("is the same all day: five distinct categories and a letter every one of them can answer, hard letters off", () => {
    const ids = NPAT_CATEGORIES.map((c) => c.id);
    for (const day of days) {
      const p = npatPuzzle(day);
      expect(npatPuzzle(day)).toEqual(p);
      expect(p.categories).toHaveLength(5);
      expect(new Set(p.categories).size).toBe(5);
      for (const c of p.categories) expect(ids).toContain(c);
      expect(lettersAvailable(p.categories, false)).toContain(p.letter);
      // The rooms' rule: at least MIN_PER_LETTER (15) answers start with the letter in each category.
      expect(MIN_PER_LETTER).toBe(15);
      for (const c of p.categories) {
        expect(entriesOf(c).filter((e) => startsWith(p.letter, e.name, e.also)).length).toBeGreaterThanOrEqual(15);
      }
      expect(["Q", "X", "Z", "Y"]).not.toContain(p.letter);
    }
  });

  it("changes from day to day", () => {
    expect(npatPuzzle("2026-11-18")).not.toEqual(npatPuzzle("2026-11-19"));
    const distinct = new Set(days.map((d) => JSON.stringify(npatPuzzle(d))));
    expect(distinct.size).toBeGreaterThan(days.length * 0.8);
  });

  it("overlays only the day's entries whose history moves their tier", () => {
    const p = { letter: "B", categories: ["animal", "name", "place", "thing", "food"] };
    const bear = entriesOf("animal").find((e) => startsWith("B", e.name, e.also) && e.tier === "unicorn")!;
    const plain = entriesOf("animal").find((e) => startsWith("B", e.name, e.also) && e.tier === "solid")!;
    const other = entriesOf("animal").find((e) => !startsWith("B", e.name, e.also) && e.tier === "unicorn")!;
    const counts: Record<string, { count: number; plays: number }> = {
      [`animal|${normAnswer(bear.name)}`]: { count: 10, plays: 100 }, // 10%: moves to Too Obvious
      [`animal|${normAnswer(plain.name)}`]: { count: 1, plays: 100 }, // 1%: stays
      [`animal|${normAnswer(other.name)}`]: { count: 50, plays: 100 }, // not today's letter: left out
    };
    const overlay = npatOverlay(p, (c, a) => counts[`${c}|${a}`] ?? null);
    expect(Object.keys(overlay).sort()).toEqual([...p.categories].sort());
    expect(overlay.animal).toEqual({ [normAnswer(bear.name)]: "obvious" });
    expect(overlay.name).toEqual({});
  });

  it("an empty or failing history gives an empty overlay", () => {
    const p = npatPuzzle("2026-11-18");
    expect(Object.values(npatOverlay(p, () => null)).every((o) => Object.keys(o).length === 0)).toBe(true);
    expect(Object.values(npatOverlay(p, () => { throw new Error("down"); })).every((o) => Object.keys(o).length === 0)).toBe(true);
  });

  describe("recording a play", () => {
    const p = { letter: "B", categories: ["animal", "name", "place", "thing", "food"] };
    const known = entriesOf("animal").find((e) => normAnswer(e.name).startsWith("b"))!;

    it("re-checks every answer: list answers by their entry's name, unknowns with the right letter as review rows, the rest dropped", () => {
      const plays = npatPlays(p, [
        { category: "animal", text: `  ${known.name.toUpperCase()} ` },
        { category: "name", text: "Bzzzqqq Unlisted" },
        { category: "place", text: "Paris" }, // wrong letter
        { category: "thing", text: "   " },
      ]);
      expect(plays).toEqual([
        { category: "animal", answer: known.name },
        { category: "review:name", answer: "Bzzzqqq Unlisted" },
      ]);
    });

    it("refuses bad input: not a list, more than 5, long or non-string text, other days' categories, repeats", () => {
      expect(npatPlays(p, "nope")).toBeNull();
      expect(npatPlays(p, null)).toBeNull();
      expect(npatPlays(p, Array.from({ length: 6 }, () => ({ category: "animal", text: "Bear" })))).toBeNull();
      expect(npatPlays(p, [{ category: "animal", text: "B".repeat(41) }])).toBeNull();
      expect(npatPlays(p, [{ category: "animal", text: 42 }])).toBeNull();
      expect(npatPlays(p, [{ category: "film", text: "Batman" }])).toBeNull();
      expect(npatPlays(p, [{ category: "review:animal", text: "Bear" }])).toBeNull();
      expect(npatPlays(p, [{ category: "animal", text: "Bear" }, { category: "animal", text: "Bat" }])).toBeNull();
      expect(npatPlays(p, [{ category: "animal", text: "B".repeat(40) }])).toEqual([{ category: "review:animal", answer: "B".repeat(40) }]);
      expect(npatPlays(p, [])).toEqual([]);
    });

    it("sends the plays to the store under the player's daily id, and swallows a store failure", async () => {
      const calls: unknown[][] = [];
      const store: NpatHistoryStore = { async load() {}, async record(...a) { calls.push(a); }, lookup: () => null };
      await recordNpatDaily(store, "2026-11-18", "player-123", [{ category: "animal", answer: "Bear" }]);
      expect(calls).toEqual([["2026-11-18", "player-123", [{ category: "animal", answer: "Bear" }]]]);
      await recordNpatDaily(store, "2026-11-18", "player-123", []);
      expect(calls).toHaveLength(1); // nothing to record
      const broken: NpatHistoryStore = { async load() {}, async record() { throw new Error("db down"); }, lookup: () => null };
      const err = console.error;
      console.error = () => {};
      try {
        await expect(recordNpatDaily(broken, "2026-11-18", "p", [{ category: "animal", answer: "Bear" }])).resolves.toBeUndefined();
      } finally {
        console.error = err;
      }
      await expect(recordNpatDaily(null, "2026-11-18", "p", [{ category: "animal", answer: "Bear" }])).resolves.toBeUndefined();
    });
  });

  describe("re-scoring a play on the server", () => {
    const p = { letter: "B", categories: ["animal", "name", "place", "thing", "food"] };
    const uni = (c: string) => entriesOf(c).find((e) => e.tier === "unicorn" && startsWith("B", e.name) && lookup(c, e.name)?.name === e.name)!;
    const none = async () => null;

    it("the most a run can score is 500, and five Unicorns reach it", async () => {
      expect(NPAT_MAX).toBe(500);
      const r = await npatRescore(p, p.categories.map((category) => ({ category, text: uni(category).name })), none);
      expect(r.total).toBe(500);
      expect(r.score).toBe(1);
    });

    it("scores list answers by tier, wrong letters and blanks 0", async () => {
      const r = await npatRescore(p, [{ category: "animal", text: uni("animal").name }, { category: "name", text: "Paris" }, { category: "place", text: "" }], none);
      expect(r.points).toEqual([100, 0, 0, 0, 0]);
    });

    it("an unknown with a stored AI verdict scores by its niche tier (capped at rare), a rejected one 0", async () => {
      const verdictOf = async (_c: string, _l: string, t: string) => (t === "Bzzzqqq" ? { ok: true, niche: 90 } : t === "Bnope" ? { ok: false, niche: 0 } : null);
      const r = await npatRescore(p, [{ category: "animal", text: "Bzzzqqq" }, { category: "name", text: "Bnope" }], verdictOf);
      expect(r.points).toEqual([60, 0, 0, 0, 0]);
    });

    it("a forged claim of an AI-accepted answer with no stored verdict only gets the fallback: common if it starts with the letter, else 0", async () => {
      const r = await npatRescore(p, [{ category: "animal", text: "Bzzzqqq" }, { category: "name", text: "Zzzz" }], none);
      expect(r.points).toEqual([10, 0, 0, 0, 0]);
      expect(r.total).toBe(10);
    });

    it("a failing verdict lookup falls back instead of throwing", async () => {
      const r = await npatRescore(p, [{ category: "animal", text: "Bzzzqqq" }], async () => { throw new Error("db"); });
      expect(r.points[0]).toBe(10);
    });

    it("uses the history overlay's moved tier for list answers", async () => {
      const e = uni("animal");
      const r = await npatRescore(p, [{ category: "animal", text: e.name }], none, { animal: { [normAnswer(e.name)]: "obvious" } });
      expect(r.points[0]).toBe(15);
    });
  });

  it("tells whether a result was the player's first of the day", async () => {
    const s = memory();
    expect((await submitResult(s, { game: "npat", day: "2026-11-18", player: "a", score: 0.2 })).added).toBe(true);
    expect((await submitResult(s, { game: "npat", day: "2026-11-18", player: "a", score: 0.9 })).added).toBe(false);
  });
});

describe("NPAT daily history cap", () => {
  it("lets one IP record 3 daily plays a day; a 4th that day never reaches the store", async () => {
    const cap = createNpatDailyCap();
    const calls: string[] = [];
    const store: NpatHistoryStore = { async load() {}, async record(_d, p) { calls.push(p); }, lookup: () => null };
    for (const p of ["a1", "a2", "a3", "a4", "a5"]) {
      if (cap.allow("1.2.3.4", "2026-11-18")) await recordNpatDaily(store, "2026-11-18", p, [{ category: "animal", answer: "Bear" }]);
    }
    expect(calls).toEqual(["a1", "a2", "a3"]);
  });
  it("a new day resets the cap", () => {
    const cap = createNpatDailyCap();
    for (let i = 0; i < 3; i++) expect(cap.allow("ip", "2026-11-18")).toBe(true);
    expect(cap.allow("ip", "2026-11-18")).toBe(false);
    expect(cap.allow("ip", "2026-11-19")).toBe(true);
  });
  it("caps each IP on its own", () => {
    const cap = createNpatDailyCap();
    for (let i = 0; i < 3; i++) cap.allow("a", "2026-11-18");
    expect(cap.allow("a", "2026-11-18")).toBe(false);
    expect(cap.allow("b", "2026-11-18")).toBe(true);
  });
  it("keeps only the latest two days", () => {
    const cap = createNpatDailyCap();
    for (const d of ["2026-11-16", "2026-11-17", "2026-11-18"]) cap.allow("a", d);
    expect(cap.days()).toEqual(["2026-11-17", "2026-11-18"]);
  });
});
