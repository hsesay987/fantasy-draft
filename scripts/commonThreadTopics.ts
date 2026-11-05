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
  /** A pattern binding ?w from ?item (a typed work); `path` then starts at ?w. */
  from?: string;
  /** The values of this kind rule each other out (decade, continent, nation), so siblings make tempting wrong options. */
  exclusive?: boolean;
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
export type CustomSpec = { load: (ctx: Ctx) => Promise<Entity[]>; /** Kinds whose values rule each other out. */ exclusive?: string[] };
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
const one = (kind: string, path: string, label: (v: string) => string | null): FactSpec => ({ ...f(kind, path, label, undefined, true), exclusive: true });
const series = (v: string) => `Part of the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |book |novel )?series$/i, "")} series`;
const d = (kind: string, path: string, label: (v: string) => string | null, as: "decade" | "century" = "decade"): FactSpec => ({ kind, path, as, label, exclusive: true });
/** A fact read from a work of one type the item appears in (a film, a video game), so a release year or director is never another kind of work's. */
const fw = (kind: string, from: string, path: string, label: (v: string) => string | null, skip?: RegExp): FactSpec => ({ ...f(kind, path, label, skip), from });
const dw = (kind: string, from: string, path: string, label: (v: string) => string | null): FactSpec => ({ ...d(kind, path, label), from });
const IN_FILM = "?item wdt:P1441 ?w. ?w wdt:P31/wdt:P279* wd:Q11424.";
const IN_GAME = "?item wdt:P1441 ?w. ?w wdt:P31/wdt:P279* wd:Q7889.";
const ORGS = /^(United Nations|North Atlantic Treaty|NATO|European Union|African Union|Commonwealth of Nations|G20|G7|Group of (Seven|Twenty)|Organisation for Economic|OECD|OPEC|Organization of the Petroleum|Association of Southeast Asian|ASEAN|Arab League|BRICS|Organization of American States|World Trade Organization|Council of Europe|Organisation of Islamic Cooperation|Mercosur|Pacific Islands Forum|Caribbean Community|Non-Aligned Movement|Commonwealth of Independent States|Gulf Cooperation Council|Shanghai Cooperation|Asia-Pacific Economic|Union of South American|Southern African Development|Economic Community of West African|Organisation internationale de la Francophonie|International Monetary Fund|World Bank|UNESCO|World Health Organization|Schengen)/i;
const NOT_WELL_KNOWN_ORG = new RegExp(`^(?!${ORGS.source.slice(1)})`, "i");
const UTC_ONLY = /^(?!UTC)/;

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
      // Singers and instrumentalists only (the bare "musician" label also covers actors), with a real music genre.
      "VALUES ?o { wd:Q177220 } ?item wdt:P106 ?o; wdt:P136 ?genre. ?genre wdt:P31/wdt:P279* wd:Q188451.",
      "VALUES ?o { wd:Q488205 wd:Q2252262 wd:Q855091 wd:Q486748 wd:Q386854 wd:Q130857 } ?item wdt:P106 ?o; wdt:P136 ?genre. ?genre wdt:P31/wdt:P279* wd:Q188451.",
      "?item wdt:P31 wd:Q215380; wdt:P136 ?genre. ?genre wdt:P31/wdt:P279* wd:Q188451.",
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
      one("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
      f("instrument", "wdt:P1303", (v) => `Plays the ${v.replace(/\s+instrument$/i, "")}`),
      f("award", "wdt:P166", (v) => `Won the ${v}`),
    ],
  },
};

// ---------------- Pokémon: PokéAPI facts, Wikidata fame ----------------
const pokeName = (s: string) => cap(s.replace(/-/g, " "));
const POKE = "https://pokeapi.co/api/v2";
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX"];

const EGG_GROUPS: Record<string, string> = { water1: "Water 1", water2: "Water 2", water3: "Water 3", humanshape: "Human-Like", ground: "Field", monster: "Monster", bug: "Bug", flying: "Flying", field: "Field", fairy: "Fairy", plant: "Plant", dragon: "Dragon", mineral: "Mineral", indeterminate: "Amorphous", ditto: "Ditto" };
const HABITATS: Record<string, string> = { cave: "Found in caves", forest: "Found in forests", grassland: "Found in grasslands", mountain: "Found in the mountains", "rough-terrain": "Found on rough terrain", sea: "Found in the sea", urban: "Found in cities", "waters-edge": "Found at the water's edge" };

SPECS.pokemon = {
  exclusive: ["generation", "colour", "habitat"],
  async load({ ask, fetchJson }) {
    // Every species with its English name, Pokédex number and the sitelink count that stands for fame.
    const rows = await ask(
      `SELECT ?item ?n ?l ?sl WHERE { ?item wdt:P1685 ?n; wikibase:sitelinks ?sl; rdfs:label ?l. FILTER(lang(?l) = "en") } ORDER BY ?n`
    );
    const byDex = new Map<number, Entity>();
    for (const r of rows) {
      const n = Number(r.n);
      const prev = byDex.get(n);
      if (n >= 1 && n <= 1025 && (!prev || prev.fame < Number(r.sl))) byDex.set(n, { id: r.n, name: r.l.replace(/\s+/g, " ").trim(), fame: Number(r.sl), facts: {} });
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
    await group("egg-group", "eggGroup", (n) => (EGG_GROUPS[n] ? `${EGG_GROUPS[n]} egg group` : null), species);
    await group("pokemon-color", "colour", (n) => `${cap(n)} Pokémon`, species);
    await group("pokemon-habitat", "habitat", (n) => HABITATS[n] ?? null, species);
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
  exclusive: ["decade"],
  async load({ fetchJson }) {
    const query = `query($p:Int){Page(page:$p,perPage:50){characters(sort:FAVOURITES_DESC){name{full} favourites bloodType dateOfBirth{month}
      media(type:ANIME,sort:POPULARITY_DESC,perPage:1){edges{node{title{english romaji} startDate{year} format genres studios(isMain:true){nodes{name}}} voiceActors(language:JAPANESE){name{full}}}}}}}`;
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const out = new Map<string, Entity>();
    for (let p = 1; p <= 60; p++) {
      const d = await fetchJson<any>("https://graphql.anilist.co", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, variables: { p } }) });
      for (const c of d.data.Page.characters) {
        const name: string = c.name?.full?.replace(/\s+/g, " ").trim();
        if (!name || out.has(name)) continue;
        const edge = c.media?.edges?.[0];
        const m = edge?.node;
        if (!m) continue;
        const e: Entity = { id: name, name, fame: c.favourites ?? 0, facts: {} };
        const put = (k: string, v?: string | null) => { if (v) (e.facts[k] ??= new Set()).add(v); };
        const title = m.title?.english ?? m.title?.romaji;
        put("series", title && `From ${title}`);
        const studio: string | undefined = m.studios?.nodes?.[0]?.name?.replace(/\s+/g, " ").trim();
        put("studio", studio && `From ${AN(studio) ? "an" : "a"} ${studio} anime`);
        if (m.startDate?.year) put("decade", `From an anime that began in the ${Math.floor(m.startDate.year / 10) * 10}s`);
        for (const g of m.genres ?? []) put("genre", `From ${AN(String(g)) ? "an" : "a"} ${String(g).toLowerCase()} anime`);
        put("voice", edge.voiceActors?.[0]?.name?.full && `Voiced in Japanese by ${edge.voiceActors[0].name.full}`);
        put("blood", c.bloodType && `Blood type ${c.bloodType}`);
        put("birthday", c.dateOfBirth?.month && `Birthday in ${MONTHS[c.dateOfBirth.month - 1]}`);
        out.set(name, e);
      }
    }
    return [...out.values()];
  },
};

const AN = (v: string) => (/^[A-Z]{2,}\b/.test(v) ? /^[AEFHILMNORSX]/.test(v) : /^([aeio]|u(?!ni|se|ro|ra|ta|ke))/i.test(v));
/** "a rhino", "an owl", "an OLM". */
const art = (v: string) => `${AN(v) ? "an" : "a"} ${v}`;
const A_OR_AN = (v: string) => `${AN(v) ? "An" : "A"} ${v}`;
const HUMAN_CLS = (qs: string) => `VALUES ?o { ${qs} } ?item wdt:P106 ?o. ?item wdt:P569 ?born. FILTER(YEAR(?born) < 1960)`;

SPECS.history = {
  where: [
    ...["Q82955", "Q36180", "Q901", "Q1028181", "Q4964182", "Q189290", "Q116", "Q36834", "Q169470", "Q170790", "Q11900058", "Q205375", "Q483501", "Q333634", "Q1930187", "Q33999", "Q4610556"].map((q) => HUMAN_CLS(`wd:${q}`)),
  ],
  minSitelinks: 70,
  limit: 140,
  facts: [
    f("occupation", "wdt:P106", (v) => `Worked as ${art(v)}`),
    f("country", "wdt:P27", (v) => `Citizen of ${place(v)}`),
    d("bornCentury", "wdt:P569", century("Born"), "century"),
    d("bornDecade", "wdt:P569", decade("Born")),
    d("diedDecade", "wdt:P570", decade("Died")),
    one("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
    one("deathplace", "wdt:P20", (v) => `Died in ${place(v)}`),
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
    f("position", "wdt:P413", (v) => `Plays as ${art(v.replace(/\s*\(association football\)/, ""))}`),
    one("nation", "wdt:P1532", (v) => `Represented ${place(v)}`),
    d("born", "wdt:P569", decade("Born")),
    f("award", "wdt:P166", (v) => `Awarded the ${v}`),
    one("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
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
    f("position", "wdt:P413", (v) => `Plays as ${art(v)}`),
    d("born", "wdt:P569", decade("Born")),
    one("nation", "wdt:P1532", (v) => `Represented ${place(v)}`),
    f("award", "wdt:P166", (v) => `Won the ${v}`),
    f("event", "wdt:P1344", (v) => `Took part in the ${v}`),
    one("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
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
    one("continent", "wdt:P30", (v) => `In ${v}`),
    f("language", "wdt:P37", (v) => `Has ${v} as an official language`),
    f("currency", "wdt:P38", (v) => `Uses the ${v}`),
    f("member", "wdt:P463", (v) => `Member of ${v}`, NOT_WELL_KNOWN_ORG),
    f("timezone", "wdt:P421", (v) => `In the ${v} time zone`, UTC_ONLY),
    f("region", "wdt:P131", (v) => `In ${place(v)}`),
    f("range", "wdt:P4552", (v) => `In the ${v}`),
    f("mouth", "wdt:P403", (v) => `Flows into the ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v)),
    f("drives", "wdt:P1622", (v) => `Drives on the ${v}`),
    d("founded", "wdt:P571", decade("Founded")),
  ],
};

SPECS.flags = {
  where: "?item wdt:P297 ?iso. FILTER NOT EXISTS { ?item wdt:P576 ?ended }",
  minSitelinks: 25,
  limit: 300,
  facts: [
    one("continent", "wdt:P30", (v) => `In ${v}`),
    f("language", "wdt:P37", (v) => `Has ${v} as an official language`),
    f("currency", "wdt:P38", (v) => `Uses the ${v}`),
    f("member", "wdt:P463", (v) => `Member of ${v}`, NOT_WELL_KNOWN_ORG),
    f("colour", "wdt:P163/wdt:P462", (v) => `Has ${v} on its flag`, /sky blue/i),
    f("symbol", "wdt:P163/wdt:P180", (v) => `Shows ${art(v)} on its flag`),
    f("flagKind", "wdt:P163/wdt:P31", (v) => `Has ${AN(v) ? "an" : "a"} ${v} for a flag`, /flag/i),
    f("drives", "wdt:P1622", (v) => `Drives on the ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v)),
    f("timezone", "wdt:P421", (v) => `In the ${v} time zone`, UTC_ONLY),
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
];
const CHARACTER_KINDS: FactSpec[] = [
  f("occupation", "wdt:P106", (v) => `Works as ${art(v)}`, /^(fictional|character)/i),
  f("is", "wdt:P31", (v) => A_OR_AN(v), /^(fictional character|character|human|fictional human|fictional entity|comics character|film character|video game character)$|anime|manga|cartoon/i),
];
// Heroes and villains: Wikidata-backed facts only (publisher and comic come from Wikidata too).
const HERO_FACTS: FactSpec[] = [
  ...CHARACTER_FACTS,
  d("debut", "(wdt:P571|wdt:P1191)", decade("Debuted")),
  f("publisher", "(wdt:P123|wdt:P1441/wdt:P123)", (v) => `Published by ${v}`),
];
const FICTIONAL_CLASSES = "VALUES ?cls { wd:Q1114461 wd:Q95074 wd:Q15632617 wd:Q15773347 wd:Q1569167 wd:Q188784 } ?item wdt:P31 ?cls.";

const chunkLabels = (a: string[]) => Array.from({ length: Math.ceil(a.length / 100) }, (_, i) => a.slice(i * 100, i * 100 + 100));
type Hero = { name: string; appearance: Record<string, string>; biography: Record<string, string>; work: Record<string, string>; connections: Record<string, string> };
/**
 * Heroes and villains. Members are the Superhero API's characters of that alignment plus the members of the given
 * Wikipedia categories (Wikipedia's own "supervillains" and "superheroes" lists), each tied to Wikidata for fame and facts.
 */
const heroSide = (side: "good" | "bad", categories: string[]): CustomSpec => ({
  exclusive: ["first", "debut"],
  async load(ctx) {
    const all = (await ctx.fetchJson<Hero[]>("https://akabab.github.io/superhero-api/api/all.json")) as Hero[];
    const byName = new Map<string, Hero>();
    for (const h of all) if (h.name && !byName.has(h.name.toLowerCase())) byName.set(h.name.toLowerCase(), h);
    // Each Superhero API character, matched by its exact English label.
    const itemHero = new Map<string, Hero>();
    const labels = [...byName.values()].map((h) => `${JSON.stringify(h.name)}@en`);
    for (const part of chunkLabels(labels)) {
      const rows = await ctx.ask(`SELECT DISTINCT ?item ?l WHERE { VALUES ?l { ${part.join(" ")} } ?item rdfs:label ?l. ${FICTIONAL_CLASSES} }`);
      for (const r of rows) itemHero.set(r.item, byName.get(r.l.toLowerCase())!);
    }
    // The Wikipedia category members, tied to Wikidata through their English article titles.
    const titles = new Set<string>();
    for (const cat of categories) {
      let more = "";
      do {
        const d = await ctx.fetchJson<any>(`https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${cat}&cmlimit=500&cmtype=page&format=json${more}`);
        for (const m of d.query?.categorymembers ?? []) titles.add(m.title as string);
        more = d.continue?.cmcontinue ? `&cmcontinue=${encodeURIComponent(d.continue.cmcontinue)}` : "";
        await new Promise((r) => setTimeout(r, 1200));
      } while (more);
    }
    const members = new Set<string>([...itemHero].filter(([, h]) => h.biography.alignment === side).map(([id]) => id));
    const titleList = [...titles];
    for (let i = 0; i < titleList.length; i += 80) {
      const part = titleList.slice(i, i + 80).map((t) => `${JSON.stringify(t)}@en`);
      const rows = await ctx.ask(`SELECT DISTINCT ?item WHERE { VALUES ?t { ${part.join(" ")} } ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t }`);
      for (const r of rows) members.add(r.item);
    }
    // Cross-check with Wikidata's own classes and the Superhero API's alignment.
    const ids = [...members].filter((i) => /^Q\d+$/.test(i)).sort();
    const flagged = new Map<string, Set<string>>();
    for (let i = 0; i < ids.length; i += 150) {
      const rows = await ctx.ask(`SELECT ?item ?c WHERE { VALUES ?item { ${ids.slice(i, i + 150).map((q) => "wd:" + q).join(" ")} } VALUES ?c { wd:Q188784 wd:Q6498903 wd:Q290691 } ?item wdt:P31 ?c }`);
      for (const r of rows) (flagged.get(r.item) ?? flagged.set(r.item, new Set()).get(r.item)!).add(r.c);
    }
    const contradicts = (id: string) => {
      const opposite = itemHero.get(id)?.biography.alignment === (side === "good" ? "bad" : "good");
      const f = flagged.get(id);
      return opposite || (side === "bad" ? f?.has("Q188784") : f?.has("Q6498903") || f?.has("Q290691"));
    };
    const keep = ids.filter((id) => !contradicts(id));
    const where = Array.from({ length: Math.ceil(keep.length / 100) }, (_, i) => `VALUES ?item { ${keep.slice(i * 100, i * 100 + 100).map((q) => "wd:" + q).join(" ")} }`);
    const found = await ctx.wikidataPool({ where, minSitelinks: 3, limit: 1500, facts: HERO_FACTS });
    for (const e of found) {
      const h = itemHero.get(e.id);
      if (!h || h.biography.alignment !== side) continue;
      const put = (k: string, v?: string | null) => { if (v) (e.facts[k] ??= new Set()).add(v); };
      const ok = (v?: string) => (v && v !== "-" && v !== "null" && v.toLowerCase() !== "no hair" ? v : undefined);
      const eye = ok(h.appearance.eyeColor);
      put("eyes", eye && `Has ${eye.toLowerCase()} eyes`);
      const hair = ok(h.appearance.hairColor);
      put("hair", hair && `Has ${hair.toLowerCase()} hair`);
      const year = h.biography.firstAppearance?.match(/\b(19\d\d|20[0-2]\d)\b/)?.[1];
      put("first", year && `First appeared in the ${Math.floor(Number(year) / 10) * 10}s`);
      if (h.appearance.gender === "Female") put("gender", "Female characters");
    }
    return found;
  },
});
SPECS.superheroes = heroSide("good", ["Marvel_Comics_superheroes", "DC_Comics_superheroes"]);
SPECS.villains = heroSide("bad", ["Marvel_Comics_supervillains", "DC_Comics_supervillains", "Film_supervillains", "Literary_villains", "Comics_supervillains", "Image_Comics_supervillains"]);

const SERIES = (v: string) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |video game |game )?series$/i, "")} series`;
const FILM_GENRE_SKIP = /^(film|television|fiction|nonfiction|literature|art|music|work|drama)$|game|television/i;
const filmGenre = (v: string) => { const g = genreOf("films", FILM_SUFFIX)(v); return g && `From ${g.charAt(0) + g.slice(1).toLowerCase()}`; };

SPECS.disney = {
  where: "VALUES ?s { wd:Q127552 wd:Q1047410 wd:Q191224 wd:Q7414 wd:Q1392453 } ?w wdt:P31/wdt:P279* wd:Q11424; wdt:P272 ?s. ?item wdt:P1441 ?w; wdt:P31/wdt:P279* wd:Q95074.",
  minSitelinks: 1,
  limit: 1200,
  facts: [
    ...CHARACTER_FACTS,
    ...CHARACTER_KINDS,
    fw("studio", IN_FILM, "wdt:P272", (v) => `From ${art(v)} film`),
    fw("director", IN_FILM, "wdt:P57", (v) => `From a film directed by ${v}`),
    dw("film", IN_FILM, "wdt:P577", decade("From a film released")),
    fw("series", IN_FILM, "wdt:P179", SERIES),
  ],
};

SPECS.movies = {
  where: "?w wdt:P31 wd:Q11424. ?item wdt:P1441 ?w; wdt:P31 wd:Q15773347.",
  minSitelinks: 6,
  limit: 1200,
  facts: [
    ...CHARACTER_FACTS,
    ...CHARACTER_KINDS,
    f("actor", "^pq:P453/ps:P161", (v) => `Played by ${v}`),
    fw("director", IN_FILM, "wdt:P57", (v) => `From a film directed by ${v}`),
    dw("film", IN_FILM, "wdt:P577", decade("From a film released")),
    fw("genre", IN_FILM, "wdt:P136", filmGenre, FILM_GENRE_SKIP),
    fw("series", IN_FILM, "wdt:P179", SERIES),
  ],
};

SPECS.videogames = {
  where: "?w wdt:P31 wd:Q7889. ?item wdt:P1441 ?w; wdt:P31 wd:Q1569167.",
  minSitelinks: 3,
  limit: 1500,
  facts: [
    ...CHARACTER_FACTS,
    CHARACTER_KINDS[0]!,
    fw("developer", IN_GAME, "wdt:P178", (v) => `Appears in games by ${v}`),
    fw("series", IN_GAME, "wdt:P179", SERIES),
    fw("platform", IN_GAME, "wdt:P400", (v) => `Appears in a game for ${v}`),
    fw("genre", IN_GAME, "wdt:P136", (v) => { const g = v.replace(/\s+(video game|game)$/i, "").trim(); return g.length > 2 ? `From ${g.toLowerCase()} games` : null; }, NOT_GENRE),
    dw("game", IN_GAME, "wdt:P577", decade("Appears in a game released")),
  ],
};
