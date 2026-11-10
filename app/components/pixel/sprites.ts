// Pixel-art sprites as rows of palette letters. "." is transparent.
export type Pal = Record<string, string>;
export type Sprite = { rows: string[]; pal: Pal };

const GEM_ROWS = ["...00...", "..0AA0..", ".0AAAA0.", "0AAAABA0", ".0AABB0.", "..0BB0..", "...00..."];
const GEM_PAL: Record<1 | 2 | 3 | 4, Pal> = {
  1: { 0: "#070419", A: "#8f9cc9", B: "#6471a5" },
  2: { 0: "#070419", A: "#8fe3ff", B: "#4cc9f0" },
  3: { 0: "#070419", A: "#d6c8ff", B: "#9b7cff" },
  4: { 0: "#070419", A: "#fff1a6", B: "#ffd23f" },
};
/** Gem for a clue tier: 1 is the most common, 4 the rarest. */
export const gem = (tier: number): Sprite => ({ rows: GEM_ROWS, pal: GEM_PAL[Math.min(4, Math.max(1, tier)) as 1 | 2 | 3 | 4] });
export const TIER_NAMES = ["COMMON", "UNCOMMON", "RARE", "LEGENDARY"];

const HERO_ROWS = ["..rrrr..", ".rrrrrr.", ".ssssss.", ".s0ss0s.", ".ssssss.", "..bbbb..", ".bbbbbb.", ".bbbbbb.", "..p..p..", "..p..p.."];
export const HERO_COLORS = ["#ff4d6d", "#4cc9f0", "#ffd23f", "#3ddc97", "#fb923c", "#b9a4ff"];
export const hero = (i: number): Sprite => ({ rows: HERO_ROWS, pal: { r: HERO_COLORS[i % HERO_COLORS.length]!, s: "#ffd9b0", 0: "#1a1033", b: "#4cc9f0", p: "#7c3aed" } });

export const strikeX = (on: boolean): Sprite => ({ rows: ["X......X", ".X....X.", "..X..X..", "...XX...", "...XX...", "..X..X..", ".X....X.", "X......X"], pal: { X: on ? "#ff4d6d" : "#4c3f94" } });
export const heart = (): Sprite => ({ rows: ["..XX.XX..", ".XXXXXXX.", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."], pal: { X: "#4c3f94" } });

export const CAR_ROWS = ["................", "....XXXXXX......", "...XAAAAAAX.....", "..XAAWWAWWAX....", ".XAAAAAAAAAAXXXX", "XAAAAAAAAAAAAAAX", "XXXXXXXXXXXXXXXX", ".XKKX......XKKX.", "..KK........KK.."];
export const car = (i: number): Sprite => ({ rows: CAR_ROWS, pal: { X: "#070419", A: HERO_COLORS[i % HERO_COLORS.length]!, W: "#cfeaff", K: "#9b90d6" } });

// 16x16 product icons by kind, used when a product has no photo.
const ICON_ROWS: Record<string, string[]> = {
  drink: ["....XX..........", "....XX..........", "...XAAX.........", "...XAAX.........", "..XAAAAX........", "..XBBBBX........", "..XBBBBX........", "..XBBBBX........", "..XBBBBX........", "..XXXXXX........"],
  snack: ["..XXXXXXXXXXXX..", ".XAAAAAAAAAAAAX.", "XAAXXAAAAAXXAAAX", "XAAXBAAAAAXBAAAX", "XAAAAAAAAAAAAAAX", "XAAAAAAAAAAAAAAX", "XAAAAAAAAAAAAAAX", ".XAAAAAAAAAAAAX.", "..XXXXXXXXXXXX.."],
  can: ["..XXXXXXXXXX..", ".XAAAAAAAAAAX.", ".XXXXXXXXXXXX.", ".XBBBBBBBBBBX.", ".XBBBBBBBBBBX.", ".XBBBBBBBBBBX.", ".XBBBBBBBBBBX.", ".XXXXXXXXXXXX.", ".XAAAAAAAAAAX.", "..XXXXXXXXXX.."],
  box: ["..XXXXXXXXXXXX..", ".XAAAAAAAAAAAAX.", "XAAAAAAAAAAAAAAX", "XXXXXXXXXXXXXXXX", "XBBBBBBBBBBBBBBX", "XBBBBBBBBBBBBBBX", "XBBBBBBBBBBBBBBX", "XBBBBBBBBBBBBBBX", "XXXXXXXXXXXXXXXX"],
};
export const ICON_KINDS = Object.keys(ICON_ROWS);
export const productIcon = (kind: string, a = "#ffffff", b = "#7c3aed"): Sprite => {
  const used = (ICON_ROWS[kind] ?? ICON_ROWS.box!).filter((r) => /[^.]/.test(r));
  const w = Math.max(...used.map((r) => r.length));
  const pad = (r: string) => r.padEnd(w, ".");
  const rows = used.map(pad);
  const top = Math.floor((w - rows.length) / 2);
  const blank = ".".repeat(w);
  return { rows: [...Array(Math.max(0, top)).fill(blank), ...rows, ...Array(Math.max(0, w - rows.length - top)).fill(blank)], pal: { X: "#070419", A: a, B: b } };
};

/** A detective's magnifying glass. */
export const magnifier = (): Sprite => ({
  rows: ["..0000....", ".0GGGG0...", "0GgGGGG0..", "0GggGGG0..", "0GgGGGG0..", "0GGGGGG0..", ".0GGGG0...", "..0000B...", "......BB..", ".......BB.", "........BB"],
  pal: { 0: "#d9b05c", G: "#7ea3b0", g: "#cfe7ee", B: "#7a4f2c" },
});

// ---------- Vowel Play: type for the sheet of paper, and the keys off the machine ----------
const glyphs = (src: Record<string, string>): Record<string, string[]> => Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.split(" ")]));

/** Slab type, 7x9, the machine's own face. */
const TYPE_7 = glyphs({
  A: "...#... ...#... ..#.#.. ..#.#.. .#...#. .#####. .#...#. #.....# ##...##",
  B: "######. .#....# .#....# .#....# .#####. .#....# .#....# .#....# ######.",
  C: "..####. .#....# #...... #...... #...... #...... #...... .#....# ..####.",
  D: "#####.. .#...#. .#....# .#....# .#....# .#....# .#....# .#...#. #####..",
  E: "####### .#....# .#..... .#..#.. .####.. .#..#.. .#..... .#....# #######",
  F: "####### .#....# .#..... .#..#.. .####.. .#..#.. .#..... .#..... ###....",
  G: "..####. .#....# #...... #...... #...### #.....# #.....# .#....# ..####.",
  H: "###.### .#...#. .#...#. .#...#. .#####. .#...#. .#...#. .#...#. ###.###",
  I: ".#####. ...#... ...#... ...#... ...#... ...#... ...#... ...#... .#####.",
  J: "..##### .....#. .....#. .....#. .....#. .....#. #....#. #....#. .####..",
  K: "###.### .#...#. .#..#.. .#.#... .##.... .#.#... .#..#.. .#...#. ###.###",
  L: "###.... .#..... .#..... .#..... .#..... .#..... .#..... .#....# #######",
  M: "##...## .##.##. .#.#.#. .#.#.#. .#.#.#. .#...#. .#...#. .#...#. ###.###",
  N: "##..### .##..#. .##..#. .#.#.#. .#.#.#. .#.#.#. .#..##. .#..##. ###..#.",
  O: "..###.. .#...#. #.....# #.....# #.....# #.....# #.....# .#...#. ..###..",
  P: "######. .#....# .#....# .#....# .#####. .#..... .#..... .#..... ###....",
  Q: "..###.. .#...#. #.....# #.....# #.....# #..#..# #...#.# .#...#. ..###.#",
  R: "######. .#....# .#....# .#....# .#####. .#..#.. .#...#. .#...#. ###..##",
  S: ".####.# #....## #...... .#..... ..###.. .....#. ......# ##....# #.####.",
  T: "####### #..#..# ...#... ...#... ...#... ...#... ...#... ...#... ..###..",
  U: "###.### .#...#. .#...#. .#...#. .#...#. .#...#. .#...#. .#...#. ..###..",
  V: "###.### .#...#. .#...#. .#...#. ..#.#.. ..#.#.. ..#.#.. ...#... ...#...",
  W: "###.### .#...#. .#...#. .#...#. .#.#.#. .#.#.#. .#.#.#. ..#.#.. ..#.#..",
  X: "###.### .#...#. ..#.#.. ..#.#.. ...#... ..#.#.. ..#.#.. .#...#. ###.###",
  Y: "###.### .#...#. ..#.#.. ..#.#.. ...#... ...#... ...#... ...#... ..###..",
  Z: "####### #....#. ....#.. ...#... ...#... ..#.... .#..... #.....# #######",
  0: "..###.. .#...#. #....## #...#.# #..#..# #.#...# ##....# .#...#. ..###..",
  1: "...#... ..##... ...#... ...#... ...#... ...#... ...#... ...#... .#####.",
  2: ".#####. #.....# ......# .....#. ...##.. ..#.... .#..... #.....# #######",
  3: ".#####. #.....# ......# ......# ..####. ......# ......# #.....# .#####.",
  4: "....##. ...#.#. ..#..#. .#...#. #....#. ####### .....#. .....#. ...####",
  5: "####### #...... #...... #####.. .....#. ......# ......# #....#. .####..",
  6: "..####. .#..... #...... #.###.. ##...#. #.....# #.....# .#...#. ..###..",
  7: "####### #.....# .....#. ....#.. ....#.. ...#... ...#... ...#... ...#...",
  8: ".#####. #.....# #.....# #.....# .#####. #.....# #.....# #.....# .#####.",
  9: "..###.. .#...#. #.....# #.....# .#...## ..###.# ......# .....#. .####..",
  "-": "....... ....... ....... ....... .#####. ....... ....... ....... .......",
  "'": "...##.. ...##.. ...#... ..#.... ....... ....... ....... ....... .......",
  ".": "....... ....... ....... ....... ....... ....... ....... ..##... ..##...",
  ":": "....... ....... ..##... ..##... ....... ....... ..##... ..##... .......",
  "/": "......# .....#. .....#. ....#.. ...#... ..#.... .#..... .#..... #......",
  "+": "....... ....... ...#... ...#... .#####. ...#... ...#... ....... .......",
});

/** Small type, 5x7, for long names and the line being typed. */
const TYPE_5 = glyphs({
  A: ".###. #...# #...# ##### #...# #...# #...#", B: "####. #...# #...# ####. #...# #...# ####.", C: ".#### #.... #.... #.... #.... #.... .####",
  D: "####. #...# #...# #...# #...# #...# ####.", E: "##### #.... #.... ####. #.... #.... #####", F: "##### #.... #.... ####. #.... #.... #....",
  G: ".#### #.... #.... #..## #...# #...# .####", H: "#...# #...# #...# ##### #...# #...# #...#", I: "##### ..#.. ..#.. ..#.. ..#.. ..#.. #####",
  J: "..### ...#. ...#. ...#. ...#. #..#. .##..", K: "#...# #..#. #.#.. ##... #.#.. #..#. #...#", L: "#.... #.... #.... #.... #.... #.... #####",
  M: "#...# ##.## #.#.# #.#.# #...# #...# #...#", N: "#...# ##..# ##..# #.#.# #..## #..## #...#", O: ".###. #...# #...# #...# #...# #...# .###.",
  P: "####. #...# #...# ####. #.... #.... #....", Q: ".###. #...# #...# #...# #.#.# #..#. .##.#", R: "####. #...# #...# ####. #.#.. #..#. #...#",
  S: ".#### #.... #.... .###. ....# ....# ####.", T: "##### ..#.. ..#.. ..#.. ..#.. ..#.. ..#..", U: "#...# #...# #...# #...# #...# #...# .###.",
  V: "#...# #...# #...# #...# .#.#. .#.#. ..#..", W: "#...# #...# #...# #.#.# #.#.# ##.## #...#", X: "#...# #...# .#.#. ..#.. .#.#. #...# #...#",
  Y: "#...# #...# .#.#. ..#.. ..#.. ..#.. ..#..", Z: "##### ....# ...#. ..#.. .#... #.... #####",
  0: ".###. #...# #..## #.#.# ##..# #...# .###.", 1: "..#.. .##.. ..#.. ..#.. ..#.. ..#.. .###.", 2: ".###. #...# ....# ...#. ..#.. .#... #####",
  3: "####. ....# ....# .###. ....# ....# ####.", 4: "...#. ..##. .#.#. #..#. ##### ...#. ...#.", 5: "##### #.... ####. ....# ....# #...# .###.",
  6: ".###. #.... #.... ####. #...# #...# .###.", 7: "##### ....# ...#. ..#.. ..#.. ..#.. ..#..", 8: ".###. #...# #...# .###. #...# #...# .###.",
  9: ".###. #...# #...# .#### ....# ....# .###.",
  "-": "..... ..... ..... .###. ..... ..... .....", "'": "..#.. ..#.. .#... ..... ..... ..... .....", ".": "..... ..... ..... ..... ..... .##.. .##..",
  ":": "..... .##.. .##.. ..... .##.. .##.. .....", "/": "....# ....# ...#. ..#.. .#... #.... #....", "+": "..... ..#.. ..#.. ##### ..#.. ..#.. .....",
});

/** The legend on a key top, 3x5. */
const LEGEND = glyphs({
  A: ".#. #.# ### #.# #.#", B: "##. #.# ##. #.# ##.", C: ".## #.. #.. #.. .##", D: "##. #.# #.# #.# ##.", E: "### #.. ##. #.. ###", F: "### #.. ##. #.. #..", G: ".## #.. #.# #.# .##",
  H: "#.# #.# ### #.# #.#", I: "### .#. .#. .#. ###", J: "..# ..# ..# #.# .#.", K: "#.# #.# ##. #.# #.#", L: "#.. #.. #.. #.. ###", M: "#.# ### ### #.# #.#", N: "##. #.# #.# #.# #.#",
  O: ".#. #.# #.# #.# .#.", P: "##. #.# ##. #.. #..", Q: ".#. #.# #.# ### .##", R: "##. #.# ##. #.# #.#", S: ".## #.. .#. ..# ##.", T: "### .#. .#. .#. .#.", U: "#.# #.# #.# #.# ###",
  V: "#.# #.# #.# #.# .#.", W: "#.# #.# ### ### #.#", X: "#.# #.# .#. #.# #.#", Y: "#.# #.# .#. .#. .#.", Z: "### ..# .#. #.. ###",
});

/** Doubles a 1-bit glyph, rounding its steps (Scale2x) so large type looks drawn at that size instead of blown up. */
function scale2x(rows: string[]): string[] {
  const at = (x: number, y: number) => (rows[y]?.[x] ?? ".");
  const out = Array.from({ length: rows.length * 2 }, () => Array<string>(rows[0]!.length * 2).fill("."));
  rows.forEach((row, y) => [...row].forEach((p, x) => {
    const a = at(x, y - 1), b = at(x + 1, y), c = at(x - 1, y), d = at(x, y + 1);
    const pick = (q: boolean, v: string) => (q ? v : p);
    out[y * 2]![x * 2] = pick(c === a && c !== d && a !== b, a);
    out[y * 2]![x * 2 + 1] = pick(a === b && a !== c && b !== d, b);
    out[y * 2 + 1]![x * 2] = pick(d === c && d !== b && c !== a, c);
    out[y * 2 + 1]![x * 2 + 1] = pick(b === d && b !== a && d !== c, d);
  }));
  return out.map((r) => r.join(""));
}

export type TypeSize = "big" | "mid" | "small";
const bigCache = new Map<string, string[]>();
/** Rows for a character at a size; an empty list for one the machine has no slug for, such as a space. */
export function typeGlyph(ch: string, size: TypeSize): string[] {
  if (size === "small") return Object.hasOwn(TYPE_5, ch) ? TYPE_5[ch]! : [];
  if (!Object.hasOwn(TYPE_7, ch)) return [];
  if (size === "mid") return TYPE_7[ch]!;
  if (!bigCache.has(ch)) bigCache.set(ch, scale2x(TYPE_7[ch]!));
  return bigCache.get(ch)!;
}
export const legendGlyph = (ch: string): string[] => (Object.hasOwn(LEGEND, ch) ? LEGEND[ch]! : []);

/** A popped-off key seen from above: chrome ring, paper face, and the bent stem it came off on. */
export const LOOSE_KEY_ROWS = [
  "..kkkkk..",
  ".kCHHCCk.",
  "kCFFFFFCk",
  "kHFFFFFCk",
  "kCFFFFFCk",
  "kCFFFFFSk",
  "kCFFFFFSk",
  ".kCCSSSk.",
  "..kkkkk..",
  "...kMk...",
  "....kMk..",
];
export const LOOSE_KEY_PAL: Pal = { k: "#17100f", C: "#b9c2c4", H: "#f2f6f5", S: "#6a7276", F: "#f5ead0", M: "#8d979b" };

/** One word's mark in the row along the bottom: a key back on the machine, one still lost, the current one, or one to come. */
export const wordPip = (state: "got" | "lost" | "now" | "todo"): Sprite => ({
  rows: ["..kkkkk..", ".kRRRRRk.", "kRFFFFFRk", "kRFFFFFRk", "kRFFFFFRk", "kRFFFFFRk", "kRFFFFFRk", ".kRRRRRk.", "..kkkkk.."],
  pal: state === "got" ? { k: "#17100f", R: "#e3b04b", F: "#f5ead0" }
    : state === "lost" ? { k: "#17100f", R: "#6a4a3c", F: "#c8452f" }
    : state === "now" ? { k: "#17100f", R: "#f2f6f5", F: "#7fc8b4" }
    : { k: "#17100f", R: "#4c3a33", F: "#2c1f1a" },
});
