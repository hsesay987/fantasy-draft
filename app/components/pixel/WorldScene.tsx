"use client";

import { useEffect, useRef } from "react";
import { ACTOR_COLORS, easeToward, tierAt, WORLDS, type Actor } from "./worlds";

/**
 * A pixel world banner: the backdrop is drawn once and cached, then clouds, water, stars and the players' actors
 * animate on top at about 14 frames a second. `flash` (bump `key` to fire) shakes the scene red for a miss or
 * sparkles gold for a hit. Pauses when off screen or hidden, and holds still for reduced motion.
 */
export function WorldScene({ world, actors, flash, caption, labels = true }: { world: keyof typeof WORLDS; actors: Actor[]; flash?: { key: number; good: boolean }; caption?: string; labels?: boolean }) {
  const w = WORLDS[world];
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(actors);
  target.current = actors;
  const fx = useRef<{ at: number; good: boolean } | null>(null);
  const lastKey = useRef(flash?.key);
  if (flash && flash.key !== lastKey.current) { lastKey.current = flash.key; fx.current = { at: -1, good: flash.good }; }

  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const back = document.createElement("canvas");
    back.width = w.w; back.height = w.h;
    w.backdrop(back.getContext("2d")!);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0, raf = 0, last = 0;
    const shown: number[] = [];
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !c.offsetParent || now - last < 70) return;
      last = now; t++;
      const goal = target.current;
      const moving = goal.map((a, i) => {
        const from = shown[i] ?? 0;
        shown[i] = still ? a.value : easeToward(from, a.value);
        return Math.abs(a.value - shown[i]!) > 0.003;
      });
      shown.length = goal.length;
      const f = fx.current;
      if (f && f.at < 0) f.at = t;
      const age = f ? t - f.at : 99;
      const shake = f && !f.good && age < 6 && !still ? (age % 2 ? 2 : -2) : 0;
      ctx.drawImage(back, shake, 0);
      w.frame(ctx, still ? 0 : t, shown, moving);
      if (f && age < 8) {
        if (f.good) {
          for (let k = 0; k < 10; k++) {
            const lead = shown.indexOf(Math.max(...shown));
            const p = w.pos(shown[lead] ?? 0, lead, shown.length);
            const a = (k / 10) * Math.PI * 2, d = 4 + age * 2;
            ctx.fillStyle = k % 2 ? "#ffd23f" : "#ffffff";
            ctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y - 4 + Math.sin(a) * d), 1, 1);
          }
        } else {
          ctx.fillStyle = `rgba(255,40,80,${0.28 - age * 0.035})`;
          ctx.fillRect(0, 0, w.w, w.h);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w]);

  const lead = actors.length ? actors.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  return (
    <figure className="px-world m-0" data-world={world}>
      <div className="relative">
        <canvas ref={ref} width={w.w} height={w.h} className="block h-auto w-full" role="img"
          aria-label={`${caption ?? "Progress"}: ${actors.map((a) => `${a.name} at ${tierAt(w, a.value).label.toLowerCase()}`).join(", ")}`} />
        {labels && <ol className="pointer-events-none absolute inset-0 m-0 list-none p-0" aria-hidden>
          {w.tiers.slice(1).map((t) => {
            const p = w.pos(t.at, 0, 1);
            return <li key={t.label} className="px-world-tier" style={{ top: `${(p.y / w.h) * 100}%` }}>{t.label}</li>;
          })}
        </ol>}
      </div>
      <figcaption className="px-world-legend">
        {actors.map((a, i) => (
          <span key={a.name} className={lead?.name === a.name && a.value > 0 ? "lead" : ""}>
            <i style={{ background: ACTOR_COLORS[i % 6] }} />{a.name} · {tierAt(w, a.value).label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
