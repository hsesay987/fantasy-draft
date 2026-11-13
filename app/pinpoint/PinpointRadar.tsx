"use client";

import type { Hint } from "./engine";

const R = 100;
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 2166136261);
const color = (h: Hint) => (h.correct ? "#34d399" : h.closeness >= 80 ? "#34d399" : h.closeness >= 50 ? "#fcd34d" : "#fb7185");

/**
 * A radar scope with the hidden pick at the centre. Each guess is a blip whose distance from the centre is how far off it
 * is, at an angle fixed by its id. The newest blip flies in from the rim; a correct guess locks the crosshair on.
 */
export function PinpointRadar({ hints, fresh, won }: { hints: Hint[]; fresh: string | null; won: boolean }) {
  const best = hints.reduce((m, h) => Math.max(m, h.closeness), 0);
  return (
    <figure className={`pp-radar relative mx-auto mt-0 mb-6 aspect-square w-full max-w-[260px] ${won ? "won" : ""}`} aria-label={hints.length ? `Closest guess so far: ${best} percent` : "Radar: no guesses yet"}>
      <svg viewBox="-110 -110 220 220" className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <radialGradient id="pp-glow"><stop offset="0" stopColor="#10b981" stopOpacity=".28" /><stop offset="1" stopColor="#10b981" stopOpacity="0" /></radialGradient>
        </defs>
        <circle r={R} fill="#06130f" stroke="#10b98155" />
        <circle r={R} fill="url(#pp-glow)" />
        {[0.25, 0.5, 0.75].map((f) => <circle key={f} r={R * f} fill="none" stroke="#10b98133" strokeDasharray="3 4" />)}
        <path d={`M${-R} 0H${R}M0 ${-R}V${R}`} stroke="#10b98133" />
        {!won && <g className="pp-sweep"><path d={`M0 0L0 ${-R}A${R} ${R} 0 0 1 ${R * Math.sin(0.6)} ${-R * Math.cos(0.6)}Z`} fill="#10b98122" /><path d={`M0 0V${-R}`} stroke="#34d39988" strokeWidth="1.5" /></g>}
        {hints.map((h) => {
          const a = ((hash(h.item.id) % 360) * Math.PI) / 180;
          const d = h.correct ? 0 : Math.max(12, ((100 - h.closeness) / 100) * (R - 8));
          const x = Math.cos(a) * d, y = Math.sin(a) * d;
          const isNew = h.item.id === fresh;
          return (
            <g key={h.item.id} className={isNew ? "pp-blip new" : "pp-blip"}
              style={isNew ? ({ "--dx": `${Math.cos(a) * (R + 10) - x}px`, "--dy": `${Math.sin(a) * (R + 10) - y}px` } as React.CSSProperties) : undefined}>
              <g transform={`translate(${x} ${y})`}>
                {isNew && <circle className="pp-ping" r="6" fill="none" stroke={color(h)} strokeWidth="2" />}
                <circle r={h.correct ? 7 : 5} fill={color(h)} />
              </g>
            </g>
          );
        })}
        <g className="pp-cross">
          <circle r="14" fill="none" stroke={won ? "#34d399" : "#f2b84b"} strokeWidth="2.5" />
          <path d="M-22 0H-8M8 0H22M0 -22V-8M0 8V22" stroke={won ? "#34d399" : "#f2b84b"} strokeWidth="2.5" />
        </g>
      </svg>
      {hints.length > 0 && <figcaption className="pointer-events-none absolute inset-x-0 -bottom-1 text-center text-xs font-semibold uppercase tracking-wider text-emerald-300/80">{won ? "Locked on" : `Closest ${best}%`}</figcaption>}
    </figure>
  );
}
