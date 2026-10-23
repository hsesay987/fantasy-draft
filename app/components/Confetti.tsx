"use client";

import { useMemo } from "react";
import { motion } from "motion/react";

const COLORS = ["#7c3aed", "#f43f5e", "#a78bfa", "#fbbf24", "#22c55e", "#38bdf8"];

/** One-shot confetti burst; pure CSS/motion, respects reduced motion by rendering nothing. */
export function Confetti({ count = 70 }: { count?: number }) {
  const bits = useMemo(
    () => Array.from({ length: count }, (_, i) => ({ id: i, x: Math.random() * 100, dx: (Math.random() - 0.5) * 220, rot: Math.random() * 720 - 360, delay: Math.random() * 0.35, dur: 1.8 + Math.random() * 1.4, color: COLORS[i % COLORS.length]!, w: 6 + Math.random() * 6 })),
    [count]
  );
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {bits.map((b) => (
        <motion.span key={b.id} className="absolute top-0 block rounded-[2px]" style={{ left: `${b.x}%`, width: b.w, height: b.w * 1.6, background: b.color }}
          initial={{ y: -20, x: 0, rotate: 0, opacity: 1 }} animate={{ y: "105vh", x: b.dx, rotate: b.rot, opacity: [1, 1, 0] }} transition={{ duration: b.dur, delay: b.delay, ease: "easeIn" }} />
      ))}
    </div>
  );
}
