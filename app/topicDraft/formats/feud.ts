// Family Feud: name the top answers for a survey question. Three strikes and the round is over.
import type { Item } from "../types";
import { itemScore } from "../scorer";
import { next, shuffle } from "../rng";

export const BOARD_POINTS = [50, 30, 20, 15, 10];
export const MAX_STRIKES = 3;

export type FeudRound = {
  metric: string;
  board: string[]; // top answers, best first
  options: string[]; // shuffled choices: the board plus decoys
  found: Record<string, string>; // itemId -> player who named it
  wrong: string[];
  strikes: number;
};

export type FeudState = {
  players: string[];
  rounds: FeudRound[];
  round: number;
  turn: number; // guesses made this round
  points: Record<string, number>;
  done: boolean;
  seed: number;
};

export function init(o: { players: string[]; pool: Item[]; statKeys: string[]; rounds: number; seed: number }): FeudState {
  let seed = o.seed;
  const [keys, s1] = shuffle(o.statKeys, seed);
  seed = s1;
  const rounds: FeudRound[] = [];
  for (let i = 0; i < Math.min(o.rounds, keys.length); i++) {
    const metric = keys[i]!;
    const ranked = [...o.pool].sort((a, b) => itemScore(b, { [metric]: 1 }) - itemScore(a, { [metric]: 1 }) || a.id.localeCompare(b.id));
    const board = ranked.slice(0, BOARD_POINTS.length).map((x) => x.id);
    const [decoyPool, s2] = shuffle(ranked.slice(BOARD_POINTS.length, BOARD_POINTS.length + 12).map((x) => x.id), seed);
    const [options, s3] = shuffle([...board, ...decoyPool.slice(0, 4)], s2);
    seed = s3;
    rounds.push({ metric, board, options, found: {}, wrong: [], strikes: 0 });
  }
  return { players: o.players, rounds, round: 0, turn: 0, points: Object.fromEntries(o.players.map((p) => [p, 0])), done: rounds.length === 0, seed };
}

export const turnPlayer = (s: FeudState) => (s.done ? null : s.players[(s.round + s.turn) % s.players.length]!);
export const roundDone = (r: FeudRound) => r.strikes >= MAX_STRIKES || Object.keys(r.found).length >= r.board.length;

export function choose(s: FeudState, by: string, itemId: string): FeudState {
  if (s.done || turnPlayer(s) !== by) return s;
  const r = s.rounds[s.round]!;
  if (!r.options.includes(itemId) || r.found[itemId] || r.wrong.includes(itemId)) return s;
  const rank = r.board.indexOf(itemId);
  const nr: FeudRound = rank >= 0 ? { ...r, found: { ...r.found, [itemId]: by } } : { ...r, wrong: [...r.wrong, itemId], strikes: r.strikes + 1 };
  const points = rank >= 0 ? { ...s.points, [by]: s.points[by]! + BOARD_POINTS[rank]! } : s.points;
  const rounds = s.rounds.map((x, i) => (i === s.round ? nr : x));
  if (roundDone(nr)) {
    const round = s.round + 1;
    return { ...s, rounds, points, round, turn: 0, done: round >= s.rounds.length };
  }
  return { ...s, rounds, points, turn: s.turn + 1 };
}

/** AI: usually names the best answer left, sometimes a decoy. */
export function aiChoose(s: FeudState): { itemId: string; seed: number } {
  const r = s.rounds[s.round]!;
  const [x, seed] = next(s.seed);
  const open = r.options.filter((id) => !r.found[id] && !r.wrong.includes(id));
  const good = r.board.filter((id) => !r.found[id]);
  const bad = open.filter((id) => !r.board.includes(id));
  const itemId = (x < 0.68 && good.length ? good[0]! : bad.length ? bad[Math.floor((x * 997) % bad.length)]! : open[0]!) ?? open[0]!;
  return { itemId, seed };
}
