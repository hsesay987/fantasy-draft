// New catalog entries from Wikidata (CC0): the most widely covered musicians, books and films we do not have yet.
// "Widely covered" is the number of Wikipedia language editions with a page on it (sitelinks), a public, repeatable
// stand-in for fame. Genres are mapped onto the buckets each catalog already uses.
import { sparql, hasName, type Row } from "../trivia/wikidata";
import type { Candidate } from "./grow";

type Spec = {
  queries: string[];
  /** Turns the Wikidata genre labels (and the row) into the catalog's universe / archetype / tags. */
  shape: (genres: string[], row: Row) => Pick<Candidate, "universe" | "archetype" | "tags"> | null;
};

const has = (genres: string[], ...words: string[]) => genres.some((g) => words.some((w) => g.includes(w)));

/** Music genres by vote: each listed genre counts once for the bucket it fits, and the biggest bucket wins (Pop on a tie). */
const MUSIC_BUCKETS: [string, RegExp][] = [
  ["Hip-Hop", /\b(hip hop|rap|trap|drill|grime)\b/], ["K-Pop", /k-pop/], ["Latin", /latin|reggaeton|salsa|bachata|cumbia|bossa/], ["Country", /country|bluegrass/],
  ["R&B", /r&b|rhythm and blues|contemporary r/], ["Soul", /\bsoul\b|funk|motown|gospel/], ["Jazz", /jazz|swing|bebop|big band/], ["Metal", /metal/],
  ["Electronic", /electronic|house|techno|trance|\bedm\b|dubstep|drum and bass/], ["Reggae", /reggae|\bska\b|dancehall/], ["Rock", /rock|punk|grunge|britpop|new wave|indie/],
  ["Folk", /folk|singer-songwriter|americana/], ["Classical", /classical|opera|baroque music/], ["Pop", /pop|ballad|chanson|schlager|disco/],
];
const musicGenre = (g: string[]): string => {
  const votes = new Map<string, number>();
  for (const genre of g) {
    if (genre.includes("trip hop")) continue; // trip hop is not hip hop
    const hit = MUSIC_BUCKETS.find(([, re]) => re.test(genre));
    if (hit) votes.set(hit[0], (votes.get(hit[0]) ?? 0) + 1);
  }
  return [...votes.entries()].sort((a, b) => b[1] - a[1] || (a[0] === "Pop" ? -1 : b[0] === "Pop" ? 1 : 0))[0]?.[0] ?? "Pop";
};

const bookGenre = (g: string[]): string =>
  has(g, "dystopia") ? "Dystopian" : has(g, "science fiction") ? "Science Fiction" : has(g, "horror", "gothic") ? "Horror" : has(g, "fantasy") ? "Fantasy"
  : has(g, "children", "picture book") ? "Children's" : has(g, "crime", "detective", "mystery") ? "Mystery" : has(g, "thriller", "spy") ? "Thriller" : has(g, "romance") ? "Romance"
  : has(g, "young adult") ? "Young Adult" : has(g, "adventure") ? "Adventure" : has(g, "memoir", "autobiograph", "non-fiction") ? "Non-Fiction"
  : has(g, "poem", "poetry", "epic") ? "Poetry" : has(g, "play", "drama", "tragedy") ? "Drama" : "Literary";

const filmGenre = (g: string[]): string =>
  has(g, "animated", "animation") ? "Animation" : has(g, "superhero") ? "Action" : has(g, "science fiction") ? "Sci-Fi" : has(g, "horror") ? "Horror"
  : has(g, "crime", "gangster", "heist") ? "Crime" : has(g, "war") ? "War" : has(g, "fantasy") ? "Fantasy" : has(g, "action", "martial arts") ? "Action"
  : has(g, "thriller", "mystery") ? "Thriller" : has(g, "musical") ? "Musical" : has(g, "romantic", "romance") ? "Romance" : has(g, "comedy") ? "Comedy" : "Drama";

const filmStyle = (g: string[]): string =>
  has(g, "superhero") ? "Superhero" : has(g, "family", "children", "animated") ? "Family" : has(g, "comedy") ? "Comedy" : has(g, "thriller", "horror", "action") ? "Thriller" : "Drama";

const groupGenres = (rows: Row[]): (Row & { genres: string[]; sl: number })[] => {
  const by = new Map<string, Row & { genres: string[]; sl: number }>();
  for (const r of rows) {
    const cur = by.get(r.item!) ?? ({ ...r, genres: [] as string[], sl: Number(r.sl) || 0 } as Row & { genres: string[]; sl: number });
    if (r.genreLabel && hasName(r.genreLabel)) cur.genres.push(r.genreLabel.toLowerCase());
    by.set(r.item!, cur);
  }
  return [...by.values()];
};

const q = (where: string, min: number, limit: number, extra = "") => `
SELECT ?item ?itemLabel ?sl ?genreLabel ${extra ? "?authorLabel ?kind" : ""} WHERE {
  { SELECT ?item ?sl WHERE { ${where} ?item wikibase:sitelinks ?sl. FILTER(?sl >= ${min}) } ORDER BY DESC(?sl) LIMIT ${limit} }
  OPTIONAL { ?item wdt:P136 ?genre. }
  ${extra}
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`;

export const SPECS: Record<string, Spec> = {
  music: {
    queries: [
      q("?item wdt:P31 wd:Q5; wdt:P106 wd:Q177220; wdt:P264 ?label.", 80, 500, "BIND(\"solo\" AS ?kind)"),
      q("?item wdt:P31 wd:Q5; wdt:P106 wd:Q2252262; wdt:P264 ?label.", 50, 200, "BIND(\"rapper\" AS ?kind)"),
      q("?item wdt:P31 wd:Q215380.", 70, 300, "BIND(\"band\" AS ?kind)"),
    ],
    shape: (g, row) => {
      if (!g.length) return null; // no genre on record usually means not mainly a musician
      const genre = row.kind === "rapper" ? "Hip-Hop" : musicGenre(g);
      return { universe: genre, archetype: row.kind === "band" ? "Band" : row.kind === "rapper" || genre === "Hip-Hop" ? "Rapper" : "Solo Artist", tags: [] };
    },
  },
  books: {
    // Novels and novellas (Wikidata keeps the form in P7937): "literary work" alone is dominated by scripture and ancient epics, which play badly in a book draft.
    queries: [q("?item wdt:P7937 wd:Q8261.", 45, 600, "OPTIONAL { ?item wdt:P50 ?author. }"), q("?item wdt:P7937 wd:Q149537.", 35, 150, "OPTIONAL { ?item wdt:P50 ?author. }")],
    shape: (g, row) => (hasName(row.authorLabel) && !/^https?:|various/i.test(row.authorLabel) ? { universe: bookGenre(g), archetype: row.authorLabel, tags: [] } : null),
  },
  films: {
    queries: [q("?item wdt:P31 wd:Q11424.", 45, 900)],
    shape: (g) => (g.length ? { universe: filmGenre(g), archetype: filmStyle(g), tags: [] } : null),
  },
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/^the /, "").replace(/[^a-z0-9]+/g, "");

/** The most widely covered entries of `pool` that are not in `have` yet, most covered first. */
export async function candidates(pool: string, have: string[], want: number, run: (query: string) => Promise<Row[]> = sparql): Promise<(Candidate & { sitelinks: number })[]> {
  const spec = SPECS[pool];
  if (!spec) throw new Error(`no Wikidata source for ${pool}; try ${Object.keys(SPECS).join(", ")}`);
  const known = new Set(have.map(norm));
  const out: (Candidate & { sitelinks: number })[] = [];
  for (const query of spec.queries) {
    for (const r of groupGenres(await run(query))) {
      const name = r.itemLabel;
      if (!hasName(name) || known.has(norm(name))) continue;
      const shape = spec.shape(r.genres, r);
      if (!shape) continue;
      known.add(norm(name));
      out.push({ name, ...shape, q: name, sitelinks: r.sl });
    }
  }
  return out.sort((a, b) => b.sitelinks - a.sitelinks).slice(0, want);
}
