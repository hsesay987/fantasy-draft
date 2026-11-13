// Pecking Order's complete ranked lists, built offline by scripts/buildPecking.ts.
// Room screens must not import this file (it bundles every list); they use ./meta instead.
import countriesPopulation from "./data/countries-population.json";
import countriesArea from "./data/countries-area.json";
import countriesGdp from "./data/countries-gdp.json";
import cities from "./data/cities.json";
import filmsBoxoffice from "./data/films-boxoffice.json";
import buildings from "./data/buildings.json";
import nbaPoints from "./data/nba-points.json";
import pokemonBst from "./data/pokemon-bst.json";
import rivers from "./data/rivers.json";
import mountains from "./data/mountains.json";
import { normName } from "./normName";

export { normName };

export type PeckItem = { name: string; value: number; rank: number; aliases?: string[] };
export type PeckList = {
  id: string;
  title: string;
  stat: string;
  unit?: string;
  fmt?: "big" | "int" | "dec";
  source: string;
  /** The date the list was built (YYYY-MM-DD). */
  asOf: string;
  /** In rank order, best first. Ties share a rank (competition ranking: 1, 2, 2, 4). */
  items: PeckItem[];
};

export const PECKING_LISTS: PeckList[] = [
  countriesPopulation, countriesArea, countriesGdp, cities, filmsBoxoffice, buildings, nbaPoints, pokemonBst, rivers, mountains,
] as PeckList[];
export const PECKING_LIST_IDS: string[] = PECKING_LISTS.map((l) => l.id);
export const peckingList = (id: string): PeckList | undefined => PECKING_LISTS.find((l) => l.id === id);

/** The ranks a (possibly tied) item covers: in 9, 5, 5, 1 each 5 spans [2, 3]. Any rank in the span is exact. */
export function spanOf(list: PeckList, item: PeckItem): [number, number] {
  const tied = list.items.filter((o) => o.value === item.value).length;
  return [item.rank, item.rank + Math.max(1, tied) - 1];
}

const indexes = new WeakMap<PeckList, Map<string, PeckItem>>();
/** The item a typed name means, by its name or an alias; names win over another item's alias. */
export function matchName(list: PeckList, text: string): PeckItem | null {
  let idx = indexes.get(list);
  if (!idx) {
    idx = new Map();
    for (const it of list.items) for (const a of it.aliases ?? []) { const k = normName(a); if (k && !idx.has(k)) idx.set(k, it); }
    for (const it of list.items) idx.set(normName(it.name), it);
    indexes.set(list, idx);
  }
  const k = normName(text);
  return (k && idx.get(k)) || null;
}
