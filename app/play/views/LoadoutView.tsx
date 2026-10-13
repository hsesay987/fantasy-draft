"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, Search, Dices } from "lucide-react";
import { Button, Chip, TimerRing } from "../../components/ui";
import { HeroCard } from "../../topicDraft/components/HeroCard";
import * as L from "../../topicDraft/formats/loadout";
import { useSound } from "../../components/SoundProvider";
import { PageShell } from "../../components/ui";
import { GameFrame } from "../GameFrame";
import { PickBar } from "../PickBar";
import { useRunState } from "../useRunState";
import { toJudgeItem, type JudgeTeamInput } from "../judging";
import type { GameSetup } from "../types";

export function LoadoutView({ setup, onFinish }: { setup: GameSetup; onFinish: (t: JudgeTeamInput[]) => void }) {
  const { play } = useSound();
  const mission = setup.loadout!;
  const [s, setS, markFinished] = useRunState<L.LoadoutState>(setup.id, () => L.init(mission, setup.players, setup.opts.order, setup.opts.roll ? { n: setup.opts.options, rerolls: setup.opts.rerolls, seed: setup.seed } : undefined));
  const [slotId, setSlotId] = useState<string>(mission.slots[0]!.id);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"price" | "quality">("quality");
  const [error, setError] = useState<string | null>(null);

  const player = s.done ? null : L.turnPlayer(s);
  const isAi = !!player && setup.aiPlayers.includes(player);
  const open = player ? L.openSlots(s, player) : [];
  const slot = mission.slots.find((x) => x.id === slotId)!;
  const taken = useMemo(() => L.takenItems(s), [s]);

  useEffect(() => {
    setSelected(null);
    if (player) {
      const first = L.openSlots(s, player)[0];
      if (first) setSlotId(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.turn]);

  useEffect(() => {
    if (s.roll && player && !isAi && !s.done) setS((x) => L.rollFor(x, slotId));
  }, [s.roll, s.turn, slotId, player, isAi, s.done, setS]);

  useEffect(() => {
    if (!isAi || s.done) return;
    const t = setTimeout(() => {
      setS((x) => L.autoPick(x));
      play("pick");
    }, 900);
    return () => clearTimeout(t);
  }, [isAi, s.turn, s.done, setS, play]);

  useEffect(() => {
    if (!s.done) return;
    markFinished();
    play("reveal");
    onFinish(
      s.players.map((p) => {
        const filled = mission.slots.map((sl) => ({ slot: sl, item: L.itemFor(s, p, sl.id)! })).filter((x) => x.item);
        const sc = L.scoreLoadout(mission, filled);
        return {
          player: p,
          baseline: sc.total,
          notes: `Covered ${sc.covered.length}/${mission.boss.weaknesses.length} of ${mission.boss.name}'s weaknesses (${sc.covered.join(", ") || "none"}). Spent $${s.spent[p]} of $${mission.budget}.`,
          items: filled.map(({ slot: sl, item }) => toJudgeItem(item, { role: sl.label, price: L.priceOf(item, sl.priceStat) })),
        };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.done]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    const offered = s.roll?.offers[slotId];
    return L.poolItems(slot.pool)
      .filter((i) => !s.roll || (offered ? offered.includes(i.id) : false))
      .filter((i) => !t || i.name.toLowerCase().includes(t) || i.tags.some((x) => x.includes(t)))
      .sort((a, b) =>
        sort === "price"
          ? L.priceOf(a, slot.priceStat) - L.priceOf(b, slot.priceStat)
          : L.priceOf(b, slot.priceStat) - L.priceOf(a, slot.priceStat)
      );
  }, [slot, q, sort, s.roll, slotId]);

  const mine = player ? s.picks[player]! : {};
  const myTags = new Set(Object.entries(mine).flatMap(([sid, id]) => (L.poolItems(mission.slots.find((x) => x.id === sid)!.pool).find((i) => i.id === id)?.tags ?? [])));
  const selItem = selected ? L.poolItems(slot.pool).find((i) => i.id === selected) : null;
  const selPrice = selItem ? L.priceOf(selItem, slot.priceStat) : 0;

  const buy = (id: string) => {
    const v = L.validate(s, slot.id, id);
    if (!v.ok) {
      setError(v.reason);
      play("error");
      return;
    }
    setError(null);
    setS((x) => L.pick(x, slot.id, id));
    play("pick");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(10);
  };

  const left = player ? mission.budget - s.spent[player]! : 0;
  const total = s.players.length * mission.slots.length;

  return (
    <PageShell width="lg" layout="sidebar" stickyBar>
      <GameFrame
        kicker={`Loadout · Pick ${Math.min(s.turn + 1, total)}/${total}`}
        headline={isAi ? `${player} is shopping…` : `${player}: build your kit`}
        mission={mission}
        mystery={setup.mystery}
        right={setup.opts.timerSeconds && player && !isAi ? <TimerRing seconds={setup.opts.timerSeconds} resetKey={s.turn} onExpire={() => setS((x) => L.autoPick(x))} /> : undefined}
      >
        <div className="rounded-2xl border border-white/10 bg-card/70 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-accent" aria-hidden /><span className="font-semibold">{setup.mystery ? "Mystery opponent" : mission.boss.name}</span><span className="text-sm text-muted-foreground">{setup.mystery ? "" : mission.boss.blurb}</span></div>
            <div className="text-right"><span className="font-display text-2xl text-secondary">${left}</span><span className="text-sm text-muted-foreground"> of ${mission.budget}</span></div>
          </div>
          {!setup.mystery && (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Boss weaknesses">
              {mission.boss.weaknesses.map((w) => (
                <Chip key={w} selected={myTags.has(w)}>{myTags.has(w) ? "✓ " : ""}{w}</Chip>
              ))}
            </div>
          )}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" aria-hidden>
            <div className="h-full rounded-full bg-secondary transition-[width]" style={{ width: `${((player ? s.spent[player]! : 0) / mission.budget) * 100}%` }} />
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Slots">
          {mission.slots.map((sl) => {
            const it = player ? L.itemFor(s, player, sl.id) : undefined;
            const active = sl.id === slotId;
            return (
              <button key={sl.id} role="tab" aria-selected={active} disabled={!!it || isAi} onClick={() => { setSlotId(sl.id); setSelected(null); }}
                className={`min-w-32 shrink-0 rounded-xl border px-3 py-2 text-left transition-colors ${active ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5"} ${it ? "opacity-70" : ""}`}>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">{sl.label}</div>
                <div className="truncate text-sm font-semibold">{it ? it.name : "Choose…"}</div>
              </button>
            );
          })}
        </div>

        {error && <p role="alert" className="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm">{error}</p>}

        {s.roll && player && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-secondary/40 bg-primary/10 px-4 py-2">
            <span className="flex items-center gap-2 text-sm"><Dices className="h-4 w-4 text-secondary" aria-hidden /> Random roll — pick from {s.roll.n}</span>
            <Button variant="ghost" disabled={isAi || (s.roll.rerolls[player] ?? 0) <= 0} onClick={() => { setS((x) => L.rerollSlot(x, slotId)); setSelected(null); play("click"); }}>
              Reroll ({s.roll.rerolls[player] ?? 0})
            </Button>
          </div>
        )}
        <div className={`flex flex-col gap-2 sm:flex-row ${s.roll ? "hidden" : ""}`}>
          <label className="relative flex-1"><span className="sr-only">Search</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${slot.label.toLowerCase()}s`} className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 outline-none focus:border-secondary" /></label>
          <div className="flex gap-2"><Chip selected={sort === "quality"} onClick={() => setSort("quality")}>Priciest</Chip><Chip selected={sort === "price"} onClick={() => setSort("price")}>Cheapest</Chip></div>
        </div>

        <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${isAi ? "pointer-events-none opacity-60" : ""}`}>
          {items.map((i) => {
            const price = L.priceOf(i, slot.priceStat);
            const ok = player ? L.validate(s, slot.id, i.id).ok : false;
            return <HeroCard key={i.id} item={i} price={price} selected={selected === i.id} taken={taken.has(i.id)} banned={!ok && !taken.has(i.id)} onClick={() => { setError(null); setSelected(i.id); }} onDoubleClick={() => buy(i.id)} />;
          })}
        </div>
      </GameFrame>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        {s.players.map((p) => (
          <div key={p} className={`rounded-xl border p-3 ${p === player ? "border-secondary bg-primary/15" : "border-white/10 bg-card/60"}`}>
            <div className="mb-2 flex items-center justify-between"><span className="font-semibold">{p}</span><span className="font-display text-lg text-secondary">${mission.budget - s.spent[p]!}</span></div>
            <ul className="space-y-1">
              {mission.slots.map((sl) => {
                const it = L.itemFor(s, p, sl.id);
                return <li key={sl.id} className={`flex justify-between rounded-lg px-2.5 py-1.5 text-sm ${it ? "bg-white/5" : "border border-dashed border-white/10 text-muted-foreground/60"}`}><span className="truncate">{it ? it.name : sl.label}</span>{it && <span className="ml-2 text-accent">${L.priceOf(it, sl.priceStat)}</span>}</li>;
              })}
            </ul>
          </div>
        ))}
      </aside>

      {selItem && !isAi && (
        <PickBar label={selItem.name} sub={`${slot.label} · $${selPrice}`} cta={`Buy $${selPrice}`} onConfirm={() => buy(selItem.id)} onCancel={() => setSelected(null)} />
      )}
    </PageShell>
  );
}
