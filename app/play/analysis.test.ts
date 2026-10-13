import { describe, it, expect } from "vitest";
import { analyze } from "./analysis";
import type { JudgeTeamInput } from "./judging";

const item = (name: string, stats: Record<string, number>, extra: Partial<JudgeTeamInput["items"][number]> = {}) => ({ name, stats, tags: [], ...extra });
const team = (player: string, items: ReturnType<typeof item>[], baseline: number, notes?: string): JudgeTeamInput => ({ player, items, baseline, notes });

const A = team("Ann", [item("Hulk", { power: 100, speed: 55, intellect: 60 }), item("Thor", { power: 98, speed: 85, intellect: 70 }), item("Hawkeye", { power: 35, speed: 50, intellect: 75 })], 78);
const B = team("Bob", [item("Batman", { power: 45, speed: 40, intellect: 98 }), item("Flash", { power: 78, speed: 100, intellect: 85 }), item("Robin", { power: 40, speed: 60, intellect: 78 })], 64);

describe("analysis", () => {
  const a = analyze([A, B], { title: "Alien Invasion", weights: { power: 3, speed: 1, intellect: 1 } }, { Ann: 78, Bob: 64 });

  it("explains the result with margin, head-to-head and advice", () => {
    expect(a.analysis[0]).toContain("Ann wins 78–64");
    expect(a.analysis[0]).toContain("comfortable");
    const text = a.analysis.join(" ");
    expect(text).toMatch(/Head to head: Ann pulled ahead on power/);
    expect(text).toContain("Bob had the edge on");
    expect(text).toMatch(/Rematch advice for Bob/);
  });

  it("builds a comparison table and per-team strengths/weaknesses", () => {
    expect(a.statsTable.map((r) => r.key)).toEqual(["power", "intellect", "speed"]);
    expect(a.statsTable[0]!.values).toEqual({ Ann: 78, Bob: 54 });
    expect(a.perTeam.Ann!.strengths[0]).toMatch(/^Power 78 \(\+23/);
    expect(a.perTeam.Bob!.weaknesses[0]).toMatch(/^Power/);
    expect(a.perTeam.Ann!.highlights[0]).toContain("standout");
  });

  it("calls out the biggest role swing for role-based formats", () => {
    const x = team("X", [item("Plasma Rifle", { damage: 85 }, { role: "Weapon", price: 8 })], 70);
    const y = team("Y", [item("Batarang", { damage: 35 }, { role: "Weapon", price: 3 })], 50);
    const t = analyze([x, y], { title: "Beat Boss", weights: { damage: 1 } }, { X: 70, Y: 50 }).analysis.join(" ");
    expect(t).toContain("Biggest single swing: Weapon — Plasma Rifle ($8) for X against Batarang ($3) for Y");
  });

  it("handles a solo player and an empty field", () => {
    const solo = analyze([A], { title: "Solo", weights: { power: 1 } }, { Ann: 90 });
    expect(solo.analysis[0]).toContain("Ann scores 90");
    expect(solo.analysis[0]).toContain("elite");
    expect(analyze([], { title: "x" }, {}).analysis).toEqual(["No teams to judge."]);
  });

  it("copes with teams that have no items and ties", () => {
    const e = analyze([team("E", [], 0), team("F", [], 0)], { title: "t" }, { E: 0, F: 0 });
    expect(e.analysis[0]).toContain("razor-thin");
    expect(e.statsTable).toEqual([]);
  });
});
