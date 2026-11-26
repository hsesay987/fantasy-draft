// Veto: a draft option. Each player has a few vetoes (1-3). Right after someone else's pick, any other player with a
// veto left may cancel it within VETO_MS. A vetoed item leaves play for good.
// - Snake, Spin, Loadout: the draft waits through the window, then the picker picks again. That re-pick can't be vetoed.
// - Auction: a vetoed sale is refunded and the item is gone. The next lot does not wait.
// - Keep or Delete: a vetoed keep becomes a delete for that player. The stream does not wait.
// Pure and shared with the server (synced to backend/src/shared).
import type { State } from "./types";
import type { SpinState } from "./formats/spin";
import { makeOffer } from "./formats/spin";
import type { LoadoutState } from "./formats/loadout";
import type { AuctionState } from "./formats/auction";
import { reopen } from "./formats/auction";
import type { KeepState } from "./formats/keep";

export const VETO_MS = 8000;
export const VETO_FORMATS = new Set(["snake", "spin", "loadout", "auction", "keep"]);
/** Formats that hold the next pick until the window closes (a veto rewinds the turn). */
export const VETO_WAITS = new Set(["snake", "spin", "loadout"]);
const WAITS = VETO_WAITS;

export type VetoPick = { picker: string; itemId: string; slotId?: string; price?: number };
export type VetoState = {
  left: Record<string, number>;
  /** The pick that can be vetoed right now, and until when. */
  open?: VetoPick & { until: number };
  /** Every veto so far, for the results. */
  log: { by: string; picker: string; itemId: string }[];
  /** This player's next pick is the re-pick after a veto, so it can't be vetoed. */
  repick?: string;
};
type WithVeto = { veto?: VetoState };

export const vetoOf = (s: unknown): VetoState | undefined => (s as WithVeto | null)?.veto;
export const vetoCount = (n: unknown): number => { const v = Math.floor(Number(n)); return Number.isFinite(v) ? Math.max(0, Math.min(3, v)) : 0; };
export const vetoOn = (format: string, n: unknown) => VETO_FORMATS.has(format) && vetoCount(n) > 0;

/** Bots never veto, so they start with none (and no window waits on them). */
export function initVeto(players: string[], n: number, bots: string[] = []): VetoState {
  return { left: Object.fromEntries(players.map((p) => [p, bots.includes(p) ? 0 : n])), log: [] };
}

/** A window that is open and not yet over. */
export const windowOpen = (s: unknown, now: number): boolean => { const o = vetoOf(s)?.open; return !!o && now < o.until; };
/** Does the draft wait on the window (no picks meanwhile)? */
export const holds = (format: string, s: unknown, now: number) => WAITS.has(format) && windowOpen(s, now);
/** Could this player veto the open pick? */
export function canVeto(s: unknown, by: string, now: number): boolean {
  const v = vetoOf(s);
  return !!v?.open && now < v.open.until && by !== v.open.picker && (v.left[by] ?? 0) > 0;
}

/** The pick an action just made, comparing before and after. Null when the action made no pick. */
export function newPick(format: string, before: any, after: any): VetoPick | null {
  switch (format) {
    case "snake":
    case "spin": {
      const b: State = format === "spin" ? before.spin.draft : before.draft;
      const a: State = format === "spin" ? after.spin.draft : after.draft;
      if (a.picks.length !== b.picks.length + 1) return null;
      const p = a.picks[a.picks.length - 1]!;
      return { picker: p.player, itemId: p.itemId };
    }
    case "loadout": {
      const b = before as LoadoutState, a = after as LoadoutState;
      if (a.turn !== b.turn + 1) return null;
      for (const p of a.players)
        for (const [slotId, itemId] of Object.entries(a.picks[p]!))
          if (b.picks[p]![slotId] !== itemId) return { picker: p, itemId, slotId, price: a.spent[p]! - b.spent[p]! };
      return null;
    }
    case "auction": {
      const b = before as AuctionState, a = after as AuctionState;
      const sold = a.lastSold;
      if (!sold || sold === b.lastSold || !sold.by || a.index !== b.index + 1) return null;
      return { picker: sold.by, itemId: sold.itemId, price: sold.price };
    }
    case "keep": {
      const b = before as KeepState, a = after as KeepState;
      for (const p of a.players) if (a.keeps[p]!.length === b.keeps[p]!.length + 1) return { picker: p, itemId: a.keeps[p]![a.keeps[p]!.length - 1]! };
      return null;
    }
    default:
      return null;
  }
}

/** Undo a pick in the format's own state and take the item out of play. */
function undo(format: string, s: any, pk: VetoPick, now: number): any {
  switch (format) {
    case "snake": {
      const d = s.draft as State;
      return { ...s, draft: undoSnake(d, pk) };
    }
    case "spin": {
      const x = s.spin as SpinState;
      const draft = undoSnake(x.draft, pk);
      const [offer, seed] = makeOffer(draft, x.options, x.seed, draft.config.roles.length > 0);
      return { ...s, spin: { ...x, draft, offer, seed } };
    }
    case "loadout": {
      const x = s as LoadoutState;
      const mine = { ...x.picks[pk.picker] };
      if (pk.slotId) delete mine[pk.slotId];
      return {
        ...x, picks: { ...x.picks, [pk.picker]: mine }, spent: { ...x.spent, [pk.picker]: x.spent[pk.picker]! - (pk.price ?? 0) },
        turn: Math.max(0, x.turn - 1), done: false, vetoed: [...(x.vetoed ?? []), pk.itemId], roll: x.roll ? { ...x.roll, offers: {} } : undefined,
      };
    }
    case "auction": {
      const x = s as AuctionState;
      const roster = [...x.rosters[pk.picker]!];
      const at = roster.map((r) => r.itemId).lastIndexOf(pk.itemId);
      if (at < 0) return s;
      roster.splice(at, 1);
      const n: AuctionState = { ...x, rosters: { ...x.rosters, [pk.picker]: roster }, budgets: { ...x.budgets, [pk.picker]: x.budgets[pk.picker]! + (pk.price ?? 0) } };
      return x.done ? reopen(n, now) : n;
    }
    case "keep": {
      const x = s as KeepState;
      const keeps = x.keeps[pk.picker]!.filter((id) => id !== pk.itemId);
      return { ...x, keeps: { ...x.keeps, [pk.picker]: keeps }, deleted: { ...x.deleted, [pk.picker]: [...x.deleted[pk.picker]!, pk.itemId] } };
    }
    default:
      return s;
  }
}

function undoSnake(d: State, pk: VetoPick): State {
  const last = d.picks[d.picks.length - 1];
  if (!last || last.itemId !== pk.itemId) return d;
  return { ...d, picks: d.picks.slice(0, -1), turn: Math.max(0, d.turn - 1), done: false, banned: [...d.banned, pk.itemId] };
}

/** Cancel the open pick. Returns the same state when `by` can't veto it now. */
export function veto(format: string, s: any, by: string, now: number): any {
  if (!canVeto(s, by, now)) return s;
  const v = vetoOf(s)!;
  const pk = v.open!;
  const next = undo(format, s, pk, now);
  if (next === s) return s;
  return {
    ...next,
    veto: { left: { ...v.left, [by]: v.left[by]! - 1 }, log: [...v.log, { by, picker: pk.picker, itemId: pk.itemId }], ...(WAITS.has(format) ? { repick: pk.picker } : {}) },
  };
}

/** After a pick: open a window when someone else still has a veto, unless it was a re-pick after a veto. */
export function afterPick(format: string, s: any, pk: VetoPick, now: number): any {
  const v = vetoOf(s);
  if (!v) return s;
  if (v.repick === pk.picker && WAITS.has(format)) return { ...s, veto: { ...v, repick: undefined, open: undefined } };
  const anyone = Object.entries(v.left).some(([p, n]) => p !== pk.picker && n > 0);
  return { ...s, veto: { ...v, repick: undefined, open: anyone ? { ...pk, until: now + VETO_MS } : undefined } };
}

/** Close a window whose time is up. */
export function closeExpired(s: any, now: number): any {
  const v = vetoOf(s);
  return v?.open && now >= v.open.until ? { ...s, veto: { ...v, open: undefined } } : s;
}
