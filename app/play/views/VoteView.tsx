"use client";

import { useEffect, useRef } from "react";
import * as V from "../../topicDraft/formats/vote";
import { deckOf, type VoteCard } from "../../topicDraft/party/decks";
import { PixelBox, PixelButton, PixelScore, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { WorldScene } from "../../components/pixel/WorldScene";
import { useSound } from "../../components/SoundProvider";
import { DrinkCard, PartyClock, playerSprite, VoteBooths, WaterLine } from "./partyBits";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const SCENE = "A small-town polling hall with a clerk, a ballot box and voting booths";

/** Vote games on a phone, in a small-town polling hall: vote on a ballot, guess how the others voted, then the booths open. */
export function VoteView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as V.VoteState;
  const deck = deckOf(s.deck);
  const card = s.cards[s.round]!;
  const me = ctl.me ?? "";
  const mine = s.votes[me];
  const reveal = s.phase === "reveal" ? s.history[s.history.length - 1]! : null;
  const voted = new Set(Object.keys(s.votes));
  const gain = reveal?.gained[me] ?? 0;

  useEffect(() => { window.scrollTo(0, 0); }, [s.round]); // each new card starts at the top of the screen
  const phaseRef = useRef(s.phase);
  useEffect(() => {
    if (s.phase === "reveal" && phaseRef.current !== "reveal") play(gain > 0 ? "win" : "reveal");
    phaseRef.current = s.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase]);

  const phaseMs = s.phase === "reveal" ? V.REVEAL_MS : s.phase === "guess" ? V.GUESS_MS : V.VOTE_MS;
  const open = reveal && s.showVotes ? reveal.votes : undefined;
  const count = (side: V.Side) => (open ? Object.values(open).filter((v) => v === side).length : 0);
  const total = open ? Math.max(1, Object.keys(open).length) : 1;
  const sides: { id: V.Side; label: string }[] = [{ id: "a", label: card.a }, { id: "b", label: card.b }];
  const status = s.phase !== "vote" ? null : mine ? `Locked in. Waiting for ${s.players.length - voted.size} more…` : s.showVotes ? "Pick a side. Nobody sees it until everyone votes." : "Pick a side. Show votes is off, so these booths never open.";

  return (
    <PixelShell world="hall">
      <div className="party-page">
        <header className="party-sign hall-sign">
          <div>
            <p className="eyebrow">{deck?.title}</p>
            <h1>Card {s.round + 1} of {s.cards.length}</h1>
          </div>
          <PartyClock deadline={s.phaseAt + phaseMs} offset={ctl.offset} total={phaseMs} />
        </header>

        <WorldScene world="hall" actors={[]} labels={false} track={false} caption={SCENE} flash={{ key: reveal && gain > 0 ? s.round + 1 : 0, good: true }} />

        <section className="hall-notice">
          <p className="q">{card.prompt}</p>
          <p className="how">{deck?.how}</p>
        </section>

        <div className="hall-ballots">
          {sides.map(({ id, label }) => {
            const n = count(id);
            const truth = !!reveal && card.answer === id;
            return (
              <button key={id} type="button" disabled={!!mine || s.phase !== "vote"} aria-pressed={mine === id} onClick={() => ctl.dispatch({ type: "vote", by: me, side: id })}
                className={`ballot ${mine === id ? "marked" : ""} ${mine && mine !== id && !reveal ? "faded" : ""} ${truth ? "true" : ""}`}>
                <span className="box" aria-hidden>{mine === id && <span>X</span>}</span>
                <span><span className="side">{id.toUpperCase()}</span>{label}{truth && <span className="truth">TRUE</span>}</span>
                {open && <span className="n">{n}</span>}
                {open && <span className="bar" style={{ width: `${(n / total) * 100}%` }} aria-hidden />}
              </button>
            );
          })}
        </div>

        {s.phase === "guess" && <GuessSheet s={s} me={me} card={card} onGuess={(target, side) => ctl.dispatch({ type: "guessVote", by: me, target, side })} />}

        {status && <p className="party-status">{status}</p>}

        <div className="hall-floor">
          {/* With Show votes off the booths stay shut for everyone: nobody can tell who did or did not vote. */}
          <VoteBooths players={s.players} voted={reveal && !s.showVotes ? new Set(s.players) : voted} reveal={open && Object.keys(open).length ? open : undefined} labels={{ a: card.a, b: card.b }} />
        </div>

        {reveal && (
          <PixelBox as="section" pad={false} className="hall-board">
            <h2>{card.answer ? (card.answer === "a" ? "It really happened." : "Made up!") : "Votes are in."}</h2>
            {card.note && <p className="px-note">{card.note}</p>}
            <p className="gain">{gain > 0 ? `+${gain} for you.` : "No point this time."}{reveal.nobodyGot.includes(me) ? " Nobody read you." : ""}</p>
            {s.showVotes ? <Reads players={s.players} reveal={reveal} /> : <p className="px-note">The booths stay shut. Only you can see your score.</p>}
            <PixelButton variant="gold" className="w-[calc(100%-8px)]" onClick={() => ctl.dispatch({ type: "next", by: me })}>Next card &gt;</PixelButton>
          </PixelBox>
        )}

        {s.showVotes && <div className="hall-score"><Scores points={s.points} me={me} /></div>}
        {s.drinks && <WaterLine />}
        {s.drinks && s.phase === "reveal" && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.seed} names={s.players} />}
      </div>
    </PixelShell>
  );
}

/** One row per person this player has to read, with A and B stamps. A guess cannot be changed. */
function GuessSheet({ s, me, card, onGuess }: { s: V.VoteState; me: string; card: VoteCard; onGuess: (target: string, side: V.Side) => void }) {
  const targets = s.targets[me] ?? [];
  const mine = s.guesses[me] ?? {};
  const made = targets.filter((t) => mine[t]).length;
  return (
    <section className="hall-sheet" aria-label="Guess how they voted">
      <div className="top">
        <h2>How did they vote?</h2>
        {targets.length > 0 && <p className="count" aria-live="polite">{made} of {targets.length} guessed</p>}
      </div>
      {targets.length === 0 ? <p className="sat">You sat this one out. The room is guessing.</p> : (
        <>
          <div className="key">
            <p><b>A</b>{card.a}</p>
            <p><b>B</b>{card.b}</p>
          </div>
          <ul className="hall-rows">
            {targets.map((t) => (
              <li key={t}>
                <Sprite sprite={playerSprite(s.players.indexOf(t))} size={24} />
                <span className="name">{t}</span>
                <span className="pick">
                  {(["a", "b"] as const).map((side) => (
                    <button key={side} type="button" disabled={!!mine[t]} aria-pressed={mine[t] === side} aria-label={`${t} voted ${side === "a" ? card.a : card.b}`} onClick={() => onGuess(t, side)}
                      className={`stamp ${mine[t] === side ? "on" : ""}`}>{side.toUpperCase()}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {made === targets.length && <p className="sat mt-2">All stamped. Waiting on the room…</p>}
        </>
      )}
    </section>
  );
}

/** Show votes on: how each person voted, who read them right, and what they scored. */
function Reads({ players, reveal }: { players: string[]; reveal: V.VoteHistory }) {
  return (
    <ul className="hall-reads" aria-label="Who guessed whom">
      {players.filter((p) => reveal.votes[p]).map((p) => {
        const reads = Object.entries(reveal.guesses).filter(([, g]) => g[p]);
        return (
          <li key={p}>
            <Sprite sprite={playerSprite(players.indexOf(p))} size={24} />
            <span className="name">{p}</span>
            <span className="gave">
              {(reveal.gained[p] ?? 0) > 0 && `+${reveal.gained[p]}`}
              <span className={`tag ${reveal.votes[p]}`}>{reveal.votes[p]!.toUpperCase()}</span>
            </span>
            <div className="by">
              {reads.map(([by, g]) => <span key={by} className={g[p] === reveal.votes[p] ? "hit" : "miss"}>{by}<span className="sr-only">{g[p] === reveal.votes[p] ? " read them" : " missed"}</span></span>)}
              {reveal.nobodyGot.includes(p) && <span className="none">Nobody read {p}</span>}
              {reads.length === 0 && <span className="none">No guesses</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Scores({ points, me }: { points: Record<string, number>; me: string }) {
  const ranked = Object.entries(points).sort((a, b) => b[1] - a[1]);
  return <PixelScore rows={ranked.map(([name, v]) => ({ name, value: String(v), active: name === me }))} />;
}

/** End of a vote game: the official count, and (Show votes on) every card with how the room split. */
export function VoteResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as V.VoteState;
  const ranked = Object.entries(s.points).sort((a, b) => b[1] - a[1]);
  const tied = ranked.length > 1 && ranked[0]![1] === ranked[1]![1];
  return (
    <PixelShell world="hall">
      <div className="party-page">
        <WorldScene world="hall" actors={[]} labels={false} track={false} caption={SCENE} />
        <div className="hall-sign hall-banner px-confetti">
          <p className="eyebrow">{deckOf(s.deck)?.title} · final scores</p>
          <h1>{tied ? "It's a tie!" : `${ranked[0]![0]} wins`}</h1>
        </div>
        <ol className="hall-ranks" aria-label="Final scores">
          {ranked.map(([p, v], i) => (
            <li key={p} className={v === ranked[0]![1] ? "first" : ""}>
              <span className="pos">{i + 1}</span>
              <Sprite sprite={playerSprite(s.players.indexOf(p))} size={24} />
              <span className="name">{p}</span>
              <b>{v}</b>
            </li>
          ))}
        </ol>
        {s.showVotes ? (
          <PixelBox as="section" pad={false} className="hall-board">
            <h2>How the room voted</h2>
            <ul className="hall-record">
              {s.cards.slice(0, s.history.length).map((c, i) => {
                const h = s.history[i]!;
                const a = Object.values(h.votes).filter((v) => v === "a").length, b = Object.values(h.votes).filter((v) => v === "b").length;
                return (
                  <li key={c.id}>
                    <p>{c.prompt}</p>
                    <p className="split"><span className={c.answer === "a" ? "right" : ""}>{c.a}: {a}</span> · <span className={c.answer === "b" ? "right" : ""}>{c.b}: {b}</span></p>
                    {c.note && <p className="note">{c.note}</p>}
                  </li>
                );
              })}
            </ul>
          </PixelBox>
        ) : (
          <p className="party-status">The booths stayed shut. Only the totals go on the record.</p>
        )}
        <div className="party-actions">
          {onRematch && <PixelButton variant="gold" onClick={onRematch}>New cards</PixelButton>}
          <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
        </div>
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.seed} names={s.players} />}
      </div>
    </PixelShell>
  );
}
