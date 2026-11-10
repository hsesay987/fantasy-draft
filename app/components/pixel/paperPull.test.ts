import { describe, expect, it } from "vitest";
import { pullScale } from "./PaperPull";

describe("pullScale", () => {
  it("is a whole number at every width, and the scene it leaves is wide enough for both machines", () => {
    for (let avail = 120; avail <= 900; avail++) {
      const s = pullScale(avail);
      expect(Number.isInteger(s)).toBe(true);
      expect(Math.floor(avail / s)).toBeGreaterThanOrEqual(120);
    }
  });
  it("is 2 on a 320 and a 375 phone, 3 only when the full shop fits", () => {
    expect(pullScale(280)).toBe(2);
    expect(pullScale(343)).toBe(2);
    expect(pullScale(431)).toBe(2);
    expect(pullScale(432)).toBe(3);
    expect(pullScale(239)).toBe(1);
  });
});
