import { describe, expect, it } from "vitest";
import { playerStats, rankLabel, scoreDigits, standings, teamIndexOf, votesFor, winnerOf } from "./quizBoard";

const solo = { players: ["Ann", "Bob", "Cy"], teams: null, points: { Ann: 100, Bob: 250, Cy: 100 }, teamPoints: [] };
const team = { players: ["Ann", "Bob", "Cy", "Di"], teams: [["Ann", "Cy"], ["Bob", "Di"]], points: { Ann: 0, Bob: 0, Cy: 0, Di: 0 }, teamPoints: [120, 300] };

describe("party trivia scoreboard", () => {
  it("finds a seat's team by membership", () => {
    expect(teamIndexOf(team.teams, "Di")).toBe(1);
    expect(teamIndexOf(team.teams, "Zed")).toBe(-1);
    expect(teamIndexOf(null, "Ann")).toBe(-1);
  });

  it("ranks players best first, ties share a rank in seat order", () => {
    const rows = standings(solo, "Cy");
    expect(rows.map((r) => [r.label, r.rank, r.mine])).toEqual([["Bob", 1, false], ["Ann", 2, false], ["Cy", 2, true]]);
  });

  it("ranks teams by team points and marks mine", () => {
    const rows = standings(team, "Cy");
    expect(rows.map((r) => [r.label, r.score, r.mine])).toEqual([["Blue team", 300, false], ["Red team", 120, true]]);
    expect(rows[0]!.id).toBe(1); // keeps the team's own index, so colours stay put when the order changes
  });

  it("names a winner, a tie or nobody", () => {
    expect(winnerOf(standings(solo, null))).toMatchObject({ kind: "win", row: { label: "Bob" } });
    expect(winnerOf(standings({ ...solo, points: { Ann: 90, Bob: 90, Cy: 10 } }, null))).toMatchObject({ kind: "tie" });
    expect(winnerOf(standings({ ...solo, points: { Ann: 0, Bob: 0, Cy: 0 } }, null))).toEqual({ kind: "none" });
  });

  it("the most right answers on a team carried it, ties included", () => {
    const s = { players: ["Ann", "Bob", "Cy"], correct: { Ann: 3, Bob: 7, Cy: 7 } };
    expect(playerStats(s, ["Ann", "Bob", "Cy"]).map((p) => [p.name, p.carried])).toEqual([["Bob", true], ["Cy", true], ["Ann", false]]);
  });

  it("nobody carried a level team or a team with no right answers", () => {
    expect(playerStats({ players: ["Ann", "Bob"], correct: { Ann: 4, Bob: 4 } }, ["Ann", "Bob"]).some((p) => p.carried)).toBe(false);
    expect(playerStats({ players: ["Ann", "Bob"], correct: {} }, ["Ann", "Bob"]).some((p) => p.carried)).toBe(false);
  });

  it("a team of one can still carry", () => {
    expect(playerStats({ players: ["Ann"], correct: { Ann: 1 } }, ["Ann"])[0]!.carried).toBe(true);
  });

  it("does not count another team's blanked vote", () => {
    expect(votesFor({ Ann: { choice: "Paris" }, Cy: { choice: "Paris" }, Bob: { choice: "" } })).toEqual({ Paris: ["Ann", "Cy"] });
  });

  it("formats readouts", () => {
    expect(scoreDigits(45)).toBe("00045");
    expect(scoreDigits(123456)).toBe("123456");
    expect([1, 2, 3, 4, 12].map(rankLabel)).toEqual(["1ST", "2ND", "3RD", "4TH", "12TH"]);
  });
});
