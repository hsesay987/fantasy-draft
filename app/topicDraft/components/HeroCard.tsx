"use client";

import { motion } from "motion/react";
import { Check, Ban } from "lucide-react";
import type { Item } from "../types";
import { CharacterAvatar } from "../../components/CharacterAvatar";

const SHORT: Record<string, string> = {
  power: "PWR", intellect: "INT", speed: "SPD", durability: "DUR", combat: "CMB", teamwork: "TMW",
};

export function HeroCard({
  item, selected, taken, banned, onClick, onDoubleClick, compact, price,
}: {
  item: Item;
  selected?: boolean;
  taken?: boolean;
  banned?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  compact?: boolean;
  price?: number;
}) {
  const disabled = taken || banned;
  return (
    <motion.button
      layout
      type="button"
      disabled={disabled}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      aria-pressed={!!selected}
      whileHover={disabled ? undefined : { y: -3 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={`relative w-full rounded-xl border p-3 text-left transition-colors ${
        selected ? "border-secondary bg-primary/25 shadow-[0_0_24px_-8px_var(--secondary)]" : "border-white/10 bg-card/80 hover:border-white/25"
      } ${disabled ? "opacity-35" : ""}`}
    >
      <div className="flex items-start gap-3">
        <CharacterAvatar name={item.name} query={item.q} size={compact ? 40 : 56} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold leading-tight">{item.name}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {item.universe} · {item.archetype}
            {item.custom && <span className="ml-1 text-accent">· custom</span>}
          </div>
        </div>
        {price != null && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 font-display text-sm text-black">${price}</span>}
        {taken && <Check className="h-4 w-4 shrink-0 text-success" aria-label="Drafted" />}
        {banned && <Ban className="h-4 w-4 shrink-0 text-accent" aria-label="Banned" />}
      </div>
      {!compact && (
        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-1.5">
          {Object.entries(item.stats).map(([k, v]) => (
            <div key={k} title={`${k} ${v}`}>
              <div className="flex justify-between text-[10px] font-semibold text-muted-foreground">
                <span>{SHORT[k] ?? k.slice(0, 3).toUpperCase()}</span>
                <span>{v}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${v}%`, background: v >= 85 ? "var(--accent)" : "var(--secondary)" }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.button>
  );
}
