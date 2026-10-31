"use client";

import { useEffect, useRef, useState } from "react";
import { ACTOR_COLORS, checkpointAt, easeToward, WORLDS, type Actor, type Checkpoint } from "./worlds";

/**
 * A pixel world with a camera. The whole map is drawn once and cached; each frame shows the window around the
 * leading player, then animates clouds, water, stars and the players themselves at about 14 frames a second.
 * Crossing a named checkpoint shows a banner. Below the scene, a track charts every player against the checkpoints.
 * `flash` (bump `key`) shakes the scene red for a miss or sparkles gold for a hit.
 */
export function WorldScene({ world, actors, flash, caption, labels = true, track = true, onCheckpoint }: {
  world: keyof typeof WORLDS; actors: Actor[]; flash?: { key: number; good: boolean }; caption?: string; labels?: boolean; track?: boolean;
  onCheckpoint?: (cp: Checkpoint, who: string) => void;
}) {
  const w = WORLDS[world];
  const ref = useRef<HTMLCanvasElement>(null);
  const labelRefs = useRef<(HTMLLIElement | null)[]>([]);
  const target = useRef(actors);
  target.current = actors;
  const fx = useRef<{ at: number; good: boolean } | null>(null);
  const lastKey = useRef(flash?.key);
  if (flash && flash.key !== lastKey.current) { lastKey.current = flash.key; fx.current = { at: -1, good: flash.good }; }
  const [banner, setBanner] = useState<{ name: string; who: string; n: number } | null>(null);
  const cpCb = useRef(onCheckpoint);
  cpCb.current = onCheckpoint;

  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const back = document.createElement("canvas");
    back.width = w.fullW; back.height = w.fullH;
    w.backdrop(back.getContext("2d")!);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let t = 0, raf = 0, last = 0;
    const shown: number[] = [];
    const reached: number[] = [];
    let cam = w.camera(w.pos(0, 0, 1));
    let bannerN = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || !c.offsetParent || now - last < 70) return;
      last = now; t++;
      const goal = target.current;
      const moving = goal.map((a, i) => {
        const from = shown[i] ?? a.value; // start where the player already is, so a reload does not replay the climb
        shown[i] = still ? a.value : easeToward(from, a.value);
        return Math.abs(a.value - shown[i]!) > 0.002;
      });
      shown.length = goal.length;
      // Celebrate a checkpoint the first time anyone reaches it.
      goal.forEach((a, i) => {
        const idx = w.checkpoints.indexOf(checkpointAt(w, shown[i]!));
        if (reached[i] == null) reached[i] = idx;
        else if (idx > reached[i]!) {
          reached[i] = idx;
          const cp = w.checkpoints[idx]!;
          setBanner({ name: cp.name, who: a.name, n: ++bannerN });
          cpCb.current?.(cp, a.name);
        }
      });
      // The camera follows whoever is furthest along.
      const lead = shown.length ? shown.indexOf(Math.max(...shown)) : 0;
      const want = w.camera(w.pos(shown[lead] ?? 0, lead, shown.length));
      cam = still ? want : { x: cam.x + (want.x - cam.x) * 0.15, y: cam.y + (want.y - cam.y) * 0.15 };
      const camX = Math.round(cam.x), camY = Math.round(cam.y);
      const f = fx.current;
      if (f && f.at < 0) f.at = t;
      const age = f ? t - f.at : 99;
      const shake = f && !f.good && age < 6 && !still ? (age % 2 ? 2 : -2) : 0;
      ctx.drawImage(back, camX - shake, camY, w.viewW, w.viewH, 0, 0, w.viewW, w.viewH);
      ctx.save();
      ctx.translate(-camX + shake, -camY);
      w.frame(ctx, still ? 0 : t, shown, moving, { x: camX, y: camY });
      if (f && age < 9 && f.good) {
        const p = w.pos(shown[lead] ?? 0, lead, shown.length);
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2, d = 4 + age * 2.2;
          ctx.fillStyle = k % 2 ? "#ffd23f" : "#ffffff";
          ctx.fillRect(Math.round(p.x + Math.cos(a) * d), Math.round(p.y - 4 + Math.sin(a) * d), 1, 1);
        }
      }
      ctx.restore();
      if (f && age < 8 && !f.good) { ctx.fillStyle = `rgba(255,40,80,${0.28 - age * 0.035})`; ctx.fillRect(0, 0, w.viewW, w.viewH); }
      // Keep the checkpoint labels pinned to their spots on the map.
      w.checkpoints.forEach((cp, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        const p = w.pos(cp.at, 0, 1);
        const x = ((p.x - camX) / w.viewW) * 100, y = ((p.y - camY) / w.viewH) * 100;
        const visible = x > -10 && x < 100 && y > 2 && y < 98;
        el.style.opacity = visible ? "1" : "0";
        el.style.left = `${Math.max(1, Math.min(78, x + (w.id === "launch" ? -4 : 3)))}%`;
        el.style.top = `${w.id === "launch" ? 92 : y}%`;
      });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [w]);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), 2200);
    return () => clearTimeout(id);
  }, [banner]);

  const lead = actors.length ? actors.reduce((a, b) => (b.value > a.value ? b : a)) : null;
  return (
    <figure className="px-world m-0" data-world={world}>
      <div className="relative overflow-hidden">
        <canvas ref={ref} width={w.viewW} height={w.viewH} className="block h-auto w-full" role="img"
          aria-label={`${caption ?? "Progress"}: ${actors.map((a) => `${a.name} at ${checkpointAt(w, a.value).name}`).join(", ")}`} />
        {labels && (
          <ol className="pointer-events-none absolute inset-0 m-0 list-none p-0" aria-hidden>
            {w.checkpoints.map((cp, i) => <li key={cp.name} ref={(el) => { labelRefs.current[i] = el; }} className="px-world-tier" style={{ opacity: 0 }}>{cp.name.toUpperCase()}</li>)}
          </ol>
        )}
        {banner && (
          <div key={banner.n} className="px-banner" role="status">
            <span>CHECKPOINT</span>
            <b>{banner.name.toUpperCase()}</b>
            <span>{banner.who} made it</span>
          </div>
        )}
      </div>
      {track && <ProgressTrack world={world} actors={actors} leadName={lead?.value ? lead.name : null} />}
    </figure>
  );
}

/** A chart of the whole journey: every checkpoint as a tick, every player as a marker, the leader's progress filled in. */
export function ProgressTrack({ world, actors, leadName }: { world: keyof typeof WORLDS; actors: Actor[]; leadName?: string | null }) {
  const w = WORLDS[world];
  const top = Math.max(0, ...actors.map((a) => a.value));
  return (
    <div className="px-track" aria-label="Progress chart">
      <div className="px-track-bar">
        <div className="fill" style={{ width: `${Math.min(100, top * 100)}%` }} />
        {w.checkpoints.map((cp) => (
          <span key={cp.name} className={`tick ${top >= cp.at - 1e-9 ? "on" : ""}`} style={{ left: `${cp.at * 100}%` }}>
            <i />
            <em>{cp.name}</em>
          </span>
        ))}
        {actors.map((a, i) => (
          <span key={a.name} className="pin" style={{ left: `${Math.min(100, a.value * 100)}%`, background: ACTOR_COLORS[i % 6], top: `${-10 - i * 6}px` }} title={a.name} />
        ))}
      </div>
      <div className="px-track-legend">
        {actors.map((a, i) => (
          <span key={a.name} className={leadName === a.name ? "lead" : ""}>
            <i style={{ background: ACTOR_COLORS[i % 6] }} />{a.name} · {checkpointAt(w, a.value).name} · {Math.round(a.value * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}
