import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NPAT_CATEGORIES, NPAT_SETS, categoryOf, setOf } from "./categories";
import { entriesOf, lettersAvailable, lookup } from "./source";
import { HARD_LETTERS, normAnswer, type Tier } from "./rules";
import "./lists";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const SPREAD: Tier[] = ["common", "solid", "rare", "deep", "unicorn"];

describe("NPAT category lists", () => {
  it("has about a dozen categories, the classic four among them", () => {
    expect(NPAT_CATEGORIES.length).toBeGreaterThanOrEqual(12);
    for (const id of ["name", "place", "animal", "thing", "superhero", "footballer", "film", "food", "country", "pokemon"]) {
      expect(categoryOf(id)?.id).toBe(id);
    }
    expect(categoryOf("nope")).toBeUndefined();
  });

  for (const c of NPAT_CATEGORIES) {
    describe(c.id, () => {
      it("has an entry file with at least 150 entries", () => {
        expect(fs.existsSync(path.join(DATA, `${c.id}.json`))).toBe(true);
        expect(entriesOf(c.id).length).toBeGreaterThanOrEqual(150);
      });

      it("has names unique after normalising, each with a tier", () => {
        const keys = entriesOf(c.id).map((e) => normAnswer(e.name));
        expect(keys.every(Boolean)).toBe(true);
        expect(new Set(keys).size).toBe(keys.length);
        expect(entriesOf(c.id).every((e) => typeof e.tier === "string")).toBe(true);
      });

      it("spreads across every tier but Too Obvious", () => {
        const tiers = new Set(entriesOf(c.id).map((e) => e.tier));
        for (const t of SPREAD) expect(tiers.has(t)).toBe(true);
        expect(tiers.has("obvious")).toBe(false);
      });

      it("has metadata for the room screens", () => {
        expect(c.title && c.blurb && c.source && c.asOf).toBeTruthy();
      });
    });
  }

  it("returns an empty list for an unknown category", () => {
    expect(entriesOf("no-such-category")).toEqual([]);
  });
});

describe("NPAT_SETS", () => {
  it("starts with the classic four", () => {
    expect(NPAT_SETS[0]).toMatchObject({ id: "classic", categories: ["name", "place", "animal", "thing"] });
    expect(setOf("classic")?.categories).toEqual(["name", "place", "animal", "thing"]);
  });

  it("has a four-category set for each topic category, each naming real categories", () => {
    const topics = NPAT_CATEGORIES.map((c) => c.id).filter((id) => !["name", "place", "animal", "thing"].includes(id));
    for (const t of topics) expect(NPAT_SETS.some((s) => s.categories[0] === t)).toBe(true);
    for (const s of NPAT_SETS) {
      expect(s.categories).toHaveLength(4);
      expect(new Set(s.categories).size).toBe(4);
      for (const id of s.categories) expect(categoryOf(id)).toBeDefined();
    }
    expect(new Set(NPAT_SETS.map((s) => s.id)).size).toBe(NPAT_SETS.length);
  });
});

describe("lettersAvailable", () => {
  const classic = setOf("classic")!.categories;

  it("leaves out hard letters by default and still has letters to draw", () => {
    const letters = lettersAvailable(classic, false);
    expect(letters.length).toBeGreaterThan(0);
    for (const l of letters) expect(HARD_LETTERS).not.toContain(l);
  });

  it("only offers letters every category has at least 15 answers for", () => {
    for (const l of lettersAvailable(classic, true)) {
      for (const c of classic) {
        const n = entriesOf(c).filter((e) => [e.name, ...(e.also ?? [])].some((a) => normAnswer(a).startsWith(l.toLowerCase()))).length;
        expect(n).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it("offers at least the default letters with hard letters on", () => {
    const easy = lettersAvailable(classic, false);
    const hard = lettersAvailable(classic, true);
    for (const l of easy) expect(hard).toContain(l);
  });
});

describe("lookup", () => {
  it("finds an entry by name, ignoring case, accents and a leading 'the'", () => {
    expect(lookup("country", "france")?.name).toBe("France");
    expect(lookup("country", "The Netherlands")?.name).toBe("Netherlands");
    expect(lookup("pokemon", "flabebe")?.name).toBe("Flabébé");
  });

  it("finds an entry by an alias", () => {
    expect(lookup("country", "USA")?.name).toBe("United States");
    expect(lookup("country", "Cote d'Ivoire")?.name).toBe("Ivory Coast");
  });

  it("returns null for unknown text, blanks and non-strings", () => {
    expect(lookup("country", "Atlantis")).toBeNull();
    expect(lookup("country", "")).toBeNull();
    expect(lookup("country", 42)).toBeNull();
    expect(lookup("no-such-category", "France")).toBeNull();
  });
});
