"use client";

import { useEffect, useState } from "react";
import { Sprite } from "../../components/pixel/Sprite";
import { hero, type Sprite as SpriteData } from "../../components/pixel/sprites";
import type { DrinkCall } from "../../topicDraft/party/drinks";

/** The pixel character for the player in seat `i`. The one place to swap in player-chosen characters later. */
export const playerSprite = (i: number): SpriteData => hero(i);

const MUG: SpriteData = {
  rows: ["..FFFFFF....", "..FFFFFF....", ".XWWWWWWX...", ".XAAAAAAXXX.", ".XAAAAAAX.X.", ".XAAAAAAX.X.", ".XAAAAAAXXX.", ".XAAAAAAX...", "..XXXXXX...."],
  pal: { X: "#2b1a0e", W: "#fff4d6", A: "#e0a030", F: "#fff4d6" },
};
const DROP: SpriteData = {
  rows: ["...X....", "..XXX...", "..XXX...", ".XXXXX..", "XXXXXXX.", "XXXXXXX.", ".XXXXX..", "..XXX..."],
  pal: { X: "#7dd3fc" },
};

export const WATER_LINE = "Water counts and nobody has to drink.";

/** Host switch for sip cards. Turning it on needs the host to confirm everyone is of legal drinking age. */
export function DrinkingToggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="tavern-toggle">
      <button type="button" role="switch" aria-checked={value} onClick={() => (value ? onChange(false) : setAsking(true))} className={`tavern-switch ${value ? "on" : ""}`}>
        <Sprite sprite={MUG} size={28} />
        <span className="txt"><b>Drinking mode</b><span>{value ? "On. Cards will hand out sips." : "Off. Sip cards stay hidden."}</span></span>
        <span className="pip" aria-hidden>{value ? "ON" : "OFF"}</span>
      </button>
      <p className="tavern-water"><Sprite sprite={DROP} size={14} /> {WATER_LINE}</p>
      {asking && (
        <div className="tavern-modal" role="dialog" aria-modal="true" aria-label="Drinking mode">
          <div className="tavern-sheet">
            <Sprite sprite={MUG} size={40} />
            <p>Everyone playing is of legal drinking age.</p>
            <p className="tavern-water"><Sprite sprite={DROP} size={14} /> {WATER_LINE}</p>
            <div className="row">
              <button type="button" className="tavern-btn go" onClick={() => { setAsking(false); onChange(true); }}>Yes, turn it on</button>
              <button type="button" className="tavern-btn" onClick={() => setAsking(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const DRINK_MS = 4000;

/**
 * Sip cards for this round, as a tavern slate. Shows for 4 seconds, tap to dismiss, and shows again whenever
 * `seq` changes. `names` maps a card's player to a seat so the sprite matches the rest of the game.
 */
export function DrinkCard({ calls, seq, names = [] }: { calls: DrinkCall[]; seq: number; names?: string[] }) {
  const [shown, setShown] = useState(seq);
  useEffect(() => {
    setShown(seq);
    const id = setTimeout(() => setShown(-1), DRINK_MS);
    return () => clearTimeout(id);
  }, [seq]);
  if (shown !== seq || calls.length === 0) return null;
  return (
    <div className="tavern-card" role="status" aria-live="polite" onClick={() => setShown(-1)}>
      <ul>
        {calls.map((c, i) => (
          <li key={`${seq}-${i}`} className={c.water ? "water" : ""}>
            <Sprite sprite={c.water ? DROP : c.to === "all" ? MUG : playerSprite(Math.max(0, names.indexOf(c.to)))} size={24} />
            <span className="who"><b>{c.to === "all" ? "Everyone" : c.to}</b><span>{c.reason}</span></span>
            <span className="sips">{c.water ? "Water" : c.handsOut ? `Hand out ${c.sips}` : `${c.sips} ${c.sips === 1 ? "sip" : "sips"}`}</span>
          </li>
        ))}
      </ul>
      <p className="tavern-water"><Sprite sprite={DROP} size={14} /> {WATER_LINE}</p>
      <span className="hint">Tap to close</span>
    </div>
  );
}

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
