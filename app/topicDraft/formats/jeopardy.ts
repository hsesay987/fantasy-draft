// Jeopardy: a board of categories and dollar values filled with real trivia for the topic.
import type { Question } from "../trivia/types";
import type { Item } from "../types";
import { statQuestion, noun } from "../trivia/generated";
import { next, shuffle } from "../rng";

export const VALUES = [100, 200, 300, 400];

export type Cell = { cat: string; value: number; q: string; options: string[]; answer: string; done: boolean; by?: string; picked?: string; correct?: boolean };
export type Right = { q: string; answer: string; cat: string };

export type JeopardyState = {
  players: string[];
  cats: string[];
  cells: Cell[]; // row-major: row = value tier, column = category
  active: number | null; // the clue currently on screen
  resolved: number;
  last: number | null; // the clue answered most recently
  points: Record<string, number>;
  right: Record<string, Right[]>;
  tried: Record<string, number>;
  done: boolean;
  seed: number;
};

export const colsOf = (s: JeopardyState) => s.cats.length;

/** Which question level each board row draws from: no easy level-1 clues, and the two top rows are the hardest. */
export const ROW_LEVELS = [2, 3, 4, 4];

/** Categories with enough questions to fill every row without repeating one can go on the board. */
export const usableCats = (qs: Question[]) =>
  [...new Set(qs.map((q) => q.cat))].filter((c) => [2, 3, 4].every((l) => qs.filter((q) => q.cat === c && q.level === l).length >= ROW_LEVELS.filter((x) => x === l).length));

/**
 * Build a board. Categories are a random mix of hand-written trivia categories and stat categories made from the
 * topic's characters (so there is always something new); questions seen recently on this device are avoided.
 */
export function init(o: { players: string[]; questions: Question[]; pool?: Item[]; statKeys?: string[]; avoid?: string[]; cats?: number; seed: number }): JeopardyState {
  let seed = o.seed;
  const avoid = new Set(o.avoid ?? []);
  const trivia = usableCats(o.questions).map((c) => ({ kind: "trivia" as const, key: c }));
  const stats = (o.pool && o.pool.length >= 12 ? o.statKeys ?? [] : []).map((k) => ({ kind: "stat" as const, key: k }));
  const [shuffled, s1] = shuffle([...trivia, ...stats], seed);
  seed = s1;
  // Keep at least two real trivia categories when we have them.
  const want = o.cats ?? 4;
  const t = shuffled.filter((c) => c.kind === "trivia");
  const picked = [...t.slice(0, Math.min(2, t.length)), ...shuffled.filter((c) => !t.slice(0, Math.min(2, t.length)).includes(c as never))].slice(0, want);
  const [cols, s2] = shuffle(picked, seed);
  seed = s2;
  const cells: Cell[] = new Array(cols.length * VALUES.length);
  cols.forEach((c, col) => {
    const used = new Set<string>();
    VALUES.forEach((value, row) => {
      const level = ROW_LEVELS[row]!;
      let q: Question | null = null;
      if (c.kind === "trivia") {
        const all = o.questions.filter((x) => x.cat === c.key && x.level === level && !used.has(x.q));
        const fresh = all.filter((x) => !avoid.has(x.q));
        const [pickFrom, ns] = shuffle(fresh.length ? fresh : all, seed);
        seed = ns;
        q = pickFrom[0] ?? null;
      } else {
        const r = statQuestion(o.pool!, c.key, level, seed);
        if (r) { q = r.q; seed = r.seed + 1; }
      }
      if (!q) q = { cat: String(c.key), level, q: "Placeholder?", right: "A", wrong: ["B", "C", "D"] };
      used.add(q.q);
      const [options, s3] = shuffle([q.right, ...q.wrong], seed);
      seed = s3;
      cells[row * cols.length + col] = { cat: c.kind === "stat" ? noun(c.key) : c.key, value, q: q.q, options, answer: q.right, done: false };
    });
  });
  return { players: o.players, cats: cols.map((c) => (c.kind === "stat" ? noun(c.key) : c.key)), cells, active: null, resolved: 0, last: null, points: Object.fromEntries(o.players.map((p) => [p, 0])), right: Object.fromEntries(o.players.map((p) => [p, []])), tried: Object.fromEntries(o.players.map((p) => [p, 0])), done: cells.length === 0, seed };
}

/** Whoever's turn it is picks the clue and answers it. */
export const turnPlayer = (s: JeopardyState) => (s.done ? null : s.players[s.resolved % s.players.length]!);

export function choose(s: JeopardyState, by: string, cell: number): JeopardyState {
  if (s.done || s.active != null || turnPlayer(s) !== by) return s;
  if (!s.cells[cell] || s.cells[cell]!.done) return s;
  return { ...s, active: cell };
}

export function answer(s: JeopardyState, by: string, choice: string): JeopardyState {
  if (s.done || s.active == null || turnPlayer(s) !== by) return s;
  const c = s.cells[s.active]!;
  if (!c.options.includes(choice)) return s;
  const correct = choice === c.answer;
  const cells = s.cells.map((x, i) => (i === s.active ? { ...x, done: true, by, picked: choice, correct } : x));
  const resolved = s.resolved + 1;
  return {
    ...s,
    cells,
    active: null,
    last: s.active,
    resolved,
    points: { ...s.points, [by]: s.points[by]! + (correct ? c.value : -c.value) },
    right: correct ? { ...s.right, [by]: [...s.right[by]!, { q: c.q, answer: c.answer, cat: c.cat }] } : s.right,
    tried: { ...s.tried, [by]: s.tried[by]! + 1 },
    done: resolved >= s.cells.length,
  };
}

/** AI: picks the cheapest open clue; answers right less often as the value climbs. */
export const aiChoose = (s: JeopardyState): number => s.cells.findIndex((c) => !c.done);

export function aiAnswer(s: JeopardyState): { choice: string; seed: number } {
  const c = s.cells[s.active!]!;
  const [r, seed] = next(s.seed);
  const p = 0.9 - 0.14 * VALUES.indexOf(c.value);
  const wrong = c.options.filter((o) => o !== c.answer);
  return { choice: r < p ? c.answer : wrong[Math.floor(r * 997) % wrong.length]!, seed };
}
