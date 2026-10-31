"use client";

import { useEffect, useRef } from "react";
import { drawSprite } from "./Sprite";
import { gem, hero } from "./sprites";

const W = 64, H = 128;
const SKY = ["#0d0830", "#150e40", "#1f1556", "#2d1d6e", "#432784", "#5a2f94", "#7a3a9c", "#a04a9a"];
const STARS = Array.from({ length: 22 }, (_, i) => [(i * 37) % 64, (i * 53) % 70] as const);

/**
 * A pixel tower. Each player is a hero standing at a height: `fraction` is 0 at the ground and 1 at the flag.
 * Heroes ease toward their height, hopping as they climb. Gems mark the four rarity tiers.
 */
export function ClimbScene({ players }: { players: { name: string; fraction: number }[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const shown = useRef<number[]>([]);
  const target = useRef(players);
  target.current = players;

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0, raf = 0, last = 0;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      if (now - last < 70) return; // about 14 frames a second keeps it chunky
      last = now; frame++;
      for (let y = 0; y < H; y++) { ctx.fillStyle = SKY[Math.floor(y / 16)]!; ctx.fillRect(0, y, W, 1); }
      ctx.fillStyle = "#cfc6ff"; STARS.forEach(([x, y], i) => { if ((frame + i) % 24 > 3) ctx.fillRect(x, y, 1, 1); });
      ctx.fillStyle = "#fff6c9"; ctx.fillRect(50, 10, 6, 6); ctx.fillStyle = "#0d0830"; ctx.fillRect(52, 10, 4, 4);
      ctx.fillStyle = "#ffffff22"; const cx = (frame / 2) % 90 - 20; ctx.fillRect(cx, 40, 14, 3); ctx.fillRect(cx + 3, 38, 8, 2);
      ctx.fillStyle = "#1c5a45"; ctx.fillRect(0, 118, W, 10); ctx.fillStyle = "#2c8a62"; ctx.fillRect(0, 118, W, 2);
      for (let y = 6; y < 118; y++) for (let x = 22; x < 46; x++) {
        const off = Math.floor(y / 4) % 2 ? 4 : 0;
        ctx.fillStyle = y % 4 === 0 || (x + off) % 8 === 0 ? "#2a2250" : x < 26 ? "#6a5db8" : x > 41 ? "#3f3680" : "#554a9c";
        ctx.fillRect(x, y, 1, 1);
      }
      ctx.fillStyle = "#ff4d6d"; ctx.fillRect(28, 0, 12, 6); ctx.fillStyle = "#ffd23f"; ctx.fillRect(32, 0, 4, 2);
      [1, 2, 3, 4].forEach((t) => {
        const y = 118 - (t / 4) * 108;
        ctx.fillStyle = "#070419"; ctx.fillRect(10, y + 6, 14, 2); ctx.fillStyle = "#b9a4ff"; ctx.fillRect(10, y + 5, 14, 1);
        drawSprite(ctx, gem(t), 3, y - 2);
      });
      target.current.forEach((p, i) => {
        const to = Math.min(1, Math.max(0, p.fraction));
        const from = shown.current[i] ?? 0;
        const now2 = still ? to : from + (to - from) * 0.18;
        shown.current[i] = Math.abs(to - now2) < 0.002 ? to : now2;
        const moving = Math.abs(to - shown.current[i]!) > 0.004;
        const hop = moving && !still ? Math.abs(Math.sin(frame * 0.9)) * 3 : 0;
        // Heroes alternate between the left and right face of the tower.
        drawSprite(ctx, hero(i), i % 2 === 0 ? 11 : 47, Math.round(118 - shown.current[i]! * 108 - 10 - hop));
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={ref} width={W} height={H} className="mx-auto h-auto w-full max-w-[192px]" role="img" aria-label={`Climb progress: ${players.map((p) => `${p.name} ${Math.round(p.fraction * 100)} percent`).join(", ")}`} />;
}
