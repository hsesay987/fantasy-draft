// Pixel-art worlds for the trivia games, drawn in code and scaled up with hard edges.
// Each world is a big map (a tall mountain, a tall sky, a long trip through the solar system). A camera shows one
// window of it and follows the leading player, so every step of progress is a visible climb or flight.
// Named checkpoints mark the way; crossing one is a moment the game celebrates.
import { LADDER, LEDGES, RUNGS } from "../../toprung/engine";
import { LOOSE_KEY_PAL, LOOSE_KEY_ROWS, legendGlyph, typeGlyph } from "./sprites";

/** `value` is the fraction of the journey: 0 at the start, 1 at the end, below 0 for worlds with an underground. */
export type Actor = { name: string; value: number; color?: string };
export type Checkpoint = { name: string; at: number };

export type World = {
  id: "summit" | "sky" | "launch" | "hall" | "ball" | "studio" | "board" | "arcade" | "ladder" | "typewriter" | "noirNight" | "noirDawn" | "noirDay" | "noirDusk";
  /** Size of the whole map. */
  fullW: number;
  fullH: number;
  /** Size of the window the camera shows. */
  viewW: number;
  viewH: number;
  checkpoints: Checkpoint[];
  /** Named places below the start, for scores under zero (`at` is negative). */
  below?: Checkpoint[];
  backdrop: (ctx: CanvasRenderingContext2D) => void;
  /** Moving things, in map coordinates. `cam` is the camera's top-left corner; `colors` is each player's color. */
  frame: (ctx: CanvasRenderingContext2D, t: number, shown: number[], moving: boolean[], cam: { x: number; y: number }, colors: string[]) => void;
  /** Where an actor is at a given fraction of the journey, in map coordinates. */
  pos: (f: number, i: number, n: number) => { x: number; y: number };
  /** Top-left of the camera window when it centres on a point, kept inside the map. */
  camera: (p: { x: number; y: number }) => { x: number; y: number };
};

export const ACTOR_COLORS = ["#ff4d6d", "#4cc9f0", "#ffd23f", "#3ddc97", "#fb923c", "#c084fc"];
/** A player's color, fixed by their seat so it stays the same on every screen (game, results, flag). */
export const playerColor = (players: string[], name: string) => ACTOR_COLORS[Math.max(0, players.indexOf(name)) % ACTOR_COLORS.length]!;

// ---------- helpers ----------
const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const px = (ctx: CanvasRenderingContext2D, x: number, y: number, c: string, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}
const noise1 = (x: number, seed: number) => { const n = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453; return n - Math.floor(n); };
/** Smooth 2D value noise in 0..1, for natural rock and grass texture. */
function noise2(x: number, y: number, seed: number) {
  const h = (i: number, j: number) => noise1(i * 57 + j * 131, seed);
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
  const b = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
  return a + (b - a) * v;
}
const disc = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, shade: (dx: number, dy: number) => string) => {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) px(ctx, cx + x, cy + y, shade(x, y));
};

/** A vertical gradient made of flat bands joined by ordered dithering, the classic pixel-art sky. */
function ditherSky(ctx: CanvasRenderingContext2D, x0: number, y0: number, w: number, h: number, stops: [number, string][]) {
  const cols = stops.map(([p, c]) => [p, hex(c)] as const);
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    let i = 0;
    while (i < cols.length - 2 && t > cols[i + 1]![0]) i++;
    const [p0, c0] = cols[i]!, [p1, c1] = cols[i + 1]!;
    const f = clamp((t - p0) / (p1 - p0), 0, 1);
    for (let x = 0; x < w; x++) {
      const c = f * 16 > BAYER[y & 3]![x & 3]! + 0.5 ? c1 : c0;
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, light = "#ffffff", mid = "#dfe6f5", dark = "#a9b5d6") {
  const r = Math.max(3, Math.round(w / 5));
  for (const [dx, dy] of [[0, 2], [r, 0], [r * 2, -1], [r * 3, 1], [r * 4 - 2, 2]]) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
    if (xx * xx + yy * yy > r * r) continue;
    px(ctx, x + dx! + xx, y + dy! + yy, yy > r / 2 ? dark : yy < -r / 3 ? light : mid);
  }
}

/** Points spaced along a polyline, so an actor can walk it at an even pace. */
function pathOf(points: [number, number][]) {
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]));
  const total = lens[lens.length - 1]!;
  return (f: number) => {
    const target = clamp(f, 0, 1) * total;
    let i = 1;
    while (i < lens.length - 1 && lens[i]! < target) i++;
    const a = points[i - 1]!, b = points[i]!, seg = (target - lens[i - 1]!) / (lens[i]! - lens[i - 1]! || 1);
    return { x: a[0] + (b[0] - a[0]) * seg, y: a[1] + (b[1] - a[1]) * seg };
  };
}

export const easeToward = (from: number, to: number) => (Math.abs(to - from) < 0.0015 ? to : from + (to - from) * 0.1);

/** Draws a sprite; `scale` makes each sprite pixel a bigger block. */
export function drawSprite(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, x: number, y: number, scale = 1) {
  rows.forEach((row, ry) => { for (let rx = 0; rx < row.length; rx++) { const c = pal[row[rx]!]; if (c) px(ctx, x + rx * scale, y + ry * scale, c, scale, scale); } });
}

// ======================= SUMMIT: a mountain with a long switchback trail, and a cave under it =======================
// Above ground, a lake, a waterfall and pine forest at the foot, a glacier and snowfields higher up, a dawn sky behind.
// Below the trailhead, a ladder drops into caves: a score under zero sends the climber underground, down to Rock Bottom.
const S_W = 320, S_H = 600, PEAK = { x: 168, y: 34 }, GROUND = 512;
const halfWidth = (y: number) => (y - PEAK.y) * 0.4 + 6;
const TRAIL_POINTS: [number, number][] = (() => {
  const pts: [number, number][] = [[64, 506]];
  const legs = 18;
  for (let k = 1; k <= legs; k++) {
    const y = 500 - (k / legs) * (500 - PEAK.y - 6);
    const side = k % 2 ? 1 : -1;
    pts.push([k === legs ? PEAK.x : PEAK.x + side * halfWidth(y) * 0.55, y]);
  }
  pts.push([PEAK.x, PEAK.y - 2]);
  return pts;
})();
const summitPath = pathOf(TRAIL_POINTS);
const CAVE_POINTS: [number, number][] = [[64, 506], [64, 516], [64, 548], [104, 558], [150, 566], [196, 576], [246, 586]];
const cavePath = pathOf(CAVE_POINTS);
const CLIMBER = ["..h..", ".hhh.", ".sss.", "bbbbp", ".bbbp", ".l.l."];
const LAKE = { x: 262, y: 492, rx: 44, ry: 9 };
const FALLS = { x: 252, top: 372, bottom: 484 };

export const SUMMIT: World = {
  id: "summit", fullW: S_W, fullH: S_H, viewW: 320, viewH: 150,
  checkpoints: [
    { name: "Trailhead", at: 0 }, { name: "Pine Hollow", at: 0.12 }, { name: "Fox Bridge", at: 0.25 }, { name: "Eagle Rock", at: 0.38 },
    { name: "Misty Ledge", at: 0.5 }, { name: "Frost Hut", at: 0.62 }, { name: "Ice Wall", at: 0.75 }, { name: "Cloud Gate", at: 0.88 }, { name: "Summit", at: 1 },
  ],
  below: [{ name: "Cave Mouth", at: -0.001 }, { name: "Glow Caves", at: -0.4 }, { name: "Rock Bottom", at: -0.85 }],
  backdrop(ctx) {
    // a dawn sky: night at the top, a warm glow on the horizon
    ditherSky(ctx, 0, 0, S_W, GROUND, [[0, "#0b1035"], [0.18, "#1d2f6b"], [0.36, "#4a6fb5"], [0.48, "#9fbfe4"], [0.56, "#f6d2b0"], [0.62, "#f4a98c"], [1, "#e88f7c"]]);
    const r = rng(7);
    for (let i = 0; i < 80; i++) px(ctx, r() * S_W, r() * 120, r() > 0.75 ? "#ffffff" : "#9fb0e0");
    disc(ctx, 40, 292, 13, (x, y) => (x * x + y * y > 100 ? "#ffd9a0" : "#fff3d6")); // the rising sun behind the far ranges
    // three far ranges, paler with distance, each with its own snow line
    const ranges: [number, number, string, string, number][] = [[262, 0.035, "#b9a7c9", "#efe6f2", 271], [288, 0.05, "#8c86b4", "#e4e2f2", 296], [318, 0.07, "#5d6a9c", "#d5dcef", 324]];
    for (const [base, freq, rock, snow, line] of ranges) {
      for (let x = 0; x < S_W; x++) {
        const h = base + Math.sin(x * freq) * 18 + Math.sin(x * freq * 3.1 + 1) * 7 + noise1(x, base) * 2;
        for (let y = Math.round(h); y < GROUND; y++) px(ctx, x, y, y < line && y < h + 5 ? snow : rock);
      }
    }
    // the great peak, lit from the left, with a jagged ridge, rock bands, snowfields, a glacier and crevasses
    for (let y = PEAK.y; y < GROUND; y++) {
      const hw = halfWidth(y) + noise1(y, 9) * 4 + Math.sin(y * 0.09) * 3;
      const ridge = PEAK.x + Math.sin(y * 0.05) * 6 + noise1(y, 4) * 2;
      for (let x = Math.floor(PEAK.x - hw); x <= Math.ceil(PEAK.x + hw); x++) {
        if (x < 0 || x >= S_W) continue;
        const lit = x < ridge;
        const edge = Math.min(x - (PEAK.x - hw), PEAK.x + hw - x); // distance from the mountain's outline
        const snowLine = 230 + noise1(x, 11) * 22 + Math.sin(x * 0.17) * 10 + (noise2(x / 9, y / 9, 2) - 0.5) * 30;
        const grassLine = 390 + (noise2(x / 14, y / 10, 6) - 0.5) * 60;
        const n = noise2(x / 7, y / 5, 1) * 0.7 + noise2(x / 2.5, y / 2.5, 3) * 0.3; // rock texture
        const strata = Math.sin((y + x * (lit ? 0.45 : -0.45)) * 0.32 + noise2(x / 12, y / 12, 4) * 4);
        let c: string;
        if (y < snowLine) {
          c = lit ? (n > 0.62 ? "#e3eaf6" : "#ffffff") : n > 0.6 ? "#a9b9d8" : "#c7d4ea";
          if (!lit && x > ridge + 8 && x < ridge + 26 && y > 110) c = n > 0.55 ? "#8fb2e2" : "#a9c6ec"; // glacier tongue
          if (n < 0.22 && y > 60) c = lit ? "#6d7c96" : "#444d66"; // rock poking through the snow
        } else if (y > grassLine && n > 0.35) {
          c = lit ? (n > 0.7 ? "#7cae6a" : "#5f9a5c") : n > 0.7 ? "#4f7f55" : "#3f6a4a"; // alpine meadow on the lower slopes
        } else {
          const rock = lit ? ["#5e6a85", "#76839f", "#8e9bb5", "#a5b0c6"] : ["#363d55", "#454d68", "#58617c", "#69728c"];
          c = rock[Math.min(3, Math.floor(n * 4.2))]!;
          if (strata > 0.86) c = lit ? "#4f5a73" : "#2d3349"; // tilted rock bands
          if (y < snowLine + 16 && noise2(x / 3, y / 2, 8) > 0.68) c = lit ? "#e8eef8" : "#aab8d4"; // snow caught in the cracks
        }
        if (Math.abs(x - ridge) < 1 && y < snowLine) c = "#fffbe6"; // sunlit ridge
        if (edge < 1.5 && y < snowLine) c = lit ? "#f4f8ff" : "#8ea0c4"; // rim light on the outline
        px(ctx, x, y, c);
      }
    }
    // the waterfall's cliff, then the falls themselves are animated in `frame`
    for (let y = FALLS.top - 4; y < FALLS.bottom; y++) {
      const half = 4 + Math.round(noise1(y, 12) * 2) + Math.round((y - FALLS.top) / 40);
      px(ctx, FALLS.x - half, y, "#2d3349", half * 2, 1); // the dark wet rock behind the falls
      px(ctx, FALLS.x - half - 1, y, "#58617c"); px(ctx, FALLS.x + half, y, "#58617c");
    }
    for (let y = -3; y <= 3; y++) for (let x = -9; x <= 9; x++) if (x * x / 81 + y * y / 9 <= 1) px(ctx, FALLS.x + x, FALLS.bottom + y, y < 0 ? "#bfe3ff" : "#6f93c8"); // plunge pool
    // forest band and meadow at the foot
    for (let x = 0; x < S_W; x++) {
      const g = 466 + Math.sin(x * 0.05) * 6 + noise1(x, 5) * 3;
      for (let y = Math.round(g); y < GROUND; y++) px(ctx, x, y, y < g + 2 ? "#7cc06f" : y < g + 18 ? "#4f8f52" : "#3c7445");
    }
    for (let i = 0; i < 70; i++) px(ctx, r() * S_W, 478 + r() * 30, ["#ffd23f", "#ff8fb1", "#ffffff", "#c084fc"][i % 4]!); // wildflowers
    // the lake, mirroring the sky and the peak
    for (let y = -LAKE.ry; y <= LAKE.ry; y++) for (let x = -LAKE.rx; x <= LAKE.rx; x++) {
      if ((x * x) / (LAKE.rx * LAKE.rx) + (y * y) / (LAKE.ry * LAKE.ry) > 1) continue;
      const edge = (x * x) / (LAKE.rx * LAKE.rx) + (y * y) / (LAKE.ry * LAKE.ry) > 0.8;
      px(ctx, LAKE.x + x, LAKE.y + y, edge ? "#d8c79a" : y < -3 ? "#9fbfe4" : y < 2 ? "#6f93c8" : "#4a6fb5");
    }
    // pines on the lower slopes, bigger and darker nearer the foot
    for (let i = 0; i < 150; i++) {
      const x = Math.round(r() * S_W), base = 360 + r() * 140, h = 4 + Math.round(((base - 360) / 140) * 6 + r() * 4);
      if (Math.abs(x - PEAK.x) < halfWidth(base) * 0.32 || ((x - LAKE.x) ** 2) / 2500 + ((base - LAKE.y) ** 2) / 200 < 1.4) continue;
      const dark = base > 440 ? "#1f4e33" : "#2b5a4a", light = base > 440 ? "#2f6b45" : "#3d7563";
      for (let k = 0; k < h; k++) { const half = Math.floor((k * 3) / h); for (let dx = -half; dx <= half; dx++) px(ctx, x + dx, base - h + k, k % 3 === 0 || dx < 0 ? light : dark); }
      if (base > 400 && base < 430) px(ctx, x, base - h, "#ffffff"); // snow on the higher trees
      px(ctx, x, base, "#4a3324", 1, 2);
    }
    // the trailhead cabin and its signpost
    px(ctx, 36, 496, "#7a4a2a", 18, 10); for (let k = 0; k < 6; k++) px(ctx, 34 + k, 495 - k, "#b23a48", 22 - k * 2, 1);
    px(ctx, 41, 499, "#ffd23f", 3, 3); px(ctx, 48, 500, "#3a2416", 3, 6); px(ctx, 50, 486, "#5a4535", 2, 6);
    px(ctx, 74, 496, "#5a4535", 1, 10); px(ctx, 70, 496, "#c9a46b", 10, 3);
    // the trail: a worn path a few pixels wide, painted in passes (shadow, verge, tread), dirt low down and trodden
    // snow up high, with pebbles along the edge and log steps on the steepest legs
    const trail: { x: number; y: number; k: number }[] = [];
    for (let i = 1; i < TRAIL_POINTS.length; i++) {
      const [x0, y0] = TRAIL_POINTS[i - 1]!, [x1, y1] = TRAIL_POINTS[i]!;
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2);
      for (let k = 0; k < n; k++) trail.push({ x: x0 + ((x1 - x0) * k) / n, y: y0 + ((y1 - y0) * k) / n, k: trail.length });
    }
    const snowy = (y: number) => y < 236;
    for (const p of trail) px(ctx, p.x - 2, p.y + 1, snowy(p.y) ? "#7d8db0" : "#2b2433", 5, 2);
    for (const p of trail) px(ctx, p.x - 2, p.y - 1, snowy(p.y) ? "#aab6d2" : "#5a4030", 5, 3);
    for (const p of trail) px(ctx, p.x - 1, p.y, snowy(p.y) ? "#eef2fa" : "#b08a5a", 3, 1);
    for (const p of trail) if (p.k % 3 === 0) px(ctx, p.x, p.y - 1, snowy(p.y) ? "#ffffff" : "#c9a46b");
    trail.forEach((p) => {
      if (p.k % 23 === 0) px(ctx, p.x + (p.k % 2 ? 3 : -4), p.y, snowy(p.y) ? "#8a96b5" : "#8a8fa3", 2, 1); // pebbles on the verge
      if (!snowy(p.y) && p.k % 28 === 0) px(ctx, p.x - 2, p.y, "#6b4a2a", 5, 1); // log steps
    });
    // a stone cairn with a pennant at each checkpoint, and an empty pole on the summit for the winner's flag
    SUMMIT.checkpoints.slice(1, -1).forEach((cp) => {
      const p = summitPath(cp.at);
      px(ctx, p.x + 2, p.y - 2, "#8a8fa3", 5, 2); px(ctx, p.x + 3, p.y - 4, "#a7abbd", 3, 2); px(ctx, p.x + 4, p.y - 5, "#c4c8d6", 1, 1);
      px(ctx, p.x + 4, p.y - 11, "#3c3550", 1, 6); px(ctx, p.x + 5, p.y - 11, "#e9e3f5", 3, 2);
    });
    px(ctx, PEAK.x - 3, PEAK.y - 1, "#8a8fa3", 7, 2);

    // ----- underground -----
    ditherSky(ctx, 0, GROUND, S_W, S_H - GROUND, [[0, "#5a3b26"], [0.3, "#3f2a1d"], [0.7, "#2a1c15"], [1, "#1a110d"]]);
    for (let x = 0; x < S_W; x++) px(ctx, x, GROUND, "#2e5a3f", 1, 2); // grass edge
    for (let i = 0; i < 260; i++) { const y = GROUND + 4 + r() * (S_H - GROUND - 4); px(ctx, r() * S_W, y, r() > 0.5 ? "#6b5040" : "#1f1510", 1 + Math.round(r()), 1); }
    for (let i = 0; i < 22; i++) { const x = r() * S_W, len = 3 + r() * 9; for (let k = 0; k < len; k++) px(ctx, x + Math.sin(k * 0.8 + i) * 1.5, GROUND + 2 + k, "#8a6a4a"); } // roots
    for (const [bx, by] of [[150, 530], [286, 548], [30, 580]]) { px(ctx, bx, by, "#e8dcc0", 7, 1); px(ctx, bx - 1, by - 1, "#e8dcc0", 2, 3); px(ctx, bx + 6, by - 1, "#e8dcc0", 2, 3); } // fossil bones
    // the cave tunnel, carved along the climber's way down
    const cave = pathOf(CAVE_POINTS.slice(2));
    for (let k = 0; k <= 200; k++) {
      const p = cave(k / 200);
      for (let dy = -7; dy <= 5; dy++) for (let dx = -6; dx <= 6; dx++) if (dx * dx + dy * dy * 1.4 < 46) px(ctx, p.x + dx, p.y + dy, dx * dx + dy * dy * 1.4 > 34 ? "#4a3326" : "#140d10");
    }
    for (let x = 80; x < 250; x += 9) { const p = cave((x - 64) / 182); px(ctx, x, p.y - 8, "#5a4535", 2, 2 + (x % 3)); } // stalactites
    px(ctx, 58, GROUND - 4, "#140d10", 12, 6); // the hole at the trailhead
    for (let y = GROUND - 2; y < 552; y++) { px(ctx, 61, y, "#a9825a"); px(ctx, 67, y, "#a9825a"); if (y % 4 === 0) px(ctx, 61, y, "#c9a46b", 7, 1); } // ladder
    px(ctx, 80, GROUND - 9, "#5a4535", 1, 9); px(ctx, 76, GROUND - 10, "#ffd23f", 9, 5); px(ctx, 80, GROUND - 9, "#2b2d42", 1, 2); px(ctx, 80, GROUND - 6, "#2b2d42", 1, 1); // a "!" warning sign
    // a lava pool at rock bottom
    for (let x = 226; x < 300; x++) { const top = 594 + Math.round(Math.sin(x * 0.3) * 1); px(ctx, x, top, "#ffb347", 1, S_H - top); }
  },
  frame(ctx, t, shown, moving, cam, colors) {
    // waterfall, mist and ripples on the lake
    for (let y = FALLS.top; y < FALLS.bottom; y++) {
      const c = (y + t * 3) % 6 < 2 ? "#ffffff" : (y + t * 3) % 6 < 4 ? "#bfe3ff" : "#7fbcf0";
      px(ctx, FALLS.x - 2 + Math.round(Math.sin(y * 0.2) * 0.6), y, c, 4, 1);
    }
    for (let k = 0; k < 6; k++) px(ctx, FALLS.x - 4 + noise1(k + t, 3) * 10, FALLS.bottom - 2 + noise1(k * 3 + t, 5) * 4, "#ffffff");
    for (let k = 0; k < 5; k++) { const x = LAKE.x - 30 + ((t * 0.8 + k * 17) % 60); px(ctx, x, LAKE.y - 2 + (k % 3) * 2, "#d7e8f5", 4, 1); }
    // chimney smoke from the cabin
    for (let k = 0; k < 5; k++) { const age = (t * 0.6 + k * 4) % 20; px(ctx, 51 + Math.sin(age * 0.4) * 2 + age * 0.3, 484 - age, age < 10 ? "#d8d8e8" : "#a9a9c0", 2, 2); }
    for (let i = 0; i < 7; i++) {
      const w = 22 + (i % 3) * 8;
      cloud(ctx, ((t * (0.06 + (i % 3) * 0.03) + i * 97) % (S_W + 60)) - 40, 60 + i * 52, w);
    }
    if (cam.y < 300) for (let i = 0; i < 30; i++) px(ctx, (noise1(i, 1) * S_W + t * 1.4) % S_W, cam.y + ((noise1(i, 2) * 150 + t * 0.6 + i * 5) % 150), "#ffffff");
    for (let i = 0; i < 3; i++) { const bx = ((t * 0.5 + i * 40) % 360) - 20, by = 330 + i * 6 + Math.sin(t / 6 + i) * 2; px(ctx, bx, by, "#24304f", 2, 1); px(ctx, bx + 3, by, "#24304f", 2, 1); }
    // underground: glowing crystals, drips and bubbling lava
    if (cam.y + 150 > GROUND) {
      for (let k = 0; k < 9; k++) { const p = cavePath(0.3 + k * 0.08); const on = (t + k * 3) % 12 < 8; px(ctx, p.x + (k % 2 ? 5 : -6), p.y + 3, on ? (k % 2 ? "#c084fc" : "#4cc9f0") : "#5b3d8a", 2, 3); }
      for (let k = 0; k < 4; k++) { const x = 92 + k * 40, age = (t + k * 7) % 16; px(ctx, x, 552 + k * 6 + age, "#7fbcf0"); }
      for (let k = 0; k < 4; k++) if ((t + k * 5) % 10 < 4) px(ctx, 232 + k * 18, 592, "#ffd23f", 2, 2);
    }
    shown.forEach((v, i) => {
      const p = SUMMIT.pos(v, i, shown.length);
      const hop = moving[i] ? Math.abs(Math.sin(t * 1.1 + i)) * 2 : 0;
      if (moving[i] && v >= 0) for (let k = 0; k < 3; k++) px(ctx, p.x - 3 + noise1(k + t, i) * 6, p.y - 1 + noise1(k * 2 + t, i) * 2, "#e8e2d0");
      drawSprite(ctx, CLIMBER, { h: colors[i]!, s: "#ffd9b0", b: "#2b2d42", p: "#8a5a2b", l: "#1a1033" }, p.x - 2 + (i - (shown.length - 1) / 2) * 6, p.y - 6 - hop);
    });
  },
  pos: (f) => (f < 0 ? cavePath(Math.min(1, -f)) : summitPath(f)),
  camera: (p) => ({ x: 0, y: clamp(p.y - 90, 0, S_H - 150) }),
};

// ======================= HOT AIR: a balloon rising from the sea to the edge of space =======================
const H_W = 320, H_H = 460, SEA = 418;
const BALLOON = ["..cccccc..", ".cCCccCCc.", "cCCccccCCc", "cCCccccCCc", "cCCccccCCc", ".cCCccCCc.", "..cCccCc..", "...cCCc...", "....rr....", "....bb...."];
export const SKY: World = {
  id: "sky", fullW: H_W, fullH: H_H, viewW: 320, viewH: 150,
  checkpoints: [
    { name: "Sea Level", at: 0 }, { name: "Lighthouse", at: 0.12 }, { name: "Gull Flight", at: 0.25 }, { name: "Cloud Deck", at: 0.4 },
    { name: "Jet Stream", at: 0.55 }, { name: "Aurora", at: 0.7 }, { name: "Edge of Space", at: 0.85 }, { name: "Moonlight", at: 1 },
  ],
  backdrop(ctx) {
    ditherSky(ctx, 0, 0, H_W, SEA, [[0, "#02020c"], [0.25, "#0b0f2e"], [0.5, "#2b2463"], [0.8, "#9a4a7a"], [1, "#f29b6c"]]);
    const r = rng(3);
    for (let i = 0; i < 170; i++) { const y = r() * 220; px(ctx, r() * H_W, y, r() > 0.8 ? "#ffffff" : "#b9b4e8"); }
    disc(ctx, 250, 30, 12, (x, y) => ((x + 3) * (x + 3) + (y - 2) * (y - 2) < 10 ? "#d9d3b8" : "#f7f0d6"));
    // aurora curtains
    for (let x = 0; x < H_W; x++) {
      const top = 120 + Math.sin(x * 0.05) * 10, len = 18 + Math.sin(x * 0.11) * 8;
      for (let y = top; y < top + len; y++) if ((x + Math.round(y)) % 2 === 0) px(ctx, x, y, y < top + len / 2 ? "#3ddc97" : "#2a8f7a");
    }
    // jet stream lines
    for (let k = 0; k < 6; k++) { const y = 196 + k * 5; for (let x = (k * 37) % 40; x < H_W; x += 60) px(ctx, x, y, "#8aa0e6", 22, 1); }
    // islands, lighthouse, boats and the sea
    for (let x = 0; x < H_W; x++) {
      const h = SEA - 4 - Math.max(0, Math.sin(x * 0.03 + 0.5) * 9) - Math.max(0, Math.sin(x * 0.08 + 2) * 4);
      for (let y = Math.round(h); y < SEA; y++) px(ctx, x, y, "#3a2a55");
    }
    px(ctx, 44, SEA - 34, "#e9e3f5", 4, 26); for (let y = SEA - 30; y < SEA - 8; y += 8) px(ctx, 44, y, "#ff4d6d", 4, 3); px(ctx, 42, SEA - 38, "#3a2a55", 8, 4);
    ditherSky(ctx, 0, SEA, H_W, H_H - SEA, [[0, "#3a3f8f"], [0.5, "#1f2a66"], [1, "#0d1438"]]);
    for (const bx of [96, 214, 282]) { px(ctx, bx, SEA - 2, "#2a1d3d", 10, 2); px(ctx, bx + 4, SEA - 11, "#e9e3f5", 1, 9); px(ctx, bx + 5, SEA - 10, "#e9e3f5", 4, 6); }
  },
  frame(ctx, t, shown, moving, _cam, colors) {
    for (let y = SEA + 2; y < H_H; y += 2) {
      const off = Math.sin(t / 5 + y) * 3;
      for (let x = ((y * 7) % 23) - 23 + off; x < H_W; x += 23) px(ctx, x, y, "#5560b0", 6, 1);
    }
    if (t % 14 < 7) for (let k = 0; k < 18; k++) px(ctx, 48 + k * 3, SEA - 30 - k * 0.2, "rgba(255,240,150,0.5)", 3, 2); // lighthouse beam
    for (let i = 0; i < 4; i++) { const gx = ((t * 0.7 + i * 80) % 360) - 20, gy = 330 + i * 9 + Math.sin(t / 4 + i) * 2; px(ctx, gx, gy, "#fff", 2, 1); px(ctx, gx + 3, gy - 1, "#fff", 2, 1); }
    for (let i = 0; i < 5; i++) { const w = 26 + (i % 3) * 8; cloud(ctx, ((t * (0.05 + (i % 3) * 0.02) + i * 90) % (H_W + 60)) - 40, 248 + (i % 3) * 9, w, "#f6d7e6", "#c99ac0", "#8a6aa0"); }
    for (let i = 0; i < 14; i++) if ((t + i * 5) % 30 < 3) px(ctx, noise1(i, 4) * H_W, noise1(i, 6) * 200, "#ffffff");
    shown.forEach((v, i) => {
      const p = SKY.pos(v, i, shown.length);
      const sway = Math.sin(t / 7 + i * 2) * 1.5;
      drawSprite(ctx, BALLOON, { c: colors[i]!, C: "#ffe9a6", r: "#6b4226", b: "#8a5a2b" }, p.x - 5 + sway, p.y - 10);
      if (moving[i] && t % 3 < 2) px(ctx, p.x - 1 + sway, p.y - 3, "#ffb347", 2, 2);
    });
  },
  pos: (f, i, n) => ({ x: 160 + (n > 1 ? (i - (n - 1) / 2) * 28 : 0), y: SEA - 6 - clamp(f, 0, 1) * (SEA - 40) }),
  camera: (p) => ({ x: 0, y: clamp(p.y - 80, 0, H_H - 150) }),
};

// ======================= LIFTOFF: a spaceship crossing the solar system =======================
const L_W = 1800, L_H = 150, ORBIT_Y = 78;
const PLANETS: { name: string; x: number; draw: (ctx: CanvasRenderingContext2D, x: number) => void }[] = [
  { name: "Earth", x: 40, draw: (c, x) => disc(c, x - 20, 120, 46, (dx, dy) => (dx * dx + dy * dy > 42 * 42 ? "#7fd0ff" : noise1(dx * 3 + dy, 2) > 0.62 ? "#3ddc97" : dx + dy < -20 ? "#4f9de0" : "#2d6ea8")) },
  { name: "Moon", x: 220, draw: (c, x) => disc(c, x, 40, 9, (dx, dy) => ((dx - 2) ** 2 + dy * dy < 6 || (dx + 4) ** 2 + (dy - 3) ** 2 < 3 ? "#9c99ad" : dx + dy < -4 ? "#f0eef7" : "#cfcce0")) },
  { name: "Mars", x: 420, draw: (c, x) => disc(c, x, 112, 14, (dx, dy) => (dy < -11 ? "#f5e6dc" : dx + dy < -6 ? "#f08a5d" : noise1(dx * 5 + dy, 4) > 0.8 ? "#8a3a22" : "#c4552f")) },
  { name: "Asteroid Belt", x: 620, draw: (c, x) => { const r = rng(5); for (let i = 0; i < 70; i++) { const ax = x - 60 + r() * 120, ay = 20 + r() * 110, s = 1 + Math.floor(r() * 3); c.fillStyle = r() > 0.5 ? "#8a7f75" : "#5d554e"; c.fillRect(Math.round(ax), Math.round(ay), s, s); } } },
  { name: "Jupiter", x: 860, draw: (c, x) => disc(c, x, 40, 34, (dx, dy) => { if ((dx - 10) ** 2 / 4 + (dy - 8) ** 2 < 14) return "#c0563a"; const band = Math.floor((dy + 34) / 6) % 3; return dx + dy < -30 ? "#f6dcb8" : ["#e3b98f", "#c99568", "#f0d2ad"][band]!; }) },
  { name: "Saturn", x: 1100, draw: (c, x) => { disc(c, x, 108, 22, (dx, dy) => (dx + dy < -12 ? "#fbe7b8" : Math.floor((dy + 22) / 5) % 2 ? "#e2c27e" : "#d4ad62")); for (let a = 0; a < Math.PI * 2; a += 0.01) { const rx = Math.cos(a) * 40, ry = Math.sin(a) * 8; if (!(Math.sin(a) < 0 && Math.abs(rx) < 22)) { c.fillStyle = "#efd9a8"; c.fillRect(Math.round(x + rx), Math.round(108 + ry), 1, 1); } } } },
  { name: "Uranus", x: 1320, draw: (c, x) => { disc(c, x, 36, 16, (dx, dy) => (dx + dy < -10 ? "#c9f4f4" : "#7fd6d8")); for (let a = 0; a < Math.PI * 2; a += 0.02) { c.fillStyle = "#b0e6e6"; c.fillRect(Math.round(x + Math.cos(a) * 5), Math.round(36 + Math.sin(a) * 26), 1, 1); } } },
  { name: "Neptune", x: 1520, draw: (c, x) => disc(c, x, 112, 16, (dx, dy) => ((dx + 4) ** 2 / 3 + (dy + 2) ** 2 < 8 ? "#23307a" : dx + dy < -10 ? "#7aa7ff" : "#3b5fd6")) },
  { name: "Pluto", x: 1740, draw: (c, x) => disc(c, x, 50, 6, (dx, dy) => (dx * dx + (dy - 1) ** 2 < 6 ? "#f3e2cf" : "#b8977a")) },
];
const SHIP = ["....ww......", "...wBBw.....", "..wwwwwwww..", "rrwwwwwwwwwo", "..wwwwwwww..", "...wrrw.....", "....ww......"];
const shipX = (f: number) => 40 + clamp(f, 0, 1) * (1740 - 40);

export const LAUNCH: World = {
  id: "launch", fullW: L_W, fullH: L_H, viewW: 320, viewH: 150,
  checkpoints: PLANETS.map((p) => ({ name: p.name, at: (p.x - 40) / (1740 - 40) })),
  backdrop(ctx) {
    ditherSky(ctx, 0, 0, L_W, L_H, [[0, "#04030f"], [0.5, "#0b0a26"], [1, "#160f3a"]]);
    const r = rng(11);
    for (let i = 0; i < 900; i++) px(ctx, r() * L_W, r() * L_H, r() > 0.85 ? "#ffffff" : r() > 0.5 ? "#a6b4ff" : "#5b5fa5");
    // nebulae
    for (const [nx, ny, col] of [[300, 90, "#3d2370"], [980, 60, "#1f3d6e"], [1450, 80, "#4a1f4f"]] as const) {
      for (let i = 0; i < 700; i++) { const a = r() * Math.PI * 2, d = r() * 40; const x = nx + Math.cos(a) * d * 1.8, y = ny + Math.sin(a) * d * 0.7; if ((Math.round(x) + Math.round(y)) % 2) px(ctx, x, y, col); }
    }
    // the sun's glow at the far left
    for (let x = 0; x < 40; x++) for (let y = 0; y < L_H; y++) if (noise1(x * 7 + y, 1) < (40 - x) / 60) px(ctx, x, y, "#3a2a14");
    for (const p of PLANETS) p.draw(ctx, p.x);
    // dotted flight path
    for (let x = 40; x < 1740; x += 6) px(ctx, x, ORBIT_Y + 4, "#2c2c5a", 2, 1);
  },
  frame(ctx, t, shown, moving, _cam, colors) {
    for (let i = 0; i < 40; i++) if ((t + i * 7) % 26 < 2) px(ctx, noise1(i, 8) * L_W, noise1(i, 9) * L_H, "#ffffff");
    shown.forEach((v, i) => {
      const x = shipX(v), y = ORBIT_Y + (i - (shown.length - 1) / 2) * 12 + Math.sin(t / 6 + i) * 1.5;
      const thrust = moving[i] ? 8 + (t % 3) * 2 : 3;
      for (let k = 0; k < thrust; k++) px(ctx, x - 2 - k, y + 2 + noise1(k + t, i) * 2 - 1, k < 3 ? "#fff3b0" : k < 6 ? "#ffb347" : "#ff4d6d");
      drawSprite(ctx, SHIP, { w: "#f1f1f8", B: "#4cc9f0", r: colors[i]!, o: "#ffd23f" }, x, y - 1);
    });
  },
  pos: (f, i, n) => ({ x: shipX(f) + 6, y: ORBIT_Y + (i - (n - 1) / 2) * 12 }),
  camera: (p) => ({ x: clamp(p.x - 110, 0, L_W - 320), y: 0 }),
};

// ======================= HALL: a small-town polling hall at dusk =======================
// One fixed room with no camera moves: a window onto the town, a notice board, the clerk's table with the ballot box,
// and a row of booths. Bunting, lamps, a ticking clock, the clerk and the curtains give it idle life.
const HALL_W = 180, HALL_H = 76, HALL_FLOOR = 58;
const HALL_CLERK = ["...gggg...", "..gggggg..", "..ssssss..", "..GeGGeG..", "..ssssss..", "...smms...", "..cccccc..", ".cccWWccc.", ".cccWWccc.", ".cc.WW.cc.", ".cc.WW.cc.", ".cc.WW.cc."];
const HALL_LETTERS: Record<string, string[]> = { V: ["X.X", "X.X", "X.X", "X.X", ".X."], O: ["XXX", "X.X", "X.X", "X.X", "XXX"], T: ["XXX", ".X.", ".X.", ".X.", ".X."], E: ["XXX", "X..", "XX.", "X..", "XXX"], H: ["X.X", "X.X", "XXX", "X.X", "X.X"], R: ["XX.", "X.X", "XX.", "X.X", "X.X"] };
const HALL_BOOTHS = [131, 148, 165];

/** Which floor row a y falls in, given where each row starts. */
const bandOf = (y: number, bands: number[]) => { let r = 0; while (r < bands.length - 1 && y >= bands[r + 1]!) r++; return r; };

function hallBackdrop(ctx: CanvasRenderingContext2D) {
  // Sage plaster wall, brighter low down where the lamps reach, joined by dithering.
  ditherSky(ctx, 0, 0, HALL_W, 46, [[0, "#2f4239"], [0.45, "#40584a"], [1, "#587359"]]);
  for (let i = 0; i < 90; i++) px(ctx, noise1(i, 21) * HALL_W, 8 + noise1(i, 22) * 36, "#4d6752");
  // Ceiling beam with joints.
  px(ctx, 0, 0, "#3a2416", HALL_W, 5);
  px(ctx, 0, 0, "#5d3b22", HALL_W, 1);
  px(ctx, 0, 5, "#1d1009", HALL_W, 1);
  for (let x = 14; x < HALL_W; x += 28) px(ctx, x, 1, "#1d1009", 1, 4);

  // Wooden wainscot with framed panels and a rail.
  px(ctx, 0, 46, "#5b3a20", HALL_W, 12);
  px(ctx, 0, 45, "#8a5c32", HALL_W, 1);
  px(ctx, 0, 46, "#2a180c", HALL_W, 1);
  for (let x = 2; x < HALL_W; x += 16) {
    px(ctx, x, 48, "#472c17", 13, 8);
    px(ctx, x, 48, "#2a180c", 13, 1);
    px(ctx, x, 48, "#2a180c", 1, 8);
    px(ctx, x, 55, "#6e4728", 13, 1);
    px(ctx, x + 12, 48, "#6e4728", 1, 8);
    for (let k = 0; k < 8; k++) if ((x + k) % 3 === 0) px(ctx, x + 3 + (k * 7) % 8, 50 + k % 5, "#523319");
  }
  // Checkered lino: bands get deeper and the tile edges converge toward the back wall.
  for (let y = HALL_FLOOR; y < HALL_H; y++) {
    const row = bandOf(y, [58, 60, 63, 67, 71]);
    for (let x = 0; x < HALL_W; x++) {
      const light = (Math.floor((x - 90) / (7 + (y - HALL_FLOOR) * 0.8)) + row) & 1;
      const back = y < 62 && (y - HALL_FLOOR) * 4 < BAYER[y & 3]![x & 3]!;
      px(ctx, x, y, light ? (back ? "#a89d7b" : "#d5caa3") : back ? "#3d5345" : "#54705d");
    }
  }
  px(ctx, 0, HALL_FLOOR, "#1d1009", HALL_W, 1);

  // The window: dusk over a little town, with a church steeple and lit windows.
  const wx = 6, wy = 11, ww = 28, wh = 31;
  px(ctx, wx - 2, wy - 2, "#3a2416", ww + 4, wh + 4);
  px(ctx, wx - 1, wy - 1, "#6e4728", ww + 2, wh + 2);
  ditherSky(ctx, wx, wy, ww, wh, [[0, "#1f2157"], [0.4, "#62408a"], [0.72, "#d9607a"], [1, "#ffb25a"]]);
  disc(ctx, wx + 21, wy + 19, 3, () => "#ffe0a0");
  for (let x = 0; x < ww; x++) { const h = 4 + Math.round(2 * Math.sin(x / 4) + noise1(x >> 2, 3) * 2); px(ctx, wx + x, wy + wh - h, "#2a2147", 1, h); }
  for (const [hx, hw, hh] of [[1, 7, 7], [17, 8, 8]] as const) {
    px(ctx, wx + hx, wy + wh - hh, "#1c1633", hw, hh);
    for (let r = 0; r < 3; r++) px(ctx, wx + hx + 2 - r, wy + wh - hh - 3 + r, "#1c1633", hw - 4 + r * 2, 1);
    px(ctx, wx + hx + 2, wy + wh - hh + 2, "#ffd23f", 2, 2);
  }
  // Steeple.
  px(ctx, wx + 10, wy + wh - 13, "#1c1633", 5, 13);
  for (let r = 0; r < 7; r++) px(ctx, wx + 12 - (r >> 1), wy + wh - 20 + r, "#1c1633", 1 + (r >> 1) * 2, 1);
  px(ctx, wx + 12, wy + wh - 23, "#1c1633", 1, 3);
  px(ctx, wx + 11, wy + wh - 22, "#1c1633", 3, 1);
  px(ctx, wx + 12, wy + wh - 10, "#ffd23f", 1, 3);
  px(ctx, wx + 13, wy, "#3a2416", 2, wh);
  px(ctx, wx, wy + 14, "#3a2416", ww, 2);
  px(ctx, wx - 3, wy + wh + 2, "#8a5c32", ww + 6, 2);
  px(ctx, wx - 3, wy + wh + 4, "#2a180c", ww + 6, 1);

  // Notice board: cork, pinned papers, a rosette.
  const nx = 40, ny = 13;
  px(ctx, nx - 2, ny - 2, "#3a2416", 28, 28);
  px(ctx, nx - 1, ny - 1, "#6e4728", 26, 26);
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) px(ctx, nx + x, ny + y, noise2(x / 2, y / 2, 5) > 0.55 ? "#a4743f" : noise1(x * 31 + y, 6) > 0.8 ? "#7c5228" : "#b98a50");
  const paper = (x: number, y: number, w: number, h: number, pin: string) => {
    px(ctx, x + 1, y + 1, "#5a3a1c", w, h);
    px(ctx, x, y, "#f3ead0", w, h);
    for (let l = 3; l < h - 1; l += 2) px(ctx, x + 1, y + l, "#a69c82", w - 2 - (l % 4 ? 1 : 0), 1);
    px(ctx, x + (w >> 1), y, pin);
  };
  paper(nx + 2, ny + 2, 9, 11, "#d9402f");
  paper(nx + 13, ny + 3, 9, 8, "#2f6fb0");
  paper(nx + 4, ny + 15, 11, 7, "#ffd23f");
  disc(ctx, nx + 19, ny + 17, 3, (dx, dy) => (dx * dx + dy * dy <= 1 ? "#ffd23f" : "#d9402f"));
  px(ctx, nx + 17, ny + 20, "#d9402f", 1, 3);
  px(ctx, nx + 21, ny + 20, "#d9402f", 1, 3);

  // Sign over the table.
  px(ctx, 84, 6, "#1d1009", 1, 4);
  px(ctx, 117, 6, "#1d1009", 1, 4);
  px(ctx, 82, 10, "#1d1009", 38, 11);
  px(ctx, 83, 11, "#f3ead0", 36, 9);
  px(ctx, 83, 19, "#c9bd98", 36, 1);
  [..."VOTE"].forEach((ch, i) => HALL_LETTERS[ch]!.forEach((row, ry) => [...row].forEach((c, rx) => { if (c === "X") px(ctx, 89 + i * 6 + rx, 13 + ry, i % 2 ? "#2f6fb0" : "#c8392b"); })));
  px(ctx, 85, 13, "#c8392b");
  px(ctx, 116, 13, "#c8392b");

  // Flagpole with a gold finial (the flag itself ripples in the frame).
  px(ctx, 71, 13, "#d8c98f", 1, 45);
  px(ctx, 72, 13, "#7c6a3a", 1, 45);
  px(ctx, 70, 11, "#ffd23f", 3, 2);
  px(ctx, 68, 56, "#2a180c", 7, 2);

  // Clock case.
  disc(ctx, 124, 16, 5, () => "#3a2416");
  disc(ctx, 124, 16, 4, () => "#f3ead0");
  px(ctx, 124, 12, "#1d1009");
  px(ctx, 124, 20, "#1d1009");
  px(ctx, 120, 16, "#1d1009");
  px(ctx, 128, 16, "#1d1009");

  // Voting booths along the back wall.
  for (const bx of HALL_BOOTHS) {
    px(ctx, bx, 22, "#2a180c", 15, 37);
    px(ctx, bx + 1, 23, "#1a1410", 13, 35);
    px(ctx, bx - 1, 19, "#6e4728", 17, 4);
    px(ctx, bx - 1, 19, "#a06f3e", 17, 1);
    px(ctx, bx - 1, 22, "#2a180c", 17, 1);
    for (let x = 0; x < 15; x++) px(ctx, bx + x, 23, x % 4 < 2 ? "#c8392b" : "#f3ead0", 1, 3);
    px(ctx, bx, 26, "#1d1009", 15, 1);
  }

  // The clerk's table behind a bunting cloth, with ballots and the box on top.
  drawSprite(ctx, HALL_CLERK, { g: "#c9ccd6", s: "#e8b890", G: "#22223a", e: "#ffffff", m: "#a8644a", c: "#7c3a5e", W: "#f3ead0" }, 84, 31);
  px(ctx, 76, 43, "#8a5c32", 46, 3);
  px(ctx, 76, 43, "#c28c52", 46, 1);
  px(ctx, 76, 46, "#27406e", 46, 12);
  for (let x = 76; x < 122; x++) {
    const stripe = Math.floor((x - 76) / 5) % 2;
    px(ctx, x, 46, stripe ? "#f3ead0" : "#c8392b", 1, 5);
    if ((x + 2) % 4 === 0) px(ctx, x, 51, "#ffd23f");
  }
  px(ctx, 76, 57, "#14233f", 46, 1);
  px(ctx, 78, 40, "#f3ead0", 6, 3);
  px(ctx, 78, 41, "#c9bd98", 6, 1);
  // Ballot box: wood, a slot, a brass lock.
  px(ctx, 101, 32, "#2a180c", 16, 11);
  px(ctx, 102, 33, "#8a5c32", 14, 9);
  px(ctx, 102, 33, "#c28c52", 14, 2);
  px(ctx, 105, 33, "#1d1009", 8, 1);
  for (let k = 0; k < 6; k++) px(ctx, 103 + k * 2, 36 + (k % 3), "#6e4728");
  px(ctx, 108, 38, "#ffd23f", 2, 3);
  px(ctx, 108, 40, "#a87a1c", 2, 1);

  // Warm pools of lamplight on the floor, thinning out with dithering.
  for (const lx of [55, 148]) for (let y = HALL_FLOOR + 1; y < HALL_H; y++) for (let x = lx - 26; x < lx + 26; x++) {
    const d = Math.hypot((x - lx) / 26, (y - 66) / 9);
    if (d < 1 && (1 - d) * 22 > BAYER[y & 3]![x & 3]! + 0.5) px(ctx, x, y, "rgba(255,236,170,0.34)");
  }
}

export const HALL: World = {
  id: "hall", fullW: HALL_W, fullH: HALL_H, viewW: HALL_W, viewH: HALL_H,
  checkpoints: [{ name: "Polling hall", at: 0 }],
  backdrop: hallBackdrop,
  frame: (ctx, t) => {
    // Town lights and first stars through the glass.
    for (let i = 0; i < 6; i++) if ((t + i * 9) % 34 > 3) px(ctx, 7 + noise1(i, 31) * 26, 12 + noise1(i, 32) * 9, "#ffffff");
    // Flag.
    for (let cx = 0; cx < 11; cx++) {
      const wave = Math.round(Math.sin(t / 4 + cx * 0.8) * (cx / 10) * 1.4);
      for (let r = 0; r < 7; r++) px(ctx, 73 + cx, 14 + r + wave, cx < 4 && r < 3 ? (cx + r) % 2 ? "#f3ead0" : "#27406e" : r % 2 ? "#f3ead0" : "#c8392b");
    }
    // Bunting along the beam.
    for (let i = 0; i < 15; i++) {
      const x = 2 + i * 12, sag = Math.sin(((x % 60) / 60) * Math.PI) * 2.5, sway = Math.round(Math.sin(t / 7 + i * 0.6));
      px(ctx, x - 2, 6 + sag, "#d8cfa8", 13, 1);
      const c = ["#c8392b", "#f3ead0", "#2f6fb0"][i % 3]!;
      for (let r = 0; r < 4; r++) px(ctx, x + r + sway * (r >> 1), 7 + sag + r, c, 7 - r * 2 > 0 ? 7 - r * 2 : 1, 1);
    }
    // Pendant lamps with a rare flicker.
    for (const [i, lx] of [55, 148].entries()) {
      const dim = (t + i * 47) % 113 < 3;
      px(ctx, lx, 5, "#1d1009", 1, 2);
      px(ctx, lx - 3, 7, "#27406e", 7, 2);
      px(ctx, lx - 2, 6, "#3c5a92", 5, 1);
      px(ctx, lx - 1, 9, dim ? "#b8944a" : "#fff4c8", 3, 1);
    }
    // Clock hands: a second hand that ticks, a minute hand that crawls.
    const sec = (Math.floor(t / 14) % 60) / 60 * Math.PI * 2, min = (t / 8000) * Math.PI * 2 + 2;
    for (let r = 1; r <= 3; r++) px(ctx, 124 + Math.sin(sec) * r, 16 - Math.cos(sec) * r, "#c8392b");
    for (let r = 1; r <= 2; r++) px(ctx, 124 + Math.sin(min) * r, 16 - Math.cos(min) * r, "#1d1009");
    px(ctx, 124, 16, "#1d1009");
    // Booth curtains sway; somebody's shoes shuffle under the middle one.
    HALL_BOOTHS.forEach((bx, i) => {
      for (let x = 0; x < 13; x++) {
        const fold = (x + Math.round(Math.sin(t / 9 + i) * 1.2)) % 4;
        const c = fold === 0 ? "#141d3f" : fold === 1 ? "#27406e" : fold === 2 ? "#3c5a92" : "#27406e";
        px(ctx, bx + 1 + x, 27, c, 1, i === 1 ? 26 : 30);
      }
    });
    const shuffle = t % 40 < 4 ? 1 : 0;
    px(ctx, HALL_BOOTHS[1]! + 4 + shuffle, 53, "#3a3550", 2, 5);
    px(ctx, HALL_BOOTHS[1]! + 9 - shuffle, 53, "#3a3550", 2, 5);
    px(ctx, HALL_BOOTHS[1]! + 3 + shuffle, 57, "#14101f", 3, 1);
    px(ctx, HALL_BOOTHS[1]! + 9 - shuffle, 57, "#14101f", 3, 1);
    // The clerk blinks and now and then stamps a ballot.
    if (t % 47 < 2) { px(ctx, 87, 34, "#e8b890"); px(ctx, 90, 34, "#e8b890"); }
    const stamp = t % 70;
    const ay = stamp < 3 ? 38 : stamp < 5 ? 41 : 42;
    px(ctx, 80, ay - 1, "#7c3a5e", 4, 3);
    px(ctx, 79, ay + 1, "#e8b890", 2, 1);
    if (stamp >= 3 && stamp < 30) px(ctx, 80, 41, "#c8392b", 2, 1);
    // Dust drifting through the lamplight.
    for (let i = 0; i < 12; i++) {
      const lx = i % 2 ? 148 : 55, y = 12 + ((noise1(i, 41) * 44 + t * (0.05 + noise1(i, 42) * 0.08)) % 44);
      px(ctx, lx + Math.sin(t / 19 + i * 2) * (3 + (y - 8) * 0.25), y, "#fff4c8");
    }
  },
  pos: () => ({ x: 90, y: 34 }),
  camera: () => ({ x: 0, y: 0 }),
};

// ======================= BALL: a masked ball by moonlight =======================
// Arched windows, velvet drapes and a candle chandelier over a marble floor, with masked couples waltzing round it.
const BALL_W = 180, BALL_H = 76, BALL_FLOOR = 50;
const BALL_WINDOWS = [34, 78, 122];
const BALL_COUPLE = ["..hh.kk..", ".hhh.kkk.", "..mm.mm..", "..ss.ss..", "..GG.BB..", ".GGGBBBB.", ".gGGBBBB.", "..GG.BB..", "..GG.BB..", ".GGG.BB..", ".GGGGBB..", "GGgGGBB..", "GGgGGBB..", "GgGGgB.B."];
const BALL_COUPLE_2 = ["..hh.kk..", ".hhh.kkk.", "..mm.mm..", "..ss.ss..", "..GG.BB..", ".GGGBBBB.", ".gGGBBBB.", "..GG.BB..", "..GG.BB..", "..GGGBB..", ".GGGGBB..", ".GGgGGBB.", "GGGgGGBB.", "GGgGGgB.B"];
const BALL_GOWNS = [["#b3203f", "#7a1230", "#2a1208"], ["#1f8a8a", "#125c63", "#e8c26a"], ["#e0a93b", "#a8741c", "#3a1a10"], ["#7c4dd6", "#52309c", "#1d1409"]] as const;

function ballBackdrop(ctx: CanvasRenderingContext2D) {
  // Plum wall, dithered darker up top, with a faint gold damask.
  ditherSky(ctx, 0, 0, BALL_W, BALL_FLOOR, [[0, "#1a0a26"], [0.5, "#2c1238"], [1, "#451a48"]]);
  for (let y = 8; y < BALL_FLOOR; y += 8) for (let x = (y % 16 ? 4 : 0); x < BALL_W; x += 8) {
    px(ctx, x, y, "#6a3a5c");
    px(ctx, x - 1, y + 1, "#5a2c52", 3, 1);
    px(ctx, x, y + 2, "#6a3a5c");
  }
  // Cornice.
  px(ctx, 0, 0, "#120618", BALL_W, 3);
  px(ctx, 0, 3, "#e8c26a", BALL_W, 1);
  px(ctx, 0, 4, "#8a6a2a", BALL_W, 1);
  for (let x = 2; x < BALL_W; x += 6) px(ctx, x, 5, "#8a6a2a", 3, 1);

  // Arched windows onto the night.
  BALL_WINDOWS.forEach((wx, wi) => {
    const w = 24, top = 8, bottom = 46, cx = wx + 12;
    const inArch = (x: number, y: number, grow: number) => {
      const r = 12 + grow;
      if (y < top + 12) { const dx = x - cx + 0.5, dy = y - (top + 12); return dx * dx + dy * dy <= r * r; }
      return x >= wx - grow && x < wx + w + grow && y < bottom + grow;
    };
    for (let y = top - 3; y < bottom + 3; y++) for (let x = wx - 3; x < wx + w + 3; x++) {
      if (inArch(x, y, 0)) {
        const f = (y - top) / (bottom - top);
        const band = f < 0.4 ? ["#0c1038", "#141a52"] : f < 0.75 ? ["#141a52", "#232a78"] : ["#232a78", "#3c3f9a"];
        const m = ((f * 8) % 1) * 16 > BAYER[y & 3]![x & 3]! + 0.5;
        px(ctx, x, y, m ? band[1]! : band[0]!);
      } else if (inArch(x, y, 1)) px(ctx, x, y, "#e8c26a");
      else if (inArch(x, y, 2)) px(ctx, x, y, "#6a4a1a");
    }
    if (wi === 2) {
      disc(ctx, cx + 3, 20, 6, (dx, dy) => (dx + dy > 3 ? "#cdd6f0" : (dx * 3 + dy * 5) % 7 === 0 ? "#dbe2f5" : "#f4f6ff"));
      for (let x = -9; x < 9; x++) if ((x & 1) === 0) px(ctx, cx + x, 29 + (x & 3 ? 0 : 1), "#3c3f9a", 3, 1);
    }
    // Mullions.
    px(ctx, cx, top, "#6a4a1a", 1, bottom - top);
    for (const y of [20, 33]) px(ctx, wx, y, "#6a4a1a", w, 1);
    px(ctx, wx - 3, bottom + 1, "#e8c26a", w + 6, 2);
    px(ctx, wx - 3, bottom + 3, "#6a4a1a", w + 6, 1);
  });

  // Marble pillars between the windows.
  for (const x of [64, 108]) {
    px(ctx, x, 8, "#cfc6d8", 8, BALL_FLOOR - 8);
    px(ctx, x, 8, "#f1ebf5", 2, BALL_FLOOR - 8);
    px(ctx, x + 6, 8, "#8d84a0", 2, BALL_FLOOR - 8);
    for (let y = 10; y < BALL_FLOOR; y += 2) px(ctx, x + 3 + Math.round(noise1(y, x) * 2), y, "#a79dba");
    px(ctx, x - 1, 6, "#e8c26a", 10, 3);
    px(ctx, x - 1, 8, "#8a6a2a", 10, 1);
    px(ctx, x - 1, BALL_FLOOR - 3, "#e8c26a", 10, 3);
    px(ctx, x - 1, BALL_FLOOR - 1, "#8a6a2a", 10, 1);
  }

  // Polished marble checks, edges converging toward the wall, with a vein here and there.
  for (let y = BALL_FLOOR; y < BALL_H; y++) {
    const row = bandOf(y, [50, 52, 55, 59, 64, 70]);
    for (let x = 0; x < BALL_W; x++) {
      const dark = (Math.floor((x - 90) / (8 + (y - BALL_FLOOR) * 0.7)) + row) & 1;
      const vein = noise2(x / 5, y / 2, 9) > 0.72;
      const back = y < 54 && (y - BALL_FLOOR) * 4 < BAYER[y & 3]![x & 3]!;
      px(ctx, x, y, dark ? (vein ? "#34204e" : back ? "#140a22" : "#21123a") : vein ? "#8e83a8" : back ? "#7a6f94" : "#b6accb");
    }
  }
  px(ctx, 0, BALL_FLOOR, "#e8c26a", BALL_W, 1);
  // Moonlight falling from the windows onto the marble.
  for (const wx of BALL_WINDOWS) for (let y = BALL_FLOOR + 1; y < BALL_H; y++) {
    const shift = (y - BALL_FLOOR) * 0.5;
    for (let x = Math.floor(wx + 2 - shift); x < wx + 22 - shift * 0.4; x++) if ((x + y) % 2 === 0 && x >= 0 && x < BALL_W) px(ctx, x, y, "rgba(170,190,255,0.32)");
  }

  // Velvet drapes with a swag and gold tassels.
  const drape = (x0: number, x1: number, flip: boolean) => {
    for (let x = x0; x < x1; x++) {
      const k = flip ? x1 - 1 - x : x - x0;
      const fold = k % 6;
      const c = fold < 2 ? "#a81c3a" : fold < 4 ? "#7a1230" : "#4f0a22";
      const tie = 34 + Math.round((k / (x1 - x0)) * 5);
      px(ctx, x, 5, c, 1, tie - 5);
      px(ctx, x, tie + 2, c, 1, Math.max(0, BALL_H - tie - 2 - (k > 12 ? 40 : 0)));
    }
    const tx = flip ? x0 : x1 - 6;
    px(ctx, tx, 38, "#e8c26a", 6, 2);
    px(ctx, tx + 2, 40, "#e8c26a", 2, 5);
    px(ctx, tx + 2, 44, "#8a6a2a", 2, 1);
    for (let x = x0; x < x1; x++) px(ctx, x, 5 + Math.round(Math.abs(Math.sin((x - x0) / 5)) * 3), "#e8c26a");
  };
  drape(0, 22, false);
  drape(BALL_W - 22, BALL_W, true);
}

export const BALL: World = {
  id: "ball", fullW: BALL_W, fullH: BALL_H, viewW: BALL_W, viewH: BALL_H,
  checkpoints: [{ name: "Ballroom", at: 0 }],
  backdrop: ballBackdrop,
  frame: (ctx, t) => {
    // Stars prickle in the outer windows.
    for (let i = 0; i < 9; i++) {
      if ((t + i * 11) % 29 < 3) continue;
      const wx = BALL_WINDOWS[i % 3]!;
      if (wx === 78 && i % 2) continue;
      px(ctx, wx + 2 + noise1(i, 51) * 20, 16 + noise1(i, 52) * 16, "#ffffff");
    }
    // Waltzing couples, drawn back to front around the floor.
    const couples = [0, 1, 2, 3].map((i) => {
      const a = t / 42 + (i / 4) * Math.PI * 2;
      return { i, x: 90 + Math.cos(a) * 54, y: 59 + Math.sin(a) * 4.5, step: Math.floor(t / 5 + i) % 2 };
    }).sort((p, q) => p.y - q.y);
    for (const c of couples) {
      const [gown, shade, hair] = BALL_GOWNS[c.i]!;
      const flip = Math.floor((t + c.i * 3) / 14) % 2 === 1;
      const rows = c.step ? BALL_COUPLE : BALL_COUPLE_2;
      const y = Math.round(c.y) - 12 + (c.step ? 0 : -1);
      for (let k = 0; k < 8; k++) px(ctx, Math.round(c.x) - 4 + k, y + 14, "rgba(5,2,20,0.55)");
      drawSprite(ctx, flip ? rows.map((r) => [...r].reverse().join("")) : rows, { h: hair, k: "#141020", m: ["#ffd23f", "#f4f6ff", "#ff4d6d", "#3ddc97"][c.i]!, s: "#f0c8a0", G: gown, g: shade, B: "#191426" }, Math.round(c.x) - 4, y);
    }
    // Chandelier: a chain, a gold cage, candles that flicker, a dithered halo. It sways a hair.
    const sway = Math.round(Math.sin(t / 22));
    const cx = 90 + sway;
    for (let r = 0; r < 2; r++) px(ctx, 90, 5 + r * 2, "#e8c26a");
    for (let y = -14; y <= 14; y++) for (let x = -24; x <= 24; x++) {
      const d = Math.hypot(x / 1.7, y);
      if (d > 14 || d < 6) continue;
      if ((14 - d) * 1.1 > BAYER[(y + 16) & 3]![(x + 24) & 3]! && (x + y + 40) % 2 === 0) px(ctx, cx + x, 19 + y, "rgba(255,216,130,0.3)");
    }
    // Two tiers of curved gold arms on a central stem.
    px(ctx, cx - 1, 10, "#8a6a2a", 3, 16);
    px(ctx, cx, 10, "#ffe9a8", 1, 16);
    px(ctx, cx - 2, 26, "#e8c26a", 5, 2);
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      const x = cx + k * 6, a = Math.abs(k);
      px(ctx, Math.min(cx, x), 22 - a, "#e8c26a", Math.abs(x - cx) + 1, 1);
      px(ctx, Math.min(cx, x), 23 - a, "#8a6a2a", Math.abs(x - cx) + 1, 1);
      px(ctx, x, 19 - a, "#e8c26a", 1, 3);
      px(ctx, x - 1, 18 - a, "#e8c26a", 3, 1);
      px(ctx, x, 15 - a, "#f4f6ff", 1, 3);
      const lick = (Math.floor(t / 2) + a * 2 + (k > 0 ? 1 : 0)) % 3;
      px(ctx, x, 14 - a, "#ffb347");
      px(ctx, x, 13 - a - (lick === 0 ? 1 : 0), lick === 1 ? "#ff8a3a" : "#fff4c8");
      px(ctx, x, 24 - a + (Math.floor(t / 13 + k) % 2), "#cfe6ff");
    }
    px(ctx, cx, 28, "#cfe6ff", 1, 2);
    // Petals drifting down.
    for (let i = 0; i < 14; i++) {
      const y = (noise1(i, 61) * BALL_H + t * (0.16 + noise1(i, 62) * 0.12)) % BALL_H;
      const x = 22 + noise1(i, 63) * 136 + Math.sin(t / 11 + i) * 3;
      px(ctx, x, y, ["#ff4d6d", "#ffd23f", "#f4f6ff"][i % 3]!);
    }
  },
  pos: () => ({ x: 90, y: 40 }),
  camera: () => ({ x: 0, y: 0 }),
};

// ======================= STUDIO: a late-night radio station =======================
// The booth at a quarter to three: foam on the walls, the city and the station's own mast through the glass, an ON AIR
// box, a tape machine with turning reels, and a host in headphones leaning into a boom mic over a glowing desk.
const STU_W = 180, STU_H = 76, STU_DESK = 49;
const STU_WIN = { x: 5, y: 8, w: 52, h: 35 };
const STU_MAST = { x: 19, top: 14 };
const STU_REELS: [number, number][] = [[140, 18], [163, 18]];
const STU_GLYPHS: Record<string, string[]> = {
  O: ["XXX", "X.X", "X.X", "X.X", "XXX"], N: ["X.X", "XXX", "XXX", "XXX", "X.X"], A: [".X.", "X.X", "XXX", "X.X", "X.X"], I: ["X", "X", "X", "X", "X"], R: ["XX.", "X.X", "XX.", "X.X", "X.X"],
  "2": ["XXX", "..X", "XXX", "X..", "XXX"], "4": ["X.X", "X.X", "XXX", "..X", "..X"], "7": ["XXX", "..X", ".X.", ".X.", ".X."],
};
const STU_HOST = [
  "....BBBBBB....",
  "...BhhhhhhB...",
  "..BhhhhhhhhB..",
  "..BhhsshshhB..",
  ".EEssssssssEE.",
  ".EEsGssssGsEE.",
  ".EEssssssssEE.",
  "...ssssssss...",
  "....ssssss....",
  "...cCCCCCCc...",
  "..cccCCCCccc..",
  ".ccccCCCCcccc.",
  ".cccccWWccccc.",
  ".cccccWWccccc.",
  ".cccccccccccc.",
  ".cccccccccccc.",
  ".ccc.cccc.ccc.",
  ".ccc.cccc.ccc.",
  ".sss......sss.",
];
const STU_HOST_PAL = { B: "#c9ccd6", h: "#3a2233", s: "#e0a982", G: "#1a1030", E: "#e8344a", c: "#2f6f73", C: "#3f8f8c", W: "#f4eeda" };

const stuText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: string) => {
  let at = x;
  for (const ch of text) {
    const g = STU_GLYPHS[ch];
    if (g) g.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === "X") px(ctx, at + rx, y + ry, c); }));
    at += (g?.[0]!.length ?? 2) + 1;
  }
};

function studioBackdrop(ctx: CanvasRenderingContext2D) {
  // Midnight-blue wall, a little lighter down by the desk lamps.
  ditherSky(ctx, 0, 0, STU_W, STU_DESK, [[0, "#0d0b24"], [0.55, "#17143a"], [1, "#241c4e"]]);
  // Egg-crate acoustic foam behind the host: each tile is a pyramid lit from above.
  for (let ty = 7; ty < 46; ty += 7) for (let tx = 62; tx < 126; tx += 7) {
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const up = y < Math.min(x, 5 - x) + 1, side = x < 3;
      px(ctx, tx + x, ty + y, up ? "#3b3273" : side ? "#2a2358" : "#1d1842");
    }
    px(ctx, tx + 2, ty + 2, "#463c85", 2, 1);
  }
  // Ceiling with a run of cable tray.
  px(ctx, 0, 0, "#07061a", STU_W, 4);
  px(ctx, 0, 4, "#2f2a5e", STU_W, 1);
  px(ctx, 0, 5, "#04030f", STU_W, 1);
  for (let x = 4; x < STU_W; x += 12) px(ctx, x, 1, "#1b1842", 6, 2);

  // The booth window over the sleeping city.
  const { x: wx, y: wy, w: ww, h: wh } = STU_WIN;
  px(ctx, wx - 3, wy - 3, "#04030f", ww + 6, wh + 6);
  px(ctx, wx - 2, wy - 2, "#4a4570", ww + 4, wh + 4);
  px(ctx, wx - 2, wy - 2, "#6c6794", ww + 4, 1);
  px(ctx, wx - 1, wy - 1, "#04030f", ww + 2, wh + 2);
  ditherSky(ctx, wx, wy, ww, wh, [[0, "#060824"], [0.5, "#141247"], [0.82, "#3a2468"], [1, "#7a3a78"]]);
  const r = rng(29);
  for (let i = 0; i < 26; i++) px(ctx, wx + r() * ww, wy + r() * 20, r() > 0.7 ? "#ffffff" : "#8f93d6");
  disc(ctx, wx + 41, wy + 8, 5, (dx, dy) => ((dx + 2) ** 2 + (dy + 1) ** 2 < 3 || (dx - 2) ** 2 + (dy - 2) ** 2 < 2 ? "#cfc9a8" : dx + dy > 4 ? "#d8d2b2" : "#f6f0d0"));
  // Far skyline, then near blocks with lit windows.
  for (let x = 0; x < ww; x++) { const h = 8 + Math.round(noise1(x >> 2, 40) * 9); px(ctx, wx + x, wy + wh - h, "#241a50", 1, h); }
  const blocks: [number, number, number][] = [[0, 8, 13], [9, 6, 9], [24, 7, 16], [32, 9, 11], [42, 10, 18]];
  for (const [bx, bw, bh] of blocks) {
    px(ctx, wx + bx, wy + wh - bh, "#0f0c2c", bw, bh);
    px(ctx, wx + bx, wy + wh - bh, "#2c2560", 1, bh);
    for (let y = bh - 2; y > 1; y -= 3) for (let x = 1; x < bw - 1; x += 2) if (noise1(x * 7 + y * 3 + bx, 41) > 0.62) px(ctx, wx + bx + x, wy + wh - y, noise1(x + y, 42) > 0.5 ? "#ffd23f" : "#ff9f5a");
  }
  // The station's lattice mast, stayed with thin wires.
  const { x: mx, top: mt } = STU_MAST;
  const base = wy + wh;
  for (let y = mt; y < base; y++) {
    const half = Math.floor((y - mt) / 11);
    px(ctx, mx - half, y, "#b8b4dc");
    px(ctx, mx + half + 1, y, "#6c6794");
    if ((y - mt) % 3 === 0) px(ctx, mx - half, y, "#8d89b8", half * 2 + 2, 1);
  }
  for (let k = 0; k < 11; k++) { px(ctx, mx - 2 - k, mt + 6 + k * 2, "#3b3575"); px(ctx, mx + 3 + k, mt + 6 + k * 2, "#3b3575"); }
  // Glass glare and the sill.
  for (let k = 0; k < 16; k++) if (k % 2) px(ctx, wx + 8 + k, wy + 22 - k, "rgba(190,200,255,.22)", 1, 1);
  px(ctx, wx - 4, wy + wh + 3, "#6c6794", ww + 8, 1);
  px(ctx, wx - 4, wy + wh + 4, "#2a2654", ww + 8, 2);

  // The ON AIR box: the frame here, the light in the frame loop.
  px(ctx, 71, 8, "#04030f", 36, 11);
  px(ctx, 72, 9, "#2a2654", 34, 9);
  px(ctx, 88, 5, "#04030f", 2, 3);
  // Wall clock, a red-LED 2:47.
  px(ctx, 111, 9, "#04030f", 15, 9);
  px(ctx, 112, 10, "#1a0408", 13, 7);
  stuText(ctx, "2", 113, 11, "#ff4d4d");
  stuText(ctx, "47", 118, 11, "#ff4d4d");

  // The tape machine: a steel cabinet, two reel wells, a head block, and a rack of meters under it.
  px(ctx, 129, 7, "#04030f", 47, 42);
  px(ctx, 130, 8, "#5a5a7a", 45, 40);
  px(ctx, 130, 8, "#8b8ba8", 45, 1);
  px(ctx, 130, 8, "#74749a", 1, 40);
  px(ctx, 174, 8, "#33334e", 1, 40);
  for (const [cx, cy] of STU_REELS) disc(ctx, cx, cy, 9, (dx, dy) => (dx * dx + dy * dy > 64 ? "#2c2c44" : "#1a1a2c"));
  px(ctx, 147, 25, "#2c2c44", 11, 4);
  px(ctx, 149, 26, "#c9ccd6", 7, 2);
  for (const x of [138, 167]) for (let k = 0; k < 8; k++) px(ctx, x + (x === 138 ? k * 1.3 : -k * 1.3), 26 - (k >> 2), "#14141f");
  px(ctx, 132, 30, "#2c2c44", 41, 1);
  px(ctx, 133, 32, "#0b0b18", 39, 8); // meter window
  for (const x of [133, 153]) { px(ctx, x, 32, "#e8dcb0", 19, 8); for (let k = 0; k < 7; k++) px(ctx, x + 2 + k * 2.4, 33 + Math.abs(k - 3) * 0.5, k > 4 ? "#c8392b" : "#3a3020"); }
  for (let i = 0; i < 6; i++) { px(ctx, 134 + i * 7, 42, "#0b0b18", 5, 4); px(ctx, 134 + i * 7, 42, i === 1 ? "#c8392b" : "#c9ccd6", 5, 3); px(ctx, 134 + i * 7, 44, "#6c6c88", 5, 1); }

  // The desk: a walnut top and a console with faders, knobs and meter wells.
  ditherSky(ctx, 0, STU_DESK, STU_W, 6, [[0, "#7a4c28"], [1, "#54321a"]]);
  px(ctx, 0, STU_DESK, "#b4794a", STU_W, 1);
  px(ctx, 0, STU_DESK + 6, "#1a0d06", STU_W, 1);
  ditherSky(ctx, 0, STU_DESK + 7, STU_W, STU_H - STU_DESK - 7, [[0, "#2a2a44"], [1, "#14142a"]]);
  px(ctx, 0, STU_DESK + 7, "#4a4a6e", STU_W, 1);
  // Fader channels.
  for (let i = 0; i < 9; i++) {
    const x = 60 + i * 7;
    px(ctx, x + 2, 59, "#07071a", 1, 15);
    disc(ctx, x + 2, 58, 1, () => (i % 3 === 0 ? "#ffd23f" : i % 3 === 1 ? "#4cc9f0" : "#ff4d6d"));
  }
  // Turntable on the left of the desk, in its own plinth.
  px(ctx, 6, 44, "#04030f", 42, 7);
  px(ctx, 7, 45, "#4a2c17", 40, 5);
  px(ctx, 7, 45, "#7a4c28", 40, 1);
  px(ctx, 6, 57, "#07071a", 44, 17);
  px(ctx, 7, 58, "#1c1c34", 42, 15);
  // Meter wells either side of the faders, a tiny scope in the left one.
  px(ctx, 9, 60, "#04100d", 38, 11);
  px(ctx, 125, 58, "#07071a", 49, 16);
  // Coffee on the right of the desk.
  px(ctx, 109, 42, "#04030f", 9, 8);
  px(ctx, 110, 43, "#e8e2d0", 7, 6);
  px(ctx, 110, 43, "#3a2212", 7, 1);
  px(ctx, 110, 47, "#c8392b", 7, 1);
  px(ctx, 117, 44, "#e8e2d0", 2, 1); px(ctx, 118, 45, "#e8e2d0", 1, 2); px(ctx, 117, 47, "#e8e2d0", 2, 1);
  // The boom arm: clamped to the desk, up to an elbow under the clock, then across to the mic.
  for (let k = 0; k < 28; k++) { px(ctx, 124 - k * 0.07, STU_DESK - k, "#04030f", 2, 1); px(ctx, 124 - k * 0.07, STU_DESK - k, "#8d89b8"); }
  for (let k = 0; k < 18; k++) { px(ctx, 122 - k, 21 + k * 0.56, "#04030f", 1, 2); px(ctx, 122 - k, 21 + k * 0.56, "#8d89b8"); }
  px(ctx, 121, 20, "#c9ccd6", 3, 3);
  px(ctx, 122, STU_DESK - 1, "#04030f", 5, 2);
}

export const STUDIO: World = {
  id: "studio", fullW: STU_W, fullH: STU_H, viewW: STU_W, viewH: STU_H,
  checkpoints: [{ name: "Radio booth", at: 0 }],
  backdrop: studioBackdrop,
  frame: (ctx, t) => {
    // Stars prickle; the mast's lamp blinks slowly; a few windows go dark and come back.
    for (let i = 0; i < 6; i++) if ((t + i * 13) % 37 < 3) px(ctx, STU_WIN.x + noise1(i, 71) * STU_WIN.w, STU_WIN.y + noise1(i, 72) * 18, "#ffffff");
    const beacon = t % 28 < 12;
    px(ctx, STU_MAST.x, STU_MAST.top - 1, beacon ? "#ff3b3b" : "#5a1414", 2, 2);
    if (beacon) { px(ctx, STU_MAST.x - 1, STU_MAST.top, "rgba(255,70,70,.5)"); px(ctx, STU_MAST.x + 2, STU_MAST.top, "rgba(255,70,70,.5)"); px(ctx, STU_MAST.x, STU_MAST.top - 2, "rgba(255,70,70,.5)", 2, 1); }
    // A little radio pulse rings out from the mast now and then.
    const ring = t % 56;
    if (ring < 18) for (let a = -2; a <= 2; a++) { const d = 3 + ring * 0.8; const ang = -Math.PI / 2 + a * 0.28; px(ctx, STU_MAST.x + Math.cos(ang) * d * 1.4, STU_MAST.top + Math.sin(ang) * d * 0.5, ring < 9 ? "#ff9f9f" : "#7a3a5e"); }

    // ON AIR, glowing, with the rare tube flicker.
    const dim = t % 131 < 2;
    px(ctx, 72, 9, dim ? "#5a1420" : "#d4243a", 34, 9);
    px(ctx, 72, 9, dim ? "#6a1a26" : "#f0506a", 34, 1);
    stuText(ctx, "ON", 76, 11, dim ? "#c98a8a" : "#fff4ea");
    stuText(ctx, "AIR", 91, 11, dim ? "#c98a8a" : "#fff4ea");
    if (!dim) for (let k = 0; k < 40; k++) { const gx = 66 + noise1(k, 74) * 46, gy = 5 + noise1(k, 75) * 18; if (gx < 71 || gx > 106 || gy > 19) px(ctx, gx, gy, "rgba(255,70,90,.32)"); }

    // The clock's colon ticks over.
    if (t % 14 < 7) { px(ctx, 116, 12, "#ff4d4d"); px(ctx, 116, 14, "#ff4d4d"); }

    // Tape reels turn, the left emptying into the right.
    STU_REELS.forEach(([cx, cy], i) => {
      const r = i === 0 ? 7 : 5, a = (t * (i === 0 ? 0.16 : 0.22));
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const d = x * x + y * y; if (d <= r * r && d > 4) px(ctx, cx + x, cy + y, d > (r - 1) * (r - 1) ? "#3e2a1c" : "#55392a"); }
      for (let k = 0; k < 3; k++) { const ang = a + (k * Math.PI * 2) / 3; for (let d = 1; d <= r - 1; d++) px(ctx, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, "#c9ccd6"); }
      px(ctx, cx - 1, cy - 1, "#fff4ea", 2, 2);
    });
    // Meter needles swing with the program.
    [0, 1].forEach((i) => {
      const x = 133 + i * 20, swing = 0.5 + Math.sin(t / 4 + i) * 0.25 + (noise1(Math.floor(t / 3), i + 80) - 0.5) * 0.35;
      const nx = x + 9 + (swing - 0.5) * 14;
      for (let k = 0; k < 6; k++) px(ctx, x + 9 + ((nx - x - 9) * k) / 6, 39 - k, "#1a1030");
    });

    // The turntable: a record going round under a slim arm.
    for (let y = -2; y <= 2; y++) for (let x = -9; x <= 9; x++) if ((x * x) / 81 + (y * y) / 4 <= 1) px(ctx, 20 + x, 47 + y, "#0b0b18");
    const spin = Math.round(Math.cos(t * 0.5) * 6), spinY = Math.round(Math.sin(t * 0.5));
    px(ctx, 20 + spin, 47 + spinY, "#4a4a78", 2, 1);
    px(ctx, 19, 47, "#ff4d6d", 3, 1);
    px(ctx, 37, 45, "#c9ccd6", 2, 2);
    for (let k = 0; k < 8; k++) px(ctx, 37 - k, 46 + k * 0.1, "#c9ccd6");
    // Steam off the coffee.
    for (let k = 0; k < 4; k++) { const age = (t * 0.5 + k * 5) % 18; if (age < 13) px(ctx, 112 + Math.sin(age * 0.5 + k) * 1.5, 41 - age, age < 7 ? "#a9a6d0" : "#4f4a85"); }

    // The host: a slow nod to the music, a blink, and now and then a word to the mic.
    const nod = Math.floor(t / 7) % 2;
    drawSprite(ctx, STU_HOST, STU_HOST_PAL, 79, 31 + nod);
    if (t % 53 < 2) { px(ctx, 83, 36 + nod, "#e0a982"); px(ctx, 88, 36 + nod, "#e0a982"); }
    const talking = t % 90 < 40 && Math.floor(t / 3) % 2 === 0;
    px(ctx, 85, 38 + nod, talking ? "#6e2b2b" : "#a8644a", 3, talking ? 2 : 1);
    // The desk front hides the host's lap, and the mic hangs off the boom in front of them.
    px(ctx, 0, STU_DESK, "#b4794a", STU_W, 1);
    ctx.fillStyle = "#7a4c28"; ctx.fillRect(75, STU_DESK + 1, 22, 1);
        px(ctx, 97, 31, "#04030f", 8, 7);
    px(ctx, 98, 32, "#55556e", 6, 5);
    for (let k = 0; k < 3; k++) px(ctx, 99 + k * 2, 33, "#8d8da8", 1, 3);
    px(ctx, 98, 32, "#a9a9c0", 6, 1);

    // The desk comes alive: fader caps drift, channel meters bounce, a tiny wave runs in the left well.
    for (let i = 0; i < 9; i++) {
      const y = 62 + Math.round(4 + Math.sin(t / (14 + i * 3) + i * 1.7) * 4);
      px(ctx, 60 + i * 7, y, "#04030f", 5, 3);
      px(ctx, 60 + i * 7, y, "#e8e2d0", 5, 2);
    }
    for (let x = 0; x < 36; x++) { const y = 65 + Math.round(Math.sin(x * 0.55 + t * 0.35) * 3.4); px(ctx, 10 + x, y, x % 2 ? "#5dffb0" : "#2fa77f"); }
    for (let c = 0; c < 8; c++) {
      const level = Math.round(3 + noise1(Math.floor(t / 2) + c, 90) * 10 * (0.6 + Math.sin(t / 9 + c) * 0.4));
      for (let k = 0; k < 13; k++) px(ctx, 127 + c * 6, 72 - k, k < level ? (k > 10 ? "#ff4d4d" : k > 7 ? "#ffd23f" : "#5dffb0") : "#14283a", 4, 1);
    }
    // The desk lamp's warm spill, thrown across the wood.
    for (let i = 0; i < 26; i++) { const x = 48 + noise1(i, 95) * 60, y = STU_DESK + 1 + noise1(i, 96) * 5; px(ctx, x, y, "rgba(255,216,140,.22)"); }
  },
  pos: () => ({ x: 90, y: 34 }),
  camera: () => ({ x: 0, y: 0 }),
};

// ======================= BOARD: a detective's office, the case on the corkboard =======================
// One in the morning: rain behind half-shut blinds with a red sign flickering beyond, stripes of light across the wall,
// a corkboard of photos and notes joined by red string, and a detective in a trench coat working out the link.
const BRD_W = 180, BRD_H = 76, BRD_DESK = 56;
const BRD_WIN = { x: 6, y: 8, w: 34, h: 34 };
const BRD_CORK = { x: 54, y: 5, w: 92, h: 43 };
const BRD_PINS: [number, number][] = [[62, 10], [79, 25], [97, 9], [122, 23], [139, 10], [134, 34]];
const BRD_COAT = [
  "..CCCCCCCCCC..",
  ".CCCCCCCCCCCC.",
  ".CCcCCCCCCcCC.",
  "CCCcCCCCCCcCC.",
  "CCCcCCCCCCcCC.",
  "CCCcCCccCCcCC.",
  "CCCcCCccCCcCC.",
  "CCCcBBBBBBcCC.",
  "dCCcCCccCCcCC.",
  "ss.cCCccCCc...",
  "...cCCccCCc...",
  "...cCCccCCc...",
  "...cCC..CCc...",
  "...cCC..CCc...",
];
const BRD_HEAD = [
  "....FFFFFF....",
  "...FFFFFFFF...",
  "...FbbbbbbF...",
  ".FFFFFFFFFFFF.",
  "....hhhhhh....",
  "....hhhhhh....",
  ".....ssss.....",
];
const BRD_PAL = { C: "#a98a5a", c: "#7c6240", d: "#6a5335", B: "#54402a", F: "#3a2c24", b: "#1a1210", h: "#2b1c16", s: "#d9a57c" };
const BRD_CAT = ["..k...k.....", "..kk.kk.....", "..kkkkkkkkk.", ".kgkkgkkkkkk", ".kkkkkkkkkkk", "..kkkkkkkkk."];
const BRD_CAT_PAL = { k: "#26201f", g: "#e8c14a" };

function boardBackdrop(ctx: CanvasRenderingContext2D) {
  // Plaster, darkest at the ceiling, warming toward the lamp.
  ditherSky(ctx, 0, 0, BRD_W, BRD_DESK, [[0, "#15100f"], [0.5, "#241814"], [1, "#35231a"]]);
  px(ctx, 0, 0, "#0b0807", BRD_W, 3);
  px(ctx, 0, 3, "#3d2a1e", BRD_W, 1);
  // Light through the blinds falls across the wall in slanted bars.
  for (let bar = 0; bar < 7; bar++) for (let y = 6; y < BRD_DESK; y++) {
    if (y % 8 < 3) continue;
    const from = 44 + y * 0.42 + bar * 2 - 6;
    for (let k = 0; k < 14 - bar * 2; k++) if (from + k < BRD_CORK.x - 2 && (Math.floor(from + k) + y) % 2 === 0) px(ctx, from + k, y, "#4a2e22");
  }

  // Window frame and the wet night beyond.
  const { x: wx, y: wy, w: ww, h: wh } = BRD_WIN;
  px(ctx, wx - 3, wy - 3, "#0b0807", ww + 6, wh + 7);
  px(ctx, wx - 2, wy - 2, "#5c4230", ww + 4, wh + 4);
  px(ctx, wx - 2, wy - 2, "#7d5d44", ww + 4, 1);
  px(ctx, wx - 1, wy - 1, "#0b0807", ww + 2, wh + 2);
  ditherSky(ctx, wx, wy, ww, wh, [[0, "#070b1c"], [0.6, "#131a35"], [1, "#2c2240"]]);
  for (let x = 0; x < ww; x++) { const h = 7 + Math.round(noise1(x >> 2, 11) * 10); px(ctx, wx + x, wy + wh - h, "#0a0c1e", 1, h); }
  const lit = rng(83);
  for (let i = 0; i < 12; i++) px(ctx, wx + lit() * ww, wy + wh - 2 - lit() * 12, lit() > 0.5 ? "#c9a24e" : "#6d5a34");
  px(ctx, wx - 4, wy + wh + 2, "#6a4c36", ww + 8, 2);
  px(ctx, wx - 4, wy + wh + 2, "#8a684c", ww + 8, 1);

  // The cork, in a wooden frame.
  const { x: bx, y: by, w: bw, h: bh } = BRD_CORK;
  px(ctx, bx - 3, by - 3, "#0b0807", bw + 6, bh + 6);
  px(ctx, bx - 2, by - 2, "#7a4f2c", bw + 4, bh + 4);
  px(ctx, bx - 2, by - 2, "#a06d3f", bw + 4, 1);
  px(ctx, bx - 2, by - 2, "#a06d3f", 1, bh + 4);
  px(ctx, bx - 1, by - 1, "#3b2412", bw + 2, bh + 2);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    const n = noise2(x * 0.35, y * 0.35, 5) * 0.45 + noise1(x * 7 + y * 13, 6) * 0.55;
    px(ctx, bx + x, by + y, n > 0.74 ? "#d3a56e" : n > 0.46 ? "#b98a55" : n > 0.28 ? "#a67845" : "#8c6236");
  }
  // Pinned evidence: small photos with something to look at, typed notes, a torn map.
  const photo = (x: number, y: number, sky: string, shape: string, tall: number) => {
    px(ctx, x + 1, y + 1, "#00000055", 11, 13);
    px(ctx, x, y, "#efe6cd", 11, 13);
    px(ctx, x + 1, y + 1, sky, 9, 9);
    px(ctx, x + 4, y + 10 - tall, shape, 3, tall);
    px(ctx, x + 3, y + 8 - tall, shape, 5, 2);
    px(ctx, x + 2, y + 11, "#a89a7c", 7, 1);
  };
  BRD_PINS.forEach(([x, y], i) => photo(x - 5, y, ["#5e7f8c", "#8c5e6a", "#6a7d55", "#7d6a9a", "#a07a48", "#4f6f8f"][i]!, "#1d1412", 3 + (i % 3)));
  const note = (x: number, y: number, w: number, h: number, c: string) => {
    px(ctx, x + 1, y + 1, "#00000055", w, h);
    px(ctx, x, y, c, w, h);
    for (let l = 2; l < h - 1; l += 2) px(ctx, x + 1, y + l, "#7a6f58", w - 2 - (l % 3), 1);
  };
  note(70, 9, 13, 10, "#f2dc7c");
  note(106, 7, 11, 13, "#efe6cd");
  note(58, 30, 15, 13, "#efe6cd");
  note(107, 33, 15, 11, "#f2b0a0");
  // A torn street map with a ringed spot.
  px(ctx, 84, 28, "#9fb48e", 17, 15);
  for (let k = 0; k < 15; k++) { px(ctx, 84 + k, 33 + (k >> 2), "#efe6cd"); px(ctx, 92, 28 + k, "#efe6cd"); }
  for (const [mx, my] of [[97, 35], [99, 37], [97, 39], [95, 37]] as const) px(ctx, mx, my, "#c8232c");

  // Filing cabinet, olive steel, three drawers with card labels.
  px(ctx, 153, 16, "#0b0807", 23, 40);
  px(ctx, 154, 17, "#4d5240", 21, 39);
  px(ctx, 154, 17, "#6c7258", 21, 1);
  for (let d = 0; d < 3; d++) {
    const y = 19 + d * 12;
    px(ctx, 156, y, "#3a3e30", 17, 10);
    px(ctx, 156, y, "#5e644d", 17, 1);
    px(ctx, 161, y + 2, "#efe6cd", 7, 3);
    px(ctx, 162, y + 3, "#7a6f58", 5, 1);
    px(ctx, 162, y + 7, "#b9b39a", 5, 1);
  }

  // The desk: scarred walnut top, drawers below.
  px(ctx, 0, BRD_DESK, "#0b0807", BRD_W, 1);
  ditherSky(ctx, 0, BRD_DESK + 1, BRD_W, 5, [[0, "#8a5a33"], [1, "#6a4224"]]);
  ditherSky(ctx, 0, BRD_DESK + 6, BRD_W, BRD_H - BRD_DESK - 6, [[0, "#3c2414"], [1, "#22130a"]]);
  px(ctx, 0, BRD_DESK + 6, "#0b0807", BRD_W, 1);
  for (let d = 0; d < 4; d++) {
    const x = 8 + d * 43;
    px(ctx, x, BRD_DESK + 9, "#1a0e07", 36, 9);
    px(ctx, x + 1, BRD_DESK + 10, "#52321c", 34, 7);
    px(ctx, x + 1, BRD_DESK + 10, "#6a4426", 34, 1);
    px(ctx, x + 15, BRD_DESK + 13, "#d0a860", 6, 1);
  }

  // Typewriter with a page in it.
  px(ctx, 53, 47, "#efe6cd", 15, 6);
  for (let l = 48; l < 53; l += 2) px(ctx, 55, l, "#7a6f58", 11, 1);
  px(ctx, 50, 52, "#14161a", 21, 5);
  px(ctx, 50, 52, "#3a3e46", 21, 1);
  for (let k = 0; k < 9; k++) px(ctx, 52 + k * 2, 54 + (k % 2), "#c9ccd6");

  // A stack of case files, and the magnifying glass on top of the blotter.
  for (let f = 0; f < 5; f++) px(ctx, 130 + (f % 2), 55 - f * 2, f % 2 ? "#c9a76a" : "#b18f55", 20, 2);
  px(ctx, 142, 47, "#efe6cd", 5, 1);
  for (let k = 0; k < 5; k++) px(ctx, 113 + k, 58 - k * 0.2, "#5b3a20", 2, 1);
  disc(ctx, 108, 58, 3, (dx, dy) => (dx * dx + dy * dy >= 7 ? "#d9b05c" : dx + dy < 0 ? "#cfe7ee" : "#7ea3b0"));

  // Coffee in a chipped mug.
  px(ctx, 83, 50, "#0b0807", 8, 7);
  px(ctx, 84, 51, "#d8d0bd", 6, 5);
  px(ctx, 84, 51, "#3b2412", 6, 1);
  px(ctx, 90, 52, "#d8d0bd", 2, 1); px(ctx, 91, 53, "#d8d0bd", 1, 2); px(ctx, 90, 54, "#d8d0bd", 2, 1);

  // Banker's lamp: brass stem, base, and a green shade.
  px(ctx, 25, 54, "#8a6a2c", 12, 2);
  px(ctx, 25, 54, "#e0bb62", 12, 1);
  px(ctx, 30, 45, "#b9933f", 2, 9);
  px(ctx, 21, 40, "#0b0807", 20, 6);
  px(ctx, 22, 41, "#1f6b4a", 18, 4);
  px(ctx, 22, 41, "#3fa877", 18, 1);
  px(ctx, 22, 44, "#134530", 18, 1);
  px(ctx, 36, 46, "#b9933f", 1, 3);
  // The lamp's pool of light on the wood.
  for (let i = 0; i < 80; i++) { const x = 10 + noise1(i, 21) * 44, y = BRD_DESK + 1 + noise1(i, 22) * 4; if ((Math.round(x) + Math.round(y)) % 2 === 0) px(ctx, x, y, "#c9925a"); }
}

export const BOARD: World = {
  id: "board", fullW: BRD_W, fullH: BRD_H, viewW: BRD_W, viewH: BRD_H,
  checkpoints: [{ name: "The case room", at: 0 }],
  backdrop: boardBackdrop,
  frame: (ctx, t) => {
    const { x: wx, y: wy, w: ww, h: wh } = BRD_WIN;
    // The red sign across the street stutters.
    const sign = !(t % 97 < 3 || (t % 97 > 6 && t % 97 < 8));
    px(ctx, wx + 7, wy + 9, sign ? "#ff3a4a" : "#4a1820", 16, 5);
    if (sign) { px(ctx, wx + 8, wy + 10, "#ffc0b0", 14, 1); for (let k = 0; k < 18; k++) px(ctx, wx + 4 + noise1(k, 31) * 24, wy + 6 + noise1(k, 32) * 12, "rgba(255,60,70,.25)"); }
    // Rain falls behind the glass, then the blinds cut across it all.
    for (let i = 0; i < 22; i++) {
      const rx = wx + noise1(i, 33) * (ww - 1), ry = (noise1(i, 34) * wh + t * (1.6 + noise1(i, 35))) % wh;
      px(ctx, rx, wy + ry, "#7f97c4");
      if (ry < wh - 1) px(ctx, rx, wy + ry + 1, "#465a88");
    }
    for (let y = 0; y < wh; y += 5) { px(ctx, wx, wy + y, "#c6b48c", ww, 1); px(ctx, wx, wy + y + 1, "#6d5f47", ww, 1); }
    px(ctx, wx + 5, wy, "#3a3226", 1, wh);
    px(ctx, wx + ww - 6, wy, "#3a3226", 1, wh);

    // Red string from pin to pin, with a slight slack that breathes and a glint running along it now and then.
    const glint = t % 90;
    BRD_PINS.slice(1).forEach(([bx, by], i) => {
      const [ax, ay] = BRD_PINS[i]!;
      const sag = 2 + Math.round(Math.sin(t / 22 + i));
      const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.2);
      for (let k = 0; k <= steps; k++) {
        const u = k / steps, x = ax + (bx - ax) * u, y = ay + (by - ay) * u + sag * 4 * u * (1 - u);
        px(ctx, x, y + 1, "rgba(0,0,0,.28)");
        const lit = glint < 40 && Math.abs(glint - (i * 8 + u * 8)) < 1.4;
        px(ctx, x, y, lit ? "#ffd0c0" : k % 5 === 0 ? "#ff5a4f" : "#d3202c");
      }
    });
    for (const [x, y] of BRD_PINS) { px(ctx, x - 1, y - 1, "#7a1018", 3, 3); px(ctx, x - 1, y - 1, "#ff5a4f", 2, 2); px(ctx, x - 1, y - 1, "#ffd0c0"); }

    // The detective: weight shifts, the head tilts, and now and then a hand goes up to a pin.
    const dx = 88, dy = 34, step = Math.floor(t / 26) % 3 === 2 ? 1 : 0;
    const tilt = t % 170 > 110 && t % 170 < 150 ? 2 : Math.floor(t / 40) % 4 === 1 ? -1 : 0;
    drawSprite(ctx, BRD_COAT, BRD_PAL, dx + step, dy + 7);
    drawSprite(ctx, BRD_HEAD, BRD_PAL, dx + step + tilt, dy);
    const reach = t % 170 > 110 && t % 170 < 150;
    if (reach) { for (let k = 0; k < 9; k++) px(ctx, dx + step + 13 + k * 0.7, dy + 9 - k, "#a98a5a", 2, 1); px(ctx, dx + step + 19, dy - 1, "#d9a57c", 2, 2); }
    else { px(ctx, dx + step + 13, dy + 9, "#a98a5a", 1, 7); px(ctx, dx + step + 13, dy + 16, "#d9a57c", 1, 2); }
    // The desk hides the detective's legs.
    ditherSky(ctx, 80, BRD_DESK + 1, 28, 5, [[0, "#8a5a33"], [1, "#6a4224"]]);
    px(ctx, 80, BRD_DESK, "#0b0807", 28, 1);
    px(ctx, 83, 50, "#0b0807", 8, 7);
    px(ctx, 84, 51, "#d8d0bd", 6, 5);
    px(ctx, 84, 51, "#3b2412", 6, 1);
    px(ctx, 90, 52, "#d8d0bd", 2, 1); px(ctx, 91, 53, "#d8d0bd", 1, 2); px(ctx, 90, 54, "#d8d0bd", 2, 1);
    disc(ctx, 108, 58, 3, (x, y) => (x * x + y * y >= 7 ? "#d9b05c" : x + y < 0 ? "#cfe7ee" : "#7ea3b0"));

    // Steam off the coffee.
    for (let k = 0; k < 4; k++) { const age = (t * 0.5 + k * 5) % 16; if (age < 12) px(ctx, 87 + Math.sin(age * 0.5 + k) * 1.5, 49 - age, age < 6 ? "#b9aca0" : "#6a5a50"); }
    // The lamp's bulb under the shade, with the rare dip.
    const dip = t % 151 < 2;
    px(ctx, 25, 46, dip ? "#a8905a" : "#fff0b8", 12, 1);
    if (!dip) for (let i = 0; i < 26; i++) { const x = 14 + noise1(i, 41) * 34, y = 47 + noise1(i, 42) * 8; if ((Math.round(x) + Math.round(y)) % 2 === 0) px(ctx, x, y, "rgba(255,226,150,.2)"); }
    // The office cat sleeps on the files, tail twitching, one eye opening.
    const awake = t % 140 < 24;
    drawSprite(ctx, BRD_CAT, { ...BRD_CAT_PAL, g: awake ? "#e8c14a" : "#26201f" }, 133, 40);
    const flick = Math.floor(t / 9) % 5 === 0 ? -1 : 0;
    px(ctx, 145, 44 + flick, "#26201f", 2, 1);
    px(ctx, 147, 43 + flick, "#26201f", 1, 1);
  },
  pos: () => ({ x: 90, y: 34 }),
  camera: () => ({ x: 0, y: 0 }),
};

// ---- Party trivia: an arcade at closing time. A row of cabinets, the big quiz machine in the middle. ----
const ARC_W = 200, ARC_H = 92, ARC_FLOOR = 62;
const ARC_FONT: Record<string, string[]> = {
  Q: ["XXX", "X.X", "X.X", "XXX", "..X"], U: ["X.X", "X.X", "X.X", "X.X", "XXX"], I: ["XXX", ".X.", ".X.", ".X.", "XXX"], Z: ["XXX", "..X", ".X.", "X..", "XXX"],
  P: ["XXX", "X.X", "XXX", "X..", "X.."], L: ["X..", "X..", "X..", "X..", "XXX"], A: ["XXX", "X.X", "XXX", "X.X", "X.X"], Y: ["X.X", "X.X", ".X.", ".X.", ".X."],
  "?": ["XXX", "..X", ".XX", "...", ".X."], "1": ["XX.", ".X.", ".X.", ".X.", "XXX"], "2": ["XXX", "..X", "XXX", "X..", "XXX"],
};
const arcText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: string) => {
  [...text].forEach((ch, i) => ARC_FONT[ch]?.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === "X") px(ctx, x + i * 4 + rx, y + ry, c); })));
};
type ArcCab = { x: number; w: number; top: number; foot: number; body: string; hi: string; lo: string; sign: string; glow: string };
const ARC_CABS: ArcCab[] = [
  { x: 4, w: 28, top: 22, foot: 68, body: "#1c3f7a", hi: "#3a6cc0", lo: "#102347", sign: "#58d6ff", glow: "#58d6ff" },
  { x: 37, w: 30, top: 18, foot: 72, body: "#6a1c63", hi: "#a83a9c", lo: "#3a0f38", sign: "#ff7fe0", glow: "#ff7fe0" },
  { x: 80, w: 40, top: 6, foot: 82, body: "#3d1d86", hi: "#6d42d8", lo: "#201048", sign: "#ffd23f", glow: "#ffe27a" },
  { x: 133, w: 30, top: 18, foot: 72, body: "#17614a", hi: "#2fa47e", lo: "#0b3628", sign: "#4dffa6", glow: "#4dffa6" },
  { x: 168, w: 28, top: 22, foot: 68, body: "#7a3a14", hi: "#c8702c", lo: "#47200a", sign: "#ffb347", glow: "#ffb347" },
];
/** Where each cabinet's screen sits. */
const arcScreen = (c: ArcCab) => ({ x: c.x + 4, y: c.top + 11, w: c.w - 8, h: Math.round((c.foot - c.top) * 0.36) });

function arcadeBackdrop(ctx: CanvasRenderingContext2D) {
  // Wall: deep violet, dithered lighter towards the floor, with a run of neon tube along the top.
  ditherSky(ctx, 0, 0, ARC_W, ARC_FLOOR, [[0, "#0a0518"], [0.6, "#1a0c38"], [1, "#2c1458"]]);
  px(ctx, 0, 3, "#7a1a4e", ARC_W, 3);
  px(ctx, 0, 4, "#ff5aa8", ARC_W, 1);
  for (let x = 0; x < ARC_W; x++) if ((x + 7) % 2 === 0) px(ctx, x, 7, "#4a1440");
  // Wall tiles behind the machines, half lost in the dark.
  for (let y = 12; y < ARC_FLOOR - 8; y += 8) for (let x = (y % 16 ? 4 : 0); x < ARC_W; x += 8) if (noise1(x + y * 7, 3) > 0.72) px(ctx, x, y, "#3a1f6e", 2, 2);
  // Skirting.
  px(ctx, 0, ARC_FLOOR - 3, "#120828", ARC_W, 3);
  px(ctx, 0, ARC_FLOOR - 3, "#46277e", ARC_W, 1);

  // Carpet: dark, with loud little shapes that get bigger towards the viewer.
  ditherSky(ctx, 0, ARC_FLOOR, ARC_W, ARC_H - ARC_FLOOR, [[0, "#120a2c"], [1, "#1f1244"]]);
  const pal = ["#ff3f7f", "#58d6ff", "#ffd23f", "#4dffa6"];
  for (let i = 0; i < 95; i++) {
    const y = ARC_FLOOR + 1 + Math.floor(noise1(i, 11) * (ARC_H - ARC_FLOOR - 2));
    const x = Math.floor(noise1(i, 12) * ARC_W);
    const c = pal[i % 4]!, big = y > ARC_FLOOR + 16;
    if (i % 3 === 0 && big) { px(ctx, x, y, c, 3, 1); px(ctx, x + 1, y - 1, c, 1, 3); }
    else if (i % 3 === 1) { px(ctx, x, y, c, big ? 2 : 1, 1); }
    else { px(ctx, x, y, c); px(ctx, x + 1, y + 1, c); }
  }

  for (const c of ARC_CABS) {
    const h = c.foot - c.top;
    // Pool of screen light on the carpet, dithered.
    for (let y = c.foot; y < Math.min(ARC_H, c.foot + 8); y++) for (let x = c.x - 2; x < c.x + c.w + 2; x++) {
      if (((x + y) & 1) === 0 && noise1(x * 3 + y, 8) > 0.2 + (y - c.foot) * 0.09) px(ctx, x, y, c.glow === "#ffe27a" ? "#5a4a70" : "#332860");
    }
    // Shadow and body with a lit left edge and dark right side.
    px(ctx, c.x + 1, c.foot, "#05030c", c.w, 2);
    px(ctx, c.x, c.top, c.body, c.w, h);
    px(ctx, c.x, c.top, c.hi, 2, h);
    px(ctx, c.x + c.w - 3, c.top, c.lo, 3, h);
    for (let y = c.top; y < c.foot; y++) if (y & 1) px(ctx, c.x + c.w - 4, y, c.lo);
    // Outline.
    px(ctx, c.x - 1, c.top, "#05030c", 1, h); px(ctx, c.x + c.w, c.top, "#05030c", 1, h); px(ctx, c.x, c.top - 1, "#05030c", c.w, 1);
    // Marquee box.
    px(ctx, c.x + 1, c.top + 1, "#05030c", c.w - 2, 9);
    px(ctx, c.x + 2, c.top + 2, c.sign, c.w - 4, 7);
    px(ctx, c.x + 2, c.top + 2, "#ffffff55", c.w - 4, 1);
    // Bezel and glass.
    const g = arcScreen(c);
    px(ctx, g.x - 2, g.y - 1, "#05030c", g.w + 4, g.h + 3);
    px(ctx, g.x - 1, g.y, "#201a3a", g.w + 2, g.h + 1);
    px(ctx, g.x, g.y, "#04120e", g.w, g.h);
    // Control shelf, sticking out towards the viewer.
    const shelf = g.y + g.h + 3;
    px(ctx, c.x - 1, shelf, "#05030c", c.w + 2, 7);
    px(ctx, c.x, shelf, "#3f3a5e", c.w, 5);
    px(ctx, c.x, shelf, "#716c98", c.w, 1);
    // Coin door.
    const door = shelf + 9;
    if (door + 8 < c.foot) {
      px(ctx, c.x + c.w / 2 - 6, door, "#05030c", 12, 9);
      px(ctx, c.x + c.w / 2 - 5, door + 1, "#2b2545", 10, 7);
      px(ctx, c.x + c.w / 2 - 3, door + 2, "#ff3f7f", 1, 3);
      px(ctx, c.x + c.w / 2 + 2, door + 2, "#ff3f7f", 1, 3);
    }
  }
  const mid = ARC_CABS[2]!;
  arcText(ctx, "QUIZ", mid.x + 12, mid.top + 3, "#5a0830");
  arcText(ctx, "PLAY", ARC_CABS[1]!.x + 7, ARC_CABS[1]!.top + 3, "#3a0f38");
  // A stool waiting at the next machine along.
  px(ctx, 145, 80, "#05030c", 12, 3); px(ctx, 146, 79, "#d6273c", 10, 2); px(ctx, 150, 83, "#716c98", 2, 6); px(ctx, 147, 88, "#46406a", 8, 1);
}

const ARC_PLAYER = ["..hhhh..", ".hhhhhh.", ".hhhhhh.", "..ssss..", ".bbbbbb.", "bbbbbbbb", "bbbbbbbb", "s.bbbb.s", "..bbbb..", "..p..p..", "..p..p..", "..p..p.."];

function arcadeFrame(ctx: CanvasRenderingContext2D, t: number) {
  // Ceiling tube's rare flicker.
  if (t % 149 < 2) px(ctx, 0, 4, "#7a1a4e", ARC_W, 1);
  ARC_CABS.forEach((c, n) => {
    const g = arcScreen(c);
    // Marquee bulbs run along the sign.
    for (let i = 0; i < c.w - 4; i += 3) if ((i / 3 + Math.floor(t / 3)) % 3 === 0) px(ctx, c.x + 2 + i, c.top + 8, "#ffffff");
    // Attract modes, each cabinet its own.
    if (n === 0) { // falling blocks
      const cols = ["#ff3f7f", "#58d6ff", "#ffd23f"];
      for (let i = 0; i < 4; i++) { const cx = g.x + 2 + (i * 5) % (g.w - 4); const cy = g.y + ((t + i * 11) % (g.h + 8)) - 4; if (cy >= g.y && cy < g.y + g.h - 2) px(ctx, cx, cy, cols[i % 3]!, 3, 2); }
      px(ctx, g.x, g.y + g.h - 2, "#2f6f73", g.w, 2);
    } else if (n === 1) { // paddles and a ball
      const bx = Math.abs(((t * 2) % ((g.w - 3) * 2)) - (g.w - 3)), by = Math.abs((t % ((g.h - 1) * 2)) - (g.h - 1));
      px(ctx, g.x + bx, g.y + by, "#ffffff");
      px(ctx, g.x + 1, g.y + clamp(by - 2, 0, g.h - 5), "#ff7fe0", 1, 5);
      px(ctx, g.x + g.w - 2, g.y + clamp(by - 2, 0, g.h - 5), "#ff7fe0", 1, 5);
    } else if (n === 2) { // the quiz machine: a ? and four answer lamps, one lit at a time
      if (t % 20 < 14) arcText(ctx, "?", g.x + g.w / 2 - 1, g.y + 4, "#4dffa6");
      const pick = Math.floor(t / 6) % 4;
      ["#ff5a6e", "#5ab8ff", "#ffc933", "#3fdc8a"].forEach((col, i) => {
        px(ctx, g.x + 3 + i * Math.floor((g.w - 6) / 4), g.y + g.h - 7, i === pick ? col : "#17324a", Math.floor((g.w - 6) / 4) - 1, 4);
      });
      px(ctx, g.x, g.y + (t % g.h), "#ffffff14", g.w, 1); // a slow roll bar
      const shelf = g.y + g.h + 3;
      ["#d6273c", "#1c68d4", "#ffc933", "#1fc46a"].forEach((col, i) => {
        const bx = c.x + 7 + i * 7;
        px(ctx, bx, shelf + 1, i === pick ? "#ffffff" : col, 4, 2);
        px(ctx, bx, shelf + 3, "#05030c", 4, 1);
      });
    } else if (n === 3) { // a little ship over stars
      for (let i = 0; i < 5; i++) px(ctx, g.x + (((noise1(i, 21) * g.w - t) % g.w) + g.w) % g.w, g.y + 1 + noise1(i, 22) * (g.h - 3), "#c8fff0");
      const sy = g.y + Math.round(g.h / 2 + Math.sin(t / 7) * 3) - 1;
      px(ctx, g.x + 3, sy, "#4dffa6", 4, 1); px(ctx, g.x + 4, sy - 1, "#4dffa6", 1, 3); if (t % 4 < 2) px(ctx, g.x + 2, sy, "#ffb347");
    } else { // a high-score table scrolling by
      for (let i = 0; i < 4; i++) { const ly = g.y + ((i * 5 - Math.floor(t / 2)) % (g.h + 2) + g.h + 2) % (g.h + 2); if (ly < g.y + g.h - 1) { px(ctx, g.x + 2, ly, "#ffb347", 6, 1); px(ctx, g.x + 11, ly, "#fff3b0", g.w - 14, 1); } }
    }
  });
  // Someone at the big machine, shifting their weight and hammering a button.
  const mid = ARC_CABS[2]!;
  const bob = t % 16 < 8 ? 0 : 1;
  const pal: Record<string, string> = { h: "#3a2233", s: "#e0a982", b: "#ff3f7f", p: "#1b2a56" };
  ARC_PLAYER.forEach((row, ry) => [...row].forEach((ch, rx) => {
    const down = ry < 9 ? bob : 0; // the feet stay planted
    if (ch !== ".") px(ctx, mid.x + mid.w / 2 - 4 + rx, 76 + ry + down, pal[ch]!);
  }));
  if (t % 6 < 3) px(ctx, mid.x + mid.w / 2 + 4, 82 + bob, "#e0a982", 1, 1);
}

export const ARCADE: World = {
  id: "arcade", fullW: ARC_W, fullH: ARC_H, viewW: ARC_W, viewH: ARC_H,
  checkpoints: [{ name: "Arcade", at: 0 }],
  backdrop: arcadeBackdrop,
  frame: (ctx, t) => arcadeFrame(ctx, t),
  pos: () => ({ x: ARC_W / 2, y: ARC_H / 2 }),
  camera: () => ({ x: 0, y: 0 }),
};

// ======================= LADDER: a ladder up a tall lighthouse at dusk =======================
// The sun going down into the sea on the left, a keeper's cottage on the headland, and one long ladder bolted to the
// tower. Twelve brass rungs, galleries at the two safe ledges, and a dark lamp at the top that only lights for a climber
// who reaches it. The sky runs from sunset at the foot to stars and a moon by the lamp, so every rung feels higher.
const LAD_W = 320, LAD_H = 610, LAD_X = 204, LAD_FOOT = 546, LAD_STEP = 40, LAD_SEA = 536;
const LAD_SHORE = 150;
const ladRungY = (k: number) => LAD_FOOT - k * LAD_STEP;
const ladTop = ladRungY(RUNGS);
/** The tower's half width at a height: it narrows all the way up. */
const ladHalf = (y: number) => Math.round(17 + (clamp(y, ladTop, LAD_FOOT + 6) - ladTop) * 0.041);
/** Where each rung sits on the journey: the climb is even on the map however uneven the points are. */
const LAD_AT = [0, ...LADDER.map((p) => p / LADDER[RUNGS - 1]!)];
const ladHeight = (f: number) => {
  const v = clamp(f, 0, 1);
  let k = 0;
  while (k < RUNGS - 1 && v > LAD_AT[k + 1]!) k++;
  return k + (v - LAD_AT[k]!) / (LAD_AT[k + 1]! - LAD_AT[k]!);
};
const LAD_FONT: Record<string, string[]> = {
  "0": ["XXX", "X.X", "X.X", "X.X", "XXX"], "1": [".X.", "XX.", ".X.", ".X.", "XXX"], "2": ["XXX", "..X", "XXX", "X..", "XXX"], "3": ["XXX", "..X", ".XX", "..X", "XXX"],
  "4": ["X.X", "X.X", "XXX", "..X", "..X"], "5": ["XXX", "X..", "XXX", "..X", "XXX"], "6": ["XXX", "X..", "XXX", "X.X", "XXX"], "7": ["XXX", "..X", ".X.", ".X.", ".X."],
  "8": ["XXX", "X.X", "XXX", "X.X", "XXX"], "9": ["XXX", "X.X", "XXX", "..X", "XXX"], S: ["XXX", "X..", "XXX", "..X", "XXX"], A: ["XXX", "X.X", "XXX", "X.X", "X.X"], F: ["XXX", "X..", "XX.", "X..", "X.."], E: ["XXX", "X..", "XX.", "X..", "XXX"],
};
const ladText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: string) => {
  [...text].forEach((ch, i) => LAD_FONT[ch]?.forEach((row, ry) => [...row].forEach((v, rx) => { if (v === "X") px(ctx, x + i * 4 + rx, y + ry, c); })));
};
/** Cream and red paint, lit from the sunset side round to the shadow side. */
const LAD_CREAM = ["#ffe9c6", "#fbcfa0", "#e6a188", "#b0708a", "#6f4a80", "#43306a"];
const LAD_RED = ["#f4714f", "#d8454a", "#a92e52", "#752357", "#4c1b52", "#301445"];
const LAD_INK = "#170f30";

/** A long flat cloud lit from below by the low sun. */
function ladCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rim: string, mid: string, top: string, seed: number) {
  for (let i = 0; i < w; i++) {
    const edge = Math.min(1, Math.min(i, w - 1 - i) / (w * 0.22));
    const tall = Math.round(h * edge * (0.45 + noise2((x + i) * 0.09, seed, seed) * 0.75));
    const under = Math.round(noise2((x + i) * 0.14, seed + 9, seed) * 1.6);
    for (let j = 0; j < tall; j++) {
      const row = y - j + under;
      const c = j < 2 ? rim : j < tall * 0.55 ? ((i + row) % 2 === 0 && j < 3 ? rim : mid) : ((i + row) % 2 === 0 && j < tall * 0.7 ? mid : top);
      px(ctx, x + i, row, c);
    }
  }
}

/** The ground on the headland, sloping away into the sea on the left. */
const ladLand = (x: number) => {
  const swell = Math.sin(x * 0.05) * 1.5 + (noise2(x * 0.11, 3, 5) - 0.5) * 3;
  return Math.round(548 + swell + Math.max(0, 138 - x) * 0.72);
};

function ladSky(ctx: CanvasRenderingContext2D) {
  ditherSky(ctx, 0, 0, LAD_W, LAD_SEA, [[0, "#0c0b2e"], [0.14, "#15134a"], [0.32, "#2c2069"], [0.48, "#54297f"], [0.62, "#8f3983"], [0.74, "#c94f73"], [0.85, "#ee7d55"], [0.94, "#fbb25f"], [1, "#ffdc8c"]]);
  // Stars thin out as the sky warms. The moon is a thin crescent, up where only the lamp keeps it company.
  const r = rng(77);
  for (let i = 0; i < 240; i++) {
    const y = Math.pow(r(), 1.7) * 300, x = r() * LAD_W, big = r();
    px(ctx, x, y, y > 200 ? "#8d6fb0" : big > 0.86 ? "#ffffff" : big > 0.4 ? "#c7c3f0" : "#7f7cc8");
    if (big > 0.975 && y < 170) { px(ctx, x - 1, y, "#8d8ad8"); px(ctx, x + 1, y, "#8d8ad8"); px(ctx, x, y - 1, "#8d8ad8"); px(ctx, x, y + 1, "#8d8ad8"); }
  }
  for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) {
    if (dx * dx + dy * dy <= 81 && (dx - 4) * (dx - 4) + (dy + 2) * (dy + 2) > 62) px(ctx, 282 + dx, 46 + dy, dx < -5 ? "#fff6d6" : "#f3dfa8");
  }
  // Clouds in layers: cold wisps high up, a rose bank halfway, gold and coral near the sea.
  const high: [number, number, number][] = [[6, 118, 62], [92, 150, 46], [252, 132, 68], [28, 186, 74], [262, 196, 58]];
  high.forEach(([x, y, w], i) => ladCloud(ctx, x, y, w, 4, "#7a5aa8", "#463a8c", "#2f2a78", 20 + i));
  const bank: [number, number, number, number][] = [[-20, 300, 130, 9], [96, 322, 84, 7], [226, 292, 120, 10], [10, 346, 104, 10], [250, 340, 90, 8], [128, 368, 60, 5]];
  bank.forEach(([x, y, w, h], i) => ladCloud(ctx, x, y, w, h, "#f6a28c", "#b9587f", "#7b3a80", 40 + i));
  const low: [number, number, number, number][] = [[-14, 430, 118, 8], [214, 412, 130, 10], [36, 470, 136, 9], [236, 462, 110, 8], [-30, 506, 92, 6], [150, 498, 70, 5], [254, 512, 80, 6]];
  low.forEach(([x, y, w, h], i) => ladCloud(ctx, x, y, w, h, "#ffe2a0", "#f79a62", "#d8606e", 60 + i));
  // The sun, half gone, in a dithered glow.
  const SUN = { x: 74, y: LAD_SEA - 3, r: 19 };
  for (let y = SUN.y - 64; y < LAD_SEA; y++) for (let x = SUN.x - 86; x < SUN.x + 86; x++) {
    const d = Math.hypot(x - SUN.x, (y - SUN.y) * 1.2);
    if (x < 0 || d <= SUN.r || d > 80) continue;
    if ((1 - (d - SUN.r) / 61) * 15 > BAYER[y & 3]![x & 3]! + 3) px(ctx, x, y, d < 34 ? "#fff0b4" : "#ffcf80");
  }
  disc(ctx, SUN.x, SUN.y, SUN.r, (dx, dy) => (dy > 7 ? "#ff9d4f" : dy > 1 ? "#ffc463" : dx * dx + dy * dy < 170 ? "#fff6c9" : "#ffe28f"));
  // A thin cloud across the sun's face.
  px(ctx, 44, LAD_SEA - 12, "#e4685f", 58, 1); px(ctx, 52, LAD_SEA - 11, "#c9506c", 40, 1); px(ctx, 62, LAD_SEA - 19, "#f08a5c", 34, 1);
  // Far capes on the horizon, the further the paler.
  for (let x = 0; x < LAD_W; x++) {
    const far = LAD_SEA - Math.max(0, Math.sin(x * 0.012 + 3.5) * 13 + Math.sin(x * 0.05) * 2.5 - 2);
    for (let y = Math.round(far); y < LAD_SEA; y++) px(ctx, x, y, "#b4577c");
    const near = LAD_SEA - Math.max(0, 11 - x * 0.2 + Math.sin(x * 0.09) * 1.5);
    for (let y = Math.round(near); y < LAD_SEA; y++) px(ctx, x, y, "#6a3276");
  }
  // The town on the far cape, just starting to light up.
  for (const x of [262, 268, 277, 283, 296, 304]) px(ctx, x, LAD_SEA - 3 - (x % 3), "#ffe08a");
}

function ladSeaAndLand(ctx: CanvasRenderingContext2D) {
  ditherSky(ctx, 0, LAD_SEA, LAD_W, LAD_H - LAD_SEA, [[0, "#f5a160"], [0.1, "#d8606a"], [0.28, "#94397a"], [0.55, "#4d2776"], [1, "#1c1650"]]);
  px(ctx, 0, LAD_SEA, "#ffd98f", LAD_W, 1);
  for (let i = 0; i < 90; i++) {
    const y = LAD_SEA + 3 + Math.floor(noise1(i, 31) * (LAD_H - LAD_SEA - 4)), near = (y - LAD_SEA) / (LAD_H - LAD_SEA);
    px(ctx, noise1(i, 32) * LAD_W, y, near < 0.25 ? "#ffb678" : near < 0.5 ? "#c0527f" : "#6a3a92", 3 + Math.floor(near * 12), 1);
  }
  // A little fishing boat coming home, far out.
  px(ctx, 138, LAD_SEA + 3, "#2a1540", 9, 1); px(ctx, 139, LAD_SEA + 4, "#2a1540", 7, 1); px(ctx, 142, LAD_SEA - 4, "#2a1540", 1, 7); px(ctx, 143, LAD_SEA - 3, "#3f2152", 3, 5);

  // The headland: lit on its sunset face, purple in the cracks, with grass along the top.
  for (let x = 0; x < LAD_W; x++) {
    const top = ladLand(x);
    for (let y = top; y < LAD_H; y++) {
      const n = noise2(x * 0.07, y * 0.16, 11), crack = noise2(x * 0.3, y * 0.7, 12);
      const lit = n + (top + 12 > y ? 0.1 : 0) - (x - 100) * 0.0012;
      let c = lit > 0.62 ? "#a3546a" : lit > 0.46 ? "#6c3a68" : lit > 0.3 ? "#472a5c" : "#2f1e4a";
      if (crack > 0.86) c = "#1e1438";
      else if (((x + y) & 1) === 0 && Math.abs(lit - 0.46) < 0.03) c = "#472a5c";
      px(ctx, x, y, c);
    }
    const grass = 3 + Math.round(noise1(x, 13) * 3);
    for (let g = 0; g < grass; g++) px(ctx, x, top + g, g === 0 ? (x < LAD_X ? "#d8b35a" : "#7f9a4e") : g === 1 ? "#55784a" : (x + g) % 2 ? "#3a5a48" : "#2e4640");
    if (noise1(x, 14) > 0.6) px(ctx, x, top - 1, x < LAD_X ? "#b99f4e" : "#55784a");
    if (noise1(x, 15) > 0.93) { px(ctx, x, top - 2, "#55784a"); px(ctx, x, top - 3, x % 2 ? "#ffe9a6" : "#ff8fa8"); }
  }
}

function ladCottage(ctx: CanvasRenderingContext2D) {
  const x = 261, y = 523, w = 46, base = 548;
  // Chimney, then a gabled roof with a sunset edge.
  px(ctx, x + 33, 503, LAD_INK, 8, 12); px(ctx, x + 34, 504, "#7a4a5e", 6, 11); px(ctx, x + 34, 504, "#b0708a", 2, 11); px(ctx, x + 33, 502, "#3a2a4e", 8, 2);
  for (let j = 0; j < 17; j++) {
    const l = x + 16 - j, rw = Math.min(14 + j * 2, w + 8);
    px(ctx, l - 1, 506 + j, LAD_INK, rw + 2, 1);
    for (let i = 0; i < rw; i++) px(ctx, l + i, 506 + j, i < 3 ? "#f4714f" : (j % 3 === 2 ? "#4c1b52" : (i + (j >> 1) * 3) % 6 === 0 ? "#4c1b52" : i < rw * 0.55 ? "#a92e52" : "#752357"));
  }
  // Whitewashed walls, warm on the left, cool on the right.
  px(ctx, x - 1, y, LAD_INK, w + 2, base - y);
  for (let j = y; j < base; j++) for (let i = 0; i < w; i++) {
    const s = i / w;
    px(ctx, x + i, j, s < 0.3 ? "#f6cfa8" : s < 0.34 && (i + j) % 2 ? "#f6cfa8" : s < 0.7 ? "#c98f92" : s < 0.74 && (i + j) % 2 ? "#c98f92" : "#8a5f8c");
  }
  px(ctx, x, y, "#4c2f5c", w, 2);
  // A lit window with its glow on the grass, and a door with a step.
  px(ctx, x + 6, y + 5, LAD_INK, 13, 12); px(ctx, x + 7, y + 6, "#ffd36e", 11, 10); px(ctx, x + 7, y + 6, "#fff2b8", 5, 4); px(ctx, x + 12, y + 6, LAD_INK, 1, 10); px(ctx, x + 7, y + 10, LAD_INK, 11, 1); px(ctx, x + 5, y + 17, "#6f4a80", 15, 2);
  px(ctx, x + 27, y + 7, LAD_INK, 11, base - y - 7); px(ctx, x + 28, y + 8, "#2f6f73", 9, base - y - 8); px(ctx, x + 28, y + 8, "#46918c", 2, base - y - 8); px(ctx, x + 35, y + 16, "#ffd27a"); px(ctx, x + 26, base - 1, "#6f4a80", 13, 2);
  // A picket fence, a buoy and a coil of rope by the door.
  for (let fx = 240; fx < 258; fx += 4) { const fy = ladLand(fx); px(ctx, fx, fy - 7, LAD_INK, 3, 7); px(ctx, fx + 1, fy - 7, "#e6a188", 1, 6); }
  px(ctx, 240, ladLand(248) - 5, "#6f4a80", 19, 1);
  px(ctx, 310, 541, LAD_INK, 8, 8); px(ctx, 311, 542, "#d8454a", 6, 6); px(ctx, 311, 544, "#ffe9c6", 6, 2);
}

/** A round walkway on the tower: planks, brackets, an iron rail. `gold` marks the safe ones. */
function ladGallery(ctx: CanvasRenderingContext2D, y: number, reach: number, gold: boolean) {
  const half = ladHalf(y), l = LAD_X - half - reach, w = (half + reach) * 2;
  // Rail behind.
  px(ctx, l + 2, y - 7, "#3a2a5c", w - 4, 1);
  // Brackets under the planks.
  for (let i = 0; i < reach + 2; i++) {
    px(ctx, LAD_X - half - i, y + 3 + (reach + 2 - i), LAD_INK, 2, 1);
    px(ctx, LAD_X + half + i - 1, y + 3 + (reach + 2 - i), LAD_INK, 2, 1);
  }
  // Planks.
  px(ctx, l - 1, y, LAD_INK, w + 2, 5);
  px(ctx, l, y, gold ? "#ffd27a" : "#e9b070", w, 1);
  for (let i = 0; i < w; i++) {
    const s = i / w;
    px(ctx, l + i, y + 1, s < 0.42 ? "#c9834f" : s < 0.75 ? "#8c5450" : "#573554");
    px(ctx, l + i, y + 2, i % 7 === 0 ? LAD_INK : s < 0.42 ? "#a86a4a" : s < 0.75 ? "#6f4250" : "#47294e");
    px(ctx, l + i, y + 3, s < 0.42 ? "#6a3f4c" : "#3a2348");
  }
  // Front rail: posts, top bar, middle bar, with a shadow side.
  for (let i = 0; i <= w; i += 6) { px(ctx, l + i, y - 9, LAD_INK, 2, 9); px(ctx, l + i, y - 9, i / w < 0.55 ? "#a07a8a" : "#5a4a78", 1, 9); }
  px(ctx, l, y - 10, LAD_INK, w + 1, 2);
  for (let i = 0; i <= w; i++) px(ctx, l + i, y - 10, i / w < 0.55 ? "#d0a88e" : "#6f5a8c");
  px(ctx, l, y - 5, "#46356c", w, 1);
}

/** The whole lighthouse, foot to finial. */
function ladTower(ctx: CanvasRenderingContext2D) {
  for (let y = ladTop; y < LAD_FOOT + 4; y++) {
    const half = ladHalf(y);
    for (let x = LAD_X - half; x <= LAD_X + half; x++) {
      const u = clamp((x - LAD_X) / (half + 0.5), -1, 1);
      const bow = Math.sqrt(1 - u * u);
      // Round form: light on the sunset side, falling off across the curve; a thin reflected light on the far edge.
      let sh = clamp((u + 0.82) * 2.85, 0, 5) - (u > 0.86 ? 0.9 : 0);
      // A painted stripe winding up the tower, and courses of block that bend with the curve.
      const wind = y + Math.asin(u) * 20;
      const pal = Math.floor((wind + 4000) / 58) % 2 === 0 ? LAD_RED : LAD_CREAM;
      const row = Math.floor(y - (1 - bow) * 3);
      if (row % 7 === 0) sh += 1;
      else if ((Math.floor(Math.asin(u) * 15 + (Math.floor(row / 7) % 2 ? 1.5 : 0)) % 3) === 0 && noise1(row, x) > 0.97) sh += 1;
      // Weather: rust streaks running down from the bolts, salt worn low on the tower.
      if (noise2(x * 0.5, y * 0.03, 7) > 0.72 && noise1(x, 8) > 0.35) sh += 1;
      if (y > 460 && noise2(x * 0.3, y * 0.14, 9) > 0.76) sh -= 0.8;
      const base = Math.floor(sh), f = sh - base;
      const i = clamp(f * 16 > BAYER[y & 3]![x & 3]! + 0.5 ? base + 1 : base, 0, 5);
      px(ctx, x, y, pal[i]!);
    }
    px(ctx, LAD_X - half - 1, y, LAD_INK); px(ctx, LAD_X + half + 1, y, LAD_INK);
  }
  // A dark collar of stone every few rungs where the sections of the tower join.
  for (const k of [2, 6, 10]) {
    const y = ladRungY(k) + 9, half = ladHalf(y);
    px(ctx, LAD_X - half - 2, y - 1, LAD_INK, half * 2 + 5, 5);
    for (let x = -half - 1; x <= half + 1; x++) {
      const s = (x + half) / (half * 2);
      px(ctx, LAD_X + x, y, s < 0.3 ? "#d8b49a" : s < 0.65 ? "#8c6a86" : "#4a3a6c");
      px(ctx, LAD_X + x, y + 1, s < 0.3 ? "#a07a7c" : s < 0.65 ? "#62486e" : "#352a58");
      px(ctx, LAD_X + x, y + 2, s < 0.3 ? "#6c4a64" : "#2a2048");
    }
  }
  // Windows up the tower, off to the sides of the ladder.
  for (const [wx, wy] of ladWindows()) {
    px(ctx, wx - 3, wy - 5, LAD_INK, 7, 11);
    px(ctx, wx - 2, wy - 6, LAD_INK, 5, 1);
    px(ctx, wx - 2, wy - 4, "#ffc863", 5, 9);
    px(ctx, wx - 2, wy - 5, "#ffc863", 5, 1);
    px(ctx, wx - 2, wy - 4, "#fff0b0", 2, 4);
    px(ctx, wx, wy - 5, LAD_INK, 1, 10);
    px(ctx, wx - 3, wy + 6, "#c98f92", 7, 1);
  }
  // The stone foot, wider than the tower, with a keeper's door round the side.
  const foot = 520;
  for (let y = foot; y < 552; y++) {
    const half = ladHalf(LAD_FOOT) + 4 + Math.floor((y - foot) / 12) * 2;
    for (let x = -half; x <= half; x++) {
      const s = (x + half) / (half * 2);
      const course = Math.floor((y - foot) / 5), brick = Math.floor((x + (course % 2 ? 4 : 0) + 100) / 8);
      const joint = (y - foot) % 5 === 0 || (x + (course % 2 ? 4 : 0) + 100) % 8 === 0;
      const tone = noise1(course * 37 + brick, 41);
      const c = joint ? (s < 0.4 ? "#6a4560" : "#2a1f48") : s < 0.28 ? (tone > 0.5 ? "#e0b294" : "#c79884") : s < 0.6 ? (tone > 0.5 ? "#9a6f88" : "#865f80") : (tone > 0.5 ? "#55406f" : "#493763");
      px(ctx, LAD_X + x, y, c);
    }
    px(ctx, LAD_X - half - 1, y, LAD_INK); px(ctx, LAD_X + half + 1, y, LAD_INK);
  }
  px(ctx, LAD_X - ladHalf(LAD_FOOT) - 5, foot - 1, LAD_INK, ladHalf(LAD_FOOT) * 2 + 11, 2);
  px(ctx, LAD_X + 17, 530, LAD_INK, 13, 19); px(ctx, LAD_X + 18, 528, LAD_INK, 11, 2);
  px(ctx, LAD_X + 18, 530, "#2f6f73", 11, 19); px(ctx, LAD_X + 19, 531, "#25585f", 9, 18); px(ctx, LAD_X + 23, 531, "#1b4048", 1, 18); px(ctx, LAD_X + 26, 540, "#ffd27a");

  // Galleries: the two safe ledges in gold with their signs, and the walkway round the lamp.
  for (const k of LEDGES) {
    const y = ladRungY(k);
    ladGallery(ctx, y, 11, true);
    const half = ladHalf(y);
    px(ctx, LAD_X + half - 9, y + 5, LAD_INK, 1, 2); px(ctx, LAD_X + half + 2, y + 5, LAD_INK, 1, 2);
    px(ctx, LAD_X + half - 11, y + 7, LAD_INK, 19, 9); px(ctx, LAD_X + half - 10, y + 8, "#ffd27a", 17, 7);
    ladText(ctx, "SAFE", LAD_X + half - 9, y + 9, "#4c1b52");
  }
  ladGallery(ctx, ladTop, 9, false);
}

const ladWindows = () => [[1, -1], [3, 1], [5, -1], [7, 1], [9, -1], [11, 1]].map(([k, side]) => {
  const y = ladRungY(k!) + 18;
  return [LAD_X + side! * Math.round(ladHalf(y) * 0.58), y] as [number, number];
});

function ladLadder(ctx: CanvasRenderingContext2D) {
  const top = ladTop - 2, bottom = LAD_FOOT + 3;
  // Its shadow falls to the right, away from the sun.
  for (let y = top; y < bottom; y++) if ((y & 1) === 0 || y % 8 < 2) px(ctx, LAD_X + 8, y, "rgba(23,15,48,0.55)", 2, 1);
  // Small rungs between the twelve.
  for (let y = LAD_FOOT; y >= top + 2; y -= 8) {
    px(ctx, LAD_X - 6, y + 1, "rgba(23,15,48,0.7)", 13, 1);
    px(ctx, LAD_X - 5, y, "#c58f62", 11, 1);
    px(ctx, LAD_X - 5, y, "#e6b781", 4, 1);
  }
  // Rails, with their bolts into the wall.
  for (const rx of [LAD_X - 7, LAD_X + 6]) {
    px(ctx, rx - 1, top, LAD_INK, 4, bottom - top);
    px(ctx, rx, top, "#e0a873", 1, bottom - top);
    px(ctx, rx + 1, top, "#8f5a48", 1, bottom - top);
    for (let k = 0; k <= RUNGS; k++) { px(ctx, rx - 1, ladRungY(k) - 22, "#ffd27a"); px(ctx, rx + 2, ladRungY(k) - 22, LAD_INK); }
  }
  // The twelve big rungs in brass, each with its number plate.
  for (let k = 1; k <= RUNGS; k++) {
    const y = ladRungY(k), n = String(k), plate = n.length * 4 + 2;
    px(ctx, LAD_X - 9, y - 1, LAD_INK, 19, 4);
    px(ctx, LAD_X - 8, y, "#ffd27a", 17, 1);
    px(ctx, LAD_X - 8, y, "#fff2b8", 6, 1);
    px(ctx, LAD_X - 8, y + 1, "#b7803e", 17, 1);
    if (k === RUNGS) continue;
    const ox = LAD_X + 11, oy = y - (LEDGES.includes(k) ? 19 : 4);
    px(ctx, ox - 1, oy - 1, LAD_INK, plate + 2, 9);
    px(ctx, ox, oy, "#2a1c4c", plate, 7);
    px(ctx, ox, oy, "#5a4a78", plate, 1);
    ladText(ctx, n, ox + 1, oy + 1, "#ffd27a");
  }
}

/** The lamp room and its roof: dark glass until a climber reaches it. */
function ladLantern(ctx: CanvasRenderingContext2D) {
  const y0 = ladTop - 10, glassTop = y0 - 26;
  // Stone drum under the glass.
  px(ctx, LAD_X - 15, y0 + 1, LAD_INK, 31, 9);
  for (let x = -14; x <= 14; x++) { const s = (x + 14) / 28; px(ctx, LAD_X + x, y0 + 2, s < 0.35 ? "#e6c8a8" : s < 0.7 ? "#9a7a92" : "#54406f", 1, 7); if ((x + 14) % 7 === 0) px(ctx, LAD_X + x, y0 + 2, LAD_INK, 1, 7); }
  px(ctx, LAD_X - 15, y0 + 2, "#fff2d6", 3, 1);
  // Glass: dusk reflected in it, panes split by iron bars.
  px(ctx, LAD_X - 14, glassTop, LAD_INK, 29, y0 - glassTop + 1);
  for (let y = glassTop + 1; y < y0 + 1; y++) for (let x = -13; x <= 13; x++) {
    const m = (y - glassTop) / (y0 - glassTop);
    const c = m < 0.35 ? "#2a2a68" : m < 0.42 && (x + y) % 2 ? "#2a2a68" : m < 0.72 ? "#46347a" : m < 0.78 && (x + y) % 2 ? "#46347a" : "#7a3f7f";
    px(ctx, LAD_X + x, y, c);
  }
  for (let d = 0; d < 13; d++) { px(ctx, LAD_X - 12 + d, glassTop + 16 - d, "#8d86d0"); px(ctx, LAD_X - 9 + d, glassTop + 21 - d, "#6c64b4"); }
  for (let x = -14; x <= 14; x += 7) px(ctx, LAD_X + x, glassTop, LAD_INK, 2, y0 - glassTop + 1);
  // The dome, its cap and the vane.
  for (let j = 0; j < 15; j++) {
    const half = Math.round(16 * Math.sqrt(1 - Math.pow(j / 15, 1.6)));
    const y = glassTop - 1 - j;
    px(ctx, LAD_X - half - 1, y, LAD_INK, half * 2 + 3, 1);
    for (let x = -half; x <= half; x++) {
      const s = (x + half) / (half * 2 + 0.01);
      px(ctx, LAD_X + x, y, (x + 40) % 8 === 0 ? "#4c1b52" : s < 0.26 ? "#f4714f" : s < 0.34 && (x + y) % 2 ? "#f4714f" : s < 0.62 ? "#a92e52" : "#5c1f55");
    }
  }
  const tip = glassTop - 16;
  px(ctx, LAD_X - 16, glassTop - 1, "#f4dca8", 15, 1); px(ctx, LAD_X - 1, glassTop - 1, "#a07a7c", 18, 1);
  disc(ctx, LAD_X, tip - 2, 3, (dx, dy) => (dx + dy < -1 ? "#fff2b8" : dx + dy < 2 ? "#ffd27a" : "#8f5a48"));
  px(ctx, LAD_X, tip - 12, LAD_INK, 1, 8);
  px(ctx, LAD_X - 6, tip - 10, LAD_INK, 13, 1); px(ctx, LAD_X + 5, tip - 11, LAD_INK, 2, 3); px(ctx, LAD_X - 7, tip - 11, LAD_INK, 1, 3);
}

const LAD_CLIMB = ["....ccc....", "...ccccc...", "...hhhhh...", "s...sss....", "dd.jjjjj...", ".ddjjjjjj.s", "...jjjjjddd", "...jjjjj...", "...ppppp...", "...pp.pp...", "...pp.pp...", "...bb.pp...", "......bb..."];
const LAD_CHEER = ["....ccc....", "...ccccc...", "s..hhhhh..s", "d...sss...d", "dd.jjjjj.dd", ".ddjjjjjdd.", "...jjjjj...", "...jjjjj...", "...ppppp...", "...pp.pp...", "...pp.pp...", "...pp.pp...", "...bb.bb..."];
const ladFlip = (rows: string[]) => rows.map((r) => [...r].reverse().join(""));
const ladDarken = (c: string) => { const [r, g, b] = hex(c); return `rgb(${Math.round(r! * 0.62)},${Math.round(g! * 0.55)},${Math.round(b! * 0.72)})`; };

function ladderFrame(ctx: CanvasRenderingContext2D, t: number, shown: number[], moving: boolean[], cam: { x: number; y: number }, colors: string[]) {
  const seen = (y0: number, y1: number) => y1 >= cam.y && y0 <= cam.y + LADDER_WORLD.viewH;
  // Stars twinkle up where it is dark enough for them.
  if (seen(0, 300)) for (let i = 0; i < 26; i++) if ((t + i * 7) % 34 < 4) px(ctx, noise1(i, 51) * LAD_W, noise1(i, 52) * 240, "#ffffff");
  // Thin wind streaks, more of them the higher you are.
  for (let i = 0; i < 7; i++) {
    const y = 20 + i * 34 + Math.sin(t / 19 + i) * 3;
    if (!seen(y, y)) continue;
    const x = ((t * (2.2 + (i % 3)) + i * 97) % (LAD_W + 60)) - 40;
    const len = 10 + (i % 3) * 6, half = ladHalf(y) + 14;
    if (x + len < LAD_X - half || x > LAD_X + half) px(ctx, x, y, y < 130 ? "#b9b4e8" : "#a483b8", len, 1);
  }
  // Thin clouds drift past behind the tower.
  const drifts: [number, number, number, string, string][] = [[316, 40, 0.11, "#f6a28c", "#b9587f"], [356, 58, 0.07, "#f6a28c", "#9c4a80"], [206, 34, 0.09, "#7a5aa8", "#463a8c"], [146, 46, 0.05, "#7a5aa8", "#3a3280"], [468, 52, 0.08, "#ffe2a0", "#f08a62"]];
  drifts.forEach(([y, w, speed, rim, mid], i) => {
    if (!seen(y - 6, y + 2)) return;
    const x = Math.round(((t * speed + i * 113) % (LAD_W + w * 2)) - w);
    for (let c = 0; c < w; c++) {
      const tall = Math.round(4 * Math.sin((c / w) * Math.PI) * (0.6 + noise1(c >> 1, 60 + i) * 0.6));
      if (Math.abs(x + c - LAD_X) > ladHalf(y) + 1) for (let j = 0; j < tall; j++) if (j === 0 || (x + c + y - j) % 2 === 0) px(ctx, x + c, y - j, j === 0 ? rim : mid);
    }
  });
  // Tower windows: somebody home, a flame that wavers.
  ladWindows().forEach(([wx, wy], i) => { if (seen(wy - 6, wy + 6) && (t + i * 13) % 40 < 3) px(ctx, wx - 2, wy - 4, "#e89a4a", 5, 9); });
  // Lamps on the safe ledges, with a soft ring of light and a pennant in the wind.
  for (const k of LEDGES) {
    const y = ladRungY(k);
    if (!seen(y - 24, y + 16)) continue;
    const half = ladHalf(y), lx = LAD_X - half - 11, on = Math.sin(t / 6 + k) > -0.6;
    px(ctx, lx, y - 14, LAD_INK, 5, 5); px(ctx, lx + 1, y - 13, on ? "#fff0b0" : "#ffc863", 3, 3); px(ctx, lx + 2, y - 10, LAD_INK, 1, 1);
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2, r = 6 + (on ? 1 : 0);
      if ((a + (t >> 2)) % 2 === 0) px(ctx, lx + 2 + Math.cos(ang) * r, y - 12 + Math.sin(ang) * r, "#ffd27a");
    }
    const fx = LAD_X + half + 11;
    px(ctx, fx, y - 22, LAD_INK, 1, 13);
    for (let c = 0; c < 8; c++) {
      const wave = Math.round(Math.sin(t / 3 + c * 0.8) * (c / 7) * 1.5);
      for (let j = c >> 1; j < 5 - (c >> 1); j++) px(ctx, fx + 1 + c, y - 22 + j + wave, j === 2 ? "#fff0b0" : "#ffb347");
    }
  }
  // The sea: gold under the sun, waves that catch the light, foam round the rocks.
  if (seen(LAD_SEA, LAD_H)) {
    for (let y = LAD_SEA + 2; y < LAD_H; y += 2) {
      const near = (y - LAD_SEA) / (LAD_H - LAD_SEA), spread = 10 + near * 34;
      for (let k = 0; k < 6; k++) {
        const x = 74 + (noise1(k * 11 + y, 71) - 0.5) * 2 * spread + Math.sin(t / 5 + y + k) * 3;
        if ((t + k * 3 + y) % 7 < 4 && x < ladBeach(y)) px(ctx, x, y, near < 0.35 ? "#fff0b4" : "#ffc773", 2 + Math.floor(near * 5), 1);
      }
      for (let x = ((y * 7) % 41) - 41 + Math.round(Math.sin(t / 7 + y) * 3); x < ladBeach(y); x += 41) if (x >= 0) px(ctx, x, y, near < 0.4 ? "#ec8a6c" : "#8a4a98", 7, 1);
      const shore = ladBeach(y), wash = Math.round(Math.sin(t / 6 + y * 0.6) * 2);
      if (shore < LAD_SHORE) { px(ctx, shore - 4 + wash, y, "#f7e6d8", 3 + wash, 1); if ((t + y) % 8 < 3) px(ctx, shore - 8 + wash, y, "#d9a8c0", 2, 1); }
    }
    // The boat rides the swell.
    if (t % 18 < 9) px(ctx, 137, LAD_SEA + 5, "#ffc773", 11, 1);
  }
  // Gulls wheel round the lower tower, and one or two higher up.
  for (let i = 0; i < 6; i++) {
    const baseY = i < 4 ? 450 + i * 16 : 300 - (i - 4) * 90, r = 22 + i * 7;
    const x = (i % 2 ? 56 : 300) + (i % 2 ? 1 : -1) * Math.sin(t / (24 + i * 3) + i) * r * 1.6, y = baseY + Math.cos(t / (24 + i * 3) + i) * 8;
    if (!seen(y - 3, y + 3)) continue;
    const up = (t + i * 3) % 8 < 4;
    px(ctx, x, y, "#f4f0e8", 1, 1); px(ctx, x - 1, y + (up ? -1 : 1), "#f4f0e8"); px(ctx, x + 1, y + (up ? -1 : 1), "#f4f0e8"); px(ctx, x - 2, y + (up ? -2 : 1), "#c9b8d0"); px(ctx, x + 2, y + (up ? -2 : 1), "#c9b8d0");
  }
  // Smoke from the cottage, and its window's warm flicker.
  if (seen(470, 540)) {
    for (let i = 0; i < 11; i++) {
      const age = (t * 0.4 + i * 4) % 44, sx = 298 + Math.sin(age / 7 + i) * 2 + age * 0.25, sy = 502 - age;
      const c = age < 16 ? "#8a7298" : age < 30 ? "#7a5f90" : "#6a4f88";
      px(ctx, sx, sy, c, age > 20 ? 3 : 2, age > 20 ? 2 : 2);
    }
    if (t % 31 < 3) px(ctx, 268, 529, "#f0b64e", 5, 4);
    px(ctx, 268 + (t % 60 < 30 ? 0 : 6), 546, "#ffd36e", 1, 1);
  }
  // The lamp: a sleeping ember until someone reaches the top, and then the whole coast gets its light back.
  const lit = shown.some((v) => v >= 0.999);
  const lensY = ladTop - 23;
  if (seen(0, lensY + 30)) {
    if (lit) ladBeam(ctx, t, lensY);
    const glow = t % 10 < 5;
    for (let j = 0; j < 14; j++) {
      const w = 5 - Math.abs(j - 7) * 0.55;
      px(ctx, LAD_X - w, lensY - 7 + j, LAD_INK, w * 2 + 1, 1);
      px(ctx, LAD_X - w + 1, lensY - 7 + j, lit ? (j % 3 === 0 ? "#fff" : "#fff2b8") : j % 3 === 0 ? (glow ? "#c9743c" : "#a55a38") : "#6e3a4c", Math.max(1, w * 2 - 1), 1);
    }
    px(ctx, LAD_X - 1, lensY - 2, lit ? "#ffffff" : glow ? "#ffb347" : "#e88a3c", 3, 4);
    px(ctx, LAD_X - 7, lensY + 10, LAD_INK, 15, 4); px(ctx, LAD_X - 6, lensY + 11, "#7a5a70", 13, 2);
  }
  shown.forEach((v, i) => {
    const p = LADDER_WORLD.pos(v, i, shown.length);
    const top = v >= 0.999;
    const stepping = moving[i] && !top && Math.floor(t / 3) % 2 === 1;
    const rows = top ? (t % 12 < 6 ? LAD_CHEER : ladFlip(LAD_CHEER)) : stepping ? ladFlip(LAD_CLIMB) : LAD_CLIMB;
    const c = colors[i]!;
    const sx = Math.round(p.x) - 5, sy = Math.round(p.y) - 13;
    const ink = Object.fromEntries("chsjdpb".split("").map((k) => [k, LAD_INK]));
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawSprite(ctx, rows, ink, sx + ox!, sy + oy!);
    drawSprite(ctx, rows, { c: ladDarken(c), h: "#3a2233", s: "#e7b08a", j: c, d: ladDarken(c), p: "#2c2a55", b: "#150f28" }, sx, sy);
    // A scarf that streams off in the wind, longer the higher you are.
    const len = 4 + Math.round(ladHeight(v) / 3);
    for (let k = 0; k < len; k++) px(ctx, Math.round(p.x) + 3 + k, Math.round(p.y) - 10 + Math.round(Math.sin(t / 2.5 - k * 0.8) * (k / len) * 1.6), k % 2 ? "#ffe9c6" : "#fbcfa0");
  });
}

/** Where the sea stops at a given height of the water: the rocks' edge, or for the far water, the tower behind it. */
function ladBeach(y: number) {
  let x = 0;
  while (x < LAD_SHORE && ladLand(x) > y) x++;
  return x;
}

function ladBeam(ctx: CanvasRenderingContext2D, t: number, y0: number) {
  const turn = Math.cos((t / 44) * Math.PI * 2);
  for (const side of [-1, 1]) {
    const strength = 0.25 + Math.max(0, side * turn) * 0.75;
    for (let d = 8; d < 230; d += 1) {
      const half = Math.floor(2 + d * 0.13);
      const x = LAD_X + side * d;
      if (x < 0 || x >= LAD_W) continue;
      for (let j = -half; j <= half; j++) {
        const y = y0 + j;
        const fade = strength * (1 - d / 230) * (1 - Math.abs(j) / (half + 1) * 0.6);
        if (fade * 15 > BAYER[y & 3]![x & 3]! + 0.5) px(ctx, x, y, "#fff2b8");
      }
    }
  }
  // Sparks and rays round the lamp itself.
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2 + t / 12, r = 18 + (a % 2) * 4 + Math.sin(t / 3) * 1.5;
    px(ctx, LAD_X + Math.cos(ang) * r, y0 + Math.sin(ang) * r, a % 2 ? "#ffd23f" : "#ffffff");
  }
}

const LADDER_WORLD: World = {
  id: "ladder", fullW: LAD_W, fullH: LAD_H, viewW: 320, viewH: 150,
  checkpoints: ["Sea Wall", "Salt Spray", "Gull Perch", "Low Gallery", "Rusty Bolts", "Cloud Line", "First Stars", "High Gallery", "Cold Wind", "Long Drop", "Last Rivets", "The Lamp"].map((name, i) => ({ name, at: LADDER[i]! / LADDER[RUNGS - 1]! })),
  backdrop(ctx) {
    ladSky(ctx);
    ladSeaAndLand(ctx);
    ladCottage(ctx);
    ladTower(ctx);
    ladLantern(ctx);
    ladLadder(ctx);
  },
  frame: ladderFrame,
  pos: (f, i, n) => ({ x: LAD_X + (n > 1 ? (i - (n - 1) / 2) * 6 : 0), y: LAD_FOOT - ladHeight(f) * LAD_STEP }),
  camera: (p) => ({ x: 0, y: clamp(p.y - 92, 0, LAD_H - 150) }),
};

// ======================= NOIR: a rainy town that shifts between night and day =======================
// One street drawn at four times of day. Wet asphalt mirrors the buildings, so the town stands in its own reflection. At
// night lit windows go dark one by one and the rain shows up in the lamp light; dawn is grey with the lamps out; day is
// overcast and drizzling; at dusk the windows and neon come back. Who is looking changes nothing here: Mafia's night
// screen has to look the same on every phone, so this draws from the time of day and the clock alone.
const NOIR_W = 200, NOIR_H = 96, NOIR_WALK = 66, NOIR_ROAD = 71;
type NoirTime = "night" | "dawn" | "day" | "dusk";
type NoirLook = {
  sky: [number, string][]; tint: string; amt: number; far: string; farLit: string; cloud: string; orb?: { x: number; y: number; r: number; c: string; rim: string };
  side: string; sideHi: string; curb: string; road: [string, string]; mirror: number; line: string; glass: string; glassHi: string; ink: string; inkHi: string;
  lamps: boolean; cone: string; neon: boolean; lit: string; litHi: string; litLo: string; rain: number; drop: string; dropLit: string; ripple: string; drift: string;
};
const NOIR: Record<NoirTime, NoirLook> = {
  night: {
    sky: [[0, "#050817"], [0.45, "#0b1230"], [0.8, "#18214a"], [1, "#2b335f"]], tint: "#0a0f2e", amt: 0.62, far: "#111a3d", farLit: "#3d4a78", cloud: "#1a2249",
    orb: { x: 111, y: 14, r: 7, c: "#d7dceb", rim: "#8e98b8" }, side: "#1d2340", sideHi: "#2e3656", curb: "#3e4669", road: ["#0f1329", "#05070f"], mirror: 0.6, line: "#2e3556",
    glass: "#0a0f25", glassHi: "#1c2545", ink: "#04050c", inkHi: "#2a3152", lamps: true, cone: "#ffdf9a", neon: true, lit: "#f2b544", litHi: "#ffe6a4", litLo: "#b0702c", rain: 80, drop: "#52658e", dropLit: "#fff0c8", ripple: "#7387b0", drift: "#131a3c",
  },
  dawn: {
    sky: [[0, "#465164"], [0.55, "#737e8c"], [0.88, "#a6a9a6"], [1, "#d0c8b2"]], tint: "#68737f", amt: 0.48, far: "#7a8490", farLit: "#7a8490", cloud: "#8d96a1",
    orb: { x: 122, y: 31, r: 9, c: "#ddd9c9", rim: "#b5b6ae" }, side: "#59626e", sideHi: "#727b86", curb: "#868e98", road: ["#434c58", "#2a313b"], mirror: 0.45, line: "#6e7783",
    glass: "#384350", glassHi: "#6a7683", ink: "#1e242d", inkHi: "#4f5965", lamps: false, cone: "#ffe9b8", neon: false, lit: "#e6b765", litHi: "#ffe8ae", litLo: "#a8834c", rain: 34, drop: "#a4aeb9", dropLit: "#c8d0d8", ripple: "#919ca9", drift: "#67707d",
  },
  day: {
    sky: [[0, "#858f98"], [0.6, "#a8b0b5"], [1, "#cbcecb"]], tint: "#98a1a7", amt: 0.26, far: "#a1aab0", farLit: "#a1aab0", cloud: "#bbc1c3",
    side: "#7c8389", sideHi: "#969ca2", curb: "#a8aeb2", road: ["#5e6771", "#454d56"], mirror: 0.38, line: "#8d959c",
    glass: "#4c5b68", glassHi: "#9aabb5", ink: "#2d333a", inkHi: "#626c75", lamps: false, cone: "#ffffff", neon: false, lit: "#d9c58a", litHi: "#f0e2b4", litLo: "#a6935e", rain: 24, drop: "#c6d0d7", dropLit: "#dfe6ea", ripple: "#aab4bc", drift: "#969ea4",
  },
  dusk: {
    sky: [[0, "#1a1a3c"], [0.48, "#3d2e5d"], [0.8, "#8c4f60"], [1, "#de8f5f"]], tint: "#2a2247", amt: 0.52, far: "#30284e", farLit: "#6d5c86", cloud: "#54406e",
    side: "#2e2b47", sideHi: "#45405f", curb: "#5c5676", road: ["#211d38", "#100e1f"], mirror: 0.55, line: "#45405e",
    glass: "#191733", glassHi: "#3f3864", ink: "#0c0a19", inkHi: "#3c3656", lamps: true, cone: "#ffcf8a", neon: true, lit: "#f2a93f", litHi: "#ffdf92", litLo: "#ae5f2a", rain: 46, drop: "#7a7194", dropLit: "#ffe4b4", ripple: "#8f86aa", drift: "#2d2550",
  },
};
const noirMix = (c: string, to: string, a: number) => { const x = hex(c), y = hex(to); return `rgb(${x.map((v, i) => Math.round(v + (y[i]! - v) * a)).join(",")})`; };

type NoirBld = { x: number; w: number; top: number; c: string; hi: string; lo: string; cols: number; rows: number; winW: number; winH: number; winY: number; stepY: number };
const NOIR_BLDS: NoirBld[] = [
  { x: 0, w: 33, top: 13, c: "#8a4436", hi: "#ad6149", lo: "#5f2b22", cols: 3, rows: 3, winW: 6, winH: 7, winY: 19, stepY: 11 },
  { x: 33, w: 27, top: 34, c: "#67755f", hi: "#84927a", lo: "#475243", cols: 2, rows: 1, winW: 5, winH: 5, winY: 39, stepY: 8 },
  { x: 60, w: 38, top: 5, c: "#9c8866", hi: "#bda982", lo: "#6f5f46", cols: 4, rows: 5, winW: 5, winH: 6, winY: 11, stepY: 10 },
  { x: 98, w: 19, top: 40, c: "#585272", hi: "#736d8f", lo: "#3d3950", cols: 2, rows: 1, winW: 4, winH: 5, winY: 45, stepY: 8 },
  { x: 117, w: 35, top: 17, c: "#44596f", hi: "#5f7a95", lo: "#2e3e50", cols: 3, rows: 3, winW: 6, winH: 7, winY: 23, stepY: 11 },
  { x: 152, w: 48, top: 27, c: "#78444f", hi: "#99606f", lo: "#522d36", cols: 4, rows: 1, winW: 6, winH: 8, winY: 32, stepY: 11 },
];
/** Every upstairs window with its own timing. The backdrop and the animation read the same list. */
const NOIR_WINDOWS = NOIR_BLDS.flatMap((b, bi) => Array.from({ length: b.cols * b.rows }, (_, i) => {
  const col = i % b.cols, row = Math.floor(i / b.cols);
  const gap = (b.w - 6 - b.cols * b.winW) / Math.max(1, b.cols - 1);
  return { x: Math.round(b.x + 3 + col * (b.winW + gap)), y: b.winY + row * b.stepY, w: b.winW, h: b.winH, a: noise1(bi * 31 + i, 5), b: noise1(bi * 17 + i, 9), c: noise1(bi * 7 + i, 13) };
}));
const NOIR_LAMPS = [46, 140];
const NOIR_LAMP_Y = 33;
/** Rough ground-floor shop windows: lit at night like the others, but dark by day. */
const NOIR_SHOPS = [{ x: 36, y: 52, w: 21, h: 10 }, { x: 156, y: 52, w: 16, h: 10 }, { x: 186, y: 52, w: 11, h: 10 }, { x: 5, y: 54, w: 19, h: 9 }];
const NOIR_LETTERS: Record<string, string[]> = {
  H: ["X.X", "X.X", "XXX", "X.X", "X.X"], O: ["XXX", "X.X", "X.X", "X.X", "XXX"], T: ["XXX", ".X.", ".X.", ".X.", ".X."], E: ["XXX", "X..", "XX.", "X..", "XXX"], L: ["X..", "X..", "X..", "X..", "XXX"],
  B: ["XX.", "X.X", "XX.", "X.X", "XX."], A: [".X.", "X.X", "XXX", "X.X", "X.X"], R: ["XX.", "X.X", "XX.", "X.X", "X.X"],
};
const noirLetter = (ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, c: string) => NOIR_LETTERS[ch]!.forEach((r, ry) => [...r].forEach((v, rx) => { if (v === "X") px(ctx, x + rx, y + ry, c); }));
const NOIR_CAR = [
  "..........XXXXXXXXXX..........",
  "........XXGGGXGGGGGGXX........",
  ".......XGGGGGXGGGGGGGGX.......",
  "...XXXXBBBBBBBBBBBBBBBBXXXXX..",
  ".XXHHHHHHHHHHHHHHHHHHHHHHHHHX.",
  "XBBBBBBBBBBBBBBBBBBBBBBBBBBBBX",
  "fBBBBBBBBBBBBBBBBBBBBBBBBBBBBr",
  "XBBBXXXXBBBBBBBBBBBBBBXXXXBBBX",
  ".XXXKKKKXXXXXXXXXXXXXXKKKKXXX.",
  "....KKKK..............KKKK....",
];
const NOIR_WALKER = ["....uuuuu....", "..uuuuuuuuu..", ".uuuuuuuuuuu.", "u..u..u..u..u", "......u......", "....hhhhu....", "...hhhhhhu...", "....sssu.....", "....CCCu.....", "...CCCCCC....", "...CCCCCC....", "...CcCCCC....", "...CcCCCC....", "...CcCCC.....", "....C.C......", "....p.p......"];
const NOIR_CAT = ["k...k.", "kk.kk.", "kkkkk.", "kEkEk.", "kkkkk.", ".kkkk.", ".kkkkk", ".kkkkk"];

function noirSprite(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, x: number, y: number) {
  rows.forEach((row, ry) => [...row].forEach((ch, rx) => { const c = pal[ch]; if (c) px(ctx, x + rx, y + ry, c); }));
}

function noirBuilding(ctx: CanvasRenderingContext2D, b: NoirBld, L: NoirLook, seed: number) {
  const tint = (c: string) => noirMix(c, L.tint, L.amt);
  const c = tint(b.c), hi = tint(b.hi), lo = tint(b.lo), dark = noirMix(b.lo, L.tint, Math.min(1, L.amt + 0.2));
  px(ctx, b.x, b.top, c, b.w, NOIR_WALK - b.top);
  // Brick courses with offset joints and the odd worn brick. Darkens toward the wet street by dithering.
  for (let y = b.top; y < NOIR_WALK; y++) for (let x = b.x; x < b.x + b.w; x++) {
    const row = y - b.top, course = Math.floor(row / 3);
    if (row % 3 === 2) { if ((x + course) % 2 === 0) px(ctx, x, y, lo); }
    else if ((x + course * 4) % 8 === 0) px(ctx, x, y, lo);
    else if (noise2(x / 3, y / 2, seed) > 0.68 && (x + y) % 2 === 0) px(ctx, x, y, hi);
    if ((y - b.top) / (NOIR_WALK - b.top) * 16 > 9 + BAYER[y & 3]![x & 3]! * 0.9) px(ctx, x, y, lo);
  }
  // Corner light and shade, then the roofline.
  px(ctx, b.x, b.top, hi, 1, NOIR_WALK - b.top);
  px(ctx, b.x + b.w - 1, b.top, dark, 1, NOIR_WALK - b.top);
  px(ctx, b.x - 1, b.top - 1, hi, b.w + 2, 1);
  px(ctx, b.x - 1, b.top, lo, b.w + 2, 2);
  px(ctx, b.x - 1, b.top + 2, dark, b.w + 2, 1);
}

function noirWindowFrames(ctx: CanvasRenderingContext2D, L: NoirLook) {
  const sill = noirMix("#cfc4a8", L.tint, L.amt);
  for (const w of NOIR_WINDOWS) {
    px(ctx, w.x - 1, w.y - 1, L.ink, w.w + 2, w.h + 2);
    px(ctx, w.x, w.y, L.glass, w.w, w.h);
    px(ctx, w.x, w.y, L.glassHi, Math.max(2, w.w - 3), 1); // the sky in the pane
    px(ctx, w.x, w.y + 1, L.glassHi, 1, Math.min(2, w.h - 2));
    px(ctx, w.x + Math.floor(w.w / 2), w.y, L.ink, 1, w.h); // sash bar
    px(ctx, w.x - 1, w.y + w.h + 1, sill, w.w + 2, 1);
  }
}

function noirAwning(ctx: CanvasRenderingContext2D, x: number, w: number, y: number, a: string, b: string, L: NoirLook) {
  for (let i = 0; i < w; i++) {
    const c = noirMix(Math.floor(i / 3) % 2 ? a : b, L.tint, L.amt * 0.8);
    px(ctx, x + i, y, c, 1, 4);
    if (i % 3 !== 2) px(ctx, x + i, y + 4, c);
  }
  px(ctx, x, y + 5, L.ink, w, 1);
}

function noirBackdropOf(ctx: CanvasRenderingContext2D, time: NoirTime) {
  const L = NOIR[time];
  ctx.imageSmoothingEnabled = false;
  ditherSky(ctx, 0, 0, NOIR_W, NOIR_WALK, L.sky);
  // A heavy lid of cloud, dithered at the edges.
  for (let y = 0; y < 36; y++) for (let x = 0; x < NOIR_W; x++) {
    const n = noise2(x / 22, y / 6 + 3, 41) - y / 90;
    if (n > 0.46 + BAYER[y & 3]![x & 3]! / 90) px(ctx, x, y, L.cloud);
  }
  if (L.orb) {
    const o = L.orb;
    disc(ctx, o.x, o.y, o.r, (dx, dy) => (dx * dx + dy * dy > (o.r - 1) * (o.r - 1) ? o.rim : (dx === 2 && dy === -2) || (dx === -2 && dy === 3) || (dx === 3 && dy === 2) ? o.rim : o.c));
    // Cloud bars across its face.
    px(ctx, o.x - 12, o.y + 2, L.cloud, 20, 1);
    px(ctx, o.x - 4, o.y - 3, L.cloud, 15, 1);
  }
  // Far skyline, with a water tank on one roof.
  let fx = 0, n = 0;
  while (fx < NOIR_W) {
    const w = 7 + Math.floor(noise1(n, 3) * 11), h = 22 + Math.floor(noise1(n, 4) * 24);
    px(ctx, fx, NOIR_WALK - h, L.far, w, h);
    for (let wy = NOIR_WALK - h + 2; wy < NOIR_WALK - 2; wy += 3) for (let wx = fx + 1; wx < fx + w - 1; wx += 2) if (noise1(wx * 3 + wy, 8) > 0.72) px(ctx, wx, wy, L.farLit);
    fx += w; n++;
  }
  px(ctx, 103, 32, L.far, 11, 8); px(ctx, 102, 31, L.far, 13, 1); px(ctx, 104, 40, L.far, 1, 4); px(ctx, 112, 40, L.far, 1, 4);

  NOIR_BLDS.forEach((b, i) => noirBuilding(ctx, b, L, 60 + i));
  noirWindowFrames(ctx, L);

  // Rooftop dressing.
  px(ctx, 128, 7, L.ink, 11, 9); px(ctx, 128, 7, L.inkHi, 1, 9); px(ctx, 127, 6, L.ink, 13, 1); px(ctx, 130, 16, L.ink, 1, 1); px(ctx, 136, 16, L.ink, 1, 1);
  px(ctx, 12, 8, L.ink, 1, 5); px(ctx, 9, 8, L.ink, 7, 1); px(ctx, 10, 6, L.ink, 5, 1); // an aerial
  px(ctx, 170, 21, L.ink, 6, 6); px(ctx, 169, 20, L.inkHi, 8, 1); // a chimney

  // Fire escape down the tall building: landings and ladders.
  for (let y = 18; y < 58; y += 10) {
    px(ctx, 78, y, L.ink, 15, 1);
    for (let x = 78; x < 93; x += 2) px(ctx, x, y - 3, L.ink, 1, 3);
    px(ctx, 78, y - 3, L.ink, 15, 1);
    for (let k = 0; k < 8; k++) px(ctx, 80 + (y % 20 === 18 ? k : 8 - k), y + 1 + k, L.inkHi, 1, 1);
  }

  // Shop fronts: dark glass, awnings, doors.
  for (const s of NOIR_SHOPS) {
    px(ctx, s.x - 1, s.y - 1, L.ink, s.w + 2, s.h + 2);
    px(ctx, s.x, s.y, L.glass, s.w, s.h);
    for (let i = 0; i < 4; i++) px(ctx, s.x + 2 + i * 4, s.y + s.h - 1 - i, L.glassHi);
  }
  noirAwning(ctx, 34, 25, 46, "#b23a3a", "#e6dfc8", L);
  noirAwning(ctx, 154, 20, 46, "#2f6b5f", "#e6dfc8", L);
  px(ctx, 175, 50, L.ink, 9, 16); px(ctx, 176, 51, noirMix("#5a3a28", L.tint, L.amt), 7, 15); px(ctx, 177, 53, L.glass, 5, 5); px(ctx, 181, 60, L.inkHi); // bar door
  px(ctx, 26, 56, L.ink, 6, 10); px(ctx, 27, 57, noirMix("#3e2c22", L.tint, L.amt), 4, 9); // hotel door
  px(ctx, 104, 54, L.ink, 7, 12); px(ctx, 105, 55, L.glass, 5, 11);

  // Signs, tubes dark for now. The frame lights them when the neon is on.
  px(ctx, 33, 15, L.ink, 7, 31);
  [..."HOTEL"].forEach((ch, i) => noirLetter(ctx, ch, 35, 17 + i * 6, noirMix("#7a2436", L.tint, L.amt * 0.6)));
  px(ctx, 39, 22, L.ink, 1, 2);
  px(ctx, 182, 39, L.ink, 15, 9);
  [..."BAR"].forEach((ch, i) => noirLetter(ctx, ch, 184 + i * 4, 41, noirMix("#1f5b66", L.tint, L.amt * 0.6)));

  // Pavement, kerb, road.
  px(ctx, 0, NOIR_WALK, L.side, NOIR_W, NOIR_ROAD - NOIR_WALK);
  px(ctx, 0, NOIR_WALK, L.ink, NOIR_W, 1);
  for (let x = 6; x < NOIR_W; x += 13) px(ctx, x, NOIR_WALK + 1, L.sideHi, 1, 3);
  px(ctx, 0, NOIR_WALK + 3, L.sideHi, NOIR_W, 1);
  px(ctx, 0, NOIR_ROAD - 1, L.curb, NOIR_W, 1);
  for (let y = NOIR_ROAD; y < NOIR_H; y++) px(ctx, 0, y, noirMix(L.road[0], L.road[1], Math.floor(((y - NOIR_ROAD) / (NOIR_H - NOIR_ROAD)) * 5) / 4), NOIR_W, 1);
  // The town upside down in the wet road, broken into streaks by bands the rain leaves dry.
  ctx.save();
  ctx.globalAlpha = L.mirror;
  for (let y = NOIR_ROAD; y < NOIR_H; y++) {
    const d = y - NOIR_ROAD, from = NOIR_WALK - 1 - Math.floor(d * 1.9);
    if (d % 4 === 3) continue;
    const wob = Math.round(Math.sin(y * 1.7) * 1.4);
    ctx.drawImage(ctx.canvas, 0, from, NOIR_W, 1, wob, y, NOIR_W, 1);
  }
  ctx.restore();
  for (let x = 4; x < NOIR_W; x += 22) px(ctx, x, 84, L.line, 11, 1); // centre line

  // Street lamps, with a dithered cone and a pool of light on the pavement and in the road.
  for (const lx of NOIR_LAMPS) {
    if (L.lamps) {
      for (let y = NOIR_LAMP_Y + 4; y < NOIR_ROAD; y++) {
        const half = Math.round((y - NOIR_LAMP_Y) * 0.42);
        for (let x = -half; x <= half; x++) {
          const edge = Math.abs(x) / Math.max(1, half), fall = (y - NOIR_LAMP_Y) / (NOIR_ROAD - NOIR_LAMP_Y);
          if (BAYER[y & 3]![(lx + x) & 3]! / 16 > 0.3 + edge * 0.45 + fall * 0.15) { ctx.globalAlpha = 0.42 - fall * 0.14; px(ctx, lx + x, y, L.cone); }
        }
      }
      ctx.globalAlpha = 1;
      for (let y = NOIR_ROAD; y < NOIR_H - 1; y++) {
        const half = Math.round(10 - (y - NOIR_ROAD) * 0.25);
        for (let x = -half; x <= half; x++) if ((x + y) % 2 === 0 && (y - NOIR_ROAD) % 4 !== 3) { ctx.globalAlpha = 0.24 - (y - NOIR_ROAD) * 0.008; px(ctx, lx + x, y, L.cone); }
      }
      ctx.globalAlpha = 1;
    }
    px(ctx, lx, NOIR_LAMP_Y + 2, L.ink, 1, NOIR_WALK + 3 - NOIR_LAMP_Y);
    px(ctx, lx + 1, NOIR_LAMP_Y + 2, L.inkHi, 1, NOIR_WALK + 3 - NOIR_LAMP_Y);
    px(ctx, lx - 1, NOIR_WALK + 1, L.ink, 4, 3); px(ctx, lx - 2, NOIR_WALK + 3, L.ink, 6, 1);
    px(ctx, lx - 3, NOIR_LAMP_Y - 1, L.ink, 8, 1); px(ctx, lx - 2, NOIR_LAMP_Y - 2, L.ink, 6, 1); px(ctx, lx, NOIR_LAMP_Y - 3, L.ink, 2, 1);
    px(ctx, lx - 2, NOIR_LAMP_Y, L.lamps ? L.cone : L.glass, 6, 2);
    px(ctx, lx - 2, NOIR_LAMP_Y, L.lamps ? L.litHi : L.glassHi, 2, 1);
  }

  // A parked car, its rain-slick roof catching the light, and its dark shape in the road beneath.
  const carX = 74, carY = 69;
  noirSprite(ctx, NOIR_CAR, { X: L.ink, G: L.glassHi, B: noirMix("#2d3a4f", L.tint, L.amt * 0.75), H: L.inkHi, K: L.ink, f: L.lamps ? L.litHi : L.inkHi, r: L.lamps ? "#ff4d4d" : noirMix("#a12d2d", L.tint, L.amt) }, carX, carY);
  ctx.save();
  ctx.globalAlpha = 0.5;
  px(ctx, carX + 2, carY + NOIR_CAR.length, L.ink, 26, 2);
  ctx.restore();

  // A hydrant, a bin.
  px(ctx, 122, NOIR_WALK + 1, noirMix("#b23a3a", L.tint, L.amt), 3, 4); px(ctx, 121, NOIR_WALK + 2, noirMix("#b23a3a", L.tint, L.amt), 5, 1); px(ctx, 122, NOIR_WALK, L.inkHi, 3, 1);
  px(ctx, 62, NOIR_WALK - 5, L.ink, 7, 10); px(ctx, 63, NOIR_WALK - 4, L.inkHi, 1, 8); px(ctx, 61, NOIR_WALK - 6, L.inkHi, 9, 1);
}

function noirFrameOf(ctx: CanvasRenderingContext2D, t: number, time: NoirTime) {
  const L = NOIR[time];
  // Slow clouds over the sky, behind nothing but the gaps. Kept thin so the roofs stay readable.
  for (let i = 0; i < 4; i++) {
    const w = 26 + i * 9, x = ((i * 67 + t * (0.05 + i * 0.02)) % (NOIR_W + w)) - w, y = 2 + i * 2;
    px(ctx, x, y, L.drift, w, 1); px(ctx, x + 5, y + 1, L.drift, w - 12, 1);
  }

  // Windows. Night: most start lit and go out over the 45 seconds, a few stay up. Dusk: the reverse. Dawn: stragglers.
  const lit = (w: { a: number; b: number }) => {
    if (time === "night") return w.a < 0.66 && (w.b > 0.86 || t < 30 + w.b * 660);
    if (time === "dusk") return w.a < 0.3 || (w.a < 0.8 && t > 10 + w.b * 300);
    if (time === "dawn") return w.a < 0.14 && t < 60 + w.b * 60;
    return false;
  };
  for (const w of NOIR_WINDOWS) {
    if (!lit(w)) continue;
    px(ctx, w.x, w.y, L.lit, w.w, w.h);
    px(ctx, w.x, w.y, L.litHi, w.w, 2);
    for (let i = 0; i < w.w; i++) if (i % 2 === 0) px(ctx, w.x + i, w.y + w.h - 1, L.litLo);
    px(ctx, w.x + Math.floor(w.w / 2), w.y, L.litLo, 1, w.h);
    // Now and then, somebody behind the blind.
    if (w.c > 0.62) { const sx = w.x + (w.c > 0.8 ? 0 : w.w - 2), sy = w.y + w.h - 4; px(ctx, sx, sy, L.litLo, 2, 4); px(ctx, sx, sy - 1, L.litLo, 2, 1); }
    // And its glimmer in the wet road.
    const ry = NOIR_ROAD + clamp(Math.floor((NOIR_WALK - w.y) / 2), 0, NOIR_H - NOIR_ROAD - 2);
    if ((w.x + t >> 2) % 3 !== 0) px(ctx, w.x + Math.round(Math.sin(t / 5 + w.x) * 1), ry, L.litLo, Math.max(2, w.w - 2), 1);
  }
  for (const [i, s] of NOIR_SHOPS.entries()) {
    if (!L.neon) continue;
    px(ctx, s.x, s.y, L.litLo, s.w, s.h);
    px(ctx, s.x, s.y, L.lit, s.w, Math.ceil(s.h / 2));
    for (let x = 0; x < s.w; x += 2) px(ctx, s.x + x, s.y + Math.ceil(s.h / 2), L.lit);
    px(ctx, s.x + 3 + i * 2, s.y + s.h - 4, L.ink, 2, 4);
    if ((s.x + (t >> 3)) % 2 === 0) px(ctx, s.x, NOIR_ROAD + 1, L.litLo, s.w, 1);
  }

  // Neon: the hotel's T stutters, the bar buzzes.
  if (L.neon) {
    [..."HOTEL"].forEach((ch, i) => { if (i === 2 && t % 97 < 5 && t % 2) return; noirLetter(ctx, ch, 35, 17 + i * 6, "#ff5a7a"); });
    const bar = t % 211 < 3 ? "#1f6b78" : "#58e0ea";
    [..."BAR"].forEach((ch, i) => noirLetter(ctx, ch, 184 + i * 4, 41, bar));
    if ((t >> 2) % 3) { px(ctx, 34, NOIR_ROAD + 4, "#a83a54", 5, 1); px(ctx, 35, NOIR_ROAD + 8, "#a83a54", 3, 1); }
    if ((t >> 2) % 4) { px(ctx, 185, NOIR_ROAD + 6, "#2f8f9a", 10, 1); px(ctx, 187, NOIR_ROAD + 10, "#2f8f9a", 6, 1); }
  }

  // Someone waiting under the far lamp with an umbrella, shifting their weight. A cat on the bin, blinking.
  const sway = t % 40 < 20 ? 0 : 1;
  const coat = noirMix("#6e5b42", L.tint, L.amt * 0.7);
  const fy = NOIR_WALK + 4 - NOIR_WALKER.length;
  NOIR_WALKER.forEach((row, ry) => [...row].forEach((ch, rx) => {
    const c = ({ u: L.ink, h: L.ink, s: noirMix("#d9a57c", L.tint, L.amt * 0.7), C: coat, c: L.inkHi, p: L.ink } as Record<string, string>)[ch];
    if (c) px(ctx, 144 + rx + (ry < 14 ? sway : 0), fy + ry, c);
  }));
  if (t % 24 < 12) px(ctx, 144 + sway, fy + 4 + (t % 24) / 2, L.dropLit); // a drip off the umbrella
  noirSprite(ctx, NOIR_CAT, { k: L.ink, E: t % 70 < 4 ? L.ink : L.lamps ? "#ffd23f" : L.inkHi }, 62, NOIR_WALK - 14);

  // Rain, with a slight slant. It only really shows where the lamps catch it.
  for (let i = 0; i < L.rain; i++) {
    const speed = 2.4 + noise1(i, 31) * 2;
    const y = ((noise1(i, 32) * NOIR_H * 3 + t * speed) % (NOIR_H + 6)) - 4;
    const x = (((noise1(i, 33) * NOIR_W * 2 - y * 0.35 - t * 0.5) % NOIR_W) + NOIR_W) % NOIR_W;
    const inCone = L.lamps && y > NOIR_LAMP_Y + 2 && y < NOIR_ROAD && NOIR_LAMPS.some((lx) => Math.abs(x - lx) < (y - NOIR_LAMP_Y) * 0.42);
    const c = inCone ? L.dropLit : L.drop;
    px(ctx, x, y, c, 1, 2); px(ctx, x - 1, y + 2, c, 1, inCone ? 2 : 1);
  }
  // Rain landing: rings opening on the road and the pavement.
  for (let i = 0; i < Math.ceil(L.rain / 5); i++) {
    const cycle = 10 + Math.floor(noise1(i, 34) * 6), at = (t + i * 7) % cycle;
    const seed = Math.floor((t + i * 7) / cycle);
    const x = noise1(i + seed * 13, 35) * NOIR_W, y = NOIR_ROAD + 1 + noise1(i + seed * 17, 36) * (NOIR_H - NOIR_ROAD - 2);
    if (at === 0) px(ctx, x, y, L.ripple);
    else if (at < 4) { px(ctx, x - at, y, L.ripple); px(ctx, x + at, y, L.ripple); }
  }
}

const noirWorld = (id: World["id"], time: NoirTime): World => ({
  id, fullW: NOIR_W, fullH: NOIR_H, viewW: NOIR_W, viewH: NOIR_H,
  checkpoints: [{ name: "Town", at: 0 }],
  backdrop: (ctx) => noirBackdropOf(ctx, time),
  frame: (ctx, t) => noirFrameOf(ctx, t, time),
  pos: () => ({ x: NOIR_W / 2, y: NOIR_H / 2 }),
  camera: () => ({ x: 0, y: 0 }),
});
export const NOIR_NIGHT = noirWorld("noirNight", "night");
export const NOIR_DAWN = noirWorld("noirDawn", "dawn");
export const NOIR_DAY = noirWorld("noirDay", "day");
export const NOIR_DUSK = noirWorld("noirDusk", "dusk");

// ======================= TYPEWRITER: a repair shop, and one battered machine on the bench =======================
// All in scene pixels, measured from the machine's centre `cx`, so the same drawing serves the shop on the hub and the
// live machine in Vowel Play. Whatever the width, the sheet, the platen and the keys stay put, and a wider scene just
// shows more of the shop.
export const TW_H = 113, TW_MIN_W = 144, TW_BENCH = 83;
/** Top of the sheet, the writing area on it, the line being typed, and the platen. */
export const TW_PAPER = { top: 1, half: 67, textTop: 3, typedY: 26, bottom: 36 };
const TWC = {
  wall: "#2a1c1e", wall2: "#35242a", wall3: "#463033", wall4: "#5e4239", peg: "#1c1214",
  en0: "#23403c", en1: "#3a6a62", en2: "#5a9688", en3: "#83bfad", en4: "#b5dfcf",
  steel0: "#2c3236", steel1: "#596267", steel2: "#98a2a6", steel3: "#d7dedd", steel4: "#ffffff",
  rub0: "#0e0b0d", rub1: "#221c21", rub2: "#3b3238", rust0: "#5a2d1a", rust1: "#93502a", rust2: "#c97f3f",
  wood0: "#3d2213", wood1: "#5c351c", wood2: "#7c4c28", wood3: "#a06a39", wood4: "#c48e52",
  brass0: "#7a5520", brass1: "#b98a33", brass2: "#e3b04b", brass3: "#ffe08a",
  paper0: "#c9b98f", paper1: "#e7d9b4", paper2: "#f6ecd2", paper3: "#fff9e8", ink: "#1b1720", red: "#c8341f", redDk: "#7f1d13", tape: "#d9c98f", tape2: "#b7a56f",
};
export const TW_COLORS = TWC;
const twDither = (x: number, y: number, f: number) => f * 16 > BAYER[y & 3]![x & 3]! + 0.5;
const glyphAt = (ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, c: string) => rows.forEach((r, ry) => [...r].forEach((p, rx) => { if (p === "#") px(ctx, x + rx, y + ry, c); }));
const twLabel = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, c: string) => [...text].forEach((ch, i) => glyphAt(ctx, legendGlyph(ch), x + i * 4, y, c));

function twWall(ctx: CanvasRenderingContext2D, w: number, cx: number) {
  const lampX = cx + 88, lampY = 22;
  for (let y = 0; y < TW_BENCH; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x - lampX) / 1.3, y - lampY) / 110;
    const f = clamp(1 - d, 0, 1) * 3;
    const band = Math.floor(f), frac = f - band;
    const ramp = [TWC.wall, TWC.wall2, TWC.wall3, TWC.wall4];
    px(ctx, x, y, ramp[Math.min(3, band + (twDither(x, y, frac) ? 1 : 0))]!);
    if (x % 6 === 2 && y % 6 === 2) px(ctx, x, y, TWC.peg);
  }
  for (let y = TW_BENCH - 3; y < TW_BENCH; y++) px(ctx, 0, y, y === TW_BENCH - 1 ? TWC.peg : TWC.wall, w, 1);
}

/** What hangs on the wall. Only a scene wider than the machine shows any of it. */
function twShopWall(ctx: CanvasRenderingContext2D, cx: number) {
  // Shelf of spare parts, on the left.
  const sx = cx - 108, sy = 34;
  px(ctx, sx, sy, TWC.wood3, 44, 1); px(ctx, sx, sy + 1, TWC.wood1, 44, 2); px(ctx, sx, sy + 3, TWC.peg, 44, 1);
  px(ctx, sx + 4, sy + 3, TWC.steel1, 1, 4); px(ctx, sx + 39, sy + 3, TWC.steel1, 1, 4);
  [[sx + 3, TWC.en2], [sx + 14, TWC.red], [sx + 25, TWC.brass2]].forEach(([jx, c], j) => {
    const x = jx as number;
    px(ctx, x + 1, sy - 11, TWC.steel2, 7, 2);
    px(ctx, x, sy - 9, TWC.steel0, 9, 9); px(ctx, x + 1, sy - 8, "#54606a", 7, 7);
    px(ctx, x + 1, sy - 8, "#7d8c94", 1, 6);
    for (let k = 0; k < 6; k++) px(ctx, x + 2 + (k * 3 + j) % 5, sy - 2 - (k % 3) * 2, k % 2 ? c as string : TWC.paper2, 2, 2);
  });
  // A little broken portable up on the shelf, waiting its turn, with a ticket on it.
  const bx = sx + 2, by = 62;
  px(ctx, bx - 2, by, TWC.wood3, 44, 1); px(ctx, bx - 2, by + 1, TWC.wood1, 44, 2); px(ctx, bx - 2, by + 3, TWC.peg, 44, 1);
  px(ctx, bx + 4, by - 15, TWC.rub1, 24, 3); px(ctx, bx + 2, by - 15, TWC.steel2, 2, 3); px(ctx, bx + 28, by - 15, TWC.steel2, 2, 3);
  px(ctx, bx + 6, by - 12, "#6f5a48", 20, 12); px(ctx, bx + 6, by - 12, "#92785f", 20, 1); px(ctx, bx + 6, by - 1, "#463628", 20, 1);
  for (let k = 0; k < 5; k++) { px(ctx, bx + 8 + k * 3, by - 8, TWC.rub0, 2, 2); px(ctx, bx + 9 + k * 3, by - 5, TWC.rub0, 2, 2); }
  px(ctx, bx + 26, by - 9, TWC.paper2, 7, 5); px(ctx, bx + 28, by - 7, TWC.red, 3, 1);
  // Hand-lettered sign, hung only where the whole of it shows.
  if (sx + 4 >= 0) { px(ctx, sx + 4, 3, TWC.ink, 34, 12); px(ctx, sx + 5, 4, TWC.paper1, 32, 10); px(ctx, sx + 5, 13, TWC.paper0, 32, 1); twLabel(ctx, "REPAIRS", sx + 7, 6, TWC.redDk); px(ctx, sx + 20, 2, TWC.brass2, 2, 1); }
  // Tools on the pegboard, on the right.
  const tx = cx + 74;
  px(ctx, tx + 34, 8, TWC.steel2, 2, 14); px(ctx, tx + 33, 7, TWC.steel3, 4, 3); px(ctx, tx + 33, 22, TWC.rub1, 4, 9); px(ctx, tx + 33, 22, TWC.red, 1, 9); // screwdriver
  px(ctx, tx + 42, 8, TWC.steel2, 3, 22); px(ctx, tx + 41, 6, TWC.steel2, 5, 3); px(ctx, tx + 42, 6, TWC.wall, 3, 2); px(ctx, tx + 42, 8, TWC.steel3, 1, 22); // spanner
  for (let k = 0; k < 8; k++) px(ctx, tx + 52 + (k % 2), 8 + k * 2, TWC.steel2, 3, 1); // spring
}

/** The bench: scarred planks, oil and old rings. */
function twBenchTop(ctx: CanvasRenderingContext2D, w: number, cx: number) {
  for (let y = TW_BENCH; y < TW_H; y++) for (let x = 0; x < w; x++) {
    const plank = y < 93 ? 0 : y < 103 ? 1 : 2;
    const g = noise2(x * 0.09 + plank * 7, y * 0.9 + plank * 3, 41);
    let c = g > 0.72 ? TWC.wood3 : g < 0.28 ? TWC.wood1 : TWC.wood2;
    const near = 1 - (y - TW_BENCH) / 30;
    if (twDither(x, y, 0.22 * (1 - near))) c = TWC.wood1;
    px(ctx, x, y, c);
  }
  px(ctx, 0, TW_BENCH, TWC.wood4, w, 1);
  [93, 103].forEach((y) => { px(ctx, 0, y, TWC.wood0, w, 1); px(ctx, 0, y + 1, TWC.wood3, w, 1); });
  px(ctx, 0, TW_H - 3, TWC.wood3, w, 1); px(ctx, 0, TW_H - 2, TWC.wood0, w, 2);
  // Nail heads where the planks meet.
  for (let x = (cx - 69 + 400) % 46; x < w; x += 46) { px(ctx, x, 98, TWC.wood0, 2, 1); px(ctx, x + 11, 108, TWC.wood0, 2, 1); }
  // An oil stain and the ring from a mug.
  const stain = (ox: number, oy: number, rx: number, ry: number) => { for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) < 1 && twDither(ox + x, oy + y, 0.55)) px(ctx, ox + x, oy + y, TWC.wood0); };
  stain(cx + 34, 106, 12, 3); stain(cx - 22, 107, 6, 2);
}

/** The shadow the machine throws, then the things lying about that are not keys. */
function twClutter(ctx: CanvasRenderingContext2D, w: number, cx: number) {
  for (let y = 88; y < 93; y++) for (let x = cx - 66; x < cx + 66; x++) if (twDither(x, y, 0.95 - (y - 88) * 0.2)) px(ctx, x, y, TWC.wood0);
  // Screwdriver, lying along the front of the bench.
  const dy = 107, dx = cx - 68;
  px(ctx, dx + 1, dy + 3, TWC.wood0, 28, 1);
  px(ctx, dx, dy, TWC.steel2, 16, 2); px(ctx, dx, dy, TWC.steel3, 16, 1); px(ctx, dx - 1, dy, TWC.steel1, 1, 2);
  px(ctx, dx + 16, dy - 1, TWC.redDk, 12, 4); px(ctx, dx + 16, dy - 1, TWC.red, 12, 2); px(ctx, dx + 18, dy - 1, "#ee6a4c", 8, 1); px(ctx, dx + 19, dy + 1, TWC.redDk, 1, 2); px(ctx, dx + 23, dy + 1, TWC.redDk, 1, 2);
  // A sprung coil.
  const sx = cx + 46, sy = 107;
  for (let k = 0; k < 9; k++) { px(ctx, sx + k * 2, sy + (k % 2 ? 0 : 1), TWC.steel3, 1, 2); px(ctx, sx + k * 2 + 1, sy + (k % 2 ? 2 : 0), TWC.steel1, 1, 1); }
  px(ctx, sx, sy + 3, TWC.wood0, 19, 1);
  // Loose screws.
  ([[cx - 34, 109], [cx - 28, 106], [cx + 10, 109], [cx + 29, 105], [cx + 2, 106]] as const).forEach(([x, y], i) => {
    px(ctx, x, y, TWC.steel3, 3, 1); px(ctx, x, y + 1, i % 2 ? TWC.brass1 : TWC.steel1, 3, 1); px(ctx, x + 1, y + 1, TWC.steel0, 1, 1); px(ctx, x + 3, y + 1, i % 2 ? TWC.brass0 : TWC.steel0, 2, 1); px(ctx, x, y + 2, TWC.wood0, 5, 1);
  });
  if (w < 200) return;
  // Oil can, on wider benches.
  const ox = cx + 76, oy = 99;
  px(ctx, ox + 3, oy + 8, TWC.wood0, 15, 2);
  px(ctx, ox + 2, oy, TWC.rust0, 13, 8); px(ctx, ox + 3, oy, TWC.brass1, 11, 8); px(ctx, ox + 3, oy, TWC.brass3, 2, 7); px(ctx, ox + 12, oy, TWC.brass0, 2, 8);
  px(ctx, ox + 5, oy - 3, TWC.brass1, 7, 3); px(ctx, ox + 7, oy - 5, TWC.steel2, 3, 2);
  for (let k = 0; k < 10; k++) px(ctx, ox + 11 - k, oy - 4 - k, TWC.steel2, 2, 1);
  px(ctx, ox + 5, oy + 3, TWC.red, 7, 3);
  // Gooseneck lamp.
  const lx = cx + 100;
  px(ctx, lx - 6, 97, TWC.en0, 14, 3); px(ctx, lx - 6, 97, TWC.en2, 14, 1); px(ctx, lx, 40, TWC.steel1, 2, 57); px(ctx, lx, 40, TWC.steel3, 1, 57);
  for (let y = 40; y < 97; y += 2) px(ctx, lx, y, TWC.steel0, 2, 1);
  for (let k = 0; k < 16; k++) px(ctx, lx - Math.round(k * 0.8), 40 - k, TWC.steel2, 2, 1);
}

/** The machine's body, from the carriage rail to its rubber feet. */
function twBody(ctx: CanvasRenderingContext2D, cx: number) {
  const half = (y: number) => 53 + Math.round(((y - 46) * 8) / 41);
  for (let y = 46; y < 88; y++) {
    const h = half(y) - (y === 46 ? 2 : y === 47 ? 1 : 0);
    for (let x = cx - h; x < cx + h; x++) {
      const e = Math.min(x - (cx - h), cx + h - 1 - x);
      let c = TWC.en2;
      if (twDither(x, y, clamp((y - 62) / 27, 0, 1) * 0.8)) c = TWC.en1;
      if (y < 50 && twDither(x, y, 1 - (y - 46) / 4)) c = TWC.en3;
      if (e === 0) c = TWC.en0; else if (e === 1) c = x < cx ? TWC.en3 : TWC.en1;
      if (y === 87) c = TWC.en0; else if (y === 86) c = TWC.en1;
      px(ctx, x, y, c);
    }
    px(ctx, cx - h - 1, y, TWC.ink); px(ctx, cx + h, y, TWC.ink);
  }
  // Rubber feet.
  [cx - 56, cx + 46].forEach((x) => { px(ctx, x, 88, TWC.rub0, 10, 2); px(ctx, x + 1, 88, TWC.rub2, 8, 1); });
  // Type basket: a dark mouth, the fan of type bars, the ribbon spools on either side.
  for (let y = 48; y < 57; y++) { const h = 28 + Math.round((y - 48) * 0.7); px(ctx, cx - h, y, TWC.rub0, h * 2, 1); }
  px(ctx, cx - 29, 47, TWC.en0, 58, 1); px(ctx, cx - 34, 57, TWC.en3, 68, 1);
  for (let i = -7; i <= 7; i++) {
    const bx = cx + i * 4, tx = cx + i * 0.5;
    for (let k = 0; k <= 6; k++) px(ctx, bx + (tx - bx) * (k / 6), 56 - k, k === 0 ? TWC.steel3 : k > 4 ? TWC.steel1 : TWC.steel2);
  }
  px(ctx, cx - 3, 49, TWC.steel3, 7, 1); px(ctx, cx - 1, 48, TWC.brass2, 3, 2); // the guide the slugs strike through
  [cx - 44, cx + 44].forEach((sx, side) => {
    disc(ctx, sx, 52, 5, (dx, dy) => { const r = Math.hypot(dx, dy); return r > 4.3 ? TWC.en0 : r > 3.2 ? (dx + dy < 0 ? TWC.steel2 : TWC.steel1) : r > 1.6 ? TWC.rub1 : TWC.steel3; });
    px(ctx, sx - 1, 49, side ? TWC.redDk : TWC.rub2, 2, 1);
  });
  // The ribbon runs across, half black, half red.
  px(ctx, cx - 40, 47, TWC.rub2, 40, 1); px(ctx, cx, 47, TWC.red, 40, 1);
  // Keyboard well.
  px(ctx, cx - 47, 58, TWC.rub0, 94, 25); px(ctx, cx - 47, 58, TWC.en0, 94, 1); px(ctx, cx - 47, 83, TWC.en3, 94, 1); px(ctx, cx - 48, 58, TWC.en0, 1, 26); px(ctx, cx + 47, 58, TWC.en3, 1, 26);
  for (const row of TW_ROWS) for (const ch of row.keys) twKey(ctx, ch, cx, 0);
  // Space bar, and the arms that hold it.
  px(ctx, cx - 24, 81, TWC.steel0, 48, 2); px(ctx, cx - 24, 81, TWC.steel3, 48, 1); px(ctx, cx - 25, 81, TWC.steel1, 1, 2); px(ctx, cx + 24, 81, TWC.steel0, 1, 2);
  // Maker's plate, with the corner sprung.
  px(ctx, cx - 11, 84, TWC.brass0, 22, 3); px(ctx, cx - 10, 84, TWC.brass2, 20, 2); px(ctx, cx - 10, 84, TWC.brass3, 20, 1); px(ctx, cx + 8, 85, TWC.brass0, 3, 1);
  [2, 4, 7, 9, 11, 14, 16].forEach((k) => px(ctx, cx - 9 + k, 85, TWC.brass0, 1, 1));
  // Battle damage: bare metal where the enamel chipped, rust at the edges of it.
  const chip = (x: number, y: number, rows: string[]) => rows.forEach((r, ry) => [...r].forEach((p, rx) => { const c = { m: TWC.steel2, h: TWC.steel3, r: TWC.rust1, d: TWC.rust0, R: TWC.rust2 }[p]; if (c) px(ctx, x + rx, y + ry, c); }));
  chip(cx - 58, 74, ["..rr..", ".rmhr.", "rmmmdr", ".rmmr.", "..dd.."]);
  chip(cx + 49, 60, [".rr.", "rmhr", "rmmd", ".dd."]);
  chip(cx + 39, 84, ["r.rRr.r", "dRrRdrd"]);
  chip(cx - 53, 49, ["rh", "dr"]);
  chip(cx + 54, 82, ["Rr", "rd", "Rd"]);
  // A long scratch, a dent, and a crack someone taped over.
  for (let k = 0; k < 15; k++) if (k % 4 !== 3) px(ctx, cx - 56 + k * 0.6, 60 + k, TWC.en4);
  disc(ctx, cx + 52, 71, 3, (dx, dy) => (dx + dy < -1 ? TWC.en0 : dx + dy > 1 ? TWC.en4 : TWC.en1));
  for (let k = 0; k < 8; k++) px(ctx, cx - 58 + k, 54 + (k % 3 === 0 ? 1 : 0) + k * 0.2, TWC.en0);
  px(ctx, cx - 57, 53, TWC.tape, 9, 3); px(ctx, cx - 57, 55, TWC.tape2, 9, 1); px(ctx, cx - 55, 53, TWC.tape2, 1, 2);
  // Screws: three that match and one somebody found in a drawer.
  ([[cx - 50, 48, TWC.steel2], [cx + 50, 48, TWC.steel2], [cx - 54, 85, TWC.steel2], [cx + 55, 85, TWC.brass2]] as const).forEach(([x, y, c]) => { px(ctx, x, y, c, 2, 2); px(ctx, x, y, TWC.steel0); });
}

const TW_ROWS = [{ keys: "QWERTYUIOP", x: -40, y: 59 }, { keys: "ASDFGHJKL", x: -37, y: 66 }, { keys: "ZXCVBNM", x: -31, y: 73 }];
const twKeyAt = (ch: string): { x: number; y: number } | null => {
  for (const r of TW_ROWS) { const i = r.keys.indexOf(ch); if (i >= 0) return { x: r.x + i * 8, y: r.y }; }
  return null;
};

/** One key on the board. A vowel's key is gone: just the bare stem in an empty socket. `dip` is how far it is pressed. */
export function twKey(ctx: CanvasRenderingContext2D, ch: string, cx: number, dip: number) {
  const at = twKeyAt(ch);
  if (!at) return;
  const x = cx + at.x, y = at.y + dip;
  if (dip) px(ctx, x, at.y, TWC.rub0, 7, 7);
  if ("AEIOU".includes(ch)) {
    px(ctx, x + 1, at.y + 1, TWC.rub2, 5, 5); px(ctx, x + 2, at.y + 2, TWC.rub0, 3, 3);
    px(ctx, x + 3, y + 2, TWC.steel3, 1, 2); px(ctx, x + 3, y + 4, TWC.steel1, 1, 1);
    return;
  }
  px(ctx, x + 1, y, TWC.steel3, 5, 1); px(ctx, x, y + 1, TWC.steel2, 1, 5); px(ctx, x + 6, y + 1, TWC.steel1, 1, 5); px(ctx, x + 1, y + 6, TWC.steel1, 5, 1);
  px(ctx, x + 1, y + 1, TWC.rub1, 5, 5);
  // A couple of legends have worn down.
  glyphAt(ctx, legendGlyph(ch), x + 2, y + 1, ch === "T" || ch === "N" ? TWC.steel1 : TWC.paper3);
}

/** The roller, its knobs, the return lever and the repair tag. */
export function twCarriage(ctx: CanvasRenderingContext2D, cx: number, nudge = 0) {
  const x0 = cx - 69 + nudge, w = 138;
  px(ctx, x0, 36, TWC.rub2, w, 1); px(ctx, x0, 37, TWC.rub1, w, 2); px(ctx, x0, 39, TWC.rub2, w, 1); px(ctx, x0, 40, TWC.rub1, w, 2); px(ctx, x0, 42, TWC.rub0, w, 2);
  for (let k = 3; k < w - 2; k += 9) px(ctx, x0 + k, 37, TWC.rub2, 3, 1);
  // The chrome paper bail, with its two little rollers.
  px(ctx, cx - 64 + nudge, 35, TWC.steel3, 128, 1); px(ctx, cx - 64 + nudge, 36, TWC.steel1, 128, 1);
  [cx - 34, cx + 28].forEach((x) => { px(ctx, x + nudge, 34, TWC.rub1, 6, 3); px(ctx, x + nudge, 34, TWC.rub2, 6, 1); });
  // Rail.
  px(ctx, cx - 66 + nudge, 44, TWC.en0, 132, 2); px(ctx, cx - 66 + nudge, 44, TWC.en3, 132, 1);
  // Knobs.
  [cx - 72 + nudge, cx + 69 + nudge].forEach((x) => {
    px(ctx, x, 35, TWC.rub0, 3, 10); px(ctx, x, 36, TWC.rub2, 3, 1);
    for (let y = 36; y < 44; y += 2) px(ctx, x, y, TWC.rub2, 3, 1);
  });
  px(ctx, cx - 69 + nudge, 36, TWC.steel2, 1, 8); px(ctx, cx + 68 + nudge, 36, TWC.steel1, 1, 8);
  // Return lever, bent, on the left.
  const lx = cx - 71 + nudge;
  px(ctx, lx, 25, TWC.steel2, 2, 10); px(ctx, lx, 25, TWC.steel3, 1, 10); px(ctx, lx - 0, 22, TWC.rub1, 3, 3); px(ctx, lx, 22, TWC.rub2, 2, 1);
}

/** A blank sheet, curled at the top, with a coffee ring and a fold in it. */
export function twPaper(ctx: CanvasRenderingContext2D, cx: number, nudge = 0) {
  const { top, half, bottom } = TW_PAPER;
  const x0 = cx - half + nudge, w = half * 2;
  px(ctx, x0, top, TWC.paper2, w, bottom - top);
  px(ctx, x0, top, TWC.paper3, w, 1);
  px(ctx, x0, top + 1, TWC.paper1, w, 1);
  px(ctx, x0, top + 2, TWC.paper3, w, 1);
  for (let y = top + 3; y < bottom; y++) for (let x = x0; x < x0 + w; x++) {
    if (twDither(x - nudge, y, clamp((y - 24) / 12, 0, 1) * 0.42)) px(ctx, x, y, TWC.paper1);
  }
  px(ctx, x0 - 1, top, TWC.ink, 1, bottom - top); px(ctx, x0 + w, top, TWC.ink, 1, bottom - top);
  px(ctx, x0, top + 3, TWC.paper1, 1, bottom - top - 3); px(ctx, x0 + w - 1, top + 3, TWC.paper0, 1, bottom - top - 3);
  // Coffee ring, very faint, low on the right where no letter sits.
  for (let a = 0; a < 44; a++) {
    if (a % 7 > 4) continue;
    const r = 7;
    px(ctx, cx + 56 + nudge + Math.cos((a / 44) * Math.PI * 2) * r, 29 + Math.sin((a / 44) * Math.PI * 2) * r * 0.75, TWC.paper0);
  }
}

/** Where the loose keys lie. The same ones every word: what is on the bench must never hint at the word. */
export const TW_LOOSE: { ch: string; x: number; y: number; lean: number }[] = [
  { ch: "A", x: -66, y: 93, lean: 0 }, { ch: "E", x: -53, y: 95, lean: 1 }, { ch: "O", x: -40, y: 92, lean: -1 }, { ch: "I", x: -27, y: 95, lean: 0 }, { ch: "E", x: -14, y: 93, lean: -1 },
  { ch: "U", x: -1, y: 95, lean: 1 }, { ch: "A", x: 12, y: 92, lean: 0 }, { ch: "I", x: 25, y: 95, lean: -1 }, { ch: "O", x: 38, y: 93, lean: 1 }, { ch: "E", x: 53, y: 94, lean: 0 },
];

/** A loose vowel key. `lean` slants it where it fell; `shadow` is off while it is in the air. */
export function twLooseKey(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, lean = 0, shadow = true) {
  const off = (ry: number) => (lean && ry < 4 ? lean : 0);
  if (shadow) { px(ctx, x + 2, y + 9, TWC.wood0, 8, 1); px(ctx, x + 4, y + 11, TWC.wood0, 4, 1); }
  LOOSE_KEY_ROWS.forEach((r, ry) => [...r].forEach((p, rx) => { const c = LOOSE_KEY_PAL[p]; if (c) px(ctx, x + rx + off(ry), y + ry, c); }));
  legendGlyph(ch).forEach((r, ry) => [...r].forEach((p, rx) => { if (p === "#") px(ctx, x + 3 + rx + off(ry + 2), y + 2 + ry, TWC.ink); }));
}

/** Everything that doesn't move, in a scene `w` wide. */
export function twStatic(ctx: CanvasRenderingContext2D, w: number) {
  const cx = Math.floor(w / 2);
  twWall(ctx, w, cx);
  twShopWall(ctx, cx);
  twBenchTop(ctx, w, cx);
  twClutter(ctx, w, cx);
  twBody(ctx, cx);
}

/** A slug of type on the sheet, a touch uneven in the way an old machine is. */
export function twType(ctx: CanvasRenderingContext2D, ch: string, size: "big" | "mid" | "small", x: number, y: number, color: string) {
  glyphAt(ctx, typeGlyph(ch, size), x, y, color);
}

const TW_W = 220;
const twMotes = (ctx: CanvasRenderingContext2D, t: number, w: number) => {
  for (let i = 0; i < 12; i++) {
    const x = (noise1(i, 51) * w + Math.sin(t / 26 + i) * 5 + t * 0.06 * (i % 3 + 1)) % w;
    const y = 8 + ((noise1(i, 52) * 66 + t * (0.04 + (i % 4) * 0.015)) % 66);
    if ((t + i * 9) % 44 < 30) px(ctx, x, y, "#d8bb86");
  }
};
const TW_DEMO = "VWLPLY";
export const TYPEWRITER: World = {
  id: "typewriter", fullW: TW_W, fullH: TW_H, viewW: TW_W, viewH: TW_H,
  checkpoints: [{ name: "Shop", at: 0 }],
  backdrop: (ctx) => {
    twStatic(ctx, TW_W);
    const cx = TW_W / 2;
    TW_LOOSE.forEach((k) => twLooseKey(ctx, k.ch, cx + k.x, k.y, k.lean));
    twPaper(ctx, cx);
    [...TW_DEMO].forEach((ch, i) => twType(ctx, ch, "big", cx - 47 + i * 16, 7, TWC.ink));
    twCarriage(ctx, cx);
  },
  frame: (ctx, t) => {
    twMotes(ctx, t, TW_W);
    // The lamp's bulb flickers now and then.
    const lit = t % 97 > 2 && t % 131 > 1;
    const lx = TW_W / 2 + 84, ly = 22;
    px(ctx, lx - 7, ly - 3, TWC.en0, 14, 3); px(ctx, lx - 6, ly - 4, TWC.en2, 12, 2); px(ctx, lx - 3, ly - 6, TWC.en1, 6, 2);
    px(ctx, lx - 5, ly, lit ? TWC.brass3 : TWC.brass1, 10, 2);
    if (lit) for (let y = 2; y < 18; y++) for (let x = -5 - y; x < 5 + y; x++) if ((x * 3 + y * 5) % 16 === 0 && y % 3 === 0) px(ctx, lx + x, ly + y, "#7a5a3c");
    // One loose key rocks where it landed.
    const k = TW_LOOSE[6]!, rock = t % 80 < 8 ? (t % 4 < 2 ? 1 : -1) : 0;
    if (rock) { px(ctx, TW_W / 2 + k.x - 1, k.y - 1, TWC.wood2, 12, 13); twLooseKey(ctx, k.ch, TW_W / 2 + k.x, k.y - 1, rock); }
  },
  pos: () => ({ x: TW_W / 2, y: TW_H / 2 }),
  camera: () => ({ x: 0, y: 0 }),
};

export const WORLDS = { summit: SUMMIT, sky: SKY, launch: LAUNCH, hall: HALL, ball: BALL, studio: STUDIO, board: BOARD, arcade: ARCADE, ladder: LADDER_WORLD, typewriter: TYPEWRITER, noirNight: NOIR_NIGHT, noirDawn: NOIR_DAWN, noirDay: NOIR_DAY, noirDusk: NOIR_DUSK };

/** The last checkpoint reached at a fraction of the journey. */
export function checkpointAt(world: World, f: number): Checkpoint {
  if (f < 0 && world.below?.length) return [...world.below].reverse().find((c) => f <= c.at) ?? world.below[0]!;
  let out = world.checkpoints[0]!;
  for (const c of world.checkpoints) if (f >= c.at - 1e-9) out = c;
  return out;
}
