import type { Question, Survey, TriviaCategory, TriviaSet } from "./types";
import { superheroes } from "./superheroes";
import { villains } from "./villains";
import { anime } from "./anime";
import { pokemon } from "./pokemon";
import { videogames } from "./videogames";
import { disney } from "./disney";
import { movies } from "./movies";
import { history } from "./history";
import { football } from "./football";
import { films } from "./films";
import { shows } from "./shows";
import { food } from "./food";
import { geography } from "./geography";
import { flags } from "./flags";
import { books } from "./books";
import { music } from "./music";
import { mythology } from "./mythology";
import { animals } from "./animals";
import { celebrities } from "./celebrities";
import sourcedJson from "./sourced.json";

const SETS: Record<string, TriviaSet> = {
  superheroes,
  villains,
  "heroes-villains": { quiz: [...superheroes.quiz, ...villains.quiz], surveys: [...superheroes.surveys, ...villains.surveys] },
  anime, pokemon, videogames, disney, movies, history, football, films, shows, food, geography, flags, books, music, mythology, animals, celebrities,
};

// A pool made of other pools: it plays with their questions combined.
export const POOL_MEMBERS: Record<string, string[]> = {
  "heroes-villains": ["superheroes", "villains"],
  fictional: ["superheroes", "villains", "anime", "pokemon", "videogames", "disney", "movies"],
};
const merged = (ids: string[]): TriviaSet => ({ quiz: ids.flatMap((i) => SETS[i]!.quiz), surveys: ids.flatMap((i) => SETS[i]!.surveys) });
SETS.fictional = merged(POOL_MEMBERS.fictional!);

export const TRIVIA_POOLS = Object.keys(SETS);
export const hasTrivia = (pool: string) => !!SETS[pool];

/**
 * Questions built from public data (Wikidata, PokéAPI) by `npm run trivia:ingest -- all --bundle` in backend/. They ship
 * with the game, so they work with no database. A board's four clues run easiest first, so they take levels 2, 3, 4, 4.
 */
type Sourced = Record<string, { source: string; categories: TriviaCategory[]; surveys: Survey[] }>;
const SOURCED = sourcedJson as Sourced;
const sourcedOf = (pool: string) => (POOL_MEMBERS[pool] ?? [pool]).map((id) => SOURCED[id]).filter((x) => !!x);
const BOARD_LEVELS = [2, 3, 4, 4] as const;

export function questionsFor(pool: string): Question[] {
  const own = (SETS[pool]?.quiz ?? []).map(([cat, level, q, right, ...wrong]) => ({ cat, level, q, right, wrong }));
  const sourced = sourcedOf(pool).flatMap((s) => s.categories.flatMap((c) => c.clues.map((k, i) => ({ cat: c.name, level: BOARD_LEVELS[i] ?? 4, q: k.q, right: k.right, wrong: k.wrong }))));
  return [...own, ...sourced];
}

export function surveysFor(pool: string): Survey[] {
  const own = (SETS[pool]?.surveys ?? []).map(([q, answers, decoys]) => ({ q, answers: answers.split("|"), decoys: decoys.split("|") }));
  return [...own, ...sourcedOf(pool).flatMap((s) => s.surveys)];
}

/** Hand-written categories as boards: the four clues for rows 100-400 use levels 2, 3, 4 and a second level 4. */
export function bundledCategories(pool: string): TriviaCategory[] {
  const qs = questionsFor(pool);
  const out: TriviaCategory[] = [];
  for (const name of [...new Set(qs.map((q) => q.cat))]) {
    const of = (level: number) => qs.filter((q) => q.cat === name && q.level === level);
    const [l2, l3, l4] = [of(2), of(3), of(4)];
    if (!l2.length || !l3.length || l4.length < 2) continue;
    const clues = [l2[0]!, l3[0]!, l4[0]!, l4[1]!].map((x) => ({ q: x.q, right: x.right, wrong: x.wrong }));
    out.push({ name, clues });
  }
  return out;
}
