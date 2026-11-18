// NPAT's pure helpers for the room screens: grouping a category's answers for the reveal, tier badges, round recaps
// and the phase clock. Data-free on purpose: nothing here may import the answer lists (see npat/boundary.test).
import type { NPAnswer, NPRound, NPView } from "../../topicDraft/formats/npat";
import { normAnswer, REVEAL_MS, TIER_NAMES, TIER_POINTS, VOTE_MS, type Tier } from "../../topicDraft/npat/rules";
import { own } from "../../topicDraft/party/own";

/** How a group of answers ended: scored from the lists, accepted by the table, or not scored and why. */
export type NPGroupKind = "ok" | "accepted" | "pending" | "voted-out" | "wrong-letter" | "blank";
/** One line of a category's reveal: matching answers together. `text` is the entry's name when one matched. */
export type NPGroup = { key: string; text: string; typed: string[]; kind: NPGroupKind; members: string[]; tier: Tier | null; points: number; shared: boolean };

const kindOf = (a: NPAnswer): NPGroupKind =>
  a.status === "ok" ? "ok"
  : a.status === "unknown" ? (a.accepted === true ? "accepted" : a.accepted === false ? "voted-out" : "pending")
  : a.status;

/** Invalid kinds sort after every scoring answer, in this order. */
const LATE: Record<NPGroupKind, number> = { ok: 0, accepted: 0, pending: 1, "voted-out": 2, "wrong-letter": 3, blank: 4 };

/**
 * A category's answers grouped for the reveal: by matched entry (so aliases join their name), else by normalised text,
 * so "The Hulk" and "hulk" sit together. Highest tier first, then the bigger group; invalid answers, then blanks, last.
 */
export function groupAnswers(answers: Record<string, NPAnswer>, players: string[]): NPGroup[] {
  const by = new Map<string, NPGroup>();
  for (const p of players) {
    const a = own(answers, p);
    if (!a) continue;
    const kind = kindOf(a);
    const key = kind === "blank" ? "blank" : a.entry ? `e:${normAnswer(a.entry)}` : `${kind}:${normAnswer(a.text)}`;
    const g = by.get(key);
    if (g) {
      g.members.push(p);
      if (!g.typed.includes(a.text)) g.typed.push(a.text);
      g.shared ||= !!a.shared;
      continue;
    }
    by.set(key, {
      key, kind, members: [p], typed: kind === "blank" ? [] : [a.text],
      text: kind === "blank" ? "—" : a.entry ?? a.text,
      tier: a.tier ?? null, points: a.points ?? 0, shared: !!a.shared,
    });
  }
  const rank = (g: NPGroup) => (g.tier ? TIER_POINTS[g.tier] : 0);
  return [...by.values()].sort((x, y) => LATE[x.kind] - LATE[y.kind] || rank(y) - rank(x) || y.members.length - x.members.length);
}

/** The badge on a scored answer: its tier's name and the points it actually got (halved when shared). */
export function tierBadge(a: Pick<NPAnswer, "tier" | "points" | "status">): { tier: Tier; label: string; points: number } | null {
  if (!a.tier || a.status === "blank" || a.status === "wrong-letter") return null;
  return { tier: a.tier, label: TIER_NAMES[a.tier], points: a.points ?? 0 };
}

/** What an answer that scored nothing shows instead of a badge. */
export const missLabel = (kind: NPGroupKind): string =>
  kind === "wrong-letter" ? "wrong letter" : kind === "voted-out" ? "voted out" : kind === "pending" ? "up for a vote" : kind === "blank" ? "—" : "";

/** Each player's points for one round. */
export function roundTotals(round: NPRound, players: string[]): Record<string, number> {
  return Object.fromEntries(players.map((p) => [p, (own(round.answers, p) ?? []).reduce((n, a) => n + (a.points ?? 0), 0)]));
}

/** The round's top-scoring answer (the first in seat and category order on a tie), or null when nothing scored. */
export function bestAnswer(round: NPRound, players: string[], categories: string[]): { player: string; text: string; category: string; points: number } | null {
  let best: { player: string; text: string; category: string; points: number } | null = null;
  for (const p of players) {
    (own(round.answers, p) ?? []).forEach((a, i) => {
      const pts = a.points ?? 0;
      if (pts > 0 && (!best || pts > best.points)) best = { player: p, text: a.text, category: categories[i] ?? "", points: pts };
    });
  }
  return best;
}

/** 1-based place of `scores[i]` in a list sorted best first; equal scores share a place. */
export const placeOf = (scores: number[], i: number): number => scores.findIndex((n) => n === scores[i]) + 1;

/** The clock that matters now: the round's writing time, then the vote and reveal clocks (the summary runs on the reveal's). */
export function npatClock(s: Pick<NPView, "phase" | "phaseAt" | "roundMs" | "done">): { deadline: number; total: number } | null {
  if (s.done) return null;
  const total = s.phase === "write" ? s.roundMs : s.phase === "vote" ? VOTE_MS : REVEAL_MS;
  return { deadline: s.phaseAt + total, total };
}
