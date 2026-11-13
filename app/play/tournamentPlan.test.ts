import { describe, expect, it } from "vitest";
import { addToPlan, championTitle, dropFromPlan, fitsTable, planReady, PLAN_MAX, standingRows, surprisePlan, type Standing } from "./tournamentPlan";
import type { FormatId } from "./types";

const row = (name: string, total: number, extra: Partial<Standing> = {}): Standing => ({ name, total, last: 0, left: false, rank: 1, ...extra });

describe("plan building", () => {
  it("adds in order, allows repeats, and stops at the most a tournament takes", () => {
    let plan: FormatId[] = [];
    plan = addToPlan(plan, "vowelparty");
    plan = addToPlan(plan, "vote");
    plan = addToPlan(plan, "vowelparty");
    expect(plan).toEqual(["vowelparty", "vote", "vowelparty"]);
    for (let i = 0; i < 10; i++) plan = addToPlan(plan, "imposter");
    expect(plan).toHaveLength(PLAN_MAX);
  });

  it("removes only the tapped slot, even when the game repeats", () => {
    expect(dropFromPlan(["vote", "imposter", "vote"], 2)).toEqual(["vote", "imposter"]);
    expect(dropFromPlan(["vote", "imposter", "vote"], 0)).toEqual(["imposter", "vote"]);
  });

  it("is ready with 2 to 8 games", () => {
    expect(planReady(["vote"])).toBe(false);
    expect(planReady(["vote", "vote"])).toBe(true);
    expect(planReady(Array(9).fill("vote"))).toBe(false);
  });

  it("only fits games the table can start", () => {
    expect(fitsTable("imposter", 2)).toBe(false);
    expect(fitsTable("imposter", 3)).toBe(true);
    expect(fitsTable("mafia", 3)).toBe(false);
    expect(fitsTable("snake", 6)).toBe(true);
    expect(fitsTable("snake", 7)).toBe(false); // drafts take six
    expect(fitsTable("vote", 12)).toBe(true);
  });

  it("surprise picks distinct games while there are enough, then repeats", () => {
    const four = surprisePlan(["vote", "imposter", "insync", "vowelparty", "mafia"], () => 0.5);
    expect(four).toHaveLength(4);
    expect(new Set(four).size).toBe(4);
    const two: FormatId[] = ["vote", "insync"];
    const plan = surprisePlan(two, () => 0.99);
    expect(plan).toHaveLength(4);
    expect(plan.every((f) => two.includes(f))).toBe(true);
    expect(new Set(plan.slice(0, 2)).size).toBe(2);
    expect(surprisePlan([])).toEqual([]);
  });
});

describe("champion title", () => {
  it("names the one leader", () => {
    expect(championTitle([row("Ann", 9), row("Bob", 6)])).toBe("Ann wins the night");
  });
  it("shares the night on a tie", () => {
    expect(championTitle([row("Ann", 9), row("Bob", 9), row("Cy", 2)])).toBe("Ann and Bob share the night");
    expect(championTitle([row("Ann", 4), row("Bob", 4), row("Cy", 4)])).toBe("Ann, Bob and Cy share the night");
  });
  it("counts a player who left", () => {
    expect(championTitle([row("Bob", 5), row("Ann", 7, { left: true })])).toBe("Ann wins the night");
  });
  it("has no winner when nobody scored", () => {
    expect(championTitle([])).toBe("Nobody wins the night");
    expect(championTitle([row("Ann", 0)])).toBe("Nobody wins the night");
  });
});

describe("standing rows", () => {
  it("maps totals, the last game and left players, keeping each seat's sprite", () => {
    const rows = standingRows([row("Bob", 8, { last: 5 }), row("Ann", 6, { last: 3 }), row("Dee", 2, { left: true })], ["Ann", "Bob", "Cy"]);
    expect(rows).toEqual([
      { name: "Bob", score: 8, seat: 1, last: 5 },
      { name: "Ann", score: 6, seat: 0, last: 3 },
      { name: "Dee", score: 2, seat: 5, left: true },
    ]);
  });
});
