import { describe, it, expect } from "vitest";
import { battle } from "./battle";
import { getCatalog } from "./catalogs";
import { toJudgeItem } from "../play/judging";
import { itemScore } from "./scorer";
import { missionsFor } from "./missions";

describe("battle judging", () => {
  const items = getCatalog("superheroes");
  const m = missionsFor("superheroes")[0]!;
  const sorted = [...items].sort((a, b) => itemScore(b, m.weights) - itemScore(a, m.weights));
  const strong = sorted.slice(0, 5).map((i) => toJudgeItem(i));
  const weak = sorted.slice(-5).map((i) => toJudgeItem(i));
  it("stronger team wins the duels and gains score", () => {
    const r = battle([{ player: "A", items: strong, baseline: 60 }, { player: "B", items: weak, baseline: 60 }], m.weights);
    expect(r.duels).toHaveLength(5);
    expect(r.teams[0]!.baseline).toBeGreaterThan(r.teams[1]!.baseline);
    expect(r.teams[0]!.notes).toContain("won 5 of 5");
  });
  it("is symmetric for identical teams", () => {
    const r = battle([{ player: "A", items: strong, baseline: 70 }, { player: "B", items: strong, baseline: 70 }], m.weights);
    expect(r.teams[0]!.baseline).toBe(r.teams[1]!.baseline);
  });
});
