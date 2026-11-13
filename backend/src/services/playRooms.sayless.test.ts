import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { _rooms, act, createRoom, joinRoom, leaveRoom, sanitizeSetup, setGame, snapshot, startRoom, startTournament, tickRooms } from "./playRooms";
import type { SLState } from "../shared/topicDraft/formats/sayless";

const say = (opts: any = {}, top: any = {}) => ({ format: "sayless", pool: "easy", opts: { saylessRounds: 1, ...opts }, ...top });

function seated(names: string[], setup: any = say()) {
  const made = createRoom(setup, names[0]!) as any;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
  return { r: made.room, toks };
}
function running(names: string[], setup: any = say()) {
  const made = seated(names, setup);
  expect(startRoom(made.r, made.toks[names[0]!])).toEqual({ ok: true });
  return made;
}
const state = (r: any) => r.state as SLState;
const describer = (r: any) => state(r).turns[state(r).turn]!.describer;
/** The live word, read the way a phone would: from the describer's own snapshot. */
const secret = (r: any, toks: Record<string, string>) => (snapshot(r, toks[describer(r)]!) as any).state.word as { name: string; also?: string[]; id: string };
const guesser = (r: any) => state(r).guessers[0]!;

/** Plays to the end: the first guesser gets each word right, then the reveal is moved on. */
function playOut(r: any, toks: Record<string, string>) {
  for (let i = 0; i < 200 && r.status === "playing"; i++) {
    r.guessAt = undefined; // this helper guesses faster than the 3-a-second limit allows
    if (state(r).phase === "clue") expect(act(r, toks[guesser(r)]!, { type: "guess", text: secret(r, toks).name })).toEqual({ ok: true });
    else act(r, toks[describer(r)]!, { type: "next" });
  }
  expect(r.status).toBe("done");
}

beforeEach(() => _rooms.clear());

describe("Say Less setup", () => {
  it("snaps rounds and words per turn, reads the guard, and titles the game", () => {
    const s = (opts: any) => sanitizeSetup({ format: "sayless", pool: "easy", opts })!.opts;
    expect(s({}).saylessRounds).toBe(2);
    expect(s({}).saylessWords).toBe(3);
    expect(s({}).saylessGuard).toBe(false);
    expect(s({ saylessRounds: 9, saylessWords: 1, saylessGuard: "yes" })).toMatchObject({ saylessRounds: 3, saylessWords: 3, saylessGuard: false });
    expect(s({ saylessRounds: 1, saylessWords: 5, saylessGuard: true })).toMatchObject({ saylessRounds: 1, saylessWords: 5, saylessGuard: true });
    expect(s({ answer: "buzz", drinking: true })).toMatchObject({ answer: "buzz", drinking: true });
    expect(s({ answer: "nope" }).answer).toBe("phones");
    const mixed = sanitizeSetup({ format: "sayless", pool: "easy", pools: ["easy", "hard"], opts: { teams: 2, teamMap: { Ann: 0, Bob: 1 } } })!;
    expect(mixed.pools).toEqual(["easy", "hard"]);
    expect(mixed.mission.title).toMatch(/^Say Less: /);
    expect(mixed.opts.teams).toBe(2);
    expect(sanitizeSetup({ format: "sayless", pool: "not-a-deck" })).toBeNull();
  });
});

describe("Say Less hidden info", () => {
  const NAMES = ["Ann", "Bob", "Cy", "Di"];

  it("the live word reaches only its describer, for every seat and viewer, and opens up once the word ends", () => {
    const { r, toks } = running(NAMES);
    expect(act(r, toks[describer(r)]!, { type: "clue", text: "thing" })).toEqual({ ok: true });
    const w = secret(r, toks);
    expect(w.name).toBeTruthy();
    const words = [w.name, ...(w.also ?? [])];
    for (const tok of [...Object.values(toks), null, "bad"]) {
      const snap = snapshot(r, tok) as any;
      const json = JSON.stringify(snap);
      expect(json).not.toContain('"deal"');
      expect(snap.setup.seed).toBe(0);
      expect(snap.setup.opts.avoid).toEqual([]);
      expect(snap.state.history).toEqual([]); // only finished words
      if (tok === toks[describer(r)]) {
        expect(snap.state.word.name).toBe(w.name);
        continue;
      }
      expect(snap.state.word).toBeNull();
      expect(snap.state.current.name).toBe("");
      for (const x of words) expect(json.toLowerCase()).not.toContain(`"${x.toLowerCase()}"`);
      expect(json).not.toContain(w.id);
    }
    expect(act(r, toks[guesser(r)]!, { type: "guess", text: w.name })).toEqual({ ok: true });
    for (const tok of [toks[NAMES.find((n) => n !== describer(r))!]!, null]) {
      const snap = snapshot(r, tok) as any;
      expect(snap.state.current.name).toBe(w.name);
      expect(snap.state.history.map((h: any) => h.word)).toEqual([w.name]);
    }
  });

  it("stays redacted once done: no deal, no seed, no avoid list", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    playOut(r, toks);
    for (const tok of [toks.Ann!, null]) {
      const snap = snapshot(r, tok) as any;
      expect(JSON.stringify(snap)).not.toContain('"deal"');
      expect(snap.setup.seed).toBe(0);
      expect(snap.setup.opts.avoid).toEqual([]);
    }
  });
});

describe("Say Less play", () => {
  it("refuses the describer's guess, floods and long guesses; a right guess scores guesser and describer", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    const d = describer(r), g = guesser(r);
    const w = secret(r, toks).name;
    expect(act(r, toks[d]!, { type: "guess", text: w })).toMatchObject({ ok: false });
    expect(act(r, toks[g]!, { type: "guess", text: "x".repeat(61) })).toEqual({ ok: false, error: "That guess is too long" });
    expect(act(r, toks[g]!, { type: "guess", text: 5 })).toMatchObject({ ok: false });
    for (let i = 0; i < 3; i++) expect(act(r, toks[g]!, { type: "guess", text: "zzzz" })).toMatchObject({ ok: false, error: "Not allowed right now" });
    expect(act(r, toks[g]!, { type: "guess", text: w })).toEqual({ ok: false, error: "Slow down" });
    expect(state(r).phase).toBe("clue");
    const other = state(r).guessers.find((p) => p !== g)!;
    expect(act(r, toks[other]!, { type: "guess", text: w })).toEqual({ ok: true });
    expect(state(r).phase).toBe("reveal");
    expect(state(r).points[other]).toBeGreaterThan(0);
    expect(state(r).points[d]).toBe(state(r).points[other]);
    expect(state(r).points[g]).toBe(0);
    // Only the first right guess scores: the word is over.
    expect(act(r, toks[g]!, { type: "guess", text: w })).toMatchObject({ ok: false });
  });

  it("refuses malformed and flooding clues", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    const d = toks[describer(r)]!;
    expect(act(r, d, { type: "clue" })).toMatchObject({ ok: false });
    expect(act(r, d, { type: "clue", text: "x".repeat(61) })).toEqual({ ok: false, error: "That clue is too long" });
    expect(act(r, d, { type: "clue", text: "one" })).toEqual({ ok: true });
    expect(act(r, d, { type: "clue", text: "two" })).toEqual({ ok: true });
    expect(act(r, d, { type: "clue", text: "three" })).toEqual({ ok: true });
    expect(act(r, d, { type: "clue", text: "four" })).toEqual({ ok: false, error: "Slow down" });
    expect(act(r, toks[guesser(r)]!, { type: "mark" })).toMatchObject({ ok: false });
  });

  it("a refused clue says why in plain words and reaches the describer's snapshot, with a sip for saying the word", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"], say({ drinking: true }, { pool: "hard" }));
    // Pass until the word is one plain word of 4+ letters, so the clue below is the whole word.
    for (let i = 0; i < 20 && !/^[a-z]{4,}$/i.test(secret(r, toks).name); i++) {
      act(r, toks[describer(r)]!, { type: "pass" });
      act(r, toks[describer(r)]!, { type: "next" });
    }
    const d = describer(r);
    const w = secret(r, toks).name;
    expect(w).toMatch(/^[a-z]{4,}$/i);
    expect(act(r, toks[d]!, { type: "clue", text: "two words" })).toEqual({ ok: false, error: "One word only" });
    const first = (snapshot(r, toks[d]!) as any).state.refused;
    expect(first.reason).toBe("spaces");
    expect(act(r, toks[d]!, { type: "clue", text: `${w}x` })).toEqual({ ok: false, error: "That gives it away" });
    const snap = (snapshot(r, toks[d]!) as any).state;
    expect(snap.refused.seq).toBe(first.seq + 1);
    expect(snap.clues).toEqual([]);
    expect(snap.drinks.calls).toEqual([expect.objectContaining({ to: d, sips: 1 })]);
  });

  it("a describer leaving ends their word and the game goes on; all guessers gone doesn't stall", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    const d = describer(r);
    leaveRoom(r, toks[d]!);
    expect(r.status).toBe("playing");
    expect(state(r).turn).toBe(1);
    expect(describer(r)).not.toBe(d);
    expect(state(r).phase).toBe("clue");
    // Now the other guesser leaves too: the one left is the describer, with nobody to guess.
    const stay = describer(r);
    for (const n of ["Ann", "Bob", "Cy"]) if (n !== d && n !== stay) leaveRoom(r, toks[n]!);
    let t = Date.now();
    for (let i = 0; i < 50 && r.status === "playing"; i++) tickRooms((t += 5000));
    expect(r.status).toBe("done");
  });

  it("buzz mode: buzz, spoke, and the other seats' votes resolve; others' marks read voted while judging", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy", "Di"], say({ answer: "buzz" }));
    const d = describer(r);
    const [b, j1, j2] = ["Ann", "Bob", "Cy", "Di"].filter((n) => n !== d) as [string, string, string];
    expect(act(r, toks[b]!, { type: "guess", text: "anything" })).toMatchObject({ ok: false });
    expect(act(r, toks[b]!, { type: "buzz" })).toEqual({ ok: true });
    expect(act(r, toks[j1]!, { type: "buzz" })).toMatchObject({ ok: false });
    expect(act(r, toks[b]!, { type: "spoke" })).toEqual({ ok: true });
    expect(state(r).phase).toBe("judge");
    expect(act(r, toks[d]!, { type: "mark", verdict: "right" })).toMatchObject({ ok: false });
    expect(act(r, toks[j1]!, { type: "mark", verdict: "maybe" })).toMatchObject({ ok: false });
    expect(act(r, toks[j1]!, { type: "mark", verdict: "right" })).toEqual({ ok: true });
    expect((snapshot(r, toks[j2]!) as any).state.marks).toEqual({ [j1]: "voted" });
    expect((snapshot(r, toks[j1]!) as any).state.marks).toEqual({ [j1]: "right" });
    expect((snapshot(r, null) as any).state.marks).toEqual({ [j1]: "voted" });
    expect(act(r, toks[j2]!, { type: "mark", verdict: "right" })).toEqual({ ok: true });
    expect(state(r).phase).toBe("reveal");
    expect(state(r).history[0]!.winner).toBe(b);
  });

  it("records the top scorer, and a team game has no single winner", () => {
    const solo = running(["Ann", "Bob"]);
    playOut(solo.r, solo.toks);
    const pts = state(solo.r).points;
    expect(solo.r.played.at(-1)).toMatchObject({ format: "sayless", winner: pts.Ann === pts.Bob ? null : pts.Ann! > pts.Bob! ? "Ann" : "Bob" });
    _rooms.clear();
    const team = running(["Ann", "Bob", "Cy", "Di"], say({ teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0, Di: 1 } }));
    playOut(team.r, team.toks);
    expect(team.r.played.at(-1)).toMatchObject({ format: "sayless", winner: null });
  });

  it("teams: only the describer's team may guess", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy", "Di"], say({ teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0, Di: 1 } }));
    expect(state(r).teams).not.toBeNull();
    const d = describer(r);
    const mine = state(r).teams!.find((t) => t.includes(d))!;
    const theirs = state(r).teams!.find((t) => !t.includes(d))!;
    const w = secret(r, toks).name;
    expect(act(r, toks[theirs[0]!]!, { type: "guess", text: w })).toMatchObject({ ok: false });
    expect(state(r).phase).toBe("clue");
    expect(act(r, toks[mine.find((p) => p !== d)!]!, { type: "guess", text: w })).toEqual({ ok: true });
  });

  it("a rematch avoids the words of the first game", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    playOut(r, toks);
    const first = state(r).history.map((h) => h.word);
    expect(first).toHaveLength(6);
    expect(r.seen.filter((k: string) => k.startsWith("sl:"))).toHaveLength(6);
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(r.setup.opts.avoid).toEqual(first.map((w) => `sl:${w}`));
    const dealt = state(r).deal.flat().map((w) => w.name);
    expect(dealt.filter((x) => first.includes(x))).toEqual([]);
  });
});

describe("Say Less in a tournament", () => {
  it("credits awards for each Say Less game", () => {
    const { r, toks } = seated(["Ann", "Bob"]);
    expect(startTournament(r, toks.Ann!, [{ format: "sayless", pools: ["easy"] }, "sayless"])).toEqual({ ok: true });
    for (let g = 0; g < 2; g++) {
      if (g > 0) expect(setGame(r, toks.Ann!, say())).toEqual({ ok: true });
      expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
      playOut(r, toks);
      expect(r.tournament.games[g].awards).toBeTruthy();
      expect(Object.keys(r.tournament.games[g].awards).sort()).toEqual(["Ann", "Bob"]);
    }
    expect(r.tournament).toMatchObject({ index: 2, done: true });
  });
});
