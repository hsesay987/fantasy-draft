"use client";

import { motion } from "motion/react";
import { HelpCircle } from "lucide-react";
import type { Clue } from "../../topicDraft/traits";

/** A lot in a blind auction: no name, no picture, only clues. The reveal comes when the lot sells. */
export function BlindLot({ clues, number }: { clues: Clue[]; number: number }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="grid h-[140px] w-[140px] place-items-center rounded-3xl border border-white/10 bg-gradient-to-br from-primary/40 to-accent/20 shadow-[0_0_40px_-10px_var(--primary)]" aria-hidden>
          <HelpCircle className="h-16 w-16 text-white/80" />
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-card/80 p-4">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Mystery lot #{number} · {clues.length} clue{clues.length === 1 ? "" : "s"}</p>
        <ul className="mt-3 space-y-2" aria-label="Clues about this lot">
          {clues.map((c, i) => (
            <motion.li key={c.key} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.12 }} className="flex items-start gap-3 rounded-lg bg-white/5 px-3 py-2">
              <span className="mt-0.5 shrink-0 rounded-md bg-primary/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary">{c.label}</span>
              <span>{c.text}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
