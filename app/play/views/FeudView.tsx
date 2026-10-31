"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as FD from "../../topicDraft/formats/feud";
import { surveysFor } from "../../topicDraft/trivia";
import { useSound } from "../../components/SoundProvider";
import { PixelBox, PixelButton, PixelScore, PixelShell } from "../../components/pixel/PixelUI";
import { RateItem } from "../../components/pixel/RateItem";
import { Sprite } from "../../components/pixel/Sprite";
import { heart, strikeX } from "../../components/pixel/sprites";
import { useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/** Family Feud as an arcade board: answers flip open, strikes are pixel crosses, and you type into a prompt. */
export function FeudView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as FD.FeudState;
  const [text, setText] = useState("");
  // Suggestions come from every survey answer for this topic, so they never reveal which ones are on this board.
  const vocab = useMemo(() => [...new Set(surveysFor(setup.pool).flatMap((x) => [...x.answers, ...x.decoys]))].sort(), [setup.pool]);
  useAiTurn(setup, ctl, `${s.round}-${s.turn}`, 1300);
  // Buzzer on every strike, whoever earned it.
  const totalStrikes = s.rounds.reduce((n, x) => n + x.wrong.length, 0);
  const seenStrikes = useRef(totalStrikes);
  useEffect(() => {
    if (totalStrikes > seenStrikes.current) play("wrong");
    seenStrikes.current = totalStrikes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalStrikes]);
  if (s.done) return null;
  const player = FD.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const r = s.rounds[s.round]!;
  const prev = s.round > 0 ? s.rounds[s.round - 1] : null;
  const q = text.trim().toLowerCase();
  const suggestions = q.length >= 2 ? vocab.filter((v) => v.toLowerCase().includes(q) && !r.found[v]).slice(0, 6) : [];
  const submit = (answer: string) => {
    if (!mine || answer.trim().length < 2) return;
    const good = FD.matchAnswer(answer, r.board);
    ctl.dispatch({ type: "answer", by: player, choice: answer.trim() });
    if (good) play("pick");
    setText("");
  };

  return (
    <PixelShell>
      <div className="space-y-5">
        <PixelBox>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="px-eyebrow">SURVEY SAYS · ROUND {s.round + 1}/{s.rounds.length}</p>
            <div className="flex gap-2" role="img" aria-label={`${r.strikes} of ${FD.MAX_STRIKES} strikes`}>
              {Array.from({ length: FD.MAX_STRIKES }).map((_, i) => <Sprite key={i} sprite={i < r.strikes ? strikeX(true) : heart()} size={36} />)}
            </div>
          </div>
          <h1 className="mt-3">{r.q.toUpperCase()}</h1>
        </PixelBox>
        <PixelScore rows={s.players.map((p) => ({ name: p, value: `${s.points[p]} PTS`, active: p === player }))} />
        <PixelBox>
          <ol className="m-0 grid list-none gap-3 bg-[var(--px-ink)] p-3" aria-label="Survey board">
            {r.board.map((a, i) => (
              <li key={a} className={`px-ans ${r.found[a] ? "open" : ""}`}>
                <span className="rk">{i + 1}</span>
                <span className="tx">{r.found[a] ? a : "????????"}</span>
                <span className="pt">{r.found[a] ? `${FD.BOARD_POINTS[i]} · ${r.found[a]}` : FD.BOARD_POINTS[i]}</span>
              </li>
            ))}
          </ol>
          <form className="mt-5 space-y-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
            <label className="px-note" htmlFor="feud-answer">{mine ? `${player}, type your answer` : `${player} is answering…`}</label>
            <div className="px-term">
              <div className="in"><span>&gt;</span>
                <input id="feud-answer" autoComplete="off" autoFocus disabled={!mine} value={text} onChange={(e) => setText(e.target.value)} placeholder="type a name" />
              </div>
              <PixelButton type="submit" disabled={!mine || text.trim().length < 2}>ENTER</PixelButton>
            </div>
            {mine && suggestions.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Suggestions">
                {suggestions.map((v) => <li key={v}><button type="button" onClick={() => submit(v)} className="px-chip cursor-pointer border-0 hover:text-[var(--px-gold)]">{v}</button></li>)}
              </ul>
            )}
          </form>
          {prev?.sid && (
            <div className="mt-5 grid gap-3" aria-label="Rate the last survey">
              <p className="px-eyebrow">HELP US PICK THE BEST QUESTIONS</p>
              <p className="m-0 text-[22px] leading-tight">{prev.q} <span className="text-[var(--px-mint)]">Board: {prev.board.join(", ")}</span></p>
              <RateItem key={prev.sid} kind="survey" id={prev.sid} label="Last survey" />
            </div>
          )}
          {r.wrong.length > 0 && <p className="mt-3 text-[22px] text-[var(--px-rose)]">NOT ON THE BOARD: {r.wrong.join(", ")}</p>}
        </PixelBox>
      </div>
    </PixelShell>
  );
}
