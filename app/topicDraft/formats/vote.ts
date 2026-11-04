// Vote games: a card shows a scenario with two sides. Everyone votes in secret, then guesses how the others voted.
// A right guess scores. Someone nobody read correctly scores too, and on Did That Happen a true vote earns a point.
import { shuffle } from "../rng";
import type { VoteCard } from "../party/decks";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";

export type Side = "a" | "b";
export const VOTE_MS = 40_000;
export const GUESS_MS = 45_000;
export const REVEAL_MS = 9_000;
/** Up to this many players everyone guesses everyone; above it each player guesses TARGETS_BIG people. */
const EVERYONE_MAX = 6, TARGETS_BIG = 3;

export type VoteHistory = {
  votes: Record<string, Side>;
  guesses: Record<string, Record<string, Side>>;
  /** Points each player earned on this card. */
  gained: Record<string, number>;
  /** Voters who were guessed at, and nobody got right. */
  nobodyGot: string[];
};

export type VoteState = {
  players: string[];
  deck: string;
  cards: VoteCard[];
  round: number;
  phase: "vote" | "guess" | "reveal";
  /** This card's votes. Others only see that someone voted until the reveal. */
  votes: Record<string, Side>;
  /** This card's guesses: guesser -> target -> the side they think the target picked. */
  guesses: Record<string, Record<string, Side>>;
  /** Who each voter guesses on this card. Only players who voted take part. */
  targets: Record<string, string[]>;
  /** Every finished card. */
  history: VoteHistory[];
  points: Record<string, number>;
  /** Host setting: open the booths at the reveal. Off keeps every vote and guess secret all game. */
  showVotes: boolean;
  drinks?: DrinkState;
  seed: number;
  phaseAt: number;
  done: boolean;
};

export function init(o: { players: string[]; deck: string; cards: VoteCard[]; rounds: number; avoid?: string[]; showVotes?: boolean; drinking?: boolean; seed: number; now: number }): VoteState {
  const avoid = new Set(o.avoid ?? []);
  // Unseen cards first; if there are too few, seen ones fill the rest.
  const [fresh, s1] = shuffle(o.cards.filter((c) => !avoid.has(c.id)), o.seed);
  const [seen] = shuffle(o.cards.filter((c) => avoid.has(c.id)), s1);
  const cards = [...fresh, ...seen].slice(0, Math.max(3, Math.min(15, o.rounds)));
  return {
    players: o.players, deck: o.deck, cards, round: 0, phase: "vote", votes: {}, guesses: {}, targets: {}, history: [],
    points: Object.fromEntries(o.players.map((p) => [p, 0])), showVotes: o.showVotes !== false, ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
    seed: o.seed, phaseAt: o.now, done: cards.length === 0,
  };
}

/** Who guesses whom. Up to 6 players it is everyone else; from 7 each player gets the next 3 round a shuffled circle. */
export function guessTargets(players: string[], seed: number): Record<string, string[]> {
  if (players.length <= EVERYONE_MAX) return Object.fromEntries(players.map((p) => [p, players.filter((q) => q !== p)]));
  const [order] = shuffle(players, seed);
  return Object.fromEntries(order.map((p, i) => [p, Array.from({ length: TARGETS_BIG }, (_, k) => order[(i + 1 + k) % order.length]!)]));
}

function toGuess(s: VoteState, now: number): VoteState {
  const voters = s.players.filter((p) => s.votes[p]);
  if (voters.length < 2) return reveal(s, now);
  return { ...s, phase: "guess", guesses: {}, targets: guessTargets(voters, s.seed + s.round), phaseAt: now };
}

/** Sips for the card just scored. With Show votes off nothing may name anybody, so it is one group toast. */
function drinkCalls(s: VoteState, card: VoteCard, h: VoteHistory): DrinkCall[] {
  if (!s.showVotes) return [{ to: "all", sips: 1, reason: "The room toasts that card" }];
  const calls: DrinkCall[] = h.nobodyGot.map((p) => ({ to: p, sips: 1, reason: "Nobody read you. Hand out 1", handsOut: true }));
  const read = Object.entries(s.guesses).map(([by, g]) => ({ by, made: Object.keys(g).length, right: Object.entries(g).filter(([t, v]) => h.votes[t] === v).length })).filter((x) => x.made > 0);
  const low = Math.min(...read.map((x) => x.right));
  const worst = read.filter((x) => x.right === low);
  if (worst.length === 1 && worst[0]!.right < worst[0]!.made) calls.push({ to: worst[0]!.by, sips: 1, reason: "Worst read of the card" });
  const voters = Object.keys(h.votes);
  if (card.answer && voters.length > 0 && voters.every((p) => h.votes[p] !== card.answer)) calls.push({ to: "all", sips: 1, reason: "The whole room got fooled" });
  return calls;
}

function reveal(s: VoteState, now: number): VoteState {
  const card = s.cards[s.round]!;
  const gained = Object.fromEntries(s.players.map((p) => [p, 0]));
  const nobodyGot: string[] = [];
  for (const target of Object.keys(s.votes)) {
    const reads = Object.entries(s.guesses).filter(([, g]) => g[target]);
    const right = reads.filter(([, g]) => g[target] === s.votes[target]);
    for (const [by] of right) gained[by] = (gained[by] ?? 0) + 1;
    if (reads.length > 0 && right.length === 0) {
      nobodyGot.push(target);
      gained[target] = (gained[target] ?? 0) + 1;
    }
  }
  if (card.answer) for (const [p, v] of Object.entries(s.votes)) if (v === card.answer) gained[p] = (gained[p] ?? 0) + 1;
  const points = Object.fromEntries(s.players.map((p) => [p, (s.points[p] ?? 0) + (gained[p] ?? 0)]));
  const h: VoteHistory = { votes: s.votes, guesses: s.guesses, gained, nobodyGot };
  const drinks = s.drinks ? addCalls(s.drinks, drinkCalls(s, card, h), s.players) : undefined;
  return { ...s, phase: "reveal", points, history: [...s.history, h], ...(drinks ? { drinks } : {}), phaseAt: now };
}

function advance(s: VoteState, now: number): VoteState {
  const round = s.round + 1;
  return round >= s.cards.length ? { ...s, done: true, phaseAt: now } : { ...s, round, phase: "vote", votes: {}, guesses: {}, targets: {}, phaseAt: now };
}

export function vote(s: VoteState, by: string, side: string, now: number): VoteState {
  if (s.done || s.phase !== "vote" || !s.players.includes(by) || (side !== "a" && side !== "b") || s.votes[by]) return s;
  const next = { ...s, votes: { ...s.votes, [by]: side as Side } };
  return Object.keys(next.votes).length >= s.players.length ? toGuess(next, now) : next;
}

/** `by` says how `target` voted. Only assigned targets count, once each; unanswered guesses simply score nothing. */
export function guessVote(s: VoteState, by: string, target: string, side: string, now: number): VoteState {
  if (s.done || s.phase !== "guess" || !s.targets[by]?.includes(target) || (side !== "a" && side !== "b") || s.guesses[by]?.[target]) return s;
  const next = { ...s, guesses: { ...s.guesses, [by]: { ...s.guesses[by], [target]: side as Side } } };
  const all = Object.entries(next.targets).every(([p, t]) => t.every((x) => next.guesses[p]?.[x]));
  return all ? reveal(next, now) : next;
}

/** Anyone can skip ahead from a reveal once they have read it. */
export function nextCard(s: VoteState, now: number): VoteState {
  return s.done || s.phase !== "reveal" ? s : advance(s, now);
}

export function tick(s: VoteState, now: number): VoteState {
  if (s.done) return s;
  if (s.phase === "vote" && now - s.phaseAt > VOTE_MS) return toGuess(s, now);
  if (s.phase === "guess" && now - s.phaseAt > GUESS_MS) return reveal(s, now);
  if (s.phase === "reveal" && now - s.phaseAt > REVEAL_MS) return advance(s, now);
  return s;
}

const only = <T>(m: Record<string, T>, me: string | null): Record<string, T> => (me != null && me in m ? { [me]: m[me]! } : {});

/**
 * What one seat may see. Others' votes are masked until the reveal and others' guesses stay hidden until then too.
 * With Show votes off they never open: history, votes and guesses hold only the seat's own entries, and points
 * hold only its own until the game is finished (comparing totals between cards would give votes away).
 */
export function redactFor(s: VoteState, me: string | null, finished = false): VoteState {
  if (s.showVotes) {
    if (finished || s.done || s.phase === "reveal") return s;
    return { ...s, votes: Object.fromEntries(Object.entries(s.votes).map(([k, v]) => [k, (k === me ? v : "?") as Side])), guesses: only(s.guesses, me) };
  }
  const hideCard = s.phase === "reveal" || s.done || finished;
  return {
    ...s,
    votes: hideCard ? only(s.votes, me) : Object.fromEntries(Object.entries(s.votes).map(([k, v]) => [k, (k === me ? v : "?") as Side])),
    guesses: only(s.guesses, me),
    history: s.history.map((h) => ({ votes: only(h.votes, me), guesses: only(h.guesses, me), gained: only(h.gained, me), nobodyGot: h.nobodyGot.filter((p) => p === me) })),
    points: finished ? s.points : only(s.points, me),
  };
}
