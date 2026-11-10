import { describe, expect, it } from "vitest";
import { teamStandings, teamsFor } from "./teamStandings";
import { DEFAULT_OPTS } from "./types";

const four = ["Ann", "Bob", "Cy", "Di"];
const setup = (teams: number, teamMap: Record<string, number> = {}) => ({ opts: { ...DEFAULT_OPTS, teams, teamMap } });

describe("teamStandings", () => {
  it("adds up each team's members and sorts best first", () => {
    const rows = teamStandings({ Ann: 3, Bob: 2, Cy: 9, Di: 0 }, [["Ann", "Bob"], ["Cy", "Di"]]);
    expect(rows.map((r) => [r.name, r.score])).toEqual([["Blue team", 9], ["Red team", 5]]);
    expect(rows[0]!.members).toEqual(["Cy", "Di"]);
  });
  it("keeps team order on a tie, and counts a missing player as 0", () => {
    const rows = teamStandings({ Ann: 2, Cy: 2 }, [["Ann", "Bob"], ["Cy", "Di"]]);
    expect(rows.map((r) => r.index)).toEqual([0, 1]);
    expect(rows[0]!.score).toBe(2);
  });
});

describe("teamsFor", () => {
  it("uses the host's map", () => expect(teamsFor(setup(2, { Ann: 0, Bob: 1, Cy: 0, Di: 1 }), four)).toEqual([["Ann", "Cy"], ["Bob", "Di"]]));
  it("puts a loose player on the smallest team", () => expect(teamsFor(setup(2, { Ann: 0, Bob: 0, Cy: 1 }), four)).toEqual([["Ann", "Bob"], ["Cy", "Di"]]));
  it("is a solo game with no teams, too few players, or one team left", () => {
    expect(teamsFor(setup(0), four)).toBeNull();
    expect(teamsFor(setup(2, { Ann: 0, Bob: 1 }), four.slice(0, 3))).toBeNull();
    expect(teamsFor(setup(2, { Ann: 0, Bob: 0, Cy: 0, Di: 0 }), four)).toBeNull();
  });
});
