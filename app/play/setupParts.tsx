"use client";

import { useState } from "react";
import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { Button, Chip } from "../components/ui";
import type { Item } from "../topicDraft/types";
import { CATALOG_META, catalogMeta, getCatalog } from "../topicDraft/catalogs";
import type { LoadoutMission, LoadoutSlot } from "../topicDraft/formats/loadout";
import { weightsFromStats, type Role } from "../topicDraft/formats/position";

import { controlCls, Panel } from "../components/ui";

export const inputCls = controlCls;

export const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => <Panel title={title} hint={hint}>{children}</Panel>;

export function Collapse({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-white/10 bg-card/70">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-14 w-full items-center justify-between px-5 text-left">
        <span className="text-xl font-display">{title}</span>
        <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {open && <div className="space-y-5 border-t border-white/10 p-5">{children}</div>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{label}</div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-xl disabled:opacity-40">−</button>
      <span className="w-10 text-center font-display text-2xl">{value}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-xl disabled:opacity-40">+</button>
    </div>
  );
}

/** Add your own character with a fixed point budget so it stays fair. */
export function CustomItems({ pool, items, onChange }: { pool: string; items: Item[]; onChange: (i: Item[]) => void }) {
  const keys = catalogMeta(pool)?.statKeys ?? [];
  const budget = keys.length * 60;
  const [name, setName] = useState("");
  const [universe, setUniverse] = useState("Custom");
  const [stats, setStats] = useState<Record<string, number>>({});
  const val = (k: string) => stats[k] ?? 60;
  const spent = keys.reduce((a, k) => a + val(k), 0);

  const add = () => {
    if (!name.trim() || spent > budget) return;
    onChange([...items, { id: `custom-${Date.now()}`, name: name.trim().slice(0, 40), universe: universe.trim().slice(0, 24) || "Custom", archetype: "Custom", stats: Object.fromEntries(keys.map((k) => [k, val(k)])), tags: [], custom: true }]);
    setName("");
    setStats({});
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input className={inputCls} placeholder="Name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} aria-label="Custom character name" />
        <input className={inputCls} placeholder="Universe" maxLength={24} value={universe} onChange={(e) => setUniverse(e.target.value)} aria-label="Custom character universe" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {keys.map((k) => (
          <label key={k} className="text-xs font-semibold capitalize text-muted-foreground">{k} {val(k)}
            <input type="range" min={10} max={100} value={val(k)} onChange={(e) => setStats({ ...stats, [k]: +e.target.value })} className="w-full accent-[var(--accent)]" />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-sm ${spent > budget ? "text-accent" : "text-muted-foreground"}`}>{spent} / {budget} points</span>
        <Button variant="ghost" onClick={add} disabled={!name.trim() || spent > budget}><Plus className="h-4 w-4" aria-hidden /> Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">{items.map((c) => <Chip key={c.id} selected onClick={() => onChange(items.filter((x) => x.id !== c.id))}>{c.name} <X className="h-3 w-3" aria-hidden /></Chip>)}</div>
    </div>
  );
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Name any opponent; the judge suggests which tags counter it (AI when available, keyword rules otherwise). */
export function BossPicker({ mission, onChange }: { mission: LoadoutMission; onChange: (m: LoadoutMission) => void }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const name = mission.boss.name;
  const suggest = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`${API}/judge/boss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { blurb: string; weaknesses: string[]; source: string };
      onChange({ ...mission, title: `Beat ${name.trim()}`, blurb: d.blurb, boss: { ...mission.boss, blurb: d.blurb, weaknesses: d.weaknesses } });
      setNote(d.source === "ai" ? "Suggested by the AI judge — tweak freely." : "Suggested from keyword rules — tweak freely.");
    } catch {
      setNote("Couldn't reach the server — pick weaknesses yourself below.");
    }
    setBusy(false);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input className={inputCls} placeholder="Who or what are you up against? (Godzilla, a vault, the zombie horde…)" maxLength={40} value={name} aria-label="Opponent name"
          onChange={(e) => onChange({ ...mission, title: e.target.value.trim() ? `Beat ${e.target.value.trim()}` : "Your own challenge", boss: { ...mission.boss, name: e.target.value } })} />
        <Button variant="ghost" disabled={!name.trim() || busy} onClick={suggest} className="shrink-0"><Sparkles className="h-4 w-4" aria-hidden /> {busy ? "Thinking…" : "Suggest weaknesses"}</Button>
      </div>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

const ITEM_POOLS = CATALOG_META.filter((m) => m.kind === "item");

/** Edit slots, boss weaknesses and budget for a Loadout mission. */
export function LoadoutEditor({ mission, onChange }: { mission: LoadoutMission; onChange: (m: LoadoutMission) => void }) {
  const setSlot = (i: number, patch: Partial<LoadoutSlot>) => onChange({ ...mission, slots: mission.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const allTags = [...new Set(mission.slots.flatMap((s) => getCatalog(s.pool).flatMap((i) => i.tags)))].sort();

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Boss / challenge name"><input className={inputCls} value={mission.boss.name} maxLength={40} onChange={(e) => onChange({ ...mission, boss: { ...mission.boss, name: e.target.value }, title: e.target.value ? `Beat ${e.target.value}` : mission.title })} /></Field>
        <Field label={`Budget: $${mission.budget}`}><input type="range" min={12} max={60} value={mission.budget} onChange={(e) => onChange({ ...mission, budget: +e.target.value })} className="w-full accent-[var(--primary)]" aria-label="Budget" /></Field>
      </div>
      <Field label="Slots" hint="Each slot draws from its own pool and is priced by the stat you choose ($1–$10).">
        <div className="space-y-2">
          {mission.slots.map((sl, i) => {
            const keys = catalogMeta(sl.pool)?.statKeys ?? [];
            return (
              <div key={sl.id} className="grid gap-2 rounded-xl border border-white/10 bg-white/5 p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input className={inputCls} value={sl.label} maxLength={24} aria-label="Slot name" onChange={(e) => setSlot(i, { label: e.target.value })} />
                <select className={inputCls} value={sl.pool} aria-label="Slot pool" onChange={(e) => { const k = catalogMeta(e.target.value)!.statKeys; setSlot(i, { pool: e.target.value, priceStat: k[0]!, scoreWeights: Object.fromEntries(k.map((x) => [x, 1])) }); }}>
                  {ITEM_POOLS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
                <select className={inputCls} value={sl.priceStat} aria-label="Price stat" onChange={(e) => setSlot(i, { priceStat: e.target.value, scoreWeights: { ...sl.scoreWeights, [e.target.value]: 2.5 } })}>
                  {keys.map((k) => <option key={k} value={k}>Priced by {k}</option>)}
                </select>
                <button type="button" aria-label="Remove slot" disabled={mission.slots.length <= 2} onClick={() => onChange({ ...mission, slots: mission.slots.filter((_, j) => j !== i) })} className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10 disabled:opacity-30"><X className="h-4 w-4" /></button>
              </div>
            );
          })}
          {mission.slots.length < 7 && (
            <Button variant="ghost" onClick={() => onChange({ ...mission, slots: [...mission.slots, { id: `slot-${Date.now()}`, label: "New slot", pool: "gadgets", priceStat: "utility", scoreWeights: { utility: 2, tech: 1, stealth: 1 } }] })}><Plus className="h-4 w-4" aria-hidden /> Add slot</Button>
          )}
        </div>
      </Field>
      <Field label="Boss weaknesses" hint="Pick items tagged with these to score bonus points.">
        <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {allTags.map((t) => <Chip key={t} selected={mission.boss.weaknesses.includes(t)} onClick={() => onChange({ ...mission, boss: { ...mission.boss, weaknesses: mission.boss.weaknesses.includes(t) ? mission.boss.weaknesses.filter((x) => x !== t) : [...mission.boss.weaknesses, t] } })}>{t}</Chip>)}
        </div>
      </Field>
    </div>
  );
}

/** Edit position roles: name plus the stats each role rewards. */
export function RolesEditor({ pool, roles, onChange }: { pool: string; roles: Role[]; onChange: (r: Role[]) => void }) {
  const keys = catalogMeta(pool)?.statKeys ?? [];
  const chosenOf = (r: Role) => keys.filter((k) => (r.weights[k] ?? 0) >= 2);
  return (
    <div className="space-y-3">
      {roles.map((r, i) => (
        <div key={r.id} className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex gap-2">
            <input className={inputCls} value={r.label} maxLength={24} aria-label="Role name" onChange={(e) => onChange(roles.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <button type="button" aria-label="Remove role" disabled={roles.length <= 2} onClick={() => onChange(roles.filter((_, j) => j !== i))} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-white/10 disabled:opacity-30"><X className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            {keys.map((k) => {
              const on = chosenOf(r).includes(k);
              const next = on ? chosenOf(r).filter((x) => x !== k) : [...chosenOf(r), k];
              return <Chip key={k} selected={on} onClick={() => onChange(roles.map((x, j) => (j === i ? { ...x, weights: weightsFromStats(keys, next.length ? next : [k]) } : x)))}>{k}</Chip>;
            })}
          </div>
        </div>
      ))}
      {roles.length < 8 && <Button variant="ghost" onClick={() => onChange([...roles, { id: `role-${Date.now()}`, label: "New role", weights: weightsFromStats(keys, [keys[0]!]) }])}><Plus className="h-4 w-4" aria-hidden /> Add role</Button>}
    </div>
  );
}
