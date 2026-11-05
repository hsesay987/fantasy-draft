// Common Thread data, one file per topic in app/commonthread/data/, built offline by scripts/buildCommonThread.ts.
// Every category is a real fact from Wikidata, PokéAPI or AniList. Nothing here is a made-up rating.

/**
 * One clue: a pick that belongs to the hidden category.
 * `q` is the image lookup when the name alone would find the wrong picture: the exact English Wikipedia title,
 * or for flags the lowercase ISO 3166-1 alpha-2 code. Left out when the name is enough.
 */
export type ThreadClue = { name: string; q?: string };

export type ThreadCategory = {
  id: string;
  /** Plain wording of the fact, for example "Directed by Christopher Nolan". */
  label: string;
  /** Six clues, hardest (least famous) first, most obvious last. */
  clues: ThreadClue[];
  /** Labels of seven other real categories in this topic that none of the clues belong to. */
  wrong: string[];
  /** The names of this topic's clue pool that really belong to the category. Kept to names that appear as a clue somewhere in the topic, so the file stays small. */
  members: string[];
};

export type ThreadTopic = { pool: string; daily: ThreadCategory[]; practice: ThreadCategory[] };
