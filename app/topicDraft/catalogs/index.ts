import type { Item } from "../types";
import superheroesAll from "./superheroes.json";
import villainsRaw from "./villains.json";
import anime from "./anime.json";
import videogames from "./videogames.json";
import pokemon from "./pokemon.json";
import disney from "./disney.json";
import movies from "./movies.json";
import history from "./history.json";
import football from "./football.json";
import films from "./films.json";
import shows from "./shows.json";
import nba from "./nba.json";
import food from "./food.json";
import geography from "./geography.json";
import flags from "./flags.json";
import books from "./books.json";
import music from "./music.json";
import weapons from "./weapons.json";
import gadgets from "./gadgets.json";
import allies from "./allies.json";
import vehicles from "./vehicles.json";
import traps from "./traps.json";

export const STD_KEYS = ["power", "intellect", "speed", "durability", "combat", "teamwork"];

export type CatalogMeta = {
  id: string;
  title: string;
  blurb: string;
  statKeys: string[];
  /** "character" pools are draftable teams; "item" pools only feed Loadout slots. */
  kind: "character" | "item";
};

const dedupe = (...lists: Item[][]): Item[] => {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const l of lists) for (const i of l) if (!seen.has(i.id)) (seen.add(i.id), out.push(i));
  return out;
};

/** Which public image source suits each pool (none = initials avatar). Query format: "kind:name". */
const IMAGE_KIND: Record<string, string> = {
  superheroes: "hero", villains: "hero", "heroes-villains": "hero", anime: "anilist", pokemon: "poke", history: "wiki", football: "wiki", films: "wiki", shows: "wiki", nba: "wiki",
  food: "wiki", geography: "wiki", books: "wiki", music: "wiki", flags: "flag",
};

/** Attach an image lookup key to every item so pictures can be fetched lazily. A catalog row may carry its own `q`
 * (an exact Wikipedia title, or a flag code) when the name alone would find the wrong page. */
const withQuery = (list: Item[], pool: string): Item[] => {
  const kind = IMAGE_KIND[pool];
  return kind ? list.map((i) => ({ ...i, q: `${kind}:${i.q ?? i.name}` })) : list;
};

const all = withQuery(superheroesAll as Item[], "superheroes");
const villainsOnly = withQuery(villainsRaw as Item[], "villains");
const heroesOnly = all.filter((i) => !i.tags.includes("villain"));

const DATA: Record<string, Item[]> = {
  superheroes: heroesOnly,
  villains: dedupe(villainsOnly, all.filter((i) => i.tags.includes("villain"))),
  "heroes-villains": dedupe(all, villainsOnly),
  anime: withQuery(anime as Item[], "anime"),
  videogames: withQuery(videogames as Item[], "videogames"),
  pokemon: withQuery(pokemon as Item[], "pokemon"),
  disney: withQuery(disney as Item[], "disney"),
  movies: withQuery(movies as Item[], "movies"),
  history: withQuery(history as Item[], "history"),
  football: withQuery(football as Item[], "football"),
  films: withQuery(films as Item[], "films"),
  shows: withQuery(shows as Item[], "shows"),
  nba: withQuery(nba as Item[], "nba"),
  food: withQuery(food as Item[], "food"),
  geography: withQuery(geography as Item[], "geography"),
  flags: withQuery(flags as Item[], "flags"),
  books: withQuery(books as Item[], "books"),
  music: withQuery(music as Item[], "music"),
  weapons: withQuery(weapons as Item[], "weapons"),
  gadgets: withQuery(gadgets as Item[], "gadgets"),
  allies: withQuery(allies as Item[], "allies"),
  vehicles: withQuery(vehicles as Item[], "vehicles"),
  traps: withQuery(traps as Item[], "traps"),
};

/** Every fictional character in one pool: heroes, villains, anime, games, Disney, movies and Pokémon. Each keeps its own picture source. */
export const FICTIONAL_MEMBERS = ["superheroes", "villains", "anime", "pokemon", "videogames", "disney", "movies"];
DATA.fictional = dedupe(...FICTIONAL_MEMBERS.map((id) => DATA[id]!));

const keysOf = (id: string) => Object.keys(DATA[id]![0]!.stats);

export const CATALOG_META: CatalogMeta[] = [
  { id: "fictional", title: "All Fictional Characters", blurb: "Heroes, villains, anime, games, Disney, movies and Pokémon in one pool.", statKeys: STD_KEYS, kind: "character" },
  { id: "superheroes", title: "Superheroes", blurb: "Marvel, DC and indie heroes.", statKeys: STD_KEYS, kind: "character" },
  { id: "villains", title: "Villains", blurb: "The deadliest rogues gallery.", statKeys: STD_KEYS, kind: "character" },
  { id: "heroes-villains", title: "Heroes & Villains", blurb: "One big pool, both sides.", statKeys: STD_KEYS, kind: "character" },
  { id: "anime", title: "Anime", blurb: "Fighters, rivals and sidekicks.", statKeys: STD_KEYS, kind: "character" },
  { id: "videogames", title: "Video Game Icons", blurb: "Mascots, heroes and bosses.", statKeys: STD_KEYS, kind: "character" },
  { id: "pokemon", title: "Pokémon", blurb: "Build a team of six.", statKeys: STD_KEYS, kind: "character" },
  { id: "disney", title: "Disney & Pixar", blurb: "Magic, heart and a few villains.", statKeys: STD_KEYS, kind: "character" },
  { id: "movies", title: "Movie Icons", blurb: "Action stars to monsters.", statKeys: STD_KEYS, kind: "character" },
  { id: "history", title: "Historical Figures", blurb: "Leaders, geniuses and icons.", statKeys: keysOf("history"), kind: "character" },
  { id: "football", title: "International Football", blurb: "World Cup legends and today\u2019s stars.", statKeys: keysOf("football"), kind: "character" },
  { id: "films", title: "Films", blurb: "Classics, blockbusters and cult hits.", statKeys: keysOf("films"), kind: "character" },
  { id: "shows", title: "TV Shows", blurb: "Binge-worthy series, all genres.", statKeys: keysOf("shows"), kind: "character" },
  { id: "nba", title: "NBA Legends", blurb: "All-time greats with real heights, teams and best seasons.", statKeys: keysOf("nba"), kind: "character" },
  { id: "food", title: "Food", blurb: "Dishes from every kitchen in the world.", statKeys: keysOf("food"), kind: "character" },
  { id: "geography", title: "Geography", blurb: "Countries, from superpowers to island hideaways.", statKeys: keysOf("geography"), kind: "character" },
  { id: "flags", title: "Flags", blurb: "The world\u2019s flags, judged on design.", statKeys: keysOf("flags"), kind: "character" },
  { id: "books", title: "Books", blurb: "Classics, page-turners and epic series.", statKeys: keysOf("books"), kind: "character" },
  { id: "music", title: "Music", blurb: "Legends, bands and today\u2019s hitmakers.", statKeys: keysOf("music"), kind: "character" },
  { id: "weapons", title: "Weapons", blurb: "Blades, blasters and artifacts.", statKeys: keysOf("weapons"), kind: "item" },
  { id: "gadgets", title: "Gadgets", blurb: "Tech and gear.", statKeys: keysOf("gadgets"), kind: "item" },
  { id: "allies", title: "Allies & Sidekicks", blurb: "Villain help and loyal partners.", statKeys: keysOf("allies"), kind: "item" },
  { id: "vehicles", title: "Vehicles", blurb: "Ground, air, sea and space.", statKeys: keysOf("vehicles"), kind: "item" },
  { id: "traps", title: "Traps & Locations", blurb: "Home-turf advantages.", statKeys: keysOf("traps"), kind: "item" },
];

export const CATALOG_IDS = CATALOG_META.map((m) => m.id);
export const CHARACTER_POOLS = CATALOG_META.filter((m) => m.kind === "character");

export const catalogMeta = (id: string) => CATALOG_META.find((m) => m.id === id);

export function getCatalog(id: string): Item[] {
  return DATA[id] ?? [];
}

export function universesOf(id: string): string[] {
  return [...new Set(getCatalog(id).map((i) => i.universe))].sort();
}
