import type { FormatId } from "./types";
import { hasTrivia } from "../topicDraft/trivia";

export type CategoryDefaults = {
  teamSize: number;
  missionId: string;
  rankSize: number;
  timerSeconds: number;
  /** Default auction budget: ~$5 per slot, tuned per category. */
  budget: number;
};

export type Category = {
  id: string;
  title: string;
  blurb: string;
  /** Flat PNG/SVG icon from /public/icons (credited in the footer). */
  iconSrc: string;
  gradient: string;
  /** Best draft types for this topic, first is the one-tap default. */
  recommended: { format: FormatId; why: string }[];
  defaults: CategoryDefaults;
  /** Not listed as a topic. */
  hidden?: boolean;
};

export const CATEGORIES: Category[] = [
  {
    id: "fictional", title: "All Fictional Characters", blurb: "Heroes, villains, anime, games, Disney, movies and Pokémon in one pool.", iconSrc: "/icons/swords.png", gradient: "from-fuchsia-600/40 to-accent/20",
    recommended: [{ format: "spin", why: "Roll random fighters from every universe" }, { format: "auction", why: "Bid across franchises, blind if you dare" }],
    defaults: { teamSize: 6, missionId: "all-around", rankSize: 8, timerSeconds: 20, budget: 30 },
  },
  {
    id: "superheroes", title: "Superheroes", blurb: "Marvel, DC and indie heroes.", iconSrc: "/icons/superman.png", gradient: "from-primary/50 to-accent/20",
    recommended: [{ format: "loadout", why: "Build a kit to beat any boss you name" }, { format: "snake", why: "Classic squad draft" }],
    defaults: { teamSize: 5, missionId: "alien-invasion", rankSize: 6, timerSeconds: 30, budget: 25 },
  },
  {
    id: "villains", title: "Villains", blurb: "The deadliest rogues gallery.", iconSrc: "/icons/vader.png", gradient: "from-rose-700/40 to-primary/20",
    recommended: [{ format: "auction", why: "Bid for the biggest threats" }, { format: "snake", why: "Draft your crime syndicate" }],
    defaults: { teamSize: 5, missionId: "tournament", rankSize: 6, timerSeconds: 30, budget: 25 },
  },
  {
    id: "heroes-villains", title: "Heroes & Villains", blurb: "One big pool, both sides.", iconSrc: "/icons/swords.png", gradient: "from-fuchsia-600/40 to-primary/20",
    recommended: [{ format: "spin", why: "Anything can show up" }, { format: "position", why: "Mix sides across roles" }],
    defaults: { teamSize: 6, missionId: "all-around", rankSize: 8, timerSeconds: 20, budget: 30 },
  },
  {
    id: "anime", title: "Anime", blurb: "Fighters, rivals and sidekicks.", iconSrc: "/icons/dragon-ball.png", gradient: "from-orange-500/45 to-accent/20",
    recommended: [{ format: "blind", why: "Rank who hits hardest" }, { format: "position", why: "Hero, Rival, Mentor, Sidekick" }],
    defaults: { teamSize: 5, missionId: "tournament", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "pokemon", title: "Pokémon", blurb: "Build a team of six.", iconSrc: "/icons/pokeballs.png", gradient: "from-red-600/40 to-primary/20",
    recommended: [{ format: "spin", why: "Roll your party" }, { format: "snake", why: "Draft a champion six" }],
    defaults: { teamSize: 6, missionId: "tournament", rankSize: 8, timerSeconds: 20, budget: 30 },
  },
  {
    id: "videogames", title: "Video Game Icons", blurb: "Mascots, heroes and bosses.", iconSrc: "/icons/mystery-block.png", gradient: "from-emerald-600/40 to-primary/20",
    recommended: [{ format: "spin", why: "Quick-fire random picks" }, { format: "snake", why: "Draft your co-op squad" }],
    defaults: { teamSize: 4, missionId: "space-war", rankSize: 6, timerSeconds: 20, budget: 20 },
  },
  {
    id: "disney", title: "Disney & Pixar", blurb: "Magic, heart and a few villains.", iconSrc: "/icons/mickey.png", gradient: "from-indigo-600/40 to-primary/20",
    recommended: [{ format: "blind", why: "Rank the most magical" }, { format: "position", why: "Cast your fairy-tale crew" }],
    defaults: { teamSize: 4, missionId: "all-around", rankSize: 6, timerSeconds: 25, budget: 20 },
  },
  {
    id: "movies", title: "Movie Icons", blurb: "Action stars to monsters.", iconSrc: "/icons/clapperboard.svg", gradient: "from-amber-500/40 to-accent/20",
    recommended: [{ format: "auction", why: "Bid like a studio head" }, { format: "position", why: "Cast the perfect heist crew" }],
    defaults: { teamSize: 5, missionId: "heist", rankSize: 8, timerSeconds: 30, budget: 25 },
  },
  {
    id: "history", title: "Historical Figures", blurb: "Leaders, geniuses and icons.", iconSrc: "/icons/history.png", gradient: "from-stone-500/40 to-primary/20",
    recommended: [{ format: "position", why: "Fill a cabinet" }, { format: "blind", why: "Rank the greatest minds" }],
    defaults: { teamSize: 5, missionId: "dinner-party", rankSize: 6, timerSeconds: 30, budget: 25 },
  },
  {
    id: "football", title: "International Football", blurb: "World Cup legends and today\u2019s stars.", iconSrc: "/icons/soccer.svg", gradient: "from-green-600/40 to-accent/20",
    recommended: [{ format: "position", why: "Choose your starting XI by position" }, { format: "auction", why: "Bid for the biggest names" }],
    defaults: { teamSize: 5, missionId: "world-cup-final", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "films", title: "Films", blurb: "Classics, blockbusters and cult hits.", iconSrc: "/icons/film.svg", gradient: "from-red-700/40 to-primary/20",
    recommended: [{ format: "blind", why: "Rank the best of the best" }, { format: "position", why: "Plan a perfect movie marathon" }],
    defaults: { teamSize: 5, missionId: "crowd-favourite", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "shows", title: "TV Shows", blurb: "Binge-worthy series, all genres.", iconSrc: "/icons/tv.svg", gradient: "from-cyan-600/40 to-primary/20",
    recommended: [{ format: "blind", why: "Rank the greatest series" }, { format: "snake", why: "Draft your ultimate watchlist" }],
    defaults: { teamSize: 5, missionId: "rewatch-king", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "nba", title: "NBA Legends", blurb: "All-time greats with real heights, teams and best seasons.", iconSrc: "/icons/basketball.png", gradient: "from-orange-600/40 to-primary/20",
    recommended: [{ format: "auction", why: "Bid blind on clues: height, team colours, best season" }, { format: "snake", why: "Draft your all-time starting five" }],
    defaults: { teamSize: 5, missionId: "all-around-basketball", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "food", title: "Food", blurb: "Dishes from every kitchen in the world.", iconSrc: "/icons/food.svg", gradient: "from-amber-600/40 to-accent/20",
    recommended: [{ format: "position", why: "Plan a five-course menu" }, { format: "blind", why: "Rank the tastiest" }],
    defaults: { teamSize: 5, missionId: "food-festival", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "geography", title: "Geography", blurb: "Countries, from superpowers to island hideaways.", iconSrc: "/icons/globe.svg", gradient: "from-teal-600/40 to-primary/20",
    recommended: [{ format: "auction", why: "Bid for the best places on Earth" }, { format: "position", why: "Build your dream world tour" }],
    defaults: { teamSize: 5, missionId: "dream-holiday", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "flags", title: "Flags", blurb: "The world\u2019s flags, judged on design.", iconSrc: "/icons/flag.svg", gradient: "from-red-600/40 to-accent/20",
    recommended: [{ format: "blind", why: "Rank each flag as it flies in" }, { format: "keep", why: "Keep the best, bin the rest" }],
    defaults: { teamSize: 5, missionId: "design-award", rankSize: 8, timerSeconds: 20, budget: 25 },
  },
  {
    id: "books", title: "Books", blurb: "Classics, page-turners and epic series.", iconSrc: "/icons/book.svg", gradient: "from-yellow-700/40 to-primary/20",
    recommended: [{ format: "snake", why: "Draft your dream bookshelf" }, { format: "blind", why: "Rank the greatest reads" }],
    defaults: { teamSize: 5, missionId: "book-club", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
  {
    id: "music", title: "Music", blurb: "Legends, bands and today\u2019s hitmakers.", iconSrc: "/icons/music.svg", gradient: "from-violet-600/40 to-accent/20",
    recommended: [{ format: "position", why: "Book a festival lineup" }, { format: "auction", why: "Bid like a record label" }],
    defaults: { teamSize: 5, missionId: "headline-festival", rankSize: 8, timerSeconds: 25, budget: 25 },
  },
];

/** Spin Draft is the default way in for every topic; each topic's other best fits follow it. */
for (const c of CATEGORIES) {
  const spin = c.recommended.find((r) => r.format === "spin");
  c.recommended = [spin ?? { format: "spin", why: "Roll random options and pick — the fastest way in" }, ...c.recommended.filter((r) => r.format !== "spin")];
}

export const category = (id: string) => CATEGORIES.find((c) => c.id === id);

/** A classic stat draft: real career stats by era and team, played on its own pages. */
export type ClassicDraft = { title: string; blurb: string; href: string; premium?: boolean };

/** Classic stat drafts offered under each topic. They sit beside the topic's other draft types instead of in a separate row. */
export const CLASSIC_DRAFTS: Record<string, ClassicDraft[]> = {
  nba: [
    { title: "NBA stat draft", blurb: "Real career stats by era and team. Solo against the AI, or in a live room with friends.", href: "/draft/new" },
    { title: "Live NBA room", blurb: "Draft with friends on their own devices.", href: "/online?league=NBA" },
  ],
  nfl: [
    { title: "NFL stat draft", blurb: "Gridiron greats by position, with real career stats.", href: "/draft/new?league=NFL", premium: true },
    { title: "Live NFL room", blurb: "Draft with friends on their own devices.", href: "/online?league=NFL", premium: true },
  ],
  cartoon: [
    { title: "Cartoon stat draft", blurb: "Shows and characters from every era, scored by the community.", href: "/draft/new?league=CARTOON", premium: true },
    { title: "Live Cartoon room", blurb: "Draft with friends on their own devices.", href: "/online?league=CARTOON", premium: true },
  ],
};

/** Topics that only have a classic stat draft (no pool of characters for the other draft types). */
export const CLASSIC_ONLY: Omit<Category, "recommended" | "defaults">[] = [
  { id: "nfl", title: "NFL", blurb: "Gridiron greats, positions and all.", iconSrc: "/icons/football.png", gradient: "from-emerald-700/40 to-primary/20" },
  { id: "cartoon", title: "Cartoons", blurb: "Shows and characters from every era.", iconSrc: "/icons/turtle.png", gradient: "from-sky-600/40 to-accent/20" },
];

export type Topic = { id: string; title: string; blurb: string; iconSrc: string; gradient: string };
/** Topics grouped under a main heading on the home page, in display order. */
export const TOPIC_GROUPS: { id: string; title: string; blurb: string; ids: string[] }[] = [
  { id: "characters", title: "Characters", blurb: "Heroes, villains and icons from every universe.", ids: ["fictional", "superheroes", "villains", "heroes-villains", "anime", "pokemon", "videogames", "disney", "movies", "cartoon"] },
  { id: "sports", title: "Sports", blurb: "Real players, real stats.", ids: ["nba", "nfl", "football"] },
  { id: "entertainment", title: "Entertainment", blurb: "What you watch, read and listen to.", ids: ["films", "shows", "music", "books"] },
  { id: "world", title: "The World", blurb: "Places, flags, food and the people who made history.", ids: ["geography", "flags", "food", "history"] },
];
const HOME_ORDER = TOPIC_GROUPS.flatMap((g) => g.ids);
/** Every topic in one list: draft pools and classic leagues side by side. */
export const TOPICS: Topic[] = [...CATEGORIES.filter((c) => !c.hidden), ...CLASSIC_ONLY]
  .sort((a, b) => (HOME_ORDER.indexOf(a.id) + 1 || 99) - (HOME_ORDER.indexOf(b.id) + 1 || 99));
export const topic = (id: string): Topic | undefined => TOPICS.find((t) => t.id === id);
export const topicsIn = (groupId: string): Topic[] => TOPIC_GROUPS.find((g) => g.id === groupId)?.ids.map((id) => topic(id)).filter((t): t is Topic => !!t) ?? [];

export const FORMAT_WHY: Record<FormatId, string> = {
  snake: "Take turns picking",
  spin: "Choose 1 of a few random options",
  auction: "Bid on random characters",
  loadout: "Build a kit to beat a boss",
  position: "Assign a random hand to roles",
  blind: "Rank each reveal on the spot",
  keep: "Keep or delete every reveal",
  feud: "Name the survey's top answers",
  jeopardy: "Choose clues, win the board",
};

/** Formats that make sense for a category (Loadout needs hero-ish items). */
export const LOADOUT_CATEGORIES = new Set(["superheroes", "villains", "heroes-villains", "anime", "movies", "videogames"]);
export function formatsFor(pool: string): FormatId[] {
  if (!CATEGORIES.some((c) => c.id === pool)) return [];
  const all: FormatId[] = ["snake", "spin", "auction", "position", "blind", "keep", ...(hasTrivia(pool) ? (["feud", "jeopardy"] as FormatId[]) : [])];
  return LOADOUT_CATEGORIES.has(pool) ? [...all, "loadout"] : all;
}
