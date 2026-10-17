import { itemScore } from "./scorer";
import type { JudgeItem, JudgeTeamInput } from "../play/judging";

export type Duel = { a: string; b: string; aItem: string; bItem: string; winner: string | "tie"; aScore: number; bScore: number; label?: string };

/** Pair two lineups: by role label when both have the same roles, otherwise best-vs-best. */
function pairUp(x: JudgeItem[], y: JudgeItem[], w: Record<string, number>): [JudgeItem, JudgeItem, string?][] {
  const sc = (i: JudgeItem) => itemScore({ id: i.name, name: i.name, universe: i.universe, archetype: i.archetype, stats: i.stats, tags: i.tags } as never, w);
  const byRole = x.length > 0 && x.every((i) => i.role) && y.every((i) => i.role) && x.every((i) => y.some((j) => j.role === i.role));
  if (byRole) return x.map((i) => [i, y.find((j) => j.role === i.role)!, i.role] as [JudgeItem, JudgeItem, string?]);
  const xs = [...x].sort((p, q) => sc(q) - sc(p));
  const ys = [...y].sort((p, q) => sc(q) - sc(p));
  return xs.slice(0, Math.min(xs.length, ys.length)).map((i, n) => [i, ys[n]!, undefined] as [JudgeItem, JudgeItem, string?]);
}

/** Head-to-head: every pick duels its counterpart on the mission's weights. */
export function battle(teams: JudgeTeamInput[], weights: Record<string, number>): { teams: JudgeTeamInput[]; duels: Duel[] } {
  const sc = (i: JudgeItem) => itemScore({ id: i.name, name: i.name, universe: i.universe, archetype: i.archetype, stats: i.stats, tags: i.tags } as never, weights);
  const duels: Duel[] = [];
  const wins: Record<string, { w: number; n: number }> = Object.fromEntries(teams.map((t) => [t.player, { w: 0, n: 0 }]));
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const A = teams[i]!;
      const B = teams[j]!;
      for (const [x, y, label] of pairUp(A.items, B.items, weights)) {
        const sa = sc(x);
        const sb = sc(y);
        const tie = Math.abs(sa - sb) < 1;
        const winner = tie ? "tie" : sa > sb ? A.player : B.player;
        duels.push({ a: A.player, b: B.player, aItem: x.name, bItem: y.name, winner, aScore: Math.round(sa), bScore: Math.round(sb), label });
        wins[A.player]!.n++;
        wins[B.player]!.n++;
        if (tie) { wins[A.player]!.w += 0.5; wins[B.player]!.w += 0.5; } else wins[winner]!.w++;
      }
    }
  }
  const out = teams.map((t) => {
    const r = wins[t.player]!;
    const rate = r.n ? r.w / r.n : 0.5;
    const baseline = Math.round((t.baseline * 0.55 + (30 + 70 * rate) * 0.45) * 10) / 10;
    return { ...t, baseline, notes: `${t.notes ? t.notes + " " : ""}Head-to-head: won ${r.w} of ${r.n} duels.` };
  });
  return { teams: out, duels };
}
