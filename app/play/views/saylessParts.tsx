"use client";

// Say Less's presentational pieces: the clue tape, the budget meter, the reveal and the table. No room controller, and
// data-free on purpose: room bundles ship to every phone, so nothing here may import the word lists (see boundary.test).
import { Sprite } from "../../components/pixel/Sprite";
import type { SLHistory, SLState, SLView } from "../../topicDraft/formats/sayless";
import { currentDescriber } from "../../topicDraft/formats/sayless";
import { own } from "../../topicDraft/party/own";
import { JUDGE_MS, REVEAL_MS, SPEAK_MS, WORD_MS } from "../../topicDraft/sayless/rules";
import { TEAM_COLORS, teamName } from "../teamMoves";
import { playerSprite } from "./partyBits";
import { TeamBoard } from "./TeamBoard";

export const describerOf = (s: SLView): string => currentDescriber(s as unknown as SLState);
export const isLive = (s: SLView) => !s.done && (s.phase === "clue" || s.phase === "speak" || s.phase === "judge");
/** One key per word, so a field or a message kept for a word goes stale on its own when the next one starts. */
export const wordKey = (s: SLView) => `${s.turn}.${s.at}`;
const fmt = (n: number) => n.toLocaleString("en-US");
const seatOf = (s: SLView, p: string) => Math.max(0, s.players.indexOf(p));

/** The clock that matters now: the word's minute while describing, the phase's own while saying, judging and revealing. */
export function slClock(s: SLView): { deadline: number; total: number } | null {
  if (s.done) return null;
  if (s.phase === "clue") return { deadline: s.wordAt + WORD_MS, total: WORD_MS };
  const total = s.phase === "speak" ? SPEAK_MS : s.phase === "judge" ? JUDGE_MS : REVEAL_MS;
  return { deadline: s.phaseAt + total, total };
}

/** The describing team's name when teams play, else null. */
export const describingTeam = (s: SLView): string | null => {
  const t = s.turns[s.turn]?.team;
  return t === null || t === undefined || !s.teams ? null : `${teamName(t)} team`;
};

/** "Clue 2 of par 3": the count against par, gold up to par and red past it. */
export function ParCount({ used, par }: { used: number; par: number }) {
  const over = used > par;
  return <p className={`sl-count ${over ? "over" : used === par && used > 0 ? "at" : ""}`}>{used === 0 ? <>No clues yet · par <b>{par}</b></> : <>Clue <b>{used}</b> of par <b>{par}</b>{over ? ` · ${used - par} over` : ""}</>}</p>;
}

/**
 * The clues so far as telegram slips, with empty slips up to par and a PAR post after the par-th one. Clues past par
 * are stamped red. `big` is the screen's version.
 */
export function ClueTape({ clues, par, big = false, label = "Clues so far" }: { clues: string[]; par: number; big?: boolean; label?: string }) {
  const slots = Math.max(clues.length, par);
  return (
    <ol className={`sl-tape ${big ? "big" : ""}`} aria-label={`${label}: ${clues.length ? clues.join(", ") : "none yet"}. Par ${par}.`}>
      {Array.from({ length: slots }, (_, i) => {
        const c = clues[i];
        return [
          <li key={`c${i}`} className={`slip ${c === undefined ? "empty" : ""} ${i >= par ? "over" : ""} ${c !== undefined && i === clues.length - 1 ? "new" : ""}`} aria-hidden>
            {c ?? ""}
          </li>,
          i === par - 1 ? <li key="par" className="par" aria-hidden><span>PAR</span></li> : null,
        ];
      })}
    </ol>
  );
}

/** What is left of the turn's word budget, as a draining row of cells. */
export function BudgetMeter({ budget, start, big = false }: { budget: number; start: number; big?: boolean }) {
  const low = budget <= 2;
  return (
    <div className={`sl-budget ${low ? "low" : ""} ${big ? "big" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={start} aria-valuenow={budget} aria-label={`Budget: ${budget} of ${start} left`}>
      <span className="lbl">Budget</span>
      <span className="cells" aria-hidden>{Array.from({ length: start }, (_, i) => <i key={i} className={i < budget ? "on" : ""} />)}</span>
      <b>{budget} left</b>
    </div>
  );
}

/** What each player got from a finished word: the score both ways, the describer's leftover bonus, the par guard's losses. */
export function gainsOf(h: SLHistory): { p: string; n: number; why: string }[] {
  const out: { p: string; n: number; why: string }[] = [];
  if (h.winner !== null) {
    out.push({ p: h.winner, n: h.points, why: "guessed it" });
    out.push({ p: h.describer, n: h.points, why: "described it" });
  }
  if (h.bonus) out.push({ p: h.describer, n: h.bonus, why: "unused budget" });
  for (const p of Object.keys(h.guarded ?? {})) {
    const n = own(h.guarded!, p) ?? 0;
    if (n > 0) out.push({ p, n: -n, why: "par guard" });
  }
  return out;
}

/** Who describes after this word, or null when it was the game's last. */
export function nextUp(s: SLView, h: SLHistory): { name: string; same: boolean } | null {
  const endsTurn = h.bonus !== undefined; // the engine settles the bonus on a turn's last word
  if (!endsTurn) return { name: h.describer, same: true };
  const n = s.turns[s.turn + 1];
  return n ? { name: n.describer, same: false } : null;
}

/** A finished word for everyone: the word, who got it, clues against par, and every point it moved. */
export function RevealCard({ s, h, me }: { s: SLView; h: SLHistory; me: string }) {
  const you = (p: string) => (p === me ? "You" : p);
  const verdict = h.winner !== null ? `${you(h.winner)} got it` : h.passed ? `${you(h.describer)} passed` : "Nobody got it";
  const gains = gainsOf(h);
  const up = nextUp(s, h);
  return (
    <section className={`px-box sl-reveal ${h.winner !== null ? "won" : "lost"}`} aria-label="The word">
      <p className="sl-eyebrow">The word was</p>
      <h2 className="sl-word" role="status">{h.word}</h2>
      <p className="sl-verdict">{verdict} · {h.clues.length} {h.clues.length === 1 ? "clue" : "clues"}, par {h.par}</p>
      {h.judged && <p className="sl-judged">{h.judged === "call" ? `Judged by ${you(h.describer)}` : `No call from ${you(h.describer)} in time: counted right`}</p>}
      {h.clues.length > 0 && <ClueTape clues={h.clues} par={h.par} label="The clues" />}
      {gains.length > 0 && (
        <ul className="sl-gains">
          {gains.map((g, i) => (
            <li key={i} className={`${g.n < 0 ? "minus" : ""} ${g.p === me ? "me" : ""}`}>
              <Sprite sprite={playerSprite(seatOf(s, g.p))} size={18} />
              <span className="who">{g.p}</span>
              <span className="why">{g.why}</span>
              <b>{g.n > 0 ? `+${g.n}` : g.n}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="sl-next">{up ? (up.same ? `Next word: ${you(up.name)} again` : `Next up: ${up.name === me ? "you describe" : `${up.name} describes`}`) : "That was the last word."}</p>
    </section>
  );
}

/**
 * Everyone's score, and while a word is live what they are doing (never what they typed): describing, buzzed, out on a
 * wrong buzz, said it. After a word, its points. Team totals underneath when teams play.
 */
export function SLRoster({ s, me, gone }: { s: SLView; me: string; gone: string[] }) {
  const d = describerOf(s);
  const live = isLive(s);
  const h = s.phase === "reveal" && !s.done ? s.history[s.history.length - 1] : undefined;
  const gained = new Map<string, number>();
  if (h) for (const g of gainsOf(h)) gained.set(g.p, (gained.get(g.p) ?? 0) + g.n);
  const rows = s.players.map((p, i) => ({ p, i, score: own(s.points, p) ?? 0 })).sort((a, b) => b.score - a.score || a.i - b.i);
  const team = (p: string) => (s.teams ? s.teams.findIndex((t) => t.includes(p)) : -1);
  return (
    <section className="px-box sl-roster" aria-label="Scores">
      <ol>
        {rows.map(({ p, i, score }) => {
          const g = gained.get(p) ?? 0;
          const tag = g ? (g > 0 ? `+${g}` : `${g}`)
            : !live ? ""
            : p === d ? "DESCRIBING"
            : s.buzzer === p ? (s.phase === "judge" ? "SAID IT" : "BUZZED")
            : s.locked.includes(p) ? "OUT"
            : s.guessers.includes(p) ? "" : "WATCHING";
          const ti = team(p);
          return (
            <li key={p} className={`${p === me ? "me" : ""} ${p === d && live ? "desc" : ""} ${g < 0 ? "minus" : g > 0 ? "plus" : ""} ${gone.includes(p) ? "is-gone" : ""}`}>
              <Sprite sprite={playerSprite(i)} size={20} />
              <span className="name">{ti >= 0 && <i className="swatch" style={{ background: TEAM_COLORS[ti] }} aria-hidden />}{p}</span>
              <span className="tag">{tag}</span>
              <b>{fmt(score)}</b>
            </li>
          );
        })}
      </ol>
      {s.teams && <TeamBoard points={s.points} teams={s.teams} me={me} />}
    </section>
  );
}
