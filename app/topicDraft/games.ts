import { Swords, Dribbble, Trophy, PartyPopper } from "lucide-react";

export const CLASSIC = [
  { id: "nba", title: "NBA Draft", blurb: "All-time players, your lineup.", href: "/draft/new", icon: Dribbble, gradient: "from-orange-600/40 to-primary/20" },
  { id: "nfl", title: "NFL Draft", blurb: "Gridiron greats, positions and all.", href: "/draft/new?league=NFL", icon: Trophy, gradient: "from-emerald-700/40 to-primary/20" },
  { id: "cartoon", title: "Cartoon Draft", blurb: "Shows and characters from every era.", href: "/draft/new?league=CARTOON", icon: Swords, gradient: "from-sky-600/40 to-accent/20" },
];

export const PARTY = { title: "TopPic Party", blurb: "Live card game for up to 20 players.", href: "/toppic", icon: PartyPopper, gradient: "from-accent/40 to-primary/30" };
