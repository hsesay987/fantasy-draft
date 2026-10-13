"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ComponentType } from "react";

type IconLike = ComponentType<{ className?: string }>;

export function GameTile({
  title,
  blurb,
  href,
  icon: Icon,
  badge,
  soon,
  gradient = "from-primary/40 to-accent/20",
}: {
  title: string;
  blurb: string;
  href?: string;
  icon: IconLike;
  badge?: string;
  soon?: boolean;
  gradient?: string;
}) {
  const inner = (
    <motion.div
      whileHover={soon ? undefined : { y: -4, scale: 1.015 }}
      whileTap={soon ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 26 }}
      className={`relative h-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${gradient} p-5 ${
        soon ? "opacity-55" : ""
      }`}
    >
      <div className="mb-8 grid h-12 w-12 place-items-center rounded-xl bg-black/30">
        <Icon className="h-6 w-6 text-secondary" aria-hidden />
      </div>
      <h3 className="text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      {(badge || soon) && (
        <span className="absolute right-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-secondary">
          {soon ? "Soon" : badge}
        </span>
      )}
    </motion.div>
  );
  if (!href || soon) return <div aria-disabled={soon}>{inner}</div>;
  return (
    <Link href={href} className="block rounded-2xl">
      {inner}
    </Link>
  );
}
