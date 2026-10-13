import { describe, it, expect } from "vitest";
import { init, assign, unassign, reroll, lock, complete, autoAssign, bestAssignment, scorePosition, STD_ROLES, rolesFor, weightsFromStats } from "./position";
import { getCatalog } from "../catalogs";

const pool = getCatalog("superheroes");
const byId = (id: string) => pool.find((i) => i.id === id);
const mk = () => init({ players: ["A", "B"], roles: STD_ROLES, poolIds: pool.map((i) => i.id), seed: 3 });

describe("position draft", () => {
  it("deals distinct hands of roles+2 to each player", () => {
    const s = mk();
    expect(s.hands.A!.length).toBe(7);
    expect(new Set([...s.hands.A!, ...s.hands.B!]).size).toBe(14);
  });

  it("assigning moves a character between roles and ignores outsiders", () => {
    let s = mk();
    const [a, b] = s.hands.A!;
    s = assign(s, "A", "captain", a!);
    s = assign(s, "A", "tank", a!);
    expect(s.assign.A).toEqual({ tank: a });
    expect(assign(s, "A", "tank", s.hands.B![0]!)).toBe(s);
    s = assign(s, "A", "healer", b!);
    s = unassign(s, "A", "healer");
    expect(s.assign.A!.healer).toBeUndefined();
  });

  it("reroll only before assigning and only with tokens", () => {
    let s = mk();
    const before = s.hands.A!;
    s = reroll(s, "A");
    expect(s.hands.A).not.toEqual(before);
    expect(s.rerolls.A).toBe(0);
    expect(reroll(s, "A")).toBe(s);
    const t = assign(mk(), "A", "tank", mk().hands.A![0]!);
    expect(reroll(t, "A")).toBe(t);
  });

  it("autoAssign fills every role and beats a worst-case assignment", () => {
    let s = mk();
    s = autoAssign(s, "A", byId);
    expect(complete(s, "A")).toBe(true);
    const items = Object.fromEntries(STD_ROLES.map((r) => [r.id, byId(s.assign.A![r.id]!)]));
    const best = scorePosition(STD_ROLES, items).total;
    const hand = s.hands.A!.map(byId);
    const worst = Object.fromEntries(STD_ROLES.map((r, i) => [r.id, hand[hand.length - 1 - i]]));
    expect(best).toBeGreaterThanOrEqual(scorePosition(STD_ROLES, worst).total);
  });

  it("the draft ends only when every player has locked a complete lineup", () => {
    let s = mk();
    s = lock(s, "A");
    expect(s.locked.A).toBe(false); // incomplete
    s = autoAssign(s, "A", byId);
    s = lock(s, "A");
    expect(s.done).toBe(false);
    s = autoAssign(s, "B", byId);
    s = lock(s, "B");
    expect(s.done).toBe(true);
    expect(unassign(s, "A", "tank")).toBe(s);
  });

  it("custom roles weigh the chosen stats and history uses its own presets", () => {
    const w = weightsFromStats(["power", "speed"], ["speed"]);
    expect(w.speed).toBeGreaterThan(w.power!);
    expect(rolesFor("history")[0]!.weights.leadership).toBeDefined();
    const hand = pool.slice(0, 6);
    const best = bestAssignment(STD_ROLES, hand);
    expect(Object.keys(best).length).toBe(5);
  });
});
