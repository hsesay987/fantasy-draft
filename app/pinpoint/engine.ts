// Pinpoint: guess the hidden pick from a topic. Every guess is compared with the answer on the topic's real facts
// (release year, director, height, continent…): exact matches, partial overlaps, higher or lower, and how close.
import type { Item } from "../topicDraft/types";
import type { Column, FactValue } from "./data";

export const MAX_GUESSES = 8;
/** Day 1 of the daily puzzle. */
export const PINPOINT_START = Date.UTC(2026, 10, 3);

export type Heat = "hit" | "warm" | "cold" | "none";
export type Cell = {
  key: string;
  /** The guess's own value, ready to print. */
  text: string;
  heat: Heat;
  /** num columns: is the answer's value higher or lower? */
  dir?: "up" | "down";
};
export type Facts = Record<string, FactValue>;
export type Hint = {
  item: Item;
  correct: boolean;
  cells: Cell[];
  /** 0 to 100: how close the guess is overall. */
  closeness: number;
};

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

export const dayNumber = (now = Date.now()) => Math.max(1, Math.floor((now - PINPOINT_START) / 86_400_000) + 1);

/** Today's answer for a topic: the same for everyone on the same day. */
export function dailyAnswer(pool: Item[], poolId: string, day: number): Item {
  return pool[hash(`${poolId}:${day}`) % pool.length]!;
}

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
export function formatValue(col: Column, v: FactValue | undefined): string {
  if (v === undefined) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "string") return v;
  const n = col.fmt === "year" ? (v < 0 ? `${-v} BC` : String(v)) : col.fmt === "big" ? compact.format(v) : col.fmt === "dec1" ? String(Math.round(v * 10) / 10) : String(Math.round(v));
  if (!col.unit || col.fmt === "year") return n;
  return col.unit === "$" ? `$${n}` : `${n} ${col.unit}`;
}

const norm = (s: string) => s.toLowerCase().trim();
/** One column: its heat, the arrow for numbers, and a 0–1 score for the overall closeness. */
function cell(col: Column, g: FactValue | undefined, a: FactValue | undefined): Cell & { score: number } {
  const base = { key: col.key, text: formatValue(col, g) };
  if (g === undefined || a === undefined) return { ...base, heat: "none", score: 0 };
  if (col.kind === "num" && typeof g === "number" && typeof a === "number") {
    const gap = Math.abs(a - g);
    const close = col.rel ? Math.abs(a) * (col.close ?? 0.25) : col.close ?? 0;
    const exact = col.rel ? gap <= Math.abs(a) * 0.02 : gap === 0;
    const heat: Heat = exact ? "hit" : gap <= close ? "warm" : "cold";
    // Score falls off over four "close" widths, so a near miss still counts for something.
    const score = exact ? 1 : Math.max(0, 1 - gap / Math.max(close * 4, 1e-9));
    return { ...base, heat, dir: exact ? undefined : a > g ? "up" : "down", score };
  }
  if (col.kind === "set" || Array.isArray(g) || Array.isArray(a)) {
    const gs = (Array.isArray(g) ? g : [String(g)]).map(norm), as = (Array.isArray(a) ? a : [String(a)]).map(norm);
    const shared = gs.filter((x) => as.includes(x)).length;
    const same = shared === gs.length && shared === as.length;
    return { ...base, heat: same ? "hit" : shared ? "warm" : "cold", score: same ? 1 : shared / Math.max(gs.length, as.length) };
  }
  const same = norm(String(g)) === norm(String(a));
  return { ...base, heat: same ? "hit" : "cold", score: same ? 1 : 0 };
}

export function compare(guess: Item, answer: Item, columns: Column[], facts: Record<string, Facts>): Hint {
  const g = facts[guess.id] ?? {}, a = facts[answer.id] ?? {};
  const scored = columns.map((c) => cell(c, g[c.key], a[c.key]));
  const correct = guess.id === answer.id;
  const known = scored.filter((c) => c.heat !== "none");
  const raw = known.length ? known.reduce((n, c) => n + c.score, 0) / known.length : 0;
  return { item: guess, correct, cells: scored.map(({ score: _score, ...c }) => c), closeness: correct ? 100 : Math.min(99, Math.round(raw * 100)) };
}

/** Emoji grid for sharing: one row per guess, one square per fact. */
export function shareGrid(hints: Hint[], title: string, won: boolean): string {
  const sq = (c: Cell) => (c.heat === "hit" ? "🟩" : c.heat === "warm" ? "🟨" : "⬛");
  const rows = hints.map((h) => h.cells.map(sq).join("") + ` ${h.closeness}%`);
  return [`${title} ${won ? hints.length : "X"}/${MAX_GUESSES}`, ...rows, "toppicgames.com/pinpoint"].join("\n");
}
