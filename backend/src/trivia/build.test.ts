import { describe, expect, it } from "vitest";
import { buildCategories, buildSurveys, seeded, uniqueNames } from "./build";
import type { Entity, Spec } from "./model";

const dirs = ["Ann", "Bo", "Cy", "Di", "Ed", "Flo", "Gus", "Hal", "Ivy", "Jo"];
const films: Entity[] = Array.from({ length: 10 }, (_, i) => ({ id: `Q${i}`, label: `Film ${String.fromCharCode(65 + i)}${i}`, pop: 100 - i, facts: { director: [dirs[i]!], year: [String(1990 + (i % 5))] } }));
const spec: Spec = {
  pool: "films",
  templates: [
    { fact: "director", ask: (e) => `Who directed “${e.label}”?`, group: () => "1990s", name: (g) => `Directors: ${g} Films` },
    { fact: "year", ask: (e) => `In what year was “${e.label}” released?`, group: () => "all", name: () => "Release Years", year: true },
  ],
  surveys: [{ fact: "year", ask: (v) => `Name a film released in ${v}` }],
};

describe("trivia build", () => {
  it("makes boards of four distinct clues with four distinct options", () => {
    const cats = buildCategories(films, spec, seeded(7));
    expect(cats.map((c) => c.name)).toEqual(["Directors: 1990s Films", "Release Years"]);
    for (const c of cats) {
      expect(c.clues).toHaveLength(4);
      for (const k of c.clues) expect(new Set([k.right, ...k.wrong]).size).toBe(4);
      expect(new Set(c.clues.map((k) => k.q)).size).toBe(4);
    }
    const d = cats[0]!;
    expect(d.clues[0]!.q).toContain("Film A0"); // best known first
    expect(d.clues[0]!.right).toBe("Ann");
  });
  it("year options are near the right year and never in the future", () => {
    const k = buildCategories(films, spec, seeded(3))[1]!.clues[0]!;
    for (const w of k.wrong) expect(Math.abs(Number(w) - Number(k.right))).toBeLessThanOrEqual(6);
  });
  it("drops a clue whose answer is really another item (a bad link in the source)", () => {
    const bad = films.map((f, i) => (i === 0 ? { ...f, facts: { ...f.facts, director: ["Film B1"] } } : f));
    const q = buildCategories(bad, spec, seeded(7))[0]!.clues.map((c) => c.q).join();
    expect(q).not.toContain("Film A0");
  });
  it("skips groups that are too small and ambiguous names", () => {
    expect(buildCategories(films.slice(0, 5), spec)).toEqual([]);
    const dup = [...films, { ...films[0]!, id: "Qx" }];
    expect(uniqueNames(dup)).toHaveLength(9);
  });
  it("surveys use the five best-known members and decoys from outside the group", () => {
    const e = films.map((f) => ({ ...f, facts: { ...f.facts, year: ["1999"] } })).concat(["P", "Q", "R", "S", "T"].map((n, i) => ({ id: `Qz${i}`, label: `Other ${n}`, pop: 90 - i, facts: { year: ["2001"] } })));
    const s = buildSurveys(e, spec, seeded(5));
    const nineties = s.filter((x) => x.q === "Name a film released in 1999");
    expect(nineties).toHaveLength(1);
    s.splice(0, s.length, ...nineties);
    expect(s[0]!.answers).toEqual(["Film A0", "Film B1", "Film C2", "Film D3", "Film E4"]);
    expect(s[0]!.decoys).toHaveLength(5);
    for (const d of s[0]!.decoys) expect(d).toMatch(/^Other /);
  });
});
