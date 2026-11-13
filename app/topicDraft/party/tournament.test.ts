import { describe, expect, it } from "vitest";
import { DEFAULT_OPTS, type GameSetup } from "../../play/types";
import type { GameState } from "../core";
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
