"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { Sprite } from "../components/pixel/Sprite";
import { WorldScene } from "../components/pixel/WorldScene";
import { strikeX, type Sprite as SpriteData } from "../components/pixel/sprites";
import { useSound } from "../components/SoundProvider";
import type { TriviaCategory } from "../topicDraft/trivia/types";
import { endOf, lifelineState, pollShare, safePoints, startClimb } from "./climb";
import { answer, crowdPoll, cutTwo, LADDER, LEDGES, RUNGS, saveClimb, scoreFraction, swap, walk, type Lifeline, type RungQuestion, type RungState } from "./engine";

const SCENE = "A ladder bolted up a tall lighthouse at dusk, with the sea far below and the lamp at the very top";
const stillMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const LIFELINES: { id: Lifeline; label: string; help: string; icon: SpriteData }[] = [
  { id: "cut", label: "Cut Two", help: "Takes away two wrong options", icon: {
    rows: ["X.......X", ".X.....X.", "..X...X..", "...X.X...", "....X....", "...X.X...", ".RR...RR.", "R..R.R..R", ".RR...RR."],
    pal: { X: "#fff3dc", R: "#f4714f" } } },
  { id: "poll", label: "Crowd Poll", help: "Asks the crowd on the shore. They get shakier the higher you are", icon: {
    rows: [".......AA", ".......AA", "...BB..AA", "...BB..AA", "CC.BB..AA", "CC.BB..AA", "CC.BB..AA", "XXXXXXXXX"],
    pal: { A: "#ffd27a", B: "#8fc4ff", C: "#7fe0a8", X: "#fff3dc" } } },
  { id: "swap", label: "Swap", help: "Brings in a new question just as hard", icon: {
    rows: ["..A......", ".AA......", "AAAAAAAAA", ".AA......", "..A...B..", "......BB.", "BBBBBBBBB", "......BB.", "......B.."],
    pal: { A: "#ffd27a", B: "#8fc4ff" } } },
];
const TICK: SpriteData = { rows: ["........G", ".......GG", "......GG.", "G....GG..", "GG..GG...", ".GGGG....", "..GG....."], pal: { G: "#0d3b22" } };

/**
 * What is on screen for the question. Marks sit in `open`, and before the reveal the answer gets no class, key,
 * attribute or style of its own: the only thing that separates the options is which one the player picked.
 */
type Asked = { q: RungQuestion; choice: string | null; hidden: string[]; poll: Record<string, number> | null };
/**
 * The moment after a tap. The outcome is saved already, so a refresh can't take the pick back, but until `open` the
 * screen keeps showing the climb as it `was`, so the score and the climber don't give the answer away.
 */
type Beat = { was: RungState; choice: string; open: boolean };

/**
 * The whole climb: the tower, the question, the lifelines and how it ends. It remembers itself under `saveKey`, so a
 * refresh carries on from the same rung. `onDone` fires once when a climb with questions in it ends, and also if the
 * climb being resumed had already ended (`restored`), so a page closed at the wrong moment still gets its result.
 */
export function TopRungGame({ categories, saveKey, onDone, seed, eyebrow = "Free climb", backHref = "/toprung", backLabel = "All topics", onAgain, onContinue, continueLabel }: {
  /** Null while the questions are still on their way. */
  categories: TriviaCategory[] | null;
  saveKey: string;
  onDone?: (state: RungState, info: { restored: boolean }) => void;
  /** The same seed gives the same climb. Left out, each new climb is drawn at random. */
  seed?: number;
  eyebrow?: string;
  backHref?: string;
  backLabel?: string;
  /** Free play: offers another climb on the end panel. */
  onAgain?: () => void;
  /** The daily: a button from the end panel on to the day's stats. */
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const { play } = useSound();
  const [s, setS] = useState<RungState | null>(null);
  const [beat, setBeat] = useState<Beat | null>(null);
  const [flash, setFlash] = useState<{ key: number; good: boolean } | undefined>();
  const [asking, setAsking] = useState(false);
  const restored = useRef(false);
  const sent = useRef(false);
  const doneCb = useRef(onDone);
  doneCb.current = onDone;
  const sceneRef = useRef<HTMLDivElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLElement>(null);

  // Storage and any random seed are only touched here, so the server and the first client render agree.
  useEffect(() => {
    if (!categories) return;
    const first = startClimb(categories, saveKey, seed ?? Math.floor(Math.random() * 2 ** 31));
    restored.current = first.status !== "climbing";
    if (first.questions.length) saveClimb(saveKey, first);
    setS(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveKey, !categories]);

  const end = s ? endOf(s) : null;
  const holding = !!beat && !beat.open;

  // The held breath between the tap and the answer.
  useEffect(() => {
    if (!beat || beat.open || !s) return;
    const id = setTimeout(() => {
      setBeat({ ...beat, open: true });
      if (s.status === "fell") {
        play("fall");
        setFlash((f) => ({ key: (f?.key ?? 0) + 1, good: false }));
        return;
      }
      const cleared = s.status === "top" ? s.questions.length : s.rung - 1;
      play(endOf(s) === "lamp" ? "lamp" : LEDGES.includes(cleared) ? "ledge" : cleared > RUNGS / 2 ? "rungHigh" : "rung");
      setFlash((f) => ({ key: (f?.key ?? 0) + 1, good: true }));
    }, stillMotion() ? 300 : 850);
    return () => clearTimeout(id);
  }, [beat, s, play]);

  const finished = !!s && s.status !== "climbing" && s.questions.length > 0 && !holding;
  useEffect(() => {
    if (!finished || sent.current || !s) return;
    sent.current = true;
    doneCb.current?.(s, { restored: restored.current });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // Once a climb has ended live, the climber and the verdict come back into view.
  const opened = beat?.open;
  useEffect(() => {
    if (!opened) return;
    if (end) sceneRef.current?.scrollIntoView({ block: "start", behavior: stillMotion() ? "auto" : "smooth" });
    else nextRef.current?.focus({ preventScroll: false });
  }, [opened, end]);

  const shell = (body: ReactNode) => <PixelShell world="ladder"><div className="tr-page">{body}</div></PixelShell>;
  const back = <Link href={backHref} className="tr-back">&lt; {backLabel}</Link>;

  if (!s) return shell(<p className="px-note m-1" role="status">Up the tower…</p>);
  if (end === "empty") {
    return shell(
      <>
        {back}
        <section className="tr-end cold">
          <p className="tr-end-tag m-0">TOWER CLOSED</p>
          <h1>No questions available</h1>
          <p className="m-0">There is nothing to climb on here yet, so no score was kept. Try another topic.</p>
          <div className="tr-actions"><Link href={backHref} className="px-btn gold no-underline">{backLabel}</Link></div>
        </section>
      </>,
    );
  }

  const act = (next: RungState) => {
    if (next === s) return;
    saveClimb(saveKey, next);
    setS(next);
  };
  const pick = (choice: string) => {
    if (beat) return;
    const next = answer(s, choice);
    if (next === s) return;
    play("creak");
    setAsking(false);
    setBeat({ was: s, choice, open: false });
    act(next);
  };
  const lifeline = (id: Lifeline) => {
    if (beat || lifelineState(s, id) !== "ready") return;
    play("lifeline");
    act(id === "cut" ? cutTwo(s) : id === "poll" ? crowdPoll(s) : swap(s));
  };
  const nextRung = () => {
    setBeat(null);
    play("click");
    requestAnimationFrame(() => {
      sceneRef.current?.scrollIntoView({ block: "start", behavior: stillMotion() ? "auto" : "smooth" });
      questionRef.current?.focus({ preventScroll: true });
    });
  };
  const climbDown = () => {
    setAsking(false);
    play("walkDown");
    act(walk(s));
  };

  const live = s.status === "climbing" && !beat;
  const at = (from: RungState, choice: string | null): Asked => ({ q: from.questions[from.rung - 1]!, choice, hidden: from.hidden, poll: from.poll });
  const asked: Asked | null = beat ? at(beat.was, beat.choice)
    : live ? at(s, null)
    : end === "fell" ? at(s, s.picks[s.picks.length - 1]!)
    : end === "walked" ? at(s, null)
    : null;
  const revealed = beat ? beat.open : !live;
  const view = beat && !beat.open ? beat.was : s;
  const shownCleared = view.status === "top" ? view.questions.length : view.rung - 1;
  const shownPoints = view.points;

  return shell(
    <>
      {back}
      <header className="tr-sign">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>Top Rung</h1>
        </div>
        <p className="tr-score m-0"><b>{shownPoints.toLocaleString("en-US")}</b><span>{shownPoints === 1 ? "point" : "points"}</span></p>
      </header>

      <div ref={sceneRef} className="tr-scene">
        <WorldScene world="ladder" caption={SCENE} track={false} flash={flash} winner={end === "lamp" && !holding ? "YOU" : null} actors={[{ name: "YOU", value: scoreFraction(view) }]} />
      </div>

      <div className="tr-meter" role="img" aria-label={`${shownCleared} of ${s.questions.length} rungs cleared`}>
        {s.questions.map((_, i) => (
          <i key={i} className={`${i < shownCleared ? "done" : ""} ${i === shownCleared && (live || holding) ? "now" : ""} ${LEDGES.includes(i + 1) ? "ledge" : ""}`} />
        ))}
      </div>

      {end && !holding && (
        <EndPanel s={s} end={end} panelRef={endRef} onAgain={onAgain} onContinue={onContinue} continueLabel={continueLabel} backHref={backHref} backLabel={backLabel} />
      )}

      {(live || holding) && (
        <dl className="tr-stats m-0">
          <div><dt>Rung</dt><dd>{view.rung} of {view.questions.length}</dd></div>
          <div><dt>Worth</dt><dd>{LADDER[view.rung - 1]!.toLocaleString("en-US")}</dd></div>
          <div><dt>If you slip</dt><dd>{safePoints(view).toLocaleString("en-US")}</dd></div>
        </dl>
      )}

      {asked && (
        <section className="tr-ask" aria-label="Question">
          <h2 ref={questionRef} tabIndex={-1}>{asked.q.q}</h2>
          <ul className="tr-opts">
            {asked.q.options.map((o) => {
              const gone = asked.hidden.includes(o);
              const share = pollShare(asked, o);
              const picked = asked.choice === o;
              const isRight = revealed && o === asked.q.answer;
              const isWrong = revealed && picked && !isRight;
              return (
                <li key={o}>
                  <button type="button" disabled={!live || gone} onClick={() => pick(o)}
                    className={`tr-opt ${gone ? "gone" : ""} ${holding && picked ? "held" : ""} ${isRight ? "right" : ""} ${isWrong ? "wrong" : ""} ${revealed && !isRight && !isWrong ? "idle" : ""}`}>
                    <span className="tx">{o}</span>
                    {isRight && <span className="tag"><Sprite sprite={TICK} size={14} /> {picked ? "RIGHT" : "THE ANSWER"}</span>}
                    {isWrong && <span className="tag"><Sprite sprite={strikeX(true)} size={14} /> YOUR PICK</span>}
                    {!gone && share !== null && (
                      <span className="tr-bar" aria-label={`${share}% of the crowd`} role="img"><i style={{ width: `${share}%` }} /><b>{share}%</b></span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {holding && <p className="tr-note hold" role="status">The ladder creaks…</p>}

      {beat?.open && !end && (
        <div className="tr-next" role="status">
          <p className="m-0">{LEDGES.includes(shownCleared) ? `Safe ledge. You can't fall below ${s.points.toLocaleString("en-US")} points now.` : `Right. ${s.points.toLocaleString("en-US")} points.`}</p>
          <button ref={nextRef} type="button" className="px-btn gold" onClick={nextRung}>Next rung</button>
        </div>
      )}

      {live && (
        <>
          <ul className="tr-lifes" aria-label="Lifelines, once each per climb">
            {LIFELINES.map((l) => {
              const state = lifelineState(s, l.id);
              return (
                <li key={l.id}>
                  <button type="button" disabled={state !== "ready"} onClick={() => lifeline(l.id)} title={l.help} className={`tr-life ${state}`}>
                    <Sprite sprite={l.icon} size={27} />
                    <span>{l.label}</span>
                    {state !== "ready" && <em>{state === "used" ? "Used" : "None spare"}</em>}
                  </button>
                </li>
              );
            })}
          </ul>
          {asking ? (
            <div className="tr-walk" role="group" aria-label="Climb down?">
              <p className="m-0">Climb down with {s.points.toLocaleString("en-US")} points? This climb ends here.</p>
              <div className="tr-actions">
                <PixelButton variant="gold" onClick={climbDown}>Climb down</PixelButton>
                <PixelButton variant="alt" onClick={() => setAsking(false)}>Keep climbing</PixelButton>
              </div>
            </div>
          ) : (
            <PixelButton variant="alt" className="tr-walk-btn" onClick={() => setAsking(true)}>Walk away with {s.points.toLocaleString("en-US")}</PixelButton>
          )}
        </>
      )}
    </>,
  );
}

function EndPanel({ s, end, panelRef, onAgain, onContinue, continueLabel, backHref, backLabel }: {
  s: RungState; end: "lamp" | "short" | "fell" | "walked"; panelRef: React.RefObject<HTMLElement | null>;
  onAgain?: () => void; onContinue?: () => void; continueLabel?: string; backHref: string; backLabel: string;
}) {
  const points = s.points.toLocaleString("en-US");
  const unit = s.points === 1 ? "point" : "points";
  const [tag, title, line] =
    end === "lamp" ? ["THE LAMP IS LIT", "You reached the top", `Twelve rungs, no slips. You keep ${points} ${unit}.`]
    : end === "short" ? ["END OF THE LADDER", "You ran out of rungs", `This topic only had ${s.questions.length} questions to climb, and you cleared them all. You keep ${points} ${unit}.`]
    : end === "walked" ? ["BACK ON THE GROUND", "You climbed down", `You stopped at rung ${s.rung} and keep ${points} ${unit}.`]
    : s.points ? ["CAUGHT ON THE LEDGE", "You slipped", `The safe ledge caught you. You keep ${points} ${unit}.`]
    : ["SPLASH", "You slipped", `No safe ledge under you yet, so you are back at the sea wall with 0 points.`];
  return (
    <section ref={panelRef} className={`tr-end ${end === "lamp" ? "won" : end === "fell" ? "cold" : ""}`}>
      <p className="tr-end-tag m-0">{tag}</p>
      <h2>{title}</h2>
      <p className="m-0" role="status">{line}</p>
      <div className="tr-actions">
        {onContinue && <PixelButton variant="gold" onClick={onContinue}>{continueLabel ?? "Continue"}</PixelButton>}
        {onAgain && <PixelButton variant="gold" onClick={onAgain}>Climb again</PixelButton>}
        <Link href={backHref} className="px-btn alt no-underline">{backLabel}</Link>
      </div>
    </section>
  );
}
