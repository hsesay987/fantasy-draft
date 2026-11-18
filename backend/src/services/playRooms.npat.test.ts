import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { _rooms, act, createRoom, joinRoom, leaveRoom, sanitizeSetup, setGame, setNpatHistory, setScreen, snapshot, startRoom, startTournament, tickRooms } from "./playRooms";
import type { NPState } from "../shared/topicDraft/formats/npat";
import { entriesOf } from "../shared/topicDraft/npat/source";
import { startsWith, TIER_POINTS } from "../shared/topicDraft/npat/rules";
import type { NpatHistoryStore } from "./npatHistory.service";

const npat = (opts: any = {}, top: any = {}) => ({ format: "npat", pool: "classic", opts: { npatRounds: 1, ...opts }, ...top });

function seated(names: string[], setup: any = npat()) {
  const made = createRoom(setup, names[0]!) as any;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as any).seat.token;
  return { r: made.room, toks };
}
function running(names: string[], setup: any = npat()) {
  const made = seated(names, setup);
  expect(startRoom(made.r, made.toks[names[0]!])).toEqual({ ok: true });
  return made;
}
const state = (r: any) => r.state as NPState;

/** Distinct list entries for this round's letter, `n` per category, never a player's name (so a JSON search finds only answers). */
function entries(r: any, n: number, avoid: string[] = []): string[][] {
  const used = new Set(avoid.map((x) => x.toLowerCase()));
  return state(r).categories.map((c) => {
    const out: string[] = [];
    for (const e of entriesOf(c)) {
      if (out.length >= n) break;
      const k = e.name.toLowerCase();
      if (e.name.length < 4 || used.has(k) || !startsWith(state(r).letter, e.name)) continue;
      used.add(k);
      out.push(e.name);
    }
    expect(out).toHaveLength(n);
    return out;
  });
}
/** An answer with the right letter that no list has. */
const unknown = (r: any) => `${state(r).letter}qzxqv`;

/** Plays to the end: `fill` types each seat's answers, everyone finishes, and the host moves every vote and reveal on. */
function playOut(r: any, toks: Record<string, string>, host: string, fill: (r: any) => void = () => {}) {
  for (let i = 0; i < 200 && r.status === "playing"; i++) {
    r.answerAt = undefined; // this helper types faster than the rate limit allows
    if (state(r).phase === "write") {
      fill(r);
      for (const n of state(r).players) act(r, toks[n]!, { type: "finish" });
    } else act(r, toks[host]!, { type: "next" });
  }
  expect(r.status).toBe("done");
}

const fakeHistory = () => {
  const calls: { day: string; player: string; plays: { category: string; answer: string }[] }[] = [];
  const h: NpatHistoryStore & { calls: typeof calls; fail: boolean } = {
    calls,
    fail: false,
    async load() {},
    async record(day, player, plays) {
      calls.push({ day, player, plays });
      if (h.fail) throw new Error("db down");
    },
    lookup: () => null,
  };
  return h;
};
const flush = () => new Promise((res) => setTimeout(res, 0));

beforeEach(() => {
  _rooms.clear();
  setNpatHistory(null);
});
afterEach(() => vi.restoreAllMocks());

describe("NPAT setup", () => {
  it("clamps rounds, snaps the round length, reads the switches, and titles the game", () => {
    const o = (opts: any) => sanitizeSetup({ format: "npat", pool: "classic", opts })!.opts;
    expect(o({})).toMatchObject({ npatRounds: 3, npatSeconds: 60, npatHard: false, npatStop: false, answer: "phones" });
    expect(o({ npatRounds: 99, npatSeconds: 90, npatHard: true, npatStop: true })).toMatchObject({ npatRounds: 8, npatSeconds: 90, npatHard: true, npatStop: true });
    expect(o({ npatRounds: 0, npatSeconds: 45 })).toMatchObject({ npatRounds: 1, npatSeconds: 45 });
    expect(o({ npatRounds: 4.6, npatSeconds: 61 })).toMatchObject({ npatRounds: 5, npatSeconds: 60 });
    for (const junk of ["abc", null, "", {}, [], NaN, true]) expect(o({ npatRounds: junk, npatSeconds: junk, npatHard: "yes", npatStop: 1 })).toMatchObject({ npatRounds: 3, npatSeconds: 60, npatHard: false, npatStop: false });
    expect(sanitizeSetup({ format: "npat", pool: "classic" })!.mission.title).toBe("NPAT: Classic");
  });

  it("takes sets and single categories together, refuses unknown ones, and allows teams", () => {
    const s = sanitizeSetup({ format: "npat", pool: "classic", pools: ["classic", "cat:food", "classic"], opts: { teams: 2, teamMap: { Ann: 0, Bob: 1 } } })!;
    expect(s.pools).toEqual(["classic", "cat:food"]);
    expect(s.mission.title).toMatch(/^NPAT: /);
    expect(s.opts.teams).toBe(2);
    expect(sanitizeSetup({ format: "npat", pool: "nope" })).toBeNull();
    expect(sanitizeSetup({ format: "npat", pool: "classic", pools: ["classic", "cat:nope"] })).toBeNull();
  });
});

describe("NPAT hidden info", () => {
  const NAMES = ["Ann", "Bob", "Cy", "Di"];

  it("while writing, no seat, screen or viewer sees another player's answers; a category opens only at its reveal", () => {
    // The host runs the night from a screen: it sees what a viewer with no seat sees.
    const { r, toks } = seated(["Host", ...NAMES]);
    expect(setScreen(r, toks.Host!, true)).toEqual({ ok: true });
    expect(startRoom(r, toks.Host!)).toEqual({ ok: true });
    expect(state(r).players).toEqual(NAMES);
    const picks = entries(r, NAMES.length, ["Host", ...NAMES]); // picks[cat][player]
    NAMES.forEach((n, p) => state(r).categories.forEach((_, c) => expect(act(r, toks[n]!, { type: "answer", cat: c, text: picks[c]![p]! })).toEqual({ ok: true })));
    expect(state(r).phase).toBe("write");
    for (const tok of [...NAMES.map((n) => toks[n]!), toks.Host!, null, "bad"]) {
      const snap = snapshot(r, tok) as any;
      const json = JSON.stringify(snap);
      const me = NAMES.indexOf(snap.me);
      NAMES.forEach((_, p) => picks.forEach((cat) => {
        if (p === me) expect(json).toContain(`"${cat[p]}"`);
        else expect(json).not.toContain(`"${cat[p]}"`);
      }));
      expect(snap.state.filled).toEqual({ Ann: 4, Bob: 4, Cy: 4, Di: 4 });
      expect(snap.state.seed).toBe(0);
      expect(snap.setup.seed).toBe(0);
    }
    for (const n of NAMES) expect(act(r, toks[n]!, { type: "finish" })).toEqual({ ok: true });
    const cats = state(r).categories.length;
    let t = Date.now();
    for (let c = 0; c < cats; c++) {
      expect(state(r)).toMatchObject({ phase: "reveal", cat: c });
      for (const tok of [toks.Ann!, toks.Host!, null]) {
        const json = JSON.stringify(snapshot(r, tok));
        for (let k = 0; k < cats; k++) for (const text of picks[k]!) {
          if (k <= c) expect(json).toContain(`"${text}"`);
          else expect(json).not.toContain(`"${text}"`);
        }
      }
      tickRooms((t += 7000)); // the reveal runs out on its clock
    }
    expect(state(r).phase).toBe("summary");
  });

  it("an unknown answer's vote goes to the seats that didn't give it", () => {
    const { r, toks } = running(NAMES);
    const odd = unknown(r);
    expect(act(r, toks.Ann!, { type: "answer", cat: 0, text: odd })).toEqual({ ok: true });
    for (const n of NAMES) act(r, toks[n]!, { type: "finish" });
    expect(state(r)).toMatchObject({ phase: "vote", cat: 0 });
    for (const tok of [toks.Ann!, toks.Bob!, null]) expect((snapshot(r, tok) as any).state.vote).toMatchObject({ text: odd, members: ["Ann"], voters: ["Bob", "Cy", "Di"] });
    expect(act(r, toks.Ann!, { type: "vote", ok: true })).toMatchObject({ ok: false });
    expect(act(r, toks.Bob!, { type: "vote", ok: "yes" })).toEqual({ ok: false, error: "Vote yes or no" });
    expect(act(r, toks.Bob!, { type: "vote", ok: true })).toEqual({ ok: true });
    // Each seat sees only its own vote, and who has voted.
    expect((snapshot(r, toks.Cy!) as any).state.vote.voted).toEqual(["Bob"]);
    expect(JSON.stringify((snapshot(r, toks.Cy!) as any).state.history)).not.toContain('"Bob":true');
    expect(act(r, toks.Cy!, { type: "vote", ok: false })).toEqual({ ok: true });
    expect(act(r, toks.Di!, { type: "vote", ok: true })).toEqual({ ok: true });
    expect(state(r).phase).toBe("reveal");
    expect(state(r).history[0]!.answers.Ann![0]).toMatchObject({ status: "unknown", accepted: true });
  });
});

describe("NPAT actions", () => {
  it("finish ends the round once everyone has, or at the first finish with stop early", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    expect(act(r, toks.Ann!, { type: "finish" })).toEqual({ ok: true });
    expect(act(r, toks.Ann!, { type: "finish" })).toMatchObject({ ok: false });
    expect(act(r, toks.Bob!, { type: "finish" })).toEqual({ ok: true });
    expect(state(r).phase).toBe("write");
    expect(act(r, toks.Cy!, { type: "finish" })).toEqual({ ok: true });
    expect(state(r).phase).not.toBe("write");
    expect(state(r).history).toHaveLength(1);
    _rooms.clear();
    const stop = running(["Ann", "Bob", "Cy"], npat({ npatStop: true }));
    expect(act(stop.r, stop.toks.Bob!, { type: "finish" })).toEqual({ ok: true });
    expect(state(stop.r).phase).not.toBe("write");
  });

  it("refuses malformed answers with a clear error and leaves the state alone", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    const before = r.state;
    const cats = state(r).categories.length;
    expect(act(r, toks.Ann!, { type: "answer", cat: cats, text: "x" })).toEqual({ ok: false, error: "No such category" });
    expect(act(r, toks.Ann!, { type: "answer", cat: -1, text: "x" })).toEqual({ ok: false, error: "No such category" });
    expect(act(r, toks.Ann!, { type: "answer", cat: 0.5, text: "x" })).toEqual({ ok: false, error: "No such category" });
    expect(act(r, toks.Ann!, { type: "answer", cat: "0", text: "x" })).toEqual({ ok: false, error: "No such category" });
    expect(act(r, toks.Ann!, { type: "answer", cat: 0, text: 5 })).toEqual({ ok: false, error: "Type an answer" });
    expect(act(r, toks.Ann!, { type: "answer", cat: 0 })).toEqual({ ok: false, error: "Type an answer" });
    expect(act(r, toks.Ann!, { type: "answer", cat: 0, text: "x".repeat(41) })).toEqual({ ok: false, error: "That answer is too long" });
    expect(r.state).toBe(before);
    expect(act(r, toks.Ann!, { type: "answer", cat: 0, text: "x".repeat(40) })).toEqual({ ok: true });
  });

  it("an answer flood is refused from the 11th in a second", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    for (let i = 0; i < 10; i++) expect(act(r, toks.Ann!, { type: "answer", cat: 0, text: `a${i}` })).toEqual({ ok: true });
    const before = r.state;
    expect(act(r, toks.Ann!, { type: "answer", cat: 0, text: "a10" })).toEqual({ ok: false, error: "Slow down" });
    expect(r.state).toBe(before);
    expect(state(r).answers.Ann![0]).toBe("a9");
    expect(act(r, toks.Bob!, { type: "answer", cat: 0, text: "b" })).toEqual({ ok: true }); // per seat
  });

  it("only the host moves a reveal on, and writing can't be skipped", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    expect(act(r, toks.Ann!, { type: "next" })).toMatchObject({ ok: false });
    expect(state(r).phase).toBe("write");
    for (const n of ["Ann", "Bob"]) act(r, toks[n]!, { type: "finish" });
    expect(state(r).phase).toBe("reveal");
    expect(act(r, toks.Bob!, { type: "next" })).toEqual({ ok: false, error: "Only the host can move on" });
    expect(act(r, toks.Ann!, { type: "next" })).toEqual({ ok: true });
    expect(state(r).cat).toBe(1);
  });

  it("a seat leaving mid-round doesn't stall it, and the clock runs the rest", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    act(r, toks.Ann!, { type: "finish" });
    act(r, toks.Bob!, { type: "finish" });
    leaveRoom(r, toks.Cy!);
    expect(state(r).phase).toBe("reveal");
    let t = Date.now();
    for (let i = 0; i < 40 && r.status === "playing"; i++) tickRooms((t += 7000));
    expect(r.status).toBe("done");
  });

  it("teams: teammates who give the same answer score it in full", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy", "Di"], npat({ teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0, Di: 1 } }));
    expect(state(r).teams).toEqual([["Ann", "Cy"], ["Bob", "Di"]]);
    const [e] = entries(r, 1)[0]!;
    act(r, toks.Ann!, { type: "answer", cat: 0, text: e });
    act(r, toks.Cy!, { type: "answer", cat: 0, text: e });
    for (const n of ["Ann", "Bob", "Cy", "Di"]) act(r, toks[n]!, { type: "finish" });
    expect(state(r)).toMatchObject({ phase: "reveal", cat: 0 });
    const a = state(r).history[0]!.answers;
    const full = TIER_POINTS[a.Ann![0]!.tier!];
    expect(a.Ann![0]).toMatchObject({ status: "ok", points: full, shared: false });
    expect(a.Cy![0]).toMatchObject({ status: "ok", points: full, shared: false });
    expect(state(r).teamPoints).toEqual([full, 0]);
  });
});

describe("NPAT results", () => {
  it("records the top scorer, and a team game has no single winner", () => {
    const solo = running(["Ann", "Bob"]);
    playOut(solo.r, solo.toks, "Ann", (r) => act(r, solo.toks.Ann!, { type: "answer", cat: 0, text: entries(r, 1)[0]![0]! }));
    expect(solo.r.played.at(-1)).toMatchObject({ format: "npat", winner: "Ann" });
    _rooms.clear();
    const team = running(["Ann", "Bob", "Cy", "Di"], npat({ teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 0, Di: 1 } }));
    playOut(team.r, team.toks, "Ann");
    expect(team.r.played.at(-1)).toMatchObject({ format: "npat", winner: null });
  });

  it("a rematch avoids the letters of the first game", () => {
    const { r, toks } = running(["Ann", "Bob"], npat({ npatRounds: 4 }));
    const first = [...state(r).letters];
    playOut(r, toks, "Ann");
    expect(r.seen.filter((k: string) => k.startsWith("np:"))).toEqual(first.map((l) => `np:${l}`));
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(r.setup.opts.avoid).toEqual(first.map((l) => `np:${l}`));
    expect(state(r).letters.filter((l) => first.includes(l))).toEqual([]);
  });

  it("a finished room records each player's accepted answers once, and accepted unknowns as review rows", async () => {
    const h = fakeHistory();
    setNpatHistory(h);
    const { r, toks } = running(["Ann", "Bob", "Cy"], npat({ npatRounds: 2 }));
    const got: Record<string, { category: string; answer: string }[]> = { Ann: [], Bob: [], Cy: [] };
    playOut(r, toks, "Ann", (r) => {
      const [[e0], [e1]] = entries(r, 1) as [string[], string[]];
      const cats = state(r).categories;
      // Ann: two list answers. Bob: the same first one. Cy: an unknown (too few voters, so accepted with no vote) and a wrong letter.
      act(r, toks.Ann!, { type: "answer", cat: 0, text: e0 });
      act(r, toks.Ann!, { type: "answer", cat: 1, text: e1 });
      act(r, toks.Bob!, { type: "answer", cat: 0, text: e0!.toUpperCase() });
      act(r, toks.Cy!, { type: "answer", cat: 0, text: unknown(r) });
      act(r, toks.Cy!, { type: "answer", cat: 1, text: state(r).letter === "B" ? "Cat" : "Bat" });
      got.Ann!.push({ category: cats[0]!, answer: e0! }, { category: cats[1]!, answer: e1! });
      got.Bob!.push({ category: cats[0]!, answer: e0! });
      got.Cy!.push({ category: `review:${cats[0]}`, answer: unknown(r) });
    });
    await flush();
    const day = new Date().toISOString().slice(0, 10);
    expect(h.calls.map((c) => c.player).sort()).toEqual([`guest:${r.code}:Ann`, `guest:${r.code}:Bob`, `guest:${r.code}:Cy`]);
    for (const c of h.calls) {
      expect(c.day).toBe(day);
      const name = c.player.split(":").at(-1)!;
      expect([...c.plays].sort((a, b) => (a.category + a.answer).localeCompare(b.category + b.answer))).toEqual([...got[name]!].sort((a, b) => (a.category + a.answer).localeCompare(b.category + b.answer)));
    }
  });

  it("an abandoned room records nothing, and a failing store never stops the results", async () => {
    const h = fakeHistory();
    setNpatHistory(h);
    const left = running(["Ann", "Bob"]);
    act(left.r, left.toks.Ann!, { type: "answer", cat: 0, text: entries(left.r, 1)[0]![0]! });
    leaveRoom(left.r, left.toks.Ann!);
    leaveRoom(left.r, left.toks.Bob!);
    await flush();
    expect(h.calls).toEqual([]);

    h.fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { r, toks } = running(["Ann", "Bob"]);
    playOut(r, toks, "Ann", (r) => act(r, toks.Ann!, { type: "answer", cat: 0, text: entries(r, 1)[0]![0]! }));
    await flush();
    expect(h.calls).toHaveLength(1); // Bob gave nothing to count
    expect(r.status).toBe("done");
    expect(r.played.at(-1)).toMatchObject({ format: "npat", winner: "Ann" });
    expect(err).toHaveBeenCalled();
  });
});

describe("NPAT in a tournament", () => {
  it("credits awards by game points for each NPAT game", () => {
    const { r, toks } = seated(["Ann", "Bob", "Cy"]);
    expect(startTournament(r, toks.Ann!, [{ format: "npat", pools: ["classic"] }, { format: "npat", pools: ["film", "cat:food"] }])).toEqual({ ok: true });
    for (let g = 0; g < 2; g++) {
      if (g > 0) expect(setGame(r, toks.Ann!, npat({}, { pool: "film", pools: ["film", "cat:food"] }))).toEqual({ ok: true });
      expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
      playOut(r, toks, "Ann", (r) => act(r, toks.Ann!, { type: "answer", cat: 0, text: entries(r, 1)[0]![0]! }));
      // Ann scored; Bob and Cy tie on 0 and share second place.
      const aw = r.tournament.games[g].awards;
      expect(aw.Ann).toBeGreaterThan(aw.Bob);
      expect(aw.Bob).toBe(aw.Cy);
    }
    expect(r.tournament).toMatchObject({ index: 2, done: true });
  });
});
