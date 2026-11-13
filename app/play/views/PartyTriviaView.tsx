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
import { has, own } from "../../topicDraft/party/own";
import { canMoveOn, DrinkCard, LeaveGame, PartyClock, playerSprite, WaitingForHost, WaterLine } from "./partyBits";
import { playerStats, rankLabel, scoreDigits, standings, teamIndexOf, votesFor, winnerOf, type Standing } from "./quizBoard";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";

const SCENE = "A row of glowing arcade cabinets in a dark room, with someone playing the big quiz machine in the middle";
const LETTERS = ["A", "B", "C", "D", "E", "F"];
/** A beat with the buttons dark before the answer lights up. */
const REVEAL_BEAT_MS = 700;
/** If the server hasn't confirmed a tap by now it was lost, so the buttons come back. */
const TAP_RETRY_MS = 3000;
/** A buzz time as seconds with milliseconds: 1234 reads 1.234s. */
const buzzTime = (ms: number) => `${(ms / 1000).toFixed(3)}s`;

const TROPHY: SpriteData = {
  rows: ["..GGGGGGGG..", "XXGWGGGGGDXX", "X.GWGGGGGD.X", "X.GWGGGGGD.X", ".XGGGGGGGDX.", "..GGGGGGGD..", "...GGGGGD...", "....GGGD....", ".....GD.....", ".....GD.....", "...GGGGDD...", "..KKKKKKKK.."],
  pal: { G: "#ffd23f", W: "#fff6c2", D: "#d0902a", X: "#d0902a", K: "#7a4f2c" },
};
const COIN: SpriteData = {
  rows: ["..XXXX..", ".XGGGGX.", "XGWGGDGX", "XGWGGDGX", "XGWGGDGX", "XGWGGDGX", ".XGGGGX.", "..XXXX.."],
  pal: { X: "#8a5a12", G: "#ffd23f", W: "#fff6c2", D: "#d0902a" },
};

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
  // A buzz near the end keeps its full answer window, so the question's clock waits for it (the server does the same).
  const deadline = asking ? PT.questionDeadline(s) : s.phaseAt + phaseMs;

  // Buzz mode: the first to buzz answers alone, for their team; a wrong answer locks them (or their team) out.
  const buzzMode = s.answerMode === "buzz";
  const buzzer = buzzMode ? s.buzzer ?? null : null;
  const lockedOut = buzzMode ? s.locked ?? [] : [];
  const missed = buzzMode ? s.missed ?? [] : [];
  const iLocked = lockedOut.includes(me);

  // Tapped but not yet confirmed: shown straight away, because party moves wait for the server. In buzz mode a tap
  // only stands while this seat still holds the buzz: a wrong answer frees it at once.
  const [tap, setTap] = useState<{ round: number; choice: string } | null>(null);
  const confirmed = own(s.answers, me)?.choice;
  useEffect(() => {
    if (!tap || confirmed) return;
    const id = setTimeout(() => setTap(null), TAP_RETRY_MS);
    return () => clearTimeout(id);
  }, [tap, confirmed]);
  const mine = confirmed || (tap?.round === s.round && (!buzzMode || buzzer === me) ? tap.choice : "");

  // When the clock runs out the buttons close and say so, a moment before the server closes the round. Kept per deadline
  // (server time), so a poll's new clock offset can't briefly reopen the buttons, but a late buzz that extends the
  // deadline does reopen them for the buzzer.
  const offset = useRef(ctl.offset);
  offset.current = ctl.offset;
  const [expired, setExpired] = useState<number | null>(null);
  useEffect(() => {
    if (!asking) return;
    const id = setTimeout(() => setExpired(deadline), Math.max(0, deadline - (Date.now() + offset.current)));
    return () => clearTimeout(id);
  }, [asking, deadline]);
  const outOfTime = asking && expired === deadline;

  // Scores wait with the answer, so the table doesn't give the result away first.
  const before = useRef({ points: s.points, teamPoints: s.teamPoints });
  if (asking) before.current = { points: s.points, teamPoints: s.teamPoints };
  const [landed, setLanded] = useState(false);
  const phaseRef = useRef(s.phase);
  const right = !asking ? q.answer : undefined;
  const last = !asking ? s.history[s.history.length - 1] : undefined;
  const scored = last ? (myTeam >= 0 ? last.teamChoice[myTeam] === right : own(last.answers, me) === right) : false;
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
  const teamPick = asking && myTeam >= 0 ? PT.teamChoice(s.teams![myTeam]!.flatMap((p) => { const a = own(s.answers, p); return a?.choice ? [a] : []; })) : null;
  const canAnswer = asking && seated && !mine && !outOfTime && (!buzzMode || buzzer === me);
  const canBuzz = buzzMode && asking && seated && buzzer === null && !iLocked && !outOfTime;
  const myRow = rows.find((r) => r.mine);

  const pick = (choice: string) => {
    if (!canAnswer) return;
    play("click");
    setTap({ round: s.round, choice });
    ctl.dispatch({ type: "answer", by: me, choice });
  };

  // Buzz: one tap in flight at a time; a refusal (someone was first) needs no message, the screen already shows who.
  const buzzing = useRef(false);
  const buzzIn = async () => {
    if (!canBuzz || buzzing.current) return;
    buzzing.current = true;
    play("click");
    try { await ctl.dispatch({ type: "buzz", by: me }); } finally { buzzing.current = false; }
  };

  // Everyone hears a buzz land and a wrong one go down, but only ones that happen while this screen is up.
  const buzzKey = buzzer ? `${s.round}:${buzzer}:${s.buzzAt ?? ""}` : "";
  const heardBuzz = useRef(buzzKey);
  const missKey = `${s.round}:${missed.length}`;
  const heardMiss = useRef(missKey);
  useEffect(() => {
    if (buzzKey && buzzKey !== heardBuzz.current) play("pick");
    heardBuzz.current = buzzKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buzzKey]);
  useEffect(() => {
    if (missKey !== heardMiss.current && missed.length > 0 && asking) play("lose");
    heardMiss.current = missKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missKey]);
  const teamOf = (p: string) => { const i = teamIndexOf(s.teams, p); return i >= 0 ? i : null; };
  const lastMiss = missed.length ? missed[missed.length - 1]! : null;

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
              {asking && lockedOut.length > 0 && <p className="arc-lockedlist"><em>Locked out</em> {lockedOut.join(", ")}</p>}
              {/* Up here too, because a sip card can cover the buttons for its few seconds. */}
              {!asking && landed && <p className="arc-answer"><em>Answer</em> {right}</p>}
            </section>
          </div>

          <div className="arc-deck">
            {outOfTime && !buzzer && <p className="arc-time" role="status">Time!</p>}
            {buzzMode && asking && (
              <BuzzPanel s={s} me={me} seated={seated} buzzer={buzzer} iLocked={iLocked} canBuzz={canBuzz} onBuzz={buzzIn} offset={ctl.offset}
                team={buzzer ? teamOf(buzzer) : null} lastMiss={lastMiss} missTeam={lastMiss ? teamOf(lastMiss) : null} />
            )}
            <ul className={`arc-buttons ${asking ? "" : "reveal"}`} aria-label="Answers">
              {q.options.map((opt, i) => {
                const lit = landed && !asking;
                const isRight = lit && opt === right;
                const isMine = mine === opt;
                const state = isRight ? "right" : lit && isMine ? "wrong" : !asking ? (isMine ? "locked dark" : "dark") : isMine ? "locked" : mine || outOfTime || !seated || (buzzMode && buzzer !== me) ? "dark" : "";
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
            {!asking && landed && <Verdict s={s} me={me} right={right!} scored={scored} buzzMode={buzzMode} />}
            {!asking && landed && (canMoveOn(ctl)
              ? <PixelButton variant="gold" className="arc-next" onClick={() => ctl.dispatch({ type: "next", by: me })}>{s.round + 1 >= s.total ? "Final scores >" : "Next question >"}</PixelButton>
              : <WaitingForHost ctl={ctl} />)}
          </div>

          <Board rows={rows} s={s} asking={asking} landed={landed} gained={gained} right={right} q={q} buzzer={buzzer} lockedOut={buzzMode ? lockedOut : null} />
          <CabinetFoot />
        </div>

        {s.drinks && <WaterLine />}
        {s.drinks && !asking && landed && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        <WorldScene world="arcade" actors={[]} labels={false} track={false} caption={SCENE} />
        {ctl.leave && <LeaveGame onLeave={ctl.leave} />}
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

/**
 * Buzz mode, above the options: a big BUZZ for every seated player who can still buzz, "Locked out" for those who can't,
 * and once someone holds it, who and how fast, with the few seconds they have to answer. The screen seat only watches.
 */
function BuzzPanel({ s, me, seated, buzzer, iLocked, canBuzz, onBuzz, offset, team, lastMiss, missTeam }: {
  s: PT.PTView; me: string; seated: boolean; buzzer: string | null; iLocked: boolean; canBuzz: boolean; onBuzz: () => void; offset: number;
  team: number | null; lastMiss: string | null; missTeam: number | null;
}) {
  if (buzzer) {
    const who = buzzer === me ? "You" : buzzer;
    return (
      <div className="arc-buzzbox">
        <p className="arc-buzzline" role="status">
          <Sprite sprite={playerSprite(Math.max(0, s.players.indexOf(buzzer)))} size={18} />
          <span>
            <b>{who}</b>{team !== null && <> <i className="swatch" style={{ background: TEAM_COLORS[team] }} aria-hidden /><em>{teamName(team)} team</em></>} buzzed in <b className="t">{buzzTime(s.buzzMs ?? 0)}</b>
          </span>
          {s.buzzAt != null && <PartyClock deadline={s.buzzAt + PT.BUZZ_ANSWER_MS} offset={offset} total={PT.BUZZ_ANSWER_MS} />}
        </p>
        <p className="arc-buzzhint">{buzzer === me ? "Pick your answer!" : `${buzzer} is answering${team !== null ? ` for ${teamName(team)} team` : ""}.`}</p>
      </div>
    );
  }
  const miss = lastMiss && <p className="arc-buzzmiss" role="status">-{PT.WRONG_BUZZ}, {missTeam !== null ? `${teamName(missTeam)} team` : lastMiss === me ? "you" : lastMiss} {missTeam !== null || lastMiss !== me ? "is" : "are"} locked out</p>;
  return (
    <div className="arc-buzzbox">
      {miss}
      {!seated ? <p className="arc-buzzhint">First to buzz answers.</p>
        : iLocked ? <p className="arc-buzzout">Locked out</p>
        : <button type="button" className="arc-buzz" disabled={!canBuzz} onClick={onBuzz}>Buzz</button>}
    </div>
  );
}

function Verdict({ s, me, right, scored, buzzMode }: { s: PT.PTView; me: string; right: string; scored: boolean; buzzMode: boolean }) {
  const seated = s.players.includes(me);
  const team = s.teams?.find((t) => t.includes(me));
  const lastRound = s.history[s.history.length - 1];
  const answered = !!lastRound && has(lastRound.answers, me);
  const got = buzzMode && lastRound ? Object.keys(lastRound.answers)[0] : undefined;
  const gotTeam = got ? teamIndexOf(s.teams, got) : -1;
  if (buzzMode && (!scored || !seated)) {
    const line = got ? `${got}${gotTeam >= 0 ? ` (${teamName(gotTeam)} team)` : ""} got it!` : seated ? "Nobody got it." : `The answer: ${right}`;
    return <p className={`arc-verdict ${got && !seated ? "good" : "bad"}`} role="status">{line}</p>;
  }
  const line = !seated ? `The answer: ${right}` : team
    ? scored ? "Your team got it!" : "Your team missed that one."
    : scored ? "Correct!" : answered ? "Not this time." : "Too slow!";
  return <p className={`arc-verdict ${scored ? "good" : "bad"}`} role="status">{line}</p>;
}

/** The high-score table: lamps show who has locked in during a question, and what they picked after it. */
function Board({ rows, s, asking, landed, gained, right, q, buzzer, lockedOut }: { rows: Standing[]; s: PT.PTView; asking: boolean; landed: boolean; gained: (r: Standing) => number; right?: string; q: { options: string[] }; buzzer: string | null; lockedOut: string[] | null }) {
  const last = !asking ? s.history[s.history.length - 1] : undefined;
  const letter = (choice: string | null | undefined) => (choice ? LETTERS[q.options.indexOf(choice)] ?? "-" : "-");
  return (
    <section className={`arc-board ${asking && rows.length > 6 ? "two" : ""}`} aria-label="High scores">
      <h2><Sprite sprite={COIN} size={12} /> High scores</h2>
      <ol>
        {rows.map((r) => {
          const teamRow = !!s.teams;
          const locked = r.members.filter((p) => has(s.answers, p)).length;
          const choice = last ? (teamRow ? last.teamChoice[r.id] : own(last.answers, r.label)) : null;
          const gain = gained(r);
          return (
            <li key={r.id} className={r.mine ? "mine" : ""}>
              <span className="rank">{rankLabel(r.rank)}</span>
              {teamRow ? <i className="swatch" style={{ background: TEAM_COLORS[r.id] }} aria-hidden /> : <Sprite sprite={playerSprite(r.id)} size={16} />}
              <span className="name">{r.label}</span>
              {asking && lockedOut && (buzzer && r.members.includes(buzzer) ? <span className="bz on">Buzz</span> : r.members.every((m) => lockedOut.includes(m)) ? <span className="bz">Out</span> : null)}
              {asking && !lockedOut && (
                <span className="lamps" role="img" aria-label={teamRow ? `${locked} of ${r.members.length} locked in` : locked ? "Locked in" : "Thinking"}>
                  {r.members.map((m) => <i key={m} className={has(s.answers, m) ? "on" : ""} />)}
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
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
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
