import type { Scenario } from "./types";
import { SCENARIOS } from "./scenarios";
import { catalogMeta } from "./catalogs";

export const HISTORY_MISSIONS: Scenario[] = [
  { id: "dinner-party", title: "Host the Perfect Dinner Party", blurb: "Charm, wit and conversation win the night.", weights: { charisma: 3, intellect: 2.5, influence: 1.5, courage: 0.5, leadership: 1, strategy: 0.5 } },
  { id: "win-a-war", title: "Win a Great War", blurb: "Strategy and command decide empires.", weights: { strategy: 3, leadership: 3, courage: 2, influence: 1, intellect: 1.5, charisma: 1 } },
  { id: "found-a-nation", title: "Found a New Nation", blurb: "Vision, influence and leadership.", weights: { leadership: 3, influence: 3, intellect: 2, charisma: 2, strategy: 1.5, courage: 1 } },
  { id: "survive-apocalypse", title: "Survive the Apocalypse", blurb: "Courage, smarts and keeping people together.", weights: { courage: 3, strategy: 2, leadership: 2, intellect: 2, charisma: 1, influence: 0.5 } },
  { id: "all-around-history", title: "Greatest All-Round Team", blurb: "No mission. Pure greatness.", weights: { leadership: 1, intellect: 1, courage: 1, influence: 1, charisma: 1, strategy: 1 } },
];

/** Missions that suit a character pool's stat keys. */
export function missionsFor(poolId: string): Scenario[] {
  const keys = catalogMeta(poolId)?.statKeys ?? [];
  return keys.includes("leadership") ? HISTORY_MISSIONS : SCENARIOS;
}

export const missionById = (poolId: string, id: string) => missionsFor(poolId).find((m) => m.id === id) ?? missionsFor(poolId)[0]!;

export function customMission(poolId: string, title: string, blurb: string): Scenario {
  const base = missionsFor(poolId).at(-1)!;
  return { id: "custom", title: title.trim() || "Custom mission", blurb: blurb.trim(), weights: base.weights };
}

const METRIC_LABEL: Record<string, string> = {
  power: "Strongest", intellect: "Smartest", speed: "Fastest", durability: "Toughest", combat: "Best fighter", teamwork: "Best teammate",
  leadership: "Best leader", courage: "Bravest", influence: "Most influential", charisma: "Most charming", strategy: "Best strategist",
};

/** Single-stat ranking categories for Blind Rank. */
export function metricsFor(poolId: string): Scenario[] {
  return (catalogMeta(poolId)?.statKeys ?? []).map((k) => ({
    id: `metric-${k}`,
    title: `Rank by: ${METRIC_LABEL[k] ?? k}`,
    blurb: `Who ranks highest for ${k}?`,
    weights: { [k]: 1 },
  }));
}
