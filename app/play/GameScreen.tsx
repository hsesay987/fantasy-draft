"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "../hooks/useAuth";
import { getCatalog } from "../topicDraft/catalogs";
import { VerdictView } from "../topicDraft/components/VerdictView";
import { loadSetup, saveSetup, clearRun } from "./storage";
import { fetchVerdict, type JudgeTeamInput, type Verdict } from "./judging";
import { newSeed } from "../topicDraft/rng";
import type { GameSetup } from "./types";
import { SnakeView } from "./views/SnakeView";
import { AuctionView } from "./views/AuctionView";
import { LoadoutView } from "./views/LoadoutView";
import { PositionView } from "./views/PositionView";
import { BlindView } from "./views/BlindView";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function GameScreen() {
  const router = useRouter();
  const { format } = useParams<{ format: string }>();
  const { token } = useAuth();
  const [setup, setSetup] = useState<GameSetup | null | undefined>(undefined);
  const [result, setResult] = useState<{ teams: JudgeTeamInput[]; extra?: React.ReactNode } | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  useEffect(() => {
    const s = loadSetup();
    setSetup(s && s.format === format ? s : null);
  }, [format]);
  useEffect(() => {
    if (setup === null) router.replace(`/play/${format}`);
  }, [setup, router, format]);

  const onFinish = useCallback((teams: JudgeTeamInput[], extra?: React.ReactNode) => setResult({ teams, extra }), []);

  useEffect(() => {
    if (!result || !setup) return;
    let live = true;
    fetchVerdict(API_URL, token ?? null, setup.format, { title: setup.mission.title, blurb: setup.mission.blurb, weights: setup.mission.weights }, result.teams).then((v) => live && setVerdict(v));
    return () => {
      live = false;
    };
  }, [result, setup, token]);

  if (!setup) return null;
  const basePool = getCatalog(setup.pool);

  if (result) {
    const lines = verdict ? [`TopPic · ${setup.mission.title}`, ...[...verdict.teams].sort((a, b) => b.score - a.score).map((t, i) => `${i + 1}. ${t.player} — ${Math.round(t.score)}`), "Play at toppicgames.com"].join("\n") : undefined;
    return (
      <main className="mx-auto max-w-4xl space-y-4 px-4 py-8 pb-24">
        <h1 className="text-3xl">{setup.mission.title}</h1>
        <VerdictView
          verdict={verdict}
          loading={!verdict}
          extra={result.extra}
          shareText={lines}
          onAgain={() => router.push(`/play/${setup.format}`)}
          onRematch={() => {
            const next = { ...setup, id: `g${Date.now()}`, seed: newSeed() };
            clearRun(setup.id);
            saveSetup(next);
            window.location.assign(`/play/${setup.format}/game`);
          }}
        />
      </main>
    );
  }

  const props = { setup, basePool, onFinish };
  switch (setup.format) {
    case "auction":
      return <AuctionView {...props} />;
    case "loadout":
      return <LoadoutView setup={setup} onFinish={onFinish} />;
    case "position":
      return <PositionView {...props} />;
    case "blind":
      return <BlindView {...props} />;
    default:
      return <SnakeView {...props} />;
  }
}
