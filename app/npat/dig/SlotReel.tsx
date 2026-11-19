"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { REEL_MS } from "../../topicDraft/npat/rules";
import { ABC, reelLetter } from "./reel";
import { C } from "./world";

const STEPS = 28, BUMP_MS = 240;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

const RM = "(prefers-reduced-motion: reduce)";
const subRM = (cb: () => void) => { const m = window.matchMedia(RM); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const useReducedMotion = () => useSyncExternalStore(subRM, () => window.matchMedia(RM).matches, () => false);

/** A pixel slot window: spins through letters, slows down, and lands on `letter` by REEL_MS with a small bump. */
export default function SlotReel({ letter, spinning, onDone }: { letter: string | null; spinning: boolean; onDone?: () => void }) {
  const [spun, setShown] = useState<string>("?");
  const [spunBump, setBump] = useState(0);
  const reduced = useReducedMotion();
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; });
  const target = letter ? letter.toUpperCase().slice(0, 1) : null;

  useEffect(() => {
    if (!spinning) return;
    if (reduced) { if (target) done.current?.(); return; }
    let raf = 0, t0 = 0, idx = -1, landedAt = 0, finished = false;
    const start = ABC.indexOf(target ?? "A");
    const loop = (t: number) => {
      if (!t0) t0 = t;
      if (!target) { // no result yet: keep spinning quickly
        const i = Math.floor((t - t0) / 60);
        if (i !== idx) { idx = i; setShown(ABC[(start + i * 7) % 26]); }
      } else if (!landedAt) {
        const p = Math.min(1, (t - t0) / REEL_MS);
        const i = Math.floor(easeOut(p) * STEPS);
        if (i !== idx) { idx = i; setShown(reelLetter(target, i, STEPS)); }
        if (p >= 1) { landedAt = t; setShown(target); }
      }
      if (landedAt) {
        const q = Math.min(1, (t - landedAt) / BUMP_MS);
        setBump(Math.round(-5 * (1 - q) * (1 - q)));
        if (q >= 1 && !finished) { finished = true; setBump(0); done.current?.(); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spinning, target, reduced]);
  const still = !spinning || reduced;
  const shown = still ? (target ?? "?") : spun;
  const bump = still ? 0 : spunBump;

  return (
    <div role="img" aria-label={target ? `Letter ${target}` : "Spinning for a letter"}
      style={{ width: 76, height: 92, background: C.ink, border: `4px solid ${C.ro}`, boxShadow: `inset 0 0 0 4px ${C.rd}`, display: "grid", placeItems: "center", overflow: "hidden" }}>
      <span style={{ font: "700 56px ui-monospace, monospace", color: spinning && !target ? C.cyan : C.ll, transform: `translateY(${bump}px)`, imageRendering: "pixelated" }}>{shown}</span>
    </div>
  );
}
