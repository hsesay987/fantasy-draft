"use client";

import { useEffect, useState } from "react";
import { Sprite } from "../../components/pixel/Sprite";
import { hero } from "../../components/pixel/sprites";

/** A countdown for timed party phases, read against the server clock. */
export function PartyClock({ deadline, offset, total }: { deadline: number; offset: number; total: number }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const frac = Math.max(0, Math.min(1, (deadline - now) / total));
  return (
    <span className={`relative grid h-12 w-12 shrink-0 place-items-center rounded-full font-semibold tabular-nums ${left <= 5 ? "text-accent" : ""}`} role="timer" aria-label={`${left} seconds left`}
      style={{ background: `conic-gradient(var(--secondary) ${frac * 360}deg, rgba(255,255,255,0.08) 0)` }}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-background">{left}</span>
    </span>
  );
}

/** Who is in the game, with whoever's turn it is lit up. */
export function PlayerDots({ players, active }: { players: string[]; active: string | null }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Turn order">
      {players.map((p) => (
        <li key={p} className={`rounded-full px-2.5 py-1 text-xs ${p === active ? "bg-secondary font-semibold text-black" : "bg-white/5 text-muted-foreground"}`}>{p}</li>
      ))}
    </ul>
  );
}

/**
 * A row of pixel voting booths. Every player is a little pixel person waiting outside; once they vote they walk
 * into a booth and its curtain closes. On the reveal the curtains open and each person holds up their side.
 */
export function VoteBooths({ players, voted, reveal, labels }: { players: string[]; voted: Set<string>; reveal?: Record<string, "a" | "b">; labels?: { a: string; b: string } }) {
  return (
    <ul className="party-booths" aria-label={reveal ? "How everyone voted" : `${voted.size} of ${players.length} voted`}>
      {players.map((p, i) => {
        const inside = voted.has(p) || !!reveal;
        const side = reveal?.[p];
        return (
          <li key={p} className={`booth ${inside ? "in" : ""} ${reveal ? "open" : ""}`}>
            <span className="cabin" aria-hidden>
              <span className="roof" />
              <span className="walker"><Sprite sprite={hero(i)} size={22} /></span>
              <span className="curtain" />
              {side && <span className={`sign ${side}`}>{side === "a" ? "A" : "B"}</span>}
            </span>
            <span className="name">{p}</span>
            <span className="sr-only">{side && labels ? labels[side] : inside ? "voted" : "thinking"}</span>
          </li>
        );
      })}
    </ul>
  );
}
