// The Price Is Right: guess an item's rating on the mission. Closest without going over wins it.
import type { Item } from "../types";
import { itemScore } from "../scorer";
import { next, shuffle } from "../rng";

export type PriceRound = { itemId: string; guesses: Record<string, number>; winner: string | null; allOver: boolean };

export type PriceState = {
  players: string[];
  truth: Record<string, number>; // 0-100 mission rating of each queued item
  queue: string[];
  rounds: PriceRound[];
  round: number;
  turn: number; // guesses made this round
  points: Record<string, number>;
  won: Record<string, string[]>;
  errors: Record<string, number[]>; // |guess - truth| per round, for accuracy
  done: boolean;
  seed: number;
};

export function init(o: { players: string[]; pool: Item[]; rounds: number; weights: Record<string, number>; seed: number }): PriceState {
  const n = Math.min(o.rounds, o.pool.length);
  const [shuf, seed] = shuffle(o.pool, o.seed);
  const stream = shuf.slice(0, n);
  return {
    players: o.players,
    truth: Object.fromEntries(stream.map((i) => [i.id, Math.round(itemScore(i, o.weights))])),
    queue: stream.map((i) => i.id),
    rounds: stream.map((i) => ({ itemId: i.id, guesses: {}, winner: null, allOver: false })),
    round: 0,
    turn: 0,
    points: Object.fromEntries(o.players.map((p) => [p, 0])),
    won: Object.fromEntries(o.players.map((p) => [p, []])),
    errors: Object.fromEntries(o.players.map((p) => [p, []])),
    done: false,
    seed,
  };
}

/** Guessing order rotates so nobody always sees the others first. */
export const turnPlayer = (s: PriceState) => (s.done ? null : s.players[(s.round + s.turn) % s.players.length]!);
export const currentItemId = (s: PriceState) => (s.done ? null : s.queue[s.round]!);

export function guess(s: PriceState, by: string, value: number): PriceState {
  if (s.done || turnPlayer(s) !== by) return s;
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const rounds = s.rounds.map((r, i) => (i === s.round ? { ...r, guesses: { ...r.guesses, [by]: v } } : r));
  if (s.turn + 1 < s.players.length) return { ...s, rounds, turn: s.turn + 1 };
  return resolve({ ...s, rounds, turn: 0 });
}

function resolve(s: PriceState): PriceState {
  const r = s.rounds[s.round]!;
  const t = s.truth[r.itemId]!;
  const entries = Object.entries(r.guesses);
  const under = entries.filter(([, g]) => g <= t).sort((a, b) => b[1] - a[1]);
  const allOver = under.length === 0;
  const pick = allOver ? [...entries].sort((a, b) => a[1] - b[1])[0]! : under[0]!;
  const tie = entries.filter(([, g]) => g === pick[1]).length > 1;
  const winner = tie ? null : pick[0];
  const diff = Math.abs(pick[1] - t);
  const gain = Math.max(10, 100 - diff * 5) * (allOver ? 0.5 : 1);
  const points = { ...s.points };
  const won = { ...s.won };
  if (winner) {
    points[winner] = (points[winner] ?? 0) + Math.round(gain);
    won[winner] = [...won[winner]!, r.itemId];
  }
  const errors = Object.fromEntries(s.players.map((p) => [p, [...s.errors[p]!, Math.abs((r.guesses[p] ?? 0) - t)]]));
  const rounds = s.rounds.map((x, i) => (i === s.round ? { ...x, winner, allOver } : x));
  const round = s.round + 1;
  return { ...s, rounds, points, won, errors, round, done: round >= s.queue.length };
}

/** 0-100: how close a player's guesses were on average (100 = always exact). */
export const accuracy = (s: PriceState, p: string) => {
  const e = s.errors[p]!;
  return e.length ? Math.round(Math.max(0, 100 - (e.reduce((a, b) => a + b, 0) / e.length) * 2.5)) : 0;
};

/** AI: truth plus noise, shaded low so it rarely goes over. */
export function aiGuess(s: PriceState): { value: number; seed: number } {
  const [r, seed] = next(s.seed);
  const t = s.truth[currentItemId(s)!]!;
  return { value: Math.max(0, Math.min(100, Math.round(t + (r - 0.5) * 28 - 3))), seed };
}
