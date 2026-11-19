import { DAILY_COUNT, makeQuestions } from "../shared/topicDraft/formats/pecking";
import { PECKING_LISTS } from "../shared/topicDraft/pecking/lists";
import "../shared/topicDraft/npat/lists"; // loads the answer lists the NPAT daily is picked and checked against
import { NPAT_CATEGORIES } from "../shared/topicDraft/npat/categories";
import { aiTier, ANSWER_MAX, DIG_CATEGORIES, adjustTier, normAnswer, startsWith, TIER_POINTS, type Tier } from "../shared/topicDraft/npat/rules";
import { entriesOf, lettersAvailable, lookup } from "../shared/topicDraft/npat/source";
import { shuffle } from "../shared/topicDraft/rng";
import type { NpatHistoryStore } from "./npatHistory.service";

// Daily puzzles: one Summit board, one Hot Air game, one Costimation run, one Top Rung climb, one Pecking Order round and
// one NPAT letter per day, the same for everyone.
// The puzzle is built from the stored banks the first time someone asks for it that day and then saved, so it
// never changes mid-day. Results are anonymous; each player's first result counts and feeds the day's stats.
export const DAILY_GAMES = ["summit", "hotair", "costimation", "toprung", "pecking", "npat"] as const;
export type DailyGame = (typeof DAILY_GAMES)[number];
export const isDailyGame = (g: unknown): g is DailyGame => typeof g === "string" && (DAILY_GAMES as readonly string[]).includes(g);

/** The first daily puzzle. Puzzle numbers count up from here. */
export const LAUNCH_DAY = "2026-10-31";
export const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);
export const dayNumber = (day: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${LAUNCH_DAY}T00:00:00Z`)) / 86_400_000) + 1;

/** Topics the daily trivia rotates through, chosen from the pools with the deepest banks. */
export const DAILY_TOPICS = ["films", "videogames", "football", "history", "shows", "anime", "pokemon", "fictional", "disney", "superheroes"];
/** Summit, Hot Air and Top Rung use different topics on the same day. */
const TOPIC_OFFSET: Partial<Record<DailyGame, number>> = { hotair: 3, toprung: 6 };
export const topicFor = (game: DailyGame, day: string) => DAILY_TOPICS[(dayNumber(day) + (TOPIC_OFFSET[game] ?? 0)) % DAILY_TOPICS.length]!;

/** Pecking Order's daily: five questions across the lists, alternating rank and name, seeded by the day. */
export const peckingPuzzle = (day: string) => ({ questions: makeQuestions(PECKING_LISTS, "mixed", DAILY_COUNT, dayNumber(day)) });

export type NpatPuzzle = { letter: string; categories: string[] };
export type NpatOverlay = Record<string, Record<string, Tier>>;

/**
 * NPAT's daily: five categories from a shuffle of them all seeded by the day, and a letter (hard ones off) that each of
 * the five can answer, as rooms require. If no letter fits a four, the next four in the shuffle, then a reshuffle.
 */
export function npatPuzzle(day: string): NpatPuzzle {
  const ids = NPAT_CATEGORIES.map((c) => c.id);
  for (let k = 0; k < 100; k++) {
    const [order, seed] = shuffle(ids, dayNumber(day) + k);
    for (let i = 0; i + DIG_CATEGORIES <= order.length; i += DIG_CATEGORIES) {
      const categories = order.slice(i, i + DIG_CATEGORIES);
      const letters = lettersAvailable(categories, false);
      if (letters.length) return { letter: shuffle(letters, seed)[0][0]!, categories };
    }
  }
  throw new Error("NPAT daily: no five categories share a letter");
}

/**
 * The tiers history has moved, for the day's categories and letter only: entry name (normAnswer) to its adjusted tier,
 * just where that differs from the list's. `count` is the store's lookup; a failing one leaves the list tiers.
 */
export function npatOverlay(p: NpatPuzzle, count: (category: string, answer: string) => { count: number; plays: number } | null): NpatOverlay {
  const out: NpatOverlay = {};
  for (const c of p.categories) {
    const moved: Record<string, Tier> = {};
    for (const e of entriesOf(c)) {
      if (!startsWith(p.letter, e.name, e.also)) continue;
      const key = normAnswer(e.name);
      let h: { count: number; plays: number } | null = null;
      try { h = count(c, key); } catch { h = null; }
      if (!h || h.plays <= 0) continue;
      const t = adjustTier(e.tier, h.count / h.plays, h.plays);
      if (t !== e.tier) moved[key] = t;
    }
    out[c] = moved;
  }
  return out;
}

/**
 * A daily player's answers, re-checked here (the browser's statuses are never trusted), as history rows: a list answer
 * by its entry's name, an unknown that starts with the letter as a `review:<category>` row; wrong letters and blanks are
 * dropped. Null when the input is bad: not a list, more than 5, text that isn't a string of at most 40 characters, or a
 * category that isn't one of the day's (or comes twice).
 */
export function npatPlays(p: NpatPuzzle, answers: unknown): { category: string; answer: string }[] | null {
  if (!Array.isArray(answers) || answers.length > DIG_CATEGORIES) return null;
  const seen = new Set<string>();
  const out: { category: string; answer: string }[] = [];
  for (const a of answers) {
    const category = (a as { category?: unknown })?.category;
    const raw = (a as { text?: unknown })?.text;
    if (typeof category !== "string" || !p.categories.includes(category) || seen.has(category)) return null;
    if (typeof raw !== "string" || raw.length > ANSWER_MAX) return null;
    seen.add(category);
    const text = raw.trim();
    if (!normAnswer(text) || !startsWith(p.letter, text)) continue;
    const e = lookup(category, text);
    out.push(e ? { category, answer: e.name } : { category: `review:${category}`, answer: text });
  }
  return out;
}

/** Five categories, a Unicorn (100) each. */
export const NPAT_MAX = DIG_CATEGORIES * 100;

export type StoredVerdict = { ok: boolean; niche: number } | null;

/**
 * The server's own score for a daily play, from the typed answers alone: a list answer by its tier (the history
 * overlay's if it moved), an unknown that starts with the letter by its stored AI verdict, or, with none stored (or
 * the lookup failing), the fallback: common. Wrong letters and blanks score 0. A client can never claim more than
 * what the lists and the verdict cache back. `points` follows the puzzle's category order.
 */
export async function npatRescore(
  p: NpatPuzzle,
  answers: { category: string; text: string }[],
  verdictOf: (category: string, letter: string, text: string) => Promise<StoredVerdict>,
  overlay: NpatOverlay = {}
) {
  const points = await Promise.all(p.categories.map(async (category) => {
    const a = answers.find((x) => x.category === category);
    const text = a?.text.trim() ?? "";
    if (!normAnswer(text) || !startsWith(p.letter, text)) return 0;
    const e = lookup(category, text);
    if (e) return TIER_POINTS[overlay[category]?.[normAnswer(e.name)] ?? e.tier];
    let v: StoredVerdict = null;
    try { v = await verdictOf(category, p.letter, text); } catch { v = null; }
    return v ? (v.ok ? TIER_POINTS[aiTier(v.niche)] : 0) : TIER_POINTS.common;
  }));
  const total = points.reduce((x, y) => x + y, 0);
  return { points, total, score: Math.min(1, total / NPAT_MAX) };
}

/** How many daily plays one IP may add to the NPAT answer counts per UTC day. */
export const NPAT_DAILY_RECORDS_PER_IP = 3;

/**
 * Per-IP, per-day budget for NPAT daily history writes. The daily's player id is whatever the browser sends, so without
 * this one IP could post ~30 fresh ids and move any answer's tier (rooms share the counts) or flood the review queue.
 * Past the cap the result still counts for stats; only the history write is skipped. In memory, like the rate limiter:
 * it resets on restart, and only the latest two days are kept.
 */
export function createNpatDailyCap(max = NPAT_DAILY_RECORDS_PER_IP) {
  const byDay = new Map<string, Map<string, number>>(); // day -> ip -> recordings
  return {
    allow(ip: string, day: string): boolean {
      const today = byDay.get(day) ?? new Map<string, number>();
      byDay.set(day, today);
      for (const d of [...byDay.keys()].sort().slice(0, -2)) byDay.delete(d);
      const n = today.get(ip) ?? 0;
      if (n >= max) return false;
      today.set(ip, n + 1);
      return true;
    },
    days: () => [...byDay.keys()].sort(),
  };
}

/** Adds a daily play to the NPAT answer counts. A missing or failing store is logged and never fails the result. */
export async function recordNpatDaily(store: NpatHistoryStore | null, day: string, player: string, plays: { category: string; answer: string }[]) {
  if (!store || !plays.length) return;
  try {
    await store.record(day, player, plays);
  } catch (e) {
    console.error("NPAT daily history record failed", e);
  }
}

export type Stats = { players: number; average: number; percentile: number | null; buckets: number[]; best: number };

/** Ten buckets of 10% each; `percentile` is the share of players who scored lower than `score`. */
export function statsOf(scores: number[], score?: number): Stats {
  const buckets = new Array(10).fill(0);
  for (const s of scores) buckets[Math.min(9, Math.floor(Math.max(0, s) * 10))]++;
  const n = scores.length;
  const average = n ? Math.round((scores.reduce((a, b) => a + b, 0) / n) * 1000) / 1000 : 0;
  const percentile = score == null || !n ? null : Math.round((scores.filter((s) => s < score).length / n) * 100);
  return { players: n, average, percentile, buckets, best: n ? Math.max(...scores) : 0 };
}

export interface DailyStore {
  puzzle(game: DailyGame, day: string): Promise<unknown | null>;
  savePuzzle(game: DailyGame, day: string, content: unknown): Promise<unknown>;
  addResult(r: { game: DailyGame; day: string; player: string; score: number; detail?: unknown }): Promise<boolean>;
  scores(game: DailyGame, day: string): Promise<number[]>;
  resultOf(game: DailyGame, day: string, player: string): Promise<number | null>;
}

/** Today's puzzle, building and saving it the first time. `build` makes a fresh one from the banks. */
export async function puzzleFor(store: DailyStore, game: DailyGame, day: string, build: () => Promise<unknown>) {
  const saved = await store.puzzle(game, day);
  if (saved) return saved;
  return store.savePuzzle(game, day, await build());
}

/** Records a player's first result for the day (later ones are ignored) and returns the day's stats for their score.
 * `added` is whether this was that first result. */
export async function submitResult(store: DailyStore, r: { game: DailyGame; day: string; player: string; score: number; detail?: unknown }) {
  const added = await store.addResult(r);
  const mine = (await store.resultOf(r.game, r.day, r.player)) ?? r.score;
  return { score: mine, stats: statsOf(await store.scores(r.game, r.day), mine), added };
}

// Loaded on first use so importing this file (and its tests) never needs a database connection.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const db = () => require("../lib/prisma").default as typeof import("../lib/prisma").default;

export const prismaDailyStore: DailyStore = {
  async puzzle(game, day) {
    return (await db().dailyPuzzle.findUnique({ where: { game_day: { game, day } } }))?.content ?? null;
  },
  async savePuzzle(game, day, content) {
    try {
      return (await db().dailyPuzzle.create({ data: { game, day, content: content as any } })).content;
    } catch {
      // Someone else saved it a moment earlier: everyone gets theirs.
      return (await db().dailyPuzzle.findUnique({ where: { game_day: { game, day } } }))!.content;
    }
  },
  async addResult(r) {
    try {
      await db().dailyResult.create({ data: { game: r.game, day: r.day, player: r.player, score: r.score, detail: (r.detail ?? undefined) as any } });
      return true;
    } catch {
      return false; // already played today
    }
  },
  async scores(game, day) {
    return (await db().dailyResult.findMany({ where: { game, day }, select: { score: true } })).map((x) => x.score);
  },
  async resultOf(game, day, player) {
    return (await db().dailyResult.findUnique({ where: { game_day_player: { game, day, player } } }))?.score ?? null;
  },
};
