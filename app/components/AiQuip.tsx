"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

const LINES = [
  "Hmm… I know exactly who I want.", "You won't see this one coming.", "Oh, this is going to hurt.", "Rolling… and it's my lucky day.",
  "Don't blink.", "Calculating… 99.9% victory.", "Nice pick earlier. Shame about this one.", "I've seen your team. Adorable.",
  "Easy choice.", "This one's mine!", "Let me cook.", "Plot twist incoming.",
];

/** A little rival trash-talk bubble that changes every turn. */
export function AiQuip({ who, seed }: { who: string; seed: number }) {
  const line = useMemo(() => LINES[Math.abs(seed * 2654435761) % LINES.length]!, [seed]);
  return (
    <motion.p key={seed} initial={{ opacity: 0, y: 6, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="inline-flex max-w-full items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-white/5 px-3 py-2 text-sm">
      <span className="font-semibold text-secondary">{who}:</span> <span className="truncate italic text-muted-foreground">“{line}”</span>
    </motion.p>
  );
}
