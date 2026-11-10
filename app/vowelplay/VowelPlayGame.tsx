"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { Sprite } from "../components/pixel/Sprite";
import { Typewriter } from "../components/pixel/Typewriter";
import { wordPip } from "../components/pixel/sprites";
import { useSound } from "../components/SoundProvider";
import { track } from "../lib/analytics";
import { giveUp, GUESS_MS, guess, init, speedPoints, tick, type VPState } from "../topicDraft/formats/vowelplay";
import { matches, toPuzzle } from "../topicDraft/party/vowelText";
import { bestFor, saveBest } from "./best";
import { useTypingStage } from "./useTypingStage";

const ME = "YOU", WORDS = 10;
const CLOCK_EVERY_MS = 200;
const INTRO_NAME = "Vowel Play";

const gotIt = (h: VPState["history"][number]) => Object.hasOwn(h.gotMs, ME);

/**
 * The solo game. It waits for a tap to start, which also lets a phone open its keyboard on the input.
 *
 * The clock reads the wall time on every beat instead of counting beats, so a throttled or sleeping tab can't stretch a word.
 * A word that ran out while the tab slept is simply missed, and the game carries on from there when the player comes back.
 */
export function VowelPlayGame({ topic, title }: { topic: string; title: string }) {
  const { play } = useSound();
  const [s, setS] = useState<VPState | null>(null);
  const [now, setNow] = useState(0);
  const [text, setText] = useState("");
  const [miss, setMiss] = useState(0);
  /** The current line was just rejected. Cleared by typing, so the warning never sits on a new attempt. */
  const [rejected, setRejected] = useState(false);
  /** The name the player's answer matched: with two names on the same letters, the one they typed is the one shown. */
  const [said, setSaid] = useState<string | null>(null);
  const [best, setBest] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const played = useRef<string[]>([]);
  const finished = useRef(false);

  useEffect(() => setBest(bestFor(topic)), [topic]);

  // The clock. Waking from sleep can fire no timers for a while, so coming back runs it straight away too.
  const live = !!s && !s.done;
  useEffect(() => {
    if (!live) return;
    const beat = () => {
      const t = Date.now();
      setNow(t);
      setS((c) => (c ? tick(c, t) : c));
    };
    beat();
    const id = setInterval(beat, CLOCK_EVERY_MS);
    const wake = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("focus", wake);
    };
  }, [live]);

  const word = s && !s.done ? s.words[s.round]! : null;
  const inGuess = s?.phase === "guess" && !s.done;
  const last = s?.history[s.history.length - 1];
  const left = word && inGuess ? Math.max(0, GUESS_MS - (now - s.phaseAt)) : 0;
  const secs = Math.ceil(left / 1000);
  const score = s?.points[ME] ?? 0;

  // Each new word: a clean line and the cursor still in it. The input is never disabled, because that would drop the phone's keyboard.
  const round = s?.round;
  useEffect(() => {
    if (!inGuess) return;
    setText("");
    setSaid(null);
    setRejected(false);
    input.current?.focus({ preventScroll: true });
  }, [inGuess, round]);

  // A word closing. A right answer's sound comes from the keys landing; these are for the other ways out.
  const revealed = s?.phase === "reveal" && !s.done && last ? s.history.length : 0;
  useEffect(() => {
    if (!revealed || !last) return;
    if (gotIt(last)) play("reveal");
    else play("lose");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  // The last few seconds of a word.
  useEffect(() => {
    if (inGuess && secs > 0 && secs <= 5) play("tick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inGuess, secs]);

  // The end. Once per game, however React runs its effects.
  const done = !!s?.done;
  useEffect(() => {
    if (!done || !s || finished.current) return;
    finished.current = true;
    const before = bestFor(topic);
    saveBest(topic, score);
    setBest(Math.max(before, score));
    setNewBest(score > before);
    play(score > before ? "win" : "click");
    track("vowelplay_finished", { pool: topic, score, got: s.history.filter(gotIt).length, total: s.total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const compact = useTypingStage(input, stage, !s?.done);

  const start = () => {
    const t = Date.now();
    finished.current = false;
    const next = init({ players: [ME], topic, mode: "all", answer: "type", count: WORDS, avoid: played.current, seed: Math.floor(Math.random() * 2 ** 31), now: t });
    played.current = [...played.current, ...next.words.map((w) => w.name)];
    // Painted now, so the focus below is still inside the tap and a phone will open its keyboard.
    flushSync(() => {
      setS(next);
      setNow(t);
      setNewBest(false);
      setMiss(0);
      setRejected(false);
    });
    input.current?.focus({ preventScroll: true });
    stage.current?.scrollIntoView({ block: "start", behavior: "auto" });
    play("click");
  };

  const submit = () => {
    if (!s || !word) return;
    const t = Date.now();
    // Time may have run out since the last beat. That is a missed word, not a wrong guess.
    const cur = tick(s, t);
    if (cur !== s) { setS(cur); return; }
    if (!inGuess || !text.trim()) return;
    const next = guess(cur, ME, text, t);
    if (next === cur) {
      setMiss((n) => n + 1);
      setRejected(true);
      play("wrong");
      return;
    }
    setSaid([word.name, ...word.also].find((n) => matches(text, n)) ?? word.name);
    setS(next);
  };

  const skip = () => {
    if (!s || !inGuess) return;
    play("click");
    setS(giveUp(s, ME, Date.now()));
  };

  const typing = (v: string) => {
    if (!inGuess) return;
    if (v.length > text.length) play("click");
    setText(v);
    setRejected(false);
  };

  const shell = (body: ReactNode) => <PixelShell world="typewriter"><div className="vp-page">{body}</div></PixelShell>;
  const back = <Link href="/vowelplay" className="vp-back">&lt; All topics</Link>;
  const sign = (
    <header className="vp-sign">
      <div>
        <p className="eyebrow">{title}</p>
        <h1>Vowel Play</h1>
      </div>
      <p className="vp-score"><b>{score.toLocaleString("en-US")}</b><span>{score === 1 ? "point" : "points"}</span></p>
    </header>
  );

  if (s?.done) {
    const lost = s.history.filter((h) => !gotIt(h));
    const got = s.history.length - lost.length;
    return shell(
      <>
        {back}
        <div ref={stage} className="vp-stage"><Typewriter puzzle={String(score)} name={null} solved={false} /></div>
        <section className="vp-ticket" aria-label="Final score">
          <h2>REPAIR TICKET</h2>
          <p className="px-note">{title}</p>
          <dl>
            <div><dt>SCORE</dt><dd>{score.toLocaleString("en-US")}</dd></div>
            <div><dt>BEST HERE</dt><dd>{best.toLocaleString("en-US")}</dd></div>
          </dl>
          {newBest && <p className="vp-stamp m-0" role="status">NEW BEST</p>}
          <p className="m-0" role="status">{got === s.total ? `All ${s.total} keys back on. Good as new.` : `${got} of ${s.total} named.`}</p>
          {lost.length > 0 && (
            <>
              <h2>STILL MISSING</h2>
              <ul className="vp-missed">
                {lost.map((h) => <li key={h.name}><b className="font-normal">{h.name}</b><span>{h.puzzle}</span></li>)}
              </ul>
            </>
          )}
          <div className="vp-actions">
            <PixelButton variant="gold" onClick={start}>Play again</PixelButton>
            <Link href="/vowelplay" className="px-btn alt no-underline">All topics</Link>
          </div>
        </section>
      </>,
    );
  }

  const solved = !!last && !inGuess && !!s && gotIt(last);
  const reveal = !!s && !inGuess;
  const shownName = reveal ? (solved ? (said ?? word!.name) : word!.name) : null;
  const gained = solved && last ? speedPoints(last.gotMs[ME]!) : 0;
  const worth = inGuess ? speedPoints(now - s!.phaseAt) : 0;

  return shell(
    <>
      {back}
      {sign}
      <div ref={stage} className={`vp-stage ${compact ? "compact" : ""}`}>
        <Typewriter puzzle={word?.puzzle ?? toPuzzle(INTRO_NAME)} name={shownName} solved={solved} typed={inGuess ? text : ""} miss={miss} onClack={() => play("click")} />
        {solved && <p key={s!.round} className="vp-pop" aria-hidden>+{gained}</p>}
      </div>

      {s ? (
        <div className={`vp-clock ${inGuess && secs <= 5 ? "low" : ""}`}>
          <div className="px-seg" role="img" aria-label={`${secs} seconds left`}>
            {Array.from({ length: 20 }, (_, i) => <i key={i} className={i < left / 1000 ? "" : "off"} />)}
          </div>
          {inGuess ? <><span aria-hidden>{secs}s</span><span>worth <b>{worth}</b></span></> : <span>{s.round + 1 < s.total ? "next name…" : "last one"}</span>}
        </div>
      ) : null}

      {/* The class alternates so that a second wrong guess in a row shakes again. Never a key: that would rebuild the input and lose its focus. */}
      <form className={`vp-term ${rejected ? `miss m${miss % 2}` : ""}`} onSubmit={(e) => { e.preventDefault(); submit(); }} autoComplete="off">
        <label className="in">
          <span aria-hidden>&gt;</span>
          <input ref={input} value={text} onChange={(e) => typing(e.target.value)} readOnly={!inGuess} maxLength={60}
            placeholder={s ? "Name it" : "Press Start"} aria-label="Type the name" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" />
        </label>
        {/* Holding the press stops the input losing focus, so a phone's keyboard stays up. */}
        {s && <PixelButton variant="alt" disabled={!inGuess} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={skip}>Skip</PixelButton>}
      </form>

      {s ? (
        <>
          <p className="vp-word" role="status">
            {reveal
              ? solved ? <><b>{shownName}</b> · +{gained}</> : <span className="lost">It was <b>{shownName}</b></span>
              : rejected ? <span className="no">Not that one. Keep trying.</span>
              : <>Name it from the letters. Enter to answer.</>}
          </p>
          <ol className="vp-pips" aria-label={`Name ${s.round + 1} of ${s.total}`}>
            {s.words.map((w, i) => {
              const h = s.history[i];
              return <li key={w.name}><Sprite sprite={wordPip(h ? (gotIt(h) ? "got" : "lost") : i === s.round ? "now" : "todo")} size={18} /></li>;
            })}
          </ol>
        </>
      ) : (
        <div className="grid gap-3">
          <p className="vp-word">The vowels fell off this machine. Name each of {WORDS} from {title} using the letters left: {toPuzzle(INTRO_NAME)} is {INTRO_NAME}. Faster scores more.</p>
          <div className="vp-actions">
            <PixelButton variant="gold" onClick={start}>Start</PixelButton>
            {best > 0 && <span className="px-chip">Best here {best.toLocaleString("en-US")}</span>}
          </div>
        </div>
      )}
    </>,
  );
}
