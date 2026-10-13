import { describe, it, expect } from "vitest";
import { applyAction, buildTeams, currentTurn, initGame, isDone, timeoutAction, type Action, type GameState } from "./core";
import { DEFAULT_OPTS, type FormatId, type GameSetup } from "../play/types";
import { missionsFor, metricsFor } from "./missions";
import { LOADOUT_PRESETS } from "./formats/loadout";
import { rolesFor } from "./formats/position";
import * as P from "./formats/position";
import * as B from "./formats/blind";
import * as A from "./formats/auction";

function setupFor(format: FormatId, players = ["Ann", "Bob"], extra: Partial<GameSetup["opts"]> = {}): GameSetup {
  const pool = "superheroes";
  const mission = format === "blind" ? metricsFor(pool)[0]! : missionsFor(pool)[0]!;
  return {
    id: "t", format, pool, players, aiPlayers: [], mission, mystery: false,
    loadout: format === "loadout" ? LOADOUT_PRESETS[0]! : null, roles: rolesFor(pool),
    opts: { ...DEFAULT_OPTS, teamSize: 3, timerSeconds: null, rankSize: 5, ...extra }, seed: 42,
  };
}

/** Play a whole game with simple bots, only ever using public actions. */
function play(setup: GameSetup): GameState {
  let s = initGame(setup, 0);
  let now = 0;
  let guard = 0;
  while (!isDone(setup, s) && guard++ < 600) {
    now += 400;
    const who = currentTurn(setup, s);
    if (setup.format === "position") {
      for (const p of setup.players) {
        s = applyAction(setup, s, { type: "autoAssign", by: p }, now);
        s = applyAction(setup, s, { type: "lock", by: p }, now);
      }
    } else if (setup.format === "blind") {
      const b = s as B.BlindState;
      s = applyAction(setup, s, { type: "place", by: who!, rank: B.freeRanks(b, who!)[0]! }, now);
    } else if (setup.format === "auction") {
      const a = s as A.AuctionState;
      if (a.nominate?.offer) {
        s = applyAction(setup, s, { type: "nominate", by: A.nominator(a)!, itemId: a.nominate.offer[0]! }, now);
        continue;
      }
      const o = A.opener(a)!;
      s = applyAction(setup, s, Math.random() < 0.5 ? { type: "bid", by: o, amount: 1 } : { type: "pass", by: o }, now);
      s = applyAction(setup, s, { type: "tick" }, a.deadline ?? now + 99999);
    } else {
      s = applyAction(setup, s, { type: "auto", by: who! }, now);
    }
  }
  return s;
}

describe("game core", () => {
  it.each(["snake", "spin", "auction", "loadout", "position", "blind"] as FormatId[])("%s plays to completion and builds teams", (format) => {
    const setup = setupFor(format);
    const s = play(setup);
    expect(isDone(setup, s)).toBe(true);
    const { teams } = buildTeams(setup, s);
    expect(teams.map((t) => t.player)).toEqual(setup.players);
    for (const t of teams) {
      expect(t.items.length).toBeGreaterThan(0);
      expect(t.baseline).toBeGreaterThanOrEqual(0);
      expect(t.baseline).toBeLessThanOrEqual(100);
    }
  });

  it("random roll Classic and roll Loadout also complete", () => {
    for (const [f, o] of [["snake", { roll: true }], ["loadout", { roll: true, options: 3, rerolls: 0 }], ["position", { roll: true, options: 3, rerolls: 1 }], ["auction", { roll: true, options: 3 }], ["blind", { roll: true }]] as const) {
      const setup = setupFor(f, ["Ann", "Bob"], o);
      expect(isDone(setup, play(setup))).toBe(true);
    }
  });

  it("only the player on the clock can act in turn-based formats", () => {
    for (const f of ["snake", "spin", "loadout"] as FormatId[]) {
      const setup = setupFor(f);
      const s = initGame(setup, 0);
      const who = currentTurn(setup, s)!;
      const other = setup.players.find((p) => p !== who)!;
      expect(applyAction(setup, s, { type: "auto", by: other }, 1)).toBe(s);
      expect(applyAction(setup, s, { type: "auto", by: who }, 1)).not.toBe(s);
    }
    const blind = setupFor("blind");
    const bs = initGame(blind, 0);
    const wrong = currentTurn(blind, bs) === "Ann" ? "Bob" : "Ann";
    expect(applyAction(blind, bs, { type: "place", by: wrong, rank: 0 }, 1)).toBe(bs);
  });

  it("rejects actions from names that are not seated", () => {
    const setup = setupFor("snake");
    const s = initGame(setup, 0);
    expect(applyAction(setup, s, { type: "auto", by: "Mallory" }, 1)).toBe(s);
  });

  it("positions: you can only edit your own lineup", () => {
    const setup = setupFor("position");
    let s = initGame(setup, 0) as P.PositionState;
    const bobCard = s.hands.Bob![0]!;
    const hacked = applyAction(setup, s, { type: "assign", by: "Ann", roleId: s.roles[0]!.id, itemId: bobCard } as Action, 1) as P.PositionState;
    expect(hacked.assign.Ann).toEqual({}); // card not in Ann's hand
  });

  it("timeoutAction auto-plays the player on the clock, auctions need none", () => {
    const setup = setupFor("snake");
    const s = initGame(setup, 0);
    expect(timeoutAction(setup, s)).toEqual({ type: "auto", by: currentTurn(setup, s)! });
    expect(timeoutAction(setupFor("auction"), initGame(setupFor("auction"), 0))).toBeNull();
  });

  it("state survives a JSON round trip (server persistence / resume)", () => {
    for (const f of ["snake", "spin", "auction", "loadout", "position", "blind"] as FormatId[]) {
      const setup = setupFor(f);
      const s = play(setup);
      const again = JSON.parse(JSON.stringify(s));
      expect(buildTeams(setup, again).teams).toEqual(buildTeams(setup, s).teams);
    }
  });
});
