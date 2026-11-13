"use client";

// Pecking Order's question and reveal pieces, with no room controller, so solo and daily play can reuse them.
// Data-free on purpose: list metadata and name matching only, never the ranked lists (room bundles ship to every phone).
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { CLOSEST_BONUS, type PeckScore, type PeckView } from "../../topicDraft/formats/pecking";
import { PECKING_META, type PeckMeta } from "../../topicDraft/pecking/meta";
import { normName } from "../../topicDraft/pecking/normName";
import { has } from "../../topicDraft/party/own";
import { Sprite } from "../../components/pixel/Sprite";
import { playerSprite } from "./partyBits";

export type PeckQ = PeckView["questions"][number];

export const peckMeta = (list: string): PeckMeta | undefined => PECKING_META.find((m) => m.id === list);

/** A list value as text: the plain number, with the list's unit (money units go in front). */
export function formatValue(value: number, meta?: Pick<PeckMeta, "unit">): string {
  const n = value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const unit = meta?.unit;
  if (!unit) return n;
  return /\$/.test(unit) ? `${unit}${n}` : `${n} ${unit}`;
}

/** "#4" or a tie's "#4-6". */
export const spanText = (span: [number, number]) => (span[0] === span[1] ? `#${span[0]}` : `#${span[0]}-${span[1]}`);

/** The question as one line: "Where does Nile rank by Length?" or "Who's #7 by Height?". */
export const peckPrompt = (q: PeckQ) => (q.kind === "rank" ? `Where does ${q.item} rank by ${q.stat}?` : `Who's #${q.at} by ${q.stat}?`);

export function PeckPrompt({ q }: { q: PeckQ }) {
  return (
    <div className="pk-prompt">
      <p className="pk-list">{q.title} · {q.size.toLocaleString("en-US")} ranked</p>
      <h2 aria-live="polite">{peckPrompt(q)}</h2>
    </div>
  );
}

export const clampRank = (n: number, size: number) => Math.min(size, Math.max(1, Math.round(n)));

const RUNG = 30;

/** Every rung's number, drawn once per list size: the marker moves over it without redrawing a thousand rows. */
const Rungs = memo(function Rungs({ size }: { size: number }) {
  return (
    <ol className="pk-rungs" aria-hidden>
      {Array.from({ length: size }, (_, i) => <li key={i} data-n={i + 1}>{i + 1}</li>)}
    </ol>
  );
});

/**
 * "Where does it rank?": a vertical ladder 1..size with a marker to drag (it scrolls on long lists), - and + to nudge
 * by one, and a number field. All three set the same clamped value.
 */
export function RankPicker({ size, value, onChange, disabled }: { size: number; value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [draft, setDraft] = useState<string | null>(null);
  const set = (n: number) => { if (!disabled) onChange(clampRank(n, size)); };

  // Keep the marker in view when the buttons or the field move it (a drag scrolls the ladder itself).
  useEffect(() => {
    const b = box.current;
    if (!b || dragging.current) return;
    const y = (value - 1) * RUNG;
    if (y < b.scrollTop + RUNG || y > b.scrollTop + b.clientHeight - 2 * RUNG) b.scrollTop = Math.max(0, y - b.clientHeight / 2);
  }, [value]);

  const at = (e: PointerEvent) => {
    const b = box.current, t = track.current;
    if (!b || !t) return;
    const r = b.getBoundingClientRect();
    if (e.clientY < r.top + RUNG) b.scrollTop -= RUNG; // near an edge, the ladder scrolls under the finger
    else if (e.clientY > r.bottom - RUNG) b.scrollTop += RUNG;
    set(Math.floor((e.clientY - t.getBoundingClientRect().top) / RUNG) + 1);
  };
  const down = (e: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => { if (dragging.current) at(e); };
  const up = () => { dragging.current = false; };

  return (
    <div className={`pk-picker ${disabled ? "off" : ""}`}>
      <div className="pk-ladder" ref={box} style={{ height: Math.min(size, 9) * RUNG }}>
        <div className="pk-track" ref={track} style={{ height: size * RUNG }}
          onClick={(e) => { const n = Number((e.target as HTMLElement).closest("li")?.dataset.n); if (n) set(n); }}>
          <Rungs size={size} />
          <button type="button" className="pk-marker" style={{ top: (value - 1) * RUNG }} disabled={disabled}
            aria-label={`Your guess: #${value}. Drag to move.`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onKeyDown={(e) => { if (e.key === "ArrowUp") { e.preventDefault(); set(value - 1); } else if (e.key === "ArrowDown") { e.preventDefault(); set(value + 1); } }}>
            <span>#{value}</span>
          </button>
        </div>
      </div>
      <div className="pk-tune">
        <button type="button" className="pk-step" disabled={disabled || value <= 1} onClick={() => set(value - 1)} aria-label="One higher up the list">−</button>
        <label className="pk-num">
          <span>#</span>
          <input type="number" inputMode="numeric" min={1} max={size} step={1} disabled={disabled} aria-label={`Rank, 1 to ${size}`}
            value={draft ?? String(value)}
            onChange={(e) => { setDraft(e.target.value); const n = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(n)) set(n); }}
            onBlur={() => setDraft(null)} />
        </label>
        <button type="button" className="pk-step" disabled={disabled || value >= size} onClick={() => set(value + 1)} aria-label="One lower down the list">+</button>
      </div>
      <p className="pk-hint">1 is the top · {size.toLocaleString("en-US")} is the bottom</p>
    </div>
  );
}

const SUGGEST_MAX = 8;

/**
 * "Who's #N?": a name field with suggestions from the list's names (matched loosely), names already claimed this
 * question greyed out. Anything can be sent; a name that is not on the list scores 0.
 */
export function NamePicker({ choices, taken, text, onText, onPick, disabled, error }: { choices: string[]; taken: string[]; text: string; onText: (t: string) => void; onPick: (name: string) => void; disabled?: boolean; error?: string | null }) {
  const takenKeys = useMemo(() => new Set(taken.map(normName)), [taken]);
  const key = normName(text);
  const hits = key ? choices.filter((c) => normName(c).includes(key)).sort((a, b) => Number(!normName(a).startsWith(key)) - Number(!normName(b).startsWith(key))).slice(0, SUGGEST_MAX) : [];
  const exactTaken = !!key && takenKeys.has(key);
  const send = (name: string) => { if (!disabled && name.trim() && !takenKeys.has(normName(name))) onPick(name.trim()); };
  return (
    <div className="pk-names">
      <form className="pk-term" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <span className="in">
          <span aria-hidden>&gt;</span>
          <input value={text} onChange={(e) => onText(e.target.value)} disabled={disabled} placeholder="Type a name" aria-label="Type a name"
            autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} enterKeyHint="go" maxLength={60} />
        </span>
        <button type="submit" className="pk-lock" disabled={disabled || !text.trim() || exactTaken}>Lock</button>
      </form>
      {error && <p className="pk-error" role="alert">{error}</p>}
      {exactTaken && !error && <p className="pk-error" role="status">Taken, pick another</p>}
      {hits.length > 0 && (
        <ul className="pk-suggest" aria-label="Names on the list">
          {hits.map((c) => {
            const gone = takenKeys.has(normName(c));
            return (
              <li key={c}>
                <button type="button" className={gone ? "taken" : ""} disabled={disabled || gone} onClick={() => send(c)}>
                  <span className="n">{c}</span>{gone && <span className="t">Taken</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** What one player said, as text: "#12", a name, or "No answer". */
export const guessText = (sc: PeckScore | undefined) => (!sc ? "No answer" : sc.guess != null ? `#${sc.guess}` : sc.name ? sc.name : "No answer");

/** The answer: the true rank (or who is there) with its value, then everyone's guess and points, then the source. */
export function PeckReveal({ q, scores, players, me }: { q: PeckQ; scores: Record<string, PeckScore>; players: string[]; me?: string | null }) {
  const meta = peckMeta(q.list);
  const a = q.answer;
  if (!a) return null;
  const rows = players.map((p, seat) => ({ p, seat, sc: has(scores, p) ? scores[p] : undefined }))
    .sort((x, y) => (y.sc?.points ?? 0) + (y.sc?.bonus ? CLOSEST_BONUS : 0) - ((x.sc?.points ?? 0) + (x.sc?.bonus ? CLOSEST_BONUS : 0)) || x.seat - y.seat);
  return (
    <section className="pk-reveal" aria-label="Answer">
      <p className="pk-truth" role="status">
        {q.kind === "rank" ? <><b>{q.item}</b> is <em>{spanText(a.span)}</em></> : <><em>#{q.at}</em> is <b>{a.names.join(" / ")}</b></>}
      </p>
      <p className="pk-value">{q.stat}: {formatValue(a.value, meta)}</p>
      <ol className="pk-guesses" aria-label="Guesses">
        {rows.map(({ p, seat, sc }) => (
          <li key={p} className={p === me ? "me" : ""}>
            <Sprite sprite={playerSprite(seat)} size={18} />
            <span className="who">{p}</span>
            <span className="g">{guessText(sc)}{sc?.span && q.kind === "name" ? ` (${spanText(sc.span)})` : ""}</span>
            <span className="pts">{sc?.points ?? 0}</span>
            {sc?.bonus && <span className="bonus">+{CLOSEST_BONUS} closest</span>}
          </li>
        ))}
      </ol>
      {meta && <p className="pk-source">{meta.source} · as of {meta.asOf}</p>}
    </section>
  );
}

const TV_MARKS = 5;
/** Ladder percent within which two sprites would overlap. */
const NEAR = 4;

/**
 * The big screen's ladder, 1 at the top to the list's size at the bottom. While a question is asked it shows only who
 * has locked in. At the reveal each player's sprite jumps to their guess, then the true span lights up.
 */
export function TvLadder({ q, players, answers, scores, gone = [] }: { q: PeckQ; players: string[]; answers: PeckView["answers"]; scores?: Record<string, PeckScore>; gone?: string[] }) {
  const pos = (rank: number) => (q.size <= 1 ? 0 : ((rank - 1) / (q.size - 1)) * 100);
  const marks = Array.from(new Set([1, ...Array.from({ length: TV_MARKS - 1 }, (_, i) => Math.round(1 + ((i + 1) * (q.size - 1)) / TV_MARKS)), q.size]));
  const span = scores && q.answer ? q.answer.span : null;
  const rankOf = (sc?: PeckScore) => (sc?.guess != null ? sc.guess : sc?.span ? sc.span[0] : null);
  const off = scores ? players.filter((p) => rankOf(scores[p]) == null) : [];
  return (
    <section className="pk-tv" aria-label="The ladder">
      <div className="pk-pole" aria-hidden>
        {marks.map((m) => <span key={m} className="mark" style={{ top: `${pos(m)}%` }}>#{m}</span>)}
        {span && <span className="truth" style={{ top: `${pos(span[0])}%`, height: `max(10px, ${pos(span[1]) - pos(span[0])}%)` }} />}
        {scores && players.map((p, seat) => {
          const r = rankOf(scores[p]);
          if (r == null) return null;
          // Guesses that land close together sit side by side instead of on top of each other.
          const near = players.slice(0, seat).filter((o) => { const x = rankOf(scores[o]); return x != null && Math.abs(pos(x) - pos(r)) < NEAR; }).length;
          return (
            <span key={p} className="peep" style={{ top: `${pos(r)}%`, marginLeft: near * 110, ["--d" as string]: `${seat * 60}ms` }}>
              <Sprite sprite={playerSprite(seat)} size={22} /><i>{p}</i>
            </span>
          );
        })}
      </div>
      {!scores ? (
        <ul className="pk-locks" aria-label={`${players.filter((p) => has(answers, p)).length} of ${players.length} locked in`}>
          {players.map((p, seat) => (
            <li key={p} className={`${has(answers, p) ? "in" : ""} ${gone.includes(p) ? "is-gone" : ""}`}>
              <Sprite sprite={playerSprite(seat)} size={22} /><span className="n">{p}</span><span className="s">{has(answers, p) ? "Locked" : gone.includes(p) ? "Left" : "Thinking"}</span>
            </li>
          ))}
        </ul>
      ) : off.length > 0 && <p className="pk-off">Off the ladder: {off.map((p) => `${p} (${guessText(scores[p])})`).join(", ")}</p>}
    </section>
  );
}
