import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HOST_ACTIONS, _rooms, act, backToLobby, createRoom, getRoom, isHost, joinRoom, leaveRoom, needsQuiz, sanitizeSetup, seatFor, seenSeat, setGame, setScreen, setStatLink, snapshot, startRoom, tickRooms } from "./playRooms";
import { DEFAULT_OPTS } from "../shared/play/types";
import { DECKS } from "../shared/topicDraft/party/decks";
import { LOADOUT_PRESETS } from "../shared/topicDraft/formats/loadout";
import { currentTurn } from "../shared/topicDraft/core";
import * as A from "../shared/topicDraft/formats/auction";
import * as P from "../shared/topicDraft/formats/position";
import { VOWEL_TOPICS } from "../shared/topicDraft/party/vowelWords";
import { DUEL_LEAD, GUESS_MS, REVEAL_MS, type VPState } from "../shared/topicDraft/formats/vowelplay";
import { namesFor } from "../shared/topicDraft/party/vowelSource";

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

describe("sanitizeSetup party pools", () => {
  const party = (format: string, extra: any) => sanitizeSetup({ ...base(format), ...extra });
  it("fills pools from pool alone", () => {
    expect(party("vote", { pool: "icks" })!.pools).toEqual(["icks"]);
  });
  it("keeps several, drops duplicates, and pool follows the first", () => {
    const s = party("vote", { pool: "x", pools: ["wrong", "wrong", "icks"] })!;
    expect(s.pools).toEqual(["wrong", "icks"]);
    expect(s.pool).toBe("wrong");
    expect(s.mission.title).toBe(`${DECKS.find((d) => d.id === "wrong")!.title} and ${DECKS.find((d) => d.id === "icks")!.title}`);
  });
  it("refuses an unknown id and too long a list", () => {
    expect(party("vote", { pools: ["wrong", "nope"] })).toBeNull();
    expect(party("vote", { pools: Array(DECKS.length + 1).fill("wrong") })).toBeNull();
  });
  it("falls back to pool for an empty list, and mafia ignores pools", () => {
    expect(party("vote", { pool: "icks", pools: [] })!.pools).toEqual(["icks"]);
    const m = party("mafia", { pool: "mafia", pools: ["x", "y"] })!;
    expect(m.pools).toEqual(["mafia"]);
  });
  it("keeps Vowel Party and Imposter titles", () => {
    expect(party("vowelparty", { pools: ["food", "films"] })!.mission.title).toBe("Vowel Party: Food and Films");
    expect(party("imposter", { pool: "superheroes" })!.mission.title).toMatch(/^Imposter: /);
  });

  describe("teams", () => {
    const teamed = (format: string, pool: string) => sanitizeSetup({ ...base(format), pool, opts: { ...base(format).opts, teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 7 } } })!;
    it.each([["partytrivia", "superheroes"], ["vowelparty", "food"], ["vote", "icks"], ["imposter", "superheroes"]])("keeps teams for %s", (format, pool) => {
      expect(teamed(format, pool).opts).toMatchObject({ teams: 2, teamMap: { Ann: 0, Bob: 1 } });
    });
    it.each([["vowelplay", "food"], ["mafia", "mafia"], ["insync", "friends"]])("forces no teams for %s", (format, pool) => {
      expect(teamed(format, pool).opts).toMatchObject({ teams: 0, teamMap: {} });
    });
  });
});

describe("mixed vowel topics in a room", () => {
  it("shows the topic but hides the name to every seat, including no token", () => {
    const { r, tokens } = room("vowelplay", ["Ann", "Bob"], { top: { pool: "food", pools: ["food", "films"] } });
    expect(r.setup!.pools).toEqual(["food", "films"]);
    expect(startRoom(r, tokens.Ann!)).toEqual({ ok: true });
    for (const t of [tokens.Ann!, tokens.Bob!, undefined, "nope"]) {
      const w = (snapshot(r, t).state as unknown as VPState).words[0]!;
      expect(w.name).toBe("");
      expect(["food", "films"]).toContain(w.topic);
    }
  });
});

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

  it("plays a team game with two topics: the mix is kept and the teams are built from the map", () => {
    const names = ["Ann", "Bob", "Cy", "Di"];
    const made = createRoom({ ...trivia({ teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0, Di: 1 } }), pools: ["superheroes", "villains"] }, "Ann", { categories: cats }) as any;
    for (const n of names.slice(1)) joinRoom(made.room.code, n);
    expect(made.room.setup.pools).toEqual(["superheroes", "villains"]);
    expect(made.room.setup.mission.title).toBe("Party Trivia: Superheroes and Villains");
    expect(startRoom(made.room, made.seat.token)).toEqual({ ok: true });
    expect(made.room.state.teams).toEqual([["Ann", "Cy"], ["Bob", "Di"]]);
    expect(made.room.state.teamPoints).toEqual([0, 0]);
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
      // setup.opts.answer ("phones"|"buzz") is public, so guard per question instead of by substring.
      for (const q of snap.state.questions) expect(q, n).not.toHaveProperty("answer");
      expect(json.split(first.answer)).toHaveLength(2); // the correct text appears once, as its option
      for (const q of room.state.questions.slice(1)) expect(json).not.toContain(q.q);
      expect(json).toContain(first.q);
    }
    expect(JSON.stringify(snapshot(room, "bad token")).match(/RIGHT-/g)).toHaveLength(1);
    const anon = snapshot(room, "bad token");
    for (const q of anon.state.questions) expect(q).not.toHaveProperty("answer");
    expect(JSON.stringify(anon).split(first.answer)).toHaveLength(2);
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
      r.setup = { ...r.setup, pool: "nope", pools: ["nope"], quiz: undefined };
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
      for (const s of snapshot(r, toks.Ann).seats) expect(Object.keys(s).sort()).toEqual(["host", "left", "name", "screen"]);
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

describe("Vowel Play rooms", () => {
  const topic = VOWEL_TOPICS[0]!.id;
  const vp = (format = "vowelplay", opts: any = {}) => ({ format, pool: topic, opts: { ...opts } });
  const seat = (setup: any, names: string[]) => {
    const made = createRoom(setup, names[0]!) as any;
    const toks: Record<string, string> = { [names[0]!]: made.seat.token };
    for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
    return { r: made.room, toks };
  };
  const running = (setup: any, names: string[]) => {
    const made = seat(setup, names);
    expect(startRoom(made.r, made.toks[names[0]!]!)).toEqual({ ok: true });
    return made;
  };
  const st = (r: any) => r.state as VPState;
  const cur = (r: any) => st(r).words[st(r).round]!;

  describe("setup", () => {
    it("accepts both formats only for a topic with word lists", () => {
      for (const format of ["vowelplay", "vowelparty"]) {
        expect(sanitizeSetup(vp(format))).not.toBeNull();
                expect(sanitizeSetup({ ...vp(format), pool: "weapons" })).toBeNull();
      }
    });
    it("snaps Vowel Play to 10, 15 or 20 words, defaults to 15 and forces drinking off", () => {
      const n = (v: unknown) => sanitizeSetup(vp("vowelplay", { teamSize: v, drinking: true }))!.opts;
      expect(n(11).teamSize).toBe(10);
      expect(n(18).teamSize).toBe(20);
      expect(n(16).teamSize).toBe(15);
      expect(n(999).teamSize).toBe(20);
      expect(n(undefined).teamSize).toBe(15);
      expect(n("junk").teamSize).toBe(15);
      expect(n(15).drinking).toBe(false);
      expect(sanitizeSetup(vp())!.opts).toMatchObject({ vowelMode: "first", vowelAnswer: "voice" });
      expect(sanitizeSetup(vp("vowelplay", { vowelMode: "duel", vowelAnswer: "type" }))!.opts).toMatchObject({ vowelMode: "duel", vowelAnswer: "type" });
      expect(sanitizeSetup(vp("vowelplay", { vowelMode: "x", vowelAnswer: "y" }))!.opts).toMatchObject({ vowelMode: "first", vowelAnswer: "voice" });
    });
    it("makes Vowel Party 10 typed words and keeps drinking", () => {
      const o = sanitizeSetup(vp("vowelparty", { teamSize: 20, vowelAnswer: "voice", vowelMode: "duel", drinking: true }))!.opts;
      expect(o).toMatchObject({ teamSize: 10, vowelAnswer: "type", vowelMode: "first", drinking: true });
      expect(sanitizeSetup(vp("vowelparty"))!.opts.drinking).toBe(false);
    });
    it("gives both a 12 seat room", () => {
      const names = Array.from({ length: 12 }, (_, i) => `P${i}`);
      const { r, toks } = seat(vp("vowelparty"), names);
      expect(startRoom(r, toks.P0!)).toEqual({ ok: true });
      expect(joinRoom(r.code, "late")).toHaveProperty("error");
    });
  });

  describe("starting", () => {
    it("Head to head takes exactly 2 players", () => {
      const { r, toks } = seat(vp("vowelplay", { vowelMode: "duel" }), ["Ann", "Bob", "Cy"]);
      expect(startRoom(r, toks.Ann!)).toEqual({ error: "Head to head takes exactly 2 players" });
      expect(r.status).toBe("lobby");
      leaveRoom(r, toks.Cy!);
      expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
      expect(st(r).mode).toBe("duel");
    });
    it("runs Vowel Party as everyone-competes typed play", () => {
      const { r } = running(vp("vowelparty"), ["Ann", "Bob"]);
      expect(st(r)).toMatchObject({ mode: "all", answer: "type", total: 10 });
    });
    it("has no host next for these formats", () => {
      const { r, toks } = running(vp("vowelparty"), ["Ann", "Bob"]);
      expect(isHost(r, toks.Ann!)).toBe(true);
      expect(act(r, toks.Ann!, { type: "next" })).toEqual({ ok: false, error: "Not allowed right now" });
    });
  });

  describe("hidden answers", () => {
    const names = ["Ann", "Bob", "Cy"];
    const watch = (r: any, toks: Record<string, string>, buzzer: string | null) => {
      const s = st(r);
      const hidden = s.words.slice(s.round).map((w) => w.name).concat(s.words.slice(s.round).flatMap((w) => w.also));
      for (const tok of [undefined, toks.Ann, toks.Bob, toks.Cy, ...(buzzer ? [toks[buzzer]] : [])]) {
        const json = JSON.stringify(snapshot(r, tok).state);
        for (const n of hidden) expect(json, `${n} for ${tok}`).not.toContain(n);
      }
    };
    it("never sends the current or a later name while guessing or speaking", () => {
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "voice" }), names);
      expect(st(r).phase).toBe("guess");
      const first = cur(r).name;
      watch(r, toks, null);
      expect(act(r, toks.Bob!, { type: "buzz" })).toEqual({ ok: true });
      expect(st(r).phase).toBe("speak");
      watch(r, toks, "Bob");
      // the full state does hold the name
      expect(JSON.stringify(r.state)).toContain(first);
    });
    it("never sends the room's played names, which a rematch deals from once a topic runs short", () => {
      for (const format of ["vowelplay", "vowelparty"]) {
        const { r, toks } = seat(vp(format, format === "vowelplay" ? { vowelAnswer: "voice" } : {}), names);
        // Every name of the topic already played: this game must deal from the avoid list.
        const all = namesFor(topic);
        r.seen = all.map((n: string) => `vp:${n}`);
        expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
        expect(r.setup.opts.avoid.length).toBeGreaterThan(0);
        const s = st(r);
        const hidden = s.words.slice(s.round).flatMap((w) => [w.name, ...w.also]);
        for (const tok of [undefined, toks.Ann, toks.Bob, toks.Cy]) {
          const body = snapshot(r, tok);
          expect((body.setup as any).opts.avoid).toEqual([]);
          const json = JSON.stringify(body);
          for (const n of hidden) expect(json, `${format}: ${n} for ${tok}`).not.toContain(`"${n}"`);
        }
      }
    });
    it("lets the judges see the word being judged, but nothing after it", () => {
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "voice" }), names);
      act(r, toks.Bob!, { type: "buzz" });
      act(r, toks.Bob!, { type: "spoke" });
      expect(st(r).phase).toBe("judge");
      const s = st(r);
      const later = s.words.slice(s.round + 1).flatMap((w) => [w.name, ...w.also]);
      for (const tok of [undefined, toks.Ann, toks.Bob]) {
        const json = JSON.stringify(snapshot(r, tok).state);
        for (const n of later) expect(json).not.toContain(n);
      }
    });
    it("while judging, sends each seat only its own mark; others, and a seat with no token, see voted", () => {
      const four = ["Ann", "Bob", "Cy", "Di"];
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "voice" }), four);
      act(r, toks.Bob!, { type: "buzz" });
      act(r, toks.Bob!, { type: "spoke" });
      expect(act(r, toks.Ann!, { type: "mark", verdict: "wrong" })).toEqual({ ok: true });
      expect(act(r, toks.Cy!, { type: "mark", verdict: "right" })).toEqual({ ok: true });
      expect(st(r).phase).toBe("judge");
      const marks = (tok: string | undefined) => (snapshot(r, tok).state as any).marks;
      expect(marks(toks.Ann)).toEqual({ Ann: "wrong", Cy: "voted" });
      expect(marks(toks.Cy)).toEqual({ Ann: "voted", Cy: "right" });
      for (const tok of [toks.Bob, toks.Di, undefined]) expect(marks(tok)).toEqual({ Ann: "voted", Cy: "voted" });
      expect(act(r, toks.Di!, { type: "mark", verdict: "wrong" })).toEqual({ ok: true });
      expect(st(r).phase).toBe("reveal");
      for (const tok of [toks.Ann, toks.Bob, toks.Cy, toks.Di, undefined]) expect(marks(tok)).toEqual({ Ann: "wrong", Cy: "right", Di: "wrong" });
    });
    it("typed play hides them too, and the client cannot set the clock or the seed", () => {
      const { r, toks } = running(vp("vowelparty"), names);
      watch(r, toks, null);
      expect(JSON.stringify(snapshot(r, undefined).setup)).not.toContain(cur(r).name);
      expect((snapshot(r, undefined).state as any).seed).toBe(0);
    });
    it("never sends the setup seed, to any seat, while playing or after", () => {
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "voice" }), names);
      expect(r.setup.seed).not.toBe(0);
      act(r, toks.Bob!, { type: "buzz" });
      for (const tok of [undefined, toks.Ann, toks.Bob, toks.Cy]) expect(snapshot(r, tok).setup!.seed).toBe(0);
      const p = running(vp("vowelparty"), names);
      for (const tok of [undefined, p.toks.Ann, p.toks.Bob]) expect(snapshot(p.r, tok).setup!.seed).toBe(0);
    });
    it("sends only the words played once a head to head ends early", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const { r, toks } = running(vp("vowelplay", { vowelMode: "duel", vowelAnswer: "type" }), ["Ann", "Bob"]);
        const all = st(r).words.map((w) => w.name);
        for (let i = 0; i < DUEL_LEAD; i++) {
          expect(act(r, toks.Ann!, { type: "guess", text: cur(r).name })).toEqual({ ok: true });
          vi.advanceTimersByTime(REVEAL_MS + 10);
          tickRooms();
        }
        expect(r.status).toBe("done");
        expect(r.setup.seed).not.toBe(0);
        for (const tok of [undefined, toks.Ann, toks.Bob]) {
          expect(snapshot(r, tok).setup!.seed).toBe(0);
          const s = snapshot(r, tok).state as VPState;
          expect(s.words.map((w) => w.name)).toEqual(all.slice(0, DUEL_LEAD));
          const json = JSON.stringify(s);
          for (const n of all.slice(DUEL_LEAD)) expect(json).not.toContain(`"${n}"`);
        }
      } finally { vi.useRealTimers(); }
    });
  });

  describe("guessing", () => {
    afterEach(() => vi.useRealTimers());
    it("takes a right typed guess from the seat, whatever `by` says", () => {
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "type" }), ["Ann", "Bob"]);
      const name = cur(r).name;
      expect(act(r, toks.Bob!, { type: "guess", by: "Ann", text: name })).toEqual({ ok: true });
      expect(st(r).points).toMatchObject({ Bob: 1, Ann: 0 });
    });
    it("refuses a guess over 60 characters, right at the start of it or not", () => {
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "type" }), ["Ann", "Bob"]);
      const res = act(r, toks.Ann!, { type: "guess", text: cur(r).name + " ".repeat(61) });
      expect(res.ok).toBe(false);
      expect(st(r).points.Ann).toBe(0);
      expect(act(r, toks.Ann!, { type: "guess", text: 42 }).ok).toBe(false);
      expect(act(r, toks.Ann!, { type: "guess", text: "a".repeat(60) }).ok).toBe(false); // wrong, but not for length
    });
    it("refuses more than 3 guesses in a second per seat, until the second passes", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "type" }), ["Ann", "Bob"]);
      const msgs = [1, 2, 3].map(() => act(r, toks.Ann!, { type: "guess", text: "zzzz" })); // refused as wrong, but counted
      for (const m of msgs) expect(m.error).toBe("Not allowed right now");
      const fourth = act(r, toks.Ann!, { type: "guess", text: cur(r).name });
      expect(fourth).toMatchObject({ ok: false, error: "Slow down" });
      expect(st(r).points.Ann).toBe(0);
      // another seat is unaffected
      expect(act(r, toks.Bob!, { type: "guess", text: "zzzz" }).error).toBe("Not allowed right now");
      vi.advanceTimersByTime(1000);
      expect(act(r, toks.Ann!, { type: "guess", text: cur(r).name })).toEqual({ ok: true });
    });
    it("does not rate limit other actions, and keeps nothing once the room is gone", () => {
      const { r, toks } = running(vp("vowelparty"), ["Ann", "Bob"]);
      for (let i = 0; i < 6; i++) expect(act(r, toks.Ann!, { type: "giveUp" }).error).not.toBe("Slow down");
      for (let i = 0; i < 10; i++) act(r, toks.Ann!, { type: "guess", text: "x" });
      expect(Object.keys(r)).toContain("guessAt");
      expect(r.guessAt.get("Ann").length).toBeLessThanOrEqual(3);
    });
  });

  describe("people leaving", () => {
    it("ends the word at once when the buzzer leaves", () => {
      const { r, toks } = running(vp("vowelplay", { vowelAnswer: "voice" }), ["Ann", "Bob", "Cy"]);
      act(r, toks.Bob!, { type: "buzz" });
      expect(st(r).phase).toBe("speak");
      leaveRoom(r, toks.Bob!);
      expect(st(r).phase).toBe("reveal");
      expect(st(r).history[0]).toMatchObject({ winner: null });
      expect(st(r).points).toMatchObject({ Ann: 0, Cy: 0 });
    });
    it("settles on the server clock too", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        const { r, toks } = running(vp("vowelparty"), ["Ann", "Bob"]);
        act(r, toks.Ann!, { type: "giveUp" });
        r.seats.find((s: any) => s.name === "Bob").left = true; // quiet leave without a settle
        tickRooms();
        expect(st(r).phase).toBe("reveal");
        expect(st(r).history[0]!.winner).toBeNull();
      } finally { vi.useRealTimers(); }
    });
    it("ends a head to head when one leaves, and the other wins", () => {
      const { r, toks } = running(vp("vowelplay", { vowelMode: "duel" }), ["Ann", "Bob"]);
      leaveRoom(r, toks.Bob!);
      expect(r.status).toBe("done");
      expect(r.played.at(-1)).toMatchObject({ format: "vowelplay", winner: "Ann" });
      const s = snapshot(r, toks.Ann).state as VPState;
      expect(s.words).toEqual([]);
    });
  });

  describe("finishing", () => {
    afterEach(() => vi.useRealTimers());
    /** Runs a typed game to its end on a fake clock; `solve` says which words (0-based) Ann names. */
    const play = (r: any, toks: Record<string, string>, solve: (i: number) => boolean) => {
      for (let i = 0; r.status === "playing" && i < 100; i++) {
        if (solve(st(r).round) && st(r).phase === "guess") act(r, toks.Ann!, { type: "guess", text: cur(r).name });
        vi.advanceTimersByTime(GUESS_MS + REVEAL_MS + 10);
        tickRooms();
        if (st(r).phase === "guess" && st(r).round === i && !st(r).done) tickRooms(Date.now() + GUESS_MS);
      }
    };
    it("records one winner, or null on a tie", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const a = running(vp("vowelplay", { vowelAnswer: "type", teamSize: 10 }), ["Ann", "Bob"]);
      play(a.r, a.toks, (i) => i === 0);
      expect(a.r.status).toBe("done");
      expect(a.r.played.at(-1)).toMatchObject({ format: "vowelplay", winner: "Ann" });
      const b = running(vp("vowelparty"), ["Ann", "Bob"]);
      play(b.r, b.toks, () => false);
      expect(b.r.status).toBe("done");
      expect(b.r.played.at(-1)).toMatchObject({ format: "vowelparty", winner: null });
    });
    it("prefers names not yet seen on a rematch, and records only the words played", () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      const { r, toks } = running(vp("vowelplay", { vowelMode: "duel", vowelAnswer: "type" }), ["Ann", "Bob"]);
      const dealt = st(r).words.map((w) => w.name);
      expect(dealt.length).toBeGreaterThan(DUEL_LEAD);
      play(r, toks, () => true);
      expect(r.status).toBe("done");
      expect(r.played.at(-1)).toMatchObject({ winner: "Ann" });
      // Five were played; the other dealt names stay unseen.
      expect(r.seen).toEqual(dealt.slice(0, DUEL_LEAD).map((n) => `vp:${n}`));
      expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
      const second = st(r).words.map((w) => w.name);
      for (const n of dealt.slice(0, DUEL_LEAD)) expect(second).not.toContain(n);
      expect(second.slice(0, 5)).toEqual(expect.not.arrayContaining(dealt.slice(0, DUEL_LEAD)));
    });
    it("records a forfeit's winner and keeps the unplayed names unseen", () => {
      const { r, toks } = running(vp("vowelplay", { vowelMode: "duel" }), ["Ann", "Bob"]);
      leaveRoom(r, toks.Bob!);
      expect(r.played.at(-1)).toMatchObject({ winner: "Ann" });
      expect(r.seen).toEqual([]);
    });
  });
});

describe("screen host", () => {
  const party = (format: string, pool: string, opts: any = {}) => ({ format, pool, opts: { teamSize: 3, ...opts } });
  const withScreen = (setup: any, players: string[], host = "TV") => {
    const made = createRoom(setup, host) as any;
    const toks: Record<string, string> = { [host]: made.seat.token };
    expect(setScreen(made.room, toks[host], true)).toEqual({ ok: true });
    for (const n of players) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
    return { r: made.room, toks };
  };
  const names = (n: number) => Array.from({ length: n }, (_, i) => `P${i + 1}`);
  /** Ann dozes, TV takes the crown and hosts on a screen, the game starts, then Ann wakes and is host again: TV is a plain seat outside the game. */
  const exScreen = (setup: any) => {
    const made = createRoom(setup, "Ann") as any;
    const r = made.room;
    const toks: Record<string, string> = { Ann: made.seat.token };
    for (const n of ["TV", ...names(4)]) toks[n] = (joinRoom(r.code, n) as any).seat.token;
    r.seats[0].lastSeen = Date.now() - 6 * 60_000;
    expect(setScreen(r, toks.TV, true)).toEqual({ ok: true });
    expect(startRoom(r, toks.TV)).toEqual({ ok: true });
    seenSeat(r, toks.Ann);
    tickRooms();
    return { r, toks };
  };

  describe("the switch", () => {
    it("only the host turns it on, and only in the lobby", () => {
      const { r, toks } = withScreen(party("imposter", "superheroes"), ["Ann", "Bob", "Cy"]);
      expect(setScreen(r, toks.Ann, false)).toEqual({ error: "Only the host can do that" });
      expect(snapshot(r, toks.TV).screen).toBe(true);
      expect(snapshot(r, toks.Ann).screen).toBe(false);
      expect(snapshot(r, toks.TV).seats.map((s) => s.screen)).toEqual([true, false, false, false]);
      expect(startRoom(r, toks.TV)).toEqual({ ok: true });
      expect(setScreen(r, toks.TV, false)).toEqual({ error: "Switch this in the lobby" });
    });
    it("rejects a non-boolean and turns off again", () => {
      const { r, toks } = withScreen(party("imposter", "superheroes"), ["Ann"]);
      expect(setScreen(r, toks.TV, "yes")).toEqual({ error: "Invalid choice" });
      expect(setScreen(r, toks.TV, false)).toEqual({ ok: true });
      expect(r.setup.players).toEqual(["TV", "Ann"]);
    });
    it("moves the flag off any other seat", () => {
      const { r, toks } = withScreen(party("imposter", "superheroes"), ["Ann", "Bob"]);
      r.seats[1].screen = true; // as if another seat held it
      expect(setScreen(r, toks.TV, true)).toEqual({ ok: true });
      expect(r.seats.map((s: any) => !!s.screen)).toEqual([true, false, false]);
    });
    it("a host hand-over clears it, and that seat plays from the next game", () => {
      // Ann made the room and dozed off, so TV took the crown and became the screen. Ann waking takes it back.
      const made = createRoom(party("imposter", "superheroes"), "Ann") as any;
      const r = made.room;
      const toks: Record<string, string> = { Ann: made.seat.token };
      for (const n of ["TV", "Bob", "Cy"]) toks[n] = (joinRoom(r.code, n) as any).seat.token;
      r.seats[0].lastSeen = Date.now() - 6 * 60_000;
      expect(setScreen(r, toks.TV, true)).toEqual({ ok: true });
      seenSeat(r, toks.Ann);
      expect(isHost(r, toks.Ann)).toBe(true);
      tickRooms();
      expect(snapshot(r, toks.Ann).seats.some((s) => s.screen)).toBe(false);
      expect(r.setup.players).toEqual(["Ann", "TV", "Bob", "Cy"]);
    });
    it.each([["lobby", 6 * 60_000], ["a game", 60_000]])("a screen that goes quiet in %s wakes up still the screen", (where, quiet) => {
      const { r, toks } = withScreen(party("imposter", "superheroes"), ["Ann", "Bob", "Cy"]);
      if (where === "a game") expect(startRoom(r, toks.TV)).toEqual({ ok: true });
      r.seats[0].lastSeen = Date.now() - quiet;
      expect(isHost(r, toks.Ann)).toBe(true);
      tickRooms();
      expect(r.seats[0].screen).toBe(true);
      seenSeat(r, toks.TV);
      tickRooms();
      expect(isHost(r, toks.TV)).toBe(true);
      expect(snapshot(r, toks.TV).screen).toBe(true);
      expect(r.setup.players).toEqual(["Ann", "Bob", "Cy"]);
    });
  });

  describe("never a player", () => {
    it("stays out of setup.players at every write", () => {
      const { r, toks } = withScreen(party("imposter", "superheroes"), ["Ann", "Bob"]);
      expect(r.setup.players).toEqual(["Ann", "Bob"]);
      joinRoom(r.code, "Cy");
      expect(r.setup.players).toEqual(["Ann", "Bob", "Cy"]);
      leaveRoom(r, (r.seats.find((s: any) => s.name === "Cy")).token);
      expect(r.setup.players).toEqual(["Ann", "Bob"]);
      expect(setGame(r, toks.TV, party("vote", "icks"))).toEqual({ ok: true });
      expect(r.setup.players).toEqual(["Ann", "Bob"]);
      expect(startRoom(r, toks.TV)).toEqual({ error: "Need at least 3 players" });
      joinRoom(r.code, "Cy");
      expect(startRoom(r, toks.TV)).toEqual({ ok: true });
      expect(r.setup.players).toEqual(["Ann", "Bob", "Cy"]);
      expect(r.state.players).toEqual(["Ann", "Bob", "Cy"]);
    });
    it("is not counted for the minimum or the seat cap: a screen and 12 players can start", () => {
      const { r, toks } = withScreen(party("vote", "icks"), names(12));
      expect(r.seats).toHaveLength(13);
      expect(joinRoom(r.code, "Late")).toEqual({ error: "Room is full (12 players for this game)" });
      expect(startRoom(r, toks.TV)).toEqual({ ok: true });
      expect(r.state.players).toHaveLength(12);
    });
    it("a screen host and one player is too few", () => {
      const { r, toks } = withScreen(party("partytrivia", "superheroes"), ["Ann"]);
      expect(startRoom(r, toks.TV)).toEqual({ error: "Need at least 2 players" });
    });
    it("drops it from a team map", () => {
      const { r, toks } = withScreen(party("vote", "icks", { teams: 2, teamMap: { TV: 0, Ann: 0, Bob: 1, Cy: 1 } }), ["Ann", "Bob", "Cy"]);
      expect(startRoom(r, toks.TV)).toEqual({ ok: true });
      expect(r.setup.opts.teamMap).toEqual({ Ann: 0, Bob: 1, Cy: 1 });
    });
    it("leaving a running game does not settle anything for it", () => {
      const { r, toks } = withScreen(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      startRoom(r, toks.TV);
      const before = r.state;
      leaveRoom(r, toks.TV);
      expect(r.state).toBe(before);
      tickRooms();
      expect(r.state.players).not.toContain("TV");
    });
    it("never wins", () => {
      const { r, toks } = withScreen(party("partytrivia", "superheroes"), ["Ann", "Bob"]);
      startRoom(r, toks.TV);
      expect(Object.keys(r.state.points)).not.toContain("TV");
    });
  });

  describe("sees what a viewer with no seat sees", () => {
    const cases: [string, string, string[], any?][] = [
      ["imposter", "superheroes", names(4)],
      ["vote", "icks", names(4)],
      ["insync", "friends", names(3)],
      ["partytrivia", "superheroes", names(3)],
      ["mafia", "mafia", names(5)],
      ["vowelplay", "food", names(3)],
      ["vowelparty", "food", names(3)],
    ];
    it.each(cases)("%s", (format, pool, players) => {
      const { r, toks } = withScreen(party(format, pool), players);
      expect(startRoom(r, toks.TV)).toEqual({ ok: true });
      const open = JSON.stringify(snapshot(r, undefined).state);
      expect(JSON.stringify(snapshot(r, toks.TV).state)).toBe(open);
      // and the players still see their own part, so the redaction is not just always off
      if (format === "imposter") {
        const s = r.state;
        expect((snapshot(r, toks.TV).state as any).secret).toBe("");
        expect((snapshot(r, toks.TV).state as any).imposter).toBe("");
        const crew = players.find((p) => p !== s.imposter)!;
        expect((snapshot(r, toks[crew]).state as any).secret).toBe(s.secret);
      }
    });
    it("a seat that stopped hosting a screen mid-game is still redacted as a viewer", () => {
      const { r, toks } = exScreen(party("imposter", "superheroes"));
      expect(r.seats.find((s: any) => s.name === "TV").screen).toBe(false);
      expect((snapshot(r, toks.TV).state as any).secret).toBe("");
    });
  });

  describe("actions", () => {
    it.each([
      ["vote", { type: "vote", side: "a" }],
      ["partytrivia", { type: "answer", choice: "x" }],
      ["vowelplay", { type: "guess", text: "x" }],
      ["vowelplay", { type: "buzz" }],
      ["vowelplay", { type: "mark", verdict: "right" }],
      ["imposter", { type: "accuse", target: "P1" }],
      ["imposter", { type: "guess", name: "x" }],
      ["imposter", { type: "clue", text: "hello" }],
      ["insync", { type: "clue", text: "hello" }],
      ["mafia", { type: "dayVote", target: "P1" }],
    ])("refuses %s %j", (format, action) => {
      const { r, toks } = withScreen(party(format, format === "vote" ? "icks" : format === "mafia" ? "mafia" : format.startsWith("vowel") ? "food" : format === "insync" ? "friends" : "superheroes"), names(5));
      startRoom(r, toks.TV);
      const before = r.state;
      expect(act(r, toks.TV, action)).toEqual({ ok: false, error: "Not allowed right now" });
      expect(r.state).toBe(before);
    });
    it("accepts next on a reveal", () => {
      const { r, toks } = withScreen(party("vote", "icks"), names(3));
      startRoom(r, toks.TV);
      for (const p of names(3)) act(r, toks[p], { type: "vote", side: "a" });
      expect(HOST_ACTIONS).toContain("next");
      expect(r.state.phase).not.toBe("vote");
      for (let i = 0; i < 20 && r.state.phase !== "vote" && !r.state.done; i++) {
        const phase = r.state.phase;
        const res = act(r, toks.TV, { type: "next" });
        if (!res.ok) break;
        expect(r.state.phase === phase && !r.state.done).toBe(false);
        break;
      }
    });
    it.each([["imposter", "superheroes"], ["vowelplay", "food"], ["vote", "icks"]])("refuses next in %s from an ex-screen seat that no longer hosts", (format, pool) => {
      const { r, toks } = exScreen(party(format, pool));
      expect(isHost(r, toks.TV)).toBe(false);
      const before = r.state;
      expect(act(r, toks.TV, { type: "next" })).toEqual({ ok: false, error: "Only the host can move on" });
      expect(r.state).toBe(before);
    });
    it("closes the room when every player leaves a running game and only the screen is left", () => {
      const { r, toks } = withScreen(party("vote", "icks"), ["Ann", "Bob", "Cy"]);
      startRoom(r, toks.TV);
      leaveRoom(r, toks.Ann);
      leaveRoom(r, toks.Bob);
      expect(getRoom(r.code)).toBeTruthy();
      leaveRoom(r, toks.Cy);
      expect(getRoom(r.code)).toBeFalsy();
    });
    it("keeps a lobby with only the screen in it, waiting for players", () => {
      const { r, toks } = withScreen(party("vote", "icks"), ["Ann"]);
      leaveRoom(r, toks.Ann);
      expect(getRoom(r.code)).toBeTruthy();
    });
    it("lets it skip Mafia's talk", () => {
      const { r, toks } = withScreen(party("mafia", "mafia"), names(5));
      startRoom(r, toks.TV);
      r.state = { ...r.state, phase: "talk" };
      expect(act(r, toks.TV, { type: "skipTalk" })).toEqual({ ok: true });
      expect(r.state.phase).toBe("vote");
    });
    it("refuses a player's skipTalk and a player action sent as someone else", () => {
      const { r, toks } = withScreen(party("mafia", "mafia"), names(5));
      startRoom(r, toks.TV);
      r.state = { ...r.state, phase: "talk" };
      expect(act(r, toks.P2, { type: "skipTalk" })).toEqual({ ok: false, error: "Only the host can skip the talk" });
    });
  });
});

describe("buzz mode in rooms", () => {
  const cats = ["Aa", "Bb", "Cc", "Dd", "Ee", "Ff"].map((name) => ({
    name,
    clues: [0, 1, 2, 3].map((i) => ({ q: `${name} question number ${i}?`, right: `RIGHT-${name}-${i}`, wrong: [`no1-${name}-${i}`, `no2-${name}-${i}`, `no3-${name}-${i}`] })),
  }));
  const topic = VOWEL_TOPICS[0]!.id;
  const make = (setup: any, players: string[], screen = false, quiz?: any) => {
    const made = createRoom(setup, screen ? "TV" : players[0]!, quiz) as any;
    const toks: Record<string, string> = { [screen ? "TV" : players[0]!]: made.seat.token };
    if (screen) expect(setScreen(made.room, toks.TV, true)).toEqual({ ok: true });
    for (const n of screen ? players : players.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
    expect(startRoom(made.room, screen ? toks.TV : toks[players[0]!])).toEqual({ ok: true });
    return { r: made.room, toks };
  };
  const trivia = (answer?: any) => ({ format: "partytrivia", pool: "superheroes", opts: { teamSize: 10, ...(answer ? { answer } : {}) } });

  it("Party Trivia buzz: a player's buzz is accepted, the screen seat's is refused, and everyone sees who buzzed", () => {
    const { r, toks } = make(trivia("buzz"), ["Ann", "Bob"], true, { categories: cats });
    expect(r.setup.opts.answer).toBe("buzz");
    expect(HOST_ACTIONS).not.toContain("buzz");
    expect(HOST_ACTIONS).not.toContain("answer");
    expect(act(r, toks.TV!, { type: "buzz" })).toEqual({ ok: false, error: "Not allowed right now" });
    expect(act(r, toks.TV!, { type: "answer", choice: "x" })).toEqual({ ok: false, error: "Not allowed right now" });
    expect((snapshot(r, toks.TV!).state as any).buzzer).toBeNull();
    expect(act(r, toks.Bob!, { type: "buzz" })).toEqual({ ok: true });
    for (const tok of [undefined, toks.TV, toks.Ann, toks.Bob]) {
      const s = snapshot(r, tok).state as any;
      expect(s.buzzer).toBe("Bob");
      expect(typeof s.buzzMs).toBe("number");
    }
    // a second buzz while Bob answers changes nothing
    act(r, toks.Ann!, { type: "buzz" });
    expect((snapshot(r, toks.Ann!).state as any).buzzer).toBe("Bob");
  });

  it("Party Trivia buzz: the answer stays out of every seat's state, and the token-less one, until reveal", () => {
    const { r, toks } = make(trivia("buzz"), ["Ann", "Bob"], true, { categories: cats });
    act(r, toks.Bob!, { type: "buzz" });
    for (const tok of [undefined, toks.TV, toks.Ann, toks.Bob]) {
      const s = snapshot(r, tok).state as any;
      expect(s.phase).toBe("question");
      for (const q of s.questions) expect(q).not.toHaveProperty("answer");
      expect(JSON.stringify(s).match(/RIGHT-/g) ?? []).toHaveLength(1); // only the one option on screen
    }
    const right = (r.state as any).questions[(r.state as any).round].answer;
    expect(act(r, toks.Bob!, { type: "answer", choice: right })).toEqual({ ok: true });
    expect((snapshot(r, undefined).state as any).phase).toBe("reveal");
  });

  it("answer is kept for Party Trivia and Vowel Party only, and defaults to phones", () => {
    expect(sanitizeSetup(trivia())!.opts.answer).toBe("phones");
    expect(sanitizeSetup(trivia("nope"))!.opts.answer).toBe("phones");
    expect(sanitizeSetup(trivia("buzz"))!.opts.answer).toBe("buzz");
    expect(sanitizeSetup({ format: "vowelparty", pool: topic, opts: { answer: "buzz" } })!.opts.answer).toBe("buzz");
    expect(sanitizeSetup({ format: "vowelparty", pool: topic, opts: {} })!.opts.answer).toBe("phones");
    expect(sanitizeSetup({ format: "vowelplay", pool: topic, opts: { answer: "buzz" } })!.opts.answer).toBe("phones");
    expect(sanitizeSetup({ format: "vote", pool: "icks", opts: { answer: "buzz" } })!.opts.answer).toBe("phones");
    expect(sanitizeSetup({ format: "imposter", pool: "superheroes", opts: { answer: "buzz" } })!.opts.answer).toBe("phones");
    expect(sanitizeSetup({ format: "mafia", pool: "mafia", opts: { answer: "buzz" } })!.opts.answer).toBe("phones");
    expect(sanitizeSetup({ format: "snake", pool: "nba", opts: { answer: "buzz" } } as any)?.opts.answer ?? "phones").toBe("phones");
    const phones = make(trivia(), ["Ann", "Bob"], false, { categories: cats });
    expect((phones.r.state as any).answerMode).toBeUndefined();
    expect(act(phones.r, phones.toks.Bob!, { type: "buzz" }).ok).toBe(false); // nothing to buzz in
    expect((phones.r.state as any).buzzer).toBeUndefined();
  });

  it("Vowel Party buzz plays voice first-correct with 3 players, keeps its title, and Vowel Party drinking and teams", () => {
    const setup = { format: "vowelparty", pool: topic, opts: { answer: "buzz", drinking: true, teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0 } } };
    expect(sanitizeSetup(setup)!.mission.title).toMatch(/^Vowel Party: /);
    expect(sanitizeSetup(setup)!.opts).toMatchObject({ answer: "buzz", drinking: true, teams: 2, vowelAnswer: "voice" });
    const { r, toks } = make(setup, ["Ann", "Bob", "Cy"]);
    const s = r.state as VPState;
    expect(s).toMatchObject({ mode: "first", answer: "voice", phase: "guess", total: 10 });
    expect(r.setup.format).toBe("vowelparty");
    expect(act(r, toks.Bob!, { type: "buzz" })).toEqual({ ok: true });
    expect((r.state as VPState).phase).toBe("speak");
    expect(act(r, toks.Bob!, { type: "spoke" })).toEqual({ ok: true });
    expect((r.state as VPState).phase).toBe("judge");
    expect(act(r, toks.Ann!, { type: "mark", verdict: "right" })).toEqual({ ok: true });
    expect(act(r, toks.Cy!, { type: "mark", verdict: "right" })).toEqual({ ok: true });
    expect((r.state as VPState).phase).toBe("reveal");
    expect((r.state as VPState).points.Bob).toBeGreaterThan(0);
  });

  it("Vowel Party without buzz is still the typed race", () => {
    const { r } = make({ format: "vowelparty", pool: topic, opts: {} }, ["Ann", "Bob"]);
    expect(r.state).toMatchObject({ mode: "all", answer: "type" });
  });
});
