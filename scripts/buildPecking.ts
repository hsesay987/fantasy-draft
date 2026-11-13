// Builds app/topicDraft/pecking/data/<id>.json (complete ranked lists for Pecking Order) and
// app/topicDraft/pecking/meta.ts (their metadata only, safe for room screens to import).
// Every list is complete for what it covers, so ranks match the real world; ties share a rank (1, 2, 2, 4).
// Run: npx tsx scripts/buildPecking.ts [id ...]   (no ids = every list)
//
// Sources and the choices behind them:
// - Countries: the 193 UN members come from Wikidata SPARQL (sovereign states with a current "member of: United
//   Nations", P463=Q1065, statement and no dissolution date), with English official names (P1448) as aliases.
//   Their figures do NOT come from Wikidata: its population statements mix census years (India's preferred
//   value was 1.33 billion, behind China), GDP per person is missing for ten members (Canada among them), and
//   area has outright errors (Bosnia and Herzegovina at 10 km²). Each list instead reads one consistent
//   Wikipedia table, matched to the members by name or alias (the build fails if any member is missed):
//     countries-population: "List of countries by population (United Nations)", newest UN WPP estimate;
//     countries-area: "List of countries and dependencies by area", total area;
//     countries-gdp: "List of countries by GDP (nominal) per capita", the design's "GDP per person":
//       IMF, else World Bank, else UN (only the UN covers North Korea).
//   Denmark and the Netherlands are UN members as kingdoms; they are named, and read, as the country proper.
// - cities: Wikidata city population mixes city proper, municipality and metro definitions (Chongqing would
//   rank first at 32 million), so it isn't clean. The list instead uses the UN World Urbanization Prospects 2025
//   estimate column of Wikipedia's "List of largest cities", one consistent definition. That table has 85
//   cities, not 100.
// - films-boxoffice: Wikidata box office (P2142) mixes domestic, worldwide and per-release figures. Wikipedia's
//   "List of highest-grossing films" is clean but only ranks the top 50, so the list is the top 50.
// - buildings, rivers, mountains: Wikidata heights, lengths and elevations are messy (antenna vs roof heights,
//   unfinished towers, river sections, subsidiary summits), so these come from the curated Wikipedia lists:
//   "List of tallest buildings" (architectural height, the 98 completed buildings of 350 m+ in its main table),
//   "List of river systems by length" (top 100, named by the system's main river, first figure of a range)
//   and "List of highest mountains on Earth" (top 100, peaks with 500 m+ prominence).
// - nba-points: the NBA catalog has no career totals, so career points come from Wikipedia's
//   "List of NBA career scoring leaders", which ranks the top 50 (not 100).
// - pokemon-bst: PokéAPI, every species' default form, base stat total.
import fs from "node:fs";
import path from "node:path";
import type { PeckItem, PeckList } from "../app/topicDraft/pecking/lists";

const ROOT = path.resolve(__dirname, "../app/topicDraft/pecking");
const OUT = path.join(ROOT, "data");
const UA = "TopPicPeckingBot/1.0 (https://toppicgames.com; hello@toppicgames.com)";
const TODAY = new Date().toISOString().slice(0, 10);
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
  throw new Error(`gave up on ${url.slice(0, 90)}`);
}
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const uniq = <T>(a: T[]) => [...new Set(a)];

// ---------------- Wikidata ----------------
async function sparql(query: string): Promise<any[]> {
  const d = await getJson(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, { headers: { Accept: "application/sparql-results+json" } });
  await sleep(500);
  return d.results.bindings;
}

// ---------------- Wikipedia tables ----------------
type Cell = { text: string; links: string[] };
const decode = (s: string) => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const strip = (h: string) => decode(h.replace(/<sup[\s\S]*?<\/sup>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
/** The rows of every "wikitable" on a Wikipedia page, rowspans filled in. */
async function wikiTables(page: string): Promise<Cell[][][]> {
  const d = await getJson(`https://en.wikipedia.org/w/api.php?action=parse&format=json&formatversion=2&prop=text&redirects=1&page=${encodeURIComponent(page)}`);
  const html: string = d.parse.text;
  return [...html.matchAll(/<table[^>]*wikitable[\s\S]*?<\/table>/g)].map((t) => {
    const out: Cell[][] = [];
    const carry: { cell: Cell; left: number }[] = [];
    for (const tr of t[0].matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const row: Cell[] = [];
      const cells = [...tr[0].matchAll(/<t[dh]([^>]*)>([\s\S]*?)(?=<t[dh][\s>]|<\/tr>)/g)];
      let col = 0;
      const fill = () => { while (carry[col]?.left) { row.push(carry[col]!.cell); carry[col]!.left--; col++; } };
      for (const c of cells) {
        fill();
        const cell: Cell = { text: strip(c[2]!), links: [...c[2]!.matchAll(/<a [^>]*href="\/wiki\/[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => strip(m[1]!)).filter(Boolean) };
        const span = Number(c[1]!.match(/rowspan="?(\d+)/)?.[1] ?? 1);
        const cols = Number(c[1]!.match(/colspan="?(\d+)/)?.[1] ?? 1);
        for (let k = 0; k < cols; k++) { row.push(cell); carry[col] = { cell, left: span - 1 }; col++; }
      }
      fill();
      out.push(row);
    }
    return out;
  });
}
/** The first number in a cell: "6,650 (7,088)" gives 6650. */
const num = (s: string | undefined) => { const m = s?.replace(/,/g, "").match(/\d+(?:\.\d+)?/); return m ? Number(m[0]) : NaN; };
const colOf = (header: Cell[], re: RegExp) => header.findIndex((c) => re.test(c.text));

// ---------------- ranking ----------------
type Raw = { name: string; value: number; aliases?: string[] };
type Spec = { title: string; stat: string; unit?: string; fmt?: PeckList["fmt"]; source: string; top?: number; round?: (v: number) => number; build: () => Promise<Raw[]> };

function rank(spec: Spec, raw: Raw[]): PeckItem[] {
  const seen = new Set<string>();
  const rows = raw
    .map((r) => ({ ...r, name: r.name.trim(), value: spec.round ? spec.round(r.value) : r.value }))
    .filter((r) => r.name && Number.isFinite(r.value) && r.value > 0)
    .sort((a, b) => b.value - a.value)
    .filter((r) => { const k = norm(r.name); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, spec.top ?? Infinity);
  return rows.map((r) => {
    const keys = new Set([norm(r.name)]);
    const aliases = (r.aliases ?? []).map((a) => a.trim()).filter((a) => { const k = norm(a); if (!k || keys.has(k)) return false; keys.add(k); return true; });
    const item: PeckItem = { name: r.name, value: r.value, rank: 1 + rows.filter((o) => o.value > r.value).length };
    if (aliases.length) item.aliases = aliases;
    return item;
  });
}
// The same normalisation as lists.ts; kept here so the script doesn't need the data it is writing.
const norm = (t: string) => t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/♀/g, " f").replace(/♂/g, " m").replace(/&/g, " and ").trim().replace(/^the\s+/, "").replace(/[^a-z0-9]+/g, "");

// ---------------- countries ----------------
const NAME_FIX: Record<string, [string, ...string[]]> = {
  "People's Republic of China": ["China", "People's Republic of China", "PRC"],
  "Kingdom of Denmark": ["Denmark", "Kingdom of Denmark"],
  "Kingdom of the Netherlands": ["Netherlands", "Holland", "Kingdom of the Netherlands"],
  "Federated States of Micronesia": ["Micronesia", "Federated States of Micronesia"],
};
const EXTRA_ALIASES: Record<string, string[]> = {
  "United States": ["USA", "US", "United States of America", "America"],
  "United Kingdom": ["UK", "Britain", "Great Britain"],
  "Ivory Coast": ["Côte d'Ivoire"],
  "Czech Republic": ["Czechia"],
  "Timor-Leste": ["East Timor"],
  "Eswatini": ["Swaziland"],
  "Myanmar": ["Burma"],
  "North Macedonia": ["Macedonia"],
  "Cape Verde": ["Cabo Verde"],
  "Democratic Republic of the Congo": ["DR Congo", "DRC", "Congo-Kinshasa"],
  "Republic of the Congo": ["Congo-Brazzaville", "Congo"],
  "Turkey": ["Türkiye"],
  "United Arab Emirates": ["UAE"],
  "São Tomé and Príncipe": ["Sao Tome"],
  "Saint Kitts and Nevis": ["St Kitts and Nevis"],
  "Saint Lucia": ["St Lucia"],
  "Saint Vincent and the Grenadines": ["St Vincent and the Grenadines"],
  "Bosnia and Herzegovina": ["Bosnia"],
  "South Korea": ["Republic of Korea"],
  "North Korea": ["DPRK"],
};
// Denmark and the Netherlands are UN members as kingdoms; NAME_FIX names them for the country proper, which the
// tables list on its own row (Greenland and the Caribbean islands are separate rows).
let unCache: { name: string; aliases: string[] }[] | undefined;
async function unMembers() {
  if (unCache) return unCache;
  const rows = await sparql(`SELECT ?c ?cLabel (GROUP_CONCAT(DISTINCT ?official; separator="|") AS ?officials) WHERE {
    ?c p:P463 ?st . ?st ps:P463 wd:Q1065 . FILTER NOT EXISTS { ?st pq:P582 ?end }
    FILTER NOT EXISTS { ?c wdt:P576 ?gone } ?c wdt:P31 wd:Q3624078 .
    OPTIONAL { ?c wdt:P1448 ?official . FILTER(LANG(?official) = "en") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". ?c rdfs:label ?cLabel . } } GROUP BY ?c ?cLabel`);
  unCache = rows.map((r) => {
    const label: string = r.cLabel.value;
    const [name, ...fixAliases] = NAME_FIX[label] ?? [label];
    const officials = String(r.officials?.value ?? "").split("|").filter(Boolean);
    return { name, aliases: [...fixAliases, ...(EXTRA_ALIASES[name] ?? []), ...officials] };
  });
  if (unCache.length !== 193) throw new Error(`expected 193 UN members, got ${unCache.length}`);
  return unCache;
}
/** A country list from a Wikipedia table: `value` reads a row's figure (NaN if it has none). */
const countryTable = (page: string, value: (header: Cell[], row: Cell[]) => number) => async (): Promise<Raw[]> => {
  const all = await unMembers();
  const t = (await wikiTables(page)).sort((a, b) => b.length - a.length)[0]!;
  const byName = new Map<string, number>();
  const nc = Math.max(0, colOf(t[0]!, /^Country/));
  for (const r of t.slice(1)) {
    const v = value(t[0]!, r);
    for (const n of [r[nc]?.links[0], r[nc]?.text.replace(/\s*[\[(*†].*$/, "")]) if (n && Number.isFinite(v) && !byName.has(norm(n))) byName.set(norm(n), v);
  }
  return complete(all.map((c) => ({ name: c.name, aliases: c.aliases, value: [c.name, ...c.aliases].map((n) => byName.get(norm(n))).find((v) => v !== undefined) ?? NaN })));
};
const complete = (out: Raw[]) => {
  const miss = out.filter((r) => !Number.isFinite(r.value)).map((r) => r.name);
  if (miss.length) throw new Error(`no value for ${miss.join(", ")}`);
  return out;
};

// Rivers whose list name isn't the one people know.
const RIVER_FIX: Record<string, string[]> = {
  "Shatt al-Arab": ["Euphrates", "Shatt al-Arab"],
  "Padma-Ganges-Alaknanda": ["Ganges", "Padma", "Ganga"],
  "Kura/Mt'k'vari": ["Kura", "Mtkvari"],
  "Red": ["Red River", "Red"],
  "Irrawaddy River": ["Irrawaddy", "Ayeyarwady"],
  "Río de la Plata": ["Río de la Plata", "Paraná", "River Plate"],
};
/** Parenthesised notes in the river list that say where it is, not what else it's called. */
const NOT_ALIASES = new Set(["USA", "western U.S.", "Great Lakes"]);

// ---------------- the lists ----------------
const SPECS: Record<string, Spec> = {
  "countries-population": {
    title: "Countries by population", stat: "Population", fmt: "big", source: "Wikipedia: List of countries by population (United Nations)",
    // The newest column of UN World Population Prospects estimates.
    build: countryTable("List of countries by population (United Nations)", (h, r) => {
      const cols = h.map((c, i) => [i, c.text.match(/Population \(.*?(\d{4})\)/)?.[1]] as const).filter(([, y]) => y).sort((a, b) => Number(b[1]) - Number(a[1]));
      return num(r[cols[0]![0]]?.text);
    }),
  },
  "countries-area": {
    title: "Countries by area", stat: "Area", unit: "km²", fmt: "int", source: "Wikipedia: List of countries and dependencies by area", round: Math.round,
    build: countryTable("List of countries and dependencies by area", (h, r) => num(r[colOf(h, /^Total/)]?.text)),
  },
  "countries-gdp": {
    title: "Countries by GDP per person", stat: "GDP per person", unit: "US$", fmt: "int", source: "Wikipedia: List of countries by GDP (nominal) per capita (IMF, else World Bank, else UN)", round: Math.round,
    build: countryTable("List of countries by GDP (nominal) per capita", (h, r) => {
      for (const re of [/^IMF/, /^World Bank/, /^United Nations/]) { const v = num(r[colOf(h, re)]?.text); if (Number.isFinite(v)) return v; }
      return NaN;
    }),
  },
  cities: {
    title: "Most populous cities", stat: "Population (UN 2025 estimate)", fmt: "big", source: "Wikipedia: List of largest cities (UN World Urbanization Prospects 2025)", round: Math.round,
    build: async () => {
      const [t] = (await wikiTables("List of largest cities")).filter((t) => t[0]?.some((c) => /UN 2025/.test(c.text)));
      if (!t) throw new Error("no UN 2025 table");
      const v = colOf(t[0]!, /UN 2025/);
      return t.slice(2).map((r) => ({ name: r[0]?.links[0] ?? r[0]?.text ?? "", value: num(r[v]?.text) }));
    },
  },
  "films-boxoffice": {
    title: "Highest-grossing films", stat: "Worldwide box office", unit: "US$", fmt: "big", source: "Wikipedia: List of highest-grossing films",
    build: async () => {
      const t = (await wikiTables("List of highest-grossing films"))[0]!;
      const name = colOf(t[0]!, /^Title/), v = colOf(t[0]!, /Worldwide gross/);
      return t.slice(1).map((r) => {
        const title = (r[name]?.links[0] ?? r[name]!.text).replace(/[†‡*]/g, "").trim();
        return { name: title, value: num(r[v]?.text) };
      });
    },
  },
  buildings: {
    title: "Tallest buildings", stat: "Height", unit: "m", fmt: "dec", source: "Wikipedia: List of tallest buildings", top: 100,
    round: (v) => Math.round(v * 10) / 10,
    build: async () => {
      const t = (await wikiTables("List of tallest buildings")).find((t) => t.length > 50 && t[0]?.some((c) => c.text === "Name"))!;
      // Two header rows ("Height" then "m | ft"); the name is the second column and metres the third.
      return t.slice(2).filter((r) => /^\d+$/.test(r[0]?.text ?? "")).map((r) => ({ name: r[1]!.links[0] ?? r[1]!.text, value: num(r[2]?.text) }));
    },
  },
  "nba-points": {
    title: "NBA all-time scoring", stat: "Career points", unit: "pts", fmt: "int", source: "Wikipedia: List of NBA career scoring leaders",
    build: async () => {
      const t = (await wikiTables("List of NBA career scoring leaders")).find((t) => t[0]?.some((c) => c.text === "Total points"))!;
      const p = colOf(t[0]!, /^Player/), v = colOf(t[0]!, /^Total points/);
      return t.slice(1).map((r) => ({ name: (r[p]?.links[0] ?? r[p]!.text).replace(/[\^*†]/g, "").trim(), value: num(r[v]?.text) }));
    },
  },
  "pokemon-bst": {
    title: "Pokémon by base stat total", stat: "Base stat total", fmt: "int", source: "PokéAPI",
    build: async () => {
      const { count } = await getJson("https://pokeapi.co/api/v2/pokemon-species?limit=1");
      const out: Raw[] = [];
      for (const part of chunk(Array.from({ length: count }, (_, i) => i + 1), 8)) {
        out.push(...(await Promise.all(part.map(async (id) => {
          const [sp, mon] = await Promise.all([getJson(`https://pokeapi.co/api/v2/pokemon-species/${id}`), getJson(`https://pokeapi.co/api/v2/pokemon/${id}`)]);
          const name = sp.names.find((n: any) => n.language.name === "en")?.name ?? sp.name;
          return { name, value: mon.stats.reduce((s: number, x: any) => s + x.base_stat, 0) };
        }))));
        await sleep(100);
      }
      return out;
    },
  },
  rivers: {
    title: "Longest rivers", stat: "Length", unit: "km", fmt: "int", source: "Wikipedia: List of river systems by length", top: 100,
    build: async () => {
      const t = (await wikiTables("List of river systems by length")).find((t) => t[0]?.some((c) => /^Length \(km\)/.test(c.text)))!;
      const n = colOf(t[0]!, /^River/), v = colOf(t[0]!, /^Length \(km\)/);
      // "Nile–White Nile–Kagera…" is the Nile's system: the name is its first river; a trailing "(Huang He)" is an alias.
      return t.slice(1).map((r) => {
        const text = r[n]!.text;
        const paren = text.match(/\(([^)]+)\)\s*$/)?.[1];
        const first = text.replace(/\s*\([^)]*\)\s*$/, "").split(/[–—]/)[0]!;
        const fix = RIVER_FIX[first];
        const name = fix?.[0] ?? first.split(/-(?=\p{Lu})/u)[0]!.trim();
        return { name, value: num(r[v]?.text), aliases: [...(fix?.slice(1) ?? []), ...(paren && !NOT_ALIASES.has(paren) ? paren.split(/,\s*/) : [])] };
      });
    },
  },
  mountains: {
    title: "Highest mountains", stat: "Height", unit: "m", fmt: "int", source: "Wikipedia: List of highest mountains on Earth", top: 100,
    build: async () => {
      const t = (await wikiTables("List of highest mountains on Earth"))[0]!;
      const n = colOf(t[0]!, /^Mountain/), v = colOf(t[0]!, /^Height/);
      return t.slice(1).map((r) => {
        const [name, ...aliases] = r[n]!.links.length ? r[n]!.links : [r[n]!.text];
        return { name: name!, aliases, value: num(r[v]?.text) };
      });
    },
  },
};
const ORDER = Object.keys(SPECS);

function writeMeta() {
  const lists = ORDER.filter((id) => fs.existsSync(path.join(OUT, `${id}.json`))).map((id) => JSON.parse(fs.readFileSync(path.join(OUT, `${id}.json`), "utf8")) as PeckList);
  const meta = lists.map((l) => ({ id: l.id, title: l.title, stat: l.stat, size: l.items.length, source: l.source, asOf: l.asOf }));
  const body = `// Written by scripts/buildPecking.ts. List metadata only: no items, so room screens can import it.\n` +
    `export type PeckMeta = { id: string; title: string; stat: string; size: number; source: string; asOf: string };\n\n` +
    `export const PECKING_META: PeckMeta[] = [\n${meta.map((m) => `  ${JSON.stringify(m)},`).join("\n")}\n];\n`;
  fs.writeFileSync(path.join(ROOT, "meta.ts"), body);
}

async function main() {
  const want = process.argv.slice(2);
  const ids = want.length ? want : ORDER;
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    const spec = SPECS[id];
    if (!spec) { console.warn(`no spec for ${id}`); continue; }
    process.stdout.write(`${id.padEnd(22)} `);
    const items = rank(spec, await spec.build());
    const list: PeckList = { id, title: spec.title, stat: spec.stat, ...(spec.unit ? { unit: spec.unit } : {}), ...(spec.fmt ? { fmt: spec.fmt } : {}), source: spec.source, asOf: TODAY, items };
    // One item per line keeps diffs readable without pretty-printing every field.
    const { items: _, ...head } = list;
    const json = `${JSON.stringify(head).slice(0, -1)},"items":[\n${items.map((i) => JSON.stringify(i)).join(",\n")}\n]}\n`;
    fs.writeFileSync(path.join(OUT, `${id}.json`), json);
    console.log(`${items.length} items · top: ${items.slice(0, 3).map((i) => `${i.name} ${i.value}`).join(", ")} · last: ${items.at(-1)?.name} ${items.at(-1)?.value}`);
  }
  writeMeta();
}

main().catch((e) => { console.error(e); process.exit(1); });
