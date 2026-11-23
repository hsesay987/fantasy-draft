// Animal facts from Wikidata: IUCN status and where a species sits in the tree of life (class, order, family, genus).
// Wikidata's SPARQL service times out walking the taxon tree for hundreds of species, so the walk is done here,
// one parent level at a time, with the entity API.
import type { Entity, Spec, Template } from "./model";
import { hasName, sparql, wbget } from "./wikidata";

const RANK = { Q37517: "class", Q36602: "order", Q35409: "family", Q34740: "genus" } as const;
const CLASS_NAME: Record<string, string> = { mammal: "Mammals", Mammalia: "Mammals", Aves: "Birds", Reptilia: "Reptiles", Amphibia: "Amphibians", Insecta: "Insects", Arachnida: "Arachnids", bird: "Birds", reptile: "Reptiles", amphibian: "Amphibians", insect: "Insects", "Actinopterygii": "Fish", "Chondrichthyes": "Sharks & Rays", "cartilaginous fish": "Sharks & Rays", arachnid: "Arachnids", cephalopod: "Cephalopods" };
/** Wikidata gives a few orders their English names; questions use the Latin ones throughout. */
const ORDER_FIX: Record<string, string> = { Passerines: "Passeriformes", passerine: "Passeriformes", Monotreme: "Monotremata", Primate: "Primates", Rodent: "Rodentia", Bat: "Chiroptera" };
/** Labels that are not the English name (Wikidata calls the European rabbit "Poponejo"). */
const SKIP = new Set(["Poponejo"]);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const valueIds = (e: any, pid: string): string[] => (e?.claims?.[pid] ?? []).filter((c: any) => c.rank !== "deprecated" && c.mainsnak?.snaktype === "value").map((c: any) => c.mainsnak.datavalue.value.id as string);

export async function fetchAnimals(minSitelinks = 60, limit = 600): Promise<Entity[]> {
  const rows = await sparql(`SELECT DISTINCT ?item ?sl WHERE { hint:Query hint:optimizer "None". ?item wdt:P141 ?s. ?item wikibase:sitelinks ?sl. FILTER(?sl >= ${minSitelinks}) ?item wdt:P105 wd:Q7432. } ORDER BY DESC(?sl) LIMIT ${limit}`);
  const pop = new Map(rows.map((r) => [r.item, Number(r.sl)]));
  const ents: Record<string, any> = await wbget([...pop.keys()], "labels|claims");
  // Walk up the parent taxa (P171) until every species has reached its class, keeping the ranks we ask about.
  const taxa: Record<string, any> = {};
  let frontier = [...new Set(Object.values(ents).flatMap((e) => valueIds(e, "P171")))];
  for (let depth = 0; depth < 40 && frontier.length; depth++) {
    const got = await wbget(frontier.filter((q) => !taxa[q]), "labels|claims");
    Object.assign(taxa, got);
    frontier = [...new Set(Object.values(got).filter((t: any) => !valueIds(t, "P105").includes("Q37517")).flatMap((t) => valueIds(t, "P171")))].filter((q) => !taxa[q]);
  }
  const statusIds = [...new Set(Object.values(ents).flatMap((e) => valueIds(e, "P141")))];
  const statuses = await wbget(statusIds, "labels");
  const label = (x: any) => x?.labels?.en?.value as string | undefined;

  const out: Entity[] = [];
  for (const [id, e] of Object.entries(ents)) {
    const name = label(e);
    // Species with only a Latin English label ("Panthera leo") are not what players call them.
    if (!hasName(name) || SKIP.has(name) || /^[A-Z][a-z]+ [a-z]+$/.test(name)) continue;
    const facts: Record<string, string[]> = {};
    const status = valueIds(e, "P141").map((s) => label(statuses[s])).filter(hasName);
    facts.status = status.length === 1 ? [cap(status[0]!)] : [];
    let cur = valueIds(e, "P171")[0];
    for (let i = 0; cur && i < 40; i++) {
      const t = taxa[cur];
      const rank = RANK[valueIds(t, "P105")[0] as keyof typeof RANK];
      const l = label(t);
      if (rank && hasName(l) && !facts[rank]) facts[rank] = [rank === "class" ? CLASS_NAME[l] ?? cap(l) : ORDER_FIX[cap(l)] ?? cap(l)];
      if (rank === "class") break;
      cur = valueIds(t, "P171")[0];
    }
    // Plants and fungi carry IUCN statuses too; keep the animal classes players know.
    if (!facts.class || !Object.values(CLASS_NAME).includes(facts.class[0]!)) continue;
    facts.common = [name];
    out.push({ id, label: cap(name), pop: pop.get(id) ?? 0, facts });
  }
  return out;
}

const first = (e: Entity, f: string) => e.facts[f]?.[0] ?? null;
const t = (x: Template) => x;
/** Wikidata's own casing: "grey heron" but "Eurasian jay". */
const the = (e: Entity) => `the ${first(e, "common") ?? e.label}`;
const latinFamily = (e: Entity) => /idae$/.test(first(e, "family") ?? "");

export const ANIMALS_SPEC: Spec = {
  pool: "animals",
  templates: [
    t({ fact: "status", ask: (e) => `What is the IUCN conservation status of ${the(e)}?`, group: (e) => first(e, "class"), name: (g) => `Conservation: ${g}`, shared: true }),
    t({ fact: "order", ask: (e) => `To which order does ${the(e)} belong?`, group: (e) => first(e, "class"), name: (g) => `Animal Orders: ${g}`, shared: true }),
    t({ fact: "family", ask: (e) => `To which family does ${the(e)} belong?`, group: (e) => (latinFamily(e) ? first(e, "class") : null), name: (g) => `Animal Families: ${g}`, shared: true }),
    t({ fact: "class", ask: (e) => `Which class of animal is ${the(e)}?`, group: (e) => first(e, "status"), name: (g) => `Animal Classes: ${g} Species`, shared: true }),
  ],
  surveys: [
    { fact: "family", ask: (v) => `Name an animal in the family ${v}`, ok: (v) => /idae$/.test(v) },
  ],
};
