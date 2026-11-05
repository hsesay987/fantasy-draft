// Country facts from a structured dataset instead of Wikidata's patchy statements: mledoze/countries, the data behind REST
// Countries (restcountries.com itself now needs an API key). Memberships are hand-written in commonThreadMemberships.ts.
import type { Entity } from "./commonThreadTopics";
import { MEMBERSHIPS } from "./commonThreadMemberships";

type Fetch = <T = any>(url: string, init?: RequestInit) => Promise<T>;
type Country = {
  cca2: string;
  region: string;
  subregion?: string;
  languages?: Record<string, string>;
  currencies?: Record<string, { name: string }>;
  landlocked?: boolean;
};

/** Kinds this module fills. Continents, sub-regions and the currency rule each other out. */
export const COUNTRY_EXCLUSIVE = ["continent", "subregion", "currency"];

const continentOf = (c: Country): string | undefined => {
  if (c.region === "Americas") return c.subregion === "South America" ? "South America" : "North America";
  if (c.region === "Antarctic") return "Antarctica";
  return c.region || undefined;
};
const lower = (name: string) => (/^Euro$/.test(name) ? "euro" : name);

/** Adds continent, sub-region, official languages, a sole currency, landlocked status and hand-written memberships to entities that have an ISO code. */
export async function addCountryFacts(ents: Entity[], isoOf: (e: Entity) => string | undefined, fetchJson: Fetch): Promise<void> {
  const data = await fetchJson<Country[]>("https://raw.githubusercontent.com/mledoze/countries/master/countries.json");
  const byIso = new Map(data.map((c) => [c.cca2, c]));
  for (const e of ents) {
    const iso = isoOf(e)?.toUpperCase();
    const c = iso && byIso.get(iso);
    if (!iso || !c) continue;
    const put = (kind: string, label: string) => (e.facts[kind] ??= new Set()).add(label);
    const cont = continentOf(c);
    if (cont) put("continent", `In ${cont}`);
    if (c.subregion) put("subregion", `In ${c.subregion === "Caribbean" ? "the " : ""}${c.subregion}`);
    // "Official or widely agreed primary": the dataset lists official languages; a country with many has no single answer.
    const langs = Object.values(c.languages ?? {});
    if (langs.length >= 1 && langs.length <= 3) for (const l of langs) put("language", `Has ${l} as an official language`);
    const cur = Object.values(c.currencies ?? {});
    if (cur.length === 1) put("currency", `Uses the ${lower(cur[0]!.name)}`);
    if (c.landlocked) put("landlocked", "A landlocked country");
    for (const [org, codes] of Object.entries(MEMBERSHIPS)) if (codes.includes(iso)) put("member", `Member of ${org}`);
  }
}
