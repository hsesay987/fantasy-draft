// Vowel Play: a topic's names with the vowels taken out. Players name each one from the letters left.
// This file is pure: the server runs it for rooms and the browser runs it for solo.
// "first": the first correct guess takes the word. "all": everyone races the same word, faster is worth more.
import { shuffle } from "../rng";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { matches, toPuzzle } from "../party/vowelText";
import { wordsFor } from "../party/vowelWords";

export const GUESS_MS = 20_000, SPEAK_MS = 5_000, JUDGE_MS = 6_000, REVEAL_MS = 3_000, REVEAL_ALL_MS = 5_000, DUEL_WORDS = 30, DUEL_LEAD = 5;

export type VPMode = "first" | "duel" | "all";
export type VPAnswer = "voice" | "type";
/** `also` holds the other names in the topic with the same puzzle. */
export type VPWord = { name: string; puzzle: string; also: string[] };
export type VPHistory = { name: string; puzzle: string; winner: string | null; wrongBuzz?: string; gotMs: Record<string, number> };

export type VPState = {
  players: string[];
  topic: string;
  mode: VPMode;
  answer: VPAnswer;
  words: VPWord[];
  total: number;
  round: number;
  phase: "guess" | "speak" | "judge" | "reveal";
  points: Record<string, number>;
  /** Head to head: positive is towards players[0]. */
  rope: number;
  buzzer: string | null;
  marks: Record<string, "right" | "wrong">;
  /** Milliseconds from the start of this word to each player's right answer. */
  gotMs: Record<string, number>;
  gaveUp: string[];
  history: VPHistory[];
  phaseAt: number;
  startedAt: number;
  done: boolean;
  forfeit: string | null;
  seed: number;
  drinks?: DrinkState;
};

const has = <T>(r: Record<string, T>, k: string): boolean => Object.hasOwn(r, k);

/** 100 for the first 2 seconds, falling evenly to 10 at 20 seconds. */
export function speedPoints(ms: number): number {
  if (!(ms > 2000)) return 100;
  if (ms >= GUESS_MS) return 10;
  return Math.round(100 - (90 * (ms - 2000)) / (GUESS_MS - 2000));
}

export function init(o: { players: string[]; topic: string; mode: VPMode; answer: VPAnswer; count: number; avoid?: string[]; drinking?: boolean; seed: number; now: number }): VPState {
  const names = [...new Set(wordsFor(o.topic))];
  const avoid = new Set(o.avoid ?? []);
  // Unseen names first; if there are too few, seen ones fill the rest.
  const [fresh, s1] = shuffle(names.filter((n) => !avoid.has(n)), o.seed);
  const [seen, seed] = shuffle(names.filter((n) => avoid.has(n)), s1);
  const want = o.mode === "duel" ? DUEL_WORDS : o.count;
  const byPuzzle = new Map<string, string[]>();
  for (const n of names) byPuzzle.set(toPuzzle(n), [...(byPuzzle.get(toPuzzle(n)) ?? []), n]);
  const words: VPWord[] = [...fresh, ...seen].slice(0, Math.max(0, want)).map((name) => {
    const puzzle = toPuzzle(name);
    return { name, puzzle, also: byPuzzle.get(puzzle)!.filter((n) => n !== name) };
  });
  return {
    players: o.players, topic: o.topic, mode: o.mode, answer: o.answer, words, total: words.length, round: 0, phase: "guess",
    points: Object.fromEntries(o.players.map((p) => [p, 0])), rope: 0, buzzer: null, marks: {}, gotMs: {}, gaveUp: [],
    history: [], phaseAt: o.now, startedAt: o.now, done: words.length === 0, forfeit: null, seed,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const revealMs = (s: VPState) => (s.mode === "all" && s.players.length > 1 ? REVEAL_ALL_MS : REVEAL_MS);

function drinkCalls(s: VPState): DrinkCall[] {
  const calls: DrinkCall[] = [];
  const got = Object.entries(s.gotMs);
  if (got.length >= 2) {
    const slowest = got.reduce((a, b) => (b[1] > a[1] ? b : a));
    calls.push({ to: slowest[0], sips: 1, reason: "Slowest to crack it" });
  }
  for (const p of s.players) if (!has(s.gotMs, p)) calls.push({ to: p, sips: 1, reason: "Missed the word" });
  return calls;
}

/** Closes the word: records it, hands out drinks (everyone-competes only) and starts the reveal. */
function finish(s: VPState, now: number): VPState {
  const w = s.words[s.round]!;
  const got = Object.entries(s.gotMs);
  const winner = got.length ? got.reduce((a, b) => (b[1] < a[1] ? b : a))[0] : null;
  const h: VPHistory = { name: w.name, puzzle: w.puzzle, winner, gotMs: s.gotMs };
  const drinks = s.drinks && s.mode === "all" ? addCalls(s.drinks, drinkCalls(s), s.players) : s.drinks;
  return { ...s, phase: "reveal", history: [...s.history, h], ...(drinks ? { drinks } : {}), phaseAt: now };
}

function advance(s: VPState, now: number): VPState {
  const round = s.round + 1;
  if (round >= s.total) return { ...s, done: true, phaseAt: now };
  return { ...s, round, phase: "guess", buzzer: null, marks: {}, gotMs: {}, gaveUp: [], phaseAt: now };
}

const allIn = (s: VPState) => s.players.every((p) => has(s.gotMs, p) || s.gaveUp.includes(p));

/** A typed guess. A wrong one returns the same object so a room sends nothing. */
export function guess(s: VPState, by: string, text: string, now: number): VPState {
  if (s.done || s.phase !== "guess" || s.mode === "duel" || !s.players.includes(by) || has(s.gotMs, by) || s.gaveUp.includes(by)) return s;
  const ms = Math.max(0, now - s.phaseAt);
  if (ms > GUESS_MS) return s;
  const w = s.words[s.round]!;
  if (typeof text !== "string" || ![w.name, ...w.also].some((n) => matches(text, n))) return s;
  const gotMs = { ...s.gotMs, [by]: ms };
  if (s.mode === "first") return finish({ ...s, gotMs, points: { ...s.points, [by]: (s.points[by] ?? 0) + 1 } }, now);
  const next = { ...s, gotMs, points: { ...s.points, [by]: (s.points[by] ?? 0) + speedPoints(ms) } };
  return allIn(next) ? finish(next, now) : next;
}

/** Everyone-competes only: stop trying this word. */
export function giveUp(s: VPState, by: string, now: number): VPState {
  if (s.done || s.mode !== "all" || s.phase !== "guess" || !s.players.includes(by) || has(s.gotMs, by) || s.gaveUp.includes(by)) return s;
  const next = { ...s, gaveUp: [...s.gaveUp, by] };
  return allIn(next) ? finish(next, now) : next;
}

/** Clocks: a word runs out, a reveal moves on. */
export function tick(s: VPState, now: number): VPState {
  if (s.done) return s;
  if (s.phase === "guess" && now - s.phaseAt >= GUESS_MS) return finish(s, now);
  if (s.phase === "reveal" && now - s.phaseAt >= revealMs(s)) return advance(s, now);
  return s;
}

/** Most points; ties share. */
export function winners(s: VPState): string[] {
  const score = (p: string) => (has(s.points, p) ? s.points[p]! : 0);
  const top = Math.max(0, ...s.players.map(score));
  return s.players.filter((p) => score(p) === top);
}

/** What any seat may see. The current name stays secret until it is finished; later words never leave the server. */
export function redactFor(s: VPState, _me: string | null): VPState {
  if (s.done) return { ...s, seed: 0 };
  const words = s.words.slice(0, s.round + 1).map((w, i) => (i === s.round && s.phase !== "reveal" ? { ...w, name: "", also: [] } : w));
  return { ...s, words, seed: 0 };
}
