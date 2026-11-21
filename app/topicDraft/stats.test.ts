import { describe, it, expect } from "vitest";
import { CATALOG_META, getCatalog } from "./catalogs";
import { missionsFor, metricsFor } from "./missions";
import { rolesFor } from "./formats/position";
import { itemScore } from "./scorer";
import { FAMILY_OF, SOURCES, STAT_FAMILIES, isMeasured, statDefs } from "./stats";

describe("stat registry", () => {
  it.each(CATALOG_META.map((m) => m.id))("%s: every stat is defined, and every definition is used", (id) => {
    const defined = statDefs(id).map((s) => s.key);
    const used = new Set(getCatalog(id).flatMap((i) => Object.keys(i.stats)));
    for (const k of used) expect(defined, `${id} uses "${k}"`).toContain(k);
    // Gear pools share one family, so each uses only part of it.
    if (FAMILY_OF[id] !== "gear") for (const k of defined) expect([...used], `${id} never sets "${k}"`).toContain(k);
  });

  it("every definition cites a known source, and measured ones are not editorial", () => {
    for (const defs of Object.values(STAT_FAMILIES)) for (const s of defs) {
      expect(SOURCES[s.source]).toBeTruthy();
      if (s.method === "measured") expect(s.source).not.toBe("editorial");
      expect(s.code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("knows which numbers were measured", () => {
    expect(isMeasured("nba", "michael-jordan", "defense")).toBe(true);
    expect(isMeasured("pokemon", "pikachu", "speed")).toBe(true);
    expect(isMeasured("geography", "france", "tourism")).toBe(true);
    expect(isMeasured("superheroes", "batman", "power")).toBe(false);
  });
});

describe("missions and roles only weigh stats the topic has", () => {
  const characterPools = CATALOG_META.filter((m) => m.kind === "character").map((m) => m.id);
  it.each(characterPools)("%s", (id) => {
    const keys = new Set(statDefs(id).map((s) => s.key));
    for (const m of [...missionsFor(id), ...metricsFor(id)]) for (const k of Object.keys(m.weights)) expect([...keys], `${id} mission "${m.title}" weighs "${k}"`).toContain(k);
    for (const r of rolesFor(id)) for (const k of Object.keys(r.weights)) expect([...keys], `${id} role "${r.label}" weighs "${k}"`).toContain(k);
  });

  it("every mission separates its topic's pool", () => {
    for (const id of characterPools) for (const m of missionsFor(id)) {
      const scores = getCatalog(id).map((i) => itemScore(i, m.weights));
      expect(Math.max(...scores) - Math.min(...scores), `${id} "${m.title}"`).toBeGreaterThan(15);
    }
  });
});

describe("a stat an item does not have", () => {
  it("is left out of the score instead of counting as zero", () => {
    const stats = { power: 80, speed: 80 };
    const item = { id: "x", name: "x", universe: "", archetype: "", tags: [], stats };
    expect(itemScore(item, { power: 1, speed: 1, intellect: 3 })).toBe(80);
    expect(itemScore(item, { intellect: 1 })).toBe(0);
  });
});
