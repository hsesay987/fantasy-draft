"use client";

import { useEffect, useRef } from "react";
import type { Sprite as SpriteData } from "./sprites";

/** Draws a sprite on a tiny canvas; CSS scales it up with hard edges. */
export function drawSprite(ctx: CanvasRenderingContext2D, s: SpriteData, x = 0, y = 0) {
  s.rows.forEach((row, ry) => [...row].forEach((ch, rx) => {
    const c = s.pal[ch];
    if (c) { ctx.fillStyle = c; ctx.fillRect(x + rx, y + ry, 1, 1); }
  }));
}

export function Sprite({ sprite, size = 24, className = "", label }: { sprite: SpriteData; size?: number; className?: string; label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(...sprite.rows.map((r) => r.length)), h = sprite.rows.length;
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, w, h);
    drawSprite(c, sprite);
  }, [sprite, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ width: size, height: (size * h) / w }} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
