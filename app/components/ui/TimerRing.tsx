"use client";

import { useEffect, useRef, useState } from "react";
import { useSound } from "../SoundProvider";

/** Countdown ring. Resets whenever `resetKey` changes. Calls onExpire once. */
export function TimerRing({
  seconds,
  resetKey,
  paused,
  onExpire,
  size = 64,
}: {
  seconds: number;
  resetKey: string | number;
  paused?: boolean;
  onExpire: () => void;
  size?: number;
}) {
  const [left, setLeft] = useState(seconds);
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const { play } = useSound();

  useEffect(() => {
    setLeft(seconds);
  }, [resetKey, seconds]);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          clearInterval(id);
          setTimeout(() => expire.current(), 0);
          return 0;
        }
        if (l <= 4) play("tick");
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [resetKey, paused, play]);

  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, left / seconds);
  const urgent = left <= 5;

  return (
    <div
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
      role="timer"
      aria-label={`${left} seconds left`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgb(255 255 255 / .1)" strokeWidth="5" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={urgent ? "var(--accent)" : "var(--secondary)"}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }}
        />
      </svg>
      <span className={`absolute font-display text-lg ${urgent ? "text-accent" : ""}`}>{left}</span>
    </div>
  );
}
