// Party trivia: everyone sees the same question and four options at once, answers on their own phone, and a right
// answer scores more the faster it lands. From 4 players the table can split into teams: each member votes, and the
// team's answer is its most-voted option. Questions come from the trivia bank and get harder as the game goes on.
import type { TriviaCategory } from "../trivia/types";
import { TIERS, tierPools, type TierQuestion } from "../trivia/tiers";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { has, own } from "../party/own";
import { buildTeams, TEAM_MIN_PLAYERS } from "../party/teams";
export { buildTeams };

export const QUESTION_MS = 25_000, REVEAL_MS = 7_000, BASE = 100, SPEED_MAX = 50;
/** Buzz mode: how long the buzzer has to answer, and what a wrong or missing answer costs. */
export const BUZZ_ANSWER_MS = 5_000, WRONG_BUZZ = 50;
export { TEAM_MIN_PLAYERS };

export type PTQuestion = TierQuestion;
export type PTState = {
  players: string[];
  teams: string[][] | null;
  questions: PTQuestion[];
  round: number;
  phase: "question" | "reveal";
  answers: Record<string, { choice: string; at: number }>;
  points: Record<string, number>;
  teamPoints: number[];
  /** Times each player's own vote was right: the "carried the team" stat. */
  correct: Record<string, number>;
  history: { answers: Record<string, string>; teamChoice: (string | null)[] }[];
  phaseAt: number;
  /** Public and stable for one game: what a sip card is keyed on. */
  startedAt: number;
  done: boolean;
  drinks?: DrinkState;
  /** "buzz": at the table, the first to buzz answers alone. Absent or "phones": everyone answers on their phone. */
  answerMode?: "phones" | "buzz";
  /** Buzz mode: who holds the buzz (answers for their team), and when, and how long after the question began (server clock). */
  buzzer?: string | null;
  buzzAt?: number | null;
  buzzMs?: number | null;
  /** Buzz mode: players locked out of this question by a wrong or missing answer (a whole team at once with teams). */
  locked?: string[];
  /** Buzz mode: who buzzed wrong on this question (sips go to them and their team only). */
  missed?: string[];
};

/** What a seat is sent: the question being asked has no `answer` until the reveal, and later questions are not sent. */
export type PTView = Omit<PTState, "questions"> & { questions: (Omit<PTQuestion, "answer"> & { answer?: string })[]; total: number };

/** The most-voted option; on a tie, whichever was chosen first. */
export function teamChoice(votes: { choice: string; at: number }[]): string | null {
  const tally = new Map<string, { n: number; first: number }>();
  for (const v of votes) {
    const t = tally.get(v.choice);
    tally.set(v.choice, t ? { n: t.n + 1, first: Math.min(t.first, v.at) } : { n: 1, first: v.at });
  }
  let best: [string, { n: number; first: number }] | null = null;
  for (const e of tally) if (!best || e[1].n > best[1].n || (e[1].n === best[1].n && e[1].first < best[1].first)) best = e;
  return best ? best[0] : null;
}

/** Every category contributes its clues by tier (easy first). Picks `count` spread across the tiers, in tier order. */
function flatten(categories: TriviaCategory[], count: number, seed: number): PTQuestion[] {
  const tiers = tierPools(categories, seed);
  const want = Math.min(count, tiers.reduce((n, t) => n + t.length, 0));
  const take = tiers.map(() => 0);
  for (let i = 0, left = want; left > 0; i++) {
    const t = i % TIERS;
    if (take[t]! < tiers[t]!.length) { take[t]!++; left--; }
  }
  return tiers.flatMap((t, i) => t.slice(0, take[i]));
}

export function init(o: { players: string[]; categories: TriviaCategory[]; count: number; teams: number; teamMap: Record<string, number>; drinking?: boolean; answer?: "phones" | "buzz"; seed: number; now: number }): PTState {
  const questions = flatten(o.categories, o.count, o.seed);
  const built = o.teams >= 2 && o.players.length >= TEAM_MIN_PLAYERS ? buildTeams(o.players, o.teams, o.teamMap) : null;
  const filled = built ? built.filter((t) => t.length > 0) : [];
  const teams = filled.length >= 2 ? filled : null; // empty teams are dropped; one team left means solo scoring
  return {
    players: o.players, teams, questions, round: 0, phase: "question", answers: {},
    points: Object.fromEntries(o.players.map((p) => [p, 0])), teamPoints: teams ? teams.map(() => 0) : [],
    correct: Object.fromEntries(o.players.map((p) => [p, 0])), history: [], phaseAt: o.now, startedAt: o.now, done: questions.length === 0,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
    ...(o.answer === "buzz" ? { answerMode: "buzz" as const, buzzer: null, buzzAt: null, buzzMs: null, locked: [], missed: [] } : {}),
  };
}

const bonus = (s: PTState, at: number) => Math.round(SPEED_MAX * Math.max(0, Math.min(1, 1 - (at - s.phaseAt) / QUESTION_MS)));

/** A player locks in an option. One answer each, only options on screen, and the clock is the server's. At exactly QUESTION_MS still counts; after it, the round is closed to answers. */
export function answer(s: PTState, by: string, choice: string, now: number): PTState {
  if (s.done || s.phase !== "question" || !s.players.includes(by) || has(s.answers, by) || now - s.phaseAt > QUESTION_MS) return s;
  if (typeof choice !== "string" || !s.questions[s.round]!.options.includes(choice)) return s;
  if (s.answerMode === "buzz") return buzzAnswer(s, by, choice, now);
  const answers = { ...s.answers, [by]: { choice, at: now } };
  const filled = { ...s, answers };
  return s.players.every((p) => has(answers, p)) ? reveal(filled, now) : filled;
}

const mateIdx = (s: PTState, p: string) => (s.teams ? s.teams.findIndex((t) => t.includes(p)) : -1);
const mates = (s: PTState, p: string) => (s.teams ? (s.teams[mateIdx(s, p)] ?? [p]) : [p]);

/** Buzz mode: the first to buzz holds it; nobody else can while it is held, or if their team is locked out. */
export function buzz(s: PTState, by: string, now: number): PTState {
  if (s.answerMode !== "buzz" || s.done || s.phase !== "question" || s.buzzer != null || !s.players.includes(by) || (s.locked ?? []).includes(by) || now - s.phaseAt > QUESTION_MS) return s;
  return { ...s, buzzer: by, buzzAt: now, buzzMs: Math.max(0, now - s.phaseAt) };
}

/** A wrong or missing answer: 50 off (floored at 0) for the player, or the team, lock them out, and buzzing reopens. */
function wrongBuzz(s: PTState, now: number, gone: string[] = []): PTState {
  const by = s.buzzer!;
  const points = { ...s.points, [by]: Math.max(0, (own(s.points, by) ?? 0) - WRONG_BUZZ) };
  const ti = mateIdx(s, by);
  const teamPoints = s.teams && ti >= 0 ? s.teamPoints.map((t, i) => (i === ti ? Math.max(0, t - WRONG_BUZZ) : t)) : s.teamPoints;
  const locked = [...new Set([...(s.locked ?? []), ...mates(s, by)])];
  return reopen({ ...s, points, teamPoints, locked, missed: [...(s.missed ?? []), by] }, now, gone);
}

/** Frees the buzz; if nobody left at the table can buzz, the question is over. */
function reopen(s: PTState, now: number, gone: string[] = []): PTState {
  const open = { ...s, buzzer: null, buzzAt: null, buzzMs: null };
  const can = s.players.filter((p) => !gone.includes(p) && !(s.locked ?? []).includes(p));
  return can.length === 0 ? reveal(open, now) : open;
}

function buzzAnswer(s: PTState, by: string, choice: string, now: number): PTState {
  if (s.buzzer !== by) return s;
  if (choice !== s.questions[s.round]!.answer) return wrongBuzz(s, now);
  return reveal({ ...s, answers: { ...s.answers, [by]: { choice, at: now } } }, now);
}

function drinkCalls(s: PTState, entities: { members: string[]; right: boolean; last: number | null }[]): DrinkCall[] {
  const calls: DrinkCall[] = [];
  for (const e of entities) if (!e.right) for (const m of e.members) calls.push({ to: m, sips: 1, reason: "Wrong answer" });
  const timed = entities.filter((e) => e.last != null);
  if (timed.length >= 2) {
    const slow = Math.max(...timed.map((e) => e.last!));
    const slowest = timed.filter((e) => e.last === slow);
    if (slowest.length === 1) for (const m of slowest[0]!.members) calls.push({ to: m, sips: 1, reason: s.teams ? "Slowest team" : "Slowest to answer" });
  }
  return calls;
}

function reveal(s: PTState, now: number): PTState {
  const right = s.questions[s.round]!.answer;
  const votes = (m: string[]) => m.flatMap((p) => own(s.answers, p) ?? []);
  const points = { ...s.points }, correct = { ...s.correct };
  for (const p of s.players) {
    const a = own(s.answers, p);
    if (a && a.choice === right) { points[p] = (own(points, p) ?? 0) + BASE + bonus(s, a.at); correct[p] = (own(correct, p) ?? 0) + 1; }
  }
  const groups = s.teams ?? s.players.map((p) => [p]);
  const choices = groups.map((m) => teamChoice(votes(m)));
  const teamPoints = s.teams
    ? s.teamPoints.map((t, i) => {
        if (choices[i] !== right) return t;
        const first = Math.min(...votes(s.teams![i]!).filter((v) => v.choice === right).map((v) => v.at));
        return t + BASE + bonus(s, first);
      })
    : s.teamPoints;
  const h = { answers: Object.fromEntries(s.players.flatMap((p) => (has(s.answers, p) ? [[p, s.answers[p]!.choice]] : []))), teamChoice: choices };
  const buzzCalls: DrinkCall[] = (s.missed ?? []).flatMap((by) => mates(s, by).map((to) => ({ to, sips: 1, reason: "Wrong answer" })));
  const drinks = s.drinks && s.answerMode === "buzz"
    ? addCalls(s.drinks, [...new Map(buzzCalls.map((c) => [c.to, c])).values()], s.players)
    : s.drinks
    ? addCalls(s.drinks, drinkCalls(s, groups.map((m, i) => ({ members: m, right: choices[i] === right, last: votes(m).length ? Math.max(...votes(m).map((v) => v.at)) : null }))), s.players)
    : undefined;
  return { ...s, phase: "reveal", points, correct, teamPoints, history: [...s.history, h], ...(drinks ? { drinks } : {}), phaseAt: now };
}

function advance(s: PTState, now: number): PTState {
  const round = s.round + 1;
  if (round >= s.questions.length) return { ...s, done: true, phaseAt: now };
  return { ...s, round, phase: "question", answers: {}, phaseAt: now, ...(s.answerMode === "buzz" ? { buzzer: null, buzzAt: null, buzzMs: null, locked: [], missed: [] } : {}) };
}

/** Closes the question early once every player still at the table (not in `gone`) has answered. */
export function settle(s: PTState, gone: string[], now: number): PTState {
  if (s.done || s.phase !== "question") return s;
  const here = s.players.filter((p) => !gone.includes(p));
  if (s.answerMode === "buzz") {
    const held = s.buzzer != null && gone.includes(s.buzzer) ? { ...s, buzzer: null, buzzAt: null, buzzMs: null } : s;
    return here.length > 0 && here.every((p) => (held.locked ?? []).includes(p)) ? reveal(held, now) : held;
  }
  return here.length > 0 && here.every((p) => has(s.answers, p)) ? reveal(s, now) : s;
}

/** Ends a reveal early. In a room only the host can (the server checks). */
export function next(s: PTState, now: number): PTState {
  return s.done || s.phase !== "reveal" ? s : advance(s, now);
}

/** Clocks: an unfinished question closes when time is up, so a player who left never holds it; a reveal moves on. */
export function tick(s: PTState, now: number): PTState {
  if (s.done) return s;
  if (s.phase === "question" && now - s.phaseAt > QUESTION_MS) return reveal(s, now);
  if (s.phase === "question" && s.answerMode === "buzz" && s.buzzer != null && now - s.buzzAt! >= BUZZ_ANSWER_MS) return wrongBuzz(s, now);
  if (s.phase === "reveal" && now - s.phaseAt >= REVEAL_MS) return advance(s, now);
  return s;
}

/**
 * What one seat may see. During a question: no answer for it, no later questions, and other seats' choices are blanked
 * (only that they answered), except a teammate's, which stay visible. Past rounds are open.
 */
export function redactFor(s: PTState, me: string | null): PTView {
  const total = s.questions.length;
  if (s.done) return { ...s, total };
  const asking = s.phase === "question";
  const mates = new Set(me ? (s.teams?.find((t) => t.includes(me)) ?? [me]) : []);
  const questions = s.questions.slice(0, s.round + 1).map((q, i) => {
    if (asking && i === s.round) {
      const { answer: _answer, ...open } = q;
      return open;
    }
    return q;
  });
  const answers = asking ? Object.fromEntries(Object.entries(s.answers).map(([p, a]) => [p, mates.has(p) ? a : { choice: "", at: 0 }])) : s.answers;
  return { ...s, questions, answers, total };
}
