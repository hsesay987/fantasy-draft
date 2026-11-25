// Family Feud: name the survey's top answers. Questions and answers come from the topic's trivia surveys.
import type { Survey } from "../trivia/types";
import { next, shuffle } from "../rng";
import { closestAnswer, distance, fold } from "../spelling";

export const BOARD_POINTS = [50, 30, 20, 15, 10];
export const MAX_STRIKES = 3;

export type FeudRound = {
  sid?: string; // bank id, so the survey can be rated
  q: string;
  board: string[]; // top answers, best first
  decoys: string[]; // plausible wrong answers (only the AI uses them)
  found: Record<string, string>; // answer -> player who named it
  wrong: string[]; // what players typed that was not on the board
  strikes: number;
  /** Players who have had a spelling suggestion this round: one each, so nobody can fish for the board. */
  hinted?: string[];
};

/** Which board answer did the player mean? Forgives case, punctuation, partial names and small typos. */
export function matchAnswer(text: string, board: string[]): string | null {
  const t = fold(text);
  if (t.length < 2) return null;
  const folded = board.map((b) => [b, fold(b)] as const);
  const exact = folded.find(([, f]) => f === t);
  if (exact) return exact[0];
  if (t.length >= 4) {
    const part = folded.find(([, f]) => f.split(" ").some((w) => w === t) || f.includes(t) || (f.length >= 4 && t.includes(f)));
    if (part) return part[0];
  }
  const typo = folded.find(([, f]) => t.length >= 5 && distance(t, f) <= (f.length >= 9 ? 2 : 1));
  return typo ? typo[0] : null;
}

export type FeudState = {
  players: string[];
  rounds: FeudRound[];
  round: number;
  turn: number; // guesses made this round
  points: Record<string, number>;
  done: boolean;
  seed: number;
};

export function init(o: { players: string[]; surveys: Survey[]; avoid?: string[]; rounds: number; seed: number }): FeudState {
  let seed = o.seed;
  const avoid = new Set(o.avoid ?? []);
  const all = o.surveys;
  const fresh = all.filter((x) => !avoid.has(x.q));
  const [picked, s1] = shuffle(fresh.length >= o.rounds ? fresh : all, seed);
  seed = s1;
  const rounds: FeudRound[] = picked.slice(0, o.rounds).map((sv) => {
    return { sid: sv.id, q: sv.q, board: sv.answers.slice(0, BOARD_POINTS.length), decoys: sv.decoys, found: {}, wrong: [], strikes: 0 };
  });
  return { players: o.players, rounds, round: 0, turn: 0, points: Object.fromEntries(o.players.map((p) => [p, 0])), done: rounds.length === 0, seed };
}

export const turnPlayer = (s: FeudState) => (s.done ? null : s.players[(s.round + s.turn) % s.players.length]!);
export const roundDone = (r: FeudRound) => r.strikes >= MAX_STRIKES || Object.keys(r.found).length >= r.board.length;

/** The hidden answer a typed miss was close to, if this player has had no suggestion this round. Costs nothing. */
export function nearMiss(s: FeudState, by: string, text: string): string | null {
  if (s.done || turnPlayer(s) !== by || typeof text !== "string") return null;
  const r = s.rounds[s.round]!;
  if (r.hinted?.includes(by) || matchAnswer(text, r.board)) return null;
  return closestAnswer(text, r.board.filter((a) => !r.found[a]));
}

/** A player types an answer. Naming one already on the board changes nothing; a near miss only notes the suggestion; anything else off the board is a strike. */
export function choose(s: FeudState, by: string, text: string): FeudState {
  if (s.done || turnPlayer(s) !== by) return s;
  const r = s.rounds[s.round]!;
  if (nearMiss(s, by, text)) return { ...s, rounds: s.rounds.map((x, i) => (i === s.round ? { ...r, hinted: [...(r.hinted ?? []), by] } : x)) };
  const answer = matchAnswer(text, r.board);
  if (answer && r.found[answer]) return s;
  // A near miss of an answer already on the board is naming it again: nothing happens.
  if (!answer && closestAnswer(text, Object.keys(r.found))) return s;
  if (!answer && (fold(text).length < 2 || r.wrong.some((w) => fold(w) === fold(text)))) return s;
  const rank = answer ? r.board.indexOf(answer) : -1;
  const nr: FeudRound = answer ? { ...r, found: { ...r.found, [answer]: by } } : { ...r, wrong: [...r.wrong, text.trim().slice(0, 40)], strikes: r.strikes + 1 };
  const points = answer ? { ...s.points, [by]: s.points[by]! + BOARD_POINTS[rank]! } : s.points;
  const rounds = s.rounds.map((x, i) => (i === s.round ? nr : x));
  if (roundDone(nr)) {
    const round = s.round + 1;
    return { ...s, rounds, points, round, turn: 0, done: round >= s.rounds.length };
  }
  return { ...s, rounds, points, turn: s.turn + 1 };
}

/** AI: usually names the best answer left, sometimes a plausible wrong one. */
export function aiChoose(s: FeudState): { choice: string; seed: number } {
  const r = s.rounds[s.round]!;
  const [x, seed] = next(s.seed);
  const good = r.board.filter((a) => !r.found[a]);
  const bad = r.decoys.filter((d) => !r.wrong.some((w) => fold(w) === fold(d)));
  const choice = x < 0.68 && good.length ? good[0]! : bad.length ? bad[Math.floor((x * 997) % bad.length)]! : good[0] ?? "pass";
  return { choice, seed };
}
