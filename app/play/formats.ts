import { Swords, Gavel, Boxes, Users2, ListOrdered, Dices, ThumbsUp, BarChart3, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { FormatId } from "./types";

export type FormatMeta = {
  id: FormatId;
  title: string;
  tagline: string;
  how: string[];
  icon: LucideIcon;
  gradient: string;
  usesPool: boolean;
};

export const FORMATS: FormatMeta[] = [
  { id: "snake", title: "Classic Draft", tagline: "Take turns picking. Snake order, roles, bans.", how: ["Players alternate picks; order flips each round.", "Choose anyone left in the pool.", "AI judge scores each squad for the mission."], icon: Swords, gradient: "from-primary/50 to-accent/20", usesPool: true },
  { id: "auction", title: "Auction", tagline: "Everyone gets a budget. Bid on random characters.", how: ["A random character goes up for bid.", "Highest bid when the timer ends wins them.", "Spend wisely: you must fill every slot."], icon: Gavel, gradient: "from-amber-500/40 to-accent/20", usesPool: true },
  { id: "loadout", title: "Loadout", tagline: "Build a kit within budget to beat a boss.", how: ["Fill slots like Weapon, Gadget, Sidekick.", "Prices follow each item's stat.", "Cover the boss's weaknesses to win."], icon: Boxes, gradient: "from-emerald-600/40 to-primary/20", usesPool: false },
  { id: "position", title: "Positions", tagline: "Random hand. Assign your Captain, Healer, Tank…", how: ["You're dealt a random hand.", "Assign each character to a role.", "Best role fit wins. Roles are editable."], icon: Users2, gradient: "from-sky-600/40 to-primary/20", usesPool: true },
  { id: "blind", title: "Blind Rank", tagline: "Slot each reveal into a rank. No take-backs.", how: ["Characters reveal one at a time.", "Place each into a rank immediately.", "Closest to the true order wins."], icon: ListOrdered, gradient: "from-fuchsia-600/40 to-primary/20", usesPool: true },
  { id: "spin", title: "Spin Draft", tagline: "Choose 1 of a few random options each turn.", how: ["Each turn shows a few random options.", "Take one, or spend a reroll.", "Luck and judgement."], icon: Dices, gradient: "from-rose-600/40 to-primary/20", usesPool: true },
  { id: "keep", title: "Keep or Delete", tagline: "One stream of reveals. Keep it or lose it forever.", how: ["A character is revealed to everyone, one player at a time.", "Keep them for your roster or delete them for good.", "Fill your roster before the stream runs out."], icon: ThumbsUp, gradient: "from-lime-600/40 to-primary/20", usesPool: true },
  { id: "feud", title: "Hot Air", tagline: "Say what everyone would say. Popular answers lift your balloon.", how: ["A question asks you to name something.", "Take turns naming one of the top five answers.", "The more common the answer, the higher you rise. Three misses and the round is over."], icon: BarChart3, gradient: "from-orange-600/40 to-primary/20", usesPool: true },
  { id: "jeopardy", title: "Summit", tagline: "Pick a clue, climb the mountain. Harder clues climb higher.", how: ["Choose a category and a camp: higher camps are harder clues.", "Pick the right answer out of four.", "Right answers climb that many metres, wrong ones slide you back."], icon: HelpCircle, gradient: "from-blue-700/40 to-primary/20", usesPool: true },
];

export const formatMeta = (id: string) => FORMATS.find((f) => f.id === id);
