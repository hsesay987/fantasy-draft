// Daily puzzles: one Summit board, one Hot Air game and one Costimation run per day, the same for everyone.
// The puzzle is built from the stored banks the first time someone asks for it that day and then saved, so it
// never changes mid-day. Results are anonymous; each player's first result counts and feeds the day's stats.
export const DAILY_GAMES = ["summit", "hotair", "costimation"] as const;
export type DailyGame = (typeof DAILY_GAMES)[number];
export const isDailyGame = (g: unknown): g is DailyGame => typeof g === "string" && (DAILY_GAMES as readonly string[]).includes(g);

/** The first daily puzzle. Puzzle numbers count up from here. */
export const LAUNCH_DAY = "2026-10-31";
export const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);
export const dayNumber = (day: string) => Math.floor((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${LAUNCH_DAY}T00:00:00Z`)) / 86_400_000) + 1;

/** Topics the daily trivia rotates through, chosen from the pools with the deepest banks. */
export const DAILY_TOPICS = ["films", "videogames", "football", "history", "shows", "anime", "pokemon", "fictional", "disney", "superheroes"];
/** Summit and Hot Air use different topics on the same day. */
export const topicFor = (game: DailyGame, day: string) => DAILY_TOPICS[(dayNumber(day) + (game === "hotair" ? 3 : 0)) % DAILY_TOPICS.length]!;

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

/** Records a player's first result for the day (later ones are ignored) and returns the day's stats for their score. */
export async function submitResult(store: DailyStore, r: { game: DailyGame; day: string; player: string; score: number; detail?: unknown }) {
  await store.addResult(r);
  const mine = (await store.resultOf(r.game, r.day, r.player)) ?? r.score;
  return { score: mine, stats: statsOf(await store.scores(r.game, r.day), mine) };
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
