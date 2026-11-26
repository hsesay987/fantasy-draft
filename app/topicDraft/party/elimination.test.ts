import { describe, expect, it } from "vitest";
import { cutAfter, eliminationOn, pickOut, roundOf } from "./elimination";
import { DEFAULT_OPTS } from "../../play/types";

describe("elimination: in a game", () => {
  const active = ["A", "B", "C", "D"];
  it("sends out the lowest total", () => {
    expect(pickOut({ A: 5, B: 2, C: 9, D: 4 }, {}, active)).toBe("B");
  });
  it("breaks a tie on the lowest total by what they gained this round", () => {
    expect(pickOut({ A: 5, B: 2, C: 2, D: 4 }, { B: 1, C: 0 }, active)).toBe("C");
  });
  it("sends nobody out on a full tie, and never below 2", () => {
    expect(pickOut({ A: 5, B: 2, C: 2, D: 4 }, { B: 1, C: 1 }, active)).toBeNull();
    expect(pickOut({ A: 5, B: 2 }, {}, ["A", "B"])).toBeNull();
  });
  it("only scores players who are still in", () => {
    expect(pickOut({ A: 5, B: 0, C: 9, D: 4 }, {}, ["A", "C", "D"])).toBe("D");
  });
});

describe("elimination: when it is on", () => {
  const opts = (o: object) => ({ ...DEFAULT_OPTS, ...o });
  it("needs the toggle, a fitting format, 4+ players and no teams", () => {
    expect(eliminationOn({ format: "partytrivia", opts: opts({ elimination: true }) }, 4)).toBe(true);
    expect(eliminationOn({ format: "partytrivia", opts: opts({}) }, 6)).toBe(false);
    expect(eliminationOn({ format: "partytrivia", opts: opts({ elimination: true }) }, 3)).toBe(false);
    expect(eliminationOn({ format: "partytrivia", opts: opts({ elimination: true, teams: 2 }) }, 6)).toBe(false);
    expect(eliminationOn({ format: "imposter", opts: opts({ elimination: true }) }, 6)).toBe(false);
    expect(eliminationOn({ format: "snake", opts: opts({ elimination: true }) }, 6)).toBe(false);
  });
  it("reads each game's round counter", () => {
    expect(roundOf("partytrivia", { round: 3 })).toBe(3);
    expect(roundOf("sayless", { turn: 2, round: 9 })).toBe(2);
    expect(roundOf("npat", { cat: 4 })).toBe(4);
    expect(roundOf("npat", { round: 1, cat: 3 })).toBe(1);
  });
});

describe("elimination: tournament cut", () => {
  it("cuts the lowest totals, keeps ties at the line, never below 2", () => {
    expect(cutAfter({ A: 9, B: 3, C: 5, D: 7 }, ["A", "B", "C", "D"], 1)).toEqual(["B"]);
    expect(cutAfter({ A: 9, B: 3, C: 3, D: 7 }, ["A", "B", "C", "D"], 1)).toEqual([]);
    expect(cutAfter({ A: 9, B: 3, C: 3, D: 7 }, ["A", "B", "C", "D"], 2).sort()).toEqual(["B", "C"]);
    expect(cutAfter({ A: 9, B: 3, C: 5 }, ["A", "B", "C"], 2)).toEqual(["B"]);
    expect(cutAfter({ A: 9, B: 3, C: 5 }, ["A", "B", "C"], 0)).toEqual([]);
  });
});
