/** Real-world details some catalogs carry (sports players today). Blind auctions turn these into clues. */
export type Facts = {
  heightIn?: number;
  pos?: string;
  /** The team they played for longest, with its colours. */
  team?: string;
  colors?: string[];
  /** Every team they played for, in order. */
  teams?: string[];
  college?: string;
  from?: number;
  to?: number;
  hof?: boolean;
  allNba?: number;
  allStar?: number;
  /** Their best season. */
  peak?: { season: string; team: string; ppg: number; rpg: number; apg: number; spg?: number; bpg?: number; ts?: number };
  /** Career shooting percentages, 0 to 100, when known. */
  fg3?: number;
  fg2?: number;
  ft?: number;
};

export type Item = {
  id: string;
  name: string;
  universe: string;
  archetype: string;
  stats: Record<string, number>;
  tags: string[];
  facts?: Facts;
  custom?: boolean;
  /** Image search query (set when a catalog loads). */
  q?: string;
};

export type Config = {
  teamSize: number;
  players: string[];
  order: "snake" | "linear";
  timerSeconds: number | null;
  bans: string[];
  roles: string[];
  noDupUniverse: boolean;
  powerCap: number | null;
  scenario: string;
  filters: { universes: string[] };
};

export type Pick = { player: string; itemId: string; role?: string };

export type State = {
  config: Config;
  pool: Item[];
  picks: Pick[];
  banned: string[];
  turn: number;
  done: boolean;
};

export type Scenario = {
  id: string;
  title: string;
  blurb: string;
  weights: Record<string, number>;
  wantTags?: string[];
};

export type Validation = { ok: true } | { ok: false; reason: string };
