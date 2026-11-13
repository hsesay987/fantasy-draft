import { describe, expect, it } from "vitest";
import { PEEP_LANES, peckWinner, spriteLanes } from "./peckBoard";

describe("ladder sprite lanes", () => {
  it("puts close guesses side by side and reuses lanes for far ones", () => {
    expect(spriteLanes([10, 11, 50, 12, null, 51], 4)).toEqual([0, 1, 0, 2, null, 1]);
  });

  it("never passes the last lane, even with 12 guesses bunched together", () => {
    const lanes = spriteLanes(Array.from({ length: 12 }, (_, i) => 40 + i * 0.1), 4);
    expect(Math.max(...lanes.map((l) => l ?? 0))).toBe(PEEP_LANES - 1);
    expect(lanes.slice(0, PEEP_LANES)).toEqual([0, 1, 2, 3]);
    // Overflow spreads evenly across the lanes instead of piling on one.
    const counts = Array.from({ length: PEEP_LANES }, (_, l) => lanes.filter((x) => x === l).length);
    expect(counts).toEqual([3, 3, 3, 3]);
  });

  it("takes a lane freed by a guess that is not close", () => {
    expect(spriteLanes([10, 30, 11], 4)).toEqual([0, 0, 1]);
  });
});

describe("Pecking Order winner", () => {
  const players = ["Ann", "Bob", "Cy", "Di"];
  it("crowns the best player when solo", () => {
    expect(peckWinner(players, { Ann: 100, Bob: 300, Cy: 0, Di: 50 }, null)).toEqual({ kind: "win", label: "Bob", score: 300 });
  });
  it("crowns the best team, not its best player, when teamed", () => {
    // Bob is the top player, but Ann and Cy add up to more.
    const w = peckWinner(players, { Ann: 200, Bob: 300, Cy: 200, Di: 0 }, [["Ann", "Cy"], ["Bob", "Di"]]);
    expect(w.kind).toBe("win");
    expect(w.kind === "win" && w.score).toBe(400);
    expect(w.kind === "win" && w.label).not.toBe("Bob");
  });
  it("calls level teams a tie, and nobody when nobody scored", () => {
    expect(peckWinner(players, { Ann: 100, Bob: 50, Cy: 0, Di: 50 }, [["Ann", "Cy"], ["Bob", "Di"]]).kind).toBe("tie");
    expect(peckWinner(players, {}, null)).toEqual({ kind: "none" });
  });
});
