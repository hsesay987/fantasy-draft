"use client";

import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";
import * as V from "../../topicDraft/formats/vote";
import { deckOf } from "../../topicDraft/party/decks";
import { Button, PageShell, Panel } from "../../components/ui";
import { useSound } from "../../components/SoundProvider";
import { PartyClock, VoteBooths } from "./partyBits";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

/** Vote games on a phone: one card, two big buttons, voting booths while everyone decides, then the split. */
export function VoteView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as V.VoteState;
  const deck = deckOf(s.deck);
  const card = s.cards[s.round]!;
  const me = ctl.me ?? "";
  const mine = s.votes[me];
  const reveal = s.phase === "reveal" ? s.history[s.history.length - 1]! : null;
  const voted = new Set(Object.keys(s.votes));
  // Stub until the Task 3 screens: only cards with a true answer highlight a side.
  const scored = card.answer ?? null;
  const gain = reveal?.gained[me] ?? 0;

  useEffect(() => window.scrollTo(0, 0), [s.round]); // each new card starts at the top of the screen
  const phaseRef = useRef(s.phase);
  useEffect(() => {
    if (s.phase === "reveal" && phaseRef.current !== "reveal") play(gain > 0 ? "win" : "reveal");
    phaseRef.current = s.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase]);

  const phaseMs = s.phase === "reveal" ? V.REVEAL_MS : s.phase === "guess" ? V.GUESS_MS : V.VOTE_MS;
  const count = (side: V.Side) => (reveal ? Object.values(reveal.votes).filter((v) => v === side).length : 0);
  const total = reveal ? Math.max(1, Object.keys(reveal.votes).length) : 1;
  const sides: { id: V.Side; label: string }[] = [{ id: "a", label: card.a }, { id: "b", label: card.b }];

  return (
    <PageShell width="sm" className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-secondary">{deck?.title} · card {s.round + 1} of {s.cards.length}</p>
          <p className="text-sm text-muted-foreground">{deck?.how}</p>
        </div>
        <PartyClock deadline={s.phaseAt + phaseMs} offset={ctl.offset} total={phaseMs} />
      </header>

      <section className="rounded-2xl border border-white/10 bg-card/80 p-5">
        <p className="text-xl leading-snug md:text-2xl">{card.prompt}</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        {sides.map(({ id, label }) => {
          const n = count(id);
          const win = scored === id;
          return (
            <button key={id} type="button" disabled={!!mine || s.phase !== "vote"} onClick={() => ctl.dispatch({ type: "vote", by: me, side: id })}
              className={`relative min-h-20 overflow-hidden rounded-2xl border px-4 py-3 text-left text-lg font-semibold transition-colors disabled:cursor-default
                ${reveal ? (win ? "border-emerald-400 bg-emerald-500/15" : "border-white/10 bg-white/5") : mine === id ? "border-secondary bg-primary/30" : mine ? "border-white/10 bg-white/5 opacity-60" : "border-white/15 bg-white/5 hover:bg-white/10 active:bg-white/15"}`}>
              {reveal && <span className="absolute inset-y-0 left-0 bg-white/10 transition-[width] duration-700" style={{ width: `${(n / total) * 100}%` }} aria-hidden />}
              <span className="relative flex items-center justify-between gap-3">
                <span><span className="mr-2 text-secondary">{id.toUpperCase()}</span>{label}</span>
                {reveal && <span className="text-base tabular-nums">{n}</span>}
              </span>
            </button>
          );
        })}
      </div>

      {s.phase === "guess" && (
        <Panel title="How did they vote?">
          <ul className="space-y-2">
            {(s.targets[me] ?? []).map((t) => (
              <li key={t} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">{t}</span>
                <span className="flex gap-2">
                  {(["a", "b"] as const).map((side) => (
                    <button key={side} type="button" disabled={!!s.guesses[me]?.[t]} onClick={() => ctl.dispatch({ type: "guessVote", by: me, target: t, side })}
                      className={`h-10 w-10 rounded-xl border font-semibold ${s.guesses[me]?.[t] === side ? "border-secondary bg-primary/30" : "border-white/15 bg-white/5"}`}>{side.toUpperCase()}</button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <VoteBooths players={s.players} voted={voted} reveal={reveal && Object.keys(reveal.votes).length ? reveal.votes : undefined} labels={{ a: card.a, b: card.b }} />

      {reveal ? (
        <Panel>
          <p className="text-lg font-semibold">
            {card.answer ? (card.answer === "a" ? "It really happened." : "Made up!") : "Votes are in."}
          </p>
          {card.note && <p className="text-sm text-muted-foreground">{card.note}</p>}
          <p className="text-sm">{gain > 0 ? `+${gain} for you.` : "No point this time."}{reveal.nobodyGot.includes(me) ? " Nobody read you." : ""}</p>
          <Button variant="ghost" className="w-full" onClick={() => ctl.dispatch({ type: "next", by: me })}>Next card <ChevronRight className="h-4 w-4" aria-hidden /></Button>
        </Panel>
      ) : (
        <p className="text-center text-sm text-muted-foreground">{s.phase === "guess" ? "Guess how each person voted." : mine ? `Locked in. Waiting for ${s.players.length - voted.size} more…` : "Pick a side. Nobody sees it until everyone votes."}</p>
      )}

      <Scores points={s.points} />
    </PageShell>
  );
}

function Scores({ points }: { points: Record<string, number> }) {
  const ranked = Object.entries(points).sort((a, b) => b[1] - a[1]);
  return (
    <ol className="flex flex-wrap gap-2 text-sm" aria-label="Scores">
      {ranked.map(([p, v]) => <li key={p} className="rounded-full bg-white/5 px-3 py-1"><span className="text-muted-foreground">{p}</span> <b className="tabular-nums">{v}</b></li>)}
    </ol>
  );
}

/** End of a vote game: the standings, and every card with how the room split. */
export function VoteResults({ ctl, onAgain, onRematch }: { ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as V.VoteState;
  const ranked = Object.entries(s.points).sort((a, b) => b[1] - a[1]);
  const tied = ranked.length > 1 && ranked[0]![1] === ranked[1]![1];
  return (
    <PageShell width="sm" className="space-y-4">
      <p className="text-center text-xs font-semibold uppercase tracking-widest text-secondary">{deckOf(s.deck)?.title} · final scores</p>
      <h1 className="text-center text-4xl">{tied ? "It's a tie!" : `${ranked[0]![0]} wins`}</h1>
      <ol className="space-y-2">
        {ranked.map(([p, v], i) => <li key={p} className="flex justify-between rounded-xl border border-white/10 bg-card/70 px-4 py-3"><span>{i + 1}. {p}</span><b className="tabular-nums">{v}</b></li>)}
      </ol>
      <Panel title="How the room voted">
        <ul className="space-y-3">
          {s.cards.slice(0, s.history.length).map((c, i) => {
            const h = s.history[i]!;
            const a = Object.values(h.votes).filter((v) => v === "a").length, b = Object.values(h.votes).filter((v) => v === "b").length;
            const scored = c.answer ?? null;
            return (
              <li key={c.id} className="space-y-1 rounded-xl bg-white/5 p-3 text-sm">
                <p>{c.prompt}</p>
                <p className="text-muted-foreground"><span className={scored === "a" ? "text-emerald-400" : ""}>{c.a}: {a}</span> · <span className={scored === "b" ? "text-emerald-400" : ""}>{c.b}: {b}</span></p>
                {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
              </li>
            );
          })}
        </ul>
      </Panel>
      <div className="flex flex-wrap justify-center gap-2">
        {onRematch && <Button variant="accent" onClick={onRematch}>New cards</Button>}
        <Button variant="ghost" onClick={onAgain}>Pick another game</Button>
      </div>
    </PageShell>
  );
}
