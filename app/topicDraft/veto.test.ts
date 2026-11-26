import { describe, expect, it } from "vitest";
import { applyAction, currentTurn, initGame, isDone, type GameState, type SnakeRun } from "./core";
import { DEFAULT_OPTS, type FormatId, type GameSetup } from "../play/types";
import { missionsFor } from "./missions";
import { LOADOUT_PRESETS } from "./formats/loadout";
import * as L from "./formats/loadout";
import * as A from "./formats/auction";
import * as K from "./formats/keep";
import { VETO_MS, vetoOf } from "./veto";

const players = ["Ann", "Bob", "Cy"];
function setupFor(format: FormatId, veto = 1, extra: Partial<GameSetup["opts"]> = {}): GameSetup {
  const pool = "superheroes";
  return {
    id: "t", format, pool, players, aiPlayers: [], mission: missionsFor(pool)[0]!, mystery: false,
    loadout: format === "loadout" ? LOADOUT_PRESETS[0]! : null, roles: [],
    opts: { ...DEFAULT_OPTS, teamSize: 2, timerSeconds: null, veto, ...extra }, seed: 42,
  };
}
const draftOf = (s: GameState) => { const r = s as SnakeRun; return r.kind === "spin" ? r.spin.draft : r.draft; };
const firstFree = (s: GameState) => { const d = draftOf(s); return d.pool.find((i) => !d.banned.includes(i.id) && !d.picks.some((p) => p.itemId === i.id))!.id; };

describe("veto: snake", () => {
  it("is off unless turned on, and only for the draft formats", () => {
    expect(vetoOf(initGame(setupFor("snake", 0), 0))).toBeUndefined();
    expect(vetoOf(initGame(setupFor("blind", 2), 0))).toBeUndefined();
    expect(vetoOf(initGame(setupFor("snake", 2), 0))!.left).toEqual({ Ann: 2, Bob: 2, Cy: 2 });
    expect(vetoOf(initGame({ ...setupFor("snake", 2), aiPlayers: ["Bob", "Cy"] }, 0))!.left).toEqual({ Ann: 2, Bob: 0, Cy: 0 });
  });

  it("a pick opens a window that holds the draft; a veto sends the item out and the picker picks again", () => {
    const setup = setupFor("snake");
    let s = initGame(setup, 0);
    const first = currentTurn(setup, s)!;
    const item = firstFree(s);
    s = applyAction(setup, s, { type: "pick", by: first, itemId: item }, 1000);
    expect(vetoOf(s)!.open).toMatchObject({ picker: first, itemId: item, until: 1000 + VETO_MS });
    expect(currentTurn(setup, s)).toBeNull();
    const second = players.find((p) => p !== first)!;
    expect(applyAction(setup, s, { type: "pick", by: second, itemId: firstFree(s) }, 2000)).toBe(s);
    expect(applyAction(setup, s, { type: "veto", by: first }, 2000)).toBe(s); // not your own pick
    s = applyAction(setup, s, { type: "veto", by: second }, 2000);
    expect(draftOf(s).picks).toHaveLength(0);
    expect(draftOf(s).banned).toContain(item);
    expect(vetoOf(s)!.left[second]).toBe(0);
    expect(currentTurn(setup, s)).toBe(first);
    expect(draftOf(applyAction(setup, s, { type: "pick", by: first, itemId: item }, 2100)).picks).toHaveLength(0); // gone for good
    // The re-pick can't be vetoed.
    s = applyAction(setup, s, { type: "pick", by: first, itemId: firstFree(s) }, 2200);
    expect(vetoOf(s)!.open).toBeUndefined();
    expect(currentTurn(setup, s)).not.toBe(first);
  });

  it("the window closes on its own and the draft moves on", () => {
    const setup = setupFor("snake");
    let s = initGame(setup, 0);
    const first = currentTurn(setup, s)!;
    s = applyAction(setup, s, { type: "pick", by: first, itemId: firstFree(s) }, 0);
    expect(applyAction(setup, s, { type: "tick" }, VETO_MS - 1)).toBe(s);
    s = applyAction(setup, s, { type: "tick" }, VETO_MS);
    expect(vetoOf(s)!.open).toBeUndefined();
    expect(currentTurn(setup, s)).not.toBe(first);
    expect(applyAction(setup, s, { type: "veto", by: players.find((p) => p !== first)! }, VETO_MS + 1)).toBe(s);
  });

  it("no window once nobody else has a veto left, and the last pick waits before the draft ends", () => {
    const setup = setupFor("snake");
    let s = initGame(setup, 0);
    let now = 0;
    const vetoers: string[] = [];
    while (!isDone(setup, s) && now < 1e6) {
      now += VETO_MS;
      s = applyAction(setup, s, { type: "tick" }, now);
      const who = currentTurn(setup, s);
      if (!who) continue;
      s = applyAction(setup, s, { type: "pick", by: who, itemId: firstFree(s) }, now);
      const open = vetoOf(s)!.open;
      if (open) {
        const by = players.find((p) => p !== open.picker && vetoOf(s)!.left[p]! > 0)!;
        if (!vetoers.includes(by)) { s = applyAction(setup, s, { type: "veto", by }, now); vetoers.push(by); }
        else expect(isDone(setup, s)).toBe(false);
      }
    }
    expect(isDone(setup, s)).toBe(true);
    expect(vetoOf(s)!.log).toHaveLength(3);
    expect(draftOf(s).picks).toHaveLength(players.length * 2);
  });
});

describe("veto: against bots", () => {
  it("a human's pick opens no window when only bots are left to veto, and a bot's pick does", () => {
    const setup = { ...setupFor("snake"), aiPlayers: ["Bob", "Cy"] };
    let s = initGame(setup, 0);
    const seen = { human: false, bot: false };
    for (let now = 0; now < 20 * VETO_MS && !isDone(setup, s); now += VETO_MS) {
      s = applyAction(setup, s, { type: "tick" }, now);
      const who = currentTurn(setup, s);
      if (!who) continue;
      s = applyAction(setup, s, { type: "pick", by: who, itemId: firstFree(s) }, now);
      if (who === "Ann") { expect(vetoOf(s)!.open).toBeUndefined(); seen.human = true; }
      else { expect(vetoOf(s)!.open?.picker).toBe(who); seen.bot = true; }
    }
    expect(seen).toEqual({ human: true, bot: true });
  });
});

describe("veto: spin", () => {
  it("a vetoed pick gets the picker a fresh offer without the vetoed item", () => {
    const setup = setupFor("spin");
    let s = initGame(setup, 0) as SnakeRun & { kind: "spin" };
    const first = currentTurn(setup, s)!;
    const item = s.spin.offer[0]!;
    let n = applyAction(setup, s, { type: "pick", by: first, itemId: item }, 0) as typeof s;
    n = applyAction(setup, n, { type: "veto", by: players.find((p) => p !== first)! }, 1) as typeof s;
    expect(n.spin.offer.length).toBeGreaterThan(0);
    expect(n.spin.offer).not.toContain(item);
    expect(currentTurn(setup, n)).toBe(first);
  });
});

describe("veto: loadout", () => {
  it("a vetoed buy refunds, frees the slot and the item never comes back", () => {
    const setup = setupFor("loadout");
    let s = initGame(setup, 0) as L.LoadoutState;
    const first = currentTurn(setup, s)!;
    const slot = s.mission.slots[0]!;
    const item = L.poolItems(slot.pool).find((i) => L.validate(s, slot.id, i.id).ok)!;
    s = applyAction(setup, s, { type: "buy", by: first, slotId: slot.id, itemId: item.id }, 0) as L.LoadoutState;
    expect(s.spent[first]).toBeGreaterThan(0);
    s = applyAction(setup, s, { type: "veto", by: players.find((p) => p !== first)! }, 1) as L.LoadoutState;
    expect(s.picks[first]![slot.id]).toBeUndefined();
    expect(s.spent[first]).toBe(0);
    expect(currentTurn(setup, s)).toBe(first);
    expect(L.validate(s, slot.id, item.id).ok).toBe(false);
  });
});

describe("veto: auction", () => {
  it("a vetoed sale is refunded, the item is gone, and the next lot doesn't wait", () => {
    const setup = setupFor("auction");
    let s = initGame(setup, 0) as A.AuctionState;
    const opener = A.opener(s)!;
    s = applyAction(setup, s, { type: "bid", by: opener, amount: 3 }, 0) as A.AuctionState;
    const sold = s.queue[s.index]!;
    s = applyAction(setup, s, { type: "tick" }, 10 ** 6) as A.AuctionState;
    expect(s.rosters[opener]).toEqual([{ itemId: sold, price: 3 }]);
    expect(vetoOf(s)!.open).toMatchObject({ picker: opener, itemId: sold });
    const other = players.find((p) => p !== opener)!;
    // Bidding on the next lot goes on during the window.
    const nextOpener = A.opener(s)!;
    const bid = applyAction(setup, s, { type: "bid", by: nextOpener, amount: 1 }, 10 ** 6 + 1);
    expect(bid).not.toBe(s);
    s = applyAction(setup, bid, { type: "veto", by: other }, 10 ** 6 + 2) as A.AuctionState;
    expect(s.rosters[opener]).toEqual([]);
    expect(s.budgets[opener]).toBe(s.budget);
  });
});

describe("veto: keep", () => {
  it("a vetoed keep becomes a delete for that player", () => {
    const setup = setupFor("keep");
    let s = initGame(setup, 0) as K.KeepState;
    const first = currentTurn(setup, s)!;
    const item = K.currentItemId(s)!;
    s = applyAction(setup, s, { type: "answer", by: first, choice: "keep" }, 0) as K.KeepState;
    expect(currentTurn(setup, s)).not.toBe(first); // the stream doesn't wait
    s = applyAction(setup, s, { type: "veto", by: players.find((p) => p !== first)! }, 1) as K.KeepState;
    expect(s.keeps[first]).toEqual([]);
    expect(s.deleted[first]).toEqual([item]);
  });
});
