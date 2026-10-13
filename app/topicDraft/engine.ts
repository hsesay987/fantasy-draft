import type { Config, Item, Pick, State, Validation } from "./types";

export const powerOf = (i: Item) => i.stats.power ?? 0;

const total = (c: Config) => c.players.length * c.teamSize;

export function init(config: Config, pool: Item[]): State {
  const allowed = config.filters.universes;
  const filtered = allowed.length ? pool.filter((i) => allowed.includes(i.universe)) : pool;
  return { config, pool: filtered, picks: [], banned: [...config.bans], turn: 0, done: false };
}

export function turnPlayer(s: State): string {
  const n = s.config.players.length;
  const round = Math.floor(s.turn / n);
  const idx = s.turn % n;
  const reverse = s.config.order === "snake" && round % 2 === 1;
  return s.config.players[reverse ? n - 1 - idx : idx];
}

const teamOf = (s: State, player: string): Pick[] => s.picks.filter((p) => p.player === player);

export function validatePick(s: State, itemId: string, role?: string): Validation {
  if (s.done) return { ok: false, reason: "Draft is over" };
  const item = s.pool.find((i) => i.id === itemId);
  if (!item) return { ok: false, reason: "Not in the pool" };
  if (s.banned.includes(itemId)) return { ok: false, reason: "Banned" };
  if (s.picks.some((p) => p.itemId === itemId)) return { ok: false, reason: "Already drafted" };

  const player = turnPlayer(s);
  const mine = teamOf(s, player);
  const byId = (id: string) => s.pool.find((i) => i.id === id)!;

  if (s.config.noDupUniverse && mine.some((p) => byId(p.itemId).universe === item.universe))
    return { ok: false, reason: `Already have a ${item.universe} pick` };

  if (s.config.powerCap != null) {
    const sum = mine.reduce((a, p) => a + powerOf(byId(p.itemId)), 0) + powerOf(item);
    if (sum > s.config.powerCap) return { ok: false, reason: "Over the power cap" };
  }

  if (s.config.roles.length) {
    if (!role || !s.config.roles.includes(role)) return { ok: false, reason: "Pick a valid role" };
    if (mine.some((p) => p.role === role)) return { ok: false, reason: "Role already filled" };
  }
  return { ok: true };
}

export function pick(s: State, itemId: string, role?: string): State {
  const v = validatePick(s, itemId, role);
  if (!v.ok) return s;
  const picks = [...s.picks, { player: turnPlayer(s), itemId, role }];
  const turn = s.turn + 1;
  return { ...s, picks, turn, done: turn >= total(s.config) };
}

/** Best valid pick by raw stat sum; used on timeout and for the AI drafter. */
export function autoPick(s: State, weights?: Record<string, number>): State {
  if (s.done) return s;
  const player = turnPlayer(s);
  const mine = teamOf(s, player);
  const freeRoles = s.config.roles.filter((r) => !mine.some((p) => p.role === r));
  const score = (i: Item) =>
    Object.entries(i.stats).reduce((a, [k, v]) => a + v * (weights?.[k] ?? 1), 0);
  const ranked = [...s.pool].sort((a, b) => score(b) - score(a));
  for (const item of ranked) {
    if (!s.config.roles.length) {
      if (validatePick(s, item.id).ok) return pick(s, item.id);
    } else {
      for (const r of freeRoles) if (validatePick(s, item.id, r).ok) return pick(s, item.id, r);
    }
  }
  // Constraints unsatisfiable: end the draft rather than loop forever.
  return { ...s, done: true };
}
