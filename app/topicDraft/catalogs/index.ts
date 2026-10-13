import type { Item } from "../types";
import superheroes from "./superheroes.json";

export type CatalogMeta = {
  id: string;
  title: string;
  blurb: string;
  statKeys: string[];
  universes: string[];
  live: boolean;
};

const DATA: Record<string, Item[]> = {
  superheroes: superheroes as Item[],
};

export function getCatalog(id: string): Item[] {
  return DATA[id] ?? [];
}

export function universesOf(id: string): string[] {
  return [...new Set(getCatalog(id).map((i) => i.universe))].sort();
}
