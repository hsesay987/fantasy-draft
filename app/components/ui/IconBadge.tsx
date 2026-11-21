import type { ComponentType } from "react";
import { TopicIcon } from "../icons/TopicIcon";

/** Soft colour behind an icon. Colour means one thing only: which section or kind of game this is. */
export const TINT = {
  characters: "bg-violet-500/15 text-violet-300",
  sports: "bg-orange-500/15 text-orange-300",
  screen: "bg-sky-500/15 text-sky-300",
  world: "bg-emerald-500/15 text-emerald-300",
  custom: "bg-pink-500/15 text-pink-300",
  neutral: "bg-white/8 text-secondary",
} as const;
export type Tint = keyof typeof TINT;

const SIZE = { sm: "h-9 w-9 rounded-lg [&>svg]:h-5 [&>svg]:w-5", md: "h-11 w-11 rounded-xl [&>svg]:h-6 [&>svg]:w-6", lg: "h-14 w-14 rounded-2xl [&>svg]:h-7 [&>svg]:w-7" } as const;

/** The one icon tile used everywhere: a topic's own glyph, or a Lucide icon for a game. `tint` may also be a class string. */
export function IconBadge({ topic, icon: Icon, tint = "neutral", size = "md", className = "" }: { topic?: string; icon?: ComponentType<{ className?: string }>; tint?: Tint | (string & {}); size?: keyof typeof SIZE; className?: string }) {
  return (
    <span className={`grid shrink-0 place-items-center ${SIZE[size]} ${TINT[tint as Tint] ?? tint} ${className}`}>
      {topic ? <TopicIcon id={topic} /> : Icon ? <Icon /> : null}
    </span>
  );
}
