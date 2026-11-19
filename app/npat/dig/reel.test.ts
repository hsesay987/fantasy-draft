import { describe, expect, it } from "vitest";
import { reelLetter } from "./reel";

describe("reelLetter", () => {
  it.each(["A", "M", "Z"])("shows a letter on every step and lands on %s", (t) => {
    for (let i = 0; i <= 28; i++) expect(reelLetter(t, i, 28)).toMatch(/^[A-Z]$/);
    expect(reelLetter(t, 28, 28)).toBe(t);
  });
});
