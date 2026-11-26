import { describe, expect, it } from "vitest";
import HINTS from "./imposterHints.json";
import { imposterTopicIds } from "./pools";
import { getCatalog } from "../catalogs";
import { givesAway, hintsFor } from "../formats/imposter";

const bank = HINTS as Record<string, string[]>;
const items = [...new Map(imposterTopicIds().flatMap((t) => getCatalog(t)).map((i) => [i.id, i])).values()];

describe("imposter hints", () => {
  it("every pick an Imposter game can deal has written hints", () => {
    expect(items.filter((i) => !bank[i.id]?.length).map((i) => i.id)).toEqual([]);
  });

  it("no written hint repeats a word from the name it hints at", () => {
    const bad = items.flatMap((i) => (bank[i.id] ?? []).filter((h) => givesAway(h, i.name)).map((h) => `${i.name}: ${h}`));
    expect(bad).toEqual([]);
  });

  it("every pick has at least two hints to choose from, so games vary", () => {
    expect(items.filter((i) => hintsFor(i).length < 2).map((i) => i.name)).toEqual([]);
  });

  it("hints are short", () => {
    expect(Object.values(bank).flat().filter((h) => h.length > 40)).toEqual([]);
  });
});
