"use client";

// Dodge in a room: a category comes up and everyone types one answer. The chosen player wants to be obvious, everyone
// else wants to dodge them. Phones answer and see the reveal; the screen shows the category, who has locked in, and
// the reveal big. Other players' answers only arrive with the reveal (the server redacts them).
import { useEffect, useRef, useState } from "react";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { useSound } from "../../components/SoundProvider";
import { chosen as chosenOf, type DodgeRound, type DodgeView as DView } from "../../topicDraft/formats/dodge";
import { ANSWER_MAX, ANSWER_MS } from "../../topicDraft/dodge/rules";
import { own } from "../../topicDraft/party/own";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { dodgeRanked, revealGroups } from "./dodgeBoard";
import { makeSaver, type Saver } from "./npatSaver";
import { canMoveOn, DrinkCard, LeaveGame, PartyActions, PartyClock, playerSprite, WaitingForHost, WaterLine } from "./partyBits";

type Dispatch = GameCtl["dispatch"];
type Play = ReturnType<typeof useSound>["play"];

const NOT_SENT = "Not saved, try again";
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export function DodgeView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as DView;
  const me = ctl.me ?? "";
  const gone = ctl.gone ?? [];
  const seated = s.players.includes(me);
  const out = gone.includes(me);
  const tv = !seated;
  const who = chosenOf(s);
  const isChosen = seated && me === who;
  // Lock counts are over the players still at the table.
  const here = s.players.filter((p) => !gone.includes(p));
  const category = s.categories[s.round] ?? "";
  const last = s.phase === "reveal" ? s.history[s.history.length - 1] : undefined;

  const seen = useRef({ phase: s.phase, round: s.round });
  useEffect(() => {
    const was = seen.current;
    seen.current = { phase: s.phase, round: s.round };
    if (s.phase === "answer" && (was.phase !== "answer" || was.round !== s.round)) play("pick");
    if (s.phase === "reveal" && was.phase !== "reveal") {
      const st = last && seated ? own(last.status, me) : undefined;
      play(st === "match" ? "wrong" : st === "dodge" || (st === "chosen" && (last?.gained[me] ?? 0) > 0) ? "win" : "reveal");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);
  useEffect(() => { window.scrollTo(0, 0); }, [s.phase, s.round]);

  return (
    <PixelShell world="arcade">
      <div className={`party-page dg-page ${tv ? "tv" : ""}`}>
        <header className="party-sign dg-sign">
          <div>
            <p className="eyebrow">Dodge · Round {s.number} of {s.total}</p>
            <h1>{category}</h1>
          </div>
          {s.phase === "answer" && <PartyClock deadline={s.phaseAt + ANSWER_MS} offset={ctl.offset} total={ANSWER_MS} />}
        </header>

        <section className={`px-box dg-chosen ${isChosen ? "me" : ""}`} aria-live="polite">
          <Sprite sprite={playerSprite(s.players.indexOf(who))} size={tv ? 40 : 28} />
          <div>
            <p className="dg-eyebrow">Chosen this round</p>
            <p className="dg-who">{isChosen ? "You" : who}</p>
            {s.phase === "answer" && <p className="dg-msg">{isChosen ? "Say the obvious thing. You score for everyone who says it too." : tv || out ? `Everyone guesses what ${who} will say, then says something else.` : `Guess what ${who} will say. Then don't say it.`}</p>}
          </div>
        </section>

        {s.phase === "answer" && (tv || out
          ? <Lockers s={s} here={here} note={out ? "You left the table. Watching." : null} />
          : <AnswerDesk key={`${s.startedAt}.${s.round}`} s={s} here={here} me={me} isChosen={isChosen} offset={ctl.offset} dispatch={ctl.dispatch} play={play} />)}

        {s.phase === "judge" && (
          <section className="px-box dg-card" aria-label="Checking">
            <h2 className="dg-title" role="status">Checking close calls…</h2>
            <p className="dg-msg">Some answers are nearly the same as {who}&apos;s. A judge is deciding if they count.</p>
          </section>
        )}

        {last && <Reveal r={last} players={s.players} me={seated ? me : null} big={tv} />}
        {last && seated && <MyLine r={last} me={me} />}
        {last && <Standings s={s} me={seated ? me : null} />}

        {s.phase !== "answer" && (canMoveOn(ctl)
          ? <PixelButton variant="alt" className="dg-next" onClick={() => ctl.dispatch({ type: "next", by: me })}>{s.phase === "judge" ? "Skip the check >" : s.number < s.total ? "Next round >" : "Final scores >"}</PixelButton>
          : s.phase === "reveal" && <WaitingForHost ctl={ctl} />)}

        {s.drinks && <WaterLine />}
        {/* Sips are poured at the reveal: a card never covers the answering. */}
        {s.drinks && s.phase !== "answer" && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        {seated && ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/** Who has locked in, for the screen and for a seat that left. Never anyone's words. */
function Lockers({ s, here, note }: { s: DView; here: string[]; note: string | null }) {
  return (
    <section className="px-box dg-card" aria-label="Locked in">
      <p className="dg-msg">{note ?? `${s.locked.filter((p) => here.includes(p)).length} of ${here.length} locked in`}</p>
      <ul className="dg-lockers">
        {s.players.map((p, i) => here.includes(p) && (
          <li key={p} className={s.locked.includes(p) ? "on" : ""}>
            <Sprite sprite={playerSprite(i)} size={20} /><span className="n">{p}</span><b>{s.locked.includes(p) ? "Locked" : "Typing"}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A player's answer: saved a moment after typing stops (each save replaces the last), sent the moment the clock runs
 * out (the server takes it half a second past the deadline), and locked in with Lock in.
 */
function AnswerDesk({ s, here, me, isChosen, offset, dispatch, play }: { s: DView; here: string[]; me: string; isChosen: boolean; offset: number; dispatch: Dispatch; play: Play }) {
  const [text, setText] = useState(() => own(s.typed, me) ?? "");
  const textRef = useRef(text);
  const sent = useRef(text);
  const inflight = useRef<Promise<boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const locked = s.locked.includes(me);
  const deadline = s.phaseAt + ANSWER_MS;
  const [now, setNow] = useState(() => Date.now() + offset);
  const expired = now >= deadline;
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  useEffect(() => { input.current?.focus(); }, []);

  const send = (): Promise<boolean> | null => {
    const t = textRef.current;
    if (t === sent.current) return inflight.current;
    const before = sent.current;
    sent.current = t;
    const p: Promise<boolean> = Promise.resolve(dispatch({ type: "answer", by: me, text: t })).then((r) => {
      if (inflight.current === p) inflight.current = null;
      if (r && !r.ok) {
        if (sent.current === t) sent.current = before;
        setError(r.error && r.error !== "Not allowed right now" ? r.error : NOT_SENT);
        return false;
      }
      setError(null);
      return true;
    });
    inflight.current = p;
    return p;
  };
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const saver = useRef<Saver | null>(null);
  useEffect(() => {
    const sv = makeSaver(1, () => sendRef.current());
    saver.current = sv;
    return () => { sv.stop(); saver.current = null; };
  }, []);
  const flush = () => saver.current?.flush() ?? Promise.resolve(true);

  // The last typing goes when the clock runs out; re-armed when the clock offset is corrected.
  useEffect(() => {
    const t = setTimeout(() => { void saver.current?.flush(); }, Math.max(0, deadline - (Date.now() + offset)));
    return () => clearTimeout(t);
  }, [deadline, offset]);

  const lockIn = async () => {
    if (locked || locking || expired) return;
    setLocking(true);
    play("click");
    try {
      if (!(await flush())) return;
      const r = await dispatch({ type: "lock", by: me });
      if (r && !r.ok) setError(NOT_SENT);
    } finally { setLocking(false); }
  };

  const open = !locked && !expired;
  return (
    <section className="px-box dg-card" aria-label="Your answer">
      <form className="dg-form" onSubmit={(e) => { e.preventDefault(); void lockIn(); }} autoComplete="off">
        <label className="dg-field">
          <span className="lbl">{isChosen ? "Your answer" : "Your dodge"}</span>
          <input
            ref={input} value={text} maxLength={ANSWER_MAX} disabled={!open}
            onChange={(e) => { textRef.current = e.target.value; setText(e.target.value); saver.current?.changed(0); }}
            placeholder="One answer" autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck={false} enterKeyHint="done" />
        </label>
        <p className={`dg-msg ${error ? "no" : ""}`} role="status">
          {error ?? (locked ? "Locked in. Waiting for the others." : expired ? "Time!" : `${s.locked.filter((p) => here.includes(p)).length} of ${here.length} locked in`)}
        </p>
        {!locked && <PixelButton type="submit" variant="gold" className="dg-lock" disabled={!open || locking}>Lock in</PixelButton>}
      </form>
    </section>
  );
}

/** The chosen answer flips first, its matches line up beside it, then the dodges and the blanks. */
function Reveal({ r, players, me, big }: { r: DodgeRound; players: string[]; me: string | null; big: boolean }) {
  const g = revealGroups(r, players);
  let at = 1; // flip order after the chosen card
  const delay = () => ({ animationDelay: `${0.5 + 0.25 * at++}s` });
  const tag = (p: string) => (p === me ? " (you)" : "");
  return (
    <section className={`px-box dg-card dg-reveal ${big ? "big" : ""}`} aria-label="The answers">
      <div className="dg-match-row">
        <div className="dg-flip chosen">
          <p className="as">{g.chosen.name}{tag(g.chosen.name)} said</p>
          <p className="txt">{g.chosen.text || "Nothing"}</p>
          <b className="pts">{signed(r.gained[g.chosen.name] ?? 0)}</b>
        </div>
        {g.matched.length > 0 && (
          <ul className="dg-matched" aria-label="Matched">
            {g.matched.map((m) => (
              <li key={m.name} className="dg-flip match" style={delay()}>
                <p className="as">{m.name}{tag(m.name)}</p>
                <p className="txt">{m.text}</p>
                <span className="badge">{m.judged ? "Close enough" : "Match"} <b>−1</b></span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="dg-msg">{g.matched.length === 0 ? (g.chosen.text ? "Nobody matched. Everyone who answered dodged." : `${g.chosen.name} said nothing, so everyone who answered dodged.`) : `${g.matched.length} ${g.matched.length === 1 ? "match" : "matches"}.`}{r.unchecked ? " Close calls weren't checked this round, so only exact matches count." : ""}</p>
      {g.dodged.length > 0 && (
        <ul className="dg-dodged" aria-label="Dodged">
          {g.dodged.map((d) => (
            <li key={d.text} className="dg-flip dodge" style={delay()}>
              <p className="txt">{d.text}</p>
              <p className="as">{d.names.map((n) => `${n}${tag(n)}`).join(", ")} <b>+1</b></p>
            </li>
          ))}
        </ul>
      )}
      {g.blank.length > 0 && <p className="dg-msg dg-blank">No answer: {g.blank.map((n) => `${n}${tag(n)}`).join(", ")}</p>}
    </section>
  );
}

/** One line on how this seat did. */
function MyLine({ r, me }: { r: DodgeRound; me: string }) {
  const st = own(r.status, me);
  const n = own(r.gained, me) ?? 0;
  const line = st === "chosen" ? (n > 0 ? `${n} ${n === 1 ? "player" : "players"} said it too. ${signed(n)} for you.` : "Nobody said what you said. No points this time.")
    : st === "match" ? `You said what ${r.chosen} said. −1.`
    : st === "dodge" ? "You dodged. +1."
    : "No answer, no points.";
  return <p className={`party-status dg-mine ${st === "match" ? "no" : ""}`} role="status">{line}</p>;
}

function Standings({ s, me }: { s: DView; me: string | null }) {
  return (
    <section className="px-box dg-card" aria-label="Scores">
      <ol className="dg-scores">
        {dodgeRanked(s).map((r) => (
          <li key={r.name} className={r.name === me ? "me" : ""}><span className="pl">#{r.place}</span><span className="n">{r.name}{r.name === me ? " (you)" : ""}</span><b>{r.points}</b></li>
        ))}
      </ol>
    </section>
  );
}

/** Game over: the winner, the standings, and every round's chosen answer. */
export function DodgeResults({ ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain?: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as DView;
  const rows = dodgeRanked(s);
  const top = rows[0]?.points ?? 0;
  const won = rows.filter((r) => r.points === top);
  const headline = won.length === 1 ? `${won[0]!.name} wins!` : "It's a tie!";
  return (
    <PixelShell world="arcade">
      <div className="party-page dg-page">
        <section className={`px-box dg-card dg-winner ${won.length === 1 ? "px-confetti" : ""}`}>
          <p className="dg-eyebrow">Dodge · final scores</p>
          <h2 role="status">{headline}</h2>
          <p className="dg-msg">{won.length === 1 ? `${top} points` : `${won.map((r) => r.name).join(" and ")} on ${top}`}</p>
        </section>
        <Standings s={s} me={ctl.me} />
        <section className="px-box dg-card" aria-label="Every round">
          <h3 className="dg-eyebrow">Every round</h3>
          <ol className="dg-recap">
            {s.history.map((h, i) => {
              const m = Object.values(h.status).filter((x) => x === "match").length;
              return <li key={i}><span className="c">{h.category}</span><span className="a"><b>{h.chosen}</b>: {h.answers[h.chosen] || "nothing"} · {m} {m === 1 ? "match" : "matches"}</span></li>;
            })}
          </ol>
        </section>
        <PartyActions onAgain={onAgain} onRematch={onRematch} />
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
