"use client";

import { PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as J from "../../topicDraft/formats/jeopardy";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const LABEL: Record<string, string> = { power: "Strength", intellect: "Brains", speed: "Speed", durability: "Toughness", combat: "Fighting", teamwork: "Teamwork", leadership: "Leadership", courage: "Courage", influence: "Influence", charisma: "Charm", strategy: "Strategy", pace: "Pace", shooting: "Shooting", passing: "Passing", dribbling: "Dribbling", defending: "Defending", physical: "Physical", story: "Story", acting: "Acting", visuals: "Visuals", rewatch: "Rewatch", fun: "Fun" };

export function JeopardyView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as J.JeopardyState;
  useAiTurn(setup, ctl, `${s.resolved}-${s.active}`, 1200);
  if (s.done) return null;
  const player = J.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const cols = J.colsOf(s);
  const active = s.active != null ? s.cells[s.active]! : null;

  return (
    <PageShell width="lg">
      <GameFrame kicker={`Jeopardy · Clue ${s.resolved + 1}/${s.cells.length}`} headline={active ? `${LABEL[active.metric] ?? active.metric} for $${active.value}` : mine ? `${player}: pick a clue` : `${player} is picking…`} mission={setup.mission} mystery={setup.mystery}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `$${s.points[p]}`, active: p === player }))} />
        {active ? (
          <section className="space-y-3" aria-label="Clue">
            <p className="text-lg">Who ranks highest for <b>{LABEL[active.metric] ?? active.metric}</b>?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {active.options.map((id) => { const it = ctl.byId(id); return it ? <HeroCard key={id} item={it} compact onClick={mine ? () => { ctl.dispatch({ type: "answer", by: player, choice: id }); play("pick"); } : undefined} /> : null; })}
            </div>
          </section>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }} role="grid" aria-label="Board">
            {s.cats.map((c) => <div key={c} className="rounded-lg bg-primary/30 px-2 py-3 text-center text-sm font-semibold uppercase tracking-wider">{LABEL[c] ?? c}</div>)}
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
