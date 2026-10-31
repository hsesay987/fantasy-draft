"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { PixelBox, PixelShell } from "../../components/pixel/PixelUI";
import { checkpointAt, WORLDS } from "../../components/pixel/worlds";
import { Play } from "../../costimation/CostimationGame";
import { DAILY_TITLES, DAILY_WORLD, fetchPuzzle, fetchStats, isDailyGame, playedOn, remember, sendResult, type DailyGame, type Played, type Puzzle } from "../../lib/daily";
import { DailyQuiz } from "../DailyQuiz";
import { DailyStats } from "../DailyStats";

export default function DailyPage() {
  const { game } = useParams<{ game: string }>();
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [played, setPlayed] = useState<Played | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isDailyGame(game)) return;
    let live = true;
    fetchPuzzle(game).then(async (p) => {
      if (!live) return;
      setPuzzle(p);
      const done = playedOn(game, p.day);
      if (done) {
        const stats = await fetchStats(game, p.day, done.score);
        if (live) setPlayed(stats ? { ...done, stats } : done);
      }
    }).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [game]);

  if (!isDailyGame(game)) return notFound();
  const world = DAILY_WORLD[game];
  if (played) return <DailyStats game={game} played={played} />;
  if (error || !puzzle) {
    return (
      <PixelShell world={world}>
        <PixelBox>
          <p className="px-eyebrow">DAILY {DAILY_TITLES[game].toUpperCase()}</p>
          <h1 className="mt-2">{error ? "Today's puzzle is not ready" : "Loading today's puzzle…"}</h1>
          {error && <p className="px-note mt-2">{error} Try again in a minute.</p>}
        </PixelBox>
      </PixelShell>
    );
  }

  const finish = async (score: number, history: number[], grid: string, detail: unknown) => {
    const s = Math.max(0, Math.min(1, score));
    const base: Played = { day: puzzle.day, number: puzzle.number, score: s, history, grid, checkpoint: checkpointAt(WORLDS[world], s).name };
    remember(game, base);
    const stats = await sendResult(game, puzzle.day, s, detail);
    const withStats = stats ? { ...base, stats } : base;
    remember(game, withStats);
    setPlayed(withStats);
  };

  if (game === "costimation") {
    const products = puzzle.content.products ?? [];
    return (
      <Play bank={{ products, places: [], live: true }} filters={{ country: "any", store: "any" }} currency="local" total={products.length}
        toggles={{ desc: true, cat: true, fog: false, timer: false, twice: false, bots: false }} onExit={() => {}}
        daily={{ products, onFinish: ({ score, closes, history }) => finish(score, history, closes.map((c) => (c >= 0.8 ? "🟩" : c >= 0.4 ? "🟨" : "🟥")).join(""), { closes }) }} />
    );
  }
  return <DailyQuiz game={game} puzzle={puzzle} onFinish={finish} />;
}
