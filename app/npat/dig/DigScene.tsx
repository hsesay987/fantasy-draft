"use client";

import { useEffect, useMemo, useRef } from "react";
import { DIG_MAX_M, GEMS, METRES_PER_POINT, TIER_POINTS, ZONES, type Tier } from "../../topicDraft/npat/rules";
import { drawGem, drawMiner } from "./sprites";
import { buildWorld, C, G, my, VH, W, WH, zoneAt } from "./world";

const POP_MS = 900, EASE = 0.035, TICK_STEP = 250;
const LANE_TINTS = [C.bl, C.gr, C.la, C.pu, C.cyan, C.ll, C.cl, C.ro];
const TICKS = Array.from({ length: DIG_MAX_M / TICK_STEP + 1 }, (_, i) => i * TICK_STEP);
const hudStyle = "rounded bg-[#1b1828] px-2 py-[3px] font-mono text-xs text-[#f4f1e8]";

type Lane = { name: string; depth: number };
type Props = {
  depth: number;
  digging: boolean;
  /** Gems set into the shaft wall, in the order they were found. */
  gems: Tier[];
  /** The gem popping right now (rises and sparkles for ~900 ms). */
  found: Tier | null;
  /** TV: one shaft per player, side by side (up to 8); the camera follows the deepest. */
  lanes?: Lane[];
  compact?: boolean;
};

/** The pixel dig scene: a 240×720 world seen through a 240×150 window that follows the miner. */
export default function DigScene({ depth, digging, gems, found, lanes, compact = false }: Props) {
  const world = useMemo(() => buildWorld(11), []);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLSpanElement>(null), ptsRef = useRef<HTMLSpanElement>(null), bnRef = useRef<HTMLDivElement>(null);
  const tickRefs = useRef<(HTMLDivElement | null)[]>([]), laneRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const list: Lane[] = lanes && lanes.length ? lanes.slice(0, 8) : [{ name: "", depth }];
  const multi = !!(lanes && lanes.length);
  const live = useRef({ list, digging, gems, found, multi, compact });
  useEffect(() => { live.current = { list, digging, gems, found, multi, compact }; });
  const pop = useRef<{ t0: number | null; done: boolean }>({ t0: null, done: false });
  useEffect(() => { pop.current = { t0: null, done: false }; }, [found]);

  const n = list.length;
  useEffect(() => {
    const cv = cvRef.current, c = cv?.getContext("2d");
    if (!cv || !c) return;
    const bg = document.createElement("canvas");
    bg.width = W; bg.height = WH;
    world.paint(bg.getContext("2d")!);
    const { L1, L2, CY, OX, clouds, ant, lava } = world.layout;
    const worms = world.layout.worms.map((w) => ({ ...w }));
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = mq.matches;
    const onMq = () => { reduced = mq.matches; };
    mq.addEventListener("change", onMq);

    const shown = live.current.list.map((l) => Math.max(0, Math.min(DIG_MAX_M, l.depth)));
    let camY = 0, last = 0, zone = zoneAt(Math.max(...shown) + 1), raf = 0, bannerT: ReturnType<typeof setTimeout> | undefined;
    const wall: { tier: Tier; x: number; y: number }[] = [];
    const lead = () => Math.max(...shown);
    camY = Math.max(0, Math.min(WH - VH, my(lead()) - 10 - VH * 0.4));

    const banner = (text: string) => {
      const el = bnRef.current;
      if (!el) return;
      el.textContent = text; el.style.opacity = "1";
      clearTimeout(bannerT);
      bannerT = setTimeout(() => { el.style.opacity = "0"; }, 1700);
    };

    function frame(t: number) {
      const L = live.current, lanesNow = L.list.map((l) => ({ ...l, depth: Math.max(0, Math.min(DIG_MAX_M, l.depth)) }));
      const dt = last ? Math.min(100, t - last) : 16.67;
      last = t;
      const k = 1 - Math.pow(1 - EASE, dt / 16.67);
      const ta = reduced ? 0 : t; // ambient clock
      const moving = lanesNow.map((l, i) => {
        if (shown[i] === undefined) shown[i] = l.depth;
        if (reduced) { shown[i] = l.depth; return false; }
        if (Math.abs(l.depth - shown[i]) > 1) { shown[i] += (l.depth - shown[i]) * k; return true; }
        shown[i] = l.depth; return false;
      });
      shown.length = lanesNow.length;

      // Single-lane events: found pop, wall gems, zone banner.
      const p = pop.current, m0 = moving[0];
      if (!L.multi) {
        if (!m0) {
          if (L.found && p.t0 == null) { p.t0 = t; banner(`Found ${GEMS[L.found].name.toLowerCase()} +${TIER_POINTS[L.found]}`); }
          if (p.t0 != null && t - p.t0 > POP_MS) p.done = true;
          if (wall.length > L.gems.length) wall.length = L.gems.length;
          if ((!L.found || p.done || reduced) && wall.length < L.gems.length) {
            const batch = L.gems.length - wall.length, y0 = Math.round(my(shown[0])) - 2;
            for (let j = 0; wall.length < L.gems.length; j++) wall.push({ tier: L.gems[wall.length], x: wall.length % 2 ? 115 : 99, y: y0 - (batch - 1 - j) * 8 });
          }
        }
        const zi = zoneAt(shown[0] + 1);
        if (zi > zone) banner(zi === ZONES.length - 1 ? "You reached the core" : `Entering ${ZONES[zi].name.toLowerCase()}`);
        zone = zi;
      }

      const top = lead();
      const want = Math.max(0, Math.min(WH - VH, my(top) - 10 - VH * 0.4));
      camY = reduced ? want : camY + (want - camY) * (1 - Math.pow(0.92, dt / 16.67));
      const o = Math.round(camY);
      const atCore = top >= DIG_MAX_M - 1;

      lanesNow.forEach((lane, li) => {
        const ox = li * W, sh = shown[li];
        const D = (x: number, y: number, col: string) => { c!.fillStyle = col; c!.fillRect(Math.round(x), Math.round(y) - o, 1, 1); };
        const Fr = (x: number, y: number, w: number, h: number, col: string) => { c!.fillStyle = col; c!.fillRect(Math.round(x), Math.round(y), w, h); };
        c!.save();
        c!.translate(ox, 0);
        c!.beginPath(); c!.rect(0, 0, W, VH); c!.clip();
        c!.drawImage(bg, 0, o, W, VH, 0, 0, W, VH);
        clouds.forEach((cl) => { const x = ((cl[0] + ta / 250) % 280) - 20; for (let i = -6; i <= 6; i++) for (let j = -2; j <= 2; j++) if ((i * i) / 36 + (j * j) / 4 <= 1) D(x + i, cl[1] + j, C.cl); });
        for (let x = 0; x < W; x += 3) if (Math.floor(ta / 400 + x) % 3 === 0) D(x, G - 1, C.gr);
        worms.forEach((w) => {
          if (!reduced && li === 0) { w.x += w.d * 0.03; if (w.x < 4 || w.x > W - 8) w.d *= -1; }
          for (let q = 0; q < 5; q++) D(w.x + q, w.y + ((q + Math.floor(ta / 200)) % 2), "#d98a8a");
        });
        D(60 + ((ta / 80) % 60), ant.y + Math.round(Math.sin(ta / 300)), C.ink);
        if (Math.floor(ta / 900) % 2) D(84, my(3800) + 4 + ((ta / 90) % 6), C.cyan);
        if (Math.floor(ta / 700) % 3 === 0) D(191, my(3700) + 4, C.cl);
        [L1, L2].forEach((B, i) => {
          for (let x = 0; x < W; x++) {
            const y = lava(x + ta / (60 + i * 30), B);
            Fr(x, y - o - 2, 1, 1, C.mg); Fr(x, y - o - 1, 1, 1, C.ll); Fr(x, y - o, 1, 3, C.la); Fr(x, y - o + 3, 1, 2, C.mg);
            if ((x + Math.floor(ta / 120)) % 11 === 0) D(x, y, C.cl);
          }
        });
        for (let i = 0; i < 3; i++) D((i * 83 + ta / 40) % W, L1 - ((ta / 30 + i * 20) % 14), C.ll);
        // The core: a small pulsing orb; it only grows and gets its sparkle ring at the full 5,000 m.
        const reach = sh >= DIG_MAX_M - 1, pr = Math.round(Math.sin(ta / 700)), cr = reach ? 6 : 4;
        const orb = (r: number, col: string) => { for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) D(OX + x, CY + y, col); };
        orb(cr + pr, C.la); orb(reach ? 3 : 2, C.ll);
        if (atCore) for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28 + ta / 600; D(OX + Math.round(Math.cos(a) * 11), CY + Math.round(Math.sin(a) * 8), C.ll); }

        const mY = my(sh) - 10, bot = Math.round(mY) + 10, dg = moving[li] || (L.digging && !reduced && !L.multi);
        if (bot > G + 1) {
          Fr(104, G + 1 - o, 10, bot - G - 1, C.ink); Fr(105, G + 1 - o, 1, bot - G - 1, C.cy); Fr(112, G + 1 - o, 1, bot - G - 1, C.cy);
          for (let y = G + 3; y < bot; y += 4) if (y - o >= 0 && y - o < VH) Fr(105, y - o, 8, 1, C.so);
        }
        if (!L.multi) wall.forEach((w) => { drawGem(c!, w.x, w.y, w.tier, o); if (!reduced && Math.floor(ta / 600 + w.y) % 5 === 0) D(w.x + 3, w.y + 1, C.cl); });
        drawMiner(c!, 105, Math.round(mY), o, L.multi ? LANE_TINTS[li % LANE_TINTS.length] : undefined);
        const popping = !L.multi && L.found && !moving[0] && (reduced || (p.t0 != null && !p.done));
        if (popping && L.found) {
          const kk = reduced || p.t0 == null ? 0.5 : Math.min(1, (t - p.t0) / POP_MS), lift = Math.round(Math.sin(kk * 3.14) * 8);
          drawGem(c!, 106, Math.round(mY) - 6 - lift, L.found, o);
          if (!reduced && Math.floor(t / 90) % 2) { D(105, Math.round(mY) - 7 - lift, C.cl); D(112, Math.round(mY) - 3 - lift, C.cl); }
        }
        const sw = dg && Math.floor(t / 120) % 2;
        Fr(sw ? 110 : 111, Math.round(mY) + (sw ? 6 : 3) - o, 3, 1, C.cl);
        if (dg) for (let i = 0; i < 3; i++) D(104 + Math.random() * 10, mY + 10 + Math.random() * 2, C.cy);
        if (!dg && !popping && (reduced || Math.floor(t / 500) % 2)) D(112, Math.round(mY) + 1, C.ll);
        c!.restore();
        const lab = laneRefs.current[li];
        if (lab) lab.textContent = `${(Math.round(sh / 10) * 10).toLocaleString()} m`;
      });

      if (!L.multi) {
        const sh = shown[0];
        TICKS.forEach((m, i) => {
          const el = tickRefs.current[i];
          if (!el) return;
          const y = my(m) - o;
          el.style.top = `calc(${(y / VH) * 100}% - 6px)`;
          el.style.display = y < -4 || y > VH + 4 ? "none" : "flex";
          el.style.opacity = (0.25 + 0.75 * Math.max(0, 1 - Math.abs(y - VH / 2) / (VH / 2))).toFixed(2);
        });
        if (hudRef.current) hudRef.current.textContent = `${(Math.round(sh / 10) * 10).toLocaleString()} m`;
        if (ptsRef.current) ptsRef.current.textContent = `${Math.round(sh / METRES_PER_POINT)} pts`;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); clearTimeout(bannerT); mq.removeEventListener("change", onMq); };
  }, [world]);

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ background: C.ink }}>
      <canvas ref={cvRef} width={W * n} height={VH} role="img" aria-label="Pixel dig scene"
        style={{ width: "100%", height: "auto", imageRendering: "pixelated", display: "block" }} />
      {!multi && !compact && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {TICKS.map((m, i) => (
            <div key={m} ref={(el) => { tickRefs.current[i] = el; }}
              style={{ position: "absolute", left: 6, display: "flex", alignItems: "center", gap: 4, font: "11px ui-monospace, monospace", color: "rgba(244,241,232,.38)" }}>
              <span style={{ display: "inline-block", width: m % 500 ? 4 : 8, height: 1, background: "rgba(244,241,232,.3)" }} />
              {m % 500 ? null : <span>{m.toLocaleString()}</span>}
            </div>
          ))}
        </div>
      )}
      {!multi && (
        <div className="pointer-events-none absolute right-2.5 top-2 flex flex-col items-end gap-1">
          <span ref={hudRef} className={hudStyle}>0 m</span>
          {!compact && <span ref={ptsRef} className={hudStyle}>0 pts</span>}
        </div>
      )}
      {multi && list.map((l, i) => (
        <div key={i} className="pointer-events-none absolute bottom-1 flex justify-center" style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}>
          <span className={hudStyle}>{l.name} <span ref={(el) => { laneRefs.current[i] = el; }}>0 m</span></span>
        </div>
      ))}
      <div ref={bnRef} aria-live="polite" className="pointer-events-none absolute left-1/2 top-2.5 -translate-x-1/2 whitespace-nowrap rounded bg-[#1b1828] px-2.5 py-[3px] text-xs text-[#f4f1e8] opacity-0 transition-opacity duration-300" />
    </div>
  );
}
