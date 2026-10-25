"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { segmentAt, spinTarget } from "./game";

export const WHEEL_COLORS = ["#7c3aed", "#ff4d6d", "#4cc9f0", "#ffd23f", "#3ddc97", "#b9a4ff", "#fb923c", "#22d3ee"];
const RGB = WHEEL_COLORS.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const W = 96, H = 104, CX = 47.5, CY = 55.5, R = 44;

export type WheelHandle = { spin: (index: number, onTick?: () => void) => Promise<void> };

/** A prize wheel drawn one pixel at a time so it stays crisp when scaled up. The pointer sits at the top. */
export const PixelWheel = forwardRef<WheelHandle, { segments: number }>(function PixelWheel({ segments }, handle) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rot = useRef(0);
  const img = useRef<ImageData | null>(null);

  const draw = useCallback((deg: number) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    img.current ??= ctx.createImageData(W, H);
    const d = img.current.data;
    d.fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = x - CX, dy = y - CY, r = Math.hypot(dx, dy);
      if (r > R + 3) continue;
      let c: number[];
      if (r > R) c = [255, 255, 255];
      else if (r < 7) c = r < 5 ? [255, 77, 109] : [7, 4, 25];
      else {
        const a = ((((Math.atan2(dy, dx) + Math.PI / 2 - (deg * Math.PI) / 180) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
        const f = (a / (2 * Math.PI)) * segments, idx = Math.floor(f);
        c = f - idx < 0.035 ? [7, 4, 25] : Math.floor(r / 4) % 2 && idx % 2 === 0 ? RGB[idx % 8]!.map((v) => Math.min(255, v + 18)) : RGB[idx % 8]!;
      }
      const i = (y * W + x) * 4;
      d[i] = c[0]!; d[i + 1] = c[1]!; d[i + 2] = c[2]!; d[i + 3] = 255;
    }
    ctx.putImageData(img.current, 0, 0);
    ctx.fillStyle = "#070419"; ctx.fillRect(43, 0, 10, 4); ctx.fillRect(44, 4, 8, 3); ctx.fillRect(45, 7, 6, 3);
    ctx.fillStyle = "#ff4d6d"; ctx.fillRect(44, 0, 8, 3); ctx.fillRect(45, 3, 6, 2); ctx.fillRect(46, 5, 4, 3);
  }, [segments]);

  useEffect(() => draw(rot.current), [draw]);

  useImperativeHandle(handle, () => ({
    spin: (index, onTick) => new Promise<void>((resolve) => {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const start = rot.current;
      const jitter = (Math.random() - 0.5) * (360 / segments) * 0.6;
      const target = spinTarget(start, index, segments, 6, jitter);
      const dur = still ? 300 : 5200, t0 = performance.now();
      let lastSeg = -1;
      const frame = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        const deg = start + (target - start) * (1 - Math.pow(1 - k, 4));
        rot.current = deg;
        draw(deg);
        const seg = segmentAt(deg, segments);
        if (seg !== lastSeg) { lastSeg = seg; if (k < 0.97) onTick?.(); }
        if (k < 1) requestAnimationFrame(frame); else resolve();
      };
      requestAnimationFrame(frame);
    }),
  }), [draw, segments]);

  return <canvas ref={ref} width={W} height={H} className="h-auto w-full max-w-[312px]" role="img" aria-label="Prize wheel" />;
});
