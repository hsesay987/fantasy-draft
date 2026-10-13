import { describe, it, expect } from "vitest";
import { CATEGORIES, formatsFor, LEAGUES } from "./categories";
import { FORMATS } from "./formats";
import { CHARACTER_POOLS, getCatalog, catalogMeta } from "../topicDraft/catalogs";
import { missionsFor } from "../topicDraft/missions";
import { rolesFor } from "../topicDraft/formats/position";

describe("categories", () => {
  it("cover every character pool exactly once", () => {
    expect(CATEGORIES.map((c) => c.id).sort()).toEqual(CHARACTER_POOLS.map((c) => c.id).sort());
  });

  it.each(CATEGORIES.map((c) => [c.id, c] as const))("%s: defaults are playable", (id, c) => {
    const pool = getCatalog(id);
    expect(missionsFor(id).some((m) => m.id === c.defaults.missionId)).toBe(true);
    // 4 players x team size must fit twice over in the pool (auction queues 2x)
    expect(pool.length).toBeGreaterThanOrEqual(c.defaults.teamSize * 4);
    expect(pool.length).toBeGreaterThanOrEqual(c.defaults.rankSize);
    expect(c.defaults.budget).toBeGreaterThanOrEqual(c.defaults.teamSize);
    expect(c.recommended.length).toBeGreaterThan(0);
    for (const r of c.recommended) {
      expect(FORMATS.some((f) => f.id === r.format)).toBe(true);
      expect(formatsFor(id)).toContain(r.format);
    }
  });

  it("roles use only stats that exist in the pool", () => {
    for (const c of CATEGORIES) {
      const keys = catalogMeta(c.id)!.statKeys;
      for (const r of rolesFor(c.id)) for (const k of Object.keys(r.weights)) expect(keys).toContain(k);
    }
  });

  it("league tiles link to existing draft pages", () => {
    for (const l of LEAGUES) expect(l.href.startsWith("/draft")).toBe(true);
  });
});
