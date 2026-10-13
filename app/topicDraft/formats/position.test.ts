import { describe, it, expect } from "vitest";
import { init, assign, unassign, reroll, lock, complete, autoAssign, bestAssignment, scorePosition, STD_ROLES, rolesFor, weightsFromStats, rollRole, rerollRole } from "./position";
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

describe("position draft — random roll mode", () => {
  const mkRoll = () => init({ players: ["A", "B"], roles: STD_ROLES, poolIds: pool.map((i) => i.id), seed: 5, rerolls: 1, roll: { n: 3 } });

  it("starts with empty hands; rolling a role offers N distinct options and is idempotent", () => {
    let s = mkRoll();
    expect(s.hands.A).toEqual([]);
    s = rollRole(s, "A", "captain");
    const offer = s.roll!.offers.A!.captain!;
    expect(offer.length).toBe(3);
    expect(new Set(offer).size).toBe(3);
    expect(rollRole(s, "A", "captain").roll!.offers.A!.captain).toEqual(offer);
    expect(s.hands.A).toEqual(expect.arrayContaining(offer));
  });

  it("only offered characters can be assigned, nobody can reuse a pick, and the offer clears", () => {
    let s = mkRoll();
    s = rollRole(s, "A", "captain");
    const [pick1] = s.roll!.offers.A!.captain!;
    const outsider = pool.find((i) => !s.roll!.offers.A!.captain!.includes(i.id))!.id;
    expect(assign(s, "A", "captain", outsider)).toBe(s);
    s = assign(s, "A", "captain", pick1!);
    expect(s.assign.A!.captain).toBe(pick1);
    expect(s.roll!.offers.A!.captain).toBeUndefined();
    // B rolls the same role; the picked character is never offered again
    for (let i = 0; i < 20; i++) {
      const r = rollRole({ ...s, roll: { ...s.roll!, offers: { A: {}, B: {} } } }, "B", "tank");
      expect(r.roll!.offers.B!.tank).not.toContain(pick1);
    }
  });

  it("reroll costs a token and changes the offer; hand reroll is disabled in roll mode", () => {
    let s = mkRoll();
    s = rollRole(s, "A", "tank");
    const first = s.roll!.offers.A!.tank!;
    const re = rerollRole(s, "A", "tank");
    expect(re.roll!.offers.A!.tank).not.toEqual(first);
    expect(re.roll!.rerolls.A).toBe(0);
    expect(rerollRole(re, "A", "tank")).toBe(re);
    expect(reroll(s, "A")).toBe(s);
  });

  it("autoAssign fills every role with unique offered characters; lock works", () => {
    let s = mkRoll();
    s = autoAssign(s, "A", byId);
    s = autoAssign(s, "B", byId);
    expect(complete(s, "A")).toBe(true);
    const all = [...Object.values(s.assign.A!), ...Object.values(s.assign.B!)];
    expect(new Set(all).size).toBe(all.length);
    s = lock(lock(s, "A"), "B");
    expect(s.done).toBe(true);
  });
});
