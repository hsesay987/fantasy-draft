// Pinpoint: guess the hidden pick from a topic. Every guess is compared with the answer on group, type, tags and
// each of the topic's six stats (higher or lower, and how close), plus one overall closeness score.
import type { Item } from "./types";

export const MAX_GUESSES = 8;
/** Day 1 of the daily puzzle. */
export const PINPOINT_START = Date.UTC(2026, 10, 3);

export type StatHint = { key: string; guess: number; dir: "up" | "down" | "same"; heat: "hit" | "warm" | "cold" };
export type Hint = {
  item: Item;
  correct: boolean;
  universe: boolean;
  archetype: boolean;
  /** Tags the guess shares with the answer. */
  shared: string[];
  stats: StatHint[];
  /** 0 to 100: how close the guess is overall. */
  closeness: number;
};

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);

export const dayNumber = (now = Date.now()) => Math.max(1, Math.floor((now - PINPOINT_START) / 86_400_000) + 1);

/** Today's answer for a topic: the same for everyone on the same day. */
export function dailyAnswer(pool: Item[], poolId: string, day: number): Item {
  return pool[hash(`${poolId}:${day}`) % pool.length]!;
}

export function compare(guess: Item, answer: Item, statKeys: string[]): Hint {
  const stats = statKeys.map((key): StatHint => {
    const g = guess.stats[key] ?? 0, a = answer.stats[key] ?? 0, d = Math.abs(a - g);
    return { key, guess: g, dir: d <= 2 ? "same" : a > g ? "up" : "down", heat: d <= 4 ? "hit" : d <= 12 ? "warm" : "cold" };
  });
  const correct = guess.id === answer.id;
  const universe = guess.universe === answer.universe;
  const archetype = guess.archetype === answer.archetype;
  const shared = guess.tags.filter((t) => answer.tags.includes(t));
  const statGap = statKeys.length ? statKeys.reduce((n, k) => n + Math.abs((answer.stats[k] ?? 0) - (guess.stats[k] ?? 0)), 0) / statKeys.length : 50;
  const tagScore = answer.tags.length ? shared.length / answer.tags.length : 0;
  const raw = 0.55 * Math.max(0, 1 - statGap / 40) + 0.2 * (universe ? 1 : 0) + 0.15 * (archetype ? 1 : 0) + 0.1 * tagScore;
  return { item: guess, correct, universe, archetype, shared, stats, closeness: correct ? 100 : Math.min(99, Math.round(raw * 100)) };
}

/** Emoji grid for sharing: one row per guess, one square per hint. */
export function shareGrid(hints: Hint[], title: string, won: boolean): string {
  const sq = (h: StatHint) => (h.heat === "hit" ? "🟩" : h.heat === "warm" ? "🟨" : "⬛");
  const rows = hints.map((h) => [h.universe ? "🟩" : "⬛", h.archetype ? "🟩" : "⬛", ...h.stats.map(sq)].join("") + ` ${h.closeness}%`);
  return [`${title} ${won ? hints.length : "X"}/${MAX_GUESSES}`, ...rows, "toppicgames.com/pinpoint"].join("\n");
}
