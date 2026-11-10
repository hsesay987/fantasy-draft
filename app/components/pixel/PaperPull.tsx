"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sprite } from "./Sprite";
import type { Sprite as SpriteData } from "./sprites";
import { TW_COLORS as C, twType } from "./worlds";

// Head to head: one long strip of paper runs out of the left machine's carriage, over the top and down into the right
// one's. Each word won winds it a step into the winner's machine; the red mark printed on it is the score.
const H = 52, BENCH = 37;
/** The narrowest scene that still holds both machines and the strip; below this a whole scale steps down. */
const MIN_SCENE = 120;
/** How far each machine may stand from the centre at most, and the top run of the strip. */
const MAX_DX = 54, STRIP_TOP = 3, STRIP_H = 10, FEED = 5;
/** Where the machines stand in a scene `w` wide (a narrow bench brings them in), and how far the mark may travel. */
const layout = (w: number) => { const dx = Math.min(MAX_DX, Math.floor(w / 2) - 18); return { dx, reach: dx - 9 }; };
/** The largest whole scale at which the scene is at least MIN_SCENE wide (and at most 3), so every pixel is square. */
export function pullScale(avail: number): number {
  return Math.max(1, Math.min(3, Math.floor(avail / MIN_SCENE), avail >= 144 * 3 ? 3 : 2));
}
const MOVE_MS = 460, DING_MS = 900;
/** The right-hand machine is an oxblood one, so the two sides read apart at a glance. */
const OX = { o0: "#2e1210", o1: "#5c2219", o2: "#8a3a2a", o3: "#b8634a", o4: "#e29a7c" };
const SEAFOAM = { o0: C.en0, o1: C.en1, o2: C.en2, o3: C.en3, o4: C.en4 };
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const dith = (x: number, y: number, f: number) => f * 16 > BAYER[y & 3]![x & 3]! + 0.5;
const px = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const ease = (q: number) => (q >= 1 ? 1 : 1 - (1 - q) ** 3);

/** The shop wall, a brass tab rack along it with one notch a step, and the bench. Nothing here moves. */
function backdrop(ctx: CanvasRenderingContext2D, w: number, cx: number, lead: number, step: number) {
  for (let y = 0; y < BENCH; y++) for (let x = 0; x < w; x++) {
    const f = Math.max(0, 1 - Math.hypot((x - cx) / 1.6, y + 8) / 90) * 2;
    const band = Math.floor(f);
    const ramp = [C.wall, C.wall2, C.wall3];
    px(ctx, x, y, ramp[Math.min(2, band + (dith(x, y, f - band) ? 1 : 0))]!);
    if (x % 6 === 2 && y % 6 === 2) px(ctx, x, y, C.peg);
  }
  // The rack under the strip: a notch a step, the middle one tall, a red one at each end where the game is won.
  const rx = cx - lead * step, ry = STRIP_TOP + STRIP_H + 4;
  px(ctx, rx - 2, ry, C.brass0, lead * step * 2 + 5, 3); px(ctx, rx - 2, ry, C.brass2, lead * step * 2 + 5, 1); px(ctx, rx - 2, ry + 1, C.brass1, lead * step * 2 + 5, 1);
  for (let k = -lead; k <= lead; k++) {
    const x = cx + k * step;
    const end = Math.abs(k) === lead;
    px(ctx, x, ry - (k === 0 ? 3 : end ? 3 : 1), end ? C.red : k === 0 ? C.brass3 : C.brass1, 1, k === 0 || end ? 3 : 1);
    if (end) px(ctx, x - 1, ry - 3, C.red, 3, 1);
  }
  [rx - 2, rx + lead * step * 2 + 2].forEach((x) => px(ctx, x, ry + 1, C.steel0));
  // Bench.
  for (let y = BENCH; y < H; y++) for (let x = 0; x < w; x++) {
    const plank = y < 45 ? 0 : 1;
    let c = (x * 7 + plank * 13 + (y >> 1) * 3) % 23 < 3 ? C.wood1 : C.wood2;
    if (dith(x, y, (y - BENCH) / 30)) c = C.wood1;
    px(ctx, x, y, c);
  }
  px(ctx, 0, BENCH, C.wood4, w, 1); px(ctx, 0, BENCH + 1, C.wood3, w, 1);
  px(ctx, 0, 45, C.wood0, w, 1); px(ctx, 0, 46, C.wood3, w, 1);
  px(ctx, 0, H - 2, C.wood0, w, 2);
}

/** A little portable seen from the front: the platen, the keys, its bell. `dx` jogs the carriage, `turn` rolls the platen. */
function machine(ctx: CanvasRenderingContext2D, mx: number, e: typeof SEAFOAM, dx: number, turn: number, bell: number, bellOnRight: boolean) {
  // Shadow on the bench.
  for (let x = mx - 17; x < mx + 17; x++) for (let y = 41; y < 44; y++) if (dith(x, y, 0.9 - (y - 41) * 0.3)) px(ctx, x, y, C.wood0);
  // Body: a squat trapezoid in enamel, lit from the top left.
  for (let y = 27; y < 42; y++) {
    const h = 12 + Math.round((y - 27) * 0.27);
    for (let x = mx - h; x < mx + h; x++) {
      const edge = Math.min(x - (mx - h), mx + h - 1 - x);
      let c = dith(x, y, Math.max(0, (y - 31) / 12) * 0.85) ? e.o1 : e.o2;
      if (y === 27) c = e.o3;
      if (edge === 0) c = e.o0; else if (edge === 1) c = x < mx ? e.o3 : e.o1;
      if (y === 41) c = e.o0;
      px(ctx, x, y, c);
    }
    px(ctx, mx - h - 1, y, C.ink); px(ctx, mx + h, y, C.ink);
  }
  px(ctx, mx - 12, 26, C.ink, 24, 1);
  // Keyboard: two staggered rows of round-topped keys in a dark well, one socket in each row bare where a vowel came off.
  px(ctx, mx - 10, 30, e.o0, 20, 9); px(ctx, mx - 10, 38, e.o3, 20, 1);
  [[31, 0, 2], [34, 1, 4]].forEach(([y, off, bare]) => {
    for (let k = 0; k < 6; k++) {
      const x = mx - 9 + off! + k * 3;
      if (k === bare) { px(ctx, x, y! + 1, C.rub0, 2, 1); continue; }
      px(ctx, x, y!, C.steel3, 2, 1); px(ctx, x, y! + 1, C.steel1, 2, 1);
    }
  });
  px(ctx, mx - 5, 37, C.steel2, 10, 1); // space bar
  px(ctx, mx - 3, 40, C.brass2, 6, 1); // maker's plate
  // Feet.
  [mx - 13, mx + 9].forEach((x) => px(ctx, x, 42, C.rub0, 4, 1));
  // Carriage: the platen with its ridges rolling, knobs, the chrome bail.
  const x0 = mx - 14 + dx;
  // A rubber cylinder: a sheen along the top, a groove that rolls round as the paper winds, dark underneath.
  px(ctx, x0, 21, C.rub2, 28, 1);
  for (let r = 0; r < 3; r++) px(ctx, x0, 22 + r, (r + turn) % 3 === 0 ? C.rub0 : C.rub1, 28, 1);
  px(ctx, x0, 25, C.rub0, 28, 1);
  px(ctx, x0 + 1, 22, C.steel1, 26, 1);
  // Chrome knobs on the ends.
  [x0 - 3, x0 + 28].forEach((x) => { px(ctx, x, 21, C.steel1, 3, 5); px(ctx, x, 21, C.steel3, 3, 1); px(ctx, x + 1, 22, C.steel2, 1, 3); });
  px(ctx, mx - 11 + dx, 20, C.steel3, 22, 1); px(ctx, mx - 11 + dx, 21, C.steel1, 22, 1);
  px(ctx, mx - 13 + dx, 26, e.o0, 26, 1);
  // The bell, on the outer corner. It rings when this side wins.
  const bx = bellOnRight ? mx + 11 : mx - 14, by = 28;
  px(ctx, bx, by, bell ? C.brass3 : C.brass1, 3, 2); px(ctx, bx + 1, by - 1, bell ? C.brass3 : C.brass2, 1, 1); px(ctx, bx, by + 2, C.brass0, 3, 1);
  if (bell) {
    const s = bellOnRight ? 1 : -1, ox = bellOnRight ? bx + 4 : bx - 2;
    for (let k = 0; k < 3; k++) px(ctx, ox + s * k, by - 1 - k, k === 1 ? C.brass3 : C.paper3);
    px(ctx, ox, by + 1, C.paper3); px(ctx, ox + s * 2, by + 2, C.brass3);
  }
}

/**
 * The strip of paper. `shift` is how far it has been wound towards the left machine, in scene pixels: its type and ruled
 * lines slide with it, and the red mark printed on it sits at `cx - shift`.
 */
function strip(ctx: CanvasRenderingContext2D, cx: number, dx: number, shift: number) {
  const lx = cx - dx, rx = cx + dx;
  const top = STRIP_TOP, bot = STRIP_TOP + STRIP_H;
  // The two legs, feeding down into each carriage, and the top run between them, with rounded outer corners.
  const sheet = (x: number, y: number, w: number, h: number) => px(ctx, x, y, C.paper2, w, h);
  sheet(lx - FEED, top + 2, FEED * 2, 21 - top - 2);
  sheet(rx - FEED, top + 2, FEED * 2, 21 - top - 2);
  sheet(lx - FEED + 2, top, rx - lx + FEED * 2 - 4, STRIP_H);
  sheet(lx - FEED + 1, top + 1, 1, 1); sheet(rx + FEED - 2, top + 1, 1, 1);
  // Shading: the top edge catches the light, the inside of each bend is in shadow, the legs darken towards the platen.
  px(ctx, lx - FEED + 2, top, C.paper3, rx - lx + FEED * 2 - 4, 1);
  px(ctx, lx + FEED, bot, C.paper0, rx - lx - FEED * 2, 1);
  for (const x0 of [lx - FEED, rx - FEED]) for (let y = bot; y < 21; y++) for (let x = x0; x < x0 + FEED * 2; x++) if (dith(x, y, (y - bot) / 14)) px(ctx, x, y, C.paper1);
  // Outline.
  px(ctx, lx - FEED + 2, top - 1, C.ink, rx - lx + FEED * 2 - 4, 1);
  px(ctx, lx - FEED + 1, top, C.ink); px(ctx, rx + FEED - 2, top, C.ink);
  px(ctx, lx - FEED - 1, top + 2, C.ink, 1, 21 - top - 2); px(ctx, rx + FEED, top + 2, C.ink, 1, 21 - top - 2);
  px(ctx, lx - FEED, top + 1, C.ink); px(ctx, rx + FEED - 1, top + 1, C.ink);
  px(ctx, lx + FEED, bot, C.ink, 1, 21 - bot); px(ctx, rx - FEED - 1, bot, C.ink, 1, 21 - bot);
  px(ctx, lx + FEED, bot, C.ink, rx - lx - FEED * 2, 1);

  // Faint old typing along the run, sliding with the paper, so you can see it move.
  ctx.save();
  ctx.beginPath(); ctx.rect(lx - FEED + 2, top + 1, rx - lx + FEED * 2 - 4, STRIP_H - 2); ctx.clip();
  const text = "VWLPLY", gap = 6, span = text.length * gap + 10;
  const o = ((-shift % span) + span) % span;
  for (let x = lx - FEED - span + o; x < rx + FEED; x += span) [...text].forEach((ch, i) => twType(ctx, ch, "small", Math.round(x + i * gap), top + 2, C.paper0));
  ctx.restore();
  // Ruled lines on the legs, sliding down into whichever machine is winning the paper.
  const lines = (x0: number, dir: number) => {
    const off = (((dir * shift) % 4) + 4) % 4;
    for (let y = bot + 1 + off; y < 21; y += 4) px(ctx, x0 + 1, Math.round(y), C.paper0, FEED * 2 - 2, 1);
  };
  lines(lx - FEED, 1); lines(rx - FEED, -1);

  // The mark: a red rule across the strip with a tab on top, the one thing that tells you who is winning.
  const mx = Math.round(cx - shift);
  px(ctx, mx - 1, top - 3, C.redDk, 3, 2); px(ctx, mx - 1, top - 3, C.red, 3, 1); px(ctx, mx, top - 1, C.red, 1, 1);
  px(ctx, mx - 1, top, C.red, 3, STRIP_H); px(ctx, mx + 1, top, C.redDk, 1, STRIP_H);
  px(ctx, mx - 1, top + STRIP_H, C.ink, 3, 1);
}

/**
 * Head to head as a sheet of paper pulled between two typewriters. `rope` is how many words `left` is ahead (negative:
 * `right` is), and `lead` is how far ahead wins. Each change winds the strip one step into the machine that pulled it, and
 * at the lead that machine's bell rings. Pixel art at a whole scale at every width: a wider box widens the bench, a narrower
 * one brings the machines in, and below that the scale steps down rather than stretching.
 */
export function PaperPull({ rope, lead, left, right, sprites }: { rope: number; lead: number; left: string; right: string; sprites?: [SpriteData, SpriteData] }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ w: number; scale: number; pad: number }>({ w: 144, scale: 2, pad: 0 });
  const at = Math.max(-lead, Math.min(lead, rope));
  const props = useRef({ at, lead });
  useLayoutEffect(() => { props.current = { at, lead }; });
  /** Paints now, and keeps animating for as long as something moves (the strip winding, the bell ringing). */
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth;
      const scale = pullScale(avail);
      const w = Math.floor(avail / scale);
      // Centred on a whole CSS pixel, so the scene's pixels land square on the screen's.
      const pad = Math.floor((avail - w * scale) / 2);
      setSize((o) => (o.w === w && o.scale === scale && o.pad === pad ? o : { w, scale, pad }));
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
    const cx = Math.floor(size.w / 2);
    const { dx, reach } = layout(size.w);
    const stepOf = (l: number) => Math.max(1, Math.floor(reach / Math.max(1, l)));
    let back: HTMLCanvasElement | null = null, backLead = -1;
    // Where the strip is drawn from and to, and when the move began. A strip that mounts mid-game starts where it is.
    const st = { from: props.current.at, to: props.current.at, moveAt: -1e9, dingAt: -1e9 };

    /** Draws one frame; true while there is still motion to show. */
    const paint = (now: number): boolean => {
      const p = props.current;
      const step = stepOf(p.lead);
      if (!back || backLead !== p.lead) {
        back = document.createElement("canvas");
        back.width = size.w; back.height = H;
        backdrop(back.getContext("2d")!, size.w, cx, p.lead, step);
        backLead = p.lead;
      }
      if (p.at !== st.to) {
        const q = ease((now - st.moveAt) / MOVE_MS);
        st.from = st.from + (st.to - st.from) * q;
        st.to = p.at;
        st.moveAt = now;
        if (Math.abs(p.at) >= p.lead) st.dingAt = now + MOVE_MS;
      }
      const q = still ? 1 : ease((now - st.moveAt) / MOVE_MS);
      const pos = st.from + (st.to - st.from) * q;
      const moving = q < 1;
      const pulling = st.to > st.from ? -1 : 1; // -1: the left machine is winding it in
      const won = Math.abs(st.to) >= p.lead ? (st.to > 0 ? -1 : 1) : 0;
      const ringing = won !== 0 && (still || now >= st.dingAt);
      const ding = (side: number) => (ringing && won === side ? (still ? 1 : Math.floor((now - st.dingAt) / 90) % 2 === 0 || now - st.dingAt > DING_MS ? 1 : 0) : 0);
      const jog = (side: number) => (moving && pulling === side ? (Math.floor(now / 50) % 2 ? side : 0) : 0);
      const shift = pos * step;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, size.w, H);
      ctx.drawImage(back, 0, 0);
      strip(ctx, cx, dx, shift);
      machine(ctx, cx - dx, SEAFOAM, jog(-1), Math.floor(((shift % 3) + 3) % 3), ding(-1), false);
      machine(ctx, cx + dx, OX, jog(1), Math.floor(((-shift % 3) + 3) % 3), ding(1), true);
      return !still && (moving || (won !== 0 && now < st.dingAt + DING_MS));
    };

    // Idle, nothing runs: a frame loop starts on a change and stops once the strip has settled and the bell is quiet.
    // With reduced motion each change paints once, already in place.
    let raf = 0, last = 0;
    const loop = (now: number) => {
      raf = 0;
      if (now - last >= 30) { last = now; if (!paint(now)) return; }
      raf = requestAnimationFrame(loop);
    };
    wake.current = () => {
      // Painted at once, so the strip shows even before the first frame (or in a tab the browser isn't animating).
      if (paint(performance.now()) && !raf) raf = requestAnimationFrame(loop);
    };
    wake.current();
    return () => { if (raf) cancelAnimationFrame(raf); wake.current = () => {}; };
  }, [size]);

  useEffect(() => { wake.current(); }, [at, lead]);

  const ahead = at === 0 ? "Level" : `${at > 0 ? left : right} +${Math.abs(at)}`;
  const label = Math.abs(at) >= lead ? `${at > 0 ? left : right} pulled the paper in, ${lead} ahead.` : `${at === 0 ? "Level" : `${at > 0 ? left : right} ahead by ${Math.abs(at)}`}. ${lead} ahead wins.`;
  return (
    <div className="vp-pull">
      <div ref={box} className="vp-machine">
        <canvas ref={canvas} width={size.w} height={H}
          style={{ width: size.w * size.scale, height: H * size.scale, marginLeft: size.pad, marginRight: 0 }}
          role="img" aria-label={label} />
      </div>
      <div className="ends">
        <span className="l">{sprites && <Sprite sprite={sprites[0]} size={16} />}<span className="nm">{left}</span></span>
        <span className={`lead ${at === 0 ? "" : at > 0 ? "to-l" : "to-r"}`} aria-hidden>{ahead}</span>
        <span className="r"><span className="nm">{right}</span>{sprites && <Sprite sprite={sprites[1]} size={16} />}</span>
      </div>
    </div>
  );
}
