"use client";

import { Check, Trash2 } from "lucide-react";
import { Button, PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as K from "../../topicDraft/formats/keep";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

export function KeepView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as K.KeepState;
  useAiTurn(setup, ctl, `${s.turn}`);
  if (s.done) return null;
  const player = K.turnPlayer(s);
  const mine = ctl.controls(player);
  const item = ctl.byId(K.currentItemId(s)!);
  const forced = K.forced(s);
  const decide = (keep: boolean) => {
    if (!mine) return;
    ctl.dispatch({ type: "answer", by: player, choice: keep ? "keep" : "delete" });
    play(keep ? "pick" : "click");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };
  const kept = s.keeps[player]!.map((id) => ctl.byId(id)).filter(Boolean);

  return (
    <PageShell width="md">
      <GameFrame kicker={`Keep or Delete · Reveal ${K.revealIndex(s) + 1}/${s.queue.length}`} headline={mine ? `${player}: keep or delete?` : `${player} is deciding…`} mission={setup.mission} mystery={setup.mystery}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `${s.keeps[p]!.length}/${s.size}`, active: p === player }))} />
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            {item && <HeroCard key={`${item.id}-${player}`} item={item} />}
            {forced && <p className="text-sm text-accent">{forced === "keep" ? "Last chances — you must keep this one." : "Roster full — this one has to go."}</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button variant="ghost" disabled={!mine || forced === "keep"} onClick={() => decide(false)}><Trash2 className="h-4 w-4" aria-hidden /> Delete</Button>
              <Button variant="accent" disabled={!mine || forced === "delete"} onClick={() => decide(true)}><Check className="h-4 w-4" aria-hidden /> Keep</Button>
            </div>
          </div>
          <section aria-label={`${player}'s roster`} className="space-y-2">
            <p className="text-sm text-muted-foreground">{player}&apos;s roster — {kept.length} of {s.size} kept</p>
            {Array.from({ length: s.size }).map((_, i) => (
              <div key={i} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2 ${kept[i] ? "border-secondary/40 bg-primary/15" : "border-dashed border-white/15 text-muted-foreground"}`}>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-display text-sm">{i + 1}</span>
                <span className="font-semibold">{kept[i]?.name ?? "Empty"}</span>
              </div>
            ))}
          </section>
        </div>
      </GameFrame>
    </PageShell>
  );
}
