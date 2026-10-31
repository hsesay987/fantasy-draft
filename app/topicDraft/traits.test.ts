import { describe, expect, it } from "vitest";
import { allClues, pickClues } from "./traits";
import { getCatalog } from "./catalogs";
import type { Item } from "./types";

const lebron: Item = {
  id: "lebron", name: "LeBron James", universe: "Cavaliers", archetype: "SF", stats: { scoring: 95 }, tags: [],
  facts: { heightIn: 81, pos: "SF", team: "Cleveland Cavaliers", colors: ["wine", "gold"], teams: ["Cleveland Cavaliers", "Miami Heat", "Los Angeles Lakers"], college: "None (straight from high school)", from: 2003, to: 2025, hof: false, allNba: 20, allStar: 21,
    peak: { season: "2008-09", team: "CLE", ppg: 28.4, rpg: 7.6, apg: 7.2, spg: 1.7, bpg: 1.1 }, fg3: 34.9, ft: 73.6 },
};

describe("blind auction clues", () => {
  it("every pool can describe every item without saying its name", () => {
    for (const pool of ["superheroes", "villains", "anime", "pokemon", "videogames", "disney", "movies", "history", "football", "films", "shows", "nba"]) {
      const items = getCatalog(pool);
      for (const item of items.slice(0, 12)) {
        const clues = pickClues(pool, item, 3, 7, items);
        expect(clues.length, `${pool}/${item.id}`).toBe(3);
        for (const c of clues) if (!["letters", "initials", "first"].includes(c.key)) expect(c.text.toLowerCase(), `${pool}/${item.id}/${c.key}`).not.toContain(item.name.toLowerCase());
      }
    }
  });
  it("is the same on every device for the same seed, and varies with the seed", () => {
    const item = getCatalog("superheroes")[0]!;
    const a = pickClues("superheroes", item, 3, 11), b = pickClues("superheroes", item, 3, 11);
    expect(a).toEqual(b);
    const seen = new Set(Array.from({ length: 12 }, (_, s) => pickClues("superheroes", item, 3, s).map((c) => c.key).join()));
    expect(seen.size).toBeGreaterThan(1);
  });
  it("orders clues from vague to pointed and never repeats one", () => {
    const c = pickClues("superheroes", getCatalog("superheroes")[3]!, 4, 5);
    expect(c.map((x) => x.tier)).toEqual([...c.map((x) => x.tier)].sort());
    expect(new Set(c.map((x) => x.key)).size).toBe(c.length);
  });
  it("describes a player with real-world clues", () => {
    const text = allClues("nba", lebron).map((c) => c.text).join(" | ");
    expect(text).toContain("6'9\"");
    expect(text).toContain("wine and gold");
    expect(text).toContain("Miami Heat");
    expect(text).toContain("2008-09");
    expect(text).toContain("three-point shooter at 34.9%");
    expect(text).not.toContain("LeBron");
  });
});

describe("the NBA pool", () => {
  it("carries real details for every player, so clues are about the person", () => {
    for (const p of getCatalog("nba")) {
      expect(p.facts?.heightIn, p.name).toBeGreaterThan(60);
      expect(p.facts?.teams?.length, p.name).toBeGreaterThan(0);
      expect(p.facts?.peak?.ppg, p.name).toBeGreaterThan(0);
      const keys = allClues("nba", p).map((c) => c.key);
      for (const k of ["height", "peak", "era", "pos"]) expect(keys, `${p.name} ${k}`).toContain(k);
    }
  });
  it("can show a spread of three clues about a player without naming them", () => {
    const lebron = getCatalog("nba").find((p) => p.id === "lebron-james")!;
    const clues = pickClues("nba", lebron, 4, 3, getCatalog("nba"));
    expect(clues.map((c) => c.text).join(" ")).not.toMatch(/LeBron/);
    expect(clues.length).toBe(4);
  });
});
