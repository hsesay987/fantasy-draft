import type { Item } from "../types";
import { itemScore } from "../scorer";
import { shuffle } from "../rng";
import { catalogMeta, STD_KEYS } from "../catalogs";

export type Role = { id: string; label: string; weights: Record<string, number> };

export const STD_ROLES: Role[] = [
  { id: "captain", label: "Captain", weights: { teamwork: 2, intellect: 2, power: 1, combat: 0.5 } },
  { id: "vice", label: "Vice Captain", weights: { teamwork: 1.5, intellect: 1.5, combat: 1, speed: 0.5 } },
  { id: "healer", label: "Healer", weights: { intellect: 2.5, teamwork: 2, durability: 0.5 } },
  { id: "support", label: "Support", weights: { teamwork: 2, speed: 1.5, intellect: 1 } },
  { id: "tank", label: "Tank", weights: { durability: 3, power: 1.5, combat: 1 } },
];

export const HISTORY_ROLES: Role[] = [
  { id: "ruler", label: "Ruler", weights: { leadership: 3, influence: 2, strategy: 1 } },
  { id: "general", label: "General", weights: { strategy: 3, courage: 2, leadership: 1.5 } },
  { id: "advisor", label: "Advisor", weights: { intellect: 3, strategy: 1.5, charisma: 0.5 } },
  { id: "diplomat", label: "Diplomat", weights: { charisma: 3, influence: 2, intellect: 1 } },
  { id: "champion", label: "Champion", weights: { courage: 3, leadership: 1, charisma: 1 } },
];

const R = (id: string, label: string, weights: Record<string, number>): Role => ({ id, label, weights });

/** Role sets that suit each topic. Anything not listed uses the standard Captain/Healer/Tank set. */
export const POOL_ROLES: Record<string, Role[]> = {
  football: [
    R("striker", "Striker", { shooting: 3, pace: 1.5, physical: 1 }),
    R("winger", "Winger", { pace: 2.5, dribbling: 2.5, shooting: 1 }),
    R("playmaker", "Playmaker", { passing: 3, dribbling: 2, shooting: 0.8 }),
    R("defender", "Centre-Back", { defending: 3, physical: 2, pace: 0.8 }),
    R("keeper", "Goalkeeper", { defending: 2.5, physical: 2, passing: 1 }),
  ],
  films: [
    R("opener", "Opening Night", { visuals: 2.5, fun: 2, impact: 1.5 }),
    R("crowd", "Crowd-Pleaser", { fun: 3, rewatch: 2 }),
    R("tear", "Tearjerker", { acting: 2.5, story: 2.5, impact: 1.5 }),
    R("mind", "Mind-Bender", { story: 3, impact: 1.5, visuals: 1 }),
    R("closer", "Closing Credits", { impact: 3, rewatch: 1.5, story: 1.5 }),
  ],
  shows: [
    R("pilot", "Pilot Hook", { story: 2.5, visuals: 1.5, fun: 1.5 }),
    R("comfort", "Comfort Rewatch", { rewatch: 3, fun: 2.5 }),
    R("prestige", "Prestige Drama", { acting: 3, story: 2.5, impact: 1.5 }),
    R("binge", "Binge Magnet", { fun: 2.5, rewatch: 2, story: 1.5 }),
    R("finale", "Legacy Finale", { impact: 3, story: 2, acting: 1 }),
  ],
  pokemon: [
    R("lead", "Lead", { speed: 2.5, teamwork: 1, intellect: 1 }),
    R("sweeper", "Sweeper", { power: 3, speed: 2.5, combat: 1 }),
    R("wall", "Wall", { durability: 3, intellect: 1, teamwork: 1 }),
    R("support", "Support", { teamwork: 2.5, intellect: 2, speed: 0.5 }),
    R("breaker", "Wallbreaker", { power: 2.5, combat: 2.5 }),
  ],
  anime: [
    R("hero", "Hero", { power: 2, teamwork: 2, combat: 1.5 }),
    R("rival", "Rival", { combat: 3, speed: 2, intellect: 1 }),
    R("mentor", "Mentor", { intellect: 3, teamwork: 2, power: 0.5 }),
    R("sidekick", "Sidekick", { teamwork: 3, speed: 1.5 }),
    R("wild", "Wildcard", { power: 2, speed: 2, combat: 1 }),
  ],
  villains: [
    R("mastermind", "Mastermind", { intellect: 3, teamwork: 1, power: 1 }),
    R("enforcer", "Enforcer", { power: 2.5, durability: 2, combat: 2 }),
    R("assassin", "Assassin", { speed: 2.5, combat: 2.5, intellect: 0.5 }),
    R("lieutenant", "Lieutenant", { teamwork: 2.5, combat: 1.5, intellect: 1 }),
    R("wild", "Wildcard", { power: 2, speed: 1.5, intellect: 1.5 }),
  ],
  videogames: [
    R("leader", "Party Leader", { teamwork: 2.5, intellect: 2, power: 1 }),
    R("tank", "Tank", { durability: 3, power: 1.5 }),
    R("dps", "Damage", { power: 2.5, combat: 2.5, speed: 1 }),
    R("healer", "Healer", { intellect: 2.5, teamwork: 2.5 }),
    R("scout", "Scout", { speed: 3, intellect: 1.5 }),
  ],
};

export const rolesFor = (poolId: string): Role[] => {
  if (POOL_ROLES[poolId]) return POOL_ROLES[poolId]!;
  return (catalogMeta(poolId)?.statKeys ?? STD_KEYS).includes("leadership") ? HISTORY_ROLES : STD_ROLES;
};

/** Build role weights from emphasised stats (chosen ones weigh 3, the rest a small 0.3). */
export function weightsFromStats(statKeys: string[], chosen: string[]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const k of statKeys) w[k] = chosen.includes(k) ? 3 : 0.3;
  return w;
}

export type PositionState = {
  players: string[];
  roles: Role[];
  hands: Record<string, string[]>;
  assign: Record<string, Record<string, string>>;
  locked: Record<string, boolean>;
  rerolls: Record<string, number>;
  unused: string[];
  handSize: number;
  seed: number;
  done: boolean;
  /** Random-roll mode: no dealt hand; each role rolls a few options to pick from. */
  roll?: { n: number; pool: string[]; rerolls: Record<string, number>; offers: Record<string, Record<string, string[]>> };
};

export function init(o: { players: string[]; roles: Role[]; poolIds: string[]; handSize?: number; rerolls?: number; seed: number; roll?: { n: number } }): PositionState {
  const handSize = Math.max(o.roles.length, o.handSize ?? o.roles.length + 2);
  let [shuffled, seed] = shuffle(o.poolIds, o.seed);
  const hands: Record<string, string[]> = {};
  for (const p of o.players) {
    hands[p] = o.roll ? [] : shuffled.slice(0, handSize);
    if (!o.roll) shuffled = shuffled.slice(handSize);
  }
  return {
    players: o.players,
    roles: o.roles,
    hands,
    assign: Object.fromEntries(o.players.map((p) => [p, {}])),
    locked: Object.fromEntries(o.players.map((p) => [p, false])),
    rerolls: Object.fromEntries(o.players.map((p) => [p, o.rerolls ?? 1])),
    unused: shuffled,
    handSize,
    seed,
    done: false,
    roll: o.roll ? { n: o.roll.n, pool: o.poolIds, rerolls: Object.fromEntries(o.players.map((p) => [p, o.rerolls ?? 1])), offers: Object.fromEntries(o.players.map((p) => [p, {}])) } : undefined,
  };
}

const assignedBySomeone = (s: PositionState, id: string) => Object.values(s.assign).some((a) => Object.values(a).includes(id));

function sampleRoleOffer(s: PositionState, exclude: string[], seed: number): [string[], number] {
  const free = s.roll!.pool.filter((id) => !assignedBySomeone(s, id));
  const fresh = free.filter((id) => !exclude.includes(id));
  const [shuffled, next] = shuffle(fresh.length >= s.roll!.n ? fresh : free, seed);
  return [shuffled.slice(0, s.roll!.n), next];
}

const withHand = (s: PositionState, p: string, ids: string[]) => ({ ...s.hands, [p]: [...new Set([...s.hands[p]!, ...ids])] });

/** Roll options for a role (free the first time; idempotent). */
export function rollRole(s: PositionState, p: string, roleId: string): PositionState {
  if (!s.roll || s.done || s.locked[p] || !s.roles.some((r) => r.id === roleId) || s.assign[p]![roleId] || s.roll.offers[p]![roleId]) return s;
  const [offer, seed] = sampleRoleOffer(s, [], s.seed);
  return { ...s, seed, hands: withHand(s, p, offer), roll: { ...s.roll, offers: { ...s.roll.offers, [p]: { ...s.roll.offers[p], [roleId]: offer } } } };
}

/** Spend a reroll token to redraw a role's options (they differ from the previous roll when possible). */
export function rerollRole(s: PositionState, p: string, roleId: string): PositionState {
  if (!s.roll || s.done || s.locked[p] || s.assign[p]![roleId] || (s.roll.rerolls[p] ?? 0) <= 0) return s;
  const prev = s.roll.offers[p]![roleId] ?? [];
  const [offer, seed] = sampleRoleOffer(s, prev, s.seed);
  return { ...s, seed, hands: withHand(s, p, offer), roll: { ...s.roll, rerolls: { ...s.roll.rerolls, [p]: s.roll.rerolls[p]! - 1 }, offers: { ...s.roll.offers, [p]: { ...s.roll.offers[p], [roleId]: offer } } } };
}

export function assign(s: PositionState, p: string, roleId: string, itemId: string): PositionState {
  if (s.done || s.locked[p] || !s.hands[p]!.includes(itemId) || !s.roles.some((r) => r.id === roleId)) return s;
  if (s.roll) {
    // Rolled mode: pick from this role's offer, one character per player, nobody can share a pick.
    if (!s.roll.offers[p]![roleId]?.includes(itemId) || assignedBySomeone(s, itemId) || s.assign[p]![roleId]) return s;
    return { ...s, assign: { ...s.assign, [p]: { ...s.assign[p], [roleId]: itemId } }, roll: { ...s.roll, offers: { ...s.roll.offers, [p]: { ...s.roll.offers[p], [roleId]: undefined as never } } } };
  }
  const cur = { ...s.assign[p]! };
  for (const [r, id] of Object.entries(cur)) if (id === itemId) delete cur[r];
  cur[roleId] = itemId;
  return { ...s, assign: { ...s.assign, [p]: cur } };
}

export function unassign(s: PositionState, p: string, roleId: string): PositionState {
  if (s.done || s.locked[p]) return s;
  const cur = { ...s.assign[p]! };
  delete cur[roleId];
  if (s.roll) return { ...s, assign: { ...s.assign, [p]: cur }, roll: { ...s.roll, offers: { ...s.roll.offers, [p]: { ...s.roll.offers[p], [roleId]: undefined as never } } } };
  return { ...s, assign: { ...s.assign, [p]: cur } };
}

export const complete = (s: PositionState, p: string) => s.roles.every((r) => s.assign[p]![r.id]);

export function reroll(s: PositionState, p: string): PositionState {
  if (s.roll) return s;
  if (s.done || s.locked[p] || s.rerolls[p]! <= 0 || Object.keys(s.assign[p]!).length > 0) return s;
  const [pool, seed] = shuffle([...s.unused, ...s.hands[p]!], s.seed);
  return {
    ...s,
    hands: { ...s.hands, [p]: pool.slice(0, s.handSize) },
    unused: pool.slice(s.handSize),
    rerolls: { ...s.rerolls, [p]: s.rerolls[p]! - 1 },
    seed,
  };
}

export function lock(s: PositionState, p: string): PositionState {
  if (!complete(s, p)) return s;
  const locked = { ...s.locked, [p]: true };
  return { ...s, locked, done: s.players.every((x) => locked[x]) };
}

export const roleFit = (item: Item, role: Role) => itemScore(item, role.weights);

/** Best assignment (exhaustive: hands and roles are small). */
export function bestAssignment(roles: Role[], hand: Item[]): Record<string, string> {
  let best = -1;
  let bestMap: Record<string, string> = {};
  const used = new Set<number>();
  const cur: Record<string, string> = {};
  const go = (ri: number, sum: number) => {
    if (ri === roles.length) {
      if (sum > best) {
        best = sum;
        bestMap = { ...cur };
      }
      return;
    }
    for (let i = 0; i < hand.length; i++) {
      if (used.has(i)) continue;
      used.add(i);
      cur[roles[ri]!.id] = hand[i]!.id;
      go(ri + 1, sum + roleFit(hand[i]!, roles[ri]!));
      used.delete(i);
    }
  };
  go(0, 0);
  return bestMap;
}

export function autoAssign(s: PositionState, p: string, itemsById: (id: string) => Item | undefined): PositionState {
  if (s.done || s.locked[p]) return s;
  if (s.roll) {
    // Rolled mode: roll each open role, take the best fit on offer.
    let n = s;
    for (const r of s.roles) {
      if (n.assign[p]![r.id]) continue;
      n = rollRole(n, p, r.id);
      const best = (n.roll!.offers[p]![r.id] ?? [])
        .filter((id) => !assignedBySomeone(n, id))
        .map((id) => itemsById(id))
        .filter((i): i is Item => !!i)
        .sort((a, b) => roleFit(b, r) - roleFit(a, r))[0];
      if (best) n = assign(n, p, r.id, best.id);
    }
    return n;
  }
  const hand = s.hands[p]!.map(itemsById).filter(Boolean) as Item[];
  return { ...s, assign: { ...s.assign, [p]: bestAssignment(s.roles, hand) } };
}

export function scorePosition(roles: Role[], assigned: Record<string, Item | undefined>) {
  const per = roles.map((r) => (assigned[r.id] ? roleFit(assigned[r.id]!, r) : 0));
  const total = per.reduce((a, b) => a + b, 0) / Math.max(1, roles.length);
  return { total: Math.round(total * 10) / 10, perRole: Object.fromEntries(roles.map((r, i) => [r.id, Math.round(per[i]!)])) };
}
