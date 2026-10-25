"use client";

import { useEffect, useState } from "react";

/** Reveals `text` a few characters at a time, or all at once when the player prefers reduced motion. */
export function useTypewriter(text: string, msPerChar = 18): string {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(t), v) : v + 1)), msPerChar);
    return () => clearInterval(t);
  }, [text, msPerChar]);
  return text.slice(0, n);
}
