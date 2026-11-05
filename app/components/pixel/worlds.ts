// Pixel-art worlds for the trivia games, drawn in code and scaled up with hard edges.
// Each world is a big map (a tall mountain, a tall sky, a long trip through the solar system). A camera shows one
// window of it and follows the leading player, so every step of progress is a visible climb or flight.
// Named checkpoints mark the way; crossing one is a moment the game celebrates.

/** `value` is the fraction of the journey: 0 at the start, 1 at the end, below 0 for worlds with an underground. */
export type Actor = { name: string; value: number; color?: string };
export type Checkpoint = { name: string; at: number };

export type World = {
  id: "summit" | "sky" | "launch" | "hall" | "ball" | "studio" | "board" | "arcade";
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

export const WORLDS = { summit: SUMMIT, sky: SKY, launch: LAUNCH, hall: HALL, ball: BALL, studio: STUDIO, board: BOARD, arcade: ARCADE };

/** The last checkpoint reached at a fraction of the journey. */
export function checkpointAt(world: World, f: number): Checkpoint {
  if (f < 0 && world.below?.length) return [...world.below].reverse().find((c) => f <= c.at) ?? world.below[0]!;
  let out = world.checkpoints[0]!;
  for (const c of world.checkpoints) if (f >= c.at - 1e-9) out = c;
  return out;
}
