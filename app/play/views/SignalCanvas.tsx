"use client";

import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { createPacer, freqOf, posFromPointer, revealAt, SCORE_BANDS, verdictFor, type Points } from "./signal";

// The signal scope: a late-night radio's tuning strip under a phosphor screen. Everything is drawn on a small canvas of
// whole "cells" that the browser scales up by a whole number of device pixels, so every block stays square and crisp.
const TARGET_W = 180, H = 104, STRIP = 20, MARGIN = 9, SCREEN = H - STRIP, MID = 40, AMP = 19;
const TAU = Math.PI * 2;

const INK = { screen: "#04100d", screen2: "#071a15", grid: "#0f3a2e", grid2: "#17594a", strip: "#2a1606", strip2: "#3d2109", tick: "#ffbe6b", tickDim: "#a8702c", calm: "#5dffb0", calmDim: "#176b52", scram: "#ff5d9e", scramDim: "#6b1f44", gold: "#ffb347", goldDim: "#7a4a12", hot: "#fbfff0", needle: "#ff5a3c", needleDim: "#7a1f10", flag: "#7dffcf" };
const BAND_INK: Record<number, string> = { 2: "#8a5413", 3: "#e0912a", 4: "#fff1b8" };
const DIGITS: Record<number, string[]> = { 2: ["XXX", "..X", "XXX", "X..", "XXX"], 3: ["XXX", "..X", ".XX", "..X", "XXX"], 4: ["X.X", "X.X", "XXX", "..X", "..X"] };

const hash = (a: number, b: number) => { const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return n - Math.floor(n); };
const rect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, ink: string) => { c.fillStyle = ink; c.fillRect(Math.round(x), Math.round(y), w, h); };
const clampPos = (p: number) => Math.max(0, Math.min(100, p));
const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

function makeLayer(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  draw(canvas.getContext("2d")!);
  return canvas;
}

/** The parts of the scope that never change: glass, graticule, and the wood-and-amber tuning strip. */
function drawBack(c: CanvasRenderingContext2D, W: number) {
  rect(c, 0, 0, W, SCREEN, INK.screen);
  for (let y = 0; y < SCREEN; y++) for (let x = 0; x < W; x++) {
    const glow = 1 - Math.hypot((x - W / 2) / (W / 2), (y - MID) / MID) * 0.8;
    if (glow * 8 > ((x & 1) + (y & 1) * 2) * 2 + 1.5) rect(c, x, y, 1, 1, INK.screen2);
  }
  // Graticule: dotted divisions every tenth of the scale, with the signal's rest line through the middle.
  for (let i = 0; i <= 10; i++) { const x = xOf(i * 10, W); for (let y = 2; y < SCREEN - 1; y += 3) rect(c, x, y, 1, 1, i % 5 ? INK.grid : INK.grid2); }
  for (const y of [MID - 26, MID - 13, MID + 13, MID + 26]) for (let x = 2; x < W - 1; x += 3) rect(c, x, y, 1, 1, INK.grid);
  for (let x = 0; x < W; x += 2) rect(c, x, MID, 1, 1, INK.grid2);
  // Rounded glass corners.
  for (const [x, y, w, h] of [[0, 0, 3, 1], [0, 1, 1, 2], [W - 3, 0, 3, 1], [W - 1, 1, 1, 2], [0, SCREEN - 1, 3, 1], [0, SCREEN - 3, 1, 2], [W - 3, SCREEN - 1, 3, 1], [W - 1, SCREEN - 3, 1, 2]] as const) rect(c, x, y, w, h, "#000");
  // The strip.
  rect(c, 0, SCREEN, W, 1, "#000");
  rect(c, 0, SCREEN + 1, W, STRIP - 1, INK.strip);
  for (let x = 0; x < W; x += 2) rect(c, x, SCREEN + 2 + (x % 4 ? 1 : 0), 1, 1, INK.strip2);
  rect(c, 0, H - 1, W, 1, "#120902");
}

const xOf = (pos: number, W: number) => Math.round(MARGIN + (clampPos(pos) / 100) * (W - 1 - MARGIN * 2));

function drawTicks(c: CanvasRenderingContext2D, W: number) {
  const base = SCREEN + 15;
  rect(c, xOf(0, W), base, xOf(100, W) - xOf(0, W) + 1, 1, INK.tickDim);
  for (let i = 0; i <= 20; i++) { const major = i % 2 === 0; rect(c, xOf(i * 5, W), base - (major ? 4 : 2), 1, major ? 4 : 2, major ? INK.tick : INK.tickDim); }
}

/** The score bands on the strip, with their points. `lit` runs 0-1 and lights them from the outside in. */
function drawBands(c: CanvasRenderingContext2D, W: number, target: number, lit: number, columns: boolean) {
  SCORE_BANDS.forEach(({ gap, points }, i) => {
    if (lit <= i / SCORE_BANDS.length) return;
    const x0 = xOf(target - gap, W), x1 = xOf(target + gap, W);
    if (columns) for (let y = 1; y < SCREEN - 1; y++) for (let x = x0 + (y & 1); x <= x1; x += 2 + i) rect(c, x, y, 1, 1, i === 2 ? "#3a4a2a" : "#12332a");
    rect(c, x0, SCREEN + 2, x1 - x0 + 1, 11, BAND_INK[points]!);
    rect(c, x0, SCREEN + 2, x1 - x0 + 1, 1, "#000");
  });
  if (lit <= 0.34) return;
  SCORE_BANDS.forEach(({ gap, points }, i) => {
    if (lit <= i / SCORE_BANDS.length) return;
    const glyph = DIGITS[points]!, inner = i === 2 ? 0 : SCORE_BANDS[i + 1]!.gap;
    for (const side of inner ? [-1, 1] : [0]) {
      const mid = xOf(target + side * (gap + inner) / 2, W) - 1;
      if (target + side * gap < 0 || target + side * gap > 100) continue;
      glyph.forEach((row, ry) => [...row].forEach((ch, rx) => { if (ch === "X") rect(c, mid + rx, SCREEN + 5 + ry, 1, 1, points === 4 ? "#3a2406" : "#1a0d02"); }));
    }
  });
}

type WaveOpts = { W: number; centre: number; freq: number; phase: number; amp: number; ink: string; shade: string; thick?: number; scramble?: number; frame: number; seed: number };

/** One sine wave across the screen, pinned to `centre`, so a crest always sits on its needle. */
function drawWave(c: CanvasRenderingContext2D, o: WaveOpts) {
  const { W, centre, freq, phase, amp, ink, shade, thick = 1, scramble = 0, frame, seed } = o;
  const cu = xOf(centre, W) / (W - 1);
  let prev: number | null = null;
  for (let x = 0; x < W; x++) {
    const u = x / (W - 1);
    const env = 0.32 + 0.68 * Math.exp(-(((u - cu) / 0.2) ** 2));
    let y = MID - amp * env * Math.cos(TAU * freq * 0.5 * (u - cu) * 2 + phase);
    if (scramble > 0) {
      y += (hash(Math.floor(x / 3), frame + seed) - 0.5) * 2 * scramble * 24;
      if (scramble > 0.4 && hash(x, frame * 3 + seed) < 0.1 * scramble) { prev = null; continue; }
    }
    y = Math.max(1, Math.min(SCREEN - 3, Math.round(y)));
    const top = prev == null ? y : Math.min(prev, y), bottom = prev == null ? y : Math.max(prev, y);
    rect(c, x, top + thick, 1, bottom - top + 1, shade);
    rect(c, x, top, 1, bottom - top + thick, ink);
    prev = y;
  }
}

function drawNeedle(c: CanvasRenderingContext2D, W: number, pos: number, hot: boolean) {
  const x = xOf(pos, W);
  rect(c, x + 1, 0, 1, SCREEN, INK.needleDim);
  rect(c, x, 0, 1, SCREEN + 2, hot ? "#ffd9c9" : INK.needle);
  // The tuner slider riding the strip.
  rect(c, x - 3, SCREEN + 1, 7, 11, "#000");
  rect(c, x - 2, SCREEN + 1, 5, 10, hot ? "#ffe9a8" : "#e8e2d0");
  rect(c, x - 2, SCREEN + 8, 5, 3, "#8d8672");
  rect(c, x, SCREEN + 2, 1, 7, INK.needle);
  rect(c, x - 1, SCREEN + 12, 3, 1, "#000");
  rect(c, x, SCREEN + 13, 1, 1, "#000");
}

function drawTargetFlag(c: CanvasRenderingContext2D, W: number, pos: number) {
  const x = xOf(pos, W);
  for (let y = 0; y < SCREEN; y += 2) rect(c, x, y, 1, 1, INK.flag);
  rect(c, x, 1, 6, 4, "#000");
  rect(c, x, 1, 5, 3, INK.flag);
  rect(c, x, SCREEN + 13, 1, 3, INK.flag);
}

/** The bullseye: pixels thrown out from the two waves as they lock, with a white flash and a lingering sparkle. */
function drawBurst(c: CanvasRenderingContext2D, W: number, ox: number, age: number) {
  if (age < 150) { c.globalAlpha = age < 75 ? 0.75 : 0.35; rect(c, 0, 0, W, SCREEN, "#fbfff0"); c.globalAlpha = 1; }
  const inks = ["#fbfff0", "#ffd23f", "#5dffb0", "#ff5d9e", "#ffb347"];
  if (age < 1400) for (let i = 0; i < 90; i++) {
    const a = (i / 90) * TAU + hash(i, 1), speed = 0.03 + hash(i, 2) * 0.1;
    const x = ox + Math.cos(a) * speed * age * 1.25, y = MID + Math.sin(a) * speed * age * 0.75 + (age * age) * 0.000012;
    if (y >= SCREEN - 1 || x < 0 || x >= W || hash(i, 3) * 1400 < age) continue;
    rect(c, x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1, inks[i % inks.length]!);
  }
  for (let i = 0; i < 2; i++) { const r = age * (0.09 + i * 0.05); if (r < W) { rect(c, ox - r, MID - 24 + i * 48, 3, 1, "#ffd23f"); rect(c, ox + r, MID - 24 + i * 48, 3, 1, "#ffd23f"); } }
  for (let i = 0; i < 12; i++) if ((age + i * 170) % 900 < 180) rect(c, W * hash(i, 5), 3 + (SCREEN - 8) * hash(i, 6), 1, 1, "#fbfff0");
}

/** Close or near: a small shower from the needle. */
function drawSparks(c: CanvasRenderingContext2D, ox: number, age: number, n: number) {
  if (age > 700) return;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU, d = age * 0.035;
    rect(c, ox + Math.cos(a) * d * 1.3, MID + Math.sin(a) * d, 1, 1, i % 2 ? "#ffd23f" : "#fbfff0");
  }
}

/** A miss: the line goes flat and dark, spits a few sad sparks, and static creeps back. */
function drawFizzle(c: CanvasRenderingContext2D, W: number, frame: number, age: number) {
  rect(c, 0, MID, W, 1, "#000");
  for (let x = 0; x < W; x++) {
    const gone = hash(Math.floor(x / 5), Math.floor(frame / 9)) < Math.min(0.4, age / 8000);
    if (!gone) rect(c, x, MID + (hash(Math.floor(x / 11), 8) > 0.72 ? 1 : 0), 1, 1, age < 400 && frame % 4 < 2 ? "#c7e8d8" : "#8fc0ac");
  }
  if (age > 3600) return;
  for (let i = 0; i < 14; i++) {
    const cycle = (age + i * 263) % 800, x = W * hash(i, 9 + Math.floor((age + i * 263) / 800));
    rect(c, x, MID + 1 + cycle * cycle * 0.00005, 1, 1, cycle < 300 ? "#ffb347" : "#7a4a12");
  }
}

function makeNoise() {
  return [0, 1, 2, 3].map((n) => makeLayer(128, 64, (c) => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const v = hash(x + n * 131, y + n * 17);
      if (v < 0.34) rect(c, x, y, 1, 1, v < 0.05 ? "#e8fff4" : v < 0.18 ? "#4fa58a" : "#1f5a4a");
    }
  }));
}

/** Static from `from` to the right edge of the glass. */
function drawStatic(c: CanvasRenderingContext2D, W: number, noise: HTMLCanvasElement[], frame: number, from: number, alpha: number) {
  if (alpha <= 0 || from >= W) return;
  const tile = noise[frame % noise.length]!;
  c.save();
  c.beginPath();
  c.rect(from, 0, W - from, SCREEN);
  c.clip();
  c.globalAlpha = alpha;
  const dx = Math.floor(hash(frame, 1) * 128), dy = Math.floor(hash(frame, 2) * 64);
  for (let y = -dy; y < SCREEN; y += 64) for (let x = -dx; x < W; x += 128) c.drawImage(tile, x, y);
  c.restore();
}

export type SignalPhase = "clue" | "tune" | "reveal";

/**
 * The signal scope. `target` is -1 for a seat that may not see it, and nothing about the hidden spot is drawn then.
 * Pass `onMove` to let this seat drag the marker; `points` is the round's result, once the phase is `reveal`.
 */
export function SignalCanvas({ marker, target, phase, points, left, right, onMove, onRelease, overlay }: {
  marker: number; target: number; phase: SignalPhase; points: Points | null; left: string; right: string;
  onMove?: (pos: number) => void; onRelease?: () => void; overlay?: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ marker, target, phase, points, dragging: false, canMove: !!onMove });
  useEffect(() => { live.current = { ...live.current, marker, target, phase, points, canMove: !!onMove }; });
  const repaint = useRef<() => void>(() => {});
  const cbs = useRef({ onMove, onRelease });
  useEffect(() => { cbs.current = { onMove, onRelease }; });
  const sent = useRef<number | null>(null);

  useEffect(() => {
    const box = boxRef.current, canvas = canvasRef.current, ctx = canvas?.getContext("2d");
    if (!box || !canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const noise = makeNoise();
    const pacer = createPacer();
    let W = TARGET_W, back: HTMLCanvasElement | null = null, scan: HTMLCanvasElement | null = null;
    let raf = 0, frame = 0, shown = live.current.marker, boost = 0, lastT = 0, revealStart: number | null = null, phaseSeen = live.current.phase;

    const paint = (now: number) => {
      if (!back || !scan) return;
      const s = live.current;
      const dt = Math.min(100, now - lastT);
      lastT = now;
      if (still) shown = s.marker;
      else if (s.dragging || s.phase === "reveal" && revealStart === null) shown = s.marker;
      else shown += (s.marker - shown) * (1 - Math.exp(-dt / 70));
      boost = s.dragging ? 1 : Math.max(0, boost - dt / 500);
      if (s.phase !== phaseSeen) { phaseSeen = s.phase; revealStart = s.phase === "reveal" ? now : null; }
      else if (s.phase === "reveal" && revealStart === null) revealStart = now;
      const t = still ? 0 : now;
      frame = still ? 0 : Math.floor(now / 50);
      const showTarget = s.target >= 0;
      const pts = s.points ?? 0;

      ctx.drawImage(back, 0, 0);

      if (s.phase === "reveal" && showTarget) {
        const r = still ? revealAt(1e6, pts) : revealAt(now - (revealStart ?? now), pts);
        const wipeX = Math.round(r.wipe * W);
        drawBands(ctx, W, s.target, r.bands, true);
        drawTicks(ctx, W);
        const freqM = freqOf(s.marker), phaseM = t / 420;
        const freqT = lerp(freqOf(s.target), freqM, r.lock), phaseT = lerp(t / 300 + 2, phaseM, r.lock);
        const centreT = lerp(s.target, s.marker, r.lock);
        const merged = r.lock > 0.985;
        const glow = merged && !still ? 2 + Math.round(Math.sin(now / 160)) : 2;
        if (r.flat < 1) {
          const amp = AMP * (1 - r.flat);
          if (merged) {
            drawWave(ctx, { W, centre: s.marker, freq: freqM, phase: phaseM, amp: amp + 3, ink: "#176b52", shade: "#0c3a2e", thick: glow + 2, frame, seed: 5 });
            drawWave(ctx, { W, centre: s.marker, freq: freqM, phase: phaseM, amp: amp + 3, ink: INK.hot, shade: INK.calm, thick: 2, frame, seed: 5 });
          } else {
            drawWave(ctx, { W, centre: centreT, freq: freqT, phase: phaseT, amp, ink: r.scramble > 0.25 ? INK.scram : INK.gold, shade: r.scramble > 0.25 ? INK.scramDim : INK.goldDim, scramble: r.scramble, frame, seed: 2 });
            drawWave(ctx, { W, centre: s.marker, freq: freqM, phase: phaseM, amp, ink: INK.calm, shade: INK.calmDim, frame, seed: 1 });
          }
        }
        if (r.flat > 0) drawFizzle(ctx, W, frame, still ? 1000 : r.age);
        if (r.bands > 0.3) drawTargetFlag(ctx, W, s.target);
        drawNeedle(ctx, W, s.marker, merged);
        if (!still && r.outcome) {
          const ox = xOf(s.marker, W);
          if (pts === 4) drawBurst(ctx, W, ox, r.age);
          else if (pts === 3) drawSparks(ctx, ox, r.age, 16);
          else if (pts === 2) drawSparks(ctx, ox, r.age, 8);
        }
        // The static clears across the glass, and on a miss it creeps back in.
        if (!still) {
          drawStatic(ctx, W, noise, frame, wipeX, 0.95);
          if (r.wipe < 1) rect(ctx, wipeX, 0, 2, SCREEN, "#e8fff4");
          if (r.flat > 0) drawStatic(ctx, W, noise, frame, 0, 0.18 * r.flat);
        }
      } else {
        // Before the reveal. A seat allowed to see the target (the clue giver) gets it clean; others get scrambled noise
        // that is drawn with no knowledge of where the target is.
        if (showTarget) drawBands(ctx, W, s.target, 1, false);
        drawTicks(ctx, W);
        const tuning = s.phase === "tune";
        if (showTarget) {
          drawWave(ctx, { W, centre: s.target, freq: freqOf(s.target), phase: t / 460, amp: AMP, ink: INK.gold, shade: INK.goldDim, frame, seed: 3 });
          drawTargetFlag(ctx, W, s.target);
        } else if (tuning) {
          drawWave(ctx, { W, centre: 50, freq: 5.5, phase: t / 300, amp: AMP * 0.85, ink: INK.scram, shade: INK.scramDim, scramble: still ? 0.4 : 0.85, frame, seed: 2 });
        }
        if (tuning) {
          drawWave(ctx, { W, centre: shown, freq: freqOf(shown), phase: t / 420, amp: AMP + boost * 3, ink: boost > 0.1 ? "#c8ffe4" : INK.calm, shade: INK.calmDim, thick: boost > 0.5 ? 2 : 1, frame, seed: 1 });
          drawNeedle(ctx, W, shown, s.dragging);
          if (!still) drawStatic(ctx, W, noise, frame, 0, showTarget ? 0.08 : 0.16);
        } else if (!still) {
          drawStatic(ctx, W, noise, frame, 0, showTarget ? 0.14 : 0.7);
        }
      }
      ctx.drawImage(scan, 0, 0);
    };

    const fit = () => {
      const css = box.clientWidth;
      if (!css) return;
      const dpr = window.devicePixelRatio || 1;
      const dev = Math.round(css * dpr);
      const cell = Math.max(1, Math.round(dev / TARGET_W));
      W = Math.max(60, Math.floor(dev / cell));
      canvas.width = W;
      canvas.height = H;
      canvas.style.width = `${(W * cell) / dpr}px`;
      canvas.style.height = `${(H * cell) / dpr}px`;
      ctx.imageSmoothingEnabled = false;
      back = makeLayer(W, H, (c) => drawBack(c, W));
      scan = makeLayer(W, H, (c) => { for (let y = 0; y < SCREEN; y += 2) rect(c, 0, y, W, 1, "rgba(0,0,0,.22)"); });
      paint(performance.now());
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (pacer.shouldDraw(now)) paint(now);
    };
    const start = () => { if (!still && !raf && !document.hidden) { lastT = performance.now(); raf = requestAnimationFrame(loop); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    const onVisible = () => (document.hidden ? stop() : start());
    repaint.current = () => { if (still) paint(performance.now()); };

    const ro = new ResizeObserver(fit);
    ro.observe(box);
    fit();
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
      repaint.current = () => {};
    };
  }, []);

  // With reduced motion there is no loop: redraw when something changes.
  useEffect(() => repaint.current(), [marker, target, phase, points]);

  const emit = (pos: number) => {
    if (pos === sent.current) return;
    sent.current = pos;
    cbs.current.onMove?.(pos);
  };
  const fromPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return posFromPointer(e.clientX, r.left, r.width, MARGIN / e.currentTarget.width);
  };
  const down = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!onMove) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    live.current.dragging = true;
    sent.current = null;
    emit(fromPointer(e));
  };
  const drag = (e: PointerEvent<HTMLCanvasElement>) => { if (live.current.dragging) emit(fromPointer(e)); };
  const up = () => {
    if (!live.current.dragging) return;
    live.current.dragging = false;
    cbs.current.onRelease?.();
  };
  const key = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (!onMove) return;
    const step = e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "PageDown" ? -10 : e.key === "PageUp" ? 10 : null;
    const next = e.key === "Home" ? 0 : e.key === "End" ? 100 : step != null ? clampPos(marker + step) : null;
    if (next == null) return;
    e.preventDefault();
    sent.current = null;
    emit(next);
    cbs.current.onRelease?.();
  };

  const verdict = phase === "reveal" && points != null ? ` Result: ${verdictFor(points)}.` : "";
  const a11y = onMove
    ? { role: "slider", tabIndex: 0, "aria-label": `Signal between ${left} and ${right}`, "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": marker, "aria-valuetext": `${marker} of 100, from ${left} to ${right}` }
    : { role: "img", "aria-label": `Signal scope between ${left} and ${right}. Marker at ${marker} of 100.${target >= 0 ? ` Target at ${target}.` : ""}${verdict}` };

  return (
    <div className="sync-scope" data-phase={phase} data-points={points ?? undefined}>
      <div ref={boxRef} className="sync-glass">
        <canvas ref={canvasRef} width={TARGET_W} height={H} className={`sync-canvas ${onMove ? "live" : ""}`} {...a11y}
          onPointerDown={down} onPointerMove={drag} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onKeyDown={key} />
        {overlay}
      </div>
      <div className="sync-ends">
        <span className="left"><i aria-hidden />{left}</span>
        <span className="right">{right}<i aria-hidden /></span>
      </div>
    </div>
  );
}
