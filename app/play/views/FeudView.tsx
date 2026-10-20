"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button, PageShell } from "../../components/ui";
import * as FD from "../../topicDraft/formats/feud";
import { surveysFor } from "../../topicDraft/trivia";
import { useSound } from "../../components/SoundProvider";
import { GameFrame } from "../GameFrame";
import { Scoreboard, useAiTurn } from "./useAiTurn";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

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
    <PageShell width="lg">
      <GameFrame kicker={`Family Feud · Round ${s.round + 1}/${s.rounds.length}`} headline={r.q} mission={setup.mission} mystery={false}
        right={<div className="flex gap-1" aria-label={`${r.strikes} of ${FD.MAX_STRIKES} strikes`}>{Array.from({ length: FD.MAX_STRIKES }).map((_, i) => <X key={i} className={`h-8 w-8 ${i < r.strikes ? "text-accent" : "text-white/15"}`} aria-hidden />)}</div>}>
        <Scoreboard rows={s.players.map((p) => ({ name: p, value: `${s.points[p]} pts`, active: p === player }))} />
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="Survey board">
          {r.board.map((a, i) => (
            <li key={a} className={`flex min-h-12 items-center gap-3 rounded-xl border px-4 py-2 ${r.found[a] ? "border-secondary/40 bg-primary/20" : "border-white/10 bg-white/5"}`}>
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/10 font-display">{i + 1}</span>
              <span className="font-semibold">{r.found[a] ? a : "• • • • •"}</span>
              <span className="ml-auto text-sm text-secondary">{r.found[a] ? `${FD.BOARD_POINTS[i]} · ${r.found[a]}` : FD.BOARD_POINTS[i]}</span>
            </li>
          ))}
        </ol>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); submit(text); }}>
          <label className="text-sm text-muted-foreground" htmlFor="feud-answer">{mine ? `${player}, type your answer` : `${player} is answering…`}</label>
          <div className="flex gap-2">
            <input id="feud-answer" autoComplete="off" autoFocus disabled={!mine} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a name…"
              className="min-h-12 flex-1 rounded-xl border border-white/10 bg-card/80 px-4 outline-none focus:border-secondary disabled:opacity-60" />
            <Button type="submit" variant="accent" disabled={!mine || text.trim().length < 2}>Answer</Button>
          </div>
          {mine && suggestions.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Suggestions">
              {suggestions.map((v) => <li key={v}><button type="button" onClick={() => submit(v)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm hover:border-secondary">{v}</button></li>)}
            </ul>
          )}
        </form>
        {r.wrong.length > 0 && <p className="text-sm text-accent">Not on the board: {r.wrong.join(", ")}</p>}
      </GameFrame>
    </PageShell>
  );
}
