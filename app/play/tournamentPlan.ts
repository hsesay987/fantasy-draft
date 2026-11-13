// Pure helpers for the tournament screens: building a plan, the leaderboard rows and the champion's title.
import { MIN_PLAYERS as MAFIA_MIN } from "../topicDraft/formats/mafia";
import type { LeaderRow } from "./screenInfo";
import { PARTY_FORMATS, type FormatId } from "./types";

export const PLAN_MIN = 2;
export const PLAN_MAX = 8;
export const SURPRISE_SIZE = 4;
/** Drafts and trivia take up to this many players; party games take 12. */
export const DRAFT_CAP = 6;

/** Fewest seats each game starts with (the server enforces the same numbers). */
// Vowel Play and Vowel Party start at 2 (Head to head needs exactly 2: see duelWrong).
export const seatsNeeded = (format: string) => (format === "mafia" ? MAFIA_MIN : format === "imposter" ? 3 : 2);

/** A game this table can start: enough seats for it, and drafts and trivia only up to six. */
export const fitsTable = (format: FormatId, players: number) =>
  players >= seatsNeeded(format) && (PARTY_FORMATS.has(format) || players <= DRAFT_CAP);

/** Adds a game to the end of the plan (repeats allowed), up to the most a tournament takes. */
export const addToPlan = (plan: FormatId[], format: FormatId): FormatId[] => (plan.length >= PLAN_MAX ? plan : [...plan, format]);

/** Removes the game at `index`. */
export const dropFromPlan = (plan: FormatId[], index: number): FormatId[] => plan.filter((_, i) => i !== index);

export const planReady = (plan: FormatId[]) => plan.length >= PLAN_MIN && plan.length <= PLAN_MAX;

/** `size` random games from `options`: all different while there are enough of them, repeats only once they run out. */
export function surprisePlan(options: FormatId[], rand: () => number = Math.random, size = SURPRISE_SIZE): FormatId[] {
  if (!options.length) return [];
  const out: FormatId[] = [];
  let bag: FormatId[] = [];
  while (out.length < size) {
    if (!bag.length) bag = [...options];
    const i = Math.min(bag.length - 1, Math.floor(rand() * bag.length));
    out.push(bag.splice(i, 1)[0]!);
  }
  return out;
}

export type Standing = { name: string; total: number; last: number; left: boolean; rank: number };

/** Leaderboard rows from the server's standings. Each player keeps the sprite of their seat in the room. */
export const standingRows = (standings: Standing[], seats: string[]): LeaderRow[] =>
  standings.map((s, i) => {
    const seat = seats.indexOf(s.name);
    return { name: s.name, score: s.total, seat: seat >= 0 ? seat : seats.length + i, ...(s.last ? { last: s.last } : {}), ...(s.left ? { left: true } : {}) };
  });

const joinNames = (names: string[]) => (names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** "Ann wins the night", "Ann and Bob share the night", or no winner when nobody scored. */
export function championTitle(standings: Standing[]): string {
  const top = standings.length ? Math.max(...standings.map((s) => s.total)) : 0;
  if (top <= 0) return "Nobody wins the night";
  const best = standings.filter((s) => s.total === top).map((s) => s.name);
  return best.length === 1 ? `${best[0]} wins the night` : `${joinNames(best)} share the night`;
}
