"use client";

import { useEffect, useRef, useState } from "react";
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

/** The small line every drinking screen carries. */
export const WaterLine = () => <p className="tavern-water"><Sprite sprite={DROP} size={14} /> {WATER_LINE}</p>;

/** Host switch for sip cards. Turning it on needs the host to confirm everyone is of legal drinking age. */
export function DrinkingToggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  const [asking, setAsking] = useState(false);
  const switchRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    setAsking(false);
    switchRef.current?.focus();
  };
  useEffect(() => {
    if (!asking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);
  return (
    <div className="tavern-toggle">
      <button ref={switchRef} type="button" role="switch" aria-checked={value} onClick={() => (value ? onChange(false) : setAsking(true))} className={`tavern-switch ${value ? "on" : ""}`}>
        <Sprite sprite={MUG} size={28} />
        <span className="txt"><b>Drinking mode</b><span>{value ? "On. Cards will hand out sips." : "Off. Sip cards stay hidden."}</span></span>
        <span className="pip" aria-hidden>{value ? "ON" : "OFF"}</span>
      </button>
      <WaterLine />
      {asking && (
        <div className="tavern-modal" role="dialog" aria-modal="true" aria-label="Drinking mode">
          <div className="tavern-sheet">
            <Sprite sprite={MUG} size={40} />
            <p>Everyone playing is of legal drinking age.</p>
            <WaterLine />
            <div className="row">
              <button type="button" className="tavern-btn go" onClick={() => { close(); onChange(true); }}>Yes, turn it on</button>
              <button type="button" className="tavern-btn" autoFocus onClick={close}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BOOTH: SpriteData = {
  rows: ["XXXXXXXXXX", "XRWRWRWRWX", "XXXXXXXXXX", ".XBNBNBNX.", ".XBNBNBNX.", ".XBNBNBNX.", ".XBNBNBNX.", ".XBNBNBNX.", ".X..KK..X.", ".X..KK..X."],
  pal: { X: "#2a180c", R: "#c8392b", W: "#f3ead0", B: "#27406e", N: "#3c5a92", K: "#14101f" },
};

/** Host switch for the vote reveal: open the booths, or keep every vote secret for the whole game. */
export function ShowVotesToggle({ value, onChange }: { value: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} onClick={() => onChange(!value)} className={`tavern-switch hall ${value ? "on" : ""}`}>
      <Sprite sprite={BOOTH} size={28} />
      <span className="txt"><b>Show votes</b><span>{value ? "On. The booths open after each card." : "Off. Votes stay secret, and only totals show at the end."}</span></span>
      <span className="pip" aria-hidden>{value ? "ON" : "OFF"}</span>
    </button>
  );
}

const DRINK_MS = 4000;

/** Remembers for this tab which sip cards have been shown, per room and game, so a refresh or a later screen does not call them again. */
const drinkSeenKey = (game: number, seq: number) => `toppic:drink-seen:${window.location.pathname}:${game}:${seq}`;
const drinkSeen = (game: number, seq: number) => {
  try {
    return window.sessionStorage.getItem(drinkSeenKey(game, seq)) !== null;
  } catch {
    return false;
  }
};
const markDrinkSeen = (game: number, seq: number) => {
  try {
    window.sessionStorage.setItem(drinkSeenKey(game, seq), "1");
  } catch {
    /* storage unavailable: the card may show again, which is harmless */
  }
};

/**
 * Sip cards for this round, as a tavern slate. Shows for 4 seconds, tap to dismiss, and shows once per `seq`: a card
 * this tab already showed stays closed. `game` is the game's seed. `names` maps a card's player to a seat so the sprite
 * matches the rest of the game.
 */
export function DrinkCard({ calls, seq, game, names = [] }: { calls: DrinkCall[]; seq: number; game: number; names?: string[] }) {
  const [shown, setShown] = useState(() => (drinkSeen(game, seq) ? -1 : seq));
  const claimed = useRef<number | null>(null); // this mount's card, so React's dev re-run of the effect does not hide it
  const hasCalls = calls.length > 0;
  useEffect(() => {
    if (!hasCalls) return;
    if (claimed.current !== seq && drinkSeen(game, seq)) return setShown(-1);
    claimed.current = seq;
    markDrinkSeen(game, seq);
    setShown(seq);
    const id = setTimeout(() => setShown(-1), DRINK_MS);
    return () => clearTimeout(id);
  }, [seq, game, hasCalls]);
  if (shown !== seq || !hasCalls) return null;
  return (
    <div className="tavern-card" onClick={() => setShown(-1)}>
      <div className="said" role="status" aria-live="polite">
        <ul>
          {calls.map((c, i) => (
            <li key={`${seq}-${i}`} className={c.water ? "water" : ""}>
              <Sprite sprite={c.water ? DROP : c.to === "all" ? MUG : playerSprite(Math.max(0, names.indexOf(c.to)))} size={24} />
              <span className="who"><b>{c.to === "all" ? "Everyone" : c.to}</b><span>{c.reason}</span></span>
              <span className="sips">{c.water ? "Water" : c.handsOut ? `Hand out ${c.sips}` : `${c.sips} ${c.sips === 1 ? "sip" : "sips"}`}</span>
            </li>
          ))}
        </ul>
        <WaterLine />
      </div>
      <button type="button" className="hint" onClick={() => setShown(-1)}>Close</button>
    </div>
  );
}

const CLOCK_TICKS = 10;

/** A countdown for timed party phases, read against the server clock: a pixel read-out over a draining row of ticks. */
export function PartyClock({ deadline, offset, total }: { deadline: number; offset: number; total: number }) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const lit = Math.ceil(Math.max(0, Math.min(1, (deadline - now) / total)) * CLOCK_TICKS);
  return (
    <span className={`px-clock ${left <= 5 ? "low" : ""}`} role="timer" aria-label={`${left} seconds left`}>
      <b>{left}</b>
      <span className="ticks" aria-hidden>{Array.from({ length: CLOCK_TICKS }, (_, i) => <i key={i} className={i < lit ? "on" : ""} />)}</span>
    </span>
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
              <span className="walker"><Sprite sprite={playerSprite(i)} size={24} /></span>
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
