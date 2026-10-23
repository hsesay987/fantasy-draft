"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dices, Lock, RefreshCw, Wand2 } from "lucide-react";
import { Button, PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import { RollRow, rollMs } from "../../topicDraft/components/RollRow";
import { AiQuip } from "../../components/AiQuip";
import * as P from "../../topicDraft/formats/position";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import type { Item } from "../../topicDraft/types";

export function PositionView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as P.PositionState;
  const rolled = !!s.roll;
  const humans = setup.players.filter((p) => ctl.controls(p));
  const aiNames = setup.players.filter((p) => ctl.isAi(p));
  const current = humans.find((h) => !s.locked[h]) ?? null;
  const [revealed, setRevealed] = useState<string | null>(humans.length > 1 && !ctl.online ? null : humans[0] ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [roleId, setRoleId] = useState<string | null>(null);

  const stateRef = useRef(s);
  stateRef.current = s;

  // Dealt-hand mode: AI lineups are decided up front. Roll mode: the AI rolls and picks role by role, in view.
  useEffect(() => {
    if (ctl.online || rolled) return;
    for (const p of aiNames.filter((x) => !s.locked[x])) {
      ctl.dispatch({ type: "autoAssign", by: p });
      ctl.dispatch({ type: "lock", by: p });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [aiView, setAiView] = useState<{ who: string; role: string; choice: string | null } | null>(null);
  const phase = useRef<Record<string, { role: string; at: number; choice?: string; choseAt?: number }>>({});
  useEffect(() => {
    if (ctl.online || !rolled || !aiNames.length) return;
    const id = setInterval(() => {
      const st = stateRef.current;
      if (st.done) return;
      const now = Date.now();
      for (const p of aiNames) {
        if (st.locked[p]) continue;
        const open = st.roles.find((r) => !st.assign[p]![r.id]);
        if (!open) {
          ctl.dispatch({ type: "lock", by: p });
          continue;
        }
        const ph = phase.current[p];
        const offer = st.roll!.offers[p]![open.id];
        if (!offer || !ph || ph.role !== open.id) {
          ctl.dispatch({ type: "rollFor", by: p, slotId: open.id });
          phase.current[p] = { role: open.id, at: now };
          setAiView({ who: p, role: open.label, choice: null });
        } else if (!ph.choice && now - ph.at > rollMs(offer.length) + 500) {
          const best = offer.map((i) => ctl.byId(i)).filter((x): x is Item => !!x && !Object.values(st.assign).some((a) => Object.values(a).includes(x.id))).sort((a, b) => P.roleFit(b, open) - P.roleFit(a, open))[0];
          if (best) {
            ph.choice = best.id;
            ph.choseAt = now;
            setAiView({ who: p, role: open.label, choice: best.id });
          }
        } else if (ph.choice && now - (ph.choseAt ?? now) > 900) {
          ctl.dispatch({ type: "assign", by: p, roleId: open.id, itemId: ph.choice });
          delete phase.current[p];
          play("pick");
        }
        break; // one AI action per tick keeps it readable
      }
    }, 350);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolled, ctl.online]);

  const assigned = current ? s.assign[current]! : {};
  const activeRole = useMemo(() => {
    if (!rolled || !current) return null;
    if (roleId && !assigned[roleId]) return roleId;
    return s.roles.find((r) => !assigned[r.id])?.id ?? null;
  }, [rolled, current, roleId, assigned, s.roles]);

  // Roll mode: opening a role rolls its options.
  useEffect(() => {
    if (rolled && current && activeRole && !s.roll!.offers[current]?.[activeRole]) ctl.dispatch({ type: "rollFor", by: current, slotId: activeRole });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolled, current, activeRole, s.roll?.offers]);

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
        <p className="mt-2 text-muted-foreground">Keep your {rolled ? "rolls" : "hand"} hidden until it&apos;s your turn.</p>
        <Button className="mt-6" onClick={() => setRevealed(current)}>I&apos;m {current} — show {rolled ? "my roles" : "my hand"}</Button>
      </PageShell>
    );
  }

  const hand = s.hands[current]!.map((id) => ctl.byId(id)).filter(Boolean) as Item[];
  const usedIds = new Set(Object.values(assigned));
  const sel = selected ? ctl.byId(selected) : null;
  const complete = P.complete(s, current);
  const offerIds = rolled && activeRole ? s.roll!.offers[current]?.[activeRole] ?? [] : [];
  const offerItems = offerIds.map((id) => ctl.byId(id)).filter((x): x is Item => !!x);
  const activeDef = s.roles.find((r) => r.id === activeRole);

  const putIn = (rid: string, id: string) => {
    ctl.dispatch({ type: "assign", by: current, roleId: rid, itemId: id });
    setSelected(null);
    setRoleId(null);
    play("pick");
  };

  return (
    <PageShell width="lg">
      <GameFrame kicker={rolled ? "Positions · Random roll" : "Positions"} headline={`${current}: assign your lineup`} mission={setup.mission} mystery={setup.mystery}>
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section aria-label={rolled ? "Rolled options" : "Your hand"} className="space-y-3">
            {rolled ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-lg"><Dices className="h-5 w-5 text-secondary" aria-hidden /> {activeDef ? `Roll for ${activeDef.label}` : "All roles filled"}</h2>
                  <div className="flex gap-2">
                    {activeRole && <Button variant="ghost" disabled={(s.roll!.rerolls[current] ?? 0) <= 0} onClick={() => { ctl.dispatch({ type: "rerollSlot", by: current, slotId: activeRole }); setSelected(null); play("click"); }}><RefreshCw className="h-4 w-4" aria-hidden /> Respin ({s.roll!.rerolls[current] ?? 0})</Button>}
                    <Button variant="ghost" onClick={() => { ctl.dispatch({ type: "autoAssign", by: current }); setSelected(null); play("steal"); }}><Wand2 className="h-4 w-4" aria-hidden /> Auto-fill</Button>
                  </div>
                </div>
                {offerItems.length > 0 && activeRole && (
                  <RollRow items={offerItems} shuffleFrom={ctl.pool} rollKey={`${current}-${activeRole}-${offerIds.join(",")}`} selectedId={selected} onSelect={(id) => setSelected(selected === id ? null : id)} onQuickPick={(id) => putIn(activeRole, id)} />
                )}
                {sel && activeRole && <Button variant="accent" className="w-full" onClick={() => putIn(activeRole, sel.id)}>Take {sel.name} as {activeDef?.label}</Button>}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg">Your hand <span className="text-sm text-muted-foreground">tap a card, then a role</span></h2>
                  <div className="flex gap-2">
                    <Button variant="ghost" disabled={s.rerolls[current]! <= 0 || Object.keys(assigned).length > 0} onClick={() => { ctl.dispatch({ type: "reroll", by: current }); setSelected(null); play("click"); }}>
                      <RefreshCw className="h-4 w-4" aria-hidden /> Respin ({s.rerolls[current]})
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
              </>
            )}
          </section>

          <section aria-label="Roles" className="space-y-3">
            <h2 className="text-lg">Roles</h2>
            <ul className="space-y-2">
              {s.roles.map((r) => {
                const it = assigned[r.id] ? ctl.byId(assigned[r.id]!) : null;
                const isActive = rolled && activeRole === r.id;
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => (rolled ? (it ? ctl.dispatch({ type: "unassign", by: current, roleId: r.id }) : (setRoleId(r.id), setSelected(null))) : sel ? putIn(r.id, sel.id) : it ? ctl.dispatch({ type: "unassign", by: current, roleId: r.id }) : undefined)}
                      className={`flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${it ? "border-secondary/50 bg-primary/15" : isActive ? "border-secondary bg-primary/20" : sel ? "border-dashed border-secondary hover:bg-primary/15" : "border-dashed border-white/15"}`}>
                      <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{r.label}</div><div className="font-semibold">{it ? it.name : rolled ? (isActive ? "Rolling…" : "Tap to roll") : sel ? `Place ${sel.name} here` : "Empty"}</div></div>
                      <div className="font-display text-xl text-secondary">{it ? Math.round(P.roleFit(it, r)) : !rolled && sel ? Math.round(P.roleFit(sel, r)) : ""}</div>
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

        {rolled && aiView && !s.locked[aiView.who] && (() => {
          const offer = (s.roll!.offers[aiView.who] ?? {})[s.roles.find((r) => r.label === aiView.role)?.id ?? ""] ?? [];
          const items = offer.map((id) => ctl.byId(id)).filter((x): x is Item => !!x);
          return items.length ? (
            <div className="space-y-3 rounded-2xl border border-secondary/40 bg-primary/10 p-4">
              <AiQuip who={aiView.who} seed={items.length + aiView.role.length} />
              <p className="flex items-center gap-2 text-sm"><Dices className="h-4 w-4 text-secondary" aria-hidden /> {aiView.who} rolls for {aiView.role}</p>
              <RollRow items={items} shuffleFrom={ctl.pool} rollKey={`ai-${aiView.who}-${aiView.role}-${offer.join(",")}`} highlightId={aiView.choice} />
            </div>
          ) : null;
        })()}
      </GameFrame>
    </PageShell>
  );
}
