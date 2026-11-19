// The NPAT solo daily's pure helpers: the history overlay the API sends and the result to record and share. Solo pages score in the browser, so they load the lists; room screens never import this.
import type { DigState } from "../topicDraft/formats/npatDig";
import { npatSquare } from "../lib/daily";
import { TIER_POINTS, type Tier } from "../topicDraft/npat/rules";

/** The solo player's seat; the round's answers and points are kept under this name. */
export const SOLO_PLAYER = "You";
/** Five categories, a Unicorn (100) each. */
export const SOLO_MAX = 500;

const isTier = (t: unknown): t is Tier => typeof t === "string" && Object.hasOwn(TIER_POINTS, t);

/**
 * A history source for `setHistorySource` from the API's overlay: `{ category: { entry name (normAnswer): tier } }`, only
 * the entries whose tier history has moved. The engine's `tierOf` turns a count into a tier with `adjustTier`, which can
 * only ever move a tier one way, so an overlaid entry reports a share and play count that are past its threshold, and the
 * engine lands on that same moved tier. Anything missing or malformed reports nothing: the list tier stands.
 */
export function overlaySource(overlay: unknown): (category: string, answer: string) => { count: number; plays: number } | null {
  const o = overlay && typeof overlay === "object" ? (overlay as Record<string, unknown>) : {};
  return (category, answer) => {
    const cat = Object.hasOwn(o, category) ? o[category] : null;
    if (!cat || typeof cat !== "object") return null;
    const t = Object.hasOwn(cat, answer) ? (cat as Record<string, unknown>)[answer] : null;
    return isTier(t) ? { count: 1000, plays: 1000 } : null;
  };
}

/** The finished round as a daily result: points per category, the total, the score (share of 500, capped at 1), the
 * share grid, the running score after each category, and the typed answers for the server to re-check. */
export function soloResult(s: DigState) {
  const mine = s.results[SOLO_PLAYER] ?? [];
  const points = s.categories.map((_, i) => mine[i]?.points ?? 0);
  const total = points.reduce((a, b) => a + b, 0);
  let run = 0;
  return {
    points,
    total,
    score: Math.min(1, total / SOLO_MAX),
    grid: points.map(npatSquare).join(""),
    history: points.map((p) => Math.min(1, (run += p) / SOLO_MAX)),
    answers: s.categories.map((category, i) => ({ category, text: mine[i]?.text ?? "" })),
  };
}
