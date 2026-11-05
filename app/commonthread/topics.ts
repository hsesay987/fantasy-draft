import { CATEGORIES } from "../play/categories";
import type { ThreadClue, ThreadTopic } from "./types";

// One import() per topic, so a page only ever downloads the topic being played. Never import these files statically,
// and never import PINPOINT_TOPICS into a page here: that module pulls in all of Pinpoint's data.
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  anime: () => import("./data/anime.json"),
  books: () => import("./data/books.json"),
  disney: () => import("./data/disney.json"),
  films: () => import("./data/films.json"),
  flags: () => import("./data/flags.json"),
  food: () => import("./data/food.json"),
  football: () => import("./data/football.json"),
  geography: () => import("./data/geography.json"),
  history: () => import("./data/history.json"),
  movies: () => import("./data/movies.json"),
  music: () => import("./data/music.json"),
  nba: () => import("./data/nba.json"),
  pokemon: () => import("./data/pokemon.json"),
  shows: () => import("./data/shows.json"),
  superheroes: () => import("./data/superheroes.json"),
  videogames: () => import("./data/videogames.json"),
  villains: () => import("./data/villains.json"),
};

/** The same topics as Pinpoint, in the same order. A test holds the two lists together. */
export const THREAD_TOPICS = CATEGORIES.filter((c) => !c.hidden && LOADERS[c.id]);

export async function loadThreadTopic(pool: string): Promise<ThreadTopic> {
  const load = Object.hasOwn(LOADERS, pool) ? LOADERS[pool] : undefined;
  if (!load) throw new Error(`No Common Thread topic ${pool}`);
  return (await load()).default as ThreadTopic;
}

/**
 * Which image source a topic's clues use ("kind:lookup", see lib/characterImages). `q` is a Wikipedia title, or an ISO
 * code for flags. These pools are wider than the draft catalogs, so heroes fall back to Wikipedia when the hero
 * dataset has no match, and the three character topics with no dataset of their own use Wikipedia too.
 */
const IMAGE_KIND: Record<string, string> = {
  superheroes: "herowiki", villains: "herowiki", anime: "anilist", pokemon: "poke", flags: "flag",
  history: "wiki", football: "wiki", films: "wiki", shows: "wiki", nba: "wiki", food: "wiki", geography: "wiki", books: "wiki", music: "wiki",
  disney: "wiki", movies: "wiki", videogames: "wiki",
};

export const clueImage = (pool: string, clue: ThreadClue) => `${IMAGE_KIND[pool] ?? "wiki"}:${clue.q ?? clue.name}`;
