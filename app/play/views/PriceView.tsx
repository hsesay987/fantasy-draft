"use client";

import { useEffect, useState } from "react";
import { Button, PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as PR from "../../topicDraft/formats/price";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

export function PriceView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as PR.PriceState;
  const [value, setValue] = useState(50);
  useAiTurn(setup, ctl, `${s.round}-${s.turn}`);
  useEffect(() => setValue(50), [s.round, s.turn]);
  if (s.done) return null;
  const player = PR.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const item = ctl.byId(PR.currentItemId(s)!);
  const last = s.round > 0 ? s.rounds[s.round - 1]! : null;
  const lastItem = last ? ctl.byId(last.itemId) : null;
  const lock = () => {
    if (!mine) return;
    ctl.dispatch({ type: "answer", by: player, choice: value });
    play("pick");
  };

  return (
    <PageShell width="md">
      <GameFrame kicker={`Price Is Right · Round ${s.round + 1}/${s.queue.length}`} headline={mine ? `${player}: what's it worth?` : `${player} is guessing…`} mission={setup.mission} mystery={setup.mystery}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `${s.points[p]} pts`, active: p === player }))} />
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          <div className="space-y-2">{item && <HeroCard key={item.id} item={item} compact />}<p className="text-xs text-muted-foreground">Stats hidden. Guess its 0–100 rating for the mission. Closest without going over wins.</p></div>
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-card/70 p-5">
              <div className="font-display text-6xl text-secondary" aria-live="polite">{mine ? value : "?"}</div>
              <input type="range" min={0} max={100} value={value} disabled={!mine} onChange={(e) => setValue(+e.target.value)} className="mt-4 w-full accent-[var(--primary)]" aria-label="Your guess" />
              <Button className="mt-4" variant="accent" disabled={!mine} onClick={lock}>Lock in {mine ? value : ""}</Button>
            </div>
            {last && lastItem && (
              <div className="rounded-2xl border border-white/10 bg-card/70 p-4 text-sm">
                <p className="font-semibold">Last round: {lastItem.name} was rated {s.truth[last.itemId]}</p>
                <p className="mt-1 text-muted-foreground">{Object.entries(last.guesses).map(([p, g]) => `${p} ${g}`).join(" · ")}</p>
                <p className="mt-1 text-secondary">{last.winner ? `${last.winner} wins it${last.allOver ? " (everyone went over)" : ""}.` : "Tie — nobody takes it."}</p>
              </div>
            )}
          </div>
        </div>
      </GameFrame>
    </PageShell>
  );
}
