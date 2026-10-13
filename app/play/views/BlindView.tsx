"use client";

import { useEffect, useMemo } from "react";
import { Check } from "lucide-react";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as B from "../../topicDraft/formats/blind";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { useRunState } from "../useRunState";
import { toJudgeItem, type JudgeTeamInput } from "../judging";
import type { GameSetup } from "../types";
import type { Item } from "../../topicDraft/types";

export function BlindView({ setup, basePool, onFinish }: { setup: GameSetup; basePool: Item[]; onFinish: (t: JudgeTeamInput[], extra?: React.ReactNode) => void }) {
  const { play } = useSound();
  const o = setup.opts;
  const pool = useMemo(
    () => [...basePool, ...o.customItems].filter((i) => !o.bans.includes(i.id) && (!o.universes.length || o.universes.includes(i.universe))),
    [basePool, o.customItems, o.bans, o.universes]
  );
  const byId = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  const [s, setS, markFinished] = useRunState<B.BlindState>(setup.id, () =>
    B.init({ players: setup.players, poolIds: pool.map((i) => i.id), size: o.rankSize, weights: setup.mission.weights, seed: setup.seed })
  );

  const player = s.done ? null : B.turnPlayer(s);
  const isAi = !!player && setup.aiPlayers.includes(player);
  const itemId = B.currentItemId(s);
  const item = itemId ? byId.get(itemId) : null;

  useEffect(() => {
    if (!isAi || !item || s.done) return;
    const t = setTimeout(() => {
      setS((x) => {
        const { rank, seed } = B.aiPlace(x, item);
        return { ...B.place(x, rank), seed };
      });
      play("click");
    }, 800);
    return () => clearTimeout(t);
  }, [isAi, s.turn, item, s.done, setS, play]);

  useEffect(() => {
    if (!s.done) return;
    markFinished();
    play("reveal");
    const truth = B.trueOrder(s.queue.map((id) => byId.get(id)!), s.weights);
    onFinish(
      s.players.map((p) => {
        const order = s.ranks[p]!;
        const acc = B.accuracy(order, truth);
        return {
          player: p,
          baseline: acc,
          notes: `Ranking accuracy ${acc}% vs the true order`,
          items: order.map((id, i) => toJudgeItem(byId.get(id!)!, { role: `Rank ${i + 1}` })),
        };
      }),
      <div className="rounded-2xl border border-white/10 bg-card/70 p-4">
        <h3 className="mb-2 text-lg">The true order</h3>
        <ol className="grid gap-1 sm:grid-cols-2">
          {truth.map((id, i) => (<li key={id} className="rounded-lg bg-white/5 px-3 py-1.5 text-sm"><span className="mr-2 text-secondary">#{i + 1}</span>{byId.get(id)?.name}</li>))}
        </ol>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.done]);

  if (s.done || !player || !item) return null;
  const row = s.ranks[player]!;
  const place = (rank: number) => {
    if (isAi || row[rank] != null) return;
    setS((x) => B.place(x, rank));
    play("pick");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 pb-24">
      <GameFrame kicker={`Blind Rank · Reveal ${B.revealIndex(s) + 1}/${s.size}`} headline={isAi ? `${player} is ranking…` : `${player}: where does it go?`} mission={setup.mission} mystery={setup.mystery}>
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Next up — no take-backs</p>
            <HeroCard key={item.id} item={item} />
          </div>
          <ol className="space-y-2" aria-label="Your ranking">
            {row.map((id, i) => {
              const placed = id ? byId.get(id) : null;
              return (
                <li key={i}>
                  <button type="button" disabled={!!placed || isAi} onClick={() => place(i)}
                    className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-2 text-left transition-colors ${placed ? "border-secondary/40 bg-primary/15" : "border-dashed border-white/15 hover:border-secondary hover:bg-primary/10"}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10 font-display">{i + 1}</span>
                    <span className="font-semibold">{placed ? placed.name : "Place here"}</span>
                    {placed && <Check className="ml-auto h-4 w-4 text-success" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      </GameFrame>
    </div>
  );
}
