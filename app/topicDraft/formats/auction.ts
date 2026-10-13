import { next, shuffle } from "../rng";

export type AuctionState = {
  players: string[];
  budget: number;
  teamSize: number;
  rosters: Record<string, { itemId: string; price: number }[]>;
  budgets: Record<string, number>;
  queue: string[];
  leftover: string[];
  index: number;
  bid: { amount: number; by: string | null };
  deadline: number | null;
  baseMs: number;
  bumpMs: number;
  lastSold: { itemId: string; by: string | null; price: number } | null;
  done: boolean;
  seed: number;
};

export function init(o: {
  players: string[];
  budget: number;
  teamSize: number;
  poolIds: string[];
  seed: number;
  baseMs?: number;
  bumpMs?: number;
}): AuctionState {
  const need = o.players.length * o.teamSize;
  const [shuffled, seed] = shuffle(o.poolIds, o.seed);
  const take = Math.min(shuffled.length, Math.ceil(need * 2.2));
  return {
    players: o.players,
    budget: o.budget,
    teamSize: o.teamSize,
    rosters: Object.fromEntries(o.players.map((p) => [p, []])),
    budgets: Object.fromEntries(o.players.map((p) => [p, o.budget])),
    queue: shuffled.slice(0, take),
    leftover: shuffled.slice(take),
    index: 0,
    bid: { amount: 0, by: null },
    deadline: null,
    baseMs: o.baseMs ?? 15000,
    bumpMs: o.bumpMs ?? 6000,
    lastSold: null,
    done: false,
    seed,
  };
}

export const currentItem = (s: AuctionState) => (s.done ? null : (s.queue[s.index] ?? null));
export const slotsLeft = (s: AuctionState, p: string) => s.teamSize - s.rosters[p]!.length;

/** Most this player can bid: must keep $1 for every other empty slot. */
export function maxBid(s: AuctionState, p: string): number {
  const left = slotsLeft(s, p);
  if (left <= 0) return 0;
  return s.budgets[p]! - (left - 1);
}

export function open(s: AuctionState, now: number): AuctionState {
  return s.deadline == null && !s.done ? { ...s, deadline: now + s.baseMs } : s;
}

export function validateBid(s: AuctionState, p: string, amount: number): { ok: true } | { ok: false; reason: string } {
  if (s.done || s.deadline == null) return { ok: false, reason: "No lot open" };
  if (!Number.isInteger(amount)) return { ok: false, reason: "Whole dollars only" };
  if (slotsLeft(s, p) <= 0) return { ok: false, reason: "Your team is full" };
  if (amount <= s.bid.amount) return { ok: false, reason: `Bid must beat $${s.bid.amount}` };
  if (amount < 1) return { ok: false, reason: "Minimum bid is $1" };
  if (amount > maxBid(s, p)) return { ok: false, reason: `Max bid is $${maxBid(s, p)}` };
  if (s.bid.by === p) return { ok: false, reason: "You're already the high bidder" };
  return { ok: true };
}

export function placeBid(s: AuctionState, p: string, amount: number, now: number): AuctionState {
  if (!validateBid(s, p, amount).ok) return s;
  const remaining = Math.max(0, (s.deadline ?? now) - now);
  return { ...s, bid: { amount, by: p }, deadline: now + Math.max(remaining, s.bumpMs) };
}

function fillRemaining(s: AuctionState): AuctionState {
  let rosters = s.rosters;
  const pool = [...s.leftover, ...s.queue.slice(s.index).filter((id) => !Object.values(s.rosters).flat().some((r) => r.itemId === id))];
  const used = new Set<string>();
  for (const p of s.players) {
    const missing = slotsLeft({ ...s, rosters }, p);
    const picks: { itemId: string; price: number }[] = [];
    for (const id of pool) {
      if (picks.length >= missing) break;
      if (used.has(id)) continue;
      used.add(id);
      picks.push({ itemId: id, price: 0 });
    }
    rosters = { ...rosters, [p]: [...rosters[p]!, ...picks] };
  }
  return { ...s, rosters, done: true, deadline: null };
}

/** Resolve the current lot if its timer has expired. */
export function settle(s: AuctionState, now: number): AuctionState {
  if (s.done || s.deadline == null || now < s.deadline) return s;
  const itemId = s.queue[s.index]!;
  const by = s.bid.by;
  let rosters = s.rosters;
  let budgets = s.budgets;
  if (by) {
    rosters = { ...rosters, [by]: [...rosters[by]!, { itemId, price: s.bid.amount }] };
    budgets = { ...budgets, [by]: budgets[by]! - s.bid.amount };
  }
  let n: AuctionState = {
    ...s,
    rosters,
    budgets,
    index: s.index + 1,
    bid: { amount: 0, by: null },
    lastSold: { itemId, by, price: by ? s.bid.amount : 0 },
    deadline: null,
  };
  const allFull = n.players.every((p) => slotsLeft(n, p) <= 0);
  if (allFull) return { ...n, done: true };
  if (n.index >= n.queue.length) return fillRemaining(n);
  return { ...n, deadline: now + n.baseMs };
}

/** AI decision: returns a bid amount, or null to pass. `value` is the $ this bot thinks the lot is worth. */
export function aiBid(s: AuctionState, p: string, value: number): { amount: number; seed: number } | null {
  const [r, seed] = next(s.seed);
  if (s.bid.by === p || slotsLeft(s, p) <= 0) return null;
  const target = Math.min(Math.round(value), maxBid(s, p));
  const want = s.bid.amount + 1 + (r > 0.8 ? 1 : 0);
  if (want > target) return null;
  return { amount: Math.min(want, maxBid(s, p)), seed };
}

export const spent = (s: AuctionState, p: string) => s.budget - s.budgets[p]!;
