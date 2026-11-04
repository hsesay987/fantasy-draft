"use client";

import { useEffect, useRef, useState } from "react";
import * as IM from "../../topicDraft/formats/imposter";
import { CharacterAvatar } from "../../components/CharacterAvatar";
import { PixelBox, PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { WorldScene } from "../../components/pixel/WorldScene";
import type { Sprite as SpriteData } from "../../components/pixel/sprites";
import { useSound } from "../../components/SoundProvider";
import { DrinkCard, PartyClock, playerSprite, WaterLine } from "./partyBits";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const SCENE = "A moonlit ballroom with a candle chandelier and masked couples waltzing";

const MASK_COLORS = ["#ffd23f", "#f4f6ff", "#ff4d6d", "#f4f6ff", "#c084fc", "#ffd23f"];
/** A half-mask cut to sit on a player sprite, the same size so the two line up. */
const faceMask = (seat: number): SpriteData => ({
  rows: ["......F.", ".....F..", ".MMMMMM.", "MM0MM0MM", "..M..M..", "........", "........", "........", "........", "........"],
  pal: { M: MASK_COLORS[seat % MASK_COLORS.length]!, 0: "#0d0414", F: "#e8c26a" },
});
const VENETIAN: SpriteData = {
  rows: ["GG............GG", "GWGG........GGWG", "GWWWGGGGGGGGWWWG", "GWWWWWWWWWWWWWWG", "GWW00WWWWWW00WWG", ".GW000WWWW000WG.", ".GWWWWWGGWWWWWG.", "..GGWSG..GSWGG..", "....GG....GG...."],
  pal: { G: "#e8c26a", W: "#b3203f", S: "#7a1230", 0: "#0d0414" },
};
const ENVELOPE: SpriteData = {
  rows: ["XXXXXXXXXXXXXXXX", "XWWWWWWWWWWWWWWX", "XXWWWWWWWWWWWWXX", "XDXWWWWWWWWWWXDX", "XDDXWWWWWWWWXDDX", "XDDDXWWRRWWXDDDX", "XDDDDXRRRRXDDDDX", "XDDDXDRRRRDXDDDX", "XDDXDDDRRDDDXDDX", "XDXDDDDDDDDDDXDX", "XXDDDDDDDDDDDDXX", "XXXXXXXXXXXXXXXX"],
  pal: { X: "#2b1420", W: "#fff7e6", D: "#e4d6b4", R: "#b3203f" },
};

/** A player at the ball: their usual sprite wearing a mask. */
function MaskedPlayer({ seat, size = 24 }: { seat: number; size?: number }) {
  return (
    <span className="masked">
      <Sprite sprite={playerSprite(seat)} size={size} />
      <Sprite sprite={faceMask(seat)} size={size} className="mask" />
    </span>
  );
}

/**
 * Imposter on a phone, at a masked ball. Your secret card is a sealed invitation so nobody can read it over your
 * shoulder. Clues build up on the dance card, then everyone votes. The imposter gets a "name the secret" button.
 */
export function ImposterView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as IM.ImposterState;
  const me = ctl.me ?? "";
  const amImposter = s.imposter === me;
  const [peek, setPeek] = useState(false);
  const [text, setText] = useState("");
  const [guessing, setGuessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const turn = IM.turnPlayer(s);
  const myTurn = turn === me;
  const secretItem = ctl.pool.find((i) => i.id === s.secretId);
  const seat = (p: string) => Math.max(0, s.players.indexOf(p));

  useEffect(() => { window.scrollTo(0, 0); }, []);
  const clueCount = useRef(s.clues.length);
  useEffect(() => {
    if (s.clues.length > clueCount.current) play("click");
    clueCount.current = s.clues.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.clues.length]);
  useEffect(() => {
    if (myTurn) play("reveal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    if (!amImposter && IM.givesAway(t, s.secret)) return setError("Too obvious: that gives the secret away.");
    if (s.clues.some((c) => c.text.toLowerCase() === t.toLowerCase())) return setError("Someone already said that.");
    setError(null);
    ctl.dispatch({ type: "clue", by: me, text: t });
    setText("");
  };

  const round = Math.min(s.rounds, Math.floor(s.clues.length / s.order.length) + 1);
  const phaseMs = s.phase === "clue" ? IM.CLUE_MS : s.phase === "vote" ? IM.VOTE_MS : IM.GUESS_MS;

  return (
    <PixelShell world="ball">
      <div className="party-page">
        <header className="party-sign ball-sign">
          <div>
            <p className="eyebrow">Imposter · {s.topic}</p>
            <h1>{s.phase === "clue" ? `Round ${round} of ${s.rounds}` : s.phase === "vote" ? "Who's the imposter?" : "Last chance"}</h1>
          </div>
          <PartyClock deadline={s.phaseAt + phaseMs} offset={ctl.offset} total={phaseMs} />
        </header>

        <WorldScene world="ball" actors={[]} labels={false} track={false} caption={SCENE} />

        {/* The secret card: tap to show, tap again to hide. It looks the same for everyone until it is opened. */}
        <button type="button" onClick={() => setPeek((p) => !p)} aria-pressed={peek} className={`ball-card ${peek && amImposter ? "mask-card" : ""}`}>
          {peek ? (
            amImposter ? (
              <>
                <span className="ball-mask-idle"><Sprite sprite={VENETIAN} size={64} /></span>
                <span className="txt"><b>You&apos;re the imposter</b><span className="sub">Blend in. Topic: {s.topic}.{s.ending === "guess" ? " Name the secret to win." : ""} Tap to hide.</span></span>
              </>
            ) : (
              <>
                <span className="frame"><CharacterAvatar name={s.secret} query={secretItem?.q} size={56} /></span>
                <span className="txt"><b>{s.secret}</b><span className="sub">The secret. Don&apos;t say it. Tap to hide.</span></span>
              </>
            )
          ) : (
            <>
              <span className="seal"><Sprite sprite={ENVELOPE} size={64} /></span>
              <span className="txt"><b>Tap to see your card</b><span className="sub">Keep your screen hidden</span></span>
            </>
          )}
        </button>

        <section className="ball-dance" aria-label="Clues">
          <h2>Clues</h2>
          {s.clues.length === 0 ? <p className="none">No clues yet. {turn} goes first.</p> : (
            <ol className="ball-clues">
              {s.clues.map((c, i) => (
                <li key={i}>
                  <MaskedPlayer seat={seat(c.by)} size={20} />
                  <span className="who">{c.by}</span>
                  <span className="said">{c.text}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <div className="ball-floor">
          <ul aria-label="Turn order">
            {s.order.map((p) => (
              <li key={p} className={p === turn ? "turn" : ""} aria-current={p === turn ? "true" : undefined}>
                <MaskedPlayer seat={seat(p)} />
                <span className="name">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {s.phase === "clue" && (
          myTurn ? (
            <div>
              <div className="px-term ball-term">
                <div className="in">
                  <span aria-hidden>&gt;</span>
                  <input maxLength={40} autoFocus placeholder="One short clue" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Your clue" enterKeyHint="send" />
                </div>
                <PixelButton variant="gold" onClick={send} disabled={!text.trim()} aria-label="Send clue">Send</PixelButton>
              </div>
              {error && <p role="alert" className="ball-err">{error}</p>}
            </div>
          ) : (
            <p className="ball-wait">Waiting for {turn}&apos;s clue…</p>
          )
        )}

        {s.phase === "vote" && (
          <PixelBox as="section" pad={false} className="ball-panel">
            <div className="top">
              <h2>{s.votes[me] ? "Vote locked in" : "Vote for the imposter"}</h2>
              <p className="hint">{Object.keys(s.votes).length} of {s.players.length} voted</p>
            </div>
            <div className="ball-grid">
              {s.players.filter((p) => p !== me).map((p) => (
                <button key={p} type="button" disabled={!!s.votes[me]} aria-pressed={s.votes[me] === p} onClick={() => ctl.dispatch({ type: "accuse", by: me, target: p })} className={`ball-opt ${s.votes[me] === p ? "on" : ""}`}>
                  <MaskedPlayer seat={seat(p)} />
                  <span className="name">{p}</span>
                </button>
              ))}
            </div>
          </PixelBox>
        )}

        {s.phase === "guess" && (
          <p className="ball-alert">{amImposter ? "You were caught! Name the secret to steal the win." : `${s.imposter || "The imposter"} was caught and gets one guess at the secret…`}</p>
        )}

        {amImposter && (s.phase === "guess" || (s.phase === "clue" && s.ending === "guess")) && (
          guessing || s.phase === "guess" ? (
            <PixelBox as="section" pad={false} className="ball-panel">
              <div className="top">
                <h2>Name the secret</h2>
                <p className="hint">Right wins it for you. Wrong loses it.</p>
              </div>
              <div className="ball-grid">
                {s.options.map((o) => (
                  <button key={o} type="button" className="ball-opt" onClick={() => ctl.dispatch({ type: "guess", by: me, name: o })}><span>{o}</span></button>
                ))}
              </div>
              {s.phase === "clue" && <PixelButton variant="alt" className="mt-2 w-[calc(100%-8px)]" onClick={() => setGuessing(false)}>Not yet</PixelButton>}
            </PixelBox>
          ) : (
            <PixelButton variant="gold" className="w-[calc(100%-8px)]" onClick={() => setGuessing(true)}>I know the secret</PixelButton>
          )
        )}

        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} names={s.players} />}
      </div>
    </PixelShell>
  );
}

/** Final screen, masks off: who the imposter was, the secret, and how it ended. */
export function ImposterResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as IM.ImposterState;
  const item = ctl.pool.find((i) => i.id === s.secretId);
  const seat = (p: string) => Math.max(0, s.players.indexOf(p));
  const how = s.guess
    ? s.guess === s.secret ? `${s.imposter} named the secret.` : `${s.imposter} guessed ${s.guess}. Wrong!`
    : s.caught ? `${s.imposter} was voted out.` : `The vote missed. ${s.imposter} got away.`;
  return (
    <PixelShell world="ball">
      <div className="party-page">
        <WorldScene world="ball" actors={[]} labels={false} track={false} caption={SCENE} />
        <div className="party-sign ball-sign px-confetti" style={{ display: "block", textAlign: "center" }}>
          <p className="eyebrow">Imposter · {s.topic}</p>
          <h1>{s.winner === "imposter" ? "The imposter wins" : "The crew wins"}</h1>
          <p className="m-0 mt-1">{how}</p>
        </div>
        <PixelBox as="section" pad={false} className="ball-reveal">
          <span className="ball-unmask">
            <Sprite sprite={playerSprite(seat(s.imposter))} size={56} />
            <span className="fallen"><Sprite sprite={VENETIAN} size={36} /></span>
          </span>
          <div className="txt">
            <p className="lab">Under the mask</p>
            <p className="big">{s.imposter}</p>
          </div>
        </PixelBox>
        <PixelBox as="section" pad={false} className="ball-reveal">
          <span className="frame"><CharacterAvatar name={s.secret} query={item?.q} size={64} /></span>
          <div className="txt">
            <p className="lab">The secret was</p>
            <p className="big">{s.secret}</p>
          </div>
        </PixelBox>
        <PixelBox as="section" pad={false} className="ball-panel">
          <div className="top"><h2>Votes</h2></div>
          <ul className="ball-votes">
            {Object.entries(s.votes).map(([by, t]) => (
              <li key={by}>
                <MaskedPlayer seat={seat(by)} />
                <span className="name">{by}</span>
                <span className={`t ${t === s.imposter ? "hit" : ""}`}>{t}</span>
              </li>
            ))}
            {!Object.keys(s.votes).length && <li><span className="name" style={{ gridColumn: "1 / -1", maxWidth: "none" }}>It ended before the vote.</span></li>}
          </ul>
        </PixelBox>
        <div className="party-actions">
          {onRematch && <PixelButton variant="gold" onClick={onRematch}>Play again</PixelButton>}
          <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
        </div>
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} names={s.players} />}
      </div>
    </PixelShell>
  );
}
