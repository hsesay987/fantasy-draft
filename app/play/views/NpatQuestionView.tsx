"use client";

// NPAT question style in a room: each round the reel draws a letter and one question comes up ("Something you'd bring
// to a beach"). Phones answer in 20 seconds; the judge checks every answer, then everyone's answers and points show.
// It plays on the dig's engine, so the answering desk and the screen's ask come from NpatDigView. Data-free like the
// dig's view: it reads only what the server sends.
import { useEffect, useRef } from "react";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { useSound } from "../../components/SoundProvider";
import SlotReel from "../../npat/dig/SlotReel";
import type { DigAnswer, DigView } from "../../topicDraft/formats/npatDig";
import { DIG_ANSWER_MS } from "../../topicDraft/npat/rules";
import { own } from "../../topicDraft/party/own";
import { teamName } from "../teamMoves";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { AskDesk, TvAsk } from "./NpatDigView";
import { digRanked } from "./npatDigBoard";
import { canMoveOn, DrinkCard, LeaveGame, PartyActions, PartyClock, WaterLine } from "./partyBits";

const scored = (a: DigAnswer | undefined) => !!a && (a.status === "ok" || a.status === "ai-ok");

/** Why an answer scored nothing, in a few words. */
function missNote(a: DigAnswer | undefined, letter: string): string {
  if (!a || a.status === "blank") return "No answer";
  if (a.status === "wrong-letter") return `Doesn't start with ${letter}`;
  return a.reason ? `Not accepted: ${a.reason}` : "Not accepted";
}

export function NpatQuestionView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as DigView;
  const me = ctl.me ?? "";
  const seated = s.players.includes(me);
  const out = (ctl.gone ?? []).includes(me);
  const tv = !seated;
  const question = s.categories[s.cat] ?? "";
  const mine = seated ? own(s.results, me)?.[s.cat] : undefined;
  const verdict = s.phase === "verdict";

  const seen = useRef({ phase: s.phase, cat: s.cat });
  useEffect(() => {
    const was = seen.current;
    seen.current = { phase: s.phase, cat: s.cat };
    if (s.phase === "ask" && (was.phase !== "ask" || was.cat !== s.cat)) play("cardFlip");
    if (s.phase === "verdict" && (was.phase !== "verdict" || was.cat !== s.cat)) play(seated && mine ? (mine.points > 0 ? "win" : "wrong") : "reveal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.cat]);
  useEffect(() => { window.scrollTo(0, 0); }, [s.phase, s.cat]);

  const last = s.cat + 1 >= s.categories.length;
  return (
    <PixelShell world="notebook">
      <div className={`party-page np-page ${tv ? "tv" : ""}`}>
        <header className="np-head">
          <span className="stat"><em>Letter</em><b>{s.phase === "reel" ? "?" : s.letter}</b></span>
          <span className="stat"><em>Round</em><b>{Math.min(s.cat + 1, s.categories.length)}<small>/{s.categories.length}</small></b></span>
          {seated && <span className="stat"><em>Points</em><b>{own(s.points, me) ?? 0}</b></span>}
          {s.phase === "ask" && <PartyClock deadline={s.phaseAt + DIG_ANSWER_MS} offset={ctl.offset} total={DIG_ANSWER_MS} />}
        </header>

        {s.phase === "reel" && (
          <section className="px-box np-card np-winner" aria-label="Drawing the letter">
            <div style={tv ? { transform: "scale(1.6)", transformOrigin: "center", margin: "24px 0" } : undefined}><SlotReel key={s.cat} letter={s.letter} spinning /></div>
            <p className="np-msg" role="status">Round {s.cat + 1} of {s.categories.length}: drawing the letter…</p>
            <p className="np-msg">The question comes up once the letter lands.</p>
          </section>
        )}

        {s.phase === "ask" && (tv || out
          ? <TvAsk s={s} out={out} />
          : <AskDesk key={`${s.startedAt}.${s.cat}`} s={s} me={me} offset={ctl.offset} dispatch={ctl.dispatch} play={play} />)}

        {s.phase === "judge" && (
          <section className="px-box np-card np-winner" aria-label="Judging">
            <p className="np-eyebrow">{question} · {s.letter}</p>
            <h2 className="np-title" role="status">Judging…</h2>
            <p className="np-msg">Checking that every answer fits the question.</p>
          </section>
        )}

        {verdict && seated && mine && <MyAnswer a={mine} letter={s.letter} question={question} />}
        {verdict && <AnswerList s={s} me={me} />}
        {s.phase === "summary" && <Scores s={s} me={me} />}

        {s.phase !== "ask" && canMoveOn(ctl) && (
          <PixelButton variant="alt" className="np-skip" onClick={() => ctl.dispatch({ type: "next", by: me })}>
            {s.phase === "reel" ? "Start >" : s.phase === "judge" ? "Skip the check >" : s.phase === "summary" || last ? "Final scores >" : "Next question >"}
          </PixelButton>
        )}

        {s.drinks && <WaterLine />}
        {s.drinks && s.phase !== "ask" && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        {seated && ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/** This seat's answer to the question just judged, and its points. */
function MyAnswer({ a, letter, question }: { a: DigAnswer; letter: string; question: string }) {
  const ok = scored(a);
  return (
    <section className="px-box np-card np-winner" aria-label="Your answer" role="status">
      <p className="np-eyebrow">{question}</p>
      <h2 className="np-title">{ok ? `+${a.points}` : "No points"}</h2>
      {a.text && <p className="np-msg">You said <b>{a.text}</b></p>}
      {ok && <p className="np-msg">{a.shared ? "Someone else said it too, so it's shared." : "Nobody else said it."}{a.reason === "unchecked" ? " Accepted without a check." : ""}</p>}
      {!ok && <p className="np-msg">{missNote(a, letter)}.</p>}
    </section>
  );
}

/** Everyone's answer to the question just judged, best first. */
function AnswerList({ s, me }: { s: DigView; me: string }) {
  const rows = s.players.map((p) => ({ p, a: own(s.results, p)?.[s.cat] })).sort((x, y) => (y.a?.points ?? 0) - (x.a?.points ?? 0));
  return (
    <section className="px-box np-card" aria-label="Everyone's answers">
      <h3 className="np-sub">Everyone</h3>
      <ul className="np-groups">
        {rows.map(({ p, a }) => (
          <li key={p} className={scored(a) ? "k-ok" : a?.status === "blank" || !a ? "k-blank" : "k-voted-out"}>
            <p className="as">{p}{p === me ? " (you)" : ""}</p>
            <div className="top">
              <span className="txt">{a?.text || "—"}</span>
              {scored(a)
                ? <span className="np-badge"><b>+{a!.points}</b>{a!.shared ? " shared" : ""}</span>
                : <span className="np-badge miss">{a?.status === "wrong-letter" ? "wrong letter" : a?.status === "ai-no" ? "not accepted" : "no answer"}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Points so far, best first, each with what they said every round. */
function Scores({ s, me, label = "Final scores" }: { s: DigView; me: string | null; label?: string }) {
  return (
    <section className="px-box np-card" aria-label={label}>
      <h3 className="np-sub">{label}</h3>
      <ol className="np-groups">
        {digRanked(s).map((r) => (
          <li key={r.name} className={r.points > 0 ? "k-ok" : "k-blank"}>
            <p className="as">#{r.place} · {r.name}{r.name === me ? " (you)" : ""}</p>
            <div className="top">
              <span className="txt">{(own(s.results, r.name) ?? []).filter(scored).length} of {s.categories.length} accepted</span>
              <span className="np-badge"><b>{r.points}</b> pts</span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Every round's question and letter with everyone's answer. */
function Rounds({ s }: { s: DigView }) {
  return (
    <section className="px-box np-card" aria-label="Every round">
      <h3 className="np-sub">Every round</h3>
      <ol className="np-groups">
        {s.categories.map((q, i) => (
          <li key={i} className="k-blank">
            <p className="as">{s.letters?.[i] ?? ""} · {q}</p>
            {s.players.map((p) => {
              const a = own(s.results, p)?.[i];
              return (
                <div key={p} className="top">
                  <span className="txt">{p}: {a?.text || "—"}</span>
                  {scored(a) ? <span className="np-badge"><b>+{a!.points}</b></span> : <span className="np-badge miss">0</span>}
                </div>
              );
            })}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Game over: who scored most, the standings and every round's answers. */
export function NpatQuestionResults({ ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain?: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as DigView;
  const rows = digRanked(s);
  const top = rows[0]?.points ?? 0;
  let headline: string, sub = "";
  if (s.teams) {
    const best = Math.max(...s.teamPoints);
    const lead = s.teamPoints.map((n, i) => (n === best ? i : -1)).filter((i) => i >= 0);
    headline = best <= 0 ? "Nobody scored" : lead.length === 1 ? `${teamName(lead[0]!)} team wins!` : "It's a tie!";
    if (best > 0) sub = lead.length === 1 ? `${best} points` : lead.map((i) => `${teamName(i)} team`).join(" and ");
  } else {
    const won = rows.filter((r) => r.points === top);
    headline = top <= 0 ? "Nobody scored" : won.length === 1 ? `${won[0]!.name} wins!` : "It's a tie!";
    if (top > 0) sub = `${top} points${won.length > 1 ? ` · ${won.map((r) => r.name).join(" and ")}` : ""}`;
  }
  const win = top > 0 && !headline.includes("tie");
  return (
    <PixelShell world="notebook">
      <div className="party-page np-page">
        <section className={`px-box np-card np-winner ${win ? "px-confetti" : ""}`}>
          <p className="np-eyebrow">Name Place Animal Thing · Questions</p>
          <h2 role="status">{headline}</h2>
          {sub && <p>{sub}</p>}
        </section>
        <Scores s={s} me={ctl.me} />
        <Rounds s={s} />
        <PartyActions onAgain={onAgain} onRematch={onRematch} />
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
