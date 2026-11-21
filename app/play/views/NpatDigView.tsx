"use client";

// NPAT "Dig" in a room: one letter, five categories asked one at a time. Phones answer each in 20 seconds and see
// their gem once it is judged; the screen shows the reel, who has locked in, every player's gem, and everyone digging
// side by side. Room screens never load the answer lists (see npat/boundary.test): this file reads only what the
// server sends.
import { useEffect, useRef, useState } from "react";
import { PixelButton, PixelShell } from "../../components/pixel/PixelUI";
import { useSound } from "../../components/SoundProvider";
import DigScene from "../../npat/dig/DigScene";
import GemIcon from "../../npat/dig/GemIcon";
import GemTray from "../../npat/dig/GemTray";
import SlotReel from "../../npat/dig/SlotReel";
import type { DigAnswer, DigView } from "../../topicDraft/formats/npatDig";
import { categoryOf } from "../../topicDraft/npat/categories";
import { ANSWER_MAX, DIG_ANSWER_MS, depthOf, GEMS, TIER_NAMES, type Tier } from "../../topicDraft/npat/rules";
import { own } from "../../topicDraft/party/own";
import { teamName } from "../teamMoves";
import type { GameCtl } from "../useGame";
import type { GameSetup } from "../types";
import { catTitle, ListSources } from "./npatParts";
import { digRanked, zoneName } from "./npatDigBoard";
import { makeSaver, type Saver } from "./npatSaver";
import { canMoveOn, DrinkCard, LeaveGame, PartyActions, PartyClock, WaterLine } from "./partyBits";

type Dispatch = GameCtl["dispatch"];
type Play = ReturnType<typeof useSound>["play"];

const NOT_SENT = "Not saved, try again";
/** Seconds left at which the nudge shows. */
const NUDGE_S = 5;

const gemsOf = (list: DigAnswer[] | undefined): Tier[] => (list ?? []).flatMap((a) => (a.tier ? [a.tier] : []));
const lanesOf = (s: DigView) => s.players.map((name) => ({ name, depth: depthOf(own(s.points, name) ?? 0) }));

export function NpatDigView({ ctl }: { setup: GameSetup; ctl: GameCtl }) {
  const { play } = useSound();
  const s = ctl.state as unknown as DigView;
  const me = ctl.me ?? "";
  const gone = ctl.gone ?? [];
  const seated = s.players.includes(me);
  const out = gone.includes(me);
  const tv = !seated;
  const category = s.categories[s.cat] ?? "";
  const mine = seated ? own(s.results, me)?.[s.cat] : undefined;
  const verdict = s.phase === "verdict";

  const seen = useRef({ phase: s.phase, cat: s.cat });
  useEffect(() => {
    const was = seen.current;
    seen.current = { phase: s.phase, cat: s.cat };
    if (s.phase === "ask" && (was.phase !== "ask" || was.cat !== s.cat)) play("pick");
    if (s.phase === "verdict" && (was.phase !== "verdict" || was.cat !== s.cat)) play(seated && mine ? (mine.points > 0 ? "win" : "wrong") : "reveal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.phase, s.cat]);
  useEffect(() => { window.scrollTo(0, 0); }, [s.phase, s.cat]);

  const myPoints = own(s.points, me) ?? 0;
  const lanes = lanesOf(s);

  return (
    <PixelShell world="notebook">
      <div className={`party-page np-page ${tv ? "tv" : ""}`}>
        <header className="np-head">
          <span className="stat"><em>Letter</em><b>{s.phase === "reel" ? "?" : s.letter}</b></span>
          <span className="stat"><em>Category</em><b>{Math.min(s.cat + 1, s.categories.length)}<small>/{s.categories.length}</small></b></span>
          {seated && <span className="stat"><em>Depth</em><b>{depthOf(myPoints).toLocaleString("en-US")}<small> m</small></b></span>}
          {s.phase === "ask" && <PartyClock deadline={s.phaseAt + DIG_ANSWER_MS} offset={ctl.offset} total={DIG_ANSWER_MS} />}
        </header>

        {tv
          ? <DigScene depth={0} digging={verdict} gems={[]} found={null} lanes={lanes} />
          : <DigScene depth={depthOf(myPoints)} digging={verdict && !!mine?.tier} gems={gemsOf(own(s.results, me))} found={verdict && mine?.tier ? mine.tier : null} compact />}

        {s.phase === "reel" && (
          <section className="px-box np-card np-winner" aria-label="Drawing the letter">
            <div style={tv ? { transform: "scale(1.6)", transformOrigin: "center", margin: "24px 0" } : undefined}><SlotReel letter={s.letter} spinning /></div>
            <p className="np-msg" role="status">Drawing the letter…</p>
            <p className="np-msg">{s.categories.map(catTitle).join(", ")}</p>
          </section>
        )}

        {s.phase === "ask" && (tv || out
          ? <TvAsk s={s} out={out} />
          : <AskDesk key={`${s.startedAt}.${s.cat}`} s={s} me={me} offset={ctl.offset} dispatch={ctl.dispatch} play={play} />)}

        {s.phase === "judge" && (
          <section className="px-box np-card np-winner" aria-label="Judging">
            <p className="np-eyebrow">{catTitle(category)} · {s.letter}</p>
            <h2 className="np-title" role="status">Judging…</h2>
            <p className="np-msg">Checking the answers that aren&apos;t on our lists.</p>
          </section>
        )}

        {verdict && seated && mine && <MyGem a={mine} letter={s.letter} category={category} />}
        {verdict && <GemList s={s} me={me} big={tv} />}
        {verdict && <ListSources categories={[category]} />}

        {s.phase === "summary" && <Depths s={s} me={me} />}

        {s.phase !== "ask" && canMoveOn(ctl) && (
          <PixelButton variant="alt" className="np-skip" onClick={() => ctl.dispatch({ type: "next", by: me })}>
            {s.phase === "reel" ? "Start >" : s.phase === "judge" ? "Skip the check >" : s.phase === "summary" ? "Final depths >" : s.cat + 1 < s.categories.length ? "Next category >" : "Final depths >"}
          </PixelButton>
        )}

        {s.drinks && <WaterLine />}
        {/* Sips are poured at a verdict: a card never covers the answering. */}
        {s.drinks && s.phase !== "ask" && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
        {seated && ctl.leave && <LeaveGame onLeave={ctl.leave} />}
      </div>
    </PixelShell>
  );
}

/** The screen (or a seat that left) while answering: the category, and who has locked in. Never anyone's words. */
function TvAsk({ s, out }: { s: DigView; out: boolean }) {
  const category = s.categories[s.cat] ?? "";
  return (
    <section className="px-box np-card np-tv" aria-label="Answering">
      <p className="np-eyebrow">Category {s.cat + 1} of {s.categories.length}</p>
      <h2 className="np-title">{catTitle(category)} starting with {s.letter}</h2>
      <p className="np-msg">{out ? "You left the table. Watching." : `${categoryOf(category)?.blurb ?? ""}. Skip your first thought.`}</p>
      <ul className="np-groups" aria-label="Locked in">
        {s.players.map((p) => (
          <li key={p} className={s.locked.includes(p) ? "k-ok" : "k-blank"}>
            <div className="top"><span className="txt">{p}</span><span className="np-badge">{s.locked.includes(p) ? "Locked in" : "Thinking"}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A player's answer for the open category: saved a moment after typing stops (each save replaces the last), sent the
 * moment the clock runs out (the server takes it half a second past the deadline), and locked in with Lock in.
 */
function AskDesk({ s, me, offset, dispatch, play }: { s: DigView; me: string; offset: number; dispatch: Dispatch; play: Play }) {
  const category = s.categories[s.cat] ?? "";
  const [text, setText] = useState(() => own(s.typed, me) ?? "");
  const textRef = useRef(text);
  const sent = useRef(text);
  const inflight = useRef<Promise<boolean> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const locked = s.locked.includes(me);
  const deadline = s.phaseAt + DIG_ANSWER_MS;
  const [now, setNow] = useState(() => Date.now() + offset);
  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  const expired = now >= deadline;
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  useEffect(() => { input.current?.focus(); }, []);

  const send = (): Promise<boolean> | null => {
    const t = textRef.current;
    if (t === sent.current) return inflight.current;
    const before = sent.current;
    sent.current = t;
    const p: Promise<boolean> = Promise.resolve(dispatch({ type: "answer", by: me, text: t })).then((r) => {
      if (inflight.current === p) inflight.current = null;
      if (r && !r.ok) {
        if (sent.current === t) sent.current = before;
        setError(r.error && r.error !== "Not allowed right now" ? r.error : NOT_SENT);
        return false;
      }
      setError(null);
      return true;
    });
    inflight.current = p;
    return p;
  };
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; });
  const saver = useRef<Saver | null>(null);
  useEffect(() => {
    const sv = makeSaver(1, () => sendRef.current());
    saver.current = sv;
    return () => { sv.stop(); saver.current = null; };
  }, []);
  const flush = () => saver.current?.flush() ?? Promise.resolve(true);

  // The last typing goes when the clock runs out; re-armed when the clock offset is corrected.
  useEffect(() => {
    const t = setTimeout(() => { void saver.current?.flush(); }, Math.max(0, deadline - (Date.now() + offset)));
    return () => clearTimeout(t);
  }, [deadline, offset]);

  const lockIn = async () => {
    if (locked || locking || expired) return;
    setLocking(true);
    play("click");
    try {
      if (!(await flush())) return;
      const r = await dispatch({ type: "lock", by: me });
      if (r && !r.ok) setError(NOT_SENT);
    } finally { setLocking(false); }
  };

  const open = !locked && !expired;
  return (
    <section className="px-box np-card" aria-label="Your answer">
      <p className="np-eyebrow">Category {s.cat + 1} of {s.categories.length}</p>
      <h2 className="np-title">{catTitle(category)}</h2>
      <p className="np-msg">{categoryOf(category)?.blurb}. Starts with <b>{s.letter}</b>.</p>
      <form className="np-fields" onSubmit={(e) => { e.preventDefault(); void lockIn(); }} autoComplete="off">
        <label className="np-field">
          <span className="lbl">{catTitle(category)} starting with {s.letter}</span>
          <input
            ref={input} value={text} maxLength={ANSWER_MAX} disabled={!open}
            onChange={(e) => { textRef.current = e.target.value; setText(e.target.value); saver.current?.changed(0); }}
            placeholder={`${s.letter}…`} autoComplete="off" autoCorrect="off" autoCapitalize="words" spellCheck={false} enterKeyHint="done" />
        </label>
        <p className={`np-msg ${error ? "no" : ""}`} role="status">
          {error ?? (locked ? "Locked in. Waiting for the others." : expired ? "Time!" : left <= NUDGE_S ? "Lock in a safe answer." : "Skip your first thought.")}
          {open && <span> {left} s</span>}
        </p>
        {!locked && <PixelButton type="submit" variant="gold" className="np-done" disabled={!open || locking}>Lock in</PixelButton>}
      </form>
    </section>
  );
}

function missNote(a: DigAnswer, letter: string): string | null {
  return a.status === "wrong-letter" ? `Doesn't start with ${letter}.`
    : a.status === "blank" ? "No answer."
    : a.status === "ai-no" ? (a.reason ? `Not accepted: ${a.reason}` : "Not accepted.")
    : null;
}

/** This seat's gem and points for the category just judged. */
function MyGem({ a, letter, category }: { a: DigAnswer; letter: string; category: string }) {
  const note = missNote(a, letter);
  return (
    <section className="px-box np-card np-winner" aria-label="Your gem" role="status">
      <p className="np-eyebrow">{catTitle(category)}</p>
      <h2 className="np-title">{a.tier ? `${GEMS[a.tier].name}!` : "No gem"}</h2>
      {a.tier && <p className="np-msg"><GemIcon tier={a.tier} size={20} /> <b>{TIER_NAMES[a.tier]}</b> · +{a.points} points{a.shared ? " (shared)" : ""}</p>}
      {a.text && <p className="np-msg">You said <b>{a.text}</b>{a.entry && a.entry !== a.text ? <> · counted as <b>{a.entry}</b></> : null}</p>}
      {a.status === "ai-ok" && <p className="np-msg">{a.reason === "unchecked" ? "Not on our list. Accepted for now and saved for review." : "Not on our list. Checked and accepted."}</p>}
      {note && <p className="np-msg">{note}</p>}
    </section>
  );
}

/** Every player's answer to the category just judged: gem, the name it counted as, and points. */
function GemList({ s, me, big }: { s: DigView; me: string; big: boolean }) {
  const rows = s.players.map((p) => ({ p, a: own(s.results, p)?.[s.cat] })).sort((x, y) => (y.a?.points ?? 0) - (x.a?.points ?? 0));
  return (
    <section className="px-box np-card" aria-label="Everyone's gems">
      {!big && <h3 className="np-sub">Everyone</h3>}
      <ul className="np-groups">
        {rows.map(({ p, a }) => (
          <li key={p} className={a?.tier ? "k-ok" : a?.status === "blank" || !a ? "k-blank" : "k-voted-out"}>
            <p className="as">{p}{p === me ? " (you)" : ""}</p>
            <div className="top">
              <span className="txt">{a ? a.entry ?? (a.text || "—") : "—"}</span>
              {a?.tier
                ? <span className={`np-badge t-${a.tier}`}><GemIcon tier={a.tier} size={big ? 18 : 14} /> {GEMS[a.tier].name} <b>+{a.points}</b>{a.shared ? " shared" : ""}</span>
                : <span className="np-badge miss">{a?.status === "wrong-letter" ? "wrong letter" : a?.status === "ai-no" ? "not accepted" : "no gem"}</span>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The dig's end: everyone's depth, deepest first, with the zone each reached. */
function Depths({ s, me, label = "Final depths" }: { s: DigView; me: string | null; label?: string }) {
  const rows = digRanked(s);
  return (
    <section className="px-box np-card" aria-label={label}>
      <h3 className="np-sub">{label}</h3>
      <ol className="np-groups">
        {rows.map((r) => (
          <li key={r.name} className={r.points > 0 ? "k-ok" : "k-blank"}>
            <p className="as">#{r.place} · {r.name}{r.name === me ? " (you)" : ""}</p>
            <div className="top"><span className="txt">{r.depth.toLocaleString("en-US")} m · {r.zone}</span><span className="np-badge"><b>{r.points}</b> pts</span></div>
            <GemTray results={own(s.results, r.name) ?? []} total={s.categories.length} />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Game over: who dug deepest, every shaft side by side, and everyone's gems. */
export function NpatDigResults({ ctl, onAgain, onRematch }: { setup: GameSetup; ctl: GameCtl; onAgain?: () => void; onRematch?: () => void }) {
  const s = ctl.state as unknown as DigView;
  const rows = digRanked(s);
  const top = rows[0]?.points ?? 0;
  let headline: string, sub = "";
  if (s.teams) {
    const best = Math.max(...s.teamPoints);
    const lead = s.teamPoints.map((n, i) => (n === best ? i : -1)).filter((i) => i >= 0);
    headline = best <= 0 ? "Nobody struck a gem" : lead.length === 1 ? `${teamName(lead[0]!)} team wins!` : "It's a tie!";
    if (best > 0) sub = lead.length === 1 ? `${best.toLocaleString("en-US")} points` : lead.map((i) => `${teamName(i)} team`).join(" and ");
  } else {
    const won = rows.filter((r) => r.points === top);
    headline = top <= 0 ? "Nobody struck a gem" : won.length === 1 ? `${won[0]!.name} digs deepest!` : "It's a tie!";
    if (top > 0) sub = `${depthOf(top).toLocaleString("en-US")} m · reached ${zoneName(depthOf(top))}${won.length > 1 ? ` · ${won.map((r) => r.name).join(" and ")}` : ""}`;
  }
  const win = top > 0 && !headline.includes("tie");
  return (
    <PixelShell world="notebook">
      <div className="party-page np-page">
        <DigScene depth={0} digging={false} gems={[]} found={null} lanes={lanesOf(s)} />
        <section className={`px-box np-card np-winner ${win ? "px-confetti" : ""}`}>
          <p className="np-eyebrow">Name Place Animal Thing · letter {s.letter}</p>
          <h2 role="status">{headline}</h2>
          {sub && <p>{sub}</p>}
        </section>
        <Depths s={s} me={ctl.me} />
        <ListSources categories={s.categories} />
        <PartyActions onAgain={onAgain} onRematch={onRematch} />
        {s.drinks && <WaterLine />}
        {s.drinks && <DrinkCard calls={s.drinks.calls} seq={s.drinks.seq} game={s.startedAt} names={s.players} />}
      </div>
    </PixelShell>
  );
}
