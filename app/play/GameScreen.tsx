"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { PageShell } from "../components/ui";
import { VerdictView } from "../topicDraft/components/VerdictView";
import { loadSetup, saveSetup, clearRun } from "./storage";
import { fetchVerdict, type Verdict } from "./judging";
import { newSeed } from "../topicDraft/rng";
import { buildTeams, isDone } from "../topicDraft/core";
import { useSound } from "../components/SoundProvider";
import { track } from "../lib/analytics";
import { saveSeen } from "../lib/seenTrivia";
import type { GameSetup } from "./types";
import { useLocalGame, type GameCtl } from "./useGame";
import { SnakeView } from "./views/SnakeView";
import { AuctionView } from "./views/AuctionView";
import { LoadoutView } from "./views/LoadoutView";
import { PositionView } from "./views/PositionView";
import { BlindView } from "./views/BlindView";
import { KeepView } from "./views/KeepView";
import { FeudView } from "./views/FeudView";
import { JeopardyView } from "./views/JeopardyView";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** Shows the right view for the format, then the verdict. Used by local and online games. */
export function GameBody({ setup, ctl, serverVerdict, onNew, onRematch }: { setup: GameSetup; ctl: GameCtl; serverVerdict?: Verdict | null; onNew: () => void; onRematch?: () => void }) {
  const { token } = useAuth();
  const { play } = useSound();
  const done = isDone(setup, ctl.state);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const finished = done ? buildTeams(setup, ctl.state) : null;

  useEffect(() => {
    if (!done) return;
    ctl.finish();
    // Remember the quiz questions from this game so the next one is different.
    if (setup.format === "jeopardy") saveSeen([...new Set((ctl.state as { cats: string[] }).cats.map((c) => `cat:${c}`))]);
    if (setup.format === "feud") saveSeen((ctl.state as { rounds: { q: string }[] }).rounds.map((r) => r.q));
    track("game_finished", { format: setup.format, pool: setup.pool, players: setup.players.length, online: ctl.online, mystery: setup.mystery });
    play("reveal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useEffect(() => {
    if (!done || serverVerdict !== undefined) return;
    let live = true;
    const { teams } = buildTeams(setup, ctl.state);
    fetchVerdict(API_URL, token ?? null, setup.format, { title: setup.mission.title, blurb: setup.mission.blurb, weights: setup.mission.weights, custom: setup.mission.id === "custom" || (setup.loadout?.id === "custom") }, teams).then((v) => live && setVerdict(v));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, token]);

  const verdictWinner = (serverVerdict ?? verdict)?.winner;
  useEffect(() => {
    if (!verdictWinner) return;
    play(ctl.controls(verdictWinner) ? "win" : "lose");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdictWinner]);

  if (done && finished) {
    const v = serverVerdict ?? verdict;
    const lines = v ? [`TopPic · ${setup.mission.title}`, ...[...v.teams].sort((a, b) => b.score - a.score).map((t, i) => `${i + 1}. ${t.player} — ${Math.round(t.score)}`), "Play at toppicgames.com"].join("\n") : undefined;
    const extra = finished.extra && (
      <div className="rounded-2xl border border-white/10 bg-card/70 p-5">
        <h3 className="mb-3 text-xl">{finished.extra.title}</h3>
        <ol className="grid gap-2 sm:grid-cols-2">{finished.extra.names.map((n, i) => <li key={i} className="rounded-lg bg-white/5 px-3 py-2 text-sm"><span className="mr-2 text-secondary">#{i + 1}</span>{n}</li>)}</ol>
      </div>
    );
    return (
      <PageShell width="md">
        <h1 className="text-3xl md:text-4xl">{setup.mission.title}</h1>
        <VerdictView format={setup.format} verdict={v ?? null} loading={!v} extra={extra} shareText={lines} onAgain={onNew} onRematch={onRematch} />
      </PageShell>
    );
  }

  switch (setup.format) {
    case "auction":
      return <AuctionView setup={setup} ctl={ctl} />;
    case "loadout":
      return <LoadoutView setup={setup} ctl={ctl} />;
    case "position":
      return <PositionView setup={setup} ctl={ctl} />;
    case "blind":
      return <BlindView setup={setup} ctl={ctl} />;
    case "keep":
      return <KeepView setup={setup} ctl={ctl} />;
    case "feud":
      return <FeudView setup={setup} ctl={ctl} />;
    case "jeopardy":
      return <JeopardyView setup={setup} ctl={ctl} />;
    default:
      return <SnakeView setup={setup} ctl={ctl} />;
  }
}

function LocalGame({ setup }: { setup: GameSetup }) {
  const router = useRouter();
  const ctl = useLocalGame(setup);
  const rematch = useCallback(() => {
    clearRun(setup.id);
    saveSetup({ ...setup, id: `g${Date.now()}`, seed: newSeed() });
    window.location.assign(`/play/${setup.format}/game`);
  }, [setup]);
  return <GameBody setup={setup} ctl={ctl} onNew={() => router.push(setup.pool === "loadout" ? "/" : `/category/${setup.pool}`)} onRematch={rematch} />;
}

export default function GameScreen() {
  const router = useRouter();
  const { format } = useParams<{ format: string }>();
  const [setup, setSetup] = useState<GameSetup | null | undefined>(undefined);

  useEffect(() => {
    const s = loadSetup();
    setSetup(s && s.format === format ? s : null);
  }, [format]);
  useEffect(() => {
    if (setup === null) router.replace(`/play/${format}`);
  }, [setup, router, format]);

  if (!setup) return null;
  return <LocalGame setup={setup} />;
}
