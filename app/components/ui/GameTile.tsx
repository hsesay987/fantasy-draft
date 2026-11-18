import Link from "next/link";
import type { ComponentType } from "react";
import { IconBadge, type Tint } from "./IconBadge";

/**
 * A row-shaped card for one thing you can open: a game, a topic, a community game.
 * Icon on the left, title and one line of text, an optional badge. Flat, so a grid of them reads as a list, not a wall.
 */
export function GameTile({
  title, blurb, href, icon, topic, tint, badge, meta, soon, onClick,
}: {
  title: string;
  blurb?: string;
  href?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Topic id: shows that topic's own icon. */
  topic?: string;
  tint?: Tint | (string & {});
  badge?: string;
  /** Quiet second line under the blurb: "1 to 6 players". */
  meta?: string;
  soon?: boolean;
  /** Use instead of `href` when the tile runs an action. */
  onClick?: () => void;
  /** No longer used: tiles are flat. Kept so older callers compile. */
  gradient?: string;
}) {
  const inner = (
    <>
      <IconBadge icon={icon} topic={topic} tint={tint} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-display text-base">{title}</span>
          {(badge || soon) && <span className="shrink-0 rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold text-secondary">{soon ? "Soon" : badge}</span>}
        </span>
        {blurb && <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{blurb}</span>}
        {meta && <span className="mt-1 block text-xs text-muted-foreground/80">{meta}</span>}
      </span>
    </>
  );
  const cls = `surface flex h-full w-full items-start gap-3 p-4 text-left ${soon ? "opacity-50" : ""}`;
  if (onClick && !soon) return <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  if (!href || soon) return <div aria-disabled={soon} className={cls}>{inner}</div>;
  return <Link href={href} className={cls}>{inner}</Link>;
}
