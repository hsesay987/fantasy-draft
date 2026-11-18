import { describe, expect, it } from "vitest";
import { NPAT_CATEGORIES } from "../topicDraft/npat/categories";
import { NPAT_CLASSIC_IDS, NPAT_MAX_CATS, NPAT_MIN_CATS, npatCustomCheck, npatSummary } from "./npatSetup";

const allLetters = (ids: string[], hard: boolean) => {
  const sets = ids.map((id) => NPAT_CATEGORIES.find((c) => c.id === id)!.letters);
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter((l) => sets.every((s) => s.includes(l)) && (hard || !"QXZY".includes(l))).join("");
};

describe("Custom categories", () => {
  it("starts on the classic four", () => {
    expect(NPAT_CLASSIC_IDS).toEqual(["name", "place", "animal", "thing"]);
    expect([NPAT_MIN_CATS, NPAT_MAX_CATS]).toEqual([4, 6]);
  });

  it("needs 4 to 6 categories", () => {
    expect(npatCustomCheck(["name", "place", "animal"], false, 3)).toMatchObject({ ok: false, reason: expect.stringMatching(/at least 4/i) });
    expect(npatCustomCheck(NPAT_CLASSIC_IDS, false, 3).ok).toBe(true);
    expect(npatCustomCheck(["name", "place", "animal", "thing", "food", "film"], false, 3).ok).toBe(true);
    expect(npatCustomCheck(["name", "place", "animal", "thing", "food", "film", "tv"], false, 3)).toMatchObject({ ok: false, reason: expect.stringMatching(/at most 6/i) });
  });

  it("keeps only the letters every ticked category covers", () => {
    const r = npatCustomCheck(["name", "place", "animal", "thing"], false, 3);
    expect(r.letters.join("")).toBe(allLetters(["name", "place", "animal", "thing"], false));
    expect(r.letters).not.toContain("Q");
  });

  it("brings the hard letters back only when Hard letters is on", () => {
    const ids = ["place", "name", "animal", "thing"];
    expect(npatCustomCheck(ids, true, 3).letters.join("")).toBe(allLetters(ids, true));
    expect(npatCustomCheck(["place", "footballer", "musician", "tv"], false, 3).letters.some((l) => "QXZY".includes(l))).toBe(false);
    expect(npatCustomCheck(["place", "footballer", "tv"], true, 3).letters).toContain("Y");
  });

  it("warns, but still allows a start, when fewer letters fit than there are rounds", () => {
    const ids = ["country", "name", "animal", "thing"]; // Country covers 6 letters
    const r = npatCustomCheck(ids, false, 8);
    expect(r.letters.length).toBeLessThan(8);
    expect(r.letters.length).toBeGreaterThan(0);
    expect(r).toMatchObject({ ok: true, warn: expect.stringMatching(/letters? fit/i) });
    expect(npatCustomCheck(ids, false, 3).warn).toBeUndefined();
  });

  it("blocks the start when no letter fits all of them", () => {
    const meta = (id: string, letters: string) => ({ id, title: id, blurb: "", source: "", asOf: "", letters });
    const cats = [meta("a", "ABC"), meta("b", "ABC"), meta("c", "DEF"), meta("d", "ABCDEF")];
    expect(npatCustomCheck(["a", "b", "c", "d"], false, 3, cats)).toMatchObject({ ok: false, letters: [], reason: expect.stringMatching(/no letter/i) });
    // Only hard letters in common: nothing to play unless Hard letters is on.
    const hardOnly = [meta("a", "QZ"), meta("b", "QZ"), meta("c", "QZ"), meta("d", "QZ")];
    expect(npatCustomCheck(["a", "b", "c", "d"], false, 3, hardOnly).ok).toBe(false);
    expect(npatCustomCheck(["a", "b", "c", "d"], true, 1, hardOnly).ok).toBe(true);
  });

  it("ignores ids it does not know", () => {
    expect(npatCustomCheck(["name", "place", "animal", "nope"], false, 3).ok).toBe(false);
  });
});

describe("the room's summary line", () => {
  const line = (pools: string[], over: Partial<Parameters<typeof npatSummary>[0]> = {}) =>
    npatSummary({ pools, rounds: 3, seconds: 60, teams: 0, players: 5, ...over });

  it("names Classic, a set, or Custom", () => {
    expect(line(["classic"])).toBe("3 rounds · 60 s · Classic · every player for themselves · 2+ players");
    expect(line(["superhero"])).toContain("· Superhero ·");
    expect(line(["cat:name", "cat:food", "cat:film", "cat:tv"])).toContain("· Custom ·");
  });

  it("says one round in the singular, and teams, or solo until there are enough players", () => {
    expect(line(["classic"], { rounds: 1 })).toMatch(/^1 round ·/);
    expect(line(["classic"], { teams: 2, players: 6 })).toContain("· 2 teams ·");
    expect(line(["classic"], { teams: 2, players: 3 })).toContain("· solo until 4 players ·");
  });
});
