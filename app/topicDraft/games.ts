import { Swords, Zap, Skull, Tv, Gamepad2, Sparkles, Film, Music, Landmark, Utensils, Globe2, Dribbble, Trophy, PartyPopper } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getCatalog } from "./catalogs";

export type TopicGame = {
  id: string;
  title: string;
  blurb: string;
  icon: LucideIcon;
  gradient: string;
  live: boolean;
};

const ALL: Omit<TopicGame, "live">[] = [
  { id: "superheroes", title: "Superheroes", blurb: "Build the ultimate squad for a mission.", icon: Zap, gradient: "from-primary/50 to-accent/20" },
  { id: "villains", title: "Villains", blurb: "Assemble the deadliest rogues gallery.", icon: Skull, gradient: "from-rose-700/40 to-primary/20" },
  { id: "anime", title: "Anime", blurb: "Draft your fighters, rivals and sidekicks.", icon: Tv, gradient: "from-sky-600/40 to-primary/20" },
  { id: "videogames", title: "Video Game Icons", blurb: "Mascots, heroes and bosses.", icon: Gamepad2, gradient: "from-emerald-600/40 to-primary/20" },
  { id: "pokemon", title: "Pokémon", blurb: "Pick a team of six to rule the league.", icon: Sparkles, gradient: "from-amber-500/40 to-accent/20" },
  { id: "disney", title: "Disney & Pixar", blurb: "Magic, heart and a few villains.", icon: Film, gradient: "from-indigo-600/40 to-primary/20" },
  { id: "music", title: "Music Artists", blurb: "Form the greatest supergroup ever.", icon: Music, gradient: "from-fuchsia-600/40 to-primary/20" },
  { id: "history", title: "Historical Figures", blurb: "Dinner party or doomsday squad.", icon: Landmark, gradient: "from-stone-500/40 to-primary/20" },
  { id: "food", title: "Foods", blurb: "Draft the perfect menu.", icon: Utensils, gradient: "from-orange-600/40 to-accent/20" },
  { id: "countries", title: "Countries", blurb: "Survival squad of nations.", icon: Globe2, gradient: "from-teal-600/40 to-primary/20" },
];

export const TOPIC_GAMES: TopicGame[] = ALL.map((g) => ({ ...g, live: getCatalog(g.id).length > 0 }));

export const topicGame = (id: string) => TOPIC_GAMES.find((g) => g.id === id);

export const CLASSIC = [
  { id: "nba", title: "NBA Draft", blurb: "All-time players, your lineup.", href: "/draft/new", icon: Dribbble, gradient: "from-orange-600/40 to-primary/20" },
  { id: "nfl", title: "NFL Draft", blurb: "Gridiron greats, positions and all.", href: "/draft/new?league=NFL", icon: Trophy, gradient: "from-emerald-700/40 to-primary/20" },
  { id: "cartoon", title: "Cartoon Draft", blurb: "Shows and characters from every era.", href: "/draft/new?league=CARTOON", icon: Swords, gradient: "from-sky-600/40 to-accent/20" },
];

export const PARTY = { title: "TopPic Party", blurb: "Live card game for up to 20 players.", href: "/toppic", icon: PartyPopper, gradient: "from-accent/40 to-primary/30" };
