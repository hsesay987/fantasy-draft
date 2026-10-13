"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Chip } from "../../components/ui";
import { HeroCard } from "./HeroCard";
import type { State } from "../types";

export function PoolGrid({
  state, selectedId, onSelect, onQuickPick, disabled, only,
}: {
  state: State;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Double-click / double-tap drafts straight away. */
  onQuickPick?: (id: string) => void;
  disabled?: boolean;
  /** Restrict the visible cards to these ids (Spin offers). */
  only?: string[];
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [q, setQ] = useState("");
  const [uni, setUni] = useState<string | null>(null);
  const [sort, setSort] = useState<"name" | "power">("power");

  const universes = useMemo(() => [...new Set(state.pool.map((i) => i.universe))].sort(), [state.pool]);
  const taken = useMemo(() => new Set(state.picks.map((p) => p.itemId)), [state.picks]);

  const items = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.pool
      .filter((i) => !only || only.includes(i.id))
      .filter((i) => (!uni || i.universe === uni) && (!t || i.name.toLowerCase().includes(t) || i.archetype.toLowerCase().includes(t) || i.tags.some((x) => x.includes(t))))
      .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : (b.stats.power ?? 0) - (a.stats.power ?? 0)));
  }, [state.pool, q, uni, sort, only]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search the pool</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, type or tag  ( / )"
            className="min-h-11 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 outline-none focus:border-secondary"
          />
        </label>
        <div className="flex gap-2">
          <Chip selected={sort === "power"} onClick={() => setSort("power")}>Power</Chip>
          <Chip selected={sort === "name"} onClick={() => setSort("name")}>A–Z</Chip>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Chip selected={!uni} onClick={() => setUni(null)}>All</Chip>
        {universes.map((u) => (
          <Chip key={u} selected={uni === u} onClick={() => setUni(uni === u ? null : u)}>{u}</Chip>
        ))}
      </div>
      <div className={`grid gap-3 sm:grid-cols-2 xl:grid-cols-3 ${disabled ? "pointer-events-none opacity-60" : ""}`}>
        {items.map((i) => (
          <HeroCard
            key={i.id}
            item={i}
            selected={selectedId === i.id}
            taken={taken.has(i.id)}
            banned={state.banned.includes(i.id)}
            onClick={() => onSelect(i.id)}
            onDoubleClick={onQuickPick ? () => onQuickPick(i.id) : undefined}
          />
        ))}
      </div>
      {!items.length && <p className="py-10 text-center text-muted-foreground">No one matches that search.</p>}
    </div>
  );
}
