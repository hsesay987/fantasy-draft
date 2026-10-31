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
