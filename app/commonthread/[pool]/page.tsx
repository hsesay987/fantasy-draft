"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { CharacterAvatar } from "../../components/CharacterAvatar";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import { WorldScene } from "../../components/pixel/WorldScene";
import { magnifier, strikeX } from "../../components/pixel/sprites";
import { useSound } from "../../components/SoundProvider";
import { track } from "../../lib/analytics";
import { dayNumber } from "../../pinpoint/engine";
import { CLUES, dailyCategory, guess, loadRun, nextClue, options, practiceCategory, saveRun, score, seedOf, shareGrid, startRun, type ThreadRun } from "../engine";
import { ThreadString } from "../ThreadString";
import { THREAD_TOPICS, clueImage, loadThreadTopic } from "../topics";
import type { ThreadCategory, ThreadTopic } from "../types";

type Game = { topic: ThreadTopic; day: number; cat: ThreadCategory; labels: string[]; practice: boolean; run: ThreadRun; pinned: number | null };
/* `pinned`: how many clues were up before the last move, so only new ones animate in. Null when nothing should. */

const SCENE = "A detective's office at night: rain on the window and a corkboard of clues joined by red string";
const stillMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function daily(pool: string, topic: ThreadTopic, day: number): Game {
  const cat = dailyCategory(topic, day);
  return { topic, day, cat, labels: options(cat, seedOf(`${pool}:${day}`)), practice: false, run: loadRun(pool, day, cat.id) ?? startRun(cat), pinned: null };
}

/**
 * Until the run ends, nothing on this page may separate the answer from the seven wrong leads, and clues not yet earned
 * must not be in the DOM at all. A category's `id` is a slug of its label, so it is never rendered, even in an attribute.
 */
export default function CommonThreadGame() {
  const { pool } = useParams<{ pool: string }>();
  const meta = THREAD_TOPICS.find((t) => t.id === pool);
  const { play } = useSound();
  const [game, setGame] = useState<Game | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLElement | null)[]>([]);
  const verdictRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!meta) return;
    let live = true;
    setGame(null);
    setFailed(false);
    loadThreadTopic(pool).then(
      (topic) => { if (live) setGame(daily(pool, topic, dayNumber())); },
      () => { if (live) setFailed(true); },
    );
    return () => { live = false; };
  }, [pool, meta, attempt]);

  const run = game?.run;
  const onBoard = !run ? 0 : run.over ? CLUES : run.shown;

  // A wrong lead tapped far down the page must not leave the new clue out of sight.
  const shown = run?.shown;
  const over = run?.over;
  useEffect(() => {
    if (!shown || over || shown === 1) return;
    boardRef.current?.scrollIntoView({ block: "nearest", behavior: stillMotion() ? "auto" : "smooth" });
  }, [shown, over]);

  if (!meta) return notFound();

  const shell = (body: React.ReactNode) => (
    <PixelShell world="board"><div className="ct-page">{body}</div></PixelShell>
  );
  if (failed) {
    return shell(
      <section className="ct-verdict cold">
        <h2>The case file would not open.</h2>
        <p className="got">Check your connection and try again.</p>
        <div className="ct-actions">
          <PixelButton variant="gold" onClick={() => setAttempt((n) => n + 1)}>Try again</PixelButton>
          <Link href="/commonthread" className="px-btn alt no-underline">All topics</Link>
        </div>
      </section>,
    );
  }
  if (!game || !run) return shell(<p className="party-status" role="status">Opening the case file…</p>);

  const { cat, labels, practice, day, pinned } = game;

  const apply = (next: ThreadRun, line: string | null) => {
    if (next === run) return;
    setGame({ ...game, run: next, pinned: onBoard });
    setNote(line);
    if (!practice) saveRun(pool, day, next);
    if (!next.over) return;
    play(next.won ? "win" : "lose");
    track("commonthread_finished", { pool, won: next.won, clues: next.shown, score: score(next), practice });
    // Hand the screen to the verdict once it has rendered.
    requestAnimationFrame(() => {
      verdictRef.current?.focus({ preventScroll: true });
      verdictRef.current?.scrollIntoView({ block: "start", behavior: stillMotion() ? "auto" : "smooth" });
    });
  };
  const askClue = () => { play("reveal"); apply(nextClue(run), "New clue pinned to the board."); };
  const tryLead = (label: string) => {
    const next = guess(run, cat, label);
    if (next !== run && !next.won && !next.over) play("click");
    apply(next, "Not that one. It is off the list, and a new clue went up.");
  };
  const startPractice = () => {
    // A fresh practice case: not the one just played, if the draw can be helped.
    let pick = practiceCategory(game.topic, Math.random());
    for (let i = 0; i < 4 && pick.id === cat.id; i++) pick = practiceCategory(game.topic, Math.random());
    setNote(null);
    setGame({ ...game, cat: pick, labels: options(pick, Math.floor(Math.random() * 2 ** 32)), practice: true, run: startRun(pick), pinned: null });
    window.scrollTo(0, 0);
  };
  const backToDaily = () => {
    setNote(null);
    setGame(daily(pool, game.topic, day));
    window.scrollTo(0, 0);
  };
  const title = practice ? `TopPic Common Thread practice · ${meta.title}` : `TopPic Common Thread #${day} · ${meta.title}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareGrid(run, title));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };

  const worth = CLUES + 1 - run.shown;
  const status = run.shown === CLUES ? "Last clue. One more miss and the case goes cold." : note ?? "One hidden fact links every clue. Name it now, or pin another clue for a point less.";

  return shell(
    <>
      <Link href="/commonthread" className="ct-back">&lt; All topics</Link>
      <header className="ct-sign">
        <div>
          <p className="eyebrow">{meta.title} · {practice ? "Practice, not saved" : `Daily #${day}`}</p>
          <h1>Common Thread</h1>
        </div>
        {!run.over && <p className="ct-worth m-0" aria-label={`Clue ${run.shown} of ${CLUES}, worth ${worth} points`}><b>{worth}</b><span>{worth === 1 ? "point" : "points"}</span></p>}
        {run.over && <Sprite sprite={magnifier()} size={40} />}
      </header>

      {run.over && (
        <section ref={verdictRef} tabIndex={-1} className={`ct-verdict ${run.won ? "won" : "cold"}`}>
          <p className="ct-stamp m-0">{run.won ? "CASE CLOSED" : "CASE COLD"}</p>
          <p className="was">The thread was</p>
          <h2>{cat.label}</h2>
          <p className="got" role="status">{run.won ? `Cracked on clue ${run.shown}: ${score(run)} of ${CLUES} points.` : `Six clues and no match: 0 of ${CLUES} points.`}</p>
          <div className="ct-actions">
            <PixelButton variant="gold" onClick={copy}>{copied ? "Copied" : "Share result"}</PixelButton>
            <PixelButton variant="alt" onClick={startPractice}>Practice round</PixelButton>
            {practice && <PixelButton variant="alt" onClick={backToDaily}>Today&apos;s case</PixelButton>}
          </div>
        </section>
      )}

      <div ref={boardRef} className={`ct-board ${pool === "flags" ? "ct-flags" : ""}`}>
        <ol className="ct-slots" aria-label="Clues">
          {Array.from({ length: CLUES }, (_, i) => {
            const clue = i < onBoard ? cat.clues[i] : undefined;
            const fresh = pinned !== null && i >= pinned;
            const spare = !!run.over && i >= run.shown;
            return (
              <li key={i} ref={(el) => { slotRefs.current[i] = el; }} className={`ct-slot s${i}`}>
                {clue ? (
                  <div className={`ct-card ${fresh ? "fresh" : ""} ${spare ? "spare" : ""}`} style={fresh && i > pinned ? { animationDelay: `${0.12 * (i - pinned) + 0.1}s` } : undefined}>
                    <div className="ct-photo">
                      <span className="ct-num" aria-hidden>{i + 1}</span>
                      <CharacterAvatar name={clue.name} query={clueImage(pool, clue)} size={96} />
                    </div>
                    <p className="ct-name">{clue.name}</p>
                  </div>
                ) : <div className="ct-blank" aria-hidden>?</div>}
              </li>
            );
          })}
        </ol>
        <ThreadString board={boardRef} slots={slotRefs} count={onBoard} solved={run.won} />
      </div>

      {!run.over && (
        <div className="ct-bar">
          <p className="ct-status" role="status">{status}</p>
          {run.shown < CLUES && <PixelButton variant="alt" onClick={askClue}>Next clue: worth {worth - 1}</PixelButton>}
        </div>
      )}

      <section className="ct-leads-box" aria-label="Leads">
        <h2>{run.over ? "The leads" : "What links them?"}</h2>
        <ul className="ct-leads">
          {labels.map((label) => {
            const gone = run.removed.includes(label);
            const right = run.over && label === cat.label;
            return (
              <li key={label}>
                <button type="button" onClick={() => tryLead(label)} disabled={run.over} aria-disabled={gone || undefined}
                  className={`ct-lead ${gone ? "gone" : ""} ${right ? "right" : ""} ${run.over && !gone && !right ? "idle" : ""}`}>
                  <span>{label}</span>
                  {gone && <Sprite sprite={strikeX(true)} size={14} label="Ruled out" />}
                  {right && <span className="badge">THE THREAD</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <WorldScene world="board" actors={[]} labels={false} track={false} caption={SCENE} />
    </>,
  );
}
