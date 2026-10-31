// Pixel-art worlds for the trivia games, drawn in code and scaled up with hard edges.
// Each world is a big map (a tall mountain, a tall sky, a long trip through the solar system). A camera shows one
// window of it and follows the leading player, so every step of progress is a visible climb or flight.
// Named checkpoints mark the way; crossing one is a moment the game celebrates.

export type Actor = { name: string; value: number };
export type Checkpoint = { name: string; at: number };

export type World = {
  id: "summit" | "sky" | "launch";
  /** Size of the whole map. */
  fullW: number;
  fullH: number;
  /** Size of the window the camera shows. */
  viewW: number;
  viewH: number;
  checkpoints: Checkpoint[];
  backdrop: (ctx: CanvasRenderingContext2D) => void;
  /** Moving things, in map coordinates. `cam` is the camera's top-left corner. */
  frame: (ctx: CanvasRenderingContext2D, t: number, shown: number[], moving: boolean[], cam: { x: number; y: number }) => void;
  /** Where an actor is at a given fraction of the journey, in map coordinates. */
  pos: (f: number, i: number, n: number) => { x: number; y: number };
  /** Top-left of the camera window when it centres on a point, kept inside the map. */
  camera: (p: { x: number; y: number }) => { x: number; y: number };
};

export const ACTOR_COLORS = ["#ff4d6d", "#4cc9f0", "#ffd23f", "#3ddc97", "#fb923c", "#c084fc"];

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

// ======================= SUMMIT: a mountain with a long switchback trail =======================
const S_W = 320, S_H = 520, PEAK = { x: 168, y: 34 };
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
const CLIMBER = ["..h..", ".hhh.", ".sss.", "bbbbp", ".bbbp", ".l.l."];

export const SUMMIT: World = {
  id: "summit", fullW: S_W, fullH: S_H, viewW: 320, viewH: 150,
  checkpoints: [
    { name: "Trailhead", at: 0 }, { name: "Pine Hollow", at: 0.12 }, { name: "Fox Bridge", at: 0.25 }, { name: "Eagle Rock", at: 0.38 },
    { name: "Misty Ledge", at: 0.5 }, { name: "Frost Hut", at: 0.62 }, { name: "Ice Wall", at: 0.75 }, { name: "Cloud Gate", at: 0.88 }, { name: "Summit", at: 1 },
  ],
  backdrop(ctx) {
    ditherSky(ctx, 0, 0, S_W, S_H, [[0, "#0f1640"], [0.25, "#24407e"], [0.55, "#5e8cc9"], [0.8, "#9cc3e6"], [1, "#d7e8f5"]]);
    const r = rng(7);
    for (let i = 0; i < 60; i++) px(ctx, r() * S_W, r() * 110, r() > 0.7 ? "#ffffff" : "#9fb0e0");
    // far ranges on both sides
    for (let x = 0; x < S_W; x++) {
      const h = 300 + Math.sin(x * 0.04) * 22 + Math.sin(x * 0.13 + 1) * 8 + noise1(x, 3) * 3;
      for (let y = Math.round(h); y < S_H; y++) px(ctx, x, y, y < h + 6 && h < 300 ? "#e8eef8" : "#6f86b8");
    }
    // the great peak, lit from the left, with rock bands, cliffs and a snowfield
    for (let y = PEAK.y; y < S_H; y++) {
      const hw = halfWidth(y) + noise1(y, 9) * 4 + Math.sin(y * 0.09) * 3;
      for (let x = Math.floor(PEAK.x - hw); x <= Math.ceil(PEAK.x + hw); x++) {
        if (x < 0 || x >= S_W) continue;
        const lit = x < PEAK.x + Math.sin(y * 0.05) * 6;
        const snowLine = 230 + noise1(x, 11) * 22 + Math.sin(x * 0.17) * 10;
        let c = lit ? "#8493ad" : "#58617c";
        if (y < snowLine) c = lit ? "#ffffff" : "#c7d4ea";
        else if ((x * 7 + y * 13) % 19 === 0) c = lit ? "#6d7c96" : "#444d66";
        if (y > snowLine && y % 37 < 2) c = lit ? "#6d7c96" : "#3e4760";
        px(ctx, x, y, c);
      }
    }
    // forest band and meadow at the foot
    for (let x = 0; x < S_W; x++) {
      const g = 470 + Math.sin(x * 0.05) * 6 + noise1(x, 5) * 3;
      for (let y = Math.round(g); y < S_H; y++) px(ctx, x, y, y < g + 2 ? "#5c9a63" : "#2e5a3f");
    }
    for (let i = 0; i < 90; i++) {
      const x = Math.round(r() * S_W), base = 380 + r() * 95, h = 5 + Math.round(r() * 6);
      if (Math.abs(x - PEAK.x) < halfWidth(base) * 0.35) continue;
      for (let k = 0; k < h; k++) { const half = Math.floor((k * 3) / h); for (let dx = -half; dx <= half; dx++) px(ctx, x + dx, base - h + k, k % 3 === 0 ? "#2f6b45" : "#1f4e33"); }
      px(ctx, x, base, "#4a3324", 1, 2);
    }
    // the trail
    for (let i = 1; i < TRAIL_POINTS.length; i++) {
      const [x0, y0] = TRAIL_POINTS[i - 1]!, [x1, y1] = TRAIL_POINTS[i]!;
      const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
      for (let k = 0; k < n; k += 2) px(ctx, x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n, "#3c3550");
    }
    // a hut, a bridge and a flag at each checkpoint
    SUMMIT.checkpoints.slice(1).forEach((cp, i) => {
      const p = summitPath(cp.at);
      px(ctx, p.x + 2, p.y - 9, "#3c3550", 1, 9);
      px(ctx, p.x + 3, p.y - 9, ["#ffd23f", "#4cc9f0", "#c084fc", "#3ddc97", "#fb923c", "#ff4d6d", "#ffffff", "#ffd23f"][i % 8]!, 5, 3);
    });
  },
  frame(ctx, t, shown, moving, cam) {
    for (let i = 0; i < 7; i++) {
      const w = 22 + (i % 3) * 8;
      cloud(ctx, ((t * (0.06 + (i % 3) * 0.03) + i * 97) % (S_W + 60)) - 40, 60 + i * 55, w);
    }
    for (let i = 0; i < 30; i++) px(ctx, (noise1(i, 1) * S_W + t * 1.4) % S_W, cam.y + ((noise1(i, 2) * 150 + t * 0.6 + i * 5) % 150), "#ffffff");
    for (let i = 0; i < 3; i++) { const bx = ((t * 0.5 + i * 40) % 360) - 20, by = 330 + i * 6 + Math.sin(t / 6 + i) * 2; px(ctx, bx, by, "#24304f", 2, 1); px(ctx, bx + 3, by, "#24304f", 2, 1); }
    shown.forEach((v, i) => {
      const p = summitPath(v);
      const hop = moving[i] ? Math.abs(Math.sin(t * 1.1 + i)) * 2 : 0;
      if (moving[i]) for (let k = 0; k < 3; k++) px(ctx, p.x - 3 + noise1(k + t, i) * 6, p.y - 1 + noise1(k * 2 + t, i) * 2, "#e8e2d0");
      drawSprite(ctx, CLIMBER, { h: ACTOR_COLORS[i % 6]!, s: "#ffd9b0", b: "#2b2d42", p: "#8a5a2b", l: "#1a1033" }, p.x - 2 + (i - (shown.length - 1) / 2) * 6, p.y - 6 - hop);
    });
  },
  pos: (f) => summitPath(f),
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
  frame(ctx, t, shown, moving) {
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
      drawSprite(ctx, BALLOON, { c: ACTOR_COLORS[i % 6]!, C: "#ffe9a6", r: "#6b4226", b: "#8a5a2b" }, p.x - 5 + sway, p.y - 10);
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
  frame(ctx, t, shown, moving) {
    for (let i = 0; i < 40; i++) if ((t + i * 7) % 26 < 2) px(ctx, noise1(i, 8) * L_W, noise1(i, 9) * L_H, "#ffffff");
    shown.forEach((v, i) => {
      const x = shipX(v), y = ORBIT_Y + (i - (shown.length - 1) / 2) * 12 + Math.sin(t / 6 + i) * 1.5;
      const thrust = moving[i] ? 8 + (t % 3) * 2 : 3;
      for (let k = 0; k < thrust; k++) px(ctx, x - 2 - k, y + 2 + noise1(k + t, i) * 2 - 1, k < 3 ? "#fff3b0" : k < 6 ? "#ffb347" : "#ff4d6d");
      drawSprite(ctx, SHIP, { w: "#f1f1f8", B: "#4cc9f0", r: ACTOR_COLORS[i % 6]!, o: "#ffd23f" }, x, y - 1);
    });
  },
  pos: (f, i, n) => ({ x: shipX(f) + 6, y: ORBIT_Y + (i - (n - 1) / 2) * 12 }),
  camera: (p) => ({ x: clamp(p.x - 110, 0, L_W - 320), y: 0 }),
};

export const WORLDS = { summit: SUMMIT, sky: SKY, launch: LAUNCH };

/** The last checkpoint reached at a fraction of the journey. */
export function checkpointAt(world: World, f: number): Checkpoint {
  let out = world.checkpoints[0]!;
  for (const c of world.checkpoints) if (f >= c.at - 1e-9) out = c;
  return out;
}
