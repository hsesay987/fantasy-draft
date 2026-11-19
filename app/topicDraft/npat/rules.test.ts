import { describe, expect, it } from "vitest";
import {
  adjustTier, ANSWER_MAX, bandTier, DEFAULT_ROUND_S, HARD_LETTERS, lettersFor, normAnswer,
  REVEAL_MS, ROUND_MS, sharedPoints, startsWith, TIER_NAMES, TIER_POINTS, VOTE_MS,
} from "./rules";

describe("constants", () => {
  it("has exact tier points and names", () => {
    expect(TIER_POINTS).toEqual({ common: 10, obvious: 15, solid: 30, rare: 60, deep: 85, unicorn: 100 });
    expect(TIER_NAMES).toEqual({
      common: "Common", obvious: "Too Obvious", solid: "Solid", rare: "Rare", deep: "Deep Cut", unicorn: "Unicorn",
    });
  });
  it("has timing and limits", () => {
    expect(ROUND_MS).toEqual({ 45: 45_000, 60: 60_000, 90: 90_000 });
    expect(DEFAULT_ROUND_S).toBe(60);
    expect(VOTE_MS).toBe(8_000);
    expect(REVEAL_MS).toBe(6_000);
    expect(ANSWER_MAX).toBe(40);
  });
});

describe("normAnswer", () => {
  it("normalises text and tolerates non-strings", () => {
    expect(normAnswer("  Éclair ")).toBe("eclair");
    expect(normAnswer(42)).toBe("");
    expect(normAnswer(undefined)).toBe("");
    expect(normAnswer(null)).toBe("");
  });
});

describe("startsWith", () => {
  it("matches the first letter of the normalised answer", () => {
    expect(startsWith("E", "Éclair")).toBe(true);
    expect(startsWith("H", "The Hulk")).toBe(true);
    expect(startsWith("S", "Spider-Man")).toBe(true);
    expect(startsWith("T", "The Hulk")).toBe(false);
  });
  it("counts aliases", () => {
    expect(startsWith("C", "Cyclops", ["Scott Summers"])).toBe(true);
    expect(startsWith("S", "Cyclops", ["Scott Summers"])).toBe(true);
    expect(startsWith("B", "Cyclops", ["Scott Summers"])).toBe(false);
  });
});

describe("sharedPoints", () => {
  it("halves rounded up when shared", () => {
    expect(sharedPoints(100, 1)).toBe(100);
    expect(sharedPoints(85, 2)).toBe(43);
    expect(sharedPoints(15, 3)).toBe(8);
  });
});

describe("adjustTier", () => {
  it("applies the history rule", () => {
    expect(adjustTier("rare", 0.06, 30)).toBe("obvious");
    expect(adjustTier("rare", 0.06, 29)).toBe("rare");
    expect(adjustTier("solid", 0.06, 50)).toBe("common");
    expect(adjustTier("common", 0.5, 50)).toBe("common");
    expect(adjustTier("rare", 0.01, 100)).toBe("rare");
    expect(adjustTier("deep", 0.05, 100)).toBe("obvious");
    expect(adjustTier("unicorn", 0.5, 100)).toBe("obvious");
    expect(adjustTier("obvious", 0.1, 100)).toBe("common");
  });
});

describe("bandTier", () => {
  it("splits a 100-item category into percentile bands", () => {
    expect(bandTier(0, 100)).toBe("common");
    expect(bandTier(99, 100)).toBe("unicorn");
    const counts: Record<string, number> = {};
    for (let r = 0; r < 100; r++) counts[bandTier(r, 100)] = (counts[bandTier(r, 100)] ?? 0) + 1;
    for (const t of ["common", "solid", "rare", "deep", "unicorn"]) {
      expect(counts[t]).toBeGreaterThanOrEqual(15);
      expect(counts[t]).toBeLessThanOrEqual(25);
    }
    expect(counts.deep).toBe(15);
    expect(counts.obvious).toBeUndefined();
  });
});

describe("lettersFor", () => {
  it("drops hard letters unless hard", () => {
    expect(HARD_LETTERS).toEqual(["Q", "X", "Z", "Y"]);
    const easy = lettersFor(false);
    for (const l of HARD_LETTERS) expect(easy).not.toContain(l);
    expect(easy).toHaveLength(22);
    expect(lettersFor(true)).toHaveLength(26);
  });
});
