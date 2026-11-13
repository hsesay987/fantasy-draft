import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { _rooms, act, createRoom, joinRoom, leaveRoom, sanitizeSetup, setGame, snapshot, startRoom, startTournament } from "./playRooms";
import type { PeckState } from "../shared/topicDraft/formats/pecking";

const LIST = "films-boxoffice";
const peck = (opts: any = {}, top: any = {}) => ({ format: "pecking", pool: LIST, opts: { teamSize: 4, ...opts }, ...top });

function seated(names: string[], setup: any = peck()) {
  const made = createRoom(setup, names[0]!) as any;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
  return { r: made.room, toks };
}
function running(names: string[], setup: any = peck()) {
  const made = seated(names, setup);
  expect(startRoom(made.r, made.toks[names[0]!])).toEqual({ ok: true });
  return made;
}
const state = (r: any) => r.state as PeckState;
const asked = (r: any) => state(r).questions[state(r).round]!;

/** Answers the asked question for one seat: exact when `good`, else as far off as the list allows. */
function answer(r: any, tok: string, good = true) {
  const q = asked(r);
  if (q.kind === "rank") return act(r, tok, { type: "answer", rank: good ? q.answer.span[0] : q.answer.span[0] > q.size / 2 ? 1 : q.size });
  const far = q.pool!.filter((p) => !state(r).taken.includes(p.name)).sort((a, b) => Math.abs(b.span[0] - q.at!) - Math.abs(a.span[0] - q.at!))[0]!.name;
  const exact = q.answer.names.find((n) => !state(r).taken.includes(n)) ?? far;
  return act(r, tok, { type: "pick", name: good ? exact : far });
}

/** Plays to the end: Ann answers exactly, everyone else far off, and the host moves each reveal on. */
function playOut(r: any, toks: Record<string, string>) {
  for (let i = 0; i < 40 && r.status === "playing"; i++) {
    for (const n of Object.keys(toks)) if (state(r).phase === "question") answer(r, toks[n]!, n === "Ann");
    act(r, toks.Ann!, { type: "next" });
  }
  expect(r.status).toBe("done");
}

beforeEach(() => _rooms.clear());

describe("Pecking Order setup", () => {
  it("snaps the question count to 4, 6, 8 or 10, defaulting to 6", () => {
    const n = (teamSize: unknown) => sanitizeSetup({ format: "pecking", pool: LIST, opts: { teamSize } })!.opts.teamSize;
    expect(n(undefined)).toBe(6);
    expect(n("nope")).toBe(6);
    expect(n(3)).toBe(4);
    expect(n(7)).toBe(6);
    expect(n(9)).toBe(8);
    expect(n(50)).toBe(10);
    expect(n(10)).toBe(10);
  });

  it("checks the mode (mixed by default), titles the game, and plays on phones", () => {
    const s = sanitizeSetup({ format: "pecking", pool: LIST, opts: { peckMode: "bogus", answer: "buzz" } })!;
    expect(s.opts.peckMode).toBe("mixed");
    expect(s.opts.answer).toBe("phones");
    expect(s.mission.title).toBe("Pecking Order: Highest-grossing films");
    expect(sanitizeSetup({ format: "pecking", pool: LIST, opts: { peckMode: "name" } })!.opts.peckMode).toBe("name");
    expect(sanitizeSetup({ format: "pecking", pool: LIST, opts: { peckMode: "rank" } })!.opts.peckMode).toBe("rank");
  });

  it("takes several lists, refuses unknown ones, and allows teams", () => {
    const s = sanitizeSetup({ format: "pecking", pool: LIST, pools: [LIST, "rivers", LIST], opts: { teams: 2, teamMap: { Ann: 0, Bob: 1 } } })!;
    expect(s.pools).toEqual([LIST, "rivers"]);
    expect(s.opts.teams).toBe(2);
    expect(sanitizeSetup({ format: "pecking", pool: "superheroes" })).toBeNull();
  });
});

describe("Pecking Order hidden info", () => {
  const NAMES = ["Ann", "Bob", "Cy"];
  for (const mode of ["name", "rank"] as const) {
    it(`a ${mode} question shows no answer, pool or span to any seat or viewer, and blanks other seats' guesses`, () => {
      const { r, toks } = running(NAMES, peck({ peckMode: mode }));
      expect(asked(r).kind).toBe(mode);
      answer(r, toks.Ann!);
      answer(r, toks.Bob!);
      expect(state(r).phase).toBe("question");
      for (const tok of [toks.Ann!, toks.Bob!, toks.Cy!, null, "bad"]) {
        const snap = snapshot(r, tok) as any;
        // `setup.pool` (the list id) and `played[].pool` are public, so the engine's pool is checked on the state.
        const json = JSON.stringify(snap.state);
        expect(json).not.toContain('"pool"');
        expect(JSON.stringify(snap)).not.toContain('"span"');
        expect(JSON.stringify(snap)).not.toContain('"aliases"');
        const q = snap.state.questions[snap.state.round];
        expect(q).not.toHaveProperty("answer");
        expect(snap.state.questions).toHaveLength(1); // later questions are not sent
        if (mode === "name") {
          expect(q.choices.length).toBeGreaterThan(10);
          expect(snap.state.taken).toEqual(state(r).taken);
          expect(snap.state.taken).toHaveLength(2); // Ann's and Bob's picks are both list names
        }
        const me = snap.me;
        for (const [p, a] of Object.entries(snap.state.answers) as [string, any][]) {
          if (p === me) expect(a).toEqual(state(r).answers[p]);
          else expect(a).toEqual({ guess: null, at: 0 });
        }
        expect(snap.setup.seed).toBe(0);
        expect(snap.setup.opts.avoid).toEqual([]);
      }
    });
  }

  it("once done, the questions open up but the pool still never leaves the server", () => {
    const { r, toks } = running(NAMES, peck({ peckMode: "name" }));
    playOut(r, toks);
    for (const tok of [toks.Ann!, null]) {
      const json = JSON.stringify((snapshot(r, tok) as any).state);
      expect(json).not.toContain('"pool"');
      expect(JSON.stringify(snapshot(r, tok))).not.toContain('"aliases"');
      expect((snapshot(r, tok) as any).setup.seed).toBe(0);
      expect((snapshot(r, tok) as any).state.questions[0].answer).toBeDefined();
    }
    expect(JSON.stringify(r.played)).not.toContain('"span"');
  });
});

describe("Pecking Order play", () => {
  it("a name already claimed is refused, listed as taken, and that seat can pick another", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"], peck({ peckMode: "name" }));
    const name = asked(r).answer.names[0]!;
    expect(act(r, toks.Ann!, { type: "pick", name })).toEqual({ ok: true });
    expect(act(r, toks.Bob!, { type: "pick", name })).toMatchObject({ ok: false });
    expect((snapshot(r, toks.Bob!) as any).state.taken).toContain(name);
    const other = asked(r).pool!.find((p) => p.name !== name)!.name;
    expect(act(r, toks.Bob!, { type: "pick", name: other })).toEqual({ ok: true });
  });

  it("refuses malformed answers and picks", () => {
    const rank = running(["Ann", "Bob"], peck({ peckMode: "rank" }));
    expect(act(rank.r, rank.toks.Ann!, { type: "answer", rank: "3" })).toMatchObject({ ok: false });
    expect(act(rank.r, rank.toks.Ann!, { type: "answer" })).toMatchObject({ ok: false });
    expect(act(rank.r, rank.toks.Ann!, { type: "answer", rank: 3 })).toEqual({ ok: true });
    _rooms.clear();
    const name = running(["Ann", "Bob"], peck({ peckMode: "name" }));
    expect(act(name.r, name.toks.Ann!, { type: "pick", name: 5 })).toMatchObject({ ok: false });
    expect(act(name.r, name.toks.Ann!, { type: "pick", name: "x".repeat(61) })).toMatchObject({ ok: false });
    expect(act(name.r, name.toks.Ann!, { type: "pick", name: "Not a film at all" })).toEqual({ ok: true });
  });

  it("a seat that leaves after the others answered reveals the question", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"], peck({ peckMode: "rank" }));
    answer(r, toks.Ann!);
    answer(r, toks.Bob!);
    expect(state(r).phase).toBe("question");
    leaveRoom(r, toks.Cy!);
    expect(state(r).phase).toBe("reveal");
  });

  it("only the host moves a reveal on", () => {
    const { r, toks } = running(["Ann", "Bob"], peck({ peckMode: "rank" }));
    answer(r, toks.Ann!);
    answer(r, toks.Bob!);
    expect(state(r).phase).toBe("reveal");
    expect(act(r, toks.Bob!, { type: "next" })).toMatchObject({ ok: false });
    expect(state(r).phase).toBe("reveal");
    expect(act(r, toks.Ann!, { type: "next" })).toEqual({ ok: true });
    expect(state(r).round).toBe(1);
  });

  it("records the top scorer as the winner", () => {
    const { r, toks } = running(["Ann", "Bob"], peck({ peckMode: "rank" }));
    playOut(r, toks);
    expect(r.played.at(-1)).toMatchObject({ format: "pecking", winner: "Ann" });
  });

  it("a team game has no single winner", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy", "Di"], peck({ peckMode: "rank", teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0, Di: 1 } }));
    playOut(r, toks);
    expect(r.played.at(-1)).toMatchObject({ format: "pecking", winner: null });
  });

  it("a rematch avoids the items of the first game", () => {
    const { r, toks } = running(["Ann", "Bob"], peck({ peckMode: "rank", teamSize: 10 }));
    const first = state(r).questions.map((q) => q.item);
    playOut(r, toks);
    expect(r.seen.filter((k: string) => k.startsWith("pk:"))).toHaveLength(10);
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(r.setup.opts.avoid).toHaveLength(10);
    const second = state(r).questions.map((q) => q.item);
    expect(second).toHaveLength(10);
    expect(second.filter((x) => first.includes(x))).toEqual([]);
  });
});

describe("Pecking Order in a tournament", () => {
  it("a 4-game tournament with Pecking Order credits awards for each game", () => {
    const { r, toks } = seated(["Ann", "Bob"], peck({ peckMode: "mixed" }));
    expect(startTournament(r, toks.Ann!, [{ format: "pecking", pools: [LIST] }, "pecking", { format: "pecking", pools: ["rivers", LIST] }, "pecking"])).toEqual({ ok: true });
    for (let g = 0; g < 4; g++) {
      if (g > 0) expect(setGame(r, toks.Ann!, peck({ peckMode: g % 2 ? "name" : "rank" }, g === 2 ? { pools: ["rivers", LIST] } : {}))).toEqual({ ok: true });
      expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
      playOut(r, toks);
      expect(r.tournament.games[g].awards).toEqual({ Ann: 5, Bob: 3 });
    }
    expect(r.tournament).toMatchObject({ index: 4, done: true, totals: { Ann: 20, Bob: 12 } });
  });
});
