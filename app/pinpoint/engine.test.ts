import { describe, expect, it } from "vitest";
import { compare, dailyAnswer, dayNumber, formatValue, PINPOINT_START, shareGrid } from "./engine";
import { PINPOINT_DATA, type Column } from "./data";
import { PINPOINT_TOPICS, pinpointPicks } from "./topics";
import type { Item } from "../topicDraft/types";

const item = (id: string): Item => ({ id, name: id, universe: "", archetype: "", stats: {}, tags: [] }) as unknown as Item;
const cols: Column[] = [
  { key: "year", label: "Released", kind: "num", close: 5, fmt: "year" },
  { key: "pop", label: "Population", kind: "num", close: 0.4, rel: true, fmt: "big" },
  { key: "genre", label: "Genre", kind: "set" },
  { key: "country", label: "Country", kind: "cat" },
];
const facts = {
  a: { year: 1994, pop: 1_000_000, genre: ["crime", "drama"], country: "United States" },
  b: { year: 1990, pop: 2_000_000, genre: ["drama"], country: "United States" },
  c: { year: 2020, genre: ["comedy"], country: "France" },
};

describe("pinpoint", () => {
  it("numbers days from launch and gives everyone the same answer on the same day", () => {
    const pool = pinpointPicks("films");
    expect(dayNumber(PINPOINT_START)).toBe(1);
    expect(dayNumber(PINPOINT_START + 86_400_000 * 3 + 5)).toBe(4);
    expect(dailyAnswer(pool, "films", 5).id).toBe(dailyAnswer(pool, "films", 5).id);
    expect(new Set(Array.from({ length: 10 }, (_, d) => dailyAnswer(pool, "films", d + 1).id)).size).toBeGreaterThan(5);
  });

  it("a right guess is 100% and every fact is a hit", () => {
    const h = compare(item("a"), item("a"), cols, facts);
    expect(h.correct).toBe(true);
    expect(h.closeness).toBe(100);
    expect(h.cells.every((c) => c.heat === "hit" && !c.dir)).toBe(true);
  });

  it("points numbers toward the answer, warms near misses and partial overlaps", () => {
    const h = compare(item("b"), item("a"), cols, facts);
    const [year, pop, genre, country] = h.cells;
    expect(year).toMatchObject({ heat: "warm", dir: "up", text: "1990" });
    expect(pop).toMatchObject({ heat: "cold", dir: "down", text: "2M" });
    expect(genre!.heat).toBe("warm");
    expect(country!.heat).toBe("hit");
    expect(compare(item("c"), item("a"), cols, facts).closeness).toBeLessThan(h.closeness);
    expect(compare(item("c"), item("a"), cols, facts).cells[1]!.heat).toBe("none");
    expect(shareGrid([h], "Pinpoint", false)).toContain("X/8");
  });

  it("prints years BC and units", () => {
    expect(formatValue(cols[0]!, -69)).toBe("69 BC");
    expect(formatValue({ key: "h", label: "Height", kind: "num", fmt: "int", unit: "cm" }, 185.4)).toBe("185 cm");
    expect(formatValue({ key: "b", label: "Box", kind: "num", fmt: "big", unit: "$" }, 1_006_234_167)).toBe("$1B");
  });

  it("only offers topics with real facts for every pick it uses", () => {
    expect(PINPOINT_TOPICS.length).toBeGreaterThanOrEqual(10);
    for (const t of PINPOINT_TOPICS) {
      const d = PINPOINT_DATA[t.id]!;
      const picks = pinpointPicks(t.id);
      expect(picks.length, t.id).toBeGreaterThanOrEqual(25);
      for (const p of picks) expect(Object.keys(d.facts[p.id]!).length, `${t.id}/${p.id}`).toBeGreaterThanOrEqual(Math.ceil(d.columns.length * 0.6));
    }
  });
});
