export type Item = {
  id: string;
  name: string;
  universe: string;
  archetype: string;
  stats: Record<string, number>;
  tags: string[];
  custom?: boolean;
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
