import { afterEach, describe, expect, it } from "vitest";
import { normAnswer } from "./rules";
import { setHistorySource, tierOf, type NpatEntry } from "./source";

const rare: NpatEntry = { name: "The Zebra", tier: "rare" };

afterEach(() => setHistorySource(null));

describe("tierOf", () => {
  it("is the entry's tier with no history source", () => expect(tierOf("animal", rare)).toBe("rare"));
  it("is the entry's tier when the answer has no history", () => {
    setHistorySource(() => null);
    expect(tierOf("animal", rare)).toBe("rare");
  });
  it("keeps the base tier under 30 plays", () => {
    setHistorySource(() => ({ count: 29, plays: 29 }));
    expect(tierOf("animal", rare)).toBe("rare");
  });
  it("makes a rare answer 6% of 30+ plays Too Obvious", () => {
    setHistorySource(() => ({ count: 6, plays: 100 }));
    expect(tierOf("animal", rare)).toBe("obvious");
  });
  it("leaves an answer under 5% alone", () => {
    setHistorySource(() => ({ count: 4, plays: 100 }));
    expect(tierOf("animal", rare)).toBe("rare");
  });
  it("asks for the normalised canonical name", () => {
    const asked: string[] = [];
    setHistorySource((c, a) => { asked.push(`${c}|${a}`); return null; });
    tierOf("animal", rare);
    expect(asked).toEqual([`animal|${normAnswer("The Zebra")}`]);
  });
});
