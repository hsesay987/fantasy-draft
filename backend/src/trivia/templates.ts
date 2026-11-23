// Clue and survey templates per pool. Keep questions short and factual: each one has a single right answer taken from the source.
import { decade } from "./build";
import type { Entity, Spec, Template } from "./model";

const SHORT: Record<string, string> = { "United States of America": "US", "United Kingdom": "UK", "Soviet Union": "USSR", "People's Republic of China": "China" };
const short = (s: string) => SHORT[s] ?? s;
const first = (e: Entity, f: string) => e.facts[f]?.[0] ?? null;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const era = (e: Entity) => decade(first(e, "year") ?? undefined);

const byEra = (fact: string, ask: (e: Entity) => string, name: (g: string) => string): Template => ({ fact, ask, group: era, name, shared: ["network", "developer", "publisher", "studio"].includes(fact) });
const quote = (e: Entity) => `“${e.label}”`;

const films: Spec = {
  pool: "films",
  templates: [
    byEra("director", (e) => `Who directed ${quote(e)}?`, (g) => `Directors: ${g} Films`),
    byEra("composer", (e) => `Who composed the music for ${quote(e)}?`, (g) => `Film Composers: ${g}`),
    { fact: "year", ask: (e) => `In what year was ${quote(e)} released?`, group: (e) => { const c = first(e, "country"); return c ? short(c) : null; }, name: (g) => `Release Years: ${g} Films`, year: true },
    { fact: "year", ask: (e) => `In what year was ${quote(e)} released?`, group: (e) => { const d = first(e, "director"); return d ?? null; }, name: (g) => `Years: ${g} Films`, year: true },
  ],
  surveys: [{ fact: "director", ask: (v) => `Name a film directed by ${v}` }],
};

const shows: Spec = {
  pool: "shows",
  templates: [
    byEra("network", (e) => `Which network first aired ${quote(e)}?`, (g) => `TV Networks: ${g} Shows`),
    { fact: "year", ask: (e) => `In what year did ${quote(e)} premiere?`, group: (e) => { const c = first(e, "country"); return c ? short(c) : null; }, name: (g) => `Premiere Years: ${g} TV`, year: true },
    byEra("creator", (e) => `Who created ${quote(e)}?`, (g) => `TV Creators: ${g} Shows`),
  ],
  surveys: [{ fact: "network", ask: (v) => `Name a TV show that aired on ${v}`, ok: (v) => /^[A-Z0-9]/.test(v) }, { fact: "creator", ask: (v) => `Name a TV show created by ${v}` }],
};

const videogames: Spec = {
  pool: "videogames",
  templates: [
    byEra("developer", (e) => `Which studio developed ${quote(e)}?`, (g) => `Game Developers: ${g}`),
    byEra("publisher", (e) => `Which company published ${quote(e)}?`, (g) => `Game Publishers: ${g}`),
    { ...byEra("series", (e) => `Which series is ${quote(e)} part of?`, (g) => `Game Series: ${g}`), entityAnswer: true },
    { fact: "year", ask: (e) => `In what year was ${quote(e)} first released?`, group: (e) => first(e, "publisher"), name: (g) => `Years: ${g} Games`, year: true },
  ],
  surveys: [{ fact: "series", ask: (v) => `Name a game in the ${v} series` }, { fact: "developer", ask: (v) => `Name a game developed by ${v}` }],
};

const disney: Spec = {
  pool: "disney",
  templates: [
    { fact: "director", ask: (e) => `Who directed ${quote(e)}?`, group: () => "Disney & Pixar", name: (g) => `${g} Directors` },
    { fact: "composer", ask: (e) => `Who composed the music for ${quote(e)}?`, group: () => "Disney & Pixar", name: (g) => `${g} Composers` },
    { fact: "year", ask: (e) => `In what year was ${quote(e)} released?`, group: () => "Disney & Pixar", name: (g) => `${g} Release Years`, year: true },
    { fact: "year", ask: (e) => `In what year was ${quote(e)} released?`, group: (e) => first(e, "studio"), name: (g) => `Years: ${g} Films`, year: true },
  ],
  surveys: [{ fact: "director", ask: (v) => `Name an animated film directed by ${v}` }, { fact: "composer", ask: (v) => `Name an animated film scored by ${v}` }],
};

const anime: Spec = {
  pool: "anime",
  templates: [
    byEra("studio", (e) => `Which studio animated ${quote(e)}?`, (g) => `Anime Studios: ${g}`),
    { ...byEra("basedOn", (e) => `${quote(e)} is based on which work?`, (g) => `Anime Sources: ${g}`), entityAnswer: true },
    byEra("director", (e) => `Who directed the anime ${quote(e)}?`, (g) => `Anime Directors: ${g}`),
    { fact: "year", ask: (e) => `In what year did the anime ${quote(e)} premiere?`, group: (e) => first(e, "studio"), name: (g) => `Years: ${g} Anime`, year: true },
  ],
  surveys: [{ fact: "studio", ask: (v) => `Name an anime made by ${v}` }, { fact: "director", ask: (v) => `Name an anime directed by ${v}` }],
};

const football: Spec = {
  pool: "football",
  templates: [
    { fact: "country", ask: (e) => `In which country is ${e.label} based?`, group: (e) => { const y = first(e, "year"); const d = y ? decade(y) : null; return d && Number(y) < 1990 ? d : null; }, name: (g) => `Club Countries: Founded ${g}` },
    { fact: "venue", ask: (e) => `Which stadium is home to ${e.label}?`, group: (e) => { const c = first(e, "country"); return c ? short(c) : null; }, name: (g) => `Home Grounds: ${g}` },
    { fact: "league", ask: (e) => `Which league does ${e.label} play in?`, group: (e) => { const c = first(e, "country"); return c ? short(c) : null; }, name: (g) => `Leagues: ${g} Clubs` },
    { fact: "year", ask: (e) => `In what year was ${e.label} founded?`, group: (e) => { const c = first(e, "country"); return c ? short(c) : null; }, name: (g) => `Founded: ${g} Clubs`, year: true },
  ],
  surveys: [{ fact: "country", ask: (v) => `Name a football club from ${short(v)}` }, { fact: "league", ask: (v) => `Name a club in the ${v}` }],
};

// Wikidata lists comic characters under overlapping universes (Earth-616 and the Marvel Cinematic Universe), and its
// creator credits are patchy, so only team membership and debut year are asked.
const hero = (pool: string, noun: string, label: string): Spec => ({
  pool,
  templates: [
    { fact: "team", ask: (e) => `${e.label} is a member of which group?`, group: (e) => first(e, "universe"), name: (g) => `${label} Teams: ${g}` },
    { fact: "year", ask: (e) => `In what year did ${e.label} first appear?`, group: () => label, name: (g) => `${g} Debut Years`, year: true },
  ],
  surveys: [{ fact: "team", ask: (v) => `Name a ${noun} in ${v}` }],
});

const history: Spec = {
  pool: "history",
  templates: [
    { fact: "born", ask: (e) => `In what year was ${e.label} born?`, group: (e) => { return first(e, "tag"); }, name: (g) => `Birth Years: ${g}`, year: true },
    { fact: "died", ask: (e) => `In what year did ${e.label} die?`, group: (e) => { return first(e, "tag"); }, name: (g) => `Death Years: ${g}`, year: true },
    { fact: "country", ask: (e) => `${e.label} was a citizen of which state?`, group: (e) => { return first(e, "tag"); }, name: (g) => `Homelands: ${g}` },
  ],
  surveys: [],
};

const music: Spec = {
  pool: "music",
  templates: [
    byEra("artist", (e) => `Who released the album ${quote(e)}?`, (g) => `Albums: ${g}`),
    { fact: "year", ask: (e) => `In what year was the album ${quote(e)} released?`, group: (e) => first(e, "artist"), name: (g) => `Album Years: ${g}`, year: true },
    { ...byEra("label", (e) => `Which record label released ${quote(e)}?`, (g) => `Record Labels: ${g} Albums`), shared: true },
  ],
  surveys: [{ fact: "artist", ask: (v) => `Name an album by ${v}` }],
};

const books: Spec = {
  pool: "books",
  templates: [
    byEra("author", (e) => `Who wrote ${quote(e)}?`, (g) => `Authors: ${g} Novels`),
    { fact: "year", ask: (e) => `In what year was ${quote(e)} first published?`, group: (e) => first(e, "author"), name: (g) => `Publication Years: ${g}`, year: true },
    { fact: "year", ask: (e) => `In what year was ${quote(e)} first published?`, group: (e) => { const c = first(e, "country"); return c ? short(c) : null; }, name: (g) => `Publication Years: ${g} Novels`, year: true },
  ],
  surveys: [{ fact: "author", ask: (v) => `Name a novel by ${v}` }],
};

const mythology: Spec = {
  pool: "mythology",
  templates: [
    { fact: "father", ask: (e) => `In myth, who is the father of ${e.label}?`, group: (e) => first(e, "tag"), name: (g) => `Divine Fathers: ${g}`, entityAnswer: true },
    { fact: "mother", ask: (e) => `In myth, who is the mother of ${e.label}?`, group: (e) => first(e, "tag"), name: (g) => `Divine Mothers: ${g}`, entityAnswer: true },
    { fact: "spouse", ask: (e) => `In myth, who is the spouse of ${e.label}?`, group: (e) => first(e, "tag"), name: (g) => `Divine Couples: ${g}`, entityAnswer: true },
  ],
  // Wikidata's "child" links for gods are often reversed or mixed between pantheons, so there are no surveys from them.
  surveys: [],
};

const onePassport = (e: Entity) => (e.facts.country?.length === 1 ? short(e.facts.country[0]!) : null);

const celebrities: Spec = {
  pool: "celebrities",
  templates: [
    // Stars often hold several jobs (Eminem acts too), so boards are themed by country, not by job.
    { fact: "born", ask: (e) => `In what year was ${e.label} born?`, group: (e) => onePassport(e), name: (g) => `Birth Years: Stars from ${g}`, year: true },
  ],
  // Citizenship lists mix birth and adopted countries, so a "name a star from" survey would reward wrong answers.
  surveys: [],
};

export const SPECS: Record<string, Spec> = { films, shows, videogames, disney, anime, football, superheroes: hero("superheroes", "hero", "Hero"), history, music, books, mythology, celebrities };
