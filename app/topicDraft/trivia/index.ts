import type { Question, Survey, TriviaSet } from "./types";
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

const SETS: Record<string, TriviaSet> = {
  superheroes,
  villains,
  "heroes-villains": { quiz: [...superheroes.quiz, ...villains.quiz], surveys: [...superheroes.surveys, ...villains.surveys] },
  anime, pokemon, videogames, disney, movies, history, football, films, shows,
};

export const TRIVIA_POOLS = Object.keys(SETS);
export const hasTrivia = (pool: string) => !!SETS[pool];

export function questionsFor(pool: string): Question[] {
  return (SETS[pool]?.quiz ?? []).map(([cat, level, q, right, ...wrong]) => ({ cat, level, q, right, wrong }));
}

export function surveysFor(pool: string): Survey[] {
  return (SETS[pool]?.surveys ?? []).map(([q, answers, decoys]) => ({ q, answers: answers.split("|"), decoys: decoys.split("|") }));
}
