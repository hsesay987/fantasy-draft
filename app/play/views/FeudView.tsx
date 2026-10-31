"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as FD from "../../topicDraft/formats/feud";
import { surveysFor } from "../../topicDraft/trivia";
import { useSound } from "../../components/SoundProvider";
import { PixelBox, PixelButton, PixelScore, PixelShell } from "../../components/pixel/PixelUI";
import { RateItem } from "../../components/pixel/RateItem";
import { WorldScene } from "../../components/pixel/WorldScene";
import { Sprite } from "../../components/pixel/Sprite";
import { heart, strikeX } from "../../components/pixel/sprites";
import { useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/** Family Feud over a dusk sea: the more popular your answers, the higher your balloon rises. Answers flip open, strikes are pixel crosses. */
// Each board rank is an altitude: the most common answer flies highest.
const RANK_ALTITUDE = ["SKY HIGH", "CLOUDS", "TREETOPS", "ROOFTOPS", "WAVES"];

export function FeudView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as FD.FeudState;
  const [text, setText] = useState("");
  // Suggestions come from every survey answer for this topic, so they never reveal which ones are on this board.
  const vocab = useMemo(() => [...new Set(surveysFor(setup.pool).flatMap((x) => [...x.answers, ...x.decoys]))].sort(), [setup.pool]);
  // When a round ends, every answer is shown (found ones green, missed ones red) until the player moves on.
  const [review, setReview] = useState<number | null>(null);
  const roundSeen = useRef(s.round);
  useEffect(() => {
    if (s.round > roundSeen.current && !s.done) setReview(s.round - 1);
    roundSeen.current = s.round;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.round]);
  useEffect(() => {
    if (review == null || !ctl.online) return;
    const t = setTimeout(() => setReview(null), 8000); // online games keep moving
    return () => clearTimeout(t);
  }, [review, ctl.online]);
  useAiTurn(setup, ctl, `${s.round}-${s.turn}`, 1300, review != null);
  // Buzzer on every strike, whoever earned it.
  const totalStrikes = s.rounds.reduce((n, x) => n + x.wrong.length, 0);
  const seenStrikes = useRef(totalStrikes);
  useEffect(() => {
    if (totalStrikes > seenStrikes.current) play("wrong");
    seenStrikes.current = totalStrikes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalStrikes]);
  // The sky sparkles for a hit and flashes red for a strike.
  const found = s.rounds.reduce((n, x) => n + Object.keys(x.found).length, 0);
  const events = useRef({ found, strikes: totalStrikes, key: 0, good: true });
  if (found !== events.current.found || totalStrikes !== events.current.strikes) {
    events.current = { found, strikes: totalStrikes, key: events.current.key + 1, good: found > events.current.found };
  }
  if (s.done) return null;
  const player = FD.turnPlayer(s)!;
  const mine = ctl.controls(player);
  const r = s.rounds[s.round]!;
  const done = review != null ? s.rounds[review] : null;
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
    <PixelShell world="sky">
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
        <WorldScene world="sky" caption="Altitude" actors={s.players.map((p) => ({ name: p, value: Math.min(1, s.points[p]! / (125 * s.rounds.length * 0.55)) }))}
          flash={events.current.key ? { key: events.current.key, good: events.current.good } : undefined} />
        {done ? (
          <PixelBox>
            <p className="px-eyebrow">ROUND OVER · HERE ARE THE ANSWERS</p>
            <h2 className="mt-2">{done.q.toUpperCase()}</h2>
            <ol className="m-0 mt-4 grid list-none gap-3 bg-[var(--px-ink)] p-3" aria-label="All answers">
              {done.board.map((a, i) => (
                <li key={a} className={`px-ans ${done.found[a] ? "hit" : "miss"}`}>
                  <span className="rk">{i + 1}</span><span className="tx">{a}</span>
                  <span className="pt">{done.found[a] ? `${done.found[a]} · +${FD.BOARD_POINTS[i]}` : "MISSED"}</span>
                </li>
              ))}
            </ol>
            {done.wrong.length > 0 && <p className="mt-3 text-[22px] text-[var(--px-rose)]">NOT ON THE BOARD: {done.wrong.join(", ")}</p>}
            {done.sid && (
              <div className="mt-4 grid gap-3" aria-label="Rate this survey">
                <p className="px-eyebrow">HELP US PICK THE BEST QUESTIONS</p>
                <RateItem key={done.sid} kind="survey" id={done.sid} label="This survey" />
              </div>
            )}
            <div className="mt-4"><PixelButton onClick={() => setReview(null)}>CONTINUE</PixelButton></div>
          </PixelBox>
        ) : (
        <PixelBox>
          <ol className="m-0 grid list-none gap-3 bg-[var(--px-ink)] p-3" aria-label="Survey board">
            {r.board.map((a, i) => (
              <li key={a} className={`px-ans ${r.found[a] ? "open" : ""}`}>
                <span className="rk">{i + 1}</span>
                <span className="tx">{r.found[a] ? a : "????????"}</span>
                <span className="pt">{r.found[a] ? `${RANK_ALTITUDE[i]} · ${r.found[a]}` : `${RANK_ALTITUDE[i]} · ${FD.BOARD_POINTS[i]}`}</span>
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
          {r.wrong.length > 0 && <p className="mt-3 text-[22px] text-[var(--px-rose)]">NOT ON THE BOARD: {r.wrong.join(", ")}</p>}
        </PixelBox>
        )}
      </div>
    </PixelShell>
  );
}
