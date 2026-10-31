"use client";

import { useEffect, useRef, useState } from "react";
import * as J from "../../topicDraft/formats/jeopardy";
import { useSound } from "../../components/SoundProvider";
import { WorldScene } from "../../components/pixel/WorldScene";
import { playerColor } from "../../components/pixel/worlds";
import { PixelBox, PixelButton, PixelScore, PixelShell } from "../../components/pixel/PixelUI";
import { RateItem } from "../../components/pixel/RateItem";
import { Sprite } from "../../components/pixel/Sprite";
import { gem } from "../../components/pixel/sprites";
import { useTypewriter } from "../../components/pixel/useTypewriter";
import { useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/** How far up the mountain a score puts you. Below zero you go underground: three missed top clues is Rock Bottom. */
export const climbOf = (points: number, cap: number) => (points >= 0 ? points / cap : Math.max(-1, points / (Math.max(...J.VALUES) * 3)));

/** Jeopardy as a mountain climb: harder clues are higher camps, and every player is a climber on the same trail. */
const CLUE_TIERS = ["FOOTHILL", "TREELINE", "SNOWLINE", "SUMMIT"];

export function JeopardyView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as J.JeopardyState;
  // After every clue the answer is shown (right in green, a wrong pick in red) until the player moves on.
  const [reveal, setReveal] = useState<number | null>(null);
  const revealSeen = useRef(s.resolved);
  useEffect(() => {
    if (s.resolved > revealSeen.current && s.last != null && !s.done) setReveal(s.last);
    revealSeen.current = s.resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.resolved]);
  useEffect(() => {
    if (reveal == null || !ctl.online) return;
    const t = setTimeout(() => setReveal(null), 6000); // online games keep moving
    return () => clearTimeout(t);
  }, [reveal, ctl.online]);
  useAiTurn(setup, ctl, `${s.resolved}-${s.active}`, 1200, reveal != null);
  // One sound per answered clue, for humans and the AI alike: a win chime or a buzzer.
  const seen = useRef(s.resolved);
  useEffect(() => {
    if (s.resolved > seen.current && s.last != null) play(s.cells[s.last]!.correct ? "win" : "wrong");
    seen.current = s.resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.resolved]);
  const active = s.active != null ? s.cells[s.active] : null;
  const shown = reveal != null ? s.cells[reveal] : null;
  const text = useTypewriter(active?.q ?? "");
  if (s.done) return null;
  const player = J.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const cols = J.colsOf(s);
  // A solo climber can reach the summit only by getting every clue; with rivals the clues are shared, so less is needed.
  const cap = J.VALUES.reduce((a, b) => a + b, 0) * cols * (s.players.length === 1 ? 1 : 0.6);
  const tierOf = (value: number) => J.VALUES.indexOf(value) + 1;
  const color = (p: string) => playerColor(s.players, p);

  return (
    <PixelShell world="summit">
      <div className="space-y-5">
        <PixelBox>
          <p className="px-eyebrow">SUMMIT · CLUE {s.resolved + 1}/{s.cells.length}</p>
          <h1 className="mt-2">{active ? `${active.cat} · ${active.value}M` : mine ? `${player}: CHOOSE A CLUE` : `${player} IS PICKING…`}</h1>
          <p className="px-note mt-2">{setup.mission.title}</p>
        </PixelBox>
        <PixelScore rows={s.players.map((p) => ({ name: p, value: `${s.points[p]}M`, active: p === player, color: color(p) }))} />
        <WorldScene world="summit" caption="The climb" actors={s.players.map((p) => ({ name: p, value: climbOf(s.points[p]!, cap), color: color(p) }))}
          flash={s.last != null ? { key: s.resolved, good: !!s.cells[s.last]!.correct } : undefined} />
        <div>
          <PixelBox>
            {shown ? (
              <section className="grid gap-4" aria-label="Answer">
                <span className="px-tag"><Sprite sprite={gem(tierOf(shown.value))} size={20} /> {CLUE_TIERS[tierOf(shown.value) - 1]} · {shown.value}M</span>
                <p className="px-q">{shown.q}</p>
                <div className="px-menu">
                  {shown.options.map((o) => {
                    const right = o === shown.answer, wrong = !right && o === shown.picked;
                    return <div key={o} className={`px-opt ${right ? "right" : wrong ? "wrong" : "dim"}`}>{o}{right && <span className="badge">RIGHT ANSWER</span>}{wrong && <span className="badge">{shown.by} PICKED THIS</span>}</div>;
                  })}
                </div>
                <p className={`m-0 font-[family-name:var(--px-head)] text-xs leading-[1.9] ${shown.correct ? "text-[var(--px-mint)]" : "text-[var(--px-rose)]"}`}>{shown.correct ? `${shown.by} GETS +${shown.value}M` : `${shown.by} LOSES ${shown.value}M`}</p>
                {shown.catId && shown.clue != null && (
                  <div className="grid gap-3" aria-label="Rate this clue">
                    <p className="px-eyebrow">HELP US PICK THE BEST QUESTIONS</p>
                    <RateItem kind="clue" id={shown.catId} clue={shown.clue} label="This question" />
                    <RateItem kind="category" id={shown.catId} label={`Category: ${shown.cat}`} />
                  </div>
                )}
                <div><PixelButton onClick={() => setReveal(null)}>CONTINUE</PixelButton></div>
              </section>
            ) : active ? (
              <section className="grid gap-4" aria-label="Clue">
                <span className="px-tag"><Sprite sprite={gem(tierOf(active.value))} size={20} /> {CLUE_TIERS[tierOf(active.value) - 1]} · {active.value}M</span>
                <p className="px-q" aria-label={active.q}><span aria-hidden>{text}</span></p>
                <div className="px-menu">
                  {active.options.map((o) => (
                    <button key={o} type="button" disabled={!mine} onClick={() => ctl.dispatch({ type: "answer", by: player, choice: o })} className="px-opt">{o}</button>
                  ))}
                </div>
              </section>
            ) : (
              <div role="grid" aria-label="Board">
                <div className="px-board" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {s.cats.map((c, col) => (
                    <div key={c} className="px-cat">
                      <h3>{c}</h3>
                      {J.VALUES.map((v, row) => {
                        const i = row * cols + col;
                        const cell = s.cells[i]!;
                        return (
                          <button key={i} type="button" disabled={cell.done || !mine || reveal != null} onClick={() => { ctl.dispatch({ type: "choose", by: player, cell: i }); play("click"); }}
                            className={`px-tile ${cell.done ? (cell.correct ? "good" : "bad") : ""}`} aria-label={`${c} for ${v}`}>
                            <Sprite sprite={gem(row + 1)} size={24} />
                            <span>{cell.done ? (cell.correct ? "WIN" : "MISS") : `${v}M`}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="px-note mt-4">Higher camps are harder clues and climb further. A wrong answer slides you back the same amount.</p>
              </div>
            )}
          </PixelBox>
        </div>
      </div>
    </PixelShell>
  );
}
