// Jeopardy: a board of categories and dollar values filled with real trivia for the topic.
import type { TriviaCategory } from "../trivia/types";
import { next, shuffle } from "../rng";

export const VALUES = [100, 200, 300, 400];

export type Cell = { catId?: string; clue?: number; cat: string; value: number; q: string; options: string[]; answer: string; done: boolean; by?: string; picked?: string; correct?: boolean };
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

/**
 * Build a board from whole categories (each has four clues, 100 to 400). The server normally picks fresh categories
 * for a game; when a board comes from the bundled bank instead, categories seen recently on this device are avoided.
 */
export function init(o: { players: string[]; categories: TriviaCategory[]; avoid?: string[]; cats?: number; seed: number }): JeopardyState {
  let seed = o.seed;
  const want = o.cats ?? 4;
  const avoid = new Set(o.avoid ?? []);
  const usable = o.categories.filter((c) => c.clues.length >= VALUES.length);
  const fresh = usable.filter((c) => !avoid.has(`cat:${c.name}`));
  const [freshOrder, s1] = shuffle(fresh, seed);
  const [seenOrder, s2] = shuffle(usable.filter((c) => !fresh.includes(c)), s1);
  const [cols, s3] = shuffle([...freshOrder, ...seenOrder].slice(0, want), s2);
  seed = s3;
  const cells: Cell[] = new Array(cols.length * VALUES.length);
  cols.forEach((c, col) => {
    VALUES.forEach((value, row) => {
      const clue = c.clues[row]!;
      const [options, ns] = shuffle([clue.right, ...clue.wrong], seed);
      seed = ns;
      cells[row * cols.length + col] = { catId: c.id, clue: row, cat: c.name, value, q: clue.q, options, answer: clue.right, done: false };
    });
  });
  return { players: o.players, cats: cols.map((c) => c.name), cells, active: null, resolved: 0, last: null, points: Object.fromEntries(o.players.map((p) => [p, 0])), right: Object.fromEntries(o.players.map((p) => [p, []])), tried: Object.fromEntries(o.players.map((p) => [p, 0])), done: cells.length === 0, seed };
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
