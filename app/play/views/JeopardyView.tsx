"use client";

import { useEffect, useRef, useState } from "react";
import * as J from "../../topicDraft/formats/jeopardy";
import { useSound } from "../../components/SoundProvider";
import { ClimbScene } from "../../components/pixel/ClimbScene";
import { PixelBox, PixelButton, PixelScore, PixelShell } from "../../components/pixel/PixelUI";
import { RateItem } from "../../components/pixel/RateItem";
import { Sprite } from "../../components/pixel/Sprite";
import { gem, TIER_NAMES } from "../../components/pixel/sprites";
import { useTypewriter } from "../../components/pixel/useTypewriter";
import { useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/** Jeopardy as a tower climb: clue value is height, rarer clues are worth more, and every player is a hero on the tower. */
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
  const cap = J.VALUES.reduce((a, b) => a + b, 0) * cols * 0.6;
  const tierOf = (value: number) => J.VALUES.indexOf(value) + 1;

  return (
    <PixelShell>
      <div className="space-y-5">
        <PixelBox>
          <p className="px-eyebrow">JEOPARDY · CLUE {s.resolved + 1}/{s.cells.length}</p>
          <h1 className="mt-2">{active ? `${active.cat} · ${active.value}M` : mine ? `${player}: CHOOSE A CLUE` : `${player} IS PICKING…`}</h1>
          <p className="px-note mt-2">{setup.mission.title}</p>
        </PixelBox>
        <PixelScore rows={s.players.map((p) => ({ name: p, value: `${s.points[p]}M`, active: p === player }))} />
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_216px]">
          <PixelBox>
            {shown ? (
              <section className="grid gap-4" aria-label="Answer">
                <span className="px-tag"><Sprite sprite={gem(tierOf(shown.value))} size={20} /> {TIER_NAMES[tierOf(shown.value) - 1]} · {shown.value}M</span>
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
                <span className="px-tag"><Sprite sprite={gem(tierOf(active.value))} size={20} /> {TIER_NAMES[tierOf(active.value) - 1]} · {active.value}M</span>
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
                <p className="px-note mt-4">Rarer gems are worth more height. A wrong answer drops you the same amount.</p>
              </div>
            )}
          </PixelBox>
          <PixelBox className="text-center" aria-label="Climb progress">
            <ClimbScene players={s.players.map((p) => ({ name: p, fraction: Math.max(0, s.points[p]!) / cap }))} />
            <p className="mt-2 font-[family-name:var(--px-head)] text-[11px] text-[var(--px-gold)]">{s.players.map((p) => `${p} ${s.points[p]}M`).join(" · ")}</p>
          </PixelBox>
        </div>
      </div>
    </PixelShell>
  );
}
