// Real facts for Pinpoint, one file per topic, built offline by scripts/buildPinpoint.ts from
// Wikidata, PokéAPI, AniList, the Superhero API and the NBA catalog. Nothing here is a made-up rating.

export type ColumnKind = "cat" | "set" | "num";
export type Column = {
  key: string;
  label: string;
  kind: ColumnKind;
  /** num: within this distance counts as close (yellow). With `rel`, a fraction of the answer's value instead. */
  close?: number;
  rel?: boolean;
  /** num: how to print the value. */
  fmt?: "year" | "int" | "big" | "dec1";
  unit?: string;
};
export type FactValue = string | string[] | number;
export type PinpointData = { pool: string; source: string; columns: Column[]; facts: Record<string, Record<string, FactValue>> };

import food from "./data/food.json";
import geography from "./data/geography.json";
import flags from "./data/flags.json";
import books from "./data/books.json";
import music from "./data/music.json";
import films from "./data/films.json";
import shows from "./data/shows.json";
import history from "./data/history.json";
import football from "./data/football.json";
import nba from "./data/nba.json";
import pokemon from "./data/pokemon.json";
import anime from "./data/anime.json";
import superheroes from "./data/superheroes.json";
import villains from "./data/villains.json";
import videogames from "./data/videogames.json";
import disney from "./data/disney.json";
import movies from "./data/movies.json";

export const PINPOINT_DATA: Record<string, PinpointData> = Object.fromEntries(
  ([food, geography, flags, books, music, films, shows, history, football, nba, pokemon, anime, superheroes, villains, videogames, disney, movies] as PinpointData[]).map((d) => [d.pool, d])
);
