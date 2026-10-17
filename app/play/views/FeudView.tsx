"use client";

import { X } from "lucide-react";
import { PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as FD from "../../topicDraft/formats/feud";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const LABEL: Record<string, string> = { power: "strongest", intellect: "smartest", speed: "fastest", durability: "toughest", combat: "best fighter", teamwork: "best teammate", leadership: "best leader", courage: "bravest", influence: "most influential", charisma: "most charming", strategy: "best strategist", pace: "fastest", shooting: "best finisher", passing: "best passer", dribbling: "best dribbler", defending: "best defender", physical: "strongest", story: "best story", acting: "best acting", visuals: "best visuals", rewatch: "most rewatchable", fun: "most fun" };

export function FeudView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as FD.FeudState;
  useAiTurn(setup, ctl, `${s.round}-${s.turn}`, 1300);
  if (s.done) return null;
  const player = FD.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const r = s.rounds[s.round]!;
  const pick = (id: string) => {
    if (!mine) return;
    const good = r.board.includes(id);
    ctl.dispatch({ type: "answer", by: player, choice: id });
    play(good ? "pick" : "click");
  };

  return (
    <PageShell width="lg">
      <GameFrame kicker={`Family Feud · Round ${s.round + 1}/${s.rounds.length}`} headline={`We asked 100 fans: who is the ${LABEL[r.metric] ?? r.metric}?`} mission={setup.mission} mystery={setup.mystery}
        right={<div className="flex gap-1" aria-label={`${r.strikes} of ${FD.MAX_STRIKES} strikes`}>{Array.from({ length: FD.MAX_STRIKES }).map((_, i) => <X key={i} className={`h-8 w-8 ${i < r.strikes ? "text-accent" : "text-white/15"}`} aria-hidden />)}</div>}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `${s.points[p]} pts`, active: p === player }))} />
        <p className="text-sm text-muted-foreground">{mine ? `${player}, name one of the top ${r.board.length}.` : `${player} is picking…`}</p>
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="Survey board">
          {r.board.map((id, i) => (
            <li key={id} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2 ${r.found[id] ? "border-secondary/40 bg-primary/20" : "border-white/10 bg-white/5"}`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-display">{i + 1}</span>
              <span className="font-semibold">{r.found[id] ? ctl.byId(id)?.name : "• • • • •"}</span>
              <span className="ml-auto text-sm text-secondary">{r.found[id] ? `${FD.BOARD_POINTS[i]} · ${r.found[id]}` : FD.BOARD_POINTS[i]}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Answers to choose from">
          {r.options.map((id) => { const it = ctl.byId(id); return it ? <HeroCard key={id} item={it} compact taken={!!r.found[id]} banned={r.wrong.includes(id)} onClick={mine ? () => pick(id) : undefined} /> : null; })}
        </div>
      </GameFrame>
    </PageShell>
  );
}
