"use client";

import { useEffect, useRef } from "react";
import { PageShell } from "../../components/ui";
import * as J from "../../topicDraft/formats/jeopardy";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

export function JeopardyView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as J.JeopardyState;
  useAiTurn(setup, ctl, `${s.resolved}-${s.active}`, 1200);
  // One sound per answered clue, for humans and the AI alike: a win chime or a buzzer.
  const seen = useRef(s.resolved);
  useEffect(() => {
    if (s.resolved > seen.current && s.last != null) play(s.cells[s.last]!.correct ? "win" : "wrong");
    seen.current = s.resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.resolved]);
  if (s.done) return null;
  const player = J.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const cols = J.colsOf(s);
  const active = s.active != null ? s.cells[s.active]! : null;

  return (
    <PageShell width="lg">
      <GameFrame kicker={`Jeopardy · Clue ${s.resolved + 1}/${s.cells.length}`} headline={active ? `${active.cat} for $${active.value}` : mine ? `${player}: choose a clue` : `${player} is picking…`} mission={setup.mission} mystery={false}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `$${s.points[p]}`, active: p === player }))} />
        {active ? (
          <section className="space-y-3" aria-label="Clue">
            <p className="text-xl">{active.q}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {active.options.map((o) => (
                <button key={o} type="button" disabled={!mine} onClick={() => { ctl.dispatch({ type: "answer", by: player, choice: o }); }}
                  className="min-h-14 rounded-xl border border-white/10 bg-card/80 px-4 py-3 text-left font-semibold transition-colors hover:border-secondary hover:bg-primary/10 disabled:opacity-60">{o}</button>
              ))}
            </div>
          </section>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="grid" aria-label="Board">
            {s.cats.map((c) => <div key={c} className="rounded-lg bg-primary/30 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wider">{c}</div>)}
            {s.cells.map((c, i) => (
              <button key={i} type="button" disabled={c.done || !mine} onClick={() => { ctl.dispatch({ type: "choose", by: player, cell: i }); play("click"); }}
                className={`min-h-16 rounded-lg border font-display text-2xl transition-colors ${c.done ? (c.correct ? "border-success/40 bg-success/10 text-success" : "border-accent/40 bg-accent/10 text-accent") : "border-white/10 bg-card/80 text-secondary hover:bg-primary/20 disabled:opacity-60"}`}>
                {c.done ? (c.correct ? "✓" : "✗") : `$${c.value}`}
              </button>
            ))}
          </div>
        )}
      </GameFrame>
    </PageShell>
  );
}
