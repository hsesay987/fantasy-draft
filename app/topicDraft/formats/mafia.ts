// Mafia: the app narrates, the room talks. Roles are dealt in secret. Each night every living phone taps something (so
// nobody can spot who is acting), then the table hears who died, talks, and votes someone out or skips. The village
// wins when the mafia are gone; the mafia win when they equal or outnumber the rest.
import { shuffle } from "../rng";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";

export const NIGHT_MS = 45_000, TALK_MS = 120_000, VOTE_MS = 45_000, MORNING_MS = 8_000;
/** Nights and votes in a row that nobody touches (three full days) before a silent table is ended. */
export const IDLE_LIMIT = 6;
/** The smallest table the deal works for. */
export const MIN_PLAYERS = 5;
/** At this size nobody dies on the first night. Otherwise most games hang on one vote: see the Task 13 simulation. */
export const QUIET_FIRST_NIGHT_AT = 5;
/** What a villager taps at night. */
export const NIGHT_OK = "ok";
/** The vote for nobody. */
export const SKIP_VOTE = "skip";

export type Role = "mafia" | "doctor" | "detective" | "villager";
export type Actions = { kill: string | null; save: string | null; check: string | null; done: string[] };
export type Eliminated = { name: string; role: Role; by: "night" | "vote" };
export type MafiaState = {
  players: string[];
  /** Stored as dealt: there is no seed in here to rebuild them from. */
  roles: Record<string, Role>;
  alive: string[];
  phase: "night" | "morning" | "talk" | "vote";
  night: number;
  actions: Actions;
  /** Who the doctor protected last night, or null if nobody. */
  lastSave: string | null;
  /** Detective's seat to everything they have learned. */
  checks: Record<string, { target: string; mafia: boolean }[]>;
  morning: { died: string | null } | null;
  /** This day's votes; the last day's stay until the next vote opens, so the table can see how it went. */
  votes: Record<string, string>;
  eliminated: Eliminated[];
  winner: "village" | "mafia" | null;
  points: Record<string, number>;
  /** Nights and votes closed in a row with nobody acting. */
  idle: number;
  phaseAt: number;
  /** When this game began: public, and tells a rematch from the last game now the seed is gone. */
  startedAt: number;
  done: boolean;
  drinks?: DrinkState;
};

/** What one seat is sent. Counts replace who-has-acted, and a night kill's role can be blank. */
export type MafiaView = Omit<MafiaState, "eliminated"> & {
  eliminated: { name: string; role: Role | null; by: "night" | "vote" }[];
  actedCount: number;
  voteCount: number;
};

const NO_ACTIONS: Actions = { kill: null, save: null, check: null, done: [] };

export const rolesFor = (n: number) => {
  const mafia = n >= 9 ? 2 : 1;
  const detective = n >= 7 ? 1 : 0;
  return { mafia, doctor: 1, detective, villager: Math.max(0, n - mafia - 1 - detective) };
};

export function init(o: { players: string[]; drinking?: boolean; seed: number; now: number }): MafiaState {
  const [order] = shuffle(o.players, o.seed);
  const c = rolesFor(o.players.length);
  const deck: Role[] = [...Array<Role>(c.mafia).fill("mafia"), ...Array<Role>(c.doctor).fill("doctor"), ...Array<Role>(c.detective).fill("detective")];
  const dealt = new Map(order.map((p, i): [string, Role] => [p, deck[i] ?? "villager"]));
  return {
    players: o.players,
    roles: Object.fromEntries(o.players.map((p) => [p, dealt.get(p)!])), // seat order, so the keys say nothing about the deal
    alive: o.players, phase: "night", night: 1, actions: NO_ACTIONS, lastSave: null, checks: {}, morning: null, votes: {}, eliminated: [], winner: null,
    points: Object.fromEntries(o.players.map((p) => [p, 0])), idle: 0, phaseAt: o.now, startedAt: o.now, done: false,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

/** Own keys only: a seat can be named anything, including "constructor". */
const checksOf = (s: MafiaState, p: string) => (Object.keys(s.checks).includes(p) ? s.checks[p]! : []);

const sideWon = (s: MafiaState, alive: string[]): MafiaState["winner"] => {
  const mafia = alive.filter((p) => s.roles[p] === "mafia").length;
  if (mafia === 0) return "village";
  return mafia >= alive.length - mafia ? "mafia" : null;
};
const onSide = (s: MafiaState, p: string, side: "village" | "mafia") => (s.roles[p] === "mafia") === (side === "mafia");

/** Sip cards for this close, always dealt so old cards clear and a saved night looks like a quiet one. */
function withDrinks(s: MafiaState, calls: DrinkCall[], ending: boolean): Pick<MafiaState, "drinks"> | object {
  if (!s.drinks) return {};
  const all = ending ? [...calls, { to: "all", sips: 1, reason: "Game over. Everyone toasts" }] : calls;
  return { drinks: addCalls(s.drinks, all, s.players) };
}

function end(s: MafiaState, winner: MafiaState["winner"], calls: DrinkCall[], now: number): MafiaState {
  const points = winner ? Object.fromEntries(s.players.map((p) => [p, (s.points[p] ?? 0) + (onSide(s, p, winner) ? 1 : 0)])) : s.points;
  return { ...s, ...withDrinks(s, calls, true), winner, points, done: true, phaseAt: now };
}

/** Everyone still taps, so the night looks like any other, but no tap counts: not even the doctor's, which would rule that name out tomorrow. */
export const quietNight = (s: Pick<MafiaState, "players" | "night">) => s.night === 1 && s.players.length === QUIET_FIRST_NIGHT_AT;

function closeNight(s: MafiaState, now: number): MafiaState {
  const { kill, done } = s.actions;
  const save = quietNight(s) ? null : s.actions.save;
  const died = kill && !quietNight(s) && kill !== save ? kill : null;
  const alive = died ? s.alive.filter((p) => p !== died) : s.alive;
  const closed: MafiaState = {
    ...s, alive, phase: "morning", morning: { died }, actions: NO_ACTIONS, lastSave: save, phaseAt: now,
    eliminated: died ? [...s.eliminated, { name: died, role: s.roles[died]!, by: "night" }] : s.eliminated,
    idle: done.length ? 0 : s.idle + 1,
  };
  const calls: DrinkCall[] = died ? [{ to: died, sips: 1, reason: "Gone in the night" }] : [];
  const winner = sideWon(closed, alive);
  if (winner) return end(closed, winner, calls, now);
  if (closed.idle >= IDLE_LIMIT) return end(closed, null, calls, now);
  return { ...closed, ...withDrinks(closed, calls, false) };
}

/** Whoever has more than half of the votes cast (skips count as cast), or nobody. */
export function voted(votes: Record<string, string>): string | null {
  const cast = Object.values(votes);
  const tally = new Map<string, number>();
  for (const t of cast) tally.set(t, (tally.get(t) ?? 0) + 1);
  for (const [t, n] of tally) if (t !== SKIP_VOTE && n * 2 > cast.length) return t;
  return null;
}

function closeVote(s: MafiaState, now: number): MafiaState {
  const out = voted(s.votes);
  const alive = out ? s.alive.filter((p) => p !== out) : s.alive;
  const closed: MafiaState = {
    ...s, alive, phaseAt: now,
    eliminated: out ? [...s.eliminated, { name: out, role: s.roles[out]!, by: "vote" }] : s.eliminated,
    idle: Object.keys(s.votes).length ? 0 : s.idle + 1,
  };
  const innocent = !!out && s.roles[out] !== "mafia";
  const calls: DrinkCall[] = innocent ? Object.keys(s.votes).filter((p) => s.votes[p] === out).map((p) => ({ to: p, sips: 1, reason: "Voted out an innocent" })) : [];
  const winner = sideWon(closed, alive);
  if (winner) return end(closed, winner, calls, now);
  if (closed.idle >= IDLE_LIMIT) return end(closed, null, calls, now);
  return { ...closed, ...withDrinks(closed, calls, false), phase: "night", night: s.night + 1, morning: null, actions: NO_ACTIONS };
}

const openVote = (s: MafiaState, now: number): MafiaState => ({ ...s, phase: "vote", votes: {}, phaseAt: now });

/** One action a night for each living player. Mafia name a target, the doctor protects, the detective checks, villagers tap. */
export function nightAct(s: MafiaState, by: string, target: string, now: number): MafiaState {
  if (s.done || s.phase !== "night" || now - s.phaseAt > NIGHT_MS) return s;
  if (typeof target !== "string" || !s.alive.includes(by) || s.actions.done.includes(by)) return s;
  const role = s.roles[by];
  const living = s.alive.includes(target);
  const done = [...s.actions.done, by];
  let next: MafiaState;
  if (role === "villager") {
    if (target !== NIGHT_OK) return s;
    next = { ...s, actions: { ...s.actions, done } };
  } else if (role === "mafia") {
    if (!living || s.roles[target] === "mafia") return s;
    next = { ...s, actions: { ...s.actions, kill: target, done } }; // the most recent choice wins
  } else if (role === "doctor") {
    if (!living || target === s.lastSave) return s;
    next = { ...s, actions: { ...s.actions, save: target, done } };
  } else if (role === "detective") {
    if (!living || target === by) return s;
    const found = { target, mafia: s.roles[target] === "mafia" };
    next = { ...s, actions: { ...s.actions, check: target, done }, checks: { ...s.checks, [by]: [...checksOf(s, by), found] } };
  } else return s;
  return s.alive.every((p) => done.includes(p)) ? closeNight(next, now) : next;
}

/** One vote each for the living: a living player, or "skip". */
export function dayVote(s: MafiaState, by: string, target: string, now: number): MafiaState {
  if (s.done || s.phase !== "vote" || now - s.phaseAt > VOTE_MS) return s;
  if (!s.alive.includes(by) || Object.keys(s.votes).includes(by)) return s;
  if (target !== SKIP_VOTE && !s.alive.includes(target)) return s;
  const votes = { ...s.votes, [by]: target };
  const next = { ...s, votes };
  return s.alive.every((p) => Object.keys(votes).includes(p)) ? closeVote(next, now) : next;
}

/** Ends the talking early. Who may do this (the host) is the room's call; the engine doesn't know seats. */
export function skipTalk(s: MafiaState, by: string, now: number): MafiaState {
  if (s.done || s.phase !== "talk" || !s.players.includes(by)) return s;
  return openVote(s, now);
}

/** Clocks: a missing action is skipped, so no phase waits on anyone. */
export function tick(s: MafiaState, now: number): MafiaState {
  if (s.done) return s;
  const elapsed = now - s.phaseAt;
  if (s.phase === "night" && elapsed > NIGHT_MS) return closeNight(s, now);
  if (s.phase === "morning" && elapsed >= MORNING_MS) return { ...s, phase: "talk", phaseAt: now };
  if (s.phase === "talk" && elapsed >= TALK_MS) return openVote(s, now);
  if (s.phase === "vote" && elapsed > VOTE_MS) return closeVote(s, now);
  return s;
}

/**
 * For players who left (`gone`): a night or vote closes once everyone living and still here has acted. A player who
 * left stays alive for the win count, so the table must still vote them out. With nobody living left at the table
 * there is nobody to play, so the game ends with no winner.
 */
export function settle(s: MafiaState, gone: string[], now: number): MafiaState {
  if (s.done) return s;
  const here = s.alive.filter((p) => !gone.includes(p));
  if (here.length === 0) return end(s, null, [], now);
  if (s.phase === "night" && here.every((p) => s.actions.done.includes(p))) return closeNight(s, now);
  if (s.phase === "vote" && here.every((p) => Object.keys(s.votes).includes(p))) return closeVote(s, now);
  return s;
}

/**
 * What one seat may see before the game is done:
 * - Roles: your own, and fellow mafia. The dead are spectators and see them all.
 * - Tonight: only your own role's choice (mafia share theirs) and a count of how many have acted, never who. The dead
 *   get roles only, not tonight's choices, others' checks or votes in progress: they can still talk in the room.
 * - Votes: your own and a count until the vote closes, then all of them.
 * - Eliminated: a vote-out's role is public; a night kill's role is not, except to the dead.
 */
export function redactFor(s: MafiaState, me: string | null): MafiaView {
  const counts = { actedCount: s.actions.done.length, voteCount: Object.keys(s.votes).length };
  if (s.done) return { ...s, ...counts };
  const seated = me != null && s.players.includes(me);
  const dead = seated && !s.alive.includes(me);
  const role = seated ? s.roles[me] : undefined;
  const living = seated && !dead;
  const sees = (r: Role) => living && role === r;
  const mine = (p: string) => p === me;
  const roles = dead ? s.roles : Object.fromEntries(s.players.filter((p) => mine(p) || (role === "mafia" && s.roles[p] === "mafia")).map((p) => [p, s.roles[p]!]));
  const a = s.actions;
  return {
    ...s,
    ...counts,
    roles,
    actions: {
      kill: sees("mafia") ? a.kill : null,
      save: sees("doctor") ? a.save : null,
      check: sees("detective") ? a.check : null,
      done: !living ? [] : a.done.filter((p) => mine(p) || (role === "mafia" && s.roles[p] === "mafia")),
    },
    lastSave: role === "doctor" ? s.lastSave : null,
    checks: seated && Object.keys(s.checks).includes(me) ? { [me]: checksOf(s, me) } : {},
    votes: s.phase === "vote" ? (seated && Object.keys(s.votes).includes(me) ? { [me]: s.votes[me]! } : {}) : s.votes,
    eliminated: s.eliminated.map((e) => (dead || e.by === "vote" ? e : { ...e, role: null })),
  };
}
