// Top Rung: a solo climb of twelve rungs, one four-option question each, harder every three rungs. A wrong answer drops
// you to your last safe ledge; walking away keeps what you have. Three lifelines, once each per climb. Pure rules plus
// the saved run. `rung` is the rung being asked, from 1 (when the climb ends it stays on the rung it ended at).
// Everything random comes from `seed`, so a refresh shows the same climb, the same poll and the same cut.
import { next, shuffle } from "../topicDraft/rng";
import { tierPools, TIERS, type TierQuestion } from "../topicDraft/trivia/tiers";
import type { TriviaCategory } from "../topicDraft/trivia/types";

export const RUNGS = 12;
export const LADDER = [100, 200, 300, 500, 800, 1200, 1800, 2500, 3500, 5000, 7500, 10000];
export const LEDGES = [4, 8];
const PER_TIER = 3;

/** 0-based index into a category's clues: rungs 1-3 are 0, 4-6 are 1, 7-9 are 2, 10-12 are 3. */
export const tierOf = (rung: number): number => Math.max(0, Math.min(TIERS - 1, Math.floor((rung - 1) / PER_TIER)));

export type RungQuestion = TierQuestion;
export type Lifeline = "cut" | "poll" | "swap";
export type RungState = {
  rung: number;
  questions: RungQuestion[];
  /** One per tier: the clue Swap brings in, null once it is used or if the tier had none to spare. */
  spares: (RungQuestion | null)[];
  used: Lifeline[];
  /** Options Cut Two took off the current question. */
  hidden: string[];
  /** Crowd Poll's percentages for the current question. A later Cut Two leaves them as they were: skip hidden options when showing them. */
  poll: Record<string, number> | null;
  picks: string[];
  status: "climbing" | "fell" | "walked" | "top";
  points: number;
  seed: number;
};

const pointsAt = (cleared: number) => (cleared > 0 ? LADDER[cleared - 1]! : 0);
const ledgePoints = (cleared: number) => pointsAt(Math.max(0, ...LEDGES.filter((l) => l <= cleared)));
const asked = (s: RungState) => s.questions[s.rung - 1]!;

export function init(categories: TriviaCategory[], seed: number): RungState {
  const start = Number.isFinite(seed) ? seed | 0 : 0;
  const seen = new Set<string>();
  const usable = tierPools(categories, start).map((pool) => pool.filter((q) => {
    if (seen.has(q.q) || q.options.length !== 4 || new Set(q.options).size !== 4) return false;
    seen.add(q.q);
    return true;
  }));
  const questions = usable.flatMap((pool) => pool.slice(0, PER_TIER));
  // A short climb's rungs no longer match tierOf, so a spare could swap in at the wrong tier: short climbs get none.
  const spares = usable.map((pool) => (questions.length === RUNGS ? (pool[PER_TIER] ?? null) : null));
  return { rung: 1, questions, spares, used: [], hidden: [], poll: null, picks: [], status: questions.length ? "climbing" : "top", points: 0, seed: start };
}

export function answer(s: RungState, choice: string): RungState {
  if (s.status !== "climbing") return s;
  const q = asked(s);
  if (typeof choice !== "string" || !q.options.includes(choice) || s.hidden.includes(choice)) return s;
  const picks = [...s.picks, choice];
  if (choice !== q.answer) return { ...s, picks, status: "fell", points: ledgePoints(s.rung - 1) };
  const points = pointsAt(s.rung);
  if (s.rung >= s.questions.length) return { ...s, picks, points, status: "top", hidden: [], poll: null };
  return { ...s, picks, points, rung: s.rung + 1, hidden: [], poll: null };
}

export function walk(s: RungState): RungState {
  return s.status === "climbing" ? { ...s, status: "walked" } : s;
}

/** A seed for one lifeline on one rung, so its result depends on nothing but the climb and where you are on it. */
const drawSeed = (s: RungState, salt: number) => (s.seed ^ Math.imul(s.rung, 0x9e3779b1) ^ salt) | 0;

export function cutTwo(s: RungState): RungState {
  if (s.status !== "climbing" || s.used.includes("cut")) return s;
  const q = asked(s);
  const [wrong] = shuffle(q.options.filter((o) => o !== q.answer), drawSeed(s, 0x2f6e2b1));
  return { ...s, used: [...s.used, "cut"], hidden: wrong.slice(0, 2) };
}

/** The crowd's lean to the right answer on rung 1 and rung 12, give or take the wobble. */
const LEAN_LOW = 0.72, LEAN_HIGH = 0.3, LEAN_WOBBLE = 0.08;

/** Shares of 100 that add up exactly: round down, then hand the leftovers to the largest remainders. */
function toPercents(weights: [string, number][]): Record<string, number> {
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const raw = weights.map(([o, w]) => ({ o, exact: (w / total) * 100, n: Math.floor((w / total) * 100) }));
  let left = 100 - raw.reduce((n, r) => n + r.n, 0);
  for (const r of [...raw].sort((a, b) => b.exact - b.n - (a.exact - a.n))) if (left-- > 0) r.n++;
  return Object.fromEntries(raw.map((r) => [r.o, r.n]));
}

export function crowdPoll(s: RungState): RungState {
  if (s.status !== "climbing" || s.used.includes("poll")) return s;
  const q = asked(s);
  let seed = drawSeed(s, 0x51ed270);
  const draw = () => { const [r, ns] = next(seed); seed = ns; return r; };
  const lean = LEAN_LOW - (LEAN_LOW - LEAN_HIGH) * ((s.rung - 1) / (RUNGS - 1)) + (draw() - 0.5) * 2 * LEAN_WOBBLE;
  const wrong = q.options.filter((o) => o !== q.answer).map((o) => [o, 0.25 + draw()] as [string, number]);
  const spread = wrong.reduce((n, [, w]) => n + w, 0);
  // The crowd is asked about all four, and only what is still on screen is counted, so a cut sharpens its lean.
  const shares = [[q.answer, lean] as [string, number], ...wrong.map(([o, w]) => [o, ((1 - lean) * w) / spread] as [string, number])];
  return { ...s, used: [...s.used, "poll"], poll: toPercents(shares.filter(([o]) => !s.hidden.includes(o))) };
}

export function swap(s: RungState): RungState {
  if (s.status !== "climbing" || s.used.includes("swap")) return s;
  const tier = tierOf(s.rung);
  const spare = s.spares[tier];
  if (!spare) return s;
  const questions = s.questions.map((q, i) => (i === s.rung - 1 ? spare : q));
  return { ...s, questions, spares: s.spares.map((q, i) => (i === tier ? null : q)), used: [...s.used, "swap"], hidden: [], poll: null };
}

export const scoreFraction = (s: RungState): number => s.points / LADDER[RUNGS - 1]!;

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function isQuestion(v: unknown): v is RungQuestion {
  if (typeof v !== "object" || v === null) return false;
  const { q, options, answer: a } = v as Partial<RungQuestion>;
  return typeof q === "string" && typeof a === "string" && isStrings(options) && options.length === 4 && new Set(options).size === 4 && options.includes(a);
}

/** Only a climb these rules could have produced counts; anything else in storage is treated as no climb at all. */
function isClimb(v: unknown): v is RungState {
  if (typeof v !== "object" || v === null) return false;
  const { rung, questions, spares, used, hidden, poll, picks, status, points, seed } = v as Partial<RungState>;
  if (typeof seed !== "number" || !Number.isInteger(seed) || typeof rung !== "number" || !Number.isInteger(rung)) return false;
  if (!Array.isArray(questions) || questions.length > RUNGS || !questions.every(isQuestion)) return false;
  if (rung < 1 || rung > Math.max(1, questions.length)) return false;
  if (!Array.isArray(spares) || spares.length !== TIERS || !spares.every((q) => q === null || isQuestion(q))) return false;
  if (questions.length < RUNGS && spares.some(Boolean)) return false;
  if (!isStrings(used) || new Set(used).size !== used.length || !used.every((l) => l === "cut" || l === "poll" || l === "swap")) return false;
  if (used.includes("swap") && spares.every(Boolean)) return false;
  if (!isStrings(hidden) || !isStrings(picks)) return false;
  if (status !== "climbing" && status !== "fell" && status !== "walked" && status !== "top") return false;
  const q = questions[rung - 1];

  // Where the climb stands: the picks must be the right answers so far, and the points what those answers earn.
  const cleared = status === "top" ? questions.length : rung - 1;
  if (status === "top" ? rung !== Math.max(1, questions.length) : !q) return false;
  if (picks.length !== (status === "fell" ? cleared + 1 : cleared)) return false;
  if (!questions.slice(0, cleared).every((x, i) => picks[i] === x.answer)) return false;
  if (status === "fell" && (picks[cleared] === q!.answer || !q!.options.includes(picks[cleared]!))) return false;
  if (points !== (status === "fell" ? ledgePoints(cleared) : pointsAt(cleared))) return false;

  // A lifeline's marks only exist if it was used, belong to the current question, and go when the climb tops out.
  if (hidden.length > 0) {
    if (status === "top" || !used.includes("cut") || hidden.length !== 2 || new Set(hidden).size !== 2) return false;
    if (!hidden.every((o) => q!.options.includes(o) && o !== q!.answer)) return false;
  }
  if (poll === null) return true;
  if (typeof poll !== "object" || Array.isArray(poll) || poll === undefined) return false;
  if (status === "top" || !used.includes("poll")) return false;
  const shares = Object.entries(poll);
  if (shares.length < 2 || !shares.every(([o, n]) => q!.options.includes(o) && Number.isInteger(n) && n >= 0)) return false;
  return shares.reduce((sum, [, n]) => sum + n, 0) === 100;
}

export function saveClimb(key: string, s: RungState): void {
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function loadClimb(key: string): RungState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return isClimb(v) ? v : null;
  } catch {
    return null;
  }
}
