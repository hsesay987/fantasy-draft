// What the host sets up for Name Place Animal Thing, as plain functions the lobby and the room screen share.
// Category metadata only: nothing here may reach the answer lists (see app/topicDraft/npat/boundary.test.ts).
import { TEAM_MIN_PLAYERS } from "../topicDraft/formats/partytrivia";
import { NPAT_CATEGORIES, setOf, type NpatCategory } from "../topicDraft/npat/categories";
import { QUESTIONS_POOL } from "../topicDraft/npat/questions";
import { DIG_CATEGORIES, DIG_MAX_CATEGORIES, digCountOk, HARD_LETTERS, QUESTION_DEFAULT_ROUNDS, QUESTION_MAX_ROUNDS, QUESTION_MIN_ROUNDS } from "../topicDraft/npat/rules";

export const NPAT_CLASSIC_IDS = ["name", "place", "animal", "thing"];
export const NPAT_MIN_CATS = 4;
export const NPAT_MAX_CATS = 6;
/** Prefix on a category id in `pools`: how Custom sends the host's own picks. */
export const NPAT_CAT = "cat:";

export type NpatCustomCheck = { ok: boolean; letters: string[]; reason?: string; warn?: string };

/** Can a Custom pick start? It takes 4 to 6 categories. The letters a round can use are the ones every ticked category
 * has enough answers for (Q, X, Z and Y only with Hard letters on); fewer than the round count only warns, none blocks. */
export function npatCustomCheck(ids: string[], hard: boolean, rounds: number, cats: NpatCategory[] = NPAT_CATEGORIES, min = NPAT_MIN_CATS, max = NPAT_MAX_CATS): NpatCustomCheck {
  const picked = ids.map((id) => cats.find((c) => c.id === id));
  const letters = picked.every(Boolean)
    ? [...new Set(picked.flatMap((c) => [...c!.letters]))].sort().filter((l) => picked.every((c) => c!.letters.includes(l)) && (hard || !HARD_LETTERS.includes(l)))
    : [];
  if (picked.some((c) => !c)) return { ok: false, letters, reason: "One of those categories is not available" };
  if (ids.length < min) return { ok: false, letters, reason: `Pick at least ${min} categories` };
  if (ids.length > max) return { ok: false, letters, reason: `Pick at most ${max} categories` };
  if (!letters.length) return { ok: false, letters, reason: "No letter works for all of these. Drop a category" };
  if (letters.length < rounds) return { ok: true, letters, warn: `Only ${letters.length} letter${letters.length === 1 ? "" : "s"} fit these categories, fewer than ${rounds} rounds. Some letters will repeat` };
  return { ok: true, letters };
}

/** A dig takes 5 to 10 categories (hard letters never come up), with the same messages as Custom. */
export function npatDigCheck(ids: string[], cats: NpatCategory[] = NPAT_CATEGORIES): NpatCustomCheck {
  return npatCustomCheck(ids, false, 1, cats, DIG_CATEGORIES, DIG_MAX_CATEGORIES);
}

export type NpatStyle = "dig" | "sheet" | "question";

/**
 * The style a lobby opens on for a saved NPAT setup. A tournament slot (pools only) of Questions opens on question style.
 * One that never said (from before the dig) digs only if it already has 5 to 10 categories.
 */
export function npatStyleFor(saved: { opts?: { npatStyle?: unknown }; pools?: string[]; pool?: string } | null | undefined): NpatStyle {
  if (!saved) return "dig";
  const style = saved.opts?.npatStyle;
  if (style === "dig" || style === "sheet" || style === "question") return style;
  const pools = saved.pools?.length ? saved.pools : saved.pool ? [saved.pool] : [];
  if (pools.includes(QUESTIONS_POOL)) return "question";
  const merged = new Set(pools.flatMap((p) => (p.startsWith(NPAT_CAT) ? [p.slice(NPAT_CAT.length)] : setOf(p)?.categories ?? [])));
  return digCountOk(merged.size) ? "dig" : "sheet";
}

const whoPlays = (o: { teams: number; players: number }) =>
  o.teams >= 2 ? (o.players >= TEAM_MIN_PLAYERS ? `${o.teams} teams` : `solo until ${TEAM_MIN_PLAYERS} players`) : "every player for themselves";

/** The room's one-line summary of an NPAT setup. */
export function npatSummary(o: { pools: string[]; rounds: number; seconds: number; teams: number; players: number; style?: NpatStyle }): string {
  if (o.style === "question") {
    const n = Math.min(QUESTION_MAX_ROUNDS, Math.max(QUESTION_MIN_ROUNDS, Math.floor(Number.isFinite(o.rounds) ? o.rounds : QUESTION_DEFAULT_ROUNDS)));
    return `Questions · ${n} rounds · a new letter each · 20 s each · ${whoPlays(o)} · 2+ players`;
  }
  const what = o.pools.some((p) => p.startsWith(NPAT_CAT)) ? "Custom" : setOf(o.pools[0] ?? "classic")?.title ?? "Classic";
  const who = whoPlays(o);
  if (o.style === "dig") {
    const n = new Set(o.pools.flatMap((p) => (p.startsWith(NPAT_CAT) ? [p.slice(NPAT_CAT.length)] : setOf(p)?.categories ?? []))).size;
    return `Dig · one letter · ${digCountOk(n) ? n : DIG_CATEGORIES} categories · 20 s each · ${who} · 2+ players`;
  }
  return `${o.rounds} round${o.rounds === 1 ? "" : "s"} · ${o.seconds} s · ${what} · ${who} · 2+ players`;
}

/** The sets the sheet opens on: the given pools without question style's pool, or Classic when that leaves none. */
export function npatSheetPools(pools: string[]): string[] {
  const sets = pools.filter((p) => p !== QUESTIONS_POOL);
  return sets.length ? sets : ["classic"];
}

/** Question style's rounds for a saved setup: its own when it was a question game, else the default. */
export function npatQuestionRounds(saved: { opts?: { npatStyle?: unknown; npatRounds?: unknown } } | null | undefined): number {
  const n = Number(saved?.opts?.npatRounds);
  if (saved?.opts?.npatStyle !== "question" || !Number.isFinite(n)) return QUESTION_DEFAULT_ROUNDS;
  return Math.min(QUESTION_MAX_ROUNDS, Math.max(QUESTION_MIN_ROUNDS, Math.floor(n)));
}
