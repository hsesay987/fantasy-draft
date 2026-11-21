// In-Sync: a co-operative party game. Each round one player privately sees a pair of opposites and a hidden spot on the
// line between them, and types one clue for that spot. Everyone else tunes their own dial and locks it. The room's signal
// is where those dials average out: it scores 4 / 3 / 2 / 0 by how close it lands, and the whole table shares one score.
import { next as rand, shuffle } from "../rng";
import type { Pair } from "../party/insyncDecks";
import { CLUE_MAX, normalizeClue } from "../party/clueText";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";

export type { Pair };
export const CLUE_MS = 45_000;
export const TUNE_MS = 60_000;
export const REVEAL_MS = 10_000;
export { CLUE_MAX };

/** `marker` is the room's average signal, which scored; `markers` is where each guesser's own dial ended up. */
export type InSyncHistory = { pair: Pair; clue: string; target: number; marker: number; markers: Record<string, number>; points: number; giver: string; skipped?: boolean };

export type InSyncState = {
  players: string[];
  deck: string;
  pairs: Pair[];
  round: number;
  /** Index into `players` of this round's clue giver. */
  giverAt: number;
  phase: "clue" | "tune" | "reveal";
  /** 0-100 position of the hidden spot. Guessers see -1 until the reveal. */
  target: number;
  clue: string;
  /** Each guesser's own dial, 0-100. Only guessers still at the table have one, and only once the clue is in. */
  markers: Record<string, number>;
  /** The room's signal: where the dials average out, 0-100. This is what scores. */
  marker: number;
  /** Guessers who have locked their dial where it is now. */
  locks: string[];
  score: number;
  /** Best possible score over the rounds actually played; a skipped round adds nothing. */
  maxScore: number;
  history: InSyncHistory[];
  phaseAt: number;
  done: boolean;
  seed: number;
  drinks?: DrinkState;
};

export const giver = (s: InSyncState): string => s.players[s.giverAt % s.players.length]!;

/** Points for a marker this far from the target: within 3 is a bullseye (4), 7 close (3), 12 near (2). */
export function bandPoints(target: number, marker: number): 4 | 3 | 2 | 0 {
  const gap = Math.abs(target - marker);
  return gap <= 3 ? 4 : gap <= 7 ? 3 : gap <= 12 ? 2 : 0;
}

/** The room's signal: the rounded average of every dial, or the middle when nobody has one. */
export function average(markers: Record<string, number>): number {
  const v = Object.values(markers);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 50;
}

const RANKS: [number, string][] = [
  [0.9, "Perfectly In-Sync"],
  [0.7, "Locked On"],
  [0.5, "Tuning In"],
  [0.3, "Faint Signal"],
  [0.15, "Static on the Line"],
];
export function rankFor(score: number, maxScore: number): string {
  const ratio = maxScore > 0 ? score / maxScore : 0;
  return RANKS.find(([min]) => ratio >= min)?.[1] ?? "Out of Sync";
}

/** A hidden spot that is never right at the edge, where a clue would be too easy. */
function draw(seed: number): [number, number] {
  const [r, s] = rand(seed);
  return [8 + Math.floor(r * 85), s];
}

export function init(o: { players: string[]; deck: string; pairs: Pair[]; rounds: number; avoid?: string[]; drinking?: boolean; seed: number; now: number }): InSyncState {
  const avoid = new Set(o.avoid ?? []);
  // Unseen pairs first; if there are too few, seen ones fill the rest.
  const [fresh, s1] = shuffle(o.pairs.filter((p) => !avoid.has(p.id)), o.seed);
  const [seen, s2] = shuffle(o.pairs.filter((p) => avoid.has(p.id)), s1);
  const pairs = [...fresh, ...seen].slice(0, Math.max(4, Math.min(15, o.rounds)));
  const [target, seed] = draw(s2);
  return {
    players: o.players, deck: o.deck, pairs, round: 0, giverAt: 0, phase: "clue", target, clue: "", markers: {}, marker: 50, locks: [],
    score: 0, maxScore: 0, history: [], phaseAt: o.now, done: pairs.length === 0, seed, ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const guessers = (s: InSyncState) => s.players.filter((p) => p !== giver(s));

/** Move to the next round, or finish after the last. */
function advance(s: InSyncState, now: number): InSyncState {
  const round = s.round + 1;
  if (round >= s.pairs.length) return { ...s, done: true, phaseAt: now };
  const [target, seed] = draw(s.seed);
  return { ...s, round, giverAt: s.giverAt + 1, phase: "clue", target, seed, clue: "", markers: {}, marker: 50, locks: [], phaseAt: now };
}

function drinkCalls(s: InSyncState, points: number): DrinkCall[] {
  if (points === 0) return [{ to: giver(s), sips: 2, reason: "Your clue missed the signal completely" }];
  if (points === 4) return [{ to: "all", sips: 1, reason: "Bullseye! The room toasts" }];
  return [];
}

function reveal(s: InSyncState, now: number): InSyncState {
  const points = bandPoints(s.target, s.marker);
  const h: InSyncHistory = { pair: s.pairs[s.round]!, clue: s.clue, target: s.target, marker: s.marker, markers: s.markers, points, giver: giver(s) };
  const drinks = s.drinks ? addCalls(s.drinks, drinkCalls(s, points), s.players) : undefined;
  return { ...s, phase: "reveal", score: s.score + points, maxScore: s.maxScore + 4, history: [...s.history, h], ...(drinks ? { drinks } : {}), phaseAt: now };
}

/** The giver never gave a clue: the round scores nothing and nobody drinks. */
function skip(s: InSyncState, now: number): InSyncState {
  const h: InSyncHistory = { pair: s.pairs[s.round]!, clue: "", target: s.target, marker: s.marker, markers: {}, points: 0, giver: giver(s), skipped: true };
  const drinks = s.drinks ? addCalls(s.drinks, [], s.players) : undefined;
  return advance({ ...s, history: [...s.history, h], ...(drinks ? { drinks } : {}) }, now);
}

/** The giver names their spot. One clue, then every guesser tunes a dial of their own, starting in the middle. */
export function clue(s: InSyncState, by: string, text: string, now: number): InSyncState {
  const t = normalizeClue(text);
  if (s.done || s.phase !== "clue" || by !== giver(s) || !t) return s;
  return { ...s, clue: t, phase: "tune", markers: Object.fromEntries(guessers(s).map((p) => [p, 50])), marker: 50, locks: [], phaseAt: now };
}

/** A guesser turns their own dial. Moving it takes back only their own lock, so a lock always means this spot. */
export function move(s: InSyncState, by: string, pos: number, _now: number): InSyncState {
  if (s.done || s.phase !== "tune" || !(by in s.markers) || typeof pos !== "number" || !Number.isFinite(pos)) return s;
  const mine = Math.round(Math.max(0, Math.min(100, pos)));
  if (mine === s.markers[by]) return s;
  const markers = { ...s.markers, [by]: mine };
  return { ...s, markers, marker: average(markers), locks: s.locks.filter((p) => p !== by) };
}

/** Once every guesser has locked their dial, the room's signal is revealed. */
export function lock(s: InSyncState, by: string, now: number): InSyncState {
  if (s.done || s.phase !== "tune" || !(by in s.markers) || s.locks.includes(by)) return s;
  const locks = [...s.locks, by];
  const locked = { ...s, locks };
  return Object.keys(s.markers).every((p) => locks.includes(p)) ? reveal(locked, now) : locked;
}

/**
 * Closes what is waiting on people who left (`gone`): a departed giver's rounds are skipped at once, and a departed
 * guesser's dial and lock leave with them, so the average and the wait are only over those still here.
 */
export function settle(s: InSyncState, gone: string[], now: number): InSyncState {
  let x = s;
  while (!x.done && x.phase === "clue" && gone.includes(giver(x))) x = skip(x, now);
  if (x.done || x.phase !== "tune") return x;
  const left = Object.keys(x.markers).filter((p) => gone.includes(p));
  const y = left.length === 0 ? x : (() => {
    const markers = Object.fromEntries(Object.entries(x.markers).filter(([p]) => !gone.includes(p)));
    return { ...x, markers, marker: average(markers), locks: x.locks.filter((p) => p in markers) };
  })();
  const here = Object.keys(y.markers);
  return here.length === 0 || here.every((p) => y.locks.includes(p)) ? reveal(y, now) : y;
}

/** Ends a reveal early. In a room only the host can (the server checks). */
export function next(s: InSyncState, now: number): InSyncState {
  return s.done || s.phase !== "reveal" ? s : advance(s, now);
}

/** Clocks: no clue skips the round, a slow tune locks every dial where it is, a reveal moves on. */
export function tick(s: InSyncState, now: number): InSyncState {
  if (s.done) return s;
  if (s.phase === "clue" && now - s.phaseAt > CLUE_MS) return skip(s, now);
  if (s.phase === "tune" && now - s.phaseAt > TUNE_MS) return reveal(s, now);
  if (s.phase === "reveal" && now - s.phaseAt > REVEAL_MS) return advance(s, now);
  return s;
}

/** What one seat may see. The hidden spot is only for the giver until the reveal, and the seed could rebuild it. */
export function redactFor(s: InSyncState, me: string | null): InSyncState {
  const open = s.done || s.phase === "reveal" || (me != null && me === giver(s));
  return { ...s, seed: 0, target: open ? s.target : -1 };
}
