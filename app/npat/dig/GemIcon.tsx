"use client";

import { useEffect, useRef } from "react";
import type { Tier } from "../../topicDraft/npat/rules";
import { drawGem } from "./sprites";

/** The 5×5 pixel gem for a tier, scaled up crisply. */
export default function GemIcon({ tier, size = 15 }: { tier: Tier; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, 5, 5);
    drawGem(c, 0, 0, tier);
  }, [tier]);
  return <canvas ref={ref} width={5} height={5} aria-hidden style={{ width: size, height: size, imageRendering: "pixelated" }} />;
}
