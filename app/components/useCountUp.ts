"use client";

import { useEffect, useState } from "react";

/** Counts from 0 to `target` over `ms` (jumps straight there with reduced motion). */
export function useCountUp(target: number, ms = 900, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setV(target);
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / ms));
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}
