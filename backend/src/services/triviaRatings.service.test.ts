import { describe, expect, it } from "vitest";
import { categoryShouldRetire, parseRating, recordRating, shouldRetire, summarize, type RatingInput, type RatingRow, type RatingStore } from "./triviaRatings.service";

const ok = { kind: "category", id: "c1", voter: "voter-abcdefgh", quality: 4 };
const row = (over: Partial<RatingRow> = {}): RatingRow => ({ kind: "category", clue: -1, voter: "v", quality: 3, difficulty: null, wrong: false, ...over });

describe("parseRating", () => {
  it("accepts a valid rating", () => expect(parseRating(ok)).toMatchObject({ kind: "category", targetId: "c1", clue: -1, quality: 4, difficulty: null, wrong: false }));
  it("needs a clue index only for clues", () => {
    expect(parseRating({ ...ok, kind: "clue" })).toBeNull();
    expect(parseRating({ ...ok, kind: "clue", clue: 2 })?.clue).toBe(2);
    expect(parseRating({ ...ok, kind: "clue", clue: 9 })).toBeNull();
  });
  it("rejects out-of-range, empty and malformed input", () => {
    expect(parseRating({ ...ok, quality: 6 })).toBeNull();
    expect(parseRating({ ...ok, quality: 2.5 })).toBeNull();
    expect(parseRating({ kind: "category", id: "c1", voter: "voter-abcdefgh" })).toBeNull();
    expect(parseRating({ ...ok, voter: "x" })).toBeNull();
    expect(parseRating({ ...ok, kind: "nonsense" })).toBeNull();
    expect(parseRating(null)).toBeNull();
  });
  it("a wrong-answer flag alone is a valid rating", () => expect(parseRating({ kind: "survey", id: "s1", voter: "voter-abcdefgh", wrong: true })?.wrong).toBe(true));
});

describe("summarize and shouldRetire", () => {
  it("averages quality and difficulty over the votes that gave them", () => {
    const s = summarize([row({ quality: 5, difficulty: 2 }), row({ quality: 3, difficulty: null }), row({ quality: null, difficulty: 4 })]);
    expect(s).toMatchObject({ votes: 3, quality: 4, qualityVotes: 2, difficulty: 3 });
  });
  it("needs five quality votes before low scores retire an item", () => {
    expect(shouldRetire(summarize(Array.from({ length: 4 }, () => row({ quality: 1 }))))).toBe(false);
    expect(shouldRetire(summarize(Array.from({ length: 5 }, () => row({ quality: 2 }))))).toBe(true);
    expect(shouldRetire(summarize(Array.from({ length: 5 }, () => row({ quality: 3 }))))).toBe(false);
  });
  it("retires on repeated wrong-answer flags", () => {
    const flags = [row({ quality: null, wrong: true }), row({ quality: null, wrong: true }), row({ quality: null, wrong: true })];
    expect(shouldRetire(summarize(flags))).toBe(true);
    expect(shouldRetire(summarize([...flags, ...Array.from({ length: 9 }, () => row({ quality: 5 }))]))).toBe(false); // 3 of 12 is not enough
  });
  it("one bad clue retires its category", () => {
    const bad = Array.from({ length: 5 }, (_, i) => row({ kind: "clue", clue: 2, voter: `v${i}`, quality: 1 }));
    const fine = Array.from({ length: 5 }, (_, i) => row({ kind: "clue", clue: 0, voter: `v${i}`, quality: 5 }));
    expect(categoryShouldRetire([...fine, ...bad])).toBe(true);
    expect(categoryShouldRetire(fine)).toBe(false);
  });
});

describe("recordRating", () => {
  const memory = () => {
    const rows = new Map<string, RatingInput>();
    const retired = new Set<string>();
    const store: RatingStore = {
      async upsert(r) { rows.set(`${r.kind}|${r.targetId}|${r.clue}|${r.voter}`, r); },
      async forItem(kind, id) { return [...rows.values()].filter((r) => r.targetId === id && (kind === "survey" ? r.kind === "survey" : r.kind !== "survey")); },
      async setRetired(kind, id, v) { v ? retired.add(`${kind}:${id}`) : retired.delete(`${kind}:${id}`); },
    };
    return { store, rows, retired };
  };
  it("a voter who votes again replaces their earlier vote", async () => {
    const m = memory();
    const base: RatingInput = { kind: "survey", targetId: "s1", clue: -1, voter: "voter-1", quality: 1, difficulty: null, wrong: false };
    await recordRating(m.store, base);
    await recordRating(m.store, { ...base, quality: 5 });
    expect(m.rows.size).toBe(1);
    expect([...m.rows.values()][0]!.quality).toBe(5);
  });
  it("retires an item once enough voters rate it badly", async () => {
    const m = memory();
    let last = { retired: false };
    for (let i = 0; i < 5; i++) last = await recordRating(m.store, { kind: "category", targetId: "c1", clue: -1, voter: `voter-${i}xxxx`, quality: 1, difficulty: null, wrong: false });
    expect(last.retired).toBe(true);
    expect(m.retired.has("category:c1")).toBe(true);
  });
});
