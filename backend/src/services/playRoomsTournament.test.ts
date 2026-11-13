import { beforeEach, describe, expect, it, vi } from "vitest";

let resolvers: ((v: any) => void)[] = [];
vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise((r) => resolvers.push(r))) }));

import { _rooms, act, createRoom, endTournament, joinRoom, leaveRoom, setGame, setScreen, snapshot, startRoom, startTournament } from "./playRooms";
import { DEFAULT_OPTS } from "../shared/play/types";
import { currentTurn } from "../shared/topicDraft/core";
import { LOADOUT_PRESETS } from "../shared/topicDraft/formats/loadout";

const base = (format: string, extra: any = {}) => ({
  format, pool: "superheroes",
  mission: { id: "m", title: "Alien", blurb: "", weights: { power: 1, intellect: 1 } },
  opts: { ...DEFAULT_OPTS, teamSize: 3, timerSeconds: null, rankSize: 5, ...(extra.opts ?? {}) },
  roles: [{ id: "a", label: "A", weights: { power: 1 } }, { id: "b", label: "B", weights: { intellect: 1 } }],
  loadout: format === "loadout" ? LOADOUT_PRESETS[0] : null,
});

function lobby(format = "insync", names = ["Ann", "Bob"]) {
  const c = createRoom({ ...base(format), pool: format === "insync" ? "music" : "superheroes" }, names[0]!) as any;
  const tokens: Record<string, string> = { [names[0]!]: c.seat.token };
  for (const n of names.slice(1)) tokens[n] = (joinRoom(c.room.code, n) as any).seat.token;
  return { r: c.room, tokens };
}

/** Plays an In-Sync game to its end. */
function playSync(r: any, tokens: Record<string, string>) {
  startRoom(r, tokens.Ann!);
  for (let i = 0; i < 20 && r.status === "playing"; i++) {
    const g = r.state.players[r.state.giverAt % r.state.players.length];
    act(r, tokens[g], { type: "clue", text: "hi" });
    for (const n of Object.keys(tokens)) if (n !== g) act(r, tokens[n]!, { type: "lock" });
    act(r, tokens.Ann!, { type: "next" });
  }
  expect(r.status).toBe("done");
}

const toLobby = (r: any, tokens: Record<string, string>) => setGame(r, tokens.Ann!, { ...base("insync"), pool: "music" });

beforeEach(() => { _rooms.clear(); resolvers = []; });

describe("tournament start and end", () => {
  it("stores the plan at index 0, host and lobby only, 2 to 8 known formats", () => {
    const { r, tokens } = lobby();
    expect(startTournament(r, tokens.Bob!, ["insync", "vote"])).toMatchObject({ error: expect.any(String) });
    expect(startTournament(r, tokens.Ann!, ["insync"])).toMatchObject({ error: expect.any(String) });
    expect(startTournament(r, tokens.Ann!, Array(9).fill("insync"))).toMatchObject({ error: expect.any(String) });
    expect(startTournament(r, tokens.Ann!, ["insync", "nope"])).toMatchObject({ error: expect.any(String) });
    expect(startTournament(r, tokens.Ann!, "insync")).toMatchObject({ error: expect.any(String) });
    expect(r.tournament).toBeUndefined();
    expect(startTournament(r, tokens.Ann!, ["insync", "vote"])).toEqual({ ok: true });
    expect(r.tournament).toMatchObject({ plan: ["insync", "vote"], index: 0, done: false, totals: {} });
    startRoom(r, tokens.Ann!);
    expect(startTournament(r, tokens.Ann!, ["insync", "vote"])).toMatchObject({ error: expect.any(String) });
  });

  it("finish awards seated players, bumps the index and finishes at the plan's end", () => {
    const { r, tokens } = lobby();
    startTournament(r, tokens.Ann!, ["insync", "insync"]);
    playSync(r, tokens);
    expect(r.tournament).toMatchObject({ index: 1, done: false, totals: { Ann: 2, Bob: 2 } });
    toLobby(r, tokens);
    playSync(r, tokens);
    expect(r.tournament).toMatchObject({ index: 2, done: true, totals: { Ann: 4, Bob: 4 } });
    const snap = snapshot(r, null).tournament!;
    expect(snap.done).toBe(true);
    toLobby(r, tokens);
    expect(snapshot(r, tokens.Ann!).tournament!.done).toBe(true); // stays visible
  });

  it("a player who leaves mid-game gets nothing for it but keeps earlier points", () => {
    const { r, tokens } = lobby("insync", ["Ann", "Bob", "Cy"]);
    startTournament(r, tokens.Ann!, ["insync", "insync", "insync"]);
    playSync(r, tokens);
    toLobby(r, tokens);
    startRoom(r, tokens.Ann!);
    leaveRoom(r, tokens.Cy!);
    for (let i = 0; i < 20 && r.status === "playing"; i++) {
      const g = r.state.players[r.state.giverAt % r.state.players.length];
      const live = Object.keys(tokens).filter((n) => n !== "Cy");
      act(r, tokens[g] ?? tokens.Ann!, { type: "clue", text: "hi" });
      for (const n of live) act(r, tokens[n]!, { type: "lock" });
      act(r, tokens.Ann!, { type: "next" });
    }
    expect(r.status).toBe("done");
    expect(r.tournament.totals.Cy).toBe(2);
    expect(r.tournament.games[1].awards).toEqual({ Ann: 2, Bob: 2 });
    expect(r.tournament.totals.Ann).toBe(4);
  });

  it("ending early sets done and later finishes change nothing", () => {
    const { r, tokens } = lobby();
    startTournament(r, tokens.Ann!, ["insync", "insync"]);
    expect(endTournament(r, tokens.Bob!)).toMatchObject({ error: expect.any(String) });
    expect(endTournament(r, tokens.Ann!)).toEqual({ ok: true });
    expect(r.tournament.done).toBe(true);
    playSync(r, tokens);
    expect(r.tournament).toMatchObject({ done: true, index: 0, totals: {} });
  });

  it("a new tournament replaces a finished one", () => {
    const { r, tokens } = lobby();
    startTournament(r, tokens.Ann!, ["insync", "vote"]);
    endTournament(r, tokens.Ann!);
    expect(startTournament(r, tokens.Ann!, ["vote", "insync"])).toEqual({ ok: true });
    expect(r.tournament).toMatchObject({ plan: ["vote", "insync"], done: false });
  });

  it("the snapshot has standings for every seat, even with no token, and never lists the screen seat", () => {
    const { r, tokens } = lobby("insync", ["Ann", "Bob", "Cy"]);
    expect(setScreen(r, tokens.Ann!, true)).toEqual({ ok: true });
    startTournament(r, tokens.Ann!, ["insync", "vote"]);
    for (const tok of [null, tokens.Ann!, tokens.Bob!, "bad"]) {
      const t = snapshot(r, tok).tournament!;
      expect(t.standings.map((s) => s.name).sort()).toEqual(["Bob", "Cy"]);
    }
    expect(snapshot({ ...r, tournament: undefined } as any, null).tournament).toBeUndefined();
  });
});

describe("a topic per planned game", () => {
  it("an old plan of format names still works, every slot's topic unset", () => {
    const { r, tokens } = lobby();
    expect(startTournament(r, tokens.Ann!, ["insync", "vote"])).toEqual({ ok: true });
    expect(r.tournament).toMatchObject({ plan: ["insync", "vote"], topics: [null, null] });
  });

  it("stores each slot's topics, de-duplicated, mixing old and new entries", () => {
    const { r, tokens } = lobby("insync", ["Ann", "Bob", "Cy"]);
    const plan = [
      { format: "imposter", pools: ["villains"] },
      { format: "vowelparty", pools: ["superheroes", "villains", "superheroes"] },
      { format: "vote" },
      "insync",
      { format: "snake", pools: ["superheroes"] },
      { format: "vote", pools: null },
    ];
    expect(startTournament(r, tokens.Ann!, plan)).toEqual({ ok: true });
    expect(r.tournament.plan).toEqual(["imposter", "vowelparty", "vote", "insync", "snake", "vote"]);
    expect(r.tournament.topics).toEqual([["villains"], ["superheroes", "villains"], null, null, ["superheroes"], null]);
  });

  it("refuses an unknown topic, an empty list, topics on Mafia, and bad entries, with a clear error", () => {
    const { r, tokens } = lobby();
    const bad: unknown[] = [
      [{ format: "imposter", pools: ["nope"] }, "vote"],
      [{ format: "vowelparty", pools: [] }, "vote"],
      [{ format: "mafia", pools: ["mafia"] }, "vote"],
      [{ format: "vote", pools: "classics" }, "vote"],
      [{ format: "nope" }, "vote"],
      [{ pools: ["villains"] }, "vote"],
      [null, "vote"],
      [{ format: "snake", pools: ["nope"] }, "vote"],
      [{ format: "snake", pools: ["superheroes", "villains"] }, "vote"],
    ];
    for (const plan of bad) {
      const out = startTournament(r, tokens.Ann!, plan) as { error: string };
      expect(out.error).toEqual(expect.any(String));
      expect(out.error.length).toBeGreaterThan(5);
    }
    expect((startTournament(r, tokens.Ann!, [{ format: "imposter", pools: ["nope"] }, "vote"]) as { error: string }).error).toMatch(/game 1/i);
    expect(r.tournament).toBeUndefined();
  });

  it("a draft slot takes at most one topic", () => {
    const { r, tokens } = lobby();
    expect((startTournament(r, tokens.Ann!, ["vote", { format: "snake", pools: ["superheroes", "villains"] }]) as { error: string }).error).toMatch(/Game 2 .*one topic/);
    expect(r.tournament).toBeUndefined();
    expect(startTournament(r, tokens.Ann!, ["vote", { format: "snake", pools: ["villains", "villains"] }])).toEqual({ ok: true }); // a repeat is one topic
    expect(r.tournament.topics).toEqual([null, ["villains"]]);
  });

  it("Mafia and games without topics take null", () => {
    const { r, tokens } = lobby();
    expect(startTournament(r, tokens.Ann!, [{ format: "mafia" }, { format: "insync", pools: ["music"] }])).toEqual({ ok: true });
    expect(r.tournament.topics).toEqual([null, ["music"]]);
  });

  it("the snapshot carries the topics for every seat, even with no token, and they survive finished games", () => {
    const { r, tokens } = lobby();
    startTournament(r, tokens.Ann!, [{ format: "insync", pools: ["music"] }, { format: "vote" }]);
    for (const tok of [null, tokens.Ann!, tokens.Bob!, "bad"]) expect(snapshot(r, tok).tournament!.topics).toEqual([["music"], null]);
    playSync(r, tokens);
    expect(snapshot(r, null).tournament).toMatchObject({ index: 1, topics: [["music"], null] });
  });
});

describe("draft verdicts", () => {
  function draft() {
    const { r, tokens } = lobby("snake", ["Ann", "Bob"]);
    startTournament(r, tokens.Ann!, ["snake", "snake"]);
    startRoom(r, tokens.Ann!);
    for (let g = 0; r.status === "playing" && g++ < 60; ) act(r, tokens[currentTurn(r.setup, r.state!)!]!, { type: "auto" });
    expect(r.status).toBe("done");
    return { r, tokens };
  }
  const verdict = { winner: "Bob", teams: [{ player: "Ann", score: 10 }, { player: "Bob", score: 90 }] };

  it("credits the verdict to the game that produced it, even after the next game started", async () => {
    const { r, tokens } = draft();
    expect(r.tournament).toMatchObject({ index: 1, totals: {} });
    setGame(r, tokens.Ann!, base("snake"));
    startRoom(r, tokens.Ann!);
    expect(r.tournament.games).toHaveLength(1);
    resolvers[0]!(verdict);
    await new Promise((x) => setTimeout(x, 0));
    expect(r.tournament.games[0].awards).toEqual({ Bob: 5, Ann: 3 });
    expect(r.tournament.totals).toEqual({ Bob: 5, Ann: 3 });
  });

  it("a failed judge gives everyone the rest, and an early end freezes totals", async () => {
    const { r, tokens } = draft();
    resolvers[0]!(null);
    await new Promise((x) => setTimeout(x, 0));
    expect(r.tournament.totals).toEqual({ Ann: 1, Bob: 1 });
    setGame(r, tokens.Ann!, base("snake"));
    startRoom(r, tokens.Ann!);
    expect(endTournament(r, tokens.Ann!)).toEqual({ ok: true }); // ended mid-game
    for (let g = 0; r.status === "playing" && g++ < 60; ) act(r, tokens[currentTurn(r.setup, r.state!)!]!, { type: "auto" });
    const second = resolvers.length - 1;
    resolvers[second]!(verdict);
    await new Promise((x) => setTimeout(x, 0));
    expect(r.tournament.totals).toEqual({ Ann: 1, Bob: 1 });
  });


  it("a draft as the last game: done while pending, credited later, and ending again keeps it pending", async () => {
    const { r, tokens } = lobby("snake", ["Ann", "Bob"]);
    startTournament(r, tokens.Ann!, ["snake", "snake"]);
    for (let n = 0; n < 2; n++) {
      if (n) setGame(r, tokens.Ann!, base("snake"));
      startRoom(r, tokens.Ann!);
      for (let g = 0; r.status === "playing" && g++ < 60; ) act(r, tokens[currentTurn(r.setup, r.state!)!]!, { type: "auto" });
    }
    expect(r.tournament.done).toBe(true);
    expect(endTournament(r, tokens.Ann!)).toEqual({ ok: true });
    expect(r.tournamentEnded).toBeFalsy();
    resolvers[1]!(verdict);
    await new Promise((x) => setTimeout(x, 0));
    expect(r.tournament.games[1].awards).toEqual({ Bob: 5, Ann: 3 });
    expect(r.tournament.totals).toEqual({ Bob: 5, Ann: 3 });
  });

  it("a late verdict after the tournament was replaced is ignored", async () => {
    const { r, tokens } = draft();
    setGame(r, tokens.Ann!, base("insync"));
    r.status = "lobby";
    expect(startTournament(r, tokens.Ann!, ["vote", "insync"])).toEqual({ ok: true });
    resolvers[0]!(verdict);
    await new Promise((x) => setTimeout(x, 0));
    expect(r.tournament).toMatchObject({ plan: ["vote", "insync"], games: [], totals: {} });
  });

  it("standings leave out the screen seat even if it had points", () => {
    const { r, tokens } = lobby("insync", ["Ann", "Bob", "Cy"]);
    startTournament(r, tokens.Ann!, ["insync", "insync"]);
    r.tournament.totals = { Ann: 2, Bob: 2, Cy: 2 };
    setScreen(r, tokens.Ann!, true);
    expect(snapshot(r, null).tournament!.standings.map((s) => s.name).sort()).toEqual(["Bob", "Cy"]);
  });
});
