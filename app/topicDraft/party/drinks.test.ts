import { describe, it, expect } from "vitest";
import { addCalls, initDrinks } from "./drinks";

const players = ["A", "B", "C"];

describe("drinking engine", () => {
  it("caps a player at 3 sips in one round", () => {
    const d = addCalls(initDrinks(players), [{ to: "A", sips: 2, reason: "x" }, { to: "A", sips: 2, reason: "y" }], players);
    expect(d.totals.A).toBe(3);
    expect(d.calls.reduce((n, c) => n + (c.to === "A" ? c.sips : 0), 0)).toBe(3);
  });
  it("stops at 10 for the game and shows one water card", () => {
    let d = initDrinks(players);
    for (let i = 0; i < 6; i++) d = addCalls(d, [{ to: "A", sips: 3, reason: "x" }], players);
    expect(d.totals.A).toBe(10);
    expect(d.watered).toEqual(["A"]);
    expect(d.calls.some((c) => c.water)).toBe(false); // the water card appears only once, earlier
  });
  it("handing out does not add to the giver's total", () => {
    const d = addCalls(initDrinks(players), [{ to: "A", sips: 3, reason: "x", handsOut: true }], players);
    expect(d.totals.A).toBe(0);
  });
  it("a group toast skips capped players and is dropped when everyone is capped", () => {
    let d = initDrinks(["A"]);
    for (let i = 0; i < 4; i++) d = addCalls(d, [{ to: "all", sips: 3, reason: "x" }], ["A"]);
    d = addCalls(d, [{ to: "all", sips: 1, reason: "x" }], ["A"]);
    expect(d.totals.A).toBe(10);
    expect(d.calls).toEqual([]);
  });
  it("emits a water card the round a player hits 10, and bumps seq each round", () => {
    let d = initDrinks(players);
    for (let i = 0; i < 3; i++) d = addCalls(d, [{ to: "A", sips: 3, reason: "x" }], players);
    d = addCalls(d, [{ to: "A", sips: 3, reason: "x" }], players);
    expect(d.calls.filter((c) => c.water).map((c) => c.to)).toEqual(["A"]);
    expect(d.seq).toBe(4);
  });
  it("clamps wild sips and ignores unknown players", () => {
    const d = addCalls(initDrinks(players), [{ to: "A", sips: 99, reason: "x" }, { to: "Zed", sips: 2, reason: "x" }, { to: "B", sips: NaN, reason: "x" }], players);
    expect(d.totals).toEqual({ A: 3, B: 0, C: 0 });
    expect(d.calls.map((c) => c.to)).toEqual(["A"]);
  });
});
