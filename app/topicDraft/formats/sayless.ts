// Say Less: one player describes secret words one clue word at a time from a shared budget; the others guess.
// This file is pure: the server runs it for rooms and the browser runs it for solo. It never imports the word lists:
// words come from ../sayless/source, which only the places that deal words fill in.
import { shuffle } from "../rng";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { own } from "../party/own";
import { buildTeams, TEAM_MIN_PLAYERS } from "../party/teams";
import { JUDGE_MS, REVEAL_MS, SPEAK_MS, WORD_MS, checkClue, clueScore, guardLoss, matchesGuess, normText, turnBudget } from "../sayless/rules";
import { wordsOf, type SayWord } from "../sayless/source";

export type SLTurn = { describer: string; team: number | null };
export type SLWord = SayWord & { id: string };
/** `guarded`: what the par guard actually took from each other guesser. `bonus`: unused budget, on a turn's last word. */
export type SLHistory = { word: string; par: number; describer: string; clues: string[]; winner: string | null; points: number; passed?: boolean; bonus?: number; guarded?: Record<string, number> };

export type SLState = {
  players: string[];
  teams: string[][] | null;
  decks: string[];
  turns: SLTurn[];
  turn: number;
  wordsPerTurn: number;
  /** The words dealt for each turn. Never sent to any seat. */
  deal: SLWord[][];
  /** Index of the current word within the turn. */
  at: number;
  phase: "clue" | "speak" | "judge" | "reveal";
  clues: string[];
  budget: number;
  budgetStart: number;
  /** Who may guess this turn. */
  guessers: string[];
  /** Buzzers judged wrong on this word. */
  locked: string[];
  buzzer: string | null;
  answerMode: "type" | "buzz";
  guard: boolean;
  points: Record<string, number>;
  teamPoints: number[];
  history: SLHistory[];
  phaseAt: number;
  /** When the current word started: its WORD_MS clock. */
  wordAt: number;
  /** When the game started: a public key for this game (the drink cards use it). */
  startedAt: number;
  done: boolean;
  seed: number;
  drinks?: DrinkState;
  /** The last refused clue, so the describer's phone can say why. `seq` goes up with each refusal; cleared by an accepted clue or a new word. */
  refused?: { seq: number; reason: string };
};

/** What a seat is sent. `current` is the word in play with its name, aliases and id blanked unless the word has ended;
 * `word` is the full word for the describer only while it is live. */
export type SLView = Omit<SLState, "deal" | "seed"> & { total: number; current: SLWord | null; word: SLWord | null };

const pts = (r: Record<string, number>, p: string) => own(r, p) ?? 0;
const live = (s: SLState) => s.phase === "clue" || s.phase === "speak" || s.phase === "judge";
const wordOf = (s: SLState): SLWord | null => s.deal[s.turn]?.[s.at] ?? null;
export const currentDescriber = (s: SLState): string => s.turns[s.turn]?.describer ?? "";
const inTime = (s: SLState, now: number) => now - s.wordAt <= WORD_MS;
/** A copy without `refused`: an accepted clue or a new word clears it. */
const unrefused = (s: SLState): SLState => {
  const o = { ...s };
  delete o.refused;
  return o;
};

function turnOrder(players: string[], teams: string[][] | null, rounds: number): SLTurn[] {
  const one: SLTurn[] = [];
  if (!teams) for (const p of players) one.push({ describer: p, team: null });
  else {
    const most = Math.max(...teams.map((t) => t.length));
    for (let i = 0; i < most; i++) teams.forEach((t, ti) => { if (t[i] !== undefined) one.push({ describer: t[i]!, team: ti }); });
  }
  return Array.from({ length: rounds }, () => one).flat();
}

function guessersFor(s: Pick<SLState, "players" | "teams" | "turns">, turn: number): string[] {
  const t = s.turns[turn];
  if (!t) return [];
  const pool = t.team !== null && s.teams ? s.teams[t.team]! : s.players;
  return pool.filter((p) => p !== t.describer);
}

export function init(o: {
  players: string[]; decks: string[]; rounds: number; wordsPerTurn: number; teams: number; teamMap: Record<string, number>;
  guard?: boolean; answer?: "phones" | "buzz"; avoid?: string[]; drinking?: boolean; seed: number; now: number;
}): SLState {
  const built = o.teams >= 2 && o.players.length >= TEAM_MIN_PLAYERS ? buildTeams(o.players, o.teams, o.teamMap ?? {}).filter((t) => t.length > 0) : null;
  const teams = built && built.length >= 2 && built.every((t) => t.length >= 2) ? built : null;
  const rounds = Number.isFinite(o.rounds) ? Math.min(3, Math.max(1, Math.floor(o.rounds))) : 1;
  const wordsPerTurn = Number.isFinite(o.wordsPerTurn) ? Math.min(5, Math.max(3, Math.floor(o.wordsPerTurn))) : 3;

  // Mixed decks pool their words; a name in more than one deck counts once (the first deck's par).
  const avoid = new Set(o.avoid ?? []);
  const byId = new Map<string, SLWord>();
  for (const d of o.decks) for (const w of wordsOf(d)) {
    const id = `sl:${w.name}`;
    if (!byId.has(id) && !avoid.has(id)) byId.set(id, { ...w, id });
  }
  const [pool, seed] = shuffle([...byId.values()], o.seed);
  const order = turnOrder(o.players, teams, rounds);
  const deal: SLWord[][] = [];
  for (let i = 0; i < order.length && i * wordsPerTurn < pool.length; i++) deal.push(pool.slice(i * wordsPerTurn, (i + 1) * wordsPerTurn));
  const turns = order.slice(0, deal.length);
  const budget = deal.length ? turnBudget(deal[0]!.map((w) => w.par)) : 0;
  return {
    players: o.players, teams, decks: o.decks, turns, turn: 0, wordsPerTurn, deal, at: 0, phase: "clue", clues: [], budget, budgetStart: budget,
    guessers: guessersFor({ players: o.players, teams, turns }, 0), locked: [], buzzer: null,
    answerMode: o.answer === "buzz" ? "buzz" : "type", guard: o.guard === true,
    points: Object.fromEntries(o.players.map((p) => [p, 0])), teamPoints: teams ? teams.map(() => 0) : [], history: [],
    phaseAt: o.now, wordAt: o.now, startedAt: o.now, done: deal.length === 0, seed,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const sip = (s: SLState, calls: DrinkCall[]): Pick<SLState, "drinks"> | Record<string, never> =>
  s.drinks && calls.length ? { drinks: addCalls(s.drinks, calls, s.players) } : {};

/** Adds `delta` to a player and, in teams, to their team, so team points are always the sum of their members'. */
function award(points: Record<string, number>, teamPoints: number[], s: SLState, p: string, delta: number) {
  points[p] = pts(points, p) + delta;
  const ti = s.teams ? s.teams.findIndex((t) => t.includes(p)) : -1;
  if (ti >= 0) teamPoints[ti] = (teamPoints[ti] ?? 0) + delta;
}

/** Ends the current word: scores, the par guard, the unused-budget bonus on the turn's last word, then the reveal. */
function finish(s: SLState, now: number, o: { winner?: string; passed?: boolean; cut?: boolean } = {}): SLState {
  const w = wordOf(s)!;
  const describer = currentDescriber(s);
  const points = { ...s.points };
  const teamPoints = [...s.teamPoints];
  const h: SLHistory = { word: w.name, par: w.par, describer, clues: s.clues, winner: o.winner ?? null, points: 0, ...(o.passed ? { passed: true } : {}) };
  if (o.winner !== undefined) {
    const score = clueScore(w.par, s.clues.length);
    h.points = score;
    award(points, teamPoints, s, o.winner, score);
    award(points, teamPoints, s, describer, score);
    const loss = guardLoss(w.par, s.clues.length);
    if (s.guard && loss > 0) {
      const guarded: Record<string, number> = Object.create(null);
      for (const p of s.guessers) {
        if (p === o.winner) continue;
        const took = Math.min(loss, pts(points, p));
        if (took > 0) { guarded[p] = took; award(points, teamPoints, s, p, -took); }
      }
      if (Object.keys(guarded).length) h.guarded = { ...guarded };
    }
  }
  // A word ending with the budget spent is the turn's last: no more clues are possible, so the leftover words stay unplayed.
  if (!o.cut && (s.at >= s.deal[s.turn]!.length - 1 || s.budget <= 0)) {
    // Unused budget pays only for a turn that got somewhere, and never more than the turn's guessed words earned:
    // a describer can't farm it by sitting on the budget. This turn's earlier words are the last `at` history entries.
    const turnSoFar = s.at > 0 ? s.history.slice(-s.at) : [];
    const earned = [...turnSoFar, h].reduce((a, x) => a + (x.winner !== null ? x.points : 0), 0);
    h.bonus = Math.min(s.budget, earned);
    if (h.bonus > 0) award(points, teamPoints, s, describer, h.bonus);
  }
  return { ...unrefused(s), phase: "reveal", points, teamPoints, history: [...s.history, h], phaseAt: now };
}

function startTurn(s: SLState, turn: number, now: number): SLState {
  const rest = unrefused(s);
  if (turn >= s.turns.length) return { ...rest, buzzer: null, done: true, phaseAt: now };
  const budget = turnBudget(s.deal[turn]!.map((w) => w.par));
  return { ...rest, turn, at: 0, phase: "clue", clues: [], budget, budgetStart: budget, guessers: guessersFor(s, turn), locked: [], buzzer: null, phaseAt: now, wordAt: now };
}

function advance(s: SLState, now: number): SLState {
  if (s.budget > 0 && s.at + 1 < s.deal[s.turn]!.length) {
    return { ...unrefused(s), at: s.at + 1, phase: "clue", clues: [], locked: [], buzzer: null, phaseAt: now, wordAt: now };
  }
  return startTurn(s, s.turn + 1, now);
}

export function clue(s: SLState, by: string, text: unknown, now: number): SLState {
  if (s.done || s.phase !== "clue" || by !== currentDescriber(s) || s.budget <= 0 || !inTime(s, now)) return s;
  const w = wordOf(s)!;
  const main = checkClue(w.name, text);
  const alias = main.ok ? (w.also ?? []).map((a) => checkClue(a, text)).find((c) => !c.ok) : undefined;
  const bad = !main.ok ? main : alias;
  if (bad && !bad.ok) {
    const refused = { seq: (s.refused?.seq ?? 0) + 1, reason: bad.reason };
    // Only the whole main word costs a sip, and only when it is long enough that saying it is a real slip.
    const slip = !main.ok && main.secret && normText(w.name).length >= 4;
    return { ...s, refused, ...sip(s, slip ? [{ to: by, sips: 1, reason: "Said the word" }] : []) };
  }
  if (!main.ok) return s; // unreachable: keeps the types narrow
  return { ...unrefused(s), clues: [...s.clues, main.clue], budget: s.budget - 1 };
}

/** A typed guess. A wrong one returns the same object so a room sends nothing. */
export function guess(s: SLState, by: string, text: unknown, now: number): SLState {
  if (s.done || s.phase !== "clue" || s.answerMode !== "type" || !s.guessers.includes(by) || !inTime(s, now)) return s;
  return matchesGuess(wordOf(s)!, text) ? finish(s, now, { winner: by }) : s;
}

/** The describer gives up on this word. Costs 1 budget (none at 0) and scores nobody. */
export function pass(s: SLState, by: string, now: number): SLState {
  if (s.done || s.phase !== "clue" || by !== currentDescriber(s) || !inTime(s, now)) return s;
  return finish({ ...s, budget: s.budget - Math.min(1, s.budget) }, now, { passed: true });
}

/** Buzz mode: the first guesser to buzz gets to say it out loud. */
export function buzz(s: SLState, by: string, now: number): SLState {
  if (s.done || s.phase !== "clue" || s.answerMode !== "buzz" || s.buzzer !== null || !s.guessers.includes(by) || s.locked.includes(by) || !inTime(s, now)) return s;
  return { ...s, phase: "speak", buzzer: by, phaseAt: now };
}

/** Buzz mode: the buzzer has said it, so it goes to the describer to judge. Too late counts as wrong (see tick). */
export function spoke(s: SLState, by: string, now: number): SLState {
  if (s.done || s.phase !== "speak" || by !== s.buzzer || now - s.phaseAt > SPEAK_MS) return s;
  return { ...s, phase: "judge", phaseAt: now };
}

/** A wrong buzz: the buzzer is locked out of this word, sips, and buzzing reopens if there is time and someone left to buzz. */
function wrongBuzz(s: SLState, now: number, gone: string[] = []): SLState {
  const by = s.buzzer!;
  const next: SLState = { ...s, phase: "clue", buzzer: null, locked: [...s.locked, by], phaseAt: now, ...sip(s, gone.includes(by) ? [] : [{ to: by, sips: 1, reason: "Wrong buzz" }]) };
  const open = next.guessers.some((p) => !next.locked.includes(p) && !gone.includes(p));
  return open && inTime(next, now) ? next : finish(next, now);
}

/**
 * Buzz mode: only the describer judges, because only they can see the word (showing it to anyone else would give it
 * away to the guessers still in after a wrong call). Their verdict settles the buzz at once.
 */
export function mark(s: SLState, by: string, verdict: unknown, now: number): SLState {
  if (s.done || s.phase !== "judge" || (verdict !== "right" && verdict !== "wrong") || by !== currentDescriber(s) || now - s.phaseAt > JUDGE_MS) return s;
  return verdict === "wrong" ? wrongBuzz(s, now) : finish(s, now, { winner: s.buzzer! });
}

/**
 * Closes what is waiting on people who left (`gone`): a departed describer's word ends with no points and their turn is
 * over; with every guesser gone the word ends like a timeout; a departed buzzer is wrong.
 */
export function settle(s: SLState, gone: string[], now: number): SLState {
  let x = s;
  // A departed describer can't describe: cut each such turn (more than one may be waiting).
  while (!x.done && live(x) && gone.includes(currentDescriber(x))) {
    const cut = finish({ ...x, buzzer: null }, now, { cut: true });
    x = startTurn(cut, x.turn + 1, now);
  }
  if (x.done || !live(x)) return x;
  if ((x.phase === "speak" || x.phase === "judge") && x.buzzer !== null && gone.includes(x.buzzer)) return wrongBuzz(x, now, gone);
  if (x.phase === "clue" && x.guessers.every((p) => gone.includes(p) || x.locked.includes(p))) return finish(x, now);
  return x;
}

/** Ends a reveal early. In a room only the host can (the server checks). */
export function next(s: SLState, now: number): SLState {
  return s.done || s.phase !== "reveal" ? s : advance(s, now);
}

/** Clocks: a word runs out, a speaker's time ends (wrong), judging ends, a reveal moves on. Deadlines are inclusive. */
export function tick(s: SLState, now: number): SLState {
  if (s.done) return s;
  if (s.phase === "clue" && !inTime(s, now)) return finish(s, now);
  if (s.phase === "speak" && now - s.phaseAt > SPEAK_MS) return wrongBuzz(s, now);
  if (s.phase === "judge" && now - s.phaseAt > JUDGE_MS) return finish(s, now, { winner: s.buzzer! }); // no call in time counts as right
  if (s.phase === "reveal" && now - s.phaseAt >= REVEAL_MS) return advance(s, now);
  return s;
}

/** Most points; ties share. */
export function winners(s: SLState): string[] {
  const top = Math.max(0, ...s.players.map((p) => pts(s.points, p)));
  return s.players.filter((p) => pts(s.points, p) === top);
}

/** Every word that was shown: history only gains a word when it ends. */
export function seenKeys(s: SLState): string[] {
  return [...new Set(s.history.map((h) => `sl:${h.word}`))];
}

/**
 * What one seat may see. No deal and no seed ever. The live word's name, aliases and id (which holds the name) go only to
 * the describer, at `word`; everyone gets it at `current` once it has ended.
 */
export function redactFor(s: SLState, me: string | null): SLView {
  const rest: Partial<SLState> = { ...s };
  delete rest.deal;
  delete rest.seed;
  const w = s.done ? null : wordOf(s);
  const open = s.phase === "reveal";
  const current = w ? (open ? w : { ...w, id: "", name: "", also: [] }) : null;
  const word = w && live(s) && me !== null && me === currentDescriber(s) ? w : null;
  return { ...(rest as Omit<SLState, "deal" | "seed">), total: s.turns.length, current, word };
}
