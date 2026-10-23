"use client";

import { AnimatePresence, motion } from "motion/react";
import type { Item, State } from "../types";
import { CharacterAvatar } from "../../components/CharacterAvatar";

export function TeamPanel({ state, pool, activePlayer, me }: { state: State; pool: Item[]; activePlayer: string | null; me?: string | null }) {
  const byId = new Map(pool.map((i) => [i.id, i]));
  const { teamSize, players, roles } = state.config;
  return (
    <div className="space-y-3">
      {players.map((p) => {
        const mine = state.picks.filter((x) => x.player === p);
        const active = p === activePlayer;
        return (
          <div
            key={p}
            className={`rounded-xl border p-3 transition-colors ${active ? "border-secondary bg-primary/15" : "border-white/10 bg-card/60"}`}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{p}{me === p && <span className="ml-2 text-xs text-secondary">you</span>}</span>
              {active && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-black">ON THE CLOCK</span>}
            </div>
            <ul className="space-y-1">
              <AnimatePresence initial={false}>
                {mine.map((m) => (
                  <motion.li
                    key={m.itemId}
                    layout
                    initial={{ opacity: 0, x: -12, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    className="flex items-center justify-between rounded-lg bg-white/5 px-2.5 py-1.5 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2"><CharacterAvatar name={byId.get(m.itemId)?.name ?? "?"} query={byId.get(m.itemId)?.q} size={24} className="!rounded-md" /><span className="truncate">{byId.get(m.itemId)?.name}</span></span>
                    {m.role && <span className="ml-2 shrink-0 text-xs text-secondary">{m.role}</span>}
                  </motion.li>
                ))}
              </AnimatePresence>
              {Array.from({ length: Math.max(0, teamSize - mine.length) }).map((_, i) => (
                <li key={`e${i}`} className="rounded-lg border border-dashed border-white/10 px-2.5 py-1.5 text-sm text-muted-foreground/60">
                  {roles.length ? roles.find((r) => !mine.some((m) => m.role === r)) ?? "Empty" : "Empty slot"}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
