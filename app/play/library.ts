// Every game on the site in one list, so the home page, the games page and a topic page all describe a game the
// same way. Three kinds, named for what you do: draft a team, answer a quiz, or play a party game on your phones.
import { ArrowUpFromLine, BarChart3, Crosshair, Layers, Link2, Tag, type LucideIcon } from "lucide-react";
import type { DailyGame } from "../lib/daily";
import { FORMATS, PARTY_GAMES, formatMeta } from "./formats";

export type GameKind = "draft" | "quiz" | "party";

export type LibraryGame = {
  id: string;
  kind: GameKind;
  title: string;
  tagline: string;
  icon: LucideIcon;
  /** Where "Play" goes. Games that take a topic accept `?pool=`, or a path segment when `topicHref` is set. */
  href: string;
  topicHref?: (pool: string) => string;
  /** Has a puzzle that is the same for everyone each day. */
  daily?: DailyGame;
  /** Short line on who it is for: "1 to 6 players". */
  players: string;
};

export const KINDS: { kind: GameKind; title: string; blurb: string; tint: string }[] = [
  { kind: "draft", title: "Draft", blurb: "Build a team from any topic. The judge decides who drafted best.", tint: "bg-violet-500/15 text-violet-300" },
  { kind: "quiz", title: "Quiz", blurb: "Real facts, most with a new puzzle every day.", tint: "bg-sky-500/15 text-sky-300" },
  { kind: "party", title: "Party", blurb: "One room, everyone on their own phone.", tint: "bg-amber-500/15 text-amber-300" },
];
export const kindMeta = (kind: GameKind) => KINDS.find((k) => k.kind === kind)!;

const QUIZ_FORMATS = new Set(["feud", "jeopardy"]);
const DAILY_OF: Record<string, DailyGame> = { jeopardy: "summit", feud: "hotair" };

const fromFormats: LibraryGame[] = FORMATS.map((f) => ({
  id: f.id, kind: QUIZ_FORMATS.has(f.id) ? "quiz" : "draft", title: f.title, tagline: f.tagline, icon: f.icon, href: `/play/${f.id}`, daily: DAILY_OF[f.id],
  players: QUIZ_FORMATS.has(f.id) ? "Solo, against the AI or with friends" : "1 to 6 players",
}));

const standalone: LibraryGame[] = [
  { id: "toprung", kind: "quiz", title: "Top Rung", tagline: "One question a rung, up a lighthouse ladder. A slip drops you to your last safe ledge.", icon: ArrowUpFromLine, href: "/toprung", topicHref: (p) => `/toprung/${p}`, daily: "toprung", players: "Solo" },
  { id: "pinpoint", kind: "quiz", title: "Pinpoint", tagline: "Guess the hidden pick. Every guess shows how close you are on real facts.", icon: Crosshair, href: "/pinpoint", topicHref: (p) => `/pinpoint/${p}`, players: "Solo, a new pick each day" },
  { id: "vowelplay", kind: "quiz", title: "Vowel Play", tagline: "The vowels are gone. Name it from the letters that are left.", icon: formatMeta("vowelplay")!.icon, href: "/vowelplay", topicHref: (p) => `/vowelplay/${p}`, players: "Solo or head to head" },
  { id: "pecking-solo", kind: "quiz", title: "Pecking Order", tagline: "Guess where things rank on real top lists. Closer scores more.", icon: formatMeta("pecking")!.icon, href: "/pecking", daily: "pecking", players: "Solo" },
  { id: "commonthread", kind: "quiz", title: "Common Thread", tagline: "Six clues share one hidden fact. The fewer you need, the more you score.", icon: Link2, href: "/commonthread", topicHref: (p) => `/commonthread/${p}`, players: "Solo" },
  { id: "costimation", kind: "quiz", title: "Costimation", tagline: "Guess what real products cost. Close guesses fly your ship further.", icon: Tag, href: "/costimation", daily: "costimation", players: "Solo" },
  { id: "statdraft", kind: "draft", title: "Stat Draft", tagline: "NBA, NFL and cartoon drafts scored on full career stats, by era and team.", icon: BarChart3, href: "/draft", players: "Solo or a live room" },
];

const party: LibraryGame[] = [
  ...PARTY_GAMES.map((f) => ({ id: f.id, kind: "party" as const, title: f.title, tagline: f.tagline, icon: f.icon, href: "/online", daily: f.id === "npat" ? ("npat" as const) : undefined, players: f.id === "mafia" ? "5 to 12 players" : "3 to 12 players" })),
  { id: "cards", kind: "party", title: "TopPic Cards", tagline: "Everyone plays their best character card to finish the prompt. Up to 20 players.", icon: Layers, href: "/toppic", players: "3 to 20 players" },
];

export const LIBRARY: LibraryGame[] = [...fromFormats, ...standalone, ...party];
export const gamesOf = (kind: GameKind) => LIBRARY.filter((g) => g.kind === kind);
export const libraryGame = (id: string) => LIBRARY.find((g) => g.id === id);
export const DAILY_LIBRARY = LIBRARY.filter((g) => g.daily);
/** Where a game starts for a topic. */
export const playHref = (g: LibraryGame, pool?: string) => (!pool ? g.href : g.topicHref ? g.topicHref(pool) : g.href.startsWith("/play/") ? `${g.href}?pool=${pool}` : g.href);
