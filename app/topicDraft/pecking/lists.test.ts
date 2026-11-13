import { describe, expect, it } from "vitest";
import { PECKING_META } from "./meta";
import { matchName, normName, peckingList, PECKING_LIST_IDS, PECKING_LISTS, spanOf, type PeckList } from "./lists";

describe("pecking lists", () => {
  it("PECKING_META matches the lists", () => { expect(PECKING_META.map((m) => m.id)).toEqual(PECKING_LIST_IDS); });
  it("PECKING_META carries each list's title, stat, unit, format, size, source and date", () => {
    expect(PECKING_META).toEqual(PECKING_LISTS.map((l) => ({ id: l.id, title: l.title, stat: l.stat, ...(l.unit ? { unit: l.unit } : {}), ...(l.fmt ? { fmt: l.fmt } : {}), size: l.items.length, source: l.source, asOf: l.asOf })));
  });
  it("ships at least 4 lists, each complete and in rank order", () => {
    expect(PECKING_LISTS.length).toBeGreaterThanOrEqual(4);
    for (const l of PECKING_LISTS) {
      expect(l.items.length).toBeGreaterThanOrEqual(20);
      expect(l.source).toBeTruthy(); expect(l.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      l.items.forEach((it, i) => {
        if (i > 0) expect(it.value).toBeLessThanOrEqual(l.items[i - 1]!.value);
        // competition ranking: rank = 1 + number of items with a strictly higher value
        expect(it.rank).toBe(1 + l.items.filter((o) => o.value > it.value).length);
      });
      expect(new Set(l.items.map((i) => normName(i.name))).size).toBe(l.items.length);
    }
  });
  it("country lists have the 193 UN members", () => {
    for (const id of ["countries-population", "countries-area", "countries-gdp"]) if (peckingList(id)) expect(peckingList(id)!.items.length).toBe(193);
  });
  it("sanity: the real world's top spots", () => {
    const top = (id: string, n: number) => peckingList(id)?.items.slice(0, n).map((i) => i.name);
    if (peckingList("countries-population")) expect(top("countries-population", 2)).toEqual(expect.arrayContaining(["India", "China"]));
    if (peckingList("countries-area")) expect(top("countries-area", 1)).toEqual(["Russia"]);
    if (peckingList("mountains")) expect(top("mountains", 1)).toEqual(["Mount Everest"]);
    if (peckingList("buildings")) expect(top("buildings", 1)).toEqual(["Burj Khalifa"]);
    if (peckingList("rivers")) expect(top("rivers", 2)).toEqual(expect.arrayContaining(["Nile"]));
  });
  it("rivers has no upper reach of a river it already lists, and knows the short names", () => {
    const rivers = peckingList("rivers");
    if (!rivers) return;
    expect(rivers.items.filter((i) => /^Upper /.test(i.name)).map((i) => i.name)).toEqual([]);
    expect(matchName(rivers, "Salado")?.name).toBe("Northern Salado");
    if (peckingList("buildings")) expect(matchName(peckingList("buildings")!, "Merdeka 118")?.name).toBe("Merdeka Maybank Tower");
  });
  it("tie groups share a rank and span it", () => {
    const l: PeckList = { id: "t", title: "T", stat: "S", source: "x", asOf: "2026-11-13", items: [
      { name: "A", value: 9, rank: 1 }, { name: "B", value: 5, rank: 2 }, { name: "C", value: 5, rank: 2 }, { name: "D", value: 1, rank: 4 } ] };
    expect(spanOf(l, l.items[1]!)).toEqual([2, 3]);
    expect(spanOf(l, l.items[3]!)).toEqual([4, 4]);
  });
  it("matchName ignores case, accents, punctuation and a leading 'the', and knows aliases", () => {
    const l = { ...PECKING_LISTS[0]!, items: [{ name: "Côte d'Ivoire", value: 2, rank: 1, aliases: ["Ivory Coast"] }, { name: "The Gambia", value: 1, rank: 2 }] };
    expect(matchName(l, "cote divoire")?.name).toBe("Côte d'Ivoire");
    expect(matchName(l, "ivory coast")?.name).toBe("Côte d'Ivoire");
    expect(matchName(l, "gambia")?.name).toBe("The Gambia");
    expect(matchName(l, "Narnia")).toBeNull();
  });
});
