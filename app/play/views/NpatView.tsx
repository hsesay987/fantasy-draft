"use client";

import { useEffect, useRef, useState } from "react";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { useSound } from "../../components/SoundProvider";
import type { NPView } from "../../topicDraft/formats/npat";
import { ANSWER_MAX } from "../../topicDraft/npat/rules";
import { has, own } from "../../topicDraft/party/own";
import { teamName } from "../teamMoves";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { canMoveOn, DrinkCard, LeaveGame, PartyActions, PartyClock, WaterLine } from "./partyBits";
import { npatClock } from "./npatBoard";
import { makeSaver, type Saver } from "./npatSaver";
import { catTitle, FillBoard, LetterTile, NPTable, RevealList, RoundRecap, RoundSummary, VoteCard } from "./npatParts";

type Dispatch = GameCtl["dispatch"];
type Play = ReturnType<typeof useSound>["play"];

const NOT_SENT = "Not saved, try again";

/**
 * NPAT on a phone: the letter and one field per category while the clock runs (saved as you type, a moment after you
 * stop), then each category revealed in turn, with a table vote on answers our lists don't know. A seat with no player
 * (the screen host, or someone watching) gets the letter and how many answers each player has filled in, never the words.
 */
export function NpatView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as NPView;
  const me = ctl.me ?? "";
  const gone = ctl.gone ?? [];
  const seated = s.players.includes(me);
  const out = gone.includes(me);
  const tv = !seated;
  const clock = npatClock(s);
  const round = s.history[s.history.length - 1];
  // Only the round being played: during writing, the last entry in history is the previous round.
  const live = s.phase !== "write" && round && s.history.length === s.round + 1 ? round : undefined;

  const seen = useRef({ phase: s.phase, cat: s.cat, round: s.round });
  useEffect(() => {
    const was = seen.current;
    seen.current = { phase: s.phase, cat: s.cat, round: s.round };
    if (s.phase === "write" && (was.phase !== "write" || was.round !== s.round)) play("pick");
    if (s.phase === "reveal" && (was.phase !== "reveal" || was.cat !== s.cat)) {
      const mine = live && own(live.answers, me)?.[s.cat];
      play(seated && mine ? ((mine.points ?? 0) > 0 ? "win" : "wrong") : "reveal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.cat, s.round]);
  useEffect(() => { window.scrollTo(0, 0); }, [s.phase, s.cat, s.round]); // each phase starts at the top

  const myScore = own(s.points, me) ?? 0;

  return (
    <PixelShell world="notebook">
      <div className={`party-page np-page ${tv ? "tv" : ""}`}>
        <header className="np-head">
          <span className="stat"><em>Round</em><b>{s.round + 1}<small>/{s.rounds}</small></b></span>
          <span className="stat"><em>Letter</em><b>{s.letter}</b></span>
          {seated && <span className="stat"><em>Score</em><b>{myScore.toLocaleString("en-US")}</b></span>}
          {clock && <PartyClock deadline={clock.deadline} offset={ctl.offset} total={clock.total} />}
        </header>

        {s.phase === "write" && (tv || out
          ? <TvWrite s={s} gone={gone} out={out} />
          : <WriteDesk key={s.round} s={s} me={me} offset={ctl.offset} dispatch={ctl.dispatch} play={play} />)}

        {s.phase === "vote" && s.vote && (
          <VoteCard s={s} big={tv}>
            {!tv && <VoteDesk key={`${s.round}.${s.cat}.${s.vote.text}`} s={s} me={me} out={out} dispatch={ctl.dispatch} play={play} />}
          </VoteCard>
        )}

        {s.phase === "reveal" && live && (
          <section className="px-box np-card" aria-label="Reveal">
            <p className="np-eyebrow">Category {s.cat + 1} of {s.categories.length} · letter {live.letter}</p>
            <h2 className="np-title" role="status">{catTitle(s.categories[s.cat] ?? "")}</h2>
            <RevealList s={s} round={live} cat={s.cat} me={me} big={tv} />
            {seated && <MyLine s={s} round={live} me={me} />}
          </section>
        )}

        {s.phase === "summary" && live && <RoundSummary s={s} round={live} me={me} />}

        {s.phase !== "write" && canMoveOn(ctl) && (
          <PixelButton variant="alt" className="np-skip" onClick={() => ctl.dispatch({ type: "next", by: me })}>
            {s.phase === "vote" ? "End the vote >" : s.phase === "reveal" ? (s.cat + 1 < s.categories.length ? "Next category >" : "Round results >") : s.round + 1 >= s.rounds ? "Final scores >" : "Next round >"}
          </PixelButton>
        )}

        <NPTable s={s} me={me} gone={gone} />

        {s.drinks && <WaterLine />}
        {/* Sips are poured on a reveal: a card never covers the writing. */}
        {s.drinks && s.phase !== "write" && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        {seated && ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/** The screen (or a seat that left) while writing: the letter, the categories and each player's count, never the words. */
function TvWrite({ s, gone, out }: { s: NPView; gone: string[]; out: boolean }) {
  return (
    <section className="px-box np-card np-tv" aria-label="Writing">
      <div className="np-tv-top">
        <LetterTile letter={s.letter} big />
        <div>
          <p className="np-eyebrow">Round {s.round + 1} of {s.rounds}</p>
          <p className="np-msg">{out ? "You left the table. Watching." : `Everyone is writing a ${s.categories.map((c) => catTitle(c).toLowerCase()).join(", ")} starting with ${s.letter}.`}</p>
          {s.stopEarly && <p className="np-msg">The first to finish stops the round.</p>}
        </div>
      </div>
      <FillBoard s={s} gone={gone} />
    </section>
  );
}

/**
 * A player's sheet: one field per category and Done. Each field is saved 300 ms after typing in it stops (and on leaving
 * it or Enter), within the server's rate. Whatever is unsaved goes the moment the clock runs out: the server still takes
 * answers for half a second past the deadline. If another player's Done closes writing early, at most the last 300 ms
 * of typing in one field is lost.
 */
function WriteDesk({ s, me, offset, dispatch, play }: { s: NPView; me: string; offset: number; dispatch: Dispatch; play: Play }) {
  const n = s.categories.length;
  const server = has(s.answers, me) ? s.answers[me]! : [];
  const [texts, setTexts] = useState<string[]>(() => s.categories.map((_, i) => server[i] ?? ""));
  const sent = useRef<string[]>(s.categories.map((_, i) => server[i] ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const textsRef = useRef(texts);
  useEffect(() => { textsRef.current = texts; });
  const done = s.submitted.includes(me);

  // Fields close when the clock runs out; the server closes writing half a second later.
  const deadline = s.phaseAt + s.roundMs;
  const [expired, setExpired] = useState(false);

  /** Sends field `i` if it changed. While a send is out, the same text waits on that send rather than going twice. */
  const inflight = useRef<(Promise<boolean> | null)[]>([]);
  const send = (i: number): Promise<boolean> | null => {
    const t = textsRef.current[i] ?? "";
    if (t === sent.current[i]) return inflight.current[i] ?? null;
    const before = sent.current[i];
    sent.current[i] = t;
    const p: Promise<boolean> = Promise.resolve(dispatch({ type: "answer", by: me, cat: i, text: t })).then((r) => {
      if (inflight.current[i] === p) inflight.current[i] = null;
      if (r && !r.ok) {
        if (sent.current[i] === t) sent.current[i] = before ?? "";
        setError(r.error && r.error !== "Not allowed right now" ? r.error : NOT_SENT);
        return false;
      }
      setError(null);
      return true;
    });
    inflight.current[i] = p;
    return p;
  };
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const saver = useRef<Saver | null>(null);
  useEffect(() => {
    const sv = makeSaver(n, (i) => sendRef.current(i));
    saver.current = sv;
    return () => { sv.stop(); saver.current = null; };
  }, [n]);
  const flush = () => saver.current?.flush() ?? Promise.resolve(true);

  // Re-armed when the clock offset is corrected, so the fields close at the server's deadline, not a stale guess of it.
  useEffect(() => {
    const left = deadline - (Date.now() + offset);
    const close = setTimeout(() => { setExpired(true); void saver.current?.flush(); }, Math.max(0, left));
    return () => clearTimeout(close);
  }, [deadline, offset]);

  const finish = async () => {
    if (done || finishing || expired) return;
    setFinishing(true);
    play("click");
    try {
      if (!(await flush())) return;
      const r = await dispatch({ type: "finish", by: me });
      if (r && !r.ok) setError(NOT_SENT);
    } finally { setFinishing(false); }
  };

  const open = !done && !expired;
  const filled = texts.filter((t) => t.trim()).length;
  return (
    <section className="px-box np-card np-sheet" aria-label="Your answers">
      <div className="np-sheet-top">
        <LetterTile letter={s.letter} />
        <p className="np-msg">{done ? "Done. Waiting for the others." : expired ? "Time!" : <>Something for each, starting with <b>{s.letter}</b>. Rarer scores more.</>}</p>
      </div>
      <form className="np-fields" onSubmit={(e) => { e.preventDefault(); void finish(); }} autoComplete="off">
        {s.categories.map((c, i) => (
          <label key={c} className="np-field">
            <span className="lbl">{catTitle(c)}</span>
            <input
              ref={(el) => { inputs.current[i] = el; }}
              value={texts[i] ?? ""} maxLength={ANSWER_MAX} disabled={!open}
              onChange={(e) => {
                const v = e.target.value;
                textsRef.current = textsRef.current.map((x, j) => (j === i ? v : x));
                setTexts(textsRef.current);
                saver.current?.changed(i);
              }}
              onBlur={() => { void flush(); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void flush();
                const nextField = inputs.current[i + 1];
                if (nextField) nextField.focus(); else e.currentTarget.blur();
              }}
              placeholder={`${s.letter}…`} aria-label={`${catTitle(c)} starting with ${s.letter}`}
              autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} enterKeyHint={i + 1 < n ? "next" : "done"} />
          </label>
        ))}
        <p className={`np-msg ${error ? "no" : ""}`} role="status">{error ?? `${filled} of ${n} filled${s.stopEarly && open ? " · the first to finish stops the round" : ""}`}</p>
        {!done && <PixelButton type="submit" variant="gold" className="np-done" disabled={!open || finishing}>Done</PixelButton>}
      </form>
    </section>
  );
}

/** Yes or No on the open vote, for players who may vote. The answer's givers wait, and see that it is theirs. */
function VoteDesk({ s, me, out, dispatch, play }: { s: NPView; me: string; out: boolean; dispatch: Dispatch; play: Play }) {
  const v = s.vote!;
  const [mine, setMine] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  // The server's copy of this seat's vote, if it already voted (say, before a refresh).
  const choice = v.mine ?? mine;

  if (v.members.includes(me)) return <p className="np-msg" role="status">That&apos;s your answer. The table is deciding.</p>;
  if (out || !v.voters.includes(me)) return <p className="np-msg">The table is voting.</p>;
  if (choice !== null || v.voted.includes(me)) return <p className="np-msg np-voted" role="status">Voted{choice === null ? "" : <> <b>{choice ? "Yes" : "No"}</b></>}</p>;

  const send = async (ok: boolean) => {
    if (busy.current) return;
    busy.current = true;
    play("click");
    setMine(ok);
    try {
      const r = await dispatch({ type: "vote", by: me, ok });
      if (r && !r.ok) { setMine(null); setError(r.error === "Not allowed right now" ? "The vote has closed" : r.error ?? NOT_SENT); }
    } finally { busy.current = false; }
  };
  return (
    <>
      <div className="np-yesno">
        <PixelButton className="yes" onClick={() => void send(true)}>Yes</PixelButton>
        <PixelButton className="no" onClick={() => void send(false)}>No</PixelButton>
      </div>
      {error && <p className="np-msg no">{error}</p>}
    </>
  );
}

/** Under the reveal: what this seat's own answer got. */
function MyLine({ s, round, me }: { s: NPView; round: NPView["history"][number]; me: string }) {
  const a = own(round.answers, me)?.[s.cat];
  if (!a) return null;
  const pts = a.points ?? 0;
  const line = a.status === "blank" ? "You left this one blank."
    : a.status === "wrong-letter" ? `${a.text} doesn't start with ${round.letter}.`
    : a.status === "unknown" && a.accepted === false ? `The table voted ${a.text} out.`
    : `${a.text}: +${pts}${a.shared ? ", shared" : ""}`;
  return <p className={`np-mine ${pts > 0 ? "good" : "bad"}`}>{line}</p>;
}

/** Game over: who won, the final table with shared places, team totals, and each round's best answer. */
export function NpatResults({ ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain?: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as NPView;
  const me = ctl.me;
  const gone = ctl.gone ?? [];
  const scores = s.players.map((p) => own(s.points, p) ?? 0).sort((a, b) => b - a);
  const top = scores[0] ?? 0;
  let headline: string, sub = "";
  if (s.teams) {
    const best = Math.max(...s.teamPoints);
    const lead = s.teamPoints.map((n, i) => (n === best ? i : -1)).filter((i) => i >= 0);
    headline = best <= 0 ? "Nobody scored" : lead.length === 1 ? `${teamName(lead[0]!)} team wins!` : "It's a tie!";
    if (best > 0) sub = lead.length === 1 ? `${best.toLocaleString("en-US")} points` : lead.map((i) => `${teamName(i)} team`).join(" and ");
  } else {
    const won = s.players.filter((p) => (own(s.points, p) ?? 0) === top);
    headline = top <= 0 ? "Nobody scored" : won.length === 1 ? `${won[0]} wins!` : "It's a tie!";
    if (top > 0) sub = won.length === 1 ? `${top.toLocaleString("en-US")} points` : won.join(" and ");
  }
  const win = top > 0 && !headline.includes("tie");
  return (
    <PixelShell world="notebook">
      <div className="party-page np-page">
        <section className={`px-box np-card np-winner ${win ? "px-confetti" : ""}`}>
          <p className="np-eyebrow">Name Place Animal Thing</p>
          <h2 role="status">{headline}</h2>
          {sub && <p>{sub}</p>}
        </section>
        <NPTable s={s} me={me} gone={gone} label="Final scores" />
        {s.history.length > 0 && (
          <section className="px-box np-card" aria-label="The rounds">
            <h3 className="np-sub">The rounds</h3>
            <RoundRecap s={s} me={me} />
          </section>
        )}
        <PartyActions onAgain={onAgain} onRematch={onRematch} />
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
