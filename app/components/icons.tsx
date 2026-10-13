// Custom icons drawn to match lucide: 24px grid, 2px round strokes, currentColor.
import { useId, type SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;
export type IconType = (props: IconProps) => React.JSX.Element;

const base = (p: IconProps): IconProps => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  ...p,
});

/** Dragon Ball (four-star): glossy orange orb with a 2x2 grid of red stars. Full colour on purpose. */
export const DragonBallIcon: IconType = (p) => {
  const id = useId();
  return (
    <svg {...base({ ...p, fill: "none", stroke: "none" })}>
      <defs>
        <linearGradient id={`${id}-g`} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f58a2e" />
          <stop offset="1" stopColor="#fbb02d" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10.2" fill={`url(#${id}-g)`} stroke="#f2994a" strokeWidth="0.8" />
      <path d="M8.50 7.05L9.08 8.60L10.73 8.67L9.44 9.70L9.88 11.30L8.50 10.39L7.12 11.30L7.56 9.70L6.27 8.67L7.92 8.60Z" fill="#c9272d" />
      <path d="M15.50 7.05L16.08 8.60L17.73 8.67L16.44 9.70L16.88 11.30L15.50 10.39L14.12 11.30L14.56 9.70L13.27 8.67L14.92 8.60Z" fill="#c9272d" />
      <path d="M8.50 12.85L9.08 14.40L10.73 14.47L9.44 15.50L9.88 17.10L8.50 16.19L7.12 17.10L7.56 15.50L6.27 14.47L7.92 14.40Z" fill="#c9272d" />
      <path d="M15.50 12.85L16.08 14.40L17.73 14.47L16.44 15.50L16.88 17.10L15.50 16.19L14.12 17.10L14.56 15.50L13.27 14.47L14.92 14.40Z" fill="#c9272d" />
      <ellipse cx="6.4" cy="7.6" rx="2" ry="1.25" transform="rotate(-38 6.4 7.6)" fill="#fff" opacity="0.5" />
      <ellipse cx="8.8" cy="5.2" rx="0.75" ry="0.55" transform="rotate(-38 8.8 5.2)" fill="#fff" opacity="0.5" />
    </svg>
  );
};

/** Poké Ball. */
export const PokeballIcon: IconType = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h6.2M15.3 12h6.2" />
    <circle cx="12" cy="12" r="3.3" />
  </svg>
);

/** American football: bold outline, two end stripes and five laces. */
export const FootballIcon: IconType = (p) => (
  <svg {...base({ strokeWidth: 1.8, ...p })}>
    <path d="M3 21c-.5-9.2 8.8-18.5 18-18 .5 9.2-8.8 18.5-18 18z" />
    <path d="M14.8 4.6l4.6 4.6" />
    <path d="M4.6 14.8l4.6 4.6" />
    <path d="M9.6 14.4l4.8-4.8" strokeWidth="1.4" />
    <path d="M8.65 13.45L10.55 15.35M9.85 12.25L11.75 14.15M11.05 11.05L12.95 12.95M12.25 9.85L14.15 11.75M13.45 8.65L15.35 10.55" strokeWidth="1.4" />
  </svg>
);

/** Basketball. */
export const BasketballIcon: IconType = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 2.5v19M2.5 12h19" />
    <path d="M5.2 5.2a9.5 9.5 0 0 1 0 13.6M18.8 5.2a9.5 9.5 0 0 0 0 13.6" />
  </svg>
);

/** Superman shield: wide solid shield with the stylised S cut out (after the reference). */
export const SupermanIcon: IconType = (p) => {
  const id = useId();
  return (
    <svg {...base({ ...p, fill: "none", stroke: "none" })}>
      <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        {/* S: upper hook, spine, lower hook */}
        <path d="M17.6 7.2c-1.2-1.3-3-1.9-5-1.6-2.4.3-3.6 1.4-3.2 2.8.5 1.7 3 1.9 5 2.3 2.1.4 3.4 1.2 3.1 2.8-.3 1.6-2.2 2.5-4.6 2.6-1.9.1-3.6-.4-4.9-1.4" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </mask>
      <path mask={`url(#${id}-m)`} d="M12 21.9 1.2 9.6c-.2-.2-.2-.5-.1-.7l1.2-3.4c.2-.5.6-.9 1.2-1h15.4c.6.1 1 .5 1.2 1l1.2 3.4c.1.2.1.5-.1.7z" fill="currentColor" />
    </svg>
  );
};

/** Darth Vader helmet: solid silhouette with brow, eyes, nose and grille cut out. */
export const VaderIcon: IconType = (p) => (
  <svg {...base({ ...p, fill: "currentColor", stroke: "none" })}>
    <path
      fillRule="evenodd"
      d="M4.2 10.2C4.2 5.2 7.4 2 12 2s7.8 3.2 7.8 8.2l3.9 9.3c.2 1.5-4.9 3.1-11.7 3.1S-.1 21 .3 19.5zM2.1 18.3l.7.1 3.3-7.6C7 8.8 9 8 11.4 9l.6.3.6-.3C15 8 17 8.8 17.9 10.8l3.3 7.6.7-.1-3.5-8.2C17.4 7.9 14.6 7 12 8.2 9.4 7 6.6 7.9 5.6 10.1zM6.4 12.6V11.1c0-.9.8-1.5 1.8-1.5h.9c.6 0 1.1.4 1.1 1v1.3c0 .6-.5 1-1.1 1H7.4c-.6 0-1-.4-1-.9zm7.4-1.9c0-.6.5-1 1.1-1h.9c1 0 1.8.6 1.8 1.5v1.5c0 .5-.4.9-1 .9h-1.7c-.6 0-1.1-.4-1.1-1zM10.7 16v-1.7c0-.8.5-1.4 1.3-1.4s1.3.6 1.3 1.4V16zM8.4 20.1v-2.8l.9.9v1.9zm2 0v-3.1h1.1v3.1zm2.1 0v-3.1h1.1v3.1zm2.2 0v-1.9l.9-.9v2.8zM6.2 20.4a.7.7 0 1 1 0-.1zm11.6 0a.7.7 0 1 0 0-.1z"
    />
  </svg>
);
