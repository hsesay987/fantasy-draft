"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, TimerRing } from "../../components/ui";
import { PoolGrid } from "../../topicDraft/components/PoolGrid";
import { TeamPanel } from "../../topicDraft/components/TeamPanel";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import { scoreTeam } from "../../topicDraft/scorer";
import { GameFrame } from "../GameFrame";
import { PickBar } from "../PickBar";
import { useSnakeLike } from "../useSnakeLike";
import { toJudgeItem, type JudgeTeamInput } from "../judging";
import type { GameSetup } from "../types";
import type { Item } from "../../topicDraft/types";

export function SnakeView({ setup, basePool, onFinish }: { setup: GameSetup; basePool: Item[]; onFinish: (t: JudgeTeamInput[]) => void }) {
  const g = useSnakeLike(setup, basePool);
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState<string | undefined>();

  const roles = g.draft.config.roles;
  const mine = g.player ? g.draft.picks.filter((p) => p.player === g.player) : [];
  const freeRoles = roles.filter((r) => !mine.some((m) => m.role === r));
  const firstFree = freeRoles[0];
  const item = selected ? g.pool.find((i) => i.id === selected) : null;

  useEffect(() => {
    setSelected(null);
    setRole(undefined);
  }, [g.draft.turn]);
  useEffect(() => {
    if (roles.length && !role && firstFree) setRole(firstFree);
  }, [roles.length, role, firstFree]);

  useEffect(() => {
    if (!g.draft.done) return;
    const byId = new Map(g.pool.map((i) => [i.id, i]));
    onFinish(
      g.draft.config.players.map((player) => {
        const picks = g.draft.picks.filter((p) => p.player === player);
        const items = picks.map((p) => byId.get(p.itemId)!).filter(Boolean);
        return { player, baseline: scoreTeam(items, setup.mission).total, items: picks.map((p) => toJudgeItem(byId.get(p.itemId)!, { role: p.role })) };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.draft.done]);

  const total = g.draft.config.players.length * g.draft.config.teamSize;
  const confirm = () => item && g.choose(item.id, role);

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 pb-32 lg:grid-cols-[1fr_320px]">
      <GameFrame
        kicker={`${setup.format === "spin" ? "Spin Draft" : "Classic Draft"} · Pick ${Math.min(g.draft.picks.length + 1, total)}/${total}`}
        headline={g.isAi ? `${g.player} is picking…` : `${g.player}, you're up`}
        mission={setup.mission}
        mystery={setup.mystery}
        right={g.draft.config.timerSeconds && !g.isAi && g.player ? <TimerRing seconds={g.draft.config.timerSeconds} resetKey={g.draft.turn} onExpire={g.auto} /> : undefined}
      >
        {g.error && <p role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-rose-100">{g.error}</p>}

        {g.offer && !g.draft.done && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Pick one of these {g.offer.length}</p>
              {g.player && (
                <Button variant="ghost" disabled={g.isAi || (g.rerolls?.[g.player] ?? 0) <= 0} onClick={g.reroll}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Reroll ({g.rerolls?.[g.player] ?? 0})
                </Button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.offer.map((id) => {
                const it = g.pool.find((i) => i.id === id)!;
                return <HeroCard key={id} item={it} selected={selected === id} onClick={() => !g.isAi && setSelected(id)} onDoubleClick={() => !g.isAi && g.choose(id, role)} />;
              })}
            </div>
          </div>
        )}

        {!g.offer && (
          <PoolGrid
            state={g.draft}
            selectedId={selected}
            disabled={g.isAi}
            onSelect={(id) => {
              g.setError(null);
              setSelected(id);
            }}
            onQuickPick={(id) => g.choose(id, role)}
          />
        )}
      </GameFrame>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <TeamPanel state={g.draft} pool={g.pool} activePlayer={g.player} />
      </aside>

      {item && !g.isAi && (
        <PickBar label={item.name} sub={`${item.universe} · ${item.archetype}`} cta={`Draft ${item.name.split(" ")[0]}`} onConfirm={confirm} onCancel={() => setSelected(null)}>
          {roles.length > 0 && (
            <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} className="min-h-11 rounded-lg border border-white/10 bg-card px-2 text-sm">
              {freeRoles.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
        </PickBar>
      )}
    </div>
  );
}
