import type { Item } from "../types";
import superheroesAll from "./superheroes.json";
import villainsRaw from "./villains.json";
import anime from "./anime.json";
import videogames from "./videogames.json";
import pokemon from "./pokemon.json";
import disney from "./disney.json";
import movies from "./movies.json";
import history from "./history.json";
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

const SUFFIX: Record<string, string> = {
  superheroes: "comics character", villains: "comics character", "heroes-villains": "comics character", anime: "anime character",
  videogames: "video game character", pokemon: "Pokémon", disney: "animated character", movies: "film character", history: "",
  weapons: "weapon", gadgets: "gadget", allies: "character", vehicles: "vehicle", traps: "",
};

/** Attach an image search query to every item so pictures can be looked up lazily. */
const withQuery = (list: Item[], suffix: string): Item[] =>
  list.map((i) => ({ ...i, q: [i.name, ["DC", "Marvel"].includes(i.universe) ? `${i.universe} Comics` : suffix].filter(Boolean).join(" ") }));

const all = withQuery(superheroesAll as Item[], SUFFIX.superheroes!);
const villainsOnly = withQuery(villainsRaw as Item[], SUFFIX.villains!);
const heroesOnly = all.filter((i) => !i.tags.includes("villain"));

const DATA: Record<string, Item[]> = {
  superheroes: heroesOnly,
  villains: dedupe(villainsOnly, all.filter((i) => i.tags.includes("villain"))),
  "heroes-villains": dedupe(all, villainsOnly),
  anime: withQuery(anime as Item[], SUFFIX.anime!),
  videogames: withQuery(videogames as Item[], SUFFIX.videogames!),
  pokemon: withQuery(pokemon as Item[], SUFFIX.pokemon!),
  disney: withQuery(disney as Item[], SUFFIX.disney!),
  movies: withQuery(movies as Item[], SUFFIX.movies!),
  history: withQuery(history as Item[], SUFFIX.history!),
  weapons: withQuery(weapons as Item[], SUFFIX.weapons!),
  gadgets: withQuery(gadgets as Item[], SUFFIX.gadgets!),
  allies: withQuery(allies as Item[], SUFFIX.allies!),
  vehicles: withQuery(vehicles as Item[], SUFFIX.vehicles!),
  traps: withQuery(traps as Item[], SUFFIX.traps!),
};

const keysOf = (id: string) => Object.keys(DATA[id]![0]!.stats);

export const CATALOG_META: CatalogMeta[] = [
  { id: "superheroes", title: "Superheroes", blurb: "Marvel, DC and indie heroes.", statKeys: STD_KEYS, kind: "character" },
  { id: "villains", title: "Villains", blurb: "The deadliest rogues gallery.", statKeys: STD_KEYS, kind: "character" },
  { id: "heroes-villains", title: "Heroes & Villains", blurb: "One big pool, both sides.", statKeys: STD_KEYS, kind: "character" },
  { id: "anime", title: "Anime", blurb: "Fighters, rivals and sidekicks.", statKeys: STD_KEYS, kind: "character" },
  { id: "videogames", title: "Video Game Icons", blurb: "Mascots, heroes and bosses.", statKeys: STD_KEYS, kind: "character" },
  { id: "pokemon", title: "Pokémon", blurb: "Build a team of six.", statKeys: STD_KEYS, kind: "character" },
  { id: "disney", title: "Disney & Pixar", blurb: "Magic, heart and a few villains.", statKeys: STD_KEYS, kind: "character" },
  { id: "movies", title: "Movie Icons", blurb: "Action stars to monsters.", statKeys: STD_KEYS, kind: "character" },
  { id: "history", title: "Historical Figures", blurb: "Leaders, geniuses and icons.", statKeys: keysOf("history"), kind: "character" },
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
