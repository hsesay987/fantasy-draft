"use client";

import { useEffect, useState } from "react";
import { GameTile } from "../components/ui";
import { DAILY_GAMES, DAILY_TITLES, playedOn, todayKey, type DailyGame, type Played } from "../lib/daily";
import { LIBRARY, kindMeta } from "../play/library";

/** Today's puzzles. Ones you already played today show where you got to. */
export function DailyList() {
  const [done, setDone] = useState<Partial<Record<DailyGame, Played | null>>>({});
  useEffect(() => {
    const day = todayKey();
    // Read after mount: the results live in this browser's storage, which the server cannot see.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone(Object.fromEntries(DAILY_GAMES.map((g) => [g, playedOn(g, day)])));
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {DAILY_GAMES.map((d) => {
        const g = LIBRARY.find((x) => x.daily === d);
        const p = done[d];
        return (
          <GameTile key={d} title={DAILY_TITLES[d]} blurb={g?.tagline} icon={g?.icon} tint={g ? kindMeta(g.kind).tint : undefined}
            badge={p ? "Played" : undefined} meta={p ? `Today: ${p.score} · ${p.checkpoint}` : "New puzzle today"} href={`/daily/${d}`} />
        );
      })}
    </div>
  );
}
