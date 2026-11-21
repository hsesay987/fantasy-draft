import { Brain, CalendarDays, Layers, PartyPopper, PenLine } from "lucide-react";
import { FORMATS } from "../play/formats";

/** The whole site in five tabs, named for what you do. The logo goes home; every game also has its own page under /games. */
export const NAV = [
  { href: "/drafts", label: "Drafts", icon: Layers },
  { href: "/trivia", label: "Trivia", icon: Brain },
  { href: "/online", label: "Party", icon: PartyPopper },
  { href: "/community", label: "Community", icon: PenLine },
  { href: "/daily", label: "Daily", icon: CalendarDays },
] as const;

const TRIVIA_FORMATS = new Set(["feud", "jeopardy"]);

/** Sections that live under one of the tabs, so the right tab stays lit. */
const UNDER: Record<string, string[]> = {
  "/drafts": ["/draft", "/category", "/topics", "/topic", ...FORMATS.filter((f) => !TRIVIA_FORMATS.has(f.id)).map((f) => `/play/${f.id}`)],
  "/trivia": ["/toprung", "/pinpoint", "/vowelplay", "/pecking", "/commonthread", "/costimation", "/quiz", ...[...TRIVIA_FORMATS].map((id) => `/play/${id}`)],
  "/online": ["/room", "/toppic", "/imposter"],
};
export function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  return path.startsWith(href) || (UNDER[href] ?? []).some((p) => path.startsWith(p));
}
