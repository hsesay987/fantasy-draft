import type { Config, Item, Scenario } from "../topicDraft/types";
import type { LoadoutMission } from "../topicDraft/formats/loadout";
import type { Role } from "../topicDraft/formats/position";
import type { QuizData } from "../topicDraft/trivia/types";

export type FormatId = "snake" | "spin" | "auction" | "loadout" | "position" | "blind" | "keep" | "feud" | "jeopardy";

export type Opts = {
  teamSize: number;
  order: "snake" | "linear";
  timerSeconds: number | null;
  useRoles: boolean;
  noDupUniverse: boolean;
  powerCap: number | null;
  bans: string[];
  universes: string[];
  customItems: Item[];
  // random roll (Spin Draft always rolls; Classic and Loadout can opt in)
  roll: boolean;
  options: number;
  rerolls: number;
  // quiz formats: question texts seen recently on this device, so new games prefer fresh ones
  avoid: string[];
  // judging: also duel every pick against the other team under the mission
  battle: boolean;
  // auction
  budget: number;
  lotSeconds: number;
  /** Blind lots: bid on a few clues about the item and find out who it is when it sells. */
  blind: boolean;
  clues: number;
  // position
  handExtra: number;
  // blind
  rankSize: number;
};

export type GameSetup = {
  id: string;
  format: FormatId;
  pool: string;
  players: string[];
  aiPlayers: string[];
  mission: Scenario;
  mystery: boolean;
  loadout: LoadoutMission | null;
  roles: Role[];
  opts: Opts;
  /** Jeopardy and Family Feud: the questions for this game, chosen by the server so rooms share them. */
  quiz?: QuizData;
  seed: number;
};

export const DEFAULT_OPTS: Opts = {
  teamSize: 5,
  order: "snake",
  timerSeconds: 30,
  useRoles: false,
  noDupUniverse: false,
  powerCap: null,
  bans: [],
  universes: [],
  customItems: [],
  roll: false,
  battle: false,
  avoid: [],
  options: 3,
  rerolls: 1,
  budget: 20,
  lotSeconds: 15,
  blind: false,
  clues: 3,
  handExtra: 2,
  rankSize: 6,
};

export function snakeConfig(setup: GameSetup): Config {
  const o = setup.opts;
  return {
    teamSize: o.teamSize,
    players: setup.players,
    order: o.order,
    timerSeconds: o.timerSeconds,
    bans: o.bans,
    roles: o.useRoles ? ["Leader", "Tank", "Brain", "Striker", "Support", "Speedster", "Mystic", "Wildcard", "Backup"].slice(0, o.teamSize) : [],
    noDupUniverse: o.noDupUniverse,
    powerCap: o.powerCap,
    scenario: setup.mission.id,
    filters: { universes: o.universes },
  };
}
