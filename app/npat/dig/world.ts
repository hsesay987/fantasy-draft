import { ZONES } from "../../topicDraft/npat/rules";

// The dig world, ported from the approved mockup (docs/superpowers/mockups/npat-v2-dig.html). Pure: no DOM. The seeded
// generator is re-seeded on every paint, so the world is identical on every render.
export { ZONES };
export const W = 240, VH = 150, WH = 720, G = 40, K = 0.13;
export const my = (m: number) => G + m * K;

export const C = {
  sky: "#8fd3ff", cl: "#f4f1e8", gr: "#4fb36a", gd: "#2f7a4a", so: "#6b4a32", sd: "#4f3524", cy: "#8a6440", ro: "#5d5f70",
  rd: "#43455a", mg: "#2b1d2e", la: "#ff7a2e", ll: "#ffc35a", ink: "#1b1828", bo: "#e6dcc2", bl: "#4c6ef5", cyan: "#7fd6e6", pu: "#9b6bd6",
} as const;

/** 5×5 gem: `a` = shadow side, `b` = lit side, `l` = highlight. */
export const GEM_SPRITE = ["  a  ", " abb ", "abbbl", " abb ", "  a  "];

/** Index into ZONES for a depth in metres (the zone starts exactly at its depth). */
export const zoneAt = (m: number): number => {
  let z = 0;
  ZONES.forEach((zone, i) => { if (m >= zone.m) z = i; });
  return z;
};

type Pen = Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect">;
export type Worm = { x: number; y: number; d: number };

export type World = {
  width: typeof W;
  height: typeof WH;
  /** Paints the static layer; deterministic (re-seeds each call). */
  paint: (ctx: Pen) => void;
  layout: {
    /** Lava river baselines (y), core centre, core orb x, worm start state, clouds, ant, lava wave. */
    L1: number; L2: number; CY: number; OX: number;
    worms: Worm[]; clouds: [number, number][]; ant: { x: number; y: number };
    lava: (x: number, base: number) => number;
  };
};

export function buildWorld(seed = 11): World {
  const lava = (x: number, base: number) => base + Math.round(Math.sin(x * 0.07) * 4);
  const L1 = my(4400), L2 = my(4700), CY = my(4930), OX = 146;

  // One full generation pass. The worms are drawn from the same generator after the painting, so a dry run yields them.
  const run = (g: Pen): Worm[] => {
    let s = seed;
    const R = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const F = (x: number, y: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    const P = (x: number, y: number, col: string) => F(x, y, 1, 1, col);
    const disc = (cx: number, cy: number, r: number, col: string, ry = r) => {
      for (let y = -ry; y <= ry; y++) for (let x = -r; x <= r; x++) if ((x * x) / (r * r) + (y * y) / (ry * ry) <= 1) P(cx + x, cy + y, col);
    };
    const walk = (x: number, y: number, n: number, col: string, sp = 0.5) => {
      for (let i = 0; i < n; i++) { P(x, y, col); if (R() < sp) x += R() < 0.5 ? -1 : 1; else y++; }
    };
    const bands: [number, string, string][] = [[0, C.so, C.sd], [1000, C.cy, C.so], [1800, C.ro, C.rd], [3400, C.rd, C.ink], [4200, C.mg, C.ink]];
    const edge = bands.map(([m], k) => Array.from({ length: W }, (_, x) => (k ? Math.round(my(m) + Math.sin(x * 0.14 + k) * 1.5 + (R() - 0.5) * 2) : G)));
    F(0, 0, W, G, C.sky);
    for (let x = 0; x < W; x++) { const h = G - 8 + Math.round(Math.sin(x * 0.05) * 3); F(x, h, 1, G - h, C.gd); }
    for (let x = 0; x < W; x++) for (let y = G; y < WH; y++) {
      let k = 0;
      for (let j = 0; j < 5; j++) if (y >= edge[j][x]) k = j;
      const [, a, b] = bands[k];
      let col = R() < 0.14 ? b : a;
      if (k === 1 && (y + Math.round(Math.sin(x * 0.08) * 2)) % 8 === 0) col = C.so;
      if (k === 2 && (y + Math.round(Math.sin(x * 0.05) * 3)) % 13 === 0) col = C.rd;
      if (k === 2 && y > my(2600) && y < my(2850) && R() < 0.03) col = C.bo;
      P(x, y, col);
    }
    for (let x = 0; x < W; x++) { F(x, G, 1, 3, C.gr); P(x, G + 3, C.gd); }
    const tree = (x: number, h: number) => { F(x, G - h, 2, h, C.so); disc(x + 1, G - h - 3, 5, C.gd, 4); disc(x, G - h - 4, 3, C.gr, 3); };
    tree(22, 6); tree(60, 8); tree(190, 7);
    for (let i = 0; i < 26; i++) walk(Math.floor(R() * W), G + 4, 8 + Math.floor(R() * 14), C.cy, 0.4);
    for (let i = 0; i < 16; i++) { const x = Math.floor(R() * W), y = G + 8 + Math.floor(R() * 50); F(x, y, 2, 2, C.ro); P(x, y, C.cl); }
    disc(44, G + 16, 6, C.sd, 3); F(42, G + 15, 3, 2, C.cl); P(41, G + 14, C.cl); P(42, G + 13, C.cl); P(44, G + 15, C.ink);
    for (let i = 0; i < 6; i++) { let x = 30 + Math.floor(R() * 180), y = my(400); for (let k = 0; k < 60; k++) { P(x, y, C.sd); if (R() < 0.6) x += R() < 0.5 ? -1 : 1; else y++; } }
    const chest = (x: number, y: number) => { F(x - 1, y - 1, 14, 10, C.ink); F(x, y, 12, 8, C.cy); F(x, y + 3, 12, 1, C.sd); F(x + 5, y + 3, 2, 2, C.ll); };
    chest(40, my(800));
    for (let i = 0; i < 12; i++) { const x = Math.floor(R() * 228), y = my(1100) + Math.floor(R() * 80); F(x, y, 4, 3, C.ro); F(x, y, 3, 1, C.cl); }
    const cart = (x: number, y: number) => {
      F(x - 6, y + 10, 28, 1, C.sd); for (let k = -6; k < 22; k += 4) F(x + k, y + 11, 2, 1, C.so);
      F(x, y, 16, 7, C.ink); F(x + 1, y + 1, 14, 5, C.rd); F(x + 2, y + 7, 3, 3, C.ink); F(x + 11, y + 7, 3, 3, C.ink); F(x + 3, y - 1, 4, 1, C.ll);
    };
    cart(176, my(1500));
    for (let i = 0; i < 14; i++) walk(Math.floor(R() * W), my(1850) + Math.floor(R() * 120), 16, C.rd, 0.6);
    const bone = (x: number, y: number) => { F(x, y, 9, 2, C.bo); F(x - 1, y - 1, 2, 2, C.bo); F(x - 1, y + 2, 2, 1, C.bo); F(x + 8, y - 1, 2, 2, C.bo); F(x + 8, y + 2, 2, 1, C.bo); };
    bone(60, my(2650)); bone(170, my(2800));
    const amm = (cx: number, cy: number) => { for (let a = 0; a < 10; a += 0.25) { const r = 1 + a * 0.42; P(cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r), C.bo); } };
    amm(34, my(2900)); amm(196, my(3200));
    const skull = (x: number, y: number) => { F(x, y, 10, 6, C.bo); F(x + 2, y + 2, 2, 2, C.ink); F(x + 10, y + 3, 6, 2, C.bo); for (let i = 0; i < 5; i++) F(x + 18 + i * 3, y + 1 + (i % 2), 2, 4, C.bo); };
    skull(142, my(2700));
    F(150, my(3050), 14, 1, C.bo); for (let k = 0; k < 5; k++) { P(152 + k * 2, my(3050) - 2, C.bo); P(152 + k * 2, my(3050) + 2, C.bo); } F(164, my(3050) - 2, 3, 5, C.bo);
    for (let i = 0; i < 9; i++) { const x = 6 + i * 27 + Math.floor(R() * 8), y = edge[3][x]; for (let k = 0; k < 6; k++) F(x + Math.floor(k / 2), y + k, Math.max(1, 4 - k), 1, C.ro); }
    const gem = (x: number, y: number) => { P(x + 1, y, C.cyan); F(x, y + 1, 3, 1, C.cyan); P(x + 1, y + 2, C.rd); P(x + 1, y + 1, C.cl); };
    for (let i = 0; i < 12; i++) gem(Math.floor(R() * 230), my(3450) + Math.floor(R() * 100));
    const geo = (x: number, y: number) => { F(x, y, 12, 10, C.ink); F(x + 1, y + 1, 10, 8, C.cyan); F(x + 3, y + 3, 6, 4, C.rd); P(x + 4, y + 4, C.cl); };
    geo(186, my(3700));
    disc(84, my(3800), 9, C.bl, 3); for (let x = -7; x <= 7; x += 2) P(84 + x, my(3800) - 2, C.cyan);
    for (let i = 0; i < 10; i++) { const x = Math.floor(R() * 230), y = my(3950) + Math.floor(R() * 60); P(x + 1, y, C.ink); F(x, y + 1, 3, 1, C.ink); F(x, y + 2, 4, 1, C.ink); P(x + 1, y + 1, C.ro); }
    for (let i = 0; i < 14; i++) walk(Math.floor(R() * W), L1 + 5, 6, C.la, 0.6);
    for (let x = 0; x < W; x++) for (let y = CY - 20; y < CY + 20; y++) {
      const dx = (x - 124) / 48, dy = (y - CY) / 16;
      if (dx * dx + dy * dy < 1) P(x, y, dx * dx + dy * dy > 0.78 ? C.mg : C.ink);
    }
    return Array.from({ length: 6 }, () => ({ x: R() * W, y: G + 10 + Math.floor(R() * 40), d: R() < 0.5 ? -1 : 1 }));
  };

  const nop: Pen = { fillStyle: "", fillRect: () => {} };
  return {
    width: W, height: WH,
    paint: (ctx) => { run(ctx); },
    layout: { L1, L2, CY, OX, worms: run(nop), clouds: [[30, 10], [120, 16], [190, 7]], ant: { x: 60, y: my(560) }, lava },
  };
}
