// Pixel-art worlds for the trivia games, drawn in code on a small canvas and scaled up with hard edges.
// Each world has a static backdrop (drawn once and cached), a few moving layers, and "actors" (one per player)
// whose height shows how well they are doing: a climber on a mountain, a balloon over the sea, a rocket into space.

export type Actor = { name: string; value: number };
export type Tier = { label: string; at: number };

export type World = {
  id: "summit" | "sky" | "launch";
  w: number;
  h: number;
  /** Rarity or rank names, from the bottom up, with the fraction of the climb where each starts. */
  tiers: Tier[];
  backdrop: (ctx: CanvasRenderingContext2D) => void;
  frame: (ctx: CanvasRenderingContext2D, t: number, shown: number[], moving: boolean[]) => void;
  /** Where an actor stands at a given fraction of the climb. */
  pos: (f: number, i: number, n: number) => { x: number; y: number };
};

export const ACTOR_COLORS = ["#ff4d6d", "#4cc9f0", "#ffd23f", "#3ddc97", "#fb923c", "#c084fc"];

// ---------- helpers ----------
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const px = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const noise1 = (x: number, seed: number) => { const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453; return n - Math.floor(n); };

/** A vertical gradient made of flat bands joined by ordered dithering, the classic pixel-art sky. */
function ditherSky(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, stops: [number, string][]) {
  const cols = stops.map(([p, c]) => [p, hex(c)] as const);
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    let i = 0;
    while (i < cols.length - 2 && t > cols[i + 1]![0]) i++;
    const [p0, c0] = cols[i]!, [p1, c1] = cols[i + 1]!;
    const f = Math.min(1, Math.max(0, (t - p0) / (p1 - p0)));
    for (let x = 0; x < w; x++) {
      const c = f * 16 > BAYER[y & 3]![x & 3]! + 0.5 ? c1 : c0;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, light = "#ffffff", mid = "#dfe6f5", dark = "#a9b5d6") {
  const r = Math.max(3, Math.round(w / 5));
  const puffs = [[0, 2], [r, 0], [r * 2, -1], [r * 3, 1], [r * 4 - 2, 2]];
  for (const [dx, dy] of puffs) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    if (xx * xx + yy * yy > r * r) continue;
    const c = yy > r / 2 ? dark : yy < -r / 3 ? light : mid;
    px(ctx, x + dx! + xx, y + dy! + yy, c);
  }
  for (let xx = -r; xx < r * 4 + r - 2; xx++) px(ctx, x + xx, y + 2 + r, dark);
}

/** Move a value toward its target a little each frame. */
const ease = (from: number, to: number) => (Math.abs(to - from) < 0.002 ? to : from + (to - from) * 0.14);

// ======================= THE SUMMIT (Jeopardy) =======================
// Rarer clues climb higher. Climbers follow a switchback trail up a snowy peak, past four camps.
const SUMMIT_PEAK = { x: 196, y: 14 };
const TRAIL: [number, number][] = [[118, 112], [160, 103], [132, 92], [178, 80], [150, 68], [190, 55], [168, 43], [200, 32], [186, 24], [196, 15]];
const trailLen = (() => { let L = 0; const out = [0]; for (let i = 1; i < TRAIL.length; i++) { L += Math.hypot(TRAIL[i]![0] - TRAIL[i - 1]![0], TRAIL[i]![1] - TRAIL[i - 1]![1]); out.push(L); } return out; })();
function onTrail(f: number) {
  const target = Math.min(1, Math.max(0, f)) * trailLen[trailLen.length - 1]!;
  let i = 1;
  while (i < trailLen.length - 1 && trailLen[i]! < target) i++;
  const a = TRAIL[i - 1]!, b = TRAIL[i]!, seg = (target - trailLen[i - 1]!) / (trailLen[i]! - trailLen[i - 1]! || 1);
  return { x: a[0] + (b[0] - a[0]) * seg, y: a[1] + (b[1] - a[1]) * seg };
}

const CLIMBER = ["..hhh..", ".hhhhh.", "..sss..", "..s0s..", ".bbbbp.", "bbbbbpp", ".bbbbp.", "..l.l..", "..l.l.."];

export const SUMMIT: World = {
  id: "summit", w: 320, h: 120,
  tiers: [{ label: "BASE CAMP", at: 0 }, { label: "TREELINE", at: 0.25 }, { label: "SNOWLINE", at: 0.5 }, { label: "RIDGE", at: 0.75 }, { label: "SUMMIT", at: 0.98 }],
  backdrop(ctx) {
    ditherSky(ctx, 0, 0, 320, 120, [[0, "#1c2b5c"], [0.35, "#3d63a8"], [0.7, "#8fb6e0"], [1, "#d7e8f5"]]);
    const r = rng(7);
    // far range
    for (let x = 0; x < 320; x++) {
      const h = 62 + Math.sin(x * 0.045) * 8 + Math.sin(x * 0.11 + 1) * 4 + noise1(x, 3) * 2;
      for (let y = Math.round(h); y < 120; y++) px(ctx, x, y, y < h + 5 && h < 62 ? "#e8eef8" : "#6f86b8");
    }
    // the big peak, lit from the left
    for (let x = 0; x < 320; x++) {
      const d = Math.abs(x - SUMMIT_PEAK.x);
      const ridge = SUMMIT_PEAK.y + d * (x < SUMMIT_PEAK.x ? 0.9 : 0.75) + noise1(x, 9) * 3 + Math.sin(x * 0.3) * 1.5;
      for (let y = Math.max(0, Math.round(ridge)); y < 120; y++) {
        const lit = x < SUMMIT_PEAK.x - (y - ridge) * 0.15;
        const snowLine = 46 + noise1(x, 11) * 8 + Math.sin(x * 0.2) * 3;
        let c = lit ? "#7f8fa8" : "#55607a";
        if (y < snowLine) c = lit ? "#ffffff" : "#c9d6ea";
        else if ((x * 7 + y * 13) % 17 === 0) c = lit ? "#6b7a93" : "#465068";
        px(ctx, x, y, c);
      }
    }
    // the trail
    for (let i = 1; i < TRAIL.length; i++) {
      const [x0, y0] = TRAIL[i - 1]!, [x1, y1] = TRAIL[i]!;
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k < n; k += 2) px(ctx, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, "#3c3550");
    }
    // pine forest and foreground slope
    for (let x = 0; x < 320; x++) {
      const g = 104 + Math.sin(x * 0.05) * 4 + noise1(x, 5) * 2;
      for (let y = Math.round(g); y < 120; y++) px(ctx, x, y, y < g + 2 ? "#4f8a5b" : "#2e5a3f");
    }
    for (let i = 0; i < 46; i++) {
      const x = Math.round(r() * 320), base = 104 + Math.sin(x * 0.05) * 4, h = 6 + Math.round(r() * 7);
      if (Math.abs(x - 150) < 40 && r() < 0.6) continue;
      for (let k = 0; k < h; k++) { const half = Math.floor((k * 3) / h) + (k > h - 2 ? 0 : 0); for (let dx = -half; dx <= half; dx++) px(ctx, x + dx, base - h + k + 2, k % 3 === 0 ? "#2f6b45" : "#1f4e33"); }
      px(ctx, x, base + 2, "#4a3324", 1, 2);
    }
    // camps: a flag at each tier
    for (const [i, f] of [0.25, 0.5, 0.75].entries()) {
      const p = onTrail(f);
      px(ctx, p.x + 4, p.y - 7, "#3c3550", 1, 7);
      px(ctx, p.x + 5, p.y - 7, ["#ffd23f", "#4cc9f0", "#c084fc"][i]!, 4, 3);
    }
    px(ctx, SUMMIT_PEAK.x, SUMMIT_PEAK.y - 10, "#3c3550", 1, 10);
    px(ctx, SUMMIT_PEAK.x + 1, SUMMIT_PEAK.y - 10, "#ff4d6d", 6, 4);
  },
  frame(ctx, t, shown, moving) {
    // drifting clouds and a few birds
    for (let i = 0; i < 4; i++) {
      const w = 22 + i * 6, speed = 0.08 + i * 0.03;
      const x = ((t * speed + i * 97) % (360 + w)) - w, y = 12 + i * 11;
      cloud(ctx, x, y, w);
    }
    for (let i = 0; i < 3; i++) { const bx = ((t * 0.5 + i * 40) % 360) - 20, by = 30 + i * 4 + Math.sin(t / 6 + i) * 2; px(ctx, bx, by, "#24304f", 2, 1); px(ctx, bx + 3, by, "#24304f", 2, 1); px(ctx, bx + 2, by + 1, "#24304f"); }
    // blowing snow near the top
    for (let i = 0; i < 18; i++) px(ctx, (noise1(i, 1) * 320 + t * 1.6) % 320, (noise1(i, 2) * 50 + t * 0.4 + i * 3) % 60, "#ffffff");
    shown.forEach((v, i) => {
      const p = onTrail(v);
      const hop = moving[i] ? Math.abs(Math.sin(t * 0.9 + i)) * 2 : 0;
      drawSprite(ctx, CLIMBER, { h: ACTOR_COLORS[i % 6]!, s: "#ffd9b0", 0: "#1a1033", b: "#2b2d42", p: "#8a5a2b", l: "#1a1033" }, p.x - 7 + i * 8 - (shown.length - 1) * 4, p.y - 18 - hop, 2);
    });
  },
  pos: (f) => onTrail(f),
};

// ======================= SKY HIGH (Family Feud) =======================
// The most popular answers lift a hot-air balloon from the waves to the stars, over a dusk sea.
const BALLOON = ["...cccccc...", "..cCCccCCc..", ".cCCccccCCc.", "cCCcccccCCcc", "cCCccccccCCc", "cCCccccccCCc", ".cCCccccCCc.", "..cCCccCCc..", "...cccccc...", "....r..r....", "....r..r....", "....bbbb....", "....bbbb...."];
export const SKY: World = {
  id: "sky", w: 320, h: 120,
  tiers: [{ label: "GROUNDED", at: 0 }, { label: "ROOFTOPS", at: 0.2 }, { label: "TREETOPS", at: 0.4 }, { label: "CLOUDS", at: 0.6 }, { label: "SKY HIGH", at: 0.8 }],
  backdrop(ctx) {
    ditherSky(ctx, 0, 0, 320, 88, [[0, "#0b0f2e"], [0.4, "#2b2463"], [0.75, "#9a4a7a"], [1, "#f29b6c"]]);
    // moon and stars
    const r = rng(3);
    for (let i = 0; i < 70; i++) { const x = r() * 320, y = r() * 50; px(ctx, x, y, r() > 0.8 ? "#ffffff" : "#b9b4e8"); }
    for (let yy = -7; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++) if (xx * xx + yy * yy <= 49) px(ctx, 250 + xx, 22 + yy, (xx + 2) * (xx + 2) + (yy - 1) * (yy - 1) < 6 ? "#d9d3b8" : "#f7f0d6");
    // distant islands and a lighthouse
    for (let x = 0; x < 320; x++) {
      const h = 84 - Math.max(0, Math.sin(x * 0.03 + 0.5) * 7) - Math.max(0, Math.sin(x * 0.08 + 2) * 3);
      for (let y = Math.round(h); y < 88; y++) px(ctx, x, y, "#3a2a55");
    }
    px(ctx, 44, 70, "#e9e3f5", 3, 12); px(ctx, 44, 74, "#ff4d6d", 3, 2); px(ctx, 43, 68, "#3a2a55", 5, 2);
    // the sea
    ditherSky(ctx, 0, 88, 320, 32, [[0, "#3a3f8f"], [0.5, "#1f2a66"], [1, "#0d1438"]]);
    // little boats
    for (const bx of [92, 210, 286]) { px(ctx, bx, 86, "#2a1d3d", 9, 2); px(ctx, bx + 1, 88, "#2a1d3d", 7, 1); px(ctx, bx + 4, 79, "#e9e3f5", 1, 7); px(ctx, bx + 5, 80, "#e9e3f5", 3, 5); }
  },
  frame(ctx, t, shown, moving) {
    // shimmering water and the moon's reflection
    for (let y = 89; y < 120; y += 2) {
      const off = Math.sin(t / 5 + y) * 3;
      for (let x = ((y * 7) % 23) - 23 + off; x < 320; x += 23) px(ctx, x, y, "#5560b0", 6, 1);
      px(ctx, 246 + Math.sin(t / 4 + y) * 2, y, "#f7f0d6", 6 + ((y + Math.floor(t / 3)) % 4), 1);
    }
    // twinkles
    for (let i = 0; i < 10; i++) if ((t + i * 5) % 30 < 3) px(ctx, noise1(i, 4) * 320, noise1(i, 6) * 46, "#ffffff", 1, 1);
    // slow clouds at the CLOUDS tier
    for (let i = 0; i < 3; i++) { const w = 26 + i * 8; cloud(ctx, ((t * (0.06 + i * 0.02) + i * 120) % (360 + w)) - w, 34 + i * 6, w, "#f6d7e6", "#c99ac0", "#8a6aa0"); }
    shown.forEach((v, i) => {
      const p = SKY.pos(v, i, shown.length);
      const sway = Math.sin(t / 7 + i * 2) * 1.5;
      const col = ACTOR_COLORS[i % 6]!;
      drawSprite(ctx, BALLOON, { c: col, C: "#ffe9a6", r: "#6b4226", b: "#8a5a2b" }, p.x - 12 + sway, p.y - 26 + (moving[i] ? Math.sin(t) : 0), 2);
      if (moving[i] && t % 4 < 2) px(ctx, p.x - 2 + sway, p.y - 9, "#ffb347", 4, 3); // burner flame
    });
  },
  pos: (f, i, n) => ({ x: 120 + (n > 1 ? (i - (n - 1) / 2) * 34 : 0), y: 100 - Math.min(1, Math.max(0, f)) * 70 }),
};

// ======================= LIFTOFF (Costimation) =======================
// The closer the guess, the higher the rocket flies: from the pad, through the sky, past the moon.
const ROCKET = ["...w...", "..www..", "..wBw..", "..www..", ".rwwwr.", ".rwwwr.", "rrwwwrr", "rr.w.rr"];
export const LAUNCH: World = {
  id: "launch", w: 320, h: 120,
  tiers: [{ label: "TOURIST", at: 0 }, { label: "CADET", at: 0.3 }, { label: "ASTRONAUT", at: 0.55 }, { label: "DEEP SPACE", at: 0.8 }, { label: "ONE IN A GALAXY", at: 0.95 }],
  backdrop(ctx) {
    ditherSky(ctx, 0, 0, 320, 120, [[0, "#04030f"], [0.45, "#120c3a"], [0.75, "#3b1d6e"], [0.92, "#c2557a"], [1, "#f6a35b"]]);
    const r = rng(11);
    for (let i = 0; i < 120; i++) { const x = r() * 320, y = r() * 80; px(ctx, x, y, r() > 0.85 ? "#ffffff" : r() > 0.5 ? "#a6b4ff" : "#6b6fb5"); }
    // nebula
    for (let i = 0; i < 400; i++) { const a = r() * Math.PI * 2, d = r() * 26; const x = 70 + Math.cos(a) * d * 1.6, y = 30 + Math.sin(a) * d * 0.7; if ((Math.round(x) + Math.round(y)) % 2) px(ctx, x, y, d < 12 ? "#7a3fa0" : "#3d2370"); }
    // ringed planet
    for (let yy = -11; yy <= 11; yy++) for (let xx = -11; xx <= 11; xx++) if (xx * xx + yy * yy <= 121) px(ctx, 262 + xx, 26 + yy, xx + yy < -4 ? "#ffd8a8" : xx + yy < 6 ? "#e9a46b" : "#a8603e");
    for (let a = 0; a < Math.PI * 2; a += 0.02) { const x = 262 + Math.cos(a) * 20, y = 26 + Math.sin(a) * 4; if (!(Math.sin(a) < 0 && Math.abs(Math.cos(a) * 20) < 11)) px(ctx, x, y, "#f3d9b0"); }
    // moon
    for (let yy = -5; yy <= 5; yy++) for (let xx = -5; xx <= 5; xx++) if (xx * xx + yy * yy <= 25) px(ctx, 30 + xx, 18 + yy, (xx - 1) * (xx - 1) + yy * yy < 4 ? "#b9b6c8" : "#e7e5f0");
    // the Earth's curve with city lights, and the launch pad
    for (let x = 0; x < 320; x++) {
      const y0 = 108 + Math.pow((x - 160) / 160, 2) * 10;
      px(ctx, x, y0 - 1, "#7fd0ff");
      for (let y = Math.round(y0); y < 120; y++) px(ctx, x, y, y < y0 + 2 ? "#2d6ea8" : "#16304f");
      if (r() < 0.12) px(ctx, x, y0 + 3 + r() * 6, "#ffd36b");
    }
    px(ctx, 210, 88, "#5a5a74", 3, 22); for (let y = 88; y < 110; y += 4) px(ctx, 213, y, "#5a5a74", 5, 1);
    px(ctx, 96, 106, "#4a4a62", 136, 3);
  },
  frame(ctx, t, shown, moving) {
    for (let i = 0; i < 14; i++) if ((t + i * 7) % 26 < 2) px(ctx, noise1(i, 8) * 320, noise1(i, 9) * 70, "#ffffff");
    // a satellite crossing
    const sx = ((t * 0.7) % 380) - 30; px(ctx, sx, 52, "#9ca3af", 4, 2); px(ctx, sx - 3, 52, "#4cc9f0", 3, 1); px(ctx, sx + 4, 52, "#4cc9f0", 3, 1); if (t % 10 < 5) px(ctx, sx + 1, 51, "#ff4d6d");
    shown.forEach((v, i) => {
      const p = LAUNCH.pos(v, i, shown.length);
      if (moving[i] || v > 0.01) {
        for (let k = 0; k < 6; k++) px(ctx, p.x - 2 + noise1(k + t, i) * 4, p.y + 16 + k * 2, `rgba(255,${210 - k * 25},90,${(moving[i] ? 0.9 : 0.45) - k * 0.12})`, 3 - Math.floor(k / 3), 2);
        if (moving[i]) for (let k = 0; k < 4; k++) px(ctx, p.x - 5 + noise1(k * 3 + t, i) * 10, p.y + 26 + k * 3, "rgba(200,200,220,0.35)", 3, 3);
      }
      drawSprite(ctx, ROCKET, { w: "#f1f1f8", B: "#4cc9f0", r: ACTOR_COLORS[i % 6]! }, p.x - 7, p.y, 2);
    });
  },
  pos: (f, i, n) => ({ x: 152 + (n > 1 ? (i - (n - 1) / 2) * 30 : 0), y: 90 - Math.min(1, Math.max(0, f)) * 84 }),
};

export const WORLDS = { summit: SUMMIT, sky: SKY, launch: LAUNCH };

/** Draws a sprite; `scale` 2 makes each sprite pixel a 2x2 block so players stand out from the scenery. */
export function drawSprite(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, x: number, y: number, scale = 1) {
  rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) { const c = pal[row[rx]!]; if (c) px(ctx, x + rx * scale, y + ry * scale, c, scale, scale); } });
}

/** Which tier a fraction of the climb falls in. */
export function tierAt(world: World, f: number): Tier {
  let out = world.tiers[0]!;
  for (const t of world.tiers) if (f >= t.at) out = t;
  return out;
}

export const easeToward = ease;
