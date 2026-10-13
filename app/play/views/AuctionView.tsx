"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Dices, Gavel, HandMetal } from "lucide-react";
import { Button, Card, PageShell } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import { RollRow, rollMs } from "../../topicDraft/components/RollRow";
import { CharacterAvatar } from "../../components/CharacterAvatar";
import * as A from "../../topicDraft/formats/auction";
import { itemScore } from "../../topicDraft/scorer";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

const valueOf = (setup: GameSetup, a: A.AuctionState, p: string, item: { id: string; stats: Record<string, number> }) =>
  (itemScore(item as never, setup.mission.weights) / 100) * (a.budget / a.teamSize) * 1.9 * (0.75 + 0.55 * hash(p + item.id));

export function AuctionView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const a = ctl.state as A.AuctionState;
  const [now, setNow] = useState(() => Date.now() + ctl.offset);
  const [error, setError] = useState<string | null>(null);
  const lastAct = useRef(0);
  const lotStart = useRef(Date.now());

  const humans = setup.players.filter((p) => ctl.controls(p));
  const aiPlayers = setup.players.filter((p) => ctl.isAi(p));

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + ctl.offset), 200);
    return () => clearInterval(id);
  }, [ctl.offset]);

  // Local games run the clock here; online rooms are ticked by the server.
  useEffect(() => {
    if (!ctl.online && a.deadline != null && now >= a.deadline) ctl.dispatch({ type: "tick" });
  }, [now, a.deadline, ctl]);

  useEffect(() => {
    lotStart.current = Date.now();
    lastAct.current = Date.now();
  }, [a.index, a.openTurn]);

  // Bots: open on their turn, raise while the price is right, otherwise step aside.
  useEffect(() => {
    if (ctl.online || a.done || !aiPlayers.length) return;
    const id = setInterval(() => {
      const t = Date.now();
      if (t - lotStart.current < 1400 || t - lastAct.current < 1000) return;
      const itemId = A.currentItem(a);
      const item = itemId ? ctl.byId(itemId) : null;
      if (!item) return;
      for (const p of [...aiPlayers].sort(() => Math.random() - 0.5)) {
        const value = valueOf(setup, a, p, item);
        const m = A.aiAct(a, p, value);
        if (!m) continue;
        lastAct.current = t;
        ctl.dispatch(m.type === "bid" ? { type: "bid", by: p, amount: m.amount, seed: m.seed } : { type: "pass", by: p });
        return;
      }
    }, 450);
    return () => clearInterval(id);
  }, [a, ctl, aiPlayers, setup.mission.weights]);

  // Random-roll mode: the nominator picks which rolled lot goes up. AI shows its roll, lights up its pick, then nominates.
  const nom = A.nominator(a);
  const offer = a.nominate?.offer ?? null;
  const [landed, setLanded] = useState("");
  const offerKey = `${a.index}-${offer?.join(",") ?? ""}`;
  const [aiPick, setAiPick] = useState<string | null>(null);
  useEffect(() => {
    setAiPick(null);
  }, [offerKey]);
  useEffect(() => {
    if (ctl.online || !offer || !nom || !ctl.isAi(nom) || landed !== offerKey) return;
    const t1 = setTimeout(() => {
      const pick = A.aiNominate(a, nom, (id) => (ctl.byId(id) ? valueOf(setup, a, nom, ctl.byId(id)!) : 0));
      if (pick) setAiPick(pick);
      const t2 = setTimeout(() => pick && ctl.dispatch({ type: "nominate", by: nom, itemId: pick }), 1000);
      cleanup.push(() => clearTimeout(t2));
    }, 450);
    const cleanup: (() => void)[] = [() => clearTimeout(t1)];
    return () => cleanup.forEach((f) => f());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landed, offerKey]);

  const secs = a.deadline ? Math.max(0, Math.ceil((a.deadline - now) / 1000)) : 0;
  useEffect(() => {
    if (secs > 0 && secs <= 3) play("tick");
  }, [secs, play]);
  const sold = a.lastSold;
  useEffect(() => {
    if (sold) play(sold.by ? "pick" : "click");
  }, [sold, play]);

  const lotId = A.currentItem(a);
  const lot = lotId ? ctl.byId(lotId) : null;
  const span = a.bid.by ? Math.max(a.baseMs, a.bumpMs) : a.openMs;
  const frac = a.deadline ? Math.max(0, Math.min(1, (a.deadline - now) / span)) : 0;
  const opening = A.opener(a);

  const bid = (p: string, amount: number) => {
    const v = A.validateBid(a, p, amount);
    if (!v.ok) {
      setError(v.reason);
      play("error");
      return;
    }
    setError(null);
    lastAct.current = Date.now();
    ctl.dispatch({ type: "bid", by: p, amount });
    play("click");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
  };
  const out = (p: string) => {
    lastAct.current = Date.now();
    ctl.dispatch({ type: "pass", by: p });
    play("click");
  };

  const headline = offer ? (nom && ctl.controls(nom) ? "Your turn to nominate a lot" : `${nom} nominates a lot`) : !lot ? "Auction over" : a.bid.by ? `${a.bid.by} leads at $${a.bid.amount}` : opening ? `${opening} opens the bidding` : "Bidding is open";

  return (
    <PageShell width="lg" layout="sidebar">
      <GameFrame
        kicker={`Auction · Lot ${Math.min(a.index + 1, a.queue.length)}/${a.queue.length}`}
        headline={headline}
        mission={setup.mission}
        mystery={setup.mystery}
        right={<div className={`font-display text-4xl ${secs <= 3 ? "text-accent" : ""}`} role="timer" aria-label={`${secs} seconds left`}>{secs}s</div>}
      >
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden>
          <div className="h-full rounded-full bg-secondary transition-[width] duration-200" style={{ width: `${frac * 100}%`, background: secs <= 3 ? "var(--accent)" : undefined }} />
        </div>

        {offer && nom && (
          <div className="space-y-3 rounded-2xl border border-secondary/40 bg-primary/10 p-4">
            <p className="flex items-center gap-2 text-sm"><Dices className="h-4 w-4 text-secondary" aria-hidden /> {ctl.controls(nom) ? "Your roll — pick the lot that goes up for bid" : `${nom} rolled ${offer.length} lots`}</p>
            <RollRow
              items={offer.map((id) => ctl.byId(id)!).filter(Boolean)}
              shuffleFrom={ctl.pool}
              rollKey={offerKey}
              highlightId={aiPick}
              onAllLanded={() => setLanded(offerKey)}
              onSelect={ctl.controls(nom) ? (id) => { ctl.dispatch({ type: "nominate", by: nom, itemId: id }); play("pick"); } : undefined}
              onQuickPick={ctl.controls(nom) ? (id) => { ctl.dispatch({ type: "nominate", by: nom, itemId: id }); play("pick"); } : undefined}
            />
          </div>
        )}

        {lot && (
          <motion.div key={lot.id} initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 26 }} className="mx-auto max-w-md space-y-4">
            <div className="flex justify-center"><CharacterAvatar name={lot.name} query={lot.q} size={140} className="!rounded-3xl shadow-[0_0_40px_-10px_var(--primary)]" /></div>
            <HeroCard item={lot} compact />
            <Card className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">High bid</p>
                <p className="font-display text-4xl text-secondary">${a.bid.amount}</p>
              </div>
              <p className="text-right text-sm">{a.bid.by ? <><span className="text-muted-foreground">held by</span><br /><span className="font-semibold">{a.bid.by}</span></> : <span className="text-muted-foreground">Opening turn:<br /><span className="font-semibold text-foreground">{opening ?? "—"}</span></span>}</p>
            </Card>
          </motion.div>
        )}

        {error && <p role="alert" className="mx-auto max-w-md rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">{error}</p>}

        <div className="mx-auto max-w-md space-y-3">
          {humans.map((p) => {
            const max = A.maxBid(a, p);
            const leading = a.bid.by === p;
            const opens = a.bid.by == null && opening === p;
            const choosing = !!offer;
            const waiting = a.bid.by == null && opening !== p;
            const base = a.bid.amount;
            const incs = a.bid.by == null ? [1, 2, 3] : [1, 2, 5];
            const full = A.slotsLeft(a, p) <= 0;
            return (
              <Card key={p} className="space-y-3">
                <div className="flex items-baseline justify-between"><span className="font-semibold">{p}{ctl.me === p ? " (you)" : ""}</span><span className="text-sm text-muted-foreground">${a.budgets[p]} left · max ${max}</span></div>
                {full ? <p className="text-sm text-muted-foreground">Your team is full.</p>
                : leading ? <p className="text-sm text-secondary">You&apos;re winning this lot — others can still bid or step aside.</p>
                : a.passed[p] ? <p className="text-sm text-muted-foreground">You&apos;re out on this lot.</p>
                : choosing ? <p className="text-sm text-muted-foreground">Waiting for the nomination…</p>
                : waiting ? <p className="text-sm text-muted-foreground">Waiting for {opening} to open…</p>
                : (
                  <>
                    <div className="grid grid-cols-4 gap-2">
                      {incs.map((inc) => <Button key={inc} variant="primary" disabled={!A.validateBid(a, p, base + inc).ok} onClick={() => bid(p, base + inc)}>{opens ? `$${base + inc}` : `+$${inc}`}</Button>)}
                      <Button variant="accent" disabled={!A.validateBid(a, p, max).ok} onClick={() => bid(p, max)}>Max</Button>
                    </div>
                    <Button variant="ghost" className="w-full" onClick={() => out(p)}>
                      <HandMetal className="h-4 w-4" aria-hidden /> {opens ? "Pass — let the next player open" : "I'm out — let them have it"}
                    </Button>
                  </>
                )}
              </Card>
            );
          })}
          {!humans.length && ctl.online && <p className="text-center text-sm text-muted-foreground">Spectating…</p>}
        </div>

        <AnimatePresence>
          {sold && (
            <motion.div key={`${sold.itemId}-${a.index}`} initial={{ opacity: 0, scale: 2.2, rotate: -14 }} animate={{ opacity: 1, scale: 1, rotate: -6 }} exit={{ opacity: 0, y: 10 }} transition={{ type: "spring", stiffness: 320, damping: 16 }} className="mx-auto max-w-md rounded-2xl border-4 border-double px-4 py-3 text-center" style={{ borderColor: sold.by ? "var(--accent)" : "var(--muted-foreground)" }}>
              <p className="font-display text-3xl" style={{ color: sold.by ? "var(--accent)" : "var(--muted-foreground)" }}><Gavel className="mr-2 inline h-6 w-6" aria-hidden />{sold.by ? "SOLD!" : "NO SALE"}</p>
              <p className="text-sm text-muted-foreground">{sold.by ? `${ctl.byId(sold.itemId)?.name} → ${sold.by} for $${sold.price}` : `${ctl.byId(sold.itemId)?.name} went unsold`}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </GameFrame>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {setup.players.map((p) => (
          <div key={p} className={`rounded-xl border p-3 ${a.bid.by === p ? "border-secondary bg-primary/15" : "border-white/10 bg-card/60"}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{p}{a.passed[p] && <span className="ml-2 text-xs text-muted-foreground">out</span>}{a.bid.by == null && opening === p && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-black">OPENS</span>}</span>
              <span className="font-display text-lg text-secondary">${a.budgets[p]}</span>
            </div>
            <ul className="space-y-1">
              {a.rosters[p]!.map((r) => (
                <li key={r.itemId} className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><CharacterAvatar name={ctl.byId(r.itemId)?.name ?? "?"} query={ctl.byId(r.itemId)?.q} size={24} className="!rounded-md" /><span className="truncate">{ctl.byId(r.itemId)?.name}</span></span>
                  <span className="ml-2 text-accent">${r.price}</span>
                </li>
              ))}
              {Array.from({ length: A.slotsLeft(a, p) }).map((_, i) => <li key={i} className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-sm text-muted-foreground/60">Empty slot</li>)}
            </ul>
          </div>
        ))}
      </aside>
    </PageShell>
  );
}
