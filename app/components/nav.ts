import { Compass, Gamepad2, PenLine, Play, UserRound } from "lucide-react";

/** The whole site in four places: start playing, every game, every topic, and what players made. */
export const NAV = [
  { href: "/", label: "Play", icon: Play },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/topics", label: "Topics", icon: Compass },
  { href: "/community", label: "Community", icon: PenLine },
] as const;

/** Phones get the account as a fifth tab; on wide screens it sits in the top bar. */
export const ACCOUNT_TAB = { href: "/account", label: "Me", icon: UserRound } as const;

/** Older sections that now live under one of the four places, so the right tab stays lit. */
const UNDER: Record<string, string[]> = {
  "/games": ["/play", "/trivia", "/toppic", "/daily", "/draft", "/online", "/room", "/toprung", "/pinpoint", "/vowelplay", "/pecking", "/commonthread", "/costimation"],
  "/topics": ["/category"],
};
export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path.startsWith(href) || (UNDER[href] ?? []).some((p) => path.startsWith(p));
}
