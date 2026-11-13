import { describe, expect, it } from "vitest";
import { screenBoard, screenClock, screenInfo } from "./screenInfo";
import { DEFAULT_OPTS, type GameSetup } from "./types";
import * as IM from "../topicDraft/formats/imposter";
import * as V from "../topicDraft/formats/vote";
import * as PK from "../topicDraft/formats/pecking";

const players = ["Ann", "Bob", "Cy", "Di"];
const setup = (format: string, opts: Partial<GameSetup["opts"]> = {}) => ({ format, pool: "x", players, opts: { ...DEFAULT_OPTS, ...opts } }) as unknown as GameSetup;
const st = (o: Record<string, unknown>) => ({ players, phaseAt: 1000, done: false, ...o }) as never;

describe("screenInfo turn", () => {
  it("Imposter: the clue giver in the clue phase, nobody in the vote", () => {
    const clue = st({ phase: "clue", order: ["Cy", "Ann", "Bob", "Di"], clues: [{ by: "Cy", text: "x" }], rounds: 2 });
    expect(screenInfo(setup("imposter"), clue)).toEqual({ turn: "Ann", phase: "Clues · round 1 of 2" });
    expect(screenInfo(setup("imposter"), st({ phase: "vote", order: players, clues: [], rounds: 1 })).turn).toBeNull();
  });
  it("In-Sync: the giver while giving and tuning, nobody on the reveal", () => {
    const s = (phase: string) => st({ phase, giverAt: 5, round: 1, pairs: [{}, {}, {}] });
    expect(screenInfo(setup("insync"), s("clue"))).toEqual({ turn: "Bob", phase: "Round 2 of 3 · Clue" });
    expect(screenInfo(setup("insync"), s("tune")).turn).toBe("Bob");
    expect(screenInfo(setup("insync"), s("reveal")).turn).toBeNull();
  });
  it("Vowel Play: the buzzer while they speak and are judged, nobody while guessing", () => {
    const s = (phase: string) => st({ phase, buzzer: phase === "guess" ? null : "Di", round: 0, total: 10, answer: "say", mode: "first", history: [], points: {} });
    expect(screenInfo(setup("vowelplay"), s("guess"))).toEqual({ turn: null, phase: "Name 1 of 10 · Buzz in" });
    expect(screenInfo(setup("vowelplay"), s("speak"))).toEqual({ turn: "Di", phase: "Name 1 of 10 · Say it" });
    expect(screenInfo(setup("vowelparty"), s("judge")).turn).toBe("Di");
  });
  it("Party Trivia: the buzzer when buzz mode sets one, else nobody", () => {
    const s = (buzzer?: string) => st({ phase: "question", round: 2, total: 8, questions: [], ...(buzzer ? { buzzer } : {}) });
    expect(screenInfo(setup("partytrivia"), s())).toEqual({ turn: null, phase: "Question 3 of 8" });
    expect(screenInfo(setup("partytrivia"), s("Cy")).turn).toBe("Cy");
  });
  it("vote games and Mafia have no single turn", () => {
    expect(screenInfo(setup("vote"), st({ phase: "guess", round: 0, total: 5 }))).toEqual({ turn: null, phase: "Card 1 of 5 · Read the room" });
    expect(screenInfo(setup("mafia"), st({ phase: "talk", night: 2 }))).toEqual({ turn: null, phase: "Day 2 · Talk" });
  });
  it("Pecking Order: the question kind while asking, Answer on the reveal, Final scores at the end", () => {
    const rank = { kind: "rank", list: "l", title: "T", stat: "S", size: 50, item: "Nile" };
    const name = { kind: "name", list: "l", title: "T", stat: "S", size: 50, at: 7, choices: [] };
    const s = (q: unknown, o: Record<string, unknown> = {}) => st({ phase: "question", round: 1, total: 6, questions: [rank, q], answers: {}, taken: [], points: {}, history: [], ...o });
    expect(screenInfo(setup("pecking"), s(rank))).toEqual({ turn: null, phase: "Question 2 of 6 · Where does it rank?" });
    expect(screenInfo(setup("pecking"), s(name))).toEqual({ turn: null, phase: "Question 2 of 6 · Who's at #7?" });
    expect(screenInfo(setup("pecking"), s(name, { phase: "reveal" }))).toEqual({ turn: null, phase: "Question 2 of 6 · Answer" });
    expect(screenInfo(setup("pecking"), s(name, { done: true }))).toEqual({ turn: null, phase: "Final scores" });
  });
  it("nobody's turn once the game is done", () => {
    expect(screenInfo(setup("imposter"), st({ phase: "done", done: true, order: players, clues: [], rounds: 1 })).turn).toBeNull();
  });
});

describe("screenClock", () => {
  it("runs from the phase start for the header's games, and leaves the rest to their board", () => {
    expect(screenClock(setup("imposter"), st({ phase: "vote" }))).toEqual({ deadline: 1000 + IM.VOTE_MS, total: IM.VOTE_MS });
    expect(screenClock(setup("vote"), st({ phase: "guess" }))).toEqual({ deadline: 1000 + V.GUESS_MS, total: V.GUESS_MS });
    expect(screenClock(setup("partytrivia"), st({ phase: "question" }))).toBeNull();
    expect(screenClock(setup("imposter"), st({ phase: "done", done: true }))).toBeNull();
    expect(screenClock(setup("pecking"), st({ phase: "question" }))).toEqual({ deadline: 1000 + PK.QUESTION_MS, total: PK.QUESTION_MS });
    expect(screenClock(setup("pecking"), st({ phase: "reveal" }))).toEqual({ deadline: 1000 + PK.REVEAL_MS, total: PK.REVEAL_MS });
  });
});

describe("screenBoard", () => {
  it("lists every player with the last card's gain, and marks who left", () => {
    const s = st({ phase: "reveal", showVotes: true, points: { Ann: 3, Bob: 1 }, history: [{ gained: { Ann: 2 } }] });
    const b = screenBoard(setup("vote"), s, ["Di"])!;
    expect(b.rows.map((r) => [r.name, r.score, r.last, r.left])).toEqual([["Ann", 3, 2, undefined], ["Bob", 1, undefined, undefined], ["Cy", 0, undefined, undefined], ["Di", 0, undefined, true]]);
    expect(b.teams).toBeUndefined();
  });
  it("hides a vote game's scores while Show votes is off, and shows them at the end", () => {
    expect(screenBoard(setup("vote"), st({ phase: "vote", showVotes: false, points: {}, history: [] }))).toBeNull();
    expect(screenBoard(setup("vote"), st({ phase: "reveal", showVotes: false, points: { Ann: 1 }, history: [], done: true }))).not.toBeNull();
  });
  it("adds team standings from the host's teams", () => {
    const b = screenBoard(setup("imposter", { teams: 2, teamMap: { Ann: 0, Bob: 0, Cy: 1, Di: 1 } }), st({ phase: "done", points: { Cy: 2, Di: 2, Ann: 1 } }))!;
    expect(b.teams!.map((t) => [t.name, t.score])).toEqual([["Blue team", 4], ["Red team", 1]]);
    expect(b.rows.find((r) => r.name === "Cy")!.team).toBe(1);
  });
  it("Party Trivia keeps its own team points", () => {
    const b = screenBoard(setup("partytrivia"), st({ phase: "question", points: { Ann: 100 }, teams: [["Ann", "Bob"], ["Cy", "Di"]], teamPoints: [50, 200], questions: [] }))!;
    expect(b.teams!.map((t) => [t.name, t.score])).toEqual([["Blue team", 200], ["Red team", 50]]);
  });
  it("In-Sync shows the group score; Mafia shows no board", () => {
    expect(screenBoard(setup("insync"), st({ score: 7 }))).toEqual({ rows: [], teams: [{ name: "Group score", score: 7 }] });
    expect(screenBoard(setup("mafia"), st({ phase: "night" }))).toBeNull();
  });
  it("Pecking Order: rows from points, the reveal's gain with the closest bonus, and team totals", () => {
    const last = { scores: { Ann: { guess: 3, points: 80, bonus: true }, Bob: { guess: 9, points: 0, bonus: false } } };
    const s = (phase: string) => st({ phase, round: 0, questions: [], points: { Ann: 100, Bob: 40, Cy: 5 }, history: [last] });
    const reveal = screenBoard(setup("pecking"), s("reveal"))!;
    expect(reveal.rows.map((r) => [r.name, r.score, r.last])).toEqual([["Ann", 100, 80 + PK.CLOSEST_BONUS], ["Bob", 40, undefined], ["Cy", 5, undefined], ["Di", 0, undefined]]);
    expect(screenBoard(setup("pecking"), s("question"))!.rows.every((r) => r.last === undefined)).toBe(true);
    const teamed = screenBoard(setup("pecking", { teams: 2, teamMap: { Ann: 0, Bob: 1, Cy: 1, Di: 0 } }), s("question"))!;
    expect(teamed.teams!.map((t) => [t.name, t.score])).toEqual([["Red team", 100], ["Blue team", 45]]);
  });
  it("Head to head counts words won", () => {
    const b = screenBoard(setup("vowelplay"), st({ mode: "duel", players: ["Ann", "Bob"], points: {}, history: [{ winner: "Bob" }, { winner: "Bob" }, { winner: null }] }))!;
    expect(b.rows.map((r) => r.score)).toEqual([0, 2]);
  });
});
