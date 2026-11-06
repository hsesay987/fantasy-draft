import { describe, expect, it } from "vitest";
import { isUsable } from "./vowelText";
import { VOWEL_TOPICS, wordsFor } from "./vowelWords";

describe("vowel word lists", () => {
  it("has topics", () => expect(VOWEL_TOPICS.length).toBeGreaterThan(0));
  for (const t of VOWEL_TOPICS) {
    it(`${t.id}: enough fair, clean, unique names`, () => {
      const names = wordsFor(t.id);
      expect(names.length).toBeGreaterThanOrEqual(40);
      for (const n of names) {
        expect(isUsable(n), n).toBe(true);
        expect(n.includes("("), n).toBe(false);
      }
      expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    });
  }
  it("returns nothing for an unknown topic", () => {
    expect(wordsFor("nope")).toEqual([]);
    expect(wordsFor("__proto__")).toEqual([]);
  });
});
