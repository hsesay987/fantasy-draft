/** A thing in a source (a film, a Pokémon, a club) with its facts reduced to plain strings. `pop` is how famous it is: higher means better known. */
export type Entity = { id: string; label: string; pop: number; facts: Record<string, string[]> };

/** One kind of Jeopardy clue. Entities are grouped so a board reads as one theme, for example "Directors: 1990s Films". */
export type Template = {
  /** Fact that holds the right answer. Entities need exactly one value for it. */
  fact: string;
  /** Clue text for an entity. */
  ask: (e: Entity) => string;
  /** Theme for an entity, or null to skip it. Used in the category name. */
  group: (e: Entity) => string | null;
  name: (group: string) => string;
  /** Answers are years, so wrong options are made by shifting the right one. */
  year?: boolean;
  /** The answer may itself be an item in the dataset (a game's series, an anime's source). Otherwise an answer that matches another item's name is treated as a bad link and the clue is dropped. */
  entityAnswer?: boolean;
  /** The answer is an organisation that has several items in the data (a network, a studio). One that appears only once is probably a bad link. */
  shared?: boolean;
};

/** A Family Feud survey: "Name a <noun> <where>" for every value of a fact that has enough members. */
export type SurveyDef = {
  fact: string;
  /** Question for one value of the fact (a director, a country, a type). */
  ask: (value: string) => string;
  /** Skip values that fail this (for example generic ones). */
  ok?: (value: string) => boolean;
  /** Largest group still worth asking about: with more than this, a player can name plenty of valid answers outside the top five. Default 12. */
  max?: number;
};

export type Spec = { pool: string; templates: Template[]; surveys: SurveyDef[] };
