import { describe, it, expect, beforeEach } from "vitest";
import { _rooms, act, backToLobby, createRoom, getRoom, joinRoom, leaveRoom, needsQuiz, sanitizeSetup, seatFor, setGame, setStatLink, snapshot, startRoom, tickRooms } from "./playRooms";
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
    expect((joinRoom(r.code, "Cy") as any).error).toBe("A game is running. You can join when it ends.");
    const full = createRoom(base("snake"), "H") as any;
    for (let i = 0; i < 5; i++) joinRoom(full.room.code, `P${i}`);
    expect((joinRoom(full.room.code, "Late") as any).error).toMatch(/^Room is full/);
  });
  it("needs two players and the last player leaving closes it", () => {
    const c = createRoom(base("snake"), "Solo") as any;
    expect(startRoom(c.room, c.seat.token)).toEqual({ error: "Need at least 2 players" });
    leaveRoom(c.room, c.seat.token);
    expect(getRoom(c.room.code)).toBeUndefined();
  });
});

describe("a room that outlives its games", () => {
  /** Plays a snake draft to the end with `auto` picks. */
  const finish = (r: any, tokens: Record<string, string>) => {
    let guard = 0;
    while (r.status === "playing" && guard++ < 200) {
      const who = currentTurn(r.setup, r.state);
      act(r, tokens[who!], { type: "auto" });
    }
  };

  it("opens empty, and the host picks a game before anyone can start", () => {
    const c = createRoom(null, "Ann") as any;
    const bob = (joinRoom(c.room.code, "Bob") as any).seat.token;
    expect(c.room.setup).toBeNull();
    expect(startRoom(c.room, c.seat.token)).toEqual({ error: "Pick a game first" });
    expect(setGame(c.room, bob, base("snake"))).toEqual({ error: "Only the host can pick the game" });
    expect(setGame(c.room, c.seat.token, base("snake"))).toEqual({ ok: true });
    expect(c.room.setup.players).toEqual(["Ann", "Bob"]);
    expect(startRoom(c.room, c.seat.token)).toEqual({ ok: true });
  });

  it("keeps everyone seated after a game and lets the host switch games", () => {
    const { r, tokens } = room("snake");
    startRoom(r, tokens.Ann);
    expect(setGame(r, tokens.Ann, base("spin"))).toEqual({ error: "Finish this game first" });
    finish(r, tokens);
    expect(r.status).toBe("done");
    expect(r.played).toHaveLength(1);
    // A friend can drop in between games; the room heads back to the lobby with them in it.
    const cy = (joinRoom(r.code, "Cy") as any).seat.token;
    expect(r.status).toBe("lobby");
    expect(seatFor(r, cy)?.name).toBe("Cy");
    expect(setGame(r, tokens.Ann, base("blind"))).toEqual({ ok: true });
    expect(r.setup!.format).toBe("blind");
    expect(startRoom(r, tokens.Ann)).toEqual({ ok: true });
    expect(r.setup!.players).toEqual(["Ann", "Bob", "Cy"]);
  });

  it("goes back to the lobby only when the host says, and drops players who left mid-game", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob", "Cy"]);
    startRoom(r, tokens.Ann);
    leaveRoom(r, tokens.Cy);
    expect(backToLobby(r, tokens.Ann)).toEqual({ error: "The game is still running" });
    let guard = 0;
    while (r.status === "playing" && guard++ < 200) { tickRooms(); const who = currentTurn(r.setup!, r.state!); if (who && who !== "Cy") act(r, tokens[who]!, { type: "auto" }); }
    expect(backToLobby(r, tokens.Bob)).toEqual({ error: "Only the host can do that" });
    expect(backToLobby(r, tokens.Ann)).toEqual({ ok: true });
    expect(r.seats.map((s) => s.name)).toEqual(["Ann", "Bob"]);
    expect(r.state).toBeNull();
    expect(startRoom(r, tokens.Ann)).toEqual({ ok: true }); // same game again
  });

  it("hands the room to the next player when the host leaves, and closes it when the last one goes", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob"]);
    leaveRoom(r, tokens.Ann);
    expect(getRoom(r.code)).toBeDefined();
    expect(snapshot(r, tokens.Bob).seats[0]).toMatchObject({ name: "Bob", host: true });
    leaveRoom(r, tokens.Bob);
    expect(getRoom(r.code)).toBeUndefined();
  });

  it("trivia rematches ask for a new board", () => {
    const quiz = { surveys: [{ q: "Q", answers: [{ text: "a", points: 50 }] }] } as any;
    const c = createRoom({ ...base("feud"), pool: "superheroes" }, "Ann", quiz) as any;
    expect(needsQuiz(c.room)).toBe(false);
    joinRoom(c.room.code, "Bob");
    startRoom(c.room, c.seat.token);
    expect(needsQuiz(c.room)).toBe(true);
  });

  it("points the group at a stat draft room", () => {
    const { r, tokens } = room("snake");
    expect(setStatLink(r, tokens.Bob, { code: "ABC123", league: "NBA" })).toEqual({ error: "Only the host can do that" });
    expect(setStatLink(r, tokens.Ann, { code: "x", league: "NBA" })).toEqual({ error: "Invalid room" });
    expect(setStatLink(r, tokens.Ann, { code: "abc123", league: "NFL" })).toEqual({ ok: true });
    expect(snapshot(r, tokens.Bob).statLink).toEqual({ code: "ABC123", league: "NFL" });
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
        const who = currentTurn(r.setup!, s);
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

describe("party rooms", () => {
  const party = (format: "imposter" | "vote", pool: string) => ({ format, pool, opts: { teamSize: format === "imposter" ? 1 : 3, ending: "vote" } });

  it("takes up to 12 players, needs 3 for Imposter, and hides the secret from the imposter", () => {
    const made = createRoom(party("imposter", "superheroes"), "Ann") as any;
    expect(made.room).toBeDefined();
    const tokens: Record<string, string> = { Ann: made.seat.token };
    const b = joinRoom(made.room.code, "Bob") as any;
    tokens.Bob = b.seat.token;
    expect(startRoom(made.room, tokens.Ann)).toEqual({ error: "Need at least 3 players" });
    for (let i = 0; i < 10; i++) joinRoom(made.room.code, `P${i}`);
    expect((joinRoom(made.room.code, "Late") as any).error).toMatch(/^Room is full/);
    expect(startRoom(made.room, tokens.Ann)).toEqual({ ok: true });
    const st = made.room.state;
    const imposterToken = made.room.seats.find((x: any) => x.name === st.imposter).token;
    const crewToken = made.room.seats.find((x: any) => x.name !== st.imposter).token;
    expect(snapshot(made.room, imposterToken).state.secret).toBe("");
    expect(snapshot(made.room, crewToken).state.imposter).toBe("");
    expect(snapshot(made.room, crewToken).state.secret).toBe(st.secret);
  });

  it("a 12th player can join an empty room, a 13th cannot, and a vote game needs 3 players", () => {
    const empty = createRoom(null, "H0") as any;
    for (let i = 1; i < 12; i++) expect((joinRoom(empty.room.code, `H${i}`) as any).error).toBeUndefined();
    expect((joinRoom(empty.room.code, "H12") as any).error).toMatch(/^Room is full/);
    const made = createRoom(party("vote", "icks"), "Ann") as any;
    joinRoom(made.room.code, "Bob");
    expect(startRoom(made.room, made.seat.token)).toEqual({ error: "Need at least 3 players" });
  });

  it("keeps drinking off unless asked and cleans team settings", () => {
    const off = createRoom(party("vote", "icks"), "Ann") as any;
    expect(off.room.setup.opts).toMatchObject({ drinking: false, showVotes: true, teams: 0, teamMap: {} });
    const on = createRoom({ ...party("vote", "icks"), opts: { teamSize: 3, drinking: true, showVotes: false, teams: 2, teamMap: { Ann: 1, Bob: 5, Cy: "x" } } }, "Ann") as any;
    expect(on.room.setup.opts).toMatchObject({ drinking: true, showVotes: false, teams: 2, teamMap: { Ann: 1 } });
  });

  it("rejects unknown decks and runs a vote game to the end", () => {
    expect(createRoom(party("vote", "nope"), "Ann")).toEqual({ error: "Invalid game setup" });
    const made = createRoom(party("vote", "icks"), "Ann") as any;
    const b = joinRoom(made.room.code, "Bob") as any;
    const c = joinRoom(made.room.code, "Cy") as any;
    expect(startRoom(made.room, made.seat.token)).toEqual({ ok: true });
    for (let round = 0; round < 3; round++) {
      for (const tok of [made.seat.token, b.seat.token, c.seat.token]) expect(act(made.room, tok, { type: "vote", side: "a" }).ok).toBe(true);
      expect(made.room.state.phase).toBe("guess");
      for (const [tok, me] of [[made.seat.token, "Ann"], [b.seat.token, "Bob"], [c.seat.token, "Cy"]] as const)
        for (const t of ["Ann", "Bob", "Cy"].filter((x) => x !== me)) expect(act(made.room, tok, { type: "guessVote", target: t, side: "a" }).ok).toBe(true);
      act(made.room, made.seat.token, { type: "next" });
    }
    expect(made.room.status).toBe("done");
    expect(made.room.state.points).toEqual({ Ann: 6, Bob: 6, Cy: 6 }); // two right guesses a card
  });

  it("Show votes off never sends other players' votes or guesses, even after the game ends", () => {
    const made = createRoom({ ...party("vote", "icks"), opts: { teamSize: 3, showVotes: false, drinking: true } }, "Ann") as any;
    const toks: Record<string, string> = { Ann: made.seat.token, Bob: (joinRoom(made.room.code, "Bob") as any).seat.token, Cy: (joinRoom(made.room.code, "Cy") as any).seat.token };
    expect(startRoom(made.room, toks.Ann)).toEqual({ ok: true });
    const names = Object.keys(toks);
    const sides: Record<string, string> = { Ann: "a", Bob: "b", Cy: "b" };
    // Only seat A's own entries may ever reach A.
    const check = (phase: string) => {
      const st = snapshot(made.room, toks.Ann).state;
      expect(st.phase).toBe(phase);
      const others = ["Bob", "Cy"];
      for (const h of st.history) {
        expect(Object.keys(h.votes).filter((k) => others.includes(k))).toEqual([]);
        expect(Object.keys(h.guesses).filter((k) => others.includes(k))).toEqual([]);
        expect(Object.keys(h.gained).filter((k) => others.includes(k))).toEqual([]);
      }
      expect(Object.values(st.votes).filter((v) => v !== "?").length).toBeLessThanOrEqual(1);
      expect(Object.keys(st.guesses).filter((k) => others.includes(k))).toEqual([]);
    };
    for (let round = 0; round < 3; round++) {
      for (const n of names) act(made.room, toks[n], { type: "vote", side: sides[n] });
      check("guess");
      const st = snapshot(made.room, toks.Ann).state;
      expect(Object.keys(st.points)).toEqual(["Ann"]);
      for (const n of names) for (const t of names.filter((x) => x !== n)) act(made.room, toks[n], { type: "guessVote", target: t, side: sides[t] });
      check("reveal");
      const calls = snapshot(made.room, toks.Ann).state.drinks.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((c: any) => c.to === "all")).toBe(true);
      if (round < 2) expect(Object.keys(snapshot(made.room, toks.Ann).state.points)).toEqual(["Ann"]);
      act(made.room, toks.Ann, { type: "next" });
    }
    expect(made.room.status).toBe("done");
    const fin = snapshot(made.room, toks.Ann).state;
    expect(fin.history).toHaveLength(3);
    for (const h of fin.history) {
      expect(Object.keys(h.votes)).toEqual(["Ann"]);
      expect(Object.keys(h.guesses)).toEqual(["Ann"]);
    }
    expect(Object.keys(fin.votes).filter((k) => k !== "Ann")).toEqual([]);
    expect(Object.keys(fin.points).sort()).toEqual(["Ann", "Bob", "Cy"]);
  });

  it("does not send drink calls addressed to a seat that left", () => {
    const made = createRoom({ ...party("vote", "icks"), opts: { teamSize: 3, drinking: true } }, "Ann") as any;
    const toks: Record<string, string> = { Ann: made.seat.token, Bob: (joinRoom(made.room.code, "Bob") as any).seat.token, Cy: (joinRoom(made.room.code, "Cy") as any).seat.token, Di: (joinRoom(made.room.code, "Di") as any).seat.token };
    expect(startRoom(made.room, toks.Ann)).toEqual({ ok: true });
    const names = Object.keys(toks);
    const sides: Record<string, string> = { Ann: "a", Bob: "b", Cy: "a", Di: "a" };
    for (const n of names) act(made.room, toks[n], { type: "vote", side: sides[n] });
    // Everyone reads Bob wrong, so he gets a hand-out call; Cy reads nobody right and gets the worst read too.
    for (const n of names) for (const t of names.filter((x) => x !== n)) act(made.room, toks[n], { type: "guessVote", target: t, side: t === "Bob" ? "a" : n === "Cy" ? "b" : sides[t] });
    expect(made.room.state.phase).toBe("reveal");
    const toNames = (tok: string) => snapshot(made.room, tok).state.drinks.calls.map((c: any) => c.to);
    expect(toNames(toks.Ann)).toEqual(expect.arrayContaining(["Bob", "Cy"]));
    leaveRoom(made.room, toks.Bob);
    expect(snapshot(made.room, toks.Ann).seats.find((s: any) => s.name === "Bob").left).toBe(true);
    expect(toNames(toks.Ann)).not.toContain("Bob");
    expect(toNames(toks.Ann)).toContain("Cy");
    expect(made.room.state.drinks.calls.map((c: any) => c.to)).toContain("Bob"); // the room's own state is untouched
  });

  it("never sends the setup seed to a seat while a party game runs", () => {
    const cases: [any, string[]][] = [
      [{ format: "insync", pool: "music", opts: {} }, ["Ann", "Bob"]],
      [{ format: "imposter", pool: "superheroes", opts: { teamSize: 1 } }, ["Ann", "Bob", "Cy"]],
      [{ format: "vote", pool: "icks", opts: { teamSize: 3 } }, ["Ann", "Bob", "Cy"]],
    ];
    for (const [setup, names] of cases) {
      const made = createRoom(setup, names[0]!) as any;
      const toks: Record<string, string> = { [names[0]!]: made.seat.token };
      for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
      expect(startRoom(made.room, toks.Ann)).toEqual({ ok: true });
      expect(made.room.setup.seed).not.toBe(0);
      for (const n of names) {
        expect(snapshot(made.room, toks[n]).setup.seed, `${setup.format} ${n}`).toBe(0);
        expect(snapshot(made.room, toks[n]).setup.players).toEqual(names);
      }
      expect(snapshot(made.room, "bad token").setup.seed).toBe(0);
    }
  });

  describe("In-Sync", () => {
    const sync = (extra: any = {}) => ({ format: "insync", pool: "music", opts: { teamSize: 15, ...extra } });
    const seated = (names: string[], setup: any = sync()) => {
      const made = createRoom(setup, names[0]!) as any;
      const toks: Record<string, string> = { [names[0]!]: made.seat.token };
      for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
      return { room: made.room, toks };
    };

    it("rejects unknown decks, plays with 2 players and ignores the round count a client sends", () => {
      expect(createRoom({ ...sync(), pool: "nope" }, "Ann")).toEqual({ error: "Invalid game setup" });
      const { room, toks } = seated(["Ann", "Bob"]);
      expect(startRoom(room, toks.Ann)).toEqual({ ok: true });
      expect(room.state.pairs).toHaveLength(4);
    });

    it("sends the hidden target only to the clue giver until the reveal", () => {
      const { room, toks } = seated(["Ann", "Bob", "Cy"]);
      startRoom(room, toks.Ann);
      const giverName = room.state.players[room.state.giverAt % room.state.players.length];
      const guesser = ["Ann", "Bob", "Cy"].find((n) => n !== giverName)!;
      const hidden = room.state.target;
      expect(snapshot(room, toks[giverName]).state.target).toBe(hidden);
      expect(snapshot(room, toks[guesser]).state.target).toBe(-1);
      expect(snapshot(room, toks[guesser]).state.seed).toBe(0);
      expect(act(room, toks[giverName], { type: "clue", text: "Sunday morning" }).ok).toBe(true);
      expect(snapshot(room, toks[guesser]).state.target).toBe(-1);
      expect(snapshot(room, toks[guesser]).state.clue).toBe("Sunday morning");
      expect(JSON.stringify(snapshot(room, toks[guesser]).state)).not.toContain(`"target":${hidden}`);
      // Out-of-turn and garbage actions leave the room unchanged.
      expect(act(room, toks[giverName], { type: "move", pos: 10 }).ok).toBe(false);
      expect(act(room, toks[guesser], { type: "move", pos: "abc" }).ok).toBe(false);
      expect(act(room, toks[guesser], { type: "move", pos: NaN }).ok).toBe(false);
      expect(act(room, toks[guesser], { type: "move", pos: 9999 }).ok).toBe(true);
      expect(room.state.marker).toBe(100);
      expect(act(room, toks[guesser], { type: "clue", text: "sneaky" }).ok).toBe(false);
      for (const n of ["Ann", "Bob", "Cy"].filter((x) => x !== giverName)) act(room, toks[n], { type: "lock" });
      expect(room.state.phase).toBe("reveal");
      expect(snapshot(room, toks[guesser]).state.target).toBe(hidden);
    });

    it("ends with no winner, remembers the pairs and gives a rematch fresh ones", () => {
      const { room, toks } = seated(["Ann", "Bob"]);
      startRoom(room, toks.Ann);
      const names = ["Ann", "Bob"];
      for (let i = 0; i < 4; i++) {
        const g = room.state.players[room.state.giverAt % room.state.players.length];
        act(room, toks[g], { type: "clue", text: "hi" });
        act(room, toks[names.find((n) => n !== g)!], { type: "lock" });
        act(room, toks.Ann, { type: "next" });
      }
      expect(room.status).toBe("done");
      expect(room.played.at(-1)).toMatchObject({ format: "insync", pool: "music", winner: null });
      const first = room.state.pairs.map((p: any) => p.id);
      expect(room.seen).toEqual(expect.arrayContaining(first));
      expect(startRoom(room, toks.Ann)).toEqual({ ok: true });
      const again = room.state.pairs.map((p: any) => p.id);
      expect(again.filter((id: string) => first.includes(id))).toEqual([]);
    });

    it("a missing clue giver and gone guessers never hold the room up", () => {
      const { room, toks } = seated(["Ann", "Bob", "Cy"]);
      startRoom(room, toks.Ann);
      const start = room.state.phaseAt;
      tickRooms(start + 46_000);
      expect(room.state.round).toBe(1);
      expect(room.state.history[0].skipped).toBe(true);
      const g = room.state.players[room.state.giverAt % room.state.players.length];
      act(room, toks[g], { type: "clue", text: "late" });
      tickRooms(room.state.phaseAt + 61_000);
      expect(room.state.phase).toBe("reveal");
    });
  });
});

describe("party trivia room", () => {
  const cats = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff"].map((name) => ({
    name,
    clues: [0, 1, 2, 3].map((i) => ({ q: `${name} question number ${i}?`, right: `RIGHT-${name}-${i}`, wrong: [`no1-${name}-${i}`, `no2-${name}-${i}`, `no3-${name}-${i}`] })),
  }));
  const trivia = (extra: any = {}) => ({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10, ...extra } });
  const seated = (names: string[], opts: any = {}) => {
    const made = createRoom(trivia(opts), names[0]!, { categories: cats }) as any;
    const toks: Record<string, string> = { [names[0]!]: made.seat.token };
    for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
    return { room: made.room, toks };
  };

  it("accepts trivia topics only, snaps the question count, and starts with 2 players", () => {
    expect(createRoom({ ...trivia(), pool: "nope" }, "Ann")).toEqual({ error: "Invalid game setup" });
    expect(sanitizeSetup(trivia({ teamSize: 17 }))!.opts.teamSize).toBe(15);
    expect(sanitizeSetup(trivia({ teamSize: 999 }))!.opts.teamSize).toBe(20);
    expect(sanitizeSetup(trivia({ teamSize: "x" }))!.opts.teamSize).toBe(10);
    const { room, toks } = seated(["Ann"]);
    expect(startRoom(room, toks.Ann)).toEqual({ error: "Need at least 2 players" });
    joinRoom(room.code, "Bob");
    expect(startRoom(room, toks.Ann)).toEqual({ ok: true });
    expect(room.state.questions).toHaveLength(10);
  });

  it("never sends the answer, later questions, the bank or the seed while it runs, but keeps the team map", () => {
    const names = ["Ann", "Bob", "Cy", "Di"];
    const { room, toks } = seated(names, { teams: 2, teamMap: { Ann: 0, Bob: 0, Cy: 1, Di: 1 } });
    startRoom(room, toks.Ann);
    expect(room.setup.quiz.categories).toHaveLength(6); // the room's own copy stays
    expect(room.state.teams).toEqual([["Ann", "Bob"], ["Cy", "Di"]]);
    const first = room.state.questions[0];
    for (const n of names) {
      const snap = snapshot(room, toks[n]);
      const json = JSON.stringify(snap);
      expect(snap.setup.quiz, n).toBeUndefined();
      expect(snap.setup.seed).toBe(0);
      expect(snap.setup.opts.teamMap).toEqual({ Ann: 0, Bob: 0, Cy: 1, Di: 1 });
      expect(json.match(/RIGHT-/g)).toHaveLength(1); // only the option on screen; the bank and later answers are not sent
      expect(json).not.toContain('"answer"');
      for (const q of room.state.questions.slice(1)) expect(json).not.toContain(q.q);
      expect(json).toContain(first.q);
    }
    expect(JSON.stringify(snapshot(room, "bad token")).match(/RIGHT-/g)).toHaveLength(1);
    // Teammates see each other's pick, the other team does not.
    expect(act(room, toks.Ann, { type: "answer", choice: first.options[1] }).ok).toBe(true);
    expect(snapshot(room, toks.Bob).state.answers.Ann.choice).toBe(first.options[1]);
    expect(snapshot(room, toks.Cy).state.answers.Ann.choice).toBe("");
    // After the reveal the answer opens, and still no future question.
    for (const n of ["Bob", "Cy", "Di"]) act(room, toks[n], { type: "answer", choice: first.options[0] });
    const open = snapshot(room, toks.Cy);
    expect(open.state.phase).toBe("reveal");
    expect(open.state.questions[0].answer).toBe(first.answer);
    expect(JSON.stringify(open)).not.toContain(room.state.questions[1].q);
  });

  it("opens everything once the game is done", () => {
    const { room, toks } = seated(["Ann", "Bob"]);
    startRoom(room, toks.Ann);
    for (let i = 0; i < 10; i++) {
      tickRooms(room.state.phaseAt + 25_001);
      tickRooms(room.state.phaseAt + 7_001);
    }
    expect(room.status).toBe("done");
    const snap = snapshot(room, toks.Ann);
    expect(snap.state.questions).toHaveLength(10);
    expect(snap.state.questions[9].answer).toBeDefined();
    expect(room.played.at(-1)).toMatchObject({ format: "partytrivia", winner: null });
    expect(room.seen).toContain("cat:Aa");
  });

  it("takes the clock from the server, only for the seat's own name, and refuses garbage", () => {
    const { room, toks } = seated(["Ann", "Bob"]);
    startRoom(room, toks.Ann);
    const q = room.state.questions[0];
    expect(act(room, toks.Ann, { type: "answer", choice: "nope" }).ok).toBe(false);
    expect(act(room, toks.Ann, { type: "answer", choice: 5 }).ok).toBe(false);
    expect(act(room, "bad", { type: "answer", choice: q.options[0] }).ok).toBe(false);
    const before = Date.now();
    expect(act(room, toks.Ann, { type: "answer", choice: q.answer, by: "Bob", at: 1, now: 1 } as any).ok).toBe(true);
    expect(room.state.answers.Bob).toBeUndefined();
    expect(room.state.answers.Ann.at).toBeGreaterThanOrEqual(before);
    expect(act(room, toks.Ann, { type: "answer", choice: q.options[0] }).ok).toBe(false); // repeat
  });

  it("a player who left never holds up a question, and drinks stay off screen for them", () => {
    const { room, toks } = seated(["Ann", "Bob", "Cy"], { drinking: true });
    startRoom(room, toks.Ann);
    const q = room.state.questions[0];
    act(room, toks.Ann, { type: "answer", choice: q.options.find((o: string) => o !== q.answer) });
    act(room, toks.Bob, { type: "answer", choice: q.answer });
    leaveRoom(room, toks.Cy);
    tickRooms(room.state.phaseAt + 25_001);
    expect(room.state.phase).toBe("reveal");
    const calls = (t: string) => snapshot(room, t).state.drinks.calls.map((c: any) => c.to);
    expect(calls(toks.Ann)).toContain("Ann");
    expect(calls(toks.Ann)).not.toContain("Cy");
    expect(room.state.drinks.calls.map((c: any) => c.to)).toContain("Cy");
  });

  it("a rematch asks for a new bank", () => {
    const { room, toks } = seated(["Ann", "Bob"]);
    expect(needsQuiz(room)).toBe(false);
    startRoom(room, toks.Ann);
    expect(needsQuiz(room)).toBe(true);
  });
});
