"use client";

import { useEffect, useRef, useState } from "react";
import * as PK from "../../topicDraft/formats/pecking";
import { own } from "../../topicDraft/party/own";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { useSound } from "../../components/SoundProvider";
import { teamsFor } from "../teamStandings";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { canMoveOn, DrinkCard, LeaveGame, PartyClock, playerSprite, WaitingForHost, WaterLine } from "./partyBits";
import { NamePicker, PeckPrompt, PeckReveal, RankPicker, spanText, TvLadder, guessText } from "./peckingParts";
import { TeamBoard } from "./TeamBoard";
import { peckWinner } from "./peckBoard";
import { normName } from "../../topicDraft/pecking/normName";

/** If the server hasn't confirmed a lock by now it was lost, so the controls come back. */
const TAP_RETRY_MS = 3000;
const TAKEN = "Taken, pick another";
const NOT_SENT = "Not sent, try again";

/**
 * Pecking Order on a phone: the question, then a ladder to place a guess on (or a name to pick), locked with one tap;
 * then the answer with everyone's points. A seat with no player (the screen host) gets the big ladder instead.
 */
export function PeckingView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as PK.PeckView;
  const me = ctl.me ?? "";
  const q = s.questions[s.round]!;
  const seated = s.players.includes(me);
  const asking = s.phase === "question";
  const phaseMs = asking ? PK.QUESTION_MS : PK.REVEAL_MS;
  const deadline = s.phaseAt + phaseMs;
  const last = !asking ? s.history[s.history.length - 1] : undefined;

  // This question's guess and typed name, kept per round so a new question starts fresh without an effect.
  const [rank, setRank] = useState<{ round: number; v: number } | null>(null);
  const value = rank?.round === s.round ? rank.v : Math.ceil(q.size / 2);
  const [typed, setTyped] = useState<{ round: number; t: string } | null>(null);
  const text = typed?.round === s.round ? typed.t : "";
  const [refused, setRefused] = useState<{ round: number; text: string; name: string } | null>(null);
  // Refused because someone claimed the name first (it shows in the taken list), or lost on the way: say which.
  const error = refused?.round === s.round && refused.text === text ? (s.taken.some((t) => normName(t) === normName(refused.name)) ? TAKEN : NOT_SENT) : null;

  // Locked but not yet confirmed: shown straight away, because party moves wait for the server.
  const [tap, setTap] = useState<number | null>(null);
  const confirmed = !!own(s.answers, me);
  useEffect(() => {
    if (tap === null || confirmed) return;
    const id = setTimeout(() => setTap(null), TAP_RETRY_MS);
    return () => clearTimeout(id);
  }, [tap, confirmed]);
  const locked = confirmed || tap === s.round;

  // The controls close when the clock runs out, a moment before the server closes the question.
  const offset = useRef(ctl.offset);
  useEffect(() => { offset.current = ctl.offset; }, [ctl.offset]);
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => setExpired(deadline), Math.max(0, deadline - (Date.now() + offset.current)));
    return () => clearTimeout(id);
  }, [asking, deadline]);
  const outOfTime = asking && expired === deadline;
  const canAnswer = asking && seated && !locked && !outOfTime && !ctl.gone?.includes(me);

  const phaseRef = useRef(s.phase);
  useEffect(() => {
    const was = phaseRef.current;
    phaseRef.current = s.phase;
    if (asking && was !== "question") play("pick");
    if (!asking && was !== "reveal") {
      play("reveal");
      const mine = last && own(last.scores, me);
      if (seated && mine) play(mine.points > 0 ? "win" : "wrong");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);
  useEffect(() => { window.scrollTo(0, 0); }, [s.round, s.phase]); // each question, and its answer, starts at the top

  const lockRank = () => {
    if (!canAnswer) return;
    play("click");
    setTap(s.round);
    ctl.dispatch({ type: "answer", by: me, rank: value });
  };
  const sending = useRef(false);
  const pickName = async (name: string) => {
    if (!canAnswer || sending.current) return;
    sending.current = true;
    play("click");
    setTap(s.round);
    try {
      const r = await ctl.dispatch({ type: "pick", by: me, name });
      // Refused (most often someone claimed it first): this seat may pick again.
      if (r && !r.ok) { setTap(null); setRefused({ round: s.round, text, name }); play("wrong"); }
    } finally { sending.current = false; }
  };

  const myAnswer = own(s.answers, me);
  const myScore = s.points[me] ?? 0;
  const gone = ctl.gone ?? [];

  return (
    <PixelShell world="ladder">
      <div className={`party-page pk-page ${seated ? "" : "tv"}`}>
        <header className="pk-head">
          <span className="stat"><em>Question</em><b>{s.round + 1}<small>/{s.total}</small></b></span>
          {seated && <span className="stat"><em>Score</em><b>{myScore.toLocaleString("en-US")}</b></span>}
          <PartyClock deadline={deadline} offset={ctl.offset} total={phaseMs} />
        </header>

        <section className="px-box pk-card">
          <PeckPrompt q={q} />
          {seated && asking && (locked ? (
            <p className="pk-locked" role="status">Locked in: <b>{myAnswer?.guess != null ? `#${myAnswer.guess}` : myAnswer?.name ?? (q.kind === "rank" ? `#${value}` : text)}</b>. Waiting for the others.</p>
          ) : outOfTime ? <p className="pk-locked" role="status">Time!</p>
            : q.kind === "rank" ? (
              <>
                <RankPicker size={q.size} value={value} onChange={(v) => setRank({ round: s.round, v })} disabled={!canAnswer} />
                <PixelButton variant="gold" className="pk-go" disabled={!canAnswer} onClick={lockRank}>Lock #{value}</PixelButton>
              </>
            ) : (
              <NamePicker choices={q.choices ?? []} taken={s.taken} text={text} onText={(t) => setTyped({ round: s.round, t })} onPick={pickName} disabled={!canAnswer} error={error} />
            ))}
          {!asking && last && <PeckReveal q={q} scores={last.scores} players={s.players} me={me} />}
          {!asking && seated && last && <MyLine sc={own(last.scores, me)} q={q} />}
        </section>

        {!seated && <TvLadder q={q} players={s.players} answers={s.answers} scores={!asking ? last?.scores : undefined} gone={gone} />}

        {!asking && (canMoveOn(ctl)
          ? <PixelButton variant="gold" className="pk-go" onClick={() => ctl.dispatch({ type: "next", by: me })}>{s.round + 1 >= s.total ? "Final scores >" : "Next question >"}</PixelButton>
          : <WaitingForHost ctl={ctl} />)}

        {s.drinks && <WaterLine />}
        {s.drinks && !asking && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        {seated && ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

function MyLine({ sc, q }: { sc?: PK.PeckScore; q: PK.PeckView["questions"][number] }) {
  if (!sc) return null;
  const total = sc.points + (sc.bonus ? PK.CLOSEST_BONUS : 0);
  const line = sc.guess == null && !sc.name ? "No answer this time." : total === 0 ? (q.kind === "name" && !sc.span ? `${guessText(sc)} is not on the list.` : "Way off.") : sc.points === 100 ? `Spot on! +${total}` : `+${total}${sc.span && q.kind === "name" ? `, ${sc.name} is ${spanText(sc.span)}` : ""}`;
  return <p className={`pk-mine ${total > 0 ? "good" : "bad"}`} role="status">{line}</p>;
}

/** Game over: the winner, the final table, team totals when teamed, and every answer. */
export function PeckingResults({ setup, ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as PK.PeckView;
  const me = ctl.me;
  const rows = s.players.map((p, seat) => ({ p, seat, score: s.points[p] ?? 0 })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  const teams = teamsFor(setup, s.players);
  // Teamed games are won by a team (as the server records them), so the headline comes from team totals then.
  const result = peckWinner(s.players, s.points, teams);
  const place = (i: number) => rows.findIndex((r) => r.score === rows[i]!.score) + 1;
  const headline = result.kind === "none" ? "Nobody scored" : result.kind === "win" ? `${result.label} wins!` : "It's a tie!";
  return (
    <PixelShell world="ladder">
      <div className="party-page pk-page">
        <section className={`px-box pk-card pk-winner ${result.kind === "win" ? "px-confetti" : ""}`}>
          <p className="pk-list">Pecking Order</p>
          <h2>{headline}</h2>
          {result.kind === "tie" && <p>{result.labels.join(" and ")}</p>}
          {result.kind === "win" && <p>{result.score.toLocaleString("en-US")} points</p>}
        </section>
        <section className="px-box pk-card" aria-label="Final scores">
          <h3 className="pk-sub">Final scores</h3>
          <ol className="pk-final">
            {rows.map((r, i) => (
              <li key={r.p} className={`${place(i) === 1 && r.score > 0 ? "top" : ""} ${r.p === me ? "me" : ""} ${ctl.gone?.includes(r.p) ? "is-gone" : ""}`}>
                <span className="rk">{place(i)}</span>
                <Sprite sprite={playerSprite(r.seat)} size={20} />
                <span className="name">{r.p}</span>
                <b>{r.score.toLocaleString("en-US")}</b>
              </li>
            ))}
          </ol>
          {teams && <TeamBoard points={s.points} teams={teams} me={me} />}
        </section>
        <section className="px-box pk-card" aria-label="The answers">
          <h3 className="pk-sub">The answers</h3>
          <ul className="pk-recap">
            {s.questions.map((q, i) => q.answer && (
              <li key={i}>
                <span className="q">{q.kind === "rank" ? q.item : `#${q.at}`} <em>{q.title}</em></span>
                <b>{q.kind === "rank" ? spanText(q.answer.span) : q.answer.names.join(" / ")}</b>
              </li>
            ))}
          </ul>
        </section>
        {onRematch && (
          <div className="party-actions">
            <PixelButton variant="gold" onClick={onRematch}>Play again</PixelButton>
            <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
          </div>
        )}
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
