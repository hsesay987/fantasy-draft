// Format-agnostic game core. Pure + JSON-serializable so the browser (local play)
// and the server (online rooms) run exactly the same rules.
import type { GameSetup } from "../play/types";
import { snakeConfig } from "../play/types";
import { toJudgeItem, type JudgeTeamInput } from "../play/judging";
import { getCatalog } from "./catalogs";
import { autoPick, init as initSnake, pick as snakePick, turnPlayer as snakeTurn } from "./engine";
import { scoreTeam } from "./scorer";
import * as spin from "./formats/spin";
import * as A from "./formats/auction";
import * as L from "./formats/loadout";
import * as P from "./formats/position";
import * as B from "./formats/blind";
import * as K from "./formats/keep";
import * as FD from "./formats/feud";
import * as J from "./formats/jeopardy";
import { bundledCategories, surveysFor } from "./trivia";
import { catalogMeta } from "./catalogs";
import type { Item, State } from "./types";
import { battle } from "./battle";

export type SnakeRun = { kind: "snake"; draft: State } | { kind: "spin"; spin: spin.SpinState };
export type GameState = SnakeRun | A.AuctionState | L.LoadoutState | P.PositionState | B.BlindState | K.KeepState | FD.FeudState | J.JeopardyState;

/** Every action says who is acting; the server checks that against the seat's token. */
export type Action =
  | { type: "pick"; by: string; itemId: string; role?: string }
  | { type: "reroll"; by: string }
  | { type: "auto"; by: string }
  | { type: "bid"; by: string; amount: number; seed?: number }
  | { type: "pass"; by: string }
  | { type: "nominate"; by: string; itemId: string }
  | { type: "tick" }
  | { type: "buy"; by: string; slotId: string; itemId: string; seed?: number }
  | { type: "rollFor"; by: string; slotId: string }
  | { type: "rerollSlot"; by: string; slotId: string }
  | { type: "assign"; by: string; roleId: string; itemId: string }
  | { type: "unassign"; by: string; roleId: string }
  | { type: "autoAssign"; by: string }
  | { type: "lock"; by: string }
  | { type: "place"; by: string; rank: number; seed?: number }
  | { type: "choose"; by: string; cell: number }
  | { type: "answer"; by: string; choice: string | number; seed?: number };

export type Extra = { kind: "order"; title: string; names: string[] } | null;

/** The pool a setup drafts from (filters, bans and custom items applied for non-snake formats). */
export function poolFor(setup: GameSetup): Item[] {
  const o = setup.opts;
  const all = [...getCatalog(setup.pool), ...o.customItems];
  if (setup.format === "snake" || setup.format === "spin") return all;
  return all.filter((i) => !o.bans.includes(i.id) && (!o.universes.length || o.universes.includes(i.universe)));
}

const rolling = (s: GameSetup) => s.format === "spin" || s.opts.roll;

const statKeysOf = (setup: GameSetup) => catalogMeta(setup.pool)?.statKeys ?? Object.keys(poolFor(setup)[0]?.stats ?? {});
const triviaItem = (label: string, cat: string): Item => ({ id: `trivia-${label}`, name: label, universe: cat, archetype: "Trivia", stats: {}, tags: [] });
const quizRounds = (setup: GameSetup) => Math.max(3, Math.min(8, setup.opts.teamSize));

export function initGame(setup: GameSetup, now: number): GameState {
  const o = setup.opts;
  const pool = poolFor(setup);
  switch (setup.format) {
    case "auction":
      return A.open(
        A.init({
          players: setup.players, budget: o.budget, teamSize: o.teamSize, poolIds: pool.map((i) => i.id), seed: setup.seed,
          baseMs: o.lotSeconds * 1000, bumpMs: Math.min(8000, o.lotSeconds * 500), openMs: Math.min(12000, Math.max(6000, o.lotSeconds * 600)),
          nominate: o.roll ? { n: Math.max(2, Math.min(4, o.options)) } : undefined,
        }),
        now
      );
    case "loadout":
      return L.init(setup.loadout!, setup.players, o.order, o.roll ? { n: o.options, rerolls: o.rerolls, seed: setup.seed } : undefined);
    case "position":
      return P.init({ players: setup.players, roles: setup.roles, poolIds: pool.map((i) => i.id), handSize: setup.roles.length + o.handExtra, rerolls: o.rerolls, seed: setup.seed, roll: o.roll ? { n: o.options } : undefined });
    case "blind":
      return B.init({ players: setup.players, poolIds: pool.map((i) => i.id), size: o.rankSize, weights: setup.mission.weights, seed: setup.seed });
    case "keep":
      return K.init({ players: setup.players, pool, teamSize: o.teamSize, weights: setup.mission.weights, seed: setup.seed });
    case "feud":
      return FD.init({ players: setup.players, surveys: setup.quiz?.surveys?.length ? setup.quiz.surveys : surveysFor(setup.pool), avoid: o.avoid, rounds: Math.min(5, quizRounds(setup)), seed: setup.seed });
    case "jeopardy":
      return J.init({ players: setup.players, categories: setup.quiz?.categories?.length ? setup.quiz.categories : bundledCategories(setup.pool), avoid: o.avoid, seed: setup.seed });
    default:
      return rolling(setup)
        ? { kind: "spin", spin: spin.init(snakeConfig(setup), pool, o.options, o.rerolls, setup.seed) }
        : { kind: "snake", draft: initSnake(snakeConfig(setup), pool) };
  }
}

export function isDone(setup: GameSetup, s: GameState): boolean {
  switch (setup.format) {
    case "snake":
    case "spin": {
      const r = s as SnakeRun;
      return (r.kind === "spin" ? r.spin.draft : r.draft).done;
    }
    default:
      return (s as { done: boolean }).done;
  }
}

/** Who must act next in a strictly turn-based format (null = anyone / simultaneous). */
export function currentTurn(setup: GameSetup, s: GameState): string | null {
  if (isDone(setup, s)) return null;
  switch (setup.format) {
    case "snake":
    case "spin": {
      const r = s as SnakeRun;
      return snakeTurn(r.kind === "spin" ? r.spin.draft : r.draft);
    }
    case "loadout":
      return L.turnPlayer(s as L.LoadoutState);
    case "blind":
      return B.turnPlayer(s as B.BlindState);
    case "keep":
      return K.turnPlayer(s as K.KeepState);
    case "feud":
      return FD.turnPlayer(s as FD.FeudState);
    case "jeopardy":
      return J.turnPlayer(s as J.JeopardyState);
    default:
      return null;
  }
}

const itemsById = (setup: GameSetup) => {
  const m = new Map(poolFor(setup).map((i) => [i.id, i]));
  return (id: string) => m.get(id);
};

/** Apply one action. Returns the same reference if the action was invalid or not allowed. */
export function applyAction(setup: GameSetup, s: GameState, a: Action, now: number): GameState {
  if (a.type !== "tick" && "by" in a && !setup.players.includes(a.by)) return s;
  const turn = currentTurn(setup, s);
  const mine = (a: Action) => !("by" in a) || turn == null || turn === a.by;
  const weights = setup.mission.weights;

  switch (setup.format) {
    case "snake":
    case "spin": {
      const r = s as SnakeRun;
      if (!mine(a)) return s;
      if (a.type === "pick") return r.kind === "spin" ? { kind: "spin", spin: spin.pick(r.spin, a.itemId, a.role) } : { kind: "snake", draft: snakePick(r.draft, a.itemId, a.role) };
      if (a.type === "reroll") return r.kind === "spin" ? { kind: "spin", spin: spin.reroll(r.spin) } : r;
      if (a.type === "auto") return r.kind === "spin" ? { kind: "spin", spin: spin.auto(r.spin, weights) } : { kind: "snake", draft: autoPick(r.draft, weights) };
      return s;
    }
    case "auction": {
      const x = s as A.AuctionState;
      if (a.type === "bid") return A.placeBid(a.seed != null ? { ...x, seed: a.seed } : x, a.by, a.amount, now);
      if (a.type === "pass") return A.pass(x, a.by, now);
      if (a.type === "nominate") return A.nominate(x, a.by, a.itemId, now);
      if (a.type === "tick") return A.settle(x, now);
      return s;
    }
    case "loadout": {
      const x = s as L.LoadoutState;
      if (!mine(a)) return s;
      if (a.type === "buy") return L.pick(a.seed != null && x.roll ? { ...x, roll: { ...x.roll, seed: a.seed, offers: {} } } : x, a.slotId, a.itemId);
      if (a.type === "rollFor") return L.rollFor(x, a.slotId);
      if (a.type === "rerollSlot") return L.rerollSlot(x, a.slotId);
      if (a.type === "auto") return L.autoPick(x);
      return s;
    }
    case "position": {
      const x = s as P.PositionState;
      if (a.type === "assign") return P.assign(x, a.by, a.roleId, a.itemId);
      if (a.type === "unassign") return P.unassign(x, a.by, a.roleId);
      if (a.type === "reroll") return P.reroll(x, a.by);
      if (a.type === "autoAssign") return P.autoAssign(x, a.by, itemsById(setup));
      if (a.type === "rollFor") return P.rollRole(x, a.by, a.slotId);
      if (a.type === "rerollSlot") return P.rerollRole(x, a.by, a.slotId);
      if (a.type === "lock") return P.lock(x, a.by);
      return s;
    }
    case "blind": {
      const x = s as B.BlindState;
      if (!mine(a)) return s;
      if (a.type === "place") return a.seed != null ? { ...B.place(x, a.rank), seed: a.seed } : B.place(x, a.rank);
      return s;
    }
    case "keep": {
      if (!mine(a) || a.type !== "answer") return s;
      const x = s as K.KeepState;
      return K.decide(a.seed != null ? { ...x, seed: a.seed } : x, a.choice === "keep");
    }
    case "feud": {
      if (!mine(a) || a.type !== "answer") return s;
      const x = s as FD.FeudState;
      return FD.choose(a.seed != null ? { ...x, seed: a.seed } : x, a.by, String(a.choice));
    }
    case "jeopardy": {
      if (!mine(a)) return s;
      const x = s as J.JeopardyState;
      if (a.type === "choose") return J.choose(x, a.by, a.cell);
      if (a.type === "answer") return J.answer(a.seed != null ? { ...x, seed: a.seed } : x, a.by, String(a.choice));
      return s;
    }
  }
  return s;
}

/** The move an AI (or a bot standing in for a player who left) makes right now. null = nothing to do. */
export function autoAction(setup: GameSetup, s: GameState): Action | null {
  const by = currentTurn(setup, s);
  if (!by) return null;
  switch (setup.format) {
    case "keep": {
      const r = K.aiDecide(s as K.KeepState);
      return { type: "answer", by, choice: r.keep ? "keep" : "delete", seed: r.seed };
    }
    case "feud": {
      const r = FD.aiChoose(s as FD.FeudState);
      return { type: "answer", by, choice: r.choice, seed: r.seed };
    }
    case "jeopardy": {
      const j = s as J.JeopardyState;
      if (j.active == null) return { type: "choose", by, cell: J.aiChoose(j) };
      const r = J.aiAnswer(j);
      return { type: "answer", by, choice: r.choice, seed: r.seed };
    }
    default:
      return null;
  }
}

/** Formats where every turn is a quick decision, so a stalled player is auto-played after a short wait. */
export const QUICK_FORMATS = new Set<string>(["blind", "keep", "feud", "jeopardy"]);

/** What the server should do when a turn timer runs out (null = nothing). */
export function timeoutAction(setup: GameSetup, s: GameState): Action | null {
  const who = currentTurn(setup, s);
  if (who && (setup.format === "snake" || setup.format === "spin" || setup.format === "loadout")) return { type: "auto", by: who };
  return null;
}

/** Judge-ready teams (plus optional extra info to show under the verdict). */
export function buildTeams(setup: GameSetup, s: GameState): { teams: JudgeTeamInput[]; extra: Extra } {
  const base = buildTeamsBase(setup, s);
  if (!setup.opts.battle || base.teams.length < 2 || !["snake", "spin", "auction", "position"].includes(setup.format)) return base;
  return { ...base, teams: battle(base.teams, setup.mission.weights).teams };
}

function buildTeamsBase(setup: GameSetup, s: GameState): { teams: JudgeTeamInput[]; extra: Extra } {
  const get = itemsById(setup);
  const mission = setup.mission;
  switch (setup.format) {
    case "auction": {
      const a = s as A.AuctionState;
      return {
        extra: null,
        teams: setup.players.map((player) => {
          const roster = a.rosters[player]!;
          const items = roster.map((r) => get(r.itemId)!).filter(Boolean);
          return { player, baseline: scoreTeam(items, mission).total, notes: `Spent $${A.spent(a, player)} of $${a.budget}`, items: roster.map((r) => toJudgeItem(get(r.itemId)!, { price: r.price })) };
        }),
      };
    }
    case "loadout": {
      const l = s as L.LoadoutState;
      const m = setup.loadout!;
      return {
        extra: null,
        teams: l.players.map((p) => {
          const filled = m.slots.map((sl) => ({ slot: sl, item: L.itemFor(l, p, sl.id)! })).filter((x) => x.item);
          const sc = L.scoreLoadout(m, filled);
          return { player: p, baseline: sc.total, notes: `Covered ${sc.covered.length}/${m.boss.weaknesses.length} of ${m.boss.name}'s weaknesses (${sc.covered.join(", ") || "none"}). Spent $${l.spent[p]} of $${m.budget}.`, items: filled.map(({ slot, item }) => toJudgeItem(item, { role: slot.label, price: L.priceOf(item, slot.priceStat) })) };
        }),
      };
    }
    case "position": {
      const p = s as P.PositionState;
      return {
        extra: null,
        teams: p.players.map((player) => {
          const assigned = Object.fromEntries(p.roles.map((r) => [r.id, get(p.assign[player]![r.id]!)]));
          const sc = P.scorePosition(p.roles, assigned);
          // Role fit decides most of it; the mission still shapes the result (65/35 blend).
          const picked = p.roles.map((r) => assigned[r.id]).filter(Boolean) as Item[];
          const fit = picked.length ? scoreTeam(picked, mission).total : 0;
          const baseline = Math.round((sc.total * 0.65 + fit * 0.35) * 10) / 10;
          return { player, baseline, notes: `Mission fit ${Math.round(fit)}. Role fit: ` + p.roles.map((r) => `${r.label} ${sc.perRole[r.id]}`).join(", "), items: p.roles.filter((r) => assigned[r.id]).map((r) => toJudgeItem(assigned[r.id]!, { role: r.label })) };
        }),
      };
    }
    case "blind": {
      const b = s as B.BlindState;
      const truth = B.trueOrder(b.queue.map((id) => get(id)!), b.weights);
      return {
        extra: { kind: "order", title: "The true order", names: truth.map((id) => get(id)?.name ?? id) },
        teams: b.players.map((player) => {
          const order = b.ranks[player]!;
          const acc = B.accuracy(order, truth);
          const misses = order
            .map((id, i) => ({ name: get(id!)?.name ?? "?", placed: i + 1, actual: truth.indexOf(id!) + 1 }))
            .filter((m) => m.actual > 0)
            .sort((a, b) => Math.abs(b.placed - b.actual) - Math.abs(a.placed - a.actual))
            .slice(0, 2)
            .filter((m) => m.placed !== m.actual);
          const missText = misses.length ? ` Biggest misses: ${misses.map((m) => `${m.name} (placed #${m.placed}, really #${m.actual})`).join("; ")}.` : " A perfect ranking.";
          return { player, baseline: acc, notes: `Ranking accuracy ${acc}%.${missText}`, items: order.map((id, i) => toJudgeItem(get(id!)!, { role: `Rank ${i + 1}` })) };
        }),
      };
    }
    case "keep": {
      const k = s as K.KeepState;
      return {
        extra: null,
        teams: k.players.map((player) => {
          const items = k.keeps[player]!.map((id) => get(id)!).filter(Boolean);
          return { player, baseline: scoreTeam(items, mission).total, notes: `Kept ${items.length}, deleted ${k.deleted[player]!.length}.`, items: items.map((i) => toJudgeItem(i)) };
        }),
      };
    }
    case "feud": {
      const f = s as FD.FeudState;
      return {
        extra: null,
        teams: f.players.map((player) => {
          const found = f.rounds.flatMap((r) => Object.entries(r.found).filter(([, by]) => by === player).map(([answer]) => ({ answer, role: `#${r.board.indexOf(answer) + 1}: ${r.q}` })));
          const pts = f.points[player]!;
          const strikes = f.rounds.reduce((n, r) => n + r.wrong.length, 0);
          return { player, baseline: Math.round(Math.min(100, 30 + (70 * pts) / (f.rounds.length * 75)) * 10) / 10, notes: `Scored ${pts} points naming ${found.length} survey answers. Table strikes: ${strikes}.`, items: found.map((x) => toJudgeItem(triviaItem(x.answer, "Survey"), { role: x.role })) };
        }),
      };
    }
    case "jeopardy": {
      const j = s as J.JeopardyState;
      return {
        extra: null,
        teams: j.players.map((player) => {
          const tried = j.tried[player]!;
          const acc = tried ? j.right[player]!.length / tried : 0;
          const share = Math.max(0, Math.min(1, j.points[player]! / 1200));
          return { player, baseline: Math.round((35 + 65 * (0.5 * acc + 0.5 * share)) * 10) / 10, notes: `Scored $${j.points[player]} (${j.right[player]!.length} of ${tried} clues right).`, items: j.right[player]!.map((r) => toJudgeItem(triviaItem(r.answer, r.cat), { role: r.q })) };
        }),
      };
    }
    default: {
      const r = s as SnakeRun;
      const d = r.kind === "spin" ? r.spin.draft : r.draft;
      return {
        extra: null,
        teams: d.config.players.map((player) => {
          const picks = d.picks.filter((p) => p.player === player);
          const items = picks.map((p) => get(p.itemId)!).filter(Boolean);
          return { player, baseline: scoreTeam(items, mission).total, items: picks.map((p) => toJudgeItem(get(p.itemId)!, { role: p.role })) };
        }),
      };
    }
  }
}

/** For the UI: which character an auto-pick would take right now (so AI choices can be shown before they land). */
export function previewAuto(setup: GameSetup, s: GameState): { itemId: string; role?: string } | null {
  if (setup.format !== "snake" && setup.format !== "spin") return null;
  const next = applyAction(setup, s, { type: "auto", by: currentTurn(setup, s) ?? "" }, 0) as SnakeRun;
  const draft = next.kind === "spin" ? next.spin.draft : next.draft;
  const prev = s as SnakeRun;
  const before = (prev.kind === "spin" ? prev.spin.draft : prev.draft).picks.length;
  const last = draft.picks[before];
  return last ? { itemId: last.itemId, role: last.role } : null;
}
