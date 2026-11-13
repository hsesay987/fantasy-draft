"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as PK from "../topicDraft/formats/pecking";
import type { PeckList } from "../topicDraft/pecking/types";
import { PixelButton, PixelShell } from "../components/pixel/PixelUI";
import { PartyClock } from "../play/views/partyBits";
import { NamePicker, PeckPrompt, PeckReveal, RankPicker, spanText, guessText } from "../play/views/peckingParts";

/** The solo player's seat; scores are kept under this name. */
export const SOLO_PLAYER = "You";
const ME = SOLO_PLAYER;
const noop = () => () => {};

/** `lists`/`count` deal a fresh game; `questions` plays exactly those (a daily). `onFinish` fires once when a game ends. */
export type PeckingSoloProps = {
  lists?: PeckList[];
  questions?: PK.PeckQuestion[];
  count?: number;
  onFinish?: (s: PK.PeckState) => void;
  daily?: boolean;
  backHref?: string;
  backLabel?: string;
};

/** The deal is random and reads the clock, so nothing is built until the browser has taken over from the server render. */
export function PeckingSolo(props: PeckingSoloProps) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <PixelShell world="ladder"><div className="party-page pk-page"><p className="pk-list">Dealing the first question...</p></div></PixelShell>;
  return <Game {...props} />;
}

const deal = (p: PeckingSoloProps, avoid?: string[]) =>
  PK.init({ players: [ME], lists: p.lists ?? [], mode: "mixed", count: p.count ?? 6, avoid, seed: Math.floor(Math.random() * 2 ** 31), now: Date.now(), questions: p.questions });

function Game(props: PeckingSoloProps) {
  const { daily, onFinish, backHref = "/pecking", backLabel = "All lists" } = props;
  const [s, setS] = useState(() => deal(props));
  const [rank, setRank] = useState<{ round: number; v: number } | null>(null);
  const [typed, setTyped] = useState<{ round: number; t: string } | null>(null);

  // The clock: a timeout closes the question and a reveal moves on. The state changes only inside the interval callback.
  useEffect(() => {
    const id = setInterval(() => setS((p) => PK.tick(p, Date.now())), 250);
    return () => clearInterval(id);
  }, []);

  const finish = useRef(onFinish);
  useEffect(() => { finish.current = onFinish; }, [onFinish]);
  const told = useRef(false);
  useEffect(() => {
    if (!s.done) { told.current = false; return; }
    if (s.questions.length > 0 && !told.current) { told.current = true; finish.current?.(s); }
  }, [s]);
  useEffect(() => { window.scrollTo(0, 0); }, [s.round, s.phase, s.done]);

  const again = () => { setRank(null); setTyped(null); setS(deal(props, PK.seenKeys(s))); };

  const view = PK.redactFor(s, ME); // the answer stays out of what is rendered until the reveal
  if (s.questions.length === 0) {
    return (
      <PixelShell world="ladder">
        <div className="party-page pk-page">
          <Link href={backHref} className="tr-back">&lt; {backLabel}</Link>
          <section className="px-box pk-card"><h2>Nothing to ask</h2><p>This list has no questions yet.</p></section>
        </div>
      </PixelShell>
    );
  }

  if (s.done) {
    const total = s.points[ME] ?? 0;
    const max = s.questions.length * 100;
    return (
      <PixelShell world="ladder">
        <div className="party-page pk-page">
          <section className={`px-box pk-card pk-winner ${total >= max * 0.7 ? "px-confetti" : ""}`}>
            <p className="pk-list">Pecking Order</p>
            <h2>{total.toLocaleString("en-US")} / {max.toLocaleString("en-US")}</h2>
            <p>{total >= max * 0.8 ? "Sharp eye." : total >= max * 0.5 ? "Solid roost." : total >= max * 0.25 ? "A few feathers ruffled." : "Back to the nest."}</p>
          </section>
          <section className="px-box pk-card" aria-label="The answers">
            <h3 className="pk-sub">The answers</h3>
            <ul className="pk-recap">
              {view.questions.map((q, i) => {
                const sc = s.history[i]?.scores[ME];
                return q.answer && (
                  <li key={i}>
                    <span className="q">{q.kind === "rank" ? q.item : `#${q.at}`} <em>{q.title}</em></span>
                    <b>{q.kind === "rank" ? spanText(q.answer.span) : q.answer.names.join(" / ")}</b>
                    <span className="q"><em>You: {guessText(sc)}</em></span>
                    <b>+{sc?.points ?? 0}</b>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="party-actions">
            {!daily && <PixelButton variant="gold" onClick={again}>Play again</PixelButton>}
            <Link href={backHref} className="px-btn alt no-underline">{backLabel}</Link>
          </div>
        </div>
      </PixelShell>
    );
  }

  const q = view.questions[s.round]!;
  const asking = s.phase === "question";
  const phaseMs = asking ? PK.QUESTION_MS : PK.REVEAL_MS;
  const value = rank?.round === s.round ? rank.v : Math.ceil(q.size / 2);
  const text = typed?.round === s.round ? typed.t : "";
  const last = !asking ? s.history[s.history.length - 1] : undefined;
  const mine = last?.scores[ME];

  return (
    <PixelShell world="ladder">
      <div className="party-page pk-page">
        <Link href={backHref} className="tr-back">&lt; {backLabel}</Link>
        <header className="pk-head">
          <span className="stat"><em>Question</em><b>{s.round + 1}<small>/{view.total}</small></b></span>
          <span className="stat"><em>Score</em><b>{(s.points[ME] ?? 0).toLocaleString("en-US")}</b></span>
          <PartyClock key={`${s.round}${s.phase}`} deadline={s.phaseAt + phaseMs} offset={0} total={phaseMs} />
        </header>
        <section className="px-box pk-card">
          <PeckPrompt q={q} />
          {asking && (q.kind === "rank" ? (
            <>
              <RankPicker size={q.size} value={value} onChange={(v) => setRank({ round: s.round, v })} />
              <PixelButton variant="gold" className="pk-go" onClick={() => setS((p) => PK.guessRank(p, ME, value, Date.now()))}>Lock #{value}</PixelButton>
            </>
          ) : (
            <NamePicker choices={q.choices ?? []} taken={[]} text={text} onText={(t) => setTyped({ round: s.round, t })} onPick={(n) => setS((p) => PK.pickName(p, ME, n, Date.now()))} />
          ))}
          {!asking && last && <PeckReveal q={q} scores={last.scores} players={[ME]} me={ME} />}
          {mine && <p className={`pk-mine ${mine.points > 0 ? "good" : "bad"}`} role="status">{mine.guess == null && !mine.name ? "No answer this time." : mine.points === 100 ? "Spot on! +100" : mine.points > 0 ? `+${mine.points}` : q.kind === "name" && !mine.span ? `${guessText(mine)} is not on the list.` : "Way off."}</p>}
        </section>
        {!asking && <PixelButton variant="gold" className="pk-go" onClick={() => setS((p) => PK.next(p, Date.now()))}>{s.round + 1 >= view.total ? "Final score >" : "Next question >"}</PixelButton>}
      </div>
    </PixelShell>
  );
}
