"use client";

import { useEffect, useState } from "react";
import { Lock, RefreshCw, Wand2 } from "lucide-react";
import { Button, PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as P from "../../topicDraft/formats/position";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import type { Item } from "../../topicDraft/types";

export function PositionView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as P.PositionState;
  const humans = setup.players.filter((p) => ctl.controls(p));
  const current = humans.find((h) => !s.locked[h]) ?? null;
  const [revealed, setRevealed] = useState<string | null>(humans.length > 1 && !ctl.online ? null : humans[0] ?? null);
  const [selected, setSelected] = useState<string | null>(null);

  // AI lineups are decided up front (local games only).
  useEffect(() => {
    if (ctl.online) return;
    for (const p of setup.players.filter((x) => ctl.isAi(x) && !s.locked[x])) {
      ctl.dispatch({ type: "autoAssign", by: p });
      ctl.dispatch({ type: "lock", by: p });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (s.done) return null;

  if (!current) {
    const waiting = setup.players.filter((p) => !s.locked[p]);
    return (
      <PageShell width="sm" className="py-20 text-center">
        <h1 className="text-3xl">Lineup locked</h1>
        <p className="mt-2 text-muted-foreground">Waiting for {waiting.join(", ")}…</p>
      </PageShell>
    );
  }
  if (revealed !== current) {
    return (
      <PageShell width="sm" className="py-20 text-center">
        <h1 className="text-3xl">Pass to {current}</h1>
        <p className="mt-2 text-muted-foreground">Keep your hand hidden until it&apos;s your turn.</p>
        <Button className="mt-6" onClick={() => setRevealed(current)}>I&apos;m {current} — show my hand</Button>
      </PageShell>
    );
  }

  const hand = s.hands[current]!.map((id) => ctl.byId(id)).filter(Boolean) as Item[];
  const assigned = s.assign[current]!;
  const usedIds = new Set(Object.values(assigned));
  const sel = selected ? ctl.byId(selected) : null;
  const complete = P.complete(s, current);

  const putIn = (roleId: string, id: string) => {
    ctl.dispatch({ type: "assign", by: current, roleId, itemId: id });
    setSelected(null);
    play("pick");
  };

  return (
    <PageShell width="lg">
      <GameFrame kicker="Positions" headline={`${current}: assign your lineup`} mission={setup.mission} mystery={setup.mystery}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section aria-label="Your hand" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg">Your hand <span className="text-sm text-muted-foreground">tap a card, then a role</span></h2>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={s.rerolls[current]! <= 0 || Object.keys(assigned).length > 0} onClick={() => { ctl.dispatch({ type: "reroll", by: current }); setSelected(null); play("click"); }}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Reroll ({s.rerolls[current]})
                </Button>
                <Button variant="ghost" onClick={() => { ctl.dispatch({ type: "autoAssign", by: current }); setSelected(null); play("steal"); }}>
                  <Wand2 className="h-4 w-4" aria-hidden /> Best fit
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {hand.map((i) => (
                <HeroCard key={i.id} item={i} selected={selected === i.id} taken={usedIds.has(i.id)} onClick={() => setSelected(selected === i.id ? null : i.id)}
                  onDoubleClick={() => { const r = s.roles.filter((x) => !assigned[x.id]).sort((a, b) => P.roleFit(i, b) - P.roleFit(i, a))[0]; if (r) putIn(r.id, i.id); }} />
              ))}
            </div>
          </section>

          <section aria-label="Roles" className="space-y-3">
            <h2 className="text-lg">Roles</h2>
            <ul className="space-y-2">
              {s.roles.map((r) => {
                const it = assigned[r.id] ? ctl.byId(assigned[r.id]!) : null;
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => (sel ? putIn(r.id, sel.id) : it ? ctl.dispatch({ type: "unassign", by: current, roleId: r.id }) : undefined)}
                      className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${it ? "border-secondary/50 bg-primary/15" : sel ? "border-dashed border-secondary hover:bg-primary/15" : "border-dashed border-white/15"}`}>
                      <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{r.label}</div><div className="font-semibold">{it ? it.name : sel ? `Place ${sel.name} here` : "Empty"}</div></div>
                      <div className="font-display text-xl text-secondary">{it ? Math.round(P.roleFit(it, r)) : sel ? Math.round(P.roleFit(sel, r)) : ""}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button variant="accent" className="w-full" disabled={!complete} onClick={() => { ctl.dispatch({ type: "lock", by: current }); setSelected(null); setRevealed(null); play("win"); }}>
              <Lock className="h-4 w-4" aria-hidden /> Lock in lineup
            </Button>
          </section>
        </div>
      </GameFrame>
    </PageShell>
  );
}
