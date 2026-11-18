"use client";

// NPAT's solo daily: today's letter and four categories, 60 seconds, then all four answers turned over at once.
// Scored here in the browser, so it loads the lists; room screens must never import this file (see npat/boundary.test).
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { PixelButton, PixelShell } from "../components/pixel/PixelUI";
import * as NP from "../topicDraft/formats/npat";
import "../topicDraft/npat/lists";
import { categoryOf } from "../topicDraft/npat/categories";
import { ANSWER_MAX } from "../topicDraft/npat/rules";
import { setHistorySource } from "../topicDraft/npat/source";
import { PartyClock } from "../play/views/partyBits";
import { tierBadge } from "../play/views/npatBoard";
import { catTitle, LetterTile, ListSources } from "../play/views/npatParts";
import { overlaySource, playToEnd, SOLO_MAX, SOLO_PLAYER as ME, soloResult } from "./solo";

export type NpatDaily = { letter: string; categories: string[]; overlay?: unknown };
export type NpatSoloResult = ReturnType<typeof soloResult>;

type Props = {
  puzzle: NpatDaily;
  number: number;
  /** Fires once, the moment the round is scored. */
  onFinish: (r: NpatSoloResult) => void;
  /** The player has seen the reveal and wants the day's stats. */
  onContinue: () => void;
  backHref?: string;
  backLabel?: string;
};

const noop = () => () => {};

/** The clock is read at the start, so nothing is built until the browser has taken over from the server render. */
export function NpatSolo(props: Props) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <PixelShell world="notebook"><div className="party-page np-page"><p className="np-msg">Opening today&apos;s page…</p></div></PixelShell>;
  return <Game {...props} />;
}

function Game({ puzzle, number, onFinish, onContinue, backHref = "/trivia", backLabel = "All trivia" }: Props) {
  const [s, setS] = useState<NP.NPState | null>(null);
  const [texts, setTexts] = useState<string[]>(() => puzzle.categories.map(() => ""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // Today's history overlay feeds the tiers; with none (or a failed fetch) the list tiers stand.
  useEffect(() => {
    setHistorySource(overlaySource(puzzle.overlay));
    return () => setHistorySource(null);
  }, [puzzle.overlay]);

  const start = () => {
    setHistorySource(overlaySource(puzzle.overlay));
    setS(NP.init({ players: [ME], categories: puzzle.categories, rounds: 1, roundSeconds: 60, strict: true, teams: 0, teamMap: {}, seed: number, now: Date.now(), letter: puzzle.letter }));
  };

  // The clock: writing closes at 60 seconds and the whole round is turned over at once.
  const writing = !!s && !s.done && s.phase === "write";
  useEffect(() => {
    if (!writing) return;
    const id = setInterval(() => setS((p) => (p ? playToEnd(NP.tick(p, Date.now()), Date.now()) : p)), 250);
    return () => clearInterval(id);
  }, [writing]);

  const told = useRef(false);
  const finish = useRef(onFinish);
  useEffect(() => { finish.current = onFinish; }, [onFinish]);
  useEffect(() => {
    if (s?.done && !told.current) { told.current = true; finish.current(soloResult(s)); }
  }, [s]);
  useEffect(() => { window.scrollTo(0, 0); }, [s?.done]);

  const type = (i: number, v: string) => {
    setTexts((t) => t.map((x, j) => (j === i ? v : x)));
    setS((p) => (p ? NP.answer(p, ME, i, v, Date.now()) : p));
  };
  const done = () => setS((p) => (p ? playToEnd(NP.finish(p, ME, Date.now()), Date.now()) : p));

  const back = <Link href={backHref} className="tr-back">&lt; {backLabel}</Link>;

  if (!s) {
    return (
      <PixelShell world="notebook">
        <div className="party-page np-page">
          {back}
          <section className="px-box np-card" aria-label="Today's page">
            <p className="np-eyebrow">Daily Name Place Animal Thing #{number}</p>
            <h1 className="np-title">One letter, four categories</h1>
            <p className="np-msg">You get 60 seconds to write something for each of today&apos;s categories, all starting with the same letter. The letter shows when you start.</p>
            <ul className="np-cats">
              {puzzle.categories.map((c) => <li key={c}><b>{catTitle(c)}</b> {categoryOf(c)?.blurb}</li>)}
            </ul>
            <p className="np-msg">Rarer answers score more, up to 100 each. An answer we don&apos;t have on our lists scores 0 for now, and we save it to check later.</p>
            <PixelButton variant="gold" className="np-done" onClick={start}>Start the clock</PixelButton>
            <ListSources categories={puzzle.categories} />
          </section>
        </div>
      </PixelShell>
    );
  }

  if (!s.done) {
    const open = s.phase === "write";
    const filled = texts.filter((t) => t.trim()).length;
    return (
      <PixelShell world="notebook">
        <div className="party-page np-page">
          <header className="np-head">
            <span className="stat"><em>Daily</em><b>#{number}</b></span>
            <span className="stat"><em>Letter</em><b>{s.letter}</b></span>
            <PartyClock deadline={s.phaseAt + s.roundMs} offset={0} total={s.roundMs} />
          </header>
          <section className="px-box np-card np-sheet" aria-label="Your answers">
            <div className="np-sheet-top">
              <LetterTile letter={s.letter} />
              <p className="np-msg">Something for each, starting with <b>{s.letter}</b>. Rarer scores more.</p>
            </div>
            <form className="np-fields" onSubmit={(e) => { e.preventDefault(); done(); }} autoComplete="off">
              {s.categories.map((c, i) => (
                <label key={c} className="np-field">
                  <span className="lbl">{catTitle(c)}</span>
                  <input
                    ref={(el) => { inputs.current[i] = el; }}
                    value={texts[i] ?? ""} maxLength={ANSWER_MAX} disabled={!open} autoFocus={i === 0}
                    onChange={(e) => type(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const nextField = inputs.current[i + 1];
                      if (nextField) nextField.focus(); else e.currentTarget.blur();
                    }}
                    placeholder={`${s.letter}…`} aria-label={`${catTitle(c)} starting with ${s.letter}`}
                    autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} enterKeyHint={i + 1 < s.categories.length ? "next" : "done"} />
                </label>
              ))}
              <p className="np-msg" role="status">{filled} of {s.categories.length} filled</p>
              <PixelButton type="submit" variant="gold" className="np-done" disabled={!open}>Done</PixelButton>
            </form>
          </section>
        </div>
      </PixelShell>
    );
  }

  const r = soloResult(s);
  const mine = s.history[0]?.answers[ME] ?? [];
  return (
    <PixelShell world="notebook">
      <div className="party-page np-page">
        {back}
        <section className={`px-box np-card np-winner ${r.total >= SOLO_MAX * 0.5 ? "px-confetti" : ""}`} aria-label="Your score">
          <p className="np-eyebrow">Daily #{number} · letter {s.letter}</p>
          <h2>{r.total} / {SOLO_MAX}</h2>
          <p className="np-grid" aria-label={`Share grid: ${r.grid}`}>{r.grid}</p>
        </section>
        <section className="px-box np-card" aria-label="Your answers">
          <ul className="np-groups">
            {s.categories.map((c, i) => {
              const a = mine[i] ?? { text: "", entry: null, status: "blank" as const };
              const b = tierBadge(a);
              const miss = a.status === "wrong-letter" ? "wrong letter" : a.status === "unknown" ? "not on our list" : null;
              const kind = a.status === "ok" ? "ok" : a.status === "unknown" ? "voted-out" : a.status;
              return (
                <li key={c} className={`k-${kind}`}>
                  <p className="as">{catTitle(c)}</p>
                  <div className="top">
                    <span className="txt">{a.entry ?? (a.text || "—")}</span>
                    {b ? <span className={`np-badge t-${b.tier}`}>{b.label} <b>+{b.points}</b></span> : miss ? <span className="np-badge miss">{miss}</span> : null}
                  </div>
                  {a.entry && a.text && a.text !== a.entry && <p className="as">typed as {a.text}</p>}
                  {a.status === "unknown" && <p className="who"><em>Saved for review. If it checks out, it joins the lists.</em></p>}
                </li>
              );
            })}
          </ul>
          <ListSources categories={s.categories} />
        </section>
        <div className="party-actions">
          <PixelButton variant="gold" onClick={onContinue}>See today&apos;s results</PixelButton>
        </div>
      </div>
    </PixelShell>
  );
}
