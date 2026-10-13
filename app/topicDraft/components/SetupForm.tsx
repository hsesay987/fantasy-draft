"use client";

import { useMemo, useState } from "react";
import { Plus, X, Play } from "lucide-react";
import { Button, Card, Chip } from "../../components/ui";
import { SCENARIOS } from "../scenarios";
import { CUSTOM_POINT_BUDGET, DEFAULT_CONFIG, ROLES, customScenario, type Setup } from "../config";
import { getCatalog, universesOf } from "../catalogs";
import type { Item } from "../types";

const STAT_KEYS = ["power", "intellect", "speed", "durability", "combat", "teamwork"];

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{label}</div>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const input = "min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 outline-none focus:border-secondary";

export function SetupForm({ game, onStart }: { game: string; onStart: (s: Setup) => void }) {
  const catalog = useMemo(() => getCatalog(game), [game]);
  const universes = useMemo(() => universesOf(game), [game]);

  const [mode, setMode] = useState<"solo" | "local">("solo");
  const [name, setName] = useState("You");
  const [rivals, setRivals] = useState(1);
  const [localNames, setLocalNames] = useState(["Player 1", "Player 2"]);
  const [teamSize, setTeamSize] = useState(DEFAULT_CONFIG.teamSize);
  const [order, setOrder] = useState<"snake" | "linear">("snake");
  const [timer, setTimer] = useState<number | null>(30);
  const [useRoles, setUseRoles] = useState(false);
  const [noDup, setNoDup] = useState(false);
  const [cap, setCap] = useState<number | null>(null);
  const [filters, setFilters] = useState<string[]>([]);
  const [bans, setBans] = useState<string[]>([]);
  const [banQ, setBanQ] = useState("");
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id);
  const [cTitle, setCTitle] = useState("");
  const [cBlurb, setCBlurb] = useState("");
  const [custom, setCustom] = useState<Item[]>([]);
  const [draftHero, setDraftHero] = useState({
    name: "",
    universe: "Custom",
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 60])) as Record<string, number>,
  });

  const spent = Object.values(draftHero.stats).reduce((a, b) => a + b, 0);
  const players =
    mode === "solo"
      ? [name.trim() || "You", ...Array.from({ length: rivals }, (_, i) => (rivals === 1 ? "Rival AI" : `Rival AI ${i + 1}`))]
      : localNames.map((n) => n.trim());
  const minPool = players.length * teamSize;
  const poolSize =
    (filters.length ? catalog.filter((i) => filters.includes(i.universe)).length : catalog.length) +
    custom.length -
    bans.length;
  const problem =
    players.some((p) => !p)
      ? "Every player needs a name."
      : new Set(players).size !== players.length
        ? "Player names must be unique."
        : poolSize < minPool
          ? `Pool too small (${poolSize}) for ${minPool} picks.`
          : null;

  const banMatches = banQ.trim()
    ? catalog.filter((i) => i.name.toLowerCase().includes(banQ.toLowerCase()) && !bans.includes(i.id)).slice(0, 5)
    : [];

  function addHero() {
    if (!draftHero.name.trim() || spent > CUSTOM_POINT_BUDGET) return;
    const id = `custom-${draftHero.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${custom.length}`;
    setCustom([
      ...custom,
      {
        id,
        name: draftHero.name.trim().slice(0, 40),
        universe: draftHero.universe.trim().slice(0, 24) || "Custom",
        archetype: "Custom",
        stats: { ...draftHero.stats },
        tags: [],
        custom: true,
      },
    ]);
    setDraftHero({ ...draftHero, name: "" });
  }

  function start() {
    if (problem) return;
    const scenario =
      scenarioId === "custom" ? customScenario(cTitle, cBlurb) : SCENARIOS.find((s) => s.id === scenarioId)!;
    onStart({
      game,
      aiPlayers: mode === "solo" ? players.slice(1) : [],
      scenario,
      customItems: custom,
      config: {
        teamSize,
        players,
        order,
        timerSeconds: timer,
        bans,
        roles: useRoles ? ROLES.slice(0, teamSize) : [],
        noDupUniverse: noDup,
        powerCap: cap,
        scenario: scenario.id,
        filters: { universes: filters },
      },
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-5">
        <h2 className="text-xl">1 · Mission</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[...SCENARIOS, { id: "custom", title: "Write your own", blurb: "Invent the mission. The judge adapts." }].map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenarioId(s.id)}
              aria-pressed={scenarioId === s.id}
              className={`rounded-xl border p-3 text-left transition-colors ${
                scenarioId === s.id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"
              }`}
            >
              <div className="font-semibold">{s.title}</div>
              <div className="text-xs text-muted-foreground">{s.blurb}</div>
            </button>
          ))}
        </div>
        {scenarioId === "custom" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <input className={input} placeholder="Mission title" maxLength={80} value={cTitle} onChange={(e) => setCTitle(e.target.value)} aria-label="Mission title" />
            <input className={input} placeholder="What does winning look like?" maxLength={200} value={cBlurb} onChange={(e) => setCBlurb(e.target.value)} aria-label="Mission description" />
          </div>
        )}
      </Card>

      <Card className="space-y-5">
        <h2 className="text-xl">2 · Players</h2>
        <div className="flex gap-2">
          <Chip selected={mode === "solo"} onClick={() => setMode("solo")}>Solo vs AI</Chip>
          <Chip selected={mode === "local"} onClick={() => setMode("local")}>Pass &amp; play</Chip>
        </div>
        {mode === "solo" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name">
              <input className={input} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" />
            </Field>
            <Field label="AI rivals">
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <Chip key={n} selected={rivals === n} onClick={() => setRivals(n)}>{n}</Chip>
                ))}
              </div>
            </Field>
          </div>
        ) : (
          <div className="space-y-2">
            {localNames.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input
                  className={input}
                  maxLength={20}
                  value={n}
                  aria-label={`Player ${i + 1} name`}
                  onChange={(e) => setLocalNames(localNames.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {localNames.length > 2 && (
                  <button type="button" aria-label="Remove player" className="grid h-11 w-11 place-items-center rounded-xl hover:bg-white/10" onClick={() => setLocalNames(localNames.filter((_, j) => j !== i))}>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {localNames.length < 6 && (
              <Button variant="ghost" onClick={() => setLocalNames([...localNames, `Player ${localNames.length + 1}`])}>
                <Plus className="h-4 w-4" /> Add player
              </Button>
            )}
          </div>
        )}
      </Card>

      <Card className="space-y-5">
        <h2 className="text-xl">3 · Rules</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={`Team size: ${teamSize}`}>
            <input type="range" min={3} max={9} value={teamSize} onChange={(e) => setTeamSize(+e.target.value)} className="w-full accent-[var(--primary)]" aria-label="Team size" />
          </Field>
          <Field label="Pick order">
            <div className="flex gap-2">
              <Chip selected={order === "snake"} onClick={() => setOrder("snake")}>Snake</Chip>
              <Chip selected={order === "linear"} onClick={() => setOrder("linear")}>Linear</Chip>
            </div>
          </Field>
          <Field label="Pick timer">
            <div className="flex flex-wrap gap-2">
              {[15, 30, 60, null].map((t) => (
                <Chip key={String(t)} selected={timer === t} onClick={() => setTimer(t)}>{t ? `${t}s` : "Off"}</Chip>
              ))}
            </div>
          </Field>
          <Field label="Power cap (total per team)" hint="Caps the sum of Power stats.">
            <div className="flex flex-wrap gap-2">
              {[null, 300, 400, 500].map((c) => (
                <Chip key={String(c)} selected={cap === c} onClick={() => setCap(c)}>{c ?? "None"}</Chip>
              ))}
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip selected={useRoles} onClick={() => setUseRoles(!useRoles)}>Roles (Leader, Tank, Brain…)</Chip>
          <Chip selected={noDup} onClick={() => setNoDup(!noDup)}>No repeat universe</Chip>
        </div>
        <Field label="Universes in the pool" hint={filters.length ? "Only these universes." : "All universes."}>
          <div className="flex flex-wrap gap-2">
            {universes.map((u) => (
              <Chip key={u} selected={filters.includes(u)} onClick={() => setFilters(filters.includes(u) ? filters.filter((x) => x !== u) : [...filters, u])}>{u}</Chip>
            ))}
          </div>
        </Field>
        <Field label="Bans">
          <input className={input} placeholder="Search to ban someone" value={banQ} onChange={(e) => setBanQ(e.target.value)} aria-label="Search to ban" />
          {banMatches.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {banMatches.map((i) => (
                <Chip key={i.id} onClick={() => { setBans([...bans, i.id]); setBanQ(""); }}>+ {i.name}</Chip>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {bans.map((id) => (
              <Chip key={id} selected onClick={() => setBans(bans.filter((b) => b !== id))}>
                {catalog.find((i) => i.id === id)?.name} <X className="h-3 w-3" />
              </Chip>
            ))}
          </div>
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-xl">4 · Add your own <span className="text-sm text-muted-foreground">(optional)</span></h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={input} placeholder="Name" maxLength={40} value={draftHero.name} onChange={(e) => setDraftHero({ ...draftHero, name: e.target.value })} aria-label="Hero name" />
          <input className={input} placeholder="Universe" maxLength={24} value={draftHero.universe} onChange={(e) => setDraftHero({ ...draftHero, universe: e.target.value })} aria-label="Hero universe" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {STAT_KEYS.map((k) => (
            <label key={k} className="text-xs font-semibold capitalize text-muted-foreground">
              {k} {draftHero.stats[k]}
              <input type="range" min={10} max={100} value={draftHero.stats[k]} onChange={(e) => setDraftHero({ ...draftHero, stats: { ...draftHero.stats, [k]: +e.target.value } })} className="w-full accent-[var(--accent)]" />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className={`text-sm ${spent > CUSTOM_POINT_BUDGET ? "text-accent" : "text-muted-foreground"}`}>
            {spent} / {CUSTOM_POINT_BUDGET} points
          </span>
          <Button variant="ghost" onClick={addHero} disabled={!draftHero.name.trim() || spent > CUSTOM_POINT_BUDGET}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {custom.map((c) => (
            <Chip key={c.id} selected onClick={() => setCustom(custom.filter((x) => x.id !== c.id))}>
              {c.name} <X className="h-3 w-3" />
            </Chip>
          ))}
        </div>
      </Card>

      {problem && <p role="alert" className="text-sm text-accent">{problem}</p>}
      <Button variant="accent" className="w-full text-lg" onClick={start} disabled={!!problem}>
        <Play className="h-5 w-5" /> Start draft
      </Button>
    </div>
  );
}
