// Pecking Order's screen and results arithmetic, kept pure so it can be tested. No data imports: room bundles use it.
import { teamStandings } from "../teamStandings";

/** Side-by-side lanes a ladder sprite may take; the CSS scales the lane width to fit the screen. */
export const PEEP_LANES = 4;

/**
 * Each sprite's lane beside the ladder, from its height on the ladder (percent, or null for no sprite). A sprite takes
 * the first lane no earlier sprite within `near` already holds; when all are held it takes the least crowded one, so
 * the lane never passes PEEP_LANES - 1 however many guesses bunch up.
 */
export function spriteLanes(at: (number | null)[], near: number, lanes = PEEP_LANES): (number | null)[] {
  const out: (number | null)[] = [];
  at.forEach((y, i) => {
    if (y == null) { out.push(null); return; }
    const used = Array.from({ length: lanes }, () => 0);
    for (let j = 0; j < i; j++) {
      const o = at[j], l = out[j];
      if (o != null && l != null && Math.abs(o - y) < near) used[l]!++;
    }
    const free = used.indexOf(0);
    out.push(free >= 0 ? free : used.indexOf(Math.min(...used)));
  });
  return out;
}

export type PeckWin = { kind: "win"; label: string; score: number } | { kind: "tie"; labels: string[] } | { kind: "none" };

/** Who won: the best team when teamed (the server ranks teams then), else the best player. Ties and no points too. */
export function peckWinner(players: string[], points: Record<string, number>, teams: string[][] | null): PeckWin {
  const rows = teams
    ? teamStandings(points, teams).map((t) => ({ label: t.name, score: t.score }))
    : players.map((p, seat) => ({ label: p, score: points[p] ?? 0, seat })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  const top = rows[0]?.score ?? 0;
  if (top <= 0) return { kind: "none" };
  const level = rows.filter((r) => r.score === top);
  return level.length > 1 ? { kind: "tie", labels: level.map((r) => r.label) } : { kind: "win", label: level[0]!.label, score: top };
}
