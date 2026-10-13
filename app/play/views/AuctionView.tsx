"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Gavel } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as A from "../../topicDraft/formats/auction";
import { itemScore, scoreTeam } from "../../topicDraft/scorer";
import { useSound } from "../../components/SoundProvider";
import { PageShell } from "../../components/ui";
import { GameFrame } from "../GameFrame";
import { useRunState } from "../useRunState";
import { toJudgeItem, type JudgeTeamInput } from "../judging";
import type { GameSetup } from "../types";
import type { Item } from "../../topicDraft/types";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

export function AuctionView({ setup, basePool, onFinish }: { setup: GameSetup; basePool: Item[]; onFinish: (t: JudgeTeamInput[]) => void }) {
  const { play } = useSound();
  const o = setup.opts;
  const pool = useMemo(
    () => [...basePool, ...o.customItems].filter((i) => !o.bans.includes(i.id) && (!o.universes.length || o.universes.includes(i.universe))),
    [basePool, o.customItems, o.bans, o.universes]
  );
  const byId = useMemo(() => new Map(pool.map((i) => [i.id, i])), [pool]);
  const humans = setup.players.filter((p) => !setup.aiPlayers.includes(p));

  const [a, setA, markFinished] = useRunState<A.AuctionState>(setup.id, () =>
    A.init({ players: setup.players, budget: o.budget, teamSize: o.teamSize, poolIds: pool.map((i) => i.id), seed: setup.seed, baseMs: o.lotSeconds * 1000, bumpMs: Math.min(8000, o.lotSeconds * 500) })
  );
  const [now, setNow] = useState(() => Date.now());
  const lotStart = useRef(Date.now());
  const lastBidAt = useRef(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (a.deadline == null && !a.done) setA((s) => A.open(s, Date.now()));
  }, [a.deadline, a.done, setA]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (a.deadline != null && now >= a.deadline) setA((s) => A.settle(s, Date.now()));
  }, [now, a.deadline, setA]);

  useEffect(() => {
    lotStart.current = Date.now();
    lastBidAt.current = Date.now();
  }, [a.index]);

  // AI bidders
  useEffect(() => {
    if (a.done) return;
    const id = setInterval(() => {
      const t = Date.now();
      if (t - lotStart.current < 1500 || t - lastBidAt.current < 900) return;
      setA((s) => {
        const itemId = A.currentItem(s);
        const item = itemId ? byId.get(itemId) : null;
        if (!item || s.deadline == null) return s;
        const bots = setup.aiPlayers.filter((p) => A.slotsLeft(s, p) > 0).sort(() => Math.random() - 0.5);
        for (const p of bots) {
          const value = (itemScore(item, setup.mission.weights) / 100) * (s.budget / s.teamSize) * 1.9 * (0.75 + 0.55 * hash(p + item.id));
          const b = A.aiBid(s, p, value);
          if (b && Math.random() < 0.6) {
            lastBidAt.current = t;
            return A.placeBid({ ...s, seed: b.seed }, p, b.amount, t);
          }
        }
        return s;
      });
    }, 500);
    return () => clearInterval(id);
  }, [a.done, byId, setup.aiPlayers, setup.mission.weights, setA]);

  const secs = a.deadline ? Math.max(0, Math.ceil((a.deadline - now) / 1000)) : 0;
  useEffect(() => {
    if (secs > 0 && secs <= 3) play("tick");
  }, [secs, play]);

  const sold = a.lastSold;
  useEffect(() => {
    if (sold) play(sold.by ? "pick" : "click");
  }, [sold, play]);

  useEffect(() => {
    if (!a.done) return;
    markFinished();
    play("reveal");
    onFinish(
      setup.players.map((player) => {
        const roster = a.rosters[player]!;
        const items = roster.map((r) => byId.get(r.itemId)!).filter(Boolean);
        return {
          player,
          baseline: scoreTeam(items, setup.mission).total,
          notes: `Spent $${A.spent(a, player)} of $${a.budget}`,
          items: roster.map((r) => toJudgeItem(byId.get(r.itemId)!, { price: r.price })),
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.done]);

  const lotId = A.currentItem(a);
  const lot = lotId ? byId.get(lotId) : null;
  const span = Math.max(a.baseMs, a.bumpMs);
  const frac = a.deadline ? Math.max(0, Math.min(1, (a.deadline - now) / span)) : 0;

  const bid = (p: string, amount: number) => {
    const v = A.validateBid(a, p, amount);
    if (!v.ok) {
      setError(v.reason);
      play("error");
      return;
    }
    setError(null);
    lastBidAt.current = Date.now();
    setA((s) => A.placeBid(s, p, amount, Date.now()));
    play("click");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  };

  return (
    <PageShell width="lg" layout="sidebar">
      <GameFrame
        kicker={`Auction · Lot ${Math.min(a.index + 1, a.queue.length)}/${a.queue.length}`}
        headline={lot ? "Bidding is open" : "Auction over"}
        mission={setup.mission}
        mystery={setup.mystery}
        right={
          <div className="text-right">
            <div className={`font-display text-4xl ${secs <= 3 ? "text-accent" : ""}`} role="timer" aria-label={`${secs} seconds left`}>{secs}s</div>
          </div>
        }
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-secondary transition-[width] duration-200" style={{ width: `${frac * 100}%`, background: secs <= 3 ? "var(--accent)" : undefined }} />
        </div>

        {lot && (
            <motion.div key={lot.id} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="space-y-4">
              <div className="mx-auto max-w-md"><HeroCard item={lot} /></div>
              <Card className="mx-auto flex max-w-md items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">High bid</p>
                  <p className="font-display text-4xl text-secondary">${a.bid.amount}</p>
                </div>
                <p className="text-right text-sm">{a.bid.by ? <><span className="text-muted-foreground">held by</span><br /><span className="font-semibold">{a.bid.by}</span></> : <span className="text-muted-foreground">No bids yet</span>}</p>
              </Card>
            </motion.div>
          )}

        {error && <p role="alert" className="mx-auto max-w-md rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">{error}</p>}

        <div className="mx-auto max-w-md space-y-3">
          {humans.map((p) => {
            const max = A.maxBid(a, p);
            const base = a.bid.amount;
            return (
              <Card key={p} className="space-y-2">
                <div className="flex items-baseline justify-between"><span className="font-semibold">{p}</span><span className="text-sm text-muted-foreground">${a.budgets[p]} left · max bid ${max}</span></div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 5].map((inc) => (
                    <Button key={inc} variant="primary" disabled={!A.validateBid(a, p, base + inc).ok} onClick={() => bid(p, base + inc)}>+${inc}</Button>
                  ))}
                  <Button variant="accent" disabled={!A.validateBid(a, p, max).ok} onClick={() => bid(p, max)}>Max</Button>
                </div>
              </Card>
            );
          })}
        </div>

        <AnimatePresence>
          {sold && (
            <motion.p key={`${sold.itemId}-${a.index}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-auto max-w-md rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center text-sm">
              <Gavel className="mr-1 inline h-4 w-4 text-accent" aria-hidden />
              {sold.by ? `${byId.get(sold.itemId)?.name} sold to ${sold.by} for $${sold.price}` : `${byId.get(sold.itemId)?.name} went unsold`}
            </motion.p>
          )}
        </AnimatePresence>
      </GameFrame>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {setup.players.map((p) => (
          <div key={p} className={`rounded-xl border p-3 ${a.bid.by === p ? "border-secondary bg-primary/15" : "border-white/10 bg-card/60"}`}>
            <div className="mb-2 flex items-center justify-between"><span className="font-semibold">{p}</span><span className="font-display text-lg text-secondary">${a.budgets[p]}</span></div>
            <ul className="space-y-1">
              {a.rosters[p]!.map((r) => (
                <li key={r.itemId} className="flex justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-sm"><span className="truncate">{byId.get(r.itemId)?.name}</span><span className="ml-2 text-accent">${r.price}</span></li>
              ))}
              {Array.from({ length: A.slotsLeft(a, p) }).map((_, i) => <li key={i} className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-sm text-muted-foreground/60">Empty slot</li>)}
            </ul>
          </div>
        ))}
      </aside>
    </PageShell>
  );
}
