import { describe, expect, it } from "vitest";
import { compare, dailyAnswer, dayNumber, PINPOINT_START, shareGrid } from "./pinpoint";
import { catalogMeta, getCatalog } from "./catalogs";

const pool = getCatalog("superheroes");
const keys = catalogMeta("superheroes")!.statKeys;

describe("pinpoint", () => {
  it("numbers days from launch and gives everyone the same answer on the same day", () => {
    expect(dayNumber(PINPOINT_START)).toBe(1);
    expect(dayNumber(PINPOINT_START + 86_400_000 * 3 + 5)).toBe(4);
    expect(dailyAnswer(pool, "superheroes", 5).id).toBe(dailyAnswer(pool, "superheroes", 5).id);
    const days = new Set(Array.from({ length: 10 }, (_, d) => dailyAnswer(pool, "superheroes", d + 1).id));
    expect(days.size).toBeGreaterThan(5);
  });

  it("a right guess is 100% and every stat is a hit", () => {
    const h = compare(pool[0]!, pool[0]!, keys);
    expect(h.correct).toBe(true);
    expect(h.closeness).toBe(100);
    expect(h.stats.every((s) => s.heat === "hit" && s.dir === "same")).toBe(true);
  });

  it("points each stat toward the answer and scores near guesses higher", () => {
    const answer = pool[0]!;
    const h = compare(pool[1]!, answer, keys);
    for (const s of h.stats) {
      const a = answer.stats[s.key]!;
      if (s.dir === "up") expect(a).toBeGreaterThan(s.guess);
      if (s.dir === "down") expect(a).toBeLessThan(s.guess);
    }
    const sorted = pool.slice(1).map((i) => compare(i, answer, keys).closeness);
    expect(Math.max(...sorted)).toBeLessThan(100);
    expect(shareGrid([h], "Pinpoint", false)).toContain("X/8");
  });
});
