"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useSound } from "../SoundProvider";

type Variant = "primary" | "accent" | "ghost";

const styles: Record<Variant, string> = {
  primary:
    "bg-primary text-white shadow-[0_0_24px_-6px_var(--primary)] hover:bg-[#8b5cf6]",
  accent:
    "bg-accent text-black shadow-[0_0_24px_-6px_var(--accent)] hover:bg-[#fb7185]",
  ghost:
    "bg-white/5 text-foreground border border-white/10 hover:bg-white/10",
};

export type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: Variant;
  silent?: boolean;
};

export function Button({
  variant = "primary",
  silent,
  className = "",
  onClick,
  children,
  ...rest
}: ButtonProps) {
  const { play } = useSound();
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      onClick={(e) => {
        if (!silent) play("click");
        onClick?.(e);
      }}
      {...rest}
    >
      {children as React.ReactNode}
    </motion.button>
  );
}
