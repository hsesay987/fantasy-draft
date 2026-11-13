"use client";

import { useState } from "react";
import "../../components/pixel/pixel.css";
import { PixelButton } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { formatMeta } from "../formats";
import { addToPlan, championTitle, dropFromPlan, PLAN_MAX, planReady, standingRows, surprisePlan, type Standing } from "../tournamentPlan";
import type { Tournament } from "../../topicDraft/party/tournament";
import type { FormatId } from "../types";
import { Leaderboard } from "./Leaderboard";
import { playerSprite } from "./partyBits";

const titleOf = (f: FormatId) => formatMeta(f)?.title ?? f;

export type LiveTournament = Tournament & { standings: Standing[] };

/**
 * The host lines up a night of games: tap a game to add it (repeats allowed), tap a planned one to take it out.
 * `options` are the games this table can start right now.
 */
export function TournamentSetup({ options, plan, onPlan, onStart, busy, error }: { options: FormatId[]; plan: FormatId[]; onPlan: (plan: FormatId[]) => void; onStart: () => void; busy: boolean; error: string | null }) {
  const full = plan.length >= PLAN_MAX;
  return (
    <section className="pixel tn-wrap" aria-label="Tournament">
      <div className="px-box px-pad tn">
        <p className="px-eyebrow">Tournament</p>
        <h2>Play a night of games</h2>
        <p className="px-note">Line up 2 to 8 games. Every game pays points (5, 3, 2, then 1) onto one leaderboard.</p>
        <ol className="tn-plan" aria-label={`Plan, ${plan.length} of ${PLAN_MAX} games`}>
          {plan.length === 0 && <li className="tn-empty">Tap games below to add them</li>}
          {plan.map((f, i) => (
            <li key={`${f}-${i}`}>
              <button type="button" className="tn-slot" onClick={() => onPlan(dropFromPlan(plan, i))} aria-label={`Remove game ${i + 1}: ${titleOf(f)}`}>
                <span className="n">{i + 1}</span><span className="t">{titleOf(f)}</span><span className="x" aria-hidden>x</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="tn-pick" role="group" aria-label="Add a game">
          {options.map((f) => (
            <button key={f} type="button" className="tn-game" disabled={full} onClick={() => onPlan(addToPlan(plan, f))}>+ {titleOf(f)}</button>
          ))}
        </div>
        {error && <p role="alert" className="tn-error">{error}</p>}
        <div className="tn-actions">
          <PixelButton variant="alt" onClick={() => onPlan(surprisePlan(options))} disabled={!options.length}>Surprise me</PixelButton>
          <PixelButton variant="gold" onClick={onStart} disabled={!planReady(plan) || busy}>{busy ? "Starting…" : plan.length < 2 ? "Pick 2+ games" : "Start tournament"}</PixelButton>
        </div>
      </div>
    </section>
  );
}

/** The plan as a strip: games played, the one up next, and the rest. */
function PlanStrip({ t }: { t: Tournament }) {
  return (
    <ol className="tn-plan static" aria-label="Plan">
      {t.plan.map((f, i) => (
        <li key={`${f}-${i}`} className={i < t.index ? "done" : i === t.index && !t.done ? "now" : ""} aria-current={i === t.index && !t.done ? "step" : undefined}>
          <span className="tn-slot"><span className="n">{i + 1}</span><span className="t">{t.games[i]?.format && t.games[i]!.format !== f ? titleOf(t.games[i]!.format) : titleOf(f)}</span></span>
        </li>
      ))}
    </ol>
  );
}

/** Lobby card while a tournament runs: which game is next, the plan, the standings, and for the host a way to set up the next game or end it. */
export function TournamentCard({ t, seats, isHost, ready, onSetUp, onEnd, error }: { t: LiveTournament; seats: string[]; isHost: boolean; ready: boolean; onSetUp: () => void; onEnd: () => Promise<void>; error: string | null }) {
  const [confirm, setConfirm] = useState(false);
  const [ending, setEnding] = useState(false);
  const next = t.plan[t.index];
  return (
    <section className="pixel tn-wrap" aria-label="Tournament">
      <div className="px-box px-pad tn">
        <p className="px-eyebrow">Tournament</p>
        <h2>Game {t.index + 1} of {t.plan.length}{next ? `: ${titleOf(next)}` : ""}</h2>
        <PlanStrip t={t} />
        {isHost && next && <PixelButton variant="gold" className="tn-wide" onClick={onSetUp}>{ready ? `Change ${titleOf(next)} settings` : `Set up ${titleOf(next)}`}</PixelButton>}
        {!isHost && <p className="px-note">The host sets up each game. Points add up after every game.</p>}
      </div>
      <Leaderboard rows={standingRows(t.standings, seats)} title={t.games.length ? `After game ${t.games.length}` : "Tournament leaderboard"} />
      {isHost && (
        <div className="tn-end">
          {error && <p role="alert" className="tn-error">{error}</p>}
          {confirm ? (
            <>
              <p className="px-note">End now? The leaderboard so far is final.</p>
              <div className="tn-actions">
                <PixelButton variant="alt" onClick={() => setConfirm(false)} disabled={ending}>Keep playing</PixelButton>
                <PixelButton onClick={async () => { setEnding(true); await onEnd(); setEnding(false); setConfirm(false); }} disabled={ending}>{ending ? "Ending…" : "Yes, end it"}</PixelButton>
              </div>
            </>
          ) : (
            <PixelButton variant="alt" className="tn-wide" onClick={() => setConfirm(true)}>End tournament</PixelButton>
          )}
        </div>
      )}
    </section>
  );
}

/** Standings with this game's points, shown on a finished game's screen. */
export function TournamentBoard({ t, seats }: { t: LiveTournament; seats: string[] }) {
  const title = t.done ? "Tournament final" : `Tournament · game ${t.games.length} of ${t.plan.length}`;
  return <Leaderboard rows={standingRows(t.standings, seats)} title={title} />;
}

/** The end of the night: the winner (or a shared title), the final leaderboard, and for the host a rerun of the same plan. */
export function ChampionScreen({ t, seats, isHost, onPlayAgain, onBack, onLeave, busy, error }: { t: LiveTournament; seats: string[]; isHost: boolean; onPlayAgain: () => void; onBack: () => void; onLeave: () => void; busy: boolean; error: string | null }) {
  const top = t.standings.length ? Math.max(...t.standings.map((s) => s.total)) : 0;
  const winners = top > 0 ? t.standings.filter((s) => s.total === top) : [];
  return (
    <div className="pixel tn-champ-page">
      <div className="tn-champ">
        <p className="px-eyebrow">Tournament over · {t.games.length} game{t.games.length === 1 ? "" : "s"}</p>
        {winners.length > 0 && (
          <div className="tn-winners" aria-hidden>
            {winners.map((w) => <Sprite key={w.name} sprite={playerSprite(Math.max(0, seats.indexOf(w.name)))} size={winners.length <= 3 ? 64 : winners.length <= 6 ? 40 : 28} />)}
          </div>
        )}
        <h1 className="tn-champ-title" role="status">{championTitle(t.standings)}</h1>
        <Leaderboard rows={standingRows(t.standings, seats)} title="Final leaderboard" />
        {error && <p role="alert" className="tn-error">{error}</p>}
        <div className="tn-actions">
          {isHost && <PixelButton variant="gold" onClick={onPlayAgain} disabled={busy}>{busy ? "Starting…" : "Play again"}</PixelButton>}
          <PixelButton variant="alt" onClick={onBack}>Back to the room</PixelButton>
          <PixelButton variant="alt" onClick={onLeave}>Leave</PixelButton>
        </div>
      </div>
    </div>
  );
}
