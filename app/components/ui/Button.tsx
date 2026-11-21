"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { useSound } from "../SoundProvider";

type Variant = "primary" | "accent" | "ghost";

// One filled action per screen (accent), violet for everything else that commits, ghost for the rest. No glows.
const styles: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-[#8b6dff]",
  accent: "bg-accent text-black hover:bg-[#fb7185]",
  ghost: "bg-white/5 text-foreground border border-white/10 hover:bg-white/10",
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
      whileTap={{ scale: 0.97 }}
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
