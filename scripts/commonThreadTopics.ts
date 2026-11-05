// What each Common Thread topic pulls and which facts become categories. Only facts the sources hold are used.
import type { Row } from "../backend/src/trivia/wikidata";

export type Entity = { id: string; name: string; q?: string; fame: number; facts: Record<string, Set<string>> };
export type FactSpec = {
  /** The kind of fact. The wrong options mix kinds. */
  kind: string;
  /** SPARQL path from ?item, for example "wdt:P57". */
  path: string;
  /** item: the linked item's English label. decade, century, year: the earliest year in a date. */
  as: "item" | "decade" | "century" | "year";
  /** Plain wording of the category. Return null to skip the value. */
  label: (v: string) => string | null;
  /** Skip values whose label matches. */
  skip?: RegExp;
  /** Only count an entity that has exactly one value (co-productions and multilingual works are not clean answers). */
  single?: boolean;
  /** Extra SPARQL pattern about ?v, for example to keep only NBA teams. */
  extra?: string;
};
export type WdSpec = {
  /** SPARQL pattern binding ?item. A list runs one query per entry. */
  where: string | string[];
  minSitelinks: number;
  limit: number;
  facts: FactSpec[];
  /** Drop entities whose English name fails this before any facts are fetched (keeps big fact queries small). */
  keep?: (name: string) => boolean;
};
export type Ctx = {
  ask: (q: string) => Promise<Row[]>;
  fetchJson: <T = any>(url: string, init?: RequestInit) => Promise<T>;
  wikidataPool: (spec: WdSpec) => Promise<Entity[]>;
};
export type CustomSpec = { load: (ctx: Ctx) => Promise<Entity[]> };
export type Spec = WdSpec | CustomSpec;

// ---------------- wording helpers ----------------
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const THE = /^(United States|United Kingdom|Netherlands|Philippines|Czech Republic|Bahamas|Gambia|Soviet Union|People's Republic of China|Democratic Republic|Republic of the Congo|United Arab Emirates|Central African Republic|Maldives|Seychelles|Comoros|Marshall Islands|Solomon Islands|Cayman Islands|Faroe Islands|Cook Islands)/;
export const place = (v: string) => {
  const n = v.replace(/^United States of America$/, "United States").replace(/^People's Republic of China$/, "China").replace(/^Kingdom of the Netherlands$/, "Netherlands");
  return THE.test(n) ? `the ${n}` : n;
};
const noSuffix = (s: string, re: RegExp) => s.replace(re, "").trim();
const FILM_SUFFIX = /\s+(film|films|movie)$/i;
const genreOf = (suffix: string, drop: RegExp) => (v: string) => {
  const g = noSuffix(v, drop);
  return g && g.length > 2 ? `${cap(g)} ${suffix}` : null;
};
const decade = (verb: string) => (v: string) => `${verb} in the ${v}s`;
const century = (verb: string) => (v: string) => {
  const n = Number(v);
  const sfx = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${verb} in the ${n}${sfx} century`;
};
const f = (kind: string, path: string, label: (v: string) => string | null, skip?: RegExp, single = false): FactSpec => ({ kind, path, as: "item", label, skip, single });
const x = (kind: string, path: string, extra: string, label: (v: string) => string | null): FactSpec => ({ kind, path, as: "item", label, extra });
const one = (kind: string, path: string, label: (v: string) => string | null): FactSpec => f(kind, path, label, undefined, true);
const series = (v: string) => `Part of the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |book |novel )?series$/i, "")} series`;
const d = (kind: string, path: string, label: (v: string) => string | null, as: "decade" | "century" = "decade"): FactSpec => ({ kind, path, as, label });

const BOOK_JUNK = /various|statelessness|anonymous|unknown|British English|American English|Biblical Hebrew|United Kingdom of Great Britain and Ireland/i;
const NOT_GENRE = /^(film|television|fiction|nonfiction|literature|art|music|work|drama)$/i;

export const SPECS: Record<string, Spec> = {
  films: {
    where: "?item wdt:P31 wd:Q11424.",
    minSitelinks: 40,
    limit: 1500,
    facts: [
      f("director", "wdt:P57", (v) => `Directed by ${v}`),
      f("cast", "wdt:P161", (v) => `Starring ${v}`),
      f("writer", "wdt:P58", (v) => `Written by ${v}`),
      f("composer", "wdt:P86", (v) => `Music by ${v}`),
      f("camera", "wdt:P344", (v) => `Shot by ${v}`),
      f("genre", "wdt:P136", genreOf("films", FILM_SUFFIX), NOT_GENRE),
      d("decade", "wdt:P577", decade("Released")),
      one("country", "wdt:P495", (v) => `Made in ${place(v)}`),
      f("studio", "wdt:P272", (v) => `Produced by ${v}`),
      one("language", "wdt:P364", (v) => `${v}-language films`),
      f("setting", "wdt:P840", (v) => `Set in ${place(v)}`),
      f("series", "wdt:P179", series),
      f("award", "wdt:P166", (v) => `Won the ${v}`),
    ],
  },
  shows: {
    where: "?item wdt:P31 wd:Q5398426.",
    minSitelinks: 25,
    limit: 1500,
    facts: [
      f("network", "wdt:P449", (v) => `Aired on ${v}`),
      f("cast", "wdt:P161", (v) => `Starring ${v}`),
      f("genre", "wdt:P136", genreOf("shows", /\s+(television series|television program|television show|series|tv series|show)$/i), NOT_GENRE),
      d("decade", "wdt:P580", decade("Premiered")),
      one("country", "wdt:P495", (v) => `Made in ${place(v)}`),
      f("creator", "wdt:P170", (v) => `Created by ${v}`),
      f("studio", "wdt:P272", (v) => `Produced by ${v}`),
      f("composer", "wdt:P86", (v) => `Music by ${v}`),
      f("setting", "wdt:P840", (v) => `Set in ${place(v)}`),
      one("language", "wdt:P364", (v) => `${v}-language shows`),
      f("director", "wdt:P57", (v) => `Directed by ${v}`),
      f("award", "wdt:P166", (v) => `Won the ${v}`),
    ],
  },
  books: {
    where: "VALUES ?cls { wd:Q7725634 wd:Q47461344 wd:Q1667921 wd:Q25379 } ?item wdt:P31 ?cls.",
    minSitelinks: 30,
    limit: 1200,
    facts: [
      f("author", "wdt:P50", (v) => `Written by ${v}`, BOOK_JUNK),
      f("authorFrom", "wdt:P50/wdt:P27", (v) => `By authors from ${place(v)}`, BOOK_JUNK),
      f("genre", "wdt:P136", genreOf("books", /\s+(novel|book|literature)$/i), NOT_GENRE),
      d("decade", "wdt:P577", decade("Published")),
      d("century", "wdt:P577", century("Published"), "century"),
      f("language", "wdt:P407", (v) => `Written in ${v}`, BOOK_JUNK, true),
      f("country", "wdt:P495", (v) => `From ${place(v)}`, BOOK_JUNK, true),
      f("publisher", "wdt:P123", (v) => `Published by ${v}`),
      f("setting", "wdt:P840", (v) => `Set in ${place(v)}`),
      f("character", "wdt:P674", (v) => `Features ${v}`),
      f("series", "wdt:P179", series),
      f("award", "wdt:P166", (v) => `Won the ${v}`),
    ],
  },
  music: {
    where: [
      "VALUES ?o { wd:Q177220 } ?item wdt:P106 ?o; wdt:P136 ?genre.",
      "VALUES ?o { wd:Q639669 wd:Q488205 wd:Q2252262 } ?item wdt:P106 ?o; wdt:P136 ?genre.",
      "?item wdt:P31 wd:Q215380; wdt:P136 ?genre.",
    ],
    minSitelinks: 45,
    limit: 700,
    facts: [
      f("genre", "wdt:P136", genreOf("artists", /\s+(music)$/i), NOT_GENRE),
      f("country", "(wdt:P27|wdt:P495)", (v) => `From ${place(v)}`),
      f("label", "wdt:P264", (v) => `Signed to ${v}`),
      d("born", "wdt:P569", decade("Born")),
      d("formed", "wdt:P571", decade("Formed")),
      f("formedIn", "wdt:P740", (v) => `Formed in ${place(v)}`),
      f("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
      f("instrument", "wdt:P1303", (v) => `Plays the ${v.replace(/\s+instrument$/i, "")}`),
      f("award", "wdt:P166", (v) => `Won the ${v}`),
    ],
  },
};

// ---------------- Pokémon: PokéAPI facts, Wikidata fame ----------------
const pokeName = (s: string) => cap(s.replace(/-/g, " "));
const POKE = "https://pokeapi.co/api/v2";
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

SPECS.pokemon = {
  async load({ ask, fetchJson }) {
    // Every species with its English name, Pokédex number and the sitelink count that stands for fame.
    const rows = await ask(
      `SELECT ?item ?n ?l ?sl WHERE { ?item wdt:P1685 ?n; wikibase:sitelinks ?sl; rdfs:label ?l. FILTER(lang(?l) = "en") } ORDER BY ?n`
    );
    const byDex = new Map<number, Entity>();
    for (const r of rows) {
      const n = Number(r.n);
      const prev = byDex.get(n);
      if (n >= 1 && n <= 1025 && (!prev || prev.fame < Number(r.sl))) byDex.set(n, { id: r.n, name: r.l, fame: Number(r.sl), facts: {} });
    }
    const add = (dex: number, kind: string, label: string) => { const e = byDex.get(dex); if (e) (e.facts[kind] ??= new Set()).add(label); };
    const idOf = (url: string) => Number(url.replace(/\/$/, "").split("/").pop());
    const group = async (endpoint: string, kind: string, label: (name: string, data: any) => string | null, members: (data: any) => { url: string }[]) => {
      const list = await fetchJson<any>(`${POKE}/${endpoint}?limit=1000`);
      for (const it of list.results) {
        const data = await fetchJson<any>(it.url);
        const lab = label(it.name, data);
        if (lab) for (const m of members(data)) add(idOf(m.url), kind, lab);
      }
    };
    const species = (x: any) => x.pokemon_species as { url: string }[];
    const forms = (x: any) => (x.pokemon as any[]).map((p) => p.pokemon as { url: string }).filter((p) => idOf(p.url) <= 1025);
    await group("type", "type", (n) => (["unknown", "shadow", "stellar"].includes(n) ? null : `${cap(n)}-type Pokémon`), forms);
    await group("generation", "generation", (n) => `Introduced in Generation ${ROMAN.indexOf(n.split("-")[1]!.toUpperCase())}`, species);
    await group("egg-group", "eggGroup", (n) => (n === "no-eggs" ? null : `${pokeName(n)} egg group`), species);
    await group("pokemon-color", "colour", (n) => `${cap(n)} Pokémon`, species);
    await group("pokemon-habitat", "habitat", (n) => `Found in the ${pokeName(n)}`, species);
    await group("pokemon-shape", "shape", (n) => `${pokeName(n)} body shape`, species);
    await group("ability", "ability", (n, data) => (data.is_main_series ? `Can have the ability ${pokeName(n)}` : null), forms);
    // Legendary, mythical and baby flags come from the species record.
    for (const dex of byDex.keys()) {
      const s = await fetchJson<any>(`${POKE}/pokemon-species/${dex}`);
      if (s.is_legendary) add(dex, "class", "Legendary Pokémon");
      if (s.is_mythical) add(dex, "class", "Mythical Pokémon");
      if (s.is_baby) add(dex, "class", "Baby Pokémon");
      const evo = s.evolves_from_species ? "Evolved from another Pokémon" : null;
      if (evo) add(dex, "class", evo);
    }
    return [...byDex.values()];
  },
};

// ---------------- Anime characters: AniList ----------------
SPECS.anime = {
  async load({ fetchJson }) {
    const query = `query($p:Int){Page(page:$p,perPage:50){characters(sort:FAVOURITES_DESC){name{full} favourites bloodType dateOfBirth{month}
      media(type:ANIME,sort:POPULARITY_DESC,perPage:1){edges{node{title{english romaji} startDate{year} format genres studios(isMain:true){nodes{name}}} voiceActors(language:JAPANESE){name{full}}}}}}}`;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const out = new Map<string, Entity>();
    for (let p = 1; p <= 60; p++) {
      const d = await fetchJson<any>("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { p } }) });
      for (const c of d.data.Page.characters) {
        const name: string = c.name?.full;
        if (!name || out.has(name)) continue;
        const edge = c.media?.edges?.[0];
        const m = edge?.node;
        if (!m) continue;
        const e: Entity = { id: name, name, fame: c.favourites ?? 0, facts: {} };
        const put = (k: string, v?: string | null) => { if (v) (e.facts[k] ??= new Set()).add(v); };
        const title = m.title?.english ?? m.title?.romaji;
        put("series", title && `From ${title}`);
        put("studio", m.studios?.nodes?.[0]?.name && `From a ${m.studios.nodes[0].name} anime`);
        if (m.startDate?.year) put("decade", `From an anime that began in the ${Math.floor(m.startDate.year / 10) * 10}s`);
        for (const g of m.genres ?? []) put("genre", `From a ${String(g).toLowerCase()} anime`);
        put("voice", edge.voiceActors?.[0]?.name?.full && `Voiced in Japanese by ${edge.voiceActors[0].name.full}`);
        put("blood", c.bloodType && `Blood type ${c.bloodType}`);
        put("birthday", c.dateOfBirth?.month && `Birthday in ${MONTHS[c.dateOfBirth.month - 1]}`);
        out.set(name, e);
      }
    }
    return [...out.values()];
  },
};

const AN = (v: string) => /^([aeio]|u(?!ni|se|ro|ra|ta|ke))/i.test(v);
const A_OR_AN = (v: string) => `${AN(v) ? "An" : "A"} ${v}`;
const HUMAN_CLS = (qs: string) => `VALUES ?o { ${qs} } ?item wdt:P106 ?o. ?item wdt:P569 ?born. FILTER(YEAR(?born) < 1960)`;

SPECS.history = {
  where: [
    ...["Q82955", "Q36180", "Q901", "Q1028181", "Q4964182", "Q189290", "Q116", "Q36834", "Q169470", "Q170790", "Q11900058", "Q205375", "Q483501", "Q333634", "Q1930187", "Q33999", "Q4610556"].map((q) => HUMAN_CLS(`wd:${q}`)),
  ],
  minSitelinks: 70,
  limit: 140,
  facts: [
    f("occupation", "wdt:P106", (v) => `Worked as a ${v}`),
    f("country", "wdt:P27", (v) => `Citizen of ${place(v)}`),
    d("bornCentury", "wdt:P569", century("Born"), "century"),
    d("bornDecade", "wdt:P569", decade("Born")),
    d("diedDecade", "wdt:P570", decade("Died")),
    f("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
    f("deathplace", "wdt:P20", (v) => `Died in ${place(v)}`),
    f("religion", "wdt:P140", (v) => `Followed ${v}`),
    f("school", "wdt:P69", (v) => `Studied at ${v}`),
    f("office", "wdt:P39", (v) => `Held the office of ${v}`),
    f("award", "wdt:P166", (v) => `Awarded the ${v}`, /^honorary citizen|honorary citizenship/i),
    f("member", "wdt:P463", (v) => `Member of ${v}`),
    f("family", "wdt:P53", (v) => `Belonged to ${v}`),
    f("conflict", "wdt:P607", (v) => `Fought in ${v}`),
    f("cause", "wdt:P509", (v) => `Died of ${v}`),
    f("workplace", "wdt:P937", (v) => `Worked in ${place(v)}`),
  ],
};

SPECS.football = {
  where: "?item wdt:P106 wd:Q937857.",
  minSitelinks: 45,
  limit: 1500,
  facts: [
    f("club", "wdt:P54", (v) => `Played for ${v}`, /under-\d+|\bU\d\d\b|olympic|\bB\b|reserves|youth/i),
    f("position", "wdt:P413", (v) => `Plays as a ${v.replace(/\s*\(association football\)/, "")}`),
    f("country", "wdt:P27", (v) => `From ${place(v)}`),
    d("born", "wdt:P569", decade("Born")),
    f("award", "wdt:P166", (v) => `Awarded the ${v}`),
    f("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
    f("tournament", "wdt:P1344", (v) => `Played at the ${v}`),
    f("coached", "wdt:P6087", (v) => `Coached ${v}`),
  ],
};

SPECS.nba = {
  where: "?item wdt:P106 wd:Q3665646; wdt:P54 ?nbaTeam. ?nbaTeam wdt:P118 wd:Q155223.",
  minSitelinks: 18,
  limit: 1100,
  facts: [
    x("team", "wdt:P54", "?v wdt:P118 wd:Q155223.", (v) => `Played for the ${v}`),
    x("drafted", "wdt:P647", "?v wdt:P118 wd:Q155223.", (v) => `Drafted by the ${v}`),
    f("college", "wdt:P69", (v) => `Studied at ${v}`),
    f("position", "wdt:P413", (v) => `Plays as a ${v}`),
    d("born", "wdt:P569", decade("Born")),
    f("country", "wdt:P27", (v) => `From ${place(v)}`),
    f("award", "wdt:P166", (v) => `Won the ${v}`),
    f("event", "wdt:P1344", (v) => `Took part in the ${v}`),
    f("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
  ],
};

SPECS.food = {
  where: "VALUES ?cls { wd:Q746549 wd:Q2095 wd:Q1778821 wd:Q22811629 } ?item wdt:P31 ?cls.",
  minSitelinks: 12,
  limit: 1500,
  facts: [
    one("country", "wdt:P495", (v) => `From ${place(v)}`),
    f("continent", "wdt:P495/wdt:P30", (v) => `From ${v}`),
    f("kind", "wdt:P279", (v) => `A kind of ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v), /food|dish|cuisine|^human|meal|recipe/i),
    f("ingredient", "(wdt:P527|wdt:P186)", (v) => `Made with ${v}`),
    f("cuisine", "(wdt:P361|wdt:P2012)", (v) => `Part of ${v}`),
    f("region", "wdt:P131", (v) => `From ${place(v)}`),
    d("created", "wdt:P571", decade("Created")),
  ],
};

const PLACE_WHERE = [
  "?item wdt:P31 wd:Q3624078. FILTER NOT EXISTS { ?item wdt:P576 ?ended }",
  "?item wdt:P31 wd:Q515.",
  "?item wdt:P31 wd:Q8502.",
  "?item wdt:P31 wd:Q4022.",
  "?item wdt:P31 wd:Q23397.",
  "?item wdt:P31 wd:Q23442.",
  "?item wdt:P31 wd:Q8514.",
];
SPECS.geography = {
  where: PLACE_WHERE,
  minSitelinks: 60,
  limit: 260,
  facts: [
    f("country", "wdt:P17", (v) => `In ${place(v)}`),
    f("continent", "wdt:P30", (v) => `In ${v}`),
    f("language", "wdt:P37", (v) => `Has ${v} as an official language`),
    f("currency", "wdt:P38", (v) => `Uses the ${v}`),
    f("member", "wdt:P463", (v) => `Member of ${v}`),
    f("timezone", "wdt:P421", (v) => `In the ${v.replace(/\s+time zone$/i, "")} time zone`),
    f("region", "wdt:P131", (v) => `In ${place(v)}`),
    f("range", "wdt:P4552", (v) => `In the ${v}`),
    f("mouth", "wdt:P403", (v) => `Flows into the ${v}`),
    f("feature", "wdt:P706", (v) => `In or on ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v)),
    f("drives", "wdt:P1622", (v) => `Drives on the ${v}`),
    f("government", "wdt:P122", (v) => A_OR_AN(v)),
    d("founded", "wdt:P571", decade("Founded")),
  ],
};

SPECS.flags = {
  where: "?item wdt:P297 ?iso. FILTER NOT EXISTS { ?item wdt:P576 ?ended }",
  minSitelinks: 25,
  limit: 300,
  facts: [
    f("continent", "wdt:P30", (v) => `In ${v}`),
    f("language", "wdt:P37", (v) => `Has ${v} as an official language`),
    f("currency", "wdt:P38", (v) => `Uses the ${v}`),
    f("member", "wdt:P463", (v) => `Member of ${v}`),
    f("colour", "wdt:P163/wdt:P462", (v) => `Has ${v} on its flag`),
    f("symbol", "wdt:P163/wdt:P180", (v) => `Shows a ${v} on its flag`),
    f("flagKind", "wdt:P163/wdt:P31", (v) => `Has ${AN(v) ? "an" : "a"} ${v} for a flag`, /flag/i),
    f("drives", "wdt:P1622", (v) => `Drives on the ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v)),
    f("government", "wdt:P122", (v) => A_OR_AN(v)),
    f("timezone", "wdt:P421", (v) => `In the ${v.replace(/\s+time zone$/i, "")} time zone`),
    f("sovereign", "wdt:P1366", (v) => `Once part of ${place(v)}`),
  ],
};

// ---------------- flags: Wikidata, with the ISO code as the image lookup ----------------
{
  const flagSpec = SPECS.flags as WdSpec;
  SPECS.flags = {
    async load(ctx) {
      const ents = await ctx.wikidataPool(flagSpec);
      for (let i = 0; i < ents.length; i += 150) {
        const part = ents.slice(i, i + 150);
        const rows = await ctx.ask(`SELECT ?item ?iso WHERE { VALUES ?item { ${part.map((e) => "wd:" + e.id).join(" ")} } ?item wdt:P297 ?iso }`);
        const iso = new Map(rows.map((r) => [r.item, r.iso.toLowerCase()]));
        for (const e of part) if (iso.get(e.id)) e.q = iso.get(e.id);
      }
      return ents.filter((e) => e.q);
    },
  };
}

// ---------------- characters ----------------
const CHARACTER_FACTS: FactSpec[] = [
  f("universe", "wdt:P1080", (v) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+universe$/i, "")} universe`),
  f("creator", "wdt:P170", (v) => `Created by ${v}`),
  f("voice", "wdt:P725", (v) => `Voiced by ${v}`),
  f("member", "wdt:P463", (v) => `Member of ${v}`),
  f("appears", "wdt:P1441", (v) => `Appears in ${v}`),
  f("occupation", "wdt:P106", (v) => `Works as a ${v}`),
  f("is", "wdt:P31", (v) => A_OR_AN(v), /^(fictional character|character|human|fictional human|fictional entity|comics character|film character|video game character)$/i),
  d("debut", "(wdt:P571|wdt:P1191)", decade("Debuted")),
];
const FICTIONAL_CLASSES = "VALUES ?cls { wd:Q1114461 wd:Q95074 wd:Q15632617 wd:Q15773347 wd:Q1569167 wd:Q188784 } ?item wdt:P31 ?cls.";

const chunkLabels = (a: string[]) => Array.from({ length: Math.ceil(a.length / 100) }, (_, i) => a.slice(i * 100, i * 100 + 100));
type Hero = { name: string; appearance: Record<string, string>; biography: Record<string, string>; work: Record<string, string>; connections: Record<string, string> };
const heroSide = (side: "good" | "bad"): CustomSpec => ({
  async load(ctx) {
    const all = (await ctx.fetchJson<Hero[]>("https://akabab.github.io/superhero-api/api/all.json")) as Hero[];
    const byName = new Map<string, Hero>();
    for (const h of all) if (h.name && !byName.has(h.name.toLowerCase())) byName.set(h.name.toLowerCase(), h);
    // Look each hero up by its English label or alias, so a lesser-known villain is not lost to a fame cut-off.
    const itemHero = new Map<string, Hero>();
    const labels = [...byName.values()].map((h) => `${JSON.stringify(h.name)}@en`);
    for (const part of chunkLabels(labels)) {
      const rows = await ctx.ask(`SELECT DISTINCT ?item ?l WHERE { VALUES ?l { ${part.join(" ")} } ?item (rdfs:label|skos:altLabel) ?l. ${FICTIONAL_CLASSES} }`);
      for (const r of rows) itemHero.set(r.item, byName.get(r.l.toLowerCase())!);
    }
    const ids = [...itemHero.keys()].filter((i) => /^Q\d+$/.test(i));
    const where = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => `VALUES ?item { ${ids.slice(i * 100, i * 100 + 100).map((q) => "wd:" + q).join(" ")} }`);
    const found = await ctx.wikidataPool({ where, minSitelinks: 1, limit: 1500, facts: CHARACTER_FACTS });
    // One entity per hero: the most famous match, named as the entity is on Wikidata.
    const best = new Map<Hero, Entity>();
    for (const e of found) { const h = itemHero.get(e.id); if (h && (!best.get(h) || best.get(h)!.fame < e.fame)) best.set(h, e); }
    const ents = [...best.values()];
    const out: Entity[] = [];
    for (const e of ents) {
      const h = itemHero.get(e.id);
      if (!h || h.biography.alignment !== side) continue;
      const put = (k: string, v?: string | null) => { if (v) (e.facts[k] ??= new Set()).add(v); };
      const ok = (v?: string) => (v && v !== "-" && v !== "null" && v.toLowerCase() !== "no hair" ? v : undefined);
      const pub = ok(h.biography.publisher);
      put("publisher", pub && `Published by ${pub}`);
      const race = ok(h.appearance.race);
      put("race", race && `Is ${/^[aeiou]/i.test(race) ? "an" : "a"} ${race.split(" / ")[0]!.toLowerCase()}`);
      const eye = ok(h.appearance.eyeColor);
      put("eyes", eye && `Has ${eye.toLowerCase()} eyes`);
      const hair = ok(h.appearance.hairColor);
      put("hair", hair && `Has ${hair.toLowerCase()} hair`);
      const year = h.biography.firstAppearance?.match(/\b(19\d\d|20[0-2]\d)\b/)?.[1];
      put("first", year && `First appeared in the ${Math.floor(Number(year) / 10) * 10}s`);
      for (const g of (ok(h.connections.groupAffiliation) ?? "").split(/[,;]|\bformerly\b|\bformer\b/i)) {
        const name = g.replace(/\(.*?\)/g, "").replace(/^(the|a|an)\s+/i, "").trim();
        if (name.length > 2 && name.length < 40 && !/^(none|unknown|other)/i.test(name)) put("group", `Linked with ${name}`);
      }
      if (h.appearance.gender === "Female") put("gender", "Female characters");
      for (const o of (ok(h.work.occupation) ?? "").split(/[;,]/)) {
        const t = o.replace(/\(.*?\)/g, "").replace(/^(former|ex-|formerly|current)\s+/i, "").trim().toLowerCase();
        if (t.length > 3 && t.length < 30 && !/^(none|unknown|other|-)/.test(t)) put("job", `Works as a ${t}`);
      }
      const born = ok(h.biography.placeOfBirth)?.split(/[;,]/)[0]?.trim();
      put("birth", born && born.length > 2 && born.length < 30 ? `Born in ${born}` : undefined);
      const base = ok(h.work.base)?.split(/[;,]/)[0]?.trim();
      put("base", base && base.length > 2 && base.length < 30 ? `Based in ${base}` : undefined);
      out.push(e);
    }
    return out;
  },
});
SPECS.superheroes = heroSide("good");
SPECS.villains = heroSide("bad");

SPECS.disney = {
  where: "VALUES ?s { wd:Q127552 wd:Q1047410 wd:Q191224 wd:Q7414 wd:Q1392453 } ?w wdt:P31/wdt:P279* wd:Q11424; wdt:P272 ?s. ?item wdt:P1441 ?w; wdt:P31/wdt:P279* wd:Q95074.",
  minSitelinks: 1,
  limit: 1200,
  facts: [
    ...CHARACTER_FACTS,
    f("studio", "wdt:P1441/wdt:P272", (v) => `From a ${v} film`),
    f("director", "wdt:P1441/wdt:P57", (v) => `From a film directed by ${v}`),
    d("film", "wdt:P1441/wdt:P577", decade("From a film released")),
    f("series", "wdt:P1441/wdt:P179", (v) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |video game |game )?series$/i, "")} series`),
  ],
};

SPECS.movies = {
  where: "?w wdt:P31 wd:Q11424. ?item wdt:P1441 ?w; wdt:P31 wd:Q15773347.",
  minSitelinks: 6,
  limit: 1200,
  facts: [
    ...CHARACTER_FACTS,
    f("actor", "^pq:P453/ps:P161", (v) => `Played by ${v}`),
    f("director", "wdt:P1441/wdt:P57", (v) => `From a film directed by ${v}`),
    d("film", "wdt:P1441/wdt:P577", decade("From a film released")),
    f("genre", "wdt:P1441/wdt:P136", (v) => { const g = genreOf("films", FILM_SUFFIX)(v); return g && `From ${g.toLowerCase().replace(/^./, (c) => c.toUpperCase())}`; }, /^(film|television|fiction|nonfiction|literature|art|music|work|drama)$|game|television/i),
    f("series", "wdt:P1441/wdt:P179", (v) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |video game |game )?series$/i, "")} series`),
  ],
};

SPECS.videogames = {
  where: "?w wdt:P31 wd:Q7889. ?item wdt:P1441 ?w; wdt:P31 wd:Q1569167.",
  minSitelinks: 3,
  limit: 1500,
  facts: [
    ...CHARACTER_FACTS,
    f("developer", "wdt:P1441/wdt:P178", (v) => `Appears in games by ${v}`),
    f("series", "wdt:P1441/wdt:P179", (v) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |video game |game )?series$/i, "")} series`),
    f("platform", "wdt:P1441/wdt:P400", (v) => `Appears in a game for ${v}`),
    f("genre", "wdt:P1441/wdt:P136", (v) => { const g = v.replace(/\s+(video game|game)$/i, "").trim(); return g.length > 2 ? `From ${g.toLowerCase()} games` : null; }, NOT_GENRE),
    d("game", "wdt:P1441/wdt:P577", decade("Appears in a game released")),
  ],
};
