import type { Item } from "../types";
import superheroes from "./superheroes.json";
import villains from "./villains.json";
import anime from "./anime.json";
import videogames from "./videogames.json";
import pokemon from "./pokemon.json";

export type CatalogMeta = {
  id: string;
  title: string;
  blurb: string;
  statKeys: string[];
  universes: string[];
  live: boolean;
};

export const CATALOG_IDS = ["superheroes", "villains", "anime", "videogames", "pokemon"];

const DATA: Record<string, Item[]> = {
  superheroes: superheroes as Item[],
  villains: villains as Item[],
  anime: anime as Item[],
  videogames: videogames as Item[],
  pokemon: pokemon as Item[],
};

export function getCatalog(id: string): Item[] {
  return DATA[id] ?? [];
}

export function universesOf(id: string): string[] {
  return [...new Set(getCatalog(id).map((i) => i.universe))].sort();
}
