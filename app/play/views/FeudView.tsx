"use client";

import { X } from "lucide-react";
import { PageShell } from "../../components/ui";
import * as FD from "../../topicDraft/formats/feud";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

export function FeudView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as FD.FeudState;
  useAiTurn(setup, ctl, `${s.round}-${s.turn}`, 1300);
  if (s.done) return null;
  const player = FD.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const r = s.rounds[s.round]!;
  const pick = (answer: string) => {
    if (!mine) return;
    ctl.dispatch({ type: "answer", by: player, choice: answer });
    play(r.board.includes(answer) ? "pick" : "click");
  };

  return (
    <PageShell width="lg">
      <GameFrame kicker={`Family Feud · Round ${s.round + 1}/${s.rounds.length}`} headline={r.q} mission={setup.mission} mystery={false}
        right={<div className="flex gap-1" aria-label={`${r.strikes} of ${FD.MAX_STRIKES} strikes`}>{Array.from({ length: FD.MAX_STRIKES }).map((_, i) => <X key={i} className={`h-8 w-8 ${i < r.strikes ? "text-accent" : "text-white/15"}`} aria-hidden />)}</div>}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `${s.points[p]} pts`, active: p === player }))} />
        <p className="text-sm text-muted-foreground">{mine ? `${player}, pick an answer our survey said was in the top ${r.board.length}.` : `${player} is picking…`}</p>
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="Survey board">
          {r.board.map((a, i) => (
            <li key={a} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2 ${r.found[a] ? "border-secondary/40 bg-primary/20" : "border-white/10 bg-white/5"}`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-display">{i + 1}</span>
              <span className="font-semibold">{r.found[a] ? a : "• • • • •"}</span>
              <span className="ml-auto text-sm text-secondary">{r.found[a] ? `${FD.BOARD_POINTS[i]} · ${r.found[a]}` : FD.BOARD_POINTS[i]}</span>
            </li>
          ))}
        </ol>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3" aria-label="Answers to choose from">
          {r.options.map((a) => {
            const used = !!r.found[a] || r.wrong.includes(a);
            return (
              <button key={a} type="button" disabled={used || !mine} onClick={() => pick(a)}
                className={`min-h-12 rounded-xl border px-4 py-2 text-left font-semibold transition-colors ${r.wrong.includes(a) ? "border-accent/40 bg-accent/10 text-accent line-through" : r.found[a] ? "border-success/40 bg-success/10 text-success" : "border-white/10 bg-card/80 hover:border-secondary hover:bg-primary/10 disabled:opacity-60"}`}>
                {a}
              </button>
            );
          })}
        </div>
      </GameFrame>
    </PageShell>
  );
}
