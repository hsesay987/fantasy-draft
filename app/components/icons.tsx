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

/** Dragon Ball: orb with the four-star pattern. */
export const DragonBallIcon: IconType = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="10" />
    <path d="M6 5.6a8 8 0 0 1 3-1.6" strokeWidth="1.5" />
    <path d="M12.00 4.70L12.66 6.29L14.38 6.43L13.07 7.55L13.47 9.22L12.00 8.32L10.53 9.22L10.93 7.55L9.62 6.43L11.34 6.29Z" fill="currentColor" strokeWidth="1" />
    <path d="M7.40 9.50L8.06 11.09L9.78 11.23L8.47 12.35L8.87 14.02L7.40 13.12L5.93 14.02L6.33 12.35L5.02 11.23L6.74 11.09Z" fill="currentColor" strokeWidth="1" />
    <path d="M16.60 9.50L17.26 11.09L18.98 11.23L17.67 12.35L18.07 14.02L16.60 13.12L15.13 14.02L15.53 12.35L14.22 11.23L15.94 11.09Z" fill="currentColor" strokeWidth="1" />
    <path d="M12.00 14.30L12.66 15.89L14.38 16.03L13.07 17.15L13.47 18.82L12.00 17.93L10.53 18.82L10.93 17.15L9.62 16.03L11.34 15.89Z" fill="currentColor" strokeWidth="1" />
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

/** American football: pointed ends, laces and end stripes. */
export const FootballIcon: IconType = (p) => (
  <svg {...base(p)}>
    <path d="M2.8 21.2C2.4 11.6 11.6 2.4 21.2 2.8c.4 9.6-8.8 18.8-18.4 18.4z" />
    <path d="M9 15l6-6" />
    <path d="M9.6 12.6l1.8 1.8M11.1 11.1l1.8 1.8M12.6 9.6l1.8 1.8" />
    <path d="M6.2 14.2l3.6 3.6M14.2 6.2l3.6 3.6" />
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

/** Superman shield with the angular S. */
export const SupermanIcon: IconType = (p) => (
  <svg {...base(p)}>
    <path d="M12 21.5 2.5 8.2 6.2 2.5h11.6l3.7 5.7z" />
    <path d="M16.2 7.2H9.6L7.6 9.6l2 2.2h4.8l2 2.4-2.2 2.1H7.8" />
  </svg>
);

/** Darth Vader-style helmet for villains. */
export const VaderIcon: IconType = (p) => (
  <svg {...base(p)}>
    <path d="M12 2.2c-4.6 0-7.8 3.1-7.8 7.3v2.3l-1.3 3.2 2.4 1.7.7 4.6h12l.7-4.6 2.4-1.7-1.3-3.2V9.5c0-4.2-3.2-7.3-7.8-7.3z" />
    <path d="M5 10.8h14" />
    <path d="M6.8 12l3.2 1.3M17.2 12 14 13.3" />
    <path d="M10.8 15.2h2.4L12 17.2z" />
    <path d="M9.2 18.6v1.8M12 18.6v1.8M14.8 18.6v1.8" />
  </svg>
);
