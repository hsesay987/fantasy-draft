"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { Play, RotateCcw, X } from "lucide-react";
import { Button, Chip, PageHeader, PageShell, Panel } from "../components/ui";
import { catalogMeta, getCatalog, universesOf } from "../topicDraft/catalogs";
import { customMission, metricsFor, missionsFor } from "../topicDraft/missions";
import { CUSTOM_CHALLENGE, LOADOUT_PRESETS, type LoadoutMission } from "../topicDraft/formats/loadout";
import { rolesFor, type Role } from "../topicDraft/formats/position";
import { newSeed } from "../topicDraft/rng";
import { formatMeta } from "./formats";
import { CATEGORIES, category, formatsFor } from "./categories";
import { DEFAULT_OPTS, type FormatId, type GameSetup, type Opts } from "./types";
import { loadPrefs, resumable, saveSetup, savePrefs } from "./storage";
import { createRoom, fetchQuiz, saveToken } from "./onlineApi";
import { track } from "../lib/analytics";
import { loadSeen } from "../lib/seenTrivia";
import { BossPicker, Collapse, CustomItems, Field, LoadoutEditor, RolesEditor, Stepper, inputCls } from "./setupParts";

type Mode = "solo" | "ai" | "local" | "online";
const ROLL_COPY: Record<FormatId, string> = {
  snake: "see a few random options each pick, not the whole pool",
  spin: "",
  loadout: "roll a few random options for each slot",
  position: "roll options for each role instead of a dealt hand",
  auction: "the opener picks which of a few rolled lots goes up",
  blind: "each reveal spins in with a slot-machine roll",
  keep: "",
  price: "",
  feud: "",
  jeopardy: "",
};
const SCREEN_POOLS = new Set(["films", "shows"]);
const QUIZ_FORMATS = new Set<FormatId>(["keep", "price", "feud", "jeopardy"]);
const SOLO_FORMATS = new Set<FormatId>(["blind", "loadout", "position", "keep", "price", "feud", "jeopardy"]);

/** Topic-specific starting point for a format. */
function baseOpts(pool: string, format: FormatId): { opts: Opts; missionId: string } {
  const d = category(pool)?.defaults;
  const o: Opts = { ...DEFAULT_OPTS };
  if (d) {
    o.teamSize = d.teamSize;
    o.timerSeconds = d.timerSeconds;
    o.budget = d.budget;
    o.rankSize = d.rankSize;
  }
  if (format === "auction") o.timerSeconds = null;
  if (format === "position") { o.roll = true; o.options = 4; o.rerolls = 2; }
  if (format === "spin") {
    o.options = 3;
    o.rerolls = pool === "pokemon" ? 2 : 1;
  }
  return { opts: o, missionId: d?.missionId ?? "" };
}

const PRESETS: { id: string; label: string; blurb: string; apply: (f: FormatId, o: Opts) => { opts: Opts; mystery?: boolean } }[] = [
  { id: "quick", label: "Quick", blurb: "Tuned for this topic", apply: (_f, o) => ({ opts: o }) },
  { id: "chaos", label: "Chaos", blurb: "Fast, short, mystery mission", apply: (f, o) => ({ mystery: true, opts: { ...o, teamSize: Math.min(o.teamSize, 3), timerSeconds: 10, lotSeconds: 8, budget: f === "auction" ? 12 : o.budget, rankSize: 5, options: 4, rerolls: 2 } }) },
  { id: "hardcore", label: "Hardcore", blurb: "Roles, no repeats, long game", apply: (f, o) => ({ opts: { ...o, teamSize: Math.max(o.teamSize, 6), timerSeconds: 45, useRoles: f === "snake" || f === "spin", noDupUniverse: f === "snake" || f === "spin", budget: f === "auction" ? Math.max(o.budget, 30) : o.budget, rankSize: 10, options: 2, rerolls: 0, handExtra: 1 } }) },
];

export default function SetupScreen() {
  const router = useRouter();
  const { format: fid } = useParams<{ format: string }>();
  const search = useSearchParams();
  const meta = formatMeta(fid);
  const format = (meta?.id ?? "snake") as FormatId;
  const soloOk = SOLO_FORMATS.has(format);

  const initialPool = (() => {
    const q = search.get("pool");
    return q && category(q) ? q : "superheroes";
  })();
  const [pool, setPool] = useState(initialPool);
  const [missionId, setMissionId] = useState(() => baseOpts(initialPool, format).missionId);
  const [cTitle, setCTitle] = useState("");
  const [cBlurb, setCBlurb] = useState("");
  const [mystery, setMystery] = useState(false);
  const [priceStat, setPriceStat] = useState(""); // "" = overall rating
  const [mode, setMode] = useState<Mode>(search.get("online") === "1" ? "online" : format === "blind" ? "solo" : "ai");
  const [name, setName] = useState("You");
  const [rivals, setRivals] = useState(1);
  const [localNames, setLocalNames] = useState(["Player 1", "Player 2"]);
  const [opts, setOpts] = useState<Opts>(() => baseOpts(initialPool, format).opts);
  const [loadout, setLoadout] = useState<LoadoutMission>(LOADOUT_PRESETS[0]!);
  const [roles, setRoles] = useState<Role[]>(() => rolesFor(initialPool));
  const [preset, setPreset] = useState("quick");
  const [resume, setResume] = useState<GameSetup | null>(null);
  const [netError, setNetError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    track("game_setup_started", { format, pool: initialPool });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const p = loadPrefs();
    if (p.name) setName(p.name);
    setResume(resumable()?.setup ?? null);
  }, []);

  const catMeta = category(pool);
  const missions = useMemo(() => (format === "blind" ? metricsFor(pool) : missionsFor(pool)), [pool, format]);

  /** Switching topic re-applies that topic's defaults. */
  const changePool = (id: string) => {
    setPriceStat("");
    const b = baseOpts(id, format);
    setPool(id);
    setPreset("quick");
    setMystery(false);
    setOpts({ ...b.opts, bans: [], universes: [], customItems: [] });
    setRoles(rolesFor(id));
    setMissionId(format === "blind" ? metricsFor(id)[0]!.id : b.missionId);
  };
  useEffect(() => {
    if (format === "blind") setMissionId(metricsFor(initialPool)[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Opts>(k: K, v: Opts[K]) => setOpts((o) => ({ ...o, [k]: v }));

  const players =
    mode === "solo" || mode === "online" ? [name.trim() || "You"]
    : mode === "ai" ? [name.trim() || "You", ...Array.from({ length: rivals }, (_, i) => (rivals === 1 ? "Rival AI" : `Rival AI ${i + 1}`))]
    : localNames.map((n) => n.trim());
  const uniquePlayers = new Set(players).size === players.length && players.every(Boolean);
  const catalogSize = getCatalog(pool).length + opts.customItems.length;
  const perPlayer = format === "position" ? roles.length + opts.handExtra : opts.teamSize * (format === "auction" ? 2 : 1);
  const need = format === "blind" ? opts.rankSize : format === "keep" ? opts.teamSize * 2 : QUIZ_FORMATS.has(format) ? 12 : players.length * perPlayer;
  const needsBoss = format === "loadout" && loadout.id === "custom" && !loadout.boss.name.trim();
  const problem = needsBoss ? "Name your opponent to start." : !uniquePlayers ? "Every player needs a unique name." : meta?.usesPool && catalogSize - opts.bans.length < need ? `Pool too small (${catalogSize - opts.bans.length}) — need ${need}.` : null;

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    const r = p.apply(format, baseOpts(pool, format).opts);
    setPreset(id);
    setOpts((o) => ({ ...r.opts, bans: o.bans, universes: o.universes, customItems: o.customItems, roll: o.roll, battle: o.battle }));
    setMystery(!!r.mystery);
  };

  async function start() {
    if (problem) return;
    const surprise = format === "blind" && missionId === "surprise";
    const mission = missionId === "custom" ? customMission(pool, cTitle, cBlurb) : surprise ? missions[Math.floor(Math.random() * missions.length)]! : missions.find((m) => m.id === missionId) ?? missions[0]!;
    const lm = format === "loadout" ? loadout : null;
    const statKeys = catalogMeta(pool)?.statKeys ?? [];
    const priceM = format === "price" ? { id: "price", title: `Price Is Right: ${catMeta?.title ?? pool} · ${priceStat ? metricsFor(pool).find((m) => m.id === `metric-${priceStat}`)?.title.replace("Rank by: ", "") ?? priceStat : "overall rating"}`, blurb: "Guess the rating without going over.", weights: priceStat ? { [priceStat]: 1 } : Object.fromEntries(statKeys.map((k) => [k, 1])) } : null;
    const quizMission = priceM ?? (format === "feud" || format === "jeopardy" ? { id: "quiz", title: `${meta?.title}: ${catMeta?.title ?? pool}`, blurb: "How well do you know them?", weights: Object.fromEntries((catalogMeta(pool)?.statKeys ?? []).map((k) => [k, 1])) } : null);
    const setup: GameSetup = {
      id: `g${Date.now()}`,
      format,
      pool: lm ? "loadout" : pool,
      players,
      aiPlayers: mode === "ai" ? players.slice(1) : [],
      mission: lm ? { id: lm.id, title: lm.title, blurb: lm.blurb, weights: { power: 1 } } : quizMission ?? mission,
      mystery: mystery || surprise,
      loadout: lm,
      roles,
      opts: QUIZ_FORMATS.has(format) ? { ...opts, avoid: loadSeen() } : opts,
      seed: newSeed(),
    };
    savePrefs({ pool, name });
    track("game_started", { format, pool: setup.pool, mode, roll: opts.roll || format === "spin", mystery, preset, team_size: format === "loadout" ? loadout.slots.length : opts.teamSize, players: players.length });
    if (mode === "online") {
      setCreating(true);
      setNetError(null);
      const r = await createRoom(setup, name.trim() || "Host");
      setCreating(false);
      if (!r.ok) return setNetError(r.data.error ?? "Couldn't create the room");
      saveToken(r.data.code, r.data.token);
      track("room_created", { format, pool: setup.pool, seats_max: 6 });
      router.push(`/room/${r.data.code}`);
      return;
    }
    if (format === "jeopardy" || format === "feud") {
      setCreating(true);
      setup.quiz = (await fetchQuiz(format, pool, setup.opts.avoid, opts.teamSize)) ?? undefined;
      setCreating(false);
    }
    saveSetup(setup);
    router.push(`/play/${format}/game`);
  }

  if (!meta) return <PageShell><p className="text-center">Unknown draft type.</p></PageShell>;

  return (
    <PageShell stickyBar>
      <PageHeader
        title={meta.title}
        subtitle={meta.tagline}
        icon={meta.icon}
        gradient={meta.gradient}
        back={{ href: format === "loadout" ? "/" : `/category/${pool}`, label: format === "loadout" ? "All topics" : catMeta?.title ?? "Back" }}
      >
        <ul className="space-y-1 text-sm text-muted-foreground">{meta.how.map((h, i) => <li key={i}><span className="mr-2 text-secondary">{i + 1}.</span>{h}</li>)}</ul>
      </PageHeader>

      {resume && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 rounded-2xl border border-secondary/50 bg-primary/15 p-4">
          <div className="text-sm"><div className="font-semibold">Resume your {formatMeta(resume.format)?.title}</div><div className="text-muted-foreground">{resume.mystery ? "Mystery mission" : resume.mission.title}</div></div>
          <div className="flex gap-2">
            <Button onClick={() => router.push(`/play/${resume.format}/game`)}><RotateCcw className="h-4 w-4" aria-hidden /> Resume</Button>
            <button aria-label="Dismiss" onClick={() => setResume(null)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        </motion.div>
      )}

      <Panel title="Quick setup" hint={`Starting point tuned for ${format === "loadout" ? "this challenge" : catMeta?.title}. Tweak anything below.`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" aria-pressed={preset === p.id} onClick={() => applyPreset(p.id)} className={`min-h-16 rounded-xl border p-3 text-left transition-colors ${preset === p.id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
              <div className="font-semibold">{p.label}</div><div className="text-xs text-muted-foreground">{p.blurb}</div>
            </button>
          ))}
        </div>
        {(format === "snake" || format === "spin" || format === "auction" || format === "position") && (players.length > 1 || mode === "online") && (
          <Chip selected={opts.battle} onClick={() => set("battle", !opts.battle)}>⚔️ Vs mission — every pick duels the other team&apos;s on the mission</Chip>
        )}
        {ROLL_COPY[format] && format !== "spin" && (
          <Chip selected={opts.roll} onClick={() => set("roll", !opts.roll)}>🎲 Random roll — {ROLL_COPY[format]}</Chip>
        )}
      </Panel>

      {format === "loadout" ? (
        <Panel title="Challenge" hint="Pick a ready-made challenge or name your own — any boss, any mission.">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" aria-pressed={loadout.id === "custom"} onClick={() => setLoadout(loadout.id === "custom" ? loadout : CUSTOM_CHALLENGE)} className={`min-h-16 rounded-xl border p-3 text-left transition-colors sm:col-span-2 ${loadout.id === "custom" ? "border-secondary bg-primary/25" : "border-dashed border-white/20 bg-white/5 hover:bg-white/10"}`}>
              <div className="font-semibold">✦ Your own challenge</div><div className="text-xs text-muted-foreground">Name an opponent and the AI suggests what beats it.</div>
            </button>
            {LOADOUT_PRESETS.map((m) => (
              <button key={m.id} type="button" aria-pressed={loadout.id === m.id} onClick={() => setLoadout(m)} className={`min-h-16 rounded-xl border p-3 text-left transition-colors ${loadout.id === m.id ? "border-secondary bg-primary/25" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
                <div className="font-semibold">{m.title}</div><div className="text-xs text-muted-foreground">{m.blurb}</div>
              </button>
            ))}
          </div>
          {loadout.id === "custom" && <BossPicker mission={loadout} onChange={setLoadout} />}
        </Panel>
      ) : (
        <>
          <Panel title="Topic">
            <div className="flex flex-wrap gap-2">{CATEGORIES.filter((c) => formatsFor(c.id).includes(format) && (!c.hidden || c.id === pool)).map((c) => <Chip key={c.id} selected={pool === c.id} onClick={() => changePool(c.id)}>{c.title}</Chip>)}</div>
            <p className="text-xs text-muted-foreground">{catalogMeta(pool)?.blurb} · {getCatalog(pool).length} to choose from</p>
          </Panel>
          {format === "price" && (
            <Panel title="Guess the…" hint="One thing to guess each round. No mission needed.">
              <div className="flex flex-wrap gap-2">
                <Chip selected={priceStat === ""} onClick={() => setPriceStat("")}>Overall rating</Chip>
                {metricsFor(pool).map((m) => <Chip key={m.id} selected={priceStat === m.id.replace("metric-", "")} onClick={() => setPriceStat(m.id.replace("metric-", ""))}>{m.title.replace("Rank by: ", "")}</Chip>)}
              </div>
            </Panel>
          )}
          {format !== "feud" && format !== "jeopardy" && format !== "price" && <Panel title={format === "blind" ? "Rank by" : SCREEN_POOLS.has(pool) ? "Judged on" : "Mission"} hint={format === "blind" ? "The category you rank by." : "What the AI judge scores you on."}>
            <div className="flex flex-wrap gap-2">
              {missions.map((m) => <Chip key={m.id} selected={missionId === m.id} onClick={() => setMissionId(m.id)}>{m.title}</Chip>)}
              {format === "blind" && <Chip selected={missionId === "surprise"} onClick={() => setMissionId("surprise")}>🎲 Surprise me — hidden until the end</Chip>}
              {format !== "blind" && !SCREEN_POOLS.has(pool) && <Chip selected={missionId === "custom"} onClick={() => setMissionId("custom")}>Write your own</Chip>}
            </div>
            {missionId === "custom" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <input className={inputCls} placeholder="Mission title" maxLength={80} value={cTitle} onChange={(e) => setCTitle(e.target.value)} aria-label="Mission title" />
                <input className={inputCls} placeholder="What does winning look like?" maxLength={200} value={cBlurb} onChange={(e) => setCBlurb(e.target.value)} aria-label="Mission description" />
              </div>
            )}
          </Panel>}
        </>
      )}

      <Panel title="Players" hint={soloOk ? "Play solo, against the AI, or pass the device." : undefined}>
        <div className="flex flex-wrap gap-2">
          {soloOk && <Chip selected={mode === "solo"} onClick={() => setMode("solo")}>Just me</Chip>}
          <Chip selected={mode === "ai"} onClick={() => setMode("ai")}>Vs AI</Chip>
          <Chip selected={mode === "local"} onClick={() => setMode("local")}>Pass &amp; play</Chip>
          <Chip selected={mode === "online"} onClick={() => setMode("online")}>Online</Chip>
        </div>
        {mode === "online" && <p className="text-sm text-muted-foreground">You&apos;ll get a room code to share. Friends join from any device — 2 to 6 players.</p>}
        {mode !== "local" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name"><input className={inputCls} maxLength={20} value={name} onChange={(e) => setName(e.target.value)} aria-label="Your name" /></Field>
            {mode === "ai" && <Field label="AI rivals"><Stepper value={rivals} min={1} max={3} onChange={setRivals} label="AI rivals" /></Field>}
          </div>
        ) : (
          <div className="space-y-2">
            {localNames.map((n, i) => (
              <div key={i} className="flex gap-2">
                <input className={inputCls} maxLength={20} value={n} aria-label={`Player ${i + 1} name`} onChange={(e) => setLocalNames(localNames.map((x, j) => (j === i ? e.target.value : x)))} />
                {localNames.length > 2 && <button type="button" aria-label="Remove player" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl hover:bg-white/10" onClick={() => setLocalNames(localNames.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>}
              </div>
            ))}
            {localNames.length < 6 && <Button variant="ghost" onClick={() => setLocalNames([...localNames, `Player ${localNames.length + 1}`])}>+ Add player</Button>}
          </div>
        )}
        <Chip selected={mystery} onClick={() => setMystery(!mystery)}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/icons/mystery-block.png" alt="" width={18} height={18} className="h-[18px] w-[18px]" /> Mystery mission — hide it until the verdict</Chip>
      </Panel>

      <Collapse title="Customize rules">
        {format === "loadout" && <LoadoutEditor mission={loadout} onChange={setLoadout} />}
        {format === "position" && (
          <>
            <Field label="Roles" hint="Name each role and pick the stats it rewards."><RolesEditor pool={pool} roles={roles} onChange={setRoles} /></Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Bench size (extra cards in hand)"><Stepper value={opts.handExtra} min={0} max={4} onChange={(n) => set("handExtra", n)} label="Bench" /></Field>
              <Field label={opts.roll ? "Respins per player" : "Hand rerolls"}><Stepper value={opts.rerolls} min={0} max={4} onChange={(n) => set("rerolls", n)} label="Respins" /></Field>
              {opts.roll && <Field label="Options per roll"><Stepper value={opts.options} min={2} max={5} onChange={(n) => set("options", n)} label="Options" /></Field>}
            </div>
          </>
        )}
        {(format === "keep" || format === "price" || format === "feud") && (
          <Field label={format === "keep" ? "Roster size (keeps)" : "Rounds"}><Stepper value={opts.teamSize} min={format === "keep" ? 2 : 3} max={format === "keep" ? 9 : format === "feud" ? 5 : 8} onChange={(n) => set("teamSize", n)} label={format === "keep" ? "Keeps" : "Rounds"} /></Field>
        )}
        {format === "blind" && <Field label="Ranks"><Stepper value={opts.rankSize} min={4} max={10} onChange={(n) => set("rankSize", n)} label="Ranks" /></Field>}
        {(format === "snake" || format === "spin" || format === "auction") && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Team size"><Stepper value={opts.teamSize} min={2} max={9} onChange={(n) => set("teamSize", n)} label="Team size" /></Field>
            {format === "auction" ? (
              <>
                <Field label={`Budget: $${opts.budget}`}><input type="range" min={10} max={100} step={5} value={opts.budget} onChange={(e) => set("budget", +e.target.value)} className="w-full accent-[var(--primary)]" aria-label="Budget" /></Field>
                <Field label="Seconds per lot"><div className="flex gap-2">{[8, 15, 25].map((n) => <Chip key={n} selected={opts.lotSeconds === n} onClick={() => set("lotSeconds", n)}>{n}s</Chip>)}</div></Field>
                {opts.roll && <Field label="Lots rolled per nomination"><Stepper value={opts.options} min={2} max={4} onChange={(n) => set("options", n)} label="Lots" /></Field>}
              </>
            ) : (
              <>
                <Field label="Pick order"><div className="flex gap-2"><Chip selected={opts.order === "snake"} onClick={() => set("order", "snake")}>Snake</Chip><Chip selected={opts.order === "linear"} onClick={() => set("order", "linear")}>Linear</Chip></div></Field>
                <Field label="Pick timer"><div className="flex flex-wrap gap-2">{[10, 20, 30, 60, null].map((t) => <Chip key={String(t)} selected={opts.timerSeconds === t} onClick={() => set("timerSeconds", t)}>{t ? `${t}s` : "Off"}</Chip>)}</div></Field>
              </>
            )}
            {(format === "spin" || (format === "snake" && opts.roll)) && (
              <>
                <Field label="Options per pick"><Stepper value={opts.options} min={2} max={5} onChange={(n) => set("options", n)} label="Options" /></Field>
                <Field label="Respins each"><Stepper value={opts.rerolls} min={0} max={3} onChange={(n) => set("rerolls", n)} label="Respins" /></Field>
              </>
            )}
            {format !== "auction" && (
              <>
                <Field label="Power cap (team total)"><div className="flex flex-wrap gap-2">{[null, 300, 400, 500].map((c) => <Chip key={String(c)} selected={opts.powerCap === c} onClick={() => set("powerCap", c)}>{c ?? "None"}</Chip>)}</div></Field>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  
                  <Chip selected={opts.useRoles} onClick={() => set("useRoles", !opts.useRoles)}>Roles (Leader, Tank, Brain…)</Chip>
                  <Chip selected={opts.noDupUniverse} onClick={() => set("noDupUniverse", !opts.noDupUniverse)}>No repeat universe</Chip>
                </div>
              </>
            )}
          </div>
        )}
        {format === "loadout" && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Pick timer"><div className="flex flex-wrap gap-2">{[20, 30, 60, null].map((t) => <Chip key={String(t)} selected={opts.timerSeconds === t} onClick={() => set("timerSeconds", t)}>{t ? `${t}s` : "Off"}</Chip>)}</div></Field>
            {opts.roll && (
              <>
                <Field label="Options per roll"><Stepper value={opts.options} min={2} max={6} onChange={(n) => set("options", n)} label="Options" /></Field>
                <Field label="Respins each"><Stepper value={opts.rerolls} min={0} max={4} onChange={(n) => set("rerolls", n)} label="Respins" /></Field>
              </>
            )}
          </div>
        )}
        {meta.usesPool && (
          <>
            <Field label="Universes in the pool" hint={opts.universes.length ? "Only these." : "All universes."}>
              <div className="flex flex-wrap gap-2">{universesOf(pool).map((u) => <Chip key={u} selected={opts.universes.includes(u)} onClick={() => set("universes", opts.universes.includes(u) ? opts.universes.filter((x) => x !== u) : [...opts.universes, u])}>{u}</Chip>)}</div>
            </Field>
            <Field label="Add your own character"><CustomItems pool={pool} items={opts.customItems} onChange={(i) => set("customItems", i)} /></Field>
          </>
        )}
      </Collapse>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-white/10 bg-background/90 p-3 backdrop-blur-xl md:bottom-0">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-1 md:px-3">
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate font-semibold">{meta.title} · {format === "loadout" ? loadout.title : catMeta?.title}</div>
            <div className={`truncate ${problem || netError ? "text-accent" : "text-muted-foreground"}`}>{problem ?? netError ?? `${mode === "online" ? "Online" : players.length === 1 ? "Solo" : `${players.length} players`}${mystery ? " · mystery" : ""}${opts.roll || format === "spin" ? " · random roll" : ""}`}</div>
          </div>
          <Button variant="accent" className="px-8 text-lg" disabled={!!problem || creating} onClick={start}><Play className="h-5 w-5" aria-hidden /> {mode === "online" ? (creating ? "Creating…" : "Create room") : creating ? "Building your board…" : "Start"}</Button>
        </div>
      </div>
    </PageShell>
  );
}
