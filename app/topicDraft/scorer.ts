import type { Item, Scenario } from "./types";

const clamp = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));

export function itemScore(item: Item, weights: Record<string, number>): number {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(weights)) {
    num += clamp(item.stats[k] ?? 0) * w;
    den += w;
  }
  return den ? num / den : 0;
}

export type TeamScore = {
  total: number;
  breakdown: Record<string, number>;
  synergy: number;
};

export function scoreTeam(items: Item[], scenario: Scenario): TeamScore {
  if (!items.length) return { total: 0, breakdown: {}, synergy: 0 };

  const base = items.reduce((a, i) => a + itemScore(i, scenario.weights), 0) / items.length;

  const breakdown: Record<string, number> = {};
  for (const k of Object.keys(scenario.weights)) {
    breakdown[k] = Math.round(items.reduce((a, i) => a + clamp(i.stats[k] ?? 0), 0) / items.length);
  }

  // Synergy: up to +6 for archetype variety, up to +6 for covering wanted tags.
  const archetypes = new Set(items.map((i) => i.archetype)).size;
  const variety = Math.min(6, (archetypes / Math.max(items.length, 1)) * 6);
  const wanted = scenario.wantTags ?? [];
  const have = new Set(items.flatMap((i) => i.tags));
  const coverage = wanted.length ? (wanted.filter((t) => have.has(t)).length / wanted.length) * 6 : 3;
  const synergy = Math.round((variety + coverage) * 10) / 10;

  return {
    total: Math.round(Math.min(100, base * 0.88 + synergy) * 10) / 10,
    breakdown,
    synergy,
  };
}
