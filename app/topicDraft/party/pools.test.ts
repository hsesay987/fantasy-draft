import { describe, expect, it } from "vitest";
import { mixTitle, poolIdsFor } from "./pools";
import { poolsOf } from "../../play/types";

describe("mixTitle", () => {
  it("names one, two, three and many", () => {
    expect(mixTitle(["A"])).toBe("A");
    expect(mixTitle(["A", "B"])).toBe("A and B");
    expect(mixTitle(["A", "B", "C"])).toBe("A, B and C");
    expect(mixTitle(["A", "B", "C", "D", "E"])).toBe("Mixed: A, B +3 more");
  });
});

describe("poolIdsFor", () => {
  it("lists every id for a party format and none for Mafia", () => {
    expect(poolIdsFor("vote")).toContain("icks");
    expect(poolIdsFor("vowelplay").length).toBeGreaterThan(5);
    expect(poolIdsFor("imposter")).toContain("superheroes");
    expect(poolIdsFor("mafia")).toEqual([]);
  });
});

describe("poolsOf", () => {
  it("falls back to pool", () => {
    expect(poolsOf({ pool: "a" })).toEqual(["a"]);
    expect(poolsOf({ pool: "a", pools: [] })).toEqual(["a"]);
    expect(poolsOf({ pool: "a", pools: ["b", "c"] })).toEqual(["b", "c"]);
  });
});
