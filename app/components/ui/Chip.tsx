"use client";

import { useSound } from "../SoundProvider";

export function Chip({
  selected,
  onClick,
  children,
  className = "",
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const { play } = useSound();
  const base =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors";
  const tone = selected
    ? "border-secondary bg-primary/30 text-white"
    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10";
  if (!onClick) return <span className={`${base} ${tone} ${className}`}>{children}</span>;
  return (
    <button
      type="button"
      aria-pressed={!!selected}
      onClick={() => {
        play("click");
        onClick();
      }}
      className={`${base} ${tone} ${className}`}
    >
      {children}
    </button>
  );
}
