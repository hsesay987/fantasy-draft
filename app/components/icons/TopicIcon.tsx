// TopPic's own topic icons: drawn here on a 24px grid in one line weight, so nothing is fetched from an image
// URL and nothing needs a credit. They take the text colour, like the Lucide icons used for games.
import type { ReactNode } from "react";

const c = (cx: number, cy: number, r: number, fill = false) => <circle cx={cx} cy={cy} r={r} {...(fill ? { fill: "currentColor", stroke: "none" } : {})} />;

const GLYPHS: Record<string, ReactNode> = {
  // Every universe at once: a big spark and two small ones.
  fictional: <><path d="M10 3l1.8 5.2L17 10l-5.2 1.8L10 17l-1.8-5.2L3 10l5.2-1.8z" /><path d="M18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9z" /><path d="M18.5 3.5v3M17 5h3" /></>,
  // A domino mask.
  superheroes: <><path d="M3 10.5C3 8.5 4.8 7 7.2 7c2 0 3.2 1.2 4.8 1.2S14.8 7 16.8 7C19.2 7 21 8.5 21 10.5c0 3.2-1.9 6-4.4 6-2 0-3-2-4.6-2s-2.6 2-4.6 2C4.9 16.5 3 13.7 3 10.5z" /><path d="M6.5 11c.8-.9 2.2-.9 3 0M14.5 11c.8-.9 2.2-.9 3 0" /></>,
  // A skull.
  villains: <><path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.3 3 5.5V18a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.5c1.8-1.2 3-3.1 3-5.5a7 7 0 0 0-7-7z" />{c(9.5, 11, 1.3)}{c(14.5, 11, 1.3)}<path d="M10.5 19v-2M13.5 19v-2" /></>,
  // Crossed swords.
  "heroes-villains": <><path d="M4 4l11 11M20 4L9 15M4 4h3M4 4v3M20 4h-3M20 4v3" /><path d="M6.5 13.5l4 4M17.5 13.5l-4 4M7 18l-3 3M17 18l3 3" /></>,
  // A burst of energy.
  anime: <path d="M12 2l2.2 5.2L19.5 5l-2.2 5.3L22 12l-4.7 1.7 2.2 5.3-5.3-2.2L12 22l-2.2-5.2L4.5 19l2.2-5.3L2 12l4.7-1.7L4.5 5l5.3 2.2z" />,
  // A charged orb.
  pokemon: <>{c(12, 12, 9)}<path d="M13 6.5l-4 6.5h3l-1 4.5 4-6.5h-3z" /></>,
  // A gamepad.
  videogames: <><path d="M7 8h10a5 5 0 0 1 5 5 3.5 3.5 0 0 1-6.3 2.1L15 14H9l-.7 1.1A3.5 3.5 0 0 1 2 13a5 5 0 0 1 5-5z" /><path d="M7 10.5v3M5.5 12h3" />{c(16, 11, 0.9, true)}{c(18, 13, 0.9, true)}</>,
  // A fairy-tale castle.
  disney: <><path d="M3 21V11h3V8h3v3h6V8h3v3h3v10z" /><path d="M10 21v-3.5a2 2 0 0 1 4 0V21M12 8V3l3 1.5L12 6" /></>,
  // A clapperboard.
  movies: <><path d="M4 11h16v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 11l-.8-3.2 15.5-3.9.8 3.2zM8 6.7l2 3.9M12.9 5.5l2 3.9" /></>,
  // A cartoon face on a TV.
  cartoon: <><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M8 3l4 5 4-5M9 15.5c1.2 1.3 4.8 1.3 6 0" />{c(9, 12.5, 0.9, true)}{c(15, 12.5, 0.9, true)}</>,
  // A basketball.
  nba: <>{c(12, 12, 9)}<path d="M3 12h18M12 3v18M5.6 5.6c3.2 3.4 3.2 9.4 0 12.8M18.4 5.6c-3.2 3.4-3.2 9.4 0 12.8" /></>,
  // An American football.
  nfl: <><path d="M4.5 19.5C3 13 6.5 6 13.5 4.5c2.5-.5 5-.3 6 0 .3 1 .5 3.5 0 6-1.5 7-8.5 10.5-15 9z" /><path d="M9.5 14.5l5-5M10.8 11.8l1.4 1.4M12.8 9.8l1.4 1.4" /></>,
  // A football.
  football: <>{c(12, 12, 9)}<path d="M12 8l3.3 2.4-1.3 3.9h-4l-1.3-3.9zM12 8V3.5M15.3 10.4l4.3-1.5M14 14.3l2.7 3.8M10 14.3l-2.7 3.8M8.7 10.4L4.4 8.9" /></>,
  // A strip of film.
  films: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7.5 4v16M16.5 4v16M3 8h4.5M3 12h4.5M3 16h4.5M16.5 8H21M16.5 12H21M16.5 16H21" /></>,
  // A television.
  shows: <><rect x="2" y="5" width="20" height="13" rx="2" /><path d="M8 21h8M12 18v3" /></>,
  // A pair of notes.
  music: <><path d="M9 18V6l11-2.5V15.5" />{c(6.5, 18, 2.5)}{c(17.5, 15.5, 2.5)}</>,
  // An open book.
  books: <path d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5V20" />,
  // A globe.
  geography: <>{c(12, 12, 9)}<path d="M3 12h18M12 3c3.3 3.2 3.3 14.8 0 18M12 3c-3.3 3.2-3.3 14.8 0 18" /></>,
  // A flag on a pole.
  flags: <path d="M5 21V4M5 5c3-1.5 5.5 1.5 9 0 1.7-.7 3.2-1 5-.5v8c-1.8-.5-3.3-.2-5 .5-3.5 1.5-6-1.5-9 0" />,
  // A steaming bowl.
  food: <><path d="M3 11h18a9 9 0 0 1-18 0zM9 20h6" /><path d="M8 7.5c0-1.5 1-1.5 1-3M12 7.5c0-1.5 1-1.5 1-3M16 7.5c0-1.5 1-1.5 1-3" /></>,
  // A temple.
  history: <path d="M3 9l9-5 9 5zM6 9v9M10 9v9M14 9v9M18 9v9M4 18h16M3 21h18" />,
  // A pencil: made by a player.
  custom: <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />,
  // A question mark: hidden until the reveal.
  mystery: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2" />{c(12, 16.7, 0.9, true)}</>,
};

export const hasTopicIcon = (id: string) => id in GLYPHS;

export function TopicIcon({ id, className = "h-6 w-6", title }: { id: string; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" className={className} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {GLYPHS[id] ?? GLYPHS.fictional}
    </svg>
  );
}
