"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TW_COLORS as C, TW_H, TW_LOOSE, TW_MIN_W, TW_PAPER, twCarriage, twKey, twLooseKey, twPaper, twStatic, twType } from "./worlds";
import { layoutName, layoutPuzzle, PAPER_TEXT_W, type Placed, type Sheet } from "./typewriterLayout";
import type { TypeSize } from "./sprites";

const SLIDE_MS = 150, TYPE_IN_MS = 26, KEY_GAP_MS = 80, KEY_FLIGHT_MS = 260, LAND_FLASH_MS = 240, STRIKE_MS = 520;
const MAX_ECHO = 21;

/** One key's trip from the bench to its slot on the sheet. */
type Flight = { item: Placed; fromX: number; fromY: number; lean: number; bench: number; at: number };
/** How the sheet changes when the name comes out. */
type Reveal = { at: number; from: Sheet; to: Sheet; flights: Flight[]; done: number; plain: Map<Placed, number>; clacked: number };

const seeded = (s: string, i: number) => { let h = 7 + i * 31; for (const c of s) h = (h * 33 + c.charCodeAt(0)) >>> 0; return h; };

function planReveal(puzzle: string, name: string, solved: boolean, at: number): Reveal {
  const to = layoutName(puzzle, name), from = layoutPuzzle(puzzle);
  const used = new Set<number>();
  const flights: Flight[] = [];
  const keys = to.items.filter((i) => i.vowel);
  if (solved) keys.forEach((item, n) => {
    // The first free key with this letter; if the bench has run out of them, the last one with it goes again.
    let bench = TW_LOOSE.findIndex((k, b) => k.ch === item.ch && !used.has(b));
    if (bench < 0) bench = TW_LOOSE.findLastIndex((k) => k.ch === item.ch);
    used.add(bench);
    const k = TW_LOOSE[bench]!;
    flights.push({ item, fromX: k.x, fromY: k.y, lean: k.lean, bench, at: SLIDE_MS * 0.6 + n * KEY_GAP_MS });
  });
  const lastLand = flights.length ? flights[flights.length - 1]!.at + KEY_FLIGHT_MS : SLIDE_MS;
  // What isn't a key (a dropped The, a hyphen, on a miss every letter) is struck in after them.
  const plain = new Map<Placed, number>();
  let n = 0;
  for (const i of to.items) if (i.from === null && !(solved && i.vowel)) plain.set(i, solved ? lastLand : SLIDE_MS + n++ * TYPE_IN_MS);
  return { at, from, to, flights, plain, done: lastLand + LAND_FLASH_MS + 60, clacked: 0 };
}

/**
 * A battered machine on the repair bench. The puzzle is typed on the sheet in the carriage and the machine's vowel keys lie
 * loose on the bench, the same keys whatever the word. When the name comes out, a solved word's keys leap off the bench and
 * snap into their places in the name; a missed one is simply typed in red, and the keys stay where they lie.
 *
 * Drawn in whole scene pixels at a whole scale, widening the shop rather than stretching it. `typed` echoes the player's
 * line on the sheet, bumping `miss` strikes that line out, and `onClack` fires as each key lands.
 */
export function Typewriter({ puzzle, name, solved, typed = "", miss = 0, onClack }: { puzzle: string; name: string | null; solved: boolean; typed?: string; miss?: number; onClack?: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; scale: number; fluid: boolean }>({ w: TW_MIN_W, scale: 2, fluid: true });
  // The drawing loop reads the latest props from here, so it never has to restart (and lose its animation) when they change.
  const props = useRef({ puzzle, name, solved, typed, miss, onClack });
  useLayoutEffect(() => { props.current = { puzzle, name, solved, typed, miss, onClack }; });
  const draw = useRef<(now: number) => void>(() => {});

  // Whole-pixel scale: two scene pixels a CSS pixel on a phone, three on anything wide enough. Below 288px it has to stretch.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth;
      const scale = avail >= TW_MIN_W * 3 ? 3 : 2;
      const fluid = avail < TW_MIN_W * 2;
      const w = fluid ? TW_MIN_W : Math.floor(avail / scale);
      setSize((o) => (o.w === w && o.scale === scale && o.fluid === fluid ? o : { w, scale, fluid }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const back = document.createElement("canvas");
    back.width = size.w; back.height = TW_H;
    twStatic(back.getContext("2d")!, size.w);
    const cx = Math.floor(size.w / 2);
    const textLeft = cx - PAPER_TEXT_W / 2;

    // What has been animated so far. A machine that mounts with the name already out shows it at rest.
    const st = { puzzle: "", puzzleAt: 0, name: null as string | null, reveal: null as Reveal | null, typed: "", keyAt: -1e9, keyCh: "", miss: props.current.miss, strikeAt: -1e9, strikeText: "" };

    const sparks: { x: number; y: number; vx: number; vy: number; at: number; c: string }[] = [];
    const paint = (now: number) => {
      const p = props.current;
      // Prop changes are picked up here so a single loop owns all the timing.
      if (p.puzzle !== st.puzzle || p.name !== st.name) {
        const fresh = p.puzzle !== st.puzzle;
        const first = st.puzzle === "";
        if (fresh) { st.puzzleAt = first && p.name ? -1e9 : now; st.reveal = null; }
        st.puzzle = p.puzzle;
        st.name = p.name;
        st.reveal = p.name ? planReveal(p.puzzle, p.name, p.solved, first ? now - 1e6 : now) : null;
        if (st.reveal && first) st.reveal.clacked = st.reveal.flights.length;
      }
      if (p.miss !== st.miss) { st.miss = p.miss; st.strikeAt = now; st.strikeText = p.typed; }
      if (p.typed !== st.typed) {
        if (p.typed.length > st.typed.length) { st.keyAt = now; st.keyCh = p.typed.slice(-1).toUpperCase(); }
        st.typed = p.typed;
      }

      const r = st.reveal;
      const age = r ? (still ? 1e6 : now - r.at) : 1e9;
      const strikeAge = now - st.strikeAt;
      const shake = !still && strikeAge < 280 ? (Math.floor(strikeAge / 35) % 2 ? 2 : -2) : 0;

      // Keys landing: the clack, and the whole machine jolting a pixel.
      let jolt = 0;
      if (r) {
        for (const f of r.flights) {
          const since = age - (f.at + KEY_FLIGHT_MS);
          if (since >= 0 && since < 70) jolt = 1;
        }
        const landed = r.flights.filter((f) => age >= f.at + KEY_FLIGHT_MS).length;
        if (landed > r.clacked) {
          for (let n = r.clacked; n < landed; n++) {
            const f = r.flights[n]!;
            if (!still) {
              const lx = textLeft + f.item.x + 3, ly = TW_PAPER.textTop + f.item.y + 3;
              for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                sparks.push({ x: lx, y: ly, vx: Math.cos(a) * 0.05, vy: Math.sin(a) * 0.05, at: now, c: k % 2 ? C.brass2 : C.steel3 });
              }
            }
          }
          r.clacked = landed;
          props.current.onClack?.();
        }
      }
      const typingNudge = !still && now - st.keyAt < 60 ? 1 : 0;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size.w, TW_H);
      ctx.drawImage(back, shake, jolt);
      ctx.translate(shake, jolt);

      // Loose keys on the bench, less any that have already left.
      const gone = new Set<number>();
      if (r) for (const f of r.flights) if (age >= f.at) gone.add(f.bench);
      TW_LOOSE.forEach((k, b) => { if (!gone.has(b)) twLooseKey(ctx, k.ch, cx + k.x, k.y, k.lean); });

      // The key just typed goes down, and its type bar comes up.
      if (!still && now - st.keyAt < 90 && st.keyCh) {
        twKey(ctx, st.keyCh, cx, 1);
        ctx.fillStyle = C.steel3; ctx.fillRect(cx, 47, 1, 2);
      }

      twPaper(ctx, cx, typingNudge);
      const ink = (ch: string, sz: TypeSize, x: number, y: number, color: string, i: number) => {
        // An old machine: the odd letter sits a pixel low.
        const low = sz !== "big" && seeded(ch, i) % 7 === 0 ? 1 : 0;
        twType(ctx, ch, sz, textLeft + typingNudge + x, TW_PAPER.textTop + y + low, color);
      };

      if (!r) {
        const sheet = layoutPuzzle(st.puzzle);
        const shown = still ? sheet.items.length : Math.floor((now - st.puzzleAt) / TYPE_IN_MS) + 1;
        sheet.items.slice(0, shown).forEach((it, i) => ink(it.ch, sheet.size, it.x, it.y, C.ink, i));
        // The player's line.
        const echo = p.typed.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").slice(-MAX_ECHO);
        const lineLeft = cx - 63;
        [...echo].forEach((ch, i) => twType(ctx, ch, "small", lineLeft + typingNudge + i * 6, TW_PAPER.typedY, "#4b4453"));
        const strike = strikeAge < STRIKE_MS ? st.strikeText.slice(-MAX_ECHO) : "";
        [...strike].forEach((_, i) => twType(ctx, "X", "small", lineLeft + i * 6, TW_PAPER.typedY, C.red));
        if (!strike && echo.length < MAX_ECHO && Math.floor(now / 500) % 2 === 0) { ctx.fillStyle = C.red; ctx.fillRect(lineLeft + echo.length * 6, TW_PAPER.typedY + 7, 5, 1); }
      } else {
        const u = Math.min(1, age / SLIDE_MS);
        const isSolved = p.solved;
        r.to.items.forEach((it, i) => {
          if (it.from !== null) {
            const a = r.from.items[it.from]!;
            const x = Math.round(a.x + (it.x - a.x) * u), y = Math.round(a.y + (it.y - a.y) * u);
            ink(it.ch, r.to.size, x, y, C.ink, i);
            return;
          }
          const flight = r.flights.find((f) => f.item === it);
          if (flight) {
            const since = age - (flight.at + KEY_FLIGHT_MS);
            if (since < 0) return;
            // Landed: a brass block behind the letter stays up for the rest of the reveal, so you can see what came back.
            const g = r.to.size === "big" ? [16, 20] : r.to.size === "mid" ? [8, 11] : [6, 8];
            ctx.fillStyle = since < LAND_FLASH_MS && !still && Math.floor(since / 60) % 2 === 0 ? C.brass3 : C.brass2;
            ctx.fillRect(textLeft + it.x, TW_PAPER.textTop + it.y - 1, g[0]! - 1, g[1]!);
            ink(it.ch, r.to.size, it.x, it.y, C.ink, i);
            return;
          }
          const at = r.plain.get(it);
          if (at !== undefined && age >= at) ink(it.ch, r.to.size, it.x, it.y, isSolved ? C.ink : C.red, i);
        });
      }

      twCarriage(ctx, cx, typingNudge);

      // Keys in the air go over everything, on a short steep arc.
      if (r) for (const f of r.flights) {
        const q = (age - f.at) / KEY_FLIGHT_MS;
        if (q < 0 || q >= 1) continue;
        const e = q * q * (3 - 2 * q);
        const sx = cx + f.fromX, sy = f.fromY, tx = textLeft + f.item.x - 1, ty = TW_PAPER.textTop + f.item.y - 1;
        const x = Math.round(sx + (tx - sx) * e), y = Math.round(sy + (ty - sy) * e - Math.sin(q * Math.PI) * 12);
        twLooseKey(ctx, f.item.ch, x, y, q < 0.5 ? f.lean : 0, false);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const sp = sparks[i]!, a = now - sp.at;
        if (a > 240) { sparks.splice(i, 1); continue; }
        ctx.fillStyle = sp.c;
        ctx.fillRect(Math.round(sp.x + sp.vx * a), Math.round(sp.y + sp.vy * a), 1, 1);
      }
    };
    draw.current = paint;

    if (still) { paint(performance.now()); return; }
    let raf = 0, last = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < 30) return;
      last = now;
      paint(now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // With reduced motion nothing loops, so each change paints once; a struck-out line also has to come back afterwards.
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    draw.current(performance.now());
    const id = setTimeout(() => draw.current(performance.now()), STRIKE_MS + 20);
    return () => clearTimeout(id);
  }, [puzzle, name, solved, typed, miss, size]);

  const letters = [...puzzle].join(" ");
  return (
    <div ref={box} className="vp-machine" style={{ ["--tw-scale" as string]: size.scale }}>
      <canvas ref={canvas} width={size.w} height={TW_H}
        style={size.fluid ? { width: "100%", height: "auto" } : { width: size.w * size.scale, height: TW_H * size.scale }}
        role="img" aria-label={name ? `On the sheet: ${name}` : `On the sheet, the letters ${letters}`} />
    </div>
  );
}
