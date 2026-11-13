"use client";

import { useEffect, useRef, useState } from "react";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { useSound } from "../../components/SoundProvider";
import type { SLView } from "../../topicDraft/formats/sayless";
import { own } from "../../topicDraft/party/own";
import { GUESS_MAX, WORD_MS } from "../../topicDraft/sayless/rules";
import { teamName } from "../teamMoves";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { DrinkCard, LeaveGame, PartyActions, PartyClock, playerSprite, WaterLine } from "./partyBits";
import { clueDraft, clueToSend } from "./clueDraft";
import { BudgetMeter, ClueTape, describerOf, describingTeam, isLive, ParCount, RevealCard, SLRoster, slClock, wordKey } from "./saylessParts";
import { TeamBoard } from "./TeamBoard";

/** The server takes about 3 sends a second from a seat; the send button rests this long after each one. */
const COOL_MS = 350;
const REFUSED = "Not allowed right now";
const NOT_SENT = "Not sent, try again";
const CLUE_MAX = 40;

type Dispatch = GameCtl["dispatch"];
type Play = ReturnType<typeof useSound>["play"];

/**
 * Say Less on a phone. The describer sees the secret word and sends one-word clues from the turn's budget; everyone
 * else watches the clue tape and types a guess (or buzzes and says it out loud, and the describer calls it right or wrong). A seat with no
 * player (the screen host, or someone watching) gets the big tape instead. Only the describer's phone is ever sent the word.
 */
export function SayLessView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as SLView;
  const me = ctl.me ?? "";
  const gone = ctl.gone ?? [];
  const seated = s.players.includes(me);
  const out = gone.includes(me);
  const describer = describerOf(s);
  const live = isLive(s);
  const key = wordKey(s);
  const reveal = s.phase === "reveal" && !s.done;
  const last = reveal ? s.history[s.history.length - 1] : undefined;
  const clock = slClock(s);
  const describing = seated && me === describer && !!s.word;

  // Sounds: a new clue for the guessers, the reveal for everyone (a win when this seat scored).
  const seen = useRef({ key, clues: s.clues.length, phase: s.phase });
  useEffect(() => {
    const was = seen.current;
    seen.current = { key, clues: s.clues.length, phase: s.phase };
    if (was.key === key && s.clues.length > was.clues && !describing) play("pick");
    if (s.phase === "reveal" && was.phase !== "reveal" && last) {
      const mine = last.winner === me || (last.describer === me && last.winner !== null);
      play(seated && mine ? "win" : "reveal");
    }
    if (s.phase === "speak" && was.phase !== "speak") play("click");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, s.clues.length, s.phase]);
  useEffect(() => { window.scrollTo(0, 0); }, [key, reveal]); // each word, and its reveal, starts at the top

  const myScore = own(s.points, me) ?? 0;
  const tv = !seated;

  return (
    <PixelShell world="wire">
      <div className={`party-page sl-page ${tv ? "tv" : ""}`}>
        <header className="sl-head">
          <span className="stat"><em>Turn</em><b>{Math.min(s.turn + 1, s.total)}<small>/{s.total}</small></b></span>
          {seated && <span className="stat"><em>Score</em><b>{myScore.toLocaleString("en-US")}</b></span>}
          {clock && <PartyClock deadline={clock.deadline} offset={ctl.offset} total={clock.total} />}
        </header>

        {tv ? <TvBoard s={s} gone={gone} /> : (
          <>
            {live && !describing && <DescriberLine s={s} me={me} />}
            {live && (describing ? <DescriberDesk key={key} s={s} me={me} offset={ctl.offset} dispatch={ctl.dispatch} play={play} />
              : <GuessDesk key={key} s={s} me={me} out={out} offset={ctl.offset} dispatch={ctl.dispatch} play={play} />)}
            {live && s.answerMode === "buzz" && s.phase !== "clue" && <JudgeDesk key={`${key}:${s.phase}:${s.buzzer}`} s={s} me={me} out={out} dispatch={ctl.dispatch} play={play} />}
          </>
        )}

        {last && <RevealCard s={s} h={last} me={me} />}

        <SLRoster s={s} me={me} gone={gone} />

        {s.drinks && <WaterLine />}
        {/* Between words only: a card never covers a live word. One called mid-word waits for the reveal. */}
        {s.drinks && !live && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        {seated && ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/** Above a guesser's tape: who is describing and what they have left. */
function DescriberLine({ s, me }: { s: SLView; me: string }) {
  const d = describerOf(s);
  return (
    <div className="sl-who">
      <Sprite sprite={playerSprite(Math.max(0, s.players.indexOf(d)))} size={28} />
      <p><b>{d === me ? "You" : d}</b> {d === me ? "are" : "is"} describing{describingTeam(s) ? ` for ${describingTeam(s)}` : ""} · word {s.at + 1} of {s.wordsPerTurn}</p>
      <BudgetMeter budget={s.budget} start={s.budgetStart} />
    </div>
  );
}

/** The describer's phone: the word, par and budget, a one-word clue field, the clues so far, and Pass. */
function DescriberDesk({ s, me, offset, dispatch, play }: { s: SLView; me: string; offset: number; dispatch: Dispatch; play: Play }) {
  const w = s.word!;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cool, setCool] = useState(false);
  const sending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const describing = s.phase === "clue";
  const canClue = describing && s.budget > 0;
  // What the room says now, for a refusal that comes back after the word may have moved on.
  const latest = useRef(s);
  useEffect(() => { latest.current = s; });
  const key = wordKey(s);
  /** A plain "not allowed": time's up only if the word is no longer live or its clock ran out, otherwise just too late. */
  const tooLate = () => (latest.current.phase !== "clue" || wordKey(latest.current) !== key || Date.now() + offset > latest.current.wordAt + WORD_MS ? "Time's up for this word" : "Too late");

  const rest = () => { setCool(true); setTimeout(() => setCool(false), COOL_MS); };
  const send = async () => {
    if (!canClue || sending.current || cool) return;
    const t = clueToSend(text);
    if (!t) { setError("Type a clue"); return; }
    sending.current = true;
    rest();
    play("click");
    try {
      const r = await dispatch({ type: "clue", by: me, text: t });
      if (r && !r.ok) { setError(r.error === REFUSED ? tooLate() : r.error ?? NOT_SENT); play("wrong"); }
      else setText("");
    } finally {
      sending.current = false;
      input.current?.focus({ preventScroll: true });
    }
  };
  const pass = async () => {
    if (!describing || sending.current) return;
    sending.current = true;
    play("click");
    try {
      const r = await dispatch({ type: "pass", by: me });
      if (r && !r.ok) setError(r.error === REFUSED ? tooLate() : r.error ?? NOT_SENT);
    } finally { sending.current = false; }
  };

  return (
    <section className="px-box sl-desk" aria-label="Your word">
      <div className="sl-secret">
        <p className="sl-eyebrow">Your word · only you can see it</p>
        <h2 className="sl-word">{w.name}</h2>
        {w.also && w.also.length > 0 && <p className="sl-also">Also counts: {w.also.join(", ")}</p>}
        <p className="sl-par">Par <b>{w.par}</b> · word {s.at + 1} of {s.wordsPerTurn}</p>
      </div>
      <BudgetMeter budget={s.budget} start={s.budgetStart} />
      <ParCount used={s.clues.length} par={w.par} />
      <ClueTape clues={s.clues} par={w.par} label="Your clues" />
      {describing ? (
        <>
          <form className={`sl-term ${error ? "bad" : ""}`} onSubmit={(e) => { e.preventDefault(); void send(); }} autoComplete="off">
            <label className="in">
              <span aria-hidden>&gt;</span>
              <input ref={input} value={text} maxLength={CLUE_MAX} disabled={!canClue} autoFocus
                onChange={(e) => {
                  // A space at either end stays until sending; a space between two words is refused, never joined.
                  const d = clueDraft(text, e.target.value);
                  setText(d.value);
                  setError(d.warn ? "One word only" : null);
                }}
                placeholder={canClue ? "One word" : "Budget spent"} aria-label="Your clue, one word" aria-describedby="sl-clue-msg"
                autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="send" />
            </label>
            {/* Holding the press keeps the field focused, so a phone's keyboard stays up. */}
            <button type="submit" className="sl-send" disabled={!canClue || cool || !clueToSend(text)} onPointerDown={(e) => e.preventDefault()}>Send</button>
          </form>
          <p id="sl-clue-msg" className={`sl-msg ${error ? "no" : ""}`} role="status">{error ?? (canClue ? "One word per clue. Each one costs 1 from the budget." : "No budget left: pass or wait for a guess.")}</p>
          <PixelButton variant="alt" className="sl-pass" onClick={() => void pass()}>{s.budget > 0 ? "Pass · costs 1" : "Pass"}</PixelButton>
        </>
      ) : null /* after a buzz, JudgeDesk below says what is happening */}
    </section>
  );
}

/** A guesser's phone (or a teammate watching): the clue tape, then a guess field, or Buzz in buzz mode. */
function GuessDesk({ s, me, out, offset, dispatch, play }: { s: SLView; me: string; out: boolean; offset: number; dispatch: Dispatch; play: Play }) {
  const guesser = s.guessers.includes(me) && !out;
  const buzz = s.answerMode === "buzz";
  const team = describingTeam(s);
  return (
    <section className="px-box sl-desk" aria-label="The clues">
      <ClueTape clues={s.clues} par={s.current?.par ?? 0} />
      <ParCount used={s.clues.length} par={s.current?.par ?? 0} />
      {!guesser ? (
        <p className="sl-msg" role="status">{out ? "You left the table. Watching." : team ? `${team} is describing. Watch the clues.` : "Watching this word."}</p>
      ) : buzz ? (
        s.phase === "clue" ? <BuzzButton s={s} me={me} dispatch={dispatch} play={play} /> : null
      ) : (
        <GuessField s={s} me={me} offset={offset} dispatch={dispatch} play={play} />
      )}
    </section>
  );
}

function GuessField({ s, me, offset, dispatch, play }: { s: SLView; me: string; offset: number; dispatch: Dispatch; play: Play }) {
  const [text, setText] = useState("");
  const [miss, setMiss] = useState<{ n: number; msg: string } | null>(null);
  const [cool, setCool] = useState(false);
  const sending = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const open = s.phase === "clue";

  const send = async () => {
    const t = text.trim();
    if (!open || !t || sending.current || cool) return;
    sending.current = true;
    setCool(true);
    setTimeout(() => setCool(false), COOL_MS);
    try {
      const r = await dispatch({ type: "guess", by: me, text: t });
      if (r && !r.ok) {
        const late = Date.now() + offset > s.wordAt + WORD_MS;
        // The server says a plain no for a wrong guess. Anything else is a reason worth showing as it is.
        const msg = r.error === REFUSED || r.error === undefined ? (late ? "Time's up" : "Not it") : r.error;
        setMiss((m) => ({ n: (m?.n ?? 0) + 1, msg }));
        if (msg === "Not it") { setText(""); play("wrong"); }
      }
    } finally {
      sending.current = false;
      input.current?.focus({ preventScroll: true });
    }
  };

  return (
    <>
      <form className={`sl-term ${miss?.msg === "Not it" ? `shake s${miss.n % 2}` : ""}`} onSubmit={(e) => { e.preventDefault(); void send(); }} autoComplete="off">
        <label className="in">
          <span aria-hidden>?</span>
          <input ref={input} value={text} maxLength={GUESS_MAX} disabled={!open} autoFocus
            onChange={(e) => { setText(e.target.value); setMiss(null); }}
            placeholder={open ? "Your guess" : "Wait for it"} aria-label="Your guess" aria-describedby="sl-guess-msg"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" />
        </label>
        <button type="submit" className="sl-send" disabled={!open || cool || !text.trim()} onPointerDown={(e) => e.preventDefault()}>Guess</button>
      </form>
      <p id="sl-guess-msg" className={`sl-msg ${miss ? "no" : ""}`} role="status">{miss ? miss.msg : "Guess as often as you like. Fewer clues score more."}</p>
    </>
  );
}

/** Buzz mode: buzz first, then say it out loud. Out of it for this word after a wrong buzz. */
function BuzzButton({ s, me, dispatch, play }: { s: SLView; me: string; dispatch: Dispatch; play: Play }) {
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);
  const locked = s.locked.includes(me);
  const can = s.phase === "clue" && s.buzzer === null && !locked;
  const buzz = async () => {
    if (!can || busy.current) return;
    busy.current = true;
    play("click");
    try {
      const r = await dispatch({ type: "buzz", by: me });
      if (r && !r.ok) setNote(r.error === REFUSED ? "Someone buzzed first." : r.error ?? NOT_SENT);
    } finally { busy.current = false; }
  };
  return (
    <div className="sl-buzz">
      <button type="button" className="px-btn gold sl-buzz-btn" disabled={!can} onClick={() => void buzz()}>Buzz</button>
      <p className={`sl-msg ${note || locked ? "no" : ""}`} role="status">{locked ? "Wrong buzz: you're out for this word." : note ?? "Know it? Buzz, then say it out loud."}</p>
    </div>
  );
}

/**
 * Buzz mode after a buzz, for every seat: the buzzer says it out loud and taps Said it, then the describer, the only one
 * who can see the word, calls it Right or Wrong. Everyone else waits on that call.
 */
function JudgeDesk({ s, me, out, dispatch, play }: { s: SLView; me: string; out: boolean; dispatch: Dispatch; play: Play }) {
  const [note, setNote] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const busy = useRef(false);
  const buzzer = s.buzzer ?? "";
  const d = describerOf(s);
  const judge = !out && me === d;

  const send = async (a: Parameters<Dispatch>[0], refused: string) => {
    if (busy.current) return false;
    busy.current = true;
    try {
      const r = await dispatch(a);
      if (r && !r.ok) { setNote(r.error === REFUSED ? refused : r.error ?? NOT_SENT); return false; }
      return true;
    } finally { busy.current = false; }
  };
  const said = () => { play("click"); void send({ type: "spoke", by: me }, "Time was already up."); };
  const call = async (verdict: "right" | "wrong") => {
    if (!judge || sent) return;
    play(verdict === "right" ? "click" : "wrong");
    setSent(true);
    if (!(await send({ type: "mark", by: me, verdict }, "Too late: it counted as right."))) setSent(false);
  };

  if (s.phase === "speak") {
    return (
      <section className="px-box sl-judge" aria-label="Buzzed">
        {buzzer === me && !out ? (
          <>
            <p className="sl-say">Say it out loud, then tap Said it</p>
            <PixelButton variant="gold" className="sl-said" onClick={said}>Said it</PixelButton>
          </>
        ) : <p className="sl-msg" role="status"><b>{buzzer}</b> buzzed and is saying it{judge ? ". Listen." : "."}</p>}
        {note && <p className="sl-msg no">{note}</p>}
      </section>
    );
  }

  return (
    <section className="px-box sl-judge" aria-label="Right or wrong?">
      {judge ? (
        <>
          <p className="sl-msg"><b>{buzzer}</b> said it. Right or Wrong?</p>
          <div className="sl-marks">
            <PixelButton className="right" disabled={sent} onClick={() => void call("right")}>Right</PixelButton>
            <PixelButton className="wrong" disabled={sent} onClick={() => void call("wrong")}>Wrong</PixelButton>
          </div>
          <p className="sl-msg">No call in time counts as right.</p>
        </>
      ) : <p className="sl-msg" role="status">The describer is deciding{buzzer === me ? " on your answer" : ""}.</p>}
      {note && <p className="sl-msg no">{note}</p>}
    </section>
  );
}

/** The screen's board: the describer and their budget, the big tape with its PAR post, and the race (never the guesses). */
function TvBoard({ s, gone }: { s: SLView; gone: string[] }) {
  const d = describerOf(s);
  const live = isLive(s);
  const par = s.current?.par ?? 0;
  const team = s.turns[s.turn]?.team;
  if (!live) return null;
  return (
    <section className="px-box sl-tv" aria-label="The board">
      <div className="sl-tv-top">
        <p className="sl-tv-who">
          <Sprite sprite={playerSprite(Math.max(0, s.players.indexOf(d)))} size={40} />
          <span><b>{d}</b> is describing{team !== null && team !== undefined && s.teams ? ` for ${teamName(team)}` : ""}</span>
        </p>
        <p className="sl-tv-word">Word {s.at + 1} of {s.wordsPerTurn} · par <b>{par}</b></p>
        <BudgetMeter budget={s.budget} start={s.budgetStart} big />
      </div>
      <ClueTape clues={s.clues} par={par} big />
      <ParCount used={s.clues.length} par={par} />
      {s.answerMode === "buzz" ? (
        <p className="sl-race" role="status">
          {s.phase === "speak" ? <><b>{s.buzzer}</b> buzzed. Saying it now.</>
            : s.phase === "judge" ? <>Did <b>{s.buzzer}</b> get it? Describer <b>{d}</b> is deciding.</>
            : s.locked.length ? <>Out on this word: {s.locked.join(", ")}. Buzz open.</>
            : <>Buzz open. First to buzz says it out loud.</>}
        </p>
      ) : (
        <ul className="sl-racers" aria-label="Guessing">
          {s.guessers.map((p) => (
            <li key={p} className={gone.includes(p) ? "is-gone" : ""}>
              <Sprite sprite={playerSprite(Math.max(0, s.players.indexOf(p)))} size={20} />
              <span className="n">{p}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Game over: who won, the final table with shared places, team totals, and every word with its par and who got it. */
export function SayLessResults({ ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain?: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as SLView;
  const me = ctl.me;
  const score = (p: string) => own(s.points, p) ?? 0;
  const rows = s.players.map((p, seat) => ({ p, seat, score: score(p) })).sort((a, b) => b.score - a.score || a.seat - b.seat);
  const place = (i: number) => rows.findIndex((r) => r.score === rows[i]!.score) + 1;
  const top = rows[0]?.score ?? 0;
  let headline: string, sub = "";
  if (s.teams) {
    const best = Math.max(...s.teamPoints);
    const lead = s.teamPoints.map((n, i) => (n === best ? i : -1)).filter((i) => i >= 0);
    headline = best <= 0 ? "Nobody scored" : lead.length === 1 ? `${teamName(lead[0]!)} team wins!` : "It's a tie!";
    if (best > 0) sub = lead.length === 1 ? `${best} points` : lead.map((i) => `${teamName(i)} team`).join(" and ");
  } else {
    const won = rows.filter((r) => r.score === top).map((r) => r.p);
    headline = top <= 0 ? "Nobody scored" : won.length === 1 ? `${won[0]} wins!` : "It's a tie!";
    if (top > 0) sub = won.length === 1 ? `${top} points` : won.join(" and ");
  }
  const win = top > 0 && !headline.includes("tie");
  return (
    <PixelShell world="wire">
      <div className="party-page sl-page">
        <section className={`px-box sl-card sl-winner ${win ? "px-confetti" : ""}`}>
          <p className="sl-eyebrow">Say Less</p>
          <h2 role="status">{headline}</h2>
          {sub && <p>{sub}</p>}
        </section>
        <section className="px-box sl-card" aria-label="Final scores">
          <h3 className="sl-sub">Final scores</h3>
          <ol className="sl-final">
            {rows.map((r, i) => (
              <li key={r.p} className={`${place(i) === 1 && r.score > 0 ? "top" : ""} ${r.p === me ? "me" : ""} ${ctl.gone?.includes(r.p) ? "is-gone" : ""}`}>
                <span className="rk">{place(i)}</span>
                <Sprite sprite={playerSprite(r.seat)} size={20} />
                <span className="name">{r.p}</span>
                <b>{r.score.toLocaleString("en-US")}</b>
              </li>
            ))}
          </ol>
          {s.teams && <TeamBoard points={s.points} teams={s.teams} me={me} />}
        </section>
        {s.history.length > 0 && (
          <section className="px-box sl-card" aria-label="The words">
            <h3 className="sl-sub">The words</h3>
            <ul className="sl-recap">
              {s.history.map((h, i) => (
                <li key={i} className={h.winner !== null ? "" : "miss"}>
                  <span className="w"><b>{h.word}</b> <em>by {h.describer}</em></span>
                  <span className="c">{h.clues.length} {h.clues.length === 1 ? "clue" : "clues"}, par {h.par}</span>
                  <span className="who">{h.winner !== null ? `${h.winner} +${h.points}` : h.passed ? "passed" : "nobody"}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <PartyActions onAgain={onAgain} onRematch={onRematch} />
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
