import { describe, it, expect } from "vitest";
import { init, turnPlayer, validatePick, pick, autoPick, powerOf } from "./engine";
import type { Config, Item } from "./types";

const mk = (id: string, universe = "U", power = 50): Item => ({
  id,
  name: id,
  universe,
  archetype: "x",
  stats: { power, intellect: power },
  tags: [],
});

const pool = Array.from({ length: 12 }, (_, i) => mk(`h${i}`, i % 2 ? "A" : "B", 40 + i));

const base: Config = {
  teamSize: 2,
  players: ["A", "B"],
  order: "snake",
  timerSeconds: null,
  bans: [],
  roles: [],
  noDupUniverse: false,
  powerCap: null,
  scenario: "x",
  filters: { universes: [] },
};

describe("engine", () => {
  it("snake order A,B,B,A", () => {
    let s = init(base, pool);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(turnPlayer(s));
      s = pick(s, `h${i}`);
    }
    expect(order).toEqual(["A", "B", "B", "A"]);
    expect(s.done).toBe(true);
  });

  it("linear order A,B,A,B", () => {
    let s = init({ ...base, order: "linear" }, pool);
    const order: string[] = [];
    for (let i = 0; i < 4; i++) {
      order.push(turnPlayer(s));
      s = pick(s, `h${i}`);
    }
    expect(order).toEqual(["A", "B", "A", "B"]);
  });

  it("rejects banned, duplicate, unknown", () => {
    let s = init({ ...base, bans: ["h1"] }, pool);
    expect(validatePick(s, "h1").ok).toBe(false);
    s = pick(s, "h0");
    expect(validatePick(s, "h0").ok).toBe(false);
    expect(validatePick(s, "nope").ok).toBe(false);
  });

  it("noDupUniverse blocks same universe for same player", () => {
    let s = init({ ...base, noDupUniverse: true, order: "linear" }, pool);
    s = pick(s, "h0"); // A takes universe B
    s = pick(s, "h1"); // B
    const v = validatePick(s, "h2"); // A again, h2 universe B
    expect(v.ok).toBe(false);
  });

  it("powerCap blocks exceeding total", () => {
    let s = init({ ...base, powerCap: 90, order: "linear" }, pool);
    s = pick(s, "h5"); // 45 power for A
    s = pick(s, "h0");
    expect(validatePick(s, "h11").ok).toBe(false); // A would be 45+51
    expect(powerOf(pool[5])).toBeGreaterThan(0);
  });

  it("filters narrow pool", () => {
    const s = init({ ...base, filters: { universes: ["A"] } }, pool);
    expect(s.pool.every((i) => i.universe === "A")).toBe(true);
  });

  it("role must be in roles and used once per player", () => {
    let s = init({ ...base, roles: ["tank", "brain"], order: "linear" }, pool);
    expect(validatePick(s, "h0", "healer").ok).toBe(false);
    s = pick(s, "h0", "tank");
    s = pick(s, "h1", "tank");
    expect(validatePick(s, "h2", "tank").ok).toBe(false);
    expect(validatePick(s, "h2", "brain").ok).toBe(true);
  });

  it("autoPick always valid and finishes the draft", () => {
    let s = init({ ...base, teamSize: 3, noDupUniverse: false, roles: ["a", "b", "c"] }, pool);
    while (!s.done) s = autoPick(s);
    expect(s.picks.length).toBe(6);
    expect(new Set(s.picks.map((p) => p.itemId)).size).toBe(6);
  });
});
