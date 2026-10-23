import { describe, it, expect, beforeEach } from "vitest";
import { _rooms, act, createRoom, getRoom, joinRoom, leaveRoom, sanitizeSetup, seatFor, snapshot, startRoom, tickRooms } from "./playRooms";
import { DEFAULT_OPTS } from "../shared/play/types";
import { LOADOUT_PRESETS } from "../shared/topicDraft/formats/loadout";
import { currentTurn } from "../shared/topicDraft/core";
import * as A from "../shared/topicDraft/formats/auction";
import * as P from "../shared/topicDraft/formats/position";

const base = (format: string, extra: any = {}) => ({
  format, pool: "superheroes",
  mission: { id: "m", title: "Alien", blurb: "", weights: { power: 1, intellect: 1 } },
  opts: { ...DEFAULT_OPTS, teamSize: 3, timerSeconds: null, rankSize: 5, ...(extra.opts ?? {}) },
  roles: [{ id: "a", label: "A", weights: { power: 1 } }, { id: "b", label: "B", weights: { intellect: 1 } }],
  loadout: format === "loadout" ? LOADOUT_PRESETS[0] : null,
  ...extra.top,
});

function room(format = "snake", names = ["Ann", "Bob"], extra: any = {}) {
  const c = createRoom(base(format, extra), names[0]!) as any;
  const tokens: Record<string, string> = { [names[0]!]: c.seat.token };
  for (const n of names.slice(1)) tokens[n] = (joinRoom(c.room.code, n) as any).seat.token;
  return { r: c.room, tokens };
}

beforeEach(() => _rooms.clear());

describe("sanitizeSetup", () => {
  it("accepts a normal setup and clamps wild numbers", () => {
    const s = sanitizeSetup(base("auction", { opts: { teamSize: 999, budget: -5, lotSeconds: 1e9 } }))!;
    expect(s.opts.teamSize).toBe(9);
    expect(s.opts.budget).toBe(10);
    expect(s.opts.lotSeconds).toBe(30);
  });
  it("rejects unknown formats, pools and empty missions", () => {
    expect(sanitizeSetup({ ...base("snake"), format: "hack" })).toBeNull();
    expect(sanitizeSetup({ ...base("snake"), pool: "weapons" })).toBeNull();
    expect(sanitizeSetup({ ...base("snake"), mission: { title: "x", weights: {} } })).toBeNull();
    expect(sanitizeSetup(null)).toBeNull();
  });
  it("strips markup and drops over-budget custom characters", () => {
    const keys = ["power", "intellect", "speed", "durability", "combat", "teamwork"];
    const fair = Object.fromEntries(keys.map((k) => [k, 60]));
    const cheat = Object.fromEntries(keys.map((k) => [k, 100]));
    const s = sanitizeSetup(base("snake", { opts: { customItems: [{ name: "<b>Hero</b>", stats: fair }, { name: "Cheater", stats: cheat }] } }))!;
    expect(s.opts.customItems.map((i) => i.name)).toEqual([" b Hero /b "].map((x) => x.trim()));
  });
  it("validates loadout slots against real pools", () => {
    expect(sanitizeSetup(base("loadout", { top: { loadout: { ...LOADOUT_PRESETS[0], slots: [{ id: "x", label: "x", pool: "nope", priceStat: "z", scoreWeights: {} }] } } }))).toBeNull();
    expect(sanitizeSetup(base("loadout"))).not.toBeNull();
  });
});

describe("lobby", () => {
  it("creates, joins, rejects duplicates and full rooms, and only the host starts", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob"]);
    expect((joinRoom(r.code, "bob") as any).error).toBe("That name is taken");
    expect(startRoom(r, tokens.Bob)).toEqual({ error: "Only the host can start" });
    expect(startRoom(r, tokens.Ann)).toEqual({ ok: true });
    expect((joinRoom(r.code, "Cy") as any).error).toBe("That game already started");
    const full = createRoom(base("snake"), "H") as any;
    for (let i = 0; i < 5; i++) joinRoom(full.room.code, `P${i}`);
    expect((joinRoom(full.room.code, "Late") as any).error).toBe("Room is full");
  });
  it("needs two players and the host leaving a lobby closes it", () => {
    const c = createRoom(base("snake"), "Solo") as any;
    expect(startRoom(c.room, c.seat.token)).toEqual({ error: "Need at least 2 players" });
    leaveRoom(c.room, c.seat.token);
    expect(getRoom(c.room.code)).toBeUndefined();
  });
});

describe("playing", () => {
  it("enforces turns and ignores a spoofed `by`", () => {
    const { r, tokens } = room("snake");
    startRoom(r, tokens.Ann);
    const who = currentTurn(r.setup, r.state!)!;
    const other = who === "Ann" ? "Bob" : "Ann";
    expect(act(r, tokens[other], { type: "auto", by: who }).ok).toBe(false); // spoof attempt
    expect(act(r, tokens[who], { type: "auto", by: other }).ok).toBe(true); // `by` is overridden by the seat
    expect(act(r, "bad-token", { type: "auto" }).ok).toBe(false);
    expect(act(r, tokens[who], { type: "explode" }).ok).toBe(false);
  });

  it("a full snake game finishes, produces a verdict and bumps the version", async () => {
    const { r, tokens } = room("snake");
    startRoom(r, tokens.Ann);
    let v = r.version;
    let guard = 0;
    while (r.status === "playing" && guard++ < 50) act(r, tokens[currentTurn(r.setup, r.state!)!], { type: "auto" });
    expect(r.status).toBe("done");
    expect(r.version).toBeGreaterThan(v);
    await new Promise((res) => setTimeout(res, 50));
    expect(snapshot(r, tokens.Ann).verdict?.teams.length).toBe(2);
  });

  it("hides opponents' hands in Positions until the end", () => {
    const { r, tokens } = room("position");
    startRoom(r, tokens.Ann);
    const snap = snapshot(r, tokens.Ann).state as P.PositionState;
    expect(snap.hands.Ann!.every((id) => id !== "?")).toBe(true);
    expect(snap.hands.Bob!.every((id) => id === "?")).toBe(true);
    expect(snap.unused).toEqual([]);
  });

  it("auction: opener rotates, clients can't tick or set the clock, server ticks expire lots", () => {
    const { r, tokens } = room("auction");
    startRoom(r, tokens.Ann);
    const a0 = r.state as A.AuctionState;
    const o = A.opener(a0)!;
    const other = o === "Ann" ? "Bob" : "Ann";
    expect(act(r, tokens[other], { type: "bid", amount: 1 }).ok).toBe(false);
    expect(act(r, tokens[o], { type: "tick" }).ok).toBe(false); // not a client action
    expect(act(r, tokens[o], { type: "bid", amount: 2 }).ok).toBe(true);
    expect(act(r, tokens[other], { type: "pass" }).ok).toBe(true); // opponent steps aside -> sold
    expect((r.state as A.AuctionState).rosters[o]!.length).toBe(1);
    // nobody opens the next lot: each expired opening turn counts as a pass, then it goes unsold
    let t = Date.now();
    for (let i = 0; i < 4; i++) tickRooms((t += 60_000));
    expect((r.state as A.AuctionState).index).toBeGreaterThan(1);
  });

  it("a player who leaves is auto-played so the game still ends", () => {
    for (const f of ["snake", "loadout", "position", "blind", "auction"]) {
      _rooms.clear();
      const { r, tokens } = room(f);
      startRoom(r, tokens.Ann);
      leaveRoom(r, tokens.Bob);
      let guard = 0;
      let t = Date.now();
      while (r.status === "playing" && guard++ < 800) {
        const s = r.state!;
        const who = currentTurn(r.setup, s);
        if (f === "position") {
          act(r, tokens.Ann, { type: "autoAssign" });
          act(r, tokens.Ann, { type: "lock" });
        } else if (f === "blind") {
          if (who === "Ann") act(r, tokens.Ann, { type: "place", rank: (s as any).ranks.Ann.findIndex((x: any) => x == null) });
        } else if (f === "auction") {
          const a = s as A.AuctionState;
          if (A.opener(a) === "Ann") act(r, tokens.Ann, { type: "pass" });
          else if (a.bid.by == null) { /* wait for Bob's bot pass */ }
        } else if (who === "Ann") act(r, tokens.Ann, { type: "auto" });
        t += 1000;
        tickRooms(t);
      }
      expect(r.status, f).toBe("done");
    }
  });

  it("an AFK player on a turn timer is auto-picked", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob"], { opts: { timerSeconds: 10 } });
    startRoom(r, tokens.Ann);
    const who = currentTurn(r.setup, r.state!)!;
    const picks = () => (r.state as any).draft.picks.length;
    expect(picks()).toBe(0);
    tickRooms(Date.now() + 30_000);
    expect(picks()).toBe(1);
    expect(currentTurn(r.setup, r.state!)).not.toBe(who);
  });

  it("snapshot never leaks other seats' tokens", () => {
    const { r, tokens } = room("snake");
    const json = JSON.stringify(snapshot(r, tokens.Ann));
    expect(json).not.toContain(tokens.Ann!);
    expect(json).not.toContain(tokens.Bob!);
    expect(seatFor(r, tokens.Bob)?.name).toBe("Bob");
  });
});
