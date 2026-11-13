// The topics (or decks) each game can play from, as the setup screens list them, and which ones a setup starts with.
// One source for PartySetup, SetupScreen's default and the tournament lineup, so the lists never drift apart.
import { CATALOG_META, getCatalog } from "../topicDraft/catalogs";
import { OPTION_COUNT } from "../topicDraft/formats/imposter";
import { DECKS } from "../topicDraft/party/decks";
import { INSYNC_DECKS } from "../topicDraft/party/insyncDecks";
import { PECKING_META } from "../topicDraft/pecking/meta";
import { mixTitle } from "../topicDraft/party/mixTitle";
import { VOWEL_TOPICS } from "../topicDraft/party/vowelTopics";
import { hasTrivia } from "../topicDraft/trivia";
import { CATEGORIES, category, formatsFor } from "./categories";
import { PARTY_FORMATS, type FormatId } from "./types";

export type TopicOption = { id: string; title: string; blurb?: string };

/** Topics Imposter can use: any character pool big enough for a secret plus look-alikes to guess from. */
export const IMPOSTER_TOPICS = CATALOG_META.filter((m) => m.kind === "character" && getCatalog(m.id).length >= OPTION_COUNT);

/** Topics Party Trivia can use: anything with a trivia bank. */
const TRIVIA_TOPICS = CATEGORIES.filter((c) => !c.hidden && hasTrivia(c.id));

/** What a game can be played from: topics, decks, or nothing (Mafia, Loadout). */
export function topicOptions(format: FormatId): TopicOption[] {
  switch (format) {
    case "imposter": return IMPOSTER_TOPICS.map((t) => ({ id: t.id, title: category(t.id)?.title ?? t.title }));
    case "partytrivia": return TRIVIA_TOPICS.map((t) => ({ id: t.id, title: t.title }));
    case "vowelplay":
    case "vowelparty": return VOWEL_TOPICS.map((t) => ({ id: t.id, title: t.title }));
    case "pecking": return PECKING_META.map((m) => ({ id: m.id, title: m.title, blurb: `${m.size} items · ${m.source} · as of ${m.asOf}` }));
    case "vote": return DECKS.map((d) => ({ id: d.id, title: d.title, blurb: d.blurb }));
    case "insync": return INSYNC_DECKS.map((d) => ({ id: d.id, title: d.title, blurb: d.blurb }));
    case "mafia":
    case "loadout": return [];
    default: return CATEGORIES.filter((c) => !c.hidden && formatsFor(c.id).includes(format)).map((c) => ({ id: c.id, title: c.title }));
  }
}

/** Drafts play from one topic; party games can mix several. */
export const singleTopic = (format: FormatId) => !["imposter", "vote", "insync", "partytrivia", "pecking", "vowelplay", "vowelparty"].includes(format);

/** The topic a game's setup starts on when nothing else applies. */
export function defaultTopic(format: FormatId): string | null {
  if (format === "mafia") return "mafia";
  const ids = topicOptions(format).map((o) => o.id);
  if (format === "imposter" && ids.includes("superheroes")) return "superheroes";
  if (format === "insync" && ids.includes("friends")) return "friends";
  if (singleTopic(format)) return CATEGORIES.find((c) => formatsFor(c.id).includes(format))?.id ?? ids[0] ?? null;
  return ids[0] ?? null;
}

/**
 * The topics a game's setup opens with. A planned tournament game opens on the host's picks for its slot; with none,
 * the format's own default, never the last game's topics. Outside a tournament, the room's last mix when it still fits.
 */
export function startPools(format: FormatId, slotPools: string[] | null | undefined, lastPools: string[], inTournament: boolean): string[] {
  if (format === "mafia") return ["mafia"];
  const ids = topicOptions(format).map((o) => o.id);
  if (!ids.length) return []; // nothing to pick from (Loadout): its setup chooses for itself
  const fit = (pools: string[] | null | undefined) => [...new Set(pools ?? [])].filter((p) => ids.includes(p));
  const slot = fit(slotPools);
  if (slot.length) return singleTopic(format) ? slot.slice(0, 1) : slot;
  if (!inTournament) {
    const last = fit(lastPools);
    if (last.length) return singleTopic(format) ? last.slice(0, 1) : last;
  }
  const d = defaultTopic(format);
  return d ? [d] : [];
}

/** A slot's topics as one short line ("Villains", "Superheroes and Villains"), or null when unset. */
export function topicTitle(format: FormatId, pools: string[] | null | undefined): string | null {
  if (!pools?.length) return null;
  const opts = topicOptions(format);
  return mixTitle(pools.map((p) => opts.find((o) => o.id === p)?.title ?? p));
}

/** Party games the host sets up on PartySetup (every party format); drafts use SetupScreen. */
export const usesPartySetup = (format: string): format is "imposter" | "vote" | "insync" | "partytrivia" | "mafia" | "vowelplay" | "vowelparty" | "pecking" =>
  PARTY_FORMATS.has(format as FormatId);
