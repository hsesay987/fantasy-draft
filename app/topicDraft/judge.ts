import type { Item, Scenario, State } from "./types";
import { scoreTeam } from "./scorer";

export type Verdict = {
  winner: string;
  teams: { player: string; score: number; highlights: string[]; roast: string }[];
  summary: string;
  source: "ai" | "fallback";
};

export function teamsOf(state: State, pool: Item[]) {
  const byId = new Map(pool.map((i) => [i.id, i]));
  return state.config.players.map((player) => ({
    player,
    items: state.picks.filter((p) => p.player === player).map((p) => byId.get(p.itemId)!).filter(Boolean),
  }));
}

/** Offline verdict used when the API is unreachable. */
export function localVerdict(state: State, pool: Item[], scenario: Scenario): Verdict {
  const teams = teamsOf(state, pool).map((t) => {
    const s = scoreTeam(t.items, scenario);
    const best = [...t.items].sort((a, b) => (b.stats.power ?? 0) - (a.stats.power ?? 0))[0];
    return {
      player: t.player,
      score: s.total,
      highlights: best ? [`${best.name} carries the squad`] : ["No picks"],
      roast: s.total >= 70 ? "Annoyingly solid." : "Bold strategy. Bold.",
    };
  });
  const winner = [...teams].sort((a, b) => b.score - a.score)[0]?.player ?? "";
  return { winner, teams, summary: `${winner} built the strongest team for "${scenario.title}".`, source: "fallback" };
}

export async function fetchVerdict(
  apiUrl: string, token: string | null, game: string, state: State, pool: Item[], scenario: Scenario
): Promise<Verdict> {
  try {
    const res = await fetch(`${apiUrl}/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ game, scenario, teams: teamsOf(state, pool) }),
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as Verdict;
  } catch {
    return localVerdict(state, pool, scenario);
  }
}
