import { describe, expect, it } from "vitest";
import { DEFAULT_OPTS, type GameSetup } from "../../play/types";
import type { GameState } from "../core";
import { answer, init, tick, type NPState } from "../formats/npat";
import { setHistorySource, setListSource, type NpatEntry } from "../npat/source";
import { addGame, awardsFor, rankAwards, standings, type Tournament } from "./tournament";

const setup = (format: GameSetup["format"], players: string[], opts: Partial<GameSetup["opts"]> = {}): GameSetup =>
  ({ id: "x", format, pool: "p", players, aiPlayers: [], mission: {}, mystery: false, loadout: null, roles: [], opts: { ...DEFAULT_OPTS, ...opts }, seed: 1 }) as unknown as GameSetup;
const st = (o: object) => o as unknown as GameState;

describe("rankAwards", () => {
  it("ties share the higher place and the next score skips", () => {
    expect(rankAwards({ a: 9, b: 9, c: 4, d: 1 })).toEqual({ a: 5, b: 5, c: 2, d: 1 });
  });
});

describe("awardsFor", () => {
  it("ranks per-player points", () => {
    const a = awardsFor(setup("vote", ["a", "b", "c", "d"]), st({ points: { a: 1, b: 9, c: 5, d: 0 } }), ["a", "b", "c", "d"]);
    expect(a).toEqual({ a: 2, b: 5, c: 3, d: 1 });
  });
  it("gives a seated player with no points entry the rest, and a left player nothing", () => {
    const a = awardsFor(setup("imposter", ["a", "b", "c"]), st({ points: { a: 2, b: 0 } }), ["a", "c"]);
    expect(a).toEqual({ a: 5, c: 1 });
  });
  it("a left player's points do not take a place", () => {
    expect(awardsFor(setup("jeopardy", ["a", "b"]), st({ points: { a: 900, b: 100 } }), ["b"])).toEqual({ b: 5 });
  });
  it("returns null when nobody is seated", () => {
    expect(awardsFor(setup("vote", ["a"]), st({ points: { a: 1 } }), [])).toBeNull();
  });
  it("Party Trivia teams use team points for every teammate", () => {
    const state = st({ teams: [["a", "b"], ["c", "d"], ["e", "f"]], teamPoints: [3, 10, 3], points: {} });
    const a = awardsFor(setup("partytrivia", ["a", "b", "c", "d", "e", "f"]), state, ["a", "b", "c", "d", "e"]);
    expect(a).toEqual({ a: 3, b: 3, c: 5, d: 5, e: 3 });
  });
  it("vote teams sum their players' points", () => {
    const s = setup("vote", ["a", "b", "c", "d"], { teams: 2, teamMap: { a: 0, b: 0, c: 1, d: 1 } });
    expect(awardsFor(s, st({ points: { a: 1, b: 1, c: 5, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 3, b: 3, c: 5, d: 5 });
  });
  it("teams are ignored below four players", () => {
    const s = setup("vowelparty", ["a", "b", "c"], { teams: 2, teamMap: { a: 0, b: 1, c: 1 } });
    expect(awardsFor(s, st({ points: { a: 5, b: 1, c: 0 }, mode: "all" }), ["a", "b", "c"])).toEqual({ a: 5, b: 3, c: 2 });
  });
  it("Pecking ranks per-player points, ties share a place", () => {
    const s = setup("pecking", ["a", "b", "c", "d"]);
    expect(awardsFor(s, st({ points: { a: 80, b: 80, c: 10, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 5, b: 5, c: 2, d: 1 });
  });
  it("Pecking teams rank by summed member points", () => {
    const s = setup("pecking", ["a", "b", "c", "d"], { teams: 2, teamMap: { a: 0, b: 0, c: 1, d: 1 } });
    expect(awardsFor(s, st({ points: { a: 40, b: 40, c: 90, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 3, b: 3, c: 5, d: 5 });
  });
  it("Say Less ranks per-player points, ties share a place", () => {
    const s = setup("sayless", ["a", "b", "c", "d"]);
    expect(awardsFor(s, st({ points: { a: 12, b: 12, c: 4, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 5, b: 5, c: 2, d: 1 });
  });
  it("Say Less teams rank by summed member points, using the teams the engine played", () => {
    const s = setup("sayless", ["a", "b", "c", "d"], { teams: 2, teamMap: { a: 0, b: 0, c: 1, d: 1 } });
    expect(awardsFor(s, st({ teams: [["a", "b"], ["c", "d"]], points: { a: 4, b: 4, c: 9, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 3, b: 3, c: 5, d: 5 });
  });
  it("Say Less with a 3-1 team map played solo, so it awards by each player's points", () => {
    const s = setup("sayless", ["a", "b", "c", "d"], { teams: 2, teamMap: { a: 0, b: 0, c: 0, d: 1 } });
    expect(awardsFor(s, st({ teams: null, points: { a: 4, b: 2, c: 9, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 3, b: 2, c: 5, d: 1 });
  });
  it("NPAT ranks per-player points, ties share a place", () => {
    const s = setup("npat", ["a", "b", "c", "d"]);
    expect(awardsFor(s, st({ teams: null, points: { a: 30, b: 30, c: 10, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 5, b: 5, c: 2, d: 1 });
  });
  it("NPAT teams rank by the engine's team points, not summed member points", () => {
    const s = setup("npat", ["a", "b", "c", "d"], { teams: 2, teamMap: { a: 0, b: 0, c: 1, d: 1 } });
    // Members' sums say team 1 (9 + 0) leads team 0 (4 + 4), but the game's team points put team 0 ahead.
    expect(awardsFor(s, st({ teams: [["a", "b"], ["c", "d"]], teamPoints: [9, 4], points: { a: 4, b: 4, c: 9, d: 0 } }), ["a", "b", "c", "d"])).toEqual({ a: 5, b: 5, c: 3, d: 3 });
  });
  const duel = (rope: number, forfeit: string | null = null) => st({ mode: "duel", players: ["a", "b"], rope, forfeit, points: {} });
  it("duel winner 5/1, draw 3 each", () => {
    const s = setup("vowelplay", ["a", "b"], { vowelMode: "duel" });
    expect(awardsFor(s, duel(2), ["a", "b"])).toEqual({ a: 5, b: 1 });
    expect(awardsFor(s, duel(-1), ["a", "b"])).toEqual({ a: 1, b: 5 });
    expect(awardsFor(s, duel(0), ["a", "b"])).toEqual({ a: 3, b: 3 });
  });
  it("duel forfeit: the player who stayed wins, whatever the rope says", () => {
    const s = setup("vowelplay", ["a", "b"], { vowelMode: "duel" });
    expect(awardsFor(s, duel(-3, "a"), ["b"])).toEqual({ b: 5 });
  });
  it("duel with one player left: the winner gets nothing if they left", () => {
    const s = setup("vowelplay", ["a", "b"], { vowelMode: "duel" });
    expect(awardsFor(s, duel(2), ["b"])).toEqual({ b: 1 });
    expect(awardsFor(s, duel(0), ["b"])).toEqual({ b: 3 });
  });
  it("first-mode Vowel Play ranks points", () => {
    const s = setup("vowelplay", ["a", "b"]);
    expect(awardsFor(s, st({ mode: "first", players: ["a", "b"], points: { a: 1, b: 4 } }), ["a", "b"])).toEqual({ a: 3, b: 5 });
  });
  it("mafia: winning side 5, others 1; no winner gives null", () => {
    const roles = { a: "mafia", b: "villager", c: "doctor" };
    const s = setup("mafia", ["a", "b", "c"]);
    expect(awardsFor(s, st({ roles, winner: "village" }), ["a", "b", "c"])).toEqual({ a: 1, b: 5, c: 5 });
    expect(awardsFor(s, st({ roles, winner: "mafia" }), ["a", "b", "c"])).toEqual({ a: 5, b: 1, c: 1 });
    expect(awardsFor(s, st({ roles, winner: null }), ["a", "b", "c"])).toBeNull();
  });
  it("insync gives everyone 2", () => {
    expect(awardsFor(setup("insync", ["a", "b"]), st({}), ["a", "b"])).toEqual({ a: 2, b: 2 });
  });
  it("drafts rank the verdict; no verdict gives everyone 1", () => {
    const s = setup("snake", ["a", "b", "c"]);
    const verdict = { teams: [{ player: "a", score: 50 }, { player: "b", score: 80 }, { player: "c", score: 50 }] };
    expect(awardsFor(s, st({}), ["a", "b", "c"], verdict)).toEqual({ a: 3, b: 5, c: 3 });
    expect(awardsFor(s, st({}), ["a", "b", "c"], null)).toEqual({ a: 1, b: 1, c: 1 });
    expect(awardsFor(s, st({}), ["a", "b", "c"])).toEqual({ a: 1, b: 1, c: 1 });
  });
});

const empty: Tournament = { plan: ["vote", "insync"], topics: [null, null], index: 0, games: [], totals: {}, done: false };

describe("awardsFor on a real NPAT game", () => {
  // Fixture list: only H has the 15 answers a letter needs, so every round is H.
  const filler = Array.from({ length: 15 }, (_, i): NpatEntry => ({ name: `H filler ${i}`, tier: "common" }));
  const LIST: NpatEntry[] = [{ name: "Hawkeye", tier: "rare" }, { name: "Hela", tier: "rare" }, { name: "Havok", tier: "solid" }, { name: "Hulk", tier: "unicorn" }, ...filler];
  const P = ["a", "b", "c", "d"];
  const played = (teamMap: Record<string, number>, rows: Record<string, string>): NPState => {
    setListSource((c) => (c === "superhero" ? LIST : []));
    setHistorySource(null);
    let s = init({ players: P, categories: ["superhero"], rounds: 1, teams: 2, teamMap, seed: 3, now: 0 });
    for (const [p, t] of Object.entries(rows)) s = answer(s, p, 0, t, 1);
    for (let i = 0; i < 20 && !s.done; i++) s = tick(s, s.phaseAt + 600_000);
    expect(s.done).toBe(true);
    return s;
  };

  it("teammates sharing an answer: the team the game ranks first is the one the tournament ranks first", () => {
    // Team 0 both give the same Rare (60 each, counted once: 60). Team 1 gives a Solid and a Rare (30 + 60 = 90).
    const s = played({ a: 0, b: 0, c: 1, d: 1 }, { a: "Hawkeye", b: "Hawkeye", c: "Havok", d: "Hela" });
    expect(s.teamPoints).toEqual([60, 90]);
    expect(awardsFor(setup("npat", P, { teams: 2 }), st(s), P)).toEqual({ a: 3, b: 3, c: 5, d: 5 });
  });

  it("a lopsided 3-1 team map plays as those teams, ranked by the game's team points", () => {
    // Members' sums would say 180 to 100; the game counts the shared Rare once, so the lone Unicorn wins 100 to 60.
    const s = played({ a: 0, b: 0, c: 0, d: 1 }, { a: "Hawkeye", b: "Hawkeye", c: "Hawkeye", d: "Hulk" });
    expect(s.teams).toEqual([["a", "b", "c"], ["d"]]);
    expect(s.teamPoints).toEqual([60, 100]);
    expect(awardsFor(setup("npat", P, { teams: 2, teamMap: { a: 0, b: 0, c: 0, d: 1 } }), st(s), P)).toEqual({ a: 3, b: 3, c: 3, d: 5 });
  });
});

describe("addGame and standings", () => {
  it("adds awards, advances and finishes", () => {
    const t1 = addGame(empty, "vote", "Vote", { a: 5, b: 1 });
    expect(t1).toMatchObject({ index: 1, totals: { a: 5, b: 1 }, done: false });
    const t2 = addGame(t1, "insync", "Sync", { a: 2, b: 2 });
    expect(t2).toMatchObject({ index: 2, totals: { a: 7, b: 3 }, done: true });
    expect(addGame(empty, "vote", "Vote", null).totals).toEqual({});
  });
  it("addGame does not mutate its input", () => {
    const t: Tournament = { plan: ["vote", "insync"], topics: [null, null], index: 0, games: [], totals: { a: 1 }, done: false };
    const copy = structuredClone(t);
    addGame(t, "vote", "V", { a: 5 });
    expect(t).toEqual(copy);
  });
  it("lists present players before left players on equal totals", () => {
    const t = addGame(empty, "vote", "V", { gone: 3, here: 3 });
    expect(standings(t, ["here"]).map((r) => r.name)).toEqual(["here", "gone"]);
    expect(standings(t, ["here"]).map((r) => r.rank)).toEqual([1, 1]);
  });
  it("sorts, shares rank, lists left players and zero-point newcomers", () => {
    const t = addGame(addGame(empty, "vote", "V", { a: 5, b: 5, c: 1 }), "insync", "S", { a: 2, b: 2 });
    const rows = standings(t, ["a", "b", "d"]);
    expect(rows).toEqual([
      { name: "a", total: 7, last: 2, left: false, rank: 1 },
      { name: "b", total: 7, last: 2, left: false, rank: 1 },
      { name: "c", total: 1, last: 0, left: true, rank: 3 },
      { name: "d", total: 0, last: 0, left: false, rank: 4 },
    ]);
  });
});
