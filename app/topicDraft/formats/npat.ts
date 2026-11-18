// NPAT (Name Place Animal Thing): a letter, a few categories, one answer each before the clock runs out. Rarer answers
// score more, and an answer someone else also gave is halved. Answers not on our lists go to a quick table vote.
// Pure: the server runs it for rooms and the browser for solo. It reads the lists through npat/source, never the data.
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { has, own } from "../party/own";
import { buildTeams, TEAM_MIN_PLAYERS } from "../party/teams";
import { shuffle } from "../rng";
import {
  ANSWER_MAX, DEFAULT_ROUND_S, normAnswer, REVEAL_MS, ROUND_MS, sharedPoints, startsWith, TIER_POINTS, VOTE_MS, type Tier,
} from "../npat/rules";
import { lettersAvailable, lookup, tierOf } from "../npat/source";

/** Fewer eligible voters than this and an unknown answer is accepted with no vote. */
export const MIN_VOTERS = 3;

/**
 * One player's answer to one category, decided when writing closes. `entry` is the matched list entry's name. An
 * unknown answer gets `votes` while it is voted on and `accepted` once settled. `points`, `tier` and `shared` are filled
 * in when its category is revealed; `review` marks an accepted unknown, to be checked for the lists later.
 */
export type NPAnswer = {
  text: string;
  entry: string | null;
  status: "ok" | "wrong-letter" | "unknown" | "blank";
  votes?: Record<string, boolean>;
  accepted?: boolean;
  points?: number;
  tier?: Tier;
  shared?: boolean;
  review?: true;
};
/** Per player, one answer per category, in category order. */
export type NPRound = { letter: string; answers: Record<string, NPAnswer[]> };
export type NPScore = { points: number; tier: Tier | null; shared: boolean };

export type NPState = {
  players: string[];
  teams: string[][] | null;
  categories: string[];
  rounds: number;
  round: number;
  letter: string;
  /** Every round's letter, drawn at the start. A seat only ever sees the ones reached. */
  letters: string[];
  phase: "write" | "reveal" | "vote" | "summary";
  cat: number;
  /** What each player has typed this round, while writing. Cleared when writing closes. */
  answers: Record<string, string[]>;
  submitted: string[];
  stopEarly: boolean;
  roundMs: number;
  hard: boolean;
  history: NPRound[];
  points: Record<string, number>;
  teamPoints: number[];
  /** During `vote`: the index, in `unknownGroups` of the current category, of the answer being voted on. */
  voteOn: number | null;
  /** Players who left (from `settle`): not waited for, not voters, and blank for categories not yet revealed. */
  gone: string[];
  phaseAt: number;
  startedAt: number;
  done: boolean;
  seed: number;
  drinks?: DrinkState;
};

/** The open vote, as a seat sees it: the answer, who gave it, who may vote and who already has. */
export type NPVote = { text: string; members: string[]; voters: string[]; voted: string[] };
/** What a seat is sent: see `redactFor`. `filled` is how many answers each player has typed (writing only). */
export type NPView = NPState & { filled: Record<string, number>; vote: NPVote | null };

const letterOf = (k: string) => k.replace(/^np:/, "").toUpperCase();

/** Seeded shuffle of the usable letters, avoided ones last; reused in that order if there are more rounds than letters. */
function drawLetters(categories: string[], hard: boolean, rounds: number, avoid: string[], seed: number): [string[], number] {
  const all = lettersAvailable(categories, hard);
  if (all.length === 0) throw new Error("NPAT: no letter has enough answers in every chosen category");
  const avoided = new Set(avoid.map(letterOf));
  const [fresh, s1] = shuffle(all.filter((l) => !avoided.has(l)), seed);
  const [seen, s2] = shuffle(all.filter((l) => avoided.has(l)), s1);
  const order = [...fresh, ...seen];
  return [Array.from({ length: rounds }, (_, i) => order[i % order.length]!), s2];
}

export function init(o: {
  players: string[]; categories: string[]; rounds: number; roundSeconds?: 45 | 60 | 90; hard?: boolean; stopEarly?: boolean;
  teams: number; teamMap: Record<string, number>; avoid?: string[]; drinking?: boolean; seed: number; now: number;
}): NPState {
  const rounds = Math.max(1, Math.floor(o.rounds) || 1);
  const hard = !!o.hard;
  const [letters, seed] = drawLetters(o.categories, hard, rounds, o.avoid ?? [], o.seed);
  const built = o.teams >= 2 && o.players.length >= TEAM_MIN_PLAYERS ? buildTeams(o.players, o.teams, o.teamMap ?? {}).filter((t) => t.length > 0) : [];
  const teams = built.length >= 2 ? built : null;
  return {
    players: o.players, teams, categories: o.categories, rounds, round: 0, letter: letters[0]!, letters, phase: "write", cat: 0,
    answers: {}, submitted: [], stopEarly: !!o.stopEarly, roundMs: ROUND_MS[o.roundSeconds ?? DEFAULT_ROUND_S] ?? ROUND_MS[DEFAULT_ROUND_S],
    hard, history: [], points: Object.fromEntries(o.players.map((p) => [p, 0])), teamPoints: teams ? teams.map(() => 0) : [],
    voteOn: null, gone: [], phaseAt: o.now, startedAt: o.now, done: false, seed,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const here = (s: NPState) => s.players.filter((p) => !s.gone.includes(p));
const writing = (s: NPState, now: number) => !s.done && s.phase === "write" && now - s.phaseAt < s.roundMs;

/** Saves (or replaces) one answer while writing. Anything out of range, too long or not text is refused. */
export function answer(s: NPState, by: string, cat: number, text: unknown, now: number): NPState {
  if (!writing(s, now) || !s.players.includes(by) || s.submitted.includes(by)) return s;
  if (!Number.isInteger(cat) || cat < 0 || cat >= s.categories.length || typeof text !== "string" || text.length > ANSWER_MAX) return s;
  const mine = [...(own(s.answers, by) ?? s.categories.map(() => ""))];
  mine[cat] = text;
  return { ...s, answers: { ...s.answers, [by]: mine } };
}

/** A player is done writing. Writing closes once everyone still here is, or on the first finish with `stopEarly`. */
export function finish(s: NPState, by: string, now: number): NPState {
  if (!writing(s, now) || !s.players.includes(by) || s.submitted.includes(by)) return s;
  const next = { ...s, submitted: [...s.submitted, by] };
  return next.stopEarly || allFinished(next) ? closeWrite(next, now) : next;
}

const allFinished = (s: NPState) => here(s).length > 0 && here(s).every((p) => s.submitted.includes(p));

function classify(category: string, letter: string, raw: string): NPAnswer {
  const text = raw.trim();
  if (!normAnswer(text)) return { text: "", entry: null, status: "blank" };
  const e = lookup(category, text);
  if (e) return { text, entry: e.name, status: startsWith(letter, text, [e.name, ...(e.also ?? [])]) ? "ok" : "wrong-letter" };
  return { text, entry: null, status: startsWith(letter, text) ? "unknown" : "wrong-letter" };
}

const BLANK: NPAnswer = { text: "", entry: null, status: "blank" };

/** Writing is over: every answer is checked against the lists, then the first category opens. */
function closeWrite(s: NPState, now: number): NPState {
  const answers = Object.fromEntries(s.players.map((p) => {
    const typed = s.gone.includes(p) ? [] : (own(s.answers, p) ?? []);
    return [p, s.categories.map((c, i) => classify(c, s.letter, typed[i] ?? ""))];
  }));
  return openCat({ ...s, history: [...s.history, { letter: s.letter, answers }], answers: {}, submitted: [] }, 0, now);
}

const current = (s: NPState) => s.history[s.history.length - 1]!;
const answerOf = (r: NPRound, p: string, cat: number) => own(r.answers, p)?.[cat] ?? BLANK;

/** The current category's unknown answers grouped by normalised text, in seat order: what `voteOn` indexes. */
function unknownGroups(s: NPState): { text: string; members: string[] }[] {
  const r = current(s);
  const by = new Map<string, { text: string; members: string[] }>();
  for (const p of s.players) {
    const a = answerOf(r, p, s.cat);
    if (a.status !== "unknown") continue;
    const k = normAnswer(a.text);
    const g = by.get(k);
    if (g) g.members.push(p);
    else by.set(k, { text: a.text, members: [p] });
  }
  return [...by.values()];
}

const votersFor = (s: NPState, members: string[]) => here(s).filter((p) => !members.includes(p));

/** Applies `f` to the current category's answer of each of `members`. */
function edit(s: NPState, members: string[], f: (a: NPAnswer, p: string) => NPAnswer): NPState {
  const r = current(s);
  const answers = { ...r.answers };
  for (const p of members) answers[p] = answers[p]!.map((a, i) => (i === s.cat ? f(a, p) : a));
  return { ...s, history: [...s.history.slice(0, -1), { ...r, answers }] };
}

/** Shows category `cat`: players who left are blank for it, unknown answers go to a vote (or straight in), then the reveal. */
function openCat(s: NPState, cat: number, now: number): NPState {
  let t: NPState = { ...s, cat };
  const left = t.gone.filter((p) => answerOf(current(t), p, cat).status !== "blank");
  if (left.length) t = edit(t, left, () => BLANK);
  for (const g of unknownGroups(t)) {
    t = edit(t, g.members, (a) => (votersFor(t, g.members).length < MIN_VOTERS ? { ...a, accepted: true } : { ...a, votes: {} }));
  }
  return nextVote(t, -1, now);
}

/** Opens the first undecided unknown after index `after`, or the reveal when none is left. */
function nextVote(s: NPState, after: number, now: number): NPState {
  const groups = unknownGroups(s);
  const r = current(s);
  const i = groups.findIndex((g, j) => j > after && answerOf(r, g.members[0]!, s.cat).accepted === undefined);
  return i < 0 ? reveal(s, now) : { ...s, phase: "vote", voteOn: i, phaseAt: now };
}

/** A yes or no on the unknown answer being voted on. Its givers and players who left can't vote; one vote each. */
export function vote(s: NPState, by: string, ok: boolean, now: number): NPState {
  if (s.done || s.phase !== "vote" || s.voteOn === null || typeof ok !== "boolean") return s;
  const g = unknownGroups(s)[s.voteOn];
  if (!g || !votersFor(s, g.members).includes(by)) return s;
  const votes = answerOf(current(s), g.members[0]!, s.cat).votes ?? {};
  if (has(votes, by)) return s;
  const next = edit(s, g.members, (a) => ({ ...a, votes: { ...votes, [by]: ok } }));
  return checkVote(next, now);
}

/** Closes the open vote once every eligible voter has voted, or at once if too few voters are left. */
function checkVote(s: NPState, now: number): NPState {
  const g = unknownGroups(s)[s.voteOn!]!;
  const voters = votersFor(s, g.members);
  if (voters.length < MIN_VOTERS) return closeVote(s, now, true);
  const votes = answerOf(current(s), g.members[0]!, s.cat).votes ?? {};
  return voters.every((p) => has(votes, p)) ? closeVote(s, now) : s;
}

/** Settles the open vote from the votes cast: more no than yes rejects; a tie (or no votes) accepts. */
function closeVote(s: NPState, now: number, force = false): NPState {
  const at = s.voteOn!;
  const g = unknownGroups(s)[at]!;
  const cast = Object.values(answerOf(current(s), g.members[0]!, s.cat).votes ?? {});
  const no = cast.filter((v) => !v).length;
  const accepted = force || no <= cast.length - no;
  return nextVote(edit(s, g.members, (a) => ({ ...a, accepted })), at, now);
}

const scores = (a: NPAnswer) => a.status === "ok" || (a.status === "unknown" && a.accepted === true);
const groupKey = (a: NPAnswer) => (a.status === "ok" ? `e:${normAnswer(a.entry)}` : `u:${normAnswer(a.text)}`);

/**
 * Points for one category's answers. Answers group by the matched entry (so an alias joins its name) or, for an accepted
 * unknown, by normalised text. A group given by two or more players (with teams: two or more teams) is shared: half
 * points each, rounded up. An accepted unknown scores as Common; blank, wrong-letter and rejected answers score 0.
 */
export function scoreCategory(category: string, answers: Record<string, NPAnswer>, teams: string[][] | null = null): Record<string, NPScore> {
  const unit = (p: string) => (teams ? String(teams.findIndex((t) => t.includes(p))) : `p:${p}`);
  const units = new Map<string, Set<string>>();
  for (const [p, a] of Object.entries(answers)) {
    if (!scores(a)) continue;
    const k = groupKey(a);
    units.set(k, (units.get(k) ?? new Set()).add(unit(p)));
  }
  const out: Record<string, NPScore> = {};
  for (const [p, a] of Object.entries(answers)) {
    if (!scores(a)) { out[p] = { points: 0, tier: null, shared: false }; continue; }
    const e = a.status === "ok" ? lookup(category, a.entry) : null;
    const tier: Tier = e ? tierOf(category, e) : "common";
    const n = units.get(groupKey(a))!.size;
    out[p] = { points: sharedPoints(TIER_POINTS[tier], n), tier, shared: n >= 2 };
  }
  return out;
}

/** Scores the current category, adds its points, pours any sips and starts its reveal. */
function reveal(s: NPState, now: number): NPState {
  const r = current(s);
  const mine = Object.fromEntries(s.players.map((p) => [p, answerOf(r, p, s.cat)]));
  const scored = scoreCategory(s.categories[s.cat]!, mine, s.teams);
  const t = edit(s, s.players, (a, p) => {
    const sc = scored[p]!;
    return { ...a, points: sc.points, ...(sc.tier ? { tier: sc.tier, shared: sc.shared } : {}), ...(sc.tier && a.status === "unknown" ? { review: true as const } : {}) };
  });
  const points = { ...s.points };
  for (const p of s.players) points[p] = (own(points, p) ?? 0) + scored[p]!.points;
  // A team scores each group once: teammates who gave the same answer aren't added twice.
  const teamPoints = s.teams
    ? s.teams.map((team, i) => {
        const seen = new Map<string, number>();
        for (const p of team) if (scored[p]!.points > 0) seen.set(groupKey(mine[p]!), scored[p]!.points);
        return s.teamPoints[i]! + [...seen.values()].reduce((a, b) => a + b, 0);
      })
    : s.teamPoints;
  const calls: DrinkCall[] = [];
  for (const p of s.players) {
    const a = mine[p]!;
    if (a.status === "wrong-letter") calls.push({ to: p, sips: 1, reason: "Wrong letter" });
    else if (a.status === "unknown" && a.accepted === false) calls.push({ to: p, sips: 1, reason: "Voted out" });
  }
  const drinks = s.drinks && calls.length ? addCalls(s.drinks, calls, s.players) : s.drinks;
  return { ...t, phase: "reveal", voteOn: null, points, teamPoints, ...(drinks ? { drinks } : {}), phaseAt: now };
}

/** After a reveal: the next category, or the round summary. After the summary: the next round, or the end. */
function advance(s: NPState, now: number): NPState {
  if (s.phase === "reveal") return s.cat + 1 < s.categories.length ? openCat(s, s.cat + 1, now) : { ...s, phase: "summary", phaseAt: now };
  const round = s.round + 1;
  if (round >= s.rounds) return { ...s, done: true, phaseAt: now };
  return { ...s, round, letter: s.letters[round]!, phase: "write", cat: 0, answers: {}, submitted: [], phaseAt: now };
}

/** Host skip: ends the open vote, a reveal or the summary early. Writing always runs its course. */
export function next(s: NPState, now: number): NPState {
  if (s.done) return s;
  if (s.phase === "vote") return closeVote(s, now);
  if (s.phase === "reveal" || s.phase === "summary") return advance(s, now);
  return s;
}

/** Clocks, one step per call: writing closes, a vote closes, a reveal or summary moves on. Deadlines are inclusive. */
export function tick(s: NPState, now: number): NPState {
  if (s.done) return s;
  const t = now - s.phaseAt;
  if (s.phase === "write") return t >= s.roundMs ? closeWrite(s, now) : s;
  if (s.phase === "vote") return t >= VOTE_MS ? closeVote(s, now) : s;
  return t >= REVEAL_MS ? advance(s, now) : s;
}

/** Records who has left, then closes whatever was only waiting on them. The same state back when nothing changed. */
export function settle(s: NPState, gone: string[], now: number): NPState {
  if (s.done) return s;
  const g = s.players.filter((p) => gone.includes(p));
  const t = g.length === s.gone.length && g.every((p) => s.gone.includes(p)) ? s : { ...s, gone: g };
  if (t.phase === "write" && allFinished(t)) return closeWrite(t, now);
  if (t.phase === "vote" && t.voteOn !== null) return checkVote(t, now);
  return t;
}

/** Top points; ties share. With teams, every member of the top team (or teams). */
export function winners(s: NPState): string[] {
  if (s.teams) {
    const top = Math.max(...s.teamPoints);
    return s.teams.filter((_, i) => s.teamPoints[i] === top).flat();
  }
  const pts = (p: string) => own(s.points, p) ?? 0;
  const top = Math.max(0, ...s.players.map(pts));
  return s.players.filter((p) => pts(p) === top);
}

/** `np:<letter>` for each letter reached: what a later game's `avoid` takes. */
export function seenKeys(s: NPState): string[] {
  return [...new Set(s.letters.slice(0, s.round + 1).map((l) => `np:${l}`))];
}

/** Accepted answers that were not on the lists, for the server to save as `review:<category>` rows. */
export function reviewItems(s: NPState): { player: string; category: string; answer: string }[] {
  return s.history.flatMap((r) => s.players.flatMap((p) => (own(r.answers, p) ?? []).flatMap((a, i) =>
    a.review ? [{ player: p, category: s.categories[i]!, answer: a.text }] : [])));
}

/**
 * What one seat may see. Never the seed or a letter not yet reached. While writing, only `me`'s own typing (nothing for
 * a screen) plus how many answers each player has filled in. During a round's reveal, only the categories opened so far.
 * An open vote shows each seat its own vote and, in `vote`, who has voted.
 */
export function redactFor(s: NPState, me: string | null): NPView {
  const live = !s.done && (s.phase === "vote" || s.phase === "reveal");
  const g = !s.done && s.phase === "vote" && s.voteOn !== null ? unknownGroups(s)[s.voteOn] ?? null : null;
  const history = s.history.map((r, i) => {
    if (!(live && i === s.history.length - 1)) return r;
    const answers = Object.fromEntries(Object.entries(r.answers).map(([p, list]) => [p, list.slice(0, s.cat + 1).map((a, c) => {
      if (!g || c !== s.cat || !g.members.includes(p) || !a.votes) return a;
      return { ...a, votes: me !== null && has(a.votes, me) ? { [me]: a.votes[me]! } : {} };
    })]));
    return { ...r, answers };
  });
  const writing = !s.done && s.phase === "write";
  const answers = writing && me !== null && has(s.answers, me) ? { [me]: s.answers[me]! } : writing ? {} : s.answers;
  const filled = writing ? Object.fromEntries(s.players.map((p) => [p, (own(s.answers, p) ?? []).filter((t) => normAnswer(t)).length])) : {};
  const votes = g ? answerOf(current(s), g.members[0]!, s.cat).votes ?? {} : {};
  const vote = g ? { text: g.text, members: g.members, voters: votersFor(s, g.members), voted: Object.keys(votes) } : null;
  return { ...s, letters: s.letters.slice(0, s.round + 1), seed: 0, history, answers, filled, vote };
}
