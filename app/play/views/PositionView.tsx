"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, RefreshCw, Wand2 } from "lucide-react";
import { Button } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as P from "../../topicDraft/formats/position";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { useRunState } from "../useRunState";
import { toJudgeItem, type JudgeTeamInput } from "../judging";
import type { GameSetup } from "../types";
import type { Item } from "../../topicDraft/types";

export function PositionView({ setup, basePool, onFinish }: { setup: GameSetup; basePool: Item[]; onFinish: (t: JudgeTeamInput[]) => void }) {
  const { play } = useSound();
  const o = setup.opts;
  const pool = useMemo(
    () => [...basePool, ...o.customItems].filter((i) => !o.bans.includes(i.id) && (!o.universes.length || o.universes.includes(i.universe))),
    [basePool, o.customItems, o.bans, o.universes]
  );
  const byId = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  const get = (id: string) => byId.get(id);
  const humans = setup.players.filter((p) => !setup.aiPlayers.includes(p));

  const [s, setS, markFinished] = useRunState<P.PositionState>(setup.id, () =>
    P.init({ players: setup.players, roles: setup.roles, poolIds: pool.map((i) => i.id), handSize: setup.roles.length + o.handExtra, rerolls: o.rerolls, seed: setup.seed })
  );
  const current = humans.find((h) => !s.locked[h]) ?? null;
  const [revealed, setRevealed] = useState<string | null>(humans.length > 1 ? null : humans[0] ?? null);
  const [selected, setSelected] = useState<string | null>(null);

  // AI lineups are decided up front.
  useEffect(() => {
    setS((st) => {
      let n = st;
      for (const p of setup.aiPlayers) if (!n.locked[p]) n = P.lock(P.autoAssign(n, p, get), p);
      return n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!s.done) return;
    markFinished();
    play("reveal");
    onFinish(
      s.players.map((p) => {
        const assigned = Object.fromEntries(s.roles.map((r) => [r.id, get(s.assign[p]![r.id]!)]));
        const sc = P.scorePosition(s.roles, assigned);
        return {
          player: p,
          baseline: sc.total,
          notes: "Role fit: " + s.roles.map((r) => `${r.label} ${sc.perRole[r.id]}`).join(", "),
          items: s.roles.filter((r) => assigned[r.id]).map((r) => toJudgeItem(assigned[r.id]!, { role: r.label })),
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.done]);

  if (s.done) return null;

  if (current && revealed !== current) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-3xl">Pass to {current}</h1>
        <p className="mt-2 text-muted-foreground">Keep your hand hidden until it&apos;s your turn.</p>
        <Button className="mt-6" onClick={() => setRevealed(current)}>I&apos;m {current} — show my hand</Button>
      </div>
    );
  }
  if (!current) return null;

  const hand = s.hands[current]!.map(get).filter(Boolean) as Item[];
  const assigned = s.assign[current]!;
  const usedIds = new Set(Object.values(assigned));
  const sel = selected ? get(selected) : null;
  const complete = P.complete(s, current);

  const putIn = (roleId: string, id: string) => {
    setS((st) => P.assign(st, current, roleId, id));
    setSelected(null);
    play("pick");
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28">
      <GameFrame kicker="Positions" headline={`${current}: assign your lineup`} mission={setup.mission} mystery={setup.mystery}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section aria-label="Your hand" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg">Your hand <span className="text-sm text-muted-foreground">tap a card, then a role</span></h2>
              <div className="flex gap-2">
                <Button variant="ghost" disabled={s.rerolls[current]! <= 0 || Object.keys(assigned).length > 0} onClick={() => { setS((st) => P.reroll(st, current)); setSelected(null); play("click"); }}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Reroll ({s.rerolls[current]})
                </Button>
                <Button variant="ghost" onClick={() => { setS((st) => P.autoAssign(st, current, get)); setSelected(null); play("steal"); }}>
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
                const it = assigned[r.id] ? get(assigned[r.id]!) : null;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => (sel ? putIn(r.id, sel.id) : it ? setS((st) => P.unassign(st, current, r.id)) : undefined)}
                      className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${it ? "border-secondary/50 bg-primary/15" : sel ? "border-dashed border-secondary hover:bg-primary/15" : "border-dashed border-white/15"}`}
                    >
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">{r.label}</div>
                        <div className="font-semibold">{it ? it.name : sel ? `Place ${sel.name} here` : "Empty"}</div>
                      </div>
                      <div className="font-display text-xl text-secondary">{it ? Math.round(P.roleFit(it, r)) : sel ? Math.round(P.roleFit(sel, r)) : ""}</div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Button variant="accent" className="w-full" disabled={!complete} onClick={() => { setS((st) => P.lock(st, current)); setSelected(null); setRevealed(null); play("win"); }}>
              <Lock className="h-4 w-4" aria-hidden /> Lock in lineup
            </Button>
          </section>
        </div>
      </GameFrame>
    </div>
  );
}
