import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG_IDS, getCatalog } from "../topicDraft/catalogs";
import PRESOLVED from "./characterImages.json";
import { cachedImage, fetchCharacterImage } from "./characterImages";

const STATIC = PRESOLVED as Record<string, string>;
const queries = new Set(CATALOG_IDS.flatMap((id) => getCatalog(id).map((i) => i.q).filter(Boolean)));

describe("presolved character pictures", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("comes straight from the map, without a network call", async () => {
    const [q, url] = Object.entries(STATIC)[0]!;
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(cachedImage(q)).toBe(url);
    await expect(fetchCharacterImage(q)).resolves.toBe(url);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("only holds https URLs for queries a catalog still uses", () => {
    for (const [q, url] of Object.entries(STATIC)) {
      expect(queries.has(q), q).toBe(true);
      expect(url, q).toMatch(/^https:\/\//);
    }
  });

  it("covers most catalog pictures", () => {
    expect(Object.keys(STATIC).length / queries.size).toBeGreaterThan(0.9);
  });

  it("falls back to Wikipedia for heroes the hero dataset lacks", () => {
    for (const id of ["superheroes", "villains", "heroes-villains"]) expect(getCatalog(id).every((i) => i.q?.startsWith("herowiki:")), id).toBe(true);
  });
});
