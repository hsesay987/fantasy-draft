// Party games can mix several topics or decks. These helpers name the valid ids for a format and build the shared title.
import type { FormatId } from "../../play/types";
import { CATALOG_META, getCatalog } from "../catalogs";
import { OPTION_COUNT } from "../formats/imposter";
import { TRIVIA_POOLS } from "../trivia";
import { DECKS, deckOf } from "./decks";
import { INSYNC_DECKS, insyncDeckOf } from "./insyncDecks";
import { mixTitle } from "./mixTitle";
import { PECKING_META } from "../pecking/meta";
import { VOWEL_TOPICS, vowelTopicTitle } from "./vowelTopics";

/** Character catalogs big enough for Imposter: a secret plus look-alikes to guess from. */
export const imposterTopicIds = (): string[] => CATALOG_META.filter((m) => m.kind === "character" && getCatalog(m.id).length >= OPTION_COUNT).map((m) => m.id);

/** Every valid pool id for a party format (`[]` for Mafia and for formats that are not party games). */
export function poolIdsFor(format: FormatId): string[] {
  switch (format) {
    case "imposter": return imposterTopicIds();
    case "vote": return DECKS.map((d) => d.id);
    case "insync": return INSYNC_DECKS.map((d) => d.id);
    case "partytrivia": return [...TRIVIA_POOLS];
    case "vowelplay":
    case "vowelparty": return VOWEL_TOPICS.map((t) => t.id);
    case "pecking": return PECKING_META.map((m) => m.id);
    default: return [];
  }
}

/** The display title of one pool id for a format. */
export function poolTitleFor(format: FormatId, id: string): string {
  switch (format) {
    case "vote": return deckOf(id)?.title ?? id;
    case "insync": return insyncDeckOf(id)?.title ?? id;
    case "vowelplay":
    case "vowelparty": return vowelTopicTitle(id);
    case "pecking": return PECKING_META.find((m) => m.id === id)?.title ?? id;
    default: return CATALOG_META.find((m) => m.id === id)?.title ?? id;
  }
}

export { mixTitle };
