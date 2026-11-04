// In-Sync: a co-operative party game. Each round one player privately sees a pair of opposites and a hidden spot on the
// line between them, and types one clue for that spot. Everyone else drags one shared marker and locks when they agree.
// The group scores 4 / 3 / 2 / 0 by how close the marker lands, and the whole table shares one score.
import { next as rand, shuffle } from "../rng";
import type { Pair } from "../party/insyncDecks";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";

export type { Pair };
export const CLUE_MS = 45_000;
export const TUNE_MS = 60_000;
export const REVEAL_MS = 10_000;
const CLUE_MAX = 80;

export type InSyncHistory = { pair: Pair; clue: string; target: number; marker: number; points: number; giver: string; skipped?: boolean };

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
  /** The shared marker, 0-100. Anyone but the giver may move it. */
  marker: number;
  markerBy: string | null;
  /** Guessers who have tapped Lock on the marker where it is now. */
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
    players: o.players, deck: o.deck, pairs, round: 0, giverAt: 0, phase: "clue", target, clue: "", marker: 50, markerBy: null, locks: [],
    score: 0, maxScore: 0, history: [], phaseAt: o.now, done: pairs.length === 0, seed, ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const guessers = (s: InSyncState) => s.players.filter((p) => p !== giver(s));

/** Move to the next round, or finish after the last. */
function advance(s: InSyncState, now: number): InSyncState {
  const round = s.round + 1;
  if (round >= s.pairs.length) return { ...s, done: true, phaseAt: now };
  const [target, seed] = draw(s.seed);
  return { ...s, round, giverAt: s.giverAt + 1, phase: "clue", target, seed, clue: "", marker: 50, markerBy: null, locks: [], phaseAt: now };
}

function drinkCalls(s: InSyncState, points: number): DrinkCall[] {
  if (points === 0) return [{ to: giver(s), sips: 2, reason: "Your clue missed the signal completely" }];
  if (points === 4) return [{ to: "all", sips: 1, reason: "Bullseye! The room toasts" }];
  return [];
}

function reveal(s: InSyncState, now: number): InSyncState {
  const points = bandPoints(s.target, s.marker);
  const h: InSyncHistory = { pair: s.pairs[s.round]!, clue: s.clue, target: s.target, marker: s.marker, points, giver: giver(s) };
  const drinks = s.drinks ? addCalls(s.drinks, drinkCalls(s, points), s.players) : undefined;
  return { ...s, phase: "reveal", score: s.score + points, maxScore: s.maxScore + 4, history: [...s.history, h], ...(drinks ? { drinks } : {}), phaseAt: now };
}

/** The giver never gave a clue: the round scores nothing and nobody drinks. */
function skip(s: InSyncState, now: number): InSyncState {
  const h: InSyncHistory = { pair: s.pairs[s.round]!, clue: "", target: s.target, marker: s.marker, points: 0, giver: giver(s), skipped: true };
  const drinks = s.drinks ? addCalls(s.drinks, [], s.players) : undefined;
  return advance({ ...s, history: [...s.history, h], ...(drinks ? { drinks } : {}) }, now);
}

/** The giver names their spot. One clue, then the table tunes. */
export function clue(s: InSyncState, by: string, text: string, now: number): InSyncState {
  const t = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, CLUE_MAX);
  if (s.done || s.phase !== "clue" || by !== giver(s) || !t) return s;
  return { ...s, clue: t, phase: "tune", marker: 50, markerBy: null, locks: [], phaseAt: now };
}

/** A guesser drags the shared marker. Moving it takes back every lock, so a lock always means this spot. */
export function move(s: InSyncState, by: string, pos: number, _now: number): InSyncState {
  if (s.done || s.phase !== "tune" || !s.players.includes(by) || by === giver(s) || typeof pos !== "number" || !Number.isFinite(pos)) return s;
  const marker = Math.round(Math.max(0, Math.min(100, pos)));
  if (marker === s.marker) return s;
  return { ...s, marker, markerBy: by, locks: [] };
}

/** More than half the guessers locking settles it. At 2 players the one guesser decides. */
export function lock(s: InSyncState, by: string, now: number): InSyncState {
  if (s.done || s.phase !== "tune" || !s.players.includes(by) || by === giver(s) || s.locks.includes(by)) return s;
  const locks = [...s.locks, by];
  const locked = { ...s, locks };
  return locks.length * 2 > guessers(s).length ? reveal(locked, now) : locked;
}

/** Anyone can move on once the reveal has been read. */
export function next(s: InSyncState, now: number): InSyncState {
  return s.done || s.phase !== "reveal" ? s : advance(s, now);
}

/** Clocks: no clue skips the round, a slow tune locks where the marker is, a reveal moves on. */
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
