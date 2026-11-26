"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import * as IS from "../../topicDraft/formats/insync";
import { insyncDeckOf } from "../../topicDraft/party/insyncDecks";
import { PixelBox, PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { WorldScene } from "../../components/pixel/WorldScene";
import { useSound } from "../../components/SoundProvider";
import { canMoveOn, DrinkCard, LeaveGame, PartyActions, PartyClock, playerSprite, WaitingForHost, WaterLine } from "./partyBits";
import { SignalCanvas } from "./SignalCanvas";
import { createThrottle, MARKER_HOLD_MS, REVEAL_OUTCOME_MS, shownMarker, syncGameKey, verdictFor, type LocalMarker, type Points } from "./signal";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const SCENE = "A late-night radio station: a host at the desk, tape reels turning, and a tower blinking over the city";
const MOVE_EVERY_MS = 200;

/** In-Sync on a phone, in a late-night radio station: one host gives a clue, everyone else tunes their own dial to it. */
export function InSyncView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as IS.InSyncState;
  const me = ctl.me ?? "";
  const pair = s.pairs[s.round]!;
  const host = IS.giver(s);
  // Watching (the screen host): no mic, no dial, no lock. A guesser has a dial only while the round is being tuned.
  const seated = s.players.includes(me);
  const isHost = seated && me === host;
  const canTune = s.phase === "tune" && me in s.markers;
  const myDial = s.markers[me];
  const last = s.phase === "reveal" ? s.history[s.history.length - 1]! : null;
  // Per-player games: a guesser's needle and verdict are their own dial; everyone else sees the closest dial.
  const perPlayer = !!s.points;
  const best = last && perPlayer ? IS.closest(last.markers ?? {}, last.target) : null;
  const ownLast = last?.markers?.[me];
  const focus = perPlayer && last ? (ownLast != null ? ownLast : best?.pos ?? null) : null;
  const points = (last ? (perPlayer ? (focus != null ? IS.bandPoints(last.target, focus) : 0) : last.points) : null) as Points | null;

  // My dial: sent at most once per 200ms, with this seat's finger shown straight away.
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
    if (myDial === local.pos) return setLocal(null);
    const id = setTimeout(() => setLocal(null), MARKER_HOLD_MS);
    return () => clearTimeout(id);
  }, [local, myDial]);

  // While tuning, a guesser's needle is their own dial; everyone else watches the room's average. The other dials show faintly.
  const marker = canTune ? shownMarker(myDial ?? 50, local, Date.now()) : focus ?? s.marker;
  const focusName = perPlayer && last ? (ownLast != null ? me : best?.player) : undefined;
  const dials = last
    ? Object.entries(last.markers ?? {}).filter(([p]) => !perPlayer || p !== focusName).map(([, v]) => v)
    : Object.entries(s.markers).filter(([p]) => !canTune || p !== me).map(([, v]) => v);
  const mineLast = last?.markers?.[me];

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

  // Every guesser still here locks before the reveal, the same as the server.
  const gone = ctl.gone ?? [];
  const guessers = s.players.filter((p) => p !== host && !gone.includes(p));
  const need = guessers.length;
  const have = s.locks.filter((p) => guessers.includes(p)).length;
  const lockedByMe = s.locks.includes(me);
  const phaseMs = s.phase === "reveal" ? IS.REVEAL_MS : s.phase === "tune" ? IS.TUNE_MS : IS.CLUE_MS;
  const deck = insyncDeckOf(s.deck);
  const held = last && !landed; // this round's points wait for the animation too
  const shownScore = held ? s.score - last.points : s.score;
  const shownMax = held ? s.maxScore - 4 : s.maxScore;

  const lock = () => {
    play("click");
    mover.settle(() => dispatch.current({ type: "lock", by: meRef.current })); // after any waiting move, which would take my lock back
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

        <SignalCanvas marker={marker} dials={dials} needle={!(perPlayer && !canTune && s.phase === "tune")} target={s.target} phase={s.phase} points={points} left={pair.left} right={pair.right}
          onMove={canTune ? (pos) => { setLocal({ pos, at: Date.now(), dragging: true }); mover.push(pos); } : undefined}
          onRelease={() => setLocal((l) => (l ? { ...l, at: Date.now(), dragging: false } : l))}
          overlay={<>
            {s.phase === "clue" && !isHost && <span className="sync-standby">Standby</span>}
            {points != null && <span key={s.round} className={`sync-verdict p${points}`}><b>{points > 0 ? `+${points}` : "0"}</b>{verdictFor(points)}</span>}
          </>} />

        {canTune && (
          <div className="sync-lock">
            <p className="sync-hint">{lockedByMe ? "Locked. Move your dial to change your mind." : perPlayer ? "Drag your own dial. You score by how close it lands." : "Drag your own dial. Talk it over: the room's signal is where all your dials average out."}</p>
            <PixelButton variant="gold" className="sync-lock-btn" disabled={lockedByMe} aria-pressed={lockedByMe} onClick={lock}>{lockedByMe ? "Locked" : "Lock it in"}</PixelButton>
            <LockLamps have={have} need={need} />
          </div>
        )}
        {!canTune && !isHost && s.phase === "tune" && (
          <div className="sync-lock">
            <p className="sync-hint">The room is tuning their dials on their phones.</p>
            <LockLamps have={have} need={need} />
          </div>
        )}
        {isHost && s.phase === "tune" && (
          <div className="sync-lock">
            <p className="sync-hint">{perPlayer ? "No more clues. Watch their dials hunt for your green flag. You score their average." : "No more clues. The bright needle is where their dials average out. Watch it find your green flag."}</p>
            <LockLamps have={have} need={need} />
          </div>
        )}

        {last && landed && (
          <PixelBox as="section" pad={false} className="sync-log">
            {perPlayer && last.gained ? (
              <>
                <h2 role="status" className={points === 0 ? "miss" : ""}>{resultLine(points ?? 0)}</h2>
                <p className="line">Target at <b>{last.target}</b>.{best && <> Closest: <b>{best.player}</b> at <b>{best.pos}</b>.</>}</p>
                {isHost && <p className="line">Your clue scored <b>+{last.gained[me] ?? 0}</b>, the average of their dials.</p>}
                <ul className="sync-gains" aria-label="Points this round">
                  {Object.entries(last.gained).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
                    <li key={p} className={`${p === me ? "me" : ""} p${p === last.giver ? "g" : n}`}>
                      <span className="name">{p}{p === last.giver ? " (clue)" : ""}</span>
                      {p !== last.giver && <span className="pos">{last.markers[p]}</span>}
                      <b>+{n}</b>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h2 role="status" className={last.points === 0 ? "miss" : ""}>{resultLine(last.points as Points)}</h2>
                <p className="line">The room&apos;s signal at <b>{last.marker}</b>. Target at <b>{last.target}</b>.</p>
                {mineLast != null && <p className="line">Your dial at <b>{mineLast}</b>: {verdictFor(IS.bandPoints(last.target, mineLast)).toLowerCase()}.</p>}
              </>
            )}
            {canMoveOn(ctl)
              ? <PixelButton variant="gold" className="w-[calc(100%-8px)]" onClick={() => ctl.dispatch({ type: "next", by: me })}>{s.round + 1 >= s.pairs.length ? "Final score >" : "Next round >"}</PixelButton>
              : <WaitingForHost ctl={ctl} />}
          </PixelBox>
        )}

        <Crew players={s.players} host={host} locks={s.locks} me={me} gone={gone} />
        {perPlayer
          ? <Standings points={s.points!} gained={held ? last?.gained : undefined} players={s.players} me={me} />
          : <p className="sync-total">Group score <b>{shownScore}</b>{shownMax > 0 && <> of {shownMax}</>}</p>}

        {s.drinks && <WaterLine />}
        {s.drinks && landed && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={syncGameKey(s.pairs)} names={s.players} />}
        {ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/** Running points, with this round's gains held back until the reveal animation lands. */
function Standings({ points, gained, players, me }: { points: Record<string, number>; gained?: Record<string, number>; players: string[]; me: string }) {
  const shown = players.map((p) => ({ p, n: (points[p] ?? 0) - (gained?.[p] ?? 0), seat: players.indexOf(p) })).sort((a, b) => b.n - a.n);
  return (
    <ol className="sync-standings" aria-label="Scores">
      {shown.map(({ p, n, seat }) => (
        <li key={p} className={p === me ? "me" : ""}>
          <Sprite sprite={playerSprite(seat)} size={18} />
          <span className="name">{p}</span>
          <b>{n}</b>
        </li>
      ))}
    </ol>
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
export function InSyncResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain?: () => void; onRematch?: () => void }) {
  const s = ctl.state as IS.InSyncState;
  const deck = insyncDeckOf(s.deck);
  const rank = IS.rankFor(s.score, s.maxScore);
  const top = s.maxScore > 0 && s.score / s.maxScore >= 0.7;
  const pts = s.points;
  const ranked = pts ? [...s.players].sort((a, b) => (pts[b] ?? 0) - (pts[a] ?? 0)) : [];
  const winners = pts && ranked.length ? ranked.filter((p) => pts[p] === pts[ranked[0]!]) : [];
  return (
    <PixelShell world="studio">
      <div className="party-page">
        <WorldScene world="studio" actors={[]} labels={false} track={false} caption={SCENE} />
        {pts ? (
          <div className="sync-sign sync-banner px-confetti">
            <p className="eyebrow">{deck?.title} · end of the show</p>
            <h1>{winners.length === 1 ? `${winners[0]} wins` : `${winners.join(" & ")} tie`}</h1>
            <p className="big"><b>{pts[ranked[0]!] ?? 0}</b> points</p>
          </div>
        ) : (
          <div className={`sync-sign sync-banner ${top ? "px-confetti" : ""}`}>
            <p className="eyebrow">{deck?.title} · end of the show</p>
            <h1>{rank}</h1>
            <p className="big"><b>{s.score}</b> of {s.maxScore}</p>
            <p className="note">One score for the whole room.</p>
          </div>
        )}
        {pts && (
          <PixelBox as="section" pad={false} className="sync-log">
            <h2>Final scores</h2>
            <Standings points={pts} players={s.players} me={ctl.me ?? ""} />
          </PixelBox>
        )}
        <PixelBox as="section" pad={false} className="sync-log">
          <h2>Tonight&apos;s log</h2>
          <ol className="sync-rounds">
            {s.history.map((h, i) => (
              <li key={h.pair.id} className={h.skipped ? "skipped" : `p${h.points}`}>
                <span className="pts">{h.skipped ? "-" : h.gained ? `+${Math.max(0, ...Object.entries(h.gained).filter(([p]) => p !== h.giver).map(([, n]) => n))}` : `+${h.points}`}</span>
                <div className="body">
                  <p className="pair">{h.pair.left} / {h.pair.right}</p>
                  {h.skipped ? <p className="clue">{h.giver} gave no clue, so the round was skipped.</p> : <p className="clue"><Sprite sprite={playerSprite(s.players.indexOf(h.giver))} size={14} /> {h.giver}: &ldquo;{h.clue}&rdquo;</p>}
                  {!h.skipped && (
                    <span className="mini" role="img" aria-label={`Round ${i + 1}: the room's signal at ${h.marker}, target at ${h.target}. ${verdictFor(h.points as Points)}.`}>
                      <i className="t" style={{ left: `${h.target}%` }} />
                      {Object.entries(h.markers ?? {}).map(([p, v]) => <i key={p} className="d" style={{ left: `${v}%` }} />)}
                      {!h.gained && <i className="m" style={{ left: `${h.marker}%` }} />}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </PixelBox>
        <PartyActions onAgain={onAgain} onRematch={onRematch} again="New pairs" />
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={syncGameKey(s.pairs)} names={s.players} />}
      </div>
    </PixelShell>
  );
}
