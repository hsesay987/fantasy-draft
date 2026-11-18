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

  it("keeps the lobby's letters meta in step with the lists", () => {
    for (const c of NPAT_CATEGORIES) expect(c.letters, c.id).toBe(lettersAvailable([c.id], true).join(""));
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
    // Country has too few letters with 15 answers to carry a set; it stays pickable for Custom games.
    const topics = NPAT_CATEGORIES.map((c) => c.id).filter((id) => !["name", "place", "animal", "thing", "country"].includes(id));
    for (const t of topics) expect(NPAT_SETS.some((s) => s.categories[0] === t)).toBe(true);
    expect(NPAT_SETS.some((s) => s.categories.includes("country"))).toBe(false);
    expect(categoryOf("country")).toBeDefined();
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

  it("gives every set, Classic included, at least 10 letters without hard letters", () => {
    for (const s of NPAT_SETS) expect(lettersAvailable(s.categories, false).length, s.id).toBeGreaterThanOrEqual(10);
  });

  it("reports a single category's letters, so a Custom picker can warn about thin ones", () => {
    expect(lettersAvailable(["country"], false).length).toBeLessThan(10);
    expect(lettersAvailable(["name"], false).length).toBeGreaterThanOrEqual(10);
  });

  it("offers at least the default letters with hard letters on", () => {
    const easy = lettersAvailable(classic, false);
    const hard = lettersAvailable(classic, true);
    for (const l of easy) expect(hard).toContain(l);
  });
});

// Familiarity sanity: a classic everyone knows must rank above this year's release or a name that rose on news.
// The second of each pair may be missing from the list altogether (Zendaya is filed as an actor first).
const ABOVE: [string, string, string][] = [
  ["film", "The Godfather", "Obsession"],
  ["film", "Titanic", "Project Hail Mary"],
  ["film", "The Shawshank Redemption", "The Odyssey"],
  ["film", "Forrest Gump", "Backrooms"],
  ["tv", "Friends", "Widow's Bay"],
  ["tv", "Breaking Bad", "The Pitt"],
  ["tv", "Game of Thrones", "Slow Horses"],
  ["musician", "The Beatles", "Zendaya"],
  ["musician", "Michael Jackson", "Teyana Taylor"],
  ["musician", "Elvis Presley", "Raye"],
  ["superhero", "Batman", "Spider-Man Noir"],
  ["superhero", "Superman", "Omni-Man"],
  ["superhero", "Wonder Woman", "Sentry"],
];

describe("familiarity order", () => {
  for (const [cat, classic, other] of ABOVE) {
    it(`${cat}: ${classic} ranks above ${other}, as Common or Solid`, () => {
      const list = entriesOf(cat);
      const at = (n: string) => list.findIndex((e) => e.name === n);
      expect(at(classic)).toBeGreaterThanOrEqual(0);
      expect(["common", "solid"]).toContain(list[at(classic)]!.tier);
      if (at(other) >= 0) expect(at(classic)).toBeLessThan(at(other));
    });
  }
});

describe("lookup", () => {
  it("finds an entry by name, ignoring case, accents and a leading 'the'", () => {
    expect(lookup("country", "france")?.name).toBe("France");
    expect(lookup("country", "The Netherlands")?.name).toBe("Netherlands");
    expect(lookup("pokemon", "flabebe")?.name).toBe("Flabébé");
  });

  it("finds an entry by an alias", () => {
    expect(lookup("country", "United States of America")?.name).toBe("United States");
    expect(lookup("country", "Burma")?.name).toBe("Myanmar");
    expect(lookup("country", "Cote d'Ivoire")?.name).toBe("Ivory Coast");
  });

  it("returns null for unknown text, blanks and non-strings", () => {
    expect(lookup("country", "Atlantis")).toBeNull();
    expect(lookup("country", "")).toBeNull();
    expect(lookup("country", 42)).toBeNull();
    expect(lookup("no-such-category", "France")).toBeNull();
  });
});

describe("aliases (after the buildNpat --aliases-only re-filter)", () => {
  it("nicknames, old or foreign names and plain words no longer stand for an entry", () => {
    const wrong: [string, string][] = [
      ["musician", "Evil"], ["musician", "Love"], ["musician", "Puff"], ["musician", "Starfish"], ["musician", "Therapist"],
      ["animal", "Painter"], ["animal", "Killer"], ["film", "Rebellion"], ["film", "Cubic"], ["film", "Spell"],
      ["place", "Augusta"], ["place", "Maurice"], ["food", "Ail"], ["food", "Chou"], ["food", "Porc"],
    ];
    for (const [c, text] of wrong) expect(lookup(c, text), `${c}: ${text}`).toBeNull();
  });

  it("keeps the aliases players really type", () => {
    const right: [string, string, string][] = [
      ["footballer", "Messi", "Lionel Messi"], ["musician", "Elvis", "Elvis Presley"], ["musician", "Puff Daddy", "Sean Combs"],
      ["superhero", "Spidey", "Spider-Man"], ["place", "Burma", "Myanmar"], ["country", "Holland", "Netherlands"],
      ["country", "Swaziland", "Eswatini"], ["tv", "SNL", "Saturday Night Live"], ["animal", "Puma", "Cougar"],
    ];
    for (const [c, text, name] of right) expect(lookup(c, text)?.name, `${c}: ${text}`).toBe(name);
  });

  it("no place or country alias is a code or three characters or fewer", () => {
    for (const c of ["place", "country"]) for (const e of entriesOf(c)) for (const a of e.also ?? []) {
      expect(normAnswer(a).length, `${e.name}: ${a}`).toBeGreaterThan(3);
      expect(/^[A-Z0-9][A-Z0-9 .'-]*$/.test(a), `${e.name}: ${a}`).toBe(false);
    }
  });
});
