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

/** One game in the lineup and the topics the host picked for it (`null`: picked when that game is set up). */
export type PlanSlot = { format: FormatId; pools: string[] | null };

/** Adds a game to the end of the plan (repeats allowed), up to the most a tournament takes. */
export const addToPlan = <T>(plan: T[], game: T): T[] => (plan.length >= PLAN_MAX ? plan : [...plan, game]);

/** Removes the game at `index`. */
export const dropFromPlan = <T>(plan: T[], index: number): T[] => plan.filter((_, i) => i !== index);

/** Moves the game at `index` one place up (-1) or down (1); at either end nothing moves. */
export function moveInPlan<T>(plan: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (index < 0 || index >= plan.length || to < 0 || to >= plan.length) return plan;
  const out = [...plan];
  [out[index], out[to]] = [out[to]!, out[index]!];
  return out;
}

/** Sets the topics of the slot at `index`. */
export const setSlotPools = (plan: PlanSlot[], index: number, pools: string[] | null): PlanSlot[] => plan.map((s, i) => (i === index ? { ...s, pools } : s));

export const planReady = (plan: unknown[]) => plan.length >= PLAN_MIN && plan.length <= PLAN_MAX;

/** What the server takes: a slot with topics as `{ format, pools }`, one without as the bare format. */
export const planEntries = (plan: PlanSlot[]): (FormatId | { format: FormatId; pools: string[] })[] => plan.map((s) => (s.pools?.length ? { format: s.format, pools: s.pools } : s.format));

/** A tournament's plan back as slots (a server from before topics sends none). */
export const slotsOf = (t: { plan: FormatId[]; topics?: (string[] | null)[] }): PlanSlot[] => t.plan.map((format, i) => ({ format, pools: t.topics?.[i] ?? null }));

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

/** A surprise lineup: `surprisePlan`'s games, each with one random topic where the game has topics. */
export function surpriseLineup(options: FormatId[], topicsOf: (f: FormatId) => string[], rand: () => number = Math.random): PlanSlot[] {
  return surprisePlan(options, rand).map((format) => {
    const ids = topicsOf(format);
    return { format, pools: ids.length ? [ids[Math.min(ids.length - 1, Math.floor(rand() * ids.length))]!] : null };
  });
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

/**
 * What a finished game's results screen offers. Only the host moves the room on: back to the lobby always, and a
 * rematch of the same game unless a running tournament has a different game planned next.
 */
export function resultsActions(isHost: boolean, format: FormatId, t?: { plan: FormatId[]; index: number; done: boolean }): { lobby: boolean; rematch: boolean } {
  if (!isHost) return { lobby: false, rematch: false };
  return { lobby: true, rematch: !(t && !t.done && t.plan[t.index] !== format) };
}
