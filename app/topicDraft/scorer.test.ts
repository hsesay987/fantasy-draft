import { describe, it, expect } from "vitest";
import { scoreTeam, itemScore } from "./scorer";
import { SCENARIOS } from "./scenarios";
import { getCatalog, CATALOG_IDS, catalogMeta } from "./catalogs";
import type { Item } from "./types";

const mk = (id: string, stats: Record<string, number>, archetype = "a", tags: string[] = []): Item => ({
  id, name: id, universe: "U", archetype, stats, tags,
});

const brawn = SCENARIOS.find((s) => s.id === "tournament")!;
const brains = SCENARIOS.find((s) => s.id === "heist")!;

describe("scorer", () => {
  it("empty team scores 0", () => {
    expect(scoreTeam([], brawn)).toEqual({ total: 0, breakdown: {}, synergy: 0 });
  });

  it("weights shift ranking", () => {
    const tank = mk("tank", { power: 100, durability: 100, combat: 90, intellect: 10, speed: 40, teamwork: 30 });
    const brain = mk("brain", { power: 20, durability: 30, combat: 60, intellect: 100, speed: 70, teamwork: 90 });
    expect(itemScore(tank, brawn.weights)).toBeGreaterThan(itemScore(brain, brawn.weights));
    expect(itemScore(brain, brains.weights)).toBeGreaterThan(itemScore(tank, brains.weights));
  });

  it("covering wanted tags raises synergy", () => {
    const stats = { power: 50, intellect: 50, speed: 50, durability: 50, combat: 50, teamwork: 50 };
    const withTags = scoreTeam([mk("a", stats, "x", ["spy", "tech", "human"])], brains);
    const noTags = scoreTeam([mk("a", stats, "x", [])], brains);
    expect(withTags.synergy).toBeGreaterThan(noTags.synergy);
  });

  it("clamps out-of-range and NaN stats", () => {
    const wild = mk("w", { power: 9999, intellect: NaN, speed: -50, durability: 100, combat: 100, teamwork: 100 });
    const r = scoreTeam([wild], SCENARIOS[0]);
    expect(r.total).toBeLessThanOrEqual(100);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });
});

describe("superhero catalog", () => {
  it("is large, unique and in range", () => {
    const c = getCatalog("superheroes");
    expect(c.length).toBeGreaterThanOrEqual(100);
    expect(new Set(c.map((i) => i.id)).size).toBe(c.length);
    for (const i of c) for (const v of Object.values(i.stats)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("derived pools", () => {
  it("superheroes has no villains; villains and mixed pool are deduped", () => {
    expect(getCatalog("superheroes").some((i) => i.tags.includes("villain"))).toBe(false);
    expect(getCatalog("villains").every((i) => i.tags.includes("villain"))).toBe(true);
    const mixed = getCatalog("heroes-villains");
    expect(new Set(mixed.map((i) => i.id)).size).toBe(mixed.length);
    expect(mixed.some((i) => i.tags.includes("villain"))).toBe(true);
    expect(mixed.some((i) => i.tags.includes("hero"))).toBe(true);
  });
});

describe("all catalogs", () => {
  it.each(CATALOG_IDS)("%s has valid unique items with the shared stat keys", (id) => {
    const c = getCatalog(id);
    expect(c.length).toBeGreaterThanOrEqual(25);
    expect(new Set(c.map((i) => i.id)).size).toBe(c.length);
    for (const i of c) {
      expect(Object.keys(i.stats).sort()).toEqual([...catalogMeta(id)!.statKeys].sort());
      for (const v of Object.values(i.stats)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
