"use client";

import { useEffect, useRef, useState } from "react";
import * as PT from "../../topicDraft/formats/partytrivia";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { Sprite } from "../../components/pixel/Sprite";
import type { Sprite as SpriteData } from "../../components/pixel/sprites";
import { WorldScene } from "../../components/pixel/WorldScene";
import { useSound } from "../../components/SoundProvider";
import { category } from "../categories";
import { TEAM_COLORS, teamName } from "../teamMoves";
import { DrinkCard, PartyClock, playerSprite, WaterLine } from "./partyBits";
import { playerStats, rankLabel, scoreDigits, standings, teamIndexOf, votesFor, winnerOf, type Standing } from "./quizBoard";
import { syncGameKey } from "./signal";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const SCENE = "A row of glowing arcade cabinets in a dark room, with someone playing the big quiz machine in the middle";
const LETTERS = ["A", "B", "C", "D", "E", "F"];
/** A beat with the buttons dark before the answer lights up. */
const REVEAL_BEAT_MS = 700;
/** If the server hasn't confirmed a tap by now it was lost, so the buttons come back. */
const TAP_RETRY_MS = 3000;

const TROPHY: SpriteData = {
  rows: ["..GGGGGGGG..", "XXGWGGGGGDXX", "X.GWGGGGGD.X", "X.GWGGGGGD.X", ".XGGGGGGGDX.", "..GGGGGGGD..", "...GGGGGD...", "....GGGD....", ".....GD.....", ".....GD.....", "...GGGGDD...", "..KKKKKKKK.."],
  pal: { G: "#ffd23f", W: "#fff6c2", D: "#d0902a", X: "#d0902a", K: "#7a4f2c" },
};
const COIN: SpriteData = {
  rows: ["..XXXX..", ".XGGGGX.", "XGWGGDGX", "XGWGGDGX", "XGWGGDGX", "XGWGGDGX", ".XGGGGX.", "..XXXX.."],
  pal: { X: "#8a5a12", G: "#ffd23f", W: "#fff6c2", D: "#d0902a" },
};

/** Keys sip cards to this game. The seed is hidden during play, so it hashes the first question, which every seat has. */
const gameKey = (s: { questions: { q: string }[] }) => syncGameKey([{ id: s.questions[0]?.q ?? "" }]);

/** The lit sign on top of the cabinet. */
function Marquee({ topic, children }: { topic?: string; children: React.ReactNode }) {
  const bulbs = <span className="bulbs" aria-hidden>{Array.from({ length: 14 }, (_, i) => <i key={i} />)}</span>;
  return (
    <header className="arc-marquee">
      {bulbs}
      <div className="sign">
        <h1>{children}</h1>
        {topic && <p>{topic}</p>}
      </div>
      {bulbs}
    </header>
  );
}

function CabinetFoot() {
  return (
    <div className="arc-foot" aria-hidden>
      <span className="grille" />
      <span className="slot"><Sprite sprite={COIN} size={14} /><i /></span>
      <span className="grille" />
    </div>
  );
}

/** Party trivia as a quiz cabinet: the question on the CRT, four lit buttons below it, and the high-score table underneath. */
export function PartyTriviaView({ setup, ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as PT.PTView;
  const me = ctl.me ?? "";
  const q = s.questions[s.round]!;
  const seated = s.players.includes(me);
  const myTeam = teamIndexOf(s.teams, me);
  const asking = s.phase === "question";
  const phaseMs = asking ? PT.QUESTION_MS : PT.REVEAL_MS;
  const deadline = s.phaseAt + phaseMs;

  // Tapped but not yet confirmed: shown straight away, because party moves wait for the server.
  const [tap, setTap] = useState<{ round: number; choice: string } | null>(null);
  const confirmed = s.answers[me]?.choice;
  useEffect(() => {
    if (!tap || confirmed) return;
    const id = setTimeout(() => setTap(null), TAP_RETRY_MS);
    return () => clearTimeout(id);
  }, [tap, confirmed]);
  const mine = confirmed || (tap?.round === s.round ? tap.choice : "");

  // When the clock runs out the buttons close and say so, a moment before the server closes the round. Kept per question,
  // and the timer is only set again for a new question, so a poll's new clock offset can't briefly reopen the buttons.
  const offset = useRef(ctl.offset);
  offset.current = ctl.offset;
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => setExpired(s.phaseAt), Math.max(0, deadline - (Date.now() + offset.current)));
    return () => clearTimeout(id);
  }, [asking, deadline, s.phaseAt]);
  const outOfTime = asking && expired === s.phaseAt;

  // Scores wait with the answer, so the table doesn't give the result away first.
  const before = useRef({ points: s.points, teamPoints: s.teamPoints });
  if (asking) before.current = { points: s.points, teamPoints: s.teamPoints };
  const [landed, setLanded] = useState(false);
  const phaseRef = useRef(s.phase);
  const right = !asking ? q.answer : undefined;
  const last = !asking ? s.history[s.history.length - 1] : undefined;
  const scored = last ? (myTeam >= 0 ? last.teamChoice[myTeam] === right : last.answers[me] === right) : false;
  useEffect(() => {
    const was = phaseRef.current;
    phaseRef.current = s.phase;
    if (asking) {
      setLanded(false);
      if (was !== "question") play("pick");
      return;
    }
    if (was !== "reveal") play("reveal");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = setTimeout(() => {
      setLanded(true);
      if (was !== "reveal" && seated) play(scored ? "win" : "wrong");
    }, still || was === "reveal" ? 0 : REVEAL_BEAT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.round]);

  useEffect(() => { window.scrollTo(0, 0); }, [s.round]); // each question starts at the top of the screen

  const shown = landed || asking ? s : { ...s, ...before.current };
  const rows = standings(shown, me);
  const gained = (r: Standing) => {
    if (asking || !landed) return 0;
    return s.teams ? (s.teamPoints[r.id] ?? 0) - (before.current.teamPoints[r.id] ?? 0) : (s.points[r.label] ?? 0) - (before.current.points[r.label] ?? 0);
  };

  const votes = votesFor(s.answers);
  const teamPick = asking && myTeam >= 0 ? PT.teamChoice(s.teams![myTeam]!.flatMap((p) => (s.answers[p]?.choice ? [s.answers[p]!] : []))) : null;
  const canAnswer = asking && seated && !mine && !outOfTime;
  const myRow = rows.find((r) => r.mine);

  const pick = (choice: string) => {
    if (!canAnswer) return;
    play("click");
    setTap({ round: s.round, choice });
    ctl.dispatch({ type: "answer", by: me, choice });
  };

  return (
    <PixelShell world="arcade">
      <div className="party-page arc-page">
        <div className="arc-cab">
          <Marquee topic={category(setup.pool)?.title}>Party Trivia</Marquee>

          <div className="arc-bezel">
            <section className="arc-crt">
              <div className="arc-hud">
                <span className="stat"><em>Question</em><b>{String(s.round + 1).padStart(2, "0")}<small>/{s.total}</small></b></span>
                {myRow && <span className="stat"><em>{s.teams ? `${teamName(myRow.id)} team` : "Score"}</em><b>{scoreDigits(myRow.score)}</b></span>}
                <PartyClock deadline={deadline} offset={ctl.offset} total={phaseMs} />
              </div>
              <h2 className="arc-question" aria-live="polite">{q.q}</h2>
              {/* Up here too, because a sip card can cover the buttons for its few seconds. */}
              {!asking && landed && <p className="arc-answer"><em>Answer</em> {right}</p>}
            </section>
          </div>

          <div className="arc-deck">
            {outOfTime && <p className="arc-time" role="status">Time!</p>}
            <ul className={`arc-buttons ${asking ? "" : "reveal"}`} aria-label="Answers">
              {q.options.map((opt, i) => {
                const lit = landed && !asking;
                const isRight = lit && opt === right;
                const isMine = mine === opt;
                const state = isRight ? "right" : lit && isMine ? "wrong" : !asking ? (isMine ? "locked dark" : "dark") : isMine ? "locked" : mine || outOfTime || !seated ? "dark" : "";
                const backers = votes[opt] ?? [];
                const showBackers = (asking ? myTeam >= 0 : lit) && backers.length > 0; // who picked what stays with the team until the reveal
                const showMine = isMine && (asking || lit);
                return (
                  <li key={opt}>
                    <button type="button" className={`arc-btn c${i % 4} ${state}`} disabled={!canAnswer} aria-pressed={asking ? isMine : undefined} onClick={() => pick(opt)}>
                      <span className="lamp" aria-hidden>{LETTERS[i]}</span>
                      <span className="face">
                        <span className="text">{opt}</span>
                        {(isRight || showMine || teamPick === opt || showBackers) && (
                          <span className="tags">
                            {isRight && <span className="tag answer">Answer</span>}
                            {showMine && <span className="tag">{asking ? "Locked in" : "Your pick"}</span>}
                            {teamPick === opt && <span className="tag">Team pick</span>}
                            {showBackers && <Backers names={backers} players={s.players} />}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {!asking && landed && <Verdict s={s} me={me} right={right!} scored={scored} />}
            {!asking && landed && ctl.host === me && (
              <PixelButton variant="gold" className="arc-next" onClick={() => ctl.dispatch({ type: "next", by: me })}>{s.round + 1 >= s.total ? "Final scores >" : "Next question >"}</PixelButton>
            )}
          </div>

          <Board rows={rows} s={s} asking={asking} landed={landed} gained={gained} right={right} q={q} />
          <CabinetFoot />
        </div>

        {s.drinks && <WaterLine />}
        {s.drinks && !asking && landed && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={gameKey(s)} names={s.players} />}
        <WorldScene world="arcade" actors={[]} labels={false} track={false} caption={SCENE} />
      </div>
    </PixelShell>
  );
}

/** Little players on an answer: who has picked it, among those this seat may see. */
function Backers({ names, players }: { names: string[]; players: string[] }) {
  return (
    <span className="backers" role="img" aria-label={`Picked by ${names.join(", ")}`}>
      {names.map((n) => <Sprite key={n} sprite={playerSprite(players.indexOf(n))} size={16} />)}
    </span>
  );
}

function Verdict({ s, me, right, scored }: { s: PT.PTView; me: string; right: string; scored: boolean }) {
  const seated = s.players.includes(me);
  const team = s.teams?.find((t) => t.includes(me));
  const answered = !!s.history[s.history.length - 1]?.answers[me];
  const line = !seated ? `The answer: ${right}` : team
    ? scored ? "Your team got it!" : "Your team missed that one."
    : scored ? "Correct!" : answered ? "Not this time." : "Too slow!";
  return <p className={`arc-verdict ${scored ? "good" : "bad"}`} role="status">{line}</p>;
}

/** The high-score table: lamps show who has locked in during a question, and what they picked after it. */
function Board({ rows, s, asking, landed, gained, right, q }: { rows: Standing[]; s: PT.PTView; asking: boolean; landed: boolean; gained: (r: Standing) => number; right?: string; q: { options: string[] } }) {
  const last = !asking ? s.history[s.history.length - 1] : undefined;
  const letter = (choice: string | null | undefined) => (choice ? LETTERS[q.options.indexOf(choice)] ?? "-" : "-");
  return (
    <section className={`arc-board ${asking && rows.length > 6 ? "two" : ""}`} aria-label="High scores">
      <h2><Sprite sprite={COIN} size={12} /> High scores</h2>
      <ol>
        {rows.map((r) => {
          const teamRow = !!s.teams;
          const locked = r.members.filter((p) => p in s.answers).length;
          const choice = last ? (teamRow ? last.teamChoice[r.id] : last.answers[r.label]) : null;
          const gain = gained(r);
          return (
            <li key={r.id} className={r.mine ? "mine" : ""}>
              <span className="rank">{rankLabel(r.rank)}</span>
              {teamRow ? <i className="swatch" style={{ background: TEAM_COLORS[r.id] }} aria-hidden /> : <Sprite sprite={playerSprite(r.id)} size={16} />}
              <span className="name">{r.label}</span>
              {asking && (
                <span className="lamps" role="img" aria-label={teamRow ? `${locked} of ${r.members.length} locked in` : locked ? "Locked in" : "Thinking"}>
                  {r.members.map((m) => <i key={m} className={m in s.answers ? "on" : ""} />)}
                </span>
              )}
              {!asking && landed && <span className={`pick ${choice === right ? "ok" : "no"}`} aria-label={choice ? `Picked ${letter(choice)}` : "No answer"}>{letter(choice)}</span>}
              {gain > 0 && <span className="gain">+{gain}</span>}
              <b className="score">{scoreDigits(r.score)}</b>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Game over: the winner in lights, the final table, and who carried whom. */
export function PartyTriviaResults({ setup, ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as PT.PTState;
  const me = ctl.me;
  const rows = standings(s, me);
  const result = winnerOf(rows);
  const total = s.questions.length;
  const headline = result.kind === "win" ? `${result.row.label} wins!` : result.kind === "tie" ? "It's a tie!" : "Nobody scored";
  const sub = result.kind === "tie" ? result.rows.map((r) => r.label).join(" and ") : result.kind === "win" ? `${scoreDigits(result.row.score)} points` : "Better luck on the next credit.";
  return (
    <PixelShell world="arcade">
      <div className="party-page arc-page">
        <div className="arc-cab">
          <Marquee topic={category(setup.pool)?.title}>Game over</Marquee>
          <div className="arc-bezel">
            <section className={`arc-crt arc-winner ${result.kind === "win" ? "px-confetti" : ""}`}>
              {result.kind !== "none" && <Sprite sprite={TROPHY} size={48} />}
              <h2>{headline}</h2>
              <p>{sub}</p>
            </section>
          </div>
          <section className="arc-board final" aria-label="Final scores">
            <h2><Sprite sprite={COIN} size={12} /> Final scores</h2>
            <ol>
              {rows.map((r) => (
                <li key={r.id} className={`${r.mine ? "mine" : ""} ${r.rank === 1 && r.score > 0 ? "top" : ""}`}>
                  <span className="rank">{rankLabel(r.rank)}</span>
                  {s.teams ? <i className="swatch" style={{ background: TEAM_COLORS[r.id] }} aria-hidden /> : <Sprite sprite={playerSprite(r.id)} size={16} />}
                  <span className="name">{r.label}</span>
                  <b className="score">{scoreDigits(r.score)}</b>
                </li>
              ))}
            </ol>
          </section>
          <section className="arc-board stats" aria-label="Right answers">
            <h2>{s.teams ? "Who carried the team" : "Right answers"}</h2>
            {s.teams ? rows.map((r) => <StatList key={r.id} s={s} members={r.members} total={total} title={r.label} color={TEAM_COLORS[r.id]} />) : <StatList s={s} members={s.players} total={total} />}
          </section>
          {onRematch && (
            <div className="party-actions arc-actions">
              <PixelButton variant="gold" onClick={onRematch}>Play again</PixelButton>
              <PixelButton variant="alt" onClick={onAgain}>Pick another game</PixelButton>
            </div>
          )}
          <CabinetFoot />
        </div>
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={gameKey(s)} names={s.players} />}
        <WorldScene world="arcade" actors={[]} labels={false} track={false} caption={SCENE} />
      </div>
    </PixelShell>
  );
}

function StatList({ s, members, total, title, color }: { s: PT.PTState; members: string[]; total: number; title?: string; color?: string }) {
  return (
    <div className="statlist">
      {title && <h3><i className="swatch" style={{ background: color }} aria-hidden /> {title}</h3>}
      <ul>
        {playerStats(s, members).map((p) => (
          <li key={p.name}>
            <Sprite sprite={playerSprite(p.seat)} size={16} />
            <span className="name">{p.name}</span>
            {title && p.carried && <span className="carried">Carried</span>}
            <span className="count">{p.correct}/{total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
