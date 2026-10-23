import { describe, it, expect } from "vitest";
import { init, pick, reroll, auto } from "./spin";
import { turnPlayer } from "../engine";
import { getCatalog } from "../catalogs";
import type { Config } from "../types";

const pool = getCatalog("superheroes");
const cfg: Config = { teamSize: 3, players: ["A", "B"], order: "snake", timerSeconds: null, bans: [], roles: [], noDupUniverse: false, powerCap: null, scenario: "x", filters: { universes: [] } };

describe("spin draft", () => {
  it("offers N distinct valid options and only accepts those", () => {
    const s = init(cfg, pool, 3, 1, 5);
    expect(s.offer.length).toBe(3);
    expect(new Set(s.offer).size).toBe(3);
    const outside = pool.find((i) => !s.offer.includes(i.id))!.id;
    expect(pick(s, outside)).toBe(s);
    const t = pick(s, s.offer[0]!);
    expect(t.draft.picks.length).toBe(1);
    expect(t.offer).not.toContain(s.offer[0]);
  });

  it("reroll costs a token, changes the offer and can't go negative", () => {
    let s = init(cfg, pool, 3, 1, 5);
    const first = s.offer;
    const p = turnPlayer(s.draft);
    s = reroll(s);
    expect(s.offer).not.toEqual(first);
    expect(s.rerolls[p]).toBe(0);
    expect(reroll(s)).toBe(s);
  });

  it("auto plays a full draft with unique picks and an empty offer at the end", () => {
    let s = init(cfg, pool, 3, 1, 11);
    let guard = 0;
    while (!s.draft.done && guard++ < 50) s = auto(s);
    expect(s.draft.done).toBe(true);
    expect(s.draft.picks.length).toBe(6);
    expect(new Set(s.draft.picks.map((p) => p.itemId)).size).toBe(6);
    expect(s.offer).toEqual([]);
  });

  it("respects roles: role-required picks stay valid", () => {
    let s = init({ ...cfg, roles: ["a", "b", "c"] }, pool, 3, 0, 2);
    let guard = 0;
    while (!s.draft.done && guard++ < 50) s = auto(s);
    expect(s.draft.done).toBe(true);
    for (const p of ["A", "B"]) expect(s.draft.picks.filter((x) => x.player === p).map((x) => x.role).sort()).toEqual(["a", "b", "c"]);
  });
});
