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
import { spanOf, type PeckItem, type PeckList } from "./types";
import { setListSource } from "./source";

export { normName };

export type { PeckItem, PeckList };
export { spanOf };

export const PECKING_LISTS: PeckList[] = [
  countriesPopulation, countriesArea, countriesGdp, cities, filmsBoxoffice, buildings, nbaPoints, pokemonBst, rivers, mountains,
] as PeckList[];
export const PECKING_LIST_IDS: string[] = PECKING_LISTS.map((l) => l.id);
export const peckingList = (id: string): PeckList | undefined => PECKING_LISTS.find((l) => l.id === id);

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

// Importing this module is what lets the engine deal questions (see source.ts).
setListSource(peckingList);
