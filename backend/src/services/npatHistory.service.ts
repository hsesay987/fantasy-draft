import { normAnswer } from "../shared/topicDraft/npat/rules";

// How often players give each NPAT answer, so common answers lose value over time. Counts only change when a finished
// room or daily is recorded, and one player adds at most 1 per answer per day.
// Answers are keyed by the matched list entry's canonical name run through normAnswer, which is what the engine's
// tierOf asks for. Accepted unknown answers arrive with category "review:<category>": they are saved for review but
// never count toward a category's plays, so they never move a tier.

export const REVIEW_PREFIX = "review:";

export type NpatAnswerRow = { category: string; answer: string; count: number };

export interface NpatAnswerDb {
  all(): Promise<NpatAnswerRow[]>;
  /** Adds 1 to a row's count, creating it at 1. */
  increment(category: string, answer: string): Promise<void>;
}

export interface NpatHistoryStore {
  load(): Promise<void>;
  record(day: string, player: string, plays: { category: string; answer: string }[]): Promise<void>;
  /** For setHistorySource: the answer's count and its category's plays, or null if never recorded. */
  lookup(category: string, answer: string): { count: number; plays: number } | null;
}

const isReview = (category: string) => category.startsWith(REVIEW_PREFIX);

export function createNpatHistory(db: NpatAnswerDb): NpatHistoryStore {
  const counts = new Map<string, Map<string, number>>(); // category -> answer -> count
  const plays = new Map<string, number>(); // category -> sum of its counts (real categories only)
  // Kept in memory: it resets when the server restarts, which was accepted.
  const seen = new Map<string, Set<string>>(); // day -> "player|category|answer"

  const bump = (category: string, answer: string, by: number) => {
    const m = counts.get(category) ?? new Map<string, number>();
    m.set(answer, (m.get(answer) ?? 0) + by);
    counts.set(category, m);
    if (!isReview(category)) plays.set(category, (plays.get(category) ?? 0) + by);
  };

  return {
    async load() {
      counts.clear();
      plays.clear();
      for (const r of await db.all()) bump(r.category, r.answer, r.count);
    },
    async record(day, player, played) {
      const today = seen.get(day) ?? new Set<string>();
      seen.set(day, today);
      for (const d of [...seen.keys()].sort().slice(0, -2)) seen.delete(d); // keep only the latest two days
      for (const p of played) {
        const norm = normAnswer(p.answer);
        if (!p.category || !norm) continue;
        // List answers count under their normalised key; review rows keep the typed text, for a person to read.
        const answer = p.category.startsWith("review:") ? String(p.answer).trim().slice(0, 40) : norm;
        const key = `${player}|${p.category}|${norm}`;
        if (today.has(key)) continue;
        today.add(key);
        try {
          await db.increment(p.category, answer);
        } catch (e) {
          today.delete(key);
          throw e;
        }
        bump(p.category, answer, 1);
      }
    },
    lookup(category, answer) {
      const count = counts.get(category)?.get(answer);
      return count === undefined ? null : { count, plays: plays.get(category) ?? 0 };
    },
  };
}

// Loaded on first use so importing this file (and its tests) never needs a database connection.
const prisma = async () => (await import("../lib/prisma")).default;

export const prismaNpatAnswerDb: NpatAnswerDb = {
  async all() {
    return (await prisma()).npatAnswer.findMany({ select: { category: true, answer: true, count: true } });
  },
  async increment(category, answer) {
    await (await prisma()).npatAnswer.upsert({
      where: { category_answer: { category, answer } },
      create: { category, answer, count: 1 },
      update: { count: { increment: 1 } },
    });
  },
};
