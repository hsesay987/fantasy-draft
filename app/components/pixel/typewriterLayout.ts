// Where each letter goes on the sheet in the carriage. Pure, so every real name can be checked against the width of the paper.
import type { TypeSize } from "./sprites";

/** Paper the type may use, in scene pixels: 16 mid letters at the 320px layout, edge to edge. */
export const PAPER_TEXT_W = 128;
export const CELL: Record<TypeSize, number> = { big: 16, mid: 8, small: 6 };
const GLYPH_W: Record<TypeSize, number> = { big: 14, mid: 7, small: 5 };
const GLYPH_H: Record<TypeSize, number> = { big: 18, mid: 9, small: 7 };

/** A letter on the sheet. `from` is its index in the puzzle if it was already there; otherwise it comes back in the reveal. */
export type Placed = { ch: string; x: number; y: number; from: number | null; vowel: boolean };
export type Sheet = { size: TypeSize; items: Placed[] };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const isVowel = (c: string) => "AEIOU".includes(c);
const fits = (n: number, size: TypeSize) => n * CELL[size] - (CELL[size] - GLYPH_W[size]) <= PAPER_TEXT_W;

/** x and y are relative to the left and top of the writing area, which is PAPER_TEXT_W wide and 20 high. */
function place(line: string, size: TypeSize, y: number): { ch: string; x: number; y: number }[] {
  const width = line.length * CELL[size] - (CELL[size] - GLYPH_W[size]);
  const left = Math.floor((PAPER_TEXT_W - width) / 2);
  return [...line].map((ch, i) => ({ ch, x: left + i * CELL[size], y }));
}

const midY = (size: TypeSize) => Math.floor((20 - GLYPH_H[size]) / 2);

/** The block of letters: large when there is room, always on one line. */
export function layoutPuzzle(puzzle: string): Sheet {
  const size: TypeSize = fits(puzzle.length, "big") ? "big" : fits(puzzle.length, "mid") ? "mid" : "small";
  return { size, items: place(puzzle, size, midY(size)).map((p, i) => ({ ...p, from: i, vowel: false })) };
}

/** Splits a long name on the space nearest the middle. */
function breakLines(text: string): string[] {
  const spaces = [...text].flatMap((c, i) => (c === " " ? [i] : []));
  if (!spaces.length) return [text];
  const at = spaces.reduce((a, b) => (Math.abs(b - text.length / 2) < Math.abs(a - text.length / 2) ? b : a));
  return [text.slice(0, at), text.slice(at + 1)];
}

/** The full name, with each letter that was in the puzzle tied back to its place there. */
export function layoutName(puzzle: string, name: string): Sheet {
  const text = fold(name.trim());
  const size: TypeSize = fits(text.length, "big") ? "big" : fits(text.length, "mid") ? "mid" : "small";
  const lines = fits(text.length, size) ? [text] : breakLines(text);
  const rows = lines.length === 1
    ? place(lines[0]!, size, midY(size))
    : [...place(lines[0]!, size, 2), ...place(lines[1]!, size, 11)];
  // A leading "The" is not in the puzzle, so nothing in it can be tied to a puzzle letter.
  const skip = /^THE[\s-]+\S/.exec(text) ? 3 : 0;
  let p = 0, seen = 0;
  const items: Placed[] = [];
  for (const r of rows) {
    const here = seen++ < skip ? null : r.ch === puzzle[p] ? p++ : null;
    items.push({ ...r, from: here, vowel: isVowel(r.ch) && here === null });
  }
  return { size, items: items.filter((i) => i.ch !== " ") };
}
