// NPAT v2 "Dig": one letter, five categories asked one at a time. Each answer is checked against the lists when its
// category closes; answers not on the lists go to a short judge phase (the server or browser feeds `judged`), then the
// category's gems and points are shown. Pure: the server runs it for rooms and the browser for solo.
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { has, own } from "../party/own";
import { buildTeams, TEAM_MIN_PLAYERS } from "../party/teams";
import { shuffle } from "../rng";
import {
  aiTier, ANSWER_MAX, DIG_ANSWER_MS, DIG_CATEGORIES, DIG_MAX_CATEGORIES, digCountOk, JUDGE_MS, normAnswer, REEL_MS, sharedPoints, startsWith, TIER_POINTS,
  VERDICT_MS, WRITE_GRACE_MS, type Tier,
} from "../npat/rules";
import { lettersAvailable, lookup, tierOf } from "../npat/source";

/**
 * One player's answer to one category. `entry` is the matched list entry's name. `ai-ok` / `ai-no` are the judge's
 * verdict on an answer that was not on the lists; `ai-ok` is flagged `review` (also when it was accepted unchecked).
 */
export type DigAnswer = {
  text: string;
  entry: string | null;
  status: "ok" | "wrong-letter" | "unknown" | "blank" | "ai-ok" | "ai-no";
  points: number;
  tier: Tier | null;
  shared: boolean;
  review?: true;
  reason?: string;
};

export type DigState = {
  players: string[];
  teams: string[][] | null;
  categories: string[];
  letter: string;
  phase: "reel" | "ask" | "judge" | "verdict" | "summary";
  cat: number;
  /** What each player has typed for the open category; cleared when it closes. */
  typed: Record<string, string>;
  locked: string[];
  /** Per player, one answer per closed category, in category order. */
  results: Record<string, DigAnswer[]>;
  points: Record<string, number>;
  teamPoints: number[];
  /** Players who left (from `settle`): not waited for, and blank from the next close on. */
  gone: string[];
  phaseAt: number;
  startedAt: number;
  done: boolean;
  seed: number;
  /** Solo: the browser feeds `judged` from the API; the engine never accepts an unknown on its own before the timeout. */
  strict?: boolean;
  drinks?: DrinkState;
};

/** What a seat is sent: see `redactFor`. `typedCount` is how many players have typed something for the open category. */
export type DigView = DigState & { typedCount: number };

export type DigVerdict = { player: string; ok: boolean; niche: number; reason?: string };

const BLANK: DigAnswer = { text: "", entry: null, status: "blank", points: 0, tier: null, shared: false };

export function init(o: {
  players: string[]; categories: string[]; teams: number; teamMap: Record<string, number>; avoid?: string[];
  letter?: string; strict?: boolean; drinking?: boolean; seed: number; now: number;
}): DigState {
  if (!digCountOk(o.categories.length)) throw new Error(`NPAT dig: needs ${DIG_CATEGORIES} to ${DIG_MAX_CATEGORIES} categories`);
  let seed = o.seed;
  let letter: string;
  if (typeof o.letter === "string" && /^[a-z]$/i.test(o.letter)) letter = o.letter.toUpperCase();
  else {
    const all = lettersAvailable(o.categories, false);
    if (all.length === 0) throw new Error("NPAT: no letter has enough answers in every chosen category");
    const avoided = new Set((o.avoid ?? []).map((k) => k.replace(/^np:/, "").toUpperCase()));
    const [fresh, s1] = shuffle(all.filter((l) => !avoided.has(l)), seed);
    const [seen, s2] = shuffle(all.filter((l) => avoided.has(l)), s1);
    letter = [...fresh, ...seen][0]!;
    seed = s2;
  }
  const built = o.teams >= 2 && o.players.length >= TEAM_MIN_PLAYERS ? buildTeams(o.players, o.teams, o.teamMap ?? {}).filter((t) => t.length > 0) : [];
  const teams = built.length >= 2 ? built : null;
  return {
    players: o.players, teams, categories: o.categories, letter, phase: "reel", cat: 0, typed: {}, locked: [],
    results: Object.fromEntries(o.players.map((p) => [p, []])), points: Object.fromEntries(o.players.map((p) => [p, 0])),
    teamPoints: teams ? teams.map(() => 0) : [], gone: [], phaseAt: o.now, startedAt: o.now, done: false, seed,
    ...(o.strict ? { strict: true } : {}), ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

const here = (s: DigState) => s.players.filter((p) => !s.gone.includes(p));
/** Asking is open until the deadline plus the grace, so an answer sent as the clock runs out still arrives in time. */
const asking = (s: DigState, now: number) => !s.done && s.phase === "ask" && now - s.phaseAt < DIG_ANSWER_MS + WRITE_GRACE_MS;

/** Saves (or replaces) the open category's answer. Refused outside the ask, after locking, or if too long or not text. */
export function answer(s: DigState, by: string, text: unknown, now: number): DigState {
  if (!asking(s, now) || !s.players.includes(by) || s.locked.includes(by)) return s;
  if (typeof text !== "string" || text.length > ANSWER_MAX) return s;
  return { ...s, typed: { ...s.typed, [by]: text } };
}

/** A player submits early. The category closes once everyone still here has. */
export function lock(s: DigState, by: string, now: number): DigState {
  if (!asking(s, now) || !s.players.includes(by) || s.locked.includes(by)) return s;
  const t = { ...s, locked: [...s.locked, by] };
  return allLocked(t) ? closeAsk(t, now) : t;
}

const allLocked = (s: DigState) => here(s).length > 0 && here(s).every((p) => s.locked.includes(p));

function classify(category: string, letter: string, raw: string): DigAnswer {
  const text = raw.trim();
  if (!normAnswer(text)) return BLANK;
  // Only what was typed counts for the letter: an entry's name or aliases never rescue an answer starting with another.
  if (!startsWith(letter, text)) return { ...BLANK, text, status: "wrong-letter" };
  const e = lookup(category, text);
  return e ? { ...BLANK, text, entry: e.name, status: "ok", tier: tierOf(category, e) } : { ...BLANK, text, status: "unknown" };
}

/** The ask is over: every answer is checked against the lists, then the judge (if any are unknown) or the verdict. */
function closeAsk(s: DigState, now: number): DigState {
  const category = s.categories[s.cat]!;
  const results = Object.fromEntries(s.players.map((p) => {
    const raw = s.gone.includes(p) ? "" : (own(s.typed, p) ?? "");
    return [p, [...(own(s.results, p) ?? []), classify(category, s.letter, raw)]];
  }));
  const t: DigState = { ...s, results, typed: {}, locked: [] };
  return pendingUnknowns({ ...t, phase: "judge" }).length ? { ...t, phase: "judge", phaseAt: now } : verdict(t, now);
}

const answerAt = (s: DigState, p: string, cat = s.cat): DigAnswer => own(s.results, p)?.[cat] ?? BLANK;

/** The open category's answers still waiting for the judge. */
export function pendingUnknowns(s: DigState): { player: string; category: string; letter: string; text: string }[] {
  if (s.done || s.phase !== "judge") return [];
  return s.players.filter((p) => answerAt(s, p).status === "unknown")
    .map((p) => ({ player: p, category: s.categories[s.cat]!, letter: s.letter, text: answerAt(s, p).text }));
}

function setAnswer(s: DigState, p: string, f: (a: DigAnswer) => DigAnswer): DigState {
  return { ...s, results: { ...s.results, [p]: s.results[p]!.map((a, i) => (i === s.cat ? f(a) : a)) } };
}

/** Applies the judge's verdicts to the answers still pending, and moves on to the verdict once none are. */
export function judged(s: DigState, verdicts: DigVerdict[], now: number): DigState {
  if (s.done || s.phase !== "judge" || !Array.isArray(verdicts)) return s;
  let t = s;
  for (const v of verdicts) {
    if (!v || typeof v.player !== "string" || typeof v.ok !== "boolean" || !t.players.includes(v.player)) continue;
    if (answerAt(t, v.player).status !== "unknown") continue;
    const reason = typeof v.reason === "string" ? v.reason.slice(0, 200) : undefined;
    t = setAnswer(t, v.player, (a) => v.ok
      ? { ...a, status: "ai-ok", tier: aiTier(v.niche), review: true as const, ...(reason ? { reason } : {}) }
      : { ...a, status: "ai-no", tier: null, ...(reason ? { reason } : {}) });
  }
  return pendingUnknowns(t).length ? t : verdict(t, now);
}

/** Judge timed out or was skipped: a pending answer that starts with the letter is accepted as common, flagged for review. */
function fallback(s: DigState, now: number): DigState {
  let t = s;
  for (const u of pendingUnknowns(s)) {
    t = setAnswer(t, u.player, (a) => startsWith(s.letter, a.text)
      ? { ...a, status: "ai-ok", tier: "common", review: true as const, reason: "unchecked" }
      : { ...a, status: "ai-no" });
  }
  return verdict(t, now);
}

const scores = (a: DigAnswer) => a.status === "ok" || a.status === "ai-ok";
const groupKey = (a: DigAnswer) => (a.status === "ok" ? `e:${normAnswer(a.entry)}` : `u:${normAnswer(a.text)}`);

/**
 * Points for one category's answers, as in NPAT v1: answers group by matched entry (an alias joins its name) or, for an
 * accepted AI answer, by normalised text; a group given by two or more players (with teams: teams) is halved, rounded up.
 */
function scoreCategory(answers: Record<string, DigAnswer>, teams: string[][] | null): Record<string, { points: number; shared: boolean }> {
  const unit = (p: string) => (teams ? String(teams.findIndex((t) => t.includes(p))) : `p:${p}`);
  const units = new Map<string, Set<string>>();
  for (const [p, a] of Object.entries(answers)) if (scores(a)) units.set(groupKey(a), (units.get(groupKey(a)) ?? new Set()).add(unit(p)));
  return Object.fromEntries(Object.entries(answers).map(([p, a]) => {
    if (!scores(a) || !a.tier) return [p, { points: 0, shared: false }];
    const n = units.get(groupKey(a))!.size;
    return [p, { points: sharedPoints(TIER_POINTS[a.tier], n), shared: n >= 2 }];
  }));
}

/** Scores the open category, adds its points, pours any sips and shows the verdict. */
function verdict(s: DigState, now: number): DigState {
  const mine = Object.fromEntries(s.players.map((p) => [p, answerAt(s, p)]));
  const scored = scoreCategory(mine, s.teams);
  let t = s;
  for (const p of s.players) t = setAnswer(t, p, (a) => ({ ...a, points: scored[p]!.points, shared: scored[p]!.shared }));
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
    const st = mine[p]!.status;
    if (st === "wrong-letter") calls.push({ to: p, sips: 1, reason: "Wrong letter" });
    else if (st === "ai-no") calls.push({ to: p, sips: 1, reason: "Rejected" });
  }
  const drinks = s.drinks && calls.length ? addCalls(s.drinks, calls, s.players) : s.drinks;
  return { ...t, phase: "verdict", points, teamPoints, ...(drinks ? { drinks } : {}), phaseAt: now };
}

/** After a verdict: the next category's ask, or the summary. After the summary: done. */
function advance(s: DigState, now: number): DigState {
  if (s.phase === "summary") return { ...s, done: true, phaseAt: now };
  if (s.cat + 1 >= s.categories.length) return { ...s, phase: "summary", phaseAt: now };
  return { ...s, phase: "ask", cat: s.cat + 1, typed: {}, locked: [], phaseAt: now };
}

/** Host skip: moves the current phase on (the judge applies its fallback). */
export function next(s: DigState, now: number): DigState {
  if (s.done) return s;
  if (s.phase === "reel") return { ...s, phase: "ask", phaseAt: now };
  if (s.phase === "ask") return closeAsk(s, now);
  if (s.phase === "judge") return fallback(s, now);
  return advance(s, now);
}

/** Clocks, one step per call. Deadlines are inclusive. */
export function tick(s: DigState, now: number): DigState {
  if (s.done) return s;
  const t = now - s.phaseAt;
  switch (s.phase) {
    case "reel": return t >= REEL_MS ? next(s, now) : s;
    case "ask": return t >= DIG_ANSWER_MS + WRITE_GRACE_MS ? closeAsk(s, now) : s;
    case "judge": return t >= JUDGE_MS ? fallback(s, now) : s;
    default: return t >= VERDICT_MS ? advance(s, now) : s;
  }
}

/** Records who has left, then closes whatever was only waiting on them. The same state back when nothing changed. */
export function settle(s: DigState, gone: string[], now: number): DigState {
  if (s.done) return s;
  const g = s.players.filter((p) => gone.includes(p));
  const t = g.length === s.gone.length && g.every((p) => s.gone.includes(p)) ? s : { ...s, gone: g };
  return t.phase === "ask" && allLocked(t) ? closeAsk(t, now) : t;
}

/** Top points; ties share. With teams, every member of the top team (or teams). */
export function winners(s: DigState): string[] {
  if (s.teams) {
    const top = Math.max(...s.teamPoints);
    return s.teams.filter((_, i) => s.teamPoints[i] === top).flat();
  }
  const pts = (p: string) => own(s.points, p) ?? 0;
  const top = Math.max(0, ...s.players.map(pts));
  return s.players.filter((p) => pts(p) === top);
}

/** `np:<letter>`: what a later game's `avoid` takes. */
export function seenKeys(s: DigState): string[] {
  return [`np:${s.letter}`];
}

/** AI-accepted answers (including unchecked ones), for the server to save as `review:<category>` rows. */
export function reviewItems(s: DigState): { player: string; category: string; answer: string }[] {
  return s.players.flatMap((p) => (own(s.results, p) ?? []).flatMap((a, i) =>
    a.review ? [{ player: p, category: s.categories[i]!, answer: a.text }] : []));
}

/**
 * What one seat may see. Never the seed. While asking, only `me`'s own typing (nothing for a screen) plus how many
 * players have typed. Results only for categories already shown: those before the open one, and the open one once it
 * has reached its verdict (all of them at the summary).
 */
export function redactFor(s: DigState, me: string | null): DigView {
  const shown = s.done || s.phase === "summary" ? s.categories.length : s.phase === "verdict" ? s.cat + 1 : s.cat;
  const asking = !s.done && s.phase === "ask";
  const typed = asking ? (me !== null && has(s.typed, me) ? { [me]: s.typed[me]! } : {}) : {};
  const typedCount = asking ? Object.values(s.typed).filter((t) => normAnswer(t)).length : 0;
  const results = Object.fromEntries(Object.entries(s.results).map(([p, list]) => [p, list.slice(0, shown)]));
  return { ...s, seed: 0, typed, results, typedCount };
}
