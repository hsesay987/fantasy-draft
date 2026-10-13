"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, PageShell, TimerRing } from "../../components/ui";
import { PoolGrid } from "../../topicDraft/components/PoolGrid";
import { TeamPanel } from "../../topicDraft/components/TeamPanel";
import { RollRow, rollMs } from "../../topicDraft/components/RollRow";
import { currentTurn, previewAuto, type SnakeRun } from "../../topicDraft/core";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { PickBar } from "../PickBar";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

export function SnakeView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const run = ctl.state as SnakeRun;
  const draft = run.kind === "spin" ? run.spin.draft : run.draft;
  const offer = run.kind === "spin" ? run.spin.offer : null;
  const rerolls = run.kind === "spin" ? run.spin.rerolls : null;
  const player = currentTurn(setup, ctl.state);
  const ai = ctl.isAi(player);
  const mine = ctl.controls(player);

  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pickHint, setPickHint] = useState<string | null>(null); // AI's chosen card, shown before it lands
  const landedFor = useRef<string>("");
  const [landedKey, setLandedKey] = useState("");

  const roles = draft.config.roles;
  const mineSoFar = player ? draft.picks.filter((p) => p.player === player) : [];
  const freeRoles = roles.filter((r) => !mineSoFar.some((m) => m.role === r));
  const firstFree = freeRoles[0];
  const rollKey = `${draft.turn}:${offer?.join(",") ?? ""}`;
  const offerItems = useMemo(() => (offer ?? []).map((id) => ctl.byId(id)!).filter(Boolean), [offer, ctl]);
  const item = selected ? ctl.byId(selected) : null;

  useEffect(() => {
    setSelected(null);
    setRole(undefined);
    setPickHint(null);
    setError(null);
  }, [draft.turn]);
  useEffect(() => {
    if (roles.length && !role && firstFree) setRole(firstFree);
  }, [roles.length, role, firstFree]);

  // The AI "thinks": its roll spins and lands, its choice lights up, then the pick goes through.
  useEffect(() => {
    if (!ai || !player || draft.done) return;
    const rolled = !!offer;
    if (rolled && landedKey !== rollKey) return;
    const t1 = setTimeout(() => {
      const p = previewAuto(setup, ctl.state);
      if (p) setPickHint(p.itemId);
      const t2 = setTimeout(() => {
        if (p) ctl.dispatch({ type: "pick", by: player, itemId: p.itemId, role: p.role });
        else ctl.dispatch({ type: "auto", by: player });
        play("pick");
      }, rolled ? 1000 : 150);
      cleanup.push(() => clearTimeout(t2));
    }, rolled ? 450 : 900);
    const cleanup: (() => void)[] = [() => clearTimeout(t1)];
    return () => cleanup.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ai, player, draft.turn, landedKey, rollKey, draft.done]);

  const total = draft.config.players.length * draft.config.teamSize;
  const choose = (id: string) => {
    if (!mine || !player) return;
    const r = roles.length ? role : undefined;
    ctl.dispatch({ type: "pick", by: player, itemId: id, role: r });
    play("pick");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };
  const timerOn = !!draft.config.timerSeconds && !!player && mine && !ctl.online;
  void landedFor;

  return (
    <PageShell width="lg" layout="sidebar" stickyBar>
      <GameFrame
        kicker={`${offer ? (setup.format === "spin" ? "Spin Draft" : "Random Roll") : "Classic Draft"} · Pick ${Math.min(draft.picks.length + 1, total)}/${total}`}
        headline={ai || !mine ? `${player} is ${offer ? "rolling" : "picking"}…` : `${player}, you're up`}
        mission={setup.mission}
        mystery={setup.mystery}
        right={timerOn ? <TimerRing seconds={draft.config.timerSeconds!} resetKey={draft.turn} onExpire={() => player && ctl.dispatch({ type: "auto", by: player })} /> : undefined}
      >
        {error && <p role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">{error}</p>}

        {offer && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{mine ? `Pick one of these ${offer.length}` : `${player}'s roll`}</p>
              {player && mine && (
                <Button variant="ghost" disabled={(rerolls?.[player] ?? 0) <= 0} onClick={() => { ctl.dispatch({ type: "reroll", by: player }); play("click"); }}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Reroll ({rerolls?.[player] ?? 0})
                </Button>
              )}
            </div>
            <RollRow
              items={offerItems}
              shuffleFrom={ctl.pool}
              rollKey={rollKey}
              selectedId={selected}
              highlightId={pickHint}
              onAllLanded={() => setLandedKey(rollKey)}
              onSelect={mine ? (id) => setSelected(id) : undefined}
              onQuickPick={mine ? choose : undefined}
            />
          </div>
        )}

        {!offer && (
          <PoolGrid
            state={draft}
            pool={ctl.pool}
            selectedId={selected}
            highlightId={pickHint}
            disabled={!mine}
            onSelect={(id) => { setError(null); setSelected(id); }}
            onQuickPick={choose}
          />
        )}
      </GameFrame>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <TeamPanel state={draft} pool={ctl.pool} activePlayer={player} me={ctl.me} />
      </aside>

      {item && mine && (
        <PickBar label={item.name} sub={`${item.universe} · ${item.archetype}`} cta={`Draft ${item.name.split(" ")[0]}`} onConfirm={() => choose(item.id)} onCancel={() => setSelected(null)}>
          {roles.length > 0 && (
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="min-h-11 rounded-lg border border-white/10 bg-card px-2 text-sm">
              {freeRoles.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
        </PickBar>
      )}
    </PageShell>
  );
}
