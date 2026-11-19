// What the host sets up for Name Place Animal Thing, as plain functions the lobby and the room screen share.
// Category metadata only: nothing here may reach the answer lists (see app/topicDraft/npat/boundary.test.ts).
import { TEAM_MIN_PLAYERS } from "../topicDraft/formats/partytrivia";
import { NPAT_CATEGORIES, setOf, type NpatCategory } from "../topicDraft/npat/categories";
import { DIG_CATEGORIES, HARD_LETTERS } from "../topicDraft/npat/rules";

export const NPAT_CLASSIC_IDS = ["name", "place", "animal", "thing"];
export const NPAT_MIN_CATS = 4;
export const NPAT_MAX_CATS = 6;
/** Prefix on a category id in `pools`: how Custom sends the host's own picks. */
export const NPAT_CAT = "cat:";

export type NpatCustomCheck = { ok: boolean; letters: string[]; reason?: string; warn?: string };

/** Can a Custom pick start? It takes 4 to 6 categories. The letters a round can use are the ones every ticked category
 * has enough answers for (Q, X, Z and Y only with Hard letters on); fewer than the round count only warns, none blocks. */
export function npatCustomCheck(ids: string[], hard: boolean, rounds: number, cats: NpatCategory[] = NPAT_CATEGORIES): NpatCustomCheck {
  const picked = ids.map((id) => cats.find((c) => c.id === id));
  const letters = picked.every(Boolean)
    ? [...new Set(picked.flatMap((c) => [...c!.letters]))].sort().filter((l) => picked.every((c) => c!.letters.includes(l)) && (hard || !HARD_LETTERS.includes(l)))
    : [];
  if (picked.some((c) => !c)) return { ok: false, letters, reason: "One of those categories is not available" };
  if (ids.length < NPAT_MIN_CATS) return { ok: false, letters, reason: `Pick at least ${NPAT_MIN_CATS} categories` };
  if (ids.length > NPAT_MAX_CATS) return { ok: false, letters, reason: `Pick at most ${NPAT_MAX_CATS} categories` };
  if (!letters.length) return { ok: false, letters, reason: "No letter works for all of these. Drop a category" };
  if (letters.length < rounds) return { ok: true, letters, warn: `Only ${letters.length} letter${letters.length === 1 ? "" : "s"} fit these categories, fewer than ${rounds} rounds. Some letters will repeat` };
  return { ok: true, letters };
}

/** A dig takes exactly 5 categories (hard letters never come up), with the same messages as Custom. */
export function npatDigCheck(ids: string[], cats: NpatCategory[] = NPAT_CATEGORIES): NpatCustomCheck {
  const r = npatCustomCheck(ids, false, 1, cats);
  if (ids.some((id) => !cats.some((c) => c.id === id))) return r;
  if (ids.length !== DIG_CATEGORIES) return { ok: false, letters: r.letters, reason: `Pick exactly ${DIG_CATEGORIES} categories` };
  return r;
}

export type NpatStyle = "dig" | "sheet";

/** The style a lobby opens on for a saved NPAT setup. One that never said (from before the dig) digs only if it already has five categories. */
export function npatStyleFor(saved: { opts?: { npatStyle?: unknown }; pools?: string[]; pool?: string } | null | undefined): NpatStyle {
  if (!saved) return "dig";
  if (saved.opts?.npatStyle === "dig" || saved.opts?.npatStyle === "sheet") return saved.opts.npatStyle;
  const pools = saved.pools?.length ? saved.pools : saved.pool ? [saved.pool] : [];
  const merged = new Set(pools.flatMap((p) => (p.startsWith(NPAT_CAT) ? [p.slice(NPAT_CAT.length)] : setOf(p)?.categories ?? [])));
  return merged.size === DIG_CATEGORIES ? "dig" : "sheet";
}

/** The room's one-line summary of an NPAT setup. */
export function npatSummary(o: { pools: string[]; rounds: number; seconds: number; teams: number; players: number; style?: NpatStyle }): string {
  const what = o.pools.some((p) => p.startsWith(NPAT_CAT)) ? "Custom" : setOf(o.pools[0] ?? "classic")?.title ?? "Classic";
  const who = o.teams >= 2 ? (o.players >= TEAM_MIN_PLAYERS ? `${o.teams} teams` : `solo until ${TEAM_MIN_PLAYERS} players`) : "every player for themselves";
  if (o.style === "dig") return `Dig · one letter · ${DIG_CATEGORIES} categories · 20 s each · ${who} · 2+ players`;
  return `${o.rounds} round${o.rounds === 1 ? "" : "s"} · ${o.seconds} s · ${what} · ${who} · 2+ players`;
}
