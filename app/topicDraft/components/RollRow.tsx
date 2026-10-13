"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Dices } from "lucide-react";
import { HeroCard } from "./HeroCard";
import { CharacterAvatar } from "../../components/CharacterAvatar";
import { useSound } from "../../components/SoundProvider";
import type { Item } from "../types";

/** How long a roll of n cards takes to land (cards land one after another). */
export const rollMs = (n: number) => 650 + n * 320;

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function Slot({ item, index, shuffleFrom, rollKey, selected, highlight, dim, price, onClick, onDoubleClick, onLanded }: {
  item: Item; index: number; shuffleFrom: Item[]; rollKey: string; selected?: boolean; highlight?: boolean; dim?: boolean; price?: number;
  onClick?: () => void; onDoubleClick?: () => void; onLanded?: () => void;
}) {
  const { play } = useSound();
  const [landed, setLanded] = useState(() => reduced());
  const [tmp, setTmp] = useState<Item>(item);
  const cb = useRef(onLanded);
  cb.current = onLanded;

  useEffect(() => {
    if (reduced()) {
      setLanded(true);
      cb.current?.();
      return;
    }
    setLanded(false);
    const spin = setInterval(() => setTmp(shuffleFrom[Math.floor(Math.random() * shuffleFrom.length)] ?? item), 75);
    const land = setTimeout(() => {
      clearInterval(spin);
      setLanded(true);
      play("tick");
      cb.current?.();
    }, 650 + index * 320);
    return () => {
      clearInterval(spin);
      clearTimeout(land);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollKey, item.id]);

  if (!landed) {
    return (
      <div className="relative flex min-h-36 items-center gap-3 overflow-hidden rounded-xl border border-secondary/40 bg-primary/10 p-3" aria-hidden>
        <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 0.25 }}>
          <CharacterAvatar name={tmp.name} query={tmp.q} size={56} />
        </motion.div>
        <div className="min-w-0 blur-[1.5px]">
          <div className="truncate font-semibold">{tmp.name}</div>
          <div className="text-xs text-muted-foreground">rolling…</div>
        </div>
        <Dices className="absolute right-3 top-3 h-5 w-5 animate-spin text-secondary" />
      </div>
    );
  }
  return (
    <motion.div initial={{ rotateX: -80, opacity: 0, scale: 0.85 }} animate={{ rotateX: 0, opacity: 1, scale: highlight ? 1.03 : 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }} style={{ transformPerspective: 600 }} className={dim ? "opacity-45" : ""}>
      <div className={highlight ? "rounded-xl ring-2 ring-accent ring-offset-2 ring-offset-background" : ""}>
        <HeroCard item={item} price={price} selected={selected} onClick={onClick} onDoubleClick={onDoubleClick} />
      </div>
    </motion.div>
  );
}

/** A set of rolled options that spin, then land one by one. Pass `highlightId` to show an AI's choice. */
export function RollRow({ items, shuffleFrom, rollKey, selectedId, highlightId, onSelect, onQuickPick, onAllLanded, prices }: {
  items: Item[]; shuffleFrom: Item[]; rollKey: string; selectedId?: string | null; highlightId?: string | null;
  onSelect?: (id: string) => void; onQuickPick?: (id: string) => void; onAllLanded?: () => void; prices?: Record<string, number>;
}) {
  const count = useRef(0);
  const sample = useMemo(() => shuffleFrom.slice(0, 80), [shuffleFrom]);
  useEffect(() => {
    count.current = 0;
  }, [rollKey]);
  const landed = () => {
    count.current += 1;
    if (count.current === items.length) onAllLanded?.();
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((it, i) => (
        <Slot key={`${rollKey}-${it.id}`} item={it} index={i} shuffleFrom={sample} rollKey={rollKey} selected={selectedId === it.id} highlight={highlightId === it.id} dim={!!highlightId && highlightId !== it.id} price={prices?.[it.id]}
          onClick={onSelect ? () => onSelect(it.id) : undefined} onDoubleClick={onQuickPick ? () => onQuickPick(it.id) : undefined} onLanded={landed} />
      ))}
    </div>
  );
}
