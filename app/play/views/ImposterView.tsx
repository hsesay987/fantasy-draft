"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Send, VenetianMask } from "lucide-react";
import * as IM from "../../topicDraft/formats/imposter";
import { Button, Panel, PageShell, controlCls } from "../../components/ui";
import { CharacterAvatar } from "../../components/CharacterAvatar";
import { useSound } from "../../components/SoundProvider";
import { PartyClock, PlayerDots } from "./partyBits";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/**
 * Imposter on a phone. Your secret card is hidden behind a tap so nobody can read it over your shoulder.
 * Clues build up in a list, then everyone votes. The imposter gets a "name the secret" button.
 */
export function ImposterView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
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

  useEffect(() => window.scrollTo(0, 0), []);
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
  const deadline = s.phaseAt + (s.phase === "clue" ? IM.CLUE_MS : s.phase === "vote" ? IM.VOTE_MS : IM.GUESS_MS);

  return (
    <PageShell width="sm" className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">Imposter · {s.topic}</p>
          <h1 className="truncate text-2xl">
            {s.phase === "clue" ? `Round ${round} of ${s.rounds}` : s.phase === "vote" ? "Who's the imposter?" : "Last chance"}
          </h1>
        </div>
        <PartyClock deadline={deadline} offset={ctl.offset} total={s.phase === "clue" ? IM.CLUE_MS : s.phase === "vote" ? IM.VOTE_MS : IM.GUESS_MS} />
      </header>

      {/* The secret card: tap to show, tap again to hide. */}
      <button type="button" onClick={() => setPeek((p) => !p)} aria-pressed={peek}
        className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${amImposter ? "border-accent/50 bg-accent/10" : "border-secondary/40 bg-primary/15"}`}>
        {peek ? (
          amImposter ? (
            <>
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/30"><VenetianMask className="h-8 w-8" aria-hidden /></span>
              <span className="min-w-0"><b className="block text-lg">You're the imposter</b><span className="text-sm text-muted-foreground">Blend in. Topic: {s.topic}.{s.ending === "guess" ? " Name the secret to win." : ""}</span></span>
            </>
          ) : (
            <>
              <CharacterAvatar name={s.secret} query={secretItem?.q} size={56} className="shrink-0 rounded-2xl" />
              <span className="min-w-0"><b className="block truncate text-lg">{s.secret}</b><span className="text-sm text-muted-foreground">The secret. Don't say it.</span></span>
            </>
          )
        ) : (
          <>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10"><Eye className="h-7 w-7" aria-hidden /></span>
            <span><b className="block text-lg">Tap to see your card</b><span className="text-sm text-muted-foreground">Keep your screen hidden</span></span>
          </>
        )}
        {peek && <EyeOff className="ml-auto h-5 w-5 shrink-0 text-muted-foreground" aria-label="Tap to hide" />}
      </button>

      <Panel title="Clues">
        {s.clues.length === 0 ? <p className="text-sm text-muted-foreground">No clues yet. {turn} goes first.</p> : (
          <ol className="space-y-2">
            {s.clues.map((c, i) => (
              <li key={i} className="flex items-baseline gap-3 rounded-xl bg-white/5 px-3 py-2">
                <span className="w-24 shrink-0 truncate text-sm font-semibold text-secondary">{c.by}</span>
                <span className="min-w-0 break-words">{c.text}</span>
              </li>
            ))}
          </ol>
        )}
        <PlayerDots players={s.order} active={turn} />
      </Panel>

      {s.phase === "clue" && (
        myTurn ? (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input className={controlCls} maxLength={40} autoFocus placeholder="One short clue" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} aria-label="Your clue" enterKeyHint="send" />
              <Button variant="accent" onClick={send} disabled={!text.trim()} aria-label="Send clue"><Send className="h-4 w-4" aria-hidden /></Button>
            </div>
            {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          </div>
        ) : (
          <p className="text-center text-muted-foreground">Waiting for {turn}'s clue…</p>
        )
      )}

      {s.phase === "vote" && (
        <Panel title={s.votes[me] ? "Vote locked in" : "Vote for the imposter"} hint={`${Object.keys(s.votes).length} of ${s.players.length} voted`}>
          <div className="grid grid-cols-2 gap-2">
            {s.players.filter((p) => p !== me).map((p) => (
              <Button key={p} variant={s.votes[me] === p ? "accent" : "ghost"} disabled={!!s.votes[me]} onClick={() => ctl.dispatch({ type: "accuse", by: me, target: p })} className="truncate">{p}</Button>
            ))}
          </div>
        </Panel>
      )}

      {s.phase === "guess" && (
        <p className="rounded-2xl border border-accent/40 bg-accent/10 p-4 text-center">{amImposter ? "You were caught! Name the secret to steal the win." : `${s.imposter || "The imposter"} was caught and gets one guess at the secret…`}</p>
      )}

      {amImposter && (s.phase === "guess" || (s.phase === "clue" && s.ending === "guess")) && (
        guessing || s.phase === "guess" ? (
          <Panel title="Name the secret" hint="Right wins it for you. Wrong loses it.">
            <div className="grid grid-cols-2 gap-2">
              {s.options.map((o) => (
                <Button key={o} variant="ghost" className="justify-start truncate text-left" onClick={() => ctl.dispatch({ type: "guess", by: me, name: o })}>{o}</Button>
              ))}
            </div>
            {s.phase === "clue" && <Button variant="ghost" className="w-full" onClick={() => setGuessing(false)}>Not yet</Button>}
          </Panel>
        ) : (
          <Button variant="primary" className="w-full" onClick={() => setGuessing(true)}><VenetianMask className="h-4 w-4" aria-hidden /> I know the secret</Button>
        )
      )}
    </PageShell>
  );
}

/** Final screen: who the imposter was, the secret, and how it ended. */
export function ImposterResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as IM.ImposterState;
  const item = ctl.pool.find((i) => i.id === s.secretId);
  const how = s.guess
    ? s.guess === s.secret ? `${s.imposter} named the secret.` : `${s.imposter} guessed ${s.guess}. Wrong!`
    : s.caught ? `${s.imposter} was voted out.` : `The vote missed. ${s.imposter} got away.`;
  return (
    <PageShell width="sm" className="space-y-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-secondary">Imposter · {s.topic}</p>
      <h1 className="text-4xl">{s.winner === "imposter" ? "The imposter wins" : "The crew wins"}</h1>
      <p className="text-muted-foreground">{how}</p>
      <div className="flex items-center justify-center gap-4 rounded-2xl border border-white/10 bg-card/70 p-4">
        <CharacterAvatar name={s.secret} query={item?.q} size={64} className="rounded-2xl" />
        <div className="text-left"><p className="text-sm text-muted-foreground">The secret was</p><p className="text-xl font-semibold">{s.secret}</p><p className="text-sm text-muted-foreground">Imposter: <b className="text-accent">{s.imposter}</b></p></div>
      </div>
      <Panel title="Votes">
        <ul className="space-y-1 text-left text-sm">
          {Object.entries(s.votes).map(([by, t]) => <li key={by} className="flex justify-between rounded-lg bg-white/5 px-3 py-2"><span>{by}</span><span className={t === s.imposter ? "text-emerald-400" : "text-muted-foreground"}>{t}</span></li>)}
          {!Object.keys(s.votes).length && <li className="text-muted-foreground">It ended before the vote.</li>}
        </ul>
      </Panel>
      <div className="flex flex-wrap justify-center gap-2">
        {onRematch && <Button variant="accent" onClick={onRematch}>Play again</Button>}
        <Button variant="ghost" onClick={onAgain}>Pick another game</Button>
      </div>
    </PageShell>
  );
}
