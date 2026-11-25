import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./judge.service", () => ({ judge: vi.fn(() => new Promise(() => {})) }));

import { _rooms, act, createRoom, joinRoom, leaveRoom, sanitizeSetup, setDodgeJudge, setScreen, snapshot, startRoom, startTournament, tickRooms, type DodgeRoomJudge } from "./playRooms";
import type { DodgeState, DodgeView } from "../shared/topicDraft/formats/dodge";
import { ANSWER_MS, JUDGE_MS, REVEAL_MS, WRITE_GRACE_MS } from "../shared/topicDraft/dodge/rules";
import { dodgeDeckOf } from "../shared/topicDraft/dodge/decks";

type Made = Extract<ReturnType<typeof createRoom>, { room: unknown }>;
type Room = Made["room"];
type Snap = { me: string | null; state: DodgeView; setup: { seed: number; mission: { title: string }; opts: { dodgeLaps?: number } } };
const snap = (r: Room, tok: string | null) => snapshot(r, tok) as unknown as Snap;

const dodge = (opts: Record<string, unknown> = {}, pools = ["food"]) => ({ format: "dodge", pool: pools[0], pools, opts });

function seated(names: string[], setup: unknown = dodge()) {
  const made = createRoom(setup, names[0]!) as Made;
  const toks: Record<string, string> = { [names[0]!]: made.seat.token };
  for (const n of names.slice(1)) toks[n] = (joinRoom(made.room.code, n) as Made).seat.token;
  return { r: made.room, toks };
}
function running(names: string[], setup: unknown = dodge()) {
  const made = seated(names, setup);
  expect(startRoom(made.r, made.toks[names[0]!])).toEqual({ ok: true });
  return made;
}
const state = (r: Room) => r.state as DodgeState;

/** Everyone answers, then everyone locks. */
function round(r: Room, toks: Record<string, string>, answers: Record<string, string>) {
  r.answerAt = undefined;
  for (const [n, text] of Object.entries(answers)) expect(act(r, toks[n]!, { type: "answer", text })).toEqual({ ok: true });
  for (const n of state(r).players) act(r, toks[n]!, { type: "lock" });
}

function fakeJudge() {
  const calls: { items: { category: string; a: string; b: string }[]; resolve: (v: { same: boolean }[]) => void; reject: (e: unknown) => void }[] = [];
  const j: DodgeRoomJudge = { judge: (items) => new Promise((resolve, reject) => { calls.push({ items, resolve, reject }); }) };
  return { j, calls };
}
const flush = () => new Promise((res) => setTimeout(res, 0));

beforeEach(() => {
  _rooms.clear();
  setDodgeJudge(null);
});
afterEach(() => vi.restoreAllMocks());

describe("Dodge setup", () => {
  it("takes known decks, mixes them and clamps the laps", () => {
    const one = sanitizeSetup(dodge())!;
    expect(one.mission.title).toBe("Dodge: Food and drink");
    expect(one.opts.dodgeLaps).toBe(1);
    expect(sanitizeSetup(dodge({ dodgeLaps: 3 }, ["food", "sport"]))!.opts.dodgeLaps).toBe(3);
    expect(sanitizeSetup(dodge({ dodgeLaps: 9 }))!.opts.dodgeLaps).toBe(3);
    expect(sanitizeSetup(dodge({ dodgeLaps: "x" }))!.opts.dodgeLaps).toBe(1);
    expect(sanitizeSetup(dodge({}, ["nope"]))).toBeNull();
  });
  it("starts with one category per player and the first player chosen", () => {
    const { r } = running(["Ann", "Bob", "Cy"]);
    expect(state(r).categories).toHaveLength(3);
    expect(state(r).categories.every((c) => dodgeDeckOf("food")!.categories.includes(c))).toBe(true);
    expect(state(r).phase).toBe("answer");
  });
  it("can be a tournament slot with its decks", () => {
    const { r, toks } = seated(["Ann", "Bob"], null);
    expect(startTournament(r, toks.Ann!, [{ format: "dodge", pools: ["food", "nature"] }, "insync"])).toEqual({ ok: true });
    expect(startTournament(r, toks.Ann!, [{ format: "dodge", pools: ["nope"] }, "insync"])).toMatchObject({ error: expect.stringContaining("topic") });
  });
});

describe("Dodge actions", () => {
  it("answers are text, capped and rate limited", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    expect(act(r, toks.Ann!, { type: "answer", text: 5 })).toEqual({ ok: false, error: "Type an answer" });
    expect(act(r, toks.Ann!, { type: "answer", text: "x".repeat(41) })).toEqual({ ok: false, error: "That answer is too long" });
    r.answerAt = undefined;
    for (let i = 0; i < 10; i++) expect(act(r, toks.Ann!, { type: "answer", text: `a${i}` })).toEqual({ ok: true });
    expect(act(r, toks.Ann!, { type: "answer", text: "a10" })).toEqual({ ok: false, error: "Slow down" });
  });
  it("hides other answers until the reveal, then scores", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    r.answerAt = undefined;
    act(r, toks.Ann!, { type: "answer", text: "Pepperoni" });
    act(r, toks.Bob!, { type: "answer", text: "pepperoni" });
    expect(snap(r, toks.Bob!).state.typed).toEqual({ Bob: "pepperoni" });
    expect(snap(r, null).state.typed).toEqual({});
    expect(snap(r, toks.Bob!).state.typedCount).toBe(2);
    expect(snap(r, null).setup.seed).toBe(0);
    round(r, toks, { Cy: "ham" });
    expect(state(r).phase).toBe("reveal");
    expect(state(r).points).toEqual({ Ann: 1, Bob: -1, Cy: 1 });
    expect(snap(r, null).state.history[0]!.answers).toEqual({ Ann: "Pepperoni", Bob: "pepperoni", Cy: "ham" });
  });
  it("only the host moves on, also from a screen", () => {
    const { r, toks } = seated(["Ann", "Bob", "Cy"]);
    expect(setScreen(r, toks.Ann!, true)).toEqual({ ok: true });
    expect(startRoom(r, toks.Ann!)).toEqual({ ok: true });
    expect(state(r).players).toEqual(["Bob", "Cy"]);
    expect(act(r, toks.Bob!, { type: "next" })).toEqual({ ok: false, error: "Only the host can move on" });
    expect(act(r, toks.Ann!, { type: "next" })).toEqual({ ok: true });
    expect(state(r).phase).toBe("reveal");
    expect(act(r, toks.Ann!, { type: "answer", text: "x" })).toMatchObject({ ok: false });
  });
  it("runs on its clocks and finishes, recording the winner and the categories played", () => {
    const { r, toks } = running(["Ann", "Bob"]);
    const t0 = Date.now();
    act(r, toks.Ann!, { type: "answer", text: "ham" });
    tickRooms(t0 + ANSWER_MS + WRITE_GRACE_MS + 10);
    expect(state(r).phase).toBe("reveal");
    tickRooms(t0 + ANSWER_MS + WRITE_GRACE_MS + REVEAL_MS + 20);
    expect(state(r).round).toBe(1);
    act(r, toks.Ann!, { type: "next" }); // close
    act(r, toks.Ann!, { type: "next" }); // end the reveal
    expect(r.status).toBe("done");
    expect(r.seen.filter((x) => x.startsWith("dg:"))).toHaveLength(2);
    expect(r.played.at(-1)).toMatchObject({ format: "dodge", winner: null }); // 0 each: a tie
  });
  it("a player who leaves is not waited for", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    round(r, toks, { Ann: "ham" });
    act(r, toks.Ann!, { type: "next" });
    expect(state(r).round).toBe(1);
    act(r, toks.Ann!, { type: "lock" });
    act(r, toks.Bob!, { type: "lock" });
    leaveRoom(r, toks.Cy!);
    expect(state(r).phase).toBe("reveal");
  });
});

describe("Dodge judge", () => {
  it("asks once about close calls and its verdict lands", async () => {
    const { j, calls } = fakeJudge();
    setDodgeJudge(j);
    const { r, toks } = running(["Ann", "Bob", "Cy"]);
    round(r, toks, { Ann: "pepperoni", Bob: "peperoni", Cy: "ham" });
    expect(state(r).phase).toBe("judge");
    expect(snap(r, toks.Cy!).state.closing).toBeNull();
    tickRooms(Date.now() + 100);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.items).toEqual([{ category: state(r).categories[0], a: "pepperoni", b: "peperoni" }]);
    calls[0]!.resolve([{ same: true }]);
    await flush();
    expect(state(r).phase).toBe("reveal");
    expect(state(r).history[0]!.judged).toEqual(["Bob"]);
    expect(state(r).points).toEqual({ Ann: 1, Bob: -1, Cy: 1 });
  });
  it("a judge that fails or never answers leaves exact matches only", async () => {
    setDodgeJudge({ judge: () => Promise.reject(new Error("down")) });
    const { r, toks } = running(["Ann", "Bob"]);
    const t0 = Date.now();
    round(r, toks, { Ann: "pepperoni", Bob: "peperoni" });
    await flush();
    expect(state(r).phase).toBe("judge");
    tickRooms(t0 + JUDGE_MS + 50);
    expect(state(r).phase).toBe("reveal");
    expect(state(r).history[0]!.status.Bob).toBe("dodge");
    expect(state(r).history[0]!.unchecked).toBe(true);
  });
  it("a judge with no model ends the check at once, marked unchecked", async () => {
    setDodgeJudge({ judge: async (items) => items.map(() => ({ same: false, source: "fallback" })) });
    const { r, toks } = running(["Ann", "Bob"]);
    round(r, toks, { Ann: "pepperoni", Bob: "peperoni" });
    await flush();
    expect(state(r).phase).toBe("reveal");
    expect(state(r).history[0]!.unchecked).toBe(true);
  });
  it("a late verdict for an earlier round is dropped", async () => {
    const { j, calls } = fakeJudge();
    setDodgeJudge(j);
    const { r, toks } = running(["Ann", "Bob"]);
    round(r, toks, { Ann: "pepperoni", Bob: "peperoni" });
    act(r, toks.Ann!, { type: "next" }); // host skips the check
    expect(state(r).phase).toBe("reveal");
    calls[0]!.resolve([{ same: true }]);
    await flush();
    expect(state(r).history[0]!.status.Bob).toBe("dodge");
  });
});

describe("Dodge drinking", () => {
  it("matchers get a sip card", () => {
    const { r, toks } = running(["Ann", "Bob", "Cy"], dodge({ drinking: true }));
    round(r, toks, { Ann: "ham", Bob: "Ham", Cy: "olives" });
    expect(snap(r, toks.Cy!).state.drinks!.calls.map((c) => c.to)).toEqual(["Bob"]);
  });
});
