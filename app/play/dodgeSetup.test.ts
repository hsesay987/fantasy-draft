import { describe, expect, it } from "vitest";
import { startLaps } from "./dodgeSetup";
import { DEFAULT_OPTS } from "./types";

describe("startLaps", () => {
  it("reopens on the room's last Dodge laps", () => {
    expect(startLaps({ format: "dodge", opts: { ...DEFAULT_OPTS, dodgeLaps: 3 } })).toBe(3);
  });
  it("starts at one lap for anything else", () => {
    expect(startLaps(null)).toBe(1);
    expect(startLaps({ format: "npat", opts: { ...DEFAULT_OPTS, dodgeLaps: 3 } })).toBe(1);
    expect(startLaps({ format: "dodge", opts: { ...DEFAULT_OPTS, dodgeLaps: 7 } })).toBe(1);
  });
});
