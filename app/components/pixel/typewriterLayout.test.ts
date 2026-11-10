import { describe, expect, it } from "vitest";
import { toPuzzle } from "../../topicDraft/party/vowelText";
import { VOWEL_TOPICS, wordsFor } from "../../topicDraft/party/vowelWords";
import { CELL, layoutName, layoutPuzzle, PAPER_TEXT_W } from "./typewriterLayout";
import { typeGlyph } from "./sprites";

const names = [...new Set(VOWEL_TOPICS.flatMap((t) => wordsFor(t.id)))];

function inside(sheet: ReturnType<typeof layoutName>) {
  for (const i of sheet.items) {
    const w = typeGlyph(i.ch, sheet.size)[0]?.length ?? 0;
    expect(i.x, i.ch).toBeGreaterThanOrEqual(0);
    expect(i.x + w, i.ch).toBeLessThanOrEqual(PAPER_TEXT_W);
    expect(i.y + typeGlyph(i.ch, sheet.size).length, i.ch).toBeLessThanOrEqual(20);
  }
}

describe("the sheet in the carriage", () => {
  it("fits 16 letters on one line in the mid size", () => {
    const s = layoutPuzzle("BCDFGHJKLMNPQRST");
    expect(s.size).toBe("mid");
    expect(new Set(s.items.map((i) => i.y)).size).toBe(1);
    inside(s);
  });

  it("uses large type when the puzzle is short", () => {
    expect(layoutPuzzle("SPDRMN").size).toBe("big");
    expect(CELL.big).toBeGreaterThan(CELL.mid);
  });

  it("fits every puzzle and every full name, and has a slug for every character", () => {
    for (const n of names) {
      const puzzle = layoutPuzzle(toPuzzle(n));
      inside(puzzle);
      expect(new Set(puzzle.items.map((i) => i.y)).size, n).toBe(1);
      const full = layoutName(toPuzzle(n), n);
      inside(full);
      for (const i of [...puzzle.items, ...full.items]) expect(typeGlyph(i.ch, full.size).length, `${n}: ${i.ch}`).toBeGreaterThan(0);
    }
  });

  it("ties every puzzle letter to its place in the name, in order, for every name", () => {
    for (const n of names) {
      const puzzle = toPuzzle(n);
      const tied = layoutName(puzzle, n).items.filter((i) => i.from !== null).map((i) => i.from);
      expect(tied, n).toEqual([...puzzle].map((_, i) => i));
    }
  });

  it("marks only the vowels that came back as keys, and not the letters of a dropped The", () => {
    const s = layoutName("FLSH", "The Flash");
    expect(s.items.filter((i) => i.vowel).map((i) => i.ch)).toEqual(["E", "A"]);
    expect(s.items.filter((i) => i.from === null && !i.vowel).map((i) => i.ch)).toEqual(["T", "H"]);
  });

  it("keeps a hyphen in the name as a plain character, and folds accents", () => {
    const s = layoutName("SPDRMN", "Spider-Man");
    expect(s.items.map((i) => i.ch).join("")).toBe("SPIDER-MAN");
    expect(layoutName("PKMN", "Pokémon").items.map((i) => i.ch).join("")).toBe("POKEMON");
  });
});
