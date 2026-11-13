import { describe, expect, it } from "vitest";
import { VOWEL_TOPICS } from "../party/vowelTopics";
import { normText } from "./rules";
import { SAY_DECKS, SAY_DECK_IDS, sayDeckOf } from "./decks";
import { wordsOf } from "./source";
import "./words";

const PARS: Record<string, number> = { easy: 2, medium: 3, hard: 4 };

describe("word decks", () => {
  it("lists easy, medium, hard, then the vowel topics", () => {
    expect(SAY_DECK_IDS).toEqual(["easy", "medium", "hard", ...VOWEL_TOPICS.map((t) => t.id)]);
    expect(SAY_DECKS.map((d) => d.par).slice(0, 3)).toEqual([2, 3, 4]);
    expect(SAY_DECKS.slice(3).every((d) => d.par === null)).toBe(true);
    expect(sayDeckOf("easy")?.id).toBe("easy");
    expect(sayDeckOf("nope")).toBeUndefined();
  });

  for (const id of ["easy", "medium", "hard"]) {
    describe(id, () => {
      const words = wordsOf(id);
      it("has at least 120 words, each at the deck's par", () => {
        expect(words.length).toBeGreaterThanOrEqual(120);
        expect(words.every((w) => w.par === PARS[id])).toBe(true);
      });
      it("has unique names, no single characters, no digits", () => {
        const names = words.flatMap((w) => [w.name, ...(w.also ?? [])]).map(normText);
        expect(new Set(names).size).toBe(names.length);
        expect(words.every((w) => w.name.length > 1 && !/\d/.test(w.name))).toBe(true);
      });
    });
  }

  it("every topic deck has at least 30 words at par 3", () => {
    for (const t of VOWEL_TOPICS) {
      const w = wordsOf(t.id);
      expect(w.length).toBeGreaterThanOrEqual(30);
      expect(w.every((x) => x.par === 3)).toBe(true);
    }
  });

  it("serves [] for an unknown deck", () => {
    expect(wordsOf("nope")).toEqual([]);
  });
});
