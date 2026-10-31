"use client";

import { useEffect, useMemo, useRef } from "react";
import { PixelBox, PixelShell } from "../components/pixel/PixelUI";
import { DAILY_TITLES, DAILY_WORLD, type DailyGame, type Puzzle } from "../lib/daily";
import { isDone } from "../topicDraft/core";
import type * as FD from "../topicDraft/formats/feud";
import * as J from "../topicDraft/formats/jeopardy";
import { DEFAULT_OPTS, type GameSetup } from "../play/types";
import { useLocalGame } from "../play/useGame";
import { FeudView } from "../play/views/FeudView";
import { JeopardyView } from "../play/views/JeopardyView";

const seedOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/** Summit or Hot Air, solo, on today's fixed questions. Progress is recorded after every question for the run chart. */
export function DailyQuiz({ game, puzzle, onFinish }: { game: Exclude<DailyGame, "costimation">; puzzle: Puzzle; onFinish: (score: number, history: number[], grid: string, detail: unknown) => void }) {
  const setup = useMemo<GameSetup>(() => ({
    id: `daily-${game}-${puzzle.day}`, format: game === "summit" ? "jeopardy" : "feud", pool: puzzle.content.pool ?? "films",
    players: ["YOU"], aiPlayers: [], mystery: false, loadout: null, roles: [], seed: seedOf(`${game}${puzzle.day}`),
    mission: { id: "daily", title: `Daily ${DAILY_TITLES[game]} #${puzzle.number}`, blurb: "", weights: {} },
    opts: { ...DEFAULT_OPTS, teamSize: 5, avoid: [] },
    quiz: game === "summit" ? { categories: puzzle.content.categories } : { surveys: puzzle.content.surveys },
  }), [game, puzzle]);
  const ctl = useLocalGame(setup);
  const progressOf = (): number => {
    if (game === "summit") { const s = ctl.state as J.JeopardyState; return Math.max(0, s.points.YOU!) / (J.VALUES.reduce((a, b) => a + b, 0) * s.cats.length); }
    const s = ctl.state as FD.FeudState; return s.points.YOU! / (125 * s.rounds.length);
  };
  const stepKey = game === "summit" ? (ctl.state as J.JeopardyState).resolved : (ctl.state as FD.FeudState).rounds.reduce((n, r) => n + Object.keys(r.found).length + r.wrong.length, 0);
  const history = useRef<number[]>([]);
  const lastStep = useRef(stepKey);
  useEffect(() => {
    if (stepKey !== lastStep.current) { lastStep.current = stepKey; history.current.push(progressOf()); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey]);
  const sent = useRef(false);
  const done = isDone(setup, ctl.state);
  useEffect(() => {
    if (!done || sent.current) return;
    sent.current = true;
    ctl.finish();
    let grid: string, detail: unknown;
    if (game === "summit") {
      const s = ctl.state as J.JeopardyState, cols = s.cats.length;
      grid = J.VALUES.map((_, row) => s.cells.slice(row * cols, row * cols + cols).map((c) => (c.correct ? "🟩" : "🟥")).join("")).join("\n");
      detail = { points: s.points.YOU, right: s.cells.filter((c) => c.correct).length };
    } else {
      const s = ctl.state as FD.FeudState;
      grid = s.rounds.map((r) => r.board.map((a) => (r.found[a] ? "🟨" : "⬛")).join("")).join("\n");
      detail = { points: s.points.YOU, found: s.rounds.reduce((n, r) => n + Object.keys(r.found).length, 0) };
    }
    onFinish(progressOf(), history.current, grid, detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  if (done) return <PixelShell world={DAILY_WORLD[game]}><PixelBox><h1>Tallying your run…</h1></PixelBox></PixelShell>;
  return game === "summit" ? <JeopardyView setup={setup} ctl={ctl} /> : <FeudView setup={setup} ctl={ctl} />;
}
