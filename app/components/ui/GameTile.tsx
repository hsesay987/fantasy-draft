"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { ComponentType } from "react";
import { IconBadge } from "./IconBadge";

type IconLike = ComponentType<{ className?: string }>;

export function GameTile({
  title,
  blurb,
  href,
  icon: Icon,
  iconSrc,
  badge,
  soon,
  gradient = "from-primary/40 to-accent/20",
  onClick,
}: {
  title: string;
  blurb: string;
  href?: string;
  icon?: IconLike;
  /** Flat image icon; shown on a light badge so dark line art stays readable. */
  iconSrc?: string;
  badge?: string;
  soon?: boolean;
  gradient?: string;
  /** Use instead of `href` when the tile runs an action. */
  onClick?: () => void;
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
      <IconBadge icon={Icon} src={iconSrc} className="mb-8" />
      <h3 className="text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{blurb}</p>
      {(badge || soon) && (
        <span className="absolute right-4 top-4 rounded-full bg-black/40 px-2.5 py-1 text-xs font-semibold text-secondary">
          {soon ? "Soon" : badge}
        </span>
      )}
    </motion.div>
  );
  if (onClick && !soon) return <button type="button" onClick={onClick} className="block h-full w-full rounded-2xl text-left">{inner}</button>;
  if (!href || soon) return <div aria-disabled={soon}>{inner}</div>;
  return (
    <Link href={href} className="block rounded-2xl">
      {inner}
    </Link>
  );
}
