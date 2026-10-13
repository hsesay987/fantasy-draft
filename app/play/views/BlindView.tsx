"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";
import { PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import { RollRow, rollMs } from "../../topicDraft/components/RollRow";
import * as B from "../../topicDraft/formats/blind";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

export function BlindView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as B.BlindState;
  const player = s.done ? null : B.turnPlayer(s);
  const ai = ctl.isAi(player);
  const mine = ctl.controls(player);
  const itemId = B.currentItemId(s);
  const item = itemId ? ctl.byId(itemId) : null;

  useEffect(() => {
    if (!ai || !item || !player || s.done) return;
    const t = setTimeout(() => {
      const { rank, seed } = B.aiPlace(s, item);
      ctl.dispatch({ type: "place", by: player, rank, seed });
      play("click");
    }, setup.opts.roll ? rollMs(1) + 600 : 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, s.turn, item?.id, s.done]);

  if (s.done || !player || !item) return null;
  const row = s.ranks[player]!;
  const place = (rank: number) => {
    if (!mine || row[rank] != null) return;
    ctl.dispatch({ type: "place", by: player, rank });
    play("pick");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <PageShell width="md">
      <GameFrame kicker={`Blind Rank · Reveal ${B.revealIndex(s) + 1}/${s.size}`} headline={mine ? `${player}: where does it go?` : `${player} is ranking…`} mission={setup.mission} mystery={setup.mystery}>
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Next up — no take-backs</p>
            {setup.opts.roll ? <RollRow items={[item]} shuffleFrom={ctl.pool} rollKey={`${B.revealIndex(s)}`} /> : <HeroCard key={item.id} item={item} />}
          </div>
          <ol className="space-y-2" aria-label="Your ranking">
            {row.map((id, i) => {
              const placed = id ? ctl.byId(id) : null;
              return (
                <li key={i}>
                  <button type="button" disabled={!!placed || !mine} onClick={() => place(i)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${placed ? "border-secondary/40 bg-primary/15" : "border-dashed border-white/15 hover:border-secondary hover:bg-primary/10"}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 font-display">{i + 1}</span>
                    <span className="font-semibold">{placed ? placed.name : "Place here"}</span>
                    {placed && <Check className="ml-auto h-4 w-4 text-success" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </GameFrame>
    </PageShell>
  );
}
