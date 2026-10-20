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
    play(keep ? "pick" : "delete");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };
  const kept = s.keeps[player]!.map((id) => ctl.byId(id)).filter(Boolean);
  const gone = s.deleted[player]!.map((id) => ctl.byId(id)).filter(Boolean);

  return (
    <PageShell width="lg">
      <GameFrame kicker={`Keep or Delete · Reveal ${K.revealIndex(s) + 1}/${s.queue.length}`} headline={mine ? `${player}: keep or delete?` : `${player} is deciding…`} mission={setup.mission} mystery={setup.mystery}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `${s.keeps[p]!.length}/${s.size} kept`, active: p === player }))} />
        <div className="mx-auto w-full max-w-sm space-y-2">
          {item && <HeroCard key={`${item.id}-${player}`} item={item} />}
          {forced && <p className="text-center text-sm text-accent">{forced === "keep" ? "Stream is running out: this one must be kept." : "Roster is full: this one has to go."}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <section aria-label="Keep column" className="space-y-2 rounded-2xl border border-success/30 bg-success/5 p-3">
            <Button variant="accent" className="w-full" disabled={!mine || forced === "delete"} onClick={() => decide(true)}><Check className="h-4 w-4" aria-hidden /> Keep</Button>
            <p className="text-center text-xs text-muted-foreground">{kept.length} of {s.size}</p>
            <ul className="space-y-1.5">
              {Array.from({ length: s.size }).map((_, i) => (
                <li key={i} className={`flex min-h-10 items-center rounded-lg border px-3 py-1.5 text-sm ${kept[i] ? "border-success/40 bg-success/10 font-semibold" : "border-dashed border-white/10 text-muted-foreground"}`}>{kept[i]?.name ?? "—"}</li>
              ))}
            </ul>
          </section>
          <section aria-label="Delete column" className="space-y-2 rounded-2xl border border-accent/30 bg-accent/5 p-3">
            <Button variant="ghost" className="w-full" disabled={!mine || forced === "keep"} onClick={() => decide(false)}><Trash2 className="h-4 w-4" aria-hidden /> Delete</Button>
            <p className="text-center text-xs text-muted-foreground">{gone.length} deleted</p>
            <ul className="space-y-1.5">
              {gone.map((g) => <li key={g!.id} className="flex min-h-10 items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-muted-foreground line-through">{g!.name}</li>)}
            </ul>
          </section>
        </div>
      </GameFrame>
    </PageShell>
  );
}
