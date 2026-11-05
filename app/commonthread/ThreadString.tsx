"use client";

import { useEffect, useRef, type RefObject } from "react";

/** One canvas pixel is this many screen pixels, so the string has the same hard blocks as the rest of the art. */
const CELL = 3;
const DRAW_MS = 340;
const COLORS = { red: "#c9202b", redHi: "#f4574c", gold: "#f2b84b", goldHi: "#fff0b8", shade: "rgba(30,10,5,.45)", pinDark: "#6d0f16", pin: "#e62e38", pinHi: "#ffc4b4" };

type Pt = { x: number; y: number };

/**
 * The red string, laid over the board from each pinned clue to the next. A new length runs out from the last pin before
 * its card drops in (the card's CSS delay matches DRAW_MS). With reduced motion it is simply there, and it stays still.
 * `slots` must be the board's card slots, in clue order; they hold their place even before a clue is pinned to them.
 */
export function ThreadString({ board, slots, count, solved }: { board: RefObject<HTMLElement | null>; slots: RefObject<(HTMLElement | null)[]>; count: number; solved: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const want = useRef({ count, solved });
  want.current = { count, solved };
  const repaint = useRef<(() => void) | null>(null);

  useEffect(() => {
    const c = ref.current, ctx = c?.getContext("2d"), host = board.current;
    if (!c || !ctx || !host) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let drawn = want.current.count - 1; // a resumed run starts with its string already up
    let raf = 0, last = 0, tick = 0;

    // The slot, not the card: the slot ignores the card's drop animation, so the pin waits at the card's final place.
    const pinOf = (el: HTMLElement): Pt => {
      const r = el.getBoundingClientRect(), o = host.getBoundingClientRect();
      return { x: Math.round((r.left - o.left + r.width / 2) / CELL), y: Math.round((r.top - o.top + 6) / CELL) };
    };

    const paint = (sway: number) => {
      const w = Math.ceil(host.clientWidth / CELL), h = Math.ceil(host.clientHeight / CELL);
      if (c.width !== w || c.height !== h) {
        c.width = w; c.height = h;
        c.style.width = `${w * CELL}px`; c.style.height = `${h * CELL}px`;
      }
      ctx.clearRect(0, 0, w, h);
      const els = slots.current ?? [];
      const pins = els.flatMap((el) => (el ? [pinOf(el)] : []));
      const dot = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); };
      const { solved: gold } = want.current;
      const main = gold ? COLORS.gold : COLORS.red, hi = gold ? COLORS.goldHi : COLORS.redHi;
      for (let i = 0; i < Math.min(pins.length - 1, Math.ceil(drawn)); i++) {
        const a = pins[i]!, b = pins[i + 1]!;
        const part = Math.min(1, drawn - i);
        const down = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
        // Across a row the string hangs slack. Down a row it swings out past the card and back, clear of the name.
        const out = down ? (els[i]!.getBoundingClientRect().width / CELL) * 0.67 + 3 : 0;
        const slack = down ? 0 : 3 + (i % 2) + sway;
        const steps = Math.ceil((Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + out) * 1.5);
        for (let k = 0; k <= steps * part; k++) {
          const u = k / steps, v = 1 - u, c1 = 3 * v * v * u, c2 = 3 * v * u * u, ends = v * v * v, ende = u * u * u;
          const x = ends * a.x + c1 * (a.x + out) + c2 * (b.x + out) + ende * b.x;
          const y = ends * a.y + c1 * (a.y + slack) + c2 * (b.y + slack) + ende * b.y;
          dot(x, y + 1, COLORS.shade);
          dot(x, y, Math.floor(k / 2) % 3 === 0 ? hi : main);
        }
      }
      pins.slice(0, Math.floor(drawn) + 1).forEach((p) => {
        ctx.fillStyle = COLORS.shade; ctx.fillRect(p.x, p.y, 3, 3);
        ctx.fillStyle = COLORS.pinDark; ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
        ctx.fillStyle = COLORS.pin; ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
        ctx.fillStyle = COLORS.pinHi; ctx.fillRect(p.x - 1, p.y - 1, 1, 1);
      });
    };

    if (still) {
      const once = () => { drawn = want.current.count - 1; paint(0); };
      once();
      repaint.current = once;
      const ro = new ResizeObserver(once);
      ro.observe(host);
      return () => { repaint.current = null; ro.disconnect(); };
    }

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const goal = want.current.count - 1;
      const running = drawn < goal;
      if (document.hidden || now - last < (running ? 30 : 110)) return;
      const dt = last ? Math.min(100, now - last) : 16;
      last = now; tick++;
      if (running) drawn = Math.min(goal, drawn + dt / (goal - drawn > 1 ? DRAW_MS / 3 : DRAW_MS));
      else drawn = goal;
      paint(Math.round(Math.sin(tick / 14)));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [board, slots]);

  // With reduced motion there is no loop, so a new clue or a win has to ask for its own repaint.
  useEffect(() => { repaint.current?.(); }, [count, solved]);

  return <canvas ref={ref} className="ct-string" width={1} height={1} aria-hidden />;
}
