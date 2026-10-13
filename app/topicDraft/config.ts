import type { Config, Item, Scenario } from "./types";
import { SCENARIOS } from "./scenarios";

export const ROLES = ["Leader", "Tank", "Brain", "Striker", "Support", "Speedster", "Mystic", "Wildcard", "Backup"];

export type Setup = {
  game: string;
  config: Config;
  aiPlayers: string[];
  scenario: Scenario;
  customItems: Item[];
};

export const DEFAULT_CONFIG: Config = {
  teamSize: 5,
  players: ["You", "Rival AI"],
  order: "snake",
  timerSeconds: 30,
  bans: [],
  roles: [],
  noDupUniverse: false,
  powerCap: null,
  scenario: SCENARIOS[0]!.id,
  filters: { universes: [] },
};

const KEY = "toppic:topic:setup";

export function saveSetup(s: Setup) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}

export function loadSetup(): Setup | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Setup) : null;
  } catch {
    return null;
  }
}

/** Build the custom scenario from free text, with balanced weights. */
export function customScenario(title: string, blurb: string): Scenario {
  const base = SCENARIOS.find((s) => s.id === "all-around")!;
  return { id: "custom", title: title.trim() || "Custom mission", blurb: blurb.trim(), weights: base.weights };
}

export const CUSTOM_POINT_BUDGET = 360;
