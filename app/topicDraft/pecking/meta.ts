// Written by scripts/buildPecking.ts. List metadata only: no items, so room screens can import it.
export type PeckMeta = { id: string; title: string; stat: string; size: number; source: string; asOf: string };

export const PECKING_META: PeckMeta[] = [
  {"id":"countries-population","title":"Countries by population","stat":"Population","size":193,"source":"Wikipedia: List of countries by population (United Nations)","asOf":"2026-11-13"},
  {"id":"countries-area","title":"Countries by area","stat":"Area","size":193,"source":"Wikipedia: List of countries and dependencies by area","asOf":"2026-11-13"},
  {"id":"countries-gdp","title":"Countries by GDP per person","stat":"GDP per person","size":193,"source":"Wikipedia: List of countries by GDP (nominal) per capita (IMF, else World Bank, else UN)","asOf":"2026-11-13"},
  {"id":"cities","title":"Most populous cities","stat":"Population (UN 2025 estimate)","size":85,"source":"Wikipedia: List of largest cities (UN World Urbanization Prospects 2025)","asOf":"2026-11-13"},
  {"id":"films-boxoffice","title":"Highest-grossing films","stat":"Worldwide box office","size":50,"source":"Wikipedia: List of highest-grossing films","asOf":"2026-11-13"},
  {"id":"buildings","title":"Tallest buildings","stat":"Height","size":98,"source":"Wikipedia: List of tallest buildings","asOf":"2026-11-13"},
  {"id":"nba-points","title":"NBA all-time scoring","stat":"Career points","size":50,"source":"Wikipedia: List of NBA career scoring leaders","asOf":"2026-11-13"},
  {"id":"pokemon-bst","title":"Pokémon by base stat total","stat":"Base stat total","size":1025,"source":"PokéAPI","asOf":"2026-11-13"},
  {"id":"rivers","title":"Longest rivers","stat":"Length","size":100,"source":"Wikipedia: List of river systems by length","asOf":"2026-11-13"},
  {"id":"mountains","title":"Highest mountains","stat":"Height","size":100,"source":"Wikipedia: List of highest mountains on Earth","asOf":"2026-11-13"},
];
