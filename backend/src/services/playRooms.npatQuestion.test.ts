import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { _rooms, act, createRoom, joinRoom, sanitizeSetup, setGame, setNpatHistory, setNpatJudge, snapshot, startRoom, startTournament, type NpatRoomJudge } from "./playRooms";
import type { DigState, DigView } from "../shared/topicDraft/formats/npatDig";
import { questionByText } from "../shared/topicDraft/npat/questions";
import { QUESTION_DEFAULT_ROUNDS, QUESTION_MAX_ROUNDS } from "../shared/topicDraft/npat/rules";
import type { NpatHistoryStore } from "./npatHistory.service";

type Made = Extract<ReturnType<typeof createRoom>, { room: unknown }>;
type Room = Made["room"];

const qs = (opts: Record<string, unknown> = {}) => ({ format: "npat", pool: "questions", pools: ["questions"], opts: { npatStyle: "question", npatRounds: 3, ...opts } });

function running(names: string[], setup: unknown = qs()) {
  const made = createRoom(setup, names[0]!) as Made;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as Made).seat.token;
  expect(startRoom(made.room, toks[names[0]!]!)).toEqual({ ok: true });
  return { r: made.room, toks };
}
const state = (r: Room) => r.state as DigState;
const view = (r: Room, tok: string | null) => (snapshot(r, tok) as unknown as { state: DigView }).state;
const flush = () => new Promise((res) => setTimeout(res, 0));

function fakeJudge() {
  const calls: { items: { category: string; letter: string; text: string }[]; resolve: (v: unknown[]) => void }[] = [];
  const j: NpatRoomJudge = { judge: (items) => new Promise((resolve) => { calls.push({ items, resolve: resolve as never }); }) };
  return { j, calls };
}

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

describe("NPAT question setup", () => {
  it("keeps the style, plays from the question bank whatever topics came, and clamps the rounds", () => {
    const s = sanitizeSetup(qs())!;
    expect(s.opts.npatStyle).toBe("question");
    expect(s.pools).toEqual(["questions"]);
    expect(s.mission.title).toBe("NPAT: Questions");
    expect(sanitizeSetup({ ...qs(), pools: ["classic"] })!.pools).toEqual(["questions"]);
    expect(sanitizeSetup(qs({ npatRounds: 99 }))!.opts.npatRounds).toBe(QUESTION_MAX_ROUNDS);
    expect(sanitizeSetup(qs({ npatRounds: undefined }))!.opts.npatRounds).toBe(QUESTION_DEFAULT_ROUNDS);
    expect(sanitizeSetup({ format: "npat", pool: "nope", opts: { npatStyle: "question" } })).toBeNull();
  });

  it("starts with one bank question and one letter per round", () => {
    const { r } = running(["Ann", "Bob"]);
    const s = state(r);
    expect(s).toMatchObject({ phase: "reel", cat: 0 });
    expect(s.categories).toHaveLength(3);
    for (const q of s.categories) expect(questionByText(q)).toBeTruthy();
    expect(s.letters).toHaveLength(3);
    expect(view(r, null).categories).toEqual(["", "", ""]); // nothing shown before the first reel ends
  });
});

describe("NPAT question rounds", () => {
  it("asks the judge with the question as the category, and scores 10 unique, 5 shared, 0 rejected", async () => {
    const { j, calls } = fakeJudge();
    setNpatJudge(j);
    const { r, toks } = running(["Ann", "Bob", "Cy", "Dee"]);
    const L = () => state(r).letter;
    act(r, toks.Ann!, { type: "next" });
    askRound(r, toks, { Ann: `${L()}ucket`, Bob: `${L()}UCKET`, Cy: `${L()}ikini`, Dee: `${L()}lorp` });
    expect(state(r).phase).toBe("judge");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.items.map((x) => x.category)).toEqual(Array(4).fill(state(r).categories[0]));
    calls[0]!.resolve([{ ok: true, niche: 90, source: "ai" }, { ok: true, niche: 90, source: "ai" }, { ok: true, niche: 0, source: "ai" }, { ok: false, niche: 0, source: "ai" }]);
    await flush();
    expect(state(r).phase).toBe("verdict");
    expect(state(r).points).toEqual({ Ann: 5, Bob: 5, Cy: 10, Dee: 0 });
    act(r, toks.Ann!, { type: "next" });
    expect(state(r)).toMatchObject({ phase: "reel", cat: 1, letter: state(r).letters![1] });
  });

  it("remembers the questions and letters, and records nothing in the answer history", async () => {
    const calls: unknown[] = [];
    const h: NpatHistoryStore = { async load() {}, async record(...a) { calls.push(a); }, lookup: () => null };
    setNpatHistory(h);
    const { r, toks } = running(["Ann", "Bob"]);
    for (let i = 0; i < 100 && r.status === "playing"; i++) {
      if (state(r).phase === "ask") askRound(r, toks, { Ann: `${state(r).letter}ucket` });
      else act(r, toks.Ann!, { type: "next" });
    }
    expect(r.status).toBe("done");
    expect(state(r).points.Ann).toBe(30); // unchecked fallback: 10 a round
    const s = state(r);
    for (const q of s.categories) expect(r.seen).toContain(`nq:${questionByText(q)!.id}`);
    for (const l of s.letters!) expect(r.seen).toContain(`np:${l}`);
    await flush();
    expect(calls).toEqual([]);
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(state(r).categories.some((q) => s.categories.includes(q))).toBe(false);
  });

  it("plays as a tournament game from a Questions slot", () => {
    const made = createRoom(qs(), "Ann") as Made;
    const r = made.room;
    const toks = { Ann: made.seat.token, Bob: (joinRoom(r.code, "Bob") as Made).seat.token };
    expect(startTournament(r, toks.Ann, [{ format: "npat", pools: ["questions"] }, { format: "npat", pools: ["classic"] }])).toEqual({ ok: true });
    expect(setGame(r, toks.Ann, qs())).toEqual({ ok: true });
    expect(startRoom(r, toks.Ann)).toEqual({ ok: true });
    for (let i = 0; i < 100 && r.status === "playing"; i++) {
      if (state(r).phase === "ask") askRound(r, toks, { Ann: `${state(r).letter}ucket` });
      else act(r, toks.Ann, { type: "next" });
    }
    const aw = r.tournament!.games[0]!.awards!;
    expect(aw.Ann).toBeGreaterThan(aw.Bob!);
  });
});
