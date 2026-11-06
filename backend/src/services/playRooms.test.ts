import { describe, it, expect, beforeEach } from "vitest";
import { _rooms, act, backToLobby, createRoom, getRoom, isHost, joinRoom, leaveRoom, needsQuiz, sanitizeSetup, seatFor, seenSeat, setGame, setStatLink, snapshot, startRoom, tickRooms } from "./playRooms";
import { DEFAULT_OPTS } from "../shared/play/types";
import { DECKS } from "../shared/topicDraft/party/decks";
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
    leaveRoom(room, toks.Cy); // the others already answered, so the question closes now
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

  it("closes a question as soon as every present seat has answered, whenever the leaver goes", () => {
    const { room, toks } = seated(["Ann", "Bob", "Cy"]);
    startRoom(room, toks.Ann);
    // The leaver goes before the others answer.
    leaveRoom(room, toks.Cy);
    expect(room.state.phase).toBe("question");
    act(room, toks.Ann, { type: "answer", choice: room.state.questions[0].options[0] });
    expect(room.state.phase).toBe("question");
    act(room, toks.Bob, { type: "answer", choice: room.state.questions[0].options[0] });
    expect(room.state.phase).toBe("reveal");
    tickRooms(room.state.phaseAt + 7_001);
    // Next question: the others answer, then the last unanswered player leaves.
    const { room: r2, toks: t2 } = seated(["Ann", "Bob", "Cy"]);
    startRoom(r2, t2.Ann);
    act(r2, t2.Ann, { type: "answer", choice: r2.state.questions[0].options[0] });
    act(r2, t2.Bob, { type: "answer", choice: r2.state.questions[0].options[0] });
    expect(r2.state.phase).toBe("question");
    leaveRoom(r2, t2.Cy);
    expect(r2.state.phase).toBe("reveal");
  });

  it("a player who left stays gone after a refused answer", () => {
    const { room, toks } = seated(["Ann", "Bob", "Cy"]);
    startRoom(room, toks.Ann);
    leaveRoom(room, toks.Cy);
    expect(act(room, toks.Cy, { type: "answer", choice: "not one of the options" }).ok).toBe(false);
    expect(room.seats.find((s: any) => s.name === "Cy").left).toBe(true);
  });

  it("a player who left and comes back can answer again, and is waited for", () => {
    const { room, toks } = seated(["Ann", "Bob", "Cy"]);
    startRoom(room, toks.Ann);
    leaveRoom(room, toks.Cy);
    expect(act(room, toks.Cy, { type: "answer", choice: room.state.questions[0].options[0] }).ok).toBe(true);
    expect(room.seats.find((s: any) => s.name === "Cy").left).toBe(false);
    act(room, toks.Ann, { type: "answer", choice: room.state.questions[0].options[0] });
    expect(room.state.phase).toBe("question"); // Bob is still to answer
    act(room, toks.Bob, { type: "answer", choice: room.state.questions[0].options[0] });
    expect(room.state.phase).toBe("reveal");
  });

  it("refuses to start with no questions rather than sticking in playing", () => {
    const made = createRoom(trivia(), "Ann", { categories: [{ name: "Thin", clues: [] }] }) as any;
    joinRoom(made.room.code, "Bob");
    expect(startRoom(made.room, made.seat.token)).toEqual({ error: "No questions are available for this topic right now" });
    expect(made.room.status).toBe("lobby");
    expect(made.room.state).toBeNull();
  });
});

describe("who hosts", () => {
  const hostIn = (r: any, token: string) => snapshot(r, token).seats.filter((s: any) => s.host).map((s: any) => s.name);
  const finishDraft = (r: any, tokens: Record<string, string>) => {
    let guard = 0;
    while (r.status === "playing" && guard++ < 200) {
      tickRooms();
      const who = currentTurn(r.setup!, r.state!);
      if (who && r.status === "playing" && !r.seats.find((s: any) => s.name === who).left) act(r, tokens[who]!, { type: "auto" });
    }
    expect(r.status).toBe("done");
  };

  it("passes to the next seat when the host leaves mid-game, and that seat can restart", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob", "Cy"]);
    startRoom(r, tokens.Ann);
    leaveRoom(r, tokens.Ann);
    expect(hostIn(r, tokens.Bob)).toEqual(["Bob"]);
    finishDraft(r, tokens);
    expect(hostIn(r, tokens.Bob)).toEqual(["Bob"]);
    expect(startRoom(r, tokens.Cy)).toEqual({ error: "Only the host can start" });
    expect(startRoom(r, tokens.Ann)).toEqual({ error: "Only the host can start" });
    expect(startRoom(r, tokens.Bob)).toEqual({ ok: true });
    expect(r.setup!.players).toEqual(["Bob", "Cy"]);
  });

  it("gives the next seat every host control after the game, and nobody else", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob", "Cy"]);
    startRoom(r, tokens.Ann);
    leaveRoom(r, tokens.Ann);
    finishDraft(r, tokens);
    const link = { code: "ABC123", league: "NBA" };
    expect(setStatLink(r, tokens.Cy, link)).toEqual({ error: "Only the host can do that" });
    expect(setStatLink(r, tokens.Ann, link)).toEqual({ error: "Only the host can do that" });
    expect(setStatLink(r, tokens.Bob, link)).toEqual({ ok: true });
    expect(setGame(r, tokens.Cy, base("snake"))).toEqual({ error: "Only the host can pick the game" });
    expect(backToLobby(r, tokens.Cy)).toEqual({ error: "Only the host can do that" });
    expect(backToLobby(r, tokens.Bob)).toEqual({ ok: true });
    expect(hostIn(r, tokens.Bob)).toEqual(["Bob"]);
    expect(setGame(r, tokens.Bob, base("snake"))).toEqual({ ok: true });
  });

  it("moves on down the line when the next seat leaves too", () => {
    const { r, tokens } = room("snake", ["Ann", "Bob", "Cy"]);
    startRoom(r, tokens.Ann);
    leaveRoom(r, tokens.Ann);
    leaveRoom(r, tokens.Bob);
    expect(hostIn(r, tokens.Cy)).toEqual(["Cy"]);
  });

  describe("in party trivia", () => {
    const cats = Array.from({ length: 4 }, (_, c) => ({ name: `Cat ${c}`, clues: Array.from({ length: 4 }, (_, i) => ({ q: `Q${c}-${i}`, right: `R${c}${i}`, wrong: [`W${c}${i}a`, `W${c}${i}b`, `W${c}${i}c`] })) }));
    const seated = (names: string[]) => {
      const made = createRoom({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10 } }, names[0]!, { categories: cats } as any) as any;
      const toks: Record<string, string> = { [names[0]!]: made.seat.token };
      for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
      return { r: made.room, toks };
    };
    const opt = (r: any) => r.state.questions[r.state.round].options[0];
    const finish = (r: any, toks: Record<string, string>, who: string) => {
      for (let guard = 0; r.status === "playing" && guard < 100; guard++) {
        if (r.state.phase === "question") act(r, toks[who]!, { type: "answer", choice: opt(r) });
        else act(r, toks[who]!, { type: "next" });
      }
      expect(r.status).toBe("done");
    };

    it("a host who comes back and acts again is host again, because host is only ever the first seat still here", () => {
      const { r, toks } = seated(["Ann", "Bob", "Cy"]);
      startRoom(r, toks.Ann);
      leaveRoom(r, toks.Ann);
      expect(hostIn(r, toks.Bob)).toEqual(["Bob"]);
      act(r, toks.Ann, { type: "answer", choice: opt(r) });
      expect(hostIn(r, toks.Bob)).toEqual(["Ann"]);
    });

    it("Play again with too few players left refuses and leaves the results where they are", () => {
      const { r, toks } = seated(["Ann", "Bob"]);
      startRoom(r, toks.Ann);
      leaveRoom(r, toks.Bob);
      finish(r, toks, "Ann");
      const board = r.state;
      expect(startRoom(r, toks.Ann)).toEqual({ error: "Need at least 2 players" });
      expect(r.status).toBe("done");
      expect(r.state).toBe(board);
      expect(r.seats.map((s: any) => s.name)).toEqual(["Ann", "Bob"]);
      expect(snapshot(r, toks.Ann).status).toBe("done");
    });

    it("Play again with no questions to ask refuses and leaves the results where they are", () => {
      const { r, toks } = seated(["Ann", "Bob"]);
      startRoom(r, toks.Ann);
      leaveRoom(r, toks.Bob); // only so one seat can finish the game quickly
      finish(r, toks, "Ann");
      r.seats.find((s: any) => s.name === "Bob").left = false;
      r.setup = { ...r.setup, pool: "nope", quiz: undefined };
      const board = r.state;
      expect(startRoom(r, toks.Ann)).toEqual({ error: "No questions are available for this topic right now" });
      expect(r.status).toBe("done");
      expect(r.state).toBe(board);
    });
  });
});

describe("Mafia room", () => {
  const NAMES = ["Zelda", "Xavier", "Quincy", "Wilma", "Yolanda", "Barnaby", "Cordelia"];
  const seated = (names: string[], opts: any = {}) => {
    const made = createRoom({ format: "mafia", pool: "mafia", opts }, names[0]!) as any;
    const toks: Record<string, string> = { [names[0]!]: made.seat.token };
    for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
    return { r: made.room, toks };
  };
  const started = (names = NAMES, opts: any = {}) => {
    const x = seated(names, opts);
    expect(startRoom(x.r, x.toks[names[0]!])).toEqual({ ok: true });
    return x;
  };
  /** Night, with every living player acting sensibly: mafia kill `kill` if given (or the first non-mafia), others tap. */
  const playNight = (r: any, toks: Record<string, string>, kill?: string) => {
    const s = r.state;
    const target = kill ?? s.alive.find((p: string) => s.roles[p] !== "mafia");
    const other = s.alive.find((p: string) => p !== target && s.roles[p] !== "mafia");
    for (const p of s.alive) {
      const role = s.roles[p];
      act(r, toks[p]!, { type: "nightAct", target: role === "mafia" ? target : role === "villager" ? "ok" : role === "doctor" ? other : s.alive.find((q: string) => q !== p) });
    }
  };

  it("takes a fixed pool only, needs no quiz, and starts from 5 players", () => {
    expect(sanitizeSetup({ format: "mafia", pool: "mafia" })).toMatchObject({ format: "mafia", pool: "mafia", mission: { title: "Mafia" } });
    expect(sanitizeSetup({ format: "mafia", pool: "superheroes" })).toBeNull();
    const { r, toks } = seated(NAMES.slice(0, 4));
    expect(needsQuiz(r)).toBe(false);
    expect(startRoom(r, toks.Zelda)).toEqual({ error: "Need at least 5 players" });
    joinRoom(r.code, "Yolanda");
    expect(startRoom(r, toks.Zelda)).toEqual({ ok: true });
    expect(r.state.phase).toBe("night");
  });

  it("refuses a player named exactly like the skip vote, who could otherwise never be voted out", () => {
    const { r, toks } = seated(["Zelda", "Xavier", "Quincy", "Wilma", "skip"]);
    expect(startRoom(r, toks.Zelda)).toEqual({ error: expect.stringContaining("skip") });
    expect(r.status).toBe("lobby");
  });

  it("skipTalk from a non-host returns an error, and the host's works", () => {
    const { r, toks } = started();
    playNight(r, toks);
    tickRooms(Date.now() + 8_001);
    expect(r.state.phase).toBe("talk");
    expect(act(r, toks.Xavier, { type: "skipTalk" })).toEqual({ ok: false, error: expect.any(String) });
    expect(r.state.phase).toBe("talk");
    expect(act(r, toks.Zelda, { type: "skipTalk" })).toEqual({ ok: true });
    expect(r.state.phase).toBe("vote");
  });

  it("a departed host doesn't strand the talk phase: the next seat can skip it, and the old host can't", () => {
    const { r, toks } = started();
    playNight(r, toks);
    tickRooms(Date.now() + 8_001);
    leaveRoom(r, toks.Zelda);
    expect(act(r, toks.Zelda, { type: "skipTalk" }).ok).toBe(false);
    expect(r.seats[0].left).toBe(true);
    expect(act(r, toks.Xavier, { type: "skipTalk" })).toEqual({ ok: true });
  });

  it("the seat decides who acts: a client can't act for someone else or set the clock", () => {
    const { r, toks } = started();
    const villager = r.state.alive.find((p: string) => r.state.roles[p] === "villager");
    expect(act(r, toks[villager]!, { type: "nightAct", target: "ok", by: "Someone", now: 0, at: 0 })).toEqual({ ok: true });
    expect(r.state.actions.done).toEqual([villager]);
    expect(r.state.phaseAt).toBeGreaterThan(0);
    expect(act(r, toks[villager]!, { type: "nightAct", target: "ok" }).ok).toBe(false);
    expect(act(r, "bad-token", { type: "nightAct", target: "ok" }).ok).toBe(false);
  });

  it("the dead can't act through the room", () => {
    const { r, toks } = started();
    playNight(r, toks);
    const dead = r.state.morning.died;
    expect(dead).toBeTruthy();
    tickRooms(Date.now() + 8_001);
    act(r, toks[r.seats.find((s: any) => !s.left).name]!, { type: "skipTalk" });
    expect(act(r, toks[dead]!, { type: "dayVote", target: "skip" }).ok).toBe(false);
    expect(r.state.votes).toEqual({});
  });

  it("snapshots carry no seed and no hidden choice, for every seat in every phase", () => {
    const { r, toks } = started();
    const raw = r.state;
    const mafia = NAMES.find((p) => raw.roles[p] === "mafia")!;
    const doctor = NAMES.find((p) => raw.roles[p] === "doctor")!;
    const detective = NAMES.find((p) => raw.roles[p] === "detective")!;
    const villagers = NAMES.filter((p) => raw.roles[p] === "villager");
    const [victim, saved, checked] = villagers as [string, string, string];
    act(r, toks[mafia]!, { type: "nightAct", target: victim });
    act(r, toks[doctor]!, { type: "nightAct", target: saved });
    act(r, toks[detective]!, { type: "nightAct", target: checked });

    for (const name of NAMES) {
      const snap: any = snapshot(r, toks[name]);
      expect(snap.setup.seed).toBe(0);
      const json = JSON.stringify(snap.state);
      expect(json).not.toMatch(/seed/);
      expect(Object.keys(snap.state.roles).filter((k) => k !== name)).toEqual([]);
      expect(snap.state.actedCount).toBe(3);
      expect(snap.state.actions.done).toEqual(name === mafia || name === doctor || name === detective ? [name] : []);
      expect(snap.state.actions.kill).toBe(name === mafia ? victim : null);
      expect(snap.state.actions.save).toBe(name === doctor ? saved : null);
      expect(snap.state.actions.check).toBe(name === detective ? checked : null);
      expect(Object.keys(snap.state.checks)).toEqual(name === detective ? [detective] : []);
      if (name !== mafia && name !== detective) expect(json).not.toContain('"mafia"'); // a detective's check has a mafia flag
    }
    const outsider: any = snapshot(r, "not-a-token");
    expect(outsider.state.roles).toEqual({});
    expect(outsider.state.actions).toEqual({ kill: null, save: null, check: null, done: [] });
  });

  it("closes the night as soon as everyone left at the table has acted", () => {
    const { r, toks } = started();
    const mafia = NAMES.find((p) => r.state.roles[p] === "mafia")!;
    const doctor = NAMES.find((p) => r.state.roles[p] === "doctor")!;
    const detective = NAMES.find((p) => r.state.roles[p] === "detective")!;
    const villagers = NAMES.filter((p) => r.state.roles[p] === "villager");
    for (const v of villagers) act(r, toks[v]!, { type: "nightAct", target: "ok" });
    act(r, toks[doctor]!, { type: "nightAct", target: villagers[0] });
    act(r, toks[detective]!, { type: "nightAct", target: villagers[0] });
    expect(r.state.phase).toBe("night");
    leaveRoom(r, toks[mafia]);
    expect(r.state.phase).toBe("morning");
    expect(r.state.morning).toEqual({ died: null });
    expect(r.state.alive).toContain(mafia); // they still count until voted out
    expect(r.status).toBe("playing");
  });

  it("a departed player acting again is back at the table, unless it's a refused skip", () => {
    const { r, toks } = started();
    const villager = NAMES.find((p) => r.state.roles[p] === "villager")!;
    leaveRoom(r, toks[villager]);
    expect(r.seats.find((s: any) => s.name === villager).left).toBe(true);
    expect(act(r, toks[villager]!, { type: "nightAct", target: "ok" })).toEqual({ ok: true });
    expect(r.seats.find((s: any) => s.name === villager).left).toBe(false);
  });

  it("a departed host's refused action changes nothing, so it can't make them host again", () => {
    const { r, toks } = started();
    leaveRoom(r, toks.Zelda);
    const version = r.version;
    expect(snapshot(r, toks.Xavier).seats.find((s: any) => s.host).name).toBe("Xavier");
    expect(act(r, toks.Zelda, { type: "nightAct", target: "nobody-here" }).ok).toBe(false);
    expect(r.seats[0].left).toBe(true);
    expect(snapshot(r, toks.Xavier).seats.find((s: any) => s.host).name).toBe("Xavier");
    expect(r.version).toBe(version);
    // A real action still brings them back, and the room hears about it.
    const target = r.state.roles.Zelda === "villager" ? "ok" : NAMES.find((p) => p !== "Zelda" && r.state.roles[p] !== "mafia");
    expect(act(r, toks.Zelda, { type: "nightAct", target })).toEqual({ ok: true });
    expect(r.seats[0].left).toBe(false);
    expect(snapshot(r, toks.Xavier).seats.find((s: any) => s.host).name).toBe("Zelda");
    expect(r.version).toBeGreaterThan(version);
  });

  it("with drinking on, refuses a player named exactly like the group call, who would drink for everyone", () => {
    const names = ["Zelda", "Xavier", "Quincy", "Wilma", "all"];
    const dry = seated(names);
    expect(startRoom(dry.r, dry.toks.Zelda)).toEqual({ ok: true });
    const wet = seated(names, { drinking: true });
    expect(startRoom(wet.r, wet.toks.Zelda)).toEqual({ error: expect.stringContaining('"all"') });
    const fine = seated(["Zelda", "Xavier", "Quincy", "Wilma", "All"], { drinking: true });
    expect(startRoom(fine.r, fine.toks.Zelda)).toEqual({ ok: true });
    // The group call is shared, so every party game with sip cards is covered.
    const made = createRoom({ format: "vote", pool: DECKS[0]!.id, opts: { drinking: true } }, "Zelda") as any;
    for (const n of ["Xavier", "all"]) joinRoom(made.room.code, n);
    expect(startRoom(made.room, made.seat.token)).toEqual({ error: expect.stringContaining('"all"') });
  });

  it("never stalls: with only the dead still here it ends with no winner, and they aren't asked to wait", () => {
    const { r, toks } = started();
    const dead = "Zelda";
    r.state = { ...r.state, alive: r.state.alive.filter((p: string) => p !== dead) };
    for (const name of NAMES.filter((p) => p !== dead)) leaveRoom(r, toks[name]);
    expect(r.status).toBe("done");
    expect(r.state).toMatchObject({ done: true, winner: null });
    expect(r.played.at(-1)).toMatchObject({ format: "mafia", winner: null });
  });

  it("the clock alone carries a silent table through to a clean finish", () => {
    const { r } = started();
    let now = Date.now();
    for (let guard = 0; guard < 200 && r.status === "playing"; guard++) {
      now += 121_000;
      tickRooms(now);
    }
    expect(r.status).toBe("done");
    expect(r.state.winner).toBeNull();
  });

  it("finishing records the winning side, and opens every secret", () => {
    const { r, toks } = started(NAMES.slice(0, 5));
    const mafia = NAMES.slice(0, 5).find((p) => r.state.roles[p] === "mafia")!;
    const others = NAMES.slice(0, 5).filter((p) => p !== mafia);
    tickRooms(Date.now() + 45_001);
    tickRooms(Date.now() + 45_001 + 8_000);
    expect(r.state.phase).toBe("talk");
    act(r, toks[r.seats[0].name]!, { type: "skipTalk" });
    for (const p of others) act(r, toks[p]!, { type: "dayVote", target: mafia });
    act(r, toks[mafia]!, { type: "dayVote", target: "skip" });
    expect(r.status).toBe("done");
    expect(r.played.at(-1)).toEqual({ format: "mafia", pool: "mafia", winner: "Village" });
    const snap: any = snapshot(r, toks[others[0]!]);
    expect(snap.state.roles[mafia]).toBe("mafia");
    expect(snap.state.points[mafia]).toBe(0);
    expect(snap.state.points[others[0]!]).toBe(1);
  });

  it("drinking stays off by default, and a seat that left doesn't get its own card sent", () => {
    expect(sanitizeSetup({ format: "mafia", pool: "mafia" })!.opts.drinking).toBe(false);
    const { r, toks } = started(NAMES.slice(0, 6), { drinking: true });
    const s = r.state;
    const mafia = NAMES.slice(0, 6).find((p) => s.roles[p] === "mafia")!;
    const victim = NAMES.slice(0, 6).find((p) => s.roles[p] === "villager")!;
    for (const p of s.alive) act(r, toks[p]!, { type: "nightAct", target: p === mafia ? victim : s.roles[p] === "villager" ? "ok" : mafia });
    expect(r.state.morning).toEqual({ died: victim });
    leaveRoom(r, toks[victim]);
    const snap: any = snapshot(r, toks[mafia]);
    expect(snap.state.drinks.calls).toEqual([]);
    expect(r.state.drinks.calls.map((c: any) => c.to)).toEqual([victim]);
  });
});

describe("party rooms with people coming and going", () => {
  const STALE = 5 * 60_000 + 1_000; // past the lobby's window, and so past a running game's too
  const party = (format: string, pool: string, opts: any = {}) => ({ format, pool, opts: { teamSize: 3, ...opts } });
  const cats = Array.from({ length: 4 }, (_, c) => ({ name: `Cat ${c}`, clues: Array.from({ length: 4 }, (_, i) => ({ q: `Q${c}-${i}`, right: `R${c}${i}`, wrong: [`W${c}${i}a`, `W${c}${i}b`, `W${c}${i}c`] })) }));
  const seat = (setup: any, names: string[], quiz?: any) => {
    const made = createRoom(setup, names[0]!, quiz) as any;
    const toks: Record<string, string> = { [names[0]!]: made.seat.token };
    for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
    return { r: made.room, toks };
  };
  const running = (setup: any, names: string[], quiz?: any) => {
    const made = seat(setup, names, quiz);
    expect(startRoom(made.r, made.toks[names[0]!])).toEqual({ ok: true });
    return made;
  };
  const hostOf = (r: any) => snapshot(r, null).seats.find((s: any) => s.host)?.name;
  const stale = (r: any, name: string) => { r.seats.find((s: any) => s.name === name).lastSeen = Date.now() - STALE; };

  describe("who hosts when a phone goes quiet", () => {
    it("passes to the next seat seen lately, and comes back when the host's phone wakes", () => {
      const { r, toks } = seat(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      expect(hostOf(r)).toBe("Ann");
      stale(r, "Ann");
      expect(hostOf(r)).toBe("Bob");
      expect(isHost(r, toks.Bob)).toBe(true);
      expect(isHost(r, toks.Ann)).toBe(false);
      seenSeat(r, toks.Ann);
      expect(hostOf(r)).toBe("Ann");
    });

    it("keeps the crown up to 45 seconds in a running game", () => {
      const { r } = running(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      r.seats[0].lastSeen = Date.now() - 44_000;
      expect(hostOf(r)).toBe("Ann");
      r.seats[0].lastSeen = Date.now() - 46_000;
      expect(hostOf(r)).toBe("Bob");
    });

    it("keeps the crown for 5 minutes in the lobby, so a host can text the code around", () => {
      const { r, toks } = seat(party("vote", "icks"), ["Ann", "Bob"]);
      r.seats[0].lastSeen = Date.now() - 4 * 60_000;
      expect(hostOf(r)).toBe("Ann");
      expect(startRoom(r, toks.Bob)).toEqual({ error: "Only the host can start" });
      r.seats[0].lastSeen = Date.now() - 6 * 60_000;
      expect(hostOf(r)).toBe("Bob");
    });

    it("falls back to the first seat that hasn't left when nobody has been seen", () => {
      const { r } = seat(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      for (const n of ["Ann", "Bob", "Cy"]) stale(r, n);
      expect(hostOf(r)).toBe("Ann");
    });

    it("never gives it to someone who left, however recently they were seen", () => {
      const { r, toks } = running(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      leaveRoom(r, toks.Ann);
      seenSeat(r, toks.Ann);
      expect(r.seats[0].left).toBe(true);
      expect(hostOf(r)).toBe("Bob");
    });

    it("lets the stand-in do host things, and a sleeping host can't until they are back", () => {
      const { r, toks } = seat(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      stale(r, "Ann");
      expect(startRoom(r, toks.Ann)).toEqual({ error: "Only the host can start" });
      expect(startRoom(r, toks.Bob)).toEqual({ ok: true });
    });

    it("an action counts as being seen, even a refused one", () => {
      const { r, toks } = running(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      stale(r, "Ann");
      expect(act(r, toks.Ann, { type: "next" }).ok).toBe(false); // refused: nothing to move on from yet
      expect(hostOf(r)).toBe("Ann");
    });

    it("being seen changes neither the version nor touchedAt, and isn't sent to anyone", () => {
      const { r, toks } = seat(party("vote", "icks"), ["Ann", "Bob"]);
      const { version, touchedAt } = r;
      stale(r, "Ann");
      seenSeat(r, toks.Ann);
      seenSeat(r, "not a token");
      expect(r.version).toBe(version);
      expect(r.touchedAt).toBe(touchedAt);
      expect(snapshot(r, toks.Ann).version).toBe(version);
      for (const s of snapshot(r, toks.Ann).seats) expect(Object.keys(s).sort()).toEqual(["host", "left", "name"]);
    });

    it("a sleeping phone isn't treated as departed: it keeps its place in the game", () => {
      const { r, toks } = running(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      stale(r, "Cy");
      act(r, toks.Ann, { type: "vote", side: "a" });
      act(r, toks.Bob, { type: "vote", side: "a" });
      tickRooms();
      expect(r.state.phase).toBe("vote");
    });
  });

  describe("leaving a running game", () => {
    it("leaves the game running for everyone else, and tells the room", () => {
      for (const setup of [party("vote", "icks"), party("insync", "friends"), party("imposter", "superheroes", { teamSize: 1 })]) {
        const { r, toks } = running(setup, ["Ann", "Bob", "Cy", "Di"]);
        const v = r.version;
        leaveRoom(r, toks.Di);
        expect(r.status).toBe("playing");
        expect(r.version).toBeGreaterThan(v);
        expect(snapshot(r, toks.Ann).seats.find((s: any) => s.name === "Di").left).toBe(true);
      }
    });

    it("moves a vote on the moment the last person it was waiting for walks out", () => {
      const { r, toks } = running(party("vote", "icks"), ["Ann", "Bob", "Cy", "Di"]);
      for (const n of ["Ann", "Bob", "Cy"]) act(r, toks[n]!, { type: "vote", side: "a" });
      expect(r.state.phase).toBe("vote");
      leaveRoom(r, toks.Di);
      expect(r.state.phase).toBe("guess");
    });

    it("moves a vote on when the last person here votes, after someone has gone", () => {
      const { r, toks } = running(party("vote", "icks"), ["Ann", "Bob", "Cy", "Di"]);
      leaveRoom(r, toks.Di);
      for (const n of ["Ann", "Bob"]) act(r, toks[n]!, { type: "vote", side: "a" });
      expect(r.state.phase).toBe("vote");
      act(r, toks.Cy, { type: "vote", side: "a" });
      expect(r.state.phase).toBe("guess");
    });

    it("moves In-Sync on when two guessers left and the two here lock", () => {
      const { r, toks } = running(party("insync", "friends"), ["Ann", "Bob", "Cy", "Di", "Ed"]);
      act(r, toks.Ann, { type: "clue", text: "warm" });
      leaveRoom(r, toks.Di);
      leaveRoom(r, toks.Ed);
      act(r, toks.Bob, { type: "lock" });
      expect(r.state.phase).toBe("tune");
      act(r, toks.Cy, { type: "lock" });
      expect(r.state.phase).toBe("reveal");
    });

    it("skips a departed clue giver straight away", () => {
      const { r, toks } = running(party("insync", "friends"), ["Ann", "Bob", "Cy", "Di"]);
      leaveRoom(r, toks.Ann);
      expect(r.state.round).toBe(1);
      expect(r.state.history[0]).toMatchObject({ giver: "Ann", skipped: true });
    });

    it("finishes a game whose last round's giver walks out", () => {
      const { r, toks } = running(party("insync", "friends"), ["Ann", "Bob"]);
      for (let i = 0; i < 3; i++) {
        const giver = r.state.players[r.state.giverAt % 2];
        act(r, toks[giver]!, { type: "clue", text: `c${i}` });
        act(r, toks[giver === "Ann" ? "Bob" : "Ann"]!, { type: "lock" });
        act(r, toks.Ann, { type: "next" });
      }
      expect(r.state.round).toBe(3);
      expect(r.state.players[r.state.giverAt % 2]).toBe("Bob");
      leaveRoom(r, toks.Bob);
      expect(r.status).toBe("done");
    });

    it("counts Imposter's votes when the last one it was waiting for walks out", () => {
      const { r, toks } = running(party("imposter", "superheroes", { teamSize: 1, ending: "vote" }), ["Ann", "Bob", "Cy", "Di"]);
      for (const n of r.state.order) act(r, toks[n]!, { type: "clue", text: "" });
      expect(r.state.phase).toBe("vote");
      for (const n of ["Ann", "Bob", "Cy"]) act(r, toks[n]!, { type: "accuse", target: n === "Ann" ? "Bob" : "Ann" });
      expect(r.state.phase).toBe("vote");
      leaveRoom(r, toks.Di);
      expect(r.status).toBe("done");
    });

    it("an action after leaving brings the seat back to the table in any party game", () => {
      const { r, toks } = running(party("vote", "icks"), ["Ann", "Bob", "Cy", "Di"]);
      leaveRoom(r, toks.Ann);
      expect(hostOf(r)).toBe("Bob");
      expect(act(r, toks.Ann, { type: "vote", side: "a" }).ok).toBe(true);
      expect(r.seats[0].left).toBe(false);
      expect(hostOf(r)).toBe("Ann");
    });

    it("the name is free again once the game ends, for a friend who walked out and returns", () => {
      const { r, toks } = running(party("insync", "friends"), ["Ann", "Bob", "Cy"]);
      leaveRoom(r, toks.Cy);
      r.state = { ...r.state, done: true };
      r.status = "done";
      const back = joinRoom(r.code, "Cy") as any;
      expect(back.error).toBeUndefined();
      expect(r.status).toBe("lobby");
      expect(r.seats.map((s: any) => s.name)).toEqual(["Ann", "Bob", "Cy"]);
    });
  });

  describe("moving on from a reveal", () => {
    const toVoteReveal = (r: any, toks: Record<string, string>, names: string[]) => {
      for (const n of names) act(r, toks[n]!, { type: "vote", side: "a" });
      for (const n of names) for (const t of names.filter((x) => x !== n)) act(r, toks[n]!, { type: "guessVote", target: t, side: "a" });
      expect(r.state.phase).toBe("reveal");
    };
    const NAMES = ["Ann", "Bob", "Cy"];

    it("Vote: only the host", () => {
      const { r, toks } = running(party("vote", "icks"), NAMES);
      toVoteReveal(r, toks, NAMES);
      expect(act(r, toks.Bob, { type: "next" })).toEqual({ ok: false, error: "Only the host can move on" });
      expect(r.state.phase).toBe("reveal");
      expect(act(r, toks.Ann, { type: "next" }).ok).toBe(true);
      expect(r.state.round).toBe(1);
    });

    it("In-Sync: only the host, even when another player gave the clue", () => {
      const { r, toks } = running(party("insync", "friends"), NAMES);
      act(r, toks.Ann, { type: "clue", text: "warm" });
      act(r, toks.Bob, { type: "lock" });
      act(r, toks.Cy, { type: "lock" });
      expect(r.state.phase).toBe("reveal");
      expect(act(r, toks.Bob, { type: "next" }).ok).toBe(false);
      expect(r.state.phase).toBe("reveal");
      expect(act(r, toks.Ann, { type: "next" }).ok).toBe(true);
    });

    it("Party Trivia: only the host", () => {
      const { r, toks } = running({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10 } }, NAMES, { categories: cats });
      for (const n of NAMES) act(r, toks[n]!, { type: "answer", choice: r.state.questions[0].options[0] });
      expect(r.state.phase).toBe("reveal");
      expect(act(r, toks.Cy, { type: "next" }).ok).toBe(false);
      expect(r.state.phase).toBe("reveal");
      expect(act(r, toks.Ann, { type: "next" }).ok).toBe(true);
    });

    it("follows the computed host: the stand-in can, and the sleeping host's return takes it back", () => {
      const { r, toks } = running(party("vote", "icks"), NAMES);
      toVoteReveal(r, toks, NAMES);
      stale(r, "Ann");
      expect(act(r, toks.Bob, { type: "next" }).ok).toBe(true);
      expect(r.state.round).toBe(1);
      toVoteReveal(r, toks, NAMES);
      stale(r, "Ann");
      seenSeat(r, toks.Ann);
      expect(act(r, toks.Bob, { type: "next" }).ok).toBe(false);
    });

    it("the reveal still ends by itself if nobody taps", () => {
      const { r, toks } = running(party("vote", "icks"), NAMES);
      toVoteReveal(r, toks, NAMES);
      tickRooms(Date.now() + 10_000);
      expect(r.state.round).toBe(1);
    });
  });

  describe("what the API sends a viewer with no seat", () => {
    it("Imposter: no secret, no imposter, and no seed for anyone", () => {
      const { r, toks } = running(party("imposter", "superheroes", { teamSize: 1 }), ["Ann", "Bob", "Cy"]);
      const open = snapshot(r, undefined).state as any;
      expect(open.secret).toBe("");
      expect(open.secretId).toBe("");
      expect(open.imposter).toBe("");
      expect(open.seed).toBe(0);
      for (const n of ["Ann", "Bob", "Cy"]) expect((snapshot(r, toks[n]).state as any).seed).toBe(0);
    });

    it("Vote: no answer and no later cards, for a seat or not", () => {
      const { r, toks } = running(party("vote", "happen", { teamSize: 4 }), ["Ann", "Bob", "Cy"]);
      for (const t of [undefined, toks.Ann]) {
        const st = snapshot(r, t).state as any;
        expect(st.cards).toHaveLength(1);
        expect(st.cards[0].answer).toBeUndefined();
        expect(st.cards[0].note).toBeUndefined();
        expect(st.total).toBe(4);
        expect(st.seed).toBe(0);
      }
      expect(r.state.cards).toHaveLength(4); // the server keeps them
    });
  });

  describe("a refused Play again", () => {
    const first = { categories: cats };
    const second = { categories: cats.map((c) => ({ ...c, name: `Next ${c.name}` })) };
    const playOut = (r: any, toks: Record<string, string>, who: string) => {
      for (let guard = 0; r.status === "playing" && guard < 100; guard++) {
        if (r.state.phase === "question") act(r, toks[who]!, { type: "answer", choice: r.state.questions[r.state.round].options[0] });
        else act(r, toks[who]!, { type: "next" });
      }
      expect(r.status).toBe("done");
    };

    it("doesn't attach the next bank, so the results don't send it to anyone", () => {
      const { r, toks } = running({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10 } }, ["Ann", "Bob"], first);
      leaveRoom(r, toks.Bob);
      playOut(r, toks, "Ann");
      expect(startRoom(r, toks.Ann, second as any)).toEqual({ error: "Need at least 2 players" });
      expect(r.status).toBe("done");
      expect((snapshot(r, toks.Ann).setup as any).quiz).toEqual(first);
      expect(needsQuiz(r)).toBe(true);
    });

    it("a start that goes through uses the bank it was given, which stays off the snapshot", () => {
      const { r, toks } = running({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10 } }, ["Ann", "Bob"], first);
      for (let guard = 0; r.status === "playing" && guard < 100; guard++) {
        if (r.state.phase === "reveal") { act(r, toks.Ann, { type: "next" }); continue; }
        for (const n of ["Ann", "Bob"]) act(r, toks[n]!, { type: "answer", choice: r.state.questions[r.state.round].options[0] });
      }
      expect(r.status).toBe("done");
      expect(startRoom(r, toks.Ann, second as any)).toEqual({ ok: true });
      expect(r.setup.quiz).toEqual(second);
      expect(r.state.questions.every((q: any) => second.categories.some((c) => c.clues.some((x) => x.q === q.q)))).toBe(true);
      expect((snapshot(r, toks.Ann).setup as any).quiz).toBeUndefined();
      expect(needsQuiz(r)).toBe(true);
    });
  });
});
