"use client";

import { useEffect, useRef, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { PixelBox, PixelShell } from "../../components/pixel/PixelUI";
import { checkpointAt, WORLDS } from "../../components/pixel/worlds";
import { Play } from "../../costimation/CostimationGame";
import { track } from "../../lib/analytics";
import { DAILY_TITLES, DAILY_WORLD, fetchPuzzle, fetchStats, hasWorld, isDailyGame, peckingBand, peckingSquare, playedOn, remember, sendResult, type Played, type Puzzle } from "../../lib/daily";
import { PeckingSolo, SOLO_PLAYER } from "../../pecking/PeckingSolo";
import { DAILY_COUNT, type PeckState } from "../../topicDraft/formats/pecking";
import { CATEGORIES } from "../../play/categories";
import { climbDetail, climbGrid, climbHistory, dailySaveKey, daySeed } from "../../toprung/climb";
import { scoreFraction } from "../../toprung/engine";
import { TopRungGame } from "../../toprung/TopRungGame";
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
      // Set in one go, so someone who already played never mounts the game while their stats load.
      const done = playedOn(game, p.day);
      if (done) setPlayed(done);
      setPuzzle(p);
      if (done) {
        const stats = await fetchStats(game, p.day, done.score);
        if (live) setPlayed(stats ? { ...done, stats } : done);
      }
    }).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [game]);

  if (!isDailyGame(game)) return notFound();
  // Pecking Order has no pixel world; its pages use the ladder backdrop and its result is named by score band.
  const world = hasWorld(game) ? DAILY_WORLD[game] : null;
  if (played) return <DailyStats game={game} played={played} />;
  if (error || !puzzle) {
    return (
      <PixelShell world={world ?? "ladder"}>
        <PixelBox>
          <p className="px-eyebrow">DAILY {DAILY_TITLES[game].toUpperCase()}</p>
          <h1 className="mt-2">{error ? "Today's puzzle is not ready" : "Loading today's puzzle…"}</h1>
          {error && <p className="px-note mt-2">{error} Try again in a minute.</p>}
        </PixelBox>
      </PixelShell>
    );
  }

  const record = async (score: number, history: number[], grid: string, detail: unknown) => {
    const s = Math.max(0, Math.min(1, score));
    const base: Played = { day: puzzle.day, number: puzzle.number, score: s, history, grid, checkpoint: world ? checkpointAt(WORLDS[world], s).name : peckingBand(s) };
    remember(game, base);
    const stats = await sendResult(game, puzzle.day, s, detail);
    const withStats = stats ? { ...base, stats } : base;
    remember(game, withStats);
    return withStats;
  };
  const finish = async (score: number, history: number[], grid: string, detail: unknown) => setPlayed(await record(score, history, grid, detail));

  if (game === "pecking") {
    return <PeckingSolo daily questions={puzzle.content.questions ?? []} backHref="/trivia" backLabel="All trivia" onFinish={(s) => finishPecking(s, puzzle.day, finish)} />;
  }
  if (game === "toprung") {
    return (
      <TopRungDaily puzzle={puzzle} onFinish={record} onStats={setPlayed} />
    );
  }
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

/** Today's five questions are worth 100 points each: the score is the share of the 500, the grid one square a question. */
function finishPecking(s: PeckState, day: string, finish: (score: number, history: number[], grid: string, detail: unknown) => void) {
  if (playedOn("pecking", day)) return;
  const max = DAILY_COUNT * 100;
  const points = s.history.map((h) => h.scores[SOLO_PLAYER]?.points ?? 0);
  const total = points.reduce((a, b) => a + b, 0);
  track("pecking_finished", { daily: true, points: total });
  let run = 0;
  finish(total / max, points.map((p) => (run += p) / max), points.map(peckingSquare).join(""), { points });
}

/** Today's climb. The result goes in the moment the climb ends; the stats wait until the player has seen how it ended. */
function TopRungDaily({ puzzle, onFinish, onStats }: { puzzle: Puzzle; onFinish: (score: number, history: number[], grid: string, detail: unknown) => Promise<Played>; onStats: (p: Played) => void }) {
  const recorded = useRef<Promise<Played> | null>(null);
  const pool = puzzle.content.pool as string | undefined;
  const topic = CATEGORIES.find((c) => c.id === pool)?.title;
  return (
    <TopRungGame categories={puzzle.content.categories ?? []} saveKey={dailySaveKey(puzzle.day)} seed={daySeed(puzzle.day)}
      eyebrow={`${topic ? `${topic} · ` : ""}Daily #${puzzle.number}`} backHref="/trivia" backLabel="All trivia" continueLabel="See today's results"
      onDone={(s) => {
        if (playedOn("toprung", puzzle.day)) return;
        track("toprung_finished", { pool, status: s.status, points: s.points, rung: s.rung, daily: true });
        recorded.current = onFinish(scoreFraction(s), climbHistory(s), climbGrid(s), climbDetail(s));
      }}
      onContinue={async () => {
        const done = (await recorded.current) ?? playedOn("toprung", puzzle.day);
        if (done) onStats(done);
      }} />
  );
}
