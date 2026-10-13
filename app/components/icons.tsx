// Custom icons drawn to match lucide: 24px grid, 2px round strokes, currentColor.
import type { SVGProps } from "react";

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

/** Dragon Ball: orb with four stars. */
export const DragonBallIcon: IconType = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 6.8l.6 1.3 1.4.2-1 1 .3 1.4-1.3-.7-1.3.7.3-1.4-1-1 1.4-.2z" fill="currentColor" strokeWidth="1" />
    <path d="M8 13l.5 1 1 .15-.75.75.2 1-.95-.5-.95.5.2-1-.75-.75 1-.15z" fill="currentColor" strokeWidth="1" />
    <path d="M16 13l.5 1 1 .15-.75.75.2 1-.95-.5-.95.5.2-1-.75-.75 1-.15z" fill="currentColor" strokeWidth="1" />
    <path d="M12 15.2l.45.9.95.15-.7.7.17.95-.87-.45-.87.45.17-.95-.7-.7.95-.15z" fill="currentColor" strokeWidth="1" />
  </svg>
);

/** Poké Ball. */
export const PokeballIcon: IconType = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M2.5 12h6.2M15.3 12h6.2" />
    <circle cx="12" cy="12" r="3.3" />
  </svg>
);

/** American football with laces. */
export const FootballIcon: IconType = (p) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="12" rx="10.5" ry="6.2" transform="rotate(-45 12 12)" />
    <path d="M9.2 14.8l5.6-5.6" />
    <path d="M10.6 10.6l2.8 2.8M12.6 8.6l2.8 2.8M8.6 12.6l2.8 2.8" />
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

/** Superman-style shield with an S. */
export const SupermanIcon: IconType = (p) => (
  <svg {...base(p)}>
    <path d="M12 21.5 2.8 8.4 6.2 2.5h11.6l3.4 5.9z" />
    <path d="M15.2 8.2c-.7-.9-1.8-1.3-3-1.3-1.5 0-2.6.7-2.6 1.8 0 2.3 5 1.1 5 3.6 0 1.1-1.2 1.9-2.7 1.9-1.3 0-2.4-.5-3.1-1.5" />
  </svg>
);
