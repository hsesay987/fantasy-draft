import { beforeEach, describe, expect, it } from "vitest";
import { generateCategory, generateSurvey, genBudget, getFeud, getJeopardy, memoryStore, pickFresh, resetBudget, resetSeeded, validateCategory, validateSurvey, verifyClue, type Gen } from "./trivia.service";
import type { LLM } from "./judge.service";

const good = (n: number) => ({
  name: `Test Category ${n}`,
  clues: [1, 2, 3, 4].map((i) => ({ q: `Which of these is test answer number ${n}-${i}?`, right: `Right ${n}-${i}`, wrong: [`Nope A${n}-${i}`, `Nope B${n}-${i}`, `Nope C${n}-${i}`] })),
});

/** Writer returns a new category each call; checker answers by recognising the "Right" option. */
function fakeGen(opts: { checkerAgrees?: boolean } = {}): Gen & { calls: number } {
  let n = 0;
  const gen = {
    calls: 0,
    writer: { complete: async (_s: string, u: string) => {
      gen.calls++;
      if (u.includes("Family Feud") || /survey/i.test(u)) { n++; return JSON.stringify({ q: `Name a thing for survey ${n}`, answers: ["a1", "a2", "a3", "a4", "a5"].map((x) => `${x}-${n}`), decoys: ["d1", "d2", "d3", "d4", "d5"].map((x) => `${x}-${n}`) }); }
      n++;
      return JSON.stringify(good(1000 + n));
    } } as LLM,
    checker: { complete: async (s: string, u: string) => {
      if (/yes or no/i.test(s)) return /"a\d-\d+"/.test(u) ? "yes" : /"d(1|2|3)-/.test(u) ? "no" : "yes";
      if (opts.checkerAgrees === false) return "Z";
      const lines = u.split("\n").filter((l) => /^[A-D]\) /.test(l));
      const idx = lines.findIndex((l) => /\) Right /.test(l));
      return "ABCD"[idx] ?? "A";
    } } as LLM,
  };
  return gen;
}

beforeEach(() => { resetBudget(); resetSeeded(); });

describe("validation", () => {
  const empty = { names: new Set<string>(), questions: new Set<string>() };
  it("accepts a well-formed category", () => expect(validateCategory(good(1), empty)?.clues).toHaveLength(4));
  it("rejects wrong clue count, duplicate options, duplicate names and give-away clues", () => {
    expect(validateCategory({ ...good(1), clues: good(1).clues.slice(0, 3) }, empty)).toBeNull();
    const dup = good(1); dup.clues[0]!.wrong[0] = dup.clues[0]!.right;
    expect(validateCategory(dup, empty)).toBeNull();
    expect(validateCategory(good(1), { names: new Set(["test category 1"]), questions: new Set() })).toBeNull();
    const leak = good(1); leak.clues[1]!.q = "Which of these is the one called Right 1-2 exactly?";
    expect(validateCategory(leak, empty)).toBeNull();
  });
  it("accepts a survey with five answers and rejects overlap with decoys", () => {
    const ok = { q: "Name a famous Pixar sidekick", answers: ["A", "B", "C", "D", "E"], decoys: ["F", "G", "H", "I"] };
    expect(validateSurvey(ok, new Set())).not.toBeNull();
    expect(validateSurvey({ ...ok, decoys: ["A", "G", "H", "I"] }, new Set())).toBeNull();
    expect(validateSurvey({ ...ok, answers: ["A", "B"] }, new Set())).toBeNull();
  });
});

describe("cross-check and storage", () => {
  it("stores a category only when the second model agrees on every clue", async () => {
    const store = memoryStore();
    expect(await generateCategory("anime", store, fakeGen())).not.toBeNull();
    expect((await store.categories("anime")).filter((c) => c.source === "ai")).toHaveLength(1);
    const store2 = memoryStore();
    expect(await generateCategory("anime", store2, fakeGen({ checkerAgrees: false }))).toBeNull();
    expect(await store2.categories("anime")).toHaveLength(0);
  });
  it("verifyClue is true only for the stored answer", async () => {
    const clue = good(1).clues[0]!;
    expect(await verifyClue(fakeGen().checker, clue)).toBe(true);
    expect(await verifyClue(fakeGen({ checkerAgrees: false }).checker, clue)).toBe(false);
  });
  it("stores a survey after the checker confirms answers and trims bad decoys", async () => {
    const store = memoryStore();
    const sv = await generateSurvey("anime", store, fakeGen());
    expect(sv).not.toBeNull();
    expect(sv!.decoys.length).toBeGreaterThanOrEqual(3);
    expect((await store.surveys("anime")).some((s) => s.source === "ai")).toBe(true);
  });
});

describe("Jeopardy selection", () => {
  it("seeds the bank from the bundled questions and returns four whole categories", async () => {
    const store = memoryStore();
    const cats = await getJeopardy("anime", [], store, null, () => 0.5);
    expect(cats).toHaveLength(4);
    for (const c of cats) expect(c.clues).toHaveLength(4);
    expect((await store.categories("anime")).every((c) => c.source === "seed")).toBe(true);
  });
  it("writes new categories instead of repeating ones the player just saw", async () => {
    const store = memoryStore();
    const gen = fakeGen();
    const first = await getJeopardy("anime", [], store, gen);
    const second = await getJeopardy("anime", first.map((c) => `cat:${c.name}`), store, gen);
    expect(second.map((c) => c.name).filter((n) => first.some((f) => f.name === n))).toHaveLength(0);
    expect((await store.categories("anime")).some((c) => c.source === "ai")).toBe(true);
  });
  it("rotates through least-used categories over consecutive games", async () => {
    const store = memoryStore();
    for (const c of [1, 2, 3, 4, 5, 6, 7, 8].map(good)) await store.addCategory("anime", c, "seed");
    const names: string[] = [];
    for (let i = 0; i < 2; i++) names.push(...(await getJeopardy("anime", [], store, null)).map((c) => c.name));
    expect(new Set(names).size).toBe(8); // two games cover all eight before any repeat
  });
  it("falls back to repeats when nothing new can be written", async () => {
    const store = memoryStore();
    const first = await getJeopardy("anime", [], store, null);
    const again = await getJeopardy("anime", first.map((c) => `cat:${c.name}`), store, null);
    expect(again).toHaveLength(4);
  });
  it("stops writing once the hourly budget is spent", async () => {
    expect(genBudget("anime")).toBeGreaterThan(0);
    const store = memoryStore();
    const gen = fakeGen();
    for (let i = 0; i < 6; i++) await getJeopardy("anime", (await store.categories("anime")).map((c) => `cat:${c.name}`), store, gen);
    expect(genBudget("anime")).toBe(0);
  });
});

describe("Family Feud selection", () => {
  it("returns distinct surveys and prefers unseen ones", async () => {
    const store = memoryStore();
    const first = await getFeud("anime", 3, [], store, null);
    expect(new Set(first.map((s) => s.q)).size).toBe(3);
    const next = await getFeud("anime", 3, first.map((s) => s.q), store, null);
    expect(next.filter((s) => first.some((f) => f.q === s.q)).length).toBeLessThan(3);
  });
  it("pickFresh orders by use then age", () => {
    const items = [
      { id: "a", uses: 3, lastUsedAt: 5 },
      { id: "b", uses: 0, lastUsedAt: null },
      { id: "c", uses: 1, lastUsedAt: 1 },
      { id: "d", uses: 1, lastUsedAt: 9 },
    ];
    expect(pickFresh(items, () => false, 3, () => 0.5).map((x) => x.id)).toEqual(["b", "c", "d"]);
    expect(pickFresh(items, (x) => x.id === "b", 4, () => 0.5).map((x) => x.id)).toEqual(["c", "d", "a", "b"]);
  });
});
