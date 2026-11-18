"use client";

// NPAT's presentational pieces: the letter tile, the fill board, the vote card, the reveal, the round summary and the
// table. No room controller, and data-free on purpose: room bundles ship to every phone, so nothing here may import
// the answer lists (see npat/boundary.test).
import type { ReactNode } from "react";
import { Sprite } from "../../components/pixel/Sprite";
import type { NPAnswer, NPRound, NPView } from "../../topicDraft/formats/npat";
import { categoryOf } from "../../topicDraft/npat/categories";
import { own } from "../../topicDraft/party/own";
import { TEAM_COLORS, teamName } from "../teamMoves";
import { bestAnswer, groupAnswers, missLabel, placeOf, roundTotals, tierBadge, type NPGroup } from "./npatBoard";
import { playerSprite } from "./partyBits";

export const catTitle = (id: string) => categoryOf(id)?.title ?? id;
const fmt = (n: number) => n.toLocaleString("en-US");
const seatOf = (s: Pick<NPView, "players">, p: string) => Math.max(0, s.players.indexOf(p));

/** The round's letter, big. */
export function LetterTile({ letter, big = false }: { letter: string; big?: boolean }) {
  return <div className={`np-letter ${big ? "big" : ""}`} role="img" aria-label={`Letter ${letter}`}><span aria-hidden>{letter}</span></div>;
}

/** The screen while writing: how many answers each player has filled in, never what they wrote. */
export function FillBoard({ s, gone }: { s: NPView; gone: string[] }) {
  const n = s.categories.length;
  return (
    <ul className="np-fill" aria-label="Answers filled in">
      {s.players.map((p, i) => {
        const f = own(s.filled, p) ?? 0;
        const done = s.submitted.includes(p);
        return (
          <li key={p} className={`${done ? "done" : ""} ${gone.includes(p) ? "is-gone" : ""}`}>
            <Sprite sprite={playerSprite(i)} size={20} />
            <span className="n">{p}</span>
            <b aria-label={`${f} of ${n} filled${done ? ", done" : ""}`}>{done ? "Done" : `${f}/${n}`}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** One tier badge or, for an answer that scored nothing, why. */
function Badge({ g }: { g: NPGroup }) {
  const b = g.kind === "ok" || g.kind === "accepted" ? tierBadge({ status: "ok", tier: g.tier ?? undefined, points: g.points }) : null;
  if (b) return <span className={`np-badge t-${b.tier}`}>{b.label} <b>+{b.points}</b></span>;
  if (g.kind === "blank") return null; // the line itself already reads "—"
  return <span className="np-badge miss">{missLabel(g.kind)}</span>;
}

/** One category's answers, all turned over at once: matching answers grouped, with their tier, points and who gave them. */
export function RevealList({ s, round, cat, me, big = false }: { s: NPView; round: NPRound; cat: number; me: string; big?: boolean }) {
  const answers: Record<string, NPAnswer> = {};
  for (const p of s.players) { const a = own(round.answers, p)?.[cat]; if (a) answers[p] = a; }
  const groups = groupAnswers(answers, s.players);
  return (
    <ul key={`${s.round}.${cat}`} className={`np-groups ${big ? "big" : ""}`} aria-label={`Answers for ${catTitle(s.categories[cat] ?? "")}`}>
      {groups.map((g) => (
        <li key={g.key} className={`k-${g.kind} ${g.members.includes(me) ? "me" : ""}`}>
          <div className="top">
            <span className="txt">{g.text}</span>
            <Badge g={g} />
          </div>
          {g.typed.length > 0 && (g.typed.length > 1 || g.typed[0] !== g.text) && <p className="as">typed as {g.typed.join(", ")}</p>}
          <p className="who">
            {g.members.map((p) => <span key={p}><Sprite sprite={playerSprite(seatOf(s, p))} size={14} />{p === me ? "You" : p}</span>)}
            {g.kind === "accepted" && <em>voted in</em>}
            {g.shared && <em className="shared">shared, half points</em>}
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The open vote: the answer the lists don't know, and how many have voted. Who gave it stays off the card. */
export function VoteCard({ s, children, big = false }: { s: NPView; children?: ReactNode; big?: boolean }) {
  const v = s.vote;
  if (!v) return null;
  return (
    <section className={`px-box np-card np-vote ${big ? "big" : ""}`} aria-label="Vote">
      <p className="np-eyebrow">Not on our list · {catTitle(s.categories[s.cat] ?? "")}</p>
      <h2 className="np-vote-text">{v.text}</h2>
      <p className="np-msg">Does it count as a {catTitle(s.categories[s.cat] ?? "").toLowerCase()} starting with {s.letter}?</p>
      {children}
      <p className="np-msg" role="status">{v.voted.length} of {v.voters.length} voted</p>
    </section>
  );
}

/** After a round's last category: each player's round, best first, and the round's best answer. */
export function RoundSummary({ s, round, me }: { s: NPView; round: NPRound; me: string }) {
  const totals = roundTotals(round, s.players);
  const rows = s.players.map((p, seat) => ({ p, seat, n: totals[p] ?? 0 })).sort((a, b) => b.n - a.n || a.seat - b.seat);
  const best = bestAnswer(round, s.players, s.categories);
  return (
    <section className="px-box np-card" aria-label="Round results">
      <p className="np-eyebrow">Round {s.history.length} of {s.rounds} · letter {round.letter}</p>
      <h2 className="np-title">Round results</h2>
      <ol className="np-table">
        {rows.map((r, i) => (
          <li key={r.p} className={r.p === me ? "me" : ""}>
            <span className="rk">{placeOf(rows.map((x) => x.n), i)}</span>
            <Sprite sprite={playerSprite(r.seat)} size={18} />
            <span className="name">{r.p}</span>
            <b>+{fmt(r.n)}</b>
          </li>
        ))}
      </ol>
      {best && <p className="np-best">Best answer: <b>{best.text}</b> ({catTitle(best.category)}) by {best.player === me ? "you" : best.player}, +{best.points}</p>}
    </section>
  );
}

/** Everyone's total, best first with shared places, and the teams' totals (the engine's own) when teams play. */
export function NPTable({ s, me, gone, label = "Scores" }: { s: NPView; me: string | null; gone: string[]; label?: string }) {
  const rows = s.players.map((p, seat) => ({ p, seat, n: own(s.points, p) ?? 0 })).sort((a, b) => b.n - a.n || a.seat - b.seat);
  const scores = rows.map((r) => r.n);
  const team = (p: string) => (s.teams ? s.teams.findIndex((t) => t.includes(p)) : -1);
  const teams = s.teams ? s.teams.map((m, i) => ({ i, m, n: s.teamPoints[i] ?? 0 })).sort((a, b) => b.n - a.n || a.i - b.i) : [];
  return (
    <section className="px-box np-card np-roster" aria-label={label}>
      <ol className="np-table">
        {rows.map((r, i) => {
          const ti = team(r.p);
          return (
            <li key={r.p} className={`${placeOf(scores, i) === 1 && r.n > 0 ? "top" : ""} ${r.p === me ? "me" : ""} ${gone.includes(r.p) ? "is-gone" : ""}`}>
              <span className="rk">{placeOf(scores, i)}</span>
              <Sprite sprite={playerSprite(r.seat)} size={18} />
              <span className="name">{ti >= 0 && <i className="swatch" style={{ background: TEAM_COLORS[ti] }} aria-hidden />}{r.p}</span>
              <b>{fmt(r.n)}</b>
            </li>
          );
        })}
      </ol>
      {teams.length > 0 && (
        <ol className="np-teams" aria-label="Team totals">
          {teams.map((t) => (
            <li key={t.i} className={me && t.m.includes(me) ? "me" : ""}>
              <i className="swatch" style={{ background: TEAM_COLORS[t.i] }} aria-hidden />
              <span className="name">{teamName(t.i)} team</span>
              <b>{fmt(t.n)}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Every round of a finished game: its letter, the winner of the round and its best answer. */
export function RoundRecap({ s, me }: { s: NPView; me: string | null }) {
  return (
    <ul className="np-recap">
      {s.history.map((r, i) => {
        const best = bestAnswer(r, s.players, s.categories);
        const totals = roundTotals(r, s.players);
        const top = Math.max(0, ...Object.values(totals));
        const lead = top > 0 ? s.players.filter((p) => totals[p] === top) : [];
        return (
          <li key={i}>
            <span className="l" aria-label={`Letter ${r.letter}`}>{r.letter}</span>
            <span className="w">
              <span><b>Round {i + 1}</b>{lead.length ? ` · ${lead.map((p) => (p === me ? "You" : p)).join(" & ")} +${top}` : " · nobody scored"}</span>
              {best && <em>Best: {best.text} ({catTitle(best.category)}), {best.player === me ? "you" : best.player} +{best.points}</em>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
