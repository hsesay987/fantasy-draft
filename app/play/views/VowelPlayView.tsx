"use client";

import { useEffect, useRef, useState } from "react";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { PaperPull } from "../../components/pixel/PaperPull";
import { Sprite } from "../../components/pixel/Sprite";
import { Typewriter } from "../../components/pixel/Typewriter";
import { wordPip } from "../../components/pixel/sprites";
import { useSound } from "../../components/SoundProvider";
import { DUEL_LEAD, GUESS_MS, JUDGE_MS, SPEAK_MS, speedPoints, winners, type VPHistory, type VPState } from "../../topicDraft/formats/vowelplay";
import { has } from "../../topicDraft/party/own";
import { mixTitle } from "../../topicDraft/party/mixTitle";
import { poolsOf } from "../../play/types";
import { vowelTopicTitle } from "../../topicDraft/party/vowelTopics";
import { useTypingStage } from "../../vowelplay/useTypingStage";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { teamsFor } from "../teamStandings";
import { TeamBoard } from "./TeamBoard";
import { DrinkCard, LeaveGame, playerSprite, WaterLine } from "./partyBits";

const CLOCK_EVERY_MS = 200;
const REFUSED = "Not allowed right now";
const LATE = "Too late for this one.";

const topicTitle = vowelTopicTitle;
const gameTitle = (setup: GameSetup) => (setup.format === "vowelparty" ? "Vowel Party" : "Vowel Play");
/** Did this seat take the word? Everyone-competes: it got it. Otherwise only the one who won it did. */
const took = (s: VPState, h: VPHistory, me: string) => (s.mode === "all" ? has(h.gotMs, me) : h.winner === me);
/** Was the word named by anyone this seat should see solved on the sheet? (Not the same as taking it.) */
const named = (s: VPState, h: VPHistory, me: string) => (s.mode === "all" ? has(h.gotMs, me) : h.winner !== null);
const wonBy = (s: VPState, p: string) => s.history.filter((h) => h.winner === p).length;
/** What a player's score reads as: Head to head has no points, only words won. */
const scoreOf = (s: VPState, p: string) => (s.mode === "duel" ? wonBy(s, p) : has(s.points, p) ? s.points[p]! : 0);
const fmt = (n: number) => n.toLocaleString("en-US");
/** A buzz time as seconds with milliseconds: 2347 reads 2.347s. */
const buzzTime = (ms: number) => `${(ms / 1000).toFixed(3)}s`;
/** Did this word's wrong buzz cost the buzzer a point? The engine records what it took (none when they had none). */
const lostPoint = (h: VPHistory | undefined) => !!h?.wrongBuzz && (h.lost ?? 0) > 0;
/** How long each phase's clock runs, and so how many segments it has. */
const PHASE_MS = { guess: GUESS_MS, speak: SPEAK_MS, judge: JUDGE_MS } as const;

/** The server's clock, read often enough for a countdown. */
function useServerNow(offset: number, on: boolean): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!on) return;
    const beat = () => setNow(Date.now() + offset);
    beat();
    const id = setInterval(beat, CLOCK_EVERY_MS);
    return () => clearInterval(id);
  }, [on, offset]);
  return now;
}

/**
 * The online game for Vowel Play (First correct, Head to head) and Vowel Party: the typewriter, the clock, the input and the
 * players. Answers are typed. Phones only ever hold the letters until a word is finished: the name arrives with the reveal.
 *
 * Voice play is a separate piece (buzz, speak, judge) and plugs in at `VoiceControls` below, in place of the typing line.
 */
export function VowelPlayView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as VPState;
  const me = ctl.me ?? "";
  const seated = s.players.includes(me);
  const gone = ctl.gone ?? [];
  const typed = s.answer === "type";

  const [text, setText] = useState("");
  const [miss, setMiss] = useState(0);
  /** Why the last guess was refused, until the next keystroke or word. */
  const [rejected, setRejected] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const sending = useRef(false);

  const word = s.done ? null : s.words[s.round] ?? null;
  const inGuess = s.phase === "guess" && !s.done;
  const reveal = s.phase === "reveal" && !s.done;
  const last: VPHistory | undefined = reveal ? s.history[s.history.length - 1] : undefined;
  const got = has(s.gotMs, me);
  const gaveUp = s.gaveUp.includes(me);
  const canType = typed && inGuess && seated && !got && !gaveUp && !gone.includes(me);

  const voicePhase = !s.done && (s.phase === "speak" || s.phase === "judge") ? s.phase : null;
  const timed = inGuess ? "guess" : voicePhase;
  const now = useServerNow(ctl.offset, timed !== null);
  const span = timed ? PHASE_MS[timed] : GUESS_MS;
  const left = timed ? Math.max(0, span - (now - s.phaseAt)) : 0;
  const secs = Math.ceil(left / 1000);

  // Read by the answer handler, which outlives the render that started it.
  const live = useRef({ round: s.round, got });
  useEffect(() => { live.current = { round: s.round, got }; });

  const compact = useTypingStage(input, stage, typed && seated && !s.done);

  // A game starts at the top of the screen, wherever the lobby had been scrolled to.
  useEffect(() => { window.scrollTo(0, 0); }, []);

  // Each new word: a clean line and the cursor still in it.
  useEffect(() => {
    if (!inGuess) return;
    setText("");
    setRejected(null);
    if (typed) input.current?.focus({ preventScroll: true });
  }, [inGuess, s.round, typed]);

  const revealed = reveal ? s.history.length : 0;
  useEffect(() => {
    if (!revealed || !last) return;
    play(took(s, last, me) ? "reveal" : "lose");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  useEffect(() => {
    if (got && s.mode === "all") play("win");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [got]);

  // The last seconds tick for whoever is on the clock: a typist, the speaker, or a judge who hasn't marked.
  const onClock = canType || (s.phase === "speak" && s.buzzer === me) || (s.phase === "judge" && seated && s.buzzer !== me && !has(s.marks, me) && !gone.includes(me));
  useEffect(() => {
    if (onClock && secs > 0 && secs <= 5) play("tick");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClock, secs]);

  // Someone buzzed: everyone hears it.
  // Only a buzz that happens while this screen is up: opening it mid-speak is silent.
  const buzzKey = s.phase === "speak" && !s.done ? `${s.round}:${s.buzzer}` : "";
  const heardBuzz = useRef(buzzKey);
  useEffect(() => {
    if (buzzKey && buzzKey !== heardBuzz.current) play("pick");
    heardBuzz.current = buzzKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzKey]);

  if (!word) return null;

  const submit = async () => {
    if (!canType || !text.trim() || sending.current) return;
    sending.current = true;
    const round = s.round;
    try {
      const r = await ctl.dispatch({ type: "guess", by: me, text });
      // Refused. Unless the word has moved on, or this seat has it (an answer already counted), that is a miss to show.
      if (r && !r.ok && live.current.round === round && !live.current.got) {
        // A guess that came after the clock ran out was late, not wrong.
        if (r.error === REFUSED && Date.now() + ctl.offset - s.phaseAt >= GUESS_MS) {
          setRejected(LATE);
        } else {
          setMiss((n) => n + 1);
          setRejected(r.error ?? REFUSED);
          play("wrong");
        }
      }
    } finally {
      sending.current = false;
    }
  };

  const giveUp = () => {
    if (!canType || s.mode !== "all") return;
    play("click");
    void ctl.dispatch({ type: "giveUp", by: me });
  };

  const typing = (v: string) => {
    if (!canType) return;
    if (v.length > text.length) play("click");
    setText(v);
    setRejected(null);
  };

  const solved = !!last && named(s, last, me);
  const gained = solved && last && s.mode === "all" ? speedPoints(last.gotMs[me]!) : 0;
  const myScore = scoreOf(s, me);
  const worth = inGuess ? speedPoints(now - s.phaseAt) : 0;
  const duel = s.mode === "duel";

  return (
    <PixelShell world="typewriter">
      <div className="vp-page">
        <header className="vp-sign">
          <div>
            <p className="eyebrow">{poolsOf(setup).length > 1 && word.topic ? topicTitle(word.topic) : topicTitle(setup.pool)}</p>
            <h1>{gameTitle(setup)}</h1>
          </div>
          {seated && <p className="vp-score"><b>{fmt(myScore)}</b><span>{duel ? (myScore === 1 ? "word" : "words") : myScore === 1 ? "point" : "points"}</span></p>}
        </header>

        <div ref={stage} className={`vp-stage ${compact ? "compact" : ""}`}>
          <Typewriter puzzle={word.puzzle} name={reveal ? word.name : null} solved={solved} typed={canType ? text : ""} miss={miss} onClack={() => play("click")} />
          {solved && s.mode === "all" && <p key={s.round} className="vp-pop" aria-hidden>+{gained}</p>}
        </div>


        {duel && <Pull s={s} />}

        <div className={`vp-clock ${timed && secs <= (timed === "guess" ? 5 : 2) ? "low" : ""}`}>
          <div className="px-seg" role="img" aria-label={timed ? `${secs} seconds left` : "Between words"}>
            {Array.from({ length: Math.round(span / 1000) }, (_, i) => <i key={i} className={i < left / 1000 ? "" : "off"} />)}
          </div>
          {timed
            ? <><span aria-hidden>{secs}s</span>{s.mode === "all" ? <span>worth <b>{worth}</b></span>
              : timed === "speak" ? <span>to say it</span> : timed === "judge" ? <span>to judge</span>
              : <span>{typed ? "first takes it" : "first to buzz"}</span>}</>
            : <span>{s.round + 1 < s.total ? "next name…" : "last one"}</span>}
        </div>

        {typed ? (
          <form className={`vp-term ${rejected && rejected !== LATE ? `miss m${miss % 2}` : ""}`} onSubmit={(e) => { e.preventDefault(); void submit(); }} autoComplete="off">
            <label className="in">
              <span aria-hidden>&gt;</span>
              <input ref={input} value={text} onChange={(e) => typing(e.target.value)} readOnly={!canType} maxLength={60}
                placeholder={seated ? "Name it" : "Watching"} aria-label="Type the name" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" />
            </label>
            {/* Holding the press stops the input losing focus, so a phone's keyboard stays up. */}
            {s.mode === "all" && <PixelButton type="button" variant="alt" disabled={!canType} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={giveUp}>Give up</PixelButton>}
          </form>
        ) : <VoiceControls s={s} me={me} seated={seated} gone={gone} dispatch={ctl.dispatch} play={play} secs={secs} />}

        {(typed || reveal) && <p className="vp-word" role="status">
          {reveal && last ? <Verdict s={s} h={last} name={word.name} me={me} gained={gained} />
            : !seated ? <>Watching this one.</>
            : got ? <>You got it! +{speedPoints(s.gotMs[me]!)}. Waiting for the others.</>
            : gaveUp ? <>You passed on this one.</>
            : rejected ? <span className="no">{rejected === REFUSED ? "Not that one. Keep trying." : rejected}</span>
            : s.mode === "all" ? <>Name it from the letters. Faster scores more.</> : <>Name it from the letters. The first right answer takes it.</>}
        </p>}

        <Roster s={s} me={me} gone={gone} reveal={reveal} />

        {/* Below the typewriter and the standings, in the flow: it covers neither the letters nor the table. */}
        {s.drinks && s.mode !== "duel" && reveal && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}

        <ol className="vp-pips" aria-label={`Name ${s.round + 1} of ${s.total}`}>
          {Array.from({ length: s.total }, (_, i) => {
            const h = s.history[i];
            const ok = h && took(s, h, me);
            return <li key={i}><Sprite sprite={wordPip(h ? (ok ? "got" : "lost") : i === s.round ? "now" : "todo")} size={18} /></li>;
          })}
        </ol>

        {s.drinks && <WaterLine />}
        {ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/**
 * Voice play, in place of the typing line. The letters are up and anyone can buzz; the first buzz gets 5 seconds to say the
 * name out loud (the app never listens); then the name shows and everyone else marks what they heard Right or Wrong.
 */
function VoiceControls({ s, me, seated, gone, dispatch, play, secs }: { s: VPState; me: string; seated: boolean; gone: string[]; dispatch: GameCtl["dispatch"]; play: (n: "click" | "wrong") => void; secs: number }) {
  const key = `${s.round}:${s.phase}`;
  /** Why this seat's last tap was refused, for as long as the round and phase it was tapped in last. */
  const [why, setWhy] = useState<{ key: string; msg: string } | null>(null);
  const busy = useRef(false);
  const buzzBtn = useRef<HTMLButtonElement>(null);
  const live = useRef(key);
  useEffect(() => { live.current = key; });

  const out = gone.includes(me);
  const playing = seated && !out && !s.done;
  const canBuzz = playing && s.phase === "guess" && s.buzzer === null;
  const speaker = s.buzzer === me;
  const judge = playing && s.phase === "judge" && !speaker;
  const marked = has(s.marks, me) ? s.marks[me] : null;
  const word = s.words[s.round];

  const send = async (action: Parameters<GameCtl["dispatch"]>[0], refused: string) => {
    if (busy.current) return;
    busy.current = true;
    const at = live.current;
    try {
      const r = await dispatch(action);
      // Refused while nothing has moved on: say so. If the phase changed meanwhile, the screen already shows why.
      if (r && !r.ok && live.current === at) setWhy({ key: at, msg: r.error === REFUSED ? refused : r.error ?? refused });
    } finally {
      busy.current = false;
    }
  };
  const buzz = () => { if (canBuzz) { play("click"); void send({ type: "buzz", by: me }, "Someone buzzed first."); } };
  const done = () => { if (playing && s.phase === "speak" && speaker) { play("click"); void send({ type: "spoke", by: me }, "Time was already up."); } };
  const markIt = (verdict: "right" | "wrong") => { if (judge && !marked) { play(verdict === "right" ? "click" : "wrong"); void send({ type: "mark", by: me, verdict }, "Too late to judge this one."); } };

  // Each new word puts the Buzz button in focus, so on a computer the space bar (or Enter) buzzes the usual way a button
  // does, and the space bar scrolls the page as normal whenever anything else has focus.
  useEffect(() => {
    if (canBuzz) buzzBtn.current?.focus({ preventScroll: true });
  }, [canBuzz, s.round]);

  const buzzer = s.buzzer;
  const timeLine = buzzer && s.buzzMs !== null && s.buzzMs !== undefined
    ? <p className="vp-buzzed"><Sprite sprite={playerSprite(Math.max(0, s.players.indexOf(buzzer)))} size={18} /><span><b>{buzzer === me ? "You" : buzzer}</b> buzzed in <b className="t">{buzzTime(s.buzzMs)}</b></span></p>
    : null;
  const note = why && why.key === key ? <p className="vp-word"><span className="no">{why.msg}</span></p> : null;
  // Seats that left don't vote, so they aren't counted as waited for.
  const judges = s.players.filter((p) => p !== buzzer && !gone.includes(p));
  const votes = judges.filter((p) => has(s.marks, p)).length;

  if (s.done || s.phase === "reveal") return timeLine;

  // Read out once per phase (and when a refusal comes back), never the ticking seconds or the buttons.
  const said = s.phase === "guess" ? (canBuzz ? "New word. Buzz when you know it." : "New word.")
    : s.phase === "speak" ? (speaker ? "You buzzed. Say it now." : `${buzzer} buzzed.`)
    : `The answer is ${word?.name ?? ""}. ${judge && !marked ? `Did ${buzzer} say it?` : "Judging."}`;
  const announce = <p className="sr-only" role="status">{why && why.key === key ? why.msg : said}</p>;

  if (s.phase === "guess") {
    return (
      <div className="vp-voice">
        {announce}
        {/* A plain button in the pixel kit's look, so it can take focus at each new word. */}
        <button ref={buzzBtn} type="button" className="px-btn gold vp-buzz" disabled={!canBuzz} onClick={buzz}>Buzz</button>
        {note ?? <p className="vp-word">{!seated ? "Watching this one." : out ? "You left the table." : "Buzz when you know it, then say it out loud."}</p>}
      </div>
    );
  }

  if (s.phase === "speak") {
    return (
      <div className="vp-voice">
        {announce}
        {timeLine}
        {speaker && !out ? (
          <>
            <p className="vp-say"><span>Say it now!</span><b aria-hidden>{secs}</b></p>
            <PixelButton className="vp-done" onClick={done}>Done</PixelButton>
            {note}
          </>
        ) : <p className="vp-word"><b>{buzzer}</b> is saying it. No buzzing till they’re done.</p>}
      </div>
    );
  }

  // Judging: the name is out for everyone.
  return (
    <div className="vp-voice">
      {announce}
      {timeLine}
      <div className="vp-answer">
        <span className="lbl">THE ANSWER</span>
        <b>{word?.name}</b>
        {word && word.also.length > 0 && <span className="also">or {word.also.join(", or ")}</span>}
      </div>
      {judge && !marked ? (
        <>
          <p className="vp-word">Did <b>{buzzer}</b> say it?</p>
          <div className="vp-judge">
            <PixelButton className="right" onClick={() => markIt("right")}>Right</PixelButton>
            <PixelButton className="wrong" onClick={() => markIt("wrong")}>Wrong</PixelButton>
          </div>
          {note}
        </>
      ) : judge ? <p className="vp-word">You marked it <b>{marked}</b>. {votes} of {judges.length} in.</p>
        : speaker ? <p className="vp-word">The others are judging what you said. {votes} of {judges.length} in.</p>
        : <p className="vp-word">The table is judging <b>{buzzer}</b>.</p>}
    </div>
  );
}

function Verdict({ s, h, name, me, gained }: { s: VPState; h: VPHistory; name: string; me: string; gained: number }) {
  if (s.mode === "all") {
    const n = Object.keys(h.gotMs).length;
    const first = h.winner;
    return <><b>{name}</b> · {has(h.gotMs, me) ? `you +${gained}` : n ? `${first} was first` : "nobody got it"}{n > 0 ? ` · ${n} of ${s.players.length}` : ""}</>;
  }
  if (s.answer === "voice") {
    const other = (p: string) => s.players.find((q) => q !== p) ?? "";
    const you = (p: string) => (p === me ? "You" : p);
    if (h.winner) return <><b>{name}</b> · {you(h.winner)} said it{s.mode === "duel" ? ` · a step to ${h.winner === me ? "you" : h.winner}` : " · +1"}</>;
    if (h.wrongBuzz) {
      const cost = s.mode === "duel" ? ` · a step to ${other(h.wrongBuzz) === me ? "you" : other(h.wrongBuzz)}` : lostPoint(h) ? " · -1 point" : "";
      return <span className="lost"><b>{name}</b> · {you(h.wrongBuzz)} buzzed wrong{cost}</span>;
    }
    if (s.buzzer) return <span className="lost">{you(s.buzzer)} left the table. It was <b>{name}</b></span>;
    return <span className="lost">Nobody buzzed. It was <b>{name}</b></span>;
  }
  return h.winner ? <><b>{name}</b> · {h.winner === me ? "you got it" : `${h.winner} got it`}</> : <span className="lost">Nobody got <b>{name}</b></span>;
}

/** Everyone at the table: score, and during a word who has it (never what it is). After a word, an everyone-competes table is sorted. */
function Roster({ s, me, gone, reveal }: { s: VPState; me: string; gone: string[]; reveal: boolean }) {
  const last = reveal ? s.history[s.history.length - 1] : undefined;
  const all = s.mode === "all";
  const rows = s.players.map((p, i) => ({ p, i, score: scoreOf(s, p) }));
  if (reveal && all) rows.sort((a, b) => b.score - a.score || a.i - b.i);
  return (
    <ol className="vp-roster" aria-label="Players">
      {rows.map(({ p, i, score }, rank) => {
        const has_ = all && !reveal && has(s.gotMs, p);
        const passed = all && !reveal && s.gaveUp.includes(p);
        const gain = last ? (all ? (has(last.gotMs, p) ? speedPoints(last.gotMs[p]!) : 0) : last.winner === p ? 1 : 0) : 0;
        const lost = last && last.wrongBuzz === p && lostPoint(last);
        // Voice: who buzzed, and during judging who has voted (never which way).
        const live = !reveal && !s.done;
        const buzzed = live && (s.phase === "speak" || s.phase === "judge") && s.buzzer === p;
        const voted = live && s.phase === "judge" && has(s.marks, p);
        const tag = gain > 0 ? `+${gain}` : lost ? "-1" : buzzed ? "BUZZ" : voted ? "VOTED" : has_ ? "GOT" : passed ? "PASS" : "";
        return (
          <li key={p} className={`${p === me ? "me" : ""} ${has_ || gain > 0 ? "got" : ""} ${buzzed ? "buzz" : ""} ${lost ? "lost" : ""} ${gone.includes(p) ? "is-gone" : ""}`}>
            <span className="rk" aria-hidden>{reveal && all ? rank + 1 : ""}</span>
            <Sprite sprite={playerSprite(i)} size={20} />
            <span className="name">{p}</span>
            <span className="tag">{tag}</span>
            <b className="pts">{fmt(score)}</b>
            <span className="sr-only">{gone.includes(p) ? "left" : buzzed ? "buzzed" : voted ? "voted" : has_ ? "has it" : passed ? "gave up" : ""}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Head to head: the sheet pulled between the two players' machines. */
function Pull({ s }: { s: VPState }) {
  return <PaperPull rope={s.rope} lead={DUEL_LEAD} left={s.players[0] ?? ""} right={s.players[1] ?? ""} sprites={[playerSprite(0), playerSprite(1)]} />;
}

/** The end: who won, the final table, and every word with who got it. */
export function VowelPlayResults({ setup, ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as VPState;
  const me = ctl.me;
  const won = winners(s);
  const duel = s.mode === "duel";
  const rows = s.players.map((p, i) => ({ p, i, score: scoreOf(s, p) })).sort((a, b) => b.score - a.score || a.i - b.i);
  const top = rows[0]?.score ?? 0;
  const teams = duel ? null : teamsFor(setup, s.players);
  const nobody = !duel && s.forfeit === null && top === 0;
  const headline = s.forfeit !== null ? `${won[0] ?? "Nobody"} wins` : nobody ? "Nobody scored" : won.length === 1 ? `${won[0]} wins` : duel ? "All square" : `Shared win: ${won.join(" and ")}`;
  const sub = s.forfeit !== null ? `${s.forfeit} left the table.` : nobody ? "Every key is still loose." : duel && won.length === 2 ? "Neither pulled ahead." : won.length === 1 && won[0] === me ? "That one is yours." : "";
  return (
    <PixelShell world="typewriter">
      <div className="vp-page">
        <header className="vp-sign">
          <div>
            <p className="eyebrow">{mixTitle(poolsOf(setup).map(topicTitle))}</p>
            <h1>{gameTitle(setup)}</h1>
          </div>
        </header>
        {duel ? <Pull s={s} /> : <div className="vp-stage"><Typewriter puzzle={String(top)} name={null} solved={false} /></div>}
        <section className="vp-ticket" aria-label="Final result">
          <h2>REPAIR TICKET</h2>
          <p className={`vp-headline ${won.length >= 1 && !nobody && me && won.includes(me) ? "mine" : ""}`} role="status">{headline}</p>
          {sub && <p className="px-note">{sub}</p>}
          <ol className="vp-board" aria-label="Final scores">
            {rows.map(({ p, i, score }, rank) => (
              <li key={p} className={`${won.includes(p) && !nobody ? "top" : ""} ${p === me ? "me" : ""} ${ctl.gone?.includes(p) ? "is-gone" : ""}`}>
                <span className="rk">{rank + 1}</span>
                <Sprite sprite={playerSprite(i)} size={20} />
                <span className="name">{p}</span>
                <b>{fmt(score)}{duel ? (score === 1 ? " word" : " words") : ""}</b>
              </li>
            ))}
          </ol>
          {teams && <TeamBoard points={Object.fromEntries(s.players.map((p) => [p, scoreOf(s, p)]))} teams={teams} me={me} />}
          {s.history.length > 0 && (
            <>
              <h2>THE WORDS</h2>
              <ul className="vp-words">
                {s.history.map((h, i) => {
                  const n = Object.keys(h.gotMs).length;
                  return (
                    <li key={i}>
                      <b className="font-normal">{h.name}</b><span className="puz">{h.puzzle}</span>
                      <span className={`who ${h.winner ? "" : "none"}`}>{h.winner ? (s.mode === "all" ? `${h.winner}${n > 1 ? ` +${n - 1} more` : ""}` : h.winner) : h.wrongBuzz ? `${h.wrongBuzz}, wrong` : "nobody"}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {onRematch && (
            <div className="vp-actions">
              <PixelButton variant="gold" onClick={onRematch}>Play again</PixelButton>
              <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
            </div>
          )}
        </section>
        {s.drinks && <WaterLine />}
        {s.drinks && s.mode !== "duel" && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
