import { getJson } from "./http";

export type Row = Record<string, string>;

/** Runs a SPARQL query on Wikidata and flattens each binding to {var: value}; entity ids come back as bare Q-numbers. */
export async function sparql(query: string): Promise<Row[]> {
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query);
  const data = await getJson<any>(url, { headers: { Accept: "application/sparql-results+json" } });
  return (data.results.bindings as any[]).map((b) => {
    const row: Row = {};
    for (const [k, v] of Object.entries<any>(b)) row[k] = String(v.value).replace(/^http:\/\/www\.wikidata\.org\/entity\//, "");
    return row;
  });
}

/** A label that is just a Q-number means Wikidata has no English name; those entities are not usable in a question. */
export const hasName = (s: string | undefined): s is string => !!s && !/^Q\d+$/.test(s) && s.length > 1;

export type FactDef = {
  key: string;
  /** Wikidata property id, for example P57 (director). */
  pid: string;
  /** item: label of the linked entity. year: the earliest year in a date value. */
  kind: "item" | "year";
};

export type Source = {
  /** SPARQL pattern that binds ?item, for example `?item wdt:P31 wd:Q11424.` (instances of film). A list runs one query per entry, which keeps huge classes (people) under the 60 second limit; `tag` is stored as the `tag` fact. */
  where: string | { tag: string; where: string }[];
  /** Only entities with at least this many Wikipedia/Wikimedia pages count as famous enough for a question. */
  minSitelinks: number;
  limit: number;
  facts: FactDef[];
};

const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function wbget(ids: string[], props: string): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  for (const part of chunk(ids, 50)) {
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=en&props=${props}&ids=${part.join("|")}`;
    Object.assign(out, (await getJson<any>(url)).entities);
  }
  return out;
}

const statements = (entity: any, pid: string): any[] => {
  const all: any[] = entity?.claims?.[pid] ?? [];
  const preferred = all.filter((c) => c.rank === "preferred");
  return (preferred.length ? preferred : all.filter((c) => c.rank !== "deprecated")).filter((c) => c.mainsnak?.snaktype === "value");
};

export async function fetchEntities(src: Source): Promise<import("./model").Entity[]> {
  const parts = typeof src.where === "string" ? [{ tag: "", where: src.where }] : src.where;
  const pop = new Map<string, number>();
  const tags = new Map<string, string>();
  for (const part of parts) {
    const rows = await sparql(`SELECT DISTINCT ?item ?sl WHERE { ${part.where} ?item wikibase:sitelinks ?sl. FILTER(?sl >= ${src.minSitelinks}) } ORDER BY DESC(?sl) LIMIT ${src.limit}`);
    for (const r of rows) if (!pop.has(r.item)) { pop.set(r.item, Number(r.sl)); if (part.tag) tags.set(r.item, part.tag); }
  }
  const ids = [...pop.keys()];
  const ents = await wbget(ids, "labels|claims");
  const linked = new Set<string>();
  for (const id of ids) for (const f of src.facts) if (f.kind === "item") for (const c of statements(ents[id], f.pid)) if (c.mainsnak.datavalue?.value?.id) linked.add(c.mainsnak.datavalue.value.id);
  const names = await wbget([...linked], "labels");
  const label = (id: string) => names[id]?.labels?.en?.value as string | undefined;

  const out: import("./model").Entity[] = [];
  for (const id of ids) {
    const name = ents[id]?.labels?.en?.value as string | undefined;
    if (!hasName(name)) continue;
    const facts: Record<string, string[]> = {};
    if (tags.has(id)) facts.tag = [tags.get(id)!];
    for (const f of src.facts) {
      const vals: string[] = [];
      for (const c of statements(ents[id], f.pid)) {
        const v = c.mainsnak.datavalue?.value;
        if (f.kind === "item") {
          const l = v?.id && label(v.id);
          if (hasName(l)) vals.push(l);
        } else if (typeof v?.time === "string" && (v.precision ?? 0) >= 9) {
          const y = v.time.match(/^\+(\d{4})-/)?.[1];
          if (y) vals.push(String(Number(y)));
        }
      }
      // Several release dates mean the earliest is the real one; several people mean the fact is shared and not a clean answer.
      const uniq = [...new Set(vals)];
      facts[f.key] = f.kind === "year" ? (uniq.length ? [String(Math.min(...uniq.map(Number)))] : []) : uniq;
    }
    out.push({ id, label: name, pop: pop.get(id) ?? 0, facts });
  }
  return out;
}
