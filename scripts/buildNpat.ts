// Builds app/topicDraft/npat/data/<id>.json (the accepted answers for each Name Place Animal Thing category) and
// app/topicDraft/npat/categories.ts (category and set metadata only, safe for room screens to import).
// Each list is ordered by familiarity, most familiar first, and banded into tiers with bandTier (top 20% Common,
// then Solid, Rare, Deep Cut, bottom 25% Unicorn); the rank is then dropped. "Too Obvious" is never assigned here:
// only player history (Task 3) produces it.
// Run: npx tsx scripts/buildNpat.ts [id ...]   (no ids = every category)
//      npx tsx scripts/buildNpat.ts --aliases-only [--dry] [--verbose]   (re-filters the written lists' aliases offline; see aliasVerdict)
//
// Sources and licences:
// - Wikidata (CC0): the candidate entries for name, place, superhero, footballer, film, musician and tv, with their
//   English labels and aliases, read with SPARQL.
// - Wikipedia page views (Wikimedia pageviews, CC0), the last 60 days through the MediaWiki "pageviews" API: the
//   familiarity of people, places, animals and media (place, animal, superhero, footballer, film, musician, tv,
//   country, pokemon). For a word (animal, country) a redirect counts as its target page ("Puma" is "Cougar"). A
//   Wikidata item's own article is counted as it is: when that is only a redirect to a list page ("Mogo" to "List
//   of Green Lantern characters"), the list's views would rank it with the stars.
// - Open English WordNet 2025, "plus" edition with proper nouns (CC BY 4.0, https://github.com/globalwordnet/english-wordnet): which words are animals,
//   things (man-made objects) and foods, from each word's lexicographer file, with synonyms as aliases.
// - FrequencyWords en_50k, 2018 (Hermit Dave, from the OpenSubtitles 2018 corpus; content CC BY-SA 4.0,
//   https://github.com/hermitdave/FrequencyWords): the familiarity of everyday words (name, thing, food), how often
//   each word is said in film and TV subtitles. No CC0 or public-domain English frequency list with spoken-language counts was found
//   (wordfreq and the Wiktionary lists are CC BY-SA too; SUBTLEX and Google n-gram derivatives carry other terms),
//   so this one stays. Only its counts are used, to order words and set tiers; no text from it is copied, and the
//   committed words themselves come from WordNet. Attribution: Hermit Dave, FrequencyWords, CC BY-SA 4.0.
// - country: the 193 UN members and their aliases from Pecking Order's countries-population list (built from
//   Wikidata by scripts/buildPecking.ts), plus places commonly played as countries (England, Scotland, Wales,
//   Northern Ireland, Taiwan, Kosovo, Palestine, Vatican City), ranked by page views over the last 12 months
//   (Wikimedia REST pageviews, CC0), median month: a 60-day window, or one viral month, put countries in the news
//   near the top.
// - pokemon: every species' English name from Pecking Order's pokemon-bst list (PokéAPI). Most Pokémon have no
//   article of their own, only a redirect to a list page, so a Pokémon's familiarity is the views of its own title
//   ("<Name> (Pokémon)" when that page exists, else "<Name>"), redirect or not.
//
// Choices where the open data made the obvious list impractical:
// - name: given-name articles on Wikipedia are mostly disambiguation pages ("James" lists people called James), so
//   their page views measure curiosity, not how common a name is. The names are the 4,000 given names (P735) most
//   borne by people in Wikidata, and a name's familiarity is the worse of two ranks: how many people bear it, and
//   how often it is said in subtitles. Either alone misleads: subtitle counts make "Are" and "Will" top names, and
//   Wikidata's notable people favour old European names ("Johann").
// - thing: there is no open "list of things". A thing is a single everyday word whose most common noun sense in
//   WordNet is a man-made object (noun.artifact).
// - food: a single word whose most common noun sense is a food (noun.food), leaving out drinks (WordNet's
//   "beverage" and below), which a Food answer isn't.
// - animal: a WordNet animal (noun.animal) word or phrase, one entry per meaning with its synonyms as aliases, ranked
//   by the page views of its Wikipedia article ("<Word> (animal)", "(bird)" or "(fish)" when the word alone is a
//   disambiguation page or not an animal), counting only pages whose Wikidata item is a taxon, an organism known by
//   a common name or a breed.
// - place, animal, footballer: the 60-day views pick the candidates, then the best of them are re-ranked by their
//   median month over the last 12 months (Wikimedia REST pageviews, CC0), so news spikes don't decide the rank.
// - film, tv, musician, superhero: re-ranked on a long window instead: monthly views since January 2016, months
//   before a page existed counting as zero, busiest 20% of months dropped, then averaged. A 12-month window still
//   put this year's releases in Common ("The Odyssey", "Widow's Bay").
// - superhero: Wikidata has no clean "superhero" class; it is items whose occupation is superhero, or whose type is
//   superhero or one of its subclasses, leaving out characters Wikipedia's categories file under Marvel or DC
//   supervillains but not superheroes (Wikidata tags villains such as Lex Luthor as superheroes).
// - musician (one of the two extra categories): singers, rappers, singer-songwriters and musicians with articles in
//   at least 40 Wikipedias whose English Wikidata description calls them a singer, rapper, musician and so on
//   (Wikidata lists "singer" for many actors who once sang, and Tom Hanks or Clint Eastwood came near the top),
//   and bands with at least 30.
// - tv (the other): television series, animated series and miniseries with articles in at least 15 Wikipedias.
// EXCLUDE (per category) removes entries read and judged unfair after a build: a word that is mostly a verb, a
// plural or another meaning ("stand", "works"), a meal rather than a food ("dinner"), an animal rather than its meat
// ("dog"), a drug, a part of something, or a word nobody would play.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { bandTier, normAnswer as norm } from "../app/topicDraft/npat/rules";
import type { NpatEntry } from "../app/topicDraft/npat/source";

const ROOT = path.resolve(__dirname, "../app/topicDraft/npat");
const OUT = path.join(ROOT, "data");
const PECKING = path.resolve(__dirname, "../app/topicDraft/pecking/data");
const CACHE = path.join(os.tmpdir(), "npat-build-cache");
const UA = "TopPicNpatBot/1.0 (https://toppicgames.com; hello@toppicgames.com)";
const TODAY = new Date().toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chunk = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function get(url: string, init: RequestInit = {}): Promise<Response> {
  for (let i = 0; i < 8; i++) {
    try {
      const res = await fetch(url, { ...init, headers: { "User-Agent": UA, ...(init.headers as object) } });
      if (res.status === 429 || res.status >= 500) { await sleep(1000 * (Number(res.headers.get("retry-after")) || 3 * (i + 1))); continue; }
      if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 90)}`);
      return res;
    } catch (e) {
      if (i === 7) throw e;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error(`gave up on ${url.slice(0, 90)}`);
}
const getJson = async (url: string, init: RequestInit = {}) => (await get(url, { ...init, headers: { Accept: "application/json", ...(init.headers as object) } })).json();

/** A download kept between runs (the WordNet file is 11 MB). */
async function cached(name: string, url: string): Promise<Buffer> {
  const f = path.join(CACHE, name);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  fs.mkdirSync(CACHE, { recursive: true });
  const buf = Buffer.from(await (await get(url)).arrayBuffer());
  fs.writeFileSync(f, buf);
  return buf;
}

// ---------------- Wikidata ----------------
type Binding = Record<string, { value: string }>;
async function sparql(query: string, tries = 4): Promise<Binding[]> {
  let d: { results: { bindings: Binding[] } };
  try {
    d = await getJson("https://query.wikidata.org/sparql", {
    method: "POST",
    headers: { Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ query }).toString(),
    });
  } catch (e) {
    // A query that runs out of time can come back as cut-off JSON; ask again.
    if (tries <= 1) throw e;
    await sleep(5000);
    return sparql(query, tries - 1);
  }
  await sleep(500);
  return d.results.bindings;
}

/** Aliases worth matching: plain names, not codes, sentences or "Paris, France". */
const cleanAliases = (raw: string[], name: string, max = 6): string[] => {
  const keys = new Set([norm(name)]);
  const out: string[] = [];
  for (const a of raw.map((s) => s.trim())) {
    const k = norm(a);
    if (!k || k.length < 2 || keys.has(k) || a.length > 40 || /[,;()[\]/:]/.test(a)) continue;
    keys.add(k);
    out.push(a);
    if (out.length >= max) break;
  }
  return out;
};
/** "Thor (Marvel Comics)" reads as "Thor". */
const bare = (s: string) => s.replace(/\s*\([^)]*\)\s*$/, "").trim();

type Cand = { name: string; also?: string[]; titles?: string[]; score?: number; page?: string };

/** Wikidata items with an English Wikipedia article: label, article title and English aliases. `where` binds ?i. */
async function wikidata(where: string): Promise<Cand[]> {
  const rows = await sparql(`SELECT ?i ?title (SAMPLE(?lab) AS ?label) (GROUP_CONCAT(DISTINCT ?al; separator="|") AS ?aliases) WHERE {
    ${where}
    ?a schema:about ?i; schema:isPartOf <https://en.wikipedia.org/>; schema:name ?title .
    # Wikidata now keeps many labels only in "mul" (all languages): "The Godfather" has no "en" label.
    OPTIONAL { ?i rdfs:label ?en . FILTER(LANG(?en) = "en") }
    OPTIONAL { ?i rdfs:label ?mul . FILTER(LANG(?mul) = "mul") }
    BIND(COALESCE(?en, ?mul) AS ?lab) FILTER(BOUND(?lab))
    OPTIONAL { ?i skos:altLabel ?al . FILTER(LANG(?al) = "en" || LANG(?al) = "mul") }
  } GROUP BY ?i ?title`);
  return rows.map((r) => {
    const name = bare(r.label.value);
    // GROUP_CONCAT order varies between runs; sort so rebuilds give the same file.
    const aliases = String(r.aliases?.value ?? "").split("|").filter(Boolean).sort();
    return { name, also: cleanAliases(aliases, name), titles: [r.title.value] };
  });
}

// ---------------- Wikipedia page views ----------------
type PageInfo = { title: string; views: number; missing: boolean; disamb: boolean; item?: string };
const viewCache = new Map<string, PageInfo>();
/** Page views (60 days) for each title; with `follow`, a redirect reports its target's page and views. */
async function pageViews(titles: string[], follow: boolean): Promise<Map<string, PageInfo>> {
  const out = new Map<string, PageInfo>();
  const key = (t: string) => `${follow ? ">" : ""}${t}`;
  for (const t of titles) { const c = viewCache.get(key(t)); if (c) out.set(t, c); }
  const todo = [...new Set(titles)].filter((t) => !out.has(t));
  let done = 0;
  for (const part of chunk(todo, 50)) {
    const base = `https://en.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&prop=pageviews|pageprops&ppprop=disambiguation|wikibase_item&pvipdays=60${follow ? "&redirects=1" : ""}`;
    const body = new URLSearchParams({ titles: part.join("|") }).toString();
    type WikiPage = { title: string; missing?: boolean; invalid?: boolean; pageviews?: Record<string, number | null>; pageprops?: Record<string, string> };
    const pages = new Map<string, WikiPage>();
    const map: Record<string, string> = {};
    let cont: Record<string, string> = {};
    for (;;) {
      const d = await getJson(base + Object.entries(cont).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join(""), {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body,
      });
      for (const n of d.query?.normalized ?? []) map[n.from] = n.to;
      for (const r of d.query?.redirects ?? []) map[`>${r.from}`] = r.to;
      for (const p of d.query?.pages ?? []) {
        const prev: Partial<WikiPage> = pages.get(p.title) ?? {};
        pages.set(p.title, { ...prev, ...p, pageviews: { ...(prev.pageviews ?? {}), ...(p.pageviews ?? {}) } });
      }
      if (!d.continue) break;
      cont = d.continue;
      await sleep(100);
    }
    for (const t of part) {
      let t2 = map[t] ?? t;
      if (follow) t2 = map[`>${t2}`] ?? t2;
      const p = pages.get(t2);
      out.set(t, {
        title: t2,
        views: Object.values(p?.pageviews ?? {}).reduce((s: number, v) => s + ((v as number) ?? 0), 0),
        missing: !p || !!p.missing || !!p.invalid,
        disamb: !!p?.pageprops && "disambiguation" in p.pageprops,
        item: p?.pageprops?.wikibase_item,
      });
    }
    for (const t of part) viewCache.set(key(t), out.get(t)!);
    done += part.length;
    if (todo.length > 500 && done % 1000 < 50) process.stdout.write(".");
    await sleep(100);
  }
  return out;
}

const named = (c: Cand, page: string) => [c.name, ...(c.also ?? [])].some((n) => norm(n) === norm(bare(page)));

/** Scores candidates by the views of their most viewed title that is a real, non-disambiguation page. Candidates
 * that land on the same page keep only the first (most viewed). */
async function scoreByViews(cands: Cand[], follow: boolean, accept: (p: PageInfo) => boolean = () => true): Promise<Cand[]> {
  const info = await pageViews(cands.flatMap((c) => c.titles ?? []), follow);
  const seenPage = new Set<string>();
  return cands
    .map((c) => {
      const hit = (c.titles ?? []).map((t) => info.get(t)!).filter((p) => p && !p.missing && !p.disamb && accept(p)).sort((a, b) => b.views - a.views)[0];
      return { c, hit };
    })
    .filter((x) => x.hit && x.hit.views > 0)
    // Same page, same views: the candidate named like the page wins it ("Cat" over "Feline", "Lion" over "Lion cub").
    .sort((a, b) => b.hit!.views - a.hit!.views || Number(named(b.c, b.hit!.title)) - Number(named(a.c, a.hit!.title)))
    .filter((x) => { if (seenPage.has(x.hit!.title)) return false; seenPage.add(x.hit!.title); return true; })
    .map((x) => ({ ...x.c, score: x.hit!.views, page: x.hit!.title }));
}


/** Typical yearly views over the last 12 full months (Wikimedia REST pageviews, CC0), human readers only. Slower than pageViews
 * (one request per page), so only for short lists where a 60-day window swings with the news. */
async function monthlyViews(page: string, start: Date): Promise<{ months: number[]; span: number }> {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const span = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
  const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(page.replace(/ /g, "_"))}/monthly/${ymd(start)}/${ymd(end)}`, { headers: { "User-Agent": UA } }).catch(() => null);
  if (res?.status === 404) return { months: [], span }; // no views recorded in the window
  const d = res?.ok ? await res.json() : await getJson(res?.url || `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(page.replace(/ /g, "_"))}/monthly/${ymd(start)}/${ymd(end)}`);
  await sleep(100);
  return { months: (d.items ?? []).map((i: { views?: number }) => i.views ?? 0), span };
}

async function yearViews(page: string): Promise<number> {
  const now = new Date();
  const { months } = await monthlyViews(page, new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)));
  // The median month, times 12: one viral month (a World Cup run, a news story) doesn't decide the rank.
  months.sort((x, y) => x - y);
  return months.length ? 12 * months[Math.floor(months.length / 2)] : 0;
}

/** Lasting familiarity: monthly views since January 2016 (as far back as the REST data goes), months before a page
 * existed counting as zero, with the busiest 20% of months dropped before averaging. A film out this year has only
 * its few months to give, and those are its busiest, so it can't outrank a film people have looked up for a decade;
 * a decade-old classic keeps most of its months. */
async function longViews(page: string): Promise<number> {
  const { months, span } = await monthlyViews(page, new Date(Date.UTC(2016, 0, 1)));
  const all = [...months, ...Array(Math.max(0, span - months.length)).fill(0)].sort((x, y) => x - y);
  const kept = all.slice(0, Math.ceil(all.length * 0.8));
  return kept.length ? kept.reduce((n, v) => n + v, 0) / kept.length : 0;
}

/** Re-ranks the best of a page-view list by its last 12 months, so a film or show out this month doesn't outrank
 * the classics. Only the top `n` (by 60-day views) are fetched; the rest keep their 60-day order below them. */
async function byYear(cands: Cand[], n: number, long = false): Promise<Cand[]> {
  const head = [...cands].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const top = head.slice(0, n);
  for (const part of chunk(top, 4)) {
    await Promise.all(part.map(async (c) => {
      // Ties (pages too new to have kept months) fall back to their 60-day order.
      c.score = 1e12 + Math.round(long ? await longViews(c.page!) : await yearViews(c.page!)) + (c.score ?? 0) / 1e10;
    }));
  }
  return head;
}

/** Article titles in a Wikipedia category and its subcategories, `depth` levels down. */
async function categoryTitles(cat: string, depth: number, seen = new Set<string>()): Promise<Set<string>> {
  const out = new Set<string>();
  if (seen.has(cat)) return out;
  seen.add(cat);
  let cont: Record<string, string> = {};
  for (;;) {
    const q = new URLSearchParams({ action: "query", format: "json", formatversion: "2", list: "categorymembers", cmtitle: cat, cmlimit: "500", cmtype: "page|subcat", ...cont });
    const d = await getJson(`https://en.wikipedia.org/w/api.php?${q}`);
    for (const m of d.query.categorymembers) {
      if (m.ns === 14) { if (depth > 0) for (const t of await categoryTitles(m.title, depth - 1, seen)) out.add(t); }
      else out.add(m.title);
    }
    if (!d.continue) break;
    cont = d.continue;
  }
  return out;
}

// ---------------- word frequency (FrequencyWords, OpenSubtitles 2018) ----------------
let freqCache: Map<string, number> | undefined;
async function frequency(): Promise<Map<string, number>> {
  if (freqCache) return freqCache;
  const txt = (await cached("en_50k.txt", "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt")).toString("utf8");
  freqCache = new Map();
  for (const line of txt.split("\n")) {
    const [w, n] = line.trim().split(" ");
    if (w && n && !freqCache.has(w)) freqCache.set(w, Number(n));
  }
  return freqCache;
}

/** How many people in Wikidata have each given name: the 4,000 most borne names (P735), by English label. */
let namesCache: Map<string, number> | undefined;
async function givenNames(): Promise<Map<string, number>> {
  if (namesCache) return namesCache;
  const borne = await sparql(`SELECT ?g (COUNT(*) AS ?n) WHERE { ?p wdt:P735 ?g . } GROUP BY ?g ORDER BY DESC(?n) LIMIT 4000`);
  const people = new Map<string, number>();
  for (const part of chunk(borne, 400)) {
    const ids = part.map((r) => `wd:${String(r.g.value).split("/").pop()}`).join(" ");
    // English label, else the "mul" (all languages) label that Wikidata now uses for many names.
    const labels = await sparql(`SELECT ?g (COALESCE(SAMPLE(?en), SAMPLE(?mul)) AS ?lab) WHERE { VALUES ?g { ${ids} }
      OPTIONAL { ?g rdfs:label ?en . FILTER(LANG(?en) = "en") } OPTIONAL { ?g rdfs:label ?mul . FILTER(LANG(?mul) = "mul") } } GROUP BY ?g`);
    const count = new Map(part.map((r) => [r.g.value, Number(r.n.value)]));
    for (const l of labels) {
      if (!l.lab) continue;
      const name = String(l.lab.value).trim();
      if (/^\p{Lu}[\p{Ll}'-]+$/u.test(name)) people.set(name, (people.get(name) ?? 0) + (count.get(l.g.value) ?? 0));
    }
  }
  namesCache = people;
  return people;
}

// ---------------- Open English WordNet ----------------
type Synset = { id: string; lexfile: string; members: string[]; hypernyms: string[] };
type WordNet = {
  synsets: Map<string, Synset>;
  senses: Map<string, string[]>; // lemma -> noun synsets, most common first
  lemmaOf: Map<string, string>;
  modifiers: Set<string>; // lemmas that are also adjectives or adverbs
};
let wnCache: WordNet | undefined;
async function wordnet(): Promise<WordNet> {
  if (wnCache) return wnCache;
  const xml = zlib.gunzipSync(await cached("english-wordnet-2025-plus.xml.gz", "https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-plus.xml.gz")).toString("utf8");
  const dec = (s: string) => s.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const senses = new Map<string, string[]>();
  const lemmaOf = new Map<string, string>();
  const modifiers = new Set<string>();
  for (const m of xml.matchAll(/<LexicalEntry id="([^"]+)">\s*<Lemma writtenForm="([^"]*)" partOfSpeech="([a-z])"[\s\S]*?<\/LexicalEntry>/g)) {
    const lemma = dec(m[2]!);
    if (m[3] !== "n") { if (m[3] !== "v") modifiers.add(lemma); continue; }
    lemmaOf.set(m[1]!, lemma);
    const ids = [...m[0].matchAll(/<Sense [^>]*synset="([^"]+)"/g)].map((s) => s[1]!);
    senses.set(lemma, [...(senses.get(lemma) ?? []), ...ids]);
  }
  const synsets = new Map<string, Synset>();
  for (const m of xml.matchAll(/<Synset id="([^"]+)"[^>]*members="([^"]*)"[^>]*partOfSpeech="n"[^>]*lexfile="([^"]+)"[^>]*>([\s\S]*?)<\/Synset>/g)) {
    synsets.set(m[1]!, {
      id: m[1]!, lexfile: m[3]!,
      members: m[2]!.split(" ").map((e) => lemmaOf.get(e)).filter((x): x is string => !!x),
      hypernyms: [...m[4]!.matchAll(/relType="(?:hypernym|instance_hypernym)" target="([^"]+)"/g)].map((h) => h[1]!),
    });
  }
  wnCache = { synsets, senses, lemmaOf, modifiers };
  return wnCache;
}
const under = (wn: WordNet, id: string, root: string, seen = new Set<string>()): boolean => {
  if (id === root) return true;
  if (seen.has(id)) return false;
  seen.add(id);
  return (wn.synsets.get(id)?.hypernyms ?? []).some((h) => under(wn, h, root, seen));
};
const synsetOf = (wn: WordNet, lemma: string, lexfile: string) => (wn.senses.get(lemma) ?? []).map((s) => wn.synsets.get(s)).find((s) => s?.lexfile === lexfile);

/** Words people say for a thing in `lexfile`, ranked by how often they're said. A word qualifies when its most common
 * `lexfile` sense passes `keep` and its most common noun sense of all is in one of `firstIn`. Subtitle counts
 * can't tell a word's meanings apart, so words that are mostly something else are left out: adjectives and adverbs
 * ("still", "safe"), words that are also a proper noun in WordNet ("china") and given names ("mike", "frank"),
 * unless kept by `allow`.
 * A plural whose singular is on the list ("rings") becomes the singular's alias. */
async function everyday(lexfile: string, firstIn: string[], keep: (wn: WordNet, s: Synset) => boolean, allow: string[]): Promise<Cand[]> {
  const [wn, freq, names] = await Promise.all([wordnet(), frequency(), givenNames()]);
  const ok = new Set(allow);
  const out = new Map<string, Cand>();
  for (const [lemma, ids] of wn.senses) {
    if (!/^[a-z]{3,}$/.test(lemma)) continue;
    const syns = ids.map((i) => wn.synsets.get(i)!).filter(Boolean);
    const sense = syns.find((s) => s.lexfile === lexfile);
    if (!sense || !keep(wn, sense) || !firstIn.includes(syns[0]!.lexfile)) continue;
    if (!ok.has(lemma) && (wn.modifiers.has(lemma) || wn.senses.has(cap(lemma)) || names.has(cap(lemma)))) continue;
    const score = freq.get(lemma);
    if (!score || score < 30) continue;
    const also = sense.members.filter((m) => m !== lemma && /^[a-z][a-z' -]*$/.test(m));
    out.set(lemma, { name: cap(lemma), also: cleanAliases(also.map(cap), lemma, 3), score });
  }
  for (const [w, c] of out) {
    const one = [w.slice(0, -1), w.slice(0, -2)].find((s) => w.endsWith("s") && s !== w && out.has(s));
    if (!one) continue;
    const s = out.get(one)!;
    s.also = [...(s.also ?? []), c.name];
    out.delete(w);
  }
  return [...out.values()];
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------- the categories ----------------
type Spec = { title: string; blurb: string; source: string; top: number; build: () => Promise<Cand[]> };

const EXCLUDE: Record<string, string[]> = {
  name: [],
  place: [],
  superhero: ["Lex Luthor"],
  // Its page views come from people typing "xxx" into Wikipedia's search, not from the films' fame.
  film: ["xXx", "xXx Return of Xander Cage", "xXx: Return of Xander Cage", "xXx: State of the Union"],
  animal: [
    "Homo", "Human", "Metazoan", "Bird", "Mammal", "Fish", "Arthropod", "Chordate", "Insect", "Reptile", "Vertebrate",
    "Invertebrate", "Mollusk", "Crustacean", "Arachnid", "Amphibia", "Cephalopod", "Primate", "Rodent", "Marsupial",
    "Ungulate", "Cetacean", "Even-toed ungulate", "Odd-toed ungulate", "Tetrapod", "Amniote", "Synapsid",
    "Archosaur", "Bovid", "Ruminant", "Lagomorph", "Echinoderm", "Coelenterate", "Gastropod", "Bivalve", "Annelid",
    "Myriapod", "Placental", "Monotreme", "Chelonian", "Elasmobranch", "Teleost fish", "Bony fish",
    "Cartilaginous fish", "Musteline mammal", "Fissiped mammal", "Pinniped mammal", "Perching bird", "Oscine",
    "Anthropoid ape", "Lesser ape", "Simian", "Catarrhine", "Platyrrhine", "Procyonid", "Viverrine", "Phasianid",
    "Equine", "Bovine", "Canine", "Feline", "Lion cub", "Tiger cub", "Bear cub", "Eyas", "Parr", "Dipterous insect",
    "Lepidopterous insect", "Hymenopterous insect", "Leporid", "Proboscidean", "Ratite", "Gnathostome",
    "Jawless vertebrate", "Crossopterygian", "Holometabola", "Brachyuran", "Malacostracan crustacean",
    "Colubrid snake", "Elapid", "Acarine", "Bombycid", "Ephemerid", "Collembolan", "Saurischian", "Ornithischian",
    "Theropod", "Pterosaur", "Edentate", "Bird of prey", "Waterfowl", "Ape", "Protoctist", "Sarcodinian",
    "Protozoan", "Cur", "Punkie", "Ern", "Peba", "Conenose", "Chigoe",
  ],
  thing: [
    "Everything", "Haven", "Die", "Mine", "Stand", "Felt", "Works", "Grab", "Arms", "Rings", "Ways", "Stole",
    "Hanging", "Spoke", "Release", "Wash", "Settle", "Load", "Cure", "Gather", "Stays", "Stopping", "Landing",
    "Facing", "Transport", "Dive", "Dope", "Addition", "Choke", "Cope", "Housing", "Assembly", "Layer", "Setup",
    "Shook", "Mack", "Kat", "Trump", "Casting", "Sights", "Loading", "Slit", "Links", "Bender", "Warmer",
    "Overlapping", "Pike", "Combine", "Slug", "Mend", "Douche", "Butt", "Turtle", "Product", "System", "Structure",
    "Facility", "Steps", "Seats", "Colors", "Colours", "Bones", "Quarters", "Chains", "Boards", "Stocks", "Tails",
    "Woof", "Reset", "Pry", "Modeling", "Override", "Flats", "Digs", "Weeds", "Weave", "Starter", "Import", "Export",
    "Output", "Obstruction", "Segment", "Shay", "Huck", "Coping", "Tam", "Whatnot", "Mound", "Overload",
    "Innovation", "Infrastructure", "Mow", "Joss", "Ironing", "Skid", "Irons", "Piling", "Commodity", "Croft",
    "Taping", "Gunpoint", "Lockup", "Gage", "Vibes", "Synchro", "Trivia", "Bolo", "Garner", "Seizing", "Ell", "Snip",
    "Remake", "Springer", "Gunny", "Mongrel", "Scourge", "Cache", "Shim", "Cuddy", "Handiwork", "Detox", "Trapping",
    "Bennie", "Mending", "Consignment", "Baldrick", "Dory", "Workings", "Kamikaze", "Downer", "Smoother", "Topside",
    "Jammer", "Ware", "Compress", "Getup", "Tamper", "Bagging", "Hookup", "Hoarding", "Bung", "Nog", "Pave", "Coax",
    "Hone", "Gaff", "Fess", "Lapping", "Clench", "Thwart", "Plummet", "Traverse", "Hoy", "Jakes", "Mews", "Gad",
    "Improvisation", "Gig", "Shooter", "Dose", "Moulin", "Cristal", "Membrane", "Ply", "Wrap", "Art", "Drug",
    "Launch", "Heroin", "Cocaine", "Meth", "Opium", "Morphine", "Ketamine", "Methadone", "Methamphetamine",
    "Hashish", "Atropine", "Chloroform", "Placebo", "Nuke", "Harem", "Brig", "Wedgie", "Reefer", "Dickie", "Derby",
    "Rook", "Knuckles", "Fiddle", "Junction", "Transit", "Workplace", "Arsenal", "Forgery", "Knit", "Interface",
    "Seating", "Dwelling", "Attire", "Weaponry", "Airway", "Hotline", "Madhouse", "Roadside", "Stronghold", "Corral",
    "Dredge", "Galley", "Lodging", "Lager", "Ballpark", "Warhead", "Conduit", "Sweats", "Bling", "Plating",
    "Woodwork", "Sanatorium", "Enclosure", "Koto", "Microfilm", "Ordnance", "Nautilus", "Manta", "Panzer", "Gunnery",
    "Bullpen", "Coulter", "Macintosh", "Deflector", "Garb", "Ringside", "Argyle", "Breech", "Fulcrum", "Gearing",
    "Paraphernalia", "Smokescreen", "Motif", "Clockwork", "Circuitry", "Apparel", "Upholstery",
  ],
  food: [
    "Drink", "Dog", "Bird", "Helping", "Treat", "Feed", "Mix", "Blade", "Diet", "Eats", "Swallow", "Murphy", "Chew", "Sub",
    "Organs", "Marge", "Rack", "Tuck", "Baba", "Hay", "Rue", "Goody", "Cling", "Provisions", "Grub", "Ration",
    "Grinder", "Snowball", "Cisco", "Sup", "Slop", "Duff", "Coloring", "Colouring", "Nightcap", "Mulligan", "Weenie",
    "Steamer", "Refreshment", "Nourishment", "Milt", "Fryer", "Draught", "Blanc", "Bleu", "Conserve", "Rump", "Cob",
    "Glaze", "Sustenance", "Swill", "Concoction", "Sinker", "Windfall", "Forage", "Manna", "Larder", "Goober",
    "Teatime", "Cookout", "Potluck", "Tidbit", "Nosh", "Kibble", "Sop", "Pud", "Junket", "Wort", "Birdseed",
    "Wintergreen", "Tiffin", "Delicatessen", "Cuisine", "Produce", "Serving", "Gluten", "Dinner", "Lunch",
    "Breakfast", "Supper", "Brunch", "Luncheon", "Meal", "Julienne", "Bap", "Morello", "Alfalfa", "Quahog",
  ],
};

/** Words kept although WordNet also has them as a proper noun or an adjective. */
const KEEP: Record<string, string[]> = {
  thing: [],
  food: ["turkey", "sweet"],
};

const SPECS: Record<string, Spec> = {
  name: {
    title: "Name", blurb: "A first name", top: 1500,
    source: "Wikidata given names (how many people bear each) and FrequencyWords (OpenSubtitles 2018, CC BY-SA 4.0)",
    build: async () => {
      const freq = await frequency();
      const people = await givenNames();
      // A familiar name is both widely borne and widely said, so each name ranks by the worse of its two ranks. That
      // keeps names that are also everyday words ("Will", "Are") from ranking on the word's count alone.
      const rankBy = (score: (n: string) => number) => {
        const r = new Map<string, number>();
        [...people.keys()].filter((n) => score(n) > 0).sort((a, b) => score(b) - score(a)).forEach((n, i) => r.set(n, i));
        return r;
      };
      const byPeople = rankBy((n) => people.get(n) ?? 0);
      const bySaid = rankBy((n) => freq.get(n.toLowerCase()) ?? 0);
      return [...people.keys()].filter((n) => bySaid.has(n) && (freq.get(n.toLowerCase()) ?? 0) >= 30).map((n) => {
        const [lo, hi] = [byPeople.get(n)!, bySaid.get(n)!].sort((x, y) => x - y);
        return { name: n, score: -(hi! * 10_000 + lo!) };
      });
    },
  },
  place: {
    title: "Place", blurb: "A city, country, state or continent", top: 2000,
    source: "Wikidata (big cities, capitals, countries, states and provinces, continents); familiarity from Wikipedia page views",
    build: async () => byYear(await scoreByViews(await wikidata(`{ VALUES ?t { wd:Q1549591 wd:Q3624078 wd:Q35657 wd:Q11828004 wd:Q5852411 wd:Q3336843 wd:Q5107 } ?i wdt:P31 ?t . }
      UNION { ?c wdt:P31 wd:Q3624078; wdt:P36 ?i . }`), false), 2600).then(shortCountryNames),
  },
  animal: {
    title: "Animal", blurb: "Any animal: mammal, bird, fish, insect and more", top: 1500,
    source: "Open English WordNet 2025 (CC BY 4.0); familiarity from Wikipedia page views",
    build: async () => {
      const wn = await wordnet();
      // Under WordNet's "animal": its noun.animal file also holds viruses, bacteria and algae.
      const root = synsetOf(wn, "animal", "noun.Tops")!.id;
      const cands: Cand[] = [];
      for (const s of wn.synsets.values()) {
        if (s.lexfile !== "noun.animal" || !under(wn, s.id, root)) continue;
        const words = s.members.filter((m) => /^[a-z][a-z' -]*$/.test(m) && m.split(" ").length <= 3);
        if (!words.length) continue;
        cands.push({ name: cap(words[0]!), also: cleanAliases(words.slice(1).map(cap), words[0]!, 4), titles: words.flatMap((w) => [cap(w), `${cap(w)} (animal)`, `${cap(w)} (bird)`, `${cap(w)} (fish)`]) });
      }
      // A word's page must be an animal: Wikidata says its item is a taxon, an organism known by a common name
      // ("Dog") or a breed. "Turkey" alone is the country, so the bird's page ("Turkey (bird)") counts instead.
      const info = await pageViews(cands.flatMap((c) => c.titles!), true);
      const items = [...new Set([...info.values()].map((p) => p.item).filter((i): i is string => !!i))];
      const animals = new Set<string>();
      for (const part of chunk(items, 300)) {
        const rows = await sparql(`SELECT DISTINCT ?i WHERE { VALUES ?i { ${part.map((i) => `wd:${i}`).join(" ")} }
          { ?i wdt:P171 [] } UNION { ?i wdt:P31/wdt:P279* wd:Q55983715 } UNION { ?i wdt:P31/wdt:P279* wd:Q38829 } }`);
        for (const r of rows) animals.add(String(r.i.value).split("/").pop()!);
      }
      const scored = await byYear(await scoreByViews(cands, true, (p) => !!p.item && animals.has(p.item)), 2000);
      // Name each animal as its page does when that is one of its words: "Polar bear", not WordNet's "Ice bear".
      return scored.map((c) => {
        const word = [c.name, ...(c.also ?? [])].find((w) => norm(w) === norm(bare(c.page!)));
        return word && word !== c.name ? { ...c, name: word, also: [c.name, ...(c.also ?? []).filter((w) => w !== word)] } : c;
      });
    },
  },
  thing: {
    title: "Thing", blurb: "An object, something people make and use", top: 1500,
    source: "Open English WordNet 2025 (CC BY 4.0); familiarity from FrequencyWords (OpenSubtitles 2018, CC BY-SA 4.0)",
    build: () => everyday("noun.artifact", ["noun.artifact"], () => true, KEEP.thing),
  },
  superhero: {
    title: "Superhero", blurb: "A superhero from comics, film or TV", top: 1000,
    source: "Wikidata (superheroes); familiarity from Wikipedia page views",
    build: async () => {
      // Wikidata tags some villains as superheroes (Lex Luthor), and it tags no character as a supervillain. So a
      // character drops out when Wikipedia files it under Marvel or DC supervillains and not under their superheroes;
      // antiheroes in both (Catwoman) stay.
      const cats = async (kind: string) => {
        const all = new Set<string>();
        for (const pub of ["Marvel Comics", "DC Comics"]) for (const t of await categoryTitles(`Category:${pub} ${kind}`, 2)) all.add(t);
        return all;
      };
      const [heroes, villains] = [await cats("superheroes"), await cats("supervillains")];
      const cands = await wikidata(`{ ?i wdt:P106 wd:Q188784 . } UNION { ?i wdt:P31/wdt:P279* wd:Q188784 . }`);
      return byYear(await scoreByViews(cands.filter((c) => !c.titles!.some((t) => villains.has(t) && !heroes.has(t))), false), 1300, true);
    },
  },
  footballer: {
    title: "Footballer", blurb: "A football (soccer) player, past or present; surnames count", top: 1500,
    source: "Wikidata (association football players with articles in 40+ Wikipedias); familiarity from Wikipedia page views",
    build: async () => {
      const cands = await wikidata(`?i wdt:P106 wd:Q937857; wikibase:sitelinks ?s . FILTER(?s >= 40)`);
      return byYear(await scoreByViews(cands.map((c) => ({ ...c, also: cleanAliases([surname(c.name), ...(c.also ?? [])].filter(Boolean) as string[], c.name) })), false), 2000);
    },
  },
  film: {
    title: "Film", blurb: "A film title", top: 1500,
    source: "Wikidata (films with articles in 35+ Wikipedias); familiarity from Wikipedia page views",
    build: async () => byYear(await scoreByViews(await wikidata(`?i wdt:P31 wd:Q11424; wikibase:sitelinks ?s . FILTER(?s >= 35)`), false), 2000, true),
  },
  food: {
    title: "Food", blurb: "Something to eat: a dish, fruit, vegetable or ingredient", top: 1200,
    source: "Open English WordNet 2025 (CC BY 4.0); familiarity from FrequencyWords (OpenSubtitles 2018, CC BY-SA 4.0)",
    build: async () => {
      const wn = await wordnet();
      const beverage = synsetOf(wn, "beverage", "noun.food")!.id;
      // Fruit, vegetables and fish are mostly plants and animals in WordNet, with a food sense after.
      return everyday("noun.food", ["noun.food", "noun.plant", "noun.animal"], (w, s) => !under(w, s.id, beverage), KEEP.food);
    },
  },
  country: {
    title: "Country", blurb: "A country, including the four UK nations", top: 400,
    source: "UN members (Wikidata, via Pecking Order's country list) plus the UK nations, Taiwan, Kosovo, Palestine and Vatican City; familiarity from Wikipedia page views",
    build: async () => {
      const un = JSON.parse(fs.readFileSync(path.join(PECKING, "countries-population.json"), "utf8")).items as { name: string; aliases?: string[] }[];
      const extra: Cand[] = [
        { name: "England" }, { name: "Scotland" }, { name: "Wales" }, { name: "Northern Ireland" },
        { name: "Taiwan", also: ["Republic of China"] }, { name: "Kosovo" },
        { name: "Palestine", also: ["State of Palestine"], titles: ["State of Palestine"] },
        { name: "Vatican City", also: ["Vatican", "Holy See"] },
      ];
      const titles: Record<string, string> = { Georgia: "Georgia (country)", Ireland: "Republic of Ireland", Micronesia: "Federated States of Micronesia" };
      const cands: Cand[] = [...un.map((c): Cand => ({ name: c.name, also: c.aliases ?? [] })), ...extra]
        .map((c) => ({ ...c, also: cleanAliases(c.also ?? [], c.name), titles: c.titles ?? [titles[c.name] ?? c.name, `${c.name} (country)`] }));
      const out = await scoreByViews(cands, true);
      // A country's 60-day views swing with the news, so countries rank by the last 12 months instead.
      for (const c of out) c.score = await yearViews(c.page!);
      if (out.length !== cands.length) throw new Error(`country: no page for ${cands.filter((c) => !out.some((o) => o.name === c.name)).map((c) => c.name).join(", ")}`);
      return out;
    },
  },
  pokemon: {
    title: "Pokémon", blurb: "Any Pokémon species", top: 1100,
    source: "PokéAPI species names (via Pecking Order's Pokémon list); familiarity from Wikipedia page views",
    build: async () => {
      const mons = JSON.parse(fs.readFileSync(path.join(PECKING, "pokemon-bst.json"), "utf8")).items as { name: string }[];
      // A Pokémon with its own article ("Pikachu", or "Golem (Pokémon)" when "Golem" is something else) scores that
      // article's views. One without scores the views of its redirects, but "Golem" is only counted when it leads to
      // the Pokémon, not to the folklore.
      const names = mons.map((m) => m.name);
      const titles = names.flatMap((n) => [`${n} (Pokémon)`, n]);
      const [to, own] = [await pageViews(titles, true), await pageViews(titles, false)];
      return names.map((n) => {
        const poke = to.get(`${n} (Pokémon)`)!, bare = to.get(n)!;
        const page = !poke.missing ? poke.title : bare.title;
        const isMon = (p: PageInfo) => !p.missing && !p.disamb && p.title === page;
        if (page === n || page === `${n} (Pokémon)`) return { name: n, score: 1e9 + to.get(page === n ? n : `${n} (Pokémon)`)!.views };
        const score = (isMon(poke) ? own.get(`${n} (Pokémon)`)!.views : 0) + (isMon(bare) ? own.get(n)!.views : 0);
        return { name: n, score };
      }).filter((c) => c.score > 0);
    },
  },
  musician: {
    title: "Musician", blurb: "A singer, rapper, musician or band", top: 1500,
    source: "Wikidata (singers, rappers and musicians in 40+ Wikipedias, bands in 30+); familiarity from Wikipedia page views",
    build: async () => {
      const people = await wikidata(`VALUES ?o { wd:Q177220 wd:Q2252262 wd:Q639669 wd:Q488205 } ?i wdt:P106 ?o; wikibase:sitelinks ?s . FILTER(?s >= 40)
        ?i schema:description ?d . FILTER(LANG(?d) = "en" && REGEX(?d, "singer|rapper|musician|songwriter|band|guitarist|drummer|pianist|vocalist|DJ|composer|record producer", "i"))
        # "American actress and singer" is an actor first; "singer and actress" stays.
        FILTER(!REGEX(?d, "(actor|actress|comedian|presenter|television personality|model)[^;]*(singer|rapper|musician|songwriter|band|guitarist|drummer|pianist|vocalist|DJ|composer|record producer)", "i"))`);
      const bands = await wikidata(`VALUES ?t { wd:Q215380 wd:Q5741069 } ?i wdt:P31 ?t; wikibase:sitelinks ?s . FILTER(?s >= 30)`);
      return byYear(await scoreByViews([...people, ...bands], false), 2000, true);
    },
  },
  tv: {
    title: "TV show", blurb: "A television series, cartoon or miniseries", top: 1200,
    source: "Wikidata (TV series, animated series and miniseries in 15+ Wikipedias); familiarity from Wikipedia page views",
    build: async () => byYear(await scoreByViews(await wikidata(`VALUES ?t { wd:Q5398426 wd:Q581714 wd:Q1259759 } ?i wdt:P31 ?t; wikibase:sitelinks ?s . FILTER(?s >= 15)`), false), 1600, true),
  },
};
const ORDER = Object.keys(SPECS);
const CLASSIC = ["name", "place", "animal", "thing"];
/** Categories with no topic set: too few letters have 15 answers (Country: only B, C, K, M, R, S). They can still be
 * picked for a Custom game. */
const NO_SET = ["country"];

/** Wikidata labels some countries by their long names ("People's Republic of China"); use the short name players
 * type, from Pecking Order's country list, keeping the long one as an alias. */
function shortCountryNames(cands: Cand[]): Cand[] {
  const un = JSON.parse(fs.readFileSync(path.join(PECKING, "countries-population.json"), "utf8")).items as { name: string; aliases?: string[] }[];
  const short = new Map<string, string>();
  for (const c of un) for (const a of [c.name, ...(c.aliases ?? [])]) short.set(norm(a), c.name);
  return cands.map((c) => {
    const to = short.get(norm(c.name));
    return to && to !== c.name ? { ...c, name: to, also: [c.name, ...(c.also ?? [])] } : c;
  });
}

/** "Lionel Messi" is played as "Messi", "Virgil van Dijk" as "van Dijk". */
function surname(name: string): string | null {
  const w = name.split(" ");
  if (w.length < 2) return null;
  let i = w.length - 1;
  while (i > 1 && /^(van|von|de|der|den|da|di|del|dos|das|le|la|ter|ten)$/i.test(w[i - 1]!)) i--;
  return w.slice(i).join(" ");
}

function entries(id: string, cands: Cand[]): NpatEntry[] {
  const skip = new Set((EXCLUDE[id] ?? []).map(norm));
  const seen = new Set<string>();
  const rows = cands
    .filter((c) => c.name && !skip.has(norm(c.name)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name))
    .filter((c) => { const k = norm(c.name); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, SPECS[id]!.top);
  return rows.map((c, i) => {
    const e: NpatEntry = { name: c.name, tier: bandTier(i, rows.length) };
    const also = cleanAliases(c.also ?? [], c.name);
    if (also.length) e.also = also;
    return e;
  });
}

// ---------------- metadata ----------------
type Meta = { id: string; title: string; blurb: string; source: string; asOf: string; letters: string };

/** The letters a category has at least 15 answers for (the same count `lettersAvailable` makes, hard letters included),
 * read back from the written list so the lobby can tell which letters a mix fits without loading any answers. */
function lettersOf(id: string): string {
  const list: NpatEntry[] = JSON.parse(fs.readFileSync(path.join(OUT, `${id}.json`), "utf8"));
  const counts = new Map<string, number>();
  for (const e of list) {
    const firsts = new Set([e.name, ...(e.also ?? [])].map((a) => norm(a).charAt(0).toUpperCase()).filter((c) => c >= "A" && c <= "Z"));
    for (const c of firsts) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 15).map(([c]) => c).sort().join("");
}
function writeMeta(built: string[]) {
  const prev = new Map<string, Meta>();
  const metaFile = path.join(ROOT, "categories.ts");
  if (fs.existsSync(metaFile)) for (const m of fs.readFileSync(metaFile, "utf8").matchAll(/^  (\{"id".*\}),$/gm)) { const x = JSON.parse(m[1]!); if (x.blurb) prev.set(x.id, x); }
  const cats: Meta[] = ORDER.filter((id) => fs.existsSync(path.join(OUT, `${id}.json`)))
    .map((id) => ({ id, title: SPECS[id]!.title, blurb: SPECS[id]!.blurb, source: SPECS[id]!.source, asOf: built.includes(id) ? TODAY : prev.get(id)?.asOf ?? TODAY, letters: lettersOf(id) }));
  const sets = [
    { id: "classic", title: "Classic", categories: CLASSIC },
    ...cats.filter((c) => !CLASSIC.includes(c.id) && !NO_SET.includes(c.id)).map((c) => ({ id: c.id, title: c.title, categories: [c.id, ...topicPartners()] })),
  ];
  const body = `// Written by scripts/buildNpat.ts. Category and set metadata only: no answers, so room screens can import it.\n` +
    `export type NpatCategory = { id: string; title: string; blurb: string; source: string; asOf: string; letters: string };\n` +
    `export type NpatSet = { id: string; title: string; categories: string[] };\n\n` +
    `export const NPAT_CATEGORIES: NpatCategory[] = [\n${cats.map((m) => `  ${JSON.stringify(m)},`).join("\n")}\n];\n\n` +
    `/** Classic first; then one set per topic category (not Country: too few letters): the topic plus Name, Animal, Thing. */\n` +
    `export const NPAT_SETS: NpatSet[] = [\n${sets.map((s) => `  ${JSON.stringify(s)},`).join("\n")}\n];\n\n` +
    `export const categoryOf = (id: string): NpatCategory | undefined => NPAT_CATEGORIES.find((c) => c.id === id);\n` +
    `export const setOf = (id: string): NpatSet | undefined => NPAT_SETS.find((s) => s.id === id);\n`;
  fs.writeFileSync(metaFile, body);
}

/** A topic set is the topic plus Name, Animal and Thing; Place is the one dropped because it overlaps Country and is
 * the classic players find easiest, so the topic takes its slot. */
const topicPartners = (): string[] => ["name", "animal", "thing"];

// ---------------- alias re-filter ----------------
// Wikidata and WordNet aliases include nicknames, old and foreign names and plain words that let a wrong answer in with
// no vote ("Evil" as Eminem, "Painter" as a cougar, "Augusta" as London) and count toward a letter's 15 answers.
// `--aliases-only` re-filters the written lists offline with these rules, keeping names, tiers and order:
// - every category: Latin script only; no slur (SLURS) and not a generic word (GENERIC); at least 3 characters once normalised; no
//   foreign function word ("de", "la", "der" and so on) the name doesn't have.
// - people (PEOPLE): the alias shares a word of 3+ characters with the name ("Messi" for Lionel Messi), or is on the
//   short KEEP_ALIAS list of well-known stage names and nicknames.
// - titles (TITLES): shares such a word, or is the name's initials ("SNL").
// - places (PLACES): no code (all capitals, "DPRK"), and either shares such a word or is a synonym of the name in
//   WordNet ("Burma" for Myanmar, "Holland" for the Netherlands; not "Augusta" for London).
// - everything else: a one-word alias among the COMMON_WORDS most said words (FrequencyWords) that shares no word with
//   the name is dropped ("Painter", "Killer"), and so is a short one (5 letters or fewer) that is no English word on
//   that list at all, which catches cooking French ("Porc", "Ail").
const PEOPLE = new Set(["musician", "footballer", "superhero", "name"]);
const TITLES = new Set(["film", "tv"]);
const PLACES = new Set(["place", "country"]);
const COMMON_WORDS = 20_000;
/** Stage names, nicknames and other names players really use, by entry name. Only ever keeps an alias the data already has. */
const KEEP_ALIAS: Record<string, string[]> = {
  Eminem: ["Slim Shady"],
  "Tupac Shakur": ["2Pac", "Makaveli"],
  "Kanye West": ["Ye", "Yeezy"],
  "Jennifer Lopez": ["J Lo"],
  "Lionel Messi": ["La Pulga"],
  "Cristiano Ronaldo": ["CR7"],
  "Spider-Man": ["Spidey"],
  Wolverine: ["Logan"],
  Batman: ["Caped Crusader", "Dark Knight"],
  Superman: ["The Man of Steel", "Man of Steel"],
  "Sean Combs": ["Diddy", "P Diddy", "Puff Daddy"],
  "Czech Republic": ["Czechia"],
  "New York City": ["Big Apple"],
  "Washington, D.C.": ["District of Columbia"],
  Turkey: ["Türkiye"],
  "Ivory Coast": ["Côte d'Ivoire"],
  Eswatini: ["Swaziland"],
  "Vatican City": ["Holy See"],
};
// Slurs (an ethnic slur Wikidata lists for one country, and others like it), matched as a word anywhere in an alias.
// Built from pieces so the words themselves never sit in the source.
const SLURS = new Set([["j", "ap"], ["ni", "p"], ["ch", "ink"], ["go", "ok"], ["wo", "p"], ["sp", "ic"], ["ki", "ke"], ["neg", "ro"]].map((p) => p.join("")));
/** Whole aliases that are titles or plain words naming nobody in particular. */
const GENERIC = new Set([
  "junior", "jr", "senior", "sir", "king", "queen", "prince", "princess", "lord", "lady", "the king", "the queen", "mister",
  "doctor", "captain", "boss", "baby", "love", "evil", "god", "devil", "legend", "master", "star", "angel", "thing",
  "the man", "the boss", "the one", "the city", "the district", "the bat", "the cat",
].map((w) => norm(w)));
const FOREIGN = new Set(["de", "la", "le", "les", "du", "des", "el", "los", "las", "del", "da", "di", "dos", "das", "der", "die", "das", "und", "et", "y", "il", "lo", "al", "ul"]);
const STOP = new Set(["the", "and", "for", "von", "van", "mrs"]);

/** Words of 3+ characters, accents and case dropped. */
const tokens = (s: string) => new Set(s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)));
const sharesWord = (a: string, b: string) => { const tb = tokens(b); return [...tokens(a)].some((t) => tb.has(t)); };
const initials = (name: string, skipSmall: boolean) => name.split(/[\s:–-]+/).filter((w) => /[a-z0-9]/i.test(w) && !(skipSmall && /^(the|of|and|a|an|in|to)$/i.test(w))).map((w) => w.replace(/[^a-z0-9]/gi, "")[0] ?? "").join("").toLowerCase();

type AliasContext = { rank: Map<string, number>; wnSyn: Map<string, Set<string>> };

/** Why `alias` of entry `name` in category `id` is dropped, or null to keep it. */
function aliasVerdict(id: string, name: string, alias: string, cx: AliasContext): string | null {
  if ((KEEP_ALIAS[name] ?? []).includes(alias)) return null;
  const k = norm(alias);
  if (/[\p{L}]/u.test(alias) && [...alias].some((ch) => /\p{L}/u.test(ch) && !/\p{Script=Latin}/u.test(ch))) return "script";
  if (GENERIC.has(k) || [...tokens(alias)].some((t) => SLURS.has(t))) return "deny";
  if (k.length < 3) return "short";
  const words = alias.toLowerCase().split(/[\s-]+/);
  const nameWords = new Set(name.toLowerCase().split(/[\s-]+/));
  if (words.length > 1 && words.some((w) => FOREIGN.has(w) && !nameWords.has(w))) return "foreign";
  const shares = sharesWord(alias, name);
  if (PEOPLE.has(id)) return shares ? null : "person";
  if (TITLES.has(id)) {
    const letters = alias.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return shares || letters === initials(name, false) || letters === initials(name, true) ? null : "title";
  }
  if (PLACES.has(id)) {
    if (k.length <= 3) return "short";
    if (/^[A-Z0-9][A-Z0-9 .'-]*$/.test(alias) || /^[A-Z]{2}-[A-Z]{2,3}$/.test(alias)) return "code";
    if (/[^\x00-\x7f]/.test(alias.normalize("NFC")) && ![...alias].filter((c) => /[^\x00-\x7f]/.test(c)).every((c) => name.includes(c))) return "foreign";
    if (shares) return null;
    const a = cx.wnSyn.get(k), n = cx.wnSyn.get(norm(name));
    return a && n && [...a].some((x) => n.has(x)) ? null : "place";
  }
  if (!alias.includes(" ") && !shares) {
    const r = cx.rank.get(alias.toLowerCase());
    if (r !== undefined && r <= COMMON_WORDS) return "common";
    if (r === undefined && k.length <= 5) return "foreign";
  }
  return null;
}

/** Re-filters every written list's aliases with `aliasVerdict`, then rewrites the metadata (letters change with them). */
async function aliasesOnly(dry: boolean, verbose: boolean) {
  const [freq, wn] = await Promise.all([frequency(), wordnet()]);
  const rank = new Map<string, number>();
  [...freq.entries()].forEach(([w], i) => rank.set(w, i + 1));
  const wnSyn = new Map<string, Set<string>>();
  for (const [lemma, ids] of wn.senses) {
    const k = norm(lemma);
    const set = wnSyn.get(k) ?? new Set<string>();
    for (const x of ids) set.add(x);
    wnSyn.set(k, set);
  }
  const cx: AliasContext = { rank, wnSyn };
  const ids = ORDER.filter((id) => fs.existsSync(path.join(OUT, `${id}.json`)));
  for (const id of ids) {
    const file = path.join(OUT, `${id}.json`);
    const list: NpatEntry[] = JSON.parse(fs.readFileSync(file, "utf8"));
    let before = 0, after = 0;
    const why = new Map<string, number>();
    const out = list.map((e) => {
      const also = e.also ?? [];
      before += also.length;
      const kept = also.filter((a) => {
        const v = aliasVerdict(id, e.name, a, cx);
        if (v) why.set(v, (why.get(v) ?? 0) + 1);
        if (v && verbose) console.log(`  - ${e.name} | ${a} (${v})`);
        return !v;
      });
      after += kept.length;
      const { also: _old, ...rest } = e;
      void _old;
      return kept.length ? { ...rest, also: kept } : rest;
    });
    console.log(`${id.padEnd(11)} aliases ${before} -> ${after}  dropped: ${[...why].map(([w, n]) => `${w} ${n}`).join(", ")}`);
    if (!dry) fs.writeFileSync(file, `[\n${out.map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);
  }
  if (!dry) writeMeta([]);
}

async function main() {
  if (process.argv.includes("--aliases-only")) return aliasesOnly(process.argv.includes("--dry"), process.argv.includes("--verbose"));
  const want = process.argv.slice(2);
  const ids = want.length ? want : ORDER;
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of ids) {
    if (!SPECS[id]) { console.warn(`no spec for ${id}`); continue; }
    process.stdout.write(`${id.padEnd(11)} `);
    const list = entries(id, await SPECS[id]!.build());
    // One entry per line keeps diffs readable.
    fs.writeFileSync(path.join(OUT, `${id}.json`), `[\n${list.map((e) => JSON.stringify(e)).join(",\n")}\n]\n`);
    const at = (t: string) => list.filter((e) => e.tier === t).slice(0, 4).map((e) => e.name).join(", ");
    console.log(` ${list.length} · common: ${at("common")} · rare: ${at("rare")} · unicorn: ${at("unicorn")}`);
  }
  writeMeta(ids);
}

main().catch((e) => { console.error(e); process.exit(1); });
