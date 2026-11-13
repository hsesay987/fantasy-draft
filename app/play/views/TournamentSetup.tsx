"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import "../../components/pixel/pixel.css";
import { PixelButton } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { formatMeta } from "../formats";
import { Chip } from "../../components/ui";
import { PoolPicker } from "../PoolPicker";
import { singleTopic, topicOptions, topicTitle } from "../topicOptions";
import { championTitle, dropFromPlan, moveInPlan, PLAN_MAX, planReady, setSlotPools, standingRows, surpriseLineup, type PlanSlot, type Standing } from "../tournamentPlan";
import type { Tournament } from "../../topicDraft/party/tournament";
import type { FormatId } from "../types";
import { Leaderboard } from "./Leaderboard";
import { playerSprite } from "./partyBits";

const titleOf = (f: FormatId) => formatMeta(f)?.title ?? f;

export type LiveTournament = Tournament & { standings: Standing[] };

/**
 * The host's lineup for a night of games: numbered slots, each with its topic, a way to reorder it and take it out.
 * Games are added from the game tiles below it. `options` are the games this table can start right now (for Surprise me).
 */
export function LineupPanel({ options, plan, onPlan, onStart, busy, error }: { options: FormatId[]; plan: PlanSlot[]; onPlan: (plan: PlanSlot[]) => void; onStart: () => void; busy: boolean; error: string | null }) {
  // The slot whose topic picker is open.
  const [open, setOpen] = useState<number | null>(null);
  const edit = (next: PlanSlot[], keepOpen: number | null = null) => { setOpen(keepOpen); onPlan(next); };
  return (
    <section className="pixel tn-wrap" aria-label="Tournament lineup">
      <div className="px-box px-pad tn">
        <p className="px-eyebrow">Tournament · {plan.length} of {PLAN_MAX} games</p>
        <h2>Your lineup</h2>
        <p className="px-note">Tap games below to add them, 2 to 8. Every game pays points (5, 3, 2, then 1) onto one leaderboard. Each game can have its own topic.</p>
        <ol className="tn-lineup" aria-label={`Lineup, ${plan.length} of ${PLAN_MAX} games`}>
          {plan.length === 0 && <li className="tn-empty">No games yet. Tap a game below to add it.</li>}
          {plan.map((s, i) => {
            const topics = topicOptions(s.format);
            const line = topicTitle(s.format, s.pools);
            return (
              <li key={`${s.format}-${i}`} className="tn-row">
                <div className="tn-row-head">
                  <span className="n" aria-hidden>{i + 1}</span>
                  <span className="tn-row-main">
                    <span className="t">{titleOf(s.format)}</span>
                    {topics.length > 0 && <span className="tp">{line ?? "Topic: pick when it starts"}</span>}
                  </span>
                  <button type="button" className="tn-icon" disabled={i === 0} onClick={() => edit(moveInPlan(plan, i, -1))} aria-label={`Move game ${i + 1}, ${titleOf(s.format)}, up`}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                  <button type="button" className="tn-icon" disabled={i === plan.length - 1} onClick={() => edit(moveInPlan(plan, i, 1))} aria-label={`Move game ${i + 1}, ${titleOf(s.format)}, down`}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                  <button type="button" className="tn-icon x" onClick={() => edit(dropFromPlan(plan, i))} aria-label={`Remove game ${i + 1}: ${titleOf(s.format)}`}><X className="h-4 w-4" aria-hidden /></button>
                </div>
                {topics.length > 0 && (
                  <button type="button" className="tn-topic-btn" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
                    {open === i ? "Done" : s.pools ? "Change topic" : "Choose a topic"}
                  </button>
                )}
                {open === i && topics.length > 0 && (
                  <div className="tn-topics" role="group" aria-label={`Topic for game ${i + 1}`}>
                    <Chip selected={!s.pools} onClick={() => edit(setSlotPools(plan, i, null), i)}>Pick when it starts</Chip>
                    {singleTopic(s.format) ? (
                      <div className="flex flex-wrap gap-2">{topics.map((o) => <Chip key={o.id} selected={s.pools?.[0] === o.id} onClick={() => edit(setSlotPools(plan, i, [o.id]), i)}>{o.title}</Chip>)}</div>
                    ) : (
                      <PoolPicker options={topics} value={s.pools ?? []} onChange={(ids) => edit(setSlotPools(plan, i, ids.length ? ids : null), i)} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {error && <p role="alert" className="tn-error">{error}</p>}
        <div className="tn-actions">
          <PixelButton variant="alt" onClick={() => edit(surpriseLineup(options, (f) => topicOptions(f).map((o) => o.id)))} disabled={!options.length}>Surprise me</PixelButton>
          <PixelButton variant="gold" onClick={onStart} disabled={!planReady(plan) || busy}>{busy ? "Starting…" : plan.length < 2 ? "Add 2+ games" : `Start ${plan.length}-game tournament`}</PixelButton>
        </div>
      </div>
    </section>
  );
}

/** " · Villains" for a slot with topics, " · Topic: host picks" for one without, nothing for a game that has no topics. */
const slotTopic = (t: Tournament, i: number): string => {
  const f = t.plan[i]!;
  if (!topicOptions(f).length) return "";
  return ` · ${topicTitle(f, t.topics?.[i]) ?? "Topic: host picks"}`;
};

/** The plan as a strip: games played, the one up next, and the rest. */
function PlanStrip({ t }: { t: Tournament }) {
  return (
    <ol className="tn-plan static" aria-label="Plan">
      {t.plan.map((f, i) => (
        <li key={`${f}-${i}`} className={i < t.index ? "done" : i === t.index && !t.done ? "now" : ""} aria-current={i === t.index && !t.done ? "step" : undefined}>
          <span className="tn-slot"><span className="n">{i + 1}</span><span className="t">{t.games[i]?.format && t.games[i]!.format !== f ? titleOf(t.games[i]!.format) : <>{titleOf(f)}{slotTopic(t, i)}</>}</span></span>
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
