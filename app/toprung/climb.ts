// What the Top Rung screens need to know about a climb, kept apart from the rules in engine.ts: where it is saved, how
// it ended, what each lifeline button should show, and what a finished daily climb reports.
import type { TriviaCategory } from "../topicDraft/trivia/types";
import { init, LADDER, LEDGES, loadClimb, RUNGS, tierOf, type Lifeline, type RungState } from "./engine";

/** Each day has its own save, so yesterday's climb can't load as today's, and free play has its own too. */
export const dailySaveKey = (day: string) => `toppic:toprung:v1:daily:${day}`;
export const freeSaveKey = (pool: string) => `toppic:toprung:v1:free:${pool}`;

export function forgetClimb(key: string) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

const SEEN_MAX = 100;
const seenKey = (pool: string) => `toppic:toprung:v1:seen:${pool}`;

/** Categories this device has already climbed on a topic, in the form the server's trivia bank avoids. */
export function loadSeenCats(pool: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(pool)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(-SEEN_MAX) : [];
  } catch {
    return [];
  }
}

function saveSeenCats(pool: string, names: string[]) {
  try {
    const cats = names.map((n) => `cat:${n}`);
    localStorage.setItem(seenKey(pool), JSON.stringify([...loadSeenCats(pool).filter((c) => !cats.includes(c)), ...cats].slice(-SEEN_MAX)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * The questions for a free climb: the server's bank, avoiding what this device has climbed, or the bundled ones if the
 * server is unreachable or can't fill the ladder. A climb in progress already holds its questions, so it asks nobody.
 */
export async function freeClimbBank(pool: string, saveKey: string, fromServer: (avoid: string[]) => Promise<TriviaCategory[] | null | undefined>, bundled: () => TriviaCategory[]): Promise<TriviaCategory[]> {
  if (loadClimb(saveKey)?.questions.length) return bundled();
  const categories = await fromServer(loadSeenCats(pool));
  if (!categories || init(categories, 0).questions.length < RUNGS) return bundled();
  saveSeenCats(pool, categories.map((c) => c.name));
  return categories;
}

/** The same climb for everyone playing on a given day. */
export const daySeed = (day: string) => {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
  return h | 0;
};

/** The saved climb if there is a good one, otherwise a new one. A saved climb with no questions in it doesn't count. */
export function startClimb(categories: TriviaCategory[], key: string, seed: number): RungState {
  const saved = loadClimb(key);
  return saved && saved.questions.length ? saved : init(categories, seed);
}

/**
 * How a climb ended, or null if it is still going. `empty` had no questions, so it never counts as a win, and `short`
 * ran out of questions before the top: the engine calls both of those "top", and only `lamp` really got there.
 */
export function endOf(s: RungState): "empty" | "lamp" | "short" | "fell" | "walked" | null {
  if (s.status === "climbing") return null;
  if (s.status === "fell" || s.status === "walked") return s.status;
  if (!s.questions.length) return "empty";
  return s.questions.length === RUNGS ? "lamp" : "short";
}

/** What a wrong answer on the current rung would leave you with. */
export function safePoints(s: RungState): number {
  const ledge = Math.max(0, ...LEDGES.filter((l) => l <= s.rung - 1));
  return ledge ? LADDER[ledge - 1]! : 0;
}

/** `none`: this lifeline has nothing it could do here, as with Swap on a thin climb with no spares. */
export function lifelineState(s: RungState, id: Lifeline): "ready" | "used" | "none" {
  if (s.used.includes(id)) return "used";
  if (s.status !== "climbing") return "none";
  if (id === "swap" && !s.spares[tierOf(s.rung)]) return "none";
  return "ready";
}

/** The crowd's share for an option, or null if there is no poll or Cut Two has since taken that option away. */
export function pollShare(s: Pick<RungState, "poll" | "hidden">, option: string): number | null {
  if (!s.poll || s.hidden.includes(option)) return null;
  return s.poll[option] ?? null;
}

const cleared = (s: RungState) => (s.status === "top" ? s.questions.length : s.rung - 1);

/** The score as a fraction after each rung, for the run chart, ending where a fall landed. */
export function climbHistory(s: RungState): number[] {
  const top = LADDER[RUNGS - 1]!;
  const out = LADDER.slice(0, cleared(s)).map((p) => p / top);
  return s.status === "fell" ? [...out, s.points / top] : out;
}

/** One square per rung reached, safe to share because it says nothing about the questions. */
export function climbGrid(s: RungState): string {
  const rungs = Array.from({ length: cleared(s) }, (_, i) => (LEDGES.includes(i + 1) ? "🟨" : "🟩")).join("");
  return rungs + (s.status === "fell" ? "🟥" : s.status === "walked" ? "⬜" : "");
}

/** What is stored with the day's result: how the climb went, never what was asked. */
export const climbDetail = (s: RungState) => ({ status: s.status, points: s.points, rung: s.rung, used: s.used });
