// Where each trivia pool gets its facts. Wikidata (CC0) for most; Pokémon come from PokéAPI (see pokeapi.ts).
import type { Source } from "./wikidata";

export const WIKIDATA: Record<string, Source> = {
  films: { where: "?item wdt:P31 wd:Q11424.", minSitelinks: 45, limit: 900, facts: [
    { key: "director", pid: "P57", kind: "item" }, { key: "year", pid: "P577", kind: "year" }, { key: "country", pid: "P495", kind: "item" }, { key: "composer", pid: "P86", kind: "item" },
  ] },
  shows: { where: "?item wdt:P31 wd:Q5398426.", minSitelinks: 22, limit: 700, facts: [
    { key: "network", pid: "P449", kind: "item" }, { key: "year", pid: "P580", kind: "year" }, { key: "country", pid: "P495", kind: "item" }, { key: "creator", pid: "P170", kind: "item" },
  ] },
  videogames: { where: "?item wdt:P31 wd:Q7889.", minSitelinks: 18, limit: 900, facts: [
    { key: "developer", pid: "P178", kind: "item" }, { key: "publisher", pid: "P123", kind: "item" }, { key: "year", pid: "P577", kind: "year" }, { key: "series", pid: "P179", kind: "item" },
  ] },
  disney: { where: "?item wdt:P31 wd:Q202866. ?item wdt:P272 ?pc. VALUES ?pc { wd:Q1047410 wd:Q127552 }", minSitelinks: 20, limit: 300, facts: [
    { key: "director", pid: "P57", kind: "item" }, { key: "year", pid: "P577", kind: "year" }, { key: "composer", pid: "P86", kind: "item" }, { key: "studio", pid: "P272", kind: "item" },
  ] },
  anime: { where: "?item wdt:P31 wd:Q63952888.", minSitelinks: 12, limit: 500, facts: [
    { key: "studio", pid: "P272", kind: "item" }, { key: "year", pid: "P580", kind: "year" }, { key: "basedOn", pid: "P144", kind: "item" }, { key: "director", pid: "P57", kind: "item" },
  ] },
  football: { where: "?item wdt:P31 wd:Q476028.", minSitelinks: 40, limit: 600, facts: [
    { key: "country", pid: "P17", kind: "item" }, { key: "venue", pid: "P115", kind: "item" }, { key: "year", pid: "P571", kind: "year" }, { key: "league", pid: "P118", kind: "item" },
  ] },
  superheroes: { where: "?item wdt:P106 wd:Q188784.", minSitelinks: 15, limit: 500, facts: [
    { key: "creator", pid: "P170", kind: "item" }, { key: "universe", pid: "P1080", kind: "item" }, { key: "year", pid: "P571", kind: "year" }, { key: "team", pid: "P463", kind: "item" },
  ] },
  history: { where: [
    { tag: "Painter", where: "?item wdt:P106 wd:Q1028181; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Composer", where: "?item wdt:P106 wd:Q36834; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Philosopher", where: "?item wdt:P106 wd:Q4964182; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Monarch", where: "?item wdt:P106 wd:Q116; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Mathematician", where: "?item wdt:P106 wd:Q170790; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Physicist", where: "?item wdt:P106 wd:Q169470; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Inventor", where: "?item wdt:P106 wd:Q205375; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Astronomer", where: "?item wdt:P106 wd:Q11063; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Explorer", where: "?item wdt:P106 wd:Q11900058; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Poet", where: "?item wdt:P106 wd:Q49757; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Sculptor", where: "?item wdt:P106 wd:Q1281618; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Architect", where: "?item wdt:P106 wd:Q42973; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
    { tag: "Chemist", where: "?item wdt:P106 wd:Q593644; wdt:P570 ?died. FILTER(YEAR(?died) < 1990)" },
  ], minSitelinks: 90, limit: 120, facts: [
    { key: "born", pid: "P569", kind: "year" }, { key: "died", pid: "P570", kind: "year" }, { key: "country", pid: "P27", kind: "item" }, { key: "occupation", pid: "P106", kind: "item" },
  ] },
};
