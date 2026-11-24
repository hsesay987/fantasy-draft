"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSound } from "../../components/SoundProvider";
import { REEL_MS } from "../../topicDraft/npat/rules";
import { ABC, reelLetter } from "./reel";
import { C } from "./world";

const STEPS = 28, LAND_MS = 520, ROW = 84, WIN_H = 136, TICK_GAP_MS = 45, BULBS = 14;
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

const RM = "(prefers-reduced-motion: reduce)";
const subRM = (cb: () => void) => { const m = window.matchMedia(RM); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); };
const useReducedMotion = () => useSyncExternalStore(subRM, () => window.matchMedia(RM).matches, () => false);

/** Letters in the window: the one above, the one in the slot, and the one coming up from below. */
type Strip = [string, string, string];
const SPARKS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);

/**
 * A pixel slot machine: chasing marquee bulbs, a letter strip that scrolls through the window and slows down, then
 * lands on `letter` by REEL_MS with a flash, a pop and sparks. Ticks on each letter and chimes on landing.
 */
export default function SlotReel({ letter, spinning, onDone }: { letter: string | null; spinning: boolean; onDone?: () => void }) {
  const [strip, setStrip] = useState<Strip>(["?", "?", "?"]);
  const [landed, setLanded] = useState(false);
  const [chase, setChase] = useState(0);
  const stripEl = useRef<HTMLDivElement>(null);
  const landEl = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { play } = useSound();
  const sfx = useRef(play);
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; sfx.current = play; });
  const target = letter ? letter.toUpperCase().slice(0, 1) : null;

  useEffect(() => {
    if (!spinning) return;
    if (reduced) { if (target) { sfx.current("reelLand"); done.current?.(); } return; }
    let raf = 0, t0 = 0, idx = -1, landedAt = 0, lastTick = 0, finished = false, bulb = -1;
    const start = ABC.indexOf(target ?? "A");
    const fast = (i: number) => ABC[(((start + i * 7) % 26) + 26) % 26]!;
    setLanded(false);
    const loop = (t: number) => {
      if (!t0) t0 = t;
      let pos: number, rows: Strip;
      if (!target) { // no result yet: keep spinning quickly
        pos = (t - t0) / 60;
        const i = Math.floor(pos);
        rows = [fast(i - 1), fast(i), fast(i + 1)];
      } else {
        const p = Math.min(1, (t - t0) / REEL_MS);
        pos = landedAt ? STEPS : easeOut(p) * STEPS;
        const i = Math.floor(pos);
        rows = [reelLetter(target, i - 1, STEPS), reelLetter(target, i, STEPS), reelLetter(target, i + 1, STEPS)];
        if (p >= 1 && !landedAt) { landedAt = t; setLanded(true); sfx.current("reelLand"); }
      }
      const i = Math.floor(pos);
      if (i !== idx) {
        idx = i;
        setStrip(rows);
        if (!landedAt && t - lastTick >= TICK_GAP_MS) { lastTick = t; sfx.current("reelTick"); }
      }
      if (stripEl.current) stripEl.current.style.transform = `translateY(${-(landedAt ? 0 : pos - i) * ROW}px)`;
      const b = Math.floor((t - t0) / (landedAt ? 160 : 70)) % BULBS;
      if (b !== bulb) { bulb = b; setChase(b); }
      if (landedAt) {
        const q = Math.min(1, (t - landedAt) / LAND_MS);
        if (landEl.current) landEl.current.style.setProperty("--q", String(q));
        if (q >= 1 && !finished) { finished = true; done.current?.(); }
        if (q >= 1 && t - landedAt > 2_400) return; // keep the bulbs going a little, then rest
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [spinning, target, reduced]);

  const still = !spinning || reduced;
  const show: Strip = still ? ["", target ?? "?", ""] : strip;
  const isLanded = still ? !!target : landed;
  const blur = !still && !isLanded && !target;

  return (
    <div role="img" aria-label={target && isLanded ? `Letter ${target}` : "Spinning for a letter"} className="np-reel"
      style={{ position: "relative", width: 132, height: 168, padding: 12, background: C.rd, border: `4px solid ${C.ink}`, boxShadow: `0 6px 0 ${C.ink}, inset 0 0 0 4px ${C.ro}` }}>
      {Array.from({ length: BULBS }, (_, i) => {
        const on = still ? isLanded : isLanded ? (i + chase) % 2 === 0 : (i - chase + BULBS) % BULBS < 3;
        const [x, y] = bulbAt(i);
        return <span key={i} aria-hidden style={{ position: "absolute", left: x, top: y, width: 8, height: 8, background: on ? C.ll : C.mg, boxShadow: on ? `0 0 8px ${C.la}` : "none" }} />;
      })}
      <div ref={landEl} style={{ position: "relative", width: "100%", height: "100%", background: C.ink, boxShadow: `inset 0 0 0 4px ${C.ro}`, overflow: "hidden", ["--q" as string]: isLanded ? 1 : 0 }}>
        <div ref={stripEl} style={{ position: "absolute", left: 0, right: 0, top: (WIN_H - ROW) / 2 - ROW, willChange: "transform" }}>
          {show.map((l, i) => (
            <div key={i} style={{ height: ROW, display: "grid", placeItems: "center", font: "700 64px ui-monospace, monospace", imageRendering: "pixelated",
              color: i === 1 ? (isLanded ? C.ll : blur ? C.cyan : C.cl) : C.ro, opacity: i === 1 ? 1 : 0.55,
              filter: blur && i !== 1 ? "blur(1px)" : "none",
              textShadow: i === 1 && isLanded ? `0 0 14px ${C.la}, 4px 4px 0 ${C.mg}` : `4px 4px 0 ${C.mg}`,
              transform: i === 1 && isLanded && !still ? "scale(calc(1.3 - 0.3 * var(--q)))" : undefined }}>{l}</div>
          ))}
        </div>
        {/* Glass: dark at the top and bottom edge so letters roll in and out of the slot. */}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(${C.ink} 0%, transparent 28%, transparent 72%, ${C.ink} 100%)`, pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", left: 4, right: 4, top: "50%", height: 4, marginTop: ROW / 2 - 2, background: C.la, opacity: 0.35 }} />
        <div aria-hidden style={{ position: "absolute", left: 4, right: 4, top: "50%", height: 4, marginTop: -ROW / 2 - 2, background: C.la, opacity: 0.35 }} />
        {isLanded && !still && (
          <div aria-hidden style={{ position: "absolute", inset: 0, background: C.cl, opacity: "calc(0.85 - 0.85 * var(--q))", pointerEvents: "none" }} />
        )}
      </div>
      {isLanded && !still && SPARKS.map((a, i) => (
        <span key={i} aria-hidden className="np-spark" style={{ position: "absolute", left: "50%", top: "50%", width: 6, height: 6, background: i % 2 ? C.ll : C.cyan,
          ["--dx" as string]: `${Math.cos(a) * 88}px`, ["--dy" as string]: `${Math.sin(a) * 96}px` }} />
      ))}
      <style>{`.np-spark{animation:np-spark 640ms steps(8) forwards}@keyframes np-spark{0%{transform:translate(-3px,-3px);opacity:1}100%{transform:translate(calc(var(--dx) - 3px),calc(var(--dy) - 3px));opacity:0}}`}</style>
    </div>
  );
}

/** Bulb positions in the frame's 12 px rim (inside a 124×160 padding box): 7 across the top, then 7 back along the bottom. */
function bulbAt(i: number): [number, number] {
  const per = BULBS / 2, gap = (124 - 8) / (per - 1);
  return i < per ? [Math.round(i * gap), 2] : [Math.round((BULBS - 1 - i) * gap), 150];
}
