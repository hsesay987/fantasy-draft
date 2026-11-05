// What each Common Thread topic pulls and which facts become categories. Only facts the sources hold are used.
import type { Row } from "../backend/src/trivia/wikidata";
import { addCategoryFacts } from "./commonThreadWiki";
import { COUNTRY_EXCLUSIVE, addCountryFacts } from "./commonThreadCountries";
import { FOOD_KINDS, KIND_ALLOW, NOT_HEROES, NOT_VILLAINS, NEITHER, ORG_ALLOW, TEAM_ALLOW, onlyExact } from "./commonThreadBans";

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
  /** Too patchy to ever be a wrong option (a dish's ingredients, a flag's symbols). */
  answerOnly?: boolean;
  /** With `from`: count a value only when the item reaches it through at least this many different works, so one cameo makes no fact. */
  minWorks?: number;
};
export type WdSpec = {
  /** SPARQL pattern binding ?item. A list runs one query per entry. */
  where: string | string[];
  minSitelinks: number;
  limit: number;
  facts: FactSpec[];
  /** Drop entities whose English name fails this before any facts are fetched (keeps big fact queries small). */
  keep?: (name: string) => boolean;
  /** Drop entities with one of these occupations (Wikidata ids) unless `strong` (a SPARQL path) has at least `minStrong` distinct values. */
  vet?: { bad: string[]; strong: string; minStrong: number };
};
export type Ctx = {
  ask: (q: string) => Promise<Row[]>;
  fetchJson: <T = any>(url: string, init?: RequestInit) => Promise<T>;
  wikidataPool: (spec: WdSpec) => Promise<Entity[]>;
};
export type CustomSpec = { load: (ctx: Ctx) => Promise<Entity[]>; /** Kinds whose values rule each other out. */ exclusive?: string[]; answerOnly?: string[] };
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
const patchy = (x: FactSpec): FactSpec => ({ ...x, answerOnly: true });
const x = (kind: string, path: string, extra: string, label: (v: string) => string | null): FactSpec => ({ kind, path, as: "item", label, extra });
const one = (kind: string, path: string, label: (v: string) => string | null): FactSpec => ({ ...f(kind, path, label, undefined, true), exclusive: true });
const series = (v: string) => `Part of the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |book |novel )?series$/i, "")} series`;
const d = (kind: string, path: string, label: (v: string) => string | null, as: "decade" | "century" = "decade"): FactSpec => ({ kind, path, as, label, exclusive: true });
/** A fact read from a work of one type the item appears in (a film, a video game), so a release year or director is never another kind of work's. */
const fw = (kind: string, from: string, path: string, label: (v: string) => string | null, skip?: RegExp): FactSpec => ({ ...f(kind, path, label, skip), from });
const dw = (kind: string, from: string, path: string, label: (v: string) => string | null): FactSpec => ({ ...d(kind, path, label), from });
/** A franchise fact: true of a character listed in two works of the series, not of a cameo in one. */
const seriesVia = (from: string): FactSpec => ({ ...fw("series", from, "wdt:P179", SERIES, SERIES_SKIP), minWorks: 2 });
const IN_FILM = "?item wdt:P1441 ?w. ?w wdt:P31/wdt:P279* wd:Q11424.";
const DISNEY_FILM = "?item wdt:P1441 ?w. ?w wdt:P31/wdt:P279* wd:Q202866; wdt:P272 ?studio. VALUES ?studio { wd:Q127552 wd:Q1047410 wd:Q191224 wd:Q7414 wd:Q1392453 }";
const IN_GAME = "?item wdt:P1441 ?w. ?w wdt:P31/wdt:P279* wd:Q7889.";
const NOT_WELL_KNOWN_ORG = onlyExact(ORG_ALLOW);
/** Series values that are lists, topics or tags rather than a franchise. */
const SERIES_SKIP = /^list of|\bin (film|video games?|popular culture|other media|comics)\b|\bwith\b|lgbt|characters?$/i;
const SERIES = (v: string) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+(film |movie |video game |game )?series$/i, "")} series`;
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
      f("series", "wdt:P179", series, SERIES_SKIP),
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
      f("series", "wdt:P179", series, SERIES_SKIP),
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
    vet: { bad: ["Q33999", "Q10800557", "Q10798782", "Q2405480", "Q4610556", "Q488111", "Q36180", "Q82955", "Q2066131"], strong: "wdt:P264", minStrong: 2 },
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
const pokeName = (s: string) => s.split("-").map(cap).join(" ");
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

const AN = (v: string) => (/^[A-Z]{2,3}\b/.test(v) ? /^[AEFHILMNORSX]/.test(v) : /^([aeio]|u(?!ni|se|ro|ra|ta|ke|fo))/i.test(v));
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
  vet: { bad: ["Q33999", "Q10800557", "Q10798782", "Q36180", "Q82955", "Q6625963", "Q28389", "Q2405480", "Q4610556", "Q488111"], strong: "wdt:P54", minStrong: 3 },
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
  minSitelinks: 5,
  limit: 2500,
  facts: [
    // No "From <country>" family: Wikidata's origin of a dish is too often a different country's (Rogan josh, Simit, Waffle).
    f("ingredient", "(wdt:P527|wdt:P186)", (v) => `Made with ${v}`),
    f("cuisine", "wdt:P2012", (v) => `Part of ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v), onlyExact(FOOD_KINDS)),
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
    // Only a place wholly in one country: a river or range that crosses borders has no single answer.
    one("country", "wdt:P17", (v) => `In ${place(v)}`),
    patchy(f("timezone", "wdt:P421", (v) => `In the ${v} time zone`, UTC_ONLY)),
    f("region", "wdt:P131", (v) => `In ${place(v)}`),
    f("range", "wdt:P4552", (v) => `In the ${v}`),
    f("mouth", "wdt:P403", (v) => `Flows into the ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v), onlyExact(KIND_ALLOW)),
    f("drives", "wdt:P1622", (v) => `Drives on the ${v}`),
  ],
};

SPECS.flags = {
  where: "?item wdt:P297 ?iso. FILTER NOT EXISTS { ?item wdt:P576 ?ended }",
  minSitelinks: 25,
  limit: 300,
  facts: [
    f("colour", "wdt:P163/wdt:P462", (v) => `Has ${v} on its flag`, /sky blue/i),
    patchy(f("symbol", "wdt:P163/wdt:P180", (v) => `Shows ${art(v)} on its flag`)),
    f("flagKind", "wdt:P163/wdt:P31", (v) => `Has ${AN(v) ? "an" : "a"} ${v} for a flag`, /flag/i),
    f("drives", "wdt:P1622", (v) => `Drives on the ${v}`),
    f("is", "wdt:P31", (v) => A_OR_AN(v), onlyExact(KIND_ALLOW)),
    patchy(f("timezone", "wdt:P421", (v) => `In the ${v} time zone`, UTC_ONLY)),
    { ...one("territory", "wdt:P17", (v) => `Belongs to ${place(v)}`), extra: "FILTER(?v != ?item)" },
    d("flagAdopted", "wdt:P163/wdt:P571", decade("Flag adopted")),
  ],
};

// ---------------- flags: Wikidata, with the ISO code as the image lookup ----------------
{
  const flagSpec = SPECS.flags as WdSpec;
  SPECS.flags = {
    exclusive: [...flagSpec.facts.filter((x) => x.exclusive).map((x) => x.kind), ...COUNTRY_EXCLUSIVE],
    answerOnly: flagSpec.facts.filter((x) => x.answerOnly).map((x) => x.kind),
    async load(ctx) {
      const ents = await ctx.wikidataPool(flagSpec);
      for (let i = 0; i < ents.length; i += 150) {
        const part = ents.slice(i, i + 150);
        const rows = await ctx.ask(`SELECT ?item ?iso WHERE { VALUES ?item { ${part.map((e) => "wd:" + e.id).join(" ")} } ?item wdt:P297 ?iso }`);
        const iso = new Map(rows.map((r) => [r.item, r.iso.toLowerCase()]));
        for (const e of part) if (iso.get(e.id)) e.q = iso.get(e.id);
      }
      const ok = ents.filter((e) => e.q);
      await addCountryFacts(ok, (e) => e.q, ctx.fetchJson);
      return ok;
    },
  };
}

// ---------------- geography: countries get the same dataset facts, found by ISO code ----------------
{
  const geoSpec = SPECS.geography as WdSpec;
  SPECS.geography = {
    exclusive: [...geoSpec.facts.filter((x) => x.exclusive).map((x) => x.kind), ...COUNTRY_EXCLUSIVE],
    answerOnly: geoSpec.facts.filter((x) => x.answerOnly).map((x) => x.kind),
    async load(ctx) {
      const ents = await ctx.wikidataPool(geoSpec);
      const iso = new Map<string, string>();
      for (let i = 0; i < ents.length; i += 150) {
        const rows = await ctx.ask(`SELECT ?item ?iso WHERE { VALUES ?item { ${ents.slice(i, i + 150).map((e) => "wd:" + e.id).join(" ")} } ?item wdt:P297 ?iso }`);
        for (const r of rows) iso.set(r.item, r.iso);
      }
      await addCountryFacts(ents, (e) => iso.get(e.id), ctx.fetchJson);
      return ents;
    },
  };
}

// ---------------- characters ----------------
const CHARACTER_FACTS: FactSpec[] = [
  f("universe", "wdt:P1080", (v) => `From the ${v.replace(/^the\s+/i, "").replace(/\s+universe$/i, "")} universe`),
  f("creator", "wdt:P170", (v) => `Created by ${v.replace(/\s*\([^)]*\)$/, "")}`),
  f("voice", "wdt:P725", (v) => `Voiced by ${v}`),
  f("member", "wdt:P463", (v) => `Member of ${v}`),
  f("appears", "wdt:P1441", (v) => `Appears in ${v}`),
];
// Heroes and villains: Wikidata-backed facts only (publisher and comic come from Wikidata too).
const HERO_FACTS: FactSpec[] = [
  ...CHARACTER_FACTS.filter((x) => x.kind !== "member"),
  f("member", "wdt:P463", (v) => `Member of ${v}`, onlyExact(TEAM_ALLOW)),
  f("publisher", "(wdt:P123|wdt:P1441/wdt:P123)", (v) => `Published by ${v}`),
  f("residence", "wdt:P551", (v) => `Lives in ${place(v)}`),
  one("birthplace", "wdt:P19", (v) => `Born in ${place(v)}`),
  seriesVia("?item wdt:P1441 ?w."),
  f("employer", "wdt:P108", (v) => `Works for ${v}`),
];
const FICTIONAL_CLASSES = "VALUES ?cls { wd:Q1114461 wd:Q95074 wd:Q15632617 wd:Q15773347 wd:Q1569167 wd:Q188784 } ?item wdt:P31 ?cls.";

const chunkLabels = (a: string[]) => Array.from({ length: Math.ceil(a.length / 100) }, (_, i) => a.slice(i * 100, i * 100 + 100));
/** Superheroes means comic-book heroes: the Superhero API also files Star Wars, Star Trek and film heroes as good. */
const COMICS_PUBLISHER = /marvel|dc comics|dark horse|image comics|wildstorm|vertigo|icon|boom|top cow|valiant|dynamite/i;
type Hero = { name: string; appearance: Record<string, string>; biography: Record<string, string>; work: Record<string, string>; connections: Record<string, string> };
/**
 * Heroes and villains. Members are the Superhero API's characters of that alignment plus the members of the given
 * Wikipedia categories (Wikipedia's own "supervillains" and "superheroes" lists), each tied to Wikidata for fame and facts.
 */
const heroSide = (side: "good" | "bad", categories: string[], otherCategories: string[]): CustomSpec => ({
  exclusive: ["firstApp"],
  // Colours come only from the API and the rest from patchy category lists: answers, never wrong options.
  answerOnly: ["eyes", "hair", "gender", "power", "member", "residence"],
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
    const gather = async (cats: string[], alignment: "good" | "bad") => {
      const titles = new Set<string>();
      for (const cat of cats) {
        let more = "";
        do {
          const d = await ctx.fetchJson<any>(`https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${cat}&cmlimit=500&cmtype=page&format=json${more}`);
          for (const m of d.query?.categorymembers ?? []) titles.add(m.title as string);
          more = d.continue?.cmcontinue ? `&cmcontinue=${encodeURIComponent(d.continue.cmcontinue)}` : "";
          await new Promise((r) => setTimeout(r, 1200));
        } while (more);
      }
      // The Superhero API files supporting cast (Lois Lane, Alfred) as "good", so only villains take members from it; heroes come from Wikipedia's lists alone.
      const out = new Set<string>(alignment === "bad" ? [...itemHero].filter(([, h]) => h.biography.alignment === "bad").map(([id]) => id) : []);
      const titleList = [...titles];
      for (let i = 0; i < titleList.length; i += 80) {
        const part = titleList.slice(i, i + 80).map((t) => `${JSON.stringify(t)}@en`);
        const rows = await ctx.ask(`SELECT DISTINCT ?item WHERE { VALUES ?t { ${part.join(" ")} } ?a schema:about ?item; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?t }`);
        for (const r of rows) out.add(r.item);
      }
      return out;
    };
    const own = await gather(categories, side);
    const other = await gather(otherCategories, side === "good" ? "bad" : "good");
    // A character both lists claim has no clear side: out of both.
    const members = new Set([...own].filter((id) => !other.has(id)));
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
    const found = await ctx.wikidataPool({ where, minSitelinks: Number(process.env.HERO_MIN_SL ?? 3), limit: 1500, facts: HERO_FACTS });
    const checked = await addCategoryFacts(found, ctx.fetchJson);
    const hand = new Set([...NEITHER, ...(side === "bad" ? NOT_VILLAINS : NOT_HEROES)].map((n) => n.toLowerCase()));
    for (const e of checked) {
      const h = itemHero.get(e.id);
      if (!h || h.biography.alignment !== side) continue;
      const put = (k: string, v?: string | null) => { if (v) (e.facts[k] ??= new Set()).add(v); };
      const ok = (v?: string) => (v && v !== "-" && v !== "null" && v.toLowerCase() !== "no hair" ? v : undefined);
      const eye = ok(h.appearance.eyeColor);
      put("eyes", eye && `Has ${eye.toLowerCase()} eyes`);
      const hair = ok(h.appearance.hairColor);
      put("hair", hair && `Has ${hair.toLowerCase()} hair`);
      if (h.appearance.gender === "Female") put("gender", "Female characters");
    }
    return checked.filter((e) => !hand.has(e.name.toLowerCase()));
  },
});
const HERO_CATEGORIES = ["Marvel_Comics_superheroes", "DC_Comics_superheroes", "Golden_Age_superheroes", "Image_Comics_superheroes", "Dark_Horse_Comics_superheroes"];
const VILLAIN_CATEGORIES = ["Marvel_Comics_supervillains", "DC_Comics_supervillains", "Film_supervillains", "Literary_villains", "Comics_supervillains", "Image_Comics_supervillains"];
SPECS.superheroes = heroSide("good", HERO_CATEGORIES, VILLAIN_CATEGORIES);
SPECS.villains = heroSide("bad", VILLAIN_CATEGORIES, HERO_CATEGORIES);

const FILM_GENRE_SKIP = /lgbt|\bwith\b|^(film|television|fiction|nonfiction|literature|art|music|work|drama)$|game|television/i;
const filmGenre = (v: string) => { const g = genreOf("films", FILM_SUFFIX)(v); return g && `From ${g.charAt(0) + g.slice(1).toLowerCase()}`; };

SPECS.disney = {
  where: "VALUES ?s { wd:Q127552 wd:Q1047410 wd:Q191224 wd:Q7414 wd:Q1392453 } ?w wdt:P31/wdt:P279* wd:Q202866; wdt:P272 ?s. ?item wdt:P1441 ?w; wdt:P31/wdt:P279* wd:Q95074.",
  minSitelinks: 1,
  limit: 1200,
  facts: [
    ...CHARACTER_FACTS,
    { ...fw("studio", IN_FILM, "wdt:P272", (v) => `From ${art(v)} film`), extra: "VALUES ?v { wd:Q127552 wd:Q1047410 wd:Q191224 wd:Q7414 wd:Q1392453 }" },
    // Not minWorks: most Disney characters are in one film, and requiring two leaves 33 daily and 15 practice. A cameo can still reach this fact.
    fw("director", IN_FILM, "wdt:P57", (v) => `From a film directed by ${v}`),
    // The character's first Disney-family work only, so a 1920 Treasure Island film does not date Jim Hawkins.
    dw("film", DISNEY_FILM, "wdt:P577", decade("From a Disney film released")),
    seriesVia(IN_FILM),
  ],
};

SPECS.movies = {
  where: "?w wdt:P31 wd:Q11424. ?item wdt:P1441 ?w; wdt:P31 wd:Q15773347.",
  minSitelinks: 6,
  limit: 1200,
  facts: [
    ...CHARACTER_FACTS,
    f("actor", "^pq:P453/ps:P161", (v) => `Played by ${v}`),
    { ...fw("director", IN_FILM, "wdt:P57", (v) => `From a film directed by ${v}`), minWorks: 2 },
    // No film-decade family: a character appears in remakes, spin-offs and parodies, so the year of "a film" is the wrong film too often.
    seriesVia(IN_FILM),
  ],
};

SPECS.videogames = {
  where: "?w wdt:P31 wd:Q7889. ?item wdt:P1441 ?w; wdt:P31 wd:Q1569167.",
  minSitelinks: 3,
  limit: 1500,
  facts: [
    // No "Created by": Wikidata gives a franchise creator for a character who was not his or her work (Helena Harper and Shinji Mikami).
    ...CHARACTER_FACTS.filter((x) => x.kind !== "creator"),
    seriesVia(IN_GAME),
    fw("platform", IN_GAME, "wdt:P400", (v) => `Appears in a game for ${v}`),
    { ...fw("genre", IN_GAME, "wdt:P136", (v) => { const g = v.replace(/\s+(video game|game)$/i, "").trim(); return g.length > 2 ? `From ${g.toLowerCase().replace(/\b(\d)d\b/g, "$1D")} games` : null; }, /lgbt|\bwith\b|character|^(film|television|fiction|nonfiction|literature|art|music|work|drama)$/i), minWorks: 2 },
    dw("game", IN_GAME, "wdt:P577", decade("Appears in a game released")),
  ],
};
