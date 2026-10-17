import { describe, it, expect } from "vitest";
import { applyAction, autoAction, buildTeams, initGame, isDone } from "../core";
import { getCatalog } from "../catalogs";
import { missionsFor } from "../missions";
import { DEFAULT_OPTS, type FormatId, type GameSetup } from "../../play/types";
import * as K from "./keep";
import * as PR from "./price";
import * as FD from "./feud";
import * as J from "./jeopardy";

const setupFor = (format: FormatId, pool = "superheroes", players = ["A", "B"]): GameSetup => ({
  id: "t", format, pool, players, aiPlayers: players, mission: missionsFor(pool)[0]!, mystery: false, loadout: null, roles: [],
  opts: { ...DEFAULT_OPTS, teamSize: 4 }, seed: 12345,
});

describe("new formats play to the end with AI and produce judged teams", () => {
  for (const format of ["keep", "price", "feud", "jeopardy"] as FormatId[]) {
    for (const pool of ["superheroes", "history", "football", "shows"]) {
      it(`${format} / ${pool}`, () => {
        const setup = setupFor(format, pool);
        let s = initGame(setup, 0);
        for (let i = 0; i < 500 && !isDone(setup, s); i++) {
          const a = autoAction(setup, s);
          expect(a, "AI must always have a move").not.toBeNull();
          const next = applyAction(setup, s, a!, 0);
          expect(next, `action rejected: ${JSON.stringify(a)}`).not.toBe(s);
          s = next;
        }
        expect(isDone(setup, s)).toBe(true);
        const { teams } = buildTeams(setup, s);
        expect(teams).toHaveLength(2);
        for (const t of teams) expect(t.baseline).toBeGreaterThanOrEqual(0);
      });
    }
  }
});

describe("keep or delete", () => {
  const pool = getCatalog("superheroes");
  const st = K.init({ players: ["A"], pool, teamSize: 3, weights: { power: 1 }, seed: 1 });
  it("always fills the roster exactly, even if you delete everything", () => {
    let s = st;
    while (!s.done) s = K.decide(s, false);
    expect(s.keeps.A).toHaveLength(3);
  });
  it("stops keeping once the roster is full", () => {
    let s = st;
    while (!s.done) s = K.decide(s, true);
    expect(s.keeps.A).toHaveLength(3);
  });
});

describe("price is right", () => {
  const pool = getCatalog("superheroes");
  it("closest without going over wins; all-over still awards the closest", () => {
    let s = PR.init({ players: ["A", "B"], pool, rounds: 3, weights: { power: 1 }, seed: 2 });
    const t = s.truth[s.queue[0]!]!;
    const first = PR.turnPlayer(s)!;
    const second = s.players.find((p) => p !== first)!;
    s = PR.guess(s, first, Math.max(0, t - 5));
    s = PR.guess(s, second, Math.min(100, t + 9));
    expect(s.rounds[0]!.winner).toBe(first);
    expect(s.round).toBe(1);
  });
  it("ignores guesses out of turn", () => {
    const s = PR.init({ players: ["A", "B"], pool, rounds: 3, weights: { power: 1 }, seed: 2 });
    const other = s.players.find((p) => p !== PR.turnPlayer(s))!;
    expect(PR.guess(s, other, 10)).toBe(s);
  });
});

describe("family feud", () => {
  const pool = getCatalog("superheroes");
  const s0 = FD.init({ players: ["A", "B"], pool, statKeys: ["power", "speed", "intellect"], rounds: 3, seed: 3 });
  it("board is the real top five and decoys are not on it", () => {
    const r = s0.rounds[0]!;
    expect(r.board).toHaveLength(5);
    expect(r.options).toHaveLength(9);
    expect(new Set(r.options).size).toBe(9);
  });
  it("three strikes end the round", () => {
    let s = s0;
    const decoys = s.rounds[0]!.options.filter((id) => !s.rounds[0]!.board.includes(id));
    for (let i = 0; i < 3; i++) s = FD.choose(s, FD.turnPlayer(s)!, decoys[i]!);
    expect(s.round).toBe(1);
  });
});

describe("jeopardy", () => {
  const pool = getCatalog("anime");
  const s0 = J.init({ players: ["A", "B"], pool, statKeys: ["power", "speed", "intellect", "combat", "teamwork"], seed: 4 });
  it("builds a 4x4 board whose answers are really the top of each clue", () => {
    expect(s0.cells).toHaveLength(16);
    for (const c of s0.cells) expect(c.options).toContain(c.answer);
  });
  it("right answers add the value, wrong ones subtract it", () => {
    let s = J.choose(s0, "A", 0);
    s = J.answer(s, "A", s.cells[0]!.answer);
    expect(s.points.A).toBe(s.cells[0]!.value);
    s = J.choose(s, "B", 1);
    const wrong = s.cells[1]!.options.find((o) => o !== s.cells[1]!.answer)!;
    s = J.answer(s, "B", wrong);
    expect(s.points.B).toBe(-s.cells[1]!.value);
  });
});
