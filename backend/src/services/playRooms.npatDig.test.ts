import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { _rooms, act, createRoom, joinRoom, leaveRoom, sanitizeSetup, setGame, setNpatHistory, setNpatJudge, setScreen, snapshot, startRoom, startTournament, tickRooms, type NpatRoomJudge } from "./playRooms";
import type { DigState, DigView } from "../shared/topicDraft/formats/npatDig";
import type { NPState } from "../shared/topicDraft/formats/npat";
import { entriesOf } from "../shared/topicDraft/npat/source";
import { DIG_ANSWER_MS, JUDGE_MS, REEL_MS, startsWith, WRITE_GRACE_MS } from "../shared/topicDraft/npat/rules";
import type { NpatHistoryStore } from "./npatHistory.service";

type Made = Extract<ReturnType<typeof createRoom>, { room: unknown }>;
type Room = Made["room"];
type Snap = { me: string | null; state: DigView; setup: { seed: number } };
const snap = (r: Room, tok: string | null) => snapshot(r, tok) as unknown as Snap;

/** Five categories: Classic plus Food. */
const DIG_POOLS = ["classic", "cat:food"];
const dig = (opts: Record<string, unknown> = {}) => ({ format: "npat", pool: "classic", pools: DIG_POOLS, opts: { npatStyle: "dig", ...opts } });

function seated(names: string[], setup: unknown = dig()) {
  const made = createRoom(setup, names[0]!) as Made;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as Made).seat.token;
  return { r: made.room, toks };
}
function running(names: string[], setup: unknown = dig()) {
  const made = seated(names, setup);
  expect(startRoom(made.r, made.toks[names[0]!])).toEqual({ ok: true });
  return made;
}
const state = (r: Room) => r.state as DigState;

/** A list entry for the open category starting with the letter, not in `avoid`. */
function entry(r: Room, avoid: string[] = []): string {
  const s = state(r);
  const e = entriesOf(s.categories[s.cat]!).find((x) => x.name.length >= 4 && startsWith(s.letter, x.name) && !avoid.includes(x.name));
  expect(e).toBeTruthy();
  return e!.name;
}
const unknown = (r: Room) => `${state(r).letter}qzxqv`;
const wrong = (r: Room) => (state(r).letter === "B" ? "Cqzxqv" : "Bqzxqv");

/** A judge whose answers the test hands out; every call is kept. */
function fakeJudge() {
  const calls: { items: { category: string; letter: string; text: string }[]; resolve: (v: { ok: boolean; niche: number; reason?: string; source: string }[]) => void; reject: (e: unknown) => void }[] = [];
  const j: NpatRoomJudge = {
    judge: (items) => new Promise((resolve, reject) => { calls.push({ items, resolve: resolve as never, reject }); }),
  };
  return { j, calls };
}
const flush = () => new Promise((res) => setTimeout(res, 0));

/** Host skips the reel; everyone answers then locks. */
function askRound(r: Room, toks: Record<string, string>, answers: Record<string, string>) {
  if (state(r).phase === "reel") expect(act(r, toks[state(r).players[0]!]!, { type: "next" })).toEqual({ ok: true });
  expect(state(r).phase).toBe("ask");
  r.answerAt = undefined;
  for (const [n, text] of Object.entries(answers)) expect(act(r, toks[n]!, { type: "answer", text })).toEqual({ ok: true });
  for (const n of state(r).players) act(r, toks[n]!, { type: "lock" });
}

beforeEach(() => {
  _rooms.clear();
  setNpatHistory(null);
  setNpatJudge(null);
});
afterEach(() => vi.restoreAllMocks());

describe("NPAT dig setup", () => {
  it("reads the style; dig needs exactly five categories; missing stays sheet for older callers", () => {
    expect(sanitizeSetup(dig())!.opts.npatStyle).toBe("dig");
    expect(sanitizeSetup({ ...dig(), opts: { npatStyle: "sheet" } })!.opts.npatStyle).toBe("sheet");
    expect(sanitizeSetup({ ...dig(), opts: {} })!.opts.npatStyle).toBeUndefined();
    expect(sanitizeSetup({ ...dig(), opts: { npatStyle: "weird" } })!.opts.npatStyle).toBeUndefined();
    expect(sanitizeSetup({ format: "npat", pool: "classic", opts: { npatStyle: "dig" } })).toBeNull(); // four
    expect(sanitizeSetup({ format: "npat", pool: "classic", pools: ["classic", "cat:food", "cat:film"], opts: { npatStyle: "dig" } })).toBeNull(); // six
    expect(sanitizeSetup({ format: "npat", pool: "cat:name", pools: ["cat:name", "cat:place", "cat:animal", "cat:thing", "cat:film"], opts: { npatStyle: "dig" } })).not.toBeNull();
  });

  it("the dig style starts the dig engine, with five categories and one letter", () => {
    const { r } = running(["Ann", "Bob"]);
    expect(state(r)).toMatchObject({ phase: "reel", cat: 0, players: ["Ann", "Bob"] });
    expect(state(r).categories).toEqual(["name", "place", "animal", "thing", "food"]);
    expect(state(r).letter).toMatch(/^[A-Z]$/);
  });

  it("sheet style still plays the sheet engine, five categories or not", () => {
    for (const opts of [{ npatStyle: "sheet" }, {}]) {
      const { r } = running(["Ann", "Bob"], { ...dig(), opts: { npatRounds: 1, ...opts } });
      expect((r.state as unknown as NPState).phase).toBe("write");
      _rooms.clear();
    }
  });
});

describe("NPAT dig actions", () => {
  it("answers are text, capped and rate limited; lock closes the category once everyone has", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    expect(act(r, toks.Ann!, { type: "answer", text: "x" })).toMatchObject({ ok: false }); // still the reel
    act(r, toks.Ann!, { type: "next" });
    r.answerAt = undefined;
    expect(act(r, toks.Ann!, { type: "answer", text: 5 })).toEqual({ ok: false, error: "Type an answer" });
    expect(act(r, toks.Ann!, { type: "answer", text: "x".repeat(41) })).toEqual({ ok: false, error: "That answer is too long" });
    r.answerAt = undefined;
    for (let i = 0; i < 10; i++) expect(act(r, toks.Ann!, { type: "answer", text: `a${i}` })).toEqual({ ok: true });
    expect(act(r, toks.Ann!, { type: "answer", text: "a10" })).toEqual({ ok: false, error: "Slow down" });
    expect(state(r).typed.Ann).toBe("a9");
    expect(act(r, toks.Ann!, { type: "lock" })).toEqual({ ok: true });
    expect(state(r).phase).toBe("ask");
    expect(act(r, toks.Bob!, { type: "lock" })).toEqual({ ok: true });
    expect(state(r).phase).not.toBe("ask");
  });

  it("only the host moves on", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    expect(act(r, toks.Bob!, { type: "next" })).toEqual({ ok: false, error: "Only the host can move on" });
    expect(act(r, toks.Ann!, { type: "next" })).toEqual({ ok: true });
    expect(state(r).phase).toBe("ask");
  });

  it("the category closes on its clock without the judge", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    const t0 = Date.now();
    tickRooms(t0 + REEL_MS + 10);
    expect(state(r).phase).toBe("ask");
    act(r, toks.Ann!, { type: "answer", text: entry(r) });
    tickRooms(t0 + REEL_MS + 10 + DIG_ANSWER_MS + WRITE_GRACE_MS + 10);
    expect(state(r)).toMatchObject({ phase: "verdict", cat: 0 });
    expect(state(r).results.Ann![0]!.status).toBe("ok");
  });
});

describe("NPAT dig judge", () => {
  it("is called once per judge phase, with only the unknown answers, and its verdict lands", async () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    act(r, toks.Ann!, { type: "next" });
    const odd = unknown(r);
    askRound(r, toks, { Ann: entry(r), Bob: odd, Cy: wrong(r) });
    expect(state(r).phase).toBe("judge");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.items).toEqual([{ category: "name", letter: state(r).letter, text: odd }]);
    tickRooms(Date.now() + 100); // still judging: no second call
    act(r, toks.Ann!, { type: "lock" });
    expect(calls).toHaveLength(1);
    calls[0]!.resolve([{ ok: true, niche: 60, reason: "a real name", source: "ai" }]);
    await flush();
    expect(state(r).phase).toBe("verdict");
    expect(state(r).results.Bob![0]).toMatchObject({ status: "ai-ok", tier: "rare", review: true, reason: "a real name" });
    expect(state(r).results.Cy![0]!.status).toBe("wrong-letter");
  });

  it("stops asking the judge past 60 calls an hour in one room, and the tick's fallback decides", () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    r.judgeAt = new Array(60).fill(Date.now() - 1000); // the hour's cap already spent
    act(r, toks.Ann!, { type: "next" });
    askRound(r, toks, { Ann: entry(r), Bob: unknown(r) });
    expect(state(r).phase).toBe("judge");
    expect(calls).toHaveLength(0);
    tickRooms(state(r).phaseAt + JUDGE_MS);
    expect(state(r).results.Bob![0]!.reason).toBe("unchecked");
  });

  it("never calls the judge when nothing is unknown", () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    askRound(r, toks, { Ann: entry(r), Bob: wrong(r) });
    expect(state(r).phase).toBe("verdict");
    expect(calls).toHaveLength(0);
  });

  it("ignores a verdict that arrives after the phase moved on", async () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    askRound(r, toks, { Ann: unknown(r), Bob: "" });
    expect(calls).toHaveLength(1);
    expect(act(r, toks.Ann!, { type: "next" })).toEqual({ ok: true }); // host skips the judge: the fallback
    expect(state(r).phase).toBe("verdict");
    const before = JSON.stringify(state(r));
    const version = r.version;
    calls[0]!.resolve([{ ok: false, niche: 0, source: "ai" }]);
    await flush();
    expect(JSON.stringify(state(r))).toBe(before);
    expect(r.version).toBe(version);
    expect(state(r).results.Ann![0]).toMatchObject({ status: "ai-ok", tier: "common", reason: "unchecked" });
  });

  it("ignores a late verdict even once the next category is judging", async () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    askRound(r, toks, { Ann: unknown(r) });
    act(r, toks.Ann!, { type: "next" }); // fallback
    act(r, toks.Ann!, { type: "next" }); // next category
    askRound(r, toks, { Bob: unknown(r) });
    expect(state(r)).toMatchObject({ phase: "judge", cat: 1 });
    expect(calls).toHaveLength(2);
    calls[0]!.resolve([{ ok: false, niche: 0, source: "ai" }]); // the first category's, far too late
    await flush();
    expect(state(r)).toMatchObject({ phase: "judge", cat: 1 });
    calls[1]!.resolve([{ ok: false, niche: 0, reason: "not a word", source: "ai" }]);
    await flush();
    expect(state(r)).toMatchObject({ phase: "verdict", cat: 1 });
    expect(state(r).results.Bob![1]).toMatchObject({ status: "ai-no", points: 0 });
  });

  it("a hung judge is ended by the tick at JUDGE_MS", () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    askRound(r, toks, { Ann: unknown(r) });
    expect(calls).toHaveLength(1);
    const at = state(r).phaseAt;
    tickRooms(at + JUDGE_MS - 50);
    expect(state(r).phase).toBe("judge");
    tickRooms(at + JUDGE_MS);
    expect(state(r).phase).toBe("verdict");
    expect(state(r).results.Ann![0]).toMatchObject({ status: "ai-ok", tier: "common", review: true, reason: "unchecked" });
  });

  it("a judge that throws or rejects never breaks the room", async () => {
    setNpatJudge({ judge: () => { throw new Error("boom"); } });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const a = running(["Ann", "Bob"]);
    askRound(a.r, a.toks, { Ann: unknown(a.r) });
    expect(state(a.r).phase).toBe("judge");
    setNpatJudge({ judge: () => Promise.reject(new Error("down")) });
    const b = running(["Cy", "Di"]);
    askRound(b.r, b.toks, { Cy: unknown(b.r) });
    await flush();
    expect(state(b.r).phase).toBe("judge");
    tickRooms(state(b.r).phaseAt + JUDGE_MS);
    expect(state(b.r).phase).toBe("verdict");
    expect(err).toHaveBeenCalled();
  });

  it("a malformed verdict list falls back to the tick", async () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    askRound(r, toks, { Ann: unknown(r) });
    calls[0]!.resolve("valid!" as never);
    await flush();
    expect(state(r).phase).toBe("judge");
    tickRooms(state(r).phaseAt + JUDGE_MS);
    expect(state(r).results.Ann![0]!.reason).toBe("unchecked");
  });
});

describe("NPAT dig hidden info", () => {
  it("while asking, a seat sees only its own typing and the screen none; results open at the verdict", async () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = seated(["Host", "Ann", "Bob"]);
    expect(setScreen(r, toks.Host!, true)).toEqual({ ok: true });
    expect(startRoom(r, toks.Host!)).toEqual({ ok: true });
    expect(act(r, toks.Host!, { type: "next" })).toEqual({ ok: true }); // the screen host skips the reel
    const a = entry(r, ["Host", "Ann", "Bob"]);
    const b = unknown(r);
    act(r, toks.Ann!, { type: "answer", text: a });
    act(r, toks.Bob!, { type: "answer", text: b });
    expect(act(r, toks.Host!, { type: "answer", text: "x" })).toMatchObject({ ok: false }); // the screen doesn't play
    for (const [tok, sees] of [[toks.Ann!, [a]], [toks.Bob!, [b]], [toks.Host!, []], [null, []], ["bad", []]] as const) {
      const got = snap(r, tok);
      const json = JSON.stringify(got);
      for (const text of [a, b]) expect(json.includes(`"${text}"`)).toBe((sees as readonly string[]).includes(text));
      expect(got.state.typedCount).toBe(2);
      expect(got.state.seed).toBe(0);
      expect(got.setup.seed).toBe(0);
    }
    act(r, toks.Ann!, { type: "lock" });
    act(r, toks.Bob!, { type: "lock" });
    expect(state(r).phase).toBe("judge");
    // While judging, nobody sees the category's results yet.
    for (const tok of [toks.Ann!, toks.Host!, null]) expect(snap(r, tok).state.results.Ann).toEqual([]);
    calls[0]!.resolve([{ ok: true, niche: 10, source: "ai" }]);
    await flush();
    expect(state(r).phase).toBe("verdict");
    for (const tok of [toks.Ann!, toks.Bob!, toks.Host!, null]) {
      const got = snap(r, tok);
      expect(got.state.results.Ann![0]).toMatchObject({ status: "ok", entry: a });
      expect(got.state.results.Bob![0]).toMatchObject({ status: "ai-ok", text: b });
    }
  });
});

describe("NPAT dig end of game", () => {
  const fakeHistory = () => {
    const calls: { player: string; plays: { category: string; answer: string }[] }[] = [];
    const h: NpatHistoryStore = { async load() {}, async record(_d, player, plays) { calls.push({ player, plays }); }, lookup: () => null };
    return { h, calls };
  };

  /** Ann gives a list answer in every category, Bob an unknown one the judge times out on; the host moves every phase on. */
  function playOut(r: Room, toks: Record<string, string>, host: string) {
    for (let i = 0; i < 100 && r.status === "playing"; i++) {
      if (state(r).phase === "ask") askRound(r, toks, { Ann: entry(r), Bob: unknown(r) });
      else act(r, toks[host]!, { type: "next" });
    }
    expect(r.status).toBe("done");
  }

  it("names the winner, remembers the letter and records list answers and review rows", async () => {
    const { h, calls } = fakeHistory();
    setNpatHistory(h);
    const { r, toks } = running(["Ann", "Bob"]);
    playOut(r, toks, "Ann");
    const s = state(r);
    expect(s.results.Ann!.every((a) => a.status === "ok")).toBe(true);
    expect(s.results.Bob!.every((a) => a.status === "ai-ok" && a.review)).toBe(true);
    expect(r.played.at(-1)).toMatchObject({ format: "npat", winner: s.points.Ann! > s.points.Bob! ? "Ann" : null });
    expect(r.seen).toContain(`np:${s.letter}`);
    await flush();
    const byPlayer = Object.fromEntries(calls.map((c) => [c.player.split(":").at(-1), c.plays]));
    expect(byPlayer.Ann).toHaveLength(5);
    expect(byPlayer.Ann!.every((p) => !p.category.startsWith("review:"))).toBe(true);
    expect(byPlayer.Bob).toEqual(s.categories.map((c) => ({ category: `review:${c}`, answer: unknown(r) })));
    // Finished: every result is open to everyone.
    expect(snap(r, null).state.results.Ann).toHaveLength(5);
  });

  it("a rematch avoids the letter just played", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    playOut(r, toks, "Ann");
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(r.setup!.opts.avoid).toContain(`np:${r.seen.find((x) => x.startsWith("np:"))!.slice(3)}`);
  });

  it("a player who leaves mid-category is not waited for", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    act(r, toks.Ann!, { type: "next" });
    act(r, toks.Ann!, { type: "answer", text: entry(r) });
    act(r, toks.Ann!, { type: "lock" });
    act(r, toks.Bob!, { type: "lock" });
    expect(state(r).phase).toBe("ask");
    leaveRoom(r, toks.Cy!);
    expect(state(r).phase).toBe("verdict");
    expect(state(r).results.Cy![0]!.status).toBe("blank");
  });

  it("ranks a tournament game by its points", () => {
    const { r, toks } = seated(["Ann", "Bob", "Cy"]);
    expect(startTournament(r, toks.Ann!, [{ format: "npat", pools: DIG_POOLS }, { format: "npat", pools: DIG_POOLS }])).toEqual({ ok: true });
    expect(setGame(r, toks.Ann!, dig())).toEqual({ ok: true });
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    for (let i = 0; i < 100 && r.status === "playing"; i++) {
      if (state(r).phase === "ask") askRound(r, toks, { Ann: entry(r) });
      else act(r, toks.Ann!, { type: "next" });
    }
    const aw = r.tournament!.games[0]!.awards!;
    expect(aw.Ann).toBeGreaterThan(aw.Bob!);
    expect(aw.Bob).toBe(aw.Cy);
  });
});
