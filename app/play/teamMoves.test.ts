import { describe, expect, it } from "vitest";
import { compactTeams, moveToTeam, placeTeams, splitTeams } from "./teamMoves";

const four = ["Ann", "Bob", "Cy", "Di"];
const sizes = (map: Record<string, number>, n: number) => Array.from({ length: n }, (_, t) => Object.values(map).filter((v) => v === t).length);

describe("team picker moves", () => {
  it("splits evenly, whatever the seed", () => {
    for (const seed of [1, 2, 3, 99]) {
      expect(sizes(splitTeams(four, 2, seed), 2)).toEqual([2, 2]);
      expect(sizes(splitTeams([...four, "Ed"], 2, seed), 2).sort()).toEqual([2, 3]);
      expect(sizes(splitTeams([...four, "Ed", "Flo", "Gus"], 3, seed), 3).sort()).toEqual([2, 2, 3]);
    }
  });

  it("shuffle gives a different split when it can", () => {
    const first = splitTeams(four, 2, 5);
    for (let seed = 0; seed < 30; seed++) expect(splitTeams(four, 2, seed, first)).not.toEqual(first);
  });

  it("moves one player and keeps the rest", () => {
    const map = { Ann: 0, Bob: 0, Cy: 1, Di: 1 };
    expect(moveToTeam(four, 2, map, "Ann", 1)).toEqual({ Ann: 1, Bob: 0, Cy: 1, Di: 1 });
  });

  it("ignores a move to a team or for a player that isn't there", () => {
    const map = { Ann: 0, Bob: 0, Cy: 1, Di: 1 };
    expect(moveToTeam(four, 2, map, "Zed", 1)).toEqual(map);
    expect(moveToTeam(four, 2, map, "Ann", 2)).toEqual(map);
    expect(moveToTeam(four, 2, map, "Ann", Number.NaN)).toEqual(map);
  });

  it("stays right when seats change while the picker is open", () => {
    const map = { Ann: 0, Bob: 0, Cy: 1, Di: 1 };
    // Bob leaves: he goes from the map, and nobody else moves.
    expect(placeTeams(["Ann", "Cy", "Di"], 2, map)).toEqual({ Ann: 0, Cy: 1, Di: 1 });
    // A newcomer joins the smallest team.
    expect(placeTeams(["Ann", "Cy", "Di", "Ed"], 2, map)).toEqual({ Ann: 0, Cy: 1, Di: 1, Ed: 0 });
    // A move made after that keeps the newcomer where they were shown.
    expect(moveToTeam(["Ann", "Cy", "Di", "Ed"], 2, map, "Di", 0)).toEqual({ Ann: 0, Cy: 1, Di: 0, Ed: 0 });
  });

  it("a player from a removed team goes on the smallest team", () => {
    expect(placeTeams(four, 2, { Ann: 3, Bob: 0, Cy: 1, Di: 1 })).toEqual({ Ann: 0, Bob: 0, Cy: 1, Di: 1 });
  });

  it("saves with empty teams closed up", () => {
    expect(compactTeams(four, 3, { Ann: 0, Bob: 0, Cy: 2, Di: 2 })).toEqual({ teams: 2, teamMap: { Ann: 0, Bob: 0, Cy: 1, Di: 1 } });
  });

  it("saves no teams when everyone is on one", () => {
    expect(compactTeams(four, 2, { Ann: 1, Bob: 1, Cy: 1, Di: 1 })).toEqual({ teams: 0, teamMap: {} });
  });
});
