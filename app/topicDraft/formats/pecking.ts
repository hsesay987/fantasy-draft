// Pecking Order: a ranked list, one question at a time, everyone answering on their own phone at once.
// "Where does it rank?" names an item and asks for its rank; "Who's at #N?" asks for a name, and each name can be
// claimed by one player per question. Points fall off linearly to 0 at a quarter of the list away, and the closest
// answer earns a bonus.
import { normName } from "../pecking/normName";
import { spanOf, type PeckItem, type PeckList } from "../pecking/types";
import { addCalls, initDrinks, type DrinkCall, type DrinkState } from "../party/drinks";
import { has, own } from "../party/own";
import { next as rand, shuffle } from "../rng";

export const QUESTION_MS = 20_000, REVEAL_MS = 8_000, CLOSEST_BONUS = 20, DAILY_COUNT = 5;
/** Longest unknown name kept from what a player typed. */
const NAME_MAX = 60;

export type PeckMode = "rank" | "name" | "mixed";
type Span = [number, number];
export type PeckQuestion = {
  kind: "rank" | "name";
  list: string;
  title: string;
  stat: string;
  size: number;
  /** Rank kind: the item whose rank is asked. */
  item?: string;
  /** Name kind: the rank asked about (N). */
  at?: number;
  answer: { span: Span; names: string[]; value: number };
  /** Name kind: the whole list, to match picks against. Never sent to a seat. */
  pool?: { name: string; span: Span; aliases?: string[] }[];
};
/** `known`: the pick matched a list name (decided once, at pick time; `name` is then canonical). */
export type PeckAnswer = { guess: number | null; name?: string; known?: true; at: number };
export type PeckScore = { guess: number | null; name?: string; span?: Span; points: number; bonus: boolean };
export type PeckState = {
  players: string[];
  questions: PeckQuestion[];
  round: number;
  phase: "question" | "reveal";
  answers: Record<string, PeckAnswer>;
  /** Name kind: canonical names already claimed this question (never who claimed them). */
  taken: string[];
  points: Record<string, number>;
  history: { scores: Record<string, PeckScore> }[];
  phaseAt: number;
  /** Public and stable for one game: what a sip card is keyed on. */
  startedAt: number;
  done: boolean;
  drinks?: DrinkState;
};

type ViewQuestion = Omit<PeckQuestion, "answer" | "pool"> & { answer?: PeckQuestion["answer"]; choices?: string[] };
/** What a seat is sent: no pool ever, no answer while asked, later questions not at all. */
export type PeckView = Omit<PeckState, "questions"> & { questions: ViewQuestion[]; total: number };

/** 100 for exact, falling linearly to 0 at a quarter of the list away. */
export const pointsFor = (error: number, size: number): number => Math.round(100 * Math.max(0, 1 - error / (0.25 * size)));
/** How far a rank is from a (tie) span: 0 inside it, else to the nearest end. */
export const distance = (x: number, span: Span): number => (x < span[0] ? span[0] - x : x > span[1] ? x - span[1] : 0);

const key = (list: string, name: string) => `pk:${list}:${name}`;

const spanCache = new WeakMap<PeckList, Span[]>();
/** Each item's span, by index; computed once per list. */
function spans(list: PeckList): Span[] {
  let s = spanCache.get(list);
  if (!s) { s = list.items.map((it) => spanOf(list, it)); spanCache.set(list, s); }
  return s;
}

function rankQuestion(list: PeckList, i: number): PeckQuestion {
  const it = list.items[i]!;
  return {
    kind: "rank", list: list.id, title: list.title, stat: list.stat, size: list.items.length, item: it.name,
    answer: { span: spans(list)[i]!, names: [it.name], value: it.value },
  };
}

const holderCache = new WeakMap<PeckList, PeckItem[][]>();
/** The items whose span holds rank n (a tie group, or one item); indexed once per list. */
function holders(list: PeckList, n: number): PeckItem[] {
  let by = holderCache.get(list);
  if (!by) {
    by = Array.from({ length: list.items.length + 1 }, () => []);
    spans(list).forEach(([a, b], i) => { for (let r = a; r <= b && r < by!.length; r++) by![r]!.push(list.items[i]!); });
    holderCache.set(list, by);
  }
  return by[n] ?? [];
}

function nameQuestion(list: PeckList, n: number): PeckQuestion {
  const at = holders(list, n);
  const sp = spans(list);
  return {
    kind: "name", list: list.id, title: list.title, stat: list.stat, size: list.items.length, at: n,
    answer: { span: spanOf(list, at[0]!), names: at.map((i) => i.name), value: at[0]!.value },
    pool: list.items.map((it, i) => ({ name: it.name, span: sp[i]!, ...(it.aliases?.length ? { aliases: it.aliases } : {}) })),
  };
}

/**
 * `count` questions, lists taken in turn (in a fresh seeded order each cycle, so in mixed mode a list is not tied to
 * one kind), each drawn uniformly from its whole list. Mixed mode alternates kinds by question, starting with "rank". Items in `avoid` (seenKeys output) are skipped while anything else is left; nothing repeats
 * within one game. Deterministic for a seed.
 */
export function makeQuestions(lists: PeckList[], mode: PeckMode, count: number, seed: number, avoid: string[] = []): PeckQuestion[] {
  const out: PeckQuestion[] = [];
  if (lists.length === 0) return out;
  const avoided = new Set(avoid);
  const used = new Set<string>();
  let s = seed;
  let order: PeckList[] = [];
  const empty = new Set<PeckList>(); // lists with nothing left to ask (used only grows, so they stay empty)
  for (let t = 0; out.length < count && empty.size < lists.length; t++) {
    if (t % lists.length === 0) [order, s] = shuffle(lists, s);
    const list = order[t % lists.length]!;
    if (empty.has(list)) continue;
    const kind = mode === "mixed" ? (out.length % 2 === 0 ? "rank" : "name") : mode;
    // Candidates: indexes for rank kind, ranks 1..size for name kind; each with the keys it would ask.
    const cands: { v: number; keys: string[] }[] = kind === "rank"
      ? list.items.map((it, i) => ({ v: i, keys: [key(list.id, it.name)] }))
      : list.items.map((_, i) => ({ v: i + 1, keys: holders(list, i + 1).map((it) => key(list.id, it.name)) }));
    const fresh = cands.filter((c) => !c.keys.every((k) => used.has(k)));
    const unseen = fresh.filter((c) => !c.keys.every((k) => avoided.has(k)));
    const pick = unseen.length ? unseen : fresh;
    if (pick.length === 0) { empty.add(list); continue; }
    const [r, ns] = rand(s);
    s = ns;
    const c = pick[Math.floor(r * pick.length)]!;
    for (const k of c.keys) used.add(k);
    out.push(kind === "rank" ? rankQuestion(list, c.v) : nameQuestion(list, c.v));
  }
  return out;
}

/** `questions`, when given, are used as they are (a daily deals the same ones to everyone); `lists`, `mode`, `count`, `avoid` and `seed` then only matter if it is left out. */
export function init(o: { players: string[]; lists: PeckList[]; mode: PeckMode; count: number; avoid?: string[]; drinking?: boolean; seed: number; now: number; questions?: PeckQuestion[] }): PeckState {
  const questions = o.questions ?? makeQuestions(o.lists, o.mode, o.count, o.seed, o.avoid);
  return {
    players: o.players, questions, round: 0, phase: "question", answers: {}, taken: [],
    points: Object.fromEntries(o.players.map((p) => [p, 0])), history: [], phaseAt: o.now, startedAt: o.now, done: questions.length === 0,
    ...(o.drinking ? { drinks: initDrinks(o.players) } : {}),
  };
}

/** Whether `by` may answer the asked question now. At exactly QUESTION_MS still counts. */
const open = (s: PeckState, by: string, kind: PeckQuestion["kind"], now: number) =>
  !s.done && s.phase === "question" && s.players.includes(by) && !has(s.answers, by) && now - s.phaseAt <= QUESTION_MS && s.questions[s.round]?.kind === kind;

function record(s: PeckState, by: string, a: PeckAnswer, taken: string[], now: number): PeckState {
  const answers = { ...s.answers, [by]: a };
  const filled = { ...s, answers, taken };
  return s.players.every((p) => has(answers, p)) ? reveal(filled, now) : filled;
}

/** "Where does it rank?": an integer 1..size, one per player. */
export function guessRank(s: PeckState, by: string, rank: unknown, now: number): PeckState {
  if (!open(s, by, "rank", now)) return s;
  const q = s.questions[s.round]!;
  if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 1 || rank > q.size) return s;
  return record(s, by, { guess: rank, at: now }, s.taken, now);
}

/** The pool entry a typed name means: by its name, else by an alias (names win over another item's alias). */
function lookup(q: PeckQuestion, text: string) {
  const k = normName(text);
  if (!k || !q.pool) return null;
  return q.pool.find((p) => normName(p.name) === k) ?? q.pool.find((p) => (p.aliases ?? []).some((a) => normName(a) === k)) ?? null;
}

/**
 * "Who's at #N?": a known name is claimed for this question, and a later pick of it is refused (that player may pick
 * again). A name not on the list is accepted, scores 0, and claims nothing.
 */
export function pickName(s: PeckState, by: string, text: unknown, now: number): PeckState {
  if (!open(s, by, "name", now) || typeof text !== "string" || !text.trim()) return s;
  const hit = lookup(s.questions[s.round]!, text);
  if (!hit) return record(s, by, { guess: null, name: text.trim().slice(0, NAME_MAX), at: now }, s.taken, now);
  if (s.taken.includes(hit.name)) return s;
  return record(s, by, { guess: null, name: hit.name, known: true, at: now }, [...s.taken, hit.name], now);
}

function reveal(s: PeckState, now: number): PeckState {
  const q = s.questions[s.round]!;
  const scored: Record<string, PeckScore & { error: number }> = Object.create(null);
  for (const p of s.players) {
    const a = own(s.answers, p);
    if (!a) continue;
    if (q.kind === "rank") {
      const error = a.guess == null ? Infinity : distance(a.guess, q.answer.span);
      scored[p] = { guess: a.guess, points: Number.isFinite(error) ? pointsFor(error, q.size) : 0, bonus: false, error };
    } else {
      // Score exactly what was decided at pick time: no second lookup of the stored text.
      const hit = a.known ? (q.pool ?? []).find((p) => p.name === a.name) ?? null : null;
      const error = hit ? distance(q.at!, hit.span) : Infinity;
      scored[p] = { guess: null, ...(a.name != null ? { name: a.name } : {}), ...(hit ? { span: hit.span } : {}), points: hit ? pointsFor(error, q.size) : 0, bonus: false, error };
    }
  }
  const answered = Object.keys(scored);
  const scoring = answered.filter((p) => scored[p]!.points > 0);
  if (answered.length >= 2 && scoring.length) {
    const best = Math.min(...scoring.map((p) => scored[p]!.error));
    for (const p of scoring) if (scored[p]!.error === best) scored[p]!.bonus = true;
  }
  const points = { ...s.points };
  const scores: Record<string, PeckScore> = {};
  const calls: DrinkCall[] = [];
  for (const p of s.players) {
    const sc = has(scored, p) ? scored[p]! : null;
    if (sc) {
      const shown: PeckScore & { error?: number } = { ...sc };
      delete shown.error; // the distance is for picking the closest, not for showing
      scores[p] = shown;
      points[p] = (own(points, p) ?? 0) + sc.points + (sc.bonus ? CLOSEST_BONUS : 0);
      if (sc.points === 0) calls.push({ to: p, sips: 1, reason: "Way off" });
    } else {
      scores[p] = { guess: null, points: 0, bonus: false };
      calls.push({ to: p, sips: 1, reason: "No answer" });
    }
  }
  const drinks = s.drinks ? addCalls(s.drinks, calls, s.players) : undefined;
  return { ...s, phase: "reveal", points, history: [...s.history, { scores }], ...(drinks ? { drinks } : {}), phaseAt: now };
}

function advance(s: PeckState, now: number): PeckState {
  const round = s.round + 1;
  if (round >= s.questions.length) return { ...s, done: true, phaseAt: now };
  return { ...s, round, phase: "question", answers: {}, taken: [], phaseAt: now };
}

/** Closes the question early once every player still at the table (not in `gone`) has answered. */
export function settle(s: PeckState, gone: string[], now: number): PeckState {
  if (s.done || s.phase !== "question") return s;
  const here = s.players.filter((p) => !gone.includes(p));
  return here.length > 0 && here.every((p) => has(s.answers, p)) ? reveal(s, now) : s;
}

/** Ends a reveal early. In a room only the host can (the server checks). */
export function next(s: PeckState, now: number): PeckState {
  return s.done || s.phase !== "reveal" ? s : advance(s, now);
}

/** Clocks: an unfinished question closes when time is up; a reveal moves on. */
export function tick(s: PeckState, now: number): PeckState {
  if (s.done) return s;
  if (s.phase === "question" && now - s.phaseAt > QUESTION_MS) return reveal(s, now);
  if (s.phase === "reveal" && now - s.phaseAt >= REVEAL_MS) return advance(s, now);
  return s;
}

/**
 * What one seat may see. The pool is never sent. While a question is asked it has no answer (a name question gets the
 * list's names, alphabetical, as `choices`), later questions are not sent, and other seats' answers are blanked.
 */
export function redactFor(s: PeckState, me: string | null): PeckView {
  const total = s.questions.length;
  const asking = !s.done && s.phase === "question";
  const questions: ViewQuestion[] = s.questions.slice(0, s.done ? total : s.round + 1).map((q, i) => {
    const { answer, pool, ...rest } = q;
    if (asking && i === s.round) {
      return q.kind === "name" ? { ...rest, choices: (pool ?? []).map((p) => p.name).sort((a, b) => a.localeCompare(b)) } : rest;
    }
    return { ...rest, answer };
  });
  const answers = asking ? Object.fromEntries(Object.entries(s.answers).map(([p, a]) => [p, p === me ? a : { guess: null, at: 0 }])) : s.answers;
  return { ...s, questions, answers, total };
}

/** `pk:<list>:<name>` for each item asked so far: what a later game's `avoid` takes. */
export function seenKeys(s: PeckState): string[] {
  return s.questions.slice(0, s.done ? s.questions.length : s.round + 1).flatMap((q) => q.answer.names.map((n) => key(q.list, n)));
}
