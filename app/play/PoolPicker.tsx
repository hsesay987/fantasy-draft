"use client";

import { Chip } from "../components/ui";
import { MIX_ALL, togglePool } from "./poolToggle";

export { togglePool };

type Option = { id: string; title: string; blurb?: string };

/** Pick one or more topics or decks. At least one stays selected; "Mix all" picks every one. Options with a blurb show as cards. */
export function PoolPicker({ options, value, onChange }: { options: Option[]; value: string[]; onChange: (ids: string[]) => void }) {
  const ids = options.map((o) => o.id);
  const toggle = (id: string) => onChange(togglePool(value, id, ids));
  const mixed = value.length === ids.length && ids.length > 1;
  const cards = options.some((o) => o.blurb);
  return (
    <div className={cards ? "grid gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
      {cards ? (
        <>
          {options.map((o) => {
            const on = value.includes(o.id);
            return (
              <button key={o.id} type="button" onClick={() => toggle(o.id)} aria-pressed={on}
                className={`min-h-11 rounded-xl border p-3 text-left ${on ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <b className="block">{o.title}</b><span className="text-sm text-muted-foreground">{o.blurb}</span>
              </button>
            );
          })}
          {ids.length > 1 && (
            <button type="button" onClick={() => toggle(MIX_ALL)} aria-pressed={mixed}
              className={`min-h-11 rounded-xl border p-3 text-left font-semibold ${mixed ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>Mix all</button>
          )}
        </>
      ) : (
        <>
          {ids.length > 1 && <Chip selected={mixed} onClick={() => toggle(MIX_ALL)}>Mix all</Chip>}
          {options.map((o) => <Chip key={o.id} selected={value.includes(o.id)} onClick={() => toggle(o.id)}>{o.title}</Chip>)}
        </>
      )}
    </div>
  );
}
