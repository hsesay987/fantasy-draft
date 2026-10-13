import { describe, it, expect } from "vitest";
import { LOADOUT_PRESETS, init, turnPlayer, validate, pick, autoPick, maxSpend, scoreLoadout, poolItems, priceOf, itemFor } from "./loadout";

const mission = LOADOUT_PRESETS[0]!;

describe("loadout", () => {
  it("every preset slot pool exists and has its price stat", () => {
    for (const m of LOADOUT_PRESETS) for (const sl of m.slots) {
      const items = poolItems(sl.pool);
      expect(items.length).toBeGreaterThan(10);
      expect(items.every((i) => typeof i.stats[sl.priceStat] === "number")).toBe(true);
    }
  });

  it("price is $1-$10 from the stat", () => {
    const [it0] = poolItems("weapons");
    const p = priceOf(it0!, "damage");
    expect(p).toBeGreaterThanOrEqual(1);
    expect(p).toBeLessThanOrEqual(10);
  });

  it("budget reserve keeps $1 per remaining slot", () => {
    const s = init({ ...mission, budget: 8 }, ["A", "B"]);
    expect(maxSpend(s, "A", "weapon")).toBeLessThanOrEqual(8 - 4); // other 4 slots each need >= $1
    const pricey = poolItems("weapons").find((i) => priceOf(i, "damage") >= 6)!;
    const v = validate(s, "weapon", pricey.id);
    expect(v.ok).toBe(false);
  });

  it("items are unique across players and slots can't be refilled", () => {
    let s = init(mission, ["A", "B"], "linear");
    const w = poolItems("weapons").find((i) => priceOf(i, "damage") <= 3)!;
    s = pick(s, "weapon", w.id);
    expect(turnPlayer(s)).toBe("B");
    expect(validate(s, "weapon", w.id).ok).toBe(false);
    s = pick(s, "gadget", poolItems("gadgets")[0]!.id);
    expect(validate(s, "weapon", poolItems("weapons")[1]!.id).ok).toBe(false); // A already filled weapon
  });

  it("autoPick fills every slot within budget for both players", () => {
    let s = init(mission, ["A", "B"]);
    let guard = 0;
    while (!s.done && guard++ < 50) s = autoPick(s);
    expect(s.done).toBe(true);
    for (const p of ["A", "B"]) {
      expect(Object.keys(s.picks[p]!).length).toBe(mission.slots.length);
      expect(s.spent[p]!).toBeLessThanOrEqual(mission.budget);
    }
  });

  it("covering boss weaknesses raises the score; empty scores 0", () => {
    expect(scoreLoadout(mission, []).total).toBe(0);
    let s = init(mission, ["A"]);
    while (!s.done) s = autoPick(s);
    const items = mission.slots.map((slot) => ({ slot, item: itemFor(s, "A", slot.id)! }));
    const r = scoreLoadout(mission, items);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThanOrEqual(100);
  });

  it.each(LOADOUT_PRESETS.map((m) => [m.id, m] as const))("%s: autoPick completes for 2-4 players within budget", (_id, m) => {
    for (const n of [2, 3, 4]) {
      const players = Array.from({ length: n }, (_, i) => `P${i}`);
      let s = init(m, players);
      let guard = 0;
      while (!s.done && guard++ < 100) s = autoPick(s);
      for (const p of players) {
        expect(Object.keys(s.picks[p]!).length).toBe(m.slots.length);
        expect(s.spent[p]!).toBeLessThanOrEqual(m.budget);
      }
    }
  });
});
