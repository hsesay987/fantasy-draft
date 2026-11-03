// Builds app/pinpoint/data/<topic>.json: real facts for every pick in a Pinpoint topic.
// Sources: Wikidata (most topics), PokéAPI (Pokémon), AniList (anime), the Superhero API (race and alignment
// for comic characters) and the NBA catalog's own facts. Run: npx tsx scripts/buildPinpoint.ts [topic ...]
import fs from "node:fs";
import path from "node:path";
import { getCatalog } from "../app/topicDraft/catalogs";
import type { Item } from "../app/topicDraft/types";
import type { Column, FactValue, PinpointData } from "../app/pinpoint/data";

const OUT = path.resolve(__dirname, "../app/pinpoint/data");
const UA = "TopPicPinpointBot/1.0 (https://toppicgames.com; hello@toppicgames.com)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson(url: string, init: RequestInit = {}): Promise<any> {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers as object) } });
      if (res.status === 429 || res.status >= 500) { await sleep(3000 * (i + 1)); continue; }
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 90)}`);
      return await res.json();
    } catch (e) {
      if (i === 4) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const uniq = <T>(a: T[]) => [...new Set(a)];

// ---------------- Wikidata ----------------
type Ent = { id: string; labels?: { en?: { value: string } }; claims?: Record<string, any[]>; sitelinks?: Record<string, unknown> };
const entCache = new Map<string, Ent>();

/** Fetch entities into the cache. Linked values usually only need their label, which is far smaller than their claims. */
async function entities(ids: string[], withClaims = true): Promise<void> {
  const need = uniq(ids).filter((id) => /^Q\d+$/.test(id) && (!entCache.has(id) || (withClaims && !entCache.get(id)!.claims)));
  for (const part of chunk(need, 50)) {
    const d = await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&languages=en&props=labels${withClaims ? "|claims" : ""}&ids=${part.join("|")}`);
    for (const [id, e] of Object.entries<any>(d.entities ?? {})) entCache.set(id, e);
    await sleep(100);
  }
}
/** Fetch the labels of every value of the given properties on these entities. */
const labelsFor = (ents: (Ent | undefined)[], pids: string[]) => entities(ents.flatMap((e) => pids.flatMap((p) => allIds(e, p))), false);
const ent = (id: string) => entCache.get(id);
const label = (id: string) => ent(id)?.labels?.en?.value;

const statements = (e: Ent | undefined, pid: string): any[] => {
  const all: any[] = e?.claims?.[pid] ?? [];
  const pref = all.filter((c) => c.rank === "preferred");
  return (pref.length ? pref : all.filter((c) => c.rank !== "deprecated")).filter((c) => c.mainsnak?.snaktype === "value");
};
const ids = (e: Ent | undefined, pid: string): string[] => statements(e, pid).map((c) => c.mainsnak.datavalue?.value?.id).filter(Boolean);
/** Every non-deprecated value, for lists where "preferred" only marks the current one (a player's clubs). */
const allIds = (e: Ent | undefined, pid: string): string[] =>
  uniq((e?.claims?.[pid] ?? []).filter((c: any) => c.rank !== "deprecated").map((c: any) => c.mainsnak?.datavalue?.value?.id).filter(Boolean));
const years = (e: Ent | undefined, pid: string): number[] =>
  statements(e, pid).map((c) => c.mainsnak.datavalue?.value?.time as string | undefined).filter(Boolean).map((t) => parseInt(t!.slice(0, t!.indexOf("-", 1)), 10)).filter((y) => Number.isFinite(y));
const year = (e: Ent | undefined, pid: string) => { const y = years(e, pid); return y.length ? Math.min(...y) : undefined; };
/** A quantity, converted: `unit` maps Wikidata unit ids to a multiplier into the column's unit. */
function amount(e: Ent | undefined, pid: string, unit?: Record<string, number>): number | undefined {
  for (const c of statements(e, pid)) {
    const v = c.mainsnak.datavalue?.value;
    if (!v?.amount) continue;
    const u = String(v.unit ?? "").replace("http://www.wikidata.org/entity/", "");
    const n = Number(v.amount);
    if (!unit) return n;
    if (u in unit) return n * unit[u]!;
  }
  return undefined;
}
/** The latest value of a quantity that has point-in-time qualifiers (population, GDP). */
function latest(e: Ent | undefined, pid: string, unit?: string): number | undefined {
  const all: any[] = (e?.claims?.[pid] ?? []).filter((c: any) => c.rank !== "deprecated" && c.mainsnak?.datavalue && (!unit || String(c.mainsnak.datavalue.value.unit).endsWith(`/${unit}`)));
  if (!all.length) return undefined;
  const when = (c: any) => c.qualifiers?.P585?.[0]?.datavalue?.value?.time ?? "";
  all.sort((a, b) => (when(b) > when(a) ? 1 : -1));
  const pref = all.find((c) => c.rank === "preferred") ?? all[0];
  return Number(pref.mainsnak.datavalue.value.amount);
}

/** Resolve English Wikipedia titles to Wikidata ids (following redirects). */
async function qidsForTitles(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk(uniq(titles), 40)) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=${encodeURIComponent(part.join("|"))}`);
    const norm = new Map<string, string>();
    for (const n of d.query?.normalized ?? []) norm.set(n.from, n.to);
    for (const r of d.query?.redirects ?? []) norm.set(r.from, r.to);
    const byTitle = new Map<string, string>();
    for (const p of Object.values<any>(d.query?.pages ?? {})) if (p.pageprops?.wikibase_item) byTitle.set(p.title, p.pageprops.wikibase_item);
    for (const t of part) {
      let cur = t;
      for (let i = 0; i < 3 && norm.has(cur); i++) cur = norm.get(cur)!;
      const q = byTitle.get(cur);
      if (q) out.set(t, q);
    }
    await sleep(150);
  }
  return out;
}

/** The lead section (where the infobox lives) of each Wikipedia page. */
async function infoboxes(titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const part of chunk(uniq(titles), 20)) {
    const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(part.join("|"))}`);
    const back = new Map<string, string>();
    for (const r of [...(d.query?.normalized ?? []), ...(d.query?.redirects ?? [])]) back.set(r.to, back.get(r.from) ?? r.from);
    for (const pg of d.query?.pages ?? []) {
      const text: string = pg.revisions?.[0]?.slots?.main?.content ?? "";
      out.set(back.get(pg.title) ?? pg.title, text.split(/\n==[^=]/)[0]!);
    }
    await sleep(150);
  }
  return out;
}
/** One infobox field's raw value, e.g. "first" or "alliances". */
const field = (box: string | undefined, names: string[]) => {
  for (const n of names) {
    const m = box?.match(new RegExp(`(?:^|\\n)\\s*\\|\\s*${n}\\s*=([\\s\\S]*?)(?=\\n\\s*\\||\\n\\}\\})`, "i"));
    if (m && m[1]!.trim()) return m[1]!.replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, "").trim();
  }
  return undefined;
};
const firstYear = (v: string | undefined) => { const m = v?.match(/\b(1[89]\d\d|20[0-3]\d)\b/); return m ? Number(m[1]) : undefined; };
/** The targets of [[wiki links]] in a field, minus disambiguators: "[[Avengers (comics)|Avengers]]" gives "Avengers". */
const links = (v: string | undefined, max: number) =>
  uniq([...(v ?? "").matchAll(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g)].map((m) => (m[2] ?? m[1]!).replace(/\s*\([^)]*\)$/, "").trim()).filter((x) => x && !/^(File|Image|Category):/i.test(x))).slice(0, max);

async function searchTitle(q: string): Promise<string | undefined> {
  const d = await getJson(`https://en.wikipedia.org/w/api.php?action=query&format=json&list=search&srlimit=1&srsearch=${encodeURIComponent(q)}`);
  await sleep(100);
  return d.query?.search?.[0]?.title;
}

const DISAMBIG = "Q4167410";
const FICTIONAL = /character|fictional|superhero|supervillain|mutant|alien|deity|demon|robot|android|cyborg|mouse|duck|dog|cat|lion|princess|wizard|witch|jedi|sith|hedgehog|plumber|clone|kryptonian|amazon|vampire|monster/i;
/**
 * Map each pick to a Wikidata entity: try its candidate page titles in order, keeping the first page whose
 * "instance of" labels pass `ok` (so "Alien" lands on the film, not the disambiguation page or the creature).
 */
const titleOf = new Map<string, string>();
async function resolve(items: Item[], tries: (i: Item) => string[], ok: RegExp): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const all = items.map((i) => uniq(tries(i)));
  for (let round = 0; round < Math.max(...all.map((t) => t.length)); round++) {
    const left = items.map((it, k) => ({ it, t: all[k]![round] })).filter((x) => x.t && !out.has(x.it.id));
    if (!left.length) break;
    // A try starting with "?" is a search, standing in for the top result's title.
    for (const x of left) if (x.t!.startsWith("?")) x.t = (await searchTitle(x.t!.slice(1))) ?? "";
    const found = await qidsForTitles(left.map((x) => x.t!).filter(Boolean));
    await entities([...found.values()]);
    await labelsFor([...found.values()].map(ent), ["P31"]);
    for (const { it, t } of left) {
      const q = found.get(t!);
      if (!q) continue;
      const kinds = ids(ent(q), "P31");
      if (kinds.includes(DISAMBIG)) continue;
      if (kinds.length ? kinds.some((k) => ok.test(label(k) ?? "")) : ok.test("")) { out.set(it.id, q); titleOf.set(q, t!); }
    }
  }
  return out;
}

const clean = (s: string | undefined) => (s ?? "").replace(/^fictional /i, "").replace(/ character$/i, "").replace(/ organism$/i, "").replace(/ in the .*$/i, "").replace(/^(.)/, (c) => c.toUpperCase());
/** "horror film" and "crime television series" read better as "horror" and "crime". */
const genres = (qs: string[], max = 3) => uniq(labels(qs, 8).map((g) => g.replace(/\s+(film|television series|television drama|television program|TV series|music)$/i, "").trim())).slice(0, max);
const labels = (qs: string[], max = 4) => uniq(qs.map(label).filter((x): x is string => !!x && !/^Q\d+$/.test(x))).slice(0, max);
const GENDER: Record<string, string> = { Q6581097: "Male", Q6581072: "Female", Q48270: "Non-binary", Q1052281: "Female", Q2449503: "Male", Q15145778: "Male", Q15145779: "Female" };
const gender = (e: Ent | undefined) => { const g = ids(e, "P21").map((q) => GENDER[q] ?? label(q)).filter(Boolean)[0]; return g ? clean(g) : undefined; };
const CONTINENT_FIX: Record<string, string> = { "Insular Oceania": "Oceania", "Australian continent": "Oceania", "Australia": "Oceania" };
const continentOf = (country: string | undefined) => { const c = country ? labels(ids(ent(country), "P30"), 1)[0] : undefined; return c ? CONTINENT_FIX[c] ?? c : undefined; };

type Row = Record<string, FactValue | undefined>;
const tidy = (r: Row): Record<string, FactValue> =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "number" && !Number.isFinite(v)))) as Record<string, FactValue>;

// ---------------- topics ----------------
type Spec = { columns: Column[]; source: string; build: (items: Item[]) => Promise<Record<string, Record<string, FactValue>>> };
const wikiTitle = (i: Item) => (i.q?.startsWith("wiki:") ? i.q.slice(5) : i.name);

type Wiki = {
  /** Candidate Wikipedia titles, best first. */
  tries: (i: Item) => string[];
  /** What the entity must be an instance of. */
  ok: RegExp;
  /** Properties whose values are shown, so their labels are fetched. */
  pids: string[];
  /** Fetch anything else a row reads from linked entities (an author's country, a flag's colours). */
  prep?: (ents: Ent[]) => Promise<void>;
  row: (e: Ent, i: Item) => Row;
};
const fromWiki = (w: Wiki) => async (items: Item[]) => {
  const q = await resolve(items, w.tries, w.ok);
  const ents = [...q.values()].map(ent).filter(Boolean) as Ent[];
  await labelsFor(ents, w.pids);
  if (w.prep) await w.prep(ents);
  const out: Record<string, Record<string, FactValue>> = {};
  for (const i of items) {
    const e = ent(q.get(i.id) ?? "");
    if (e) out[i.id] = tidy(w.row(e, i));
  }
  return out;
};
const PERSON = /^human$/;
const COUNTRY = /country|state|kingdom|republic|monarchy|federation|island nation|territory/i;

const KG = { Q11570: 1, Q41803: 0.001 }, CM = { Q174728: 1, Q11573: 100, Q218593: 2.54 }, MIN = { Q7727: 1, Q11574: 1 / 60, Q25235: 60 }, KM2 = { Q712226: 1, Q25343: 1e-6 };
const USD = { Q4917: 1 };
const perPerson = (total?: number, people?: number) => (total && people ? Math.round(total / people) : undefined);
/** Flags name shades ("Old Glory Red", "Crimson"); the game compares plain colours. */
const BASIC: [RegExp, string][] = [[/red|crimson|scarlet|maroon|vermilion/i, "Red"], [/blue|azure|navy|ultramarine/i, "Blue"], [/green/i, "Green"], [/yellow|gold/i, "Yellow"], [/orange|saffron/i, "Orange"], [/white/i, "White"], [/black/i, "Black"]];
const basicColour = (c: string) => BASIC.find(([re]) => re.test(c))?.[1] ?? c.replace(/^(.)/, (x) => x.toUpperCase());

const SPECS: Record<string, Spec> = {
  films: {
    source: "Wikidata",
    columns: [
      { key: "year", label: "Released", kind: "num", close: 5, fmt: "year" },
      { key: "director", label: "Director", kind: "set" },
      { key: "genre", label: "Genre", kind: "set" },
      { key: "runtime", label: "Runtime", kind: "num", close: 15, fmt: "int", unit: "min" },
      { key: "country", label: "Country", kind: "cat" },
      { key: "box", label: "Box office", kind: "num", close: 0.35, rel: true, fmt: "big", unit: "$" },
    ],
    build: fromWiki({
      tries: (i) => [`${wikiTitle(i)} (film)`, wikiTitle(i), `?${wikiTitle(i)} film`], ok: /film/i, pids: ["P57", "P136", "P495"],
      row: (e) => ({ year: year(e, "P577"), director: labels(ids(e, "P57"), 2), genre: genres(ids(e, "P136")), runtime: amount(e, "P2047", MIN), country: labels(ids(e, "P495"), 1)[0], box: amount(e, "P2142", USD) }),
    }),
  },
  shows: {
    source: "Wikidata",
    columns: [
      { key: "start", label: "Premiered", kind: "num", close: 4, fmt: "year" },
      { key: "end", label: "Ended", kind: "num", close: 4, fmt: "year" },
      { key: "network", label: "Network", kind: "set" },
      { key: "genre", label: "Genre", kind: "set" },
      { key: "seasons", label: "Seasons", kind: "num", close: 2, fmt: "int" },
      { key: "country", label: "Country", kind: "cat" },
    ],
    build: fromWiki({
      tries: (i) => [`${wikiTitle(i)} (TV series)`, `${wikiTitle(i)} (American TV series)`, wikiTitle(i), `?${wikiTitle(i)} TV series`], ok: /television|series|sitcom|show|anime/i, pids: ["P449", "P136", "P495"],
      row: (e) => ({ start: year(e, "P580") ?? year(e, "P577"), end: year(e, "P582"), network: labels(ids(e, "P449"), 2), genre: genres(ids(e, "P136")), seasons: amount(e, "P2437"), country: labels(ids(e, "P495"), 1)[0] }),
    }),
  },
  books: {
    source: "Wikidata",
    columns: [
      { key: "author", label: "Author", kind: "cat" },
      { key: "year", label: "Published", kind: "num", close: 15, fmt: "year" },
      { key: "genre", label: "Genre", kind: "set" },
      { key: "language", label: "Language", kind: "cat" },
      { key: "nationality", label: "Author from", kind: "cat" },
    ],
    build: fromWiki({
      tries: (i) => [`${wikiTitle(i)} (novel)`, wikiTitle(i), `?${wikiTitle(i)} novel`], ok: /novel|book|literary|written work|poem|play|fiction|series|novella/i, pids: ["P136", "P407"],
      prep: async (ents) => { const authors = ents.flatMap((e) => ids(e, "P50")); await entities(authors); await labelsFor(authors.map(ent), ["P27"]); },
      row: (e) => {
        const author = ids(e, "P50")[0];
        return { author: author && label(author), year: year(e, "P577"), genre: genres(ids(e, "P136")), language: labels(ids(e, "P407"), 1)[0], nationality: author ? labels(ids(ent(author), "P27"), 1)[0] : undefined};
      },
    }),
  },
  music: {
    source: "Wikidata",
    columns: [
      { key: "kind", label: "Act", kind: "cat" },
      { key: "start", label: "Active from", kind: "num", close: 5, fmt: "year" },
      { key: "genre", label: "Genre", kind: "set" },
      { key: "country", label: "From", kind: "cat" },
      { key: "members", label: "Members", kind: "num", close: 1, fmt: "int" },
      { key: "label", label: "Record label", kind: "set" },
    ],
    build: fromWiki({
      tries: (i) => [wikiTitle(i), `${wikiTitle(i)} (band)`, `${wikiTitle(i)} (singer)`, `${wikiTitle(i)} (rapper)`, `?${wikiTitle(i)} musician`], ok: /^human$|band|group|duo|ensemble|musical/i,
      pids: ["P136", "P27", "P495", "P17", "P264"],
      row: (e) => {
        const person = ids(e, "P31").includes("Q5");
        return {
          kind: person ? "Solo artist" : "Group", start: year(e, "P2031") ?? (person ? undefined : year(e, "P571")), genre: genres(ids(e, "P136")),
          country: labels(person ? ids(e, "P27") : ids(e, "P495").length ? ids(e, "P495") : ids(e, "P17"), 1)[0], members: person ? 1 : ids(e, "P527").length || undefined, label: labels(ids(e, "P264"), 3),
        };
      },
    }),
  },
  history: {
    source: "Wikidata",
    columns: [
      { key: "born", label: "Born", kind: "num", close: 50, fmt: "year" },
      { key: "died", label: "Died", kind: "num", close: 50, fmt: "year" },
      { key: "age", label: "Lived to", kind: "num", close: 8, fmt: "int" },
      { key: "country", label: "Country", kind: "cat" },
      { key: "occupation", label: "Known as", kind: "set" },
      { key: "gender", label: "Gender", kind: "cat" },
    ],
    build: fromWiki({
      tries: (i) => [wikiTitle(i), `?${wikiTitle(i)}`], ok: PERSON, pids: ["P27", "P106", "P21"],
      row: (e) => {
        const b = year(e, "P569"), d = year(e, "P570");
        return { born: b, died: d, age: b != null && d != null ? d - b : undefined, country: labels(ids(e, "P27"), 1)[0], occupation: labels(ids(e, "P106"), 3), gender: gender(e) };
      },
    }),
  },
  football: {
    source: "Wikidata",
    columns: [
      { key: "nation", label: "Nation", kind: "cat" },
      { key: "position", label: "Position", kind: "set" },
      { key: "born", label: "Born", kind: "num", close: 4, fmt: "year" },
      { key: "height", label: "Height", kind: "num", close: 5, fmt: "int", unit: "cm" },
      { key: "clubs", label: "Clubs", kind: "set" },
    ],
    build: fromWiki({
      tries: (i) => [wikiTitle(i), `${wikiTitle(i)} (footballer)`, `?${wikiTitle(i)} footballer`], ok: PERSON, pids: ["P1532", "P27", "P413", "P54"],
      row: (e) => ({
        nation: labels(ids(e, "P1532"), 1)[0] ?? labels(ids(e, "P27"), 1)[0], position: labels(ids(e, "P413"), 2).map((p) => p.replace(/ \(association football\)/, "")), born: year(e, "P569"), height: amount(e, "P2048", CM),
        clubs: labels(allIds(e, "P54").filter((c) => !/national|olympic|under-\d+|U\d+/i.test(label(c) ?? "")), 8),
      }),
    }),
  },
  food: {
    source: "Wikidata",
    columns: [
      { key: "country", label: "From", kind: "cat" },
      { key: "continent", label: "Continent", kind: "cat" },
      { key: "type", label: "Type", kind: "set" },
      { key: "ingredients", label: "Made with", kind: "set" },
    ],
    build: fromWiki({
      tries: (i) => [wikiTitle(i), `${wikiTitle(i)} (food)`, `${wikiTitle(i)} (dish)`, `?${wikiTitle(i)} dish`], ok: /^/, pids: ["P279", "P527", "P186"],
      prep: async (ents) => { const cs = ents.flatMap((e) => ids(e, "P495")); await entities(cs); await labelsFor(cs.map(ent), ["P30"]); },
      row: (e) => {
        const c = ids(e, "P495")[0];
        return { country: c && label(c), continent: continentOf(c), type: labels(ids(e, "P279").length ? ids(e, "P279") : ids(e, "P31"), 2), ingredients: labels([...ids(e, "P527"), ...ids(e, "P186")], 5) };
      },
    }),
  },
  geography: {
    source: "Wikidata",
    columns: [
      { key: "continent", label: "Continent", kind: "cat" },
      { key: "population", label: "Population", kind: "num", close: 0.4, rel: true, fmt: "big" },
      { key: "area", label: "Area", kind: "num", close: 0.4, rel: true, fmt: "big", unit: "km²" },
      { key: "gdp", label: "GDP per person", kind: "num", close: 0.35, rel: true, fmt: "big", unit: "$" },
      { key: "language", label: "Language", kind: "set" },
      { key: "drives", label: "Drives on", kind: "cat" },
    ],
    build: fromWiki({
      tries: (i) => [i.name, `${i.name} (country)`], ok: COUNTRY, pids: ["P30", "P37", "P1622"],
      row: (e) => ({
        continent: continentOf(e.id), population: latest(e, "P1082"), area: amount(e, "P2046", KM2), gdp: perPerson(latest(e, "P2131", "Q4917"), latest(e, "P1082")), language: labels(ids(e, "P37"), 3), drives: labels(ids(e, "P1622"), 1)[0]?.replace(/^(.)/, (c) => c.toUpperCase()),
      }),
    }),
  },
  flags: {
    source: "Wikidata",
    columns: [
      { key: "continent", label: "Continent", kind: "cat" },
      { key: "colours", label: "Colours", kind: "set" },
      { key: "count", label: "No. of colours", kind: "num", close: 1, fmt: "int" },
      { key: "adopted", label: "Flag adopted", kind: "num", close: 20, fmt: "year" },
      { key: "population", label: "Population", kind: "num", close: 0.4, rel: true, fmt: "big" },
    ],
    build: fromWiki({
      tries: (i) => [i.name, `${i.name} (country)`], ok: COUNTRY, pids: ["P30"],
      prep: async (ents) => { const fl = ents.flatMap((e) => ids(e, "P163")); await entities(fl); await labelsFor(fl.map(ent), ["P462"]); },
      row: (e) => {
        const flag = ent(ids(e, "P163")[0] ?? "");
        const colours = uniq(labels(ids(flag, "P462"), 8).map(basicColour)).slice(0, 6);
        return { continent: continentOf(e.id), colours, count: colours.length || undefined, adopted: year(flag, "P571") ?? year(flag, "P580"), population: latest(e, "P1082") };
      },
    }),
  },
  nba: {
    source: "NBA catalog",
    columns: [
      { key: "position", label: "Position", kind: "cat" },
      { key: "height", label: "Height", kind: "num", close: 2, fmt: "int", unit: "in" },
      { key: "team", label: "Main team", kind: "cat" },
      { key: "debut", label: "Debut", kind: "num", close: 5, fmt: "year" },
      { key: "allStar", label: "All-Star picks", kind: "num", close: 3, fmt: "int" },
      { key: "college", label: "College", kind: "cat" },
    ],
    build: async (items) => Object.fromEntries(items.map((i) => [i.id, tidy({ position: i.facts?.pos, height: i.facts?.heightIn, team: i.facts?.team, debut: i.facts?.from, allStar: i.facts?.allStar ?? 0, college: i.facts?.college || undefined })])),
  },
  pokemon: {
    source: "PokéAPI",
    columns: [
      { key: "type", label: "Type", kind: "set" },
      { key: "generation", label: "Generation", kind: "num", close: 1, fmt: "int" },
      { key: "stage", label: "Evolution stage", kind: "num", close: 0, fmt: "int" },
      { key: "height", label: "Height", kind: "num", close: 0.5, fmt: "dec1", unit: "m" },
      { key: "weight", label: "Weight", kind: "num", close: 0.35, rel: true, fmt: "dec1", unit: "kg" },
      { key: "color", label: "Colour", kind: "cat" },
      { key: "legendary", label: "Class", kind: "cat" },
    ],
    build: async (items) => {
      const out: Record<string, Record<string, FactValue>> = {};
      for (const i of items) {
        const slug = i.name.toLowerCase().replace(/[.'’]/g, "").replace(/\s+/g, "-").replace("♀", "-f").replace("♂", "-m");
        try {
          const [mon, sp] = await Promise.all([getJson(`https://pokeapi.co/api/v2/pokemon/${slug}`), getJson(`https://pokeapi.co/api/v2/pokemon-species/${slug}`)]);
          let stage = 1;
          if (sp.evolves_from_species) { stage = 2; const prev = await getJson(sp.evolves_from_species.url); if (prev.evolves_from_species) stage = 3; }
          const gen = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix"].indexOf(String(sp.generation?.name).replace("generation-", "")) + 1;
          const t = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
          out[i.id] = tidy({ type: mon.types.map((x: any) => t(x.type.name)), generation: gen || undefined, stage, height: mon.height / 10, weight: mon.weight / 10, color: t(sp.color?.name ?? ""), legendary: sp.is_legendary ? "Legendary" : sp.is_mythical ? "Mythical" : "Regular" });
        } catch (e) {
          console.warn("  pokemon miss", i.name, (e as Error).message);
        }
        await sleep(100);
      }
      return out;
    },
  },
  anime: {
    source: "AniList",
    columns: [
      { key: "series", label: "Series", kind: "cat" },
      { key: "debut", label: "Debut", kind: "num", close: 5, fmt: "year" },
      { key: "gender", label: "Gender", kind: "cat" },
      { key: "studio", label: "Studio", kind: "cat" },
      { key: "favourites", label: "Fan favourites", kind: "num", close: 0.4, rel: true, fmt: "big" },
    ],
    build: async (items) => {
      const out: Record<string, Record<string, FactValue>> = {};
      const query = `query($s:String){Character(search:$s){name{full} gender favourites media(sort:START_DATE,type:ANIME,perPage:10){nodes{title{english romaji} startDate{year} studios(isMain:true){nodes{name}}}}}}`;
      const ask = (name: string) => getJson("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { s: name } }) }).catch(() => null);
      for (const i of items) {
        try {
          // "Deku (Izuku Midoriya)": try the name, then the part in brackets. AniList answers 404 when nothing matches.
          const bare = i.name.replace(/\s*\(.*\)\s*/, "");
          const names = uniq([bare, i.name.match(/\((.*)\)/)?.[1], bare.split(" ").reverse().join(" "), bare.split(" ")[0]].filter((x): x is string => !!x));
          // Only trust a match that appears in the pick's own series (a bare "Yuji" finds someone else).
          const word = (i.universe ?? "").toLowerCase().split(/\W+/).find((w) => w.length > 3) ?? "";
          const inSeries = (c: any) => !word || (c?.media?.nodes ?? []).some((m: any) => `${m.title?.english ?? ""} ${m.title?.romaji ?? ""}`.toLowerCase().includes(word));
          let d: any = null;
          for (const n of names) { d = await ask(n); if (d?.data?.Character && inSeries(d.data.Character)) break; d = null; await sleep(800); }
          const c = d?.data?.Character;
          if (!c) throw new Error("not on AniList");
          const media = (c?.media?.nodes ?? []).filter((m: any) => m.startDate?.year);
          const first = media[0];
          out[i.id] = tidy({ series: i.universe, debut: first?.startDate?.year, gender: c?.gender ?? undefined, studio: first?.studios?.nodes?.[0]?.name, favourites: c?.favourites });
        } catch (e) {
          console.warn("  anime miss", i.name, (e as Error).message);
        }
        await sleep(800); // AniList allows ~90 requests a minute
      }
      return out;
    },
  },
};

// Characters (comics, games, Disney, films) share one set of columns from Wikidata, with race and alignment
// from the Superhero API where it knows the character.
const CHARACTER_COLUMNS: Column[] = [
  { key: "universe", label: "Universe", kind: "cat" },
  { key: "debut", label: "First appeared", kind: "num", close: 8, fmt: "year" },
  { key: "creator", label: "Created by", kind: "set" },
  { key: "species", label: "Species", kind: "cat" },
  { key: "gender", label: "Gender", kind: "cat" },
  { key: "side", label: "Side", kind: "cat" },
  { key: "teams", label: "Teams", kind: "set" },
];
let heroIndex: Map<string, any[]> | null = null;
async function heroes() {
  if (!heroIndex) {
    const all = await getJson("https://akabab.github.io/superhero-api/api/all.json");
    heroIndex = new Map();
    for (const h of all) heroIndex.set(h.name.toLowerCase(), [...(heroIndex.get(h.name.toLowerCase()) ?? []), h]);
  }
  return heroIndex;
}
const characterSpec = (hint: (i: Item) => string[], universe: (i: Item, e?: Ent) => string | undefined = (i) => i.universe): Spec => ({
  source: "Wikidata and the Superhero API",
  columns: CHARACTER_COLUMNS,
  build: async (items) => {
    const q = await resolve(items, (i) => [...hint(i), `${i.name} (character)`, i.name], FICTIONAL);
    const ents = [...q.values()].map((x) => ent(x)!);
    await labelsFor(ents, ["P170", "P21", "P2563", "P8345", "P1080"]);
    await entities(ents.flatMap((e) => ids(e, "P4584"))); // first-appearance works, for their release year
    const boxes = await infoboxes([...q.values()].map((x) => titleOf.get(x)!).filter(Boolean));
    const idx = await heroes();
    const out: Record<string, Record<string, FactValue>> = {};
    for (const i of items) {
      const e = ent(q.get(i.id) ?? "");
      // The Superhero API has duplicate names (two Batmen); only trust a name it has exactly once.
      const hits = idx.get(i.name.toLowerCase()) ?? [];
      const h = hits.length === 1 ? hits[0] : undefined;
      const races = uniq(hits.map((x) => x.appearance?.race).filter((r) => r && r !== "null"));
      const firstWork = ids(e, "P4584")[0];
      const box = boxes.get(titleOf.get(e?.id ?? "") ?? "");
      // The infobox's "first appearance" line carries a date far more often than Wikidata does.
      const debut = firstYear(field(box, ["first", "first_appearance", "first_game", "debut"])) ?? (firstWork ? year(ent(firstWork), "P577") ?? year(ent(firstWork), "P571") : undefined);
      const creators = labels(ids(e, "P170"), 3);
      const kinds = ids(e, "P31").map(label).filter((x): x is string => !!x);
      // Duplicate names are fine for species when every entry agrees (both Batmen are human).
      const species = races.length === 1 ? races[0] : clean(kinds.find((k) => !/human|character|superhero|supervillain|protagonist|mascot|persona|work of fiction|literary|comics|mutant|wikimedia/i.test(k)) ?? (kinds.some((k) => /human|persona/i.test(k)) ? "Human" : kinds.some((k) => /mutant/i.test(k)) ? "Mutant" : undefined));
      const side = h?.biography?.alignment === "good" ? "Hero" : h?.biography?.alignment === "bad" ? "Villain" : i.tags.includes("villain") ? "Villain" : i.tags.includes("hero") ? "Hero" : undefined;
      out[i.id] = tidy({
        universe: universe(i, e), debut, creator: creators.length ? creators : links(field(box, ["creator", "created_by", "designer"]), 3), species: species || undefined, gender: gender(e) ?? (h?.appearance?.gender && h.appearance.gender !== "-" ? h.appearance.gender : undefined), side,
        teams: links(field(box, ["alliances", "affiliation", "affiliations"]), 4),
      });
    }
    return out;
  },
});
SPECS.superheroes = characterSpec((i) => [`${i.name} (${i.universe} Comics)`, `${i.name} (comics)`]);
// Comic villains need "(comics)" to skip films; the rest (Sauron, Voldemort) are best found by name, before Marvel's namesakes.
SPECS.villains = characterSpec((i) => (/^(Marvel|DC)$/.test(i.universe) ? [`${i.name} (${i.universe} Comics)`, `${i.name} (comics)`] : [i.name, `${i.name} (${i.universe})`]));
SPECS.videogames = characterSpec((i) => [`${i.name} (${i.universe})`, `${i.name} (video game character)`, `${i.name} (franchise)`]);
SPECS.disney = characterSpec((i) => [`${i.name} (Disney)`, `${i.name} (Disney character)`, `${i.name} (Frozen)`]);
SPECS.movies = characterSpec((i) => [`${i.name} (character)`, `${i.name} (film character)`], (i, e) => labels([...ids(e, "P8345"), ...ids(e, "P1080")], 1)[0] ?? i.universe);

async function main() {
  const want = process.argv.slice(2);
  const pools = want.length ? want : Object.keys(SPECS);
  fs.mkdirSync(OUT, { recursive: true });
  for (const pool of pools) {
    const spec = SPECS[pool];
    if (!spec) { console.warn(`no spec for ${pool}`); continue; }
    const items = getCatalog(pool);
    process.stdout.write(`${pool.padEnd(12)} ${items.length} picks… `);
    const raw = await spec.build(items);
    // Keep columns most picks have, then picks that fill most of those columns, so every row reads well.
    // A column where every pick has the same value (every villain is a villain) tells the player nothing.
    const columns = spec.columns.filter((c) => {
      const vals = Object.values(raw).map((f) => f[c.key]).filter((v) => v !== undefined);
      return vals.length >= items.length * 0.5 && new Set(vals.map((v) => JSON.stringify(v))).size > 1;
    });
    const facts = Object.fromEntries(Object.entries(raw)
      .filter(([, f]) => columns.filter((c) => f[c.key] !== undefined).length >= Math.ceil(columns.length * 0.6))
      .map(([id, f]) => [id, Object.fromEntries(columns.filter((c) => f[c.key] !== undefined).map((c) => [c.key, f[c.key]!]))]));
    const dropped = spec.columns.filter((c) => !columns.includes(c)).map((c) => c.key);
    const data: PinpointData = { pool, source: spec.source, columns, facts };
    fs.writeFileSync(path.join(OUT, `${pool}.json`), JSON.stringify(data, null, 1) + "\n");
    const filled = columns.map((c) => `${c.key} ${Object.values(facts).filter((f) => f[c.key] !== undefined).length}`);
    console.log(`${Object.keys(facts).length} kept · ${filled.join(", ")}${dropped.length ? ` · dropped ${dropped.join(", ")}` : ""}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
