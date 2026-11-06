// Party trivia: everyone sees the same question and four options at once, answers on their own phone, and a right
// answer scores more the faster it lands. From 4 players the table can split into teams: each member votes, and the
// team's answer is its most-voted option. Questions come from the trivia bank and get harder as the game goes on.
import type { TriviaCategory } from "../trivia/types";
import { TIERS, tierPools, type TierQuestion } from "../trivia/tiers";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { has, own } from "../party/own";

export const QUESTION_MS = 25_000, REVEAL_MS = 7_000, BASE = 100, SPEED_MAX = 50;
/** Fewest players for teams. */
export const TEAM_MIN_PLAYERS = 4;

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
};

/** What a seat is sent: the question being asked has no `answer` until the reveal, and later questions are not sent. */
export type PTView = Omit<PTState, "questions"> & { questions: (Omit<PTQuestion, "answer"> & { answer?: string })[]; total: number };

/** Host's team map first; anyone it doesn't place (late joiners, bad entries) goes on the smallest team. */
export function buildTeams(players: string[], teams: number, map: Record<string, number>): string[][] {
  const n = Math.max(1, Math.floor(teams));
  const out: string[][] = Array.from({ length: n }, () => []);
  const loose: string[] = [];
  for (const p of players) {
    const t = map[p];
    if (typeof t === "number" && Number.isInteger(t) && t >= 0 && t < n) out[t]!.push(p);
    else loose.push(p);
  }
  for (const p of loose) {
    let at = 0;
    out.forEach((m, i) => { if (m.length < out[at]!.length) at = i; });
    out[at]!.push(p);
  }
  return out;
}

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

export function init(o: { players: string[]; categories: TriviaCategory[]; count: number; teams: number; teamMap: Record<string, number>; drinking?: boolean; seed: number; now: number }): PTState {
  const questions = flatten(o.categories, o.count, o.seed);
  const built = o.teams >= 2 && o.players.length >= TEAM_MIN_PLAYERS ? buildTeams(o.players, o.teams, o.teamMap) : null;
  const filled = built ? built.filter((t) => t.length > 0) : [];
  const teams = filled.length >= 2 ? filled : null; // empty teams are dropped; one team left means solo scoring
  return {
    players: o.players, teams, questions, round: 0, phase: "question", answers: {},
    points: Object.fromEntries(o.players.map((p) => [p, 0])), teamPoints: teams ? teams.map(() => 0) : [],
    correct: Object.fromEntries(o.players.map((p) => [p, 0])), history: [], phaseAt: o.now, startedAt: o.now, done: questions.length === 0,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const bonus = (s: PTState, at: number) => Math.round(SPEED_MAX * Math.max(0, Math.min(1, 1 - (at - s.phaseAt) / QUESTION_MS)));

/** A player locks in an option. One answer each, only options on screen, and the clock is the server's. At exactly QUESTION_MS still counts; after it, the round is closed to answers. */
export function answer(s: PTState, by: string, choice: string, now: number): PTState {
  if (s.done || s.phase !== "question" || !s.players.includes(by) || has(s.answers, by) || now - s.phaseAt > QUESTION_MS) return s;
  if (typeof choice !== "string" || !s.questions[s.round]!.options.includes(choice)) return s;
  const answers = { ...s.answers, [by]: { choice, at: now } };
  const filled = { ...s, answers };
  return s.players.every((p) => has(answers, p)) ? reveal(filled, now) : filled;
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
  const drinks = s.drinks
    ? addCalls(s.drinks, drinkCalls(s, groups.map((m, i) => ({ members: m, right: choices[i] === right, last: votes(m).length ? Math.max(...votes(m).map((v) => v.at)) : null }))), s.players)
    : undefined;
  return { ...s, phase: "reveal", points, correct, teamPoints, history: [...s.history, h], ...(drinks ? { drinks } : {}), phaseAt: now };
}

function advance(s: PTState, now: number): PTState {
  const round = s.round + 1;
  if (round >= s.questions.length) return { ...s, done: true, phaseAt: now };
  return { ...s, round, phase: "question", answers: {}, phaseAt: now };
}

/** Closes the question early once every player still at the table (not in `gone`) has answered. */
export function settle(s: PTState, gone: string[], now: number): PTState {
  if (s.done || s.phase !== "question") return s;
  const here = s.players.filter((p) => !gone.includes(p));
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
