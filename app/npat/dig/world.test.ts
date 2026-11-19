import { describe, expect, it } from "vitest";
import { DIG_MAX_M, ZONES } from "../../topicDraft/npat/rules";
import { buildWorld, GEM_SPRITE, my, zoneAt } from "./world";

const record = () => {
  const calls: string[] = [];
  return { calls, ctx: { set fillStyle(v: string) { calls.push(v); }, get fillStyle() { return ""; }, fillRect: (...a: number[]) => { calls.push(a.join(",")); } } };
};

describe("dig world", () => {
  it("maps metres to world pixels", () => {
    expect(my(0)).toBe(40);
    expect(my(5000)).toBe(690);
    expect(my(DIG_MAX_M)).toBeLessThan(720);
  });
  it("finds the zone at its exact boundaries", () => {
    expect(zoneAt(0)).toBe(0);
    expect(zoneAt(399)).toBe(0);
    expect(zoneAt(400)).toBe(1);
    expect(zoneAt(4999)).toBe(6);
    expect(zoneAt(5000)).toBe(7);
    expect(ZONES[zoneAt(5000)].name).toBe("The core");
  });
  it("has a 5x5 gem sprite", () => {
    expect(GEM_SPRITE).toHaveLength(5);
    GEM_SPRITE.forEach((r) => expect(r).toHaveLength(5));
  });
  it("is 240x720 and identical for the same seed", () => {
    const a = buildWorld(11), b = buildWorld(11);
    expect([a.width, a.height]).toEqual([240, 720]);
    const ra = record(), rb = record(), rc = record();
    a.paint(ra.ctx); a.paint(rb.ctx); buildWorld(12).paint(rc.ctx);
    expect(ra.calls.length).toBeGreaterThan(1000);
    expect(ra.calls).toEqual(rb.calls);
    expect(ra.calls).not.toEqual(rc.calls);
    expect(a.layout.worms).toEqual(b.layout.worms);
  });
});
