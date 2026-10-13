"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ChevronLeft, Play, RotateCcw, X } from "lucide-react";
import { Button, Chip } from "../components/ui";
import { CHARACTER_POOLS, catalogMeta, getCatalog, universesOf } from "../topicDraft/catalogs";
import { customMission, metricsFor, missionsFor } from "../topicDraft/missions";
import { LOADOUT_PRESETS, type LoadoutMission } from "../topicDraft/formats/loadout";
import { rolesFor, type Role } from "../topicDraft/formats/position";
import { newSeed } from "../topicDraft/rng";
import { formatMeta } from "./formats";
import { DEFAULT_OPTS, type FormatId, type GameSetup, type Opts } from "./types";
import { loadPrefs, resumable, saveSetup, savePrefs } from "./storage";
import { Collapse, CustomItems, Field, LoadoutEditor, RolesEditor, Section, Stepper, inputCls } from "./setupParts";

const PRESETS: { id: string; label: string; blurb: string; apply: (f: FormatId, o: Opts) => { opts: Opts; mystery?: boolean } }[] = [
  { id: "quick", label: "Quick", blurb: "Sensible defaults", apply: (_f, o) => ({ opts: o }) },
  {
    id: "chaos", label: "Chaos", blurb: "Fast, short, mystery mission",
    apply: (f, o) => ({ mystery: true, opts: { ...o, teamSize: Math.min(o.teamSize, 3), timerSeconds: 10, lotSeconds: 8, budget: f === "auction" ? 12 : o.budget, rankSize: 5, options: 4, rerolls: 2 } }),
  },
  {
    id: "hardcore", label: "Hardcore", blurb: "Roles, no repeats, long game",
    apply: (f, o) => ({ opts: { ...o, teamSize: Math.max(o.teamSize, 6), timerSeconds: 45, useRoles: f === "snake" || f === "spin", noDupUniverse: f === "snake" || f === "spin", budget: f === "auction" ? 30 : o.budget, rankSize: 10, options: 2, rerolls: 0, handExtra: 1 } }),
  },
];

export default function SetupScreen() {
  const router = useRouter();
  const { format: fid } = useParams<{ format: string }>();
  const meta = formatMeta(fid);
  const format = (meta?.id ?? "snake") as FormatId;

  const [pool, setPool] = useState("superheroes");
  const [missionId, setMissionId] = useState("");
  const [cTitle, setCTitle] = useState("");
  const [cBlurb, setCBlurb] = useState("");
  const [mystery, setMystery] = useState(false);
  const [mode, setMode] = useState<"solo" | "local">("solo");
  const [name, setName] = useState("You");
  const [rivals, setRivals] = useState(1);
  const [localNames, setLocalNames] = useState(["Player 1", "Player 2"]);
  const [opts, setOpts] = useState<Opts>({ ...DEFAULT_OPTS, ...(format === "auction" ? { teamSize: 4, timerSeconds: null } : {}), ...(format === "spin" ? { timerSeconds: 20 } : {}) });
  const [loadout, setLoadout] = useState<LoadoutMission>(LOADOUT_PRESETS[0]!);
  const [roles, setRoles] = useState<Role[]>(rolesFor("superheroes"));
  const [preset, setPreset] = useState("quick");
  const [resume, setResume] = useState<GameSetup | null>(null);

  useEffect(() => {
    const p = loadPrefs();
    if (p.pool && catalogMeta(p.pool)?.kind === "character") setPool(p.pool);
    if (p.name) setName(p.name);
    setResume(resumable()?.setup ?? null);
  }, []);

  const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("pool") : null;
  useEffect(() => {
    if (q && catalogMeta(q)?.kind === "character") setPool(q);
  }, [q]);

  const missions = useMemo(() => (format === "blind" ? metricsFor(pool) : missionsFor(pool)), [pool, format]);
  useEffect(() => {
    setMissionId(missions[0]!.id);
    setRoles(rolesFor(pool));
    setOpts((o) => ({ ...o, bans: [], universes: [], customItems: [] }));
  }, [pool, missions]);

  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const players = mode === "solo" ? [name.trim() || "You", ...Array.from({ length: rivals }, (_, i) => (rivals === 1 ? "Rival AI" : `Rival AI ${i + 1}`))] : localNames.map((n) => n.trim());
  const uniquePlayers = new Set(players).size === players.length && players.every(Boolean);
  const catalogSize = getCatalog(pool).length + opts.customItems.length;
  const need = format === "blind" ? opts.rankSize : players.length * (format === "position" ? roles.length + opts.handExtra : opts.teamSize) * (format === "auction" ? 2 : 1);
  const problem = !uniquePlayers ? "Every player needs a unique name." : meta?.usesPool && catalogSize - opts.bans.length < need ? `Pool too small (${catalogSize - opts.bans.length}) — need ${need}.` : null;

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const r = p.apply(format, { ...DEFAULT_OPTS, ...(format === "auction" ? { teamSize: 4, timerSeconds: null } : {}) });
    setPreset(id);
    setOpts((o) => ({ ...r.opts, bans: o.bans, universes: o.universes, customItems: o.customItems }));
    setMystery(!!r.mystery);
  };

  function start() {
    if (problem) return;
    const mission = missionId === "custom" ? customMission(pool, cTitle, cBlurb) : missions.find((m) => m.id === missionId) ?? missions[0]!;
    const lm = format === "loadout" ? loadout : null;
    const setup: GameSetup = {
      id: `g${Date.now()}`,
      format,
      pool: lm ? "loadout" : pool,
      players,
      aiPlayers: mode === "solo" ? players.slice(1) : [],
      mission: lm ? { id: lm.id, title: lm.title, blurb: lm.blurb, weights: { power: 1 } } : mission,
      mystery,
      loadout: lm,
      roles,
      opts: { ...opts, order: format === "auction" || format === "loadout" ? opts.order : opts.order },
      seed: newSeed(),
    };
    savePrefs({ pool, name });
    saveSetup(setup);
    router.push(`/play/${format}/game`);
  }

  if (!meta) return <main className="p-8 text-center">Unknown game mode.</main>;
  const Icon = meta.icon;
  const showPool = meta.usesPool;

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 pb-40 md:py-12">
      <div>
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-white"><ChevronLeft className="h-4 w-4" aria-hidden /> All modes</Link>
        <div className="mt-3 flex items-center gap-4">
          <span className={`grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br ${meta.gradient}`}><Icon className="h-7 w-7 text-white" aria-hidden /></span>
          <div><h1 className="text-3xl md:text-4xl">{meta.title}</h1><p className="text-muted-foreground">{meta.tagline}</p></div>
        </div>
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">{meta.how.map((h, i) => <li key={i}><span className="mr-2 text-secondary">{i + 1}.</span>{h}</li>)}</ul>
      </div>

      {resume && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 rounded-2xl border border-secondary/50 bg-primary/15 p-4">
          <div className="text-sm"><div className="font-semibold">Resume your {formatMeta(resume.format)?.title}</div><div className="text-muted-foreground">{resume.mystery ? "Mystery mission" : resume.mission.title}</div></div>
          <div className="flex gap-2">
            <Button onClick={() => router.push(`/play/${resume.format}/game`)}><RotateCcw className="h-4 w-4" aria-hidden /> Resume</Button>
            <button aria-label="Dismiss" onClick={() => setResume(null)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </motion.div>
      )}

      <Section title="Quick setup" hint="Pick a vibe, tweak anything below, hit Start.">
        <div className="grid gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => applyPreset(p.id)} className={`rounded-xl border p-3 text-left transition-colors ${preset === p.id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
              <div className="font-semibold">{p.label}</div><div className="text-xs text-muted-foreground">{p.blurb}</div>
            </button>
          ))}
        </div>
      </Section>

      {format === "loadout" ? (
        <Section title="Mission" hint="Choose a challenge, then customise slots below.">
          <div className="grid gap-2 sm:grid-cols-2">
            {LOADOUT_PRESETS.map((m) => (
              <button key={m.id} type="button" aria-pressed={loadout.id === m.id} onClick={() => setLoadout(m)} className={`rounded-xl border p-3 text-left transition-colors ${loadout.id === m.id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <div className="font-semibold">{m.title}</div><div className="text-xs text-muted-foreground">{m.blurb}</div>
              </button>
            ))}
          </div>
        </Section>
      ) : (
        <>
          {showPool && (
            <Section title="What are you drafting?">
              <div className="flex flex-wrap gap-2">{CHARACTER_POOLS.map((c) => <Chip key={c.id} selected={pool === c.id} onClick={() => setPool(c.id)}>{c.title}</Chip>)}</div>
              <p className="text-xs text-muted-foreground">{catalogMeta(pool)?.blurb} · {getCatalog(pool).length} to choose from</p>
            </Section>
          )}
          <Section title={format === "blind" ? "Rank by" : "Mission"} hint={format === "blind" ? "The category you rank by." : "What the AI judge scores you on."}>
            <div className="flex flex-wrap gap-2">
              {missions.map((m) => <Chip key={m.id} selected={missionId === m.id} onClick={() => setMissionId(m.id)}>{m.title}</Chip>)}
              {format !== "blind" && <Chip selected={missionId === "custom"} onClick={() => setMissionId("custom")}>Write your own</Chip>}
            </div>
            {missionId === "custom" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputCls} placeholder="Mission title" maxLength={80} value={cTitle} onChange={(e) => setCTitle(e.target.value)} aria-label="Mission title" />
                <input className={inputCls} placeholder="What does winning look like?" maxLength={200} value={cBlurb} onChange={(e) => setCBlurb(e.target.value)} aria-label="Mission description" />
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="Players">
        <div className="flex flex-wrap gap-2"><Chip selected={mode === "solo"} onClick={() => setMode("solo")}>Solo vs AI</Chip><Chip selected={mode === "local"} onClick={() => setMode("local")}>Pass &amp; play</Chip></div>
        {mode === "solo" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name"><input className={inputCls} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" /></Field>
            <Field label="AI rivals"><Stepper value={rivals} min={1} max={3} onChange={setRivals} label="AI rivals" /></Field>
          </div>
        ) : (
          <div className="space-y-2">
            {localNames.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputCls} maxLength={20} value={n} aria-label={`Player ${i + 1} name`} onChange={(e) => setLocalNames(localNames.map((x, j) => (j === i ? e.target.value : x)))} />
                {localNames.length > 2 && <button type="button" aria-label="Remove player" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10" onClick={() => setLocalNames(localNames.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {localNames.length < 6 && <Button variant="ghost" onClick={() => setLocalNames([...localNames, `Player ${localNames.length + 1}`])}>+ Add player</Button>}
          </div>
        )}
        <Chip selected={mystery} onClick={() => setMystery(!mystery)}>Mystery mission — hide it until the verdict</Chip>
      </Section>

      <Collapse title="Customize rules">
        {format === "loadout" && <LoadoutEditor mission={loadout} onChange={setLoadout} />}
        {format === "position" && (
          <>
            <Field label="Roles" hint="Name each role and pick the stats it rewards."><RolesEditor pool={pool} roles={roles} onChange={setRoles} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Bench size (extra cards in hand)"><Stepper value={opts.handExtra} min={0} max={4} onChange={(n) => set("handExtra", n)} label="Bench" /></Field>
              <Field label="Hand rerolls"><Stepper value={opts.rerolls} min={0} max={3} onChange={(n) => set("rerolls", n)} label="Rerolls" /></Field>
            </div>
          </>
        )}
        {format === "blind" && <Field label="Ranks"><Stepper value={opts.rankSize} min={4} max={10} onChange={(n) => set("rankSize", n)} label="Ranks" /></Field>}
        {(format === "snake" || format === "spin" || format === "auction") && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Team size"><Stepper value={opts.teamSize} min={2} max={9} onChange={(n) => set("teamSize", n)} label="Team size" /></Field>
            {format === "auction" ? (
              <>
                <Field label={`Budget: $${opts.budget}`}><input type="range" min={10} max={100} step={5} value={opts.budget} onChange={(e) => set("budget", +e.target.value)} className="w-full accent-[var(--primary)]" aria-label="Budget" /></Field>
                <Field label="Seconds per lot"><div className="flex gap-2">{[8, 15, 25].map((n) => <Chip key={n} selected={opts.lotSeconds === n} onClick={() => set("lotSeconds", n)}>{n}s</Chip>)}</div></Field>
              </>
            ) : (
              <>
                <Field label="Pick order"><div className="flex gap-2"><Chip selected={opts.order === "snake"} onClick={() => set("order", "snake")}>Snake</Chip><Chip selected={opts.order === "linear"} onClick={() => set("order", "linear")}>Linear</Chip></div></Field>
                <Field label="Pick timer"><div className="flex flex-wrap gap-2">{[10, 20, 30, 60, null].map((t) => <Chip key={String(t)} selected={opts.timerSeconds === t} onClick={() => set("timerSeconds", t)}>{t ? `${t}s` : "Off"}</Chip>)}</div></Field>
              </>
            )}
            {format === "spin" && (
              <>
                <Field label="Options per pick"><Stepper value={opts.options} min={2} max={5} onChange={(n) => set("options", n)} label="Options" /></Field>
                <Field label="Rerolls each"><Stepper value={opts.rerolls} min={0} max={3} onChange={(n) => set("rerolls", n)} label="Rerolls" /></Field>
              </>
            )}
            {format !== "auction" && (
              <>
                <Field label="Power cap (team total)"><div className="flex flex-wrap gap-2">{[null, 300, 400, 500].map((c) => <Chip key={String(c)} selected={opts.powerCap === c} onClick={() => set("powerCap", c)}>{c ?? "None"}</Chip>)}</div></Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2"><Chip selected={opts.useRoles} onClick={() => set("useRoles", !opts.useRoles)}>Roles (Leader, Tank, Brain…)</Chip><Chip selected={opts.noDupUniverse} onClick={() => set("noDupUniverse", !opts.noDupUniverse)}>No repeat universe</Chip></div>
              </>
            )}
          </div>
        )}
        {format === "loadout" && (
          <Field label="Pick timer"><div className="flex flex-wrap gap-2">{[20, 30, 60, null].map((t) => <Chip key={String(t)} selected={opts.timerSeconds === t} onClick={() => set("timerSeconds", t)}>{t ? `${t}s` : "Off"}</Chip>)}</div></Field>
        )}
        {showPool && (
          <>
            <Field label="Universes in the pool" hint={opts.universes.length ? "Only these." : "All universes."}>
              <div className="flex flex-wrap gap-2">{universesOf(pool).map((u) => <Chip key={u} selected={opts.universes.includes(u)} onClick={() => set("universes", opts.universes.includes(u) ? opts.universes.filter((x) => x !== u) : [...opts.universes, u])}>{u}</Chip>)}</div>
            </Field>
            <Field label="Add your own character"><CustomItems pool={pool} items={opts.customItems} onChange={(i) => set("customItems", i)} /></Field>
          </>
        )}
      </Collapse>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-white/10 bg-background/90 p-3 backdrop-blur-xl md:bottom-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-semibold">{meta.title}{format !== "loadout" ? ` · ${catalogMeta(pool)?.title}` : ` · ${loadout.title}`}</div>
            <div className={`truncate ${problem ? "text-accent" : "text-muted-foreground"}`}>{problem ?? `${players.length} players${mystery ? " · mystery" : ""}`}</div>
          </div>
          <Button variant="accent" className="px-8 text-lg" disabled={!!problem} onClick={start}><Play className="h-5 w-5" aria-hidden /> Start</Button>
        </div>
      </div>
    </main>
  );
}
