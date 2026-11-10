"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as IS from "../../topicDraft/formats/insync";
import { insyncDeckOf } from "../../topicDraft/party/insyncDecks";
import { PixelBox, PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { WorldScene } from "../../components/pixel/WorldScene";
import { useSound } from "../../components/SoundProvider";
import { canMoveOn, DrinkCard, LeaveGame, PartyClock, playerSprite, WaitingForHost, WaterLine } from "./partyBits";
import { SignalCanvas } from "./SignalCanvas";
import { createThrottle, locksNeeded, MARKER_HOLD_MS, REVEAL_OUTCOME_MS, shownMarker, syncGameKey, verdictFor, type LocalMarker, type Points } from "./signal";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const SCENE = "A late-night radio station: a host at the desk, tape reels turning, and a tower blinking over the city";
const MOVE_EVERY_MS = 200;

/** In-Sync on a phone, in a late-night radio station: one host gives a clue, the rest tune one shared signal to it. */
export function InSyncView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as IS.InSyncState;
  const me = ctl.me ?? "";
  const pair = s.pairs[s.round]!;
  const host = IS.giver(s);
  // Watching (the screen host): no mic, no marker, no lock.
  const seated = s.players.includes(me);
  const isHost = seated && me === host;
  const canTune = s.phase === "tune" && !isHost && seated;
  const last = s.phase === "reveal" ? s.history[s.history.length - 1]! : null;
  const points = (last ? last.points : null) as Points | null;

  // The marker: sent at most once per 200ms, with this seat's finger shown straight away.
  const [local, setLocal] = useState<LocalMarker | null>(null);
  const dispatch = useRef(ctl.dispatch);
  const meRef = useRef(me);
  useEffect(() => {
    dispatch.current = ctl.dispatch;
    meRef.current = me;
  });
  const mover = useMemo(() => createThrottle<number>((pos) => dispatch.current({ type: "move", by: meRef.current, pos }), MOVE_EVERY_MS), []);
  useEffect(() => () => mover.cancel(), [mover]);

  // A new round or phase starts clean: nothing waiting to send, and the marker is the server's again.
  useEffect(() => {
    mover.cancel();
    setLocal(null);
  }, [mover, s.round, s.phase]);

  // After letting go, hold the position until the server agrees, or give way once the hold runs out.
  useEffect(() => {
    if (!local || local.dragging) return;
    if (s.marker === local.pos) return setLocal(null);
    const id = setTimeout(() => setLocal(null), MARKER_HOLD_MS);
    return () => clearTimeout(id);
  }, [local, s.marker]);

  const marker = canTune ? shownMarker(s.marker, local, Date.now()) : s.marker;

  useEffect(() => { window.scrollTo(0, 0); }, [s.round]); // each new round starts at the top of the screen

  // The result stays off screen until the animation lands, so no text or sip card gives it away first.
  const [landed, setLanded] = useState(false);
  const phaseRef = useRef(s.phase);
  useEffect(() => {
    const was = phaseRef.current;
    phaseRef.current = s.phase;
    if (s.phase === "tune" && was !== "tune") play("pick");
    if (s.phase !== "reveal" || points == null) return setLanded(false);
    if (was !== "reveal") play("reveal");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => {
      setLanded(true);
      if (was !== "reveal") play(points === 4 ? "win" : points === 0 ? "lose" : "pick");
    }, still ? 0 : REVEAL_OUTCOME_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);

  // A move takes back every lock: say so, because otherwise a lamp just goes out with no reason given.
  const [cleared, setCleared] = useState(false);
  const locksRef = useRef(s.locks.length);
  useEffect(() => {
    const had = locksRef.current;
    locksRef.current = s.locks.length;
    if (s.phase !== "tune") return setCleared(false);
    if (s.locks.length > 0) return setCleared(false);
    if (had > 0) setCleared(true);
  }, [s.locks.length, s.phase]);

  // Only the guessers still here count, the same as the server's majority.
  const gone = ctl.gone ?? [];
  const guessers = s.players.filter((p) => p !== host && !gone.includes(p));
  const need = locksNeeded(guessers.length);
  const have = s.locks.filter((p) => guessers.includes(p)).length;
  const lockedByMe = s.locks.includes(me);
  const phaseMs = s.phase === "reveal" ? IS.REVEAL_MS : s.phase === "tune" ? IS.TUNE_MS : IS.CLUE_MS;
  const deck = insyncDeckOf(s.deck);
  const held = last && !landed; // this round's points wait for the animation too
  const shownScore = held ? s.score - last.points : s.score;
  const shownMax = held ? s.maxScore - 4 : s.maxScore;

  const lock = () => {
    play("click");
    mover.settle(() => dispatch.current({ type: "lock", by: meRef.current })); // after any waiting move, which would take the lock back
  };

  return (
    <PixelShell world="studio">
      <div className="party-page">
        <header className="party-sign sync-sign">
          <div>
            <p className="eyebrow">In-Sync · {deck?.title}</p>
            <h1>Round {s.round + 1} of {s.pairs.length}</h1>
          </div>
          <PartyClock deadline={s.phaseAt + phaseMs} offset={ctl.offset} total={phaseMs} />
        </header>

        {/* Once the signal is live the scope and Lock must fit on a phone without scrolling, so the booth moves below them. */}
        <div className={s.phase === "clue" ? "" : "sync-scene-low"}>
          <WorldScene world="studio" actors={[]} labels={false} track={false} caption={SCENE} />
        </div>

        <section className="sync-air" aria-live="polite">
          <span className="who"><Sprite sprite={playerSprite(s.players.indexOf(host))} size={24} /><span><b>On air</b>{isHost ? "You" : host}</span></span>
          {s.phase === "clue"
            ? <p className="ticker waiting">{isHost ? "Your mic is live. Give one clue." : `${host} is thinking of a clue…`}</p>
            : <p className="ticker">{s.clue}</p>}
        </section>

        {isHost && s.phase === "clue" && <ClueDesk onSend={(text) => ctl.dispatch({ type: "clue", by: me, text })} />}

        <SignalCanvas marker={marker} target={s.target} phase={s.phase} points={points} left={pair.left} right={pair.right}
          onMove={canTune ? (pos) => { setLocal({ pos, at: Date.now(), dragging: true }); mover.push(pos); } : undefined}
          onRelease={() => setLocal((l) => (l ? { ...l, at: Date.now(), dragging: false } : l))}
          overlay={<>
            {s.phase === "clue" && !isHost && <span className="sync-standby">Standby</span>}
            {points != null && <span key={s.round} className={`sync-verdict p${points}`}><b>{points > 0 ? `+${points}` : "0"}</b>{verdictFor(points)}</span>}
          </>} />

        {canTune && (
          <div className="sync-lock">
            <p className="sync-hint">{cleared ? "The signal moved, so the locks went out. Lock again." : "Drag the signal. Talk it over. Anyone can move it."}</p>
            <PixelButton variant="gold" className="sync-lock-btn" disabled={lockedByMe} aria-pressed={lockedByMe} onClick={lock}>{lockedByMe ? "Locked" : "Lock it in"}</PixelButton>
            <LockLamps have={have} need={need} />
          </div>
        )}
        {!canTune && !isHost && s.phase === "tune" && (
          <div className="sync-lock">
            <p className="sync-hint">The room is tuning the signal on their phones.</p>
            <LockLamps have={have} need={need} />
          </div>
        )}
        {isHost && s.phase === "tune" && (
          <div className="sync-lock">
            <p className="sync-hint">No more clues. Watch them tune to your green flag.</p>
            <LockLamps have={have} need={need} />
          </div>
        )}

        {last && landed && (
          <PixelBox as="section" pad={false} className="sync-log">
            <h2 role="status" className={last.points === 0 ? "miss" : ""}>{resultLine(last.points as Points)}</h2>
            <p className="line">Signal at <b>{last.marker}</b>. Target at <b>{last.target}</b>.</p>
            {canMoveOn(ctl)
              ? <PixelButton variant="gold" className="w-[calc(100%-8px)]" onClick={() => ctl.dispatch({ type: "next", by: me })}>{s.round + 1 >= s.pairs.length ? "Final score >" : "Next round >"}</PixelButton>
              : <WaitingForHost ctl={ctl} />}
          </PixelBox>
        )}

        <Crew players={s.players} host={host} locks={s.locks} me={me} gone={gone} />
        <p className="sync-total">Group score <b>{shownScore}</b>{shownMax > 0 && <> of {shownMax}</>}</p>

        {s.drinks && <WaterLine />}
        {s.drinks && landed && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={syncGameKey(s.pairs)} names={s.players} />}
        {ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

const resultLine = (points: Points) => (points === 4 ? "Perfect signal!" : points === 3 ? "Coming in clear." : points === 2 ? "You can just about hear it." : "Nothing but static.");

/** The clue giver's mic: one clue, then the line is open to the room. */
function ClueDesk({ onSend }: { onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const ready = text.trim().length > 0;
  const send = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onSend(text);
  };
  return (
    <form className="sync-desk" onSubmit={send}>
      <label htmlFor="sync-clue">One clue for the green flag</label>
      <div className="row">
        <input id="sync-clue" autoComplete="off" maxLength={IS.CLUE_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your clue" />
        <span className="count" aria-hidden>{text.length}/{IS.CLUE_MAX}</span>
      </div>
      <PixelButton type="submit" variant="gold" disabled={!ready}>Go on air</PixelButton>
    </form>
  );
}

function LockLamps({ have, need }: { have: number; need: number }) {
  return (
    <p className="sync-lamps" role="status" aria-label={`${have} of ${need} locks`}>
      <span aria-hidden className="lamps">{Array.from({ length: need }, (_, i) => <i key={i} className={i < have ? "on" : ""} />)}</span>
      <span>{have} of {need} locked</span>
    </p>
  );
}

function Crew({ players, host, locks, me, gone }: { players: string[]; host: string; locks: string[]; me: string; gone: string[] }) {
  return (
    <ul className="sync-crew" aria-label="Players">
      {players.map((p, i) => (
        <li key={p} className={`${p === host ? "host" : ""} ${locks.includes(p) && !gone.includes(p) ? "locked" : ""} ${p === me ? "me" : ""} ${gone.includes(p) ? "is-gone" : ""}`}>
          <Sprite sprite={playerSprite(i)} size={24} />
          <span className="name">{p}</span>
          {gone.includes(p) ? <span className="tag">Left</span> : p === host ? <span className="tag">On air</span> : locks.includes(p) ? <span className="tag lock">Locked</span> : null}
        </li>
      ))}
    </ul>
  );
}

/** End of the show: one group score, a playful rank, and the log of every round. */
export function InSyncResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as IS.InSyncState;
  const deck = insyncDeckOf(s.deck);
  const rank = IS.rankFor(s.score, s.maxScore);
  const top = s.maxScore > 0 && s.score / s.maxScore >= 0.7;
  return (
    <PixelShell world="studio">
      <div className="party-page">
        <WorldScene world="studio" actors={[]} labels={false} track={false} caption={SCENE} />
        <div className={`sync-sign sync-banner ${top ? "px-confetti" : ""}`}>
          <p className="eyebrow">{deck?.title} · end of the show</p>
          <h1>{rank}</h1>
          <p className="big"><b>{s.score}</b> of {s.maxScore}</p>
          <p className="note">One score for the whole room.</p>
        </div>
        <PixelBox as="section" pad={false} className="sync-log">
          <h2>Tonight&apos;s log</h2>
          <ol className="sync-rounds">
            {s.history.map((h, i) => (
              <li key={h.pair.id} className={h.skipped ? "skipped" : `p${h.points}`}>
                <span className="pts">{h.skipped ? "-" : `+${h.points}`}</span>
                <div className="body">
                  <p className="pair">{h.pair.left} / {h.pair.right}</p>
                  {h.skipped ? <p className="clue">{h.giver} gave no clue, so the round was skipped.</p> : <p className="clue"><Sprite sprite={playerSprite(s.players.indexOf(h.giver))} size={14} /> {h.giver}: &ldquo;{h.clue}&rdquo;</p>}
                  {!h.skipped && (
                    <span className="mini" role="img" aria-label={`Round ${i + 1}: signal at ${h.marker}, target at ${h.target}. ${verdictFor(h.points as Points)}.`}>
                      <i className="t" style={{ left: `${h.target}%` }} />
                      <i className="m" style={{ left: `${h.marker}%` }} />
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </PixelBox>
        {onRematch && (
          <div className="party-actions">
            <PixelButton variant="gold" onClick={onRematch}>New pairs</PixelButton>
            <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
          </div>
        )}
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={syncGameKey(s.pairs)} names={s.players} />}
      </div>
    </PixelShell>
  );
}
