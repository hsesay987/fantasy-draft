import { describe, it, expect } from "vitest";
import { applyAction, autoAction, buildTeams, initGame, isDone } from "../core";
import { getCatalog } from "../catalogs";
import { missionsFor } from "../missions";
import { DEFAULT_OPTS, type FormatId, type GameSetup } from "../../play/types";
import { localVerdict } from "../../play/judging";
import * as K from "./keep";
import * as PR from "./price";
import * as FD from "./feud";
import * as J from "./jeopardy";
import { questionsFor, surveysFor, TRIVIA_POOLS } from "../trivia";
import { usableCats } from "./jeopardy";

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
        const v = localVerdict(teams, setup.mission);
        expect(JSON.stringify(v)).not.toContain("NaN");
        expect(v.winner).toBeTruthy();
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
  const surveys = surveysFor("superheroes");
  const s0 = FD.init({ players: ["A", "B"], surveys, rounds: 3, seed: 3 });
  it("board has five answers and shuffled options include wrong ones", () => {
    const r = s0.rounds[0]!;
    expect(r.board).toHaveLength(5);
    expect(r.options.length).toBeGreaterThan(5);
    expect(new Set(r.options).size).toBe(r.options.length);
  });
  it("three strikes end the round", () => {
    let s = s0;
    const wrong = s.rounds[0]!.options.filter((a) => !s.rounds[0]!.board.includes(a));
    for (let i = 0; i < 3; i++) s = FD.choose(s, FD.turnPlayer(s)!, wrong[i]!);
    expect(s.round).toBe(1);
  });
});

describe("jeopardy", () => {
  const s0 = J.init({ players: ["A", "B"], questions: questionsFor("anime"), seed: 4 });
  it("builds a 4x4 board of real questions", () => {
    expect(s0.cells).toHaveLength(16);
    for (const c of s0.cells) {
      expect(c.options).toContain(c.answer);
      expect(c.q.includes("?")).toBe(true);
    }
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

describe("trivia data", () => {
  for (const pool of TRIVIA_POOLS) {
    it(`${pool}: enough clean questions and surveys`, () => {
      const qs = questionsFor(pool);
      expect(usableCats(qs).length, "needs 4 categories with all 4 levels").toBeGreaterThanOrEqual(4);
      for (const q of qs) {
        expect(new Set([q.right, ...q.wrong]).size, q.q).toBe(4);
        expect(q.q.includes("?"), q.q).toBe(true);
      }
      const sv = surveysFor(pool);
      expect(sv.length).toBeGreaterThanOrEqual(5);
      for (const x of sv) {
        expect(x.answers, x.q).toHaveLength(5);
        expect(x.decoys.length, x.q).toBeGreaterThanOrEqual(3);
        expect(new Set([...x.answers, ...x.decoys]).size, x.q).toBe(x.answers.length + x.decoys.length);
      }
    });
  }
});
